/**
 * El cliente, en lo que se puede probar sin red: cómo se arma el destino (el
 * candado que separa emulador de producción) y cómo se escapan las rutas de
 * campo de un updateMask.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { crearDestino, nombreDocumento, rutaDeCampo } from "./firestore";

test("un nombre de campo común viaja tal cual", () => {
  assert.equal(rutaDeCampo("deprecated"), "deprecated");
  assert.equal(rutaDeCampo("kb_version"), "kb_version");
  assert.equal(rutaDeCampo("per_100g"), "per_100g");
});

test("un nombre con punto se escapa: en una máscara el punto separa niveles", () => {
  // Sin backticks, Firestore leería "el campo kcal adentro del mapa per_100g".
  assert.equal(rutaDeCampo("per_100g.kcal"), "`per_100g.kcal`");
  assert.equal(rutaDeCampo("names.es"), "`names.es`");
});

test("un nombre con guiones o backticks también se escapa", () => {
  assert.equal(rutaDeCampo("pt-BR"), "`pt-BR`");
  assert.equal(rutaDeCampo("con`backtick"), "`con\\`backtick`");
  assert.equal(rutaDeCampo("con\\barra"), "`con\\\\barra`");
  assert.equal(rutaDeCampo("1_empieza_con_numero"), "`1_empieza_con_numero`");
});

test("el destino emulador usa http local y la credencial que el emulador espera", () => {
  const destino = crearDestino({ proyecto: "p", emulador: true, host: "localhost:8080" });
  assert.equal(destino.raiz, "http://localhost:8080/v1");
  assert.equal(destino.token, "owner");
  assert.equal(destino.esEmulador, true);
});

test("el destino emulador respeta FIRESTORE_EMULATOR_HOST", () => {
  const previo = process.env["FIRESTORE_EMULATOR_HOST"];
  process.env["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:9999";
  try {
    const destino = crearDestino({ proyecto: "p", emulador: true });
    assert.equal(destino.raiz, "http://127.0.0.1:9999/v1");
  } finally {
    if (previo === undefined) delete process.env["FIRESTORE_EMULATOR_HOST"];
    else process.env["FIRESTORE_EMULATOR_HOST"] = previo;
  }
});

test("contra el proyecto real sin token no se sigue", () => {
  const previo = process.env["SEED_TOKEN"];
  delete process.env["SEED_TOKEN"];
  try {
    assert.throws(() => crearDestino({ proyecto: "p", emulador: false }), /access token/);
  } finally {
    if (previo !== undefined) process.env["SEED_TOKEN"] = previo;
  }
});

test("contra el proyecto real el host tiene que ser https: el token va en la cabecera", () => {
  // Con http plano, el access token se lee en el camino.
  assert.throws(
    () => crearDestino({ proyecto: "p", emulador: false, token: "t", host: "http://evil.local" }),
    /https/,
  );
  assert.throws(
    () => crearDestino({ proyecto: "p", emulador: false, token: "t", host: "localhost:8080" }),
    /https/,
  );
  const destino = crearDestino({
    proyecto: "p",
    emulador: false,
    token: "t",
    host: "https://firestore.googleapis.com",
  });
  assert.equal(destino.raiz, "https://firestore.googleapis.com/v1");
  assert.equal(destino.esEmulador, false);
});

test("el destino real por defecto es la API de Google", () => {
  const destino = crearDestino({ proyecto: "nutriscann-f809e", emulador: false, token: "t" });
  assert.equal(destino.raiz, "https://firestore.googleapis.com/v1");
  assert.equal(
    nombreDocumento(destino, "foods", "fdc-1"),
    "projects/nutriscann-f809e/databases/(default)/documents/foods/fdc-1",
  );
});
