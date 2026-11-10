// 2단계: OAuth PKCE · 내 차만 조회 (BOLA/IDOR 방지)
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { challengeOf, checkCarPath, extractCarIds, newState, newVerifier } from '../api/_lib/oauth';

describe('PKCE (RFC 7636)', () => {
  it('S256 = BASE64URL(SHA-256(verifier)) — Node 표준 구현과 교차 검증', async () => {
    for (let i = 0; i < 5; i++) {
      const v = newVerifier();
      expect(await challengeOf(v)).toBe(createHash('sha256').update(v).digest('base64url'));
    }
  });
  it('verifier는 43~128자, state는 매번 다름', () => {
    const v = newVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(newState()).not.toBe(newState());
  });
});

describe('차량 경로 허용 + 소유 확인', () => {
  const mine = ['CAR-A1'];
  it('차 목록은 허용', () => expect(checkCarPath('/api/v1/car/profile/carlist', mine)).toEqual({ ok: true }));
  it('내 차 상태는 허용', () => expect(checkCarPath('/api/v1/car/status/CAR-A1/dte', mine)).toEqual({ ok: true, carId: 'CAR-A1' }));
  it('남의 차 ID → 403', () => expect(checkCarPath('/api/v1/car/status/CAR-B2/parkinglocation', mine)).toMatchObject({ ok: false, status: 403 }));
  it('허용 목록 밖 경로 → 404', () => expect(checkCarPath('/api/v1/user/profile', mine)).toMatchObject({ ok: false, status: 404 }));
  it('경로 조작(../ · 인코딩) → 거부', () => {
    expect(checkCarPath('/api/v1/car/status/CAR-A1/../../user', mine)).toMatchObject({ ok: false });
    expect(checkCarPath('/api/v1/car/status/CAR-A1%2f..%2fuser/dte', mine)).toMatchObject({ ok: false });
  });
  it('차 목록 응답에서 올바른 carId만 뽑아냄', () => {
    expect(extractCarIds({ cars: [{ carId: 'A1', name: 'x' }, { car_id: 'B2' }], nested: { carId: 'bad id!' } }).sort()).toEqual(['A1', 'B2']);
  });
});
