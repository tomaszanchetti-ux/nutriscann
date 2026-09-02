/**
 * La decisión del seed de configuración, probada sin Firestore.
 *
 * `planificarConfig` es pura: recibe el documento publicado y el del repo, y
 * devuelve qué campos habría que escribir. Cada escenario se CONSTRUYE — un
 * documento que no existe, uno idéntico, uno con el tope diario ya puesto por
 * otra mano — en vez de mirar qué hay hoy en Firestore.
 *
 * El circuito real contra el emulador está en `emulador-config.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTOR,
  CAMPOS_DE_LA_MASCARA,
  CAMPOS_GOBERNADOS,
  CAMPO_FECHA,
  escriturasDelPlanConfig,
  planificarConfig,
} from "./configuracion";
import type { DocumentoJson } from "./firestore";
import { interpretarReglas, type Reglas } from "./reglas";
import { interpretarTextos, type Textos } from "./textos";
import type { ValorJson } from "./valores";

const VERSION = "2.1.0+abc123";

function reglas(tag = "liviana"): Reglas {
  return interpretarReglas(
    {
      tags: [tag, "balanceada"],
      evaluation: { identifiers_allowed: ["kcal"] },
      rules: [
        { id: "r1", if: "kcal <= 400", tag, priority: 55, templates: { es: "Liviana." } },
      ],
      fallback_tag: "balanceada",
      fallback_templates: { es: "Sin alertas." },
    },
    "test",
  );
}

/** Un juego de textos mínimo, construido: dos claves y los pasos de la espera. */
function textos(titulo = "Mirando tu plato"): Textos {
  return interpretarTextos(
    {
      keys: { scanning_title: {}, scanning_steps: {} },
      copy: { scanning_title: titulo, scanning_steps: "Uno…|Dos…" },
    },
    "test",
  );
}

/** Lo que Firestore devolvería si el seed ya hubiera publicado esto. */
function publicado(extra: Record<string, ValorJson> = {}, version = VERSION): DocumentoJson {
  return {
    recommendation_rules: reglas().documento,
    copy: { ...textos().documento },
    kb_version: version,
    updated_by: AUTOR,
    [CAMPO_FECHA]: "2026-08-31T10:00:00.000Z",
    ...extra,
  };
}

test("el documento no existe: se escriben los cuatro campos gobernados", () => {
  const plan = planificarConfig(null, reglas(), textos(), VERSION);
  assert.equal(plan.existe, false);
  assert.deepEqual(plan.campos, ["recommendation_rules", "copy", "kb_version", "updated_by"]);
  assert.equal(escriturasDelPlanConfig(plan), 1);
  assert.deepEqual(plan.preservados, []);
});

test("segunda corrida sobre lo mismo: cero escrituras", () => {
  const plan = planificarConfig(publicado(), reglas(), textos(), VERSION);
  assert.deepEqual(plan.campos, []);
  assert.equal(escriturasDelPlanConfig(plan), 0);
});

test("cambió la kb_version: se escribe solo ese campo", () => {
  const plan = planificarConfig(publicado({}, "2.0.0+viejo"), reglas(), textos(), VERSION);
  assert.deepEqual(plan.campos, ["kb_version"]);
});

test("cambió una regla: se escribe solo recommendation_rules", () => {
  const plan = planificarConfig(publicado(), reglas("entrenamiento"), textos(), VERSION);
  assert.deepEqual(plan.campos, ["recommendation_rules"]);
});

test("alguien editó el documento a mano en la consola: la corrida lo repara", () => {
  const aMano = publicado();
  (aMano["recommendation_rules"] as Record<string, ValorJson>)["fallback_tag"] = "aprobado";
  const plan = planificarConfig(aMano, reglas(), textos(), VERSION);
  assert.deepEqual(plan.campos, ["recommendation_rules"]);
  assert.equal(
    (plan.deseado["recommendation_rules"] as Record<string, ValorJson>)["fallback_tag"],
    "balanceada",
  );
});

test("updated_by pisado por otra mano vuelve a decir quién escribió", () => {
  const plan = planificarConfig(publicado({ updated_by: "consola" }), reglas(), textos(), VERSION);
  assert.deepEqual(plan.campos, ["updated_by"]);
  assert.equal(plan.deseado["updated_by"], AUTOR);
});

// ── Los textos de la interfaz (DT-18) ────────────────────────────────────────
// `copy` dejó de ser "de otra mano" y pasó a ser el cuarto campo gobernado: su
// fuente de verdad es config/copy.json, igual que las reglas.

test("cambió un texto: se escribe solo copy", () => {
  const plan = planificarConfig(publicado(), reglas(), textos("Analizando tu plato"), VERSION);
  assert.deepEqual(plan.campos, ["copy"]);
  assert.equal(
    (plan.deseado["copy"] as Record<string, ValorJson>)["scanning_title"],
    "Analizando tu plato",
  );
});

test("un texto editado a mano en la consola se repara con el del repo", () => {
  const aMano = publicado();
  (aMano["copy"] as Record<string, ValorJson>)["scanning_title"] = "Escaneando…";
  const plan = planificarConfig(aMano, reglas(), textos(), VERSION);
  assert.deepEqual(plan.campos, ["copy"]);
  assert.equal(
    (plan.deseado["copy"] as Record<string, ValorJson>)["scanning_title"],
    "Mirando tu plato",
  );
});

test("una clave agregada a mano NO sobrevive: copy se publica entero", () => {
  // No es un efecto colateral: la máscara nombra `copy` completo, así que el
  // repo manda sobre el mapa entero. Un texto que solo existe en la consola no
  // se puede revisar en un PR y por eso no se conserva.
  const aMano = publicado();
  (aMano["copy"] as Record<string, ValorJson>)["clave_de_la_consola"] = "texto suelto";
  const plan = planificarConfig(aMano, reglas(), textos(), VERSION);
  assert.deepEqual(plan.campos, ["copy"]);
  assert.ok(!("clave_de_la_consola" in (plan.deseado["copy"] as Record<string, ValorJson>)));
});

test("copy ya no se reporta como preservado: ahora lo gobierna el seed", () => {
  const plan = planificarConfig(publicado(), reglas(), textos(), VERSION);
  assert.ok(!plan.preservados.includes("copy"));
  assert.ok(CAMPOS_DE_LA_MASCARA.includes("copy"));
});

// ── Lo que el seed NO toca ───────────────────────────────────────────────────
// config/app sigue siendo un documento compartido: el tope diario es de otra
// mano. Que sobreviva no es una promesa, es la máscara.

test("los campos de otra mano se preservan y se reportan", () => {
  const conOtrosCampos = publicado({
    max_scans_per_day: 10,
    feature_flags: { beta: true },
  });
  const plan = planificarConfig(conOtrosCampos, reglas(), textos(), VERSION);
  assert.deepEqual(plan.campos, [], "nada que escribir");
  assert.deepEqual(plan.preservados, ["feature_flags", "max_scans_per_day"]);
});

test("un campo de otra mano nunca entra en la máscara de escritura", () => {
  const plan = planificarConfig(
    publicado({ max_scans_per_day: 10 }),
    reglas("entrenamiento"),
    textos(),
    VERSION,
  );
  assert.deepEqual(plan.campos, ["recommendation_rules"]);
  for (const campo of plan.campos) {
    assert.ok(CAMPOS_DE_LA_MASCARA.includes(campo), `${campo} no está en la máscara`);
  }
  assert.ok(!CAMPOS_DE_LA_MASCARA.includes("max_scans_per_day"));
});

test("la máscara son los campos gobernados más la fecha, y nada más", () => {
  assert.deepEqual(CAMPOS_DE_LA_MASCARA, [...CAMPOS_GOBERNADOS, CAMPO_FECHA]);
  assert.equal(CAMPOS_DE_LA_MASCARA.length, 5);
});

test("la fecha no es un campo de otra mano: no se reporta como preservada", () => {
  const plan = planificarConfig(publicado(), reglas(), textos(), VERSION);
  assert.ok(!plan.preservados.includes(CAMPO_FECHA));
});

// ── La idempotencia ──────────────────────────────────────────────────────────

test("el orden de las claves no es un cambio: Firestore no lo conserva", () => {
  const desordenado = publicado();
  const original = desordenado["recommendation_rules"] as Record<string, ValorJson>;
  desordenado["recommendation_rules"] = Object.fromEntries(
    Object.entries(original).reverse(),
  ) as ValorJson;
  const plan = planificarConfig(desordenado, reglas(), textos(), VERSION);
  assert.deepEqual(plan.campos, [], "el reordenamiento de claves disparó una escritura");
});

test("el orden de las claves de copy tampoco es un cambio", () => {
  const desordenado = publicado();
  const original = desordenado["copy"] as Record<string, ValorJson>;
  desordenado["copy"] = Object.fromEntries(Object.entries(original).reverse()) as ValorJson;
  const plan = planificarConfig(desordenado, reglas(), textos(), VERSION);
  assert.deepEqual(plan.campos, [], "reordenar los textos disparó una escritura");
});

test("el orden de un array SÍ es un cambio: las reglas se leen en orden", () => {
  const dosReglas = interpretarReglas(
    {
      tags: ["liviana", "balanceada"],
      evaluation: { identifiers_allowed: ["kcal"] },
      rules: [
        { id: "a", if: "kcal <= 400", tag: "liviana", priority: 55, templates: { es: "A." } },
        { id: "b", if: "kcal <= 200", tag: "liviana", priority: 50, templates: { es: "B." } },
      ],
      fallback_tag: "balanceada",
      fallback_templates: { es: "Sin alertas." },
    },
    "test",
  );
  const alReves = {
    ...dosReglas.documento,
    rules: [...(dosReglas.documento["rules"] as ValorJson[])].reverse(),
  };
  const plan = planificarConfig(
    {
      recommendation_rules: alReves,
      copy: { ...textos().documento },
      kb_version: VERSION,
      updated_by: AUTOR,
    },
    dosReglas,
    textos(),
    VERSION,
  );
  assert.deepEqual(plan.campos, ["recommendation_rules"]);
});
