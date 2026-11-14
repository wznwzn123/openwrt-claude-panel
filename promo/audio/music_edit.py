"""第十版配乐：用两首商用授权曲（Pixabay Content License，可商用、免署名）按小节剪成贴合画面的版本。
- 主片（90s）：MiroMaxMusic「Technology Synthpop No Copyright」，105 BPM，升 C 小调
- 竖屏（60s）：Sub_Clair「Technology」（Future Bass），125 BPM，升 F 小调
节拍网格由恒速拟合得到（拍长、首个强拍），所有接点落在小节线 / 拍点上，30ms 等功率交叉淡化。
0–11.8s（竖屏 0–8.83s）保留原来合成的暗场开场，由 synth.py / vertical_audio.py 拼接。
输出：public/audio/music/main_edit.wav（90s）、vertical_edit.wav（60s），48kHz 立体声，开场前为静音。"""
import subprocess, numpy as np, soundfile as sf
SR = 48000
M = '../public/audio/music'

def load(name, tempo=1.0):
    af = f'aresample={SR}' + (f',atempo={tempo:.6f}' if tempo != 1.0 else '') + ',equalizer=f=2500:t=q:w=1.0:g=-3'   # 人声频段让位 3dB
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{M}/{name}', '-af', af, '-ac', '2', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)

def splice(x, segs, total, xf=0.03, tail_fade=0.0):
    """segs: [(目标起点 s, 源起点 s, 源终点 s)]；相邻段在接点处做等功率交叉淡化"""
    out = np.zeros((int(total * SR), 2)); n = int(xf * SR)
    for i, (d, a, b) in enumerate(segs):
        pre = n if i else int(0.01 * SR)
        s0, s1 = int(a * SR) - pre, int(b * SR) + (n if i < len(segs) - 1 else 0)
        seg = x[max(0, s0):s1].copy()
        if s0 < 0: seg = np.vstack([np.zeros((-s0, 2)), seg])
        w = np.ones(len(seg))
        w[:pre] = np.sin(np.linspace(0, np.pi / 2, pre)) ** 2 if i else np.linspace(0, 1, pre)
        if i < len(segs) - 1: w[-n:] = np.cos(np.linspace(0, np.pi / 2, n)) ** 2
        o = int(d * SR) - pre
        L = min(len(seg), len(out) - o)
        out[o:o + L] += (seg * w[:, None])[:L]
    if tail_fade:
        k = int(tail_fade * SR); out[-k:] *= np.linspace(1, 0, k)[:, None] ** 1.5
    return out

# ── 主片：第一首。整体加快 0.209%，使 11.8→54.0s 恰为 74 拍（16 小节 + 间奏 10 拍）
BEAT1, BAR0_1 = 0.57146, 1.492
R1 = 0.57146 / (42.2 / 74)                     # = 1.00209
b1 = lambda bar, beat=0: (BAR0_1 + (bar * 4 + beat) * BEAT1) / R1   # 加速后的源时间
x1 = load('track1_synthpop.mp3', R1)
bf = 4 * BEAT1 / R1                              # 加速后小节长
segs1 = [
    (11.8,              b1(0),      b1(16)),     # 产品登场：从第 0 小节进入，连续 16 小节
    (11.8 + 16 * bf,    b1(25, 2),  b1(28)),     # 48.3s：间奏后 10 拍（第三幕说完的留白 +「连点都不想点？」）
    (54.0,              b1(28),     b1(41)),     # 54.0s：AI 段 = 间奏后满能量回归的第一拍，连续 13 小节
    (54.0 + 13 * bf,    b1(48),     b1(48) + 90),  # 83.7s：接原曲收尾段，配合落版与口号
]
main = splice(x1, segs1, 90.0, tail_fade=2.2)
sf.write(f'{M}/main_edit.wav', main.astype(np.float32), SR)
print('主片接点（片中秒 ← 原曲秒）：', [(round(d, 3), round(a * R1, 3)) for d, a, _ in segs1])

# ── 竖屏：第四首（不变速）
BEAT4, BAR0_4 = 0.48005, 1.020
b4 = lambda bar, beat=0: BAR0_4 + (bar * 4 + beat) * BEAT4
x4 = load('track4_futurebass.mp3')
bar4 = 4 * BEAT4
d_prod = 7.8 + (11.8 - 323 / 30)                 # 8.833s：产品登场（主片 11.8s 在竖屏的位置）
segs4 = [
    (d_prod,                   b4(16),     b4(23)),          # 第一次高潮 7 小节
    (d_prod + 7 * bar4,        b4(46, 1),  b4(48)),          # 渐强最后 7 拍（「连点都不想点？」）
    (d_prod + 7 * bar4 + 7 * BEAT4, b4(48), b4(56)),         # AI 段 = 第二次高潮第一拍
    (d_prod + 7 * bar4 + 7 * BEAT4 + 8 * bar4, b4(54), b4(56)),  # 高潮最后 2 小节再走一遍，把收尾段对齐看门狗段落
    (d_prod + 7 * bar4 + 7 * BEAT4 + 10 * bar4, b4(56), b4(64) + 1),  # 收尾段，原曲在片尾自然结束
]
vert = splice(x4, segs4, 60.0, tail_fade=0.6)
sf.write(f'{M}/vertical_edit.wav', vert.astype(np.float32), SR)
print('竖屏接点（片中秒 ← 原曲秒）：', [(round(d, 3), round(a, 3)) for d, a, _ in segs4])
