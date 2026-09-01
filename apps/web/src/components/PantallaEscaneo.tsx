/**
 * La espera — y la espera ES el show (card 3.2, §4 del plan).
 *
 * Tres piezas: la foto con el scanner (`ScannerDeFoto`), los micro-textos que
 * rotan y una barra de tres tramos. Nada de esto es relleno para tapar una
 * latencia: los tres textos son los TRES PASOS REALES del motor, en su orden
 * real, y salen de `config/app` (regla dura n.º 1 — se cambian sin desplegar).
 *
 * LOS PASOS, contra el código que los ejecuta (`functions/src/analyze/handler.ts`
 * §"EL CIRCUITO" y `functions/src/engine/analyze.ts`):
 *
 *   1. VISIÓN — `pedirVision()`: la ÚNICA llamada al modelo. Devuelve qué hay en
 *      el plato y cuántos gramos de cada cosa; su schema NO tiene calorías.
 *   2. CATÁLOGO — `analizarEscaneo()` → `buscarConDosNombres()`: cada alimento
 *      se busca en la base (exacto → alias → difuso, en español y en inglés).
 *   3. ARITMÉTICA — `escalar()` + `sumarTotales()`: gramos × valores por 100 g de
 *      la ficha, y la compuerta de confianza que decide si hay total o no.
 *
 * POR QUÉ EL PRIMER PASO DURA MUCHO MÁS QUE LOS OTROS DOS. El backend no emite
 * progreso: manda una sola respuesta al final. Entonces la rotación es por
 * tiempo — pero no por tiempos iguales, porque el reparto real está MEDIDO (el
 * E2E de la WS05 y el `model_latency_ms` que la respuesta estampa al lado del
 * `latency_ms`): casi toda la espera se va en la llamada al modelo, y los pasos
 * 2 y 3 son aritmética que tarda milisegundos. Repartir el tiempo en tres partes
 * iguales dibujaría un progreso que no existe. El día que el backend emita
 * progreso, este componente cambia de fuente sin cambiar de forma.
 *
 * Y el último paso NO reinicia el ciclo: se queda ahí. Una rotación que vuelve a
 * empezar dice "esto no avanza", que es lo contrario de lo que está pasando.
 */
import { useEffect, useState } from "react";

import { ScannerDeFoto } from "./ScannerDeFoto";

/**
 * Cuánto se muestra el paso de la visión. Es el orden de magnitud MEDIDO de la
 * llamada al modelo, no un número redondo elegido a ojo.
 */
export const DURACION_DEL_PASO_DE_VISION_MS = 3200;

/** Cuánto se muestra cada paso posterior (el determinístico: matching y cuentas). */
export const DURACION_DE_PASO_CORTO_MS = 1200;

/** Cuánto dura en pantalla el paso número `indice`. */
export function duracionDelPaso(indice: number): number {
  return indice === 0 ? DURACION_DEL_PASO_DE_VISION_MS : DURACION_DE_PASO_CORTO_MS;
}

/**
 * En qué tramo de la espera estamos.
 *
 * `preparando` es de este lado: achicar la foto y pasarla a base64
 * (`lib/imagen.ts`). `analizando` empieza cuando el POST sale de verdad. Se
 * separan porque durante el primero NINGUNO de los tres pasos está ocurriendo, y
 * mostrar "Identificando…" antes de haber mandado la foto sería el primer texto
 * falso de la pantalla.
 */
export type FaseDeEscaneo = "preparando" | "analizando";

export interface PantallaEscaneoProps {
  titulo: string;
  pasos: string[];
  /** `blob:` de la foto elegida, para que se vea qué se está analizando. */
  vistaPrevia: string | null;
  fase: FaseDeEscaneo;
}

export function PantallaEscaneo({ titulo, pasos, vistaPrevia, fase }: PantallaEscaneoProps) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (fase !== "analizando") {
      setIndice(0);
      return;
    }
    if (pasos.length <= 1) return;

    let cancelado = false;
    let reloj = 0;
    // Una cadena de `setTimeout` y no un `setInterval`: cada paso dura lo suyo.
    const programar = (actual: number) => {
      if (actual >= pasos.length - 1) return;
      reloj = window.setTimeout(() => {
        if (cancelado) return;
        setIndice(actual + 1);
        programar(actual + 1);
      }, duracionDelPaso(actual));
    };
    programar(0);

    return () => {
      cancelado = true;
      window.clearTimeout(reloj);
    };
  }, [fase, pasos.length]);

  const analizando = fase === "analizando";
  const textoDelPaso = pasos[indice] ?? pasos[0] ?? null;

  return (
    <div className="flex flex-1 flex-col justify-center gap-8 py-10">
      <ScannerDeFoto vistaPrevia={vistaPrevia} barriendo={analizando} />

      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">{titulo}</h1>

        {/* La región viva se queda MONTADA y solo cambia de contenido: así el
            lector de pantalla anuncia el paso nuevo en vez de la pantalla
            entera. El alto mínimo reserva el renglón para que el título no
            salte cuando aparece el primer texto. */}
        <p className="min-h-6 text-ink-soft" role="status" aria-live="polite">
          {analizando && textoDelPaso !== null && (
            <span key={indice} className="escaneo-texto inline-block">
              {textoDelPaso}
            </span>
          )}
        </p>

        <div className="flex gap-1.5" aria-hidden="true">
          {pasos.map((paso, i) => (
            // La clave lleva el índice: dos pasos publicados con el mismo texto
            // son un error de configuración, no un motivo para que React se
            // queje de claves repetidas encima.
            <span
              key={`${i}-${paso}`}
              className={`h-1 w-8 rounded-full transition-colors ${
                !analizando
                  ? "bg-line"
                  : i < indice
                    ? "bg-accent-deep"
                    : i === indice
                      ? "bg-accent"
                      : "bg-line"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
