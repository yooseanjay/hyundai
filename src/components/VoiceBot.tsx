// AI 음성봇: 마이크로 말 걸면 캐릭터가 차 상태를 보고 목소리로 대답한다.
// 브라우저 내장 음성 인식(Web Speech API) + 음성 합성(speechSynthesis) 사용 → 무료, 별도 키 불필요.
// 음성 인식이 안 되는 브라우저(예: Firefox)나 조용한 곳에서는 글자로 물어볼 수 있다.
import { Download, Keyboard, Mic, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Mood } from '../game/character';
import { cleanForSpeech, cuteSpeech, pickKoVoice, playPcm, sfx, speakWithServer, stopServerVoice, unlockAudio, voiceFor } from '../game/cuteVoice';
import { CREDIT, MODEL_MB, VOICES, type VoiceId } from '../voice/voiceList';
// 음성 AI 엔진(onnxruntime)은 크기가 커서 필요할 때만 불러온다
const engine = () => import('../voice/supertonic');
import { loadVoicePrefs, saveVoicePrefs, type VoicePrefs } from '../voice/voicePrefs';
import { reply, type BotContext } from '../game/voiceBot';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

// 음성 인식(마이크)은 https 또는 localhost에서만 동작 → 휴대폰에서 http로 열면 글자 입력으로 대체
const SR: any = typeof window !== 'undefined' && window.isSecureContext ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** 기분별 말하기 속도 (음성 AI) */
const AI_SPEED: Record<Mood, number> = { excited: 1.15, happy: 1.08, calm: 1.03, hungry: 0.95, sick: 0.93, tired: 0.9, sleepy: 0.88 };

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

  // ---- 목소리 설정: 기본(브라우저) / 무료 음성 AI(Supertonic 남·여 10종) ----
  const [prefs, setPrefsState] = useState<VoicePrefs>(loadVoicePrefs);
  const [ai, setAi] = useState<{ state: 'none' | 'loading' | 'ready' | 'error'; msg?: string; pct?: number }>({ state: 'none' });
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const setPrefs = (p: VoicePrefs) => { setPrefsState(p); saveVoicePrefs(p); };

  const loadAi = () => {
    if (aiRef.current.state === 'loading' || aiRef.current.state === 'ready') return;
    setAi({ state: 'loading', pct: 0, msg: '준비 중…' });
    engine()
      .then((m) => m.loadSupertonic((done, total, label) => setAi({ state: 'loading', pct: Math.round((done / total) * 100), msg: `${label} 받는 중` })))
      .then((e) => setAi({ state: 'ready', msg: e.provider === 'webgpu' ? '그래픽 가속(WebGPU)' : '기본 모드(WebAssembly)' }))
      .catch((err) => setAi({ state: 'error', msg: String(err?.message ?? err) }));
  };
  // 예전에 내려받아 둔 모델이면 저장소에서 바로 불러오기
  useEffect(() => {
    if (prefs.engine === 'ai') void engine().then((m) => m.isDownloaded()).then((ok) => { if (ok) loadAi(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.engine]);

  /** 음성 AI로 말하기. 실패하면 false */
  const speakAi = async (text: string, mood: Mood): Promise<boolean> => {
    if (prefsRef.current.engine !== 'ai' || aiRef.current.state !== 'ready') return false;
    try {
      const e = await (await engine()).loadSupertonic();
      const wav = await e.synthesize(cleanForSpeech(text), prefsRef.current.voice, { speed: AI_SPEED[mood] ?? 1.05 });
      await playPcm(wav, e.sampleRate, () => setPhase('speaking'));
      return true;
    } catch {
      return false;
    }
  };

  const preview = async (v: VoiceId) => {
    unlockAudio();
    setPhase('thinking');
    const name = ctxRef.current.car.nickname;
    const ok = await (async () => {
      try {
        const e = await (await engine()).loadSupertonic();
        const wav = await e.synthesize(`안녕하세요! 저는 ${name}예요. 오늘도 같이 달려요!`, v, { speed: 1.08 });
        await playPcm(wav, e.sampleRate, () => setPhase('speaking'));
        return true;
      } catch { return false; }
    })();
    setPhase('idle');
    if (!ok) setAi({ state: 'error', msg: '미리 듣기에 실패했어요' });
  };

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
      // 1순위: 무료 음성 AI(선택 시) → 2순위: Typecast 아이 목소리(PC 서버) → 3순위: 브라우저 목소리
      void (async () => {
        if (await speakAi(r.text, mood)) return done();
        if (await speakWithServer(r.text, mood, () => setPhase('speaking'))) return done();
        browserSpeak(mood, done);
      })();
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
    : phase === 'thinking' ? [prefs.engine === 'ai' && ai.state === 'ready' ? '목소리 만드는 중' : '생각 중이에요', heard ? `“${heard}”` : '']
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

      <div className="card voice-card">
        <div className="card-head"><b className="label">목소리</b><span className="cap">{prefs.engine === 'ai' ? '무료 음성 AI' : '휴대폰 기본 목소리'}</span></div>
        <div className="chip-row">
          <button className={`chip ${prefs.engine === 'browser' ? 'on' : ''}`} onClick={() => setPrefs({ ...prefs, engine: 'browser' })}>기본</button>
          <button className={`chip ${prefs.engine === 'ai' && prefs.voice.startsWith('F') ? 'on' : ''}`} onClick={() => setPrefs({ engine: 'ai', voice: prefs.voice.startsWith('F') ? prefs.voice : 'F1' })}>AI 여자</button>
          <button className={`chip ${prefs.engine === 'ai' && prefs.voice.startsWith('M') ? 'on' : ''}`} onClick={() => setPrefs({ engine: 'ai', voice: prefs.voice.startsWith('M') ? prefs.voice : 'M1' })}>AI 남자</button>
        </div>
        {prefs.engine === 'ai' && (
          <>
            <div className="chip-row">
              {VOICES.filter((v) => v.id[0] === prefs.voice[0]).map((v) => (
                <button key={v.id} className={`chip sm ${prefs.voice === v.id ? 'on' : ''}`} onClick={() => setPrefs({ ...prefs, voice: v.id })}>{v.label.split(' ')[1]}번</button>
              ))}
            </div>
            {ai.state === 'ready' ? (
              <button className="btn outline sm block" onClick={() => preview(prefs.voice)} disabled={busy || phase === 'listening'}><Play size={14} /> {VOICES.find((v) => v.id === prefs.voice)?.label} 미리 듣기</button>
            ) : ai.state === 'loading' ? (
              <div className="dl">
                <div className="card-head"><span className="cap">{ai.msg}</span><span className="cap">{ai.pct}%</span></div>
                <div className="bar"><div style={{ width: `${ai.pct}%` }} /></div>
              </div>
            ) : (
              <>
                <p className="cap">사람처럼 자연스러운 오픈소스 음성 AI예요. 이 휴대폰 안에서 목소리를 만들어서 요금이 없어요. 처음 한 번 약 {MODEL_MB}MB를 내려받아요 (Wi-Fi 권장).</p>
                {ai.state === 'error' && <p className="cap gps-err">{ai.msg} — 다시 시도해 주세요.</p>}
                <button className="btn primary sm block" onClick={loadAi}><Download size={14} /> 음성 AI 내려받기</button>
              </>
            )}
            <p className="cap credit">{CREDIT}{ai.state === 'ready' && ai.msg ? ` · ${ai.msg}` : ''}</p>
          </>
        )}
      </div>
    </div>
  );
}
