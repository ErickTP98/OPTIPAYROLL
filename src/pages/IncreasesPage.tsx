import { useState } from "react";
import type { Increase, IncreaseScope } from "../types";
import { MONTH_NAMES, parseNumber, uid } from "../utils";
import { CheckList, confirmDelete, EmptyState, Field, Modal, PageHeader } from "../components/ui";
import { employeeName } from "./EmployeesPage";
import type { PageProps } from "./types";

const SCOPES: Record<IncreaseScope, string> = {
  todos: "Todos los trabajadores",
  area: "Por área",
  puesto: "Por puesto",
  trabajador: "Por trabajador",
};

const newIncrease = (): Increase => ({
  id: uid(), name: "", month: 0, percent: 0, scope: "todos", targets: [], conceptIds: [],
});

export function IncreasesPage({ data, setData }: PageProps) {
  const [editing, setEditing] = useState<Increase | null>(null);

  const save = (i: Increase) => {
    setData((d) => ({
      ...d,
      increases: d.increases.some((x) => x.id === i.id) ? d.increases.map((x) => (x.id === i.id ? i : x)) : [...d.increases, i],
    }));
    setEditing(null);
  };

  const remove = (i: Increase) => {
    if (confirmDelete(`el incremento «${i.name}»`)) setData((d) => ({ ...d, increases: d.increases.filter((x) => x.id !== i.id) }));
  };

  const targetLabel = (i: Increase) => {
    if (i.scope === "todos") return "Todos";
    const names = i.targets.map((t) => {
      if (i.scope === "area") return t;
      if (i.scope === "puesto") return data.positions.find((p) => p.id === t)?.name ?? "?";
      const e = data.employees.find((x) => x.id === t);
      return e ? `${e.code} ${employeeName(e)}` : "?";
    });
    return `${SCOPES[i.scope]}: ${names.join(", ") || "ninguno"}`;
  };

  const conceptsLabel = (i: Increase) =>
    i.conceptIds.length
      ? i.conceptIds.map((id) => data.concepts.find((c) => c.id === id)?.code ?? "?").join(", ")
      : "Conceptos afectos a incremento";

  const sorted = [...data.increases].sort((a, b) => a.month - b.month);

  return (
    <>
      <PageHeader
        title="Incrementos"
        description="Aumentos porcentuales a partir de un mes. Se acumulan (compuestos) y recalculan automáticamente beneficios y aportes."
        actions={<button className="btn primary" onClick={() => setEditing(newIncrease())}>+ Nuevo incremento</button>}
      />
      {sorted.length === 0 ? (
        <EmptyState>No hay incrementos programados.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Desde</th><th>Descripción</th><th className="num">%</th><th>Alcance</th><th>Conceptos</th><th /></tr>
            </thead>
            <tbody>
              {sorted.map((i) => (
                <tr key={i.id}>
                  <td>{MONTH_NAMES[i.month]}</td>
                  <td>{i.name}</td>
                  <td className="num">{i.percent}%</td>
                  <td className="small">{targetLabel(i)}</td>
                  <td className="small">{conceptsLabel(i)}</td>
                  <td className="row-actions">
                    <button className="btn-link" onClick={() => setEditing(i)}>Editar</button>
                    <button className="btn-link danger" onClick={() => remove(i)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <IncreaseModal increase={editing} data={data} onSave={save} onClose={() => setEditing(null)} />}
    </>
  );
}

function IncreaseModal({ increase, data, onSave, onClose }: {
  increase: Increase;
  data: PageProps["data"];
  onSave: (i: Increase) => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(increase);
  const set = (patch: Partial<Increase>) => setI({ ...i, ...patch });
  const areas = [...new Set(data.positions.map((p) => p.area).filter(Boolean))].sort();
  const valid = i.name.trim() !== "" && i.percent !== 0 && (i.scope === "todos" || i.targets.length > 0);

  return (
    <Modal
      wide
      title={increase.name ? `Incremento «${increase.name}»` : "Nuevo incremento"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!valid} onClick={() => onSave({ ...i, targets: i.scope === "todos" ? [] : i.targets })}>
            Guardar
          </button>
        </>
      }
    >
      <div className="grid">
        <Field label="Descripción"><input autoFocus value={i.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Rige desde">
          <select value={i.month} onChange={(e) => set({ month: Number(e.target.value) })}>
            {MONTH_NAMES.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
          </select>
        </Field>
        <Field label="Porcentaje (%)" hint="Usa un valor negativo para una reducción">
          <input type="number" step="0.01" value={i.percent} onChange={(e) => set({ percent: parseNumber(e.target.value) })} />
        </Field>
        <Field label="Alcance">
          <select value={i.scope} onChange={(e) => set({ scope: e.target.value as IncreaseScope, targets: [] })}>
            {Object.entries(SCOPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>

      <div className="two-cols">
        <div>
          {i.scope === "area" && (
            <>
              <h3>Áreas</h3>
              <CheckList items={areas} selected={i.targets} onChange={(targets) => set({ targets })} getId={(a) => a} getLabel={(a) => a} empty="No hay áreas definidas en los puestos." />
            </>
          )}
          {i.scope === "puesto" && (
            <>
              <h3>Puestos</h3>
              <CheckList items={data.positions} selected={i.targets} onChange={(targets) => set({ targets })} getId={(p) => p.id} getLabel={(p) => `${p.code} · ${p.name}`} />
            </>
          )}
          {i.scope === "trabajador" && (
            <>
              <h3>Trabajadores</h3>
              <CheckList items={data.employees} selected={i.targets} onChange={(targets) => set({ targets })} getId={(e) => e.id} getLabel={(e) => `${e.code} · ${employeeName(e)}`} />
            </>
          )}
          {i.scope === "todos" && <p className="muted">Se aplica a todos los trabajadores y vacantes.</p>}
        </div>
        <div>
          <h3>Conceptos</h3>
          <p className="muted small">Si no marcas ninguno, aplica a los conceptos marcados como «afecto a incremento».</p>
          <CheckList items={data.concepts} selected={i.conceptIds} onChange={(conceptIds) => set({ conceptIds })} getId={(c) => c.id} getLabel={(c) => <><code>{c.code}</code> {c.name}</>} />
        </div>
      </div>
    </Modal>
  );
}
