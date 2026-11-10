// 호출어: 가짜 음성 인식으로 "현대 …" 가 들리면 켜지고, 대화 중엔 쉬었다가 다시 듣는지
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeSR {
  static last: FakeSR | null = null;
  static starts = 0;
  lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
  onstart?: () => void; onresult?: (e: unknown) => void; onend?: () => void; onerror?: (e: unknown) => void;
  start() { FakeSR.last = this; FakeSR.starts++; this.onstart?.(); }
  abort() { setTimeout(() => this.onend?.(), 0); }
  stop() { this.abort(); }
  say(text: string, isFinal: boolean) {
    const res = Object.assign([{ transcript: text }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [res] });
  }
}

async function load() {
  vi.resetModules();
  (globalThis as any).window = Object.assign(globalThis, { isSecureContext: true, SpeechRecognition: FakeSR, addEventListener() {}, dispatchEvent() {} });
  return import('../src/voice/wakeWord');
}

describe('호출어 듣기', () => {
  afterEach(() => { vi.useRealTimers(); FakeSR.starts = 0; });

  it('“현대, 날씨 어때” → 뒤의 말과 함께 깨움, 대화 중엔 쉬었다가 끝나면 다시 들음', async () => {
    vi.useFakeTimers();
    const m = await load();
    const woke: string[] = [];
    const states: string[] = [];
    const w = new m.WakeWord((r) => woke.push(r), (s) => states.push(s));
    m.setWakeInstance(w);
    expect(states).toContain('listening');
    FakeSR.last!.say('현대 날씨', false);
    FakeSR.last!.say('현대 날씨 어때', true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(woke).toEqual(['날씨 어때']);
    // 대화 시작 → 쉼, 끝 → 다시 들음
    const before = FakeSR.starts;
    await m.setVoiceBusy('bot', true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(FakeSR.starts).toBe(before);
    await m.setVoiceBusy('bot', false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSR.starts).toBe(before + 1);
    // 호출어 없는 말은 무시
    FakeSR.last!.say('오늘 뭐 먹지', true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(woke).toHaveLength(1);
    const p = w.stop('off');
    await vi.advanceTimersByTimeAsync(700);
    await p;
  });

  it('“현대” 만 부르고 말이 끊기면 2.5초 뒤 듣기 시작', async () => {
    vi.useFakeTimers();
    const m = await load();
    const woke: string[] = [];
    const w = new m.WakeWord((r) => woke.push(r), () => {});
    w.start();
    FakeSR.last!.say('현대야', false);
    await vi.advanceTimersByTimeAsync(3200);
    expect(woke).toEqual(['']);
    await w.stop('off');
  });
});
