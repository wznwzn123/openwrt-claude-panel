#!/usr/bin/env bash
# 第八版：第四幕多数表决修复单帧故障（主片 / 竖屏 / 底片），然后重出上传版、15s 循环、剪映包并更新交付目录
set -euo pipefail
# EXTRA_<合成名>="a-b c-d"：第四幕之外、扫描标出的可疑帧附近也做表决
# SKIP_VOTE="Promo90 …"：跳过已完成表决替换的合成（只复扫）
cd "$(dirname "$0")/.."
export PRESET=medium
fix() {  # 合成名 成片 模式 音频 区间…（起帧-止帧，可多个）
  local comp=$1 src=$2 mode=$3 audio=$4; shift 4; local d=out/vote/$comp
  if [ -n "${SKIP_VOTE:-}" ] && [[ " $SKIP_VOTE " == *" $comp "* ]]; then echo "跳过表决 $comp（已完成）"; else
  for r in "$@"; do python3 scripts/vote_frames.py "$comp" "$src" "${r%-*}" "${r#*-}" "$d" | tail -1; done
  if [ -n "$(ls -A "$d" 2>/dev/null)" ]; then python3 scripts/patch_frames.py "$mode" "$src" "$d" "$audio" "$src" | grep -v 亮度偏差 | tail -1; fi
  fi
  local W H; IFS=, read W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$src")
  echo "复扫 $src"; nice python3 scripts/glitch_scan.py "$src" "$W" "$H" | tail -n +2
  echo "STAGE $comp done $(date +%H:%M)"
}
fix Promo90 out/openwrt-claude-panel-promo-90s.mp4 final public/audio/final_mix.wav 3240-4440 ${EXTRA_Promo90:-}
fix Vertical60 out/promo-vertical-60s.mp4 final public/audio/vertical_mix.wav 668-1347 ${EXTRA_Vertical60:-}
fix Promo90Clean out/plate.mp4 plate - 3240-4440 ${EXTRA_Promo90Clean:-}
./scripts/preview_loop.sh out/plate.mp4 out/preview-loop-15s.mp4 | tail -1
python3 scripts/jianying_export.py out/plate.mp4 out/jianying > /dev/null
rm -f out/deliver/jianying-draft-OpenWrt-Claude-Panel-90s.zip
(cd out/jianying && zip -qr ../deliver/jianying-draft-OpenWrt-Claude-Panel-90s.zip .)
rm -rf out/jianying/assets
ffmpeg -v error -y -i out/openwrt-claude-panel-promo-90s.mp4 -map 0 -c:v libx264 -profile:v high -preset medium -crf 19 -maxrate 20M -bufsize 40M \
  -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709" -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a copy -movflags +faststart out/deliver/openwrt-claude-panel-promo-90s-上传版.mp4
cp out/openwrt-claude-panel-promo-90s.mp4 out/promo-vertical-60s.mp4 out/preview-loop-15s.mp4 out/deliver/
echo "STAGE all done $(date +%H:%M)"
