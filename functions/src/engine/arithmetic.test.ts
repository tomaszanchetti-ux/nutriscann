/**
 * Los candados de la aritmética.
 *
 * La mitad de los tests de este archivo son sobre el VACÍO, no sobre los
 * números: qué pasa cuando un dato falta. Es a propósito — sumar bien es fácil,
 * y el error caro del sistema sería convertir un "no sé" en un cero que el
 * usuario no puede distinguir de un dato medido.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Per100g } from "../kb/types";
import { escalar, esPlausible, gramosValidos, masaCoherente, porcentajesDeMacros, sumarTotales } from "./arithmetic";
import { CONFIANZA_MINIMA_PARA_UN_TOTAL } from "./constants";
import { redondear } from "./match";
import { catalogoReal, fichaReal } from "./testing";
import type { EngineItem, SumaDeNutrientes } from "./types";

const COMPLETA: Per100g = {
  kcal: 200,
  protein_g: 10,
  carbs_g: 20,
  fat_g: 8,
  fiber_g: 2,
  sat_fat_g: 1,
  sugars_g: 3,
  sodium_mg: 400,
};

const SIN_AZUCARES: Per100g = { ...COMPLETA, sugars_g: null };

function item(parcial: Partial<EngineItem> & { termino_en: string }): EngineItem {
  return {
    // Estos tests miden la ARITMÉTICA, que no mira los términos: el español va
    // vacío, que es lo que el motor escribe cuando la visión no lo dijo.
    termino_es: "",
    food_id: "test",
    name_es: parcial.termino_en,
    name_en: parcial.termino_en,
    source_ref: "test",
    grams: 100,
    confidence: 1,
    confidence_vision: 1,
    confidence_match: 1,
    match: "exacto",
    per_100g: COMPLETA,
    nutrients: escalar(COMPLETA, parcial.grams ?? 100),
    motivo: "test",
    ...parcial,
  };
}

describe("escalar a los gramos del plato", () => {
  it("per_100g × gramos / 100", () => {
    const r = escalar(COMPLETA, 250);
    assert.equal(r.kcal, 500);
    assert.equal(r.protein_g, 25);
    assert.equal(r.sodium_mg, 1000);
  });

  it("un `null` de la ficha sigue siendo `null`, nunca 0", () => {
    const r = escalar(SIN_AZUCARES, 250);
    assert.equal(r.sugars_g, null);
    assert.equal(r.fiber_g, 5);
  });

  it("cero gramos da ceros, no nulls: el plato tiene el alimento, pesa cero", () => {
    const r = escalar(COMPLETA, 0);
    assert.equal(r.kcal, 0);
    assert.equal(r.sugars_g, 0);
  });

  it("gramos absurdos (NaN, negativos) se tratan como cero, no rompen", () => {
    assert.equal(escalar(COMPLETA, Number.NaN).kcal, 0);
    assert.equal(escalar(COMPLETA, -50).kcal, 0);
    assert.equal(gramosValidos(-5), 0);
    assert.equal(gramosValidos(Number.POSITIVE_INFINITY), 0);
    assert.equal(gramosValidos(120.4567), 120.457);
  });
});

describe("totales del escaneo", () => {
  it("suma los cuatro obligatorios", () => {
    const t = sumarTotales([item({ termino_en: "a", grams: 100 }), item({ termino_en: "b", grams: 50 })]);
    assert.ok(t);
    assert.equal(t.nutrients.kcal, 300);
    assert.equal(t.nutrients.protein_g, 15);
    assert.equal(t.grams_total, 150);
    assert.equal(t.completo, true);
  });

  it("un opcional que le falta a UN item deja el total en `null`, con motivo", () => {
    const t = sumarTotales([
      item({ termino_en: "a", grams: 100 }),
      item({ termino_en: "sin azúcares", grams: 100, per_100g: SIN_AZUCARES, nutrients: escalar(SIN_AZUCARES, 100) }),
    ]);
    assert.ok(t);
    assert.equal(t.nutrients.sugars_g, null);
    assert.equal(t.nutrients.fiber_g, 4);
    assert.match(t.opcionales_ausentes.sugars_g ?? "", /sin azúcares/);
    assert.equal(t.opcionales_ausentes.fiber_g, undefined);
  });

  it("un item sin ficha no suma cero: queda fuera y baja `completo`", () => {
    const t = sumarTotales([
      item({ termino_en: "a", grams: 100 }),
      item({ termino_en: "desconocido", grams: 80, food_id: null, match: "no_catalogado", per_100g: null, nutrients: null }),
    ]);
    assert.ok(t);
    assert.equal(t.nutrients.kcal, 200);
    assert.equal(t.items_incluidos, 1);
    assert.equal(t.items_sin_datos, 1);
    assert.equal(t.completo, false);
    // Los gramos del plato son 180; los que se pudieron cuantificar, 100.
    assert.equal(t.grams_total, 180);
    assert.equal(t.grams_cuantificados, 100);
  });

  it("si NINGÚN item tiene ficha no hay totales: `null`, no ceros", () => {
    const t = sumarTotales([
      item({ termino_en: "x", food_id: null, match: "no_catalogado", per_100g: null, nutrients: null }),
    ]);
    assert.equal(t, null);
  });

  it("un escaneo sin items no tiene totales", () => {
    assert.equal(sumarTotales([]), null);
  });
});

/**
 * CARD 2.8 — LA COMPUERTA DEL TOTAL.
 *
 * El escenario SE CONSTRUYE, no se busca: la miel del plato 28 no está acá, está
 * la FORMA del plato 28 —todos los ítems cuantificados, todos con la confianza
 * por el piso— que es lo único que la compuerta mira. Los números de confianza
 * sí son los reales del golden set de 30, porque son la justificación del piso.
 */
describe("card 2.8 — un total donde nadie se identificó no es un total completo", () => {
  /** El plato 28 reconstruido: dos ítems cuantificados enteros, los dos a 0,088. */
  const comidaDePlastico = (): EngineItem[] => [
    item({ termino_en: "honey toast with whipped cream and cookie", grams: 250, confidence: 0.088 }),
    item({ termino_en: "honey toast with whipped cream and banana", grams: 260, confidence: 0.088 }),
  ];

  it("dos ítems al 0,088 dejan de publicarse como total completo", () => {
    const t = sumarTotales(comidaDePlastico());
    assert.ok(t);
    assert.equal(t.completo, false);
    assert.equal(t.macro_pct, null);
    assert.match(t.macro_pct_motivo ?? "", /confianza suficiente/);
    // El motivo dice los DOS números, el que se alcanzó y el que hacía falta.
    assert.match(t.macro_pct_motivo ?? "", /8\.8 %/);
    assert.match(t.macro_pct_motivo ?? "", /12 %/);
  });

  it("la compuerta protege el TOTAL, no borra ni un ítem", () => {
    const items = comidaDePlastico();
    const t = sumarTotales(items);
    assert.ok(t);
    // CARD 6.1 — LA COMPUERTA CIERRA ENTERA. Hasta la 2.8 la suma seguía viajando
    // en el payload (1.020 kcal acá, 1.550,4 en el plato 28 del golden set) con
    // `completo: false` al lado: el JSON decía las dos cosas a la vez y quien lo
    // pintara decidía cuál. Ahora el payload dice lo mismo que la declaración.
    assert.equal(t.nutrients.kcal, null);
    assert.equal(t.total_no_publicable, true);
    // Pero el CONTEO no se toca: los dos ítems entraron a la suma, y eso es lo que
    // permite seguir explicando de qué está hecho el plato.
    assert.equal(t.items_incluidos, 2);
    assert.equal(t.items_sin_datos, 0);
    assert.equal(t.grams_total, 510);
    assert.equal(t.grams_cuantificados, 510);
    // Y los ítems que se le pasaron no se tocaron.
    assert.equal(items.length, 2);
    assert.ok(items.every((i) => i.nutrients !== null && i.food_id !== null));
  });

  it("card 6.1 — LOS OCHO valores viajan en `null`, no solo el de portada", () => {
    // DT-28, punto 3. La compuerta de la 2.8 apagaba la declaración y dejaba los
    // números adentro del JSON: el plato 28 del golden set salía `completo: false`
    // y con 1.550,4 kcal en `totals.nutrients.kcal`. Un payload que dice las dos
    // cosas a la vez le deja la decisión a quien lo pinte.
    const t = sumarTotales(comidaDePlastico());
    assert.ok(t);
    assert.deepEqual(t.nutrients, {
      kcal: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      sat_fat_g: null,
      sugars_g: null,
      sodium_mg: null,
    });
    // Y el `null` de la compuerta NO se puede confundir con el `null` de "la
    // fuente no lo mide": hay una marca que lo dice.
    assert.equal(t.total_no_publicable, true);
  });

  it("card 6.1 — un total que SÍ se publica no lleva la marca ni pierde un número", () => {
    // La otra mitad del candado: la compuerta tiene que ser la excepción, no la
    // regla. Sin este test, apagar todos los totales pasaría los tests de arriba.
    const t = sumarTotales([item({ termino_en: "manzana", grams: 180, confidence: 0.95 })]);
    assert.ok(t);
    assert.equal(t.total_no_publicable, undefined);
    assert.equal(typeof t.nutrients.kcal, "number");
    assert.ok((t.nutrients.kcal ?? 0) > 0);
    assert.ok(t.macro_pct !== null);
  });

  it("NO toca un plato correcto de confianza baja: el 24, con sus dos fichas buenas", () => {
    // Espaguetis con albóndigas del golden set: `Pasta con salsa` a 0,152 y
    // `Albóndigas con salsa` a 0,150. Las dos fichas son las correctas y el
    // total (702,8 kcal) cayó en rango. Es el plato que fija el techo del piso.
    const t = sumarTotales([
      item({ termino_en: "spaghetti, cooked", grams: 100, confidence: 0.152 }),
      item({ termino_en: "meatballs with tomato sauce", grams: 100, confidence: 0.15 }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, true);
    assert.ok(t.macro_pct !== null);
    assert.equal(t.macro_pct_motivo, null);
  });

  it("mira EL MEJOR ítem, no el promedio: un alimento bien identificado alcanza", () => {
    const t = sumarTotales([
      item({ termino_en: "manzana", grams: 100, confidence: 0.95 }),
      item({ termino_en: "duda 1", grams: 50, confidence: 0.05 }),
      item({ termino_en: "duda 2", grams: 50, confidence: 0.02 }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, true);
    assert.ok(t.macro_pct !== null);
  });

  it("el borde del piso está declarado: 0,12 pasa y 0,119 no", () => {
    assert.equal(CONFIANZA_MINIMA_PARA_UN_TOTAL, 0.12);
    const justo = sumarTotales([item({ termino_en: "justo", confidence: CONFIANZA_MINIMA_PARA_UN_TOTAL })]);
    const abajo = sumarTotales([item({ termino_en: "abajo", confidence: 0.119 })]);
    assert.ok(justo && abajo);
    assert.equal(justo.completo, true);
    assert.equal(abajo.completo, false);
  });

  it("un plato que YA era parcial y encima no llega al piso dice las dos cosas", () => {
    const t = sumarTotales([
      item({ termino_en: "duda", grams: 100, confidence: 0.05 }),
      item({ termino_en: "sin ficha", grams: 80, food_id: null, match: "no_catalogado", per_100g: null, nutrients: null }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, false);
    assert.equal(t.items_sin_datos, 1);
    assert.equal(t.macro_pct, null);
    assert.match(t.macro_pct_motivo ?? "", /confianza suficiente/);
  });

  it("con 0 kcal el motivo sigue siendo el de las calorías, no el de la compuerta", () => {
    const vacio: Per100g = { ...COMPLETA, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const t = sumarTotales([item({ termino_en: "agua", confidence: 0.9, per_100g: vacio, nutrients: escalar(vacio, 100) })]);
    assert.ok(t);
    assert.equal(t.completo, true);
    assert.match(t.macro_pct_motivo ?? "", /El total de calorías es 0/);
  });
});

/**
 * DT-37 · DEFECTO 1 — LA SEGUNDA PUERTA DE LA COMPUERTA (card 6.5).
 *
 * El escenario se construye con fixtures y no con el catálogo real, por la misma
 * razón que el del plato 28: lo que se mide acá es LA REGLA, y atarla a que una
 * ficha siga dando 0,084 sería atar el candado a una curación que se mueve. El
 * plato entero, con su ficha de verdad, está en `analyze.test.ts`.
 */
describe("DT-37 — la compuerta distingue `no sé qué es` de `sé qué es por una vía floja`", () => {
  it("una ficha que NOMBRA lo que se describió publica su total aunque puntúe 0,084", () => {
    // El plato 05 del golden en su forma mínima: un solo ítem, ficha correcta,
    // aritmética exacta, y una confianza de 0,084 contra el piso de 0,12. Era la
    // única regresión ✅→🟡 de la corrida v3.
    const t = sumarTotales([
      item({ termino_en: "lasagna, meat and spinach ricotta", grams: 350, confidence: 0.084, confidence_vision: 0.85, match: "difuso", identidad_respaldada: true }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, true);
    assert.equal(t.total_no_publicable, undefined);
    assert.equal(typeof t.nutrients.kcal, "number");
    assert.ok(t.macro_pct !== null);
  });

  it("y la MISMA confianza sin ficha que la respalde sigue sin publicar", () => {
    // La otra mitad, que es la que impide abrir la compuerta de más: cambia UNA
    // cosa respecto del test de arriba —que la ficha nombre lo que se describió—
    // y el total vuelve a no publicarse.
    const t = sumarTotales([
      item({ termino_en: "honey toast with whipped cream and cookie", grams: 250, confidence: 0.084, confidence_vision: 0.85, match: "difuso" }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, false);
    assert.equal(t.total_no_publicable, true);
    assert.equal(t.nutrients.kcal, null);
    assert.match(t.macro_pct_motivo ?? "", /ninguna ficha que nombre/);
  });

  it("la mitad de VISIÓN sigue contando: si el modelo no supo qué miraba, no hay total", () => {
    // Una ficha que nombra perfectamente lo que se describió, y una visión que
    // dijo "creo que esto es una lasaña" con un 5 %. El que no sabe qué es acá es
    // el que miró la foto, y la segunda puerta no lo tapa.
    const t = sumarTotales([
      item({ termino_en: "lasaña", grams: 350, confidence: 0.05, confidence_vision: 0.05, match: "difuso", identidad_respaldada: true }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, false);
    assert.equal(t.total_no_publicable, true);
  });

  it("alcanza con UN ítem respaldado, igual que con la confianza", () => {
    // La compuerta mira el mejor ítem, no el promedio: la segunda puerta se abre
    // con la misma regla, o serían dos criterios distintos para la misma pregunta.
    const t = sumarTotales([
      item({ termino_en: "duda", grams: 50, confidence: 0.03, confidence_vision: 0.5, match: "difuso" }),
      item({ termino_en: "lasaña", grams: 350, confidence: 0.084, confidence_vision: 0.85, match: "difuso", identidad_respaldada: true }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, true);
  });
});

describe("porcentajes de macros (Atwater 4/4/9)", () => {
  const base: SumaDeNutrientes = {
    kcal: 200,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 8,
    fiber_g: null,
    sat_fat_g: null,
    sugars_g: null,
    sodium_mg: null,
  };

  it("reparte las calorías QUE APORTAN LOS MACROS, no las de la ficha", () => {
    // 40 + 80 + 72 = 192 kcal de macros (la ficha declara 200).
    const p = porcentajesDeMacros(base);
    assert.ok(p);
    assert.equal(p.protein, 20.8); // 40 / 192
    assert.equal(p.carbs, 41.7); // 80 / 192
    assert.equal(p.fat, 37.5); // 72 / 192
  });

  it("los tres suman 100 por construcción", () => {
    const p = porcentajesDeMacros(base);
    assert.ok(p);
    assert.equal(redondear(p.protein + p.carbs + p.fat, 1), 100);
  });

  it("lo que la ficha declara de más viaja aparte, con signo", () => {
    const p = porcentajesDeMacros(base);
    assert.ok(p);
    assert.equal(p.kcal_fuera_de_macros, 8); // 200 de la ficha − 192 de los macros
    assert.equal(p.diferencia_pct, 4); // 8 sobre 200
    // 4 % es ruido de redondeo: por debajo del umbral no hay letra chica.
    assert.equal(p.motivo_de_la_diferencia, null);
  });

  it("una diferencia grande sí trae su motivo escrito", () => {
    // Una ficha que declara 260 kcal con los mismos macros: 68 kcal (un 26 %)
    // que no vienen de ningún macronutriente. Es el caso del alcohol.
    const p = porcentajesDeMacros({ ...base, kcal: 260 });
    assert.ok(p);
    assert.equal(p.diferencia_pct, 26.2);
    assert.match(p.motivo_de_la_diferencia ?? "", /alcohol/);
    // Y el reparto NO se movió: la diferencia ya no se cuela en los porcentajes.
    assert.equal(p.protein, 20.8);
    assert.equal(redondear(p.protein + p.carbs + p.fat, 1), 100);
  });

  it("con 0 kcal no hay porcentajes: `null`, no 0 %", () => {
    assert.equal(porcentajesDeMacros({ ...base, kcal: 0 }), null);
    assert.equal(porcentajesDeMacros({ ...base, kcal: -5 }), null);
  });

  it("calorías sin un solo gramo de macro (alcohol puro): `null`, no una división por cero", () => {
    const p = porcentajesDeMacros({ ...base, protein_g: 0, carbs_g: 0, fat_g: 0 });
    assert.equal(p, null);
  });

  it("el motivo viaja en los totales cuando no hay porcentajes", () => {
    const vacio: Per100g = { ...COMPLETA, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const t = sumarTotales([item({ termino_en: "agua", per_100g: vacio, nutrients: escalar(vacio, 100) })]);
    assert.ok(t);
    assert.equal(t.macro_pct, null);
    assert.match(t.macro_pct_motivo ?? "", /0/);
  });

  it("un plato con calorías y sin macros dice ESO, no que el total es 0", () => {
    // El caso NO es hipotético y está en el catálogo: `Bebida destilada`
    // (fdc-174815) declara 231 kcal/100 g con proteínas, hidratos y grasas en 0.
    // Es una de las 7 fichas de 1.115 que no reparten macros.
    const soloAlcohol = fichaReal("fdc-174815").per_100g;
    const t = sumarTotales([
      item({ termino_en: "gin", per_100g: soloAlcohol, nutrients: escalar(soloAlcohol, 100) }),
    ]);
    assert.ok(t);
    assert.equal(t.nutrients.kcal, 231);
    assert.equal(t.macro_pct, null);
    assert.match(t.macro_pct_motivo ?? "", /viene de proteínas, hidratos o grasas/);
  });
});

/**
 * EL CANDADO DE LOS NÚMEROS IMPOSIBLES (card 5.1).
 *
 * No es un test de tres casos elegidos: recorre EL CATÁLOGO ENTERO. La razón es
 * que el error que esta card arregla no se veía en ningún test —el motor sumaba
 * bien, escalaba bien y publicaba `carbs: 102,7 %`—, y solo aparecía al mirar
 * una ficha cuya fuente usa factores propios. Con 1.115 fichas, la única
 * pregunta que no admite muestreo es "¿alguna publica un porcentaje imposible?".
 */
describe("ningún número imposible: las 1.115 fichas del catálogo real", () => {
  const fichas = catalogoReal().foods;

  it("el catálogo que se recorre es el real y está entero", () => {
    assert.ok(fichas.length >= 1000, `esperaba el catálogo real, vinieron ${fichas.length} fichas`);
  });

  it("los tres porcentajes caen en 0..100 y suman 100 en TODAS", () => {
    const imposibles: string[] = [];
    let repartidas = 0;
    let conLetraChica = 0;
    for (const ficha of fichas) {
      const p = porcentajesDeMacros(escalar(ficha.per_100g, 100));
      if (p === null) continue; // fichas sin calorías o sin macros: no reparten
      repartidas += 1;
      if (p.motivo_de_la_diferencia !== null) conLetraChica += 1;
      const suma = redondear(p.protein + p.carbs + p.fat, 1);
      const fuera = [p.protein, p.carbs, p.fat].some((valor) => valor < 0 || valor > 100);
      if (fuera || Math.abs(suma - 100) > 0.1) {
        imposibles.push(`${ficha.id} (${ficha.names.es}): ${p.protein}/${p.carbs}/${p.fat} suma ${suma}`);
      }
    }
    assert.deepEqual(imposibles, [], `fichas con porcentajes imposibles: ${imposibles.length}`);
    // LOS CONTEOS SE AFIRMAN, porque un verde no prueba que el bucle recorrió
    // nada: un `null` que se comiera medio catálogo pasaría igual de silencioso.
    // Medido el 03/09/2026: 1.108 de 1.115 reparten (las otras 7 son agua, sal,
    // café y la bebida destilada) y 253 llevan letra chica.
    assert.ok(repartidas > fichas.length * 0.95, `solo ${repartidas} de ${fichas.length} fichas repartieron`);
    assert.ok(conLetraChica > 50, `solo ${conLetraChica} fichas ejercitaron la rama del motivo escrito`);
  });

  it("la banana y las cerezas, que publicaban más de 100", () => {
    // Los dos casos medidos en producción el 02/09/2026: banana `carbs 102,7 %`
    // con `sin_explicar −10,9`, cerezas `101,7 %` con `−11,3`.
    for (const [id, carbsViejo] of [
      ["fdc-173944", 102.7],
      ["fdc-171719", 101.7],
    ] as const) {
      const ficha = fichaReal(id);
      const p = porcentajesDeMacros(escalar(ficha.per_100g, 100));
      assert.ok(p, `${id} tiene que repartir`);
      assert.ok(p.carbs <= 100, `${id}: ${p.carbs} % de hidratos sigue siendo imposible`);
      assert.ok(p.carbs < carbsViejo, `${id}: el porcentaje viejo (${carbsViejo}) no se movió`);
      assert.equal(redondear(p.protein + p.carbs + p.fat, 1), 100);
      // La diferencia no se perdió: sigue publicada, con signo y con su motivo.
      assert.ok(p.diferencia_pct < -5, `${id}: la diferencia tiene que seguir viajando`);
      assert.ok(p.kcal_fuera_de_macros < 0);
      assert.match(p.motivo_de_la_diferencia ?? "", /fruta|fibra/);
    }
  });

  it("la banana: los números exactos que se publican ahora", () => {
    // 1,09×4 + 22,84×4 + 0,33×9 = 98,69 kcal de macros; la ficha declara 89.
    const p = porcentajesDeMacros(escalar(fichaReal("fdc-173944").per_100g, 100));
    assert.ok(p);
    assert.equal(p.protein, 4.4);
    assert.equal(p.carbs, 92.6);
    assert.equal(p.fat, 3);
    assert.equal(p.kcal_fuera_de_macros, -9.7);
    assert.equal(p.diferencia_pct, -10.9);
  });
});

/* ===========================================================================
 * EL HALO DE PLAUSIBILIDAD (card 5.3)
 *
 * TODOS LOS ESCENARIOS DE ESTE BLOQUE ESTÁN CONSTRUIDOS, ninguno buscado en el
 * catálogo, y es la regla del proyecto: el escenario de un candado se construye.
 * Una composición que da 120 g de macros por 100 g no existe hoy — el candado
 * está justamente para el día que exista.
 * =========================================================================== */

/** Unos valores por 100 g plausibles, para mover UNA cosa por vez. */
const PLAUSIBLE: Per100g = {
  kcal: 250,
  protein_g: 10,
  carbs_g: 30,
  fat_g: 10,
  fiber_g: 3,
  sat_fat_g: 4,
  sugars_g: 5,
  sodium_mg: 400,
};

describe("card 5.3 — el halo de plausibilidad: lo que no puede existir no se publica", () => {
  it("unos valores normales pasan, y pasan sin motivos", () => {
    const v = esPlausible(PLAUSIBLE);
    assert.equal(v.plausible, true);
    assert.deepEqual(v.motivos, []);
  });

  it("LA MASA: 120 g de macronutrientes en 100 g de comida no existe", () => {
    // El caso que pidió la card, construido: una composición mal escalada. 40 +
    // 50 + 30 = 120 g en 100 g. Las kcal se ponen coherentes con Atwater a
    // propósito, para que el único motivo sea la masa y no un efecto de rebote.
    const v = esPlausible({ ...PLAUSIBLE, protein_g: 40, carbs_g: 50, fat_g: 30, kcal: 630 });
    assert.equal(v.plausible, false);
    assert.equal(v.motivos.length, 1);
    assert.match(v.motivos[0] ?? "", /120 g en 100 g de comida/);
  });

  it("la masa se mide SIN la fibra, porque la fibra ya está adentro de los hidratos", () => {
    // Es el hallazgo de la card, escrito como candado: las semillas de chía
    // declaran 42,1 g de hidratos y 34,4 de fibra, y sumarlas dos veces daría
    // 123,8 g. Sumadas UNA vez son 89,3 y la ficha es perfectamente real.
    const chia = { ...PLAUSIBLE, protein_g: 16.5, carbs_g: 42.1, fat_g: 30.7, fiber_g: 34.4, kcal: 486 };
    assert.equal(esPlausible(chia).plausible, true);
  });

  it("la fibra no puede pasar a los hidratos que la contienen", () => {
    const v = esPlausible({ ...PLAUSIBLE, carbs_g: 5, fiber_g: 20, kcal: 150 });
    assert.equal(v.plausible, false);
    assert.match(v.motivos.join(" "), /fibra/i);
  });

  it("EL TECHO: 1.200 kcal en 100 g no existe — ni la grasa pura llega", () => {
    // El segundo caso que pidió la card. Se construye con la grasa al límite y
    // las calorías infladas: es exactamente la forma de una cuenta mal escalada.
    const v = esPlausible({ ...PLAUSIBLE, kcal: 1200, protein_g: 0, carbs_g: 0, fat_g: 100, fiber_g: 0 });
    assert.equal(v.plausible, false);
    assert.match(v.motivos.join(" "), /1200 kcal en 100 g/);
  });

  it("la grasa pura SÍ pasa: 902 kcal es lo que declaran el sebo y la manteca", () => {
    // El techo se calibró contra el dato, no contra la teoría (Atwater diría
    // 900). Las dos fichas de grasa al 100 % del catálogo tienen que pasar.
    for (const id of ["fdc-171400", "fdc-171401"]) {
      const v = esPlausible(fichaReal(id).per_100g);
      assert.equal(v.plausible, true, `${id}: ${v.motivos.join(" ")}`);
    }
  });

  it("ATWATER POR ABAJO: unas calorías que sus macros no explican ni de lejos", () => {
    // 10+30+10 dan 250 kcal con 4/4/9; declarar 50 es quedarse un 80 % abajo.
    const v = esPlausible({ ...PLAUSIBLE, kcal: 50 });
    assert.equal(v.plausible, false);
    assert.match(v.motivos.join(" "), /faltan más calorías/);
  });

  it("y la verdura de USDA sigue pasando, que es por lo que el margen es del 40 %", () => {
    // `Alcaparras` es la ficha más extrema del catálogo: 23 kcal declaradas
    // contra 36,7 que dan sus macros, un −37,4 %. Con el ±15 % que parecía
    // razonable, este candado le sacaría el número a cualquier ensalada.
    assert.equal(esPlausible(fichaReal("fdc-172238").per_100g).plausible, true);
    assert.equal(esPlausible(fichaReal("fdc-168155").per_100g).plausible, true); // Lima cruda, −35,8 %
  });

  it("ATWATER POR ARRIBA: calorías que no vienen de ningún macronutriente", () => {
    const v = esPlausible({ ...PLAUSIBLE, kcal: 500 });
    assert.equal(v.plausible, false);
    assert.match(v.motivos.join(" "), /sobran calorías/);
  });

  it("EL ALCOHOL ES LA EXCEPCIÓN, Y SE DECLARA: sin declararla, un destilado es imposible", () => {
    // `Bebida destilada`: 231 kcal/100 g con CERO macronutrientes. Ningún margen
    // relativo la deja pasar, y tiene que pasar cuando la taxonomía dice que esa
    // familia aporta alcohol — y no cuando no lo dice.
    const destilado = fichaReal("fdc-174815").per_100g;
    assert.equal(esPlausible(destilado).plausible, false);
    assert.equal(esPlausible(destilado, { aporta_alcohol: true }).plausible, true);
  });

  it("la excepción del alcohol TIENE TECHO: 100 g de etanol son 700 kcal y no más", () => {
    const v = esPlausible({ ...PLAUSIBLE, kcal: 1000, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }, { aporta_alcohol: true });
    assert.equal(v.plausible, false);
    assert.match(v.motivos.join(" "), /ni siquiera del alcohol/);
  });

  it("un NaN o un negativo se cortan primero, y solos", () => {
    const conNaN = esPlausible({ ...PLAUSIBLE, kcal: Number.NaN });
    assert.equal(conNaN.plausible, false);
    assert.match(conNaN.motivos.join(" "), /no es un número/);
    const negativo = esPlausible({ ...PLAUSIBLE, fat_g: -3 });
    assert.equal(negativo.plausible, false);
    assert.match(negativo.motivos.join(" "), /negativo/);
    // Y son EXCLUYENTES: con un valor roto no se opina sobre Atwater, porque
    // cualquier cuenta que lo incluya también está rota.
    assert.equal(conNaN.motivos.length, 1);
  });

  it("un café con 0 kcal no dispara nada: por debajo de 5 kcal la comparación es ruido", () => {
    // `Café descafeinado` declara 0 kcal y sus macros dan 0,4 — un −100 % que en
    // la realidad es un redondeo. Un candado que se dispara con el café no sirve.
    assert.equal(esPlausible(fichaReal("fdc-2710451").per_100g).plausible, true);
  });
});

describe("card 5.3 — la masa del plato contra la suma de sus ingredientes", () => {
  it("cuando se parecen, manda la que estimó la visión para el plato", () => {
    const r = masaCoherente(300, 290);
    assert.equal(r.gramos, 300);
    assert.equal(r.motivo, null);
  });

  it("el doble justo todavía se acepta: la cocción sola mueve el peso hasta un 25 %", () => {
    assert.equal(masaCoherente(200, 100).motivo, null);
    assert.equal(masaCoherente(100, 200).motivo, null);
  });

  it("MÁS DEL DOBLE: gana la suma de los ingredientes, y se declara", () => {
    const r = masaCoherente(900, 300);
    assert.equal(r.gramos, 300);
    assert.match(r.motivo ?? "", /no pueden ser del mismo plato/);
  });

  it("MENOS DE LA MITAD: la misma regla, del otro lado", () => {
    const r = masaCoherente(100, 500);
    assert.equal(r.gramos, 500);
    assert.ok(r.motivo !== null);
  });

  it("sin gramos del plato se usa la suma, y sin ninguno de los dos no se inventa nada", () => {
    assert.deepEqual(masaCoherente(0, 250), { gramos: 250, motivo: null });
    assert.deepEqual(masaCoherente(Number.NaN, 250), { gramos: 250, motivo: null });
    assert.deepEqual(masaCoherente(250, 0), { gramos: 250, motivo: null });
    assert.deepEqual(masaCoherente(0, 0), { gramos: 0, motivo: null });
  });
});
