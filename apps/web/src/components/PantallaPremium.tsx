/**
 * La sección Premium (card 3.3) — la vitrina de los tres planes del §6.7.
 *
 * V1 = VITRINA. Acá no hay checkout y no hay Stripe: los botones de los planes
 * de pago no cobran nada, y el pago real llega en la v2. Un botón que parece
 * comprar y no compra sería una promesa rota.
 *
 * LO QUE SÍ HACEN AHORA (Q/A de la WS08): apuntar a la LISTA DE ESPERA. Hasta
 * esta WS decían "Muy pronto" y estaban `disabled` — honesto, pero mudo, y
 * dejaba a la vitrina sin la única señal que puede dar antes de que existan los
 * pagos: quién los quiere. El formulario pide tres cosas (nombre, apellidos,
 * correo) y ninguna es un dato de pago; eso sigue escrito al pie.
 *
 * DOS REGLAS DE COMUNICACIÓN, las dos de Tomás (01/09/2026), viven en la forma
 * de esta pantalla y no solo en su texto:
 *
 *   1. EL CUPO SE COMUNICA MENSUAL, SIEMPRE. Cada plan muestra "N fotos al mes"
 *      en el mismo renglón y con el mismo formato, para que la escalera
 *      15 → 40 → 150 se lea de un vistazo. Ningún "X al día" aparece en pantalla:
 *      un "3 al día" gratuito promete 90 al mes potenciales y deja al plan de 40
 *      pareciendo menos.
 *   2. NO SE MENCIONA PUBLICIDAD COMO BENEFICIO. No hay ads en ningún plan, así
 *      que "sin publicidad" se dice una vez, como hecho de la app, y no como
 *      algo que el usuario compra.
 *
 * El diferenciador de Gold —el plan de dieta diario, lo único que el plan anual
 * no tiene— sale de la lista de viñetas y ocupa su propio bloque dentro de esa
 * tarjeta. Es la razón entera por la que Gold existe.
 *
 * ---------------------------------------------------------------------------
 * WS08 — «FUNCIONALIDADES PREMIUM»: la segunda mitad de la pantalla.
 *
 * Debajo de los tres planes hay ahora dos tarjetas que muestran los escalones de
 * la v2 —el accesible (fichas con fuente USDA, recetas por categoría,
 * tendencias) y el alto (el plan personalizado de 1 semana, 15 días o 1 mes)—.
 * El motivo es de venta: la vitrina explicaba muy bien el cupo de fotos y no
 * decía en voz alta hacia dónde va la app, que es lo que hace que alguien deje
 * su correo hoy.
 *
 * SE DIBUJAN DISTINTO A PROPÓSITO —borde punteado y fondo apagado— porque son
 * otra cosa: los de arriba son planes con precio, y estos todavía no existen. La
 * forma lo dice sin necesidad de un cartel. Ninguno lleva número: donde iría el
 * precio va a qué plan se sumará, así la escalera 15 → 40 → 150 sigue siendo la
 * única de la pantalla.
 *
 * Y los dos botones abren EL MISMO formulario de lista de espera que los planes,
 * con la misma etiqueta: la conversión de esta pantalla es una sola.
 *
 * EL Q/A DEL 02/09/2026 LA DEJÓ EN HUESO: título, las dos tarjetas y nada más.
 * Se fueron el párrafo de entrada y el pie de la sección —lo que decía el pie ya
 * estaba dicho en `nota_pagos`, unos centímetros más abajo—, y el sello común
 * («Próximamente») se convirtió en el nombre del plan de cada tarjeta.
 * ---------------------------------------------------------------------------
 */
import { useState } from "react";

import { ModalListaDeEspera } from "./ModalListaDeEspera";
import { BotonVolver } from "./PantallaPerfil";
import {
  COPY_PREMIUM,
  escalonesV2,
  PLANES,
  type EscalonV2,
  type PlanDeListaDeEspera,
  type PlanPremium,
} from "../lib/copy.premium";
import type { CopyDeLaApp } from "../lib/config";

export interface PantallaPremiumProps {
  /** Los textos publicados. La sección «Funcionalidades Premium» los lee de acá. */
  copy: CopyDeLaApp;
  onVolver: () => void;
}

export function PantallaPremium({ copy, onVolver }: PantallaPremiumProps) {
  /** `null` = el formulario está cerrado. Si no, guarda desde qué plan se abrió. */
  const [listaAbierta, setListaAbierta] = useState<PlanDeListaDeEspera | null>(null);

  return (
    <div className="flex flex-col gap-6 py-6">
      <BotonVolver onVolver={onVolver} />

      {/* El título y nada más: la pantalla empieza por las tarjetas, que es lo
          que se viene a ver (Q/A de la WS08). El párrafo que explicaba por qué
          el cupo separa un plan del siguiente sigue dicho, al pie, en su nota. */}
      <header>
        <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">
          {COPY_PREMIUM.titulo}
        </h1>
      </header>

      <ul className="flex flex-col gap-4">
        {PLANES.map((plan) => {
          // El plan gratuito no tiene etiqueta de lista de espera —ya lo tienes—
          // y por eso su tarjeta recibe `null` y sigue mostrando su rótulo.
          const etiqueta = plan.listaDeEspera;
          return (
            <li key={plan.id}>
              <TarjetaDePlan
                plan={plan}
                onListaDeEspera={
                  etiqueta === undefined ? null : () => setListaAbierta(etiqueta)
                }
              />
            </li>
          );
        })}
      </ul>

      {/* FUNCIONALIDADES PREMIUM. Va DEBAJO de los planes y no arriba: primero
          se ve lo que hoy se puede tener, y recién después hacia dónde va. Al
          revés, la pantalla empezaría prometiendo lo que todavía no existe.

          El título va solo, sin párrafo debajo y sin nota al pie (Q/A del
          02/09/2026): lo que hay que leer son las dos tarjetas. */}
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="font-display text-2xl leading-tight font-bold text-balance text-ink">
            {copy.v2_title}
          </h2>
        </header>

        <ul className="flex flex-col gap-4">
          {escalonesV2(copy).map((escalon) => (
            <li key={escalon.id}>
              <TarjetaEscalonV2
                escalon={escalon}
                disclaimer={copy.disclaimer}
                onListaDeEspera={() => setListaAbierta(escalon.listaDeEspera)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-ink-faint">
        <p>{COPY_PREMIUM.nota_cupo}</p>
        <p>{COPY_PREMIUM.nota_ads}</p>
        <p className="text-ink-soft">{COPY_PREMIUM.nota_pagos}</p>
      </section>

      {listaAbierta !== null && (
        <ModalListaDeEspera plan={listaAbierta} onCerrar={() => setListaAbierta(null)} />
      )}
    </div>
  );
}

function TarjetaDePlan({
  plan,
  onListaDeEspera,
}: {
  plan: PlanPremium;
  /** `null` = este plan no se apunta a nada (el gratuito ya lo tiene). */
  onListaDeEspera: (() => void) | null;
}) {
  const destacado = plan.destacado === true;

  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl border p-5 ${
        destacado ? "border-accent/55 bg-accent-soft/40" : "border-line bg-surface"
      }`}
    >
      <header className="flex flex-col gap-2">
        {plan.sello !== undefined && (
          <span
            className={`w-fit rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide uppercase ${
              destacado ? "bg-accent text-ground" : "bg-surface-2 text-ink-faint"
            }`}
          >
            {plan.sello}
          </span>
        )}
        <h2 className="font-display text-2xl leading-tight font-bold text-ink">{plan.nombre}</h2>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-3xl font-bold text-ink tabular-nums">
            {plan.precio}
          </span>
          <span className="text-sm text-ink-faint">{plan.periodo}</span>
        </p>
      </header>

      {/* El cupo, en su propio renglón y con el mismo formato en los tres:
          es la comparación que la pantalla existe para hacer posible. */}
      <p
        className={`rounded-xl px-3 py-2 text-center text-sm font-semibold ${
          destacado ? "bg-accent/15 text-accent" : "bg-surface-2 text-ink"
        }`}
      >
        {plan.cupo}
      </p>

      <p className="text-sm leading-relaxed text-pretty text-ink-soft">{plan.resumen}</p>

      <ul className="flex flex-col gap-2">
        {plan.incluye.map((linea) => (
          <li key={linea} className="flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
            <IconoTilde />
            <span>{linea}</span>
          </li>
        ))}
      </ul>

      {destacado && (
        <div className="flex flex-col gap-1 rounded-xl border border-accent/30 bg-ground/40 p-3">
          <p className="text-sm font-semibold text-accent">{COPY_PREMIUM.diferenciador.titulo}</p>
          <p className="text-xs leading-relaxed text-pretty text-ink-soft">
            {COPY_PREMIUM.diferenciador.detalle}
          </p>
        </div>
      )}

      <BotonDePlan plan={plan} destacado={destacado} onListaDeEspera={onListaDeEspera} />
    </article>
  );
}

/**
 * El botón de un plan. NINGUNO cobra nada en la v1:
 *   · el plan actual muestra un rótulo, no un botón (no hay nada que hacer),
 *   · los de pago abren la LISTA DE ESPERA.
 *
 * El día que Stripe entre, lo único que cambia es a dónde lleva ese `onClick`.
 */
function BotonDePlan({
  plan,
  destacado,
  onListaDeEspera,
}: {
  plan: PlanPremium;
  destacado: boolean;
  onListaDeEspera: (() => void) | null;
}) {
  if (plan.actual === true || onListaDeEspera === null) {
    return (
      <p className="rounded-2xl border border-line px-6 py-3.5 text-center text-sm font-semibold text-ink-faint">
        {plan.cta}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onListaDeEspera}
      className={`w-full rounded-2xl px-6 py-3.5 text-base font-semibold transition-transform active:scale-[0.98] ${
        destacado ? "bg-accent text-ground" : "border border-accent/45 bg-accent-soft text-accent"
      }`}
    >
      {plan.cta}
    </button>
  );
}

/**
 * Una tarjeta de «Funcionalidades Premium».
 *
 * Es hermana de `TarjetaDePlan` —mismo radio, mismo cuerpo, mismas viñetas con
 * su tilde— y se diferencia en cuatro cosas, las cuatro con intención:
 *
 *   · BORDE PUNTEADO Y FONDO APAGADO: esto todavía no se puede comprar. La
 *     diferencia se ve sin leer una palabra.
 *   · EL SELLO ES EL NOMBRE DE SU PLAN («Premium», «Premium Gold»), el mismo que
 *     encabeza su tarjeta en la escalera de precios de arriba: se lee de `PLANES`
 *     y no de un texto publicado (Q/A del 02/09/2026).
 *   · DONDE IRÍA EL PRECIO va el plan al que se sumará. No hay número, y no es
 *     un descuido: estos escalones no tienen precio publicado.
 *   · EL DISCLAIMER, pegado, en la que habla de objetivos. Es el MISMO texto del
 *     pie de la app (`copy.disclaimer`), no uno nuevo: donde se promete un plan
 *     personalizado, "orientativo y no consejo médico" tiene que estar a la
 *     vista y no dos pantallas más allá.
 */
function TarjetaEscalonV2({
  escalon,
  disclaimer,
  onListaDeEspera,
}: {
  escalon: EscalonV2;
  disclaimer: string;
  onListaDeEspera: () => void;
}) {
  const destacado = escalon.destacado === true;

  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl border border-dashed p-5 ${
        destacado ? "border-accent/45 bg-accent-soft/25" : "border-line bg-surface/60"
      }`}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide text-accent uppercase">
            {escalon.sello}
          </span>
          <span className="text-[0.6875rem] font-semibold tracking-wide text-ink-faint uppercase">
            {escalon.vinculo}
          </span>
        </div>
        <h3 className="font-display text-xl leading-tight font-bold text-ink">{escalon.titulo}</h3>
        <p className="text-sm leading-relaxed text-pretty text-ink-soft">{escalon.resumen}</p>
      </header>

      <ul className="flex flex-col gap-2">
        {escalon.puntos.map((punto) => (
          <li key={punto} className="flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
            <IconoTilde />
            <span>{punto}</span>
          </li>
        ))}
      </ul>

      {escalon.conDisclaimer === true && (
        <p className="border-t border-line pt-3 text-xs leading-relaxed text-pretty text-ink-faint">
          {disclaimer}
        </p>
      )}

      <button
        type="button"
        onClick={onListaDeEspera}
        className={`w-full rounded-2xl px-6 py-3.5 text-base font-semibold transition-transform active:scale-[0.98] ${
          destacado ? "bg-accent text-ground" : "border border-accent/45 bg-accent-soft text-accent"
        }`}
      >
        {escalon.cta}
      </button>
    </article>
  );
}

function IconoTilde() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 size-4 shrink-0 text-accent"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
