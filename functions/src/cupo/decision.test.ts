/**
 * La decisión del cupo, probada sin base de datos.
 *
 * Todo lo que hay acá es aritmética sobre un estado y unos límites: si para
 * probar «el 16.º del mes rebota» hiciera falta un emulador, la decisión estaría
 * mal partida. La transacción —que es lo único que un test puro NO puede
 * demostrar— tiene su propio test contra el emulador.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { limitesDeCupo, type AppConfig } from "../config";
import { momentoDelCupo } from "./calendario";
import {
  CONSUMO_EN_CERO,
  LIMITES_EN_FRIO,
  decidirCupo,
  fotoDelCupo,
  leerEstado,
  normalizarLimites,
  revertirConsumo,
  usadosHoy,
  type EstadoDeConsumo,
  type LimitesDeCupo,
} from "./decision";

const MOMENTO = momentoDelCupo(new Date("2026-09-02T10:00:00Z"));
const HOY = MOMENTO.dia; // "2026-09-02"
const LIMITES: LimitesDeCupo = { por_mes: 15, por_dia: 3 };

function estado(parcial: Partial<EstadoDeConsumo>): EstadoDeConsumo {
  return { ...CONSUMO_EN_CERO, dia: HOY, ...parcial };
}

// ---------------------------------------------------------------------------
// El candado del mes
// ---------------------------------------------------------------------------

test("el 15.º escaneo del mes entra y el 16.º rebota", () => {
  const decimoquinto = decidirCupo(estado({ usados_mes: 14, usados_dia: 0 }), LIMITES, MOMENTO);
  assert.equal(decimoquinto.entra, true, "con 14 gastados todavía queda uno: es la garantía de 15");
  assert.equal(decimoquinto.entra && decimoquinto.consumo.usados_mes, 15);

  const decimosexto = decidirCupo(estado({ usados_mes: 15, usados_dia: 0 }), LIMITES, MOMENTO);
  assert.equal(decimosexto.entra, false);
  assert.deepEqual(decimosexto.entra === false && decimosexto.bloqueo, {
    ambito: "mes",
    usados: 15,
    limite: 15,
    se_renueva: "2026-10-01",
  });
});

test("agotado el mes, la respuesta NO dice «vuelve mañana»", () => {
  // Es el motivo por el que el mes se mira antes que el día: con el mes agotado
  // y el día libre, contestar por el día sería mentirle al usuario.
  const veredicto = decidirCupo(estado({ usados_mes: 20, usados_dia: 0 }), LIMITES, MOMENTO);
  assert.equal(veredicto.entra, false);
  assert.equal(veredicto.entra === false && veredicto.bloqueo.ambito, "mes");
  assert.equal(veredicto.entra === false && veredicto.bloqueo.se_renueva, "2026-10-01");
});

// ---------------------------------------------------------------------------
// El candado del día
// ---------------------------------------------------------------------------

test("el 4.º del día rebota AUNQUE queden 10 del mes", () => {
  const veredicto = decidirCupo(estado({ usados_mes: 5, usados_dia: 3 }), LIMITES, MOMENTO);
  assert.equal(veredicto.entra, false, "quedan 10 del mes y aun así no entra: el freno del día es otro");
  assert.deepEqual(veredicto.entra === false && veredicto.bloqueo, {
    ambito: "dia",
    usados: 3,
    limite: 3,
    se_renueva: "2026-09-03",
  });
});

test("el 3.º del día todavía entra", () => {
  const veredicto = decidirCupo(estado({ usados_mes: 5, usados_dia: 2 }), LIMITES, MOMENTO);
  assert.equal(veredicto.entra, true);
  assert.deepEqual(veredicto.entra && veredicto.consumo, { usados_mes: 6, dia: HOY, usados_dia: 3 });
});

test("el contador del día se resetea SOLO al cambiar de día, sin ninguna tarea", () => {
  // Tres escaneos ayer y el documento sigue diciendo 3: hoy vale cero porque el
  // día guardado ya no es hoy. Es lo que permite un documento por MES en vez de
  // treinta, y lo que evita depender de un cron que puede no correr.
  const ayer = estado({ usados_mes: 9, dia: "2026-09-01", usados_dia: 3 });
  assert.equal(usadosHoy(ayer, MOMENTO), 0);

  const veredicto = decidirCupo(ayer, LIMITES, MOMENTO);
  assert.equal(veredicto.entra, true, "el freno del día es de HOY, no de siempre");
  assert.deepEqual(veredicto.entra && veredicto.consumo, { usados_mes: 10, dia: HOY, usados_dia: 1 });
});

test("el mes NO se resetea con el día: el documento es del mes", () => {
  // El día cambió pero seguimos en septiembre: los 15 del mes siguen contando.
  const ayer = estado({ usados_mes: 15, dia: "2026-09-01", usados_dia: 1 });
  const veredicto = decidirCupo(ayer, LIMITES, MOMENTO);
  assert.equal(veredicto.entra, false);
  assert.equal(veredicto.entra === false && veredicto.bloqueo.ambito, "mes");
});

// ---------------------------------------------------------------------------
// La devolución
// ---------------------------------------------------------------------------

test("devolver un crédito baja las dos cuentas", () => {
  assert.deepEqual(revertirConsumo(estado({ usados_mes: 7, usados_dia: 2 }), MOMENTO), {
    usados_mes: 6,
    dia: HOY,
    usados_dia: 1,
  });
});

test("si el día cambió entre la reserva y el fallo, solo baja el mes", () => {
  // Un análisis largo que arrancó a las 23:59: el contador del día que guarda el
  // documento es el de AYER, y restarle uno no le devolvería nada a nadie —el
  // día de hoy ya empieza en cero—.
  const ayer = estado({ usados_mes: 7, dia: "2026-09-01", usados_dia: 3 });
  assert.deepEqual(revertirConsumo(ayer, MOMENTO), { usados_mes: 6, dia: "2026-09-01", usados_dia: 3 });
});

test("una devolución nunca deja un contador en negativo", () => {
  // Un contador negativo sería cupo regalado. El caso llega si alguien edita el
  // documento a mano en la consola, que es algo que se puede hacer.
  assert.deepEqual(revertirConsumo(estado({ usados_mes: 0, usados_dia: 0 }), MOMENTO), {
    usados_mes: 0,
    dia: HOY,
    usados_dia: 0,
  });
});

// ---------------------------------------------------------------------------
// Lo que se le cuenta al usuario
// ---------------------------------------------------------------------------

test("la foto del cupo del 200 ya cuenta el escaneo que se acaba de hacer", () => {
  const veredicto = decidirCupo(estado({ usados_mes: 14, usados_dia: 2 }), LIMITES, MOMENTO);
  assert.equal(veredicto.entra, true);
  const foto = fotoDelCupo(veredicto.entra ? veredicto.consumo : CONSUMO_EN_CERO, LIMITES, MOMENTO);
  assert.deepEqual(foto, {
    mes: { usados: 15, limite: 15, se_renueva: "2026-10-01" },
    dia: { usados: 3, limite: 3, se_renueva: "2026-09-03" },
  });
  // O sea: «esta fue la última del mes». El front no tiene que restar nada.
});

// ---------------------------------------------------------------------------
// Leer un documento que puede tener cualquier cosa adentro
// ---------------------------------------------------------------------------

test("un documento ausente o roto se lee como cero, nunca como cupo de regalo", () => {
  assert.deepEqual(leerEstado(undefined), CONSUMO_EN_CERO);
  assert.deepEqual(leerEstado({}), CONSUMO_EN_CERO);
  assert.deepEqual(leerEstado({ usados_mes: "muchos", dia: 5, usados_dia: null }), CONSUMO_EN_CERO);
  assert.deepEqual(leerEstado({ usados_mes: -4, dia: "", usados_dia: 2.7 }), {
    usados_mes: 0,
    dia: null,
    usados_dia: 2,
  });
  assert.deepEqual(leerEstado({ usados_mes: 9, dia: HOY, usados_dia: 2 }), {
    usados_mes: 9,
    dia: HOY,
    usados_dia: 2,
  });
});

// ---------------------------------------------------------------------------
// Los topes: publicados, con el arranque en frío detrás
// ---------------------------------------------------------------------------

test("los topes salen de config/app y el código solo trae el arranque en frío", () => {
  assert.deepEqual(normalizarLimites({ por_mes: 40, por_dia: 8 }), { por_mes: 40, por_dia: 8 });
  assert.deepEqual(normalizarLimites({ por_mes: undefined, por_dia: undefined }), LIMITES_EN_FRIO);
  assert.deepEqual(LIMITES_EN_FRIO, { por_mes: 15, por_dia: 3 }, "§3 del contrato: 15 al mes, 3 al día");
});

test("un tope en 0 se respeta: es el interruptor para cortar el gasto sin desplegar", () => {
  assert.deepEqual(normalizarLimites({ por_mes: 0, por_dia: 3 }), { por_mes: 0, por_dia: 3 });
  const veredicto = decidirCupo(CONSUMO_EN_CERO, { por_mes: 0, por_dia: 3 }, MOMENTO);
  assert.equal(veredicto.entra, false, "con el tope en 0 no entra ni el primero");
});

test("un tope que no es un entero no negativo se DESCARTA entero", () => {
  // Ni se corrige a cero (apagaría el producto) ni se ignora hacia arriba (lo
  // regalaría): rige el arranque en frío, que es lo que significa «no está
  // configurado». El caso llega de alguien tipeando en la consola.
  for (const basura of ["15", 15.5, -1, NaN, null, true, {}]) {
    assert.deepEqual(
      normalizarLimites({ por_mes: basura, por_dia: basura }),
      LIMITES_EN_FRIO,
      `${JSON.stringify(basura)} tenía que caer al arranque en frío`,
    );
  }
});

test("`limitesDeCupo` lee la configuración publicada, y sin ella el arranque en frío", () => {
  const publicada = {
    kb_version: "3.8.0",
    max_scans_per_month: 30,
    max_scans_per_day: 5,
    copy: {},
    recommendation_rules: null,
  } satisfies AppConfig;
  assert.deepEqual(limitesDeCupo(publicada), { por_mes: 30, por_dia: 5 });
  assert.deepEqual(limitesDeCupo(null), LIMITES_EN_FRIO, "config/app no contestó: rige el arranque en frío");
});
