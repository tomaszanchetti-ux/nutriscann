/**
 * Un alimento del plato, con todo lo que hace falta para creerle al número.
 *
 * El orden no es decorativo: primero QUÉ es, después CUÁNTAS calorías y sus
 * macros, y recién ahí la letra chica de por qué. Un item `no_catalogado` no
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
 *
 * QUÉ SACÓ EL Q/A DE LA WS08 (Tomás, 01/09/2026)
 *
 *   · LOS GRAMOS DEL ÍTEM («380 g» debajo del nombre). El peso lo estima el
 *     modelo mirando una foto: es la entrada de la cuenta, no una medición, y
 *     escrito con esa precisión se leía como si alguien hubiera puesto el plato
 *     en una balanza. Tomás lo consideró arriesgado afirmarlo, y tiene razón.
 *     El número sigue en `item.grams`, sigue siendo lo que multiplica los
 *     valores por 100 g de la ficha y sigue en el expediente — no se muestra.
 *     Las kcal y el P/C/G del ítem se quedan.
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

/**
 * DESDE QUÉ SODIO UN ALIMENTO ES "SALADO": 400 mg por 100 g.
 *
 * NO ES UN NÚMERO NUEVO. Es el `umbral_sodio_mg` de la DT-13
 * (`kb/curation/genericos.dt13.json`), el mismo con el que la curación decide a
 * qué ficha genérica le escribe su caveat de sodio. Se usa el mismo para que la
 * app no tenga dos ideas distintas de qué es mucha sal: si el catálogo avisa por
 * un alimento, la pantalla lo pinta, y al revés.
 *
 * ⚠️ ESTÁ COPIADO, NO IMPORTADO, y eso es una deuda declarada: `apps/web` no
 * compila contra `kb/`, así que subir el umbral a 500 en la curación NO cambia
 * esta constante. Si ese archivo cambia, este número cambia a mano. La alternativa
 * —publicarlo en `config/app`— es la misma mudanza de la DT-22.
 *
 * ⚠️ Y SE MIDE SOBRE `per_100g`, NUNCA SOBRE EL VALOR ESCALADO. Es la diferencia
 * entre "este alimento es salado" y "de este alimento hay mucho en el plato", y
 * el propio fixture tiene el caso que lo demuestra: la brocheta aporta 448 mg al
 * plato y el queso solo 289, pero el salado es el queso (964 mg/100 g contra
 * 312). Juzgar por el valor escalado premiaría a las porciones grandes y dejaría
 * pasar la cucharada de algo muy salado.
 */
const SODIO_ALTO_MG_POR_100G = 400;

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
      {/* El badge va DEBAJO del nombre, no al costado (Q/A de Tomás, 02/09/2026):
          compartiendo renglón, "Coincidencia aproximada" le comía la mitad del
          ancho al título y un nombre de tres palabras se partía en tres líneas. */}
      <div className="flex flex-col items-start gap-2">
        <h3 className="text-lg leading-tight font-medium text-ink">
          {nombre}
          {item.generic && (
            <span className="ml-2 align-middle text-xs font-normal text-carbs">
              {copy.item_generic_badge}
            </span>
          )}
        </h3>
        <BadgeDeMatch copy={copy} tipo={item.match} />
      </div>

      {nutrientes === null ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-ink-soft">
          {item.motivo}
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-sm tabular-nums">
          <span className="whitespace-nowrap text-ink">
            <strong className="text-xl font-semibold">{kcal(nutrientes.kcal)}</strong>
            <span className="ml-1 text-xs text-ink-faint">kcal</span>
          </span>
          {/* Las iniciales quedan en el código a propósito: no son copy, son la
              abreviatura del color que tienen al lado. El nombre entero de cada
              macro sale de `config/app`, arriba, en el donut.

              `whitespace-nowrap` en cada uno: la línea entra de un renglón en un
              móvil normal, y cuando no entra baja ENTERO el valor que sobra. Lo
              que nunca puede pasar es que "812" quede en un renglón y "mg" en el
              siguiente.

              ENTEROS, sin coma (Q/A de Tomás, 02/09/2026): la misma razón que
              `porcentajeEntero` — "23,3" y "63,4" tienen anchos que bailan y en
              el móvil la línea se veía desalineada. El decimal de un gramo no
              cambia ninguna decisión; donde sí importa (el aceite absorbido de
              la letra chica) sigue `gramos()` con su decimal. */}
          <span className="whitespace-nowrap text-protein">P {gramosEnteros(nutrientes.protein_g)} g</span>
          <span className="whitespace-nowrap text-carbs">C {gramosEnteros(nutrientes.carbs_g)} g</span>
          <span className="whitespace-nowrap text-fat">G {gramosEnteros(nutrientes.fat_g)} g</span>
          <Sodio escalado={nutrientes.sodium_mg} por100g={item.per_100g?.sodium_mg ?? null} />
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

/** El aviso del ámbar, local al componente. Español de España. */
const AYUDA_SODIO_ALTO = `Alto en sodio: más de ${SODIO_ALTO_MG_POR_100G} mg por cada 100 g de este alimento.`;

/**
 * EL SODIO DEL ÍTEM, al final de la misma línea de nutrientes.
 *
 * DOS NÚMEROS DISTINTOS, y por eso son dos props:
 *   · `escalado`  — lo que ESTE plato aporta. Es lo que se muestra, y sale del
 *     mismo sitio que las kcal y el P/C/G de al lado.
 *   · `por100g`   — lo que el alimento ES. Es lo único que decide el color.
 *
 * UN `null` NO ES UN CERO, la regla de siempre: si la ficha no declara sodio, no
 * se dibuja nada. No hay "0 mg" ni "sin dato" — en una línea de cinco valores,
 * un hueco explicado es más ruido que hueco, y la ausencia ya se cuenta en el
 * aviso de total parcial del reporte.
 *
 * EL ÁMBAR NO ES UNA ALARMA. Es `--color-carbs`, un tono del sistema, y aparece
 * solo cuando el alimento cruza el umbral: el estado normal es tinta apagada, así
 * que el color se lee como una señal y no como la identidad del valor (la
 * identidad la da el "Na", que está siempre). Sin recuadro, sin ícono y sin
 * leyenda: quien quiera el porqué lo tiene en el `title`.
 */
function Sodio({ escalado, por100g }: { escalado: number | null; por100g: number | null }) {
  if (escalado === null) return null;

  const alto = por100g !== null && por100g >= SODIO_ALTO_MG_POR_100G;

  return (
    <span
      title={alto ? AYUDA_SODIO_ALTO : undefined}
      className={`whitespace-nowrap ${alto ? "font-semibold text-carbs" : "text-ink-faint"}`}
    >
      Na {gramosEnteros(escalado)} mg
    </span>
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
