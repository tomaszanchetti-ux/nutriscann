/**
 * EL BANCO DE PRUEBAS DEL GOLDEN SET, OFFLINE.
 *
 * Vive al lado de `testing.ts` y por la misma razón: es el otro archivo de
 * `functions/src` que lee del disco, y lee del disco para traer EVIDENCIA YA
 * GRABADA — las respuestas de `golden/set-30/respuestas*` — en vez de volver a
 * llamar a nada. Ninguna función de acá llama a la API de Anthropic ni al
 * endpoint: una corrida del golden set cuesta 30 llamadas al modelo, y lo que
 * quedó grabado de esas corridas se puede volver a jugar contra el motor las
 * veces que haga falta sin gastar un centavo más.
 *
 * TRES HERRAMIENTAS, Y LAS TRES MIDEN COSAS DISTINTAS:
 *
 *   · `replayDeCorrida` — vuelve a pasar por el matcher los términos que la
 *     visión escribió y compara contra la ficha que el motor eligió aquel día.
 *     Es la única forma de atribuirle un cambio AL MOTOR: mismo término, misma
 *     foto, otro resultado.
 *   · `criterio2` — el criterio 2 del golden set, recalibrado (DT-28, punto 4):
 *     los kcal se juzgan contra los gramos QUE LA VISIÓN REPORTÓ, no contra los
 *     que la predicción supuso.
 *   · `compararCorridas` — cuánto se movió LA VISIÓN entre dos corridas sobre
 *     las mismas fotos (DT-28, punto 5). Es medición, no arreglo.
 *
 * LO QUE LAS TRES CORRIDAS GRABADAS NO TIENEN, y hay que decirlo antes de leer
 * cualquier número de acá: **`termino_es` no existía en el expediente** cuando se
 * grabaron (DT-25). El `EngineItem` guardaba `termino_en` y nada más, así que un
 * replay de v1, v2 o v3 solo puede volver a jugar la mitad inglesa de lo que dijo
 * la visión, y lo que mide sobre el matching es un PISO, no el resultado completo.
 *
 * DESDE LA WS07 EL EXPEDIENTE SÍ LO GUARDA, y este archivo ya sabe usarlo: una
 * corrida grabada que traiga `termino_es` se re-juega ENTERA, con los dos nombres,
 * exactamente como el motor decidió aquel día. Las tres corridas viejas siguen
 * saliendo `no_comparable_es` y eso no se maquilla: el dato no está, y suponerlo
 * sería inventar evidencia. La primera corrida que lo aproveche es la v4.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogIndex } from "./catalog";
import { buscarAlimento, buscarConDosNombres } from "./match";
import { redondear } from "./match";
import { raizDelRepo } from "./testing";

// ---------------------------------------------------------------------------
// Lo que hay grabado en disco
// ---------------------------------------------------------------------------

/** Un ítem tal como quedó grabado en `golden/set-30/respuestas…/NN-slug.json`. */
export interface ItemGrabado {
  termino_en: string;
  /**
   * El español que dijo la visión, si la corrida es POSTERIOR a la DT-25.
   *
   * OPCIONAL EN EL TIPO Y OBLIGATORIO EN EL EXPEDIENTE, y la asimetría es el
   * punto: `EngineItem.termino_es` existe siempre (vale `""` cuando la visión no
   * dijo nada en español), pero las corridas v1, v2 y v3 se grabaron antes de que
   * el campo existiera y no lo traen. Por eso acá la clave AUSENTE significa "esta
   * corrida es vieja" y `""` significa "la visión no lo dijo" — dos cosas
   * distintas que el replay tiene que poder separar.
   */
  termino_es?: string;
  food_id: string | null;
  name_es: string | null;
  grams: number;
  confidence: number;
  match: string;
  /** El motivo escrito. Dice, entre otras cosas, POR QUÉ IDIOMA entró el match. */
  motivo?: string;
}

/**
 * POR QUÉ IDIOMA ENTRÓ EL MATCH, leído del motivo que el motor dejó escrito.
 *
 * Es lo que rescata al replay de ser inútil. `food_es` no se guarda (DT-25), pero
 * el motivo sí, y el motivo lo dice con todas las letras: "Coincidencia exacta con
 * el nombre **en inglés** del catálogo", "Coincidencia aproximada **en español**
 * con …". Un ítem que aquel día entró por el inglés se puede volver a jugar entero
 * y comparar sin reservas; uno que entró por el español no, y hay que decirlo en
 * vez de contarlo como una pérdida.
 */
export function idiomaDelMotivo(motivo: string | undefined): "en" | "es" | null {
  if (typeof motivo !== "string") return null;
  if (motivo.includes("en inglés")) return "en";
  if (motivo.includes("en español")) return "es";
  return null;
}

/** Los totales tal como quedaron grabados. */
export interface TotalesGrabados {
  nutrients: { kcal: number | null };
  grams_total: number;
  grams_cuantificados: number;
  items_incluidos: number;
  items_sin_datos: number;
  completo: boolean;
}

/** Una respuesta grabada del endpoint, con lo poco que estas medidas necesitan. */
export interface PlatoGrabado {
  id: string;
  is_food: boolean;
  items: ItemGrabado[];
  totals: TotalesGrabados | null;
  /** Con qué catálogo se calculó esa respuesta. `meta.kb_version` del expediente. */
  kb_version: string | null;
}

/** El directorio del golden set dentro del repo. */
export function raizDelGolden(): string {
  return resolve(raizDelRepo(), "golden");
}

/**
 * Las respuestas grabadas de una corrida, ordenadas por número de plato.
 *
 * `corrida` es el nombre del directorio dentro de `golden/set-30/`
 * (`respuestas`, `respuestas-v2`, …). Lanza si no existe: una medición sobre un
 * directorio vacío no es una medición floja, es una mentira.
 */
export function corridaGrabada(corrida: string, set = "set-30"): PlatoGrabado[] {
  const dir = resolve(raizDelGolden(), set, corrida);
  if (!existsSync(dir)) throw new Error(`no existe la corrida grabada ${set}/${corrida}`);
  const archivos = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (archivos.length === 0) throw new Error(`la corrida ${set}/${corrida} no tiene ni una respuesta`);
  return archivos.map((archivo) => {
    const crudo = JSON.parse(readFileSync(resolve(dir, archivo), "utf8")) as Partial<PlatoGrabado> & {
      meta?: { kb_version?: string };
    };
    return {
      id: archivo.replace(/\.json$/, ""),
      is_food: crudo.is_food === true,
      items: Array.isArray(crudo.items) ? crudo.items : [],
      totals: crudo.totals ?? null,
      kb_version: crudo.meta?.kb_version ?? null,
    };
  });
}

/**
 * Las `kb_version` distintas con las que se calculó una corrida. Normalmente una.
 *
 * Existe para poder DECIR EN VOZ ALTA cuándo un replay no es comparable: la
 * corrida v1 del golden set se calculó con el catálogo 3.0.0 y la v2 con el
 * 3.1.0, así que jugar las dos contra el mismo índice mezcla el motor con la
 * curación. Ver el encabezado de `replayDeCorrida`.
 */
export function versionesDeLaCorrida(corrida: PlatoGrabado[]): string[] {
  return [...new Set(corrida.map((p) => p.kb_version).filter((v): v is string => v !== null))].sort();
}

/** Un plato del `criterios.json`, transcrito de `predicciones.md`. */
export interface CriterioDePlato {
  id: string;
  comida: boolean;
  gramos_previstos?: number | null;
  kcal_min?: number | null;
  kcal_max?: number | null;
  nota?: string;
}

export interface CriteriosDelSet {
  denominador_criterio_2: number;
  umbral_criterio_2: number;
  piso_de_gramos_cuantificados: number;
  platos: CriterioDePlato[];
}

export function criteriosDelSet(set = "set-30"): CriteriosDelSet {
  return JSON.parse(readFileSync(resolve(raizDelGolden(), set, "criterios.json"), "utf8")) as CriteriosDelSet;
}

// ---------------------------------------------------------------------------
// 1 — Replay: volver a jugar los términos grabados contra el motor de hoy
// ---------------------------------------------------------------------------

export type CambioDeReplay =
  /** Estaba en silencio y hoy encuentra ficha. EVIDENCIA LIMPIA a favor. */
  | "destrabado"
  /** Estaba en silencio y sigue en silencio. */
  | "sigue_en_silencio"
  /** Entró por el inglés y el inglés vuelve a dar la misma ficha. */
  | "resuelto_igual"
  /** Entró por el inglés y hoy el inglés da OTRA. Se justifica de a uno. */
  | "otra_ficha"
  /** Entró por el inglés y hoy el inglés no da nada. EVIDENCIA LIMPIA en contra. */
  | "perdido"
  /** Entró por el nombre ESPAÑOL: el replay está tuerto y no puede juzgarlo. */
  | "no_comparable_es";

export interface FilaDeReplay {
  plato: string;
  termino_en: string;
  /** La ficha que el motor eligió el día de la corrida (con los DOS nombres). */
  food_id_grabado: string | null;
  /** La ficha que el motor de hoy elige con el término INGLÉS solo. */
  food_id_actual: string | null;
  confianza_actual: number;
  nombre_actual: string | null;
  cambio: CambioDeReplay;
}

export interface ResumenDeReplay {
  filas: FilaDeReplay[];
  items: number;
  /** Ítems que la corrida declaró `no_catalogado`: silencio de los dos idiomas. */
  silencios_grabados: number;
  /** De esos silencios, cuántos abre el motor de hoy con solo el inglés. */
  destrabados: number;
  /** Ítems que entraron por el inglés y hoy el inglés resuelve a OTRA ficha. */
  otra_ficha: number;
  /** Ítems que entraron por el inglés y hoy el inglés no encuentra nada. */
  perdidos: number;
  /** Ítems que entraron por el nombre español. El replay no los puede juzgar. */
  no_comparables: number;
  /**
   * Ítems re-jugados CON LOS DOS NOMBRES, porque la corrida grabó `termino_es`
   * (DT-25). Es la medida de cuánto del replay dejó de estar tuerto: en una
   * corrida vieja vale 0 y `no_comparables` se lleva la mitad de los ítems.
   */
  con_dos_nombres: number;
}

/**
 * Vuelve a jugar los términos de una corrida grabada contra un índice.
 *
 * PARA QUÉ SIRVE Y PARA QUÉ NO, porque la mitad de esta función es la advertencia.
 *
 * SIRVE PARA MEDIR SILENCIOS DESTRABADOS, y ahí la evidencia es limpia: si la
 * corrida grabó `match: "no_catalogado"`, entonces aquel día NI el nombre inglés
 * NI el español encontraron nada. Si hoy el nombre inglés SOLO encuentra ficha,
 * el motor abrió algo que antes no tenía, sin discusión posible.
 *
 * NO PUEDE JUZGAR LOS ÍTEMS QUE ENTRARON POR EL ESPAÑOL **EN UNA CORRIDA VIEJA**,
 * y hay que decirlo fuerte: las respuestas v1, v2 y v3 se grabaron antes de la
 * DT-25 y no traen `termino_es`. El expediente guardaba `termino_en` y nada más,
 * así que un ítem que aquel día matcheó POR EL NOMBRE ESPAÑOL —la lasaña por el
 * alias `Lasaña`, el jamón por `Jamón serrano`— volvería del replay como si el
 * motor lo hubiera perdido. No lo perdió: el replay está tuerto. Se los reconoce
 * por el MOTIVO, que sí quedó grabado y dice el idioma (`idiomaDelMotivo`), y
 * salen marcados `no_comparable_es`. Eso NO se maquilla reconstruyendo el término
 * español a partir del nombre de la ficha: sería inventar la entrada y después
 * felicitarse por acertar la salida.
 *
 * DESDE LA WS07 EL DATO ESTÁ. Una corrida grabada con el expediente nuevo trae
 * `termino_es` en cada ítem, y ahí el replay deja de estar tuerto: se re-juega con
 * `buscarConDosNombres`, que es exactamente la función que decidió el match aquel
 * día, y no queda ni un `no_comparable_es`. `con_dos_nombres` en el resumen dice
 * cuántos ítems se pudieron re-jugar enteros — es el número que separa una corrida
 * vieja de una nueva.
 *
 * LOS QUE ENTRARON POR EL INGLÉS SÍ SE JUZGAN, y ahí `perdido` es una regresión
 * de verdad: `buscarConDosNombres` es determinístico, así que si aquel día ganó el
 * inglés, volver a jugar el inglés solo tiene que dar exactamente lo mismo.
 *
 * ESTO NO REEMPLAZA AL BARRIDO. La red de regresión que manda sigue siendo la de
 * `catalogo.test.ts`, que barre las 1.022 fichas con sus sufijos: son 21.000
 * consultas contra las 68 de una corrida.
 *
 * Y PARA ATRIBUIRLE UN CAMBIO AL MOTOR, el índice tiene que ser el de la
 * `kb_version` con la que se grabó la corrida: contra un catálogo posterior, lo
 * que se ve es la suma del motor y de la curación. Por eso el índice entra por
 * parámetro y esta función no lo elige.
 */
export function replayDeCorrida(corrida: PlatoGrabado[], index: CatalogIndex): ResumenDeReplay {
  const filas: FilaDeReplay[] = [];
  let conDosNombres = 0;
  for (const plato of corrida) {
    for (const item of plato.items) {
      // LA BIFURCACIÓN DE LA DT-25, Y ES SOBRE LA PRESENCIA DE LA CLAVE, no
      // sobre su contenido. Una corrida posterior a la DT-25 grabó `termino_es`
      // siempre —vacío si la visión no dijo nada—, así que si la clave está, se
      // sabe TODO lo que el motor supo aquel día y el ítem se re-juega entero con
      // `buscarConDosNombres`, que es la función que decidió el match. Si no
      // está, la corrida es vieja y falta la mitad de la entrada: ahí el replay
      // sigue tuerto y lo dice.
      const completo = typeof item.termino_es === "string";
      if (completo) conDosNombres += 1;
      const r = completo
        ? buscarConDosNombres(item.termino_en, item.termino_es ?? "", index)
        : buscarAlimento(item.termino_en, index);
      const actual = r === null ? null : r.ficha.id;
      const estabaEnSilencio = item.match === "no_catalogado";
      const idioma = idiomaDelMotivo(item.motivo);
      const cambio: CambioDeReplay = estabaEnSilencio
        ? actual === null
          ? "sigue_en_silencio"
          : "destrabado"
        : // Con los dos términos grabados no hay nada que no se pueda juzgar: la
          // entrada es la misma y `buscarConDosNombres` es determinística.
          !completo && idioma !== "en"
          ? "no_comparable_es"
          : actual === null
            ? "perdido"
            : actual === item.food_id
              ? "resuelto_igual"
              : "otra_ficha";
      filas.push({
        plato: plato.id,
        termino_en: item.termino_en,
        food_id_grabado: item.food_id,
        food_id_actual: actual,
        confianza_actual: r === null ? 0 : r.confianza_match,
        nombre_actual: r === null ? null : (r.ficha.names.es ?? r.ficha.names.en),
        cambio,
      });
    }
  }
  const contar = (c: CambioDeReplay): number => filas.filter((f) => f.cambio === c).length;
  return {
    filas,
    items: filas.length,
    silencios_grabados: contar("destrabado") + contar("sigue_en_silencio"),
    destrabados: contar("destrabado"),
    otra_ficha: contar("otra_ficha"),
    perdidos: contar("perdido"),
    no_comparables: contar("no_comparable_es"),
    con_dos_nombres: conDosNombres,
  };
}

// ---------------------------------------------------------------------------
// 2 — El criterio 2, recalibrado (DT-28 · punto 4)
// ---------------------------------------------------------------------------

export type VeredictoDelCriterio2 =
  | "en_rango"
  | "parcial_declarado"
  | "sin_total_correcto"
  | "fuera_de_rango"
  | "sin_criterio";

export interface FilaDelCriterio2 {
  plato: string;
  kcal: number | null;
  /** El rango escrito en `predicciones.md`, tal cual. */
  rango_escrito: [number, number] | null;
  /** El mismo rango llevado a los gramos que la visión reportó. */
  rango_ajustado: [number, number] | null;
  gramos_previstos: number | null;
  gramos_reportados: number | null;
  factor: number | null;
  veredicto: VeredictoDelCriterio2;
  motivo: string;
}

export interface ResultadoDelCriterio2 {
  filas: FilaDelCriterio2[];
  en_regla: number;
  denominador: number;
  porcentaje: number;
  pasa: boolean;
}

/**
 * EL CRITERIO 2, JUZGADO CONTRA LOS GRAMOS QUE LA VISIÓN REPORTÓ.
 *
 * QUÉ ESTABA MAL. El rango de cada plato se calculó multiplicando la ficha por
 * unos gramos SUPUESTOS: `180 g × 0,61 = 110 kcal → rango 70–140`. Cuando la
 * visión mira la foto y dice 600 g donde la predicción supuso 450, el total sale
 * de rango sin que el motor haya hecho nada mal — la ficha es la correcta y la
 * multiplicación es exacta. Medido en la corrida v2: de los 6 platos fuera de
 * rango, **5 tenían la ficha correcta y aritmética impecable**, y uno de esos 5
 * fallaba por 3,6 kcal. El criterio estaba midiendo la predicción de gramaje
 * tanto como al producto.
 *
 * QUÉ HACE ESTA VERSIÓN. Lleva el rango escrito a los gramos que la visión
 * efectivamente reportó, con una regla de tres:
 *
 *     rango_ajustado = rango_escrito × (gramos_cuantificados / gramos_previstos)
 *
 * Y SE USAN LOS GRAMOS CUANTIFICADOS, no los gramos totales del plato, que es la
 * parte que hay que justificar: lo que este criterio mide es si LA ARITMÉTICA DEL
 * MOTOR da un número creíble para la comida que el motor sí supo identificar. Un
 * alimento que quedó sin ficha no aporta kcal y tampoco tiene por qué inflar el
 * denominador — el silencio ya se mide en el criterio 5, y contarlo dos veces
 * sería castigar el mismo hecho en dos lugares.
 *
 * LO QUE NO CAMBIA: la cláusula del parcial declarado. Un plato con
 * `completo: false` y al menos el 70 % de sus gramos cuantificados sigue en
 * regla, porque ahí el motor está declarando por escrito lo que le falta.
 *
 * EL LÍMITE DE LA REGLA DE TRES, declarado: **supone que todo el plato tiene la
 * misma densidad calórica**, y ningún plato la tiene. Se ve en los dos platos
 * donde las dos bases dan distinto, y por eso las dos se reportan:
 *
 *   · el 27 (bocadillo + dos cervezas) tiene 890 g reportados contra 220
 *     previstos, pero 630 de esos gramos son cerveza sin ficha que no aporta ni
 *     una kcal. Contra los gramos TOTALES el techo se cuadruplica y el plato se
 *     cae; contra los CUANTIFICADOS entra;
 *   · el 22 (desayuno) es al revés: lo que quedó adentro de la suma es lo denso
 *     (salchicha, jamón, queso) y lo que quedó afuera es lo liviano (alubias,
 *     pepino), así que contra los cuantificados el techo baja demasiado.
 *
 * Por eso el default es `cuantificados` —compara los kcal que se sumaron contra
 * la masa que se sumó, que es aritmética del motor y de nadie más— y `totales`
 * queda disponible para leer el otro lado. Sobre la corrida v2 las dos bases dan
 * el MISMO resultado (23 de 26), que es la mejor señal de que el número no
 * depende de esta elección.
 *
 * LO QUE ESTE CRITERIO SIGUE SIN MEDIR, dicho antes de que alguien lea el
 * porcentaje: si la ficha era la correcta. Un plato puede caer en rango con la
 * ficha equivocada (dos errores que se compensan) y puede caerse del rango con la
 * ficha correcta. Eso lo miden los criterios 1 y 3.
 */
export function criterio2(
  corrida: PlatoGrabado[],
  criterios: CriteriosDelSet,
  opciones: { contra?: "cuantificados" | "totales" } = {},
): ResultadoDelCriterio2 {
  const contra = opciones.contra ?? "cuantificados";
  const porId = new Map(criterios.platos.map((p) => [p.id, p]));
  const filas: FilaDelCriterio2[] = [];

  for (const plato of corrida) {
    const criterio = porId.get(plato.id);
    if (criterio === undefined || !criterio.comida) continue;

    const kcal = plato.totals?.nutrients.kcal ?? null;
    const min = criterio.kcal_min ?? null;
    const max = criterio.kcal_max ?? null;
    const previstos = criterio.gramos_previstos ?? null;

    // El plato sin rango escrito (la arepa): el comportamiento correcto era no
    // publicar número, y eso es lo que se mide.
    if (min === null || max === null || previstos === null || previstos <= 0) {
      const sinTotal = kcal === null;
      filas.push({
        plato: plato.id,
        kcal,
        rango_escrito: null,
        rango_ajustado: null,
        gramos_previstos: previstos,
        gramos_reportados: null,
        factor: null,
        veredicto: sinTotal ? "sin_total_correcto" : "fuera_de_rango",
        motivo: sinTotal
          ? "Sin rango escrito: el acierto era no publicar un total, y no lo publicó."
          : "Sin rango escrito: el acierto era no publicar un total, y publicó uno.",
      });
      continue;
    }

    const reportados =
      plato.totals === null
        ? 0
        : contra === "totales"
          ? plato.totals.grams_total
          : plato.totals.grams_cuantificados;
    const cubiertos = plato.totals === null || plato.totals.grams_total === 0
      ? 0
      : plato.totals.grams_cuantificados / plato.totals.grams_total;

    // La cláusula del parcial declarado, intacta desde `evaluacion.md`.
    if (plato.totals !== null && !plato.totals.completo && cubiertos >= criterios.piso_de_gramos_cuantificados) {
      filas.push({
        plato: plato.id,
        kcal,
        rango_escrito: [min, max],
        rango_ajustado: null,
        gramos_previstos: previstos,
        gramos_reportados: reportados,
        factor: null,
        veredicto: "parcial_declarado",
        motivo:
          `El motor declaró el total incompleto y cuantificó el ${redondear(cubiertos * 100, 1)} % de los gramos ` +
          `(el piso es ${redondear(criterios.piso_de_gramos_cuantificados * 100, 1)} %).`,
      });
      continue;
    }

    if (kcal === null || reportados <= 0) {
      filas.push({
        plato: plato.id,
        kcal,
        rango_escrito: [min, max],
        rango_ajustado: null,
        gramos_previstos: previstos,
        gramos_reportados: reportados,
        factor: null,
        veredicto: "fuera_de_rango",
        motivo: "El plato tenía un rango escrito y no publicó ningún total cuantificado.",
      });
      continue;
    }

    const factor = reportados / previstos;
    const ajustado: [number, number] = [redondear(min * factor, 1), redondear(max * factor, 1)];
    const dentro = kcal >= ajustado[0] && kcal <= ajustado[1];
    filas.push({
      plato: plato.id,
      kcal,
      rango_escrito: [min, max],
      rango_ajustado: ajustado,
      gramos_previstos: previstos,
      gramos_reportados: reportados,
      factor: redondear(factor, 3),
      veredicto: dentro ? "en_rango" : "fuera_de_rango",
      motivo:
        `${kcal} kcal contra ${ajustado[0]}–${ajustado[1]} — el rango escrito (${min}–${max}) llevado de ` +
        `${previstos} g previstos a ${redondear(reportados, 1)} g reportados (×${redondear(factor, 3)}).`,
    });
  }

  const en_regla = filas.filter((f) => f.veredicto !== "fuera_de_rango").length;
  const denominador = criterios.denominador_criterio_2;
  const porcentaje = denominador === 0 ? 0 : redondear((en_regla / denominador) * 100, 1);
  return { filas, en_regla, denominador, porcentaje, pasa: en_regla / denominador >= criterios.umbral_criterio_2 };
}

// ---------------------------------------------------------------------------
// 3 — La estabilidad de la visión (DT-28 · punto 5)
// ---------------------------------------------------------------------------

/**
 * Cuánto puede moverse un gramaje sin que se lo cuente como un cambio.
 *
 * El número sale del enunciado de la deuda ("gramos ±30 %") y no de una
 * intuición. Por debajo de eso dos estimaciones de la misma foto son la misma
 * lectura con ruido; por encima, la visión cambió de opinión sobre cuánta comida
 * hay, y eso mueve las calorías proporcionalmente.
 */
export const TOLERANCIA_DE_GRAMOS = 0.3;

export interface EstabilidadDePlato {
  plato: string;
  /** Términos que estaban en A y no en B. */
  desaparecidos: string[];
  /** Términos que están en B y no estaban en A. */
  aparecidos: string[];
  /** Términos presentes en las dos, con un salto de gramos mayor a la tolerancia. */
  gramos_movidos: { termino_en: string; gramos_a: number; gramos_b: number; delta: number }[];
  /** El mismo término resolviendo a otra ficha. Acá el motor también puede tener parte. */
  ficha_cambiada: { termino_en: string; food_id_a: string | null; food_id_b: string | null }[];
  /** `is_food` cambió de opinión sobre la misma foto. */
  cambio_de_veredicto: boolean;
  /** Las kcal publicadas en cada corrida. `null` cuando no se publicó total. */
  kcal_a: number | null;
  kcal_b: number | null;
  /** Cuánto se movió el total, en tanto por uno sobre la corrida A. */
  delta_kcal: number | null;
  estable: boolean;
}

export interface ResumenDeEstabilidad {
  platos: EstabilidadDePlato[];
  /** Platos que devolvieron exactamente los mismos ítems y gramos. */
  identicos: number;
  /** Platos donde algo se movió. */
  movidos: number;
  /** Cuántos de los movidos cambiaron por ÍTEMS (uno apareció o desapareció). */
  con_items_distintos: number;
  /** Cuántos por GRAMOS más allá de la tolerancia. */
  con_gramos_movidos: number;
  /** Cuántos cambiaron el veredicto `is_food` sobre la misma foto. */
  con_veredicto_distinto: number;
  /** El promedio del salto absoluto del total, entre los platos que publican los dos. */
  delta_kcal_promedio: number | null;
}

/**
 * CUÁNTO SE MUEVE LA VISIÓN SOBRE LAS MISMAS FOTOS.
 *
 * Es medición y reporte, no un arreglo: no hay nada que corregir en el motor:
 * el modelo de visión no es determinístico y esto lo cuantifica para que los
 * informes del golden set puedan separar "lo movió el motor" de "lo movió el
 * modelo". Sin este número, cualquier delta entre dos corridas es ilegible.
 *
 * SE COMPARA POR TÉRMINO, no por posición: la visión reordena los ítems entre
 * corridas y una comparación posicional inventaría cambios que no existen. Dos
 * ítems con el mismo `termino_en` en el mismo plato se aparean; los que no
 * aparean son los que aparecieron o desaparecieron. Es deliberadamente estricto:
 * `seafood paella` y `seafood rice, paella style` cuentan como uno que
 * desapareció y otro que apareció, porque para el matcher son dos consultas
 * distintas y esa es exactamente la inestabilidad que se quiere medir.
 */
export function compararCorridas(a: PlatoGrabado[], b: PlatoGrabado[]): ResumenDeEstabilidad {
  const porId = new Map(b.map((p) => [p.id, p]));
  const platos: EstabilidadDePlato[] = [];

  for (const platoA of a) {
    const platoB = porId.get(platoA.id);
    if (platoB === undefined) continue;

    const itemsA = new Map(platoA.items.map((i) => [i.termino_en, i]));
    const itemsB = new Map(platoB.items.map((i) => [i.termino_en, i]));
    const desaparecidos = [...itemsA.keys()].filter((t) => !itemsB.has(t));
    const aparecidos = [...itemsB.keys()].filter((t) => !itemsA.has(t));

    const gramos_movidos: EstabilidadDePlato["gramos_movidos"] = [];
    const ficha_cambiada: EstabilidadDePlato["ficha_cambiada"] = [];
    for (const [termino, ia] of itemsA) {
      const ib = itemsB.get(termino);
      if (ib === undefined) continue;
      if (ia.food_id !== ib.food_id) {
        ficha_cambiada.push({ termino_en: termino, food_id_a: ia.food_id, food_id_b: ib.food_id });
      }
      // Un gramaje que arranca en cero no tiene contra qué medirse en tanto por
      // uno: pasar de 0 a 50 g no es "un salto infinito", es la visión estimando
      // por primera vez. Se cuenta como movimiento si el otro lado no es cero.
      const base = Math.max(ia.grams, 0);
      if (base === 0) {
        if (ib.grams > 0) gramos_movidos.push({ termino_en: termino, gramos_a: ia.grams, gramos_b: ib.grams, delta: 1 });
        continue;
      }
      const delta = Math.abs(ib.grams - ia.grams) / base;
      if (delta > TOLERANCIA_DE_GRAMOS) {
        gramos_movidos.push({ termino_en: termino, gramos_a: ia.grams, gramos_b: ib.grams, delta: redondear(delta, 3) });
      }
    }

    const kcal_a = platoA.totals?.nutrients.kcal ?? null;
    const kcal_b = platoB.totals?.nutrients.kcal ?? null;
    const delta_kcal =
      kcal_a === null || kcal_b === null || kcal_a === 0 ? null : redondear((kcal_b - kcal_a) / kcal_a, 3);

    platos.push({
      plato: platoA.id,
      desaparecidos,
      aparecidos,
      gramos_movidos,
      ficha_cambiada,
      cambio_de_veredicto: platoA.is_food !== platoB.is_food,
      kcal_a,
      kcal_b,
      delta_kcal,
      estable:
        desaparecidos.length === 0 &&
        aparecidos.length === 0 &&
        gramos_movidos.length === 0 &&
        platoA.is_food === platoB.is_food,
    });
  }

  const deltas = platos.map((p) => p.delta_kcal).filter((d): d is number => d !== null);
  return {
    platos,
    identicos: platos.filter((p) => p.estable).length,
    movidos: platos.filter((p) => !p.estable).length,
    con_items_distintos: platos.filter((p) => p.desaparecidos.length > 0 || p.aparecidos.length > 0).length,
    con_gramos_movidos: platos.filter((p) => p.gramos_movidos.length > 0).length,
    con_veredicto_distinto: platos.filter((p) => p.cambio_de_veredicto).length,
    delta_kcal_promedio:
      deltas.length === 0 ? null : redondear(deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length, 3),
  };
}
