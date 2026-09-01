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
 * DOS DECISIONES QUE HAY QUE LEER ANTES DE TOCAR ESTE ARCHIVO:
 *
 * 1. O ESTÁN TODOS LOS INGREDIENTES, O NO HAY COMPOSICIÓN. Si uno de los cinco
 *    ingredientes no matchea, componer con los otros cuatro da un `per_100g` de
 *    un plato que no es el de la foto, y después se lo multiplica por los gramos
 *    del plato ENTERO. Eso no es un dato incompleto: es un número inventado con
 *    apariencia de medido. El plato queda `no_catalogado` y los ingredientes que
 *    faltan entran a la cola de curación, que es donde se arregla de verdad.
 *
 * 2. EL COMPUESTO SIEMPRE ALIMENTA LA CURACIÓN. Que la composición salga bien no
 *    la convierte en una ficha: los gramos de cada ingrediente los estimó una
 *    foto. Un plato que se compone seguido es exactamente el candidato a ficha
 *    medida que el catálogo necesita — el catálogo aprende del uso real.
 */
import { derivarReceta, type Derivation, type ResolvedIngredient } from "../kb/transforms";
import { COOKING_TRANSFORMS } from "../kb/cooking.transforms";
import type { CatalogIndex } from "./catalog";
import { FACTOR_COMPOSICION, FACTOR_GENERICO, PREPARACION_POR_DEFECTO } from "./constants";
import { buscarConDosNombres, redondear } from "./match";
import type { ComponenteDelPlato, Composicion, VisionComponent, VisionItem } from "./types";

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
}

export interface ComposicionImposible {
  ok: false;
  motivo: string;
  /** Los términos que el catálogo no supo resolver. Van a la curación. */
  sin_match: { termino_en: string; grams: number }[];
}

export type ResultadoDeComposicion = ComposicionLograda | ComposicionImposible;

/**
 * Compone un plato a partir de sus ingredientes visibles.
 *
 * Nunca lanza: cualquier problema —ingredientes sin match, gramos en cero, una
 * transformación que necesita aceite y no lo encuentra— sale como
 * `ComposicionImposible` con su motivo. El motor tiene que poder responder algo
 * honesto ante cualquier salida del modelo, y una excepción no es una respuesta.
 */
export function componerPlato(item: VisionItem, index: CatalogIndex): ResultadoDeComposicion {
  const componentes = Array.isArray(item.components) ? item.components : [];
  if (componentes.length === 0) {
    return { ok: false, motivo: "La visión no declaró ingredientes visibles.", sin_match: [] };
  }

  const metodo = item.preparation ?? PREPARACION_POR_DEFECTO;
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
  const sinMatch: { termino_en: string; grams: number }[] = [];
  const caveats: string[] = [];
  let peorConfianza = 1;
  let algunGenerico = false;

  for (const crudo of componentes) {
    const componente = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Partial<VisionComponent>;
    const gramos =
      typeof componente.grams === "number" && Number.isFinite(componente.grams) && componente.grams > 0
        ? componente.grams
        : 0;
    const nombre = typeof componente.food_en === "string" ? componente.food_en : "";
    // Los ingredientes también vienen con sus dos nombres desde la card 2.6: un
    // "sofrito" o un "pimiento del piquillo" no tienen nombre en inglés de USDA.
    const nombreEs = typeof componente.food_es === "string" ? componente.food_es : "";
    const match = buscarConDosNombres(nombre, nombreEs, index);
    if (match === null || gramos <= 0) {
      sinMatch.push({ termino_en: nombre, grams: gramos });
      continue;
    }
    const esGenerico = match.ficha.generic === true;
    if (esGenerico) algunGenerico = true;
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
    });
    for (const caveat of match.ficha.caveats ?? []) {
      if (!caveats.includes(caveat)) caveats.push(caveat);
    }
  }

  if (sinMatch.length > 0) {
    const nombres = sinMatch.map((c) => `"${c.termino_en}"`).join(", ");
    return {
      ok: false,
      motivo:
        `No se pudo componer el plato: el catálogo no tiene ${nombres}. ` +
        `Componer con los ingredientes que sí están daría un valor por 100 g de otro plato.`,
      sin_match: sinMatch,
    };
  }

  let aceite = null;
  if (transform.aceite_absorbido_pct > 0) {
    const fichaAceite = transform.aceite_ref === null ? undefined : index.porId.get(transform.aceite_ref);
    if (fichaAceite === undefined) {
      return {
        ok: false,
        motivo: `La transformación "${transform.id}" absorbe aceite y el catálogo no tiene la ficha ${String(transform.aceite_ref)}.`,
        sin_match: [],
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
      sin_match: [],
    };
  }

  const composicion: Composicion = {
    metodo: transform.id,
    componentes: detalle,
    peso_entrada_g: derivacion.peso_entrada_g,
    aceite_absorbido_g: derivacion.aceite_absorbido_g,
    aceite_ref: derivacion.aceite_absorbido_g > 0 ? transform.aceite_ref : null,
    peso_final_g: derivacion.peso_final_g,
    rendimiento_de: derivacion.rendimiento_de,
  };

  caveats.unshift(
    `Plato compuesto en el momento con ${detalle.length} ingredientes del catálogo y el método "${transform.id}": ` +
      `los valores por 100 g salen de fichas reales, pero la proporción de cada ingrediente la estimó la foto.`,
  );

  return {
    ok: true,
    composicion,
    derivacion,
    confianza_match: redondear(peorConfianza * FACTOR_COMPOSICION),
    caveats,
    algun_generico: algunGenerico,
  };
}
