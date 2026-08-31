/**
 * Un alimento del plato, con todo lo que hace falta para creerle al número.
 *
 * El orden no es decorativo: primero QUÉ es y CUÁNTO pesa, después CUÁNTAS
 * calorías, y recién ahí la letra chica de por qué. Un item `no_catalogado` no
 * muestra números —no los tiene— y muestra su explicación en el mismo lugar
 * donde los otros muestran las calorías, para que el hueco se lea como una
 * decisión y no como una falla de la pantalla.
 */
import { confianza, gramos, gramosEnteros, kcal, nivelDeConfianza } from "../lib/formato";
import type { EngineItem } from "../lib/types";
import { BadgeDeMatch } from "./BadgeDeMatch";

const COLOR_DE_CONFIANZA = {
  alta: "text-accent",
  media: "text-carbs",
  baja: "text-protein",
} as const;

/** Primera letra en mayúscula, sin tocar el resto (los nombres traen siglas). */
function enMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function ItemDelPlato({ item }: { item: EngineItem }) {
  // Sin ficha no hay nombre en español: se muestra el término que emitió la
  // visión, en inglés, con la primera en mayúscula para que no parezca un
  // pedazo de log. Que un compuesto se lea en inglés es un hueco REAL del
  // contrato, no de esta pantalla — está declarado en el informe de la card.
  const nombre = item.name_es ?? enMayuscula(item.termino_en);
  const nivel = nivelDeConfianza(item.confidence);
  const nutrientes = item.nutrients;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-lg leading-tight font-medium text-ink">
            {nombre}
            {item.generic && (
              <span className="ml-2 align-middle text-xs font-normal text-carbs">genérico</span>
            )}
          </h3>
          <p className="font-mono text-xs text-ink-faint tabular-nums">
            {gramosEnteros(item.grams)} g
          </p>
          {item.name_es !== null && item.name_en !== null && item.name_en !== item.name_es && (
            <p className="text-xs text-ink-faint">ficha «{item.name_en}»</p>
          )}
        </div>
        <BadgeDeMatch tipo={item.match} />
      </div>

      {nutrientes === null ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-ink-soft">
          {item.motivo}
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-sm tabular-nums">
          <span className="text-ink">
            <strong className="text-xl font-semibold">{kcal(nutrientes.kcal)}</strong>
            <span className="ml-1 text-xs text-ink-faint">kcal</span>
          </span>
          <span className="text-protein">P {gramos(nutrientes.protein_g)} g</span>
          <span className="text-carbs">C {gramos(nutrientes.carbs_g)} g</span>
          <span className="text-fat">G {gramos(nutrientes.fat_g)} g</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-line pt-3">
        <span className="text-xs text-ink-faint">Confianza</span>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, Math.round(item.confidence * 100))}%`,
              backgroundColor:
                nivel === "alta"
                  ? "var(--color-accent)"
                  : nivel === "media"
                    ? "var(--color-carbs)"
                    : "var(--color-protein)",
            }}
          />
        </div>
        <span className={`font-mono text-xs tabular-nums ${COLOR_DE_CONFIANZA[nivel]}`}>
          {confianza(item.confidence)}
        </span>
        {/* Las dos mitades, en su propia línea: en 375 px no entran al lado de
            la barra sin partirse el porcentaje en dos renglones. */}
        <span className="w-full font-mono text-[0.6875rem] text-ink-faint">
          visión {confianza(item.confidence_vision)} × ficha {confianza(item.confidence_match)}
        </span>
      </div>

      <LetraChica item={item} />
    </li>
  );
}

/**
 * La letra chica: lo que la ficha declara que NO sabe.
 *
 * Va desplegada y no detrás de un "ver más" a propósito. Un caveat que hay que
 * ir a buscar es un caveat que nadie lee, y el más largo de todos —el de la
 * tortilla de patatas, cinco líneas— es justamente el que más cambia lo que el
 * número significa.
 */
function LetraChica({ item }: { item: EngineItem }) {
  const caveats = item.caveats ?? [];
  const avisos: string[] = [];

  // El aviso de genérico se agrega SOLO si la ficha no lo trae ya. El build del
  // catálogo se lo escribe a 101 de las 339 fichas genéricas (la regla de sodio
  // alto de la DT-13), así que sin este chequeo esas 101 lo dicen dos veces
  // seguidas y la letra chica pierde el poco crédito que tiene.
  const yaLoDice = caveats.some((c) => c.trimStart().toLowerCase().startsWith("ficha genérica"));
  if (item.generic === true && !yaLoDice) {
    avisos.push(
      "Ficha genérica: el valor es el promedio de una familia de productos, no la medición de este plato.",
    );
  }
  for (const caveat of caveats) avisos.push(caveat);
  if (item.composicion) {
    const componentes = item.composicion.componentes
      .map((c) => `${c.name_es ?? c.termino_en} ${gramosEnteros(c.grams)} g`)
      .join(" · ");
    avisos.push(
      `Compuesto con el método «${item.composicion.metodo}»: ${componentes}. ` +
        `Entraron ${gramosEnteros(item.composicion.peso_entrada_g)} g y quedaron ` +
        `${gramosEnteros(item.composicion.peso_final_g)} g` +
        (item.composicion.aceite_absorbido_g > 0
          ? `, con ${gramos(item.composicion.aceite_absorbido_g)} g de aceite absorbido.`
          : "."),
    );
  }

  if (avisos.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-ink-faint">
      {avisos.map((aviso, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden="true" className="text-ink-faint">
            ·
          </span>
          <span>{aviso}</span>
        </li>
      ))}
      {item.source_ref !== null && (
        <li className="flex gap-2 pt-1">
          <span aria-hidden="true">·</span>
          <span className="font-mono">Fuente: {item.source_ref}</span>
        </li>
      )}
    </ul>
  );
}
