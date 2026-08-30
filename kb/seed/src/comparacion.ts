/**
 * La comparación que decide si hay que escribir.
 *
 * El seed es idempotente por CONSTRUCCIÓN, no por disciplina: antes de escribir
 * un documento lee el que está y lo compara con el que iría. Si son idénticos,
 * no escribe. Por eso la comparación tiene que ser insensible al orden de las
 * claves (Firestore no conserva el orden de un mapa) y estable frente al viaje
 * de ida y vuelta por la API.
 *
 * Formato elegido: JSON canónico (claves ordenadas, recursivo) y comparación de
 * strings. Es determinístico, barato para 975 documentos y — a diferencia de un
 * recorrido a mano — no tiene ramas donde olvidarse un caso.
 */
import type { ValorJson } from "./valores";

/** Serializa un valor JSON con las claves de todo mapa ordenadas alfabéticamente. */
export function canonico(valor: ValorJson): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) {
    // El orden de un array SÍ es significativo: no se ordena.
    return `[${valor.map(canonico).join(",")}]`;
  }
  const partes: string[] = [];
  for (const clave of Object.keys(valor).sort()) {
    const contenido = valor[clave];
    if (contenido === undefined) continue;
    partes.push(`${JSON.stringify(clave)}:${canonico(contenido)}`);
  }
  return `{${partes.join(",")}}`;
}

/** ¿Estos dos valores JSON son el mismo, con independencia del orden de claves? */
export function iguales(a: ValorJson, b: ValorJson): boolean {
  return canonico(a) === canonico(b);
}

/**
 * Los campos de primer nivel en los que dos documentos difieren.
 *
 * Solo se usa para explicar (el `--dry-run` y los mensajes de la corrida):
 * "actualizado" sin decir qué cambió no informa nada.
 */
export function camposDistintos(
  actual: Record<string, ValorJson>,
  deseado: Record<string, ValorJson>,
): string[] {
  const claves = new Set([...Object.keys(actual), ...Object.keys(deseado)]);
  const distintos: string[] = [];
  for (const clave of [...claves].sort()) {
    const a = actual[clave];
    const b = deseado[clave];
    if (a === undefined && b === undefined) continue;
    if (a === undefined || b === undefined) {
      distintos.push(clave);
      continue;
    }
    if (!iguales(a, b)) distintos.push(clave);
  }
  return distintos;
}
