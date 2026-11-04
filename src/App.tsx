import { useCallback, useEffect, useRef, useState } from 'react';
import { dataSource, simulator, WARNING_LABELS, type CarProfile, type Trip, type VehicleSnapshot, type WarningKey } from './api';
import { logout, startLogin } from './api/hyundaiClient';
import { CarCharacter } from './components/CarCharacter';
import { CarSheet } from './components/CarSheet';
import { ENERGY_TERMS } from './data/hyundaiModels';
import { computeStatus, WARNING_UI, type Mood } from './game/character';
import { writeDiary, type DiaryEntry } from './game/diary';
import {
  COSMETICS, levelOf, loadProgress, newlyUnlocked, saveProgress, xpForTrip,
  XP_FOR_CHARGE, XP_FOR_FIX, XP_PER_LEVEL, type Progress,
} from './game/progress';

type Tab = 'home' | 'drive' | 'diary' | 'closet';
type Style = 'calm' | 'normal' | 'sporty';

const STYLE_LABEL: Record<Style, string> = { calm: '🌿 차분하게', normal: '🚗 보통', sporty: '🔥 신나게' };
const TABS: [Tab, string, string][] = [['home', '🏠', '홈'], ['drive', '🛣️', '운전'], ['diary', '📔', '일기장'], ['closet', '👗', '꾸미기']];

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [car, setCar] = useState<CarProfile | null>(null);
  const [snap, setSnap] = useState<VehicleSnapshot | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openDiary, setOpenDiary] = useState<DiaryEntry | null>(null);
  const [carSheet, setCarSheet] = useState(false);

  const [driving, setDriving] = useState(false);
  const [driveProgress, setDriveProgress] = useState(0);
  const [style, setStyle] = useState<Style>('normal');
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
        window.setTimeout(() => showToast(`🎁 새 외형 해금! ${fresh.map((c) => c.emoji + ' ' + c.name).join(', ')}`), 400);
      }
      if (levelOf(next.xp) > levelOf(prev.xp)) window.setTimeout(() => showToast(`🎉 레벨 업! Lv.${levelOf(next.xp)}`), 100);
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
          showToast(fixed.length ? `💖 ${fixed.map((k) => WARNING_LABELS[k]).join(', ')} 회복! +${gain}XP` : `🍙 배불러요! +${gain}XP`);
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
      showToast('🔑 현대 계정 연결 완료!');
    }
    refresh();
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [refresh]);

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
    setOpenDiary(diary);
  };

  if (error && !snap)
    return (
      <main className="app center">
        <p className="err">{error}</p>
        {dataSource.kind === 'hyundai' && <button className="btn primary" onClick={startLogin}>현대 계정으로 로그인</button>}
        {dataSource.kind === 'hyundai' && <button className="btn ghost" onClick={logout}>연결 끊기</button>}
      </main>
    );
  if (!car || !snap) return <main className="app center"><p className="t-title">차가 깨어나는 중… <span className="emoji">💤</span></p></main>;

  const st = computeStatus(snap, trips, driving);
  const level = levelOf(progress.xp);
  const xpInLevel = progress.xp % XP_PER_LEVEL;
  const kmNow = Math.round((distance * driveProgress) / 100);

  const Header = (
    <>
      <header className="header">
        <div>
          <p className="eyebrow t-caption">우리 차가 살아있다면 <span className={`demo-tag ${dataSource.kind === 'hyundai' ? 'live' : ''}`}>{dataSource.kind === 'mock' ? 'DEMO' : 'LIVE'}</span></p>
          <h1 className="t-display">{car.nickname}</h1>
        </div>
        <button className="car-pill" onClick={() => simulator && setCarSheet(true)} disabled={!simulator || driving} aria-label="내 차 바꾸기">
          <span>🚙</span><span className="t-caption">{car.model} · {snap.odometerKm.toLocaleString()}km</span>{simulator && <span className="t-caption">▾</span>}
        </button>
      </header>
      <XPBar level={level} xp={xpInLevel} />
    </>
  );

  return (
    <main className="app">
      {tab === 'home' && (
        <section className="screen">
          {Header}
          <Stage mood={st.mood} line={st.line} cosmetic={progress.equipped} color={car.bodyColor} />
          <div className="stats">
            <Stat icon="🍙" label="에너지" value={st.energy} tone={st.energy < 20 ? 'bad' : 'good'} />
            <Stat icon="💖" label="건강" value={st.health} tone={st.health < 100 ? 'bad' : 'good'} />
            <Stat icon="😪" label="피로도" value={st.fatigue} tone={st.fatigue > 70 ? 'bad' : 'neutral'} />
          </div>
          <div className="card">
            <h2 className="t-heading">🩺 돌봐주세요</h2>
            {st.activeWarnings.length === 0 ? (
              <div className="empty-care"><span className="care-icon">✨</span><span className="t-label">아픈 곳이 없어요. 고마워요!</span></div>
            ) : (
              <ul className="care">
                {st.activeWarnings.map((k) => (
                  <li key={k} className="care-item">
                    <span className="care-icon">{WARNING_UI[k].icon}</span>
                    <span className="care-text">
                      <b className="t-heading">{WARNING_LABELS[k]}</b>
                      <span className="t-caption">{WARNING_UI[k].hint}</span>
                    </span>
                    {simulator ? (
                      <button className="btn care-btn" onClick={() => { simulator?.fix(k); refresh(snap); }}>정비 완료 +{XP_FOR_FIX[k]}XP</button>
                    ) : (
                      <span className="t-caption">정비 후 새로고침</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              {simulator && <button className="btn secondary" onClick={() => { simulator?.refill(); refresh(snap); }}>{ENERGY_TERMS[car.fuelType].icon} 밥 주기 ({ENERGY_TERMS[car.fuelType].refill})</button>}
              <button className="btn secondary" onClick={() => refresh(snap)}>↻ 새로고침</button>
            </div>
          </div>
          {snap.parking && (
            <div className="card">
              <div className="row between">
                <div>
                  <p className="t-caption">지금 쉬는 곳</p>
                  <p className="t-heading">📍 {snap.parking.label}</p>
                </div>
                <a className="btn secondary" href={`https://map.kakao.com/link/map/${encodeURIComponent(car.nickname)},${snap.parking.lat},${snap.parking.lng}`} target="_blank" rel="noreferrer">지도</a>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'drive' && (
        <section className="screen">
          {Header}
          <Stage
            road
            moving={driving}
            mood={driving ? 'excited' : st.mood}
            line={driving ? (driveProgress >= 100 ? '도착! 내려도 돼요 🙌' : '부릉부릉~ 바람이 시원해요!') : '어디로 갈까요? 시동 걸어 주세요!'}
            cosmetic={progress.equipped}
            color={car.bodyColor}
            driving={driving}
          />
          {!simulator ? (
            <div className="card">
              <p className="t-label">실제 차량 모드에서는 운전을 마치고 앱을 열면 운행 정보로 일기가 자동 작성돼요.</p>
              <button className="btn primary block" onClick={() => refresh(snap)}>운행 기록 불러오기</button>
            </div>
          ) : !driving ? (
            <div className="card">
              <div>
                <h2 className="t-heading">🧪 주행 시뮬레이터</h2>
                <p className="t-caption">API 승인 전 시연용 · 실제 차량에선 운행 정보 API로 대체</p>
              </div>
              <p className="t-label muted">운전 스타일</p>
              <div className="chips">
                {(Object.keys(STYLE_LABEL) as Style[]).map((s) => (
                  <button key={s} className={`chip ${style === s ? 'on' : ''}`} onClick={() => setStyle(s)}>{STYLE_LABEL[s]}</button>
                ))}
              </div>
              <div className="row between"><span className="t-label muted">목표 거리</span><b className="t-heading">{distance}km</b></div>
              <input className="slider" type="range" min={5} max={150} step={5} value={distance}
                style={{ ['--p' as string]: `${((distance - 5) / 145) * 100}%` }} onChange={(e) => setDistance(Number(e.target.value))} />
              <button className="btn primary block" onClick={startDrive}>🔑 시동 걸기</button>
            </div>
          ) : (
            <div className="card">
              <div className="row between"><h2 className="t-heading">🛣️ 주행 중</h2><span className="t-number">{kmNow} / {distance}km</span></div>
              <div className="track"><div style={{ width: `${driveProgress}%` }} /></div>
              <p className="t-caption">{STYLE_LABEL[style]}</p>
              <button className="btn dark block" onClick={getOff}>🚪 하차하고 오늘의 일기 보기</button>
            </div>
          )}
        </section>
      )}

      {tab === 'diary' && (
        <section className="screen">
          <div>
            <h1 className="t-display"><span className="emoji">📔</span> {car.nickname}의 일기장</h1>
            <p className="t-label muted">함께 달린 날마다 한 장씩 쌓여요</p>
          </div>
          <div className="summary">
            <div style={{ background: 'var(--brand-yellow-soft)' }}><b className="t-number">{progress.tripCount}</b><span className="t-caption">함께 달린 날</span></div>
            <div style={{ background: 'var(--accent-sky-soft)' }}><b className="t-number">{progress.totalKm}km</b><span className="t-caption">누적 거리</span></div>
            <div style={{ background: 'var(--accent-pink-soft)' }}><b className="t-number">{progress.fixes}회</b><span className="t-caption">돌봐준 횟수</span></div>
          </div>
          {progress.diaries.length === 0 ? (
            <div className="empty">
              <CarCharacter color={car.bodyColor} mood="sleepy" cosmetic={progress.equipped} size={180} />
              <p className="t-label muted">아직 일기가 없어요. 함께 드라이브를 떠나 볼까요?</p>
              <button className="btn primary" onClick={() => setTab('drive')}>🛣️ 운전하러 가기</button>
            </div>
          ) : (
            <ul className="diaries">
              {progress.diaries.map((d) => (
                <li key={d.id}>
                  <button className="diary-card" onClick={() => setOpenDiary(d)}>
                    <span className="stamp">{d.stamp}</span>
                    <span className="diary-meta">
                      <b className="t-heading">{d.title}</b>
                      <span className="t-caption">{new Date(d.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} · {d.distanceKm}km · {d.place}</span>
                    </span>
                    <span className="xp-pill">+{d.xpGained}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'closet' && (
        <section className="screen">
          <div>
            <h1 className="t-display"><span className="emoji">👗</span> 꾸미기</h1>
            <p className="t-label muted">잘 달리고, 잘 돌봐줄수록 새로운 모습이 열려요</p>
          </div>
          <div className="preview"><CarCharacter color={car.bodyColor} mood="happy" cosmetic={progress.equipped} size={236} /></div>
          <XPBar level={level} xp={xpInLevel} />
          <div className="closet">
            {COSMETICS.map((c) => {
              const open = c.unlocked(progress);
              const on = progress.equipped === c.id;
              return (
                <button key={c.id} disabled={!open} className={`tile ${on ? 'on' : ''}`} onClick={() => updateProgress((p) => ({ ...p, equipped: c.id }))}>
                  <span className="tile-thumb">
                    <CarCharacter color={car.bodyColor} mood="happy" cosmetic={c.id} size={92} />
                    {!open && <span className="tile-lock">🔒</span>}
                  </span>
                  <b className="t-label">{c.name}</b>
                  <span className={`t-caption ${on ? 'on-text' : ''}`}>{open ? (on ? '착용 중' : '착용하기') : c.condition}</span>
                </button>
              );
            })}
          </div>
          <div className="card stats-summary">
            <span className="t-label">🚗 {progress.tripCount}회</span><span className="t-label">🛣️ {progress.totalKm}km</span><span className="t-label">🔧 {progress.fixes}회</span><span className="t-label">🌿 {progress.calmTrips}회</span>
          </div>
          {simulator && (
            <button className="btn ghost" onClick={() => {
              if (!confirm('시뮬레이터와 성장 기록을 모두 초기화할까요?')) return;
              simulator?.reset(); localStorage.removeItem('oca.progress.v1'); location.reload();
            }}>시연 데이터 초기화</button>
          )}
          {dataSource.kind === 'hyundai' && <button className="btn ghost" onClick={logout}>현대 계정 연결 끊기</button>}
        </section>
      )}

      <nav className="tabs">
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} disabled={driving && id !== 'drive'} aria-label={label}>
            <span>{icon}</span><span className="tab-label">{label}</span>
          </button>
        ))}
      </nav>

      {openDiary && (
        <div className="modal" onClick={() => setOpenDiary(null)}>
          <div className="paper-wrap" onClick={(e) => e.stopPropagation()}>
            <CarCharacter color={car.bodyColor} mood="happy" cosmetic={progress.equipped} size={170} />
            <article className="paper">
              <p className="t-caption">{new Date(openDiary.date).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' })}</p>
              <h3 className="t-title"><span className="emoji">📔</span> {car.nickname}의 일기 — {openDiary.title}</h3>
              <p className="t-diary">{openDiary.body.replace(/^.*의 일기\n\n/, '')}</p>
              <div className="paper-chips">
                <span style={{ background: 'var(--accent-sky-soft)' }}>🛣️ {openDiary.distanceKm}km</span>
                <span style={{ background: 'var(--brand-yellow-soft)' }}>⭐ +{openDiary.xpGained} XP</span>
                <span style={{ background: 'var(--accent-pink-soft)' }}>📍 {openDiary.place}</span>
              </div>
              <button className="btn primary block" onClick={() => setOpenDiary(null)}>일기장에 붙이기 ✨</button>
            </article>
          </div>
        </div>
      )}

      {carSheet && simulator && (
        <CarSheet
          initial={simulator.config}
          onClose={() => setCarSheet(false)}
          onSave={(c) => { simulator?.setCar(c); setCarSheet(false); refresh(); showToast(`🚗 ${c.nickname}(으)로 바꿨어요!`); }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function XPBar({ level, xp }: { level: number; xp: number }) {
  return (
    <div className="xpbar" aria-label="경험치">
      <span className="lv-pill">Lv.{level}</span>
      <div className="track"><div style={{ width: `${(xp / XP_PER_LEVEL) * 100}%` }} /></div>
      <span className="t-caption">{xp}/{XP_PER_LEVEL}</span>
    </div>
  );
}

function Stage({ mood, line, cosmetic, color, road, moving, driving }: {
  mood: Mood; line: string; cosmetic: Progress['equipped']; color: CarProfile['bodyColor']; road?: boolean; moving?: boolean; driving?: boolean;
}) {
  return (
    <div className={`stage mood-${mood} ${road ? 'road' : ''} ${road && driving ? 'tall' : ''} ${moving ? 'moving' : ''}`}>
      <div className="bubble">{line}</div>
      {road && (
        <>
          <span className="cloud" style={{ left: 40, top: 70, width: 70, height: 30 }} />
          <span className="cloud" style={{ left: 240, top: 96, width: 90, height: 38 }} />
          <span className="grass" />
          <span className="road-strip"><span className="lanes" /></span>
        </>
      )}
      <CarCharacter color={color} mood={mood} cosmetic={cosmetic} driving={driving} size={road ? 266 : 282} />
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-top"><span>{icon}</span><span className="t-caption">{label}</span></div>
      <b className="t-number">{value}</b>
      <div className="track thin"><div style={{ width: `${value}%` }} /></div>
    </div>
  );
}
