#!/usr/bin/env bash
# 混入母带音轨（AAC 编码会抬高真峰值约 1 dB，先做 4 倍过采样限幅） + 统一色彩规格（yuv420p · tv range · BT.709 三项标签）+ 规格核验
set -euo pipefail
cd "$(dirname "$0")/.."
V=${1:-out/assembled.mp4}; A=${2:-public/audio/final_mix.wav}; O=${3:-out/openwrt-claude-panel-promo-90s.mp4}
ffmpeg -v error -y -i "$V" -i "$A" -map 0:v -map 1:a \
  -vf "scale=in_range=auto:out_range=tv:in_color_matrix=auto:out_color_matrix=bt709,format=yuv420p" \
  -c:v libx264 -profile:v high -preset slow -crf 16 -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709" \
  -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -af "volume=0.4dB,aresample=192000,alimiter=limit=0.74:attack=1:release=60:level=false:asc=1,aresample=48000" \
  -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$O"
echo "== $O"
ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=width,height,r_frame_rate,nb_read_frames,profile,codec_name,pix_fmt,color_range,color_space,color_primaries,color_transfer -show_entries format=duration,bit_rate -of default=nw=1 "$O"
ffmpeg -hide_banner -nostats -i "$O" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tr -s ' '
