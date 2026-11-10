// ─────────────────────────────────────────────────────────────────────────────
// 보안 2단계 · 차량 데이터 중계 (소유자 전용)
//   GET /hapi/<현대 API 경로>  →  이 함수가 세션 토큰을 붙여 현대 서버에 대신 요청
//
//  검사 순서 (하나라도 실패하면 현대 서버에 요청 자체를 보내지 않음)
//   1. 같은 사이트에서 온 요청인가        (Origin / Sec-Fetch-Site, CORS 허용 없음)
//   2. 앱이 보낸 요청인가                 (X-OCA-Request 헤더 → 다른 사이트는 사전 요청에서 막힘 = CSRF 방지)
//   3. 살아 있는 내 세션인가              (봉인 쿠키 복호화 · 절대/미사용 만료)
//   4. 허용된 경로인가                    (읽기 전용 GET, 정해진 경로만, 경로 조작 차단)
//   5. 내 차인가                          (로그인 때 묶인 차 ID만 → 남의 차 ID를 넣으면 403)
//  응답: no-store·private (공유 캐시·브라우저 캐시에 남지 않음), 세션은 매번 다시 봉인해 회전
// ─────────────────────────────────────────────────────────────────────────────
import { env, fail, guard } from './_lib/http';
import { checkCarPath } from './_lib/oauth';
import { ABSOLUTE_TTL, clearCookie, cookie, readCookie, SESSION_COOKIE, sealValue, sessionAlive, unsealValue, type Session } from './_lib/session';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const ctx = guard(req, { methods: ['GET'], perMinute: 60, sameOriginOnly: true });
  if (ctx instanceof Response) return ctx;
  try {
    if (req.headers.get('X-OCA-Request') !== '1') return ctx.json({ errCode: 'CSRF', errMsg: '앱에서 보낸 요청이 아니에요' }, 403);

    const secret = env('SESSION_SECRET');
    const base = env('VITE_HYUNDAI_API_BASE') || 'https://dev.kr-ccapi.hyundai.com';
    const s = secret.length >= 32 ? await unsealValue<Session>(secret, 'session', readCookie(req, SESSION_COOKIE)) : null;
    if (!sessionAlive(s)) return ctx.json({ errCode: 'LOGIN', errMsg: '현대 계정 로그인이 필요합니다' }, 401, { 'Set-Cookie': clearCookie(SESSION_COOKIE) });

    const url = new URL(req.url);
    const path = url.searchParams.get('p') ?? '';
    const check = checkCarPath(path, s.carIds);
    if (!check.ok) {
      console.warn(`[car ${ctx.reqId}] 거부: ${check.reason} sid=${s.sid.slice(0, 8)}`); // 토큰·차 ID 원문은 로그에 남기지 않음
      return ctx.json({ errCode: check.status === 403 ? 'OWNER' : 'PATH', errMsg: check.status === 403 ? '본인 차량만 조회할 수 있어요' : '지원하지 않는 요청이에요' }, check.status);
    }

    const r = await fetch(new URL(path, base), { headers: { Authorization: `Bearer ${s.at}`, Accept: 'application/json' } });
    const body = await r.text();
    const now = Date.now();
    const rotated: Session = { ...s, seen: now };
    return new Response(body, {
      status: r.status,
      headers: {
        ...ctx.headers,
        'Content-Type': r.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'Set-Cookie': cookie(SESSION_COOKIE, await sealValue(secret, 'session', rotated), (rotated.exp - now) / 1000 || ABSOLUTE_TTL / 1000),
      },
    });
  } catch (e) {
    return fail(ctx, e);
  }
}
