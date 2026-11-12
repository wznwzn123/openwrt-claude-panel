#!/usr/bin/env bash
# 两遍 loudnorm 线性归一：-14.0 LUFS 综合响度，真峰值 ≤ -1.0 dBTP，48 kHz
set -euo pipefail
IN=${1:-../public/audio/mix_premaster.wav}
OUT=${2:-../public/audio/final_mix.wav}
J=$(ffmpeg -hide_banner -nostats -i "$IN" -af "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
g(){ echo "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -hide_banner -v error -y -i "$IN" -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,alimiter=limit=0.84:attack=2:release=60:level=disabled" -ar 48000 -c:a pcm_s16le "$OUT"
ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|True peak:|Peak:)" -A0 | tr -s ' '
# 精修：补偿限幅造成的响度损失，锁定 -14.0 LUFS（真峰值留 ≥1 dB 余量）
for i in 1 2 3 4 5; do
  I=$(ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
  D=$(python3 -c "print(round(-14.0-($I),2))")
  python3 -c "import sys; sys.exit(0 if abs($D)>0.05 else 1)" || break
  ffmpeg -hide_banner -v error -y -i "$OUT" -af "volume=${D}dB,aresample=192000,alimiter=limit=0.86:attack=1:release=50:level=disabled,aresample=48000" -ar 48000 -c:a pcm_s16le "$OUT.tmp.wav" && mv "$OUT.tmp.wav" "$OUT"
done
ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tr -s ' '
