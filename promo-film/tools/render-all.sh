#!/bin/sh
# 一次出全部成片：音效表 → 配乐 → 带配乐版 → 不带配乐版（只留音效，同一时间线）→ 压成交付用的文件
# 用法：sh tools/render-all.sh v2
set -e
V=${1:-final}
cd "$(dirname "$0")/.."
mkdir -p out/$V
node tools/glyphs.mjs
node tools/dump-cues.mjs
python3 audio/score.py > out/$V/score.log 2>&1
echo '{"music":false}' > out/props-nomusic.json
npx remotion render src/index.ts Film out/$V/master.mp4 --concurrency=4 --crf=16 --log=error
npx remotion render src/index.ts Film out/$V/master-nomusic.mp4 --concurrency=4 --crf=16 --log=error --props=out/props-nomusic.json
# 交付文件：x264 crf 22 slow（v1 实测：画面颗粒在 crf 18 下 433 MB，crf 22 约 40 MB，暗部渐变无可见色带）
for n in master master-nomusic; do
  ffmpeg -v error -y -i out/$V/$n.mp4 -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 256k out/$V/$n-delivery.mp4
done
echo "done $V"
