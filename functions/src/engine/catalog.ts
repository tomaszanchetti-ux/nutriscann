/**
 * El índice del catálogo: la estructura que el matching consulta.
 *
 * Se construye UNA VEZ por instancia caliente a partir de las fichas ya
 * cargadas (la card 2.2 las trae de Firestore; los tests las traen del archivo
 * `kb/build/foods.canonical.json`). Esta función no lee nada: recibe un array de
 * `CanonicalFood` y devuelve mapas.
 *
 * LA DECISIÓN DE DISEÑO QUE SOSTIENE TODO EL ARCHIVO: hay DOS índices, uno en
 * inglés y otro en español, y NUNCA se mezclan. Medido sobre el catálogo
 * 3.0.0+b2b227e1: `Catsup` es el `names.en` de fdc-168556 (el kétchup común) y
 * al mismo tiempo un alias en español de fdc-2709733 (el kétchup, sin más). En
 * un índice plano ese término tiene dos dueños y el desempate sería el orden de
 * carga; en dos índices con precedencia declarada —inglés primero, porque el
 * campo que manda la visión se llama `food_en`— tiene uno solo y siempre el
 * mismo. Es el único cruce del catálogo, y con un índice plano habría bastado
 * para volver el motor no determinístico.
 */
import { aliasConfidence, aliasText, type CanonicalFood, type Catalog, type VocabularyGuard } from "../kb/types";
import { claveDeMatching, estadoDeCoccion, variantesDeIndice } from "./normalize";

/** Un término del catálogo, ya normalizado, apuntando a su ficha. */
export interface TerminoIndexado {
  /** El texto normalizado con el que se compara. */
  clave: string;
  /** El texto tal cual está en el catálogo, para poder mostrarlo. */
  texto: string;
  food_id: string;
  /** Cuánto vale este término como nombre de la ficha (1,0 / 0,8 / 0,6 / 0,5). */
  confianza: number;
  idioma: "en" | "es";
  /** De qué campo salió. Va al `motivo` del item: nadie tiene que adivinarlo. */
  campo: "names.en" | "names.es" | "alias";
  /**
   * La clave NO es el término tal cual: es una variante que dedujo el índice
   * (`variantesDeIndice`), como `beef steak` para `Beef, steak, NFS`. Solo existe
   * cuando vale `true`, igual que `generic` en el catálogo.
   */
  variante?: true;
  /**
   * El estado de cocción que DECLARA el término (`Lentils, raw` declara crudo;
   * `Lentejas cocidas` declara cocido; `Paella` no declara nada). Lo usa la
   * regla del crudo/cocido en `match.ts`. Solo existe cuando el término dice
   * algo: la mayoría de los nombres no dice nada y no lleva la clave.
   */
  estado?: "crudo" | "cocido";
}

/**
 * Una palabra que NO puede resolver a una ficha determinada.
 *
 * ES EL MISMO TIPO QUE ESCRIBE LA CURACIÓN (`VocabularyGuard` en `kb/types`), y
 * desde la DT-32 eso es el arreglo entero. Antes había DOS estructuras
 * parecidas: `kb/curation/guardas.vocabulario.json` blindaba el CATÁLOGO —impide
 * que la palabra se escriba como nombre o alias de la ficha equivocada, y rompe
 * el build si pasa— y una constante escrita a mano acá blindaba el MATCHER. Las
 * dos listas divergieron hasta dieciocho contra dos, y las que solo existían del
 * lado de la curación NO impedían que el difuso llegara a la ficha prohibida.
 *
 * Ahora la lista es UNA: la declara la curación, el candado 1 del build la
 * verifica contra las fichas, el build la EMITE dentro de `foods.canonical.json`
 * (clave `guardas`) y `construirIndice` la lee de ahí. Es el patrón de la regla 1
 * del proyecto — lo declarativo viaja en los datos y lo que hay en el código es
 * solo arranque en frío.
 *
 * Que la cascada del matcher ya respete varias de estas prohibiciones por su
 * propia estructura no las vuelve redundantes: son el candado que hace que un
 * cambio futuro en el algoritmo rompa un test en vez de romper un plato.
 */
export type GuardaDeVocabulario = VocabularyGuard;

/**
 * EL ARRANQUE EN FRÍO, Y NADA MÁS.
 *
 * Estas dos guardas NO son "las vigentes": las vigentes son las que trae el
 * catálogo (`Catalog.guardas`, 21 en el 3.8.0). Esta constante es el valor que
 * usa `construirIndice` cuando NADIE le pasó guardas —un fixture de dos fichas,
 * un llamador viejo, un catálogo anterior a la DT-32 leído de una base sin
 * migrar—, exactamente como los umbrales del motor son el arranque en frío de lo
 * que vive en `config/app` (regla 1).
 *
 * Son estas dos y no otras dos: `chorizo` es la guarda fundacional y `pepinillos`
 * la única que hasta la DT-32 vivía SOLO acá. Las dos están también en el archivo
 * de curación, así que el catálogo real nunca depende de esta lista.
 *
 * NO SE AMPLÍA. Una guarda nueva se escribe en `kb/curation/guardas.vocabulario.json`,
 * donde el build la verifica; agregarla acá volvería a abrir la divergencia que
 * la DT-32 cerró.
 */
export const GUARDAS_DE_VOCABULARIO: GuardaDeVocabulario[] = [
  {
    // OJO: la guarda mira el NÚCLEO del nombre. `chorizo` y `chorizo criollo`
    // disparan; `bife de chorizo` NO, porque ahí `chorizo` califica a otro
    // sustantivo y el nombre es correcto. Ver `guardaQueViola` en match.ts.
    termino: "chorizo",
    prohibido_en: ["fdc-2705835"],
    motivo:
      "`Bife de chorizo` (Beef, steak, strip) es un CORTE VACUNO; el chorizo es un EMBUTIDO. " +
      "Son dos alimentos distintos con dos perfiles distintos (239 kcal y 361 mg de sodio el corte, " +
      "contra 341 kcal y 983 mg del chorizo fresco de fdc-2706179). `chorizo` es del embutido.",
  },
  {
    termino: "pepinillos",
    prohibido_en: ["fdc-169378"],
    // La excepción es SOLO `dulces`, y la lista es corta porque una excepción
    // que no lleva a la ficha que nombra no es una excepción, es ruido. Medido:
    // con `sweet` y `bread and butter` adentro, la guarda se levantaba pero la
    // consulta terminaba igual en los de eneldo (el alias `Pepinillos` cubre más
    // de "pepinillos sweet" que cualquier nombre de los dulces), así que la
    // excepción prometía algo que no cumplía. `dulces` sí cumple: es el nombre
    // en español de fdc-169378 y resuelve por coincidencia exacta.
    //
    // LÍMITE DECLARADO: una consulta mezclada como "pepinillos sweet" resuelve a
    // los de eneldo. El catálogo nombra a los dulces en español y el motor no
    // traduce; nombrarlos en inglés es "Pickles, cucumber, sweet", que sí anda.
    salvo_si_contiene: ["dulces"],
    motivo:
      "`Pepinillos` a secas son los de eneldo (fdc-168558), que es donde el catálogo tiene el alias. " +
      "Los dulces (fdc-169378) son otra cosa —azúcar en vez de salmuera— y solo se nombran diciéndolo.",
  },
];

export interface ColisionDeIndice {
  clave: string;
  idioma: "en" | "es";
  gana: string;
  pierde: string;
}

export interface CatalogIndex {
  kb_version: string;
  porId: Map<string, CanonicalFood>;
  /** Término normalizado -> entrada, para el match exacto. Inglés. */
  exactoEn: Map<string, TerminoIndexado>;
  /** Término normalizado -> entrada, para el match exacto. Español y aliases. */
  exactoEs: Map<string, TerminoIndexado>;
  /** Los mismos términos como lista, para el recorrido del difuso. */
  difusoEn: TerminoIndexado[];
  difusoEs: TerminoIndexado[];
  guardas: GuardaDeVocabulario[];
  /**
   * Términos que aparecieron dos veces DENTRO del mismo idioma. Hoy está vacío
   * (medido) y hay un test que lo exige vacío contra el catálogo real. No se
   * lanza una excepción a propósito: si mañana la curación mete un duplicado, el
   * motor tiene que seguir respondiendo con una regla declarada (gana el primero
   * por orden de id) y el candado tiene que sonar en CI, no en producción.
   */
  colisiones: ColisionDeIndice[];
}

/**
 * El piso de fichas activas para que un índice sirva para producción.
 *
 * EXISTE POR UN MODO DE FALLA SILENCIOSO. Si la lectura de Firestore devuelve
 * poco o nada —una query mal filtrada, una colección a medio sembrar, un
 * `kb_version` que no matchea— el motor no se rompe: contesta que NINGÚN
 * alimento está catalogado y llena la cola de curación con comida perfectamente
 * normal. Desde afuera, un catálogo vacío es indistinguible de un plato exótico,
 * y el error se descubriría semanas después leyendo la cola de curación.
 *
 * El número es deliberadamente bajo: no está para validar que el catálogo esté
 * completo (eso lo dice `kb_version`), está para que "está vacío" sea imposible
 * de confundir con "no lo conozco". El catálogo real tiene 1.022 fichas.
 */
export const MINIMO_DE_FICHAS = 100;

export interface OpcionesDeIndice {
  /**
   * LAS GUARDAS QUE VAN A REGIR ESTE ÍNDICE (DT-32).
   *
   * Quien construye el índice las trae del CATÁLOGO — `catalogo.guardas`, que el
   * build emite desde `kb/curation/guardas.vocabulario.json`. `indiceDelCatalogo`
   * hace ese paso en un solo lugar y es la puerta que conviene usar.
   *
   * Sin esta clave se usa `GUARDAS_DE_VOCABULARIO`, que es arranque en frío y no
   * la lista vigente: un catálogo anterior a la DT-32 —o una lectura de Firestore
   * hecha antes de que el seed publicara las guardas— deja al matcher con dos
   * prohibiciones en vez de veintiuna, y eso hay que saberlo, no descubrirlo.
   */
  guardas?: GuardaDeVocabulario[];
  /**
   * Baja el piso de `MINIMO_DE_FICHAS`. Es para los tests y los fixtures, que
   * construyen índices de dos fichas a propósito. Un llamador de producción que
   * lo pase está declarando por escrito que sabe lo que hace.
   */
  minimo_de_fichas?: number;
}

/**
 * El índice de un catálogo COMPLETO: fichas, versión y guardas, de una sola pieza.
 *
 * Es la puerta que hay que usar cuando se tiene el `foods.canonical.json` entero
 * en la mano (los tests, el censo de cobertura, el replay del golden set). Existe
 * para que leer las guardas del catálogo sea UNA línea escrita una sola vez y no
 * una que cada llamador tenga que acordarse de escribir: la DT-32 nació
 * justamente de que la lista del matcher se mantenía a mano.
 *
 * `construirIndice` sigue existiendo con su firma de siempre porque hay un
 * llamador que NO tiene un catálogo: la carga desde Firestore arma las fichas
 * documento por documento y las guardas le llegan por otro lado.
 */
export function indiceDelCatalogo(catalogo: Catalog, opciones: OpcionesDeIndice = {}): CatalogIndex {
  return construirIndice(catalogo.foods, catalogo.kb_version, {
    guardas: catalogo.guardas,
    ...opciones,
  });
}

/**
 * Arma el índice. Las fichas `deprecated` NO ENTRAN: un alimento retirado no se
 * borra del catálogo (regla dura 6) pero tampoco puede volver por un match.
 *
 * LANZA si el catálogo viene por debajo del piso declarado. Es la única función
 * del motor que lanza, y lanza a propósito: se llama UNA VEZ al arrancar la
 * instancia, no por request, así que un error acá es un arranque que falla
 * ruidosamente —lo que se quiere— y no un análisis que responde cualquier cosa.
 */
export function construirIndice(
  fichas: CanonicalFood[],
  kb_version: string,
  opciones: OpcionesDeIndice = {},
): CatalogIndex {
  const activas = fichas.filter((f) => !f.deprecated).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const minimo = opciones.minimo_de_fichas ?? MINIMO_DE_FICHAS;
  if (activas.length < minimo) {
    throw new Error(
      `El catálogo llegó con ${activas.length} fichas activas y el piso declarado es ${minimo}. ` +
        `Un índice vacío no falla: contesta que nada está catalogado, que es indistinguible de un plato exótico. ` +
        `Revisá la lectura de las fichas antes de analizar nada.`,
    );
  }

  const index: CatalogIndex = {
    kb_version,
    porId: new Map(fichas.map((f) => [f.id, f])),
    exactoEn: new Map(),
    exactoEs: new Map(),
    difusoEn: [],
    difusoEs: [],
    // Las declaradas si vinieron; el arranque en frío si no. Ver `OpcionesDeIndice`.
    guardas: opciones.guardas ?? GUARDAS_DE_VOCABULARIO,
    colisiones: [],
  };

  const agregar = (entrada: TerminoIndexado): void => {
    if (entrada.clave.length === 0) return;
    const mapa = entrada.idioma === "en" ? index.exactoEn : index.exactoEs;
    const lista = entrada.idioma === "en" ? index.difusoEn : index.difusoEs;
    const previo = mapa.get(entrada.clave);
    if (previo) {
      // LAS COLISIONES QUE SE REPORTAN SON LAS DE LOS TÉRMINOS QUE ESCRIBIÓ LA
      // CURACIÓN, no las de las variantes que deduce el índice. La lista existe
      // para que un duplicado en `kb/` suene en CI; una variante que choca con
      // un nombre real no es un error de nadie —es una regla general aplicada a
      // 1.022 fichas— y lo único que tiene que pasar es que PIERDA, siempre y de
      // la misma manera. Por eso se descarta en silencio.
      if (previo.food_id !== entrada.food_id && entrada.variante !== true && previo.variante !== true) {
        index.colisiones.push({
          clave: entrada.clave,
          idioma: entrada.idioma,
          gana: previo.food_id,
          pierde: entrada.food_id,
        });
      }
      return; // gana el primero: el orden por id hace que sea siempre el mismo
    }
    mapa.set(entrada.clave, entrada);
    lista.push(entrada);
  };

  /** Los términos que ESCRIBIÓ la curación, en el orden de precedencia. */
  const terminosDeLaFicha = (ficha: CanonicalFood): Omit<TerminoIndexado, "clave">[] => {
    const terminos: Omit<TerminoIndexado, "clave">[] = [
      { texto: ficha.names.en, food_id: ficha.id, confianza: 1, idioma: "en", campo: "names.en" },
    ];
    if (ficha.names.es !== null) {
      terminos.push({ texto: ficha.names.es, food_id: ficha.id, confianza: 1, idioma: "es", campo: "names.es" });
    }
    for (const alias of ficha.aliases.es) {
      terminos.push({
        texto: aliasText(alias),
        food_id: ficha.id,
        // La confianza del alias ES la confianza del match: un alias de 0,5 no
        // es el nombre del alimento, es el gemelo nutricional más cercano que
        // USDA sí mide, y el número que sale de ahí vale lo que vale ese 0,5.
        confianza: aliasConfidence(alias),
        idioma: "es",
        campo: "alias",
      });
    }
    return terminos;
  };

  // DOS PASADAS, Y EL ORDEN ES EL PUNTO. Primero entran TODOS los términos tal
  // como los escribió la curación; recién después entran las variantes que el
  // índice deduce (`variantesDeIndice`). Así una variante nunca le puede sacar
  // el lugar a un nombre real: cuando las dos claves coinciden, la que ya está
  // en el mapa es la escrita a mano, y la deducida se descarta.
  // El estado se decide sobre EL TEXTO DEL TÉRMINO, no sobre la ficha:
  // `Limes, raw` declara crudo y `Lime juice` no declara nada, aunque las dos
  // salieran de la misma fruta.
  const conEstado = (termino: Omit<TerminoIndexado, "clave">, clave: string): TerminoIndexado => {
    const estado = estadoDeCoccion(clave);
    return estado === null ? { ...termino, clave } : { ...termino, clave, estado };
  };

  for (const ficha of activas) {
    for (const termino of terminosDeLaFicha(ficha)) {
      agregar(conEstado(termino, claveDeMatching(termino.texto)));
    }
  }
  for (const ficha of activas) {
    for (const termino of terminosDeLaFicha(ficha)) {
      for (const clave of variantesDeIndice(termino.texto)) {
        agregar({ ...conEstado(termino, clave), variante: true });
      }
    }
  }

  // El difuso recorre de más largo a más corto: así el primer candidato válido
  // de cada nivel ya es el más específico y el desempate es estable. A igual
  // largo gana el término escrito por la curación sobre la variante deducida, y
  // recién después el id: el orden tiene que ser total para que el motor sea
  // determinístico.
  const porLargo = (a: TerminoIndexado, b: TerminoIndexado): number =>
    b.clave.length - a.clave.length ||
    Number(a.variante === true) - Number(b.variante === true) ||
    (a.food_id < b.food_id ? -1 : a.food_id > b.food_id ? 1 : 0);
  index.difusoEn.sort(porLargo);
  index.difusoEs.sort(porLargo);

  return index;
}
