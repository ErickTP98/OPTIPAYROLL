import { describe, expect, it } from "vitest";
import type { Concept, Employee, PayrollData, Rule } from "../types";
import { emptyData, sampleData } from "../data/seed";
import { allMonths, onlyMonths } from "../utils";
import { calculateBudget, groupBudgets, linesSummary } from "./calculate";

function employee(over: Partial<Employee> = {}): Employee {
  return {
    id: "e1", code: "E1", isVacancy: false, firstName: "A", lastName: "B", docType: "", docNumber: "",
    birthDate: "", gender: "", email: "", phone: "", address: "", hireDate: "", contractType: "",
    positionId: "p1", months: allMonths(), custom: {}, concepts: [], ...over,
  };
}
function concept(over: Partial<Concept> & { id: string; code: string }): Concept {
  return { name: over.code, type: "remunerativo", months: allMonths(), appliesIncrease: true, affects: [], ...over };
}
function rule(over: Partial<Rule> & { id: string; code: string }): Rule {
  return {
    name: over.code, kind: "aporte", method: "porcentaje", rate: 0, formula: "", baseMode: "mes",
    months: allMonths(), baseMin: 0, baseMax: 0, includeRules: [], ...over,
  };
}
function data(over: Partial<PayrollData>): PayrollData {
  return {
    ...emptyData(),
    positions: [{ id: "p1", code: "P1", name: "Puesto", area: "Ventas", costCenter: "", category: "", notes: "", concepts: [] }],
    ...over,
  };
}

const lineOf = (d: PayrollData, id: string, emp = 0) =>
  calculateBudget(d).employees[emp].lines.find((l) => l.id === id);

describe("calculateBudget", () => {
  it("solo incluye en la base los conceptos con indicador de afectación", () => {
    const d = data({
      concepts: [
        concept({ id: "s", code: "SUELDO", affects: ["ess"] }),
        concept({ id: "m", code: "MOV", affects: [] }),
      ],
      rules: [rule({ id: "ess", code: "ESSALUD", rate: 9 })],
      employees: [employee({ concepts: [{ conceptId: "s", amount: 1000 }, { conceptId: "m", amount: 500 }] })],
    });
    const r = calculateBudget(d).employees[0];
    expect(r.bases.ess[0]).toBe(1000);
    expect(lineOf(d, "ess")!.months[0]).toBe(90);
    expect(r.totals.concepto[0]).toBe(1500);
    expect(r.totals.aporte[0]).toBe(90);
    expect(r.grandTotal).toBe((1500 + 90) * 12);
  });

  it("respeta los meses laborados y los meses de pago del concepto", () => {
    const d = data({
      concepts: [
        concept({ id: "s", code: "SUELDO", affects: ["ess"] }),
        concept({ id: "b", code: "BONO", months: onlyMonths(2, 8), affects: ["ess"] }),
      ],
      rules: [rule({ id: "ess", code: "ESSALUD", rate: 10 })],
      employees: [employee({ months: onlyMonths(0, 1, 2, 3), concepts: [{ conceptId: "s", amount: 100 }, { conceptId: "b", amount: 50 }] })],
    });
    const r = calculateBudget(d).employees[0];
    expect(lineOf(d, "s")!.months).toEqual([100, 100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(lineOf(d, "b")!.months.filter((v) => v > 0)).toEqual([50]); // septiembre no laborado
    expect(lineOf(d, "ess")!.months.slice(0, 5)).toEqual([10, 10, 15, 10, 0]);
    expect(r.grandTotal).toBe(450 + 45);
  });

  it("aplica incrementos compuestos según alcance y concepto", () => {
    const d = data({
      concepts: [
        concept({ id: "s", code: "SUELDO" }),
        concept({ id: "a", code: "ASIG", appliesIncrease: false }),
      ],
      increases: [
        { id: "i1", name: "General", month: 3, percent: 10, scope: "todos", targets: [], conceptIds: [] },
        { id: "i2", name: "Ventas", month: 6, percent: 10, scope: "area", targets: ["Ventas"], conceptIds: [] },
        { id: "i3", name: "Otra área", month: 0, percent: 50, scope: "area", targets: ["Finanzas"], conceptIds: [] },
        { id: "i4", name: "Solo asig", month: 9, percent: 20, scope: "trabajador", targets: ["e1"], conceptIds: ["a"] },
      ],
      employees: [employee({ concepts: [{ conceptId: "s", amount: 1000 }, { conceptId: "a", amount: 100 }] })],
    });
    const s = lineOf(d, "s")!.months;
    expect(s[0]).toBe(1000);
    expect(s[3]).toBe(1100);
    expect(s[6]).toBe(1210);
    expect(s[11]).toBe(1210);
    const a = lineOf(d, "a")!.months;
    expect(a[8]).toBe(100);
    expect(a[9]).toBe(120);
  });

  it("aplica base mínima y tope", () => {
    const d = data({
      concepts: [concept({ id: "s", code: "SUELDO", affects: ["min", "max"] })],
      rules: [
        rule({ id: "min", code: "R_MIN", rate: 10, baseMin: 1000 }),
        rule({ id: "max", code: "R_MAX", rate: 10, baseMax: 300 }),
      ],
      employees: [employee({ months: onlyMonths(0), concepts: [{ conceptId: "s", amount: 500 }] })],
    });
    expect(lineOf(d, "min")!.months.slice(0, 2)).toEqual([100, 0]);
    expect(lineOf(d, "max")!.months[0]).toBe(30);
  });

  it("evalúa fórmulas con dependencias entre reglas y reglas incluidas en la base", () => {
    const d = data({
      concepts: [concept({ id: "s", code: "SUELDO", affects: ["cts", "grati"] })],
      rules: [
        // Declarada antes que su dependencia para comprobar el orden topológico.
        rule({ id: "cts", code: "CTS", kind: "beneficio", method: "formula", formula: "(BASE + GRATIF) / 12" }),
        rule({ id: "bonif", code: "BONIF", kind: "beneficio", rate: 9, includeRules: ["grati"] }),
        rule({ id: "grati", code: "GRATIF", kind: "beneficio", method: "formula", formula: "BASE / 6" }),
      ],
      employees: [employee({ concepts: [{ conceptId: "s", amount: 1200 }] })],
    });
    const res = calculateBudget(d);
    expect(res.errors).toEqual([]);
    expect(lineOf(d, "grati")!.months[0]).toBe(200);
    expect(lineOf(d, "cts")!.months[0]).toBe(116.67);
    expect(lineOf(d, "bonif")!.months[0]).toBe(18);
  });

  it("acumula o promedia la base en reglas que se pagan en meses específicos", () => {
    const d = data({
      concepts: [concept({ id: "s", code: "SUELDO", affects: ["acc", "avg"] })],
      rules: [
        rule({ id: "acc", code: "ACC", rate: 10, baseMode: "acumulado", months: onlyMonths(5, 11) }),
        rule({ id: "avg", code: "AVG", rate: 100, baseMode: "promedio", months: onlyMonths(6, 11) }),
      ],
      increases: [{ id: "i", name: "Inc", month: 6, percent: 50, scope: "todos", targets: [], conceptIds: [] }],
      employees: [employee({ months: onlyMonths(2, 3, 4, 5, 6, 7, 8, 9, 10, 11), concepts: [{ conceptId: "s", amount: 1000 }] })],
    });
    const acc = lineOf(d, "acc")!.months;
    expect(acc[5]).toBe(400); // marzo-junio: 4 × 1000 × 10%
    expect(acc[11]).toBe(900); // julio-diciembre: 6 × 1500 × 10%
    const avg = lineOf(d, "avg")!.months;
    expect(avg[6]).toBe(1100); // (4 × 1000 + 1500) / 5
    expect(avg[11]).toBe(1500);
  });

  it("informa fórmulas inválidas y dependencias circulares sin romper el cálculo", () => {
    const d = data({
      concepts: [concept({ id: "s", code: "SUELDO", affects: ["a", "b", "c", "ok"] })],
      rules: [
        rule({ id: "a", code: "A", method: "formula", formula: "B + 1" }),
        rule({ id: "b", code: "B", method: "formula", formula: "A + 1" }),
        rule({ id: "c", code: "C", method: "formula", formula: "BASE * DESCONOCIDA" }),
        rule({ id: "ok", code: "OK", rate: 10 }),
      ],
      employees: [employee({ concepts: [{ conceptId: "s", amount: 100 }] })],
    });
    const res = calculateBudget(d);
    expect(res.errors.some((e) => e.includes("circular"))).toBe(true);
    expect(res.errors.some((e) => e.includes("DESCONOCIDA"))).toBe(true);
    expect(res.employees[0].grandTotal).toBe(1200 + 120);
  });

  it("calcula el ejemplo incluido y agrupa por puesto", () => {
    const d = sampleData();
    const res = calculateBudget(d);
    expect(res.errors).toEqual([]);
    const gg = res.employees.find((e) => e.employee.id === "emp-1")!;
    // Sueldo 12000 hasta marzo y 12600 desde abril (+5%).
    expect(gg.lines.find((l) => l.id === "c-sueldo")!.months[3]).toBe(12600);
    // EsSalud de marzo incluye el bono anual: (12000 + 113 + 6000) × 9%.
    expect(gg.lines.find((l) => l.id === "r-essalud")!.months[2]).toBe(1630.17);
    const byPos = groupBudgets(res.employees, (b) => ({ key: b.employee.positionId, label: b.position?.name ?? "" }));
    expect(byPos.find((g) => g.key === "pos-op")!.headcount).toBe(2);
    const total = res.employees.reduce((s, e) => s + e.grandTotal, 0);
    const lines = linesSummary(res.employees).reduce((s, l) => s + l.total, 0);
    expect(lines).toBeCloseTo(total, 2);
  });
});
