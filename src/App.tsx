// 화면 구성: Figma "우리 차가 살아있다면" 흑백 디자인 (홈+운전 · AI 음성봇 · 오늘의 일기 · 일기장 · 꾸미기)
import {
  ArrowUpRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight,
  Gauge as GaugeIcon, House, MapPin, Mic, Route, Sparkles, Sun, X, type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dataSource, simulator, WARNING_LABELS, type CarProfile, type Trip, type VehicleSnapshot, type WarningKey } from './api';
import { logout, startLogin } from './api/hyundaiClient';
import { CarCharacter } from './components/CarCharacter';
import { Studio, type StudioTab } from './components/Studio';
import { EMBLEM_PATH, EMBLEM_VIEWBOX } from './three/emblem';
import { colorOf, loadStyle, saveStyle, type CharStyle } from './game/style';
import { VehicleStatus, type LiveDrive } from './components/VehicleStatus';
import { markReplaced, partsStatus } from './voice/actions';
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
import { loadProgress, saveProgress, type Progress } from './game/progress';
import { wideCar } from './carScreen';
import { SCENES, type SceneId } from './three/scenery';
import { REAL_ROADS } from './data/realRoads';
import { RouteMap } from './components/RouteMap';
import { DriveControls } from './components/DriveControls';
import { distToRoad, myPosition, roadNear } from './data/nearbyRoad';
import type { RealRoad } from './data/realRoads';
import type { DriveControl, DriveStatus } from './components/Car3D';

type Tab = 'home' | 'studio' | 'diary';
type View = Tab | 'talk';
type Style = 'calm' | 'normal' | 'sporty';

const STYLE_LABEL: Record<Style, string> = { calm: '에코', normal: '컴포트', sporty: '스포츠' };
const STYLE_DESC: Record<Style, string> = { calm: '에코 모드', normal: '컴포트 모드', sporty: '스포츠 모드' };
const AVG_SPEED: Record<Style, number> = { calm: 38, normal: 52, sporty: 74 };
// 하단: 음성(빛나는 구) · 홈(운전 포함) · 꾸미기 · 일기. 여행·날씨·주변 찾기는 음성으로
const TABS: [Tab, LucideIcon, string][] = [['home', House, '홈'], ['studio', Sparkles, '꾸미기'], ['diary', BookOpen, '기록']];
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
  const [studioTab, setStudioTab] = useState<StudioTab>('face');
  const [bot, setBot] = useState<{ line: string; mood?: Mood; speaking?: boolean } | null>(null);
  const [partsTick, setPartsTick] = useState(0);
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const [driving, setDriving] = useState(false);
  const [scene, setScene] = useState<SceneId>(() => { try { return (localStorage.getItem('drive-scene') as SceneId) || 'city'; } catch { return 'city'; } });
  const [mapPos, setMapPos] = useState<[number, number] | null>(null);
  // 주행 조작 · 상태 (3D ↔ 화면 버튼)
  const driveCtl = useRef<DriveControl | null>(null);
  const [driveSt, setDriveSt] = useState<DriveStatus | null>(null);
  // 내 위치 근처 실제 도로
  const [hereRoad, setHereRoad] = useState<RealRoad | null>(null);
  const [hereMsg, setHereMsg] = useState<string | null>(null);
  /** 현 위치 실제 도로로 달리기 (기본 켜짐, 끄면 장면 기본 도로) */
  const [autoHere, setAutoHere] = useState(() => { try { return localStorage.getItem('here-road') !== '0'; } catch { return true; } });
  const hereBusy = useRef(false);
  const hereRoadRef = useRef(hereRoad);
  hereRoadRef.current = hereRoad;
  const hereAt = useRef(0);
  /** 위치(없으면 지금 위치를 한 번 물어봄) 근처 실제 도로 불러오기 */
  const loadHere = async (at?: [number, number]) => {
    if (hereBusy.current) return;
    hereBusy.current = true;
    hereAt.current = Date.now();
    setHereMsg((m) => m ?? '현재 위치 도로를 찾는 중…');
    try {
      const [la, ln] = at ?? (await myPosition());
      const r = await roadNear(la, ln);
      if (hereRoadRef.current && hereRoadRef.current.name !== r.name) setToast(`도로 변경: ${r.name}`);
      setHereRoad(r);
      setMapPos(null);
      setHereMsg(null);
    } catch (e) {
      setHereMsg(`${e instanceof Error ? e.message : '도로를 찾지 못했어요'} · 기본 도로로 주행해요`);
    } finally {
      hereBusy.current = false;
    }
  };
  const toggleHere = () => {
    const on = !autoHere;
    setAutoHere(on);
    try { localStorage.setItem('here-road', on ? '1' : '0'); } catch { /* 괜찮음 */ }
    if (on) void loadHere();
    else { setHereRoad(null); setHereMsg(null); setMapPos(null); }
  };
  const roadNow = hereRoad ?? REAL_ROADS[scene];
  const sourceRef = useRef<'sim' | 'gps'>('sim');
  const onCarPos = useCallback((la: number, ln: number) => { if (sourceRef.current !== 'gps') setMapPos([la, ln]); }, []);
  const pickScene = (id: SceneId) => { setScene(id); setMapPos(null); try { localStorage.setItem('drive-scene', id); } catch { /* 저장 안 돼도 괜찮음 */ } };
  const [driveProgress, setDriveProgress] = useState(0);
  const [live, setLive] = useState<LiveDrive & { braking: boolean }>({ speed: 0, km: 0, hardBrakes: 0, maxSpeed: 0, braking: false });
  const sim = useRef({ t: 0, speed: 0, km: 0, hardBrakes: 0, maxSpeed: 0, sum: 0, n: 0, brakeUntil: 0 });
  // 주행 측정 방식: 시뮬레이션(데모) 또는 실제 휴대폰 GPS
  const [source, setSource] = useState<'sim' | 'gps'>(() => (simulator ? 'sim' : 'gps'));
  const [gps, setGps] = useState<GpsUpdate | null>(null);
  sourceRef.current = source;
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
        if (fixed.length || charged) {
          if (fixed.length) updateProgress((p) => ({ ...p, fixes: p.fixes + fixed.length }));
          showToast(fixed.length ? `${fixed.map((k) => WARNING_LABELS[k]).join(', ')} 회복했어요` : '점검 완료');
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

  // 실제 GPS로 달릴 때: 지금 도로에서 벗어나면 (다른 길로 꺾으면) 그 도로를 새로 불러와 이어 달림
  useEffect(() => {
    if (!driving || source !== 'gps' || !autoHere || !gps?.pos) return;
    setMapPos(gps.pos);
    const [la, ln] = gps.pos;
    const off = hereRoad ? distToRoad(hereRoad.pts, la, ln) : Infinity;
    if (off > 45 && Date.now() - hereAt.current > 20000) void loadHere([la, ln]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps?.pos?.[0], gps?.pos?.[1], driving, source, autoHere]);

  const startDrive = () => {
    if (autoHere && !hereRoad) void loadHere();
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
    const diary = writeDiary({ nickname: car.nickname, trip, snapshot: after, newWarnings });
    updateProgress((p) => ({
      ...p,
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
          <Showroom><CarCharacter mood={needLogin ? 'happy' : 'sick'} size={300} /></Showroom>
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
  if (!car || !snap) return <main className="app"><Brand /><p className="loading">불러오는 중…</p></main>;

  const st = computeStatus(snap, trips, driving);
  const kmNow = Math.round(live.km * 10) / 10;
  const etaMin = Math.round(((distance - live.km) / Math.max(20, live.speed || AVG_SPEED[style])) * 60);
  const tab: Tab = view === 'talk' ? 'home' : view;
  const carColor = colorOf(look, car.bodyColor, car.modelId);
  const carShape = findModelById(car.modelId ?? '')?.shape;
  const energyTerm = ENERGY_TERMS[car.fuelType];
  void partsTick; // 교체 완료 후 다시 계산
  const dueParts = partsStatus({ car, snap }).filter((p) => p.pct >= 90);
  const energyName = car.fuelType === 'ev' ? '배터리' : car.fuelType === 'hydrogen' ? '수소' : '연료';
  const careCount = st.activeWarnings.length + dueParts.length + (st.energy < 50 ? 1 : 0);
  return (
    <main className={`app view-${view}`}>
      <Brand live={dataSource.kind !== 'mock'} />

      {/* ---------- 홈: Future Mobility · Premium Minimal · AI Mobility ---------- */}
      {view === 'home' && (
        <section className="screen home-x">
          {/* Future Mobility: 쇼룸 히어로 + 주행 가능 거리 + 연결 상태 */}
          <div className="hero">
            <div className="hero-top">
              <div className="hero-id">
                <span className="hero-model">{car.model} · {snap.odometerKm.toLocaleString()}km</span>
                <h1 className="hero-name">{car.nickname}</h1>
              </div>
              <span className="ready"><i className="dot good pulse" />{driving ? '주행 중' : dataSource.kind !== 'mock' ? '연결됨' : '주행 가능'}</span>
            </div>
            {driving ? (
            <Suspense fallback={<div className="highway"><CarCharacter mood={st.mood} color={carColor} size={232} /></div>}>
              <div className="drive3d">
                <Car3D mode="drive" mood={driving ? (live.braking ? 'sick' : 'excited') : st.mood} color={carColor} shape={carShape} style={look}
                  speedKmh={driving ? live.speed : 0} braking={live.braking} scenery={scene} road={hereRoad} control={driveCtl} onStatus={setDriveSt} onPosition={onCarPos} height={goldH() - 112} />
              </div>
              {/* 3D 화면 위에 글자를 띄우지 않고 아래 줄에 */}
              <div className="drive-bar">
                <div className="hud">
                  <b>{driveSt ? Math.abs(driveSt.kmh) : Math.round(live.speed)}</b><span>{driveSt?.reverse ? 'km/h 후진' : 'km/h'}</span>
                  {live.braking && <em>급정거!</em>}
                  {source === 'gps' && <i className="gps-tag">GPS</i>}
                </div>
                <div className="scene-pick" role="radiogroup" aria-label="주행 장면">
                  {SCENES.map((x) => (
                    <button key={x.id} role="radio" aria-checked={scene === x.id} className={`chip sm ${scene === x.id ? 'on' : ''}`} onClick={() => pickScene(x.id)} title={x.label}>
                      <span className="scene-name">{x.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <DriveControls st={driveSt} ctl={driveCtl} roadName={roadNow.name} />
            </Suspense>
            ) : (
              <Show3D car={car} look={look} mood={bot?.mood ?? st.mood} height={goldH()} />
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

          {/* 차 화면(가로)에서는 오른쪽 열, 휴대폰에서는 그대로 이어짐 (display: contents) */}
          <div className="side">
          {/* 운전: 홈에서 바로 출발 · 주행 중이면 실시간 카드만 */}
          {!driving && (
            <div className="card drive-card">
              <b className="h3">주행</b>
              <div className="field">
                <span className="field-label">도로</span>
                <button className="set-row" onClick={toggleHere} role="switch" aria-checked={autoHere}>
                  <span className="set-ic" aria-hidden><MapPin size={20} /></span>
                  <span className="set-txt">
                    <b>현재 위치 도로</b>
                    <span>{hereMsg ?? `${roadNow.name} · ${roadNow.region} · 왕복 ${roadNow.lanes * 2}차로`}</span>
                  </span>
                  <span className={`switch ${autoHere ? 'on' : ''}`} aria-hidden />
                </button>
              </div>
              <div className="field">
                <span className="field-label">배경</span>
                <div className="seg seg-n" role="radiogroup" aria-label="배경">
                  {SCENES.map((x) => (
                    <button key={x.id} role="radio" aria-checked={scene === x.id} className={scene === x.id ? 'on' : ''} onClick={() => pickScene(x.id)}>{x.label}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="field-label">측정</span>
                <div className="seg seg-n" role="radiogroup" aria-label="측정">
                  <button role="radio" aria-checked={source === 'gps'} className={source === 'gps' ? 'on' : ''} onClick={() => setSource('gps')} disabled={!gpsSupported()}>GPS</button>
                  {simulator && <button role="radio" aria-checked={source === 'sim'} className={source === 'sim' ? 'on' : ''} onClick={() => setSource('sim')}>시뮬레이션</button>}
                </div>
              </div>
              {source === 'gps' ? (
                <>
                  <p className="cap gps-note">
                    {gpsSupported()
                      ? '휴대폰 GPS로 실제 속도와 거리를 측정해요. 측정값은 이 기기에만 저장돼요.'
                      : 'GPS는 https 주소에서만 쓸 수 있어요.'}
                  </p>
                  <p className="safety">운전 중에는 화면을 조작하지 마세요.</p>
                </>
              ) : (
                <>
                  <div className="field">
                    <span className="field-label">주행 모드</span>
                    <div className="seg seg-n" role="radiogroup" aria-label="주행 모드">
                      {(Object.keys(STYLE_LABEL) as Style[]).map((st2) => (
                        <button key={st2} role="radio" aria-checked={style === st2} className={style === st2 ? 'on' : ''} onClick={() => setStyle(st2)}>{STYLE_LABEL[st2]}</button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <div className="card-head"><span className="field-label">목표 거리</span><b className="label">{distance}km</b></div>
                    <input className="range" type="range" min={5} max={150} step={5} value={distance}
                      style={{ ['--p' as string]: `${((distance - 5) / 145) * 100}%` }} onChange={(e) => setDistance(Number(e.target.value))} aria-label="목표 거리" />
                  </div>
                </>
              )}
              <button className="btn primary block" onClick={startDrive} disabled={source === 'gps' && !gpsSupported()}>주행 시작</button>
              {dataSource.kind === 'hyundai' && <button className="btn text" onClick={() => refresh(snap)}>운행 기록 새로고침</button>}
            </div>
          )}
          {driving ? (
            <>
            <RouteMap road={roadNow} pos={mapPos} />
            <div className="card">
              {source === 'gps' ? (
                <>
                  <div className="card-head">
                    <span className="label run"><i className={`dot ${gps?.fix ? 'good' : 'warn'} pulse`} />{gps?.fix ? '측정 중' : 'GPS 연결 중…'}</span>
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
              <button className="btn primary block" onClick={getOff}>주행 종료</button>
            </div>
            <div className="card">
              <div className="card-head"><b className="label">차량 상태</b><span className="cap">{source === 'gps' ? 'GPS 실측' : STYLE_DESC[style]}</span></div>
              <VehicleStatus car={car} snap={snap} live={live} demo={!!simulator} />
            </div>
            </>
          ) : null}

          {!driving && (<>

          {/* 차량 상태: 홈에서 바로 보이게 (타이어 · 온도 · 경고등) */}
          <div className="card home-status">
            <div className="card-head">
              <b className="label vs-title"><GaugeIcon size={18} strokeWidth={1.8} />차량 상태</b>
              <span className="cap">마지막 수신 {hhmm(new Date(snap.updatedAt))}</span>
            </div>
            <VehicleStatus car={car} snap={snap} compact demo={!!simulator} />
          </div>

          {careCount > 0 && (
            <div className="list">
              <div className="list-title"><b className="label">점검 필요</b><span className="cap">{careCount}건</span></div>
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
                  <button className="btn outline sm" onClick={() => { markReplaced(p.id, snap.odometerKm); setPartsTick((n) => n + 1); updateProgress((pr) => ({ ...pr, fixes: pr.fixes + 1 })); showToast(`${p.name} 교체 완료`); }}>교체 완료</button>
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
          </div>
        </section>
      )}

      {/* ---------- AI 음성봇 ---------- */}
      {view === 'talk' && (
        <section className="screen">
          <div className="title-row">
            <h1 className="h1">{car.nickname}와 대화</h1>
            <span className="cap conn"><i className="dot good" />{dataSource.kind !== 'mock' ? '차량 연결됨' : '데모 차량 연결됨'}</span>
          </div>
          <Show3D car={car} look={look} mood={bot?.mood ?? st.mood} talking={!!bot?.speaking} height={goldH()} />
          <div className="side">
          <VoiceBot ctx={{ car, snap, status: st, trips, progress }} onLine={(line, mood, speaking) => setBot(line ? { line, mood, speaking } : null)} />
          </div>
        </section>
      )}

      {/* ---------- 일기장 목록 ---------- */}
      {view === 'diary' && (
        <section className="screen">
          <div className="title-row">
            <h1 className="h1">{car.nickname}의 기록</h1>
            <CarCharacter mood="happy" color={carColor} size={56} />
          </div>
                    <div className="grid3">
            <div className="tile-stat"><span className="cap">총 주행</span><b className="num">{snap.odometerKm.toLocaleString()}<small>km</small></b></div>
            <div className="tile-stat"><span className="cap">일기 수</span><b className="num">{progress.diaries.length}<small>편</small></b></div>
            <div className="tile-stat"><span className="cap">정비 횟수</span><b className="num">{progress.fixes}<small>회</small></b></div>
          </div>
          <div className="side">
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
              {!progress.diaries.length && <button className="btn primary" onClick={() => setView('home')}>주행 시작하기</button>}
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
                      <span className="cap meta">{d.distanceKm} km · {d.place}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </section>
      )}

      {/* ---------- 꾸미기 스튜디오 ---------- */}
      {view === 'studio' && (
        <Studio
          car={car} look={look} onLook={setLook}
          config={simulator?.config}
          onConfig={simulator ? (c) => { simulator?.setCar(c); refresh(); } : undefined}
          tab={studioTab} onTab={setStudioTab}
          preview={<Show3D car={car} look={look} mood="happy" height={goldH(true)} />}
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
            {openDiary.fresh && <div className="backdrop-title"><b className="h1">주행 완료</b><span className="cap">오늘의 기록이 저장됐어요</span></div>}
            <section className="diary-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="오늘의 일기">
              <span className="handle" />
              <div className="card-head"><b className="h2">오늘의 일기</b><button className="icon-btn plain" onClick={() => setOpenDiary(null)} aria-label="닫기"><X size={20} /></button></div>
              <div className="keepsake">
                <div className="peek"><CarCharacter mood="happy" color={carColor} size={210} /></div>
                <article className="paper">
                  <div className="card-head"><span className="cap">{t.getFullYear()}.{pad(t.getMonth() + 1)}.{pad(t.getDate())} · {weekday(t)}</span><Sun size={16} /></div>
                  <h3 className="paper-title">{car.nickname}의 일기 — {d.title}</h3>
                  <p className="paper-body">{d.body.replace(/^.*의 일기\n\n/, '')}</p>
                </article>
              </div>
              <div className="chip-row">
                <span className="chip static">{d.distanceKm}km</span>
                <span className="chip static">{d.place}</span>
              </div>
              <button className="btn primary block" onClick={() => { setOpenDiary(null); if (openDiary.fresh) setView('diary'); }}>{openDiary.fresh ? '기록 보기' : '닫기'}</button>
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
  // 차 화면(가로): 왼쪽 열에 크게
  if (wideCar()) return Math.round(Math.max(200, Math.min(window.innerHeight - 420, 520)));
  const w = Math.min(typeof window === 'undefined' ? 390 : window.innerWidth, 430);
  return Math.round((w - (bleed ? 0 : 42)) / PHI);
}

function Show3D({ car, look, mood, talking, height = 200 }: { car: CarProfile; look: CharStyle; mood: Mood; talking?: boolean; height?: number }) {
  const color = colorOf(look, car.bodyColor, car.modelId);
  return (
    <Suspense fallback={<Showroom><CarCharacter mood={mood} color={color} size={268} /></Showroom>}>
      <Car3D mode="show" mood={mood} color={color} shape={findModelById(car.modelId ?? '')?.shape} style={look} talking={talking} height={height} />
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


/** 현대 엠블럼 (화면용 SVG, 실제 로고 모양) */
function HyundaiEmblem() {
  return (
    <svg className="emblem" viewBox={EMBLEM_VIEWBOX} role="img" aria-label="현대자동차">
      <path d={EMBLEM_PATH} fill="currentColor" />
    </svg>
  );
}
