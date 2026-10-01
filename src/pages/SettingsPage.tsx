import { useRef, useState } from "react";
import type { CustomField, CustomFieldType } from "../types";
import { emptyData, sampleData } from "../data/seed";
import { normalizeData } from "../store";
import { downloadFile, parseNumber, uid } from "../utils";
import { confirmDelete, Field, Modal, PageHeader } from "../components/ui";
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

  const removeField = (f: CustomField) => {
    if (!confirmDelete(`el campo «${f.label}»`)) return;
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
    downloadFile(
      `optipayroll-${s.year}.json`,
      JSON.stringify(data, null, 2),
      "application/json",
    );

  const importJson = async (file: File) => {
    try {
      const imported = normalizeData(JSON.parse(await file.text()));
      if (window.confirm("Se reemplazarán todos los datos actuales por los del archivo. ¿Continuar?")) setData(imported);
    } catch (err) {
      window.alert(`No se pudo importar: ${err instanceof Error ? err.message : String(err)}`);
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
          <Field label="Año del presupuesto">
            <input type="number" value={s.year} onChange={(e) => setSettings({ year: parseNumber(e.target.value) })} />
          </Field>
          <Field label="Moneda (símbolo)">
            <input value={s.currency} onChange={(e) => setSettings({ currency: e.target.value })} />
          </Field>
        </div>
      </section>

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
            onClick={() => window.confirm("¿Cargar los datos de ejemplo? Se reemplazarán los datos actuales.") && setData(sampleData())}
          >
            Cargar ejemplo
          </button>
          <button
            className="btn danger"
            onClick={() => window.confirm("¿Borrar todos los datos y empezar de cero?") && setData(emptyData())}
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
