/**
 * Identidad y cupo contra los emuladores DE VERDAD (Auth + Firestore).
 *
 * Lo que los tests puros no pueden probar y por eso está acá:
 *
 *   1. Que el circuito de Auth funciona de punta a punta: un ID token EMITIDO
 *      por el emulador, verificado por el Admin SDK de verdad —sin ningún doble
 *      ni ninguna rama de "modo local" en nuestro código—, da el uid correcto.
 *      El Admin SDK lo hace solo porque `FIREBASE_AUTH_EMULATOR_HOST` está
 *      puesta; nosotros no configuramos nada.
 *   2. Que la TRANSACCIÓN muerde: dos pedidos disparados a la vez con un solo
 *      hueco libre no pasan los dos. Eso no se demuestra con una función pura:
 *      la carrera es del almacenamiento, así que hay que correrla.
 *   3. Que el documento de consumo queda con la forma que dice el contrato, y
 *      que la devolución deshace lo que la reserva hizo.
 *
 * Cómo correrlo (los emuladores necesitan Java, ver CLAUDE.md):
 *
 *     PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emulators   # otra terminal
 *     npm --prefix functions test
 *
 * Si los emuladores no están levantados, el test se SALTEA con un aviso: no
 * miente diciendo que pasó, y no rompe la corrida de quien no los tiene arriba.
 *
 * NUNCA toca el proyecto real: las dos variables de entorno están puestas antes
 * de inicializar el Admin SDK, así que no hay credencial que alcance a GCP.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";

const HOST_FIRESTORE = process.env["FIRESTORE_EMULATOR_HOST"] ?? "localhost:8080";
const HOST_AUTH = process.env["FIREBASE_AUTH_EMULATOR_HOST"] ?? "localhost:9099";
process.env["FIRESTORE_EMULATOR_HOST"] = HOST_FIRESTORE;
process.env["FIREBASE_AUTH_EMULATOR_HOST"] = HOST_AUTH;
process.env["GCLOUD_PROJECT"] = process.env["GCLOUD_PROJECT"] ?? "nutriscann-f809e";

/* eslint-disable import/first */
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { crearVerificador, identificarDueño, usaEmuladorDeAuth } from "../auth/identidad";
import { ErrorDeAnalisis } from "../analyze/errores";
import { manejarAnalyze, type CuerpoDeAnalisis } from "../analyze/handler";
import type { CuerpoDeError } from "../analyze/errores";
import { indiceReal } from "../engine/testing";
import type { AppConfig } from "../config";
import { MODELO_VISION, type ClienteDeVision } from "../analyze/vision";
import { momentoDelCupo } from "./calendario";
import { CONSUMO_EN_CERO, type LimitesDeCupo } from "./decision";
import { devolverCredito, refDelConsumo, reservarCupo } from "./persistencia";

const PROYECTO = process.env["GCLOUD_PROJECT"] as string;
const DUEÑO = "qa-cupo-emulador";
const OTRO_DUEÑO = "qa-cupo-victima";

/** Un instante fijo: el período no depende del día en que se corra la suite. */
const FECHA_FIJA = new Date("2026-09-02T10:00:00Z");
const MOMENTO = momentoDelCupo(FECHA_FIJA);
const LIMITES: LimitesDeCupo = { por_mes: 15, por_dia: 3 };

async function responde(host: string): Promise<boolean> {
  try {
    const r = await fetch(`http://${host}/`, { signal: AbortSignal.timeout(2_000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

function baseDeDatos(): Firestore {
  if (getApps().length === 0) initializeApp({ projectId: PROYECTO });
  return getFirestore();
}

/**
 * Crea un usuario anónimo en el emulador de Auth y devuelve su ID token.
 *
 * Es la API REST de Identity Toolkit, la misma que usa el SDK del navegador. El
 * `key` es de mentira a propósito: el emulador no valida claves de API, y usar
 * una de verdad acá sería meter un secreto en un test.
 */
async function tokenDelEmulador(): Promise<{ idToken: string; uid: string }> {
  const url = `http://${HOST_AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=clave-de-mentira`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!r.ok) throw new Error(`el emulador de Auth contestó ${r.status}: ${await r.text()}`);
  const datos = (await r.json()) as { idToken: string; localId: string };
  return { idToken: datos.idToken, uid: datos.localId };
}

const CONFIG: AppConfig = {
  kb_version: null,
  max_scans_per_month: LIMITES.por_mes,
  max_scans_per_day: LIMITES.por_dia,
  copy: {},
  recommendation_rules: null,
};

function respuestaDelModelo(vision: unknown): Anthropic.Message {
  return {
    id: "msg_cupo",
    type: "message",
    role: "assistant",
    model: MODELO_VISION,
    content: [{ type: "text", text: JSON.stringify(vision), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1200,
      output_tokens: 200,
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

function clienteQueDice(respuesta: Anthropic.Message): ClienteDeVision {
  return { messages: { create: async () => respuesta } };
}

test("identidad y cupo contra los emuladores", async (t) => {
  if (!(await responde(HOST_FIRESTORE))) {
    t.skip(`no hay emulador de Firestore en ${HOST_FIRESTORE}: levantalo con npm run emulators`);
    return;
  }
  if (!(await responde(HOST_AUTH))) {
    t.skip(`no hay emulador de Auth en ${HOST_AUTH}: levantalo con npm run emulators`);
    return;
  }

  const db = baseDeDatos();
  const verificar = crearVerificador();
  const consumo = refDelConsumo(db, DUEÑO, MOMENTO.mes);

  await consumo.delete();
  await refDelConsumo(db, OTRO_DUEÑO, MOMENTO.mes).delete();
  await borrarColeccion(db.collection("owners").doc(DUEÑO).collection("scans"));
  await borrarColeccion(db.collection("owners").doc(OTRO_DUEÑO).collection("scans"));

  // -------------------------------------------------------------------------
  // Card 4.2 — el circuito de Auth, de punta a punta
  // -------------------------------------------------------------------------

  await t.test("1 — un token del emulador lo verifica el Admin SDK y da su uid", async () => {
    assert.equal(usaEmuladorDeAuth(), true, "sin la variable, el Admin SDK saldría a buscar las claves de Google");

    const { idToken, uid } = await tokenDelEmulador();
    const dueño = await identificarDueño({ authorization: `Bearer ${idToken}` }, verificar);

    assert.equal(dueño.uid, uid, "el uid que sale del token es el del usuario que lo pidió");
    assert.ok(dueño.uid.length > 0);
  });

  await t.test("2 — un token inventado NO verifica: 401, no 200", async () => {
    // El candado del emulador: acepta tokens SIN FIRMA, no cualquier cadena.
    for (const basura of ["esto.no.es", "Bearer", "eyJhbGciOiJub25lIn0.e30."]) {
      await assert.rejects(
        () => identificarDueño({ authorization: `Bearer ${basura}` }, verificar),
        (err: unknown) => err instanceof ErrorDeAnalisis && err.codigo === "no_autenticado",
        `\`${basura}\` no tendría que verificar`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // Card 4.3 — la transacción
  // -------------------------------------------------------------------------

  await t.test("3 — la reserva escribe el documento del mes con la forma del contrato", async () => {
    const veredicto = await reservarCupo(db, { owner_id: DUEÑO, momento: MOMENTO, limites: LIMITES, ahora: FECHA_FIJA });
    assert.equal(veredicto.entra, true);

    const datos = (await consumo.get()).data() as Record<string, unknown>;
    assert.equal(datos["owner_id"], DUEÑO);
    assert.equal(datos["periodo"], MOMENTO.mes);
    assert.equal(datos["zona"], "Europe/Madrid");
    assert.equal(datos["usados_mes"], 1);
    assert.equal(datos["dia"], MOMENTO.dia);
    assert.equal(datos["usados_dia"], 1);
    assert.equal(datos["limite_mes_aplicado"], 15, "con qué tope se decidió, para poder auditarlo después");
    assert.equal(datos["limite_dia_aplicado"], 3);
    assert.equal(datos["devueltos"], 0);
    assert.ok(datos["primer_uso"], "el alta estampa cuándo empezó a consumir este mes");
  });

  await t.test("4 — DOS PEDIDOS SIMULTÁNEOS no se cuelan los dos por el mismo hueco", async () => {
    // El escenario SE CONSTRUYE: se deja UN solo hueco del día y se disparan
    // tres reservas a la vez. Sin transacción —con un `increment` a ciegas— las
    // tres sumarían y el usuario terminaría con 5 de 3. Con transacción, las que
    // pierden la carrera vuelven a LEER y ven el hueco ya ocupado.
    await consumo.set(
      { owner_id: DUEÑO, periodo: MOMENTO.mes, usados_mes: 5, dia: MOMENTO.dia, usados_dia: 2, devueltos: 0 },
      { merge: true },
    );

    const resultados = await Promise.allSettled(
      [0, 1, 2].map(() =>
        reservarCupo(db, { owner_id: DUEÑO, momento: MOMENTO, limites: LIMITES, ahora: FECHA_FIJA }),
      ),
    );

    const entraron = resultados.filter((r) => r.status === "fulfilled" && r.value.entra === true);
    const rebotaron = resultados.filter((r) => r.status === "fulfilled" && r.value.entra === false);
    assert.equal(entraron.length, 1, `entró exactamente uno (entraron ${entraron.length})`);
    assert.equal(entraron.length + rebotaron.length, 3, "ninguna reserva quedó sin veredicto");

    const datos = (await consumo.get()).data() as Record<string, unknown>;
    assert.equal(datos["usados_dia"], 3, "el contador quedó EN el tope, no por encima");
    assert.equal(datos["usados_mes"], 6, "y el del mes sumó una vez, no tres");
  });

  await t.test("5 — el 4.º del día rebota, y rebotar no escribe nada", async () => {
    const antes = (await consumo.get()).data();
    const veredicto = await reservarCupo(db, { owner_id: DUEÑO, momento: MOMENTO, limites: LIMITES, ahora: FECHA_FIJA });

    assert.equal(veredicto.entra, false);
    assert.deepEqual(veredicto.entra === false && veredicto.bloqueo, {
      ambito: "dia",
      usados: 3,
      limite: 3,
      se_renueva: "2026-09-03",
    });
    assert.deepEqual((await consumo.get()).data(), antes, "un 429 no es un consumo: no ensucia el documento");
  });

  await t.test("6 — la devolución deshace la reserva y deja constancia", async () => {
    const revertido = await devolverCredito(db, { owner_id: DUEÑO, momento: MOMENTO });
    assert.deepEqual(revertido, { usados_mes: 5, dia: MOMENTO.dia, usados_dia: 2 });

    const datos = (await consumo.get()).data() as Record<string, unknown>;
    assert.equal(datos["usados_mes"], 5);
    assert.equal(datos["usados_dia"], 2);
    assert.equal(datos["devueltos"], 1, "cuántos se perdonaron: distingue «hizo 5» de «hizo 6 y uno se cayó»");

    // Y con el hueco liberado, el siguiente vuelve a entrar.
    const otra = await reservarCupo(db, { owner_id: DUEÑO, momento: MOMENTO, limites: LIMITES, ahora: FECHA_FIJA });
    assert.equal(otra.entra, true);
  });

  await t.test("7 — devolver sobre un mes sin documento no revienta: no hay nada que devolver", async () => {
    const nada = await devolverCredito(db, { owner_id: "dueño-que-no-existe", momento: MOMENTO });
    assert.equal(nada, null);
  });

  await t.test("8 — el candado del mes: con 15 gastados no entra nadie, ni con el día en cero", async () => {
    await consumo.set(
      { owner_id: DUEÑO, periodo: MOMENTO.mes, usados_mes: 15, dia: "2026-09-01", usados_dia: 0 },
      { merge: true },
    );
    const veredicto = await reservarCupo(db, { owner_id: DUEÑO, momento: MOMENTO, limites: LIMITES, ahora: FECHA_FIJA });
    assert.equal(veredicto.entra, false);
    assert.deepEqual(veredicto.entra === false && veredicto.bloqueo, {
      ambito: "mes",
      usados: 15,
      limite: 15,
      se_renueva: "2026-10-01",
    });
  });

  // -------------------------------------------------------------------------
  // Las dos cards juntas: el endpoint con un token de verdad
  // -------------------------------------------------------------------------

  await t.test("9 — el endpoint entero con un token real: el dueño es el del token", async () => {
    const { idToken, uid } = await tokenDelEmulador();
    await refDelConsumo(db, uid, MOMENTO.mes).delete();

    const deps = {
      cliente: clienteQueDice(respuestaDelModelo(PLATO)),
      indice: async () => indiceReal(),
      config: async () => ({ config: CONFIG }),
      verificarToken: verificar,
      reservarCupo: (entrada: Parameters<typeof reservarCupo>[1]) => reservarCupo(db, entrada),
      devolverCupo: async (entrada: { owner_id: string; momento: typeof MOMENTO }) => {
        await devolverCredito(db, entrada);
      },
      // La card 6.0 sumó la foto al circuito. Acá no se prueba —este archivo mide
      // el cupo— así que el almacén es un doble que no guarda nada.
      almacenDeFotos: { subir: async () => "gs://sin-bucket/sin-foto", borrar: async () => {} },
      nuevoScanId: () => "scan-del-cupo",
      fecha: () => FECHA_FIJA,
      persistir: async () => {},
      opcionesDeVision: { esperar: async () => {} },
    };

    // Con el `owner_id` de OTRO en el cuerpo: es el ataque que la card 4.2 cierra.
    const { status, body } = await manejarAnalyze(
      {
        method: "POST",
        body: { image_base64: "AAAABBBB", media_type: "image/jpeg", owner_id: OTRO_DUEÑO },
        headers: { authorization: `Bearer ${idToken}` },
      },
      deps,
    );

    assert.equal(status, 200);
    assert.equal((body as CuerpoDeAnalisis).quota.mes.usados, 1);

    const propio = await refDelConsumo(db, uid, MOMENTO.mes).get();
    assert.equal(propio.exists, true, "el cupo que se gastó es el del dueño del token");
    const ajeno = await refDelConsumo(db, OTRO_DUEÑO, MOMENTO.mes).get();
    assert.equal(ajeno.exists, false, "y NO se escribió ni un byte bajo el dueño que pedía el cuerpo");

    await refDelConsumo(db, uid, MOMENTO.mes).delete();
  });

  await t.test("10 — sin token, el endpoint es 401 y no llama al modelo", async () => {
    let llamo = false;
    const { status, body } = await manejarAnalyze(
      { method: "POST", body: { image_base64: "AAAABBBB", media_type: "image/jpeg" } },
      {
        cliente: {
          messages: {
            create: async () => {
              llamo = true;
              throw new Error("no tendría que haberse llamado");
            },
          },
        },
        indice: async () => indiceReal(),
        config: async () => ({ config: CONFIG }),
        verificarToken: verificar,
        reservarCupo: (entrada) => reservarCupo(db, entrada),
        devolverCupo: async (entrada) => {
          await devolverCredito(db, entrada);
        },
        almacenDeFotos: { subir: async () => "gs://sin-bucket/sin-foto", borrar: async () => {} },
        nuevoScanId: () => "no-deberia-existir",
        fecha: () => FECHA_FIJA,
        persistir: async () => {},
        opcionesDeVision: { esperar: async () => {} },
      },
    );

    assert.equal(status, 401);
    assert.equal((body as CuerpoDeError).error.code, "no_autenticado");
    assert.equal(llamo, false);
  });

  await consumo.delete();
  await refDelConsumo(db, OTRO_DUEÑO, MOMENTO.mes).delete();
  assert.deepEqual(CONSUMO_EN_CERO, { usados_mes: 0, dia: null, usados_dia: 0 });
});

async function borrarColeccion(
  ref: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
): Promise<void> {
  const docs = await ref.get();
  await Promise.all(docs.docs.map((d) => d.ref.delete()));
}
