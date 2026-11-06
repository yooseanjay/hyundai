// AI 음성봇: 마이크로 말 걸면 캐릭터가 차 상태를 보고 목소리로 대답한다.
// 브라우저 내장 음성 인식(Web Speech API) + 음성 합성(speechSynthesis) 사용 → 무료, 별도 키 불필요.
// 음성 인식이 안 되는 브라우저(예: Firefox)나 조용한 곳에서는 글자로 물어볼 수 있다.
import { Download, ExternalLink, Keyboard, KeyRound, Mic, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Mood } from '../game/character';
import { cleanForSpeech, cuteSpeech, pcmStreamPlayer, pickKoVoice, playAudioFile, playPcm, sfx, speakWithServer, stopServerVoice, unlockAudio, voiceFor } from '../game/cuteVoice';
import { CREDIT, MODEL_MB, VOICES, type VoiceId } from '../voice/voiceList';
// 음성 AI 엔진(onnxruntime)은 크기가 커서 필요할 때만 불러온다
const engine = () => import('../voice/supertonic');
import { loadVoicePrefs, saveVoicePrefs, type VoicePrefs } from '../voice/voicePrefs';
import { buildContext, reply, type BotContext } from '../game/voiceBot';
import { chatReply, GEMINI_VOICES, geminiSource, geminiSpeech, geminiSpeechStream, setUserKey, type Turn } from '../voice/gemini';

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

  // ---- 대화 AI (Gemini 무료 키): 무슨 말이든 짧게 대답 ----
  const [gem, setGem] = useState<'server' | 'device' | null | 'checking'>('checking');
  const [keyInput, setKeyInput] = useState('');
  const history = useRef<Turn[]>([]);
  const gemRef = useRef(gem);
  gemRef.current = gem;
  useEffect(() => { void geminiSource().then(setGem); }, []);
  const saveKey = () => {
    if (!keyInput.trim()) return;
    setUserKey(keyInput.trim());
    setKeyInput('');
    setGem('checking');
    void geminiSource().then(setGem);
  };
  const clearKey = () => { setUserKey(''); setGem('checking'); void geminiSource().then(setGem); };

  /** Gemini 목소리로 말하기. 실패하면 false */
  const speakGemini = async (text: string, mood: Mood): Promise<boolean> => {
    if (prefsRef.current.engine !== 'gemini' || !gemRef.current || gemRef.current === 'checking') return false;
    const voice = prefsRef.current.gVoice ?? 'Leda';
    const say = cleanForSpeech(text);
    // 스트리밍(받는 대로 재생, 약 3초 만에 시작) → 실패하면 한 번에 받아서 재생
    let player: ReturnType<typeof pcmStreamPlayer> | null = null;
    try {
      player = pcmStreamPlayer(24000, () => setPhase('speaking'));
      await geminiSpeechStream(say, voice, mood, (b) => player!.push(b));
      await player.finish();
      return true;
    } catch {
      try {
        const wav = await geminiSpeech(say, voice, mood);
        await playAudioFile(wav, () => setPhase('speaking'));
        return true;
      } catch {
        return false;
      }
    }
  };

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
    const rule = reply(question, ctxRef.current);
    const mood: Mood = rule.mood ?? 'calm';

    const browserSpeak = (text: string, mood: Mood, done: () => void) => {
      const u = new SpeechSynthesisUtterance(cuteSpeech(text, mood));
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

    void (async () => {
      // 1) 대답 내용: Gemini(무슨 말이든) → 실패하면 규칙 기반 대답
      let text = rule.text;
      let fromAi = false;
      if (gemRef.current && gemRef.current !== 'checking') {
        try {
          text = await Promise.race([
            chatReply(buildContext(ctxRef.current), history.current, question),
            new Promise<string>((_, no) => window.setTimeout(() => no(new Error('timeout')), 9000)),
          ]);
          fromAi = true;
        } catch { /* 규칙 대답 사용 */ }
      }
      history.current = [...history.current, { role: 'user' as const, text: question }, { role: 'model' as const, text }].slice(-10);
      const shown = text.replace(/\s*[\p{Extended_Pictographic}\u200d\ufe0f]+/gu, '');
      setMsgs((m) => [...m, { who: 'bot' as const, text: shown }].slice(-12));
      onLine(text, mood, true);
      const done = () => { onLine(text, mood, false); finish(); };
      if (!canSpeak || muted) {
        setPhase('speaking');
        window.setTimeout(done, Math.min(6000, 1200 + text.length * 60));
        return;
      }
      speechSynthesis.cancel();
      (rule.intent === 'unknown' && !fromAi ? sfx.confused : () => sfx.reply(mood))();
      // 2) 목소리: Gemini(사람 같은) → 오프라인 음성 AI → Typecast(PC) → 휴대폰 기본
      if (await speakGemini(text, mood)) return done();
      if (await speakAi(text, mood)) return done();
      if (await speakWithServer(text, mood, () => setPhase('speaking'))) return done();
      browserSpeak(text, mood, done);
    })();

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

      <div className="card voice-card">
        <div className="card-head"><b className="label">대화 AI</b><span className="cap">{gem === 'server' ? 'Gemini 연결됨 (서버)' : gem === 'device' ? 'Gemini 연결됨 (이 기기 키)' : gem === 'checking' ? '확인 중…' : '기본 대답 모드'}</span></div>
        {gem === null ? (
          <>
            <p className="cap">무료 Gemini 키를 넣으면 무슨 말이든 알아듣고 짧게 대답해요. 사람 같은 목소리도 함께 쓸 수 있어요.</p>
            <form className="talk-form" onSubmit={(e) => { e.preventDefault(); saveKey(); }}>
              <input className="text-input" type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Gemini API 키 붙여넣기" aria-label="Gemini API 키" />
              <button className="btn primary" disabled={!keyInput.trim()}><KeyRound size={14} /> 저장</button>
            </form>
            <a className="cap key-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio에서 무료 키 받기 <ExternalLink size={11} /></a>
            <p className="cap credit">키는 이 기기에만 저장돼요. 무료 키로 보낸 대화는 Google 서비스 개선에 쓰일 수 있어요.</p>
          </>
        ) : gem === 'device' ? (
          <button className="btn text" onClick={clearKey}>이 기기에서 키 지우기</button>
        ) : null}

        <div className="card-head"><b className="label">목소리</b><span className="cap">Gemini · {GEMINI_VOICES.male.some((v) => v.id === prefs.gVoice) ? '남자' : '여자'} 목소리</span></div>
        {(() => {
          const male = GEMINI_VOICES.male.some((v) => v.id === prefs.gVoice);
          const list = male ? GEMINI_VOICES.male : GEMINI_VOICES.female;
          return (
            <>
              <div className="chip-row">
                <button className={`chip ${!male ? 'on' : ''}`} onClick={() => setPrefs({ ...prefs, engine: 'gemini', gVoice: GEMINI_VOICES.female[0].id })}>여자 목소리</button>
                <button className={`chip ${male ? 'on' : ''}`} onClick={() => setPrefs({ ...prefs, engine: 'gemini', gVoice: GEMINI_VOICES.male[0].id })}>남자 목소리</button>
              </div>
              <div className="chip-row">
                {list.map((v) => (
                  <button key={v.id} className={`chip sm ${prefs.gVoice === v.id ? 'on' : ''}`} onClick={() => setPrefs({ ...prefs, engine: 'gemini', gVoice: v.id })}>{v.label}</button>
                ))}
              </div>
              <button className="btn outline sm block" onClick={() => answer('안녕! 너 목소리 들려줘')} disabled={busy || phase === 'listening' || !gem || gem === 'checking'}><Play size={14} /> 이 목소리로 인사 듣기</button>
              <p className="cap credit">Google Gemini 목소리{gem === null ? ' · 지금은 연결이 안 돼서 휴대폰 목소리로 대신 말해요' : ''}</p>
            </>
          );
        })()}
      </div>
    </div>
  );
}
