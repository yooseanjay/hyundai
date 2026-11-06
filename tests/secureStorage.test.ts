// 3단계: 암호화 저장소 (localStorage 흉내 내어 실제 동작 확인)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateDataKey } from '../src/security/crypto';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

let ls: MemoryStorage;
beforeEach(() => {
  ls = new MemoryStorage();
  // Object.keys(localStorage)가 동작하도록 Proxy로 감쌈
  (globalThis as any).localStorage = new Proxy(ls, {
    ownKeys: (t) => [...(t as any).m.keys()],
    getOwnPropertyDescriptor: (t, k) => ((t as any).m.has(k) ? { enumerable: true, configurable: true, value: (t as any).m.get(k) } : undefined),
  });
});

const fresh = async () => {
  vi.resetModules(); // 앱을 새로 켠 것처럼 모듈 상태 초기화
  return import('../src/security/secureStorage');
};

describe('암호화 저장소', () => {
  it('저장된 값은 암호문, 앱은 평문으로 읽음', async () => {
    const m = await fresh();
    await m.openSecureStorage(await generateDataKey());
    m.secureStorage.setItem('oca.progress.v1', '{"diary":"비밀 일기"}');
    await m.secureStorage.flush();
    expect(ls.getItem('oca.progress.v1')).toMatch(/^v1\./);
    expect(ls.getItem('oca.progress.v1')).not.toContain('비밀');
    expect(m.secureStorage.getItem('oca.progress.v1')).toBe('{"diary":"비밀 일기"}');
  });

  it('예전 평문은 자동으로 암호화로 바뀜', async () => {
    ls.setItem('oca.mock.v2', '{"parking":"서울시청"}');
    const m = await fresh();
    const r = await m.openSecureStorage(await generateDataKey());
    expect(r.migrated).toBe(1);
    expect(ls.getItem('oca.mock.v2')).toMatch(/^v1\./);
    expect(m.secureStorage.getItem('oca.mock.v2')).toBe('{"parking":"서울시청"}');
  });

  it('칸 바꿔치기 · 다른 키의 암호문은 버림', async () => {
    const k = await generateDataKey();
    const a = await fresh();
    await a.openSecureStorage(k);
    a.secureStorage.setItem('oca.progress.v1', 'diary');
    await a.secureStorage.flush();
    ls.setItem('oca.style.v1', ls.getItem('oca.progress.v1')!); // 일기 암호문을 설정 칸에 복사
    const b = await fresh();
    const r = await b.openSecureStorage(k);
    expect(r.dropped).toBe(1);
    expect(b.secureStorage.getItem('oca.style.v1')).toBeNull();
    expect(b.secureStorage.getItem('oca.progress.v1')).toBe('diary');
  });

  it('키를 바꾸면(rekey) 옛 키로는 못 엶', async () => {
    const oldKey = await generateDataKey();
    const m = await fresh();
    await m.openSecureStorage(oldKey);
    m.secureStorage.setItem('oca.gemini.key', 'user-api-key');
    await m.rekeySecureStorage(await generateDataKey());
    const again = await fresh();
    const r = await again.openSecureStorage(oldKey);
    expect(r.dropped).toBe(1);
  });
});
