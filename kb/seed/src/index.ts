/**
 * Punto de entrada del seed.
 *
 *   node dist/index.js --project nutriscann-f809e --emulator
 *   node dist/index.js --project nutriscann-f809e --token "$(gcloud auth print-access-token)"
 *   node dist/index.js --project nutriscann-f809e --emulator --dry-run
 *
 * El reporte se imprime siempre y con números: una corrida que dice "listo" sin
 * decir cuántos documentos creó, actualizó, dejó quietos y deprecó no informa
 * nada — y la idempotencia se verifica leyendo justamente esos números.
 */
import { resolve } from "node:path";

import { cargarCatalogo } from "./catalogo";
import { ClienteFirestore, crearDestino } from "./firestore";
import { correrSeed, type ResultadoCorrida } from "./seed";

const CATALOGO_POR_DEFECTO = resolve(__dirname, "..", "..", "build", "foods.canonical.json");
const EJEMPLOS_POR_GRUPO = 10;

interface Opciones {
  catalogo: string;
  proyecto: string;
  emulador: boolean;
  seco: boolean;
  token: string | undefined;
  host: string | undefined;
  baseDeDatos: string | undefined;
  maximoDeprecaciones: number | undefined;
  ayuda: boolean;
}

const AYUDA = `
Seed idempotente del catálogo canónico a Firestore.

  node dist/index.js --project <id> [--emulator | --token <access-token>] [opciones]

Opciones
  --project <id>       Proyecto de Firebase/GCP. Obligatorio.
  --catalog <ruta>     Catálogo a publicar.
                       Por defecto: kb/build/foods.canonical.json
  --emulator           Escribe contra el emulador de Firestore en vez del
                       proyecto real. Usa FIRESTORE_EMULATOR_HOST si está
                       seteada; si no, localhost:8080.
  --token <token>      Access token OAuth para el proyecto real. También se
                       puede pasar por la variable SEED_TOKEN. El seed no
                       genera credenciales: las recibe.
  --host <host>        Sobrescribe el host (emulador: "localhost:8080";
                       real: "https://firestore.googleapis.com").
  --database <id>      Base de datos de Firestore. Por defecto "(default)".
  --dry-run            Calcula el diff y lo reporta SIN escribir nada.
  --allow-deprecations <n>
                       Autoriza hasta n deprecaciones en esta corrida. Sin este
                       flag, una corrida que quiera deprecar más del 10 % de lo
                       publicado ABORTA sin escribir nada.
  --help               Esto.

Qué hace
  - Upsert por id de cada alimento del catálogo en foods/{id}, con kb_version
    estampada en el documento. Si el documento publicado ya es idéntico, no se
    escribe: la segunda corrida seguida hace CERO escrituras.
  - Un documento de foods/ que ya no está en el catálogo se marca
    deprecated: true (merge, sin pisar el resto). Nunca se borra.
  - Si esas deprecaciones superan el 10 % de lo publicado, la corrida aborta sin
    escribir nada: casi siempre es un catálogo truncado, no una baja masiva real.
  - Al cierre publica config/kb_meta con la versión, la fecha y los conteos.
`;

function parsearArgumentos(argv: string[]): Opciones {
  const opciones: Opciones = {
    catalogo: CATALOGO_POR_DEFECTO,
    proyecto: "",
    emulador: false,
    seco: false,
    token: undefined,
    host: undefined,
    baseDeDatos: undefined,
    maximoDeprecaciones: undefined,
    ayuda: false,
  };
  for (let indice = 0; indice < argv.length; indice += 1) {
    const argumento = argv[indice];
    const siguiente = (): string => {
      const valor = argv[indice + 1];
      if (valor === undefined || valor.startsWith("--")) {
        throw new Error(`La opción ${argumento} necesita un valor`);
      }
      indice += 1;
      return valor;
    };
    switch (argumento) {
      case "--help":
      case "-h":
        opciones.ayuda = true;
        break;
      case "--catalog":
      case "--catalogo":
        opciones.catalogo = resolve(process.cwd(), siguiente());
        break;
      case "--project":
      case "--proyecto":
        opciones.proyecto = siguiente();
        break;
      case "--emulator":
      case "--emulador":
        opciones.emulador = true;
        break;
      case "--dry-run":
      case "--seco":
        opciones.seco = true;
        break;
      case "--token":
        opciones.token = siguiente();
        break;
      case "--host":
        opciones.host = siguiente();
        break;
      case "--database":
        opciones.baseDeDatos = siguiente();
        break;
      case "--allow-deprecations": {
        const valor = Number(siguiente());
        if (!Number.isInteger(valor) || valor < 0) {
          throw new Error("--allow-deprecations necesita un entero mayor o igual a 0");
        }
        opciones.maximoDeprecaciones = valor;
        break;
      }
      default:
        throw new Error(`Opción desconocida: ${argumento}`);
    }
  }
  return opciones;
}

function linea(etiqueta: string, valor: string | number): void {
  console.log(`  ${etiqueta.padEnd(28, ".")} ${valor}`);
}

function ejemplos(ids: string[]): string {
  if (ids.length === 0) return "";
  const muestra = ids.slice(0, EJEMPLOS_POR_GRUPO).join(", ");
  return ids.length > EJEMPLOS_POR_GRUPO ? `${muestra}, … (+${ids.length - EJEMPLOS_POR_GRUPO})` : muestra;
}

function reportar(resultado: ResultadoCorrida, version: string, destino: string): void {
  const { plan, conteos } = resultado;
  console.log(`\n== Seed ==${resultado.seco ? " SIMULACRO: no se escribió nada" : ""}`);
  linea("destino", destino);
  linea("kb_version", version);

  console.log("\n== Resultado ==");
  linea("alimentos en el catálogo", conteos.total);
  linea("creados", conteos.created);
  linea("actualizados", conteos.updated);
  linea("sin cambio", conteos.unchanged);
  linea("deprecados ahora", conteos.deprecated);
  linea("ya estaban deprecados", plan.yaDeprecados.length);
  linea("escrituras", resultado.seco ? `${resultado.escrituras} (simuladas)` : resultado.escrituras);
  linea(
    "config/kb_meta",
    resultado.seco
      ? resultado.metaSeEscribiria
        ? "se actualizaría"
        : "quedaría sin cambio"
      : resultado.metaEscrita
        ? "actualizado"
        : "sin cambio",
  );

  if (plan.crear.length > 0) console.log(`\n  creados: ${ejemplos(plan.crear.map((e) => e.id))}`);
  if (plan.actualizar.length > 0) {
    console.log("\n  actualizados (campos que difieren):");
    for (const entrada of plan.actualizar.slice(0, EJEMPLOS_POR_GRUPO)) {
      console.log(`    ${entrada.id}: ${(entrada.campos ?? []).join(", ")}`);
    }
    if (plan.actualizar.length > EJEMPLOS_POR_GRUPO) {
      console.log(`    … (+${plan.actualizar.length - EJEMPLOS_POR_GRUPO})`);
    }
  }
  if (plan.aDeprecar.length > 0) {
    console.log(`\n  deprecados (marcados, NO borrados): ${ejemplos(plan.aDeprecar)}`);
  }

  if (resultado.escrituras === 0 && !resultado.seco) {
    console.log("\n  Cero escrituras: lo publicado ya es exactamente el catálogo.");
  }
  if (resultado.frenoSuperado) {
    console.log(
      `\n  ⚠️  La corrida REAL abortaría: ${resultado.freno.pedidas} deprecaciones sobre ` +
        `${resultado.freno.publicados} documentos publicados, y el máximo sin permiso ` +
        `explícito es ${resultado.freno.limite}. Revisá el catálogo; si la baja masiva es ` +
        `intencional, autorizala con --allow-deprecations ${resultado.freno.pedidas}.`,
    );
  }
  console.log("");
}

async function principal(): Promise<void> {
  const opciones = parsearArgumentos(process.argv.slice(2));
  if (opciones.ayuda) {
    console.log(AYUDA);
    return;
  }
  if (opciones.proyecto === "") {
    throw new Error("Falta --project. No hay proyecto por defecto a propósito: escribir en el proyecto equivocado se evita obligando a nombrarlo.");
  }

  const catalogo = cargarCatalogo(opciones.catalogo);
  const destino = crearDestino({
    proyecto: opciones.proyecto,
    emulador: opciones.emulador,
    host: opciones.host,
    token: opciones.token,
    baseDeDatos: opciones.baseDeDatos,
  });

  if (!destino.esEmulador && !opciones.seco) {
    console.log(`\n  ⚠️  Escribiendo en el PROYECTO REAL '${destino.proyecto}'.`);
  }

  const cliente = new ClienteFirestore(destino);
  const resultado = await correrSeed(cliente, catalogo, {
    seco: opciones.seco,
    maximoDeprecaciones: opciones.maximoDeprecaciones,
  });
  reportar(resultado, catalogo.kb_version, destino.descripcion);
  // Un simulacro que muestra el freno no "falló", pero tampoco está bien: el
  // código de salida lo tiene que decir para que un script no lo pase por alto.
  if (resultado.frenoSuperado) process.exitCode = 1;
}

if (require.main === module) {
  principal().catch((error: Error) => {
    console.error(`\n  ✗ El seed no se completó: ${error.message}\n`);
    process.exitCode = 1;
  });
}
