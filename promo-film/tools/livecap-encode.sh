#!/bin/sh
# 把 out/live/<片段>/*.jpg 编码成 public/live/<片段>.mp4（30fps，画质优先）
# 缩到 1 倍 CSS 像素（电脑端 1920 宽、手机 780 宽）：片中界面板最大约占画面六成宽，1 倍已经够清楚，渲染也快得多
set -e
cd "$(dirname "$0")/.."
mkdir -p public/live
for d in out/live/*/; do
  n=$(basename "$d")
    w=1920; [ "$n" = phone ] && w=780
  ffmpeg -v error -y -framerate 30 -i "$d%04d.jpg" -vf "scale=$w:-2:flags=lanczos" -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -movflags +faststart "public/live/$n.mp4"
  echo "$n $(ls "$d" | wc -l) frames → public/live/$n.mp4 $(du -h public/live/$n.mp4 | cut -f1)"
done
