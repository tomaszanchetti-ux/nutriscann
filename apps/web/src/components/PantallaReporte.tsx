/**
 * Pantalla 2 — el reporte. SOLO LO MEDIDO.
 *
 * Decisión de producto del 31/08/2026 (`docs/PLAN.md` §4 y §6): la v1 no muestra
 * recomendaciones. El set de reglas existe, está publicado en `config/app` y
 * queda dormido hasta la v2. Acá no hay ni un consejo: hay calorías, macros y la
 * lista de lo que se identificó, cada número con su ficha y su confianza.
 *
 * ORDEN VISUAL (card 3.1 — el doble recuadro, criterio de Tomás del 01/09):
 *   1. PRIMER RECUADRO — lo PRINCIPAL: el donut de doble anillo con las calorías
 *      grandes en el centro y el reparto de macros con sus gramos. Lo encabeza
 *      `report_macros_title`, que hasta esta card era un título huérfano que
 *      solo aparecía cuando NO había macros (DT-23).
 *   2. el aviso de total parcial, si el total es parcial
 *   3. SEGUNDO RECUADRO — los MENORES: fibra, saturadas, azúcares y sodio, con
 *      el peso identificado al pie. Son los que se miden y no aportan calorías
 *      (o no reparten el anillo), y por eso no están arriba.
 *   4. la lista de items con confianza, sello de match y letra chica
 *   5. el doble CTA (card 3.3): escanear otro plato, y pasarse a premium
 *
 * EL TEXTO LEGAL NO ESTÁ ACÁ y no es un olvido: vive en `PieDeDiagnostico`, al
 * final de la pantalla y en letra chica, debajo de todo lo demás (pedido de
 * Tomás). Es el mismo pie en todas las pantallas, así que decirlo dos veces en
 * esta sería repetirlo, no reforzarlo.
 */
import { AvisoParcial } from "./AvisoParcial";
import { DonutMacros } from "./DonutMacros";
import { ItemDelPlato } from "./ItemDelPlato";
import type { CopyDeLaApp } from "../lib/config";
import { COPY_CTA_PREMIUM } from "../lib/copy.premium";
import { gramos, gramosEnteros, kcal } from "../lib/formato";
import type { EngineTotals, RespuestaDeAnalisis } from "../lib/types";

export interface PantallaReporteProps {
  copy: CopyDeLaApp;
  reporte: RespuestaDeAnalisis;
  onOtroPlato: () => void;
  /** El segundo CTA: lleva a la sección Premium sin perder el reporte. */
  onPasarseAPremium: () => void;
}

/**
 * ¿Hay un total que se pueda dibujar?
 *
 * Son TRES preguntas y las tres tienen que dar que sí, porque el motor tiene tres
 * formas distintas de decir que no (y ninguna es una excepción ni un error):
 *
 *   · `totals === null`         — ningún alimento se pudo cuantificar.
 *   · `total_no_publicable`     — la compuerta del total cerró (card 6.1): los
 *                                 ocho valores viajan en `null` a propósito.
 *   · `macro_pct === null`      — no hay nada que repartir (kcal en 0).
 *
 * En los tres casos el reporte muestra el motivo que escribió el motor, no un
 * anillo vacío ni un cero inventado.
 */
function hayTotalDibujable(
  totals: EngineTotals | null,
): totals is EngineTotals & { nutrients: { kcal: number } } {
  return (
    totals !== null &&
    totals.total_no_publicable !== true &&
    totals.macro_pct !== null &&
    totals.nutrients.kcal !== null
  );
}

export function PantallaReporte({
  copy,
  reporte,
  onOtroPlato,
  onPasarseAPremium,
}: PantallaReporteProps) {
  const { totals, items } = reporte;
  const conTotal = hayTotalDibujable(totals);

  return (
    <div className="flex flex-col gap-8 py-8">
      {conTotal && totals.macro_pct !== null ? (
        <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm tracking-[0.14em] text-ink-faint uppercase">
            {copy.report_macros_title}
          </h2>
          <DonutMacros
            copy={copy}
            macro_pct={totals.macro_pct}
            nutrients={totals.nutrients}
            centro={
              <>
                <span className="font-display text-5xl leading-none font-bold text-ink tabular-nums">
                  {kcal(totals.nutrients.kcal)}
                </span>
                <span className="mt-1 max-w-[7rem] text-center text-xs text-balance text-ink-faint">
                  {copy.report_kcal_label}
                </span>
              </>
            }
          />
        </section>
      ) : (
        <SinTotales copy={copy} motivo={totals?.macro_pct_motivo ?? null} />
      )}

      {conTotal && (
        <>
          <AvisoParcial copy={copy} totals={totals} titulo={copy.report_partial_title} />
          <OtrosNutrientes copy={copy} totals={totals} />
        </>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm tracking-[0.14em] text-ink-faint uppercase">
          {copy.report_items_title}
        </h2>
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => (
            <ItemDelPlato key={`${item.termino_en}-${i}`} copy={copy} item={item} />
          ))}
        </ul>
      </section>

      {/* EL DOBLE CTA (card 3.3). Los dos botones son del MISMO tamaño —ancho
          completo, misma tipografía, mismo alto— porque la decisión no está
          sesgada: escanear otro plato es lo normal, y pasar a premium tiene que
          poder verse sin que grite. Lo que cambia es el color: el verde lleno
          sigue siendo la acción principal y el premium usa el verde apagado del
          sistema, que destaca sobre el fondo sin competir con él.

          El "Escanear otro plato" queda TAL CUAL estaba: mismo texto de
          `config/app`, mismo `onClick`. */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onOtroPlato}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-ground transition-transform active:scale-[0.98]"
        >
          {copy.report_cta}
        </button>

        <button
          type="button"
          onClick={onPasarseAPremium}
          className="w-full rounded-2xl border border-accent/45 bg-accent-soft px-6 py-4 text-base font-semibold text-accent transition-transform active:scale-[0.98]"
        >
          {COPY_CTA_PREMIUM.etiqueta}
        </button>

        <p className="text-center text-xs leading-relaxed text-ink-faint">
          {COPY_CTA_PREMIUM.pie}
        </p>
      </div>

      <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
        catálogo {reporte.meta.kb_version} · {reporte.meta.model} · {reporte.meta.latency_ms} ms (
        {reporte.meta.model_latency_ms} del modelo) · {reporte.meta.tokens_in}/
        {reporte.meta.tokens_out} tokens · scan {reporte.scan_id ?? "sin id"}
        {!reporte.persisted && (
          // El análisis ya se pagó y se muestra igual, pero que se haya guardado
          // o no es un hecho distinto: se dice, no se supone.
          <span className="text-carbs"> · el expediente NO se guardó</span>
        )}
      </p>
    </div>
  );
}

/**
 * Cuando no hay total que dibujar no hay anillo, y el motor manda el motivo
 * escrito. Se muestra ESE, tal cual: es más honesto que un donut vacío, y
 * además distingue los dos casos que se ven igual desde afuera —"ninguna ficha"
 * y "ninguna identificación confiable"— porque el texto los distingue.
 *
 * Tampoco se muestran los recuadros de números: con la compuerta cerrada los
 * ocho valores viajan en `null`, y una tabla entera de "sin dato" no informa,
 * hace ruido. Los alimentos siguen abajo, uno por uno, con lo suyo.
 */
function SinTotales({ copy, motivo }: { copy: CopyDeLaApp; motivo: string | null }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="font-display text-2xl font-semibold text-ink">{copy.report_no_totals_title}</p>
      <p className="text-sm leading-relaxed text-ink-soft">{motivo ?? copy.report_no_totals_body}</p>
    </div>
  );
}

/**
 * EL SEGUNDO RECUADRO — los menores. Se muestran los que hay; los que faltan
 * dicen "sin dato" y tienen su explicación en el aviso de arriba. Ninguno se
 * rellena con un cero: `null` no es cero, y esa es la regla del proyecto.
 *
 * El sodio está acá y no en el donut porque no aporta calorías: el anillo
 * reparte kcal, y meterlo ahí obligaría a inventar una base que no existe.
 */
function OtrosNutrientes({ copy, totals }: { copy: CopyDeLaApp; totals: EngineTotals }) {
  const filas: { etiqueta: string; valor: number | null; unidad: string }[] = [
    { etiqueta: copy.nutrient_fiber, valor: totals.nutrients.fiber_g, unidad: "g" },
    { etiqueta: copy.nutrient_sat_fat, valor: totals.nutrients.sat_fat_g, unidad: "g" },
    { etiqueta: copy.nutrient_sugars, valor: totals.nutrients.sugars_g, unidad: "g" },
    { etiqueta: copy.nutrient_sodium, valor: totals.nutrients.sodium_mg, unidad: "mg" },
  ];

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-sm tracking-[0.14em] text-ink-faint uppercase">
        {copy.report_others_title}
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {filas.map((fila) => (
          <div key={fila.etiqueta} className="flex flex-col gap-0.5">
            <dt className="text-xs text-ink-faint">{fila.etiqueta}</dt>
            <dd className="font-mono text-ink tabular-nums">
              {fila.valor === null ? (
                <span className="text-ink-faint">{copy.nutrient_no_data}</span>
              ) : (
                `${fila.unidad === "mg" ? gramosEnteros(fila.valor) : gramos(fila.valor)} ${fila.unidad}`
              )}
            </dd>
          </div>
        ))}
        <div className="col-span-2 flex justify-between border-t border-line pt-3 text-xs">
          <dt className="text-ink-faint">{copy.report_weight_label}</dt>
          <dd className="font-mono text-ink-soft tabular-nums">
            {gramosEnteros(totals.grams_cuantificados)} g de{" "}
            {gramosEnteros(totals.grams_total)} g
          </dd>
        </div>
      </dl>
    </section>
  );
}
