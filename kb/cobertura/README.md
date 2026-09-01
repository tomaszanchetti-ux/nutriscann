# El censo de cobertura mediterránea

**La pregunta que contesta:** de los platos que un comensal español va a
fotografiar, ¿cuáles sabe nombrar el catálogo, cuáles nombra mal y cuáles no
tiene? Y sobre todo: ¿cómo nos enteramos el día que uno de los que sí sabía deje
de saber?

Nació con la card 6.3 (WS06, 01/09/2026), por la directiva de producto que puso
a España y a la dieta mediterránea como mercado inicial.

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `platos.mediterraneos.json` | **La lista de entrada.** Los 141 platos de las dos fuentes, con su URL y su fecha de extracción. Se edita a mano, cuando cambia la fuente. |
| `censar.js` | **El medidor.** Le pregunta al motor real por cada plato y cada ingrediente, y le pega arriba los veredictos escritos a mano. Reescribe `censo.json`. |
| `censo.json` | **La foto.** Generado. No se edita: se edita `censar.js` y se vuelve a correr. |

Y el candado, que vive del otro lado porque es un test del motor:
`functions/src/engine/cobertura.test.ts`.

```bash
cd functions && npm run build     # el censo mide con el motor compilado
node kb/cobertura/censar.js       # reescribe censo.json
cd functions && npm test          # el candado verifica que no se perdió nada
```

## Las dos fuentes, que no son intercambiables

- **directoalpaladar** — los 101 platos representativos de la cocina española
  votados por 60 gastrónomos. Son **platos con nombre propio**: la fabada, el
  pisto, los callos. Es la lista contra la que se mide si el catálogo sabe de
  cocina española.
- **nuevoestilo** — 40 recetas de dieta mediterránea. La mitad no son platos con
  nombre sino **composiciones** («pez espada con tomates rellenos»). Eso no es un
  defecto de la fuente: es cómo se come, y es lo que la visión va a desarmar en
  ingredientes.

## Las cinco clases, que son cerradas

| Clase | Qué quiere decir | Quién la decide |
|---|---|---|
| `ok` | El término llega a la ficha **correcta** por un camino escrito del catálogo (nombre exacto o alias). | La máquina mide el camino; la persona confirmó que la ficha es la correcta. |
| `confianza_injusta` | La ficha es correcta y el término llegó por el **difuso**, que nunca pasa de 0,6 y en la práctica publica 0,10–0,30. El plato está cubierto y el usuario no se entera. | Idem. |
| `ficha_equivocada` | La ficha nombra **otro alimento**: otra especie, otra familia, o el ingrediente crudo en lugar del plato. | La persona, mirando la ficha. Nunca la máquina. |
| `ausente_ficha` | No hay ficha, y la que hay no sirve ni como gemelo. Es la lista de entrada de la card 6.4. | La persona. |
| `descomponible` | El «plato» es una composición ad-hoc que la visión desarma en ingredientes. No se juzga por su nombre —no hay ficha que pueda tenerlo— sino por la cobertura de sus ingredientes. | La persona. |

**El corte entre `ok` y `confianza_injusta` es el NIVEL de la cascada, no un
número suelto**, y eso no es un atajo: la escala de confianza es cerrada
(1,0 · 0,8 · 0,6 · 0,5), así que "llegó por alias" y "confianza ≥ 0,5" dicen lo
mismo. La única diferencia es el 15 % que el motor le descuenta a una ficha
genérica, y ese descuento es el motor diciendo la verdad sobre una ficha
promedio, no un defecto del vocabulario. Un `ok` a 0,43 —`Cocido madrileño`, por
ejemplo— es un 0,5 declarado por la curación menos ese 15 %.

**El veredicto de «ficha correcta» contra «ficha equivocada» no se automatiza.**
Un censo que dedujera «correcta» de «confianza alta» estaría midiendo la
confianza dos veces y la corrección ni una. Está escrito a mano en las tablas de
`censar.js`, con el motivo de cada uno.

## Lo que midió, antes y después de la curación de la card 6.3

Los 141 platos, con el motor real y el catálogo real:

| Clase | Antes (3.2.0) | Después (3.3.0) |
|---|---:|---:|
| `ok` | 24 | **38** |
| `confianza_injusta` | 31 | 21 |
| `ficha_equivocada` | 6 | 5 |
| `ausente_ficha` | 51 | 48 |
| `descomponible` | 29 | 29 |

Los 196 ingredientes clave:

| Clase | Antes | Después |
|---|---:|---:|
| `ok` | 32 | **37** |
| `confianza_injusta` | 91 | 91 |
| `ficha_equivocada` | 14 | **9** |
| `ausente_ficha` | 59 | 59 |

**Ninguna ficha entró, salió ni cambió de nutrientes.** Los movimientos son todos
de vocabulario, verificados con un barrido de 31.097 consultas sobre los dos
catálogos: 0 matches perdidos, 0 confianzas bajadas, y los 136 cambios trazan uno
a uno a las nueve curaciones de la card.

### Lo que se aprendió midiendo

**1. El hueco más caro no era de fichas: era de nombres largos.** Veinte platos
tenían su alias ya validado —`Pisto`, `Fabada`, `Callos`, `Gazpacho`— y el nombre
completo, que es el que usa el comensal, no lo disparaba: el nivel de alias es
igualdad exacta sobre la consulta entera y no busca alias *adentro* del término.
`Pisto manchego` valía 0,17 apuntando a la ficha correcta. La regla que salió de
ahí está escrita en `kb/curation/aliases.regional.json`: **el nombre regional
largo hereda la confianza del alias corto ya validado**, sin volver a juzgar la
composición.

**2. Un alias regional puede envenenar una palabra corriente.** `ajo` caía en
`Puerro cocido` porque el puerro lleva de alias `Ajo porro`, que es su nombre en
Colombia y Venezuela — un alias correcto que no había que tocar. El ajo es el
ingrediente más frecuente de las dos fuentes y no tenía puerta propia.

**3. Los ingredientes de una receta no son términos de visión.** `patatas`,
`huevos`, `harina` a secas caen mal porque no dicen la preparación, y en el
pipeline real la visión siempre la dice. Se dejaron documentados y **sin curar**:
elegir una preparación por decreto sería inventar.

**4. Hay tres huecos de proteína que ninguna curación arregla.** No existe en el
catálogo **ninguna** ficha de salmón, de mejillón ni de pez espada. Tampoco hay
pasta cocida simple. Son fichas, no vocabulario: card 6.4.

## Los límites, declarados

- El censo mide `buscarAlimento` con **un** término. El pipeline real busca con
  dos (inglés y español) y se queda con el mejor, así que la cobertura real es
  igual o mejor que la que dice este censo — nunca peor.
- Los `ingredientes_clave` son de **receta publicada**, no de foto. Sirven para
  preguntarle al catálogo si tiene el material del plato; no simulan el pipeline.
- El censo no toca porciones ni gramos: mide **qué ficha sale**, no cuánto pesa.
