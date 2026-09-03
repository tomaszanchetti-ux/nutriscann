/**
 * Los candados de la composición on-demand.
 *
 * EL TEST QUE VALE ES EL PRIMERO: las 53 recetas del catálogo se vuelven a
 * componer EN RUNTIME, con los mismos ingredientes y el mismo método, y tienen
 * que dar el mismo `per_100g` que el build escribió en la ficha. Es la única
 * forma de demostrar que la matemática del motor y la del catálogo son LA MISMA
 * —no una reimplementación parecida— y de que la copia de `transforms.ts` no se
 * separó del original. Si mañana alguien toca la fórmula de un lado, nueve
 * fichas dejan de reproducirse y el test lo dice con nombre y apellido.
 *
 * Con la card 6.4 pasaron de nueve a 52, y eso lo vuelve bastante más fuerte: las
 * 43 recetas nuevas de platos españoles y mediterráneos se recomponen en runtime
 * con los mismos gramos y el mismo método, y dan el per_100g exacto que el build
 * escribió. La única línea que la card tocó de este archivo es el CONTEO.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COOKING_TRANSFORMS } from "../kb/cooking.transforms";
import { componerPlato } from "./compose";
import { DECIMALES, FACTOR_COMPOSICION, FACTOR_COMPOSICION_PARCIAL, FACTOR_GENERICO } from "./constants";
import { redondear } from "./match";
import { catalogoReal, fichaFalsa, fichaReal, indiceDeFixture, indiceReal } from "./testing";
import type { Preparacion, VisionItem } from "./types";

const index = indiceReal();

describe("recomponer las recetas del catálogo", () => {
  const recetas = catalogoReal().foods.filter((f) => f.receta !== undefined);

  it("el catálogo trae las 53 recetas compuestas", () => {
    // 9 con la card 1.7, 52 con la card 6.4, 53 con los calçots de la 6.4b.
    assert.equal(recetas.length, 53);
  });

  for (const ficha of recetas) {
    it(`${ficha.id} se reconstruye con el mismo per_100g`, () => {
      const receta = ficha.receta;
      assert.ok(receta);
      const item: VisionItem = {
        food_en: ficha.names.en,
        grams: receta.peso_final_g,
        confidence: 1,
        preparation: receta.metodo as Preparacion,
        // Los ingredientes se nombran por su `names.en`, que es exactamente lo
        // que emitiría la visión mirando el plato.
        components: receta.ingredientes.map((i) => ({ food_en: fichaReal(i.ref).names.en, grams: i.grams })),
      };

      const r = componerPlato(item, index);
      assert.ok(r.ok, r.ok ? "" : r.motivo);
      assert.deepEqual(r.derivacion.per_100g, ficha.per_100g);
      assert.equal(r.derivacion.peso_final_g, receta.peso_final_g);
      assert.equal(r.derivacion.peso_entrada_g, receta.peso_entrada_g);
      assert.equal(r.derivacion.aceite_absorbido_g, receta.aceite_absorbido_g);
      assert.deepEqual(
        r.composicion.componentes.map((c) => c.food_id),
        receta.ingredientes.map((i) => i.ref),
      );
    });
  }
});

describe("la transformación", () => {
  it("sin `preparation` el método es `mezclado` (la convención medida de FNDDS)", () => {
    const r = componerPlato(
      { food_en: "plato sin nombre", grams: 200, confidence: 1, components: [{ food_en: "Rice noodles, cooked", grams: 200 }] },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.equal(r.composicion.metodo, "mezclado");
    assert.equal(r.composicion.peso_final_g, 200);
  });

  it("`frito` absorbe aceite y lo declara con la ficha con la que lo cuantificó", () => {
    const componentes = [{ food_en: "Rice noodles, cooked", grams: 200 }];
    const crudo = componerPlato({ food_en: "x", grams: 200, confidence: 1, preparation: "mezclado", components: componentes }, index);
    const frito = componerPlato({ food_en: "x", grams: 200, confidence: 1, preparation: "frito", components: componentes }, index);
    assert.ok(crudo.ok && frito.ok);
    assert.equal(crudo.composicion.aceite_absorbido_g, 0);
    assert.equal(frito.composicion.aceite_absorbido_g, 13); // 6,5 % de 200 g
    assert.equal(frito.composicion.aceite_ref, COOKING_TRANSFORMS["frito"]?.aceite_ref);
    assert.ok(frito.derivacion.per_100g.fat_g > crudo.derivacion.per_100g.fat_g);
  });

  it("`horneado` pierde agua y concentra: mismos gramos, más calorías por 100 g", () => {
    const componentes = [{ food_en: "Rice noodles, cooked", grams: 200 }];
    const mezclado = componerPlato({ food_en: "x", grams: 200, confidence: 1, preparation: "mezclado", components: componentes }, index);
    const horneado = componerPlato({ food_en: "x", grams: 200, confidence: 1, preparation: "horneado", components: componentes }, index);
    assert.ok(mezclado.ok && horneado.ok);
    assert.equal(horneado.composicion.peso_final_g, 151.8); // 200 × 0,759
    assert.ok(horneado.derivacion.per_100g.kcal > mezclado.derivacion.per_100g.kcal);
  });
});

describe("cuándo NO se compone", () => {
  it("si falta UN ingrediente no se compone con los otros", () => {
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 0.9,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: "Zzzz ingrediente inexistente qqq", grams: 100 },
        ],
      },
      index,
    );
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.sin_match.length === 1);
    assert.ok(!r.ok && r.sin_match[0]?.termino_en === "Zzzz ingrediente inexistente qqq");
  });

  it("sin ingredientes no hay nada que componer", () => {
    const r = componerPlato({ food_en: "plato raro", grams: 300, confidence: 0.9 }, index);
    assert.equal(r.ok, false);
  });

  it("un ingrediente con 0 gramos cuenta como no resuelto: no se inventa peso", () => {
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 0.9,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: "Chorizo", grams: 0 },
        ],
      },
      index,
    );
    assert.equal(r.ok, false);
  });
});

describe("confianza y caveats de un compuesto", () => {
  it("la confianza es el PROMEDIO PONDERADO POR GRAMOS de los componentes, con el descuento de composición (card 6.1)", () => {
    // Hasta la Fase 6 este test decía "la confianza es la del eslabón MÁS
    // DÉBIL" y esperaba `redondear(0.6 * FACTOR_GENERICO * FACTOR_COMPOSICION)`
    // = 0,408 — el mínimo de los dos ingredientes. La card 6.1 cambió la regla:
    // ahora es el promedio de las confianzas YA REDONDEADAS de cada componente,
    // ponderado por sus gramos, y recién sobre eso cae el ×0,8 de la
    // composición. El escenario es el mismo: `Rice noodles, cooked` entra EXACTO
    // (confianza 1,0) y `Pastel brasileño` entra por un alias de confianza 0,6 a
    // una ficha que ADEMÁS es genérica (`Empanada`): 0,6 × 0,85 = 0,51.
    const gramosArroz = 200;
    const confianzaArroz = redondear(1);
    const gramosPastel = 100;
    const confianzaPastel = redondear(0.6 * FACTOR_GENERICO);
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: gramosArroz + gramosPastel,
        confidence: 1,
        components: [
          { food_en: "Rice noodles, cooked", grams: gramosArroz },
          { food_en: "Pastel brasileño", grams: gramosPastel },
        ],
      },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    // El promedio ponderado NO se redondea antes de aplicar el ×0,8: solo cada
    // confianza de componente se redondeó (arriba), y el resultado final se
    // redondea una sola vez, al final — igual que hace `compose.ts`.
    const ponderado =
      (confianzaArroz * gramosArroz + confianzaPastel * gramosPastel) / (gramosArroz + gramosPastel);
    const esperada = redondear(ponderado * FACTOR_COMPOSICION);
    assert.equal(r.confianza_match, esperada);
    // Con la regla vieja (el mínimo) habría dado 0,408: el pastel, 100 g de
    // 300, hundía solo al plato entero. Con la nueva, el arroz —el doble de
    // peso y con confianza 1,0— pesa lo que le corresponde.
    const conElMinimoViejo = redondear(Math.min(confianzaArroz, confianzaPastel) * FACTOR_COMPOSICION);
    assert.equal(conElMinimoViejo, 0.408);
    assert.ok(r.confianza_match > conElMinimoViejo);
  });

  it("los caveats de las fichas ingredientes viajan al plato", () => {
    // Se busca un ingrediente real que traiga caveats, para no inventar uno.
    const conCaveats = catalogoReal().foods.find((f) => !f.deprecated && (f.caveats?.length ?? 0) > 0);
    assert.ok(conCaveats);
    const caveatEsperado = conCaveats.caveats?.[0];
    assert.ok(caveatEsperado);
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 1,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: conCaveats.names.en, grams: 100 },
        ],
      },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.ok(r.caveats.includes(caveatEsperado));
    assert.match(r.caveats[0] ?? "", /compuesto en el momento/);
  });
});

/* ===========================================================================
 * CARD 6.1 — LA CONFIANZA DE UN COMPUESTO SE PONDERA POR GRAMOS
 *
 * Los escenarios se CONSTRUYEN con fichas de fixture y confianzas declaradas
 * por alias —no se buscan en el catálogo real—, para poder elegir el número
 * exacto de cada ingrediente. La única excepción es el test de arriba, que
 * reescribe el escenario histórico de `Rice noodles` + `Pastel brasileño`
 * porque ese es el caso que documenta la decisión 4 del encabezado de
 * `compose.ts`: es el contrato que todo este bloque verifica.
 * =========================================================================== */

/**
 * Un ingrediente de fixture que matchea EXACTO por `names.en` — confianza
 * 1,0 siempre, sin que haga falta declarar nada — y ninguna de las dos fichas
 * es genérica, para que la confianza del componente sea exactamente la
 * declarada sin el ×0,85 de más que mete `FACTOR_GENERICO`.
 */
function fichaBuena(id: string) {
  return fichaFalsa({ id, names: { en: `Bueno fixture 6.1 ${id}`, es: null } });
}

/**
 * Un ingrediente de fixture cuyo `names.en` NO se declara en el componente
 * —se busca por un término sin match ("zzz…") para forzar la rama del
 * español— y que matchea por un alias con la confianza EXACTA que se le pida.
 * Así se controla el número sin depender de qué alias trae hoy el catálogo.
 */
function fichaMala(id: string, confianza: number) {
  return fichaFalsa({
    id,
    names: { en: `Malo fixture 6.1 ${id}, sin alcanzar por inglés`, es: `Malo fixture 6.1 ${id} en español` },
    aliases: { es: [{ alias: `malo fixture 6.1 ${id}`, confidence: confianza }] },
  });
}

/** El término que la visión escribiría para el ingrediente "bueno" de fixture. */
const terminoBueno = (id: string) => ({ food_en: `Bueno fixture 6.1 ${id}` });
/** El término que la visión escribiría para el "malo": inglés sin match, español con el alias. */
const terminoMalo = (id: string) => ({
  food_en: `zzz sin match en inglés — ${id}`,
  food_es: `malo fixture 6.1 ${id}`,
});

describe("card 6.1 — la confianza se pondera por gramos", () => {
  it("un ingrediente CHICO y malo no hunde un plato grande y bueno", () => {
    // 10 g a confianza 0,1 + 390 g a confianza 1,0. Ponderado por gramos queda
    // cerca del bueno; con el mínimo viejo el plato entero habría heredado el
    // 0,1 del ingrediente de 10 g, sin importar los otros 390.
    const index6_1 = indiceDeFixture([fichaBuena("a"), fichaMala("b", 0.1)]);
    const gramosBueno = 390;
    const gramosMalo = 10;
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: gramosBueno + gramosMalo,
        confidence: 1,
        components: [
          { ...terminoBueno("a"), grams: gramosBueno },
          { ...terminoMalo("b"), grams: gramosMalo },
        ],
      },
      index6_1,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    const ponderado = (1 * gramosBueno + 0.1 * gramosMalo) / (gramosBueno + gramosMalo); // 0,9775
    const esperada = redondear(ponderado * FACTOR_COMPOSICION); // 0,782
    assert.equal(r.confianza_match, esperada);
    // Con el mínimo viejo habría dado redondear(0,1 × 0,8) = 0,08: un ingrediente
    // de 10 g de 400 decidía por el plato entero. La ponderada queda a un 22 %
    // del techo (0,8), no a un 90 %.
    assert.equal(redondear(0.1 * FACTOR_COMPOSICION), 0.08);
    assert.ok(r.confianza_match > 0.75);
  });

  it("el ingrediente PRINCIPAL malo sí baja la confianza: el promedio pesa", () => {
    // Mismo par de fichas, gramos invertidos: 300 g malo (0,1) + 100 g bueno
    // (1,0). El promedio pesa el peso real de cada ingrediente, así que acá SÍ
    // cae mucho más que en el caso anterior — la ponderación no es indulgente
    // per se, es fiel a cuánto del plato está mal identificado.
    const index6_1 = indiceDeFixture([fichaBuena("a"), fichaMala("b", 0.1)]);
    const gramosMalo = 300;
    const gramosBueno = 100;
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: gramosMalo + gramosBueno,
        confidence: 1,
        components: [
          { ...terminoMalo("b"), grams: gramosMalo },
          { ...terminoBueno("a"), grams: gramosBueno },
        ],
      },
      index6_1,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    const ponderado = (0.1 * gramosMalo + 1 * gramosBueno) / (gramosMalo + gramosBueno); // 0,325
    const esperada = redondear(ponderado * FACTOR_COMPOSICION); // 0,26
    assert.equal(r.confianza_match, esperada);
    // El límite declarado en la decisión 4: acá el ingrediente que probablemente
    // le da el NOMBRE al plato (el de más gramos) está mal identificado, y el
    // promedio lo refleja — a diferencia del caso anterior, cuya confianza fue
    // 0,782 con el mismo par de fichas.
    assert.ok(r.confianza_match < 0.3);
  });

  it("`eslabon_mas_debil` apunta al componente de menor confianza, y su número es EXACTAMENTE el de `componentes`", () => {
    const index6_1 = indiceDeFixture([fichaBuena("a"), fichaMala("b", 0.157)]);
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 1,
        components: [
          { ...terminoBueno("a"), grams: 200 },
          { ...terminoMalo("b"), grams: 100 },
        ],
      },
      index6_1,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    const peor = r.composicion.componentes.find((c) => c.food_id === "b");
    assert.ok(peor);
    assert.equal(r.composicion.eslabon_mas_debil.termino_en, peor.termino_en);
    assert.equal(r.composicion.eslabon_mas_debil.name_es, peor.name_es);
    assert.equal(r.composicion.eslabon_mas_debil.confidence_match, peor.confidence_match);
    assert.equal(r.composicion.eslabon_mas_debil.confidence_match, 0.157);
  });

  it("el caveat del eslabón más débil nombra el término, la ficha en español y el % — pegado al de la composición", () => {
    const index6_1 = indiceDeFixture([fichaBuena("a"), fichaMala("b", 0.157)]);
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 1,
        components: [
          { ...terminoBueno("a"), grams: 200 },
          { ...terminoMalo("b"), grams: 100 },
        ],
      },
      index6_1,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.match(r.caveats[0] ?? "", /compuesto en el momento/);
    const caveatEslabon = r.caveats[1] ?? "";
    assert.match(caveatEslabon, /El ingrediente peor identificado es/);
    assert.match(caveatEslabon, /zzz sin match en inglés — b/); // el término, tal como lo escribió "la visión"
    assert.match(caveatEslabon, /Malo fixture 6\.1 b en español/); // la ficha en español (name_es)
    assert.match(caveatEslabon, /16 %/); // redondear(0,157 × 100, 0) = 16
  });

  it("en una PARCIAL, los faltantes no entran ni al numerador ni al denominador del promedio", () => {
    // Dos resueltos (150 g a 1,0 y 150 g a 0,1) + un faltante de 100 g: exactamente
    // el 25 % de 400 g, el borde donde la composición parcial SIGUE entrando
    // (`MASA_FALTANTE_MAXIMA`). Si el faltante entrara al denominador con
    // confianza 0 la ponderada daría 0,2475 (→ 0,248 con el factor parcial);
    // como no entra, tiene que dar 0,33.
    const index6_1 = indiceDeFixture([fichaBuena("a"), fichaMala("b", 0.1)]);
    const inexistente = "zzz ingrediente que el catálogo de fixture no tiene 6.1";
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 400,
        confidence: 1,
        components: [
          { ...terminoBueno("a"), grams: 150 },
          { ...terminoMalo("b"), grams: 150 },
          { food_en: inexistente, grams: 100 },
        ],
      },
      index6_1,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.equal(r.parcial, true);
    const ponderadoSoloResueltos = (1 * 150 + 0.1 * 150) / (150 + 150); // 0,55
    const esperadaExcluyendo = redondear(ponderadoSoloResueltos * FACTOR_COMPOSICION_PARCIAL); // 0,33
    const ponderadoConFaltanteEnCero = (1 * 150 + 0.1 * 150 + 0 * 100) / (150 + 150 + 100); // 0,4125
    const esperadaIncluyendo = redondear(ponderadoConFaltanteEnCero * FACTOR_COMPOSICION_PARCIAL); // 0,248
    assert.notEqual(esperadaExcluyendo, esperadaIncluyendo);
    assert.equal(r.confianza_match, esperadaExcluyendo);
  });

  it("la cuenta se puede rehacer desde los `confidence_match` y `grams` que viajan en `componentes`", () => {
    // Quien lea la composición tiene que poder verificar `confianza_match` con
    // los números que tiene delante — es la razón por la que se acumula la
    // confianza YA REDONDEADA de cada componente (ver el comentario de
    // `compose.ts` sobre `confianzaComponente`).
    const index6_1 = indiceDeFixture([fichaBuena("a"), fichaMala("b", 0.157), fichaMala("c", 0.6)]);
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 380,
        confidence: 1,
        components: [
          { ...terminoBueno("a"), grams: 180 },
          { ...terminoMalo("b"), grams: 100 },
          { ...terminoMalo("c"), grams: 100 },
        ],
      },
      index6_1,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    const numerador = r.composicion.componentes.reduce((acc, c) => acc + c.confidence_match * c.grams, 0);
    const denominador = r.composicion.componentes.reduce((acc, c) => acc + c.grams, 0);
    const factor = r.parcial ? FACTOR_COMPOSICION_PARCIAL : FACTOR_COMPOSICION;
    const recompuesta = redondear((numerador / denominador) * factor);
    assert.ok(
      Math.abs(recompuesta - r.confianza_match) < 10 ** -DECIMALES,
      `recompuesta ${recompuesta} vs. publicada ${r.confianza_match}`,
    );
  });
});

/* ===========================================================================
 * CARD 5.3 — LA COMPOSICIÓN PARCIAL, Y LOS REEMPLAZOS DECLARADOS
 *
 * Todo este bloque existe por el escaneo de producción del 02/09/2026: una
 * pizza que resolvió 3 de 4 ingredientes y salió SIN NÚMEROS porque el catálogo
 * no tiene la masa. Los escenarios están construidos con el catálogo real y con
 * los mismos términos que escribió la visión ese día.
 * =========================================================================== */

/** Un ingrediente que el catálogo no puede nombrar de ninguna manera. */
const INEXISTENTE = "Zzzz ingrediente inexistente qqq";

describe("card 5.3 — el sustituto que declaró la curación", () => {
  it("LA MASA DE PIZZA: el ingrediente que rompió el escaneo de producción", () => {
    // `pizza dough, baked` no existe en USDA (cero coincidencias en los tres
    // datasets, medido en el Bloque 0) y la curación declaró el sustituto
    // `Pizza sin queso, masa fina`. Sin él la pizza entera se quedaba sin número.
    const r = componerPlato(
      {
        food_en: "pizza with ham and mushrooms",
        food_es: "pizza de jamón y champiñones",
        grams: 150,
        confidence: 0.85,
        preparation: "horneado_masa",
        components: [
          { food_en: "pizza dough, baked", food_es: "masa de pizza horneada", grams: 80 },
          { food_en: "mozzarella cheese, melted", food_es: "mozzarella fundida", grams: 35 },
          { food_en: "ham, sliced", food_es: "jamón en lonchas", grams: 20 },
          { food_en: "mushrooms, sliced", food_es: "champiñones laminados", grams: 15 },
        ],
      },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.equal(r.parcial, false, "con el sustituto la composición es COMPLETA, no parcial");
    const masa = r.composicion.componentes[0];
    assert.equal(masa?.food_id, "fdc-2708674");
    assert.equal(masa?.match, "sustituto");
    assert.equal(masa?.reemplazo?.por, "sustituto");
    // Y el reemplazo se declara donde se lee, no solo en el campo.
    assert.match(r.caveats.join(" "), /ficha declarada en lugar de la suya/);
  });

  it("el sustituto dispara aunque la visión describa la presentación", () => {
    // La curación escribe EL ALIMENTO ("pizza dough") y la visión escribe cómo
    // lo vio ("pizza dough, baked"). Hornear una masa no la convierte en otro
    // alimento: son los mismos descriptores que el difuso ya descuenta.
    for (const termino of ["pizza dough", "pizza dough, baked", "pizza crust, baked"]) {
      const r = componerPlato(
        { food_en: "x", grams: 100, confidence: 1, components: [{ food_en: termino, grams: 100 }] },
        index,
      );
      assert.ok(r.ok, `${termino}: ${r.ok ? "" : r.motivo}`);
      assert.equal(r.composicion.componentes[0]?.food_id, "fdc-2708674", termino);
    }
  });
});

describe("card 5.3 — un ingrediente que falta cae en la cabeza de su subfamilia", () => {
  it("con `familia_subfamilia` declarado, el ingrediente desconocido deja de faltar", () => {
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 0.9,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: INEXISTENTE, grams: 100, familia_subfamilia: "queso/curado" },
        ],
      },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.equal(r.parcial, false);
    const reemplazado = r.composicion.componentes[1];
    assert.equal(reemplazado?.match, "cabeza_subfamilia");
    assert.equal(reemplazado?.reemplazo?.por, "cabeza_subfamilia");
  });

  it("una subfamilia SIN cabeza baja a la de la familia", () => {
    // `ensalada/verdura` es uno de los 13 huecos declarados del Bloque 0.
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 0.9,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: INEXISTENTE, grams: 100, familia_subfamilia: "ensalada/verdura" },
        ],
      },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.equal(r.composicion.componentes[1]?.match, "cabeza_familia");
  });
});

describe("card 5.3 — la composición PARCIAL: cuánto puede faltar", () => {
  const conFaltante = (gramosDelFaltante: number) =>
    componerPlato(
      {
        food_en: "plato raro",
        grams: 200 + gramosDelFaltante,
        confidence: 0.9,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: INEXISTENTE, grams: gramosDelFaltante },
        ],
      },
      index,
    );

  it("si lo que falta es un 20 % de la masa, SE COMPONE y se declara", () => {
    const r = conFaltante(50); // 50 de 250 = 20 %
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.equal(r.parcial, true);
    assert.equal(r.composicion.parcial, true);
    assert.equal(r.composicion.gramos_faltantes, 50);
    assert.deepEqual(r.composicion.faltantes, [{ termino_en: INEXISTENTE, grams: 50 }]);
    // El faltante sigue yendo a la curación: componer no es dar el tema por
    // cerrado, es no dejar al usuario sin número mientras tanto.
    assert.deepEqual(r.sin_match, [{ termino_en: INEXISTENTE, grams: 50 }]);
    assert.match(r.caveats[0] ?? "", /Faltó 50 g/);
    // Y la masa que se declara incluye lo que falta: 200 + 50, mezclado (×1).
    assert.equal(r.masa_de_los_ingredientes_g, 250);
  });

  it("si falta MÁS de un cuarto, no se compone: el número sería de otro plato", () => {
    const r = conFaltante(100); // 100 de 300 = 33 %
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.motivo, /33\.3 % de lo que se vio/);
    assert.ok(!r.ok && r.sin_match.length === 1);
  });

  it("el borde: justo un 25 % entra, un pelo más no", () => {
    assert.equal(conFaltante(200 / 3).ok, true); // 66,67 de 266,67 = 25,0 %
    assert.equal(conFaltante(70).ok, false); // 70 de 270 = 25,9 %
  });

  it("una parcial confía MENOS que una completa, y el descuento es el declarado", () => {
    const parcial = conFaltante(50);
    const completa = componerPlato(
      { food_en: "x", grams: 200, confidence: 1, components: [{ food_en: "Rice noodles, cooked", grams: 200 }] },
      index,
    );
    assert.ok(parcial.ok && completa.ok);
    assert.equal(completa.confianza_match, redondear(1 * FACTOR_COMPOSICION));
    assert.equal(parcial.confianza_match, redondear(1 * FACTOR_COMPOSICION_PARCIAL));
    assert.ok(parcial.confianza_match < completa.confianza_match);
  });

  it("si TODOS los ingredientes faltan no hay parcial que valga", () => {
    const r = componerPlato(
      { food_en: "x", grams: 100, confidence: 1, components: [{ food_en: INEXISTENTE, grams: 100 }] },
      index,
    );
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.motivo, /ninguno de sus ingredientes/);
  });

  it("un faltante SIN gramos usables tampoco: una fracción de una masa desconocida no existe", () => {
    // Es la misma regla que `interpretarGramos` aplica al plato entero. Un cero
    // no dice "no pesa": dice "no se pudo pesar", y sin eso no se puede saber
    // qué fracción del plato falta.
    const r = componerPlato(
      {
        food_en: "x",
        grams: 300,
        confidence: 1,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: INEXISTENTE, grams: 0 },
        ],
      },
      index,
    );
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.motivo, /no se sabe cuánto hay/);
  });
});

describe("card 5.3 — el método por defecto sale de la subfamilia", () => {
  it("sin `preparation`, manda el `metodo_por_defecto` de la subfamilia declarada", () => {
    // Lo que la visión no distingue en una foto lo pone la taxonomía. `pizza/*`
    // declara `horneado_masa` (0,891), contra el 1,000 de `mezclado`.
    const componentes = [{ food_en: "Rice noodles, cooked", grams: 200 }];
    const entrada = index.taxonomia.porId.get("pizza/con-carne");
    assert.ok(entrada);
    const conFamilia = componerPlato({ food_en: "x", grams: 200, confidence: 1, components: componentes }, index, entrada);
    const sinFamilia = componerPlato({ food_en: "x", grams: 200, confidence: 1, components: componentes }, index);
    assert.ok(conFamilia.ok && sinFamilia.ok);
    assert.equal(conFamilia.composicion.metodo, "horneado_masa");
    assert.equal(sinFamilia.composicion.metodo, "mezclado");
  });

  it("pero si la visión declaró el método, gana la visión: ella miró la foto", () => {
    const entrada = index.taxonomia.porId.get("pizza/con-carne");
    assert.ok(entrada);
    const r = componerPlato(
      { food_en: "x", grams: 200, confidence: 1, preparation: "frito", components: [{ food_en: "Rice noodles, cooked", grams: 200 }] },
      index,
      entrada,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.equal(r.composicion.metodo, "frito");
  });
});

describe("card 5.3 — una composición imposible NO se publica", () => {
  it("un per_100g que no puede existir se declara imposible con el motivo escrito", () => {
    // El escenario se CONSTRUYE: dos fichas inventadas cuyos macros suman 120 g
    // por 100 g. El catálogo real no tiene ninguna así —está medido, pasan las
    // 1.115— y el candado tiene que existir igual, para el día que la aritmética
    // se rompa.
    const imposible = indiceDeFixture([
      fichaFalsa({
        id: "fake-imposible",
        names: { en: "Imposible", es: "Imposible" },
        per_100g: { kcal: 630, protein_g: 40, carbs_g: 50, fat_g: 30, fiber_g: 0, sat_fat_g: 0, sugars_g: 0, sodium_mg: 0 },
      }),
      fichaFalsa({ id: "fake-normal", names: { en: "Normal", es: "Normal" } }),
    ]);
    const r = componerPlato(
      { food_en: "x", grams: 100, confidence: 1, components: [{ food_en: "Imposible", grams: 100 }] },
      imposible,
    );
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.motivo, /no pueden existir y no se publica/);
    assert.match(r.ok ? "" : r.motivo, /pesar más que él mismo/);
  });

  it("y una composición normal del catálogo real sigue pasando el halo", () => {
    const r = componerPlato(
      {
        food_en: "x",
        grams: 300,
        confidence: 1,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: "Olive oil", grams: 20 },
        ],
      },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
  });
});
