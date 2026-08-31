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
 * Y encima de los tres, las GUARDAS: pares término/ficha que están prohibidos
 * salga el match de donde salga.
 */
import type { CanonicalFood } from "../kb/types";
import type { CatalogIndex, GuardaDeVocabulario, TerminoIndexado } from "./catalog";
import { COBERTURA_DIFUSA_MIN, CONFIANZA_DIFUSA_MAX, DECIMALES } from "./constants";
import { contieneSecuencia, empiezaConPalabra, normalizar } from "./normalize";

export type NivelDeMatch = "exacto" | "alias" | "difuso";

export interface MatchResult {
  ficha: CanonicalFood;
  nivel: NivelDeMatch;
  /** 0..1 — cuánto se puede creer que ESTA ficha es ESE alimento. */
  confianza_match: number;
  /** El texto del catálogo que ganó, tal cual está escrito ahí. */
  termino_matcheado: string;
  idioma: "en" | "es";
  motivo: string;
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
 */
export function guardaQueViola(
  consultaNormalizada: string,
  food_id: string,
  guardas: GuardaDeVocabulario[],
): GuardaDeVocabulario | null {
  for (const guarda of guardas) {
    if (!guarda.prohibido_en.includes(food_id)) continue;
    if (!empiezaConPalabra(consultaNormalizada, guarda.termino)) continue;
    const levantada = (guarda.salvo_si_contiene ?? []).some((palabra) =>
      contieneSecuencia(consultaNormalizada, normalizar(palabra)),
    );
    if (!levantada) return guarda;
  }
  return null;
}

interface CandidatoDifuso {
  entrada: TerminoIndexado;
  /** Cuánto del texto largo explica el texto corto, en caracteres. 0..1. */
  cobertura: number;
  direccion: "nombre_en_consulta" | "consulta_en_nombre";
  /** `0,6 × cobertura × confianza del término`. Es con esto que se compara. */
  confianza: number;
}

/**
 * El difuso de UN índice (inglés o español, nunca los dos juntos).
 *
 * Dos direcciones, y la primera le gana siempre a la segunda:
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
 */
function difusoEnIndice(
  consulta: string,
  lista: TerminoIndexado[],
  guardas: GuardaDeVocabulario[],
): CandidatoDifuso | null {
  let mejorA: CandidatoDifuso | null = null;
  let mejorB: CandidatoDifuso | null = null;

  for (const entrada of lista) {
    if (guardaQueViola(consulta, entrada.food_id, guardas) !== null) continue;

    if (contieneSecuencia(consulta, entrada.clave)) {
      const cobertura = entrada.clave.length / consulta.length;
      if (cobertura >= COBERTURA_DIFUSA_MIN && (mejorA === null || cobertura > mejorA.cobertura)) {
        mejorA = { entrada, cobertura, direccion: "nombre_en_consulta", confianza: confianzaDifusa(entrada, cobertura) };
      }
      continue;
    }

    if (empiezaConPalabra(entrada.clave, consulta)) {
      const cobertura = consulta.length / entrada.clave.length;
      if (cobertura >= COBERTURA_DIFUSA_MIN && (mejorB === null || cobertura > mejorB.cobertura)) {
        mejorB = { entrada, cobertura, direccion: "consulta_en_nombre", confianza: confianzaDifusa(entrada, cobertura) };
      }
    }
  }

  return mejorA ?? mejorB;
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
 */
export function buscarAlimento(termino: string, index: CatalogIndex): MatchResult | null {
  const consulta = normalizar(termino);
  if (consulta.length === 0) return null;

  const desdeEntrada = (
    entrada: TerminoIndexado,
    nivel: NivelDeMatch,
    confianza: number,
    motivo: string,
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
    };
  };

  // 1 — exacto contra names.en
  const exactoEn = index.exactoEn.get(consulta);
  if (exactoEn !== undefined) {
    const r = desdeEntrada(exactoEn, "exacto", 1, `Coincidencia exacta con el nombre en inglés del catálogo ("${exactoEn.texto}").`);
    if (r !== null) return r;
  }

  // 2 — exacto contra el vocabulario español (names.es + aliases con confianza)
  const exactoEs = index.exactoEs.get(consulta);
  if (exactoEs !== undefined) {
    const comoAlias = exactoEs.campo === "alias";
    const r = desdeEntrada(
      exactoEs,
      "alias",
      exactoEs.confianza,
      comoAlias
        ? `Coincidencia exacta con un alias en español ("${exactoEs.texto}", confianza declarada ${exactoEs.confianza}).`
        : `Coincidencia exacta con el nombre en español del catálogo ("${exactoEs.texto}").`,
    );
    if (r !== null) return r;
  }

  // 3 — difuso: los DOS índices se consultan por separado y compiten por
  //     confianza. Separados para que `Catsup` no tenga dos dueños; en
  //     competencia para que la precedencia del inglés no le gane a un español
  //     que se parece mucho más (ver `mejorEntreIdiomas`).
  const candidatoEn = difusoEnIndice(consulta, index.difusoEn, index.guardas);
  const candidatoEs = difusoEnIndice(consulta, index.difusoEs, index.guardas);
  const ganador = mejorEntreIdiomas(candidatoEn, candidatoEs);
  const perdedor = ganador === candidatoEn ? candidatoEs : candidatoEn;

  for (const candidato of [ganador, perdedor]) {
    if (candidato === null) continue;
    const idioma = candidato.entrada.idioma === "en" ? "inglés" : "español";
    const direccion =
      candidato.direccion === "nombre_en_consulta"
        ? `el nombre del catálogo está dentro de lo que se identificó`
        : `lo que se identificó es el principio del nombre del catálogo`;
    const r = desdeEntrada(
      candidato.entrada,
      "difuso",
      candidato.confianza,
      `Coincidencia aproximada en ${idioma} con "${candidato.entrada.texto}": ${direccion} ` +
        `(cobertura ${redondear(candidato.cobertura, 2)}).`,
    );
    if (r !== null) return r;
  }

  return null;
}
