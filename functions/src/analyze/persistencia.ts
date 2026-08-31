/**
 * Lo que queda escrito después de un análisis: el scan y la cola de curación.
 *
 * Dos escrituras con dos propósitos distintos:
 *
 *   `owners/{owner}/scans/{scan}`  el EXPEDIENTE de este análisis. Se guarda el
 *                                  `EngineResult` tal cual —con los motivos, las
 *                                  confianzas y la composición— porque un número
 *                                  sin su derivación no se puede auditar después.
 *
 *   `curation_queue/{termino}`     lo que el catálogo NO supo nombrar. Es la
 *                                  memoria del sistema: el catálogo crece con el
 *                                  uso real (§5 del plan). Se deduplica ENTRE
 *                                  escaneos por término normalizado y se cuenta
 *                                  cuántas veces apareció — un término que
 *                                  aparece 40 veces no es lo mismo que uno que
 *                                  apareció una vez, y esa diferencia es la que
 *                                  ordena la cola de curación.
 */
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

import { normalizar, type CurationCandidate, type EngineResult } from "../engine";

export const COLECCION_DUEÑOS = "owners";
export const SUBCOLECCION_SCANS = "scans";
export const COLECCION_CURACION = "curation_queue";

/** El techo de un id de documento de Firestore es 1.500 bytes; 200 es de sobra. */
const MAX_LARGO_ID = 200;

export interface MetaDelScan {
  model: string;
  kb_version: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
}

export interface EntradaDePersistencia {
  owner_id: string;
  scan_id: string;
  resultado: EngineResult;
  meta: MetaDelScan;
  /** Inyectable para que los tests no dependan del reloj. */
  ahora?: Date;
}

/**
 * El documento del scan, según el §2 del plan adaptado al `EngineResult` real.
 *
 * DIFERENCIAS DECLARADAS con el boceto del §2, y por qué:
 *  - `image_ref` va en `null`: la imagen viaja como base64 en el POST y no se
 *    guarda en ningún lado (Cloud Storage llega con la DT-3). No se omite el
 *    campo para que el día que exista se llene, no se invente.
 *  - No hay `recommendation`: la v1 no muestra recomendaciones (decisión del
 *    31/08, §6 del plan). El campo llega con el esquema de la v2.
 *  - `items` y `totals` son los del motor, sin reformatear: el front de la card
 *    2.3 se construye contra `EngineResult`, no contra una copia parecida.
 */
export function documentoDelScan(entrada: EntradaDePersistencia): Record<string, unknown> {
  const ahora = entrada.ahora ?? new Date();
  return sinIndefinidos({
    owner_id: entrada.owner_id,
    created_at: Timestamp.fromDate(ahora),
    status: "done",
    image_ref: null,
    is_food: entrada.resultado.es_comida,
    items: entrada.resultado.items,
    totals: entrada.resultado.totals,
    curation_candidates: entrada.resultado.curation_candidates,
    kb_version: entrada.resultado.kb_version,
    meta: entrada.meta,
  });
}

/** Guarda el expediente del scan. */
export async function guardarScan(db: Firestore, entrada: EntradaDePersistencia): Promise<void> {
  await db
    .collection(COLECCION_DUEÑOS)
    .doc(entrada.owner_id)
    .collection(SUBCOLECCION_SCANS)
    .doc(entrada.scan_id)
    .set(documentoDelScan(entrada));
}

/** El id del documento de la cola: el término normalizado, con guiones. */
export function idDeCuracion(termino_en: string): string {
  const clave = normalizar(termino_en).replace(/ /g, "-");
  return clave.slice(0, MAX_LARGO_ID);
}

export interface CandidatoAgrupado {
  id: string;
  termino_normalizado: string;
  candidato: CurationCandidate;
  motivos: string[];
}

/**
 * Agrupa los candidatos de UN escaneo por término normalizado.
 *
 * Hace falta porque el motor deduplica por `motivo + término` y el mismo término
 * puede entrar dos veces con motivos distintos (el plato sin match y su propio
 * ingrediente sin match). En la cola son un solo documento —el término es la
 * unidad de curación— y sin agrupar antes, la transacción escribiría dos veces
 * el mismo documento y el contador contaría mal.
 *
 * Pura: no toca la base. El descarte de los términos vacíos es explícito.
 */
export function agruparCandidatos(candidatos: CurationCandidate[]): CandidatoAgrupado[] {
  const porId = new Map<string, CandidatoAgrupado>();
  for (const candidato of candidatos) {
    const id = idDeCuracion(candidato.termino_en);
    if (id.length === 0) continue; // un término que normaliza a nada no se cura
    const previo = porId.get(id);
    if (previo === undefined) {
      porId.set(id, {
        id,
        termino_normalizado: id.replace(/-/g, " "),
        candidato,
        motivos: [candidato.motivo],
      });
      continue;
    }
    if (!previo.motivos.includes(candidato.motivo)) previo.motivos.push(candidato.motivo);
  }
  return [...porId.values()];
}

export interface ResultadoDeCuracion {
  /** Términos que no estaban en la cola y se crearon. */
  creados: string[];
  /** Términos que ya estaban: se les sumó una aparición. */
  incrementados: string[];
}

/**
 * Escribe la cola de curación con deduplicación ENTRE escaneos.
 *
 * Va en una transacción y no en escrituras sueltas con `increment` porque hay
 * que distinguir el alta del incremento: `first_seen` se estampa una sola vez y
 * el resultado dice cuántos se crearon y cuántos ya estaban. Eso no se puede
 * saber con un `set(merge)` a ciegas.
 */
export async function registrarCuracion(
  db: Firestore,
  candidatos: CurationCandidate[],
  contexto: { scan_id: string; owner_id: string; ahora?: Date },
): Promise<ResultadoDeCuracion> {
  const grupos = agruparCandidatos(candidatos);
  if (grupos.length === 0) return { creados: [], incrementados: [] };

  const ahora = Timestamp.fromDate(contexto.ahora ?? new Date());
  const coleccion = db.collection(COLECCION_CURACION);

  return db.runTransaction(async (tx) => {
    // Todas las lecturas antes de la primera escritura: lo exige Firestore.
    const previos = await Promise.all(grupos.map((g) => tx.get(coleccion.doc(g.id))));

    const creados: string[] = [];
    const incrementados: string[] = [];

    grupos.forEach((grupo, i) => {
      const snap = previos[i];
      const existe = snap !== undefined && snap.exists;
      const ref = coleccion.doc(grupo.id);

      const comun = sinIndefinidos({
        termino_en: grupo.candidato.termino_en,
        termino_normalizado: grupo.termino_normalizado,
        motivo: grupo.candidato.motivo,
        motivos: FieldValue.arrayUnion(...grupo.motivos),
        grams: grupo.candidato.grams,
        preparation: grupo.candidato.preparation,
        componentes: grupo.candidato.componentes ?? null,
        detalle: grupo.candidato.detalle,
        last_seen: ahora,
        last_scan_id: contexto.scan_id,
        last_owner_id: contexto.owner_id,
        veces: FieldValue.increment(1),
      });

      if (existe) {
        tx.set(ref, comun, { merge: true });
        incrementados.push(grupo.id);
      } else {
        tx.set(ref, { ...comun, first_seen: ahora, first_scan_id: contexto.scan_id });
        creados.push(grupo.id);
      }
    });

    return { creados, incrementados };
  });
}

/**
 * Saca las claves con valor `undefined`, en profundidad.
 *
 * Firestore rechaza `undefined` con una excepción, y el motor usa campos
 * opcionales (`generic`, `caveats`, `composicion`) que existen o no existen.
 * Convertirlos a `null` sería mentir —"no hay caveats" y "el campo no aplica"
 * no son lo mismo—, así que la clave se va entera.
 */
export function sinIndefinidos<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.filter((v) => v !== undefined).map((v) => sinIndefinidos(v)) as unknown as T;
  }
  if (valor !== null && typeof valor === "object" && esObjetoPlano(valor)) {
    const limpio: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (v === undefined) continue;
      limpio[clave] = sinIndefinidos(v);
    }
    return limpio as unknown as T;
  }
  return valor;
}

/** Un objeto literal, no un `Timestamp` ni un `FieldValue` (esos viajan enteros). */
function esObjetoPlano(valor: object): boolean {
  const proto = Object.getPrototypeOf(valor) as unknown;
  return proto === Object.prototype || proto === null;
}
