/**
 * La sección Perfil (card 3.3) — lo que viene, VISIBLE y bloqueado.
 *
 * Es una vitrina, no un formulario a medias. Ninguno de los campos del perfil
 * es un `<input>`: se muestran como etiquetas, porque un campo editable que no
 * guarda nada es peor que un candado honesto. El día que la v2 encienda esto,
 * la lista de campos ya está escrita y el formulario ocupa el mismo lugar.
 *
 * Cada tarjeta es un botón entero: tocar cualquier parte abre el modal que
 * explica qué plan la abre. Eso es lo que pidió la card, y de paso resuelve el
 * área de toque en móvil sin un "ver más" de 20 píxeles.
 *
 * Los campos y sus cuidados salen de `docs/PLAN.md` §6.2 (la lista que cerró
 * Tomás el 31/08/2026), incluida la advertencia sobre intolerancias: la app es
 * informativa, no médica, y las alergias graves están fuera de su alcance. Eso
 * se dice acá arriba, no en la letra chica.
 *
 * ---------------------------------------------------------------------------
 * CARD 4.1 — Y AHORA HAY UNA COSA REAL EN ESTA PANTALLA: LA CUENTA.
 *
 * Es lo único que no es vitrina, y por eso va ARRIBA DEL TODO y se dibuja
 * distinto: con quién entró la persona, y cómo salir. Va entre el título y el
 * cartel de «Disponible solo con los planes Premium», y ese orden es deliberado:
 * el cartel introduce lo BLOQUEADO, y dejar la cuenta debajo de él la haría
 * parecer una funcionalidad de pago más. Lo que el Q/A de Tomás decidió sobre
 * ese cartel —que fuera un cartel con el color del sistema y no una nota gris—
 * se respeta tal cual; lo único que cambia es que ahora tiene algo real encima.
 * ------------------------------------------------------------------------- */
import { useState } from "react";

import { ModalListaDeEspera } from "./ModalListaDeEspera";
import { IconoCandado, ModalPremium } from "./ModalPremium";
import type { Sesion } from "../lib/auth";
import { COPY_CUENTA } from "../lib/copy.auth";
import {
  COPY_PERFIL,
  FUNCIONALIDADES_BLOQUEADAS,
  TEXTO_VOLVER,
  type FuncionalidadBloqueada,
} from "../lib/copy.premium";

export interface PantallaPerfilProps {
  /** Con quién se entró. Nunca es `null` acá: sin sesión no se llega a esta pantalla. */
  sesion: Sesion;
  onSalir: () => void;
  onVolver: () => void;
  onIrAPremium: () => void;
}

export function PantallaPerfil({ sesion, onSalir, onVolver, onIrAPremium }: PantallaPerfilProps) {
  const [abierta, setAbierta] = useState<FuncionalidadBloqueada | null>(null);
  const [listaAbierta, setListaAbierta] = useState(false);

  return (
    <div className="flex flex-col gap-6 py-6">
      <BotonVolver onVolver={onVolver} />

      <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">
        {COPY_PERFIL.titulo}
      </h1>

      {/* LO REAL, PRIMERO (card 4.1). */}
      <TarjetaDeCuenta sesion={sesion} onSalir={onSalir} />

      {/* EL AVISO, DESTACADO (Q/A de la WS08). El párrafo de entrada se fue —lo
          que decía se ve en las cuatro tarjetas de abajo— y el aviso dejó de ser
          letra gris: es la información que la pantalla existe para dar, así que
          se dibuja como un cartel con el color del sistema y no como una nota.

          Desde la card 4.1 va debajo de la cuenta y no pegado al título: sigue
          siendo lo que abre la lista de tarjetas bloqueadas, que es justo lo que
          tiene debajo. */}
      <p className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/50 px-3 py-2.5 text-sm font-semibold text-pretty text-accent">
        <IconoCandado className="size-4 shrink-0" />
        {COPY_PERFIL.aviso}
      </p>

      <ul className="flex flex-col gap-3">
        {FUNCIONALIDADES_BLOQUEADAS.map((funcionalidad) => (
          <li key={funcionalidad.id}>
            <TarjetaBloqueada
              funcionalidad={funcionalidad}
              onAbrir={() => setAbierta(funcionalidad)}
            />
          </li>
        ))}
      </ul>

      <p className="text-center text-xs text-ink-faint">{COPY_PERFIL.pieDeSeccion}</p>

      {/* DOS SALIDAS, del mismo tamaño: ver qué cuesta, o apuntarse sin ir a
          mirar (Q/A de la WS08). Desde acá la lista de espera no elige plan —se
          guarda como "perfil"— porque quien pulsa todavía no eligió. */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onIrAPremium}
          className="w-full rounded-2xl border border-accent/45 bg-accent-soft px-6 py-4 text-base font-semibold text-accent transition-transform active:scale-[0.98]"
        >
          {COPY_PERFIL.cta}
        </button>
        <button
          type="button"
          onClick={() => setListaAbierta(true)}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-base font-semibold text-ground transition-transform active:scale-[0.98]"
        >
          {COPY_PERFIL.ctaListaDeEspera}
        </button>
      </div>

      {listaAbierta && (
        <ModalListaDeEspera plan="perfil" onCerrar={() => setListaAbierta(false)} />
      )}

      {abierta !== null && (
        <ModalPremium
          funcionalidad={abierta.titulo}
          plan={abierta.plan}
          onCerrar={() => setAbierta(null)}
          onVerPlanes={() => {
            setAbierta(null);
            onIrAPremium();
          }}
        />
      )}
    </div>
  );
}

/**
 * LA CUENTA (card 4.1): lo único de esta pantalla que existe de verdad.
 *
 * Se dibuja distinta de las tarjetas bloqueadas a propósito, y la diferencia es
 * estructural, no decorativa: aquellas son BOTONES enteros que abren un modal
 * —tocar cualquier parte pregunta qué plan las abre— y esta no se toca en
 * ninguna parte salvo en «Cerrar sesión». Un bloque que no reacciona al dedo se
 * lee como información; uno que reacciona, como una promesa.
 *
 * TRES DATOS Y UNO SOLO OBLIGATORIO. El correo siempre está —es con lo que se
 * entró, venga de Google o del enlace—; el nombre y la foto los da Google a
 * veces, y el enlace por correo nunca. Por eso el avatar cae a la inicial en vez
 * de a un hueco gris, y el correo sube al renglón principal cuando no hay nombre
 * que poner encima.
 *
 * SALIR VA EN SU PROPIO RENGLÓN, y no al costado, porque se probó al costado y
 * se veía mal: en una pantalla de 375 px el botón se comía el ancho y el correo
 * salía cortado en «tomas.prue…@cal…». El dato que identifica la cuenta no puede
 * ser el que se sacrifica. El renglón de abajo, separado por una línea, es el
 * mismo recurso que usan las tarjetas bloqueadas para su advertencia.
 */
function TarjetaDeCuenta({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const correo = sesion.correo ?? "";
  const principal = sesion.nombre ?? correo;
  const inicial = principal.trim().charAt(0).toUpperCase();

  return (
    <section
      aria-label={COPY_CUENTA.titulo}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <span className="text-[0.6875rem] font-semibold tracking-wide text-ink-faint uppercase">
        {COPY_CUENTA.titulo}
      </span>

      <div className="flex items-center gap-3">
        {sesion.foto !== null ? (
          <img
            src={sesion.foto}
            // `alt` vacío y no el nombre: el nombre se lee al lado en texto, y
            // repetirlo se lo diría dos veces a quien usa un lector de pantalla.
            alt=""
            // Google sirve las fotos de perfil desde un dominio que rechaza las
            // peticiones con `Referer` de otro sitio: sin esto, el avatar sale
            // roto en producción.
            referrerPolicy="no-referrer"
            className="size-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-lg font-semibold text-accent"
          >
            {inicial}
          </span>
        )}

        {/* `min-w-0` es lo que deja que `truncate` funcione dentro de un flex:
            sin él, el hijo se niega a encogerse y desborda la tarjeta. */}
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-ink">{principal}</span>
          {sesion.nombre !== null && correo !== "" && (
            <span className="truncate text-sm text-ink-soft">{correo}</span>
          )}
        </div>
      </div>

      {/* La línea cruza la tarjeta entera y el botón ocupa solo lo suyo: separar
          es cosa de la línea, y el área de toque —44 px— es cosa del botón. */}
      <div className="-mb-1 border-t border-line pt-1">
        <button
          type="button"
          onClick={onSalir}
          className="flex min-h-11 w-fit items-center text-sm font-medium text-ink-soft underline underline-offset-4 transition-colors active:text-ink"
        >
          {COPY_CUENTA.salir}
        </button>
      </div>
    </section>
  );
}

/**
 * Una funcionalidad bloqueada. El candado está arriba a la derecha y el plan que
 * la abre, escrito: "bloqueado" a secas obliga a adivinar cuánto cuesta salir.
 */
function TarjetaBloqueada({
  funcionalidad,
  onAbrir,
}: {
  funcionalidad: FuncionalidadBloqueada;
  onAbrir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg leading-tight font-semibold text-ink">
            {funcionalidad.titulo}
          </h2>
          <span className="text-[0.6875rem] font-semibold tracking-wide text-accent uppercase">
            {funcionalidad.plan}
          </span>
        </div>
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-faint"
        >
          <IconoCandado className="size-4" />
        </span>
      </div>

      <p className="text-sm leading-relaxed text-pretty text-ink-soft">
        {funcionalidad.descripcion}
      </p>

      {funcionalidad.campos !== undefined && (
        <ul className="flex flex-wrap gap-1.5">
          {funcionalidad.campos.map((campo) => (
            <li
              key={campo}
              className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-ink-faint"
            >
              {campo}
            </li>
          ))}
        </ul>
      )}

      {funcionalidad.advertencia !== undefined && (
        <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
          {funcionalidad.advertencia}
        </p>
      )}
    </button>
  );
}

/** El "atrás". Vive acá porque Perfil y Premium lo comparten tal cual. */
export function BotonVolver({ onVolver }: { onVolver: () => void }) {
  return (
    <button
      type="button"
      onClick={onVolver}
      className="-ml-2 flex w-fit items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-ink-soft transition-colors active:text-ink"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
        <path
          d="M14.5 5.5 8 12l6.5 6.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {TEXTO_VOLVER}
    </button>
  );
}
