// 보안 3단계 진입점: 앱보다 먼저 금고를 열고, 잠금·해제·키 파기를 한곳에서 처리
import { closeSecureStorage, openSecureStorage, rekeySecureStorage } from './secureStorage';
import { startAutoLock, vault, type UnlockResult } from './vault';

export { secureStorage } from './secureStorage';
export { redact, redactText } from './redact';
export { vault, PIN_RULE, MAX_FAILS } from './vault';

/** 앱 시작 전에 호출. 'locked'면 잠금 화면을 먼저 보여 줌 */
export async function bootSecurity(): Promise<'ready' | 'locked'> {
  const state = await vault.boot();
  if (state === 'ready') await openSecureStorage(vault.key!);
  startAutoLock();
  return state;
}

export async function unlockWithPin(pin: string): Promise<UnlockResult> {
  const r = await vault.unlock(pin);
  if (r.ok) await openSecureStorage(vault.key!);
  return r;
}

/** PIN 켜기·바꾸기: 새 데이터 키로 모든 기록을 다시 암호화 */
export async function enablePin(pin: string) {
  await rekeySecureStorage(await vault.setPin(pin));
}

export async function disablePin() {
  await rekeySecureStorage(await vault.removePin());
}

/** 내 데이터 완전 삭제: 암호 키를 파기해 남은 암호문까지 복구 불가로 */
export async function eraseEverything() {
  await closeSecureStorage();
  await vault.wipe();
  location.reload();
}
