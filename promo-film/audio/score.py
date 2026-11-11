"""「一根线」配乐 + 音效。全部由代码合成（mg-styles-15 的 mgaudio：合成器 + CC0 的 VCSL 乐器采样）。

结构从同一份时间表来（src/timeline.ts → out/cues.json）：100 BPM，一小节 2.4 秒，34 小节 = 81.6 秒。
  0–3   开场：玻璃质感的长垫音 + 钢琴单音，一盏灯
  4–7   为什么做：钢琴分解和弦进来
  8–13  时间轴：轻鼓（1、3 拍）+ 低音 + 钟琴琶音，版本卡在拍上弹立
  14–15 停更五天：只剩钢琴，越来越稀；最后半小节上扬
  16–19 重新接上：全编制（底鼓四拍、拍手、八分音符低音、明亮垫音）
  20–21 长卷急刹：第 20 小节第 4 拍急刹，第 21 小节留白
  22–29 四条原则：半速律动，钢琴主导
  30–33 收尾：再起一次，第 32 小节强拍上图标亮起，D 大调和弦收住

用法（在 promo-film 目录）：
  node tools/dump-cues.mjs && python3 audio/score.py          # → public/audio/film.wav, film-nomusic.wav
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# mgaudio 来自 https://github.com/Vincentwei1021/mg-styles-15 的 lib/audio（代码 MIT，乐器采样 CC0）。
# 采样有 50 MB，不拷进这个仓库：先 clone mg-styles-15，再用 MGAUDIO 指向它的 lib/audio。
MGAUDIO = os.environ.get('MGAUDIO', os.path.join(HERE, '..', '..', '..', 'vincentwei1021', 'mg-styles-15', 'lib', 'audio'))
sys.path.insert(0, os.path.abspath(MGAUDIO))
import mgaudio as mg
from mgaudio import synth, drums, sfx, fm, samples
from mgaudio.core import Sound

CUE = json.load(open(os.path.join(HERE, '..', 'out', 'cues.json')))
FPS = CUE['fps']
BPM = CUE['music']['bpm']
BEAT = 60.0 / BPM
BAR = BEAT * 4
DUR = 34 * BAR                                       # 81.6 s
sec = lambda f: f / FPS
bar = lambda n: n * BAR

# ── 和声（D 大调）：每小节一个和弦，字面写出 MIDI 音高，方便控制声部 ──
CH = {
    'Dmaj9': [50, 57, 61, 64, 66], 'D': [50, 57, 62, 66, 69], 'Bm9': [47, 54, 57, 61, 62], 'Bm': [47, 54, 59, 62, 66],
    'Gmaj9': [43, 50, 54, 57, 59], 'G': [43, 50, 55, 59, 62], 'A69': [45, 52, 59, 61, 66], 'A': [45, 52, 57, 61, 64],
    'Asus': [45, 52, 57, 62, 64], 'Em7': [40, 47, 55, 59, 62],
}
PROG = (['Dmaj9', 'Dmaj9', 'Gmaj9', 'A69'] +                       # 0–3 开场
        ['Dmaj9', 'Bm9', 'Gmaj9', 'A69'] +                         # 4–7
        ['D', 'Bm', 'G', 'A', 'D', 'Bm'] +                         # 8–13 时间轴
        ['Gmaj9', 'Asus'] +                                        # 14–15 停更
        ['G', 'A', 'Bm', 'D'] +                                    # 16–19 重新接上
        ['G', 'Asus'] +                                            # 20–21 急刹
        ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'] +                # 22–29 原则
        ['Bm', 'G', 'Asus', 'D'] + ['D'])                          # 30–33 收尾
assert len(PROG) >= 34
root = lambda c: CH[c][0]


def build(music=True):
    m = mg.Mix(duration=DUR, bpm=BPM, anchor=0.0)
    m.group('music').level = -20.0
    if music:
        compose(m)
    sound_design(m)
    m.group('sfx').gain = 4.0       # 音效整体再抬 4 dB：拟音要听得见，但不盖过音乐
    return m


def compose(m):
    # 垫音：玻璃垫 + 高处的空气垫（全片，停更那两小节压低）
    pad = m.track('pad', level=-25.5, sends={'big': -8}, hp=150)
    air = m.track('air', level=-28, sends={'shimmer': -9})
    for i in range(34):
        c = CH[PROG[i]]
        v = 0.55 if 14 <= i <= 15 else 0.75
        pad.add(synth.pad(c, BAR + 0.6, v, 'glass', attack=0.4, release=1.6), bar(i))
        if not (14 <= i <= 15):
            air.add(synth.pad([n + 12 for n in c[-2:]], BAR + 0.6, 0.55, 'air', attack=0.6, release=1.8), bar(i))
    pad.automate('lpf', [(0, 1800), (bar(4), 4000), (bar(8), 9000), (bar(14), 1600), (bar(16), 14000), (bar(22), 6000), (bar(30), 9000), (bar(32), 15000), (DUR, 6000)])
    pad.automate('gain', [(0, -6), (bar(2), 0), (DUR - 2, 0), (DUR, -10)])

    # 钢琴（VCSL 采样）
    pno = samples.inst('piano')
    pn = m.track('piano', level=-22, sends={'big': -10})
    def broken(i, pattern, vel=0.5, oct_=12):
        c = CH[PROG[i]]
        notes = [c[1] + oct_, c[2] + oct_, c[3] + oct_, c[4] + oct_]
        for k, step in enumerate(pattern):
            if step == '.':
                continue
            n = notes[int(step) % 4]
            pn.add(pno.play(n, 1.6, vel * (1.0 if k % 4 == 0 else 0.8)), bar(i) + k * BEAT / 2)
    # 开场：一个音一个音（像灯一闪一闪）
    for i, n in enumerate([74, 73, 71, 69]):
        pn.add(pno.play(n, 2.4, 0.42), bar(i) + BEAT * 2)
    pn.add(pno.play(78, 2.0, 0.35), bar(2) + BEAT * 3.5)
    for i in range(4, 8):
        broken(i, '0.1.2.3.', 0.45)
    for i in range(8, 14):
        broken(i, '0123' * 2, 0.4)
    # 停更五天：只剩几个音，越来越稀
    for t, n, v in [(bar(14), 71, 0.4), (bar(14) + BEAT * 2, 69, 0.33), (bar(14) + BEAT * 3.5, 66, 0.28), (bar(15), 64, 0.24)]:
        pn.add(pno.play(n, 3.0, v), t)
    for i in range(16, 20):
        broken(i, '01230123', 0.48)
    for i in range(22, 30):
        broken(i, '0.12.3.2', 0.42)
    for i in range(30, 32):
        broken(i, '01230123', 0.46)
    for n in (62, 66, 69, 74):                              # 收尾的 D 大调和弦
        pn.add(pno.play(n, 4.5, 0.42), bar(32))

    # 低音
    bs = m.track('bass', level=-22)
    for i in list(range(8, 14)) + list(range(22, 30)) + [30, 31]:
        bs.add(synth.bass(root(PROG[i]) - 12, BAR * 0.95, 0.7, 'sub'), bar(i))
    for i in range(16, 21):
        for k in range(8):
            bs.add(synth.bass(root(PROG[i]) - 12 + (12 if k % 2 else 0), BEAT / 2 * 0.8, 0.75, 'pluck'), bar(i) + k * BEAT / 2)
    bs.add(synth.bass(38, BAR * 1.8, 0.8, 'sub'), bar(32))

    # 鼓
    kick = m.track('kick', level=-18)
    hat = m.track('hat', level=-31, pan=0.2)
    clap = m.track('clap', level=-23, sends={'plate': -14})
    for i in range(8, 14):                                   # 时间轴：1、3 拍
        for b in (0, 2):
            kick.add(drums.kick('soft', 0.8), bar(i) + b * BEAT)
        for k in range(8):
            hat.add(drums.hat('closed', 0.35 if k % 2 else 0.5), bar(i) + k * BEAT / 2)
    for i in range(16, 21):                                  # 重新接上：四拍底鼓 + 2、4 拍手
        for b in range(4):
            if i == 20 and b == 3:
                continue                                     # 急刹那一拍把位置让给冲击音效
            kick.add(drums.kick('punchy', 0.9), bar(i) + b * BEAT)
        if i < 20:
            for b in (1, 3):
                clap.add(drums.clap('tight', 0.8), bar(i) + b * BEAT)
        for k in range(16):
            hat.add(drums.hat('closed', 0.55 if k % 4 == 2 else 0.3), bar(i) + k * BEAT / 4)
    for i in range(22, 30):                                  # 原则：半速
        kick.add(drums.kick('soft', 0.75), bar(i))
        kick.add(drums.kick('soft', 0.55), bar(i) + BEAT * 2.5)
        clap.add(drums.rim(0.5), bar(i) + BEAT * 2)
        for k in range(8):
            hat.add(drums.shaker(0.35), bar(i) + k * BEAT / 2)
    for i in (30, 31):                                       # 收尾：再起一次，越来越密
        for b in range(4):
            kick.add(drums.kick('soft', 0.8), bar(i) + b * BEAT)
        for k in range(8 if i == 30 else 16):
            hat.add(drums.hat('closed', 0.4), bar(i) + k * (BEAT / 2 if i == 30 else BEAT / 4))
    kick.add(drums.kick('punchy', 1.0), bar(32))
    m['pad'].duck(by='kick', depth=2.5)
    m['bass'].duck(by='kick', depth=4)

    # 钟琴琶音（时间轴、重新接上、收尾）
    gl = samples.inst('glock')
    bells = m.track('bells', level=-27, sends={'delay': -8, 'shimmer': -12})
    for i in list(range(10, 14)) + list(range(16, 20)) + [31]:
        c = CH[PROG[i]]
        seq = [c[2] + 24, c[3] + 24, c[4] + 24, c[3] + 24]
        for k in range(8):
            n = seq[k % 4]
            bells.add(gl.play(n, None, 0.45) if n >= 79 else fm.bell(n, 1.2, 0.45, 'celesta'), bar(i) + k * BEAT / 2, pan=float(np.sin(k * 1.7)) * 0.4)


# ── 音效：按中央音效表逐条钉帧 ──
PENTA = [74, 76, 78, 81, 83, 86, 88, 90]          # D 大调五声（D E F# A B）

# v2：提示类音效改用真实乐器采样（VCSL，CC0）而不是合成的 bleep（v1 评审 A7：ding / tick / pop 读作廉价提示音）
_INST = {}
def inst(name):
    if name not in _INST:
        _INST[name] = samples.inst(name)
    return _INST[name]
def glock(note, vel=0.6):
    return inst('glock').play(note, None, vel).loud(-20)
def marimba(note, vel=0.6):
    return inst('marimba').play(note, None, vel).loud(-20)
def kalimba(note, vel=0.6):
    return inst('kalimba').play(note, None, vel).loud(-20)
def woodblock(vel=0.5):
    return samples.hit('woodblock', vel=vel).loud(-22)


# 输出偏移补偿（video-shotcraft sound-design §4.6）：v1 成片实测，三次大冲击的音频起音比画面晚 +41/+43/+53 ms
# （AAC 编码器延迟 + 冲击音的起音爬升）。所有音效统一提前 45 ms；测法见 tools/qa.py 的 big hit 一节。
OUT_OFFSET = 0.045


def sound_design(m):
    for c in CUE['cues']:
        t, k, i = sec(c['f']) - OUT_OFFSET, c['kind'], c.get('i', 0) or 0
        d = sec(c.get('dur') or 0)
        if k == 'led_on':
            m.sfx(sfx.blip('A6', 'sine', 0.09), t, gain=-8, verb=-14)
        elif k == 'typing':
            n = max(6, int(d * 11))
            m.sfx(sfx.typing(n, 11.0), t, gain=-14)
        elif k == 'hop':
            m.sfx(sfx.swish(0.25), t, gain=-12)
        elif k == 'draw_riser':
            m.sfx(sfx.riser(max(1.0, d), 'tonal', 'D4', intensity=0.6), t, gain=-11, verb=-12)
        elif k == 'dots':
            m.sfx(sfx.pop('bubble', 1.2), t, gain=-10)
        elif k == 'title':
            m.sfx(sfx.impact('soft', 0.8), t, gain=-8, verb=-10)
            m.sfx(sfx.shimmer_hit('A5'), t, gain=-10)
        elif k == 'whoosh_soft':
            m.sfx(sfx.whoosh(max(0.5, d), 'soft'), t, gain=-12)
        elif k == 'ding':
            m.sfx(glock(93, 0.5), t, gain=-10, verb=-12)
        elif k == 'swoosh_reveal':
            m.sfx(sfx.whoosh(0.7, 'air'), t, gain=-13)
        elif k == 'slot':
            m.sfx(sfx.click('soft'), t, gain=-10)
            m.sfx(marimba(PENTA[i % len(PENTA)], 0.5), t, gain=-12)
        elif k == 'pop':
            m.sfx(marimba(PENTA[i % len(PENTA)], 0.6), t, gain=-8, verb=-14)
        elif k == 'move':
            m.sfx(sfx.whoosh(0.6, 'air'), t, gain=-17)
        elif k == 'day_tick':
            m.sfx(woodblock(0.4), t, gain=-12 - i)
        elif k == 'spark':
            m.sfx(glock(PENTA[2 + i] + 12, 0.45), t, gain=-12)
            m.sfx(sfx.glitch(0.08, 'digital'), t, gain=-20)
        elif k == 'relit_riser':
            m.sfx(sfx.riser(max(1.0, d), 'hybrid', 'A3', intensity=0.9), t, gain=-6)
        elif k == 'big_hit':
            m.sfx(sfx.impact('cinematic', 1.0), t, gain=-2, verb=-8)
            m.sfx(sfx.shimmer_hit('D6'), t, gain=-9)
        elif k == 'pop_fast':
            m.sfx(marimba(PENTA[(i + 2) % len(PENTA)], 0.55), t, gain=-10, verb=-16)
        elif k == 'move_fast':
            m.sfx(sfx.swish(0.3), t, gain=-16)
        elif k == 'scroll_riser':
            m.sfx(sfx.riser(max(1.0, d), 'sweep', 'D3', intensity=0.8), t, gain=-8)
        elif k == 'brake_hit':
            m.sfx(sfx.impact('punch', 0.9), t, gain=-3, verb=-10)
        elif k == 'pen':
            # 线是一笔连续画的：一整段笔触，音量压低当质感
            m.sfx(sfx.pen('pen', max(0.4, d), strokes=[(0.0, max(0.35, d - 0.05))]), t - 0.02, gain=-16)
        elif k == 'statement':
            m.sfx(sfx.impact('soft', 0.5), t, gain=-14, verb=-12)
        elif k == 'confirm':
            m.sfx(kalimba(81, 0.5), t, gain=-10)
            m.sfx(kalimba(86, 0.45), t + 0.09, gain=-12)
        elif k == 'tick':
            m.sfx(woodblock(0.3), t, gain=-16)
        elif k == 'whoosh_out':
            m.sfx(sfx.whoosh(0.45, 'soft', direction=-1), t, gain=-17)
        elif k == 'roll':
            m.sfx(sfx.data_chirp(5), t, gain=-17)
        elif k == 'logo_hit':
            m.sfx(sfx.impact('cinematic', 0.8), t, gain=-3, verb=-8)
            m.sfx(sfx.shimmer_hit('D6'), t, gain=-7)
            m.sfx(sfx.sparkle(1.6, 22, 'D', 'major_pentatonic'), t, gain=-12)
        elif k == 'lens_glide':
            m.sfx(sfx.whoosh(max(0.8, d), 'sci', direction=-1, peak=0.55), t, gain=-9, verb=-12)
            m.sfx(sfx.sparkle(1.0, 14, 'D', 'major_pentatonic'), t, gain=-16)
        elif k == 'word':
            m.sfx(sfx.swish(0.3), t, gain=-15)
        else:
            raise SystemExit('unknown cue kind ' + k)


if __name__ == '__main__':
    out = os.path.join(HERE, '..', 'public', 'audio')
    os.makedirs(out, exist_ok=True)
    full = build(True)
    # 真峰值留到 -1.8：AAC 编码后实测会抬高约 0.6 dB（v1：母带 -1.19 → 成片 -0.6 dBFS）
    r1 = full.export(os.path.join(out, 'film.wav'), lufs=-14, tp=-2.0, spectrogram=os.path.join(HERE, '..', 'out', 'film-spec.png'))
    full.report()
    nomusic = build(False)
    r2 = nomusic.export(os.path.join(out, 'film-nomusic.wav'), lufs=-18, tp=-2.0)
    json.dump({'full': {k: v for k, v in r1.items() if k in ('duration', 'lufs', 'true_peak', 'warnings', 'stereo_corr')},
               'nomusic': {k: v for k, v in r2.items() if k in ('duration', 'lufs', 'true_peak', 'warnings')}},
              open(os.path.join(HERE, '..', 'out', 'audio-qc.json'), 'w'), ensure_ascii=False, indent=1, default=float)
