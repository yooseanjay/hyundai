// 목소리 설정 (이 기기에만 저장)
import type { VoiceId } from './voiceList';

export interface VoicePrefs {
  engine: 'browser' | 'ai' | 'gemini';
  voice: VoiceId; // 오프라인 음성 AI (Supertonic)
  gVoice?: string; // Gemini 목소리
}

const KEY = 'oca.voice.v1';
export function loadVoicePrefs(): VoicePrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (v && ['ai', 'browser', 'gemini'].includes(v.engine)) return { gVoice: 'Leda', ...v };
  } catch { /* 기본값 */ }
  return { engine: 'browser', voice: 'F1', gVoice: 'Leda' };
}
export function saveVoicePrefs(p: VoicePrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 무시 */ }
}
