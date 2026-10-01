import { useRef, useState } from "react";
import type { CustomField, CustomFieldType } from "../types";
import { emptyData, sampleData } from "../data/seed";
import { normalizeData } from "../store";
import { prepareLogo } from "../components/logo";
import { formatMoney, parseNumber, uid } from "../utils";
import { addBudgetYear, removeBudgetYear } from "../engine/years";
import { summarizeYears } from "../engine/calculate";
import { Field, Modal, PageHeader } from "../components/ui";
import { ask, confirmDelete, exportFile, notify } from "../components/dialogs";
import type { PageProps } from "./types";

const FIELD_TYPES: Record<CustomFieldType, string> = {
  text: "Texto",
  number: "Número",
  date: "Fecha",
  select: "Lista de opciones",
};

export function SettingsPage({ data, setData }: PageProps) {
  const [editing, setEditing] = useState<CustomField | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const s = data.settings;
  const setSettings = (patch: Partial<typeof s>) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

  const saveField = (f: CustomField) => {
    setData((d) => ({
      ...d,
      customFields: d.customFields.some((x) => x.id === f.id)
        ? d.customFields.map((x) => (x.id === f.id ? f : x))
        : [...d.customFields, f],
    }));
    setEditing(null);
  };

  const removeField = async (f: CustomField) => {
    if (!(await confirmDelete(`el campo «${f.label}»`))) return;
    setData((d) => ({
      ...d,
      customFields: d.customFields.filter((x) => x.id !== f.id),
      employees: d.employees.map((e) => {
        const { [f.id]: _removed, ...custom } = e.custom;
        return { ...e, custom };
      }),
    }));
  };

  const exportJson = () =>
    exportFile(
      `optipayroll-${s.year}.json`,
      JSON.stringify(data, null, 2),
      "application/json",
    );

  const importJson = async (file: File) => {
    try {
      const imported = normalizeData(JSON.parse(await file.text()));
      if (await ask("Se reemplazarán todos los datos actuales por los del archivo. ¿Continuar?")) setData(imported);
    } catch (err) {
      notify(`No se pudo importar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <>
      <PageHeader title="Empresa" description="Parámetros generales del presupuesto y campos adicionales para tus trabajadores." />

      <section className="card">
        <h3>Datos generales</h3>
        <div className="grid">
          <Field label="Nombre de la empresa">
            <input value={s.companyName} onChange={(e) => setSettings({ companyName: e.target.value })} />
          </Field>
          <Field label="Moneda (símbolo)">
            <input value={s.currency} onChange={(e) => setSettings({ currency: e.target.value })} />
          </Field>
        </div>
        <h3>Logo de la empresa</h3>
        <p className="muted small">Se muestra en la barra superior y en la pantalla de presupuesto. PNG, JPG, SVG o WebP; se ajusta automáticamente.</p>
        <div className="logo-editor">
          <div className="logo-preview">
            {s.logo ? <img src={s.logo} alt={`Logo de ${s.companyName || "la empresa"}`} /> : <span className="muted small">Sin logo</span>}
          </div>
          <div className="actions">
            <button className="btn primary" onClick={() => logoRef.current?.click()}>{s.logo ? "Cambiar logo" : "Subir logo"}</button>
            {s.logo && <button className="btn danger" onClick={() => setSettings({ logo: "" })}>Quitar logo</button>}
            <input
              ref={logoRef}
              id="logo-file"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  setSettings({ logo: await prepareLogo(f) });
                } catch (err) {
                  notify(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          </div>
        </div>
      </section>

      <BudgetYears data={data} setData={setData} />

      <section className="card">
        <div className="card-title">
          <h3>Campos personalizados del trabajador</h3>
          <button className="btn" onClick={() => setEditing({ id: uid(), label: "", type: "text", options: [] })}>
            + Nuevo campo
          </button>
        </div>
        <p className="muted">
          Además de los datos estándar (nombres, documento, contacto, fechas…), agrega cualquier dato que quieras
          registrar de tus trabajadores: banco, cuenta, sistema de pensiones, talla, nivel educativo, etc.
        </p>
        {data.customFields.length === 0 ? (
          <p className="muted">No hay campos personalizados.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Campo</th><th>Tipo</th><th>Opciones</th><th /></tr>
            </thead>
            <tbody>
              {data.customFields.map((f) => (
                <tr key={f.id}>
                  <td>{f.label}</td>
                  <td>{FIELD_TYPES[f.type]}</td>
                  <td className="muted">{f.type === "select" ? f.options.join(", ") : "—"}</td>
                  <td className="row-actions">
                    <button className="btn-link" onClick={() => setEditing(f)}>Editar</button>
                    <button className="btn-link danger" onClick={() => removeField(f)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Respaldo de datos</h3>
        <p className="muted">
          La información se guarda automáticamente en este navegador. Exporta un respaldo para guardarlo, compartirlo
          o abrirlo en otro equipo.
        </p>
        <div className="actions">
          <button className="btn" onClick={exportJson}>Exportar respaldo (JSON)</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar respaldo</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
          <button
            className="btn"
            onClick={async () => (await ask("¿Cargar los datos de ejemplo? Se reemplazarán los datos actuales.")) && setData(sampleData())}
          >
            Cargar ejemplo
          </button>
          <button
            className="btn danger"
            onClick={async () => (await ask("¿Borrar todos los datos y empezar de cero?")) && setData(emptyData())}
          >
            Empezar de cero
          </button>
        </div>
      </section>

      {editing && <CustomFieldModal field={editing} onSave={saveField} onClose={() => setEditing(null)} />}
    </>
  );
}

function CustomFieldModal({ field, onSave, onClose }: {
  field: CustomField;
  onSave: (f: CustomField) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState(field);
  const [options, setOptions] = useState(field.options.join("\n"));
  const valid = f.label.trim() !== "";
  return (
    <Modal
      title={field.label ? `Editar campo «${field.label}»` : "Nuevo campo"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn primary"
            disabled={!valid}
            onClick={() => onSave({ ...f, label: f.label.trim(), options: options.split("\n").map((o) => o.trim()).filter(Boolean) })}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="grid">
        <Field label="Nombre del campo">
          <input autoFocus value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        </Field>
        <Field label="Tipo">
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CustomFieldType })}>
            {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {f.type === "select" && (
          <Field label="Opciones (una por línea)" span={2}>
            <textarea rows={5} value={options} onChange={(e) => setOptions(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

function BudgetYears({ data, setData }: PageProps) {
  const years = [...data.settings.years].sort((a, b) => a - b);
  const last = years[years.length - 1];
  const [adding, setAdding] = useState(false);
  const [newYear, setNewYear] = useState(last + 1);
  const [from, setFrom] = useState<string>(String(last));
  const [adjust, setAdjust] = useState(0);
  const [copyIncreases, setCopyIncreases] = useState(true);
  const summary = summarizeYears(data);
  const cur = data.settings.currency;

  const startAdding = () => {
    setNewYear(last + 1);
    setFrom(String(last));
    setAdjust(0);
    setAdding(true);
  };

  const add = () => {
    setData((d) => addBudgetYear(d, newYear, { from: from ? Number(from) : undefined, adjustPercent: adjust, copyIncreases }));
    setAdding(false);
  };

  const remove = async (y: number) => {
    if (years.length === 1) {
      notify("Debe quedar al menos un año presupuestado.");
      return;
    }
    if (await confirmDelete(`el año ${y} con todos sus montos, meses e incrementos`)) setData((d) => removeBudgetYear(d, y));
  };

  const newYearValid = Number.isInteger(newYear) && newYear > 1900 && newYear < 2200 && !years.includes(newYear);

  return (
    <section className="card">
      <div className="card-title">
        <div>
          <h3>Años presupuestados</h3>
          <p className="muted small">
            Cada año guarda sus propios montos por concepto, meses laborados e incrementos. Conceptos, reglas y puestos son comunes a todos los años.
          </p>
        </div>
        <button className="btn" onClick={startAdding}>+ Agregar año</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Año</th><th className="num">Trabajadores</th><th className="num">Vacantes</th>
              <th className="num">Incrementos</th><th className="num">Gasto total</th><th />
            </tr>
          </thead>
          <tbody>
            {summary.map((y) => (
              <tr key={y.year}>
                <td>
                  <strong>{y.year}</strong>
                  {y.year === data.settings.year && <span className="badge info">seleccionado</span>}
                </td>
                <td className="num">{y.headcount}</td>
                <td className="num">{y.vacancies}</td>
                <td className="num">{data.increases.filter((i) => i.year === y.year).length}</td>
                <td className="num">{formatMoney(y.totals.total, cur)}</td>
                <td className="row-actions">
                  {y.year !== data.settings.year && (
                    <button className="btn-link" onClick={() => setData((d) => ({ ...d, settings: { ...d.settings, year: y.year } }))}>Seleccionar</button>
                  )}
                  <button className="btn-link danger" onClick={() => remove(y.year)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <Modal
          title="Agregar año"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button className="btn" onClick={() => setAdding(false)}>Cancelar</button>
              <button className="btn primary" disabled={!newYearValid} onClick={add}>Agregar {newYearValid ? newYear : ""}</button>
            </>
          }
        >
          <div className="grid">
            <Field label="Año" hint={years.includes(newYear) ? "Ese año ya existe" : undefined}>
              <input type="number" value={newYear} onChange={(e) => setNewYear(Math.trunc(parseNumber(e.target.value)))} />
            </Field>
            <Field label="Copiar datos de">
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">No copiar (año vacío)</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            {from && (
              <Field label="Ajuste a los montos (%)" hint="Opcional. No se aplica a los valores TARGET de los bonos.">
                <input type="number" step="0.01" value={adjust} onChange={(e) => setAdjust(parseNumber(e.target.value))} />
              </Field>
            )}
            {from && (
              <label className="field check-field span-3">
                <input type="checkbox" checked={copyIncreases} onChange={(e) => setCopyIncreases(e.target.checked)} />
                Copiar también los incrementos de {from}
              </label>
            )}
          </div>
          <p className="muted small">
            {from
              ? `Se copiarán los meses laborados y los montos de cada trabajador de ${from}${adjust ? ` con un ajuste de ${adjust}%` : ""}. Luego puedes editar cada monto en la ficha del trabajador.`
              : "El año se crea sin datos: ingresa los montos y meses de cada trabajador en su ficha."}
          </p>
        </Modal>
      )}
    </section>
  );
}
