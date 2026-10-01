import { useEffect, type ReactNode } from "react";
import { MONTH_SHORT } from "../utils";

export function Modal({ title, onClose, children, footer, wide }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, span }: { label: string; children: ReactNode; hint?: string; span?: 2 | 3 }) {
  return (
    <label className={`field ${span ? `span-${span}` : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function MonthPicker({ value, onChange }: { value: boolean[]; onChange: (v: boolean[]) => void }) {
  const toggle = (i: number) => onChange(value.map((v, j) => (j === i ? !v : v)));
  return (
    <div className="month-picker">
      {MONTH_SHORT.map((m, i) => (
        <button type="button" key={m} className={`month ${value[i] ? "on" : ""}`} onClick={() => toggle(i)}>
          {m}
        </button>
      ))}
      <span className="month-actions">
        <button type="button" className="link" onClick={() => onChange(new Array(12).fill(true))}>Todos</button>
        <button type="button" className="link" onClick={() => onChange(new Array(12).fill(false))}>Ninguno</button>
      </span>
    </div>
  );
}

export function CheckList<T>({ items, selected, onChange, getId, getLabel, empty }: {
  items: T[];
  selected: string[];
  onChange: (ids: string[]) => void;
  getId: (t: T) => string;
  getLabel: (t: T) => ReactNode;
  empty?: string;
}) {
  if (items.length === 0) return <p className="muted">{empty ?? "No hay elementos."}</p>;
  return (
    <div className="check-list">
      {items.map((it) => {
        const id = getId(it);
        const on = selected.includes(id);
        return (
          <label key={id} className="check">
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange(on ? selected.filter((s) => s !== id) : [...selected, id])}
            />
            {getLabel(it)}
          </label>
        );
      })}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
