/** Doce indicadores, uno por mes (índice 0 = enero). */
export type MonthFlags = boolean[];

export interface Settings {
  companyName: string;
  /** Año que se está viendo/editando. */
  year: number;
  /** Años presupuestados (p. ej. 2026, 2027, 2028). */
  years: number[];
  currency: string;
  /** Logo de la empresa cliente como data URL (vacío = sin logo). */
  logo: string;
  /** Paleta de colores de la interfaz. */
  palette: PaletteId;
}

export type PaletteId = "menta" | "turquesa";

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
  /** Monto mensual (conceptos regulares) o valor TARGET (bonos target). */
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
  /** Valores de los campos personalizados, por id de campo. */
  custom: Record<string, string>;
  /** Datos del trabajador para cada año presupuestado (clave = año). */
  years: Record<string, EmployeeYear>;
}

/** Datos de un trabajador que cambian de un año a otro. */
export interface EmployeeYear {
  /** Meses en los que el trabajador labora dentro del año. */
  months: MonthFlags;
  /** Monto mensual (o TARGET) de cada concepto en el año. */
  concepts: ConceptAmount[];
}

export type ConceptType = "remunerativo" | "no_remunerativo" | "otro";

/** Segmento del concepto: regular (monto fijo) o bono target (calculado con fórmula). */
export type ConceptSegment = "regular" | "bono_target";
/** Tipo de bono target: incentivo de corto plazo (STI) o de largo plazo (LTI). */
export type TargetBonusType = "STI" | "LTI";

export interface Concept {
  id: string;
  code: string;
  name: string;
  type: ConceptType;
  segment: ConceptSegment;
  /** Solo bonos target. */
  targetType: TargetBonusType;
  /**
   * Solo bonos target: fórmula del monto mensual. Puede usar SUELDO_BASICO (sueldo básico del mes),
   * TARGET (valor asignado al trabajador) y los códigos de los conceptos regulares.
   */
  formula: string;
  /** Concepto que representa el sueldo básico (variable SUELDO_BASICO en las fórmulas). */
  isBaseSalary: boolean;
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
  /** Año presupuestado al que pertenece el incremento. */
  year: number;
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
