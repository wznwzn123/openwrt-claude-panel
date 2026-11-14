#!/usr/bin/env bash
# 主片续渲：只渲染 out/segments 里缺失或帧数不完整的段（容器重启后直接重跑本脚本即可），再拼接 → 单帧扫描 → 终混
set -uo pipefail
cd "$(dirname "$0")/.."
TC=/home/user/vincentwei1021/video-talkcraft/scripts/render_shots.mjs
ARGS="--shots shots.json --entry src/index.ts --comp Promo90 --seg-dir out/segments --image-format jpeg --jpeg-quality 95 --crf 16"
PAR=${PAR:-2}   # 4 核机器上 3 路并行曾导致浏览器崩溃、容器重启，默认 2 路
mkdir -p out/segments
TODO=$(python3 - <<'PY'
import json, subprocess, os
miss = []
for s in json.load(open('shots.json')):
    f = f"out/segments/{s['id']}.mp4"; need = round((s['end'] - s['start']) * 60)
    n = 0
    if os.path.exists(f):
        r = subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', f], capture_output=True, text=True)
        n = int((r.stdout.strip().split(',')[0] or 0))
    if n != need: miss.append(s['id'])
print(','.join(miss))
PY
)
echo "待渲：${TODO:-无}  $(date +%H:%M)"
if [ -n "$TODO" ]; then
  node $TC $ARGS --parallel $PAR --only $TODO --concat out/assembled.mp4 || { echo "STAGE master FAILED"; exit 1; }
else
  ls out/segments/a*.mp4 | sort | sed "s#^#file '$PWD/#; s#\$#'#" > out/segments/concat.txt
  ffmpeg -v error -y -f concat -safe 0 -i out/segments/concat.txt -c copy out/assembled.mp4 || exit 1
fi
echo "STAGE master done $(date +%H:%M)"
echo "SCAN: $(python3 scripts/frame_scan.py out/assembled.mp4 | tail -1)"
./scripts/finalize.sh && echo "STAGE finalize done $(date +%H:%M)"
