/**
 * Lectores de hojas de cálculo sin dependencias: Excel (.xlsx) y CSV.
 * Devuelven cada hoja como una matriz de celdas (texto o número).
 */

export type RawCell = string | number | boolean | null;

export interface RawSheet {
  name: string;
  rows: RawCell[][];
}

const dec = new TextDecoder();

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("El archivo no es un Excel válido (.xlsx).");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("El archivo Excel está dañado.");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(bytes: Uint8Array, e: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLen = view.getUint16(e.localOffset + 26, true);
  const extraLen = view.getUint16(e.localOffset + 28, true);
  const start = e.localOffset + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + e.compressedSize);
  if (e.method === 0) return dec.decode(raw);
  if (e.method === 8) return dec.decode(await inflateRaw(raw));
  throw new Error("El archivo Excel usa un formato de compresión no soportado.");
}

function unescapeXml(s: string): string {
  return s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Texto de todos los nodos <t> (texto enriquecido incluido). */
function textOf(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return unescapeXml(out);
}

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): RawCell[][] {
  const rows: RawCell[][] = [];
  let nextRow = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attr(rm[1], "r");
    const rowIdx = r ? Number(r) - 1 : nextRow;
    nextRow = rowIdx + 1;
    const row: RawCell[] = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], "r");
      const col = ref ? colIndex(ref) : nextCol;
      nextCol = col + 1;
      const type = attr(cm[1], "t");
      const inner = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value: RawCell = null;
      if (type === "s") value = v !== undefined ? shared[Number(v)] ?? "" : null;
      else if (type === "inlineStr") value = textOf(inner);
      else if (type === "str" || type === "e") value = v !== undefined ? unescapeXml(v) : null;
      else if (type === "b") value = v === "1";
      else if (v !== undefined) {
        const n = Number(v);
        value = Number.isFinite(n) ? n : unescapeXml(v);
      }
      row[col] = value;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[rowIdx] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** Lee todas las hojas de un archivo .xlsx. */
export async function readXlsx(bytes: Uint8Array): Promise<RawSheet[]> {
  const entries = zipEntries(bytes);
  const find = (path: string) => entries.find((e) => e.name.replace(/^\//, "") === path);
  const read = async (path: string) => {
    const e = find(path);
    return e ? readEntry(bytes, e) : "";
  };
  const workbook = await read("xl/workbook.xml");
  if (!workbook) throw new Error("El archivo no contiene un libro de Excel.");
  const rels = await read("xl/_rels/workbook.xml.rels");
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const sharedXml = await read("xl/sharedStrings.xml");
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const sheets: RawSheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unescapeXml(attr(m[1], "name") ?? `Hoja ${sheets.length + 1}`);
    const rid = attr(m[1], "r:id");
    const path = (rid && targets.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = await read(path);
    sheets.push({ name, rows: xml ? parseSheet(xml, shared) : [] });
  }
  return sheets;
}

/** Lee un CSV detectando el separador (; , o tabulación) y respetando comillas. */
export function readCsv(text: string): RawCell[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((sep) => [sep, firstLine.split(sep).length - 1] as const);
  const sep = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ",";
  const rows: RawCell[][] = [];
  let row: RawCell[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => (typeof c === "string" && c.trim() === "" ? null : c)));
}
