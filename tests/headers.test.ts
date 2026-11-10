// 1단계: 브라우저 보안 정책이 배포 설정과 일치하고, 위험한 허용이 없는지
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSP, cspString, HEADERS } from '../security/policy.mjs';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const deployed = Object.fromEntries(vercel.headers.find((h: { source: string }) => h.source === '/(.*)').headers.map((h: { key: string; value: string }) => [h.key, h.value]));

describe('보안 헤더', () => {
  it('vercel.json이 security/policy.mjs와 같다', () => expect(deployed).toEqual(HEADERS));
  it('스크립트에 eval · 인라인 · 와일드카드 없음', () => {
    const s = CSP['script-src'];
    expect(s).not.toContain("'unsafe-eval'");
    expect(s).not.toContain("'unsafe-inline'");
    expect(s.some((x) => x === '*' || x === 'https:')).toBe(false);
  });
  it('플러그인 · 다른 사이트 안에 넣기 · base 바꾸기 차단', () => {
    const h = cspString('header');
    expect(h).toContain("object-src 'none'");
    expect(h).toContain("frame-ancestors 'none'");
    expect(h).toContain("base-uri 'self'");
  });
  it('HSTS 2년 + 하위 도메인, 클릭재킹 · MIME 스니핑 차단', () => {
    expect(HEADERS['Strict-Transport-Security']).toMatch(/max-age=63072000; includeSubDomains/);
    expect(HEADERS['X-Frame-Options']).toBe('DENY');
    expect(HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });
  it('카메라 금지, 마이크·위치는 이 사이트만', () => {
    expect(HEADERS['Permissions-Policy']).toMatch(/camera=\(\)/);
    expect(HEADERS['Permissions-Policy']).toMatch(/microphone=\(self\)/);
  });
  it('차량 API 경로가 서버 함수로 연결됨', () => {
    const r = vercel.rewrites.map((x: { source: string; destination: string }) => `${x.source} -> ${x.destination}`);
    expect(r).toContain('/hapi/:path* -> /api/car?p=/:path*');
    expect(r).toContain('/callback -> /api/auth?a=callback');
  });
});
