// 울림 막기: 봇 목소리가 나오는 동안 · 끝난 직후엔 마이크를 막고, 겹친 인식 결과는 한 번만
import { describe, expect, it, vi } from 'vitest';

describe('울림 막기', () => {
  it('목소리 재생 중 + 끝난 뒤 잠깐은 botSpeaking', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const g = await import('../src/voice/echoGate');
    expect(g.botSpeaking()).toBe(false);
    g.voiceStarted(); g.voiceStarted(); // 조각 두 개 예약
    expect(g.botSpeaking()).toBe(true);
    g.voiceEnded();
    expect(g.botSpeaking()).toBe(true); // 아직 하나 남음
    g.voiceEnded();
    expect(g.botSpeaking()).toBe(true); // 잔향 시간
    vi.advanceTimersByTime(700);
    expect(g.botSpeaking()).toBe(false);
    vi.useRealTimers();
  });

  it('안드로이드식 누적 결과를 한 번만', async () => {
    const { mergeTranscripts: m } = await import('../src/voice/echoGate');
    expect(m(['안녕', '안녕하세요'])).toBe('안녕하세요');
    expect(m(['날씨 어때', '날씨 어때'])).toBe('날씨 어때');
    expect(m(['현대', '날씨 알려 줘'])).toBe('현대 날씨 알려 줘');
    expect(m(['오늘', '오늘 날씨', '오늘 날씨 어때'])).toBe('오늘 날씨 어때');
  });
});
