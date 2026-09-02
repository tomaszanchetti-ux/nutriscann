/**
 * Dónde vive el consumo y cómo se toca: `owners/{uid}/usage/{YYYY-MM}`.
 *
 * UN SOLO DOCUMENTO POR DUEÑO Y MES, con las DOS cuentas adentro. Por qué así y
 * no de otra forma:
 *
 *   · Una LECTURA por escaneo, no treinta. La alternativa obvia —un documento
 *     por día— obligaría a sumar 30 documentos para saber cuánto va del mes, o a
 *     llevar un contador aparte que puede desincronizarse. Acá el mes es el
 *     documento y el día es un par de campos adentro.
 *   · El contador del día se RESETEA SOLO, sin cron: el documento guarda a qué
 *     día se refiere (`dia`) y, si ese día ya no es hoy, se lee como cero
 *     (`usadosHoy` en `decision.ts`). Una tarea nocturna que ponga contadores en
 *     cero es una tarea que puede no correr.
 *   · El id `YYYY-MM` es la partición natural del cupo mensual: el mes que
 *     termina es un documento que deja de escribirse, así que queda el histórico
 *     sin ningún trabajo de limpieza, y se lee de un vistazo en la consola.
 *   · Está bajo `owners/{uid}/`, o sea en el mismo árbol que `scans`, así que
 *     hereda el aislamiento por dueño que ya tienen las reglas de seguridad
 *     (`owners/{ownerId}/{document=**}` se lee solo con el uid propio) y nadie
 *     escribe ahí salvo el Admin SDK.
 *
 * POR QUÉ UNA TRANSACCIÓN Y NO `FieldValue.increment`. Un `increment` no sabe
 * negarse: sumaría igual pasado el tope y habría que "des-sumar" después, que es
 * exactamente la carrera que se quería evitar. La transacción lee, DECIDE con la
 * función pura y escribe el número absoluto que decidió, todo o nada. Dos fotos
 * disparadas a la vez desde dos pestañas tocan el mismo documento: Firestore
 * hace reintentar a la segunda, que vuelve a leer y ve el hueco ya ocupado.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { COLECCION_DUEÑOS } from "../analyze/persistencia";
import { ZONA_DEL_CUPO, type Momento } from "./calendario";
import {
  decidirCupo,
  leerEstado,
  revertirConsumo,
  type EstadoDeConsumo,
  type LimitesDeCupo,
  type VeredictoDeCupo,
} from "./decision";

/** La subcolección del consumo, hermana de `scans` bajo el mismo dueño. */
export const SUBCOLECCION_CONSUMO = "usage";

/** El documento del mes de un dueño. */
export function refDelConsumo(
  db: Firestore,
  owner_id: string,
  mes: string,
): FirebaseFirestore.DocumentReference {
  return db.collection(COLECCION_DUEÑOS).doc(owner_id).collection(SUBCOLECCION_CONSUMO).doc(mes);
}

export interface EntradaDeCupo {
  owner_id: string;
  momento: Momento;
  limites: LimitesDeCupo;
  /** Inyectable para que los tests no dependan del reloj. */
  ahora?: Date;
}

/**
 * Reserva un crédito, o dice por qué no.
 *
 * Se llama ANTES de la llamada al modelo: la llamada es lo que cuesta dinero, y
 * cobrar después dejaría abierta la ventana por la que dos pedidos simultáneos
 * pagan dos veces el mismo hueco.
 *
 * Lo que queda escrito lleva, además de los contadores, con QUÉ LÍMITES se
 * decidió (`limite_mes_aplicado`, `limite_dia_aplicado`) y en qué zona se cortó.
 * No hace falta para decidir: hace falta para que dentro de tres meses, cuando
 * alguien pregunte por qué a este usuario se le frenó en el 12, se pueda leer el
 * documento y saber que ese día el tope publicado era 12 y no 15.
 */
export async function reservarCupo(db: Firestore, entrada: EntradaDeCupo): Promise<VeredictoDeCupo> {
  const ref = refDelConsumo(db, entrada.owner_id, entrada.momento.mes);
  const marca = Timestamp.fromDate(entrada.ahora ?? new Date());

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const estado = leerEstado(snap.data());
    const veredicto = decidirCupo(estado, entrada.limites, entrada.momento);

    // Un pedido rebotado no escribe nada: el 429 no es un consumo y ensuciar el
    // documento con cada rebote convertiría un contador en una bitácora.
    if (!veredicto.entra) return veredicto;

    tx.set(
      ref,
      {
        owner_id: entrada.owner_id,
        periodo: entrada.momento.mes,
        zona: ZONA_DEL_CUPO,
        usados_mes: veredicto.consumo.usados_mes,
        dia: veredicto.consumo.dia,
        usados_dia: veredicto.consumo.usados_dia,
        limite_mes_aplicado: entrada.limites.por_mes,
        limite_dia_aplicado: entrada.limites.por_dia,
        ultimo_uso: marca,
        ...(snap.exists ? {} : { primer_uso: marca, devueltos: 0 }),
      },
      { merge: true },
    );

    return veredicto;
  });
}

/**
 * Devuelve el crédito de un análisis que se cayó del lado nuestro.
 *
 * Va en su propia transacción y no en la de la reserva porque entre las dos pasa
 * la llamada al modelo, que puede tardar cuarenta segundos: una transacción
 * abierta ese rato bloquearía el documento del usuario todo ese tiempo.
 *
 * `devueltos` cuenta cuántos se perdonaron en el mes. No lo consume ninguna
 * decisión; existe para poder mirar un documento y distinguir «este usuario hizo
 * 10 escaneos» de «este usuario hizo 13 y tres se cayeron», que es la diferencia
 * entre un usuario contento y un incidente.
 *
 * Devuelve `null` si no había nada que devolver (el documento no existe): pasa
 * si la reserva y la devolución cruzan el cambio de mes, y no es un error.
 */
export async function devolverCredito(
  db: Firestore,
  entrada: Omit<EntradaDeCupo, "limites">,
): Promise<EstadoDeConsumo | null> {
  const ref = refDelConsumo(db, entrada.owner_id, entrada.momento.mes);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;

    const revertido = revertirConsumo(leerEstado(snap.data()), entrada.momento);
    const devueltosPrevios = snap.get("devueltos");

    tx.set(
      ref,
      {
        usados_mes: revertido.usados_mes,
        usados_dia: revertido.usados_dia,
        devueltos: (typeof devueltosPrevios === "number" ? devueltosPrevios : 0) + 1,
      },
      { merge: true },
    );

    return revertido;
  });
}
