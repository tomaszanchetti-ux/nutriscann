/**
 * Las dos pantallas que no son ni captura ni reporte: el error y el "esto no es
 * comida". Comparten forma porque son la misma cosa desde el lado del usuario —
 * no hay reporte, hay una explicación y una salida.
 *
 * Todo el texto sale de `config/app`. El único que NO sale de ahí es el mensaje
 * del backend (`message_es`), que ya viene en español y explica el caso puntual:
 * escribir otro acá encima taparía el que sabe qué pasó.
 */
import type { CopyDeLaApp } from "../lib/config";

export interface PantallaMensajeProps {
  titulo: string;
  detalle: string;
  /** El `error.code` del backend, cuando hubo. Se muestra chiquito, para el Q/A. */
  codigo?: string | null;
  cta: string;
  onCta: () => void;
  tono: "error" | "neutro";
}

export function PantallaMensaje({
  titulo,
  detalle,
  codigo,
  cta,
  onCta,
  tono,
}: PantallaMensajeProps) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-8 py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <span
          aria-hidden="true"
          className={`flex size-16 items-center justify-center rounded-full text-3xl ${
            tono === "error" ? "bg-protein/15" : "bg-accent-soft"
          }`}
        >
          {tono === "error" ? "!" : "🍽"}
        </span>
        <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">
          {titulo}
        </h1>
        <p className="max-w-sm leading-relaxed text-pretty text-ink-soft">{detalle}</p>
        {codigo != null && codigo !== "" && (
          <p className="font-mono text-xs text-ink-faint">código: {codigo}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onCta}
        className="mx-auto w-full max-w-xs rounded-2xl bg-accent px-6 py-4 font-semibold text-ground transition-transform active:scale-[0.98]"
      >
        {cta}
      </button>
    </div>
  );
}

/**
 * El caso `is_food: false`: sin números, sin drama y con la salida a mano.
 *
 * `mensajeDelBackend` es el `message_es` que redacta el endpoint, y gana sobre
 * el texto de `config/app`: es el que puede decir algo del caso puntual. El de
 * config queda de respaldo para cuando no venga.
 */
export function PantallaNoEsComida({
  copy,
  mensajeDelBackend,
  onReintentar,
}: {
  copy: CopyDeLaApp;
  mensajeDelBackend?: string;
  onReintentar: () => void;
}) {
  return (
    <PantallaMensaje
      tono="neutro"
      titulo={copy.not_food_title}
      detalle={mensajeDelBackend ?? copy.error_not_food}
      cta={copy.report_cta}
      onCta={onReintentar}
    />
  );
}
