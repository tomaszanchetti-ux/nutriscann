/**
 * El sello de cómo se llegó a la ficha de cada alimento.
 *
 * Está a la vista y no escondido en un detalle porque es la diferencia entre
 * "el catálogo tiene exactamente esto" y "el catálogo tiene algo parecido". Sin
 * este dato, los dos números se leen igual de firmes y no lo son.
 *
 * DÓNDE VIVEN LOS TEXTOS (cambió en la card 3.1, DT-22). Hasta acá estaban
 * escritos en este archivo, con el argumento de que son etiquetas de un tipo
 * cerrado del contrato (`TipoDeMatch`) y no copy de producto. La mitad del
 * argumento sigue siendo cierta —el JUEGO de sellos lo fija el motor: son cinco
 * y son esos cinco— pero la otra mitad no: las PALABRAS con las que se le
 * explica al usuario qué es una "coincidencia aproximada" son copy, y cambiarlas
 * no puede exigir desplegar la PWA. Así que el tipo sigue mandando la LISTA
 * (este `Record<TipoDeMatch, …>` no compila si el motor suma un sexto sello) y
 * `config/app` manda las PALABRAS.
 *
 * Los colores sí se quedan acá: son semántica visual del sistema, igual que los
 * de los macros.
 */
import type { CopyDeLaApp, ClaveDeCopy } from "../lib/config";
import type { TipoDeMatch } from "../lib/types";

/**
 * Cada sello, con las dos claves de `config/app` que lo dicen y sus clases.
 *
 * El `Record` es el candado: si el motor agrega un tipo de match, este archivo
 * deja de compilar hasta que alguien decida cómo se llama y de qué color es.
 */
const SELLOS: Record<TipoDeMatch, { texto: ClaveDeCopy; explicacion: ClaveDeCopy; clases: string }> =
  {
    exacto: {
      texto: "match_exacto",
      explicacion: "match_exacto_ayuda",
      clases: "bg-accent-soft text-accent",
    },
    alias: {
      texto: "match_alias",
      explicacion: "match_alias_ayuda",
      clases: "bg-accent-soft text-accent",
    },
    difuso: {
      texto: "match_difuso",
      explicacion: "match_difuso_ayuda",
      clases: "bg-carbs/15 text-carbs",
    },
    compuesto: {
      texto: "match_compuesto",
      explicacion: "match_compuesto_ayuda",
      clases: "bg-fat/15 text-fat",
    },
    no_catalogado: {
      texto: "match_no_catalogado",
      explicacion: "match_no_catalogado_ayuda",
      clases: "bg-protein/15 text-protein",
    },
  };

export function BadgeDeMatch({ copy, tipo }: { copy: CopyDeLaApp; tipo: TipoDeMatch }) {
  const sello = SELLOS[tipo];
  return (
    <span
      title={copy[sello.explicacion]}
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[0.6875rem] leading-none font-medium ${sello.clases}`}
    >
      {copy[sello.texto]}
    </span>
  );
}

/** La explicación larga del sello, para quien la necesite fuera del badge. */
export function explicacionDeMatch(copy: CopyDeLaApp, tipo: TipoDeMatch): string {
  return copy[SELLOS[tipo].explicacion];
}
