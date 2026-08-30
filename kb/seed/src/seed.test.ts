/**
 * La decisión del seed, probada sin Firestore.
 *
 * `planificar` es pura: recibe el catálogo y lo que hay publicado. Entonces
 * cada escenario se CONSTRUYE — un alimento nuevo, uno mutado, uno que salió
 * del catálogo — en vez de salir a buscar en 975 documentos reales uno que
 * casualmente sirva. El circuito contra el emulador está en `emulador.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { interpretarCatalogo, validarId, type Catalogo } from "./catalogo";
import type { DocumentoJson } from "./firestore";
import {
  conteosDelPlan,
  documentoDeseado,
  escriturasDelPlan,
  evaluarFreno,
  planificar,
  type Plan,
} from "./seed";
import type { ValorJson } from "./valores";

const VERSION = "1.0.0+abc123";

function alimento(id: string, extra: Record<string, ValorJson> = {}): Record<string, ValorJson> {
  return {
    id,
    names: { en: `Food ${id}`, es: null },
    per_100g: { kcal: 100, protein_g: 5, carbs_g: 15, fat_g: 2 },
    deprecated: false,
    ...extra,
  };
}

function catalogo(alimentos: Array<Record<string, ValorJson>>, version = VERSION): Catalogo {
  return interpretarCatalogo({ kb_version: version, foods: alimentos }, "test");
}

/** Lo que Firestore devolvería si el seed ya hubiera publicado estos alimentos. */
function publicados(
  alimentos: Array<Record<string, ValorJson>>,
  version = VERSION,
): Map<string, DocumentoJson> {
  const mapa = new Map<string, DocumentoJson>();
  for (const item of alimentos) {
    mapa.set(item["id"] as string, documentoDeseado(item as never, version));
  }
  return mapa;
}

function resumen(plan: Plan): Record<string, number> {
  return {
    crear: plan.crear.length,
    actualizar: plan.actualizar.length,
    sinCambio: plan.sinCambio.length,
    aDeprecar: plan.aDeprecar.length,
    yaDeprecados: plan.yaDeprecados.length,
  };
}

test("base vacía: todo se crea", () => {
  const plan = planificar(catalogo([alimento("a"), alimento("b")]), new Map());
  assert.deepEqual(resumen(plan), { crear: 2, actualizar: 0, sinCambio: 0, aDeprecar: 0, yaDeprecados: 0 });
  assert.equal(escriturasDelPlan(plan), 2);
});

test("segunda corrida sobre lo mismo: cero escrituras", () => {
  const alimentos = [alimento("a"), alimento("b")];
  const plan = planificar(catalogo(alimentos), publicados(alimentos));
  assert.deepEqual(resumen(plan), { crear: 0, actualizar: 0, sinCambio: 2, aDeprecar: 0, yaDeprecados: 0 });
  assert.equal(escriturasDelPlan(plan), 0);
});

test("un documento mutado a mano: exactamente uno se repara", () => {
  const alimentos = [alimento("a"), alimento("b")];
  const enFirestore = publicados(alimentos);
  const mutado = { ...(enFirestore.get("a") as DocumentoJson) };
  mutado["per_100g"] = { kcal: 999, protein_g: 5, carbs_g: 15, fat_g: 2 };
  enFirestore.set("a", mutado);

  const plan = planificar(catalogo(alimentos), enFirestore);
  assert.deepEqual(resumen(plan), { crear: 0, actualizar: 1, sinCambio: 1, aDeprecar: 0, yaDeprecados: 0 });
  assert.deepEqual(plan.actualizar[0]?.campos, ["per_100g"]);
});

test("un alimento que sale del catálogo se marca deprecated, no se borra", () => {
  const enFirestore = publicados([alimento("a"), alimento("b")]);
  const plan = planificar(catalogo([alimento("a")]), enFirestore);
  assert.deepEqual(resumen(plan), { crear: 0, actualizar: 0, sinCambio: 1, aDeprecar: 1, yaDeprecados: 0 });
  assert.deepEqual(plan.aDeprecar, ["b"]);
  // La garantía de que no se borra es estructural: el plan no tiene lista de
  // borrados y el cliente no tiene operación de DELETE.
  assert.ok(!("borrar" in plan));
});

test("deprecar también es idempotente: el que ya está marcado no se reescribe", () => {
  const enFirestore = publicados([alimento("a"), alimento("b")]);
  const yaMarcado = { ...(enFirestore.get("b") as DocumentoJson), deprecated: true };
  enFirestore.set("b", yaMarcado);

  const plan = planificar(catalogo([alimento("a")]), enFirestore);
  assert.deepEqual(resumen(plan), { crear: 0, actualizar: 0, sinCambio: 1, aDeprecar: 0, yaDeprecados: 1 });
  assert.equal(escriturasDelPlan(plan), 0);
});

test("reponer un alimento deprecado lo devuelve a la normalidad sin lógica especial", () => {
  const enFirestore = publicados([alimento("a")]);
  enFirestore.set("b", { ...documentoDeseado(alimento("b") as never, VERSION), deprecated: true });

  const plan = planificar(catalogo([alimento("a"), alimento("b")]), enFirestore);
  assert.deepEqual(resumen(plan), { crear: 0, actualizar: 1, sinCambio: 1, aDeprecar: 0, yaDeprecados: 0 });
  assert.deepEqual(plan.actualizar[0]?.campos, ["deprecated"]);
  assert.equal(plan.actualizar[0]?.documento["deprecated"], false);
});

test("cambiar la kb_version toca todos los documentos (la versión se estampa en cada uno)", () => {
  const alimentos = [alimento("a"), alimento("b")];
  const plan = planificar(catalogo(alimentos, "2.0.0+xyz"), publicados(alimentos, VERSION));
  assert.equal(plan.actualizar.length, 2);
  assert.deepEqual(plan.actualizar[0]?.campos, ["kb_version"]);
});

test("el seed es agnóstico del esquema: un campo nuevo viaja tal cual", () => {
  // El otro agente le está agregando alimentos y un formato nuevo de aliases:
  // el seed no puede enterarse.
  const nuevo = alimento("a", { aliases: { es: ["x"], "pt-BR": ["y"] }, confianza_alias: 0.8 });
  const plan = planificar(catalogo([nuevo]), new Map());
  assert.deepEqual(plan.crear[0]?.documento["aliases"], { es: ["x"], "pt-BR": ["y"] });
  assert.equal(plan.crear[0]?.documento["confianza_alias"], 0.8);
});

test("cada documento sale con la kb_version del catálogo", () => {
  const plan = planificar(catalogo([alimento("a")]), new Map());
  assert.equal(plan.crear[0]?.documento["kb_version"], VERSION);
});

test("los conteos describen la corrida", () => {
  const enFirestore = publicados([alimento("a"), alimento("b"), alimento("z")]);
  enFirestore.set("a", { ...(enFirestore.get("a") as DocumentoJson), per_100g: { kcal: 1 } });
  const plan = planificar(catalogo([alimento("a"), alimento("b"), alimento("c")]), enFirestore);
  assert.deepEqual(conteosDelPlan(plan, 3), {
    total: 3,
    created: 1,
    updated: 1,
    unchanged: 1,
    deprecated: 1,
  });
});

test("el plan es determinístico: mismo estado, mismo plan", () => {
  const alimentos = [alimento("c"), alimento("a"), alimento("b")];
  const primero = planificar(catalogo(alimentos), new Map());
  const segundo = planificar(catalogo([...alimentos].reverse()), new Map());
  assert.deepEqual(
    primero.crear.map((e) => e.id),
    segundo.crear.map((e) => e.id),
  );
});

test("un catálogo vacío se aborta antes de deprecar la colección entera", () => {
  assert.throws(() => catalogo([]), /no tiene alimentos/);
});

test("un id repetido se denuncia antes de escribir", () => {
  assert.throws(() => catalogo([alimento("a"), alimento("a")]), /aparece dos veces/);
});

test("los ids ilegales para Firestore se rechazan", () => {
  assert.equal(validarId("fdc-167684"), null);
  assert.ok(validarId(""));
  assert.ok(validarId("con/barra"));
  assert.ok(validarId("."));
  assert.ok(validarId("__reservado__"));
  assert.ok(validarId(42));
});

test("un catálogo sin kb_version no se publica", () => {
  assert.throws(() => interpretarCatalogo({ foods: [alimento("a")] }, "test"), /kb_version/);
});

// ── El freno de deprecaciones ────────────────────────────────────────────────
// Deprecar es lo único casi destructivo que hace el seed. Un catálogo truncado
// (un build a medias, un --catalog equivocado) depreca en masa, y hacerlo en
// silencio sería un desastre silencioso.

/** Un plan con exactamente `cuantas` deprecaciones, construido a mano. */
function planCon(deprecaciones: number): Plan {
  return {
    kb_version: VERSION,
    crear: [],
    actualizar: [],
    sinCambio: [],
    aDeprecar: Array.from({ length: deprecaciones }, (_, indice) => `id-${indice}`),
    yaDeprecados: [],
  };
}

test("una baja normal pasa: 1 alimento menos sobre 975 publicados", () => {
  const { supera, freno } = evaluarFreno(planCon(1), 975);
  assert.equal(supera, false);
  assert.equal(freno.limite, 97);
});

test("una deprecación masiva se frena: catálogo truncado de 10 sobre base de 975", () => {
  const { supera, freno } = evaluarFreno(planCon(965), 975);
  assert.equal(supera, true);
  assert.equal(freno.pedidas, 965);
  assert.equal(freno.limite, 97);
  assert.equal(freno.explicito, false);
});

test("el límite es exactamente el 10 % de lo publicado, y el borde no lo supera", () => {
  assert.equal(evaluarFreno(planCon(100), 1_000).supera, false);
  assert.equal(evaluarFreno(planCon(101), 1_000).supera, true);
});

test("--allow-deprecations autoriza la baja masiva de forma explícita", () => {
  const { supera, freno } = evaluarFreno(planCon(965), 975, 965);
  assert.equal(supera, false);
  assert.equal(freno.explicito, true);
  assert.equal(freno.limite, 965);
});

test("--allow-deprecations no es un cheque en blanco: autoriza hasta N, no más", () => {
  assert.equal(evaluarFreno(planCon(966), 975, 965).supera, true);
  // Y 0 sigue siendo una autorización válida: ninguna deprecación.
  assert.equal(evaluarFreno(planCon(1), 975, 0).supera, true);
  assert.equal(evaluarFreno(planCon(0), 975, 0).supera, false);
});

test("sobre base vacía no hay nada que deprecar y el freno no molesta", () => {
  assert.equal(evaluarFreno(planCon(0), 0).supera, false);
});
