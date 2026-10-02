import { describe, expect, it } from "vitest";
import { sampleData } from "../data/seed";
import { buildPayrollWorkbook } from "../export/payrollWorkbook";
import { calculateBudget } from "../engine/calculate";
import { cellDate, cellNumber, parseMonths, planImport } from "./payrollImport";
import { readCsv, readXlsx } from "./readers";
import { buildImportTemplate } from "./template";

const months = (...idx: number[]) => Array.from({ length: 12 }, (_, i) => idx.includes(i));

describe("formatos de celdas", () => {
  it("interpreta números en distintos formatos", () => {
    expect(cellNumber(3500)).toBe(3500);
    expect(cellNumber("3500")).toBe(3500);
    expect(cellNumber("S/ 18,500.50")).toBe(18500.5);
    expect(cellNumber("18.500,50")).toBe(18500.5);
    expect(cellNumber("3,500")).toBe(3500);
    expect(cellNumber("0,53")).toBe(0.53);
    expect(cellNumber("abc")).toBeNull();
  });

  it("interpreta fechas", () => {
    expect(cellDate(31149)).toBe("1985-04-12");
    expect(cellDate("12/04/1985")).toBe("1985-04-12");
    expect(cellDate("1985-4-2")).toBe("1985-04-02");
  });

  it("interpreta meses", () => {
    expect(parseMonths("Todo el año")).toEqual(months(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11));
    expect(parseMonths("No labora")).toEqual(months());
    expect(parseMonths("Ene, Feb, Mar")).toEqual(months(0, 1, 2));
    expect(parseMonths("Ene-Jun")).toEqual(months(0, 1, 2, 3, 4, 5));
    expect(parseMonths("abril a junio")).toEqual(months(3, 4, 5));
    expect(parseMonths("1-3; 12")).toEqual(months(0, 1, 2, 11));
    expect(parseMonths("Mayo y Septiembre")).toEqual(months(4, 8));
    expect(parseMonths("cualquier cosa")).toBeNull();
  });
});

describe("importación", () => {
  it("reconstruye puestos, trabajadores y montos por año desde el Excel exportado", async () => {
    const original = sampleData();
    const sheets = await readXlsx(buildPayrollWorkbook(original));
    const empty = { ...original, positions: [], employees: [], increases: [] };
    const plan = planImport(empty, sheets, "trabajadores");

    expect(plan.positions.created).toBe(3);
    expect(plan.employees.created).toBe(4);
    expect(plan.warnings.filter((w) => !w.includes("no reconocidas"))).toEqual([]);
    const t001 = plan.data.employees.find((e) => e.code === "T001")!;
    expect(t001.firstName).toBe("María");
    expect(t001.birthDate).toBe("1985-04-12");
    expect(t001.custom["cf-banco"]).toBe("BCP");
    expect(plan.data.positions.find((p) => p.id === t001.positionId)!.code).toBe("GG01");
    expect(t001.years["2026"].concepts.find((c) => c.conceptId === "c-sueldo")!.amount).toBe(18000);
    expect(t001.years["2027"].concepts.find((c) => c.conceptId === "c-sueldo")!.amount).toBe(18500);
    // «No labora» en 2027: el año queda sin meses ni montos.
    expect(plan.data.employees.find((e) => e.code === "T003")!.years["2027"]?.months.some(Boolean) ?? false).toBe(false);
    expect(plan.data.employees.find((e) => e.code === "V001")!.isVacancy).toBe(true);

    // Mismo presupuesto (sin incrementos en ambos lados).
    const reference = { ...original, increases: [] };
    for (const year of [2026, 2027]) {
      const a = calculateBudget(reference, year).employees.reduce((s, b) => s + b.grandTotal, 0);
      const b = calculateBudget(plan.data, year).employees.reduce((s, x) => s + x.grandTotal, 0);
      expect(b).toBeCloseTo(a, 2);
    }
  });

  it("actualiza por código solo las celdas con valor y no modifica los datos originales", () => {
    const data = sampleData();
    const csv = "Código;Correo;Teléfono;SUELDO;Año\nT002;nuevo@correo.com;;3900;2027\n";
    const plan = planImport(data, [{ name: "Hoja1", rows: readCsv(csv) }], "trabajadores");
    const t002 = plan.data.employees.find((e) => e.code === "T002")!;
    expect(plan.employees.updated).toBe(1);
    expect(t002.email).toBe("nuevo@correo.com");
    expect(t002.phone).toBe("912345678");
    expect(t002.years["2027"].concepts.find((c) => c.conceptId === "c-sueldo")!.amount).toBe(3900);
    expect(t002.years["2027"].concepts.find((c) => c.conceptId === "c-movilidad")!.amount).toBe(200);
    expect(data.employees.find((e) => e.code === "T002")!.email).toBe("jfernandez@miempresa.com");
  });

  it("crea trabajadores desde CSV y reporta errores por fila", () => {
    const csv = [
      "Código,Nombres,Apellidos,Sexo,Fecha de ingreso,Código de puesto,Meses que labora 2028,SUELDO,Año,Banco",
      'T010,Ana,"Torres, Ruiz",Femenino,01/03/2026,AN01,Mar-Dic,"4,200.00",2028,BBVA',
      "T011,,,M,,XX99,,1000,2026,",
      ",Sin,Código,,,,,,,",
    ].join("\n");
    const plan = planImport(sampleData(), [{ name: "Hoja1", rows: readCsv(csv) }], "trabajadores");
    const ana = plan.data.employees.find((e) => e.code === "T010")!;
    expect(ana.lastName).toBe("Torres, Ruiz");
    expect(ana.gender).toBe("F");
    expect(ana.hireDate).toBe("2026-03-01");
    expect(ana.custom["cf-banco"]).toBe("BBVA");
    expect(ana.years["2028"].months).toEqual(months(2, 3, 4, 5, 6, 7, 8, 9, 10, 11));
    expect(ana.years["2028"].concepts).toEqual([{ conceptId: "c-sueldo", amount: 4200 }]);
    expect(plan.yearsAdded).toEqual([2028]);
    expect(plan.data.employees.some((e) => e.code === "T011")).toBe(false);
    expect(plan.warnings.some((w) => w.includes("XX99"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("T011") && w.includes("no tiene nombre"))).toBe(true);
    expect(plan.warnings.some((w) => w.includes("fila 4") && w.includes("falta el código"))).toBe(true);
  });

  it("importa puestos desde CSV con montos referenciales", () => {
    const csv = "Código;Puesto;Área;SUELDO;BONO_STI (TARGET)\nJF01;Jefe de Finanzas;Finanzas;9000;2\nAN01;;;3800;\n";
    const plan = planImport(sampleData(), [{ name: "puestos", rows: readCsv(csv) }], "puestos");
    expect(plan.positions).toEqual({ created: 1, updated: 1 });
    const jf = plan.data.positions.find((p) => p.code === "JF01")!;
    expect(jf.concepts).toEqual([{ conceptId: "c-sueldo", amount: 9000 }, { conceptId: "c-sti", amount: 2 }]);
    const an = plan.data.positions.find((p) => p.code === "AN01")!;
    expect(an.name).toBe("Analista Contable");
    expect(an.concepts.find((c) => c.conceptId === "c-sueldo")!.amount).toBe(3800);
  });

  it("la plantilla vacía se lee sin crear registros", async () => {
    const sheets = await readXlsx(buildImportTemplate(sampleData()));
    expect(sheets.map((s) => s.name)).toEqual(["Instrucciones", "Puestos", "Trabajadores", "Montos por año"]);
    const plan = planImport(sampleData(), sheets, "trabajadores");
    expect(plan.positions.created + plan.employees.created + plan.yearRows).toBe(0);
  });
});
