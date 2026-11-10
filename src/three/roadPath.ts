// 실제 도로 모양(위도·경도) → 3D 도로 길
//  - 1 화면 단위 = 실제 2m (차 길이에 맞춘 크기)
//  - 길이 끝나면 같은 길을 끝 방향에 맞춰 그대로 이어 붙임 (복사 → 붙여넣기를 끝없이)
import * as THREE from 'three';
import type { RealRoad } from '../data/realRoads';

export const M_PER_UNIT = 2;

export interface RoadFrame {
  /** 도로 가운데 */
  pos: THREE.Vector3;
  /** 달리는 방향 (단위 벡터) */
  tan: THREE.Vector3;
  /** 오른쪽 (단위 벡터) */
  right: THREE.Vector3;
  /** 차가 바라보는 각도 (rotation.y) */
  heading: number;
}

const UP = new THREE.Vector3(0, 1, 0);

export class InfiniteRoad {
  /** 길 한 벌의 길이 (화면 단위) */
  readonly length: number;
  private pts: THREE.Vector3[];
  private step: number;
  private kx: number;
  private kz: number;
  private origin: [number, number];
  /** 길 한 벌 끝 → 다음 벌 시작을 맞추는 변환 */
  private rel: THREE.Matrix4;
  private copies: THREE.Matrix4[] = [new THREE.Matrix4()];

  constructor(public readonly road: RealRoad) {
    const [lat0, lng0] = road.pts[0];
    this.origin = [lat0, lng0];
    this.kx = (111320 * Math.cos((lat0 * Math.PI) / 180)) / M_PER_UNIT;
    this.kz = 110540 / M_PER_UNIT;
    const ctrl = road.pts.map(([la, ln]) => new THREE.Vector3((ln - lng0) * this.kx, 0, -(la - lat0) * this.kz));
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const L = curve.getLength();
    const n = Math.max(8, Math.ceil(L / 0.5));
    this.pts = curve.getSpacedPoints(n);
    this.length = L;
    this.step = L / n;

    const h0 = headingOf(this.dirAt(0.5));
    const he = headingOf(this.dirAt(L - 0.5));
    const end = this.pts[this.pts.length - 1];
    this.rel = new THREE.Matrix4().makeTranslation(end.x, 0, end.z).multiply(new THREE.Matrix4().makeRotationY(he - h0));
  }

  /** 한 벌 안에서의 방향 (앞뒤 몇 점을 보고 부드럽게) */
  private dirAt(s: number) {
    const i = THREE.MathUtils.clamp(Math.round(s / this.step), 0, this.pts.length - 1);
    const a = this.pts[Math.max(0, i - 3)];
    const b = this.pts[Math.min(this.pts.length - 1, i + 3)];
    return new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  }

  private copy(c: number) {
    while (this.copies.length <= c) this.copies.push(this.copies[this.copies.length - 1].clone().multiply(this.rel));
    return this.copies[c];
  }

  /** 지금까지 달린 거리 S 에서의 도로 위치 · 방향 */
  at(S: number): RoadFrame {
    const s0 = Math.max(0, S);
    const c = Math.floor(s0 / this.length);
    const s = s0 - c * this.length;
    const f = s / this.step;
    const i = Math.min(this.pts.length - 2, Math.floor(f));
    const pos = this.pts[i].clone().lerp(this.pts[i + 1], f - i);
    const tan = this.dirAt(s);
    const m = this.copy(c);
    pos.applyMatrix4(m);
    tan.transformDirection(m);
    const right = new THREE.Vector3().crossVectors(tan, UP).normalize();
    return { pos, tan, right, heading: headingOf(tan) };
  }

  /** 지금 위치의 실제 위도 · 경도 (지도 표시용) */
  latLngAt(S: number): [number, number] {
    const s = ((Math.max(0, S) % this.length) + this.length) % this.length;
    const f = s / this.step;
    const i = Math.min(this.pts.length - 2, Math.floor(f));
    const p = this.pts[i].clone().lerp(this.pts[i + 1], f - i);
    return [this.origin[0] - p.z / this.kz, this.origin[1] + p.x / this.kx];
  }
}

/** rotation.y 각도: (1,0,0) 을 이 방향으로 돌리는 값 */
export function headingOf(d: THREE.Vector3) {
  return Math.atan2(-d.z, d.x);
}

interface RoadSeg { kind: 'road'; S0: number; S1: number; u0: number; M: THREE.Matrix4 }
interface ArcSeg { kind: 'arc'; S0: number; S1: number; u: number; P0: THREE.Vector3; t0: THREE.Vector3; r0: THREE.Vector3; side: 1 | -1; R: number }

/**
 * 실제 차가 달리는 길: 실제 도로(InfiniteRoad)를 따라가다가,
 * 교차로에서 좌회전 · 우회전하면 90° 돌아서 같은 도로 모양을 새 방향으로 이어 붙인다.
 * S = 지금까지 달린 거리 (뒤로 가면 줄어듦)
 */
export class Track {
  private segs: (RoadSeg | ArcSeg)[] = [{ kind: 'road', S0: 0, S1: Infinity, u0: 0, M: new THREE.Matrix4() }];
  constructor(public readonly base: InfiniteRoad) {}

  private seg(S: number) {
    for (let i = this.segs.length - 1; i >= 0; i--) if (S >= this.segs[i].S0) return this.segs[i];
    return this.segs[0];
  }

  at(S: number): RoadFrame {
    const s = this.seg(Math.max(0, S));
    const d = Math.max(0, S) - s.S0;
    if (s.kind === 'road') {
      const f = this.base.at(s.u0 + d);
      f.pos.applyMatrix4(s.M);
      f.tan.transformDirection(s.M);
      f.right.crossVectors(f.tan, UP).normalize();
      f.heading = headingOf(f.tan);
      return f;
    }
    const a = Math.min(d, s.S1 - s.S0) / s.R;
    const pos = s.P0.clone().addScaledVector(s.r0, s.side * s.R * (1 - Math.cos(a))).addScaledVector(s.t0, s.R * Math.sin(a));
    const tan = s.t0.clone().multiplyScalar(Math.cos(a)).addScaledVector(s.r0, s.side * Math.sin(a)).normalize();
    const right = new THREE.Vector3().crossVectors(tan, UP).normalize();
    return { pos, tan, right, heading: headingOf(tan) };
  }

  latLngAt(S: number): [number, number] {
    const s = this.seg(Math.max(0, S));
    return this.base.latLngAt(s.kind === 'road' ? s.u0 + Math.max(0, S) - s.S0 : s.u);
  }

  /** 실제 도로 위 위치 (S 지점) */
  private uAt(S: number) {
    const s = this.seg(S);
    return s.kind === 'road' ? s.u0 + S - s.S0 : s.u;
  }

  /** Sdec 에서 회전(side: -1 좌 · +1 우 · 0 직진), 반지름 R. Sdec 뒤의 길은 새로 */
  turn(Sdec: number, side: -1 | 0 | 1, R: number) {
    const u = this.uAt(Sdec);
    const f = this.at(Sdec);
    // Sdec 뒤 조각 버리기
    this.segs = this.segs.filter((x) => x.S0 < Sdec);
    this.segs[this.segs.length - 1].S1 = Sdec;
    let S = Sdec;
    let P = f.pos;
    let T = f.tan;
    if (side !== 0) {
      const len = (Math.PI / 2) * R;
      this.segs.push({ kind: 'arc', S0: S, S1: S + len, u, P0: f.pos.clone(), t0: f.tan.clone(), r0: f.right.clone(), side, R });
      S += len;
      const e = this.at(S - 1e-6);
      P = f.pos.clone().addScaledVector(f.right, side * R).addScaledVector(f.tan, R);
      T = e.tan;
    }
    // 같은 실제 도로를 u 부터, 위치 P · 방향 T 에 맞춰 이어 붙이기
    const b = this.base.at(u);
    const M = new THREE.Matrix4().makeTranslation(P.x, 0, P.z)
      .multiply(new THREE.Matrix4().makeRotationY(headingOf(T) - b.heading))
      .multiply(new THREE.Matrix4().makeTranslation(-b.pos.x, 0, -b.pos.z));
    this.segs.push({ kind: 'road', S0: S, S1: Infinity, u0: u, M });
  }
}
