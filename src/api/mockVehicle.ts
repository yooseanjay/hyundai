// 공모전 시연용 차량 시뮬레이터.
// 실제 API 키 승인 전에도 "운전 → 상태 변화 → 일기 → 성장" 루프 전체를 체험할 수 있게 한다.
// 현대차 전 라인업(src/data/hyundaiModels.ts) 중 아무 차나 골라 시뮬레이션할 수 있다.
import { secureStorage } from '../security/secureStorage';
import { findModelById, HYUNDAI_MODELS, validColor, type BodyColor } from '../data/hyundaiModels';
import type { CarProfile, FuelType, Trip, VehicleDataSource, VehicleSnapshot, WarningKey } from './types';

const STORE_KEY = 'oca.mock.v2';

export interface MockCarConfig {
  modelId: string;
  fuel: FuelType;
  color: BodyColor;
  nickname: string;
}

interface MockState {
  car: MockCarConfig;
  snapshot: VehicleSnapshot;
  trips: Trip[];
}

const DEFAULT_CAR: MockCarConfig = { modelId: 'ioniq5', fuel: 'ev', color: 'SAW', nickname: '오닉이' };

function specOf(car: MockCarConfig) {
  const m = findModelById(car.modelId) ?? HYUNDAI_MODELS[0];
  const fuel = m.fuels.includes(car.fuel) ? car.fuel : m.fuels[0];
  return { model: m, fuel, eff: m.efficiency[fuel] ?? 12, cap: m.capacity[fuel] ?? 50 };
}

const dteOf = (car: MockCarConfig, pct: number) => {
  const { eff, cap } = specOf(car);
  return Math.round((pct / 100) * cap * eff);
};

function initial(car: MockCarConfig = DEFAULT_CAR): MockState {
  const pct = 72;
  return {
    car,
    snapshot: {
      odometerKm: 12840,
      dteKm: dteOf(car, pct),
      fuelLevelPct: pct,
      charging: false,
      pluggedIn: false,
      warnings: { tirePressure: false, engineOil: false, brakeOil: false, washerFluid: true, lamp: false, smartKeyBattery: false },
      parking: { lat: 37.5665, lng: 126.978, label: '서울시청 지하주차장 B2' },
      updatedAt: new Date().toISOString(),
    },
    trips: [],
  };
}

function load(): MockState {
  try {
    const raw = secureStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as MockState;
      // 없어진 차종·색이면 3D 모델이 있는 차·실제 색으로 바꿈
      if (!findModelById(s.car.modelId)) s.car = { ...s.car, modelId: DEFAULT_CAR.modelId, fuel: DEFAULT_CAR.fuel };
      s.car.color = validColor(s.car.color, s.car.modelId);
      return s;
    }
  } catch {
    /* ignore */
  }
  return initial();
}

function save(s: MockState) {
  try {
    secureStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const PLACES = ['회사 주차장', '집 앞 골목', '마트 주차장', '한강공원 주차장', '카페 앞', '고속도로 휴게소'];

export class MockVehicleSource implements VehicleDataSource {
  readonly kind = 'mock' as const;
  private state = load();

  get config(): MockCarConfig {
    return { ...this.state.car };
  }

  async getCars(): Promise<CarProfile[]> {
    const { model, fuel } = specOf(this.state.car);
    return [{
      carId: `mock-${model.id}`,
      nickname: this.state.car.nickname || model.name,
      model: model.name,
      fuelType: fuel,
      modelId: model.id,
      bodyColor: this.state.car.color,
    }];
  }
  async getSnapshot() {
    return structuredClone(this.state.snapshot);
  }
  async getRecentTrips() {
    return structuredClone(this.state.trips.slice(-20));
  }

  // ---- 시뮬레이터 전용 조작 (실제 차량에서는 운전/정비가 이 역할을 한다) ----

  /** 차 바꾸기: 모델·연료·색·이름 */
  setCar(car: MockCarConfig) {
    const { model, fuel } = specOf(car);
    const modelChanged = car.modelId !== this.state.car.modelId || fuel !== this.state.car.fuel;
    this.state.car = { ...car, fuel, color: validColor(car.color, model.id) };
    if (modelChanged) {
      this.state.snapshot.dteKm = dteOf(this.state.car, this.state.snapshot.fuelLevelPct);
      this.state.snapshot.charging = false;
      this.state.snapshot.pluggedIn = false;
    }
    void model;
    save(this.state);
  }

  /** 주행 한 번을 시뮬레이션하고 결과 Trip을 돌려준다. */
  simulateTrip(opts: { distanceKm: number; style: 'calm' | 'normal' | 'sporty'; avgSpeedKmh?: number; maxSpeedKmh?: number; hardBrakes?: number }): Trip {
    const { distanceKm, style } = opts;
    // 주행 화면에서 실제로 측정한 값이 있으면 그대로 사용
    const avg = opts.avgSpeedKmh ? Math.round(opts.avgSpeedKmh) : style === 'calm' ? 38 : style === 'normal' ? 52 : 74;
    const durationMin = Math.max(5, Math.round((distanceKm / avg) * 60));
    const ended = new Date();
    const started = new Date(ended.getTime() - durationMin * 60000);
    const trip: Trip = {
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      distanceKm,
      durationMin,
      avgSpeedKmh: avg,
      maxSpeedKmh: opts.maxSpeedKmh ? Math.round(opts.maxSpeedKmh) : Math.round(avg * (style === 'sporty' ? 1.9 : 1.4)),
      hardBrakes: opts.hardBrakes ?? (style === 'sporty' ? 3 + Math.floor(Math.random() * 4) : style === 'normal' ? Math.floor(Math.random() * 2) : 0),
    };

    const s = this.state.snapshot;
    const { eff, cap } = specOf(this.state.car);
    const effMul = style === 'sporty' ? 1.3 : style === 'calm' ? 0.9 : 1;
    const usedPct = ((distanceKm / eff) * effMul / cap) * 100;
    s.fuelLevelPct = Math.max(0, Math.round((s.fuelLevelPct - usedPct) * 10) / 10);
    s.dteKm = dteOf(this.state.car, s.fuelLevelPct);
    s.odometerKm += distanceKm;
    s.parking = { lat: 37.5 + Math.random() * 0.1, lng: 126.9 + Math.random() * 0.1, label: PLACES[Math.floor(Math.random() * PLACES.length)] };

    // 장거리·거친 운전일수록 경고 발생 확률 증가 (전기차는 엔진오일 경고 없음)
    const risk = distanceKm / 400 + trip.hardBrakes * 0.05;
    const candidates: WarningKey[] = ['tirePressure', 'washerFluid', 'lamp', 'smartKeyBattery'];
    if (specOf(this.state.car).fuel !== 'ev') candidates.push('engineOil');
    for (const k of candidates) if (!s.warnings[k] && Math.random() < risk * 0.35) s.warnings[k] = true;

    s.updatedAt = new Date().toISOString();
    this.state.trips.push(trip);
    save(this.state);
    return trip;
  }

  /** 정비(경고 해결) */
  fix(key: WarningKey) {
    this.state.snapshot.warnings[key] = false;
    this.state.snapshot.updatedAt = new Date().toISOString();
    save(this.state);
  }

  /** 주유 · 충전 · 수소 충전 */
  refill(toPct = 95) {
    const s = this.state.snapshot;
    s.fuelLevelPct = Math.max(s.fuelLevelPct, toPct);
    s.dteKm = dteOf(this.state.car, s.fuelLevelPct);
    s.updatedAt = new Date().toISOString();
    save(this.state);
  }

  reset() {
    this.state = initial(this.state.car);
    save(this.state);
  }
}
