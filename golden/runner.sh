#!/bin/zsh
# ---------------------------------------------------------------------------
# runner.sh — corre el golden set de 30 platos contra el endpoint de analisis.
#
#   CUESTA PLATA: cada corrida son 30 llamadas al modelo de vision. Ningun test
#   ni ninguna herramienta de golden/bin lo invoca; se corre a mano y a
#   proposito, y lo que deja grabado en respuestas/ se puede volver a jugar
#   contra el motor las veces que haga falta sin gastar un centavo mas.
#
# LAS RUTAS SE RESUELVEN CONTRA ESTE ARCHIVO, no contra el directorio desde el
# que se lo llama: el runner vive en el repo y tiene que andar igual desde la
# raiz, desde golden/ o desde donde sea.
#
# Uso:
#   ./golden/runner.sh                            # set-30 + emulador local
#   ./golden/runner.sh -e http://.../analyze      # otro endpoint
#   ./golden/runner.sh -o set-30/respuestas-v3 -f '1[1-9]|2.'
#
# Opciones:
#   -d DIR    directorio de fotos            (default: set-30/fotos)
#   -e URL    endpoint de analisis           (default: emulador local)
#   -o DIR    directorio de respuestas       (default: set-30/respuestas)
#   -b DIR    directorio de cuerpos base64   (default: set-30/bodies)
#   -f REGEX  solo las fotos cuyo nombre matchee (egrep sobre el basename)
#   -t SEG    timeout por llamada            (default: 180)
#   -s SEG    pausa entre llamadas           (default: 2)
#   -H 'K: V' cabecera extra (repetible, p.ej. Authorization)
#   -n        dry-run: lista lo que haria y no llama a nada
#
# Comportamiento:
#   - serie, una foto por vez (nunca en paralelo: el modelo se rate-limitea)
#   - UN solo reintento, y solo ante 5xx o error de red (code 000)
#   - guarda respuestas/NN-slug.json y bodies/NN-slug.json
#   - resumen final con el codigo HTTP de cada plato y el conteo por codigo
#   - exit 0 si los 30 dieron 200; exit 1 si alguno no
# ---------------------------------------------------------------------------
set -u

# La carpeta de este script, sea cual sea el directorio desde el que se lo llame.
AQUI="${0:A:h}"

FOTOS="$AQUI/set-30/fotos"
EP="http://localhost:5001/nutriscann-f809e/europe-west1/analyze"
OUT="$AQUI/set-30/respuestas"
BODIES="$AQUI/set-30/bodies"
FILTER=""
TIMEOUT=180
PAUSA=2
DRY=0
typeset -a HEADERS
HEADERS=()

while getopts "d:e:o:b:f:t:s:H:nh" opt; do
  case $opt in
    d) FOTOS="${OPTARG:A}" ;;
    e) EP="$OPTARG" ;;
    o) OUT="${OPTARG:a}" ;;
    b) BODIES="${OPTARG:a}" ;;
    f) FILTER="$OPTARG" ;;
    t) TIMEOUT="$OPTARG" ;;
    s) PAUSA="$OPTARG" ;;
    H) HEADERS+=("$OPTARG") ;;
    n) DRY=1 ;;
    h) sed -n '2,38p' "$0"; exit 0 ;;
    *) echo "opcion invalida; ./runner.sh -h"; exit 2 ;;
  esac
done

[[ -d "$FOTOS" ]] || { echo "ERROR: no existe el directorio de fotos: $FOTOS"; exit 2; }
mkdir -p "$OUT" "$BODIES"

typeset -a ARCHIVOS
ARCHIVOS=("${(@f)$(ls -1 "$FOTOS"/*.jpg 2>/dev/null | sort)}")
[[ -n "${ARCHIVOS[1]:-}" ]] || { echo "ERROR: no hay .jpg en $FOTOS"; exit 2; }

if [[ -n "$FILTER" ]]; then
  typeset -a FILTRADOS
  FILTRADOS=()
  for f in $ARCHIVOS; do
    print -r -- "${f:t:r}" | grep -Eq "$FILTER" && FILTRADOS+=("$f")
  done
  ARCHIVOS=($FILTRADOS)
  [[ -n "${ARCHIVOS[1]:-}" ]] || { echo "ERROR: el filtro '$FILTER' no dejo ninguna foto"; exit 2; }
fi

typeset -a CURL_H
CURL_H=(-H "Content-Type: application/json")
for h in $HEADERS; do CURL_H+=(-H "$h"); done

echo "endpoint : $EP"
echo "fotos    : $FOTOS  (${#ARCHIVOS} platos)"
echo "salida   : $OUT"
[[ $DRY -eq 1 ]] && echo "modo     : DRY-RUN (no se llama a nada)"
echo "---------------------------------------------------------------"

typeset -A CODIGOS
typeset -a ORDEN
INICIO=$SECONDS

llamar() {  # $1 = body file, $2 = out file -> imprime el codigo HTTP
  curl -s -o "$2" -w "%{http_code}" -m "$TIMEOUT" \
       -X POST "$EP" $CURL_H --data-binary "@$1" 2>/dev/null
}

for f in $ARCHIVOS; do
  name="${f:t:r}"
  ORDEN+=("$name")

  if [[ $DRY -eq 1 ]]; then
    echo "[dry] $name  ($(du -h "$f" | cut -f1))"
    CODIGOS[$name]="dry"
    continue
  fi

  b64=$(base64 -i "$f" | tr -d '\n')
  printf '{"image_base64":"%s","media_type":"image/jpeg"}' "$b64" > "$BODIES/$name.json"

  code=$(llamar "$BODIES/$name.json" "$OUT/$name.json")

  # UN solo reintento, solo ante 5xx o error de red
  if [[ "$code" == 5* || "$code" == "000" ]]; then
    echo "  $name: HTTP $code -> reintento unico en 5s"
    sleep 5
    code=$(llamar "$BODIES/$name.json" "$OUT/$name.json")
    code="${code}(r)"
  fi

  bytes=$(wc -c < "$OUT/$name.json" | tr -d ' ')
  printf '%-28s HTTP %-8s %8s bytes\n' "$name" "$code" "$bytes"
  [[ "$code" == 200* ]] || { echo "    cuerpo: $(head -c 300 "$OUT/$name.json")"; }

  CODIGOS[$name]="$code"
  sleep "$PAUSA"
done

echo "---------------------------------------------------------------"
echo "RESUMEN  (${#ORDEN} platos, $((SECONDS - INICIO))s)"
typeset -A CONTEO
fallos=0
for name in $ORDEN; do
  c="${CODIGOS[$name]}"
  printf '  %-28s %s\n' "$name" "$c"
  CONTEO[$c]=$(( ${CONTEO[$c]:-0} + 1 ))
  [[ "$c" == 200* || "$c" == "dry" ]] || (( fallos++ ))
done
echo "  ---"
for c in ${(k)CONTEO}; do echo "  HTTP $c : ${CONTEO[$c]}"; done
[[ $fallos -eq 0 ]] && echo "  sin fallos" || echo "  FALLOS: $fallos"
exit $(( fallos > 0 ? 1 : 0 ))
