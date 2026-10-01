import { useState } from "react";
import type { Position } from "../types";
import { formatMoney, uid } from "../utils";
import { ConceptAmounts, fixedMonthlyAmount } from "../components/ConceptAmounts";
import { EmptyState, Field, Modal, PageHeader } from "../components/ui";
import { confirmDelete, notify } from "../components/dialogs";
import type { PageProps } from "./types";

const newPosition = (): Position => ({
  id: uid(), code: "", name: "", area: "", costCenter: "", category: "", notes: "", concepts: [],
});

export function PositionsPage({ data, setData }: PageProps) {
  const [editing, setEditing] = useState<Position | null>(null);
  const cur = data.settings.currency;

  const save = (p: Position) => {
    setData((d) => ({
      ...d,
      positions: d.positions.some((x) => x.id === p.id) ? d.positions.map((x) => (x.id === p.id ? p : x)) : [...d.positions, p],
    }));
    setEditing(null);
  };

  const remove = async (p: Position) => {
    const used = data.employees.filter((e) => e.positionId === p.id).length;
    if (used > 0) {
      notify(`El puesto tiene ${used} trabajador(es) o vacante(s) asignados. Reasígnalos antes de eliminarlo.`);
      return;
    }
    if (await confirmDelete(`el puesto «${p.name}»`)) setData((d) => ({ ...d, positions: d.positions.filter((x) => x.id !== p.id) }));
  };

  return (
    <>
      <PageHeader
        title="Puestos de trabajo"
        description="Define los puestos, su área y centro de costo, y los montos referenciales de cada concepto."
        actions={<button className="btn primary" onClick={() => setEditing(newPosition())}>+ Nuevo puesto</button>}
      />
      {data.positions.length === 0 ? (
        <EmptyState>Aún no hay puestos registrados.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th><th>Puesto</th><th>Área</th><th>Centro de costo</th><th>Categoría</th>
                <th className="num">Ocupantes</th><th className="num">Monto ref. mensual</th><th />
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p) => {
                const people = data.employees.filter((e) => e.positionId === p.id);
                return (
                  <tr key={p.id}>
                    <td><code>{p.code}</code></td>
                    <td>{p.name}</td>
                    <td>{p.area}</td>
                    <td>{p.costCenter}</td>
                    <td>{p.category}</td>
                    <td className="num">
                      {people.filter((e) => !e.isVacancy).length}
                      {people.some((e) => e.isVacancy) && <span className="badge warn">+{people.filter((e) => e.isVacancy).length} vac.</span>}
                    </td>
                    <td className="num">{formatMoney(fixedMonthlyAmount(data.concepts, p.concepts), cur)}</td>
                    <td className="row-actions">
                      <button className="btn-link" onClick={() => setEditing(p)}>Editar</button>
                      <button className="btn-link danger" onClick={() => remove(p)}>Eliminar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <PositionModal position={editing} data={data} onSave={save} onClose={() => setEditing(null)} />}
    </>
  );
}

function PositionModal({ position, data, onSave, onClose }: {
  position: Position;
  data: PageProps["data"];
  onSave: (p: Position) => void;
  onClose: () => void;
}) {
  const [p, setP] = useState(position);
  const set = (patch: Partial<Position>) => setP({ ...p, ...patch });
  const areas = [...new Set(data.positions.map((x) => x.area).filter(Boolean))];
  const valid = p.name.trim() !== "";
  return (
    <Modal
      wide
      title={position.name ? `Puesto «${position.name}»` : "Nuevo puesto"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!valid} onClick={() => onSave(p)}>Guardar</button>
        </>
      }
    >
      <div className="grid">
        <Field label="Código"><input value={p.code} onChange={(e) => set({ code: e.target.value })} /></Field>
        <Field label="Nombre del puesto"><input autoFocus value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Área / Departamento">
          <input list="areas" value={p.area} onChange={(e) => set({ area: e.target.value })} />
          <datalist id="areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
        </Field>
        <Field label="Centro de costo"><input value={p.costCenter} onChange={(e) => set({ costCenter: e.target.value })} /></Field>
        <Field label="Categoría"><input value={p.category} onChange={(e) => set({ category: e.target.value })} /></Field>
        <Field label="Observaciones" span={3}>
          <textarea rows={2} value={p.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <h3>Montos referenciales del puesto</h3>
      <p className="muted">Sirven como plantilla: al asignar el puesto a un trabajador o vacante puedes copiarlos.</p>
      <ConceptAmounts concepts={data.concepts} value={p.concepts} onChange={(concepts) => set({ concepts })} />
    </Modal>
  );
}
