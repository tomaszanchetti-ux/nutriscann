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
 * El texto de encabezado sale de `config/app` (`reporte_parcial_titulo`); el
 * cuerpo se arma con los datos, porque son datos.
 */
import { gramosEnteros } from "../lib/formato";
import type { EngineTotals, OpcionalAusente } from "../lib/types";

const NOMBRE_DEL_OPCIONAL: Record<OpcionalAusente, string> = {
  fiber_g: "Fibra",
  sat_fat_g: "Grasas saturadas",
  sugars_g: "Azúcares",
  sodium_mg: "Sodio",
};

export function AvisoParcial({ totals, titulo }: { totals: EngineTotals; titulo: string }) {
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
              <strong className="font-medium text-ink-soft">{NOMBRE_DEL_OPCIONAL[clave]}:</strong>{" "}
              {motivo}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
