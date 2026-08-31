/**
 * El circuito del seed de configuración contra el EMULADOR de Firestore.
 *
 * Cinco corridas encadenadas, cada una con su afirmación sobre lo que quedó
 * escrito — no sobre "corrió sin excepción":
 *
 *   1. documento inexistente  → se crea con las reglas del repo
 *   2. otra vez, igual        → 0 escrituras y la fecha NO se mueve
 *   3. otra mano agrega copy  → el seed no lo pisa y sigue en 0 escrituras
 *   4. reglas editadas a mano → se repara SOLO ese campo; copy sobrevive
 *   5. cambió la kb_version   → se escribe solo esa
 *
 * Nunca toca el proyecto real: el destino es el emulador y el proyecto es
 * `nutriscann-config-qa`, que no existe en GCP.
 *
 *   firebase emulators:start --only firestore     # en otra terminal
 *   npm --prefix kb/seed run test:emulator:config
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  AUTOR,
  COLECCION_CONFIG,
  DOCUMENTO_APP,
  CAMPO_FECHA,
  correrSeedConfig,
} from "./configuracion";
import { ClienteFirestore, crearDestino } from "./firestore";
import { cargarReglas } from "./reglas";
import type { ValorJson } from "./valores";

/** Un proyecto que no existe en GCP: si algo se escapara del emulador, no hay dónde caer. */
const PROYECTO_PRUEBA = "nutriscann-config-qa";
const REGLAS_DEL_REPO = resolve(__dirname, "..", "..", "..", "config", "recommendation_rules.json");
const HOST = process.env["FIRESTORE_EMULATOR_HOST"] ?? "localhost:8080";

/**
 * La versión se construye acá y no se lee de `kb/build`: este circuito prueba
 * el seed de configuración, no el catálogo, y depender de un archivo que otro
 * agente recompila lo volvería intermitente por un motivo ajeno.
 */
const VERSION = "2.1.0+circuito";
const VERSION_NUEVA = "2.2.0+circuito";

/** Borra los datos del proyecto de prueba. Endpoint EXCLUSIVO del emulador. */
async function vaciarEmulador(): Promise<void> {
  const respuesta = await fetch(
    `http://${HOST}/emulator/v1/projects/${PROYECTO_PRUEBA}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!respuesta.ok) {
    throw new Error(`No pude vaciar el emulador: HTTP ${respuesta.status}`);
  }
}

async function hayEmulador(): Promise<boolean> {
  try {
    const respuesta = await fetch(`http://${HOST}/`, { signal: AbortSignal.timeout(2_000) });
    return respuesta.status < 500;
  } catch {
    return false;
  }
}

test("circuito del seed de configuración contra el emulador de Firestore", async (t) => {
  if (!(await hayEmulador())) {
    throw new Error(
      `No hay emulador de Firestore escuchando en ${HOST}. ` +
        "Levantalo con: firebase emulators:start --only firestore",
    );
  }

  const reglas = cargarReglas(REGLAS_DEL_REPO);
  const destino = crearDestino({ proyecto: PROYECTO_PRUEBA, emulador: true, host: HOST });
  assert.ok(destino.esEmulador, "el destino tiene que ser el emulador");
  const cliente = new ClienteFirestore(destino);

  await vaciarEmulador();
  let fechaDeLaPrimera = "";

  await t.test("el simulacro sobre la base vacía no escribe nada", async () => {
    const simulacro = await correrSeedConfig(cliente, reglas, VERSION, { seco: true });
    assert.equal(simulacro.escrituras, 1, "el simulacro tiene que anunciar la escritura");
    assert.equal(await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_APP), null);
  });

  await t.test("corrida 1 — el documento no existe: se crea con las reglas del repo", async () => {
    const resultado = await correrSeedConfig(cliente, reglas, VERSION);
    assert.equal(resultado.escrituras, 1);
    assert.deepEqual(resultado.plan.campos, ["recommendation_rules", "kb_version", "updated_by"]);

    const documento = await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_APP);
    assert.notEqual(documento, null, "el documento no se creó");
    assert.equal(documento?.["kb_version"], VERSION);
    assert.equal(documento?.["updated_by"], AUTOR);
    assert.equal(typeof documento?.[CAMPO_FECHA], "string");
    fechaDeLaPrimera = documento?.[CAMPO_FECHA] as string;

    // Y las reglas llegaron enteras, no una versión recortada.
    const publicadas = documento?.["recommendation_rules"] as Record<string, ValorJson>;
    assert.deepEqual(publicadas, reglas.documento, "las reglas publicadas no son las del repo");
    assert.equal((publicadas["rules"] as ValorJson[]).length, reglas.ids.length);
    assert.equal((publicadas["tags"] as ValorJson[]).length, reglas.tags.length);
  });

  await t.test("corrida 2 — la misma base: CERO escrituras y la fecha no se mueve", async () => {
    const resultado = await correrSeedConfig(cliente, reglas, VERSION);
    assert.equal(resultado.escrituras, 0, "la segunda corrida escribió algo: no es idempotente");
    const documento = await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_APP);
    assert.equal(
      documento?.[CAMPO_FECHA],
      fechaDeLaPrimera,
      "updated_at se movió sin que cambiara nada",
    );
  });

  await t.test("corrida 3 — otra mano agrega copy y el tope diario: el seed no los toca", async () => {
    await cliente.escribirDocumento(
      COLECCION_CONFIG,
      DOCUMENTO_APP,
      { copy: { titulo: "NutriScann" }, max_scans_per_day: 10 },
      ["copy", "max_scans_per_day"],
    );

    const resultado = await correrSeedConfig(cliente, reglas, VERSION);
    assert.equal(resultado.escrituras, 0);
    assert.deepEqual(resultado.plan.preservados, ["copy", "max_scans_per_day"]);

    const documento = await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_APP);
    assert.deepEqual(documento?.["copy"], { titulo: "NutriScann" });
    assert.equal(documento?.["max_scans_per_day"], 10);
  });

  await t.test("corrida 4 — las reglas editadas a mano se reparan; copy sobrevive", async () => {
    const roto = { ...reglas.documento, fallback_tag: "aprobado" };
    await cliente.escribirDocumento(COLECCION_CONFIG, DOCUMENTO_APP, { recommendation_rules: roto }, [
      "recommendation_rules",
    ]);

    const resultado = await correrSeedConfig(cliente, reglas, VERSION);
    assert.equal(resultado.escrituras, 1);
    assert.deepEqual(resultado.plan.campos, ["recommendation_rules"]);

    const documento = await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_APP);
    assert.deepEqual(documento?.["recommendation_rules"], reglas.documento);
    assert.deepEqual(documento?.["copy"], { titulo: "NutriScann" }, "el merge pisó lo que no le tocaba");
    assert.equal(documento?.["max_scans_per_day"], 10);
    assert.notEqual(documento?.[CAMPO_FECHA], fechaDeLaPrimera, "la fecha tenía que moverse");
  });

  await t.test("corrida 5 — sube la kb_version: se escribe solo esa", async () => {
    const resultado = await correrSeedConfig(cliente, reglas, VERSION_NUEVA);
    assert.equal(resultado.escrituras, 1);
    assert.deepEqual(resultado.plan.campos, ["kb_version"]);

    const documento = await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_APP);
    assert.equal(documento?.["kb_version"], VERSION_NUEVA);
    assert.deepEqual(documento?.["recommendation_rules"], reglas.documento);
  });

  await t.test("corrida 6 — cerrado el circuito, vuelve a cero escrituras", async () => {
    const resultado = await correrSeedConfig(cliente, reglas, VERSION_NUEVA);
    assert.equal(resultado.escrituras, 0);
    assert.deepEqual(resultado.plan.campos, []);
  });

  await t.test("config/kb_meta no es asunto de este seed: no lo toca", async () => {
    // Los dos seeds comparten la colección config/ y escriben documentos
    // distintos. Que no se pisen es parte del contrato.
    assert.equal(await cliente.obtenerDocumento(COLECCION_CONFIG, "kb_meta"), null);
  });
});
