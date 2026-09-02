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
 */
import { useState } from "react";

import { ModalListaDeEspera } from "./ModalListaDeEspera";
import { IconoCandado, ModalPremium } from "./ModalPremium";
import {
  COPY_PERFIL,
  FUNCIONALIDADES_BLOQUEADAS,
  TEXTO_VOLVER,
  type FuncionalidadBloqueada,
} from "../lib/copy.premium";

export interface PantallaPerfilProps {
  onVolver: () => void;
  onIrAPremium: () => void;
}

export function PantallaPerfil({ onVolver, onIrAPremium }: PantallaPerfilProps) {
  const [abierta, setAbierta] = useState<FuncionalidadBloqueada | null>(null);
  const [listaAbierta, setListaAbierta] = useState(false);

  return (
    <div className="flex flex-col gap-6 py-6">
      <BotonVolver onVolver={onVolver} />

      {/* EL AVISO, DESTACADO (Q/A de la WS08). El párrafo de entrada se fue —lo
          que decía se ve en las cuatro tarjetas de abajo— y el aviso dejó de ser
          letra gris: es la información que la pantalla existe para dar, así que
          se dibuja como un cartel con el color del sistema y no como una nota. */}
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">
          {COPY_PERFIL.titulo}
        </h1>
        <p className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/50 px-3 py-2.5 text-sm font-semibold text-pretty text-accent">
          <IconoCandado className="size-4 shrink-0" />
          {COPY_PERFIL.aviso}
        </p>
      </header>

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
