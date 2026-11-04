// 현대자동차 국내 판매 라인업 카탈로그 (2026년 기준, 단종 모델 일부 포함)
// - 실제 API 모드: carlist 응답의 carSellname / carName(차종코드)으로 매칭해 연비·배터리 용량·기본 색을 정한다.
// - 데모 모드: 사용자가 이 목록에서 차를 골라 시뮬레이션한다.
// ⚠️ 차종코드·배터리 용량은 공개 자료 기준 참고값입니다. 실제 값은 API 응답(carName)으로 확인하세요.
import type { FuelType } from '../api/types';

export type BodyColor = 'yellow' | 'white' | 'silver' | 'gray' | 'black' | 'blue' | 'red' | 'green' | 'mint' | 'beige';

export const BODY_COLORS: { id: BodyColor; name: string; hex: string }[] = [
  { id: 'yellow', name: '옐로우', hex: '#f6cf4f' },
  { id: 'white', name: '화이트', hex: '#f4f4f2' },
  { id: 'silver', name: '실버', hex: '#c9ccd1' },
  { id: 'gray', name: '그레이', hex: '#8a8d93' },
  { id: 'black', name: '블랙', hex: '#3a3b40' },
  { id: 'blue', name: '블루', hex: '#6f9ae6' },
  { id: 'red', name: '레드', hex: '#e8746f' },
  { id: 'green', name: '그린', hex: '#5fa98a' },
  { id: 'mint', name: '민트', hex: '#9ee5d8' },
  { id: 'beige', name: '베이지', hex: '#efe3cc' },
];

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
  color: BodyColor; // 캐릭터 기본 색
  aliases?: string[];
}

export const HYUNDAI_MODELS: HyundaiModel[] = [
  // 경차
  { id: 'casper', name: '캐스퍼', codes: ['AX1'], segment: '경차', fuels: ['gasoline'], efficiency: { gasoline: 13.5 }, capacity: { gasoline: 35 }, color: 'yellow', aliases: ['casper'] },
  { id: 'casper-ev', name: '캐스퍼 일렉트릭', codes: ['AX1 EV', 'AX EV'], segment: '경차', fuels: ['ev'], efficiency: { ev: 5.6 }, capacity: { ev: 49 }, color: 'mint', aliases: ['casper electric'] },

  // 세단
  { id: 'avante', name: '아반떼', codes: ['CN7'], segment: '세단', fuels: ['gasoline', 'hybrid'], efficiency: { gasoline: 14.8, hybrid: 21.1 }, capacity: { gasoline: 47, hybrid: 42 }, color: 'blue', aliases: ['avante', 'elantra'] },
  { id: 'sonata', name: '쏘나타 디 엣지', codes: ['DN8', 'LF'], segment: '세단', fuels: ['gasoline', 'hybrid'], efficiency: { gasoline: 12.6, hybrid: 19.4 }, capacity: { gasoline: 60, hybrid: 50 }, color: 'white', aliases: ['sonata', '쏘나타'] },
  { id: 'grandeur', name: '그랜저', codes: ['GN7', 'IG'], segment: '세단', fuels: ['gasoline', 'hybrid'], efficiency: { gasoline: 11.1, hybrid: 18.0 }, capacity: { gasoline: 64, hybrid: 60 }, color: 'black', aliases: ['grandeur', 'azera'] },
  { id: 'ioniq6', name: '아이오닉 6', codes: ['CE'], segment: '아이오닉', fuels: ['ev'], efficiency: { ev: 6.0 }, capacity: { ev: 84 }, color: 'silver', aliases: ['ioniq 6', 'ioniq6'] },

  // SUV
  { id: 'venue', name: '베뉴', codes: ['QX'], segment: 'SUV', fuels: ['gasoline'], efficiency: { gasoline: 13.7 }, capacity: { gasoline: 45 }, color: 'green', aliases: ['venue'] },
  { id: 'kona', name: '코나', codes: ['SX2', 'OS'], segment: 'SUV', fuels: ['gasoline', 'hybrid'], efficiency: { gasoline: 12.9, hybrid: 19.8 }, capacity: { gasoline: 47, hybrid: 38 }, color: 'red', aliases: ['kona'] },
  { id: 'kona-ev', name: '코나 일렉트릭', codes: ['SX2 EV', 'OS EV'], segment: 'SUV', fuels: ['ev'], efficiency: { ev: 5.5 }, capacity: { ev: 64.8 }, color: 'blue', aliases: ['kona electric'] },
  { id: 'tucson', name: '투싼', codes: ['NX4'], segment: 'SUV', fuels: ['gasoline', 'diesel', 'hybrid'], efficiency: { gasoline: 11.6, diesel: 14.3, hybrid: 16.2 }, capacity: { gasoline: 54, diesel: 54, hybrid: 52 }, color: 'gray', aliases: ['tucson'] },
  { id: 'santafe', name: '싼타페', codes: ['MX5', 'TM'], segment: 'SUV', fuels: ['gasoline', 'hybrid'], efficiency: { gasoline: 9.8, hybrid: 15.5 }, capacity: { gasoline: 67, hybrid: 67 }, color: 'beige', aliases: ['santa fe', 'santafe'] },
  { id: 'palisade', name: '팰리세이드', codes: ['LX3', 'LX2'], segment: 'SUV', fuels: ['gasoline', 'hybrid'], efficiency: { gasoline: 9.1, hybrid: 14.1 }, capacity: { gasoline: 71, hybrid: 72 }, color: 'black', aliases: ['palisade'] },

  // 아이오닉 (전용 전기차)
  { id: 'ioniq5', name: '아이오닉 5', codes: ['NE'], segment: '아이오닉', fuels: ['ev'], efficiency: { ev: 5.2 }, capacity: { ev: 84 }, color: 'yellow', aliases: ['ioniq 5', 'ioniq5'] },
  { id: 'ioniq9', name: '아이오닉 9', codes: ['ME'], segment: '아이오닉', fuels: ['ev'], efficiency: { ev: 4.4 }, capacity: { ev: 110.3 }, color: 'white', aliases: ['ioniq 9', 'ioniq9'] },

  // N
  { id: 'avante-n', name: '아반떼 N', codes: ['CN7 N'], segment: 'N', fuels: ['gasoline'], efficiency: { gasoline: 10.4 }, capacity: { gasoline: 47 }, color: 'blue', aliases: ['avante n', 'elantra n'] },
  { id: 'ioniq5-n', name: '아이오닉 5 N', codes: ['NE N'], segment: 'N', fuels: ['ev'], efficiency: { ev: 3.9 }, capacity: { ev: 84 }, color: 'blue', aliases: ['ioniq 5 n'] },

  // 수소
  { id: 'nexo', name: '디 올 뉴 넥쏘', codes: ['NH2', 'FE'], segment: '수소', fuels: ['hydrogen'], efficiency: { hydrogen: 105 }, capacity: { hydrogen: 6.69 }, color: 'mint', aliases: ['nexo', '넥쏘'] },

  // MPV · 상용
  { id: 'staria', name: '스타리아', codes: ['US4'], segment: 'MPV', fuels: ['diesel', 'hybrid'], efficiency: { diesel: 10.8, hybrid: 13.0 }, capacity: { diesel: 75, hybrid: 72 }, color: 'white', aliases: ['staria'] },
  { id: 'st1', name: 'ST1', codes: ['TV'], segment: '상용', fuels: ['ev'], efficiency: { ev: 4.0 }, capacity: { ev: 76.1 }, color: 'silver', aliases: ['st1'] },
  { id: 'porter', name: '포터 II', codes: ['HR'], segment: '상용', fuels: ['diesel', 'ev'], efficiency: { diesel: 9.4, ev: 3.1 }, capacity: { diesel: 65, ev: 58.8 }, color: 'blue', aliases: ['porter', '포터'] },
];

export const SEGMENTS: Segment[] = ['경차', '세단', 'SUV', '아이오닉', 'N', '수소', 'MPV', '상용'];

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
