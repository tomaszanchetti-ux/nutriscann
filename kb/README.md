# Base de conocimiento (kb/)

El catálogo nutricional que usa el motor para cuantificar lo que el modelo identifica.

## El principio

**La fuente de verdad es este directorio, no Firestore.** Firestore es una copia de
servicio, derivada. Nadie edita el catálogo en la consola de Firebase: se edita acá,
se revisa en un pull request y se publica con el seed.

Un catálogo correcto **por construcción**, no por disciplina.

## Las cuatro capas

```
1. FUENTES CRUDAS       sources.json declara qué datasets usamos, con su sha256.
                        Los .zip NO están en git (1,1 GB): viven en la carpeta
                        de arriba. Si un archivo cambia, el build lo detecta.

2. BUILD                Parsea los CSV → modelo canónico. Determinístico:
                        mismas fuentes ⇒ mismo resultado, siempre.
                        Precedencia declarada en sources.json.
                        Cada campo registra de qué fuente salió.
                        → build/foods.canonical.json  (COMMITEADO)

3. CURACIÓN             curation/*.json — nombres en español, aliases, porciones
                        típicas, correcciones puntuales. Los arreglos van SIEMPRE
                        acá; nunca al build ni a Firestore directo.

4. SEED                 Sube el canónico a Firestore (foods/) estampando la
                        kb_version. Idempotente: correrlo dos veces da el mismo
                        resultado. Un alimento retirado se marca deprecated,
                        nunca se borra.
```

## Candados

El build **falla** —y por lo tanto no hay seed— si:

- Un alimento no valida contra el esquema.
- Un caso dorado no da el valor esperado (`manzana ≈ 52 kcal/100 g`).
- **Atwater**: las calorías declaradas no cierran con los propios macros del
  alimento (4×proteína + 4×carbohidratos + 9×grasa, dentro de tolerancia).
  Un dato incoherente no entra al catálogo.

## Cómo crece

El motor, en runtime, escribe en `curation_queue/` cada alimento que no encontró.
Esa cola se revisa, se convierte en un archivo de curación, se recompila el
catálogo y se re-seedea. El catálogo crece con el uso real — siempre entrando por
la puerta del pipeline, nunca por la ventana.

## Estado

Esqueleto. El pipeline se implementa en la **Fase 1**.
