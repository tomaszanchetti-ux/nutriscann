/**
 * El circuito completo del seed contra el EMULADOR de Firestore.
 *
 * Cinco corridas encadenadas, cada una con su afirmación sobre los conteos —
 * no sobre "corrió sin excepción":
 *
 *   1. base vacía            → 975 creados
 *   2. otra vez, igual       → 0 escrituras (la idempotencia, medida)
 *   3. un documento mutado   → exactamente 1 reparado
 *   4. un alimento sacado    → ese documento queda deprecated y SIGUE EXISTIENDO
 *   5. el alimento repuesto  → vuelve a la normalidad; y la 6ª corrida da 0
 *
 * Nunca toca el proyecto real: el destino es el emulador y el proyecto es
 * `nutriscann-seed-qa`, que no existe en GCP.
 *
 *   firebase emulators:start --only firestore     # en otra terminal
 *   npm --prefix kb/seed run test:emulator
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { cargarCatalogo, interpretarCatalogo, type Catalogo } from "./catalogo";
import { ClienteFirestore, crearDestino } from "./firestore";
import {
  COLECCION_ALIMENTOS,
  COLECCION_CONFIG,
  DOCUMENTO_META,
  ErrorDeprecacionMasiva,
  correrSeed,
  documentoDeseado,
} from "./seed";

/** Un proyecto que no existe en GCP: si algo se escapara del emulador, no hay dónde caer. */
const PROYECTO_PRUEBA = "nutriscann-seed-qa";
const RUTA_CATALOGO = resolve(__dirname, "..", "..", "build", "foods.canonical.json");
const HOST = process.env["FIRESTORE_EMULATOR_HOST"] ?? "localhost:8080";

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

/** Una copia del catálogo con otra lista de alimentos, escrita a un archivo temporal. */
function copiaDelCatalogo(
  catalogo: Catalogo,
  foods: Catalogo["foods"],
): { catalogo: Catalogo; ruta: string } {
  const crudo = { ...catalogo.encabezado, foods };
  const carpeta = mkdtempSync(join(tmpdir(), "nutriscann-seed-"));
  const ruta = join(carpeta, "foods.canonical.json");
  writeFileSync(ruta, JSON.stringify(crudo), "utf8");
  return { catalogo: interpretarCatalogo(crudo, ruta), ruta };
}

/** Una copia del catálogo sin un alimento. */
function catalogoSin(catalogo: Catalogo, id: string): { catalogo: Catalogo; ruta: string } {
  const foods = catalogo.foods.filter((alimento) => alimento.id !== id);
  assert.equal(foods.length, catalogo.foods.length - 1, `el alimento ${id} no estaba en el catálogo`);
  return copiaDelCatalogo(catalogo, foods);
}

test("circuito del seed contra el emulador de Firestore", async (t) => {
  if (!(await hayEmulador())) {
    throw new Error(
      `No hay emulador de Firestore escuchando en ${HOST}. ` +
        "Levantalo con: firebase emulators:start --only firestore",
    );
  }

  const catalogo = cargarCatalogo(RUTA_CATALOGO);
  const total = catalogo.foods.length;
  const destino = crearDestino({ proyecto: PROYECTO_PRUEBA, emulador: true, host: HOST });
  assert.ok(destino.esEmulador, "el destino tiene que ser el emulador");
  const cliente = new ClienteFirestore(destino);

  await vaciarEmulador();

  const cobaya = catalogo.foods[0]?.id as string;
  const sacado = catalogo.foods[Math.floor(total / 2)]?.id as string;
  const documentoOriginalSacado = documentoDeseado(
    catalogo.foods.find((alimento) => alimento.id === sacado) as never,
    catalogo.kb_version,
  );

  await t.test("el simulacro sobre base vacía dice la verdad sobre kb_meta", async () => {
    const simulacro = await correrSeed(cliente, catalogo, { seco: true });
    assert.equal(simulacro.escrituras, total);
    assert.equal(simulacro.metaSeEscribiria, true, "el simulacro tiene que anunciar el kb_meta");
    assert.equal(simulacro.metaEscrita, false, "un simulacro no escribe");
    assert.equal(await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_META), null);
    assert.equal((await cliente.listarColeccion(COLECCION_ALIMENTOS)).size, 0);
  });

  await t.test(`corrida 1 — base vacía: ${total} creados`, async () => {
    const resultado = await correrSeed(cliente, catalogo);
    assert.deepEqual(resultado.conteos, {
      total,
      created: total,
      updated: 0,
      unchanged: 0,
      deprecated: 0,
    });
    assert.equal(resultado.escrituras, total);
    assert.equal(resultado.metaEscrita, true);

    const publicados = await cliente.listarColeccion(COLECCION_ALIMENTOS);
    assert.equal(publicados.size, total, "los documentos publicados no son los del catálogo");
    const meta = await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_META);
    assert.equal(meta?.["kb_version"], catalogo.kb_version);
    assert.deepEqual(meta?.["counts"], { total, created: total, updated: 0, unchanged: 0, deprecated: 0 });
    assert.equal(typeof meta?.["seeded_at"], "string");
  });

  await t.test("corrida 2 — la misma base: CERO escrituras", async () => {
    const resultado = await correrSeed(cliente, catalogo);
    assert.deepEqual(resultado.conteos, {
      total,
      created: 0,
      updated: 0,
      unchanged: total,
      deprecated: 0,
    });
    assert.equal(resultado.escrituras, 0, "la segunda corrida escribió algo: no es idempotente");
    assert.equal(resultado.metaEscrita, false, "kb_meta se reescribió sin que cambiara nada");
    assert.equal(resultado.metaSeEscribiria, false);
  });

  await t.test("un simulacro sobre un documento mutado reporta el arreglo y no escribe", async () => {
    await cliente.escribirDocumento(COLECCION_ALIMENTOS, cobaya, { per_100g: { kcal: 99_999 } }, ["per_100g"]);
    const simulacro = await correrSeed(cliente, catalogo, { seco: true });
    assert.equal(simulacro.conteos.updated, 1);
    assert.equal(simulacro.plan.actualizar[0]?.id, cobaya);
    assert.deepEqual(simulacro.plan.actualizar[0]?.campos, ["per_100g"]);

    const documento = await cliente.obtenerDocumento(COLECCION_ALIMENTOS, cobaya);
    assert.deepEqual(documento?.["per_100g"], { kcal: 99_999 }, "el simulacro escribió");
  });

  await t.test("corrida 3 — un documento mutado a mano: exactamente 1 reparado", async () => {
    const resultado = await correrSeed(cliente, catalogo);
    assert.deepEqual(resultado.conteos, {
      total,
      created: 0,
      updated: 1,
      unchanged: total - 1,
      deprecated: 0,
    });
    const documento = await cliente.obtenerDocumento(COLECCION_ALIMENTOS, cobaya);
    const esperado = documentoDeseado(catalogo.foods[0] as never, catalogo.kb_version);
    assert.deepEqual(documento, esperado, "el documento no quedó como el catálogo");
  });

  await t.test(`corrida 4 — ${sacado} sale del catálogo: se marca deprecated, NO se borra`, async () => {
    const recortado = catalogoSin(catalogo, sacado);
    const resultado = await correrSeed(cliente, recortado.catalogo);
    assert.deepEqual(resultado.conteos, {
      total: total - 1,
      created: 0,
      updated: 0,
      unchanged: total - 1,
      deprecated: 1,
    });
    assert.deepEqual(resultado.plan.aDeprecar, [sacado]);

    const documento = await cliente.obtenerDocumento(COLECCION_ALIMENTOS, sacado);
    assert.notEqual(documento, null, "el documento se borró: eso está prohibido");
    assert.equal(documento?.["deprecated"], true);
    // El merge no pisó nada más: el resto del documento sigue igual.
    assert.deepEqual(
      { ...documento, deprecated: false },
      documentoOriginalSacado,
      "la deprecación pisó campos que no le tocaban",
    );

    const publicados = await cliente.listarColeccion(COLECCION_ALIMENTOS);
    assert.equal(publicados.size, total, "la colección perdió documentos");

    // Y volver a correr el catálogo recortado no vuelve a escribir la marca.
    const otraVez = await correrSeed(cliente, recortado.catalogo);
    assert.equal(otraVez.escrituras, 0);
    assert.deepEqual(otraVez.plan.yaDeprecados, [sacado]);
  });

  await t.test("corrida 5 — el alimento vuelve al catálogo: vuelve a la normalidad", async () => {
    const resultado = await correrSeed(cliente, catalogo);
    assert.deepEqual(resultado.conteos, {
      total,
      created: 0,
      updated: 1,
      unchanged: total - 1,
      deprecated: 0,
    });
    assert.deepEqual(resultado.plan.actualizar[0]?.id, sacado);
    const documento = await cliente.obtenerDocumento(COLECCION_ALIMENTOS, sacado);
    assert.deepEqual(documento, documentoOriginalSacado);
  });

  await t.test("corrida 6 — cerrado el circuito, vuelve a cero escrituras", async () => {
    const resultado = await correrSeed(cliente, catalogo);
    assert.equal(resultado.escrituras, 0);
    assert.equal(resultado.conteos.unchanged, total);
  });

  await t.test("un catálogo truncado NO depreca la base: la corrida aborta sin escribir", async () => {
    // El escenario del build a medias: 10 alimentos donde había cientos.
    const truncado = copiaDelCatalogo(catalogo, catalogo.foods.slice(0, 10));

    // El simulacro lo anuncia sin abortar: para eso está.
    const simulacro = await correrSeed(cliente, truncado.catalogo, { seco: true });
    assert.equal(simulacro.frenoSuperado, true);
    assert.equal(simulacro.freno.pedidas, total - 10);
    assert.equal(simulacro.freno.limite, Math.floor(total * 0.1));

    // La corrida real aborta ANTES de escribir.
    await assert.rejects(
      () => correrSeed(cliente, truncado.catalogo),
      (error: Error) => {
        assert.ok(error instanceof ErrorDeprecacionMasiva);
        assert.match(error.message, /No se escribió NADA/);
        assert.match(error.message, /--allow-deprecations/);
        return true;
      },
    );

    // Y la base quedó intacta: ni un documento deprecado de más.
    const publicados = await cliente.listarColeccion(COLECCION_ALIMENTOS);
    assert.equal(publicados.size, total);
    const deprecados = [...publicados.values()].filter((documento) => documento["deprecated"] === true);
    assert.deepEqual(deprecados, [], "el freno saltó pero igual se deprecó algo");

    // Con la autorización explícita, la misma corrida procede.
    const autorizado = await correrSeed(cliente, truncado.catalogo, {
      seco: true,
      maximoDeprecaciones: total - 10,
    });
    assert.equal(autorizado.frenoSuperado, false);
  });
});
