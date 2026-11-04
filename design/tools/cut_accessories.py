"""액세서리 시트(흰 배경, 가로 1줄) → 개별 투명 PNG
사용: python -I design/tools/cut_accessories.py design/concepts/accessories.png public/character
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = Path(sys.argv[1]), Path(sys.argv[2])
NAMES = ["crown", "cap", "ribbon", "flower", "medal"]
img = Image.open(src).convert("RGB")
a = np.asarray(img).astype(np.int16)
ink = (a.min(axis=2) < 232)
cols = ink.sum(axis=0) > 2
# 연속 구간 찾기
segs, start = [], None
for x, v in enumerate(cols):
    if v and start is None: start = x
    if not v and start is not None:
        if x - start > 30: segs.append((start, x))
        start = None
if start is not None: segs.append((start, len(cols)))
print("segments", segs)
assert len(segs) == len(NAMES), len(segs)
for name, (x0, x1) in zip(NAMES, segs):
    crop = img.crop((max(0, x0 - 20), 0, min(img.width, x1 + 20), img.height))
    probe = crop.copy()
    W, H = crop.size
    for p in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]:
        ImageDraw.floodfill(probe, p, (255, 0, 255), thresh=14)
    bg = np.all(np.asarray(probe) == (255, 0, 255), axis=2)
    alpha = Image.fromarray(((~bg) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
    rgba = crop.convert("RGBA"); rgba.putalpha(alpha)
    rgba = rgba.crop(rgba.getbbox())
    rgba.thumbnail((360, 360), Image.LANCZOS)
    rgba.save(out / f"acc-{name}.png", optimize=True)
    print(name, rgba.size)
