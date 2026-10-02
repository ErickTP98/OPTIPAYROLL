import { useRef, useState } from "react";
import type { PayrollData } from "../types";
import { planImport, type ImportKind, type ImportPlan } from "../import/payrollImport";
import { readCsv, readXlsx, type RawSheet } from "../import/readers";
import { buildImportTemplate } from "../import/template";
import { saveFile } from "../export/save";
import { Modal } from "./ui";

const KIND_LABEL: Record<string, string> = {
  trabajadores: "Trabajadores",
  puestos: "Puestos",
  montos: "Montos por año",
};

async function readFile(file: File): Promise<RawSheet[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return readXlsx(new Uint8Array(await file.arrayBuffer()));
  if (name.endsWith(".csv") || name.endsWith(".txt")) return [{ name: file.name.replace(/\.[^.]+$/, ""), rows: readCsv(await file.text()) }];
  if (name.endsWith(".xls")) throw new Error("El formato .xls (Excel 97-2003) no es compatible. Guárdalo como .xlsx desde Excel.");
  throw new Error("Selecciona un archivo .xlsx o .csv.");
}

/** Importa trabajadores, puestos y montos por año desde Excel o CSV, con vista previa antes de aplicar. */
export function ImportDialog({ data, kind, onApply, onClose }: {
  data: PayrollData;
  kind: ImportKind;
  onApply: (next: PayrollData) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const load = async (file: File) => {
    setBusy(true);
    setError("");
    setPlan(null);
    setFileName(file.name);
    try {
      setPlan(planImport(data, await readFile(file), kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const changes = plan
    ? plan.positions.created + plan.positions.updated + plan.employees.created + plan.employees.updated + plan.yearRows
    : 0;
  const shownWarnings = plan?.warnings.slice(0, 40) ?? [];

  return (
    <Modal
      wide
      title={`Importar ${kind === "puestos" ? "puestos" : "trabajadores"}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!plan || changes === 0} onClick={() => plan && onApply(plan.data)}>
            {plan && changes > 0 ? "Importar cambios" : "Importar"}
          </button>
        </>
      }
    >
      <div className="import-steps">
        <div>
          <h3>1. Prepara el archivo</h3>
          <p className="muted small">
            Usa la plantilla (hojas <strong>Puestos</strong>, <strong>Trabajadores</strong> y <strong>Montos por año</strong>) o el Excel
            exportado desde esta aplicación. También acepta un CSV con los mismos encabezados.
          </p>
          <button className="btn" onClick={() => saveFile("plantilla-importacion-optipayroll.xlsx", buildImportTemplate(data), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>
            Descargar plantilla de Excel
          </button>
        </div>
        <div>
          <h3>2. Elige el archivo</h3>
          <div
            className={`dropzone ${dragging ? "over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) load(f);
            }}
          >
            <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "Leyendo…" : "Elegir archivo"}
            </button>
            <span className="muted small">{fileName || "o arrástralo aquí (.xlsx o .csv)"}</span>
            <input
              ref={fileRef}
              id="import-file"
              type="file"
              accept=".xlsx,.xlsm,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) load(f);
              }}
            />
          </div>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {plan && (
        <>
          <h3>3. Revisa y confirma</h3>
          <div className="import-summary">
            <div className="kpi"><span className="kpi-label">Puestos nuevos</span><span className="kpi-value">{plan.positions.created}</span></div>
            <div className="kpi"><span className="kpi-label">Puestos actualizados</span><span className="kpi-value">{plan.positions.updated}</span></div>
            <div className="kpi"><span className="kpi-label">Trabajadores nuevos</span><span className="kpi-value">{plan.employees.created}</span></div>
            <div className="kpi"><span className="kpi-label">Trabajadores actualizados</span><span className="kpi-value">{plan.employees.updated}</span></div>
            <div className="kpi"><span className="kpi-label">Filas de montos por año</span><span className="kpi-value">{plan.yearRows}</span></div>
          </div>
          {plan.sheetsUsed.length > 0 && (
            <p className="muted small">
              Hojas leídas: {plan.sheetsUsed.map((s) => `${s.name} (${KIND_LABEL[s.kind] ?? s.kind}, ${s.rows} filas)`).join(" · ")}
            </p>
          )}
          {plan.yearsAdded.length > 0 && (
            <p className="muted small">Se agregarán los años presupuestados: {plan.yearsAdded.join(", ")}.</p>
          )}
          {changes === 0 && <div className="alert">El archivo no tiene filas para importar.</div>}
          {plan.warnings.length > 0 && (
            <div className="alert">
              <strong>{plan.warnings.length} advertencia(s):</strong>
              <ul>
                {shownWarnings.map((w, i) => <li key={i}>{w}</li>)}
                {plan.warnings.length > shownWarnings.length && <li>… y {plan.warnings.length - shownWarnings.length} más.</li>}
              </ul>
            </div>
          )}
          {changes > 0 && <p className="muted small">Nada se guarda hasta que pulses «Importar cambios».</p>}
        </>
      )}
    </Modal>
  );
}
