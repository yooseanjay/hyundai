// 주행 배경 장면: 한국 도로를 나만의 장면으로
//  - 차는 +x 로 달리고 배경이 -x 로 흐른다 (가까운 것은 빠르게, 먼 것은 느리게 = 원근감)
//  - 걷고 · 손 흔들고 · 쉬는 사람들
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

/** 장면 만들기. scene.background · fog 도 장면에 맞게 바꾼다 */
export function buildScenery(scene: THREE.Scene, id: SceneId): Scenery {
  const b = new Builder(scene);
  BUILD[id](b);
  return b.finish();
}

interface Layer { items: THREE.Object3D[]; span: number; par: number }
interface MatOpt { emissive?: number; smooth?: boolean; rough?: number; metal?: number; double?: boolean }

class Builder {
  root = new THREE.Group();
  layers: Layer[] = [];
  anims: ((dt: number, t: number) => void)[] = [];
  people: THREE.Group[] = [];
  trash = new Set<{ dispose(): void }>();
  private mats = new Map<string, THREE.Material>();
  private geos = new Map<string, THREE.BufferGeometry>();
  constructor(public scene: THREE.Scene) { scene.add(this.root); }

  mat(color: string, o: MatOpt = {}): THREE.Material {
    const k = [color, o.emissive, o.smooth, o.rough, o.metal, o.double].join('|');
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, flatShading: !o.smooth,
        emissive: o.emissive ? color : '#000', emissiveIntensity: o.emissive ?? 0,
        side: o.double ? THREE.DoubleSide : THREE.FrontSide,
      });
      this.mats.set(k, m);
      this.trash.add(m);
    }
    return m;
  }

  geo<T extends THREE.BufferGeometry>(g: T): T { this.trash.add(g); return g; }

  /** 같은 모양은 한 번만 만들어 나눠 씀 */
  shared(key: string, make: () => THREE.BufferGeometry) {
    let g = this.geos.get(key);
    if (!g) { g = this.geo(make()); this.geos.set(key, g); }
    return g;
  }

  mesh(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, o: MatOpt = {}) {
    const m = new THREE.Mesh(g, this.mat(color, o));
    this.trash.add(g);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  tex(t: THREE.Texture) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.trash.add(t); return t; }

  /** 하늘 (위 → 지평선 색) + 해 빛 번짐 + 같은 색 안개 */
  sky(top: string, bottom: string, fogNear: number, fogFar: number, sun = 'rgba(255,248,220,0.55)') {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const g = cv.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const s = g.createRadialGradient(196, 70, 0, 196, 70, 120);
    s.addColorStop(0, sun); s.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = s; g.fillRect(0, 0, 256, 256);
    this.scene.background = this.tex(new THREE.CanvasTexture(cv));
    this.scene.fog = new THREE.Fog(bottom, fogNear, fogFar);
  }

  /** 땅 (z0 ~ z1 띠) */
  ground(color: string, z0: number, z1: number, y = -0.004, o: MatOpt = {}) {
    const m = this.mesh(this.geo(new THREE.PlaneGeometry(260, Math.abs(z1 - z0))), color, 0, y, (z0 + z1) / 2, { smooth: true, rough: 1, ...o });
    m.rotation.x = -Math.PI / 2;
    m.castShadow = false;
    this.root.add(m);
    return m;
  }

  fixed(o: THREE.Object3D) { this.root.add(o); return o; }

  /** 흘러가는 줄: span 길이 안에 count 개를 고르게 (+ 살짝 흩어짐), par = 흐르는 빠르기 */
  row(count: number, span: number, par: number, make: (i: number) => THREE.Object3D, jitter = 0.35) {
    const items: THREE.Object3D[] = [];
    for (let i = 0; i < count; i++) {
      const o = make(i);
      o.position.x = -span / 2 + (i + 0.5 + (rand(i * 7.3 + span) - 0.5) * jitter) * (span / count);
      this.root.add(o);
      items.push(o);
    }
    this.layers.push({ items, span, par });
    return items;
  }

  finish(): Scenery {
    const people = this.people;
    return {
      update: (dx, dt, t) => {
        for (const l of this.layers) {
          for (const o of l.items) {
            o.position.x -= dx * l.par;
            const walk = o.userData.walk as number | undefined;
            if (walk) o.position.x += walk * dt;
            if (o.position.x < -l.span / 2) o.position.x += l.span;
            else if (o.position.x > l.span / 2) o.position.x -= l.span;
          }
        }
        animatePeople(people, t);
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
const pick = <T,>(a: T[], n: number) => a[Math.floor(rand(n) * a.length) % a.length];

/** 글자 판 (표지판 · 간판 · 아파트 동 번호) */
function canvasTex(b: Builder, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  return b.tex(new THREE.CanvasTexture(cv));
}

function board(b: Builder, w: number, h: number, tex: THREE.Texture, glow = false) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: glow ? '#ffffff' : '#000000', emissiveMap: glow ? tex : null, emissiveIntensity: glow ? 0.35 : 0 });
  b.trash.add(mat);
  const m = new THREE.Mesh(b.shared(`board${w}x${h}`, () => new THREE.PlaneGeometry(w, h)), mat);
  m.castShadow = true;
  return m;
}

// ───────── 사람 ─────────

const SKIN = ['#f3cfb3', '#e8b892', '#d49a72', '#f7dcc6', '#c48662'];
const SHIRT = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#f783ac', '#ffffff', '#845ef7', '#ff922b', '#20c997', '#343a40'];
const PANTS = ['#364fc7', '#495057', '#212529', '#e9ecef', '#5c3d2e', '#1c7ed6'];
const HAIR = ['#1e1611', '#2b1d14', '#3b2a1e', '#0f0f0f', '#6b4a2f', '#a07850'];

type Pose = 'walk' | 'stand' | 'wave' | 'lie' | 'sit';
interface PersonOpt { pose?: Pose; dir?: 1 | -1; kid?: boolean; hat?: string; backpack?: string; balloon?: string; face?: number }

/**
 * 사람 한 명 (키 약 0.86 = 차 크기에 맞춘 1.7m).
 * 정면은 +z. 걷는 사람은 userData.walk (초당 이동 거리) 로 옆으로 움직인다.
 */
function person(b: Builder, seed: number, o: PersonOpt = {}) {
  const pose = o.pose ?? 'walk';
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const skin = pick(SKIN, seed);
  const shirt = pick(SHIRT, seed + 1);
  const pants = pick(PANTS, seed + 2);
  const hair = pick(HAIR, seed + 3);
  const longHair = rand(seed + 4) > 0.55;

  const legG = b.shared('p-leg', () => new THREE.CapsuleGeometry(0.065, 0.36, 4, 8));
  const armG = b.shared('p-arm', () => new THREE.CapsuleGeometry(0.05, 0.32, 4, 8));
  const torsoG = b.shared('p-torso', () => new THREE.CapsuleGeometry(0.16, 0.26, 4, 10));
  const headG = b.shared('p-head', () => new THREE.SphereGeometry(0.135, 14, 12));
  const hairG = b.shared('p-hair', () => new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
  const longG = b.shared('p-long', () => new THREE.CapsuleGeometry(0.12, 0.16, 4, 8));
  const eyeG = b.shared('p-eye', () => new THREE.SphereGeometry(0.018, 6, 6));

  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.08, 0.5, 0);
    pivot.add(b.mesh(legG, pants, 0, -0.24, 0, { smooth: true }));
    body.add(pivot);
    return pivot;
  });
  body.add(b.mesh(torsoG, shirt, 0, 0.76, 0, { smooth: true }));
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.21, 0.95, 0);
    pivot.add(b.mesh(armG, shirt, 0, -0.18, 0, { smooth: true }));
    pivot.add(b.mesh(b.shared('p-hand', () => new THREE.SphereGeometry(0.05, 8, 6)), skin, 0, -0.39, 0, { smooth: true }));
    pivot.rotation.z = s * 0.08;
    body.add(pivot);
    return pivot;
  });
  body.add(b.mesh(headG, skin, 0, 1.2, 0, { smooth: true }));
  const hairM = b.mesh(hairG, hair, 0, 1.215, -0.012, { smooth: true });
  hairM.rotation.x = -0.25;
  body.add(hairM);
  if (longHair) body.add(b.mesh(longG, hair, 0, 1.1, -0.07, { smooth: true }));
  [-1, 1].forEach((s) => body.add(b.mesh(eyeG, '#1a1a1a', s * 0.045, 1.21, 0.125, { smooth: true })));
  if (o.hat) {
    body.add(b.mesh(b.shared('p-brim', () => new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16)), o.hat, 0, 1.31, 0.02, { smooth: true }));
    body.add(b.mesh(b.shared('p-crown', () => new THREE.CylinderGeometry(0.12, 0.14, 0.12, 16)), o.hat, 0, 1.37, 0, { smooth: true }));
  }
  if (o.backpack) body.add(b.mesh(b.shared('p-bag', () => new THREE.BoxGeometry(0.26, 0.32, 0.14)), o.backpack, 0, 0.82, -0.2));
  if (o.balloon) {
    const hand = arms[1];
    hand.rotation.z = 0.5;
    hand.add(b.mesh(b.shared('p-str', () => new THREE.CylinderGeometry(0.004, 0.004, 0.9, 4)), '#ffffff', 0, 0.05, 0));
    const ball = b.mesh(b.shared('p-ball', () => new THREE.SphereGeometry(0.16, 14, 12)), o.balloon, 0, 0.58, 0, { smooth: true, rough: 0.35 });
    ball.scale.y = 1.2;
    hand.add(ball);
  }

  g.scale.setScalar(o.kid ? 0.42 : 0.62);
  if (pose === 'walk') {
    const dir = o.dir ?? (rand(seed + 5) > 0.5 ? 1 : -1);
    g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.userData.walk = dir * (o.kid ? 0.5 : 0.42 + rand(seed + 6) * 0.2);
  } else if (pose === 'lie') {
    body.rotation.x = -Math.PI / 2;
    body.position.set(0, 0.1, 0.6);
    g.rotation.y = o.face ?? rand(seed) * 2;
  } else if (pose === 'sit') {
    legs.forEach((l) => { l.rotation.x = -Math.PI / 2; });
    body.position.y = -0.18;
    g.rotation.y = o.face ?? -0.4;
  } else {
    g.rotation.y = o.face ?? -0.6 + (rand(seed + 7) - 0.5) * 0.8;
  }
  body.userData = { legs, arms, pose, phase: rand(seed + 8) * 6.28, balloon: !!o.balloon };
  g.userData.body = body;
  b.people.push(g);
  return g;
}

function animatePeople(people: THREE.Group[], t: number) {
  for (const p of people) {
    const body = p.userData.body as THREE.Group;
    const { legs, arms, pose, phase, balloon } = body.userData as { legs: THREE.Group[]; arms: THREE.Group[]; pose: Pose; phase: number; balloon: boolean };
    if (pose === 'walk') {
      const a = Math.sin(t * 7 + phase) * 0.55;
      legs[0].rotation.x = a; legs[1].rotation.x = -a;
      arms[0].rotation.x = -a * 0.8;
      if (!balloon) arms[1].rotation.x = a * 0.8;
      body.position.y = Math.abs(Math.cos(t * 7 + phase)) * 0.03;
    } else if (pose === 'wave') {
      arms[1].rotation.z = 2.5 + Math.sin(t * 6 + phase) * 0.45;
    } else if (pose === 'stand') {
      body.rotation.z = Math.sin(t * 1.2 + phase) * 0.025;
    }
  }
}

// ───────── 나무 · 산 · 소품 ─────────

const TRUNK = '#7a5232';

function pine(b: Builder, s: number, seed = 0) {
  const g = new THREE.Group();
  const shades = [['#2f6b3a', '#3d8247'], ['#285c34', '#367341'], ['#35733d', '#47904f']][seed % 3];
  g.add(b.mesh(b.shared('pine-t', () => new THREE.CylinderGeometry(0.08, 0.11, 0.7, 7)), TRUNK, 0, 0.35, 0));
  g.add(b.mesh(b.shared('pine-1', () => new THREE.ConeGeometry(0.8, 1.2, 8)), shades[0], 0, 1.0, 0));
  g.add(b.mesh(b.shared('pine-2', () => new THREE.ConeGeometry(0.62, 1.0, 8)), shades[1], 0, 1.55, 0));
  g.add(b.mesh(b.shared('pine-3', () => new THREE.ConeGeometry(0.42, 0.85, 8)), shades[0], 0, 2.05, 0));
  g.rotation.y = rand(seed) * 6;
  g.scale.setScalar(s);
  return g;
}

/** 잎이 둥근 나무 (잎 덩어리 4개, 색을 조금씩 다르게) */
function leafTree(b: Builder, s: number, palette: string[], seed = 0) {
  const g = new THREE.Group();
  g.add(b.mesh(b.shared('lt-t', () => new THREE.CylinderGeometry(0.07, 0.11, 1.1, 7)), TRUNK, 0, 0.55, 0));
  const blob = b.shared('lt-b', () => new THREE.IcosahedronGeometry(0.5, 1));
  const spots = [[0, 1.45, 0, 1.15], [0.36, 1.3, 0.12, 0.85], [-0.32, 1.32, -0.08, 0.9], [0.05, 1.82, -0.05, 0.8]];
  spots.forEach(([x, y, z, k], i) => {
    const m = b.mesh(blob, palette[(i + seed) % palette.length], x, y, z);
    m.scale.setScalar(k);
    g.add(m);
  });
  g.rotation.y = rand(seed + 1) * 6;
  g.scale.setScalar(s);
  return g;
}

function mountain(b: Builder, r: number, h: number, color: string, snow?: string, seed = 0) {
  const g = new THREE.Group();
  const geo = b.geo(new THREE.ConeGeometry(r, h, 7, 2));
  // 꼭짓점을 조금 흔들어 자연스러운 능선
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > -h / 2 + 0.01 && y < h / 2 - 0.01) {
      pos.setX(i, pos.getX(i) * (0.85 + rand(i + seed) * 0.3));
      pos.setZ(i, pos.getZ(i) * (0.85 + rand(i * 3 + seed) * 0.3));
    }
  }
  geo.computeVertexNormals();
  const m = b.mesh(geo, color, 0, h / 2, 0);
  m.castShadow = false;
  g.add(m);
  if (snow) { const c = b.mesh(b.geo(new THREE.ConeGeometry(r * 0.28, h * 0.28, 7)), snow, 0, h * 0.86, 0); c.castShadow = false; g.add(c); }
  return g;
}

function streetLamp(b: Builder) {
  const g = new THREE.Group();
  g.add(b.mesh(b.shared('lamp-p', () => new THREE.CylinderGeometry(0.04, 0.06, 2.8, 8)), '#5f646c', 0, 1.4, 0, { metal: 0.5, rough: 0.4 }));
  g.add(b.mesh(b.shared('lamp-a', () => new THREE.BoxGeometry(0.05, 0.05, 0.6)), '#5f646c', 0, 2.78, 0.28, { metal: 0.5, rough: 0.4 }));
  g.add(b.mesh(b.shared('lamp-h', () => new THREE.BoxGeometry(0.18, 0.06, 0.28)), '#fff4d6', 0, 2.73, 0.55, { emissive: 1.5 }));
  return g;
}

function bench(b: Builder, color = '#9b6a3f') {
  const g = new THREE.Group();
  g.add(b.mesh(b.shared('bench-s', () => new THREE.BoxGeometry(0.9, 0.05, 0.3)), color, 0, 0.27, 0));
  g.add(b.mesh(b.shared('bench-b', () => new THREE.BoxGeometry(0.9, 0.22, 0.04)), color, 0, 0.45, -0.14));
  [-0.38, 0.38].forEach((x) => g.add(b.mesh(b.shared('bench-l', () => new THREE.BoxGeometry(0.05, 0.27, 0.28)), '#4a4f57', x, 0.135, 0)));
  return g;
}

function flowers(b: Builder, seed: number) {
  const g = new THREE.Group();
  const cols = ['#ff6b8b', '#ffd43b', '#ffffff', '#c792ff', '#ff922b'];
  for (let i = 0; i < 7; i++) {
    const x = (rand(seed + i) - 0.5) * 0.9;
    const z = (rand(seed + i * 5) - 0.5) * 0.5;
    const stem = b.mesh(b.shared('fl-s', () => new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4)), '#3f8a48', x, 0.09, z);
    stem.castShadow = false;
    g.add(stem);
    g.add(b.mesh(b.shared('fl-h', () => new THREE.IcosahedronGeometry(0.045, 0)), cols[(seed + i) % cols.length], x, 0.19, z));
  }
  return g;
}

function rock(b: Builder, s: number, seed: number) {
  const m = b.mesh(b.shared('rock', () => new THREE.DodecahedronGeometry(0.3, 0)), seed % 2 ? '#8d8f93' : '#7b7e83', 0, 0.12 * s, 0);
  m.scale.set(s, s * 0.6, s * 0.8);
  m.rotation.y = seed;
  return m;
}

// ───────── 장면 ─────────

const BUILD: Record<SceneId, (b: Builder) => void> = {
  // 한국 도로: 상가 간판 · 횡단보도 · 신호등 · 버스 정류장 · 은행나무 · 아파트 · 남산타워 · 걷는 사람들
  city(b) {
    b.sky('#5c9fe3', '#d4e7f6', 36, 115);
    b.ground('#a7abb2', -1.75, -4.6); // 보도
    b.ground('#7aa25f', -4.6, -9); // 화단
    b.ground('#8c9096', -9, -60);
    b.ground('#a7abb2', 3.55, 40);
    b.fixed(b.mesh(b.geo(new THREE.BoxGeometry(260, 0.12, 0.16)), '#d3d6db', 0, 0.06, -1.82));
    b.fixed(b.mesh(b.geo(new THREE.BoxGeometry(260, 0.12, 0.16)), '#d3d6db', 0, 0.06, 3.62));
    // 보도 블록 줄눈
    b.row(40, 80, 1, () => { const m = b.mesh(b.shared('tile', () => new THREE.BoxGeometry(0.03, 0.005, 2.8)), '#93979e', 0, 0.002, -3.2); m.castShadow = false; return m; }, 0);

    b.row(8, 80, 1, () => { const l = streetLamp(b); l.position.z = -2.05; return l; }, 0);
    b.row(12, 80, 1, (i) => { const t = leafTree(b, 1.05 + rand(i) * 0.25, ['#f2c94c', '#e8b931', '#f7d55c'], i); t.position.z = -3.15; return t; }, 0.6);

    // 상가 (1층 간판)
    const SHOPS: [string, string, string][] = [
      ['카페', '#6b4a2f', '#f4e9dc'], ['편의점', '#1c7ed6', '#e7f5ff'], ['분식', '#e03131', '#fff5f5'], ['꽃집', '#e64980', '#fff0f6'],
      ['빵집', '#d9822b', '#fff4e6'], ['약국', '#2f9e44', '#ebfbee'], ['치킨', '#f08c00', '#fff9db'], ['서점', '#5f3dc4', '#f3f0ff'],
    ];
    b.row(8, 80, 0.97, (i) => {
      const [name, accent, wall] = SHOPS[i % SHOPS.length];
      const g = new THREE.Group();
      const h = 2.2 + rand(i + 20) * 1.3;
      g.add(b.mesh(b.geo(new THREE.BoxGeometry(4.2, h, 2.2)), wall, 0, h / 2, 0));
      g.add(b.mesh(b.shared('shop-glass', () => new THREE.BoxGeometry(3.4, 0.9, 0.04)), '#2d3a4a', 0, 0.6, 1.11, { rough: 0.15, metal: 0.4 }));
      g.add(b.mesh(b.shared('shop-door', () => new THREE.BoxGeometry(0.7, 1.1, 0.05)), '#3b4a5c', 1.4, 0.55, 1.12, { rough: 0.2 }));
      const awn = b.mesh(b.shared('shop-awn', () => new THREE.BoxGeometry(3.8, 0.06, 0.7)), accent, 0, 1.35, 1.35);
      awn.rotation.x = 0.35;
      g.add(awn);
      const tex = canvasTex(b, 256, 64, (c) => {
        c.fillStyle = accent; c.fillRect(0, 0, 256, 64);
        c.fillStyle = '#ffffff'; c.font = 'bold 42px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(name, 128, 34);
      });
      const sign = board(b, 2.6, 0.62, tex, true);
      sign.position.set(0, 1.85, 1.12);
      g.add(sign);
      for (let k = 0; k < Math.floor((h - 2) / 0.7); k++) {
        [-1.2, 0, 1.2].forEach((x) => g.add(b.mesh(b.shared('shop-win', () => new THREE.BoxGeometry(0.7, 0.45, 0.04)), '#4b6582', x, 2.45 + k * 0.7, 1.11, { rough: 0.2, metal: 0.3 })));
      }
      g.position.z = -6.2;
      return g;
    }, 0.15);

    // 횡단보도 + 신호등
    b.row(1, 80, 1, () => {
      const g = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const z = b.mesh(b.shared('zebra', () => new THREE.BoxGeometry(2.2, 0.006, 0.42)), '#f1f3f5', 0, 0.004, -1.35 + k * 0.85);
        z.castShadow = false;
        g.add(z);
      }
      g.add(b.mesh(b.shared('tl-p', () => new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8)), '#3d4148', 1.4, 1.2, -2.15));
      g.add(b.mesh(b.shared('tl-b', () => new THREE.BoxGeometry(0.22, 0.5, 0.18)), '#2b2e33', 1.4, 2.6, -2.15));
      g.add(b.mesh(b.shared('tl-l', () => new THREE.SphereGeometry(0.06, 10, 8)), '#3ee07a', 1.4, 2.48, -2.05, { emissive: 2.5, smooth: true }));
      g.add(b.mesh(b.shared('tl-l', () => new THREE.SphereGeometry(0.06, 10, 8)), '#5a2020', 1.4, 2.72, -2.05, { smooth: true }));
      return g;
    }, 0).forEach((g) => { g.position.x = 18; });

    // 버스 정류장
    b.row(1, 80, 1, () => {
      const g = new THREE.Group();
      g.add(b.mesh(b.shared('bus-roof', () => new THREE.BoxGeometry(2.4, 0.08, 0.9)), '#2b6cb0', 0, 1.5, -2.85));
      g.add(b.mesh(b.shared('bus-back', () => new THREE.BoxGeometry(2.4, 1.2, 0.04)), '#cfe3f7', 0, 0.85, -3.28, { rough: 0.1, metal: 0.2 }));
      [-1.15, 1.15].forEach((x) => g.add(b.mesh(b.shared('bus-post', () => new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8)), '#3d4148', x, 0.75, -2.5)));
      const tex = canvasTex(b, 128, 64, (c) => {
        c.fillStyle = '#2b6cb0'; c.fillRect(0, 0, 128, 64);
        c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('버스', 64, 34);
      });
      const s = board(b, 0.6, 0.3, tex, true);
      s.position.set(-1.15, 1.75, -2.48);
      g.add(s);
      const bb = bench(b, '#5f646c'); bb.position.set(0, 0, -3.0); g.add(bb);
      const p1 = person(b, 41, { pose: 'sit', face: 0 }); p1.position.set(-0.2, 0, -2.98); g.add(p1);
      const p2 = person(b, 57, { pose: 'stand', face: -0.3 }); p2.position.set(0.7, 0, -2.6); g.add(p2);
      return g;
    }, 0).forEach((g) => { g.position.x = -10; });

    // 걷는 사람들 (먼 보도 · 가까운 보도) · 손 흔드는 사람
    b.row(10, 80, 1, (i) => { const p = person(b, i * 13 + 3, { backpack: i % 4 === 0 ? '#495057' : undefined }); p.position.z = -2.55 - (i % 2) * 0.9; return p; });
    b.row(4, 60, 1, (i) => { const p = person(b, i * 29 + 100); p.position.z = 4.3; return p; });
    b.row(2, 80, 1, (i) => { const p = person(b, i * 7 + 200, { pose: 'wave' }); p.position.z = -3.9; return p; });

    // 아파트 단지 (동 번호)
    b.row(7, 150, 0.45, (i) => {
      const floors = 15 + Math.floor(rand(i + 3) * 10);
      const h = floors * 0.42;
      const tex = canvasTex(b, 128, 256, (g) => {
        g.fillStyle = '#f1ebe0'; g.fillRect(0, 0, 128, 256);
        g.fillStyle = '#c9b99d'; g.fillRect(0, 0, 128, 26);
        g.fillStyle = '#34465f'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
        g.fillText(`${101 + i}동`, 64, 20);
        for (let y = 34; y < 250; y += 10) {
          g.fillStyle = '#e4dccd'; g.fillRect(0, y + 7, 128, 2);
          for (let x = 8; x < 120; x += 20) {
            g.fillStyle = rand(x * 3 + y + i) > 0.8 ? '#ffe7a3' : '#61758f';
            g.fillRect(x, y, 14, 6);
          }
        }
      });
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      b.trash.add(mat);
      const m = new THREE.Mesh(b.geo(new THREE.BoxGeometry(4.4, h, 1.7)), mat);
      m.position.set(0, h / 2, -16 - rand(i) * 6);
      m.add(b.mesh(b.shared('apt-roof', () => new THREE.BoxGeometry(4.6, 0.25, 1.9)), '#3f6f9e', 0, h / 2 + 0.12, 0));
      return m;
    });
    // 먼 산 + 남산타워
    b.row(5, 220, 0.12, (i) => {
      const h = 7 + rand(i + 1) * 5;
      const m = mountain(b, 9 + rand(i) * 5, h, i % 2 ? '#6f93ad' : '#82a2ba', undefined, i);
      m.position.z = -46;
      if (i === 2) {
        m.add(b.mesh(b.geo(new THREE.CylinderGeometry(0.18, 0.3, 4, 10)), '#e9ecef', 0, h + 1.8, 0));
        m.add(b.mesh(b.geo(new THREE.CylinderGeometry(0.75, 0.55, 0.7, 14)), '#dee2e6', 0, h + 3.6, 0));
        m.add(b.mesh(b.geo(new THREE.CylinderGeometry(0.05, 0.08, 1.6, 6)), '#ff6b6b', 0, h + 4.7, 0));
      }
      return m;
    });
  },

  // 숲속: 소나무 · 활엽수 · 빨간 버섯 · 꽃 · 바위 · 쉼터 · 등산객 · 나비 · 겹겹이 산
  forest(b) {
    b.sky('#79c2b3', '#d9eed3', 26, 88, 'rgba(255,250,210,0.6)');
    b.ground('#4f8c3f', -1.75, -60);
    b.ground('#5c9a47', 3.55, 40);
    b.fixed(b.mesh(b.geo(new THREE.BoxGeometry(260, 0.04, 0.5)), '#a88a5c', 0, 0.015, -2.0)); // 흙길 가장자리
    b.fixed(b.mesh(b.geo(new THREE.BoxGeometry(260, 0.04, 0.4)), '#a88a5c', 0, 0.015, 3.75));
    b.row(18, 80, 1, (i) => {
      const t = i % 3 ? pine(b, 1.1 + rand(i) * 0.6, i) : leafTree(b, 1.2 + rand(i) * 0.4, ['#5fae4f', '#4e9c41', '#74bf5e'], i);
      t.position.z = -3.2 - rand(i + 9) * 2.5;
      return t;
    });
    b.row(16, 80, 0.75, (i) => { const t = pine(b, 1.6 + rand(i) * 0.8, i + 1); t.position.z = -8 - rand(i + 2) * 5; return t; });
    b.row(6, 80, 1, (i) => { const t = pine(b, 1.0 + rand(i) * 0.4, i + 2); t.position.z = 5.8 + rand(i) * 2; return t; });
    b.row(10, 80, 1, (i) => { const f = flowers(b, i * 11); f.position.z = -2.5 - rand(i) * 0.5; return f; });
    b.row(6, 80, 1, (i) => { const r = rock(b, 0.8 + rand(i) * 0.8, i); r.position.z = -2.7 - rand(i + 3); return r; });
    // 빨간 버섯
    b.row(7, 80, 1, (i) => {
      const g = new THREE.Group();
      g.add(b.mesh(b.shared('mush-s', () => new THREE.CylinderGeometry(0.07, 0.09, 0.22, 10)), '#f4ead7', 0, 0.11, 0, { smooth: true }));
      g.add(b.mesh(b.shared('mush-c', () => new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), '#e0412f', 0, 0.2, 0, { smooth: true, rough: 0.5 }));
      [[0.08, 0.34, 0.06], [-0.07, 0.33, -0.05], [0.0, 0.38, -0.02]].forEach(([x, y, z]) => g.add(b.mesh(b.shared('mush-d', () => new THREE.SphereGeometry(0.03, 6, 4)), '#ffffff', x, y, z, { smooth: true })));
      g.position.z = -2.35 - rand(i) * 0.4;
      g.scale.setScalar(1.4);
      return g;
    });
    // 숲속 쉼터 (나무 표지판 + 벤치에 앉은 사람)
    b.row(1, 80, 1, () => {
      const g = new THREE.Group();
      g.add(b.mesh(b.shared('sign-p', () => new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8)), '#7a5232', 0, 0.7, -2.4));
      const tex = canvasTex(b, 256, 96, (c) => {
        c.fillStyle = '#8a5a34'; c.fillRect(0, 0, 256, 96);
        c.strokeStyle = '#5e3b20'; c.lineWidth = 6; c.strokeRect(3, 3, 250, 90);
        c.fillStyle = '#fff6e0'; c.font = 'bold 38px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('숲속 쉼터 →', 128, 50);
      });
      const s = board(b, 1.1, 0.42, tex);
      s.position.set(0, 1.3, -2.36);
      g.add(s);
      const bb = bench(b); bb.position.set(1.6, 0, -2.9); g.add(bb);
      const p = person(b, 77, { pose: 'sit', hat: '#e8590c', face: 0 }); p.position.set(1.5, 0, -2.88); g.add(p);
      return g;
    }, 0).forEach((g) => { g.position.x = 12; });
    // 등산객
    b.row(5, 80, 1, (i) => {
      const p = person(b, i * 17 + 9, { hat: pick(['#e8590c', '#1971c2', '#2f9e44', '#fab005'], i), backpack: pick(['#c92a2a', '#1864ab', '#5c940d', '#495057'], i + 1) });
      p.position.z = -2.25 - (i % 2) * 0.25;
      return p;
    });
    // 나비 (날개 퍼덕)
    const flies = b.row(6, 60, 0.9, (i) => {
      const g = new THREE.Group();
      const c = ['#ffd84d', '#ffffff', '#ff9bc8'][i % 3];
      const wing = b.shared('fly-w', () => new THREE.CircleGeometry(0.13, 10));
      const l = b.mesh(wing, c, -0.1, 0, 0, { double: true }); l.castShadow = false;
      const r = b.mesh(wing, c, 0.1, 0, 0, { double: true }); r.castShadow = false;
      g.add(l, r);
      g.position.set(0, 1.2 + rand(i) * 0.8, -2.8);
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
    b.row(5, 200, 0.18, (i) => { const m = mountain(b, 10 + rand(i) * 4, 9 + rand(i + 4) * 4, '#4c8a66', undefined, i); m.position.z = -30; return m; });
    b.row(4, 240, 0.08, (i) => { const m = mountain(b, 14 + rand(i + 2) * 6, 13 + rand(i) * 5, '#82b0a1', '#eef5f2', i + 9); m.position.z = -52; return m; });
  },

  // 놀이공원: 관람차 · 회전목마 · 줄무늬 천막 · 풍선 든 아이들 · 전구 줄 · 성 · 노을 하늘
  park(b) {
    b.sky('#6f5fd9', '#ffb0cc', 36, 115, 'rgba(255,214,170,0.7)');
    b.ground('#e9d8c4', -1.75, -4.2); // 산책로
    b.ground('#4cc496', -4.2, -60);
    b.ground('#5fcca3', 3.55, 40);
    b.fixed(b.mesh(b.geo(new THREE.BoxGeometry(260, 0.1, 0.14)), '#ffffff', 0, 0.05, -1.8));

    // 관람차
    b.row(1, 160, 0.1, () => {
      const g = new THREE.Group();
      const R = 6;
      [-1, 1].forEach((s) => {
        const leg = b.mesh(b.shared('fw-leg', () => new THREE.CylinderGeometry(0.16, 0.24, R + 1.4, 8)), '#f8f9fa', s * 1.5, (R + 1) / 2, 0.7, { metal: 0.3, rough: 0.4 });
        leg.rotation.z = -s * 0.24;
        g.add(leg);
      });
      const wheel = new THREE.Group();
      wheel.position.set(0, R + 1, 0);
      wheel.add(b.mesh(b.geo(new THREE.TorusGeometry(R, 0.1, 8, 64)), '#ffffff', 0, 0, 0, { emissive: 0.5, smooth: true }));
      wheel.add(b.mesh(b.geo(new THREE.TorusGeometry(R * 0.55, 0.06, 6, 48)), '#ffd6e7', 0, 0, 0, { emissive: 0.4, smooth: true }));
      const cols = ['#ff6b8b', '#ffd34d', '#5ec8ff', '#7be07b', '#c78bff', '#ff9f4d'];
      const cabins: THREE.Object3D[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spoke = b.mesh(b.shared('fw-sp', () => new THREE.BoxGeometry(0.05, R, 0.05)), '#ffffff');
        spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
        spoke.rotation.z = a - Math.PI / 2;
        wheel.add(spoke);
        const cab = new THREE.Group();
        cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
        cab.add(b.mesh(b.shared('fw-cab', () => new THREE.CapsuleGeometry(0.34, 0.2, 4, 10)), cols[i % cols.length], 0, -0.5, 0, { smooth: true, rough: 0.4 }));
        cab.add(b.mesh(b.shared('fw-win', () => new THREE.BoxGeometry(0.5, 0.2, 0.72)), '#e7f5ff', 0, -0.45, 0, { rough: 0.1 }));
        wheel.add(cab);
        cabins.push(cab);
      }
      g.add(wheel);
      g.position.z = -26;
      b.anims.push((dt) => {
        wheel.rotation.z += dt * 0.22;
        cabins.forEach((c) => { c.rotation.z = -wheel.rotation.z; });
      });
      return g;
    }, 0).forEach((g) => { g.position.x = 22; });

    // 회전목마
    b.row(1, 90, 0.92, () => {
      const g = new THREE.Group();
      g.add(b.mesh(b.geo(new THREE.CylinderGeometry(2.1, 2.2, 0.3, 24)), '#ffe3ef', 0, 0.15, 0, { smooth: true }));
      const top = new THREE.Group();
      for (let k = 0; k < 12; k++) {
        const seg = b.mesh(b.shared('car-roof', () => new THREE.ConeGeometry(2.4, 1.1, 2, 1, true, 0, Math.PI * 2 / 12)), k % 2 ? '#ffffff' : '#ff6b8b', 0, 3.25, 0, { double: true });
        seg.rotation.y = (k / 12) * Math.PI * 2;
        top.add(seg);
      }
      top.add(b.mesh(b.shared('car-top', () => new THREE.SphereGeometry(0.22, 12, 10)), '#ffd43b', 0, 3.9, 0, { emissive: 0.6, smooth: true }));
      g.add(top);
      g.add(b.mesh(b.geo(new THREE.CylinderGeometry(0.25, 0.25, 2.8, 12)), '#ffd43b', 0, 1.6, 0, { metal: 0.4, rough: 0.3 }));
      const ride = new THREE.Group();
      const horses: THREE.Group[] = [];
      const hc = ['#ffffff', '#ffe066', '#a5d8ff', '#ffc9de'];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const h = new THREE.Group();
        h.position.set(Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55);
        h.rotation.y = -a;
        h.add(b.mesh(b.shared('car-pole', () => new THREE.CylinderGeometry(0.025, 0.025, 2.8, 6)), '#ffd43b', 0, 1.6, 0, { metal: 0.5, rough: 0.3 }));
        const horse = new THREE.Group();
        const hb = b.mesh(b.shared('h-body', () => new THREE.CapsuleGeometry(0.16, 0.42, 4, 10)), hc[k % 4], 0, 0, 0, { smooth: true });
        hb.rotation.x = Math.PI / 2;
        horse.add(hb);
        const neck = b.mesh(b.shared('h-neck', () => new THREE.CapsuleGeometry(0.08, 0.2, 4, 8)), hc[k % 4], 0, 0.2, 0.3, { smooth: true });
        neck.rotation.x = 0.6;
        horse.add(neck);
        horse.add(b.mesh(b.shared('h-head', () => new THREE.BoxGeometry(0.12, 0.13, 0.26)), hc[k % 4], 0, 0.33, 0.43));
        horse.add(b.mesh(b.shared('h-mane', () => new THREE.BoxGeometry(0.04, 0.18, 0.2)), '#e64980', 0, 0.36, 0.28));
        horse.position.y = 1.0;
        h.add(horse);
        h.userData.horse = horse;
        ride.add(h);
        horses.push(h);
      }
      g.add(ride);
      g.position.z = -6.5;
      b.anims.push((dt, t) => {
        ride.rotation.y += dt * 0.6;
        top.rotation.y = ride.rotation.y;
        horses.forEach((h, k) => { (h.userData.horse as THREE.Group).position.y = 1.0 + Math.sin(t * 2.4 + k * 1.3) * 0.18; });
      });
      return g;
    }, 0).forEach((g) => { g.position.x = 6; });

    // 줄무늬 천막
    b.row(5, 90, 0.7, (i) => {
      const g = new THREE.Group();
      const c = ['#ff5a7a', '#ffb12b', '#4fb3ff', '#9b6bff', '#2fcf9a'][i % 5];
      const n = 12;
      for (let k = 0; k < n; k++) {
        const seg = b.mesh(b.shared('tent-w', () => new THREE.CylinderGeometry(1.6, 1.6, 1.6, 2, 1, true, 0, Math.PI * 2 / 12)), k % 2 ? '#ffffff' : c, 0, 0.8, 0, { double: true });
        seg.rotation.y = (k / n) * Math.PI * 2;
        g.add(seg);
        const roof = b.mesh(b.shared('tent-r', () => new THREE.ConeGeometry(1.9, 1.5, 2, 1, true, 0, Math.PI * 2 / 12)), k % 2 ? c : '#ffffff', 0, 2.35, 0, { double: true });
        roof.rotation.y = (k / n) * Math.PI * 2;
        g.add(roof);
      }
      g.add(b.mesh(b.shared('tent-f', () => new THREE.ConeGeometry(0.12, 0.5, 6)), '#ffd84d', 0, 3.3, 0));
      g.position.z = -11 - rand(i) * 4;
      return g;
    });
    // 전구 줄 (기둥 사이)
    b.row(8, 80, 1, (i) => {
      const g = new THREE.Group();
      g.add(b.mesh(b.shared('bulb-p', () => new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8)), '#ffffff', 0, 1.3, 0));
      const cols = ['#ff4f7b', '#ffd84d', '#4fc3ff', '#7cf07c', '#c58bff'];
      for (let k = 0; k < 10; k++) {
        const x = (k + 0.5) * (10 / 10);
        const y = 2.5 - Math.sin((k + 0.5) / 10 * Math.PI) * 0.6;
        const bulb = b.mesh(b.shared('bulb', () => new THREE.SphereGeometry(0.08, 10, 8)), cols[(k + i) % cols.length], x, y, 0, { emissive: 2, smooth: true });
        bulb.castShadow = false;
        g.add(bulb);
      }
      g.position.z = -2.2;
      return g;
    }, 0);
    // 사람들: 풍선 든 아이 · 걷는 가족 · 손 흔드는 사람 · 벤치
    b.row(12, 80, 1, (i) => {
      const kid = i % 3 === 0;
      const p = person(b, i * 19 + 5, { kid, balloon: kid || i % 5 === 1 ? pick(['#ff4f7b', '#ffd84d', '#4fc3ff', '#7cf07c', '#c58bff'], i) : undefined });
      p.position.z = -2.6 - (i % 3) * 0.55;
      return p;
    });
    b.row(4, 80, 1, (i) => { const p = person(b, i * 23 + 300, { pose: 'wave' }); p.position.z = -3.7; return p; });
    b.row(3, 80, 1, (i) => {
      const g = new THREE.Group();
      g.add(bench(b, '#e64980'));
      const p = person(b, i * 31 + 400, { pose: 'sit', face: 0 }); p.position.set(-0.15, 0, 0.02); g.add(p);
      g.position.z = -4.0;
      return g;
    });
    // 동화 성
    b.row(1, 160, 0.16, () => {
      const g = new THREE.Group();
      g.add(b.mesh(b.geo(new THREE.BoxGeometry(5, 3.4, 2)), '#fff1f7', 0, 1.7, 0));
      [[-2.6, 5], [2.6, 5], [0, 6.6]].forEach(([x, h]) => {
        g.add(b.mesh(b.geo(new THREE.CylinderGeometry(0.7, 0.75, h, 14)), '#ffe3ef', x, h / 2, 0, { smooth: true }));
        g.add(b.mesh(b.geo(new THREE.ConeGeometry(0.95, 1.9, 14)), '#8a6cff', x, h + 0.95, 0, { smooth: true }));
        g.add(b.mesh(b.shared('flag', () => new THREE.BoxGeometry(0.4, 0.22, 0.02)), '#ff6b8b', x + 0.2, h + 2.1, 0));
      });
      const door = b.mesh(b.geo(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 16, 1, false, 0, Math.PI)), '#6b4a2f', 0, 0.75, 1.0);
      door.rotation.x = Math.PI / 2;
      g.add(door);
      g.position.z = -32;
      return g;
    }, 0).forEach((g) => { g.position.x = 52; });
  },

  // 바닷가: 모래사장 · 파라솔 · 일광욕 · 파도 · 돛단배 · 빨간·흰 등대 · 섬 · 갈매기 · 해안 소나무
  sea(b) {
    b.sky('#3592ea', '#cbe9ff', 44, 140, 'rgba(255,250,215,0.75)');
    b.ground('#dcc28a', -1.75, -6.8);
    const sea = b.ground('#1667b5', -6.8, -140, -0.03, { rough: 0.4 });
    (sea.material as THREE.MeshStandardMaterial).envMapIntensity = 0.35;
    b.ground('#7aa565', 3.55, 40);
    b.ground('#bfdcf0', -6.75, -7.1, -0.02); // 물가 거품
    // 가드레일
    b.fixed(b.mesh(b.geo(new THREE.BoxGeometry(260, 0.22, 0.06)), '#e6e9ee', 0, 0.62, -1.95, { metal: 0.6, rough: 0.3 }));
    b.row(30, 80, 1, () => b.mesh(b.shared('rail-p', () => new THREE.BoxGeometry(0.08, 0.7, 0.08)), '#c9ced6', 0, 0.35, -1.95), 0);
    // 파도
    const waves = b.row(14, 80, 0.6, (i) => {
      const w = b.mesh(b.shared('wave', () => new THREE.CapsuleGeometry(0.06, 2.2, 4, 8)), '#ffffff', 0, 0, -7.3 - (i % 3) * 1.7, { smooth: true });
      w.rotation.z = Math.PI / 2;
      w.castShadow = false;
      w.userData.k = i;
      return w;
    });
    b.anims.push((_, t) => waves.forEach((w) => { const k = w.userData.k as number; w.position.y = Math.sin(t * 1.6 + k) * 0.04; w.scale.y = 0.8 + Math.sin(t * 0.8 + k) * 0.2; }));
    // 파라솔 · 수건 · 사람들
    b.row(6, 80, 1, (i) => {
      const g = new THREE.Group();
      const c = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#f783ac', '#845ef7'][i % 6];
      g.add(b.mesh(b.shared('para-p', () => new THREE.CylinderGeometry(0.025, 0.025, 1.7, 6)), '#f8f9fa', 0, 0.85, 0));
      for (let k = 0; k < 8; k++) {
        const seg = b.mesh(b.shared('para-c', () => new THREE.ConeGeometry(1.0, 0.4, 2, 1, true, 0, Math.PI * 2 / 8)), k % 2 ? '#ffffff' : c, 0, 1.75, 0, { double: true });
        seg.rotation.y = (k / 8) * Math.PI * 2;
        g.add(seg);
      }
      const towel = b.mesh(b.shared('towel', () => new THREE.BoxGeometry(0.5, 0.01, 1.0)), c, 0.6, 0.006, 0.3);
      towel.castShadow = false;
      g.add(towel);
      const lie = person(b, i * 37 + 11, { pose: 'lie', face: 0 });
      lie.position.set(0.6, 0, -0.3);
      g.add(lie);
      if (i % 2 === 0) { const s = person(b, i * 41 + 12, { pose: i % 4 === 0 ? 'wave' : 'stand' }); s.position.set(-0.7, 0, 0.4); g.add(s); }
      g.position.z = -4.0 - rand(i) * 1.6;
      return g;
    });
    // 바닷가 걷는 사람 · 아이
    b.row(6, 80, 1, (i) => { const p = person(b, i * 43 + 500, { kid: i % 3 === 2, hat: i % 2 ? '#fff3bf' : undefined }); p.position.z = -2.6 - (i % 3) * 1.1; return p; });
    // 해안 소나무
    b.row(6, 80, 1, (i) => { const t = pine(b, 1.0 + rand(i) * 0.4, i); t.position.z = 5 + rand(i) * 2; return t; });
    // 돛단배 (둥실)
    const boats = b.row(3, 120, 0.3, (i) => {
      const g = new THREE.Group();
      const hull = b.mesh(b.shared('boat-h', () => new THREE.CapsuleGeometry(0.28, 1.2, 4, 10)), '#ffffff', 0, 0.1, 0, { smooth: true });
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(1, 1, 0.6);
      g.add(hull);
      g.add(b.mesh(b.shared('boat-m', () => new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6)), '#8a5a34', 0, 1.1, 0));
      const sail = b.mesh(b.shared('boat-s', () => new THREE.ConeGeometry(0.6, 1.5, 3, 1, false, 0, Math.PI)), pick(['#ff6b6b', '#ffd43b', '#4dabf7'], i), 0.25, 1.15, 0, { double: true });
      sail.scale.set(1, 1, 0.05);
      g.add(sail);
      g.position.z = -14 - i * 5;
      g.userData.k = i;
      return g;
    });
    b.anims.push((_, t) => boats.forEach((g) => { const k = g.userData.k as number; g.position.y = Math.sin(t * 1.2 + k) * 0.06; g.rotation.x = Math.sin(t * 1.1 + k) * 0.05; }));
    // 등대
    b.row(1, 140, 0.32, () => {
      const g = new THREE.Group();
      g.add(b.mesh(b.geo(new THREE.CylinderGeometry(1.4, 1.8, 0.8, 12)), '#8a8f96', 0, 0.4, 0));
      for (let k = 0; k < 5; k++) g.add(b.mesh(b.geo(new THREE.CylinderGeometry(0.62 - k * 0.04, 0.66 - k * 0.04, 1, 16)), k % 2 ? '#ffffff' : '#e23b3b', 0, 1.3 + k, 0, { smooth: true }));
      g.add(b.mesh(b.geo(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 12)), '#fff6c2', 0, 6.05, 0, { emissive: 1.6 }));
      g.add(b.mesh(b.geo(new THREE.ConeGeometry(0.55, 0.6, 12)), '#e23b3b', 0, 6.6, 0, { smooth: true }));
      g.position.z = -20;
      return g;
    }, 0).forEach((g) => { g.position.x = 26; });
    // 섬
    b.row(4, 240, 0.08, (i) => {
      const g = new THREE.Group();
      const isl = b.mesh(b.geo(new THREE.SphereGeometry(6 + rand(i) * 4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), '#5b8c5f');
      isl.scale.y = 0.45;
      isl.castShadow = false;
      g.add(isl);
      g.position.z = -75 - rand(i) * 15;
      return g;
    });
    // 갈매기
    const gulls = b.row(6, 70, 0.5, (i) => {
      const g = new THREE.Group();
      const wing = b.shared('gull-w', () => new THREE.BoxGeometry(0.5, 0.025, 0.14));
      const l = b.mesh(wing, '#ffffff', -0.22, 0, 0);
      const r = b.mesh(wing, '#ffffff', 0.22, 0, 0);
      const gb = b.mesh(b.shared('gull-b', () => new THREE.CapsuleGeometry(0.05, 0.2, 4, 6)), '#ffffff', 0, 0, 0, { smooth: true });
      gb.rotation.x = Math.PI / 2;
      g.add(gb, l, r);
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
