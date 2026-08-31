/**
 * La semántica del seed de `config/app`.
 *
 * Mismo patrón que el seed del catálogo, y por las mismas razones:
 *
 *   DECISIÓN (`planificarConfig`)  pura, sin red: lo que hay publicado + lo que
 *                                  dice el repo ⇒ qué campos habría que
 *                                  escribir. Se testea construyendo el caso.
 *   ESCRITURA (`correrSeedConfig`) habla con Firestore y aplica esa decisión.
 *
 * Lo que este seed gobierna y lo que NO
 * ------------------------------------
 * `config/app` es un documento COMPARTIDO: la Fase 2 publica ahí las reglas y
 * la versión del catálogo, pero el mismo documento tiene los textos de la
 * interfaz (`copy`) y el tope de análisis por día (`max_scans_per_day`), que
 * son de otra mano. Por eso la escritura es un MERGE con máscara de campos:
 * el seed toca sus cuatro campos y **no puede** pisar el resto ni por
 * accidente — no es una promesa del código, es lo que permite la máscara.
 *
 * La idempotencia funciona igual que en el catálogo: se lee lo publicado, se
 * compara en JSON canónico y si no difiere no se escribe. `updated_at` se
 * mueve solo cuando el contenido cambió; si se estampara siempre, la segunda
 * corrida escribiría y la idempotencia sería una frase en un README en vez de
 * un número verificable.
 */
import { iguales } from "./comparacion";
import { ClienteFirestore, type DocumentoJson } from "./firestore";
import type { Reglas } from "./reglas";
import type { ValorJson } from "./valores";

export const COLECCION_CONFIG = "config";
export const DOCUMENTO_APP = "app";

/** Quién escribió estos campos. Queda en el documento para que se pueda auditar. */
export const AUTOR = "seed-config";

/** El campo con la marca de tiempo. Se escribe solo cuando algo cambió. */
export const CAMPO_FECHA = "updated_at";

/**
 * Los campos de `config/app` que este seed gobierna. Todo lo que no esté en
 * esta lista es de otra mano y se preserva.
 */
export const CAMPOS_GOBERNADOS = ["recommendation_rules", "kb_version", "updated_by"] as const;

/** Los campos que viajan en la máscara: los gobernados más la fecha. */
export const CAMPOS_DE_LA_MASCARA = [...CAMPOS_GOBERNADOS, CAMPO_FECHA];

export interface PlanConfig {
  /** El valor que le corresponde a cada campo gobernado. */
  deseado: Record<string, ValorJson>;
  /** ¿Existe ya el documento? */
  existe: boolean;
  /** Los campos gobernados que difieren de lo publicado. Vacío ⇒ no se escribe. */
  campos: string[];
  /** Los campos de otra mano que el documento ya tiene y quedan intactos. */
  preservados: string[];
}

/**
 * Compara lo publicado con lo que dice el repo y decide qué campos escribir.
 * Pura: recibe el documento, no lo lee.
 */
export function planificarConfig(
  publicado: DocumentoJson | null,
  reglas: Reglas,
  kbVersion: string,
): PlanConfig {
  const deseado: Record<string, ValorJson> = {
    recommendation_rules: reglas.documento,
    kb_version: kbVersion,
    updated_by: AUTOR,
  };

  const actual = publicado ?? {};
  const campos = CAMPOS_GOBERNADOS.filter((campo) => {
    const publicadoAhora = actual[campo];
    if (publicadoAhora === undefined) return true;
    return !iguales(publicadoAhora, deseado[campo] as ValorJson);
  });

  const gobernados = new Set<string>([...CAMPOS_GOBERNADOS, CAMPO_FECHA]);
  const preservados = Object.keys(actual)
    .filter((campo) => !gobernados.has(campo))
    .sort();

  return { deseado, existe: publicado !== null, campos: [...campos], preservados };
}

/** Cuántas escrituras implica el plan: una o ninguna. Cero ⇒ la corrida es un no-op. */
export function escriturasDelPlanConfig(plan: PlanConfig): number {
  return plan.campos.length > 0 ? 1 : 0;
}

export interface ResultadoConfig {
  plan: PlanConfig;
  escrituras: number;
  seco: boolean;
}

export interface OpcionesConfig {
  /** Reporta el diff y no escribe nada. */
  seco?: boolean;
  /** Inyectable para que los tests no dependan del reloj. */
  ahora?: () => Date;
}

/**
 * Corre el seed de configuración contra un destino: lee `config/app`, decide y
 * escribe solo los campos que difieren, con MERGE.
 */
export async function correrSeedConfig(
  cliente: ClienteFirestore,
  reglas: Reglas,
  kbVersion: string,
  opciones: OpcionesConfig = {},
): Promise<ResultadoConfig> {
  const seco = opciones.seco === true;
  const publicado = await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_APP);
  const plan = planificarConfig(publicado, reglas, kbVersion);
  const escrituras = escriturasDelPlanConfig(plan);

  if (seco || escrituras === 0) return { plan, escrituras, seco };

  const ahora = (opciones.ahora ?? (() => new Date()))();
  await cliente.escribirDocumento(
    COLECCION_CONFIG,
    DOCUMENTO_APP,
    plan.deseado,
    CAMPOS_DE_LA_MASCARA,
    { [CAMPO_FECHA]: { timestampValue: ahora.toISOString() } },
  );

  return { plan, escrituras, seco };
}
