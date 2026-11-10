// Cloudflare Worker: Gemini 중계 서버 (무료 플랜)
// - Gemini 키는 Cloudflare 비밀값(GEMINI_API_KEY)에만 저장 → 브라우저·GitHub에 노출 없음
// - 이 앱 주소에서만 허용 (CORS), 대화·목소리 경로만 허용, 길이·횟수 제한으로 무료 사용량 보호
//
//  GET  /status                         → { enabled }
//  GET  /v1beta/models?...              → 모델 목록
//  POST /v1beta/models/<id>:generateContent → 대화
//  POST /v1beta/interactions            → 목소리 (스트리밍 그대로 전달)

interface Env {
  GEMINI_API_KEY: string;
  LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

const API = 'https://generativelanguage.googleapis.com';
const ALLOWED_PATH = /^\/v1beta\/(models(\?.*)?$|models\/gemini-[\w.-]+:generateContent$|interactions$)/;
const ORIGINS = [/^https:\/\/yooseanjay\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/];
const MAX_BODY = 24_000; // 바이트
const MAX_TTS_CHARS = 300;
const MAX_OUTPUT_TOKENS = 200;

function cors(origin: string | null) {
  const ok = !!origin && ORIGINS.some((re) => re.test(origin));
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': ok ? origin! : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    } as Record<string, string>,
  };
}

const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const c = cors(req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
    if (!c.ok) return json({ error: { message: '허용되지 않은 사이트' } }, 403, c.headers);

    if (url.pathname === '/status') return json({ enabled: !!env.GEMINI_API_KEY }, 200, c.headers);
    if (!env.GEMINI_API_KEY) return json({ error: { message: '서버에 키가 아직 없어요' } }, 503, c.headers);

    const path = url.pathname + url.search;
    if (!ALLOWED_PATH.test(path) || !['GET', 'POST'].includes(req.method)) return json({ error: { message: '허용되지 않은 경로' } }, 403, c.headers);

    // 방문자(IP)별 횟수 제한
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) {
      return json({ error: { message: '잠시만요! 너무 많이 물어봤어요. 1분 뒤에 다시 해 주세요.' } }, 429, c.headers);
    }

    let body: string | undefined;
    if (req.method === 'POST') {
      body = await req.text();
      if (body.length > MAX_BODY) return json({ error: { message: '요청이 너무 길어요' } }, 413, c.headers);
      let data: any;
      try { data = JSON.parse(body); } catch { return json({ error: { message: '잘못된 요청' } }, 400, c.headers); }
      if (url.pathname.endsWith(':generateContent')) {
        data.generationConfig = { ...(data.generationConfig ?? {}), maxOutputTokens: Math.min(data.generationConfig?.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS) };
      } else {
        // 목소리: TTS 모델만, 글자 수 제한
        if (!/^gemini-[\w.-]*tts$/.test(String(data.model ?? ''))) return json({ error: { message: '목소리 모델만 허용' } }, 403, c.headers);
        const text = JSON.stringify(data.input ?? '');
        if (text.length > MAX_TTS_CHARS * 3) return json({ error: { message: '문장이 너무 길어요' } }, 413, c.headers);
      }
      body = JSON.stringify(data);
    }

    const r = await fetch(API + path, {
      method: req.method,
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body,
    });
    const h = new Headers(c.headers);
    h.set('Content-Type', r.headers.get('content-type') ?? 'application/json');
    h.set('Cache-Control', 'no-store');
    return new Response(r.body, { status: r.status, headers: h }); // 스트리밍 그대로 전달
  },
};
