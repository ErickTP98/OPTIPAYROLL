import { describe, expect, it } from "vitest";
import { sampleData } from "../data/seed";
import { buildPayrollWorkbook, workbookFileName } from "./payrollWorkbook";
import { buildXlsx } from "./xlsx";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("exportación a Excel", () => {
  it("genera un ZIP con libro, estilos y una hoja por sección", () => {
    const bytes = buildPayrollWorkbook(sampleData());
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const s = text(bytes);
    for (const sheet of ["Trabajadores", "Puestos", "Conceptos de nómina", "Beneficios y aportes", "Montos por año", "Incrementos", "Presupuesto 2026"]) {
      expect(s).toContain(`name="${sheet}"`);
    }
    // Datos del trabajador, puesto y conceptos por año (sin compresión, el texto es legible).
    expect(s).toContain("María");
    expect(s).toContain("Gerente General");
    expect(s).toContain("<v>18000</v>");
    expect(s).toContain("<v>18500</v>");
    expect(s).toContain("SUELDO_BASICO * TARGET / 12");
  });

  it("escapa caracteres especiales y normaliza nombres de hoja", () => {
    const s = text(buildXlsx([
      { name: "A/B:C*D?[x]", rows: [["Nombre"], ['<Tom & "Jerry">']] },
      { name: "a/b:c*d?[x]", rows: [["x"]] },
    ]));
    expect(s).toContain("&lt;Tom &amp; &quot;Jerry&quot;&gt;");
    expect(s).toContain('name="A B C D  x"');
    expect(s).toContain('name="a b c d  x 2"');
  });

  it("arma el nombre del archivo con la empresa y el año", () => {
    expect(workbookFileName(sampleData())).toBe("optipayroll-Mi-Empresa-S-A-C-2026.xlsx");
  });
});
