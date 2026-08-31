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
import { buscarAlimento, guardaQueViola } from "./match";
import { contieneSecuencia, empiezaConPalabra, normalizar } from "./normalize";
import { aliasConfidence, aliasText } from "../kb/types";
import { catalogoReal, fichaFalsa, indiceDeFixture, indiceReal } from "./testing";

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

  it("es el ÚNICO cruce del catálogo (medido)", () => {
    const cruces = [...index.exactoEn.entries()].filter(
      ([clave, entrada]) => index.exactoEs.has(clave) && index.exactoEs.get(clave)?.food_id !== entrada.food_id,
    );
    assert.deepEqual(
      cruces.map(([c]) => c),
      ["catsup"],
    );
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
