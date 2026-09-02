/**
 * La identidad, sin red: parseo de la cabecera y los tres caminos al 401.
 *
 * El circuito de verdad —un token emitido por el emulador de Auth y verificado
 * por el Admin SDK— se prueba en `cupo/emulador.test.ts`, que es donde hay
 * emulador. Acá se prueba la decisión.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ErrorDeAnalisis } from "../analyze/errores";
import {
  VARIABLE_EMULADOR_AUTH,
  extraerToken,
  identificarDueño,
  usaEmuladorDeAuth,
} from "./identidad";

const OK = async (idToken: string): Promise<{ uid: string }> => ({ uid: `uid-de-${idToken}` });

async function esperar401(
  cabeceras: Record<string, string | string[] | undefined>,
  verificar: (t: string) => Promise<{ uid: string }>,
  fragmentoDelDetalle: RegExp,
): Promise<void> {
  await assert.rejects(
    () => identificarDueño(cabeceras, verificar),
    (err: unknown) => {
      assert.ok(err instanceof ErrorDeAnalisis);
      assert.equal(err.codigo, "no_autenticado");
      assert.match(err.detalle, fragmentoDelDetalle);
      return true;
    },
  );
}

test("extraerToken saca el token de `Authorization: Bearer …`", () => {
  assert.equal(extraerToken({ authorization: "Bearer abc.def.ghi" }), "abc.def.ghi");
  assert.equal(extraerToken({ authorization: "bearer abc.def.ghi" }), "abc.def.ghi", "el esquema no distingue mayúsculas");
  assert.equal(extraerToken({ Authorization: "Bearer abc" }), "abc", "y el nombre de la cabecera tampoco");
  assert.equal(extraerToken({ authorization: "  Bearer   abc  " }), "abc", "los espacios de más no son parte del token");
  assert.equal(extraerToken({ authorization: ["Bearer uno", "Bearer dos"] }), "uno", "repetida: vale la primera");
});

test("extraerToken devuelve null para todo lo que no es un Bearer con token", () => {
  const casos: (string | string[] | undefined)[] = [
    undefined,
    "",
    "abc.def.ghi",
    "Basic dXN1YXJpbzpjbGF2ZQ==",
    "Bearer",
    "Bearer   ",
    "Bearerabc",
  ];
  for (const valor of casos) {
    assert.equal(extraerToken({ authorization: valor }), null, `\`${String(valor)}\` no es un Bearer usable`);
  }
  assert.equal(extraerToken({}), null, "sin cabecera, sin token");
});

test("sin cabecera Authorization no se pasa (§2 del contrato: 401)", async () => {
  await esperar401({}, OK, /falta la cabecera/);
});

test("un token que no verifica es 401, y el motivo queda en el log y no en la respuesta", async () => {
  // El detalle viaja al log. Al cliente le llega el código y el texto, que son
  // los mismos para los tres casos: la acción del usuario es una sola.
  await esperar401(
    { authorization: "Bearer token.falso" },
    async () => {
      throw new Error("FirebaseAuthError: Decoding Firebase ID token failed");
    },
    /el token no verifica.*Decoding Firebase ID token failed/,
  );
});

test("un token VENCIDO también es 401", async () => {
  await esperar401(
    { authorization: "Bearer token.vencido" },
    async () => {
      const err = new Error("Firebase ID token has expired");
      err.name = "FirebaseAuthError";
      throw err;
    },
    /has expired/,
  );
});

test("un token que verifica pero no trae uid usable no pasa: falla CERRADA", async () => {
  await esperar401({ authorization: "Bearer raro" }, async () => ({ uid: "   " }), /no trae un `uid` usable/);
  await esperar401(
    { authorization: "Bearer raro" },
    async () => ({ uid: undefined } as unknown as { uid: string }),
    /no trae un `uid` usable/,
  );
});

test("con un token válido, el dueño es el uid del token y nada más", async () => {
  const dueño = await identificarDueño({ authorization: "Bearer tomas" }, OK);
  assert.deepEqual(dueño, { uid: "uid-de-tomas" });
});

test("el emulador de Auth se detecta por la variable de entorno y por nada más", () => {
  // No hay ninguna rama `if (esLocal)` en el módulo: esto solo se PUBLICA en
  // /health. Una rama de modo local es la que un día se cuela en producción.
  assert.equal(usaEmuladorDeAuth({}), false);
  assert.equal(usaEmuladorDeAuth({ [VARIABLE_EMULADOR_AUTH]: "" }), false);
  assert.equal(usaEmuladorDeAuth({ [VARIABLE_EMULADOR_AUTH]: "localhost:9099" }), true);
  assert.equal(VARIABLE_EMULADOR_AUTH, "FIREBASE_AUTH_EMULATOR_HOST", "es la que mira el Admin SDK");
});
