#!/usr/bin/env bash
# 作业 1：主片分段母版 + 混音核验（单个后台作业 < 2h）
set -uo pipefail
cd "$(dirname "$0")/.."
rm -rf out/segments
node /home/user/vincentwei1021/video-talkcraft/scripts/render_shots.mjs --shots shots.json --entry src/index.ts --comp Promo90 --seg-dir out/segments --parallel 3 --all --concat out/assembled.mp4 --image-format jpeg --jpeg-quality 95 --crf 16 || { echo "STAGE master FAILED"; exit 1; }
echo "STAGE master done"
./scripts/finalize.sh || { echo "STAGE finalize FAILED"; exit 1; }
echo "STAGE finalize done"
