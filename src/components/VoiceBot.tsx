// AI 음성봇: 마이크로 말 걸면 캐릭터가 차 상태를 보고 목소리로 대답한다.
// 브라우저 내장 음성 인식(Web Speech API) + 음성 합성(speechSynthesis) 사용 → 무료, 별도 키 불필요.
// 음성 인식이 안 되는 브라우저(예: Firefox)나 조용한 곳에서는 글자로 물어볼 수 있다.
import { ExternalLink, Keyboard, KeyRound, Mic, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Mood } from '../game/character';
import { cleanForSpeech, cuteSpeech, pcmStreamPlayer, pickKoVoice, playAudioFile, playPcm, sfx, speakWithServer, stopServerVoice, unlockAudio, voiceFor } from '../game/cuteVoice';
// 음성 AI 엔진(onnxruntime)은 크기가 커서 필요할 때만 불러온다
const engine = () => import('../voice/supertonic');
import { loadVoicePrefs, saveVoicePrefs, type VoicePrefs } from '../voice/voicePrefs';
import { buildContext, reply, type BotContext } from '../game/voiceBot';
import { chatReply, GEMINI_VOICES, geminiSource, geminiSpeech, geminiSpeechStream, setUserKey, type Turn } from '../voice/gemini';
import { LiveSession } from '../voice/live';
import { detectTool, runTool, summaryOf, type ActionCard } from '../voice/actions';
import { ActionCardView } from './ActionCardView';
import { VoiceOrb } from './VoiceOrb';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

// 음성 인식(마이크)은 https 또는 localhost에서만 동작 → 휴대폰에서 http로 열면 글자 입력으로 대체
const SR: any = typeof window !== 'undefined' && window.isSecureContext ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
// Live는 마이크 소리를 직접 보내므로 음성 인식이 없는 브라우저(아이폰 등)도 마이크 사용 가능
const canMic = !!SR || (typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia);

/** 기분별 말하기 속도 (음성 AI) */
const AI_SPEED: Record<Mood, number> = { excited: 1.15, happy: 1.08, calm: 1.03, hungry: 0.95, sick: 0.93, tired: 0.9, sleepy: 0.88 };

const SUGGESTIONS = ['여행지 추천해줘', '근처 충전소', '오늘 날씨 어때?', '소모품 언제 갈아?', '이번 주 운전 어땠어?', '기분 어때?', '얼마나 갈 수 있어?'];
const DOCK_SUGGESTIONS = ['바다 드라이브 추천해줘', '근처 충전소', '오늘 날씨 어때?', '이번 주 운전 어땠어?'];

export function VoiceBot({ ctx, onLine, variant = 'screen' }: {
  ctx: BotContext;
  onLine: (line: string | null, mood?: Mood, speaking?: boolean) => void;
  /** screen: 대화 화면(기록·설정) / dock: 하단 마이크 + 파란 연기 말풍선 */
  variant?: 'screen' | 'dock';
  mood?: Mood;
}) {
  const dock = variant === 'dock';
  const [open, setOpen] = useState(false); // dock: 연기 말풍선 열림
  const [card, setCard] = useState<ActionCard | null>(null); // 음성 도구 결과
  const cardRef = useRef(card);
  cardRef.current = card;
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [typing, setTyping] = useState(!canMic);
  const [text, setText] = useState('');
  const [muted, setMuted] = useState(false);
  const [msgs, setMsgs] = useState<{ id: number; who: 'me' | 'bot'; text: string }[]>([]);
  const msgId = useRef(1);
  const upsert = (id: number, who: 'me' | 'bot', text: string) =>
    setMsgs((m) => (m.some((x) => x.id === id) ? m.map((x) => (x.id === id ? { ...x, text } : x)) : [...m, { id, who, text }].slice(-12)));
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);
  const recRef = useRef<any>(null);
  const resetTimer = useRef<number>();
  const closeTimer = useRef<number>();
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
    if (dock) { window.clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => { if (!live.current?.micOn && !cardRef.current) setOpen(false); }, 12000); }
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => onLine(null), 6000); // 잠시 뒤 평소 대사로
  };

  /** 기존 방식: 대답(Gemini 글자) → 목소리(Gemini TTS, 하루 10번) → 휴대폰 목소리 */
  const answerClassic = (q: string) => {
    const question = q.trim();
    if (!question) return setPhase('idle');
    if (!muted) unlockAudio();
    setHeard(question);
    upsert(msgId.current++, 'me', question);
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
      // 1) 대답 내용: 앱 기능(여행지·주변·날씨·소모품·리포트) → Gemini(무슨 말이든) → 규칙 기반 대답
      let text = rule.text;
      let fromAi = false;
      const tool = detectTool(question);
      setCard(null);
      if (tool) {
        try {
          const c = ctxRef.current;
          const r = await runTool(tool.name, tool.args, { car: c.car, snap: c.snap, trips: c.trips });
          setCard(r.card);
          text = summaryOf(r.card);
          fromAi = true;
        } catch { /* 일반 대답으로 */ }
      }
      if (!fromAi && gemRef.current && gemRef.current !== 'checking') {
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
      upsert(msgId.current++, 'bot', shown);
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

  /** 기존 방식 마이크: 브라우저 음성 인식 */
  const listenClassic = () => {
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
    rec.onend = () => { if (final) answerClassic(final); else setPhase((p) => (p === 'listening' ? 'idle' : p)); };
    rec.start();
  };

  // ================= Gemini Live: 대답 + 목소리를 한 번에 (하루 횟수 제한 없음) =================
  const live = useRef<LiveSession | null>(null);
  const connecting = useRef<Promise<LiveSession | null> | null>(null);
  const liveFails = useRef(0);
  const [liveState, setLiveState] = useState<'off' | 'connecting' | 'ready' | 'failed'>('off');
  const [liveMic, setLiveMic] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const fresh = () => ({ q: '', user: '', bot: '', userId: 0, botId: 0, player: null as ReturnType<typeof pcmStreamPlayer> | null });
  const turn = useRef(fresh());
  const clean = (t: string) => t.replace(/\s*[\p{Extended_Pictographic}\u200d\ufe0f]+/gu, '').replace(/\s+/g, ' ').trim();
  const moodOf = (): Mood => reply(turn.current.user || turn.current.q || '안녕', ctxRef.current).mood ?? 'calm';

  const handlers = {
    onAudio(pcm: Uint8Array) {
      if (mutedRef.current) return;
      const t = turn.current;
      if (!t.player) t.player = pcmStreamPlayer(24000, () => setPhase('speaking'));
      t.player.push(pcm);
    },
    onBotText(d: string) {
      const t = turn.current;
      if (!t.botId) t.botId = msgId.current++;
      t.bot += d;
      upsert(t.botId, 'bot', clean(t.bot));
      onLine(clean(t.bot), moodOf(), true);
    },
    onUserText(d: string) {
      const t = turn.current;
      if (!t.userId) { t.userId = msgId.current++; setCard(null); }
      t.user += d;
      upsert(t.userId, 'me', t.user.trim());
      setHeard(t.user.trim());
    },
    async onTurnComplete() {
      const t = turn.current;
      turn.current = fresh();
      const text = clean(t.bot);
      const mood = reply(t.user || t.q || '안녕', ctxRef.current).mood ?? 'calm';
      if (t.player) await t.player.finish();
      if (text) onLine(text, mood, false);
      if (live.current?.micOn) setPhase('listening');
      else finish();
    },
    onInterrupted() {
      stopServerVoice(); // 말 끊으면 바로 멈춤
      turn.current.player = null;
    },
    async onToolCall(toolName: string, args: Record<string, unknown>) {
      setPhase('thinking');
      const c = ctxRef.current;
      const r = await runTool(toolName, args, { car: c.car, snap: c.snap, trips: c.trips });
      setCard(r.card);
      return r.data;
    },
    onClose() {
      live.current = null;
      setLiveState('off');
      setLiveMic(false);
      setPhase((p) => (p === 'idle' ? p : 'idle'));
    },
  };

  /** Live 연결 (이미 있으면 재사용). 두 번 연속 실패하면 기존 방식으로 */
  const ensureLive = async (): Promise<LiveSession | null> => {
    if (prefsRef.current.engine !== 'gemini') return null;
    if (live.current?.ready) return live.current;
    if (connecting.current) return connecting.current;
    if (liveFails.current >= 2) return null;
    setLiveState('connecting');
    connecting.current = (async () => {
      const ss = new LiveSession(handlers);
      try {
        await ss.connect(buildContext(ctxRef.current), prefsRef.current.gVoice ?? 'Leda');
        live.current = ss;
        liveFails.current = 0;
        setLiveState('ready');
        return ss;
      } catch {
        ss.close();
        liveFails.current += 1;
        setLiveState('failed');
        return null;
      } finally {
        connecting.current = null;
      }
    })();
    return connecting.current;
  };

  // 화면을 열면 미리 연결 → 첫 대답이 빨라짐. 목소리를 바꾸면 새 목소리로 다시 연결
  useEffect(() => {
    liveFails.current = 0;
    live.current?.close();
    live.current = null;
    const id = window.setTimeout(() => { if (!dock) void ensureLive(); }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.gVoice]);
  useEffect(() => () => { live.current?.close(); live.current = null; }, []);

  /** 말 걸기 (글자 · 추천 질문): Live 우선 → 안 되면 기존 방식 */
  const answer = (q: string) => {
    const question = q.trim();
    if (!question) return;
    if (dock) setOpen(true);
    if (!muted) unlockAudio();
    window.clearTimeout(resetTimer.current);
    // 노래 틀어 달라는 말은 AI 판단을 기다리지 않고 바로 Spotify 카드 (확실하고 빠름)
    if (detectTool(question)?.name === 'play_music') return answerClassic(question);
    setPhase('thinking');
    void (async () => {
      const ss = await ensureLive();
      if (ss) {
        try {
          stopServerVoice();
          if (canSpeak) speechSynthesis.cancel();
          turn.current = { ...fresh(), q: question };
          setCard(null);
          ss.sendText(question);
          setHeard(question);
          upsert(msgId.current++, 'me', question);
          if (!muted) sfx.reply(reply(question, ctxRef.current).mood ?? 'calm');
          return;
        } catch { /* 기존 방식으로 */ }
      }
      answerClassic(question);
    })();
  };

  /** 마이크: Live면 계속 듣는 대화(말을 멈추면 대답, 다시 누르면 끝) → 안 되면 브라우저 음성 인식 */
  const listen = async () => {
    if (!muted) unlockAudio();
    if (dock && !live.current?.micOn) setOpen(true);
    if (live.current?.micOn) {
      live.current.stopMic();
      setLiveMic(false);
      setPhase('idle');
      onLine(null);
      return;
    }
    if (phase === 'listening') return recRef.current?.stop();
    if (typeof navigator.mediaDevices?.getUserMedia === 'function' && prefsRef.current.engine === 'gemini') {
      setPhase('thinking');
      const ss = await ensureLive();
      if (ss) {
        try {
          stopServerVoice();
          await ss.startMic();
          setLiveMic(true);
          if (!muted) sfx.listen();
          setHeard('');
          setPhase('listening');
          onLine('듣고 있어요… 👂', 'calm');
          return;
        } catch {
          setPhase('idle');
          onLine('마이크 권한이 필요해요. 주소창 옆 자물쇠에서 허용해 주세요!', 'calm');
          finish();
          return;
        }
      }
      setPhase('idle');
    }
    if (SR) listenClassic();
  };

  const busy = phase === 'thinking' || phase === 'speaking';
  const name = ctx.car.nickname;
  const status =
    phase === 'listening' ? ['듣고 있어요', liveMic ? (heard || '말을 멈추면 대답해요 · 다시 누르면 끝') : (heard || '편하게 말해 주세요')]
    : phase === 'thinking' ? ['생각 중이에요', heard ? `“${heard}”` : '']
    : phase === 'speaking' ? ['말하는 중', '']
    : canMic ? ['눌러서 말 걸기', liveState === 'ready' ? '실시간 대화 준비 완료' : '버튼을 누르고 말해 보세요']
    : ['글자로 물어보기', typeof window !== 'undefined' && !window.isSecureContext ? '이 주소(http)에선 마이크가 막혀 있어요' : '이 브라우저는 음성 인식을 지원하지 않아요'];

  // ================= 하단 도크: 마이크 + 자동차가 파란 연기로 대답 =================
  if (dock) {
    const lastBot = [...msgs].reverse().find((m) => m.who === 'bot')?.text;
    const lastMe = [...msgs].reverse().find((m) => m.who === 'me')?.text;
    const active = phase === 'listening' || liveMic;
    const cloud =
      phase === 'thinking' ? '음… 생각 중이에요' :
      active && !heard ? '듣고 있어요. 편하게 말해 주세요!' :
      lastBot ?? `안녕하세요! 저 ${name}예요. 무엇이든 말해 주세요.`;
    const stop = () => {
      if (live.current?.micOn) { live.current.stopMic(); setLiveMic(false); }
      if (phase === 'listening') recRef.current?.stop();
      stopServerVoice();
      if (canSpeak) speechSynthesis.cancel();
      setPhase('idle');
      setOpen(false);
      setCard(null);
      onLine(null);
    };
    return (
      <>
        {open && createPortal(
          <div className={`orb-layer phase-${phase}`} onClick={stop} role="dialog" aria-label={`${name}와 대화`}>
            <div className="orb-stage" onClick={(e) => e.stopPropagation()}>
              <span className="orb-name"><i className="dot live" />{name} · {phase === 'listening' || active ? '듣고 있어요' : phase === 'thinking' ? '생각 중' : phase === 'speaking' ? '말하는 중' : 'AI'}</span>
              <p className="orb-text" key={cloud} aria-live="polite">{cloud}</p>
              {(heard || lastMe) && <p className="orb-you">“{heard || lastMe}”</p>}
              {card && <div className="orb-card"><ActionCardView card={card} /></div>}
              <div className="orb-spacer" />
              {!active && phase === 'idle' && (
                <div className="chip-row orb-chips">
                  {DOCK_SUGGESTIONS.map((q) => <button key={q} className="chip sm" onClick={() => answer(q)}>{q}</button>)}
                </div>
              )}
              <button className="orb-big" onClick={() => void listen()} disabled={busy && !liveMic} aria-label={active ? '듣기 멈추기' : '말하기'}>
                <VoiceOrb size={168} phase={phase} active={active} />
              </button>
              <p className="cap orb-hint">{active ? '말을 멈추면 대답해요 · 구를 누르면 끝' : '구를 눌러 말하기 · 바깥을 누르면 닫혀요'}</p>
            </div>
          </div>,
          document.body,
        )}
        <button
          className={`dock-orb ${active ? 'on' : ''} ${phase === 'speaking' ? 'speaking' : ''}`}
          onClick={() => void listen()}
          disabled={busy && !liveMic}
          aria-label={active ? '듣기 멈추기' : `${name}에게 말 걸기`}
        >
          <VoiceOrb size={50} phase={phase} active={active} />
          {active ? <Square size={14} fill="currentColor" className="dock-icon" /> : <Mic size={20} className="dock-icon" />}
        </button>
      </>
    );
  }

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

      {card && <ActionCardView card={card} />}

      {typing && (
        <form className="talk-form" onSubmit={(e) => { e.preventDefault(); answer(text); setText(''); }}>
          <input className="text-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`${name}에게 물어보기 (예: 기분 어때?)`} disabled={busy} />
          <button className="btn primary" disabled={busy || !text.trim()}>보내기</button>
        </form>
      )}

      <div className="mic-area">
        <button className="icon-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? '소리 켜기' : '소리 끄기'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        {canMic ? (
          <button className={`mic ${phase === 'listening' || liveMic ? 'on' : ''}`} onClick={() => void listen()} disabled={busy && !liveMic} aria-label={phase === 'listening' || liveMic ? '듣기 멈추기' : '말 걸기'}>
            <span className="ring r1" aria-hidden /><span className="ring r2" aria-hidden />
            {phase === 'listening' || liveMic ? <Square size={22} fill="currentColor" /> : <Mic size={28} />}
          </button>
        ) : (
          <span className="mic disabled" aria-hidden><Mic size={28} /></span>
        )}
        {canMic ? (
          <button className={`icon-btn ${typing ? 'on' : ''}`} onClick={() => setTyping((t) => !t)} aria-label="글자로 물어보기"><Keyboard size={18} /></button>
        ) : <span className="icon-btn ghost" aria-hidden />}
      </div>
      <div className="mic-status">
        <b>{status[0]}</b>
        {status[1] && <span>{status[1]}</span>}
      </div>

      <div className="card voice-card">
        <div className="card-head"><b className="label">대화 AI</b>{liveState !== 'off' && <span className={`cap live-tag ${liveState}`}>{liveState === 'ready' ? '● 실시간' : liveState === 'connecting' ? '연결 중…' : '실시간 연결 실패'}</span>}<span className="cap">{gem === 'server' ? 'Gemini 연결됨 (서버)' : gem === 'device' ? 'Gemini 연결됨 (이 기기 키)' : gem === 'checking' ? '확인 중…' : '기본 대답 모드'}</span></div>
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
