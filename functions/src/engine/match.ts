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
import type { CatalogIndex, GuardaDeVocabulario, TerminoIndexado } from "./catalog";
import { COBERTURA_DIFUSA_MIN, CONFIANZA_DIFUSA_MAX, DECIMALES, FACTOR_GENERICO } from "./constants";
import {
  claveDeMatching,
  contieneSecuencia,
  estadoDeCoccion,
  empiezaConPalabra,
  inicioDelAcompanamiento,
  mismasPreparaciones,
  posicionDeSecuencia,
  sinDescriptores,
  tokens,
} from "./normalize";

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
  return confianzaVisible(porEs) > confianzaVisible(porEn) ? porEs : porEn;
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
 *     la cruda es más densa (o sea, cuando está seca).
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
        if (mejor === null || cobertura > mejor.cobertura) {
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
      if (cobertura >= COBERTURA_DIFUSA_MIN && (mejorB === null || cobertura > mejorB.cobertura)) {
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
    if (cobertura >= COBERTURA_DIFUSA_MIN && (mejorC === null || candidato.confianza > mejorC.confianza)) {
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

  // LA REGLA DEL CRUDO/COCIDO (ver `PALABRAS_DE_CRUDO` en `constants.ts`).
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
 */
export function buscarAlimento(termino: string, index: CatalogIndex): MatchResult | null {
  const consulta = claveDeMatching(termino);
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

  const comoVariante = (entrada: TerminoIndexado): string =>
    entrada.variante === true
      ? ` El índice llegó por una variante del nombre: se le sacaron los marcadores de USDA que dicen "sin especificar más".`
      : "";

  const exactoEn = (entrada: TerminoIndexado): MatchResult | null =>
    desdeEntrada(
      entrada,
      "exacto",
      1,
      `Coincidencia exacta con el nombre en inglés del catálogo ("${entrada.texto}").${comoVariante(entrada)}`,
    );

  const exactoEs = (entrada: TerminoIndexado): MatchResult | null =>
    desdeEntrada(
      entrada,
      "alias",
      entrada.confianza,
      (entrada.campo === "alias"
        ? `Coincidencia exacta con un alias en español ("${entrada.texto}", confianza declarada ${entrada.confianza}).`
        : `Coincidencia exacta con el nombre en español del catálogo ("${entrada.texto}").`) + comoVariante(entrada),
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
    );
    if (r !== null) return r;
  }

  return null;
}
