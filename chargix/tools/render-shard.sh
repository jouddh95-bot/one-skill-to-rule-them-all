#!/bin/bash
# render-shard.sh <shard> <shards> : renders every <shards>-th frame of both sequences, writes webp into chargix/out/render
set -e
SH=$1; NS=$2
ROOT=$(pwd)
OUT=$ROOT/chargix/out/render; mkdir -p $OUT; TMP=$(mktemp -d)
SPP=$(jq -r .spp chargix/jobs/render.json)
for seq in hall light; do
  n=$([ $seq = hall ] && echo 161 || echo 61)
  only=$(jq -r --arg s $seq '.only[$s] // empty | join(",")' chargix/jobs/render.json)
  list=""
  for ((i=0;i<n;i++)); do
    if [ -n "$only" ]; then case ",$only," in *,$i,*) ;; *) continue;; esac; fi
    if (( i % NS == SH )); then list="$list${list:+,}$i"; fi
  done
  [ -z "$list" ] && continue
  echo "== $seq frames $list"
  CX_FRAMES=$list python chargix/blender/monument.py $seq 0 0 $TMP 1600 1000 $SPP 2>&1 | grep -E "rendered|Error|Traceback|line" || true
  stem=$([ $seq = hall ] && echo s || echo f); pad=$([ $seq = hall ] && echo 3 || echo 2)
  for f in $TMP/$stem-*.png; do
    i=$(basename $f .png | sed "s/^$stem-//"); i=$((10#$i)); id=$(printf "%0${pad}d" $i)
    python chargix/tools/webp.py $f $OUT/film-$stem-$id.webp 84
    python chargix/tools/webp.py $f $OUT/film-$stem-m-$id.webp 82 crop
  done
  rm -f $TMP/*.png
done
