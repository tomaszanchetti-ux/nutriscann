/**
 * EL TORREZNO DE SORIA, que entró por la puerta de la ETIQUETA — card 6.4c,
 * con la etiqueta CAMBIADA por decisión de producto en la WS07 (01/09/2026).
 *
 * LA DECISIÓN, que es lo que este archivo tiene que sobrevivir: la 6.4c publicó
 * la ficha desde una etiqueta de CARETA (Hacendado 8480000334169, 580 kcal), que
 * es el EXTREMO MAGRO de las 26 etiquetas contrastadas. Tomás decidió que la
 * ficha tiene que ser el torrezno que MÁS se consume, que es el de PANCETA, y
 * pasó a la etiqueta Carrefour 8431876311617 (627 kcal), que además cae en la
 * mediana del mercado en cuatro campos. El método de aceptación NO cambió: una
 * sola etiqueta, ocho campos del mismo producto, Atwater como criterio.
 *
 * Mismo contrato que `card64b.test.ts` y por los mismos motivos: lee
 * `build/foods.canonical.json` DE DISCO y no corre el pipeline, porque el CI no
 * tiene los datasets de USDA (1,1 GB, fuera de git) y porque lo que se seedea a
 * Firestore es ese archivo.
 *
 * QUÉ FIJA, que es lo que ningún candado del build puede ver:
 *
 *   1. Que la ficha existe, que es MANUAL y que sus ocho campos vienen de UNA
 *      etiqueta concreta (Carrefour 8431876311617). Mezclar etiquetas campo a
 *      campo produce un alimento que no existe, y el provenance es el único
 *      lugar donde eso se puede vigilar.
 *   2. Que ATWATER CIERRA. Fue el criterio de aceptación de la etiqueta y es lo
 *      que separa una etiqueta real de tres números de productos distintos
 *      pegados: con 0 g de hidratos, las calorías son enteramente proteína y
 *      grasa, así que el cierre no es una casualidad aritmética.
 *   3. Que el vocabulario del plato está: `Torrezno` y el plural `Torreznos`
 *      entran a 1,0 porque nombran el MISMO alimento, no uno parecido — es la
 *      diferencia con el `Romesco` de la salsa, que entró a 0,6.
 *   4. Que la ficha DECLARA su posición en el mercado, su corte y la decisión
 *      que la puso ahí — incluida la etiqueta DESCARTADA, con su código de
 *      barras. Un caveat que se borre en una limpieza deja el número solo, y un
 *      número solo miente por omisión; y una decisión de producto que no queda
 *      escrita no se puede revertir, solo repetir.
 *   5. Que la DT-36 NO se cerró de rebote. La ficha es `manual`, nunca `receta`:
 *      el modelo sigue sin saber restar la grasa que sale de la pieza y el
 *      candado de `card64b.test.ts` lo sigue vigilando desde el otro lado.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CATALOG_FILE } from "./build";
import { type Catalog } from "./types";

const catalog = JSON.parse(readFileSync(CATALOG_FILE, "utf8")) as Catalog;
const torrezno = catalog.foods.find((food) => food.id === "manual-torrezno-de-soria");

test("el Torrezno de Soria entró, y entró desde UNA etiqueta comercial", () => {
  assert.ok(torrezno, "`manual-torrezno-de-soria` no está en el catálogo publicado");
  assert.equal(torrezno.source, "manual");
  assert.equal(torrezno.names.es, "Torrezno de Soria");

  // El código de barras es lo que permite que un tercero rehaga los ocho números.
  assert.match(torrezno.source_ref, /8431876311617/);

  // Los ocho campos son de la MISMA etiqueta. Si mañana alguien completa un
  // campo desde otra marca «porque faltaba», este candado lo dice.
  const campos = Object.entries(torrezno.provenance).filter(([campo]) => campo.startsWith("per_100g."));
  assert.equal(campos.length, 8, "la etiqueta declara los ocho campos: ninguno queda en null");
  for (const [campo, origen] of campos) {
    assert.equal(origen, "manual/etiqueta-comercial", campo);
  }
});

test("Atwater cierra: fue el criterio de aceptación de la etiqueta", () => {
  assert.ok(torrezno);
  const { kcal, protein_g, carbs_g, fat_g } = torrezno.per_100g;
  const predicho = 4 * protein_g + 4 * carbs_g + 9 * fat_g;
  const desvio = Math.abs(kcal - predicho) / kcal;
  assert.ok(desvio < 0.01, `Atwater del torrezno: ${(desvio * 100).toFixed(2)} %`);

  // El sodio se calcula desde la sal declarada (2,8 g x 400). No es un detalle:
  // una tapa de 50 g ya aporta 560 mg, más de la cuarta parte de la ingesta
  // diaria que recomienda la OMS.
  assert.equal(torrezno.per_100g.sodium_mg, 1120);
});

test("el vocabulario del plato entra a 1,0: el plural es el MISMO alimento", () => {
  assert.ok(torrezno);
  const aliases = torrezno.aliases?.es ?? [];
  for (const esperado of ["Torrezno", "Torreznos"]) {
    // A diferencia del `Romesco` de la salsa, acá no hay confianza rebajada: un
    // torrezno y unos torreznos son la misma cosa contada de a uno o de a varios.
    assert.ok(
      aliases.includes(esperado),
      `falta el alias \`${esperado}\` a 1,0 (los aliases a 1,0 van como texto plano)`,
    );
  }
});

test("la ficha declara dónde cae en el mercado, de qué corte es y qué se descartó", () => {
  assert.ok(torrezno);
  const caveats = (torrezno.caveats ?? []).join(" ");
  // La banda de las 26 etiquetas contrastadas sigue escrita, con su mediana en
  // 627 kcal: un número sin su banda no dice si es el centro o un extremo.
  assert.match(caveats, /627/, "el caveat perdió la mediana del mercado contrastado");
  // Y es de PANCETA —corteza con tocino veteado—, que es el corte canónico del
  // torrezno de Soria y lo que explica sus 48 g de grasa.
  assert.match(caveats, /LA ETIQUETA ES DE PANCETA/);
  // EL EXTREMO MAGRO DESCARTADO SIGUE NOMBRADO, con su código de barras y su
  // número: es la única forma de que la decisión de producto se pueda releer y
  // revertir en vez de repetirse a ciegas.
  assert.match(caveats, /8480000334169/, "se perdió la etiqueta de careta que se descartó");
  assert.match(caveats, /580 kcal/);
  // La DT-36 no se cierra con esta ficha, y el caveat lo dice en voz alta.
  assert.match(caveats, /DT-36/);
});
