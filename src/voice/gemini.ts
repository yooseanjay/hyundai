// Google Gemini (무료 키): 무슨 말이든 알아듣고 짧게 대답 + 사람 같은 목소리(Gemini TTS)
//
// 키는 코드·GitHub에 넣지 않는다.
//  - PC: .env.local의 GEMINI_API_KEY → 개발 서버가 /gemini-proxy 로 대신 호출 (브라우저에 키 노출 없음)
//  - 휴대폰: 사용자가 앱에 직접 입력한 키 → 이 기기에만 암호화(AES-256-GCM)해 저장하고 Google로 직접 호출
import { secureStorage } from '../security/secureStorage';
import { redactText } from '../security/redact';
const API = 'https://generativelanguage.googleapis.com';
const KEY_STORE = 'oca.gemini.key';
const MODEL_STORE = 'oca.gemini.model.v1';
export const TTS_MODEL = 'gemini-3.8-flash-tts';

export const GEMINI_VOICES = {
  female: [
    { id: 'Leda', label: '레다 · 앳된' },
    { id: 'Aoede', label: '아오이데 · 산뜻한' },
    { id: 'Zephyr', label: '제퍼 · 밝은' },
    { id: 'Achernar', label: '아케르나 · 부드러운' },
  ],
  male: [
    { id: 'Puck', label: '퍽 · 경쾌한' },
    { id: 'Fenrir', label: '펜리르 · 신난' },
    { id: 'Achird', label: '아키르드 · 다정한' },
    { id: 'Charon', label: '카론 · 차분한' },
  ],
} as const;

export function getUserKey() {
  try { return secureStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; }
}
export function setUserKey(k: string) {
  try {
    if (k) secureStorage.setItem(KEY_STORE, k.trim());
    else secureStorage.removeItem(KEY_STORE);
    secureStorage.removeItem(MODEL_STORE);
  } catch { /* 무시 */ }
  route = null;
}

/** url(path): Gemini 경로(/v1beta/...)를 실제 호출 주소로 바꿈 */
type Route = { kind: 'server' | 'device'; url: (path: string) => string; headers: Record<string, string> } | null;
let route: Route | Promise<Route> | null = null;

// GitHub Pages 등 다른 주소에서 쓸 Vercel 서버 주소 (공개 주소라 비밀 아님)
const REMOTE = (import.meta.env.VITE_GEMINI_SERVER as string | undefined) ?? '';

async function enabled(statusUrl: string) {
  try {
    const r = await fetch(statusUrl);
    return r.ok && !!(await r.json()).enabled;
  } catch {
    return false;
  }
}

/** 호출 경로: PC 서버 중계 → Vercel 서버(같은 주소 또는 REMOTE) → 이 기기에 입력한 키 (키가 브라우저에 없는 순서) */
async function getRoute(): Promise<Route> {
  if (route) return route;
  route = (async (): Promise<Route> => {
    const base = import.meta.env.BASE_URL;
    if (import.meta.env.DEV && (await enabled(`${base}gemini-proxy/status`))) {
      return { kind: 'server', url: (p) => `${base}gemini-proxy${p}`, headers: {} };
    }
    for (const host of [`${location.origin}`, REMOTE].filter(Boolean)) {
      if (await enabled(`${host}/api/gemini?p=status`)) {
        return { kind: 'server', url: (p) => `${host}/api/gemini?p=${encodeURIComponent(p)}`, headers: {} };
      }
    }
    const k = getUserKey();
    return k ? { kind: 'device', url: (p) => API + p, headers: { 'x-goog-api-key': k } } : null;
  })();
  return route;
}

export async function geminiSource(): Promise<'server' | 'device' | null> {
  const r = await getRoute();
  return r ? r.kind : null;
}

async function call(path: string, body?: unknown) {
  const r = await getRoute();
  if (!r) throw new Error('Gemini 키가 없어요');
  const res = await fetch(r.url(path), {
    method: body ? 'POST' : 'GET',
    headers: { ...r.headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json?.error?.message ?? (typeof json?.error === 'string' ? json.error : '')) || `HTTP ${res.status}`;
    throw new Error(res.status === 429 ? '무료 사용량을 잠시 다 썼어요. 조금 뒤에 다시 시도해 주세요.' : res.status === 400 && /API key/i.test(msg) ? 'Gemini 키가 올바르지 않아요.' : msg);
  }
  return json;
}

/** 대화용 모델 자동 선택: 무료로 쓸 수 있는 가장 최신 Flash-Lite(빠름) → 없으면 Flash */
async function chatModel(): Promise<string> {
  try {
    const saved = secureStorage.getItem(MODEL_STORE);
    if (saved) return saved;
  } catch { /* 무시 */ }
  const list: { name: string; supportedGenerationMethods?: string[] }[] = (await call('/v1beta/models?pageSize=200')).models ?? [];
  const all = list
    .map((m) => ({ id: m.name.replace('models/', ''), gen: m.supportedGenerationMethods ?? [] }))
    .filter((m) => m.gen.includes('generateContent') && /^gemini-\d/.test(m.id) && !/tts|image|audio|live|embed|exp|thinking|robotics|computer/.test(m.id));
  const stable = all.filter((m) => !/preview/.test(m.id));
  const ok = stable.length ? stable : all; // 정식 모델이 없으면 미리보기 모델이라도
  const ver = (id: string) => parseFloat(id.replace('gemini-', '')) || 0;
  const pick = (re: RegExp) => ok.filter((m) => re.test(m.id)).sort((a, b) => ver(b.id) - ver(a.id))[0]?.id;
  const id = pick(/flash-lite/) ?? pick(/flash/) ?? ok[0]?.id;
  if (!id) throw new Error('쓸 수 있는 Gemini 모델이 없어요');
  try { secureStorage.setItem(MODEL_STORE, id); } catch { /* 무시 */ }
  return id;
}

export interface Turn { role: 'user' | 'model'; text: string }

/** 무슨 말이든 짧게 대답 (1~2문장, 차 캐릭터 말투) */
export async function chatReply(carContext: string, history: Turn[], userText: string): Promise<string> {
  const model = await chatModel();
  // 개인정보 가리기: 차 상태 요약·대화 기록·이번 질문 모두 (전화번호·주민번호·차량번호·정밀 좌표 등)
  const system = [
    redactText(carContext),
    '규칙:',
    '- 너는 사용자의 자동차 캐릭터다. 자신을 "저"라고 부르고, 사용자는 "주인님" 대신 그냥 다정하게 대한다.',
    '- 말투: 항상 "~요"로 끝나는 귀엽고 다정한 존댓말. 반말 금지. 문장 끝에 마침표·물음표·느낌표를 붙인다.',
    '- 무조건 짧게: 1~2문장, 40자 안팎. 설명·목록·숫자 나열·이모지 금지. 소리 내어 읽기 좋게.',
    '- 일상 대화가 목적이다. 차 상태는 사용자가 물어보거나 꼭 필요할 때만 한마디로 언급한다.',
    '- 모르는 사실(실시간 뉴스, 길 안내 등)은 지어내지 말고 가볍게 넘긴다.',
    '- 운전 중일 수 있으니 길게 말 걸지 않는다.',
  ].join('\n');
  const json = await call(`/v1beta/models/${model}:generateContent`, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [...history.slice(-8), { role: 'user', text: userText }].map((t) => ({ role: t.role, parts: [{ text: redactText(t.text) }] })),
    generationConfig: { temperature: 0.9, maxOutputTokens: 120 },
  });
  const text: string = (json.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
  if (!text) throw new Error('대답이 비어 있어요');
  return text.replace(/[\p{Extended_Pictographic}‍️]/gu, '').replace(/\s+/g, ' ').trim();
}

const STYLE: Record<string, string> = {
  happy: 'cheerful, warm and friendly, like a cute young character, natural Korean conversation',
  excited: 'excited and bubbly, playful, natural Korean conversation',
  calm: 'gentle, relaxed and friendly, natural Korean conversation',
  hungry: 'a little whiny and hungry, cute, natural Korean conversation',
  sick: 'a bit weak and sad but sweet, natural Korean conversation',
  tired: 'sleepy and tired, soft, natural Korean conversation',
  sleepy: 'very sleepy, yawning softly, whispering, natural Korean conversation',
};

/** 사람 같은 목소리, 스트리밍: 음성 조각이 오는 대로 onPcm으로 넘김 (16비트 PCM, 24kHz) */
export async function geminiSpeechStream(text: string, voice: string, mood: string, onPcm: (bytes: Uint8Array) => void): Promise<void> {
  const r = await getRoute();
  if (!r) throw new Error('Gemini 키가 없어요');
  const res = await fetch(r.url('/v1beta/interactions'), {
    method: 'POST',
    headers: { ...r.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE[mood] ?? STYLE.calm }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
      stream: true,
    }),
  });
  if (!res.ok || !res.body) throw new Error(res.status === 429 ? '무료 사용량을 잠시 다 썼어요.' : `목소리 오류 (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      let ev: any;
      try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.event_type === 'step.delta' && ev.delta?.type === 'audio' && ev.delta.data) {
        const bin = atob(ev.delta.data);
        const out = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
        got += out.length;
        onPcm(out);
      }
    }
  }
  if (!got) throw new Error('목소리를 받지 못했어요');
}

/** 사람 같은 목소리 → WAV(ArrayBuffer) */
export async function geminiSpeech(text: string, voice: string, mood: string): Promise<ArrayBuffer> {
  const json = await call('/v1beta/interactions', {
    model: TTS_MODEL,
    input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE[mood] ?? STYLE.calm }] }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice }] },
  });
  const audio = (json.steps ?? [])
    .filter((s: any) => s.type === 'model_output')
    .flatMap((s: any) => s.content ?? [])
    .filter((c: any) => c.type === 'audio')
    .pop();
  if (!audio?.data) throw new Error('목소리를 받지 못했어요');
  const bin = atob(audio.data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// ---------------- 여행지 추천 (Google 검색으로 실제 장소 확인) ----------------
export interface TripIdea {
  name: string;
  area: string;
  distanceKm: number;
  driveMin: number;
  why: string;
  tag: string;
}

/** 현재 위치·주행 가능 거리·시간·분위기에 맞는 여행지 3곳 */
export async function recommendTrips(opts: { place: string; lat: number; lng: number; maxKm: number; hours: string; mood: string; car: string; weather: string }): Promise<TripIdea[]> {
  const model = await chatModel();
  const prompt = [
    `현재 위치: ${opts.place} (위도 ${opts.lat.toFixed(3)}, 경도 ${opts.lng.toFixed(3)})`,
    `차: ${opts.car}, 왕복을 생각해 편도 ${Math.round(opts.maxKm)}km 이내만 추천.`,
    `여행 시간: ${opts.hours}, 원하는 분위기: ${opts.mood}, 지금 날씨: ${opts.weather}`,
    '대한민국에 실제로 있는 장소만 3곳 추천해. 확실하지 않으면 추천하지 마.',
    '출력은 JSON 배열만 (설명·코드블록 없이):',
    '[{"name":"장소 이름(지도 검색되는 정확한 이름)","area":"시/군 구/읍면","distanceKm":숫자,"driveMin":숫자,"why":"추천 이유 한 문장(30자 안팎, ~요체)","tag":"바다|산|카페|맛집|야경|공원|문화|드라이브 중 하나"}]',
  ].join('\n');
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 900 },
  };
  let json: any;
  try {
    json = await call(`/v1beta/models/${model}:generateContent`, body);
  } catch {
    // 검색 도구를 못 쓰는 모델이면 검색 없이
    json = await call(`/v1beta/models/${model}:generateContent`, { ...body, tools: undefined });
  }
  const text: string = (json.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('추천을 읽지 못했어요');
  const list: TripIdea[] = JSON.parse(m[0]);
  return list
    .filter((x) => x && x.name)
    .slice(0, 3)
    .map((x) => ({ ...x, distanceKm: Math.round(Number(x.distanceKm) || 0), driveMin: Math.round(Number(x.driveMin) || 0), why: String(x.why ?? '').replace(/[\p{Extended_Pictographic}‍️]/gu, '') }));
}
