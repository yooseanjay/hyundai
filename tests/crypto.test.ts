// 3단계: 기기 암호화 기본 도구
import { describe, expect, it } from 'vitest';
import { constantTimeEqual, deriveKek, generateDataKey, isSealed, open, randomBytes, seal, unwrapDataKey, wrapDataKey } from '../src/security/crypto';

describe('AES-256-GCM 봉인', () => {
  it('암호화 → 복호화가 원래 글과 같다', async () => {
    const k = await generateDataKey();
    const s = await seal(k, '오늘 120km 달렸다', 'oca-storage:oca.progress.v1');
    expect(isSealed(s)).toBe(true);
    expect(s).not.toContain('120km');
    expect(await open(k, s, 'oca-storage:oca.progress.v1')).toBe('오늘 120km 달렸다');
  });

  it('같은 글도 매번 다른 암호문 (IV 재사용 없음)', async () => {
    const k = await generateDataKey();
    expect(await seal(k, 'same', 'x')).not.toBe(await seal(k, 'same', 'x'));
  });

  it('한 글자만 바꿔도 복호화 실패 (위·변조 탐지)', async () => {
    const k = await generateDataKey();
    const s = await seal(k, 'secret', 'x');
    // 마지막 글자는 base64 남는 비트가 섞여 있어, 암호문 한가운데 글자를 바꾼다
    const i = s.lastIndexOf('.') + 5;
    const flipped = s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
    await expect(open(k, flipped, 'x')).rejects.toThrow();
  });

  it('다른 칸(AAD)의 암호문을 옮겨 붙이면 실패', async () => {
    const k = await generateDataKey();
    const s = await seal(k, '{"diaries":[]}', 'oca-storage:oca.progress.v1');
    await expect(open(k, s, 'oca-storage:oca.style.v1')).rejects.toThrow();
  });

  it('다른 키로는 열 수 없다', async () => {
    const s = await seal(await generateDataKey(), 'secret', 'x');
    await expect(open(await generateDataKey(), s, 'x')).rejects.toThrow();
  });

  it('기본 데이터 키는 꺼낼 수 없다 (non-extractable)', async () => {
    const k = await generateDataKey();
    expect(k.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', k)).rejects.toThrow();
  });
});

describe('PIN 키 감싸기 (PBKDF2 → AES-KW)', () => {
  it('맞는 PIN으로만 데이터 키가 풀린다', async () => {
    const salt = randomBytes(16);
    const dek = await generateDataKey(true);
    const wrapped = await wrapDataKey(dek, await deriveKek('482916', salt, 1000));
    const back = await unwrapDataKey(wrapped, await deriveKek('482916', salt, 1000));
    expect(back.extractable).toBe(false);
    expect(await open(back, await seal(dek, 'diary', 'x'), 'x')).toBe('diary');
    await expect(unwrapDataKey(wrapped, await deriveKek('482917', salt, 1000))).rejects.toThrow();
  });
});

describe('상수 시간 비교', () => {
  it('같음 / 다름 / 길이 다름', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
