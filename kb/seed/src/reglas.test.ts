/**
 * La validación del documento de reglas, probada sin Firestore.
 *
 * Cada escenario se CONSTRUYE a partir de un documento mínimo válido y se le
 * rompe UNA cosa por vez: un tag fuera de la lista cerrada, un identificador
 * inventado, un id repetido. Así el test dice exactamente qué candado saltó, en
 * vez de "el archivo real no valida".
 *
 * Al final hay un test aparte contra `config/recommendation_rules.json`, el
 * archivo que de verdad se publica: es el contrato con el repo, no un escenario.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { cargarReglas, interpretarReglas, type DocumentoReglas } from "./reglas";
import type { ValorJson } from "./valores";

const REGLAS_DEL_REPO = resolve(__dirname, "..", "..", "..", "config", "recommendation_rules.json");

/** Un documento de reglas mínimo y válido: el punto de partida de cada caso. */
function base(): DocumentoReglas {
  return {
    tags: ["liviana", "balanceada"],
    evaluation: { identifiers_allowed: ["kcal", "protein_pct"] },
    rules: [
      {
        id: "perfil-liviana",
        if: "kcal > 0 && kcal <= 400",
        tag: "liviana",
        priority: 55,
        templates: { es: "Comida liviana.", en: "A light meal." },
      },
    ],
    fallback_tag: "balanceada",
    fallback_templates: { es: "Sin alertas.", en: "No alerts." },
  };
}

/** El documento base con un cambio puntual. */
function conCambio(clave: string, valor: ValorJson): DocumentoReglas {
  return { ...base(), [clave]: valor };
}

/** El documento base con su única regla modificada en un campo. */
function conRegla(clave: string, valor: ValorJson): DocumentoReglas {
  const documento = base();
  const regla = (documento["rules"] as Array<Record<string, ValorJson>>)[0] as Record<string, ValorJson>;
  return { ...documento, rules: [{ ...regla, [clave]: valor }] };
}

test("el documento mínimo válido pasa y se lee entero", () => {
  const reglas = interpretarReglas(base(), "test");
  assert.deepEqual(reglas.tags, ["liviana", "balanceada"]);
  assert.deepEqual(reglas.ids, ["perfil-liviana"]);
  assert.equal(reglas.fallbackTag, "balanceada");
  // El documento se publica TAL CUAL: el seed no recorta ni reordena nada.
  assert.deepEqual(reglas.documento, base());
});

test("el seed publica campos que no conoce: la forma del JSON manda", () => {
  const reglas = interpretarReglas(conCambio("notes", { que_es_esto: "algo nuevo" }), "test");
  assert.deepEqual(reglas.documento["notes"], { que_es_esto: "algo nuevo" });
});

// ── La lista cerrada de tags (config/README.md §4.3) ─────────────────────────

test("una regla con un tag fuera de la lista cerrada NO se publica", () => {
  assert.throws(
    () => interpretarReglas(conRegla("tag", "alta_en_sodio"), "test"),
    /no está en la lista cerrada/,
  );
});

test("un tag mal escrito se caza aunque se parezca al bueno", () => {
  assert.throws(() => interpretarReglas(conRegla("tag", "livianas"), "test"), /livianas/);
});

test("el fallback_tag también tiene que pertenecer a la lista cerrada", () => {
  assert.throws(
    () => interpretarReglas(conCambio("fallback_tag", "equilibrada"), "test"),
    /fallback_tag 'equilibrada' no está en la lista cerrada/,
  );
});

test("sin tags no hay lista cerrada que valga: no se publica", () => {
  assert.throws(() => interpretarReglas(conCambio("tags", []), "test"), /falta 'tags'/);
});

test("un tag repetido se denuncia", () => {
  assert.throws(
    () => interpretarReglas(conCambio("tags", ["liviana", "balanceada", "liviana"]), "test"),
    /aparece dos veces/,
  );
});

// ── Los identificadores de las condiciones ───────────────────────────────────

test("una condición que nombra un identificador inventado NO se publica", () => {
  assert.throws(
    () => interpretarReglas(conRegla("if", "sodium_per_kcal >= 1"), "test"),
    /nombra 'sodium_per_kcal'/,
  );
});

test("los números y los operadores no son identificadores", () => {
  const reglas = interpretarReglas(conRegla("if", "protein_pct >= 30.5 && kcal > 0"), "test");
  assert.deepEqual(reglas.ids, ["perfil-liviana"]);
});

test("el chequeo es léxico y por eso alcanza a los dos lados de la comparación", () => {
  assert.throws(() => interpretarReglas(conRegla("if", "400 >= kcalorias"), "test"), /kcalorias/);
});

// ── La forma mínima de una regla ─────────────────────────────────────────────

test("una regla sin condición no se publica", () => {
  assert.throws(() => interpretarReglas(conRegla("if", ""), "test"), /no tiene condición/);
});

test("una regla sin priority numérica no se publica", () => {
  assert.throws(() => interpretarReglas(conRegla("priority", "55"), "test"), /'priority' numérica/);
});

test("una regla sin plantilla en español no se publica", () => {
  assert.throws(() => interpretarReglas(conRegla("templates", { en: "only english" }), "test"), /templates\.es/);
});

test("dos reglas con el mismo id se denuncian antes de escribir", () => {
  const documento = base();
  const regla = (documento["rules"] as ValorJson[])[0] as ValorJson;
  assert.throws(
    () => interpretarReglas({ ...documento, rules: [regla, regla] }, "test"),
    /id de regla 'perfil-liviana' aparece dos veces/,
  );
});

test("un set sin reglas no se publica", () => {
  assert.throws(() => interpretarReglas(conCambio("rules", []), "test"), /falta 'rules'/);
});

test("sin evaluation.identifiers_allowed no hay contra qué chequear: no se publica", () => {
  assert.throws(() => interpretarReglas(conCambio("evaluation", {}), "test"), /identifiers_allowed/);
});

test("sin fallback_templates.es no se publica", () => {
  assert.throws(() => interpretarReglas(conCambio("fallback_templates", { en: "x" }), "test"), /fallback_templates\.es/);
});

test("un documento que no es un objeto no se publica", () => {
  assert.throws(() => interpretarReglas([1, 2, 3], "test"), /no es un objeto JSON/);
});

// ── El archivo real del repo: es lo que se publica ───────────────────────────

test("config/recommendation_rules.json valida y trae el set v1 completo", () => {
  const reglas = cargarReglas(REGLAS_DEL_REPO);
  assert.equal(reglas.ids.length, 6, "el set v1 tiene 6 reglas");
  assert.deepEqual(reglas.ids, [
    "exceso-sodio-ops",
    "exceso-grasas-saturadas-ops",
    "exceso-azucares-ops",
    "perfil-recuperacion",
    "perfil-liviana",
    "perfil-entrenamiento",
  ]);
  assert.equal(reglas.tags.length, 7, "la lista cerrada tiene 7 tags");
  assert.equal(reglas.fallbackTag, "balanceada");
});

test("las prioridades del repo ponen la salud arriba del perfil", () => {
  const reglas = cargarReglas(REGLAS_DEL_REPO);
  const prioridades = (reglas.documento["rules"] as Array<Record<string, ValorJson>>).map(
    (regla) => regla["priority"] as number,
  );
  assert.deepEqual(prioridades, [100, 90, 80, 60, 55, 50]);
  // Y están en orden descendente en el archivo, que es como se leen.
  assert.deepEqual([...prioridades].sort((a, b) => b - a), prioridades);
});
