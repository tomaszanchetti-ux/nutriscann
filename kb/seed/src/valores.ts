/**
 * Traducción JSON ⇄ "Values" de Firestore, genérica y recursiva.
 *
 * Por qué genérica: el seed es AGNÓSTICO del esquema del alimento. El catálogo
 * canónico crece (aliases nuevos, campos nuevos, un formato distinto de
 * porciones) y el seed no se toca: lo que llegue en `foods[]` se serializa tal
 * cual. Si el seed conociera el esquema, cada cambio del catálogo lo rompería.
 *
 * La API REST de Firestore no acepta JSON pelado: cada valor viaja etiquetado
 * con su tipo (`{"stringValue": "pollo"}`). Este archivo es esa traducción, en
 * los dos sentidos, y es la pieza de la que depende la idempotencia: si ida y
 * vuelta no dan lo mismo, el seed vería diferencias donde no las hay y
 * reescribiría todo en cada corrida.
 */

/** Un valor JSON cualquiera: lo único que el seed asume del catálogo. */
export type ValorJson = null | boolean | number | string | ValorJson[] | { [clave: string]: ValorJson };

/** Un valor en el formato de la API REST de Firestore. */
export type ValorFirestore = Record<string, unknown>;

/** Los campos de un documento: nombre → valor Firestore. */
export type CamposFirestore = Record<string, ValorFirestore>;

/** Un documento leído de Firestore, ya traducido a JSON pelado. */
export type DocumentoJson = Record<string, ValorJson>;

/**
 * JSON → Firestore.
 *
 * Regla de números: entero seguro ⇒ `integerValue`, el resto ⇒ `doubleValue`.
 * Es determinística y round-trip estable (un `integerValue` vuelve como entero
 * y un `doubleValue` como decimal), que es lo único que la idempotencia pide.
 */
export function aFirestore(valor: ValorJson): ValorFirestore {
  if (valor === null) return { nullValue: null };
  if (typeof valor === "boolean") return { booleanValue: valor };
  if (typeof valor === "string") return { stringValue: valor };
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) {
      throw new Error(`Número no representable en Firestore: ${String(valor)}`);
    }
    if (Number.isInteger(valor) && Number.isSafeInteger(valor)) {
      return { integerValue: String(valor) };
    }
    return { doubleValue: valor };
  }
  if (Array.isArray(valor)) {
    return { arrayValue: { values: valor.map(aFirestore) } };
  }
  if (typeof valor === "object") {
    return { mapValue: { fields: camposDesdeObjeto(valor) } };
  }
  throw new Error(`Tipo no soportado en el catálogo: ${typeof valor}`);
}

/** Un objeto JSON → los `fields` de un documento de Firestore. */
export function camposDesdeObjeto(objeto: Record<string, ValorJson>): CamposFirestore {
  const campos: CamposFirestore = {};
  // Orden alfabético: el cuerpo del request es idéntico entre corridas.
  for (const clave of Object.keys(objeto).sort()) {
    const valor = objeto[clave];
    if (valor === undefined) continue;
    campos[clave] = aFirestore(valor as ValorJson);
  }
  return campos;
}

/**
 * Firestore → JSON.
 *
 * `integerValue` viaja como string en la API REST (y a veces como número): se
 * normaliza a número para que la comparación con el catálogo sea directa.
 * Limitación declarada: un entero mayor a 2^53 pierde precisión al normalizar.
 * El catálogo no tiene ninguno (el máximo hoy es un sodio de 4 cifras), pero si
 * algún día lo tuviera, ese documento se vería siempre "distinto" y se
 * reescribiría en cada corrida — ruidoso, nunca incorrecto.
 */
export function aJson(valor: ValorFirestore): ValorJson {
  if ("nullValue" in valor) return null;
  if ("booleanValue" in valor) return Boolean(valor["booleanValue"]);
  if ("stringValue" in valor) return String(valor["stringValue"]);
  if ("integerValue" in valor) return Number(valor["integerValue"]);
  if ("doubleValue" in valor) return Number(valor["doubleValue"]);
  if ("timestampValue" in valor) return String(valor["timestampValue"]);
  if ("bytesValue" in valor) return String(valor["bytesValue"]);
  if ("referenceValue" in valor) return String(valor["referenceValue"]);
  if ("geoPointValue" in valor) {
    const punto = (valor["geoPointValue"] ?? {}) as Record<string, unknown>;
    return { latitude: Number(punto["latitude"] ?? 0), longitude: Number(punto["longitude"] ?? 0) };
  }
  if ("arrayValue" in valor) {
    const contenido = (valor["arrayValue"] ?? {}) as { values?: ValorFirestore[] };
    // Un array vacío vuelve como `{"arrayValue":{}}`, sin la clave `values`.
    return (contenido.values ?? []).map(aJson);
  }
  if ("mapValue" in valor) {
    const contenido = (valor["mapValue"] ?? {}) as { fields?: CamposFirestore };
    return objetoDesdeCampos(contenido.fields ?? {});
  }
  throw new Error(`Valor de Firestore no reconocido: ${JSON.stringify(valor)}`);
}

/** Los `fields` de un documento de Firestore → objeto JSON. */
export function objetoDesdeCampos(campos: CamposFirestore): DocumentoJson {
  const objeto: DocumentoJson = {};
  for (const clave of Object.keys(campos).sort()) {
    const valor = campos[clave];
    if (valor === undefined) continue;
    objeto[clave] = aJson(valor);
  }
  return objeto;
}
