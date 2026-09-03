/**
 * Formato de números para pantalla, en español.
 *
 * Un solo lugar: si el reporte muestra "24,2 g" en la lista y "24.2 g" en el
 * donut, el que lee deja de creerle a los dos.
 */

const ENTERO = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const UN_DECIMAL = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Calorías: siempre enteras. Media caloría no la mide nadie. */
export function kcal(valor: number): string {
  return ENTERO.format(Math.round(valor));
}

/** Gramos con un decimal: "24,2". */
export function gramos(valor: number): string {
  return UN_DECIMAL.format(valor);
}

/** Gramos redondeados, para las porciones del plato: "180". */
export function gramosEnteros(valor: number): string {
  return ENTERO.format(Math.round(valor));
}

/**
 * Porcentaje con un decimal, con signo cuando se pide.
 *
 * El signo lo pide la letra chica del donut (`diferencia_pct`: cuánto se apartan
 * las calorías de la fuente de las que suman los macronutrientes). Se dibuja con
 * el MENOS TIPOGRÁFICO (−, U+2212) y no con el guion del teclado: en una línea
 * de texto un guion se lee como raya y el número parece un rango.
 */
export function porcentaje(valor: number, conSigno = false): string {
  const texto = UN_DECIMAL.format(Math.abs(valor));
  if (!conSigno) return `${texto} %`;
  return `${valor < 0 ? "−" : "+"}${texto} %`;
}

/**
 * Porcentaje ENTERO, sin coma: "43 %".
 *
 * Es el de la lista de macros del reporte desde el Q/A de la WS08. El motivo es
 * de pantalla y no de precisión: en un móvil, "43,2 %" y "9,7 %" tienen anchos
 * distintos aunque la columna sea tabular, y la lista se veía desalineada. El
 * decimal no cambiaba ninguna decisión de quien mira su plato — y donde sí
 * importa, en la nota de lo que queda sin explicar, se sigue usando
 * `porcentaje()` con su decimal.
 */
export function porcentajeEntero(valor: number): string {
  return `${ENTERO.format(Math.round(valor))} %`;
}

/** La confianza, de 0..1 a un porcentaje entero: 0,248 → "25 %". */
export function confianza(valor: number): string {
  return `${ENTERO.format(Math.round(valor * 100))} %`;
}

/**
 * Tres peldaños para la confianza, para poder darle color sin inventar una
 * escala nueva: son los mismos cortes que usa la curación del catálogo para los
 * aliases (1,0 / 0,8 / 0,6 / 0,5 — ver `kb/curation/README.md`), redondeados a
 * lo que se puede decir en una palabra.
 */
export type NivelDeConfianza = "alta" | "media" | "baja";

export function nivelDeConfianza(valor: number): NivelDeConfianza {
  if (valor >= 0.8) return "alta";
  if (valor >= 0.5) return "media";
  return "baja";
}
