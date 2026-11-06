// ─────────────────────────────────────────────────────────────────────────────
// 보안 2단계 · OAuth 2.0 도우미 (RFC 6749 · RFC 7636 PKCE · RFC 9700 보안 권고)
//  - state: 256비트 난수, 봉인 쿠키에 보관해 콜백에서 상수 시간 비교 (로그인 CSRF 차단)
//  - PKCE S256: code_verifier(43~128자) → SHA-256 → code_challenge (코드 가로채기 차단)
//  - 차량 소유 확인: 로그인 직후 carList로 받은 차 ID만 세션에 묶음 (BOLA/IDOR 차단)
// ─────────────────────────────────────────────────────────────────────────────
import { b64u, randomBytes } from '../../src/security/crypto';

export function newState(): string {
  return b64u(randomBytes(32));
}

export function newVerifier(): string {
  return b64u(randomBytes(48)); // 64자, RFC 7636 허용 문자
}

export async function challengeOf(verifier: string): Promise<string> {
  return b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

/** carList 응답 모양이 문서마다 달라도 carId 값을 모두 찾아냄 */
export function extractCarIds(body: unknown, out = new Set<string>()): string[] {
  if (Array.isArray(body)) body.forEach((b) => extractCarIds(b, out));
  else if (body && typeof body === 'object') {
    for (const [k, v] of Object.entries(body)) {
      if (/^car_?id$/i.test(k) && (typeof v === 'string' || typeof v === 'number') && /^[\w-]{1,64}$/.test(String(v))) out.add(String(v));
      else extractCarIds(v, out);
    }
  }
  return [...out];
}

// 브라우저가 부를 수 있는 현대 API 경로 (허용 목록). 그 밖의 경로는 모두 거부
const CAR_LIST = /^\/api\/v1\/car\/profile\/carlist$/;
const CAR_STATUS = /^\/api\/v1\/car\/status\/([\w-]{1,64})\/(odometer|dte|ev\/battery|ev\/charging|warning|parkinglocation|drvhistory)$/;

export type PathCheck = { ok: true; carId?: string } | { ok: false; status: 403 | 404; reason: string };

/** 경로 허용 + 소유 확인: 내 세션에 묶인 차가 아니면 403 */
export function checkCarPath(path: string, ownedCarIds: readonly string[]): PathCheck {
  if (path.includes('..') || path.includes('//') || /%2e|%2f/i.test(path)) return { ok: false, status: 404, reason: '경로 조작' };
  if (CAR_LIST.test(path)) return { ok: true };
  const m = CAR_STATUS.exec(path);
  if (!m) return { ok: false, status: 404, reason: '허용되지 않은 경로' };
  if (!ownedCarIds.includes(m[1])) return { ok: false, status: 403, reason: '본인 차량이 아님' };
  return { ok: true, carId: m[1] };
}
