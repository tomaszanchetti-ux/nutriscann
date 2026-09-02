/**
 * EL DONUT DE MACROS: de dónde vienen las calorías del plato.
 *
 * SVG a mano, sin librería de charting: cualquier paquete de charts pesaría más
 * que toda la pantalla (`docs/PLAN.md` §4). Los colores son SEMÁNTICOS y viven
 * en `index.css` como design tokens (`--color-protein` coral, `--color-carbs`
 * ámbar, `--color-fat` violeta): el mismo tono significa lo mismo acá, en la
 * lista y en cualquier pantalla futura.
 *
 * ---------------------------------------------------------------------------
 * LA ARITMÉTICA, QUE ES LO ÚNICO QUE NO SE NEGOCIA
 *
 * El anillo dibuja el reparto CALÓRICO. Son los `macro_pct` que manda el motor:
 * gramos × Atwater (4 proteínas / 4 hidratos / 9 grasas) sobre las kcal totales
 * (`porcentajesDeMacros` en `functions/src/engine/arithmetic.ts`). Acá no se
 * recalcula nada: se dibuja lo que el motor ya calculó.
 *
 * EL SODIO NO ESTÁ, y no es un olvido: no aporta calorías, y este anillo reparte
 * calorías. Se sigue midiendo y sigue en el payload; en pantalla aparece en la
 * línea de cada alimento y en el aviso de total parcial cuando faltó.
 *
 * ---------------------------------------------------------------------------
 * UN ANILLO, NO DOS (Q/A de Tomás del 01/09/2026, podado en la card 4.5)
 *
 * Hubo un anillo exterior que subdividía cada macro —azúcares y fibra dentro de
 * los hidratos, saturadas dentro de las grasas— y Tomás lo sacó: el donut vuelve
 * al anillo simple. Hasta la card 4.5 ese anillo se seguía CALCULANDO en cada
 * reporte y no se dibujaba, junto con la leyenda que iba debajo; eso ya no está.
 * Código que corre y no se ve no es una opción abierta, es una que nadie puede
 * verificar: nada lo prueba, nada lo mira, y el día que se lo quisiera revivir
 * habría que auditarlo entero igual. Los DATOS no se perdieron —`sugars_g`,
 * `fiber_g` y `sat_fat_g` siguen viajando en el payload y en el expediente—, así
 * que revivirlo es volver a escribir el dibujo, no volver a conseguir el dato.
 *
 * ---------------------------------------------------------------------------
 * HONESTIDAD DEL ANILLO (la doctrina de la card 2.3)
 *
 * El motor NO normaliza los porcentajes para que sumen 100: la diferencia
 * (`sin_explicar`) es información real —alcohol, fibra, redondeos de USDA— y
 * taparla sería inventar un cuadre. Pero un anillo tiene 360 grados sí o sí:
 *
 *   · si los tres suman MENOS de 100, lo que falta se dibuja como un tramo
 *     apagado y la nota del final dice cuánto es;
 *   · si suman MÁS de 100, el reparto se hace sobre esa suma (el anillo cierra)
 *     y esa misma nota dice cuánto sobra.
 *
 * Y UN `null` NO ES UN CERO: un macro sin gramos medidos dice "sin dato" en su
 * fila de la leyenda, nunca un 0.
 * ------------------------------------------------------------------------- */
import type { CopyDeLaApp } from "../lib/config";
import { gramosEnteros, porcentaje, porcentajeEntero } from "../lib/formato";
import type { PorcentajesDeMacros, TotalesNutrientes } from "../lib/types";

/** El anillo: grueso, es lo único que se dibuja. */
const RADIO = 66;
const GROSOR = 26;
const CENTRO = 100;

const VUELTA = 2 * Math.PI * RADIO;

/**
 * El respiro entre gajos, EN GRADOS y no en unidades de arco: así se puede
 * razonar sobre el hueco sin depender del radio.
 */
const SEPARACION_EN_GRADOS = 2.2;

/** Cuánto tarda en dibujarse el anillo. */
const DIBUJO_MS = 620;

/** Un gajo ya resuelto: dónde empieza, cuánto mide y de qué color es. */
interface Gajo {
  id: string;
  color: string;
  /** Dónde empieza, en unidades de arco del anillo. */
  inicio: number;
  largo: number;
}

interface Macro {
  clave: "protein" | "carbs" | "fat";
  etiqueta: string;
  color: string;
  pct: number;
  gramos: number | null;
}

export interface DonutMacrosProps {
  copy: CopyDeLaApp;
  macro_pct: PorcentajesDeMacros;
  nutrients: TotalesNutrientes;
  /** Lo que va en el centro del anillo. */
  centro: React.ReactNode;
}

export function DonutMacros({ copy, macro_pct, nutrients, centro }: DonutMacrosProps) {
  const macros: Macro[] = [
    {
      clave: "protein",
      etiqueta: copy.nutrient_protein,
      color: "var(--color-protein)",
      pct: macro_pct.protein,
      gramos: nutrients.protein_g,
    },
    {
      clave: "carbs",
      etiqueta: copy.nutrient_carbs,
      color: "var(--color-carbs)",
      pct: macro_pct.carbs,
      gramos: nutrients.carbs_g,
    },
    {
      clave: "fat",
      etiqueta: copy.nutrient_fat,
      color: "var(--color-fat)",
      pct: macro_pct.fat,
      gramos: nutrients.fat_g,
    },
  ];

  // ── El reparto calórico, con su base honesta ──────────────────────────────
  const suma = macros.reduce((total, macro) => total + Math.max(0, macro.pct), 0);
  const base = suma > 100 ? suma : 100;
  const sobrante = base - suma;
  const haySobrante = sobrante > 0.05;

  const gajos: Gajo[] = [];
  let acumulado = 0;
  for (const macro of macros) {
    const largo = (Math.max(0, macro.pct) / base) * VUELTA;
    gajos.push({ id: macro.clave, color: macro.color, inicio: acumulado, largo });
    acumulado += largo;
  }

  if (haySobrante) {
    gajos.push({
      id: "sin_explicar",
      color: "var(--color-line)",
      inicio: acumulado,
      largo: (sobrante / base) * VUELTA,
    });
  }

  /**
   * La descripción del gráfico para quien no lo ve. Se arma con los datos —por
   * eso no está en `config/app`— y dice exactamente lo que el dibujo MUESTRA:
   * el reparto calórico. Contar en la etiqueta algo que el anillo no dibuja
   * sería describir otro gráfico.
   */
  const descripcion = `Reparto de calorías: ${macros
    .map((macro) => `${macro.etiqueta} ${porcentaje(macro.pct)}`)
    .join(", ")}.`;

  return (
    <div className="flex flex-col gap-6">
      <div className="relative mx-auto w-full max-w-[17rem]">
        <svg viewBox="0 0 200 200" className="w-full" role="img" aria-label={descripcion}>
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RADIO}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={GROSOR}
          />
          <g transform={`rotate(-90 ${CENTRO} ${CENTRO})`}>
            {gajos.map((gajo) => (
              <Arco key={gajo.id} gajo={gajo} />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centro}
        </div>
      </div>

      {/* LA LEYENDA — el reparto calórico, y nada más (Q/A de Tomás, WS08).
          Tres decisiones, las tres suyas:
            · ORDEN DECRECIENTE por porcentaje: el macro que más pesa se lee
              primero. El ANILLO no se reordena —cada color se queda en su sitio
              y la animación entra igual—; se ordena la LISTA, que es la que se
              recorre de arriba abajo.
            · NÚMEROS ENTEROS, sin coma: los decimales descuadraban la columna en
              móvil y no cambiaban ninguna decisión de quien mira su plato.
            · SIN la fila «Sin explicar»: el hueco sigue dibujado como arco
              apagado y la nota de abajo lo explica en palabras cuando existe.
              Una fila con "sin dato" en su columna de gramos no informaba. */}
      <dl className="flex flex-col gap-2">
        {[...macros]
          .sort((uno, otro) => otro.pct - uno.pct)
          .map((macro) => (
            <div
              key={macro.clave}
              className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2"
            >
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: macro.color }}
              />
              <dt className="min-w-0 flex-1 text-sm text-ink-soft">{macro.etiqueta}</dt>
              {/* El % y los gramos son COLUMNAS de ancho fijo y sin quiebre: una
                  etiqueta larga («Hidratos de carbono») envuelve en la suya y
                  los números quedan alineados fila contra fila (Q/A de Tomás). */}
              <dd className="flex shrink-0 items-baseline gap-3 font-mono tabular-nums">
                <span className="w-12 whitespace-nowrap text-right text-ink">
                  {porcentajeEntero(macro.pct)}
                </span>
                <span className="w-14 whitespace-nowrap text-right text-sm text-ink-faint">
                  {macro.gramos === null
                    ? copy.nutrient_no_data
                    : `${gramosEnteros(macro.gramos)} g`}
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

/**
 * Un gajo, dibujado como un trozo de circunferencia.
 *
 * Se posiciona ROTANDO el círculo hasta su ángulo de arranque, y no con un
 * `strokeDashoffset` negativo como en la card 2.3: así el offset queda libre
 * para la animación de entrada —el gajo se DIBUJA desde su propio comienzo— y
 * cada arco necesita animar una sola propiedad. La regla vive en `index.css`
 * (`.donut-arco`), que es donde pueden vivir los keyframes.
 */
function Arco({ gajo }: { gajo: Gajo }) {
  if (gajo.largo <= 0) return null;

  const separacion = (VUELTA * SEPARACION_EN_GRADOS) / 360;
  // Un gajo muy chico no puede pagar el respiro entero: antes que achicarlo
  // hasta desaparecer —o dibujarlo más grande de lo que es— se dibuja entero y
  // pegado al vecino. Lo que no se toca nunca es el TAMAÑO real del gajo.
  const dibujo = gajo.largo > separacion * 2 ? gajo.largo - separacion : gajo.largo;
  const anguloDeArranque = (gajo.inicio / VUELTA) * 360;

  return (
    <circle
      className="donut-arco"
      cx={CENTRO}
      cy={CENTRO}
      r={RADIO}
      fill="none"
      stroke={gajo.color}
      strokeWidth={GROSOR}
      strokeLinecap="butt"
      strokeDasharray={`${dibujo} ${VUELTA}`}
      transform={`rotate(${anguloDeArranque} ${CENTRO} ${CENTRO})`}
      style={
        {
          // Como texto y no como número: una propiedad personalizada no lleva
          // unidad, y así no depende de que el framework no le pegue un "px".
          "--donut-largo": `${dibujo}`,
          animationDuration: `${DIBUJO_MS}ms`,
        } as React.CSSProperties
      }
    />
  );
}
