// 호출어: 화면을 누르지 않아도 "현대" 라고 부르면 음성 대화가 켜진다
//  - 브라우저 음성 인식(Web Speech API)을 계속 켜 두고, 들린 말에 "현대" 가 있으면 알려 줌
//  - "현대, 날씨 어때?" 처럼 이어서 말하면 그 말도 같이 넘겨 줌
//  - 대화 중(봇이 듣거나 말할 때)에는 잠시 멈춤 → 끝나면 다시 들음
//  - 크롬 등은 인식한 소리를 브라우저 음성 서비스로 보냄 (설정에서 끌 수 있음)

/* eslint-disable @typescript-eslint/no-explicit-any */
const SR: any = typeof window !== 'undefined' && window.isSecureContext ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

export const wakeSupported = () => !!SR;

/** 호출어로 알아듣는 말 (음성 인식이 조금 다르게 적어도) */
const WAKE = /(현대|헌대|현데|형대|hyundai|휸다이)/i;

/** 들린 말에서 호출어를 찾아 뒤에 이어진 말을 돌려줌. 호출어가 없으면 null */
export function afterWake(text: string): string | null {
  const m = WAKE.exec(text);
  if (!m) return null;
  return text
    .slice(m.index + m[0].length)
    .replace(/^\s*(야|아|님|씨|자동차|차)?[\s,.!?~]*/, '')
    .trim();
}

const PREF = 'wake-word';
export const wakePref = () => { try { return localStorage.getItem(PREF) !== '0'; } catch { return true; } };
export const setWakePref = (on: boolean) => {
  try { localStorage.setItem(PREF, on ? '1' : '0'); } catch { /* 괜찮음 */ }
  window.dispatchEvent(new Event('wake-pref'));
};

export type WakeState = 'off' | 'listening' | 'paused' | 'blocked' | 'unsupported';

/**
 * 계속 듣다가 호출어가 들리면 onWake(이어진 말).
 * 인식은 몇 초~1분마다 저절로 끝나므로 끝나면 다시 시작한다.
 */
export class WakeWord {
  private rec: any = null;
  private want = false;
  private retry = 0;
  private timer = 0;
  private fired = false;
  private ended: (() => void) | null = null;
  constructor(private onWake: (rest: string) => void, private onState: (s: WakeState) => void) {}

  start() {
    if (!SR) { this.onState('unsupported'); return; }
    if (this.want) return;
    this.want = true;
    this.run();
  }

  /** 멈춤 (마이크를 다른 곳에서 쓰기 전). 완전히 끝나면 resolve */
  stop(state: WakeState = 'paused'): Promise<void> {
    this.want = false;
    window.clearTimeout(this.timer);
    this.onState(state);
    const r = this.rec;
    if (!r) return Promise.resolve();
    return new Promise((ok) => {
      const done = () => { this.ended = null; ok(); };
      this.ended = done;
      try { r.abort(); } catch { done(); }
      window.setTimeout(() => { if (this.ended === done) done(); }, 600);
    });
  }

  private run() {
    if (!this.want) return;
    const rec = new SR();
    this.rec = rec;
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    this.fired = false;
    let waitFinal = 0;
    rec.onstart = () => { this.retry = 0; this.onState('listening'); };
    rec.onresult = (e: any) => {
      if (this.fired) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alts: string[] = Array.from(res as ArrayLike<any>).map((a: any) => String(a.transcript ?? ''));
        const hit = alts.find((t) => afterWake(t) !== null);
        if (hit == null) continue;
        const rest = afterWake(hit) ?? '';
        if (res.isFinal) return this.fire(rest);
        // 호출어만 들리고 말이 이어지는 중: 끝날 때까지 조금 기다림 (최대 2.5초)
        window.clearTimeout(waitFinal);
        waitFinal = window.setTimeout(() => this.fire(rest), 2500);
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.want = false;
        this.onState('blocked');
      }
    };
    rec.onend = () => {
      window.clearTimeout(waitFinal);
      this.rec = null;
      this.ended?.();
      if (!this.want) return;
      // 저절로 끝나면 다시 (연속으로 실패하면 조금씩 천천히)
      this.retry = Math.min(this.retry + 1, 6);
      this.timer = window.setTimeout(() => this.run(), this.retry > 2 ? 1500 * this.retry : 250);
    };
    try { rec.start(); } catch { this.timer = window.setTimeout(() => this.run(), 1500); }
  }

  private fire(rest: string) {
    if (this.fired) return;
    this.fired = true;
    void this.stop('paused').then(() => this.onWake(rest));
  }
}

// ───────── 화면 여러 곳에서 같이 쓰기: 하나라도 마이크를 쓰는 중이면 호출어 듣기를 멈춤 ─────────
let current: WakeWord | null = null;
const busy = new Set<string>();
let resumeTimer = 0;

/** 호출어 듣기를 맡을 하나 (없으면 null) */
export function setWakeInstance(w: WakeWord | null) {
  current = w;
  if (w && busy.size === 0) w.start();
}

/** id 쪽에서 마이크 · 스피커를 쓰는 중인지 알려 줌 */
export function setVoiceBusy(id: string, on: boolean): Promise<void> {
  window.clearTimeout(resumeTimer);
  if (on) busy.add(id);
  else busy.delete(id);
  if (busy.size > 0) return current?.stop('paused') ?? Promise.resolve();
  // 대화가 끝나면 조금 있다가 다시 듣기 (봇 목소리 끝자락을 호출어로 오해하지 않게)
  resumeTimer = window.setTimeout(() => current?.start(), 900);
  return Promise.resolve();
}

/** 다른 곳에서 마이크를 바로 쓰기 전: 잠깐 멈춤 (대화가 시작되지 않으면 몇 초 뒤 다시 들음) */
export function pauseWakeBriefly(): Promise<void> {
  window.clearTimeout(resumeTimer);
  const p = current?.stop('paused') ?? Promise.resolve();
  resumeTimer = window.setTimeout(() => { if (busy.size === 0) current?.start(); }, 6000);
  return p;
}
