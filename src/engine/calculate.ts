import type { Concept, Employee, Increase, PayrollData, Position, Rule } from "../types";
import { compileFormula, FormulaError, type CompiledFormula } from "./formula";
import { employeeYear } from "../utils";

export const MONTHS = 12;

export type LineGroup = "concepto" | "bono" | "beneficio" | "aporte";

export interface BudgetLine {
  id: string;
  code: string;
  name: string;
  group: LineGroup;
  months: number[];
  total: number;
}

export interface EmployeeBudget {
  employee: Employee;
  position?: Position;
  /** Líneas de conceptos, beneficios sociales y aportes patronales (solo las que tienen monto). */
  lines: BudgetLine[];
  /** Base mensual de cada regla (suma de conceptos afectos + reglas incluidas), por id de regla. */
  bases: Record<string, number[]>;
  totals: Record<LineGroup | "total", number[]>;
  grandTotal: number;
}

export interface BudgetResult {
  year: number;
  employees: EmployeeBudget[];
  /** Mensajes de configuración (fórmulas inválidas, dependencias circulares, etc.). */
  errors: string[];
}

/** Variables reservadas disponibles en las fórmulas. */
export const RESERVED_VARIABLES: Record<string, string> = {
  BASE: "Base de la regla (ya aplicado el modo de base, mínimo y tope)",
  BASE_MES: "Base del mes en curso",
  TASA: "Porcentaje de la regla expresado en decimal (9% → 0.09)",
  MES: "Número de mes (1 = enero … 12 = diciembre)",
  LABORA: "1 si el trabajador labora en el mes, 0 si no",
  MESES_PERIODO: "Meses laborados dentro del periodo que cubre la base",
  MESES_LABORADOS: "Meses laborados en todo el año",
};

/** Variables disponibles en las fórmulas de los bonos target. */
export const TARGET_BONUS_VARIABLES: Record<string, string> = {
  SUELDO_BASICO: "Sueldo básico del mes (con incrementos; 0 si no labora)",
  TARGET: "Valor target asignado al trabajador o puesto para este bono",
  MES: "Número de mes (1 = enero … 12 = diciembre)",
  LABORA: "1 si el trabajador labora en el mes, 0 si no",
  MESES_LABORADOS: "Meses laborados en todo el año",
};

export const isTargetBonus = (c: Concept) => c.segment === "bono_target";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const zeros = () => new Array<number>(MONTHS).fill(0);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const norm = (code: string) => code.trim().toUpperCase();

function increaseApplies(inc: Increase, e: Employee, position: Position | undefined, c: Concept): boolean {
  if (inc.conceptIds.length > 0 ? !inc.conceptIds.includes(c.id) : !c.appliesIncrease) return false;
  switch (inc.scope) {
    case "todos":
      return true;
    case "area":
      return !!position && inc.targets.includes(position.area);
    case "puesto":
      return inc.targets.includes(e.positionId);
    case "trabajador":
      return inc.targets.includes(e.id);
  }
}

/** Factor acumulado de incrementos (compuestos) para cada mes. */
export function increaseFactors(
  increases: Increase[],
  e: Employee,
  position: Position | undefined,
  c: Concept,
): number[] {
  const applicable = increases.filter((inc) => increaseApplies(inc, e, position, c));
  return Array.from({ length: MONTHS }, (_, m) =>
    applicable
      .filter((inc) => inc.month <= m)
      .reduce((f, inc) => f * (1 + inc.percent / 100), 1),
  );
}

interface PreparedRule {
  rule: Rule;
  formula?: CompiledFormula;
  error?: string;
}

/**
 * Ordena las reglas según sus dependencias (reglas incluidas en la base y reglas
 * referenciadas en la fórmula) y compila las fórmulas.
 */
/** Compila las fórmulas de los bonos target y valida sus variables. */
export function prepareTargetBonuses(data: PayrollData, errors: string[]): Map<string, CompiledFormula> {
  const compiled = new Map<string, CompiledFormula>();
  const regularCodes = new Set(data.concepts.filter((c) => !isTargetBonus(c)).map((c) => norm(c.code)));
  for (const c of data.concepts.filter(isTargetBonus)) {
    try {
      const f = compileFormula(c.formula);
      const unknown = f.variables.filter((v) => !(v in TARGET_BONUS_VARIABLES) && !regularCodes.has(v));
      if (unknown.length) {
        errors.push(`La fórmula del bono ${c.code} usa variables desconocidas: ${unknown.join(", ")}`);
        continue;
      }
      compiled.set(c.id, f);
    } catch (err) {
      errors.push(`Fórmula inválida en el bono ${c.code}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!data.concepts.some((c) => c.isBaseSalary) && compiled.size > 0) {
    errors.push("Ningún concepto está marcado como sueldo básico: SUELDO_BASICO valdrá 0 en los bonos target.");
  }
  return compiled;
}

export function prepareRules(data: PayrollData): { ordered: PreparedRule[]; errors: string[] } {
  const errors: string[] = [];
  const byCode = new Map(data.rules.map((r) => [norm(r.code), r]));
  const conceptCodes = new Set(data.concepts.map((c) => norm(c.code)));
  const prepared = new Map<string, PreparedRule>();
  const deps = new Map<string, string[]>();

  for (const rule of data.rules) {
    const p: PreparedRule = { rule };
    const d = new Set(rule.includeRules.filter((id) => data.rules.some((r) => r.id === id)));
    if (rule.method === "formula") {
      try {
        p.formula = compileFormula(rule.formula);
        for (const v of p.formula.variables) {
          const ref = byCode.get(v);
          if (ref) {
            if (ref.id === rule.id) p.error = `La fórmula de ${rule.code} se refiere a sí misma`;
            else d.add(ref.id);
          } else if (!(v in RESERVED_VARIABLES) && !conceptCodes.has(v)) {
            p.error = `La fórmula de ${rule.code} usa la variable desconocida "${v}"`;
          }
        }
      } catch (err) {
        p.error = `Fórmula inválida en ${rule.code}: ${err instanceof FormulaError ? err.message : String(err)}`;
      }
    }
    if (p.error) errors.push(p.error);
    prepared.set(rule.id, p);
    deps.set(rule.id, [...d]);
  }

  const ordered: PreparedRule[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, path: string[]) => {
    const s = state.get(id);
    if (s === "done") return;
    if (s === "visiting") {
      const cycle = [...path.slice(path.indexOf(id)), id];
      errors.push(`Dependencia circular entre reglas: ${cycle.map((c) => prepared.get(c)!.rule.code).join(" → ")}`);
      for (const c of cycle) prepared.get(c)!.error ??= "Dependencia circular";
      return;
    }
    state.set(id, "visiting");
    for (const dep of deps.get(id) ?? []) visit(dep, [...path, id]);
    state.set(id, "done");
    ordered.push(prepared.get(id)!);
  };
  data.rules.forEach((r) => visit(r.id, []));
  return { ordered, errors };
}

export function calculateEmployee(
  data: PayrollData,
  e: Employee,
  ordered: PreparedRule[],
  errors: string[],
  bonusFormulas: Map<string, CompiledFormula> = new Map(),
  year: number = data.settings.year,
): EmployeeBudget {
  const position = data.positions.find((p) => p.id === e.positionId);
  const yd = employeeYear(e, year);
  const increases = data.increases.filter((i) => i.year === year);
  const works = Array.from({ length: MONTHS }, (_, m) => !!yd.months[m]);
  const monthsWorked = works.filter(Boolean).length;

  const conceptLines = new Map<string, BudgetLine>();
  const assigned = (c: Concept) => yd.concepts.filter((a) => a.conceptId === c.id).reduce((s, a) => s + (a.amount || 0), 0);
  for (const c of data.concepts) {
    if (isTargetBonus(c)) continue;
    const amount = assigned(c);
    if (!amount) continue;
    const factors = increaseFactors(increases, e, position, c);
    const months = works.map((w, m) => (w && c.months[m] ? round2(amount * factors[m]) : 0));
    conceptLines.set(c.id, { id: c.id, code: c.code, name: c.name, group: "concepto", months, total: round2(sum(months)) });
  }

  // Bonos target: fórmula sobre el sueldo básico del mes (ya incrementado) y el TARGET del trabajador.
  const regularVars: Record<string, number[]> = {};
  for (const c of data.concepts) if (!isTargetBonus(c)) regularVars[norm(c.code)] = conceptLines.get(c.id)?.months ?? zeros();
  const baseSalary = zeros();
  for (const c of data.concepts.filter((x) => x.isBaseSalary && !isTargetBonus(x))) {
    conceptLines.get(c.id)?.months.forEach((v, m) => (baseSalary[m] += v));
  }
  for (const c of data.concepts.filter(isTargetBonus)) {
    const target = assigned(c);
    const formula = bonusFormulas.get(c.id);
    if (!target || !formula) continue;
    const months = works.map((w, m) => {
      if (!w || !c.months[m]) return 0;
      const vars: Record<string, number> = {
        SUELDO_BASICO: baseSalary[m],
        TARGET: target,
        MES: m + 1,
        LABORA: 1,
        MESES_LABORADOS: monthsWorked,
      };
      for (const [code, vals] of Object.entries(regularVars)) vars[code] ??= vals[m];
      try {
        const v = formula.evaluate(vars);
        return Number.isFinite(v) ? round2(v) : 0;
      } catch (err) {
        const msg = `Error al evaluar el bono ${c.code}: ${err instanceof Error ? err.message : String(err)}`;
        if (!errors.includes(msg)) errors.push(msg);
        return 0;
      }
    });
    conceptLines.set(c.id, { id: c.id, code: c.code, name: c.name, group: "bono", months, total: round2(sum(months)) });
  }

  const conceptVars: Record<string, number[]> = {};
  for (const c of data.concepts) conceptVars[norm(c.code)] = conceptLines.get(c.id)?.months ?? zeros();

  const ruleLines = new Map<string, BudgetLine>();
  const bases: Record<string, number[]> = {};
  for (const { rule, formula, error } of ordered) {
    const monthBase = zeros();
    for (const c of data.concepts) {
      if (!c.affects.includes(rule.id)) continue;
      const line = conceptLines.get(c.id);
      if (line) line.months.forEach((v, m) => (monthBase[m] += v));
    }
    for (const inc of rule.includeRules) {
      const line = ruleLines.get(inc);
      if (line) line.months.forEach((v, m) => (monthBase[m] += v));
    }
    bases[rule.id] = monthBase.map(round2);

    const months = zeros();
    if (!error) {
      let periodStart = 0;
      for (let m = 0; m < MONTHS; m++) {
        if (!rule.months[m]) continue;
        const start = periodStart;
        periodStart = m + 1;

        let base: number;
        let periodMonths: number;
        if (rule.baseMode === "mes") {
          if (!works[m]) continue;
          base = monthBase[m];
          periodMonths = 1;
        } else {
          periodMonths = works.slice(start, m + 1).filter(Boolean).length;
          if (periodMonths === 0) continue;
          const acc = sum(monthBase.slice(start, m + 1));
          base = rule.baseMode === "promedio" ? acc / periodMonths : acc;
        }
        if (base > 0 && rule.baseMin > 0) base = Math.max(base, rule.baseMin);
        if (rule.baseMax > 0) base = Math.min(base, rule.baseMax);

        let value: number;
        if (rule.method === "porcentaje") {
          value = (base * rule.rate) / 100;
        } else {
          const vars: Record<string, number> = {
            BASE: base,
            BASE_MES: monthBase[m],
            TASA: rule.rate / 100,
            MES: m + 1,
            LABORA: works[m] ? 1 : 0,
            MESES_PERIODO: periodMonths,
            MESES_LABORADOS: monthsWorked,
          };
          for (const [code, vals] of Object.entries(conceptVars)) vars[code] ??= vals[m];
          for (const r of data.rules) vars[norm(r.code)] ??= ruleLines.get(r.id)?.months[m] ?? 0;
          try {
            value = formula!.evaluate(vars);
          } catch (err) {
            const msg = `Error al evaluar ${rule.code}: ${err instanceof Error ? err.message : String(err)}`;
            if (!errors.includes(msg)) errors.push(msg);
            value = 0;
          }
        }
        months[m] = Number.isFinite(value) ? round2(value) : 0;
      }
    }
    ruleLines.set(rule.id, {
      id: rule.id,
      code: rule.code,
      name: rule.name,
      group: rule.kind,
      months,
      total: round2(sum(months)),
    });
  }

  const lines = [
    ...data.concepts.filter((c) => !isTargetBonus(c)).map((c) => conceptLines.get(c.id)).filter((l): l is BudgetLine => !!l),
    ...data.concepts.filter(isTargetBonus).map((c) => conceptLines.get(c.id)).filter((l): l is BudgetLine => !!l && l.total !== 0),
    ...data.rules.map((r) => ruleLines.get(r.id)!).filter((l) => l.total !== 0),
  ];
  const totals: EmployeeBudget["totals"] = { concepto: zeros(), bono: zeros(), beneficio: zeros(), aporte: zeros(), total: zeros() };
  for (const l of lines) {
    l.months.forEach((v, m) => {
      totals[l.group][m] += v;
      totals.total[m] += v;
    });
  }
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = totals[k].map(round2);

  return { employee: e, position, lines, bases, totals, grandTotal: round2(sum(totals.total)) };
}

/**
 * Presupuesto de un año. Solo se incluyen los trabajadores que laboran al menos un mes ese año.
 */
export function calculateBudget(data: PayrollData, year: number = data.settings.year): BudgetResult {
  const { ordered, errors } = prepareRules(data);
  const bonusFormulas = prepareTargetBonuses(data, errors);
  const employees = data.employees
    .filter((e) => employeeYear(e, year).months.some(Boolean))
    .map((e) => calculateEmployee(data, e, ordered, errors, bonusFormulas, year));
  return { year, employees, errors };
}

export interface YearSummary {
  year: number;
  headcount: number;
  vacancies: number;
  totals: Record<LineGroup | "total", number>;
}

/** Totales anuales de cada año presupuestado (comparativo multianual). */
export function summarizeYears(data: PayrollData, items?: (b: EmployeeBudget) => boolean): YearSummary[] {
  return [...data.settings.years].sort((a, b) => a - b).map((year) => {
    const res = calculateBudget(data, year);
    const list = items ? res.employees.filter(items) : res.employees;
    const totals: YearSummary["totals"] = { concepto: 0, bono: 0, beneficio: 0, aporte: 0, total: 0 };
    for (const b of list) {
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = round2(totals[k] + sum(b.totals[k]));
    }
    return {
      year,
      headcount: list.filter((b) => !b.employee.isVacancy).length,
      vacancies: list.filter((b) => b.employee.isVacancy).length,
      totals,
    };
  });
}

export interface GroupSummary {
  key: string;
  label: string;
  headcount: number;
  totals: Record<LineGroup | "total", number[]>;
  grandTotal: number;
}

/** Agrupa los presupuestos individuales (por puesto, área, centro de costo, etc.). */
export function groupBudgets(
  items: EmployeeBudget[],
  keyOf: (b: EmployeeBudget) => { key: string; label: string },
): GroupSummary[] {
  const groups = new Map<string, GroupSummary>();
  for (const b of items) {
    const { key, label } = keyOf(b);
    let g = groups.get(key);
    if (!g) {
      g = { key, label, headcount: 0, totals: { concepto: zeros(), bono: zeros(), beneficio: zeros(), aporte: zeros(), total: zeros() }, grandTotal: 0 };
      groups.set(key, g);
    }
    g.headcount++;
    for (const k of Object.keys(g.totals) as (keyof GroupSummary["totals"])[]) {
      b.totals[k].forEach((v, m) => (g!.totals[k][m] = round2(g!.totals[k][m] + v)));
    }
    g.grandTotal = round2(g.grandTotal + b.grandTotal);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Suma por concepto/regla de todos los trabajadores. */
export function linesSummary(items: EmployeeBudget[]): BudgetLine[] {
  const map = new Map<string, BudgetLine>();
  for (const b of items) {
    for (const l of b.lines) {
      let acc = map.get(l.id);
      if (!acc) {
        acc = { ...l, months: zeros(), total: 0 };
        map.set(l.id, acc);
      }
      l.months.forEach((v, m) => (acc!.months[m] = round2(acc!.months[m] + v)));
      acc.total = round2(acc.total + l.total);
    }
  }
  const order: Record<LineGroup, number> = { concepto: 0, bono: 1, beneficio: 2, aporte: 3 };
  return [...map.values()].sort((a, b) => order[a.group] - order[b.group]);
}
