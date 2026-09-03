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
import { COBERTURA_DIFUSA_MIN, CONFIANZA_DIFUSA_MAX, FAMILIAS_QUE_SE_COMEN_CRUDAS } from "./constants";
import {
  buscarAlimento,
  buscarConDosNombres,
  cabezaDeLaTaxonomia,
  contradiceALaFamilia,
  guardaQueViola,
  redondear,
  respaldoDeIdentidad,
  subfamiliaDeclarada,
  sustitutoDeclarado,
  vocabularioDeLaFicha,
} from "./match";
import {
  claveDeMatching,
  contieneSecuencia,
  empiezaConPalabra,
  lecturasDelTermino,
  mismaPalabra,
  normalizar,
  sinColaDescriptiva,
  variantesDeIndice,
} from "./normalize";
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
    // Sin esta regla, una arepa rellena de queso devolvía QUESO.
    //
    // EL ESCENARIO SE CONSTRUYE (card 6.1): la versión anterior se apoyaba en que
    // el catálogo real no tenía arepa, y la curación de la WS06 la agregó
    // (`fdc-168070`). El hueco era del catálogo, no de la regla, así que el
    // candado pasa a un índice donde el relleno existe y el plato no — que es la
    // situación exacta que la regla resuelve, y la única que la puede medir.
    const soloElRelleno = indiceDeFixture([
      fichaFalsa({ id: "test-queso", names: { en: "Cheese, NFS", es: "Queso" } }),
      fichaFalsa({ id: "test-pan", names: { en: "Bread, NFS", es: "Pan" } }),
    ]);
    assert.equal(buscarAlimento("arepa, grilled, filled with cheese", soloElRelleno), null);
    // Y el queso solo, nombrado como tal, sigue llegando al queso.
    assert.equal(buscarAlimento("cheese, white, fresh", soloElRelleno)?.ficha.id, "test-queso");
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

// ---------------------------------------------------------------------------
// CARD 6.1 — LOS MÍNIMOS DE LA DT-28
// ---------------------------------------------------------------------------

describe("card 6.1 — la cola descriptiva de USDA (DT-28, punto 1)", () => {
  /**
   * EL ESCENARIO SE CONSTRUYE, no se busca en el catálogo. Las cinco fichas de
   * abajo llevan los nombres EXACTOS que la evaluación del golden set señaló como
   * causa de los silencios (`evaluacion-v2.md` §5) — con su cola descriptiva y su
   * nombre español corrido —, pero son fichas de fixture: así el candado mide EL
   * MOTOR y no queda a merced de lo que la curación mueva en `kb/`.
   */
  const conCola = indiceDeFixture([
    fichaFalsa({
      id: "test-pepino",
      names: { en: "Cucumber, with peel, raw", es: "Pepino crudo con cáscara" },
    }),
    fichaFalsa({
      id: "test-pollo",
      names: { en: "Chicken, NS as to part and cooking method, skin eaten", es: "Pollo con piel" },
    }),
    fichaFalsa({
      id: "test-papa",
      names: { en: "Potato, roasted, from fresh, peel eaten, NS as to fat", es: "Papa asada con cáscara" },
    }),
    fichaFalsa({
      id: "test-maiz",
      names: { en: "Corn, canned, cooked, fat added, NS as to fat type", es: "Maíz de lata cocido con grasa" },
    }),
    fichaFalsa({ id: "test-otro", names: { en: "Bread, NFS", es: "Pan" } }),
  ]);

  it("`cucumber, sliced` llega al pepino, que se llama `Cucumber, WITH PEEL, raw`", () => {
    const r = buscarAlimento("cucumber, sliced", conCola);
    assert.ok(r, "el pepino seguía mudo");
    assert.equal(r.ficha.id, "test-pepino");
  });

  it("EN ESPAÑOL TAMBIÉN: `pepino` llega a `Pepino crudo con cáscara`", () => {
    // El hallazgo del Bloque 0 de la WS06. El nombre español no tiene ni una coma,
    // así que la regla por segmentos no lo tocaba: la cola se saca del nombre
    // entero o del lado español no muerde nunca.
    const r = buscarAlimento("pepino", conCola);
    assert.ok(r, "el índice español seguía sin la variante");
    assert.equal(r.ficha.id, "test-pepino");
  });

  it("`chicken thigh, roasted` llega al pollo detrás de `skin eaten`", () => {
    const r = buscarAlimento("chicken thigh, roasted", conCola);
    assert.ok(r);
    assert.equal(r.ficha.id, "test-pollo");
  });

  it("`papa asada` llega a `Papa asada con cáscara`", () => {
    const r = buscarAlimento("papa asada", conCola);
    assert.ok(r);
    assert.equal(r.ficha.id, "test-papa");
  });

  it("`maíz cocido` llega a `Maíz de lata cocido CON GRASA`", () => {
    const r = buscarAlimento("maíz de lata cocido", conCola);
    assert.ok(r);
    assert.equal(r.ficha.id, "test-maiz");
  });

  it("la cola se saca ENTERA y por palabras, nunca a pedazos", () => {
    assert.equal(sinColaDescriptiva("pepino crudo con cascara"), "pepino crudo");
    assert.equal(sinColaDescriptiva("corn canned cooked fat added"), "corn canned cooked");
    assert.equal(sinColaDescriptiva("chicken skin eaten"), "chicken");
    // `con sal` no puede morder adentro de `con salsa`: se comparan PALABRAS.
    assert.equal(sinColaDescriptiva("pasta con salsa"), "pasta con salsa");
    // Y la conjunción que unía dos colas no queda colgada.
    assert.equal(sinColaDescriptiva("lenteja cocida con sal y grasa"), "lenteja cocida");
    // Un nombre que ES su cola no se puede vaciar: devuelve lo que había.
    assert.equal(sinColaDescriptiva("con grasa"), "con grasa");
  });

  it("LO QUE RESTA NO ES COLA: `sin grasa` nombra otro producto y se respeta", () => {
    // EL CANDADO MÁS CARO DE ESTA CARD, y salió de una medición sobre el catálogo
    // real. Con las formas negativas adentro de la lista, "mayonesa" resolvía a
    // la mayonesa SIN GRASA a confianza 1,0: 64 kcal/100 g donde la mayonesa son
    // 680. Un marcador que SUMA ("con grasa", "with peel") describe la medición;
    // uno que RESTA nombra otro alimento, y el catálogo lo mide aparte.
    assert.equal(sinColaDescriptiva("mayonesa sin grasa kraft"), "mayonesa sin grasa kraft");
    assert.equal(sinColaDescriptiva("butter without salt"), "butter without salt");
    assert.equal(sinColaDescriptiva("papa hervida sin cascara"), "papa hervida sin cascara");
    // Y la variante tampoco nace por otra puerta: el nombre entero no la genera.
    assert.equal(
      variantesDeIndice("Salad dressing, KRAFT Mayo Fat Free Mayonnaise Dressing").includes("mayonesa"),
      false,
    );
    const light = indiceDeFixture([
      fichaFalsa({
        id: "test-mayonesa",
        names: { en: "Salad dressing, mayonnaise, regular", es: "Mayonesa" },
        per_100g: { kcal: 680, protein_g: 1, carbs_g: 1, fat_g: 75, fiber_g: 0, sat_fat_g: 12, sugars_g: 1, sodium_mg: 600 },
      }),
      fichaFalsa({
        id: "test-light",
        names: { en: "KRAFT Mayo Fat Free Mayonnaise Dressing", es: "Mayonesa sin grasa KRAFT" },
        per_100g: { kcal: 64, protein_g: 0, carbs_g: 13, fat_g: 0, fiber_g: 0, sat_fat_g: 0, sugars_g: 5, sodium_mg: 800 },
      }),
      fichaFalsa({ id: "test-otro", names: { en: "Bread, NFS", es: "Pan" } }),
    ]);
    assert.equal(buscarAlimento("mayonesa", light)?.ficha.id, "test-mayonesa");
  });

  it("LA VARIANTE SUMA, NO REEMPLAZA: la clave con cola sigue estando", () => {
    // La garantía de que la regla es aditiva. Si la variante nueva ocupara el
    // lugar de la vieja, un término que encontraba la ficha por la clave con cola
    // dejaría de encontrarla, y eso sería una regresión disfrazada de mejora.
    const variantes = variantesDeIndice("Corn, canned, cooked, fat added, NS as to fat type");
    assert.ok(variantes.includes("corn canned cooked fat added"), variantes.join(" | "));
    assert.ok(variantes.includes("corn canned cooked"), variantes.join(" | "));
  });

  it("un nombre sin cola no gana ni una variante nueva", () => {
    assert.deepEqual(variantesDeIndice("Coleslaw"), []);
    assert.deepEqual(variantesDeIndice("Beef, steak, NFS").sort(), ["beef steak", "steak beef"]);
  });
});

describe("card 6.1 — a igual confianza gana el término ESCRITO (DT-28, punto 1)", () => {
  /**
   * El desempate que la cola descriptiva hizo necesario, con el caso medido: la
   * zanahoria cruda de una ensalada empataba en 0,6 con la zanahoria COCIDA CON
   * GRASA, y ganaba la cocida solo por tener el nombre más largo. 41 kcal contra
   * 72 por un criterio de desempate.
   */
  const zanahorias = indiceDeFixture([
    fichaFalsa({ id: "test-cruda", names: { en: "Carrots, raw", es: "Zanahorias crudas" } }),
    fichaFalsa({
      id: "test-cocida",
      names: { en: "Carrots, fresh, cooked, fat added, NS as to fat type", es: "Zanahorias cocidas con grasa" },
      per_100g: { kcal: 72, protein_g: 1, carbs_g: 8, fat_g: 3, fiber_g: 2, sat_fat_g: 1, sugars_g: 3, sodium_mg: 200 },
    }),
    fichaFalsa({ id: "test-otro", names: { en: "Bread, NFS", es: "Pan" } }),
  ]);

  it("`carrot, shredded` se queda con la cruda, que es el nombre escrito", () => {
    const r = buscarAlimento("carrot, shredded", zanahorias);
    assert.ok(r);
    assert.equal(r.ficha.id, "test-cruda");
  });
});

describe("card 6.1 — la barra de la visión es una O (DT-28, punto 2)", () => {
  const jamones = indiceDeFixture([
    fichaFalsa({
      id: "test-crudo",
      names: { en: "Ham, prosciutto", es: "Jamón crudo" },
      aliases: { es: [{ alias: "Jamón serrano", confidence: 0.8 }] },
      per_100g: { kcal: 195, protein_g: 25, carbs_g: 0, fat_g: 10, fiber_g: 0, sat_fat_g: 3, sugars_g: 0, sodium_mg: 2000 },
    }),
    fichaFalsa({
      id: "test-cocido",
      names: { en: "Ham", es: "Jamón" },
      per_100g: { kcal: 117, protein_g: 19, carbs_g: 1.6, fat_g: 3.9, fiber_g: 0, sat_fat_g: 1.3, sugars_g: 1.5, sodium_mg: 1149 },
    }),
    fichaFalsa({ id: "test-otro", names: { en: "Bread, NFS", es: "Pan" } }),
  ]);

  it("`jamón serrano/ibérico` vuelve a encontrar el ALIAS, no el jamón cocido", () => {
    // La única regresión de la corrida v2 del golden set: con la barra adentro, el
    // alias `Jamón serrano` (0,8) dejaba de matchear exacto y el difuso terminaba
    // en `Jamón` cocido, un 40 % menos de calorías.
    const r = buscarAlimento("jamón serrano/ibérico", jamones);
    assert.ok(r);
    assert.equal(r.ficha.id, "test-crudo");
    assert.equal(r.nivel, "alias");
    assert.equal(r.confianza_match, 0.8);
    assert.match(r.motivo, /barra/);
  });

  it("las lecturas: la literal primero y una por rama", () => {
    assert.deepEqual(lecturasDelTermino("cured ham, serrano/iberico"), [
      "cured ham, serrano/iberico",
      "cured ham, serrano",
      "cured ham, iberico",
    ]);
    // Sin barra no hay nada que leer de otra manera: una sola lectura, y el motor
    // se comporta exactamente igual que antes.
    assert.deepEqual(lecturasDelTermino("cured ham, serrano"), ["cured ham, serrano"]);
    // Dos pedazos con barra se SUMAN, no se multiplican: 1 + 2 + 2, no 1 + 4.
    assert.equal(lecturasDelTermino("a b/c d e/f").length, 5);
    // Una barra que no separa dos nombres no dice nada.
    assert.deepEqual(lecturasDelTermino("pasta 1/"), ["pasta 1/"]);
  });

  it("una rama nunca le gana a la lectura literal: solo la reemplaza si es MEJOR", () => {
    // `Ham` a secas resuelve exacto al jamón cocido. Si la rama pudiera ganar
    // empates, cualquier término con barra se volvería impredecible.
    const r = buscarAlimento("Ham", jamones);
    assert.ok(r);
    assert.equal(r.ficha.id, "test-cocido");
    assert.equal(r.confianza_match, 1);
  });

  it("el barrido: ningún `names.en` del catálogo real cambia por leer las barras", () => {
    // Seis fichas del catálogo tienen una barra en el nombre (`Hot chocolate /
    // cocoa, NFS`, `Iced Tea / Lemonade juice drink`…). Todas tienen que seguir
    // encontrándose a sí mismas por la lectura literal.
    const conBarra = catalogoReal().foods.filter((f) => !f.deprecated && f.names.en.includes("/"));
    assert.ok(conBarra.length > 0, "el catálogo dejó de tener nombres con barra");
    for (const f of conBarra) {
      const r = buscarAlimento(f.names.en, index);
      assert.equal(r?.ficha.id, f.id, f.names.en);
    }
  });
});

/**
 * DT-37 · DEFECTO 2 — EL DUELO DE IDIOMAS, MEDIDO EN LA CORRIDA v3.
 *
 * Los dos casos que abrieron la deuda tienen la misma forma y la forma es la
 * trampa: EL QUE GANABA TRAÍA EL SCORE MÁS ALTO Y ERA EL PEOR MATCH. Los tests
 * corren contra el catálogo real porque el caso ES el catálogo real —`Limón` y
 * `Lima cruda` son dos fichas de USDA que existen y se parecen— y los términos
 * en español son los que la visión escribió aquel día, reconstruidos desde el
 * motivo grabado (el expediente no guarda `food_es`: DT-25).
 */
describe("DT-37 — el idioma más confiado no gana si contradice al inglés", () => {
  it("`lime` recupera la LIMA aunque la visión la haya traducido como `limón`", () => {
    // Plato 08 de la v3: `lime` (inglés) → `Lima cruda` 0,3, la ficha correcta;
    // `limón` (español, mal traducido) → `Limón` 1,0. Ganaba el 1,0 y al usuario
    // le quedaba "Limón" sobre una lima, al 85 % de confianza.
    const soloIngles = buscarAlimento("lime", index);
    const soloEspanol = buscarAlimento("limón", index);
    assert.equal(soloIngles?.ficha.id, "fdc-168155", "la ficha correcta es la lima");
    assert.equal(soloEspanol?.ficha.id, "fdc-167746", "y el español exacto sigue llevando al limón");
    assert.ok(soloEspanol.confianza_match > soloIngles.confianza_match, "el perdedor puntúa MÁS alto");

    const r = buscarConDosNombres("lime", "limón", index);
    assert.equal(r?.ficha.id, "fdc-168155");
  });

  it("`gravy, brown sauce` recupera la salsa de carne contra la salsa mexicana", () => {
    // Plato 07, tres corridas seguidas perdiendo. Los dos son difusos: ninguno de
    // los dos idiomas llegó por un término que alguien escribió, y entre dos
    // conjeturas manda la clave primaria limpia (`names.en`).
    const r = buscarConDosNombres("gravy, brown sauce", "salsa parda", index);
    assert.equal(r?.ficha.id, "fdc-2707149");
    assert.equal(r?.nivel, "difuso");
  });

  it("el español que la CURACIÓN escribió le sigue ganando a una conjetura inglesa", () => {
    // Los cuatro casos medidos en las corridas del golden donde el español ganó
    // Y TENÍA RAZÓN. En los dos primeros el español ni comparte palabras con el
    // término inglés —`Tocino` no dice "pork", `Salchicha` no dice "cocktail"—:
    // lo que los salva es que son términos ESCRITOS, no difusos.
    const casos: [string, string, string][] = [
      ["pork belly, boiled", "panceta cocida", "fdc-2705885"],
      ["cocktail sausages, cooked", "salchichas de cóctel", "fdc-2706190"],
      ["saltine crackers", "galletas saladas", "fdc-2708132"],
      ["toasted white bread", "pan tostado", "fdc-2707592"],
    ];
    for (const [en, es, esperada] of casos) {
      assert.equal(buscarConDosNombres(en, es, index)?.ficha.id, esperada, `${en} / ${es}`);
    }
  });

  it("los platos que el español desbloqueó en la card 2.6 no se mueven", () => {
    // Los mismos tres casos del test de la card 2.6, más el bife: son los ítems
    // que entran por el español y hoy resuelven bien (36 de los 66 de la v3).
    assert.equal(buscarConDosNombres("rice, cooked, seafood paella style", "paella", index)?.ficha.id, "fdc-2706723");
    assert.equal(buscarConDosNombres("french fries, fried", "papas fritas", index)?.ficha.id, "fdc-2709456");
    assert.equal(buscarConDosNombres("beef steak, grilled", "bife", index)?.ficha.id, "fdc-2705824");
    assert.equal(
      buscarConDosNombres("lasagna with meat sauce and spinach ricotta", "lasaña", index)?.ficha.id,
      "fdc-2708755",
    );
  });

  it("EL BARRIDO: los 1.115 pares (names.en, names.es) del catálogo no cambian ni uno", () => {
    // La red de regresión de esta regla. Cada ficha con nombre en los dos idiomas
    // se busca con los dos a la vez: el desempate nuevo no puede cambiar ni una.
    const fallos: string[] = [];
    let pares = 0;
    for (const f of catalogoReal().foods) {
      if (f.deprecated || f.names.es === null) continue;
      pares += 1;
      const r = buscarConDosNombres(f.names.en, f.names.es, index);
      if (r === null || r.ficha.id !== f.id) {
        fallos.push(`${f.id} "${f.names.en}"/"${f.names.es}" -> ${r === null ? "null" : r.ficha.id}`);
      }
    }
    assert.ok(pares > 1000, `el catálogo bajó a ${pares} pares bilingües`);
    assert.deepEqual(fallos, []);
  });

  it("sin `food_es` el desempate nuevo ni existe", () => {
    for (const termino of ["lime", "gravy, brown sauce", "apple, raw", "Zzzz plato inexistente xyz"]) {
      for (const es of [undefined, null, "", "   "]) {
        assert.deepEqual(buscarConDosNombres(termino, es, index), buscarAlimento(termino, index), `${termino}/${es}`);
      }
    }
  });
});

/**
 * DT-37 · DEFECTO 1 — EL RESPALDO DE IDENTIDAD.
 *
 * La medida que la compuerta del total no tenía: ¿la ficha que ganó NOMBRA lo
 * que la visión describió? Es otra pregunta que la confianza y por eso es otro
 * número. Acá se mide la señal; el efecto sobre el total está en
 * `arithmetic.test.ts` y el plato entero en `analyze.test.ts`.
 */
describe("DT-37 — el respaldo de identidad", () => {
  it("cuenta las palabras que la ficha nombra, sobre las que dijo la visión", () => {
    const lasana = fichaReal("fdc-2708755");
    // `lasaña · carne · espinaca · ricotta`: la ficha nombra las tres primeras.
    assert.equal(redondear(respaldoDeIdentidad("lasaña de carne con espinaca y ricotta", lasana), 2), 0.75);
    // La miel del plato 28 explica UNA palabra de seis: sabe que hay miel adentro
    // de algo, y no sabe qué es ese algo.
    const miel = fichaReal("fdc-169640");
    assert.ok(respaldoDeIdentidad("honey toast with whipped cream and cookie", miel) < 0.25);
    // Y una ficha que no comparte NADA da cero, que es la señal del duelo.
    assert.equal(respaldoDeIdentidad("lime", fichaReal("fdc-167746")), 0);
  });

  it("el vocabulario es el de TODOS los nombres, no el del término que ganó", () => {
    const vocabulario = vocabularioDeLaFicha(fichaReal("fdc-2708755"));
    for (const palabra of ["lasagna", "meat", "spinach", "lasana", "carne", "espinaca"]) {
      assert.ok(vocabulario.includes(palabra), `falta "${palabra}" en el vocabulario`);
    }
  });

  it("el plural plegado no rompe la comparación: `tomatoe` y `tomato` son la misma palabra", () => {
    // `Tomatoes, raw` tiene clave `tomatoe raw`; la visión escribe `tomato`.
    assert.ok(mismaPalabra("tomato", "tomatoe"));
    assert.equal(respaldoDeIdentidad("tomato, sliced", fichaReal("fdc-2709719")), 1);
    // Y la tolerancia no junta dos alimentos distintos.
    assert.equal(mismaPalabra("lime", "lima"), false);
  });

  it("un match exacto siempre trae la identidad respaldada", () => {
    assert.equal(buscarAlimento("Croissant", index)?.identidad_respaldada, true);
    assert.equal(buscarAlimento("paella", index)?.identidad_respaldada, true);
  });

  it("un difuso la trae solo si la ficha nombra la mayor parte de lo que se dijo", () => {
    // La lasaña: cobertura 0,21 —una vía flojísima— pero la ficha nombra la
    // lasaña, la carne y la espinaca.
    const lasana = buscarAlimento("lasaña de carne con espinaca y ricotta", index);
    assert.equal(lasana?.ficha.id, "fdc-2708755");
    assert.equal(lasana?.nivel, "difuso");
    assert.equal(lasana?.identidad_respaldada, true);
    // La comida de plástico: mismo nivel difuso, y la ficha no nombra el postre.
    const miel = buscarAlimento("honey toast with whipped cream and cookie", index);
    assert.equal(miel?.ficha.id, "fdc-169640");
    assert.equal(miel?.identidad_respaldada, undefined);
  });

  it("la dirección B queda afuera aunque el respaldo dé 1", () => {
    // `flatbread` → `Crackers, flatbread`: la consulta está DENTRO del nombre, así
    // que el respaldo vale 1 por construcción y no significa nada. Es el ítem que
    // publicó una galleta donde había una tortilla (+89 %).
    const r = buscarAlimento("flatbread", index);
    assert.equal(r?.ficha.id, "fdc-2708157");
    assert.equal(r?.nivel, "difuso");
    assert.equal(respaldoDeIdentidad("flatbread", r.ficha), 1);
    assert.equal(r?.identidad_respaldada, undefined);
  });
});

/* ===========================================================================
 * CARD 5.3 — LAS TRES PUERTAS DECLARADAS: sustituto, cabeza y contradicción
 *
 * Los tres niveles nuevos no comparan texto: contestan con lo que declararon la
 * curación o la taxonomía. Estos tests fijan CUÁNDO entra cada uno, que es la
 * única decisión que tienen.
 * =========================================================================== */
describe("card 5.3 — la subfamilia con la que trabaja el motor", () => {
  it("la declarada gana, y viaja marcada como declarada", () => {
    const r = subfamiliaDeclarada("pizza/con-carne", "cualquier cosa", "cualquier cosa", index);
    assert.ok(r);
    assert.equal(r.entrada.id, "pizza/con-carne");
    assert.equal(r.declarada, true);
  });

  it("un id que no está en el enum se ignora, y se intenta deducir", () => {
    // El motor no rechaza escaneos: los declara. Un valor inventado se comporta
    // como si la visión no hubiera dicho nada.
    assert.equal(subfamiliaDeclarada("no-existe/para-nada", "zzz qqq", "zzz qqq", index), null);
  });

  it("SIN declaración se deduce del nombre, y solo por igualdad exacta", () => {
    // Es el último recurso: la visión tiene que haber escrito EL NOMBRE de una
    // subfamilia. Buscarla por parecido sería volver a adivinar con otro
    // vocabulario, que es lo que el Bloque 0 midió que no funciona.
    const deducida = subfamiliaDeclarada(undefined, "cooked rice", "arroz cocido", index);
    assert.ok(deducida);
    assert.equal(deducida.entrada.id, "arroz/cocido");
    // Y `declarada: false` es lo que impide que una familia deducida DEL TÉRMINO
    // pueda después contradecir a ese mismo término.
    assert.equal(deducida.declarada, false);
    assert.equal(subfamiliaDeclarada(undefined, "arroz cocido con algo más", "arroz cocido con algo más", index), null);
  });
});

describe("card 5.3 — la contradicción con la familia declarada", () => {
  const pizza = index.taxonomia.porId.get("pizza/con-carne");

  it("un DIFUSO que cae en otra familia contradice", () => {
    // `Vegetables` → `Aceite vegetal` (familia `aceite-y-grasa`) con difuso 0,41:
    // uno de los 15 casos graves del Bloque 0.
    const verdura = index.taxonomia.porId.get("verdura/cruda");
    assert.ok(verdura);
    const m = buscarConDosNombres("Vegetables", "Verdura", index);
    assert.ok(m);
    assert.equal(m.nivel, "difuso");
    assert.equal(contradiceALaFamilia(m, verdura, index), true);
  });

  it("un EXACTO o un ALIAS no contradicen nunca: los escribió una persona", () => {
    assert.ok(pizza);
    const exacto = buscarConDosNombres("ketchup", "kétchup", index);
    assert.ok(exacto && exacto.nivel === "exacto");
    assert.equal(contradiceALaFamilia(exacto, pizza, index), false);
    const alias = buscarConDosNombres("Hot dog", "Perrito caliente", index);
    assert.ok(alias && alias.nivel === "alias");
    assert.equal(contradiceALaFamilia(alias, pizza, index), false);
  });

  it("dentro de la MISMA familia no hay contradicción, aunque cambie la subfamilia", () => {
    // El atún en lata: la visión puede declarar `pescado/conserva` y el término
    // resolver a una ficha de `pescado/cocinado`. Es la misma comida; el motor
    // no tiene por qué preferir un promedio a una ficha concreta.
    const conserva = index.taxonomia.porId.get("pescado/conserva");
    assert.ok(conserva);
    const m = buscarConDosNombres("tuna, canned", "atún en lata", index);
    assert.ok(m);
    assert.equal(index.taxonomia.deLaFicha.get(m.ficha.id), "pescado/cocinado");
    assert.equal(contradiceALaFamilia(m, conserva, index), false);
  });

  it("sin ninguna cabeza a la que caer, la contradicción no se declara", () => {
    // Tirar el difuso sin nada con que reemplazarlo dejaría el plato sin número,
    // que es peor que un número flojo con su reserva escrita. `ensalada/verde`
    // no tiene cabeza propia... pero su familia sí, así que hay que construir el
    // caso: una entrada sin ninguna de las dos.
    const sinCabezas = { ...(index.taxonomia.porId.get("verdura/cruda") as NonNullable<ReturnType<typeof index.taxonomia.porId.get>>), cabezaDeSubfamilia: null, cabezaDeFamilia: null };
    const m = buscarConDosNombres("Vegetables", "Verdura", index);
    assert.ok(m);
    assert.equal(contradiceALaFamilia(m, sinCabezas, index), false);
  });
});

describe("card 5.3 — la cabeza y el sustituto, sueltos", () => {
  it("la cabeza de subfamilia respalda la identidad; la de familia no", () => {
    const conCabeza = index.taxonomia.porId.get("arroz/cocido");
    assert.ok(conCabeza);
    const sub = cabezaDeLaTaxonomia(conCabeza);
    assert.ok(sub);
    assert.equal(sub.nivel, "cabeza_subfamilia");
    assert.equal(sub.identidad_respaldada, true);

    // `ensalada/verdura` es uno de los 13 huecos declarados del Bloque 0.
    const sinCabeza = index.taxonomia.porId.get("ensalada/verdura");
    assert.ok(sinCabeza);
    const fam = cabezaDeLaTaxonomia(sinCabeza);
    assert.ok(fam);
    assert.equal(fam.nivel, "cabeza_familia");
    assert.equal(fam.identidad_respaldada, undefined);
  });

  it("el sustituto declarado llega a su ficha y arrastra el motivo de la curación", () => {
    const m = sustitutoDeclarado("pizza dough, baked", "masa de pizza horneada", index);
    assert.ok(m);
    assert.equal(m.ficha.id, "fdc-2708674");
    assert.equal(m.nivel, "sustituto");
    assert.match(m.motivo, /USDA no mide la masa de pizza/);
    assert.equal(m.identidad_respaldada, true);
  });

  it("y no dispara con nada que no se le haya escrito", () => {
    assert.equal(sustitutoDeclarado("pizza", "pizza", index), null);
    assert.equal(sustitutoDeclarado("dough", "masa", index), null);
  });
});

describe("card 6.3 — el desempate crudo/cocido, escrito simétrico", () => {
  /**
   * EL DEFECTO, MEDIDO EN PRODUCCIÓN EL 03/09/2026: dos ensaladas reales
   * resolvieron sus ingredientes CRUDOS a fichas COCIDAS. La lechuga picada salía
   * `Lechuga cocida` (49 kcal/100 g y 3,1 g de grasa) existiendo `Lechuga cruda`
   * (20 kcal, 0,2 g), y el tomate salía `Tomate cocido` (50) existiendo `Tomate
   * crudo` (20). Una ensalada verde salió 12 % inflada.
   *
   * LA CAUSA: "picado", "shredded" y "chopped" son descriptores y no cuentan en
   * la cobertura, así que «lechuga» explica ENTERO tanto a la cruda como a la
   * cocida: las dos entran con cobertura 1 y confianza 0,600. El empate lo
   * decidía el ORDEN de la lista —ordenada por largo, y "cocida" tiene una letra
   * más que "cruda"—, porque la regla del crudo/cocido de la card 2.6 solo sabía
   * PROMOVER a la cocida y nunca devolver al crudo.
   */
  it("`lechuga picada` y `lettuce, shredded` vuelven a la CRUDA: 20 kcal, no 49", () => {
    for (const termino of ["lechuga picada", "lettuce, shredded", "lettuce, chopped", "lechuga en rodajas"]) {
      assert.equal(buscarAlimento(termino, index)?.ficha.id, "fdc-2709789", termino);
    }
    assert.equal(buscarConDosNombres("lettuce, shredded", "lechuga picada", index)?.ficha.id, "fdc-2709789");
    assert.equal(fichaReal("fdc-2709789").per_100g.kcal, 20);
    assert.equal(fichaReal("fdc-2709949").per_100g.kcal, 49);
  });

  it("`tomate picado` y `tomate troceado` vuelven al CRUDO: 20 kcal, no 50", () => {
    for (const termino of ["tomate picado", "tomate troceado", "tomate en rodajas", "tomatoes, diced"]) {
      assert.equal(buscarAlimento(termino, index)?.ficha.id, "fdc-2709719", termino);
    }
    assert.equal(buscarConDosNombres("tomato, chopped", "tomate picado", index)?.ficha.id, "fdc-2709719");
    assert.equal(fichaReal("fdc-2709720").per_100g.kcal, 50);
  });

  it("la lombarda del plato 20 del golden: CRUDA, 34 kcal, no 58", () => {
    // Es el ÚNICO ítem que se mueve en las 30 visiones de `vision-v6` pasadas por
    // `analizarEscaneo`: los 10 g de `red cabbage, shredded` de la ensalada mixta
    // pasan de `Repollo rojo cocido con sal y grasa` a `Repollo rojo crudo`, y el
    // plato pasa de 243,9 a 241,7 kcal.
    for (const termino of ["red cabbage, shredded", "cabbage red, chopped", "repollo rojo picado"]) {
      assert.equal(buscarAlimento(termino, index)?.ficha.id, "fdc-169977", termino);
    }
    assert.equal(buscarConDosNombres("red cabbage, shredded", "lombarda rallada", index)?.ficha.id, "fdc-169977");
    assert.equal(fichaReal("fdc-2709893").per_100g.kcal, 58);
  });

  it("EL CHAMPIÑÓN NO SE MUEVE, y no es que la regla falle: no hay ficha cruda", () => {
    // `mushrooms, sliced` sigue dando `Champiñones frescos cocidos con grasa` (66
    // kcal) porque el catálogo NO TIENE champiñón crudo: el único crudo es el
    // SHIITAKE, que es otro hongo y ni siquiera compite (su nombre agrega una
    // palabra que la visión no dijo). Es una deuda de la curación, no del motor.
    assert.equal(buscarAlimento("mushrooms, sliced", index)?.ficha.id, "fdc-2709939");
    const crudos = catalogoReal().foods.filter(
      (f) => !f.deprecated && /mushroom/i.test(f.names.en ?? "") && /\braw\b/i.test(f.names.en ?? ""),
    );
    assert.deepEqual(
      crudos.map((f) => f.id),
      ["fdc-169242"],
      "si aparece un champiñón crudo llano, este candado tiene que revisarse",
    );
  });

  /* ------------------------------------------------------------------
   * LOS CANDADOS DE LO QUE YA ANDABA. Los cinco se midieron ANTES de tocar el
   * matcher y dan lo mismo después.
   * ------------------------------------------------------------------ */

  it("lo SECO sigue ganando cocido: lentejas, arroz salvaje y panceta", () => {
    // La otra mitad de la regla, la que promueve, no se movió: cuando la cruda es
    // MÁS densa está seca y lo que hay en la foto es la cocida.
    for (const termino of ["lentejas", "lentils", "lenteja picada", "lentils, chopped"]) {
      assert.equal(buscarAlimento(termino, index)?.ficha.id, "fdc-2707423", termino);
    }
    // Arroz salvaje crudo 357 kcal contra hervido 101: el desempate ni se acerca.
    for (const termino of ["arroz salvaje picado", "wild rice, chopped"]) {
      assert.equal(buscarAlimento(termino, index)?.ficha.id, "fdc-168897", termino);
    }
    // `Panceta cruda` (fdc-167812) 518 kcal contra `Tocino cocido` 484: la misma
    // cuenta, mucho más ajustada, y alcanza igual.
    assert.equal(buscarAlimento("panceta picada", index)?.ficha.id, "fdc-2705885");
    assert.ok(fichaReal("fdc-172420").per_100g.kcal > fichaReal("fdc-2707423").per_100g.kcal);
    assert.ok(fichaReal("fdc-167812").per_100g.kcal > fichaReal("fdc-2705885").per_100g.kcal);
  });

  it("si la consulta DECLARA el estado, el desempate no opina", () => {
    // `cabbage, cooked` sigue sin ficha —el candado de la card 2.8, que impide que
    // una consulta cocida termine en una ficha cruda— y las cocidas nombradas
    // siguen dando las cocidas.
    assert.equal(buscarAlimento("cabbage, cooked", index), null);
    assert.equal(buscarAlimento("lettuce, cooked", index)?.ficha.id, "fdc-2709949");
    assert.equal(buscarAlimento("lechuga cocida", index)?.ficha.id, "fdc-2709949");
    assert.equal(buscarAlimento("tomate cocido", index)?.ficha.id, "fdc-2709720");
    assert.equal(buscarAlimento("huevo cocido picado", index)?.ficha.id, "fdc-2707153");
    assert.equal(buscarAlimento("boiled potato", index)?.ficha.id, "fdc-2709393");
  });

  it("la zanahoria rallada y la pasta siguen donde estaban", () => {
    // La zanahoria la ganaba el desempate de la variante (card 6.1); ahora la
    // ganan los dos, y para el mismo lado.
    for (const termino of ["carrot, shredded", "carrots, shredded", "zanahoria rallada"]) {
      assert.equal(buscarAlimento(termino, index)?.ficha.id, "fdc-170393", termino);
    }
    assert.equal(buscarAlimento("pasta", index)?.ficha.id, "fdc-2708357");
    // `arroz` y `rice` a secas tampoco se mueven. NO dan "arroz cocido" —dan
    // `Arroz rojo` y `Sopa de arroz`—, y eso ya era así antes de esta card: es un
    // agujero del vocabulario del arroz, no de este desempate.
    assert.equal(buscarAlimento("arroz", index)?.ficha.id, "fdc-2709087");
    assert.equal(buscarAlimento("rice", index)?.ficha.id, "fdc-2709146");
  });

  /* ------------------------------------------------------------------
   * EL ESCENARIO CONSTRUIDO. El orden de la lista es lo que rompía, así que el
   * candado tiene que correr las DOS direcciones, y el catálogo real solo ofrece
   * una (el nombre cocido es siempre más largo que el crudo, y la lista se
   * recorre ordenada por largo). Se construye cambiándole el nombre a fichas
   * REALES: el id se mantiene, así que la taxonomía las sigue ubicando en su
   * familia, que es justo lo que el desempate necesita preguntar. Con fichas
   * inventadas no habría familia y el escenario mediría otra cosa.
   * ------------------------------------------------------------------ */

  const conNombre = (id: string, en: string) => ({ ...fichaReal(id), names: { en, es: null } });
  const par = (idCrudo: string, enCrudo: string, idCocido: string, enCocido: string) =>
    indiceDeFixture([conNombre(idCrudo, enCrudo), conNombre(idCocido, enCocido)]);

  it("la lechuga gana venga EN EL ORDEN QUE VENGA en la lista de candidatos", () => {
    const cocidoPrimero = par("fdc-2709789", "Lettuce, raw", "fdc-2709949", "Lettuce, cooked");
    assert.equal(buscarAlimento("lettuce, chopped", cocidoPrimero)?.ficha.id, "fdc-2709789");
    const crudoPrimero = par("fdc-2709789", "Lettuce, raw, whole", "fdc-2709949", "Lettuce, cooked");
    assert.equal(buscarAlimento("lettuce, chopped", crudoPrimero)?.ficha.id, "fdc-2709789");
  });

  it("y el HUEVO gana cocido en los dos órdenes: el lado cocido también es una regla", () => {
    // ACÁ SE MIDE LA FAMILIA SOLA, sin la densidad de por medio: el huevo crudo
    // (143 kcal) es MENOS denso que el cocido (176), o sea que la pregunta de las
    // kcal diría "gana el crudo" y la de la familia dice que no. Y contesta lo
    // mismo en los dos órdenes: el empate ya no lo decide la lista.
    const cocidoPrimero = par("fdc-2707152", "Egg, raw", "fdc-2707153", "Egg, cooked");
    assert.equal(buscarAlimento("egg, chopped", cocidoPrimero)?.ficha.id, "fdc-2707153");
    const crudoPrimero = par("fdc-2707152", "Egg, raw, whole", "fdc-2707153", "Egg, cooked");
    assert.equal(buscarAlimento("egg, chopped", crudoPrimero)?.ficha.id, "fdc-2707153");
    assert.ok(fichaReal("fdc-2707152").per_100g.kcal < fichaReal("fdc-2707153").per_100g.kcal);
  });

  it("y las lentejas ganan cocidas en los dos órdenes, por SECAS", () => {
    const cocidoPrimero = par("fdc-172420", "Lentils, raw", "fdc-2707423", "Lentils, cooked");
    assert.equal(buscarAlimento("lentils, chopped", cocidoPrimero)?.ficha.id, "fdc-2707423");
    const crudoPrimero = par("fdc-172420", "Lentils, raw, whole", "fdc-2707423", "Lentils, cooked");
    assert.equal(buscarAlimento("lentils, chopped", crudoPrimero)?.ficha.id, "fdc-2707423");
  });

  it("el desempate NO toca a nadie que gane por confianza, ni a dos que empatan de casualidad", () => {
    // `lettuce green cooked` explica las dos palabras de la consulta y
    // `lettuce raw` solo una: no es un empate, y una ficha que explica más no se
    // pierde por un desempate. Además no son hermanas —sin descriptores, una dice
    // "lettuce green" y la otra "lettuce"—, que es la segunda razón para no
    // tocarlas.
    const indice = par("fdc-2709789", "Lettuce, raw", "fdc-2709949", "Lettuce, green, cooked");
    assert.equal(buscarAlimento("lettuce green, chopped", indice)?.ficha.id, "fdc-2709949");
  });

  it("si la consulta dice CRUDO o COCIDO, el fixture también obedece", () => {
    const indice = par("fdc-2709789", "Lettuce, raw", "fdc-2709949", "Lettuce, cooked");
    assert.equal(buscarAlimento("lettuce, cooked", indice)?.ficha.id, "fdc-2709949");
    assert.equal(buscarAlimento("lettuce, raw", indice)?.ficha.id, "fdc-2709789");
  });

  /**
   * EL RETOQUE DE LA CARD 6.3: LA FAMILIA ACOTA EL DESEMPATE.
   *
   * La primera versión se lo preguntaba solo a las kcal, y las kcal saben decir
   * "está seco" pero no "no se come crudo" cuando cocinar AGREGA grasa. Medido
   * sobre esa versión: `huevo duro` contestaba `Huevo crudo` (143 contra los 176
   * del cocido) y `patata troceada` contestaba `Patatas crudas con cáscara` (77
   * contra 126). Un usuario español que escribe "huevo duro" no puede recibir
   * huevo crudo. La taxonomía sí sabe la diferencia: la lechuga es `verdura`, la
   * manzana es `fruta`, y el huevo y la patata tienen familia propia.
   */
  it("`huevo duro` y `patata troceada` dan la COCIDA, y por regla, no por el orden", () => {
    for (const termino of ["huevo duro", "huevo duro picado", "huevo picado", "huevo troceado"]) {
      assert.equal(buscarAlimento(termino, index)?.ficha.id, "fdc-2707153", termino);
    }
    for (const termino of ["patata troceada", "patata picada", "papa picada", "potato, diced"]) {
      assert.equal(buscarAlimento(termino, index)?.ficha.id, "fdc-2709393", termino);
    }
    assert.equal(buscarConDosNombres("hard-boiled egg, chopped", "huevo duro picado", index)?.ficha.id, "fdc-2707153");
    assert.equal(buscarConDosNombres("potato, diced", "patata troceada", index)?.ficha.id, "fdc-2709393");
    // Y no es que la densidad los frene: en los dos, la cruda es la MENOS densa.
    assert.ok(fichaReal("fdc-2707152").per_100g.kcal < fichaReal("fdc-2707153").per_100g.kcal);
    assert.ok(fichaReal("fdc-170026").per_100g.kcal < fichaReal("fdc-2709393").per_100g.kcal);
  });

  it("la FRUTA sí vuelve al crudo: es la otra familia de la lista", () => {
    for (const termino of ["manzana picada", "apple, sliced", "apple, chopped"]) {
      assert.equal(buscarAlimento(termino, index)?.ficha.id, "fdc-2709215", termino);
    }
    assert.deepEqual([...FAMILIAS_QUE_SE_COMEN_CRUDAS], ["verdura", "fruta"]);
    // Las cuatro fichas crudas que este desempate devuelve hoy viven en esas dos
    // familias; el huevo y la patata, en la suya.
    const familias: [string, string][] = [
      ["fdc-2709789", "verdura"],
      ["fdc-2709719", "verdura"],
      ["fdc-169977", "verdura"],
      ["fdc-170419", "verdura"],
      ["fdc-2709215", "fruta"],
      ["fdc-2707152", "huevo"],
      ["fdc-170026", "patata"],
    ];
    for (const [id, familia] of familias) {
      assert.equal(index.taxonomia.deLaFicha.get(id)?.split("/")[0], familia, id);
    }
  });

  /**
   * LO QUE ESTE RETOQUE NO ARREGLA, Y NO ES SUYO (deuda, dueño: curación +
   * una card del motor).
   *
   * `egg, chopped` contesta `Huevo crudo` —y lo contesta también en `main`, con
   * el desempate viejo—. No pasa por acá: lo decide el desempate de la VARIANTE
   * de la card 6.1, que corre antes. `Egg, whole, cooked, NS as to cooking
   * method` solo llega a "egg cooked" como variante DEDUCIDA por el índice,
   * mientras que `Egg, whole, raw` está ESCRITO, y un término escrito le gana a
   * una variante. El arreglo es del lado del catálogo (un nombre o un alias
   * escrito para el huevo cocido), no de este desempate.
   */
  it("lo que sigue igual que en main: `egg, chopped` da el crudo por la VARIANTE", () => {
    const r = buscarAlimento("egg, chopped", index);
    assert.equal(r?.ficha.id, "fdc-2707152");
    assert.equal(index.difusoEn.find((e) => e.clave === "egg whole cooked")?.variante, true);
    assert.equal(index.difusoEn.find((e) => e.clave === "egg whole raw")?.variante, undefined);
  });
});
