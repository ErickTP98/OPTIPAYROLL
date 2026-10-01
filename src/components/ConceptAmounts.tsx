import type { Concept, ConceptAmount } from "../types";
import { isTargetBonus } from "../engine/calculate";
import { parseNumber } from "../utils";

/**
 * Editor de montos por concepto (usado en puestos y trabajadores): monto mensual para los
 * conceptos regulares y valor TARGET para los bonos target.
 */
export function ConceptAmounts({ concepts, value, onChange }: {
  concepts: Concept[];
  value: ConceptAmount[];
  onChange: (v: ConceptAmount[]) => void;
}) {
  if (concepts.length === 0) {
    return <p className="muted">Primero define los conceptos de nómina en la pestaña «Conceptos».</p>;
  }
  const amountOf = (id: string) => value.find((a) => a.conceptId === id)?.amount ?? 0;
  const set = (id: string, amount: number) => {
    const rest = value.filter((a) => a.conceptId !== id);
    onChange(amount ? [...rest, { conceptId: id, amount }] : rest);
  };
  const input = (c: Concept, placeholder: string) => (
    <input
      type="number"
      step="0.01"
      min="0"
      className="input-num"
      aria-label={`${c.code} ${isTargetBonus(c) ? "target" : "monto"}`}
      value={amountOf(c.id) || ""}
      placeholder={placeholder}
      onChange={(e) => set(c.id, parseNumber(e.target.value))}
    />
  );
  const regular = concepts.filter((c) => !isTargetBonus(c));
  const bonuses = concepts.filter(isTargetBonus);

  return (
    <>
      <table className="table compact">
        <thead>
          <tr>
            <th>Código</th>
            <th>Concepto</th>
            <th>Tipo</th>
            <th className="num">Monto mensual</th>
          </tr>
        </thead>
        <tbody>
          {regular.map((c) => (
            <tr key={c.id}>
              <td><code>{c.code}</code></td>
              <td>
                {c.name}
                {c.isBaseSalary && <span className="badge info">sueldo básico</span>}
              </td>
              <td className="muted">{c.type.replace("_", " ")}</td>
              <td className="num">{input(c, "0.00")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {bonuses.length > 0 && (
        <>
          <h3>Bonos target</h3>
          <p className="muted small">Asigna el valor TARGET de cada bono; deja vacío si no le corresponde.</p>
          <table className="table compact">
            <thead>
              <tr>
                <th>Código</th>
                <th>Bono</th>
                <th>Fórmula</th>
                <th className="num">Target</th>
              </tr>
            </thead>
            <tbody>
              {bonuses.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.code}</code></td>
                  <td>{c.name} <span className="tag tag-bono">{c.targetType}</span></td>
                  <td><code className="formula">{c.formula}</code></td>
                  <td className="num">{input(c, "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

/** Suma de montos mensuales fijos (excluye los valores TARGET de los bonos). */
export function fixedMonthlyAmount(concepts: Concept[], amounts: ConceptAmount[]): number {
  return amounts.reduce((s, a) => {
    const c = concepts.find((x) => x.id === a.conceptId);
    return c && !isTargetBonus(c) ? s + a.amount : s;
  }, 0);
}

/**
 * Montos por concepto para varios años a la vez (una columna por año), con la variación
 * respecto del año anterior y atajos para copiar del puesto o del año anterior.
 */
export function YearlyConceptAmounts({ concepts, years, valueOf, onChange, onCopyPosition, onCopyPrevious }: {
  concepts: Concept[];
  years: number[];
  valueOf: (year: number) => ConceptAmount[];
  onChange: (year: number, v: ConceptAmount[]) => void;
  onCopyPosition?: (year: number) => void;
  onCopyPrevious: (year: number, from: number) => void;
}) {
  if (concepts.length === 0) {
    return <p className="muted">Primero define los conceptos de nómina en la pestaña «Conceptos».</p>;
  }
  const amountOf = (year: number, id: string) => valueOf(year).find((a) => a.conceptId === id)?.amount ?? 0;
  const set = (year: number, id: string, amount: number) => {
    const rest = valueOf(year).filter((a) => a.conceptId !== id);
    onChange(year, amount ? [...rest, { conceptId: id, amount }] : rest);
  };
  const regular = concepts.filter((c) => !isTargetBonus(c));
  const bonuses = concepts.filter(isTargetBonus);

  const row = (c: Concept) => (
    <tr key={c.id}>
      <td>
        <code>{c.code}</code> {c.name}
        {c.isBaseSalary && <span className="badge info">sueldo básico</span>}
        {isTargetBonus(c) && <span className="tag tag-bono">{c.targetType}</span>}
      </td>
      {years.map((y, i) => {
        const v = amountOf(y, c.id);
        const prev = i > 0 ? amountOf(years[i - 1], c.id) : 0;
        const delta = prev && v && !isTargetBonus(c) ? (v / prev - 1) * 100 : null;
        return (
          <td key={y} className="num">
            <input
              type="number"
              step="0.01"
              min="0"
              className="input-num"
              aria-label={`${c.code} ${y}`}
              value={v || ""}
              placeholder={isTargetBonus(c) ? "—" : "0.00"}
              onChange={(e) => set(y, c.id, parseNumber(e.target.value))}
            />
            {delta !== null && Math.abs(delta) >= 0.005 && (
              <span className={`delta ${delta > 0 ? "up" : "down"}`}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}%</span>
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="table-wrap">
      <table className="table compact yearly">
        <thead>
          <tr>
            <th>Concepto</th>
            {years.map((y, i) => (
              <th key={y} className="num">
                <div className="year-head">{y}</div>
                <div className="year-actions">
                  {i > 0 && <button type="button" className="link small" onClick={() => onCopyPrevious(y, years[i - 1])}>Copiar {years[i - 1]}</button>}
                  {onCopyPosition && <button type="button" className="link small" onClick={() => onCopyPosition(y)}>Del puesto</button>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="section-row"><td colSpan={years.length + 1}>Monto mensual</td></tr>
          {regular.map(row)}
          {bonuses.length > 0 && (
            <>
              <tr className="section-row"><td colSpan={years.length + 1}>Bonos target · valor TARGET</td></tr>
              {bonuses.map(row)}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
