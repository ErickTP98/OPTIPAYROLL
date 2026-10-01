import { useMemo, useState, type ReactNode } from "react";
import type { Concept, ConceptSegment, ConceptType, TargetBonusType } from "../types";
import { compileFormula } from "../engine/formula";
import { isTargetBonus, TARGET_BONUS_VARIABLES } from "../engine/calculate";
import { allMonths, monthsLabel, uid } from "../utils";
import { CheckList, EmptyState, Field, Modal, MonthPicker, PageHeader } from "../components/ui";
import { confirmDelete } from "../components/dialogs";
import type { PageProps } from "./types";

export const CONCEPT_TYPES: Record<ConceptType, string> = {
  remunerativo: "Remunerativo",
  no_remunerativo: "No remunerativo",
  otro: "Otro",
};

export const TARGET_TYPES: Record<TargetBonusType, { label: string; description: string; formula: string; hint: string }> = {
  STI: {
    label: "Bono STI",
    description: "Short-Term Incentive: incentivo de corto plazo (anual) ligado a objetivos del año.",
    formula: "SUELDO_BASICO * TARGET / 12",
    hint: "Ej.: TARGET = número de sueldos al año, provisionado mes a mes.",
  },
  LTI: {
    label: "Bono LTI",
    description: "Long-Term Incentive: incentivo de largo plazo (retención, planes plurianuales).",
    formula: "SUELDO_BASICO * TARGET / 100",
    hint: "Ej.: TARGET = % del sueldo básico mensual.",
  },
};

const newConcept = (segment: ConceptSegment = "regular", targetType: TargetBonusType = "STI"): Concept => ({
  id: uid(),
  code: segment === "bono_target" ? `BONO_${targetType}` : "",
  name: segment === "bono_target" ? TARGET_TYPES[targetType].label : "",
  type: "remunerativo",
  segment,
  targetType,
  formula: segment === "bono_target" ? TARGET_TYPES[targetType].formula : "",
  isBaseSalary: false,
  months: allMonths(),
  appliesIncrease: segment !== "bono_target",
  affects: [],
});

export function ConceptsPage({ data, setData }: PageProps) {
  const [editing, setEditing] = useState<Concept | null>(null);

  const save = (c: Concept) => {
    setData((d) => {
      let concepts = d.concepts.some((x) => x.id === c.id) ? d.concepts.map((x) => (x.id === c.id ? c : x)) : [...d.concepts, c];
      // Solo un concepto puede ser el sueldo básico.
      if (c.isBaseSalary) concepts = concepts.map((x) => (x.id !== c.id && x.isBaseSalary ? { ...x, isBaseSalary: false } : x));
      return { ...d, concepts };
    });
    setEditing(null);
  };

  const remove = async (c: Concept) => {
    if (!(await confirmDelete(`el concepto «${c.name}» (también se quitará de trabajadores y puestos)`))) return;
    setData((d) => ({
      ...d,
      concepts: d.concepts.filter((x) => x.id !== c.id),
      employees: d.employees.map((e) => ({
        ...e,
        years: Object.fromEntries(
          Object.entries(e.years).map(([y, yd]) => [y, { ...yd, concepts: yd.concepts.filter((a) => a.conceptId !== c.id) }]),
        ),
      })),
      positions: d.positions.map((p) => ({ ...p, concepts: p.concepts.filter((a) => a.conceptId !== c.id) })),
      increases: d.increases.map((i) => ({ ...i, conceptIds: i.conceptIds.filter((id) => id !== c.id) })),
    }));
  };

  const toggle = (c: Concept, patch: Partial<Concept>) =>
    setData((d) => ({ ...d, concepts: d.concepts.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }));

  const toggleAffect = (c: Concept, ruleId: string) =>
    toggle(c, { affects: c.affects.includes(ruleId) ? c.affects.filter((r) => r !== ruleId) : [...c.affects, ruleId] });

  const regular = data.concepts.filter((c) => !isTargetBonus(c));
  const bonuses = data.concepts.filter(isTargetBonus);
  const matrixProps = { data, onEdit: setEditing, onRemove: remove, onToggleAffect: toggleAffect };

  return (
    <>
      <PageHeader
        title="Conceptos de nómina"
        description="Ingresos que paga la empresa. Marca en qué beneficios sociales y aportes patronales integra la base de cálculo cada concepto."
        actions={<button className="btn primary" onClick={() => setEditing(newConcept())}>+ Nuevo concepto</button>}
      />

      <section className="card">
        <div className="card-title"><h3>Conceptos regulares</h3></div>
        {regular.length === 0 ? (
          <EmptyState>Aún no hay conceptos registrados.</EmptyState>
        ) : (
          <ConceptMatrix
            {...matrixProps}
            concepts={regular}
            extraHeaders={<><th rowSpan={2}>Tipo</th><th rowSpan={2}>Meses de pago</th><th rowSpan={2} className="center">Afecto a<br />incremento</th></>}
            extraCells={(c) => (
              <>
                <td>{CONCEPT_TYPES[c.type]}</td>
                <td className="muted small">{monthsLabel(c.months)}</td>
                <td className="center">
                  <input type="checkbox" aria-label={`${c.code} afecto a incremento`} checked={c.appliesIncrease} onChange={() => toggle(c, { appliesIncrease: !c.appliesIncrease })} />
                </td>
              </>
            )}
          />
        )}
      </section>

      <section className="card">
        <div className="card-title">
          <div>
            <h3>Bonos target</h3>
            <p className="muted small">
              Se calculan con una fórmula sobre el <strong>sueldo básico del mes</strong> (ya con incrementos) y el valor{" "}
              <code>TARGET</code> que asignas a cada trabajador o puesto.
              {!data.concepts.some((c) => c.isBaseSalary) && <span className="badge warn">Marca un concepto como sueldo básico</span>}
            </p>
          </div>
        </div>
        {(["STI", "LTI"] as TargetBonusType[]).map((t) => {
          const list = bonuses.filter((c) => c.targetType === t);
          return (
            <div key={t} className="bonus-group">
              <div className="card-title">
                <div>
                  <h4>{TARGET_TYPES[t].label}</h4>
                  <p className="muted small">{TARGET_TYPES[t].description}</p>
                </div>
                <button className="btn" onClick={() => setEditing(newConcept("bono_target", t))}>+ {TARGET_TYPES[t].label}</button>
              </div>
              {list.length === 0 ? (
                <p className="muted small">No hay bonos {t} definidos.</p>
              ) : (
                <ConceptMatrix
                  {...matrixProps}
                  concepts={list}
                  extraHeaders={<><th rowSpan={2}>Fórmula</th><th rowSpan={2}>Meses</th></>}
                  extraCells={(c) => (
                    <>
                      <td><code className="formula">{c.formula}</code></td>
                      <td className="muted small">{monthsLabel(c.months)}</td>
                    </>
                  )}
                />
              )}
            </div>
          );
        })}
      </section>

      {data.rules.length === 0 && (
        <p className="muted">Define reglas en «Beneficios y aportes» para ver aquí sus indicadores de afectación.</p>
      )}
      {editing && <ConceptModal concept={editing} data={data} onSave={save} onClose={() => setEditing(null)} />}
    </>
  );
}

function ConceptMatrix({ data, concepts, extraHeaders, extraCells, onEdit, onRemove, onToggleAffect }: {
  data: PageProps["data"];
  concepts: Concept[];
  extraHeaders: ReactNode;
  extraCells: (c: Concept) => ReactNode;
  onEdit: (c: Concept) => void;
  onRemove: (c: Concept) => void;
  onToggleAffect: (c: Concept, ruleId: string) => void;
}) {
  const beneficios = data.rules.filter((r) => r.kind === "beneficio");
  const aportes = data.rules.filter((r) => r.kind === "aporte");
  return (
    <div className="table-wrap">
      <table className="table matrix">
        <thead>
          <tr>
            <th rowSpan={2}>Código</th>
            <th rowSpan={2}>Concepto</th>
            {extraHeaders}
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
          {concepts.map((c) => (
            <tr key={c.id}>
              <td><code>{c.code}</code></td>
              <td>
                {c.name}
                {c.isBaseSalary && <span className="badge info">sueldo básico</span>}
              </td>
              {extraCells(c)}
              {[...beneficios, ...aportes].map((r) => (
                <td key={r.id} className={`center ${r.kind === "beneficio" ? "group-b" : "group-a"}`}>
                  <input
                    type="checkbox"
                    aria-label={`${c.code} afecto a ${r.code}`}
                    checked={c.affects.includes(r.id)}
                    onChange={() => onToggleAffect(c, r.id)}
                  />
                </td>
              ))}
              <td className="row-actions">
                <button className="btn-link" onClick={() => onEdit(c)}>Editar</button>
                <button className="btn-link danger" onClick={() => onRemove(c)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const isBonus = c.segment === "bono_target";
  const code = c.code.trim().toUpperCase();
  const duplicated = data.concepts.some((x) => x.id !== c.id && x.code.trim().toUpperCase() === code)
    || data.rules.some((r) => r.code.trim().toUpperCase() === code)
    || code in TARGET_BONUS_VARIABLES;
  const regularCodes = data.concepts.filter((x) => !isTargetBonus(x) && x.id !== c.id).map((x) => x.code.toUpperCase());

  const formulaError = useMemo(() => {
    if (!isBonus) return "";
    try {
      const f = compileFormula(c.formula);
      const unknown = f.variables.filter((v) => !(v in TARGET_BONUS_VARIABLES) && !regularCodes.includes(v));
      return unknown.length ? `Variables desconocidas: ${unknown.join(", ")}` : "";
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [isBonus, c.formula, regularCodes]);

  const valid = c.name.trim() !== "" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(code) && !duplicated && !formulaError;

  const setSegment = (segment: ConceptSegment) =>
    set(segment === "bono_target"
      ? { segment, isBaseSalary: false, appliesIncrease: false, formula: c.formula || TARGET_TYPES[c.targetType].formula }
      : { segment });

  const exists = data.concepts.some((x) => x.id === concept.id);
  const title = exists
    ? `${isBonus ? TARGET_TYPES[c.targetType].label : "Concepto"} «${concept.name}»`
    : isBonus ? `Nuevo ${TARGET_TYPES[c.targetType].label}` : "Nuevo concepto";

  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!valid} onClick={() => onSave({ ...c, code })}>Guardar</button>
        </>
      }
    >
      <div className="grid">
        <Field label="Código" hint={duplicated ? "Código en uso por otro concepto, regla o variable" : "Letras, números y _ (se usa en fórmulas)"}>
          <input value={c.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Nombre"><input autoFocus value={c.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Segmento">
          <select value={c.segment} onChange={(e) => setSegment(e.target.value as ConceptSegment)}>
            <option value="regular">Concepto regular (monto mensual)</option>
            <option value="bono_target">Bono target (fórmula)</option>
          </select>
        </Field>
        {isBonus && (
          <Field label="Tipo de bono target" hint={TARGET_TYPES[c.targetType].description}>
            <select value={c.targetType} onChange={(e) => set({ targetType: e.target.value as TargetBonusType })}>
              <option value="STI">Bono STI · corto plazo</option>
              <option value="LTI">Bono LTI · largo plazo</option>
            </select>
          </Field>
        )}
        <Field label="Tipo">
          <select value={c.type} onChange={(e) => set({ type: e.target.value as ConceptType })}>
            {Object.entries(CONCEPT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {!isBonus && (
          <>
            <label className="field check-field">
              <input type="checkbox" checked={c.appliesIncrease} onChange={(e) => set({ appliesIncrease: e.target.checked })} />
              Afecto a incrementos porcentuales
            </label>
            <label className="field check-field">
              <input type="checkbox" checked={c.isBaseSalary} onChange={(e) => set({ isBaseSalary: e.target.checked })} />
              Es el sueldo básico (base de los bonos target)
            </label>
          </>
        )}
        {isBonus && (
          <Field label="Fórmula del monto mensual" span={3} hint={formulaError || `Fórmula válida. ${TARGET_TYPES[c.targetType].hint}`}>
            <input className={`formula-input ${formulaError ? "invalid" : ""}`} value={c.formula} onChange={(e) => set({ formula: e.target.value })} />
          </Field>
        )}
      </div>

      {isBonus && (
        <details className="help" open>
          <summary>Variables y ejemplos</summary>
          <ul>
            {Object.entries(TARGET_BONUS_VARIABLES).map(([k, v]) => <li key={k}><code>{k}</code>: {v}</li>)}
            <li>Códigos de conceptos regulares (<code>{regularCodes.join(", ") || "—"}</code>): monto del concepto en el mes.</li>
          </ul>
          <p>
            <code>SUELDO_BASICO * TARGET / 12</code> provisiona cada mes un bono de TARGET sueldos al año ·{" "}
            <code>SUELDO_BASICO * TARGET / 100</code> paga cada mes el TARGET % del sueldo ·{" "}
            <code>IF(MES = 3, SUELDO_BASICO * TARGET, 0)</code> paga TARGET sueldos solo en marzo.
          </p>
          <p className="muted small">
            El bono se calcula solo para quienes tienen un TARGET asignado (en el trabajador o copiado del puesto) y en los meses que laboran.
            No se le aplican incrementos propios: ya sigue los incrementos del sueldo básico.
          </p>
        </details>
      )}

      <h3>Meses en que se {isBonus ? "registra" : "paga"}</h3>
      <p className="muted">
        {isBonus
          ? "Marca todos los meses para provisionar el bono, o solo el mes de pago."
          : "Ej.: un bono anual solo en marzo. El monto se paga en el mes si además el trabajador labora ese mes."}
      </p>
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
