#!/bin/zsh
# Baja y normaliza una foto. Uso: ./dl.sh NN-slug "URL"
UA="NutriScann-QA/0.1 (test local)"
D=${0:A:h}
name=$1; url=$2
raw="$D/raw/$name"
mkdir -p "$D/raw" "$D/fotos"
curl -s --max-time 90 -A "$UA" -o "$raw" "$url" || { echo "FAIL curl $name"; exit 1; }
ft=$(file -b "$raw")
case "$ft" in
  *image*|*JPEG*|*PNG*) ;;
  *) echo "NOIMG $name :: $ft"; exit 2;;
esac
sips -Z 1024 -s format jpeg -s formatOptions 80 "$raw" --out "$D/fotos/$name.jpg" >/dev/null 2>&1 || { echo "FAIL sips $name"; exit 3; }
echo "OK $name :: $(file -b "$D/fotos/$name.jpg" | cut -c1-60) :: $(du -h "$D/fotos/$name.jpg" | cut -f1)"
