#!/usr/bin/env python3
"""Regenera el campo 'aliases' de names.es.json a partir de variants.es.json.

Un alias es el MISMO alimento dicho en otra región: 'Papas fritas' -> 'Patatas
fritas'. Se genera sustituyendo una variante por vez sobre el nombre neutro, de
modo que el alias siempre queda consistente con el nombre: si mañana se corrige
un nombre a mano, se vuelve a correr esto y los aliases se corrigen solos.

    python3 tools/build_aliases.py            # reescribe names.es.json (conserva lo manual)
    python3 tools/build_aliases.py --rebuild  # descarta y regenera todo desde las reglas
    python3 tools/build_aliases.py --check    # no escribe; dice si hay diferencias

Reglas del generador:
  - concuerda GÉNERO y NÚMERO de los adjetivos que siguen al sustantivo
    sustituido ('Palomitas de maíz listas' -> 'Pochoclo listo');
  - solo concuerda si el sustantivo sustituido es la CABEZA del nombre: en
    'Trocitos de tocino vegetarianos' el adjetivo es de 'Trocitos', no de
    'tocino', así que no se toca;
  - solo toca adjetivos que el glosario declara con barra de género;
  - no sustituye si la variante ya está en el nombre ('Pimiento morrón');
  - '$skip' apaga una variante: por nombre completo, o por par [nombre, variante].

Los aliases que NO salen de una variante regional (un nombre comercial, un plato
que en un país se llama entero distinto) van en '$extra' de variants.es.json, por
fdc_id. Lo escrito a mano en names.es.json también sobrevive: esto solo AGREGA.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NAMES = HERE.parent / "names.es.json"
VARIANTS = HERE / "variants.es.json"
MAX_ALIASES = 6

PREPS = {"de", "del", "con", "en", "sin", "a", "al", "para", "tipo", "y", "o", "la", "el"}
# Género cuando la terminación miente ('col' es femenino, 'maíz' masculino).
GENDER_EXC = {"col": "f", "sal": "f", "nata": "f", "flor": "f", "nuez": "f", "miel": "f", "maíz": "m", "ají": "m",
              "maní": "m", "morrón": "m", "melocotón": "m", "plátano": "m", "damasco": "m",
              "chabacano": "m", "cacahuete": "m", "cacahuate": "m", "guineo": "m"}
WORD = r"(?<![\wáéíóúñü]){}(?![\wáéíóúñü])"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def adjective_stems() -> set[str]:
    """Los adjetivos que el glosario ya declara con barra de género
    ('crudo/a', 'bajo/a en grasa') más un puñado que llega dentro de frases."""
    glossary = load(HERE.parent / "glossary.es.json")
    stems = {"chino", "americano", "suizo", "cremoso", "salteado", "gratinado", "dorado"}
    for value in glossary.values():
        if isinstance(value, str) and "/" in value:
            stems.add(value.split(" ")[0].split("/")[0])
    return {s.rstrip("o") for s in stems}


def gender_number(word: str) -> tuple[str, bool]:
    w = word.lower().split(" ")[0]  # manda la CABEZA: "palomitas de maíz" es femenino plural
    plural = False
    stem = w
    if w.endswith("es") and len(w) > 3:
        plural, stem = True, w[:-2]
    elif w.endswith("s") and len(w) > 2:
        plural, stem = True, w[:-1]
    if stem in GENDER_EXC:
        return GENDER_EXC[stem], plural
    if w in GENDER_EXC:
        return GENDER_EXC[w], plural
    return ("f" if stem.endswith("a") else "m"), plural


def reagree(rest: str, gender: str, plural: bool, stems: set[str]) -> str:
    """Concuerda los adjetivos conocidos que siguen al sustantivo sustituido,
    hasta la primera preposición: 'Banana cruda' -> 'Plátano crudo'."""
    words: list[str] = []
    for i, word in enumerate(rest.split(" ")):
        core = word.rstrip(",").lower()
        if core in PREPS:
            words.extend(rest.split(" ")[i:])
            break
        punct = word[len(word.rstrip(",")):]
        stem = core[:-2] if core.endswith(("os", "as")) else core[:-1] if core.endswith(("o", "a")) else None
        if stem is not None and stem in stems:
            words.append(stem + ("o" if gender == "m" else "a") + ("s" if plural else "") + punct)
        else:
            words.append(word)
    return " ".join(words)


def aliases_for(name: str, variants: dict[str, list[str]], stems: set[str],
                skip: set[tuple[str, str]]) -> list[str]:
    out: list[str] = []
    spans: list[tuple[int, int]] = []
    for key in sorted(variants, key=len, reverse=True):
        for m in re.finditer(WORD.format(re.escape(key)), name, re.IGNORECASE):
            if any(s <= m.start() < e or s < m.end() <= e for s, e in spans):
                continue  # ya lo cubrió una clave más larga
            spans.append((m.start(), m.end()))
            original = m.group(0)
            before = name[: m.start()].strip().split(" ")[-1].lower()
            head = before not in PREPS  # si viene tras preposición, el adjetivo no es suyo
            for variant in variants[key]:
                if (name, variant) in skip:
                    continue
                if re.search(WORD.format(re.escape(variant)), name, re.IGNORECASE):
                    continue  # la variante ya está en el nombre ('Pimiento morrón')
                shown = variant[0].upper() + variant[1:] if original[0].isupper() else variant
                tail = name[m.end():]
                if head and tail.startswith(" "):
                    g_old, n_old = gender_number(original)
                    g_new, n_new = gender_number(variant)
                    if (g_old, n_old) != (g_new, n_new):
                        tail = " " + reagree(tail[1:], g_new, n_new, stems)
                candidate = name[: m.start()] + shown + tail
                if candidate != name and candidate not in out:
                    out.append(candidate)
            break
    return out[:MAX_ALIASES]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--rebuild", action="store_true",
                    help="descarta los aliases existentes en vez de conservarlos: "
                         "es la unica forma de que se caiga uno viejo cuando cambia una regla")
    args = ap.parse_args()

    names = load(NAMES)
    raw = load(VARIANTS)
    variants = {k: v for k, v in raw.items() if not k.startswith("$")}
    extra: dict[str, list[str]] = raw.get("$extra", {})
    skip: set[tuple[str, str]] = set()
    skip_all: set[str] = set()
    for item in raw.get("$skip", []):
        if isinstance(item, str):
            skip_all.add(item)
        else:
            skip.add((item[0], item[1]))
    stems = adjective_stems()

    changed = 0
    for fdc, entry in names.items():
        name = entry["name"]
        generated = [] if name in skip_all else aliases_for(name, variants, stems, skip)
        generated = [a for a in extra.get(fdc, []) if a not in generated] + generated
        previous = [] if args.rebuild else entry.get("aliases", [])
        manual = [a for a in previous if a not in generated]
        merged = manual + [a for a in generated if a not in manual]
        if merged != entry.get("aliases", []):
            changed += 1
            entry["aliases"] = merged

    total = sum(len(e["aliases"]) for e in names.values())
    print(f"{len(names)} nombres · {total} aliases · {changed} entradas actualizadas", file=sys.stderr)
    if args.check:
        return 1 if changed else 0
    NAMES.write_text(json.dumps(names, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
