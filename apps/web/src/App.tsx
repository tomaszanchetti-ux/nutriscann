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
 * QUÉ ES MÍNIMA Y QUÉ NO. Es mínima la PRESENTACIÓN: sin animación de escaneo
 * cinematográfica, sin count-up del número, sin PWA; eso es la Fase 3. NO es
 * mínima la HONESTIDAD: la confianza de cada item, el sello de cómo se llegó a
 * la ficha, los caveats, el aviso de genérico y el de total parcial están todos,
 * porque son lo que el Q/A visual de esta card tiene que poder mirar.
 *
 * Y la v1 NO muestra recomendaciones (decisión del 31/08/2026): solo lo medido.
 */
import { useEffect, useRef, useState } from "react";

import { PantallaCaptura } from "./components/PantallaCaptura";
import { PantallaEscaneo } from "./components/PantallaEscaneo";
import { PantallaMensaje, PantallaNoEsComida } from "./components/PantallaMensaje";
import { PantallaReporte } from "./components/PantallaReporte";
import { PieDeDiagnostico } from "./components/PieDeDiagnostico";
import { analizarFoto, ErrorDeAnalisis } from "./lib/api";
import { cargarConfig, CONFIG_DE_ARRANQUE, type ConfigDeLaApp } from "./lib/config";
import { comprimirImagen, ErrorDeImagen } from "./lib/imagen";
import type { RespuestaDeAnalisis } from "./lib/types";

type Estado =
  | { fase: "captura" }
  | { fase: "escaneando" }
  | { fase: "reporte"; reporte: RespuestaDeAnalisis }
  | { fase: "no_es_comida"; mensaje: string | undefined }
  | { fase: "error"; mensaje: string; codigo: string | null };

export default function App() {
  const [config, setConfig] = useState<ConfigDeLaApp>(CONFIG_DE_ARRANQUE);
  const [estado, setEstado] = useState<Estado>({ fase: "captura" });
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  /** La URL `blob:` viva, para revocarla y no dejar la foto colgada en memoria. */
  const blobActual = useRef<string | null>(null);

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
    setVistaPrevia(null);
    setEstado({ fase: "captura" });
  }

  async function analizar(archivo: File) {
    mostrarVistaPrevia(archivo);
    setEstado({ fase: "escaneando" });

    try {
      const imagen = await comprimirImagen(archivo);
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

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5">
      <main className="flex flex-1 flex-col">
        {estado.fase === "captura" && (
          <PantallaCaptura copy={config.copy} onFoto={(archivo) => void analizar(archivo)} />
        )}

        {estado.fase === "escaneando" && (
          <PantallaEscaneo
            titulo={config.copy.scanning_title}
            pasos={config.scanning_steps}
            vistaPrevia={vistaPrevia}
          />
        )}

        {estado.fase === "reporte" && (
          <PantallaReporte
            copy={config.copy}
            reporte={estado.reporte}
            onOtroPlato={volverACapturar}
          />
        )}

        {estado.fase === "no_es_comida" && (
          <PantallaNoEsComida
            copy={config.copy}
            mensajeDelBackend={estado.mensaje}
            onReintentar={volverACapturar}
          />
        )}

        {estado.fase === "error" && (
          <PantallaMensaje
            tono="error"
            titulo={config.copy.error_title}
            detalle={estado.mensaje}
            codigo={estado.codigo}
            cta={config.copy.error_cta}
            onCta={volverACapturar}
          />
        )}
      </main>

      <PieDeDiagnostico origenDeConfig={config.origen} disclaimer={config.copy.disclaimer} />
    </div>
  );
}
