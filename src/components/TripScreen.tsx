// 여행 탭: 날씨·운전 팁 / AI 여행지 추천 / 주변 찾기 / 소모품 관리 / 이번 주 운전 리포트
import { CarFront, Coffee, Compass, Droplets, Fuel, LocateFixed, RefreshCw, Sparkles, SquareParking, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CarProfile, Trip, VehicleSnapshot } from '../api/types';
import { recommendTrips, type TripIdea } from '../voice/gemini';

// ---------- 날씨 (Open-Meteo, 무료·키 없음) ----------
interface Weather { temp: number; code: number; rainProb: number; wind: number; max: number; min: number }
const WMO: [number[], string][] = [
  [[0], '맑음'], [[1, 2], '구름 조금'], [[3], '흐림'], [[45, 48], '안개'],
  [[51, 53, 55, 56, 57], '이슬비'], [[61, 63, 65, 66, 67, 80, 81, 82], '비'], [[71, 73, 75, 77, 85, 86], '눈'], [[95, 96, 99], '뇌우'],
];
const wmoText = (c: number) => WMO.find(([cs]) => cs.includes(c))?.[1] ?? '알 수 없음';

function driveTip(w: Weather, ev: boolean): string {
  const t = wmoText(w.code);
  if (t === '눈') return '눈길엔 평소보다 천천히, 차간 거리를 두 배로 벌려 주세요.';
  if (t === '비' || t === '이슬비' || w.rainProb >= 60) return '비 소식이 있어요. 워셔액과 와이퍼를 확인하고 감속 운전해요.';
  if (t === '안개') return '안개가 있어요. 전조등을 켜고 속도를 줄여 주세요.';
  if (w.temp <= 0) return ev ? '추운 날엔 배터리 효율이 떨어져요. 출발 전 미리 실내를 데워 두세요.' : '추운 날엔 타이어 공기압이 낮아져요. 출발 전 확인해 주세요.';
  if (w.temp >= 30) return '더운 날이에요. 주차할 땐 그늘을 찾고 실내 온도를 미리 낮춰 두세요.';
  if (w.wind >= 30) return '바람이 강해요. 다리 위나 고속도로에서 핸들을 단단히 잡아 주세요.';
  return '드라이브하기 좋은 날씨예요!';
}

// ---------- 주변 찾기 (지도 앱 검색 링크) ----------
const NEARBY = (ev: boolean): [LucideIcon, string, string][] => [
  ev ? [Zap, '충전소', '전기차 충전소'] : [Fuel, '주유소', '주유소'],
  [Droplets, '세차장', '세차장'],
  [SquareParking, '주차장', '주차장'],
  [Coffee, '드라이브 카페', '드라이브스루 카페'],
  [Wrench, '정비소', '현대 블루핸즈'],
];
const kakaoSearch = (q: string) => `https://map.kakao.com/link/search/${encodeURIComponent(q)}`;
const naverSearch = (q: string) => `https://map.naver.com/p/search/${encodeURIComponent(q)}`;

// ---------- 소모품 관리 (이 기기에 저장) ----------
interface Part { id: string; name: string; every: number; evOnly?: boolean; iceOnly?: boolean }
const PARTS: Part[] = [
  { id: 'oil', name: '엔진오일', every: 10000, iceOnly: true },
  { id: 'rotation', name: '타이어 위치 교환', every: 10000 },
  { id: 'wiper', name: '와이퍼', every: 12000 },
  { id: 'cabin', name: '에어컨 필터', every: 15000 },
  { id: 'brake', name: '브레이크액', every: 40000 },
  { id: 'tire', name: '타이어 교체', every: 50000 },
];
const PARTS_KEY = 'oca.parts.v1';
function loadParts(odo: number): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(PARTS_KEY) ?? '');
    if (v && typeof v === 'object') return v;
  } catch { /* 처음 */ }
  // 처음엔 적당히 지난 상태로 시작 (데모가 비어 보이지 않게)
  const seed: Record<string, number> = {};
  PARTS.forEach((p, i) => { seed[p.id] = Math.max(0, odo - Math.round(p.every * [0.92, 0.55, 0.8, 0.35, 0.2, 0.45][i])); });
  return seed;
}

const HOURS = ['1시간', '반나절', '하루'] as const;
const MOODS = ['바다', '산', '카페', '맛집', '야경', '공원'] as const;

export function TripScreen({ car, snap, trips, onXp }: { car: CarProfile; snap: VehicleSnapshot; trips: Trip[]; onXp: (xp: number, msg: string) => void }) {
  const ev = car.fuelType === 'ev';
  const [pos, setPos] = useState<{ lat: number; lng: number; name: string; mine: boolean }>(() => ({
    lat: snap.parking?.lat ?? 37.5665, lng: snap.parking?.lng ?? 126.978, name: '서울', mine: false,
  }));
  const [locating, setLocating] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [hours, setHours] = useState<(typeof HOURS)[number]>('반나절');
  const [mood, setMood] = useState<(typeof MOODS)[number]>('바다');
  const [ideas, setIdeas] = useState<TripIdea[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parts, setParts] = useState<Record<string, number>>(() => loadParts(snap.odometerKm));

  // 주행 가능 거리 기준 편도 한도 (왕복 + 여유 20%)
  const maxKm = Math.max(10, Math.min(snap.dteKm / 2.4, hours === '1시간' ? 40 : hours === '반나절' ? 120 : 250));

  // 위치 이름 + 날씨
  useEffect(() => {
    let alive = true;
    fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.lat}&longitude=${pos.lng}&localityLanguage=ko`)
      .then((r) => r.json())
      .then((j) => { if (alive) setPos((p) => ({ ...p, name: [...new Set([j.principalSubdivision, j.city || j.locality].filter(Boolean))].join(' ') || p.name })); })
      .catch(() => {});
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lng}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.current) return;
        setWeather({
          temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, wind: Math.round(j.current.wind_speed_10m),
          max: Math.round(j.daily.temperature_2m_max[0]), min: Math.round(j.daily.temperature_2m_min[0]), rainProb: j.daily.precipitation_probability_max[0] ?? 0,
        });
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.lat, pos.lng]);

  const locate = () => {
    if (!navigator.geolocation) return setErr('이 브라우저는 위치를 지원하지 않아요');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, name: '내 위치', mine: true }); setLocating(false); setIdeas(null); },
      () => { setLocating(false); setErr('위치 권한이 없어서 마지막 주차 위치 기준으로 추천해요'); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const recommend = async () => {
    setLoading(true);
    setErr(null);
    try {
      setIdeas(await recommendTrips({
        place: pos.name, lat: pos.lat, lng: pos.lng, maxKm, hours, mood,
        car: `${car.model} ${ev ? '전기차' : ''} (주행 가능 ${snap.dteKm}km)`,
        weather: weather ? `${wmoText(weather.code)} ${weather.temp}°C, 강수확률 ${weather.rainProb}%` : '알 수 없음',
      }));
    } catch (e) {
      setErr((e as Error).message.includes('키') ? '대화 AI가 연결되지 않아 추천할 수 없어요' : '추천을 못 받았어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const doneParts = (p: Part) => {
    const next = { ...parts, [p.id]: snap.odometerKm };
    setParts(next);
    try { localStorage.setItem(PARTS_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
    onXp(15, `${p.name} 교체 완료 · +15 XP`);
  };

  // 이번 주(최근 7일) 운전 리포트
  const week = useMemo(() => {
    const since = Date.now() - 7 * 86400000;
    const w = trips.filter((t) => new Date(t.endedAt).getTime() >= since);
    const km = w.reduce((a, t) => a + t.distanceKm, 0);
    const min = w.reduce((a, t) => a + t.durationMin, 0);
    const brakes = w.reduce((a, t) => a + t.hardBrakes, 0);
    const calm = w.length ? Math.round((w.filter((t) => t.hardBrakes === 0).length / w.length) * 100) : 0;
    return { n: w.length, km: Math.round(km * 10) / 10, avg: min ? Math.round(km / (min / 60)) : 0, brakes, calm };
  }, [trips]);

  return (
    <section className="screen trip">
      <div className="title-row">
        <h1 className="h1">어디로 갈까요?</h1>
        <Compass size={20} className="muted" />
      </div>

      {/* 날씨 */}
      <div className="card">
        <div className="card-head">
          <span className="cap loc">{pos.mine ? <LocateFixed size={12} /> : <CarFront size={12} />} {pos.name}</span>
          <button className="btn text sm-link" onClick={locate} disabled={locating}>{locating ? '찾는 중…' : '내 위치로'}</button>
        </div>
        {weather ? (
          <>
            <div className="weather">
              <b className="big">{weather.temp}°</b>
              <span className="label">{wmoText(weather.code)}</span>
              <span className="cap">오늘 최고 {weather.max}° · 최저 {weather.min}° · 강수 확률 {weather.rainProb}% · 바람 {weather.wind}km/h</span>
            </div>
            <p className="tip">{driveTip(weather, ev)}</p>
          </>
        ) : <p className="cap">날씨를 불러오는 중…</p>}
      </div>

      {/* AI 여행지 추천 */}
      <div className="card">
        <div className="card-head"><b className="h3">AI 여행지 추천</b><span className="cap">편도 {Math.round(maxKm)}km 이내</span></div>
        <div className="chip-row">{HOURS.map((h) => <button key={h} className={`chip sm ${hours === h ? 'on' : ''}`} onClick={() => { setHours(h); setIdeas(null); }}>{h}</button>)}</div>
        <div className="chip-row">{MOODS.map((m) => <button key={m} className={`chip sm ${mood === m ? 'on' : ''}`} onClick={() => { setMood(m); setIdeas(null); }}>{m}</button>)}</div>
        <button className="btn primary block" onClick={recommend} disabled={loading}>
          {loading ? <><RefreshCw size={16} className="spin" /> 오닉이가 찾는 중…</> : <><Sparkles size={16} /> {ideas ? '다시 추천받기' : '추천받기'}</>}
        </button>
        {err && <p className="cap gps-err">{err}</p>}
        {ideas?.map((t) => (
          <div key={t.name} className="idea">
            <div className="card-head"><b className="label">{t.name}</b><span className="cap">{t.distanceKm}km · 약 {t.driveMin}분</span></div>
            <span className="cap">{t.area} · {t.tag}</span>
            <p className="why">{t.why}</p>
            <div className="idea-links">
              <a className="btn outline sm" href={kakaoSearch(t.name)} target="_blank" rel="noreferrer">카카오맵</a>
              <a className="btn outline sm" href={naverSearch(t.name)} target="_blank" rel="noreferrer">네이버 지도</a>
            </div>
          </div>
        ))}
        {ideas && <p className="cap credit">Google 검색으로 확인한 장소예요. 운영 시간은 지도에서 한 번 더 확인해 주세요.</p>}
      </div>

      {/* 주변 찾기 */}
      <div className="card">
        <div className="card-head"><b className="h3">주변 찾기</b><span className="cap">지도 앱으로 열려요</span></div>
        <div className="nearby">
          {NEARBY(ev).map(([Icon, label, q]) => (
            <a key={label} className="near-btn" href={kakaoSearch(q)} target="_blank" rel="noreferrer"><Icon size={20} strokeWidth={1.6} /><span>{label}</span></a>
          ))}
        </div>
      </div>

      {/* 소모품 관리 */}
      <div className="card">
        <div className="card-head"><b className="h3">소모품 관리</b><span className="cap">누적 {snap.odometerKm.toLocaleString()}km 기준</span></div>
        {PARTS.filter((p) => !(p.iceOnly && ev) && !(p.evOnly && !ev)).map((p) => {
          const used = Math.max(0, snap.odometerKm - (parts[p.id] ?? snap.odometerKm));
          const pct = Math.min(100, Math.round((used / p.every) * 100));
          const left = Math.max(0, p.every - used);
          return (
            <div key={p.id} className="part">
              <div className="card-head">
                <span className="label">{p.name}</span>
                <span className={`cap ${pct >= 90 ? 'due' : ''}`}>{pct >= 100 ? '교체할 때예요' : `${left.toLocaleString()}km 남음`}</span>
              </div>
              <div className={`bar thin ${pct >= 90 ? 'bad' : ''}`}><div style={{ width: `${pct}%` }} /></div>
              {pct >= 80 && <button className="btn outline sm" onClick={() => doneParts(p)}>교체 완료 +15 XP</button>}
            </div>
          );
        })}
      </div>

      {/* 이번 주 운전 리포트 */}
      <div className="card">
        <div className="card-head"><b className="h3">이번 주 운전 리포트</b><span className="cap">최근 7일</span></div>
        {week.n === 0 ? (
          <p className="cap">이번 주에는 아직 함께 달린 기록이 없어요.</p>
        ) : (
          <>
            <div className="grid3">
              <div className="tile-stat"><span className="cap">주행</span><b className="num">{week.km}<small>km</small></b></div>
              <div className="tile-stat"><span className="cap">평균 속도</span><b className="num">{week.avg}<small>km/h</small></b></div>
              <div className="tile-stat"><span className="cap">급정거</span><b className="num">{week.brakes}<small>회</small></b></div>
            </div>
            <p className="tip">{week.calm >= 80 ? `부드러운 운전 ${week.calm}%! 오닉이가 아주 편안했대요.` : week.brakes > 3 ? `급정거가 ${week.brakes}번 있었어요. 차간 거리를 조금 더 두면 좋아요.` : `이번 주 ${week.n}번 함께 달렸어요. 다음 주도 안전하게!`}</p>
          </>
        )}
      </div>
    </section>
  );
}
