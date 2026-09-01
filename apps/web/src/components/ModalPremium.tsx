/**
 * El modal que explica una funcionalidad bloqueada (card 3.3).
 *
 * SIMPLE A PROPÓSITO: no hay librería de diálogos, no hay portal y no hay
 * animación de entrada. Es una capa fija, un panel y dos salidas. La regla de
 * "cero dependencias nuevas" del proyecto vale también para esto.
 *
 * Lo que sí tiene, porque es lo que hace que un diálogo sea un diálogo:
 *   · `role="dialog"` + `aria-modal` + título asociado por `aria-labelledby`,
 *   · Escape cierra,
 *   · tocar el fondo cierra (y tocar el panel NO, por eso el stopPropagation),
 *   · el foco entra al panel al abrirse, así el lector de pantalla lee esto y
 *     no lo que quedó detrás,
 *   · el cuerpo de la página no hace scroll mientras el modal está abierto.
 *
 * No atrapa el foco en un ciclo (focus trap): con dos botones y un aspa, la
 * tabulación se sale del panel en tres pulsaciones y vuelve a entrar en otras
 * tres. Un ciclo hecho a mano acá sería más código del que resuelve.
 */
import { useEffect, useRef } from "react";

import { COPY_MODAL_PREMIUM } from "../lib/copy.premium";

export interface ModalPremiumProps {
  /** El nombre de la funcionalidad que se tocó. El modal no es genérico. */
  funcionalidad: string;
  /** Qué plan la abre, para no obligar a ir a la otra pantalla a averiguarlo. */
  plan: string;
  onCerrar: () => void;
  onVerPlanes: () => void;
}

export function ModalPremium({ funcionalidad, plan, onCerrar, onVerPlanes }: ModalPremiumProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alTeclado);
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", alTeclado);
      document.body.style.overflow = scrollPrevio;
    };
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ground/80 px-5 py-6 backdrop-blur-sm sm:items-center"
      onClick={onCerrar}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-premium-titulo"
        tabIndex={-1}
        onClick={(evento) => evento.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-line bg-surface p-6 shadow-2xl shadow-ground/60 outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide text-accent uppercase">
              <IconoCandado className="size-3" />
              {plan}
            </span>
            <h2
              id="modal-premium-titulo"
              className="font-display text-2xl leading-tight font-bold text-ink"
            >
              {COPY_MODAL_PREMIUM.titulo}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={COPY_MODAL_PREMIUM.aria_cerrar}
            className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors active:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <p className="leading-relaxed text-pretty text-ink-soft">
          {COPY_MODAL_PREMIUM.cuerpo(funcionalidad)}
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onVerPlanes}
            className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-ground transition-transform active:scale-[0.98]"
          >
            {COPY_MODAL_PREMIUM.cta}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="mx-auto rounded-xl px-4 py-2 text-sm font-medium text-ink-soft underline underline-offset-4 transition-colors active:text-ink"
          >
            {COPY_MODAL_PREMIUM.cerrar}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * El candadito. Vive acá y no en un archivo de íconos porque lo usan dos
 * pantallas y el modal, y todavía no hay un tercer ícono que justifique el
 * archivo.
 */
export function IconoCandado({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect
        x="4.75"
        y="10.25"
        width="14.5"
        height="9.5"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8.25 10V7.75a3.75 3.75 0 0 1 7.5 0V10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
