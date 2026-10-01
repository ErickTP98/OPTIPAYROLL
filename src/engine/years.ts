import type { PayrollData } from "../types";
import { uid } from "../utils";
import { isTargetBonus } from "./calculate";

export interface AddYearOptions {
  /** Año del que se copian meses y montos (sin copia si se omite). */
  from?: number;
  /** Ajuste porcentual aplicado a los montos de los conceptos regulares copiados (no a los TARGET). */
  adjustPercent?: number;
  /** Copia también los incrementos del año origen. */
  copyIncreases?: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Agrega un año presupuestado, opcionalmente copiando los datos de otro año, y lo deja seleccionado. */
export function addBudgetYear(data: PayrollData, year: number, opts: AddYearOptions = {}): PayrollData {
  if (data.settings.years.includes(year)) return { ...data, settings: { ...data.settings, year } };
  const factor = 1 + (opts.adjustPercent ?? 0) / 100;
  const bonusIds = new Set(data.concepts.filter(isTargetBonus).map((c) => c.id));
  const from = opts.from;
  return {
    ...data,
    settings: { ...data.settings, year, years: [...data.settings.years, year].sort((a, b) => a - b) },
    employees: data.employees.map((e) => {
      const src = from !== undefined ? e.years[String(from)] : undefined;
      if (!src) return e;
      return {
        ...e,
        years: {
          ...e.years,
          [String(year)]: {
            months: [...src.months],
            concepts: src.concepts.map((a) => ({
              conceptId: a.conceptId,
              amount: bonusIds.has(a.conceptId) ? a.amount : round2(a.amount * factor),
            })),
          },
        },
      };
    }),
    increases: [
      ...data.increases,
      ...(opts.copyIncreases && from !== undefined
        ? data.increases.filter((i) => i.year === from).map((i) => ({ ...i, id: uid(), year }))
        : []),
    ],
  };
}

/** Elimina un año presupuestado con sus datos por trabajador e incrementos. Siempre queda al menos un año. */
export function removeBudgetYear(data: PayrollData, year: number): PayrollData {
  const years = data.settings.years.filter((y) => y !== year);
  if (years.length === 0) return data;
  return {
    ...data,
    settings: { ...data.settings, years, year: data.settings.year === year ? years[years.length - 1] : data.settings.year },
    employees: data.employees.map((e) => {
      const { [String(year)]: _removed, ...rest } = e.years;
      return { ...e, years: rest };
    }),
    increases: data.increases.filter((i) => i.year !== year),
  };
}
