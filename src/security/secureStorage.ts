// ─────────────────────────────────────────────────────────────────────────────
// 보안 3단계 · 암호화 저장소 (localStorage와 같은 사용법)
//
//  앱 코드는 동기 API(getItem/setItem)를 그대로 쓰고, 기기에는 AES-256-GCM 암호문만 남는다.
//   - 시작할 때 'oca.' 칸을 모두 복호화해 메모리에 올림 (평문은 메모리에만)
//   - 쓰기는 순서를 지키는 큐로 암호화 후 저장 (write-behind)
//   - 예전 평문 데이터는 처음 열 때 자동으로 암호화로 바꿈 (무중단 마이그레이션)
//   - 위·변조되었거나 다른 칸에서 옮겨 온 암호문은 버림 (GCM 태그 + AAD 검사 실패)
//  보호 대상: 일기·성장 기록, 차량 상태·주차 위치, 소모품 기록, 꾸미기·목소리 설정, 사용자가 넣은 API 키
// ─────────────────────────────────────────────────────────────────────────────
import { isSealed, open, seal } from './crypto';

export const PREFIX = 'oca.';
const cache = new Map<string, string>();
let key: CryptoKey | null = null;
let queue: Promise<void> = Promise.resolve();
let ready = false;

/** 칸 이름을 AAD로 묶음 → 일기 암호문을 설정 칸에 붙여 넣는 식의 바꿔치기 차단 */
export const aadFor = (k: string) => `oca-storage:${k}`;

function persist(k: string) {
  const writeKey = key;
  queue = queue.then(async () => {
    if (!writeKey) return;
    try {
      const v = cache.get(k);
      if (v === undefined) localStorage.removeItem(k);
      else localStorage.setItem(k, await seal(writeKey, v, aadFor(k)));
    } catch { /* 저장 공간 부족 등: 메모리 값은 유지 */ }
  });
}

export const secureStorage = {
  getItem(k: string): string | null {
    if (!ready) throw new Error('암호화 저장소가 아직 열리지 않았어요');
    return cache.get(k) ?? null;
  },
  setItem(k: string, v: string) {
    cache.set(k, String(v));
    persist(k);
  },
  removeItem(k: string) {
    cache.delete(k);
    persist(k);
  },
  /** 저장이 모두 끝날 때까지 기다림 (새로고침 직전 등) */
  flush(): Promise<void> {
    return queue;
  },
};

/** 금고 키로 저장소 열기: 복호화 + 평문 마이그레이션 */
export async function openSecureStorage(k: CryptoKey): Promise<{ migrated: number; dropped: number }> {
  key = k;
  cache.clear();
  let migrated = 0;
  let dropped = 0;
  let names: string[] = [];
  try { names = Object.keys(localStorage).filter((n) => n.startsWith(PREFIX)); } catch { /* 저장소 없음 */ }
  for (const n of names) {
    const raw = localStorage.getItem(n);
    if (raw == null) continue;
    if (isSealed(raw)) {
      try { cache.set(n, await open(k, raw, aadFor(n))); }
      catch { dropped++; localStorage.removeItem(n); }
    } else {
      cache.set(n, raw);
      persist(n);
      migrated++;
    }
  }
  ready = true;
  await queue;
  return { migrated, dropped };
}

/** 키가 바뀔 때(PIN 설정·해제) 모든 칸을 새 키로 다시 암호화 */
export async function rekeySecureStorage(next: CryptoKey) {
  await queue;
  key = next;
  for (const n of cache.keys()) persist(n);
  await queue;
}

/** 지우기 직전: 키·평문을 메모리에서 버리고 이후 쓰기를 막음 */
export async function closeSecureStorage() {
  await queue;
  key = null;
  cache.clear();
}
