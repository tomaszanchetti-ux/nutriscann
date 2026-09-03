/**
 * Composición ON-DEMAND: el plato que el catálogo no tiene, armado en el momento
 * con las fichas que sí tiene.
 *
 * Es la razón de ser de la Fase 2. El catálogo tiene 1.022 alimentos y nueve
 * recetas compuestas; el mundo tiene infinitos platos. Cuando la visión no puede
 * nombrar el plato entero pero sí ve lo que hay adentro —arroz, pollo, pimiento—
 * el motor no se rinde: resuelve cada ingrediente contra el catálogo y aplica
 * EXACTAMENTE la misma matemática que usó el build para derivar la Tarta de
 * Santiago (`derivarReceta`, en `kb/src/transforms.ts`, copiada acá con candado).
 * Un test lo verifica de la única forma que vale: recomponiendo las nueve
 * recetas del catálogo con sus mismos insumos y exigiendo el mismo `per_100g`.
 *
 * TRES DECISIONES QUE HAY QUE LEER ANTES DE TOCAR ESTE ARCHIVO:
 *
 * 1. LA REGLA DEL TODO O NADA, Y CÓMO LA CARD 5.3 LA RELAJÓ SIN MENTIR. Hasta la
 *    Fase 5 este archivo decía: si uno de los cinco ingredientes no matchea, no
 *    hay composición — porque componer con los otros cuatro da un `per_100g` de
 *    un plato que no es el de la foto y después se lo multiplica por los gramos
 *    del plato ENTERO. El motivo sigue siendo cierto. Lo que faltaba era
 *    preguntarse CUÁNTO falta: el 02/09/2026, en producción, una pizza resolvió
 *    3 de 4 ingredientes y salió SIN NÚMEROS porque no existe la ficha de la
 *    masa. Ahora:
 *      · primero se intenta REEMPLAZAR lo que falta —un sustituto que declaró la
 *        curación, o la cabeza de su subfamilia— y eso no es componer de menos,
 *        es componer con una ficha declarada en lugar de la exacta;
 *      · y solo si todavía falta algo, se compone con lo que hay SI Y SOLO SI lo
 *        que falta es minoritario en gramos (`MASA_FALTANTE_MAXIMA`, un cuarto
 *        del plato). Sale marcado `parcial`, con qué faltó y cuántos gramos
 *        pesaba, en la composición y en los caveats.
 *    Por encima de ese cuarto no se compone: ahí el número tendría cara de
 *    medido y sería el de otro plato.
 *
 * 2. EL COMPUESTO SIEMPRE ALIMENTA LA CURACIÓN. Que la composición salga bien no
 *    la convierte en una ficha: los gramos de cada ingrediente los estimó una
 *    foto. Un plato que se compone seguido es exactamente el candidato a ficha
 *    medida que el catálogo necesita — el catálogo aprende del uso real. Los
 *    ingredientes que faltaron entran a la cola IGUAL, se haya compuesto o no.
 *
 * 3. NADA SALE DE ACÁ SIN PASAR POR EL HALO DE PLAUSIBILIDAD. Una composición es
 *    una cuenta nuestra, no una medición de USDA: antes de devolverla se le
 *    pregunta a `esPlausible` si esos valores por 100 g pueden existir. Si no
 *    pueden, la composición se declara imposible con el motivo escrito y el
 *    llamador baja al escalón siguiente de la cascada. Ver `arithmetic.ts`.
 */
import { derivarReceta, type Derivation, type ResolvedIngredient } from "../kb/transforms";
import { COOKING_TRANSFORMS } from "../kb/cooking.transforms";
import { esPlausible } from "./arithmetic";
import type { CatalogIndex, EntradaDeTaxonomia } from "./catalog";
import {
  FACTOR_COMPOSICION,
  FACTOR_COMPOSICION_PARCIAL,
  FACTOR_GENERICO,
  MASA_FALTANTE_MAXIMA,
  PREPARACION_POR_DEFECTO,
} from "./constants";
import {
  buscarConDosNombres,
  cabezaDeLaTaxonomia,
  contradiceALaFamilia,
  redondear,
  subfamiliaDeclarada,
  sustitutoDeclarado,
  type MatchResult,
} from "./match";
import type {
  ComponenteDelPlato,
  ComponenteFaltante,
  Composicion,
  VisionComponent,
  VisionItem,
} from "./types";

export interface ComposicionLograda {
  ok: true;
  composicion: Composicion;
  derivacion: Derivation;
  /** La confianza del eslabón más débil, ya con el descuento de composición. */
  confianza_match: number;
  /** Los caveats de las fichas ingredientes + el de la propia composición. */
  caveats: string[];
  /** `true` si alguno de los ingredientes es una ficha genérica. */
  algun_generico: boolean;
  /**
   * SE COMPUSO CON PARTE DE LO QUE SE VIO (card 5.3). Lo que faltó está en
   * `composicion.faltantes` con sus gramos, y va a la cola de curación igual.
   */
  parcial: boolean;
  /** Los ingredientes que no se pudieron resolver. Van a la curación siempre. */
  sin_match: ComponenteFaltante[];
  /**
   * LA MASA DEL PLATO SEGÚN SUS INGREDIENTES, faltantes incluidos y ya
   * transformada. Es contra esto que se compara la masa que estimó la visión
   * (`masaCoherente`): en una composición completa coincide con
   * `derivacion.peso_final_g`; en una parcial es mayor, porque incluye lo que no
   * se pudo resolver.
   */
  masa_de_los_ingredientes_g: number;
}

export interface ComposicionImposible {
  ok: false;
  motivo: string;
  /** Los términos que el catálogo no supo resolver. Van a la curación. */
  sin_match: ComponenteFaltante[];
}

export type ResultadoDeComposicion = ComposicionLograda | ComposicionImposible;

/**
 * Compone un plato a partir de sus ingredientes visibles.
 *
 * `entrada` es la subfamilia que la visión declaró PARA EL PLATO, y aporta una
 * sola cosa: el método de cocción cuando la visión no declaró ninguno. Ver
 * `metodoDeLaComposicion`.
 *
 * Nunca lanza: cualquier problema —ingredientes sin match, gramos en cero, una
 * transformación que necesita aceite y no lo encuentra, un `per_100g` imposible—
 * sale como `ComposicionImposible` con su motivo. El motor tiene que poder
 * responder algo honesto ante cualquier salida del modelo, y una excepción no es
 * una respuesta.
 */
export function componerPlato(
  item: VisionItem,
  index: CatalogIndex,
  entrada: EntradaDeTaxonomia | null = null,
): ResultadoDeComposicion {
  const componentes = Array.isArray(item.components) ? item.components : [];
  if (componentes.length === 0) {
    return { ok: false, motivo: "La visión no declaró ingredientes visibles.", sin_match: [] };
  }

  const metodo = metodoDeLaComposicion(item, entrada);
  // Se lee con `hasOwnProperty` y no con `COOKING_TRANSFORMS[metodo]` a secas:
  // un `preparation` que llegara valiendo "constructor" o "toString" —el schema
  // del modelo tiene que cerrarlo con un enum, pero el motor no puede confiar en
  // eso— devolvería una función del prototipo de Object en vez de `undefined`,
  // y la composición seguiría adelante con una transformación que no existe.
  const transformDeclarada = Object.prototype.hasOwnProperty.call(COOKING_TRANSFORMS, metodo)
    ? COOKING_TRANSFORMS[metodo]
    : undefined;
  // `mezclado` es el método por defecto y su factor 1,000 no es un supuesto
  // nuestro: es la convención MEDIDA de FNDDS para composiciones (290 recetas,
  // rendimiento implícito mediana 1,000).
  const transform = transformDeclarada ?? COOKING_TRANSFORMS[PREPARACION_POR_DEFECTO];
  if (transform === undefined) {
    return { ok: false, motivo: `No existe la transformación "${metodo}" ni la de por defecto.`, sin_match: [] };
  }

  const resueltos: ResolvedIngredient[] = [];
  const detalle: ComponenteDelPlato[] = [];
  const sinMatch: ComponenteFaltante[] = [];
  const caveats: string[] = [];
  let peorConfianza = 1;
  let algunGenerico = false;
  let aportaAlcohol = false;
  // Los gramos de TODO lo que se vio, resuelto o no: es el denominador con el
  // que se decide si lo que falta es minoritario.
  let gramosVistos = 0;
  let gramosFaltantes = 0;
  // UN INGREDIENTE SIN GRAMOS USABLES NO PESA CERO: PESA LO QUE NO SE SABE. Es la
  // misma regla que `interpretarGramos` aplica al plato entero, y acá es la que
  // hace imposible la composición PARCIAL: esa se apoya en poder medir qué
  // fracción de la masa falta, y una fracción de una masa desconocida no existe.
  let algunoSinGramos = false;

  for (const crudo of componentes) {
    const componente = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Partial<VisionComponent>;
    const gramos =
      typeof componente.grams === "number" && Number.isFinite(componente.grams) && componente.grams > 0
        ? componente.grams
        : 0;
    gramosVistos += gramos;
    const nombre = typeof componente.food_en === "string" ? componente.food_en : "";
    // Los ingredientes también vienen con sus dos nombres desde la card 2.6: un
    // "sofrito" o un "pimiento del piquillo" no tienen nombre en inglés de USDA.
    const nombreEs = typeof componente.food_es === "string" ? componente.food_es : "";
    const resuelto = resolverComponente(nombre, nombreEs, componente.familia_subfamilia, index);
    if (resuelto === null || gramos <= 0) {
      sinMatch.push({ termino_en: nombre, grams: redondear(gramos) });
      gramosFaltantes += gramos;
      if (gramos <= 0) algunoSinGramos = true;
      continue;
    }
    const { match } = resuelto;
    const esGenerico = match.ficha.generic === true;
    if (esGenerico) algunGenerico = true;
    if (resuelto.aportaAlcohol) aportaAlcohol = true;
    const confianzaComponente = match.confianza_match * (esGenerico ? FACTOR_GENERICO : 1);
    peorConfianza = Math.min(peorConfianza, confianzaComponente);

    resueltos.push({ ref: match.ficha.id, grams: gramos, per_100g: match.ficha.per_100g });
    detalle.push({
      termino_en: nombre,
      grams: redondear(gramos),
      food_id: match.ficha.id,
      name_es: match.ficha.names.es,
      source_ref: match.ficha.source_ref,
      match: match.nivel,
      confidence_match: redondear(confianzaComponente),
      generic: esGenerico,
      // Un ingrediente que entró por un sustituto o por una cabeza NO es la
      // ficha de lo que se vio: es la que se puso en su lugar, y eso se declara.
      ...(match.nivel === "sustituto" || match.nivel === "cabeza_subfamilia" || match.nivel === "cabeza_familia"
        ? { reemplazo: { por: match.nivel, motivo: match.motivo } }
        : {}),
    });
    for (const caveat of match.ficha.caveats ?? []) {
      if (!caveats.includes(caveat)) caveats.push(caveat);
    }
  }

  // ------------------------------------------------------------------------
  // ¿ALCANZA CON LO QUE SE RESOLVIÓ? (card 5.3)
  //
  // Tres puertas y las tres tienen que abrirse: que quede algo con lo que
  // componer, que lo que quedó pese algo, y que lo que falta sea minoritario.
  // Ver `MASA_FALTANTE_MAXIMA` para de dónde sale el cuarto.
  // ------------------------------------------------------------------------
  const parcial = sinMatch.length > 0;
  if (parcial) {
    const nombres = sinMatch.map((c) => `"${c.termino_en}"`).join(", ");
    const fraccion = gramosVistos > 0 ? gramosFaltantes / gramosVistos : 1;
    if (resueltos.length === 0) {
      return {
        ok: false,
        motivo: `No se pudo componer el plato: el catálogo no tiene ninguno de sus ingredientes (${nombres}).`,
        sin_match: sinMatch,
      };
    }
    if (algunoSinGramos) {
      return {
        ok: false,
        motivo:
          `No se pudo componer el plato: de ${nombres} no se sabe cuánto hay —la visión no estimó sus gramos—, ` +
          `así que tampoco se sabe qué fracción del plato falta. Componer igual sería repartir la masa entera ` +
          `entre los ingredientes que sí están, que es inventar el peso del que falta.`,
        sin_match: sinMatch,
      };
    }
    if (fraccion > MASA_FALTANTE_MAXIMA) {
      return {
        ok: false,
        motivo:
          `No se pudo componer el plato: el catálogo no tiene ${nombres}, y eso es ` +
          `${redondear(fraccion * 100, 1)} % de lo que se vio (el máximo para componer igual es ` +
          `${MASA_FALTANTE_MAXIMA * 100} %). Componer con los ingredientes que sí están daría un valor por ` +
          `100 g de otro plato.`,
        sin_match: sinMatch,
      };
    }
  }

  let aceite = null;
  if (transform.aceite_absorbido_pct > 0) {
    const fichaAceite = transform.aceite_ref === null ? undefined : index.porId.get(transform.aceite_ref);
    if (fichaAceite === undefined) {
      return {
        ok: false,
        motivo: `La transformación "${transform.id}" absorbe aceite y el catálogo no tiene la ficha ${String(transform.aceite_ref)}.`,
        sin_match: sinMatch,
      };
    }
    aceite = fichaAceite.per_100g;
  }

  let derivacion: Derivation;
  try {
    derivacion = derivarReceta({ ingredientes: resueltos, transform, aceite });
  } catch (err) {
    return {
      ok: false,
      motivo: `La composición no cerró: ${err instanceof Error ? err.message : String(err)}`,
      sin_match: sinMatch,
    };
  }

  // ------------------------------------------------------------------------
  // EL HALO DE PLAUSIBILIDAD (card 5.3). Ver `esPlausible` en `arithmetic.ts`.
  //
  // Acá es donde la composición deja de ser una cuenta y pasa a ser un número
  // que alguien va a leer. Si esos valores por 100 g no pueden existir, no se
  // publica: se declara imposible con el motivo escrito y el llamador baja al
  // escalón siguiente de la cascada (la cabeza de la subfamilia, la de la
  // familia, o ningún número). Una composición rota que se publica es peor que
  // un plato sin número, porque no se distingue de una buena.
  //
  // La excepción del alcohol la declara la TAXONOMÍA, no el motor: si alguno de
  // los ingredientes vive en una familia con `aporta_alcohol`, el halo sabe que
  // parte de las calorías no vienen de ningún macronutriente.
  // ------------------------------------------------------------------------
  const veredicto = esPlausible(derivacion.per_100g, { aporta_alcohol: aportaAlcohol });
  if (!veredicto.plausible) {
    return {
      ok: false,
      motivo:
        `La composición dio valores por 100 g que no pueden existir y no se publica: ` +
        `${veredicto.motivos.join(" ")} Los ingredientes son fichas reales, así que el problema está en la ` +
        `cuenta o en los gramos que estimó la foto.`,
      sin_match: sinMatch,
    };
  }

  // La masa del plato ENTERO según sus ingredientes: los resueltos ya
  // transformados, más lo que faltó, con el mismo rendimiento. Es contra esto
  // que se compara la masa que estimó la visión (`masaCoherente`).
  const rendimiento = derivacion.peso_entrada_g > 0 ? derivacion.peso_final_g / derivacion.peso_entrada_g : 1;
  const masaDeLosIngredientes = redondear(derivacion.peso_final_g + gramosFaltantes * rendimiento);

  const composicion: Composicion = {
    metodo: transform.id,
    componentes: detalle,
    peso_entrada_g: derivacion.peso_entrada_g,
    aceite_absorbido_g: derivacion.aceite_absorbido_g,
    aceite_ref: derivacion.aceite_absorbido_g > 0 ? transform.aceite_ref : null,
    peso_final_g: derivacion.peso_final_g,
    rendimiento_de: derivacion.rendimiento_de,
    ...(parcial
      ? {
          parcial: true as const,
          faltantes: sinMatch,
          gramos_faltantes: redondear(gramosFaltantes),
        }
      : {}),
  };

  caveats.unshift(
    `Plato compuesto en el momento con ${detalle.length} ingredientes del catálogo y el método "${transform.id}": ` +
      `los valores por 100 g salen de fichas reales, pero la proporción de cada ingrediente la estimó la foto.`,
  );
  if (parcial) {
    // El caveat de la parcial va PRIMERO, delante del de la composición: es la
    // reserva más fuerte que lleva este ítem y la que hay que leer antes.
    caveats.unshift(
      `Faltó ${redondear(gramosFaltantes)} g de ${sinMatch.length === 1 ? "un ingrediente que el catálogo no tiene" : `${sinMatch.length} ingredientes que el catálogo no tiene`} ` +
        `(${sinMatch.map((c) => `"${c.termino_en}"`).join(", ")}), sobre ${redondear(gramosVistos)} g vistos. ` +
        `El plato se calculó con la densidad de los ingredientes que sí están: es una estimación de lo que falta, ` +
        `no una medición.`,
    );
  }
  const reemplazados = detalle.filter((c) => c.reemplazo !== undefined);
  if (reemplazados.length > 0) {
    caveats.push(
      `${reemplazados.length === 1 ? "Un ingrediente se resolvió" : `${reemplazados.length} ingredientes se resolvieron`} ` +
        `con una ficha declarada en lugar de la suya: ` +
        `${reemplazados.map((c) => `"${c.termino_en}" → ${c.name_es ?? c.food_id}`).join(", ")}.`,
    );
  }

  return {
    ok: true,
    composicion,
    derivacion,
    confianza_match: redondear(peorConfianza * (parcial ? FACTOR_COMPOSICION_PARCIAL : FACTOR_COMPOSICION)),
    caveats,
    algun_generico: algunGenerico,
    parcial,
    sin_match: sinMatch,
    masa_de_los_ingredientes_g: masaDeLosIngredientes,
  };
}

/**
 * EL MÉTODO DE COCCIÓN DE UNA COMPOSICIÓN, en el orden en que se sabe (card 5.3).
 *
 *   1. el que declaró la visión, que es la que miró la foto;
 *   2. el `metodo_por_defecto` de la subfamilia declarada — lo que la visión no
 *      distingue en una imagen lo pone la taxonomía (una legumbre se hierve y
 *      GANA agua: rendimiento 1,113, no 1);
 *   3. `mezclado`, cuyo factor 1,000 no inventa nada.
 *
 * El paso 2 es nuevo y es la mitad del valor de tener una taxonomía: hasta acá
 * una composición sin `preparation` se calculaba siempre como si nada cambiara
 * de peso al cocinarse.
 */
function metodoDeLaComposicion(item: VisionItem, entrada: EntradaDeTaxonomia | null): string {
  if (typeof item.preparation === "string" && item.preparation.length > 0) return item.preparation;
  if (entrada !== null && entrada.subfamilia.metodo_por_defecto.length > 0) {
    return entrada.subfamilia.metodo_por_defecto;
  }
  return PREPARACION_POR_DEFECTO;
}

/**
 * UN INGREDIENTE, RESUELTO CONTRA EL CATÁLOGO, con los mismos escalones que un
 * plato entero (card 5.3).
 *
 *   1. su nombre, en los dos idiomas, contra el catálogo — y si lo que ganó es
 *      un DIFUSO que contradice la familia que declaró la visión, no vale (es la
 *      regla de `contradiceALaFamilia`, la misma que arriba);
 *   2. un sustituto que escribió la curación — la masa de pizza, que USDA no
 *      mide y que dejó sin números la pizza de producción del 02/09;
 *   3. la cabeza de su subfamilia, y si no hay, la de su familia.
 *
 * Devuelve `null` cuando ninguno de los tres llegó: ese ingrediente falta, y el
 * llamador decide si el plato se puede componer igual.
 */
function resolverComponente(
  nombre: string,
  nombreEs: string,
  familia_subfamilia: string | undefined,
  index: CatalogIndex,
): { match: MatchResult; aportaAlcohol: boolean } | null {
  const taxonomia = subfamiliaDeclarada(familia_subfamilia, nombre, nombreEs, index);
  const aportaAlcohol = taxonomia?.entrada.aportaAlcohol === true;

  const porNombre = buscarConDosNombres(nombre, nombreEs, index);
  if (porNombre !== null) {
    const contradice =
      taxonomia !== null && taxonomia.declarada && contradiceALaFamilia(porNombre, taxonomia.entrada, index);
    if (!contradice) {
      // El alcohol lo declara la familia de la FICHA que ganó, no la que dijo la
      // visión: si el ingrediente resolvió a un vino, sus calorías son de vino
      // aunque nadie lo haya declarado.
      const suya = index.taxonomia.deLaFicha.get(porNombre.ficha.id);
      const entradaDeLaFicha = suya === undefined ? undefined : index.taxonomia.porId.get(suya);
      return { match: porNombre, aportaAlcohol: aportaAlcohol || entradaDeLaFicha?.aportaAlcohol === true };
    }
  }

  const sustituto = sustitutoDeclarado(nombre, nombreEs, index);
  if (sustituto !== null) return { match: sustituto, aportaAlcohol };

  if (taxonomia !== null) {
    const cabeza = cabezaDeLaTaxonomia(taxonomia.entrada);
    if (cabeza !== null) return { match: cabeza, aportaAlcohol };
  }
  return null;
}
