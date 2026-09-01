/**
 * El pie de diagnóstico: lo que quedó de la pantalla de la Fase 0.
 *
 * El health-check sigue vivo —el navegador alcanza el backend, el backend
 * alcanza Firestore, qué catálogo hay publicado— pero ya no es la pantalla: es
 * una línea discreta abajo de todo. Sigue estando porque durante el Q/A local
 * la primera pregunta ante cualquier rareza es "¿contra qué estoy hablando?", y
 * la respuesta tiene que estar a la vista sin abrir la consola.
 *
 * También declara de dónde salieron los textos (Firestore o arranque en frío) y
 * si la app está corriendo contra el FIXTURE en vez del backend — eso último en
 * un tono que no se pueda confundir con un resultado real.
 */
import { useEffect, useState } from "react";

import { fetchHealth, MODO_DE_DEMO, USA_FIXTURE_DE_ANALISIS, type HealthReport } from "../lib/api";
import type { OrigenDeConfig } from "../lib/config";
import { PROJECT_ID, USA_EMULADOR_DE_FIRESTORE, USA_EMULADOR_DE_FUNCIONES } from "../lib/firebase";

type EstadoDeSalud =
  | { fase: "consultando" }
  | { fase: "vivo"; reporte: HealthReport }
  | { fase: "caido"; mensaje: string };

export function PieDeDiagnostico({
  origenDeConfig,
  disclaimer,
}: {
  origenDeConfig: OrigenDeConfig;
  disclaimer: string;
}) {
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

      {/* EL TEXTO LEGAL, ÚLTIMO Y CHICO (card 3.1, pedido de Tomás).
          Va al final de la pantalla —debajo del reporte, de los botones y del
          propio diagnóstico— y en el cuerpo más chico de toda la app: es una
          advertencia que tiene que estar y que nadie tiene que leer para usar
          NutriScann. Que esté siempre y no solo en el reporte es a propósito: la
          app dice números en más de una pantalla. */}
      <p className="mt-1 font-sans text-[0.625rem] leading-relaxed text-ink-faint">{disclaimer}</p>
    </footer>
  );
}
