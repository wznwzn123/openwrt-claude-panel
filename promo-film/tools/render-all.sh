#!/bin/sh
# 一次出全部成片（v4）：字形表 → 音效表 → 声音（配乐 + 音效 / 只留音效）→ 渲一遍画面 → 换音轨出第二版 → 压交付文件
# 用法：sh tools/render-all.sh v4
# 两版画面逐帧相同：只渲一次画面，无配乐版直接换掉音轨（video-shotcraft final-review A8：两版出自同一时间线）
set -e
V=${1:-final}
cd "$(dirname "$0")/.."
mkdir -p out/$V
node tools/glyphs.mjs
node tools/dump-cues.mjs src/v4/cues.ts
python3 audio/score4.py > out/$V/score.log 2>&1
npx remotion render src/index.ts Film out/$V/master.mp4 --concurrency=4 --crf=16 --log=error
ffmpeg -v error -y -i out/$V/master.mp4 -i public/audio/film4-nomusic.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest out/$V/master-nomusic.mp4
# 交付文件：x264 crf 22 slow（v1 实测：颗粒在 crf 18 下 433 MB，crf 22 约 50 MB，暗部渐变无可见色带）
for n in master master-nomusic; do
  ffmpeg -v error -y -i out/$V/$n.mp4 -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 256k out/$V/$n-delivery.mp4
done
echo "done $V"
