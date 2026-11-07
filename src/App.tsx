// 화면 구성: Figma "우리 차가 살아있다면" 흑백 디자인 (홈 · AI 음성봇 · 운전 · 오늘의 일기 · 일기장 · 꾸미기)
import {
  ArrowUpRight, Award, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Crown,
  Flower2, Gauge as GaugeIcon, Glasses, HardHat, House, MapPin, Mic, Ribbon, Route, Sparkles, Sun, X, type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dataSource, simulator, WARNING_LABELS, type CarProfile, type Trip, type VehicleSnapshot, type WarningKey } from './api';
import { logout, startLogin } from './api/hyundaiClient';
import { CarCharacter } from './components/CarCharacter';
import { Studio, type StudioTab } from './components/Studio';
import { EMBLEM_PATH, EMBLEM_VIEWBOX } from './three/emblem';
import { colorOf, loadStyle, saveStyle, type CharStyle } from './game/style';
import { VehicleStatus, type LiveDrive } from './components/VehicleStatus';
import { markReplaced, partsStatus, quickWeather } from './voice/actions';
import { gpsSupported, startGpsTrip, type GpsUpdate } from './game/gpsTrip';
import { VoiceBot } from './components/VoiceBot';
import { ThemeToggle } from './components/ThemeToggle';

// 3D(three.js)는 용량이 커서 필요할 때 불러온다. 불러오는 동안은 사진 캐릭터
const Car3D = lazy(() => import('./components/Car3D'));
import { ENERGY_TERMS, findModelById } from './data/hyundaiModels';
import { computeStatus, WARNING_UI, type Mood } from './game/character';
import { writeDiary, type DiaryEntry } from './game/diary';
import { secureStorage } from './security';
import SecurityPanel from './components/SecurityPanel';
import type { Trip as TripT } from './api/types';
import {
  levelOf, loadProgress, newlyUnlocked, saveProgress, xpForTrip,
  XP_FOR_CHARGE, XP_FOR_FIX, XP_PER_LEVEL, type CosmeticId, type Progress,
} from './game/progress';

type Tab = 'home' | 'studio' | 'diary';
type View = Tab | 'talk';
type Style = 'calm' | 'normal' | 'sporty';

const STYLE_LABEL: Record<Style, string> = { calm: '차분하게', normal: '보통', sporty: '신나게' };
const STYLE_DESC: Record<Style, string> = { calm: '차분한 주행', normal: '보통 주행', sporty: '신나는 주행' };
const AVG_SPEED: Record<Style, number> = { calm: 38, normal: 52, sporty: 74 };
// 하단: 음성(빛나는 구) · 홈(운전 포함) · 꾸미기 · 일기. 여행·날씨·주변 찾기는 음성으로
const TABS: [Tab, LucideIcon, string][] = [['home', House, '홈'], ['studio', Sparkles, '꾸미기'], ['diary', BookOpen, '일기']];
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
  // 화면 폭이 바뀌면(회전 등) 황금 직사각형 무대 높이도 다시 계산
  const [, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [car, setCar] = useState<CarProfile | null>(null);
  const [snap, setSnap] = useState<VehicleSnapshot | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openDiary, setOpenDiary] = useState<{ d: DiaryEntry; fresh: boolean } | null>(null);
  const [look, setLookState] = useState<CharStyle>(loadStyle);
  const setLook = (patch: Partial<CharStyle>) => setLookState((prev) => { const n = { ...prev, ...patch }; saveStyle(n); return n; });
  const [studioTab, setStudioTab] = useState<StudioTab>('model');
  const [bot, setBot] = useState<{ line: string; mood?: Mood; speaking?: boolean } | null>(null);
  const [partsTick, setPartsTick] = useState(0);
  const [wx, setWx] = useState<{ text: string; temp: number; rain: number; tip: string } | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const [driving, setDriving] = useState(false);
  const [driveProgress, setDriveProgress] = useState(0);
  const [live, setLive] = useState<LiveDrive & { braking: boolean }>({ speed: 0, km: 0, hardBrakes: 0, maxSpeed: 0, braking: false });
  const sim = useRef({ t: 0, speed: 0, km: 0, hardBrakes: 0, maxSpeed: 0, sum: 0, n: 0, brakeUntil: 0 });
  // 주행 측정 방식: 시뮬레이션(데모) 또는 실제 휴대폰 GPS
  const [source, setSource] = useState<'sim' | 'gps'>(() => (simulator ? 'sim' : 'gps'));
  const [gps, setGps] = useState<GpsUpdate | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const gpsStop = useRef<(() => void) | null>(null);
  const tripStart = useRef(0);
  useEffect(() => () => gpsStop.current?.(), []);
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
  const wxKey = snap?.parking ? `${snap.parking.lat.toFixed(2)},${snap.parking.lng.toFixed(2)}` : '';
  useEffect(() => {
    if (!snap || !car) return;
    const lat = snap.parking?.lat ?? 37.5665;
    const lng = snap.parking?.lng ?? 126.978;
    quickWeather(lat, lng, car.fuelType === 'ev').then(setWx).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wxKey, !!car]);

  /** 주행 시뮬레이션: 0.1초마다 속도·거리 계산 (화면 1초 = 실제 1.5분, 90배속) */
  const TIME_SCALE = 90;
  const startGps = () => {
    setGpsMsg(null);
    setGps(null);
    tripStart.current = Date.now();
    setDriving(true);
    gpsStop.current = startGpsTrip(
      (u) => {
        setGps(u);
        if (u.fix) setGpsMsg(null);
        setLive({ speed: u.speed, km: u.km, hardBrakes: u.hardBrakes, maxSpeed: u.maxSpeed, braking: u.braking });
      },
      (msg) => setGpsMsg(msg),
    );
  };

  const startDrive = () => {
    if (source === 'gps') return startGps();
    setDriving(true);
    setDriveProgress(0);
    sim.current = { t: 0, speed: 0, km: 0, hardBrakes: 0, maxSpeed: 0, sum: 0, n: 0, brakeUntil: 0 };
    const base = { calm: 52, normal: 72, sporty: 98 }[style];
    const swing = { calm: 6, normal: 12, sporty: 22 }[style];
    timer.current = window.setInterval(() => {
      const m = sim.current;
      m.t += 0.1;
      const remain = distance - m.km;
      // 목표 속도: 스타일 기본 + 흐름(오르락내리락), 도착 직전에는 감속
      let target = base + Math.sin(m.t * 0.7) * swing + Math.sin(m.t * 2.3) * swing * 0.3;
      if (remain < 0.8) target = Math.max(8, target * (remain / 0.8));
      // 신나게 달리면 가끔 급정거
      if (style === 'sporty' && m.speed > 60 && m.t > m.brakeUntil + 2 && Math.random() < 0.025) {
        m.speed *= 0.45;
        m.hardBrakes += 1;
        m.brakeUntil = m.t + 0.8;
      }
      const accel = m.t < m.brakeUntil ? 0 : style === 'sporty' ? 0.12 : 0.07;
      m.speed = Math.max(0, m.speed + (target - m.speed) * accel);
      m.km = Math.min(distance, m.km + (m.speed / 3600) * 0.1 * TIME_SCALE);
      m.maxSpeed = Math.max(m.maxSpeed, m.speed);
      m.sum += m.speed;
      m.n += 1;
      if (m.km >= distance) {
        m.speed = 0;
        if (timer.current) window.clearInterval(timer.current);
      }
      setLive({ speed: m.speed, km: m.km, hardBrakes: m.hardBrakes, maxSpeed: m.maxSpeed, braking: m.t < m.brakeUntil });
      setDriveProgress(Math.round((m.km / distance) * 100));
    }, 100);
  };

  const getOff = async () => {
    if (!snap || !car) return;
    if (timer.current) window.clearInterval(timer.current);
    gpsStop.current?.();
    gpsStop.current = null;
    const before = snap;
    let trip: TripT;
    if (source === 'gps') {
      // 실제 GPS 측정값 그대로
      const g = gps;
      const km = Math.round((g?.km ?? 0) * 10) / 10;
      if (km < 0.1) {
        setDriving(false);
        setLive({ speed: 0, km: 0, hardBrakes: 0, maxSpeed: 0, braking: false });
        showToast('움직인 거리가 거의 없어서 기록하지 않았어요');
        return;
      }
      const avg = Math.round(g?.avgSpeed ?? 0);
      const g2 = g ?? { maxSpeed: 0, hardBrakes: 0 };
      if (simulator) {
        trip = simulator.simulateTrip({ distanceKm: km, style: avg > 85 || g2.hardBrakes >= 3 ? 'sporty' : avg > 60 ? 'normal' : 'calm', avgSpeedKmh: avg || undefined, maxSpeedKmh: g2.maxSpeed || undefined, hardBrakes: g2.hardBrakes });
      } else {
        const ended = new Date();
        trip = {
          startedAt: new Date(tripStart.current).toISOString(), endedAt: ended.toISOString(), distanceKm: km,
          durationMin: Math.max(1, Math.round((ended.getTime() - tripStart.current) / 60000)),
          avgSpeedKmh: avg, maxSpeedKmh: Math.round(g2.maxSpeed), hardBrakes: g2.hardBrakes,
        };
      }
    } else {
      if (!simulator) return;
      const m = sim.current;
      const km = Math.max(1, Math.round(m.km));
      trip = simulator.simulateTrip({ distanceKm: km, style, avgSpeedKmh: m.n ? m.sum / m.n : undefined, maxSpeedKmh: m.maxSpeed || undefined, hardBrakes: m.hardBrakes });
    }
    const after = await refresh();
    setDriving(false);
    setGps(null);
    setDriveProgress(0);
    setLive({ speed: 0, km: 0, hardBrakes: 0, maxSpeed: 0, braking: false });
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
  const kmNow = Math.round(live.km * 10) / 10;
  const etaMin = Math.round(((distance - live.km) / Math.max(20, live.speed || AVG_SPEED[style])) * 60);
  const tab: Tab = view === 'talk' ? 'home' : view;
  const carColor = colorOf(look, car.bodyColor);
  const carShape = findModelById(car.modelId ?? '')?.shape;
  const energyTerm = ENERGY_TERMS[car.fuelType];
  void partsTick; // 교체 완료 후 다시 계산
  const dueParts = partsStatus({ car, snap }).filter((p) => p.pct >= 90);
  const energyName = car.fuelType === 'ev' ? '배터리' : car.fuelType === 'hydrogen' ? '수소' : '연료';
  const careCount = st.activeWarnings.length + dueParts.length + (st.energy < 50 ? 1 : 0);
  // AI 브리핑: 지금 꼭 알아야 할 것만 3줄 (경고 → 날씨 → 에너지/소모품 → 좋은 소식)
  const briefing: { tone: 'bad' | 'warn' | 'good' | 'info'; text: string }[] = [];
  if (st.activeWarnings.length) briefing.push({ tone: 'bad', text: `${st.activeWarnings.map((k) => WARNING_LABELS[k]).join(', ')} 점검이 필요해요` });
  if (wx) briefing.push({ tone: wx.rain >= 60 || wx.temp <= 0 ? 'warn' : 'info', text: `지금 ${wx.text} ${wx.temp}°${wx.rain >= 60 ? ` · 오늘 강수 확률 ${wx.rain}%` : ''}. ${wx.tip}` });
  if (st.energy < 30) briefing.push({ tone: 'warn', text: `${energyName}가 ${st.energy}%예요. 출발 전 ${energyTerm.refill.replace('하기', '')}을 권해요` });
  else briefing.push({ tone: 'good', text: `오늘 약 ${snap.dteKm}km까지 문제없이 달릴 수 있어요` });
  if (dueParts.length) briefing.push({ tone: 'warn', text: `${dueParts[0].name} 교체 시기가 다가왔어요` });
  briefing.splice(3);

  const Level = (
    <div className="level">
      <div className="level-row"><b>Lv.{level} · {xpInLevel}/{XP_PER_LEVEL} XP</b><span>다음 레벨까지 {XP_PER_LEVEL - xpInLevel} XP</span></div>
      <div className="bar"><div style={{ width: `${(xpInLevel / XP_PER_LEVEL) * 100}%` }} /></div>
    </div>
  );

  return (
    <main className={`app view-${view}`}>
      <Brand live={dataSource.kind === 'hyundai'} />

      {/* ---------- 홈: Future Mobility · Premium Minimal · AI Mobility ---------- */}
      {view === 'home' && (
        <section className="screen home-x">
          {/* Future Mobility: 쇼룸 히어로 + 주행 가능 거리 + 연결 상태 */}
          <div className="hero">
            <div className="hero-top">
              <div className="hero-id">
                <span className="eyebrow-ai">AI MOBILITY</span>
                <h1 className="hero-name">{car.nickname}</h1>
                <button className="model-link" onClick={() => { setStudioTab('model'); setView('studio'); }} disabled={driving} aria-label="차종과 모습 바꾸기">
                  {car.model} · {snap.odometerKm.toLocaleString()}km<ChevronRight size={12} />
                </button>
              </div>
              <span className="ready"><i className="dot good pulse" />{driving ? '주행 중' : dataSource.kind === 'hyundai' ? '차량 연결됨' : '출발 준비 완료'}</span>
            </div>
            {driving ? (
            <Suspense fallback={<div className="highway"><CarCharacter mood={st.mood} cosmetic={progress.equipped} color={carColor} size={232} /></div>}>
              <div className="drive3d">
                <Car3D mode="drive" mood={driving ? (live.braking ? 'sick' : 'excited') : st.mood} cosmetic={progress.equipped} color={carColor} shape={carShape} style={look}
                  speedKmh={driving ? live.speed : 0} braking={live.braking} height={goldH()} />
                {driving && (
                  <div className="hud">
                    <b>{Math.round(live.speed)}</b><span>km/h</span>
                    {live.braking && <em>급정거!</em>}
                    {source === 'gps' && <i className="gps-tag">GPS</i>}
                  </div>
                )}
              </div>
            </Suspense>
            ) : (
              <Show3D car={car} look={look} mood={bot?.mood ?? st.mood} cosmetic={progress.equipped} height={goldH()} />
            )}
            <div className="hero-range">
              <div className="range-num"><b>{snap.dteKm}</b><span>km</span></div>
              <div className="range-meta">
                <span className="cap">주행 가능 거리</span>
                <span className="cap">{energyName} {st.energy}%</span>
              </div>
              <div className="range-bar"><div style={{ width: `${st.energy}%` }} /></div>
            </div>
          </div>

          {/* 운전: 홈에서 바로 출발 · 주행 중이면 실시간 카드만 */}
          {!driving && (
            <div className="card drive-card">
              <div className="card-head"><b className="h3">함께 달려볼까요?</b><Route size={18} className="muted" /></div>
              <div className="card-head"><b className="label">측정 방식</b><span className="cap">{source === 'gps' ? '휴대폰 GPS로 실제 속도' : '데모 시뮬레이션'}</span></div>
              <div className="chip-row">
                <button className={`chip ${source === 'gps' ? 'on' : ''}`} onClick={() => setSource('gps')} disabled={!gpsSupported()}>실제 GPS</button>
                {simulator && <button className={`chip ${source === 'sim' ? 'on' : ''}`} onClick={() => setSource('sim')}>시뮬레이션</button>}
              </div>
              {source === 'gps' ? (
                <>
                  <p className="cap gps-note">
                    {gpsSupported()
                      ? '휴대폰을 차에 두고 시동을 걸면 실제 속도·거리·급정거를 측정해요. 위치는 이 휴대폰 안에서만 계산하고 어디에도 보내지 않아요.'
                      : '이 주소에서는 GPS를 쓸 수 없어요. https 주소(배포 링크)에서 열어 주세요.'}
                  </p>
                  <p className="safety">운전 중에는 화면을 조작하지 마세요. 거치대에 두거나 동승자가 사용해 주세요.</p>
                </>
              ) : (
                <>
                  <div className="chip-row">
                    {(Object.keys(STYLE_LABEL) as Style[]).map((st2) => (
                      <button key={st2} className={`chip ${style === st2 ? 'on' : ''}`} onClick={() => setStyle(st2)}>{STYLE_LABEL[st2]}</button>
                    ))}
                  </div>
                  <div className="card-head"><span className="cap">목표 거리</span><b className="label">{distance} km</b></div>
                  <input className="range" type="range" min={5} max={150} step={5} value={distance}
                    style={{ ['--p' as string]: `${((distance - 5) / 145) * 100}%` }} onChange={(e) => setDistance(Number(e.target.value))} aria-label="목표 거리" />
                </>
              )}
              <button className="btn primary block" onClick={startDrive} disabled={source === 'gps' && !gpsSupported()}>{source === 'gps' ? '시동 걸기 · GPS 측정 시작' : '시동 걸기'}</button>
              {!simulator && <button className="btn text" onClick={() => refresh(snap)}>현대 운행 기록 새로고침</button>}
            </div>
          )}
          {driving ? (
            <>
            <div className="card">
              {source === 'gps' ? (
                <>
                  <div className="card-head">
                    <span className="label run"><i className={`dot ${gps?.fix ? 'good' : 'warn'} pulse`} />{gps?.fix ? '주행 측정 중' : 'GPS 신호 찾는 중…'}</span>
                    <span className="cap">{gps?.accuracy != null ? `정확도 ±${gps.accuracy}m` : ''}</span>
                  </div>
                  <div className="card-head"><b className="big">{kmNow.toFixed(1)} km</b><span className="cap">{Math.floor(gps?.elapsedMin ?? 0)}분째 · 평균 {Math.round(gps?.avgSpeed ?? 0)}km/h</span></div>
                  {gpsMsg && <p className="cap gps-err">{gpsMsg}</p>}
                </>
              ) : (
                <>
                  <div className="card-head"><span className="label run"><i className="dot good pulse" />주행 중</span><span className="cap">{driveProgress >= 100 ? '도착' : `${hhmm(new Date(Date.now() + etaMin * 60000))} 도착`}</span></div>
                  <div className="card-head"><b className="big">{kmNow} / {distance} km</b><span className="cap">{STYLE_DESC[style]}</span></div>
                  <div className="bar"><div style={{ width: `${driveProgress}%` }} /></div>
                </>
              )}
              <button className="btn primary block" onClick={getOff}>하차하고 오늘의 일기 보기</button>
            </div>
            <div className="card">
              <div className="card-head"><b className="label">실시간 차량 상태</b><span className="cap">{source === 'gps' ? 'GPS 실측' : STYLE_DESC[style]}</span></div>
              <VehicleStatus car={car} snap={snap} live={live} />
            </div>
            </>
          ) : null}

          {!driving && (<>
          {/* AI Mobility: 오닉이가 먼저 알려 주는 오늘의 브리핑 */}
          <div className="ai-brief">
            <div className="ai-head">
              <span className="ai-badge">AI</span>
              <b>{car.nickname} 브리핑</b>
              <span className="cap">{hhmm(new Date())}</span>
            </div>
            <p className="ai-line" key={st.line}>{st.line.replace(/\s*[\p{Extended_Pictographic}\u200d\ufe0f]+/gu, '')}</p>
            <ul className="ai-list">
              {briefing.map((b, i) => <li key={i} className={b.tone}><i />{b.text}</li>)}
            </ul>
            <span className="ai-hint"><Mic size={12} /> 아래 파란 구를 누르고 무엇이든 물어보세요</span>
          </div>

          {/* Premium Minimal: 선으로만 나눈 상태 */}
          <div className="metrics">
            <Metric label="에너지" value={st.energy} bad={st.energy < 20} />
            <Metric label="건강" value={st.health} bad={st.health < 100} />
            <Metric label="피로도" value={st.fatigue} bad={st.fatigue > 70} />
          </div>
          {Level}

          {/* 차량 상태: 홈에서 바로 보이게 (타이어 · 온도 · 경고등) */}
          <div className="card home-status">
            <div className="card-head">
              <b className="label vs-title"><GaugeIcon size={18} strokeWidth={1.8} />차량 상태</b>
              <span className="cap">마지막 수신 {hhmm(new Date(snap.updatedAt))}</span>
            </div>
            <VehicleStatus car={car} snap={snap} compact />
          </div>

          {careCount > 0 && (
            <div className="list">
              <div className="list-title"><b className="label">돌봐주세요</b><span className="cap">{careCount}건 · 돌보면 경험치</span></div>
              {st.activeWarnings.map((k) => (
                <div key={k} className="list-row">
                  <i className="dot bad" />
                  <div className="grow"><b className="label">{WARNING_TITLE[k]}</b><span className="cap">{WARNING_UI[k].hint}</span></div>
                  {simulator ? <button className="btn outline sm" onClick={() => { simulator?.fix(k); refresh(snap); }}>정비 완료</button> : <span className="cap">정비 후 새로고침</span>}
                </div>
              ))}
              {dueParts.map((p) => (
                <div key={p.id} className="list-row">
                  <i className="dot warn" />
                  <div className="grow"><b className="label">{p.name} 교체할 때예요</b><span className="cap">{p.left ? `${p.left.toLocaleString()}km 남음` : '권장 거리 지남'}</span></div>
                  <button className="btn outline sm" onClick={() => { markReplaced(p.id, snap.odometerKm); setPartsTick((n) => n + 1); updateProgress((pr) => ({ ...pr, xp: pr.xp + 15, fixes: pr.fixes + 1 })); showToast(`${p.name} 교체 완료 · +15 XP`); }}>교체 완료</button>
                </div>
              ))}
              {st.energy < 50 && (
                <div className="list-row">
                  <i className={`dot ${st.energy < 20 ? 'bad' : 'warn'}`} />
                  <div className="grow"><b className="label">{energyName} {st.energy}% 남았어요</b><span className="cap">약 {snap.dteKm}km 더 갈 수 있어요</span></div>
                  {simulator && <button className="btn outline sm" onClick={() => { simulator?.refill(); refresh(snap); }}>{energyTerm.refill.replace('하기', '')}</button>}
                </div>
              )}
            </div>
          )}

          <div className="list">
            {snap.parking && (
              <a className="list-row link" href={`https://map.kakao.com/link/map/${encodeURIComponent(car.nickname)},${snap.parking.lat},${snap.parking.lng}`} target="_blank" rel="noreferrer">
                <MapPin size={18} strokeWidth={1.6} />
                <div className="grow"><b className="label">{snap.parking.label}</b><span className="cap">마지막 주차 위치</span></div>
                <ArrowUpRight size={16} className="muted" />
              </a>
            )}
            <button className="list-row link" onClick={() => setView('talk')}>
              <Mic size={18} strokeWidth={1.6} />
              <div className="grow"><b className="label">대화 기록 · 목소리</b><span className="cap">{car.nickname}와 나눈 이야기, 여자·남자 목소리</span></div>
              <ChevronRight size={16} className="muted" />
            </button>
          </div>
          </>)}
        </section>
      )}

      {/* ---------- AI 음성봇 ---------- */}
      {view === 'talk' && (
        <section className="screen">
          <div className="title-row">
            <h1 className="h1">{car.nickname}와 대화</h1>
            <span className="cap conn"><i className="dot good" />{dataSource.kind === 'hyundai' ? '차량 연결됨' : '데모 차량 연결됨'}</span>
          </div>
          <Show3D car={car} look={look} mood={bot?.mood ?? st.mood} cosmetic={progress.equipped} talking={!!bot?.speaking} height={goldH()} />
          <VoiceBot ctx={{ car, snap, status: st, trips, progress }} onLine={(line, mood, speaking) => setBot(line ? { line, mood, speaking } : null)} />
        </section>
      )}

      {/* ---------- 일기장 목록 ---------- */}
      {view === 'diary' && (
        <section className="screen">
          <div className="title-row">
            <h1 className="h1">{car.nickname}의 기록</h1>
            <CarCharacter mood="happy" cosmetic="none" color={carColor} size={56} />
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
              {!progress.diaries.length && <button className="btn primary" onClick={() => setView('home')}>운전하러 가기</button>}
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

      {/* ---------- 꾸미기 스튜디오 ---------- */}
      {view === 'studio' && (
        <Studio
          car={car} progress={progress} look={look} onLook={setLook}
          onEquip={(id) => updateProgress((p) => ({ ...p, equipped: id }))}
          config={simulator?.config}
          onConfig={simulator ? (c) => { simulator?.setCar(c); refresh(); } : undefined}
          icons={COSMETIC_ICON} tab={studioTab} onTab={setStudioTab}
          preview={<Show3D car={car} look={look} mood="happy" cosmetic={progress.equipped} height={goldH(true)} />}
          footer={
            <>
            <SecurityPanel />
            <div className="row-center">
              {simulator && (
                <button className="btn text" onClick={() => {
                  if (!confirm('시뮬레이터와 성장 기록을 모두 초기화할까요?')) return;
                  simulator?.reset(); secureStorage.removeItem('oca.progress.v1'); secureStorage.removeItem('oca.style.v1'); secureStorage.flush().then(() => location.reload());
                }}>시연 데이터 초기화</button>
              )}
              {dataSource.kind === 'hyundai' && <button className="btn text" onClick={logout}>현대 계정 연결 끊기</button>}
            </div>
            </>
          }
        />
      )}

      {/* ---------- 하단 탭바 ---------- */}
      <nav className={`tabbar ${view === 'talk' ? '' : 'with-mic'}`}>
        {/* 음성 우선: 어느 화면에서든 바로 말 걸기 (대화 화면에서는 그 화면의 마이크 사용) */}
        {view !== 'talk' && (
          <VoiceBot variant="dock" mood={bot?.mood ?? st.mood} ctx={{ car, snap, status: st, trips, progress }}
            onLine={(line, mood, speaking) => setBot(line ? { line, mood, speaking } : null)} />
        )}
        {TABS.map(([id, Icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setView(id)} disabled={driving && id !== 'home'} aria-label={label}>
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
                <div className="peek"><CarCharacter mood="happy" cosmetic={progress.equipped} color={carColor} size={210} /></div>
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


      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Brand({ live }: { live?: boolean }) {
  return (
    <header className="brand">
      <div className="brand-bar"><span className="brand-logo"><HyundaiEmblem /><span className="wordmark">HYUNDAI</span></span><span className="brand-right"><span className="cap">현대자동차 Open API</span><ThemeToggle /></span></div>
      <p className="cap">우리 차가 살아있다면{live === false && <em className="badge">DEMO</em>}</p>
    </header>
  );
}

/** 3D 쇼룸 (불러오는 동안 사진 캐릭터) */
/** 황금 직사각형 무대: 세로 = 가로 ÷ φ (bleed: 화면 끝까지 꽉 찬 무대) */
const PHI = 1.618;
function goldH(bleed = false) {
  const w = Math.min(typeof window === 'undefined' ? 390 : window.innerWidth, 430);
  return Math.round((w - (bleed ? 0 : 42)) / PHI);
}

function Show3D({ car, look, mood, cosmetic, talking, height = 200 }: { car: CarProfile; look: CharStyle; mood: Mood; cosmetic: CosmeticId; talking?: boolean; height?: number }) {
  const color = colorOf(look, car.bodyColor);
  return (
    <Suspense fallback={<Showroom><CarCharacter mood={mood} cosmetic={cosmetic} color={color} size={268} /></Showroom>}>
      <Car3D mode="show" mood={mood} cosmetic={cosmetic} color={color} shape={findModelById(car.modelId ?? '')?.shape} style={look} talking={talking} height={height} />
    </Suspense>
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

function Metric({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className={`metric ${bad ? 'bad' : ''}`}>
      <span className="cap">{label}</span>
      <b>{value}</b>
      <div className="metric-bar"><div style={{ width: `${value}%` }} /></div>
    </div>
  );
}

/** 현대 엠블럼 (화면용 SVG, 실제 로고 모양) */
function HyundaiEmblem() {
  return (
    <svg className="emblem" viewBox={EMBLEM_VIEWBOX} role="img" aria-label="현대자동차">
      <path d={EMBLEM_PATH} fill="currentColor" />
    </svg>
  );
}
