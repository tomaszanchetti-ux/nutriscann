# Card 6.3 — Desempate crudo/cocido simétrico, con las lentejas secas como candado

> WS13, 03/09/2026. Cierra la card 6.3 de la Fase 6 (`docs/bloque0.fase6.md`,
> hallazgo H4). El motor (`match.ts`, `constants.ts`) venía de un commit WIP
> (`d15a8fb`) con la lógica y los tests ya escritos; esta card audita ese WIP
> con ojo adversarial, agrega los cinco tests que faltaban y mide el efecto
> sobre los tres corpus.

## 1. Qué cambió

Hasta la Fase 6, cuando la visión describía un ingrediente sin decir su estado
("lechuga picada", `lettuce, shredded`) y el catálogo ofrecía una ficha cruda y
una cocida del mismo alimento, el desempate lo decidía el **largo del
nombre**: la lista se recorre ordenada de más largo a más corto y "cocida"
tiene una letra más que "cruda" en español (y "cooked" el triple de letras que
"raw" en inglés), así que la cocida siempre entraba primero a la posición
`mejor` y nada la desalojaba. Una ensalada verde salía 12 % inflada.

El WIP agregó `desempateDeEstado` en `match.ts`: cuando la consulta no declaró
estado y dos candidatos EMPATAN en confianza siendo hermanas (mismo alimento
sin descriptores), gana la cruda salvo que sea más densa que la cocida (está
SECA: lentejas, arroz salvaje) **o** su familia no esté en
`FAMILIAS_QUE_SE_COMEN_CRUDAS` (`constants.ts`: `["verdura", "fruta"]`). Esta
segunda condición es la que el WIP dejó "a mitad" — verificado en esta card:
**estaba completa**. `constants.ts` declara la constante con su motivo
completo y `match.ts` la usa dentro de `desempateDeEstado`; el
`describe("card 6.3 — ...")` de `match.test.ts` ya pasaba entero antes de
tocar nada. Lo que faltaba no era código: era la auditoría y la medición.

## 2. La auditoría, pregunta por pregunta

**¿`sinDescriptores` trata crudo/cocido como descriptores?** Sí.
`DESCRIPTORES_DE_PRESENTACION` (`constants.ts`) incluye `"raw"`, `"cooked"`,
`"crudo"`, `"cruda"`, `"cocido"`, `"cocida"` (y sus plurales), así que la
condición 2 de `desempateDeEstado` ("hermanas del mismo alimento") funciona
como dice el comentario: `lechuga cruda` y `lechuga cocida` reducen las dos a
`lechuga`.

**¿Tres candidatos empatados (cruda, cocida y una tercera ficha distinta)?**
El catálogo real SÍ tiene grupos de 3 o más fichas con el mismo texto sin
descriptores — `huevo` (cocido/crudo/frito) y `patata`
(hervida/cruda/frita/asada/salteada) son los dos casos reales, medidos con un
barrido (`match.test.ts`, "tres candidatos reales..."). En los dos, el tercer
candidato difiere por una PALABRA DE PREPARACIÓN (`frito`, `asado`,
`salteado`), y la condición 3 de la dirección C (`mismasPreparaciones`, ya
existía desde la card 2.8) lo saca de la competencia en cuanto la consulta no
nombra esa preparación: nunca llega a empatar por confianza con la pareja
hermana, así que `huevo duro` y `patata troceada` siguen resolviendo entre DOS
candidatos, no tres.

Construyendo el caso a mano (un tercero que NO declara preparación NI estado,
solo una palabra de presentación como "sliced") sí aparece un límite real: ese
tercero no pierde el desempate contra la cruda ni contra la cocida —la
condición de `estados` de `desempateDeEstado` exige que el PAR tenga un
"crudo" Y un "cocido", y contra un `estado: undefined` nunca se completa—, así
que si el tercero llega primero a la posición `mejor` (por el mismo criterio
de largo+id que decidía todo antes de esta card) **se queda ahí y gana**, sin
que la pareja hermana llegue a compararse directamente. Es el mismo defecto
que abrió la card 6.3, un escalón más allá: entre TRES candidatos en lugar de
dos. **No se arregló**: el catálogo real no lo dispara (medido, la fila de
arriba) y cerrarlo de verdad exige juntar a los empatados y resolverlos como
grupo, no de a pares — un cambio de forma del reductor, no del desempate de
esta card. Test: "EL LÍMITE QUE ESTA CARD NO CIERRA" en `match.test.ts`.

**¿Una hermana empatada que la taxonomía no ubica?** Se queda la cocida, en
los dos órdenes, tal como dice el comentario: `desempateDeEstado` solo
pregunta la familia de la ficha CRUDA (`taxonomia.deLaFicha.get(cruda.id)`), y
si da `undefined` la condición `FAMILIAS_QUE_SE_COMEN_CRUDAS.includes(familia)`
nunca puede ser `true` — mismo criterio conservador que `contradiceALaFamilia`.
Test: "si la ficha CRUDA no está en la taxonomía..." con dos fichas
inventadas, confirmando primero que ninguna de las dos está en `deLaFicha`.

**¿El desempate corre solo en dirección C o también en A/B?** `leGana` es una
única función y la llaman las tres direcciones (`mejorNucleo`/`mejorOtro` en
A, `mejorB` en B, `mejorC` en C), así que `desempateDeEstado` SÍ está
disponible en las tres. Lo que lo mantiene inerte en A y B no es un guardia
explícito: en esas dos direcciones la cobertura se mide sobre la clave
ENTERA, sin pasar por `sinDescriptores`, y una palabra de estado nunca mide lo
mismo en las dos ramas ("crudo" 5 letras contra "cocido" 6; "raw" 3 contra
"cooked" 6) — la propia palabra desempata la cobertura antes de que
`desempateDeEstado` tenga algo que decidir. Si la consulta nombrara las dos
palabras a la vez para forzar el empate, `estadoPedido` dejaría de ser `null`
y el desempate se apaga solo (condición 1). Barrido sobre el catálogo real
(1.115 fichas, dos índices): **cero empates de cobertura** entre una hermana
cruda y una cocida en A o B, contra 15 (inglés) y 22 (español) pares de
hermanas que si existen en C. La garantía de la card 2.8 (un match que ya
ganaba por confianza estricta no lo toca ninguna regla nueva) queda intacta
porque `desempateDeEstado` solo actúa cuando `nuevo.confianza ===
actual.confianza`, ANTES de mirar dirección — eso ya lo garantizaba el propio
`leGana` (`if (a !== b) return a > b`), en las tres direcciones por igual.

**¿`estadoPedido` mira la consulta, y qué contesta `huevo duro`?**
`estadoDeCoccion("huevo duro")` da `null` — "duro" no está en
`PALABRAS_DE_COCIDO` — y lo mismo `estadoDeCoccion("hard-boiled egg")`. La
consulta NO declara estado. Y sin embargo `huevo duro` resuelve **cocido**
(`fdc-2707153`) hoy: no porque el motor haya entendido "duro", sino porque con
`estadoPedido` en `null` el desempate de esta card sí opina, `huevo` no está
en `FAMILIAS_QUE_SE_COMEN_CRUDAS`, y gana la cocida por FAMILIA. Es la
garantía nueva (DT-64) tapando un agujero de vocabulario viejo (DT-63) que
sigue abierto: "duro" y "hard-boiled" (con guion) siguen sin decir nada.
Curiosidad medida de paso: en `main`, "huevo duro" TAMBIÉN daba cocido, pero
por el viejo accidente del largo de palabra (`huevo cocido`, 12 caracteres, es
más larga que `huevo crudo`, 11) — funcionaba por suerte alfabética, no por
diseño. Test: "`huevo duro` y `hard-boiled egg` resuelven cocido HOY, pero no
porque el vocabulario lo pida (DT-63/DT-64)".

## 3. Los tests (`functions/src/engine/match.test.ts`)

`match.test.ts`: **112 tests antes → 117 después** (5 nuevos, dentro de
`describe("card 6.3 — ...")`; el resto —incluidos los que ya traía el WIP— no
se tocó). Los cinco:

1. **El barrido A/B** — mide sobre las 1.115 fichas reales que el desempate
   nunca dispara fuera de la dirección C, y por qué (arriba, pregunta 4).
2. **Los tres candidatos reales** (`huevo`, `patata`) — prueba que
   `mismasPreparaciones` los separa antes de que este desempate los vea.
3. **El límite construido** (tercero sin estado) — documenta el caso que esta
   card no cierra, con ambos órdenes de carga probando que el índice es
   determinístico (reordena siempre por longitud de clave, después por
   `food_id`) aunque el ganador no sea el "correcto" desde el punto de vista
   del negocio.
4. **`huevo duro` / `hard-boiled egg`** — dejan escrito que `estadoDeCoccion`
   no los reconoce y que el resultado correcto de hoy sale por la familia, no
   por vocabulario (DT-63/DT-64).
5. **Ficha cruda sin taxonomía** — los dos órdenes, gana la cocida, con el
   candado de que las dos fichas del fixture están de verdad fuera de
   `deLaFicha`.

Todos construidos con `indiceDeFixture` renombrando fichas reales (se
conserva el `id`, así la taxonomía las sigue ubicando) o con `fichaFalsa`
cuando el punto era justamente que la ficha NO tuviera taxonomía.

## 4. Las tres mediciones

Motor de la branch vs. `main` (commit `754f9cf`, worktree del scratchpad,
mismo catálogo — no hay diff en `kb/` entre las dos ramas, así que la
diferencia medida es 100 % del motor).

### (a) Golden `vision-v6` (31 fotos, vía `analizarEscaneo`)

31 platos, 55 ítems totales evaluados. **Un solo ítem cambia**, exactamente el
que predijo H4:

| Plato | Ítem | Main | Branch |
|---|---|---|---|
| `20-ensalada-mixta` | `red cabbage, shredded` (lombarda, componente) | `Repollo rojo cocido con sal y grasa`, 58 kcal/100 g | `Repollo rojo crudo`, 34,05 kcal/100 g |

El total del plato pasa de 243,862 a 241,686 kcal (el compuesto no publica
total: sigue bajo la compuerta del 12 %, un asunto de la card 6.2, no de
esta). Los otros 6 componentes de la misma ensalada (lechuga, tomate, maíz,
zanahoria, huevo duro, atún) no se mueven — `hard-boiled egg` ya daba
`Huevo cocido` en `main` por la razón alfabética explicada arriba, así que acá
no hay cambio que atribuirle a esta card.

### (b) Respuestas grabadas `respuestas-v3` (vía `replayDeCorrida`, la misma
función de `golden/bin/informe.js`)

68 ítems (30 platos), 36 `no_comparable_es` (corrida sin `termino_es`, previa
a la DT-25) en las dos ramas. **Cero fichas cambiadas** entre main y la
branch para el mismo término. Esperado: esta corrida es anterior a
`vision-v6` y sus términos grabados no traen los patrones "shredded/chopped
sin estado" que dispararon H4 — el corpus que sí los tiene es (a).

### (c) Los 20 términos de producción del 03/09 (Bloque 0 §1, H4, H8)

| Término | Main | Branch | ¿Cambió? | ¿Es el cambio que quería la card? |
|---|---|---|---|---|
| `lettuce, shredded` | Lechuga cocida, 49 kcal | Lechuga cruda, 20 kcal | Sí | Sí — H1/H4 |
| `canned tuna` | sin ficha | sin ficha | No | DT-63 (curación, no esta card) |
| `green peas, cooked` | Arvejas cocidas, 98 kcal | igual | No | — |
| `hard-boiled egg, chopped` | sin ficha | sin ficha | No | DT-63 (solo resuelve con `food_es`, ver §3 test 4) |
| `tomato, chopped` | sin ficha | sin ficha | No | DT-63 (plural `tomatoes`) |
| `carrot, shredded` | Zanahorias crudas, 41 kcal | igual | No | correcto ya en main (card 6.1, variante) |
| `lechuga picada` | Lechuga cocida, 49 kcal | Lechuga cruda, 20 kcal | Sí | Sí — H1/H4 |
| `tomate picado` | Tomate cocido, 50 kcal | Tomate crudo, 20 kcal | Sí | Sí — H1/H4 |
| `mushrooms, sliced` | Champiñones cocidos, 66 kcal | igual | No | correcto — no hay champiñón crudo llano (deuda de curación) |
| `white rice, fried` | sin ficha | sin ficha | No | DT-66 (la cabeza pierde la preparación; corre en `analyze.ts`, fuera de esta card) |
| `green pepper, diced` | Verduras de hoja cocidas, 58 kcal | igual | No | DT-63/DT-66 |
| `chicken, cooked, shredded` | Pollo con piel, 196 kcal | igual | No | — |
| `lettuce, raw` | Lechuga cruda, 20 kcal | igual | No | ya correcto (consulta declara estado) |
| `lettuce, chopped` | Lechuga cocida, 49 kcal | Lechuga cruda, 20 kcal | Sí | Sí — H8 (la visión calla el estado) |
| `red cabbage, shredded` | Repollo rojo cocido, 58 kcal | Repollo rojo crudo, 34,05 kcal | Sí | Sí — H4, plato 20 del golden |
| `egg, chopped` | Huevo crudo, 143 kcal | igual | No | correcto por la VARIANTE de la card 6.1, no por esta (ver test 6.3 dedicado) |
| `potato, diced` | Papa hervida, 126 kcal | igual | No | ya correcto (papa no es verdura/fruta, pero ya ganaba por densidad+variante en main) |
| `patata troceada` | Papa hervida, 126 kcal | igual | No | correcto — cerrado por esta card SIN cambiar el resultado de main (main ya acertaba por casualidad alfabética; la card lo deja acertando por regla) |
| `huevo duro` | Huevo cocido, 176 kcal | igual | No | correcto — misma nota que arriba (§2) |
| `hard-boiled egg` | sin ficha | sin ficha | No | DT-63 (vocabulario, "hard-boiled" no matchea solo) |

**5 de 20 términos cambian de ficha**, los cinco en la dirección que la card
buscaba (cocido→crudo, kcal para abajo). Los otros 15 no cambian: 6 porque ya
daban el resultado correcto en `main` (por variante, por densidad, o por la
casualidad del largo de palabra descrita en §2) y 9 porque son huecos de
vocabulario o de la cabeza-de-subfamilia (DT-63/DT-66) que esta card no tocó
—están fuera de su territorio (`match.ts`/`constants.ts`, no `kb/curation/`
ni `analyze.ts`).

## 5. Colaterales

**Cerrados por esta card:**
- `huevo duro` / `patata troceada` ya NO dependen de que "cocida" tenga una
  letra más que "cruda" — antes acertaban por casualidad alfabética, ahora
  aciertan por regla (familia).
- La lombarda del plato 20 del golden pasa de cocida a cruda (34 kcal contra
  58), la única ficha que se mueve en las 31 fotos.

**Quedan, y no son de esta card (números de deuda, no TODO):**
- **DT-63** (curación/vocabulario): "duro"/"hard-boiled" no declaran estado;
  `canned tuna`, `tomato, chopped`, `hard-boiled egg` solos no matchean; no
  hay champiñón crudo llano.
- **DT-64** (estructural, motor+curación): el componente ya viaja con su
  subfamilia declarada por la visión (`verdura/cruda`) y el matcher no la usa
  como `estadoPedido` — usar eso en vez de (o adelante de) las palabras de la
  consulta cerraría el caso de H8 ("la visión escribe el estado cuando
  quiere") con la fuente más confiable que hay, en vez de con un desempate
  posterior. Esta card resuelve el síntoma con la familia; DT-64 queda como el
  arreglo de fondo.
- **DT-66** (motor, `analyze.ts`): la cabeza de subfamilia pierde la
  preparación declarada (`white rice, fried` → "Arroz blanco cocido"). No
  toca `match.ts`.
- **Nuevo, sin número asignado — reportado, no una deuda abierta todavía**: el
  límite de tres candidatos empatados donde el tercero no declara ni
  preparación ni estado (§2, test "EL LÍMITE QUE ESTA CARD NO CIERRA"). No se
  midió en el catálogo real (el barrido de §2 no lo encuentra) y arreglarlo
  bien requiere cambiar la FORMA del reductor de empates (resolver grupos, no
  pares), que es una decisión de diseño mayor a esta card. Se deja escrito
  para que quien abra la próxima card sobre el matcher lo encuentre en el test
  y no lo redescubra en producción.

## 6. Verificación

- `functions/src/engine/match.test.ts`: 112 → 117 tests, los 117 en verde.
- `cd functions && npm run lint` (`tsc --noEmit`): limpio.
- `cd functions && npm run build && node --test lib/engine/match.test.js`:
  117/117 OK. El fallo de `compose.test.js` que mencionaba el commit WIP
  (territorio de la card 6.1) ya no está: al momento de cerrar esta card,
  `node --test lib/engine/*.test.js` da 395/395 en verde — la 6.1 se cerró en
  paralelo, en el mismo working tree, y no fue trabajo de esta card.
