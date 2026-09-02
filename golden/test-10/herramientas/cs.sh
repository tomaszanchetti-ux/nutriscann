#!/bin/zsh
UA="NutriScann-QA/0.1 (test local)"
for term in "$@"; do
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote('filetype:bitmap '+sys.argv[1]))" "$term")
  echo "\n### $term"
  curl -s -A "$UA" "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=$enc&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1200" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
for pg in (d.get('query',{}).get('pages') or {}).values():
    ii=pg['imageinfo'][0]; em=ii.get('extmetadata',{})
    print('  ',pg['title'],'|',ii['width'],'x',ii['height'],'|',em.get('LicenseShortName',{}).get('value','?'),'|',ii.get('thumburl',ii['url']))
"
done
