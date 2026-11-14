"""第八版交付闸门：多数表决修复单帧渲染故障（审片第八轮 A-1）。
毛玻璃（backdrop-filter）元素在软件 GL 下偶发整块没画上，且常出现在打字、切镜头等前后帧本来就在变的地方，
「孤立突变帧」检测会漏。这里把指定区间整段再渲一遍，与成片逐帧比对；两次不一致的帧渲第三遍，按多数取正确的一帧。
用法：python3 scripts/vote_frames.py <合成名> <成片> <起帧> <止帧> <输出补帧目录>
输出目录里只放需要替换的帧（成片那一帧是坏的）；之后用 patch_frames.py 替换。"""
import os, sys, shutil, subprocess, json
import numpy as np
from PIL import Image
comp, src, a, b, outdir = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', src], capture_output=True, text=True).stdout)['streams'][0]
W, H = info['width'], info['height']; num, den = map(int, info['r_frame_rate'].split('/')); FPS = num / den
T = 12.0   # 64px 块的最大平均差阈值：编码误差约 2–5，缺块故障 30 以上
os.makedirs(outdir, exist_ok=True)
tmp = os.path.abspath(f'out/vote_tmp_{comp}')
BUNDLE = os.path.abspath('out/.bundle_vote')   # 整次表决复用同一份打包
def small(x):  # RGB → 1/4 灰度
    g = x.astype(np.float32).mean(2)
    return g[:H // 4 * 4, :W // 4 * 4].reshape(H // 4, 4, W // 4, 4).mean((1, 3))
def bmax(p, q, G=16):
    d = np.abs(p - q); h, w = (d.shape[0] // G) * G, (d.shape[1] // G) * G
    return float(d[:h, :w].reshape(h // G, G, w // G, G).mean((1, 3)).max())
def decode(f0, n):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{f0 / FPS:.6f}', '-i', src, '-frames:v', str(n), '-vf', 'scale=in_color_matrix=auto:in_range=auto,format=rgb24', '-f', 'rawvideo', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
def render(frames_spec, d):
    shutil.rmtree(d, ignore_errors=True)
    env = dict(os.environ, OUTDIR=d, BUNDLE_DIR=BUNDLE)
    r = subprocess.run(['node', 'scripts/render_frames.mjs', comp, *frames_spec], env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-2000:]
    return os.path.join(d, comp)
disagree = {}
CH = 60
for c0 in range(a, b + 1, CH):
    c1 = min(b, c0 + CH - 1)
    rd = render([f'{c0}-{c1}'], tmp + '_r2')
    orig = decode(c0, c1 - c0 + 1)
    assert len(orig) == c1 - c0 + 1, (c0, len(orig))
    for i, n in enumerate(range(c0, c1 + 1)):
        r2 = np.asarray(Image.open(f'{rd}/{n}.png').convert('RGB'))
        d = bmax(small(orig[i]), small(r2))
        if d > T:
            keep = os.path.join(tmp + '_keep', f'{n}.png'); os.makedirs(os.path.dirname(keep), exist_ok=True)
            shutil.move(f'{rd}/{n}.png', keep); disagree[n] = (d, keep)
    print(f'{comp} {c0}-{c1}: 不一致 {sum(1 for k in disagree if c0 <= k <= c1)} 帧', flush=True)
fix, unresolved = [], []
if disagree:
    rd3 = render([str(n) for n in sorted(disagree)], tmp + '_r3')
    for n in sorted(disagree):
        o = small(decode(n, 1)[0]); r2 = small(np.asarray(Image.open(disagree[n][1]).convert('RGB'))); r3 = small(np.asarray(Image.open(f'{rd3}/{n}.png').convert('RGB')))
        d_o3, d_23 = bmax(o, r3), bmax(r2, r3)
        if d_23 <= T and d_o3 > T: shutil.copy(disagree[n][1], os.path.join(outdir, f'{n}.png')); fix.append(n)   # 成片是坏帧
        elif d_o3 <= T: pass                                                                                    # 第二遍是坏帧，成片正确
        else: unresolved.append((n, round(d_o3, 1), round(d_23, 1)))
print(f'{comp}: 不一致 {len(disagree)} 帧 → 成片坏帧（需替换）{len(fix)}：{fix}；无法判定：{unresolved}')
for d in (tmp + '_r2', tmp + '_r3', tmp + '_keep', BUNDLE): shutil.rmtree(d, ignore_errors=True)
