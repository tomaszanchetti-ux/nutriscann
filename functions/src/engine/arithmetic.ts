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
import {
  ATWATER,
  CONFIANZA_MINIMA_PARA_UN_TOTAL,
  DIFERENCIA_RELEVANTE_PCT,
  FACTOR_DE_MASA_COHERENTE,
  KCAL_DE_ALCOHOL_TOLERADAS,
  KCAL_MAXIMAS_POR_100G,
  KCAL_MINIMAS_PARA_ATWATER,
  KCAL_SIN_MACROS_TOLERADAS,
  MARGEN_ATWATER_INFERIOR,
  MARGEN_ATWATER_SUPERIOR,
  TOLERANCIA_DE_MASA_G,
} from "./constants";
import { redondear } from "./match";
import type {
  EngineItem,
  EngineTotals,
  Per100gEscalado,
  PorcentajesDeMacros,
  SumaDeNutrientes,
  TotalesNutrientes,
} from "./types";

/**
 * LOS OCHO VALORES EN BLANCO: lo que viaja cuando la compuerta del total cierra.
 *
 * No es un total de cero —eso afirmaría que el plato no aporta nada— ni un objeto
 * ausente: es la misma forma de siempre con los ocho valores declarados como no
 * publicables. Ver `TotalesNutrientes` en `types.ts`.
 */
const TOTAL_SIN_PUBLICAR: TotalesNutrientes = {
  kcal: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  fiber_g: null,
  sat_fat_g: null,
  sugars_g: null,
  sodium_mg: null,
};

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

/* ===========================================================================
 * EL HALO DE PLAUSIBILIDAD (card 5.3)
 *
 * REGLA NUEVA DEL PROYECTO: **toda ficha que el motor CONSTRUYE pasa por acá
 * antes de publicarse.** Un compuesto y un compuesto parcial no vienen medidos
 * por nadie — son una cuenta nuestra sobre gramos que estimó una foto — y una
 * cuenta rota da un número con la misma cara de firmeza que uno bueno.
 *
 * QUÉ NO ES ESTO. No es un juicio sobre si la ficha es la CORRECTA: `Fish, NFS`
 * declara 238 kcal/100 g para un genérico de pescado y es perfectamente
 * plausible — está mal elegida, no es imposible (deuda 2 del Bloque 0). Este
 * halo contesta una pregunta más chica y más dura: **¿esto puede existir?**
 * Que un plato no pueda pesar más que él mismo, que nada supere a la grasa pura,
 * que las calorías tengan de dónde salir.
 *
 * QUÉ PASA CUANDO NO PASA. La composición NO se publica con cara de medida: el
 * ítem cae a la cabeza de su subfamilia o de su familia con el motivo escrito, y
 * si tampoco hay, sale sin número. Ver `resolverItem` en `analyze.ts`.
 *
 * LAS FICHAS DEL CATÁLOGO NO PASAN POR ACÁ EN RUNTIME. Vienen medidas por USDA y
 * su garantía es la trazabilidad, no un rango. Sí pasan en un TEST
 * (`catalogo.test.ts`), que es donde una ficha imposible es un hallazgo de
 * curación: medido sobre las 1.115, pasan las 1.115.
 * =========================================================================== */

/** El veredicto del halo: pasa o no pasa, y por qué no. */
export interface VeredictoDePlausibilidad {
  plausible: boolean;
  /** Vacío cuando pasa. Cada motivo es una frase para leer, no un código. */
  motivos: string[];
}

/** Lo que el halo necesita saber del plato que no está en los números. */
export interface ContextoDePlausibilidad {
  /**
   * Algún ingrediente pertenece a una familia que declara `aporta_alcohol`. Sale
   * de la taxonomía (`EntradaDeTaxonomia.aportaAlcohol`), nunca de adivinar el
   * número: el etanol aporta 7 kcal/g y no es ningún macronutriente, así que sin
   * esta declaración un mojito es matemáticamente imposible.
   */
  aporta_alcohol?: boolean;
}

/**
 * ¿ESTOS VALORES POR 100 g PUEDEN EXISTIR? Cuatro preguntas, ninguna opinable.
 *
 * 1. NINGÚN VALOR PUEDE SER NEGATIVO NI DEJAR DE SER UN NÚMERO. Es la primera
 *    porque es la que atrapa una cuenta rota de verdad: un `NaN` propagado o un
 *    peso final negativo salen de acá y no de ningún rango.
 * 2. LA MASA. Proteína + hidratos + grasa no pueden pasar de 100 g en 100 g de
 *    comida — nada pesa más que sí mismo. OJO: la fibra NO se suma aparte, ya
 *    está adentro de `carbs_g` (USDA los declara *by difference*); lo que sí se
 *    verifica es que no pase a los hidratos que la contienen. Ver
 *    `TOLERANCIA_DE_MASA_G`, donde está medido por qué.
 * 3. EL TECHO. Nada supera a la grasa pura (`KCAL_MAXIMAS_POR_100G`, 902, que es
 *    lo que declaran las dos fichas de grasa al 100 % del catálogo).
 * 4. ATWATER. Las calorías tienen que estar cerca de las que explican sus
 *    propios macros con 4/4/9, con un margen ancho por abajo (la fruta y la
 *    verdura de USDA cierran hasta un −37 %) y angosto por arriba salvo alcohol.
 */
export function esPlausible(per_100g: Per100g, contexto: ContextoDePlausibilidad = {}): VeredictoDePlausibilidad {
  const motivos: string[] = [];
  const { kcal, protein_g, carbs_g, fat_g, fiber_g } = per_100g;

  // 1 — números que son números, y ninguno negativo.
  for (const [nombre, valor] of Object.entries(per_100g)) {
    if (valor === null || valor === undefined) continue;
    if (!Number.isFinite(valor)) {
      motivos.push(`El valor de ${nombre} no es un número (${String(valor)}): la cuenta no cerró.`);
    } else if (valor < 0) {
      motivos.push(`El valor de ${nombre} salió negativo (${valor}): ningún alimento aporta menos que nada.`);
    }
  }
  if (motivos.length > 0) return { plausible: false, motivos };

  // 2 — la masa.
  const masa = protein_g + carbs_g + fat_g;
  if (masa > 100 + TOLERANCIA_DE_MASA_G) {
    motivos.push(
      `Proteínas, hidratos y grasas suman ${redondear(masa, 1)} g en 100 g de comida: un alimento no puede ` +
        `pesar más que él mismo.`,
    );
  }
  if (fiber_g !== null && fiber_g !== undefined && fiber_g > carbs_g + TOLERANCIA_DE_MASA_G) {
    motivos.push(
      `La fibra (${fiber_g} g) pasa a los hidratos que la contienen (${carbs_g} g): la fuente declara los ` +
        `hidratos por diferencia, así que la fibra ya está adentro.`,
    );
  }

  // 3 — el techo.
  if (kcal > KCAL_MAXIMAS_POR_100G) {
    motivos.push(
      `${kcal} kcal en 100 g, y el máximo posible son ${KCAL_MAXIMAS_POR_100G}: ni la grasa pura llega ahí.`,
    );
  }

  // 4 — Atwater.
  const deLosMacros = protein_g * ATWATER.protein + carbs_g * ATWATER.carbs + fat_g * ATWATER.fat;
  if (kcal >= KCAL_MINIMAS_PARA_ATWATER || deLosMacros >= KCAL_MINIMAS_PARA_ATWATER) {
    const piso = deLosMacros * (1 - MARGEN_ATWATER_INFERIOR);
    const extra = contexto.aporta_alcohol === true ? KCAL_DE_ALCOHOL_TOLERADAS : KCAL_SIN_MACROS_TOLERADAS;
    const techo = deLosMacros * (1 + MARGEN_ATWATER_SUPERIOR) + extra;
    if (kcal < piso) {
      motivos.push(
        `${kcal} kcal en 100 g cuando sus propios macronutrientes explican ${redondear(deLosMacros, 1)} con los ` +
          `factores 4/4/9: faltan más calorías de las que puede justificar ninguna fuente.`,
      );
    }
    if (kcal > techo) {
      motivos.push(
        `${kcal} kcal en 100 g cuando sus macronutrientes solo explican ${redondear(deLosMacros, 1)}: sobran ` +
          `calorías que no vienen de ningún sitio` +
          (contexto.aporta_alcohol === true ? ", ni siquiera del alcohol declarado." : "."),
      );
    }
  }

  return { plausible: motivos.length === 0, motivos };
}

/**
 * LOS GRAMOS DEL PLATO Y LA SUMA DE SUS INGREDIENTES TIENEN QUE PARECERSE.
 *
 * La visión estima dos cosas por separado —cuánto pesa el plato y cuánto pesa
 * cada ingrediente— y cuando las dos no se parecen, una está mal. **Se cree a la
 * suma de los ingredientes**: son varias estimaciones sobre objetos chicos y
 * separados, contra una sola sobre un montón.
 *
 * No devuelve un veredicto sino LOS GRAMOS QUE HAY QUE USAR, porque la
 * consecuencia acá no es callarse: es elegir el número que se puede rehacer y
 * decirlo. Ver `FACTOR_DE_MASA_COHERENTE`.
 */
export function masaCoherente(
  gramosDelPlato: number,
  gramosDeLosIngredientes: number,
): { gramos: number; motivo: string | null } {
  const plato = Number.isFinite(gramosDelPlato) && gramosDelPlato > 0 ? gramosDelPlato : 0;
  const ingredientes = Number.isFinite(gramosDeLosIngredientes) && gramosDeLosIngredientes > 0 ? gramosDeLosIngredientes : 0;
  if (plato <= 0) return { gramos: ingredientes, motivo: null };
  if (ingredientes <= 0) return { gramos: plato, motivo: null };

  const factor = plato / ingredientes;
  if (factor <= FACTOR_DE_MASA_COHERENTE && factor >= 1 / FACTOR_DE_MASA_COHERENTE) {
    return { gramos: plato, motivo: null };
  }
  return {
    gramos: redondear(ingredientes),
    motivo:
      `La visión estimó ${redondear(plato)} g para el plato entero y ${redondear(ingredientes)} g sumando sus ` +
      `ingredientes uno por uno: los dos números no pueden ser del mismo plato. Se usó la suma de los ` +
      `ingredientes, que es la que se puede rehacer mirando la composición.`,
  };
}

/**
 * UN REPARTO SUMA 100, Y NINGÚN PORCENTAJE SE VA DE 0..100 (card 5.1).
 *
 * QUÉ ESTABA MAL, medido en producción el 02/09/2026. Hasta esta card cada macro
 * se dividía por las kcal DE LA FICHA: `gramos × factor / kcal_de_la_fuente`. Con
 * la banana (`fdc-173944`, 89 kcal/100 g) eso daba **`carbs: 102,7 %`** y un
 * `sin_explicar: −10,9`; con las cerezas (`fdc-171719`), 101,7 % y −11,3. El
 * motivo no era un error de cuenta: USDA calcula las calorías de la fruta con
 * factores específicos —3,6 kcal/g de hidratos en la banana, no 4— y dividir una
 * cuenta hecha con 4/4/9 por un total hecho con otros factores no da un reparto,
 * da dos cosas distintas puestas en una fracción. Un 102,7 % es lo primero que
 * ve cualquiera que mire su plato, y no hay letra chica que lo arregle.
 *
 * LA REGLA NUEVA: cada macro es su parte de LAS CALORÍAS QUE APORTAN LOS MACROS.
 *
 *     kcal_de_los_macros = P×4 + C×4 + F×9
 *     porcentaje_i       = kcal_i / kcal_de_los_macros × 100
 *
 * El denominador es la suma de los tres numeradores, así que los tres suman 100
 * por construcción y ninguno puede salir de 0..100. No hay nada que normalizar:
 * la fracción ya es un reparto.
 *
 * LA DIFERENCIA NO SE PIERDE, CAMBIA DE LUGAR. `kcal_de_los_macros` casi nunca
 * coincide con las kcal de la ficha, y esa distancia sigue siendo información:
 * viaja con signo en `kcal_fuera_de_macros` y `diferencia_pct`, y cuando pasa el
 * umbral de `DIFERENCIA_RELEVANTE_PCT` viene además con el motivo escrito. Lo
 * que ya no hace es deformar el reparto: antes se colaba adentro de los tres
 * porcentajes y los empujaba por encima de 100.
 *
 * EL SIGNO, para leerlo sin dudar: la diferencia se mide contra las kcal de la
 * FUENTE, que son las que el reporte publica en el centro del anillo.
 *   · negativo → los macros con 4/4/9 explican MÁS calorías que las publicadas
 *     (la banana: −10,9 %). Fuente con factores propios, o fibra contada aparte.
 *   · positivo → la fuente declara calorías que ningún macro explica: alcohol,
 *     o el resto de sus propios redondeos.
 */
export function porcentajesDeMacros(totales: SumaDeNutrientes): PorcentajesDeMacros | null {
  if (!Number.isFinite(totales.kcal) || totales.kcal <= 0) return null;

  const kcalDeLosMacros =
    totales.protein_g * ATWATER.protein + totales.carbs_g * ATWATER.carbs + totales.fat_g * ATWATER.fat;

  // ALCOHOL PURO, Y CUALQUIER OTRO PLATO CON CALORÍAS Y SIN MACROS: no hay
  // reparto. `null` con su motivo, nunca una división por cero ni tres ceros que
  // dibujarían un anillo vacío como si fuera un dato.
  if (!Number.isFinite(kcalDeLosMacros) || kcalDeLosMacros <= 0) return null;

  const [protein, carbs, fat] = repartoQueSuma100([
    (totales.protein_g * ATWATER.protein * 100) / kcalDeLosMacros,
    (totales.carbs_g * ATWATER.carbs * 100) / kcalDeLosMacros,
    (totales.fat_g * ATWATER.fat * 100) / kcalDeLosMacros,
  ]);

  const diferencia = totales.kcal - kcalDeLosMacros;
  const diferencia_pct = redondear((diferencia * 100) / totales.kcal, 1);

  return {
    protein,
    carbs,
    fat,
    kcal_fuera_de_macros: redondear(diferencia, 1),
    diferencia_pct,
    motivo_de_la_diferencia:
      Math.abs(diferencia_pct) < DIFERENCIA_RELEVANTE_PCT
        ? null
        : diferencia < 0
          ? "Con los factores 4/4/9 los macronutrientes suman más calorías de las que declara la fuente. " +
            "Pasa sobre todo con la fruta y las legumbres, donde la fuente calcula las calorías con " +
            "factores propios más bajos, y con la fibra, que cuenta aparte."
          : "La fuente declara más calorías de las que aportan proteínas, hidratos y grasas. " +
            "Esa diferencia son calorías de otro origen —el alcohol, sobre todo— o el resto de los " +
            "redondeos de la propia ficha.",
  };
}

/**
 * Los tres porcentajes a un decimal, sumando 100,0 EXACTO.
 *
 * Redondear cada uno por su cuenta puede dejar la suma en 99,9 o en 100,1: tres
 * redondeos de hasta media décima cada uno. Es poquísimo, pero es exactamente la
 * clase de número imposible que esta card vino a sacar de la pantalla — y en la
 * lista del reporte los tres porcentajes se leen uno debajo del otro, donde
 * cualquiera los suma.
 *
 * El reparto del resto va POR MAYOR SOBRANTE (el método de los restos mayores,
 * el mismo con el que se reparten escaños): las décimas que faltan se le dan a
 * los macros cuya parte decimal quedó más cerca de subir. Así ningún porcentaje
 * se aleja más de una décima de su valor real, que es el error mínimo posible
 * con un decimal.
 */
function repartoQueSuma100(exactos: readonly [number, number, number]): [number, number, number] {
  const decimas = exactos.map((valor) => valor * 10);
  const piso = decimas.map((valor) => Math.floor(valor));
  const porSobrante = decimas
    .map((valor, indice) => ({ indice, sobrante: valor - Math.floor(valor) }))
    .sort((uno, otro) => otro.sobrante - uno.sobrante);

  let faltan = 1000 - piso.reduce((suma, valor) => suma + valor, 0);
  for (const { indice } of porSobrante) {
    if (faltan <= 0) break;
    piso[indice] = (piso[indice] ?? 0) + 1;
    faltan -= 1;
  }
  return [(piso[0] ?? 0) / 10, (piso[1] ?? 0) / 10, (piso[2] ?? 0) / 10];
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

  const nutrients = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } as SumaDeNutrientes;
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
  //
  // DOS PUERTAS PARA "SÉ QUÉ ES ESTO" (DT-37, card 6.5). La confianza sola no
  // alcanzaba y está medido: la lasaña del plato 05 del golden llegó a SU ficha
  // correcta y no publicó total, porque la vía que la encontró —un alias corto
  // dentro de un nombre largo— puntúa 0,084. El piso existe para cortar "no sé
  // qué es esto", no "sé qué es y lo encontré por una vía floja", y esas dos
  // cosas se distinguen preguntando si la ficha NOMBRA lo que la visión
  // describió (`identidad_respaldada`, ver `RESPALDO_MINIMO_DE_IDENTIDAD`).
  //
  // Y LA MITAD DE VISIÓN SIGUE CONTANDO: la segunda puerta reemplaza la mitad
  // del matching, no la de la visión. Un plato donde el modelo dijo "creo, con
  // un 5 %, que esto es una lasaña" no publica total aunque la ficha nombre la
  // lasaña entera — ahí el que no sabe qué es es el que miró la foto. Se compara
  // contra la misma vara, que es la única que este archivo conoce.
  const mejorConfianza = conDatos.reduce((mejor, i) => Math.max(mejor, i.confidence), 0);
  const algunaIdentidadRespaldada = conDatos.some(
    (i) => i.identidad_respaldada === true && i.confidence_vision >= CONFIANZA_MINIMA_PARA_UN_TOTAL,
  );
  const sinNadieIdentificado = mejorConfianza < CONFIANZA_MINIMA_PARA_UN_TOTAL && !algunaIdentidadRespaldada;

  const macro_pct = sinNadieIdentificado ? null : porcentajesDeMacros(nutrients);
  const motivoDeLaCompuerta =
    `Ningún alimento de esta foto se identificó con confianza suficiente: el mejor llegó al ` +
    `${redondear(mejorConfianza * 100, 1)} % y el mínimo para publicar un total es ` +
    `${redondear(CONFIANZA_MINIMA_PARA_UN_TOTAL * 100, 1)} %; tampoco hay ninguna ficha que nombre lo ` +
    `que se describió. Los alimentos y sus valores siguen abajo, ` +
    `uno por uno, pero sumarlos y llamar a eso "el total del plato" sería afirmar algo que el análisis no sostiene.`;

  // LA COMPUERTA CIERRA ENTERA (card 6.1). Antes apagaba la declaración y dejaba
  // los números adentro del JSON; ahora el payload dice lo mismo que la
  // declaración. Los ítems no se tocan: cada alimento sigue con sus valores.
  return {
    nutrients: sinNadieIdentificado ? TOTAL_SIN_PUBLICAR : nutrients,
    ...(sinNadieIdentificado ? { total_no_publicable: true as const } : {}),
    opcionales_ausentes: ausentes,
    macro_pct,
    // DOS AUSENCIAS DISTINTAS DEL REPARTO, Y NO SE LEEN IGUAL (card 5.1). Sin
    // calorías no hay nada que repartir; CON calorías y sin un solo gramo de
    // macro —alcohol puro— sí las hay, pero no vienen de ningún macronutriente.
    // Decir "el total es 0" en ese caso sería mentir sobre un total que no es 0.
    macro_pct_motivo:
      macro_pct !== null
        ? null
        : sinNadieIdentificado
          ? motivoDeLaCompuerta
          : nutrients.kcal <= 0
            ? "El total de calorías es 0: no hay nada que repartir entre los macronutrientes."
            : "Ninguna de las calorías de este plato viene de proteínas, hidratos o grasas: " +
              "no hay reparto de macronutrientes que mostrar.",
    grams_total: gramsTotal,
    grams_cuantificados: redondear(conDatos.reduce((s, i) => s + i.grams, 0)),
    items_incluidos: conDatos.length,
    items_sin_datos: items.length - conDatos.length,
    completo: conDatos.length === items.length && !sinNadieIdentificado,
  };
}
