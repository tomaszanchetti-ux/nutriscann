/**
 * El motor entero, en una función.
 *
 * `analizarEscaneo` recibe lo que vio el modelo y un catálogo YA CARGADO, y
 * devuelve el reporte. No hay `await` en todo el archivo, y eso no es una
 * casualidad: es el contrato. La card 2.2 pone los adaptadores —leer la imagen,
 * llamar a Sonnet, traer las fichas de Firestore, persistir el scan— alrededor
 * de esta función, sin meterle nada adentro.
 *
 * EL ORDEN DE DECISIÓN PARA CADA ITEM, que es toda la lógica del archivo:
 *
 *   1. ¿El catálogo conoce el plato entero? → esa ficha, con su confianza.
 *   2. ¿No, pero la visión vio los ingredientes? → se compone en el momento.
 *   3. ¿Ninguna de las dos? → `no_catalogado`: SIN NÚMEROS y a la cola de curación.
 *
 * Sobre el paso 3 hay una DESVIACIÓN DECLARADA respecto del §3 del plan, que
 * decía que un alimento sin ficha llevaba "un fallback del LLM etiquetado como
 * estimación". No lo hace, y no por olvido: la regla dura 2 dice que el modelo no
 * emite números, y un número sin ficha no es trazable a ninguna fuente USDA. Una
 * estimación con etiqueta sigue siendo un número que el usuario suma. Lo que el
 * motor entrega en su lugar es la verdad completa: qué vio, que no lo tiene, y el
 * registro para que el catálogo lo tenga la próxima vez.
 */
import type { CatalogIndex } from "./catalog";
import { escalar, gramosValidos, interpretarGramos, sumarTotales } from "./arithmetic";
import { componerPlato } from "./compose";
import { FACTOR_GENERICO } from "./constants";
import { buscarConDosNombres, redondear } from "./match";
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

/** Un item de la visión, saneado. Lo que no se entiende queda en su valor neutro. */
function itemSaneado(crudo: unknown): VisionItem {
  const item = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Partial<VisionItem>;
  const componentes = Array.isArray(item.components) ? item.components : undefined;
  return {
    food_en: terminoDeVision(item.food_en),
    food_es: terminoDeVision(item.food_es),
    grams: typeof item.grams === "number" ? item.grams : Number.NaN,
    confidence: typeof item.confidence === "number" ? item.confidence : 0,
    preparation: item.preparation ?? null,
    ...(componentes === undefined
      ? {}
      : {
          components: componentes.map((c) => {
            const componente = (typeof c === "object" && c !== null ? c : {}) as Partial<VisionComponent>;
            return {
              food_en: terminoDeVision(componente.food_en),
              food_es: terminoDeVision(componente.food_es),
              grams: typeof componente.grams === "number" ? componente.grams : Number.NaN,
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
  const confianzaVision = confianzaDeVision(item.confidence);
  const { gramos: gramosDeclarados, problema: problemaDeGramos } = interpretarGramos(item.grams);
  const preparation = item.preparation ?? null;

  // 1 — el plato entero, tal cual, contra el catálogo. Los DOS nombres que dijo
  //     la visión, y gana el que el catálogo conoce mejor (card 2.6).
  const match = buscarConDosNombres(termino_en, terminoDeVision(item.food_es), index);
  if (match !== null) {
    const esGenerico = match.ficha.generic === true;
    const confianzaMatch = redondear(match.confianza_match * (esGenerico ? FACTOR_GENERICO : 1));
    const caveats = [...(match.ficha.caveats ?? [])];
    if (problemaDeGramos !== null) caveats.unshift(problemaDeGramos);
    const motivoBase = esGenerico
      ? `${match.motivo} La ficha es genérica (promedio de una familia): la confianza baja un ${Math.round((1 - FACTOR_GENERICO) * 100)} %.`
      : match.motivo;
    return {
      termino_en,
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
  }

  // 2 — no hay ficha del plato: se compone con lo que la visión vio adentro
  const composicion = componerPlato(item, index);
  if (composicion.ok) {
    // Un compuesto SÍ tiene de dónde sacar la masa cuando la visión no la
    // estimó: la suma de sus ingredientes es una masa real, no un cero inventado.
    const gramos = gramosDeclarados > 0 ? gramosDeclarados : composicion.composicion.peso_final_g;
    const caveats = [...composicion.caveats];
    if (problemaDeGramos !== null) {
      caveats.unshift(
        `${problemaDeGramos} Se usó el peso que suman los ingredientes (${composicion.composicion.peso_final_g} g).`,
      );
    }
    if (composicion.algun_generico) {
      caveats.push("Alguno de los ingredientes es una ficha genérica: su valor es el promedio de una familia.");
    }
    cola.agregar({
      termino_en,
      motivo: "compuesto_en_runtime",
      grams: gramos,
      preparation,
      componentes: composicion.composicion.componentes.map((c) => ({
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
      food_id: null,
      name_es: null,
      name_en: null,
      source_ref: null,
      grams: gramos,
      confidence: redondear(confianzaVision * composicion.confianza_match),
      confidence_vision: confianzaVision,
      confidence_match: composicion.confianza_match,
      match: "compuesto",
      caveats,
      per_100g: composicion.derivacion.per_100g,
      nutrients: escalar(composicion.derivacion.per_100g, gramos),
      motivo:
        `El catálogo no tiene este plato: se compuso con ${composicion.composicion.componentes.length} fichas ` +
        `y el método "${composicion.composicion.metodo}". La cuenta entera está en "composicion".`,
      composicion: composicion.composicion,
    };
  }

  // 3 — no catalogado: sin números, y a la cola
  for (const faltante of composicion.sin_match) {
    cola.agregar({
      termino_en: faltante.termino_en,
      motivo: "componente_sin_match",
      grams: faltante.grams > 0 ? faltante.grams : null,
      preparation: null,
      detalle: `Ingrediente visible de "${termino_en}" que el catálogo no sabe nombrar.`,
    });
  }
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
