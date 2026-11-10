"""차체 PNG 아래에 남은 흰 바닥(그림자판)을 지운다.

투명 영역과 맞닿은 '밝고 채도 낮은' 픽셀만 바깥에서부터 flood-fill로 제거하므로,
타이어(회색)로 둘러싸인 휠 허브 같은 안쪽 밝은 부분은 건드리지 않는다.
사용: python -I design/tools/remove_floor.py public/character/body-*.png
"""
import sys
from collections import deque

import numpy as np
from PIL import Image


def clean(path: str) -> int:
    im = Image.open(path).convert("RGBA")
    a = np.array(im).astype(np.int32)
    h, w, _ = a.shape
    rgb, al = a[..., :3], a[..., 3]
    sat = rgb.max(-1) - rgb.min(-1)
    br = rgb.mean(-1)
    floorish = (sat < 22) & (br > 175)
    top = int(h * 0.55)  # 바닥은 아래쪽에만 있다

    seen = np.zeros((h, w), bool)
    q = deque()
    for y in range(top, h):
        for x in range(w):
            if al[y, x] < 20 and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    removed = np.zeros((h, w), bool)
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if ny < top or ny >= h or nx < 0 or nx >= w or seen[ny, nx]:
                continue
            seen[ny, nx] = True
            if al[ny, nx] < 20 or floorish[ny, nx]:
                if al[ny, nx] >= 20:
                    removed[ny, nx] = True
                q.append((ny, nx))

    out = a.copy()
    out[removed, 3] = 0
    # 경계 1px 부드럽게: 지운 영역에 닿은 밝은 픽셀은 반투명으로
    edge = np.zeros_like(removed)
    edge[1:, :] |= removed[:-1, :]
    edge[:-1, :] |= removed[1:, :]
    edge[:, 1:] |= removed[:, :-1]
    edge[:, :-1] |= removed[:, 1:]
    edge &= ~removed & (br > 160) & (sat < 30)
    out[edge, 3] = (out[edge, 3] * 0.45).astype(np.int32)
    Image.fromarray(out.astype(np.uint8), "RGBA").save(path)
    return int(removed.sum())


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(p, clean(p), "px removed")
