import type { PayrollData } from "../types";
import { calculateBudget, isTargetBonus, type LineGroup } from "../engine/calculate";
import { employeeYear, MONTH_NAMES, monthsLabel } from "../utils";
import { buildXlsx, type Cell, type SheetSpec } from "./xlsx";

const GENDER: Record<string, string> = { F: "Femenino", M: "Masculino", O: "Otro" };
const CONCEPT_TYPE: Record<string, string> = { remunerativo: "Remunerativo", no_remunerativo: "No remunerativo", otro: "Otro" };
const RULE_KIND: Record<string, string> = { beneficio: "Beneficio social", aporte: "Aporte patronal" };
const BASE_MODE: Record<string, string> = { mes: "Base del mes", acumulado: "Suma desde la última aplicación", promedio: "Promedio desde la última aplicación" };
const SCOPE: Record<string, string> = { todos: "Todos", area: "Por área", puesto: "Por puesto", trabajador: "Por trabajador" };
const GROUP: Record<LineGroup, string> = {
  concepto: "Remuneraciones y conceptos",
  bono: "Bonos target",
  beneficio: "Beneficios sociales",
  aporte: "Aportes patronales",
};
const yesNo = (b: boolean) => (b ? "Sí" : "No");

/**
 * Libro de Excel con toda la información registrada: trabajadores (datos personales y puesto),
 * puestos, conceptos de nómina, reglas de beneficios/aportes, montos por año, incrementos
 * y el presupuesto calculado del año seleccionado.
 */
export function buildPayrollWorkbook(data: PayrollData): Uint8Array {
  const years = [...data.settings.years].sort((a, b) => a - b);
  const posById = new Map(data.positions.map((p) => [p.id, p]));
  const conceptById = new Map(data.concepts.map((c) => [c.id, c]));
  const ruleById = new Map(data.rules.map((r) => [r.id, r]));
  const name = (first: string, last: string, vacancy: boolean) => (vacancy ? "Vacante" : [first, last].filter(Boolean).join(" "));

  // 1. Trabajadores: datos personales, campos personalizados y puesto.
  const employees: Cell[][] = [[
    "Código", "Tipo", "Nombres", "Apellidos", "Tipo de documento", "Número de documento", "Fecha de nacimiento", "Sexo",
    "Correo", "Teléfono", "Dirección", "Fecha de ingreso", "Tipo de contrato",
    ...data.customFields.map((f) => f.label),
    "Código de puesto", "Puesto", "Área", "Centro de costo", "Categoría",
    ...years.map((y) => `Meses que labora ${y}`),
  ]];
  for (const e of data.employees) {
    const p = posById.get(e.positionId);
    employees.push([
      e.code, e.isVacancy ? "Vacante" : "Trabajador", e.firstName, e.lastName, e.docType, e.docNumber, e.birthDate,
      GENDER[e.gender] ?? e.gender, e.email, e.phone, e.address, e.hireDate, e.contractType,
      ...data.customFields.map((f) => {
        const v = e.custom[f.id] ?? "";
        return f.type === "number" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
      }),
      p?.code ?? "", p?.name ?? "", p?.area ?? "", p?.costCenter ?? "", p?.category ?? "",
      ...years.map((y) => {
        const months = employeeYear(e, y).months;
        return months.some(Boolean) ? monthsLabel(months) : "No labora";
      }),
    ]);
  }

  // 2. Puestos con sus montos referenciales.
  const regular = data.concepts.filter((c) => !isTargetBonus(c));
  const bonuses = data.concepts.filter(isTargetBonus);
  const ordered = [...regular, ...bonuses];
  const conceptHeader = (c: (typeof ordered)[number]) => (isTargetBonus(c) ? `${c.code} (TARGET)` : c.code);
  const positions: Cell[][] = [[
    "Código", "Puesto", "Área", "Centro de costo", "Categoría", "Observaciones", "Ocupantes", "Vacantes",
    ...ordered.map(conceptHeader),
  ]];
  for (const p of data.positions) {
    const people = data.employees.filter((e) => e.positionId === p.id);
    positions.push([
      p.code, p.name, p.area, p.costCenter, p.category, p.notes,
      people.filter((e) => !e.isVacancy).length, people.filter((e) => e.isVacancy).length,
      ...ordered.map((c) => p.concepts.find((a) => a.conceptId === c.id)?.amount ?? null),
    ]);
  }

  // 3. Conceptos de nómina con sus indicadores de afectación.
  const concepts: Cell[][] = [[
    "Código", "Concepto", "Segmento", "Tipo de bono", "Tipo", "Sueldo básico", "Afecto a incremento", "Meses de pago", "Fórmula",
    ...data.rules.map((r) => `Afecto a ${r.code}`),
  ]];
  for (const c of ordered) {
    concepts.push([
      c.code, c.name, isTargetBonus(c) ? "Bono target" : "Regular", isTargetBonus(c) ? c.targetType : "",
      CONCEPT_TYPE[c.type] ?? c.type, yesNo(c.isBaseSalary), yesNo(c.appliesIncrease), monthsLabel(c.months),
      isTargetBonus(c) ? c.formula : "",
      ...data.rules.map((r) => yesNo(c.affects.includes(r.id))),
    ]);
  }

  // 4. Reglas de beneficios sociales y aportes patronales.
  const rules: Cell[][] = [[
    "Código", "Nombre", "Tipo", "Método", "Porcentaje", "Fórmula", "Modo de base", "Base mínima", "Tope de base",
    "Meses", "Conceptos afectos", "Suma resultado de",
  ]];
  for (const r of data.rules) {
    rules.push([
      r.code, r.name, RULE_KIND[r.kind] ?? r.kind, r.method === "porcentaje" ? "Porcentaje" : "Fórmula", r.rate,
      r.method === "formula" ? r.formula : "", BASE_MODE[r.baseMode] ?? r.baseMode, r.baseMin || null, r.baseMax || null,
      monthsLabel(r.months),
      data.concepts.filter((c) => c.affects.includes(r.id)).map((c) => c.code).join(", "),
      r.includeRules.map((id) => ruleById.get(id)?.code ?? "").filter(Boolean).join(", "),
    ]);
  }

  // 5. Montos de conceptos por trabajador y año.
  const amounts: Cell[][] = [[
    "Código", "Trabajador", "Puesto", "Área", "Año", "Meses que labora", ...ordered.map(conceptHeader),
  ]];
  for (const e of data.employees) {
    const p = posById.get(e.positionId);
    for (const y of years) {
      const yd = employeeYear(e, y);
      if (!yd.months.some(Boolean) && yd.concepts.length === 0) continue;
      amounts.push([
        e.code, name(e.firstName, e.lastName, e.isVacancy), p?.name ?? "", p?.area ?? "", y,
        yd.months.some(Boolean) ? monthsLabel(yd.months) : "No labora",
        ...ordered.map((c) => yd.concepts.find((a) => a.conceptId === c.id)?.amount ?? null),
      ]);
    }
  }

  // 6. Incrementos.
  const increases: Cell[][] = [["Año", "Descripción", "Desde", "Porcentaje", "Alcance", "Aplica a", "Conceptos"]];
  for (const i of [...data.increases].sort((a, b) => a.year - b.year || a.month - b.month)) {
    const targets = i.targets.map((t) =>
      i.scope === "puesto" ? posById.get(t)?.name ?? t
        : i.scope === "trabajador" ? data.employees.find((e) => e.id === t)?.code ?? t
          : t,
    );
    increases.push([
      i.year, i.name, MONTH_NAMES[i.month], i.percent, SCOPE[i.scope] ?? i.scope, targets.join(", "),
      i.conceptIds.length ? i.conceptIds.map((id) => conceptById.get(id)?.code ?? "").join(", ") : "Conceptos afectos a incremento",
    ]);
  }

  // 7. Presupuesto calculado del año seleccionado (detalle mensual).
  const year = data.settings.year;
  const result = calculateBudget(data, year);
  const budget: Cell[][] = [[
    "Código", "Trabajador", "Puesto", "Área", "Centro de costo", "Grupo", "Código concepto/regla", "Concepto / regla",
    ...MONTH_NAMES, "Total",
  ]];
  for (const b of result.employees) {
    for (const l of b.lines) {
      budget.push([
        b.employee.code, name(b.employee.firstName, b.employee.lastName, b.employee.isVacancy), b.position?.name ?? "",
        b.position?.area ?? "", b.position?.costCenter ?? "", GROUP[l.group], l.code, l.name, ...l.months, l.total,
      ]);
    }
  }
  const budgetMoney = Array.from({ length: 13 }, (_, i) => 8 + i);

  const sheets: SheetSpec[] = [
    { name: "Trabajadores", rows: employees },
    { name: "Puestos", rows: positions, moneyColumns: ordered.map((_, i) => 8 + i) },
    { name: "Conceptos de nómina", rows: concepts },
    { name: "Beneficios y aportes", rows: rules, moneyColumns: [7, 8] },
    { name: "Montos por año", rows: amounts, moneyColumns: ordered.map((_, i) => 6 + i) },
    { name: "Incrementos", rows: increases },
    { name: `Presupuesto ${year}`, rows: budget, moneyColumns: budgetMoney },
  ];
  return buildXlsx(sheets);
}

export function workbookFileName(data: PayrollData): string {
  const company = data.settings.companyName.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `optipayroll${company ? `-${company}` : ""}-${data.settings.year}.xlsx`;
}
