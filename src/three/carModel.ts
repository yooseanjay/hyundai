// 현대차 차종별 3D 자동차를 코드로 만든다 (외부 모델 파일 없음).
// 앞(+x) · 위(+y) · 오른쪽(+z). 차종 치수는 shapes.ts
import * as THREE from 'three';
import { PAINTS, type BodyColor } from '../data/hyundaiModels';
import type { Mood } from '../game/character';
import type { CosmeticId } from '../game/progress';
import { DEFAULT_STYLE, type CharStyle } from '../game/style';
import { drawFace } from './face';
import { shapeOf, type CarShape } from './shapes';

const paintOf = (c?: BodyColor) => (c && PAINTS[c]?.hex) || '#c4c8ce';

export interface CarRig {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  wheelR: number;
  setMood(m: Mood, cosmetic: CosmeticId): void;
  setBlink(closed: boolean): void;
  setColor(c?: BodyColor): void;
  setStyle(s: CharStyle): void;
  setCosmetic(c: CosmeticId, base: string): void;
  /** 실제 차 3D 모델(GLB)로 차체를 바꿈. 얼굴 화면·액세서리는 그대로 */
  useModel(root: THREE.Object3D, rotY?: number): void;
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

export function buildCar(shapeId?: string): CarRig {
  const S: CarShape = shapeOf(shapeId);
  const { L, W, wr, wb, bottom, noseTop, roofY, roofFX, roofBX, deckX } = S;
  const [cowlX, cowlY] = S.cowl;
  const F = L + 0.06; // 차체 모서리 둥글림(bevel)만큼 앞뒤가 튀어나옴
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const add = (m: THREE.Object3D, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); group.add(m); return m; };
  const box = (w: number, h: number, d: number, mat: THREE.Material) => new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);

  const paint = keep(new THREE.MeshPhysicalMaterial({ color: paintOf(), metalness: 0.45, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6 }));
  const glass = keep(new THREE.MeshPhysicalMaterial({ color: '#0b0d10', metalness: 0.2, roughness: 0.05, clearcoat: 1 }));
  const black = keep(new THREE.MeshStandardMaterial({ color: '#141518', metalness: 0.2, roughness: 0.6 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: '#0d0d0e', roughness: 0.9 }));
  const rim = keep(new THREE.MeshStandardMaterial({ color: '#8d9198', metalness: 0.9, roughness: 0.3 }));
  const led = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 2.2 }));
  const tail = keep(new THREE.MeshStandardMaterial({ color: '#ff3b3b', emissive: '#ff2a2a', emissiveIntensity: 1.6 }));
  const nRed = keep(new THREE.MeshStandardMaterial({ color: '#e0202a', emissive: '#a0141a', emissiveIntensity: 0.6 }));
  const metal = keep(new THREE.MeshStandardMaterial({ color: '#9a9ea5', metalness: 0.8, roughness: 0.35 }));

  // ---- 차체 (옆모습을 밀어낸 덩어리) ----
  const outline: [number, number][] = [
    [-L + 0.08, bottom], [L - 0.14, bottom], [L, bottom + 0.18], [L, noseTop - 0.1], [L - 0.14, noseTop],
    [cowlX, cowlY], [deckX, S.beltRear],
  ];
  if (deckX > -L + 0.16) outline.push([-L + 0.12, S.tailTop]);
  outline.push([-L, S.tailTop - 0.2], [-L, bottom + 0.12]);
  add(new THREE.Mesh(keep(extrude(sideShape(outline), W * 2 - 0.1, 0.06)), paint));

  // ---- 유리 캐빈 + 지붕 ----
  const deckY = S.beltRear + 0.02;
  add(new THREE.Mesh(keep(extrude(sideShape([[cowlX - 0.05, cowlY - 0.02], [roofFX, roofY], [roofBX, roofY], [deckX, deckY]]), W * 2 - 0.26, 0.05)), glass));
  add(box(roofFX - roofBX + 0.08, 0.05, W * 2 - 0.3, paint), (roofFX + roofBX) / 2, roofY + 0.05, 0);
  for (const z of [-1, 1]) {
    // A필러
    const a = box(0.06, Math.hypot(roofFX - cowlX, roofY - cowlY), 0.05, black);
    add(a, (cowlX + roofFX) / 2, (cowlY + roofY) / 2, z * (W - 0.07));
    a.rotation.z = Math.atan2(cowlX - roofFX, roofY - cowlY);
    // 사이드미러
    add(box(0.2, 0.1, 0.16, paint), cowlX - 0.1, cowlY + 0.08, z * (W + 0.07));
  }

  // ---- 짐칸 (ST1 박스 · 포터 적재함) ----
  if (S.cargo) {
    const len = S.cargo.from + L;
    const cx = (S.cargo.from - L) / 2;
    if (S.cargo.open) {
      add(box(len, 0.08, W * 2, metal), cx, S.tailTop, 0);
      for (const z of [-1, 1]) add(box(len, S.cargo.top - S.tailTop, 0.04, metal), cx, (S.cargo.top + S.tailTop) / 2, z * (W - 0.02));
      add(box(0.04, S.cargo.top - S.tailTop, W * 2, metal), -L + 0.02, (S.cargo.top + S.tailTop) / 2, 0);
      add(box(0.06, S.cargo.top - S.tailTop + 0.2, W * 2, black), S.cargo.from, (S.cargo.top + S.tailTop) / 2 + 0.1, 0);
    } else {
      add(box(len, S.cargo.top - bottom - 0.05, W * 2 - 0.04, paint), cx, (S.cargo.top + bottom + 0.05) / 2, 0);
      for (const z of [-1, 1]) add(box(len - 0.3, 0.03, 0.01, black), cx, S.cargo.top - 0.35, z * (W - 0.01));
    }
  }

  // ---- 바퀴 아치 · 하단 검은 클래딩 ----
  for (const x of [wb, -wb]) for (const z of [-1, 1]) {
    const arch = new THREE.Mesh(keep(new THREE.RingGeometry(wr + 0.05, wr + 0.15, 24, 1, 0, Math.PI)), black);
    add(arch, x, wr + 0.02, z * (W + 0.012));
    if (z < 0) arch.rotation.y = Math.PI;
  }
  for (const z of [-1, 1]) add(box(wb * 2 - wr * 2 - 0.2, 0.12, 0.04, S.sport ? nRed : black), 0, bottom + 0.06, z * (W + 0.01));

  // ---- 앞: 검은 띠 + 라이트 + 얼굴 화면 ----
  const lampY = noseTop - 0.15;
  add(box(0.04, 0.11, W * 1.6, black), F + 0.01, lampY, 0);
  if (S.lamp === 'pixel') {
    const pix = keep(new THREE.BoxGeometry(0.02, 0.045, 0.045));
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      add(new THREE.Mesh(pix, led), F + 0.03, lampY - 0.03 + j * 0.06, side * (W * 0.6 + i * 0.06));
      add(new THREE.Mesh(pix, tail), -F - 0.02, S.tailTop - 0.14 + j * 0.06, side * (W * 0.56 + i * 0.07));
    }
  } else {
    // 현대 최신 디자인: 앞뒤를 가로지르는 한 줄 라이트
    add(box(0.02, 0.03, W * 1.75, led), F + 0.03, noseTop - 0.07, 0);
    add(box(0.02, 0.035, W * 1.8, tail), -F - 0.02, S.tailTop - 0.1, 0);
    if (S.lamp === 'round') {
      const disc = keep(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 24));
      for (const side of [-1, 1]) {
        const d = new THREE.Mesh(disc, led);
        d.rotation.z = Math.PI / 2;
        add(d, F + 0.03, lampY - 0.02, side * W * 0.68);
      }
    }
  }
  add(box(0.06, 0.18, W * 1.4, black), F + 0.01, bottom + 0.1, 0);
  if (S.sport) {
    add(box(0.08, 0.025, W * 1.6, nRed), F, bottom - 0.02, 0); // 빨간 립
    const spoilerOnRoof = deckX < -L + 0.3;
    add(box(0.3, 0.035, W * 1.7, black), spoilerOnRoof ? roofBX - 0.08 : -L + 0.16, spoilerOnRoof ? roofY + 0.04 : S.tailTop + 0.1, 0);
  }

  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 512;
  faceCanvas.height = 200;
  const faceTex = keep(new THREE.CanvasTexture(faceCanvas));
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const faceY = bottom + (noseTop - bottom) * 0.45;
  const faceW = Math.min(0.8, W * 0.8); // 귀엽게 큰 얼굴 화면
  const frontFrame = add(box(0.05, faceW * 0.42, faceW * 1.1, black), F + 0.01, faceY, 0);
  frontFrame.userData.keep = true;
  const screen = new THREE.Mesh(keep(new THREE.PlaneGeometry(faceW, faceW * 0.39)), keep(new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false })));
  screen.rotation.y = Math.PI / 2;
  add(screen, F + 0.04, faceY, 0).userData.keep = true;

  // ---- 뒤 번호판에도 얼굴 (같은 얼굴 질감 → 깜빡임·표정 같이 바뀜) ----
  const rearX = S.cargo ? -L - 0.03 : -F - 0.04;
  const rearFaceY = bottom + (S.tailTop - bottom) * 0.38;
  const rearFrame = box(0.05, faceW * 0.42, faceW * 1.1, black);
  rearFrame.scale.setScalar(0.8);
  add(rearFrame, rearX + 0.03, rearFaceY, 0);
  const rearScreen = new THREE.Mesh(screen.geometry, screen.material);
  rearScreen.rotation.y = -Math.PI / 2;
  rearScreen.scale.setScalar(0.8);
  add(rearScreen, rearX, rearFaceY, 0);

  // ---- 바퀴 (터빈 모양 휠) ----
  const wheels: THREE.Object3D[] = [];
  const tireG = keep(new THREE.CylinderGeometry(wr, wr, 0.26, 36));
  const rimG = keep(new THREE.CylinderGeometry(wr * 0.71, wr * 0.71, 0.27, 36));
  const spokeG = keep(new THREE.BoxGeometry(0.05, wr * 0.66, 0.02));
  for (const x of [wb, -wb]) for (const z of [-1, 1]) {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(tireG, rubber);
    tire.rotation.x = Math.PI / 2;
    const r = new THREE.Mesh(rimG, black);
    r.rotation.x = Math.PI / 2;
    w.add(tire, r);
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Mesh(spokeG, rim);
      const a = (k / 10) * Math.PI * 2;
      s.position.set(Math.cos(a) * wr * 0.34, Math.sin(a) * wr * 0.34, z * 0.14);
      s.rotation.z = a + 0.5;
      w.add(s);
    }
    if (S.sport) {
      const cal = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 0.06, 0.02)), nRed);
      cal.position.set(wr * 0.45, 0, z * 0.12);
      w.add(cal);
    }
    w.position.set(x, wr, z * (W - 0.1));
    group.add(w);
    wheels.push(w);
  }

  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  screen.castShadow = false;

  // ---- 꾸미기 (지붕 위 스프라이트) ----
  let acc: THREE.Sprite | null = null;
  let accTex: THREE.Texture | null = null;
  let accReq = 0;
  const clearAcc = () => {
    if (acc) group.remove(acc);
    acc?.material.dispose();
    accTex?.dispose();
    acc = null;
    accTex = null;
  };

  let mood: Mood = 'happy';
  let cosmetic: CosmeticId = 'none';
  let style: CharStyle = DEFAULT_STYLE;
  const redraw = (closed = false) => {
    drawFace(faceCanvas, mood, cosmetic, closed, style);
    faceTex.needsUpdate = true;
  };
  const roofCX = (roofFX + roofBX) / 2;
  // 실제 3D 모델: 사진 질감(은색)에 고른 색을 곱해서 칠함
  let current: BodyColor | undefined;
  const modelMats: THREE.MeshStandardMaterial[] = [];
  const tintModel = () => {
    // 모델 질감이 원래 은색이라 흰색 계열은 그대로(#fff), 나머지는 실제 색을 곱함. 무광 색은 반사를 줄임
    const p = current ? PAINTS[current] : undefined;
    const hex = !p || parseInt(p.hex.slice(1, 3), 16) > 0xa8 ? '#ffffff' : p.hex;
    modelMats.forEach((m) => { m.color.set(hex); m.roughness = p?.matte ? 0.7 : 0.45; });
  };
  const topY = S.cargo && !S.cargo.open ? Math.max(roofY, S.cargo.top) : roofY;

  return {
    group,
    wheels,
    wheelR: wr,
    setMood(m, c) { mood = m; cosmetic = c; redraw(); },
    setBlink(closed) { redraw(closed); },
    setColor(c) {
      current = c;
      paint.color.set(paintOf(c));
      tintModel();
    },
    setStyle(s) { style = s; redraw(); },
    setCosmetic(c, base) {
      clearAcc();
      const req = ++accReq;
      const file: Partial<Record<CosmeticId, [string, number, number, number, number]>> = {
        // [이미지, x, y, z, 크기]
        crown: ['acc-crown.png', roofCX, topY + 0.31, 0, 0.55],
        cap: ['acc-cap.png', roofCX, topY + 0.29, 0, 0.7],
        scarf: ['acc-ribbon.png', roofCX + 0.35, topY + 0.21, 0, 0.5],
        flower: ['acc-flower.png', roofFX + 0.08, roofY + 0.13, 0, 0.35],
        wrench: ['acc-medal.png', -0.2, S.beltRear - 0.26, W + 0.05, 0.32],
      };
      const f = file[c];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        if (req !== accReq) return;
        accTex = new THREE.CanvasTexture(img);
        accTex.colorSpace = THREE.SRGBColorSpace;
        acc = new THREE.Sprite(new THREE.SpriteMaterial({ map: accTex, transparent: true }));
        acc.position.set(f[1], f[2], f[3]);
        acc.scale.set(f[4], f[4] * (img.height / img.width), 1);
        group.add(acc);
      };
      img.src = `${base}character/${f[0]}`;
    },
    useModel(root, rotY = 0) {
      // 크기·방향을 코드 차와 맞춤 (앞 +x, 바닥 y=0)
      const holder = new THREE.Group();
      holder.add(root);
      root.rotation.y = rotY;
      root.updateMatrixWorld(true);
      let box3 = new THREE.Box3().setFromObject(root);
      const size = box3.getSize(new THREE.Vector3());
      const k = (2 * F) / size.x;
      root.scale.multiplyScalar(k);
      root.updateMatrixWorld(true);
      box3 = new THREE.Box3().setFromObject(root);
      const c = box3.getCenter(new THREE.Vector3());
      root.position.set(root.position.x - c.x, root.position.y - box3.min.y, root.position.z - c.z);
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mt) => {
          const sm = mt as THREE.MeshStandardMaterial;
          if (!sm.isMeshStandardMaterial) return;
          sm.metalness = 0.35;
          sm.roughness = Math.min(sm.roughness, 0.45);
          sm.envMapIntensity = 1.3;
          modelMats.push(sm);
          disposables.push(sm);
          if (sm.map) disposables.push(sm.map);
        });
        disposables.push(m.geometry);
      });
      // 모델 표면을 찾아서 앞·뒤에 엠블럼 · 뒤 번호판 얼굴을 붙임 (라이트는 모델의 원래 칸 그대로)
      root.updateMatrixWorld(true);
      const mb = new THREE.Box3().setFromObject(root);
      const Hm = mb.max.y;
      const ray = new THREE.Raycaster();
      const at = (obj: THREE.Object3D, yr: number, z: number, dir: 1 | -1, off = 0.015) => {
        const y = Hm * yr;
        ray.set(new THREE.Vector3(dir * 20, y, z), new THREE.Vector3(-dir, 0, 0));
        const h = ray.intersectObject(root, true)[0];
        if (!h) return;
        obj.position.set(h.point.x + dir * off, y, z);
        if (!(obj as THREE.Sprite).isSprite) obj.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        holder.add(obj);
      };
      const rs = new THREE.Mesh(screen.geometry, screen.material);
      rs.scale.setScalar(0.85);
      at(rs, S.glbRearY ?? 0.31, 0, -1, 0.02);
      // 앞 얼굴 화면도 모델 앞 범퍼 면에 붙임 (코드 차 코 위치에 두면 범퍼 앞으로 떠서 튀어나옴)
      ray.set(new THREE.Vector3(20, faceY, 0), new THREE.Vector3(-1, 0, 0));
      const fh = ray.intersectObject(root, true)[0];
      if (fh) {
        // 화면은 범퍼 면 바로 앞, 검은 테두리는 화면 바로 뒤에서 차 안쪽으로 깊게 들어가게 (앞으로 튀어나온 검은 상자 없앰)
        screen.position.x = fh.point.x + 0.006;
        frontFrame.scale.x = 6; // 두께 0.05 → 0.3, 뒤쪽은 범퍼 속에 묻힘
        frontFrame.position.x = screen.position.x - 0.003 - 0.15;
      }
      // 코드로 만든 차체는 숨기고 얼굴 화면만 남김
      group.children.forEach((o) => { if (!o.userData.keep && o !== acc) o.visible = false; });
      group.add(holder);
      tintModel();
    },
    dispose() {
      clearAcc();
      disposables.forEach((d) => d.dispose());
    },
  };
}
