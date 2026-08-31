# `kb/seed` — publicación del catálogo y la configuración a Firestore

La capa [4] del pipeline de la base de conocimiento (ver `docs/PLAN.md`): agarra
`kb/build/foods.canonical.json` y lo publica en la colección `foods/` de
Firestore.

Son **dos comandos hermanos**, con el mismo cliente REST y la misma idea de
idempotencia:

| Comando | Qué publica | De dónde sale |
|---|---|---|
| `seed` | La colección `foods/` + `config/kb_meta` | `kb/build/foods.canonical.json` |
| `seed:config` | El documento `config/app` | `config/recommendation_rules.json` + la `kb_version` del catálogo |

El primero ocupa casi todo este README; el segundo tiene su sección propia,
**[El seed de configuración](#el-seed-de-configuración-configapp)**.

**La fuente de verdad es el repo, no Firestore.** Firestore es una copia de
servicio: lo que está publicado tiene que ser exactamente lo que dice el
catálogo commiteado. Este paquete es el único camino para que eso pase; nadie
edita `foods/` a mano en la consola.

## En una frase

El seed lee lo que hay publicado, lo compara con el catálogo y escribe **solo
lo que difiere**. Correrlo dos veces seguidas hace **cero escrituras** la
segunda vez, y eso no es una promesa: es lo que mide la prueba contra el
emulador.

## Semántica

| Situación | Qué hace |
|---|---|
| El alimento está en el catálogo y no en Firestore | **Crea** `foods/{id}` |
| Está en los dos y el documento publicado es idéntico | **No escribe** |
| Está en los dos y difiere en algo | **Reemplaza** el documento entero |
| Está en Firestore y ya no está en el catálogo | **Marca `deprecated: true`** con merge. **Nunca borra.** |
| Ya estaba marcado `deprecated` | No lo vuelve a escribir |
| Las deprecaciones superan el 10 % de lo publicado | **Aborta sin escribir nada** (ver el freno, más abajo) |

Cada documento sale con `kb_version` estampada (la del catálogo: semver + hash
del contenido). Cambiar la versión toca todos los documentos, y así tiene que
ser: la versión es parte del documento, no un metadato aparte.

**El re-seed es un re-escaneo, no un DELETE** (regla dura #6 de `CLAUDE.md`).
El código de producción de este paquete no tiene ninguna operación de borrado:
no es que se evite, es que no existe. (El único `DELETE` del paquete está en
`emulador.test.ts`, contra el endpoint `/emulator/v1/...` que solo existe en el
emulador, para arrancar el circuito con la base limpia.) Un alimento que sale
del catálogo queda en `foods/` con todos sus nutrientes intactos y una marca;
si mañana vuelve al catálogo, el seed lo
devuelve a la normalidad sin ninguna lógica especial (el catálogo trae
`deprecated: false` y el reemplazo es completo).

### Es agnóstico del esquema del alimento

El seed **no conoce** los campos de un alimento. Serializa lo que venga en
`foods[]`, recursivamente, y le suma `kb_version`. Lo único que exige es que
haya `kb_version`, que haya `foods[]`, y que cada alimento tenga un `id` legal
como nombre de documento en Firestore.

Es a propósito: el catálogo está creciendo (alimentos regionales, formatos
nuevos de aliases, campos de confianza). Un seed que enumerara campos
convertiría cada mejora del catálogo en un seed roto.

### El freno de deprecaciones

Deprecar es el único acto casi destructivo del seed: no borra, pero saca
alimentos de circulación. Un catálogo truncado — un build a medias, un
`--catalog` apuntando al archivo equivocado — depreca en masa, y hacerlo en
silencio sería un desastre silencioso.

Por eso: **si las deprecaciones de una corrida superan el 10 % de lo publicado,
la corrida aborta con código de salida ≠ 0 y no escribe NADA** — ni las
deprecaciones ni las altas. Un catálogo truncado no es medio válido.

Cuando la baja masiva es de verdad intencional, se autoriza a mano:

```bash
node kb/seed/dist/index.js --project nutriscann-f809e --allow-deprecations 42
```

`--allow-deprecations N` no es un cheque en blanco: autoriza hasta N
deprecaciones, y N+1 vuelve a frenar. El `--dry-run` nunca aborta: reporta el
diff completo, avisa que la corrida real frenaría y termina con código ≠ 0.

### El criterio de idempotencia

Antes de escribir un documento se lee el publicado y se comparan los dos en
**JSON canónico** — mismo contenido con las claves de todo mapa ordenadas
alfabéticamente. El orden de las claves no cuenta (Firestore no lo conserva);
el orden de un array sí (los aliases y las porciones están ordenados a
propósito).

La comparación se hace en JSON pelado, no en el formato `Value` de Firestore:
el documento leído se traduce de vuelta a JSON y recién ahí se compara. Por eso
la traducción tiene que ser round-trip estable, y hay tests que solo verifican
eso (`valores.test.ts`).

### `config/kb_meta` y la fecha

Al cierre de cada corrida que cambió algo se escribe:

```json
{
  "kb_version": "1.1.0+cde2a831",
  "seeded_at": "2026-08-30T13:30:25.074Z",
  "counts": { "total": 998, "created": 998, "updated": 0, "unchanged": 0, "deprecated": 0 }
}
```

`seeded_at` es el único campo no determinístico de todo el seed. **Decisión:
`kb_meta` se reescribe solo cuando la corrida cambió algo** (o cuando el
documento no existe, o cuando cambió la `kb_version`). Si se escribiera
siempre, la segunda corrida haría una escritura y la idempotencia sería una
frase en un README en vez de un hecho medible.

La consecuencia, declarada: **`seeded_at` es "cuándo cambió por última vez lo
publicado", no "cuándo se corrió el seed por última vez".** Para lo segundo
están los logs de la corrida, que siempre imprimen los conteos.

## Uso

### Contra el emulador (probar sin tocar nada)

```bash
# en una terminal
firebase emulators:start --only firestore

# en otra
npm --prefix kb/seed install          # una sola vez
npm --prefix kb/seed run compile
node kb/seed/dist/index.js --project nutriscann-f809e --emulator
```

Con `--emulator` el destino es `FIRESTORE_EMULATOR_HOST` si está seteada y
`localhost:8080` si no, y la credencial es `Bearer owner` (lo que el emulador
espera). El `--project` puede ser cualquiera: el emulador crea el proyecto que
le pidan.

### Contra el proyecto real

El seed **no genera credenciales**: recibe un access token ya emitido, por
`--token` o por la variable `SEED_TOKEN`.

```bash
npm --prefix kb/seed run compile

# primero, siempre, el simulacro: dice qué haría y no escribe nada
SEED_TOKEN="$(gcloud auth print-access-token --account=tomaszanchetti@gmail.com)" \
  node kb/seed/dist/index.js --project nutriscann-f809e --dry-run

# y recién con el diff a la vista, la corrida de verdad
SEED_TOKEN="$(gcloud auth print-access-token --account=tomaszanchetti@gmail.com)" \
  node kb/seed/dist/index.js --project nutriscann-f809e
```

Las reglas de `firestore.rules` dicen `allow write: if false` para `foods/` y
`config/`: eso es para el **cliente**. El seed entra con un token de una
identidad con permiso de Datastore, que por diseño no pasa por las reglas — el
mismo camino que usa el Admin SDK. No hay que aflojar ninguna regla para
sembrar.

Firestore anda en plan Spark: **el seed no depende de DT-1** (activar Blaze).

Contra el proyecto real el host tiene que ser `https://` — el access token viaja
en la cabecera `Authorization` y por HTTP plano se lee en el camino. Un `--host`
con `http://` se rechaza antes de abrir la conexión; para apuntar a un servidor
local está `--emulator`, que no manda ningún token real.

### Opciones

```
--project <id>     obligatorio; no hay proyecto por defecto a propósito
--catalog <ruta>   por defecto kb/build/foods.canonical.json
--emulator         escribe contra el emulador en vez del proyecto real
--token <token>    access token OAuth (o la variable SEED_TOKEN)
--host <host>      sobrescribe el host del destino
--database <id>    base de datos de Firestore; por defecto "(default)"
--dry-run          calcula el diff, lo reporta y no escribe nada
--allow-deprecations <n>
                   autoriza hasta n deprecaciones en esta corrida
--help
```

## El seed de configuración (`config/app`)

Lo mismo que hace `seed` con el catálogo, hace `seed:config` con la
configuración de negocio: **la fuente de verdad es el repo** (`config/`, ver
`config/README.md`) y Firestore es la copia. Es lo que hace cumplir la regla
dura n.º 1 —*nada hardcodeado*—: los umbrales y las plantillas se editan en un
PR y se publican sin desplegar.

```bash
# contra el emulador
node kb/seed/dist/seed-config.js --project nutriscann-f809e --emulator

# contra el proyecto real: primero el simulacro, siempre
SEED_TOKEN="$(gcloud auth print-access-token --account=tomaszanchetti@gmail.com)" \
  node kb/seed/dist/seed-config.js --project nutriscann-f809e --dry-run
```

### Qué escribe, y sobre todo qué NO

`config/app` es un documento **compartido**: además de las reglas tiene los
textos de la interfaz (`copy`) y el tope de análisis por día
(`max_scans_per_day`), que son de otra mano. Por eso la escritura es un
**merge con máscara de cuatro campos**:

| Campo | Qué es |
|---|---|
| `recommendation_rules` | El documento de `config/recommendation_rules.json` **entero**, tal cual |
| `kb_version` | La versión del catálogo canónico — el mismo archivo que publica `foods/`, para que las dos no puedan divergir |
| `updated_by` | `"seed-config"` |
| `updated_at` | Cuándo cambió por última vez lo publicado |

Todo lo demás queda intacto, y eso no es una promesa del código: es lo único
que la máscara permite tocar.

`updated_at` sigue el mismo criterio que `seeded_at` en `config/kb_meta` — se
mueve **solo cuando el contenido cambió**, para que la segunda corrida seguida
pueda hacer cero escrituras de verdad. (No confundir con el `updated_at` que
está *adentro* de `recommendation_rules`: ese es la fecha de edición del
archivo y lo escribe una persona en el PR.)

### Los candados: qué se rechaza antes de tocar la red

El seed del catálogo es agnóstico del esquema a propósito; este **no**, y por un
motivo concreto de `config/README.md` §4.3: la interfaz elige ícono y color a
partir del `tag`, así que **un tag mal escrito no rompe nada visible, se degrada
en silencio**. Lo que se valida:

- `tags` es una lista cerrada, sin repetidos;
- el `tag` de **cada** regla y el `fallback_tag` pertenecen a esa lista;
- no hay dos reglas con el mismo `id`;
- cada regla tiene `if`, `priority` numérica y `templates.es`;
- ninguna condición nombra un identificador que no esté en
  `evaluation.identifiers_allowed`.

Ese último chequeo es **léxico, no sintáctico**: se sacan del `if` los nombres
que parecen identificadores y se comparan con la lista. Alcanza para cazar un
`sodium_per_kcal` mal tipeado; no dice si la expresión está bien formada — la
gramática la implementa el motor, no el seed.

Todo esto pasa **antes** de abrir una conexión: un documento inválido frena la
corrida sin haber hablado con Firestore.

### Opciones

```
--project <id>     obligatorio; no hay proyecto por defecto a propósito
--rules <ruta>     por defecto config/recommendation_rules.json
--catalog <ruta>   de dónde sale la kb_version; por defecto kb/build/foods.canonical.json
--emulator         escribe contra el emulador en vez del proyecto real
--token <token>    access token OAuth (o la variable SEED_TOKEN)
--host <host>      sobrescribe el host del destino
--database <id>    base de datos de Firestore; por defecto "(default)"
--dry-run          calcula el diff, lo reporta y no escribe nada
--help
```

### El circuito local de la Fase 2

Con el emulador levantado, un solo comando desde la raíz publica el catálogo y
la configuración contra `localhost:8080`:

```bash
# terminal 1 — el emulador de Firestore necesita Java (CLAUDE.md)
PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npm run emulators

# terminal 2
npm run kb:seed:local
```

`kb:seed:local` corre los dos seeds en orden —primero el catálogo, después la
configuración— porque `config/app` estampa la `kb_version` del catálogo que se
acaba de publicar. No le pases argumentos extra: npm los agregaría al final del
comando compuesto, o sea solo a la segunda mitad; para un simulacro usá
`npm run kb:seed -- --dry-run …` o `npm run kb:seed:config -- --dry-run …`
por separado.

Del lado del frontend, `apps/web/.env.local` con `VITE_FUNCTIONS_EMULATOR=1`
completa el circuito (ver `apps/web/.env.local.example`).

## Los tests

```bash
npm --prefix kb/seed test                    # unitarios; no necesitan nada levantado
npm --prefix kb/seed run test:emulator       # los dos circuitos; EXIGEN el emulador
npm --prefix kb/seed run test:emulator:config  # solo el de configuración
```

Los unitarios prueban la **decisión** (`planificar` es pura: recibe el catálogo
y lo publicado, devuelve el plan) y la traducción JSON ⇄ Firestore. Cada
escenario se construye: un alimento nuevo, uno mutado, uno que salió del
catálogo. No se sale a buscar en los cientos de documentos reales uno que
casualmente sirva.

`test:emulator` corre el circuito de la card contra el emulador, con el
catálogo real, y afirma sobre los **conteos** de cada corrida:

1. base vacía → se crean todos los alimentos del catálogo;
2. otra vez → 0 escrituras;
3. un documento mutado a mano → exactamente 1 reparado (y antes, un `--dry-run`
   que lo detecta y no escribe);
4. un alimento sacado del catálogo → ese documento queda `deprecated: true`,
   **sigue existiendo**, el resto del documento intacto, y la colección sigue
   teniendo la misma cantidad de documentos;
5. el alimento repuesto → vuelve a la normalidad;
6. una corrida más → 0 escrituras;
7. un catálogo truncado (10 alimentos donde había cientos) → la corrida aborta,
   la base queda intacta y no hay ni un documento deprecado de más.

Antes de todo eso, un simulacro sobre la base vacía verifica que el `--dry-run`
anuncie que `config/kb_meta` se escribiría — y que efectivamente no lo escriba.

Usa el proyecto `nutriscann-seed-qa`, que no existe en GCP, y vacía sus datos
por el endpoint `/emulator/v1/...`, que **solo existe en el emulador**.

El circuito del **seed de configuración** va aparte (`emulador-config.test.ts`,
proyecto `nutriscann-config-qa`) y afirma sobre las escrituras de cada corrida:

1. el documento no existe → se crea con las reglas del repo, enteras;
2. otra vez → 0 escrituras **y `updated_at` no se mueve**;
3. otra mano agrega `copy` y `max_scans_per_day` → sigue en 0 escrituras;
4. las reglas editadas a mano → se repara **solo** `recommendation_rules`, y
   `copy` sobrevive al merge;
5. sube la `kb_version` → se escribe solo ese campo;
6. una corrida más → 0 escrituras.

No lee `kb/build`: construye su propia `kb_version`, así no se vuelve
intermitente cuando el catálogo se está recompilando.

## Detalles de implementación

- **Cero dependencias de runtime**, como `kb/`: se habla con Firestore por su
  API REST con el `fetch` nativo de Node 22. Nada de `firebase-admin`.
- **Paquete propio** (no parte de `kb/`) para que su `tsc` escriba en
  `kb/seed/dist` y no compita con `kb/dist`.
- **Lotes de 500** (`:batchWrite`, el límite de Firestore) y reintentos con
  espera creciente ante 429 y 5xx. Esos reintentos son del **HTTP del lote**,
  no de una escritura individual: `batchWrite` devuelve un estado **por
  escritura**, y un lote puede volver con HTTP 200 y una escritura fallada
  adentro. El cliente revisa ese arreglo — no mirarlo sería reportar éxito
  sobre algo que no se escribió — y una escritura fallada aborta la corrida.
- `batchWrite` no es transaccional: si una corrida se corta a la mitad (por eso
  o por cualquier otra cosa), quedan documentos escritos y otros no. No hace
  falta reparar nada a mano — la corrida siguiente termina el trabajo, que es
  exactamente lo que significa idempotente.
- Las claves con puntos de `provenance` (`"per_100g.kcal"`) son legales como
  claves de mapa; solo serían rutas de campo si viajaran en un `updateMask`. El
  seed manda dos máscaras: `["deprecated"]` al deprecar y los campos de
  `config/kb_meta` (`counts`, `kb_version`, `seeded_at`). Ninguna tiene puntos
  hoy, pero todas se escapan con backticks igual, para que la corrección no
  dependa de que los nombres de campo sigan siendo mansos.

## Limitaciones conocidas

- Un entero mayor a 2^53 perdería precisión al volver de Firestore y su
  documento se vería "distinto" en cada corrida (se reescribiría siempre).
  El catálogo hoy no tiene ninguno — el número más grande es un sodio de cuatro
  cifras.
- Cada corrida lee la colección `foods/` entera (una lectura por documento) para poder
  comparar. Es el precio de no escribir de más; a esta escala es despreciable.
