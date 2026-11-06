// ─────────────────────────────────────────────────────────────────────────────
// 보안 2단계 · 봉인된 세션 쿠키 (DB 없는 서버에서 소유자 세션 유지)
//
//  - 세션 내용(현대 토큰, 내 차 ID 목록, 만료)을 AES-256-GCM으로 암호화해 쿠키에 담음
//    → 브라우저·확장 프로그램·XSS가 쿠키를 봐도 토큰을 알 수 없고, 고치면 GCM 태그가 깨짐
//  - 키 = HKDF-SHA-256(SESSION_SECRET, 용도별 info) → 세션 쿠키 키와 로그인 쿠키 키를 분리
//  - __Host- 접두사 + HttpOnly + Secure + SameSite + Path=/ (하위 도메인·스크립트 접근·평문 전송 차단)
//  - 절대 만료(12시간) + 미사용 만료(2시간) + 요청마다 다시 봉인(회전)
// ─────────────────────────────────────────────────────────────────────────────
import { open, seal } from '../../src/security/crypto';

export const SESSION_COOKIE = '__Host-oca_sess';
export const OAUTH_COOKIE = '__Host-oca_oauth';
export const ABSOLUTE_TTL = 12 * 3600_000;
export const IDLE_TTL = 2 * 3600_000;
const MAX_COOKIE = 3900;

export interface Session {
  sid: string;
  carIds: string[];
  at: string; // 현대 access token
  rt?: string; // refresh token
  atExp?: number;
  iat: number;
  exp: number; // 절대 만료
  seen: number; // 마지막 사용
}

export interface OAuthPending {
  state: string;
  verifier?: string;
  exp: number;
}

const enc = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/** 용도(info)별 별도 키. 비밀값이 32바이트보다 짧으면 거부 */
export function deriveKey(secret: string, info: string): Promise<CryptoKey> {
  if (enc.encode(secret).length < 32) throw new Error('SESSION_SECRET은 32바이트 이상이어야 해요');
  const id = `${info}:${secret}`;
  if (!keys.has(id)) {
    keys.set(id, (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('our-car-alive/v1'), info: enc.encode(info) },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
      );
    })());
  }
  return keys.get(id)!;
}

export async function sealValue(secret: string, purpose: string, value: unknown): Promise<string> {
  const out = await seal(await deriveKey(secret, purpose), JSON.stringify(value), purpose);
  if (out.length > MAX_COOKIE) throw new Error('세션이 너무 커요');
  return out;
}

export async function unsealValue<T>(secret: string, purpose: string, sealed: string | undefined): Promise<T | null> {
  if (!sealed) return null;
  try { return JSON.parse(await open(await deriveKey(secret, purpose), sealed, purpose)) as T; } catch { return null; }
}

/** 세션 유효성: 절대 만료·미사용 만료 */
export function sessionAlive(s: Session | null, now = Date.now()): s is Session {
  return !!s && now < s.exp && now - s.seen < IDLE_TTL;
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function cookie(name: string, value: string, maxAgeSec: number, sameSite: 'Strict' | 'Lax' = 'Lax'): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`;
}

export const clearCookie = (name: string) => cookie(name, '', 0);
