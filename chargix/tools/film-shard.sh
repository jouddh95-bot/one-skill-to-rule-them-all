#!/bin/bash
# film-shard.sh <shard> <shards> : renders every <shards>-th frame of the film named in chargix/jobs/film.json
set -e
SH=$1; NS=$2
J=chargix/jobs/film.json
SCENE=$(jq -r .scene $J); N=$(jq -r .frames $J); SPP=$(jq -r .spp $J); W=$(jq -r .w $J); H=$(jq -r .h $J); CW=$(jq -r '.cw // "steel"' $J); LABEL=$(jq -r .label $J)
OUT=chargix/out/film/$LABEL; mkdir -p $OUT; TMP=$(mktemp -d)
list=""
A=$(jq -r '.from // 0' $J); B=$(jq -r ".to // $((N-1))" $J); k=0
for ((i=A;i<=B;i++)); do (( k % NS == SH )) && list="$list${list:+,}$i"; k=$((k+1)); done
[ -z "$list" ] && exit 0
CX_N=$N python chargix/blender/$SCENE.py $TMP "$list" $W $H $SPP $CW 2>&1 | grep -E "rendered|Error|Traceback|line" || true
for f in $TMP/*.png; do
  python chargix/tools/webp.py $f $OUT/$(basename $f .png).webp 82
done
