/**
 * EL CANDADO DE COBERTURA MEDITERRÁNEA — card 6.3, endurecido por la card 6.4.
 *
 * Corre el censo de `kb/cobertura/censo.json` contra el catálogo real y falla si
 * un plato que alguna vez estuvo cubierto deja de estarlo.
 *
 * POR QUÉ EXISTE. El censo es una FOTO: dice cómo estaba la cobertura el día que
 * se midió. Una foto no protege nada — el mes que viene alguien cura un alias,
 * el difuso reordena dos candidatos y la fabada vuelve a valer 0,11 sin que nadie
 * se entere hasta la próxima demo. Este test convierte la foto en una promesa.
 *
 * QUÉ VIGILA, y por qué solo eso:
 *
 *   1. Todo plato clasificado `ok` sigue resolviendo A SU MISMA FICHA. Es la
 *      condición dura: no es "sigue habiendo match", es "sigue siendo ESTE".
 *   2. Ninguno de esos platos BAJA de confianza contra la que el censo grabó.
 *      Puede subir todo lo que quiera.
 *   3. Los platos y los ingredientes que el censo marcó `ficha_equivocada`
 *      siguen cayendo donde el censo dice: si alguien los arregla, tiene que
 *      volver a correr el censo y que el número del resumen lo diga. Un arreglo
 *      silencioso es tan malo como una regresión silenciosa, porque deja el
 *      censo mintiendo. (Del lado de los PLATOS esta lista quedó VACÍA con la
 *      card 6.4: los cinco tienen ficha propia, y su reparación la vigila el
 *      test de más abajo, con los pares escritos a mano.)
 *   4. Los ingredientes `ok` no cambian de ficha (misma condición dura que 1).
 *   5. Desde la card 6.4: los cinco reparados y los nueve huecos centrales de la
 *      DT-33 resuelven a la ficha que se les dio, con el par escrito a mano.
 *
 * QUÉ NO VIGILA, declarado a propósito: NADA de lo que está en `ausente_ficha`,
 * `descomponible` ni `confianza_injusta`. Esos son huecos ABIERTOS y el trabajo
 * de las cards que vienen es cerrarlos; un umbral sobre ellos sería adivinar el
 * futuro y romper el build de quien los mejore. El candado protege lo conquistado
 * y nada más — que es exactamente lo que un candado tiene que hacer.
 *
 * SI ESTE TEST ROMPE: mirá si el plato que se movió estaba tapando un hueco (el
 * precedente es la arepa de la card 6.1) o si de verdad se perdió cobertura. En
 * el primer caso se re-corre `node kb/cobertura/censar.js` y el censo cuenta la
 * verdad nueva; en el segundo, se arregla la curación.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { buscarAlimento } from "./match";
import { FACTOR_GENERICO } from "./constants";
import { indiceReal, raizDelRepo } from "./testing";

interface MatchDelCenso {
  ficha_id: string;
  nivel: string;
  confianza_match: number;
  confianza_visible: number;
}
interface FilaDePlato {
  lista: string;
  plato: string;
  clasificacion: string;
  match: MatchDelCenso | null;
}
interface FilaDeIngrediente {
  ingrediente: string;
  clasificacion: string;
  match: MatchDelCenso | null;
}
interface Censo {
  kb_version: string;
  clases: string[];
  resumen: { platos: Record<string, number>; ingredientes: Record<string, number> };
  platos: FilaDePlato[];
  ingredientes: FilaDeIngrediente[];
}

const censo = JSON.parse(
  readFileSync(resolve(raizDelRepo(), "kb", "cobertura", "censo.json"), "utf8"),
) as Censo;
const index = indiceReal();

/** La confianza que ve el usuario: el match menos el 15 % de la ficha genérica. */
function confianzaVisible(termino: string): { id: string; visible: number } | null {
  const r = buscarAlimento(termino, index);
  if (r === null) return null;
  const visible = r.confianza_match * (r.ficha.generic === true ? FACTOR_GENERICO : 1);
  return { id: r.ficha.id, visible: Math.round(visible * 100) / 100 };
}

test("el censo es coherente consigo mismo antes de vigilar nada", () => {
  // Un censo mal formado haría pasar todo lo de abajo por vacío. El número está
  // escrito y no calculado a propósito: si alguien suma o quita un plato sin
  // pasar por una card, este test lo dice.
  assert.equal(censo.platos.length, 141, "son 101 de directoalpaladar + 40 de nuevoestilo");
  assert.equal(censo.ingredientes.length, 196);
  const clases = new Set(censo.clases);
  for (const fila of censo.platos) {
    assert.ok(clases.has(fila.clasificacion), `clase desconocida: ${fila.clasificacion}`);
  }
  for (const fila of censo.ingredientes) {
    assert.ok(clases.has(fila.clasificacion), `clase desconocida: ${fila.clasificacion}`);
  }
  // Un `ok` sin match grabado sería un censo que no se puede verificar.
  for (const fila of [...censo.platos, ...censo.ingredientes]) {
    if (fila.clasificacion === "ok" || fila.clasificacion === "confianza_injusta") {
      assert.notEqual(fila.match, null, `${JSON.stringify(fila)} está clasificado con match nulo`);
    }
    if (fila.clasificacion === "ausente_ficha") {
      assert.equal(fila.match, null, `un ausente_ficha no puede traer match: ${JSON.stringify(fila)}`);
    }
  }
});

test("el censo se midió contra el catálogo que hay hoy", () => {
  // Si el catálogo cambió de versión y nadie re-corrió el censo, todo lo demás
  // está vigilando una foto vieja. No es un detalle: es la diferencia entre un
  // candado y un adorno.
  const catalogo = JSON.parse(
    readFileSync(resolve(raizDelRepo(), "kb", "build", "foods.canonical.json"), "utf8"),
  ) as { kb_version: string };
  assert.equal(
    censo.kb_version,
    catalogo.kb_version,
    "el censo quedó viejo: corré `node kb/cobertura/censar.js` después de tocar la curación",
  );
});

test("ningún plato conquistado pierde su ficha ni baja de confianza", () => {
  const cubiertos = censo.platos.filter((f) => f.clasificacion === "ok");
  // El piso SUBE con cada card que conquista cobertura, y nunca baja: 38 con la
  // card 6.3, 85 con la 6.4 (33 fichas nuevas de USDA y 43 recetas compuestas),
  // 86 con la 6.4b (los `Calçots`) y 87 con la 6.4c (el `Torrezno de Soria`).
  // La 6.4b conquistó su plato y no subió el piso; la 6.4c sube los dos escalones
  // de una, porque un piso que se queda atrás deja de ser un piso.
  assert.ok(cubiertos.length >= 87, `el censo tenía 87 platos cubiertos y ahora declara ${cubiertos.length}`);

  const perdidos: string[] = [];
  const bajaron: string[] = [];
  for (const fila of cubiertos) {
    const esperado = fila.match as MatchDelCenso;
    const hoy = confianzaVisible(fila.plato);
    if (hoy === null || hoy.id !== esperado.ficha_id) {
      perdidos.push(`${fila.plato}: ${esperado.ficha_id} -> ${hoy === null ? "silencio" : hoy.id}`);
      continue;
    }
    if (hoy.visible < esperado.confianza_visible) {
      bajaron.push(`${fila.plato}: ${esperado.confianza_visible} -> ${hoy.visible}`);
    }
  }
  assert.deepEqual(perdidos, [], `platos que cambiaron de ficha:\n  ${perdidos.join("\n  ")}`);
  assert.deepEqual(bajaron, [], `platos que perdieron confianza:\n  ${bajaron.join("\n  ")}`);
});

test("ningún ingrediente conquistado cambia de ficha", () => {
  const cubiertos = censo.ingredientes.filter((f) => f.clasificacion === "ok");
  // Mismo piso que sube y no baja: 37 con la card 6.3, 45 con la 6.4.
  assert.ok(cubiertos.length >= 45, `el censo tenía 45 ingredientes cubiertos, ahora ${cubiertos.length}`);

  const perdidos: string[] = [];
  for (const fila of cubiertos) {
    const esperado = fila.match as MatchDelCenso;
    const hoy = confianzaVisible(fila.ingrediente);
    if (hoy === null || hoy.id !== esperado.ficha_id) {
      perdidos.push(`${fila.ingrediente}: ${esperado.ficha_id} -> ${hoy === null ? "silencio" : hoy.id}`);
    }
  }
  assert.deepEqual(perdidos, [], `ingredientes que cambiaron de ficha:\n  ${perdidos.join("\n  ")}`);
});

test("los errores de ficha que el censo declara siguen siendo los que declara", () => {
  // La cara B del candado. Si alguien arregla uno de estos —y ojalá lo haga— el
  // test rompe hasta que re-corra el censo. Es a propósito: un censo que declara
  // cinco errores cuando quedan cuatro es un documento que miente, y el resumen
  // de kb/cobertura/README.md se lee como si fuera verdad.
  const declarados = censo.platos.filter((f) => f.clasificacion === "ficha_equivocada");
  const desactualizados: string[] = [];
  for (const fila of declarados) {
    const esperado = fila.match as MatchDelCenso;
    const hoy = confianzaVisible(fila.plato);
    if (hoy === null || hoy.id !== esperado.ficha_id) {
      desactualizados.push(
        `${fila.plato}: el censo lo declara cayendo en ${esperado.ficha_id} y hoy cae en ` +
          `${hoy === null ? "silencio" : hoy.id}`,
      );
    }
  }
  assert.deepEqual(
    desactualizados,
    [],
    "el censo quedó viejo — corré `node kb/cobertura/censar.js`:\n  " + desactualizados.join("\n  "),
  );
});

test("los cinco arreglos de vocabulario de la card 6.3 muerden", () => {
  // El test de mordida de las guardas de la v4. No mira el censo: mira el motor,
  // con el par término/ficha ESCRITO acá. Si mañana alguien borra el alias, el
  // censo se re-genera contando la verdad nueva y nadie se entera; este test, no.
  const arreglos: Array<[string, string, string]> = [
    ["ajo", "fdc-169230", "un ajo no es un puerro (fdc-2709935 lleva de alias `Ajo porro`)"],
    ["ajos", "fdc-169230", "el plural del mismo arreglo"],
    ["tomate pera", "fdc-2709719", "un tomate pera no es una pera (fdc-169118)"],
    ["lechuga romana", "fdc-2709789", "la lechuga de una ensalada es cruda, no cocida (fdc-2709949)"],
    ["pechuga de pavo", "fdc-2706104", "el pavo no es pollo (fdc-2705954)"],
  ];
  for (const [termino, esperado, motivo] of arreglos) {
    const hoy = confianzaVisible(termino);
    assert.notEqual(hoy, null, `"${termino}" se quedó sin match: ${motivo}`);
    assert.equal((hoy as { id: string }).id, esperado, `"${termino}" — ${motivo}`);
  }
});

test("los platos que la card 6.3 sacó del silencio siguen teniendo voz", () => {
  // Tres rescates, cada uno apoyado en una ficha que YA estaba en el catálogo.
  // Van escritos y no leídos del censo por lo mismo de siempre: un test que se
  // lee a sí mismo del archivo que vigila no vigila nada.
  const rescates: Array<[string, string]> = [
    ["Pa amb tomàquet", "fdc-2707652"],
    ["Filloas", "fdc-2708341"],
    ["Papas arrugadas", "fdc-2709393"],
    ["Pimientos de piquillo rellenos", "fdc-2709073"],
  ];
  for (const [plato, esperado] of rescates) {
    const hoy = confianzaVisible(plato);
    assert.notEqual(hoy, null, `"${plato}" volvió al silencio`);
    assert.equal((hoy as { id: string }).id, esperado, `"${plato}" cambió de ficha`);
  }
});

test("los cinco `ficha_equivocada` de la card 6.3 ya no caen donde caían", () => {
  // La card 6.4 les dio a los cinco su PROPIA ficha, derivada por receta
  // compuesta. Este test escribe el par término/ficha a mano —no lo lee del
  // censo— y además nombra la ficha EQUIVOCADA de la que venían: si mañana
  // alguien borra la receta, el término vuelve ahí y el test lo dice con el
  // nombre del error puesto, no con un id suelto.
  const reparados: Array<[string, string, string]> = [
    ["Tortilla de camarones", "receta-tortilla-de-camarones", "caía en `Tortilla de trigo` (fdc-2707822, 262 kcal)"],
    ["Cocochas en salsa", "receta-cocochas-en-salsa", "caía en `Salsa mexicana` (fdc-2709736, 34 kcal)"],
    ["Pastel de cabracho", "receta-pastel-de-cabracho", "caía en `Tarta` (fdc-2707993, 296 kcal)"],
    ["Gazpachos manchegos o galianos", "receta-gazpachos-manchegos", "caía en `Gazpacho` (fdc-2710106, 26 kcal)"],
    ["Leche frita", "receta-leche-frita", "caía en `Leche` (fdc-2705384, 52 kcal)"],
  ];
  for (const [termino, esperado, venia] of reparados) {
    const hoy = confianzaVisible(termino);
    assert.notEqual(hoy, null, `"${termino}" se quedó sin match; ${venia}`);
    assert.equal((hoy as { id: string }).id, esperado, `"${termino}" — ${venia}`);
  }
});

test("los huecos centrales de la DT-33 siguen tapados", () => {
  // Los siete que la DT-33 nombraba uno por uno como «no hay NINGUNA ficha».
  // Van escritos con su término y su ficha para que el candado sea sobre el
  // MOTOR y no sobre el censo, que se regenera solo.
  const dt33: Array<[string, string, string]> = [
    ["salmón", "fdc-2706285", "no había ninguna ficha de salmón en las 1.036"],
    ["salmon", "fdc-2706285", "el mismo hueco por la puerta del inglés"],
    ["mejillones", "fdc-2706350", "no había ninguna ficha de mejillón"],
    ["mussels", "fdc-2706350", "el mismo hueco en inglés"],
    ["pez espada", "fdc-173704", "no había ninguna ficha de pez espada"],
    ["pasta cocida", "fdc-2708357", "solo había `Pasta seca enriquecida` (cruda) y `Pasta con salsa`"],
    ["harina de trigo", "fdc-168894", "había harina de papa, arroz, soja, garbanzo, mijo, arrurruz, malta y trigo sarraceno — de trigo no"],
    ["maíz dulce cocido", "fdc-2709910", "cero coincidencias de maíz dulce en el catálogo (DT-26 lo mandó acá)"],
    ["repollo verde cocido sin grasa", "fdc-2709889", "solo estaba el de grasa añadida, 55 kcal contra 32"],
  ];
  for (const [termino, esperado, motivo] of dt33) {
    const hoy = confianzaVisible(termino);
    assert.notEqual(hoy, null, `"${termino}" volvió al silencio: ${motivo}`);
    assert.equal((hoy as { id: string }).id, esperado, `"${termino}" — ${motivo}`);
  }
});
