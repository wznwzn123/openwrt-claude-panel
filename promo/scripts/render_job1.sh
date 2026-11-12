#!/usr/bin/env bash
# 作业 1：主片分段母版 → 单帧异常扫描（有则自动重渲所在幕）→ 混音核验（单个后台作业 < 2h）
set -uo pipefail
cd "$(dirname "$0")/.."
TC=/home/user/vincentwei1021/video-talkcraft/scripts/render_shots.mjs
ARGS="--shots shots.json --entry src/index.ts --comp Promo90 --seg-dir out/segments --image-format jpeg --jpeg-quality 95 --crf 16"
rm -rf out/segments
node $TC $ARGS --parallel 3 --all --concat out/assembled.mp4 || { echo "STAGE master FAILED"; exit 1; }
echo "STAGE master done"
for pass in 1 2; do
  R=$(python3 scripts/frame_scan.py out/assembled.mp4 | tail -1); echo "SCAN pass $pass: $R"
  [ "$R" = "CLEAN" ] && break
  ACTS=$(python3 -c "
import json,sys
sh=json.load(open('shots.json')); ids=set()
for f in '$R'.split()[1:]:
    t=int(f)/60
    for s in sh:
        if s['start']<=t<s['end']: ids.add(s['id'])
print(','.join(sorted(ids)))")
  echo "re-render acts: $ACTS"
  node $TC $ARGS --parallel 2 --only $ACTS --concat out/assembled.mp4 || { echo "STAGE rerender FAILED"; exit 1; }
done
./scripts/finalize.sh || { echo "STAGE finalize FAILED"; exit 1; }
echo "STAGE finalize done"
