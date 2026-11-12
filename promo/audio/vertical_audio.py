"""竖屏 60s 音频：人声/音效按 VCUTS 剪辑（15ms 淡接），配乐分三段长跨度拼接（80ms 交叉），重算 -5dB 闪避后两遍响度归一。"""
import numpy as np, soundfile as sf
SR = 48000
CUTS = [(0.0, 6.3), (8.9, 12.0), (12.0, 16.0), (21.2, 28.0), (31.0, 40.4), (40.6, 46.2), (54.0, 58.4), (61.3, 73.6), (81.9, 90.0)]
A = '../public/audio'
v, _ = sf.read(f'{A}/narration.wav', always_2d=True)
s, _ = sf.read(f'{A}/sfx.wav', always_2d=True)
b, _ = sf.read(f'{A}/bgm.wav', always_2d=True)
def cut(x, segs, fade=0.015):
    out = []
    for a, e in segs:
        seg = x[int(a * SR):int(e * SR)].copy()
        n = int(fade * SR)
        ramp = np.linspace(0, 1, n)[:, None]
        seg[:n] *= ramp; seg[-n:] *= ramp[::-1]
        out.append(seg)
    return np.vstack(out)
V = cut(v, CUTS); S = cut(s, CUTS)
N = int(60 * SR)
pad = lambda x: np.vstack([x, np.zeros((max(0, N - len(x)), 2))])[:N]
V = pad(V); S = pad(S)
# 配乐：A1 两段跟画面（保住 11.8s Sub Drop），之后源 12.0s 起连续，dst 51.9s 交叉进入终幕段
B = pad(cut(b, [(0.0, 6.3), (8.9, 12.0), (12.0, 12.0 + 42.5), (81.9, 90.0)], fade=0.08))
v_env = np.convolve(np.abs(V).mean(1), np.ones(960) / 960, 'same')
act = (v_env > 0.01).astype(float)
g = np.zeros(N); cur = 0
for i in range(0, N, 48):
    tgt = act[i]; c = np.exp(-48 / (0.04 * SR)) if tgt > cur else np.exp(-48 / (0.3 * SR))
    cur = tgt + (cur - tgt) * c; g[i:i + 48] = cur
duck = 10 ** (-5 * g / 20)
V = V / np.max(np.abs(V)) * 0.9
mix = V + B * duck[:, None] * 0.26 + S * 0.36
sf.write(f'{A}/vertical_premaster.wav', mix.astype(np.float32), SR)
print(len(mix) / SR)
