// Gemini Live API: 대답과 목소리를 한 번에 실시간으로 (WebSocket)
// - 서버(/api/live-token)가 1회용 임시 토큰을 만들어 줌 → 진짜 키는 브라우저에 오지 않음
// - 캐릭터 설정·목소리는 토큰에 고정됨
// - 글자 보내기, 또는 마이크 소리를 그대로 보내기(16kHz PCM) → 24kHz PCM 음성 + 자막을 받음

const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
// 배포 사이트·개발 PC 어디서든 쓸 토큰 서버 (공개 주소, 비밀 아님)
const REMOTE = (import.meta.env.VITE_GEMINI_SERVER as string | undefined) || 'https://our-car-alive.vercel.app';

export interface LiveHandlers {
  onAudio(pcm16: Uint8Array): void; // 24kHz 모노 16비트
  onBotText(delta: string): void; // 오닉이 말 자막 (조각)
  onUserText(delta: string): void; // 마이크로 말한 내용 자막 (조각)
  onTurnComplete(): void;
  onInterrupted(): void; // 사용자가 말을 끊음
  onClose(reason: string): void;
  /** AI가 앱 기능(도구)을 부름 → 결과를 돌려주면 그걸 보고 말함 */
  onToolCall(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

async function tokenFrom(base: string, context: string, voice: string) {
  const r = await fetch(`${base}/api/live-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context, voice }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw Object.assign(new Error(j.error ?? `토큰 실패 (HTTP ${r.status})`), { status: r.status });
  return j as { token: string; model: string };
}

async function getToken(context: string, voice: string) {
  // 같은 주소(Vercel)에 있으면 그걸, 아니면 공개 서버 주소
  try {
    if (location.origin !== REMOTE) return await tokenFrom(REMOTE, context, voice);
  } catch (e) {
    if ((e as { status?: number }).status === 429) throw e;
  }
  return tokenFrom(location.origin, context, voice);
}

const b64 = {
  decode(s: string) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
  encode(u8: Uint8Array) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  },
};

export class LiveSession {
  private ws: WebSocket | null = null;
  private mic: { stop(): void } | null = null;
  ready = false;

  constructor(private h: LiveHandlers) {}

  /** 토큰 받고 연결 (setupComplete까지 기다림) */
  async connect(context: string, voice: string) {
    const { token, model } = await getToken(context, voice);
    await new Promise<void>((ok, fail) => {
      const ws = new WebSocket(`${WS}?access_token=${encodeURIComponent(token)}`);
      this.ws = ws;
      const timer = window.setTimeout(() => fail(new Error('연결 시간 초과')), 12000);
      ws.onopen = () => ws.send(JSON.stringify({ setup: { model: `models/${model}` } }));
      ws.onmessage = async (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
        let m: any;
        try { m = JSON.parse(raw); } catch { return; }
        if (m.setupComplete) {
          window.clearTimeout(timer);
          this.ready = true;
          ok();
          return;
        }
        if (m.toolCall?.functionCalls?.length) {
          const responses = await Promise.all(
            m.toolCall.functionCalls.map(async (c: { id: string; name: string; args?: Record<string, unknown> }) => {
              try {
                return { id: c.id, name: c.name, response: { result: await this.h.onToolCall(c.name, c.args ?? {}) } };
              } catch (e) {
                return { id: c.id, name: c.name, response: { error: (e as Error).message } };
              }
            }),
          );
          if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
          return;
        }
        const sc = m.serverContent;
        if (!sc) return;
        if (sc.interrupted) this.h.onInterrupted();
        for (const p of sc.modelTurn?.parts ?? []) {
          if (p.inlineData?.data) this.h.onAudio(b64.decode(p.inlineData.data));
        }
        if (sc.outputTranscription?.text) this.h.onBotText(sc.outputTranscription.text);
        if (sc.inputTranscription?.text) this.h.onUserText(sc.inputTranscription.text);
        if (sc.turnComplete) this.h.onTurnComplete();
      };
      ws.onerror = () => {};
      ws.onclose = (e) => {
        window.clearTimeout(timer);
        const was = this.ready;
        this.ready = false;
        this.stopMic();
        if (!was) fail(new Error(`연결 실패 (${e.code}) ${e.reason ?? ''}`.trim()));
        this.h.onClose(e.reason || `code ${e.code}`);
      };
    });
  }

  /** 글자로 말 걸기 */
  sendText(text: string) {
    if (!this.ready || !this.ws) throw new Error('연결 안 됨');
    this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }));
  }

  get micOn() { return !!this.mic; }

  /** 마이크 소리를 실시간으로 보냄 (말이 끝나면 Gemini가 알아서 대답) */
  async startMic() {
    if (!this.ready || !this.ws || this.mic) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    const ac: AudioContext = new AC();
    const src = ac.createMediaStreamSource(stream);
    const proc = ac.createScriptProcessor(4096, 1, 1);
    const ratio = ac.sampleRate / 16000;
    const ws = this.ws;
    proc.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      // 16kHz로 줄이고 16비트 정수로
      const n = Math.floor(input.length / ratio);
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const v = input[Math.floor(i * ratio)];
        pcm[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
      }
      ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64.encode(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } } }));
    };
    src.connect(proc);
    proc.connect(ac.destination); // 일부 브라우저는 연결해야 동작 (출력은 무음)
    this.mic = {
      stop: () => {
        proc.disconnect();
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void ac.close();
        try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch { /* 무시 */ }
      },
    };
  }

  stopMic() {
    this.mic?.stop();
    this.mic = null;
  }

  close() {
    this.stopMic();
    this.ready = false;
    try { this.ws?.close(); } catch { /* 무시 */ }
    this.ws = null;
  }
}
