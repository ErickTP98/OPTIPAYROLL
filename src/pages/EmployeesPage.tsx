import { Fragment, useMemo, useState } from "react";
import type { CustomField, Employee, EmployeeYear } from "../types";
import { allMonths, employeeYear, formatMoney, monthsLabel, uid, withEmployeeYear } from "../utils";
import { fixedMonthlyAmount, YearlyConceptAmounts } from "../components/ConceptAmounts";
import { EmptyState, Field, Modal, MonthPicker, PageHeader } from "../components/ui";
import { ask, confirmDelete, notify } from "../components/dialogs";
import { exportExcel } from "../export/save";
import type { PageProps } from "./types";

const newEmployee = (n: number, year: number): Employee => ({
  id: uid(), code: `T${String(n).padStart(3, "0")}`, isVacancy: false, firstName: "", lastName: "",
  docType: "DNI", docNumber: "", birthDate: "", gender: "", email: "", phone: "", address: "",
  hireDate: "", contractType: "", positionId: "", custom: {},
  years: { [year]: { months: allMonths(), concepts: [] } },
});

export const employeeName = (e: Employee) =>
  e.isVacancy ? "Vacante" : [e.firstName, e.lastName].filter(Boolean).join(" ") || "(sin nombre)";

export function EmployeesPage({ data, setData }: PageProps) {
  const [editing, setEditing] = useState<Employee | null>(null);
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const cur = data.settings.currency;
  const year = data.settings.year;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.employees.filter((e) => {
      if (positionFilter && e.positionId !== positionFilter) return false;
      if (!q) return true;
      return [e.code, e.firstName, e.lastName, e.docNumber, e.email].join(" ").toLowerCase().includes(q);
    });
  }, [data.employees, query, positionFilter]);

  const save = (e: Employee) => {
    setData((d) => ({
      ...d,
      employees: d.employees.some((x) => x.id === e.id) ? d.employees.map((x) => (x.id === e.id ? e : x)) : [...d.employees, e],
    }));
    setEditing(null);
  };

  const remove = async (e: Employee) => {
    if (!(await confirmDelete(`a ${employeeName(e)} (${e.code})`))) return;
    setData((d) => ({
      ...d,
      employees: d.employees.filter((x) => x.id !== e.id),
      increases: d.increases.map((i) => ({ ...i, targets: i.scope === "trabajador" ? i.targets.filter((t) => t !== e.id) : i.targets })),
    }));
  };

  const duplicate = (e: Employee) =>
    setEditing({ ...structuredClone(e), id: uid(), code: `${e.code}-copia`, firstName: e.isVacancy ? "" : e.firstName });

  return (
    <>
      <PageHeader
        title="Trabajadores y vacantes"
        description="Datos personales, puesto asignado y, por cada año, los meses que labora y los montos de cada concepto."
        actions={
          <>
            <button className="btn" onClick={() => exportExcel(data)}>Exportar a Excel</button>
            <button className="btn" onClick={() => setEditing({ ...newEmployee(data.employees.length + 1, year), isVacancy: true, code: `V${String(data.employees.length + 1).padStart(3, "0")}` })}>
              + Vacante
            </button>
            <button className="btn primary" onClick={() => setEditing(newEmployee(data.employees.length + 1, year))}>+ Nuevo trabajador</button>
          </>
        }
      />
      <div className="toolbar">
        <input className="search" placeholder="Buscar por código, nombre, documento…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
          <option value="">Todos los puestos</option>
          {data.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState>{data.employees.length ? "No hay coincidencias." : "Aún no hay trabajadores registrados."}</EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th><th>Nombre</th><th>Documento</th><th>Puesto</th><th>Área</th>
                <th>Meses que labora ({year})</th><th className="num">Monto mensual ({year})</th><th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const pos = data.positions.find((p) => p.id === e.positionId);
                return (
                  <tr key={e.id}>
                    <td><code>{e.code}</code></td>
                    <td>
                      {employeeName(e)}
                      {e.isVacancy && <span className="badge warn">vacante</span>}
                    </td>
                    <td>{e.docNumber ? `${e.docType} ${e.docNumber}` : "—"}</td>
                    <td>{pos?.name ?? <span className="badge danger">sin puesto</span>}</td>
                    <td>{pos?.area}</td>
                    <td className="muted small">
                      {employeeYear(e, year).months.some(Boolean) ? monthsLabel(employeeYear(e, year).months) : <span className="badge warn">no labora en {year}</span>}
                    </td>
                    <td className="num">{formatMoney(fixedMonthlyAmount(data.concepts, employeeYear(e, year).concepts), cur)}</td>
                    <td className="row-actions">
                      <button className="btn-link" onClick={() => setEditing(e)}>Editar</button>
                      <button className="btn-link" onClick={() => duplicate(e)}>Duplicar</button>
                      <button className="btn-link danger" onClick={() => remove(e)}>Eliminar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <EmployeeModal employee={editing} data={data} onSave={save} onClose={() => setEditing(null)} />}
    </>
  );
}

function CustomInput({ field, value, onChange }: { field: CustomField; value: string; onChange: (v: string) => void }) {
  if (field.type === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return <input type={field.type} value={value} onChange={(e) => onChange(e.target.value)} />;
}

type Tab = "personal" | "puesto" | "conceptos";

function EmployeeModal({ employee, data, onSave, onClose }: {
  employee: Employee;
  data: PageProps["data"];
  onSave: (e: Employee) => void;
  onClose: () => void;
}) {
  const [e, setE] = useState(employee);
  const [tab, setTab] = useState<Tab>(employee.isVacancy ? "puesto" : "personal");
  const set = (patch: Partial<Employee>) => setE({ ...e, ...patch });
  const position = data.positions.find((p) => p.id === e.positionId);
  const valid = e.code.trim() !== "" && e.positionId !== "" && (e.isVacancy || e.firstName.trim() !== "" || e.lastName.trim() !== "");

  const years = [...data.settings.years].sort((a, b) => a - b);
  const setYear = (year: number, patch: Partial<EmployeeYear>) => setE((cur) => withEmployeeYear(cur, year, patch));

  const copyFromPosition = async (year: number) => {
    if (!position) {
      notify("Primero asigna un puesto en la pestaña «Puesto y meses».");
      return;
    }
    if (employeeYear(e, year).concepts.length && !(await ask(`Se reemplazarán los montos de ${year} por los del puesto. ¿Continuar?`))) return;
    setYear(year, { concepts: position.concepts.map((c) => ({ ...c })) });
  };

  const copyFromYear = async (year: number, from: number) => {
    if (employeeYear(e, year).concepts.length && !(await ask(`Se reemplazarán los montos de ${year} por los de ${from}. ¿Continuar?`))) return;
    const src = employeeYear(e, from);
    const target = employeeYear(e, year);
    setYear(year, {
      concepts: src.concepts.map((c) => ({ ...c })),
      // Si aún no tiene meses en el año destino, también se copian los meses.
      months: target.months.some(Boolean) ? target.months : [...src.months],
    });
  };

  return (
    <Modal
      wide
      title={employee.firstName || employee.lastName || employee.isVacancy ? `${employeeName(employee)} · ${employee.code}` : "Nuevo trabajador"}
      onClose={onClose}
      footer={
        <>
          {!valid && <span className="muted small">Completa código, nombre (o marca como vacante) y puesto.</span>}
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!valid} onClick={() => onSave(e)}>Guardar</button>
        </>
      }
    >
      <div className="tabs-inline">
        <button className={tab === "personal" ? "active" : ""} onClick={() => setTab("personal")}>Datos personales</button>
        <button className={tab === "puesto" ? "active" : ""} onClick={() => setTab("puesto")}>Puesto y meses</button>
        <button className={tab === "conceptos" ? "active" : ""} onClick={() => setTab("conceptos")}>Conceptos de nómina</button>
      </div>

      {tab === "personal" && (
        <div className="grid">
          <Field label="Código"><input value={e.code} onChange={(ev) => set({ code: ev.target.value })} /></Field>
          <label className="field check-field">
            <input type="checkbox" checked={e.isVacancy} onChange={(ev) => set({ isVacancy: ev.target.checked })} />
            Es una vacante (puesto por cubrir)
          </label>
          <span />
          {!e.isVacancy && (
            <>
              <Field label="Nombres"><input value={e.firstName} onChange={(ev) => set({ firstName: ev.target.value })} /></Field>
              <Field label="Apellidos"><input value={e.lastName} onChange={(ev) => set({ lastName: ev.target.value })} /></Field>
              <Field label="Sexo">
                <select value={e.gender} onChange={(ev) => set({ gender: ev.target.value })}>
                  <option value="">—</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="O">Otro</option>
                </select>
              </Field>
              <Field label="Tipo de documento">
                <select value={e.docType} onChange={(ev) => set({ docType: ev.target.value })}>
                  {["DNI", "CE", "Pasaporte", "RUC", "Otro"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Número de documento"><input value={e.docNumber} onChange={(ev) => set({ docNumber: ev.target.value })} /></Field>
              <Field label="Fecha de nacimiento"><input type="date" value={e.birthDate} onChange={(ev) => set({ birthDate: ev.target.value })} /></Field>
              <Field label="Correo"><input type="email" value={e.email} onChange={(ev) => set({ email: ev.target.value })} /></Field>
              <Field label="Teléfono"><input value={e.phone} onChange={(ev) => set({ phone: ev.target.value })} /></Field>
              <Field label="Fecha de ingreso"><input type="date" value={e.hireDate} onChange={(ev) => set({ hireDate: ev.target.value })} /></Field>
              <Field label="Dirección" span={3}><input value={e.address} onChange={(ev) => set({ address: ev.target.value })} /></Field>
            </>
          )}
          {data.customFields.map((f) => (
            <Field key={f.id} label={f.label}>
              <CustomInput field={f} value={e.custom[f.id] ?? ""} onChange={(v) => set({ custom: { ...e.custom, [f.id]: v } })} />
            </Field>
          ))}
        </div>
      )}

      {tab === "puesto" && (
        <>
          <div className="grid">
            <Field label="Puesto de trabajo">
              <select value={e.positionId} onChange={(ev) => set({ positionId: ev.target.value })}>
                <option value="">— Selecciona —</option>
                {data.positions.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </select>
            </Field>
            <Field label="Área"><input value={position?.area ?? ""} disabled /></Field>
            <Field label="Centro de costo"><input value={position?.costCenter ?? ""} disabled /></Field>
            <Field label="Tipo de contrato">
              <input list="contracts" value={e.contractType} onChange={(ev) => set({ contractType: ev.target.value })} />
              <datalist id="contracts">
                {["Indeterminado", "Plazo fijo", "Tiempo parcial", "Practicante", "Locación de servicios"].map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>
          </div>
          <h3>Meses que labora por año</h3>
          <p className="muted">Solo se presupuestan conceptos, beneficios y aportes en los meses marcados. Desmarca todo un año si no labora.</p>
          <div className="year-months">
            {years.map((y) => (
              <Fragment key={y}>
                <strong>{y}</strong>
                <MonthPicker value={employeeYear(e, y).months} onChange={(months) => setYear(y, { months })} />
              </Fragment>
            ))}
          </div>
        </>
      )}

      {tab === "conceptos" && (
        <>
          <p className="muted">
            Monto mensual de cada concepto por año (antes de incrementos) y valor TARGET de los bonos. Ej.: sueldo 18,000 en 2026 y 18,500 en 2027.
          </p>
          <YearlyConceptAmounts
            concepts={data.concepts}
            years={years}
            valueOf={(y) => employeeYear(e, y).concepts}
            onChange={(y, concepts) => setYear(y, { concepts })}
            onCopyPosition={copyFromPosition}
            onCopyPrevious={copyFromYear}
          />
        </>
      )}
    </Modal>
  );
}
