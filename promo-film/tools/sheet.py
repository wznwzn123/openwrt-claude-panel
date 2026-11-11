# 静帧拼成一张联系表（自检用）
import sys
from PIL import Image, ImageDraw
files = sys.argv[2:]; out = sys.argv[1]
ims = [Image.open(f).convert('RGB').resize((640, 360)) for f in files]
cols = 3 if len(ims) > 4 else 2
rows = (len(ims) + cols - 1) // cols
c = Image.new('RGB', (cols * 650, rows * 390), (30, 30, 30))
d = ImageDraw.Draw(c)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * 650, (i // cols) * 390
    c.paste(im, (x, y)); d.text((x + 6, y + 364), f.split('/')[-1], fill=(255, 255, 0))
c.save(out)
