#!/usr/bin/env python3
"""Borrador masivo de nombres en español por GLOSARIO + COMPOSICIÓN.

No traduce por ítem: descompone la descripción USDA en cabeza + modificadores,
traduce cada pieza con glossary.es.json y las vuelve a componer respetando el
género y el número del sustantivo que encabeza.

Es una HERRAMIENTA DE BORRADOR, no la fuente de verdad: el archivo curado es
names.es.json, que se revisa y se corrige a mano. Su uso normal es la cola de
curación (alimentos nuevos que el motor no encontró): se le pasa un archivo con
descripciones y devuelve el punto de partida.

    # el catalogo entero
    python3 tools/draft_names.py --selection ../selection/selection.v1.json \
                                 --out /tmp/draft.json --report
    # solo la cola de curacion que dejo el build
    python3 tools/draft_names.py --selection ../build/pending.curation.json \
                                 --out /tmp/draft.json --report

Lo que no resuelve queda marcado con "??" y se cura a mano.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GLOSSARY = HERE.parent / "glossary.es.json"

PREPOSITIONS = ("con ", "de ", "del ", "en ", "sin ", "al ", "a la ", "para ", "tipo ")

# Adjetivos invariables (no cambian por género): se pegan al sustantivo sin "de".
INVARIABLE_ADJ = {
    "natural", "light", "integral", "verde", "dulce", "caliente", "salvaje",
    "multicereal", "gigante", "fuerte", "suave", "azul", "grande", "hervible",
}

# Género del sustantivo cuando la terminación miente.
FEMININE = {
    "leche", "carne", "sal", "miel", "col", "coliflor", "flor", "piel", "nuez",
    "raíz", "clara", "legumbre", "sidra", "sangre", "codorniz", "berza", "sopa",
}
MASCULINE = {
    "arroz", "maíz", "pan", "café", "té", "yogur", "pez", "jamón", "salmón",
    "atún", "limón", "melón", "tomate", "chocolate", "paté", "filete", "postre",
    "aceite", "pastel", "flan", "puré", "licor", "kéfir", "dip", "wrap", "bagel",
    "sándwich", "gyros", "helado", "batido", "jugo", "néctar", "caldo", "guiso",
    "pudín", "sirope", "almíbar", "azúcar", "agua", "cereal", "tofu", "tempeh",
    "miso", "sushi", "ramen", "taco", "burrito", "tamal", "chili", "hummus",
}


def load_glossary(path: Path = GLOSSARY) -> dict[str, str]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {k.lower(): v for k, v in raw.items() if not k.startswith("$")}


def gender_number(head_es: str) -> tuple[str, bool]:
    """Devuelve (género, es_plural) del sustantivo que encabeza el nombre."""
    first = re.split(r"\s+", head_es.strip())[0].lower()
    plural = False
    stem = first
    if first.endswith("es") and len(first) > 3:
        plural, stem = True, first[:-2]
    elif first.endswith("s") and len(first) > 2:
        plural, stem = True, first[:-1]
    if stem in FEMININE:
        return "f", plural
    if stem in MASCULINE:
        return "m", plural
    if stem.endswith("a") or stem.endswith("ción") or stem.endswith("dad"):
        return "f", plural
    return "m", plural


def agree(adj: str, gender: str, plural: bool) -> str:
    """'crudo/a' + (f, True) -> 'crudas'; 'bajo/a en grasa' -> 'bajas en grasa'.

    Solo concuerdan las palabras antes de la primera preposicion: el resto de la
    frase ('en grasa', 'de leche') queda intacto.
    """
    words = adj.split(" ")
    out: list[str] = []
    for i, word in enumerate(words):
        if i and word.lower() in {"en", "de", "con", "sin", "a", "al", "para", "y"}:
            out.extend(words[i:])
            break
        if "/" in word:
            base, fem_end = word.split("/", 1)
            word = base if gender == "m" else base[: -len(fem_end)] + fem_end
        if plural:
            if word.endswith(("a", "e", "o")):
                word += "s"
            elif word[-1].isalpha():
                word += "es"
        out.append(word)
    return " ".join(out)


def is_adjective(value: str) -> bool:
    return "/" in value or value.lower() in INVARIABLE_ADJ


def is_phrase(value: str) -> bool:
    return value.lower().startswith(PREPOSITIONS)


def is_proper(value: str) -> bool:
    return value[:1].isupper()


def split_parts(description: str) -> list[str]:
    return [p.strip() for p in description.split(",") if p.strip()]


def lookup(glossary: dict[str, str], phrase: str) -> str | None:
    key = phrase.lower().strip()
    if key in glossary:
        return glossary[key]
    stripped = re.sub(r"\s*\([^)]*\)", "", key).strip()
    if stripped == "":  # el fragmento era solo un parentesis aclaratorio
        return ""
    if stripped in glossary:
        return glossary[stripped]
    return None


def draft(description: str, glossary: dict[str, str]) -> tuple[str, bool]:
    """Devuelve (borrador, resuelto). Lo no resuelto queda con '??'."""
    parts = split_parts(description)
    head_es, used = None, 0
    # cabeza = el prefijo MÁS LARGO que el glosario reconoce
    for n in range(len(parts), 0, -1):
        candidate = ", ".join(parts[:n])
        hit = lookup(glossary, candidate)
        if hit:
            head_es, used = hit, n
            break
    resolved = head_es is not None
    if head_es is None:
        head_es, used = f"??{parts[0]}", 1

    gender, plural = gender_number(head_es)
    adjectives: list[str] = []
    phrases: list[str] = []
    for part in parts[used:]:
        value = lookup(glossary, part)
        if value is None:
            phrases.append(f"??{part}")
            resolved = False
            continue
        if value == "":
            continue
        if is_phrase(value):
            phrases.append(value)
        elif is_adjective(value):
            adjectives.append(agree(value, gender, plural))
        elif is_proper(value):
            adjectives.append(value)
        else:
            phrases.append(f"de {value}")

    name = " ".join([head_es] + adjectives + phrases)
    name = re.sub(r"\s+", " ", name).strip()
    name = name[:1].upper() + name[1:]
    return name, resolved


def read_entries(path: Path) -> list[dict]:
    """Acepta las dos formas que existen en el repo: la seleccion
    (kb/selection/selection.v1.json, clave 'entries', con category) y la cola de
    curacion que produce el build (kb/build/pending.curation.json, clave
    'pending', sin category). Tambien una lista suelta."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    for key in ("entries", "pending"):
        if isinstance(data.get(key), list):
            return data[key]
    raise SystemExit(f"{path}: no encontre ni 'entries' ni 'pending'")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selection", default=str(HERE.parent.parent / "selection/selection.v1.json"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    glossary = load_glossary()
    entries = read_entries(Path(args.selection))

    out, unresolved = {}, []
    for e in entries:
        name, ok = draft(e["description"], glossary)
        out[str(e["fdc_id"])] = {"name": name, "category": e.get("category", ""), "en": e["description"]}
        if not ok:
            unresolved.append((e["fdc_id"], e["description"], name))

    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.report:
        print(f"borrador: {len(out)} · sin resolver: {len(unresolved)}", file=sys.stderr)
        for fdc, en, name in unresolved:
            print(f"  {fdc} | {en} -> {name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
