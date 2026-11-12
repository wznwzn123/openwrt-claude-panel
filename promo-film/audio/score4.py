"""v4 声音：配乐用 video-shotcraft 的 Mixkit tech-house（124 BPM），音效按中央音效表（src/v4/cues.ts → out/cues4.json）逐条钉帧。

音效来源：
  · video-shotcraft template/public/audio 里授权有记录的 Mixkit 音效（Mixkit SFX Free License）：
    impact-cine（大冲击）、whoosh-fast（甩镜）、transition-soft（窗口升起）、swoosh-quick（手机进场 / 发消息）、
    transition-snap（定版图标停靠）、click-camera（描边圈）
  · 来源记录不全的几条（riser-cine、sparkle、keyboard、pop）不用，改由 mg-styles-15 的 mgaudio 合成，
    提示类声音用 VCSL 乐器采样（CC0）。
Mixkit 素材都有一段起音前的铺垫，按峰值对齐到画面帧（PEAK 表，实测）。

用法（在 promo-film 目录）：
  node tools/dump-cues.mjs src/v4/cues.ts && python3 audio/score4.py   # → public/audio/film4.wav, film4-nomusic.wav
"""
import json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MGAUDIO = os.environ.get('MGAUDIO', os.path.join(HERE, '..', '..', '..', 'vincentwei1021', 'mg-styles-15', 'lib', 'audio'))
SHOTCRAFT = os.environ.get('SHOTCRAFT', os.path.join(HERE, '..', '..', '..', 'vincentwei1021', 'video-shotcraft'))
sys.path.insert(0, os.path.abspath(MGAUDIO))
import mgaudio as mg
from mgaudio import sfx, samples
from mgaudio.core import Sound

SR = 48000
CUE = json.load(open(os.path.join(HERE, '..', 'out', 'cues4.json')))
FPS = CUE['fps']
MUS = CUE['music']
DUR = MUS['end'] / FPS
sec = lambda f: f / FPS
# 输出偏移补偿（沿用 v1 实测：AAC 编码器延迟 + 起音爬升，整体提前 45 ms；qa.py 复测）
OUT_OFFSET = 0.045


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return Sound(np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy())


MK = os.path.join(SHOTCRAFT, 'template', 'public', 'audio')
_cache = {}
def mk(name):
    if name not in _cache:
        _cache[name] = load(os.path.join(MK, name + '.mp3'))
    return _cache[name]
# 峰值位置（秒，实测：包络 10 ms 平滑后的最大值）
PEAK = {'impact-cine': 0.632, 'whoosh-fast': 0.725, 'transition-soft': 0.453, 'swoosh-quick': 0.12, 'transition-snap': 0.18, 'click-camera': 0.02}

_INST = {}
def inst(name):
    if name not in _INST:
        _INST[name] = samples.inst(name)
    return _INST[name]
def marimba(note, vel=0.6): return inst('marimba').play(note, None, vel).loud(-20)
def glock(note, vel=0.6): return inst('glock').play(note, None, vel).loud(-20)
def kalimba(note, vel=0.6): return inst('kalimba').play(note, None, vel).loud(-20)
def woodblock(vel=0.5): return samples.hit('woodblock', vel=vel).loud(-22)
# 配乐在 A 小调附近（tech-house 低音），提示音用 A 小调五声
PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88]


def build(music=True):
    m = mg.Mix(duration=DUR, bpm=124, anchor=0.0)
    if music:
        bgm = load(os.path.join(SHOTCRAFT, 'assets', 'audio', 'bgm', MUS['src']))
        n = int(DUR * SR)
        a = bgm.data[:, :n].copy()
        # 最后两小节淡出（第 38.5 小节起，余弦）
        f0 = int(sec(MUS['fadeFrom']) * SR)
        k = np.clip((np.arange(a.shape[1]) - f0) / max(1, n - f0), 0, 1)
        a *= (0.5 + 0.5 * np.cos(np.pi * k)) ** 1.3
        t = m.track('bgm', group='music')
        t.add(Sound(a), 0.0)
        # 大冲击时让配乐让一下（侧链式压低 4 dB，180 ms 恢复）
        t.duck(times=[sec(f) for f in MUS['ducks']], depth=4.0, attack=0.004, hold=0.05, release=0.25)
        m.group('music').level = -6.0
    sound_design(m)
    m.group('sfx').level = 10.0  # 配乐鼓点密，音效整体 +10 dB 才听得见（tools/sfx_audible.py 实测）
    return m


def place(m, name, t_peak, gain, verb=None):
    m.sfx(mk(name), t_peak - PEAK[name], gain=gain, verb=verb)


def sound_design(m):
    for c in CUE['cues']:
        t, k, i = sec(c['f']) - OUT_OFFSET, c['kind'], c.get('i', 0) or 0
        d = sec(c.get('dur') or 0)
        if k == 'led_on':
            m.sfx(sfx.blip('A6', 'sine', 0.09), t, gain=-8, verb=-14)
        elif k == 'pen':
            m.sfx(sfx.pen('pen', max(0.4, d), strokes=[(0.0, max(0.35, d - 0.05))]), t - 0.02, gain=-16)
        elif k == 'icon_bloom':
            m.sfx(sfx.shimmer_hit('A5'), t, gain=-10)
            m.sfx(sfx.sparkle(1.2, 14, 'A', 'minor_pentatonic'), t, gain=-16)
        elif k == 'word':
            m.sfx(sfx.swish(0.3), t, gain=-8)
        elif k == 'window_rise':
            place(m, 'transition-soft', t, -5)
        elif k == 'phone_in':
            place(m, 'swoosh-quick', t + 0.1, -16)
        elif k == 'riser':
            m.sfx(sfx.riser(max(1.0, d), 'hybrid', 'A3', intensity=0.85), t, gain=-6)
        elif k == 'big_hit':
            place(m, 'impact-cine', t, -6, verb=-12)
            m.sfx(sfx.impact('punch', 0.9), t, gain=-8)
        elif k == 'whip':
            place(m, 'whoosh-fast', t, -6)
        elif k == 'ring':
            place(m, 'click-camera', t, -9)
            m.sfx(glock(PENTA[4 + i % 4] + 12, 0.4), t, gain=-11, verb=-14)
        elif k == 'typing':
            m.sfx(sfx.typing(max(6, int(d * 11)), 12.0), t, gain=-12)
        elif k == 'send':
            place(m, 'swoosh-quick', t, -20)
        elif k == 'tool':
            m.sfx(marimba(PENTA[2 + i], 0.5), t, gain=-15)
        elif k == 'done':
            m.sfx(kalimba(81, 0.45), t, gain=-10)
        elif k == 'row':
            m.sfx(marimba(PENTA[i + 1], 0.45), t, gain=-17)
        elif k == 'bot':
            m.sfx(sfx.typing(8, 16.0), t, gain=-24)
        elif k == 'line':
            m.sfx(woodblock(0.45), t, gain=-4 - (i % 2) * 2)
        elif k == 'install_done':
            m.sfx(kalimba(81, 0.55), t, gain=-2)
            m.sfx(kalimba(88, 0.5), t + 0.09, gain=-4)
        elif k == 'big_number':
            m.sfx(sfx.impact('soft', 0.7), t, gain=-11, verb=-12)
        elif k == 'slot':
            m.sfx(sfx.click('soft'), t, gain=-14)
            m.sfx(marimba(PENTA[3 + i], 0.45), t, gain=-16)
        elif k == 'ver':
            m.sfx(woodblock(0.4), t, gain=-9 + min(4, i * 0.25))
        elif k == 'stat':
            m.sfx(marimba(PENTA[3 + i * 2], 0.55), t, gain=-13, verb=-14)
        elif k == 'lens_glide':
            m.sfx(sfx.whoosh(max(0.8, d), 'sci', direction=-1, peak=0.8), t, gain=-5, verb=-12)
        elif k == 'logo_hit':
            place(m, 'impact-cine', t, -5, verb=-10)
            m.sfx(sfx.shimmer_hit('A5'), t, gain=-9)
            m.sfx(sfx.sparkle(1.6, 20, 'A', 'minor_pentatonic'), t, gain=-14)
        elif k == 'park':
            place(m, 'transition-snap', t + 0.3, -17)
        else:
            raise SystemExit('unknown cue kind ' + k)


if __name__ == '__main__':
    out = os.path.join(HERE, '..', 'public', 'audio')
    os.makedirs(out, exist_ok=True)
    full = build(True)
    r1 = full.export(os.path.join(out, 'film4.wav'), lufs=-14, tp=-2.0)
    full.report()
    nomusic = build(False)
    r2 = nomusic.export(os.path.join(out, 'film4-nomusic.wav'), lufs=-18, tp=-2.0)
    json.dump({'full': {k: v for k, v in r1.items() if k in ('duration', 'lufs', 'true_peak', 'warnings', 'stereo_corr')},
               'nomusic': {k: v for k, v in r2.items() if k in ('duration', 'lufs', 'true_peak', 'warnings')}},
              open(os.path.join(HERE, '..', 'out', 'audio4-qc.json'), 'w'), ensure_ascii=False, indent=1, default=float)
