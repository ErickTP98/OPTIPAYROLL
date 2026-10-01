import type { Employee, EmployeeYear } from "./types";

export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

export const allMonths = () => new Array<boolean>(12).fill(true);
export const onlyMonths = (...idx: number[]) => Array.from({ length: 12 }, (_, i) => idx.includes(i));

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function formatMoney(n: number, currency = ""): string {
  const s = n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${s}` : s;
}

export function parseNumber(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function monthsLabel(flags: boolean[]): string {
  const count = flags.filter(Boolean).length;
  if (count === 12) return "Todo el año";
  if (count === 0) return "Ninguno";
  return flags.map((f, i) => (f ? MONTH_SHORT[i] : null)).filter(Boolean).join(", ");
}

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV con separador ";" y BOM para que Excel en español lo abra correctamente. */
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = typeof v === "number" ? v.toFixed(2).replace(".", ",") : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

/** Datos del trabajador para un año; si no tiene datos ese año, no labora ningún mes. */
export function employeeYear(e: Employee, year: number): EmployeeYear {
  return e.years[String(year)] ?? { months: new Array<boolean>(12).fill(false), concepts: [] };
}

export function withEmployeeYear(e: Employee, year: number, patch: Partial<EmployeeYear>): Employee {
  return { ...e, years: { ...e.years, [String(year)]: { ...employeeYear(e, year), ...patch } } };
}
