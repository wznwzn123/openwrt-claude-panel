# 音效可闻度检查（video-shotcraft final-review A6）：每条音效起点后 250 ms，成片比纯配乐响多少 dB
import json, subprocess, sys, numpy as np
SR = 48000
def load(p):
    return np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',p,'-f','f32le','-ac','1','-ar',str(SR),'-'],capture_output=True,check=True).stdout,dtype=np.float32)
full, bgm = load(sys.argv[1]), load(sys.argv[2])
cues = json.load(open(sys.argv[3]))['cues']
# 纯配乐按成片的增益对齐：用没有音效的一段（第 0.1–0.2 s 之外取全片中位数比值不稳，直接用整体最小二乘）
g = float(np.dot(full, bgm[:len(full)]) / np.dot(bgm[:len(full)], bgm[:len(full)]))
bgm = bgm[:len(full)] * g
# 基线：离所有音效 ≥0.6 s 的 250 ms 窗口里，成片和纯配乐之差的中位数（母带限幅、整体增益造成的偏差）
cf = np.array([c['f'] / 30 for c in cues]); base = []
for t in np.arange(1, len(full) / SR - 3, 0.25):
    if np.min(np.abs(cf - t)) > 0.6 and np.min(np.abs(cf - (t + 0.25))) > 0.6:
        a = int(t * SR); b = a + int(0.25 * SR)
        base.append(20 * np.log10(np.sqrt(np.mean(full[a:b] ** 2) + 1e-12) / np.sqrt(np.mean(bgm[a:b] ** 2) + 1e-12)))
B0 = float(np.median(base)); print(f'baseline {B0:+.1f} dB (n={len(base)})')
res = {}
for c in cues:
    a = int((c['f'] / 30 - 0.2) * SR); b = a + int(0.45 * SR)  # 以音效帧为中心：-200 ms ~ +250 ms（Mixkit whoosh 的能量都在峰值之前）
    e1 = np.sqrt(np.mean(full[a:b] ** 2) + 1e-12); e0 = np.sqrt(np.mean(bgm[a:b] ** 2) + 1e-12)
    res.setdefault(c['kind'], []).append(20 * np.log10(e1 / e0) - B0)
for k, v in res.items(): print(f'{k:14s} n={len(v):2d}  +{np.mean(v):5.1f} dB  min +{min(v):5.1f}')
