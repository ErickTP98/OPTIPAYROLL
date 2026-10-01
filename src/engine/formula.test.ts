import { describe, expect, it } from "vitest";
import { compileFormula, FormulaError } from "./formula";

const ev = (src: string, vars: Record<string, number> = {}) => compileFormula(src).evaluate(vars);

describe("compileFormula", () => {
  it("respeta precedencia y paréntesis", () => {
    expect(ev("2 + 3 * 4")).toBe(14);
    expect(ev("(2 + 3) * 4")).toBe(20);
    expect(ev("-2 ^ 2")).toBe(-4);
    expect(ev("2 ^ 3 ^ 2")).toBe(512);
    expect(ev("50%")).toBe(0.5);
  });

  it("usa variables sin distinguir mayúsculas", () => {
    expect(ev("base / 6", { BASE: 600 })).toBe(100);
    expect(compileFormula("(BASE + gratif) / 12").variables.sort()).toEqual(["BASE", "GRATIF"]);
  });

  it("soporta funciones y comparaciones", () => {
    expect(ev("MIN(BASE, 1000)", { BASE: 1500 })).toBe(1000);
    expect(ev("MAX(1, 2, 3)")).toBe(3);
    expect(ev("ROUND(10 / 3, 2)")).toBe(3.33);
    expect(ev("IF(MES >= 7, 100, 0)", { MES: 7 })).toBe(100);
    expect(ev("SI(MES = 1, 1, 2)", { MES: 3 })).toBe(2);
  });

  it("división entre cero da 0", () => {
    expect(ev("10 / 0")).toBe(0);
  });

  it("reporta errores de sintaxis y variables desconocidas", () => {
    expect(() => compileFormula("2 +")).toThrow(FormulaError);
    expect(() => compileFormula("2 $ 3")).toThrow(FormulaError);
    expect(() => compileFormula("FOO(1)")).toThrow(FormulaError);
    expect(() => compileFormula(".")).toThrow(FormulaError);
    expect(() => compileFormula("")).toThrow(FormulaError);
    expect(() => ev("X + 1")).toThrow(FormulaError);
  });
});
