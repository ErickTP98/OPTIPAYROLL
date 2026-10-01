import { useEffect, useState } from "react";
import { saveFile } from "../export/save";
import { Modal } from "./ui";

/**
 * Diálogos propios (confirmación, aviso y exportación). Reemplazan a window.confirm/alert y a las
 * descargas directas, que algunos entornos embebidos bloquean.
 */
type Dialog =
  | { kind: "confirm"; message: string; resolve: (ok: boolean) => void }
  | { kind: "notice"; message: string }
  | { kind: "export"; name: string; content: string; type: string };

let current: Dialog | null = null;
const listeners = new Set<(d: Dialog | null) => void>();
const show = (d: Dialog | null) => {
  current = d;
  listeners.forEach((l) => l(d));
};

export function ask(message: string): Promise<boolean> {
  return new Promise((resolve) => show({ kind: "confirm", message, resolve }));
}

export function notify(message: string) {
  show({ kind: "notice", message });
}

export function exportFile(name: string, content: string, type: string) {
  show({ kind: "export", name, content, type });
}

export function confirmDelete(what: string): Promise<boolean> {
  return ask(`¿Eliminar ${what}? Esta acción no se puede deshacer.`);
}

export function DialogHost() {
  const [dialog, setDialog] = useState<Dialog | null>(current);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    listeners.add(setDialog);
    return () => void listeners.delete(setDialog);
  }, []);
  useEffect(() => setCopied(false), [dialog]);
  if (!dialog) return null;

  const close = (ok = false) => {
    if (dialog.kind === "confirm") dialog.resolve(ok);
    show(null);
  };

  if (dialog.kind === "confirm" || dialog.kind === "notice") {
    return (
      <Modal
        title={dialog.kind === "confirm" ? "Confirmar" : "Aviso"}
        onClose={() => close(false)}
        footer={
          dialog.kind === "confirm" ? (
            <>
              <button className="btn" onClick={() => close(false)}>Cancelar</button>
              <button className="btn primary" autoFocus onClick={() => close(true)}>Aceptar</button>
            </>
          ) : (
            <button className="btn primary" autoFocus onClick={() => close()}>Entendido</button>
          )
        }
      >
        <p>{dialog.message}</p>
      </Modal>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dialog.content);
      setCopied(true);
    } catch {
      (document.getElementById("export-content") as HTMLTextAreaElement | null)?.select();
    }
  };

  return (
    <Modal
      wide
      title={`Exportar ${dialog.name}`}
      onClose={() => close()}
      footer={
        <>
          {copied && <span className="muted small">Copiado. Pégalo en Excel o en un archivo de texto.</span>}
          <button className="btn" onClick={copy}>Copiar al portapapeles</button>
          <button className="btn primary" onClick={() => saveFile(dialog.name, dialog.content, dialog.type)}>Descargar archivo</button>
        </>
      }
    >
      <p className="muted">
        Descarga el archivo o copia el contenido y pégalo en Excel o en un archivo <code>{dialog.name}</code>.
      </p>
      <textarea id="export-content" className="export-box" readOnly rows={14} value={dialog.content.replace(/^﻿/, "")} />
    </Modal>
  );
}
