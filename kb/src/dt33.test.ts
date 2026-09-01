/**
 * El lote de fichas de la DT-33 (card 6.4), contra el catálogo PUBLICADO.
 *
 * Mismo contrato que `dt27.test.ts`, y por los mismos dos motivos: lee
 * `build/foods.canonical.json` DE DISCO y no corre el pipeline, porque el CI no
 * tiene los datasets de USDA (1,1 GB, fuera de git) y porque lo que se seedea a
 * Firestore es ese archivo. Que el archivo sea de verdad el que produce el
 * pipeline lo verifica `pipeline.test.ts`, del otro lado de la frontera.
 *
 * QUÉ FIJA, que es lo que ningún candado del build puede ver:
 *
 *   1. Las 33 fichas promovidas de USDA están, con su nombre en español y su
 *      número. Un catálogo puede pasar los seis candados en verde y haberse
 *      quedado otra vez sin salmón.
 *   2. Las 43 fichas derivadas por receta están, y su densidad calórica cae en
 *      el rango que la card declaró. El rango es ANCHO a propósito: no es un
 *      test de la receta —eso lo hace `recipes.test.ts` con la aritmética— sino
 *      un cinturón contra el error de tipeo que multiplica por diez.
 *   3. Las cinco decisiones de NO promover están sostenidas: los duplicados y
 *      los falsos amigos que se descartaron siguen fuera. Un lote que dice venir
 *      a tapar huecos no puede meter seis duplicados por la puerta de atrás.
 *   4. La aditividad, del lado que un test puede ver: las 1.036 fichas de la
 *      3.3.0 siguen ahí y el total es exactamente 1.114 (1.112 de la 3.4.0 más
 *      las 2 que sumó la card 6.4b, que son de otro lote).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CATALOG_FILE } from "./build";
import { type CanonicalFood, type Catalog } from "./types";

const catalog = JSON.parse(readFileSync(CATALOG_FILE, "utf8")) as Catalog;
const byId = new Map(catalog.foods.map((food) => [food.id, food]));

function ficha(id: string): CanonicalFood {
  const food = byId.get(id);
  assert.ok(food, `${id} no está en el catálogo publicado`);
  return food;
}

/** Las 33 promovidas de USDA, con lo que cada una tiene que decir. */
const PROMOVIDAS: { id: string; es: string; kcal: number; fuente: string }[] = [
  { id: "fdc-2706285", es: "Salmón", kcal: 274, fuente: "FNDDS — Fish, salmon, NFS" },
  { id: "fdc-2706287", es: "Salmón a la plancha", kcal: 259, fuente: "FNDDS — Fish, salmon, grilled" },
  { id: "fdc-2706292", es: "Salmón ahumado", kcal: 117, fuente: "FNDDS — Fish, salmon, smoked" },
  { id: "fdc-2706284", es: "Salmón crudo", kcal: 188, fuente: "FNDDS — Fish, salmon, raw" },
  { id: "fdc-2706350", es: "Mejillones", kcal: 109, fuente: "FNDDS — Mussels" },
  { id: "fdc-173704", es: "Pez espada a la plancha", kcal: 172, fuente: "SR Legacy — swordfish, cooked, dry heat" },
  { id: "fdc-174194", es: "Anguila a la plancha", kcal: 236, fuente: "SR Legacy — eel, cooked, dry heat" },
  { id: "fdc-2706344", es: "Cangrejo", kcal: 83, fuente: "FNDDS — Crab" },
  { id: "fdc-2706349", es: "Bogavante", kcal: 97, fuente: "FNDDS — Lobster (northern)" },
  { id: "fdc-172009", es: "Langosta cocida", kcal: 143, fuente: "SR Legacy — spiny lobster, cooked, moist heat" },
  { id: "fdc-174223", es: "Calamar crudo", kcal: 92, fuente: "SR Legacy — squid, mixed species, raw" },
  { id: "fdc-167744", es: "Caracoles crudos", kcal: 90, fuente: "SR Legacy — snail, raw" },
  { id: "fdc-2705912", es: "Conejo guisado", kcal: 204, fuente: "FNDDS — Rabbit" },
  { id: "fdc-2706157", es: "Riñones", kcal: 157, fuente: "FNDDS — Kidney" },
  { id: "fdc-2706158", es: "Mollejas", kcal: 124, fuente: "FNDDS — Sweetbreads" },
  { id: "fdc-2706154", es: "Hígado de pollo", kcal: 189, fuente: "FNDDS — Liver, chicken" },
  { id: "fdc-2706149", es: "Codorniz", kcal: 226, fuente: "FNDDS — Quail, cooked" },
  { id: "fdc-2706150", es: "Faisán", kcal: 238, fuente: "FNDDS — Pheasant, cooked" },
  { id: "fdc-172499", es: "Paletilla de cordero al horno", kcal: 204, fuente: "SR Legacy — lamb shoulder, lean, roasted" },
  { id: "fdc-167812", es: "Panceta cruda", kcal: 518, fuente: "SR Legacy — Pork, fresh, belly, raw" },
  { id: "fdc-2708357", es: "Pasta cocida", kcal: 157, fuente: "FNDDS — Pasta, cooked" },
  { id: "fdc-168894", es: "Harina de trigo", kcal: 364, fuente: "SR Legacy — Wheat flour, white, all-purpose" },
  { id: "fdc-2709910", es: "Maíz fresco cocido sin grasa", kcal: 86, fuente: "FNDDS — Corn, fresh, cooked, no added fat" },
  { id: "fdc-2709889", es: "Repollo verde cocido sin grasa", kcal: 32, fuente: "FNDDS — Cabbage, green, cooked, no added fat" },
  { id: "fdc-2709852", es: "Judías verdes frescas cocidas sin grasa", kcal: 42, fuente: "FNDDS — Green beans, fresh, cooked, no added fat" },
  { id: "fdc-2709766", es: "Alcachofa cocida", kcal: 53, fuente: "FNDDS — Artichoke" },
  { id: "fdc-2707367", es: "Habas cocidas con sal y grasa", kcal: 161, fuente: "FNDDS — Fava beans, cooked" },
  { id: "fdc-169338", es: "Cardo cocido", kcal: 20, fuente: "SR Legacy — Cardoon, cooked, boiled, with salt" },
  { id: "fdc-2709808", es: "Calabacín crudo", kcal: 17, fuente: "FNDDS — Summer squash, green, raw" },
  { id: "fdc-172238", es: "Alcaparras", kcal: 23, fuente: "SR Legacy — Capers, canned" },
  { id: "fdc-2707587", es: "Tahini", kcal: 697, fuente: "FNDDS — Tahini" },
  { id: "fdc-2709830", es: "Ensalada griega", kcal: 48, fuente: "FNDDS — Greek Salad, no dressing" },
  { id: "fdc-2710049", es: "Crema de berenjena", kcal: 183, fuente: "FNDDS — Eggplant dip" },
];

/**
 * Las 43 recetas del lote, con el rango declarado de densidad calórica.
 *
 * El rango es ANCHO —±25 % en la mayoría— porque no vigila la receta sino el
 * orden de magnitud: `recipes.test.ts` ya verifica que la aritmética cierre, y
 * los candados 2 y 3 del build verifican el rendimiento y Atwater. Lo que este
 * test frena es el error que ningún otro ve: un `grams` con un cero de más.
 */
const RECETAS: { id: string; es: string; min: number; max: number }[] = [
  { id: "receta-marmitako", es: "Marmitako", min: 80, max: 140 },
  { id: "receta-arroz-a-banda", es: "Arroz a banda", min: 120, max: 190 },
  { id: "receta-gallina-en-pepitoria", es: "Gallina en pepitoria", min: 130, max: 200 },
  { id: "receta-pote-gallego", es: "Pote gallego", min: 65, max: 120 },
  { id: "receta-morteruelo", es: "Morteruelo", min: 210, max: 330 },
  { id: "receta-rinones-al-jerez", es: "Riñones al Jerez", min: 125, max: 200 },
  { id: "receta-txangurro", es: "Txangurro a la donostiarra", min: 100, max: 160 },
  { id: "receta-fideua", es: "Fideuá", min: 125, max: 195 },
  { id: "receta-caracoles-a-la-llauna", es: "Caracoles a la llauna", min: 125, max: 205 },
  { id: "receta-conejo-al-ajillo", es: "Conejo al ajillo", min: 195, max: 300 },
  { id: "receta-porrusalda", es: "Porrusalda", min: 45, max: 90 },
  { id: "receta-all-i-pebre", es: "All i pebre de anguila", min: 130, max: 205 },
  { id: "receta-merluza-a-la-gallega", es: "Merluza a la gallega", min: 115, max: 180 },
  { id: "receta-arroz-al-caldero", es: "Arroz al caldero", min: 120, max: 190 },
  { id: "receta-butifarra-con-alubias", es: "Butifarra con alubias", min: 185, max: 290 },
  { id: "receta-cocido-montanes", es: "Cocido montañés", min: 80, max: 130 },
  { id: "receta-cardos-a-la-navarra", es: "Cardos a la navarra", min: 85, max: 140 },
  { id: "receta-caldereta-de-cordero", es: "Caldereta de cordero", min: 125, max: 195 },
  { id: "receta-caldereta-de-langosta", es: "Caldereta de langosta", min: 80, max: 130 },
  { id: "receta-pipirrana", es: "Pipirrana", min: 60, max: 100 },
  { id: "receta-bonito-con-tomate", es: "Bonito con tomate", min: 110, max: 175 },
  { id: "receta-tumbet", es: "Tumbet", min: 90, max: 145 },
  { id: "receta-habas-a-la-catalana", es: "Habas a la catalana", min: 165, max: 260 },
  { id: "receta-alcachofas-con-jamon", es: "Alcachofas con jamón", min: 95, max: 150 },
  { id: "receta-gachas-manchegas", es: "Gachas manchegas", min: 120, max: 190 },
  { id: "receta-calamares-en-su-tinta", es: "Calamares en su tinta", min: 68, max: 110 },
  { id: "receta-arroz-con-costra", es: "Arroz con costra", min: 128, max: 200 },
  { id: "receta-escudella", es: "Escudella y carn d'olla", min: 70, max: 115 },
  { id: "receta-shakshuka", es: "Shakshuka", min: 75, max: 120 },
  { id: "receta-ensalada-nicoise", es: "Ensalada Niçoise", min: 95, max: 150 },
  { id: "receta-ensalada-fattoush", es: "Ensalada Fattoush", min: 65, max: 105 },
  { id: "receta-pasta-alla-norma", es: "Pasta Alla Norma", min: 94, max: 150 },
  { id: "receta-arancini", es: "Arancini", min: 190, max: 300 },
  { id: "receta-tortilla-de-camarones", es: "Tortilla de camarones", min: 220, max: 350 },
  { id: "receta-pastel-de-cabracho", es: "Pastel de cabracho", min: 128, max: 205 },
  { id: "receta-cocochas-en-salsa", es: "Cocochas en salsa", min: 134, max: 215 },
  { id: "receta-gazpachos-manchegos", es: "Gazpachos manchegos", min: 130, max: 210 },
  { id: "receta-leche-frita", es: "Leche frita", min: 160, max: 255 },
  { id: "receta-tocinillo-de-cielo", es: "Tocinillo de cielo", min: 240, max: 380 },
  { id: "receta-quesada-pasiega", es: "Quesada pasiega", min: 220, max: 350 },
  { id: "receta-ensaimada", es: "Ensaimada mallorquina", min: 325, max: 510 },
  { id: "receta-pestinos", es: "Pestiños", min: 300, max: 470 },
  { id: "receta-coca", es: "Coca", min: 155, max: 250 },
];

/**
 * Los cinco que se evaluaron y NO entraron, con el motivo en una línea. Están
 * escritos para que nadie los proponga de nuevo sin leer por qué se cayeron.
 */
const DESCARTADOS: { id: string; motivo: string }[] = [
  { id: "fdc-2706286", motivo: "Fish, salmon, baked or broiled: los MISMOS ocho nutrientes que la NFS (fdc-2706285), hasta el decimal" },
  { id: "fdc-2706301", motivo: "Fish, swordfish de FNDDS: 14,9 % de rebozado en su input_food — es el caso `Bacalao rebozado` de la DT-7" },
  { id: "fdc-2706247", motivo: "Fish, eel de FNDDS: mismo 14,9 % de rebozado" },
  { id: "fdc-174217", motivo: "Mollusks, mussel, blue, cooked, moist heat: su names.en no responde al término `mussels`, que es el que escribe la visión" },
  { id: "fdc-2706191", motivo: "Pork sausage: 325 kcal, idénticas a `Sausage, NFS` que ya está en el catálogo" },
];

test("las 33 fichas promovidas de la DT-33 están, con su nombre y su número", () => {
  for (const esperada of PROMOVIDAS) {
    const food = ficha(esperada.id);
    assert.equal(food.names.es, esperada.es, `${esperada.id} cambió de nombre en español`);
    assert.equal(
      food.per_100g.kcal,
      esperada.kcal,
      `${esperada.id} (${esperada.es}) cambió de kcal/100 g — fuente: ${esperada.fuente}`,
    );
    // Ninguna es manual ni receta: los 33 números son de USDA, campo a campo.
    assert.ok(
      food.source === "usda_sr_legacy" || food.source === "usda_fndds",
      `${esperada.id} tiene que venir de USDA, no de curación`,
    );
    assert.equal(food.provenance["per_100g.kcal"], food.source);
    assert.equal(food.provenance["names.es"], "curation");
  }
  assert.equal(PROMOVIDAS.length, 33);
});

test("las 43 recetas de la DT-33 están y su densidad cae donde se declaró", () => {
  const fuera: string[] = [];
  for (const esperada of RECETAS) {
    const food = ficha(esperada.id);
    assert.equal(food.names.es, esperada.es, `${esperada.id} cambió de nombre en español`);
    assert.equal(food.source, "receta", `${esperada.id} tiene que ser una ficha derivada`);
    // Una receta SIEMPRE declara de qué está hecha: sin eso el valor no se puede
    // rehacer, que es la única razón por la que una ficha derivada es aceptable.
    assert.ok(food.receta !== undefined, `${esperada.id} no trae su receta al catálogo`);
    assert.ok((food.caveats ?? []).length > 0, `${esperada.id} no declara ni un caveat`);
    const kcal = food.per_100g.kcal;
    if (kcal < esperada.min || kcal > esperada.max) {
      fuera.push(`${esperada.es}: ${kcal} kcal/100 g, fuera de [${esperada.min}, ${esperada.max}]`);
    }
  }
  assert.deepEqual(fuera, [], `recetas fuera de su rango declarado:\n  ${fuera.join("\n  ")}`);
  assert.equal(RECETAS.length, 43);
});

test("los cinco descartados del lote siguen fuera del catálogo", () => {
  for (const descartado of DESCARTADOS) {
    assert.equal(
      byId.has(descartado.id),
      false,
      `${descartado.id} entró al catálogo y no debería: ${descartado.motivo}`,
    );
  }
});

test("el lote es ADITIVO: 1.036 + 76, ninguna retirada", () => {
  // 1.022 de la 3.1.0 + 14 de la DT-27 (card 6.2) + 33 promovidas + 43 recetas,
  // más las 2 que sumó la card 6.4b (`receta-calcots` y `manual-salsa-de-calcots`),
  // que no pertenecen a ESTE lote y por eso no entran en el conteo de abajo.
  assert.equal(catalog.foods.length, 1114);
  const promovidas = new Set(PROMOVIDAS.map((p) => p.id));
  const recetas = new Set(RECETAS.map((r) => r.id));
  const nuevas = catalog.foods.filter((f) => promovidas.has(f.id) || recetas.has(f.id));
  assert.equal(nuevas.length, 76, "el lote tiene que aportar exactamente 76 fichas");
});

test("el hueco de proteína del censo está tapado por las cuatro puntas", () => {
  // Los cuatro que la DT-33 nombraba uno por uno como «no hay NINGUNA ficha».
  // Se busca por CONTENIDO del nombre y no por id: si mañana alguien renombra la
  // ficha pero el alimento sigue, el test pasa; si el alimento desaparece, no.
  const hay = (patron: RegExp): boolean =>
    catalog.foods.some((f) => f.names.es !== null && patron.test(f.names.es));
  assert.ok(hay(/^Salmón/), "el catálogo se quedó otra vez sin salmón");
  assert.ok(hay(/^Mejillones$/), "el catálogo se quedó sin mejillón");
  assert.ok(hay(/^Pez espada/), "el catálogo se quedó sin pez espada");
  assert.ok(hay(/^Pasta cocida$/), "el catálogo se quedó sin pasta cocida simple");
  assert.ok(hay(/^Harina de trigo$/), "el catálogo se quedó sin harina de trigo");
});
