// 기기에 남기는 기록: 일기장 · 정비 횟수 (암호화 저장)
import { secureStorage } from '../security/secureStorage';
import type { DiaryEntry } from './diary';

export interface Progress {
  fixes: number;
  diaries: DiaryEntry[];
}

const KEY = 'oca.progress.v1';

export function loadProgress(): Progress {
  try {
    const raw = secureStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { fixes: p.fixes ?? 0, diaries: p.diaries ?? [] };
    }
  } catch {
    /* ignore */
  }
  return { fixes: 0, diaries: [] };
}

export function saveProgress(p: Progress) {
  try {
    secureStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
