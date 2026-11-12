"""单帧异常扫描：逐帧平均亮度，找出与前后两帧都相差悬殊、而前后两帧彼此接近的孤立帧（闪黑/闪白/丢层）。
用法：python3 scripts/frame_scan.py out/assembled.mp4 [fps]   → 打印异常帧号；无异常时输出 CLEAN"""
import subprocess, sys, re
src = sys.argv[1]
out = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-vf', 'scale=320:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-an', '-f', 'null', '-'],
                     capture_output=True, text=True).stdout
y = [float(m) for m in re.findall(r'YAVG=([0-9.]+)', out)]
bad = []
for i in range(1, len(y) - 1):
    a, b, c = y[i - 1], y[i], y[i + 1]
    if abs(a - c) < 6 and abs(b - a) > 15 and abs(b - c) > 15:
        bad.append(i)
print(f'frames {len(y)}')
print('ANOMALIES ' + ' '.join(map(str, bad)) if bad else 'CLEAN')
