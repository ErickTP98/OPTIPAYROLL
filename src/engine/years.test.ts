import { describe, expect, it } from "vitest";
import { sampleData } from "../data/seed";
import { normalizeData } from "../store";
import { addBudgetYear, removeBudgetYear } from "./years";

describe("años presupuestados", () => {
  it("agrega un año copiando meses y montos con ajuste, sin tocar los TARGET", () => {
    const d = addBudgetYear(sampleData(), 2028, { from: 2027, adjustPercent: 10, copyIncreases: true });
    expect(d.settings.years).toEqual([2026, 2027, 2028]);
    expect(d.settings.year).toBe(2028);
    const t001 = d.employees.find((e) => e.code === "T001")!.years["2028"];
    expect(t001.concepts.find((c) => c.conceptId === "c-sueldo")!.amount).toBe(20350);
    expect(t001.concepts.find((c) => c.conceptId === "c-sti")!.amount).toBe(3);
    // T003 no tiene datos en 2027: tampoco en 2028.
    expect(d.employees.find((e) => e.code === "T003")!.years["2028"]).toBeUndefined();
    expect(d.increases.filter((i) => i.year === 2028)).toHaveLength(1);
  });

  it("agrega un año vacío y elimina años", () => {
    const d = addBudgetYear(sampleData(), 2030);
    expect(d.employees.every((e) => !e.years["2030"])).toBe(true);
    const r = removeBudgetYear(d, 2030);
    expect(r.settings.years).toEqual([2026, 2027]);
    expect(r.settings.year).toBe(2027);
    expect(removeBudgetYear(removeBudgetYear(r, 2026), 2027).settings.years).toEqual([2027]);
  });

  it("migra datos guardados con la versión de un solo año", () => {
    const legacy = {
      version: 1,
      settings: { companyName: "X", year: 2025, currency: "S/" },
      employees: [{ id: "e", code: "T1", months: new Array(12).fill(true), concepts: [{ conceptId: "c", amount: 100 }] }],
      concepts: [{ id: "c", code: "SUELDO", name: "Sueldo", type: "remunerativo", months: new Array(12).fill(true), appliesIncrease: true, affects: [] }],
      increases: [{ id: "i", name: "Inc", month: 3, percent: 5, scope: "todos", targets: [], conceptIds: [] }],
    };
    const d = normalizeData(legacy);
    expect(d.settings.years).toEqual([2025]);
    expect(d.employees[0].years["2025"].concepts).toEqual([{ conceptId: "c", amount: 100 }]);
    expect("months" in d.employees[0]).toBe(false);
    expect(d.increases[0].year).toBe(2025);
    expect(d.concepts[0].isBaseSalary).toBe(true);
  });
});
