/**
 * EL DONUT DE DOBLE ANILLO: de dónde vienen las calorías, y de qué está hecho
 * cada macronutriente.
 *
 * SVG a mano, sin librería de charting: cualquier paquete de charts pesaría más
 * que toda la pantalla (`docs/PLAN.md` §4). Los colores son SEMÁNTICOS y viven
 * en `index.css` como design tokens (`--color-protein` coral, `--color-carbs`
 * ámbar, `--color-fat` violeta): el mismo tono significa lo mismo acá, en la
 * lista y en cualquier pantalla futura. Las subdivisiones del anillo exterior no
 * estrenan colores — son TONOS del macro al que pertenecen, para que se lea de
 * un vistazo a quién pertenece cada gajo.
 *
 * ---------------------------------------------------------------------------
 * LA ARITMÉTICA, QUE ES LO ÚNICO QUE NO SE NEGOCIA
 *
 * ANILLO INTERIOR — el reparto CALÓRICO. Son los `macro_pct` que manda el motor:
 * gramos × Atwater (4 proteínas / 4 hidratos / 9 grasas) sobre las kcal totales
 * (`porcentajesDeMacros` en `functions/src/engine/arithmetic.ts`). Acá no se
 * recalcula nada: se dibuja lo que el motor ya calculó, que es la misma base que
 * usaba el anillo simple de la card 2.3.
 *
 * ANILLO EXTERIOR — la SUBDIVISIÓN de cada arco interior, en su mismo lugar y
 * con su misma amplitud. Se reparte por PROPORCIÓN DE GRAMOS DENTRO DE ESE
 * MACRO, no sobre el plato:
 *
 *   · dentro de GRASAS      → saturadas / el resto      (sat_fat_g de fat_g)
 *   · dentro de HIDRATOS    → azúcares / fibra / el resto
 *                             (sugars_g y fiber_g de carbs_g — USDA cuenta los
 *                              dos ADENTRO de "carbohydrate, by difference", así
 *                              que restarlos no es una resta inventada)
 *   · dentro de PROTEÍNAS   → nada: no hay subdivisión medida, y el arco exterior
 *                             acompaña liso y atenuado en vez de fingir una.
 *
 * NADA SE CUENTA DOS VECES: el exterior es una PARTICIÓN del interior. Un gajo
 * exterior nunca aparece fuera del arco de su padre, y la suma de los gajos de
 * un macro es exactamente el arco de ese macro.
 *
 * EL SODIO NO ESTÁ, y no es un olvido: no aporta calorías, y este anillo reparte
 * calorías. Vive en el segundo recuadro del reporte, con los otros valores que
 * se miden pero no suman kcal.
 *
 * ---------------------------------------------------------------------------
 * HONESTIDAD DEL ANILLO (la doctrina de la card 2.3, ahora en dos radios)
 *
 * El motor NO normaliza los porcentajes para que sumen 100: la diferencia
 * (`sin_explicar`) es información real —alcohol, fibra, redondeos de USDA— y
 * taparla sería inventar un cuadre. Pero un anillo tiene 360 grados sí o sí:
 *
 *   · si los tres suman MENOS de 100, lo que falta se dibuja como un tramo
 *     apagado, "sin explicar", y se nombra en la leyenda;
 *   · si suman MÁS de 100, el reparto se hace sobre esa suma (el anillo cierra)
 *     y la leyenda dice cuánto sobra.
 *
 * Lo mismo, un piso más afuera: si las partes medidas de un macro suman MÁS que
 * el macro (puede pasar entre fichas de fuentes distintas), el dibujo se reparte
 * sobre esa suma para que el arco cierre — y los GRAMOS de la leyenda siguen
 * siendo los que mandó el motor, sin tocar.
 *
 * Y UN `null` NO ES UN CERO. Si un valor de subdivisión no viene medido, ese
 * gajo NO se dibuja como 0: si no hay ninguna parte medida, el arco exterior de
 * ese macro queda liso, y la leyenda dice "sin dato" al lado de lo que falta. No
 * se asume nunca que lo que no se midió vale cero.
 * ------------------------------------------------------------------------- */
import type { CopyDeLaApp } from "../lib/config";
import { gramos, porcentaje } from "../lib/formato";
import type { PorcentajesDeMacros, TotalesNutrientes } from "../lib/types";

/** El anillo interior: grueso, es el que manda. */
const RADIO_INTERIOR = 66;
const GROSOR_INTERIOR = 26;
/** El exterior: fino, acompaña. La distancia entre los dos los separa de verdad. */
const RADIO_EXTERIOR = 88;
const GROSOR_EXTERIOR = 11;
const CENTRO = 100;

const VUELTA_INTERIOR = 2 * Math.PI * RADIO_INTERIOR;
const VUELTA_EXTERIOR = 2 * Math.PI * RADIO_EXTERIOR;

/**
 * El respiro entre gajos, EN GRADOS y no en unidades de arco: así el hueco se ve
 * igual en los dos anillos, que tienen circunferencias distintas.
 */
const SEPARACION_EN_GRADOS = 2.2;

/** Cuánto tarda en dibujarse cada anillo, y cuánto espera el de afuera. */
const DIBUJO_MS = 620;
const ESPERA_DEL_EXTERIOR_MS = 260;

/** Un gajo ya resuelto: dónde empieza, cuánto mide y de qué color es. */
interface Gajo {
  id: string;
  color: string;
  /** Dónde empieza, en unidades de arco de SU anillo. */
  inicio: number;
  largo: number;
  retraso: number;
}

/** Una parte medida (o no) dentro de un macro. */
interface Parte {
  id: string;
  etiqueta: string;
  color: string;
  /** `null` = la fuente no lo declara. No es cero. */
  gramos: number | null;
}

interface Macro {
  clave: "protein" | "carbs" | "fat";
  etiqueta: string;
  color: string;
  /** Su tono atenuado, para el arco exterior cuando no hay nada que subdividir. */
  colorTenue: string;
  pct: number;
  gramos: number | null;
  partes: Parte[];
  /** La etiqueta de lo que queda después de las partes medidas. */
  etiquetaDelResto: string;
}

export interface DonutMacrosProps {
  copy: CopyDeLaApp;
  macro_pct: PorcentajesDeMacros;
  nutrients: TotalesNutrientes;
  /** Lo que va en el centro del anillo. */
  centro: React.ReactNode;
}

/** Un tono más oscuro e intenso del color del macro. */
function intenso(token: string): string {
  return `color-mix(in oklab, ${token} 72%, #000)`;
}

/** El mismo color, apagado contra el fondo: acompaña sin competir. */
function tenue(token: string): string {
  return `color-mix(in oklab, ${token} 34%, var(--color-surface-2))`;
}

export function DonutMacros({ copy, macro_pct, nutrients, centro }: DonutMacrosProps) {
  const macros: Macro[] = [
    {
      clave: "protein",
      etiqueta: copy.nutrient_protein,
      color: "var(--color-protein)",
      colorTenue: tenue("var(--color-protein)"),
      pct: macro_pct.protein,
      gramos: nutrients.protein_g,
      // Sin subdivisión: el catálogo no mide aminoácidos, y partir el arco por
      // algo que no se midió sería dibujar una precisión que no existe.
      partes: [],
      etiquetaDelResto: copy.donut_rest,
    },
    {
      clave: "carbs",
      etiqueta: copy.nutrient_carbs,
      color: "var(--color-carbs)",
      colorTenue: tenue("var(--color-carbs)"),
      pct: macro_pct.carbs,
      gramos: nutrients.carbs_g,
      partes: [
        {
          id: "sugars",
          etiqueta: copy.nutrient_sugars,
          color: "var(--color-carbs)",
          gramos: nutrients.sugars_g,
        },
        {
          id: "fiber",
          etiqueta: copy.nutrient_fiber,
          color: intenso("var(--color-carbs)"),
          gramos: nutrients.fiber_g,
        },
      ],
      etiquetaDelResto: copy.donut_rest,
    },
    {
      clave: "fat",
      etiqueta: copy.nutrient_fat,
      color: "var(--color-fat)",
      colorTenue: tenue("var(--color-fat)"),
      pct: macro_pct.fat,
      gramos: nutrients.fat_g,
      partes: [
        {
          id: "sat_fat",
          etiqueta: copy.nutrient_sat_fat,
          color: intenso("var(--color-fat)"),
          gramos: nutrients.sat_fat_g,
        },
      ],
      etiquetaDelResto: copy.donut_rest,
    },
  ];

  // ── El anillo interior: el reparto calórico, con su base honesta ──────────
  const suma = macros.reduce((total, macro) => total + Math.max(0, macro.pct), 0);
  const base = suma > 100 ? suma : 100;
  const sobrante = base - suma;
  const haySobrante = sobrante > 0.05;

  const interiores: Gajo[] = [];
  const exteriores: Gajo[] = [];
  /** El desglose ya resuelto, para la leyenda de abajo. */
  const desglose: { macro: Macro; partes: Parte[]; resto: number | null }[] = [];

  let acumulado = 0;
  for (const macro of macros) {
    const largo = (Math.max(0, macro.pct) / base) * VUELTA_INTERIOR;
    interiores.push({
      id: macro.clave,
      color: macro.color,
      inicio: acumulado,
      largo,
      retraso: 0,
    });

    // El mismo tramo, en el radio de afuera: misma fracción de la vuelta.
    const fraccion = largo / VUELTA_INTERIOR;
    const inicioExterior = (acumulado / VUELTA_INTERIOR) * VUELTA_EXTERIOR;
    const largoExterior = fraccion * VUELTA_EXTERIOR;
    acumulado += largo;

    const medidas = macro.partes.filter((parte) => parte.gramos !== null);
    const totalDelMacro = macro.gramos;

    if (medidas.length === 0 || totalDelMacro === null || totalDelMacro <= 0) {
      // Nada que subdividir (o nada medido): el arco exterior acompaña liso.
      exteriores.push({
        id: `${macro.clave}-liso`,
        color: macro.colorTenue,
        inicio: inicioExterior,
        largo: largoExterior,
        retraso: ESPERA_DEL_EXTERIOR_MS,
      });
      desglose.push({ macro, partes: macro.partes, resto: null });
      continue;
    }

    // Las partes medidas, en proporción de gramos DENTRO del macro. Si suman más
    // que el macro (fuentes distintas, redondeos), el dibujo se reparte sobre esa
    // suma para que el arco cierre: los gramos de la leyenda no se tocan.
    const sumaMedida = medidas.reduce((total, parte) => total + (parte.gramos ?? 0), 0);
    const baseDelMacro = sumaMedida > totalDelMacro ? sumaMedida : totalDelMacro;
    let dentro = inicioExterior;
    for (const parte of medidas) {
      const largoParte = ((parte.gramos ?? 0) / baseDelMacro) * largoExterior;
      exteriores.push({
        id: `${macro.clave}-${parte.id}`,
        color: parte.color,
        inicio: dentro,
        largo: largoParte,
        retraso: ESPERA_DEL_EXTERIOR_MS,
      });
      dentro += largoParte;
    }
    const resto = Math.max(0, baseDelMacro - sumaMedida);
    if (resto > 0) {
      exteriores.push({
        id: `${macro.clave}-resto`,
        color: macro.colorTenue,
        inicio: dentro,
        largo: (resto / baseDelMacro) * largoExterior,
        retraso: ESPERA_DEL_EXTERIOR_MS,
      });
    }
    desglose.push({ macro, partes: macro.partes, resto });
  }

  if (haySobrante) {
    const largo = (sobrante / base) * VUELTA_INTERIOR;
    interiores.push({
      id: "sin_explicar",
      color: "var(--color-line)",
      inicio: acumulado,
      largo,
      retraso: 0,
    });
    exteriores.push({
      id: "sin_explicar-exterior",
      color: "var(--color-surface-2)",
      inicio: (acumulado / VUELTA_INTERIOR) * VUELTA_EXTERIOR,
      largo: (largo / VUELTA_INTERIOR) * VUELTA_EXTERIOR,
      retraso: ESPERA_DEL_EXTERIOR_MS,
    });
  }

  /**
   * La descripción del gráfico para quien no lo ve. Se arma con los datos —por
   * eso no está en `config/app`— y dice lo mismo que la leyenda: el reparto
   * calórico y, dentro de cada macro, de qué está hecho.
   */
  const descripcion = [
    `Reparto de calorías: ${macros
      .map((macro) => `${macro.etiqueta} ${porcentaje(macro.pct)}`)
      .join(", ")}.`,
    ...desglose
      .filter((fila) => fila.macro.partes.length > 0)
      .map((fila) => {
        const partes = fila.macro.partes.map(
          (parte) =>
            `${parte.etiqueta} ${parte.gramos === null ? copy.nutrient_no_data : `${gramos(parte.gramos)} g`}`,
        );
        if (fila.resto !== null && fila.resto > 0) {
          partes.push(`${fila.macro.etiquetaDelResto} ${gramos(fila.resto)} g`);
        }
        return `Dentro de ${fila.macro.etiqueta.toLowerCase()}: ${partes.join(", ")}.`;
      }),
  ].join(" ");

  return (
    <div className="flex flex-col gap-6">
      <div className="relative mx-auto w-full max-w-[17rem]">
        <svg viewBox="0 0 200 200" className="w-full" role="img" aria-label={descripcion}>
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RADIO_INTERIOR}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={GROSOR_INTERIOR}
          />
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RADIO_EXTERIOR}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={GROSOR_EXTERIOR}
            opacity={0.55}
          />
          {/* Las doce en punto es el arranque de los dos anillos: el gajo de
              afuera empieza donde empieza el suyo de adentro. */}
          <g transform={`rotate(-90 ${CENTRO} ${CENTRO})`}>
            {exteriores.map((gajo) => (
              <Arco
                key={gajo.id}
                gajo={gajo}
                radio={RADIO_EXTERIOR}
                grosor={GROSOR_EXTERIOR}
                vuelta={VUELTA_EXTERIOR}
              />
            ))}
            {interiores.map((gajo) => (
              <Arco
                key={gajo.id}
                gajo={gajo}
                radio={RADIO_INTERIOR}
                grosor={GROSOR_INTERIOR}
                vuelta={VUELTA_INTERIOR}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centro}
        </div>
      </div>

      {/* La leyenda del anillo interior: el reparto calórico, con los gramos. */}
      <dl className="flex flex-col gap-2">
        {macros.map((macro) => (
          <div
            key={macro.clave}
            className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2"
          >
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: macro.color }}
            />
            <dt className="text-sm text-ink-soft">{macro.etiqueta}</dt>
            <dd className="ml-auto flex items-baseline gap-3 font-mono tabular-nums">
              <span className="text-ink">{porcentaje(macro.pct)}</span>
              <span className="w-16 text-right text-sm text-ink-faint">
                {macro.gramos === null ? copy.nutrient_no_data : `${gramos(macro.gramos)} g`}
              </span>
            </dd>
          </div>
        ))}
        {haySobrante && (
          <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--color-line)" }}
            />
            <dt className="text-sm text-ink-faint">{copy.donut_unexplained}</dt>
            <dd className="ml-auto flex items-baseline gap-3 font-mono tabular-nums">
              <span className="text-ink-faint">{porcentaje(sobrante)}</span>
              <span className="w-16 text-right text-sm text-ink-faint">
                {copy.nutrient_no_data}
              </span>
            </dd>
          </div>
        )}
      </dl>

      {/* La leyenda del anillo exterior: qué hay DENTRO de cada macro. */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs tracking-[0.14em] text-ink-faint uppercase">
          {copy.donut_detail_title}
        </h3>
        {desglose
          .filter((fila) => fila.macro.partes.length > 0)
          .map((fila) => (
            <div key={fila.macro.clave} className="flex flex-col gap-1.5">
              <p className="text-xs text-ink-faint">{fila.macro.etiqueta}</p>
              {/* Un `dl` por macro, y no uno solo con encabezados adentro: el
                  título del grupo no es un término ni una definición, y `dl` no
                  admite otra cosa. */}
              <dl className="flex flex-col gap-1.5">
                {fila.macro.partes.map((parte) => (
                  <div key={parte.id} className="flex items-center gap-3 pl-1">
                    {/* Sin dato, sin color: lo que no está en el anillo no puede
                        tener su gajo pintado en la leyenda. El círculo vacío es
                        el hueco, dibujado. */}
                    {parte.gramos === null ? (
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full border border-dashed border-line"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: parte.color }}
                      />
                    )}
                    <dt className="text-sm text-ink-soft">{parte.etiqueta}</dt>
                    <dd className="ml-auto font-mono text-sm text-ink tabular-nums">
                      {parte.gramos === null ? (
                        <span className="text-ink-faint">{copy.nutrient_no_data}</span>
                      ) : (
                        `${gramos(parte.gramos)} g`
                      )}
                    </dd>
                  </div>
                ))}
                {fila.resto !== null && fila.resto > 0 && (
                  <div className="flex items-center gap-3 pl-1">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: fila.macro.colorTenue }}
                    />
                    <dt className="text-sm text-ink-soft">{fila.macro.etiquetaDelResto}</dt>
                    <dd className="ml-auto font-mono text-sm text-ink tabular-nums">
                      {gramos(fila.resto)} g
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          ))}
      </div>

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
function Arco({
  gajo,
  radio,
  grosor,
  vuelta,
}: {
  gajo: Gajo;
  radio: number;
  grosor: number;
  vuelta: number;
}) {
  if (gajo.largo <= 0) return null;

  const separacion = (vuelta * SEPARACION_EN_GRADOS) / 360;
  // Un gajo muy chico no puede pagar el respiro entero: antes que achicarlo
  // hasta desaparecer —o dibujarlo más grande de lo que es— se dibuja entero y
  // pegado al vecino. Lo que no se toca nunca es el TAMAÑO real del gajo.
  const dibujo = gajo.largo > separacion * 2 ? gajo.largo - separacion : gajo.largo;
  const anguloDeArranque = (gajo.inicio / vuelta) * 360;

  return (
    <circle
      className="donut-arco"
      cx={CENTRO}
      cy={CENTRO}
      r={radio}
      fill="none"
      stroke={gajo.color}
      strokeWidth={grosor}
      strokeLinecap="butt"
      strokeDasharray={`${dibujo} ${vuelta}`}
      transform={`rotate(${anguloDeArranque} ${CENTRO} ${CENTRO})`}
      style={
        {
          // Como texto y no como número: una propiedad personalizada no lleva
          // unidad, y así no depende de que el framework no le pegue un "px".
          "--donut-largo": `${dibujo}`,
          animationDuration: `${DIBUJO_MS}ms`,
          animationDelay: `${gajo.retraso}ms`,
        } as React.CSSProperties
      }
    />
  );
}
