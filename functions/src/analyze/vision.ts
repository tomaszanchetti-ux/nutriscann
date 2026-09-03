/**
 * Paso 1 del motor: la ÚNICA llamada al modelo de todo el sistema.
 *
 * Acá el modelo hace lo único que hace bien y nada más: MIRAR. Dice qué ve y
 * cuántos gramos calcula; los números nutricionales salen después, de `foods/`.
 *
 * REGLA DURA 2, escrita en el esquema: `ESQUEMA_VISION` no tiene ni `kcal` ni
 * macros. No es que el backend los descarte — es que la salida estructurada
 * (`output_config.format`) hace que el modelo no pueda emitirlos. La regla no es
 * una intención: es una imposibilidad.
 *
 * GOTCHAS DEL MODELO (documentados en CLAUDE.md, y por qué este archivo se ve
 * más pelado que el ejemplo típico del SDK):
 *   - Sonnet 5 RECHAZA `temperature`, `top_p` y `budget_tokens` con un 400. No
 *     están y no pueden estar.
 *   - El prefill de la respuesta también fue removido: la forma de la salida se
 *     fija con el esquema, no poniéndole palabras en la boca al modelo.
 *
 * SEPARACIÓN DECISIÓN / IO: la función recibe el cliente por parámetro
 * (`ClienteDeVision`) y no lo construye. Los tests le pasan uno falso y miden el
 * circuito entero —reintentos, `stop_reason`, JSON roto— sin gastar un token.
 */
import Anthropic from "@anthropic-ai/sdk";

import type { Preparacion, VisionComponent, VisionItem, VisionResult } from "../engine";
import { COOKING_TRANSFORMS } from "../kb/cooking.transforms";
import { FAMILIAS, IDS_FAMILIA_SUBFAMILIA, idCompuesto } from "../kb/familias";
import { ErrorDeAnalisis } from "./errores";

/** El modelo. Está en `CLAUDE.md` y en el §D4 del plan; no se elige por request. */
export const MODELO_VISION = "claude-sonnet-5";

/**
 * Techo de la respuesta. Un plato con muchos ingredientes ronda los 600 tokens
 * de JSON; 4.096 deja margen de sobra sin que un modelo desbocado corra el
 * timeout de la función.
 */
export const MAX_TOKENS_VISION = 4096;

/**
 * Cuántos alimentos como mucho se aceptan de un escaneo.
 *
 * El motor no limita la cantidad de items a propósito (lo dice su docstring: el
 * contrato de negocio es de esta card). El techo existe porque un plato real no
 * tiene 200 ingredientes: una lista así es un modelo desbocado o una foto de un
 * bufé, y cada item de más es una búsqueda en el índice, un item en la respuesta
 * y una fila en el expediente. 40 es holgado —una paella con todo declarado no
 * pasa de 15— y acota el peor caso. Se CORTA, no se rechaza: los primeros 40
 * items de un escaneo desbocado siguen siendo un reporte útil.
 */
export const MAX_ITEMS = 40;

/**
 * Cómo se lee cada método de cocción, para que el modelo sepa qué está eligiendo.
 *
 * El TIPO es la lista: `Record<Preparacion, string>` obliga a que estén los ocho
 * de `engine/types.ts` y ninguno más — si mañana la tabla de cocción gana un
 * noveno, esto no compila hasta que alguien escriba qué significa. La glosa es
 * texto; la LISTA nunca se escribe a mano (ver `PREPARACIONES`).
 */
const GLOSA_DE_PREPARACION: Record<Preparacion, string> = {
  crudo: "sin cocinar (fruta, verdura cruda, jamón crudo)",
  mezclado: "mezclado o servido sin una cocción propia que se distinga; es el caso general",
  frito: "frito en aceite abundante (rebozados, patatas fritas, croquetas)",
  horneado: "al horno o asado, en seco",
  plancha: "a la plancha, parrilla o sartén con poco aceite",
  hervido: "hervido, guisado en agua o al vapor (legumbre, pasta, arroz, verdura)",
  horneado_masa: "masa horneada (pan, pizza, bollería, empanada, tarta)",
  cocido_cebolla: "pochado o sofrito lento en aceite (cebolla, sofrito, pimiento confitado)",
};

/**
 * Los OCHO métodos de cocción, en el orden de la tabla de cocción.
 *
 * SALEN DE `COOKING_TRANSFORMS`, no de una lista escrita acá. Hasta la Fase 5
 * eran cinco copiados a mano y el Bloque 0 midió lo que costaba: faltaban
 * `crudo`, `hervido` y `cocido_cebolla`, así que 24 subfamilias de verdura,
 * legumbre y patata declaraban `mezclado` (factor 1,000) y una lenteja hervida
 * se componía sin el agua que gana (1,113). Que la lista salga de la tabla es lo
 * que garantiza que el enum y el rendimiento no se separen nunca.
 */
export const PREPARACIONES: readonly Preparacion[] = Object.keys(COOKING_TRANSFORMS) as Preparacion[];

/**
 * La taxonomía escrita para el modelo: 46 familias, 191 subfamilias.
 *
 * Se GENERA desde `FAMILIAS` (que a su vez se genera desde la curación). Escribir
 * estos 191 renglones a mano sería tener dos vocabularios que se separan en
 * silencio: el del enum del esquema y el de la explicación del prompt. El
 * marcador `[descomponer]` son las 11 subfamilias en modo `componer` —ensaladas,
 * bocadillos, tacos—, donde el número lo carga la suma de los ingredientes y no
 * una ficha promedio (medido: el plato de salmón respondido por identidad da
 * 1.049 kcal contra 595 reales, +76 %).
 */
export const LISTA_DE_SUBFAMILIAS: string = FAMILIAS.map((familia) => {
  const lineas = familia.subfamilias.map((sub) => {
    const marca = sub.modo === "componer" ? "  [descomponer]" : "";
    return `  ${idCompuesto(familia, sub)} = ${sub.nombre_es} | ${sub.nombre_en}${marca}`;
  });
  return [`${familia.nombre_es} / ${familia.nombre_en}:`, ...lineas].join("\n");
}).join("\n");

/** Los tres formatos de imagen que aceptamos. Son los que manda la PWA. */
export type MediaType = "image/jpeg" | "image/png" | "image/webp";
export const MEDIA_TYPES: readonly MediaType[] = ["image/jpeg", "image/png", "image/webp"];

/**
 * El esquema de salida: es `VisionResult` de `engine/types.ts`, exacto.
 *
 * Restricciones de la salida estructurada que explican la forma de abajo:
 * `additionalProperties: false` es obligatorio en todo objeto; los campos
 * opcionales se declaran NO poniéndolos en `required` (los tipos nulables
 * `["string","null"]` no están soportados); `minimum`/`maximum` tampoco, así que
 * los rangos se piden en la descripción y se SANEAN en `interpretarVision` — un
 * rango que el esquema no puede exigir lo tiene que exigir el código.
 */
export const ESQUEMA_VISION = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "items"],
  properties: {
    is_food: {
      type: "boolean",
      description:
        "true si la foto muestra comida o bebida, INCLUIDO un producto envasado cuya etiqueta se " +
        "puede leer: un envase con etiqueta legible ES comida, y la etiqueta es la fuente más " +
        "precisa que existe. Una persona, un paisaje, una pantalla, comida de plástico, un plato " +
        "vacío o una foto ilegible son false.",
    },
    items: {
      type: "array",
      description:
        "Un elemento por alimento distinguible en el plato. Vacío si is_food es false.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["food_en", "food_es", "grams", "confidence", "familia_subfamilia", "components"],
        properties: {
          food_en: {
            type: "string",
            description:
              "El nombre del alimento en INGLÉS GENÉRICO, en el registro de USDA FoodData Central " +
              '(por ejemplo "chicken breast, grilled", "white rice, cooked", "olive oil"). ' +
              "Sin marcas comerciales y sin adjetivos de presentación.",
          },
          food_es: {
            type: "string",
            description:
              "EL MISMO alimento nombrado en ESPAÑOL DE ESPAÑA, como lo diría alguien al sentarse a la " +
              'mesa: "paella", "tortilla de patatas", "lasaña", "papas fritas", "bife", "panecillo". ' +
              "El nombre corto y común del plato o del alimento, sin describir los ingredientes y sin " +
              "traducir palabra por palabra el nombre en inglés. Si el alimento no tiene un nombre en " +
              "español, escribí el que se usa igual (por ejemplo \"croissant\" o \"ketchup\").",
          },
          // OBLIGATORIO, y la razón está medida: el 02/09 en producción el modelo
          // escribió "pizza with ham and mushrooms" y ninguna de las CINCO fichas
          // de pizza del catálogo se alcanzó, porque el término "pizza" a secas no
          // existe como nombre. Un campo de texto libre ya lo tenemos —es
          // `food_en`/`food_es`—; el valor de este es que la respuesta caiga en una
          // lista CERRADA que el motor conoce byte a byte. Es el RESPALDO del
          // término, nunca su reemplazo: pisar el término exacto con la cabeza de
          // familia llevaría el atún en lata de 85 a 238 kcal (Bloque 0, punto c).
          familia_subfamilia: {
            type: "string",
            enum: IDS_FAMILIA_SUBFAMILIA,
            description:
              "La subfamilia del catálogo a la que pertenece este alimento, con la forma " +
              '"familia/subfamilia" (por ejemplo "pizza/con-carne"). Elegí SIEMPRE la más ' +
              "específica que aplique; ante la duda entre dos, la más genérica de la misma familia. " +
              "La lista completa, con el nombre de cada una, está en las instrucciones.",
          },
          grams: {
            type: "number",
            description:
              "Gramos de la PORCIÓN VISIBLE en el plato, estimados a partir del tamaño aparente. " +
              "Mayor que 0. Es una estimación de volumen, no un dato de tabla.",
          },
          confidence: {
            type: "number",
            description:
              "Entre 0 y 1: cuánta confianza tenés en haber IDENTIFICADO bien el alimento " +
              "(no en el número de gramos).",
          },
          // La lista es CERRADA y son los OCHO de `Preparacion` en engine/types,
          // que salen de la tabla de cocción. Importa que sea el esquema el que la
          // cierre: el motor degrada un método desconocido a "mezclado" en
          // silencio, así que un noveno valor no rompería nada — daría un número
          // calculado con el rendimiento equivocado. "Sin preparación declarada" se
          // dice OMITIENDO el campo y no mandando null: la salida estructurada no
          // soporta tipos nulables (`["string","null"]`), y por eso `preparation`
          // no está en `required`.
          preparation: {
            type: "string",
            enum: PREPARACIONES,
            description:
              "El método de cocción, SOLO si se ve con claridad. Omitir el campo si no se distingue: " +
              "lo que no se ve lo pone la subfamilia, que trae su método por defecto.",
          },
          // OBLIGATORIO desde la Fase 5, y vacío en un alimento simple. Antes decía
          // "solo cuando el plato no tiene un nombre obvio", y el resultado medido
          // fue que la composición disparó CERO veces en los 204 ítems del golden.
          // Que estén siempre convierte la composición en un respaldo disponible en
          // vez de una excepción que nunca ocurre.
          components: {
            type: "array",
            description:
              "Los ingredientes visibles del plato, con sus gramos. SIEMPRE que el plato tenga más " +
              "de un ingrediente que se distinga; array VACÍO en un alimento simple o cuando la " +
              "receta no se ve (una croqueta, una lasaña). Los gramos de los ingredientes suman " +
              "aproximadamente los gramos del plato.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["food_en", "food_es", "grams"],
              properties: {
                food_en: { type: "string", description: "El ingrediente en inglés genérico de USDA." },
                food_es: { type: "string", description: "El mismo ingrediente en español de España." },
                grams: { type: "number", description: "Gramos de ese ingrediente dentro del plato." },
                familia_subfamilia: {
                  type: "string",
                  enum: IDS_FAMILIA_SUBFAMILIA,
                  description:
                    "La subfamilia del ingrediente, misma lista que la del alimento. Opcional, " +
                    "pero ponela siempre que la sepas: es lo que salva al ingrediente que el " +
                    "catálogo no tiene por su nombre (la masa de pizza, sin ir más lejos).",
                },
              },
            },
          },
          // La etiqueta de un envase es el dato más preciso de toda la foto: dice el
          // producto y muchas veces el peso. Hasta la Fase 5 se tiraba, y encima el
          // esquema declaraba que un envase cerrado NO era comida — un pan de
          // centeno en su paquete salió `is_food: false`. Solo el NOMBRE impreso:
          // las calorías de la etiqueta no entran (regla dura 2), los números salen
          // del catálogo.
          etiqueta_del_envase: {
            type: "string",
            description:
              "El nombre del producto tal cual está impreso en el envase, cuando la foto muestra un " +
              "producto envasado con etiqueta legible. Omitir el campo si no hay envase o no se lee. " +
              "Nunca copies de la etiqueta calorías ni valores nutricionales.",
          },
        },
      },
    },
  },
} as const;

/**
 * Las instrucciones del paso 1. El modelo identifica; la base de datos cuantifica.
 *
 * Está en castellano rioplatense a propósito: es un texto INTERNO, no lo lee
 * ningún usuario. Lo que ve el usuario sale del catálogo y de `config/app`.
 *
 * Es largo (la taxonomía son ~12 KB) y es IDÉNTICO en todas las llamadas: por eso
 * viaja como bloque de sistema con `cache_control` — ver `pedirVision`.
 */
export const PROMPT_VISION = [
  "Sos el paso de VISIÓN de una app de nutrición. Mirás la foto de un plato y decís QUÉ hay y CUÁNTO.",
  "",
  "Del otro lado hay una base nutricional de 1.115 fichas con trazabilidad a USDA. Vos no calculás",
  "ni un número nutricional: solo nombrás y estimás gramos. Para llegar a la ficha hay DOS caminos y",
  "usás LOS DOS en cada alimento:",
  "  · EL CAMINO PRECISO — `food_en` y `food_es`, el nombre corto y común. Cuando acierta, es el mejor",
  "    número posible porque da la ficha exacta de ESE alimento.",
  "  · EL RESPALDO — `familia_subfamilia`, un valor de una lista CERRADA de 191. Cuando el nombre no",
  "    llega a ninguna ficha, la subfamilia garantiza que el plato tenga un número igual.",
  "Los dos son obligatorios y ninguno reemplaza al otro.",
  "",
  "Lo que hacés:",
  "",
  "1. `is_food`. true si hay comida o bebida, INCLUIDO un producto envasado con la etiqueta legible.",
  "   false si es una persona, un paisaje, una pantalla, comida de plástico, un plato vacío o una foto",
  "   que no se entiende. Con false, `items` va vacío.",
  "",
  "2. Los nombres. Nombrás cada alimento distinguible DOS VECES, en `food_en` y en `food_es`. Son los",
  "   dos idiomas de la base y con los dos se busca:",
  '   · `food_en`: el término común de USDA FoodData Central ("beef steak, grilled", "white rice, cooked").',
  '   · `food_es`: el mismo alimento como lo llamaría alguien en España ("bife", "arroz blanco cocido",',
  '     "paella", "tortilla de patatas", "lasaña", "papas fritas"). El nombre CORTO Y COMÚN del plato.',
  "   Los dos nombres son del MISMO alimento: no pongas el plato en uno y un ingrediente en el otro.",
  "   Preferí siempre el nombre común y corto antes que una descripción larga: la base guarda nombres",
  '   de alimentos, no descripciones. "coleslaw" antes que "coleslaw, cabbage and carrot salad".',
  "",
  "3. `familia_subfamilia`. Un id de la lista de abajo, con la forma `familia/subfamilia`. Dos reglas:",
  "   · Elegí SIEMPRE la subfamilia MÁS ESPECÍFICA que aplique. Dentro de una misma familia el número",
  "     cambia muchísimo: una verdura cruda son 30 kcal/100 g y la misma verdura cocida con grasa, 86.",
  "   · Ante la duda entre dos, elegí la MÁS GENÉRICA DE LA MISMA FAMILIA. Equivocar la familia es el",
  "     error caro; equivocar la subfamilia dentro de la familia correcta, no tanto.",
  '   Ejemplo del caso que nos rompió en producción: una pizza de jamón y champiñones es "pizza/con-carne".',
  "",
  "4. `grams`. Los gramos de la porción VISIBLE, a partir del tamaño aparente y de referencias de la",
  "   foto (el plato, los cubiertos, un vaso). Si el envase trae el peso impreso, ese es el número.",
  "",
  "5. `confidence`. Entre 0 y 1: cuánto confiás en la IDENTIFICACIÓN, no en los gramos.",
  "",
  "6. `preparation`. Solo si el método de cocción se VE. Si no se distingue, omitís el campo: lo que",
  "   vos no ves lo pone la subfamilia, que trae su propio método por defecto. Los ocho valores son:",
  ...PREPARACIONES.map((metodo) => `   · ${metodo}: ${GLOSA_DE_PREPARACION[metodo]}`),
  "",
  "7. `components`. SIEMPRE que el plato tenga más de un ingrediente que se distinga, los declarás uno",
  "   por uno con sus gramos, y los gramos de los ingredientes suman aproximadamente los del plato.",
  "   A cada ingrediente le ponés también su `familia_subfamilia` cuando la sepas.",
  "   Va VACÍO (`[]`, no lo omitas) en dos casos:",
  "   · un alimento simple: una manzana, una loncha de queso, un vaso de leche;",
  "   · un plato con la receta escondida, donde los ingredientes NO se ven por separado: una croqueta,",
  "     una lasaña, una paella, un guiso. Ahí lo que importa es nombrar bien el plato entero, y no",
  "     inventar una receta que la foto no muestra.",
  "   En las subfamilias marcadas [descomponer] —ensaladas, bocadillos, tacos, platos combinados— la",
  "   descomposición es lo que da el número bueno: ahí no la saltees.",
  "",
  "8. Envases. Si la foto es un producto envasado y la etiqueta se lee, ESO ES COMIDA: `is_food` true,",
  "   `etiqueta_del_envase` con el nombre del producto tal cual está impreso, `food_en`/`food_es` con",
  "   el producto, su `familia_subfamilia`, y los gramos que declare el envase si están impresos.",
  "   La etiqueta es la fuente más precisa que hay en la foto; no la desperdicies.",
  "",
  "Lo que NO hacés, nunca:",
  "- No estimás calorías, proteínas, carbohidratos, grasas ni ningún valor nutricional. No es tu tarea",
  "  y tu esquema de salida ni siquiera tiene esos campos: esos números salen de una base de datos",
  "  con trazabilidad a USDA, no de vos. Tampoco los copiás de la etiqueta de un envase.",
  "- No inventás alimentos que no ves. Si la foto no es comida, `is_food` es false y `items` va vacío.",
  "- No agrupás el plato entero en un solo item genérico si podés nombrar sus partes.",
  "",
  "LAS 191 SUBFAMILIAS, agrupadas por familia (id = nombre en español | nombre en inglés):",
  "",
  LISTA_DE_SUBFAMILIAS,
].join("\n");

// ---------------------------------------------------------------------------
// El cliente, inyectado
// ---------------------------------------------------------------------------

/**
 * Lo único que este archivo necesita de Anthropic.
 *
 * Es una interfaz mínima a propósito: un test que quiera simular un 529 o un
 * `stop_reason` raro escribe cuatro líneas, no un doble del SDK entero.
 */
export interface ClienteDeVision {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/** Timeout de UNA llamada. La función tiene 60 s: tres intentos entran holgados. */
export const TIMEOUT_LLAMADA_MS = 45_000;

/**
 * Las cabeceras extra de la llamada. Hoy es una sola y condicional.
 *
 * `anthropic-workspace-id` va SOLO si hay un workspace declarado: una key común
 * no la necesita, y mandarla vacía es peor que no mandarla. Una key
 * *identity-linked*, en cambio, hace que la API rechace toda llamada sin ella
 * (ver `ANTHROPIC_WORKSPACE_ID` en `runtime.ts`).
 *
 * Es una función y no un objeto para poder testear la decisión sin construir un
 * cliente: qué cabeceras se mandan es lo que importa, no cómo se guardan.
 */
export function cabecerasDeVision(workspaceId: string): Record<string, string> {
  const limpio = workspaceId.trim();
  return limpio.length > 0 ? { "anthropic-workspace-id": limpio } : {};
}

/**
 * El cliente real. `maxRetries: 0` a propósito: los reintentos los hace
 * `pedirVision` con su propia política, y dos capas de backoff superpuestas
 * darían un peor caso de minutos dentro de una función de 60 segundos.
 */
export function crearClienteDeVision(apiKey: string, workspaceId = ""): ClienteDeVision {
  return new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: TIMEOUT_LLAMADA_MS,
    defaultHeaders: cabecerasDeVision(workspaceId),
  });
}

// ---------------------------------------------------------------------------
// Reintentos
// ---------------------------------------------------------------------------

/** Reintentos ANTE FALLAS TRANSITORIAS. 2 reintentos = 3 intentos como mucho. */
export const MAX_REINTENTOS = 2;
/** Espera del primer reintento; el segundo espera el doble. */
export const BACKOFF_BASE_MS = 500;

/** ¿Vale la pena volver a intentar? Solo 429, 529 y 5xx, más las fallas de red. */
export function esTransitorio(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true;
  const status = (err as { status?: unknown }).status;
  if (typeof status !== "number") return false;
  return status === 429 || status === 529 || status >= 500;
}

export interface OpcionesDeVision {
  /** Inyectable para que los tests no esperen de verdad. */
  esperar?: (ms: number) => Promise<void>;
  /** Inyectable para que la latencia medida sea determinística en los tests. */
  ahora?: () => number;
  maxReintentos?: number;
}

const esperarDeVerdad = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// La llamada
// ---------------------------------------------------------------------------

export interface EntradaDeVision {
  image_base64: string;
  media_type: MediaType;
}

export interface MetaDeVision {
  model: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  /**
   * Tokens ESCRITOS al caché de prompt en esta llamada (el prompt de sistema, la
   * primera vez). Se cobran a 1,25×. Si aparece en toda llamada en vez de solo en
   * la primera, el prefijo está variando y el caché no sirve para nada.
   */
  tokens_cache_write: number;
  /** Tokens LEÍDOS del caché (a 0,1×). Es la medida de que el caché funciona. */
  tokens_cache_read: number;
  /** Cuántas veces se llamó al modelo. 1 en el camino feliz. */
  intentos: number;
  stop_reason: string | null;
}

export interface ResultadoDeVision {
  vision: VisionResult;
  meta: MetaDeVision;
}

/**
 * Le pide al modelo que mire la imagen y devuelve un `VisionResult` saneado.
 *
 * Lanza `ErrorDeAnalisis` y nada más: `modelo_no_disponible` si el servicio no
 * responde ni después de los reintentos, `respuesta_ilegible` si respondió pero
 * lo que dijo no se puede usar.
 */
export async function pedirVision(
  cliente: ClienteDeVision,
  entrada: EntradaDeVision,
  opciones: OpcionesDeVision = {},
): Promise<ResultadoDeVision> {
  const esperar = opciones.esperar ?? esperarDeVerdad;
  const ahora = opciones.ahora ?? Date.now;
  const maxReintentos = opciones.maxReintentos ?? MAX_REINTENTOS;

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: MODELO_VISION,
    max_tokens: MAX_TOKENS_VISION,
    // EL SISTEMA VA CACHEADO. Desde la Fase 5 el prompt lleva las 191 subfamilias
    // adentro (~4.000 tokens) y es BYTE POR BYTE EL MISMO en todos los escaneos:
    // es el caso de libro del caché de prefijo. Va como bloque con
    // `cache_control` en vez de como string suelto porque el string no admite el
    // marcador. Lo único que cambia entre llamadas es la imagen, y la imagen va
    // DESPUÉS del sistema en el orden de render (tools → system → messages), así
    // que no invalida nada.
    //
    // TTL de 5 minutos (el default): con tráfico continuo cada llamada refresca
    // la entrada y sale más barato que la de 1 hora, que cobra el doble por
    // escribirla. Con la primera foto del día se paga el write y se lee gratis el
    // resto; el mínimo cacheable de Sonnet 5 son 1.024 tokens y este prompt los
    // pasa cuatro veces. Se verifica con `tokens_cache_read` de la meta: si viene
    // en cero llamada tras llamada, algo está variando el prefijo.
    system: [{ type: "text", text: PROMPT_VISION, cache_control: { type: "ephemeral" } }],
    // Sin `temperature`, sin `top_p`, sin `budget_tokens`: Sonnet 5 los rechaza con 400.
    output_config: { format: { type: "json_schema", schema: ESQUEMA_VISION as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: entrada.media_type, data: entrada.image_base64 },
          },
          { type: "text", text: "¿Qué hay en este plato y cuánto?" },
        ],
      },
    ],
  };

  const comenzo = ahora();
  let ultimoError: unknown = null;

  for (let intento = 1; intento <= maxReintentos + 1; intento += 1) {
    let respuesta: Anthropic.Message;
    try {
      respuesta = await cliente.messages.create(params);
    } catch (err) {
      ultimoError = err;
      if (!esTransitorio(err) || intento === maxReintentos + 1) {
        throw new ErrorDeAnalisis(
          "modelo_no_disponible",
          `la llamada al modelo falló en el intento ${intento}: ${describir(err)}`,
        );
      }
      await esperar(BACKOFF_BASE_MS * 2 ** (intento - 1));
      continue;
    }

    // EL `stop_reason` SE MIRA ANTES QUE EL CONTENIDO. Un `max_tokens` deja un
    // JSON cortado a la mitad que parsea distinto según dónde cayó el corte;
    // leerlo primero y preguntar después es cómo se descubre en producción.
    const stop = respuesta.stop_reason ?? null;
    if (stop !== "end_turn") {
      throw new ErrorDeAnalisis(
        "respuesta_ilegible",
        `el modelo terminó con stop_reason="${stop ?? "null"}" y la respuesta no se puede usar`,
      );
    }

    const texto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const vision = interpretarVision(texto);
    return {
      vision,
      meta: {
        model: respuesta.model ?? MODELO_VISION,
        latency_ms: ahora() - comenzo,
        tokens_in: respuesta.usage.input_tokens,
        tokens_out: respuesta.usage.output_tokens,
        tokens_cache_write: respuesta.usage.cache_creation_input_tokens ?? 0,
        tokens_cache_read: respuesta.usage.cache_read_input_tokens ?? 0,
        intentos: intento,
        stop_reason: stop,
      },
    };
  }

  // Inalcanzable: el bucle sale por `return` o por `throw`. Está por el tipo.
  throw new ErrorDeAnalisis("modelo_no_disponible", `sin intentos disponibles: ${describir(ultimoError)}`);
}

function describir(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

// ---------------------------------------------------------------------------
// Saneo
// ---------------------------------------------------------------------------

/**
 * Convierte el texto del modelo en un `VisionResult` con los tipos garantizados.
 *
 * La salida estructurada garantiza la FORMA (el JSON valida contra el esquema),
 * pero el esquema no puede exigir rangos (`minimum`/`maximum` no están
 * soportados). Entonces el rango se exige acá: `confidence` se recorta a 0..1 y
 * `grams` negativos o no finitos se vuelven 0 —el motor ya sabe qué hacer con
 * un item de 0 gramos—. Un item sin `food_en` utilizable se descarta: nombrar
 * nada no es un alimento.
 *
 * Y lo que el esquema SÍ exige tampoco se da por hecho (Fase 5): la
 * `familia_subfamilia` se verifica contra la lista real y, si no está, se cae el
 * CAMPO y nunca el item —el alimento sigue teniendo sus dos nombres, que son el
 * camino preciso—; la `etiqueta_del_envase` se recorta y en blanco no viaja; y
 * `components` sale SIEMPRE como array, vacío incluido. Una salida vieja, un JSON
 * reparado a mano o un enum que se movió en un re-seed llegan igual por acá.
 */
export function interpretarVision(texto: string): VisionResult {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (err) {
    throw new ErrorDeAnalisis("respuesta_ilegible", `el modelo no devolvió JSON: ${describir(err)}`);
  }

  if (crudo === null || typeof crudo !== "object" || Array.isArray(crudo)) {
    throw new ErrorDeAnalisis("respuesta_ilegible", "el modelo devolvió un JSON que no es un objeto");
  }

  const objeto = crudo as Record<string, unknown>;
  if (typeof objeto["is_food"] !== "boolean") {
    throw new ErrorDeAnalisis("respuesta_ilegible", "la respuesta del modelo no trae `is_food` booleano");
  }
  const is_food = objeto["is_food"];
  if (!is_food) return { is_food: false, items: [] };

  const crudos = Array.isArray(objeto["items"]) ? (objeto["items"] as unknown[]) : [];
  const items: VisionItem[] = [];
  for (const entrada of crudos) {
    if (items.length >= MAX_ITEMS) break;
    const item = interpretarItem(entrada);
    if (item !== null) items.push(item);
  }
  return { is_food: true, items };
}

function interpretarItem(entrada: unknown): VisionItem | null {
  if (entrada === null || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const objeto = entrada as Record<string, unknown>;

  const food_en = typeof objeto["food_en"] === "string" ? objeto["food_en"].trim() : "";
  const food_es = typeof objeto["food_es"] === "string" ? objeto["food_es"].trim() : "";
  // ALCANZA CON QUE HAYA UNO DE LOS DOS NOMBRES. El esquema pide los dos, pero
  // el item se descarta solo si no quedó NINGUNA forma de nombrar el alimento:
  // un plato que solo tiene nombre en español se busca igual, y el motor sabe
  // buscar con lo que haya (`buscarConDosNombres`).
  if (food_en.length === 0 && food_es.length === 0) return null;

  const item: VisionItem = {
    food_en,
    grams: numeroNoNegativo(objeto["grams"]),
    confidence: recortar01(objeto["confidence"]),
  };
  if (food_es.length > 0) item.food_es = food_es;

  // LA SUBFAMILIA SE DESCARTA SOLA, NUNCA EL ITEM. El esquema la cierra con un
  // enum, pero el saneo no puede confiar en eso: una salida vieja, un JSON
  // reparado a mano o un enum que se movió después de un re-seed llegan igual
  // acá. Si el valor no está en la lista, lo que se pierde es el RESPALDO —el
  // alimento sigue teniendo sus dos nombres, que son el camino preciso—.
  const familia = objeto["familia_subfamilia"];
  if (typeof familia === "string" && SUBFAMILIAS_VALIDAS.has(familia.trim())) {
    item.familia_subfamilia = familia.trim();
  }

  const etiqueta = typeof objeto["etiqueta_del_envase"] === "string" ? objeto["etiqueta_del_envase"].trim() : "";
  if (etiqueta.length > 0) item.etiqueta_del_envase = etiqueta;

  const preparation = objeto["preparation"];
  if (typeof preparation === "string" && (PREPARACIONES as readonly string[]).includes(preparation)) {
    item.preparation = preparation as Preparacion;
  }

  // `components` SIEMPRE ES UN ARRAY desde la Fase 5, vacío incluido. El motor
  // distingue "no hay ingredientes que sumar" de "no vinieron" mirando el largo,
  // no la existencia del campo, y así el expediente muestra un array vacío en vez
  // de un hueco: se ve que el modelo miró y no había nada que descomponer.
  const components = objeto["components"];
  item.components = (Array.isArray(components) ? components : [])
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object" && !Array.isArray(c))
    .map((c) => {
      const componente: VisionComponent = {
        food_en: typeof c["food_en"] === "string" ? c["food_en"].trim() : "",
        grams: numeroNoNegativo(c["grams"]),
      };
      const es = typeof c["food_es"] === "string" ? c["food_es"].trim() : "";
      if (es.length > 0) componente.food_es = es;
      const suFamilia = c["familia_subfamilia"];
      if (typeof suFamilia === "string" && SUBFAMILIAS_VALIDAS.has(suFamilia.trim())) {
        componente.familia_subfamilia = suFamilia.trim();
      }
      return componente;
    })
    .filter((c) => c.food_en.length > 0 || (c.food_es ?? "").length > 0);

  return item;
}

/** Los 191 ids, en un Set: el saneo pregunta una vez por item y por componente. */
const SUBFAMILIAS_VALIDAS: ReadonlySet<string> = new Set(IDS_FAMILIA_SUBFAMILIA);

function numeroNoNegativo(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return 0;
  return valor;
}

function recortar01(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor));
}
