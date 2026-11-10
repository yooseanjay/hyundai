// 내 위치 근처의 실제 도로 (OpenStreetMap 기여자, ODbL)
//  1) 위치 → 가장 가까운 도로 (Nominatim)
//  2) 그 도로 모양 + 같은 이름으로 이어지는 도로 조각을 양쪽으로 몇 개 더 (OSM API)
//  3) 내 위치에서 출발하도록 자르고, 차로 수는 OSM lanes 값 (없으면 도로 종류로 추정)
// 위치는 도로를 찾는 데 한 번만 보내고, 저장하지 않는다.
import type { RealRoad } from './realRoads';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSM = 'https://api.openstreetmap.org/api/0.6';

interface OsmNode { type: 'node'; id: number; lat: number; lon: number }
interface OsmWay { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> }
type El = OsmNode | OsmWay;

/** 휴대폰 · 브라우저 위치 (한 번) */
export function myPosition(): Promise<[number, number]> {
  return new Promise((ok, fail) => {
    if (!('geolocation' in navigator)) { fail(new Error('이 기기에서는 위치를 쓸 수 없어요')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => ok([p.coords.latitude, p.coords.longitude]),
      (e) => fail(new Error(e.code === 1 ? '위치 권한을 허용해 주세요' : '위치를 찾지 못했어요')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  });
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`지도 서버 응답 ${r.status}`);
  return r.json() as Promise<T>;
}

async function wayFull(id: number) {
  const j = await get<{ elements: El[] }>(`${OSM}/way/${id}/full.json`);
  const nodes = new Map<number, [number, number]>();
  let way: OsmWay | undefined;
  for (const e of j.elements) {
    if (e.type === 'node') nodes.set(e.id, [e.lat, e.lon]);
    else if (e.type === 'way' && e.id === id) way = e;
  }
  if (!way) throw new Error('도로 모양을 못 받았어요');
  return { way, pts: way.nodes.map((n) => nodes.get(n)).filter(Boolean) as [number, number][] };
}

const ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'service']);

/** 한쪽 방향 차로 수 */
export function lanesPerSide(tags: Record<string, string> = {}): number {
  const total = parseInt(tags.lanes ?? '', 10);
  const oneway = tags.oneway === 'yes' || tags.oneway === '1';
  let n: number;
  if (total > 0) n = oneway ? total : Math.ceil(total / 2);
  else n = ({ motorway: 3, trunk: 3, primary: 2, secondary: 2 } as Record<string, number>)[tags.highway ?? ''] ?? 1;
  return Math.max(1, Math.min(4, n));
}

function distM(a: [number, number], b: [number, number]) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * k);
}
const lengthM = (p: [number, number][]) => p.reduce((s, x, i) => (i ? s + distM(p[i - 1], x) : 0), 0);

/** 내 위치 (lat, lng) 근처 도로를 RealRoad 로 */
export async function roadNear(lat: number, lng: number): Promise<RealRoad> {
  const rv = await get<{ osm_type?: string; osm_id?: number; category?: string; name?: string; address?: Record<string, string> }>(
    `${NOMINATIM}/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&zoom=16&accept-language=ko`,
  );
  if (rv.osm_type !== 'way' || rv.category !== 'highway' || !rv.osm_id) throw new Error('근처에서 찻길을 찾지 못했어요');
  const first = await wayFull(rv.osm_id);
  const tags = first.way.tags ?? {};
  const name = tags.name ?? rv.name ?? rv.address?.road ?? '이름 없는 길';
  const same = (w: OsmWay) => !!w.tags?.highway && ROADS.has(w.tags.highway) && (tags.name ? w.tags.name === tags.name : w.tags.highway === tags.highway);

  // 같은 이름 도로 조각을 양쪽 끝으로 이어 붙이기 (최대 약 2.5km)
  let ids = [...first.way.nodes];
  let pts = [...first.pts];
  const seen = new Set([first.way.id]);
  for (const end of ['tail', 'head'] as const) {
    for (let step = 0; step < 6 && lengthM(pts) < 2500; step++) {
      const node = end === 'tail' ? ids[ids.length - 1] : ids[0];
      const ws = await get<{ elements: OsmWay[] }>(`${OSM}/node/${node}/ways.json`);
      const next = ws.elements.find((w) => w.type === 'way' && !seen.has(w.id) && same(w));
      if (!next) break;
      seen.add(next.id);
      const full = await wayFull(next.id);
      let nIds = full.way.nodes;
      let nPts = full.pts;
      if (nPts.length !== nIds.length) break;
      // 이어지는 쪽이 맞도록 뒤집기
      const atStart = nIds[0] === node;
      if (end === 'tail' ? !atStart : atStart) { nIds = [...nIds].reverse(); nPts = [...nPts].reverse(); }
      if (end === 'tail') { ids = ids.concat(nIds.slice(1)); pts = pts.concat(nPts.slice(1)); }
      else { ids = nIds.slice(0, -1).concat(ids); pts = nPts.slice(0, -1).concat(pts); }
    }
  }

  // 너무 촘촘한 점 줄이기 (3m)
  const thin: [number, number][] = [pts[0]];
  for (const p of pts.slice(1)) if (distM(thin[thin.length - 1], p) > 3) thin.push(p);
  if (thin.length < 2) throw new Error('도로가 너무 짧아요');

  // 내 위치에서 가까운 점부터 더 긴 쪽으로 출발
  let near = 0;
  thin.forEach((p, i) => { if (distM(p, [lat, lng]) < distM(thin[near], [lat, lng])) near = i; });
  const ahead = thin.slice(near);
  const back = thin.slice(0, near + 1).reverse();
  const route = lengthM(ahead) >= lengthM(back) ? ahead : back;
  const finalPts = route.length >= 2 && lengthM(route) > 60 ? route : thin;

  const a = rv.address ?? {};
  const region = [a.city ?? a.province ?? a.state, a.borough ?? a.county ?? a.town, a.suburb ?? a.quarter].filter(Boolean).join(' ');
  return { name, region: region || '내 위치 근처', pts: finalPts, lanes: lanesPerSide(tags), here: true };
}

/** 점에서 도로(꺾은선)까지 가장 가까운 거리 (m) */
export function distToRoad(pts: [number, number][], lat: number, lng: number): number {
  const k = Math.cos((lat * Math.PI) / 180);
  const xy = (p: [number, number]) => [(p[1] - lng) * 111320 * k, (p[0] - lat) * 110540] as const;
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = xy(pts[i - 1]);
    const [bx, by] = xy(pts[i]);
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t, ay + dy * t));
  }
  return pts.length === 1 ? Math.hypot(...xy(pts[0])) : best;
}
