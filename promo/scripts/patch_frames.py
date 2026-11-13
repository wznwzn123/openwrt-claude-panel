"""第七版：把 out/patch/<合成名>/<帧号>.png 替换进视频（单帧故障修复 / 局部文案修改），按原交付参数重新编码。
走 RGB 管线（原片解码为 RGB → 替换 → 再编码），补渲帧与原片色彩一致，不会出现亮度跳变。
用法：python3 scripts/patch_frames.py final <原视频> <补帧目录> <音频> <输出>      # 主片 / 竖屏：同 finalize.sh 参数
      python3 scripts/patch_frames.py plate <原视频> <补帧目录> - <输出>         # 剪映底片：yuvj420p，无音轨"""
import subprocess, sys, os, json
import numpy as np
from PIL import Image
mode, src, pdir, audio, out = sys.argv[1:6]
info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                                  '-of', 'json', src], capture_output=True, text=True).stdout)['streams'][0]
W, H, FR = info['width'], info['height'], info['r_frame_rate']
patch = {int(f[:-4]): os.path.join(pdir, f) for f in os.listdir(pdir) if f.endswith('.png') and f[:-4].isdigit()}
dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-vf', 'scale=in_color_matrix=auto:in_range=auto,format=rgb24', '-f', 'rawvideo', '-'],
                       stdout=subprocess.PIPE)
tmp = out + '.tmp.mp4'
enc = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', FR, '-i', '-']
if mode == 'final':
    enc += ['-i', audio, '-map', '0:v', '-map', '1:a',
            '-vf', 'scale=out_range=tv:out_color_matrix=bt709,format=yuv420p',
            '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '16', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
            '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
            '-af', 'volume=0.6dB,aresample=192000,alimiter=limit=0.72:attack=1:release=60:level=false:asc=1,aresample=48000',
            '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', tmp]
else:
    enc += ['-vf', 'scale=out_range=pc:out_color_matrix=bt601,format=yuvj420p',
            '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', '16', '-movflags', '+faststart', tmp]
e = subprocess.Popen(enc, stdin=subprocess.PIPE)
n, rep, big = 0, 0, []
sz = W * H * 3
while True:
    b = dec.stdout.read(sz)
    if len(b) < sz: break
    if n in patch:
        p = np.asarray(Image.open(patch[n]).convert('RGB'))
        assert p.shape == (H, W, 3), (n, p.shape)
        v = np.frombuffer(b, np.uint8).reshape(H, W, 3).astype(np.int16)
        d = np.abs(v - p).mean(); bias = (p.astype(np.int16) - v).mean()
        if d > 3: big.append((n, round(float(d), 1)))
        if abs(bias) > 2: print(f'  !! 帧 {n} 亮度偏差 {bias:.2f}')
        b = p.tobytes(); rep += 1
    e.stdin.write(b); n += 1
e.stdin.close(); e.wait(); dec.wait()
assert e.returncode == 0, '编码失败'
os.replace(tmp, out)
print(f'{out}: 共 {n} 帧，替换 {rep} 帧；与原帧差异明显（>3）的帧：{big}')
