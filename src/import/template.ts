import type { PayrollData } from "../types";
import { isTargetBonus } from "../engine/calculate";
import { buildXlsx, type Cell } from "../export/xlsx";

/**
 * Plantilla de Excel para importar puestos, trabajadores y montos por año. Los encabezados
 * siguen la configuración actual (campos personalizados, conceptos y años).
 */
export function buildImportTemplate(data: PayrollData): Uint8Array {
  const concepts = [...data.concepts.filter((c) => !isTargetBonus(c)), ...data.concepts.filter(isTargetBonus)];
  const conceptHeaders = concepts.map((c) => (isTargetBonus(c) ? `${c.code} (TARGET)` : c.code));
  const years = [...data.settings.years].sort((a, b) => a - b);
  const exampleYear = data.settings.year;
  const base = concepts.find((c) => c.isBaseSalary) ?? concepts[0];

  const instructions: Cell[][] = [
    ["Cómo usar esta plantilla"],
    ["1. Completa las hojas «Puestos», «Trabajadores» y «Montos por año» (puedes dejar vacías las que no necesites)."],
    ["2. No cambies los encabezados. Las columnas que no conozca la aplicación se ignoran."],
    ["3. Cada registro se identifica por su Código: si ya existe se actualiza (solo las celdas con valor) y si no existe se crea."],
    ["4. En la aplicación usa «Importar» en Trabajadores o Puestos, revisa la vista previa y confirma."],
    [""],
    ["Hoja", "Columna", "Formato / ejemplo"],
    ["Puestos", "Código", "Obligatorio. Ej.: AN01"],
    ["Puestos", "Puesto", "Obligatorio para puestos nuevos. Ej.: Analista Contable"],
    ["Puestos", "Conceptos (SUELDO, …)", "Monto referencial mensual; en bonos target, el valor TARGET"],
    ["Trabajadores", "Código", "Obligatorio. Ej.: T001"],
    ["Trabajadores", "Tipo", "Trabajador o Vacante (las vacantes no necesitan nombre)"],
    ["Trabajadores", "Fechas", "aaaa-mm-dd, dd/mm/aaaa o fecha de Excel"],
    ["Trabajadores", "Sexo", "Femenino, Masculino u Otro (o F / M / O)"],
    ["Trabajadores", "Código de puesto", "Debe existir en la aplicación o en la hoja «Puestos»"],
    ["Trabajadores", "Meses que labora AAAA", "Todo el año, No labora, Ene-Jun, 1-6 o Ene, Feb, Mar"],
    ["Montos por año", "Código + Año", `Una fila por trabajador y año. Ej.: T001 · ${exampleYear}`],
    ["Montos por año", "Conceptos (SUELDO, …)", `Monto mensual del año. Ej.: ${base?.code ?? "SUELDO"} = 18500`],
    ["Montos por año", "Bonos «(TARGET)»", "Valor TARGET del bono para ese año"],
  ];

  return buildXlsx([
    { name: "Instrucciones", rows: instructions, widths: [22, 30, 80] },
    { name: "Puestos", rows: [["Código", "Puesto", "Área", "Centro de costo", "Categoría", "Observaciones", ...conceptHeaders]] },
    {
      name: "Trabajadores",
      rows: [[
        "Código", "Tipo", "Nombres", "Apellidos", "Tipo de documento", "Número de documento", "Fecha de nacimiento", "Sexo",
        "Correo", "Teléfono", "Dirección", "Fecha de ingreso", "Tipo de contrato",
        ...data.customFields.map((f) => f.label), "Código de puesto",
        ...years.map((y) => `Meses que labora ${y}`),
      ]],
    },
    { name: "Montos por año", rows: [["Código", "Año", "Meses que labora", ...conceptHeaders]] },
  ]);
}
