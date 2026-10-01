# OptiPayroll · Presupuesto de nóminas

Aplicación web para calcular el **presupuesto anual de nóminas** por trabajador, puesto, área y centro de costo:
remuneraciones, beneficios sociales y aportes patronales, mes a mes, con incrementos programados.

## Funcionalidades

| Módulo | Qué permite |
| --- | --- |
| **Empresa** | Nombre, año y moneda del presupuesto. **Campos personalizados** del trabajador (texto, número, fecha o lista: banco, cuenta, sistema de pensiones, etc.). Respaldo/importación en JSON. |
| **Puestos** | Código, nombre, área, centro de costo, categoría y montos referenciales por concepto (plantilla). |
| **Trabajadores** | Datos personales (nombres, documento, nacimiento, contacto, ingreso, contrato + campos personalizados), puesto asignado, **meses que labora** en el año y monto mensual de cada concepto. También permite registrar **vacantes** para presupuestar puestos por cubrir. |
| **Conceptos** | Conceptos de nómina con tipo, meses en que se pagan (p. ej. bono solo en marzo), indicador **afecto a incremento** y una matriz de **indicadores de afectación** a cada beneficio social y aporte patronal. |
| **Beneficios y aportes** | Reglas de cálculo: porcentaje de la base o **fórmula personalizada**, base mínima y tope, meses de registro, modo de base (mensual, acumulada o promedio) y posibilidad de sumar a la base el resultado de otras reglas. |
| **Incrementos** | Aumentos porcentuales desde un mes, para todos, por área, por puesto o por trabajador, y sobre todos los conceptos afectos o sobre conceptos específicos. Se acumulan de forma compuesta. |
| **Presupuesto** | Totales anuales, resumen mensual, vistas por concepto, trabajador, puesto, área y centro de costo, detalle de cálculo por trabajador (incluidas las bases de cada regla) y exportación a CSV (Excel). |

## Cómo se calcula

Para cada trabajador y cada mes del año:

1. **Conceptos**: `monto mensual × factor de incrementos`, solo si el trabajador labora ese mes y el concepto se paga en ese mes.
   El factor es el producto de `(1 + %/100)` de los incrementos vigentes que le aplican.
2. **Base de cada regla**: suma de los conceptos del mes marcados como *afectos* a esa regla, más el resultado de las reglas
   indicadas en «Sumar a la base el resultado de».
   - *Base del mes*: se usa la base de ese mes (provisión mensual).
   - *Suma* / *Promedio*: en cada mes marcado se suman (o promedian sobre los meses laborados) las bases desde la aplicación anterior.
   - Luego se aplica la base mínima (si hay base) y el tope.
3. **Resultado de la regla**: `base × %` o la fórmula definida. Las reglas se calculan en orden de dependencias; las dependencias
   circulares y las fórmulas inválidas se informan en la pantalla de presupuesto.
4. **Gasto del trabajador / puesto** = conceptos + beneficios sociales + aportes patronales.

### Fórmulas

Operadores `+ - * / ^ %`, comparaciones `< <= > >= = <>` y funciones `MIN`, `MAX`, `ROUND(x, dec)`, `ABS`, `FLOOR`, `CEIL`,
`IF(condición, si, no)`. Variables disponibles:

- `BASE`, `BASE_MES`, `TASA` (porcentaje en decimal), `MES` (1–12), `LABORA`, `MESES_PERIODO`, `MESES_LABORADOS`.
- El **código de cualquier concepto** (monto del mes) y de **cualquier otra regla** (resultado del mes).

Ejemplos: `BASE / 6` (provisión de gratificaciones), `(BASE + GRATIF) / 12` (CTS), `MIN(BASE, 5000) * TASA`, `IF(MES = 12, BASE, 0)`.

> Los datos de ejemplo usan referencias de Perú (gratificaciones, CTS, vacaciones, EsSalud 9 % con base mínima, Vida Ley).
> Son solo un punto de partida: todos los conceptos, reglas, tasas y topes son editables para cualquier legislación.

## Uso

Requiere Node.js 20.19+ o 22.12+.

```bash
npm install
npm run dev       # servidor de desarrollo en http://localhost:5173
npm test          # pruebas del motor de cálculo
npm run build     # versión de producción en dist/ (sitio estático)
```

Los datos se guardan automáticamente en el navegador (`localStorage`). Usa **Empresa → Exportar respaldo** para guardarlos
en un archivo o pasarlos a otro equipo. La carpeta `dist/` puede publicarse en cualquier hosting estático
(GitHub Pages, Netlify, un servidor interno, etc.).

## Estructura

```
src/
  engine/formula.ts      evaluador seguro de fórmulas
  engine/calculate.ts    motor de cálculo del presupuesto
  data/seed.ts           datos de ejemplo
  pages/                 pantallas (presupuesto, trabajadores, puestos, conceptos, reglas, incrementos, empresa)
  components/            componentes compartidos
```
