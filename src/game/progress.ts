// 성장 시스템: 경험치, 레벨, 외형 해금, 일기장 저장
import type { Trip, WarningKey } from '../api/types';
import type { DiaryEntry } from './diary';

export type CosmeticId = 'none' | 'sunglasses' | 'scarf' | 'cap' | 'flower' | 'wrench' | 'crown';

export interface Cosmetic {
  id: CosmeticId;
  name: string;
  emoji: string;
  condition: string;
  unlocked: (p: Progress) => boolean;
}

export interface Progress {
  xp: number;
  totalKm: number;
  tripCount: number;
  fixes: number;
  calmTrips: number;
  diaries: DiaryEntry[];
  equipped: CosmeticId;
  seenUnlocks: CosmeticId[];
}

export const XP_PER_LEVEL = 100;
export const levelOf = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1;

export const COSMETICS: Cosmetic[] = [
  { id: 'none', name: '기본', emoji: '🚗', condition: '처음부터', unlocked: () => true },
  { id: 'sunglasses', name: '선글라스', emoji: '🕶️', condition: 'Lv.2 달성', unlocked: (p) => levelOf(p.xp) >= 2 },
  { id: 'flower', name: '꽃 장식', emoji: '🌸', condition: '부드러운 운전 3회', unlocked: (p) => p.calmTrips >= 3 },
  { id: 'wrench', name: '정비왕 배지', emoji: '🔧', condition: '정비 3회 완료', unlocked: (p) => p.fixes >= 3 },
  { id: 'scarf', name: '리본', emoji: '🎀', condition: 'Lv.3 달성', unlocked: (p) => levelOf(p.xp) >= 3 },
  { id: 'cap', name: '드라이버 캡', emoji: '🧢', condition: '누적 300km 주행', unlocked: (p) => p.totalKm >= 300 },
  { id: 'crown', name: '왕관', emoji: '👑', condition: 'Lv.5 달성', unlocked: (p) => levelOf(p.xp) >= 5 },
];

const KEY = 'oca.progress.v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { xp: 0, totalKm: 0, tripCount: 0, fixes: 0, calmTrips: 0, diaries: [], equipped: 'none', seenUnlocks: ['none'] };
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** 주행 경험치: 거리 기반 + 안전운전 보너스 */
export function xpForTrip(t: Trip) {
  const base = Math.min(60, Math.round(t.distanceKm * 0.8));
  const safe = t.hardBrakes === 0 ? 15 : t.hardBrakes <= 2 ? 5 : 0;
  return base + safe;
}

/** 정비(경고 해결) 경험치 — 관리할수록 성장한다는 핵심 메시지 */
export const XP_FOR_FIX: Record<WarningKey, number> = {
  tirePressure: 40,
  engineOil: 60,
  brakeOil: 60,
  washerFluid: 20,
  lamp: 30,
  smartKeyBattery: 20,
};

export const XP_FOR_CHARGE = 10;

export function newlyUnlocked(p: Progress): Cosmetic[] {
  return COSMETICS.filter((c) => c.unlocked(p) && !p.seenUnlocks.includes(c.id));
}
