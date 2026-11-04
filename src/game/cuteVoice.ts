// 캐릭터 목소리 · 효과음 (브라우저 내장 기능만 사용 → 무료)
//  1) 음성: 한국어 음성 중 가장 자연스러운 것(Neural)을 고르고, 음높이를 살짝만 올려 아이 목소리처럼
//  2) 말투: 문장 끝을 귀엽게 늘이고 기분에 맞는 의성어를 붙임 (화면 글자는 그대로, 읽을 때만)
//  3) 효과음: Web Audio로 '뿅' · '삐빅' 같은 짧은 전자음을 합성 (파일 없음)
import type { Mood } from './character';

/** 기분별 목소리 — 음높이를 과하게 올리면 기계음(다람쥐 소리)이 되므로
 *  사람 아이처럼 들리는 범위(1.1~1.3)에서만 조절하고, 차이는 빠르기로 낸다. */
const VOICE_BY_MOOD: Record<Mood, { pitch: number; rate: number }> = {
  happy: { pitch: 1.25, rate: 1.05 },
  excited: { pitch: 1.3, rate: 1.12 },
  calm: { pitch: 1.2, rate: 1.0 },
  hungry: { pitch: 1.15, rate: 0.92 },
  sick: { pitch: 1.12, rate: 0.88 },
  tired: { pitch: 1.1, rate: 0.88 },
  sleepy: { pitch: 1.1, rate: 0.85 },
};

/** 기분별 첫마디 (읽을 때만 붙임) */
const OPENERS: Partial<Record<Mood, string[]>> = {
  happy: ['헤헤,', '응응!', '있잖아요,'],
  excited: ['우와!', '야호!', '헤헤헤!'],
  hungry: ['우으…', '꼬르륵…'],
  sick: ['으앙…', '아야야…'],
  tired: ['하암…'],
  sleepy: ['쿨쿨…', '음냐…'],
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** 화면 문장 → 읽기용 귀여운 문장 */
export function cuteSpeech(text: string, mood: Mood = 'calm'): string {
  let t = text
    .replace(/[\p{Extended_Pictographic}‍️]/gu, '')
    .replace(/["“”]/g, '')
    .replace(/[~…]+/g, ', ')
    .replace(/킬로미터/g, '키로')
    .replace(/퍼센트/g, '퍼센트');
  // 문장 끝 '요.' '요!' → '용~' 느낌 (가끔만, 너무 과하지 않게)
  let n = 0;
  t = t.replace(/요([.!?])/g, (m, p) => (++n === 2 && p !== '?' ? `용${p}` : m));
  const op = OPENERS[mood];
  if (op && Math.random() < 0.35) t = `${pick(op)} ${t}`;
  return t.replace(/\s{2,}/g, ' ').trim();
}

export function voiceFor(mood: Mood = 'calm', voice?: SpeechSynthesisVoice) {
  const v = VOICE_BY_MOOD[mood] ?? VOICE_BY_MOOD.calm;
  const natural = !!voice && /online|natural|neural|google|yuna/i.test(voice.name);
  return natural ? { pitch: 1 + (v.pitch - 1) * 0.7, rate: v.rate } : v;
}

/** 가장 귀엽게 들리는 한국어 음성 우선 (밝은 여성·Neural/Online 음성) */
export function pickKoVoice(): SpeechSynthesisVoice | undefined {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('ko'));
  const rank = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    if (n.includes('sunhi') && (n.includes('online') || n.includes('natural'))) return 0; // Edge 자연 음성
    if (n.includes('google')) return 1; // Chrome
    if (n.includes('yuna')) return 2; // Mac/iOS
    if (n.includes('online') || n.includes('natural')) return 3;
    if (n.includes('heami') || n.includes('sunhi')) return 4; // Windows 기본
    return 5;
  };
  return vs.sort((a, b) => rank(a) - rank(b))[0];
}

/** 아이폰 Safari 등: 소리는 '탭한 순간'에만 시작할 수 있어서, 탭할 때마다 먼저 잠금 해제 */
let unlocked = false;
export function unlockAudio() {
  ctx();
  if (!unlocked && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
    unlocked = true;
  }
}

// ---- 효과음 ----
let ac: AudioContext | null = null;
function ctx() {
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  ac ??= new AC();
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function tone(freqs: number[], dur: number, type: OscillatorType = 'sine', gain = 0.12, gap = 0) {
  const a = ctx();
  if (!a) return;
  let t = a.currentTime;
  for (const f of freqs) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.35, t + dur * 0.8); // 위로 튀는 '뿅'
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    t += dur + gap;
  }
}

export const sfx = {
  /** 듣기 시작: 삐빅 */
  listen: () => tone([880, 1320], 0.07, 'sine', 0.1, 0.03),
  /** 대답 시작: 뿅! (기분에 따라 음 다름) */
  reply: (mood: Mood = 'calm') => {
    if (mood === 'sick' || mood === 'hungry') tone([520, 390], 0.12, 'triangle', 0.1, 0.02);
    else if (mood === 'excited') tone([660, 990, 1320], 0.07, 'triangle', 0.11, 0.015);
    else if (mood === 'sleepy' || mood === 'tired') tone([440], 0.2, 'sine', 0.08);
    else tone([740, 1110], 0.08, 'triangle', 0.11, 0.02);
  },
  /** 못 알아들음: 갸웃 */
  confused: () => tone([600, 500], 0.1, 'sine', 0.08, 0.04),
};
