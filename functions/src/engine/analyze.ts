/**
 * El motor entero, en una función.
 *
 * `analizarEscaneo` recibe lo que vio el modelo y un catálogo YA CARGADO, y
 * devuelve el reporte. No hay `await` en todo el archivo, y eso no es una
 * casualidad: es el contrato. La card 2.2 pone los adaptadores —leer la imagen,
 * llamar a Sonnet, traer las fichas de Firestore, persistir el scan— alrededor
 * de esta función, sin meterle nada adentro.
 *
 * EL ORDEN DE DECISIÓN PARA CADA ITEM, que es toda la lógica del archivo. La
 * card 5.3 lo pasó de tres escalones a seis, y cada uno nuevo existe por un
 * número del Bloque 0 de la Fase 5:
 *
 *   1. EL TÉRMINO. ¿El catálogo conoce este alimento por su nombre? → esa ficha.
 *      **Gana siempre que llegue**, y no es una preferencia: pisar el término con
 *      la cabeza de su subfamilia empeoraría 8 de los 31 ítems del golden que hoy
 *      entran por nombre, uno de ellos un +180 % (el atún en lata, de 85 a 238
 *      kcal). Con una sola excepción, medida y acotada: un DIFUSO que cae en otra
 *      familia que la que declaró la visión no vale (ver `contradiceALaFamilia`).
 *   2. EL SUSTITUTO DECLARADO. La curación fue a los datasets, comprobó que USDA
 *      no mide este alimento y escribió cuál es la ficha más cercana.
 *   3. LA COMPOSICIÓN, SI LA SUBFAMILIA ES DE `componer`. Una ensalada mixta o un
 *      bocadillo son una reunión de cosas separables, y responderlos con una
 *      identidad es el peor error medido del informe: aplicarle al plato entero
 *      la densidad del salmón a la plancha da 1.049 kcal contra 595 reales.
 *   4. LA CABEZA DE LA SUBFAMILIA, Y SI NO HAY, LA DE LA FAMILIA. La visión eligió
 *      `familia/subfamilia` de una lista cerrada de 191 valores: eso es una
 *      identidad declarada, y la taxonomía dice qué ficha responde por ella.
 *   5. LA COMPOSICIÓN, completa o PARCIAL. Ver `compose.ts`: un ingrediente que
 *      falta ya no deja el plato entero sin número si pesa poco.
 *   6. `no_catalogado`: SIN NÚMEROS y a la cola de curación.
 *
 * Sobre el paso 6 hay una DESVIACIÓN DECLARADA respecto del §3 del plan, que
 * decía que un alimento sin ficha llevaba "un fallback del LLM etiquetado como
 * estimación". No lo hace, y no por olvido: la regla dura 2 dice que el modelo no
 * emite números, y un número sin ficha no es trazable a ninguna fuente USDA. Una
 * estimación con etiqueta sigue siendo un número que el usuario suma. Lo que el
 * motor entrega en su lugar es la verdad completa: qué vio, que no lo tiene, y el
 * registro para que el catálogo lo tenga la próxima vez.
 *
 * Y TODO LO QUE EL MOTOR CONSTRUYE PASA POR EL HALO DE PLAUSIBILIDAD antes de
 * publicarse (`esPlausible`, en `arithmetic.ts`). Una composición cuyos valores
 * por 100 g no pueden existir no se muestra con cara de medida: cae al escalón
 * siguiente con el motivo escrito.
 */
import type { CatalogIndex, EntradaDeTaxonomia } from "./catalog";
import { escalar, gramosValidos, interpretarGramos, masaCoherente, sumarTotales } from "./arithmetic";
import { componerPlato, type ComposicionLograda, type ResultadoDeComposicion } from "./compose";
import { FACTOR_GENERICO } from "./constants";
import {
  buscarConDosNombres,
  cabezaDeLaTaxonomia,
  contradiceALaFamilia,
  redondear,
  subfamiliaDeclarada,
  sustitutoDeclarado,
  type MatchResult,
} from "./match";
import type {
  CurationCandidate,
  EngineItem,
  EngineResult,
  VisionComponent,
  VisionItem,
  VisionResult,
} from "./types";

/**
 * LA FRONTERA.
 *
 * Todo lo que entra a este archivo viene de un JSON que armó un modelo de
 * lenguaje. Los tipos de `types.ts` describen lo que ESPERAMOS, no lo que
 * garantiza nadie: un schema estricto reduce muchísimo la probabilidad de que
 * llegue basura, no la vuelve cero, y una excepción acá es un 500 en la cara del
 * usuario por una foto de un plato.
 *
 * La regla de estas funciones es la misma que la del resto del motor: una
 * entrada que no se entiende se DECLARA como no entendida —item sin ficha, sin
 * números, con su motivo escrito— y nunca lanza.
 */

/** La confianza de la visión, saneada: fuera del rango 0..1 no significa nada. */
function confianzaDeVision(valor: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return 0;
  return redondear(Math.min(1, Math.max(0, valor)));
}

/** El nombre del alimento, si es que llegó algo que se pueda leer como nombre. */
function terminoDeVision(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

/**
 * El `familia/subfamilia` que dijo la visión, si es que dijo algo legible.
 *
 * NO SE VALIDA CONTRA EL ENUM ACÁ: eso lo hace la taxonomía del índice, que es
 * la que sabe cuáles son los 191 valores. Un id que no existe se comporta igual
 * que si la visión no hubiera declarado ninguno — la cascada baja un escalón— y
 * eso es deliberado: el motor no rechaza escaneos, los declara.
 */
function familiaDeVision(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}

/** Un item de la visión, saneado. Lo que no se entiende queda en su valor neutro. */
function itemSaneado(crudo: unknown): VisionItem {
  const item = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Partial<VisionItem>;
  const componentes = Array.isArray(item.components) ? item.components : undefined;
  const familia = familiaDeVision(item.familia_subfamilia);
  return {
    food_en: terminoDeVision(item.food_en),
    food_es: terminoDeVision(item.food_es),
    grams: typeof item.grams === "number" ? item.grams : Number.NaN,
    confidence: typeof item.confidence === "number" ? item.confidence : 0,
    preparation: item.preparation ?? null,
    ...(familia === undefined ? {} : { familia_subfamilia: familia }),
    ...(componentes === undefined
      ? {}
      : {
          components: componentes.map((c) => {
            const componente = (typeof c === "object" && c !== null ? c : {}) as Partial<VisionComponent>;
            const familiaDelComponente = familiaDeVision(componente.familia_subfamilia);
            return {
              food_en: terminoDeVision(componente.food_en),
              food_es: terminoDeVision(componente.food_es),
              grams: typeof componente.grams === "number" ? componente.grams : Number.NaN,
              ...(familiaDelComponente === undefined ? {} : { familia_subfamilia: familiaDelComponente }),
            };
          }),
        }),
  };
}

class ColaDeCuracion {
  private readonly vistos = new Set<string>();
  readonly candidatos: CurationCandidate[] = [];

  agregar(candidato: CurationCandidate): void {
    const clave = `${candidato.motivo}::${candidato.termino_en.trim().toLowerCase()}`;
    if (this.vistos.has(clave)) return;
    this.vistos.add(clave);
    this.candidatos.push(candidato);
  }
}

function resolverItem(item: VisionItem, index: CatalogIndex, cola: ColaDeCuracion): EngineItem {
  const termino_en = terminoDeVision(item.food_en);
  // El español de la visión, saneado con la misma regla que el inglés. Se
  // calcula UNA vez y viaja a los tres caminos de salida: es la entrada del
  // matching (card 2.6) y desde la DT-25 también parte del expediente.
  const termino_es = terminoDeVision(item.food_es);
  const confianzaVision = confianzaDeVision(item.confidence);
  const { gramos: gramosDeclarados, problema: problemaDeGramos } = interpretarGramos(item.grams);
  const preparation = item.preparation ?? null;

  // LA SUBFAMILIA CON LA QUE SE VA A TRABAJAR (card 5.3): la que declaró la
  // visión eligiendo de una lista cerrada, o —último recurso— la que se deduce
  // si el nombre ES el nombre de una subfamilia. Ver `subfamiliaDeclarada`.
  const taxonomia = subfamiliaDeclarada(item.familia_subfamilia, termino_en, termino_es, index);
  const entrada: EntradaDeTaxonomia | null = taxonomia?.entrada ?? null;

  /** El ítem que sale de una ficha, sea cual sea el escalón por el que llegó. */
  const conFicha = (match: MatchResult, extra: string[] = []): EngineItem => {
    const esGenerico = match.ficha.generic === true;
    const confianzaMatch = redondear(match.confianza_match * (esGenerico ? FACTOR_GENERICO : 1));
    const caveats = [...(match.ficha.caveats ?? []), ...extra];
    if (problemaDeGramos !== null) caveats.unshift(problemaDeGramos);
    const motivoBase = esGenerico
      ? `${match.motivo} La ficha es genérica (promedio de una familia): la confianza baja un ${Math.round((1 - FACTOR_GENERICO) * 100)} %.`
      : match.motivo;
    return {
      termino_en,
      termino_es,
      food_id: match.ficha.id,
      name_es: match.ficha.names.es,
      name_en: match.ficha.names.en,
      source_ref: match.ficha.source_ref,
      grams: gramosDeclarados,
      confidence: redondear(confianzaVision * confianzaMatch),
      confidence_vision: confianzaVision,
      confidence_match: confianzaMatch,
      match: match.nivel,
      ...(esGenerico ? { generic: true as const } : {}),
      ...(match.identidad_respaldada === true ? { identidad_respaldada: true as const } : {}),
      ...(problemaDeGramos !== null ? { grams_no_estimados: true as const } : {}),
      ...(caveats.length > 0 ? { caveats } : {}),
      per_100g: match.ficha.per_100g,
      // Sin una masa usable NO se cuantifica: se sabe QUÉ es (la ficha y sus
      // valores por 100 g quedan a la vista), no CUÁNTO hay. Cero gramos sería
      // afirmar que el alimento no aporta nada, y eso no es lo que pasó.
      nutrients: problemaDeGramos === null ? escalar(match.ficha.per_100g, gramosDeclarados) : null,
      motivo: problemaDeGramos === null ? motivoBase : `${motivoBase} ${problemaDeGramos}`,
    };
  };

  // 1 — el plato entero, tal cual, contra el catálogo. Los DOS nombres que dijo
  //     la visión, y gana el que el catálogo conoce mejor (card 2.6).
  const porNombre = buscarConDosNombres(termino_en, termino_es, index);
  // LA ÚNICA VEZ QUE UN MATCH SE DESCARTA (card 5.3). Un difuso que cae en otra
  // familia que la declarada no es "otro camino al mismo alimento": es una
  // conjetura del motor contra una identidad que el modelo eligió de una lista
  // cerrada. Un exacto o un alias no se tocan — los escribió alguien.
  const contradice =
    porNombre !== null && entrada !== null && taxonomia?.declarada === true
      ? contradiceALaFamilia(porNombre, entrada, index)
      : false;
  if (porNombre !== null && !contradice) return conFicha(porNombre);

  const avisoDeContradiccion =
    contradice && porNombre !== null
      ? [
          `Por el nombre, el catálogo ofrecía "${porNombre.ficha.names.es ?? porNombre.ficha.names.en}", que es de ` +
            `otra familia que la declarada (${entrada?.familia.nombre_es}). Era una coincidencia aproximada, ` +
            `así que ganó la familia.`,
        ]
      : [];

  // 2 — el sustituto que escribió la curación para lo que USDA no mide.
  const sustituto = sustitutoDeclarado(termino_en, termino_es, index);
  if (sustituto !== null) return conFicha(sustituto, avisoDeContradiccion);

  // La composición se calcula UNA vez y se usa en dos lugares distintos de la
  // cascada según el modo de la subfamilia. Ver los pasos 3 y 5.
  const composicion = componerPlato(item, index, entrada);

  /** El ítem que sale de una composición, completa o parcial. */
  const conComposicion = (compuesta: ComposicionLograda): EngineItem => {
    // LA MASA DEL PLATO, con el candado de coherencia (card 5.3): la visión
    // estima el peso del plato y el de cada ingrediente por separado, y cuando
    // los dos no se parecen se cree a la suma de los ingredientes.
    const { gramos, motivo: motivoDeMasa } = masaCoherente(gramosDeclarados, compuesta.masa_de_los_ingredientes_g);
    const caveats = [...compuesta.caveats];
    if (motivoDeMasa !== null) caveats.unshift(motivoDeMasa);
    if (problemaDeGramos !== null) {
      caveats.unshift(
        `${problemaDeGramos} Se usó el peso que suman los ingredientes (${compuesta.masa_de_los_ingredientes_g} g).`,
      );
    }
    if (compuesta.algun_generico) {
      caveats.push("Alguno de los ingredientes es una ficha genérica: su valor es el promedio de una familia.");
    }
    cola.agregar({
      termino_en,
      motivo: "compuesto_en_runtime",
      grams: gramos,
      preparation,
      componentes: compuesta.composicion.componentes.map((c) => ({
        termino_en: c.termino_en,
        grams: c.grams,
        food_id: c.food_id,
      })),
      detalle:
        "El catálogo no tiene este plato y se compuso en el momento con sus ingredientes. " +
        "Es candidato a ficha propia: la composición sale de la foto, una ficha saldría de una receta declarada.",
    });
    return {
      termino_en,
      termino_es,
      food_id: null,
      // DT-19 — UN PLATO COMPUESTO TIENE NOMBRE EN ESPAÑOL. Hasta acá salía en
      // `null` y la pantalla mostraba el término en inglés que había escrito la
      // visión: un usuario español leía "Chicken and pepper skewer" sobre su
      // brocheta. El nombre es lo que dijo la visión en español y, si no dijo
      // nada, el de la subfamilia que declaró — que también está en español.
      name_es: termino_es.length > 0 ? termino_es : (entrada?.subfamilia.nombre_es ?? null),
      name_en: null,
      source_ref: null,
      grams: gramos,
      confidence: redondear(confianzaVision * compuesta.confianza_match),
      confidence_vision: confianzaVision,
      confidence_match: compuesta.confianza_match,
      match: compuesta.parcial ? "compuesto_parcial" : "compuesto",
      caveats,
      per_100g: compuesta.derivacion.per_100g,
      nutrients: escalar(compuesta.derivacion.per_100g, gramos),
      motivo:
        `El catálogo no tiene este plato: se compuso con ${compuesta.composicion.componentes.length} fichas ` +
        `y el método "${compuesta.composicion.metodo}"` +
        (compuesta.parcial
          ? `, sin ${compuesta.sin_match.length} ingrediente(s) que el catálogo no tiene ` +
            `(${compuesta.composicion.gramos_faltantes} g de ${gramos} g). `
          : ". ") +
        `La cuenta entera está en "composicion".`,
      composicion: { ...compuesta.composicion, gramos_del_plato: gramos },
    };
  };

  /** Los ingredientes que no se resolvieron van a la cola, se haya compuesto o no. */
  const anotarFaltantes = (resultado: ResultadoDeComposicion): void => {
    for (const faltante of resultado.sin_match) {
      cola.agregar({
        termino_en: faltante.termino_en,
        motivo: "componente_sin_match",
        grams: faltante.grams > 0 ? faltante.grams : null,
        preparation: null,
        detalle: `Ingrediente visible de "${termino_en}" que el catálogo no sabe nombrar.`,
      });
    }
  };

  // 3 — LA COMPOSICIÓN VA ANTES QUE LA IDENTIDAD cuando la subfamilia es de
  //     `componer`. Medido en el Bloque 0: al plato de salmón con patatas, pan y
  //     manzana, responderlo por identidad le da 1.049 kcal contra 595 reales
  //     (+76 %), porque le aplica la densidad del salmón a los 405 g del plato.
  if (entrada?.subfamilia.modo === "componer" && composicion.ok) {
    anotarFaltantes(composicion);
    return conComposicion(composicion);
  }

  // 4 — la cabeza de la subfamilia, y si no hay, la de la familia.
  const cabeza = entrada === null ? null : cabezaDeLaTaxonomia(entrada);
  if (cabeza !== null) {
    anotarFaltantes(composicion);
    // Si se intentó componer y no se pudo, el motivo viaja: quien lea el ítem
    // tiene que poder distinguir "no había ingredientes" de "la composición no
    // pasó el halo de plausibilidad".
    const porQueNoSeCompuso =
      !composicion.ok && Array.isArray(item.components) && item.components.length > 0 ? [composicion.motivo] : [];
    return conFicha(cabeza, [...avisoDeContradiccion, ...porQueNoSeCompuso]);
  }

  // 5 — la composición, completa o parcial, para todo lo demás.
  if (composicion.ok) {
    anotarFaltantes(composicion);
    return conComposicion(composicion);
  }

  // 6 — no catalogado: sin números, y a la cola
  anotarFaltantes(composicion);
  cola.agregar({
    termino_en,
    motivo: "sin_match",
    grams: gramosDeclarados > 0 ? gramosDeclarados : null,
    preparation,
    ...(item.components && item.components.length > 0
      ? {
          componentes: item.components.map((c) => ({
            termino_en: c.food_en,
            grams: gramosValidos(c.grams),
            food_id: null,
          })),
        }
      : {}),
    detalle: composicion.motivo,
  });

  return {
    termino_en,
    termino_es,
    food_id: null,
    name_es: null,
    name_en: null,
    source_ref: null,
    grams: gramosDeclarados,
    confidence: 0,
    confidence_vision: confianzaVision,
    confidence_match: 0,
    match: "no_catalogado",
    per_100g: null,
    nutrients: null,
    motivo:
      `El catálogo no tiene este alimento y no se pudo componer (${composicion.motivo}) ` +
      `Se declara sin números: un valor sin ficha no sería trazable a ninguna fuente.`,
  };
}

/**
 * Analiza un escaneo entero. Determinística y total: los mismos datos de entrada
 * y el mismo catálogo dan siempre el mismo resultado, byte a byte.
 */
export function analizarEscaneo(vision: VisionResult, index: CatalogIndex): EngineResult {
  const vacio: EngineResult = {
    es_comida: false,
    items: [],
    totals: null,
    curation_candidates: [],
    kb_version: index.kb_version,
  };

  // Una salida del modelo que ni siquiera es un objeto no es "un plato que no
  // reconozco": es una respuesta que no se puede leer, y se contesta como la
  // foto que no es comida. Antes de esto, un `vision` nulo tumbaba el análisis.
  if (typeof vision !== "object" || vision === null) return vacio;
  if (vision.is_food !== true) return vacio;

  const cola = new ColaDeCuracion();
  const crudos: unknown[] = Array.isArray(vision.items) ? vision.items : [];
  const items = crudos.map((crudo) => resolverItem(itemSaneado(crudo), index, cola));

  return {
    es_comida: true,
    items,
    totals: sumarTotales(items),
    curation_candidates: cola.candidatos,
    kb_version: index.kb_version,
  };
}
