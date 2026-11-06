// 2단계: 봉인된 세션 쿠키
import { describe, expect, it } from 'vitest';
import { cookie, deriveKey, IDLE_TTL, readCookie, sealValue, sessionAlive, unsealValue, type Session } from '../api/_lib/session';

const SECRET = 'test-secret-0123456789-abcdefghijklmnop';
const now = Date.now();
const s: Session = { sid: 'sid', carIds: ['A1'], at: 'ACCESS-TOKEN-VALUE', iat: now, exp: now + 3600_000, seen: now };

describe('세션 쿠키', () => {
  it('봉인 → 열기, 쿠키 안에서 토큰이 보이지 않음', async () => {
    const v = await sealValue(SECRET, 'session', s);
    expect(v).not.toContain('ACCESS-TOKEN');
    expect(await unsealValue<Session>(SECRET, 'session', v)).toEqual(s);
  });
  it('고친 쿠키 · 다른 비밀값 · 다른 용도는 모두 거부', async () => {
    const v = await sealValue(SECRET, 'session', s);
    expect(await unsealValue(SECRET, 'session', v.slice(0, -2) + (v.endsWith('AA') ? 'BB' : 'AA'))).toBeNull();
    expect(await unsealValue(SECRET + 'x', 'session', v)).toBeNull();
    expect(await unsealValue(SECRET, 'oauth', v)).toBeNull(); // 로그인용 쿠키를 세션으로 못 씀
  });
  it('짧은 비밀값은 거부', () => {
    expect(() => deriveKey('short', 'session')).toThrow();
  });
  it('절대 만료 · 미사용 만료', () => {
    expect(sessionAlive(s, now + 1000)).toBe(true);
    expect(sessionAlive(s, now + 3600_001)).toBe(false);
    expect(sessionAlive({ ...s, exp: now + 99 * 3600_000 }, now + IDLE_TTL + 1)).toBe(false);
    expect(sessionAlive(null)).toBe(false);
  });
  it('쿠키 속성: HttpOnly · Secure · SameSite · Path=/ · Domain 없음', () => {
    const c = cookie('__Host-oca_sess', 'v', 60);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Path=\//);
    expect(c).not.toMatch(/Domain=/);
  });
  it('쿠키 읽기', () => {
    const req = new Request('https://x.test/', { headers: { cookie: 'a=1; __Host-oca_sess=abc%2E; b=2' } });
    expect(readCookie(req, '__Host-oca_sess')).toBe('abc.');
  });
});
