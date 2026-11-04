"""노란 캐릭터 본체(body.png)의 차체 색만 바꿔 색상별 이미지를 만든다.
스크린(검정), 창문, 바퀴(회색), 볼터치(분홍)는 그대로 둔다.
사용: python -I design/tools/recolor_body.py public/character/body.png public/character
"""
import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
img = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32) / 255
rgb, a = img[..., :3], img[..., 3:]

# RGB → HSV (벡터화)
mx, mn = rgb.max(-1), rgb.min(-1)
v = mx
d = mx - mn
s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
h = np.zeros_like(mx)
m = d > 1e-6
h = np.where(m & (mx == r), ((g - b) / np.maximum(d, 1e-6)) % 6, h)
h = np.where(m & (mx == g), (b - r) / np.maximum(d, 1e-6) + 2, h)
h = np.where(m & (mx == b), (r - g) / np.maximum(d, 1e-6) + 4, h)
h = h / 6  # 0~1

# 차체 = 노란 계열(약 30~70도) + 채도 있음
body = (h > 30 / 360) & (h < 75 / 360) & (s > 0.18)
# 부드러운 경계를 위해 채도로 가중
w = np.clip((s - 0.18) / 0.15, 0, 1) * body

# (이름, 목표 색조, 채도 배율, 명도 배율, 명도 오프셋)
PALETTE = {
    "yellow": None,
    "white": (0.0, 0.0, 1.06, 0.06),
    "silver": (0.6, 0.05, 0.86, 0.0),
    "gray": (0.6, 0.08, 0.62, 0.0),
    "black": (0.65, 0.12, 0.32, 0.0),
    "blue": (0.6, 0.85, 0.92, 0.0),
    "red": (0.99, 0.82, 0.95, 0.0),
    "green": (0.42, 0.55, 0.78, 0.0),
    "mint": (0.47, 0.42, 0.98, 0.0),
    "beige": (0.09, 0.28, 1.0, 0.0),
}


def hsv2rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    choices = [
        np.stack([v, t, p], -1), np.stack([q, v, p], -1), np.stack([p, v, t], -1),
        np.stack([p, q, v], -1), np.stack([t, p, v], -1), np.stack([v, p, q], -1),
    ]
    outp = np.zeros(h.shape + (3,), np.float32)
    for k in range(6):
        outp = np.where((i == k)[..., None], choices[k], outp)
    return outp


for name, spec in PALETTE.items():
    if spec is None:
        res = rgb
    else:
        th, smul, vmul, voff = spec
        nh = np.full_like(h, th)
        ns = np.clip(s * smul, 0, 1)
        nv = np.clip(v * vmul + voff, 0, 1)
        new = hsv2rgb(nh, ns, nv)
        res = rgb * (1 - w[..., None]) + new * w[..., None]
    o = np.concatenate([res, a], -1)
    Image.fromarray((o * 255).astype(np.uint8)).save(out / f"body-{name}.png", optimize=True)
    print("saved", name)
