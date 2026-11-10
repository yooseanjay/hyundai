"""캐릭터 원본 이미지 → 앱용 에셋 생성
- 앞면 스크린의 얼굴을 지워 빈 화면으로 만든다 (얼굴은 앱에서 SVG로 그려 표정을 바꾼다)
- 흰 배경을 투명하게 만든다
- 스크린 영역 마스크와 좌표(screen.json)를 함께 내보낸다

사용: python -I design/tools/prepare_character.py design/concepts/C_yellow_screen-face.png public/character
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

img = Image.open(src).convert("RGB")
a = np.asarray(img).astype(np.int16)
H, W = a.shape[:2]
lum = a.mean(axis=2)

# 1) 스크린 영역 찾기: 대략적인 박스 안의 어두운 픽셀 → 행마다 좌우 끝 사이를 채운다
x0, x1, y0, y1 = 100, 680, 420, 625
dark = np.zeros((H, W), bool)
dark[y0:y1, x0:x1] = lum[y0:y1, x0:x1] < 70
screen = np.zeros((H, W), bool)
for y in range(y0, y1):
    xs = np.where(dark[y])[0]
    if len(xs) > 40:
        screen[y, xs.min(): xs.max() + 1] = True
# 위아래도 같은 방식으로 채워 눈 하이라이트로 생긴 구멍 제거
for x in range(x0, x1):
    ys = np.where(screen[:, x])[0]
    if len(ys) > 10:
        screen[ys.min(): ys.max() + 1, x] = True

mask_img = Image.fromarray((screen * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
# 경계 부드럽게
soft = mask_img.filter(ImageFilter.GaussianBlur(1.5))
ys, xs = np.where(np.asarray(mask_img) > 0)
bx0, bx1, by0, by1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())

# 2) 빈 스크린 그리기: 세로 그라데이션 + 위쪽 은은한 반사광
grad = np.zeros((H, W, 3), np.float32)
t = np.clip((np.arange(H) - by0) / max(1, by1 - by0), 0, 1)[:, None]
top, bottom = np.array([34, 34, 40]), np.array([12, 12, 16])
grad[:] = (top * (1 - t) + bottom * t)[:, :, None].transpose(0, 2, 1) if False else (top * (1 - t)[..., None] + bottom * t[..., None])
glare = Image.new("L", (W, H), 0)
ImageDraw.Draw(glare).rounded_rectangle([bx0 + 30, by0 + 8, bx1 - 30, by0 + 34], radius=14, fill=38)
glare = np.asarray(glare.filter(ImageFilter.GaussianBlur(8))).astype(np.float32)[..., None]
blank = np.clip(grad + glare, 0, 255)

alpha = np.asarray(soft).astype(np.float32)[..., None] / 255
out = a * (1 - alpha) + blank * alpha
body = Image.fromarray(out.astype(np.uint8))

# 3) 흰 배경 제거: 네 모서리에서 flood fill
probe = body.copy()
MARK = (255, 0, 255)
for p in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0)]:
    ImageDraw.floodfill(probe, p, MARK, thresh=60)
bg = np.all(np.asarray(probe) == MARK, axis=2)
bg_alpha = Image.fromarray(((~bg) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
rgba = body.convert("RGBA")
rgba.putalpha(bg_alpha)

# 4) 차 영역으로 크롭 + 리사이즈
bbox = rgba.getbbox()
pad = 12
cx0, cy0 = max(0, bbox[0] - pad), max(0, bbox[1] - pad)
cx1, cy1 = min(W, bbox[2] + pad), min(H, bbox[3] + pad)
rgba = rgba.crop((cx0, cy0, cx1, cy1))
scr_mask = mask_img.crop((cx0, cy0, cx1, cy1))
TARGET_W = 720
scale = TARGET_W / rgba.width
size = (TARGET_W, round(rgba.height * scale))
rgba = rgba.resize(size, Image.LANCZOS)
scr_mask = scr_mask.resize(size, Image.LANCZOS)

rgba.save(out_dir / "body.png", optimize=True)

w, h = size
info = {
    "width": w,
    "height": h,
    "screen": {
        "left": round((bx0 - cx0) * scale / w * 100, 2),
        "top": round((by0 - cy0) * scale / h * 100, 2),
        "width": round((bx1 - bx0) * scale / w * 100, 2),
        "height": round((by1 - by0) * scale / h * 100, 2),
    },
}
(out_dir / "screen.json").write_text(json.dumps(info, indent=2))
print(json.dumps(info))
