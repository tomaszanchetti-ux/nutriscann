/**
 * Los candados del banco de pruebas del golden set.
 *
 * DOS CLASES DE TEST Y LA DIFERENCIA IMPORTA:
 *
 *   · los de ARITMÉTICA DEL CRITERIO y de ESTABILIDAD corren sobre escenarios
 *     CONSTRUIDOS acá adentro. Miden la regla, no los datos, y siguen valiendo el
 *     día que el golden set se vuelva a correr;
 *   · los de la EVIDENCIA GRABADA corren sobre `golden/set-30/respuestas*`, que
 *     son archivos congelados: una corrida grabada no cambia nunca más. Por eso
 *     sí se pueden afirmar números exactos sobre ellos.
 *
 * Lo que NINGUNO de estos tests hace es afirmar algo sobre el catálogo: `kb/` se
 * mueve con la curación, y un candado que depende de que al catálogo le falte —o
 * le sobre— una ficha no es un candado. Los barridos del matcher viven en
 * `catalogo.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compararCorridas,
  corridaGrabada,
  criterio2,
  criteriosDelSet,
  idiomaDelMotivo,
  replayDeCorrida,
  TOLERANCIA_DE_GRAMOS,
  versionesDeLaCorrida,
  type CriteriosDelSet,
  type PlatoGrabado,
} from "./golden";
import { indiceReal } from "./testing";

const plato = (parcial: Partial<PlatoGrabado> & { id: string }): PlatoGrabado => ({
  is_food: true,
  items: [],
  totals: null,
  kb_version: "test",
  ...parcial,
});

const totales = (kcal: number | null, cuantificados: number, total: number, completo = true) => ({
  nutrients: { kcal },
  grams_total: total,
  grams_cuantificados: cuantificados,
  items_incluidos: 1,
  items_sin_datos: completo ? 0 : 1,
  completo,
});

describe("card 6.1 — el criterio 2 juzga contra los gramos QUE LA VISIÓN REPORTÓ", () => {
  const criterios: CriteriosDelSet = {
    denominador_criterio_2: 2,
    umbral_criterio_2: 0.8,
    piso_de_gramos_cuantificados: 0.7,
    platos: [
      { id: "04-tortilla", comida: true, gramos_previstos: 450, kcal_min: 450, kcal_max: 750 },
      { id: "17-pollo", comida: true, gramos_previstos: 360, kcal_min: 400, kcal_max: 650 },
    ],
  };

  it("LA TORTILLA ENTRA: la ficha era correcta y la visión midió 600 g, no 450", () => {
    // El caso que abrió la deuda. 600 g de tortilla × 1,36 = 816 kcal, aritmética
    // exacta sobre la ficha correcta, y el rango escrito (450–750) la dejaba
    // afuera porque se había calculado sobre 450 g.
    const r = criterio2([plato({ id: "04-tortilla", totals: totales(816, 600, 600) })], criterios);
    const fila = r.filas.find((f) => f.plato === "04-tortilla");
    assert.ok(fila);
    assert.equal(fila.veredicto, "en_rango");
    assert.deepEqual(fila.rango_escrito, [450, 750]);
    assert.deepEqual(fila.rango_ajustado, [600, 1000]);
    assert.equal(fila.factor, 1.333);
  });

  it("EL POLLO SIGUE AFUERA: ahí el motor falla de verdad, no la predicción", () => {
    // 290,7 kcal para un plato que ronda 515. El pollo se quedó mudo y el total
    // se hundió; ajustar el rango a los gramos cuantificados NO lo salva, que es
    // exactamente lo que tiene que pasar.
    const r = criterio2([plato({ id: "17-pollo", totals: totales(290.7, 270, 400, false) })], criterios);
    const fila = r.filas.find((f) => f.plato === "17-pollo");
    assert.ok(fila);
    assert.equal(fila.veredicto, "fuera_de_rango");
    assert.deepEqual(fila.rango_ajustado, [300, 487.5]);
  });

  it("el rango se estira Y SE ENCOGE: no es una amnistía, es una regla de tres", () => {
    // Si el ajuste solo pudiera ensanchar, el criterio dejaría de medir nada. Con
    // la mitad de los gramos, el techo también baja a la mitad.
    const r = criterio2([plato({ id: "04-tortilla", totals: totales(700, 225, 225) })], criterios);
    const fila = r.filas.find((f) => f.plato === "04-tortilla");
    assert.ok(fila);
    assert.deepEqual(fila.rango_ajustado, [225, 375]);
    assert.equal(fila.veredicto, "fuera_de_rango");
  });

  it("la cláusula del parcial declarado sigue viva y no necesita rango", () => {
    const r = criterio2([plato({ id: "17-pollo", totals: totales(246.9, 330, 380, false) })], criterios);
    const fila = r.filas.find((f) => f.plato === "17-pollo");
    assert.ok(fila);
    assert.equal(fila.veredicto, "parcial_declarado");
    assert.match(fila.motivo, /86\.8 %/);
  });

  it("un plato SIN rango escrito acierta callándose, y falla publicando", () => {
    // La arepa: el comportamiento correcto era no dar número.
    const sinRango: CriteriosDelSet = {
      ...criterios,
      denominador_criterio_2: 1,
      platos: [{ id: "09-arepa", comida: true, gramos_previstos: null, kcal_min: null, kcal_max: null }],
    };
    const callado = criterio2([plato({ id: "09-arepa", totals: null })], sinRango);
    assert.equal(callado.filas[0]?.veredicto, "sin_total_correcto");
    const hablador = criterio2([plato({ id: "09-arepa", totals: totales(400, 150, 150) })], sinRango);
    assert.equal(hablador.filas[0]?.veredicto, "fuera_de_rango");
  });

  it("los negativos no entran al criterio 2: tienen el suyo", () => {
    const conNegativo: CriteriosDelSet = {
      ...criterios,
      platos: [...criterios.platos, { id: "10-bicicleta", comida: false }],
    };
    const r = criterio2([plato({ id: "10-bicicleta", is_food: false })], conNegativo);
    assert.deepEqual(r.filas, []);
  });
});

describe("card 6.1 — la estabilidad de la visión se mide, no se arregla", () => {
  const conItems = (id: string, items: [string, number, string | null][]): PlatoGrabado =>
    plato({
      id,
      items: items.map(([termino_en, grams, food_id]) => ({
        termino_en,
        food_id,
        name_es: null,
        grams,
        confidence: 0.5,
        match: food_id === null ? "no_catalogado" : "difuso",
      })),
    });

  it("dos corridas idénticas no reportan ni un movimiento", () => {
    const a = [conItems("01", [["apple, raw", 180, "fdc-1"]])];
    const b = [conItems("01", [["apple, raw", 180, "fdc-1"]])];
    const r = compararCorridas(a, b);
    assert.equal(r.identicos, 1);
    assert.equal(r.movidos, 0);
  });

  it("un ítem que aparece y otro que desaparece se cuentan por separado", () => {
    // El plato 20 del set: la remolacha desapareció entre corridas. No es que el
    // motor la haya perdido: la visión no la devolvió.
    const a = [conItems("20", [["lettuce", 100, "fdc-1"], ["beet, pickled", 20, "fdc-2"]])];
    const b = [conItems("20", [["lettuce", 100, "fdc-1"], ["tuna, canned", 60, "fdc-3"]])];
    const r = compararCorridas(a, b);
    assert.deepEqual(r.platos[0]?.desaparecidos, ["beet, pickled"]);
    assert.deepEqual(r.platos[0]?.aparecidos, ["tuna, canned"]);
    assert.equal(r.con_items_distintos, 1);
  });

  it("el gramaje se mide contra la tolerancia declarada, no a ojo", () => {
    assert.equal(TOLERANCIA_DE_GRAMOS, 0.3);
    // 150 → 200 g es un +33 %: pasa la tolerancia y se reporta.
    const movido = compararCorridas([conItems("07", [["fries", 150, "fdc-1"]])], [conItems("07", [["fries", 200, "fdc-1"]])]);
    assert.equal(movido.con_gramos_movidos, 1);
    // 150 → 190 g es un +26,7 %: es ruido de la misma lectura y no se reporta.
    const ruido = compararCorridas([conItems("07", [["fries", 150, "fdc-1"]])], [conItems("07", [["fries", 190, "fdc-1"]])]);
    assert.equal(ruido.con_gramos_movidos, 0);
    assert.equal(ruido.identicos, 1);
  });

  it("SE APAREA POR TÉRMINO, NO POR POSICIÓN: reordenar no es cambiar", () => {
    const a = [conItems("22", [["egg", 90, "fdc-1"], ["ham", 50, "fdc-2"]])];
    const b = [conItems("22", [["ham", 50, "fdc-2"], ["egg", 90, "fdc-1"]])];
    assert.equal(compararCorridas(a, b).identicos, 1);
  });

  it("cambiar de opinión sobre si la foto es comida es el movimiento más caro", () => {
    const a = [plato({ id: "28", is_food: true })];
    const b = [plato({ id: "28", is_food: false })];
    const r = compararCorridas(a, b);
    assert.equal(r.con_veredicto_distinto, 1);
    assert.equal(r.platos[0]?.estable, false);
  });
});

describe("card 6.1 — el idioma por el que entró un match se lee del motivo", () => {
  it("distingue inglés, español y lo que no dice nada", () => {
    assert.equal(idiomaDelMotivo('Coincidencia exacta con el nombre en inglés del catálogo ("Ham").'), "en");
    assert.equal(idiomaDelMotivo('Coincidencia exacta con un alias en español ("Jamón serrano", …).'), "es");
    assert.equal(idiomaDelMotivo('Coincidencia aproximada en español con "Jamón": …'), "es");
    assert.equal(idiomaDelMotivo("El catálogo no tiene este plato: se compuso con 3 fichas."), null);
    assert.equal(idiomaDelMotivo(undefined), null);
  });
});

describe("card 6.1 — la evidencia grabada del golden set, dentro del repo", () => {
  const v1 = corridaGrabada("respuestas");
  const v2 = corridaGrabada("respuestas-v2");

  it("las dos corridas están completas: 30 platos cada una", () => {
    assert.equal(v1.length, 30);
    assert.equal(v2.length, 30);
  });

  it("CADA CORRIDA DECLARA SU CATÁLOGO, y no es el mismo", () => {
    // El dato que hace falta para no leer mal un replay: la v1 se grabó con el
    // 3.0.0 y la v2 con el 3.1.0. Jugar las dos contra el mismo índice mezcla lo
    // que cambió el motor con lo que cambió la curación.
    assert.deepEqual(versionesDeLaCorrida(v1), ["3.0.0+b2b227e1"]);
    assert.deepEqual(versionesDeLaCorrida(v2), ["3.1.0+47b8c77d"]);
  });

  it("el criterio 2 recalibrado sobre la v2: 23 de 26, y el pollo sigue afuera", () => {
    // Los archivos están congelados, así que el número es exacto y se puede
    // afirmar. Contra el criterio escrito, la v2 daba 20/26 = 76,9 % y FALLABA.
    const r = criterio2(v2, criteriosDelSet());
    assert.equal(r.denominador, 26);
    assert.equal(r.en_regla, 23);
    assert.equal(r.porcentaje, 88.5);
    assert.equal(r.pasa, true);
    const fuera = r.filas.filter((f) => f.veredicto === "fuera_de_rango").map((f) => f.plato);
    assert.deepEqual(fuera, ["16-jamon-serrano", "17-pollo-arroz-verduras", "22-desayuno-ingles"]);
  });

  it("la visión se movió entre las dos corridas sobre las MISMAS fotos", () => {
    // La medición que pedía la DT-28. El enunciado hablaba de 12 platos; medido
    // con esta definición —que cuenta también un término reescrito— son más.
    const r = compararCorridas(v1, v2);
    assert.equal(r.identicos + r.movidos, 30);
    assert.ok(r.movidos >= 12, `solo ${r.movidos} platos movidos`);
    assert.equal(r.con_veredicto_distinto, 0, "ninguna foto cambió de is_food entre corridas");
  });

  it("el replay corre entero y no confunde un silencio con una pérdida", () => {
    // Smoke sobre el catálogo de HOY: acá no se afirma qué ficha gana —eso se
    // mueve con la curación— sino que cada ítem queda clasificado y que los que
    // entraron por el español no se cuentan como pérdida.
    const r = replayDeCorrida(v2, indiceReal());
    assert.equal(r.items, 68);
    assert.equal(
      r.destrabados + r.perdidos + r.otra_ficha + r.no_comparables + r.filas.filter((f) => f.cambio === "resuelto_igual").length + r.filas.filter((f) => f.cambio === "sigue_en_silencio").length,
      68,
    );
    assert.ok(r.no_comparables > 0, "ningún ítem entró por el español: revisar `idiomaDelMotivo`");
  });
});
