/**
 * El matching: de un texto de la visión a una ficha del catálogo.
 *
 * Es una CASCADA de tres niveles y el orden no es un detalle: cada nivel es
 * menos seguro que el anterior, y el primero que da resultado gana. La confianza
 * que devuelve cada nivel es la confianza DEL MATCHING —cuánto se puede creer
 * que esta ficha es ese alimento— y se multiplica después por la confianza de la
 * visión (`analyze.ts`). Dos incertidumbres distintas, dos números distintos,
 * multiplicados: si la visión dudó y el catálogo también, el resultado tiene que
 * dudar el doble.
 *
 *   1. EXACTO contra `names.en`. El campo que manda la visión se llama `food_en`
 *      y `names.en` viene de USDA: es el camino natural, y está medido que es
 *      una clave primaria limpia (1.022 nombres, 1.022 claves normalizadas).
 *      Confianza 1,0.
 *   2. EXACTO contra el vocabulario español (`names.es` + aliases). Existe
 *      porque un modelo de visión escribe "paella" o "chorizo" en un campo que
 *      se llama `food_en`: los platos que no tienen nombre en inglés se nombran
 *      como se llaman. La confianza es LA DEL ALIAS (1,0 / 0,8 / 0,6 / 0,5).
 *   3. DIFUSO, por contención de palabras. Nunca pasa de 0,6.
 *
 * Desde la card 2.6 los dos niveles exactos son CUATRO, porque el índice además
 * de los términos escritos por la curación aprende VARIANTES de cada nombre
 * (`Beef, steak, NFS` deja también `beef steak`). El orden es: inglés escrito,
 * español escrito, inglés deducido, español deducido. Una variante nunca le gana
 * a un nombre que alguien escribió, ni siquiera cruzando de idioma.
 *
 * Y encima de los tres, las GUARDAS: pares término/ficha que están prohibidos
 * salga el match de donde salga.
 */
import type { CanonicalFood } from "../kb/types";
import type { CatalogIndex, EntradaDeTaxonomia, GuardaDeVocabulario, TerminoIndexado } from "./catalog";
import {
  COBERTURA_DIFUSA_MIN,
  CONFIANZA_CABEZA_FAMILIA,
  CONFIANZA_CABEZA_SUBFAMILIA,
  CONFIANZA_DIFUSA_MAX,
  CONFIANZA_SUSTITUTO_DECLARADO,
  DECIMALES,
  FACTOR_GENERICO,
  FAMILIAS_QUE_SE_COMEN_CRUDAS,
  RESPALDO_MINIMO_DE_IDENTIDAD,
} from "./constants";
import {
  claveDeMatching,
  contieneSecuencia,
  estadoDeCoccion,
  empiezaConPalabra,
  inicioDelAcompanamiento,
  lecturasDelTermino,
  mismaPalabra,
  mismasPreparaciones,
  posicionDeSecuencia,
  sinDescriptores,
  tokens,
} from "./normalize";

/**
 * Los niveles que puede devolver este archivo.
 *
 * Los tres de siempre salen de COMPARAR TEXTO. Los tres de la card 5.3 no
 * comparan nada: son respuestas DECLARADAS —por la curación (`sustituto`) o por
 * la taxonomía (las dos cabezas)— para cuando el texto no llegó a ninguna ficha.
 * Por eso viven en la misma cascada y no en la misma familia de ideas.
 */
export type NivelDeMatch = "exacto" | "alias" | "difuso" | "sustituto" | "cabeza_subfamilia" | "cabeza_familia";

export interface MatchResult {
  ficha: CanonicalFood;
  nivel: NivelDeMatch;
  /** 0..1 — cuánto se puede creer que ESTA ficha es ESE alimento. */
  confianza_match: number;
  /** El texto del catálogo que ganó, tal cual está escrito ahí. */
  termino_matcheado: string;
  idioma: "en" | "es";
  motivo: string;
  /**
   * LA FICHA NOMBRA LO QUE LA VISIÓN DESCRIBIÓ, y esto es OTRA cosa que la
   * confianza. Solo viaja cuando vale `true`.
   *
   * Un match exacto siempre la trae: la consulta ES un término de la ficha. Un
   * difuso la trae cuando el nombre del catálogo está DENTRO de lo que dijo la
   * visión y el vocabulario entero de la ficha explica la mayor parte de las
   * palabras de identidad de la consulta (`RESPALDO_MINIMO_DE_IDENTIDAD`).
   *
   * La usa la compuerta del total, que necesita distinguir "no sé qué es esto"
   * de "sé qué es y lo encontré por una vía que puntúa bajo" (DT-37).
   */
  identidad_respaldada?: true;
}

/**
 * LOS DOS NOMBRES QUE DIJO LA VISIÓN, y gana el que el catálogo conoce mejor.
 *
 * Desde la card 2.6 la visión nombra cada alimento dos veces: en inglés (el
 * registro de USDA, que es de donde salen los `names.en`) y en español de España
 * (el registro del usuario, que es de donde salió la curación). Los dos se
 * buscan por separado, con la misma cascada, y gana EL MEJOR — no el primero.
 *
 * SE COMPARA LA CONFIANZA QUE VE EL USUARIO, no la del matching a secas: una
 * ficha genérica ya llega con su 15 % descontado (`FACTOR_GENERICO`), y comparar
 * antes de ese descuento haría ganar a un match nominalmente más alto que en la
 * pantalla vale menos. A IGUALDAD GANA EL INGLÉS, que es la precedencia que la
 * card 2.1 declaró y por la misma razón: `names.en` es la clave primaria limpia.
 *
 * ------------------------------------------------------------------------
 * DT-37 — UNA CONTRADICCIÓN NO SE GANA POR PUNTAJE (card 6.5)
 * ------------------------------------------------------------------------
 *
 * La corrida v3 del golden midió el agujero de "gana el más confiado", y el
 * detalle importa porque es contraintuitivo: EL QUE GANABA TENÍA EL SCORE MÁS
 * ALTO Y ERA EL PEOR MATCH.
 *
 *   · `lime` (inglés) → `Lima cruda`, difuso 0,3, **la ficha correcta**. La
 *     visión tradujo mal y escribió `limón`, que es el nombre EXACTO de otra
 *     ficha (`Limón`, 1,0). Ganaba el 1,0 y al usuario español se le mostraba
 *     "Limón" sobre una lima, al 85 % de confianza.
 *   · `gravy, brown sauce` (inglés) → `Salsa de carne`, difuso 0,176, **la ficha
 *     correcta**. El español (`salsa parda`) caía en `Salsa mexicana` con 0,232
 *     y ganaba. Tres corridas seguidas.
 *
 * LA SEÑAL QUE LOS SEPARA no es el score: es que la ficha que encontró el
 * español NO EXPLICA NI UNA PALABRA de lo que la visión escribió en inglés.
 * `Limón` no dice "lime" en ninguno de sus nombres; `Salsa mexicana` no dice ni
 * "gravy" ni "brown". Eso no es "otro camino al mismo alimento": es una
 * CONTRADICCIÓN entre los dos nombres que emitió el mismo modelo, y una
 * contradicción no se resuelve mirando cuál de los dos está más seguro.
 *
 * CUÁNDO GANA EL INGLÉS ENTONCES, y las dos condiciones existen para no romper
 * los ítems que hoy entran por el español (36 de 66 en la v3):
 *
 *   1. cuando su ficha explica el término inglés ENTERO (respaldo 1): ahí no
 *      quedó ni una palabra sin nombrar y el español no nombra ninguna. Es el
 *      caso `lime`;
 *   2. cuando NINGUNO DE LOS DOS llegó por un término escrito —los dos son
 *      difusos, o sea las dos son conjeturas del motor— y el inglés al menos
 *      explica algo. Entre dos conjeturas manda la clave primaria limpia, que es
 *      la precedencia de la card 2.1. Es el caso `gravy`.
 *
 * LO QUE ESTA REGLA NO TOCA, y es la mitad de por qué está escrita así: un
 * término que la CURACIÓN escribió en español (un nombre o un alias, nivel
 * `exacto`/`alias`) le sigue ganando a una conjetura inglesa aunque no comparta
 * palabras con ella. Medido: `pork belly, boiled` → `Tocino cocido` (el español
 * escrito) contra `Cerdo` (el difuso inglés) no se mueve; `saltine crackers` →
 * `Galletas saladas` tampoco. El español es el idioma que la curación
 * enriqueció y esta regla no lo degrada: solo le saca el derecho a ganar
 * CONTRADICIENDO al inglés cuando él también está adivinando.
 *
 * MEDIDO sobre tres corpus (card 6.5): los 1.115 pares `(names.en, names.es)`
 * del catálogo no cambian ni uno; los 176 pares `(término inglés grabado, nombre
 * español de la ficha que ganó)` de las tres corridas del golden cambian UNO, y
 * es `lime` → `Lima cruda`, que es el arreglo.
 */
export function buscarConDosNombres(
  termino_en: string,
  termino_es: string | undefined | null,
  index: CatalogIndex,
): MatchResult | null {
  const porEn = buscarAlimento(termino_en, index);
  if (typeof termino_es !== "string" || termino_es.trim().length === 0) return porEn;
  const porEs = buscarAlimento(termino_es, index);
  if (porEs === null) return porEn;
  if (porEn === null) return porEs;
  if (contradiceAlIngles(termino_en, porEn, porEs)) return porEn;
  return confianzaVisible(porEs) > confianzaVisible(porEn) ? porEs : porEn;
}

/**
 * ¿La ficha que encontró el español contradice lo que la visión escribió en
 * inglés, y el inglés tiene con qué reemplazarla? Ver `buscarConDosNombres`.
 */
function contradiceAlIngles(termino_en: string, porEn: MatchResult, porEs: MatchResult): boolean {
  if (porEs.ficha.id === porEn.ficha.id) return false;
  if (respaldoDeIdentidad(termino_en, porEs.ficha) > 0) return false;
  const respaldoEn = respaldoDeIdentidad(termino_en, porEn.ficha);
  if (respaldoEn === 1) return true;
  return respaldoEn > 0 && porEn.nivel === "difuso" && porEs.nivel === "difuso";
}

/* ===========================================================================
 * LA TAXONOMÍA COMO RESPALDO DEL TEXTO (card 5.3)
 *
 * Todo lo que sigue existe por un escaneo de producción del 02/09/2026: una
 * pizza que el catálogo tiene cinco veces y que ninguna de las cinco alcanzó,
 * porque la visión escribió "pizza with ham and mushrooms" y el término «pizza»
 * a secas no es el nombre de ninguna ficha. El plato salió SIN NÚMEROS.
 *
 * Desde la card 5.2 la visión no solo escribe palabras: además ELIGE un valor de
 * una lista cerrada de 191 (`familia/subfamilia`). Esa elección es una identidad
 * declarada, y estas funciones la convierten en una ficha.
 *
 * LA REGLA QUE ORDENA TODO, Y ES LA MEDIDA DEL BLOQUE 0: **la cabeza es un
 * RESPALDO, nunca un reemplazo.** De los 68 ítems del golden, 31 llegan hoy por
 * `exacto` o `alias` y reemplazarlos por la cabeza de su subfamilia empeoraría 8
 * — el atún en lata pasaría de 85 a 238 kcal (+180 %), el kétchup de 109 a 24
 * (−78 %). La cabeza solo baja al ruedo cuando el término no llegó a nada.
 * =========================================================================== */

/**
 * LA SUBFAMILIA CON LA QUE SE VA A TRABAJAR: la que declaró la visión, o —solo
 * si no declaró ninguna— la que se deduce del nombre.
 *
 * `declarada` viaja en la respuesta y no es un detalle: la regla de la
 * contradicción (`contradiceALaFamilia`) solo puede correr sobre una familia que
 * ELIGIÓ el modelo de una lista cerrada. Una familia deducida del propio término
 * no puede contradecir a ese término — salió de él.
 *
 * LA DEDUCCIÓN ES EL ÚLTIMO RECURSO Y COMPARA POR IGUALDAD, no por parecido: la
 * visión tiene que haber escrito exactamente el nombre de una subfamilia
 * («ensalada verde», «huevo revuelto y tortilla»). Buscar la subfamilia con el
 * matcher difuso sería volver a adivinar con otro vocabulario, y el Bloque 0 ya
 * midió adónde lleva eso: de los 191 nombres de subfamilia, 9 caen hoy en OTRA
 * familia por difuso.
 */
export function subfamiliaDeclarada(
  familia_subfamilia: string | undefined | null,
  termino_en: string,
  termino_es: string | undefined | null,
  index: CatalogIndex,
): { entrada: EntradaDeTaxonomia; declarada: boolean } | null {
  if (typeof familia_subfamilia === "string" && familia_subfamilia.length > 0) {
    const entrada = index.taxonomia.porId.get(familia_subfamilia);
    // Un valor fuera del enum no es una familia: es basura del modelo, y se
    // ignora como cualquier otra entrada que no se entiende (ver `analyze.ts`).
    if (entrada !== undefined) return { entrada, declarada: true };
  }
  for (const termino of [termino_en, termino_es]) {
    if (typeof termino !== "string" || termino.length === 0) continue;
    const id = index.taxonomia.porNombreDeSubfamilia.get(claveDeMatching(termino));
    if (id === undefined) continue;
    const entrada = index.taxonomia.porId.get(id);
    if (entrada !== undefined) return { entrada, declarada: false };
  }
  return null;
}

/**
 * ¿LA FICHA QUE GANÓ EL MATCH CONTRADICE LA FAMILIA QUE DECLARÓ LA VISIÓN?
 *
 * Es el arreglo del peor caso del Bloque 0: **«perrito caliente» llega por ALIAS
 * con confianza 1,00 a `Hot dog`, que es la salchicha SOLA, sin pan** — otra
 * familia (embutido) y otro alimento. Con la familia declarada, el motor tiene
 * por primera vez una segunda opinión sobre el mismo alimento.
 *
 * Y LA REGLA ES ASIMÉTRICA A PROPÓSITO, que es la mitad de la decisión:
 *
 *   · un `exacto` o un `alias` GANA IGUAL. Ese término lo escribió alguien —es
 *     el nombre de la ficha, o un alias que la curación revisó a mano— y una
 *     lista de 191 valores elegida por un modelo no le gana a eso. Si «perrito
 *     caliente» sigue llevando a la salchicha sola, el arreglo es la guarda de
 *     vocabulario (deuda 7 del Bloque 0), no esta regla;
 *   · un `difuso` PIERDE. Ahí el motor estaba adivinando por parecido de
 *     palabras, y una identidad declarada le gana a una conjetura. Es el mismo
 *     criterio de la DT-37: una contradicción no se gana por puntaje.
 *
 * Y solo se aplica si hay con qué reemplazarla: sin una cabeza a la que caer,
 * tirar el difuso dejaría el plato sin número, que es peor que un número flojo
 * con su reserva escrita.
 */
export function contradiceALaFamilia(match: MatchResult, entrada: EntradaDeTaxonomia, index: CatalogIndex): boolean {
  if (match.nivel !== "difuso") return false;
  if (entrada.cabezaDeSubfamilia === null && entrada.cabezaDeFamilia === null) return false;
  const suya = index.taxonomia.deLaFicha.get(match.ficha.id);
  // Una ficha que la taxonomía no ubica no contradice a nadie: no se sabe dónde
  // vive. Medido: 0 de 1.115 en el catálogo de hoy, pero un catálogo más nuevo
  // que la taxonomía es exactamente el caso que hay que sobrevivir.
  if (suya === undefined) return false;
  return suya.split("/")[0] !== entrada.familia.id;
}

/**
 * LA FICHA QUE LA CURACIÓN DECLARÓ PARA UN INGREDIENTE QUE USDA NO MIDE.
 *
 * Se compara por igualdad del texto normalizado contra los dos nombres que dijo
 * la visión. Nunca por parecido: el parecido ya lo cubre el difuso, y un
 * sustituto es una decisión escrita a mano que tiene que disparar exactamente
 * donde se la escribió. Ver `Sustituto` en `kb/familias.ts`.
 */
export function sustitutoDeclarado(
  termino_en: string,
  termino_es: string | undefined | null,
  index: CatalogIndex,
): MatchResult | null {
  for (const termino of [termino_en, termino_es]) {
    if (typeof termino !== "string" || termino.length === 0) continue;
    const clave = claveDeMatching(termino);
    // La clave literal primero y la de la identidad después: ver el indexado en
    // `catalog.ts`. "pizza dough, baked" tiene que llegar al sustituto que la
    // curación escribió como "pizza dough".
    const sustituto = index.taxonomia.sustitutos.get(clave) ?? index.taxonomia.sustitutos.get(sinDescriptores(clave));
    if (sustituto === undefined) continue;
    const ficha = index.porId.get(sustituto.ficha);
    if (ficha === undefined || ficha.deprecated) continue;
    return {
      ficha,
      nivel: "sustituto",
      confianza_match: CONFIANZA_SUSTITUTO_DECLARADO,
      termino_matcheado: termino,
      idioma: termino === termino_en ? "en" : "es",
      motivo:
        `El catálogo no tiene este alimento y la curación declaró un sustituto: "${ficha.names.es ?? ficha.names.en}". ` +
        sustituto.motivo,
      // La identidad está respaldada por escrito: alguien fue a los datasets,
      // comprobó que el alimento no está medido y eligió el más cercano.
      identidad_respaldada: true,
    };
  }
  return null;
}

/**
 * LA CABEZA DE LA SUBFAMILIA, Y SI NO HAY, LA DE LA FAMILIA. `null` si ninguna.
 *
 * Los dos escalones en una función porque son el mismo movimiento —contestar con
 * lo declarado en vez de callarse— y el nivel que sale dice por cuál de los dos
 * se pasó. Las 13 subfamilias sin cabeza del Bloque 0 son huecos declarados con
 * su motivo, no olvidos: acá se traducen en bajar un escalón.
 */
export function cabezaDeLaTaxonomia(entrada: EntradaDeTaxonomia): MatchResult | null {
  const nombre = (ficha: CanonicalFood): string => ficha.names.es ?? ficha.names.en;

  if (entrada.cabezaDeSubfamilia !== null) {
    return {
      ficha: entrada.cabezaDeSubfamilia,
      nivel: "cabeza_subfamilia",
      confianza_match: CONFIANZA_CABEZA_SUBFAMILIA,
      termino_matcheado: entrada.subfamilia.nombre_es,
      idioma: "es",
      motivo:
        `El catálogo no tiene este alimento por su nombre, pero se declaró como ` +
        `"${entrada.subfamilia.nombre_es}" (${entrada.familia.nombre_es}) y esa subfamilia responde con ` +
        `"${nombre(entrada.cabezaDeSubfamilia)}". Es la ficha que representa al grupo, no la de este plato: ` +
        `dentro de un mismo grupo los valores varían.`,
      // La identidad SÍ está respaldada: la visión no escribió una palabra que
      // se parece, eligió un valor de una lista cerrada, y la taxonomía declara
      // qué ficha responde por ese valor. Es lo que la compuerta del total
      // necesita para no apagar un plato que sí se identificó (DT-37).
      identidad_respaldada: true,
    };
  }

  if (entrada.cabezaDeFamilia !== null) {
    return {
      ficha: entrada.cabezaDeFamilia,
      nivel: "cabeza_familia",
      confianza_match: CONFIANZA_CABEZA_FAMILIA,
      termino_matcheado: entrada.familia.nombre_es,
      idioma: "es",
      motivo:
        `El catálogo no tiene este alimento por su nombre y su subfamilia ` +
        `("${entrada.subfamilia.nombre_es}") tampoco tiene una ficha que la represente, así que responde la ` +
        `familia entera con "${nombre(entrada.cabezaDeFamilia)}". Es el último recurso antes de no dar número: ` +
        `dentro de una familia los valores varían mucho más que dentro de una subfamilia.`,
      // Y acá NO. Una familia agrupa cosas que se parecen poco —dentro de
      // «verdura», la cruda son 30 kcal/100 g y la cocida con grasa 86— así que
      // esto contesta de qué CLASE de comida se trata y poco más. Que publique
      // total o no queda en manos de la confianza, como cualquier match flojo.
    };
  }

  return null;
}

/**
 * TODAS LAS PALABRAS CON LAS QUE EL CATÁLOGO NOMBRA A UNA FICHA: su nombre en
 * inglés, su nombre en español y sus alias, sin repetir.
 *
 * Es el vocabulario COMPLETO y no el término que ganó el match, y esa es toda la
 * idea: `fdc-2708755` ganó por el alias `Lasaña` —seis letras— pero se llama
 * `Lasagna with meat and spinach` / `Lasaña con carne y espinaca`, y con eso
 * explica también la carne y la espinaca que la visión describió.
 */
export function vocabularioDeLaFicha(ficha: CanonicalFood): string[] {
  const textos: (string | null)[] = [ficha.names.en, ficha.names.es];
  for (const alias of ficha.aliases?.es ?? []) {
    textos.push(typeof alias === "string" ? alias : alias.alias);
  }
  const palabras = new Set<string>();
  for (const texto of textos) {
    if (typeof texto !== "string" || texto.length === 0) continue;
    for (const palabra of tokens(claveDeMatching(texto))) palabras.add(palabra);
  }
  return [...palabras];
}

/**
 * QUÉ PROPORCIÓN DE LO QUE DIJO LA VISIÓN NOMBRA ESTA FICHA. 0..1.
 *
 * Se cuentan las palabras de IDENTIDAD de la consulta (sin los descriptores de
 * presentación ni el pegamento gramatical: "grilled", "de", "con") y se pregunta
 * por cada una si aparece en el vocabulario de la ficha. Nada más que eso.
 *
 * NO ES UNA CONFIANZA Y NO SE MULTIPLICA POR NADA. La confianza dice cuánto se
 * puede creer que esta ficha es ese alimento; el respaldo dice cuánto de lo que
 * se describió tiene nombre en esta ficha. Dos preguntas distintas, y la segunda
 * es la que la compuerta del total necesitaba y no tenía (DT-37).
 *
 * Se compara palabra contra palabra con `mismaPalabra` y no con `===` por el
 * residuo del plegado del plural (`tomatoe` contra `tomato`): ver ahí el caso.
 */
export function respaldoDeIdentidad(termino: string, ficha: CanonicalFood): number {
  const palabras = tokens(sinDescriptores(claveDeMatching(termino)));
  if (palabras.length === 0) return 0;
  const vocabulario = vocabularioDeLaFicha(ficha);
  const explicadas = palabras.filter((palabra) => vocabulario.some((w) => mismaPalabra(palabra, w)));
  return explicadas.length / palabras.length;
}

/** La confianza del match ya con el descuento de ficha genérica: la de pantalla. */
function confianzaVisible(match: MatchResult): number {
  return match.confianza_match * (match.ficha.generic === true ? FACTOR_GENERICO : 1);
}

/** Redondeo estable: el mismo escaneo dos veces da el mismo byte. */
export function redondear(valor: number, decimales: number = DECIMALES): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

/**
 * ¿Alguna guarda prohíbe que esta consulta llegue a esta ficha?
 *
 * LA GUARDA DISPARA CUANDO LA CONSULTA EMPIEZA CON EL TÉRMINO, no cuando lo
 * contiene en cualquier posición. La diferencia no es un detalle y se descubrió
 * rompiendo un test: con "contiene" en cualquier posición, la consulta
 * `Bife de chorizo` —que es el NOMBRE CORRECTO de fdc-2705835— disparaba la
 * guarda del chorizo y el motor devolvía un embutido cuando el usuario había
 * nombrado bien un corte vacuno. La guarda existe para que la palabra `chorizo`
 * como NÚCLEO del nombre no llegue al corte; `chorizo` como complemento
 * (`bife DE chorizo`) es otra cosa y no se toca.
 *
 * Es la misma regla del núcleo del nombre que usa el difuso, y es coherente con
 * la guarda hermana del catálogo (`kb/curation/guardas.vocabulario.json`), que
 * compara por igualdad exacta y lo dice con este mismo ejemplo.
 *
 * La guarda se levanta si la consulta trae alguna de las palabras que nombran
 * explícitamente la variante prohibida ("pepinillos DULCES").
 *
 * EL TÉRMINO DE LA GUARDA SE VUELVE A PASAR POR `claveDeMatching` acá dentro, no
 * se confía en cómo está escrito en la lista. Desde la card 2.6 la clave pliega
 * el plural, y una guarda escrita como `pepinillos` contra una consulta plegada a
 * `pepinillo` no dispararía: la guarda se caería en silencio, que es la peor
 * forma en que se puede caer una guarda.
 */
export function guardaQueViola(
  consultaNormalizada: string,
  food_id: string,
  guardas: GuardaDeVocabulario[],
): GuardaDeVocabulario | null {
  for (const guarda of guardas) {
    if (!guarda.prohibido_en.includes(food_id)) continue;
    if (!empiezaConPalabra(consultaNormalizada, claveDeMatching(guarda.termino))) continue;
    const levantada = (guarda.salvo_si_contiene ?? []).some((palabra) =>
      contieneSecuencia(consultaNormalizada, claveDeMatching(palabra)),
    );
    if (!levantada) return guarda;
  }
  return null;
}

interface CandidatoDifuso {
  entrada: TerminoIndexado;
  /** Cuánto del texto largo explica el texto corto, en caracteres. 0..1. */
  cobertura: number;
  direccion: "nombre_en_consulta" | "consulta_en_nombre" | "nombre_partido";
  /** `0,6 × cobertura × confianza del término`. Es con esto que se compara. */
  confianza: number;
}

/**
 * El difuso de UN índice (inglés o español, nunca los dos juntos).
 *
 * Dos direcciones. Hasta la card 2.6 la primera le ganaba SIEMPRE a la segunda;
 * ahora gana la de más confianza y la A solo desempata (ver el final de la
 * función, con el caso medido de `crackers, saltine`):
 *
 *   A. EL NOMBRE DEL CATÁLOGO ESTÁ DENTRO DE LA CONSULTA. La visión dijo de más
 *      ("olive oil for frying" y el catálogo tiene `Olive oil`, fdc-2710186 —
 *      ejemplo VERIFICADO contra el catálogo 3.0.0, hay un test que lo corre).
 *      Acá gana EL NOMBRE MÁS LARGO, que es a la vez el MÁS ESPECÍFICO
 *      y el que más texto de la consulta explica: para "pastel de carne" el
 *      catálogo ofrece `Carne`, `Pastel` y `Pastel de carne`, y el que hay que
 *      elegir es el tercero. Más largo = más cobertura = más confianza: los tres
 *      criterios apuntan al mismo lado y no hay que arbitrar entre ellos.
 *
 *   B. LA CONSULTA ESTÁ DENTRO DEL NOMBRE, y ADEMÁS AL PRINCIPIO. La visión dijo
 *      de menos ("pepinillos" y el catálogo tiene "Pepinillos en eneldo o
 *      kosher"). Acá gana el nombre que AGREGA MENOS: cada palabra de más es una
 *      afirmación que la visión no hizo. Medido: con "gana el más largo" la
 *      consulta `pastel` resolvería a `Pastel de nuez pecana` —hay once nombres
 *      del catálogo que empiezan con "pastel"— y eso no es un pastel, es una
 *      tarta de nueces. La exigencia de que la consulta esté AL PRINCIPIO es la
 *      regla del núcleo del nombre y es la que estructura la guarda del chorizo.
 *
 * En las dos direcciones la confianza es `0,6 × cobertura × confianza del
 * término`: decrece con la distancia entre los dos textos, y arrastra la reserva
 * del alias cuando el término que ganó era un alias con reserva.
 *
 * LO QUE AGREGÓ LA CARD 2.6, y está explicado en su lugar más abajo:
 *   · la cobertura de la dirección A no cuenta las palabras que solo describen
 *     la presentación ("grilled", "casero"): no son comida sin explicar;
 *   · un nombre que es el NÚCLEO de la consulta entra aunque cubra poco, y le
 *     gana a uno más largo que está más atrás;
 *   · lo que viene detrás de un conector ("...with cheese") es un
 *     acompañamiento y no puede ser el plato;
 *   · entre una ficha que dice CRUDA y su hermana COCIDA, gana la cocida cuando
 *     la cruda es más densa (o sea, cuando está seca). Y LA CARD 6.3 ESCRIBE LA
 *     OTRA MITAD: cuando las dos EMPATAN y la consulta no dijo nada del estado,
 *     gana la cruda si no es la más densa Y su familia se come cruda (`verdura`
 *     o `fruta`); si no, gana la cocida. Vive en `desempateDeEstado`.
 *
 * Y LA CARD 2.8 AGREGA UNA TERCERA DIRECCIÓN, EL NOMBRE PARTIDO:
 *
 *   C. EL NOMBRE DEL CATÁLOGO ESTÁ EN LA CONSULTA PERO PARTIDO EN DOS. La visión
 *      dijo `yellow rice with mushrooms, cooked` y la ficha se llama
 *      `Yellow rice, cooked`: el nombre está ENTERO adentro de la frase, pero
 *      cortado al medio por "with mushrooms", y las direcciones A y B solo saben
 *      de secuencias contiguas. Es el único plato del golden set de 30 que no se
 *      movió ni un milímetro entre dos corridas del motor.
 *
 *      C ES EL ÚLTIMO RECURSO Y ESO ES UNA GARANTÍA, NO UNA cautela: sus
 *      candidatos SOLO se miran cuando ni A ni B encontraron nada. La dirección
 *      del nombre partido puede convertir un silencio en un match; NO PUEDE
 *      cambiar ningún match que el motor ya hacía. Todo lo que andaba, anda
 *      igual, y hay un candado que lo mide sobre los 1.022 nombres.
 */
function difusoEnIndice(
  consulta: string,
  lista: TerminoIndexado[],
  index: CatalogIndex,
): CandidatoDifuso | null {
  const guardas = index.guardas;
  // La dirección A, partida en dos: los nombres que arrancan en la primera
  // palabra de la consulta (el NÚCLEO) y los que arrancan más atrás.
  let mejorNucleo: CandidatoDifuso | null = null;
  let mejorOtro: CandidatoDifuso | null = null;
  let mejorB: CandidatoDifuso | null = null;
  // La dirección C (card 2.8), en su propio cajón: solo se abre si los otros dos
  // quedaron vacíos.
  let mejorC: CandidatoDifuso | null = null;
  // Un objeto y no una variable suelta: el análisis de flujo de TypeScript no
  // sigue lo que escribe una función anidada y daría por sentado que sigue en
  // `null`. Nunca se le pelea al chequeador con un cast: se le cambia la forma.
  const cocido: { mejor: CandidatoDifuso | null } = { mejor: null };

  // El denominador de la dirección A: lo que la visión dijo, descontando lo que
  // no es comida. Se calcula UNA vez, no una por candidato.
  const identidad = sinDescriptores(consulta);
  const acompanamiento = inicioDelAcompanamiento(consulta);

  // Para la dirección C: en qué palabra aparece cada token de la consulta (la
  // PRIMERA vez) y cuál es el núcleo de lo que dijo la visión.
  const posicionDelToken = new Map<string, number>();
  tokens(consulta).forEach((palabra, i) => {
    if (!posicionDelToken.has(palabra)) posicionDelToken.set(palabra, i);
  });
  const nucleoDeLaConsulta = tokens(identidad)[0];
  // Solo hay algo que respetar si lo que dijo la visión pidió CRUDO: ahí nombró
  // la ficha que quería. Si pidió cocido —o no dijo nada— el desempate corre.
  const estadoPedido = estadoDeCoccion(consulta);

  // El mejor candidato que DICE estar cocido, MIRANDO TAMBIÉN LOS QUE NO LLEGAN
  // AL PISO DE COBERTURA. Solo se usa para desempatar contra un ganador que dice
  // estar crudo, y ahí la pregunta ya no es "¿matcheo o no?" —eso ya se contestó
  // que sí— sino "¿la cruda o la cocida?". El piso está para no inventar un
  // alimento; acá no se inventa ninguno, se elige entre dos formas del mismo.
  // Sin este rescate la regla no muerde en español: `Lentejas crudas` cubre el
  // 54 % de "lentejas" y `Lentejas cocidas con sal y grasa` solo el 23 %, así que
  // la cocida nunca llegaba a ser candidata.
  const anotarCocido = (candidato: CandidatoDifuso): void => {
    if (candidato.entrada.estado !== "cocido") return;
    if (cocido.mejor === null || candidato.confianza > cocido.mejor.confianza) cocido.mejor = candidato;
  };

  /**
   * ENTRE LA CRUDA Y LA COCIDA DEL MISMO ALIMENTO, A IGUALDAD GANA LA CRUDA —
   * salvo que la cruda sea la MÁS DENSA. `true` si gana `nuevo`, `false` si gana
   * `actual`, `null` cuando este desempate no tiene nada que decir.
   *
   * ES LA MISMA REGLA DEL CRUDO/COCIDO DEL FINAL DE ESTA FUNCIÓN, ESCRITA
   * SIMÉTRICA. La de allá abajo solo sabe promover: si ganó la cruda y la cruda
   * es más densa (está SECA: lentejas 352 contra 166), devuelve la cocida. Al
   * revés no sabía hacer nada, y el revés pasa todo el tiempo.
   *
   * MEDIDO EN PRODUCCIÓN EL 03/09/2026, dos ensaladas reales: `lettuce, shredded`
   * resolvía a `Lettuce, cooked` (49 kcal/100 g, 3,1 g de grasa) existiendo
   * `Lettuce, raw` (20 kcal), y el tomate picado a `Tomate cocido` (50 kcal)
   * existiendo `Tomate crudo` (20). Una ensalada verde salía 12 % inflada.
   *
   * POR QUÉ PASABA, Y POR QUÉ EL ARREGLO VA ACÁ Y NO ALLÁ ABAJO. "picado",
   * "shredded" y "chopped" son descriptores y se descuentan de la cobertura, así
   * que «lechuga» explica ENTERO tanto a `Lechuga cruda` como a `Lechuga cocida`:
   * las dos entran por el nombre partido con cobertura 1 y confianza 0,600, un
   * empate perfecto. Lo decidía el ORDEN de la lista —que se ordena por largo, y
   * "cocida" tiene una letra más que "cruda"—. O sea: el defecto ES el desempate,
   * y acá es donde el desempate vive. Escribir la vuelta simétrica allá abajo la
   * convertiría en una regla que puede DAR VUELTA a un ganador legítimo (que es
   * lo que hace la de la promoción, con su rescate por debajo del piso de
   * cobertura); acá solo decide empates exactos, que es exactamente el defecto
   * medido, y solo entre candidatos de la misma dirección — la garantía de la
   * card 2.8, que la dirección C no puede cambiar ningún match que ya existía,
   * queda intacta.
   *
   * CUÁNDO OPINA: LAS DOS CONDICIONES DE ENTRADA.
   *
   *   1. LA CONSULTA NO DECLARÓ ESTADO. Si la visión dijo "cooked" o "cocido"
   *      nombró la ficha que quería y nadie se la discute (`cabbage, cooked`
   *      sigue igual); si dijo "raw" tampoco hay nada que desempatar.
   *
   *      EN LA DIRECCIÓN C esta condición es, MEDIDO, redundante por invariante
   *      y no por casualidad: la condición 4 de esa dirección (más abajo en este
   *      archivo) ya excluye a cualquier candidato cuyo `estadoDeLaEntrada`
   *      contradiga a `estadoPedido` ANTES de que llegue a competir, así que un
   *      candidato del estado contrario nunca llega a esta función viniendo de
   *      C — las dos leen la MISMA `estadoDeCoccion`. Se queda igual como
   *      defensa explícita (si el día de mañana la condición 4 cambia, esta
   *      línea no depende de que lo hagan a la vez) y porque en A y B no hay una
   *      condición 4 equivalente que la vuelva redundante ahí también: esas dos
   *      direcciones filtran por SUBCADENA, no por estado, así que una consulta
   *      que nombrara los dos estados a la vez ("raw, cooked weight": el crudo
   *      manda y `estadoPedido` da "crudo", pero la palabra "cooked" sigue
   *      escrita ahí) sí podría, en teoría, dejar pasar un candidato cocido como
   *      substring. No es un caso que se haya medido en producción; es la razón
   *      por la que esta condición no se borra.
   *   2. SON HERMANAS DEL MISMO ALIMENTO, y eso se pregunta a los textos: los dos
   *      nombres, sin descriptores —y "cruda"/"cocida" SON descriptores—, tienen
   *      que quedar en la misma palabra. `lechuga cruda` y `lechuga cocida`
   *      quedan las dos en «lechuga»: es el mismo alimento en dos estados. Sin
   *      esto, dos fichas distintas que empatan por casualidad se pisarían.
   *
   * Y CUANDO OPINA, CONTESTA SIEMPRE: gana la cruda o gana la cocida, nunca
   * "no sé". Un empate que este desempate deje pasar lo termina decidiendo el
   * ORDEN DE LA LISTA, que es el defecto que vino a cerrar; que la cocida gane
   * TAMBIÉN es una decisión, y está escrita como tal.
   *
   * QUIÉN GANA: DOS PREGUNTAS A LOS DATOS, Y LAS DOS TIENEN QUE DAR QUE SÍ.
   *
   *   a. LA DENSIDAD, que es el mismo número que usa la regla de allá abajo leído
   *      al revés: la cruda no puede tener MÁS kcal/100 g que la cocida.
   *      `Lentejas crudas` 352 contra `Lentejas cocidas` 166 → la cruda está
   *      seca, nadie la come así, gana la cocida. `Lechuga cruda` 20 contra
   *      `Lechuga cocida` 49 → por acá pasa.
   *   b. LA FAMILIA DE LA FICHA CRUDA tiene que ser una de las que se comen
   *      crudas (`FAMILIAS_QUE_SE_COMEN_CRUDAS`: `verdura` y `fruta`), y la
   *      familia la declara la taxonomía, no este archivo.
   *
   * LA SEGUNDA PREGUNTA EXISTE POR LO QUE LA PRIMERA NO SABE, y está medido: la
   * densidad dice "esto está seco" pero no dice "esto no se come crudo" cuando
   * cocinar AGREGA grasa. Sin la familia, `huevo duro` contestaba `Huevo crudo`
   * (143 kcal contra los 176 del cocido) y `patata troceada` contestaba
   * `Patatas crudas con cáscara` (77 contra 126) — las dos con la misma forma
   * aritmética que la lechuga, y las dos inaceptables de cara al usuario. La
   * taxonomía sí sabe la diferencia: la lechuga y el tomate son `verdura`, la
   * manzana es `fruta`, y el huevo y la patata tienen familia propia porque el
   * catálogo los mide aparte. Ver el porqué completo en la constante.
   *
   * UNA FICHA QUE LA TAXONOMÍA NO UBICA NO GANA EL DESEMPATE: sin familia no hay
   * con qué contestar la pregunta b, y ante la duda se queda la cocida, que es lo
   * que había en la foto en todos los casos medidos. Es el mismo criterio
   * conservador de `contradiceALaFamilia` con la ficha que no está en el mapa.
   *
   * Y CORRE DESPUÉS DEL DESEMPATE DE LA VARIANTE (el de acá abajo), que es la
   * precedencia que este archivo declara en su encabezado: un término que
   * escribió la curación le gana a una variante que dedujo el índice, y no hay
   * regla que lo pase por encima. MEDIDO: con este desempate primero, el candado
   * de la card 6.1 —`carrot, shredded` contra un fixture donde la zanahoria cruda
   * tiene MÁS kcal que la cocida— se daba vuelta. Ninguno de los casos de
   * producción depende del orden entre los dos: donde las dos fichas son nombres
   * escritos (lechuga, tomate, huevo) manda este desempate, y donde la cocida es
   * una variante (repollo rojo) los dos deciden para el mismo lado.
   *
   * Escrito de las dos direcciones a propósito —contesta lo mismo venga el crudo
   * primero o segundo— porque el orden de la lista es justamente lo que estaba
   * roto, y un desempate que dependa de él no arregla nada.
   */
  const desempateDeEstado = (nuevo: CandidatoDifuso, actual: CandidatoDifuso): boolean | null => {
    if (estadoPedido !== null) return null;
    if (nuevo.confianza !== actual.confianza) return null;
    const estados = new Set([nuevo.entrada.estado, actual.entrada.estado]);
    if (!estados.has("crudo") || !estados.has("cocido")) return null;
    if (sinDescriptores(nuevo.entrada.clave) !== sinDescriptores(actual.entrada.clave)) return null;
    const nuevoEsCrudo = nuevo.entrada.estado === "crudo";
    const cruda = index.porId.get((nuevoEsCrudo ? nuevo : actual).entrada.food_id);
    const cocida = index.porId.get((nuevoEsCrudo ? actual : nuevo).entrada.food_id);
    if (cruda === undefined || cocida === undefined) return null;
    const familia = index.taxonomia.deLaFicha.get(cruda.id)?.split("/")[0];
    const ganaLaCruda =
      cruda.per_100g.kcal <= cocida.per_100g.kcal &&
      familia !== undefined &&
      FAMILIAS_QUE_SE_COMEN_CRUDAS.includes(familia);
    return nuevoEsCrudo ? ganaLaCruda : !ganaLaCruda;
  };

  /**
   * A IGUALDAD EXACTA, GANA EL TÉRMINO QUE ESCRIBIÓ LA CURACIÓN.
   *
   * Es la misma precedencia que ya ordena el índice ("a igual largo gana el
   * término escrito sobre la variante deducida", en `construirIndice`) llevada al
   * desempate del difuso, donde hacía falta y no estaba. Antes el orden de la
   * lista decidía solo, y la lista se ordena por LARGO: una variante larga le
   * ganaba a un nombre real corto que empataba con ella.
   *
   * MEDIDO, y por eso existe: con la cola descriptiva de la card 6.1,
   * `carrot, shredded` empataba en 0,6 entre `Carrots, raw` (el nombre escrito) y
   * `carrot fresh cooked` (la variante de `Carrots, fresh, cooked, fat added,
   * NS as to fat type`), y ganaba la variante por ser más larga: la zanahoria
   * rallada de una ensalada pasaba de 41 kcal a 72. La regla nueva no cambia
   * ningún match donde alguien gane por confianza; solo decide los empates, y los
   * decide siempre para el mismo lado.
   *
   * Y ESTE DESEMPATE CORRE PRIMERO, antes que el del crudo/cocido de la card 6.3
   * (`desempateDeEstado`, acá arriba): el término que escribió la curación no lo
   * pasa por encima ninguna otra regla. En el catálogo real la zanahoria la gana
   * igual por los dos caminos —la cocida es una variante Y es la más densa—; en
   * el fixture del test, donde la cruda tiene más kcal que la cocida, solo la
   * gana por este. Por eso el orden entre los dos importa y está fijado.
   */
  const leGana = (nuevo: CandidatoDifuso, actual: CandidatoDifuso, valor: (c: CandidatoDifuso) => number): boolean => {
    const a = valor(nuevo);
    const b = valor(actual);
    if (a !== b) return a > b;
    // El término escrito primero, y ESCRITO EN LAS DOS DIRECCIONES: si el que ya
    // está es el escrito, el que llega no puede ganarle por ningún otro camino.
    if (actual.entrada.variante === true && nuevo.entrada.variante !== true) return true;
    if (nuevo.entrada.variante === true && actual.entrada.variante !== true) return false;
    return desempateDeEstado(nuevo, actual) ?? false;
  };
  const porCobertura = (c: CandidatoDifuso): number => c.cobertura;
  const porConfianza = (c: CandidatoDifuso): number => c.confianza;

  for (const entrada of lista) {
    if (guardaQueViola(consulta, entrada.food_id, guardas) !== null) continue;

    const posicion = posicionDeSecuencia(consulta, entrada.clave);
    if (posicion >= 0) {
      // Un nombre que arranca DETRÁS del primer conector es un acompañamiento,
      // no el plato: el queso de "arepa filled with cheese" no es la comida de
      // la foto, es lo que hay adentro de una comida que no está en el catálogo.
      if (acompanamiento >= 0 && posicion > acompanamiento) continue;
      // La cobertura se topea en 1: el nombre del catálogo puede ser más largo
      // que la identidad de la consulta cuando el propio nombre trae un
      // descriptor ("Yellow rice, cooked" contra "yellow rice ... seasoned").
      const cobertura = Math.min(1, entrada.clave.length / identidad.length);
      // DOS PUERTAS, NO UN PISO MÁS BAJO: la cobertura de siempre, o ser el
      // NÚCLEO de lo que dijo la visión. Ver `COBERTURA_DIFUSA_MIN`.
      const esNucleo = posicion === 0;
      const candidato: CandidatoDifuso = {
        entrada,
        cobertura,
        direccion: "nombre_en_consulta",
        confianza: confianzaDifusa(entrada, cobertura),
      };
      anotarCocido(candidato);
      if (cobertura >= COBERTURA_DIFUSA_MIN || esNucleo) {
        // EL NÚCLEO LE GANA A UN NOMBRE MÁS LARGO QUE ESTÁ MÁS ATRÁS, y esto es
        // nuevo de la card 2.6. Con "gana el más largo" a secas, `pizza, cheese`
        // resolvía a QUESO: `cheese` (6 letras, en la posición 1) le ganaba a
        // `pizza` (5, en la 0) y una porción de pizza salía con los valores de un
        // queso. El sustantivo principal va adelante — es la misma regla del
        // núcleo que estructura las guardas y la dirección B— y entre dos núcleos
        // sigue ganando el más largo, que es el más específico.
        const mejor = esNucleo ? mejorNucleo : mejorOtro;
        if (mejor === null || leGana(candidato, mejor, porCobertura)) {
          if (esNucleo) mejorNucleo = candidato;
          else mejorOtro = candidato;
        }
      }
      continue;
    }

    // LA DIRECCIÓN B MIDE CONTRA EL TEXTO COMPLETO, no contra la identidad, y es
    // deliberado aunque parezca una inconsistencia con la dirección A. Acá las
    // palabras de más son DEL CATÁLOGO, no de la visión: son afirmaciones que
    // nadie hizo. Descontarle descriptores a la consulta la haría decir todavía
    // menos y volvería MÁS injustificado lo que agrega el nombre, no menos.
    // Medido: con la identidad, `pollo a la plancha` se quedaba en "pollo" y
    // resolvía a `Pollo Kiev` (280 kcal) con un 30 % de confianza. Un número
    // equivocado con cara de medido es exactamente lo que este motor no hace.
    if (empiezaConPalabra(entrada.clave, consulta)) {
      const cobertura = consulta.length / entrada.clave.length;
      const candidato: CandidatoDifuso = {
        entrada,
        cobertura,
        direccion: "consulta_en_nombre",
        confianza: confianzaDifusa(entrada, cobertura),
      };
      anotarCocido(candidato);
      if (cobertura >= COBERTURA_DIFUSA_MIN && (mejorB === null || leGana(candidato, mejorB, porCobertura))) {
        mejorB = candidato;
      }
      continue;
    }

    // ------------------------------------------------------------------
    // DIRECCIÓN C — EL NOMBRE PARTIDO (card 2.8)
    //
    // El nombre del catálogo no está contiguo en la consulta, pero sus palabras
    // SÍ están todas. `yellow rice with mushrooms cooked` contra
    // `Yellow rice, cooked`. Cuatro condiciones, y las cuatro existen por un
    // caso medido; sin ellas esto deja de ser matching y pasa a ser armar un
    // nombre con las palabras que convienen.
    // ------------------------------------------------------------------
    const palabrasDeLaEntrada = tokens(entrada.clave);

    // 1 — EL NÚCLEO MANDA, que es la regla que estructura todo este archivo. El
    //     nombre del catálogo tiene que arrancar en la misma palabra en la que
    //     arranca lo que dijo la visión (su identidad, sin descriptores: en
    //     "grilled potato slice" el núcleo es `potato`, no `grilled`). Es la
    //     salvaguarda de especificidad de la DT-15: para `carne pastel` el
    //     núcleo es `carne`, así que `Pastel de carne` ni se considera.
    if (palabrasDeLaEntrada[0] !== nucleoDeLaConsulta) continue;

    // 2 — SUBCONJUNTO DE TOKENS, Y TODOS DEL LADO DEL PLATO. Cada palabra del
    //     nombre que no sea un descriptor tiene que estar en la consulta, y
    //     tiene que estar ANTES del primer conector: lo que viene después de un
    //     "with" es la guarnición, y un plato no se nombra con su guarnición.
    const identidadDeLaEntrada = tokens(sinDescriptores(entrada.clave));
    const estaEntera = identidadDeLaEntrada.every((palabra) => {
      const donde = posicionDelToken.get(palabra);
      return donde !== undefined && (acompanamiento < 0 || donde < acompanamiento);
    });
    if (!estaEntera) continue;

    // 3 — LAS PREPARACIONES TIENEN QUE COINCIDIR. Es el falso amigo del corte:
    //     rebanar una papa la deja papa, freírla la convierte en otra ficha con
    //     casi cuatro veces las calorías. Si uno de los dos textos nombra una
    //     preparación y el otro no, no hay nombre partido que valga.
    if (!mismasPreparaciones(consulta, entrada.clave)) continue;

    // 4 — Y NO PUEDE HABER CONTRADICCIÓN DE ESTADO. Una ficha que dice CRUDA no
    //     contesta una consulta que dijo COCIDA. Medido: sin esto,
    //     `cabbage, cooked` resolvía a `Cabbage, raw` (25 kcal contra los 55 del
    //     repollo cocido con grasa) con más de la mitad de la confianza.
    const estadoDeLaEntrada = estadoDeCoccion(entrada.clave);
    if (estadoPedido !== null && estadoDeLaEntrada !== null && estadoPedido !== estadoDeLaEntrada) continue;

    // La cobertura cuenta SOLO lo que el nombre explica de verdad. Para
    // `yellow rice with mushrooms cooked` el nombre explica `yellow rice` (11
    // caracteres) de una identidad de `yellow rice mushroom` (20): 0,55. Los
    // hongos quedan sin explicar y el número lo dice.
    const cobertura = Math.min(1, identidadDeLaEntrada.join(" ").length / identidad.length);
    const candidato: CandidatoDifuso = {
      entrada,
      cobertura,
      direccion: "nombre_partido",
      confianza: confianzaDifusa(entrada, cobertura),
    };
    // OJO: los candidatos de C NO se anotan en el rescate del cocido. Ese
    // rescate mira POR DEBAJO del piso de cobertura y puede cambiar un ganador
    // de A o de B; dejar entrar a C ahí rompería la garantía de que la dirección
    // nueva no toca ningún match que ya existía. La contradicción de estado ya
    // está frenada en la condición 4, que es lo que hacía falta acá.
    if (cobertura >= COBERTURA_DIFUSA_MIN && (mejorC === null || leGana(candidato, mejorC, porConfianza))) {
      mejorC = candidato;
    }
  }

  // GANA EL QUE MÁS CONFIANZA TRAE, y a igualdad gana A (la dirección segura:
  // ahí el nombre del catálogo entró ENTERO en lo que dijo la visión).
  //
  // Antes A ganaba siempre, y con las variantes del índice eso se volvió un
  // problema medido: para `crackers, saltine`, la dirección A encontraba
  // `cracker` (la variante de `Crackers, NFS`) y le ganaba a la dirección B, que
  // tenía `Crackers, saltine, reduced sodium` —la ficha que SÍ explica la palabra
  // "saltine"—. Elegir por confianza es elegir al que deja menos sin explicar.
  const mejorA = mejorNucleo ?? mejorOtro;
  const mejorAB =
    mejorA === null ? mejorB : mejorB === null ? mejorA : mejorB.confianza > mejorA.confianza ? mejorB : mejorA;

  // Y RECIÉN ACÁ, SI NO HAY NADA, LA DIRECCIÓN C. No compite con A ni con B: las
  // reemplaza cuando las dos se callaron. Ver el encabezado de la función.
  const ganador = mejorAB ?? mejorC;

  // LA REGLA DEL CRUDO/COCIDO — LA MITAD QUE PROMUEVE (ver `PALABRAS_DE_CRUDO`
  // en `constants.ts`). La otra mitad, la que decide los EMPATES para el lado del
  // crudo, corre más arriba y en cada dirección: `desempateDeEstado`.
  //
  // Solo desempata, nunca castiga, y ADEMÁS SE LO PREGUNTA A LOS DATOS. Si el que
  // ganó dice estar crudo y hay una hermana que dice estar cocida, la cocida gana
  // ÚNICAMENTE cuando el crudo tiene MÁS calorías por 100 g que ella. Ese número
  // es lo que separa a las dos familias, y no hace falta ninguna lista:
  //
  //   - `Lentejas crudas` 352 kcal contra `Lentejas cocidas` 166. El crudo es más
  //     denso porque está SECO: nadie come lentejas crudas, y lo que hay en la
  //     foto es la cocida. La regla muerde.
  //   - `Tomate crudo` 18 kcal contra `Tomate cocido` 50; `Espinaca cruda` 23
  //     contra la cocida 59. Acá el crudo es MENOS denso —cocinar suma grasa, no
  //     saca agua— y el crudo es una forma perfectamente normal de comerlo. La
  //     regla NO muerde y el tomate de la ensalada sigue siendo crudo.
  //
  // Sin este chequeo, la primera versión de la regla convertía todo tomate y toda
  // zanahoria de una ensalada en verdura cocida con grasa. Está medido.
  if (estadoPedido !== "crudo" && ganador !== null && ganador.entrada.estado === "crudo" && cocido.mejor !== null) {
    const fichaCruda = index.porId.get(ganador.entrada.food_id);
    const fichaCocida = index.porId.get(cocido.mejor.entrada.food_id);
    if (fichaCruda !== undefined && fichaCocida !== undefined && fichaCruda.per_100g.kcal > fichaCocida.per_100g.kcal) {
      return cocido.mejor;
    }
  }
  return ganador;
}

function confianzaDifusa(entrada: TerminoIndexado, cobertura: number): number {
  return CONFIANZA_DIFUSA_MAX * cobertura * entrada.confianza;
}

/**
 * DE LOS DOS IDIOMAS, GANA EL QUE MÁS SE PARECE — no el que se consultó primero.
 *
 * Esta función existe por un bloqueante que encontró el Q/A adversarial, y vale
 * la pena dejarlo escrito porque el error era sutil y caro. La versión anterior
 * preguntaba al índice inglés, y si respondía ALGO, devolvía eso sin mirar el
 * español. Con la consulta "el bife de chorizo", el índice inglés encontraba
 * `Chorizo` adentro de la frase (cobertura 0,389) y ganaba; el español tenía
 * `Bife de chorizo` con cobertura 0,833 y ni se lo consultaba. Resultado: el
 * usuario nombraba bien un corte vacuno y el motor le devolvía un embutido — que
 * es EXACTAMENTE lo que la guarda del chorizo existe para impedir, entrando por
 * otra puerta. El barrido del Q/A encontró 3 fichas de 1.022 afectadas.
 *
 * La precedencia del inglés sigue existiendo, pero donde corresponde: para
 * DESEMPATAR. Si los dos idiomas se parecen igual, gana el inglés, porque el
 * campo que manda la visión se llama `food_en`. Verificado: repara los 7 casos
 * del barrido y no cambia ninguna de las 2.044 consultas exactas.
 */
function mejorEntreIdiomas(en: CandidatoDifuso | null, es: CandidatoDifuso | null): CandidatoDifuso | null {
  if (en === null) return es;
  if (es === null) return en;
  return es.confianza > en.confianza ? es : en;
}

/**
 * Busca un alimento. Devuelve `null` cuando el catálogo no tiene nada que
 * ofrecer — y `null` es una respuesta legítima, no un error: un alimento sin
 * ficha se declara sin ficha y sin números (regla dura 2).
 *
 * LA BARRA DE LA VISIÓN SE LEE COMO UNA O (card 6.1). `serrano/iberico` no es un
 * nombre: son dos, y el modelo no se decidió. Cada rama se busca por separado con
 * la MISMA cascada, y gana la mejor — con la lectura literal primero y ganando
 * todos los empates, así que un término sin barras recorre exactamente el mismo
 * camino que antes. Ver `lecturasDelTermino` en `normalize.ts`.
 */
export function buscarAlimento(termino: string, index: CatalogIndex): MatchResult | null {
  const lecturas = lecturasDelTermino(termino);
  const literal = lecturas[0] ?? "";
  let mejor = buscarUnaLectura(literal, index);
  for (const lectura of lecturas.slice(1)) {
    const candidato = buscarUnaLectura(lectura, index);
    if (candidato === null) continue;
    if (mejor !== null && confianzaVisible(candidato) <= confianzaVisible(mejor)) continue;
    mejor = {
      ...candidato,
      motivo:
        `${candidato.motivo} La visión escribió "${termino}" con una barra —dos nombres para el mismo ` +
        `alimento— y esta ficha salió de leer solo "${lectura.trim()}".`,
    };
  }
  return mejor;
}

/** La cascada entera sobre UNA lectura del término. */
function buscarUnaLectura(termino: string, index: CatalogIndex): MatchResult | null {
  const consulta = claveDeMatching(termino);
  if (consulta.length === 0) return null;

  /**
   * `respalda` contesta la pregunta de la DT-37 —¿esta ficha NOMBRA lo que la
   * visión describió?— y entra como función porque la ficha se resuelve acá
   * adentro. Un nivel exacto contesta que sí sin mirar nada: la consulta ES un
   * término de la ficha.
   */
  const desdeEntrada = (
    entrada: TerminoIndexado,
    nivel: NivelDeMatch,
    confianza: number,
    motivo: string,
    respalda: (ficha: CanonicalFood) => boolean,
  ): MatchResult | null => {
    const ficha = index.porId.get(entrada.food_id);
    if (ficha === undefined || ficha.deprecated) return null;
    if (guardaQueViola(consulta, ficha.id, index.guardas) !== null) return null;
    return {
      ficha,
      nivel,
      confianza_match: redondear(confianza),
      termino_matcheado: entrada.texto,
      idioma: entrada.idioma,
      motivo,
      ...(respalda(ficha) ? { identidad_respaldada: true as const } : {}),
    };
  };

  const comoVariante = (entrada: TerminoIndexado): string =>
    entrada.variante === true
      ? ` El índice llegó por una variante del nombre: se le sacaron los marcadores de USDA que dicen "sin especificar más".`
      : "";

  const siempre = (): boolean => true;

  const exactoEn = (entrada: TerminoIndexado): MatchResult | null =>
    desdeEntrada(
      entrada,
      "exacto",
      1,
      `Coincidencia exacta con el nombre en inglés del catálogo ("${entrada.texto}").${comoVariante(entrada)}`,
      siempre,
    );

  const exactoEs = (entrada: TerminoIndexado): MatchResult | null =>
    desdeEntrada(
      entrada,
      "alias",
      entrada.confianza,
      (entrada.campo === "alias"
        ? `Coincidencia exacta con un alias en español ("${entrada.texto}", confianza declarada ${entrada.confianza}).`
        : `Coincidencia exacta con el nombre en español del catálogo ("${entrada.texto}").`) + comoVariante(entrada),
      siempre,
    );

  // LOS CUATRO NIVELES EXACTOS, Y EL ORDEN ES UNA DECISIÓN.
  //
  // Primero los términos TAL COMO LOS ESCRIBIÓ LA CURACIÓN (inglés y después
  // español, que es la precedencia de siempre), y recién después las variantes
  // que el índice dedujo. Una variante no puede ganarle a un nombre real ni
  // siquiera cruzando de idioma, y eso se descubrió con un caso concreto:
  // `Salsa, NFS` (fdc-2709736, la salsa mexicana) genera la variante inglesa
  // `salsa`, que es a la vez el `names.es` de `Sauce, NFS` (fdc-2710177). Con
  // dos niveles, la variante inglesa le ganaba al nombre español y "salsa"
  // devolvía salsa mexicana. Con cuatro, el nombre escrito manda.
  const entradaEnLiteral = index.exactoEn.get(consulta);
  if (entradaEnLiteral !== undefined && entradaEnLiteral.variante !== true) {
    const r = exactoEn(entradaEnLiteral);
    if (r !== null) return r;
  }

  const entradaEsLiteral = index.exactoEs.get(consulta);
  if (entradaEsLiteral !== undefined && entradaEsLiteral.variante !== true) {
    const r = exactoEs(entradaEsLiteral);
    if (r !== null) return r;
  }

  if (entradaEnLiteral !== undefined && entradaEnLiteral.variante === true) {
    const r = exactoEn(entradaEnLiteral);
    if (r !== null) return r;
  }

  if (entradaEsLiteral !== undefined && entradaEsLiteral.variante === true) {
    const r = exactoEs(entradaEsLiteral);
    if (r !== null) return r;
  }

  // 3 — difuso: los DOS índices se consultan por separado y compiten por
  //     confianza. Separados para que `Catsup` no tenga dos dueños; en
  //     competencia para que la precedencia del inglés no le gane a un español
  //     que se parece mucho más (ver `mejorEntreIdiomas`).
  const candidatoEn = difusoEnIndice(consulta, index.difusoEn, index);
  const candidatoEs = difusoEnIndice(consulta, index.difusoEs, index);
  const ganador = mejorEntreIdiomas(candidatoEn, candidatoEs);
  const perdedor = ganador === candidatoEn ? candidatoEs : candidatoEn;

  // La reserva del crudo: si lo que se identificó NO dijo nada sobre la cocción
  // y la ficha que ganó dice que está cruda, el catálogo no tenía la cocida y
  // eso hay que decirlo donde se lee, no dejarlo en un número.
  const pidioCrudo = estadoDeCoccion(consulta) === "crudo";

  for (const candidato of [ganador, perdedor]) {
    if (candidato === null) continue;
    const idioma = candidato.entrada.idioma === "en" ? "inglés" : "español";
    const direccion =
      candidato.direccion === "nombre_en_consulta"
        ? `el nombre del catálogo está dentro de lo que se identificó`
        : candidato.direccion === "consulta_en_nombre"
          ? `lo que se identificó es el principio del nombre del catálogo`
          : `las palabras del nombre del catálogo están todas en lo que se identificó, ` +
            `pero separadas: lo que quedó en el medio no está explicado por esta ficha`;
    const reserva =
      candidato.entrada.estado === "crudo" && !pidioCrudo
        ? " OJO: la ficha es la del alimento CRUDO y lo que se identificó no dijo que lo estuviera; " +
          "el catálogo no tiene la versión cocida de este alimento, y crudo y cocido no dan los mismos valores."
        : "";
    const r = desdeEntrada(
      candidato.entrada,
      "difuso",
      candidato.confianza,
      `Coincidencia aproximada en ${idioma} con "${candidato.entrada.texto}": ${direccion} ` +
        `(cobertura ${redondear(candidato.cobertura, 2)}).${reserva}`,
      // DT-37 — LA IDENTIDAD RESPALDADA, Y LA DIRECCIÓN B QUEDA AFUERA. Que el
      // nombre del catálogo esté DENTRO de lo que dijo la visión (direcciones A
      // y C) significa que lo que sobra lo dijo la visión: describió de más. Al
      // revés —la consulta adentro del nombre, dirección B— lo que sobra son
      // afirmaciones del catálogo que nadie hizo, y ahí el respaldo valdría 1
      // por construcción sin significar nada. Ver `RESPALDO_MINIMO_DE_IDENTIDAD`.
      (ficha) =>
        candidato.direccion !== "consulta_en_nombre" &&
        respaldoDeIdentidad(consulta, ficha) >= RESPALDO_MINIMO_DE_IDENTIDAD,
    );
    if (r !== null) return r;
  }

  return null;
}
