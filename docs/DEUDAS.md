# Registro de deudas — NutriScann

Lo que sabemos que falta, decidido conscientemente y con dueño. Una deuda que no
está escrita no es una decisión: es un olvido.

Cada deuda se cierra editando su fila a ✅ con la fecha, nunca borrándola: el
registro también sirve para ver qué se destrabó y cuándo.

| id | estado | título | dueño |
|---|---|---|---|
| DT-1 | ✅ cerrada 31/08 (WS04) | Activar el plan Blaze del proyecto: **activado por Tomás** y verificado (`billingEnabled: true`, cuenta `0151E4-2765DB-FC9340`) | Tomás |
| DT-2 | 🔴 abierta (destrabada por DT-1) | Cargar la API key de Anthropic en Secret Manager | Claude + Tomás (la key la carga Tomás) |
| DT-3 | 🔴 abierta (destrabada por DT-1) | Inicializar Cloud Storage y desplegar sus reglas | Claude |
| DT-4 | ✅ cerrada 31/08 (WS04) | Presupuesto de GCP: **creado** — "NutriScann — presupuesto mensual", €10/mes, alertas al 50 % y 90 %, acotado al proyecto | Tomás + Claude |
| DT-5 | 🟡 diferida | Íconos de la PWA (el manifiesto los declara vacíos) | Claude (Fase 3) |
| DT-6 | 🟡 diferida → **v2** | Recalibrar la regla de azúcares (totales vs libres) y el sodio con datos reales de uso; resolver en la UI el caso "el tag acusa y el texto absuelve". *Reencuadrada 31/08: la v1 no muestra recomendaciones (decisión Tomás), así que esta calibración pertenece al esquema de recomendación de la v2* | Claude (v2) |
| DT-7 | ✅ cerrada 30/08 (WS03) | Desambiguar los pares FNDDS/SR de nombre casi igual: **ejecutada** — censo de 137 pares (`kb/selection/dt7.pairs.json`), 8 fusiones, 27 renames bajo "el nombre nunca miente", con candado de regresión. Lo que quedó ambiguo pasó a DT-8 | Tomás + Claude |
| DT-8 | ✅ cerrada 31/08 (WS04) | **7 pares resueltos por decisión de Tomás** (registro completo en `dt7.pairs.json`): los 2 parmesanos se conservan (diferencia real de sodio; de paso se corrigió la porción errónea de 100 g de fdc-171247 → 5 g) · puré de papa fusionado al casero · pepinillos sin cambio (asunto del matcher, Fase 2) · mantequilla NFS conservada bajo la política DT-13 · frijoles y croquetas duplicados idénticos fusionados con herencia de vocabulario | Tomás + Claude |
| DT-9 | 🟡 diferida | Censo de duplicados **intra-fuente**: eran 36 grupos con `per_100g` idéntico dentro del mismo dataset; **la DT-8 ya fusionó 2 de ellos** (frijoles, croquetas) — quedan ~34. La DT-7 solo cubrió los cruzados | Claude (WS05+) |
| DT-10 | 🟡 diferida | Rendimientos de cocción sin fuente suficiente: curado de **lomo** (el par medido es de jamón, 0,784), verdura asada A LA BRASA (5 pares en 2 familias que se contradicen; **la card 6.4b sí midió la COCCIÓN de la cebolla —`cocido_cebolla` 0,850, n=2— y con eso destrabó los calçots por la vía del horno, pero la brasa sigue sin factor**) y `hervido` (publicado 1,113 con dispersión 0,71–1,47; ninguna receta lo usa — la que lo necesite declara el suyo). Cada uno desbloquea fichas concretas | Claude |
| DT-11 | 🟡 diferida | **Pulpa de açaí congelada** y **lomo embuchado**: sin derivación defendible (derivar la pulpa del polvo sería elegir la dilución que dé el número esperado). Se resuelven con la cola de curación y uso real | Claude (runtime) |
| DT-12 | 🟡 diferida | El CI corre los candados en frío pero **no** el circuito del emulador del seed (necesita el emulador de Firestore + Java en el runner) | Claude |
| DT-13 | ✅ cerrada 31/08 (WS04) | **Política de genéricos decidida por Tomás y ejecutada**: los nombres quedan matcheables; toda ficha genérica (marcadores NFS / "NS as to" de USDA) lleva `generic: true` (339 fichas — el matcher de la Fase 2 les baja la confianza) y las de sodio ≥ 400 mg/100 g un caveat generado por regla declarativa con su valor real (101 fichas). Regla en `kb/curation/genericos.dt13.json`, candado bidireccional en el build. El censo real resultó mayor que el enunciado original (101 caveats, no 4 casos) | Tomás + Claude |
| DT-14 | 🟡 diferida | Los **9 gemelos de confianza 0,5** (milanesa, cocido madrileño, callos, patatas bravas…) son candidatos naturales a ficha por **receta compuesta** (mecanismo 1.7): pasar de aproximación con reserva a receta real | Claude (WS04+) |
| DT-15 | ✅ cerrada 31/08 (WS04, card 2.1) | El matcher resuelve las colisiones declaradas, verificado adversarialmente: familia "Pastel" (especificidad por tokens), cruce "Catsup" (índices EN/ES separados, el mejor candidato gana y el inglés solo desempata), pepinillos (guarda con excepción "dulces"), "chorizo"/"Bife de chorizo" (guarda de runtime + barrido de 1.022 fichas con determinante: 0 desvíos). Lo que queda de recall difuso (plurales, tokens desordenados) vive en **DT-17** | Claude |
| DT-16 | 🟡 diferida | Alias "Callos" duplicado en `fdc-2706162` (aparece a confianza 1,0 y 0,5 en la misma ficha). Preexistente en `main` desde la Fase 1, detectado por el Q/A de la WS04 | Claude (WS05+) |
| DT-17 | 🟢 núcleo ejecutado 01/09 (WS05, card 2.6) | **El recall EN/ES se ejecutó**: visión bilingüe (`food_es` en el schema), variantes de índice para los marcadores USDA, cobertura por núcleo (el piso 0,30 no se movió), plurales plegados y la regla crudo/cocido preguntada a los datos (entre cruda y cocida gana la cocida solo si la cruda tiene más calorías). Sobre los 17 términos grabados: 5 → 14 matches, cero fichas mal elegidas; barrido de 90 términos: +24 matches, 0 perdidos. Lo que queda vive en DT-26 (curación) y en el texto original: recall y robustez del matching difuso (hallazgos menores del Q/A de la card 2.1, todos con falla cerrada — van a curación, no inventan): **plurales/singulares no matchean** ("pepinillo", "chorizos" → sin match; el hueco de recall más caro en español) · tokens desordenados pueden confundir ("carne pastel" → Tarta a confianza 0,3) · sin techo de gramos (1e12 g se reporta sin reserva — poner un límite de cordura en el endpoint o el engine) · `interpretarVision` (2.2) colapsa "no estimó" y "gramos imposibles" en 0 antes del motor, así que la distinción fina de F5 del engine no puede dispararse desde el pipeline real (las dos salidas son honestas; es granularidad perdida, no un error) · **un término multi-palabra que CONTIENE un alias exacto no dispara la vía del alias** (medido en el primer E2E real, 01/09: "spaghetti carbonara" no encontró el alias "Carbonara" a 0,5 de la ficha correcta; el difuso llegó a la MISMA ficha pero mostró 12 % en vez de ~42 % — el resultado es correcto, la confianza que ve el usuario está injustamente baja) | Claude (v1.1, con datos de la cola de curación) |
| DT-18 | ✅ cerrada 01/09 (WS05, card 2.5) | **`copy` gobernado por el seeder**: `config/copy.json` nace con las 18 claves (5 de la Fase 0 + 13 nuevas), byte a byte con el arranque en frío del front; máscara de 4 → 5 campos, el campo se publica ENTERO (una clave agregada a mano en la consola desaparece en la corrida siguiente — regla 3). Verificado E2E: el pie pasó de "arranque en frío" a "Firestore". ⚠️ Al primer seed real, `scanning_steps` cambia 2 de 3 pasos respecto de lo publicado a mano en la Fase 0 (gana el texto del repo) | Claude |
| DT-19 | 🟡 diferida | Los platos **compuestos** salen con `name_es: null` — el reporte muestra el término de la visión en inglés ("Chicken and pepper skewer"). Decidir el mecanismo del nombre en español (¿la visión lo devuelve bilingüe? ¿se compone de los nombres ES de los ingredientes?) | Claude (Fase 3) |
| DT-20 | 🔴 **URGENTE desde la card 6.1** | La copia de tipos del front (`apps/web/src/lib/types.ts`) no tiene candado contra `functions/src/engine/types.ts` — y desde la card 6.1 está **desalineada de verdad, en silencio**: el motor publica `TotalesNutrientes` con los 8 nutrientes `number \| null` + `total_no_publicable?: true`, y el front sigue declarando `kcal: number`. En runtime no rompe (el render ya se esconde detrás de `macro_pct !== null`), pero el contrato miente. Va en la card 3.1 de la Fase 3 junto con el candado | Claude (Fase 3, card 3.1) |
| DT-21 | 🟡 diferida | **Los textos son rioplatenses y el mercado inicial es España**: 6 de las 18 claves de `config/copy.json` voseán ("Sacá", "¿Probás", "Revisá", "Acá"). Es una pasada de copy — decisión de producto de Tomás — y gracias a DT-18 se hace editando `config/copy.json` + seed, sin desplegar | Tomás + Claude |
| DT-22 | 🟡 diferida | **Regla dura 1 rota fuera de `copy`**: ~15 textos de usuario hardcodeados en componentes del front (los 5 pares de `BadgeDeMatch`, etiquetas de nutrientes de `AvisoParcial`, "Confianza" y la explicación de ficha genérica en `ItemDelPlato`, "Sin números para este plato" en `PantallaReporte`). Cambiarlos exige deploy. Detectado por el censo de DT-18; requiere tocar `apps/web` | Claude (Fase 3) |
| DT-23 | 🟡 diferida | `report_macros_title` ("De dónde vienen esas calorías") solo se renderiza en el caso borde "sin totales": o le falta lugar en el reporte normal, o el nombre promete más de lo que hace | Claude (Fase 3) |
| DT-24 | 🟡 diferida | **La cola de curación no distingue "no lo tengo" de "no lo supe encontrar"**: en el test de 10 platos, 22 de los 30 términos encolados tenían ficha directa en el catálogo. Con el recall de la card 2.6 el ruido debería bajar; medir de nuevo y, si persiste, anotar en el candidato si el catálogo tenía algo parecido | Claude (v1.1) |
| DT-25 | 🟡 diferida — **subió de prioridad (card 6.1)** | **`termino_es` no viaja al expediente**: el motor usa el nombre en español de la visión para matchear (card 2.6) pero `EngineItem`/`persistencia.ts` solo guardan `termino_en` — el scan no registra qué dijo la visión en español. Además alimenta a DT-19 (nombre ES de los compuestos) y **desde la card 6.1 tiene un costo nuevo medido: el golden set no puede re-jugar la mitad del matching** (lo que entró por el español sale `no_comparable_es`; el fix de la barra `/` solo pudo probarse con test, no con replay) | Claude (WS07) |
| DT-28 | 🟢 núcleo ejecutado 01/09 (WS06, card 6.1) — falta la re-corrida | **Los 5 mínimos ejecutados y medidos**: (1) cola descriptiva EN **y ES** con variantes solo aditivas (candado explícito: `sin grasa`/`without salt` NO son cola — la primera versión convertía mayonesa 680 en light 64 y se cazó antes de entregar; barrido de 24.677 consultas: 0 perdidos) + desempate "término escrito le gana a variante deducida" · (2) la barra `/` se lee como O (jamón `serrano/ibérico`: 0,297 difuso → alias 0,8; ⚠️ evidencia de test, no de replay — el expediente no guarda `food_es`, ver DT-25) · (3) compuerta cerrada → los 8 nutrientes en `null` + `total_no_publicable: true` (tipos públicos separados de la suma interna; el front no rompe en runtime pero DT-20 quedó urgente) · (4) criterio 2 recalibrado a regla de tres sobre gramos reportados: v2 pasa de 76,9 % ❌ a **88,5 % ✅** (no el 96,2 % estimado a mano: ajustar el rango también SACA al plato 16, que pasaba por dos errores compensados) · (5) estabilidad de la visión medida v1→v2: **17 de 30 platos se mueven**, salto absoluto promedio del total 8,5 %, peores −46 %/−32 %/−25 % — la visión decide más juicios que el motor. **El golden set vive en `golden/` del repo** (7 MB, fotos ya a 1.024px/JPEG80, bodies gitignorados regenerables, replay offline con detección de idioma del motivo — "perdidos 12-15" era artefacto de medición). Solo 2 de los 5 silencios eran de cola (medido): `sweet corn`/`cabbage` son curación, `grilled potato slice` calla correctamente. **Falta: la re-corrida real buscando 5/5 (card 6.5)** | Claude (WS06) |
| DT-27 | ✅ cerrada 01/09 (WS06, card 6.2) | **Lote de fichas nuevas ejecutado: 14 fichas, catálogo 3.2.0+e19bb31f (1.036 alimentos), aditividad verificada por diff (0 retiradas, 0 preexistentes cambiadas)**: cerveza ×3 (regular 43 · light 29 · alta graduación 58, con el vocabulario de barra completo: corto/caña/tercio/doble/jarra/litrona) · vino tinto/blanco (ganó USDA: copa 150 ml = 127/122 kcal, con densidad real 0,994 — la conversión "104 kcal/45 ml" del insumo trataba ml como g) · destilado 80-proof (copa 45 ml = 99 kcal, densidad 0,947) · limón (29) · **arepa fdc-168070 "Restaurant, Latino, arepa" (219): la premisa "sin ficha USDA posible" era FALSA** — lo verificado era que el motor no la encontraba; la receta compuesta se descartó por 3 grados de libertad movibles (el defecto del açaí) · tortilla de maíz (218, cierra la regresión de DT-26) · pechuga de pollo ×3 (genérica/horno/plancha) · pita · alubias en salsa de tomate. **NO fichadas con motivo medido**: cerveza 0,0 (USDA solo tiene "Malt beverage", 4-7× off) y cerveza negra (no existe en los datasets; el rango del insumo no describe a la negra real). Alias "Vino" a secas no emitido (desempate arbitrario → cola de curación). Caveat de alcohol → DT-31. Guardas 5→7, dorados 6→9, candado nuevo "catálogo commiteado = salida del pipeline" | Tomás (producto) + Claude |
| DT-29 | 🟡 diferida → **v2** | **Hierbas y especias fuera de la v1** (decisión Tomás 01/09, WS06): no son guarniciones — son aditivos/complementos de los platos — pero sin impacto calórico relevante no ameritan ficha en v1 (albahaca, azafrán, laurel, orégano, comino… no existen en el catálogo y caen a `no_catalogado`). En v2 considerar su incorporación pensando en dietas específicas (ej. pimienta + cúrcuma = efecto antiinflamatorio) — conecta con el esquema de recomendación v2 | Tomás (producto, v2) |
| DT-30 | 🔴 abierta | **`build_aliases.py --check` falla en `main` DESDE ANTES de la WS06** (verificado con stash sobre HEAD): el `$extra` de `kb/curation/tools/variants.es.json` re-inyecta `Filete` (fdc-2705824) y `Tira de asado` (fdc-169510) — los alias que la card 2.7 extirpó. Correr el generador hoy rompería el build (guarda `filete`). Limpiar el `$extra` y agregar candado para que el generador no pueda resucitar un alias retirado | Claude (WS07) |
| DT-31 | 🟡 diferida | **Caveat "calorías del alcohol" para las 6 fichas de bebidas**: el candado 1 prohíbe caveats manuales en fichas USDA salvo los generados por regla declarativa (patrón DT-13). Ponerlo exige una regla nueva en `locks.ts`+`canonical.ts`+`curation.ts` con re-derivación bidireccional — cambio de diseño, no una ficha. Mitigado: el candado de Atwater ya suma 7 kcal/g de alcohol y tiene test de mordida | Claude (v1.1) |
| DT-32 | 🔴 abierta | **Las guardas de vocabulario son DOS listas que divergen**: `kb/curation/guardas.vocabulario.json` (17 desde la card 6.3, **20 desde la 6.4**) blinda el CATÁLOGO —rompe el build si el término aparece como nombre o alias de la ficha prohibida— y `GUARDAS_DE_VOCABULARIO` en `functions/src/engine/catalog.ts` (2, y su comentario todavía dice "son dos") blinda el MATCHER. Las quince que solo existen del lado kb **no impiden que el difuso llegue a la ficha prohibida**: lo único que hoy saca un término del difuso es darle su alias correcto. Medido en la card 6.3: los cuatro platos sin ficha (`Tortilla de camarones`, `Pastel de cabracho`, `Cocochas en salsa`, `Gazpachos manchegos`) seguían cayendo donde caían aunque su guarda ya estuviera escrita —la card 6.4 los sacó de ahí dándoles ficha propia, que es la otra forma de arreglarlo y la única que hoy funciona—. **Y la 6.4 sumó tres guardas que NACEN sin morder** (`pasta de tomate`, `pasta filo`, `huevas de salmón`): tres términos que daban silencio y que las fichas nuevas capturaron mal. Mientras esta deuda siga abierta, el único modo de sacar un término del difuso es darle su ficha o su alias. Lo correcto es que el build EMITA las guardas al catálogo (`foods.canonical.json` hoy tiene tres claves: `kb_version`, `generated_from`, `foods`) y que `construirIndice` las lea de ahí, con la constante del motor como arranque en frío — el patrón de la regla 1 del proyecto | Claude (WS07) |
| DT-33 | ✅ cerrada 01/09 (WS06, card 6.4) | **Ejecutada: 76 fichas nuevas, catálogo 3.4.0 (1.112 alimentos), aditividad verificada por diff (0 retiradas, 0 preexistentes cambiadas byte a byte)**. Los SIETE huecos centrales están tapados y seis de ellos resultaron estar medidos por USDA desde siempre —lo que faltaba era la promoción, no el dato—: **salmón ×4** (fdc-2706285 `Salmón` 274 · a la plancha 259 · ahumado 117 · crudo 188, este último caso dorado nuevo) · **mejillones** (109) · **pez espada** (172, de SR: el de FNDDS lleva 14,9 % de rebozado) · **pasta cocida** (157, caso dorado nuevo, destraba `spaghetti, cooked` por el lado español) · **harina de trigo** (364) · **maíz dulce cocido sin grasa** (86) · **repollo verde cocido sin grasa** (32). Más 26 fichas de despensa y casquería mediterránea (alcachofa, alcaparras, habas, cardo, calabacín, judías verdes sin grasa, conejo, riñones, mollejas, hígado, codorniz, faisán, paletilla de cordero, panceta, anguila, calamar, caracol, cangrejo, bogavante, langosta, tahini, ensalada griega, crema de berenjena…). Y **43 recetas compuestas** que cierran 43 de los 48 platos `ausente_ficha`. **El censo pasó de 38 a 85 platos `ok`, de 48 a 5 `ausente_ficha` y de 5 a 0 `ficha_equivocada`**; los ingredientes, de 37 a 45 `ok` y de 59 a 44 `ausente_ficha`. Regresión: barrido de 3.222 términos (todo el vocabulario del catálogo viejo + los 141 platos + los 196 ingredientes + los 93 términos del golden set), **0 perdidos, 0 confianzas bajadas, 62 matches nuevos y 7 cambios de ficha, los 7 correcciones**. Los 5 bloqueos que quedan y las deudas nuevas están en **DT-35** | Claude |
| ~~DT-33~~ | *(texto original, conservado)* | **Huecos de ficha que destapó el censo de cobertura mediterránea** (`kb/cobertura/censo.json`, card 6.3) — es el insumo de la card 6.4, y estos son los que NO son de curación sino de catálogo: **no hay NINGUNA ficha de salmón** en las 1.036 (medido: cero coincidencias con `salmon`/`salmón`; el único acierto es `Lomi salmon`, que es un plato hawaiano), **ni de mejillón, ni de pez espada, ni de pasta cocida simple** (`spaghetti, cooked` ya daba silencio en el golden set; lo único que hay es `Pasta seca enriquecida`, cruda, y `Pasta con salsa`), **ni de harina de trigo** (hay de papa, arroz, soja, garbanzo, mijo, arrurruz, malta y trigo sarraceno). Se le suman los dos pendientes que la card 6.1 había mandado a curación y resultaron ser de ficha (ver DT-26): **maíz dulce** (ninguna ficha en el catálogo) y **repollo cocido sin grasa añadida** (solo está el de grasa añadida, 55 kcal, contra las ~23 del hervido). 48 de los 141 platos quedaron `ausente_ficha`, con los cinco `ficha_equivocada` que necesitan ficha propia además de su guarda ya puesta | Claude (card 6.4) |
| DT-34 | 🟡 diferida | **Huecos de vocabulario que el censo midió y la card 6.3 decidió NO curar**, con el motivo escrito en `censar.js`: `huevos`/`patatas`/`espaguetis`/`harina` a secas caen mal porque no dicen la PREPARACIÓN, y elegirla por decreto sería inventar (en el pipeline real la visión siempre la escribe — es el hueco de plurales de la DT-26) · `pimentón` cae en `Pimiento rojo crudo` por el alias americano `Pimentón rojo crudo`, y desambiguar a favor de España rompería el vocabulario de América (además las especias están diferidas a v2 por DT-29) · `puré instantáneo` da silencio teniendo `Puré de papa instantáneo` en el catálogo · `filete` volvió a encontrar carne vacuna por otra puerta (`Filete de ojo`, fdc-2705828) después de que la card 2.7 lo extirpara de fdc-2705824 · `Buñuelos de viento` y `Soldaditos de Pavía` son candidatos limpios a la regla de herencia de nombre largo que estrenó la 6.3 | Claude (curación) |
| DT-35 | 🔴 abierta | **Lo que la card 6.4 dejó fuera, con el motivo por caso.** (a) **CINCO platos bloqueados de los 141** — ⚠️ **AHORA CUATRO: la card 6.4b (WS06) destrabó los `Calçots` y CORRIGIÓ el motivo del torrezno, que era falso.** Los `Calçots` tienen ficha (`receta-calcots`, 37,6 kcal/100 g) por el transform nuevo `cocido_cebolla` (0,850), que es el rendimiento que la propia FNDDS le asigna a la cebolla, recuperado de su `input_food` con n=2 pares concordantes; la vía declarada es el HORNO a 200 °C y la ficha se publica como SUELO, porque la cocción genérica de FNDDS pierde menos agua que un asado. El **`Torrezno de Soria` SIGUE BLOQUEADO, pero por el MODELO y no por el dato**: el par crudo/frito de panceta SÍ existe (`Pork, cured, bacon, unprepared` fdc-168277 ↔ `pre-sliced, cooked, pan-fried` fdc-168322, rendimiento 0,403, validado porque es la única cocción cuyo balance de masa cierra — sodio retenido 90 %, ceniza 88 %), y lo que falla es que el modelo de recetas supone que solo se va AGUA cuando de un torrezno se va sobre todo GRASA (retención medida 38 %): aplicarlo daría 131,5 g de grasa y 1.285 kcal/100 g. Ver DT-36. Siguen bloqueados `Perdices estofadas`, `Besugo a la espalda` y `Ensalada Halloumi` por ESPECIE/INGREDIENTE — `partridge`, `porgy`/`sea bream`/`bream` y `halloumi` dan CERO coincidencias en los tres datasets. (b) **`spaghetti, cooked`, `sweet corn, cooked` y `cabbage, cooked` SIGUEN dando silencio aunque la ficha ya exista**, y ya no es un hueco de catálogo sino el límite de la DT-26: el `names.en` de una ficha de USDA lo escribe el CSV (`Pasta, cooked`, `Corn, fresh, cooked, no added fat`, `Cabbage, green, cooked, no added fat`) y la curación no lo puede tocar — por el lado español los tres resuelven a 1,0 (`espaguetis cocidos`, `maíz dulce cocido`, `repollo cocido sin grasa`). Es del matcher o de una extensión del contrato de curación al inglés. (c) **Dos falsos positivos NUEVOS que trajo `Pasta cocida`**: `pasta de tomate` (0,25) y `pasta filo` (0,30) antes daban silencio y ahora caen en la pasta por la palabra compartida; sus guardas están escritas y **no muerden hasta la DT-32**. (d) **`gallina`** cae en el PLATO `Gallina en pepitoria` y USDA no mide la gallina como especie. (e) **`huevas de salmón`** cae en `Salmón`: USDA sí las mide (`Fish, roe, mixed species`) y se decidió no promoverlas — un solo uso en las dos fuentes. (f) Vocabulario listo para ejecutar que esta card NO tocó por su regla de aditividad estricta (habría cambiado fichas preexistentes): alias `Besugo` sobre `Lubina`, `Chopitos` sobre `Calamares rebozados`, y la herencia de nombre largo para `Paletilla de cordero lechal al horno o lechazo`. (g) **BEDCA quedó SIN abrir, y con el motivo medido**: la card 6.4 tenía autorización para usar la Base Española de Datos de Composición de Alimentos (bedca.net, la que el `docs/PLAN.md` §1 D5 ya nombraba como complemento) y no pudo: su consulta pública es una aplicación JavaScript sin HTML consultable —todos sus enlaces son `javascript:void(0)`— y su webservice espera un POST con cuerpo XML, que las herramientas de la sesión no pueden emitir. Tres de los cinco bloqueos (**besugo**, **perdiz** y **halloumi**) son alimentos que BEDCA sí publica y que USDA no mide: son el candidato natural de la próxima pasada, con provenance `bedca` declarado campo a campo y sin mezclarse con USDA dentro del mismo campo, igual que hace `manual.foods.json` con el salmorejo. Los otros dos (calçots, torrezno) NO se destraban con una fuente nueva: les falta un rendimiento de cocción, no un número — **el calçot ya se destrabó (ver (a)) y el torrezno resultó ser un límite del modelo, DT-36** | Claude (WS07) |
| DT-36 | 🔴 abierta | **El modelo de recetas no sabe restar la grasa que SALE de la pieza, y eso es lo único que bloquea al `Torrezno de Soria`** (medido en la card 6.4b, WS06). `kb/src/transforms.ts` deriva con `nutriente = Σ nutriente_ingrediente / peso_final`: supone que lo ÚNICO que se va al cocinar es AGUA, y por eso un `factor_peso` concentra TODOS los nutrientes por igual. Es cierto para un horneado de carne y es FALSO para una fritura de panceta: con el par medido de USDA (fdc-168277 → fdc-168322, rendimiento 0,403 con la proteína como trazador) la grasa retenida es apenas el 38 % —casi dos tercios se van al fondo de la sartén— mientras que el sodio y la ceniza retienen el 90 % y el 88 %, que es lo que confirma que el rendimiento está bien medido. Aplicar 0,403 a `Panceta cruda` (fdc-167812) daría **131,5 g de grasa y 1.285 kcal por 100 g**: más de 100 g de materia dentro de 100 g de alimento. Los dos candados lo frenan (rendimiento 0,403 < `RECIPE_YIELD_MIN` 0,50 · densidad 1.285 > `RECIPE_KCAL_MAX` 900) y hacen bien. **Se probó también la salida barata y se descartó por circular**: extender el modelo con la retención de grasa del propio bacon (38 %) da 542 kcal/100 g y 26 % de agua, que es la composición del bacon crocante con nombre español — y queda POR ENCIMA del bacon frito de USDA (468 kcal) cuando el torrezno, que conserva la carne jugosa, tiene que quedar por debajo. **Qué hace falta**: una transformación con retención POR NUTRIENTE (USDA publica `retention_factor.csv` en SR Legacy y FNDDS referencia códigos de retención en su `input_food`) más un dato de retención de grasa propio del CORTE GRUESO, que no está en los tres datasets. Mientras tanto el rendimiento medido queda publicado en `kb/curation/cooking.transforms.json` → `$transformaciones_que_NO_estan_y_por_que.fritura_de_panceta`, y el candado `card64b.test.ts` verifica que NO esté en la tabla de transformaciones usables | Claude (WS07) |
| DT-26 | 🟡 diferida | **Huecos de curación en español que el motor nuevo destapó**: falta el alias "Lentejas" (el nombre es "Lentejas cocidas con sal y grasa" → 14 % en vez de 85 %) · "croquetas" gana el alias `Croqueta` de Buñuelo (0,6) sobre "Croquetas de papa" · no hay ficha de limón entero (`lemon` cae en Tarta de limón) · `tortilla, corn` resuelve a Tortilla de trigo (única regresión de la card 2.6; USDA la llama `Tortilla, NFS`) · `bread roll` da Pan (267 kcal) en vez de Panecillo (fdc-2707595, 279) — **REMEDIADO EL DIAGNÓSTICO, no el hueco (card 6.3, 01/09/2026): NO se arregla con un alias**, porque `aliases` tiene una sola clave, `es`, y del lado inglés el único vocabulario es `names.en`, que en las fichas de USDA lo escribe el CSV y la curación no pisa. Es del matcher o de una extensión del contrato. Verificado que sigue vivo: `bread roll` -> Pan a 0,26, mientras `panecillo` -> Panecillo a 0,85 · los nombres USDA de 3+ segmentos (`Spinach, fresh, cooked, fat added…`) siguen fuera del alcance de las variantes. Todo se arregla en `kb/curation/`, nunca en el motor. **Los otros dos pendientes que la card 6.1 dejó abiertos, medidos y resueltos por la card 6.3: `sweet corn, cooked` y `cabbage, cooked` NO son de curación sino de FICHA** — el catálogo no tiene ninguna ficha de maíz dulce (cero coincidencias en 1.036), y de repollo cocido solo tiene `Cabbage, green, cooked, **fat added**` (55 kcal) y la roja; el repollo hervido del cocido madrileño ronda las 23 kcal, así que colgarlo del de grasa añadida publicaría un +139 % con una reserva escrita al lado. Se decidió NO emitir el alias y mandarlos a DT-33: el silencio honesto es mejor que un número al doble | Tomás + Claude (curación) |

---

## DT-1 · Activar el plan Blaze del proyecto ✅ (31/08/2026)

**Cerrada.** Tomás activó Blaze el 31/08/2026; verificado con `gcloud billing projects
describe` (`billingEnabled: true`). El orden de destrabe previsto se cumplió: DT-4
(presupuesto) se creó el mismo día. Quedan DT-2 y DT-3, y ampliar el objetivo del
pipeline de deploy. Lo que sigue es el registro original de la deuda.

**Qué falta.** El proyecto `nutriscann-f809e` está en plan Spark (`billingEnabled: false`).
Cloud Functions, Secret Manager y Cloud Storage requieren **Blaze** (pago por uso).

**Qué bloquea.** Todo el backend. Sin esto no hay motor de análisis: la Fase 2 no puede
desplegarse y la pantalla de fundaciones seguirá diciendo "Backend no disponible".
La **Fase 1 (base de conocimiento) NO está bloqueada** — se puede construir entera,
porque el catálogo se compila en el repo y Firestore ya existe.

**Por qué no lo hizo Claude.** Vincular una cuenta de facturación es una decisión con
consecuencias económicas: la toma Tomás, no un agente.

**Cómo se destraba.** Consola de Firebase → Configuración del proyecto → Uso y facturación
→ Modificar plan → Blaze, y vincular la cuenta `0151E4-2765DB-FC9340` (ya abierta).

**Costo esperado.** Prácticamente cero con el volumen inicial: el nivel gratuito de Blaze
cubre de sobra el uso de desarrollo. Lo que sí cuesta es la API de Anthropic, ~$0,01 por
análisis, y eso se factura aparte.

**Al destrabarse, en orden:** DT-4 (presupuesto, primero) → DT-2 → DT-3 → desplegar
`health` → ampliar el objetivo del pipeline a `hosting,firestore,storage,functions`
(la línea ya está comentada en `.github/workflows/deploy.yml`).

---

## DT-2 · API key de Anthropic en Secret Manager 🔴

El código ya la declara (`ANTHROPIC_API_KEY` en `functions/src/runtime.ts`) y ninguna
función la usa todavía. Se carga con `firebase functions:secrets:set ANTHROPIC_API_KEY`.
Depende de DT-1.

---

## DT-3 · Inicializar Cloud Storage 🔴

`storage.rules` está escrito y verificado en revisión, pero nunca se desplegó: el bucket
no existe. Se inicializa una vez desde la consola de Firebase. Depende de DT-1.
Hasta entonces, el pipeline no incluye `storage` entre sus objetivos.

---

## DT-4 · Presupuesto de GCP con alertas ✅ (31/08/2026)

**Cerrada el mismo día que DT-1, como estaba previsto** ("un proyecto que puede
facturar sin techo declarado es un riesgo evitable"). Creado vía `gcloud billing
budgets create`: **"NutriScann — presupuesto mensual", €10/mes, alertas al 50 % y
al 90 %**, filtrado solo al proyecto `nutriscann-f809e` (los otros presupuestos de
la cuenta quedaron intactos). Las alertas llegan por correo a los administradores
de la cuenta de facturación.

---

## DT-5 · Íconos de la PWA 🟡

`manifest.webmanifest` declara `"icons": []`. La app se instala igual, pero sin ícono
propio. Se resuelve en la Fase 3, cuando exista identidad visual definitiva.

---

## DT-27 · Lote de fichas nuevas v1.1 — insumos de Tomás (01/09/2026) 🟡

**Regla de la card:** los números salen de USDA (o fuente citable declarada, como el
salmorejo); los insumos de abajo sirven de **contraste y selección**, no de fuente.
De Tomás falta lo que USDA no sabe: porciones de España y vocabulario de barra.

**🍺 Cerveza** — datos aportados (por 355 ml): regular 153 kcal · 12-13 g carbohidratos ·
1,6 g proteína · 0 grasa. Rangos por tipo: 0,0 % 18-37 · light 100-110 · regular
150-180 · artesanal/IPA 180-250 · negra 200-300. **Contraste con USDA: 153/355 ml =
43,1 kcal/100 ml — coincide exacto con "Alcoholic beverage, beer, regular" de SR.**
Selección propuesta: 3-4 fichas (regular · light/0,0 · IPA/artesanal · negra), caveat
de "calorías del alcohol" (7 kcal/g, el candado de Atwater ya lo contempla).
Pendiente de Tomás: porciones reales de España (¿caña 200 ml? ¿tercio 330? ¿doble?
¿pinta 500?) para los `portion_hints`.

**🍋 Limón** — datos aportados (por 100 g comestible): 29 kcal · 9,32 g carbohidratos
(2,5 azúcares) · 2,8 fibra · 1,1 proteína · 0,3 grasa · vit. C 53 mg. **Contraste:
coincide con "Lemons, raw, without peel" de USDA (29 kcal/100 g) — la fuente Wikipedia
casi seguro bebe de USDA.** Ficha directa de SR; decidir si además hace falta "zumo de
limón" (la rodaja del agua o la ensalada pesa ~5-10 g: el impacto calórico es ~0).

**⚠️ Nota de marca:** una de las fuentes citadas por Tomás es `nutriscan.app` — la
marca "NutriScan App" ya detectada en la WS03. Existe y publica contenido nutricional
en español: tenerlo presente para la decisión de naming antes del lanzamiento.

**🌽 Tortilla de maíz** — datos aportados (por pieza de 30 g): 60-65 kcal ·
12-13,5 g carbohidratos · 1,4-1,7 proteína · 0,5-1 grasa · 1-1,5 fibra · sodio <5 mg.
**Contraste: coincide con USDA ("Tortillas, corn" ~218 kcal/100 g × 30 g ≈ 65).**
Ficha directa de USDA + porción "1 pieza (30 g)"; de paso resuelve la única regresión
de la card 2.6 (`tortilla, corn` → Tortilla de trigo, DT-26).

**🫓 Arepa** — datos aportados (asada simple, por 100 g): 168-215 kcal · 35-40 g
carbohidratos · 3,5-5 proteína · 0,6-1 grasa · 2,5-3,5 fibra. **Caso especial: es la
única del lote SIN ficha USDA posible** (verificado en los dos golden tests: el
"no_catalogado" de la arepa era correcto). Dos caminos para la card: (a) **receta
compuesta** (mecanismo 1.7: harina de maíz precocida USDA + agua + sal + rendimiento
de plancha 0,757 medido) — preferible porque hereda provenance USDA; (b) curación
manual con fuente web declarada (precedente salmorejo). El rango aportado por Tomás
queda como contraste para validar la derivación: si la receta no cae en 168-215
kcal/100 g, algo está mal.

**🍺 Cerveza — porciones y vocabulario de España (aportado por Tomás, 01/09):**
*De grifo:* corto/zurito/penalti 100-140 ml (Castilla y León-Galicia-Rioja / País
Vasco / Aragón) · **caña ~200 ml (la estándar; en el sur/levante hasta 250-300)** ·
doble/cañón ~400 ml · tubo ~330 ml · jarra/tanque/maceta 500 ml. *De botella:*
quinto/botellín 200 ml · **tercio/mediana/media 330 ml** · litrona 1.000 ml
(cachi/katxi/mini en vaso de fiesta). → `portion_hints` de las fichas de cerveza
(etiqueta + gramos, densidad ≈ 1) y aliases regionales con confianza; "caña" y
"tercio" como porciones por defecto de grifo y botella. Con esto la card tiene
TODO lo que USDA no sabía; queda solo ejecutarla (WS06).

**🥃🍷 Tragos (aportado por Tomás, 01/09)** — destilados 45 ml: 65-100 kcal (0
carbohidratos) · cerveza 330 ml: 150-160 · vino copa 150 ml: 65-85 · cócteles:
160 (cuba libre) a 400+ (con cremas). Fuente destacable: Ministerio de Sanidad
(estilosdevidasaludable.sanidad.gob.es), la misma familia que el PDF SENC de v2.
**Contraste USDA: destilados ✓ (80-proof ≈ 104 kcal/45 ml) · cerveza ✓ (~145/330) ·
⚠️ vino NO cruza: USDA da ~83 kcal/100 ml → una copa de 150 ml son ~125 kcal, no
65-85 (ese rango parece ser por 100 ml). Al armar la ficha, ganan los números USDA
y la porción se declara explícita.** Alcance: fichas simples (destilado genérico,
vino tinto/blanco) en el lote v1.1; los cócteles son candidatos a receta compuesta
(cuba libre = ron + refresco de cola, mecanismo 1.7) — v1.1+, no urgente.
