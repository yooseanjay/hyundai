// 3D 주행 규칙 (화면 없이도 돌아가도록 따로): 신호 · 장애물 앞에서 멈추기, 차로 바꾸기, 좌회전 · 우회전, 후진
import type { Junction, Light, Scenery } from './scenery';

/** 멈춤 · 서행 제동 (단위/초²) */
export const DECEL = 5;
/** 후진 속도 (단위/초 ≈ 15km/h) */
export const BACK = -1.5;
/** 차 앞 끝 (차 가운데에서) */
export const NOSE = 1.25;
/** 출발 위치: 차 뒤에도 길이 이어져 보이도록 조금 들어가서 시작 */
export const START = 50;

export type Stop = 'red' | 'yellow' | 'obstacle' | null;

export interface DriveState {
  /** 지금까지 달린 거리 (단위) */
  S: number;
  /** 차로 (0 = 중앙선 옆, 음수 = 반대편) */
  lane: number;
  /** 도로 가운데에서 옆 거리 (차로 바꿀 때 부드럽게 따라감) */
  lat: number;
  /** 화면 속 속도 (단위/초, 후진은 음수) */
  v: number;
  reverse: boolean;
  init: boolean;
}

export const newDrive = (): DriveState => ({ S: START, lane: 0, lat: 0, v: 0, reverse: false, init: false });

/**
 * 한 프레임: want(실제 속도를 화면 단위로) 를 따르되 빨간불 · 노란불 정지선, 막힌 차로 앞에선 멈춤.
 * 장면 조각도 여기서 붙인다.
 */
export function stepDrive(sc: Scenery, d: DriveState, want: number, dt: number, t: number): { stop: Stop; j: Junction; lt: Light; dl: number } {
  if (!d.init) { d.init = true; d.lane = sc.lanes - 1; d.lat = sc.laneOff(d.lane); d.v = 0; }
  let allow = Infinity;
  let stop: Stop = null;
  const j = sc.nextJunction(d.S - 0.5);
  const lt = sc.light(j.k, t);
  const nose = d.S + NOSE;
  if (lt !== 'green' && nose < j.Sstop + 0.3) {
    const gap = j.Sstop - nose;
    // 노란불인데 이미 너무 가까우면 그냥 지나감
    if (!(lt === 'yellow' && gap < 2.5) && gap < 40) {
      const a = Math.sqrt(2 * DECEL * Math.max(0, gap));
      if (a < allow) { allow = a; stop = lt; }
    }
  }
  for (const o of sc.obstacles()) {
    if (Math.abs(o.lat - d.lat) > o.hw + 0.55) continue;
    const gap = o.S - o.hl - nose - 0.4;
    if (gap < -1.5 || gap > 40) continue;
    const a = Math.sqrt(2 * DECEL * Math.max(0, gap));
    if (a < allow) { allow = a; stop = 'obstacle'; }
  }
  const target = d.reverse ? (want > 0 ? BACK : 0) : Math.min(want, allow);
  if (target < d.v) d.v = Math.max(target, d.v - 14 * dt);
  else d.v = Math.min(target, d.v + 3.5 * dt);
  if (d.reverse || allow >= want) stop = null;
  d.S = Math.max(0, d.S + d.v * dt);
  sc.update(d.S, dt, t);
  const dl = (sc.laneOff(d.lane) - d.lat) * Math.min(1, dt * 2.6);
  d.lat += dl;
  return { stop, j, lt, dl };
}

/** ◀ / ▶: 교차로 앞이면 좌회전 · 우회전, 아니면 차로 바꾸기. 화면에 보여 줄 말을 돌려줌 */
export function steer(sc: Scenery, d: DriveState, side: -1 | 1): string {
  const j = sc.nextJunction(d.S - 0.5);
  if (!d.reverse && canTurn(d.S, j)) {
    if (sc.requestTurn(d.S, side)) return side < 0 ? '다음 교차로에서 좌회전' : '다음 교차로에서 우회전';
    return '여기선 왼쪽으로 꺾을 수 없어요';
  }
  // 반대편 차로까지는 갈 수 있음 (한 차로 길에서 막힌 곳 피하기)
  const next = Math.max(-sc.lanes, Math.min(sc.lanes - 1, d.lane + side));
  const msg = next === d.lane ? (side > 0 ? '가장 오른쪽 차로예요' : '더 갈 차로가 없어요') : next < 0 ? '중앙선 넘음! 조심해요' : `${next + 1}차로로 이동`;
  d.lane = next;
  return msg;
}

/** 교차로가 가깝고 아직 꺾을 수 있는 거리 */
export const canTurn = (S: number, j: Junction) => j.S - S < TURN_ZONE && S + 2 < j.Sdec - 1.5;
/** 교차로 이만큼 앞부터 ◀ ▶ 가 좌회전 · 우회전 (약 70m) */
export const TURN_ZONE = 35;
