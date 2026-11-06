// Vercel 서버 함수: Gemini Live API용 1회용 임시 토큰 발급
// - 실제 키(GEMINI_API_KEY)는 서버에만 있고, 브라우저에는 짧게 쓰고 버리는 토큰만 전달
// - 토큰은 1회 사용 · 1분 안에 연결 시작 · 30분 뒤 만료
// - 모델 · 목소리 · 캐릭터 설정(시스템 지시)이 토큰에 고정됨 → 다른 용도로 못 씀
export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

import { guard } from './_lib/http';
import { redactText } from '../src/security/redact';

export const LIVE_MODEL = 'gemini-3.8-live';

// 앱이 실행하는 도구 (src/voice/actions.ts 의 LIVE_TOOLS 와 같은 내용)
const LIVE_TOOLS = [{
  functionDeclarations: [
    { name: 'recommend_places', description: '사용자가 여행지·드라이브 코스·갈 만한 곳 추천을 원할 때. 현재 위치와 주행 가능 거리 안에서 실제 장소 3곳을 찾아 화면에 지도 버튼과 함께 보여 준다.',
      parameters: { type: 'OBJECT', properties: { mood: { type: 'STRING', description: '바다, 산, 카페, 맛집, 야경, 공원, 드라이브 중 하나' }, hours: { type: 'STRING', description: '1시간, 반나절, 하루 중 하나' } } } },
    { name: 'find_nearby', description: '주변 충전소·주유소·세차장·주차장·카페·정비소를 찾아 달라고 할 때. 화면에 지도 검색 버튼을 띄운다.',
      parameters: { type: 'OBJECT', properties: { kind: { type: 'STRING', description: 'charger, gas, wash, parking, cafe, repair 중 하나' } }, required: ['kind'] } },
    { name: 'get_weather', description: '날씨나 오늘 운전하기 괜찮은지 물을 때.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'check_maintenance', description: '소모품(엔진오일, 타이어, 와이퍼, 필터, 브레이크액) 교체 시기를 물을 때.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'weekly_report', description: '이번 주 운전 기록, 운전 습관, 급정거 등을 물을 때.', parameters: { type: 'OBJECT', properties: {} } },
  ],
}];

export default async function handler(req: Request): Promise<Response> {
  // 보안 1단계 공통 관문: 출처 허용 목록 · POST만 · IP별 1분 6회 연결 · 본문 4KB
  const ctx = guard(req, { methods: ['POST'], perMinute: 6, maxBody: 4096 });
  if (ctx instanceof Response) return ctx;
  const { json } = ctx;
  const key = process.env.GEMINI_API_KEY ?? '';
  if (!key) return json({ error: '서버에 키가 아직 없어요' }, 503);

  // 앱이 보낸 차 상태 요약과 목소리 (길이·형식 제한)
  let carCtx = '';
  let voice = 'Leda';
  try {
    const b = await ctx.readJson<{ context?: unknown; voice?: unknown }>();
    // 프롬프트 주입·개인정보 방어: 제어 문자 제거, 길이 제한, 개인정보 가리기(서버에서 한 번 더)
    carCtx = redactText(String(b?.context ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 1500));
    if (/^[A-Z][a-z]{2,14}$/.test(String(b?.voice ?? ''))) voice = String(b.voice);
  } catch { /* 본문 없음 */ }
  const system = [
    carCtx || '너는 사용자의 자동차 캐릭터 "오닉이"다.',
    '규칙: 너는 AI 비서가 아니라 사용자의 자동차 캐릭터다. 자신을 "저"라고 부른다.',
    '항상 "~요"로 끝나는 귀엽고 다정한 한국어 존댓말로, 1~2문장만 짧게 말한다. 목록·긴 설명 금지.',
    '차 상태는 물어보거나 꼭 필요할 때만 한마디 한다. 모르는 사실은 지어내지 않는다.',
    '여행지 추천, 주변 충전소·주유소·세차장·주차장·카페·정비소 찾기, 날씨, 소모품 교체 시기, 이번 주 운전 기록은 반드시 도구를 불러서 답한다. 도구 결과는 1~2문장으로 요약하고 "화면에 띄워 드렸어요"처럼 안내한다.',
  ].join('\n');

  const now = Date.now();
  const r = await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      bidiGenerateContentSetup: {
        model: `models/${LIVE_MODEL}`,
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
        systemInstruction: { parts: [{ text: system }] },
        tools: LIVE_TOOLS,
        outputAudioTranscription: {},
        inputAudioTranscription: {},
      },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.name) return json({ error: data?.error?.message ?? `토큰 발급 실패 (HTTP ${r.status})` }, r.status === 429 ? 429 : 502);
  return json({ token: data.name, model: LIVE_MODEL }, 200);
}
