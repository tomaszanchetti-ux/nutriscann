/**
 * El pie de la app, en DOS piezas que ahora tienen públicos distintos (Q/A de
 * Tomás, WS08).
 *
 * ---------------------------------------------------------------------------
 * `PieLegal` — LO QUE VE EL USUARIO. La advertencia en una línea y el enlace a
 * los Términos y Condiciones, y nada más. Va debajo de la barra de navegación,
 * al final de todas las pantallas: la app dice números en más de una y la
 * advertencia vale para todas. El reparto con la pantalla de T&C está pensado:
 * acá la advertencia en una línea, allá el desarrollo. No se duplica; se
 * continúa.
 *
 * `PieDeDiagnostico` — LO QUE VE QUIEN DESARROLLA, Y SOLO EN DESARROLLO. Es lo
 * que quedó de la pantalla de la Fase 0: contra qué proyecto se está hablando,
 * si el backend y Firestore son los emulados, de dónde salieron los textos, la
 * versión del catálogo y la latencia. Durante el Q/A local la primera pregunta
 * ante cualquier rareza es "¿contra qué estoy hablando?" y la respuesta tiene
 * que estar a la vista sin abrir la consola — pero al usuario esa línea no le
 * dice nada, así que en producción NO SE RENDERIZA. Quien la monta es `App`,
 * detrás de `import.meta.env.DEV`; el componente no decide solo para que la
 * condición se lea en un único sitio, junto al resto de la composición.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from "react";

import { fetchHealth, MODO_DE_DEMO, USA_FIXTURE_DE_ANALISIS, type HealthReport } from "../lib/api";
import { USA_EMULADOR_DE_AUTH } from "../lib/auth";
import type { OrigenDeConfig } from "../lib/config";
import { COPY_TERMINOS } from "../lib/copy.terminos";
import { PROJECT_ID, USA_EMULADOR_DE_FIRESTORE, USA_EMULADOR_DE_FUNCIONES } from "../lib/firebase";

type EstadoDeSalud =
  | { fase: "consultando" }
  | { fase: "vivo"; reporte: HealthReport }
  | { fase: "caido"; mensaje: string };

/**
 * El pie que SÍ ve el usuario: la advertencia chica y el enlace a los T&C.
 *
 * Va después de la barra de navegación y es lo último de la pantalla, en el
 * cuerpo más chico de toda la app: es una advertencia que tiene que estar y que
 * nadie tiene que leer para usar CaliScan.
 */
export function PieLegal({
  disclaimer,
  onVerTerminos,
}: {
  disclaimer: string;
  /**
   * Abre los Términos y Condiciones. `null` = ya se está leyéndolos, y entonces
   * el enlace no se dibuja: un enlace a la pantalla en la que ya estás es ruido.
   */
  onVerTerminos: (() => void) | null;
}) {
  return (
    <footer className="flex flex-col gap-1 pt-3 pb-8">
      <p className="font-sans text-[0.625rem] leading-relaxed text-ink-faint">{disclaimer}</p>

      {/* EL ENLACE A LOS TÉRMINOS (card 3.4). Discreto, pero con área de toque
          real: 44 px de alto, como todo lo que se toca en esta app. Va después
          del disclaimer porque es su continuación, no su encabezado. */}
      {onVerTerminos !== null && (
        <button
          type="button"
          onClick={onVerTerminos}
          className="flex min-h-11 w-fit items-center rounded-lg font-sans text-[0.6875rem] text-ink-faint underline underline-offset-4 transition-colors active:text-ink-soft"
        >
          {COPY_TERMINOS.enlace}
        </button>
      )}
    </footer>
  );
}

export function PieDeDiagnostico({ origenDeConfig }: { origenDeConfig: OrigenDeConfig }) {
  const [salud, setSalud] = useState<EstadoDeSalud>({ fase: "consultando" });

  useEffect(() => {
    const control = new AbortController();
    fetchHealth(control.signal)
      .then((reporte) => setSalud({ fase: "vivo", reporte }))
      .catch((err: unknown) => {
        if (control.signal.aborted) return;
        setSalud({
          fase: "caido",
          mensaje: err instanceof Error ? err.message : "sin respuesta",
        });
      });
    return () => control.abort();
  }, []);

  const destino = USA_EMULADOR_DE_FUNCIONES ? "emulador" : "backend real";
  const config = origenDeConfig === "firestore" ? "Firestore" : "arranque en frío";

  return (
    <footer className="flex flex-col gap-2 border-t border-line pt-4 pb-8 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
      {USA_FIXTURE_DE_ANALISIS && (
        <p className="rounded-lg bg-carbs/10 px-2.5 py-1.5 font-sans text-xs text-carbs">
          Modo fixture (<span className="font-mono">{MODO_DE_DEMO}</span>): lo que ves NO viene del
          backend, es una respuesta guardada. Se apaga quitando{" "}
          <span className="font-mono">VITE_ANALYZE_FIXTURE</span> de{" "}
          <span className="font-mono">apps/web/.env.local</span>.
        </p>
      )}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          aria-hidden="true"
          className={`size-1.5 rounded-full ${
            salud.fase === "vivo"
              ? "bg-accent"
              : salud.fase === "caido"
                ? "bg-protein"
                : "animate-pulse bg-ink-faint"
          }`}
        />
        <span>{PROJECT_ID}</span>
        <span>·</span>
        <span>{destino}</span>
        {USA_EMULADOR_DE_FIRESTORE && (
          <>
            <span>·</span>
            <span>Firestore emulado</span>
          </>
        )}
        {/* La card 4.1 apaga la banda amarilla que el SDK de Auth clava abajo de
            todo —tapa la barra de navegación justo en el Q/A visual del móvil—,
            así que el aviso de "estás contra el emulador" vive acá, con los otros
            dos. */}
        {USA_EMULADOR_DE_AUTH && (
          <>
            <span>·</span>
            <span>Auth emulado</span>
          </>
        )}
        <span>·</span>
        <span>textos: {config}</span>
        {salud.fase === "vivo" && (
          <>
            <span>·</span>
            <span>
              backend v{salud.reporte.backend_version} · catálogo {salud.reporte.kb_status} ·{" "}
              {salud.reporte.latency_ms} ms
            </span>
          </>
        )}
        {salud.fase === "caido" && (
          <>
            <span>·</span>
            <span className="text-protein">backend sin respuesta</span>
          </>
        )}
      </p>
    </footer>
  );
}
