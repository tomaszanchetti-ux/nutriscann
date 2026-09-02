/**
 * El reloj del cupo, apretado donde duele: la medianoche de Madrid y el domingo
 * en el que el país tiene 25 horas.
 *
 * Estos tests no necesitan emulador ni red: el calendario es puro.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ZONA_DEL_CUPO, diaSiguiente, momentoDelCupo, primerDiaDelMesSiguiente } from "./calendario";

test("el corte del día es la medianoche de MADRID, no la de UTC", () => {
  // Verano español (UTC+2): a las 22:30 UTC en Madrid ya es el día siguiente.
  // Si el cupo se cortara por UTC, la cena de un sábado gastaría el cupo del
  // sábado cuando para la persona ya es domingo — o al revés, según la época.
  assert.deepEqual(momentoDelCupo(new Date("2026-09-02T22:30:00Z")), {
    mes: "2026-09",
    dia: "2026-09-03",
  });
  assert.deepEqual(momentoDelCupo(new Date("2026-09-02T21:59:59Z")), {
    mes: "2026-09",
    dia: "2026-09-02",
  });

  // Invierno español (UTC+1): el corte se mueve una hora, y el módulo no tiene
  // que saberlo — lo sabe la tabla de husos.
  assert.equal(momentoDelCupo(new Date("2026-01-15T23:30:00Z")).dia, "2026-01-16");
  assert.equal(momentoDelCupo(new Date("2026-01-15T22:59:59Z")).dia, "2026-01-15");
});

test("el último instante de un mes en Madrid todavía pertenece a ese mes", () => {
  // 2026-09-30 23:59 en Madrid son las 21:59 UTC. Media hora después ya es
  // octubre para el cupo, y su documento es otro.
  assert.deepEqual(momentoDelCupo(new Date("2026-09-30T21:59:00Z")), {
    mes: "2026-09",
    dia: "2026-09-30",
  });
  assert.deepEqual(momentoDelCupo(new Date("2026-09-30T22:00:00Z")), {
    mes: "2026-10",
    dia: "2026-10-01",
  });
});

test("el domingo de 25 horas de octubre no rompe el corte del día", () => {
  // El 25/10/2026 Madrid pasa de UTC+2 a UTC+1 a las 03:00 locales. El día tiene
  // 25 horas. Un cálculo hecho sumando 24 h a un instante daría el día
  // equivocado; acá el día sale de la tabla de husos y el "siguiente" es
  // aritmética de calendario.
  assert.equal(momentoDelCupo(new Date("2026-10-25T00:30:00Z")).dia, "2026-10-25", "02:30 CEST");
  assert.equal(momentoDelCupo(new Date("2026-10-25T01:30:00Z")).dia, "2026-10-25", "02:30 CET, la hora repetida");
  assert.equal(momentoDelCupo(new Date("2026-10-25T22:30:00Z")).dia, "2026-10-25", "23:30, todavía el mismo día");
  assert.equal(momentoDelCupo(new Date("2026-10-25T23:00:00Z")).dia, "2026-10-26", "medianoche: ya es lunes");
  assert.equal(diaSiguiente("2026-10-25"), "2026-10-26", "y el día siguiente sigue siendo el 26");
});

test("el domingo de 23 horas de marzo tampoco", () => {
  // 29/03/2026: a las 02:00 locales el reloj salta a las 03:00. El día tiene 23.
  assert.equal(momentoDelCupo(new Date("2026-03-29T00:30:00Z")).dia, "2026-03-29", "01:30 CET");
  assert.equal(momentoDelCupo(new Date("2026-03-29T01:30:00Z")).dia, "2026-03-29", "03:30 CEST");
  assert.equal(diaSiguiente("2026-03-29"), "2026-03-30");
});

test("el día siguiente cruza meses, años y febreros bisiestos", () => {
  assert.equal(diaSiguiente("2026-09-02"), "2026-09-03");
  assert.equal(diaSiguiente("2026-09-30"), "2026-10-01");
  assert.equal(diaSiguiente("2026-12-31"), "2027-01-01");
  assert.equal(diaSiguiente("2028-02-28"), "2028-02-29", "2028 es bisiesto");
  assert.equal(diaSiguiente("2026-02-28"), "2026-03-01", "2026 no lo es");
});

test("`se_renueva` del mes es el día 1 del mes siguiente", () => {
  assert.equal(primerDiaDelMesSiguiente("2026-09"), "2026-10-01");
  assert.equal(primerDiaDelMesSiguiente("2026-12"), "2027-01-01");
  assert.equal(primerDiaDelMesSiguiente("2026-01"), "2026-02-01");
});

test("una fecha o una clave que no se entienden se rechazan, no se adivinan", () => {
  assert.throws(() => momentoDelCupo(new Date("no es una fecha")), RangeError);
  assert.throws(() => diaSiguiente("2026-09"), RangeError);
  assert.throws(() => diaSiguiente("02/09/2026"), RangeError);
  assert.throws(() => primerDiaDelMesSiguiente("2026-09-02"), RangeError);
});

test("la zona horaria del runtime NO afecta el corte: el huso viaja en el dato", () => {
  // El mismo instante, leído con dos zonas distintas, cae en días distintos. Es
  // lo que garantiza que el resultado no dependa de en qué región corre la
  // función ni de la variable TZ de la máquina que corre el test.
  const instante = new Date("2026-09-02T22:30:00Z");
  assert.equal(momentoDelCupo(instante, "UTC").dia, "2026-09-02");
  assert.equal(momentoDelCupo(instante, ZONA_DEL_CUPO).dia, "2026-09-03");
  assert.equal(momentoDelCupo(instante).dia, "2026-09-03", "sin zona explícita, Madrid");
});
