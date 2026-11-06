// 화면 구성: Figma "우리 차가 살아있다면" 흑백 디자인 (홈 · AI 음성봇 · 운전 · 오늘의 일기 · 일기장 · 꾸미기)
import {
  ArrowUpRight, Award, BookOpen, CalendarDays, CarFront, ChevronLeft, ChevronRight, CircleCheck, Crown,
  Flower2, Glasses, HardHat, House, LockKeyhole, MapPin, Mic, Ribbon, Route, Sparkles, Sun, X, type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dataSource, simulator, WARNING_LABELS, type CarProfile, type Trip, type VehicleSnapshot, type WarningKey } from './api';
import { logout, startLogin } from './api/hyundaiClient';
import { CarCharacter } from './components/CarCharacter';
import { CarSheet } from './components/CarSheet';
import { VoiceBot } from './components/VoiceBot';
import { ENERGY_TERMS } from './data/hyundaiModels';
import { computeStatus, WARNING_UI, type Mood } from './game/character';
import { writeDiary, type DiaryEntry } from './game/diary';
import {
  COSMETICS, levelOf, loadProgress, newlyUnlocked, saveProgress, xpForTrip,
  XP_FOR_CHARGE, XP_FOR_FIX, XP_PER_LEVEL, type CosmeticId, type Progress,
} from './game/progress';

type Tab = 'home' | 'drive' | 'diary' | 'closet';
type View = Tab | 'talk';
type Style = 'calm' | 'normal' | 'sporty';

const STYLE_LABEL: Record<Style, string> = { calm: '차분하게', normal: '보통', sporty: '신나게' };
const STYLE_DESC: Record<Style, string> = { calm: '차분한 주행', normal: '보통 주행', sporty: '신나는 주행' };
const AVG_SPEED: Record<Style, number> = { calm: 38, normal: 52, sporty: 74 };
const TABS: [Tab, LucideIcon, string][] = [['home', House, '홈'], ['drive', CarFront, '운전'], ['diary', BookOpen, '일기장'], ['closet', Sparkles, '꾸미기']];
const COSMETIC_ICON: Record<CosmeticId, LucideIcon | null> = { none: null, sunglasses: Glasses, flower: Flower2, wrench: Award, scarf: Ribbon, cap: HardHat, crown: Crown };
const WARNING_TITLE: Record<WarningKey, string> = {
  tirePressure: '타이어 공기압이 낮아요', engineOil: '엔진오일을 갈 때예요', brakeOil: '브레이크액을 확인해요',
  washerFluid: '워셔액이 부족해요', lamp: '램프를 점검해요', smartKeyBattery: '스마트키 배터리가 약해요',
};

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const weekday = (d: Date) => d.toLocaleDateString('ko-KR', { weekday: 'long' });
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export default function App() {
  const [view, setView] = useState<View>('home');
  const [car, setCar] = useState<CarProfile | null>(null);
  const [snap, setSnap] = useState<VehicleSnapshot | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openDiary, setOpenDiary] = useState<{ d: DiaryEntry; fresh: boolean } | null>(null);
  const [carSheet, setCarSheet] = useState(false);
  const [bot, setBot] = useState<{ line: string; mood?: Mood; speaking?: boolean } | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const [driving, setDriving] = useState(false);
  const [driveProgress, setDriveProgress] = useState(0);
  const [style, setStyle] = useState<Style>('calm');
  const [distance, setDistance] = useState(30);
  const timer = useRef<number | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  const updateProgress = useCallback((fn: (p: Progress) => Progress) => {
    setProgress((prev) => {
      const next = fn(prev);
      const fresh = newlyUnlocked(next);
      if (fresh.length) {
        next.seenUnlocks = [...next.seenUnlocks, ...fresh.map((c) => c.id)];
        window.setTimeout(() => showToast(`새 스타일 해금 · ${fresh.map((c) => c.name).join(', ')}`), 400);
      }
      if (levelOf(next.xp) > levelOf(prev.xp)) window.setTimeout(() => showToast(`레벨 업! Lv.${levelOf(next.xp)}`), 100);
      saveProgress(next);
      return next;
    });
  }, []);

  /** 데이터 새로고침 + 경고 해결/충전 감지 → 경험치 */
  const refresh = useCallback(async (prevSnap?: VehicleSnapshot | null) => {
    try {
      const cars = await dataSource.getCars();
      const c = cars[0];
      if (!c) throw new Error('등록된 차량이 없어요');
      const [s, t] = await Promise.all([dataSource.getSnapshot(c.carId), dataSource.getRecentTrips(c.carId)]);
      setCar(c);
      setSnap(s);
      setTrips(t);
      setError(null);
      if (prevSnap) {
        const fixed = (Object.keys(s.warnings) as WarningKey[]).filter((k) => prevSnap.warnings[k] && !s.warnings[k]);
        const charged = s.fuelLevelPct - prevSnap.fuelLevelPct >= 10;
        const gain = fixed.reduce((a, k) => a + XP_FOR_FIX[k], 0) + (charged ? XP_FOR_CHARGE : 0);
        if (gain > 0) {
          updateProgress((p) => ({ ...p, xp: p.xp + gain, fixes: p.fixes + fixed.length }));
          showToast(fixed.length ? `${fixed.map((k) => WARNING_LABELS[k]).join(', ')} 회복 · +${gain} XP` : `든든해졌어요 · +${gain} XP`);
        }
      }
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [updateProgress]);

  useEffect(() => {
    // 로그인 콜백 결과 (/?auth=ok 또는 /?auth_error=...)
    const q = new URLSearchParams(location.search);
    if (q.has('auth') || q.has('auth_error')) {
      const authErr = q.get('auth_error');
      history.replaceState(null, '', location.pathname + location.hash);
      if (authErr) {
        setError(`로그인 실패: ${authErr}`);
        return;
      }
      showToast('현대 계정 연결 완료');
    }
    refresh();
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [refresh]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  const startDrive = () => {
    setDriving(true);
    setDriveProgress(0);
    timer.current = window.setInterval(() => {
      setDriveProgress((p) => {
        if (p >= 100) {
          if (timer.current) window.clearInterval(timer.current);
          return 100;
        }
        return p + 2;
      });
    }, 100);
  };

  const getOff = async () => {
    if (!simulator || !snap || !car) return;
    if (timer.current) window.clearInterval(timer.current);
    const before = snap;
    const km = Math.max(1, Math.round((distance * Math.max(driveProgress, 5)) / 100));
    const trip = simulator.simulateTrip({ distanceKm: km, style });
    const after = await refresh();
    setDriving(false);
    setDriveProgress(0);
    if (!after) return;
    const newWarnings = (Object.keys(after.warnings) as WarningKey[]).filter((k) => after.warnings[k] && !before.warnings[k]);
    const xp = xpForTrip(trip);
    const diary = writeDiary({ nickname: car.nickname, trip, snapshot: after, newWarnings, xpGained: xp });
    updateProgress((p) => ({
      ...p,
      xp: p.xp + xp,
      totalKm: p.totalKm + trip.distanceKm,
      tripCount: p.tripCount + 1,
      calmTrips: p.calmTrips + (trip.hardBrakes === 0 ? 1 : 0),
      diaries: [diary, ...p.diaries].slice(0, 100),
    }));
    setOpenDiary({ d: diary, fresh: true });
  };

  const monthDiaries = useMemo(
    () => progress.diaries.filter((d) => { const t = new Date(d.date); return t.getFullYear() === month.y && t.getMonth() === month.m; }),
    [progress.diaries, month],
  );

  // ---------- 로그인 전 / 오류 ----------
  if (error && !snap) {
    const needLogin = /LOGIN|로그인|4011|4012/.test(error);
    const remote = !['localhost', '127.0.0.1'].includes(location.hostname);
    return (
      <main className="app">
        <Brand />
        <section className="screen welcome">
          <Showroom><CarCharacter mood={needLogin ? 'happy' : 'sick'} cosmetic="none" size={300} /></Showroom>
          <h1 className="h1">{needLogin ? '내 차가 깨어날 준비가 됐어요' : '차랑 연결이 안 됐어요'}</h1>
          <p className="muted body">
            {needLogin
              ? remote ? '실제 차 연결은 PC에서만 할 수 있어요. 여기서는 데모로 모든 기능을 체험해 보세요.' : '현대 계정을 연결하면 내 차가 캐릭터로 살아나요.'
              : error}
          </p>
          <div className="stack">
            {dataSource.kind === 'hyundai' && !remote && <button className="btn primary block" onClick={startLogin}>현대 계정으로 연결</button>}
            <button className={`btn block ${remote || !needLogin ? 'primary' : 'outline'}`} onClick={() => { location.href = location.pathname + '?demo'; }}>데모로 체험하기</button>
            {dataSource.kind === 'hyundai' && !needLogin && <button className="btn text" onClick={logout}>연결 끊기</button>}
          </div>
        </section>
      </main>
    );
  }
  if (!car || !snap) return <main className="app"><Brand /><p className="loading">차가 깨어나는 중…</p></main>;

  const st = computeStatus(snap, trips, driving);
  const level = levelOf(progress.xp);
  const xpInLevel = progress.xp % XP_PER_LEVEL;
  const kmNow = Math.round((distance * driveProgress) / 100);
  const etaMin = Math.round(((distance - kmNow) / AVG_SPEED[style]) * 60);
  const owned = COSMETICS.filter((c) => c.unlocked(progress)).length;
  const tab: Tab = view === 'talk' ? 'home' : view;
  const energyTerm = ENERGY_TERMS[car.fuelType];

  const Level = (
    <div className="level">
      <div className="level-row"><b>Lv.{level} · {xpInLevel}/{XP_PER_LEVEL} XP</b><span>다음 레벨까지 {XP_PER_LEVEL - xpInLevel} XP</span></div>
      <div className="bar"><div style={{ width: `${(xpInLevel / XP_PER_LEVEL) * 100}%` }} /></div>
    </div>
  );

  return (
    <main className={`app view-${view}`}>
      <Brand live={dataSource.kind === 'hyundai'} />

      {/* ---------- 홈 ---------- */}
      {view === 'home' && (
        <section className="screen">
          <div className="title-row">
            <h1 className="h1">{car.nickname}</h1>
            <button className="chip" onClick={() => simulator && setCarSheet(true)} disabled={!simulator || driving} aria-label="내 차 바꾸기">
              {car.model} · {snap.odometerKm.toLocaleString()}km
            </button>
          </div>
          {Level}
          <div>
            <Showroom><CarCharacter mood={bot?.mood ?? st.mood} cosmetic={progress.equipped} color={car.bodyColor} size={268} /></Showroom>
            <p className="speech" key={st.line}>{st.line.replace(/\s*[\p{Extended_Pictographic}‍️]+/gu, '')}</p>
          </div>
          <div className="grid3">
            <Gauge label="에너지" value={st.energy} bad={st.energy < 20} />
            <Gauge label="건강" value={st.health} bad={st.health < 100} />
            <Gauge label="피로도" value={st.fatigue} bad={st.fatigue > 70} />
          </div>
          <div className="card">
            <div className="card-head"><b className="h3">돌봐주세요</b><span className="cap">돌보면 +{st.activeWarnings[0] ? XP_FOR_FIX[st.activeWarnings[0]] : XP_FOR_CHARGE} XP</span></div>
            {st.activeWarnings.length === 0 && st.energy >= 50 && (
              <div className="care-row"><i className="dot good" /><div className="grow"><b className="label">아픈 곳이 없어요</b><span className="cap">오늘도 챙겨줘서 고마워요</span></div></div>
            )}
            {st.activeWarnings.map((k) => (
              <div key={k} className="care-row">
                <i className="dot bad" />
                <div className="grow"><b className="label">{WARNING_TITLE[k]}</b><span className="cap">{simulator ? '보충 후 완료를 눌러주세요' : WARNING_UI[k].hint}</span></div>
                {simulator ? (
                  <button className="btn outline sm" onClick={() => { simulator?.fix(k); refresh(snap); }}>정비 완료</button>
                ) : <span className="cap">정비 후 새로고침</span>}
              </div>
            ))}
            {st.energy < 50 && (
              <div className="care-row">
                <i className={`dot ${st.energy < 20 ? 'bad' : 'warn'}`} />
                <div className="grow"><b className="label">{car.fuelType === 'ev' ? '배터리' : car.fuelType === 'hydrogen' ? '수소' : '연료'}가 {st.energy}% 남았어요</b><span className="cap">약 {snap.dteKm}km 더 갈 수 있어요</span></div>
                {simulator && <button className="btn outline sm" onClick={() => { simulator?.refill(); refresh(snap); }}>{energyTerm.refill.replace('하기', '')}</button>}
              </div>
            )}
          </div>
          {snap.parking && (
            <a className="card row-card" href={`https://map.kakao.com/link/map/${encodeURIComponent(car.nickname)},${snap.parking.lat},${snap.parking.lng}`} target="_blank" rel="noreferrer">
              <MapPin size={20} />
              <div className="grow"><span className="cap">마지막 주차 위치 · 오늘 {hhmm(new Date(snap.updatedAt))}</span><b className="label">{snap.parking.label}</b></div>
              <ChevronRight size={16} className="muted" />
            </a>
          )}
          <button className="link-row" onClick={() => setView('talk')}><Mic size={16} />{car.nickname}와 이야기하기<ArrowUpRight size={14} /></button>
        </section>
      )}

      {/* ---------- AI 음성봇 ---------- */}
      {view === 'talk' && (
        <section className="screen">
          <div className="title-row">
            <h1 className="h1">{car.nickname}와 대화</h1>
            <span className="cap conn"><i className="dot good" />{dataSource.kind === 'hyundai' ? '차량 연결됨' : '데모 차량 연결됨'}</span>
          </div>
          <Showroom talking={!!bot?.speaking}><CarCharacter mood={bot?.mood ?? st.mood} cosmetic={progress.equipped} color={car.bodyColor} size={268} /></Showroom>
          <VoiceBot ctx={{ car, snap, status: st, trips, progress }} onLine={(line, mood, speaking) => setBot(line ? { line, mood, speaking } : null)} />
        </section>
      )}

      {/* ---------- 운전 ---------- */}
      {view === 'drive' && (
        <section className="screen">
          <div className="title-row">
            <h1 className="h1">{driving ? (driveProgress >= 100 ? '도착했어요!' : '신나게 달리는 중') : '함께 달려볼까요?'}</h1>
            <Route size={20} className="muted" />
          </div>
          <div className={`highway ${driving && driveProgress < 100 ? 'moving' : ''}`}>
            <svg className="hw-lines" viewBox="0 0 353 146" preserveAspectRatio="none" aria-hidden>
              <path d="M0 146 L120 40 M353 146 L233 40" />
              <path className="center" d="M176.5 146 L176.5 52" />
            </svg>
            <CarCharacter mood={driving ? 'excited' : st.mood} cosmetic={progress.equipped} color={car.bodyColor} driving={driving} size={232} />
          </div>
          {!simulator ? (
            <div className="card">
              <p className="body">실제 차량 모드에서는 운전을 마치고 앱을 열면 운행 정보로 일기가 자동으로 써져요.</p>
              <button className="btn primary block" onClick={() => refresh(snap)}>운행 기록 불러오기</button>
            </div>
          ) : !driving ? (
            <div className="card">
              <div className="card-head"><b className="label">출발 전 설정</b><span className="cap">다음 주행에 적용</span></div>
              <div className="chip-row">
                {(Object.keys(STYLE_LABEL) as Style[]).map((s) => (
                  <button key={s} className={`chip ${style === s ? 'on' : ''}`} onClick={() => setStyle(s)}>{STYLE_LABEL[s]}</button>
                ))}
              </div>
              <div className="card-head"><span className="cap">목표 거리</span><b className="label">{distance} km</b></div>
              <input className="range" type="range" min={5} max={150} step={5} value={distance}
                style={{ ['--p' as string]: `${((distance - 5) / 145) * 100}%` }} onChange={(e) => setDistance(Number(e.target.value))} aria-label="목표 거리" />
              <button className="btn primary block" onClick={startDrive}>시동 걸기</button>
            </div>
          ) : (
            <div className="card">
              <div className="card-head"><span className="label run"><i className="dot good pulse" />주행 중</span><span className="cap">{driveProgress >= 100 ? '도착' : `${hhmm(new Date(Date.now() + etaMin * 60000))} 도착`}</span></div>
              <div className="card-head"><b className="big">{kmNow} / {distance} km</b><span className="cap">{STYLE_DESC[style]}</span></div>
              <div className="bar"><div style={{ width: `${driveProgress}%` }} /></div>
              <button className="btn primary block" onClick={getOff}>하차하고 오늘의 일기 보기</button>
            </div>
          )}
        </section>
      )}

      {/* ---------- 일기장 목록 ---------- */}
      {view === 'diary' && (
        <section className="screen">
          <div className="title-row">
            <h1 className="h1">우리의 일기장</h1>
            <CarCharacter mood="happy" cosmetic="none" color={car.bodyColor} size={56} />
          </div>
          <div className="grid3">
            <div className="tile-stat"><span className="cap">총 주행</span><b className="num">{snap.odometerKm.toLocaleString()}<small>km</small></b></div>
            <div className="tile-stat"><span className="cap">일기 수</span><b className="num">{progress.diaries.length}<small>편</small></b></div>
            <div className="tile-stat"><span className="cap">정비 횟수</span><b className="num">{progress.fixes}<small>회</small></b></div>
          </div>
          <div className="card-head month">
            <b className="h3">{month.y}년 {month.m + 1}월</b>
            <span className="month-nav">
              <button aria-label="이전 달" onClick={() => setMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}><ChevronLeft size={16} /></button>
              <button aria-label="다음 달" onClick={() => setMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}><ChevronRight size={16} /></button>
            </span>
          </div>
          {monthDiaries.length === 0 ? (
            <div className="card empty">
              <CalendarDays size={22} className="muted" />
              <p className="body muted">{progress.diaries.length ? '이 달에는 일기가 없어요.' : '아직 일기가 없어요. 함께 달리고 나면 오늘의 일기가 생겨요.'}</p>
              {!progress.diaries.length && <button className="btn primary" onClick={() => setView('drive')}>운전하러 가기</button>}
            </div>
          ) : (
            <ul className="diary-list">
              {monthDiaries.map((d) => {
                const t = new Date(d.date);
                const body = d.body.replace(/^.*의 일기\n\n/, '').split('\n')[0];
                return (
                  <li key={d.id}>
                    <button className={`card diary-item ${isToday(d.date) ? 'today' : ''}`} onClick={() => setOpenDiary({ d, fresh: false })}>
                      <span className="card-head"><span className="cap">{pad(t.getMonth() + 1)}.{pad(t.getDate())} {weekday(t)}{isToday(d.date) && <em className="badge">TODAY</em>}</span><ArrowUpRight size={16} className="muted" /></span>
                      <b className="h3">{d.title}</b>
                      <span className="excerpt">{body}</span>
                      <span className="cap meta">{d.distanceKm} km · {d.place}<i className="sep" />+{d.xpGained} XP</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ---------- 꾸미기 ---------- */}
      {view === 'closet' && (
        <section className="screen">
          <div className="title-row"><h1 className="h1">{car.nickname}의 옷장</h1><span className="cap">나만의 작은 취향</span></div>
          <Showroom small><CarCharacter mood="happy" cosmetic={progress.equipped} color={car.bodyColor} size={238} /></Showroom>
          {Level}
          <div className="card-head"><b className="h3">스타일 컬렉션</b><span className="cap">{owned} / {COSMETICS.length} 보유</span></div>
          <div className="closet-grid">
            {COSMETICS.map((c) => {
              const open = c.unlocked(progress);
              const on = progress.equipped === c.id;
              const Icon = COSMETIC_ICON[c.id];
              return (
                <button key={c.id} disabled={!open} className={`closet-item ${on ? 'on' : ''}`} onClick={() => updateProgress((p) => ({ ...p, equipped: c.id }))}>
                  {on && <CircleCheck size={14} className="check" />}
                  <span className="art">{Icon ? <Icon size={30} strokeWidth={1.4} /> : <CarCharacter mood="happy" cosmetic="none" color={car.bodyColor} size={72} />}</span>
                  <b className="label">{c.name}</b>
                  <span className="cap">{on ? '착용 중' : open ? `${c.condition} · 보유` : <><LockKeyhole size={10} /> {c.condition.replace(' 달성', '')}에 열려요</>}</span>
                </button>
              );
            })}
          </div>
          <p className="cap center">함께 달리고 돌봐줄수록, 새로운 모습이 열려요.</p>
          <div className="row-center">
            {simulator && (
              <button className="btn text" onClick={() => {
                if (!confirm('시뮬레이터와 성장 기록을 모두 초기화할까요?')) return;
                simulator?.reset(); localStorage.removeItem('oca.progress.v1'); location.reload();
              }}>시연 데이터 초기화</button>
            )}
            {dataSource.kind === 'hyundai' && <button className="btn text" onClick={logout}>현대 계정 연결 끊기</button>}
          </div>
        </section>
      )}

      {/* ---------- 하단 탭바 ---------- */}
      <nav className="tabbar">
        {TABS.map(([id, Icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setView(id)} disabled={driving && id !== 'drive'} aria-label={label}>
            <Icon size={22} strokeWidth={tab === id ? 2 : 1.6} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* ---------- 오늘의 일기 (바텀시트) ---------- */}
      {openDiary && (() => {
        const d = openDiary.d;
        const t = new Date(d.date);
        return (
          <div className="sheet-backdrop" onClick={() => setOpenDiary(null)}>
            {openDiary.fresh && <div className="backdrop-title"><b className="h1">오늘도 수고했어요</b><span className="cap">주행 완료</span></div>}
            <section className="diary-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="오늘의 일기">
              <span className="handle" />
              <div className="card-head"><b className="h2">오늘의 일기</b><button className="icon-btn plain" onClick={() => setOpenDiary(null)} aria-label="닫기"><X size={20} /></button></div>
              <div className="keepsake">
                <div className="peek"><CarCharacter mood="happy" cosmetic={progress.equipped} color={car.bodyColor} size={210} /></div>
                <article className="paper">
                  <div className="card-head"><span className="cap">{t.getFullYear()}.{pad(t.getMonth() + 1)}.{pad(t.getDate())} · {weekday(t)}</span><Sun size={16} /></div>
                  <h3 className="paper-title">{car.nickname}의 일기 — {d.title}</h3>
                  <p className="paper-body">{d.body.replace(/^.*의 일기\n\n/, '')}</p>
                </article>
              </div>
              <div className="chip-row">
                <span className="chip static">{d.distanceKm}km</span>
                <span className="chip static">+{d.xpGained} XP</span>
                <span className="chip static">{d.place}</span>
              </div>
              <button className="btn primary block" onClick={() => { setOpenDiary(null); if (openDiary.fresh) setView('diary'); }}>{openDiary.fresh ? '일기장에 붙이기' : '닫기'}</button>
              <p className="cap center">{car.nickname}의 기억은 모두 일기장에 간직돼요</p>
            </section>
          </div>
        );
      })()}

      {carSheet && simulator && (
        <CarSheet
          initial={simulator.config}
          onClose={() => setCarSheet(false)}
          onSave={(c) => { simulator?.setCar(c); setCarSheet(false); refresh(); showToast(`${c.nickname}(으)로 바꿨어요`); }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Brand({ live }: { live?: boolean }) {
  return (
    <header className="brand">
      <div className="brand-bar"><span className="wordmark">HYUNDAI</span><span className="cap">현대자동차 Open API</span></div>
      <p className="cap">우리 차가 살아있다면{live === false && <em className="badge">DEMO</em>}</p>
    </header>
  );
}

function Showroom({ children, talking, small }: { children: React.ReactNode; talking?: boolean; small?: boolean }) {
  return (
    <div className={`showroom ${talking ? 'talking' : ''} ${small ? 'small' : ''}`}>
      <span className="spot" aria-hidden />
      <span className="floor" aria-hidden />
      {children}
    </div>
  );
}

function Gauge({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className={`gauge ${bad ? 'bad' : ''}`}>
      <div className="card-head"><span className="cap">{label}</span><b className="num">{value}</b></div>
      <div className="bar thin"><div style={{ width: `${value}%` }} /></div>
    </div>
  );
}
