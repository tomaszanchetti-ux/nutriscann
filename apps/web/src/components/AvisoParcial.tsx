/**
 * El aviso de que el total no es todo el plato.
 *
 * Aparece solo cuando `totals.completo === false`, y dice las dos cosas que
 * faltan por separado, porque son distintas:
 *
 *   · ITEMS SIN DATOS — hay comida en el plato que no entró a la suma. Las
 *     calorías de arriba son de menos.
 *   · OPCIONALES AUSENTES — el sodio, los azúcares o las saturadas no se pueden
 *     sumar porque alguna ficha no los declara. `null` no es cero, y por eso el
 *     motor manda el motivo escrito: se muestra ESE, no uno redactado acá.
 *
 * El texto de encabezado sale de `config/app` (`report_partial_title`) y los
 * nombres de los cuatro opcionales también, desde la card 3.1 (DT-22): son las
 * MISMAS claves que usan el donut y el segundo recuadro, así que un nutriente se
 * llama igual en toda la app o no se llama igual en ninguna parte.
 *
 * El cuerpo, en cambio, se arma con los datos —cuenta ítems y gramos— y por eso
 * se queda en el código: `config/app.copy` es un mapa de texto a texto y no
 * tiene convención de placeholders. Está declarado en `dt22_note`.
 */
import type { CopyDeLaApp } from "../lib/config";
import { gramosEnteros } from "../lib/formato";
import type { EngineTotals, OpcionalAusente } from "../lib/types";

/** La clave de `config/app` con la que se nombra cada opcional ausente. */
const NOMBRE_DEL_OPCIONAL: Record<OpcionalAusente, keyof CopyDeLaApp> = {
  fiber_g: "nutrient_fiber",
  sat_fat_g: "nutrient_sat_fat",
  sugars_g: "nutrient_sugars",
  sodium_mg: "nutrient_sodium",
};

export function AvisoParcial({
  copy,
  totals,
  titulo,
}: {
  copy: CopyDeLaApp;
  totals: EngineTotals;
  titulo: string;
}) {
  const ausentes = Object.entries(totals.opcionales_ausentes) as [OpcionalAusente, string][];
  const totalDeItems = totals.items_incluidos + totals.items_sin_datos;
  const gramosFuera = totals.grams_total - totals.grams_cuantificados;

  if (totals.completo && ausentes.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-carbs/30 bg-carbs/5 p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium text-carbs">
        <span aria-hidden="true">⚠</span>
        {titulo}
      </h2>

      {totals.items_sin_datos > 0 && (
        <p className="text-sm leading-relaxed text-ink-soft">
          Entraron a la suma <strong className="text-ink">{totals.items_incluidos}</strong> de{" "}
          <strong className="text-ink">{totalDeItems}</strong> alimentos
          {gramosFuera > 0.5 && (
            <>
              : quedaron fuera{" "}
              <strong className="text-ink">{gramosEnteros(gramosFuera)} g</strong> del plato
            </>
          )}
          . Las calorías de arriba son las de lo que sí se pudo medir, no las del plato entero.
        </p>
      )}

      {ausentes.length > 0 && (
        <ul className="flex flex-col gap-2 text-xs leading-relaxed text-ink-faint">
          {ausentes.map(([clave, motivo]) => (
            <li key={clave}>
              <strong className="font-medium text-ink-soft">
                {copy[NOMBRE_DEL_OPCIONAL[clave]]}:
              </strong>{" "}
              {motivo}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
