/**
 * Los candados del matching.
 *
 * Todo lo de acá corre contra el CATÁLOGO REAL (`kb/build/foods.canonical.json`),
 * no contra un puñado de fichas de mentira: los tres riesgos que midió el Bloque
 * 0 —la familia "Pastel", el cruce "Catsup" entre idiomas y el par
 * chorizo/"Bife de chorizo"— existen en el catálogo de verdad y no se pueden
 * reproducir con un fixture chico. Donde el escenario NO existe todavía (una
 * ficha `deprecated`: hoy hay cero) se CONSTRUYE, que es la única forma de que el
 * candado valga para el día en que exista.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { construirIndice, GUARDAS_DE_VOCABULARIO } from "./catalog";
import { COBERTURA_DIFUSA_MIN, CONFIANZA_DIFUSA_MAX } from "./constants";
import { buscarAlimento, buscarConDosNombres, guardaQueViola } from "./match";
import { claveDeMatching, contieneSecuencia, empiezaConPalabra, normalizar, variantesDeIndice } from "./normalize";
import { aliasConfidence, aliasText } from "../kb/types";
import { catalogoReal, fichaFalsa, fichaReal, indiceDeFixture, indiceReal } from "./testing";

const index = indiceReal();

describe("normalización", () => {
  it("baja a minúsculas, saca tildes y puntuación", () => {
    assert.equal(normalizar("  Kétchup,  común! "), "ketchup comun");
    assert.equal(normalizar("Piña"), "pina");
    assert.equal(normalizar("Jamón ibérico"), "jamon iberico");
  });

  it("compara por palabras completas, no por subcadenas", () => {
    assert.equal(contieneSecuencia("pastel de carne casero", "pastel de carne"), true);
    assert.equal(contieneSecuencia("pasteles", "pastel"), false);
    assert.equal(empiezaConPalabra("pepinillos en eneldo", "pepinillos"), true);
    assert.equal(empiezaConPalabra("bife de chorizo", "chorizo"), false);
  });
});

describe("nivel 1 — exacto contra names.en", () => {
  it("resuelve con confianza 1,0", () => {
    const r = buscarAlimento("Chorizo", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2706179");
    assert.equal(r.nivel, "exacto");
    assert.equal(r.confianza_match, 1);
    assert.equal(r.idioma, "en");
  });

  it("no le importan mayúsculas, tildes ni espacios de más", () => {
    const r = buscarAlimento("  chORIZO ", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2706179");
    assert.equal(r.nivel, "exacto");
  });
});

describe("nivel 2 — exacto contra el vocabulario español", () => {
  it("un nombre en español resuelve con confianza 1,0", () => {
    const r = buscarAlimento("Bife de chorizo", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2705835");
    assert.equal(r.nivel, "alias");
    assert.equal(r.confianza_match, 1);
  });

  it("un alias con reserva declarada arrastra SU confianza, no 1,0", () => {
    // fdc-2708709 lleva `Pastel brasileño` con confianza 0,6: no es el plato,
    // es el gemelo nutricional más cercano que USDA mide.
    const r = buscarAlimento("Pastel brasileño", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2708709");
    assert.equal(r.nivel, "alias");
    assert.equal(r.confianza_match, 0.6);
  });

  it("todos los peldaños de la escala llegan intactos al match", () => {
    const conReserva = catalogoReal()
      .foods.filter((f) => !f.deprecated)
      .flatMap((f) => f.aliases.es.map((a) => ({ f, a })))
      .filter((x) => typeof x.a !== "string");
    assert.ok(conReserva.length > 0, "el catálogo tiene que tener aliases con reserva");
    for (const { f, a } of conReserva) {
      if (typeof a === "string") continue;
      const r = buscarAlimento(a.alias, index);
      // Puede ganar el índice inglés si el mismo texto es un names.en de otra
      // ficha; en ese caso el alias no es el que resolvió y no se mide acá.
      if (r === null || r.ficha.id !== f.id) continue;
      // La confianza que sale tiene que ser una de las DECLARADAS por la ficha
      // para ese término. No siempre es la de este alias: hay un caso medido
      // (fdc-2706162, `Callos`) donde la misma ficha declara el mismo término
      // dos veces, en texto plano y con reserva 0,5. Ver `catalogo.test.ts`.
      const clave = normalizar(a.alias);
      const declaradas = f.aliases.es
        .filter((otro) => normalizar(aliasText(otro)) === clave)
        .map((otro) => aliasConfidence(otro));
      // El nombre propio de la ficha también declara ese término, con 1,0: pasa
      // con `Chorizo`, que es a la vez el names.en y un alias con reserva 0,6.
      if (normalizar(f.names.en) === clave || (f.names.es !== null && normalizar(f.names.es) === clave)) {
        declaradas.push(1);
      }
      assert.ok(declaradas.includes(r.confianza_match), `${f.id} / ${a.alias} -> ${r.confianza_match}`);
    }
  });
});

describe("el cruce Catsup — por qué los índices están separados", () => {
  it("inglés gana: `Catsup` es el names.en de fdc-168556", () => {
    const r = buscarAlimento("Catsup", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-168556");
    assert.equal(r.idioma, "en");
  });

  it("el mismo texto es, en español, un alias de OTRA ficha", () => {
    assert.equal(index.exactoEn.get("catsup")?.food_id, "fdc-168556");
    assert.equal(index.exactoEs.get("catsup")?.food_id, "fdc-2709733");
  });

  it("es el ÚNICO cruce ESCRITO POR LA CURACIÓN (medido)", () => {
    // CARD 2.6: el filtro por `variante` es nuevo y es lo que este test siempre
    // quiso decir. La medición es sobre el VOCABULARIO QUE ESCRIBIÓ LA CURACIÓN
    // —dos términos idénticos con dos dueños en `kb/`—, y ese sigue siendo uno
    // solo. Las claves que el índice DEDUCE (`variantesDeIndice`) también cruzan
    // de idioma, pero eso no es un error de curación: es una regla general
    // aplicada a 1.022 fichas, y lo que hay que exigirle es que pierda siempre
    // contra un nombre escrito (el test de abajo).
    const cruces = [...index.exactoEn.entries()].filter(([clave, entrada]) => {
      if (entrada.variante === true) return false;
      const es = index.exactoEs.get(clave);
      return es !== undefined && es.variante !== true && es.food_id !== entrada.food_id;
    });
    assert.deepEqual(
      cruces.map(([c]) => c),
      ["catsup"],
    );
  });

  it("una variante deducida NUNCA le gana a un nombre escrito, ni cruzando de idioma", () => {
    // El caso medido: `Salsa, NFS` (fdc-2709736, la salsa mexicana) le deja al
    // índice INGLÉS la variante `salsa`, y `salsa` es el `names.es` escrito de
    // `Sauce, NFS` (fdc-2710177). Con la cascada vieja de dos niveles exactos
    // —inglés y después español— la variante inglesa ganaba y "salsa" devolvía
    // salsa mexicana. Los cuatro niveles de `buscarAlimento` ponen a las
    // variantes debajo de todo lo escrito.
    assert.equal(index.exactoEn.get("salsa")?.variante, true);
    assert.equal(index.exactoEs.get("salsa")?.variante, undefined);
    const r = buscarAlimento("salsa", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2710177");
    assert.equal(r.idioma, "es");
  });
});

describe("nivel 3 — difuso", () => {
  it("gana el nombre MÁS ESPECÍFICO cuando el catálogo está dentro de la consulta", () => {
    // El catálogo ofrece tres candidatos contenidos en la frase: `Carne`,
    // `Pastel` y `Pastel de carne`. Tiene que ganar el tercero.
    const r = buscarAlimento("Pastel de carne casero de la abuela", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2706579");
    assert.equal(r.nivel, "difuso");
    assert.ok(r.confianza_match <= 0.6);
  });

  it("nunca pasa de 0,6 y decrece con la distancia", () => {
    const cerca = buscarAlimento("Pastel de carne casero", index);
    const lejos = buscarAlimento("Pastel de carne casero de la abuela", index);
    assert.ok(cerca && lejos);
    assert.ok(cerca.confianza_match <= 0.6);
    assert.ok(lejos.confianza_match < cerca.confianza_match);
  });

  it("cuando la consulta es el principio de varios nombres, gana el que AGREGA MENOS", () => {
    // Once nombres del catálogo empiezan con "pastel". Con "gana el más largo"
    // esto resolvería a `Pastel de nuez pecana`, que no es un pastel.
    const sinAliasPastel = construirIndice(
      catalogoReal().foods.filter((f) => f.id !== "fdc-2707993"),
      "test",
    );
    const r = buscarAlimento("pastel", sinAliasPastel);
    assert.ok(r);
    assert.notEqual(r.ficha.names.es, "Pastel de nuez pecana");
    assert.ok(r.confianza_match < 0.3, "un nombre a medias no puede dar confianza alta");
  });

  it("no inventa un match cuando la coincidencia es una palabra suelta", () => {
    assert.equal(buscarAlimento("Zzzz plato inexistente xyz", index), null);
  });

  it("el inglés gana los EMPATES, no la carrera", () => {
    const r = buscarAlimento("Chorizo sausage", index);
    assert.ok(r);
    assert.equal(r.idioma, "en");
    assert.equal(r.ficha.id, "fdc-2706179");
  });

  it("un ejemplo real de dirección A, verificado contra el catálogo (F3)", () => {
    // El docstring de match.ts usa `Olive oil` (fdc-2710186) como ejemplo. Este
    // test existe para que ese ejemplo no pueda quedar desactualizado ni ser
    // inventado: en este proyecto lo que se declara se tiene que poder medir.
    const r = buscarAlimento("olive oil for frying", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2710186");
    assert.equal(r.nivel, "difuso");
    assert.equal(r.idioma, "en");
  });

  it("F1 — GANA EL IDIOMA QUE MÁS SE PARECE, no el que se consulta primero", () => {
    // El bloqueante del Q/A: con "el bife de chorizo", el índice inglés
    // encuentra `Chorizo` (cobertura 0,389) y el español encuentra
    // `Bife de chorizo` (0,833). Antes ganaba el inglés por ir primero y el
    // motor devolvía un EMBUTIDO donde el usuario había nombrado bien un corte
    // vacuno — la guarda del chorizo, burlada por otra puerta.
    for (const consulta of ["el bife de chorizo", "un bife de chorizo", "rico bife de chorizo"]) {
      const r = buscarAlimento(consulta, index);
      assert.ok(r, consulta);
      assert.equal(r.ficha.id, "fdc-2705835", consulta);
      assert.equal(r.idioma, "es", consulta);
    }
  });

  it("F1 — los otros dos casos del barrido también quedan reparados", () => {
    assert.equal(buscarAlimento("el kétchup común", index)?.ficha.id, "fdc-168556");
    const falafel = buscarAlimento("el sándwich de falafel", index);
    assert.ok(falafel);
    assert.equal(falafel.idioma, "es");
    assert.match(falafel.ficha.names.es ?? "", /falafel/i);
  });

  it("F1 — el arreglo no toca ninguna coincidencia exacta", () => {
    // 2.044 consultas exactas (names.en + vocabulario ES): la competencia entre
    // idiomas vive en el nivel 3 y no puede haber movido el 1 ni el 2.
    let exactos = 0;
    for (const f of catalogoReal().foods.filter((x) => !x.deprecated)) {
      assert.equal(buscarAlimento(f.names.en, index)?.nivel, "exacto", f.names.en);
      exactos += 1;
    }
    assert.ok(exactos > 1000);
  });
});

describe("guardas duras de vocabulario", () => {
  it("`chorizo` JAMÁS llega al bife de chorizo", () => {
    for (const consulta of ["chorizo", "Chorizo", "chorizo criollo", "chorizo a la parrilla"]) {
      const r = buscarAlimento(consulta, index);
      assert.notEqual(r?.ficha.id, "fdc-2705835", consulta);
    }
  });

  it("la guarda aguanta aunque el índice apunte a la ficha prohibida", () => {
    // El escenario se CONSTRUYE: se arma un índice donde `chorizo` es el nombre
    // en inglés de fdc-2705835. Sin la guarda esto resolvería al corte vacuno.
    const trucado = indiceDeFixture([fichaFalsa({ id: "fdc-2705835", names: { en: "chorizo", es: "Bife de chorizo" } })]);
    assert.equal(buscarAlimento("chorizo", trucado), null);
    assert.ok(guardaQueViola("chorizo", "fdc-2705835", GUARDAS_DE_VOCABULARIO));
  });

  it("`pepinillos` a secas son los de eneldo, nunca los dulces", () => {
    const r = buscarAlimento("pepinillos", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-168558");
  });

  it("sin el alias, el difuso preferiría los dulces y la guarda lo impide", () => {
    // `Pepinillos dulces` (17 caracteres) cubre más de la consulta que
    // `Pepinillos en eneldo o kosher` (29): sin guarda, ganaría el azúcar.
    const sinAlias = construirIndice(
      catalogoReal().foods.map((f) => (f.id === "fdc-168558" ? { ...f, aliases: { es: [] } } : f)),
      "test",
    );
    const r = buscarAlimento("pepinillos", sinAlias);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-168558");
    assert.equal(r.nivel, "difuso");
  });

  it("nombrar la variante levanta la guarda", () => {
    const r = buscarAlimento("Pepinillos dulces", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-169378");
  });

  it("F4 — la única excepción declarada es `dulces`, y LLEVA a los dulces", () => {
    const guarda = GUARDAS_DE_VOCABULARIO.find((g) => g.termino === "pepinillos");
    assert.ok(guarda);
    assert.deepEqual(guarda.salvo_si_contiene, ["dulces"]);
  });

  it("F4 — LÍMITE DECLARADO: `pepinillos sweet` va a los de eneldo", () => {
    // El Q/A encontró que `sweet` y `bread and butter` levantaban la guarda pero
    // NO llegaban a los dulces (el alias `Pepinillos` cubre más de la consulta
    // que cualquier nombre de los dulces). Una excepción que no cumple lo que
    // promete se saca, y el límite se declara acá en vez de fingirse resuelto.
    assert.equal(buscarAlimento("pepinillos sweet", index)?.ficha.id, "fdc-168558");
    assert.equal(buscarAlimento("pepinillos bread and butter", index)?.ficha.id, "fdc-168558");
    // El camino que SÍ funciona para nombrarlos en inglés es el nombre de USDA.
    assert.equal(buscarAlimento("Pickles, cucumber, sweet (includes bread and butter pickles)", index)?.ficha.id, "fdc-169378");
  });

  it("ninguna guarda se viola contra el catálogo real", () => {
    for (const guarda of GUARDAS_DE_VOCABULARIO) {
      const r = buscarAlimento(guarda.termino, index);
      if (r === null) continue;
      assert.ok(!guarda.prohibido_en.includes(r.ficha.id), `${guarda.termino} -> ${r.ficha.id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// CARD 2.6 — el recall
//
// Todo lo de acá sale del test de 10 platos reales del 01/09/2026: 12 de 17
// alimentos salieron sin datos y 10 de esos 12 SÍ estaban en el catálogo. Los
// términos son EXACTAMENTE los que dijo el modelo de visión, letra por letra —
// no son ejemplos inventados para que el test pase, son la vara que midió el
// problema. El informe está en el expediente de la card.
// ---------------------------------------------------------------------------

describe("card 2.6 — el plural plegado (causa D)", () => {
  it("`lime, raw` encuentra `Limes, raw` y por vía exacta", () => {
    const r = buscarAlimento("lime, raw", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-168155");
    assert.equal(r.nivel, "exacto");
    assert.equal(r.confianza_match, 1);
  });

  it("el singular encuentra al plural del catálogo, y al revés", () => {
    assert.equal(buscarAlimento("pepinillo", index)?.ficha.id, "fdc-168558");
    assert.equal(buscarAlimento("pepinillos", index)?.ficha.id, "fdc-168558");
  });

  it("plegar no es singularizar: la regla es pobre a propósito", () => {
    assert.equal(claveDeMatching("Limes, raw"), "lime raw");
    assert.equal(claveDeMatching("papas fritas"), "papa frita");
    // Palabras cortas y terminadas en `ss`: intactas.
    assert.equal(claveDeMatching("gas"), "gas");
    assert.equal(claveDeMatching("bass"), "bass");
    // No adivina irregulares, y no hace falta que lo haga: los dos lados pliegan igual.
    assert.equal(claveDeMatching("fries"), "frie");
  });

  it("la guarda sigue disparando con la consulta plegada", () => {
    // Si `guardaQueViola` comparara contra el término sin plegar, `pepinillos`
    // (plegado a `pepinillo`) dejaría de disparar y la guarda se caería en
    // silencio, que es la peor forma en que se puede caer una guarda.
    assert.ok(guardaQueViola(claveDeMatching("pepinillos"), "fdc-169378", GUARDAS_DE_VOCABULARIO));
    assert.ok(guardaQueViola(claveDeMatching("pepinillo"), "fdc-169378", GUARDAS_DE_VOCABULARIO));
  });
});

describe("card 2.6 — las variantes del índice (causa B)", () => {
  it("`beef steak, grilled` llega a `Beef, steak, NFS`", () => {
    const r = buscarAlimento("beef steak, grilled", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2705824");
  });

  it("`white rice, cooked` llega EXACTO a `Rice, white, cooked, NS as to fat`", () => {
    // La inversión del nombre de USDA: `Rice, white` se dice `white rice`.
    const r = buscarAlimento("white rice, cooked", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2708403");
    assert.equal(r.nivel, "exacto");
  });

  it("las tres formas de variante, una por una", () => {
    assert.deepEqual(variantesDeIndice("Beef, steak, NFS").sort(), ["beef steak", "steak beef"]);
    assert.ok(variantesDeIndice("Yellow rice, cooked, NS as to fat").includes("yellow rice cooked"));
    assert.ok(variantesDeIndice("Rice, white, cooked, NS as to fat").includes("white rice cooked"));
    assert.ok(
      variantesDeIndice("Spanish potato omelette (tortilla de patatas)").includes("spanish potato omelette"),
    );
    // Un nombre sin comas ni marcadores no genera nada: la regla no inventa.
    assert.deepEqual(variantesDeIndice("Coleslaw"), []);
  });

  it("NO se invierte cuando el primer segmento ya es una frase", () => {
    // `Egg white omelet, scrambled, or fried` invertido daba `scrambled egg
    // white omelet...`, y con eso "scrambled eggs" resolvía a la CLARA de huevo
    // (100 kcal) en vez de al huevo revuelto (185). La convención de USDA es
    // "SUSTANTIVO, calificativo", y un sustantivo es UNA palabra.
    const variantes = variantesDeIndice("Egg white omelet, scrambled, or fried, NS as to fat");
    assert.equal(
      variantes.some((v) => v.startsWith("scrambled")),
      false,
      variantes.join(" | "),
    );
  });
});

describe("card 2.6 — la paradoja de la cobertura (causa C)", () => {
  it("`coleslaw, cabbage and carrot salad` llega a Coleslaw, que es su NÚCLEO", () => {
    // El caso más claro del test: la consulta CONTIENE un nombre exacto del
    // catálogo, pero solo cubre el 24 % de lo que dijo la visión y el piso lo
    // descartaba. Cuanto mejor describía el modelo, peor matcheaba.
    const r = buscarAlimento("coleslaw, cabbage and carrot salad", index);
    assert.ok(r);
    assert.equal(r.ficha.id, "fdc-2709815");
  });

  it("descontar los descriptores sube la confianza de un match que era correcto", () => {
    // `beef steak, grilled`: la palabra "grilled" no es otro alimento sin
    // explicar, es un adjetivo del mismo. Antes de la card la confianza era 0,33.
    const r = buscarAlimento("beef steak, grilled", index);
    assert.ok(r);
    assert.equal(r.confianza_match, CONFIANZA_DIFUSA_MAX);
  });

  it("EL PISO NO SE MOVIÓ: una lasaña no resuelve a la ricota que lleva adentro", () => {
    // Si en vez de las dos puertas se hubiera bajado `COBERTURA_DIFUSA_MIN`,
    // esta consulta habría matcheado `Ricotta` o `Spinach`. Es el candado de que
    // el recall se abrió sin abrir la puerta a inventar.
    assert.equal(COBERTURA_DIFUSA_MIN, 0.3);
    assert.equal(buscarAlimento("lasagna with meat sauce and spinach ricotta", index), null);
  });

  it("lo que viene detrás de un conector es un ACOMPAÑAMIENTO, no el plato", () => {
    // La arepa no está en el catálogo (verificado: 0 coincidencias) y el queso
    // sí. Sin esta regla, una arepa rellena de queso devolvía QUESO.
    assert.equal(buscarAlimento("arepa, grilled, filled with cheese", index), null);
    // Y el queso solo, nombrado como tal, sigue llegando al queso.
    assert.equal(buscarAlimento("cheese, white, fresh", index)?.ficha.id, "fdc-2705704");
  });

  it("las guardas de la DT-15 aguantan todas las puertas nuevas", () => {
    // El chorizo, el cruce Catsup, los pepinillos dulces y la familia Pastel:
    // los cuatro escenarios que el Bloque 0 midió, revisados de nuevo ahora que
    // el difuso acepta por núcleo.
    assert.notEqual(buscarAlimento("chorizo a la parrilla", index)?.ficha.id, "fdc-2705835");
    assert.equal(buscarAlimento("Catsup", index)?.ficha.id, "fdc-168556");
    assert.equal(buscarAlimento("pepinillos", index)?.ficha.id, "fdc-168558");
    assert.equal(buscarAlimento("Pastel de carne casero de la abuela", index)?.ficha.id, "fdc-2706579");
  });
});

describe("card 2.6 — la regla del crudo y el cocido", () => {
  it("`lentils` y `lentejas` dan las COCIDAS, que es lo que hay en un plato", () => {
    // LA TRAMPA MEDIDA: `Lentejas crudas` (fdc-172420) tiene 352 kcal/100 g y las
    // cocidas (fdc-2707423) 166. Más del doble. Antes de esta card el error no se
    // veía porque el motor no matcheaba nada; abrir el recall lo encendía.
    assert.equal(buscarAlimento("lentils", index)?.ficha.id, "fdc-2707423");
    assert.equal(buscarAlimento("lentejas", index)?.ficha.id, "fdc-2707423");
    assert.equal(buscarAlimento("lentil stew with meat", index)?.ficha.id, "fdc-2707423");
  });

  it("nombrarlas crudas SÍ da las crudas: la regla no le saca nada a nadie", () => {
    assert.equal(buscarAlimento("lentils, raw", index)?.ficha.id, "fdc-172420");
    assert.equal(buscarAlimento("lentejas crudas", index)?.ficha.id, "fdc-172420");
  });

  it("una fruta o una verdura de ensalada SIGUEN siendo crudas", () => {
    // La primera versión de la regla prohibía todo lo crudo y convertía la
    // manzana en manzana al horno y el tomate de la ensalada en tomate cocido con
    // grasa. La regla desempata mirando los datos: solo gana la cocida cuando la
    // cruda es MÁS densa (o sea, cuando está seca).
    assert.equal(buscarAlimento("apple", index)?.ficha.id, "fdc-2709215");
    assert.equal(buscarAlimento("manzana", index)?.ficha.id, "fdc-2709215");
    assert.equal(buscarAlimento("tomate", index)?.ficha.id, "fdc-2709719");
    assert.equal(buscarAlimento("zanahoria", index)?.ficha.id, "fdc-170393");
    assert.equal(buscarAlimento("spinach", index)?.ficha.id, "fdc-168462");
  });

  it("el desempate mira las kcal, no una lista de alimentos", () => {
    const crudas = fichaReal("fdc-172420");
    const cocidas = fichaReal("fdc-2707423");
    assert.ok(crudas.per_100g.kcal > cocidas.per_100g.kcal, "las lentejas crudas están SECAS");
    const tomateCrudo = fichaReal("fdc-2709719");
    const tomateCocido = fichaReal("fdc-2709720");
    assert.ok(tomateCrudo.per_100g.kcal < tomateCocido.per_100g.kcal, "el tomate cocido lleva grasa agregada");
  });

  it("el índice marca el estado sobre EL TÉRMINO, no sobre la ficha", () => {
    assert.equal(index.exactoEn.get(claveDeMatching("Lentils, raw"))?.estado, "crudo");
    assert.equal(index.exactoEs.get(claveDeMatching("Lentejas cocidas con sal y grasa"))?.estado, "cocido");
    assert.equal(index.exactoEs.get(claveDeMatching("Paella"))?.estado, undefined);
  });
});

describe("card 2.6 — los dos nombres de la visión (causa A)", () => {
  it("el español desbloquea los platos que el inglés de USDA no sabe nombrar", () => {
    // Los tres casos del test real: la visión describió el plato en inglés y el
    // catálogo lo tenía curado en español desde la Fase 1.
    assert.equal(buscarConDosNombres("rice, cooked, seafood paella style", "paella", index)?.ficha.id, "fdc-2706723");
    assert.equal(
      buscarConDosNombres("lasagna with meat sauce and spinach ricotta", "lasaña", index)?.ficha.id,
      "fdc-2708755",
    );
    assert.equal(buscarConDosNombres("french fries, fried", "papas fritas", index)?.ficha.id, "fdc-2709456");
  });

  it("gana el que el catálogo conoce MEJOR, no el que se pregunta primero", () => {
    // En inglés `beef steak, grilled` es un difuso al 0,6; en español `bife` es
    // el nombre de la ficha. Tiene que ganar el español.
    const r = buscarConDosNombres("beef steak, grilled", "bife", index);
    assert.ok(r);
    assert.equal(r.idioma, "es");
    assert.equal(r.confianza_match, 1);
  });

  it("a igualdad gana el inglés, que es la precedencia de la card 2.1", () => {
    // `Croissant` es el nombre en los dos idiomas: los dos dan 1,0 y manda el inglés.
    const r = buscarConDosNombres("croissant", "croissant", index);
    assert.ok(r);
    assert.equal(r.idioma, "en");
  });

  it("sin `food_es` el motor se comporta EXACTAMENTE como antes", () => {
    // El campo es opcional en el tipo justamente para esto: una salida vieja del
    // modelo, o un item al que el modelo no le puso nombre en español, no cambia
    // ni un byte del resultado.
    for (const termino of ["apple, raw", "Chorizo", "olive oil for frying", "Zzzz plato inexistente xyz"]) {
      for (const es of [undefined, null, "", "   "]) {
        assert.deepEqual(buscarConDosNombres(termino, es, index), buscarAlimento(termino, index), `${termino}/${es}`);
      }
    }
  });

  it("se compara la confianza QUE VE EL USUARIO, con el descuento de genérica", () => {
    // `Paella, NFS` es genérica: su match vale 1,0 × 0,85 = 0,85 en pantalla. Un
    // difuso inglés de 0,9 (que no existe, pero podría) tendría que ganarle. El
    // candado es que el español gana igual contra el difuso de 0,189 que da el
    // inglés real, y que la ficha elegida es la genérica marcada.
    const r = buscarConDosNombres("rice, cooked, seafood paella style", "paella", index);
    assert.ok(r);
    assert.equal(r.ficha.generic, true);
    assert.equal(r.confianza_match, 1);
  });
});

/**
 * CARD 2.8 — EL NOMBRE PARTIDO Y LOS MODIFICADORES DE CORTE.
 *
 * Los tests contra el catálogo real miden el caso que abrió la card; los tests
 * contra fixtures miden LAS REGLAS, que es lo que no se puede buscar en el seed:
 * las cuatro condiciones de la dirección C existen cada una por un caso, y cada
 * una tiene acá su escenario construido a mano.
 */
describe("card 2.8 — el nombre partido (dirección C)", () => {
  it("`yellow rice with mushrooms, cooked` alcanza al arroz amarillo cocido", () => {
    // El único plato del golden set de 30 que no se movió entre dos corridas del
    // motor: el nombre de la ficha (`Yellow rice, cooked`) está entero adentro de
    // la frase, pero partido al medio por "with mushrooms".
    const r = buscarAlimento("yellow rice with mushrooms, cooked", index);
    assert.ok(r, "sigue en silencio");
    assert.equal(r.ficha.id, "fdc-2708419");
    assert.equal(r.nivel, "difuso");
    assert.match(r.motivo, /separadas/);
    // Y la confianza dice que los hongos quedaron sin explicar: no es un match
    // entero, es la mitad del plato.
    assert.ok(r.confianza_match < 0.4, `confianza ${r.confianza_match}`);
  });

  it("un corte no cambia el alimento: `apple slices` da la MISMA ficha que `apple, raw`", () => {
    // El caso que prueba la causa sin discusión: la misma fruta, el mismo motor y
    // la misma corrida, una matcheando exacto y la otra en `no_catalogado`. Se
    // compara por EQUIVALENCIA con la consulta que ya andaba, no contra un id
    // escrito a mano: lo que se afirma es que las dos son la misma manzana.
    const entera = buscarAlimento("apple, raw", index);
    const cortada = buscarAlimento("apple slices", index);
    assert.ok(entera && cortada);
    assert.equal(cortada.ficha.id, entera.ficha.id);
  });

  it("los otros cortes del golden set también dejan de ser silencio", () => {
    for (const [termino, entero] of [
      ["carrot, shredded", "carrot, raw"],
      ["lime, halved", "lime, raw"],
    ] as const) {
      const cortado = buscarAlimento(termino, index);
      const referencia = buscarAlimento(entero, index);
      assert.ok(cortado && referencia, termino);
      assert.equal(cortado.ficha.id, referencia.ficha.id, termino);
    }
  });

  it("C ES EL ÚLTIMO RECURSO: no le gana a un match que ya existía, ni con más confianza", () => {
    // El escenario se construye: `Rice` entra por la dirección A con una
    // cobertura floja (0,44) y `Rice, beans` entraría por el nombre partido con
    // cobertura 1. Si C compitiera, ganaría. No compite: la dirección nueva puede
    // convertir un silencio en un match, nunca cambiar uno que ya se hacía.
    const fixture = indiceDeFixture([
      fichaFalsa({ id: "test-arroz", names: { en: "Rice", es: null } }),
      fichaFalsa({ id: "test-arroz-porotos", names: { en: "Rice, beans", es: null } }),
    ]);
    const r = buscarAlimento("rice fresh beans cooked", fixture);
    assert.ok(r);
    assert.equal(r.ficha.id, "test-arroz");
  });

  it("condición 1 — el núcleo manda: la guarnición no nombra el plato", () => {
    // `Chicken rice` tiene sus dos palabras en "chicken with rice", pero el arroz
    // está DETRÁS del conector: es lo que acompaña, no lo que se comió.
    const fixture = indiceDeFixture([
      fichaFalsa({ id: "test-arroz-pollo", names: { en: "Chicken rice", es: null } }),
    ]);
    assert.equal(buscarAlimento("chicken with rice", fixture), null);
    // Sin el conector, las dos palabras son del mismo plato y el match entra.
    assert.ok(buscarAlimento("chicken rice, grilled homemade", fixture));
  });

  it("condición 3 — freír SÍ cambia la ficha: `fried potato wedges` no llega a la papa hervida", () => {
    // El falso amigo que el corte no tiene. Una papa cortada sigue siendo una
    // papa; una papa frita es otra ficha con casi cuatro veces las calorías.
    const fixture = indiceDeFixture([
      fichaFalsa({ id: "test-papa-hervida", names: { en: "Potato, boiled", es: null } }),
    ]);
    assert.equal(buscarAlimento("fried potato wedges", fixture), null);
    // Y el mismo corte SIN la preparación de más entra sin problema.
    assert.ok(buscarAlimento("potato wedges", fixture));
  });

  it("condición 4 — una ficha que dice CRUDA no contesta una consulta que dijo COCIDA", () => {
    const fixture = indiceDeFixture([
      fichaFalsa({ id: "test-repollo-crudo", names: { en: "Cabbage, raw", es: null } }),
    ]);
    assert.equal(buscarAlimento("cabbage, cooked", fixture), null);
    // Callado el estado, el desempate de siempre decide y el match entra.
    assert.ok(buscarAlimento("cabbage, shredded", fixture));
  });

  it("la salvaguarda de especificidad de la DT-15 sigue entera", () => {
    // `carne pastel` no puede empeorar: el núcleo es `carne` y `Pastel de carne`
    // no arranca ahí, así que el nombre partido ni lo considera.
    const r = buscarAlimento("carne pastel", index);
    assert.ok(r);
    assert.notEqual(r.ficha.names.es, "Pastel de carne");
    // Y el nombre completo sigue resolviendo al pastel, que es lo que tiene que pasar.
    const completo = buscarAlimento("pastel de carne casero", index);
    assert.ok(completo);
    assert.equal(completo.ficha.names.es, "Pastel de carne");
  });
});

describe("fichas retiradas", () => {
  it("una ficha `deprecated` no entra al índice ni matchea", () => {
    // Hoy el catálogo tiene 0 fichas retiradas: el escenario se construye.
    const conRetirada = indiceDeFixture([
      fichaFalsa({ id: "test-vieja", names: { en: "Tortilla vieja", es: "Tortilla vieja" }, deprecated: true }),
      fichaFalsa({ id: "test-nueva", names: { en: "Tortilla nueva", es: "Tortilla nueva" } }),
    ]);
    assert.equal(buscarAlimento("Tortilla vieja", conRetirada), null);
    assert.ok(buscarAlimento("Tortilla nueva", conRetirada));
  });

  it("tampoco matchea si alguien la dejó en el mapa a mano", () => {
    const retirada = fichaFalsa({ id: "test-vieja", names: { en: "Tortilla vieja", es: null }, deprecated: true });
    const trucado = indiceDeFixture([{ ...retirada, deprecated: false }]);
    trucado.porId.set("test-vieja", retirada);
    assert.equal(buscarAlimento("Tortilla vieja", trucado), null);
  });
});
