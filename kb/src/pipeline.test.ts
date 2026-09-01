/**
 * El pipeline completo contra los CSVs reales de USDA.
 *
 * Es el único test que lee los datasets: verifica que el catálogo se compile,
 * que los seis candados den verde y que dos corridas completas produzcan el
 * mismo archivo byte a byte. Tarda unos segundos porque efectivamente recorre
 * los CSVs dos veces: esa es justamente la prueba.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CATALOG_FILE, runContentLocks, runPipeline } from "./build";
import { caveatDeSodio, esGenerico } from "./genericos";
import { GOLDEN_CHECKS, MINIMUM_BY_SOURCE, lockAtwater, lockIdempotence } from "./locks";
import { loadExclusions } from "./selection";
import { aliasText } from "./types";

test("el pipeline compila el catálogo y pasa los seis candados", { timeout: 600_000 }, async () => {
  const first = await runPipeline();
  const locks = runContentLocks(first.catalog, first.stats, first.alcohol, first.curation);

  for (const lock of locks) {
    assert.equal(lock.passed, true, `candado ${lock.id} falló: ${lock.failures.join(" | ")}`);
  }

  assert.ok(first.catalog.foods.length > 900, "el catálogo tiene que traer los ~1.000 seleccionados");
  assert.ok(
    first.stats.manualFoods >= MINIMUM_BY_SOURCE.manual,
    "la curación manual tiene que haber aportado al menos un alimento",
  );
  assert.ok(
    first.stats.recipeFoods >= MINIMUM_BY_SOURCE.receta,
    "las recetas compuestas tienen que haber aportado al menos un alimento",
  );
  assert.deepEqual(first.stats.recipeFailures, [], "ninguna receta puede quedar sin derivar");
  assert.ok(first.stats.bySource.usda_fndds >= MINIMUM_BY_SOURCE.usda_fndds);
  assert.ok(first.stats.bySource.usda_sr_legacy >= MINIMUM_BY_SOURCE.usda_sr_legacy);
  assert.match(first.catalog.kb_version, /^3\.6\.0\+[0-9a-f]{8}$/);

  const second = await runPipeline();
  const idempotence = lockIdempotence(first.json, second.json);
  assert.equal(idempotence.passed, true, idempotence.failures.join(" | "));
  assert.equal(first.catalog.kb_version, second.catalog.kb_version);
});

/**
 * El puente entre este archivo y los que corren SIN los datasets.
 *
 * `build/foods.canonical.json` se commitea, es lo que lee el seed y es lo que
 * miran los tests de contenido (`dt27.test.ts`) porque el CI no tiene los CSVs.
 * Todo eso se apoya en una promesa que hasta ahora no verificaba nadie: que el
 * archivo commiteado sea EXACTAMENTE el que produce el pipeline. Sin este test,
 * un catálogo viejo commiteado deja en verde a todos los demás y se publica.
 */
test("el catálogo commiteado es byte a byte el que produce el pipeline", { timeout: 600_000 }, async () => {
  const { json } = await runPipeline();
  const commiteado = readFileSync(CATALOG_FILE, "utf8");
  assert.equal(
    commiteado,
    json,
    "kb/build/foods.canonical.json quedó viejo: corré `npm run build` y commiteá la salida",
  );
});

/**
 * La otra mitad de la mordida del candado 3 (la primera está en `dt27.test.ts`,
 * que verifica que SIN alcohol las seis bebidas rompen). Acá se fija que el
 * alcohol de verdad llega desde los CSVs: si el pipeline dejara de leer el
 * nutriente del alcohol, el mapa saldría vacío y las bebidas romperían el build.
 */
test("las bebidas alcohólicas traen su alcohol desde los CSVs", { timeout: 600_000 }, async () => {
  const { catalog, alcohol, stats } = await runPipeline();
  const esperado: [string, number][] = [
    ["fdc-168746", 3.9], // cerveza
    ["fdc-168749", 3.1], // cerveza light
    ["fdc-171906", 7.7], // cerveza de alta graduación
    ["fdc-173190", 10.6], // vino tinto
    ["fdc-174837", 10.3], // vino blanco
    ["fdc-174815", 33.4], // destilado 80 proof
  ];
  for (const [id, gramos] of esperado) {
    assert.equal(alcohol.get(id), gramos, `${id} perdió su alcohol: el candado 3 lo necesita`);
  }
  assert.equal(lockAtwater(catalog, alcohol).passed, true);
  // Y las porciones de barra que agregó la curación (card 6.2) están contadas.
  assert.ok(
    stats.curatedPortionHints >= 25,
    `la curación agregó ${stats.curatedPortionHints} porciones; se esperaban al menos 25`,
  );
});

test("cada caso dorado existe de verdad en la selección", { timeout: 600_000 }, async () => {
  const { catalog } = await runPipeline();
  const ids = new Set(catalog.foods.map((food) => food.id));
  for (const check of GOLDEN_CHECKS) {
    assert.ok(ids.has(`fdc-${check.fdc_id}`), `${check.label} no está en el catálogo`);
  }
});

test("las fichas que la DT-7 excluyó NO están en el catálogo, y sus reemplazos SÍ", { timeout: 600_000 }, async () => {
  const { catalog } = await runPipeline();
  const byId = new Map(catalog.foods.map((food) => [food.id, food]));
  const exclusions = loadExclusions();
  assert.ok(exclusions !== null, "la DT-7 tiene que estar declarada");
  for (const item of exclusions.exclusions) {
    assert.equal(byId.has(`fdc-${item.fdc_id}`), false, `fdc-${item.fdc_id} tendría que estar excluido`);
    const superviviente = byId.get(`fdc-${item.duplicado_de}`);
    assert.ok(superviviente, `fdc-${item.duplicado_de} tiene que quedar en el catálogo`);
    // Excluir no puede achicar el vocabulario: lo que perdía el excluido se hereda.
    const textos = superviviente.aliases.es.map(aliasText);
    for (const alias of item.aliases_heredados) {
      assert.ok(textos.includes(alias), `"${alias}" tendría que haber quedado como alias de fdc-${item.duplicado_de}`);
    }
  }
});

test("la política DT-13 alcanza a TODOS los genéricos del catálogo real", { timeout: 600_000 }, async () => {
  const { catalog, curation, stats } = await runPipeline();
  const regla = curation.genericRule;
  assert.ok(regla !== null, "la política de genéricos tiene que estar declarada");

  let marcados = 0;
  let conCaveat = 0;
  for (const food of catalog.foods) {
    const esUsda: boolean = food.source === "usda_fndds" || food.source === "usda_sr_legacy";
    const deberia: boolean = esUsda && esGenerico(food.names.en, regla.marcadores_en);
    assert.equal(food.generic === true, deberia, `${food.id} "${food.names.en}": la marca generic no coincide`);
    if (!deberia) continue;
    marcados += 1;
    const esperado = caveatDeSodio(food.per_100g.sodium_mg, regla);
    if (esperado === null) continue;
    conCaveat += 1;
    assert.deepEqual(food.caveats, [esperado], `${food.id} no trae el caveat generado`);
  }
  // Los conteos que declaró el Bloque 0 de la card, con el catálogo ya fusionado.
  assert.equal(marcados, stats.genericFoods);
  assert.equal(conCaveat, stats.genericCaveats);
  assert.ok(marcados > 300, `se esperaban más de 300 genéricos, hay ${marcados}`);
  assert.ok(conCaveat > 90, `se esperaban más de 90 caveats generados, hay ${conCaveat}`);
});

test("`chorizo` a secas es del EMBUTIDO, nunca del corte vacuno", { timeout: 600_000 }, async () => {
  // La guarda vive en curation/guardas.vocabulario.json y la hace cumplir el
  // candado 1; este test mira el catálogo real desde el otro lado: quién se
  // queda con la palabra. El matcher de la fase 2 tendrá su propia guarda.
  const { catalog, stats } = await runPipeline();
  assert.deepEqual(stats.guardViolations, [], "ninguna guarda de vocabulario puede estar violada");

  const plano = (v: string): string =>
    v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const duenos = catalog.foods
    .filter((food) => food.aliases.es.some((alias) => plano(aliasText(alias)) === "chorizo"))
    .map((food) => food.id);
  assert.deepEqual(duenos, ["fdc-2706179"], "el alias `chorizo` es del chorizo fresco y de nadie más");

  const bife = catalog.foods.find((food) => food.id === "fdc-2705835");
  assert.ok(bife, "el bife de chorizo tiene que seguir en el catálogo: es otro alimento, no un duplicado");
  assert.equal(bife.names.es, "Bife de chorizo");
  for (const alias of bife.aliases.es) assert.notEqual(plano(aliasText(alias)), "chorizo");
});

test("las decisiones DT-8 quedaron ejecutadas en el catálogo", { timeout: 600_000 }, async () => {
  const { catalog } = await runPipeline();
  const byId = new Map(catalog.foods.map((food) => [food.id, food]));

  // Las tres fusiones: sale una ficha, queda la otra. (Que el vocabulario se
  // herede lo verifica el test de las exclusiones, que recorre el archivo entero.)
  for (const [sale, queda] of [
    ["fdc-169768", "fdc-2709492"],
    ["fdc-2707348", "fdc-2707347"],
    ["fdc-2709517", "fdc-2709511"],
  ]) {
    assert.equal(byId.has(sale as string), false, `${sale} tendría que estar fusionado`);
    assert.ok(byId.has(queda as string), `${queda} tiene que quedar`);
  }

  // Los dos pares de parmesano se CONSERVAN: la diferencia es real.
  for (const id of ["fdc-2705728", "fdc-171247", "fdc-2705730"]) {
    assert.ok(byId.has(id), `${id} tiene que seguir en el catálogo`);
  }
  // Y la porción absurda de la ficha de SR quedó corregida: 100 g de parmesano
  // rallado no son una porción, son un envase.
  const parmesanoSr = byId.get("fdc-171247");
  assert.equal(parmesanoSr?.default_portion_g, 5);
  assert.equal(parmesanoSr?.provenance["default_portion_g"], "curation");
  assert.ok(
    parmesanoSr?.portion_hints.some((hint) => hint.grams === 5 && hint.label_es === "1 cucharada rallada"),
    "la porción por defecto tiene que llevar su etiqueta en español",
  );

  // Los pepinillos y la mantequilla genérica NO se tocaron.
  assert.ok(byId.has("fdc-169378"), "los pepinillos dulces siguen: el nombre ya los distingue");
  const mantequilla = byId.get("fdc-2710154");
  assert.equal(mantequilla?.generic, true, "la mantequilla NFS se conserva, marcada como genérica");
  assert.ok((mantequilla?.caveats ?? []).length > 0, "y con el caveat de la DT-13, porque pasa el umbral");
});

test("los alimentos descartados por Atwater no entran al catálogo", { timeout: 600_000 }, async () => {
  const { catalog } = await runPipeline();
  const ids = new Set(catalog.foods.map((food) => food.id));
  // La selección los deja fuera; el build no los reintroduce por la ventana.
  const flagged = ["fdc-2707635"];
  for (const id of flagged) assert.equal(ids.has(id), false, `${id} no debería estar`);
});
