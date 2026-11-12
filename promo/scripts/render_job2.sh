#!/usr/bin/env bash
# 作业 2：无字幕底片 + 竖屏 + 交付打包
set -uo pipefail
cd "$(dirname "$0")/.."
npx remotion render src/index.ts Plate30 out/plate.mp4 --concurrency=4 --crf=16 --log=error || { echo "STAGE plate FAILED"; exit 1; }
echo "STAGE plate done"
npx remotion render src/index.ts Vertical60 out/vertical_video.mp4 --concurrency=4 --crf=16 --log=error || { echo "STAGE vertical FAILED"; exit 1; }
echo "STAGE vertical done"
./scripts/deliver.sh && echo "STAGE deliver done" || echo "STAGE deliver FAILED"
