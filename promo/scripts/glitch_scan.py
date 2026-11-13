"""交付闸门（第八版）：逐帧差分找单帧故障：第 n 帧与前后帧都差得多，而前后两帧彼此很像（单帧「跳出去又跳回来」）。
按 16×16 网格算块差，取最大块差，能抓到局部的截图缺失或文字闪没。"""
import subprocess, sys, numpy as np
src, W, H = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
w, h = W // 8, H // 8
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
fr = []
while True:
    b = p.stdout.read(w * h)
    if len(b) < w * h: break
    fr.append(np.frombuffer(b, np.uint8).astype(np.float32).reshape(h, w))
G = 16
def blk(a, b):
    d = np.abs(a - b)
    hh, ww = (h // G) * G, (w // G) * G
    return d[:hh, :ww].reshape(hh // G, G, ww // G, G).mean(axis=(1, 3)).max()
out = []
for n in range(1, len(fr) - 1):
    a, c = blk(fr[n], fr[n - 1]), blk(fr[n], fr[n + 1])
    s = blk(fr[n - 1], fr[n + 1])
    if min(a, c) > 6 and min(a, c) > 3 * s + 2:
        out.append((n, round(float(min(a, c)), 1), round(float(s), 1)))
print('frames', len(fr))
for o in out: print(*o)
