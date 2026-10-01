import { useState } from "react";
import type { Concept, ConceptType } from "../types";
import { allMonths, monthsLabel, uid } from "../utils";
import { CheckList, confirmDelete, EmptyState, Field, Modal, MonthPicker, PageHeader } from "../components/ui";
import type { PageProps } from "./types";

export const CONCEPT_TYPES: Record<ConceptType, string> = {
  remunerativo: "Remunerativo",
  no_remunerativo: "No remunerativo",
  otro: "Otro",
};

const newConcept = (): Concept => ({
  id: uid(), code: "", name: "", type: "remunerativo", months: allMonths(), appliesIncrease: true, affects: [],
});

export function ConceptsPage({ data, setData }: PageProps) {
  const [editing, setEditing] = useState<Concept | null>(null);

  const save = (c: Concept) => {
    setData((d) => ({
      ...d,
      concepts: d.concepts.some((x) => x.id === c.id) ? d.concepts.map((x) => (x.id === c.id ? c : x)) : [...d.concepts, c],
    }));
    setEditing(null);
  };

  const remove = (c: Concept) => {
    if (!confirmDelete(`el concepto «${c.name}» (también se quitará de trabajadores y puestos)`)) return;
    setData((d) => ({
      ...d,
      concepts: d.concepts.filter((x) => x.id !== c.id),
      employees: d.employees.map((e) => ({ ...e, concepts: e.concepts.filter((a) => a.conceptId !== c.id) })),
      positions: d.positions.map((p) => ({ ...p, concepts: p.concepts.filter((a) => a.conceptId !== c.id) })),
      increases: d.increases.map((i) => ({ ...i, conceptIds: i.conceptIds.filter((id) => id !== c.id) })),
    }));
  };

  const toggle = (c: Concept, patch: Partial<Concept>) =>
    setData((d) => ({ ...d, concepts: d.concepts.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }));

  const toggleAffect = (c: Concept, ruleId: string) =>
    toggle(c, { affects: c.affects.includes(ruleId) ? c.affects.filter((r) => r !== ruleId) : [...c.affects, ruleId] });

  const beneficios = data.rules.filter((r) => r.kind === "beneficio");
  const aportes = data.rules.filter((r) => r.kind === "aporte");

  return (
    <>
      <PageHeader
        title="Conceptos de nómina"
        description="Ingresos que paga la empresa. Marca en qué beneficios sociales y aportes patronales integra la base de cálculo cada concepto."
        actions={<button className="btn primary" onClick={() => setEditing(newConcept())}>+ Nuevo concepto</button>}
      />
      {data.concepts.length === 0 ? (
        <EmptyState>Aún no hay conceptos registrados.</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table matrix">
            <thead>
              <tr>
                <th rowSpan={2}>Código</th>
                <th rowSpan={2}>Concepto</th>
                <th rowSpan={2}>Tipo</th>
                <th rowSpan={2}>Meses de pago</th>
                <th rowSpan={2} className="center">Afecto a<br />incremento</th>
                {beneficios.length > 0 && <th colSpan={beneficios.length} className="center group-b">Beneficios sociales</th>}
                {aportes.length > 0 && <th colSpan={aportes.length} className="center group-a">Aportes patronales</th>}
                <th rowSpan={2} />
              </tr>
              <tr>
                {[...beneficios, ...aportes].map((r) => (
                  <th key={r.id} className={`center small ${r.kind === "beneficio" ? "group-b" : "group-a"}`} title={r.name}>{r.code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.concepts.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.code}</code></td>
                  <td>{c.name}</td>
                  <td>{CONCEPT_TYPES[c.type]}</td>
                  <td className="muted small">{monthsLabel(c.months)}</td>
                  <td className="center">
                    <input type="checkbox" checked={c.appliesIncrease} onChange={() => toggle(c, { appliesIncrease: !c.appliesIncrease })} />
                  </td>
                  {[...beneficios, ...aportes].map((r) => (
                    <td key={r.id} className={`center ${r.kind === "beneficio" ? "group-b" : "group-a"}`}>
                      <input
                        type="checkbox"
                        aria-label={`${c.code} afecto a ${r.code}`}
                        checked={c.affects.includes(r.id)}
                        onChange={() => toggleAffect(c, r.id)}
                      />
                    </td>
                  ))}
                  <td className="row-actions">
                    <button className="btn-link" onClick={() => setEditing(c)}>Editar</button>
                    <button className="btn-link danger" onClick={() => remove(c)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rules.length === 0 && (
            <p className="muted">Define reglas en «Beneficios y aportes» para ver aquí sus indicadores de afectación.</p>
          )}
        </div>
      )}
      {editing && <ConceptModal concept={editing} data={data} onSave={save} onClose={() => setEditing(null)} />}
    </>
  );
}

function ConceptModal({ concept, data, onSave, onClose }: {
  concept: Concept;
  data: PageProps["data"];
  onSave: (c: Concept) => void;
  onClose: () => void;
}) {
  const [c, setC] = useState(concept);
  const set = (patch: Partial<Concept>) => setC({ ...c, ...patch });
  const code = c.code.trim().toUpperCase();
  const duplicated = data.concepts.some((x) => x.id !== c.id && x.code.trim().toUpperCase() === code)
    || data.rules.some((r) => r.code.trim().toUpperCase() === code);
  const valid = c.name.trim() !== "" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(c.code.trim()) && !duplicated;
  return (
    <Modal
      wide
      title={concept.name ? `Concepto «${concept.name}»` : "Nuevo concepto"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!valid} onClick={() => onSave({ ...c, code: code })}>Guardar</button>
        </>
      }
    >
      <div className="grid">
        <Field label="Código" hint={duplicated ? "Ya existe un concepto o regla con este código" : "Letras, números y _ (se usa en fórmulas)"}>
          <input value={c.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Nombre"><input autoFocus value={c.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Tipo">
          <select value={c.type} onChange={(e) => set({ type: e.target.value as ConceptType })}>
            {Object.entries(CONCEPT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <label className="field check-field span-3">
          <input type="checkbox" checked={c.appliesIncrease} onChange={(e) => set({ appliesIncrease: e.target.checked })} />
          Afecto a incrementos porcentuales
        </label>
      </div>
      <h3>Meses en que se paga</h3>
      <p className="muted">Ej.: un bono anual solo en marzo. El monto se paga en el mes si además el trabajador labora ese mes.</p>
      <MonthPicker value={c.months} onChange={(months) => set({ months })} />
      <div className="two-cols">
        <div>
          <h3>Afecto a beneficios sociales</h3>
          <CheckList
            items={data.rules.filter((r) => r.kind === "beneficio")}
            selected={c.affects}
            onChange={(affects) => set({ affects })}
            getId={(r) => r.id}
            getLabel={(r) => <><code>{r.code}</code> {r.name}</>}
            empty="No hay beneficios sociales definidos."
          />
        </div>
        <div>
          <h3>Afecto a aportes patronales</h3>
          <CheckList
            items={data.rules.filter((r) => r.kind === "aporte")}
            selected={c.affects}
            onChange={(affects) => set({ affects })}
            getId={(r) => r.id}
            getLabel={(r) => <><code>{r.code}</code> {r.name}</>}
            empty="No hay aportes patronales definidos."
          />
        </div>
      </div>
    </Modal>
  );
}
