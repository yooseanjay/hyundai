import { describe, expect, it } from 'vitest';
import { isEv, toSnapshot, type PleosRaw } from '../src/api/pleosVehicle';

const base: PleosRaw = {
  connected: true, odometerKm: 12840.6, rangeKm: 312.4, evSocPct: 71, fuelPct: null, charging: false,
  engineOilLow: false, brakeFluidLow: false, washerFluidLow: true,
};

describe('Pleos 차량 값 → 앱 상태', () => {
  it('전기차: 배터리 %, 주행 가능 거리, 경고를 그대로 옮긴다', () => {
    const s = toSnapshot(base, new Date('2026-11-10T00:00:00Z'));
    expect(s).toMatchObject({ odometerKm: 12841, dteKm: 312, fuelLevelPct: 71, charging: false, parking: null });
    expect(s.warnings).toEqual({ tirePressure: false, engineOil: false, brakeOil: false, washerFluid: true, lamp: false, smartKeyBattery: false });
    expect(isEv(base)).toBe(true);
  });

  it('내연기관: 연료 %를 쓰고, 모르는 값은 안전한 기본값', () => {
    const raw: PleosRaw = { ...base, evSocPct: null, fuelPct: 140, rangeKm: null, charging: null, washerFluidLow: null };
    const s = toSnapshot(raw);
    expect(s.fuelLevelPct).toBe(100);
    expect(s.dteKm).toBe(0);
    expect(s.charging).toBe(false);
    expect(s.warnings.washerFluid).toBe(false);
    expect(isEv(raw)).toBe(false);
  });
});
