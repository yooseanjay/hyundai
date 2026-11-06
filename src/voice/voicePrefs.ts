// 목소리 설정 (이 기기에만 저장)
import type { VoiceId } from './voiceList';

export interface VoicePrefs {
  engine: 'browser' | 'ai';
  voice: VoiceId;
}

const KEY = 'oca.voice.v1';
export function loadVoicePrefs(): VoicePrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (v && (v.engine === 'ai' || v.engine === 'browser')) return v;
  } catch { /* 기본값 */ }
  return { engine: 'browser', voice: 'F1' };
}
export function saveVoicePrefs(p: VoicePrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 무시 */ }
}
