import { useMemo, useState } from "react";
import type { BaseMode, Rule, RuleKind, RuleMethod } from "../types";
import { compileFormula } from "../engine/formula";
import { RESERVED_VARIABLES } from "../engine/calculate";
import { allMonths, monthsLabel, parseNumber, uid } from "../utils";
import { CheckList, confirmDelete, EmptyState, Field, Modal, MonthPicker, PageHeader } from "../components/ui";
import type { PageProps } from "./types";

export const RULE_KINDS: Record<RuleKind, string> = { beneficio: "Beneficio social", aporte: "Aporte patronal" };
const BASE_MODES: Record<BaseMode, string> = {
  mes: "Base del mes (provisión mensual)",
  acumulado: "Suma de bases desde la última aplicación",
  promedio: "Promedio de bases desde la última aplicación",
};

const newRule = (kind: RuleKind): Rule => ({
  id: uid(), code: "", name: "", kind, method: "porcentaje", rate: 0, formula: "BASE * TASA",
  baseMode: "mes", months: allMonths(), baseMin: 0, baseMax: 0, includeRules: [],
});

export function RulesPage({ data, setData }: PageProps) {
  const [editing, setEditing] = useState<Rule | null>(null);

  const save = (rule: Rule, affected: string[]) => {
    setData((d) => ({
      ...d,
      rules: d.rules.some((x) => x.id === rule.id) ? d.rules.map((x) => (x.id === rule.id ? rule : x)) : [...d.rules, rule],
      concepts: d.concepts.map((c) => {
        const has = c.affects.includes(rule.id);
        const want = affected.includes(c.id);
        if (has === want) return c;
        return { ...c, affects: want ? [...c.affects, rule.id] : c.affects.filter((r) => r !== rule.id) };
      }),
    }));
    setEditing(null);
  };

  const remove = (r: Rule) => {
    if (!confirmDelete(`la regla «${r.name}»`)) return;
    setData((d) => ({
      ...d,
      rules: d.rules.filter((x) => x.id !== r.id).map((x) => ({ ...x, includeRules: x.includeRules.filter((id) => id !== r.id) })),
      concepts: d.concepts.map((c) => ({ ...c, affects: c.affects.filter((id) => id !== r.id) })),
    }));
  };

  const describe = (r: Rule) => (r.method === "porcentaje" ? `${r.rate}% de la base` : r.formula);
  const baseOf = (r: Rule) => {
    const parts = data.concepts.filter((c) => c.affects.includes(r.id)).map((c) => c.code);
    parts.push(...r.includeRules.map((id) => data.rules.find((x) => x.id === id)?.code ?? "?"));
    return parts.length ? parts.join(" + ") : "—";
  };

  const section = (kind: RuleKind, title: string) => {
    const rules = data.rules.filter((r) => r.kind === kind);
    return (
      <section className="card">
        <div className="card-title">
          <h3>{title}</h3>
          <button className="btn" onClick={() => setEditing(newRule(kind))}>+ Nueva regla</button>
        </div>
        {rules.length === 0 ? (
          <p className="muted">No hay reglas definidas.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Código</th><th>Nombre</th><th>Cálculo</th><th>Base (conceptos afectos)</th><th>Mínimo / tope</th><th>Meses</th><th /></tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.code}</code></td>
                    <td>{r.name}</td>
                    <td><code className="formula">{describe(r)}</code></td>
                    <td className="small">{baseOf(r)}</td>
                    <td className="small">{r.baseMin || "—"} / {r.baseMax || "—"}</td>
                    <td className="muted small">{monthsLabel(r.months)}{r.baseMode !== "mes" && ` (${r.baseMode})`}</td>
                    <td className="row-actions">
                      <button className="btn-link" onClick={() => setEditing(r)}>Editar</button>
                      <button className="btn-link danger" onClick={() => remove(r)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <PageHeader
        title="Beneficios sociales y aportes patronales"
        description="Reglas de cálculo. La base de cada regla es la suma de los conceptos marcados como afectos (más, opcionalmente, el resultado de otras reglas)."
      />
      {section("beneficio", "Beneficios sociales")}
      {section("aporte", "Aportes patronales")}
      {data.rules.length === 0 && <EmptyState>Crea tu primera regla con los botones «+ Nueva regla».</EmptyState>}
      {editing && <RuleModal rule={editing} data={data} onSave={save} onClose={() => setEditing(null)} />}
    </>
  );
}

function RuleModal({ rule, data, onSave, onClose }: {
  rule: Rule;
  data: PageProps["data"];
  onSave: (r: Rule, affected: string[]) => void;
  onClose: () => void;
}) {
  const [r, setR] = useState(rule);
  const [affected, setAffected] = useState(data.concepts.filter((c) => c.affects.includes(rule.id)).map((c) => c.id));
  const set = (patch: Partial<Rule>) => setR({ ...r, ...patch });
  const code = r.code.trim().toUpperCase();
  const otherRules = data.rules.filter((x) => x.id !== r.id);

  const knownVars = useMemo(
    () => new Set([...Object.keys(RESERVED_VARIABLES), ...data.concepts.map((c) => c.code.toUpperCase()), ...otherRules.map((x) => x.code.toUpperCase())]),
    [data.concepts, otherRules],
  );

  const formulaError = useMemo(() => {
    if (r.method !== "formula") return "";
    try {
      const f = compileFormula(r.formula);
      const unknown = f.variables.filter((v) => !knownVars.has(v));
      return unknown.length ? `Variables desconocidas: ${unknown.join(", ")}` : "";
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [r.method, r.formula, knownVars]);

  const duplicated = otherRules.some((x) => x.code.trim().toUpperCase() === code)
    || data.concepts.some((c) => c.code.trim().toUpperCase() === code)
    || code in RESERVED_VARIABLES;
  const valid = r.name.trim() !== "" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(code) && !duplicated && !formulaError;

  return (
    <Modal
      wide
      title={rule.name ? `Regla «${rule.name}»` : `Nueva regla · ${RULE_KINDS[r.kind]}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!valid} onClick={() => onSave({ ...r, code }, affected)}>Guardar</button>
        </>
      }
    >
      <div className="grid">
        <Field label="Código" hint={duplicated ? "Código en uso por otro concepto, regla o variable" : "Se puede usar en fórmulas de otras reglas"}>
          <input value={r.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Nombre"><input autoFocus value={r.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Tipo">
          <select value={r.kind} onChange={(e) => set({ kind: e.target.value as RuleKind })}>
            {Object.entries(RULE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Método de cálculo">
          <select value={r.method} onChange={(e) => set({ method: e.target.value as RuleMethod })}>
            <option value="porcentaje">Porcentaje de la base</option>
            <option value="formula">Fórmula personalizada</option>
          </select>
        </Field>
        <Field label="Porcentaje (%)" hint={r.method === "formula" ? "Disponible en la fórmula como TASA" : undefined}>
          <input type="number" step="0.01" value={r.rate} onChange={(e) => set({ rate: parseNumber(e.target.value) })} />
        </Field>
        <Field label="Modo de la base">
          <select value={r.baseMode} onChange={(e) => set({ baseMode: e.target.value as BaseMode })}>
            {Object.entries(BASE_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Base mínima" hint="0 = sin mínimo (p. ej. remuneración mínima)">
          <input type="number" step="0.01" value={r.baseMin} onChange={(e) => set({ baseMin: parseNumber(e.target.value) })} />
        </Field>
        <Field label="Tope de la base" hint="0 = sin tope">
          <input type="number" step="0.01" value={r.baseMax} onChange={(e) => set({ baseMax: parseNumber(e.target.value) })} />
        </Field>
        {r.method === "formula" && (
          <Field label="Fórmula" span={3} hint={formulaError || "Fórmula válida"}>
            <input className={`formula-input ${formulaError ? "invalid" : ""}`} value={r.formula} onChange={(e) => set({ formula: e.target.value })} />
          </Field>
        )}
      </div>

      {r.method === "formula" && (
        <details className="help">
          <summary>Ayuda de fórmulas</summary>
          <p>Operadores: <code>+ - * / ^ %</code>, comparaciones <code>&lt; &lt;= &gt; &gt;= = &lt;&gt;</code>. Funciones: <code>MIN, MAX, ROUND(x, dec), ABS, FLOOR, CEIL, IF(cond, si, no)</code>.</p>
          <ul>
            {Object.entries(RESERVED_VARIABLES).map(([k, v]) => <li key={k}><code>{k}</code>: {v}</li>)}
            <li>Códigos de conceptos (<code>{data.concepts.map((c) => c.code).join(", ") || "—"}</code>): monto del concepto en el mes.</li>
            <li>Códigos de otras reglas (<code>{otherRules.map((x) => x.code).join(", ") || "—"}</code>): resultado de esa regla en el mes.</li>
          </ul>
          <p>Ejemplos: <code>BASE / 6</code> (provisión de gratificación), <code>(BASE + GRATIF) / 12</code> (CTS), <code>MIN(BASE, 5000) * TASA</code>, <code>IF(MES = 12, BASE, 0)</code>.</p>
        </details>
      )}

      <h3>Meses en que se registra</h3>
      <p className="muted">
        Con «base del mes» se calcula en cada mes marcado. Con «suma» o «promedio», cada mes marcado toma las bases desde el mes siguiente a la
        aplicación anterior (p. ej. marca julio y diciembre para gratificaciones pagadas por semestre).
      </p>
      <MonthPicker value={r.months} onChange={(months) => set({ months })} />

      <div className="two-cols">
        <div>
          <h3>Conceptos afectos (base)</h3>
          <CheckList
            items={data.concepts}
            selected={affected}
            onChange={setAffected}
            getId={(c) => c.id}
            getLabel={(c) => <><code>{c.code}</code> {c.name}</>}
            empty="No hay conceptos definidos."
          />
        </div>
        <div>
          <h3>Sumar a la base el resultado de</h3>
          <CheckList
            items={otherRules}
            selected={r.includeRules}
            onChange={(includeRules) => set({ includeRules })}
            getId={(x) => x.id}
            getLabel={(x) => <><code>{x.code}</code> {x.name}</>}
            empty="No hay otras reglas."
          />
        </div>
      </div>
    </Modal>
  );
}
