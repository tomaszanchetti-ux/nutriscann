/**
 * Punto de entrada del seed de configuración.
 *
 *   node dist/seed-config.js --project nutriscann-f809e --emulator
 *   node dist/seed-config.js --project nutriscann-f809e --token "$(gcloud auth print-access-token)"
 *   node dist/seed-config.js --project nutriscann-f809e --emulator --dry-run
 *
 * Publica en `config/app` las reglas de recomendación del repo, los textos de
 * la interfaz y la versión del catálogo. Es el hermano del seed de alimentos:
 * mismo cliente REST, misma idempotencia por comparación, mismos flags. Lo que
 * cambia es el destino —un único documento compartido en vez de una colección—
 * y por eso escribe con MERGE: los campos de otra mano (`max_scans_per_day`) no
 * se tocan.
 *
 * El reporte se imprime siempre y con números: una corrida que dice "listo" sin
 * decir qué campos escribió y cuáles preservó no informa nada.
 */
import { resolve } from "node:path";

import { cargarCatalogo } from "./catalogo";
import {
  CAMPOS_DE_LA_MASCARA,
  COLECCION_CONFIG,
  DOCUMENTO_APP,
  correrSeedConfig,
  type ResultadoConfig,
} from "./configuracion";
import { crearDestino, ClienteFirestore } from "./firestore";
import { cargarReglas, type Reglas } from "./reglas";
import { cargarTextos, type Textos } from "./textos";

const RAIZ = resolve(__dirname, "..", "..", "..");
const REGLAS_POR_DEFECTO = resolve(RAIZ, "config", "recommendation_rules.json");
const TEXTOS_POR_DEFECTO = resolve(RAIZ, "config", "copy.json");
const CATALOGO_POR_DEFECTO = resolve(__dirname, "..", "..", "build", "foods.canonical.json");

interface Opciones {
  reglas: string;
  textos: string;
  catalogo: string;
  proyecto: string;
  emulador: boolean;
  seco: boolean;
  token: string | undefined;
  host: string | undefined;
  baseDeDatos: string | undefined;
  ayuda: boolean;
}

const AYUDA = `
Seed idempotente de la configuración (config/app) a Firestore.

  node dist/seed-config.js --project <id> [--emulator | --token <access-token>] [opciones]

Opciones
  --project <id>       Proyecto de Firebase/GCP. Obligatorio.
  --rules <ruta>       Documento de reglas a publicar.
                       Por defecto: config/recommendation_rules.json
  --copy <ruta>        Documento de textos de la interfaz a publicar.
                       Por defecto: config/copy.json
  --catalog <ruta>     De dónde sale la kb_version que se estampa. Es el MISMO
                       archivo que publica el seed de alimentos, para que la
                       versión del documento y la de foods/ no puedan divergir.
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
  --help               Esto.

Qué hace
  - Valida los dos documentos ANTES de tocar la red.
      reglas  la lista cerrada de tags, que el tag de cada regla y el
              fallback_tag pertenezcan a ella, y que ninguna condición nombre
              un identificador que el motor no conoce.
      textos  que 'copy' tenga exactamente las claves que 'keys' declara —ni
              una de menos ni una de más— y que ninguna esté vacía. Una clave
              mal tipeada no rompe nada visible: la pantalla cae al arranque en
              frío del front y el error se degrada en silencio.
  - Escribe en config/app, con MERGE de cinco campos:
      recommendation_rules  el documento de reglas entero, tal cual el repo
      copy                  el mapa de textos de la interfaz, entero
      kb_version            la versión del catálogo canónico
      updated_by            "seed-config"
      updated_at            cuándo cambió por última vez lo publicado
    Todo lo demás que tenga el documento (max_scans_per_day, …) queda intacto:
    la máscara de campos no lo alcanza.
  - OJO: 'copy' se escribe ENTERO. Una clave agregada a mano en la consola se
    pierde en la corrida siguiente — la fuente de verdad es el repo.
  - Si lo publicado ya es idéntico, no escribe: la segunda corrida seguida hace
    CERO escrituras.
`;

function parsearArgumentos(argv: string[]): Opciones {
  const opciones: Opciones = {
    reglas: REGLAS_POR_DEFECTO,
    textos: TEXTOS_POR_DEFECTO,
    catalogo: CATALOGO_POR_DEFECTO,
    proyecto: "",
    emulador: false,
    seco: false,
    token: undefined,
    host: undefined,
    baseDeDatos: undefined,
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
      case "--rules":
      case "--reglas":
        opciones.reglas = resolve(process.cwd(), siguiente());
        break;
      case "--copy":
      case "--textos":
        opciones.textos = resolve(process.cwd(), siguiente());
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
      default:
        throw new Error(`Opción desconocida: ${argumento}`);
    }
  }
  return opciones;
}

function linea(etiqueta: string, valor: string | number): void {
  console.log(`  ${etiqueta.padEnd(28, ".")} ${valor}`);
}

function reportar(
  resultado: ResultadoConfig,
  reglas: Reglas,
  textos: Textos,
  version: string,
  destino: string,
  rutaReglas: string,
  rutaTextos: string,
): void {
  const { plan } = resultado;
  console.log(`\n== Seed de configuración ==${resultado.seco ? " SIMULACRO: no se escribió nada" : ""}`);
  linea("destino", destino);
  linea("documento", `${COLECCION_CONFIG}/${DOCUMENTO_APP}`);
  linea("reglas", rutaReglas);
  linea("textos", rutaTextos);
  linea("kb_version", version);

  console.log("\n== Resultado ==");
  linea("el documento", plan.existe ? "ya existía" : "no existía: se crea");
  linea("reglas publicadas", `${reglas.ids.length} (+ fallback '${reglas.fallbackTag}')`);
  linea("tags declarados", `${reglas.tags.length}: ${reglas.tags.join(", ")}`);
  linea("textos publicados", `${textos.claves.length} claves`);
  linea("pasos de la espera", `${textos.pasos.length}: ${textos.pasos.join(" · ")}`);
  linea("campos que cambian", plan.campos.length === 0 ? "ninguno" : plan.campos.join(", "));
  linea("campos preservados", plan.preservados.length === 0 ? "ninguno" : plan.preservados.join(", "));
  linea("escrituras", resultado.seco ? `${resultado.escrituras} (simuladas)` : resultado.escrituras);

  // La garantía del merge se imprime con nombre y apellido, no se supone: lo
  // que la máscara toca y lo que ni siquiera puede alcanzar.
  console.log("\n== La máscara ==");
  linea("campos gobernados", `${CAMPOS_DE_LA_MASCARA.length}: ${CAMPOS_DE_LA_MASCARA.join(", ")}`);
  linea(
    "fuera de la máscara",
    plan.preservados.length === 0
      ? "nada más en el documento"
      : `${plan.preservados.join(", ")} (de otra mano: intactos)`,
  );

  if (resultado.escrituras === 0 && !resultado.seco) {
    console.log("\n  Cero escrituras: lo publicado ya es exactamente lo que dice el repo.");
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
    throw new Error(
      "Falta --project. No hay proyecto por defecto a propósito: escribir en el proyecto equivocado se evita obligando a nombrarlo.",
    );
  }

  // Las tres lecturas de disco van ANTES que la red: un documento inválido
  // —reglas o textos— tiene que frenar la corrida sin haber abierto una
  // conexión.
  const reglas = cargarReglas(opciones.reglas);
  const textos = cargarTextos(opciones.textos);
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
  const resultado = await correrSeedConfig(cliente, reglas, textos, catalogo.kb_version, {
    seco: opciones.seco,
  });
  reportar(
    resultado,
    reglas,
    textos,
    catalogo.kb_version,
    destino.descripcion,
    opciones.reglas,
    opciones.textos,
  );
}

if (require.main === module) {
  principal().catch((error: Error) => {
    console.error(`\n  ✗ El seed de configuración no se completó: ${error.message}\n`);
    process.exitCode = 1;
  });
}
