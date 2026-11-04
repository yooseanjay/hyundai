// 공모전 시연용 차량 시뮬레이터.
// 실제 API 키 승인 전에도 "운전 → 상태 변화 → 일기 → 성장" 루프 전체를 체험할 수 있게 한다.
import type { CarProfile, Trip, VehicleDataSource, VehicleSnapshot, WarningKey } from './types';

const STORE_KEY = 'oca.mock.v1';

interface MockState {
  snapshot: VehicleSnapshot;
  trips: Trip[];
}

const CAR: CarProfile = {
  carId: 'mock-ioniq5',
  nickname: '오닉이',
  model: 'IONIQ 5',
  fuelType: 'ev',
  color: '#7fd1c7',
};

function initial(): MockState {
  return {
    snapshot: {
      odometerKm: 12840,
      dteKm: 310,
      fuelLevelPct: 72,
      charging: false,
      pluggedIn: false,
      warnings: {
        tirePressure: false,
        engineOil: false,
        brakeOil: false,
        washerFluid: true,
        lamp: false,
        smartKeyBattery: false,
      },
      parking: { lat: 37.5665, lng: 126.978, label: '서울시청 지하주차장 B2' },
      updatedAt: new Date().toISOString(),
    },
    trips: [],
  };
}

function load(): MockState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    /* ignore */
  }
  return initial();
}

function save(s: MockState) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const PLACES = ['회사 주차장', '집 앞 골목', '마트 주차장', '한강공원 주차장', '카페 앞', '고속도로 휴게소'];
const KWH_PER_KM = 0.16;
const BATTERY_KWH = 77.4;

export class MockVehicleSource implements VehicleDataSource {
  readonly kind = 'mock' as const;
  private state = load();

  async getCars() {
    return [CAR];
  }
  async getSnapshot() {
    return structuredClone(this.state.snapshot);
  }
  async getRecentTrips() {
    return structuredClone(this.state.trips.slice(-20));
  }

  // ---- 시뮬레이터 전용 조작 (실제 차량에서는 운전/정비가 이 역할을 한다) ----

  /** 주행 한 번을 시뮬레이션하고 결과 Trip을 돌려준다. */
  simulateTrip(opts: { distanceKm: number; style: 'calm' | 'normal' | 'sporty' }): Trip {
    const { distanceKm, style } = opts;
    const avg = style === 'calm' ? 38 : style === 'normal' ? 52 : 74;
    const durationMin = Math.max(5, Math.round((distanceKm / avg) * 60));
    const ended = new Date();
    const started = new Date(ended.getTime() - durationMin * 60000);
    const trip: Trip = {
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      distanceKm,
      durationMin,
      avgSpeedKmh: avg,
      maxSpeedKmh: Math.round(avg * (style === 'sporty' ? 1.9 : 1.4)),
      hardBrakes: style === 'sporty' ? 3 + Math.floor(Math.random() * 4) : style === 'normal' ? Math.floor(Math.random() * 2) : 0,
    };

    const s = this.state.snapshot;
    const effMul = style === 'sporty' ? 1.3 : style === 'calm' ? 0.9 : 1;
    const usedPct = ((distanceKm * KWH_PER_KM * effMul) / BATTERY_KWH) * 100;
    s.fuelLevelPct = Math.max(0, Math.round((s.fuelLevelPct - usedPct) * 10) / 10);
    s.dteKm = Math.round((s.fuelLevelPct / 100) * BATTERY_KWH / KWH_PER_KM);
    s.odometerKm += distanceKm;
    s.parking = { lat: 37.5 + Math.random() * 0.1, lng: 126.9 + Math.random() * 0.1, label: PLACES[Math.floor(Math.random() * PLACES.length)] };

    // 장거리·거친 운전일수록 경고 발생 확률 증가
    const risk = distanceKm / 400 + trip.hardBrakes * 0.05;
    const candidates: WarningKey[] = ['tirePressure', 'washerFluid', 'lamp', 'engineOil', 'smartKeyBattery'];
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

  /** 완속 충전 시뮬레이션 */
  charge(toPct = 90) {
    const s = this.state.snapshot;
    s.fuelLevelPct = Math.max(s.fuelLevelPct, toPct);
    s.dteKm = Math.round((s.fuelLevelPct / 100) * BATTERY_KWH / KWH_PER_KM);
    s.updatedAt = new Date().toISOString();
    save(this.state);
  }

  reset() {
    this.state = initial();
    save(this.state);
  }
}
