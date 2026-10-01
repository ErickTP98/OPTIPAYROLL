import { useMemo, useState, type ReactNode } from "react";
import {
  calculateBudget, groupBudgets, linesSummary, summarizeYears, type YearSummary,
  type BudgetLine, type EmployeeBudget, type GroupSummary, type LineGroup,
} from "../engine/calculate";
import { formatMoney, MONTH_NAMES, MONTH_SHORT, toCsv } from "../utils";
import { EmptyState, Modal, PageHeader } from "../components/ui";
import { exportFile } from "../components/dialogs";
import { exportExcel } from "../export/save";
import { employeeName } from "./EmployeesPage";
import type { PageProps } from "./types";

type View = "mensual" | "concepto" | "trabajador" | "puesto" | "area" | "centro" | "anual";

const VIEWS: Record<View, string> = {
  mensual: "Resumen mensual",
  concepto: "Por concepto",
  trabajador: "Por trabajador",
  puesto: "Por puesto",
  area: "Por área",
  centro: "Por centro de costo",
  anual: "Comparativo por año",
};

const GROUP_LABEL: Record<LineGroup, string> = {
  concepto: "Remuneraciones y conceptos",
  bono: "Bonos target",
  beneficio: "Beneficios sociales",
  aporte: "Aportes patronales",
};

interface Row {
  key: string;
  label: ReactNode;
  csvLabel: string[];
  months: number[];
  total: number;
  className?: string;
  onClick?: () => void;
}

const sumMonths = (rows: { months: number[] }[]) =>
  Array.from({ length: 12 }, (_, m) => Math.round(rows.reduce((s, r) => s + r.months[m], 0) * 100) / 100);

export function BudgetPage({ data }: PageProps) {
  const [view, setView] = useState<View>("mensual");
  const [area, setArea] = useState("");
  const [detail, setDetail] = useState<EmployeeBudget | null>(null);
  const cur = data.settings.currency;
  const result = useMemo(() => calculateBudget(data), [data]);
  const areas = [...new Set(data.positions.map((p) => p.area).filter(Boolean))].sort();

  const items = area ? result.employees.filter((b) => b.position?.area === area) : result.employees;
  const totals = useMemo(() => groupBudgets(items, () => ({ key: "all", label: "Total" }))[0], [items]);

  const groupRows = (groups: GroupSummary[], headers: (g: GroupSummary) => string[]): Row[] =>
    groups.map((g) => ({
      key: g.key,
      label: <>{g.label} <span className="muted small">({g.headcount})</span></>,
      csvLabel: [...headers(g), String(g.headcount)],
      months: g.totals.total,
      total: g.grandTotal,
    }));

  let headers: string[] = ["Descripción"];
  let rows: Row[] = [];
  switch (view) {
    case "mensual": {
      rows = (["concepto", "bono", "beneficio", "aporte"] as LineGroup[]).map((g) => ({
        key: g,
        label: GROUP_LABEL[g],
        csvLabel: [GROUP_LABEL[g]],
        months: totals?.totals[g] ?? new Array(12).fill(0),
        total: (totals?.totals[g] ?? []).reduce((s, v) => s + v, 0),
      }));
      break;
    }
    case "concepto": {
      headers = ["Tipo", "Código", "Concepto / regla"];
      rows = linesSummary(items).map((l) => ({
        key: l.id,
        label: <><span className={`tag tag-${l.group}`}>{l.group}</span> <code>{l.code}</code> {l.name}</>,
        csvLabel: [GROUP_LABEL[l.group], l.code, l.name],
        months: l.months,
        total: l.total,
      }));
      break;
    }
    case "trabajador": {
      headers = ["Código", "Trabajador", "Puesto", "Área"];
      rows = items.map((b) => ({
        key: b.employee.id,
        label: (
          <>
            <code>{b.employee.code}</code> {employeeName(b.employee)}
            {b.employee.isVacancy && <span className="badge warn">vacante</span>}
            <div className="muted small">{b.position?.name ?? "Sin puesto"}</div>
          </>
        ),
        csvLabel: [b.employee.code, employeeName(b.employee), b.position?.name ?? "", b.position?.area ?? ""],
        months: b.totals.total,
        total: b.grandTotal,
        onClick: () => setDetail(b),
      }));
      break;
    }
    case "puesto":
      headers = ["Puesto", "Área", "Ocupantes"];
      rows = groupRows(
        groupBudgets(items, (b) => ({ key: b.employee.positionId, label: b.position ? `${b.position.code} · ${b.position.name}` : "Sin puesto" })),
        (g) => [g.label, data.positions.find((p) => p.id === g.key)?.area ?? ""],
      );
      break;
    case "area":
      headers = ["Área", "Ocupantes"];
      rows = groupRows(groupBudgets(items, (b) => ({ key: b.position?.area ?? "", label: b.position?.area || "Sin área" })), (g) => [g.label]);
      break;
    case "centro":
      headers = ["Centro de costo", "Ocupantes"];
      rows = groupRows(
        groupBudgets(items, (b) => ({ key: b.position?.costCenter ?? "", label: b.position?.costCenter || "Sin centro de costo" })),
        (g) => [g.label],
      );
      break;
  }
  const totalRow: Row = { key: "total", label: "Total", csvLabel: ["Total"], months: sumMonths(rows), total: rows.reduce((s, r) => s + r.total, 0), className: "total-row" };

  const yearSummary = useMemo(
    () => (view === "anual" ? summarizeYears(data, area ? (b) => b.position?.area === area : undefined) : []),
    [view, data, area],
  );
  const YEAR_GROUPS: LineGroup[] = ["concepto", "bono", "beneficio", "aporte"];

  const exportCsv = () => {
    if (view === "anual") {
      const csv = toCsv([
        ["Año", "Trabajadores", "Vacantes", ...YEAR_GROUPS.map((g) => GROUP_LABEL[g]), "Gasto total", "Variación %"],
        ...yearSummary.map((y, i) => {
          const prev = yearSummary[i - 1]?.totals.total;
          return [String(y.year), String(y.headcount), String(y.vacancies), ...YEAR_GROUPS.map((g) => y.totals[g]), y.totals.total,
            prev ? ((y.totals.total / prev - 1) * 100) : ""];
        }),
      ]);
      exportFile(`presupuesto-comparativo-anual.csv`, csv, "text/csv;charset=utf-8");
      return;
    }
    const pad = headers.length;
    const csv = toCsv([
      [...headers, ...MONTH_NAMES, "Total"],
      ...[...rows, totalRow].map((r) => [...r.csvLabel, ...new Array(pad - r.csvLabel.length).fill(""), ...r.months, r.total]),
    ]);
    exportFile(`presupuesto-${data.settings.year}-${view}.csv`, csv, "text/csv;charset=utf-8");
  };

  const exportDetailCsv = () => {
    const out: (string | number)[][] = [["Código", "Trabajador", "Puesto", "Área", "Centro de costo", "Tipo", "Concepto / regla", ...MONTH_NAMES, "Total"]];
    for (const b of items) {
      for (const l of b.lines) {
        out.push([b.employee.code, employeeName(b.employee), b.position?.name ?? "", b.position?.area ?? "", b.position?.costCenter ?? "", GROUP_LABEL[l.group], `${l.code} ${l.name}`, ...l.months, l.total]);
      }
    }
    exportFile(`presupuesto-${data.settings.year}-detalle.csv`, toCsv(out), "text/csv;charset=utf-8");
  };

  const headcount = items.filter((b) => !b.employee.isVacancy).length;
  const vacancies = items.length - headcount;

  return (
    <>
      <PageHeader
        title={`Presupuesto de nóminas ${data.settings.year}`}
        description={data.settings.companyName}
        logo={data.settings.logo || undefined}
        actions={
          <>
            <button className="btn primary" onClick={() => exportExcel(data)}>Exportar a Excel</button>
            <button className="btn" onClick={exportCsv}>Exportar vista (CSV)</button>
            <button className="btn" onClick={exportDetailCsv}>Exportar detalle (CSV)</button>
          </>
        }
      />

      {result.errors.length > 0 && (
        <div className="alert">
          <strong>Revisa la configuración de reglas y bonos:</strong>
          <ul>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <div className="kpis">
        <Kpi label="Gasto total anual" value={formatMoney(totals?.grandTotal ?? 0, cur)} accent />
        <Kpi label={GROUP_LABEL.concepto} value={formatMoney(sumOf(totals?.totals.concepto), cur)} />
        <Kpi label={GROUP_LABEL.bono} value={formatMoney(sumOf(totals?.totals.bono), cur)} />
        <Kpi label={GROUP_LABEL.beneficio} value={formatMoney(sumOf(totals?.totals.beneficio), cur)} />
        <Kpi label={GROUP_LABEL.aporte} value={formatMoney(sumOf(totals?.totals.aporte), cur)} />
        <Kpi label="Dotación" value={`${headcount}`} sub={vacancies ? `+ ${vacancies} vacante(s)` : undefined} />
      </div>

      <div className="toolbar">
        <div className="segmented">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{VIEWS[v]}</button>
          ))}
        </div>
        <select value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Todas las áreas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {view === "anual" ? (
        <div className="card table-wrap">
          <YearCompareTable summary={yearSummary} currency={cur} selected={data.settings.year} />
          <p className="muted small">Gasto anual de cada año presupuestado{area ? ` (área ${area})` : ""}. Cambia de año con el selector de la parte superior.</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState>No hay trabajadores que laboren en {data.settings.year}. Regístralos o asígnales meses en la pestaña «Trabajadores».</EmptyState>
      ) : (
        <div className="card table-wrap">
          <MatrixTable rows={[...rows, totalRow]} />
          {view === "trabajador" && <p className="muted small">Haz clic en un trabajador para ver el detalle de su cálculo.</p>}
        </div>
      )}

      {detail && <EmployeeDetail budget={detail} currency={cur} data={data} onClose={() => setDetail(null)} />}
    </>
  );
}

function YearCompareTable({ summary, currency, selected }: { summary: YearSummary[]; currency: string; selected: number }) {
  const groups: LineGroup[] = ["concepto", "bono", "beneficio", "aporte"];
  return (
    <table className="table matrix-num">
      <thead>
        <tr>
          <th>Año</th>
          <th className="num">Dotación</th>
          {groups.map((g) => <th key={g} className="num">{GROUP_LABEL[g]}</th>)}
          <th className="num">Gasto total ({currency})</th>
          <th className="num">Var. vs año anterior</th>
        </tr>
      </thead>
      <tbody>
        {summary.map((y, i) => {
          const prev = summary[i - 1]?.totals.total;
          const delta = prev ? (y.totals.total / prev - 1) * 100 : null;
          return (
            <tr key={y.year} className={y.year === selected ? "selected-row" : ""}>
              <td><strong>{y.year}</strong></td>
              <td className="num">{y.headcount}{y.vacancies > 0 && <span className="muted small"> + {y.vacancies} vac.</span>}</td>
              {groups.map((g) => <td key={g} className="num">{formatMoney(y.totals[g])}</td>)}
              <td className="num strong">{formatMoney(y.totals.total)}</td>
              <td className="num">
                {delta === null ? <span className="muted">—</span> : (
                  <span className={`delta inline ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const sumOf = (a?: number[]) => (a ?? []).reduce((s, v) => s + v, 0);

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`kpi ${accent ? "accent" : ""}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

function MatrixTable({ rows }: { rows: Row[] }) {
  return (
    <table className="table matrix-num">
      <thead>
        <tr>
          <th className="sticky">Descripción</th>
          {MONTH_SHORT.map((m) => <th key={m} className="num">{m}</th>)}
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) =>
          r.className === "group-row" ? (
            <tr key={r.key} className="group-row"><td className="sticky">{r.label}</td><td colSpan={13} /></tr>
          ) : (
          <tr key={r.key} className={`${r.className ?? ""} ${r.onClick ? "clickable" : ""}`} onClick={r.onClick}>
            <td className="sticky">{r.label}</td>
            {r.months.map((v, i) => <td key={i} className={`num ${v === 0 ? "zero" : ""}`}>{formatMoney(v)}</td>)}
            <td className="num strong">{formatMoney(r.total)}</td>
          </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function EmployeeDetail({ budget, currency, data, onClose }: {
  budget: EmployeeBudget;
  currency: string;
  data: PageProps["data"];
  onClose: () => void;
}) {
  const [showBases, setShowBases] = useState(false);
  const e = budget.employee;
  const lineRow = (l: BudgetLine): Row => ({
    key: l.id,
    label: <><code>{l.code}</code> {l.name}</>,
    csvLabel: [],
    months: l.months,
    total: l.total,
  });
  const subtotal = (g: LineGroup): Row => ({
    key: `sub-${g}`,
    label: `Subtotal ${GROUP_LABEL[g].toLowerCase()}`,
    csvLabel: [],
    months: budget.totals[g],
    total: sumOf(budget.totals[g]),
    className: "subtotal-row",
  });
  const rows: Row[] = [];
  for (const g of ["concepto", "bono", "beneficio", "aporte"] as LineGroup[]) {
    const ls = budget.lines.filter((l) => l.group === g);
    if (!ls.length) continue;
    rows.push({ key: `h-${g}`, label: GROUP_LABEL[g], csvLabel: [], months: new Array(12).fill(0), total: 0, className: "group-row" });
    rows.push(...ls.map(lineRow), subtotal(g));
  }
  rows.push({ key: "total", label: "Gasto total", csvLabel: [], months: budget.totals.total, total: budget.grandTotal, className: "total-row" });

  const baseRows: Row[] = data.rules.map((r) => ({
    key: `base-${r.id}`,
    label: <>Base <code>{r.code}</code></>,
    csvLabel: [],
    months: budget.bases[r.id] ?? new Array(12).fill(0),
    total: sumOf(budget.bases[r.id]),
  }));

  return (
    <Modal wide title={`${e.code} · ${employeeName(e)}`} onClose={onClose}>
      <p className="muted">
        {budget.position ? `${budget.position.name} · ${budget.position.area} · ${budget.position.costCenter}` : "Sin puesto"} · Gasto anual{" "}
        <strong>{formatMoney(budget.grandTotal, currency)}</strong>
      </p>
      <div className="table-wrap">
        <MatrixTable rows={rows} />
      </div>
      <label className="check">
        <input type="checkbox" checked={showBases} onChange={(ev) => setShowBases(ev.target.checked)} />
        Mostrar bases de cálculo de cada regla
      </label>
      {showBases && (
        <div className="table-wrap">
          <MatrixTable rows={baseRows} />
        </div>
      )}
    </Modal>
  );
}
