/**
 * La validación de los textos de la interfaz, probada sin Firestore.
 *
 * Mismo método que en `reglas.test.ts`: se parte de un documento mínimo válido
 * y se le rompe UNA cosa por vez —una clave de más, una de menos, un texto
 * vacío, un tramo vacío entre pasos— para que el test diga qué candado saltó y
 * no "el archivo real no valida".
 *
 * Al final hay dos tests contra el archivo que de verdad se publica
 * (`config/copy.json`): uno sobre su contenido y otro, el más importante de
 * este archivo, que lo confronta con la interfaz que lo LEE. Ese último es el
 * que hace que la DT-18 no se vuelva a abrir sola: si el front suma un texto y
 * nadie lo siembra, se entera acá y no en la pantalla de un usuario.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { cargarTextos, interpretarTextos } from "./textos";
import type { ValorJson } from "./valores";

const RAIZ = resolve(__dirname, "..", "..", "..");
const TEXTOS_DEL_REPO = resolve(RAIZ, "config", "copy.json");
const CONFIG_DEL_FRONT = resolve(RAIZ, "apps", "web", "src", "lib", "config.ts");

/** Un documento de textos mínimo y válido: el punto de partida de cada caso. */
function base(): Record<string, ValorJson> {
  return {
    keys: {
      capture_prompt: { since: "fase-0", used_in: "PantallaCaptura" },
      scanning_steps: { since: "fase-0", used_in: "PantallaEscaneo" },
    },
    copy: {
      capture_prompt: "¿Qué estás comiendo?",
      scanning_steps: "Uno…|Dos…|Tres…",
    },
  };
}

/** El documento base con el mapa `copy` cambiado. */
function conCopy(copy: Record<string, ValorJson>): Record<string, ValorJson> {
  return { ...base(), copy };
}

test("el documento mínimo válido pasa y se lee entero", () => {
  const textos = interpretarTextos(base(), "test");
  assert.deepEqual(textos.claves, ["capture_prompt", "scanning_steps"]);
  assert.equal(textos.documento["capture_prompt"], "¿Qué estás comiendo?");
  assert.deepEqual(textos.pasos, ["Uno…", "Dos…", "Tres…"]);
});

test("solo viaja el mapa copy: los metadatos se quedan en el repo", () => {
  // config/app.copy es un mapa de texto a texto. Un `$schema_version` numérico
  // adentro rompería el contrato con functions/src/config.ts y con el front.
  const conMetadatos = { ...base(), $schema_version: 1, updated_at: "2026-09-01", note: "…" };
  const textos = interpretarTextos(conMetadatos, "test");
  assert.deepEqual(Object.keys(textos.documento).sort(), ["capture_prompt", "scanning_steps"]);
  for (const valor of Object.values(textos.documento)) {
    assert.equal(typeof valor, "string");
  }
});

// ── La lista cerrada de claves ───────────────────────────────────────────────

test("una clave que 'keys' no declara no se publica: sería un nombre mal tipeado", () => {
  const conTypo = conCopy({
    capture_prompt: "¿Qué estás comiendo?",
    scanning_steps: "Uno…",
    capture_ctaa: "Sacar foto del plato",
  });
  assert.throws(() => interpretarTextos(conTypo, "test"), /capture_ctaa/);
});

test("una clave declarada que falta en copy no se publica: la interfaz la espera", () => {
  const faltante = conCopy({ capture_prompt: "¿Qué estás comiendo?" });
  assert.throws(() => interpretarTextos(faltante, "test"), /scanning_steps/);
});

test("sin 'keys' no hay lista cerrada contra qué chequear: no se publica", () => {
  const sinKeys = { copy: base()["copy"] };
  assert.throws(() => interpretarTextos(sinKeys, "test"), /falta 'keys'/);
});

// ── Los textos ───────────────────────────────────────────────────────────────

test("un texto vacío no se publica: no borra nada, tapa el cambio", () => {
  const vacio = conCopy({ capture_prompt: "   ", scanning_steps: "Uno…" });
  assert.throws(() => interpretarTextos(vacio, "test"), /copy\['capture_prompt'\] está vacío/);
});

test("un texto que no es texto no se publica", () => {
  const numero = conCopy({ capture_prompt: 42, scanning_steps: "Uno…" });
  assert.throws(() => interpretarTextos(numero, "test"), /no es un texto/);
});

test("un 'copy' vacío no se publica", () => {
  assert.throws(() => interpretarTextos(conCopy({}), "test"), /falta 'copy'/);
});

test("un documento que no es un objeto no se publica", () => {
  assert.throws(() => interpretarTextos([1, 2, 3], "test"), /no es un objeto JSON/);
});

// ── Los pasos de la espera ───────────────────────────────────────────────────

test("un tramo vacío entre pasos no se publica: el front lo descarta sin avisar", () => {
  const roto = conCopy({ capture_prompt: "x", scanning_steps: "Uno…||Tres…" });
  assert.throws(() => interpretarTextos(roto, "test"), /tramo vacío/);
});

test("los pasos se parten y se recortan igual que en el front", () => {
  const conEspacios = conCopy({ capture_prompt: "x", scanning_steps: " Uno… | Dos… " });
  const textos = interpretarTextos(conEspacios, "test");
  assert.deepEqual(textos.pasos, ["Uno…", "Dos…"]);
  // Pero lo que se PUBLICA es el string tal cual: recortar es cosa del lector.
  assert.equal(textos.documento["scanning_steps"], " Uno… | Dos… ");
});

// ── El archivo real del repo: es lo que se publica ───────────────────────────

/**
 * Las 64 claves del contrato, al 02/09/2026.
 *
 * Eran 18 (DT-18, card 2.5). La card 3.1 sumó las 29 de la DT-22: los textos
 * que el usuario leía y estaban escritos adentro de los componentes del front
 * —los cinco sellos de match con su explicación, los nombres de los
 * nutrientes, las etiquetas de la card de ítem y los títulos de los dos
 * recuadros del reporte—. Cambiar cualquiera de esos exigía desplegar la PWA.
 * La WS08 sumó las 17 `v2_*` de la sección «Lo que llega después» de la
 * vitrina: nacieron ya gobernadas en vez de nacer en deuda.
 *
 * La lista está en orden alfabético porque `cargarTextos` devuelve las claves
 * ordenadas: es el orden del contrato, no el del archivo.
 */
const CLAVES_ESPERADAS = [
  "capture_cta",
  "capture_help",
  "capture_prompt",
  "disclaimer",
  "donut_detail_title",
  "donut_rest",
  "donut_unexplained",
  "error_cta",
  "error_network",
  "error_not_food",
  "error_title",
  "error_unexpected",
  "error_unreadable",
  "item_confidence_label",
  "item_generic_badge",
  "item_generic_note",
  "item_source_label",
  "match_alias",
  "match_alias_ayuda",
  "match_compuesto",
  "match_compuesto_ayuda",
  "match_difuso",
  "match_difuso_ayuda",
  "match_exacto",
  "match_exacto_ayuda",
  "match_no_catalogado",
  "match_no_catalogado_ayuda",
  "not_food_title",
  "nutrient_carbs",
  "nutrient_fat",
  "nutrient_fiber",
  "nutrient_no_data",
  "nutrient_protein",
  "nutrient_sat_fat",
  "nutrient_sodium",
  "nutrient_sugars",
  "report_cta",
  "report_items_title",
  "report_kcal_label",
  "report_macros_title",
  "report_no_totals_body",
  "report_no_totals_title",
  "report_others_title",
  "report_partial_title",
  "report_weight_label",
  "scanning_steps",
  "scanning_title",
  "v2_badge",
  "v2_cta",
  "v2_gold_punto_1",
  "v2_gold_punto_2",
  "v2_gold_punto_3",
  "v2_gold_resumen",
  "v2_gold_titulo",
  "v2_gold_vinculo",
  "v2_intro",
  "v2_nota",
  "v2_premium_punto_1",
  "v2_premium_punto_2",
  "v2_premium_punto_3",
  "v2_premium_resumen",
  "v2_premium_titulo",
  "v2_premium_vinculo",
  "v2_title",
];

test("config/copy.json valida y trae las 64 claves del contrato", () => {
  const textos = cargarTextos(TEXTOS_DEL_REPO);
  assert.deepEqual(textos.claves, CLAVES_ESPERADAS);
  assert.equal(textos.pasos.length, 3, "la pantalla de espera muestra tres pasos");
});

/**
 * El contrato con quien LEE los textos.
 *
 * `apps/web/src/lib/config.ts` declara la interfaz `CopyDeLaApp` y lee cada
 * clave POR SU NOMBRE; `scanning_steps` va aparte porque no es un texto suelto
 * sino los pasos separados por `|`. Si las dos listas se separan, no se rompe
 * nada visible: la pantalla muestra el arranque en frío y nadie se entera. Por
 * eso se comparan acá, leyendo el archivo del front en vez de importarlo —
 * `kb/seed` es un paquete aparte y no compila código de la web.
 */
test("las claves del repo son exactamente las que el front lee", () => {
  const fuente = readFileSync(CONFIG_DEL_FRONT, "utf8");
  const bloque = /export interface CopyDeLaApp \{([\s\S]*?)\n\}/.exec(fuente);
  assert.ok(
    bloque,
    `No encontré 'export interface CopyDeLaApp' en ${CONFIG_DEL_FRONT}. Si el front la ` +
      "movió o le cambió el nombre, hay que actualizar este test: es el único lugar donde " +
      "se verifica que los textos sembrados sean los que la interfaz busca.",
  );
  const delFront = [...(bloque[1] as string).matchAll(/^\s*([a-z_][a-z_0-9]*)\s*:\s*string;/gm)].map(
    (encontrado) => encontrado[1] as string,
  );
  assert.ok(delFront.length > 0, "CopyDeLaApp no declaró ningún campo de texto");

  // `scanning_steps` no es un campo de CopyDeLaApp —el front lo parte en una
  // lista— pero SÍ es una clave del mapa publicado. Es la única excepción.
  const esperadas = [...delFront, "scanning_steps"].sort();
  const textos = cargarTextos(TEXTOS_DEL_REPO);
  assert.deepEqual(
    textos.claves,
    esperadas,
    "config/copy.json y CopyDeLaApp se separaron: un texto que el front espera y nadie " +
      "siembra se muestra desde el arranque en frío, sin error a la vista.",
  );
});

// A propósito NO se compara el TEXTO de cada clave con el del arranque en frío
// del front, aunque hoy (01/09/2026) sean idénticos. Atarlos obligaría a tocar
// apps/web para cambiar una palabra, que es exactamente lo que la regla dura
// n.º 1 quiere evitar: el texto se edita en config/copy.json, se siembra y
// listo. El arranque en frío es la red de contención de "Firestore no contesta"
// y puede quedar atrás sin que eso sea un error.
