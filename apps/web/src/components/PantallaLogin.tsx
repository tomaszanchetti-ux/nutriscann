/**
 * La puerta (card 4.1): la primera pantalla de CaliScan.
 *
 * ---------------------------------------------------------------------------
 * EL LOGIN ES OBLIGATORIO (decisión de Tomás, 02/09/2026)
 *
 * Sin sesión no se escanea, y por eso esta pantalla no tiene un "más tarde": lo
 * tendría si fuera un trámite opcional, y no lo es. Lo que sí tiene es la razón
 * escrita —el cupo de fotos y los platos son de alguien— y dos caminos, ninguno
 * con contraseña.
 *
 * ---------------------------------------------------------------------------
 * LOS SEIS ESTADOS, Y NINGUNO ES UNA PANTALLA MUDA
 *
 *   `elegir`      — los dos caminos: Google y el enlace por correo.
 *   `enviando`    — el enlace está saliendo; el botón lo dice y no se pulsa dos
 *                   veces.
 *   `enviado`     — "te hemos enviado un enlace a …", con el correo a la vista
 *                   para cazar una letra de más, y la salida para corregirlo.
 *   `verificando` — se abrió la app DESDE el enlace y se está comprobando.
 *   `pedir_correo`— el enlace se abrió en otro navegador y aquí no sabemos a
 *                   quién se lo mandamos. Ver abajo: es el caso importante.
 *   `redirigiendo`— la página se va a Google porque el popup no fue posible.
 *
 * ---------------------------------------------------------------------------
 * EL CASO QUE PARECE UN BORDE Y NO LO ES
 *
 * El enlace llega a un correo, y un correo se abre donde a la persona le queda a
 * mano: la app de Gmail con su navegador propio, el portátil, otro teléfono. En
 * ninguno de esos sitios existe el `localStorage` donde guardamos la dirección al
 * enviar el enlace, y Firebase EXIGE el correo para completar la entrada —es lo
 * que impide que quien intercepte el enlace lo use—. Fallar ahí sería castigar a
 * la persona por una decisión de su sistema operativo, así que se le pide el
 * correo y se sigue.
 *
 * ---------------------------------------------------------------------------
 * CERRAR LA VENTANA DE GOOGLE NO ES UN ERROR
 *
 * Tiene su propio tono: nota gris, nunca el recuadro rojo. Una alarma por una
 * decisión de la persona es la app discutiendo con ella. El aviso y los errores
 * de verdad comparten sitio en la pantalla pero no color ni `role`.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from "react";

import {
  completarEntradaPorEnlace,
  descartarElEnlace,
  entrarConGoogle,
  enviarEnlaceDeCorreo,
  ErrorDeEntrada,
} from "../lib/auth";
import {
  conocemosElError,
  COPY_LOGIN,
  textoDeErrorDeEntrada,
} from "../lib/copy.auth";
import { tieneFormaDeCorreo } from "../lib/listaDeEspera";

/**
 * Cómo se llegó a esta pantalla. Lo decide `App` al arrancar, mirando la URL y
 * lo que Firebase tenga a medio resolver, y puede cambiar una vez: de
 * `verificando` a lo que haya salido de comprobar el enlace.
 */
export type InicioDeLogin =
  | { tipo: "normal" }
  | { tipo: "verificando" }
  | { tipo: "pedir_correo" }
  | { tipo: "fallo"; codigo: string };

type Paso =
  | { tipo: "elegir" }
  | { tipo: "enviando" }
  | { tipo: "enviado"; correo: string }
  | { tipo: "verificando" }
  | { tipo: "pedir_correo" }
  | { tipo: "comprobando_correo" }
  | { tipo: "redirigiendo" };

/**
 * Lo que se dice cuando algo no salió. Dos cosas se deciden acá y ninguna es
 * decorativa:
 *
 *   `tono`     — `error` es el recuadro rojo; `neutro`, una línea gris. Cerrar
 *                la ventana de Google no merece una alarma.
 *   `delCampo` — si el problema es LO QUE HAY EN LA CASILLA. Solo entonces la
 *                casilla se pinta de rojo. Un enlace caducado no es culpa del
 *                correo escrito, y señalar la casilla por eso manda a corregir
 *                algo que está bien — o, peor, señala una casilla vacía.
 */
type Aviso = {
  tono: "error" | "neutro";
  texto: string;
  codigo: string | null;
  delCampo: boolean;
};

function pasoInicial(inicio: InicioDeLogin): Paso {
  if (inicio.tipo === "verificando") return { tipo: "verificando" };
  if (inicio.tipo === "pedir_correo") return { tipo: "pedir_correo" };
  return { tipo: "elegir" };
}

function avisoInicial(inicio: InicioDeLogin): Aviso | null {
  if (inicio.tipo !== "fallo") return null;
  return {
    tono: "error",
    texto: textoDeErrorDeEntrada(inicio.codigo),
    codigo: conocemosElError(inicio.codigo) ? null : inicio.codigo,
    // Lo que falló fue el arranque, no lo que la persona escribió: la casilla
    // ni siquiera existía todavía.
    delCampo: false,
  };
}

export interface PantallaLoginProps {
  inicio: InicioDeLogin;
}

export function PantallaLogin({ inicio }: PantallaLoginProps) {
  const [paso, setPaso] = useState<Paso>(() => pasoInicial(inicio));
  const [aviso, setAviso] = useState<Aviso | null>(() => avisoInicial(inicio));
  const [correo, setCorreo] = useState("");

  /**
   * `inicio` cambia UNA vez: cuando `App` termina de comprobar el enlace y sabe
   * si hizo falta pedir el correo o si el enlace ya no servía. La pantalla se
   * re-sincroniza con esa respuesta.
   *
   * Depende del objeto entero y no de `inicio.tipo` porque `App` lo guarda en un
   * estado —es el mismo objeto mientras no cambie nada—, así que esto no se
   * dispara en cada render.
   */
  useEffect(() => {
    setPaso(pasoInicial(inicio));
    setAviso(avisoInicial(inicio));
  }, [inicio]);

  /** El error de Firebase, traducido, con su código guardado si no lo conocemos. */
  function avisoDeError(codigo: string, texto?: string): Aviso {
    return {
      tono: "error",
      texto: texto ?? textoDeErrorDeEntrada(codigo),
      codigo: texto === undefined && !conocemosElError(codigo) ? codigo : null,
      // Los únicos dos que hablan de la casilla. El resto —red caída, enlace
      // gastado, demasiados intentos— no tiene nada que ver con lo escrito.
      delCampo: codigo === "auth/invalid-email" || codigo === "auth/missing-email",
    };
  }

  /** Un problema de lo escrito, cazado aquí sin molestar al servidor. */
  function avisoDelCampo(texto: string): Aviso {
    return { tono: "error", texto, codigo: null, delCampo: true };
  }

  async function conGoogle() {
    setAviso(null);
    try {
      const resultado = await entrarConGoogle();
      if (resultado === "cancelado") {
        // Tono NEUTRO: la persona cerró la ventana. No pasó nada malo.
        setAviso({
          tono: "neutro",
          texto: COPY_LOGIN.aviso_cancelado,
          codigo: null,
          delCampo: false,
        });
        return;
      }
      if (resultado === "redirigiendo") setPaso({ tipo: "redirigiendo" });
      // "dentro" no se dibuja acá: `onAuthStateChanged` avisa a `App` y esta
      // pantalla desaparece entera.
    } catch (err) {
      setAviso(avisoDeError(err instanceof ErrorDeEntrada ? err.codigo : "desconocido"));
    }
  }

  async function pedirElEnlace(evento: React.FormEvent) {
    evento.preventDefault();
    if (paso.tipo === "enviando") return;

    // Se valida al ENVIAR y no mientras se escribe, igual que el formulario de la
    // lista de espera: un reproche en la segunda letra del correo no ayuda a
    // nadie. Y con la MISMA regla, que es la única exportada de la app.
    const limpio = correo.trim();
    if (limpio === "") {
      setAviso(avisoDelCampo(COPY_LOGIN.error_correo_vacio));
      return;
    }
    if (!tieneFormaDeCorreo(limpio)) {
      setAviso(avisoDelCampo(COPY_LOGIN.error_correo_invalido));
      return;
    }

    setAviso(null);
    setPaso({ tipo: "enviando" });
    try {
      await enviarEnlaceDeCorreo(limpio);
      setPaso({ tipo: "enviado", correo: limpio });
    } catch (err) {
      const codigo = err instanceof ErrorDeEntrada ? err.codigo : "desconocido";
      setPaso({ tipo: "elegir" });
      setAviso(
        avisoDeError(codigo, codigo === "desconocido" ? COPY_LOGIN.error_envio : undefined),
      );
    }
  }

  /** El gotcha: el enlace se abrió sin el correo a mano y hay que preguntarlo. */
  async function entrarConElCorreoDicho(evento: React.FormEvent) {
    evento.preventDefault();
    if (paso.tipo === "comprobando_correo") return;

    const limpio = correo.trim();
    if (!tieneFormaDeCorreo(limpio)) {
      setAviso(avisoDelCampo(COPY_LOGIN.error_correo_invalido));
      return;
    }

    setAviso(null);
    setPaso({ tipo: "comprobando_correo" });
    const resultado = await completarEntradaPorEnlace(limpio);

    if (resultado.estado === "dentro") return; // `App` se encarga del resto.

    if (resultado.estado === "falta_el_correo") {
      setPaso({ tipo: "pedir_correo" });
      setAviso(avisoDelCampo(COPY_LOGIN.error_correo_vacio));
      return;
    }

    // AQUÍ `auth/invalid-email` SIGNIFICA OTRA COSA. La forma del correo ya se
    // comprobó dos líneas más arriba, así que si el servidor lo rechaza no es
    // que esté mal escrito: es que no es la dirección a la que se envió ESTE
    // enlace. Decirle "correo no válido" a quien escribió su correo bien sería
    // mandarlo a corregir lo que no está roto.
    if (resultado.codigo === "auth/invalid-email") {
      setPaso({ tipo: "pedir_correo" });
      setAviso(avisoDelCampo(COPY_LOGIN.error_correo_no_coincide));
      return;
    }

    // El enlace ya no sirve: `auth.ts` ya limpió la dirección, así que la salida
    // es pedir uno nuevo desde el principio.
    setPaso({ tipo: "elegir" });
    setAviso(avisoDeError(resultado.codigo));
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-8 py-10">
      <Encabezado paso={paso} />

      {paso.tipo === "verificando" || paso.tipo === "redirigiendo" ? (
        <Latido />
      ) : paso.tipo === "enviado" ? (
        <EnlaceEnviado
          correo={paso.correo}
          onCambiarCorreo={() => {
            // El correo se conserva en la casilla: quien quiere corregir una
            // letra no tiene por qué escribirlo entero otra vez.
            setPaso({ tipo: "elegir" });
            setAviso(null);
          }}
        />
      ) : paso.tipo === "pedir_correo" || paso.tipo === "comprobando_correo" ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => void entrarConElCorreoDicho(e)} noValidate>
          <CampoDeCorreo
            valor={correo}
            onCambio={(valor) => {
              if (aviso?.tono === "error") setAviso(null);
              setCorreo(valor);
            }}
            invalido={aviso?.delCampo === true}
          />
          <AvisoEnPantalla aviso={aviso} />
          <button
            type="submit"
            disabled={paso.tipo === "comprobando_correo"}
            className="min-h-14 w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-ground transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {paso.tipo === "comprobando_correo" ? COPY_LOGIN.pedir_comprobando : COPY_LOGIN.pedir_cta}
          </button>

          {/* LA SALIDA DE QUIEN NO SE ACUERDA. Sin ella esta pantalla es un
              callejón: el `oobCode` sigue en la dirección, así que recargar
              devuelve exactamente aquí. `descartarElEnlace()` tira el enlace y
              deja la app como recién abierta, con los dos caminos a la vista. */}
          <button
            type="button"
            onClick={() => {
              descartarElEnlace();
              setPaso({ tipo: "elegir" });
              setAviso(null);
            }}
            className="mx-auto min-h-11 rounded-xl px-4 text-sm font-medium text-ink-soft underline underline-offset-4 transition-colors active:text-ink"
          >
            {COPY_LOGIN.pedir_volver}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-5">
          <button
            type="button"
            onClick={() => void conGoogle()}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-ground transition-transform active:scale-[0.98]"
          >
            <LogoDeGoogle />
            {COPY_LOGIN.google}
          </button>

          <Separador />

          <form className="flex flex-col gap-3" onSubmit={(e) => void pedirElEnlace(e)} noValidate>
            <CampoDeCorreo
              valor={correo}
              onCambio={(valor) => {
                if (aviso !== null) setAviso(null);
                setCorreo(valor);
              }}
              invalido={aviso?.delCampo === true}
            />
            <button
              type="submit"
              disabled={paso.tipo === "enviando"}
              className="min-h-14 w-full rounded-2xl border border-accent/45 bg-accent-soft px-6 py-4 text-base font-semibold text-accent transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {paso.tipo === "enviando" ? COPY_LOGIN.correo_enviando : COPY_LOGIN.correo_cta}
            </button>
          </form>

          <AvisoEnPantalla aviso={aviso} />
        </div>
      )}

      <p className="text-center text-xs text-ink-faint">{COPY_LOGIN.pie}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Las piezas
// ---------------------------------------------------------------------------

/**
 * El encabezado cambia con el estado porque el estado cambia la pregunta: no es
 * lo mismo "entra para escanear" que "comprobando tu enlace". El icono se queda
 * igual en los tres: es la marca, no un semáforo.
 */
function Encabezado({ paso }: { paso: Paso }) {
  const { titulo, cuerpo } =
    paso.tipo === "verificando"
      ? { titulo: COPY_LOGIN.verificando_titulo, cuerpo: COPY_LOGIN.verificando_cuerpo }
      : paso.tipo === "redirigiendo"
        ? { titulo: COPY_LOGIN.redirigiendo, cuerpo: "" }
        : paso.tipo === "pedir_correo" || paso.tipo === "comprobando_correo"
          ? { titulo: COPY_LOGIN.pedir_titulo, cuerpo: COPY_LOGIN.pedir_cuerpo }
          : paso.tipo === "enviado"
            ? { titulo: COPY_LOGIN.enviado_titulo, cuerpo: "" }
            : { titulo: COPY_LOGIN.titulo, cuerpo: COPY_LOGIN.entrada };

  return (
    <header className="flex flex-col items-center gap-4 text-center">
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent"
      >
        <svg viewBox="0 0 24 24" className="size-8" fill="none">
          <path
            d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2a1 1 0 0 0 .84-.46l.92-1.42A1 1 0 0 1 10.3 3.7h3.4a1 1 0 0 1 .84.42l.92 1.42a1 1 0 0 0 .84.46h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="12" cy="12.2" r="3.4" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </span>

      <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">
        {titulo}
      </h1>
      {cuerpo !== "" && (
        <p className="max-w-sm leading-relaxed text-pretty text-ink-soft">{cuerpo}</p>
      )}
    </header>
  );
}

/**
 * La casilla del correo, con su etiqueta de verdad (`<label for>`): es lo que
 * hace que tocar el texto enfoque la casilla en un móvil. Misma forma que la del
 * formulario de la lista de espera, porque es el mismo objeto de la interfaz.
 *
 * `min-h-14` y `text-base` no son estética: por debajo de 16 px, Safari en iOS
 * hace zoom al enfocar una casilla y descoloca la pantalla entera.
 */
function CampoDeCorreo({
  valor,
  onCambio,
  invalido,
}: {
  valor: string;
  onCambio: (valor: string) => void;
  invalido: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="login-correo" className="text-sm font-medium text-ink-soft">
        {COPY_LOGIN.correo_etiqueta}
      </label>
      <input
        id="login-correo"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={COPY_LOGIN.correo_placeholder}
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        aria-invalid={invalido}
        className={`min-h-14 rounded-xl border bg-surface-2 px-4 text-base text-ink placeholder:text-ink-faint focus:outline-none ${
          invalido ? "border-protein" : "border-line focus:border-accent/60"
        }`}
      />
    </div>
  );
}

/**
 * El enlace salió. La pantalla se queda esperando, y lo dice con el correo a la
 * vista: es el único momento en que se puede cazar una letra de más antes de
 * quedarse esperando algo que no va a llegar.
 */
function EnlaceEnviado({
  correo,
  onCambiarCorreo,
}: {
  correo: string;
  onCambiarCorreo: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p
        // `status` y no `alert`: se anuncia sin interrumpir, que es lo que
        // corresponde a una buena noticia.
        role="status"
        className="rounded-2xl border border-accent/40 bg-accent-soft/50 p-4 leading-relaxed text-pretty text-ink"
      >
        {COPY_LOGIN.enviado_cuerpo(correo)}
      </p>
      <p className="text-sm leading-relaxed text-ink-soft">{COPY_LOGIN.enviado_ayuda}</p>
      <button
        type="button"
        onClick={onCambiarCorreo}
        className="min-h-11 w-fit rounded-xl text-sm font-medium text-ink-soft underline underline-offset-4 transition-colors active:text-ink"
      >
        {COPY_LOGIN.enviado_cambiar}
      </button>
    </div>
  );
}

/**
 * La espera de los dos estados que no dependen de nadie más: comprobar el enlace
 * e irse a Google. Tres puntos latiendo y nada más — dura un segundo, y una
 * barra de progreso mentiría sobre cuánto falta.
 *
 * El latido se apaga solo con `prefers-reduced-motion`: la regla global de
 * `index.css` aplasta toda duración.
 */
function Latido() {
  return (
    <div className="flex justify-center gap-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 animate-pulse rounded-full bg-accent"
          style={{ animationDelay: `${i * 180}ms` }}
        />
      ))}
    </div>
  );
}

/** Entre los dos caminos. Una línea, una palabra, otra línea. */
function Separador() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs text-ink-faint">{COPY_LOGIN.separador}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/**
 * Lo que se dice cuando algo no salió — y el tono es la mitad del mensaje.
 *
 * `error` es el recuadro rojo con `role="alert"`: algo se rompió y hay que
 * enterarse. `neutro` es una línea gris sin `role`: la persona cerró la ventana
 * de Google, no hay nada que anunciar con urgencia.
 */
function AvisoEnPantalla({ aviso }: { aviso: Aviso | null }) {
  if (aviso === null) return null;

  if (aviso.tono === "neutro") {
    return <p className="text-sm leading-relaxed text-ink-soft">{aviso.texto}</p>;
  }

  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-xl border border-protein/40 bg-protein/10 px-3 py-2.5"
    >
      <p className="text-sm leading-relaxed text-ink">{aviso.texto}</p>
      {aviso.codigo !== null && (
        <p className="font-mono text-xs text-ink-faint">código: {aviso.codigo}</p>
      )}
    </div>
  );
}

/**
 * La G de Google, con sus cuatro colores.
 *
 * Va en un cuadrado blanco porque el botón es del verde de la app: la marca de
 * Google no se recolorea —es de ellos y así lo piden sus normas—, y sobre el
 * verde perdería la mitad de sus colores.
 */
function LogoDeGoogle() {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white"
    >
      <svg viewBox="0 0 24 24" className="size-4">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09A11.99 11.99 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.26a12 12 0 0 0 0 10.76l4.01-3.09Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.26 6.62l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
        />
      </svg>
    </span>
  );
}
