# CaliScan — Plan v2 (borrador)

> **Qué es este documento.** El borrador del plan de la **v2 premium**: qué se
> vende en cada escalón de pago, por qué ese reparto y cuánto de todo eso ya
> está construido. No reemplaza a `docs/PLAN.md` — ese sigue siendo el SSOT de
> la v1 (Fases 0 a 4) y este documento arranca donde aquel termina, en su §6.
>
> **Estado:** borrador del 02/09/2026. Recoge las decisiones que tomó Tomás ese
> día (nombre, split de tiers, línea roja médica) y deja explícito lo que
> todavía no está decidido (§9). **Nada de acá está implementado**: la v1
> todavía no está desplegada (queda la card 3.5).
>
> **Mecánica:** igual que siempre — la v2 abre con su propio Bloque 0 que MIDE
> antes de definir cards (ver `CLAUDE.md`). Las mediciones que ya se hicieron
> para escribir este borrador están en §7 y §8, y algunas **corrigen** lo que se
> suponía. Gana lo medido.

---

## 1. La marca: CaliScan

**Decisión tomada el 02/09/2026: la app se llama CaliScan y el dominio
`caliscan.app` está comprado.**

Por qué se cambia: el nombre anterior chocaba con `nutriscan.app`, un sitio que
ya existe y publica contenido nutricional (detectado en la WS03, reconfirmado en
la WS05 y otra vez en la WS07). Convivir con un nombre casi idéntico en el mismo
rubro es regalar tráfico y pelearse con un buscador todos los días.

**Qué implica y qué no:** este documento ya usa CaliScan en todos lados, pero
**el renombrado del código NO es parte de este plan** — es una tarea de una punta
a la otra (textos de `config/copy.json`, manifiesto de la PWA, íconos, dominio de
Hosting, README, `CLAUDE.md`) que necesita su propia card con su propio Q/A. El
proyecto de Firebase (`nutriscann-f809e`) **no se renombra**: el id de un
proyecto de GCP es inmutable y cambiarlo obligaría a rehacer la infraestructura
entera. Es un identificador interno que ningún usuario ve.

---

## 2. La lógica económica del split (la regla que ordena todo)

El reparto de funcionalidades entre los dos escalones de pago **no se decide por
gusto: se decide por costo de servirlas.**

| | Cuesta poco o nada servirla | Cuesta dinero cada vez que se usa |
|---|---|---|
| **Qué es** | Contenido ya producido, o matemática sobre datos que ya guardamos | Una llamada al modelo por cada uso |
| **Ejemplos** | Fichas de alimentos, recetas curadas, tendencias | Plan personalizado, escaneo de foto |
| **Dónde va** | **Premium** (anual, barato) | **Premium Gold** (mensual) |

La regla en una línea: **lo barato de servir baja al escalón barato; lo único
caro sube al escalón caro.** Esto tiene dos consecuencias buenas y una
incómoda que conviene decir:

1. El plan anual se vuelve mucho más apetecible sin que su costo suba **ni un
   céntimo** (el margen del 71 % del §6.7 de `PLAN.md` se sostiene igual: lo que
   se agrega tiene costo marginal cero).
2. Gold queda definido por una sola cosa, clarísima y difícil de copiar: **el
   plan personalizado**. Un tier alto que se justifica con "más cupo" es un tier
   alto flojo.
3. Lo incómodo: **el escalón caro concentra todo el riesgo económico.** Si el
   plan personalizado se usa más de lo previsto, el que sufre es el margen de
   Gold. Por eso el plan personalizado **se compra por período, no por consulta
   infinita** (§4).

---

## 3. Premium (anual) — las tres funcionalidades nuevas

### 3.a. Fichas de alimentos típicos

**Qué es:** una pantalla de consulta donde el usuario busca un alimento y ve su
ficha — calorías y macros por 100 g, porciones típicas en gramos, la letra chica
(los caveats) y **la fuente USDA con su número de registro**. Sin sacar ninguna
foto.

**Por qué acá:** la materia prima ya existe, entera y curada. Servir una ficha es
leer un documento de Firestore. Costo marginal: cero.

**Lo que ya tenemos (medido el 02/09/2026 sobre `kb/build/foods.canonical.json`,
versión 3.8.0+843ecb80):**

| Medición | Resultado |
|---|---|
| Fichas en el catálogo | **1.115** |
| Con nombre en español | **1.115 (100 %)** |
| Con porciones típicas en gramos | **1.115 (100 %)** |
| Con sodio / con fibra | 1.110 / 1.103 |
| Aliases en español (sinónimos regionales) | 947 |
| Fichas con advertencias declaradas (caveats) | 162 |
| Fuente por CAMPO (provenance) | en todas |

**Lo que falta construir:** la interfaz de búsqueda y **una taxonomía navegable
en español**. Acá aparece el primer hueco real: las 1.115 fichas están
clasificadas en **179 categorías de USDA, todas en inglés** y con el grano de la
base de origen ("Seafood mixed dishes", "Vegetables and Vegetable Products",
"Ready-to-eat cereal, higher sugar"). Sirven para el motor; **no sirven para que
una persona navegue**. Hay que curar un mapa de categorías de producto en
español (carnes, pescados, verduras, legumbres, lácteos, platos preparados…) por
encima de las de USDA — trabajo de curación declarativa, del mismo tipo que ya
se hizo con nombres y aliases, y por la misma puerta (`kb/curation/`).

### 3.b. Recetas por categoría

**Qué es:** recetas curadas y agrupadas por momento — antes de entrenar, después
de entrenar, cena ligera, desayuno, etc. — con sus valores nutricionales
calculados por la misma maquinaria de siempre.

**Por qué acá:** se cura una vez y se sirve infinitas veces. Ninguna llamada al
modelo, ningún costo por usuario.

**Lo que ya tenemos:** el mecanismo de **receta compuesta** de la card 1.7 está
construido y **53 fichas del catálogo ya salen de él** (ajoblanco, migas,
merluza en salsa verde, tarta de Santiago…): a partir de ingredientes y un
rendimiento de cocción medido, la matemática de `kb/src/transforms.ts` deriva los
nutrientes sin que nadie tipee un número. También existen los **tags** del
vocabulario de recomendación (`entrenamiento`, `recuperacion`, `liviana`,
`balanceada` y los tres de exceso de la OPS), que son exactamente el eje por el
que estas recetas se agruparían.

**Lo que falta construir — y conviene no subestimarlo:** hoy una "receta" del
catálogo es **una composición para calcular nutrientes**, no una receta de
cocina. No tiene pasos, ni tiempos, ni foto, ni número de comensales. Lo que se
sirve al usuario en esta funcionalidad es **contenido nuevo**: hay que
escribirlo. La ventaja es que se escribe una vez y **los números no se inventan**
— salen del mismo motor que ya valida el catálogo.

### 3.c. Tendencias e insights (semanales y mensuales)

**Qué es:** "esta semana comiste 12 % menos proteína que la anterior", "tus
cenas son sistemáticamente las comidas más grasas del día", el promedio de
calorías por semana y por mes.

**Por qué acá:** es **agregación sobre lo que ya guardamos**. Cada escaneo
persiste en `owners/{id}/scans` con su fecha, sus totales, sus ítems y la versión
del catálogo. Sumar, promediar y comparar es matemática pura: **no hay ninguna
llamada al modelo, y el costo es cero**.

**Lo que ya tenemos:** la estructura de datos, completa y desde la v1. El
documento del escaneo guarda `created_at`, `totals` (calorías y los cuatro
macros, con nulos honestos), `items` con sus gramos y confianzas, y `kb_version`.
Existe además el índice de Firestore por `status` + `created_at`.

**Lo que falta — y es un bloqueo real, no un detalle (ver §8):** para agregar los
escaneos de una persona hace falta **saber quién es esa persona**. Hoy no hay
login (llega en la Fase 4 de la v1) y las reglas de Firestore ya exigen usuario
autenticado para leer los propios escaneos. **Sin login no hay tendencias, y
tampoco hay historial** — que es la otra promesa del plan anual en la vitrina
actual.

---

## 4. Premium Gold — el plan personalizado

**Qué es:** un plan de alimentación de **1 semana, 15 días o 1 mes**, compuesto a
partir de:

- el **objetivo** del usuario — bajar de peso, tonificar, ganar masa muscular;
- el **tipo de entrenamiento** que hace (fuerza pide proteína, resistencia pide
  carbohidratos — ya está previsto en el perfil del §6.2 de `PLAN.md`);
- sus **características físicas** — sexo, edad, altura, peso, nivel de actividad;
- las **comidas del día** que realmente hace, y sus elecciones alimentarias e
  intolerancias.

**Por qué es el único diferenciador del tier alto:** es la **única funcionalidad
de toda la app con costo real por uso** (llamadas al modelo para componer el
plan) y, a la vez, la de mayor valor percibido. Es exactamente lo que un tier
alto tiene que ser.

**Cómo se construye, sin salirse de la regla dura 2 del proyecto:**

1. Los **targets diarios** (calorías y macros) se calculan por fórmula
   determinística (Mifflin-St Jeor). **No interviene el modelo.**
2. Los platos salen del **catálogo propio** — 1.115 fichas con sus gramos y sus
   fuentes. Los números de cada comida del plan son los de la base.
3. El **modelo solo compone y redacta**: elige y ordena entre los platos que le
   damos, con los números ya calculados. Sigue sin poder emitir una caloría.

**Nota de coherencia con lo ya escrito:** la vitrina de la v1 promete hoy un
**"plan de dieta diario según tu rutina"**, y esta decisión lo convierte en un
**plan por período (semana / quincena / mes)**. No son lo mismo, y la diferencia
es económica además de comercial: un plan por período se compone **una vez** y
se consulta muchas, lo que hace el costo mucho más previsible que una sugerencia
diaria. **Hay que decidir si el diario sobrevive junto al de período o si queda
absorbido por él** (§9), y alinear el texto de la vitrina cuando se decida.

---

## 5. La línea roja médica (innegociable)

La referencia de mercado (NutriScan App) ofrece objetivos del tipo **Diabetes,
Embarazo, SOP (síndrome de ovario poliquístico) y Gripe/virus**.

**CaliScan no entra ahí. Nunca.**

Por qué, dicho sin adornos: un plan alimentario para una embarazada o para una
persona con diabetes **es consejo médico**. Nuestros propios Términos y
Condiciones dicen que no somos nutricionistas ni médicos y que la app no
reemplaza una consulta profesional. Ofrecer un objetivo "Diabetes" sería
contradecir por escrito, en la misma pantalla, lo que el usuario acaba de
aceptar. Y un error ahí no es una mala sugerencia: es un daño.

**Las reglas que se derivan:**

1. **Los objetivos son solo de terreno fitness**: bajar de peso, tonificar, ganar
   masa muscular, mantenerse. Lista **positiva y cerrada** — se declara lo que
   hay, no se enumera lo que falta.
2. **Nada de condiciones, patologías, embarazo, medicación ni síntomas** como
   entrada del plan. Ni como campo del perfil, ni como filtro, ni como pregunta.
3. **Disclaimer reforzado en todo lo que huela a plan**: visible en la pantalla
   del plan (no solo en los T&C), y repetido en el documento exportable si el
   plan llega a exportarse.
4. **Las intolerancias siguen como están en la v1**: filtran, con la advertencia
   ya escrita de que la app es informativa y que **las alergias graves quedan
   explícitamente fuera del alcance**.
5. Lo mismo aplica al modelo: el prompt del plan **prohíbe** el vocabulario
   clínico, y la salida se valida contra la lista cerrada de objetivos.

---

## 6. Ideas de la referencia que vale considerar (candidatas, no compromisos)

Tres cosas de la competencia son buenas, inocuas y encajan con lo que tenemos:

| Idea | Por qué gusta | Qué necesitaría |
|---|---|---|
| **Lista de la compra derivada del plan** | Cierra el círculo: el plan deja de ser un PDF y se vuelve algo que se usa el sábado en el súper. Es matemática pura sobre los ingredientes del plan, sin costo | Que el plan exista (Gold) y que las recetas declaren ingredientes con gramos |
| **Calendario de colores por día** | Probablemente **el insight visual más potente** del rubro: un mes entero de un vistazo, cada día pintado según la calidad nutricional de lo que comió. Es lo que hace que alguien abra la app sin tener un plato delante | Tendencias (§3.c) + una **regla de color declarada y defendible** — el color es un juicio, y un juicio necesita su fuente (los umbrales de la OPS ya están en `config/`) |
| **Score visual simple por plato** | Traduce el reporte a una sola señal para quien no quiere leer macros | La misma regla de color, y **mucho cuidado**: un score es una nota, y una nota mal calibrada es lo que hace que una app de este rubro pierda credibilidad de golpe |

**Están anotadas como candidatas.** Ninguna es un compromiso de la v2 hasta que
Tomás las mueva a la lista de arriba.

---

## 7. Cuánto de la v2 es exponer lo que ya existe

Esta es la tabla que dice dónde está el trabajo de verdad:

| Funcionalidad | Ya construido | Falta construir | Veredicto |
|---|---|---|---|
| **Fichas de alimentos** | 1.115 fichas curadas, bilingües, con porciones, caveats y fuente USDA por campo; ya publicadas en Firestore y de lectura pública por las reglas | Buscador + pantalla de ficha + **taxonomía en español** (las 179 categorías son de USDA y están en inglés) | **Mayormente exponer.** Lo caro ya está pagado |
| **Recetas por categoría** | El motor de receta compuesta (53 fichas ya derivadas así) + los tags del vocabulario | El **contenido**: escribir las recetas, agruparlas, ilustrarlas | **Mitad y mitad.** La maquinaria existe; el contenido no |
| **Tendencias / insights** | Los escaneos ya se persisten con fecha, totales e ítems desde la v1; índice de Firestore listo | El **login** (Fase 4), las consultas de agregación y la pantalla | **Construir, pero barato.** Es aritmética; el bloqueo es el login |
| **Historial completo** | Lo mismo | El login y la pantalla | Igual que tendencias |
| **Plan personalizado (Gold)** | El catálogo como despensa, `transforms.ts`, el patrón "el modelo compone, la base cuantifica", las 6 reglas de recomendación dormidas en `config/` | El **perfil** (§6.2 de `PLAN.md`), el cálculo de targets, el endpoint del plan, la pantalla, el control de cupo | **Construir de cero**, sobre cimientos que ya existen |
| **Cobro real (Stripe)** | Nada | Todo: Stripe, el claim `premium` en el token, la verificación en cada endpoint, los cupos | **Construir de cero.** Hoy la vitrina solo junta lista de espera |

---

## 8. Coherencia con la v1 (y lo que el relevamiento corrigió)

**La vitrina de la v1 (card 3.3) es el ancla.** Ya existe, ya está escrita y ya
muestra los planes con un botón de lista de espera que guarda nombre, apellidos
y correo en la colección `waitlist`. Los dos escalones de este documento se
muestran ahí como "próximamente" — otra card lo está ajustando en paralelo. La
regla que rige esa pantalla no cambia: **una vitrina que promete de más es una
mentira con mejor tipografía.** Lo que se pinte ahí tiene que ser exactamente lo
que este plan se compromete a construir.

**El paso 3 del motor despierta acá.** El plan maestro lo dejó explícito: la v1
muestra solo lo medido y el paso 3 (el modelo redactando una recomendación sobre
números ya calculados) quedó **construido y dormido** en `config/`. Están las 6
reglas con umbrales de la OPS citados página por página y su lista cerrada de
tags. **La v2 lo enciende**, y es el mismo mecanismo que compone el plan
personalizado: no se construye dos veces. Con él se destraba también la **DT-6**
(recalibrar azúcares totales vs. libres y el sodio), que estaba diferida a la v2
justamente porque sin recomendaciones no había nada que calibrar.

**Lo que el relevamiento del 02/09 corrigió respecto de lo que se suponía:**

1. **Tendencias e historial están bloqueados por el login, no por el trabajo de
   pantalla.** Las reglas de Firestore exigen `request.auth.uid == ownerId` para
   leer los escaneos de alguien; hoy el dueño llega como un identificador en el
   cuerpo del POST, con un valor provisorio por defecto. **La Fase 4 de la v1
   (login real) es un prerrequisito duro de la v2**, no una mejora paralela.
2. **Las 179 categorías del catálogo son de USDA y están en inglés.** "Exponer
   las fichas" incluye un trabajo de curación que no estaba contado.
3. **Una "receta" del catálogo no es una receta de cocina**, es una composición
   para derivar nutrientes. El contenido de la funcionalidad de recetas hay que
   escribirlo.
4. **Los cupos de los tiers (15 / 40 / 150) todavía no existen en `config/`.**
   Están decididos y escritos en el plan, y la vitrina los muestra, pero
   `config/` solo tiene hoy los textos y las reglas de recomendación. El
   mecanismo de conteo por usuario llega con el login.
5. **El plan de Gold pasa de "diario" a "por período"** (§4): la vitrina de la v1
   dice otra cosa y hay que alinearla.

---

## 9. Abiertos — lo que Tomás todavía no decidió

| # | Abierto | Por qué importa |
|---|---|---|
| A1 | **Los precios definitivos de los dos tiers v2.** El escalón anual gana tres funcionalidades sin costo adicional: ¿sigue en 12 €/año o sube? ¿Gold sigue en 4,99 €/mes cuando lo que ofrece pasa de una sugerencia diaria a un plan por período? | Todo el §6.7 de `PLAN.md` (márgenes del 70-71 %) está calculado sobre los precios viejos y los cupos viejos. Si cambian los precios, se rehace esa cuenta |
| A2 | **La escalera de cupos de fotos (15 / 40 / 150).** ¿Se toca ahora que hay más valor fuera de la foto, o se deja intacta? | La escalera "habla sola" y es el argumento de venta más simple que tenemos. Tocarla sin necesidad la ensucia |
| A3 | **Orden de construcción.** Lo más barato y visible primero (fichas) o lo que define el tier alto (plan). | Fichas y recetas se pueden entregar **sin login**; tendencias, historial y plan **no**. Eso condiciona el orden más que el gusto |
| A4 | **¿El plan diario sobrevive junto al plan por período?** (§4) | Cambia el texto de la vitrina y el modelo de costo de Gold |
| A5 | **¿Tendencias necesita retención de datos adicional?** Hoy se guarda cada escaneo completo, sin política de borrado. Para tendencias mensuales quizá convenga un agregado diario por usuario | Es la diferencia entre leer 150 documentos cada vez que alguien abre la pantalla y leer 30. También toca lo legal: cuánto tiempo guardamos, y qué se le dice al usuario |
| A6 | **Las tres candidatas del §6** (lista de la compra, calendario de colores, score por plato): ¿alguna entra en la v2? | El calendario de colores es probablemente el mayor gancho visual, y también el que más juicio nuestro carga |
| A7 | **Cuándo se ejecuta el renombrado a CaliScan** y si el dominio se conecta antes o después de la card 3.5 (el despliegue de la v1) | Desplegar con un nombre y renombrar después significa hacer el despliegue dos veces |
| A8 | **Qué se hace con la lista de espera ya recogida** cuando los pagos se abran | Es la única señal de demanda que tenemos antes de cobrar |

---

## 10. Cómo sigue

Este documento **no define cards todavía**, a propósito. Cuando la v1 esté viva y
Tomás cierre los abiertos del §9, la v2 abre con su **Bloque 0**: medir el uso
real (escaneos por usuario, qué cae en la cola de curación, cuántas altas juntó
la lista de espera) y **recién con eso** definir las cards.
