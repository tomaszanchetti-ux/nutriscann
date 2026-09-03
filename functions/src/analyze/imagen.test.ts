/**
 * Las decisiones de la foto, separadas de Cloud Storage.
 *
 * Todo lo que se puede probar sin nube se prueba sin nube: cómo se nombra el
 * objeto, cómo se escribe y se lee la referencia `gs://`, y de dónde sale el
 * bucket. El almacén real se ejerce con un bucket falso —cuatro líneas— porque
 * lo que hay que comprobar es el CONTRATO (qué ruta, qué `contentType`, qué
 * referencia devuelve), no la biblioteca de Google.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTENSIONES,
  SUFIJO_DEL_BUCKET_POR_DEFECTO,
  YA_EXISTIA,
  almacenEnBucket,
  nombreDelBucketDeFotos,
  partirReferencia,
  referenciaDeLaFoto,
  rutaDeLaFoto,
  type ArchivoDelBucket,
  type BucketDeFotos,
} from "./imagen";
import { MEDIA_TYPES } from "./vision";

// ---------------------------------------------------------------------------
// La ruta y la referencia
// ---------------------------------------------------------------------------

test("la ruta de la foto calza con la regla de storage.rules: scans/{ownerId}/{scanId}", () => {
  // La regla desplegada da lectura a `scans/{ownerId}/{scanId}`, y `{scanId}` es
  // UN segmento. El nombre del archivo con su extensión tiene que ser ese
  // segmento entero: si hubiera una barra de más, el objeto caería en el
  // `match /{allPaths=**}` que niega todo y el dueño no vería su propia foto.
  const ruta = rutaDeLaFoto("uid-de-tomas", "8f14e45f", "image/jpeg");

  assert.equal(ruta, "scans/uid-de-tomas/8f14e45f.jpg");
  assert.equal(ruta.split("/").length, 3, "tres segmentos: el prefijo, el dueño y el archivo");
});

test("los tres formatos que acepta la PWA tienen extensión, y ninguno más", () => {
  // El tipo ya lo obliga (`Record<MediaType, string>`); este test lo mira desde
  // el otro lado, para que agregar un formato en `vision.ts` sin decidir cómo se
  // llama el archivo no pase inadvertido.
  assert.deepEqual(Object.keys(EXTENSIONES).sort(), [...MEDIA_TYPES].sort());
  assert.deepEqual(
    MEDIA_TYPES.map((tipo) => rutaDeLaFoto("u", "s", tipo)),
    ["scans/u/s.jpg", "scans/u/s.png", "scans/u/s.webp"],
  );
});

test("la referencia se escribe y se lee: gs://bucket/ruta", () => {
  const referencia = referenciaDeLaFoto("nutriscann-f809e.firebasestorage.app", "scans/u/s.jpg");
  assert.equal(referencia, "gs://nutriscann-f809e.firebasestorage.app/scans/u/s.jpg");
  assert.deepEqual(partirReferencia(referencia), {
    bucket: "nutriscann-f809e.firebasestorage.app",
    ruta: "scans/u/s.jpg",
  });
});

test("lo que no es una referencia `gs://` no se parte a la fuerza", () => {
  // Devuelve `null` y quien llama decide. Adivinar un bucket o una ruta a partir
  // de una cadena rara terminaría en un borrado en el lugar equivocado.
  for (const raro of ["", "scans/u/s.jpg", "gs://", "gs://solo-bucket", "gs:///ruta", "https://x/y"]) {
    assert.equal(partirReferencia(raro), null, `"${raro}" no es una referencia`);
  }
});

// ---------------------------------------------------------------------------
// De dónde sale el bucket
// ---------------------------------------------------------------------------

test("el bucket sale del entorno, en el orden declarado", () => {
  const config = JSON.stringify({ projectId: "proyecto-x", storageBucket: "del-config.firebasestorage.app" });

  assert.equal(
    nombreDelBucketDeFotos({ STORAGE_BUCKET: "explicito", FIREBASE_CONFIG: config, GCLOUD_PROJECT: "proyecto-x" }),
    "explicito",
    "el override explícito gana: es la salida de emergencia sin desplegar",
  );
  assert.equal(
    nombreDelBucketDeFotos({ FIREBASE_CONFIG: config, GCLOUD_PROJECT: "proyecto-x" }),
    "del-config.firebasestorage.app",
    "después, lo que inyecta el runtime de Cloud Functions",
  );
  assert.equal(
    nombreDelBucketDeFotos({ GCLOUD_PROJECT: "proyecto-x" }),
    `proyecto-x${SUFIJO_DEL_BUCKET_POR_DEFECTO}`,
    "y al final la convención, con el projectId del entorno",
  );
  assert.equal(
    nombreDelBucketDeFotos({ FIREBASE_CONFIG: JSON.stringify({ projectId: "proyecto-x" }) }),
    `proyecto-x${SUFIJO_DEL_BUCKET_POR_DEFECTO}`,
    "el projectId también puede venir del propio FIREBASE_CONFIG",
  );
});

test("sin nada de dónde sacarlo, devuelve null en vez de inventar un nombre", () => {
  assert.equal(nombreDelBucketDeFotos({}), null);
  assert.equal(nombreDelBucketDeFotos({ STORAGE_BUCKET: "   " }), null, "una variable en blanco no es un bucket");
});

test("un FIREBASE_CONFIG roto no rompe la resolución del bucket", () => {
  // Cambiar "la foto no se guarda" por "el escaneo no funciona" sería un mal
  // negocio: un JSON mal formado se ignora y la cascada sigue.
  assert.equal(
    nombreDelBucketDeFotos({ FIREBASE_CONFIG: "{esto no es json", GCLOUD_PROJECT: "proyecto-x" }),
    `proyecto-x${SUFIJO_DEL_BUCKET_POR_DEFECTO}`,
  );
  assert.equal(nombreDelBucketDeFotos({ FIREBASE_CONFIG: "[1,2,3]" }), null, "un array tampoco trae storageBucket");
});

// ---------------------------------------------------------------------------
// El almacén, sobre un bucket falso
// ---------------------------------------------------------------------------

interface BucketEspiado extends BucketDeFotos {
  guardados: {
    ruta: string;
    bytes: number;
    contentType: string;
    resumable: boolean;
    ifGenerationMatch: number;
  }[];
  borrados: string[];
}

function bucketFalso(
  name = "un-bucket.firebasestorage.app",
  alGuardar?: () => never,
): BucketEspiado {
  const guardados: BucketEspiado["guardados"] = [];
  const borrados: string[] = [];
  return {
    name,
    guardados,
    borrados,
    file(ruta: string): ArchivoDelBucket {
      return {
        save: async (datos, opciones) => {
          if (alGuardar !== undefined) alGuardar();
          guardados.push({
            ruta,
            bytes: datos.length,
            contentType: opciones.contentType,
            resumable: opciones.resumable,
            ifGenerationMatch: opciones.preconditionOpts.ifGenerationMatch,
          });
        },
        delete: async () => {
          borrados.push(ruta);
        },
      };
    },
  };
}

/** Un error de la API de Storage, con el código donde la biblioteca lo pone. */
function errorDeStorage(code: number, mensaje: string): Error {
  const err = new Error(mensaje);
  (err as unknown as { code: number }).code = code;
  return err;
}

test("subir escribe los bytes de la imagen con su contentType y devuelve la referencia", async () => {
  const bucket = bucketFalso();
  const almacen = almacenEnBucket(() => bucket);
  // "hola" en base64: cuatro bytes. Lo que importa es que se DECODIFIQUE — subir
  // el base64 como texto guardaría un archivo que ningún visor puede abrir.
  const base64 = Buffer.from("hola").toString("base64");

  const ref = await almacen.subir({ owner_id: "u", scan_id: "s", media_type: "image/png", image_base64: base64 });

  assert.deepEqual(bucket.guardados, [
    { ruta: "scans/u/s.png", bytes: 4, contentType: "image/png", resumable: false, ifGenerationMatch: 0 },
  ]);
  assert.equal(ref, "gs://un-bucket.firebasestorage.app/scans/u/s.png");
});

test("la subida va CONDICIONADA, que es lo que le enciende los reintentos a GCS", async () => {
  // No es cosmética: en `@google-cloud/storage` 7.22 una escritura sin
  // precondición NO es idempotente y la biblioteca le pone `maxRetries = 0`
  // (`RetryConditional`). Sin el `ifGenerationMatch`, un 503 transitorio de GCS
  // —el caso normal, no el raro— pierde la foto en el primer intento. Este test
  // es el candado de esa línea: si alguien la saca, se cae acá.
  const bucket = bucketFalso();
  const almacen = almacenEnBucket(() => bucket);

  await almacen.subir({ owner_id: "u", scan_id: "s", media_type: "image/jpeg", image_base64: "AAAA" });

  assert.equal(bucket.guardados[0]?.ifGenerationMatch, 0, "0 = el objeto todavía no existe");
});

test("un 412 no es un fallo: es el reintento de una escritura que ya había salido bien", async () => {
  // LA CONTRAPARTIDA DE CONDICIONAR LA ESCRITURA, ejercida. Si un intento
  // escribe y la respuesta se pierde, el reintento choca con el objeto ya
  // creado y la API contesta 412. La foto ESTÁ, y es la de este escaneo (la
  // ruta la da su `scan_id`): devolver un error escribiría `image_error` en un
  // expediente cuya foto existe, que es peor que no anotar nada.
  const bucket = bucketFalso("un-bucket.firebasestorage.app", () => {
    throw errorDeStorage(YA_EXISTIA, "At least one of the pre-conditions you specified did not hold.");
  });
  const almacen = almacenEnBucket(() => bucket);

  const ref = await almacen.subir({ owner_id: "u", scan_id: "s", media_type: "image/jpeg", image_base64: "AAAA" });

  assert.equal(ref, "gs://un-bucket.firebasestorage.app/scans/u/s.jpg", "la referencia sale igual");
});

test("cualquier OTRO error de la subida sí se propaga", async () => {
  // El 412 es la única excepción, y tiene que serlo: un 403 de permisos o un
  // 404 de bucket inexistente son fallos de verdad y el expediente los tiene
  // que decir en `image_error`.
  const bucket = bucketFalso("un-bucket.firebasestorage.app", () => {
    throw errorDeStorage(403, "does not have storage.objects.create access");
  });
  const almacen = almacenEnBucket(() => bucket);

  await assert.rejects(
    () => almacen.subir({ owner_id: "u", scan_id: "s", media_type: "image/jpeg", image_base64: "AAAA" }),
    /storage.objects.create/,
  );
});

test("borrar saca el objeto que nombra la referencia", async () => {
  const bucket = bucketFalso();
  const almacen = almacenEnBucket(() => bucket);

  await almacen.borrar("gs://un-bucket.firebasestorage.app/scans/u/s.jpg");
  assert.deepEqual(bucket.borrados, ["scans/u/s.jpg"]);
});

test("borrar se niega a tocar un bucket que no es el suyo", async () => {
  // Un borrado es irreversible y la comparación cuesta nada. El escenario se
  // CONSTRUYE: hoy la referencia siempre sale de nuestro propio `subir`, y el
  // candado tiene que existir igual para el día que haya dos buckets.
  const bucket = bucketFalso();
  const almacen = almacenEnBucket(() => bucket);

  await assert.rejects(() => almacen.borrar("gs://otro-bucket/scans/u/s.jpg"), /otro-bucket/);
  await assert.rejects(() => almacen.borrar("scans/u/s.jpg"), /gs:\/\/bucket\/ruta/);
  assert.deepEqual(bucket.borrados, [], "no se borró nada");
});

test("el bucket se abre recién cuando se sube algo, no al construir el almacén", async () => {
  // Por lo mismo que el cliente de Anthropic se construye perezosamente
  // (`index.ts`): `getStorage()` al cargar el módulo correría también en
  // `health`, que no tiene nada que ver con Storage.
  let aperturas = 0;
  const bucket = bucketFalso();
  const almacen = almacenEnBucket(() => {
    aperturas += 1;
    return bucket;
  });

  assert.equal(aperturas, 0, "construir el almacén no abre nada");
  await almacen.subir({ owner_id: "u", scan_id: "s", media_type: "image/jpeg", image_base64: "AAAA" });
  assert.equal(aperturas, 1);
});
