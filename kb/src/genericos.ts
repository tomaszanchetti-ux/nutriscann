/**
 * La regla de los alimentos GENÉRICOS (DT-13), pura y aparte.
 *
 * USDA marca con `NFS` y `NS as to ...` las fichas que no miden un alimento sino
 * el promedio de una familia. La DT-7 ya enseñó que un nombre puede mentir; acá
 * el nombre no miente, pero el NÚMERO tampoco es de nadie en particular: el
 * `Queso, NFS` promedia una familia cuyo sodio va de 200 a 1.800 mg.
 *
 * La política tiene dos salidas y ninguna se escribe ficha por ficha:
 *  - `generic: true` en el canónico, para que el motor de la fase 2 baje la
 *    confianza de un match contra un promedio sin volver a parsear el inglés;
 *  - un caveat GENERADO con el sodio de la propia ficha, cuando pasa el umbral.
 *
 * La matemática y el texto viven acá —sin leer archivos, sin reloj, sin azar—
 * por el mismo motivo que `transforms.ts`: la DECISIÓN separada de la LECTURA.
 * El umbral, los marcadores y la plantilla los declara
 * `kb/curation/genericos.dt13.json`; este módulo no conoce ni uno.
 */

/** La regla declarada en `kb/curation/genericos.dt13.json`. */
export interface GenericRule {
  criteria_version: string;
  /** Los marcadores de USDA que hacen genérica a una ficha (`, NFS`). */
  marcadores_en: string[];
  /** A partir de cuántos mg de sodio por 100 g la ficha se lleva un caveat. */
  umbral_sodio_mg: number;
  /** El texto del caveat, con `{sodio_mg}` adentro. */
  plantilla_caveat: string;
}

/**
 * El hueco que la plantilla tiene que traer. Es obligatorio a propósito: un
 * caveat que avisa que "puede variar" sin decir de qué número estamos hablando
 * no informa nada, y el lector no tiene cómo saber si le importa.
 */
export const PLACEHOLDER_SODIO = "{sodio_mg}";

/**
 * ¿La ficha es genérica? Se responde con el inglés de USDA y no con el español:
 * el marcador es de la fuente, y la curación lo BORRA del nombre en español a
 * propósito (`Pear, canned, NFS` es `Pera en lata`). Buscarlo en el español
 * sería buscar justo lo que la capa 3 se encarga de quitar.
 */
export function esGenerico(nameEn: string, marcadores: string[]): boolean {
  const plano = nameEn.toLowerCase();
  return marcadores.some((marcador) => plano.includes(marcador.toLowerCase()));
}

/**
 * El caveat que le toca a una ficha genérica por su sodio, o `null` si no llega
 * al umbral. Es una función del sodio y de la regla: dos corridas con el mismo
 * catálogo escriben el mismo texto, byte a byte.
 */
export function caveatDeSodio(sodioMg: number | null, rule: GenericRule): string | null {
  if (sodioMg === null || !Number.isFinite(sodioMg)) return null;
  if (sodioMg < rule.umbral_sodio_mg) return null;
  return rule.plantilla_caveat.split(PLACEHOLDER_SODIO).join(formatearSodio(sodioMg));
}

/**
 * El número como se escribe en español: punto para los miles, coma para el
 * decimal (`1.757`, `12,5`). Escrito a mano y no con `toLocaleString` porque el
 * catálogo tiene que salir igual byte a byte en cualquier máquina, y el formato
 * de una intl depende de qué datos de idioma trajo ese Node.
 */
export function formatearSodio(mg: number): string {
  const redondeado = Math.round(mg * 10) / 10;
  const texto = redondeado.toFixed(Number.isInteger(redondeado) ? 0 : 1);
  const [entero, decimal] = texto.split(".");
  const conMiles = (entero ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal === undefined ? conMiles : `${conMiles},${decimal}`;
}
