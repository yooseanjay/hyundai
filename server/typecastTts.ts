// Typecast 아이 목소리 TTS 중계 (Vite 개발 서버 안에서 동작)
//  - API 키는 서버(.env.local의 TYPECAST_API_KEY)에만 있고 브라우저로 나가지 않는다.
//  - 같은 문장·같은 기분은 .tts-cache/에 저장해 다시 쓰므로 무료 크레딧(월 1.5만 자)을 아낀다.
//  - 하루 요청 수 제한(TTS_DAILY_LIMIT, 기본 200)을 넘으면 앱은 브라우저 목소리로 자동 전환.
//
//  GET  /tts/status → { enabled, voice }
//  POST /tts        → { text, mood } 를 받아 mp3 반환
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const API = 'https://api.typecast.ai';
const MODEL = 'ssfm-v30';

/** 캐릭터 기분 → Typecast 감정 */
const EMOTION: Record<string, { preset: string; intensity: number; tempo: number }> = {
  happy: { preset: 'happy', intensity: 1.2, tempo: 1.05 },
  excited: { preset: 'toneup', intensity: 1.4, tempo: 1.1 },
  calm: { preset: 'normal', intensity: 1, tempo: 1 },
  hungry: { preset: 'sad', intensity: 0.8, tempo: 0.95 },
  sick: { preset: 'sad', intensity: 1.1, tempo: 0.92 },
  tired: { preset: 'tonedown', intensity: 1, tempo: 0.9 },
  sleepy: { preset: 'whisper', intensity: 1, tempo: 0.88 },
};

interface Options {
  apiKey: string;
  voiceId?: string;
  dailyLimit: number;
  root: string;
}

export function typecastTts(opts: Options): Plugin {
  const cacheDir = resolve(opts.root, '.tts-cache'); // .gitignore 처리됨
  let voice: { id: string; name: string } | null = opts.voiceId ? { id: opts.voiceId, name: opts.voiceId } : null;
  let day = '';
  let used = 0;

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<any>((ok) => {
      let s = '';
      req.on('data', (c) => (s += c));
      req.on('end', () => {
        try {
          ok(JSON.parse(s || '{}'));
        } catch {
          ok({});
        }
      });
    });

  /** 키만 있고 목소리 ID가 없으면 '아이(child)' 한국어 목소리를 자동으로 고른다 */
  async function ensureVoice() {
    if (voice) return voice;
    const r = await fetch(`${API}/v3/voices?model=${MODEL}&age=child`, { headers: { 'X-API-KEY': opts.apiKey } });
    if (!r.ok) throw new Error(`목소리 목록 실패 HTTP ${r.status}`);
    const list: any[] = await r.json();
    const v = list.find((x) => x.voice_name?.kor && x.gender === 'female') ?? list.find((x) => x.voice_name?.kor) ?? list[0];
    if (!v) throw new Error('아이 목소리를 찾지 못했어요 (TYPECAST_VOICE_ID를 직접 넣어 주세요)');
    voice = { id: v.voice_id, name: v.voice_name?.kor ?? v.voice_name?.eng ?? v.voice_id };
    console.log(`[typecast] 아이 목소리 선택: ${voice.name} (${voice.id})`);
    return voice;
  }

  return {
    name: 'typecast-tts',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/tts/status') {
          return json(res, 200, { enabled: !!opts.apiKey, voice: voice?.name ?? null });
        }
        if (url.pathname !== '/tts' || req.method !== 'POST') return next();
        if (!opts.apiKey) return json(res, 503, { error: 'TYPECAST_API_KEY 없음' });

        try {
          const { text, mood } = await readBody(req);
          const t = String(text ?? '').trim().slice(0, 300);
          if (!t) return json(res, 400, { error: 'text 없음' });
          const v = await ensureVoice();
          const emo = EMOTION[mood] ?? EMOTION.calm;

          // 캐시: 같은 목소리·문장·기분이면 크레딧을 쓰지 않음
          const key = createHash('sha1').update(`${v.id}|${MODEL}|${emo.preset}|${t}`).digest('hex');
          const file = join(cacheDir, `${key}.mp3`);
          if (existsSync(file)) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('X-TTS-Cache', 'hit');
            return res.end(readFileSync(file));
          }

          const today = new Date().toDateString();
          if (today !== day) { day = today; used = 0; }
          if (used >= opts.dailyLimit) return json(res, 429, { error: '오늘 사용량 초과 — 브라우저 목소리로 대체' });
          used++;

          const r = await fetch(`${API}/v1/text-to-speech`, {
            method: 'POST',
            headers: { 'X-API-KEY': opts.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              voice_id: v.id,
              text: t,
              model: MODEL,
              language: 'kor',
              prompt: { emotion_type: 'preset', emotion_preset: emo.preset, emotion_intensity: emo.intensity },
              output: { audio_format: 'mp3', audio_tempo: emo.tempo, remove_silence_ms: 200 },
            }),
          });
          if (!r.ok) {
            const msg = (await r.text()).slice(0, 200);
            console.warn(`[typecast] HTTP ${r.status}: ${msg}`);
            return json(res, r.status, { error: msg });
          }
          const buf = Buffer.from(await r.arrayBuffer());
          mkdirSync(cacheDir, { recursive: true });
          writeFileSync(file, buf);
          console.log(`[typecast] 생성 ${t.length}자 (오늘 ${used}/${opts.dailyLimit}회)`);
          res.setHeader('Content-Type', 'audio/mpeg');
          res.end(buf);
        } catch (e) {
          console.warn('[typecast]', (e as Error).message);
          json(res, 502, { error: (e as Error).message });
        }
      });
    },
  };
}
