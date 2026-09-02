/**
 * El scanner: la foto que se está analizando, con la retícula y el haz que la
 * barre.
 *
 * Es la parte VISUAL de la espera (card 3.2). No sabe nada del motor ni de los
 * textos: recibe la foto y un booleano que dice si el análisis ya está en
 * marcha. Toda la animación vive en `index.css` (clases `escaneo-*`), en CSS
 * puro — ni una librería nueva, y `transform` + `opacity` para que el teléfono
 * lo componga en la GPU.
 *
 * DOS ESTADOS, y la diferencia entre ellos ES INFORMACIÓN:
 *
 *   `barriendo: false` — la foto todavía se está preparando en el navegador
 *     (achicar a 1024 px y pasar a base64, ver `lib/imagen.ts`). La retícula se
 *     dibuja y las esquinas laten, pero el haz NO barre: nadie está mirando el
 *     plato todavía.
 *   `barriendo: true`  — el pedido ya salió y el modelo está mirando la foto.
 *     Ahí arranca el barrido.
 *
 * LO QUE A PROPÓSITO NO HAY: puntos de "detección" sobre zonas del plato. El
 * §4 del plan los menciona, pero la visión no devuelve coordenadas —devuelve
 * nombres, gramos y confianza—, así que un punto encendido sobre el arroz sería
 * una detección inventada. La retícula es explícitamente un marco de escaneo, no
 * un mapa de hallazgos.
 */

export interface ScannerDeFotoProps {
  /** `blob:` de la foto elegida. `null` mientras no haya una. */
  vistaPrevia: string | null;
  /** ¿El análisis ya está en marcha? Si no, el haz espera. */
  barriendo: boolean;
}

export function ScannerDeFoto({ vistaPrevia, barriendo }: ScannerDeFotoProps) {
  return (
    <div className="escaneo-marco relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-3xl border border-line bg-surface">
      {vistaPrevia !== null ? (
        <img
          src={vistaPrevia}
          alt="La foto que se está analizando"
          className="escaneo-foto size-full object-cover"
        />
      ) : (
        <div className="size-full bg-surface-2" />
      )}

      {/* Un velo tenue: la foto sigue reconociéndose y el haz se lee encima. */}
      <div className="absolute inset-0 bg-ground/25" aria-hidden="true" />

      <div className="escaneo-reticula" aria-hidden="true" />

      {barriendo && <div className="escaneo-haz" aria-hidden="true" />}

      <svg
        viewBox="0 0 100 100"
        className={`pointer-events-none absolute inset-0 size-full text-accent ${
          barriendo ? "" : "escaneo-esquinas--preparando"
        }`}
        fill="none"
        aria-hidden="true"
      >
        <g
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.7"
        >
          <path d="M8 24V8h16" />
          <path d="M76 8h16v16" />
          <path d="M92 76v16H76" />
          <path d="M24 92H8V76" />
        </g>
      </svg>
    </div>
  );
}
