import { useState } from "react";
import { usePayrollData } from "./store";
import { SettingsPage } from "./pages/SettingsPage";
import { PositionsPage } from "./pages/PositionsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { ConceptsPage } from "./pages/ConceptsPage";
import { RulesPage } from "./pages/RulesPage";
import { IncreasesPage } from "./pages/IncreasesPage";
import { BudgetPage } from "./pages/BudgetPage";
import type { PageProps } from "./pages/types";
import { DialogHost } from "./components/dialogs";

const PAGES = [
  { id: "presupuesto", label: "Presupuesto", Component: BudgetPage },
  { id: "trabajadores", label: "Trabajadores", Component: EmployeesPage },
  { id: "puestos", label: "Puestos", Component: PositionsPage },
  { id: "conceptos", label: "Conceptos", Component: ConceptsPage },
  { id: "reglas", label: "Beneficios y aportes", Component: RulesPage },
  { id: "incrementos", label: "Incrementos", Component: IncreasesPage },
  { id: "empresa", label: "Empresa", Component: SettingsPage },
] as const satisfies readonly { id: string; label: string; Component: (p: PageProps) => unknown }[];

type PageId = (typeof PAGES)[number]["id"];

function initialPage(): PageId {
  const h = window.location.hash.slice(1);
  return (PAGES.find((p) => p.id === h)?.id ?? "presupuesto") as PageId;
}

export function App() {
  const [data, setData] = usePayrollData();
  const [page, setPage] = useState<PageId>(initialPage);
  const current = PAGES.find((p) => p.id === page)!;
  const go = (id: PageId) => {
    setPage(id);
    window.history.replaceState(null, "", `#${id}`);
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">OP</span>
          <div>
            <strong>OptiPayroll</strong>
            <span className="muted small">Presupuesto de nóminas</span>
          </div>
        </div>
        <label className="year-switch">
          <span className="muted small">Año</span>
          <select
            id="year-select"
            aria-label="Año del presupuesto"
            value={data.settings.year}
            onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, year: Number(e.target.value) } }))}
          >
            {[...data.settings.years].sort((x, y) => x - y).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <nav className="nav">
          {PAGES.map((p) => (
            <button key={p.id} className={p.id === page ? "active" : ""} onClick={() => go(p.id)}>
              {p.label}
            </button>
          ))}
        </nav>
        <div className="client">
          {data.settings.logo && (
            <img
              className="client-logo"
              src={data.settings.logo}
              alt={`Logo de ${data.settings.companyName || "la empresa"}`}
              title={data.settings.companyName}
            />
          )}
          {!data.settings.logo && data.settings.companyName && <span className="client-name">{data.settings.companyName}</span>}
        </div>
      </header>
      <main className="content">
        <current.Component data={data} setData={setData} />
      </main>
      <DialogHost />
    </div>
  );
}
