import type { ConceptAmount, Employee, PayrollData, Position } from "../types";
import { allMonths, employeeYear, MONTH_NAMES, uid } from "../utils";
import type { RawCell, RawSheet } from "./readers";

export type ImportKind = "trabajadores" | "puestos";

export interface ImportPlan {
  /** Datos resultantes si se confirma la importación. */
  data: PayrollData;
  positions: { created: number; updated: number };
  employees: { created: number; updated: number };
  /** Filas de montos/meses por año aplicadas. */
  yearRows: number;
  yearsAdded: number[];
  warnings: string[];
  /** Hojas reconocidas y cuántas filas se leyeron de cada una. */
  sheetsUsed: { name: string; kind: string; rows: number }[];
}

/** Normaliza un encabezado: minúsculas, sin tildes ni signos. */
export const normHeader = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(target\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const EMPLOYEE_FIELDS: Record<string, keyof Employee | "tipo" | "codigoPuesto" | "puesto"> = {
  "codigo": "code",
  "codigo de trabajador": "code",
  "tipo": "tipo",
  "nombres": "firstName",
  "nombre": "firstName",
  "apellidos": "lastName",
  "apellido": "lastName",
  "tipo de documento": "docType",
  "numero de documento": "docNumber",
  "documento": "docNumber",
  "dni": "docNumber",
  "fecha de nacimiento": "birthDate",
  "sexo": "gender",
  "genero": "gender",
  "correo": "email",
  "email": "email",
  "telefono": "phone",
  "celular": "phone",
  "direccion": "address",
  "fecha de ingreso": "hireDate",
  "tipo de contrato": "contractType",
  "contrato": "contractType",
  "codigo de puesto": "codigoPuesto",
  "puesto": "puesto",
};

const POSITION_FIELDS: Record<string, keyof Position> = {
  "codigo": "code",
  "codigo de puesto": "code",
  "puesto": "name",
  "nombre": "name",
  "nombre del puesto": "name",
  "area": "area",
  "area departamento": "area",
  "departamento": "area",
  "centro de costo": "costCenter",
  "categoria": "category",
  "observaciones": "notes",
};

/** Columnas que se exportan pero no se importan (se ignoran sin advertencia). */
const DERIVED = new Set(["ocupantes", "vacantes", "trabajador", "area", "centro de costo", "categoria"]);

const DATE_FIELDS = new Set(["birthDate", "hireDate"]);
const MONTH_ALIASES: Record<string, number> = {};
MONTH_NAMES.forEach((m, i) => {
  const n = normHeader(m);
  MONTH_ALIASES[n] = i;
  MONTH_ALIASES[n.slice(0, 3)] = i;
});
MONTH_ALIASES["set"] = 8;
MONTH_ALIASES["sept"] = 8;

export function cellText(v: RawCell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return v.trim();
}

/** Número desde Excel o texto («1,234.56», «1.234,56», «S/ 3500»). */
export function cellNumber(v: RawCell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = cellText(v).replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // «3,500» como miles si tiene 3 decimales exactos; si no, coma decimal.
    normalized = /,\d{3}$/.test(s) && s.indexOf(",") === lastComma ? s.replace(",", "") : s.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Fecha ISO (aaaa-mm-dd) desde número de serie de Excel, dd/mm/aaaa o aaaa-mm-dd. */
export function cellDate(v: RawCell): string {
  if (typeof v === "number" && v > 0 && v < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = cellText(v);
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}

/**
 * Meses desde texto: «Todo el año», «No labora», «Ene, Feb, Mar», «Enero-Junio», «1-6», «4,5,6».
 * Devuelve null si no se pudo interpretar.
 */
export function parseMonths(v: RawCell): boolean[] | null {
  const s = normHeader(cellText(v).replace(/[–—]/g, "-").replace(/\s+a\s+/g, "-"));
  if (!s) return null;
  if (/^(todo|todos|todo el ano|ano completo|12 meses)$/.test(s)) return allMonths();
  if (/^(no labora|ninguno|no)$/.test(s)) return new Array(12).fill(false);
  const raw = cellText(v).replace(/[–—]/g, "-").replace(/\s+a\s+/gi, "-");
  const flags = new Array(12).fill(false);
  const toIdx = (t: string): number | null => {
    const k = normHeader(t);
    if (/^\d{1,2}$/.test(k)) {
      const n = Number(k);
      return n >= 1 && n <= 12 ? n - 1 : null;
    }
    return MONTH_ALIASES[k] ?? MONTH_ALIASES[k.slice(0, 3)] ?? null;
  };
  const parts = raw
    .split(/\s*(?:[,;/]|\s+y\s+)\s*/i)
    .flatMap((p) => (p.includes("-") ? [p] : p.split(/\s+/)))
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const range = part.split("-").map((p) => p.trim()).filter(Boolean);
    if (range.length === 2) {
      const a = toIdx(range[0]);
      const b = toIdx(range[1]);
      if (a === null || b === null || b < a) return null;
      for (let i = a; i <= b; i++) flags[i] = true;
    } else {
      const i = toIdx(part);
      if (i === null) return null;
      flags[i] = true;
    }
  }
  return flags;
}

function gender(v: string): string {
  const k = normHeader(v);
  if (["f", "femenino", "mujer"].includes(k)) return "F";
  if (["m", "masculino", "hombre", "varon"].includes(k)) return "M";
  if (["o", "otro"].includes(k)) return "O";
  return v;
}

function sheetKind(name: string, fallback: ImportKind): "trabajadores" | "puestos" | "montos" | "otra" {
  const n = normHeader(name);
  if (n.startsWith("puesto")) return "puestos";
  if (n.startsWith("trabajador") || n.startsWith("personal") || n.startsWith("empleado")) return "trabajadores";
  if (n.startsWith("montos") || n.includes("por ano")) return "montos";
  if (/^(hoja|sheet)\s*\d*$/.test(n) || n === "") return fallback;
  return "otra";
}

/** Primera fila con al menos dos celdas de texto: el encabezado. */
function splitHeader(rows: RawCell[][]): { header: string[]; body: RawCell[][]; headerRow: number } | null {
  const idx = rows.findIndex((r) => r.filter((c) => typeof c === "string" && c.trim()).length >= 2);
  if (idx < 0) return null;
  return { header: rows[idx].map((c) => cellText(c)), body: rows.slice(idx + 1), headerRow: idx + 1 };
}

const isEmptyRow = (r: RawCell[]) => r.every((c) => c === null || c === undefined || cellText(c) === "");

/**
 * Prepara la importación de trabajadores y/o puestos desde hojas de cálculo.
 * No modifica `data`: devuelve una copia con los cambios y el resumen para mostrar al usuario.
 * Los registros se identifican por su código: si ya existe se actualiza (solo las columnas con valor),
 * si no existe se crea.
 */
export function planImport(data: PayrollData, sheets: RawSheet[], fallback: ImportKind): ImportPlan {
  const next: PayrollData = structuredClone(data);
  const plan: ImportPlan = {
    data: next,
    positions: { created: 0, updated: 0 },
    employees: { created: 0, updated: 0 },
    yearRows: 0,
    yearsAdded: [],
    warnings: [],
    sheetsUsed: [],
  };
  const warn = (sheet: string, row: number | null, msg: string) =>
    plan.warnings.push(`${sheet}${row ? `, fila ${row}` : ""}: ${msg}`);
  const conceptByCode = new Map(next.concepts.map((c) => [normHeader(c.code), c]));
  const customByLabel = new Map(next.customFields.map((f) => [normHeader(f.label), f]));

  const ensureYear = (y: number) => {
    if (!next.settings.years.includes(y)) {
      next.settings.years = [...next.settings.years, y].sort((a, b) => a - b);
      plan.yearsAdded.push(y);
    }
  };

  const classified = sheets
    .map((s) => ({ sheet: s, kind: sheets.length === 1 ? (sheetKind(s.name, fallback) === "otra" ? fallback : sheetKind(s.name, fallback)) : sheetKind(s.name, fallback) }))
    .filter((s) => s.kind !== "otra");
  // Orden: primero puestos (los trabajadores los referencian), luego trabajadores y montos.
  const order = { puestos: 0, trabajadores: 1, montos: 2 } as const;
  classified.sort((a, b) => order[a.kind as keyof typeof order] - order[b.kind as keyof typeof order]);
  if (classified.length === 0) {
    warn("Archivo", null, "no se encontraron hojas «Puestos», «Trabajadores» o «Montos por año».");
    return plan;
  }

  for (const { sheet, kind } of classified) {
    const parsed = splitHeader(sheet.rows);
    if (!parsed) {
      warn(sheet.name, null, "la hoja está vacía o no tiene encabezados.");
      continue;
    }
    const { header, body, headerRow } = parsed;
    const keys = header.map(normHeader);
    let rowsRead = 0;

    if (kind === "puestos") {
      const ignored = new Set<string>();
      body.forEach((row, i) => {
        if (isEmptyRow(row)) return;
        rowsRead++;
        const rowNum = headerRow + 1 + i;
        const fields: Partial<Position> = {};
        const amounts: ConceptAmount[] = [];
        keys.forEach((k, c) => {
          const v = row[c];
          if (v === null || v === undefined || cellText(v) === "") return;
          const f = POSITION_FIELDS[k];
          if (f && f !== "concepts" && f !== "id") (fields as Record<string, string>)[f] = cellText(v);
          else if (conceptByCode.has(k)) {
            const n = cellNumber(v);
            if (n === null) warn(sheet.name, rowNum, `el monto de «${header[c]}» no es un número.`);
            else amounts.push({ conceptId: conceptByCode.get(k)!.id, amount: n });
          } else if (!DERIVED.has(k)) ignored.add(header[c]);
        });
        const code = fields.code?.trim();
        const name = fields.name?.trim();
        if (!code && !name) {
          warn(sheet.name, rowNum, "falta el código o el nombre del puesto; se omitió.");
          return;
        }
        let p = code
          ? next.positions.find((x) => normHeader(x.code) === normHeader(code))
          : next.positions.find((x) => normHeader(x.name) === normHeader(name!));
        if (p) {
          Object.assign(p, fields);
          for (const a of amounts) p.concepts = [...p.concepts.filter((x) => x.conceptId !== a.conceptId), ...(a.amount ? [a] : [])];
          plan.positions.updated++;
        } else {
          if (!name) {
            warn(sheet.name, rowNum, `el puesto ${code} es nuevo pero no tiene nombre; se omitió.`);
            return;
          }
          p = {
            id: uid(), code: code ?? "", name, area: fields.area ?? "", costCenter: fields.costCenter ?? "",
            category: fields.category ?? "", notes: fields.notes ?? "", concepts: amounts.filter((a) => a.amount),
          };
          next.positions.push(p);
          plan.positions.created++;
        }
      });
      if (ignored.size) warn(sheet.name, null, `columnas no reconocidas (se ignoraron): ${[...ignored].join(", ")}.`);
    } else {
      // Trabajadores y montos por año comparten el mismo procesamiento por fila.
      const ignored = new Set<string>();
      const yearCol = keys.findIndex((k) => k === "ano" || k === "año");
      body.forEach((row, i) => {
        if (isEmptyRow(row)) return;
        rowsRead++;
        const rowNum = headerRow + 1 + i;
        const get = (c: number) => row[c];
        const codeCol = keys.findIndex((k) => EMPLOYEE_FIELDS[k] === "code");
        const code = codeCol >= 0 ? cellText(get(codeCol)) : "";
        if (!code) {
          warn(sheet.name, rowNum, "falta el código del trabajador; se omitió.");
          return;
        }
        let e = next.employees.find((x) => normHeader(x.code) === normHeader(code));
        const isNew = !e;
        if (!e) {
          if (kind === "montos") {
            warn(sheet.name, rowNum, `el trabajador ${code} no existe; impórtalo primero en la hoja «Trabajadores».`);
            return;
          }
          e = {
            id: uid(), code, isVacancy: false, firstName: "", lastName: "", docType: "DNI", docNumber: "", birthDate: "",
            gender: "", email: "", phone: "", address: "", hireDate: "", contractType: "", positionId: "", custom: {}, years: {},
          };
        }
        const emp = e;
        let positionRef: { code?: string; name?: string } = {};
        const rowYear = yearCol >= 0 ? cellNumber(get(yearCol)) : null;
        const yearAmounts: ConceptAmount[] = [];
        let rowMonths: boolean[] | null = null;

        keys.forEach((k, c) => {
          const v = get(c);
          const text = cellText(v);
          if (c === yearCol || c === codeCol) return;
          const yearMonths = /^meses que labora (\d{4})$/.exec(k);
          if (yearMonths || k === "meses que labora" || k === "meses") {
            if (!text) return;
            const months = parseMonths(v);
            if (!months) {
              warn(sheet.name, rowNum, `no se entendieron los meses «${text}» (usa p. ej. «Todo el año», «Ene-Jun» o «1-6»).`);
              return;
            }
            if (yearMonths) {
              const y = Number(yearMonths[1]);
              ensureYear(y);
              Object.assign(emp, { years: { ...emp.years, [y]: { ...employeeYear(emp, y), months } } });
            } else rowMonths = months;
            return;
          }
          const f = EMPLOYEE_FIELDS[k];
          if (f) {
            if (!text) return;
            if (f === "tipo") emp.isVacancy = normHeader(text).startsWith("vacante");
            else if (f === "codigoPuesto") positionRef.code = text;
            else if (f === "puesto") positionRef.name = text;
            else if (f === "gender") emp.gender = gender(text);
            else if (DATE_FIELDS.has(f)) (emp as unknown as Record<string, string>)[f] = cellDate(v);
            else (emp as unknown as Record<string, string>)[f] = text;
            return;
          }
          const custom = customByLabel.get(k);
          if (custom) {
            if (text) emp.custom = { ...emp.custom, [custom.id]: custom.type === "date" ? cellDate(v) : text };
            return;
          }
          const concept = conceptByCode.get(k);
          if (concept) {
            if (!text) return;
            const n = cellNumber(v);
            if (n === null) warn(sheet.name, rowNum, `el monto de «${header[c]}» no es un número.`);
            else yearAmounts.push({ conceptId: concept.id, amount: n });
            return;
          }
          if (!DERIVED.has(k) && !/^meses que labora/.test(k)) ignored.add(header[c]);
        });

        // Puesto: por código y, si no, por nombre.
        if (positionRef.code || positionRef.name) {
          const p = (positionRef.code && next.positions.find((x) => normHeader(x.code) === normHeader(positionRef.code!)))
            || (positionRef.name && next.positions.find((x) => normHeader(x.name) === normHeader(positionRef.name!)));
          if (p) emp.positionId = p.id;
          else warn(sheet.name, rowNum, `no existe el puesto «${positionRef.code ?? positionRef.name}»; crea o importa el puesto primero.`);
        }

        // Montos y meses de un año (columna «Año»; si falta, el año seleccionado).
        if (yearAmounts.length || rowMonths) {
          const y = rowYear ?? next.settings.year;
          if (!Number.isInteger(y) || y < 1900 || y > 2200) {
            warn(sheet.name, rowNum, `el año «${cellText(get(yearCol))}» no es válido.`);
          } else {
            ensureYear(y);
            const cur = employeeYear(emp, y);
            let concepts = cur.concepts;
            for (const a of yearAmounts) concepts = [...concepts.filter((x) => x.conceptId !== a.conceptId), ...(a.amount ? [a] : [])];
            // Un trabajador nuevo sin meses indicados labora todo el año.
            const months = rowMonths ?? (cur.months.some(Boolean) || !isNew ? cur.months : allMonths());
            emp.years = { ...emp.years, [y]: { months, concepts } };
            plan.yearRows++;
          }
        }

        if (isNew) {
          if (!emp.isVacancy && !emp.firstName && !emp.lastName) {
            warn(sheet.name, rowNum, `el trabajador ${code} no tiene nombre; se omitió (o marca «Tipo» = Vacante).`);
            return;
          }
          if (!emp.positionId) warn(sheet.name, rowNum, `el trabajador ${code} quedó sin puesto asignado.`);
          if (Object.keys(emp.years).length === 0) {
            emp.years = { [next.settings.year]: { months: allMonths(), concepts: [] } };
          }
          next.employees.push(emp);
          plan.employees.created++;
        } else if (kind === "trabajadores") {
          plan.employees.updated++;
        }
      });
      if (ignored.size) warn(sheet.name, null, `columnas no reconocidas (se ignoraron): ${[...ignored].join(", ")}.`);
    }
    plan.sheetsUsed.push({ name: sheet.name, kind, rows: rowsRead });
  }
  return plan;
}
