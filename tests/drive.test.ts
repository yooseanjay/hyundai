// 3D 주행 규칙: 빨간불 · 막힌 차로 앞에서 멈추고, 차로를 바꾸면 지나가고, 교차로에서 꺾이고, 후진됨
// (그림은 그리지 않고 길 · 장면 계산만)
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { canTurn, newDrive, NOSE, steer, stepDrive, type DriveState } from '../src/three/drive';
import { buildScenery, LANE_W, type Scenery } from '../src/three/scenery';
import { REAL_ROADS } from '../src/data/realRoads';
import { lanesPerSide } from '../src/data/nearbyRoad';

beforeAll(() => {
  // 캔버스 그림 대신 아무 일도 안 하는 붓
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  (globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

const DT = 1 / 30;

/** 사람이 하듯: 막혀서 섰고 차로 이동 중이 아니면 옆 차로로 한 번 */
function avoid(sc: Scenery, d: DriveState) {
  if (Math.abs(d.lat - sc.laneOff(d.lane)) > 0.05) return;
  steer(sc, d, d.lane > 0 || d.lane === sc.lanes - 1 ? -1 : 1);
}

/** 꺾을 수 있는 곳까지 달리기 (막히면 비켜 감, 최대 3분) */
function untilTurnZone(sc: Scenery, d: DriveState, t: number) {
  for (let k = 0; k < 30 * 180 && !canTurn(d.S, sc.nextJunction(d.S - 0.5)); k++) {
    const r = stepDrive(sc, d, WANT, DT, (t += DT));
    if (r.stop === 'obstacle' && d.v < 0.05) avoid(sc, d);
  }
  expect(canTurn(d.S, sc.nextJunction(d.S - 0.5))).toBe(true);
  return t;
}
const WANT = 4.5; // 약 46km/h

describe('주행 규칙', () => {
  it('빨간불 · 노란불이면 정지선을 넘지 않는다', () => {
    const sc = buildScenery(new THREE.Scene(), 'forest');
    const d = newDrive();
    let crossedOnRed = 0;
    let stoppedForLight = 0;
    for (let t = 0; t < 240; t += DT) {
      // 장애물은 바로 옆 차로로 비켜 감
      const r = stepDrive(sc, d, WANT, DT, t);
      if (r.stop === 'obstacle' && d.v < 0.05) avoid(sc, d);
      if (r.stop === 'red') stoppedForLight++;
      const j = sc.nextJunction(d.S - 0.5);
      const prev = d.S - d.v * DT + NOSE;
      if (prev <= j.Sstop && d.S + NOSE > j.Sstop + 0.35 && sc.light(j.k, t) === 'red') crossedOnRed++;
    }
    expect(crossedOnRed).toBe(0);
    expect(stoppedForLight).toBeGreaterThan(0);
    expect(d.S).toBeGreaterThan(400); // 멈췄다 가도 계속 앞으로
    sc.dispose();
  });

  it('막힌 차로 앞에서 멈추고, 차로를 바꾸면 지나간다', () => {
    const sc = buildScenery(new THREE.Scene(), 'city');
    const d = newDrive();
    let blocked = 0;
    let passed = 0;
    let hit = 0;
    for (let t = 0; t < 200; t += DT) {
      const r = stepDrive(sc, d, WANT, DT, t);
      for (const o of sc.obstacles()) {
        const overlapL = Math.abs(o.lat - d.lat) < o.hw + 0.45;
        const overlapS = d.S + NOSE > o.S - o.hl + 0.05 && d.S - NOSE < o.S + o.hl;
        if (overlapL && overlapS) hit++;
      }
      if (r.stop === 'obstacle' && d.v < 0.05) {
        blocked++;
        const before = d.S;
        avoid(sc, d);
        // 몇 초 뒤엔 그 물건을 지나 있어야 함
        for (let k = 0; k < 150; k++) stepDrive(sc, d, WANT, DT, (t += DT));
        if (d.S > before + 3) passed++;
      }
    }
    expect(hit).toBe(0);
    expect(blocked).toBeGreaterThan(0);
    expect(passed).toBe(blocked);
    sc.dispose();
  });

  it('교차로 앞에서 우회전 · 좌회전하면 길이 90° 꺾인다', () => {
    for (const side of [1, -1] as const) {
      const sc = buildScenery(new THREE.Scene(), 'park');
      const d = newDrive();
      let t = untilTurnZone(sc, d, 0);
      const j = sc.nextJunction(d.S - 0.5);
      expect(steer(sc, d, side)).toContain(side > 0 ? '우회전' : '좌회전');
      const h0 = sc.road.at(j.Sdec - 0.01).heading;
      const h1 = sc.road.at(j.Sdec + (Math.PI / 2) * (sc.lanes * LANE_W + 0.35 + 2) + 0.01).heading;
      let dh = h1 - h0;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      expect(dh).toBeCloseTo(-side * (Math.PI / 2), 1);
      // 꺾인 뒤에도 장면이 이어지고 계속 달림
      for (let k = 0; k < 30 * 40; k++) {
        const r = stepDrive(sc, d, WANT, DT, (t += DT));
        if (r.stop === 'obstacle' && d.v < 0.05) avoid(sc, d);
      }
      expect(d.S).toBeGreaterThan(j.S + 20);
      sc.dispose();
    }
  });

  it('바닷가 길은 왼쪽이 바다라 좌회전 대신 안내만', () => {
    const sc = buildScenery(new THREE.Scene(), 'sea');
    const d = newDrive();
    untilTurnZone(sc, d, 0);
    expect(steer(sc, d, -1)).toContain('왼쪽으로 꺾을 수 없어요');
    expect(sc.nextJunction(d.S).turn).toBe(0);
    sc.dispose();
  });

  it('후진하면 뒤로 간다 (출발점 아래로는 안 감)', () => {
    const sc = buildScenery(new THREE.Scene(), 'city');
    const d = newDrive();
    let t = 0;
    for (let k = 0; k < 60; k++) stepDrive(sc, d, WANT, DT, (t += DT));
    const s0 = d.S;
    d.reverse = true;
    for (let k = 0; k < 90; k++) stepDrive(sc, d, WANT, DT, (t += DT));
    expect(d.v).toBeLessThan(0);
    expect(d.S).toBeLessThan(s0);
    expect(d.S).toBeGreaterThanOrEqual(0);
    sc.dispose();
  });

  it('차로 수: 실제 도로 값 · 없으면 도로 종류로', () => {
    expect(REAL_ROADS.city.lanes).toBe(2);
    expect(lanesPerSide({ lanes: '6' })).toBe(3);
    expect(lanesPerSide({ lanes: '2', oneway: 'yes' })).toBe(2);
    expect(lanesPerSide({ highway: 'residential' })).toBe(1);
    expect(lanesPerSide({ highway: 'primary' })).toBe(2);
  });
});
