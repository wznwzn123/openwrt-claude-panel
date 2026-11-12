#!/usr/bin/env bash
# 全套渲染链：主片分段母版 → 混音核验 → 30fps 无字幕底片 → 竖屏 60s
set -uo pipefail
cd "$(dirname "$0")/.."
TC=/home/user/vincentwei1021/video-talkcraft/scripts/render_shots.mjs
rm -rf out/segments
node $TC --shots shots.json --entry src/index.ts --comp Promo90 --seg-dir out/segments --parallel 3 --all --concat out/assembled.mp4 --image-format jpeg --jpeg-quality 95 --crf 16 || { echo "STAGE master FAILED"; exit 1; }
echo "STAGE master done"
./scripts/finalize.sh || { echo "STAGE finalize FAILED"; exit 1; }
echo "STAGE finalize done"
npx remotion render src/index.ts Plate30 out/plate.mp4 --concurrency=4 --crf=16 --log=error || { echo "STAGE plate FAILED"; exit 1; }
echo "STAGE plate done"
npx remotion render src/index.ts Vertical60 out/vertical_video.mp4 --concurrency=4 --crf=16 --log=error || { echo "STAGE vertical FAILED"; exit 1; }
echo "STAGE vertical done"
