"""成片自检：时长 / 分辨率 / 帧率、黑帧白闪、响度真峰值、三次重拍的音画对齐、关键帧联系表。
用法：python3 tools/qa.py out/film.mp4 [out/qa-sheet.png]"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1]
sheet = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(src)[0] + '-sheet.png'
cues = json.load(open(os.path.join(HERE, '..', 'out', 'cues.json')))
FPS = cues['fps']

def run(*a):
    return subprocess.run(a, capture_output=True, text=True)

probe = json.loads(run('ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', src).stdout)
print('format', probe['format'], [ {k: v for k, v in s.items()} for s in probe['streams']])

# 黑帧 / 白闪
bd = run('ffmpeg', '-v', 'info', '-i', src, '-vf', 'blackdetect=d=0.1:pix_th=0.06', '-an', '-f', 'null', '-').stderr
print('blackdetect:', [l.split('black_')[1:] for l in bd.splitlines() if 'black_start' in l] or 'none')
lum = run('ffmpeg', '-v', 'info', '-i', src, '-vf', 'scale=480:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-an', '-f', 'null', '-').stderr
ys = [float(l.split('=')[1]) for l in lum.splitlines() if 'YAVG' in l]
jumps = [(i, round(ys[i - 1], 1), round(ys[i], 1)) for i in range(1, len(ys)) if abs(ys[i] - ys[i - 1]) > 25]
print('frames', len(ys), 'max YAVG', round(max(ys), 1), 'luma jumps >25:', jumps or 'none')

# 响度 / 真峰值
eb = run('ffmpeg', '-v', 'info', '-i', src, '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-').stderr
print('loudness:', ' | '.join(l.strip() for l in eb.splitlines()[-12:] if any(k in l for k in ('I:', 'Peak:', 'LRA:'))))

# 三次重拍：音频起音和画面帧的对齐（在拍点前后 150ms 里找最大的能量跳变）
wav = '/tmp/_qa.wav'
run('ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '48000', wav)
import numpy as np, soundfile as sf
x, sr = sf.read(wav)
for f in cues['music']['bigHits']:
    t = f / FPS
    a, b = int((t - 0.15) * sr), int((t + 0.15) * sr)
    seg = np.abs(x[a:b])
    env = np.convolve(seg, np.ones(240) / 240, mode='same')
    d = np.diff(env)
    on = (a + int(np.argmax(d))) / sr
    print(f'big hit frame {f} ({t:.3f}s): audio onset {on:.3f}s, offset {1000 * (on - t):+.0f} ms ({(on - t) * FPS:+.1f} f)')

# 关键帧联系表
times = [1, 4, 6.5, 9, 12, 16, 21, 27, 31, 35, 37.5, 39, 44, 49, 51.5, 55, 60, 64, 69, 73.5, 77.5, 80.5]
ims = []
for t in times:
    p = f'/tmp/_qa_{t}.png'
    run('ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', src, '-frames:v', '1', '-vf', 'scale=480:-1', p)
    ims.append((t, Image.open(p).convert('RGB')))
cols = 4
rows = (len(ims) + cols - 1) // cols
W, H = ims[0][1].size
c = Image.new('RGB', (cols * (W + 6), rows * (H + 22)), (20, 20, 20))
d = ImageDraw.Draw(c)
for k, (t, im) in enumerate(ims):
    X, Y = (k % cols) * (W + 6), (k // cols) * (H + 22)
    c.paste(im, (X, Y)); d.text((X + 4, Y + H + 4), f'{t}s', fill=(255, 220, 0))
c.save(sheet)
print('sheet', sheet)
