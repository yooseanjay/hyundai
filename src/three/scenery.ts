// 주행 배경 장면: 한국 도로를 나만의 장면으로
//  - 차는 +x 로 달리고 배경이 -x 로 흐른다 (가까운 것은 빠르게, 먼 것은 느리게 = 원근감)
//  - 모두 코드로 만든 로우폴리 모양 (내려받는 파일 없음)
import * as THREE from 'three';

export type SceneId = 'city' | 'forest' | 'park' | 'sea';

export const SCENES: { id: SceneId; label: string; emoji: string }[] = [
  { id: 'city', label: '한국 도로', emoji: '🏙️' },
  { id: 'forest', label: '숲속', emoji: '🌲' },
  { id: 'park', label: '놀이공원', emoji: '🎡' },
  { id: 'sea', label: '바닷가', emoji: '🌊' },
];

export interface Scenery {
  /** dx: 이번 프레임에 차가 달린 거리, dt: 초, t: 경과 시간 */
  update(dx: number, dt: number, t: number): void;
  dispose(): void;
}

interface Layer { items: THREE.Object3D[]; span: number; par: number }

/** 장면 만들기. scene.background · fog 도 장면에 맞게 바꾼다 */
export function buildScenery(scene: THREE.Scene, id: SceneId): Scenery {
  const b = new Builder(scene);
  BUILD[id](b);
  return b.finish();
}

class Builder {
  root = new THREE.Group();
  layers: Layer[] = [];
  anims: ((dt: number, t: number) => void)[] = [];
  trash: { dispose(): void }[] = [];
  private mats = new Map<string, THREE.Material>();
  constructor(public scene: THREE.Scene) { scene.add(this.root); }

  mat(color: string, emissive = 0): THREE.Material {
    const k = color + emissive;
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, emissive: emissive ? color : '#000', emissiveIntensity: emissive });
      this.mats.set(k, m);
      this.trash.push(m);
    }
    return m;
  }

  geo<T extends THREE.BufferGeometry>(g: T): T { this.trash.push(g); return g; }

  mesh(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, emissive = 0) {
    const m = new THREE.Mesh(this.geo(g), this.mat(color, emissive));
    m.position.set(x, y, z);
    m.castShadow = false;
    return m;
  }

  tex(t: THREE.Texture) { t.colorSpace = THREE.SRGBColorSpace; this.trash.push(t); return t; }

  /** 하늘 (위 → 아래 색) + 같은 색 안개 */
  sky(top: string, bottom: string, fogNear = 22, fogFar = 80) {
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 256;
    const g = cv.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    this.scene.background = this.tex(new THREE.CanvasTexture(cv));
    this.scene.fog = new THREE.Fog(bottom, fogNear, fogFar);
  }

  /** 땅 (z0 ~ z1 띠) */
  ground(color: string, z0: number, z1: number, y = -0.004) {
    const m = this.mesh(new THREE.PlaneGeometry(260, Math.abs(z1 - z0)), color, 0, y, (z0 + z1) / 2);
    m.rotation.x = -Math.PI / 2;
    (m.material as THREE.MeshStandardMaterial).flatShading = false;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  /** 흘러가는 줄: span 길이 안에 count 개를 고르게 (+ 살짝 흩어짐), par = 흐르는 빠르기 */
  row(count: number, span: number, par: number, make: (i: number) => THREE.Object3D, jitter = 0.35) {
    const items: THREE.Object3D[] = [];
    for (let i = 0; i < count; i++) {
      const o = make(i);
      o.position.x = -span / 2 + (i + 0.5 + (rand(i * 7.3) - 0.5) * jitter) * (span / count);
      this.root.add(o);
      items.push(o);
    }
    this.layers.push({ items, span, par });
    return items;
  }

  finish(): Scenery {
    return {
      update: (dx, dt, t) => {
        for (const l of this.layers) {
          for (const o of l.items) {
            o.position.x -= dx * l.par;
            if (o.position.x < -l.span / 2) o.position.x += l.span;
          }
        }
        this.anims.forEach((a) => a(dt, t));
      },
      dispose: () => {
        this.scene.remove(this.root);
        this.scene.background = null;
        this.scene.fog = null;
        this.trash.forEach((d) => d.dispose());
      },
    };
  }
}

/** 늘 같은 배치가 나오도록 하는 의사 난수 (0~1) */
function rand(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 글자 판 (표지판 · 아파트 동 번호) */
function textCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  return new THREE.CanvasTexture(cv);
}

function board(b: Builder, w: number, h: number, tex: THREE.Texture) {
  const m = new THREE.Mesh(b.geo(new THREE.PlaneGeometry(w, h)), new THREE.MeshBasicMaterial({ map: b.tex(tex), side: THREE.DoubleSide, toneMapped: false }));
  b.trash.push(m.material as THREE.Material);
  return m;
}

// ───────── 공통 소품 ─────────

function pine(b: Builder, s: number, dark = '#2f6b3a', light = '#3f8a48') {
  const g = new THREE.Group();
  g.add(b.mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.6, 6), '#6b4a2f', 0, 0.3, 0));
  g.add(b.mesh(new THREE.ConeGeometry(0.75, 1.2, 7), dark, 0, 1.0, 0));
  g.add(b.mesh(new THREE.ConeGeometry(0.58, 1.0, 7), light, 0, 1.55, 0));
  g.add(b.mesh(new THREE.ConeGeometry(0.4, 0.8, 7), dark, 0, 2.05, 0));
  g.scale.setScalar(s);
  return g;
}

function roundTree(b: Builder, s: number, leaf: string) {
  const g = new THREE.Group();
  g.add(b.mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.0, 6), '#6b4a2f', 0, 0.5, 0));
  g.add(b.mesh(new THREE.IcosahedronGeometry(0.62, 0), leaf, 0, 1.35, 0));
  g.add(b.mesh(new THREE.IcosahedronGeometry(0.42, 0), leaf, 0.3, 1.7, 0.1));
  g.scale.setScalar(s);
  return g;
}

function mountain(b: Builder, r: number, h: number, color: string, snow?: string) {
  const g = new THREE.Group();
  g.add(b.mesh(new THREE.ConeGeometry(r, h, 6), color, 0, h / 2, 0));
  if (snow) g.add(b.mesh(new THREE.ConeGeometry(r * 0.28, h * 0.28, 6), snow, 0, h * 0.86, 0));
  return g;
}

function lamp(b: Builder, warm = '#fff6dc') {
  const g = new THREE.Group();
  g.add(b.mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), '#5a5d64', 0, 1.3, 0));
  g.add(b.mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), '#5a5d64', 0, 2.6, 0.22));
  g.add(b.mesh(new THREE.BoxGeometry(0.16, 0.05, 0.22), warm, 0, 2.56, 0.42, 2.5));
  return g;
}

// ───────── 장면 ─────────

const BUILD: Record<SceneId, (b: Builder) => void> = {
  // 한국 도로: 은행나무 가로수 · 아파트 단지 · 초록 이정표 · 남산 같은 먼 산
  city(b) {
    b.sky('#5fa3e6', '#cfe4f5', 34, 110);
    b.ground('#9a9ea6', -1.75, -3.6); // 보도
    b.ground('#6f8f5a', -3.6, -60); // 화단 · 공원
    b.ground('#9a9ea6', 3.55, 40); // 앞쪽 보도
    // 보도 경계석
    b.root.add(b.mesh(new THREE.BoxGeometry(260, 0.12, 0.18), '#c9ccd2', 0, 0.06, -1.82));
    b.row(8, 80, 1, () => { const l = lamp(b); l.position.z = -2.0; return l; }, 0);
    // 은행나무 (11월 노란 잎)
    b.row(14, 80, 1, (i) => { const t = roundTree(b, 1.15 + rand(i) * 0.3, i % 4 === 0 ? '#e9c23a' : '#f2cf45'); t.position.z = -3.0; return t; });
    // 아파트 단지 (동 번호)
    b.row(7, 150, 0.45, (i) => {
      const floors = 14 + Math.floor(rand(i + 3) * 10);
      const h = floors * 0.42;
      const tex = textCanvas(128, 256, (g) => {
        g.fillStyle = '#f1ebe0'; g.fillRect(0, 0, 128, 256);
        g.fillStyle = '#d9cdb8'; g.fillRect(0, 0, 128, 26);
        g.fillStyle = '#3c4f6b'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
        g.fillText(`${101 + i}동`, 64, 20);
        for (let y = 34; y < 250; y += 10) for (let x = 10; x < 120; x += 18) {
          g.fillStyle = rand(x * 3 + y + i) > 0.82 ? '#ffe7a3' : '#5d7088';
          g.fillRect(x, y, 12, 6);
        }
      });
      tex.repeat.set(1, 1);
      const m = new THREE.Mesh(b.geo(new THREE.BoxGeometry(4.2, h, 1.6)), new THREE.MeshStandardMaterial({ map: b.tex(tex), roughness: 0.9 }));
      b.trash.push(m.material as THREE.Material);
      m.position.set(0, h / 2, -14 - rand(i) * 6);
      return m;
    });
    // 초록 이정표
    b.row(1, 80, 1, () => {
      const g = new THREE.Group();
      g.add(b.mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), '#7d8189', 0, 1.7, -2.4));
      const tex = textCanvas(320, 150, (c) => {
        c.fillStyle = '#0d7a43'; c.fillRect(0, 0, 320, 150);
        c.strokeStyle = '#fff'; c.lineWidth = 5; c.strokeRect(6, 6, 308, 138);
        c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif';
        c.fillText('서울', 24, 62); c.fillText('한강공원', 24, 122);
        c.textAlign = 'right'; c.fillText('12km', 296, 62); c.fillText('3km', 296, 122);
      });
      const s = board(b, 2.0, 0.94, tex);
      s.position.set(0, 3.2, -2.4);
      s.rotation.y = -0.5;
      g.add(s);
      return g;
    }, 0);
    // 먼 산
    b.row(5, 220, 0.12, (i) => { const m = mountain(b, 9 + rand(i) * 5, 7 + rand(i + 1) * 5, i % 2 ? '#7e9bb4' : '#8aa6bd'); m.position.z = -46; return m; });
  },

  // 숲속: 소나무 · 둥근 나무 · 빨간 버섯 · 겹겹이 산 · 나비
  forest(b) {
    b.sky('#7cc4b4', '#d6eccf', 26, 85);
    b.ground('#4e8a3e', -1.75, -60);
    b.ground('#5c9846', 3.55, 40);
    b.root.add(b.mesh(new THREE.BoxGeometry(260, 0.05, 0.35), '#a88a5c', 0, 0.02, -1.9)); // 흙길 가장자리
    b.row(18, 80, 1, (i) => { const t = i % 3 ? pine(b, 1.1 + rand(i) * 0.6) : roundTree(b, 1.2 + rand(i) * 0.4, '#5fae4f'); t.position.z = -2.8 - rand(i + 9) * 2.5; return t; });
    b.row(16, 80, 0.75, (i) => { const t = pine(b, 1.6 + rand(i) * 0.8, '#285c34', '#33733f'); t.position.z = -7 - rand(i + 2) * 5; return t; });
    b.row(6, 80, 1, (i) => { const t = pine(b, 1.0 + rand(i) * 0.4); t.position.z = 5.6 + rand(i) * 2; return t; });
    // 빨간 버섯
    b.row(7, 80, 1, (i) => {
      const g = new THREE.Group();
      g.add(b.mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8), '#f4ead7', 0, 0.11, 0));
      const cap = b.mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e0412f', 0, 0.2, 0);
      g.add(cap);
      g.add(b.mesh(new THREE.SphereGeometry(0.035, 6, 4), '#ffffff', 0.08, 0.34, 0.06));
      g.add(b.mesh(new THREE.SphereGeometry(0.03, 6, 4), '#ffffff', -0.07, 0.33, -0.05));
      g.position.z = -2.15 - rand(i) * 0.4;
      g.scale.setScalar(1.3);
      return g;
    });
    // 나비 (날개 퍼덕)
    const flies = b.row(5, 60, 0.9, (i) => {
      const g = new THREE.Group();
      const wing = new THREE.CircleGeometry(0.13, 8);
      const c = ['#ffd84d', '#ffffff', '#ff9bc8'][i % 3];
      const l = b.mesh(wing, c); l.position.x = -0.1;
      const r = b.mesh(wing.clone(), c); r.position.x = 0.1;
      (l.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      g.add(l, r);
      g.position.set(0, 1.2 + rand(i) * 0.8, -2.6);
      g.userData = { l, r, k: i };
      return g;
    });
    b.anims.push((_, t) => flies.forEach((f) => {
      const { l, r, k } = f.userData as { l: THREE.Mesh; r: THREE.Mesh; k: number };
      const a = Math.sin(t * 14 + k) * 0.9;
      l.rotation.y = a; r.rotation.y = -a;
      f.position.y = 1.3 + Math.sin(t * 2 + k) * 0.3;
    }));
    // 겹겹이 산
    b.row(5, 200, 0.18, (i) => { const m = mountain(b, 10 + rand(i) * 4, 9 + rand(i + 4) * 4, '#4f8e6a'); m.position.z = -30; return m; });
    b.row(4, 240, 0.08, (i) => { const m = mountain(b, 14 + rand(i + 2) * 6, 13 + rand(i) * 5, '#86b3a4', '#eef5f2'); m.position.z = -52; return m; });
  },

  // 놀이공원: 돌아가는 관람차 · 줄무늬 천막 · 풍선 · 알록달록 전구 줄 · 노을 하늘
  park(b) {
    b.sky('#7b6be0', '#ffb3cf', 34, 110);
    b.ground('#4fc79a', -1.75, -60);
    b.ground('#64d0a8', 3.55, 40);
    // 관람차
    b.row(1, 160, 0.1, () => {
      const g = new THREE.Group();
      const R = 6;
      g.add(b.mesh(new THREE.CylinderGeometry(0.18, 0.25, R + 1, 6), '#ffffff', -1.4, (R + 1) / 2, 0.6).rotateZ(0.22));
      g.add(b.mesh(new THREE.CylinderGeometry(0.18, 0.25, R + 1, 6), '#ffffff', 1.4, (R + 1) / 2, 0.6).rotateZ(-0.22));
      const wheel = new THREE.Group();
      wheel.position.set(0, R + 1, 0);
      const ring = b.mesh(new THREE.TorusGeometry(R, 0.12, 6, 40), '#ffffff', 0, 0, 0, 0.4);
      wheel.add(ring);
      const cols = ['#ff6b8b', '#ffd34d', '#5ec8ff', '#7be07b', '#c78bff', '#ff9f4d'];
      const cabins: THREE.Object3D[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spoke = b.mesh(new THREE.BoxGeometry(0.06, R, 0.06), '#ffffff');
        spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
        spoke.rotation.z = a - Math.PI / 2;
        wheel.add(spoke);
        const cab = b.mesh(new THREE.BoxGeometry(0.75, 0.7, 0.75), cols[i % cols.length], Math.cos(a) * R, Math.sin(a) * R - 0.45, 0);
        wheel.add(cab);
        cabins.push(cab);
      }
      g.add(wheel);
      g.position.set(22, 0, -26);
      b.anims.push((dt) => {
        wheel.rotation.z += dt * 0.25;
        cabins.forEach((c) => { c.rotation.z = -wheel.rotation.z; });
      });
      return g;
    }, 0).forEach((g) => { g.position.x = 22; });
    // 줄무늬 천막
    b.row(5, 90, 0.7, (i) => {
      const g = new THREE.Group();
      const c = ['#ff5a7a', '#ffb12b', '#4fb3ff', '#9b6bff', '#2fcf9a'][i % 5];
      const n = 10;
      for (let k = 0; k < n; k++) {
        const seg = b.mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.6, 2 * n, 1, true, (k / n) * Math.PI * 2, Math.PI * 2 / n), k % 2 ? '#ffffff' : c, 0, 0.8, 0);
        (seg.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        g.add(seg);
      }
      g.add(b.mesh(new THREE.ConeGeometry(1.9, 1.5, 20), c, 0, 2.35, 0));
      g.add(b.mesh(new THREE.ConeGeometry(0.12, 0.5, 6), '#ffd84d', 0, 3.3, 0));
      g.position.z = -8 - rand(i) * 4;
      return g;
    });
    // 전구 줄 (기둥 사이)
    b.row(8, 80, 1, (i) => {
      const g = new THREE.Group();
      g.add(b.mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), '#ffffff', 0, 1.3, 0));
      const cols = ['#ff4f7b', '#ffd84d', '#4fc3ff', '#7cf07c', '#c58bff'];
      for (let k = 0; k < 8; k++) {
        const x = (k + 0.5) * (10 / 8);
        const y = 2.5 - Math.sin((k + 0.5) / 8 * Math.PI) * 0.6;
        g.add(b.mesh(new THREE.SphereGeometry(0.09, 8, 6), cols[(k + i) % cols.length], x, y, 0, 2.2));
      }
      g.position.z = -2.2;
      return g;
    }, 0);
    // 풍선 (둥실둥실)
    const balloons = b.row(9, 80, 1, (i) => {
      const g = new THREE.Group();
      const c = ['#ff4f7b', '#ffd84d', '#4fc3ff', '#7cf07c', '#c58bff'][i % 5];
      const ball = b.mesh(new THREE.SphereGeometry(0.28, 12, 10), c, 0, 0, 0);
      ball.scale.y = 1.2;
      g.add(ball);
      g.add(b.mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 4), '#ffffff', 0, -0.9, 0));
      g.position.set(0, 2.2 + rand(i) * 1.2, -3.2 - rand(i + 1) * 2);
      g.userData.k = i;
      return g;
    });
    b.anims.push((_, t) => balloons.forEach((g) => { const k = g.userData.k as number; g.position.y = 2.4 + rand(k) * 1.2 + Math.sin(t * 1.4 + k) * 0.18; g.rotation.z = Math.sin(t + k) * 0.08; }));
    // 동화 성
    b.row(1, 160, 0.22, () => {
      const g = new THREE.Group();
      g.add(b.mesh(new THREE.BoxGeometry(5, 3.4, 2), '#fff1f7', 0, 1.7, 0));
      [[-2.6, 5], [2.6, 5], [0, 6.4]].forEach(([x, h]) => {
        g.add(b.mesh(new THREE.CylinderGeometry(0.7, 0.7, h, 10), '#ffe3ef', x, h / 2, 0));
        g.add(b.mesh(new THREE.ConeGeometry(0.95, 1.8, 10), '#8a6cff', x, h + 0.9, 0));
      });
      g.position.set(0, 0, -30);
      return g;
    }, 0).forEach((g) => { g.position.x = 50; });
  },

  // 바닷가: 모래사장 · 파도치는 바다 · 빨간·흰 등대 · 섬 · 갈매기 · 해안 소나무
  sea(b) {
    b.sky('#3b9cf0', '#cdeaff', 40, 130);
    b.ground('#d8bb7f', -1.75, -6.5);
    const sea = b.ground('#1769b8', -6.5, -120, -0.02);
    (sea.material as THREE.MeshStandardMaterial).roughness = 0.55;
    (sea.material as THREE.MeshStandardMaterial).envMapIntensity = 0.3;
    b.ground('#7aa565', 3.55, 40);
    // 가드레일
    b.root.add(b.mesh(new THREE.BoxGeometry(260, 0.22, 0.06), '#e6e9ee', 0, 0.62, -1.95));
    b.row(26, 80, 1, () => b.mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), '#c9ced6', 0, 0.35, -1.95), 0);
    // 파도 (하얀 물결이 오르내림)
    const waves = b.row(12, 80, 0.6, (i) => {
      const w = b.mesh(new THREE.BoxGeometry(2.4, 0.04, 0.16), '#ffffff', 0, 0.0, -6.9 - (i % 3) * 1.8);
      w.userData.k = i;
      return w;
    });
    b.anims.push((_, t) => waves.forEach((w) => { w.position.y = Math.sin(t * 1.6 + (w.userData.k as number)) * 0.04; }));
    // 해안 소나무
    b.row(6, 80, 1, (i) => { const t = pine(b, 1.0 + rand(i) * 0.4, '#2f6b3a', '#3c7d45'); t.position.z = 5 + rand(i) * 2; return t; });
    b.row(4, 80, 1, (i) => { const t = pine(b, 0.9 + rand(i + 4) * 0.3); t.position.z = -3 - rand(i) * 1.5; return t; });
    // 등대
    b.row(1, 140, 0.35, () => {
      const g = new THREE.Group();
      g.add(b.mesh(new THREE.CylinderGeometry(1.4, 1.8, 0.8, 10), '#8a8f96', 0, 0.4, 0));
      for (let k = 0; k < 5; k++) g.add(b.mesh(new THREE.CylinderGeometry(0.62 - k * 0.04, 0.66 - k * 0.04, 1, 12), k % 2 ? '#ffffff' : '#e23b3b', 0, 1.3 + k, 0));
      g.add(b.mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 10), '#fff6c2', 0, 6.05, 0, 2));
      g.add(b.mesh(new THREE.ConeGeometry(0.55, 0.6, 10), '#e23b3b', 0, 6.6, 0));
      g.position.z = -18;
      return g;
    }, 0);
    // 섬
    b.row(4, 240, 0.08, (i) => {
      const g = new THREE.Group();
      const isl = b.mesh(new THREE.SphereGeometry(6 + rand(i) * 4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#5f8f62');
      isl.scale.y = 0.45;
      g.add(isl);
      g.position.z = -70 - rand(i) * 15;
      return g;
    });
    // 해
    const sun = b.mesh(new THREE.CircleGeometry(4, 32), '#fff3b0', 60, 26, -95, 1.4);
    (sun.material as THREE.MeshStandardMaterial).fog = false;
    b.root.add(sun);
    // 갈매기
    const gulls = b.row(5, 70, 0.5, (i) => {
      const g = new THREE.Group();
      const wing = new THREE.BoxGeometry(0.5, 0.03, 0.14);
      const l = b.mesh(wing, '#ffffff', -0.22, 0, 0);
      const r = b.mesh(wing.clone(), '#ffffff', 0.22, 0, 0);
      g.add(l, r);
      g.position.set(0, 4 + rand(i) * 2, -6 - rand(i + 3) * 6);
      g.userData = { l, r, k: i };
      return g;
    });
    b.anims.push((_, t) => gulls.forEach((g) => {
      const { l, r, k } = g.userData as { l: THREE.Mesh; r: THREE.Mesh; k: number };
      const a = Math.sin(t * 5 + k) * 0.45;
      l.rotation.z = a; r.rotation.z = -a;
    }));
  },
};
