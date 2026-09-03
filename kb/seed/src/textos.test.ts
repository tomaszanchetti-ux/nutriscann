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
const ERRORES_DEL_BACKEND = resolve(RAIZ, "functions", "src", "analyze", "errores.ts");

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
 * Las 114 claves del contrato, al 03/09/2026.
 *
 * Eran 18 (DT-18, card 2.5). La card 3.1 sumó las 29 de la DT-22: los textos
 * que el usuario leía y estaban escritos adentro de los componentes del front.
 * La WS08 sumó las 17 `v2_` de la sección «Funcionalidades Premium», quitó tres
 * en el Q/A de Tomás y sumó las tres `install_*` del aviso de instalación de la
 * PWA. Eso dejó 64.
 *
 * Y LA CARD 4.5 LAS LLEVÓ A 106, en tres movimientos:
 *
 *   +8  LOS ERRORES DEL BACKEND (DT-40 a). `error_bad_request`,
 *       `error_bad_image`, `error_image_too_big`, `error_model_unavailable`,
 *       `error_catalog_unavailable`, `error_internal`, `error_unauthenticated` y
 *       `error_quota_exhausted`. Son las PRIMERAS claves de esta lista que el
 *       FRONT NO LEE: las lee `functions/src/analyze/errores.ts`. Por eso el
 *       contrato de más abajo dejó de ser "los campos de CopyDeLaApp" y pasó a
 *       ser la UNIÓN de los dos lectores.
 *   +39 LA COSECHA LOCAL DEL FRONT (DT-41 b): `capture_tagline`,
 *       `report_cta_premium` y las 37 de la pantalla de planes.
 *   −5  LAS HUÉRFANAS (DT-41 c y f): `donut_detail_title`,
 *       `report_others_title` y `report_weight_label`, que el Q/A del 01/09 dejó
 *       sin pantalla, y `donut_unexplained` y `donut_rest`, que se quedaron sin
 *       lector cuando el donut volvió al anillo simple y la card 4.5 podó la
 *       maquinaria muerta. 64 + 8 + 39 − 5 = 106.
 *
 * Y LA CARD 5.3 (03/09/2026) SUMÓ 8: los cuatro sellos nuevos del matcher
 *   (`match_sustituto`, `match_cabeza_subfamilia`, `match_cabeza_familia`,
 *   `match_compuesto_parcial`) con su `_ayuda`. Son los escalones que el motor
 *   baja cuando el nombre del alimento no llega a ninguna ficha. 106 + 8 = 114.
 *
 * Quitar una clave es el mismo cambio de las dos puntas que agregarla: se va de
 * `config/copy.json` (de `keys` y de `copy`), se va de quien la leía y se va de
 * esta lista, en el mismo commit.
 *
 * La lista está en orden alfabético porque `cargarTextos` devuelve las claves
 * ordenadas: es el orden del contrato, no el del archivo.
 */
const CLAVES_ESPERADAS = [
  "capture_cta",
  "capture_help",
  "capture_prompt",
  "capture_tagline",
  "disclaimer",
  "error_bad_image",
  "error_bad_request",
  "error_catalog_unavailable",
  "error_cta",
  "error_image_too_big",
  "error_internal",
  "error_model_unavailable",
  "error_network",
  "error_not_food",
  "error_quota_exhausted",
  "error_title",
  "error_unauthenticated",
  "error_unexpected",
  "error_unreadable",
  "install_android_cta",
  "install_ios_help",
  "install_title",
  "item_confidence_label",
  "item_generic_badge",
  "item_generic_note",
  "item_source_label",
  "match_alias",
  "match_alias_ayuda",
  "match_cabeza_familia",
  "match_cabeza_familia_ayuda",
  "match_cabeza_subfamilia",
  "match_cabeza_subfamilia_ayuda",
  "match_compuesto",
  "match_compuesto_ayuda",
  "match_compuesto_parcial",
  "match_compuesto_parcial_ayuda",
  "match_difuso",
  "match_difuso_ayuda",
  "match_exacto",
  "match_exacto_ayuda",
  "match_no_catalogado",
  "match_no_catalogado_ayuda",
  "match_sustituto",
  "match_sustituto_ayuda",
  "not_food_title",
  "nutrient_carbs",
  "nutrient_fat",
  "nutrient_fiber",
  "nutrient_no_data",
  "nutrient_protein",
  "nutrient_sat_fat",
  "nutrient_sodium",
  "nutrient_sugars",
  "plan_free_cta",
  "plan_free_name",
  "plan_free_period",
  "plan_free_point_1",
  "plan_free_point_2",
  "plan_free_point_3",
  "plan_free_price",
  "plan_free_quota",
  "plan_free_summary",
  "plan_gold_badge",
  "plan_gold_cta",
  "plan_gold_name",
  "plan_gold_period",
  "plan_gold_point_1",
  "plan_gold_point_2",
  "plan_gold_point_3",
  "plan_gold_point_4",
  "plan_gold_price",
  "plan_gold_quota",
  "plan_gold_summary",
  "plan_premium_badge",
  "plan_premium_cta",
  "plan_premium_name",
  "plan_premium_period",
  "plan_premium_point_1",
  "plan_premium_point_2",
  "plan_premium_point_3",
  "plan_premium_point_4",
  "plan_premium_price",
  "plan_premium_quota",
  "plan_premium_summary",
  "plans_gold_highlight_body",
  "plans_gold_highlight_title",
  "plans_note_ads",
  "plans_note_payments",
  "plans_note_quota",
  "plans_title",
  "report_cta",
  "report_cta_premium",
  "report_items_title",
  "report_kcal_label",
  "report_macros_title",
  "report_no_totals_body",
  "report_no_totals_title",
  "report_partial_title",
  "scanning_steps",
  "scanning_title",
  "v2_cta",
  "v2_gold_punto_1",
  "v2_gold_punto_2",
  "v2_gold_punto_3",
  "v2_gold_resumen",
  "v2_gold_titulo",
  "v2_gold_vinculo",
  "v2_premium_punto_1",
  "v2_premium_punto_2",
  "v2_premium_punto_3",
  "v2_premium_resumen",
  "v2_premium_titulo",
  "v2_premium_vinculo",
  "v2_title",
];

test("config/copy.json valida y trae las 114 claves del contrato", () => {
  const textos = cargarTextos(TEXTOS_DEL_REPO);
  assert.deepEqual(textos.claves, CLAVES_ESPERADAS);
  assert.equal(textos.pasos.length, 3, "la pantalla de espera muestra tres pasos");
});

// ── El contrato con quienes LEEN los textos ─────────────────────────────────
//
// SON DOS, desde la card 4.5 (DT-40 a):
//
//   EL FRONT    declara la interfaz `CopyDeLaApp` en `apps/web/src/lib/config.ts`
//               y lee cada clave POR SU NOMBRE.
//   EL BACKEND  declara una `clave_copy` por cada error del endpoint en
//               `functions/src/analyze/errores.ts`, más la de "no es comida", y
//               las busca en `config/app.copy` con el mismo criterio.
//
// Si alguna de las dos listas se separa de lo publicado no se rompe nada
// visible: se muestra el arranque en frío y nadie se entera. Por eso se
// comparan acá, leyendo los dos archivos en vez de importarlos — `kb/seed` es un
// paquete aparte y no compila ni la web ni las Functions.

/** Los campos de texto que `CopyDeLaApp` declara, en el orden del archivo. */
function clavesDelFront(): string[] {
  const fuente = readFileSync(CONFIG_DEL_FRONT, "utf8");
  const bloque = /export interface CopyDeLaApp \{([\s\S]*?)\n\}/.exec(fuente);
  assert.ok(
    bloque,
    `No encontré 'export interface CopyDeLaApp' en ${CONFIG_DEL_FRONT}. Si el front la ` +
      "movió o le cambió el nombre, hay que actualizar este test: es el único lugar donde " +
      "se verifica que los textos sembrados sean los que la interfaz busca.",
  );
  return [...(bloque[1] as string).matchAll(/^\s*([a-z_][a-z_0-9]*)\s*:\s*string;/gm)].map(
    (encontrado) => encontrado[1] as string,
  );
}

/**
 * Las claves de copy que el backend busca: las `clave_copy` de cada error más
 * `CLAVE_NO_ES_COMIDA`.
 *
 * Se leen del texto del archivo y no de un `import` a propósito: `kb/seed` no
 * compila `functions/`, y además así el candado también caza una clave escrita
 * en un error nuevo aunque ese error todavía no se use en ningún lado.
 *
 * Las `clave_copy: null` se ignoran, y esa es la excepción declarada: hoy es
 * `metodo_no_permitido`, un 405 que solo ve quien llama al endpoint a mano.
 */
function clavesDelBackend(): string[] {
  const fuente = readFileSync(ERRORES_DEL_BACKEND, "utf8");
  const declaradas = [...fuente.matchAll(/clave_copy:\s*"([a-z_][a-z_0-9]*)"/g)].map(
    (encontrado) => encontrado[1] as string,
  );
  const noEsComida = /CLAVE_NO_ES_COMIDA\s*=\s*"([a-z_][a-z_0-9]*)"/.exec(fuente);
  assert.ok(
    noEsComida,
    `No encontré 'CLAVE_NO_ES_COMIDA' en ${ERRORES_DEL_BACKEND}. Si el backend le cambió el ` +
      "nombre, hay que actualizar este test.",
  );
  return [...declaradas, noEsComida[1] as string];
}

test("las claves del repo son exactamente las que el front y el backend leen", () => {
  const delFront = clavesDelFront();
  assert.ok(delFront.length > 0, "CopyDeLaApp no declaró ningún campo de texto");
  const delBackend = clavesDelBackend();
  assert.ok(delBackend.length > 0, "errores.ts no declaró ninguna clave_copy");

  // `scanning_steps` no es un campo de CopyDeLaApp —el front lo parte en una
  // lista— pero SÍ es una clave del mapa publicado. Es la única excepción.
  const esperadas = [...new Set([...delFront, ...delBackend, "scanning_steps"])].sort();
  const textos = cargarTextos(TEXTOS_DEL_REPO);
  assert.deepEqual(
    textos.claves,
    esperadas,
    "config/copy.json se separó de quien lee los textos: un texto que el front o el backend " +
      "esperan y nadie siembra se muestra desde el arranque en frío, sin error a la vista; y " +
      "una clave sembrada que ya nadie busca promete que editarla cambia algo.",
  );
});

/**
 * Las dos claves que el front y el backend COMPARTEN tienen dos arranques en
 * frío, uno de cada lado, y tienen que decir lo mismo.
 *
 * No es una preferencia de estilo: si difieren, el mismo código de error muestra
 * una frase u otra según quién conteste primero, y eso solo se ve el día que
 * Firestore no responde — o sea el día en que menos ganas hay de descubrirlo.
 * Lo que este test NO compara es el texto PUBLICADO contra los arranques: ese es
 * el que se edita sin desplegar y puede irse por delante, que es todo el punto.
 */
test("los textos compartidos con el backend dicen lo mismo de los dos lados", () => {
  const front = readFileSync(CONFIG_DEL_FRONT, "utf8");
  const backend = readFileSync(ERRORES_DEL_BACKEND, "utf8");

  const compartidas = clavesDelFront().filter((clave) => clavesDelBackend().includes(clave));
  assert.deepEqual(
    compartidas.sort(),
    ["error_not_food", "error_unreadable"],
    "cambió el juego de claves que el front y el backend comparten: hay que revisar que sus " +
      "arranques en frío sigan diciendo lo mismo, y actualizar este test.",
  );

  // El arranque en frío del front: `clave: "texto",` dentro de COPY_DE_ARRANQUE.
  // Los dos textos compartidos entran en una línea, así que alcanza con eso.
  for (const clave of compartidas) {
    const delFront = new RegExp(`^  ${clave}: "(.+)",$`, "m").exec(front);
    assert.ok(delFront, `no encontré el arranque en frío de '${clave}' en el front`);
    const delBackend = new RegExp(`texto_en_frio: "(.+)"`, "g");
    const textosDelBackend = [...backend.matchAll(delBackend)].map((m) => m[1] as string);
    const noEsComida = /TEXTO_NO_ES_COMIDA_EN_FRIO =\s*\n?\s*"(.+)";/.exec(backend);
    assert.ok(noEsComida, "no encontré TEXTO_NO_ES_COMIDA_EN_FRIO en el backend");
    assert.ok(
      [...textosDelBackend, noEsComida[1] as string].includes(delFront[1] as string),
      `'${clave}': el arranque en frío del front dice «${delFront[1] as string}» y el backend ` +
        "no tiene ese texto. Los dos lados de una misma clave no pueden decir cosas distintas.",
    );
  }
});

// A propósito NO se compara el TEXTO de cada clave con el del arranque en frío
// del front, aunque hoy (01/09/2026) sean idénticos. Atarlos obligaría a tocar
// apps/web para cambiar una palabra, que es exactamente lo que la regla dura
// n.º 1 quiere evitar: el texto se edita en config/copy.json, se siembra y
// listo. El arranque en frío es la red de contención de "Firestore no contesta"
// y puede quedar atrás sin que eso sea un error.
