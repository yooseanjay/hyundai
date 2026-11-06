// AI 음성봇: 마이크로 말 걸면 캐릭터가 차 상태를 보고 목소리로 대답한다.
// 브라우저 내장 음성 인식(Web Speech API) + 음성 합성(speechSynthesis) 사용 → 무료, 별도 키 불필요.
// 음성 인식이 안 되는 브라우저(예: Firefox)나 조용한 곳에서는 글자로 물어볼 수 있다.
import { Keyboard, Mic, Square, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Mood } from '../game/character';
import { cuteSpeech, pickKoVoice, sfx, speakWithServer, stopServerVoice, unlockAudio, voiceFor } from '../game/cuteVoice';
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
  const [msgs, setMsgs] = useState<{ who: 'me' | 'bot'; text: string }[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
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
    setMsgs((m) => [...m, { who: 'me' as const, text: question }].slice(-12));
    setPhase('thinking');
    window.clearTimeout(resetTimer.current);
    const r = reply(question, ctxRef.current);
    window.setTimeout(() => {
      setMsgs((m) => [...m, { who: 'bot' as const, text: r.text.replace(/\s*[\p{Extended_Pictographic}‍️]+/gu, '') }].slice(-12));
      onLine(r.text, r.mood, true);
      if (!canSpeak || muted) {
        setPhase('speaking');
        window.setTimeout(() => { onLine(r.text, r.mood, false); finish(); }, Math.min(6000, 1200 + r.text.length * 60));
        return;
      }
      speechSynthesis.cancel();
      const mood = r.mood ?? 'calm';
      const done = () => { onLine(r.text, r.mood, false); finish(); };
      (r.intent === 'unknown' ? sfx.confused : () => sfx.reply(mood))();
      // 1순위: 진짜 아이 목소리(Typecast, PC 서버) → 실패하면 2순위: 브라우저 목소리
      void speakWithServer(r.text, mood, () => setPhase('speaking')).then((ok) => {
        if (ok) return done();
        browserSpeak(mood, done);
      });
    }, 350);

    const browserSpeak = (mood: Mood, done: () => void) => {
      const u = new SpeechSynthesisUtterance(cuteSpeech(r.text, mood));
      u.lang = 'ko-KR';
      const v = pickKoVoice();
      if (v) u.voice = v;
      const { pitch, rate } = voiceFor(mood, v); // 아기 자동차 목소리 (기분 따라 높낮이·빠르기)
      u.pitch = pitch;
      u.rate = rate;
      u.onstart = () => setPhase('speaking');
      u.onend = u.onerror = () => done();
      window.setTimeout(() => speechSynthesis.speak(u), 120);
    };
  };

  const listen = () => {
    if (phase === 'listening') return recRef.current?.stop();
    if (!muted) unlockAudio();
    stopServerVoice();
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
  const name = ctx.car.nickname;
  const status =
    phase === 'listening' ? ['듣고 있어요', heard || '편하게 말해 주세요']
    : phase === 'thinking' ? ['생각 중이에요', heard ? `“${heard}”` : '']
    : phase === 'speaking' ? ['말하는 중', '']
    : SR ? ['눌러서 말 걸기', '버튼을 누르고 말해 보세요']
    : ['글자로 물어보기', typeof window !== 'undefined' && !window.isSecureContext ? '이 주소(http)에선 마이크가 막혀 있어요' : '이 브라우저는 음성 인식을 지원하지 않아요'];

  return (
    <div className={`talk phase-${phase}`}>
      <div className="chip-row">
        {SUGGESTIONS.map((q) => (
          <button key={q} className="chip" onClick={() => answer(q)} disabled={busy || phase === 'listening'}>{q}</button>
        ))}
      </div>

      <div className="messages" ref={listRef} aria-live="polite">
        {msgs.length === 0 && (
          <div className="msg bot">
            <span className="msg-name">{name}</span>
            <p>안녕하세요! 저한테 뭐든 물어봐요. 지금 제 상태를 보고 대답해 줄게요.</p>
          </div>
        )}
        {msgs.map((m, i) =>
          m.who === 'me' ? (
            <div key={i} className="msg me"><p>{m.text}</p></div>
          ) : (
            <div key={i} className="msg bot"><span className="msg-name">{name}</span><p>{m.text}</p></div>
          ),
        )}
      </div>

      {typing && (
        <form className="talk-form" onSubmit={(e) => { e.preventDefault(); answer(text); setText(''); }}>
          <input className="text-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`${name}에게 물어보기 (예: 기분 어때?)`} disabled={busy} />
          <button className="btn primary" disabled={busy || !text.trim()}>보내기</button>
        </form>
      )}

      <div className="mic-area">
        <button className="icon-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? '소리 켜기' : '소리 끄기'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        {SR ? (
          <button className={`mic ${phase === 'listening' ? 'on' : ''}`} onClick={listen} disabled={busy} aria-label={phase === 'listening' ? '듣기 멈추기' : '말 걸기'}>
            <span className="ring r1" aria-hidden /><span className="ring r2" aria-hidden />
            {phase === 'listening' ? <Square size={22} fill="currentColor" /> : <Mic size={28} />}
          </button>
        ) : (
          <span className="mic disabled" aria-hidden><Mic size={28} /></span>
        )}
        {SR ? (
          <button className={`icon-btn ${typing ? 'on' : ''}`} onClick={() => setTyping((t) => !t)} aria-label="글자로 물어보기"><Keyboard size={18} /></button>
        ) : <span className="icon-btn ghost" aria-hidden />}
      </div>
      <div className="mic-status">
        <b>{status[0]}</b>
        {status[1] && <span>{status[1]}</span>}
      </div>
    </div>
  );
}
