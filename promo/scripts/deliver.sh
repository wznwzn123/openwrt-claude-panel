#!/usr/bin/env bash
# 渲染链完成后：竖屏混音 → 15s 循环 → 剪映草稿 → 汇总交付目录
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/finalize.sh out/vertical_video.mp4 public/audio/vertical_mix.wav out/promo-vertical-60s.mp4
./scripts/preview_loop.sh out/plate.mp4 out/preview-loop-15s.mp4
python3 scripts/jianying_export.py out/plate.mp4 out/jianying
mkdir -p out/deliver
cp out/openwrt-claude-panel-promo-90s.mp4 out/promo-vertical-60s.mp4 out/preview-loop-15s.mp4 out/deliver/
(cd out/jianying && zip -qr ../deliver/jianying-draft-OpenWrt-Claude-Panel-90s.zip .)
ls -la out/deliver
