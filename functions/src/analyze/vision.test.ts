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

import { COOKING_TRANSFORMS } from "../kb/cooking.transforms";
import { FAMILIAS, IDS_FAMILIA_SUBFAMILIA } from "../kb/familias";
import { ErrorDeAnalisis } from "./errores";
import {
  cabecerasDeVision,
  ESQUEMA_VISION,
  LISTA_DE_SUBFAMILIAS,
  MAX_ITEMS,
  MAX_REINTENTOS,
  MODELO_VISION,
  PREPARACIONES,
  PROMPT_VISION,
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
  // CARD 2.6: `food_es` es nuevo y es REQUERIDO. El catálogo tiene 1.768
  // términos curados en español y hasta esta card el prompt le prohibía al
  // modelo usarlos; pedirlo como opcional habría sido volver a dejarlo al azar.
  // CARD 5.2: `familia_subfamilia` y `components` también son REQUERIDOS. El
  // primero porque un nombre libre ya lo tenemos y no alcanzó (la pizza de
  // producción); el segundo porque siendo opcional disparó cero veces en 204
  // ítems. `preparation` y `etiqueta_del_envase` siguen siendo opcionales:
  // "no lo vi" se dice omitiendo el campo, no mandando null.
  assert.deepEqual(item["required"], [
    "food_en",
    "food_es",
    "grams",
    "confidence",
    "familia_subfamilia",
    "components",
  ]);
  assert.deepEqual(Object.keys(item["properties"] as object), [
    "food_en",
    "food_es",
    "familia_subfamilia",
    "grams",
    "confidence",
    "preparation",
    "components",
    "etiqueta_del_envase",
  ]);

  const componentes = (item["properties"] as Record<string, Record<string, unknown>>)["components"];
  const componente = componentes?.["items"] as Record<string, unknown>;
  assert.equal(componente["additionalProperties"], false);
  assert.deepEqual(componente["required"], ["food_en", "food_es", "grams"]);
  assert.deepEqual(Object.keys(componente["properties"] as object), [
    "food_en",
    "food_es",
    "grams",
    "familia_subfamilia",
  ]);
});

// ---------------------------------------------------------------------------
// CARD 5.2 — el vocabulario del esquema sale del código generado, no de acá
// ---------------------------------------------------------------------------

test("el enum de `familia_subfamilia` ES la taxonomía, byte por byte y en su orden", () => {
  // El motor de la 5.3 parte el valor por la barra y busca la subfamilia en
  // `FAMILIAS`. Si el esquema y la taxonomía se separaran —alguien agrega una
  // subfamilia al JSON de curación y no regenera, o al revés— el modelo podría
  // emitir un id que el motor no conoce, y eso llega como "no encontré nada" en
  // el reporte de un usuario. El candado es la IGUALDAD, no la inclusión.
  const item = (
    (ESQUEMA_VISION as unknown as Record<string, Record<string, Record<string, unknown>>>)["properties"]?.[
      "items"
    ] as Record<string, Record<string, unknown>>
  )["items"] as unknown as Record<string, Record<string, Record<string, unknown>>>;

  const enItem = item["properties"]?.["familia_subfamilia"]?.["enum"] as unknown as string[];
  assert.equal(enItem.length, IDS_FAMILIA_SUBFAMILIA.length, "mismo largo que la taxonomía");
  assert.equal(enItem.length, 191, "191 subfamilias, las del Bloque 0");
  assert.deepEqual(enItem, IDS_FAMILIA_SUBFAMILIA, "mismos valores y mismo orden");

  const componente = item["properties"]?.["components"]?.["items"] as unknown as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  const enComponente = componente["properties"]?.["familia_subfamilia"]?.["enum"] as unknown as string[];
  assert.deepEqual(enComponente, IDS_FAMILIA_SUBFAMILIA, "el ingrediente elige de la MISMA lista");
});

test("los métodos de `preparation` SON las claves de la tabla de cocción", () => {
  // Los cinco de antes estaban copiados a mano y por eso faltaban tres: `crudo`,
  // `hervido` y `cocido_cebolla`. Una lenteja hervida se componía con
  // rendimiento 1,000 en vez de 1,113 — el agua que gana al hervirse no existía.
  // Que la lista salga de la tabla es lo que impide que se vuelvan a separar.
  assert.deepEqual(PREPARACIONES, Object.keys(COOKING_TRANSFORMS));
  assert.equal(PREPARACIONES.length, 8);

  const item = (
    (ESQUEMA_VISION as unknown as Record<string, Record<string, Record<string, unknown>>>)["properties"]?.[
      "items"
    ] as Record<string, Record<string, unknown>>
  )["items"] as unknown as Record<string, Record<string, Record<string, unknown>>>;
  assert.deepEqual(item["properties"]?.["preparation"]?.["enum"], Object.keys(COOKING_TRANSFORMS));
});

test("el prompt explica la taxonomía entera, y también sale del código generado", () => {
  // El enum le dice al modelo qué ids puede escribir; la lista del prompt le dice
  // qué significa cada uno. Si la lista se escribiera a mano habría DOS
  // vocabularios y se separarían en silencio.
  for (const familia of FAMILIAS) {
    for (const sub of familia.subfamilias) {
      const id = `${familia.id}/${sub.id}`;
      assert.ok(LISTA_DE_SUBFAMILIAS.includes(`${id} = ${sub.nombre_es} | ${sub.nombre_en}`), `falta ${id}`);
    }
  }
  assert.ok(PROMPT_VISION.includes(LISTA_DE_SUBFAMILIAS), "la lista viaja dentro del prompt");
  // Las 11 en modo `componer` van marcadas: son las que NO se responden con una
  // ficha promedio (el plato de salmón por identidad da +76 %).
  const marcadas = LISTA_DE_SUBFAMILIAS.split("\n").filter((l) => l.includes("[descomponer]"));
  const componer = FAMILIAS.flatMap((f) => f.subfamilias).filter((s) => s.modo === "componer");
  assert.equal(marcadas.length, componer.length);
  assert.equal(marcadas.length, 11);
});

test("el prompt manda descomponer SIEMPRE y ya no solo si el plato no tiene nombre", () => {
  // La instrucción vieja —"components solo cuando el plato entero no tiene un
  // nombre genérico obvio"— es la que hizo que la composición disparara CERO
  // veces en los 204 ítems del golden. Si alguien la vuelve a escribir, suena.
  assert.equal(/`components` solo cuando/.test(PROMPT_VISION), false);
  assert.match(PROMPT_VISION, /SIEMPRE que el plato tenga más de un ingrediente/);
  assert.match(PROMPT_VISION, /etiqueta_del_envase/);
  assert.match(PROMPT_VISION, /familia_subfamilia/);
  // La regla de desempate del Bloque 0: la más específica; ante la duda, la más
  // genérica de la MISMA familia (equivocar la familia es el error caro).
  assert.match(PROMPT_VISION, /MÁS ESPECÍFICA/);
  assert.match(PROMPT_VISION, /MÁS GENÉRICA DE LA MISMA FAMILIA/);
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
  // `components: []` está siempre desde la 5.2: el motor mira el largo, no si el
  // campo existe, y el expediente muestra "miró y no había nada que descomponer".
  assert.deepEqual(vision.items, [{ food_en: "apple, raw", grams: 150, confidence: 0.92, components: [] }]);
  assert.equal(meta.tokens_in, 1200);
  assert.equal(meta.tokens_out, 180);
  assert.equal(meta.intentos, 1);
  assert.equal(meta.latency_ms, 1500);
  assert.equal(meta.stop_reason, "end_turn");
  // Sin caché en el doble (`usage` los trae en null): la meta dice cero, no NaN.
  assert.equal(meta.tokens_cache_write, 0);
  assert.equal(meta.tokens_cache_read, 0);
});

test("el prompt de sistema viaja CACHEADO: es el mismo en todos los escaneos", async () => {
  // Desde la 5.2 el sistema lleva las 191 subfamilias adentro (~4.000 tokens) y
  // no cambia entre llamadas: lo único que varía es la imagen, que va después en
  // el orden de render. Sin el marcador se pagaría el prompt entero en cada foto.
  const { cliente, llamadas } = espia([
    mensaje(UNA_MANZANA, {
      usage: {
        input_tokens: 30,
        output_tokens: 120,
        cache_creation_input_tokens: 4000,
        cache_read_input_tokens: 0,
      },
    } as unknown as Partial<Anthropic.Message>),
  ]);
  const { meta } = await pedirVision(cliente, IMAGEN);

  const sistema = llamadas[0]?.system as unknown as Record<string, unknown>[];
  assert.ok(Array.isArray(sistema), "el sistema va como bloques: un string suelto no admite cache_control");
  assert.equal(sistema[0]?.["type"], "text");
  assert.equal(sistema[0]?.["text"], PROMPT_VISION);
  assert.deepEqual(sistema[0]?.["cache_control"], { type: "ephemeral" });

  assert.equal(meta.tokens_cache_write, 4000, "la primera llamada ESCRIBE el caché");
  assert.equal(meta.tokens_cache_read, 0);
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

test("un item sin NINGÚN nombre se descarta: nombrar nada no es un alimento", () => {
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [{ food_en: "   ", grams: 10, confidence: 1 }, { food_en: "bread", grams: 30, confidence: 0.8 }],
    }),
  );
  assert.equal(vision.items.length, 1);
  assert.equal(vision.items[0]?.food_en, "bread");
});

// ---------------------------------------------------------------------------
// CARD 2.6 — la visión nombra en los dos idiomas
// ---------------------------------------------------------------------------

test("`food_es` llega al motor tal cual, y sin él nada cambia", () => {
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [
        { food_en: "rice, cooked, seafood paella style", food_es: "paella", grams: 350, confidence: 0.75 },
        { food_en: "croissant", grams: 70, confidence: 0.95 },
        { food_en: "stew", food_es: "  ", grams: 300, confidence: 0.6 },
      ],
    }),
  );
  assert.equal(vision.items[0]?.food_es, "paella");
  // Sin el campo, o con el campo en blanco, el item NO lo lleva: el motor
  // distingue "no lo dijo" de "dijo una cadena vacía" sin tener que mirar dentro.
  assert.equal("food_es" in (vision.items[1] ?? {}), false);
  assert.equal("food_es" in (vision.items[2] ?? {}), false);
});

test("un item que SOLO tiene nombre en español no se tira a la basura", () => {
  // El esquema pide los dos nombres, pero un plato que en inglés no tiene nombre
  // —y el modelo deja el campo vacío— sigue siendo un alimento que el catálogo
  // español sabe encontrar. Descartarlo sería perder comida por una formalidad.
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [{ food_en: "", food_es: "salmorejo", grams: 250, confidence: 0.8 }],
    }),
  );
  assert.equal(vision.items.length, 1);
  assert.equal(vision.items[0]?.food_es, "salmorejo");
  assert.equal(vision.items[0]?.food_en, "");
});

test("los ingredientes también viajan con sus dos nombres", () => {
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [
        {
          food_en: "stew",
          food_es: "guiso",
          grams: 300,
          confidence: 0.6,
          components: [
            { food_en: "chickpeas", food_es: "garbanzos", grams: 120 },
            { food_en: "chorizo", grams: 40 },
          ],
        },
      ],
    }),
  );
  assert.deepEqual(vision.items[0]?.components, [
    { food_en: "chickpeas", food_es: "garbanzos", grams: 120 },
    { food_en: "chorizo", grams: 40 },
  ]);
});

test("el prompt le PIDE el español y ya no le prohíbe los términos del catálogo", () => {
  // La contradicción que midió el test de los 10 platos: el prompt viejo decía
  // textualmente que prefiriera "beef steak, grilled" antes que "bife de
  // chorizo", y el catálogo tiene 1.768 términos curados en español que nunca
  // recibían una consulta. Si alguien vuelve a poner esa instrucción, esto suena.
  assert.match(PROMPT_VISION, /food_es/);
  assert.match(PROMPT_VISION, /espa/i);
  assert.equal(/antes que el nombre de un\s+plato regional/.test(PROMPT_VISION), false);
});

test("una `preparation` fuera de la lista cerrada se ignora, y los ocho pasan", () => {
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [
        { food_en: "potato", grams: 100, confidence: 1, preparation: "al vapor" },
        { food_en: "fish", grams: 100, confidence: 1, preparation: "plancha" },
        // Los tres que la Fase 5 sumó: antes se caían acá en silencio y el plato
        // se componía con el rendimiento equivocado.
        ...PREPARACIONES.map((metodo) => ({ food_en: metodo, grams: 100, confidence: 1, preparation: metodo })),
      ],
    }),
  );
  assert.equal(vision.items[0]?.preparation, undefined);
  assert.equal(vision.items[1]?.preparation, "plancha");
  for (let i = 0; i < PREPARACIONES.length; i += 1) {
    assert.equal(vision.items[i + 2]?.preparation, PREPARACIONES[i]);
  }
});

test("`components` se limpia y, si no queda nada, queda en array VACÍO", () => {
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
        { food_en: "apple", grams: 150, confidence: 1 },
      ],
    }),
  );
  // Vacío, no ausente: un ingrediente sin nombre se descarta, pero el hecho de
  // que el modelo miró y no quedó nada sí se conserva.
  assert.deepEqual(vision.items[0]?.components, []);
  assert.equal(vision.items[1]?.components?.length, 2);
  // Y si el modelo omitió el campo (una salida vieja), el array aparece igual:
  // el motor pregunta por el largo, nunca por la existencia.
  assert.deepEqual(vision.items[2]?.components, []);
});

// ---------------------------------------------------------------------------
// CARD 5.2 — el saneo de los campos nuevos
// ---------------------------------------------------------------------------

test("una `familia_subfamilia` fuera de la lista se descarta SOLA: el item se queda", () => {
  // El item conserva sus dos nombres, que son el camino preciso. Tirarlo entero
  // por un respaldo mal escrito sería perder comida por una formalidad.
  const valida = IDS_FAMILIA_SUBFAMILIA[0] as string;
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [
        { food_en: "pizza", grams: 300, confidence: 0.9, familia_subfamilia: "pizza/con-carne" },
        { food_en: "bread", grams: 60, confidence: 0.9, familia_subfamilia: "pizza" },
        { food_en: "cheese", grams: 30, confidence: 0.9, familia_subfamilia: "inventada/no-existe" },
        { food_en: "rice", grams: 90, confidence: 0.9, familia_subfamilia: `  ${valida}  ` },
        { food_en: "olive oil", grams: 10, confidence: 0.9, familia_subfamilia: 42 },
      ],
    }),
  );
  assert.equal(vision.items.length, 5, "ningún item se pierde por la subfamilia");
  assert.equal(vision.items[0]?.familia_subfamilia, "pizza/con-carne");
  // "pizza" a secas es una FAMILIA, no un par: el motor espera el id compuesto.
  assert.equal("familia_subfamilia" in (vision.items[1] ?? {}), false);
  assert.equal("familia_subfamilia" in (vision.items[2] ?? {}), false);
  assert.equal(vision.items[3]?.familia_subfamilia, valida, "se recortan los espacios");
  assert.equal("familia_subfamilia" in (vision.items[4] ?? {}), false);
});

test("el ingrediente también trae su subfamilia, y se sanea con la misma vara", () => {
  // Es el caso que rompió el escaneo de producción: `pizza dough, baked` no
  // existe en el catálogo NI en USDA. Con la subfamilia declarada, la
  // composición tiene a dónde caer en vez de dejar el plato sin número.
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [
        {
          food_en: "pizza with ham and mushrooms",
          food_es: "pizza de jamón y champiñones",
          grams: 320,
          confidence: 0.9,
          familia_subfamilia: "pizza/con-carne",
          components: [
            { food_en: "pizza dough, baked", food_es: "masa de pizza", grams: 150, familia_subfamilia: "pizza/base" },
            { food_en: "ham, sliced", food_es: "jamón", grams: 40, familia_subfamilia: "embutido/jamon" },
            { food_en: "mushrooms", food_es: "champiñones", grams: 30, familia_subfamilia: "no/existe" },
          ],
        },
      ],
    }),
  );
  const componentes = vision.items[0]?.components ?? [];
  assert.equal(componentes.length, 3);
  // "pizza/base" no está en la taxonomía (la subfamilia de la masa se llama otra
  // cosa): se descarta el campo, el ingrediente sigue con sus dos nombres.
  assert.equal("familia_subfamilia" in (componentes[0] ?? {}), false);
  assert.equal(componentes[1]?.familia_subfamilia, "embutido/jamon");
  assert.equal("familia_subfamilia" in (componentes[2] ?? {}), false);
});

test("`etiqueta_del_envase` llega recortada, y en blanco no llega", () => {
  // Un envase con etiqueta legible ES comida y la etiqueta es el dato más
  // preciso de la foto: hasta la 5.2 el esquema decía lo contrario y un pan de
  // centeno en su paquete salió `is_food: false`.
  const vision = interpretarVision(
    JSON.stringify({
      is_food: true,
      items: [
        {
          food_en: "rye bread",
          food_es: "pan de centeno",
          grams: 500,
          confidence: 0.85,
          etiqueta_del_envase: "  Pan de centeno integral 500 g  ",
        },
        { food_en: "apple", grams: 150, confidence: 1, etiqueta_del_envase: "   " },
        { food_en: "banana", grams: 120, confidence: 1 },
      ],
    }),
  );
  assert.equal(vision.items[0]?.etiqueta_del_envase, "Pan de centeno integral 500 g");
  assert.equal("etiqueta_del_envase" in (vision.items[1] ?? {}), false);
  assert.equal("etiqueta_del_envase" in (vision.items[2] ?? {}), false);
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
