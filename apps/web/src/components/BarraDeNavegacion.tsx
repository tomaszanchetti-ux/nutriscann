/**
 * La navegación mínima entre las tres secciones (card 3.3).
 *
 * POR QUÉ NO HAY ROUTER. La app tiene tres pantallas y `App.tsx` ya es una
 * máquina de estados: meter `react-router` sería sumar una dependencia y un
 * concepto para resolver un `useState` de tres valores. Cuando la v2 traiga el
 * historial con URL propia por scan, ese será el momento de discutirlo — hoy
 * sería peso muerto en una PWA que se mide en kilobytes.
 *
 * Va abajo, sobre el pie de diagnóstico, con área de toque de 44 px de alto:
 * es una app de móvil que se usa con una mano y el plato en la otra.
 */
import { COPY_NAVEGACION } from "../lib/copy.premium";

export type Seccion = "escaneo" | "perfil" | "premium";

export interface BarraDeNavegacionProps {
  activa: Seccion;
  onIr: (seccion: Seccion) => void;
}

const SECCIONES: { id: Seccion; etiqueta: string }[] = [
  { id: "escaneo", etiqueta: COPY_NAVEGACION.escaneo },
  { id: "perfil", etiqueta: COPY_NAVEGACION.perfil },
  { id: "premium", etiqueta: COPY_NAVEGACION.premium },
];

export function BarraDeNavegacion({ activa, onIr }: BarraDeNavegacionProps) {
  return (
    <nav
      aria-label={COPY_NAVEGACION.aria}
      className="grid grid-cols-3 gap-1 border-t border-line pt-2"
    >
      {SECCIONES.map((seccion) => {
        const esActiva = seccion.id === activa;
        return (
          <button
            key={seccion.id}
            type="button"
            onClick={() => onIr(seccion.id)}
            aria-current={esActiva ? "page" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors ${
              esActiva ? "text-accent" : "text-ink-faint active:text-ink-soft"
            }`}
          >
            <IconoDeSeccion seccion={seccion.id} />
            {seccion.etiqueta}
          </button>
        );
      })}
    </nav>
  );
}

function IconoDeSeccion({ seccion }: { seccion: Seccion }) {
  const comun = { className: "size-5", fill: "none", viewBox: "0 0 24 24", "aria-hidden": true };

  if (seccion === "escaneo") {
    return (
      <svg {...comun}>
        <path
          d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2a1 1 0 0 0 .84-.46l.92-1.42A1 1 0 0 1 10.3 3.7h3.4a1 1 0 0 1 .84.42l.92 1.42a1 1 0 0 0 .84.46h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="12.2" r="3.4" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (seccion === "perfil") {
    return (
      <svg {...comun}>
        <circle cx="12" cy="8.2" r="3.7" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5 19.3c.6-3.3 3.5-5.4 7-5.4s6.4 2.1 7 5.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg {...comun}>
      <path
        d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8L12 3.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
