import { useEffect, useState } from "react";
import type { Concept, ConceptAmount, Employee, PayrollData } from "./types";

interface LegacyEmployee {
  months?: boolean[];
  concepts?: ConceptAmount[];
}
import { sampleData } from "./data/seed";

const STORAGE_KEY = "optipayroll:data";

/** Completa campos faltantes de datos importados o guardados con versiones anteriores. */
export function normalizeData(raw: unknown): PayrollData {
  const d = raw as Partial<PayrollData>;
  if (!d || typeof d !== "object" || !d.settings) throw new Error("El archivo no tiene el formato de OptiPayroll");
  const months = (m: unknown, fill = true) =>
    Array.isArray(m) && m.length === 12 ? m.map(Boolean) : new Array(12).fill(fill);
  const year = d.settings.year ?? new Date().getFullYear();
  const years = [...new Set([...(d.settings.years ?? []), year])].sort((a, b) => a - b);
  return {
    version: 1,
    settings: {
      companyName: d.settings.companyName ?? "",
      year,
      years,
      currency: d.settings.currency ?? "",
      palette: d.settings.palette === "turquesa" ? "turquesa" : "menta",
      logo: typeof d.settings.logo === "string" && d.settings.logo.startsWith("data:image/") ? d.settings.logo : "",
    },
    customFields: (d.customFields ?? []).map((f) => ({ ...f, options: f.options ?? [] })),
    positions: (d.positions ?? []).map((p) => ({ ...p, concepts: p.concepts ?? [] })),
    employees: (d.employees ?? []).map((raw) => {
      // Versiones anteriores guardaban meses y montos directamente en el trabajador (un solo año).
      const { months: legacyMonths, concepts: legacyConcepts, ...e } = raw as Employee & LegacyEmployee;
      const yearsData: Employee["years"] = {};
      for (const [y, yd] of Object.entries(e.years ?? {})) {
        yearsData[y] = { months: months(yd.months, false), concepts: yd.concepts ?? [] };
      }
      if (!e.years && (legacyMonths || legacyConcepts)) {
        yearsData[String(year)] = { months: months(legacyMonths), concepts: legacyConcepts ?? [] };
      }
      return { ...e, custom: e.custom ?? {}, years: yearsData };
    }),
    concepts: normalizeConcepts(d.concepts ?? []),
    rules: (d.rules ?? []).map((r) => ({ ...r, months: months(r.months), includeRules: r.includeRules ?? [] })),
    increases: (d.increases ?? []).map((i) => ({ ...i, year: i.year ?? year, targets: i.targets ?? [], conceptIds: i.conceptIds ?? [] })),
  };
}

function normalizeConcepts(list: Partial<Concept>[]): Concept[] {
  const concepts = list.map((c) => ({
    ...c,
    segment: c.segment ?? "regular",
    targetType: c.targetType ?? "STI",
    formula: c.formula ?? "",
    isBaseSalary: c.isBaseSalary ?? false,
    months: Array.isArray(c.months) && c.months.length === 12 ? c.months.map(Boolean) : new Array(12).fill(true),
    affects: c.affects ?? [],
  })) as Concept[];
  // Datos de versiones anteriores: se toma como sueldo básico el concepto con código SUELDO.
  if (!concepts.some((c) => c.isBaseSalary)) {
    const sueldo = concepts.find((c) => c.code?.trim().toUpperCase() === "SUELDO");
    if (sueldo) sueldo.isBaseSalary = true;
  }
  return concepts;
}

function load(): PayrollData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch {
    /* datos corruptos: se reinicia con el ejemplo */
  }
  return sampleData();
}

export function usePayrollData() {
  const [data, setData] = useState<PayrollData>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [data]);
  return [data, setData] as const;
}
