/**
 * La puerta del motor. Lo que la card 2.2 importa es esto y nada más.
 *
 * El motor es MATEMÁTICA Y DECISIÓN PURA: ni una lectura de archivo, ni una
 * llamada de red, ni un `await`. Recibe lo que vio el modelo y un catálogo ya
 * cargado; devuelve el reporte. Por eso se testea entero sin Firestore, sin
 * emulador y sin gastar un token.
 *
 * El circuito completo, del lado de la 2.2:
 *
 *     const fichas = await traerFichasDeFirestore();          // IO
 *     const index  = construirIndice(fichas, kb_version);     // una vez por instancia
 *     const vision = await pedirleAlModeloQueMire(imagen);    // IO
 *     const reporte = analizarEscaneo(vision, index);         // ← puro
 *     await guardarScan(reporte);                             // IO
 *
 * =============================================================================
 * LAS CUATRO COSAS QUE HAY QUE SABER ANTES DE CABLEAR ESTO
 * =============================================================================
 *
 * 1. `construirIndice` LANZA si el catálogo viene con menos de
 *    `MINIMO_DE_FICHAS` (100) fichas activas. No es una molestia: es el único
 *    lugar donde se puede distinguir "la lectura de Firestore falló" de "el
 *    plato es exótico". Sin ese piso, un índice vacío no rompe nada — contesta
 *    que NINGÚN alimento está catalogado y llena la cola de curación con comida
 *    perfectamente normal, y el error se descubre semanas después. Construí el
 *    índice al arrancar la instancia y dejá que un catálogo roto sea un arranque
 *    roto. Para fixtures chicos, pasá `{ minimo_de_fichas: 1 }` a propósito.
 *
 * 2. QUÉ SANEA EL MOTOR Y QUÉ NO. `analizarEscaneo` no lanza NUNCA: una salida
 *    del modelo que no es un objeto, un item nulo, un `food_en` que llega como
 *    número, gramos `NaN` o negativos — todo eso sale como item declarado, con
 *    su motivo, sin números inventados. Lo que el motor NO hace es validar el
 *    contrato de negocio: no verifica que la `kb_version` del índice sea la que
 *    `config/app` espera, no limita cuántos items trae un escaneo, no valida el
 *    tamaño de la imagen ni el `stop_reason` de la llamada. Eso es de la 2.2.
 *
 * 3. `preparation` FUERA DEL ENUM DEGRADA A `mezclado`, EN SILENCIO. El motor
 *    prefiere componer con la convención medida de FNDDS antes que rechazar el
 *    plato, así que un `preparation: "al vapor"` no se queja: compone como
 *    mezclado. Por eso EL SCHEMA DEL MODELO TIENE QUE CERRAR EL ENUM a los cinco
 *    valores de `Preparacion`. Si el schema lo deja abierto, el motor no te va a
 *    avisar que el modelo está inventando métodos de cocción.
 *
 * 4. `curation_candidates` VIENE DEDUPLICADO POR ESCANEO, NO ENTRE ESCANEOS. Si
 *    la misma foto trae dos veces el mismo alimento desconocido, sale un
 *    candidato. Si mil usuarios fotografían el mismo alimento desconocido, salen
 *    mil candidatos, uno por escaneo. La deduplicación entre escaneos —y el
 *    contador de cuántas veces apareció, que es lo que hace útil la cola— es un
 *    upsert de la 2.2 contra `curation_queue`, no algo que el motor pueda saber.
 */
export { analizarEscaneo } from "./analyze";
export { construirIndice, indiceDelCatalogo, GUARDAS_DE_VOCABULARIO, MINIMO_DE_FICHAS } from "./catalog";
export type {
  CatalogIndex,
  ColisionDeIndice,
  EntradaDeTaxonomia,
  GuardaDeVocabulario,
  Taxonomia,
  TerminoIndexado,
} from "./catalog";
export {
  buscarAlimento,
  cabezaDeLaTaxonomia,
  contradiceALaFamilia,
  guardaQueViola,
  redondear,
  subfamiliaDeclarada,
  sustitutoDeclarado,
} from "./match";
export type { MatchResult, NivelDeMatch } from "./match";
export { componerPlato } from "./compose";
export type { ComposicionLograda, ComposicionImposible, ResultadoDeComposicion } from "./compose";
export {
  escalar,
  esPlausible,
  gramosValidos,
  interpretarGramos,
  masaCoherente,
  porcentajesDeMacros,
  sumarTotales,
} from "./arithmetic";
export type { ContextoDePlausibilidad, VeredictoDePlausibilidad } from "./arithmetic";
export {
  ATWATER,
  COBERTURA_DIFUSA_MIN,
  CONFIANZA_CABEZA_FAMILIA,
  CONFIANZA_CABEZA_SUBFAMILIA,
  CONFIANZA_DIFUSA_MAX,
  CONFIANZA_SUSTITUTO_DECLARADO,
  DECIMALES,
  FACTOR_COMPOSICION,
  FACTOR_COMPOSICION_PARCIAL,
  FACTOR_GENERICO,
  KCAL_MAXIMAS_POR_100G,
  MASA_FALTANTE_MAXIMA,
  PREPARACION_POR_DEFECTO,
} from "./constants";
export { contieneSecuencia, empiezaConPalabra, normalizar, tokens } from "./normalize";
export type {
  ComponenteDelPlato,
  ComponenteFaltante,
  Composicion,
  CurationCandidate,
  EngineItem,
  EngineResult,
  EngineTotals,
  MotivoDeCuracion,
  Per100gEscalado,
  PorcentajesDeMacros,
  Preparacion,
  TipoDeMatch,
  SumaDeNutrientes,
  TotalesNutrientes,
  VisionComponent,
  VisionItem,
  VisionResult,
} from "./types";
