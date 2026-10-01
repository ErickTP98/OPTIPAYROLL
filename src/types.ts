/** Doce indicadores, uno por mes (índice 0 = enero). */
export type MonthFlags = boolean[];

export interface Settings {
  companyName: string;
  year: number;
  currency: string;
}

export type CustomFieldType = "text" | "number" | "date" | "select";

/** Campo adicional que el usuario define para los datos personales del trabajador. */
export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
}

export interface ConceptAmount {
  conceptId: string;
  amount: number;
}

export interface Position {
  id: string;
  code: string;
  name: string;
  area: string;
  costCenter: string;
  category: string;
  notes: string;
  /** Montos referenciales del puesto, que se pueden copiar al trabajador. */
  concepts: ConceptAmount[];
}

export interface Employee {
  id: string;
  code: string;
  /** Una vacante presupuesta el puesto aunque todavía no tenga titular. */
  isVacancy: boolean;
  firstName: string;
  lastName: string;
  docType: string;
  docNumber: string;
  birthDate: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
  hireDate: string;
  contractType: string;
  positionId: string;
  /** Meses en los que el trabajador labora dentro del año presupuestado. */
  months: MonthFlags;
  /** Valores de los campos personalizados, por id de campo. */
  custom: Record<string, string>;
  concepts: ConceptAmount[];
}

export type ConceptType = "remunerativo" | "no_remunerativo" | "otro";

export interface Concept {
  id: string;
  code: string;
  name: string;
  type: ConceptType;
  /** Meses en los que se paga el concepto (p. ej. un bono anual solo en marzo). */
  months: MonthFlags;
  /** Si los incrementos porcentuales afectan a este concepto. */
  appliesIncrease: boolean;
  /** Indicadores de afectación: ids de las reglas (beneficios/aportes) cuya base integra. */
  affects: string[];
}

export type RuleKind = "beneficio" | "aporte";
export type RuleMethod = "porcentaje" | "formula";
/**
 * Cómo se arma la base en un mes en que se aplica la regla:
 * - mes: solo la base de ese mes (provisión mensual).
 * - acumulado: suma de las bases desde la última aplicación de la regla.
 * - promedio: promedio de las bases (meses laborados) desde la última aplicación.
 */
export type BaseMode = "mes" | "acumulado" | "promedio";

/** Regla de cálculo de un beneficio social o aporte patronal. */
export interface Rule {
  id: string;
  code: string;
  name: string;
  kind: RuleKind;
  method: RuleMethod;
  /** Porcentaje (método porcentaje) o variable TASA disponible en fórmulas. */
  rate: number;
  formula: string;
  baseMode: BaseMode;
  /** Meses en los que se registra el gasto de la regla. */
  months: MonthFlags;
  /** Base mínima (0 = sin mínimo). Se aplica solo cuando hay base. */
  baseMin: number;
  /** Tope de la base (0 = sin tope). */
  baseMax: number;
  /** Otras reglas cuyo resultado se suma a la base de esta regla. */
  includeRules: string[];
}

export type IncreaseScope = "todos" | "area" | "puesto" | "trabajador";

export interface Increase {
  id: string;
  name: string;
  /** Mes (0-11) a partir del cual rige el incremento. */
  month: number;
  percent: number;
  scope: IncreaseScope;
  /** Áreas, ids de puesto o ids de trabajador según el alcance. */
  targets: string[];
  /** Conceptos a los que aplica; vacío = todos los conceptos marcados como afectos a incremento. */
  conceptIds: string[];
}

export interface PayrollData {
  version: 1;
  settings: Settings;
  customFields: CustomField[];
  positions: Position[];
  employees: Employee[];
  concepts: Concept[];
  rules: Rule[];
  increases: Increase[];
}
