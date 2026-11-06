// 캐릭터 꾸미기: 눈 모양 · 얼굴 빛 색 · 볼터치 · 차 색 (기기에 저장)
import { secureStorage } from '../security/secureStorage';
import type { BodyColor } from '../data/hyundaiModels';

export type EyeStyle = 'classic' | 'round' | 'sparkle' | 'dot';
export type GlowColor = 'white' | 'blue' | 'mint' | 'pink' | 'yellow';

export interface CharStyle {
  eye: EyeStyle;
  glow: GlowColor;
  blush: boolean;
  /** 실제 차 연결 모드에서도 바꿀 수 있는 차 색 (없으면 차종 기본 색) */
  color?: BodyColor;
}

export const EYES: { id: EyeStyle; name: string }[] = [
  { id: 'classic', name: '웃는 눈' },
  { id: 'round', name: '동글 눈' },
  { id: 'sparkle', name: '반짝 눈' },
  { id: 'dot', name: '콩 눈' },
];

export const GLOWS: { id: GlowColor; name: string; hex: string }[] = [
  { id: 'white', name: '화이트', hex: '#ffffff' },
  { id: 'blue', name: '블루', hex: '#7cc0ff' },
  { id: 'mint', name: '민트', hex: '#8ff5d6' },
  { id: 'pink', name: '핑크', hex: '#ffa6d1' },
  { id: 'yellow', name: '옐로', hex: '#ffe27a' },
];

export const DEFAULT_STYLE: CharStyle = { eye: 'classic', glow: 'white', blush: false };
const KEY = 'oca.style.v1';

export function loadStyle(): CharStyle {
  try {
    const raw = secureStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_STYLE, ...JSON.parse(raw) };
  } catch { /* 기본값 */ }
  return DEFAULT_STYLE;
}

export function saveStyle(s: CharStyle) {
  try { secureStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 무시 */ }
}

export const glowHex = (g: GlowColor) => GLOWS.find((x) => x.id === g)?.hex ?? '#fff';

/** 실제 칠할 색: 고른 색 → 없으면 차종 기본 색을 흑백 톤으로 (첫 화면은 프리미엄 무채색) */
export const colorOf = (s: CharStyle, base: BodyColor): BodyColor =>
  s.color ?? (['white', 'gray', 'black', 'beige', 'silver'].includes(base) ? base : 'silver');
