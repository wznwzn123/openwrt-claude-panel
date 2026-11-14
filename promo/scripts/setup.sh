#!/usr/bin/env bash
# 一键复原渲染所需的大文件（字体 / 配音 / 配乐与音效），然后即可渲染
set -euo pipefail
cd "$(dirname "$0")/.."
npm install --no-audit --no-fund
mkdir -p public/fonts public/audio/sfx
[ -f public/fonts/NotoSansSC-VF.ttf ] || curl -sSL -o public/fonts/NotoSansSC-VF.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
for w in Regular Medium Bold; do
  [ -f public/fonts/JetBrainsMono-$w.ttf ] || curl -sSL -o public/fonts/JetBrainsMono-$w.ttf "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-$w.ttf"
done
pip install numpy scipy soundfile >/dev/null
(cd voice && python3 build_timing.py)        # 由已提交的 a1–a5.mp3 + 词级时间戳重建 narration.wav 与 src/timing.json
(cd audio && python3 synth.py && ./master.sh && python3 vertical_audio.py && ./master.sh ../public/audio/vertical_premaster.wav ../public/audio/vertical_mix.wav)
echo "setup OK"
