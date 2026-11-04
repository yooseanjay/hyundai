// AI 음성봇: 마이크로 말 걸면 캐릭터가 차 상태를 보고 목소리로 대답한다.
// 브라우저 내장 음성 인식(Web Speech API) + 음성 합성(speechSynthesis) 사용 → 무료, 별도 키 불필요.
// 음성 인식이 안 되는 브라우저(예: Firefox)나 조용한 곳에서는 글자로 물어볼 수 있다.
import { useEffect, useRef, useState } from 'react';
import type { Mood } from '../game/character';
import { cuteSpeech, pickKoVoice, sfx, unlockAudio, voiceFor } from '../game/cuteVoice';
import { reply, type BotContext } from '../game/voiceBot';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

// 음성 인식(마이크)은 https 또는 localhost에서만 동작 → 휴대폰에서 http로 열면 글자 입력으로 대체
const SR: any = typeof window !== 'undefined' && window.isSecureContext ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

const SUGGESTIONS = ['기분 어때?', '얼마나 갈 수 있어?', '어디 아파?', '어디 주차했어?', '오늘 얼마나 달렸어?', '레벨 몇이야?'];

export function VoiceBot({ ctx, onLine }: { ctx: BotContext; onLine: (line: string | null, mood?: Mood, speaking?: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [typing, setTyping] = useState(!SR);
  const [text, setText] = useState('');
  const [muted, setMuted] = useState(false);
  const recRef = useRef<any>(null);
  const resetTimer = useRef<number>();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    if (canSpeak) speechSynthesis.getVoices(); // 음성 목록 미리 로드
    return () => {
      recRef.current?.abort?.();
      if (canSpeak) speechSynthesis.cancel();
      window.clearTimeout(resetTimer.current);
    };
  }, []);

  const finish = () => {
    setPhase('idle');
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => onLine(null), 6000); // 잠시 뒤 평소 대사로
  };

  const answer = (q: string) => {
    const question = q.trim();
    if (!question) return setPhase('idle');
    if (!muted) unlockAudio();
    setHeard(question);
    setPhase('thinking');
    window.clearTimeout(resetTimer.current);
    const r = reply(question, ctxRef.current);
    window.setTimeout(() => {
      onLine(r.text, r.mood, true);
      if (!canSpeak || muted) {
        setPhase('speaking');
        window.setTimeout(() => { onLine(r.text, r.mood, false); finish(); }, Math.min(6000, 1200 + r.text.length * 60));
        return;
      }
      speechSynthesis.cancel();
      const mood = r.mood ?? 'calm';
      const u = new SpeechSynthesisUtterance(cuteSpeech(r.text, mood));
      u.lang = 'ko-KR';
      const v = pickKoVoice();
      if (v) u.voice = v;
      const { pitch, rate } = voiceFor(mood); // 아기 자동차 목소리 (기분 따라 높낮이·빠르기)
      u.pitch = pitch;
      u.rate = rate;
      u.onstart = () => setPhase('speaking');
      u.onend = u.onerror = () => { onLine(r.text, r.mood, false); finish(); };
      (r.intent === 'unknown' ? sfx.confused : () => sfx.reply(mood))();
      window.setTimeout(() => speechSynthesis.speak(u), 220);
      return;
    }, 350);
  };

  const listen = () => {
    if (phase === 'listening') return recRef.current?.stop();
    if (!muted) unlockAudio();
    if (canSpeak) speechSynthesis.cancel();
    const rec = new SR();
    recRef.current = rec;
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let final = '';
    rec.onstart = () => { if (!muted) sfx.listen(); setPhase('listening'); setHeard(''); onLine('듣고 있어요… 👂', 'calm'); };
    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((x: any) => x[0].transcript).join('');
      setHeard(t);
      if (e.results[e.results.length - 1].isFinal) final = t;
    };
    rec.onerror = (e: any) => {
      setPhase('idle');
      const msg = e.error === 'not-allowed' ? '마이크 권한이 필요해요. 주소창 옆 🔒에서 허용해 주세요!' : e.error === 'no-speech' ? '아무 말도 안 들렸어요. 다시 눌러서 말해 줄래요?' : '잘 못 들었어요. 글자로 물어봐도 돼요!';
      onLine(msg, 'calm');
      finish();
    };
    rec.onend = () => { if (final) answer(final); else setPhase((p) => (p === 'listening' ? 'idle' : p)); };
    rec.start();
  };

  const busy = phase === 'thinking' || phase === 'speaking';

  return (
    <div className={`voicebot phase-${phase}`}>
      <div className="vb-row">
        {SR && (
          <button className={`vb-mic ${phase === 'listening' ? 'on' : ''}`} onClick={listen} disabled={busy} aria-label={phase === 'listening' ? '듣기 멈추기' : '말 걸기'}>
            <span className="vb-mic-icon">{phase === 'listening' ? '■' : '🎙️'}</span>
            <span className="vb-rings" aria-hidden />
          </button>
        )}
        <div className="vb-status">
          <b className="t-label">
            {phase === 'listening' ? '듣고 있어요…' : phase === 'thinking' ? '생각 중…' : phase === 'speaking' ? '말하는 중' : SR ? `${ctx.car.nickname}에게 말 걸기` : `${ctx.car.nickname}에게 물어보기`}
          </b>
          <span className="t-caption">{heard ? `“${heard}”` : SR ? '마이크를 누르고 말해 보세요' : (typeof window !== 'undefined' && !window.isSecureContext ? '휴대폰 주소(http)에선 마이크가 막혀서 글자·버튼으로 물어봐요' : '이 브라우저는 음성 인식이 안 돼서 글자로 물어봐요')}</span>
        </div>
        <button className="vb-icon" onClick={() => setMuted((m) => !m)} aria-label={muted ? '소리 켜기' : '소리 끄기'} title={muted ? '소리 켜기' : '소리 끄기'}>{muted ? '🔇' : '🔊'}</button>
        {SR && <button className="vb-icon" onClick={() => setTyping((t) => !t)} aria-label="글자로 물어보기" title="글자로 물어보기">⌨️</button>}
      </div>

      {typing && (
        <form className="vb-form" onSubmit={(e) => { e.preventDefault(); answer(text); setText(''); }}>
          <input className="text-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 기분 어때?" disabled={busy} />
          <button className="btn primary" disabled={busy || !text.trim()}>보내기</button>
        </form>
      )}

      <div className="chips scroll-x vb-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => answer(s)} disabled={busy || phase === 'listening'}>{s}</button>
        ))}
      </div>
    </div>
  );
}
