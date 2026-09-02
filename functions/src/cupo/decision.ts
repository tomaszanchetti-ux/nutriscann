/**
 * El cupo, DECIDIDO. Sin Firestore, sin reloj, sin red.
 *
 * Este archivo contesta una sola pregunta —«con este consumo y estos límites,
 * ¿esta foto entra?»— y la contesta con funciones puras. La lectura y la
 * escritura del documento de consumo viven en `persistencia.ts`, del otro lado
 * de la línea. Es el mismo corte con el que están escritos el motor y el
 * handler: si para probar una decisión hiciera falta levantar un emulador, la
 * decisión estaría mal partida.
 *
 * EL CUPO, EN DOS TRAMOS (§3 del contrato de la WS09, decisión de Tomás):
 *
 *   15 al MES  la garantía que se le comunica al usuario. Es el número que
 *              define el producto gratuito.
 *   3 al DÍA   un freno anti-ráfaga interno. No es una promesa: es lo que evita
 *              que una tarde de curiosidad se lleve el mes entero —y, del lado
 *              del negocio, que una cuenta robada consuma quince llamadas al
 *              modelo en cinco minutos.
 *
 * Los dos salen de `config/app` y se editan sin desplegar. Los números de este
 * archivo son el ARRANQUE EN FRÍO, igual que en `config.ts`: lo que rige el día
 * que el documento no exista o Firestore no conteste.
 *
 * EL MES SE MIRA PRIMERO, y no es un detalle de implementación: si a alguien que
 * agotó los 15 del mes se le contestara «vuelve mañana», se le estaría mintiendo.
 */
import { diaSiguiente, primerDiaDelMesSiguiente, type Momento } from "./calendario";

/** Los dos topes, ya resueltos: lo publicado o, si no sirve, el arranque en frío. */
export interface LimitesDeCupo {
  por_mes: number;
  por_dia: number;
}

/**
 * El arranque en frío del cupo. NO es la configuración: es lo que rige mientras
 * `config/app` no conteste. `config.ts` lo publica dentro de `AppConfig` y la
 * respuesta declara con `config_source` cuál de los dos casos ocurrió.
 */
export const LIMITES_EN_FRIO: LimitesDeCupo = { por_mes: 15, por_dia: 3 };

/**
 * Lo que el documento de consumo sabe: cuánto va del mes, y cuánto va del día
 * que ese documento estaba contando.
 *
 * `dia` en `null` = el documento no existe todavía (o nunca contó un día).
 */
export interface EstadoDeConsumo {
  usados_mes: number;
  /** El día `YYYY-MM-DD` al que se refiere `usados_dia`. */
  dia: string | null;
  usados_dia: number;
}

/** Un dueño que todavía no gastó nada este mes. */
export const CONSUMO_EN_CERO: EstadoDeConsumo = { usados_mes: 0, dia: null, usados_dia: 0 };

/** Qué tramo del cupo se agotó. Viaja al front en el bloque `quota` del 429. */
export type AmbitoDeCupo = "mes" | "dia";

/** El bloque `quota` del 429, tal como lo fija el §2 del contrato. */
export interface BloqueoDeCupo {
  ambito: AmbitoDeCupo;
  usados: number;
  limite: number;
  /** `YYYY-MM-DD`: el primer día en el que ese tramo vuelve a estar entero. */
  se_renueva: string;
}

/** Un tramo del cupo, como se lo cuenta la respuesta 200 al usuario. */
export interface TramoDeCupo {
  usados: number;
  limite: number;
  se_renueva: string;
}

/** Cómo va el cupo después de este escaneo. Viaja en el 200. */
export interface FotoDelCupo {
  mes: TramoDeCupo;
  dia: TramoDeCupo;
}

export type VeredictoDeCupo =
  | { entra: true; consumo: EstadoDeConsumo }
  | { entra: false; bloqueo: BloqueoDeCupo };

/**
 * Cuántos escaneos lleva HOY, según este documento.
 *
 * Acá está el truco que permite que un solo documento por mes lleve las dos
 * cuentas: el contador del día NO se pone en cero con una tarea nocturna, se
 * DESCARTA al leerlo si el día que tiene guardado ya no es hoy. Sin esto harían
 * falta treinta documentos por usuario y mes, o un cron.
 */
export function usadosHoy(estado: EstadoDeConsumo, momento: Momento): number {
  return estado.dia === momento.dia ? estado.usados_dia : 0;
}

/**
 * ¿Entra esta foto? Y si no entra, ¿por qué tramo y hasta cuándo?
 *
 * El límite se compara con `>=` y no con `>`: `usados` es lo que YA se gastó, así
 * que con 15 gastados y un tope de 15 no queda hueco. Un tope en 0 apaga el
 * escaneo para ese dueño, y eso es deliberado: es la única forma de cortar el
 * gasto desde `config/app` sin desplegar.
 */
export function decidirCupo(
  estado: EstadoDeConsumo,
  limites: LimitesDeCupo,
  momento: Momento,
): VeredictoDeCupo {
  if (estado.usados_mes >= limites.por_mes) {
    return {
      entra: false,
      bloqueo: {
        ambito: "mes",
        usados: estado.usados_mes,
        limite: limites.por_mes,
        se_renueva: primerDiaDelMesSiguiente(momento.mes),
      },
    };
  }

  const hoy = usadosHoy(estado, momento);
  if (hoy >= limites.por_dia) {
    return {
      entra: false,
      bloqueo: {
        ambito: "dia",
        usados: hoy,
        limite: limites.por_dia,
        se_renueva: diaSiguiente(momento.dia),
      },
    };
  }

  return {
    entra: true,
    consumo: { usados_mes: estado.usados_mes + 1, dia: momento.dia, usados_dia: hoy + 1 },
  };
}

/**
 * Devuelve un crédito reservado.
 *
 * CUÁNDO SE DEVUELVE, escrito donde se lee y no en un informe: el crédito se
 * RESERVA antes de llamar al modelo, porque esa llamada es lo que cuesta dinero
 * y reservar después dejaría el hueco por el que dos pestañas pagan dos veces el
 * mismo cupo. Se DEVUELVE solo si el análisis se cayó ANTES de que el modelo
 * contestara —modelo caído, catálogo no disponible, error nuestro—, o sea cuando
 * no llegamos a pagarle a nadie. Una foto que el modelo miró y resultó no ser
 * comida NO se devuelve: el trabajo se hizo y se pagó. Cuál error devuelve y
 * cuál no lo declara `CODIGOS_QUE_DEVUELVEN_EL_CREDITO`, en el handler.
 *
 * El contador del día solo baja si el documento sigue contando el MISMO día: si
 * entre la reserva y el fallo cambió la fecha (un análisis largo a las 23:59),
 * el día nuevo ya empieza en cero y restarle uno al día viejo no le devolvería
 * nada a nadie.
 *
 * Nunca baja de cero. Un contador negativo sería un cupo regalado.
 */
export function revertirConsumo(estado: EstadoDeConsumo, momento: Momento): EstadoDeConsumo {
  return {
    usados_mes: Math.max(0, estado.usados_mes - 1),
    dia: estado.dia,
    usados_dia: estado.dia === momento.dia ? Math.max(0, estado.usados_dia - 1) : estado.usados_dia,
  };
}

/** Cómo le queda el cupo al usuario después de este escaneo. */
export function fotoDelCupo(
  estado: EstadoDeConsumo,
  limites: LimitesDeCupo,
  momento: Momento,
): FotoDelCupo {
  return {
    mes: {
      usados: estado.usados_mes,
      limite: limites.por_mes,
      se_renueva: primerDiaDelMesSiguiente(momento.mes),
    },
    dia: {
      usados: usadosHoy(estado, momento),
      limite: limites.por_dia,
      se_renueva: diaSiguiente(momento.dia),
    },
  };
}

/**
 * Lee el estado desde lo que trajo Firestore, sin confiar en nada.
 *
 * El documento se puede editar a mano en la consola (es la contrapartida de que
 * el cupo se pueda perdonar sin desplegar), así que un campo puede llegar con
 * cualquier cosa adentro. Lo que no se entiende cuenta como cero, que es el
 * único valor que no le cobra de más a nadie.
 */
export function leerEstado(datos: Record<string, unknown> | undefined): EstadoDeConsumo {
  if (datos === undefined) return CONSUMO_EN_CERO;
  const dia = datos["dia"];
  return {
    usados_mes: enteroNoNegativo(datos["usados_mes"]),
    dia: typeof dia === "string" && dia.length > 0 ? dia : null,
    usados_dia: enteroNoNegativo(datos["usados_dia"]),
  };
}

/**
 * Resuelve los dos topes contra lo publicado, con el arranque en frío detrás.
 *
 * Un valor que no es un entero no negativo NO se corrige a la baja ni a la alza:
 * se descarta entero y rige el arranque en frío, porque un `"quince"` tipeado en
 * la consola tiene que comportarse como «no está configurado» y no como cero
 * —que apagaría el producto— ni como infinito —que lo regalaría—.
 */
export function normalizarLimites(
  publicado: { por_mes: unknown; por_dia: unknown },
  enFrio: LimitesDeCupo = LIMITES_EN_FRIO,
): LimitesDeCupo {
  return {
    por_mes: tope(publicado.por_mes, enFrio.por_mes),
    por_dia: tope(publicado.por_dia, enFrio.por_dia),
  };
}

function tope(valor: unknown, enFrio: number): number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : enFrio;
}

function enteroNoNegativo(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return 0;
  return Math.max(0, Math.floor(valor));
}
