// 현대 Developers Open API 클라이언트.
// ⚠️ 엔드포인트 경로와 응답 필드는 API 키 승인 후 developers.hyundai.com 문서와 반드시 대조해 수정하세요.
//    여기서는 앱이 기대하는 형태(types.ts)로 정규화하는 위치만 잡아 두었습니다.
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

async function get<T = any>(path: string): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('로그인이 필요합니다');
  const res = await fetch(new URL(path, BASE), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Hyundai API ${res.status} ${path}`);
  return res.json();
}

const bool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'Y';

export class HyundaiApiSource implements VehicleDataSource {
  readonly kind = 'hyundai' as const;

  async getCars(): Promise<CarProfile[]> {
    const data = await get(ENDPOINTS.carList);
    const cars: any[] = data.cars ?? data.carList ?? [];
    return cars.map((c) => ({
      carId: c.carId,
      nickname: c.carNickname ?? c.carName ?? '우리 차',
      model: c.carName ?? c.carType ?? '',
      fuelType: /EV|ELECTRIC/i.test(c.carType ?? c.fuelType ?? '') ? 'ev' : 'gasoline',
      color: '#7fd1c7',
    }));
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
