import type { Concept, ConceptAmount } from "../types";
import { parseNumber } from "../utils";

/** Editor de montos mensuales por concepto (usado en puestos y trabajadores). */
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
  return (
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
        {concepts.map((c) => (
          <tr key={c.id}>
            <td><code>{c.code}</code></td>
            <td>{c.name}</td>
            <td className="muted">{c.type.replace("_", " ")}</td>
            <td className="num">
              <input
                type="number"
                step="0.01"
                min="0"
                className="input-num"
                value={amountOf(c.id) || ""}
                placeholder="0.00"
                onChange={(e) => set(c.id, parseNumber(e.target.value))}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
