/**
 * El paso 1, medido sin gastar un token.
 *
 * El cliente entra por parámetro, así que un test puede ser un 529, un JSON
 * cortado o un `stop_reason` que nadie espera — los tres casos que en producción
 * se descubren tarde y con una foto de un usuario adentro.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";

import { ErrorDeAnalisis } from "./errores";
import {
  cabecerasDeVision,
  ESQUEMA_VISION,
  MAX_ITEMS,
  MAX_REINTENTOS,
  MODELO_VISION,
  esTransitorio,
  interpretarVision,
  pedirVision,
  type ClienteDeVision,
} from "./vision";

// ---------------------------------------------------------------------------
// Dobles
// ---------------------------------------------------------------------------

function mensaje(texto: string, extra: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODELO_VISION,
    content: [{ type: "text", text: texto, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1200,
      output_tokens: 180,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
    container: null,
    context_management: null,
    ...extra,
  } as unknown as Anthropic.Message;
}

interface Espia {
  cliente: ClienteDeVision;
  llamadas: Anthropic.MessageCreateParamsNonStreaming[];
  esperas: number[];
}

/** Un cliente que devuelve (o lanza) lo que se le indique, en orden. */
function espia(respuestas: (Anthropic.Message | Error)[]): Espia {
  const llamadas: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const esperas: number[] = [];
  const cliente: ClienteDeVision = {
    messages: {
      create: async (params) => {
        llamadas.push(params);
        const siguiente = respuestas[llamadas.length - 1];
        if (siguiente === undefined) throw new Error("el test no preparó otra respuesta");
        if (siguiente instanceof Error) throw siguiente;
        return siguiente;
      },
    },
  };
  return { cliente, llamadas, esperas };
}

function errorHttp(status: number): Error {
  const err = new Error(`HTTP ${status}`);
  (err as unknown as { status: number }).status = status;
  return err;
}

const IMAGEN = { image_base64: "AAAA", media_type: "image/jpeg" } as const;

const UNA_MANZANA = JSON.stringify({
  is_food: true,
  items: [{ food_en: "apple, raw", grams: 150, confidence: 0.92 }],
});

// ---------------------------------------------------------------------------
// El esquema: la regla dura 2, escrita como candado
// ---------------------------------------------------------------------------

test("el esquema de salida NO puede nombrar calorías ni macros (regla dura 2)", () => {
  const serializado = JSON.stringify(ESQUEMA_VISION);
  // La regla no es "el backend los ignora": es que el modelo no puede emitirlos.
  // Si alguien agrega el campo, el candado suena acá y no en un reporte con un
  // número que no viene de ninguna ficha de USDA.
  for (const prohibido of [
    "kcal",
    "calor",
    "protein",
    "carb",
    "fat_g",
    "fiber",
    "sugar",
    "sodium",
    "nutrient",
  ]) {
    assert.equal(
      serializado.toLowerCase().includes(`"${prohibido}`),
      false,
      `el esquema no puede tener una propiedad que empiece con "${prohibido}"`,
    );
  }
});

test("el esquema pide exactamente los campos de VisionResult", () => {
  const raiz = ESQUEMA_VISION as unknown as Record<string, unknown>;
  assert.deepEqual(raiz["required"], ["is_food", "items"]);
  assert.equal(raiz["additionalProperties"], false);

  const item = (
    (raiz["properties"] as Record<string, Record<string, Record<string, unknown>>>)["items"] as Record<
      string,
      Record<string, unknown>
    >
  )["items"] as unknown as Record<string, unknown>;
  assert.equal(item["additionalProperties"], false, "todo objeto tiene que declarar additionalProperties:false");
  assert.deepEqual(item["required"], ["food_en", "grams", "confidence"]);
  assert.deepEqual(Object.keys(item["properties"] as object), [
    "food_en",
    "grams",
    "confidence",
    "preparation",
    "components",
  ]);

  const preparation = (item["properties"] as Record<string, Record<string, unknown>>)["preparation"];
  assert.deepEqual(preparation?.["enum"], ["frito", "horneado", "horneado_masa", "plancha", "mezclado"]);
});

// ---------------------------------------------------------------------------
// La llamada
// ---------------------------------------------------------------------------

test("la llamada NO manda temperature, top_p ni thinking (Sonnet 5 los rechaza con 400)", async () => {
  const { cliente, llamadas } = espia([mensaje(UNA_MANZANA)]);
  await pedirVision(cliente, IMAGEN);

  const params = llamadas[0] as unknown as Record<string, unknown>;
  assert.equal("temperature" in params, false);
  assert.equal("top_p" in params, false);
  assert.equal("top_k" in params, false);
  assert.equal("thinking" in params, false);
  assert.equal(params["model"], MODELO_VISION);

  const formato = (params["output_config"] as Record<string, Record<string, unknown>>)["format"];
  assert.equal(formato?.["type"], "json_schema");
  assert.equal(formato?.["schema"], ESQUEMA_VISION);
});

test("la cabecera del workspace va SOLO si hay un workspace declarado", () => {
  // Medido el 31/08 contra la API real: una key identity-linked rechaza toda
  // llamada sin esta cabecera, con un 400, incluso `GET /v1/models`. Y una key
  // común no la necesita: mandarla vacía sería peor que no mandarla.
  assert.deepEqual(cabecerasDeVision("wrkspc_123"), { "anthropic-workspace-id": "wrkspc_123" });
  assert.deepEqual(cabecerasDeVision("  wrkspc_123  "), { "anthropic-workspace-id": "wrkspc_123" });
  assert.deepEqual(cabecerasDeVision(""), {});
  assert.deepEqual(cabecerasDeVision("   "), {});
});

test("la imagen viaja como bloque base64 con su media_type", async () => {
  const { cliente, llamadas } = espia([mensaje(UNA_MANZANA)]);
  await pedirVision(cliente, { image_base64: "ZZZZ", media_type: "image/png" });

  const contenido = (llamadas[0]?.messages[0]?.content ?? []) as unknown as Record<string, unknown>[];
  const imagen = contenido[0] as { type: string; source: Record<string, string> };
  assert.equal(imagen.type, "image");
  assert.equal(imagen.source["type"], "base64");
  assert.equal(imagen.source["media_type"], "image/png");
  assert.equal(imagen.source["data"], "ZZZZ");
});

test("el camino feliz devuelve el VisionResult y la meta medida", async () => {
  let reloj = 1_000;
  const { cliente } = espia([mensaje(UNA_MANZANA)]);
  const { vision, meta } = await pedirVision(cliente, IMAGEN, {
    ahora: () => (reloj += 1_500),
  });

  assert.equal(vision.is_food, true);
  assert.deepEqual(vision.items, [{ food_en: "apple, raw", grams: 150, confidence: 0.92 }]);
  assert.equal(meta.tokens_in, 1200);
  assert.equal(meta.tokens_out, 180);
  assert.equal(meta.intentos, 1);
  assert.equal(meta.latency_ms, 1500);
  assert.equal(meta.stop_reason, "end_turn");
});

// ---------------------------------------------------------------------------
// `stop_reason` ANTES que el contenido
// ---------------------------------------------------------------------------

test("un stop_reason inesperado no llega a leer el contenido", async () => {
  // El JSON está entero y sería parseable: lo que lo descalifica es el corte.
  // Si el orden fuera al revés, este caso pasaría por bueno y el reporte diría
  // que el plato tiene una sola manzana porque el resto no entró en max_tokens.
  for (const stop of ["max_tokens", "refusal", "pause_turn", "tool_use", null] as const) {
    const { cliente } = espia([mensaje(UNA_MANZANA, { stop_reason: stop })]);
    await assert.rejects(
      () => pedirVision(cliente, IMAGEN),
      (err: unknown) => {
        assert.ok(err instanceof ErrorDeAnalisis);
        assert.equal(err.codigo, "respuesta_ilegible");
        assert.match(err.detalle, /stop_reason/);
        return true;
      },
      `stop_reason=${String(stop)} tiene que rechazarse`,
    );
  }
});

test("un JSON que no parsea es respuesta_ilegible, no una excepción cruda", async () => {
  const { cliente } = espia([mensaje("{ esto no es json")]);
  await assert.rejects(
    () => pedirVision(cliente, IMAGEN),
    (err: unknown) => err instanceof ErrorDeAnalisis && err.codigo === "respuesta_ilegible",
  );
});

test("un JSON válido sin `is_food` booleano también es ilegible", async () => {
  const { cliente } = espia([mensaje(JSON.stringify({ items: [] }))]);
  await assert.rejects(
    () => pedirVision(cliente, IMAGEN),
    (err: unknown) => err instanceof ErrorDeAnalisis && err.codigo === "respuesta_ilegible",
  );
});

// ---------------------------------------------------------------------------
// Reintentos con backoff
// ---------------------------------------------------------------------------

test("clasificación de fallas: solo 429, 529 y 5xx se reintentan", () => {
  assert.equal(esTransitorio(errorHttp(429)), true);
  assert.equal(esTransitorio(errorHttp(529)), true);
  assert.equal(esTransitorio(errorHttp(500)), true);
  assert.equal(esTransitorio(errorHttp(503)), true);
  assert.equal(esTransitorio(errorHttp(400)), false);
  assert.equal(esTransitorio(errorHttp(401)), false);
  assert.equal(esTransitorio(errorHttp(404)), false);
  assert.equal(esTransitorio(new Error("cualquier cosa")), false);
});

test("un 529 se reintenta y la segunda vez sale bien, con backoff creciente", async () => {
  const esperas: number[] = [];
  const { cliente, llamadas } = espia([errorHttp(529), mensaje(UNA_MANZANA)]);

  const { meta } = await pedirVision(cliente, IMAGEN, {
    esperar: async (ms) => {
      esperas.push(ms);
    },
  });

  assert.equal(llamadas.length, 2);
  assert.equal(meta.intentos, 2);
  assert.deepEqual(esperas, [500]);
});

test("tres fallas transitorias agotan los reintentos y dan modelo_no_disponible", async () => {
  const esperas: number[] = [];
  const { cliente, llamadas } = espia([errorHttp(429), errorHttp(500), errorHttp(529)]);

  await assert.rejects(
    () =>
      pedirVision(cliente, IMAGEN, {
        esperar: async (ms) => {
          esperas.push(ms);
        },
      }),
    (err: unknown) => err instanceof ErrorDeAnalisis && err.codigo === "modelo_no_disponible",
  );

  assert.equal(llamadas.length, MAX_REINTENTOS + 1, "tres intentos en total");
  assert.deepEqual(esperas, [500, 1000], "el backoff duplica; no se espera después del último");
});

test("un 400 no se reintenta: se falla en el primer intento", async () => {
  const { cliente, llamadas } = espia([errorHttp(400)]);
  await assert.rejects(
    () => pedirVision(cliente, IMAGEN, { esperar: async () => {} }),
    (err: unknown) => err instanceof ErrorDeAnalisis && err.codigo === "modelo_no_disponible",
  );
  assert.equal(llamadas.length, 1, "un pedido mal formado no mejora repitiéndolo");
});

// ---------------------------------------------------------------------------
// Saneo: lo que el esquema NO puede exigir
// ---------------------------------------------------------------------------

test("los rangos que el esquema no puede exigir los exige el código", () => {
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [
        { food_en: "rice, white, cooked", grams: 200, confidence: 5 },
        { food_en: "olive oil", grams: -3, confidence: -1 },
        { food_en: "chicken", grams: "mucho", confidence: 0.5 },
      ],
    }),
  );

  assert.equal(vision.items[0]?.confidence, 1, "una confianza de 5 se recorta a 1");
  assert.equal(vision.items[1]?.grams, 0, "gramos negativos se vuelven 0");
  assert.equal(vision.items[1]?.confidence, 0);
  assert.equal(vision.items[2]?.grams, 0, "gramos que no son número se vuelven 0");
});

test("un item sin nombre se descarta: nombrar nada no es un alimento", () => {
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [{ food_en: "   ", grams: 10, confidence: 1 }, { food_en: "bread", grams: 30, confidence: 0.8 }],
    }),
  );
  assert.equal(vision.items.length, 1);
  assert.equal(vision.items[0]?.food_en, "bread");
});

test("una `preparation` fuera de la lista cerrada se ignora", () => {
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [
        { food_en: "potato", grams: 100, confidence: 1, preparation: "al vapor" },
        { food_en: "fish", grams: 100, confidence: 1, preparation: "plancha" },
      ],
    }),
  );
  assert.equal(vision.items[0]?.preparation, undefined);
  assert.equal(vision.items[1]?.preparation, "plancha");
});

test("`components` se limpia y desaparece si queda vacío", () => {
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [
        { food_en: "stew", grams: 300, confidence: 0.6, components: [{ food_en: "", grams: 10 }] },
        {
          food_en: "salad",
          grams: 200,
          confidence: 0.7,
          components: [{ food_en: "lettuce", grams: 80 }, { food_en: "tomato", grams: 120 }],
        },
      ],
    }),
  );
  assert.equal(vision.items[0]?.components, undefined);
  assert.equal(vision.items[1]?.components?.length, 2);
});

test("un escaneo desbocado se corta en MAX_ITEMS y sigue siendo un reporte", () => {
  // El motor no limita la cantidad de items a propósito: el contrato de negocio
  // es de esta card. Un plato real no tiene 200 ingredientes.
  const muchos = Array.from({ length: MAX_ITEMS + 25 }, (_unused, i) => ({
    food_en: `alimento ${i}`,
    grams: 10,
    confidence: 0.5,
  }));
  const vision = interpretarVision(JSON.stringify({ is_food: true, items: muchos }));

  assert.equal(vision.items.length, MAX_ITEMS);
  assert.equal(vision.items[0]?.food_en, "alimento 0", "se cortan los últimos, no los primeros");
});

test("`is_food: false` vacía los items aunque el modelo mande alguno", () => {
  const vision = interpretarVision(
    JSON.stringify({ is_food: false, items: [{ food_en: "apple", grams: 100, confidence: 1 }] }),
  );
  assert.deepEqual(vision, { is_food: false, items: [] });
});
