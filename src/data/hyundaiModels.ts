// 현대자동차 차종 카탈로그: 실제 3D 모델이 있는 4종 (아이오닉 5 · 아반떼 · 쏘나타 · 그랜저)
// - 실제 API 모드: carlist 응답의 carSellname / carName(차종코드)으로 매칭해 연비·배터리 용량·기본 색을 정한다.
// - 데모 모드: 사용자가 이 목록에서 차를 골라 시뮬레이션한다.
// ⚠️ 차종코드·배터리 용량은 공개 자료 기준 참고값입니다. 실제 값은 API 응답(carName)으로 확인하세요.
import type { FuelType } from '../api/types';

/** 현대차 도료 코드 (예: 'SAW' 아틀라스 화이트) */
export type BodyColor = string;

export interface Paint { id: BodyColor; name: string; hex: string; matte?: boolean }

// 실제 판매 외장 색 (현대차 공식 가격표 기준 이름·도료 코드). hex는 화면용 근사값
const P = (id: string, name: string, hex: string, matte?: boolean): Paint => ({ id, name, hex, matte });
export const PAINTS: Record<BodyColor, Paint> = Object.fromEntries([
  P('SAW', '아틀라스 화이트', '#eef0ee'),
  P('WAM', '아틀라스 화이트 매트', '#e2e3df', true),
  P('W6H', '세레니티 화이트 펄', '#efeee8'),
  P('A2B', '어비스 블랙 펄', '#1b1d21'),
  P('C5G', '사이버 그레이 메탈릭', '#8b9095'),
  P('PE2', '에코트로닉 그레이 펄', '#7b7f79'),
  P('T5R', '슈팅스타 그레이 매트', '#8e9297', true),
  P('T2G', '녹턴 그레이 메탈릭', '#4b4f55'),
  P('T9M', '녹턴 그레이 매트', '#575b60', true),
  P('T4A', '에어로 실버 메탈릭', '#b7bbbf'),
  P('T4M', '에어로 실버 매트', '#aaaeb2', true),
  P('A5G', '아마존 그레이 메탈릭', '#5f6a63'),
  P('RRR', '미라지 그린', '#7f8b76'),
  P('M9U', '디지털 틸그린 펄', '#3d6e6c'),
  P('U3P', '루시드 블루 펄', '#6f89a2'),
  P('NY9', '트랜스미션 블루 펄', '#2c4b7b'),
  P('XB9', '바이오필릭 블루 펄', '#22384f'),
  P('R2P', '얼티메이트 레드 메탈릭', '#a3171f'),
  P('W3T', '그래비티 골드 매트', '#9b8e69', true),
].map((c) => [c.id, c]));

/** 모든 색 (차종 모를 때) */
export const BODY_COLORS: Paint[] = Object.values(PAINTS);

export type Segment = '경차' | '세단' | 'SUV' | 'MPV' | '상용' | '아이오닉' | '수소' | 'N';

export interface HyundaiModel {
  id: string;
  name: string; // 판매명 (carSellname과 매칭)
  codes: string[]; // 차종코드 (carName과 매칭)
  segment: Segment;
  fuels: FuelType[];
  /** 평균 효율: 내연기관 km/L, 전기 km/kWh, 수소 km/kg */
  efficiency: Partial<Record<FuelType, number>>;
  /** 탱크(L) · 배터리(kWh) · 수소(kg) 용량 */
  capacity: Partial<Record<FuelType, number>>;
  color: BodyColor; // 기본 색 (도료 코드)
  /** 이 차에 실제로 있는 외장 색 (도료 코드) */
  colors: BodyColor[];
  /** 3D 차체 모양 (src/three/shapes.ts) */
  shape: string;
  /** 2024년 이후 새로 나온 모델 */
  isNew?: boolean;
  aliases?: string[];
}

export const HYUNDAI_MODELS: HyundaiModel[] = [
  // 실제 3D 모델(public/models)이 있는 차만
  { id: 'ioniq5', name: '아이오닉 5', codes: ['NE'], segment: '아이오닉', fuels: ['ev'], efficiency: { ev: 5.2 }, capacity: { ev: 84 }, color: 'SAW', colors: ['SAW', 'A2B', 'C5G', 'PE2', 'U3P', 'M9U', 'T5R', 'W3T', 'WAM'], aliases: ['ioniq 5', 'ioniq5'], shape: 'ioniq5' },
  { id: 'avante', name: '아반떼', codes: ['CN7'], segment: '세단', fuels: ['gasoline', 'hybrid'], efficiency: { gasoline: 14.8, hybrid: 21.1 }, capacity: { gasoline: 47, hybrid: 42 }, color: 'SAW', colors: ['SAW', 'A2B', 'PE2', 'A5G', 'RRR'], aliases: ['avante', 'elantra'], shape: 'avante' },
  { id: 'sonata', name: '쏘나타 디 엣지', codes: ['DN8', 'LF'], segment: '세단', fuels: ['gasoline', 'hybrid'], efficiency: { gasoline: 12.6, hybrid: 19.4 }, capacity: { gasoline: 60, hybrid: 50 }, color: 'W6H', colors: ['W6H', 'A2B', 'T2G', 'T9M', 'T4M', 'NY9', 'XB9', 'R2P'], aliases: ['sonata', '쏘나타'], shape: 'sonata' },
  { id: 'grandeur', name: '그랜저', codes: ['GN7', 'IG'], segment: '세단', fuels: ['gasoline', 'hybrid'], efficiency: { gasoline: 11.1, hybrid: 18.0 }, capacity: { gasoline: 64, hybrid: 60 }, color: 'A2B', colors: ['A2B', 'W6H', 'T4A', 'T2G', 'T9M', 'NY9', 'XB9'], aliases: ['grandeur', 'azera'], shape: 'grandeur' },
];

export const SEGMENTS: Segment[] = ['세단', '아이오닉'];

export const FUEL_LABEL: Record<FuelType, string> = {
  gasoline: '가솔린',
  diesel: '디젤',
  hybrid: '하이브리드',
  ev: '전기',
  hydrogen: '수소',
};

/** 에너지 용어 (캐릭터 대사·버튼) */
export const ENERGY_TERMS: Record<FuelType, { refill: string; icon: string; unit: string }> = {
  gasoline: { refill: '주유하기', icon: '⛽', unit: 'L' },
  diesel: { refill: '주유하기', icon: '⛽', unit: 'L' },
  hybrid: { refill: '주유하기', icon: '⛽', unit: 'L' },
  ev: { refill: '충전하기', icon: '⚡', unit: 'kWh' },
  hydrogen: { refill: '수소 충전', icon: '💧', unit: 'kg' },
};

export const findModelById = (id: string) => HYUNDAI_MODELS.find((m) => m.id === id);

/** 이 차에 실제로 있는 색 목록 (차종 모르면 전체) */
export const colorsOf = (modelId?: string): Paint[] =>
  findModelById(modelId ?? '')?.colors.map((c) => PAINTS[c]) ?? BODY_COLORS;

/** 고른 색이 이 차에 없는 색이면 차 기본 색으로 */
export function validColor(c: BodyColor | undefined, modelId?: string): BodyColor {
  const m = findModelById(modelId ?? '');
  if (m) return c && m.colors.includes(c) ? c : m.color;
  return c && PAINTS[c] ? c : 'SAW';
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-()]/g, '');

/** API carlist 응답(carSellname, carName)으로 카탈로그 모델 찾기 */
export function matchModel(carSellname?: string, carName?: string, carType?: string): HyundaiModel | undefined {
  const sell = norm(carSellname ?? '');
  const code = norm(carName ?? '');
  const isEv = carType === 'EV';
  const candidates = HYUNDAI_MODELS.filter((m) => {
    const names = [m.name, ...(m.aliases ?? [])].map(norm);
    const nameHit = sell && names.some((n) => sell.includes(n) || n.includes(sell));
    const codeHit = code && m.codes.map(norm).some((c) => c === code || code.startsWith(c));
    return nameHit || codeHit;
  });
  if (!candidates.length) return undefined;
  // 전기차 여부가 맞는 모델 우선, 그다음 이름이 더 긴(구체적인) 모델 우선
  return candidates.sort((a, b) => {
    const ev = Number(b.fuels.includes('ev') === isEv) - Number(a.fuels.includes('ev') === isEv);
    return ev || b.name.length - a.name.length;
  })[0];
}
