/**
 * Pantalla 2 — el reporte. SOLO LO MEDIDO.
 *
 * Decisión de producto del 31/08/2026 (`docs/PLAN.md` §4 y §6): la v1 no muestra
 * recomendaciones. El set de reglas existe, está publicado en `config/app` y
 * queda dormido hasta la v2. Acá no hay ni un consejo: hay calorías, macros y la
 * lista de lo que se identificó, cada número con su ficha y su confianza.
 *
 * ORDEN VISUAL (Q/A de Tomás, WS08 — la pantalla se acortó):
 *   1. EL RECUADRO PRINCIPAL: el donut de doble anillo con las calorías grandes
 *      en el centro y el reparto de macros. Lo encabeza `report_macros_title`.
 *   2. el aviso de total parcial, si el total es parcial
 *   3. la lista de items con confianza, sello de match y letra chica
 *   4. el doble CTA (card 3.3): escanear otro plato, y pasarse a Premium
 *
 * CARD 6.2 (03/09/2026): el total se publica SIEMPRE. Hasta esta card, cuando
 * ningún alimento del plato superaba el piso de confianza, la compuerta
 * apagaba el total entero y esta pantalla mostraba "Sin números para este
 * plato" aunque el motor tuviera con qué calcular. Tomás la redefinió con el
 * motivo dicho en sus palabras: «no mostrar ficha nos MATA». La señal de
 * calidad para quien usa la app deja de ser un score de confianza — pasa a ser
 * la VÍA por la que se llegó a cada ficha, que es harina de otra card — así que
 * esta pantalla no gana ningún recuadro nuevo: gana el número que antes se
 * tapaba.
 *
 * QUÉ SACÓ LA WS08, y por qué no se perdió nada:
 *
 *   · EL SEGUNDO RECUADRO, «Del resto del análisis» (fibra, saturadas, azúcares
 *     y sodio, con el peso identificado al pie). Decisión de Tomás: pocas cosas
 *     en pantalla y muy útiles. Los cuatro valores SIGUEN VIAJANDO en el payload
 *     del motor y siguen en el expediente — salieron de la pantalla, no del
 *     contrato. Sus claves de copy (`report_others_title`, `report_weight_label`)
 *     quedaron sin lector y la card 4.5 las sacó de `config/copy.json`: una
 *     clave que nadie lee promete que editarla cambia algo, y no cambia nada.
 *   · LA LÍNEA DE META del pie (catálogo, modelo, latencia, tokens, scan id).
 *     Es diagnóstico técnico, igual que el pie de la app: se muestra SOLO en
 *     desarrollo, con la misma regla y por el mismo motivo.
 *
 * EL TEXTO LEGAL NO ESTÁ ACÁ y no es un olvido: vive en `PieLegal`, al final de
 * la pantalla y en letra chica, debajo de la barra de navegación (pedido de
 * Tomás). Es el mismo pie en todas las pantallas, así que decirlo dos veces en
 * esta sería repetirlo, no reforzarlo.
 */
import { AvisoParcial } from "./AvisoParcial";
import { DonutMacros } from "./DonutMacros";
import { ItemDelPlato } from "./ItemDelPlato";
import { umbralesPublicados, type CopyDeLaApp } from "../lib/config";
import { kcal } from "../lib/formato";
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
 * Card 6.2: la compuerta que hasta hoy podía apagar el total entero por
 * confianza baja SE FUE — el total se publica siempre que haya algo que sumar.
 * Quedan DOS preguntas, no tres, y las dos tienen que dar que sí:
 *
 *   · `totals === null`     — ningún alimento se pudo cuantificar.
 *   · `macro_pct === null`  — no hay nada que repartir: las kcal están en 0,
 *                             o el plato tiene calorías que no vienen de
 *                             ningún macronutriente (alcohol, card 5.1).
 *
 * En los dos casos el reporte muestra el motivo que escribió el motor, no un
 * anillo vacío ni un cero inventado.
 */
function hayTotalDibujable(
  totals: EngineTotals | null,
): totals is EngineTotals & { nutrients: { kcal: number } } {
  return totals !== null && totals.macro_pct !== null && totals.nutrients.kcal !== null;
}

export function PantallaReporte({
  copy,
  reporte,
  onOtroPlato,
  onPasarseAPremium,
}: PantallaReporteProps) {
  const { totals, items } = reporte;
  const conTotal = hayTotalDibujable(totals);
  // Los umbrales publicados, leídos una vez para toda la lista: el único que hay
  // hoy lo usa la línea de sodio de cada ítem (DT-41 a).
  const umbrales = umbralesPublicados();

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
        <AvisoParcial copy={copy} totals={totals} titulo={copy.report_partial_title} />
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm tracking-[0.14em] text-ink-faint uppercase">
          {copy.report_items_title}
        </h2>
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => (
            <ItemDelPlato
              key={`${item.termino_en}-${i}`}
              copy={copy}
              umbrales={umbrales}
              item={item}
            />
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
          {copy.report_cta_premium}
        </button>
      </div>

      {/* LA LÍNEA DE META, SOLO EN DESARROLLO (Q/A de Tomás, WS08). Es el mismo
          criterio que el pie de diagnóstico de la app: catálogo, modelo, tokens
          y scan id son para quien depura, no para quien come. Vite la elimina
          del bundle de producción. */}
      {import.meta.env.DEV && (
        <p className="font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
          catálogo {reporte.meta.kb_version} · {reporte.meta.model} · {reporte.meta.latency_ms} ms (
          {reporte.meta.model_latency_ms} del modelo) · {reporte.meta.tokens_in}/
          {reporte.meta.tokens_out} tokens · scan {reporte.scan_id ?? "sin id"}
          {!reporte.persisted && (
            // El análisis ya se pagó y se muestra igual, pero que se haya
            // guardado o no es un hecho distinto: se dice, no se supone.
            <span className="text-carbs"> · el expediente NO se guardó</span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Cuando no hay total que dibujar no hay anillo, y el motor manda el motivo
 * escrito. Se muestra ESE, tal cual: es más honesto que un donut vacío.
 *
 * Card 6.2: hasta hoy este caso cubría además la compuerta de confianza baja
 * —cuando ningún alimento superaba el piso, el total entero se apagaba y se
 * veía igual que cuando ningún alimento tenía ficha—. Esa compuerta se fue: el
 * total se publica siempre que haya algo que sumar. Lo que queda acá es solo
 * lo que quedaba ANTES de la compuerta (card 2.3): no hay ningún nutriente que
 * sumar porque ningún alimento identificado está en la base, o las kcal del
 * total dieron 0 o sin macros que repartir (`macro_pct === null`, card 5.1).
 * Los alimentos siguen abajo, uno por uno, con lo suyo.
 */
function SinTotales({ copy, motivo }: { copy: CopyDeLaApp; motivo: string | null }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="font-display text-2xl font-semibold text-ink">{copy.report_no_totals_title}</p>
      <p className="text-sm leading-relaxed text-ink-soft">{motivo ?? copy.report_no_totals_body}</p>
    </div>
  );
}
