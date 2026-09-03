/**
 * LOS CANDADOS DE LA TAXONOMÍA FAMILIA → SUBFAMILIA (card 5.3).
 *
 * Dos bloques, y son dos cosas distintas:
 *
 *   1. QUE LA TAXONOMÍA CIERRE CONTRA EL CATÁLOGO. Es el candado que el Bloque 0
 *      dejó como script suelto (`kb/cobertura/verificar_familias.js`) y que esta
 *      card convierte en test, que era el encargo. El script sigue existiendo
 *      para correrlo a mano sobre un JSON a medio escribir; el test es el que
 *      suena en CI. Verifican lo mismo desde los dos lados: el script mira el
 *      JSON de curación, el test mira la copia que viaja al motor.
 *
 *   2. QUE LA CASCADA CIERRE LOS HUECOS QUE EL BLOQUE 0 MIDIÓ. Se vuelven a
 *      correr los 46 nombres de familia y los 191 de subfamilia contra el motor
 *      REAL, con su `familia_subfamilia` declarado, y se exige que ninguno se
 *      quede sin ficha. Los números de antes están escritos en cada test: son de
 *      `kb/cobertura/familias.bloque0.md`, medidos el 03/09/2026.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FAMILIAS, IDS_FAMILIA_SUBFAMILIA, SUSTITUTOS, idCompuesto } from "../kb/familias";
import { analizarEscaneo } from "./analyze";
import { catalogoReal, indiceReal } from "./testing";

const catalogo = catalogoReal();
const index = indiceReal();
const activas = new Map(catalogo.foods.filter((f) => !f.deprecated).map((f) => [f.id, f]));

describe("card 5.3 — la taxonomía cierra contra el catálogo", () => {
  it("cada ficha viva está en EXACTAMENTE una subfamilia", () => {
    // Ni cero ni dos. Una ficha en dos subfamilias hace que la respuesta dependa
    // del orden de recorrido —no falla, elige mal en silencio—; una en cero es
    // una ficha inalcanzable por familia, que es el agujero que abrió esta fase.
    const veces = new Map<string, number>();
    for (const familia of FAMILIAS) {
      for (const sub of familia.subfamilias) {
        for (const id of sub.fichas) veces.set(id, (veces.get(id) ?? 0) + 1);
      }
    }
    const enCero = [...activas.keys()].filter((id) => (veces.get(id) ?? 0) === 0);
    const enDos = [...veces.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    assert.deepEqual(enCero, [], "fichas que ninguna subfamilia nombra");
    assert.deepEqual(enDos, [], "fichas que están en más de una subfamilia");
  });

  it("toda ficha que nombra la taxonomía existe en el catálogo", () => {
    const fantasmas: string[] = [];
    for (const familia of FAMILIAS) {
      for (const sub of familia.subfamilias) {
        for (const id of sub.fichas) if (!activas.has(id)) fantasmas.push(`${familia.id}/${sub.id} → ${id}`);
      }
    }
    assert.deepEqual(fantasmas, []);
  });

  it("la cabeza de una subfamilia LE PERTENECE, y la de la familia también", () => {
    // Es el caso "pepperoni pizza → embutido" escrito en la taxonomía en vez de
    // en el matcher: una cabeza prestada responde con una ficha de otro grupo.
    for (const familia of FAMILIAS) {
      const suyas = new Set(familia.subfamilias.flatMap((s) => s.fichas));
      if (familia.cabeza !== null) {
        assert.ok(suyas.has(familia.cabeza), `la cabeza de ${familia.id} no es de esa familia`);
      }
      for (const sub of familia.subfamilias) {
        if (sub.cabeza === null) continue;
        assert.ok(sub.fichas.includes(sub.cabeza), `la cabeza de ${familia.id}/${sub.id} no es de esa subfamilia`);
      }
    }
  });

  it("el índice resuelve las 191 subfamilias, y las cabezas que resuelve están vivas", () => {
    assert.equal(index.taxonomia.porId.size, IDS_FAMILIA_SUBFAMILIA.length);
    for (const [id, entrada] of index.taxonomia.porId) {
      assert.equal(entrada.id, id);
      for (const cabeza of [entrada.cabezaDeSubfamilia, entrada.cabezaDeFamilia]) {
        if (cabeza === null) continue;
        assert.equal(cabeza.deprecated, false, `${id}: la cabeza está retirada`);
        assert.ok(activas.has(cabeza.id), `${id}: la cabeza no está en el catálogo`);
      }
    }
  });

  it("LAS 46 FAMILIAS TIENEN CABEZA: ninguna se queda sin respuesta", () => {
    // Es la garantía de la que cuelga toda la cascada — el último escalón con
    // ficha existe siempre. Medido en el Bloque 0 y vuelto a medir acá.
    const sinCabeza = FAMILIAS.filter((f) => f.cabeza === null).map((f) => f.id);
    assert.deepEqual(sinCabeza, []);
    assert.equal(FAMILIAS.length, 46);
  });

  it("las 13 subfamilias sin cabeza son un hueco DECLARADO, y son esas trece", () => {
    // La lista positiva cerrada: si mañana la curación cierra una —el Bloque 0
    // midió que siete de las fichas que faltan ya están medidas por USDA— este
    // test es el que obliga a actualizarla, en vez de dejar el hueco callado.
    const sinCabeza = FAMILIAS.flatMap((f) => f.subfamilias.filter((s) => s.cabeza === null).map((s) => idCompuesto(f, s)));
    assert.deepEqual(sinCabeza.sort(), [
      "bocadillo/bocadillo",
      "bocadillo/desayuno",
      "cafe-e-infusion/te",
      "casqueria/plato",
      "condimento/encurtido-y-otro",
      "ensalada/verde",
      "ensalada/verdura",
      "fruta/seca",
      "guiso/cocido-y-potaje",
      "marisco/plato",
      "pan/plato",
      "pescado/plato",
      "sopa/crema",
    ]);
    // Y cubren poco: 1.055 de las 1.115 fichas viven en una subfamilia CON cabeza.
    const conCabeza = FAMILIAS.flatMap((f) => f.subfamilias.filter((s) => s.cabeza !== null)).reduce(
      (n, s) => n + s.fichas.length,
      0,
    );
    assert.equal(conCabeza, 1055);
  });

  it("los sustitutos declarados apuntan a fichas vivas y no repiten términos", () => {
    const vistos = new Set<string>();
    for (const sustituto of SUSTITUTOS) {
      assert.ok(activas.has(sustituto.ficha), `sustituto → ${sustituto.ficha} no está en el catálogo`);
      assert.ok(sustituto.terminos.length > 0);
      assert.ok(sustituto.motivo.length > 0, "un sustituto sin motivo es una ficha equivocada esperando");
      for (const termino of sustituto.terminos) {
        assert.equal(vistos.has(termino.toLowerCase()), false, `término repetido: ${termino}`);
        vistos.add(termino.toLowerCase());
      }
    }
  });
});

/* ===========================================================================
 * LOS HUECOS DEL MATCHER, VUELTOS A MEDIR (punto b del Bloque 0)
 *
 * La pregunta es la misma que el 03/09: si la visión escribe el nombre de una
 * familia o de una subfamilia, ¿el motor llega a una ficha de ese grupo? Lo que
 * cambió es que ahora la visión además DECLARA `familia/subfamilia`, así que se
 * le pasa al motor entero y no solo al matcher.
 * =========================================================================== */
describe("card 5.3 — los 46 + 191 nombres de la taxonomía, contra el motor entero", () => {
  /** A qué subfamilia pertenece cada ficha, para clasificar dónde cayó. */
  const subDeLaFicha = index.taxonomia.deLaFicha;

  interface Caso {
    tipo: "familia" | "subfamilia";
    nombre_es: string;
    nombre_en: string;
    id: string;
    cabeza: string | null;
  }

  const casos: Caso[] = [];
  for (const familia of FAMILIAS) {
    // Para un NOMBRE DE FAMILIA se declara la subfamilia a la que pertenece su
    // cabeza: es lo que emitiría la visión si supiera la familia y nada más.
    const deLaCabeza = familia.subfamilias.find((s) => familia.cabeza !== null && s.fichas.includes(familia.cabeza));
    const sub = deLaCabeza ?? familia.subfamilias[0];
    assert.ok(sub);
    casos.push({
      tipo: "familia",
      nombre_es: familia.nombre_es,
      nombre_en: familia.nombre_en,
      id: idCompuesto(familia, sub),
      cabeza: familia.cabeza,
    });
    for (const s of familia.subfamilias) {
      casos.push({
        tipo: "subfamilia",
        nombre_es: s.nombre_es,
        nombre_en: s.nombre_en,
        id: idCompuesto(familia, s),
        cabeza: s.cabeza,
      });
    }
  }

  const resultados = casos.map((caso) => {
    const r = analizarEscaneo(
      {
        is_food: true,
        items: [
          {
            food_en: caso.nombre_en,
            food_es: caso.nombre_es,
            grams: 100,
            confidence: 0.9,
            familia_subfamilia: caso.id,
          },
        ],
      },
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    const suya = item.food_id === null ? undefined : subDeLaFicha.get(item.food_id);
    return {
      caso,
      item,
      donde:
        item.food_id === null
          ? "a nada"
          : caso.cabeza !== null && item.food_id === caso.cabeza
            ? "a la cabeza"
            : suya === caso.id
              ? "a su subfamilia"
              : suya !== undefined && suya.split("/")[0] === caso.id.split("/")[0]
                ? "a su familia"
                : "a otra familia",
    };
  });

  it("NINGUNO se queda sin ficha — antes eran 11 familias y 35 subfamilias mudas", () => {
    // Es el número que la card vino a cerrar: «legumbre», «arroz cocido» y
    // «huevo revuelto y tortilla» no llegaban a nada, y no son palabras raras:
    // son las palabras con las que se pide la comida.
    const mudos = resultados.filter((r) => r.donde === "a nada").map((r) => `${r.caso.tipo} ${r.caso.nombre_es}`);
    assert.deepEqual(mudos, []);
  });

  it("las 46 familias llegan a su cabeza (eran 22) y ninguna se va de familia (eran 6)", () => {
    const familias = resultados.filter((r) => r.caso.tipo === "familia");
    assert.equal(familias.length, 46);
    assert.equal(familias.filter((r) => r.donde === "a la cabeza").length, 39);
    assert.equal(familias.filter((r) => r.donde === "a otra familia").length, 0);
    // Los 7 que no llegan a la cabeza llegan igual a su propia familia por otra
    // ficha, y eso NO es un error: es el término exacto ganándole a la cabeza,
    // que es la regla número uno de esta card.
    assert.equal(familias.filter((r) => r.donde === "a la cabeza" || r.donde === "a su subfamilia" || r.donde === "a su familia").length, 46);
  });

  it("las subfamilias: 123 a su cabeza (eran 86) y UNA sola se va de familia (eran 9)", () => {
    const subs = resultados.filter((r) => r.caso.tipo === "subfamilia");
    assert.equal(subs.length, 191);
    assert.equal(subs.filter((r) => r.donde === "a la cabeza").length, 123);
    // 123 + 22 = 145 de 191 caen dentro de su propia subfamilia (eran 108).
    assert.equal(subs.filter((r) => r.donde === "a su subfamilia").length, 22);
  });

  it("LA QUE QUEDA ES «perrito caliente», y queda a propósito: entra por ALIAS", () => {
    // El peor caso del Bloque 0 y el único que sobrevive. «Perrito caliente»
    // llega a `Hot dog` —la salchicha SOLA, sin pan— por un alias con confianza
    // 1,00 que escribió la curación. La regla de la contradicción NO lo toca:
    // solo desarma conjeturas del motor (difusos), nunca términos que escribió
    // una persona. El arreglo es una guarda de vocabulario, que es la deuda 7
    // del Bloque 0, y vive en `kb/curation/guardas.vocabulario.json`.
    const fuera = resultados.filter((r) => r.donde === "a otra familia");
    assert.deepEqual(
      fuera.map((r) => `${r.caso.nombre_es} → ${r.item.name_es} (${r.item.match})`),
      ["Perrito caliente → Hot dog (alias)"],
    );
  });

  it("todos publican número: 237 de 237 salen con calorías", () => {
    // El titular de la card. Antes, 46 de estos nombres salían SIN NÚMEROS.
    const sinNumero = resultados.filter((r) => r.item.nutrients === null).map((r) => r.caso.nombre_es);
    assert.deepEqual(sinNumero, []);
    assert.equal(resultados.length, 237);
  });
});
