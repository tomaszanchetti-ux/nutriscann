/**
 * La espera — versión MÍNIMA.
 *
 * La animación cinematográfica del `docs/PLAN.md` §4 (la línea de luz barriendo
 * la foto, la retícula, los puntos de detección) es de la Fase 3. Acá hay lo
 * indispensable para que el Q/A visual no mire una pantalla muerta: la foto de
 * fondo y los `scanning_steps` rotando como texto.
 *
 * Los pasos son VERDAD, no decoración: vienen de `config/app` y describen lo que
 * el backend está haciendo de verdad (visión → catálogo → aritmética). Rotan por
 * tiempo porque el backend no emite progreso — cuando lo emita, este componente
 * cambia de fuente sin cambiar de forma.
 */
import { useEffect, useState } from "react";

/** Cuánto dura cada micro-texto antes de pasar al siguiente. */
const DURACION_DEL_PASO_MS = 1800;

export interface PantallaEscaneoProps {
  titulo: string;
  pasos: string[];
  /** `blob:` de la foto elegida, para que se vea qué se está analizando. */
  vistaPrevia: string | null;
}

export function PantallaEscaneo({ titulo, pasos, vistaPrevia }: PantallaEscaneoProps) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (pasos.length <= 1) return;
    const reloj = window.setInterval(() => {
      // Se FRENA en el último y no vuelve a empezar: un ciclo que reinicia dice
      // "esto no avanza", que es justo lo contrario de lo que pasa.
      setIndice((actual) => Math.min(actual + 1, pasos.length - 1));
    }, DURACION_DEL_PASO_MS);
    return () => window.clearInterval(reloj);
  }, [pasos.length]);

  return (
    <div className="flex flex-1 flex-col justify-center gap-8 py-10">
      <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-3xl border border-line bg-surface">
        {vistaPrevia !== null && (
          <img
            src={vistaPrevia}
            alt="La foto que se está analizando"
            className="size-full object-cover opacity-70"
          />
        )}
        <div className="absolute inset-x-0 top-0 h-1 animate-pulse bg-accent/70" />
      </div>

      <div className="flex flex-col items-center gap-3 text-center" aria-live="polite">
        <h1 className="font-display text-2xl font-semibold text-ink">{titulo}</h1>
        <p className="min-h-6 text-ink-soft">{pasos[indice] ?? pasos[0]}</p>
        <div className="flex gap-1.5" aria-hidden="true">
          {pasos.map((paso, i) => (
            <span
              key={paso}
              className={`h-1 w-8 rounded-full transition-colors ${
                i <= indice ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
