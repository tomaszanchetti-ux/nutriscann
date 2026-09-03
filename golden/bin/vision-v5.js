#!/usr/bin/env node
/**
 * vision-v5.js — la visión de la card 5.2, corrida contra las 30 fotos reales.
 *
 * CUESTA PLATA: son 30 llamadas al modelo. Ningún test lo invoca y ningún CI lo
 * corre; se corre a mano, una vez, y lo que deja grabado en `set-30/vision-v5/`
 * se puede leer todas las veces que haga falta sin gastar un centavo más. Por eso
 * se PLANTA si el directorio de salida ya tiene respuestas: repetir la corrida
 * sin querer es la forma barata de gastar plata dos veces.
 *
 * Qué mide, y por qué existe separado del `runner.sh`: el runner llama al
 * ENDPOINT entero (visión + motor + Firestore + cupo) y necesita emulador y
 * sesión. Acá se quiere medir SOLO el paso 1 —qué subfamilia elige la visión,
 * cuántos ingredientes declara, si lee la etiqueta de un envase, y cuánto pesa el
 * prompt con y sin caché—, así que se llama a `pedirVision` a pelo, con el mismo
 * cliente y el mismo prompt que usa producción.
 *
 * Uso:
 *   node golden/bin/vision-v5.js                 # las 30
 *   node golden/bin/vision-v5.js -f '3.'         # solo las que matcheen
 *   node golden/bin/vision-v5.js --forzar        # sobreescribe lo grabado
 *   node golden/bin/vision-v5.js --salida=vision-v6
 *
 * Requiere `functions/lib` compilado (`cd functions && npm run build`) y la key
 * en `functions/.secret.local` (o en el entorno, como ANTHROPIC_API_KEY).
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");

const RAIZ = path.resolve(__dirname, "..", "..");
const LIB = path.join(RAIZ, "functions", "lib", "analyze");
const CUERPOS = path.join(RAIZ, "golden", "set-30", "bodies-v3");

if (!fs.existsSync(path.join(LIB, "vision.js"))) {
  console.error("Falta compilar el backend. Corré:  cd functions && npm run build");
  process.exit(2);
}

const { pedirVision, crearClienteDeVision, PROMPT_VISION } = require(path.join(LIB, "vision.js"));

const args = process.argv.slice(2);
const forzar = args.includes("--forzar");
const filtro = args.includes("-f") ? (args[args.indexOf("-f") + 1] ?? "") : "";
const regex = filtro.length > 0 ? new RegExp(filtro) : null;
const salida = (args.find((a) => a.startsWith("--salida=")) ?? "--salida=vision-v5").split("=")[1];
const DESTINO = path.join(RAIZ, "golden", "set-30", salida);

/**
 * La key. Sale de `functions/.secret.local`, que es el mismo archivo que leen los
 * emuladores; el repo no la tiene y `.gitignore` la deja afuera.
 */
function leerKey() {
  if ((process.env.ANTHROPIC_API_KEY ?? "").trim().length > 0) return process.env.ANTHROPIC_API_KEY.trim();
  const archivo = path.join(RAIZ, "functions", ".secret.local");
  if (!fs.existsSync(archivo)) return "";
  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    const [clave, ...resto] = linea.split("=");
    if ((clave ?? "").trim() === "ANTHROPIC_API_KEY") return resto.join("=").trim();
  }
  return "";
}

const key = leerKey();
if (key.length === 0) {
  console.error(
    "No hay ANTHROPIC_API_KEY. Poné la key en functions/.secret.local (ANTHROPIC_API_KEY=...) " +
      "o exportala en el entorno. El script queda listo: no se llamó a nada.",
  );
  process.exit(3);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * El cliente real, envuelto para quedarse con la RESPUESTA CRUDA.
 *
 * `pedirVision` devuelve el `VisionResult` ya saneado, que es lo que ve el motor.
 * Para juzgar al modelo hace falta lo otro: lo que escribió antes de que el saneo
 * lo tocara. El envoltorio guarda el último mensaje sin alterar nada de la
 * llamada — mismo prompt, mismo esquema, mismo caché que en producción.
 */
function clienteQueGraba() {
  const real = crearClienteDeVision(key, (process.env.ANTHROPIC_WORKSPACE_ID ?? "").trim());
  const caja = { ultima: null };
  return {
    caja,
    cliente: {
      messages: {
        create: async (params) => {
          const respuesta = await real.messages.create(params);
          caja.ultima = respuesta;
          return respuesta;
        },
      },
    },
  };
}

async function main() {
  const archivos = fs
    .readdirSync(CUERPOS)
    .filter((n) => n.endsWith(".json"))
    .filter((n) => regex === null || regex.test(n))
    .sort();

  if (archivos.length === 0) {
    console.error(`No hay cuerpos que correr en ${CUERPOS}`);
    process.exit(4);
  }

  fs.mkdirSync(DESTINO, { recursive: true });
  const yaGrabados = fs.readdirSync(DESTINO).filter((n) => n.endsWith(".json"));
  if (yaGrabados.length > 0 && !forzar) {
    console.error(
      `${DESTINO} ya tiene ${yaGrabados.length} respuestas grabadas. Cada corrida son ` +
        `${archivos.length} llamadas pagas: si de verdad querés repetirla, pasá --forzar.`,
    );
    process.exit(5);
  }

  console.log(`Prompt de sistema: ${PROMPT_VISION.length.toLocaleString("es-ES")} caracteres.`);
  console.log(`${archivos.length} fotos → ${DESTINO}\n`);

  const filas = [];
  for (const archivo of archivos) {
    const nombre = archivo.replace(/\.json$/, "");
    const cuerpo = JSON.parse(fs.readFileSync(path.join(CUERPOS, archivo), "utf8"));
    const { cliente, caja } = clienteQueGraba();

    let fila;
    try {
      const { vision, meta } = await pedirVision(cliente, {
        image_base64: cuerpo.image_base64,
        media_type: cuerpo.media_type,
      });
      const crudo = caja.ultima;
      const texto = (crudo?.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      fs.writeFileSync(
        path.join(DESTINO, archivo),
        `${JSON.stringify({ foto: nombre, meta, vision, crudo: safeParse(texto), usage: crudo?.usage ?? null }, null, 2)}\n`,
      );

      fila = {
        foto: nombre,
        ok: true,
        is_food: vision.is_food,
        items: vision.items.length,
        subfamilias: vision.items.map((i) => i.familia_subfamilia ?? "—"),
        componentes: vision.items.reduce((n, i) => n + (i.components?.length ?? 0), 0),
        etiquetas: vision.items.filter((i) => (i.etiqueta_del_envase ?? "").length > 0).length,
        tokens_in: meta.tokens_in,
        cache_write: meta.tokens_cache_write,
        cache_read: meta.tokens_cache_read,
        tokens_out: meta.tokens_out,
        latency_ms: meta.latency_ms,
      };
    } catch (err) {
      fila = { foto: nombre, ok: false, error: `${err.codigo ?? err.name}: ${err.detalle ?? err.message}` };
      fs.writeFileSync(path.join(DESTINO, archivo), `${JSON.stringify({ foto: nombre, error: fila.error }, null, 2)}\n`);
    }

    filas.push(fila);
    console.log(
      fila.ok
        ? `${fila.foto.padEnd(26)} is_food=${String(fila.is_food).padEnd(5)} items=${String(fila.items).padStart(2)} ` +
            `comp=${String(fila.componentes).padStart(2)} etiq=${fila.etiquetas} ` +
            `in=${String(fila.tokens_in).padStart(5)} w=${String(fila.cache_write).padStart(5)} ` +
            `r=${String(fila.cache_read).padStart(5)} out=${String(fila.tokens_out).padStart(4)}  ` +
            fila.subfamilias.join(", ")
        : `${fila.foto.padEnd(26)} ERROR  ${fila.error}`,
    );

    // En serie y con pausa: el modelo se rate-limitea, y en paralelo la primera
    // llamada no llega a escribir el caché antes de que salgan las otras 29.
    await esperar(1500);
  }

  const buenas = filas.filter((f) => f.ok);
  const totalIn = buenas.reduce((n, f) => n + f.tokens_in, 0);
  const totalWrite = buenas.reduce((n, f) => n + f.cache_write, 0);
  const totalRead = buenas.reduce((n, f) => n + f.cache_read, 0);
  console.log(
    `\n${buenas.length}/${filas.length} OK · tokens de entrada frescos ${totalIn} · ` +
      `escritos al caché ${totalWrite} · leídos del caché ${totalRead}`,
  );
  fs.writeFileSync(path.join(DESTINO, "_resumen.json"), `${JSON.stringify(filas, null, 2)}\n`);
}

function safeParse(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
