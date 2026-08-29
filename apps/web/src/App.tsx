/**
 * Fase 0 — pantalla de fundaciones.
 *
 * No es la app: es la prueba de que el andamiaje está completo. Muestra si el
 * navegador alcanza el backend, si el backend alcanza Firestore y qué versión
 * del catálogo nutricional hay publicada. La Fase 3 reemplaza esta pantalla por
 * la captura de foto.
 */
import { useEffect, useState } from "react";

import { fetchHealth, type HealthReport } from "./lib/api";
import { PROJECT_ID } from "./lib/firebase";

type State =
  | { phase: "checking" }
  | { phase: "ready"; report: HealthReport }
  | { phase: "failed"; message: string };

export default function App() {
  const [state, setState] = useState<State>({ phase: "checking" });

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth(controller.signal)
      .then((report) => setState({ phase: "ready", report }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          phase: "failed",
          message:
            err instanceof Error ? err.message : "No se pudo contactar al backend.",
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-[0.18em] text-accent uppercase">
          Fase 0 · Fundaciones
        </p>
        <h1 className="font-display text-5xl leading-none font-bold tracking-tight text-ink">
          NutriScann
        </h1>
        <p className="text-ink-soft">
          El andamiaje está desplegado. Acá abajo, la prueba de que las piezas se
          hablan entre sí.
        </p>
      </header>

      <section
        aria-live="polite"
        className="rounded-2xl border border-line bg-surface p-5"
      >
        {state.phase === "checking" && (
          <div className="flex items-center gap-3 text-ink-soft">
            <span className="size-2.5 animate-pulse rounded-full bg-accent" />
            Consultando el backend…
          </div>
        )}

        {state.phase === "failed" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="size-2.5 rounded-full bg-protein" />
              <span className="font-medium text-ink">Backend no disponible</span>
            </div>
            <p className="text-sm text-ink-soft">{state.message}</p>
          </div>
        )}

        {state.phase === "ready" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="size-2.5 rounded-full bg-accent" />
              <span className="font-medium text-ink">Todo conectado</span>
              <span className="ml-auto font-mono text-xs text-ink-faint tabular-nums">
                {state.report.latency_ms} ms
              </span>
            </div>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Backend" value={`v${state.report.backend_version}`} />
              <Row label="Región" value={state.report.region} />
              <Row
                label="Configuración"
                value={
                  state.report.config_source === "firestore"
                    ? "Firestore"
                    : "arranque en frío"
                }
              />
              <Row label="Catálogo" value={state.report.kb_status} />
            </dl>
          </div>
        )}
      </section>

      <footer className="font-mono text-xs text-ink-faint">
        {PROJECT_ID} · siguiente: Fase 1, base de conocimiento
      </footer>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0 last:pb-0">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-right font-mono text-ink-soft">{value}</dd>
    </div>
  );
}
