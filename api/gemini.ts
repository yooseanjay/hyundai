// Vercel 서버 함수 (무료 Hobby 플랜, Edge): Gemini 중계
// - Gemini 키는 Vercel 환경 변수 GEMINI_API_KEY에만 저장 → 브라우저·GitHub에 노출 없음
// - 대화·목소리 경로만 허용, 길이·횟수 제한으로 무료 사용량 보호, 목소리는 스트리밍 그대로 전달
//
//  GET  /api/gemini?p=status                                 → { enabled }
//  GET  /api/gemini?p=/v1beta/models?pageSize=200            → 모델 목록
//  POST /api/gemini?p=/v1beta/models/<id>:generateContent    → 대화
//  POST /api/gemini?p=/v1beta/interactions                   → 목소리
export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

const API = 'https://generativelanguage.googleapis.com';
const ALLOWED_PATH = /^\/v1beta\/(models(\?[\w=&]*)?$|models\/gemini-[\w.-]+:generateContent$|interactions$)/;
// 같은 주소(Vercel)에서는 Origin 검사가 필요 없고, 다른 곳은 이 앱 주소만 허용
const ORIGINS = [/^https:\/\/yooseanjay\.github\.io$/, /^https:\/\/our-car-alive[\w-]*\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/];
const MAX_BODY = 24_000;
const MAX_TTS_CHARS = 300;
const MAX_OUTPUT_TOKENS = 200;
const PER_MINUTE = 12;

// 서버 인스턴스별 간단한 횟수 제한 (IP당 1분에 12번)
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > PER_MINUTE;
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  const self = new URL(req.url).origin;
  const allowed = !origin || origin === self || ORIGINS.some((re) => re.test(origin));
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': allowed && origin ? origin : self,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
  if (!allowed) return json({ error: { message: '허용되지 않은 사이트' } }, 403);

  const key = process.env.GEMINI_API_KEY ?? '';
  const p = new URL(req.url).searchParams.get('p') ?? '';
  if (p === 'status') return json({ enabled: !!key }, 200);
  if (!key) return json({ error: { message: '서버에 키가 아직 없어요' } }, 503);
  if (!ALLOWED_PATH.test(p) || !['GET', 'POST'].includes(req.method)) return json({ error: { message: '허용되지 않은 경로' } }, 403);

  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (limited(ip)) return json({ error: { message: '잠시만요! 너무 많이 물어봤어요. 1분 뒤에 다시 해 주세요.' } }, 429);

  let body: string | undefined;
  if (req.method === 'POST') {
    body = await req.text();
    if (body.length > MAX_BODY) return json({ error: { message: '요청이 너무 길어요' } }, 413);
    let data: any;
    try { data = JSON.parse(body); } catch { return json({ error: { message: '잘못된 요청' } }, 400); }
    if (p.endsWith(':generateContent')) {
      data.generationConfig = { ...(data.generationConfig ?? {}), maxOutputTokens: Math.min(data.generationConfig?.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS) };
    } else {
      if (!/^gemini-[\w.-]*tts$/.test(String(data.model ?? ''))) return json({ error: { message: '목소리 모델만 허용' } }, 403);
      if (JSON.stringify(data.input ?? '').length > MAX_TTS_CHARS * 3) return json({ error: { message: '문장이 너무 길어요' } }, 413);
    }
    body = JSON.stringify(data);
  }

  const r = await fetch(API + p, {
    method: req.method,
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body,
  });
  const h = new Headers(cors);
  h.set('Content-Type', r.headers.get('content-type') ?? 'application/json');
  h.set('Cache-Control', 'no-store');
  return new Response(r.body, { status: r.status, headers: h });
}
