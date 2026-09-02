#!/bin/zsh
set -u
EP="http://localhost:5001/nutriscann-f809e/europe-west1/analyze"
mkdir -p respuestas bodies
for f in "$@"; do
  name="${f%.jpg}"
  echo "\n=== $name ==="
  b64=$(base64 -i "fotos/$f" | tr -d '\n')
  printf '{"image_base64":"%s","media_type":"image/jpeg"}' "$b64" > "bodies/$name.json"
  code=$(curl -s -o "respuestas/$name.json" -w "%{http_code}" -m 180 \
     -X POST "$EP" -H "Content-Type: application/json" --data-binary "@bodies/$name.json")
  echo "HTTP $code | $(wc -c < respuestas/$name.json) bytes"
  if [[ "$code" != "200" ]]; then echo "  !! cuerpo:"; head -c 400 "respuestas/$name.json"; fi
done
