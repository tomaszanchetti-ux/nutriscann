#!/bin/zsh
# Licencia + autor de un archivo de Commons. Uso: ./lic.sh "File:Nombre.jpg" ...
UA="NutriScann-QA/0.1 (test local)"
TMP=$(mktemp)
for t in "$@"; do
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$t")
  curl -s --max-time 45 -o "$TMP" -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=$enc&prop=imageinfo&iiprop=extmetadata"
  python3 -c "
import json,sys
d=json.load(open(sys.argv[1]))
for pg in (d.get('query',{}).get('pages') or {}).values():
    ii=(pg.get('imageinfo') or [{}])[0]; em=ii.get('extmetadata',{})
    g=lambda k: (em.get(k) or {}).get('value','?')
    import re
    art=re.sub('<[^>]+>','',str(g('Artist')))[:60]
    print(pg.get('title'),'|',g('LicenseShortName'),'|',art)
" "$TMP"
  sleep 1
done
rm -f "$TMP"
