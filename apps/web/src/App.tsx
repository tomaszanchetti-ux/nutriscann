/**
 * NutriScann — el flujo de DOS interacciones, versión mínima (card 2.3).
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
 */
import { useEffect, useRef, useState } from "react";

import { BarraDeNavegacion, type Seccion } from "./components/BarraDeNavegacion";
import { PantallaCaptura } from "./components/PantallaCaptura";
import { PantallaEscaneo, type FaseDeEscaneo } from "./components/PantallaEscaneo";
import { PantallaMensaje, PantallaNoEsComida } from "./components/PantallaMensaje";
import { PantallaPerfil } from "./components/PantallaPerfil";
import { PantallaPremium } from "./components/PantallaPremium";
import { PantallaReporte } from "./components/PantallaReporte";
import { PantallaTerminos } from "./components/PantallaTerminos";
import { PieDeDiagnostico, PieLegal } from "./components/PieDeDiagnostico";
import { analizarFoto, ErrorDeAnalisis, USA_FIXTURE_DE_ANALISIS } from "./lib/api";
import { cargarConfig, CONFIG_DE_ARRANQUE, type ConfigDeLaApp } from "./lib/config";
import { comprimirImagen, ErrorDeImagen } from "./lib/imagen";
import type { RespuestaDeAnalisis } from "./lib/types";

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
  | { fase: "error"; mensaje: string; codigo: string | null };

export default function App() {
  const [config, setConfig] = useState<ConfigDeLaApp>(CONFIG_DE_ARRANQUE);
  const [estado, setEstado] = useState<Estado>({ fase: "captura" });
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
        setEstado({ fase: "error", mensaje: config.copy.error_unreadable, codigo: "imagen_ilegible" });
      } else if (err instanceof ErrorDeAnalisis) {
        setEstado({
          fase: "error",
          mensaje: err.codigo === "sin_red" ? config.copy.error_network : err.message,
          codigo: err.codigo,
        });
      } else {
        setEstado({ fase: "error", mensaje: config.copy.error_unexpected, codigo: null });
      }
    }
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

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5">
      <main className="flex flex-1 flex-col">
        {seccion === "perfil" && (
          <PantallaPerfil
            onVolver={() => setSeccion("escaneo")}
            onIrAPremium={() => setSeccion("premium")}
          />
        )}

        {/* La vitrina recibe los textos publicados desde la WS08: la sección
            «Lo que llega después» los lee de `config/app`, como el resto de la
            app, y se edita sin desplegar. */}
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
              <PantallaCaptura copy={config.copy} onFoto={(archivo) => void analizar(archivo)} />
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
