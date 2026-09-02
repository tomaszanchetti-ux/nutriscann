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

/** Los cinco métodos de cocción que la visión puede declarar (`engine/types.ts`). */
export const PREPARACIONES: readonly Preparacion[] = [
  "frito",
  "horneado",
  "horneado_masa",
  "plancha",
  "mezclado",
];

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
        "true solo si la foto muestra comida o bebida lista para consumir. Una persona, un paisaje, " +
        "una pantalla, un envase cerrado o una foto ilegible son false.",
    },
    items: {
      type: "array",
      description:
        "Un elemento por alimento distinguible en el plato. Vacío si is_food es false.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["food_en", "food_es", "grams", "confidence"],
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
          // La lista es CERRADA y son los cinco de `Preparacion` en engine/types.
          // Importa que sea el esquema el que la cierre: el motor degrada un
          // método desconocido a "mezclado" en silencio, así que un sexto valor
          // no rompería nada — daría un número calculado con el rendimiento
          // equivocado. "Sin preparación declarada" se dice OMITIENDO el campo y
          // no mandando null: la salida estructurada no soporta tipos nulables
          // (`["string","null"]`), y por eso `preparation` no está en `required`.
          preparation: {
            type: "string",
            enum: PREPARACIONES,
            description:
              "El método de cocción, SOLO si se ve con claridad. Omitir el campo si no se distingue.",
          },
          components: {
            type: "array",
            description:
              "Los ingredientes visibles, SOLO cuando el plato entero no tiene un nombre genérico " +
              "obvio en inglés y hay que describirlo por partes. Omitir el campo en un alimento simple.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["food_en", "food_es", "grams"],
              properties: {
                food_en: { type: "string", description: "El ingrediente en inglés genérico de USDA." },
                food_es: { type: "string", description: "El mismo ingrediente en español de España." },
                grams: { type: "number", description: "Gramos de ese ingrediente dentro del plato." },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Las instrucciones del paso 1. El modelo identifica; la base de datos cuantifica. */
export const PROMPT_VISION = [
  "Sos el paso de VISIÓN de una app de nutrición. Mirás la foto de un plato y decís QUÉ hay y CUÁNTO.",
  "",
  "Lo que hacés:",
  "1. Decidís si la foto es comida o bebida lista para consumir (`is_food`).",
  "2. Nombrás cada alimento distinguible DOS VECES, en `food_en` y en `food_es`. Son los dos idiomas de",
  "   la base nutricional que hay del otro lado, y con los dos se busca:",
  '   · `food_en`: el término común de USDA FoodData Central ("beef steak, grilled", "white rice, cooked").',
  '   · `food_es`: el mismo alimento como lo llamaría alguien en España ("bife", "arroz blanco cocido",',
  '     "paella", "tortilla de patatas", "lasaña", "papas fritas"). El nombre CORTO Y COMÚN del plato.',
  "   Los dos nombres son del MISMO alimento: no pongas el plato en uno y un ingrediente en el otro.",
  "   Preferí siempre el nombre común y corto antes que una descripción larga: la base guarda nombres",
  '   de alimentos, no descripciones. "coleslaw" antes que "coleslaw, cabbage and carrot salad".',
  "3. Estimás los gramos de la porción VISIBLE de cada alimento, a partir del tamaño aparente y de",
  "   referencias de la foto (el plato, los cubiertos, un vaso).",
  "4. Ponés `confidence` entre 0 y 1 según cuánto confiás en la IDENTIFICACIÓN, no en los gramos.",
  "5. `preparation` solo si el método de cocción se VE. Si no se distingue, omitís el campo.",
  "6. `components` solo cuando el plato entero no tiene un nombre obvio y hay que describirlo",
  "   por sus ingredientes visibles. En un alimento simple, omitís el campo.",
  "",
  "Lo que NO hacés, nunca:",
  "- No estimás calorías, proteínas, carbohidratos, grasas ni ningún valor nutricional. No es tu tarea",
  "  y tu esquema de salida ni siquiera tiene esos campos: esos números salen de una base de datos",
  "  con trazabilidad a USDA, no de vos.",
  "- No inventás alimentos que no ves. Si la foto no es comida, `is_food` es false y `items` va vacío.",
  "- No agrupás el plato entero en un solo item genérico si podés nombrar sus partes.",
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
    system: PROMPT_VISION,
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

  const preparation = objeto["preparation"];
  if (typeof preparation === "string" && (PREPARACIONES as readonly string[]).includes(preparation)) {
    item.preparation = preparation as Preparacion;
  }

  const components = objeto["components"];
  if (Array.isArray(components)) {
    const limpios = components
      .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object" && !Array.isArray(c))
      .map((c) => {
        const componente: VisionComponent = {
          food_en: typeof c["food_en"] === "string" ? c["food_en"].trim() : "",
          grams: numeroNoNegativo(c["grams"]),
        };
        const es = typeof c["food_es"] === "string" ? c["food_es"].trim() : "";
        if (es.length > 0) componente.food_es = es;
        return componente;
      })
      .filter((c) => c.food_en.length > 0 || (c.food_es ?? "").length > 0);
    if (limpios.length > 0) item.components = limpios;
  }

  return item;
}

function numeroNoNegativo(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return 0;
  return valor;
}

function recortar01(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor));
}
