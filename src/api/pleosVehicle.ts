// Pleos Connect(차 안 화면)에서 실행될 때의 데이터 소스.
// 안드로이드 앱(pleos/)이 현대 Vehicle SDK로 읽은 값을 window.PleosVehicle 로 넘겨 준다.
// - 읽기 전용: 차를 제어하는 기능은 넘기지 않음
// - 운행 기록: Vehicle SDK에 기록 목록이 없어서, 앱에서 끝낸 주행을 기기에 암호화 저장
import { secureStorage } from '../security/secureStorage';
import type { CarProfile, Trip, VehicleDataSource, VehicleSnapshot, Warnings } from './types';

/** 안드로이드 쪽 VehicleBridge.kt 가 돌려주는 JSON 모양 (모르는 값은 null) */
export interface PleosRaw {
  connected: boolean;
  odometerKm: number | null;
  rangeKm: number | null;
  evSocPct: number | null;
  fuelPct: number | null;
  charging: boolean | null;
  engineOilLow: boolean | null;
  brakeFluidLow: boolean | null;
  washerFluidLow: boolean | null;
}

interface PleosBridge {
  snapshot(): string;
}

declare global {
  interface Window {
    PleosVehicle?: PleosBridge;
  }
}

/** 차 안 앱 안에서 실행 중인지 */
export const inPleos = () => typeof window !== 'undefined' && !!window.PleosVehicle;

const TRIPS_KEY = 'oca.pleos.trips.v1';
const NAME_KEY = 'oca.pleos.name.v1';

/** SDK 값 → 앱 공통 모양. 값이 없으면 안전한 기본값 */
export function toSnapshot(r: PleosRaw, now = new Date()): VehicleSnapshot {
  const warnings: Warnings = {
    tirePressure: false, // 공개 SDK에 공기압 읽기가 없음
    engineOil: !!r.engineOilLow,
    brakeOil: !!r.brakeFluidLow,
    washerFluid: !!r.washerFluidLow,
    lamp: false,
    smartKeyBattery: false,
  };
  const pct = r.evSocPct ?? r.fuelPct ?? 0;
  return {
    odometerKm: Math.round(r.odometerKm ?? 0),
    dteKm: Math.round(r.rangeKm ?? 0),
    fuelLevelPct: Math.max(0, Math.min(100, Math.round(pct))),
    charging: !!r.charging,
    pluggedIn: !!r.charging,
    warnings,
    parking: null, // 차 안에서는 지금 있는 곳이 곧 차 위치
    updatedAt: now.toISOString(),
  };
}

export const isEv = (r: PleosRaw) => r.evSocPct != null && r.fuelPct == null;

export class PleosVehicleSource implements VehicleDataSource {
  readonly kind = 'pleos' as const;

  private read(): PleosRaw {
    const raw = JSON.parse(window.PleosVehicle!.snapshot()) as PleosRaw;
    if (!raw.connected) throw new Error('차량 정보를 불러오는 중이에요. 잠시 후 다시 시도해 주세요.');
    return raw;
  }

  async getCars(): Promise<CarProfile[]> {
    const ev = isEv(this.read());
    return [{
      carId: 'pleos',
      nickname: secureStorage.getItem(NAME_KEY) || '내 차',
      model: ev ? 'IONIQ 5' : 'AVANTE',
      fuelType: ev ? 'ev' : 'gasoline',
      modelId: ev ? 'ioniq5' : 'avante',
      bodyColor: ev ? 'SAW' : 'A2B',
    }];
  }

  async getSnapshot(): Promise<VehicleSnapshot> {
    return toSnapshot(this.read());
  }

  async getRecentTrips(): Promise<Trip[]> {
    try {
      return JSON.parse(secureStorage.getItem(TRIPS_KEY) ?? '[]') as Trip[];
    } catch {
      return [];
    }
  }

  /** 앱에서 끝낸 주행 저장 (최근 50개) */
  async recordTrip(t: Trip) {
    const list = [t, ...(await this.getRecentTrips())].slice(0, 50);
    secureStorage.setItem(TRIPS_KEY, JSON.stringify(list));
  }
}
