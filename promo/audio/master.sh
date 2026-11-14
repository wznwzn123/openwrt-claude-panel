#!/usr/bin/env bash
# 母带：纯增益 + 4× 过采样真峰值限幅，迭代锁定 -14.0 LUFS（不用 loudnorm 动态模式，保留段落响度起伏 LRA）
set -euo pipefail
IN=${1:-../public/audio/mix_premaster.wav}
OUT=${2:-../public/audio/final_mix.wav}
LIM=${LIM:-0.80}   # ≈ -1.9 dBFS 采样限幅，AAC 编码后真峰值仍 ≤ -1.5 dBTP
cp "$IN" "$OUT.src.wav"
G=0
for i in 1 2 3 4 5 6; do
  ffmpeg -hide_banner -v error -y -i "$OUT.src.wav" -af "volume=${G}dB,aresample=192000,alimiter=limit=$LIM:attack=1:release=60:level=disabled,aresample=48000" -c:a pcm_s16le "$OUT"
  I=$(ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
  D=$(python3 -c "print(round(-14.0-($I),2))")
  python3 -c "import sys; sys.exit(0 if abs($D)>0.05 else 1)" || break
  G=$(python3 -c "print(round($G+$D,2))")
done
rm -f "$OUT.src.wav"
ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|LRA:|Peak:)" | tr -s ' '
