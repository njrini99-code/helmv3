#!/bin/bash
# tile.sh <snapshot.html> <outdir> <tag> [zoom] [tiles]
# Renders a tall phone snapshot as N stacked viewport tiles.
set -euo pipefail
SRC="$1"; OUT="$2"; TAG="$3"; Z="${4:-2}"; N="${5:-3}"
mkdir -p "$OUT"
STEP=$(( 1700 / Z ))   # CSS px visible per 1700px square capture
for i in $(seq 0 $((N-1))); do
  OFF=$(( i * STEP ))
  T="$OUT/$TAG-$i.src.html"
  cp "$SRC" "$T"
  cat >> "$T" <<EOF
<style>html{zoom:${Z};} body{width:390px;margin:0 auto;position:relative;top:-${OFF}px;}</style>
EOF
done
qlmanage -t -s 1700 -o "$OUT" "$OUT/$TAG-"*.src.html >/dev/null 2>&1 || true
