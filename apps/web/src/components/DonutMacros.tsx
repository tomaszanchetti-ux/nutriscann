/**
 * El donut de macros: de dónde vienen las calorías del plato.
 *
 * SVG a mano, sin librería de charting: es un solo anillo de cuatro segmentos y
 * cualquier paquete de charts pesaría más que toda la pantalla (`docs/PLAN.md`
 * §4). Los colores son SEMÁNTICOS y viven en `index.css` como design tokens
 * (`--color-protein` coral, `--color-carbs` ámbar, `--color-fat` violeta): el
 * mismo tono significa lo mismo acá, en la lista y en cualquier pantalla futura.
 * Eso sí es del código, no de `config/`.
 *
 * HONESTIDAD DEL ANILLO. El motor NO normaliza los porcentajes para que sumen
 * 100: la diferencia (`sin_explicar`) es información real —alcohol, fibra,
 * redondeos de USDA— y taparla sería inventar un cuadre. Pero un anillo tiene
 * 360 grados sí o sí, así que:
 *
 *   · si los tres suman MENOS de 100, lo que falta se dibuja como un tramo
 *     apagado, "sin explicar", y se nombra en la leyenda;
 *   · si suman MÁS de 100, el reparto se hace sobre esa suma (el anillo cierra)
 *     y la leyenda dice cuánto sobra.
 *
 * En los dos casos los NÚMEROS que se leen son los que mandó el motor, sin
 * tocar. Lo único que se acomoda es el dibujo.
 */
import { gramos, porcentaje } from "../lib/formato";
import type { PorcentajesDeMacros, TotalesNutrientes } from "../lib/types";

const RADIO = 78;
const GROSOR = 22;
const CENTRO = 100;
const VUELTA = 2 * Math.PI * RADIO;
/** Un respiro entre segmentos, en unidades de arco. */
const SEPARACION = 3;

interface Tramo {
  clave: "protein" | "carbs" | "fat" | "sin_explicar";
  etiqueta: string;
  color: string;
  pct: number;
  gramos: number | null;
}

export interface DonutMacrosProps {
  macro_pct: PorcentajesDeMacros;
  nutrients: TotalesNutrientes;
  /** Lo que va en el centro del anillo. */
  centro: React.ReactNode;
}

export function DonutMacros({ macro_pct, nutrients, centro }: DonutMacrosProps) {
  const tramos: Tramo[] = [
    {
      clave: "protein",
      etiqueta: "Proteína",
      color: "var(--color-protein)",
      pct: macro_pct.protein,
      gramos: nutrients.protein_g,
    },
    {
      clave: "carbs",
      etiqueta: "Carbohidratos",
      color: "var(--color-carbs)",
      pct: macro_pct.carbs,
      gramos: nutrients.carbs_g,
    },
    {
      clave: "fat",
      etiqueta: "Grasas",
      color: "var(--color-fat)",
      pct: macro_pct.fat,
      gramos: nutrients.fat_g,
    },
  ];

  const suma = tramos.reduce((total, tramo) => total + Math.max(0, tramo.pct), 0);
  const base = suma > 100 ? suma : 100;
  const sobrante = base - suma;
  const dibujables: Tramo[] =
    sobrante > 0.05
      ? [
          ...tramos,
          {
            clave: "sin_explicar",
            etiqueta: "Sin explicar",
            color: "var(--color-line)",
            pct: sobrante,
            gramos: null,
          },
        ]
      : tramos;

  let acumulado = 0;
  const arcos = dibujables.map((tramo) => {
    const largo = (Math.max(0, tramo.pct) / base) * VUELTA;
    const desplazamiento = acumulado;
    acumulado += largo;
    return { ...tramo, largo, desplazamiento };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="relative mx-auto w-full max-w-[16rem]">
        <svg
          viewBox="0 0 200 200"
          className="w-full"
          role="img"
          aria-label={`Reparto de calorías: proteína ${porcentaje(macro_pct.protein)}, carbohidratos ${porcentaje(
            macro_pct.carbs,
          )}, grasas ${porcentaje(macro_pct.fat)}.`}
        >
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RADIO}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={GROSOR}
          />
          <g transform={`rotate(-90 ${CENTRO} ${CENTRO})`}>
            {arcos.map((arco) =>
              arco.largo <= 0 ? null : (
                <circle
                  key={arco.clave}
                  cx={CENTRO}
                  cy={CENTRO}
                  r={RADIO}
                  fill="none"
                  stroke={arco.color}
                  strokeWidth={GROSOR}
                  strokeLinecap="butt"
                  strokeDasharray={`${Math.max(0, arco.largo - SEPARACION)} ${
                    VUELTA - Math.max(0, arco.largo - SEPARACION)
                  }`}
                  strokeDashoffset={-arco.desplazamiento}
                />
              ),
            )}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centro}
        </div>
      </div>

      <dl className="flex flex-col gap-2">
        {tramos.map((tramo) => (
          <div
            key={tramo.clave}
            className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2"
          >
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: tramo.color }}
            />
            <dt className="text-sm text-ink-soft">{tramo.etiqueta}</dt>
            <dd className="ml-auto flex items-baseline gap-3 font-mono tabular-nums">
              <span className="text-ink">{porcentaje(tramo.pct)}</span>
              <span className="w-16 text-right text-sm text-ink-faint">
                {tramo.gramos === null ? "—" : `${gramos(tramo.gramos)} g`}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {Math.abs(macro_pct.sin_explicar) >= 0.05 && (
        <p className="text-xs leading-relaxed text-ink-faint">
          Los tres porcentajes se calculan cada uno contra las calorías totales y{" "}
          <strong className="font-medium text-ink-soft">no se ajustan para que sumen 100</strong>:
          quedan {porcentaje(macro_pct.sin_explicar, true)} sin explicar. Esa diferencia es real
          (fibra, alcohol, redondeos de la fuente), no un error de la cuenta.
        </p>
      )}
    </div>
  );
}
