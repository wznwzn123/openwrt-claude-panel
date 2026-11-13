"""竖屏 60s 音频：人声/音效按 VCUTS 剪辑（15ms 淡接），配乐分三段长跨度拼接（80ms 交叉），重算 -5dB 闪避后两遍响度归一。"""
import numpy as np, soundfile as sf
SR = 48000
CUTS = [(0 / 30, 234 / 30), (323 / 30, 524 / 30), (1050 / 30, 1283 / 30), (1518 / 30, 1763 / 30), (1769 / 30, 2203 / 30), (2229 / 30, 2682 / 30)]
A = '../public/audio'
v, _ = sf.read(f'{A}/stem_voice.wav', always_2d=True)
s, _ = sf.read(f'{A}/stem_sfx.wav', always_2d=True)
b, _ = sf.read(f'{A}/stem_bgm.wav', always_2d=True)
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
# 配乐（第七版）：钩子跟画面；10.77s 起连续（保住 11.8s Sub Drop）；钩子问句处跳到 50.87s 连续穿过第四幕；最后交叉进入终幕段
B = pad(cut(b, [(0.0, 234 / 30), (323 / 30, 323 / 30 + (668 - 234) / 30), (1518 / 30, 1518 / 30 + (1347 - 668) / 30), (2229 / 30, 2682 / 30)], fade=0.08))
B[-int(0.6 * SR):] *= np.linspace(1, 0, int(0.6 * SR))[:, None] ** 1.5   # 结尾和弦 0.6s 收尽
v_env = np.convolve(np.abs(V).mean(1), np.ones(960) / 960, 'same')
act = (v_env > 0.01).astype(float)
g = np.zeros(N); cur = 0
for i in range(0, N, 48):
    tgt = act[i]; c = np.exp(-48 / (0.04 * SR)) if tgt > cur else np.exp(-48 / (0.3 * SR))
    cur = tgt + (cur - tgt) * c; g[i:i + 48] = cur
duck = 10 ** (-5 * g / 20)
mix = V + B * duck[:, None] + S
sf.write(f'{A}/vertical_premaster.wav', mix.astype(np.float32), SR)
print(len(mix) / SR)
