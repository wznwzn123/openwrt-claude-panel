"""国内平台合规：真实截图中的「走代理」「更新订阅」原位替换（逐行左右底色插值补底 + 同字体重排文字）"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np
F = 'public/fonts/NotoSansSC-VF.ttf'
def font(size, w):
    f = ImageFont.truetype(F, size)
    try: f.set_variation_by_axes([w])
    except Exception: pass
    return f
def patch(im, box, text, size, color, weight=500, align='left'):
    x0, y0, x1, y1 = box
    a = np.asarray(im).astype(float)
    for y in range(y0, y1):
        l = a[y, max(0, x0 - 3):x0].mean(0); r = a[y, x1:x1 + 3].mean(0)
        for x in range(x0, x1):
            k = (x - x0) / max(1, x1 - x0); a[y, x] = l * (1 - k) + r * k
    im = Image.fromarray(a.clip(0, 255).astype('uint8'))
    d = ImageDraw.Draw(im); f = font(size, weight)
    bb = d.textbbox((0, 0), text, font=f); tw = bb[2] - bb[0]; th = bb[3] - bb[1]
    tx = x0 if align == 'left' else (x0 + x1 - tw) / 2
    d.text((tx - bb[0], (y0 + y1 - th) / 2 - bb[1]), text, font=f, fill=color)
    return im
NAV = (98, 741, 152, 758)
for name in ('home', 'devices', 'traffic', 'offline', 'dark', 'pause'):
    im = Image.open(f'public/shots/orig/{name}.png').convert('RGB')
    if name != 'pause':
        col = (230, 233, 240) if name == 'dark' else (40, 40, 48)
        im = patch(im, NAV, '同步配置', 11, col, 600, 'center')
    if name == 'devices':
        im = patch(im, (113, 296, 183, 315), '3 个分流', 13, (0, 122, 255), 600, 'center')
    if name == 'traffic':
        im = patch(im, (30, 129, 352, 146), '每台设备用了多少流量，分「专线」和「直连」。每分钟更', 12.5, (90, 90, 96), 400)
        im = patch(im, (30, 403, 170, 419), '专线 3.7 GB（76%）', 12.5, (60, 60, 67), 400)
    im.save(f'public/shots/{name}.png')
print('patched')
