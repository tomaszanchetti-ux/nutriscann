/**
 * La validación de los umbrales de la interfaz, probada sin Firestore.
 *
 * Mismo método que en `textos.test.ts`: se parte de un documento mínimo válido y
 * se le rompe UNA cosa por vez —una clave de más, una de menos, un valor que no
 * es número— para que el test diga qué candado saltó y no "el archivo real no
 * valida".
 *
 * Al final hay tres tests contra los archivos que de verdad mandan, y el último
 * es LA RAZÓN DE SER DE ESTE ARCHIVO: verifica que el umbral de sodio publicado
 * sea EXACTAMENTE el que usa la curación. Esa era la DT-41 (a) — el número
 * estaba copiado a mano en `ItemDelPlato.tsx` y subirlo en la curación no
 * cambiaba la pantalla, así que el catálogo avisaba por alimentos que la app no
 * pintaba y nadie se enteraba.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { cargarUmbrales, interpretarUmbrales } from "./umbrales";
import type { ValorJson } from "./valores";

const RAIZ = resolve(__dirname, "..", "..", "..");
const UMBRALES_DEL_REPO = resolve(RAIZ, "config", "thresholds.json");
const CONFIG_DEL_FRONT = resolve(RAIZ, "apps", "web", "src", "lib", "config.ts");
const GENERICOS_DE_LA_CURACION = resolve(RAIZ, "kb", "curation", "genericos.dt13.json");

/** Un documento de umbrales mínimo y válido: el punto de partida de cada caso. */
function base(): Record<string, ValorJson> {
  return {
    keys: { sodium_high_mg_per_100g: { since: "test", used_in: "ItemDelPlato" } },
    thresholds: { sodium_high_mg_per_100g: 400 },
  };
}

/** El documento base con el mapa `thresholds` cambiado. */
function conUmbrales(thresholds: Record<string, ValorJson>): Record<string, ValorJson> {
  return { ...base(), thresholds };
}

test("el documento mínimo válido pasa y se lee entero", () => {
  const umbrales = interpretarUmbrales(base(), "test");
  assert.deepEqual(umbrales.claves, ["sodium_high_mg_per_100g"]);
  assert.equal(umbrales.documento["sodium_high_mg_per_100g"], 400);
});

test("solo viaja el mapa thresholds: los metadatos se quedan en el repo", () => {
  const conMetadatos = { ...base(), $schema_version: 1, updated_at: "2026-09-02", note: "…" };
  const umbrales = interpretarUmbrales(conMetadatos, "test");
  assert.deepEqual(Object.keys(umbrales.documento), ["sodium_high_mg_per_100g"]);
});

// ── La lista cerrada de claves ───────────────────────────────────────────────

test("un umbral que 'keys' no declara no se publica: sería un nombre mal tipeado", () => {
  const conTypo = conUmbrales({ sodium_high_mg_per_100g: 400, sodium_high_mg: 500 });
  assert.throws(() => interpretarUmbrales(conTypo, "test"), /sodium_high_mg/);
});

test("un umbral declarado que falta no se publica: la interfaz lo espera", () => {
  const faltante = { keys: base()["keys"], thresholds: { otro: 1 } };
  assert.throws(() => interpretarUmbrales(faltante, "test"), /sodium_high_mg_per_100g/);
});

test("sin 'keys' no hay lista cerrada contra qué chequear: no se publica", () => {
  assert.throws(
    () => interpretarUmbrales({ thresholds: base()["thresholds"] }, "test"),
    /falta 'keys'/,
  );
});

// ── Los valores ──────────────────────────────────────────────────────────────

test("un número escrito como texto no se publica: el front lo descartaría", () => {
  // Es el error fácil de cometer editando un JSON a mano, y el que más caro
  // sale: `"400"` viaja como stringValue y `comoNumero` lo ignora, así que la
  // pantalla se queda con el arranque en frío sin decir nada.
  const comoTexto = conUmbrales({ sodium_high_mg_per_100g: "400" });
  assert.throws(() => interpretarUmbrales(comoTexto, "test"), /no es un número finito/);
});

test("un valor que no es número no se publica", () => {
  const booleano = conUmbrales({ sodium_high_mg_per_100g: true });
  assert.throws(() => interpretarUmbrales(booleano, "test"), /no es un número finito/);
});

test("un 'thresholds' vacío no se publica", () => {
  assert.throws(() => interpretarUmbrales(conUmbrales({}), "test"), /falta 'thresholds'/);
});

test("un documento que no es un objeto no se publica", () => {
  assert.throws(() => interpretarUmbrales([1, 2, 3], "test"), /no es un objeto JSON/);
});

// ── Los archivos reales del repo ─────────────────────────────────────────────

test("config/thresholds.json valida y trae el umbral del contrato", () => {
  const umbrales = cargarUmbrales(UMBRALES_DEL_REPO);
  assert.deepEqual(umbrales.claves, ["sodium_high_mg_per_100g"]);
});

/**
 * El contrato con quien LEE los umbrales: `UmbralesDeLaApp` del front.
 *
 * Mismo candado que el de los textos y por el mismo motivo: un nombre que no
 * coincide no rompe nada visible, la pantalla usa el número del arranque en frío
 * y el error se degrada en silencio.
 */
test("los umbrales del repo son exactamente los que el front lee", () => {
  const fuente = readFileSync(CONFIG_DEL_FRONT, "utf8");
  const bloque = /export interface UmbralesDeLaApp \{([\s\S]*?)\n\}/.exec(fuente);
  assert.ok(
    bloque,
    `No encontré 'export interface UmbralesDeLaApp' en ${CONFIG_DEL_FRONT}. Si el front la ` +
      "movió o le cambió el nombre, hay que actualizar este test.",
  );
  const delFront = [...(bloque[1] as string).matchAll(/^\s*([a-z_][a-z_0-9]*)\s*:\s*number;/gm)]
    .map((encontrado) => encontrado[1] as string)
    .sort();
  assert.ok(delFront.length > 0, "UmbralesDeLaApp no declaró ningún umbral");

  const umbrales = cargarUmbrales(UMBRALES_DEL_REPO);
  assert.deepEqual(
    umbrales.claves,
    delFront,
    "config/thresholds.json y UmbralesDeLaApp se separaron: un umbral que el front espera y " +
      "nadie siembra se aplica desde el arranque en frío, sin error a la vista.",
  );
});

/**
 * DT-41 (a): EL UMBRAL DE SODIO ES UNO SOLO.
 *
 * La curación (`kb/curation/genericos.dt13.json`) usa `umbral_sodio_mg` para
 * decidir a qué ficha genérica le escribe su caveat de sodio; la pantalla usa
 * `sodium_high_mg_per_100g` para decidir a qué alimento le pinta el valor en
 * ámbar. Son la MISMA pregunta —¿este alimento es salado?— y por eso tienen que
 * ser el mismo número: si no, el catálogo avisa por un alimento que la app no
 * pinta, o al revés, y las dos cosas se ven raras sin que nada falle.
 *
 * Antes de esta card no había forma de enterarse: el número estaba copiado a
 * mano en `ItemDelPlato.tsx`. Ahora subirlo a 500 en la curación hace fallar
 * este test hasta que también se publique.
 */
test("el umbral de sodio publicado es el mismo que usa la curación (DT-13)", () => {
  const curacion = JSON.parse(readFileSync(GENERICOS_DE_LA_CURACION, "utf8")) as {
    umbral_sodio_mg?: unknown;
  };
  assert.equal(
    typeof curacion.umbral_sodio_mg,
    "number",
    `${GENERICOS_DE_LA_CURACION} dejó de declarar 'umbral_sodio_mg' como número`,
  );

  const umbrales = cargarUmbrales(UMBRALES_DEL_REPO);
  assert.equal(
    umbrales.documento["sodium_high_mg_per_100g"],
    curacion.umbral_sodio_mg,
    "config/thresholds.json y kb/curation/genericos.dt13.json dicen distinto qué es 'salado'. " +
      "El caveat del catálogo y el color de la pantalla saldrían de dos criterios: si la " +
      "curación cambió el umbral a propósito, hay que publicarlo en el mismo commit.",
  );
});

/**
 * Y el arranque en frío del front, con el mismo número.
 *
 * Este sí se compara byte a byte, al revés que los TEXTOS: un texto publicado
 * puede irse por delante de su arranque en frío sin que eso sea un error —para
 * eso existe—, pero un umbral que difiere significa que la app pinta distinto
 * según si Firestore contestó, y eso no es una edición: es una divergencia.
 */
test("el arranque en frío del front trae el mismo umbral que el repo", () => {
  const fuente = readFileSync(CONFIG_DEL_FRONT, "utf8");
  const bloque = /export const UMBRALES_DE_ARRANQUE: UmbralesDeLaApp = \{([\s\S]*?)\n\};/.exec(
    fuente,
  );
  assert.ok(bloque, `No encontré 'UMBRALES_DE_ARRANQUE' en ${CONFIG_DEL_FRONT}`);

  const enFrio = new Map(
    [...(bloque[1] as string).matchAll(/^\s*([a-z_][a-z_0-9]*)\s*:\s*(-?[\d.]+),$/gm)].map(
      (encontrado) => [encontrado[1] as string, Number(encontrado[2])] as const,
    ),
  );
  const umbrales = cargarUmbrales(UMBRALES_DEL_REPO);
  for (const clave of umbrales.claves) {
    assert.equal(
      enFrio.get(clave),
      umbrales.documento[clave],
      `'${clave}': el arranque en frío del front y config/thresholds.json difieren. Los dos ` +
        "cambian en el mismo commit.",
    );
  }
});
