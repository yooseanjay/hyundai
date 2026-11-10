// 주행 배경 장면: 실제 한국 도로 모양 위를 달리며, 도로 양쪽에 장면을 계속 이어 붙인다
//  - 도로 모양: 실제 도로(OpenStreetMap)의 굽이를 그대로 (roadPath.ts)
//  - 24단위(약 48m)씩 '조각'을 만들어 차 앞에 계속 붙이고, 지나간 조각은 치움 (끝없이 복사 → 붙여넣기)
//  - 양쪽 보도 · 가게 · 나무 · 사람 · 놀이기구 · 바다 …
//  - 모두 코드로 만든 로우폴리 모양 (내려받는 파일 없음)
import * as THREE from 'three';
import { REAL_ROADS } from '../data/realRoads';
import { InfiniteRoad } from './roadPath';

export type SceneId = 'city' | 'forest' | 'park' | 'sea';

export const SCENES: { id: SceneId; label: string; emoji: string }[] = [
  { id: 'city', label: '한국 도로', emoji: '🏙️' },
  { id: 'forest', label: '숲속', emoji: '🌲' },
  { id: 'park', label: '놀이공원', emoji: '🎡' },
  { id: 'sea', label: '바닷가', emoji: '🌊' },
];

export interface Scenery {
  road: InfiniteRoad;
  /** S: 지금까지 달린 거리(단위), dt: 초, t: 경과 시간 */
  update(S: number, dt: number, t: number): void;
  dispose(): void;
}

/** 조각 길이 (화면 단위, 1단위 = 2m) */
export const CH = 24;
/** 도로 가운데에서 가장자리까지 (4차로) */
export const ROAD_HALF = 4.2;
const AHEAD = 7;
const BEHIND = 2;

type Disp = { dispose(): void };
interface MatOpt { emissive?: number; smooth?: boolean; rough?: number; metal?: number; double?: boolean; map?: THREE.Texture }

interface Spec {
  sky: [top: string, bottom: string, fogNear: number, fogFar: number, sun?: string];
  ground: string;
  /** 도로 옆 띠: [옆 거리 a, b, 색, 높이] (음수 = 왼쪽) */
  strips: [number, number, string, number?][];
  spawn(c: Chunk): void;
}

/** 장면 만들기. scene.background · fog 도 장면에 맞게 바꾼다 */
export function buildScenery(scene: THREE.Scene, id: SceneId): Scenery {
  const b = new Builder(scene);
  const road = new InfiniteRoad(REAL_ROADS[id]);
  const spec = SPECS[id];
  b.sky(...spec.sky);
  const ground = b.mesh(new THREE.PlaneGeometry(700, 700), spec.ground, 0, -0.03, 0, { smooth: true, rough: 1 });
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  b.root.add(ground);

  const chunks = new Map<number, Chunk>();
  const make = (k: number) => {
    const c = new Chunk(b, road, k);
    c.road(spec.strips);
    spec.spawn(c);
    b.root.add(c.group);
    chunks.set(k, c);
  };
  let first = true;

  return {
    road,
    update(S, dt, t) {
      const kc = Math.floor(S / CH);
      // 차 앞 조각을 붙이고 (한 번에 2개씩, 처음엔 한꺼번에), 지나간 조각은 치움
      let budget = first ? 99 : 2;
      first = false;
      for (let k = Math.max(0, kc - BEHIND); k <= kc + AHEAD && budget > 0; k++) {
        if (!chunks.has(k)) { make(k); budget--; }
      }
      chunks.forEach((c, k) => {
        if (k < kc - BEHIND || k > kc + AHEAD) { b.root.remove(c.group); c.dispose(); chunks.delete(k); }
      });
      const f = road.at(S);
      ground.position.set(f.pos.x, -0.03, f.pos.z);
      chunks.forEach((c) => c.tick(dt, t));
    },
    dispose() {
      chunks.forEach((c) => c.dispose());
      b.dispose();
    },
  };
}

// ───────── 재료 · 모양 창고 (장면 하나 동안 같이 씀) ─────────

class Builder {
  root = new THREE.Group();
  private mats = new Map<string, THREE.Material>();
  private geos = new Map<string, THREE.BufferGeometry>();
  private texs = new Map<string, THREE.Texture>();
  private own = new Set<Disp>();
  roadMat: THREE.Material;
  constructor(public scene: THREE.Scene) {
    scene.add(this.root);
    this.roadMat = new THREE.MeshStandardMaterial({ map: this.tex(roadTexture()), roughness: 0.85, side: THREE.DoubleSide });
    this.own.add(this.roadMat);
  }

  mat(color: string, o: MatOpt = {}): THREE.Material {
    const k = [color, o.emissive, o.smooth, o.rough, o.metal, o.double, o.map?.uuid].join('|');
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: o.map ? '#ffffff' : color, map: o.map ?? null, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, flatShading: !o.smooth && !o.map,
        emissive: o.emissive ? color : '#000', emissiveIntensity: o.emissive ?? 0, emissiveMap: o.emissive && o.map ? o.map : null,
        side: o.double ? THREE.DoubleSide : THREE.FrontSide,
      });
      this.mats.set(k, m);
    }
    return m;
  }

  /** 같은 모양은 한 번만 만들어 나눠 씀 */
  shared(key: string, make: () => THREE.BufferGeometry) {
    let g = this.geos.get(key);
    if (!g) { g = make(); this.geos.set(key, g); }
    return g;
  }

  /** 같은 그림(간판 등)은 한 번만 */
  canvas(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
    let t = this.texs.get(key);
    if (!t) {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      draw(cv.getContext('2d')!);
      t = this.tex(new THREE.CanvasTexture(cv));
      this.texs.set(key, t);
    }
    return t;
  }

  mesh(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, o: MatOpt = {}) {
    const m = new THREE.Mesh(g, this.mat(color, o));
    if (![...this.geos.values()].includes(g)) this.own.add(g);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  tex(t: THREE.Texture) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; this.own.add(t); return t; }

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
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    this.own.add(t);
    this.scene.background = t;
    this.scene.fog = new THREE.Fog(bottom, fogNear, fogFar);
  }

  dispose() {
    this.scene.remove(this.root);
    this.scene.background = null;
    this.scene.fog = null;
    this.own.forEach((d) => d.dispose());
    this.mats.forEach((m) => m.dispose());
    this.geos.forEach((g) => g.dispose());
  }
}

/** 한국 도로: 가운데 노란 겹선(중앙선) · 흰 차로 점선 · 가장자리 흰 선. 가로 = 길이, 세로 = 폭 */
function roadTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#1f2124';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
  g.fillStyle = '#f2c230';
  g.fillRect(0, 121, 512, 5);
  g.fillRect(0, 131, 512, 5);
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.fillRect(0, 62, 300, 4);
  g.fillRect(0, 190, 300, 4);
  g.fillStyle = 'rgba(255,255,255,.7)';
  g.fillRect(0, 6, 512, 5);
  g.fillRect(0, 245, 512, 5);
  return new THREE.CanvasTexture(cv);
}

// ───────── 조각 (도로 약 48m + 양쪽 장면) ─────────

class Chunk {
  group = new THREE.Group();
  private own = new Set<Disp>();
  private anims: ((dt: number, t: number) => void)[] = [];
  private people: THREE.Group[] = [];
  constructor(public b: Builder, public path: InfiniteRoad, public k: number) {}

  get S0() { return this.k * CH; }
  /** 이 조각에서 늘 같은 난수 (0~1) */
  r(n: number) { return rand(this.k * 977.13 + n * 13.7); }

  /** 길이 방향 s(0~CH) · 옆 거리 off(+ 오른쪽) 에 놓기. 물건의 앞(+z)은 face=0 일 때 오른쪽을 봄 */
  put<T extends THREE.Object3D>(o: T, s: number, off: number, face = 0): T {
    const f = this.path.at(this.S0 + s);
    const y = o.position.y;
    o.position.copy(f.pos).addScaledVector(f.right, off);
    o.position.y = y;
    o.rotation.y = f.heading + face + ((o.userData.face as number | undefined) ?? 0);
    this.group.add(o);
    return o;
  }

  /** 양쪽에 같은 것을: side -1 = 왼쪽(길 쪽을 보도록 face 0), +1 = 오른쪽(face π) */
  both(fn: (side: 1 | -1, face: number, n: number) => void) {
    fn(-1, 0, 0);
    fn(1, Math.PI, 100);
  }

  /** 도로와 옆 띠 */
  road(strips: Spec['strips']) {
    this.group.add(this.ribbon(-ROAD_HALF, ROAD_HALF, this.b.roadMat, 0.012, true));
    for (const [a, c, color, y] of strips) this.group.add(this.ribbon(Math.min(a, c), Math.max(a, c), this.b.mat(color, { smooth: true, rough: 1, double: true }), y ?? 0.006));
  }

  private ribbon(a: number, c: number, mat: THREE.Material, y: number, uv = false) {
    const n = CH;
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const S = this.S0 + (CH * i) / n + (i === n ? 0.06 : 0); // 이음매 틈 없게 살짝 겹침
      const f = this.path.at(S);
      const p1 = f.pos.clone().addScaledVector(f.right, a);
      const p2 = f.pos.clone().addScaledVector(f.right, c);
      pos.push(p1.x, y, p1.z, p2.x, y, p2.z);
      uvs.push(uv ? S / 8 : 0, 0, uv ? S / 8 : 0, 1);
      if (i < n) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.own.add(g);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }

  /** 조각에서만 쓰는 모양 (조각을 치울 때 같이 치움) */
  geo<T extends THREE.BufferGeometry>(g: T): T { this.own.add(g); return g; }

  person(seed: number, o: PersonOpt, s: number, off: number, face = 0) {
    const p = person(this.b, this.k * 31 + seed, o);
    this.people.push(p);
    return this.put(p, s, off, face);
  }

  anim(fn: (dt: number, t: number) => void) { this.anims.push(fn); }

  tick(dt: number, t: number) {
    for (const p of this.people) {
      const w = p.userData.walk as number | undefined;
      if (w) p.translateZ(w * dt);
    }
    animatePeople(this.people, t);
    this.anims.forEach((a) => a(dt, t));
  }

  dispose() { this.own.forEach((d) => d.dispose()); }
}

/** 늘 같은 배치가 나오도록 하는 의사 난수 (0~1) */
function rand(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
const pick = <T,>(a: T[], n: number) => a[Math.floor(rand(n) * a.length) % a.length];

function board(b: Builder, w: number, h: number, tex: THREE.Texture, glow = false) {
  const m = new THREE.Mesh(b.shared(`board${w}x${h}`, () => new THREE.PlaneGeometry(w, h)), b.mat('#ffffff', { map: tex, emissive: glow ? 0.35 : 0, rough: 0.6 }));
  m.castShadow = true;
  return m;
}

// ───────── 사람 ─────────

const SKIN = ['#f3cfb3', '#e8b892', '#d49a72', '#f7dcc6', '#c48662'];
const SHIRT = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#f783ac', '#ffffff', '#845ef7', '#ff922b', '#20c997', '#343a40'];
const PANTS = ['#364fc7', '#495057', '#212529', '#e9ecef', '#5c3d2e', '#1c7ed6'];
const HAIR = ['#1e1611', '#2b1d14', '#3b2a1e', '#0f0f0f', '#6b4a2f', '#a07850'];
const BALLOON = ['#ff4f7b', '#ffd84d', '#4fc3ff', '#7cf07c', '#c58bff'];

type Pose = 'walk' | 'stand' | 'wave' | 'lie' | 'sit';
interface PersonOpt { pose?: Pose; dir?: 1 | -1; kid?: boolean; hat?: string; backpack?: string; balloon?: string; face?: number }

/**
 * 사람 한 명 (키 약 0.86 = 차 크기에 맞춘 1.7m). 정면은 +z.
 * 걷는 사람은 userData.walk (초당 걸음) 만큼 앞으로 간다.
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
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.08, 0.5, 0);
    pivot.add(b.mesh(legG, pants, 0, -0.24, 0, { smooth: true }));
    body.add(pivot);
    return pivot;
  });
  body.add(b.mesh(b.shared('p-torso', () => new THREE.CapsuleGeometry(0.16, 0.26, 4, 10)), shirt, 0, 0.76, 0, { smooth: true }));
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.21, 0.95, 0);
    pivot.add(b.mesh(armG, shirt, 0, -0.18, 0, { smooth: true }));
    pivot.add(b.mesh(b.shared('p-hand', () => new THREE.SphereGeometry(0.05, 8, 6)), skin, 0, -0.39, 0, { smooth: true }));
    pivot.rotation.z = s * 0.08;
    body.add(pivot);
    return pivot;
  });
  body.add(b.mesh(b.shared('p-head', () => new THREE.SphereGeometry(0.135, 14, 12)), skin, 0, 1.2, 0, { smooth: true }));
  const hairM = b.mesh(b.shared('p-hair', () => new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair, 0, 1.215, -0.012, { smooth: true });
  hairM.rotation.x = -0.25;
  body.add(hairM);
  if (longHair) body.add(b.mesh(b.shared('p-long', () => new THREE.CapsuleGeometry(0.12, 0.16, 4, 8)), hair, 0, 1.1, -0.07, { smooth: true }));
  [-1, 1].forEach((s) => body.add(b.mesh(b.shared('p-eye', () => new THREE.SphereGeometry(0.018, 6, 6)), '#1a1a1a', s * 0.045, 1.21, 0.125, { smooth: true })));
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
    g.userData.face = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.userData.walk = o.kid ? 0.5 : 0.42 + rand(seed + 6) * 0.2;
  } else if (pose === 'lie') {
    body.rotation.x = -Math.PI / 2;
    body.position.set(0, 0.1, 0.6);
    g.userData.face = o.face ?? rand(seed) * 2;
  } else if (pose === 'sit') {
    legs.forEach((l) => { l.rotation.x = -Math.PI / 2; });
    body.position.y = -0.18;
    g.userData.face = o.face ?? 0;
  } else {
    g.userData.face = o.face ?? (rand(seed + 7) - 0.5) * 0.8;
  }
  body.userData = { legs, arms, pose, phase: rand(seed + 8) * 6.28, balloon: !!o.balloon };
  g.userData.body = body;
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
  const shades = [['#2f6b3a', '#3d8247'], ['#285c34', '#367341'], ['#35733d', '#47904f']][Math.floor(rand(seed) * 3)];
  g.add(b.mesh(b.shared('pine-t', () => new THREE.CylinderGeometry(0.08, 0.11, 0.7, 7)), TRUNK, 0, 0.35, 0));
  g.add(b.mesh(b.shared('pine-1', () => new THREE.ConeGeometry(0.8, 1.2, 8)), shades[0], 0, 1.0, 0));
  g.add(b.mesh(b.shared('pine-2', () => new THREE.ConeGeometry(0.62, 1.0, 8)), shades[1], 0, 1.55, 0));
  g.add(b.mesh(b.shared('pine-3', () => new THREE.ConeGeometry(0.42, 0.85, 8)), shades[0], 0, 2.05, 0));
  g.userData.face = rand(seed + 2) * 6;
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
    const m = b.mesh(blob, palette[(i + Math.floor(rand(seed) * 9)) % palette.length], x, y, z);
    m.scale.setScalar(k);
    g.add(m);
  });
  g.userData.face = rand(seed + 1) * 6;
  g.scale.setScalar(s);
  return g;
}

function mountain(c: Chunk, r: number, h: number, color: string, seed: number, snow?: string) {
  const g = new THREE.Group();
  const geo = c.geo(new THREE.ConeGeometry(r, h, 7, 2));
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > -h / 2 + 0.01 && y < h / 2 - 0.01) {
      pos.setX(i, pos.getX(i) * (0.85 + rand(i + seed) * 0.3));
      pos.setZ(i, pos.getZ(i) * (0.85 + rand(i * 3 + seed) * 0.3));
    }
  }
  geo.computeVertexNormals();
  const m = c.b.mesh(geo, color, 0, h / 2 - 0.2, 0);
  m.castShadow = false;
  g.add(m);
  if (snow) { const top = c.b.mesh(c.geo(new THREE.ConeGeometry(r * 0.28, h * 0.28, 7)), snow, 0, h * 0.86, 0); top.castShadow = false; g.add(top); }
  return g;
}

function streetLamp(b: Builder) {
  const g = new THREE.Group();
  g.add(b.mesh(b.shared('lamp-p', () => new THREE.CylinderGeometry(0.04, 0.06, 2.8, 8)), '#5f646c', 0, 1.4, 0, { metal: 0.5, rough: 0.4 }));
  g.add(b.mesh(b.shared('lamp-a', () => new THREE.BoxGeometry(0.05, 0.05, 0.9)), '#5f646c', 0, 2.78, 0.43, { metal: 0.5, rough: 0.4 }));
  g.add(b.mesh(b.shared('lamp-h', () => new THREE.BoxGeometry(0.18, 0.06, 0.3)), '#fff4d6', 0, 2.73, 0.85, { emissive: 1.5 }));
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
    g.add(b.mesh(b.shared('fl-h', () => new THREE.IcosahedronGeometry(0.045, 0)), cols[Math.floor(rand(seed * 3 + i) * 5)], x, 0.19, z));
  }
  return g;
}

function rock(b: Builder, s: number, seed: number) {
  const m = b.mesh(b.shared('rock', () => new THREE.DodecahedronGeometry(0.3, 0)), rand(seed) > 0.5 ? '#8d8f93' : '#7b7e83', 0, 0.12 * s, 0);
  m.scale.set(s, s * 0.6, s * 0.8);
  m.userData.face = seed;
  return m;
}

const SHOPS: [string, string, string][] = [
  ['카페', '#6b4a2f', '#f4e9dc'], ['편의점', '#1c7ed6', '#e7f5ff'], ['분식', '#e03131', '#fff5f5'], ['꽃집', '#e64980', '#fff0f6'],
  ['빵집', '#d9822b', '#fff4e6'], ['약국', '#2f9e44', '#ebfbee'], ['치킨', '#f08c00', '#fff9db'], ['서점', '#5f3dc4', '#f3f0ff'],
  ['떡집', '#a61e4d', '#fff0f6'], ['문구', '#0c8599', '#e3fafc'], ['안경', '#495057', '#f1f3f5'], ['국밥', '#862e9c', '#f8f0fc'],
];

/** 1층 가게 (앞 = +z) */
function shop(c: Chunk, i: number) {
  const b = c.b;
  const [name, accent, wall] = SHOPS[i % SHOPS.length];
  const g = new THREE.Group();
  const floors = 1 + Math.floor(rand(i + 20) * 3);
  const h = 2.2 + (floors - 1) * 0.75;
  g.add(b.mesh(b.shared(`shop-${floors}`, () => new THREE.BoxGeometry(4.2, h, 2.4)), wall, 0, h / 2, 0));
  g.add(b.mesh(b.shared('shop-glass', () => new THREE.BoxGeometry(3.4, 0.9, 0.04)), '#2d3a4a', -0.2, 0.6, 1.21, { rough: 0.15, metal: 0.4 }));
  g.add(b.mesh(b.shared('shop-door', () => new THREE.BoxGeometry(0.7, 1.1, 0.05)), '#3b4a5c', 1.6, 0.55, 1.22, { rough: 0.2 }));
  const awn = b.mesh(b.shared('shop-awn', () => new THREE.BoxGeometry(3.9, 0.06, 0.75)), accent, 0, 1.35, 1.45);
  awn.rotation.x = 0.35;
  g.add(awn);
  const tex = b.canvas(`sign-${name}`, 256, 64, (x) => {
    x.fillStyle = accent; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#ffffff'; x.font = 'bold 42px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, 128, 34);
  });
  const sign = board(b, 2.6, 0.62, tex, true);
  sign.position.set(0, 1.85, 1.22);
  g.add(sign);
  for (let k = 0; k < floors - 1; k++) {
    [-1.2, 0, 1.2].forEach((x) => g.add(b.mesh(b.shared('shop-win', () => new THREE.BoxGeometry(0.7, 0.45, 0.04)), '#4b6582', x, 2.45 + k * 0.75, 1.21, { rough: 0.2, metal: 0.3 })));
  }
  return g;
}

/** 아파트 (동 번호) */
function apartment(c: Chunk, i: number) {
  const b = c.b;
  const n = i % 9;
  const floors = 15 + Math.floor(rand(n + 3) * 10);
  const h = floors * 0.42;
  const tex = b.canvas(`apt-${n}`, 128, 256, (g) => {
    g.fillStyle = '#f1ebe0'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#c9b99d'; g.fillRect(0, 0, 128, 26);
    g.fillStyle = '#34465f'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
    g.fillText(`${101 + n}동`, 64, 20);
    for (let y = 34; y < 250; y += 10) {
      g.fillStyle = '#e4dccd'; g.fillRect(0, y + 7, 128, 2);
      for (let x = 8; x < 120; x += 20) {
        g.fillStyle = rand(x * 3 + y + n) > 0.8 ? '#ffe7a3' : '#61758f';
        g.fillRect(x, y, 14, 6);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const m = b.mesh(b.shared(`apt-${n}`, () => new THREE.BoxGeometry(4.4, h, 1.7)), '#ffffff', 0, h / 2, 0, { map: tex, rough: 0.9 });
  m.add(b.mesh(b.shared('apt-roof', () => new THREE.BoxGeometry(4.6, 0.25, 1.9)), '#3f6f9e', 0, h / 2 + 0.12, 0));
  return m;
}

// ───────── 장면 ─────────

const SPECS: Record<SceneId, Spec> = {
  // 한국 도로 (서울 청계천로): 양쪽 보도 · 가게 간판 · 은행나무 · 가로등 · 아파트 · 횡단보도 · 버스 정류장 · 남산타워
  city: {
    sky: ['#5c9fe3', '#d4e7f6', 40, 135],
    ground: '#8c9096',
    strips: [[4.2, 4.45, '#d3d6db', 0.03], [4.45, 9.2, '#a7abb2'], [9.2, 10.6, '#7aa25f'], [-4.2, -4.45, '#d3d6db', 0.03], [-4.45, -9.2, '#a7abb2'], [-9.2, -10.6, '#7aa25f']],
    spawn(c) {
      const b = c.b;
      c.both((side, face, n) => {
        [2, 14].forEach((s) => c.put(streetLamp(b), s, side * 4.75, face));
        [8, 20].forEach((s, j) => c.put(leafTree(b, 1.05 + c.r(n + j) * 0.25, ['#f2c94c', '#e8b931', '#f7d55c'], c.k * 7 + n + j), s, side * 5.9));
        [3, 9, 15, 21].forEach((s, j) => c.put(shop(c, Math.floor(c.r(n + 10 + j) * SHOPS.length)), s, side * 12.4, face));
        if (c.r(n + 30) > 0.35) c.put(apartment(c, Math.floor(c.r(n + 31) * 9)), 6 + c.r(n + 32) * 12, side * (30 + c.r(n + 33) * 10), face);
        for (let j = 0; j < 3; j++) c.person(n + j, { backpack: c.r(n + 40 + j) > 0.75 ? '#495057' : undefined }, c.r(n + 50 + j) * CH, side * (6.4 + c.r(n + 60 + j) * 2.2));
        if (c.r(n + 70) > 0.6) c.person(n + 9, { pose: 'wave' }, c.r(n + 71) * CH, side * 8.6, face);
      });
      // 횡단보도 + 신호등
      if (c.k % 6 === 3) {
        for (let j = 0; j < 9; j++) {
          const z = b.mesh(b.shared('zebra', () => new THREE.BoxGeometry(2.2, 0.006, 0.5)), '#f1f3f5', 0, 0.02, 0);
          z.castShadow = false;
          c.put(z, 12, -3.6 + j * 0.9);
        }
        c.both((side, face) => {
          const g = new THREE.Group();
          g.add(b.mesh(b.shared('tl-p', () => new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8)), '#3d4148', 0, 1.2, 0));
          g.add(b.mesh(b.shared('tl-b', () => new THREE.BoxGeometry(0.22, 0.5, 0.18)), '#2b2e33', 0, 2.6, 0));
          g.add(b.mesh(b.shared('tl-l', () => new THREE.SphereGeometry(0.06, 10, 8)), '#3ee07a', 0, 2.48, 0.1, { emissive: 2.5, smooth: true }));
          g.add(b.mesh(b.shared('tl-l', () => new THREE.SphereGeometry(0.06, 10, 8)), '#5a2020', 0, 2.72, 0.1, { smooth: true }));
          c.put(g, 13.5, side * 4.8, face);
          c.person(side + 50, { pose: 'stand' }, 11, side * 5.2, face);
        });
      }
      // 버스 정류장 (오른쪽)
      if (c.k % 5 === 1) {
        const g = new THREE.Group();
        g.add(b.mesh(b.shared('bus-roof', () => new THREE.BoxGeometry(2.4, 0.08, 0.9)), '#2b6cb0', 0, 1.5, 0));
        g.add(b.mesh(b.shared('bus-back', () => new THREE.BoxGeometry(2.4, 1.2, 0.04)), '#cfe3f7', 0, 0.85, -0.43, { rough: 0.1, metal: 0.2 }));
        [-1.15, 1.15].forEach((x) => g.add(b.mesh(b.shared('bus-post', () => new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8)), '#3d4148', x, 0.75, 0.35)));
        const tex = b.canvas('bus', 128, 64, (x) => {
          x.fillStyle = '#2b6cb0'; x.fillRect(0, 0, 128, 64);
          x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('버스', 64, 34);
        });
        const s = board(b, 0.6, 0.3, tex, true);
        s.position.set(-1.15, 1.75, 0.37);
        g.add(s);
        const bb = bench(b, '#5f646c'); bb.position.set(0, 0, -0.15); g.add(bb);
        c.put(g, 6, 6.0, Math.PI);
        c.person(61, { pose: 'sit' }, 6, 6.1, Math.PI);
        c.person(62, { pose: 'stand' }, 7.2, 5.4, Math.PI);
      }
      // 먼 산 (가끔 남산타워)
      if (c.k % 3 === 0) {
        const side = c.r(80) > 0.5 ? 1 : -1;
        const h = 9 + c.r(81) * 6;
        const m = mountain(c, 12 + c.r(82) * 6, h, c.r(83) > 0.5 ? '#6f93ad' : '#82a2ba', c.k);
        if (c.k % 12 === 0) {
          m.add(b.mesh(b.shared('tower-1', () => new THREE.CylinderGeometry(0.22, 0.36, 5, 10)), '#e9ecef', 0, h + 2.2, 0));
          m.add(b.mesh(b.shared('tower-2', () => new THREE.CylinderGeometry(0.9, 0.65, 0.85, 14)), '#dee2e6', 0, h + 4.4, 0));
          m.add(b.mesh(b.shared('tower-3', () => new THREE.CylinderGeometry(0.06, 0.1, 2, 6)), '#ff6b6b', 0, h + 5.8, 0));
        }
        c.put(m, 12, side * (75 + c.r(84) * 20));
      }
    },
  },

  // 숲속 (서울 북악산로): 양쪽 소나무 · 활엽수 · 꽃 · 바위 · 버섯 · 등산객 · 나비 · 숲속 쉼터 · 겹겹이 산
  forest: {
    sky: ['#79c2b3', '#d9eed3', 30, 115, 'rgba(255,250,210,0.6)'],
    ground: '#4f8c3f',
    strips: [[4.2, 5.2, '#a88a5c'], [-4.2, -5.2, '#a88a5c']],
    spawn(c) {
      const b = c.b;
      c.both((side, face, n) => {
        for (let j = 0; j < 7; j++) {
          const s = c.r(n + j) * CH;
          const off = side * (6.2 + c.r(n + 10 + j) * 9);
          const t = c.r(n + 20 + j) > 0.35 ? pine(b, 1.1 + c.r(n + 30 + j) * 0.7, c.k * 13 + n + j) : leafTree(b, 1.2 + c.r(n + 30 + j) * 0.4, ['#5fae4f', '#4e9c41', '#74bf5e'], c.k + j);
          c.put(t, s, off);
        }
        for (let j = 0; j < 6; j++) c.put(pine(b, 1.7 + c.r(n + 40 + j) * 0.9, c.k * 17 + j + n), c.r(n + 50 + j) * CH, side * (16 + c.r(n + 60 + j) * 14));
        for (let j = 0; j < 2; j++) c.put(flowers(b, c.k * 11 + n + j), c.r(n + 70 + j) * CH, side * (5.5 + c.r(n + 72 + j) * 0.6));
        c.put(rock(b, 0.8 + c.r(n + 74) * 0.9, c.k + n), c.r(n + 75) * CH, side * (5.8 + c.r(n + 76) * 1.5));
        if (c.r(n + 77) > 0.4) {
          const g = new THREE.Group();
          g.add(b.mesh(b.shared('mush-s', () => new THREE.CylinderGeometry(0.07, 0.09, 0.22, 10)), '#f4ead7', 0, 0.11, 0, { smooth: true }));
          g.add(b.mesh(b.shared('mush-c', () => new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), '#e0412f', 0, 0.2, 0, { smooth: true, rough: 0.5 }));
          [[0.08, 0.34, 0.06], [-0.07, 0.33, -0.05], [0.0, 0.38, -0.02]].forEach(([x, y, z]) => g.add(b.mesh(b.shared('mush-d', () => new THREE.SphereGeometry(0.03, 6, 4)), '#ffffff', x, y, z, { smooth: true })));
          g.scale.setScalar(1.4);
          c.put(g, c.r(n + 78) * CH, side * 5.5);
        }
        if (c.r(n + 79) > 0.3) c.person(n, { hat: pick(['#e8590c', '#1971c2', '#2f9e44', '#fab005'], c.k + n), backpack: pick(['#c92a2a', '#1864ab', '#5c940d', '#495057'], c.k + n + 1) }, c.r(n + 80) * CH, side * 4.75);
      });
      // 나비
      for (let j = 0; j < 2; j++) {
        const g = new THREE.Group();
        const col = ['#ffd84d', '#ffffff', '#ff9bc8'][Math.floor(c.r(90 + j) * 3)];
        const wing = b.shared('fly-w', () => new THREE.CircleGeometry(0.13, 10));
        const l = b.mesh(wing, col, -0.1, 0, 0, { double: true }); l.castShadow = false;
        const r = b.mesh(wing, col, 0.1, 0, 0, { double: true }); r.castShadow = false;
        g.add(l, r);
        g.position.y = 1.3;
        const k = c.k + j;
        c.put(g, c.r(92 + j) * CH, (c.r(94 + j) > 0.5 ? 1 : -1) * (5 + c.r(96 + j) * 2));
        c.anim((_, t) => {
          const a = Math.sin(t * 14 + k) * 0.9;
          l.rotation.y = a; r.rotation.y = -a;
          g.position.y = 1.3 + Math.sin(t * 2 + k) * 0.3;
        });
      }
      // 숲속 쉼터 (왼쪽)
      if (c.k % 7 === 2) {
        const g = new THREE.Group();
        g.add(b.mesh(b.shared('sign-p', () => new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8)), '#7a5232', 0, 0.7, 0));
        const tex = b.canvas('rest', 256, 96, (x) => {
          x.fillStyle = '#8a5a34'; x.fillRect(0, 0, 256, 96);
          x.strokeStyle = '#5e3b20'; x.lineWidth = 6; x.strokeRect(3, 3, 250, 90);
          x.fillStyle = '#fff6e0'; x.font = 'bold 38px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('숲속 쉼터 →', 128, 50);
        });
        const s = board(b, 1.1, 0.42, tex);
        s.position.set(0, 1.3, 0.04);
        g.add(s);
        c.put(g, 8, -5.4);
        c.put(bench(b), 11, -6.3);
        c.person(70, { pose: 'sit', hat: '#e8590c' }, 11, -6.25);
      }
      // 겹겹이 산
      if (c.k % 2 === 0) {
        c.both((side, _f, n) => {
          const h = 14 + c.r(n + 85) * 8;
          c.put(mountain(c, 16 + c.r(n + 86) * 8, h, c.r(n + 87) > 0.5 ? '#4c8a66' : '#82b0a1', c.k + n, c.r(n + 88) > 0.7 ? '#eef5f2' : undefined), c.r(n + 89) * CH, side * (60 + c.r(n + 90) * 25));
        });
      }
    },
  },

  // 놀이공원 (용인 에버랜드로 가는 길): 양쪽 산책로 · 전구 줄 · 천막 · 풍선 든 아이들 · 벤치 · 회전목마 · 관람차 · 성
  park: {
    sky: ['#6f5fd9', '#ffb0cc', 40, 135, 'rgba(255,214,170,0.7)'],
    ground: '#4cc496',
    strips: [[4.2, 4.42, '#ffffff', 0.03], [4.42, 8.4, '#e9d8c4'], [-4.2, -4.42, '#ffffff', 0.03], [-4.42, -8.4, '#e9d8c4']],
    spawn(c) {
      const b = c.b;
      c.both((side, face, n) => {
        // 전구 줄: 기둥 + 늘어진 전구
        [0, 12].forEach((s0, j) => {
          const pole = b.mesh(b.shared('bulb-p', () => new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8)), '#ffffff', 0, 1.3, 0);
          c.put(pole, s0, side * 4.7);
          for (let q = 0; q < 10; q++) {
            const u = (q + 0.5) / 10;
            const bulb = b.mesh(b.shared('bulb', () => new THREE.SphereGeometry(0.08, 10, 8)), BALLOON[(q + j + n) % 5], 0, 2.5 - Math.sin(u * Math.PI) * 0.6, 0, { emissive: 2, smooth: true });
            bulb.castShadow = false;
            c.put(bulb, s0 + u * 12, side * 4.7);
          }
        });
        // 천막
        const tent = new THREE.Group();
        const col = ['#ff5a7a', '#ffb12b', '#4fb3ff', '#9b6bff', '#2fcf9a'][Math.floor(c.r(n + 1) * 5)];
        for (let q = 0; q < 12; q++) {
          const seg = b.mesh(b.shared('tent-w', () => new THREE.CylinderGeometry(1.6, 1.6, 1.6, 2, 1, true, 0, Math.PI * 2 / 12)), q % 2 ? '#ffffff' : col, 0, 0.8, 0, { double: true });
          seg.rotation.y = (q / 12) * Math.PI * 2;
          tent.add(seg);
          const roof = b.mesh(b.shared('tent-r', () => new THREE.ConeGeometry(1.9, 1.5, 2, 1, true, 0, Math.PI * 2 / 12)), q % 2 ? col : '#ffffff', 0, 2.35, 0, { double: true });
          roof.rotation.y = (q / 12) * Math.PI * 2;
          tent.add(roof);
        }
        tent.add(b.mesh(b.shared('tent-f', () => new THREE.ConeGeometry(0.12, 0.5, 6)), '#ffd84d', 0, 3.3, 0));
        c.put(tent, c.r(n + 2) * CH, side * (15 + c.r(n + 3) * 7));
        // 사람들
        for (let j = 0; j < 3; j++) {
          const kid = c.r(n + 10 + j) > 0.6;
          c.person(n + j, { kid, balloon: kid || c.r(n + 20 + j) > 0.75 ? pick(BALLOON, c.k + n + j) : undefined }, c.r(n + 30 + j) * CH, side * (5.2 + c.r(n + 40 + j) * 2.6));
        }
        if (c.r(n + 50) > 0.5) c.person(n + 7, { pose: 'wave' }, c.r(n + 51) * CH, side * 7.9, face);
        if (c.r(n + 52) > 0.4) {
          const s = c.r(n + 53) * CH;
          c.put(bench(b, '#e64980'), s, side * 8.9, face);
          c.person(n + 8, { pose: 'sit' }, s, side * 8.85, face);
        }
        // 떠 있는 풍선
        for (let j = 0; j < 2; j++) {
          const g = new THREE.Group();
          const ball = b.mesh(b.shared('fb-ball', () => new THREE.SphereGeometry(0.28, 14, 12)), pick(BALLOON, c.k * 3 + n + j), 0, 0, 0, { smooth: true, rough: 0.35 });
          ball.scale.y = 1.2;
          g.add(ball);
          g.add(b.mesh(b.shared('fb-str', () => new THREE.CylinderGeometry(0.008, 0.008, 1.2, 4)), '#ffffff', 0, -0.9, 0));
          const y0 = 2.4 + c.r(n + 60 + j) * 1.2;
          g.position.y = y0;
          c.put(g, c.r(n + 62 + j) * CH, side * (9.5 + c.r(n + 64 + j) * 3));
          const k = c.k + n + j;
          c.anim((_, t) => { g.position.y = y0 + Math.sin(t * 1.4 + k) * 0.18; g.rotation.z = Math.sin(t + k) * 0.08; });
        }
      });
      // 회전목마 (왼쪽)
      if (c.k % 4 === 2) {
        const g = new THREE.Group();
        g.add(b.mesh(b.shared('car-base', () => new THREE.CylinderGeometry(2.1, 2.2, 0.3, 24)), '#ffe3ef', 0, 0.15, 0, { smooth: true }));
        const top = new THREE.Group();
        for (let q = 0; q < 12; q++) {
          const seg = b.mesh(b.shared('car-roof', () => new THREE.ConeGeometry(2.4, 1.1, 2, 1, true, 0, Math.PI * 2 / 12)), q % 2 ? '#ffffff' : '#ff6b8b', 0, 3.25, 0, { double: true });
          seg.rotation.y = (q / 12) * Math.PI * 2;
          top.add(seg);
        }
        top.add(b.mesh(b.shared('car-top', () => new THREE.SphereGeometry(0.22, 12, 10)), '#ffd43b', 0, 3.9, 0, { emissive: 0.6, smooth: true }));
        g.add(top);
        g.add(b.mesh(b.shared('car-mid', () => new THREE.CylinderGeometry(0.25, 0.25, 2.8, 12)), '#ffd43b', 0, 1.6, 0, { metal: 0.4, rough: 0.3 }));
        const ride = new THREE.Group();
        const horses: THREE.Group[] = [];
        const hc = ['#ffffff', '#ffe066', '#a5d8ff', '#ffc9de'];
        for (let q = 0; q < 6; q++) {
          const a = (q / 6) * Math.PI * 2;
          const h = new THREE.Group();
          h.position.set(Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55);
          h.rotation.y = -a;
          h.add(b.mesh(b.shared('car-pole', () => new THREE.CylinderGeometry(0.025, 0.025, 2.8, 6)), '#ffd43b', 0, 1.6, 0, { metal: 0.5, rough: 0.3 }));
          const horse = new THREE.Group();
          const hb = b.mesh(b.shared('h-body', () => new THREE.CapsuleGeometry(0.16, 0.42, 4, 10)), hc[q % 4], 0, 0, 0, { smooth: true });
          hb.rotation.x = Math.PI / 2;
          horse.add(hb);
          const neck = b.mesh(b.shared('h-neck', () => new THREE.CapsuleGeometry(0.08, 0.2, 4, 8)), hc[q % 4], 0, 0.2, 0.3, { smooth: true });
          neck.rotation.x = 0.6;
          horse.add(neck);
          horse.add(b.mesh(b.shared('h-head', () => new THREE.BoxGeometry(0.12, 0.13, 0.26)), hc[q % 4], 0, 0.33, 0.43));
          horse.add(b.mesh(b.shared('h-mane', () => new THREE.BoxGeometry(0.04, 0.18, 0.2)), '#e64980', 0, 0.36, 0.28));
          horse.position.y = 1.0;
          h.add(horse);
          ride.add(h);
          horses.push(horse);
        }
        g.add(ride);
        c.put(g, 12, -12.5);
        c.anim((dt, t) => {
          ride.rotation.y += dt * 0.6;
          top.rotation.y = ride.rotation.y;
          horses.forEach((h, q) => { h.position.y = 1.0 + Math.sin(t * 2.4 + q * 1.3) * 0.18; });
        });
      }
      // 관람차 (왼쪽 멀리)
      if (c.k % 8 === 5) {
        const g = new THREE.Group();
        const R = 6;
        [-1, 1].forEach((s) => {
          const leg = b.mesh(b.shared('fw-leg', () => new THREE.CylinderGeometry(0.16, 0.24, R + 1.4, 8)), '#f8f9fa', s * 1.5, (R + 1) / 2, 0.7, { metal: 0.3, rough: 0.4 });
          leg.rotation.z = -s * 0.24;
          g.add(leg);
        });
        const wheel = new THREE.Group();
        wheel.position.set(0, R + 1, 0);
        wheel.add(b.mesh(b.shared('fw-ring', () => new THREE.TorusGeometry(R, 0.1, 8, 64)), '#ffffff', 0, 0, 0, { emissive: 0.5, smooth: true }));
        wheel.add(b.mesh(b.shared('fw-ring2', () => new THREE.TorusGeometry(R * 0.55, 0.06, 6, 48)), '#ffd6e7', 0, 0, 0, { emissive: 0.4, smooth: true }));
        const cols = ['#ff6b8b', '#ffd34d', '#5ec8ff', '#7be07b', '#c78bff', '#ff9f4d'];
        const cabins: THREE.Object3D[] = [];
        for (let q = 0; q < 12; q++) {
          const a = (q / 12) * Math.PI * 2;
          const spoke = b.mesh(b.shared('fw-sp', () => new THREE.BoxGeometry(0.05, R, 0.05)), '#ffffff');
          spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
          spoke.rotation.z = a - Math.PI / 2;
          wheel.add(spoke);
          const cab = new THREE.Group();
          cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
          cab.add(b.mesh(b.shared('fw-cab', () => new THREE.CapsuleGeometry(0.34, 0.2, 4, 10)), cols[q % cols.length], 0, -0.5, 0, { smooth: true, rough: 0.4 }));
          cab.add(b.mesh(b.shared('fw-win', () => new THREE.BoxGeometry(0.5, 0.2, 0.72)), '#e7f5ff', 0, -0.45, 0, { rough: 0.1 }));
          wheel.add(cab);
          cabins.push(cab);
        }
        g.add(wheel);
        c.put(g, 12, -30, 0.3);
        c.anim((dt) => { wheel.rotation.z += dt * 0.22; cabins.forEach((x) => { x.rotation.z = -wheel.rotation.z; }); });
      }
      // 동화 성 (오른쪽 멀리)
      if (c.k % 11 === 8) {
        const g = new THREE.Group();
        g.add(b.mesh(b.shared('cs-body', () => new THREE.BoxGeometry(5, 3.4, 2)), '#fff1f7', 0, 1.7, 0));
        [[-2.6, 5], [2.6, 5], [0, 6.6]].forEach(([x, h]) => {
          g.add(b.mesh(b.shared(`cs-t${h}`, () => new THREE.CylinderGeometry(0.7, 0.75, h, 14)), '#ffe3ef', x, h / 2, 0, { smooth: true }));
          g.add(b.mesh(b.shared('cs-r', () => new THREE.ConeGeometry(0.95, 1.9, 14)), '#8a6cff', x, h + 0.95, 0, { smooth: true }));
          g.add(b.mesh(b.shared('flag', () => new THREE.BoxGeometry(0.4, 0.22, 0.02)), '#ff6b8b', x + 0.2, h + 2.1, 0));
        });
        c.put(g, 12, 36, Math.PI);
      }
    },
  },

  // 바닷가 (강릉 헌화로): 왼쪽 모래사장 · 파라솔 · 일광욕 · 파도 · 돛단배 · 등대 · 섬 · 갈매기 / 오른쪽 해안 소나무 · 언덕
  sea: {
    sky: ['#3592ea', '#cbe9ff', 50, 150, 'rgba(255,250,215,0.75)'],
    ground: '#7aa565',
    strips: [
      [-4.2, -4.45, '#d3d6db', 0.03], [-4.45, -11, '#dcc28a'], [-11, -11.7, '#e6f4ff'], [-11.7, -130, '#1667b5', -0.012],
      [4.2, 4.45, '#d3d6db', 0.03], [4.45, 6.2, '#b8bbbf'],
    ],
    spawn(c) {
      const b = c.b;
      // 가드레일 (왼쪽)
      for (let s = 0; s < CH; s += 2) {
        c.put(b.mesh(b.shared('rail-p', () => new THREE.BoxGeometry(0.08, 0.7, 0.08)), '#c9ced6', 0, 0.35, 0), s, -4.65);
        c.put(b.mesh(b.shared('rail-b', () => new THREE.BoxGeometry(2.08, 0.22, 0.06)), '#e6e9ee', 0, 0.62, 0, { metal: 0.6, rough: 0.3 }), s + 1, -4.62);
      }
      // 파라솔 · 수건 · 사람들
      for (let j = 0; j < 2; j++) {
        const g = new THREE.Group();
        const col = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#f783ac', '#845ef7'][Math.floor(c.r(j) * 6)];
        g.add(b.mesh(b.shared('para-p', () => new THREE.CylinderGeometry(0.025, 0.025, 1.7, 6)), '#f8f9fa', 0, 0.85, 0));
        for (let q = 0; q < 8; q++) {
          const seg = b.mesh(b.shared('para-c', () => new THREE.ConeGeometry(1.0, 0.4, 2, 1, true, 0, Math.PI * 2 / 8)), q % 2 ? '#ffffff' : col, 0, 1.75, 0, { double: true });
          seg.rotation.y = (q / 8) * Math.PI * 2;
          g.add(seg);
        }
        const towel = b.mesh(b.shared('towel', () => new THREE.BoxGeometry(1.0, 0.01, 0.5)), col, 0.3, 0.012, 0.6);
        towel.castShadow = false;
        g.add(towel);
        const s = 4 + j * 11 + c.r(j + 2) * 6;
        const off = -(6.8 + c.r(j + 4) * 3);
        c.put(g, s, off);
        c.person(j, { pose: 'lie', face: Math.PI / 2 }, s + 0.3, off + 0.55);
        if (c.r(j + 6) > 0.5) c.person(j + 3, { pose: c.r(j + 7) > 0.5 ? 'wave' : 'stand' }, s - 0.9, off + 0.9);
      }
      // 모래사장 걷는 사람 · 아이
      for (let j = 0; j < 2; j++) c.person(10 + j, { kid: c.r(20 + j) > 0.6, hat: c.r(22 + j) > 0.5 ? '#fff3bf' : undefined }, c.r(24 + j) * CH, -(5.4 + c.r(26 + j) * 4.6));
      // 오른쪽: 갓길 걷는 사람 · 해안 소나무 · 언덕
      if (c.r(28) > 0.6) c.person(30, {}, c.r(29) * CH, 5.4);
      for (let j = 0; j < 4; j++) c.put(pine(b, 1.0 + c.r(30 + j) * 0.5, c.k * 7 + j), c.r(34 + j) * CH, 7.5 + c.r(38 + j) * 10);
      if (c.k % 3 === 1) c.put(mountain(c, 18 + c.r(40) * 8, 10 + c.r(41) * 6, '#5f9a5c', c.k), 12, 55 + c.r(42) * 20);
      // 파도
      for (let j = 0; j < 4; j++) {
        const w = b.mesh(b.shared('wave', () => new THREE.CapsuleGeometry(0.06, 2.2, 4, 8)), '#ffffff', 0, 0, 0, { smooth: true });
        w.rotation.z = Math.PI / 2;
        w.castShadow = false;
        c.put(w, c.r(50 + j) * CH, -(12.4 + j * 1.8 + c.r(54 + j)));
        const k = c.k + j;
        c.anim((_, t) => { w.position.y = Math.sin(t * 1.6 + k) * 0.04; w.scale.y = 0.8 + Math.sin(t * 0.8 + k) * 0.2; });
      }
      // 돛단배
      if (c.k % 2 === 0) {
        const g = new THREE.Group();
        const hull = b.mesh(b.shared('boat-h', () => new THREE.CapsuleGeometry(0.28, 1.2, 4, 10)), '#ffffff', 0, 0.1, 0, { smooth: true });
        hull.rotation.z = Math.PI / 2;
        hull.scale.set(1, 1, 0.6);
        g.add(hull);
        g.add(b.mesh(b.shared('boat-m', () => new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6)), '#8a5a34', 0, 1.1, 0));
        const sail = b.mesh(b.shared('boat-s', () => new THREE.ConeGeometry(0.6, 1.5, 3, 1, false, 0, Math.PI)), pick(['#ff6b6b', '#ffd43b', '#4dabf7'], c.k), 0.25, 1.15, 0, { double: true });
        sail.scale.set(1, 1, 0.05);
        g.add(sail);
        c.put(g, c.r(60) * CH, -(24 + c.r(61) * 22));
        const k = c.k;
        c.anim((_, t) => { g.position.y = Math.sin(t * 1.2 + k) * 0.06; g.rotation.x = Math.sin(t * 1.1 + k) * 0.05; });
      }
      // 갈매기
      for (let j = 0; j < 2; j++) {
        const g = new THREE.Group();
        const wing = b.shared('gull-w', () => new THREE.BoxGeometry(0.5, 0.025, 0.14));
        const l = b.mesh(wing, '#ffffff', -0.22, 0, 0);
        const r = b.mesh(wing, '#ffffff', 0.22, 0, 0);
        const gb = b.mesh(b.shared('gull-b', () => new THREE.CapsuleGeometry(0.05, 0.2, 4, 6)), '#ffffff', 0, 0, 0, { smooth: true });
        gb.rotation.x = Math.PI / 2;
        g.add(gb, l, r);
        g.position.y = 4 + c.r(70 + j) * 2;
        c.put(g, c.r(72 + j) * CH, -(8 + c.r(74 + j) * 10));
        const k = c.k + j;
        c.anim((_, t) => { const a = Math.sin(t * 5 + k) * 0.45; l.rotation.z = a; r.rotation.z = -a; });
      }
      // 등대 (방파제 끝)
      if (c.k % 8 === 5) {
        const g = new THREE.Group();
        g.add(b.mesh(b.shared('lh-base', () => new THREE.CylinderGeometry(1.4, 1.8, 0.8, 12)), '#8a8f96', 0, 0.4, 0));
        for (let q = 0; q < 5; q++) g.add(b.mesh(b.shared(`lh-${q}`, () => new THREE.CylinderGeometry(0.62 - q * 0.04, 0.66 - q * 0.04, 1, 16)), q % 2 ? '#ffffff' : '#e23b3b', 0, 1.3 + q, 0, { smooth: true }));
        g.add(b.mesh(b.shared('lh-lamp', () => new THREE.CylinderGeometry(0.42, 0.42, 0.5, 12)), '#fff6c2', 0, 6.05, 0, { emissive: 1.6 }));
        g.add(b.mesh(b.shared('lh-top', () => new THREE.ConeGeometry(0.55, 0.6, 12)), '#e23b3b', 0, 6.6, 0, { smooth: true }));
        c.put(g, 12, -28);
      }
      // 섬
      if (c.k % 4 === 0) {
        const isl = b.mesh(b.shared('island', () => new THREE.SphereGeometry(9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), '#5b8c5f');
        isl.scale.set(1 + c.r(80), 0.45, 1);
        isl.castShadow = false;
        c.put(isl, 12, -(85 + c.r(81) * 25));
      }
    },
  },
};
