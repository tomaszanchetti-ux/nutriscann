/**
 * La aritmética del reporte. Es la parte del sistema donde no hay ni una
 * decisión: solo multiplicaciones, sumas y una regla sobre el vacío.
 *
 * LA REGLA SOBRE EL VACÍO, que es la única idea de este archivo: `null` se
 * propaga como `null`, JAMÁS como cero. Que la ficha de la almendra no declare
 * azúcares no quiere decir que la almendra no tenga azúcares — quiere decir que
 * nadie los midió. Sumar como si fueran cero convierte "no sé" en "cero", que es
 * una afirmación, y encima una que el usuario no puede distinguir de un dato
 * real. Un plato entero de alimentos con azúcares medidos más uno sin medir da
 * `null` con su motivo escrito al lado, no una suma parcial disfrazada de total.
 */
import { OPTIONAL_KEYS, REQUIRED_KEYS, type OptionalNutrientKey } from "../kb/nutrients";
import type { Per100g } from "../kb/types";
import { ATWATER, CONFIANZA_MINIMA_PARA_UN_TOTAL } from "./constants";
import { redondear } from "./match";
import type { EngineItem, EngineTotals, Per100gEscalado, PorcentajesDeMacros, TotalesNutrientes } from "./types";

/**
 * Los valores de una porción: `per_100g × gramos / 100`.
 *
 * Los cuatro obligatorios siempre salen número (ninguna ficha entra al catálogo
 * sin ellos); los cuatro opcionales salen `null` si la ficha los tiene en
 * `null`.
 */
export function escalar(per_100g: Per100g, gramos: number): Per100gEscalado {
  const g = Number.isFinite(gramos) && gramos > 0 ? gramos : 0;
  const factor = g / 100;
  const escalado = {} as Per100gEscalado;
  for (const key of REQUIRED_KEYS) {
    escalado[key] = redondear(per_100g[key] * factor);
  }
  for (const key of OPTIONAL_KEYS) {
    const valor = per_100g[key];
    escalado[key] = valor === null || valor === undefined ? null : redondear(valor * factor);
  }
  return escalado;
}

/** Cuántos gramos hay que contarle a un item: lo que dijo la visión, saneado. */
export function gramosValidos(gramos: number): number {
  return Number.isFinite(gramos) && gramos > 0 ? redondear(gramos) : 0;
}

/**
 * Los gramos de la visión, saneados y CON EL PROBLEMA A LA VISTA.
 *
 * `gramosValidos` sola convertía un `NaN`, un `-5` o un `Infinity` en un 0 sin
 * dejar rastro: el item salía con todos sus nutrientes en 0, el escaneo se
 * declaraba `completo: true` y nadie se enteraba de que la visión no había
 * estimado nada. Es exactamente el pecado que este archivo denuncia en su
 * encabezado —convertir un "no sé" en un cero— cometido del lado de los gramos.
 *
 * Un cero de gramos NO es un alimento que no pesa: es un alimento que no se pudo
 * pesar. Con un problema declarado, el motor conserva QUÉ es (la ficha, sus
 * valores por 100 g) y declara que no puede decir CUÁNTO.
 */
export function interpretarGramos(gramos: number): { gramos: number; problema: string | null } {
  if (typeof gramos === "number" && Number.isFinite(gramos) && gramos > 0) {
    return { gramos: redondear(gramos), problema: null };
  }
  if (gramos === 0) {
    return {
      gramos: 0,
      problema: "La visión no estimó los gramos de este alimento: se sabe qué es, no cuánto hay.",
    };
  }
  return {
    gramos: 0,
    problema:
      `La visión devolvió unos gramos imposibles (${String(gramos)}): se sabe qué es, no cuánto hay. ` +
      "No se cuantifica con un cero inventado.",
  };
}

/**
 * El reparto de calorías por macro, con los factores de Atwater (4/4/9).
 *
 * NO SE NORMALIZA A 100 a propósito. La diferencia es información: alcohol,
 * fibra que USDA cuenta distinto, redondeos de la fuente. `sin_explicar` la
 * muestra en vez de esconderla repartiéndola entre los tres macros.
 */
export function porcentajesDeMacros(totales: TotalesNutrientes): PorcentajesDeMacros | null {
  if (!Number.isFinite(totales.kcal) || totales.kcal <= 0) return null;
  const pct = (gramos: number, factor: number): number => redondear((gramos * factor * 100) / totales.kcal, 1);
  const protein = pct(totales.protein_g, ATWATER.protein);
  const carbs = pct(totales.carbs_g, ATWATER.carbs);
  const fat = pct(totales.fat_g, ATWATER.fat);
  return { protein, carbs, fat, sin_explicar: redondear(100 - protein - carbs - fat, 1) };
}

/**
 * Suma los items que SÍ tienen números.
 *
 * Un item `no_catalogado` no aporta y no estorba: no suma cero (eso diría que el
 * alimento no tiene calorías), queda contado en `items_sin_datos` y baja
 * `completo` a `false`. El total que se muestra es entonces "lo que se pudo
 * medir", y el reporte tiene con qué decirlo.
 *
 * Devuelve `null` cuando NINGÚN item se pudo cuantificar: un plato sin un solo
 * número no tiene totales, tiene una cola de curación.
 */
export function sumarTotales(items: EngineItem[]): EngineTotals | null {
  const conDatos = items.filter((i) => i.nutrients !== null);
  const gramsTotal = redondear(items.reduce((s, i) => s + i.grams, 0));
  if (conDatos.length === 0) return null;

  const nutrients = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } as TotalesNutrientes;
  for (const key of REQUIRED_KEYS) {
    nutrients[key] = redondear(conDatos.reduce((s, i) => s + (i.nutrients?.[key] ?? 0), 0));
  }

  const ausentes: Partial<Record<OptionalNutrientKey, string>> = {};
  for (const key of OPTIONAL_KEYS) {
    const sinDato = conDatos.filter((i) => i.nutrients?.[key] === null || i.nutrients?.[key] === undefined);
    if (sinDato.length > 0) {
      nutrients[key] = null;
      const nombres = sinDato.map((i) => i.name_es ?? i.termino_en).join(", ");
      ausentes[key] = `La fuente no declara este valor para: ${nombres}. Un total parcial no es un total.`;
    } else {
      nutrients[key] = redondear(conDatos.reduce((s, i) => s + (i.nutrients?.[key] ?? 0), 0));
    }
  }

  // LA COMPUERTA DEL TOTAL (card 2.8). Ver `CONFIANZA_MINIMA_PARA_UN_TOTAL`.
  //
  // Mira EL MEJOR ítem del plato, no el promedio ni la suma: la pregunta es si
  // hay AL MENOS UN alimento que el motor haya sabido identificar. Cuando no lo
  // hay, la suma sigue existiendo —los ítems se muestran con su ficha y su
  // confianza, nada se borra— pero deja de poder llamarse un total completo, y
  // el reparto de macros se apaga con el motivo escrito.
  //
  // NO SE INVENTA UN CAMINO NUEVO PARA EL FRONT: `completo: false` es el aviso de
  // total parcial que ya existe desde la card 2.3, y `macro_pct: null` con su
  // `macro_pct_motivo` es el camino que ya se usa cuando no hay nada que
  // repartir. La compuerta entra por esas dos puertas y no agrega ninguna.
  const mejorConfianza = conDatos.reduce((mejor, i) => Math.max(mejor, i.confidence), 0);
  const sinNadieIdentificado = mejorConfianza < CONFIANZA_MINIMA_PARA_UN_TOTAL;

  const macro_pct = sinNadieIdentificado ? null : porcentajesDeMacros(nutrients);
  const motivoDeLaCompuerta =
    `Ningún alimento de esta foto se identificó con confianza suficiente: el mejor llegó al ` +
    `${redondear(mejorConfianza * 100, 1)} % y el mínimo para publicar un total es ` +
    `${redondear(CONFIANZA_MINIMA_PARA_UN_TOTAL * 100, 1)} %. Los alimentos y sus valores siguen abajo, ` +
    `uno por uno, pero sumarlos y llamar a eso "el total del plato" sería afirmar algo que el análisis no sostiene.`;

  return {
    nutrients,
    opcionales_ausentes: ausentes,
    macro_pct,
    macro_pct_motivo:
      macro_pct !== null
        ? null
        : sinNadieIdentificado
          ? motivoDeLaCompuerta
          : "El total de calorías es 0: no hay nada que repartir entre los macronutrientes.",
    grams_total: gramsTotal,
    grams_cuantificados: redondear(conDatos.reduce((s, i) => s + i.grams, 0)),
    items_incluidos: conDatos.length,
    items_sin_datos: items.length - conDatos.length,
    completo: conDatos.length === items.length && !sinNadieIdentificado,
  };
}
