/**
 * La pantalla de Términos y Condiciones (card 3.4).
 *
 * NO ES UNA CUARTA PESTAÑA, y es una decisión, no un olvido. La barra de abajo
 * es para los sitios a los que se vuelve; a los T&C se entra una vez, se leen y
 * se sale. Ponerlos al lado de "Escanear" le daría el mismo peso visual que al
 * circuito entero de la app y le robaría un tercio del ancho a las tres cosas
 * que sí se usan.
 *
 * Se llega desde el ENLACE DEL PIE, que está en todas las pantallas y justo
 * debajo del disclaimer chico. El reparto entre los dos está pensado: el pie
 * dice la advertencia en una línea —"orientativa… no es consejo médico"— y esta
 * pantalla la desarrolla. No se repiten; se continúan.
 *
 * Es texto y nada más: sin acordeones, sin "leer más" y sin scroll interno. Una
 * advertencia que hay que desplegar para leer es una advertencia escondida, y el
 * documento entero cabe en unos pocos pantallazos de móvil.
 *
 * El texto vive en `lib/copy.terminos.ts` con su motivo escrito (DT-22).
 */
import { BotonVolver } from "./PantallaPerfil";
import { COPY_TERMINOS, SECCIONES_DE_TERMINOS } from "../lib/copy.terminos";

export interface PantallaTerminosProps {
  onVolver: () => void;
}

export function PantallaTerminos({ onVolver }: PantallaTerminosProps) {
  return (
    <div className="flex flex-col gap-6 py-6">
      <BotonVolver onVolver={onVolver} />

      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">
          {COPY_TERMINOS.titulo}
        </h1>
        {/* La entrada va destacada a propósito: es el resumen de todo lo de
            abajo, para quien no va a leer todo lo de abajo. */}
        <p className="rounded-2xl border border-accent/35 bg-accent-soft/40 p-4 leading-relaxed text-pretty text-ink">
          {COPY_TERMINOS.entrada}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {SECCIONES_DE_TERMINOS.map((seccion) => (
          <section key={seccion.id} className="flex flex-col gap-2">
            <h2 className="font-display text-xl leading-tight font-semibold text-ink">
              {seccion.titulo}
            </h2>
            {seccion.parrafos.map((parrafo, i) => (
              <p
                key={`${seccion.id}-${i}`}
                className="text-sm leading-relaxed text-pretty text-ink-soft"
              >
                {parrafo}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="border-t border-line pt-4 font-mono text-[0.6875rem] text-ink-faint">
        {COPY_TERMINOS.actualizado}
      </p>
    </div>
  );
}
