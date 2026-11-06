// Vercel 서버 함수: Gemini Live API용 1회용 임시 토큰 발급
// - 실제 키(GEMINI_API_KEY)는 서버에만 있고, 브라우저에는 짧게 쓰고 버리는 토큰만 전달
// - 토큰은 1회 사용 · 1분 안에 연결 시작 · 30분 뒤 만료 · 모델과 음성 응답 방식이 고정됨
export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

const ORIGINS = [/^https:\/\/yooseanjay\.github\.io$/, /^https:\/\/our-car-alive[\w-]*\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/];
export const LIVE_MODEL = 'gemini-3.8-live';

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 6; // IP당 1분에 6번 연결
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  const self = new URL(req.url).origin;
  const allowed = !origin || origin === self || ORIGINS.some((re) => re.test(origin));
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': allowed && origin ? origin : self,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
  if (!allowed) return json({ error: '허용되지 않은 사이트' }, 403);
  if (req.method !== 'POST') return json({ error: 'POST만 허용' }, 405);
  const key = process.env.GEMINI_API_KEY ?? '';
  if (!key) return json({ error: '서버에 키가 아직 없어요' }, 503);
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (limited(ip)) return json({ error: '잠시 뒤에 다시 시도해 주세요' }, 429);

  const now = Date.now();
  const r = await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      // 이 토큰으로는 정해진 모델로만 연결 가능 (목소리·말투 설정은 앱에서)
      bidiGenerateContentSetup: { model: `models/${LIVE_MODEL}` },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.name) return json({ error: data?.error?.message ?? `토큰 발급 실패 (HTTP ${r.status})` }, r.status === 429 ? 429 : 502);
  return json({ token: data.name, model: LIVE_MODEL }, 200);
}
