// 울림(에코) 막기: 봇 목소리가 나오는 동안엔 마이크 소리를 보내지 않는다
//  - 휴대폰은 스피커 소리가 마이크로 다시 들어가서, 봇이 제 목소리를 듣고 또 대답하거나(두 번 말함) 울림
//  - 재생 중인 소리 수를 세고, 끝난 뒤에도 잠깐(잔향) 더 막음

let playing = 0;
let quietAt = -Infinity;
const now = () => Date.now();

export function voiceStarted() { playing++; }
export function voiceEnded() { playing = Math.max(0, playing - 1); quietAt = now(); }

/** 봇 목소리가 나오는 중(또는 끝난 지 tailMs 안)이면 true */
export function botSpeaking(tailMs = 600): boolean {
  if (playing > 0) return true;
  try { if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) return true; } catch { /* 없음 */ }
  return now() - quietAt < tailMs;
}

/** 음성 인식 결과 합치기: 안드로이드 크롬은 같은 말을 누적해서 여러 번 돌려줘서 "안녕 안녕하세요"처럼 겹침 */
export function mergeTranscripts(parts: string[]): string {
  let out = '';
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const a = out.replace(/\s/g, '');
    const b = t.replace(/\s/g, '');
    if (b.startsWith(a)) out = t; // 앞의 말을 포함한 더 긴 결과 → 바꿔 끼움
    else if (a.endsWith(b) || a.includes(b)) continue; // 이미 들은 말
    else out = out ? `${out} ${t}` : t;
  }
  return out;
}
