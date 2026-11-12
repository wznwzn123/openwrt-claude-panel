#!/usr/bin/env bash
# 混入母带音轨 + 规格核验（时长/帧数/分辨率/帧率/响度/真峰值）
set -euo pipefail
cd "$(dirname "$0")/.."
V=${1:-out/assembled.mp4}; A=${2:-public/audio/final_mix.wav}; O=${3:-out/openwrt-claude-panel-promo-90s.mp4}
ffmpeg -v error -y -i "$V" -i "$A" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$O"
echo "== $O"
ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=width,height,r_frame_rate,nb_read_frames,profile,codec_name -show_entries format=duration -of default=nw=1 "$O"
ffmpeg -hide_banner -nostats -i "$O" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tr -s ' '
