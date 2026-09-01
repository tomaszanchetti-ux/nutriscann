/**
 * Un alimento del plato, con todo lo que hace falta para creerle al número.
 *
 * El orden no es decorativo: primero QUÉ es y CUÁNTO pesa, después CUÁNTAS
 * calorías, y recién ahí la letra chica de por qué. Un item `no_catalogado` no
 * muestra números —no los tiene— y muestra su explicación en el mismo lugar
 * donde los otros muestran las calorías, para que el hueco se lea como una
 * decisión y no como una falla de la pantalla.
 *
 * ---------------------------------------------------------------------------
 * QUÉ SACÓ LA CARD 3.1 (pedido de Tomás; del resto, palabras textuales: "golazo")
 *
 *   · LA LÍNEA «ficha "Cheese, NFS"». La palabra "ficha" es jerga nuestra: el
 *     usuario no sabe qué es una ficha, y el nombre en inglés del catálogo no le
 *     dice nada que ya no diga el nombre en español de arriba. La trazabilidad
 *     no se pierde: sigue entera en la línea de fuente de la letra chica, que es
 *     donde vive el dato que sí se puede seguir (USDA #…).
 *   · LA LÍNEA «visión 92 % × ficha 100 %». Las dos mitades de la confianza son
 *     una herramienta de auditoría, no información de producto: quien lee el
 *     reporte necesita saber cuánto creerle al número, y eso ya lo dice la barra
 *     de confianza con su porcentaje y su color. Los dos factores siguen
 *     viajando en el payload (`confidence_vision`, `confidence_match`) y siguen
 *     en el expediente: se sacaron de la PANTALLA, no del contrato.
 * ------------------------------------------------------------------------- */
import type { CopyDeLaApp } from "../lib/config";
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

/**
 * Cómo se llama este alimento en la pantalla, en el mejor español disponible.
 *
 * Tres escalones, y el del medio es nuevo (DT-25): el nombre de la ficha, el
 * término que la visión dijo EN ESPAÑOL, y recién al final el inglés. Hasta que
 * el motor empezó a guardar `termino_es`, un alimento sin ficha se mostraba
 * siempre en inglés —"Picos camperos" salía como el modelo lo hubiera escrito en
 * su idioma de trabajo— porque era lo único que llegaba.
 */
function nombreDelItem(item: EngineItem): string {
  if (item.name_es !== null) return item.name_es;
  const enEspañol = item.termino_es.trim();
  return enMayuscula(enEspañol !== "" ? enEspañol : item.termino_en);
}

export function ItemDelPlato({ copy, item }: { copy: CopyDeLaApp; item: EngineItem }) {
  const nombre = nombreDelItem(item);
  const nivel = nivelDeConfianza(item.confidence);
  const nutrientes = item.nutrients;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-lg leading-tight font-medium text-ink">
            {nombre}
            {item.generic && (
              <span className="ml-2 align-middle text-xs font-normal text-carbs">
                {copy.item_generic_badge}
              </span>
            )}
          </h3>
          <p className="font-mono text-xs text-ink-faint tabular-nums">
            {gramosEnteros(item.grams)} g
          </p>
        </div>
        <BadgeDeMatch copy={copy} tipo={item.match} />
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
          {/* Las tres iniciales quedan en el código a propósito: no son copy,
              son la abreviatura del color que tienen al lado. El nombre entero
              de cada macro sale de `config/app`, arriba, en el donut. */}
          <span className="text-protein">P {gramos(nutrientes.protein_g)} g</span>
          <span className="text-carbs">C {gramos(nutrientes.carbs_g)} g</span>
          <span className="text-fat">G {gramos(nutrientes.fat_g)} g</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-line pt-3">
        <span className="text-xs text-ink-faint">{copy.item_confidence_label}</span>
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
      </div>

      <LetraChica copy={copy} item={item} />
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
function LetraChica({ copy, item }: { copy: CopyDeLaApp; item: EngineItem }) {
  const caveats = item.caveats ?? [];
  const avisos: string[] = [];

  // El aviso de genérico se agrega SOLO si la ficha no lo trae ya. El build del
  // catálogo se lo escribe a 101 de las 339 fichas genéricas (la regla de sodio
  // alto de la DT-13), así que sin este chequeo esas 101 lo dicen dos veces
  // seguidas y la letra chica pierde el poco crédito que tiene.
  const yaLoDice = caveats.some((c) => c.trimStart().toLowerCase().startsWith("ficha genérica"));
  if (item.generic === true && !yaLoDice) {
    avisos.push(copy.item_generic_note);
  }
  for (const caveat of caveats) avisos.push(caveat);
  if (item.composicion) {
    // Esta frase se ARMA CON DATOS —enumera los ingredientes y sus gramos— y por
    // eso se queda en el código: `config/app.copy` es un mapa de texto a texto y
    // no tiene convención de placeholders. Está declarado en `dt22_note` de
    // `config/copy.json`.
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
          <span className="font-mono">
            {copy.item_source_label}: {item.source_ref}
          </span>
        </li>
      )}
    </ul>
  );
}
