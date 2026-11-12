#!/bin/sh
# 把 out/live/<片段>/*.jpg 编码成 public/live/<片段>.mp4（30fps，画质优先）
set -e
cd "$(dirname "$0")/.."
mkdir -p public/live
for d in out/live/*/; do
  n=$(basename "$d")
  ffmpeg -v error -y -framerate 30 -i "$d%04d.jpg" -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -movflags +faststart "public/live/$n.mp4"
  echo "$n $(ls "$d" | wc -l) frames → public/live/$n.mp4 $(du -h public/live/$n.mp4 | cut -f1)"
done
