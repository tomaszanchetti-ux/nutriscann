# Card 6.2 — El total se publica siempre; la confianza deja de gobernarlo

> WS12/WS13, 03/09/2026. Cierra la card 6.2 de la Fase 6 (`docs/bloque0.fase6.md`).
> Redefinida por Tomás DURANTE la ejecución de la card, dos veces: primero para
> agregar un aviso de confianza baja visible, después para sacar ese aviso y
> dejar SOLO el cambio de backend. Este informe cuenta el alcance FINAL, el
> porqué de cada vuelta, y qué queda para otra card.

## 1. Qué cambió, y por qué en dos vueltas

**La decisión de producto, dicha por Tomás:** «el total se publica SIEMPRE.
[...] no mostrar ficha nos MATA». Hasta esta card, la compuerta del total
(nacida en la card 2.8, cerrada del todo en la card 6.1) apagaba el total
entero — los ocho `nutrients` en `null`, `total_no_publicable: true`,
`macro_pct: null` — cuando ningún alimento del plato llegaba al piso de
confianza `CONFIANZA_MINIMA_PARA_UN_TOTAL` (0,12) y ninguna ficha respaldaba lo
que la visión describió. El front mostraba «Sin números para este plato».

**Primera vuelta (el encargo original):** el total se publica siempre, y
cuando la confianza es baja la ficha lo dice con un aviso (`confianza_baja` +
`confianza_baja_motivo` en el payload, un recuadro nuevo en el reporte, dos
claves de copy nuevas). Se implementó entera: backend, front, copy y el
candado de `kb/seed/src/textos.test.ts`.

**Segunda vuelta (la redefinición, a mitad de la ejecución):** Tomás sacó el
aviso. Motivo, en sus palabras: **el score de confianza deja de ser algo que
el usuario vea**; la señal de calidad para quien usa la app no va a ser un
número que hay que interpretar, va a ser la VÍA por la que se llegó a cada
ficha (exacto, alias, difuso, cabeza de familia…), mostrada ítem por ítem — una
píldora por vía de match, que es **otra card**, no esta. Se revirtió todo lo de
la primera vuelta que no fuera estrictamente necesario para compilar: las dos
claves de copy, el recuadro `AvisoConfianzaBaja`, los campos `confianza_baja` /
`confianza_baja_motivo` del contrato. Se verificó con `git diff --stat` que
`config/copy.json`, `apps/web/src/lib/config.ts` y `kb/seed/src/textos.test.ts`
no aparecen en el diff final: cero cambios netos ahí.

**El alcance que queda, entonces:**

- `sumarTotales` (`functions/src/engine/arithmetic.ts`) deja de anular nada:
  `nutrients` y `macro_pct` se calculan SIEMPRE que haya al menos un ítem
  cuantificado. La única ausencia que sigue existiendo es la de siempre — un
  opcional que la fuente no declara (`opcionales_ausentes`), o un total sin
  macros que repartir (`macro_pct_motivo`, kcal 0 o alcohol puro).
- Se eliminan `total_no_publicable` (de `EngineTotals`, motor y front) y
  `TOTAL_SIN_PUBLICAR` (la constante de `arithmetic.ts`). No se agrega ningún
  campo en su lugar: la condición que antes cerraba la compuerta
  (`sinNadieIdentificado`, mirando `CONFIANZA_MINIMA_PARA_UN_TOTAL` e
  `identidad_respaldada`) desapareció del todo de `sumarTotales`. No queda ni
  un diagnóstico de confianza en el payload — `EngineTotals` no tiene un campo
  de `caveats` propio, así que no se inventó uno para guardar ahí ese
  diagnóstico (instrucción explícita de Tomás en la redefinición).
- `completo` vuelve a significar UNA sola cosa: la cobertura de MASA (¿todos
  los ítems del escaneo aportaron números?). Hasta hoy exigía ADEMÁS que algún
  alimento se identificara con confianza suficiente; ese segundo requisito se
  fue con la compuerta.
- `CONFIANZA_MINIMA_PARA_UN_TOTAL` conserva nombre y valor (0,12), pero queda
  **sin ningún uso operativo** en el motor: ni gatea, ni avisa. El comentario
  se reescribió para explicarlo y para reemplazar el histograma viejo (el
  plástico a 0,088, medido en la card 2.8 contra el golden v1-v3) por el
  histograma de hoy (§2).
- Front: `apps/web/src/lib/types.ts` pierde `total_no_publicable` de
  `EngineTotals`, sin reemplazo. `PantallaReporte.tsx` vuelve a las DOS
  preguntas de siempre para decidir si hay un donut que dibujar
  (`totals === null` o `macro_pct === null`); `SinTotales` queda para el caso
  que ya existía ANTES de la card 2.8 — no hay ningún nutriente que sumar
  porque ningún alimento identificado está en la base, o el total no tiene
  macros que repartir.

## 2. El histograma de hoy, y por qué el piso ya no separa nada

Medido hoy (WS12) con `node golden/bin/replay-vision.js` sobre
`fase/06-gramos-y-confianza` (con las cards 6.1 y 6.3 ya en el motor), la
confianza del **mejor ítem por plato** — que es lo único que el piso viejo
comparaba — de las 31 fotos del golden, ordenada:

```
0,160 30-envase-cerrado (difuso; envase con etiqueta legible, comida por diseño desde la 5.2)
0,206 06-risotto · 0,218 09-arepa · 0,255 14-queso-manchego · 0,270 12-naranja
0,306 28-comida-plastico (cabeza_subfamilia; la visión v6 lo dio por comida al 72 %)
0,319 18-huevos-rotos · 0,319 26-croquetas · 0,324 16-jamon-serrano · 0,355 15-pan-tostado
0,361 21-cocido · 0,383 24-espaguetis · 0,393 20-ensalada-mixta (compuesto)
0,510 23-salmon · 0,578 03-paella · 0,595 08-lentejas · 0,722 · 0,765 · 0,808 · 0,850 ×3 · 0,900 · 0,950 ×3 · 0,970 · 0,980
```

**Conclusión medida:** ningún plato del golden queda hoy bajo 0,12 — el piso
de la card 2.8 no frena a nadie del set real — y el plástico (0,306, el caso
que abrió la compuerta) queda por ENCIMA de cinco platos reales (envase
cerrado, risotto, arepa, queso manchego, naranja). La confianza sola ya no
puede separar «esto es basura» de «esto es comida real, identificada floja»:
la card 2.8 confiaba en un hueco (0,088 del plástico contra 0,152 del peor
plato correcto de esa corrida) que la visión v6 y el motor de la Fase 5
(compuestos, cabezas de familia y subfamilia) cerraron. El plástico es un
**defecto de la visión** —lo clasificó como comida al 72 %—, no algo que
ningún piso de confianza pudiera cortar sin tapar también esos cinco platos
buenos. Va a una deuda de curación de la visión aparte; esta card no lo toca.

## 3. Los tests

**`functions/src/engine/arithmetic.test.ts`:** 52 `it()` antes → 44 después.
Se reemplazaron dos bloques enteros que testeaban la compuerta vieja —
`describe("card 2.8 — un total donde nadie se identificó no es un total
completo")` (9 tests) y `describe("DT-37 — la compuerta distingue...")` (4
tests, sobre la segunda puerta de `identidad_respaldada`) — por un solo bloque
nuevo, `describe("card 6.2 — el total se publica siempre, sin importar la
confianza")` (5 tests):

1. los dos ítems del caso construido de la comida de plástico (250 g + 260 g,
   los dos a 0,088 de confianza) publican 1.020 kcal (con la ficha construida
   del test, 200 kcal/100 g), `completo: true`, `macro_pct` no nulo;
2. el conteo (`items_incluidos`, `grams_total`, `grams_cuantificados`) sigue
   siendo el de siempre, sin tocar los ítems;
3. **el candado explícito de la redefinición**: `CONFIANZA_MINIMA_PARA_UN_TOTAL`
   sigue valiendo 0,12, pero un ítem justo en el piso y uno muy por debajo
   (0,005) dan el MISMO `completo` y el MISMO `nutrients.kcal` — el piso no
   decide nada;
4. un plato con un ítem sin ficha sigue siendo parcial por MASA
   (`items_sin_datos`), no por confianza — y su `macro_pct` SÍ está, porque la
   confianza baja del otro ítem ya no lo apaga;
5. con 0 kcal el motivo del reparto sigue siendo el de las calorías, sin
   ninguna compuerta de por medio.

**`functions/src/engine/analyze.test.ts`:** 44 `it()` antes → 44 después
(mismo número de bloques; se reescribieron assertions adentro de 6 de ellos,
sin agregar ni quitar tests). Los cambios:

- `describe("card 2.8 — el motor entero contra la comida de plástico")` →
  renombrado `describe("card 6.2 — el motor entero contra la comida de
  plástico publica su total")`: el test que decía «los dos ítems matchean,
  quedan por el piso, y el total deja de ser completo» ahora dice «...y el
  total se publica igual» y afirma `nutrients.kcal: 1550.4` (510 g × 304
  kcal/100 g de Miel, la ficha real del fixture) con `completo: true`.
- `describe("DT-37 — la lasaña del plato 05...")`: el test de la comida de
  plástico **con el catálogo real** (`fdc-169640`, Miel) — el caso pedido
  explícitamente («el caso de la comida de plástico original, antes «sin
  total», ahora 1.550 kcal CON aviso» — sin el aviso, tras la redefinición) —
  ahora afirma `nutrients.kcal: 1550.4` y `completo: true` en vez de
  `total_no_publicable: true` y `nutrients.kcal: null`.
- Tres tests más (`card 5.3` — arroz cocido con cabeza de subfamilia, pizza
  con y sin familia declarada) perdieron su assertion
  `total_no_publicable === undefined` (el campo ya no existe; en uno se
  reemplazó por una afirmación positiva de que el número está).

**`kb/seed/src` (candado del contrato):** al correr `npm test` en `kb/seed`
apareció una falla PREEXISTENTE, no causada por esta card:
`contrato-front.test.ts` fallaba en `Composicion` porque
`apps/web/src/lib/types.ts` nunca había copiado el campo
`eslabon_mas_debil` que la card 6.1 le agregó a `Composicion` en
`functions/src/engine/types.ts`. Es un archivo de mi territorio
(`apps/web/src/lib/types.ts`) y el arreglo es de una línea (copiar el campo
tal cual, como pide el propio candado), así que se corrigió acá para dejar
`kb/seed` en verde. Eso a su vez dejó desactualizado el fixture generado
(`apps/web/src/lib/fixtures/scan.fixture.ts`, que databa de antes de la card
6.1) — se regeneró con el proceso documentado en su propia cabecera (`npm
--prefix functions run build` + `node
apps/web/src/lib/fixtures/regenerar.cjs`), corriendo el motor real contra el
catálogo real. El diff de la fixture es chico (agrega `eslabon_mas_debil` a
las dos composiciones reales) y no toca ningún número.

**Resultado final de todos los tests:**

| Suite | Antes → Después | Resultado |
|---|---|---|
| `functions` completo (`engine` + `kb` + `analyze`) | — | 525 pass, 1 skip, 0 fail |
| `arithmetic.test.js` (solo) | 52 → 44 tests | 44 pass, 0 fail |
| `analyze.test.js` (solo) | 44 bloques, 62 tests en runtime | 62 pass, 0 fail |
| `functions` — `npm run lint` (`tsc --noEmit`) | — | limpio |
| `functions` — `npm run build` | — | limpio |
| `apps/web` — `npm run lint` (`tsc -b`) | — | limpio |
| `apps/web` — `npm run build` (`tsc -b && vite build`) | — | limpio |
| `kb/seed` — `npm test` | — | 126 pass, 0 fail |

`grep -rn "total_no_publicable\|TOTAL_SIN_PUBLICAR" functions/src apps/web/src kb`
→ **cero resultados**.

## 4. El caso de la comida de plástico, antes y después

| | Antes (card 6.1) | Después (card 6.2) |
|---|---|---|
| `totals.nutrients.kcal` | `null` | `1550.4` |
| `totals.total_no_publicable` | `true` | *(campo eliminado)* |
| `totals.completo` | `false` | `true` |
| `totals.macro_pct` | `null` | `{ protein: …, carbs: …, fat: … }` (no nulo) |
| Front (`PantallaReporte`) | «Sin números para este plato» | El donut con 1.550 kcal, igual que cualquier otro escaneo |

## 5. Qué hace falta al desplegar

**Nada de `config/copy.json`.** La primera vuelta de esta card sumó dos claves
(`report_low_confidence_title`, `report_low_confidence_body`); la redefinición
las sacó, y se verificó que el archivo, `apps/web/src/lib/config.ts` y
`kb/seed/src/textos.test.ts` quedaron BYTE A BYTE como estaban al empezar
(`git diff --stat` no los lista). No hace falta ningún re-seed por esta card.

Lo único que cambia de comportamiento en producción es el motor
(`functions/src/engine/arithmetic.ts`): al desplegar, cualquier escaneo cuyo
mejor ítem quede bajo 0,12 y sin identidad respaldada — hoy, medido, NINGUNO
del golden, pero puede pasar con una foto rara — va a publicar su total en vez
de mostrar «Sin números para este plato». Es el cambio de producto que pidió
Tomás; no requiere ninguna acción de despliegue aparte del deploy normal.

## 6. Desvíos y lo que no se hizo

- **El aviso de confianza baja completo (`confianza_baja`,
  `confianza_baja_motivo`, `AvisoConfianzaBaja`, dos claves de copy) se
  implementó y se revirtió** dentro de esta misma sesión, por la redefinición
  de Tomás a mitad de camino. No queda rastro en el código final; queda este
  párrafo como registro de que existió.
- **No se tocó `RESPALDO_MINIMO_DE_IDENTIDAD`** (el comentario, en
  `constants.ts`, inmediatamente después de `CONFIANZA_MINIMA_PARA_UN_TOTAL`):
  su texto todavía dice «la mitad de visión de la confianza se compara contra
  el mismo piso. Ver `sumarTotales`», que ya no es cierto —`sumarTotales` no
  compara nada contra ningún piso—. No es mi territorio (el encargo original
  reserva ese archivo, salvo el comentario de `CONFIANZA_MINIMA_PARA_UN_TOTAL`,
  para el agente de la card 6.3) y tocarlo hubiera sido reescribir un
  comentario ajeno sin que nadie lo pidiera. Queda como hallazgo para quien
  cierre la 6.3 o para una deuda en `docs/DEUDAS.md`.
- **No se creó ningún modo de fixture nuevo para el front** (p. ej.
  `VITE_ANALYZE_FIXTURE=confianza_baja`). Con el aviso sacado del alcance, no
  hay nada nuevo que demostrar en el front — los tres modos existentes
  (`1`/`reporte`, `completo`, `sin_total`) siguen representando exactamente lo
  que representaban.
- **`identidad_respaldada` y `CONFIANZA_MINIMA_PARA_UN_TOTAL` quedan sin
  ningún consumidor en `arithmetic.ts`.** Se conservan (no se pidió borrarlos)
  porque documentan la historia y porque `identidad_respaldada` sigue viva
  como campo de `EngineItem` — puede ser insumo de la futura píldora por vía
  de match. Si esa card nunca los usa, `CONFIANZA_MINIMA_PARA_UN_TOTAL` queda
  como una constante puramente documental; no es una deuda nueva, es una
  decisión explícita de esta card.
- **Se corrigió, de paso, una falla preexistente** en el candado
  `contrato-front.test.ts` (campo `eslabon_mas_debil` de `Composicion` que
  nunca se había copiado al front) y se regeneró el fixture del reporte que
  quedó desactualizado por esa misma falta. No es parte del contrato de esta
  card, pero estaba en mi territorio (`apps/web/src/lib/types.ts` y el
  fixture) y bloqueaba el `npm test` de `kb/seed` que sí me pidieron dejar en
  verde.
