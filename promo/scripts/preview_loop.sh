#!/usr/bin/env bash
# 15 秒无声无缝循环预览（1280×720 · 30fps）：第二幕～第四幕精华段交叉溶接，循环点落在同一连续镜头中间
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=${1:-out/plate.mp4}; O=${2:-out/preview-loop-15s.mp4}
X=0.4
# 第八版：循环点放在同一个连续镜头中间（审片 C 级：原来尾段从第四幕溶回主视觉，仍像跳切）。
# 主视觉镜头 12.25–15.85s 一分为二：后半段 14.05–15.85 开场，前半段 12.25–14.05 收尾；
# 收尾最后一帧 = 14.05s 前一帧，循环回开场第一帧 14.05s，画面运动连续，接缝处没有转场。
# 时长：1.8 + 4.4 + 3.8 + 4.8 + 1.8 − 4×0.4 = 15.0s
segs=("14.05 1.8" "20.0 4.4" "36.7 3.8" "54.0 4.8" "12.25 1.8")
in=(); fc=""; i=0
for s in "${segs[@]}"; do set -- $s; in+=(-ss "$1" -t "$2" -i "$SRC"); fc+="[$i:v]fps=30,scale=1280:720:flags=lanczos,setpts=PTS-STARTPTS[v$i];"; i=$((i+1)); done
off=$(python3 -c "print(1.8-$X)"); fc+="[v0][v1]xfade=transition=fade:duration=$X:offset=$off[x1];"
off=$(python3 -c "print(1.8+4.4-2*$X)"); fc+="[x1][v2]xfade=transition=fade:duration=$X:offset=$off[x2];"
off=$(python3 -c "print(1.8+4.4+3.8-3*$X)"); fc+="[x2][v3]xfade=transition=fade:duration=$X:offset=$off[x3];"
off=$(python3 -c "print(1.8+4.4+3.8+4.8-4*$X)"); fc+="[x3][v4]xfade=transition=fade:duration=$X:offset=$off[x4];"
fc+="[x4]trim=duration=15,setpts=PTS-STARTPTS[o]"
ffmpeg -v error -y "${in[@]}" -filter_complex "$fc" -map "[o]" -an -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709" -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart "$O"
ffprobe -v error -count_frames -show_entries stream=width,height,r_frame_rate,nb_read_frames -show_entries format=duration -of default=nw=1 "$O"
