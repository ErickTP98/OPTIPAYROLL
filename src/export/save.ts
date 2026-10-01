import { notify } from "../components/dialogs";
import { buildPayrollWorkbook, workbookFileName } from "./payrollWorkbook";

type SaveData = string | Blob | ArrayBuffer | ArrayBufferView;
interface DownloadsNamespace {
  save(request: { filename: string; data: SaveData }): Promise<{ status: "saved" | "delivered" }>;
}
interface ClaudeHost {
  use?: (name: string) => Promise<unknown>;
}

let downloads: Promise<DownloadsNamespace | null> | null = null;

/** Descargas de la página publicada en Claude (null fuera de ese visor). */
function claudeDownloads(): Promise<DownloadsNamespace | null> {
  if (!downloads) {
    const host = (window as unknown as { claude?: ClaudeHost }).claude;
    downloads = host?.use
      ? host.use("downloads").then((ns) => (ns as DownloadsNamespace | null) ?? null, () => null)
      : Promise.resolve(null);
  }
  return downloads;
}

function browserDownload(filename: string, data: SaveData, type: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Entrega un archivo al usuario: dentro de Claude pide confirmación de descarga; en un navegador
 * normal lo descarga directamente. Devuelve false si no se pudo (y ya avisó al usuario).
 */
export async function saveFile(filename: string, data: SaveData, type: string): Promise<boolean> {
  const ns = await claudeDownloads();
  if (!ns) {
    browserDownload(filename, data, type);
    return true;
  }
  try {
    await ns.save({ filename, data });
    return true;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "declined") return false;
    if (code === "rate_limited") notify("Ya hay una descarga pendiente de confirmar. Acéptala o espera un momento.");
    else notify("No se pudo descargar el archivo en esta vista. Abre la app en un navegador para descargarlo.");
    return false;
  }
}

/** Genera y descarga el libro de Excel con toda la información. */
export async function exportExcel(data: Parameters<typeof buildPayrollWorkbook>[0]): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = buildPayrollWorkbook(data);
  } catch (err) {
    notify(`No se pudo generar el Excel: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  await saveFile(workbookFileName(data), bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
