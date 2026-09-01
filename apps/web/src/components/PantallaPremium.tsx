/**
 * La sección Premium (card 3.3) — la vitrina de los tres planes del §6.7.
 *
 * V1 = VITRINA. Acá no hay checkout, no hay Stripe y no se pide un solo dato:
 * los botones de los planes de pago son INERTES y lo dicen ("Muy pronto"). Un
 * botón que parece comprar y no compra es una promesa rota; uno que dice que
 * todavía no, no lo es. El pago real llega en la v2.
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
 */
import { BotonVolver } from "./PantallaPerfil";
import { COPY_PREMIUM, PLANES, type PlanPremium } from "../lib/copy.premium";

export interface PantallaPremiumProps {
  onVolver: () => void;
}

export function PantallaPremium({ onVolver }: PantallaPremiumProps) {
  return (
    <div className="flex flex-col gap-6 py-6">
      <BotonVolver onVolver={onVolver} />

      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl leading-tight font-bold text-balance text-ink">
          {COPY_PREMIUM.titulo}
        </h1>
        <p className="leading-relaxed text-pretty text-ink-soft">{COPY_PREMIUM.entrada}</p>
      </header>

      <ul className="flex flex-col gap-4">
        {PLANES.map((plan) => (
          <li key={plan.id}>
            <TarjetaDePlan plan={plan} />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-ink-faint">
        <p>{COPY_PREMIUM.nota_cupo}</p>
        <p>{COPY_PREMIUM.nota_ads}</p>
        <p className="text-ink-soft">{COPY_PREMIUM.nota_pagos}</p>
      </section>
    </div>
  );
}

function TarjetaDePlan({ plan }: { plan: PlanPremium }) {
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

      <BotonDePlan plan={plan} destacado={destacado} />
    </article>
  );
}

/**
 * El botón de un plan. NINGUNO cobra nada en la v1:
 *   · el plan actual muestra un rótulo, no un botón (no hay nada que hacer),
 *   · los de pago son botones `disabled` que dicen "Muy pronto".
 *
 * Se dejan como `<button disabled>` y no como texto suelto a propósito: el día
 * que Stripe entre, lo único que cambia es el `onClick` y el `disabled`.
 */
function BotonDePlan({ plan, destacado }: { plan: PlanPremium; destacado: boolean }) {
  if (plan.actual === true) {
    return (
      <p className="rounded-2xl border border-line px-6 py-3.5 text-center text-sm font-semibold text-ink-faint">
        {plan.cta}
      </p>
    );
  }

  return (
    <button
      type="button"
      disabled
      className={`w-full cursor-not-allowed rounded-2xl px-6 py-3.5 text-base font-semibold ${
        destacado ? "bg-accent/25 text-accent" : "bg-surface-2 text-ink-soft"
      }`}
    >
      {plan.cta}
    </button>
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
