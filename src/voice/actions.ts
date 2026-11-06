// 음성으로 처리하는 기능들 (Live AI가 '도구'로 직접 호출, 또는 키워드로 실행)
//  - recommend_places: AI 여행지 추천 (Google 검색으로 실제 장소)
//  - find_nearby: 주변 충전소·주유소·세차장·주차장·카페·정비소 → 지도 검색 링크
//  - get_weather: 현재 위치(또는 주차 위치) 날씨 + 운전 팁
//  - check_maintenance: 소모품 남은 거리
//  - weekly_report: 최근 7일 운전 요약
import { secureStorage } from '../security/secureStorage';
import type { CarProfile, Trip, VehicleSnapshot } from '../api/types';
import { recommendTrips, type TripIdea } from './gemini';

export interface ActionCtx { car: CarProfile; snap: VehicleSnapshot; trips: Trip[] }

/** 화면에 보여 줄 결과 카드 */
export type ActionCard =
  | { kind: 'places'; items: TripIdea[] }
  | { kind: 'nearby'; label: string; kakao: string; naver: string }
  | { kind: 'weather'; place: string; temp: number; text: string; max: number; min: number; rain: number; tip: string }
  | { kind: 'parts'; items: { name: string; left: number; pct: number }[] }
  | { kind: 'report'; n: number; km: number; avg: number; brakes: number; calm: number };

export interface ActionResult { card: ActionCard; data: Record<string, unknown> }

// ---------- 공용: 위치 ----------
let lastPos: { lat: number; lng: number; name: string } | null = null;
async function position(ctx: ActionCtx) {
  if (lastPos) return lastPos;
  const fallback = { lat: ctx.snap.parking?.lat ?? 37.5665, lng: ctx.snap.parking?.lng ?? 126.978 };
  const p = await new Promise<{ lat: number; lng: number }>((ok) => {
    if (!navigator.geolocation) return ok(fallback);
    navigator.geolocation.getCurrentPosition((g) => ok({ lat: g.coords.latitude, lng: g.coords.longitude }), () => ok(fallback), { timeout: 6000, maximumAge: 600000 });
  });
  let name = '현재 위치';
  try {
    const j = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${p.lat.toFixed(2)}&longitude=${p.lng.toFixed(2)}&localityLanguage=ko`)).json();
    name = [...new Set([j.principalSubdivision, j.city || j.locality].filter(Boolean))].join(' ') || name;
  } catch { /* 이름 없이 */ }
  lastPos = { ...p, name };
  return lastPos;
}

// ---------- 날씨 ----------
const WMO: [number[], string][] = [
  [[0], '맑음'], [[1, 2], '구름 조금'], [[3], '흐림'], [[45, 48], '안개'],
  [[51, 53, 55, 56, 57], '이슬비'], [[61, 63, 65, 66, 67, 80, 81, 82], '비'], [[71, 73, 75, 77, 85, 86], '눈'], [[95, 96, 99], '뇌우'],
];
const wmoText = (c: number) => WMO.find(([cs]) => cs.includes(c))?.[1] ?? '알 수 없음';
function tipFor(text: string, temp: number, rain: number, wind: number, ev: boolean) {
  if (text === '눈') return '눈길엔 천천히, 차간 거리를 두 배로 벌려 주세요.';
  if (text === '비' || text === '이슬비' || rain >= 60) return '비 소식이 있어요. 워셔액과 와이퍼를 확인하고 감속 운전해요.';
  if (text === '안개') return '안개가 있어요. 전조등을 켜고 속도를 줄여 주세요.';
  if (temp <= 0) return ev ? '추운 날엔 배터리 효율이 떨어져요. 출발 전 실내를 미리 데워 두세요.' : '추운 날엔 타이어 공기압이 낮아져요.';
  if (temp >= 30) return '더운 날이에요. 그늘에 주차하고 실내 온도를 미리 낮춰 두세요.';
  if (wind >= 30) return '바람이 강해요. 핸들을 단단히 잡아 주세요.';
  return '드라이브하기 좋은 날씨예요!';
}

export async function getWeather(ctx: ActionCtx): Promise<ActionResult> {
  const p = await position(ctx);
  const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(2)}&longitude=${p.lng.toFixed(2)}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1`)).json();
  const text = wmoText(j.current.weather_code);
  const temp = Math.round(j.current.temperature_2m);
  const rain = j.daily.precipitation_probability_max[0] ?? 0;
  const card: ActionCard = {
    kind: 'weather', place: p.name, temp, text, rain,
    max: Math.round(j.daily.temperature_2m_max[0]), min: Math.round(j.daily.temperature_2m_min[0]),
    tip: tipFor(text, temp, rain, Math.round(j.current.wind_speed_10m), ctx.car.fuelType === 'ev'),
  };
  return { card, data: { 위치: p.name, 날씨: text, 기온: temp, 오늘최고: card.max, 오늘최저: card.min, 강수확률: rain, 운전팁: card.tip } };
}

// ---------- 주변 찾기 ----------
const NEARBY: Record<string, [string, string]> = {
  charger: ['충전소', '전기차 충전소'], gas: ['주유소', '주유소'], wash: ['세차장', '세차장'],
  parking: ['주차장', '주차장'], cafe: ['드라이브 카페', '드라이브스루 카페'], repair: ['정비소', '현대 블루핸즈'], hydrogen: ['수소 충전소', '수소충전소'],
};
export function findNearby(ctx: ActionCtx, kind: string): ActionResult {
  let k = kind in NEARBY ? kind : 'parking';
  if (k === 'gas' && ctx.car.fuelType === 'ev') k = 'charger';
  if ((k === 'gas' || k === 'charger') && ctx.car.fuelType === 'hydrogen') k = 'hydrogen';
  const [label, q] = NEARBY[k];
  return {
    card: { kind: 'nearby', label, kakao: `https://map.kakao.com/link/search/${encodeURIComponent(q)}`, naver: `https://map.naver.com/p/search/${encodeURIComponent(q)}` },
    data: { 결과: `${label} 지도 검색 버튼을 화면에 띄웠어요. 사용자가 누르면 지도 앱이 열려요.` },
  };
}

// ---------- 여행지 추천 ----------
export async function recommendPlaces(ctx: ActionCtx, mood = '드라이브', hours = '반나절'): Promise<ActionResult> {
  const p = await position(ctx);
  const maxKm = Math.max(10, Math.min(ctx.snap.dteKm / 2.4, hours.includes('1') ? 40 : hours.includes('하루') ? 250 : 120));
  let weather = '알 수 없음';
  try { const w = (await getWeather(ctx)).card; if (w.kind === 'weather') weather = `${w.text} ${w.temp}°C`; } catch { /* 없이 */ }
  const items = await recommendTrips({
    place: p.name, lat: p.lat, lng: p.lng, maxKm, hours, mood, weather,
    car: `${ctx.car.model} (주행 가능 ${ctx.snap.dteKm}km)`,
  });
  return {
    card: { kind: 'places', items },
    data: { 추천: items.map((t) => ({ 이름: t.name, 지역: t.area, 거리km: t.distanceKm, 이유: t.why })), 안내: '화면에 지도 버튼과 함께 띄웠어요.' },
  };
}

// ---------- 소모품 ----------
interface Part { id: string; name: string; every: number; iceOnly?: boolean }
export const PARTS: Part[] = [
  { id: 'oil', name: '엔진오일', every: 10000, iceOnly: true },
  { id: 'rotation', name: '타이어 위치 교환', every: 10000 },
  { id: 'wiper', name: '와이퍼', every: 12000 },
  { id: 'cabin', name: '에어컨 필터', every: 15000 },
  { id: 'brake', name: '브레이크액', every: 40000 },
  { id: 'tire', name: '타이어 교체', every: 50000 },
];
const PARTS_KEY = 'oca.parts.v1';
export function loadParts(odo: number): Record<string, number> {
  try {
    const v = JSON.parse(secureStorage.getItem(PARTS_KEY) ?? '');
    if (v && typeof v === 'object') return v;
  } catch { /* 처음 */ }
  const seed: Record<string, number> = {};
  PARTS.forEach((p, i) => { seed[p.id] = Math.max(0, odo - Math.round(p.every * [0.92, 0.55, 0.8, 0.35, 0.2, 0.45][i])); });
  try { secureStorage.setItem(PARTS_KEY, JSON.stringify(seed)); } catch { /* 무시 */ }
  return seed;
}
export function markReplaced(id: string, odo: number) {
  const v = loadParts(odo);
  v[id] = odo;
  try { secureStorage.setItem(PARTS_KEY, JSON.stringify(v)); } catch { /* 무시 */ }
}
export function partsStatus(ctx: Pick<ActionCtx, 'car' | 'snap'>) {
  const odo = ctx.snap.odometerKm;
  const last = loadParts(odo);
  return PARTS.filter((p) => !(p.iceOnly && ctx.car.fuelType === 'ev')).map((p) => {
    const used = Math.max(0, odo - (last[p.id] ?? odo));
    return { id: p.id, name: p.name, left: Math.max(0, p.every - used), pct: Math.min(100, Math.round((used / p.every) * 100)) };
  });
}
export function checkMaintenance(ctx: ActionCtx): ActionResult {
  const items = partsStatus(ctx).sort((a, b) => b.pct - a.pct);
  return { card: { kind: 'parts', items }, data: { 소모품: items.map((i) => ({ 이름: i.name, 남은km: i.left, 사용률: `${i.pct}%` })) } };
}

// ---------- 주간 리포트 ----------
export function weeklyReport(ctx: ActionCtx): ActionResult {
  const since = Date.now() - 7 * 86400000;
  const w = ctx.trips.filter((t) => new Date(t.endedAt).getTime() >= since);
  const km = Math.round(w.reduce((a, t) => a + t.distanceKm, 0) * 10) / 10;
  const min = w.reduce((a, t) => a + t.durationMin, 0);
  const brakes = w.reduce((a, t) => a + t.hardBrakes, 0);
  const calm = w.length ? Math.round((w.filter((t) => t.hardBrakes === 0).length / w.length) * 100) : 0;
  const avg = min ? Math.round(km / (min / 60)) : 0;
  return { card: { kind: 'report', n: w.length, km, avg, brakes, calm }, data: { 주행횟수: w.length, 거리km: km, 평균속도: avg, 급정거: brakes, 부드러운운전비율: `${calm}%` } };
}

// ---------- 도구 실행 (Live AI가 부름) ----------
export async function runTool(name: string, args: Record<string, unknown>, ctx: ActionCtx): Promise<ActionResult> {
  switch (name) {
    case 'recommend_places': return recommendPlaces(ctx, String(args.mood ?? '드라이브'), String(args.hours ?? '반나절'));
    case 'find_nearby': return findNearby(ctx, String(args.kind ?? 'parking'));
    case 'get_weather': return getWeather(ctx);
    case 'check_maintenance': return checkMaintenance(ctx);
    case 'weekly_report': return weeklyReport(ctx);
    default: throw new Error(`모르는 도구: ${name}`);
  }
}

/** 키워드로 도구 고르기 (Live가 안 될 때 기존 방식에서 사용) */
export function detectTool(text: string): { name: string; args: Record<string, unknown> } | null {
  const q = text.replace(/\s+/g, '');
  const has = (...w: string[]) => w.some((x) => q.includes(x));
  if (has('여행', '추천', '어디갈', '놀러', '드라이브코스', '갈만한')) {
    const mood = ['바다', '산', '카페', '맛집', '야경', '공원'].find((m) => q.includes(m)) ?? '드라이브';
    return { name: 'recommend_places', args: { mood, hours: has('하루') ? '하루' : has('한시간', '1시간', '잠깐') ? '1시간' : '반나절' } };
  }
  if (has('충전소')) return { name: 'find_nearby', args: { kind: 'charger' } };
  if (has('주유소', '기름넣')) return { name: 'find_nearby', args: { kind: 'gas' } };
  if (has('세차')) return { name: 'find_nearby', args: { kind: 'wash' } };
  if (has('주차장')) return { name: 'find_nearby', args: { kind: 'parking' } };
  if (has('정비소', '블루핸즈', '카센터')) return { name: 'find_nearby', args: { kind: 'repair' } };
  if (has('카페')) return { name: 'find_nearby', args: { kind: 'cafe' } };
  if (has('날씨', '비와', '눈와', '추워', '더워')) return { name: 'get_weather', args: {} };
  if (has('소모품', '교체', '엔진오일', '와이퍼', '필터', '정비언제')) return { name: 'check_maintenance', args: {} };
  if (has('리포트', '이번주', '운전습관', '운전어땠')) return { name: 'weekly_report', args: {} };
  return null;
}

/** 서버 토큰에 등록할 도구 설명 (Live 함수 호출) */
export const LIVE_TOOLS = [{
  functionDeclarations: [
    { name: 'recommend_places', description: '사용자가 여행지·드라이브 코스·갈 만한 곳 추천을 원할 때. 현재 위치와 주행 가능 거리 안에서 실제 장소 3곳을 찾아 화면에 지도 버튼과 함께 보여 준다.',
      parameters: { type: 'OBJECT', properties: { mood: { type: 'STRING', description: '바다, 산, 카페, 맛집, 야경, 공원, 드라이브 중 하나' }, hours: { type: 'STRING', description: '1시간, 반나절, 하루 중 하나' } } } },
    { name: 'find_nearby', description: '주변 충전소·주유소·세차장·주차장·카페·정비소를 찾아 달라고 할 때. 화면에 지도 검색 버튼을 띄운다.',
      parameters: { type: 'OBJECT', properties: { kind: { type: 'STRING', description: 'charger, gas, wash, parking, cafe, repair 중 하나' } }, required: ['kind'] } },
    { name: 'get_weather', description: '날씨나 오늘 운전하기 괜찮은지 물을 때.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'check_maintenance', description: '소모품(엔진오일, 타이어, 와이퍼, 필터, 브레이크액) 교체 시기를 물을 때.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'weekly_report', description: '이번 주 운전 기록, 운전 습관, 급정거 등을 물을 때.', parameters: { type: 'OBJECT', properties: {} } },
  ],
}];

/** 기존 방식(Live 안 될 때)에서 결과를 한두 문장으로 */
export function summaryOf(card: ActionCard): string {
  switch (card.kind) {
    case 'places': return card.items.length ? `${card.items.map((t) => t.name).join(', ')} 어때요? 화면에 지도 버튼을 띄워 드렸어요.` : '지금은 추천할 곳을 못 찾았어요.';
    case 'nearby': return `주변 ${card.label} 지도를 바로 열 수 있게 띄워 드렸어요.`;
    case 'weather': return `${card.place}는 지금 ${card.text}, ${card.temp}도예요. ${card.tip}`;
    case 'parts': {
      const due = card.items.filter((i) => i.pct >= 90);
      return due.length ? `${due.map((i) => i.name).join(', ')} 교체할 때가 됐어요.` : `${card.items[0].name}이 ${card.items[0].left.toLocaleString()}km 남아서 제일 먼저예요.`;
    }
    case 'report': return card.n ? `이번 주 ${card.n}번, ${card.km}km 함께 달렸고 급정거는 ${card.brakes}번이었어요.` : '이번 주에는 아직 함께 달린 기록이 없어요.';
  }
}

/** 홈 브리핑용 날씨: 위치 권한 없이 주차 위치 기준 */
export async function quickWeather(lat: number, lng: number, ev: boolean) {
  const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m&daily=precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1`)).json();
  const text = wmoText(j.current.weather_code);
  const temp = Math.round(j.current.temperature_2m);
  const rain = j.daily.precipitation_probability_max[0] ?? 0;
  return { text, temp, rain, tip: tipFor(text, temp, rain, Math.round(j.current.wind_speed_10m), ev) };
}
