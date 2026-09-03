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
import { momentoDelCupo } from "../cupo/calendario";
import { CONSUMO_EN_CERO, decidirCupo, revertirConsumo, type EstadoDeConsumo, type LimitesDeCupo } from "../cupo/decision";
import { CODIGOS_QUE_DEVUELVEN_EL_CREDITO, MAX_BASE64_CHARS, manejarAnalyze, validarEntrada, type CuerpoDeAnalisis, type DatosAPersistir, type Dependencias, type PedidoDeAnalisis } from "./handler";
import type { CuerpoDeError } from "./errores";
import { ErrorDeAnalisis } from "./errores";
import { referenciaDeLaFoto, rutaDeLaFoto, type AlmacenDeFotos } from "./imagen";
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
  max_scans_per_month: 15,
  max_scans_per_day: 3,
  copy: {},
  recommendation_rules: null,
};

/** El dueño de casi todos los tests. Sale del token, nunca del cuerpo. */
const UID = "uid-de-tomas";

/**
 * El verificador falso: `token-de:<uid>` verifica y devuelve ese uid; cualquier
 * otra cosa revienta, igual que un token con firma mala o vencido.
 *
 * Es lo que permite que el test del camino completo siga corriendo SIN RED: el
 * IO de Auth entra por `Dependencias` como todo el resto del IO de este repo.
 * El circuito con el Admin SDK de verdad se prueba contra el emulador, en
 * `cupo/emulador.test.ts`.
 */
const PREFIJO_DE_TOKEN = "token-de:";

async function verificadorFalso(idToken: string): Promise<{ uid: string }> {
  if (!idToken.startsWith(PREFIJO_DE_TOKEN)) {
    throw new Error("FirebaseAuthError: Decoding Firebase ID token failed");
  }
  return { uid: idToken.slice(PREFIJO_DE_TOKEN.length) };
}

function cabeceras(uid: string): Record<string, string> {
  return { authorization: `Bearer ${PREFIJO_DE_TOKEN}${uid}` };
}

/** Un instante fijo, para que el mes y el día del cupo no dependan del día que se corre. */
const FECHA_FIJA = new Date("2026-09-02T10:00:00Z");
const MOMENTO_FIJO = momentoDelCupo(FECHA_FIJA);

/**
 * EL ALMACÉN DE FOTOS FALSO. Cloud Storage no se toca en ningún test.
 *
 * Anota lo que se subió y lo que se borró, en orden, que es lo que hace falta
 * para probar las tres cosas de la card 6.0: que la referencia llega al
 * expediente, que la foto de una imagen que no era comida se borra, y que un
 * fallo de la subida no rompe el análisis.
 */
const BUCKET_DE_PRUEBA = "bucket-de-prueba.firebasestorage.app";

interface AlmacenFalso extends AlmacenDeFotos {
  /** Las rutas subidas, en orden. */
  subidas: string[];
  /** Las referencias borradas, en orden. */
  borradas: string[];
}

function almacenFalso(opciones: { subirFalla?: Error; borrarFalla?: Error } = {}): AlmacenFalso {
  const subidas: string[] = [];
  const borradas: string[] = [];
  return {
    subidas,
    borradas,
    subir: async (foto) => {
      if (opciones.subirFalla !== undefined) throw opciones.subirFalla;
      const ruta = rutaDeLaFoto(foto.owner_id, foto.scan_id, foto.media_type);
      subidas.push(ruta);
      return referenciaDeLaFoto(BUCKET_DE_PRUEBA, ruta);
    },
    borrar: async (referencia) => {
      if (opciones.borrarFalla !== undefined) throw opciones.borrarFalla;
      borradas.push(referencia);
    },
  };
}

interface Andamio {
  deps: Dependencias;
  persistidos: DatosAPersistir[];
  /** El consumo en memoria, por dueño. Decide con la MISMA función que producción. */
  consumo: Map<string, EstadoDeConsumo>;
  /** Cuántas veces se devolvió el crédito, y a quién. */
  devoluciones: string[];
  /** El almacén de fotos falso, para mirar qué se subió y qué se borró. */
  fotos: AlmacenFalso;
}

interface OpcionesDeAndamio {
  copy?: Record<string, string>;
  persistirFalla?: boolean;
  limites?: Partial<LimitesDeCupo>;
  /** El consumo con el que arranca el dueño, para construir el escenario. */
  consumoInicial?: Partial<EstadoDeConsumo>;
  fecha?: Date;
  /** El almacén, cuando el test necesita uno que falle o uno que se demore. */
  fotos?: AlmacenFalso;
}

function andamio(cliente: ClienteDeVision, opciones: OpcionesDeAndamio = {}): Andamio {
  const persistidos: DatosAPersistir[] = [];
  const devoluciones: string[] = [];
  const consumo = new Map<string, EstadoDeConsumo>();
  if (opciones.consumoInicial !== undefined) {
    consumo.set(UID, { ...CONSUMO_EN_CERO, dia: MOMENTO_FIJO.dia, ...opciones.consumoInicial });
  }
  const config: AppConfig = {
    ...CONFIG_VACIA,
    copy: opciones.copy ?? {},
    ...(opciones.limites?.por_mes === undefined ? {} : { max_scans_per_month: opciones.limites.por_mes }),
    ...(opciones.limites?.por_dia === undefined ? {} : { max_scans_per_day: opciones.limites.por_dia }),
  };
  const fotos = opciones.fotos ?? almacenFalso();
  let reloj = 0;
  return {
    persistidos,
    consumo,
    devoluciones,
    fotos,
    deps: {
      cliente,
      indice: async () => indiceReal(),
      config: async () => ({ config }),
      verificarToken: verificadorFalso,
      // El cupo en memoria decide con `decidirCupo`, la misma función pura que
      // corre en producción: lo que este andamio reemplaza es Firestore, no la
      // regla. La transacción de verdad se prueba contra el emulador.
      reservarCupo: async ({ owner_id, momento, limites }) => {
        const estado = consumo.get(owner_id) ?? CONSUMO_EN_CERO;
        const veredicto = decidirCupo(estado, limites, momento);
        if (veredicto.entra) consumo.set(owner_id, veredicto.consumo);
        return veredicto;
      },
      devolverCupo: async ({ owner_id, momento }) => {
        devoluciones.push(owner_id);
        const estado = consumo.get(owner_id);
        if (estado !== undefined) consumo.set(owner_id, revertirConsumo(estado, momento));
      },
      persistir: async (datos) => {
        if (opciones.persistirFalla === true) throw new Error("Firestore no responde");
        persistidos.push(datos);
      },
      almacenDeFotos: fotos,
      nuevoScanId: () => "scan-de-prueba",
      ahora: () => (reloj += 100),
      fecha: () => opciones.fecha ?? FECHA_FIJA,
      opcionesDeVision: { esperar: async () => {} },
    },
  };
}

/** Una imagen base64 cualquiera: acá nunca se decodifica, se valida la forma. */
const IMAGEN_OK = { image_base64: "AAAABBBB", media_type: "image/jpeg" };

/** Un POST bien formado y autenticado. Es el pedido que hace la PWA. */
function POST(body: unknown = IMAGEN_OK, uid: string = UID): PedidoDeAnalisis {
  return { method: "POST", body, headers: cabeceras(uid) };
}

// ---------------------------------------------------------------------------
// Validación del pedido
// ---------------------------------------------------------------------------

test("validarEntrada acepta el cuerpo mínimo, que ya no trae dueño", () => {
  const entrada = validarEntrada(IMAGEN_OK);
  assert.equal(entrada.owner_id_del_cuerpo, null, "el dueño sale del token, no del cuerpo");
  assert.equal(entrada.image_base64, "AAAABBBB");
});

test("un `owner_id` en el cuerpo se recoge para el log y no rompe (card 4.2)", () => {
  // El front dejó de mandarlo, pero durante días hay teléfonos con la versión
  // vieja cacheada. Un 400 les rompería la app por un campo que ya no miramos.
  assert.equal(validarEntrada({ ...IMAGEN_OK, owner_id: " anon-dev " }).owner_id_del_cuerpo, "anon-dev");
  assert.equal(validarEntrada({ ...IMAGEN_OK, owner_id: "   " }).owner_id_del_cuerpo, null);
  assert.equal(validarEntrada({ ...IMAGEN_OK, owner_id: 42 }).owner_id_del_cuerpo, null);
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

  const { status, body } = await manejarAnalyze(POST(), deps);
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
  assert.equal(persistidos[0]?.owner_id, UID, "el dueño del expediente es el uid del token");
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
  const { body } = await manejarAnalyze(POST(), deps);
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
  const { body } = await manejarAnalyze(POST(), deps);
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
  const { body } = await manejarAnalyze(POST(), deps);
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
  const { body } = await manejarAnalyze(POST(), deps);
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

  const { body } = await manejarAnalyze(POST(), deps);
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

  const { status, body } = await manejarAnalyze(POST(), deps);
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
  const { body } = await manejarAnalyze(POST(), deps);
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
  const { status, body } = await manejarAnalyze(POST(), deps);
  const error = (body as CuerpoDeError).error;

  assert.equal(status, 502);
  assert.equal(error.code, "respuesta_ilegible");
  assert.equal(error.message_es, "No pude leer el plato. Probá con más luz.");
  assert.equal(error.copy_source, "config");
});

test("sin la clave publicada, el error usa su texto en frío y lo declara", async () => {
  const { deps } = andamio(clienteQueDice(mensaje("{roto", "end_turn")));
  const { body } = await manejarAnalyze(POST(), deps);
  const error = (body as CuerpoDeError).error;

  assert.equal(error.copy_source, "cold-start-default");
  assert.match(error.message_es, /No pude reconocer el plato/);
});

test("un `stop_reason` inesperado llega al cliente como 502, no como 500", async () => {
  const { deps } = andamio(
    clienteQueDice(mensaje(JSON.stringify({ is_food: true, items: [] }), "max_tokens")),
  );
  const { status, body } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 502);
  assert.equal((body as CuerpoDeError).error.code, "respuesta_ilegible");
});

test("si el modelo no responde, es 503 y no un 500 anónimo", async () => {
  const caida = new Error("HTTP 529");
  (caida as unknown as { status: number }).status = 529;
  const { deps } = andamio(clienteQueDice(caida));
  const { status, body } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 503);
  assert.equal((body as CuerpoDeError).error.code, "modelo_no_disponible");
});

test("si el catálogo no está, el análisis no arranca", async () => {
  const { deps } = andamio(clienteQueDice(mensaje(JSON.stringify({ is_food: true, items: [] }))));
  deps.indice = async () => {
    throw new ErrorDeAnalisis("catalogo_no_disponible", "foods vacía");
  };
  const { status, body } = await manejarAnalyze(POST(), deps);
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
  const { status, body } = await manejarAnalyze(POST(), deps);
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
  const { status, body } = await manejarAnalyze(POST(), deps);
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

  const { status } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 200, "el análisis sigue: la versión que vale es la del catálogo cargado");
  // Los pedidos de este andamio no traen cabecera de App Check, así que desde la
  // card 4.4 el modo observación anota una línea por cada uno. Es lo que tiene
  // que pasar (esa línea ES la medición), y acá se aparta para mirar la del
  // catálogo, que es lo que este test comprueba.
  const deLaVersion = avisos.filter((a) => !a.mensaje.startsWith("App Check"));
  assert.equal(deLaVersion.length, 1);
  assert.match(deLaVersion[0]?.mensaje ?? "", /kb_version/);
  assert.equal(deLaVersion[0]?.detalle["config_app"], "1.0.0+viejisima");
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

  await manejarAnalyze(POST(), deps);
  // Mismo apartado que el test de arriba: la línea de App Check en observación
  // no es ruido, es la cifra que se va a mirar antes de encender el bloqueo.
  assert.deepEqual(avisos.filter((m) => !m.startsWith("App Check")), []);
});

test("el `owner_id` del cuerpo NO manda: manda el token, y el intento queda anotado", async () => {
  // Es el candado de la card 4.2 y el que impide lo que antes era trivial: pedir
  // un análisis con el token propio y escribirlo bajo el dueño de otro.
  const avisos: { mensaje: string; detalle: Record<string, unknown> }[] = [];
  const { deps, persistidos, consumo } = andamio(
    clienteQueDice(
      mensaje(JSON.stringify({ is_food: true, items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9 }] })),
    ),
  );
  deps.advertir = (mensaje, detalle) => avisos.push({ mensaje, detalle });

  const { status } = await manejarAnalyze(POST({ ...IMAGEN_OK, owner_id: "la-victima" }), deps);

  assert.equal(status, 200, "no rompe: el cliente viejo cacheado sigue funcionando");
  assert.equal(persistidos[0]?.owner_id, UID, "el expediente es del dueño del token");
  assert.equal(consumo.has("la-victima"), false, "y el cupo que se gastó tampoco es el de la víctima");
  assert.equal(consumo.get(UID)?.usados_mes, 1);

  const aviso = avisos.find((a) => a.mensaje.includes("owner_id"));
  assert.ok(aviso, "el descarte se anota: es la única forma de saber cuándo dejan de mandarlo");
  assert.equal(aviso?.detalle["owner_id_del_cuerpo"], "la-victima");
  assert.equal(aviso?.detalle["uid_del_token"], UID);
  assert.equal(aviso?.detalle["coincide"], false);
});

// ---------------------------------------------------------------------------
// Card 4.2 — el dueño sale del token
// ---------------------------------------------------------------------------

/**
 * El candado del §4 del contrato (regla DT-21) sobre los textos NUEVOS.
 *
 * Busca las formas voseantes concretas y no «una palabra terminada en á/é/í»:
 * media lengua española termina así («aquí», «café», «está») y un detector
 * genérico daría falsos positivos hasta que alguien lo apagara. Los textos
 * VIEJOS de `errores.ts` sí vosean y siguen así a propósito: son la DT-40 (a),
 * que se cierra moviéndolos a `config/copy.json` en otra card.
 */
function sinVoseo(texto: string): void {
  assert.doesNotMatch(
    texto,
    /\b(?:prob|sac|volv|intent|esper|mir|and|ten|pod|quer|hac|deb)(?:á|é|és|ás)\b/iu,
    `«${texto}» tiene voseo`,
  );
}

const PLATO_OK = JSON.stringify({
  is_food: true,
  items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9 }],
});

test("sin cabecera Authorization es 401 y ni se llama al modelo ni se toca el cupo", async () => {
  let llamoAlModelo = false;
  const { deps, consumo } = andamio({
    messages: {
      create: async () => {
        llamoAlModelo = true;
        throw new Error("no tendría que haberse llamado");
      },
    },
  });

  const { status, body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const error = (body as CuerpoDeError).error;

  assert.equal(status, 401);
  assert.equal(error.code, "no_autenticado");
  assert.equal(llamoAlModelo, false, "un anónimo no gasta ni un token de la API");
  assert.equal(consumo.size, 0, "y tampoco gasta cupo de nadie");
});

test("un token que no verifica es 401 con el texto en frío en español de España", async () => {
  const { deps } = andamio(clienteQueDice(mensaje(PLATO_OK)));
  const { status, body } = await manejarAnalyze(
    { method: "POST", body: IMAGEN_OK, headers: { authorization: "Bearer token.inventado" } },
    deps,
  );
  const error = (body as CuerpoDeError).error;

  assert.equal(status, 401);
  assert.equal(error.code, "no_autenticado");
  assert.equal(error.copy_source, "cold-start-default");
  assert.match(error.message_es, /Vuelve a entrar/, "«vuelve», no «volvé»: §4 del contrato");
  sinVoseo(error.message_es);
});

test("el 401 se puede publicar en `config/app.copy` sin desplegar", async () => {
  const { deps } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    copy: { error_unauthenticated: "Inicia sesión otra vez, por favor." },
  });
  const { body } = await manejarAnalyze({ method: "POST", body: IMAGEN_OK }, deps);
  const error = (body as CuerpoDeError).error;
  assert.equal(error.message_es, "Inicia sesión otra vez, por favor.");
  assert.equal(error.copy_source, "config");
});

test("dos dueños distintos NO comparten ni expediente ni cupo", async () => {
  // El candado que la card 4.2 vino a poner: el dueño de un scan es el del
  // token. Antes bastaba con escribir el `owner_id` que uno quisiera.
  const { deps, persistidos, consumo } = andamio(clienteQueDice(mensaje(PLATO_OK)));

  await manejarAnalyze(POST(IMAGEN_OK, "dueño-a"), deps);
  await manejarAnalyze(POST(IMAGEN_OK, "dueño-b"), deps);

  assert.deepEqual(persistidos.map((p) => p.owner_id), ["dueño-a", "dueño-b"]);
  assert.equal(consumo.get("dueño-a")?.usados_mes, 1);
  assert.equal(consumo.get("dueño-b")?.usados_mes, 1, "el cupo de uno no se lo gasta el otro");
});

// ---------------------------------------------------------------------------
// Card 4.3 — el cupo que muerde
// ---------------------------------------------------------------------------

test("el 200 le dice al usuario cómo va su cupo", async () => {
  const { deps } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    consumoInicial: { usados_mes: 7, usados_dia: 1 },
  });
  const { status, body } = await manejarAnalyze(POST(), deps);
  const cuerpo = body as CuerpoDeAnalisis;

  assert.equal(status, 200);
  assert.deepEqual(cuerpo.quota, {
    mes: { usados: 8, limite: 15, se_renueva: "2026-10-01" },
    dia: { usados: 2, limite: 3, se_renueva: "2026-09-03" },
  });
});

test("el 16.º escaneo del mes es 429 con su bloque `quota`, y el modelo ni se entera", async () => {
  let llamoAlModelo = false;
  const { deps } = andamio(
    {
      messages: {
        create: async () => {
          llamoAlModelo = true;
          throw new Error("no tendría que haberse llamado");
        },
      },
    },
    { consumoInicial: { usados_mes: 15, usados_dia: 0 } },
  );

  const { status, body } = await manejarAnalyze(POST(), deps);
  const error = (body as CuerpoDeError).error;

  assert.equal(status, 429);
  assert.equal(error.code, "cupo_agotado");
  assert.deepEqual(error.quota, { ambito: "mes", usados: 15, limite: 15, se_renueva: "2026-10-01" });
  assert.equal(llamoAlModelo, false, "el cupo frena ANTES de gastar plata: ese es el punto");
});

test("el 4.º del día es 429 aunque queden 10 del mes", async () => {
  const { deps } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    consumoInicial: { usados_mes: 5, usados_dia: 3 },
  });
  const { status, body } = await manejarAnalyze(POST(), deps);
  const error = (body as CuerpoDeError).error;

  assert.equal(status, 429);
  assert.deepEqual(error.quota, { ambito: "dia", usados: 3, limite: 3, se_renueva: "2026-09-03" });
});

test("el texto del 429 también se publica sin desplegar", async () => {
  const { deps } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    consumoInicial: { usados_mes: 15 },
    copy: { error_quota_exhausted: "Se te han acabado los análisis de este mes." },
  });
  const { body } = await manejarAnalyze(POST(), deps);
  const error = (body as CuerpoDeError).error;
  assert.equal(error.message_es, "Se te han acabado los análisis de este mes.");
  assert.equal(error.copy_source, "config");
});

test("sin copy publicado, el 429 usa su texto en frío, en español de España", async () => {
  const { deps } = andamio(clienteQueDice(mensaje(PLATO_OK)), { consumoInicial: { usados_mes: 15 } });
  const { body } = await manejarAnalyze(POST(), deps);
  const error = (body as CuerpoDeError).error;
  assert.equal(error.copy_source, "cold-start-default");
  assert.match(error.message_es, /Espera a que se renueve/, "«espera», no «esperá»");
  sinVoseo(error.message_es);
});

test("los topes salen de `config/app`: bajarlos a 1 frena el segundo escaneo", async () => {
  // La regla dura 1 del proyecto, ejercida: el umbral se cambia en Firestore y
  // el código no se toca. Si el handler leyera un número propio, este test
  // seguiría pasando con 3 y no con 1.
  const { deps } = andamio(clienteQueDice(mensaje(PLATO_OK)), { limites: { por_dia: 1 } });

  assert.equal((await manejarAnalyze(POST(), deps)).status, 200);
  const segundo = await manejarAnalyze(POST(), deps);
  assert.equal(segundo.status, 429);
  assert.equal((segundo.body as CuerpoDeError).error.quota?.limite, 1, "el límite que se publicó");
});

test("el crédito se DEVUELVE si el modelo se cae", async () => {
  const caida = new Error("HTTP 529");
  (caida as unknown as { status: number }).status = 529;
  const { deps, consumo, devoluciones } = andamio(clienteQueDice(caida), {
    consumoInicial: { usados_mes: 4, usados_dia: 1 },
  });

  const { status, body } = await manejarAnalyze(POST(), deps);

  assert.equal(status, 503);
  assert.equal((body as CuerpoDeError).error.code, "modelo_no_disponible");
  assert.deepEqual(devoluciones, [UID]);
  assert.deepEqual(consumo.get(UID), { usados_mes: 4, dia: MOMENTO_FIJO.dia, usados_dia: 1 },
    "quedó igual que antes del intento: no se le cobró una llamada que no se hizo");
});

test("el crédito también vuelve si el catálogo no está", async () => {
  const { deps, consumo, devoluciones } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    consumoInicial: { usados_mes: 4, usados_dia: 1 },
  });
  deps.indice = async () => {
    throw new ErrorDeAnalisis("catalogo_no_disponible", "foods vacía");
  };

  const { status } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 503);
  assert.deepEqual(devoluciones, [UID]);
  assert.equal(consumo.get(UID)?.usados_mes, 4);
});

test("una foto que NO es comida SÍ consume: el modelo ya la miró", async () => {
  const { deps, consumo, devoluciones, persistidos } = andamio(
    clienteQueDice(mensaje(JSON.stringify({ is_food: false, items: [] }))),
    { consumoInicial: { usados_mes: 4, usados_dia: 1 } },
  );

  const { status, body } = await manejarAnalyze(POST(), deps);
  const cuerpo = body as CuerpoDeAnalisis;

  assert.equal(status, 200);
  assert.equal(cuerpo.is_food, false);
  assert.deepEqual(devoluciones, [], "no se devuelve: el trabajo se pidió y se pagó");
  assert.equal(consumo.get(UID)?.usados_mes, 5);
  assert.equal(persistidos.length, 0, "consume, pero sigue sin dejar expediente (§7 del plan)");
  assert.equal(cuerpo.quota.mes.usados, 5, "y el cupo que se le muestra ya lo cuenta");
});

test("una respuesta ilegible del modelo NO devuelve el crédito: esos tokens se facturaron", async () => {
  const { deps, consumo, devoluciones } = andamio(clienteQueDice(mensaje("{roto")), {
    consumoInicial: { usados_mes: 4, usados_dia: 1 },
  });

  const { status, body } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 502);
  assert.equal((body as CuerpoDeError).error.code, "respuesta_ilegible");
  assert.deepEqual(devoluciones, [], "el modelo contestó; que no se entendiera no es una llamada gratis");
  assert.equal(consumo.get(UID)?.usados_mes, 5);
});

test("si la persistencia falla, el crédito tampoco vuelve: el análisis se entregó", async () => {
  const { deps, consumo, devoluciones } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    persistirFalla: true,
    consumoInicial: { usados_mes: 4, usados_dia: 1 },
  });
  const { status, body } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 200);
  assert.equal((body as CuerpoDeAnalisis).persisted, false);
  assert.deepEqual(devoluciones, []);
  assert.equal(consumo.get(UID)?.usados_mes, 5);
});

test("un error interno DESPUÉS de que el modelo contestó no devuelve el crédito", async () => {
  // El `!elModeloYaCobro` del handler, ejercido: el código del error solo no
  // alcanza, porque `error_interno` sí devuelve cuando pasa antes de la llamada.
  //
  // EL ESCENARIO SE CONSTRUYE con el reloj de la latencia, que el handler lee
  // dos veces: una al entrar y otra al armar la meta, YA con la respuesta del
  // modelo en la mano. Reventar en la segunda lectura es exactamente "algo se
  // rompió después de que el modelo cobró". (Hasta la card 6.0 este test
  // reventaba `nuevoScanId`, que ahora corre ANTES del modelo — es el nombre del
  // objeto en Storage— y por lo tanto ya no sirve para construir este caso.)
  const { deps, consumo, devoluciones } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    consumoInicial: { usados_mes: 4, usados_dia: 1 },
  });
  let lecturas = 0;
  deps.ahora = () => {
    lecturas += 1;
    if (lecturas > 1) throw new Error("revienta después de la visión");
    return 0;
  };

  const { status, body } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 500);
  assert.equal((body as CuerpoDeError).error.code, "error_interno");
  assert.deepEqual(devoluciones, [], "la llamada al modelo ya estaba pagada");
  assert.equal(consumo.get(UID)?.usados_mes, 5);
});

test("un error interno ANTES de la llamada al modelo sí lo devuelve", async () => {
  const { deps, consumo, devoluciones } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    consumoInicial: { usados_mes: 4, usados_dia: 1 },
  });
  deps.indice = async () => {
    throw new Error("algo raro pasó armando el índice");
  };

  const { status } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 500);
  assert.deepEqual(devoluciones, [UID]);
  assert.equal(consumo.get(UID)?.usados_mes, 4);
  assert.equal(CODIGOS_QUE_DEVUELVEN_EL_CREDITO.has("error_interno"), true);
});

test("un 429 NO devuelve nada: no llegó a reservar", async () => {
  const { deps, devoluciones } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    consumoInicial: { usados_mes: 15 },
  });
  await manejarAnalyze(POST(), deps);
  assert.deepEqual(devoluciones, [], "rebotar no reserva, así que no hay nada que devolver");
});

test("si la devolución del crédito falla, el error original llega igual", async () => {
  // Un problema devolviendo no puede convertir un 503 —que el front sabe
  // reintentar— en un 500 anónimo. Lo que sí tiene que pasar es quedar anotado.
  const avisos: { mensaje: string; detalle: Record<string, unknown> }[] = [];
  const caida = new Error("HTTP 529");
  (caida as unknown as { status: number }).status = 529;
  const { deps } = andamio(clienteQueDice(caida));
  deps.devolverCupo = async () => {
    throw new Error("Firestore no responde");
  };
  deps.advertir = (mensaje, detalle) => avisos.push({ mensaje, detalle });

  const { status, body } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 503);
  assert.equal((body as CuerpoDeError).error.code, "modelo_no_disponible");

  const aviso = avisos.find((a) => a.mensaje.includes("devolver el crédito"));
  assert.ok(aviso, "un crédito que no se pudo devolver es un crédito perdido: tiene que verse");
  assert.equal(aviso?.detalle["owner_id"], UID);
  assert.equal(aviso?.detalle["periodo"], MOMENTO_FIJO.mes);
});

test("el mes del cupo lo decide el reloj de Madrid, no el de la máquina", async () => {
  // 30/09 a las 22:30 UTC ya es el 1 de octubre en España: este escaneo tiene
  // que caer en el cupo de OCTUBRE. Con corte por UTC caería en septiembre y el
  // usuario perdería un escaneo de un mes que ya se le renovó.
  const { deps } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    fecha: new Date("2026-09-30T22:30:00Z"),
  });
  const { body } = await manejarAnalyze(POST(), deps);
  const cuerpo = body as CuerpoDeAnalisis;
  assert.equal(cuerpo.quota.mes.se_renueva, "2026-11-01", "el cupo que se gastó es el de octubre");
  assert.equal(cuerpo.quota.dia.se_renueva, "2026-10-02");
});

// ---------------------------------------------------------------------------
// Card 6.0 — el expediente guarda la foto y lo que dijo el modelo
// ---------------------------------------------------------------------------

test("el `scan_id` se genera ANTES de llamar al modelo: es el nombre de la foto", async () => {
  // Hasta la card 6.0 se generaba después del análisis, y no podía ser de otra
  // manera: no hacía falta antes. Ahora el id ES el nombre del objeto en
  // Storage, así que sin él la subida no puede ni arrancar — y si no arranca
  // antes, deja de ser gratis.
  const orden: string[] = [];
  const { deps } = andamio({
    messages: {
      create: async () => {
        orden.push("el modelo");
        return mensaje(PLATO_OK);
      },
    },
  });
  const generar = deps.nuevoScanId;
  deps.nuevoScanId = () => {
    orden.push("el scan_id");
    return generar();
  };

  const { status } = await manejarAnalyze(POST(), deps);
  assert.equal(status, 200);
  assert.deepEqual(orden, ["el scan_id", "el modelo"]);
});

test("la subida de la foto ARRANCA antes de que el modelo conteste: no agrega latencia", async () => {
  // ESTE ES EL CANDADO DE LA CERO LATENCIA, y no se mide con un cronómetro
  // —que dependería de la máquina— sino con el ORDEN de los hechos. La subida
  // falsa se queda trabada hasta que el modelo contesta: si el handler la
  // lanzara después de `pedirVision`, "la subida arranca" aparecería tercero y
  // el escaneo pagaría la subida encima de los 3-6 s del modelo.
  const orden: string[] = [];
  let liberarLaSubida: () => void = () => {};
  const elModeloContesto = new Promise<void>((resolver) => {
    liberarLaSubida = resolver;
  });

  const fotos = almacenFalso();
  const subirDeVerdad = fotos.subir;
  fotos.subir = async (foto) => {
    orden.push("la subida arranca");
    await elModeloContesto;
    orden.push("la subida termina");
    return subirDeVerdad(foto);
  };

  const { deps, persistidos } = andamio(
    {
      messages: {
        create: async () => {
          orden.push("el modelo contesta");
          liberarLaSubida();
          return mensaje(PLATO_OK);
        },
      },
    },
    { fotos },
  );

  const { status } = await manejarAnalyze(POST(), deps);

  assert.equal(status, 200);
  assert.deepEqual(orden, ["la subida arranca", "el modelo contesta", "la subida termina"]);
  assert.notEqual(persistidos[0]?.imagen.referencia, null, "y la foto igual llegó entera al expediente");
});

test("la foto va a `scans/{dueño}/{scan}.jpg` y su `gs://` queda en el expediente", async () => {
  const { deps, persistidos, fotos } = andamio(clienteQueDice(mensaje(PLATO_OK)));

  await manejarAnalyze(POST(), deps);

  const ruta = `scans/${UID}/scan-de-prueba.jpg`;
  assert.deepEqual(fotos.subidas, [ruta], "una sola subida, en la carpeta del dueño (la de `storage.rules`)");
  assert.equal(persistidos[0]?.imagen.referencia, `gs://${BUCKET_DE_PRUEBA}/${ruta}`);
  assert.equal(persistidos[0]?.imagen.error, null, "no hubo error: el campo no se llena de ruido");
});

test("lo que dijo el modelo viaja al expediente TAL CUAL entró al motor", async () => {
  // El campo `vision` es el que convierte el expediente en algo re-jugable. Acá
  // se mira que sea el objeto saneado completo —incluido el `components: []`
  // vacío, que significa "el modelo miró y no había nada que descomponer"—; que
  // re-analizarlo reproduzca los mismos números se prueba en `persistencia.test`
  // con una visión real del golden set.
  const { deps, persistidos } = andamio(
    clienteQueDice(
      mensaje(
        JSON.stringify({
          is_food: true,
          items: [{ food_en: "Apple, raw", food_es: "manzana", grams: 150, confidence: 0.9 }],
        }),
      ),
    ),
  );

  await manejarAnalyze(POST(), deps);

  assert.deepEqual(persistidos[0]?.vision, {
    is_food: true,
    items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9, food_es: "manzana", components: [] }],
  });
});

test("si la subida de la foto falla, el análisis se entrega igual y el expediente dice por qué", async () => {
  // LA FOTO NUNCA ROMPE EL ANÁLISIS: el modelo ya cobró y el reporte es correcto.
  // Y `persisted` sigue hablando SOLO del documento —queda escrito—, que es la
  // pregunta que el front ya sabe contestar desde la card 2.3.
  const avisos: { mensaje: string; detalle: Record<string, unknown> }[] = [];
  const { deps, persistidos } = andamio(clienteQueDice(mensaje(PLATO_OK)), {
    fotos: almacenFalso({ subirFalla: new Error("el bucket no existe") }),
  });
  deps.advertir = (mensaje, detalle) => avisos.push({ mensaje, detalle });

  const { status, body } = await manejarAnalyze(POST(), deps);
  const cuerpo = body as CuerpoDeAnalisis;

  assert.equal(status, 200);
  assert.equal(cuerpo.items.length, 1, "el reporte sale entero");
  assert.equal(cuerpo.persisted, true, "`persisted` habla del documento, no de la foto");
  assert.equal(persistidos.length, 1);
  assert.equal(persistidos[0]?.imagen.referencia, null);
  assert.match(persistidos[0]?.imagen.error ?? "", /el bucket no existe/);
  assert.ok(
    avisos.some((a) => a.mensaje.includes("no se pudo guardar la foto")),
    "y queda anotado: una foto que no se guarda en silencio es una calibración que no se puede hacer",
  );
});

test("la foto de una imagen que NO era comida se borra del bucket", async () => {
  // La contracara de subir antes de saber qué había en la foto: sin expediente
  // que la nombre, no puede quedar la foto de una persona colgada en el bucket.
  const { deps, fotos, persistidos } = andamio(
    clienteQueDice(mensaje(JSON.stringify({ is_food: false, items: [] }))),
  );

  const { status } = await manejarAnalyze(POST(), deps);
  const ruta = `scans/${UID}/scan-de-prueba.jpg`;

  assert.equal(status, 200);
  assert.equal(persistidos.length, 0, "sigue sin haber expediente (§7 del plan)");
  assert.deepEqual(fotos.subidas, [ruta], "la subida ya había arrancado: todavía no se sabía");
  assert.deepEqual(fotos.borradas, [`gs://${BUCKET_DE_PRUEBA}/${ruta}`]);
});

test("si el borrado de esa foto falla, el 200 sale igual y queda anotado con su referencia", async () => {
  // Un objeto huérfano es molesto y barato; convertir un 200 —"eso no parece un
  // plato"— en un 500 sería caro. El aviso trae la referencia exacta porque es
  // lo único que hace falta para limpiarlo a mano.
  const avisos: { mensaje: string; detalle: Record<string, unknown> }[] = [];
  const { deps } = andamio(clienteQueDice(mensaje(JSON.stringify({ is_food: false, items: [] }))), {
    fotos: almacenFalso({ borrarFalla: new Error("Storage no responde") }),
  });
  deps.advertir = (mensaje, detalle) => avisos.push({ mensaje, detalle });

  const { status, body } = await manejarAnalyze(POST(), deps);

  assert.equal(status, 200);
  assert.equal((body as CuerpoDeAnalisis).is_food, false);
  const aviso = avisos.find((a) => a.mensaje.includes("borrar la foto"));
  assert.ok(aviso, "un huérfano que nadie sabe que existe no se limpia nunca");
  assert.equal(aviso?.detalle["referencia"], `gs://${BUCKET_DE_PRUEBA}/scans/${UID}/scan-de-prueba.jpg`);
});
