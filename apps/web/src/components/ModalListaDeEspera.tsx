/**
 * El formulario de la lista de espera (WS08).
 *
 * Hermano de `ModalPremium` y con la misma mecánica —capa fija, panel, Escape
 * cierra, el fondo cierra, el foco entra al panel, el cuerpo no hace scroll—,
 * porque son el mismo objeto de la interfaz y tienen que comportarse igual. Lo
 * que este tiene de más es lo único que lo diferencia: TRES CAMPOS y un estado
 * de envío.
 *
 * ---------------------------------------------------------------------------
 * LAS DECISIONES
 *
 * TRES CAMPOS Y NINGUNO MÁS. Nombre, apellidos, correo. Ni teléfono, ni empresa,
 * ni "¿cómo nos conociste?": cada casilla extra cuesta altas, y ninguna de esas
 * hace falta para avisar de un lanzamiento.
 *
 * LOS DOS APELLIDOS EN UN SOLO CAMPO. En España son dos y se dicen de un tirón.
 * Partirlos obliga a rellenar dos veces lo mismo y deja fuera a quien tiene uno.
 * El `placeholder` sugiere la forma sin exigirla.
 *
 * SE VALIDA AL ENVIAR, no mientras se escribe. Un error que aparece en la
 * segunda letra del correo es un reproche, no una ayuda; el mismo error al tocar
 * "Apuntarme" llega cuando la persona ya terminó de decir lo que quería decir.
 * Y al corregir el campo señalado, el error se va.
 *
 * TRES ESTADOS Y CADA UNO SE VE: el formulario, el envío en curso (el botón lo
 * dice y no se puede pulsar dos veces) y el resultado. El de error dice que
 * falló de nuestro lado y deja el formulario intacto para reintentar — lo que
 * la persona escribió no se pierde nunca.
 * ------------------------------------------------------------------------- */
import { useEffect, useRef, useState } from "react";

import {
  COPY_LISTA_DE_ESPERA,
  TEXTO_VOLVER,
  type PlanDeListaDeEspera,
} from "../lib/copy.premium";
import { apuntarse, validar, type ErrorDeCampo } from "../lib/listaDeEspera";

export interface ModalListaDeEsperaProps {
  /** Desde dónde se abrió. Viaja al documento tal cual. */
  plan: PlanDeListaDeEspera;
  onCerrar: () => void;
}

type Envio =
  | { fase: "formulario" }
  | { fase: "enviando" }
  | { fase: "hecho" }
  | { fase: "fallo" };

export function ModalListaDeEspera({ plan, onCerrar }: ModalListaDeEsperaProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState<ErrorDeCampo | null>(null);
  const [envio, setEnvio] = useState<Envio>({ fase: "formulario" });

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

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (envio.fase === "enviando") return;

    const alta = { nombre, apellidos, correo, plan };
    const problema = validar(alta);
    if (problema !== null) {
      setError(problema);
      return;
    }

    setError(null);
    setEnvio({ fase: "enviando" });
    try {
      await apuntarse(alta);
      setEnvio({ fase: "hecho" });
    } catch (err) {
      // El detalle técnico va a la consola y no a la pantalla: a quien se está
      // apuntando no le dice nada, y a quien hace el Q/A le dice todo.
      console.error("[lista de espera]", err);
      setEnvio({ fase: "fallo" });
    }
  }

  /** Al corregir el campo señalado, el error se va: no se queda a mirar. */
  function alEscribir(campo: ErrorDeCampo["campo"], valor: string) {
    if (error?.campo === campo) setError(null);
    if (envio.fase === "fallo") setEnvio({ fase: "formulario" });
    if (campo === "nombre") setNombre(valor);
    if (campo === "apellidos") setApellidos(valor);
    if (campo === "correo") setCorreo(valor);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ground/80 px-5 py-6 backdrop-blur-sm sm:items-center"
      onClick={onCerrar}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lista-de-espera-titulo"
        tabIndex={-1}
        onClick={(evento) => evento.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-line bg-surface p-6 shadow-2xl shadow-ground/60 outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="lista-de-espera-titulo"
            className="font-display text-2xl leading-tight font-bold text-ink"
          >
            {COPY_LISTA_DE_ESPERA.titulo}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={COPY_LISTA_DE_ESPERA.aria_cerrar}
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

        {envio.fase === "hecho" ? (
          <>
            <p
              // `status` y no `alert`: el resultado se anuncia sin interrumpir,
              // que es lo que corresponde a una buena noticia.
              role="status"
              className="rounded-2xl border border-accent/40 bg-accent-soft/50 p-4 leading-relaxed text-pretty text-ink"
            >
              {COPY_LISTA_DE_ESPERA.exito}
            </p>
            <button
              type="button"
              onClick={onCerrar}
              className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-ground transition-transform active:scale-[0.98]"
            >
              {TEXTO_VOLVER}
            </button>
          </>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(evento) => void enviar(evento)} noValidate>
            <p className="text-sm leading-relaxed text-ink-soft">
              {COPY_LISTA_DE_ESPERA.entrada}
            </p>

            <Campo
              id="lista-nombre"
              etiqueta={COPY_LISTA_DE_ESPERA.nombre}
              placeholder={COPY_LISTA_DE_ESPERA.nombre_placeholder}
              autoComplete="given-name"
              valor={nombre}
              onCambio={(valor) => alEscribir("nombre", valor)}
              error={error?.campo === "nombre" ? error.mensaje : null}
            />
            <Campo
              id="lista-apellidos"
              etiqueta={COPY_LISTA_DE_ESPERA.apellidos}
              placeholder={COPY_LISTA_DE_ESPERA.apellidos_placeholder}
              autoComplete="family-name"
              valor={apellidos}
              onCambio={(valor) => alEscribir("apellidos", valor)}
              error={error?.campo === "apellidos" ? error.mensaje : null}
            />
            <Campo
              id="lista-correo"
              etiqueta={COPY_LISTA_DE_ESPERA.correo}
              placeholder={COPY_LISTA_DE_ESPERA.correo_placeholder}
              autoComplete="email"
              tipo="email"
              inputMode="email"
              valor={correo}
              onCambio={(valor) => alEscribir("correo", valor)}
              error={error?.campo === "correo" ? error.mensaje : null}
            />

            {envio.fase === "fallo" && (
              <p
                role="alert"
                className="rounded-xl border border-protein/40 bg-protein/10 px-3 py-2 text-sm leading-relaxed text-ink"
              >
                {COPY_LISTA_DE_ESPERA.error_envio}
              </p>
            )}

            <button
              type="submit"
              disabled={envio.fase === "enviando"}
              className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-ground transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {envio.fase === "enviando"
                ? COPY_LISTA_DE_ESPERA.enviando
                : COPY_LISTA_DE_ESPERA.enviar}
            </button>

            <p className="text-xs leading-relaxed text-ink-faint">
              {COPY_LISTA_DE_ESPERA.privacidad}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Un campo del formulario, con su etiqueta de verdad (`<label for>`) y su error
 * atado por `aria-describedby`. No es adorno de accesibilidad: es lo que hace
 * que tocar la etiqueta enfoque la casilla en un móvil.
 */
function Campo({
  id,
  etiqueta,
  placeholder,
  autoComplete,
  tipo = "text",
  inputMode,
  valor,
  onCambio,
  error,
}: {
  id: string;
  etiqueta: string;
  placeholder: string;
  autoComplete: string;
  tipo?: string;
  inputMode?: "email" | "text";
  valor: string;
  onCambio: (valor: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-soft">
        {etiqueta}
      </label>
      <input
        id={id}
        type={tipo}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? `${id}-error` : undefined}
        className={`min-h-12 rounded-xl border bg-surface-2 px-3 text-base text-ink placeholder:text-ink-faint focus:outline-none ${
          error !== null ? "border-protein" : "border-line focus:border-accent/60"
        }`}
      />
      {error !== null && (
        <p id={`${id}-error`} className="text-xs text-protein">
          {error}
        </p>
      )}
    </div>
  );
}
