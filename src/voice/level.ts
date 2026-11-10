// 음성 크기(0~1)를 화면의 빛나는 구에 전달 (말할 때·들을 때 구가 소리에 맞춰 커지고 밝아짐)
export const voiceLevel = { v: 0 };

export function pushLevel(x: number) {
  voiceLevel.v = Math.max(voiceLevel.v, Math.min(1, x));
}

export function rms(f: Float32Array) {
  let s = 0;
  let n = 0;
  for (let i = 0; i < f.length; i += 4) { s += f[i] * f[i]; n++; }
  return n ? Math.sqrt(s / n) : 0;
}
