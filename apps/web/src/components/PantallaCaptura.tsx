/**
 * Pantalla 1 — la captura. Un botón grande y nada más.
 *
 * `capture="environment"` en un `<input type="file">` es lo que abre la cámara
 * trasera del teléfono directamente; en un escritorio el mismo control abre el
 * selector de archivos, que es exactamente lo que hace falta para el Q/A visual
 * con fotos guardadas. Un solo control para los dos casos, sin ramas.
 *
 * TODO el copy sale de `config/app`. La línea que cierra la promesa debajo del
 * círculo —«Y obtén el detalle nutricional de tu comida», Q/A de Tomás en la
 * WS08— vivía escrita acá porque la lista de claves no se podía ampliar sin
 * tocar el seed; la card 4.5 la amplió y la línea se mudó a `capture_tagline`
 * (DT-41 b). Esta pantalla ya no tiene ni un texto propio.
 */
import { useRef } from "react";

import type { CopyDeLaApp } from "../lib/config";

export interface PantallaCapturaProps {
  copy: CopyDeLaApp;
  onFoto: (archivo: File) => void;
}

export function PantallaCaptura({ copy, onFoto }: PantallaCapturaProps) {
  const entrada = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-1 flex-col justify-center gap-10 py-10">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="font-display text-4xl leading-tight font-bold text-balance text-ink">
          {copy.capture_prompt}
        </h1>
        <p className="text-ink-soft text-pretty">{copy.capture_help}</p>
      </header>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="flex size-44 flex-col items-center justify-center gap-3 rounded-full bg-accent text-ground shadow-lg shadow-accent/20 transition-transform active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="size-12" fill="none" aria-hidden="true">
            <path
              d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2a1 1 0 0 0 .84-.46l.92-1.42A1 1 0 0 1 10.3 3.7h3.4a1 1 0 0 1 .84.42l.92 1.42a1 1 0 0 0 .84.46h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="12.2" r="3.4" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span className="max-w-[8rem] text-sm leading-snug font-semibold text-balance">
            {copy.capture_cta}
          </span>
        </button>

        {/* Debajo del círculo, no encima: primero se ve qué hay que tocar y
            después qué se obtiene por tocarlo. */}
        <p className="max-w-[18rem] text-center leading-relaxed text-balance text-ink-soft">
          {copy.capture_tagline}
        </p>

        <input
          ref={entrada}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0];
            // El valor se limpia para que elegir DOS VECES la misma foto vuelva
            // a disparar el change: sin esto, reintentar con la misma imagen no
            // hace nada y parece que la app se colgó.
            evento.target.value = "";
            if (archivo) onFoto(archivo);
          }}
        />
      </div>
    </div>
  );
}
