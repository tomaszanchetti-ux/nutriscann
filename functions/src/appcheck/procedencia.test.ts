/**
 * App Check, sin red: la cabecera, los cuatro estados y el interruptor.
 *
 * Lo que estos tests tienen que MORDER —no "cubrir"— es una sola cosa: que el
 * campo de `config/app` gobierne de verdad. Un test que pase igual con el
 * interruptor encendido o apagado no está probando el interruptor, está
 * probando que el código compila. Por eso la tabla de `decidirProcedencia` mira
 * las OCHO combinaciones (cuatro estados × dos modos) y no solo las que
 * interesan hoy.
 *
 * El circuito entero —el handler con su 403, y que un pedido rechazado no gasta
 * cupo ni llama al modelo— está más abajo, con el mismo andamiaje en memoria
 * que usa `analyze/handler.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import cors from "cors";
import type Anthropic from "@anthropic-ai/sdk";

import { indiceReal } from "../engine/testing";
import { appCheckExigido, COLD_START_DEFAULTS, type AppConfig } from "../config";
import { momentoDelCupo } from "../cupo/calendario";
import { CONSUMO_EN_CERO, decidirCupo, type EstadoDeConsumo } from "../cupo/decision";
import { manejarAnalyze, type CuerpoDeAnalisis, type Dependencias } from "../analyze/handler";
import type { CuerpoDeError } from "../analyze/errores";
import { MODELO_VISION, type ClienteDeVision } from "../analyze/vision";
import {
  CABECERA_APP_CHECK,
  CODIGO_APP_CHECK,
  DEFINICION_APP_CHECK,
  ErrorDeAppCheck,
  comprobarProcedencia,
  decidirProcedencia,
  extraerTokenDeAppCheck,
  respuestaDeAppCheck,
  type CuerpoDeErrorDeAppCheck,
  type ResultadoDeAppCheck,
} from "./procedencia";

// ---------------------------------------------------------------------------
// La cabecera (pura)
// ---------------------------------------------------------------------------

test("extraerTokenDeAppCheck saca el token de `X-Firebase-AppCheck`", () => {
  assert.equal(extraerTokenDeAppCheck({ "x-firebase-appcheck": "abc.def" }), "abc.def");
  assert.equal(extraerTokenDeAppCheck({ "X-Firebase-AppCheck": "abc" }), "abc", "el nombre no distingue mayúsculas");
  assert.equal(extraerTokenDeAppCheck({ "x-firebase-appcheck": "  abc  " }), "abc", "los espacios no son parte del token");
  assert.equal(
    extraerTokenDeAppCheck({ "x-firebase-appcheck": ["uno", "dos"] }),
    "uno",
    "repetida: vale la primera, igual que Authorization",
  );
});

test("extraerTokenDeAppCheck devuelve null cuando no hay token usable", () => {
  for (const valor of [undefined, "", "   "]) {
    assert.equal(extraerTokenDeAppCheck({ "x-firebase-appcheck": valor }), null, `\`${String(valor)}\` no es un token`);
  }
  assert.equal(extraerTokenDeAppCheck({}), null, "sin cabecera, sin token");
  assert.equal(
    extraerTokenDeAppCheck({ authorization: "Bearer abc" }),
    null,
    "el token de identidad NO es el de App Check: son dos cabeceras distintas",
  );
});

test("el nombre de la cabecera es el que manda el SDK de Firebase", () => {
  // Está escrito en una constante porque lo elige Firebase, no nosotros: si
  // alguien lo "corrigiera" a otro nombre, la app dejaría de mandar procedencia
  // sin que nada fallara. Este test es el que se enteraría.
  assert.equal(CABECERA_APP_CHECK, "x-firebase-appcheck");
});

// ---------------------------------------------------------------------------
// Los cuatro estados
// ---------------------------------------------------------------------------

const VERIFICA_OK = async (token: string) => ({ app_id: `app-de-${token}` });
const VERIFICA_MAL = async (): Promise<{ app_id: string }> => {
  throw new Error("FirebaseAppCheckError: The provided App Check token has invalid signature.");
};

test("sin cabecera ⇒ `ausente`, y no se llama al verificador", async () => {
  let llamo = false;
  const resultado = await comprobarProcedencia({ authorization: "Bearer x" }, async () => {
    llamo = true;
    return { app_id: "no-deberia" };
  });
  assert.deepEqual(resultado, { estado: "ausente" });
  assert.equal(llamo, false, "no hay token que verificar: verificar cuesta y no hay qué");
});

test("con un token que verifica ⇒ `valida`, con el app_id del token", async () => {
  const resultado = await comprobarProcedencia({ [CABECERA_APP_CHECK]: "t1" }, VERIFICA_OK);
  assert.deepEqual(resultado, { estado: "valida", app_id: "app-de-t1" });
});

test("con un token que NO verifica ⇒ `rechazada`, y el motivo va al log", async () => {
  const resultado = await comprobarProcedencia({ [CABECERA_APP_CHECK]: "falso" }, VERIFICA_MAL);
  assert.equal(resultado.estado, "rechazada");
  assert.match(
    resultado.estado === "rechazada" ? resultado.motivo : "",
    /invalid signature/,
    "el motivo real queda para el log; al cliente le llega el código y nada más",
  );
});

test("un token que verifica pero no trae app_id usable ⇒ `rechazada` (falla cerrada)", async () => {
  for (const app of [{ app_id: "   " }, { app_id: undefined } as unknown as { app_id: string }]) {
    const resultado = await comprobarProcedencia({ [CABECERA_APP_CHECK]: "raro" }, async () => app);
    assert.equal(resultado.estado, "rechazada", "verificar sin decir qué app es no es verificar");
  }
});

test("sin verificador inyectado ⇒ `indeterminada`, NUNCA `rechazada`", async () => {
  // Un cable suelto del backend es un problema NUESTRO. Si esto devolviera
  // `rechazada`, un despliegue que se olvidara de inyectar el verificador
  // apagaría la app para todos en cuanto el bloqueo estuviera encendido.
  const resultado = await comprobarProcedencia({ [CABECERA_APP_CHECK]: "t" }, undefined);
  assert.equal(resultado.estado, "indeterminada");
});

test("si la verificación NO CONTESTA ⇒ `indeterminada`, y el pedido no se queda colgado", async () => {
  const comenzo = Date.now();
  const resultado = await comprobarProcedencia(
    { [CABECERA_APP_CHECK]: "t" },
    // Una promesa que no se resuelve nunca: es el cuelgue que el límite ataja.
    () => new Promise<{ app_id: string }>(() => {}),
    40,
  );
  assert.equal(resultado.estado, "indeterminada");
  assert.match(resultado.estado === "indeterminada" ? resultado.motivo : "", /no contestó en 40 ms/);
  assert.ok(Date.now() - comenzo < 2_000, "esperó el límite, no para siempre");
});

// ---------------------------------------------------------------------------
// EL INTERRUPTOR: la tabla entera, cuatro estados por dos modos
// ---------------------------------------------------------------------------

test("decidirProcedencia: las OCHO combinaciones, escritas una por una", () => {
  const valida: ResultadoDeAppCheck = { estado: "valida", app_id: "app" };
  const ausente: ResultadoDeAppCheck = { estado: "ausente" };
  const rechazada: ResultadoDeAppCheck = { estado: "rechazada", motivo: "firma mala" };
  const indeterminada: ResultadoDeAppCheck = { estado: "indeterminada", motivo: "no contestó" };

  // ── OBSERVACIÓN (el arranque en frío): NADA bloquea. Solo se anota. ────────
  assert.deepEqual(decidirProcedencia(valida, false), { bloquea: false, nivel: "silencio" });
  assert.deepEqual(decidirProcedencia(ausente, false), { bloquea: false, nivel: "aviso" });
  assert.deepEqual(decidirProcedencia(rechazada, false), { bloquea: false, nivel: "aviso" });
  assert.deepEqual(decidirProcedencia(indeterminada, false), { bloquea: false, nivel: "alarma" });

  // ── BLOQUEO: rebotan los dos que son señal, y solo esos dos. ───────────────
  assert.deepEqual(decidirProcedencia(valida, true), { bloquea: false, nivel: "silencio" });
  assert.deepEqual(decidirProcedencia(ausente, true), { bloquea: true, nivel: "aviso" });
  assert.deepEqual(decidirProcedencia(rechazada, true), { bloquea: true, nivel: "aviso" });
  assert.deepEqual(
    decidirProcedencia(indeterminada, true),
    { bloquea: false, nivel: "alarma" },
    "LA PROMESA DURA: un fallo nuestro no echa de la app a quien sí tenía derecho a entrar",
  );
});

test("el interruptor se lee de config/app, y arranca APAGADO", () => {
  assert.equal(COLD_START_DEFAULTS.app_check_enforced, false, "el arranque en frío observa, no bloquea");
  assert.equal(appCheckExigido(null), false, "sin configuración —Firestore caído— tampoco se bloquea");
  assert.equal(appCheckExigido({ ...COLD_START_DEFAULTS }), false);
  assert.equal(appCheckExigido({ ...COLD_START_DEFAULTS, app_check_enforced: true }), true);
  assert.equal(
    appCheckExigido({ ...COLD_START_DEFAULTS, app_check_enforced: undefined }),
    false,
    "el documento que ya está publicado en producción no tiene el campo: eso es observar",
  );
});

test("un valor raro en el campo APAGA, y el texto `\"true\"` enciende", () => {
  // La asimetría es a propósito: se edita a mano en la consola de Firebase.
  // Un dedazo tiene que dejar la puerta abierta, no cerrarla.
  const raros: unknown[] = ["si", "TRUE", 1, 0, "", null, {}, "false"];
  for (const valor of raros) {
    assert.equal(
      appCheckExigido({ ...COLD_START_DEFAULTS, app_check_enforced: valor as boolean }),
      false,
      `\`${JSON.stringify(valor)}\` no enciende el bloqueo`,
    );
  }
  assert.equal(
    appCheckExigido({ ...COLD_START_DEFAULTS, app_check_enforced: "true" as unknown as boolean }),
    true,
    "el texto `true` sí: es lo que escribe quien confunde el tipo en la consola",
  );
});

// ---------------------------------------------------------------------------
// El 403
// ---------------------------------------------------------------------------

test("el 403 sale con su código, su texto en frío y su copy_source", () => {
  const { status, body } = respuestaDeAppCheck({});
  assert.equal(status, 403, "403 y no 401: volver a entrar no arregla desde dónde llamás");
  assert.equal(body.error.code, CODIGO_APP_CHECK);
  assert.equal(body.error.message_es, DEFINICION_APP_CHECK.texto_en_frio);
  assert.equal(body.error.copy_source, "cold-start-default");
  assert.doesNotMatch(
    body.error.message_es,
    /App Check|reCAPTCHA/i,
    "el texto es para una persona: no nombra la maquinaria",
  );
});

test("y el texto se puede cambiar sin desplegar, publicando la clave en config/app.copy", () => {
  const { body } = respuestaDeAppCheck({ [DEFINICION_APP_CHECK.clave_copy]: "Abre la app desde el navegador." });
  assert.equal(body.error.message_es, "Abre la app desde el navegador.");
  assert.equal(body.error.copy_source, "config");
});

// ---------------------------------------------------------------------------
// CORS: la cabecera nueva tampoco es "simple"
// ---------------------------------------------------------------------------

test("el preflight devuelve `x-firebase-appcheck` en Access-Control-Allow-Headers", async () => {
  // Mismo mecanismo y mismo motivo que `analyze/cors.test.ts`: `cors({origin:true})`
  // REFLEJA lo que el preflight pidió, no lleva lista blanca. Si el POST saliera
  // sin esta cabecera permitida, el navegador ni lo mandaría — y en local no se
  // vería, porque ahí no hay cruce de origen.
  const middleware = cors({ origin: true }) as unknown as (r: unknown, s: unknown, n: () => void) => void;
  const cabeceras = new Map<string, string>();
  const res = {
    statusCode: 200,
    setHeader: (n: string, v: string) => cabeceras.set(n.toLowerCase(), String(v)),
    getHeader: (n: string) => cabeceras.get(n.toLowerCase()),
    end: () => {},
  };
  const req = {
    method: "OPTIONS",
    headers: {
      origin: "https://app.caliscan.app",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type,x-firebase-appcheck",
    },
  };
  await new Promise<void>((resolver) => {
    res.end = () => resolver();
    middleware(req, res, () => resolver());
  });

  const permitidas = (cabeceras.get("access-control-allow-headers") ?? "").toLowerCase();
  assert.match(permitidas, /x-firebase-appcheck/, "sin esto el POST con procedencia no sale del navegador");
  assert.match(permitidas, /authorization/, "y la identidad sigue pasando");
});

// ---------------------------------------------------------------------------
// El circuito entero
// ---------------------------------------------------------------------------

const UID = "uid-de-tomas";
const PREFIJO_DE_TOKEN = "token-de:";
const FECHA_FIJA = new Date("2026-09-02T10:00:00Z");
const MOMENTO_FIJO = momentoDelCupo(FECHA_FIJA);

function mensajeDelModelo(vision: unknown): Anthropic.Message {
  return {
    id: "msg_appcheck",
    type: "message",
    role: "assistant",
    model: MODELO_VISION,
    content: [{ type: "text", text: JSON.stringify(vision), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
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

const PLATO = { is_food: true, items: [{ food_en: "Apple, raw", grams: 150, confidence: 0.9 }] };

interface Andamio {
  deps: Dependencias;
  /** Cuántas veces se llamó al modelo. Es lo que cuesta dinero. */
  llamadasAlModelo: () => number;
  /** El consumo del cupo, para poder decir "no gastó nada". */
  consumo: Map<string, EstadoDeConsumo>;
  avisos: { mensaje: string; detalle: Record<string, unknown> }[];
}

function andamio(opciones: { exigido?: boolean; verificarAppCheck?: Dependencias["verificarAppCheck"] } = {}): Andamio {
  let llamadas = 0;
  const consumo = new Map<string, EstadoDeConsumo>();
  const avisos: { mensaje: string; detalle: Record<string, unknown> }[] = [];
  const config: AppConfig = {
    ...COLD_START_DEFAULTS,
    ...(opciones.exigido === undefined ? {} : { app_check_enforced: opciones.exigido }),
  };
  const cliente: ClienteDeVision = {
    messages: {
      create: async () => {
        llamadas += 1;
        return mensajeDelModelo(PLATO);
      },
    },
  };
  return {
    llamadasAlModelo: () => llamadas,
    consumo,
    avisos,
    deps: {
      cliente,
      indice: async () => indiceReal(),
      config: async () => ({ config }),
      verificarToken: async (idToken) => {
        if (!idToken.startsWith(PREFIJO_DE_TOKEN)) throw new Error("token que no verifica");
        return { uid: idToken.slice(PREFIJO_DE_TOKEN.length) };
      },
      ...(opciones.verificarAppCheck === undefined ? {} : { verificarAppCheck: opciones.verificarAppCheck }),
      // El mismo cupo en memoria que usa `handler.test.ts`: decide con
      // `decidirCupo`, la función pura de producción.
      reservarCupo: async ({ owner_id, momento, limites }) => {
        const estado = consumo.get(owner_id) ?? { ...CONSUMO_EN_CERO, dia: momento.dia };
        const veredicto = decidirCupo(estado, limites, momento);
        if (veredicto.entra) consumo.set(owner_id, veredicto.consumo);
        return veredicto;
      },
      devolverCupo: async () => {},
      // La card 6.0 sumó la foto al circuito. Acá no se prueba —este archivo mide
      // la procedencia del pedido— así que el almacén es un doble que no guarda nada.
      almacenDeFotos: { subir: async () => "gs://sin-bucket/sin-foto", borrar: async () => {} },
      nuevoScanId: () => "scan-de-appcheck",
      fecha: () => FECHA_FIJA,
      persistir: async () => {},
      opcionesDeVision: { esperar: async () => {} },
      advertir: (mensaje, detalle) => avisos.push({ mensaje, detalle }),
    },
  };
}

function pedido(cabeceras: Record<string, string>) {
  return {
    method: "POST",
    body: { image_base64: "AAAABBBB", media_type: "image/jpeg" },
    headers: { authorization: `Bearer ${PREFIJO_DE_TOKEN}${UID}`, ...cabeceras },
  };
}

test("BLOQUEO encendido + sin cabecera ⇒ 403, sin modelo y sin gastar cupo", async () => {
  const a = andamio({ exigido: true, verificarAppCheck: VERIFICA_OK });
  const { status, body } = await manejarAnalyze(pedido({}), a.deps);

  assert.equal(status, 403);
  assert.equal((body as CuerpoDeErrorDeAppCheck).error.code, CODIGO_APP_CHECK);
  assert.equal(a.llamadasAlModelo(), 0, "no se pagó una sola llamada al modelo");
  assert.equal(a.consumo.size, 0, "y no se reservó un crédito que después habría que devolver");
});

test("BLOQUEO encendido + token que no verifica ⇒ 403", async () => {
  const a = andamio({ exigido: true, verificarAppCheck: VERIFICA_MAL });
  const { status, body } = await manejarAnalyze(pedido({ [CABECERA_APP_CHECK]: "falsificado" }), a.deps);

  assert.equal(status, 403);
  assert.equal((body as CuerpoDeErrorDeAppCheck).error.code, CODIGO_APP_CHECK);
  assert.equal(a.llamadasAlModelo(), 0);
});

test("BLOQUEO encendido + token bueno ⇒ 200: la app de verdad NO se rompe", async () => {
  const a = andamio({ exigido: true, verificarAppCheck: VERIFICA_OK });
  const { status, body } = await manejarAnalyze(pedido({ [CABECERA_APP_CHECK]: "bueno" }), a.deps);

  assert.equal(status, 200);
  assert.equal((body as CuerpoDeAnalisis).is_food, true);
  assert.equal(a.llamadasAlModelo(), 1);
  assert.equal(
    a.avisos.filter((av) => av.mensaje.startsWith("App Check")).length,
    0,
    "el camino feliz no ensucia el log: en observación, cada línea es una cifra",
  );
});

test("OBSERVACIÓN + sin cabecera ⇒ 200, y queda ANOTADO", async () => {
  const a = andamio({ exigido: false, verificarAppCheck: VERIFICA_OK });
  const { status } = await manejarAnalyze(pedido({}), a.deps);

  assert.equal(status, 200, "el teléfono con la versión vieja cacheada sigue funcionando");
  assert.equal(a.llamadasAlModelo(), 1);

  const anotado = a.avisos.find((av) => av.mensaje.startsWith("App Check"));
  assert.ok(anotado, "sin la anotación, la semana de observación no mide nada");
  assert.equal(anotado.detalle["estado"], "ausente");
  assert.equal(anotado.detalle["bloquea"], false);
  assert.equal(anotado.detalle["uid"], UID, "con el uid, para saber a cuánta gente afectaría encenderlo");
});

test("OBSERVACIÓN + token que no verifica ⇒ 200 y anotado como `rechazada`", async () => {
  const a = andamio({ exigido: false, verificarAppCheck: VERIFICA_MAL });
  const { status } = await manejarAnalyze(pedido({ [CABECERA_APP_CHECK]: "falsificado" }), a.deps);

  assert.equal(status, 200);
  const anotado = a.avisos.find((av) => av.mensaje.startsWith("App Check"));
  assert.equal(anotado?.detalle["estado"], "rechazada");
});

test("EL DÍA QUE FALLE NUESTRA INFRAESTRUCTURA: con el bloqueo ENCENDIDO, se pasa igual", async () => {
  // El escenario se construye: un verificador que no contesta nunca, que es lo
  // que se vería si la comprobación se colgara. Con el bloqueo encendido, el
  // pedido de una persona con sesión válida TIENE que pasar.
  const a = andamio({
    exigido: true,
    verificarAppCheck: () => new Promise<{ app_id: string }>(() => {}),
  });
  const { status } = await manejarAnalyze(pedido({ [CABECERA_APP_CHECK]: "bueno" }), a.deps);

  assert.equal(status, 200, "un cuelgue nuestro NO deja a nadie fuera de su propia app");
  const alarma = a.avisos.find((av) => av.detalle["nivel"] === "alarma");
  assert.ok(alarma, "pero se grita en el log: con el bloqueo encendido, esto es la puerta abierta");
});

test("y si el verificador no está inyectado, tampoco echa a nadie", async () => {
  const a = andamio({ exigido: true });
  const { status } = await manejarAnalyze(pedido({ [CABECERA_APP_CHECK]: "bueno" }), a.deps);
  assert.equal(status, 200);
  assert.equal(a.avisos.find((av) => av.detalle["nivel"] === "alarma")?.detalle["estado"], "indeterminada");
});

test("el 401 sigue ganándole al 403: primero quién sos, después de dónde venís", async () => {
  const a = andamio({ exigido: true, verificarAppCheck: VERIFICA_MAL });
  const { status, body } = await manejarAnalyze(
    { method: "POST", body: { image_base64: "AAAABBBB", media_type: "image/jpeg" }, headers: {} },
    a.deps,
  );
  assert.equal(status, 401, "sin sesión, el 401 es la respuesta útil: dice qué hacer");
  assert.equal((body as CuerpoDeError).error.code, "no_autenticado");
});

test("el 403 NO se disfraza de 500 al pasar por el catch general", async () => {
  // `ErrorDeAppCheck` no es un `ErrorDeAnalisis`: si el catch del handler no lo
  // atrapara primero, caería en el `else` y saldría un `error_interno`. Este
  // test es el que muere si alguien mueve esa rama de lugar.
  const a = andamio({ exigido: true, verificarAppCheck: VERIFICA_OK });
  const { status, body } = await manejarAnalyze(pedido({}), a.deps);
  assert.equal(status, 403);
  assert.notEqual((body as CuerpoDeError).error.code, "error_interno");
  assert.ok(new ErrorDeAppCheck({ estado: "ausente" }) instanceof Error);
});

test("MOMENTO_FIJO y el andamiaje son los del resto de la suite", () => {
  // Un recordatorio con dientes: si el cupo cambiara de forma, este andamio
  // dejaría de parecerse al de producción y estos tests mentirían.
  assert.equal(MOMENTO_FIJO.mes, "2026-09");
  assert.deepEqual(CONSUMO_EN_CERO, { usados_mes: 0, dia: null, usados_dia: 0 });
});
