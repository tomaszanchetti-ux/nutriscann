# `config/` — la configuración versionada de la app

Este directorio es **la fuente de verdad de `config/app` en Firestore**. Firestore
es una copia derivada, igual que pasa con `kb/` y `foods/`: se edita acá, se revisa
en un PR y se publica con el seed. **Nunca a mano en la consola de Firebase.**

Es la capa que hace cumplir la regla dura n.º 1 del proyecto — *nada hardcodeado*:
los umbrales, los textos de la interfaz y las reglas de recomendación viven en la
base y se cambian **sin desplegar**.

| Archivo | Qué es |
|---|---|
| `recommendation_rules.json` | Las reglas con las que el motor elige qué recomendación mostrar. Se siembra en el campo `recommendation_rules` de `config/app`. |
| `copy.json` | Los textos que el usuario lee. Su objeto `copy` se siembra en el campo `copy` de `config/app`. Ver §8. |

Las secciones 1 a 7 son sobre `recommendation_rules.json`; la 8, sobre `copy.json`.

---

## 1. Cómo se usa (dónde encaja en el motor)

En el flujo `POST /analyze` (ver `docs/PLAN.md` §3), estas reglas son el paso **[3]**:

```
[1] Sonnet 5 mira la foto  →  QUÉ hay en el plato y cuántos gramos
[2] Backend               →  busca cada alimento en foods/ y suma: kcal y macros
[3] ESTAS REGLAS          →  con esos números ya calculados, elige UN tag
    Sonnet 5 (texto)      →  redacta la plantilla de ese tag en una línea
```

El modelo **no decide** qué recomendación dar: la decide la regla, que es
determinística y auditable. El modelo solo pone las palabras.

---

## 2. Con qué datos se evalúa

**Campos medidos** — los que llegan del paso [2]:

| Campo | ¿Puede faltar? |
|---|---|
| `kcal`, `protein_g`, `carbs_g`, `fat_g` | No |
| `fiber_g`, `sat_fat_g`, `sugars_g`, `sodium_mg` | **Sí** — no todo el catálogo USDA los trae |

**Campos derivados** — los calcula el motor antes de evaluar, con las fórmulas que
están en el propio JSON (`derived_fields`). Si un número tiene fórmula, la fórmula
está en el archivo; en el código no hay ninguna:

| Campo | Fórmula | De dónde sale el factor |
|---|---|---|
| `protein_pct` | `protein_g * 4 / kcal * 100` | Atwater |
| `carbs_pct` | `carbs_g * 4 / kcal * 100` | Atwater |
| `fat_pct` | `fat_g * 9 / kcal * 100` | Atwater — y es **exactamente** la medida de grasas totales de la OPS (g × 9 kcal sobre el total de energía), verificable contra la cita sin salir del archivo |
| `sat_fat_pct` | `sat_fat_g * 9 / kcal * 100` | La OPS fija el 9 kcal/g en su criterio |
| `sugars_pct` | `sugars_g * 4 / kcal * 100` | La OPS fija el 4 kcal/g en su criterio |
| `sodium_mg_per_kcal` | `sodium_mg / kcal` | Es la razón sodio:energía de la OPS |

Los tres porcentajes de macronutrientes se calculan **cada uno contra `kcal`, sin
normalizar** para que sumen 100. Si la suma da 97 o 104, esa diferencia es
información real (redondeo de USDA, fibra, alcohol) y taparla sería inventar.

Si el campo de origen es `null`, el derivado es `null`. **Si `kcal <= 0`, los seis
derivados son `null`** — es la única división del sistema y así queda cubierta: el
motor nunca produce `Infinity` ni `NaN`.

---

## 3. La sintaxis del campo `if`

Es a propósito **mínima**: números, nombres de campo, comparaciones y `&&` / `||`.
No hay funciones, ni texto, ni negación, ni `==`. Nada que se pueda usar para meter
lógica: si una regla necesita más que esto, la regla está mal pensada.

```
expr    := or
or      := and ( "||" and )*
and     := cmp ( "&&" cmp )*
cmp     := sum ( (">" | "<" | ">=" | "<=") sum )?
sum     := term ( ("+" | "-") term )*
term    := factor ( ("*" | "/") factor )*
factor  := NUMBER | IDENT | "(" expr ")"
```

`IDENT` solo puede ser uno de los nombres listados en `evaluation.identifiers_allowed`.
La aritmética existe porque la usan las fórmulas de `derived_fields`; **las reglas
deberían quedarse en comparaciones simples** (`sat_fat_pct >= 10`), que es lo que
se puede leer sin ser técnico.

---

## 4. Semántica de evaluación

Reparto de responsabilidades: **las fórmulas y los umbrales viven en el JSON** y se
cambian sin desplegar; **la semántica —nulos, división por cero, orden, corte y
fallback— la implementa el motor una sola vez, en código**, siguiendo este contrato.
Es maquinaria, no configuración: no debería cambiar cuando se ajusta un umbral.

1. **Orden.** Las reglas se ordenan por `priority` **de mayor a menor**. Si dos
   empatan, gana la que aparece primero en el array.
2. **Primera que da verdadero, gana.** No se acumulan tags: el reporte muestra uno.
3. **Nulos.** Toda comparación donde alguno de los dos lados es `null` da **falso**.
   Traducido: **si falta el dato, la regla no dispara**. Nunca se alerta a ciegas.
   Un plato sin `sodium_mg` no es "bajo en sodio": es un plato del que no sabemos
   el sodio, y por eso no decimos nada de sodio.
4. **División por cero.** No existe: el único divisor es `kcal` y todo derivado
   declara `null_if` con `kcal <= 0`. Un plato sin energía cuantificada tiene los
   seis derivados en `null` y no dispara ninguna regla.
5. **Si ninguna dispara**, se usa `fallback_tag` (`balanceada`) con
   `fallback_templates` — con la advertencia del punto siguiente.

### 4.1 `balanceada` NO es un aprobado

`balanceada` significa **exactamente una cosa: ninguna regla disparó**. Se llega ahí
por dos caminos que desde afuera se ven iguales:

- **(a)** el plato tiene todos los datos y no cruza ningún umbral, o
- **(b)** **faltan datos** — sin `sat_fat_g`, sin `sugars_g` o sin `sodium_mg` las
  reglas de exceso dan falso por `null` y el plato cae al fallback sin haber sido
  evaluado de verdad.

Un plato de 900 kcal con el 62% de la energía en grasa y sin dato de saturadas cae
acá. Por eso la plantilla dice **"sin alertas"** y no afirma ninguna proporción: es
la misma regla del punto 3, por simetría. Un plato sin `sodium_mg` no es bajo en
sodio; un plato sin alertas no es un plato equilibrado. **Ninguna plantilla puede
afirmar algo que nadie midió.**

### 4.2 Las prioridades v1

| Prioridad | Regla | Tag | ¿Cita? |
|---|---|---|---|
| 100 | `sodium_mg_per_kcal >= 1` | `alta_en_sodio` | OPS 2016, p. 18 |
| 90 | `sat_fat_pct >= 10` | `alta_en_grasa_saturada` | OPS 2016, p. 19 |
| 80 | `sugars_pct >= 10` | `alta_en_azucar` | OPS 2016, p. 18 (adaptada) |
| 60 | `protein_pct >= 30` | `recuperacion` | — criterio propio |
| 55 | `kcal > 0 && kcal <= 400` | `liviana` | — criterio propio |
| 50 | `carbs_pct >= 55` | `entrenamiento` | — criterio propio |
| — | (ninguna dispara) | `balanceada` | — |

Dos criterios, en este orden:

- **La salud le gana al perfil.** Las tres de exceso van arriba de las tres de perfil:
  si un plato de pasta es además muy salado, lo que importa decir es lo del sodio.
- **Entre las de perfil manda la señal más específica.** Las calorías son un dato
  grueso y el reparto de macronutrientes es un dato fino, así que `recuperacion` va
  arriba de `liviana`: una ensalada de pollo de 350 kcal con 46% de la energía en
  proteína es un plato de recuperación que además pesa poco, y leerla como "comida
  liviana" tiraba a la basura lo único distintivo que tenía. `liviana` queda como la
  lectura por defecto de los platos chicos que no dicen nada más, y sigue ganando
  donde corresponde: un bol de fruta de 250 kcal tiene la proteína por el piso, así
  que `recuperacion` no dispara y el bol se lee liviana. `entrenamiento` va última
  porque un porcentaje alto de carbohidratos es lo más fácil de alcanzar.

La guarda `kcal > 0` en `liviana` está para que un plato que no se pudo cuantificar
no se lea como comida liviana: sin energía medida no hay nada liviano, hay un plato
sin datos.

### 4.3 La lista cerrada de tags

Los siete valores válidos están en el array `tags` del JSON. El `tag` de toda regla
y el `fallback_tag` **tienen que pertenecer a esa lista, y el seed debe rechazar el
documento si alguno no pertenece**. La interfaz elige ícono y color a partir del tag:
un tag mal escrito no rompe nada visible, se degrada en silencio, y por eso hay que
poder detectarlo antes de publicar. Agregar un tag nuevo es un cambio de producto
(hay que darle ícono y texto), no un ajuste de umbral.

---

## 5. Simulación de referencia

Estos son los platos con los que se validó el set v1. **Sirven de banco de pruebas:
antes de mergear un cambio de umbrales, hay que pasarlos de nuevo y mirar qué se
movió.** Un umbral corrido dos puntos puede cambiar la recomendación de la mitad de
los platos.

| Plato | Números clave | Reglas que dan verdadero | Tag final |
|---|---|---|---|
| Pasta carbonara + pan (780 kcal) | sat 15,0% · Na/kcal 0,88 | saturadas (90) | `alta_en_grasa_saturada` |
| Ramen instantáneo con huevo (520 kcal) | **Na/kcal 3,56** · sat 13,8% | sodio (100), saturadas (90) | `alta_en_sodio` |
| Bol de avena, plátano y miel (470 kcal) | azúc 27,2% · C 66% | azúcar (80), entrenamiento (50) | `alta_en_azucar` |
| Ensalada de pollo (350 kcal) | P 46% · sat 6,4% | recuperación (60), liviana (55) | `recuperacion` |
| Bol de fruta (250 kcal) | P 5% · C 93% · azúc `null` | liviana (55), entrenamiento (50) | `liviana` |
| Espaguetis con tomate (690 kcal) | C 65% · sat 2,9% | entrenamiento (50) | `entrenamiento` |
| Pollo + arroz + brócoli **sin** sodio/azúcar/saturadas (620 kcal) | los tres derivados `null` · P 29% | ninguna | `balanceada` |
| **900 kcal, 62% grasa, sin dato de saturadas** | sat `null` | ninguna | `balanceada` — y **por eso** el texto dice "sin alertas" y no "buen plato" |
| Plato no cuantificado (`kcal = 0`) | todo `null` | ninguna | `balanceada`, **no** `liviana` |

Los tres casos de abajo no son ejemplos bonitos: son los que muestran que la
semántica de nulos y el fallback se comportan como está escrito.

---

## 6. Trazabilidad: qué es de la OPS y qué es nuestro

Cada regla lleva un campo `citation`, y ese campo es un contrato:

- **`citation` con contenido** = el umbral sale del *Modelo de perfil de nutrientes
  de la OPS* (OPS, Washington DC, 2016, ISBN 978-92-75-31873-7), con **página impresa
  y texto exacto**. Se puede mostrar al usuario y defender frente a cualquiera.
- **`citation: null`** = es criterio nuestro, v1, y el campo `own_criterion` dice
  por qué elegimos ese número. **Jamás se cita a la OPS para respaldar una de estas.**

Los cinco criterios de la OPS están en su **sección IV** (páginas impresas 18 y 19).
El **alcance** del modelo lo fija la **sección III** (páginas impresas 13 a 18), en
sus principios 3, 5, 7 y 8.

### La costura, dicha en voz alta

El modelo de la OPS fue hecho para clasificar **productos procesados y
ultraprocesados** leyendo su etiqueta, y el propio documento deja fuera de su alcance
los alimentos frescos, los ingredientes de cocina y los **platos recién preparados**
(sección III, principio 5 en la p. 14 y principios 7 y 8 en la p. 17). Un plato
fotografiado es justamente lo que la OPS excluye.

Entonces: **NutriScann no aplica el modelo OPS, ni clasifica platos "según la OPS".**
Lo que toma son sus **umbrales numéricos** como puntos de referencia citables.

Lo que hace honesto ese préstamo lo escribe la propia OPS en el principio 3 de su
página 14, y conviene leerlo entero porque tiene dos mitades. Primero reconoce el
límite: *"Se ha razonado que las metas de ingesta de nutrientes de la población tienen
como finalidad guiar la ingesta alimentaria diaria global, en vez del consumo de
determinados alimentos"*. Y enseguida lo salva con un **"Sin embargo"**: como el
consumo de productos con cantidades excesivas de nutrientes críticos aumenta la
probabilidad de que la alimentación entera exceda las metas, el consumidor igual
debe conocer esas recomendaciones.

O sea: la OPS sabe que está bajando un número pensado para la dieta completa hasta un
producto individual, lo dice, y explica por qué le parece legítimo. Nosotros hacemos
el mismo movimiento un paso más corto — lo bajamos hasta un **plato**, que está a
mitad de camino entre la dieta y el producto. Nuestro traslado se apoya en el
argumento de la OPS y además recorre menos distancia que el de ella.

Los dos umbrales que **no** convertimos en regla (grasas totales y grasas trans) están
igual transcritos en `ops_thresholds_reference`, cada uno con el motivo. Están ahí
para que se vea que fue una decisión y no un olvido, y para no tener que volver al PDF
el día que cambie.

El detalle completo de cada adaptación —sobre todo la de azúcares, que usa azúcares
totales donde la OPS dice azúcares libres— está en `notes.adaptaciones` del JSON, y
lo que queda por calibrar con datos de uso reales está registrado como **DT-6** en
`docs/DEUDAS.md`.

---

## 7. Cómo se edita una regla

```
1. Editar config/recommendation_rules.json en una branch.
2. PR. En la descripción: qué número cambió y por qué.
   Si el cambio toca un umbral con cita, tiene que seguir siendo verdad
   contra el PDF; si ya no lo es, la citation pasa a null y se escribe
   own_criterion. Una cita que dejó de ser exacta es peor que no tener cita.
3. Pasar el banco de platos de la §5 y mirar qué tags se movieron.
4. Merge a main → el seed publica config/app en Firestore.
5. La app toma el cambio sin desplegar nada.
```

**Lo que no se hace nunca:**

- Editar el documento a mano en la consola de Firebase. El próximo seed lo pisa y
  el repo deja de ser la verdad.
- Meter un umbral o una fórmula en el código de `functions/` "por ahora". Eso es
  exactamente lo que esta capa existe para evitar.
- Escribir una plantilla que **afirme algo que las reglas no midieron** (ver §4.1).
- Escribir una plantilla que diagnostique, prescriba o nombre una enfermedad.
  NutriScann es informativo y de fitness. El tono es cálido y accionable, nunca sermón.

---

## 8. `copy.json` — los textos de la interfaz

Todo lo que el usuario **lee** en la app: el título de la pantalla de captura, el
botón de la cámara, los pasos de la espera, los encabezados del reporte, los
mensajes de error y el pie legal. Son **18 claves** y se editan sin desplegar,
que es la regla dura n.º 1 del proyecto en su forma más literal.

### La estructura, y en qué se diferencia de las reglas

De `recommendation_rules.json` se publica el documento **entero**. De `copy.json`
se publica **solo el objeto `copy`**:

| Parte del archivo | ¿Viaja a Firestore? |
|---|---|
| `copy` | **Sí.** Es exactamente el contenido del campo `config/app.copy` |
| `keys` | No. La lista cerrada de claves válidas, con dónde se usa cada una |
| `$schema_version`, `updated_at`, las notas | No. Se quedan en el repo, que es donde sirven |

El motivo es el contrato: `config/app.copy` es un mapa de **texto a texto**
(`Record<string,string>` en `functions/src/config.ts`) y el navegador lee cada
clave como `stringValue`. Un `$schema_version` numérico adentro de ese mapa lo
rompería.

`scanning_steps` es la única clave con forma propia: viaja como **un solo
string** con los pasos separados por `|`, porque un mapa de textos no admite una
lista. El front lo parte. La forma la fijó lo que la Fase 0 dejó publicado.

### Por qué el seed valida las claves

Igual que con los `tags` de las reglas, y por el mismo motivo: **el error no se
ve**. El front trae su arranque en frío (`apps/web/src/lib/config.ts`), así que
una clave mal tipeada acá deja la pantalla perfecta mostrando el texto viejo del
código. Nadie abre un ticket por una pantalla que se ve bien.

Por eso `keys` es una lista **cerrada** y el seed rechaza el archivo si `copy` no
tiene exactamente esas claves. Y por eso los tests de `kb/seed` comparan esa
lista con la interfaz `CopyDeLaApp` del front, que es quien las lee.

### Cómo se cambia un texto

```
1. Editar el valor en config/copy.json, en una branch.
2. PR. Alcanza con el texto viejo y el nuevo.
3. Merge a main → el seed publica config/app.copy.
4. La app toma el cambio sin desplegar nada.
```

**Cómo se agrega un texto nuevo** — son las dos puntas, siempre:

```
1. El campo en CopyDeLaApp y su valor de arranque en frío, en apps/web.
2. La clave en `keys` (con dónde se usa) y su texto en `copy`, acá.
```

Falta una de las dos y el seed o el test lo frenan: una clave que nadie declara
no se publica, y un campo del front que nadie sembró se denuncia en
`textos.test.ts`.

**Lo que no se hace nunca:**

- Editar `copy` a mano en la consola de Firebase. El próximo seed **pisa el mapa
  entero** —la máscara nombra el campo completo— y una clave agregada ahí
  desaparece sin dejar rastro.
- Escribir un texto directamente en un componente de `apps/web`. Los valores del
  código son arranque en frío y nada más; un texto que solo vive ahí necesita un
  deploy para cambiar una coma.
- Dejar una clave vacía para "sacar" un texto de la interfaz. El front descarta
  los vacíos y muestra el del arranque en frío: no se saca nada, se tapa.
