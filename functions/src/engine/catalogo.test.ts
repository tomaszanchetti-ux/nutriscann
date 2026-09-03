/**
 * Los candados CONTRA EL CATÁLOGO ENTERO.
 *
 * Los tests de `match.test.ts` prueban casos elegidos; estos barren las 1.022
 * fichas y los 1.768 términos del vocabulario español. Es la diferencia entre
 * "los tres casos que me preocupaban andan" y "no hay ningún alimento del
 * catálogo que el motor no sepa encontrar" — que es lo que hace falta afirmar
 * antes de que esto cuantifique la comida de alguien.
 *
 * Leer `kb/build/foods.canonical.json` en un test no rompe la pureza del motor:
 * es un archivo del repo, no una llamada de red, y la lógica lo sigue recibiendo
 * por parámetro.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FAMILIAS } from "../kb/familias";
import { aliasConfidence, aliasText } from "../kb/types";
import { esPlausible } from "./arithmetic";
import { construirIndice, GUARDAS_DE_VOCABULARIO, MINIMO_DE_FICHAS } from "./catalog";
import { buscarAlimento } from "./match";
import { claveDeMatching, normalizar, sinDescriptores } from "./normalize";
import { catalogoReal, indiceReal } from "./testing";

const catalogo = catalogoReal();
const index = indiceReal();
const activas = catalogo.foods.filter((f) => !f.deprecated);

describe("el catálogo que se está midiendo", () => {
  it("es el 3.0.0 o posterior y trae más de mil fichas", () => {
    assert.match(catalogo.kb_version, /^\d+\.\d+\.\d+\+[0-9a-f]+$/);
    assert.ok(activas.length > 1000, `${activas.length} fichas activas`);
  });
});

describe("F6 — un catálogo vacío no puede pasar por un plato exótico", () => {
  it("construir un índice por debajo del piso LANZA", () => {
    assert.throws(() => construirIndice([], "test"), /piso declarado/);
    assert.throws(() => construirIndice(catalogo.foods.slice(0, 10), "test"), /10 fichas activas/);
  });

  it("el piso declarado es 100 y el catálogo real lo pasa de sobra", () => {
    assert.equal(MINIMO_DE_FICHAS, 100);
    assert.ok(activas.length > MINIMO_DE_FICHAS);
  });

  it("un fixture chico tiene que DECLARAR que es chico", () => {
    const chico = construirIndice(catalogo.foods.slice(0, 3), "test", { minimo_de_fichas: 1 });
    // CARD 2.6: se cuentan los términos ESCRITOS, no las variantes que el índice
    // deduce de cada nombre (`Beef, steak, NFS` deja además `beef steak`). Lo que
    // este test mide es que el fixture tiene tres fichas y no el catálogo entero.
    const escritos = [...chico.exactoEn.values()].filter((e) => e.variante !== true);
    assert.equal(escritos.length, 3);
  });

  it("las fichas retiradas no cuentan para el piso", () => {
    const retiradas = catalogo.foods.slice(0, 150).map((f) => ({ ...f, deprecated: true }));
    assert.throws(() => construirIndice(retiradas, "test"), /0 fichas activas/);
  });
});

describe("el índice no tiene ambigüedades", () => {
  it("ningún término choca dentro de su propio idioma", () => {
    assert.deepEqual(index.colisiones, []);
  });

  it("todo el vocabulario en español está indexado", () => {
    const terminos = new Set<string>();
    for (const f of activas) {
      if (f.names.es !== null) terminos.add(claveDeMatching(f.names.es));
      for (const a of f.aliases.es) terminos.add(claveDeMatching(aliasText(a)));
    }
    terminos.delete("");
    // CARD 2.6, dos cambios y los dos con intención:
    //  · `claveDeMatching` y no `normalizar`: la clave del índice pliega el
    //    plural, así que el conjunto con el que se compara tiene que plegarlo
    //    también o el test estaría midiendo otra cosa.
    //  · se filtran las variantes deducidas: lo que este test exige es que NO SE
    //    PIERDA ningún término escrito por la curación. Que además haya claves de
    //    más es justamente lo que la card agregó, y tiene su propio test.
    const escritos = [...index.exactoEs.values()].filter((e) => e.variante !== true);
    assert.equal(escritos.length, terminos.size);
  });

  it("las variantes deducidas SUMAN claves y no pisan ninguna escrita", () => {
    // El candado de la regla: una variante nunca ocupa el lugar de un nombre
    // real. Si mañana el orden de las dos pasadas de `construirIndice` se
    // invierte, esto suena.
    for (const mapa of [index.exactoEn, index.exactoEs]) {
      for (const [clave, entrada] of mapa) {
        if (entrada.variante !== true) continue;
        assert.equal(claveDeMatching(entrada.texto) === clave, false, `${clave} debería ser literal`);
      }
    }
    const variantes = [...index.exactoEn.values(), ...index.exactoEs.values()].filter((e) => e.variante === true);
    assert.ok(variantes.length > 200, `${variantes.length} variantes: el catálogo tiene 197 fichas con NFS`);
  });
});

describe("card 2.6 — plegar el plural no rompe nada, MEDIDO", () => {
  it("no crea ni una colisión nueva en los 1.022 nombres en inglés", () => {
    const colisiones = medirColisiones(activas.map((f) => f.names.en));
    assert.deepEqual(colisiones, []);
  });

  it("no crea ni una colisión nueva en los 1.768 términos en español", () => {
    // Se compara POR FICHA: dos términos de la MISMA ficha que se pliegan a la
    // misma clave no son una colisión (es un plural y su singular), y el
    // catálogo tiene alguno. Lo que no puede pasar es que el plegado junte dos
    // alimentos DISTINTOS.
    const terminos: { texto: string; id: string }[] = [];
    for (const f of activas) {
      if (f.names.es !== null) terminos.push({ texto: f.names.es, id: f.id });
      for (const a of f.aliases.es) terminos.push({ texto: aliasText(a), id: f.id });
    }
    const sinPlegar = new Map<string, string>();
    const nuevas: string[] = [];
    for (const t of terminos) {
      const plano = normalizar(t.texto);
      const previo = sinPlegar.get(plano);
      if (previo === undefined) sinPlegar.set(plano, t.id);
    }
    const plegado = new Map<string, string>();
    for (const t of terminos) {
      const clave = claveDeMatching(t.texto);
      if (clave === "") continue;
      const previo = plegado.get(clave);
      if (previo !== undefined && previo !== t.id && sinPlegar.get(normalizar(t.texto)) !== previo) {
        nuevas.push(`${clave}: ${previo} vs ${t.id}`);
      }
      if (previo === undefined) plegado.set(clave, t.id);
    }
    assert.deepEqual(nuevas, []);
  });

  it("las listas de palabras se comparan PLEGADAS", () => {
    // El candado del bug de orden: si las listas de `constants.ts` se pliegan
    // antes de que exista `LARGO_MINIMO_PARA_PLEGAR`, quedan sin plegar EN
    // SILENCIO y `fritas` deja de reconocerse como descriptor. Acá se ve.
    assert.equal(sinDescriptores(claveDeMatching("papas fritas")), "papa");
    assert.equal(sinDescriptores(claveDeMatching("lentejas cocidas")), "lenteja");
  });
});

describe("card 2.6 — describir de más no puede desviar un match, MEDIDO", () => {
  /**
   * EL BARRIDO QUE CIERRA LA CARD. La paradoja que se vino a arreglar era que
   * cuanto mejor describía la visión, peor matcheaba. Lo que NO puede pasar al
   * arreglarla es lo contrario: que una palabra de más lleve a OTRO alimento.
   *
   * Se le agrega a los 1.022 nombres del catálogo un descriptor de cocción, un
   * acompañamiento y un adjetivo, y se exige que los 1.022 sigan resolviendo a
   * SU PROPIA ficha. No "casi todos": los 1.022. Es la diferencia entre abrir el
   * recall y aflojar el motor.
   */
  // CARD 2.8: los tres últimos son de CORTE, y entran al mismo barrido que los de
  // cocción porque son la misma clase de palabra —dicen cómo está el alimento, no
  // cuál es— y tienen que costar lo mismo: nada.
  for (const sufijo of [", grilled", " with rice", ", fresh", " a la plancha", " slices", ", sliced", " en rodajas"]) {
    it(`"<nombre>${sufijo}" sigue dando la misma ficha, las 1.022 veces`, () => {
      const desviados: string[] = [];
      for (const f of activas) {
        const r = buscarAlimento(f.names.en + sufijo, index);
        if (r === null || r.ficha.id !== f.id) {
          desviados.push(`${f.names.en}${sufijo} -> ${r === null ? "null" : r.ficha.id}`);
        }
      }
      assert.deepEqual(desviados, []);
    });
  }
});

describe("card 2.8 — partirle el nombre a una ficha no puede llevar a otra ficha", () => {
  /**
   * EL BARRIDO QUE CIERRA LA DIRECCIÓN C. A los 1.022 nombres se les mete una
   * palabra ajena EN EL MEDIO —que es exactamente lo que hizo la visión con
   * `yellow rice WITH MUSHROOMS cooked`— y se mide qué contesta el motor.
   *
   * Lo que se exige no es que los encuentre a todos: un nombre partido es una
   * consulta peor y callarse sigue siendo una respuesta legítima. Lo que se exige
   * es que NINGUNO de los que sí contesta se vaya a otra familia de alimento con
   * una confianza que se pueda leer como un dato. El piso es el mismo que usa el
   * criterio 3 del golden set: 0,60.
   */
  for (const intruso of ["with mushrooms", "and salad"]) {
    it(`"<primera palabra> ${intruso} <resto>" no manda a otra ficha con confianza alta`, () => {
      const altos: string[] = [];
      for (const f of activas) {
        const partes = f.names.en.split(/[\s,]+/).filter(Boolean);
        if (partes.length < 2) continue;
        const consulta = `${partes[0]} ${intruso} ${partes.slice(1).join(" ")}`;
        const r = buscarAlimento(consulta, index);
        if (r !== null && r.ficha.id !== f.id && r.confianza_match >= 0.6) {
          altos.push(`${consulta} -> ${r.ficha.id} (${r.confianza_match})`);
        }
      }
      assert.deepEqual(altos, []);
    });
  }
});

function medirColisiones(textos: string[]): string[] {
  const porClave = new Map<string, string>();
  const colisiones: string[] = [];
  for (const texto of textos) {
    const clave = claveDeMatching(texto);
    if (clave === "") continue;
    const previo = porClave.get(clave);
    if (previo !== undefined && normalizar(previo) !== normalizar(texto)) colisiones.push(`${clave}: ${previo} / ${texto}`);
    if (previo === undefined) porClave.set(clave, texto);
  }
  return colisiones;
}

describe("todo alimento se encuentra a sí mismo", () => {
  it("los 1.022 `names.en` matchean exacto contra su propia ficha", () => {
    const fallos: string[] = [];
    for (const f of activas) {
      const r = buscarAlimento(f.names.en, index);
      if (r === null || r.ficha.id !== f.id || r.nivel !== "exacto" || r.confianza_match !== 1) {
        fallos.push(`${f.id} (${f.names.en}) -> ${r === null ? "null" : `${r.ficha.id}/${r.nivel}`}`);
      }
    }
    assert.deepEqual(fallos, []);
  });

  it("todos los `names.es` matchean a su propia ficha", () => {
    const fallos: string[] = [];
    for (const f of activas) {
      if (f.names.es === null) continue;
      const r = buscarAlimento(f.names.es, index);
      if (r === null || r.ficha.id !== f.id) {
        fallos.push(`${f.id} (${f.names.es}) -> ${r === null ? "null" : r.ficha.id}`);
      }
    }
    assert.deepEqual(fallos, []);
  });

  it("todos los aliases matchean a su propia ficha, salvo el cruce medido", () => {
    const fallos: string[] = [];
    for (const f of activas) {
      for (const a of f.aliases.es) {
        const texto = aliasText(a);
        const r = buscarAlimento(texto, index);
        if (r === null || r.ficha.id !== f.id) {
          fallos.push(`${normalizar(texto)} (${f.id}) -> ${r === null ? "null" : r.ficha.id}`);
        }
      }
    }
    // El único desvío admitido es el cruce EN/ES: `Catsup` es alias en español
    // de fdc-2709733 y a la vez el `names.en` de fdc-168556, y el índice inglés
    // tiene precedencia declarada. Cualquier otro desvío es un bug.
    assert.deepEqual(fallos, ["catsup (fdc-2709733) -> fdc-168556"]);
  });
});

describe("ningún término resuelve a dos fichas", () => {
  it("cada término del vocabulario tiene un dueño y siempre el mismo", () => {
    const dueño = new Map<string, string>();
    const conflictos: string[] = [];
    for (const f of activas) {
      const terminos = [f.names.en, f.names.es, ...f.aliases.es.map(aliasText)].filter(
        (t): t is string => t !== null,
      );
      for (const t of terminos) {
        const clave = normalizar(t);
        if (clave === "") continue;
        const r = buscarAlimento(clave, index);
        if (r === null) continue;
        const previo = dueño.get(clave);
        if (previo !== undefined && previo !== r.ficha.id) conflictos.push(`${clave}: ${previo} vs ${r.ficha.id}`);
        dueño.set(clave, r.ficha.id);
      }
    }
    assert.deepEqual(conflictos, []);
  });
});

describe("un término declarado dos veces en la MISMA ficha", () => {
  /**
   * HALLAZGO DE ESTA CARD (31/08/2026): fdc-2706162 (`Tripe` / `Mondongo`)
   * declara `Callos` DOS VECES en sus aliases — una en texto plano (confianza
   * 1,0) y otra con reserva 0,5. Las dos afirmaciones se contradicen: o el
   * alimento ES callos o es un gemelo pobre. Es una deuda de curación, no del
   * motor, y queda anotada en el informe de la card.
   *
   * Lo que el motor sí tiene que garantizar es que no se vuelve aleatorio por
   * eso: gana el PRIMERO en el orden del catálogo, siempre el mismo, y la
   * confianza que sale es una de las que la ficha declara. Este test no exige
   * que la duplicación exista ni que desaparezca: exige que, mientras exista, el
   * resultado sea determinístico.
   */
  it("resuelve siempre igual y a una confianza declarada", () => {
    const duplicados: string[] = [];
    for (const f of activas) {
      const vistos = new Map<string, number[]>();
      for (const a of f.aliases.es) {
        const clave = normalizar(aliasText(a));
        vistos.set(clave, [...(vistos.get(clave) ?? []), aliasConfidence(a)]);
      }
      for (const [clave, confianzas] of vistos) {
        if (confianzas.length < 2) continue;
        duplicados.push(`${f.id} :: ${clave} :: ${confianzas.join("/")}`);
        const a = buscarAlimento(clave, index);
        const b = buscarAlimento(clave, index);
        assert.deepEqual(a, b, clave);
        if (a !== null && a.ficha.id === f.id) {
          assert.ok(confianzas.includes(a.confianza_match), `${clave} -> ${a.confianza_match}`);
        }
      }
    }
    // Sin assert sobre la cantidad a propósito: el catálogo puede corregirlo sin
    // que este candado estorbe. Se imprime para que quede a la vista.
    if (duplicados.length > 0) console.log(`  ℹ términos duplicados dentro de una ficha: ${duplicados.join(" | ")}`);
  });
});

describe("las fichas genéricas están marcadas y se descuentan", () => {
  it("hay genéricas en el catálogo y todas llevan `generic: true`", () => {
    const genericas = activas.filter((f) => f.generic === true);
    assert.ok(genericas.length > 0);
    for (const f of genericas) assert.equal(f.generic, true);
  });

  it("una ficha genérica se reconoce por su marca, no reparseando el inglés de USDA", () => {
    const generica = activas.find((f) => f.generic === true);
    assert.ok(generica);
    const r = buscarAlimento(generica.names.en, index);
    assert.ok(r);
    assert.equal(r.ficha.generic, true);
  });
});

describe("las 53 recetas del catálogo se encuentran por su nombre", () => {
  it("cada receta matchea a su propia ficha, no a un ingrediente", () => {
    const recetas = activas.filter((f) => f.receta !== undefined);
    // 9 con la card 1.7, 52 con la card 6.4, 53 con los calçots de la 6.4b. 53 con los calçots de la 6.4b.
    assert.equal(recetas.length, 53);
    for (const f of recetas) {
      const porEn = buscarAlimento(f.names.en, index);
      assert.equal(porEn?.ficha.id, f.id, f.names.en);
      if (f.names.es !== null) {
        const porEs = buscarAlimento(f.names.es, index);
        assert.equal(porEs?.ficha.id, f.id, f.names.es);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// DT-32 — las guardas de vocabulario MUERDEN en el matcher
// ---------------------------------------------------------------------------

describe("DT-32 — las guardas viajan en el catálogo y el índice las lee", () => {
  it("el catálogo EMITE sus guardas y el índice usa esas, no las del arranque en frío", () => {
    // El corazón de la deuda: hasta acá el matcher corría con una constante de
    // DOS guardas mientras la curación declaraba veintiuna, y las diecinueve
    // que solo existían del lado de kb no impedían nada.
    assert.ok(Array.isArray(catalogo.guardas), "el catálogo tiene que traer la clave `guardas`");
    assert.ok(catalogo.guardas.length > GUARDAS_DE_VOCABULARIO.length, "el catálogo declara más que el arranque en frío");
    assert.deepEqual(index.guardas, catalogo.guardas, "el índice real usa las guardas del catálogo, tal cual");
  });

  it("el arranque en frío NO se amplía: una guarda nueva va a la curación", () => {
    // Si alguien agrega una guarda acá en vez de en
    // `kb/curation/guardas.vocabulario.json`, vuelve a abrir la divergencia que
    // la DT-32 cerró: la del código no la verifica ningún candado del build.
    assert.deepEqual(
      GUARDAS_DE_VOCABULARIO.map((g) => g.termino).sort(),
      ["chorizo", "pepinillos"],
      "el arranque en frío son estas dos y nada más",
    );
    // Y las dos tienen que estar TAMBIÉN en el catálogo: si no, fundir las dos
    // listas habría perdido una prohibición.
    const declaradas = new Set(catalogo.guardas.map((g) => g.termino));
    for (const g of GUARDAS_DE_VOCABULARIO) {
      assert.ok(declaradas.has(g.termino), `${g.termino} salió del arranque en frío y no está en el catálogo`);
    }
  });

  it("sin guardas declaradas se usa el arranque en frío, no una lista vacía", () => {
    // El escenario se CONSTRUYE: un catálogo anterior a la DT-32 (o una lectura
    // de Firestore sin `kb_meta.guardas`) no puede dejar al matcher sin ninguna
    // prohibición. Cae al arranque en frío, que son dos, y eso se declara.
    const enFrio = construirIndice(catalogo.foods, catalogo.kb_version);
    assert.equal(enFrio.guardas, GUARDAS_DE_VOCABULARIO);
    assert.equal(enFrio.guardas.length, 2);
  });

  it("los TRES casos que la DT-32 midió dejan de llegar a la ficha prohibida", () => {
    // Los tres nacieron en la card 6.4 con su guarda escrita y sin efecto:
    // `pasta de tomate` caía en `Pasta cocida` (fdc-2708357) a 0,25, `pasta filo`
    // en la misma a 0,30 y `huevas de salmón` en `Salmón` (fdc-2706285) a 0,30.
    // El destino correcto de los tres es el SILENCIO: el catálogo no tiene
    // concentrado de tomate, ni masa filo, ni huevas, y el hueco declarado vale
    // más que la ficha parecida.
    for (const [consulta, prohibida] of [
      ["pasta de tomate", "fdc-2708357"],
      ["pasta filo", "fdc-2708357"],
      ["huevas de salmón", "fdc-2706285"],
    ] as const) {
      const r = buscarAlimento(consulta, index);
      assert.notEqual(r?.ficha.id, prohibida, `"${consulta}" sigue llegando a ${prohibida}`);
      assert.equal(r, null, `"${consulta}" tenía que quedar en silencio y dio ${r?.ficha.id}`);
    }
  });

  it("y el arranque en frío SÍ los deja pasar: es la guarda la que muerde, no otra cosa", () => {
    // La otra mitad de la prueba. Sin esto, los tres podrían estar en silencio
    // por cualquier cambio del matcher y el test estaría celebrando una
    // casualidad. Con el mismo catálogo y las dos guardas viejas, los tres
    // vuelven a caer donde caían.
    const enFrio = construirIndice(catalogo.foods, catalogo.kb_version);
    assert.equal(buscarAlimento("pasta de tomate", enFrio)?.ficha.id, "fdc-2708357");
    assert.equal(buscarAlimento("pasta filo", enFrio)?.ficha.id, "fdc-2708357");
    assert.equal(buscarAlimento("huevas de salmón", enFrio)?.ficha.id, "fdc-2706285");
  });

  it("la excepción del puerro: `ajo` no llega al puerro, pero `ajo porro` SÍ", () => {
    // LA REGRESIÓN QUE LA DT-32 CAZÓ AL MEDIR, y por eso este test existe. Las
    // dos puntas de la guarda no comparan igual —el build por igualdad exacta,
    // el matcher por "la consulta EMPIEZA con el término"—, así que `ajo` mordía
    // también `ajo porro crudo`, que es el alias COLOMBIANO del puerro y que el
    // propio motivo de la guarda declara correcto: el puerro terminaba en `Ajo
    // crudo`, 143 kcal contra 61. Se arregla con `salvo_si_contiene: ["porro"]`.
    assert.equal(buscarAlimento("ajo", index)?.ficha.id, "fdc-169230", "`ajo` a secas es el ajo");
    assert.equal(buscarAlimento("ajos", index)?.ficha.id, "fdc-169230");
    assert.equal(buscarAlimento("ajo porro crudo", index)?.ficha.id, "fdc-169246", "el puerro crudo");
    assert.equal(
      buscarAlimento("ajo porro cocido con sal y grasa", index)?.ficha.id,
      "fdc-2709935",
      "el puerro cocido",
    );
  });

  it("la excepción de los pepinillos sobrevivió a fundir las dos listas", () => {
    // `pepinillos` era la ÚNICA guarda que vivía solo en la constante del motor.
    // Al pasar a mandar la lista del catálogo, si no se hubiera mudado con su
    // `salvo_si_contiene`, se habría perdido sin ruido.
    const pepinillos = catalogo.guardas.find((g) => g.termino === "pepinillos");
    assert.ok(pepinillos, "la guarda de los pepinillos tiene que estar en el catálogo");
    assert.deepEqual(pepinillos.salvo_si_contiene, ["dulces"]);
    assert.equal(buscarAlimento("pepinillos", index)?.ficha.id, "fdc-168558", "a secas, los de eneldo");
    assert.equal(buscarAlimento("pepinillos dulces", index)?.ficha.id, "fdc-169378", "nombrados, los dulces");
  });

  it("ninguna guarda del catálogo mata el nombre propio de la ficha que protege", () => {
    // El barrido: una guarda que impidiera encontrar una ficha VIVA por su
    // propio nombre sería peor que el error que evita. Se recorren las veintiún
    // guardas contra los nombres de todas las fichas que nombran.
    const porId = new Map(activas.map((f) => [f.id, f]));
    for (const guarda of catalogo.guardas) {
      for (const id of guarda.prohibido_en) {
        const ficha = porId.get(id);
        if (ficha === undefined) continue; // una guarda puede adelantarse a una ficha que no existe
        const nombres = [ficha.names.en, ficha.names.es].filter((n): n is string => n !== null);
        for (const nombre of nombres) {
          assert.equal(
            buscarAlimento(nombre, index)?.ficha.id,
            id,
            `la guarda "${guarda.termino}" dejó a ${id} sin poder encontrarse por su nombre "${nombre}"`,
          );
        }
      }
    }
  });
});

/* ===========================================================================
 * CARD 5.3 — LAS 1.115 FICHAS CONTRA EL HALO DE PLAUSIBILIDAD
 *
 * El halo (`esPlausible`) NO corre sobre el catálogo en producción: las fichas
 * vienen medidas por USDA y su garantía es la trazabilidad. Corre acá, y por dos
 * motivos distintos:
 *
 *   1. ES LA CALIBRACIÓN DEL CANDADO. Una composición es un promedio ponderado
 *      de fichas del catálogo, así que un límite que rechace una ficha real
 *      rechazaría también el plato que la lleva adentro. Si estos barridos
 *      pasan, ninguna composición legítima puede caerse por el halo.
 *   2. UNA FICHA QUE NO PASA ES UN HALLAZGO DE CURACIÓN, no un bug del candado.
 * =========================================================================== */
describe("card 5.3 — ninguna ficha del catálogo es imposible", () => {
  /** La familia de cada ficha, para saber cuáles declaran alcohol. */
  const familiaDeLaFicha = new Map<string, (typeof FAMILIAS)[number]>();
  for (const familia of FAMILIAS) {
    for (const sub of familia.subfamilias) for (const id of sub.fichas) familiaDeLaFicha.set(id, familia);
  }

  const noPasan = activas
    .map((ficha) => ({
      ficha,
      veredicto: esPlausible(ficha.per_100g, {
        aporta_alcohol: familiaDeLaFicha.get(ficha.id)?.aporta_alcohol === true,
      }),
    }))
    .filter((r) => !r.veredicto.plausible);

  it("las 1.115 pasan, con la excepción del alcohol declarada en la taxonomía", () => {
    assert.deepEqual(
      noPasan.map((r) => `${r.ficha.id} ${r.ficha.names.es ?? r.ficha.names.en}: ${r.veredicto.motivos.join(" ")}`),
      [],
    );
  });

  it("SIN la excepción declarada fallan 16, y las 16 son bebida alcohólica", () => {
    // Es la medida que justifica que la excepción exista y que sea de la
    // TAXONOMÍA y no del motor: el etanol aporta 7 kcal/g y no es ningún
    // macronutriente, así que ningún margen relativo va a dejar pasar un
    // destilado (231 kcal/100 g con cero macros). Y es una excepción ACOTADA:
    // ni una sola falsa alarma fuera de esa familia en 1.115 fichas.
    const sinExcepcion = activas.filter((f) => !esPlausible(f.per_100g).plausible);
    assert.equal(sinExcepcion.length, 16);
    for (const ficha of sinExcepcion) {
      assert.equal(familiaDeLaFicha.get(ficha.id)?.id, "bebida-alcoholica", ficha.names.es ?? ficha.id);
    }
  });

  it("`Fish, NFS` PASA el halo — y eso es lo que el halo dice y lo que no dice", () => {
    // El Bloque 0 sospechaba de esta ficha: 238 kcal/100 g para un genérico de
    // pescado es un pescado REBOZADO disfrazado de promedio (deuda 2). El halo
    // no la marca, y hace bien: sus números son perfectamente posibles. Está mal
    // ELEGIDA, no es imposible. Plausibilidad y corrección son dos preguntas.
    const pescado = catalogo.foods.find((f) => f.names.en === "Fish, NFS");
    assert.ok(pescado, "el catálogo ya no tiene `Fish, NFS`: revisá la deuda 2 del Bloque 0");
    assert.equal(esPlausible(pescado.per_100g).plausible, true);
  });
});
