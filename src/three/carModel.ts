// 아이오닉 5 느낌의 3D 자동차를 코드로 만든다 (외부 모델 파일 없음).
// 앞(+x) · 위(+y) · 오른쪽(+z). 길이 약 4.6, 폭 1.9, 높이 1.6 (미터 단위 느낌)
import * as THREE from 'three';
import type { BodyColor } from '../data/hyundaiModels';
import type { Mood } from '../game/character';
import type { CosmeticId } from '../game/progress';
import { drawFace } from './face';

const WHEEL_R = 0.38;
const WHEEL_X = 1.45; // 축간거리 2.9
const HALF_W = 0.93;

/** 흑백 디자인: 차체는 무채색 (유채색 선택은 실버) */
const PAINT: Partial<Record<BodyColor, string>> = { white: '#ececec', gray: '#6c7076', black: '#1b1c1f', beige: '#d6d1c6' };
const paintOf = (c?: BodyColor) => PAINT[c ?? 'silver'] ?? '#c4c8ce';

export interface CarRig {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  setMood(m: Mood, cosmetic: CosmeticId): void;
  setBlink(closed: boolean): void;
  setColor(c?: BodyColor): void;
  setCosmetic(c: CosmeticId, base: string): void;
  dispose(): void;
}

function sideShape(points: [number, number][]) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function extrude(shape: THREE.Shape, depth: number, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function buildCar(): CarRig {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const paint = keep(new THREE.MeshPhysicalMaterial({ color: paintOf(), metalness: 0.45, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6 }));
  const glass = keep(new THREE.MeshPhysicalMaterial({ color: '#0b0d10', metalness: 0.2, roughness: 0.05, clearcoat: 1 }));
  const black = keep(new THREE.MeshStandardMaterial({ color: '#141518', metalness: 0.2, roughness: 0.6 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: '#0d0d0e', roughness: 0.9 }));
  const rim = keep(new THREE.MeshStandardMaterial({ color: '#8d9198', metalness: 0.9, roughness: 0.3 }));
  const led = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 2.2 }));
  const tail = keep(new THREE.MeshStandardMaterial({ color: '#ff3b3b', emissive: '#ff2a2a', emissiveIntensity: 1.6 }));

  // ---- 차체 (옆모습을 밀어낸 덩어리) ----
  const body = new THREE.Mesh(
    keep(extrude(sideShape([
      [-2.22, 0.32], [2.18, 0.32], [2.3, 0.5], [2.3, 0.84], [2.16, 0.94], [1.05, 1.04], [-1.9, 1.06], [-2.24, 1.0], [-2.28, 0.8], [-2.28, 0.46],
    ]), HALF_W * 2 - 0.1, 0.06)),
    paint,
  );
  group.add(body);

  // ---- 유리 캐빈 ----
  const cabin = new THREE.Mesh(
    keep(extrude(sideShape([[1.0, 1.02], [0.12, 1.5], [-1.62, 1.5], [-2.12, 1.08]]), 1.6, 0.05)),
    glass,
  );
  group.add(cabin);
  // 지붕 (차체색 얇은 판) + C필러 (아이오닉 특유의 각진 기둥)
  const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(1.72, 0.05, 1.56)), paint);
  roof.position.set(-0.75, 1.55, 0);
  group.add(roof);
  for (const z of [-1, 1]) {
    const c = new THREE.Mesh(keep(extrude(sideShape([[-1.25, 1.05], [-1.62, 1.5], [-1.9, 1.5], [-2.16, 1.06]]), 0.04, 0.01)), paint);
    c.position.z = z * 0.86;
    group.add(c);
    const a = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.62, 0.05)), black);
    a.position.set(0.55, 1.27, z * 0.86);
    a.rotation.z = Math.atan2(0.88, 0.48);
    group.add(a);
    // 사이드미러
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(0.2, 0.1, 0.16)), paint);
    m.position.set(0.95, 1.1, z * 1.0);
    group.add(m);
  }

  // ---- 바퀴 아치 · 하단 검은 클래딩 ----
  for (const x of [WHEEL_X, -WHEEL_X]) for (const z of [-1, 1]) {
    const arch = new THREE.Mesh(keep(new THREE.RingGeometry(WHEEL_R + 0.05, WHEEL_R + 0.15, 24, 1, 0, Math.PI)), black);
    arch.position.set(x, WHEEL_R + 0.02, z * (HALF_W + 0.012));
    if (z < 0) arch.rotation.y = Math.PI;
    group.add(arch);
  }
  for (const z of [-1, 1]) {
    const sill = new THREE.Mesh(keep(new THREE.BoxGeometry(1.9, 0.12, 0.04)), black);
    sill.position.set(0, 0.38, z * (HALF_W + 0.01));
    group.add(sill);
  }

  // ---- 앞: 검은 띠 + 픽셀 라이트 + 얼굴 화면 ----
  const band = new THREE.Mesh(keep(new THREE.BoxGeometry(0.04, 0.11, 1.5)), black);
  band.position.set(2.31, 0.8, 0);
  group.add(band);
  const pix = keep(new THREE.BoxGeometry(0.02, 0.045, 0.045));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const p = new THREE.Mesh(pix, led);
      p.position.set(2.33, 0.77 + j * 0.06, side * (0.56 + i * 0.06));
      group.add(p);
      const t = new THREE.Mesh(pix, tail);
      t.position.set(-2.3, 0.86 + j * 0.06, side * (0.52 + i * 0.07));
      group.add(t);
    }
  }
  const lower = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.18, 1.3)), black);
  lower.position.set(2.27, 0.42, 0);
  group.add(lower);

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 512;
  faceCanvas.height = 200;
  const faceTex = keep(new THREE.CanvasTexture(faceCanvas));
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(0.05, 0.25, 0.6)), black);
  frame.position.set(2.31, 0.6, 0);
  group.add(frame);
  const screen = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(0.54, 0.21)),
    keep(new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false })),
  );
  screen.position.set(2.338, 0.6, 0);
  screen.rotation.y = Math.PI / 2;
  group.add(screen);

  // ---- 바퀴 (터빈 모양 휠) ----
  const wheels: THREE.Object3D[] = [];
  const tireG = keep(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 36));
  const rimG = keep(new THREE.CylinderGeometry(0.27, 0.27, 0.27, 36));
  const spokeG = keep(new THREE.BoxGeometry(0.05, 0.25, 0.02));
  for (const x of [WHEEL_X, -WHEEL_X]) for (const z of [-1, 1]) {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(tireG, rubber);
    tire.rotation.x = Math.PI / 2;
    const r = new THREE.Mesh(rimG, black);
    r.rotation.x = Math.PI / 2;
    w.add(tire, r);
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Mesh(spokeG, rim);
      const a = (k / 10) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, z * 0.14);
      s.rotation.z = a + 0.5; // 비틀린 터빈 날개
      w.add(s);
    }
    w.position.set(x, WHEEL_R, z * (HALF_W - 0.1));
    group.add(w);
    wheels.push(w);
  }

  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  screen.castShadow = false;

  // ---- 꾸미기 (지붕 위 스프라이트) ----
  let acc: THREE.Sprite | null = null;
  let accTex: THREE.Texture | null = null;
  const clearAcc = () => {
    if (acc) group.remove(acc);
    acc?.material.dispose();
    accTex?.dispose();
    acc = null;
    accTex = null;
  };

  let mood: Mood = 'happy';
  let cosmetic: CosmeticId = 'none';
  const redraw = (closed = false) => {
    drawFace(faceCanvas, mood, cosmetic, closed);
    faceTex.needsUpdate = true;
  };

  return {
    group,
    wheels,
    setMood(m, c) {
      mood = m;
      cosmetic = c;
      redraw();
    },
    setBlink(closed) { redraw(closed); },
    setColor(c) { paint.color.set(paintOf(c)); },
    setCosmetic(c, base) {
      clearAcc();
      const file: Partial<Record<CosmeticId, [string, number, number, number]>> = {
        // [이미지, x, y, 크기]
        crown: ['acc-crown.png', -0.55, 1.86, 0.55],
        cap: ['acc-cap.png', -0.55, 1.84, 0.7],
        scarf: ['acc-ribbon.png', -0.4, 1.76, 0.5],
        flower: ['acc-flower.png', 0.2, 1.68, 0.35],
        wrench: ['acc-medal.png', -0.2, 0.8, 0.32],
      };
      const f = file[c];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        // 흑백 디자인에 맞게 회색조로
        const cv = document.createElement('canvas');
        cv.width = img.width;
        cv.height = img.height;
        const g = cv.getContext('2d')!;
        g.filter = 'grayscale(1) brightness(1.1)';
        g.drawImage(img, 0, 0);
        accTex = new THREE.CanvasTexture(cv);
        accTex.colorSpace = THREE.SRGBColorSpace;
        acc = new THREE.Sprite(new THREE.SpriteMaterial({ map: accTex, transparent: true }));
        acc.position.set(f[1], f[2], c === 'wrench' ? HALF_W + 0.05 : 0);
        acc.scale.set(f[3], f[3] * (img.height / img.width), 1);
        group.add(acc);
      };
      img.src = `${base}character/${f[0]}`;
    },
    dispose() {
      clearAcc();
      disposables.forEach((d) => d.dispose());
    },
  };
}

export { WHEEL_R };
