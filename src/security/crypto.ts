// ─────────────────────────────────────────────────────────────────────────────
// 보안 3단계 · 암호 기본 도구 (Web Crypto API만 사용, 외부 라이브러리 없음)
//
//  - AES-256-GCM 인증 암호화: 기밀성 + 위·변조 탐지(128비트 태그)
//  - AAD(추가 인증 데이터) = 저장 칸 이름 → 암호문을 다른 칸으로 옮겨 붙이는 공격 차단
//  - PBKDF2-SHA-256(310,000회) : PIN → 키 암호화 키(KEK). 무차별 대입 비용을 키움
//  - AES-KW(RFC 3394) 키 감싸기 : 데이터 키(DEK)를 PIN 키로 감싸서만 보관
//  브라우저와 Node 20+ 모두 globalThis.crypto.subtle 사용 → 같은 코드로 단위 테스트
// ─────────────────────────────────────────────────────────────────────────────
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const CIPHER_VERSION = 'v1';
export const PBKDF2_ITERATIONS = 310_000; // OWASP Password Storage Cheat Sheet (PBKDF2-HMAC-SHA256)

export function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function b64u(bytes: Uint8Array | ArrayBuffer): string {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/** 길이가 같으면 내용과 무관하게 같은 시간 비교 (타이밍 공격 방지) */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** 데이터 키(DEK): AES-256-GCM. extractable=false면 스크립트도 키 원본을 꺼낼 수 없음 */
export function generateDataKey(extractable = false): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']) as Promise<CryptoKey>;
}

/** 평문 문자열 → "v1.<iv>.<암호문+태그>" (iv는 매번 새 96비트 난수) */
export async function seal(key: CryptoKey, plaintext: string, aad: string): Promise<string> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad), tagLength: 128 }, key, enc.encode(plaintext));
  return `${CIPHER_VERSION}.${b64u(iv)}.${b64u(ct)}`;
}

/** 복호화. 키가 다르거나, 한 글자라도 바뀌었거나, 다른 칸(AAD)의 암호문이면 예외 */
export async function open(key: CryptoKey, sealed: string, aad: string): Promise<string> {
  const [v, iv, ct] = sealed.split('.');
  if (v !== CIPHER_VERSION || !iv || !ct) throw new Error('알 수 없는 암호문 형식');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: enc.encode(aad), tagLength: 128 }, key, fromB64u(ct));
  return dec.decode(pt);
}

export const isSealed = (s: string | null | undefined): s is string => !!s && /^v1\.[\w-]{16}\.[\w-]+$/.test(s);

/** PIN → 키 암호화 키(KEK, AES-KW). salt는 기기마다 무작위 */
export async function deriveKek(pin: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(pin.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

export async function wrapDataKey(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  return b64u(await subtle().wrapKey('raw', dek, kek, 'AES-KW'));
}

/** 감싼 키 풀기 → 다시 꺼낼 수 없는(non-extractable) DEK. PIN이 틀리면 AES-KW 무결성 검사에서 실패 */
export function unwrapDataKey(wrapped: string, kek: CryptoKey): Promise<CryptoKey> {
  return subtle().unwrapKey('raw', fromB64u(wrapped), kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) as Promise<CryptoKey>;
}

export async function sha256(text: string): Promise<string> {
  return b64u(await subtle().digest('SHA-256', enc.encode(text)));
}
