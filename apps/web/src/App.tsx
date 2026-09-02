/**
 * CaliScan — el flujo de DOS interacciones, versión mínima (card 2.3).
 *
 * Reemplaza la pantalla de fundaciones de la Fase 0: aquello probaba que el
 * andamiaje estaba en pie, esto es la app. El health-check no se tiró, se mudó
 * al pie (`PieDeDiagnostico`).
 *
 * Las dos interacciones son las del `docs/PLAN.md` §4:
 *   1. tocar el botón y sacar la foto,
 *   2. leer el reporte.
 * Todo lo que hay en el medio —comprimir, subir, esperar— pasa solo.
 *
 * QUÉ ES MÍNIMA Y QUÉ NO. Es mínima la PRESENTACIÓN: sin count-up del número,
 * sin PWA; eso es la Fase 3. NO es mínima la HONESTIDAD: la confianza de cada
 * item, el sello de cómo se llegó a la ficha, los caveats, el aviso de genérico
 * y el de total parcial están todos, porque son lo que el Q/A visual de esta
 * card tiene que poder mirar.
 *
 * (Card 3.2: la espera ya no es mínima — el scanner que barre la foto, los
 * micro-textos que son verdad y los estados de carga completos viven en
 * `PantallaEscaneo`.)
 *
 * Y la v1 NO muestra recomendaciones (decisión del 31/08/2026): solo lo medido.
 *
 * (Card 3.3: a las dos interacciones se les suman DOS SECCIONES que no son parte
 * del circuito —Perfil y Premium—, y por eso viven en un estado propio y no en
 * la máquina de fases. Ver el comentario de `seccion`, abajo. La pestaña
 * "Escanear" devuelve a la sección tal como se la dejó: si había un reporte en
 * pantalla, el reporte sigue ahí, con su propio "Escanear otro plato".)
 *
 * (Card 3.4: y una CUARTA sección que ni siquiera está en la barra —los Términos
 * y Condiciones—, a la que se entra por el enlace del pie desde cualquiera de
 * las otras tres y de la que se vuelve exactamente a donde se estaba. Mismo
 * mecanismo: es una sección más, y el circuito del escaneo sigue intacto abajo.)
 *
 * ---------------------------------------------------------------------------
 * CARD 4.1 — Y AHORA HAY UNA PUERTA ANTES DE TODO ESTO.
 *
 * El login es OBLIGATORIO (decisión de Tomás, 02/09/2026): sin sesión no se
 * escanea. La guarda vive acá arriba, delante de todo lo demás, y tiene TRES
 * estados y no dos:
 *
 *   `cargando` — Firebase todavía está decidiendo si hay sesión guardada. Es un
 *                parpadeo, pero existe, y en ese hueco NO se muestra el login:
 *                a quien ya entró le aparecería la pantalla de entrada en la
 *                cara cada vez que abre la app.
 *   `login`    — no hay nadie. `PantallaLogin`, y nada más.
 *   la app     — exactamente lo que había antes de esta card, sin un cambio en
 *                el circuito del escaneo ni en las cuatro secciones.
 *
 * Lo único que la sesión le cambia a lo de abajo son dos cosas: la tarjeta de la
 * cuenta en Perfil, y dos estados nuevos del escaneo —sesión caducada y cupo
 * agotado— que son errores del backend como los demás, con sus propias salidas.
 * ------------------------------------------------------------------------- */
import { useEffect, useRef, useState } from "react";

import { AvisoDeInstalacion } from "./components/AvisoDeInstalacion";
import { BarraDeNavegacion, type Seccion } from "./components/BarraDeNavegacion";
import { PantallaCaptura } from "./components/PantallaCaptura";
import { PantallaEscaneo, type FaseDeEscaneo } from "./components/PantallaEscaneo";
import { PantallaLogin, type InicioDeLogin } from "./components/PantallaLogin";
import { PantallaMensaje, PantallaNoEsComida } from "./components/PantallaMensaje";
import { PantallaPerfil } from "./components/PantallaPerfil";
import { PantallaPremium } from "./components/PantallaPremium";
import { PantallaReporte } from "./components/PantallaReporte";
import { PantallaTerminos } from "./components/PantallaTerminos";
import { PieDeDiagnostico, PieLegal } from "./components/PieDeDiagnostico";
import { analizarFoto, ErrorDeAnalisis, USA_FIXTURE_DE_ANALISIS } from "./lib/api";
import {
  hayEnlaceDeEntrada,
  observarSesion,
  resolverEntradaPendiente,
  salir,
  type Sesion,
} from "./lib/auth";
import { cargarConfig, CONFIG_DE_ARRANQUE, type ConfigDeLaApp } from "./lib/config";
import { COPY_CUPO, COPY_SESION, notaDeCupo } from "./lib/copy.auth";
import { TEXTO_VOLVER } from "./lib/copy.premium";
import { comprimirImagen, ErrorDeImagen } from "./lib/imagen";
import type { CupoDelBackend, RespuestaDeAnalisis } from "./lib/types";

/**
 * LOS ESTADOS DE CARGA, completos (card 3.2). Ninguno es una pantalla en blanco
 * ni un spinner mudo:
 *
 *   `escaneando` + `preparando`  — la foto se achica y se codifica en el
 *       navegador. Se ve la foto, el título y la retícula dibujándose.
 *   `escaneando` + `analizando`  — el POST salió: el haz barre y los tres pasos
 *       reales del motor rotan.
 *   `error`                      — qué pasó, con su código, y DOS salidas:
 *       reintentar con la misma foto o volver a la cámara.
 */
type Estado =
  | { fase: "captura" }
  | { fase: "escaneando"; paso: FaseDeEscaneo }
  | { fase: "reporte"; reporte: RespuestaDeAnalisis }
  | { fase: "no_es_comida"; mensaje: string | undefined }
  | {
      fase: "error";
      mensaje: string;
      codigo: string | null;
      /**
       * El bloque `quota` del 429, cuando vino. Se guarda CRUDO y no ya
       * convertido en una frase porque la pantalla necesita dos cosas distintas
       * de él: el título depende del ámbito (mes o día) y la línea chica, de los
       * números. Guardar solo el texto obligaría a deducir el ámbito leyéndolo.
       */
      cupo: CupoDelBackend | null;
    };

export default function App() {
  const [config, setConfig] = useState<ConfigDeLaApp>(CONFIG_DE_ARRANQUE);
  const [estado, setEstado] = useState<Estado>({ fase: "captura" });

  /**
   * LA SESIÓN. `null` = no hay nadie dentro.
   *
   * `sesionResuelta` es lo que distingue "todavía no sé" de "no hay nadie": el
   * primer aviso de Firebase llega con `null` mientras el SDK aún está leyendo lo
   * guardado, y confundir los dos es lo que hace parpadear la pantalla de login.
   */
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [sesionResuelta, setSesionResuelta] = useState(false);

  /**
   * Cómo arrancó la puerta. Se decide en el PRIMER render mirando la URL, antes
   * de que ninguna red conteste: si la dirección trae un enlace de correo, la
   * pantalla arranca en "comprobando" y no en un vacío. Después cambia una sola
   * vez, cuando `resolverEntradaPendiente()` dice qué salió de comprobarlo.
   */
  const [inicioDeLogin, setInicioDeLogin] = useState<InicioDeLogin>(() =>
    hayEnlaceDeEntrada() ? { tipo: "verificando" } : { tipo: "normal" },
  );

  useEffect(() => {
    let vivo = true;
    const dejarDeObservar = observarSesion((quien) => {
      if (vivo) setSesion(quien);
    });

    // Resuelve lo que haya quedado a medias —un enlace de correo en la URL, la
    // vuelta de una redirección a Google— y recién entonces declara que la
    // sesión está decidida.
    void resolverEntradaPendiente().then((pendiente) => {
      if (!vivo) return;
      if (pendiente.estado === "falta_el_correo") {
        setInicioDeLogin({ tipo: "pedir_correo" });
      } else if (pendiente.estado === "fallo") {
        setInicioDeLogin({ tipo: "fallo", codigo: pendiente.codigo });
      } else {
        setInicioDeLogin({ tipo: "normal" });
      }
      setSesionResuelta(true);
    });

    return () => {
      vivo = false;
      dejarDeObservar();
    };
  }, []);
  /**
   * LA SECCIÓN ES UN ESTADO APARTE, NO UNA FASE MÁS (card 3.3).
   *
   * `Estado` es la máquina del escaneo: captura → escaneando → reporte, con sus
   * dos desvíos. Perfil y Premium no son pasos de ese circuito: son otro sitio
   * de la app. Si se hubieran metido como fases, ir a Premium desde el reporte
   * habría PISADO el reporte, y volver habría devuelto al usuario a la cámara
   * con el análisis ya pagado en la basura.
   *
   * Así, en cambio, las dos cosas conviven: la sección decide qué se ve, y
   * `estado` sigue intacto abajo. Se vuelve del Premium al reporte exactamente
   * como se lo dejó, y el flujo foto→escaneo→reporte no cambió en una línea.
   */
  const [seccion, setSeccion] = useState<Seccion>("escaneo");
  /**
   * A DÓNDE DEVUELVE EL "VOLVER" DE LOS TÉRMINOS (card 3.4).
   *
   * A los términos se entra desde el pie, que está en las cuatro pantallas: se
   * puede llegar desde el reporte, desde Perfil o desde Premium. Mandar siempre
   * a "escaneo" al salir castigaría al que estaba leyendo los planes y quiso
   * comprobar la letra chica antes de decidir.
   *
   * Es un `ref` y no un `useState` a propósito: nadie se dibuja distinto por su
   * valor, así que no hace falta un re-render cuando cambia.
   */
  const seccionDeVuelta = useRef<Seccion>("escaneo");

  /**
   * TODA PANTALLA NUEVA ARRANCA ARRIBA (Q/A de Tomás, 02/09/2026).
   *
   * Las cuatro secciones y las fases del circuito comparten el scroll del
   * documento: sin esto, entrar a Premium después de leer la letra chica del
   * reporte te dejaba en la mitad de los planes, y volver a Escanear te
   * devolvía al fondo. El salto es instantáneo a propósito — animarlo haría
   * notar que es la misma página; instantáneo se lee como una página nueva.
   */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [seccion, estado.fase]);

  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  /** La URL `blob:` viva, para revocarla y no dejar la foto colgada en memoria. */
  const blobActual = useRef<string | null>(null);
  /**
   * La última foto elegida, para poder REINTENTAR con ella.
   *
   * Sin esto, un error de red obligaba a volver a la cámara y sacar la foto otra
   * vez — y el plato ya se estaba enfriando. El archivo ya está en memoria: no
   * hay ningún motivo para tirarlo porque el servidor no contestó.
   */
  const ultimaFoto = useRef<File | null>(null);

  // Los textos se piden una sola vez, al arrancar. `cargarConfig` nunca rechaza:
  // si Firestore no contesta, devuelve el arranque en frío y lo declara.
  useEffect(() => {
    let vivo = true;
    cargarConfig().then((leida) => {
      if (vivo) setConfig(leida);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Al desmontar, la última vista previa se revoca.
  useEffect(() => {
    return () => {
      if (blobActual.current) URL.revokeObjectURL(blobActual.current);
    };
  }, []);

  function mostrarVistaPrevia(archivo: File) {
    if (blobActual.current) URL.revokeObjectURL(blobActual.current);
    const url = URL.createObjectURL(archivo);
    blobActual.current = url;
    setVistaPrevia(url);
  }

  function volverACapturar() {
    if (blobActual.current) {
      URL.revokeObjectURL(blobActual.current);
      blobActual.current = null;
    }
    ultimaFoto.current = null;
    setVistaPrevia(null);
    setEstado({ fase: "captura" });
  }

  /** Vuelve a mandar la MISMA foto. Si no hay ninguna guardada, va a la cámara. */
  function reintentarConLaMismaFoto() {
    const archivo = ultimaFoto.current;
    if (archivo === null) {
      volverACapturar();
      return;
    }
    void analizar(archivo);
  }

  async function analizar(archivo: File) {
    ultimaFoto.current = archivo;
    mostrarVistaPrevia(archivo);
    // Dos tramos declarados, no uno: comprimir es de este lado y el análisis
    // todavía no empezó. La pantalla de espera muestra cosas distintas en cada
    // uno, y ninguno de los dos es una pantalla muda.
    setEstado({ fase: "escaneando", paso: "preparando" });

    try {
      const imagen = await comprimirImagen(archivo);
      setEstado({ fase: "escaneando", paso: "analizando" });
      const reporte = await analizarFoto(imagen);
      setEstado(
        reporte.is_food
          ? { fase: "reporte", reporte }
          : { fase: "no_es_comida", mensaje: reporte.message_es },
      );
    } catch (err) {
      // Tres orígenes distintos, tres textos distintos. El del backend gana
      // sobre cualquiera que se pudiera escribir acá: es el que sabe qué pasó.
      if (err instanceof ErrorDeImagen) {
        setEstado({
          fase: "error",
          mensaje: config.copy.error_unreadable,
          codigo: "imagen_ilegible",
          cupo: null,
        });
      } else if (err instanceof ErrorDeAnalisis) {
        setEstado({
          fase: "error",
          mensaje: err.codigo === "sin_red" ? config.copy.error_network : err.message,
          codigo: err.codigo,
          // Solo el 429 trae números. En todo lo demás es `null` y la pantalla
          // ni dibuja la línea.
          cupo: err.cupo,
        });
      } else {
        setEstado({ fase: "error", mensaje: config.copy.error_unexpected, codigo: null, cupo: null });
      }
    }
  }

  /**
   * Cierra la sesión y DEJA EL CIRCUITO EN CERO.
   *
   * Lo segundo no es un detalle: sin ello, el reporte del plato anterior seguiría
   * en pantalla mientras aparece el login, y la siguiente persona que entre en
   * ese teléfono vería lo que comió la anterior. Salir tiene que borrar lo que se
   * estaba mirando, no solo el token.
   *
   * Es también la salida del 401: cuando el token ya no vale, la única acción
   * útil es volver a entrar, y eso empieza por soltar el que hay.
   */
  async function cerrarSesion() {
    volverACapturar();
    setSeccion("escaneo");
    // La puerta vuelve a su estado de fábrica. Sin esto, un tropiezo del
    // arranque —un enlace que ya se había usado, por ejemplo— quedaría guardado
    // y reaparecería como un cartel rojo al salir, acusando a algo que ya se
    // había resuelto hace rato.
    setInicioDeLogin({ tipo: "normal" });
    await salir();
  }

  /** Entra a los términos recordando desde dónde, para que "Volver" vuelva ahí. */
  function abrirTerminos() {
    seccionDeVuelta.current = seccion;
    setSeccion("terminos");
  }

  /**
   * La barra se esconde MIENTRAS SE ESCANEA, y solo entonces. Esos segundos son
   * el único momento en que la app está haciendo algo que el usuario no puede
   * interrumpir sin perderlo: el barrido es el show, y tres pestañas al pie
   * invitan a salirse justo cuando no conviene. En todo lo demás está.
   */
  const mostrarNavegacion = !(seccion === "escaneo" && estado.fase === "escaneando");

  /**
   * LA GUARDA. Delante de todo, y con el hueco de "todavía no sé" contemplado.
   *
   * El caso `verificando` es la excepción que sí se dibuja mientras la sesión no
   * está resuelta, y no hay riesgo de parpadeo: se llegó abriendo un enlace del
   * correo, así que quien está mirando sabe perfectamente que está entrando.
   *
   * Los Términos siguen alcanzables desde acá, con el mismo enlace del pie de
   * siempre: crear una cuenta sin poder leer las condiciones antes sería
   * exactamente al revés.
   */
  if (!sesionResuelta && inicioDeLogin.tipo !== "verificando") {
    return <Portada config={config} contenido={<PantallaQuieta />} />;
  }

  if (sesion === null) {
    return (
      <Portada
        config={config}
        contenido={
          seccion === "terminos" ? (
            <PantallaTerminos onVolver={() => setSeccion("escaneo")} />
          ) : (
            <PantallaLogin inicio={inicioDeLogin} />
          )
        }
        onVerTerminos={seccion === "terminos" ? null : () => setSeccion("terminos")}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5">
      <main className="flex flex-1 flex-col">
        {seccion === "perfil" && (
          <PantallaPerfil
            sesion={sesion}
            onSalir={() => void cerrarSesion()}
            onVolver={() => setSeccion("escaneo")}
            onIrAPremium={() => setSeccion("premium")}
          />
        )}

        {/* La vitrina recibe los textos publicados desde la WS08: la sección
            «Funcionalidades Premium» los lee de `config/app`, como el resto de
            la app, y se edita sin desplegar. */}
        {seccion === "premium" && (
          <PantallaPremium copy={config.copy} onVolver={() => setSeccion("escaneo")} />
        )}

        {seccion === "terminos" && (
          <PantallaTerminos onVolver={() => setSeccion(seccionDeVuelta.current)} />
        )}

        {/* EL CIRCUITO DEL ESCANEO, ENTERO Y SIN TOCAR (card 3.2). Lo único que
            cambió es que ahora vive dentro de su sección: las cinco fases, sus
            props y sus salidas son las mismas. */}
        {seccion === "escaneo" && (
          <>
            {estado.fase === "captura" && (
              <>
                <PantallaCaptura copy={config.copy} onFoto={(archivo) => void analizar(archivo)} />
                {/* Solo en la captura: es el único momento en que el usuario no
                    está ni esperando ni leyendo su plato. */}
                <AvisoDeInstalacion copy={config.copy} />
              </>
            )}

            {estado.fase === "escaneando" && (
              <PantallaEscaneo
                titulo={config.copy.scanning_title}
                pasos={config.scanning_steps}
                vistaPrevia={vistaPrevia}
                fase={estado.paso}
              />
            )}

            {estado.fase === "reporte" && (
              <PantallaReporte
                copy={config.copy}
                reporte={estado.reporte}
                onOtroPlato={volverACapturar}
                onPasarseAPremium={() => setSeccion("premium")}
              />
            )}

            {estado.fase === "no_es_comida" && (
              <PantallaNoEsComida
                copy={config.copy}
                mensajeDelBackend={estado.mensaje}
                onReintentar={volverACapturar}
              />
            )}

            {estado.fase === "error" &&
              // Reintentar con la misma foto sirve para todo… menos cuando la
              // foto es justamente lo que no se pudo leer: ahí mandarla de nuevo
              // daría el mismo error, así que la salida principal pasa a ser la
              // cámara.
              (estado.codigo === "imagen_ilegible" ? (
                <PantallaMensaje
                  tono="error"
                  titulo={config.copy.error_title}
                  detalle={estado.mensaje}
                  codigo={estado.codigo}
                  cta={config.copy.report_cta}
                  onCta={volverACapturar}
                />
              ) : /* LOS DOS ESTADOS DE LA IDENTIDAD (contrato WS09 §2). Los dos
                     tienen título propio porque "No pude analizar la foto" sería
                     mentira en los dos: la foto está perfecta, lo que falta es
                     una sesión o un cupo. Y en los dos, reintentar con la misma
                     foto daría exactamente el mismo resultado, así que la salida
                     principal es otra. */
              estado.codigo === "no_autenticado" ? (
                <PantallaMensaje
                  tono="error"
                  titulo={COPY_SESION.titulo}
                  detalle={estado.mensaje}
                  codigo={estado.codigo}
                  cta={COPY_SESION.volver_a_entrar}
                  onCta={() => void cerrarSesion()}
                />
              ) : estado.codigo === "cupo_agotado" ? (
                // Tono NEUTRO y no de error: quedarse sin cupo es el sistema
                // funcionando como está diseñado, no algo que se rompió. El
                // recuadro rojo está reservado para lo que sí falló.
                <PantallaMensaje
                  tono="neutro"
                  titulo={COPY_CUPO.titulo(estado.cupo?.ambito ?? null)}
                  detalle={estado.mensaje}
                  nota={notaDeCupo(estado.cupo)}
                  codigo={estado.codigo}
                  cta={COPY_CUPO.ver_planes}
                  onCta={() => setSeccion("premium")}
                  ctaSecundaria={TEXTO_VOLVER}
                  onCtaSecundaria={volverACapturar}
                />
              ) : (
                <PantallaMensaje
                  tono="error"
                  titulo={config.copy.error_title}
                  detalle={estado.mensaje}
                  codigo={estado.codigo}
                  cta={config.copy.error_cta}
                  onCta={reintentarConLaMismaFoto}
                  ctaSecundaria={config.copy.report_cta}
                  onCtaSecundaria={volverACapturar}
                />
              ))}
          </>
        )}
      </main>

      {/* EL ORDEN DEL PIE (Q/A de Tomás, WS08): primero la barra de secciones,
          y debajo de ella —última de la pantalla— la advertencia chica con su
          enlace a los Términos. El bloque de diagnóstico ya no se mete en el
          medio: no se renderiza fuera de desarrollo. */}
      {mostrarNavegacion && <BarraDeNavegacion activa={seccion} onIr={setSeccion} />}

      <PieLegal
        disclaimer={config.copy.disclaimer}
        onVerTerminos={seccion === "terminos" ? null : abrirTerminos}
      />

      {/* EL DIAGNÓSTICO TÉCNICO, SOLO EN DESARROLLO. Proyecto, emulador,
          Firestore, versión del backend, catálogo y latencia son la respuesta a
          "¿contra qué estoy hablando?" durante el Q/A local, y no le dicen nada
          a quien está mirando su plato. Vite lo elimina del bundle de
          producción: `import.meta.env.DEV` es una constante en el build.

          LA SEGUNDA CONDICIÓN NO ES UN CINTURÓN DE MÁS. El pie es también donde
          avisa el MODO FIXTURE ("lo que ves NO viene del backend"), y esa
          advertencia no puede depender de estar en desarrollo: un build de
          producción hecho con `VITE_ANALYZE_FIXTURE` puesto mostraría un plato
          inventado sin decirlo. `USA_FIXTURE_DE_ANALISIS` también se pliega a
          `false` en un build normal, así que el componente se sigue borrando
          entero cuando el fixture está apagado. */}
      {(import.meta.env.DEV || USA_FIXTURE_DE_ANALISIS) && (
        <PieDeDiagnostico origenDeConfig={config.origen} />
      )}
    </div>
  );
}

/**
 * EL MARCO DE LA PUERTA: el mismo contenedor de siempre, sin la barra de
 * secciones.
 *
 * Existe para no duplicar la envoltura tres veces (el hueco de carga, el login y
 * los Términos leídos desde el login), y sobre todo para que la puerta se vea
 * como parte de la app y no como otra web: mismo ancho, mismo aire lateral, el
 * mismo pie con la advertencia y el mismo diagnóstico en desarrollo.
 *
 * NO lleva `BarraDeNavegacion` y es a propósito: no hay ninguna sección a la que
 * ir todavía, y tres pestañas muertas al pie serían tres promesas que no se
 * pueden cumplir.
 */
function Portada({
  config,
  contenido,
  onVerTerminos = null,
}: {
  config: ConfigDeLaApp;
  contenido: React.ReactNode;
  onVerTerminos?: (() => void) | null;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5">
      <main className="flex flex-1 flex-col">{contenido}</main>

      <PieLegal disclaimer={config.copy.disclaimer} onVerTerminos={onVerTerminos} />

      {(import.meta.env.DEV || USA_FIXTURE_DE_ANALISIS) && (
        <PieDeDiagnostico origenDeConfig={config.origen} />
      )}
    </div>
  );
}

/**
 * El hueco de "todavía no sé si hay sesión". Dura lo que Firebase tarda en leer
 * lo guardado —décimas de segundo— y por eso está DELIBERADAMENTE vacío: un
 * texto o un logo apareciendo y desapareciendo en ese lapso se lee como un
 * parpadeo, y un parpadeo se lee como un error.
 *
 * Lo único que hace es ocupar el alto de la pantalla, para que lo que venga
 * después no salte.
 */
function PantallaQuieta() {
  return <div className="flex-1" aria-hidden="true" />;
}
