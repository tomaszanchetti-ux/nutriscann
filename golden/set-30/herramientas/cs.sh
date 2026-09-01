#!/bin/zsh
# Busca imagenes en Wikimedia Commons. Uso: ./cs.sh "consulta" ["otra" ...]
UA="NutriScann-QA/0.1 (test local)"
LIM=${LIM:-8}
TMP=$(mktemp)
for term in "$@"; do
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote('filetype:bitmap '+sys.argv[1]))" "$term")
  echo "\n### $term"
  for try in 1 2 3; do
    curl -s --max-time 45 -o "$TMP" -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=$enc&gsrnamespace=6&gsrlimit=$LIM&prop=imageinfo&iiprop=url|size&iiurlwidth=1024"
    python3 -c "
import json,sys
d=json.load(open(sys.argv[1]))
pgs=(d.get('query',{}).get('pages') or {})
if not pgs: raise SystemExit(3)
for pg in sorted(pgs.values(), key=lambda p: p.get('index',99)):
    ii=pg['imageinfo'][0]
    print('  ',pg['title'],'|',ii['width'],'x',ii['height'])
    print('      ',ii.get('thumburl',ii['url']).split('?')[0])
" "$TMP" && break
    sleep 4
  done
  sleep 2
done
rm -f "$TMP"
