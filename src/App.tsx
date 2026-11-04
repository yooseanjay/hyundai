import { useCallback, useEffect, useRef, useState } from 'react';
import { dataSource, simulator, WARNING_LABELS, type CarProfile, type Trip, type VehicleSnapshot, type WarningKey } from './api';
import { startLogin } from './api/hyundaiClient';
import { CarCharacter } from './components/CarCharacter';
import { computeStatus } from './game/character';
import { writeDiary, type DiaryEntry } from './game/diary';
import {
  COSMETICS, levelOf, loadProgress, newlyUnlocked, saveProgress, xpForTrip,
  XP_FOR_CHARGE, XP_FOR_FIX, XP_PER_LEVEL, type Progress,
} from './game/progress';

type Tab = 'home' | 'drive' | 'diary' | 'closet';
type Style = 'calm' | 'normal' | 'sporty';

const STYLE_LABEL: Record<Style, string> = { calm: '🌿 차분하게', normal: '🚗 보통', sporty: '🔥 신나게' };

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [car, setCar] = useState<CarProfile | null>(null);
  const [snap, setSnap] = useState<VehicleSnapshot | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [openDiary, setOpenDiary] = useState<DiaryEntry | null>(null);

  // 운전 상태
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
          showToast(fixed.length ? `💖 ${fixed.map((k) => WARNING_LABELS[k]).join(', ')} 회복! +${gain}XP` : `⚡ 배불러요! +${gain}XP`);
        }
      }
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [updateProgress]);

  useEffect(() => {
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
        return p + 2.5;
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
      </main>
    );
  if (!car || !snap) return <main className="app center"><p>차가 깨어나는 중… 🚗💤</p></main>;

  const st = computeStatus(snap, trips, driving);
  const level = levelOf(progress.xp);
  const xpInLevel = progress.xp % XP_PER_LEVEL;

  return (
    <main className="app">
      <header className="top">
        <div>
          <p className="eyebrow">우리 차가 살아있다면</p>
          <h1>{car.nickname} <span className="lv">Lv.{level}</span></h1>
          <p className="sub">{car.model} · 누적 {snap.odometerKm.toLocaleString()}km</p>
        </div>
        <span className={`src ${dataSource.kind}`}>{dataSource.kind === 'mock' ? '시뮬레이터' : 'LIVE'}</span>
      </header>

      <div className="xpbar" aria-label="경험치">
        <div style={{ width: `${xpInLevel}%` }} />
        <span>{xpInLevel} / {XP_PER_LEVEL} XP</span>
      </div>

      {tab === 'home' && (
        <section className="screen">
          <div className={`stage bg-${st.mood}`}>
            <div className="bubble">{st.line}</div>
            <CarCharacter color={car.color} mood={st.mood} cosmetic={progress.equipped} />
          </div>

          <div className="stats">
            <Stat icon="🍙" label="에너지" value={st.energy} hint={`${snap.dteKm}km 주행 가능`} tone={st.energy < 20 ? 'bad' : 'good'} />
            <Stat icon="💖" label="건강" value={st.health} hint={st.activeWarnings.length ? `경고 ${st.activeWarnings.length}개` : '이상 없음'} tone={st.health < 60 ? 'bad' : 'good'} />
            <Stat icon="😪" label="피로도" value={st.fatigue} hint="오늘 주행량" tone={st.fatigue > 70 ? 'bad' : 'neutral'} />
          </div>

          <div className="card">
            <h2>🩺 돌봐주세요</h2>
            {st.activeWarnings.length === 0 ? (
              <p className="muted">아픈 곳이 없어요. 고마워요!</p>
            ) : (
              <ul className="care">
                {st.activeWarnings.map((k) => (
                  <li key={k}>
                    <span>⚠️ {WARNING_LABELS[k]}</span>
                    {simulator ? (
                      <button className="btn small" onClick={() => { simulator?.fix(k); refresh(snap); }}>정비 완료 +{XP_FOR_FIX[k]}XP</button>
                    ) : (
                      <span className="muted small">정비 후 새로고침하면 회복돼요</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              {simulator && car.fuelType === 'ev' && <button className="btn" onClick={() => { simulator?.charge(); refresh(snap); }}>⚡ 밥 주기(충전)</button>}
              <button className="btn ghost" onClick={() => refresh(snap)}>↻ 새로고침</button>
            </div>
          </div>

          {snap.parking && (
            <div className="card">
              <h2>📍 지금 쉬는 곳</h2>
              <p>{snap.parking.label}</p>
              <a className="muted small" href={`https://map.kakao.com/link/map/${encodeURIComponent(car.nickname)},${snap.parking.lat},${snap.parking.lng}`} target="_blank" rel="noreferrer">지도에서 보기 →</a>
            </div>
          )}
        </section>
      )}

      {tab === 'drive' && (
        <section className="screen">
          <div className={`stage road ${driving ? 'moving' : ''}`}>
            <div className="bubble">{driving ? (driveProgress >= 100 ? '도착! 내려도 돼요 🙌' : st.line) : '시동 걸어 주세요!'}</div>
            <CarCharacter color={car.color} mood={driving ? 'excited' : st.mood} cosmetic={progress.equipped} driving={driving} />
            <div className="lane" />
          </div>
          {!simulator ? (
            <div className="card">
              <p>실제 차량 모드에서는 운전을 마치고 앱을 열면 운행 정보로 일기가 자동 작성돼요.</p>
              <button className="btn" onClick={() => refresh(snap)}>운행 기록 불러오기</button>
            </div>
          ) : !driving ? (
            <div className="card">
              <h2>🧪 주행 시뮬레이터</h2>
              <p className="muted small">API 승인 전 시연용. 실제 차량에서는 운행 정보 API가 이 역할을 해요.</p>
              <label className="field">운전 스타일
                <div className="seg">
                  {(Object.keys(STYLE_LABEL) as Style[]).map((s) => (
                    <button key={s} className={style === s ? 'on' : ''} onClick={() => setStyle(s)}>{STYLE_LABEL[s]}</button>
                  ))}
                </div>
              </label>
              <label className="field">목표 거리 <b>{distance}km</b>
                <input type="range" min={5} max={150} step={5} value={distance} onChange={(e) => setDistance(Number(e.target.value))} />
              </label>
              <button className="btn primary big" onClick={startDrive}>🔑 시동 걸기</button>
            </div>
          ) : (
            <div className="card">
              <div className="progress"><div style={{ width: `${driveProgress}%` }} /></div>
              <p className="muted small">{Math.round((distance * driveProgress) / 100)} / {distance}km · {STYLE_LABEL[style]}</p>
              <button className="btn primary big" onClick={getOff}>🚪 하차하기 → 오늘의 일기</button>
            </div>
          )}
        </section>
      )}

      {tab === 'diary' && (
        <section className="screen">
          <h2 className="h">📔 {car.nickname}의 일기장</h2>
          {progress.diaries.length === 0 && <p className="muted">아직 일기가 없어요. 함께 드라이브를 떠나 보세요!</p>}
          <ul className="diaries">
            {progress.diaries.map((d) => (
              <li key={d.id}>
                <button onClick={() => setOpenDiary(d)}>
                  <span className="stamp">{d.stamp}</span>
                  <span className="meta">
                    <b>{d.title}</b>
                    <small>{new Date(d.date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} · {d.distanceKm}km · {d.place}</small>
                  </span>
                  <span className="xp">+{d.xpGained}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'closet' && (
        <section className="screen">
          <div className="stage small">
            <CarCharacter color={car.color} mood="happy" cosmetic={progress.equipped} size={180} />
          </div>
          <h2 className="h">👗 꾸미기</h2>
          <p className="muted small">잘 달리고, 잘 돌봐줄수록 새로운 모습이 열려요.</p>
          <div className="closet">
            {COSMETICS.map((c) => {
              const open = c.unlocked(progress);
              return (
                <button key={c.id} disabled={!open} className={progress.equipped === c.id ? 'on' : ''}
                  onClick={() => updateProgress((p) => ({ ...p, equipped: c.id }))}>
                  <span className="emoji">{open ? c.emoji : '🔒'}</span>
                  <b>{c.name}</b>
                  <small>{open ? (progress.equipped === c.id ? '착용 중' : '착용하기') : c.condition}</small>
                </button>
              );
            })}
          </div>
          <div className="card stats-summary">
            <span>🚗 {progress.tripCount}회</span><span>🛣️ {progress.totalKm}km</span><span>🔧 {progress.fixes}회</span><span>🌿 {progress.calmTrips}회</span>
          </div>
          {simulator && (
            <button className="btn ghost small" onClick={() => {
              if (!confirm('시뮬레이터와 성장 기록을 모두 초기화할까요?')) return;
              simulator?.reset(); localStorage.removeItem('oca.progress.v1'); location.reload();
            }}>시연 데이터 초기화</button>
          )}
        </section>
      )}

      <nav className="tabs">
        {([['home', '🏠', '홈'], ['drive', '🛣️', '운전'], ['diary', '📔', '일기장'], ['closet', '👗', '꾸미기']] as const).map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} disabled={driving && id !== 'drive'}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>

      {openDiary && (
        <div className="modal" onClick={() => setOpenDiary(null)}>
          <article className="paper" onClick={(e) => e.stopPropagation()}>
            <header>
              <span className="stamp big">{openDiary.stamp}</span>
              <div>
                <small>{new Date(openDiary.date).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' })}</small>
                <h3>{openDiary.title}</h3>
              </div>
            </header>
            <p className="hand">{openDiary.body}</p>
            <button className="btn primary" onClick={() => setOpenDiary(null)}>닫기</button>
          </article>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Stat({ icon, label, value, hint, tone }: { icon: string; label: string; value: number; hint: string; tone: 'good' | 'bad' | 'neutral' }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-top"><span>{icon} {label}</span><b>{value}</b></div>
      <div className="meter"><div style={{ width: `${value}%` }} /></div>
      <small>{hint}</small>
    </div>
  );
}
