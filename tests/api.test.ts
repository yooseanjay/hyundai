// 1·2단계: 서버 관문과 차량 중계를 실제 Request로 호출해 공격 시나리오를 재현
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { originAllowed, rateLimited } from '../api/_lib/http';
import { sealValue, SESSION_COOKIE, type Session } from '../api/_lib/session';
import carHandler from '../api/car';

const SITE = 'https://our-car-alive.vercel.app';
const SECRET = 'test-secret-0123456789-abcdefghijklmnop';

beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.VITE_HYUNDAI_API_BASE = 'https://hyundai.test';
});
afterEach(() => vi.restoreAllMocks());

const sessionCookie = async (carIds = ['MY-CAR']) => {
  const now = Date.now();
  const s: Session = { sid: 's1', carIds, at: 'TOKEN', iat: now, exp: now + 3600_000, seen: now };
  return `${SESSION_COOKIE}=${encodeURIComponent(await sealValue(SECRET, 'session', s))}`;
};
const carReq = (path: string, headers: Record<string, string>) =>
  new Request(`${SITE}/api/car?p=${encodeURIComponent(path)}`, { headers: { 'Sec-Fetch-Site': 'same-origin', ...headers } });

describe('1단계 · 출처 검사', () => {
  const r = (h: Record<string, string>) => new Request(`${SITE}/api/gemini`, { headers: h });
  it('같은 사이트 · 허용 목록은 통과', () => {
    expect(originAllowed(r({ Origin: SITE }))).toBe(true);
    expect(originAllowed(r({ Origin: 'https://yooseanjay.github.io' }))).toBe(true);
    expect(originAllowed(r({ 'Sec-Fetch-Site': 'same-origin' }))).toBe(true);
  });
  it('다른 사이트 · 출처 없는 스크립트는 거부', () => {
    expect(originAllowed(r({ Origin: 'https://evil.example' }))).toBe(false);
    expect(originAllowed(r({ 'Sec-Fetch-Site': 'cross-site' }))).toBe(false);
    expect(originAllowed(r({}))).toBe(false);
  });
  it('차량 API(sameOriginOnly)는 허용 목록 사이트라도 거부', () => {
    expect(originAllowed(r({ Origin: 'https://yooseanjay.github.io' }), true)).toBe(false);
  });
  it('슬라이딩 윈도 횟수 제한', () => {
    const t = Date.now();
    for (let i = 0; i < 6; i++) expect(rateLimited('test|1.2.3.4', 6, t + i)).toBe(false);
    expect(rateLimited('test|1.2.3.4', 6, t + 7)).toBe(true);
    expect(rateLimited('test|1.2.3.4', 6, t + 61_000)).toBe(false); // 1분 지나면 풀림
  });
});

describe('2단계 · 차량 중계 (소유자 전용)', () => {
  it('다른 사이트에서 부르면 403 (CORS 허용 없음)', async () => {
    const res = await carHandler(new Request(`${SITE}/api/car?p=/api/v1/car/profile/carlist`, { headers: { Origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('앱 표시 헤더가 없으면 403 (CSRF)', async () => {
    const res = await carHandler(carReq('/api/v1/car/profile/carlist', { cookie: await sessionCookie() }));
    expect(res.status).toBe(403);
  });
  it('세션이 없거나 위조면 401', async () => {
    expect((await carHandler(carReq('/api/v1/car/profile/carlist', { 'X-OCA-Request': '1' }))).status).toBe(401);
    expect((await carHandler(carReq('/api/v1/car/profile/carlist', { 'X-OCA-Request': '1', cookie: `${SESSION_COOKIE}=v1.AAAAAAAAAAAAAAAA.forged` }))).status).toBe(401);
  });
  it('남의 차 ID → 403, 현대 서버로 요청 자체를 보내지 않음', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await carHandler(carReq('/api/v1/car/status/OTHER-CAR/parkinglocation', { 'X-OCA-Request': '1', cookie: await sessionCookie() }));
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });
  it('내 차는 통과: 토큰은 서버가 붙이고, 응답은 캐시 금지 + 세션 회전', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"dte":300}', { headers: { 'content-type': 'application/json' } }));
    const res = await carHandler(carReq('/api/v1/car/status/MY-CAR/dte', { 'X-OCA-Request': '1', cookie: await sessionCookie() }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"dte":300}');
    const [url, init] = spy.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe('https://hyundai.test/api/v1/car/status/MY-CAR/dte');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('Set-Cookie')).toMatch(/__Host-oca_sess=.*HttpOnly; Secure/);
  });
  it('쓰기 메서드는 405', async () => {
    const res = await carHandler(new Request(`${SITE}/api/car?p=/api/v1/car/profile/carlist`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin' } }));
    expect(res.status).toBe(405);
  });
});
