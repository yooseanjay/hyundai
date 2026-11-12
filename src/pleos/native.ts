// Pleos Connect 차 앱(안드로이드) 안에서 열렸을 때: 차와 웹 앱을 잇는 다리
//  - 안드로이드 앱(android/)이 이 사이트를 WebView로 열고, 'pleosNative' 통로를 우리 주소에만 열어 줌
//    (androidx.webkit addWebMessageListener: 허용한 출처에서만 보임 → 다른 사이트는 차에 접근 불가)
//  - 차 → 웹: 차량 SDK 값 { 'EvBattery.getCurrentEvBatteryStateOfCharge': 80, ... }
//  - 웹 → 차: 말하기(TTS) · 듣기(STT). 듣기는 Pleos SpeechToText SDK(차 안 On-device 인식)만 씀
//    → 차량 마이크 음성은 외부 음성 인식 서비스로 나가지 않음 (Gemini에는 인식된 글자만 보냄)
//  - 브라우저(휴대폰 · PC)에서는 아무것도 하지 않음

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { VehicleSnapshot } from '../api/types';

interface NativePort { postMessage(msg: string): void; onmessage: ((e: { data: string }) => void) | null }

export type NativeMsg =
  | { type: 'caps'; vehicle: boolean; stt: boolean; tts: boolean; engine: string; app: string }
  | { type: 'vehicle'; values: Record<string, unknown> }
  | { type: 'stt'; event: 'start' | 'partial' | 'final' | 'end' | 'error'; text?: string; error?: string }
  | { type: 'tts'; event: 'start' | 'end'; id: string };

const port = (): NativePort | null => {
  if (typeof window === 'undefined') return null;
  const p = (window as any).pleosNative;
  return p && typeof p.postMessage === 'function' ? (p as NativePort) : null;
};

export const inPleosApp = () => !!port();

const listeners = new Set<(m: NativeMsg) => void>();
let caps: Extract<NativeMsg, { type: 'caps' }> | null = null;
let vehicleValues: Record<string, unknown> = {};

export const nativeCaps = () => caps;
export const vehicleNow = () => vehicleValues;
export function onNative(fn: (m: NativeMsg) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function sendNative(msg: Record<string, unknown>) { try { port()?.postMessage(JSON.stringify(msg)); } catch { /* 앱 밖 */ } }

/** 안드로이드에서 온 메시지 (테스트에서도 부름) */
export function receiveNative(raw: string) {
  let m: NativeMsg;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object' || !('type' in m)) return;
  if (m.type === 'caps') caps = m;
  if (m.type === 'vehicle') vehicleValues = { ...vehicleValues, ...m.values };
  listeners.forEach((f) => f(m));
}

// ───────── 차량 SDK 값 → 앱의 차량 상태 ─────────
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null);

/** 이름에 이 말이 들어간 첫 값 (SDK 버전마다 함수 이름이 조금씩 달라서 이름 일부로 찾음) */
function pick<T>(values: Record<string, unknown>, conv: (v: unknown) => T | null, ...patterns: RegExp[]): T | null {
  for (const re of patterns) {
    for (const [k, v] of Object.entries(values)) {
      if (!re.test(k)) continue;
      const c = conv(v);
      if (c !== null) return c;
    }
  }
  return null;
}

/** 차량 SDK 값에서 앱이 쓰는 값만 골라 냄 (없는 값은 그대로 둠) */
export function snapshotFromVehicle(values: Record<string, unknown>, ev: boolean): Partial<VehicleSnapshot> {
  const out: Partial<VehicleSnapshot> = {};
  const level = ev
    ? pick(values, num, /EvBattery\..*StateOfCharge/i, /EvBattery\..*(BatteryLevel|Soc\b)/i)
    : pick(values, num, /Fuel\..*FuelLevel(Percent|Pct)?$/i, /Fuel\..*Level/i);
  if (level !== null) out.fuelLevelPct = Math.max(0, Math.min(100, level <= 1 && level > 0 && !Number.isInteger(level) ? level * 100 : level));
  const range = pick(values, num, /RangeRemaining/i, /^(EvBattery|Fuel|Odometer)\..*(DistanceToEmpty|DriveableDistance|Range)/i);
  if (range !== null) out.dteKm = Math.round(range > 2000 ? range / 1000 : range); // m로 오면 km로
  const odo = pick(values, num, /Odometer\..*(Odometer|TotalDistance|Mileage)/i);
  if (odo !== null) out.odometerKm = Math.round(odo > 5_000_000 ? odo / 1000 : odo);
  const charging = pick(values, bool, /EvBattery\..*Charging(State|Status)?$/i, /EvBattery\..*IsCharging/i);
  if (charging !== null) out.charging = charging;
  const plugged = pick(values, bool, /EvBattery\..*(ChargePortConnected|PlugIn|Plugged)/i);
  if (plugged !== null) out.pluggedIn = plugged;
  if (Object.keys(out).length) out.updatedAt = new Date().toISOString();
  return out;
}

// ───────── 음성: 브라우저 음성 API 모양 그대로 흉내 → 앱 코드는 그대로 ─────────
let sttOwner: NativeRecognition | null = null;

/** window.SpeechRecognition 자리에 꽂는 차 음성 인식 */
export class NativeRecognition {
  lang = 'ko-KR';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  private finals: string[] = [];
  private live = false;

  start() {
    if (this.live) throw new Error('InvalidStateError');
    if (sttOwner && sttOwner !== this) sttOwner.finish('aborted');
    sttOwner = this;
    this.live = true;
    this.finals = [];
    sendNative({ type: 'listen', lang: this.lang, continuous: this.continuous, partial: this.interimResults });
  }
  stop() { if (this.live) sendNative({ type: 'listen-stop' }); }
  abort() { if (this.live) { sendNative({ type: 'listen-stop' }); this.finish('aborted'); } }

  /** @internal */
  handle(m: Extract<NativeMsg, { type: 'stt' }>) {
    if (!this.live) return;
    if (m.event === 'start') this.onstart?.();
    else if (m.event === 'partial' || m.event === 'final') {
      const isFinal = m.event === 'final';
      const text = m.text ?? '';
      const list = [...this.finals, text].map((t, i, a) => {
        const r: any = [{ transcript: t, confidence: 1 }];
        r.isFinal = i < a.length - 1 || isFinal;
        return r;
      });
      if (isFinal) this.finals.push(text);
      this.onresult?.({ resultIndex: list.length - 1, results: list });
      if (isFinal && !this.continuous) this.finish();
    } else if (m.event === 'error') this.finish(m.error ?? 'network');
    else if (m.event === 'end') this.finish();
  }

  private finish(error?: string) {
    if (!this.live) return;
    this.live = false;
    if (sttOwner === this) sttOwner = null;
    if (error) this.onerror?.({ error });
    this.onend?.();
  }
}

/** speechSynthesis 자리에 꽂는 차 음성 출력 */
class NativeUtterance {
  lang = 'ko-KR'; pitch = 1; rate = 1; volume = 1; voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public text = '') {}
}
const speaking = new Map<string, NativeUtterance>();
let ttsSeq = 0;
const nativeSynth = {
  get speaking() { return speaking.size > 0; },
  pending: false,
  paused: false,
  speak(u: NativeUtterance) {
    const id = `t${++ttsSeq}`;
    speaking.set(id, u);
    sendNative({ type: 'speak', id, text: u.text, lang: u.lang, pitch: u.pitch, rate: u.rate });
  },
  cancel() {
    const all = [...speaking.values()];
    speaking.clear();
    sendNative({ type: 'speak-stop' });
    all.forEach((u) => u.onend?.());
  },
  getVoices: () => [] as unknown[],
  pause() {}, resume() {},
  addEventListener() {}, removeEventListener() {},
};

let installed = false;
/** 차 앱 안이면 통로를 열고, 음성 API가 없을 때 차 음성으로 채움. main.tsx 맨 처음에 부름 */
export function installPleosNative(): boolean {
  const p = port();
  if (!p || installed) return !!p;
  installed = true;
  p.onmessage = (e) => receiveNative(String(e.data));
  onNative((m) => {
    if (m.type === 'stt') sttOwner?.handle(m);
    if (m.type === 'tts') {
      const u = speaking.get(m.id);
      if (!u) return;
      if (m.event === 'start') u.onstart?.();
      else { speaking.delete(m.id); u.onend?.(); }
    }
  });
  const w = window as any;
  // 차 안에서는 음성 인식을 항상 차 음성(Pleos SpeechToText SDK)으로: 브라우저 음성 인식은 외부 서버로 보낼 수 있어 덮어씀
  w.SpeechRecognition = NativeRecognition;
  w.webkitSpeechRecognition = NativeRecognition;
  if (!('speechSynthesis' in w)) { w.speechSynthesis = nativeSynth; w.SpeechSynthesisUtterance = NativeUtterance; }
  document.documentElement.classList.add('pleos-app');
  sendNative({ type: 'hello' });
  return true;
}
