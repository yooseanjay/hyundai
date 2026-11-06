// 차종별 3D 차체 치수 (실제 비율을 단순화한 값, 단위는 미터 느낌)
// 앞(+x) · 위(+y). 옆모습 몇 개의 점으로 차체·유리·지붕을 만든다.
export interface CarShape {
  /** 반 길이 · 반 폭 · 바퀴 반지름 · 반 축간거리 */
  L: number; W: number; wr: number; wb: number;
  /** 차체 아래 높이 · 보닛 앞 끝 높이 */
  bottom: number; noseTop: number;
  /** 앞유리 아래 끝 (x, y) */
  cowl: [number, number];
  /** 뒤 벨트라인 높이 · 뒤 끝 윗면 높이 */
  beltRear: number; tailTop: number;
  /** 지붕 높이 · 지붕 앞/뒤 끝 x · 뒷유리 아래 끝 x */
  roofY: number; roofFX: number; roofBX: number; deckX: number;
  /** 뒤 짐칸 (트럭·밴) */
  cargo?: { from: number; top: number; open?: boolean };
  lamp: 'pixel' | 'bar' | 'round';
  /** N: 스포일러 + 빨간 포인트 */
  sport?: boolean;
}

const ioniq5: CarShape = { L: 2.3, W: 0.93, wr: 0.38, wb: 1.45, bottom: 0.32, noseTop: 0.94, cowl: [1.05, 1.04], beltRear: 1.06, tailTop: 1.0, roofY: 1.5, roofFX: 0.12, roofBX: -1.62, deckX: -2.12, lamp: 'pixel' };
const avante: CarShape = { L: 2.33, W: 0.9, wr: 0.34, wb: 1.36, bottom: 0.3, noseTop: 0.76, cowl: [0.92, 0.92], beltRear: 0.98, tailTop: 0.98, roofY: 1.4, roofFX: -0.05, roofBX: -0.85, deckX: -1.68, lamp: 'bar' };
const ioniq6: CarShape = { L: 2.43, W: 0.94, wr: 0.36, wb: 1.5, bottom: 0.3, noseTop: 0.7, cowl: [1.02, 0.9], beltRear: 0.98, tailTop: 0.94, roofY: 1.47, roofFX: 0.05, roofBX: -0.5, deckX: -2.08, lamp: 'pixel' };

export const SHAPES: Record<string, CarShape> = {
  ioniq5,
  'ioniq5-n': { ...ioniq5, wr: 0.39, bottom: 0.28, sport: true },
  ioniq6,
  'ioniq6-n': { ...ioniq6, wr: 0.37, bottom: 0.27, sport: true },
  ioniq9: { L: 2.53, W: 0.99, wr: 0.4, wb: 1.6, bottom: 0.34, noseTop: 0.98, cowl: [1.15, 1.08], beltRear: 1.13, tailTop: 1.06, roofY: 1.72, roofFX: 0.1, roofBX: -2.02, deckX: -2.42, lamp: 'pixel' },
  casper: { L: 1.8, W: 0.8, wr: 0.32, wb: 1.2, bottom: 0.3, noseTop: 0.9, cowl: [0.95, 1.0], beltRear: 1.04, tailTop: 0.98, roofY: 1.6, roofFX: 0.25, roofBX: -1.5, deckX: -1.72, lamp: 'round' },
  avante,
  'avante-n': { ...avante, wr: 0.35, bottom: 0.26, sport: true },
  sonata: { L: 2.45, W: 0.93, wr: 0.35, wb: 1.42, bottom: 0.3, noseTop: 0.74, cowl: [0.95, 0.92], beltRear: 0.98, tailTop: 0.97, roofY: 1.44, roofFX: -0.1, roofBX: -0.95, deckX: -1.9, lamp: 'bar' },
  grandeur: { L: 2.5, W: 0.94, wr: 0.36, wb: 1.48, bottom: 0.32, noseTop: 0.82, cowl: [0.88, 0.96], beltRear: 1.02, tailTop: 1.01, roofY: 1.47, roofFX: -0.15, roofBX: -1.05, deckX: -1.82, lamp: 'bar' },
  venue: { L: 2.02, W: 0.88, wr: 0.34, wb: 1.26, bottom: 0.34, noseTop: 0.92, cowl: [0.9, 1.02], beltRear: 1.06, tailTop: 1.0, roofY: 1.6, roofFX: 0.05, roofBX: -1.62, deckX: -1.92, lamp: 'bar' },
  kona: { L: 2.17, W: 0.91, wr: 0.36, wb: 1.33, bottom: 0.34, noseTop: 0.9, cowl: [0.95, 1.0], beltRear: 1.05, tailTop: 0.98, roofY: 1.56, roofFX: 0.0, roofBX: -1.45, deckX: -2.02, lamp: 'bar' },
  tucson: { L: 2.3, W: 0.93, wr: 0.38, wb: 1.38, bottom: 0.36, noseTop: 0.98, cowl: [1.0, 1.06], beltRear: 1.1, tailTop: 1.04, roofY: 1.66, roofFX: 0.02, roofBX: -1.6, deckX: -2.14, lamp: 'bar' },
  santafe: { L: 2.4, W: 0.95, wr: 0.39, wb: 1.42, bottom: 0.36, noseTop: 1.06, cowl: [1.1, 1.12], beltRear: 1.16, tailTop: 1.12, roofY: 1.74, roofFX: 0.2, roofBX: -2.16, deckX: -2.34, lamp: 'bar' },
  palisade: { L: 2.55, W: 0.99, wr: 0.4, wb: 1.5, bottom: 0.38, noseTop: 1.1, cowl: [1.12, 1.15], beltRear: 1.19, tailTop: 1.14, roofY: 1.8, roofFX: 0.15, roofBX: -2.22, deckX: -2.46, lamp: 'bar' },
  nexo: { L: 2.38, W: 0.95, wr: 0.38, wb: 1.4, bottom: 0.36, noseTop: 1.0, cowl: [1.05, 1.08], beltRear: 1.12, tailTop: 1.06, roofY: 1.68, roofFX: 0.1, roofBX: -1.85, deckX: -2.26, lamp: 'pixel' },
  staria: { L: 2.6, W: 0.99, wr: 0.38, wb: 1.6, bottom: 0.34, noseTop: 0.86, cowl: [2.05, 1.02], beltRear: 1.16, tailTop: 1.1, roofY: 1.95, roofFX: 0.95, roofBX: -2.45, deckX: -2.55, lamp: 'bar' },
  st1: { L: 2.8, W: 1.0, wr: 0.38, wb: 1.75, bottom: 0.36, noseTop: 0.98, cowl: [2.4, 1.16], beltRear: 1.18, tailTop: 1.1, roofY: 1.95, roofFX: 1.85, roofBX: 0.95, deckX: 0.9, cargo: { from: 0.86, top: 2.15 }, lamp: 'bar' },
  porter: { L: 2.55, W: 0.87, wr: 0.3, wb: 1.3, bottom: 0.42, noseTop: 1.0, cowl: [2.45, 1.14], beltRear: 1.14, tailTop: 0.92, roofY: 1.95, roofFX: 2.15, roofBX: 1.05, deckX: 1.0, cargo: { from: 0.92, top: 1.32, open: true }, lamp: 'bar' },
};

export const shapeOf = (id?: string) => SHAPES[id ?? ''] ?? ioniq5;
