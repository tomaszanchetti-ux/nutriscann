/**
 * El aviso de instalación de la PWA (Q/A de Tomás, 02/09/2026 — card 3.5).
 *
 * CaliScan no está en ninguna tienda a propósito (decisión D1: cero fricción),
 * y el precio de esa decisión es que instalarla hay que CONTARLA: Safari en
 * iOS no ofrece instalar una web app por su cuenta jamás, y Chrome en Android
 * solo lo ofrece si alguien se lo pide. Este aviso es esa conversación, una
 * sola vez, en la pantalla de captura — donde el usuario todavía no está
 * mirando su plato.
 *
 * TRES ESTADOS, y en dos de ellos el componente NO EXISTE:
 *
 *   · YA INSTALADA (display-mode standalone, o el `navigator.standalone` de
 *     iOS): no se dibuja nada. Recordarle la instalación al que ya instaló es
 *     el clásico banner zombie.
 *   · DESCARTADA: la X guarda una marca en localStorage y el aviso no vuelve.
 *     Un aviso que reaparece en cada visita deja de ser una ayuda y pasa a ser
 *     un peaje; quien lo cerró y se arrepiente tiene el gesto de Safari a un
 *     Compartir de distancia igual.
 *   · VISIBLE: en iOS es texto —el gesto no se puede automatizar, solo
 *     explicar—; en Android es el botón nativo, que aparece únicamente si el
 *     navegador entregó su `beforeinstallprompt` (sin ese evento el botón
 *     sería una promesa que no podemos cumplir, así que no se muestra).
 *
 * Los textos salen de `config/app` (claves `install_*`), como todo lo que el
 * usuario lee. La detección de iOS por user-agent es deliberadamente boba:
 * para elegir entre EXPLICAR un gesto u OFRECER un botón alcanza, y el caso
 * ambiguo (iPad con UA de escritorio) degrada a no mostrar nada — molestar de
 * menos, nunca de más.
 */
import { useEffect, useState } from "react";

import type { CopyDeLaApp } from "../lib/config";

/** La marca del descarte. Versionada por si el aviso cambia y amerita volver. */
const CLAVE_DESCARTE = "caliscan.instalacion.descartada.v1";

/** El evento que Chrome entrega para poder ofrecer la instalación nativa. */
interface EventoDeInstalacion extends Event {
  prompt: () => Promise<void>;
}

function yaEstaInstalada(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // El `standalone` de iOS: no está en el tipo Navigator porque es de Safari.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function fueDescartado(): boolean {
  try {
    return localStorage.getItem(CLAVE_DESCARTE) === "si";
  } catch {
    // localStorage puede no estar (navegación privada estricta): sin memoria
    // del descarte, mejor mostrar el aviso que romper la pantalla.
    return false;
  }
}

function esIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function AvisoDeInstalacion({ copy }: { copy: CopyDeLaApp }) {
  const [visible, setVisible] = useState(() => !yaEstaInstalada() && !fueDescartado());
  const [eventoAndroid, setEventoAndroid] = useState<EventoDeInstalacion | null>(null);

  useEffect(() => {
    function capturar(evento: Event) {
      // Chrome lo dispararía como un mini-banner propio; se retiene para
      // ofrecerlo desde nuestro botón, en nuestro momento.
      evento.preventDefault();
      setEventoAndroid(evento as EventoDeInstalacion);
    }
    window.addEventListener("beforeinstallprompt", capturar);
    return () => window.removeEventListener("beforeinstallprompt", capturar);
  }, []);

  if (!visible) return null;

  const ios = esIOS();
  // Ni gesto que explicar ni botón que ofrecer: no hay aviso que valga.
  if (!ios && eventoAndroid === null) return null;

  function descartar() {
    try {
      localStorage.setItem(CLAVE_DESCARTE, "si");
    } catch {
      // Sin localStorage el descarte dura la sesión: suficiente.
    }
    setVisible(false);
  }

  return (
    <aside className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm leading-tight font-semibold text-ink">{copy.install_title}</p>
        {ios ? (
          <p className="text-xs leading-relaxed text-ink-soft">{copy.install_ios_help}</p>
        ) : (
          <button
            type="button"
            onClick={() => void eventoAndroid?.prompt()}
            className="self-start rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-ground transition-transform active:scale-[0.98]"
          >
            {copy.install_android_cta}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={descartar}
        aria-label="Cerrar el aviso de instalación"
        className="shrink-0 p-1 text-ink-faint"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M3 3l10 10M13 3L3 13"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </aside>
  );
}
