# Card 6.1 — La confianza de un compuesto se pondera por gramos; cada ingrediente conserva la suya

> WS13, 03/09/2026. Cierra la card 6.1 de la Fase 6 (`docs/bloque0.fase6.md`).
> El motor (`compose.ts`, `types.ts`) venía de un commit WIP (`d15a8fb`) con la
> lógica y el caveat ya escritos; esta card agrega los tests que faltaban, mide
> el efecto sobre el golden real y deja este informe.

## 1. Qué cambió

Hasta la Fase 6, la confianza de un plato compuesto en el momento (ensalada,
bocadillo, guiso) era la del **eslabón más débil**: `min(confianza de cada
ingrediente) × FACTOR_COMPOSICION`. Un solo ingrediente mal identificado —a
veces 10 g de 400— decidía la confianza del plato entero, y con eso si el
usuario veía un total o no.

Ahora es el **promedio de las confianzas de los componentes resueltos,
ponderado por sus gramos** —cada una ya con su descuento de ficha genérica—, y
recién sobre ese promedio cae el ×0,8 de la composición (×0,6 si es parcial),
exactamente como antes. Los ingredientes que faltaron en una composición
parcial no entran ni al numerador ni al denominador del promedio: no tienen
confianza que promediar, y ya se cobran aparte (`FACTOR_COMPOSICION_PARCIAL` +
el candado de `MASA_FALTANTE_MAXIMA`).

El eslabón más débil no desaparece: como el promedio puede tapar un ingrediente
mal identificado entre varios buenos, cada composición declara
`composicion.eslabon_mas_debil` (término, ficha en español y confianza del peor
componente) y lo nombra con todas las letras en un caveat, pegado —siempre
segundo, justo después del caveat "Plato compuesto en el momento..."— al de la
composición.

El contrato completo, con el porqué de "gramos y no kcal" y el límite
declarado, está en la decisión 4 del encabezado de `functions/src/engine/compose.ts`.
Esta card no la reescribió: la verificó con tests y la midió contra el golden.

## 2. Los tests (`functions/src/engine/compose.test.ts`)

- **Se reescribió el test viejo** ("la confianza es la del eslabón MÁS DÉBIL")
  para describir la regla nueva, con el mismo escenario (200 g `Rice noodles` a
  1,0 + 100 g `Pastel brasileño` a 0,6×0,85 genérico) y el número esperado
  CALCULADO en el test a partir de las confianzas y los gramos, no pegado como
  literal. De paso deja escrito qué habría dado el mínimo viejo (0,408) para
  que el contraste quede a la vista.
- **Seis tests nuevos** en `describe("card 6.1 — la confianza se pondera por
  gramos")`, con escenarios CONSTRUIDOS sobre un índice de fixture (dos fichas
  de confianza controlada por alias, no del catálogo real — no había necesidad
  de familia/taxonomía):
  1. un ingrediente chico y malo (10 g, confianza 0,1) no hunde un plato grande
     y bueno (390 g, confianza 1,0): la ponderada da 0,782 contra el 0,08 que
     habría dado el mínimo;
  2. el mismo par de fichas invertido en gramos (300 g malo + 100 g bueno) SÍ
     baja la confianza (0,26): el promedio pesa, no perdona;
  3. `eslabon_mas_debil` apunta al componente de menor confianza y su
     `confidence_match` es exactamente el mismo número que el componente
     homónimo trae en `componentes`;
  4. el caveat del eslabón más débil nombra el término, la ficha en español y
     el porcentaje, y es el segundo caveat, inmediatamente después del de la
     composición;
  5. en una composición parcial (25 % de masa faltante, el borde de
     `MASA_FALTANTE_MAXIMA`), el faltante NO entra al promedio: se verifica que
     el resultado (0,33) es el de promediar solo los resueltos, y NO el que
     daría contarlo como un cero en el denominador (0,248);
  6. la cuenta se puede rehacer desde los `confidence_match` y `grams` que
     viajan en `componentes`: se recompone la fórmula desde la salida y se
     compara contra `confianza_match` publicado.

**Conteo de `compose.test.ts`:** 24 `it()` antes → 30 después (23 se
mantuvieron sin tocar, 1 se reescribió, 6 son nuevos). Corridos con `node
--test lib/engine/compose.test.js`: **82 tests, 82 pasan, 0 fallan** (el número
82 y no 30 porque el primer `describe` itera las 53 recetas del catálogo, una
`it` por receta). `npm run lint` (`tsc --noEmit`) limpio. La suite entera de
`functions` (`npm test`): **582 tests, 580 pasan, 2 skipped, 0 fallan** — verde
de punta a punta.

## 3. La medición sobre el golden (vision-v6)

Script nuevo: `golden/bin/replay-vision.js`. Lee los 31 JSON de
`golden/set-30/vision-v6/` (la salida cruda de la visión de ese día, con
`components`), los pasa por `analizarEscaneo` (el motor entero) y compara dos
corridas: **main** (baseline, sin la card 6.1 ni la 6.3) contra **esta rama**
(`fase/06-gramos-y-confianza`, con las dos cards ya en el motor). El baseline
se compiló en un `git worktree` temporal, descartado al terminar; el catálogo
(`kb/build/foods.canonical.json`) es idéntico entre las dos ramas —verificado
con `git diff main -- kb/build/foods.canonical.json`, cero diferencias—, así
que lo único que puede moverse es el motor.

**Resultado: de las 30 fotos (55 ítems, 2 "no es comida"), UNA sola cambia:
la foto 20, "ensalada mixta".** Es exactamente el caso del §1 del Bloque 0
(`docs/bloque0.fase6.md`), reconstruido en el golden.

| | main (baseline) | esta rama | atribución |
|---|---|---|---|
| Confianza del compuesto | **0,107** | **0,393** | card 6.1 (ponderado vs. mínimo) |
| kcal del ítem | 243,9 | 241,7 | card 6.3 (ver abajo) |
| Total del plato | **SIN TOTAL** (0,107 < piso 0,12) | **241,7 kcal, publicado** (0,393 > piso 0,12) | consecuencia de la 6.1 |
| `eslabon_mas_debil` | (no existía el campo) | `"canned tuna" → Atún @ 0,157` | card 6.1 |

Los siete componentes de la ensalada (lechuga, tomate, maíz, zanahoria, huevo,
atún, lombarda) resuelven a LAS MISMAS fichas en las dos corridas, con una
única excepción: `red cabbage, shredded` (la lombarda, 10 g) resuelve a
`fdc-2709893` "Repollo rojo **cocido** con sal y grasa" en main y a
`fdc-169977` "Repollo rojo **crudo**" en esta rama, con la misma confianza
(0,6) pero valores por 100 g distintos — es el desempate crudo/cocido de la
**card 6.3**, que vive en el mismo working tree (`match.ts`) y no es parte de
esta card. Por eso el kcal del ítem se mueve 2,2 kcal (243,9 → 241,7) mientras
que el salto de confianza (0,107 → 0,393, ×3,7) es enteramente de la 6.1: el
atún en lata sigue matcheando a la misma ficha genérica `Atún` a 0,157 en las
dos corridas, y con el mínimo viejo ese 0,157 seguía decidiendo por los otros
seis ingredientes — con la ponderada, sus 60 g de 350 pesan lo que pesan.

**Ningún otro ítem de las 30 fotos se mueve: ni confianza ni kcal.** Confirma
lo que dice la decisión 4 del encabezado de `compose.ts` ("los otros 54 [de
55] ítems dan la misma confianza y las mismas kcal") — con el número exacto
verificado, no repetido de memoria.

Fotos 28 ("comida de plástico") y 30 ("envase cerrado"), que el Bloque 0
(H2) señala como el otro lado del problema de la compuerta, **no se mueven con
esta card**: no son compuestos on-demand (resuelven por `cabeza_subfamilia` y
por `difuso` respectivamente), así que quedan fuera del alcance de la 6.1 —
es exactamente lo que le toca resolver a la 6.2.

## 4. El límite, declarado

El promedio ponderado por gramos **pesa, no jerarquiza**: no distingue el
ingrediente que le da el nombre al plato de los que lo acompañan. Un plato con
su ingrediente PRINCIPAL mal identificado y varios secundarios bien
identificados sube de confianza (test 2 de la §2 lo mide: 300 g malos + 100 g
buenos siguen dando 0,26, bajo, porque el malo pesa las tres cuartas partes —
pero si los gramos estuvieran más repartidos el promedio subiría más de lo que
un lector esperaría de "el ingrediente principal está mal"). Por eso el
eslabón más débil se sigue declarando aparte, con nombre y número, en
`composicion.eslabon_mas_debil` y en el caveat: el promedio decide el número,
pero no oculta cuál fue el ingrediente peor identificado.

## 5. Qué queda para la 6.2

La compuerta del 12 % (`CONFIANZA_MINIMA_PARA_UN_TOTAL` en `constants.ts`) se calibró en
la card 2.8 sobre un golden que no tenía compuestos. Con esta card, el número
que la compuerta recibe de un compuesto cambió de forma (0,107 → 0,393 en el
caso medido), así que el piso se calibra con estos números nuevos, no con los
viejos — y sigue sin frenar ni al plato 28 ni al 30, que no son compuestos y
necesitan la segunda puerta (la subfamilia declarada) que describe el Bloque
0 en H3. Ese es el trabajo de la 6.2: golden de compuestos + segunda puerta,
sobre el motor tal como queda después de esta card.
