"""OpenWrt Claude Panel 90s 宣传片 · 离线声音工程（确定性合成，零外部素材）

输出（public/audio/）：
  bgm.wav        配乐：0–12s 95 BPM 暗夜低频脉冲 → 11.8s Sub Drop → 12–90s 116 BPM 极简科技电子（54s / 82s 两次推高）
  sfx.wav        全部交互音效按 cue 表落位（cues.json 同步输出，供剪映/工作台拆轨）
  mix.wav        人声 + 配乐（-5 dB sidechain 闪避）+ 音效，两遍 loudnorm 到 -14 LUFS / TP ≤ -1 dBTP 在 master.sh 里做
"""
import json, os
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
# 可选：USE_MUSIC=1 时用商用授权曲（audio/music_edit.py 剪辑）作为 11.8s 之后的配乐
MUSIC = '../public/audio/music/main_edit.wav' if os.environ.get('USE_MUSIC') else None   # 默认合成配乐（第九版成片）；USE_MUSIC=1 使用授权曲
DUR = 90.0
N = int(SR * DUR)
rng = np.random.default_rng(20261112)
OUT = '../public/audio'


def t_(d):
    return np.arange(int(SR * d)) / SR


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def place(buf, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    if sig.ndim == 1:
        sig = np.stack([sig, sig], 1)
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def pan(sig, p):
    l = np.cos((p + 1) * np.pi / 4)
    r = np.sin((p + 1) * np.pi / 4)
    return np.stack([sig * l, sig * r], 1)


def ir(dur=2.2, decay=3.2, seed=1):
    r = np.random.default_rng(seed)
    t = t_(dur)
    env = np.exp(-t * decay)
    left = r.standard_normal(len(t)) * env
    right = r.standard_normal(len(t)) * env
    left = lp(left, 6500)
    right = lp(right, 6500)
    return np.stack([left, right], 1) / np.sqrt(np.sum(env ** 2))


IR = ir()


def reverb(st, wet=0.25):
    out = np.zeros((len(st) + len(IR) - 1, 2))
    for c in range(2):
        out[:, c] = fftconvolve(st[:, c], IR[:, c])
    out[: len(st)] = out[: len(st)] * wet + st * 1.0
    return out[: len(st)]


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ───────────────────────────── 乐器 ─────────────────────────────
def kick(d=0.45, f0=120, f1=42, drive=1.6):
    t = t_(d)
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 7.5)
    x += 0.15 * np.exp(-t * 300) * rng.standard_normal(len(t))
    return np.tanh(x * drive) * 0.9


def hat(d=0.07, bright=9000):
    t = t_(d)
    return hp(rng.standard_normal(len(t)), bright) * np.exp(-t * 70) * 0.35


def pluck(f, d=0.9, bright=1.0):
    t = t_(d)
    x = np.zeros_like(t)
    for h in range(1, 10):
        x += np.sin(2 * np.pi * f * h * t + h * 0.3) * np.exp(-t * (4 + h * 2.2 / bright)) / h ** 1.1
    att = np.minimum(1, t / 0.004)
    return x * att * 0.35


def pad(freqs, d, att=1.2, rel=1.5, bright=8):
    t = t_(d)
    x = np.zeros((len(t), 2))
    for f in freqs:
        for k, det in enumerate((-0.11, 0.0, 0.12)):
            ff = f * 2 ** (det / 12)
            s = np.zeros_like(t)
            for h in range(1, bright):
                s += np.sin(2 * np.pi * ff * h * t + k * 1.7 + h) / h
            p = [-0.6, 0.0, 0.6][k]
            x += pan(s, p)
    env = np.minimum(1, t / att) * np.minimum(1, (d - t) / rel)
    env = np.clip(env, 0, 1)
    x *= env[:, None]
    x[:, 0] = lp(x[:, 0], 2200)
    x[:, 1] = lp(x[:, 1], 2200)
    return x * 0.045 / max(1, len(freqs) ** 0.5)


def sub_drop(d=2.2, f0=95, f1=26):
    t = t_(d)
    f = f1 + (f0 - f1) * np.exp(-t * 2.6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 1.5)
    x = np.tanh(x * 2.2)
    x += 0.4 * np.exp(-t * 40) * lp(rng.standard_normal(len(t)), 300)
    return x * 0.95


def riser(d=2.0, f0=300, f1=5000):
    t = t_(d)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    seg = int(SR * 0.05)
    for i in range(0, len(t), seg):
        k = i / len(t)
        fc = f0 * (f1 / f0) ** k
        out[i:i + seg] = bp(n[i:i + seg + 2000], fc * 0.7, min(fc * 1.4, 20000))[: len(out[i:i + seg])]
    return out * (t / d) ** 2 * 0.5


# ───────────────────────────── 配乐 ─────────────────────────────
bgm = np.zeros((N, 2))

# 0–12s：95 BPM 暗夜低频脉冲（8 分音符 41Hz 脉冲 + 低滤波锯齿 drone + 微弱滴答）
b95 = 60 / 95
k = 0
tt = 0.0
while tt < 11.8:
    t = t_(0.28)
    p = np.sin(2 * np.pi * 41.2 * t) * np.exp(-t * 9) * (0.55 if k % 2 == 0 else 0.32)
    place(bgm, p, tt, 0.9)
    if k % 2 == 1:
        place(bgm, pan(hat(0.05, 7000), 0.4), tt, 0.25)
    tt += b95 / 2
    k += 1
drone_t = t_(12.0)
drone = sum(np.sin(2 * np.pi * f * drone_t + i) / (i + 1) for i, f in enumerate([55, 110.3, 164.6, 220.8]))
drone = lp(drone, 380) * np.minimum(1, drone_t / 1.0) * np.minimum(1, (12 - drone_t) / 0.4) * 0.16
# 3–5.75s 震颤加剧：drone 加上高频不安的颤音
trem = 1 + 0.6 * np.clip((drone_t - 3) / 2.75, 0, 1) * np.sin(2 * np.pi * (6 + 14 * np.clip((drone_t - 3) / 2.75, 0, 1)) * drone_t)
place(bgm, pan(drone * trem, 0), 0, 1.0)
# 第六版：0.4–11.8s 加一层中频暗色铺底（A3/C4/E4，低通 2.2kHz），手机外放也能听见情绪托底（审片 A4）
pad1 = pad([mtof(n) for n in (57, 60, 64)], 11.4, att=1.6, rel=1.2, bright=6)
pad1 = np.stack([lp(pad1[:, 0], 2200), lp(pad1[:, 1], 2200)], axis=1)
place(bgm, pad1, 0.4, 0.55)
place(bgm, riser(2.6, 200, 3500), 3.15, 0.35)
place(bgm, riser(1.4, 400, 7000), 10.4, 0.45)

# 12–90s：116 BPM 极简科技电子，A 小调 i–VI–III–VII
BPM = 116
beat = 60 / BPM
bar = beat * 4
T0 = 12.0
# 第五幕整体提前一小节（与 src/lib/core.tsx 的 SHIFT5 同源；画面取 124 帧，差 2ms 可忽略）
S5 = 0.0   # 第六版改回 0（第五版为一小节）
CAD = T0 + 36 * bar          # 86.48s：终止式小节（属 → 主）
HIT = CAD + 2 * beat          # 87.52s：主和弦落定，此后只留和弦长尾 + logo 定格
prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]  # Am F C G
arp = [0, 2, 1, 2, 0, 2, 1, 3]
nbars = int((DUR - T0) / bar) + 1
for b in range(nbars):
    bs = T0 + b * bar
    if bs >= DUR or bs >= CAD - 0.01:
        break
    root, chord = prog[(b // 2) % 4]
    energy = 1 if bs < 28 else 2 if bs < 54 else 3 if bs < 82 - S5 else 4
    # pad（每两小节一铺）
    if b % 2 == 0 and bs < 88:
        dd = min(bar * 2 + 1.2, DUR - bs)
        pv = pad([mtof(n) for n in chord], dd, att=0.9, rel=1.4, bright=10)
        place(bgm, pv, bs, 1.0 if energy < 3 else 1.35)
        # 54s 起：琥珀暖色高八度铺底
        if energy >= 3:
            place(bgm, pad([mtof(chord[-1] + 12), mtof(chord[0] + 24)], dd, att=1.5, rel=1.4, bright=5), bs, 0.9)
    # bass（每拍 8 分）
    if energy >= 1:
        for i in range(8):
            if energy == 1 and i % 2:
                continue
            t = t_(beat / 2 * 0.95)
            f = mtof(root - 12)
            bs_sig = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t * 5)
            place(bgm, bs_sig, bs + i * beat / 2, 0.22)
    # kick
    if energy >= 1:
        for i in range(4):
            if energy == 1 and i % 2:
                continue
            place(bgm, kick(), bs + i * beat, 0.42 if energy < 3 else 0.5)
    # hats
    if energy >= 2:
        for i in range(8):
            g = 0.18 if i % 2 else 0.09
            place(bgm, pan(hat(), 0.3 if i % 2 else -0.3), bs + i * beat / 2, g)
    # clap / snare on 2 & 4 from energy 3
    if energy >= 3:
        for i in (1, 3):
            t = t_(0.18)
            cl = bp(rng.standard_normal(len(t)), 900, 4000) * np.exp(-t * 26)
            place(bgm, pan(cl, 0.1), bs + i * beat, 0.16)
    # pluck arpeggio（16 分 → 8 分，清透拨弦）
    if energy >= 1 and bs < 88.5:
        step = beat / 2 if energy < 3 else beat / 4
        nsteps = int(bar / step)
        for i in range(nsteps):
            idx = arp[i % 8] % 3
            n = chord[idx] + 12 + (12 if (i % 8 == 3 and energy >= 3) else 0)
            pp = (i % 4 - 1.5) / 2
            place(bgm, pan(pluck(mtof(n), 0.7, 1.2 if energy >= 3 else 1.25), pp), bs + i * step, 0.78 if energy < 3 else 0.38)

# 54s Claude 登场 & 82s 终幕：riser → impact
place(bgm, riser(2.2, 300, 6000), 51.8, 0.4)
place(bgm, riser(2.3, 300, 8000), 84.414 - S5 - 2.3, 0.45)
place(bgm, sub_drop(2.5, 90, 28), 84.414 - S5, 0.4)
# 终幕铺底：Am(add9) 到终止式小节前收住，让位给属和弦
place(bgm, pad([mtof(n) for n in (45, 57, 60, 64, 71)], CAD - (84.414 - S5) + 0.2, att=0.3, rel=1.2, bright=6), 84.414 - S5, 1.6)

# 终止式：半小节属和弦 E（鼓组照走）→ 87.52s 主和弦 Am 一记落定（kick + sub + 拨弦和弦 + 高光），之后无节奏、和弦自然延音到片尾
E_CH = [52, 56, 59]
place(bgm, pad([mtof(n) for n in (40, 52, 56, 59, 64)], 2 * beat + 0.3, att=0.08, rel=0.5, bright=7), CAD, 1.5)
for i in range(4):
    t = t_(beat / 2 * 0.95)
    f = mtof(40)
    place(bgm, (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t * 5), CAD + i * beat / 2, 0.22)
for i in range(2):
    place(bgm, kick(), CAD + i * beat, 0.5)
for i in range(4):
    place(bgm, pan(hat(), 0.3 if i % 2 else -0.3), CAD + i * beat / 2, 0.18 if i % 2 else 0.09)
for i in range(8):   # 16 分拨弦上行，把耳朵推向主和弦
    n = [52, 56, 59, 64, 68, 71, 76, 80][i]
    place(bgm, pan(pluck(mtof(n), 0.6, 1.2), (i % 4 - 1.5) / 2), CAD + i * beat / 4, 0.36)
place(bgm, kick(0.6, 140, 42, 2.2), HIT, 0.6)
place(bgm, pan(pluck(mtof(69), 2.6, 0.9), 0.0), HIT + 0.02, 0.55)   # 终止单音（A4）延音
place(bgm, sub_drop(2.2, 110, 30), HIT, 0.45)
place(bgm, pad([mtof(n) for n in (33, 45, 57, 60, 64, 71, 76)], DUR - HIT, att=0.02, rel=1.6, bright=7), HIT, 1.9)
for i, n in enumerate((69, 72, 76, 81)):
    place(bgm, pan(pluck(mtof(n), 2.4, 1.1), (i - 1.5) / 3), HIT + i * 0.012, 0.42)
t_hs = t_(2.4)
place(bgm, pan(sum(np.sin(2 * np.pi * f * t_hs + i) * np.exp(-t_hs * 1.6) for i, f in enumerate((1760, 2637, 3520))) * 0.05, -0.2), HIT, 1.0)

# 主骨：两次 Sub Drop
place(bgm, sub_drop(), 5.75, 0.5)
place(bgm, sub_drop(2.4, 100, 24), 11.8, 0.6)

# 能量曲线：54s Claude 登场 +3 dB，82.4s 终幕起再 +1 dB；58.03 双屏落定、85.45 字标成形各一记 impact
tt_ = np.arange(N) / SR
def seg_env(points):
    xs = [p[0] for p in points]; ys = [10 ** (p[1] / 20) for p in points]
    return np.interp(tt_, xs, ys)
# 铺垫段 0–11s、30–50s 压低 3 dB；54s 高潮与 82s 落版大幅抬升
DYN = [(0, -8), (5.6, -6), (6.0, -3), (11.0, -3), (11.8, 2), (28.5, 2), (30.0, -1.5), (49.0, -1.5), (49.8, -7), (52.2, -5), (53.6, 2), (54.2, 1.5), (73.6 - S5, 1.5), (74.2 - S5, -3), (81.6 - S5, -3), (82.6 - S5, 2.5), (HIT + 0.3, 4), (DUR, 0)]   # 第六版：4/5 幕降约 5 dB 给人声（审片 A4）
env = seg_env(DYN)
bgm *= env[:, None]
# 合成器主旋律（A 小调，8 分音符动机，轻颤音的锯齿 lead）
def lead(f, d):
    t = t_(d)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.15, 0, 1)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    x = sum(np.sin(h * ph) / h for h in range(1, 9))
    env_ = np.minimum(1, t / 0.01) * np.exp(-t * 2.2)
    return lp(x * env_, 4200) * 0.12
MOTIF = [69, 72, 76, 74, 72, 69, 67, 69, 72, 74, 76, 79, 76, 74, 72, 74]
for sec0, sec1, gain in ((54.0, 73.6 - S5, 1.0), (82.4 - S5, CAD, 1.25)):
    n = 0
    tq = sec0
    while tq < sec1:
        m = MOTIF[n % len(MOTIF)] + (0 if sec0 < 80 else 12 if n % 8 == 7 else 0)
        place(bgm, pan(lead(mtof(m), beat / 2 * 1.6), 0.15 * (1 if n % 2 else -1)), tq, gain)
        tq += beat / 2
        n += 1
# 第六版：第二幕、第三幕中段加一条稀疏的四分音符轻旋律（隔拍出音，低于第四幕主旋律），减少循环的单调感
for sec0, sec1, gain in ((16.55, 27.4, 0.42), (38.4, 49.2, 0.36)):
    n = 0
    tq = sec0
    while tq < sec1:
        if n % 2 == 0 or n % 8 == 5:
            place(bgm, pan(lead(mtof(MOTIF[(n // 2) % len(MOTIF)] - 12), beat * 1.2), -0.25 if n % 4 < 2 else 0.25), tq, gain)
        tq += beat
        n += 1
# 低频重击（Sub Impact）
for at, g in ((54.0, 0.55), (82.4 - S5, 0.45)):
    place(bgm, sub_drop(1.6, 120, 32), at, g)
place(bgm, sub_drop(1.4, 110, 40), 58.034, 0.35)
place(bgm, kick(0.5, 140, 45, 2.2), 58.034, 0.5)
place(bgm, sub_drop(1.8, 110, 34), 85.448 - S5, 0.35)
place(bgm, kick(0.5, 140, 45, 2.2), 85.448 - S5, 0.45)
t_sh = t_(1.6)
shimmer = sum(np.sin(2 * np.pi * f * t_sh + i) * np.exp(-t_sh * 2.2) for i, f in enumerate((2637, 3136, 3520, 4186))) * 0.05
place(bgm, pan(shimmer, 0.2), 85.448 - S5, 1.0)
bgm = reverb(bgm, 0.22)
fade = np.ones(N)
fade[-int(SR * 2.2):] = np.linspace(1, 0, int(SR * 2.2)) ** 1.3   # 第六版：和弦长尾淡出拉长到 2.2s（审片 B9）
bgm *= fade[:, None]
bgm /= np.percentile(np.abs(bgm), 99.7) + 1e-9
bgm = np.tanh(bgm * 0.8) * 0.85
if MUSIC:
    # 0–11.8s 保留合成的暗场开场（痛点段），11.8s 起换成剪好的授权曲；新曲 12–90s 的均方根对齐原合成配乐，人声与音乐比例不变
    mus, msr = sf.read(MUSIC, always_2d=True); assert msr == SR
    mus = np.vstack([mus, np.zeros((max(0, N - len(mus)), 2))])[:N]
    tt_ = np.arange(N) / SR
    keep = np.clip((12.1 - tt_) / 0.3, 0, 1)[:, None]          # 合成开场在 11.8–12.1s 淡出（保住 11.8s 的下沉尾音）
    sel = tt_ >= 12.5
    mus *= np.sqrt(np.mean(bgm[sel] ** 2)) / (np.sqrt(np.mean(mus[sel] ** 2)) + 1e-12)
    bgm = bgm * keep + mus
    imp = np.zeros_like(bgm)
    place(imp, sub_drop(1.6, 120, 32), 54.0, 0.55)              # AI 段登场重击（与新曲满能量回归同拍）
    place(imp, sub_drop(2.5, 90, 28), 84.414, 0.4)              # 回车 → 徽标
    bgm += imp * np.percentile(np.abs(mus[sel]), 99.7) / (np.percentile(np.abs(imp), 99.9) + 1e-9) * 0.5

# ───────────────────────────── 音效 ─────────────────────────────
def whoosh(d=0.7, lo=300, hi=4000):
    t = t_(d)
    n = rng.standard_normal(len(t))
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6
    x = bp(n, lo, hi) * env
    return pan(x, 0) * 0.5


def glass_tap(f=2400):
    t = t_(0.5)
    x = sum(np.sin(2 * np.pi * f * r * t) * np.exp(-t * (18 + 8 * i)) / (i + 1) for i, r in enumerate((1, 2.76, 5.4)))
    x += 0.3 * hp(rng.standard_normal(len(t)), 5000) * np.exp(-t * 300)
    return x * 0.35


def click():
    t = t_(0.05)
    return (hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 400) + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 200)) * 0.4


SCALE_PC = (9, 11, 1, 4, 6, 8)   # A B C# E F# G#：升 C 小调与升 F 小调共有的音
def snap(f):
    if not MUSIC: return f
    m = 69 + 12 * np.log2(f / 440); cands = [n for n in range(int(m) - 3, int(m) + 4) if n % 12 in SCALE_PC]
    return 440 * 2 ** ((min(cands, key=lambda n: abs(n - m)) - 69) / 12)


def chime(f1=880, f2=1318.5):
    f1, f2 = snap(f1), snap(f2)
    t = t_(1.4)
    a = sum(np.sin(2 * np.pi * f1 * h * t) * np.exp(-t * (3 + h)) / h for h in (1, 2, 3))
    b = np.zeros_like(t)
    off = int(0.11 * SR)
    b[off:] = sum(np.sin(2 * np.pi * f2 * h * t[: len(t) - off]) * np.exp(-t[: len(t) - off] * (3 + h)) / h for h in (1, 2, 3))
    return (a + b) * 0.22


def sonar(f=1250):
    t = t_(1.0)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 6) * np.minimum(1, t / 0.003) * 0.3


def key(mech=True):
    t = t_(0.06)
    x = hp(rng.standard_normal(len(t)), 1800 if mech else 3000) * np.exp(-t * (250 if mech else 400))
    x += np.sin(2 * np.pi * (380 if mech else 900) * t) * np.exp(-t * 120) * 0.4
    return x * (0.32 if mech else 0.16)


def shutter():
    t = t_(0.35)
    x = hp(rng.standard_normal(len(t)), 1200) * (np.exp(-t * 90) + 0.6 * np.exp(-np.maximum(0, t - 0.06) * 80) * (t > 0.06))
    x += 0.5 * np.sin(2 * np.pi * 5200 * t) * np.exp(-t * 60)  # 闪光灯充电余音
    return x * 0.5


def thump():
    return kick(0.3, 90, 50, 1.2) * 0.6


def glitch(d):
    t = t_(d)
    x = rng.standard_normal(len(t))
    gate = (np.sin(2 * np.pi * (8 + 60 * t / d) * t) > 0).astype(float)
    return bp(x, 1500, 9000) * gate * (t / d) ** 1.5 * 0.35


sfx = np.zeros((N, 2))
cues = []


def cue(name, at, sig, gain, p=0.0):
    # 第三幕 34.5s 之后的画面事件整体提前 4.5 拍（与 Act3.SHIFT3 同源），音效跟随
    if 34.5 <= at < 54.0 and name not in ('claude-enter',):
        at = round(at - 2.069, 3)
    if at >= 73.0:   # 第五幕（含 73.5s 擦除转场）整体提前一小节
        at = round(at - S5, 3)
    if sig.ndim == 1:
        sig = pan(sig, p)
    place(sfx, sig, at, gain)
    cues.append({'t': round(at, 3), 'name': name, 'gain': gain})


# 第一幕
cue('flash-cut', 0.0, shutter(), 0.9)
cue('paparazzi-flash', 1.0, shutter(), 0.9)
cue('paparazzi-flash', 1.9, shutter(), 0.9)
cue('monitor-cut', 3.0, click(), 0.8)
cue('rgb-glitch', 3.4, glitch(2.35), 0.6)
cue('collapse-whoosh', 5.05, whoosh(0.7, 200, 3000), 0.8)
cue('word-reveal', 6.0, whoosh(0.9, 150, 1500), 0.5)
cue('rush-whoosh', 10.3, whoosh(1.5, 300, 7000), 0.9)
# 第二幕
cue('spotlight-sweep', 11.8, whoosh(1.6, 500, 6000), 0.55)
cue('phone-land', 12.2, glass_tap(1800), 0.5)
cue('ripple-crt', 16.435, click(), 0.6)
cue('ripple', 16.655, whoosh(0.7, 800, 9000), 0.45)
cue('ripple-crt', 18.504, click(), 0.6)
cue('ripple', 18.724, whoosh(0.7, 800, 9000), 0.45)
cue('slide', 19.759 - 0.4, whoosh(0.8, 250, 3000), 0.6)
for i, at in enumerate((20.276, 21.31, 23.379)):
    cue('plate-pop', at, glass_tap(2000 + i * 300), 0.6, -0.4)
cue('act-out', 27.5, whoosh(0.6, 400, 5000), 0.5)
# 第三幕
for i, at in enumerate((28.05, 28.21, 28.37)):
    cue('stack-thump', at + 0.22, thump(), 0.7)
cue('fan-out', 29.069 - 0.3, whoosh(0.6, 300, 4000), 0.5)
for i, at in enumerate((31.6, 32.0, 32.4, 32.8, 33.2, 33.6)):
    cue('plugin-detect', at, glass_tap(2600 + i * 120), 0.22)
cue('tap', 37.15, click(), 0.8)
cue('push-in', 36.8, whoosh(0.6, 200, 2500), 0.35)
for i, at in enumerate((37.85, 37.97, 38.09)):
    if i == 0: cue('latency-lock', at, glass_tap(3200), 0.3)
cue('node-fail', 38.7, sonar(620), 0.45)
cue('auto-switch', 39.35, chime(1046.5, 1568), 0.6)
cue('seg-b', 40.448 - 0.35, whoosh(0.7, 300, 4000), 0.5)
cue('bar-shoot', 41.58, riser(0.42, 400, 3000), 0.6)
cue('ceiling-crack', 42.0, kick(0.35, 160, 60, 2.0), 0.55)
cue('axis-rescale', 42.26, whoosh(0.35, 1000, 8000), 0.5)
cue('toggle', 44.586, click(), 0.85)
cue('lock', 44.78, glass_tap(1500), 0.45)
cue('seg-c', 46.138 - 0.35, whoosh(0.7, 300, 4000), 0.5)
SEG_C = 46.138
cue('share-tap', SEG_C + 1.05, click(), 0.7)
cue('icon-pop', SEG_C + 1.7, glass_tap(2200), 0.45)
cue('icon-tap', SEG_C + 2.3, click(), 0.7)
cue('fingerprint', SEG_C + 3.25, sonar(1500), 0.3)
cue('unlock', SEG_C + 4.05, chime(1318.5, 1760), 0.45)
cue('paste-tap', SEG_C + 0.35, click(), 0.6, 0.5)                  # 安卓客户端：粘贴登录地址
cue('add-tap', SEG_C + 1.0, click(), 0.6, 0.5)                     # 添加 → 打开该路由器面板
cue('panel-open', SEG_C + 1.12, whoosh(0.45, 600, 5000), 0.35, 0.5)
cue('router-added', SEG_C + 2.35, glass_tap(2400), 0.35, 0.5)      # 返回列表：新路由器已加入
cue('router-switch', 51.25, click(), 0.7, 0.5)
# 第四幕
cue('claude-enter', 54.0, whoosh(1.6, 200, 3000), 0.6)
cue('converge', 57.517 - 0.3, whoosh(0.6, 400, 6000), 0.6)
cue('console', 58.034, glass_tap(1600), 0.5)
cue('greeting', 58.7, chime(659.3, 987.8), 0.4)
CHAR = json.load(open('../src/act4.json'))['char']
# 三条指令锁定旁白关键词：状态响应 = toolAt + 0.15（63.76 / 65.15 / 66.55）
ACT4 = json.load(open('../src/act4.json'))   # 与画面同源：由 voice/act4_sync.py 从字级时间戳推导
for c4 in ACT4['cmds']:
    text, t0, send, tool_at, reply = c4['text'], c4['t0'], c4['send'], c4['toolAt'], c4['replyAt']
    for i in range(0, len(text), 2):   # 第六版：隔字一响、减量（审片：音效过密显得碎）
        place(sfx, pan(key(False), 0), t0 + i * CHAR, 0.38)
    cues.append({'t': t0, 'name': 'dictation-typing', 'gain': 0.6})
    cue('send', send, glass_tap(1900), 0.55)
    if c4 is ACT4['cmds'][0]:   # 第六版：只有第一条指令保留光束与冲击，后两条只留发送与回复（审片 B8）
        cue('amber-beam', tool_at - 0.25, riser(0.37, 800, 6000), 0.5, 0.3)   # 琥珀光束跨屏
        cue('core-impact', tool_at + 0.12, glass_tap(2600), 0.6, 0.4)
        place(sfx, pan(kick(0.35, 150, 60, 1.8), 0.4), tool_at + 0.12, 0.45)
    cue('claude-reply', reply, chime(), 0.5)
for c4 in ACT4['cmds']:
    cue('thinking', c4['think'], glass_tap(1300) * 0.5, 0.25, -0.2)
    for tl in c4.get('tools', [])[:-1]:            # 最后一个工具已有琥珀光束 + 冲击
        cue('tool-chip', tl['at'], glass_tap(2900), 0.35, -0.2)
    if c4.get('confirm'):
        cue('confirm-ask', c4['confirm']['ask'], chime(784, 987.8), 0.4, -0.2)
        cue('confirm-ok', c4['confirm']['ok'], click(), 0.75, -0.2)
s1_, s2_, s3_ = [c['state'] for c in ACT4['cmds']]
cue('hero-pulse', s1_, sub_drop(1.2, 140, 40), 0.55)            # 动作①：全屏脉冲波纹 + 核心点亮
cue('flip-reorder', s2_ + 0.02, whoosh(0.45, 1200, 8000), 0.4, 0.4)  # 动作②：3D 翻转重排
cue('uci-backup', ACT4['rollback'] + 0.12, chime(784, 1174.7), 0.45)
cue('scanline-wipe', 73.75 - 0.25, whoosh(0.9, 400, 7000), 0.75)   # 74.0s 扫描线横扫擦除
# 终幕
cue('scan-sweep', 74.4, riser(3.2, 600, 2500) * 0.6, 0.35)
for i, y1 in enumerate((224, 224, 268, 268)):
    ft = 74.4 + 3.2 * (y1 + 20) / 820 + i * 0.08
    cue('sonar-lock', ft, sonar(1200 + i * 110), 0.5, 0.3)
cue('wechat-notice', 76.6, chime(987.8, 1318.5), 0.55, 0.5)
cue('wechat-notice', 79.25, chime(987.8, 1318.5), 0.55, 0.5)
cue('hud-to-aurora', 81.828 - 0.4, whoosh(0.8, 300, 6000), 0.55)
for i in range(int(1.25 / 0.03)):
    place(sfx, pan(key(True), 0.1), 82.35 - S5 + i * 0.03, 0.45)
cues.append({'t': round(82.35 - S5, 3), 'name': 'terminal-typing', 'gain': 0.45})
cue('enter', 84.414, key(True) * 2.0, 1.0)
cue('collapse', 84.434, riser(0.32, 3000, 9000), 0.5)            # 终端向内折叠
cue('core-burst', 84.754, chime(1760, 2637) * 1.2, 0.55)           # 光核爆发出徽标
cue('converge-flash', 85.448, chime(1760, 2637) * 1.2, 0.55)
for i, at in enumerate((85.448 + 0.083, 85.707 + 0.083, 85.966 + 0.083)):  # 弹簧落定比起跳晚约 5 帧
    cue('assemble-drop', at, glass_tap(1400 + i * 350), 0.6)
cue('brand-sparkle', 86.224, chime(1760, 2637), 0.35)
sfx = reverb(sfx, 0.12)

sf.write(f'{OUT}/bgm.wav', bgm.astype(np.float32), SR)
sf.write(f'{OUT}/sfx.wav', sfx.astype(np.float32), SR)
json.dump(cues, open(f'{OUT}/cues.json', 'w'), ensure_ascii=False, indent=1)

# ───────────────────────────── 混音（-5 dB sidechain 闪避） ─────────────────────────────
# 人声压缩：TTS 原始峰值因数约 21 dB，先 4:1 压缩 + 峰值限幅，母带就不必大幅限幅、段落起伏得以保留
import subprocess
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'{OUT}/narration.wav', '-af',
                'acompressor=threshold=0.06:ratio=4:attack=4:release=120:makeup=1,alimiter=limit=0.22:attack=1:release=40:level=disabled',
                f'{OUT}/narration_comp.wav'], check=True)
voice, vsr = sf.read(f'{OUT}/narration_comp.wav', always_2d=True)
assert vsr == SR
voice = voice[:N]
if len(voice) < N:
    voice = np.vstack([voice, np.zeros((N - len(voice), 2))])
# 人声包络 → 闪避增益（attack 40ms / release 600ms）
env = np.abs(voice).mean(1)
win = int(0.02 * SR)
env = np.convolve(env, np.ones(win) / win, 'same')
active = (env > 0.01).astype(float)
g = np.zeros(N)
a_c = np.exp(-1 / (0.04 * SR))
r_c = np.exp(-1 / (0.60 * SR))   # 第八版 0.3→0.6s：旁白间隙配乐回升放缓，减轻抽吸感（审片 B-11）
cur = 0.0
for i in range(0, N, 48):  # 1ms 步进
    tgt = active[i]
    c = a_c ** 48 if tgt > cur else r_c ** 48
    cur = tgt + (cur - tgt) * c
    g[i:i + 48] = cur
depth = np.interp(np.arange(N) / SR, [0, 52.5, 54.0, 90], [6, 6, 9, 9])   # 第六版：1–3 幕闪避 -6 dB，4–5 幕 -9 dB（审片 A4：关键段人声要清楚）
duck = 10 ** (-depth * g / 20)
vpk = np.max(np.abs(voice))
voice = voice / vpk * 0.8
# 峰值控制：配乐与音效软削波（tanh），把瞬态峰值收进来，母带限幅就不必压扁高潮段
def soft(x, ceil):
    return np.tanh(x / ceil) * ceil
bgm_m = soft(bgm, 0.55 * np.percentile(np.abs(bgm), 99.9))
sfx_m = soft(sfx, 0.6 * np.percentile(np.abs(sfx), 99.9))
BGM_G, SFX_G = 0.4, 0.5
# 旁白随段落轻微起伏（±1.5 dB）：铺垫段略收，高潮段略前
VDYN = [(0, -2.5), (11.0, -2.5), (11.8, 1), (28.5, 1), (30.0, 0), (50.0, 0), (52.0, 1), (54.0, 2), (73.6 - S5, 2), (74.2 - S5, 1), (82.0 - S5, 1), (82.6 - S5, 2), (90, 2)]
venv = np.interp(np.arange(N) / SR, [p[0] for p in VDYN], [10 ** (p[1] / 20) for p in VDYN])
mix = voice * venv[:, None] + bgm_m * duck[:, None] * BGM_G + sfx_m * SFX_G
sf.write(f'{OUT}/mix_premaster.wav', mix.astype(np.float32), SR)
# 供竖屏剪辑复用的成型分轨（已压缩/起伏/软削波，增益已乘）
sf.write(f'{OUT}/stem_voice.wav', (voice * venv[:, None]).astype(np.float32), SR)
sf.write(f'{OUT}/stem_bgm.wav', (bgm_m * BGM_G).astype(np.float32), SR)
sf.write(f'{OUT}/stem_sfx.wav', (sfx_m * SFX_G).astype(np.float32), SR)
print('ok', np.max(np.abs(mix)))
