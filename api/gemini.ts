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

import { guard } from './_lib/http';

const API = 'https://generativelanguage.googleapis.com';
const ALLOWED_PATH = /^\/v1beta\/(models(\?[\w=&]*)?$|models\/gemini-[\w.-]+:generateContent$|interactions$)/;
const MAX_BODY = 24_000;
const MAX_TTS_CHARS = 300;
const MAX_OUTPUT_TOKENS = 1000; // 대화는 앱이 120으로 요청, 여행지 추천은 900

export default async function handler(req: Request): Promise<Response> {
  // 보안 1단계 공통 관문: 출처 허용 목록 · 메서드 · 본문 크기 · IP별 횟수
  //   돈이 드는 AI 호출은 1분 12회, 키 유무만 알려 주는 상태 확인은 따로 1분 60회
  const p = new URL(req.url).searchParams.get('p') ?? '';
  const isStatus = p === 'status';
  const ctx = guard(req, { methods: ['GET', 'POST'], perMinute: isStatus ? 60 : 12, maxBody: MAX_BODY, bucket: isStatus ? 'status' : 'ai' });
  if (ctx instanceof Response) return ctx;
  const { json, headers: cors } = ctx;

  const key = process.env.GEMINI_API_KEY ?? '';
  if (isStatus) return json({ enabled: !!key }, 200);
  if (!key) return json({ error: { message: '서버에 키가 아직 없어요' } }, 503);
  if (!ALLOWED_PATH.test(p)) return json({ error: { message: '허용되지 않은 경로' } }, 403);

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
