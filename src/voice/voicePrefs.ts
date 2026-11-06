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
    // 목소리는 Gemini만 사용 (예전 '기본'·'오프라인 AI' 설정은 Gemini로 자동 전환)
    if (v && typeof v === 'object') return { ...v, engine: 'gemini', gVoice: v.gVoice ?? 'Leda' };
  } catch { /* 기본값 */ }
  return { engine: 'gemini', voice: 'F1', gVoice: 'Leda' };
}
export function saveVoicePrefs(p: VoicePrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 무시 */ }
}
