"""OpenWrt Claude Panel 90s 宣传片 · 离线声音工程（确定性合成，零外部素材）

输出（public/audio/）：
  bgm.wav        配乐：0–12s 95 BPM 暗夜低频脉冲 → 11.8s Sub Drop → 12–90s 116 BPM 极简科技电子（54s / 82s 两次推高）
  sfx.wav        全部交互音效按 cue 表落位（cues.json 同步输出，供剪映/工作台拆轨）
  mix.wav        人声 + 配乐（-5 dB sidechain 闪避）+ 音效，两遍 loudnorm 到 -14 LUFS / TP ≤ -1 dBTP 在 master.sh 里做
"""
import json
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
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
place(bgm, riser(2.6, 200, 3500), 3.15, 0.35)
place(bgm, riser(1.4, 400, 7000), 10.4, 0.45)

# 12–90s：116 BPM 极简科技电子，A 小调 i–VI–III–VII
BPM = 116
beat = 60 / BPM
bar = beat * 4
T0 = 12.0
prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]  # Am F C G
arp = [0, 2, 1, 2, 0, 2, 1, 3]
nbars = int((DUR - T0) / bar) + 1
for b in range(nbars):
    bs = T0 + b * bar
    if bs >= DUR:
        break
    root, chord = prog[(b // 2) % 4]
    energy = 1 if bs < 28 else 2 if bs < 54 else 3 if bs < 82 else 4
    if bs > 88.6:
        energy = 0
    # pad（每两小节一铺）
    if b % 2 == 0 and bs < 88:
        dd = min(bar * 2 + 1.2, DUR - bs)
        pv = pad([mtof(n) for n in chord], dd, att=0.9, rel=1.4)
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
            place(bgm, pan(pluck(mtof(n), 0.7, 1.2 if energy >= 3 else 0.9), pp), bs + i * step, 0.5 if energy < 3 else 0.38)

# 54s Claude 登场 & 82s 终幕：riser → impact
place(bgm, riser(2.2, 300, 6000), 51.8, 0.4)
place(bgm, riser(2.3, 300, 8000), 84.414 - 2.3, 0.45)
place(bgm, sub_drop(2.5, 90, 28), 84.414, 0.4)
# 终幕长尾：Am(add9) 大铺底直至 90s，最后 1.2s 微呼吸
place(bgm, pad([mtof(n) for n in (45, 57, 60, 64, 71)], 6.0, att=0.3, rel=2.5, bright=6), 84.414, 1.6)

# 主骨：两次 Sub Drop
place(bgm, sub_drop(), 5.75, 0.5)
place(bgm, sub_drop(2.4, 100, 24), 11.8, 0.6)

bgm = reverb(bgm, 0.22)
fade = np.ones(N)
fade[-int(SR * 1.2):] = np.linspace(1, 0, int(SR * 1.2)) ** 1.5
bgm *= fade[:, None]
bgm /= np.percentile(np.abs(bgm), 99.7) + 1e-9
bgm = np.tanh(bgm * 0.8) * 0.85

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


def chime(f1=880, f2=1318.5):
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
cue('rush-whoosh', 10.45, whoosh(1.5, 300, 7000), 0.9)
# 第二幕
cue('spotlight-sweep', 12.0, whoosh(1.6, 500, 6000), 0.55)
cue('phone-land', 12.55, glass_tap(1800), 0.5)
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
for i, at in enumerate((31.25, 33.1, 33.6, 33.9, 34.75, 35.5)):
    cue('plugin-detect', at, glass_tap(2600 + i * 120), 0.35)
cue('tap', 37.15, click(), 0.8)
cue('push-in', 36.8, whoosh(0.6, 200, 2500), 0.35)
for i, at in enumerate((37.85, 37.97, 38.09)):
    cue('latency-lock', at, glass_tap(3200), 0.3)
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
cue('scan-ok', SEG_C + 1.9, glass_tap(3000), 0.35, 0.5)
cue('router-switch', 51.25, click(), 0.7, 0.5)
# 第四幕
cue('claude-enter', 54.0, whoosh(1.6, 200, 3000), 0.6)
cue('converge', 57.517 - 0.3, whoosh(0.6, 400, 6000), 0.6)
cue('console', 58.034, glass_tap(1600), 0.5)
CHAR = 0.072
for text, t0, send, reply in (('把超清影音专线切到新加坡低延迟节点', 58.75, 60.05, 60.75), ('看看现在哪台设备在占满网速', 62.35, 63.3, 63.95), ('给儿童平板设置每晚11点自动断网', 65.55, 66.8, 67.45)):
    for i in range(len(text)):
        place(sfx, pan(key(False), 0), t0 + i * CHAR, 0.6)
    cues.append({'t': t0, 'name': 'dictation-typing', 'gain': 0.6})
    cue('send', send, glass_tap(1900), 0.55)
    cue('claude-reply', reply, chime(), 0.55)
cue('uci-backup', 68.15, chime(784, 1174.7), 0.45)
cue('act-out', 73.5, whoosh(0.6, 300, 5000), 0.5)
# 终幕
cue('scan-sweep', 74.4, riser(3.2, 600, 2500) * 0.6, 0.35)
for i, y1 in enumerate((224, 224, 268, 268)):
    ft = 74.4 + 3.2 * (y1 + 20) / 820 + i * 0.08
    cue('sonar-lock', ft, sonar(1200 + i * 110), 0.5, 0.3)
cue('wechat-notice', 77.4, chime(987.8, 1318.5), 0.55, 0.5)
cue('wechat-notice', 79.8, chime(987.8, 1318.5), 0.55, 0.5)
cue('hud-to-aurora', 81.828 - 0.4, whoosh(0.8, 300, 6000), 0.55)
for i in range(int(1.25 / 0.03)):
    place(sfx, pan(key(True), 0.1), 82.35 + i * 0.03, 0.45)
cues.append({'t': 82.35, 'name': 'terminal-typing', 'gain': 0.45})
cue('enter', 84.414, key(True) * 2.0, 1.0)
cue('morph', 84.614, whoosh(0.8, 200, 2500), 0.5)
for i, at in enumerate((85.448, 85.707, 85.966)):
    cue('assemble-drop', at, glass_tap(1400 + i * 350), 0.6)
cue('brand-sparkle', 86.224, chime(1760, 2637), 0.35)
sfx = reverb(sfx, 0.12)

sf.write(f'{OUT}/bgm.wav', bgm.astype(np.float32), SR)
sf.write(f'{OUT}/sfx.wav', sfx.astype(np.float32), SR)
json.dump(cues, open(f'{OUT}/cues.json', 'w'), ensure_ascii=False, indent=1)

# ───────────────────────────── 混音（-5 dB sidechain 闪避） ─────────────────────────────
voice, vsr = sf.read(f'{OUT}/narration.wav', always_2d=True)
assert vsr == SR
voice = voice[:N]
if len(voice) < N:
    voice = np.vstack([voice, np.zeros((N - len(voice), 2))])
# 人声包络 → 闪避增益（attack 40ms / release 300ms）
env = np.abs(voice).mean(1)
win = int(0.02 * SR)
env = np.convolve(env, np.ones(win) / win, 'same')
active = (env > 0.01).astype(float)
g = np.zeros(N)
a_c = np.exp(-1 / (0.04 * SR))
r_c = np.exp(-1 / (0.30 * SR))
cur = 0.0
for i in range(0, N, 48):  # 1ms 步进
    tgt = active[i]
    c = a_c ** 48 if tgt > cur else r_c ** 48
    cur = tgt + (cur - tgt) * c
    g[i:i + 48] = cur
duck = 10 ** (-5 * g / 20)
vpk = np.max(np.abs(voice))
voice = voice / vpk * 0.9
mix = voice * 1.0 + bgm * duck[:, None] * 0.26 + sfx * 0.36
sf.write(f'{OUT}/mix_premaster.wav', mix.astype(np.float32), SR)
print('ok', np.max(np.abs(mix)))
