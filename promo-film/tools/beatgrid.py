# BGM 节拍网格 + 能量结构（video-shotcraft references/music-beat-sync.md §1–§3）
import sys, json, numpy as np, librosa
from scipy.signal import butter, sosfilt
src = sys.argv[1]
y, sr = librosa.load(src, sr=None, mono=True)
yp = librosa.effects.hpss(y)[1]
tempo, beats = librosa.beat.beat_track(y=yp, sr=sr, tightness=400, units="time")
i = np.arange(len(beats)); A = np.vstack([i, np.ones_like(i)]).T
(T, t0), *_ = np.linalg.lstsq(A, beats, rcond=None)
res = beats - (t0 + i * T)
print(f"beat_track tempo={float(np.atleast_1d(tempo)[0]):.2f} fit BPM={60/T:.3f} t0={t0:.4f} T={T:.5f} resid max={np.abs(res).max()*1000:.0f}ms p95={np.percentile(np.abs(res),95)*1000:.0f}ms n={len(beats)}")
def band_env(lo, hi):
    sos = butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    env = librosa.onset.onset_strength(y=sosfilt(sos, yp), sr=sr, hop_length=256)
    return env / (env.max() + 1e-9), librosa.times_like(env, sr=sr, hop_length=256)
kick, tt = band_env(40, 160); hat, _ = band_env(6000, 14000); snr, _ = band_env(1000, 3000)
while t0 - T > 0: t0 -= T
nb = int((len(y)/sr - t0) / T)
rms = librosa.feature.rms(y=y, hop_length=512)[0]; rt = librosa.times_like(rms, sr=sr, hop_length=512)
rows = []
for n in range(nb):
    t = t0 + n * T; j = np.argmin(np.abs(tt - t))
    w = slice(max(0, j-2), j+3)
    a = np.argmin(np.abs(rt - t)); b = np.argmin(np.abs(rt - (t + T)))
    rows.append(dict(n=n, t=round(t, 4), kick=round(float(kick[w].max()), 3), snare=round(float(snr[w].max()), 3), hat=round(float(hat[w].max()), 3), rms=round(float(rms[a:b+1].mean()), 4)))
json.dump(dict(bpm=60/T, t0=t0, T=T, beats=rows), open(sys.argv[2], "w"), indent=0)
# 每小节（4 拍）一行：能量 + kick 覆盖
for bar in range(nb // 4):
    r = rows[bar*4:bar*4+4]
    print(f"bar {bar:3d} t={r[0]['t']:7.2f}  rms={np.mean([x['rms'] for x in r]):.3f}  kick={' '.join(f'{x['kick']:.2f}' for x in r)}  hat={np.mean([x['hat'] for x in r]):.2f}")
