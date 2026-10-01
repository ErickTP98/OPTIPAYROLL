import type { PayrollData } from "../types";
import { allMonths, onlyMonths } from "../utils";

/** Datos de ejemplo (referencia Perú). Todo es editable desde la aplicación. */
export function sampleData(): PayrollData {
  const year = new Date().getFullYear() + 1;
  return {
    version: 1,
    settings: { companyName: "Mi Empresa S.A.C.", year, currency: "S/" },
    customFields: [
      { id: "cf-banco", label: "Banco", type: "select", options: ["BCP", "BBVA", "Interbank", "Scotiabank"] },
      { id: "cf-cuenta", label: "Número de cuenta", type: "text", options: [] },
      { id: "cf-pension", label: "Sistema de pensiones", type: "select", options: ["ONP", "AFP Integra", "AFP Prima", "AFP Profuturo", "AFP Habitat"] },
      { id: "cf-hijos", label: "Número de hijos", type: "number", options: [] },
    ],
    positions: [
      {
        id: "pos-gg", code: "GG01", name: "Gerente General", area: "Gerencia", costCenter: "CC-100",
        category: "Ejecutivo", notes: "",
        concepts: [{ conceptId: "c-sueldo", amount: 12000 }, { conceptId: "c-sti", amount: 3 }, { conceptId: "c-lti", amount: 20 }],
      },
      {
        id: "pos-an", code: "AN01", name: "Analista Contable", area: "Finanzas", costCenter: "CC-200",
        category: "Empleado", notes: "",
        concepts: [{ conceptId: "c-sueldo", amount: 3500 }, { conceptId: "c-movilidad", amount: 200 }],
      },
      {
        id: "pos-op", code: "OP01", name: "Operario de Producción", area: "Operaciones", costCenter: "CC-300",
        category: "Obrero", notes: "",
        concepts: [{ conceptId: "c-sueldo", amount: 1500 }, { conceptId: "c-bono-prod", amount: 150 }],
      },
    ],
    employees: [
      {
        id: "emp-1", code: "T001", isVacancy: false, firstName: "María", lastName: "Quispe Rojas",
        docType: "DNI", docNumber: "45678912", birthDate: "1985-04-12", gender: "F",
        email: "mquispe@miempresa.com", phone: "987654321", address: "Av. Arequipa 1234, Lima",
        hireDate: "2015-03-01", contractType: "Indeterminado", positionId: "pos-gg", months: allMonths(),
        custom: { "cf-banco": "BCP", "cf-pension": "AFP Integra", "cf-hijos": "2" },
        concepts: [
          { conceptId: "c-sueldo", amount: 12000 },
          { conceptId: "c-asig-fam", amount: 113 },
          { conceptId: "c-bono-anual", amount: 6000 },
          { conceptId: "c-sti", amount: 3 },
          { conceptId: "c-lti", amount: 20 },
        ],
      },
      {
        id: "emp-2", code: "T002", isVacancy: false, firstName: "José", lastName: "Fernández Díaz",
        docType: "DNI", docNumber: "71234567", birthDate: "1993-09-30", gender: "M",
        email: "jfernandez@miempresa.com", phone: "912345678", address: "Jr. Junín 456, Lima",
        hireDate: "2021-07-15", contractType: "Plazo fijo", positionId: "pos-an", months: allMonths(),
        custom: { "cf-banco": "BBVA", "cf-pension": "ONP", "cf-hijos": "0" },
        concepts: [
          { conceptId: "c-sueldo", amount: 3500 },
          { conceptId: "c-movilidad", amount: 200 },
          { conceptId: "c-sti", amount: 1 },
        ],
      },
      {
        id: "emp-3", code: "T003", isVacancy: false, firstName: "Rosa", lastName: "Mendoza Huamán",
        docType: "DNI", docNumber: "76543210", birthDate: "1998-01-20", gender: "F",
        email: "", phone: "934567890", address: "Calle Los Pinos 789, Callao",
        hireDate: "2024-02-01", contractType: "Plazo fijo", positionId: "pos-op",
        months: onlyMonths(0, 1, 2, 3, 4, 5, 6, 7),
        custom: { "cf-pension": "AFP Prima", "cf-hijos": "1" },
        concepts: [
          { conceptId: "c-sueldo", amount: 1500 },
          { conceptId: "c-asig-fam", amount: 113 },
          { conceptId: "c-bono-prod", amount: 150 },
        ],
      },
      {
        id: "emp-4", code: "V001", isVacancy: true, firstName: "", lastName: "",
        docType: "", docNumber: "", birthDate: "", gender: "", email: "", phone: "", address: "",
        hireDate: "", contractType: "Plazo fijo", positionId: "pos-op",
        months: onlyMonths(3, 4, 5, 6, 7, 8, 9, 10, 11),
        custom: {},
        concepts: [
          { conceptId: "c-sueldo", amount: 1500 },
          { conceptId: "c-bono-prod", amount: 150 },
        ],
      },
    ],
    concepts: [
      {
        id: "c-sueldo", code: "SUELDO", name: "Sueldo básico", type: "remunerativo", segment: "regular", targetType: "STI", formula: "", isBaseSalary: true, months: allMonths(),
        appliesIncrease: true, affects: ["r-grati", "r-cts", "r-vac", "r-essalud", "r-vida"],
      },
      {
        id: "c-asig-fam", code: "ASIG_FAM", name: "Asignación familiar", type: "remunerativo", segment: "regular", targetType: "STI", formula: "", isBaseSalary: false, months: allMonths(),
        appliesIncrease: false, affects: ["r-grati", "r-cts", "r-vac", "r-essalud", "r-vida"],
      },
      {
        id: "c-bono-prod", code: "BONO_PROD", name: "Bono de productividad", type: "remunerativo", segment: "regular", targetType: "STI", formula: "", isBaseSalary: false, months: allMonths(),
        appliesIncrease: true, affects: ["r-essalud"],
      },
      {
        id: "c-bono-anual", code: "BONO_ANUAL", name: "Bono anual por desempeño", type: "remunerativo", segment: "regular", targetType: "STI", formula: "", isBaseSalary: false,
        months: onlyMonths(2), appliesIncrease: false, affects: ["r-essalud"],
      },
      {
        id: "c-movilidad", code: "MOVILIDAD", name: "Movilidad (condición de trabajo)", type: "no_remunerativo", segment: "regular", targetType: "STI", formula: "", isBaseSalary: false,
        months: allMonths(), appliesIncrease: false, affects: [],
      },
      {
        id: "c-sti", code: "BONO_STI", name: "Bono STI (incentivo anual)", type: "remunerativo", segment: "bono_target",
        targetType: "STI", formula: "SUELDO_BASICO * TARGET / 12", isBaseSalary: false, months: allMonths(),
        appliesIncrease: false, affects: ["r-essalud"],
      },
      {
        id: "c-lti", code: "BONO_LTI", name: "Bono LTI (incentivo de largo plazo)", type: "remunerativo", segment: "bono_target",
        targetType: "LTI", formula: "SUELDO_BASICO * TARGET / 100", isBaseSalary: false, months: allMonths(),
        appliesIncrease: false, affects: [],
      },
    ],
    rules: [
      {
        id: "r-grati", code: "GRATIF", name: "Gratificaciones (provisión)", kind: "beneficio", method: "formula",
        rate: 0, formula: "BASE / 6", baseMode: "mes", months: allMonths(), baseMin: 0, baseMax: 0, includeRules: [],
      },
      {
        id: "r-bonif", code: "BONIF_EXT", name: "Bonificación extraordinaria Ley 30334", kind: "beneficio",
        method: "porcentaje", rate: 9, formula: "", baseMode: "mes", months: allMonths(), baseMin: 0, baseMax: 0,
        includeRules: ["r-grati"],
      },
      {
        id: "r-cts", code: "CTS", name: "CTS (provisión)", kind: "beneficio", method: "formula",
        rate: 0, formula: "(BASE + GRATIF) / 12", baseMode: "mes", months: allMonths(), baseMin: 0, baseMax: 0,
        includeRules: [],
      },
      {
        id: "r-vac", code: "VACAC", name: "Vacaciones (provisión)", kind: "beneficio", method: "formula",
        rate: 0, formula: "BASE / 12", baseMode: "mes", months: allMonths(), baseMin: 0, baseMax: 0, includeRules: [],
      },
      {
        id: "r-essalud", code: "ESSALUD", name: "EsSalud", kind: "aporte", method: "porcentaje",
        rate: 9, formula: "", baseMode: "mes", months: allMonths(), baseMin: 1130, baseMax: 0, includeRules: [],
      },
      {
        id: "r-vida", code: "VIDA_LEY", name: "Seguro Vida Ley", kind: "aporte", method: "porcentaje",
        rate: 0.53, formula: "", baseMode: "mes", months: allMonths(), baseMin: 0, baseMax: 0, includeRules: [],
      },
    ],
    increases: [
      {
        id: "inc-1", name: "Incremento general anual", month: 3, percent: 5, scope: "todos",
        targets: [], conceptIds: [],
      },
      {
        id: "inc-2", name: "Ajuste operarios", month: 6, percent: 3, scope: "area",
        targets: ["Operaciones"], conceptIds: ["c-sueldo"],
      },
    ],
  };
}

export function emptyData(): PayrollData {
  return {
    version: 1,
    settings: { companyName: "", year: new Date().getFullYear() + 1, currency: "S/" },
    customFields: [],
    positions: [],
    employees: [],
    concepts: [],
    rules: [],
    increases: [],
  };
}
