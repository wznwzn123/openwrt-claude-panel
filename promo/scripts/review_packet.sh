#!/usr/bin/env bash
# 独立审片材料包：每秒 1 帧拼图、10 张关键帧（全分辨率）、关键转场连拍、规格量测
set -euo pipefail
cd "$(dirname "$0")/.."
F=${1:-out/openwrt-claude-panel-promo-90s.mp4}; P=out/review; rm -rf $P; mkdir -p $P/frames $P/keys $P/bursts
ffmpeg -v error -i "$F" -vf "fps=1,scale=384:-1" $P/frames/f%03d.png
ffmpeg -v error -y -pattern_type glob -i "$P/frames/f0[0-4]*.png" -filter_complex "tile=10x5:padding=4" $P/contact_00-49s.png
ffmpeg -v error -y -pattern_type glob -i "$P/frames/f0[5-9]*.png" -filter_complex "tile=10x5:padding=4" $P/contact_50-90s.png
for t in 1.5 9 15 24 32 41 50 64 77 88; do ffmpeg -v error -y -ss $t -i "$F" -frames:v 1 $P/keys/key_${t}s.png; done
for t in 5.75 11.8 16.655 19.759 29.069 40.448 42.0 46.138 57.517 58.034 81.828 84.414 85.448; do
  ffmpeg -v error -y -ss $(python3 -c "print($t-0.1)") -i "$F" -vf "fps=30,scale=640:-1,tile=6x1:padding=2" -frames:v 1 -update 1 $P/bursts/burst_${t}s.png; done
{
  echo "# 规格量测"; ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=codec_name,profile,width,height,r_frame_rate,nb_read_frames,pix_fmt -show_entries format=duration,bit_rate -of default=nw=1 "$F"
  ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of default=nw=1 "$F"
  ffmpeg -hide_banner -nostats -i "$F" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|LRA:|Peak:)" | tr -s ' '
  echo "# 黑帧"; ffmpeg -hide_banner -nostats -i "$F" -vf "blackdetect=d=0.1:pix_th=0.05" -an -f null - 2>&1 | grep -o "black_start.*" || echo none
  echo "# 静止段 (freezedetect n=0.003 d=0.8)"; ffmpeg -hide_banner -nostats -i "$F" -vf "freezedetect=n=0.003:d=0.8" -an -f null - 2>&1 | grep -oE "freeze_(start|duration): [0-9.]+" || echo none
  echo "# 视觉事件 vs 116 BPM 拍点（12.0s 起拍，beat=0.5172s）"; python3 -c "
b=60/116
for t in (16.655,18.724,19.759,29.069,40.448,42.0,42.26,44.586,46.138,57.517,58.034,81.828,84.414,85.448,85.707,85.966):
  n=round((t-12)/b*2)/2; print(f'{t:7.3f}s  偏差 {(t-(12+n*b))*1000:+5.0f} ms')"
} > $P/measurements.txt 2>&1
cat $P/measurements.txt
