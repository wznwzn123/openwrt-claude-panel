#!/usr/bin/env bash
# 作业 2：竖屏先出片（渲染 + 终混）→ 无字幕底片 → 15s 循环 + 剪映草稿 + 汇总交付
# 分两段跑，竖屏完成即可单独交付：  ./scripts/render_job2.sh vertical   然后   ./scripts/render_job2.sh rest
# 不带参数 = 两段连跑。并行 2：4 核机器上更高并行曾导致浏览器崩溃
set -uo pipefail
cd "$(dirname "$0")/.."
STEP=${1:-all}
if [ "$STEP" = vertical ] || [ "$STEP" = all ]; then
  npx remotion render src/index.ts Vertical60 out/vertical_video.mp4 --concurrency=2 --crf=16 --log=error || { echo "STAGE vertical FAILED"; exit 1; }
  ./scripts/finalize.sh out/vertical_video.mp4 public/audio/vertical_mix.wav out/promo-vertical-60s.mp4 || { echo "STAGE vertical-final FAILED"; exit 1; }
  touch out/vertical.done
  echo "STAGE vertical done $(date +%H:%M)"
fi
if [ "$STEP" = rest ] || [ "$STEP" = all ]; then
  npx remotion render src/index.ts Plate30 out/plate.mp4 --concurrency=2 --crf=16 --log=error || { echo "STAGE plate FAILED"; exit 1; }
  echo "STAGE plate done $(date +%H:%M)"
  SKIP_VFINAL=1 ./scripts/deliver.sh && echo "STAGE deliver done $(date +%H:%M)" || echo "STAGE deliver FAILED"
fi
