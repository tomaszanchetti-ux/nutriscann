/**
 * El reloj del cupo: en qué mes y en qué día cae un instante, para un español.
 *
 * POR QUÉ NO SE CORTA POR UTC. El usuario está en España. Cortar el día a
 * medianoche UTC le movería el corte a la una o a las dos de la madrugada según
 * la época del año: alguien que escanea la cena del sábado a las 00:30 gastaría
 * el cupo del domingo, y nadie entendería por qué. El corte es a medianoche de
 * Madrid, que es la medianoche que la persona ve en su reloj.
 *
 * POR QUÉ NO HAY LIBRERÍA. `Intl.DateTimeFormat` con `timeZone` ya sabe la tabla
 * de husos —incluido el cambio de horario del último domingo de octubre— y viene
 * en el runtime. Traer `luxon` para esto sería sumar un paquete al bundle de la
 * función para hacer lo que la plataforma hace.
 *
 * LA PARTE FINA: EL CAMBIO DE HORARIO. Este módulo hace UNA sola conversión, la
 * de instante → fecha civil, y ahí termina el huso. Todo lo demás —"el día
 * siguiente", "el primero del mes que viene"— es aritmética sobre la fecha civil
 * ya calculada, hecha en UTC sobre números de calendario. Por eso el 25 de
 * octubre de 2026 (el día que Madrid tiene 25 horas) no es un caso especial: no
 * se le suman 24 horas a un instante, se le suma 1 a un número de día.
 */

/** La zona en la que se corta el día y el mes. España peninsular. */
export const ZONA_DEL_CUPO = "Europe/Madrid";

/** Dónde cae un instante, en el calendario de la persona. */
export interface Momento {
  /** `YYYY-MM`. Es el período del cupo mensual y el id de su documento. */
  mes: string;
  /** `YYYY-MM-DD`. El día corriente, en la misma zona. */
  dia: string;
}

const FORMATO_MES = /^(\d{4})-(\d{2})$/;
const FORMATO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Los formateadores son caros de construir y no dependen del instante: se
 * cachean por zona. Una instancia caliente construye uno y lo reusa.
 */
const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  const cacheado = formateadores.get(zona);
  if (cacheado !== undefined) return cacheado;
  const nuevo = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  formateadores.set(zona, nuevo);
  return nuevo;
}

/**
 * En qué mes y en qué día cae `instante` para alguien que mira un reloj de la
 * zona. La ÚNICA conversión con huso horario de todo el cupo.
 *
 * Se lee con `formatToParts` y no con `format` a propósito: el orden de los
 * campos de una fecha formateada depende del locale y armar la cadena a mano
 * desde las partes es lo único que no depende de eso.
 */
export function momentoDelCupo(instante: Date, zona: string = ZONA_DEL_CUPO): Momento {
  if (Number.isNaN(instante.getTime())) {
    throw new RangeError("momentoDelCupo recibió una fecha inválida");
  }
  const partes = formateador(zona).formatToParts(instante);
  const campo = (tipo: Intl.DateTimeFormatPartTypes): string => {
    const parte = partes.find((p) => p.type === tipo);
    if (parte === undefined) throw new RangeError(`el formateador de ${zona} no emitió ${tipo}`);
    return parte.value;
  };
  const mes = `${campo("year")}-${campo("month")}`;
  return { mes, dia: `${mes}-${campo("day")}` };
}

/**
 * El día siguiente a `dia`, en el calendario. Puro y sin huso: opera sobre los
 * números del calendario civil, así que el día de 23 o de 25 horas no lo afecta.
 */
export function diaSiguiente(dia: string): string {
  const partido = FORMATO_DIA.exec(dia);
  if (partido === null) throw new RangeError(`\`${dia}\` no tiene la forma YYYY-MM-DD`);
  const [, año, mes, numero] = partido;
  const siguiente = new Date(Date.UTC(Number(año), Number(mes) - 1, Number(numero) + 1));
  return comoDia(siguiente);
}

/**
 * El primer día del mes siguiente a `mes` — el momento exacto en el que el cupo
 * mensual vuelve a estar entero. Es lo que viaja como `se_renueva`.
 */
export function primerDiaDelMesSiguiente(mes: string): string {
  const partido = FORMATO_MES.exec(mes);
  if (partido === null) throw new RangeError(`\`${mes}\` no tiene la forma YYYY-MM`);
  const [, año, numero] = partido;
  return comoDia(new Date(Date.UTC(Number(año), Number(numero), 1)));
}

/** `YYYY-MM-DD` leído de las partes UTC. La fecha ya es civil: UTC es solo el sobre. */
function comoDia(fecha: Date): string {
  const año = String(fecha.getUTCFullYear()).padStart(4, "0");
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  return `${año}-${mes}-${dia}`;
}
