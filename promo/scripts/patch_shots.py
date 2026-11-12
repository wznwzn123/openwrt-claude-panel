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
    # 按列上下插值补底（卡片底色多为横向渐变，左右插值会留色带）
    top = a[max(0, y0 - 2):y0].mean(0); bot = a[y1:y1 + 2].mean(0)
    for y in range(y0, y1):
        k = (y - y0) / max(1, y1 - y0)
        a[y, x0:x1] = top[x0:x1] * (1 - k) + bot[x0:x1] * k
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
    if name == 'offline':
        im = patch(im, (276, 244, 320, 264), '套件', 13, (40, 40, 48), 700, 'left')
        im = patch(im, (32, 146, 356, 163), '网络套件，断了会自动修复并记下原因。记录存在路由器闪', 13.4, (88, 88, 96), 380)
    if name == 'devices':
        im = patch(im, (113, 296, 183, 315), '智能调度 3', 12.5, (0, 122, 255), 600, 'center')
    if name == 'traffic':
        im = patch(im, (30, 129, 352, 146), '每台设备用了多少流量，分「专线」和「直连」。每分钟更', 12.5, (90, 90, 96), 400)
        im = patch(im, (30, 403, 170, 419), '专线 3.7 GB（76%）', 12.5, (60, 60, 67), 400)
    im.save(f'public/shots/{name}.png')
print('patched')
