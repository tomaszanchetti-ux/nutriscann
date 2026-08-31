/**
 * Pantalla 2 — el reporte. SOLO LO MEDIDO.
 *
 * Decisión de producto del 31/08/2026 (`docs/PLAN.md` §4 y §6): la v1 no muestra
 * recomendaciones. El set de reglas existe, está publicado en `config/app` y
 * queda dormido hasta la v2. Acá no hay ni un consejo: hay calorías, macros y la
 * lista de lo que se identificó, cada número con su ficha y su confianza.
 *
 * Orden visual (el del plan, sin la card de recomendación):
 *   1. calorías totales, grandes, adentro del anillo
 *   2. donut de macros con % y gramos
 *   3. el aviso de total parcial, si el total es parcial
 *   4. la lista de items con confianza, sello de match y letra chica
 *   5. un solo CTA
 *
 * El count-up del número y la animación de entrada son de la Fase 3.
 */
import { AvisoParcial } from "./AvisoParcial";
import { DonutMacros } from "./DonutMacros";
import { ItemDelPlato } from "./ItemDelPlato";
import type { CopyDeLaApp } from "../lib/config";
import { gramos, gramosEnteros, kcal } from "../lib/formato";
import type { EngineTotals, RespuestaDeAnalisis } from "../lib/types";

export interface PantallaReporteProps {
  copy: CopyDeLaApp;
  reporte: RespuestaDeAnalisis;
  onOtroPlato: () => void;
}

export function PantallaReporte({ copy, reporte, onOtroPlato }: PantallaReporteProps) {
  const { totals, items } = reporte;

  return (
    <div className="flex flex-col gap-8 py-8">
      <section className="flex flex-col gap-6">
        {totals !== null && totals.macro_pct !== null ? (
          <DonutMacros
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
        ) : (
          <SinTotales copy={copy} motivo={totals?.macro_pct_motivo ?? null} />
        )}
      </section>

      {totals !== null && (
        <>
          <AvisoParcial totals={totals} titulo={copy.report_partial_title} />
          <OtrosNutrientes totals={totals} />
        </>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm tracking-[0.14em] text-ink-faint uppercase">
          {copy.report_items_title}
        </h2>
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => (
            <ItemDelPlato key={`${item.termino_en}-${i}`} item={item} />
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={onOtroPlato}
        className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-ground transition-transform active:scale-[0.98]"
      >
        {copy.report_cta}
      </button>

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
 * Cuando NINGÚN item se pudo cuantificar no hay anillo que dibujar, y el motor
 * manda el motivo escrito. Se muestra ese, tal cual: es más honesto que un
 * donut vacío.
 */
function SinTotales({ copy, motivo }: { copy: CopyDeLaApp; motivo: string | null }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="font-display text-2xl font-semibold text-ink">Sin números para este plato</p>
      <p className="text-sm leading-relaxed text-ink-soft">
        {motivo ??
          "Ninguno de los alimentos identificados tiene ficha en el catálogo, así que no hay nada que sumar. Abajo está lo que sí se reconoció."}
      </p>
      <p className="text-xs text-ink-faint">{copy.report_macros_title}: sin datos.</p>
    </div>
  );
}

/**
 * Los cuatro opcionales. Se muestran los que hay; los que faltan tienen su
 * propio lugar en el aviso de arriba y no se rellenan con un cero.
 */
function OtrosNutrientes({ totals }: { totals: EngineTotals }) {
  const filas: { etiqueta: string; valor: number | null; unidad: string }[] = [
    { etiqueta: "Fibra", valor: totals.nutrients.fiber_g, unidad: "g" },
    { etiqueta: "Grasas saturadas", valor: totals.nutrients.sat_fat_g, unidad: "g" },
    { etiqueta: "Azúcares", valor: totals.nutrients.sugars_g, unidad: "g" },
    { etiqueta: "Sodio", valor: totals.nutrients.sodium_mg, unidad: "mg" },
  ];

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-sm tracking-[0.14em] text-ink-faint uppercase">Del resto del análisis</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {filas.map((fila) => (
          <div key={fila.etiqueta} className="flex flex-col gap-0.5">
            <dt className="text-xs text-ink-faint">{fila.etiqueta}</dt>
            <dd className="font-mono text-ink tabular-nums">
              {fila.valor === null ? (
                <span className="text-ink-faint">sin dato</span>
              ) : (
                `${fila.unidad === "mg" ? gramosEnteros(fila.valor) : gramos(fila.valor)} ${fila.unidad}`
              )}
            </dd>
          </div>
        ))}
        <div className="col-span-2 flex justify-between border-t border-line pt-3 text-xs">
          <dt className="text-ink-faint">Peso identificado</dt>
          <dd className="font-mono text-ink-soft tabular-nums">
            {gramosEnteros(totals.grams_cuantificados)} g de{" "}
            {gramosEnteros(totals.grams_total)} g
          </dd>
        </div>
      </dl>
    </section>
  );
}
