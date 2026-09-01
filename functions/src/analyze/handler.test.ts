/**
 * El endpoint entero, sin nube: modelo falso, catálogo real, persistencia espiada.
 *
 * El catálogo que usan estos tests es el REAL (`kb/build/foods.canonical.json`,
 * el mismo que se siembra), no fichas inventadas: un test del endpoint que
 * matchea contra un catálogo de juguete prueba el andamiaje y no el producto.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";

import { indiceReal } from "../engine/testing";
import type { AppConfig } from "../config";
import { DUEÑO_PROVISORIO, MAX_BASE64_CHARS, manejarAnalyze, validarEntrada, type CuerpoDeAnalisis, type DatosAPersistir, type Dependencias } from "./handler";
import type { CuerpoDeError } from "./errores";
import { ErrorDeAnalisis } from "./errores";
import { MODELO_VISION, type ClienteDeVision } from "./vision";

// ---------------------------------------------------------------------------
// Andamiaje
// ---------------------------------------------------------------------------

function mensaje(texto: string, stop: Anthropic.Message["stop_reason"] = "end_turn"): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODELO_VISION,
    content: [{ type: "text", text: texto, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: 1300,
      output_tokens: 240,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
    container: null,
    context_management: null,
  } as unknown as Anthropic.Message;
}

function clienteQueDice(respuesta: Anthropic.Message | Error): ClienteDeVision {
  return {
    messages: {
      create: async () => {
        if (respuesta instanceof Error) throw respuesta;
        return respuesta;
      },
    },
  };
}

const CONFIG_VACIA: AppConfig = {
  kb_version: null,
  max_scans_per_day: 3,
  copy: {},
  recommendation_rules: null,
};

interface Andamio {
  deps: Dependencias;
  persistidos: DatosAPersistir[];
}

function andamio(
  cliente: ClienteDeVision,
  opciones: { copy?: Record<string, string>; persistirFalla?: boolean } = {},
): Andamio {
  const persistidos: DatosAPersistir[] = [];
  let reloj = 0;
  return {
    persistidos,
    deps: {
      cliente,
      indice: async () => indiceReal(),
      config: async () => ({ config: { ...CONFIG_VACIA, copy: opciones.copy ?? {} } }),
      persistir: async (datos) => {
        if (opciones.persistirFalla === true) throw new Error("Firestore no responde");
        persistidos.push(datos);
      },
      nuevoScanId: () => "scan-de-prueba",
      ahora: () => (reloj += 100),
      opcionesDeVision: { esperar: async () => {} },
    },
  };
}

/** Una imagen base64 cualquiera: acá nunca se decodifica, se valida la forma. */
const IMAGEN_OK = { image_base64: "AAAABBBB", media_type: "image/jpeg" };

// ---------------------------------------------------------------------------
// Validación del pedido
// ---------------------------------------------------------------------------

test("validarEntrada acepta el cuerpo mínimo y pone el dueño provisorio", () => {
  const entrada = validarEntrada(IMAGEN_OK);
  assert.equal(entrada.owner_id, DUEÑO_PROVISORIO);
  assert.equal(entrada.image_base64, "AAAABBBB");
});

test("validarEntrada acepta el prefijo `data:` que devuelve el navegador", () => {
  const entrada = validarEntrada({
    image_base64: "data:image/jpeg;base64,AAAABBBB",
    media_type: "image/jpeg",
  });
  assert.equal(entrada.image_base64, "AAAABBBB", "el prefijo se saca, no se manda al modelo");
});

test("validarEntrada rechaza lo que no puede analizar", () => {
  const casos: [unknown, string][] = [
    [null, "cuerpo_invalido"],
    ["una cadena", "cuerpo_invalido"],
    [{ media_type: "image/jpeg" }, "cuerpo_invalido"],
    [{ image_base64: "AAAA" }, "cuerpo_invalido"],
    [{ image_base64: "AAAA", media_type: "image/gif" }, "cuerpo_invalido"],
    [{ ...IMAGEN_OK, owner_id: "  " }, "cuerpo_invalido"],
    [{ image_base64: "AAA!", media_type: "image/png" }, "imagen_invalida"],
    [{ image_base64: "AAAAA", media_type: "image/png" }, "imagen_invalida"],
    [{ image_base64: "A".repeat(MAX_BASE64_CHARS + 4), media_type: "image/png" }, "imagen_muy_grande"],
  ];
  for (const [cuerpo, codigo] of casos) {
    assert.throws(
      () => validarEntrada(cuerpo),
      (err: unknown) => err instanceof ErrorDeAnalisis && err.codigo === codigo,
      `${JSON.stringify(cuerpo)?.slice(0, 60)} tenía que dar ${codigo}`,
    );
  }
});

// ---------------------------------------------------------------------------
// El circuito completo
// ---------------------------------------------------------------------------

test("foto → modelo → motor → persistencia: el circuito entero", async () => {
  const { deps, persistidos } = andamio(
    clienteQueDice(
      mensaje(
        JSON.stringify({
          is_food: true,
          items: [
            { food_en: "Apple, raw", grams: 150, confidence: 0.9 },
            { food_en: "Rice, white, cooked", grams: 200, confidence: 0.8 },
          ],
        }),
      ),
    ),
  );

  const { status, body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const cuerpo = body as CuerpoDeAnalisis;

  assert.equal(status, 200);
  assert.equal(cuerpo.is_food, true);
  assert.equal(cuerpo.scan_id, "scan-de-prueba");
  assert.equal(cuerpo.persisted, true);
  assert.equal(cuerpo.items.length, 2);

  // Los números salen del catálogo, no del modelo: cada item trae su ficha.
  for (const item of cuerpo.items) {
    assert.notEqual(item.food_id, null, `${item.termino_en} tenía que matchear contra el catálogo real`);
    assert.notEqual(item.nutrients, null);
    assert.equal(typeof item.source_ref, "string");
  }
  assert.ok((cuerpo.totals?.nutrients.kcal ?? 0) > 0, "el plato tiene calorías y salen de la suma");

  // La meta que pide el contrato, entera.
  assert.equal(cuerpo.meta.model, MODELO_VISION);
  assert.equal(cuerpo.meta.tokens_in, 1300);
  assert.equal(cuerpo.meta.tokens_out, 240);
  assert.equal(typeof cuerpo.meta.kb_version, "string");
  assert.ok(cuerpo.meta.latency_ms > 0);

  // Lo que se guarda es el resultado del motor, sin reformatear.
  assert.equal(persistidos.length, 1);
  assert.equal(persistidos[0]?.scan_id, "scan-de-prueba");
  assert.equal(persistidos[0]?.owner_id, DUEÑO_PROVISORIO);
  assert.deepEqual(persistidos[0]?.resultado.items, cuerpo.items);
});

test("`items` y `totals` son los del motor, no una copia parecida", async () => {
  // El front de la card 2.3 se construye contra EngineResult: si alguien
  // "mejora" la forma de la respuesta, este test lo dice antes que el front.
  const { deps } = andamio(
    clienteQueDice(
      mensaje(JSON.stringify({ is_food: true, items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9 }] })),
    ),
  );
  const { body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const item = (body as CuerpoDeAnalisis).items[0];

  assert.deepEqual(Object.keys(item ?? {}).sort(), [
    "confidence",
    "confidence_match",
    "confidence_vision",
    "food_id",
    "grams",
    // DT-37 (card 6.5): la ficha NOMBRA lo que la visión describió. Viaja al
    // front porque la compuerta del total se apoya en ella y el reporte tiene
    // que poder explicar por qué un plato de confianza baja publicó su total.
    "identidad_respaldada",
    "match",
    "motivo",
    "name_en",
    "name_es",
    "nutrients",
    "per_100g",
    "source_ref",
    "termino_en",
    // DT-25 (WS07): el español que dijo la visión. Está en ESTA lista —o sea,
    // presente aunque el modelo no haya dicho nada en español, como en este
    // mismo caso, donde vale ""— porque una clave ausente sería ambigua entre
    // "la visión no lo dijo" y "este scan es anterior a la DT-25", y el replay
    // del golden set necesita distinguirlas para saber si puede juzgar el ítem.
    "termino_es",
  ]);
});

test("`termino_es` viaja al expediente con lo que dijo la visión (DT-25)", async () => {
  // El motor matchea con los DOS nombres desde la card 2.6 y hasta la DT-25 el
  // expediente guardaba solo el inglés: un scan no registraba la mitad de lo que
  // decidió su propio match. Acá se mira el caso que más importa —el que ENTRA
  // POR EL ESPAÑOL— porque es justamente el que el replay no podía re-jugar.
  const { deps, persistidos } = andamio(
    clienteQueDice(
      mensaje(
        JSON.stringify({
          is_food: true,
          items: [{ food_en: "spanish omelette", food_es: "Tortilla de patatas", grams: 200, confidence: 0.9 }],
        }),
      ),
    ),
  );
  const { body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const item = (body as CuerpoDeAnalisis).items[0];

  assert.equal(item?.termino_en, "spanish omelette");
  assert.equal(item?.termino_es, "Tortilla de patatas", "el español de la visión, tal cual lo dijo");
  assert.match(item?.motivo ?? "", /en español/, "y este ítem entró por el español: es el caso que el replay no podía juzgar");
  // Y lo mismo queda en el expediente, que es lo que la deuda pedía: la
  // persistencia guarda los ítems del motor sin reformatear.
  assert.equal(persistidos[0]?.resultado.items[0]?.termino_es, "Tortilla de patatas");
});

test("sin `food_es` el término español es una cadena vacía, no una clave ausente (DT-25)", async () => {
  // La otra mitad del contrato. Una salida de la visión sin español es normal
  // —el campo es opcional desde la card 2.6— y el expediente tiene que decir
  // "no dijo nada", que es distinto de "no se preguntó".
  const { deps, persistidos } = andamio(
    clienteQueDice(
      mensaje(JSON.stringify({ is_food: true, items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9 }] })),
    ),
  );
  const { body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const item = (body as CuerpoDeAnalisis).items[0];

  assert.equal(item?.termino_es, "");
  assert.ok("termino_es" in (item ?? {}), "la clave existe igual: su ausencia significa otra cosa");
  assert.equal(persistidos[0]?.resultado.items[0]?.termino_es, "");
});

test("un alimento sin ficha también guarda su `termino_es` (DT-25)", async () => {
  // El camino 3 del motor (`no_catalogado`) es el que MÁS necesita el término
  // español: es el que alimenta la cola de curación, y curar un término sin
  // saber cómo lo nombró la visión en español es curar a ciegas.
  const { deps, persistidos } = andamio(
    clienteQueDice(
      mensaje(
        JSON.stringify({
          is_food: true,
          items: [{ food_en: "zzqx invented food", food_es: "comida zzqx inventada", grams: 100, confidence: 0.9 }],
        }),
      ),
    ),
  );
  const { body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const item = (body as CuerpoDeAnalisis).items[0];

  assert.equal(item?.match, "no_catalogado");
  assert.equal(item?.termino_es, "comida zzqx inventada");
  assert.equal(persistidos[0]?.resultado.items[0]?.termino_es, "comida zzqx inventada");
});

test("un alimento que el catálogo no tiene entra a la cola de curación", async () => {
  const { deps, persistidos } = andamio(
    clienteQueDice(
      mensaje(
        JSON.stringify({
          is_food: true,
          items: [{ food_en: "zzqx invented food", grams: 100, confidence: 0.9 }],
        }),
      ),
    ),
  );

  const { body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const cuerpo = body as CuerpoDeAnalisis;

  assert.equal(cuerpo.items[0]?.match, "no_catalogado");
  assert.equal(cuerpo.items[0]?.nutrients, null, "sin ficha no hay números: no se estima");
  assert.equal(persistidos[0]?.resultado.curation_candidates.length, 1);
  assert.equal(persistidos[0]?.resultado.curation_candidates[0]?.motivo, "sin_match");
});

// ---------------------------------------------------------------------------
// La foto que no es comida
// ---------------------------------------------------------------------------

test("`is_food: false` es un 200 con copy simpático, y NO se persiste nada", async () => {
  const { deps, persistidos } = andamio(
    clienteQueDice(mensaje(JSON.stringify({ is_food: false, items: [] }))),
    { copy: { error_not_food: "Eso es un gato, no un almuerzo." } },
  );

  const { status, body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const cuerpo = body as CuerpoDeAnalisis;

  assert.equal(status, 200);
  assert.equal(cuerpo.is_food, false);
  assert.deepEqual(cuerpo.items, []);
  assert.equal(cuerpo.totals, null);
  assert.equal(cuerpo.scan_id, null, "no hay documento que nombrar");
  assert.equal(cuerpo.message_es, "Eso es un gato, no un almuerzo.");
  assert.equal(persistidos.length, 0, "no se cobra ni se guarda el análisis de una foto que no es comida");
});

test("sin copy publicado, el texto de `not_food` sale del arranque en frío", async () => {
  const { deps } = andamio(clienteQueDice(mensaje(JSON.stringify({ is_food: false, items: [] }))));
  const { body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  assert.match((body as CuerpoDeAnalisis).message_es ?? "", /no parece un plato/i);
});

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

test("un GET es 405 y ni siquiera llama al modelo", async () => {
  let llamo = false;
  const { deps } = andamio({
    messages: {
      create: async () => {
        llamo = true;
        throw new Error("no tendría que haberse llamado");
      },
    },
  });
  const { status, body } = await manejarAnalyze({ method: "GET", body: {} }, deps);
  assert.equal(status, 405);
  assert.equal((body as CuerpoDeError).error.code, "metodo_no_permitido");
  assert.equal(llamo, false);
});

test("el mensaje de error sale de `config/app.copy` cuando la clave existe", async () => {
  const { deps } = andamio(clienteQueDice(mensaje("{roto", "end_turn")), {
    copy: { error_unreadable: "No pude leer el plato. Probá con más luz." },
  });
  const { status, body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const error = (body as CuerpoDeError).error;

  assert.equal(status, 502);
  assert.equal(error.code, "respuesta_ilegible");
  assert.equal(error.message_es, "No pude leer el plato. Probá con más luz.");
  assert.equal(error.copy_source, "config");
});

test("sin la clave publicada, el error usa su texto en frío y lo declara", async () => {
  const { deps } = andamio(clienteQueDice(mensaje("{roto", "end_turn")));
  const { body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const error = (body as CuerpoDeError).error;

  assert.equal(error.copy_source, "cold-start-default");
  assert.match(error.message_es, /No pude reconocer el plato/);
});

test("un `stop_reason` inesperado llega al cliente como 502, no como 500", async () => {
  const { deps } = andamio(
    clienteQueDice(mensaje(JSON.stringify({ is_food: true, items: [] }), "max_tokens")),
  );
  const { status, body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  assert.equal(status, 502);
  assert.equal((body as CuerpoDeError).error.code, "respuesta_ilegible");
});

test("si el modelo no responde, es 503 y no un 500 anónimo", async () => {
  const caida = new Error("HTTP 529");
  (caida as unknown as { status: number }).status = 529;
  const { deps } = andamio(clienteQueDice(caida));
  const { status, body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  assert.equal(status, 503);
  assert.equal((body as CuerpoDeError).error.code, "modelo_no_disponible");
});

test("si el catálogo no está, el análisis no arranca", async () => {
  const { deps } = andamio(clienteQueDice(mensaje(JSON.stringify({ is_food: true, items: [] }))));
  deps.indice = async () => {
    throw new ErrorDeAnalisis("catalogo_no_disponible", "foods vacía");
  };
  const { status, body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  assert.equal(status, 503);
  assert.equal((body as CuerpoDeError).error.code, "catalogo_no_disponible");
});

test("si la persistencia falla, el análisis se devuelve igual pero lo declara", async () => {
  // El análisis ya se pagó: negárselo al usuario por un problema de escritura
  // sería cobrarle dos veces. Lo que no se puede es mentirle diciendo que quedó
  // guardado.
  const { deps } = andamio(
    clienteQueDice(
      mensaje(JSON.stringify({ is_food: true, items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9 }] })),
    ),
    { persistirFalla: true },
  );
  const { status, body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const cuerpo = body as CuerpoDeAnalisis;

  assert.equal(status, 200);
  assert.equal(cuerpo.persisted, false);
  assert.equal(cuerpo.items.length, 1);
});

test("un item con ficha pero SIN gramos usables viaja y se persiste igual", async () => {
  // El motor final puede devolver `food_id` con `nutrients: null` a la vez
  // (`grams_no_estimados`): se sabe QUÉ es y no se cuantifica con un cero
  // inventado. El endpoint no puede asumir "tiene ficha ⇒ tiene números".
  const { deps, persistidos } = andamio(
    clienteQueDice(
      mensaje(JSON.stringify({ is_food: true, items: [{ food_en: "Apple, raw", grams: 0, confidence: 0.9 }] })),
    ),
  );
  const { status, body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const item = (body as CuerpoDeAnalisis).items[0];

  assert.equal(status, 200);
  assert.notEqual(item?.food_id, null, "la ficha se conserva: se sabe qué es");
  assert.equal(item?.nutrients, null, "sin gramos usables no se inventa un número");
  assert.equal(item?.grams_no_estimados, true);
  assert.equal(persistidos.length, 1, "el expediente se guarda igual");
  assert.equal(persistidos[0]?.resultado.items[0]?.nutrients, null);
});

test("una kb_version distinta de la que config/app espera se avisa, no se aborta", async () => {
  // El scan estampa la versión CON LA QUE SE CALCULÓ, así que la trazabilidad
  // está a salvo. Lo que la diferencia delata es que uno de los dos seeds no
  // corrió, y eso tiene que verse en el log.
  const avisos: { mensaje: string; detalle: Record<string, unknown> }[] = [];
  const { deps } = andamio(
    clienteQueDice(
      mensaje(JSON.stringify({ is_food: true, items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9 }] })),
    ),
  );
  deps.config = async () => ({ config: { ...CONFIG_VACIA, kb_version: "1.0.0+viejisima" } });
  deps.advertir = (mensaje, detalle) => avisos.push({ mensaje, detalle });

  const { status } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  assert.equal(status, 200, "el análisis sigue: la versión que vale es la del catálogo cargado");
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]?.mensaje ?? "", /kb_version/);
  assert.equal(avisos[0]?.detalle["config_app"], "1.0.0+viejisima");
});

test("cuando las dos versiones coinciden no se avisa nada", async () => {
  const avisos: string[] = [];
  const { deps } = andamio(
    clienteQueDice(
      mensaje(JSON.stringify({ is_food: true, items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9 }] })),
    ),
  );
  const version = indiceReal().kb_version;
  deps.config = async () => ({ config: { ...CONFIG_VACIA, kb_version: version } });
  deps.advertir = (mensaje) => avisos.push(mensaje);

  await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  assert.deepEqual(avisos, []);
});

test("un `owner_id` explícito manda sobre el provisorio", async () => {
  const { deps, persistidos } = andamio(
    clienteQueDice(
      mensaje(JSON.stringify({ is_food: true, items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9 }] })),
    ),
  );
  await manejarAnalyze({ method: "POST", body: { ...IMAGEN_OK, owner_id: "uid-de-tomas" } }, deps);
  assert.equal(persistidos[0]?.owner_id, "uid-de-tomas");
});
