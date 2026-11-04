// 현대 Developers Open API 응답을 앱 내부에서 쓰기 쉬운 형태로 정규화한 타입

export type FuelType = 'gasoline' | 'diesel' | 'hybrid' | 'ev';

export interface CarProfile {
  carId: string;
  nickname: string;
  model: string;
  fuelType: FuelType;
  color: string; // 캐릭터 기본 색상
}

export interface Warnings {
  tirePressure: boolean;
  engineOil: boolean;
  brakeOil: boolean;
  washerFluid: boolean;
  lamp: boolean;
  smartKeyBattery: boolean;
}

export type WarningKey = keyof Warnings;

export interface Trip {
  startedAt: string; // ISO
  endedAt: string;
  distanceKm: number;
  durationMin: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  hardBrakes: number;
}

export interface ParkingLocation {
  lat: number;
  lng: number;
  label: string;
}

export interface VehicleSnapshot {
  odometerKm: number;
  dteKm: number; // 주행 가능 거리
  fuelLevelPct: number; // EV면 배터리 SoC
  charging: boolean;
  pluggedIn: boolean;
  warnings: Warnings;
  parking: ParkingLocation | null;
  updatedAt: string;
}

/** 앱이 의존하는 데이터 소스 인터페이스. mock(시뮬레이터)과 실제 API가 같은 모양을 구현한다. */
export interface VehicleDataSource {
  readonly kind: 'mock' | 'hyundai';
  getCars(): Promise<CarProfile[]>;
  getSnapshot(carId: string): Promise<VehicleSnapshot>;
  getRecentTrips(carId: string): Promise<Trip[]>;
}

export const WARNING_LABELS: Record<WarningKey, string> = {
  tirePressure: '타이어 공기압',
  engineOil: '엔진오일',
  brakeOil: '브레이크오일',
  washerFluid: '워셔액',
  lamp: '램프',
  smartKeyBattery: '스마트키 배터리',
};
