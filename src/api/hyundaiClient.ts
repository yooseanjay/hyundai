// 현대 Developers Open API 클라이언트.
// ⚠️ 엔드포인트 경로와 응답 필드는 API 키 승인 후 developers.hyundai.com 문서와 반드시 대조해 수정하세요.
//    여기서는 앱이 기대하는 형태(types.ts)로 정규화하는 위치만 잡아 두었습니다.
import { matchModel } from '../data/hyundaiModels';
import type { CarProfile, Trip, VehicleDataSource, VehicleSnapshot, Warnings } from './types';

const BASE = import.meta.env.VITE_HYUNDAI_API_BASE ?? 'https://dev.kr-ccapi.hyundai.com';
const CLIENT_ID = import.meta.env.VITE_HYUNDAI_CLIENT_ID ?? '';
const REDIRECT_URI = import.meta.env.VITE_HYUNDAI_REDIRECT_URI ?? `${location.origin}/callback`;
const TOKEN_KEY = 'oca.hyundai.token';

// TODO(문서 확인): 실제 경로로 교체
export const ENDPOINTS = {
  authorize: '/api/v1/user/oauth2/authorize',
  carList: '/api/v1/car/profile/carlist',
  odometer: (id: string) => `/api/v1/car/status/${id}/odometer`,
  dte: (id: string) => `/api/v1/car/status/${id}/dte`,
  evBattery: (id: string) => `/api/v1/car/status/${id}/ev/battery`,
  evCharging: (id: string) => `/api/v1/car/status/${id}/ev/charging`,
  warnings: (id: string) => `/api/v1/car/status/${id}/warning`,
  parking: (id: string) => `/api/v1/car/status/${id}/parkinglocation`,
  trips: (id: string) => `/api/v1/car/status/${id}/drvhistory`,
};

/** OAuth 2.0 Authorization Code 흐름 시작. code→token 교환은 client_secret이 필요하므로 백엔드에서 처리해야 한다. */
export function startLogin() {
  const url = new URL(ENDPOINTS.authorize, BASE);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', crypto.randomUUID());
  location.href = url.toString();
}

export function setAccessToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

/** 현대 Open API 에러 코드 → 사용자에게 보여줄 설명 (공식 문서 기준) */
export const HYUNDAI_ERRORS: Record<string, string> = {
  '4002': '호출 인자 값 오류',
  '4011': '인증 헤더 오류 — 다시 로그인해 주세요',
  '4012': '세션 만료 — 다시 로그인해 주세요',
  '4014': '약관 미등록 상태 — developers@hyundai.com에 등록 요청 필요',
  '4016': '서비스 인증 값 오류',
  '4041': '커넥티드 서비스 미가입(또는 해지·무료기간 종료) 차량',
  '4043': '커넥티드 서비스 계약자 정보 없음',
  '4045': '데이터 없음 (장기 미운행 또는 단말 전송 오류)',
  '4046': '보유 차량이 없는 계정',
  '4047': '동의 이력 없음',
  '4120': '먼저 호출해야 하는 API가 있음',
  '5005': '제3자 정보 제공 미동의 상태',
  '5006': 'API 호출 권한 없음 — 프로젝트에 해당 API 권한 확인',
  '5007': '등록되지 않은 서비스',
  '5008': '서비스 ID 오류',
  '5032': '데이터 조회를 지원하지 않는 차량',
  '5041': '응답 시간 초과 — 잠시 후 다시 시도',
};

export class HyundaiApiError extends Error {
  constructor(public code: string, message: string, public path: string) {
    super(`[${code}] ${HYUNDAI_ERRORS[code] ?? message}`);
  }
}

async function get<T = any>(path: string): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('로그인이 필요합니다');
  const res = await fetch(new URL(path, BASE), { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.errCode) {
    throw new HyundaiApiError(String(body?.errCode ?? res.status), body?.errMsg ?? `HTTP ${res.status}`, path);
  }
  return body as T;
}

interface CarListItem {
  carId: string;
  carNickname: string;
  carType: 'GN' | 'EV' | 'HEV' | 'PHEV' | 'FCEV';
  carName: string;
  carSellname: string;
}

const FUEL_BY_CAR_TYPE: Record<string, CarProfile['fuelType']> = {
  GN: 'gasoline',
  EV: 'ev',
  HEV: 'hybrid',
  PHEV: 'hybrid',
  FCEV: 'hydrogen',
};

const bool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'Y';

export class HyundaiApiSource implements VehicleDataSource {
  readonly kind = 'hyundai' as const;

  async getCars(): Promise<CarProfile[]> {
    // 문서 확인 완료: GET /api/v1/car/profile/carlist → { cars: [{ carId, carNickname, carType, carName, carSellname }], msgId }
    // carType: GN(내연기관) · EV(전기) · HEV(하이브리드) · PHEV(플러그인하이브리드) · FCEV(수소전기)
    const data = await get<{ cars: CarListItem[] }>(ENDPOINTS.carList);
    return (data.cars ?? []).map((c) => {
      const m = matchModel(c.carSellname, c.carName, c.carType);
      return {
        carId: c.carId,
        nickname: c.carNickname || m?.name || c.carSellname || '우리 차',
        model: m?.name ?? (c.carSellname || c.carName || ''),
        fuelType: FUEL_BY_CAR_TYPE[c.carType] ?? m?.fuels[0] ?? 'gasoline',
        modelId: m?.id,
        bodyColor: m?.color ?? 'yellow',
      };
    });
  }

  async getSnapshot(carId: string): Promise<VehicleSnapshot> {
    const [odo, dte, warn, park, battery] = await Promise.allSettled([
      get(ENDPOINTS.odometer(carId)),
      get(ENDPOINTS.dte(carId)),
      get(ENDPOINTS.warnings(carId)),
      get(ENDPOINTS.parking(carId)),
      get(ENDPOINTS.evBattery(carId)),
    ]);
    const v = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? (r.value as any) : {});
    const w = v(warn);
    const warnings: Warnings = {
      tirePressure: bool(w.tirePressureWarning ?? w.tirePressure),
      engineOil: bool(w.engineOilWarning ?? w.engineOil),
      brakeOil: bool(w.brakeOilWarning ?? w.brakeOil),
      washerFluid: bool(w.washerFluidWarning ?? w.washerFluid),
      lamp: bool(w.lampWireWarning ?? w.lamp),
      smartKeyBattery: bool(w.smartKeyBatteryWarning ?? w.smartKeyBattery),
    };
    const p = v(park);
    return {
      odometerKm: Number(v(odo).value ?? v(odo).odometer ?? 0),
      dteKm: Number(v(dte).value ?? v(dte).dte ?? 0),
      fuelLevelPct: Number(v(battery).soc ?? v(battery).batteryLevel ?? 0),
      charging: bool(v(battery).charging),
      pluggedIn: bool(v(battery).pluggedIn),
      warnings,
      parking: p.lat ? { lat: p.lat, lng: p.lon ?? p.lng, label: '마지막 주차 위치' } : null,
      updatedAt: new Date().toISOString(),
    };
  }

  async getRecentTrips(carId: string): Promise<Trip[]> {
    const data = await get(ENDPOINTS.trips(carId));
    const list: any[] = data.drivingInfo ?? data.trips ?? [];
    return list.map((t) => ({
      startedAt: t.startTime ?? t.date,
      endedAt: t.endTime ?? t.date,
      distanceKm: Number(t.distance ?? 0),
      durationMin: Number(t.drivingTime ?? 0),
      avgSpeedKmh: Number(t.avgSpeed ?? 0),
      maxSpeedKmh: Number(t.maxSpeed ?? 0),
      hardBrakes: Number(t.hardBrake ?? 0),
    }));
  }
}
