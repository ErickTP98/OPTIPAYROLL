import type { Concept, Employee, Increase, PayrollData, Position, Rule } from "../types";
import { compileFormula, FormulaError, type CompiledFormula } from "./formula";

export const MONTHS = 12;

export type LineGroup = "concepto" | "beneficio" | "aporte";

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
): EmployeeBudget {
  const position = data.positions.find((p) => p.id === e.positionId);
  const works = Array.from({ length: MONTHS }, (_, m) => !!e.months[m]);
  const monthsWorked = works.filter(Boolean).length;

  const conceptLines = new Map<string, BudgetLine>();
  for (const c of data.concepts) {
    const amount = e.concepts.filter((a) => a.conceptId === c.id).reduce((s, a) => s + (a.amount || 0), 0);
    if (!amount) continue;
    const factors = increaseFactors(data.increases, e, position, c);
    const months = works.map((w, m) => (w && c.months[m] ? round2(amount * factors[m]) : 0));
    conceptLines.set(c.id, { id: c.id, code: c.code, name: c.name, group: "concepto", months, total: round2(sum(months)) });
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
    ...data.concepts.map((c) => conceptLines.get(c.id)).filter((l): l is BudgetLine => !!l),
    ...data.rules.map((r) => ruleLines.get(r.id)!).filter((l) => l.total !== 0),
  ];
  const totals: EmployeeBudget["totals"] = { concepto: zeros(), beneficio: zeros(), aporte: zeros(), total: zeros() };
  for (const l of lines) {
    l.months.forEach((v, m) => {
      totals[l.group][m] += v;
      totals.total[m] += v;
    });
  }
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = totals[k].map(round2);

  return { employee: e, position, lines, bases, totals, grandTotal: round2(sum(totals.total)) };
}

export function calculateBudget(data: PayrollData): BudgetResult {
  const { ordered, errors } = prepareRules(data);
  const employees = data.employees.map((e) => calculateEmployee(data, e, ordered, errors));
  return { employees, errors };
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
      g = { key, label, headcount: 0, totals: { concepto: zeros(), beneficio: zeros(), aporte: zeros(), total: zeros() }, grandTotal: 0 };
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
  const order: Record<LineGroup, number> = { concepto: 0, beneficio: 1, aporte: 2 };
  return [...map.values()].sort((a, b) => order[a.group] - order[b.group]);
}
