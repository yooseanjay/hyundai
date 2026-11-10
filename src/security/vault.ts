// ─────────────────────────────────────────────────────────────────────────────
// 보안 3단계 · 키 금고 (Vault)
//
//  기본(device) 모드: 데이터 키(DEK)를 IndexedDB에 "꺼낼 수 없는 CryptoKey"로 보관.
//      → localStorage 파일·백업·다른 프로그램이 읽어도 암호문뿐.
//  PIN 모드: DEK를 PIN에서 만든 키(PBKDF2 → AES-KW)로 감싸서만 보관. 기기에는 DEK 원본이 없음.
//      → 휴대폰을 빌려 가도 PIN 없이는 일기·대화·차량 상태를 열 수 없음.
//  틀린 PIN: 5회부터 지수적으로 대기(30초·1분·2분…), 10회면 키를 파기(crypto-shredding).
//  자동 잠금: PIN 모드에서 앱을 3분 이상 벗어나면 키를 메모리에서 지우고 잠금 화면으로.
// ─────────────────────────────────────────────────────────────────────────────
import { b64u, deriveKek, fromB64u, generateDataKey, PBKDF2_ITERATIONS, randomBytes, unwrapDataKey, wrapDataKey } from './crypto';

export interface VaultMeta {
  mode: 'device' | 'pin';
  salt?: string;
  wrapped?: string;
  iterations?: number;
  fails: number;
  lockUntil: number;
}

export type UnlockResult = { ok: true } | { ok: false; waitMs: number; left: number; wiped?: boolean };

const DB = 'oca-vault';
const STORE = 'keys';
export const MAX_FAILS = 10;
export const AUTO_LOCK_MS = 3 * 60_000;
export const PIN_RULE = /^\d{6,8}$/;

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(r.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
const get = <T,>(k: string) => idb<T>('readonly', (s) => s.get(k) as IDBRequest<T>);
const put = (k: string, v: unknown) => idb('readwrite', (s) => s.put(v, k));
const del = (k: string) => idb('readwrite', (s) => s.delete(k));

/** 틀린 횟수 → 다음 시도까지 기다릴 시간(ms). 4회까지는 바로, 5회부터 30초 × 2^(n-5) */
export function backoffMs(fails: number): number {
  return fails < 5 ? 0 : 30_000 * 2 ** (fails - 5);
}

let key: CryptoKey | null = null;
let meta: VaultMeta = { mode: 'device', fails: 0, lockUntil: 0 };
let persistent = true;

export const vault = {
  get key() { return key; },
  get mode() { return meta.mode; },
  get persistent() { return persistent; },
  get meta(): Readonly<VaultMeta> { return meta; },

  /** 앱 시작: device 모드면 바로 열림, PIN 모드면 'locked' */
  async boot(): Promise<'ready' | 'locked'> {
    try {
      meta = (await get<VaultMeta>('meta')) ?? meta;
      if (meta.mode === 'pin') return 'locked';
      key = (await get<CryptoKey>('dek')) ?? null;
      if (!key) {
        key = await generateDataKey(false);
        await put('dek', key);
        await put('meta', meta);
      }
    } catch {
      // IndexedDB를 못 쓰는 환경(일부 시크릿 창): 이번 실행에서만 쓰는 키. 저장된 암호문은 열 수 없음(=노출도 없음)
      persistent = false;
      key = await generateDataKey(false);
    }
    return 'ready';
  },

  /** PIN으로 열기. 실패하면 남은 대기 시간과 횟수를 알려 줌 */
  async unlock(pin: string): Promise<UnlockResult> {
    const now = Date.now();
    if (meta.lockUntil > now) return { ok: false, waitMs: meta.lockUntil - now, left: MAX_FAILS - meta.fails };
    try {
      const kek = await deriveKek(pin, fromB64u(meta.salt!), meta.iterations ?? PBKDF2_ITERATIONS);
      key = await unwrapDataKey(meta.wrapped!, kek);
      meta = { ...meta, fails: 0, lockUntil: 0 };
      await put('meta', meta);
      return { ok: true };
    } catch {
      const fails = meta.fails + 1;
      if (fails >= MAX_FAILS) {
        await vault.wipe();
        return { ok: false, waitMs: 0, left: 0, wiped: true };
      }
      meta = { ...meta, fails, lockUntil: now + backoffMs(fails) };
      await put('meta', meta);
      return { ok: false, waitMs: backoffMs(fails), left: MAX_FAILS - fails };
    }
  },

  /**
   * PIN 설정·변경: 새 DEK를 만들어 PIN 키로 감싸 저장하고, 기기 보관 DEK는 지움.
   * 반환된 새 키로 호출한 쪽(secureStorage)이 모든 데이터를 다시 암호화(rekey)한다.
   */
  async setPin(pin: string): Promise<CryptoKey> {
    if (!PIN_RULE.test(pin)) throw new Error('PIN은 숫자 6~8자리로 정해 주세요');
    const salt = randomBytes(16);
    const kek = await deriveKek(pin, salt);
    const exportable = await generateDataKey(true); // 감싸기 위해 잠깐만 꺼낼 수 있는 키
    const wrapped = await wrapDataKey(exportable, kek);
    const next = await unwrapDataKey(wrapped, kek); // 실제로는 꺼낼 수 없는 형태로만 사용
    meta = { mode: 'pin', salt: b64u(salt), wrapped, iterations: PBKDF2_ITERATIONS, fails: 0, lockUntil: 0 };
    await put('meta', meta);
    await del('dek');
    key = next;
    return next;
  },

  /** PIN 해제: 다시 기기 보관 키로 */
  async removePin(): Promise<CryptoKey> {
    const next = await generateDataKey(false);
    meta = { mode: 'device', fails: 0, lockUntil: 0 };
    await put('dek', next);
    await put('meta', meta);
    key = next;
    return next;
  },

  /** 잠그기: 메모리의 키와 평문을 모두 버리도록 새로 시작 */
  lock() {
    key = null;
    location.reload();
  },

  /** 키 파기(crypto-shredding): 키가 사라지면 남은 암호문은 영원히 복호화 불가 */
  async wipe() {
    key = null;
    try {
      await new Promise<void>((ok) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => ok(); });
    } catch { /* 없음 */ }
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('oca.')) localStorage.removeItem(k);
    } catch { /* 없음 */ }
    meta = { mode: 'device', fails: 0, lockUntil: 0 };
  },
};

/** PIN 모드에서 화면을 오래 떠나 있으면 자동 잠금 */
export function startAutoLock() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (vault.mode !== 'pin') return;
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) vault.lock();
  });
}
