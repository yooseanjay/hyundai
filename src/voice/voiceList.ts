// 음성 AI 목소리 목록 · 표기 (가벼운 파일: 엔진은 필요할 때 따로 불러옴)
export type VoiceId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5';
export const VOICES: { id: VoiceId; label: string }[] = [
  { id: 'F1', label: '여자 1' }, { id: 'F2', label: '여자 2' }, { id: 'F3', label: '여자 3' }, { id: 'F4', label: '여자 4' }, { id: 'F5', label: '여자 5' },
  { id: 'M1', label: '남자 1' }, { id: 'M2', label: '남자 2' }, { id: 'M3', label: '남자 3' }, { id: 'M4', label: '남자 4' }, { id: 'M5', label: '남자 5' },
];
export const MODEL_MB = 267;
export const CREDIT = 'Supertonic 2 · Supertone Inc. (OpenRAIL-M)';
