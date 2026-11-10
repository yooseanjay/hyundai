// ─────────────────────────────────────────────────────────────────────────────
// 보안 2단계 · 현대 계정 로그인 (Vercel Edge, 배포용)
//   /auth/login    → 현대 로그인 페이지 (state + PKCE를 봉인 쿠키에 보관)
//   /callback      → state 확인 → code를 서버에서만 토큰으로 교환 → 내 차 목록을 세션에 묶음
//   /auth/status   → { configured, loggedIn, expiresAt }  (토큰 값은 절대 내보내지 않음)
//   /auth/logout   → 세션 쿠키 삭제
// Client Secret·토큰은 서버와 암호화 쿠키 안에만 있고, 브라우저 스크립트는 볼 수 없다.
// ─────────────────────────────────────────────────────────────────────────────
import { env, guard, rateLimited } from './_lib/http';
import { challengeOf, extractCarIds, newState, newVerifier } from './_lib/oauth';
import {
  ABSOLUTE_TTL, clearCookie, cookie, OAUTH_COOKIE, readCookie, SESSION_COOKIE, sealValue, sessionAlive, unsealValue,
  type OAuthPending, type Session,
} from './_lib/session';
import { constantTimeEqual } from '../src/security/crypto';

export const config = { runtime: 'edge' };

const cfg = () => ({
  base: env('VITE_HYUNDAI_API_BASE') || 'https://dev.kr-ccapi.hyundai.com',
  clientId: env('HYUNDAI_CLIENT_ID') || env('VITE_HYUNDAI_CLIENT_ID'),
  clientSecret: env('HYUNDAI_CLIENT_SECRET'),
  redirectUri: env('HYUNDAI_REDIRECT_URI'),
  authorizePath: env('HYUNDAI_AUTHORIZE_PATH') || '/api/v1/user/oauth2/authorize',
  tokenPath: env('HYUNDAI_TOKEN_PATH') || '/api/v1/user/oauth2/token',
  pkce: env('HYUNDAI_PKCE') === '1',
  secret: env('SESSION_SECRET'),
});

const back = (to: string, cookies: string[] = []) => {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  cookies.forEach((c) => h.append('Set-Cookie', c));
  return new Response(null, { status: 302, headers: h });
};
const authError = (msg: string, cookies: string[] = []) => back(`/?auth_error=${encodeURIComponent(msg)}`, cookies);

export default async function handler(req: Request): Promise<Response> {
  const action = new URL(req.url).searchParams.get('a') ?? '';
  const c = cfg();
  const configured = !!(c.clientId && c.clientSecret && c.redirectUri && c.secret.length >= 32);

  // 상태 확인: 같은 사이트의 앱만 (쿠키를 읽으므로)
  if (action === 'status') {
    const ctx = guard(req, { methods: ['GET'], perMinute: 60, sameOriginOnly: true });
    if (ctx instanceof Response) return ctx;
    const s = configured ? await unsealValue<Session>(c.secret, 'session', readCookie(req, SESSION_COOKIE)) : null;
    const live = sessionAlive(s);
    return ctx.json({ configured, loggedIn: live, expiresAt: live ? s.exp : null });
  }

  // 로그인·콜백·로그아웃은 페이지 이동(현대 → 우리 사이트)이라 Origin 대신 state·쿠키로 검증, 횟수만 제한
  if (req.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const ip = (req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (rateLimited(`auth|${ip}`, 20)) return new Response('잠시 뒤에 다시 시도해 주세요', { status: 429, headers: { 'Retry-After': '60' } });

  try {

    if (action === 'logout') return back('/', [clearCookie(SESSION_COOKIE), clearCookie(OAUTH_COOKIE)]);

    if (!configured) return authError('서버에 현대 로그인 설정이 아직 없어요');

    if (action === 'login') {
      const pending: OAuthPending = { state: newState(), exp: Date.now() + 10 * 60_000 };
      const u = new URL(c.authorizePath, c.base);
      u.searchParams.set('client_id', c.clientId);
      u.searchParams.set('redirect_uri', c.redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('state', pending.state);
      if (c.pkce) {
        pending.verifier = newVerifier();
        u.searchParams.set('code_challenge', await challengeOf(pending.verifier));
        u.searchParams.set('code_challenge_method', 'S256');
      }
      // 현대 → 우리 사이트로 돌아오는 이동에도 쿠키가 실리도록 Lax
      return back(u.toString(), [cookie(OAUTH_COOKIE, await sealValue(c.secret, 'oauth', pending), 600, 'Lax')]);
    }

    if (action === 'callback') {
      const url = new URL(req.url);
      const clear = clearCookie(OAUTH_COOKIE);
      if (url.searchParams.get('error')) return authError('로그인이 취소되었어요', [clear]);
      const code = url.searchParams.get('code') ?? '';
      const state = url.searchParams.get('state') ?? '';
      const pending = await unsealValue<OAuthPending>(c.secret, 'oauth', readCookie(req, OAUTH_COOKIE));
      // state는 반드시 있어야 하고, 이 브라우저가 시작한 로그인과 같아야 함 (로그인 CSRF·세션 고정 차단)
      if (!code || !pending || Date.now() > pending.exp || !constantTimeEqual(state, pending.state)) {
        return authError('로그인 확인에 실패했어요. 다시 시도해 주세요', [clear]);
      }

      const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: c.redirectUri });
      if (pending.verifier) form.set('code_verifier', pending.verifier);
      const tr = await fetch(new URL(c.tokenPath, c.base), {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`${c.clientId}:${c.clientSecret}`), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      const tok = await tr.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number };
      if (!tr.ok || !tok.access_token) return authError('현대 계정 인증에 실패했어요', [clear]);

      // 이 계정이 가진 차 ID만 세션에 묶음 → 이후 다른 차 ID로는 조회 불가
      const lr = await fetch(new URL('/api/v1/car/profile/carlist', c.base), { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/json' } });
      const carIds = extractCarIds(await lr.json().catch(() => ({})));

      const now = Date.now();
      const s: Session = {
        sid: crypto.randomUUID(), carIds, at: tok.access_token, rt: tok.refresh_token,
        atExp: tok.expires_in ? now + tok.expires_in * 1000 : undefined, iat: now, exp: now + ABSOLUTE_TTL, seen: now,
      };
      // 새 세션 ID 발급(세션 고정 방지) + 로그인 쿠키 폐기
      return back('/?auth=ok', [clear, cookie(SESSION_COOKIE, await sealValue(c.secret, 'session', s), ABSOLUTE_TTL / 1000)]);
    }

    return back('/');
  } catch (e) {
    console.error('[auth]', (e as Error)?.message);
    return authError('로그인 처리 중 문제가 생겼어요');
  }
}
