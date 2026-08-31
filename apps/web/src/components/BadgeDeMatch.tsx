/**
 * El sello de cómo se llegó a la ficha de cada alimento.
 *
 * Está a la vista y no escondido en un detalle porque es la diferencia entre
 * "el catálogo tiene exactamente esto" y "el catálogo tiene algo parecido". Sin
 * este dato, los dos números se leen igual de firmes y no lo son.
 *
 * Los textos son etiquetas de un tipo cerrado del contrato (`TipoDeMatch`), no
 * copy de producto: cambian solo si cambia el motor. Por eso viven acá y no en
 * `config/app`.
 */
import type { TipoDeMatch } from "../lib/types";

const SELLOS: Record<TipoDeMatch, { texto: string; explicacion: string; clases: string }> = {
  exacto: {
    texto: "Coincidencia exacta",
    explicacion: "El nombre identificado es, letra por letra, el de una ficha del catálogo.",
    clases: "bg-accent-soft text-accent",
  },
  alias: {
    texto: "Por sinónimo",
    explicacion: "Se llegó a la ficha por un sinónimo curado a mano, con su propia confianza.",
    clases: "bg-accent-soft text-accent",
  },
  difuso: {
    texto: "Coincidencia aproximada",
    explicacion:
      "No hubo nombre exacto: se usó la ficha más parecida. Es una estimación, no una medición de ESTE plato.",
    clases: "bg-carbs/15 text-carbs",
  },
  compuesto: {
    texto: "Compuesto en el momento",
    explicacion:
      "El catálogo no tiene este plato: se sumó a partir de sus ingredientes visibles y del método de cocción.",
    clases: "bg-fat/15 text-fat",
  },
  no_catalogado: {
    texto: "No catalogado",
    explicacion:
      "El catálogo no tiene este alimento. No se muestran números: un valor sin ficha no sería trazable a ninguna fuente.",
    clases: "bg-protein/15 text-protein",
  },
};

export function BadgeDeMatch({ tipo }: { tipo: TipoDeMatch }) {
  const sello = SELLOS[tipo];
  return (
    <span
      title={sello.explicacion}
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[0.6875rem] leading-none font-medium ${sello.clases}`}
    >
      {sello.texto}
    </span>
  );
}

/** La explicación larga del sello, para la letra chica. */
export function explicacionDeMatch(tipo: TipoDeMatch): string {
  return SELLOS[tipo].explicacion;
}
