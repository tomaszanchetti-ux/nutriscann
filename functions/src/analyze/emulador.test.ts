/**
 * El circuito completo contra el EMULADOR de Firestore.
 *
 * Lo que los tests puros no pueden probar: que el catálogo se lee de verdad, que
 * el scan queda escrito con la forma que dice el contrato, y que la cola de
 * curación DEDUPLICA ENTRE ESCANEOS —el mismo término dos veces son un documento
 * con `veces: 2`, no dos documentos—. Eso no se demuestra con un espía: se
 * demuestra volviendo a leer lo que quedó.
 *
 * Cómo correrlo (el emulador necesita Java, ver CLAUDE.md):
 *
 *     PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emulators   # otra terminal
 *     npm run kb:seed:local                                          # sembrar
 *     npm --prefix functions test
 *
 * Si el emulador no está levantado, el test se SALTEA con un aviso: no miente
 * diciendo que pasó, y tampoco rompe la corrida de quien no lo tiene arriba.
 *
 * NUNCA toca el proyecto real: `FIRESTORE_EMULATOR_HOST` está puesto antes de
 * inicializar el Admin SDK, así que no hay credencial que alcance a GCP.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";

const HOST = process.env["FIRESTORE_EMULATOR_HOST"] ?? "localhost:8080";
process.env["FIRESTORE_EMULATOR_HOST"] = HOST;
process.env["GCLOUD_PROJECT"] = process.env["GCLOUD_PROJECT"] ?? "nutriscann-f809e";

/* eslint-disable import/first */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { cargarIndice } from "./catalogo";
import { manejarAnalyze, type CuerpoDeAnalisis, type DatosAPersistir } from "./handler";
import { guardarScan, registrarCuracion } from "./persistencia";
import { MODELO_VISION, type ClienteDeVision } from "./vision";
import type { AppConfig } from "../config";

const PROYECTO = process.env["GCLOUD_PROJECT"] as string;
const DUEÑO = "qa-emulador";

async function hayEmulador(): Promise<boolean> {
  try {
    const r = await fetch(`http://${HOST}/`, { signal: AbortSignal.timeout(2_000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

function baseDeDatos(): Firestore {
  if (getApps().length === 0) initializeApp({ projectId: PROYECTO });
  return getFirestore();
}

function respuestaDelModelo(vision: unknown): Anthropic.Message {
  return {
    id: "msg_emulador",
    type: "message",
    role: "assistant",
    model: MODELO_VISION,
    content: [{ type: "text", text: JSON.stringify(vision), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1400,
      output_tokens: 260,
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

const CONFIG: AppConfig = {
  kb_version: null,
  max_scans_per_day: 3,
  copy: {},
  recommendation_rules: null,
};

test("circuito foto → motor → Firestore contra el emulador", async (t) => {
  if (!(await hayEmulador())) {
    t.skip(`no hay emulador de Firestore en ${HOST}: levantalo con npm run emulators`);
    return;
  }

  const db = baseDeDatos();

  const cuantas = (await db.collection("foods").count().get()).data().count;
  if (cuantas === 0) {
    t.skip("el emulador está vacío: sembralo con `npm run kb:seed:local`");
    return;
  }

  // Base limpia SOLO de lo nuestro: el catálogo sembrado no se toca.
  await borrarColeccion(db.collection("owners").doc(DUEÑO).collection("scans"));
  await borrarColeccion(db.collection("curation_queue"));

  let indice: Awaited<ReturnType<typeof cargarIndice>> | null = null;

  await t.test("1 — el catálogo se lee de Firestore y arma el índice", async () => {
    indice = await cargarIndice(db);
    assert.ok(indice.kb_version.length > 0, "el scan necesita la kb_version para ser trazable");
    assert.ok(indice.exactoEn.size > 900, `el índice trajo ${indice.exactoEn.size} términos en inglés`);
    assert.deepEqual(indice.colisiones, [], "el catálogo publicado no tiene colisiones de vocabulario");
  });

  const deps = (vision: unknown, scan_id: string): Parameters<typeof manejarAnalyze>[1] => ({
    cliente: clienteQueDice(respuestaDelModelo(vision)),
    indice: async () => {
      if (indice === null) throw new Error("el índice no se cargó");
      return indice;
    },
    config: async () => ({ config: CONFIG }),
    nuevoScanId: () => scan_id,
    persistir: async (datos: DatosAPersistir) => {
      await guardarScan(db, { ...datos, owner_id: DUEÑO });
      await registrarCuracion(db, datos.resultado.curation_candidates, {
        scan_id: datos.scan_id,
        owner_id: DUEÑO,
      });
    },
    opcionesDeVision: { esperar: async () => {} },
  });

  const PLATO = {
    is_food: true,
    items: [
      { food_en: "Apple, raw", grams: 150, confidence: 0.92 },
      { food_en: "Rice, white, cooked", grams: 180, confidence: 0.85 },
      { food_en: "zzqx invented food", grams: 90, confidence: 0.7 },
    ],
  };

  await t.test("2 — el scan queda escrito con la forma del contrato", async () => {
    const { status, body } = await manejarAnalyze(
      { method: "POST", body: { image_base64: "AAAABBBB", media_type: "image/jpeg", owner_id: DUEÑO } },
      deps(PLATO, "scan-1"),
    );
    const cuerpo = body as CuerpoDeAnalisis;
    assert.equal(status, 200);
    assert.equal(cuerpo.persisted, true, "si esto es false, la escritura falló y el test siguiente miente");

    const doc = await db.collection("owners").doc(DUEÑO).collection("scans").doc("scan-1").get();
    assert.equal(doc.exists, true);
    const datos = doc.data() as Record<string, unknown>;

    assert.equal(datos["status"], "done");
    assert.equal(datos["is_food"], true);
    assert.equal(datos["owner_id"], DUEÑO);
    assert.equal(datos["image_ref"], null);
    assert.equal(datos["kb_version"], indice?.kb_version);
    assert.ok(datos["created_at"], "el expediente lleva cuándo se hizo");

    // Los números que quedaron guardados son los que se devolvieron: un
    // expediente que no coincide con lo que vio el usuario no sirve de nada.
    assert.deepEqual(datos["items"], JSON.parse(JSON.stringify(cuerpo.items)));
    assert.deepEqual(datos["totals"], JSON.parse(JSON.stringify(cuerpo.totals)));

    const meta = datos["meta"] as Record<string, unknown>;
    assert.equal(meta["model"], MODELO_VISION);
    assert.equal(meta["tokens_in"], 1400);
    assert.equal(meta["tokens_out"], 260);
    assert.equal(typeof meta["latency_ms"], "number");
  });

  await t.test("3 — el término sin ficha entró a la cola una sola vez", async () => {
    const cola = await db.collection("curation_queue").get();
    assert.equal(cola.size, 1, "solo el alimento inventado; la manzana y el arroz están en el catálogo");

    const doc = cola.docs[0];
    assert.equal(doc?.id, "zzqx-invented-food");
    const datos = doc?.data() as Record<string, unknown>;
    assert.equal(datos["veces"], 1);
    assert.equal(datos["motivo"], "sin_match");
    assert.equal(datos["last_scan_id"], "scan-1");
    assert.ok(datos["first_seen"], "el alta estampa cuándo se vio por primera vez");
  });

  await t.test("4 — el MISMO término en otro escaneo no crea un documento nuevo: cuenta", async () => {
    // Es la diferencia entre una cola de curación y un basurero: un término que
    // aparece dos veces es más urgente que uno que apareció una, y eso solo se
    // sabe si el segundo escaneo suma en vez de duplicar.
    const antes = (await db.collection("curation_queue").doc("zzqx-invented-food").get()).data();

    await manejarAnalyze(
      { method: "POST", body: { image_base64: "AAAABBBB", media_type: "image/jpeg", owner_id: DUEÑO } },
      deps(PLATO, "scan-2"),
    );

    const cola = await db.collection("curation_queue").get();
    assert.equal(cola.size, 1, "sigue habiendo UN documento");

    const despues = cola.docs[0]?.data() as Record<string, unknown>;
    assert.equal(despues["veces"], 2, "la segunda aparición suma");
    assert.equal(despues["last_scan_id"], "scan-2", "el último escaneo que lo vio");
    assert.deepEqual(despues["first_seen"], antes?.["first_seen"], "el alta no se pisa");
  });

  await t.test("5 — la foto que no es comida no deja rastro", async () => {
    const scansAntes = (await db.collection("owners").doc(DUEÑO).collection("scans").get()).size;

    const { status, body } = await manejarAnalyze(
      { method: "POST", body: { image_base64: "AAAABBBB", media_type: "image/jpeg", owner_id: DUEÑO } },
      deps({ is_food: false, items: [] }, "scan-3"),
    );

    assert.equal(status, 200);
    assert.equal((body as CuerpoDeAnalisis).scan_id, null);
    const scansDespues = (await db.collection("owners").doc(DUEÑO).collection("scans").get()).size;
    assert.equal(scansDespues, scansAntes, "no se persiste el scan de una foto que no es comida");
  });

  await t.test("6 — un catálogo a medias es un 503, no un análisis vacío", async () => {
    // El escenario SE CONSTRUYE: una base sin `foods` sembrada, en otro proyecto
    // del mismo emulador. Buscarlo en la base sembrada sería imposible, y sin
    // este candado un seed cortado por la mitad devolvería un reporte en el que
    // todo sale "no catalogado" — con la cola llenándose de comida normal.
    const vacia = getFirestore(initializeApp({ projectId: "nutriscann-sin-catalogo" }, "sin-catalogo"));
    await assert.rejects(
      () => cargarIndice(vacia),
      (err: unknown) => {
        assert.match(String(err), /catalogo_no_disponible/);
        return true;
      },
    );
  });

  await borrarColeccion(db.collection("owners").doc(DUEÑO).collection("scans"));
  await borrarColeccion(db.collection("curation_queue"));
});

function clienteQueDice(respuesta: Anthropic.Message): ClienteDeVision {
  return { messages: { create: async () => respuesta } };
}

async function borrarColeccion(
  ref: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>,
): Promise<void> {
  const docs = await ref.get();
  await Promise.all(docs.docs.map((d) => d.ref.delete()));
}
