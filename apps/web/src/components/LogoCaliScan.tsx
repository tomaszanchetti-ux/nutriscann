/**
 * EL LOGOTIPO DE CALISCAN DENTRO DE LA APP (Q/A de Tomás, 02/09/2026).
 *
 * Es el MISMO dibujo que `apps/landing/assets/logo.svg` —el que ya se ve en la
 * landing y del que salieron los iconos del teléfono—, traído aquí en línea. La
 * marca tiene que ser una sola en todas partes: la pantalla de entrada llevaba
 * hasta hoy un icono de cámara genérico que no era de nadie.
 *
 * POR QUÉ EN LÍNEA Y NO UN `<img src="logo.svg">`. El wordmark del archivo está
 * escrito con `<text>` y no con contornos —así pesa 2 KB, se puede recolorear y
 * el texto sigue siendo texto—, pero un SVG cargado como imagen externa NO carga
 * fuentes: el navegador caería a la pila de respaldo y «CaliScan» se vería con
 * otra letra que la del resto de la app. En línea, en cambio, hereda la
 * Bricolage Grotesque que `index.html` ya trae, y se ve exactamente igual que en
 * la landing. (El mismo motivo está escrito en el archivo original.)
 *
 * LOS COLORES SON LOS DE LA MARCA, no los tokens del tema, y es a propósito: un
 * logotipo que cambia de color con la pantalla deja de ser un logotipo. Los hex
 * son idénticos a los de `logo.svg`; si algún día se retoca la marca, se retoca
 * en los dos sitios a la vez o no se retoca.
 *
 * ⚠️ Alto mínimo 24 px, como manda el original: por debajo, el wordmark se
 * cierra y hay que ir con el isotipo solo.
 */

/** El verde de CaliScan. Mismo valor que en `logo.svg` y en los iconos. */
const VERDE = "#4fbe82";
/** El verde oscuro del nervio de la hoja. */
const VERDE_HONDO = "#2f9e63";
/** El hueso del wordmark: la mitad «Cali». */
const HUESO = "#e8ece4";

export interface LogoCaliScanProps {
  /** Clases de tamaño. El SVG conserva su proporción (252 × 64). */
  className?: string;
  /**
   * Un identificador propio por cada logo que se pinte en la MISMA página.
   *
   * No es una manía: los `<linearGradient>` viven en un espacio de nombres
   * global del documento, así que dos logos con los mismos ids harían que el
   * segundo pintase con los degradados del primero. Con un logo por pantalla no
   * se nota; el día que haya dos, se notaría y nadie sabría por qué.
   */
  id?: string;
}

export function LogoCaliScan({ className, id = "caliscan" }: LogoCaliScanProps) {
  const hoja = `${id}-hoja`;
  const haz = `${id}-haz`;
  const titulo = `${id}-titulo`;

  return (
    <svg
      viewBox="0 0 252 64"
      className={className}
      role="img"
      aria-labelledby={titulo}
      fill="none"
    >
      <title id={titulo}>CaliScan</title>
      <defs>
        <linearGradient id={hoja} x1="18" y1="46" x2="46" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={VERDE} stopOpacity="0.10" />
          <stop offset="1" stopColor={VERDE} stopOpacity="0.28" />
        </linearGradient>
        {/* El haz del escáner se desvanece por los dos extremos: no es una línea
            que cruza el marco, es una luz que barre. */}
        <linearGradient id={haz} x1="10" y1="32" x2="54" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={VERDE} stopOpacity="0" />
          <stop offset="0.3" stopColor={VERDE} stopOpacity="1" />
          <stop offset="0.7" stopColor={VERDE} stopOpacity="1" />
          <stop offset="1" stopColor={VERDE} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* El isotipo: una hoja dentro de las cuatro esquinas de un escáner. */}
      <g>
        <path
          d="M18 46C18 30 30 18 46 18C46 34 34 46 18 46Z"
          fill={`url(#${hoja})`}
          stroke={VERDE}
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <path d="M18 46 46 18" stroke={VERDE_HONDO} strokeWidth="2.2" strokeLinecap="round" />
        <g stroke={`url(#${haz})`} strokeLinecap="round">
          <path d="M11 32H53" strokeWidth="5" opacity="0.22" />
          <path d="M11 32H53" strokeWidth="2.2" />
        </g>
        <g stroke={VERDE} strokeWidth="3.4" strokeLinecap="round">
          <path d="M21 4.5H12A7.5 7.5 0 0 0 4.5 12V21" />
          <path d="M43 4.5H52A7.5 7.5 0 0 1 59.5 12V21" />
          <path d="M59.5 43V52A7.5 7.5 0 0 1 52 59.5H43" />
          <path d="M21 59.5H12A7.5 7.5 0 0 1 4.5 52V43" />
        </g>
      </g>

      {/* El nombre partido en dos tintas: se mide (calorías) escaneando. Es lo
          que hace el producto, dicho con color en vez de con una frase. */}
      <text
        x="78"
        y="44.5"
        fontFamily="'Bricolage Grotesque', 'Helvetica Neue', Helvetica, Arial, sans-serif"
        fontSize="37"
        fontWeight="700"
        letterSpacing="-0.9"
      >
        <tspan fill={HUESO}>Cali</tspan>
        <tspan fill={VERDE}>Scan</tspan>
      </text>
    </svg>
  );
}
