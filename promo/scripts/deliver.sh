#!/usr/bin/env bash
# 渲染链完成后：竖屏混音 → 15s 循环 → 剪映草稿 → 汇总交付目录
set -euo pipefail
cd "$(dirname "$0")/.."
[ -n "${SKIP_VFINAL:-}" ] || ./scripts/finalize.sh out/vertical_video.mp4 public/audio/vertical_mix.wav out/promo-vertical-60s.mp4
./scripts/preview_loop.sh out/plate.mp4 out/preview-loop-15s.mp4
python3 scripts/jianying_export.py out/plate.mp4 out/jianying
mkdir -p out/deliver
# 上传版（审片 C3）：母版 ~41 Mbps 偏大，另出一版码率上限 20 Mbps，画质对平台二次转码足够
ffmpeg -v error -y -i out/openwrt-claude-panel-promo-90s.mp4 -map 0 -c:v libx264 -profile:v high -preset medium -crf 19 -maxrate 20M -bufsize 40M \
  -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709" -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a copy -movflags +faststart out/deliver/openwrt-claude-panel-promo-90s-上传版.mp4
cp out/openwrt-claude-panel-promo-90s.mp4 out/promo-vertical-60s.mp4 out/preview-loop-15s.mp4 out/deliver/
(cd out/jianying && zip -qr ../deliver/jianying-draft-OpenWrt-Claude-Panel-90s.zip .)
ls -la out/deliver
