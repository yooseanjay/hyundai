// 주행 중 지도: 지금 달리는 실제 한국 도로와 차 위치
//  - 네이버 지도 Client ID(VITE_NAVER_MAP_CLIENT_ID)가 있으면 네이버 지도 위에 경로 · 차 표시
//  - 없거나 인증이 안 되면 도로 모양 그림(SVG) 위에 차 점으로 대신
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealRoad } from '../data/realRoads';

const NAVER_ID = (import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined)?.trim();

interface Props { road: RealRoad; pos: [number, number] | null }

/* eslint-disable @typescript-eslint/no-explicit-any */
type NaverNS = any;
declare global { interface Window { naver?: { maps: NaverNS }; navermap_authFailure?: () => void } }

let loading: Promise<NaverNS> | null = null;
function loadNaver(id: string): Promise<NaverNS> {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (!loading) {
    loading = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(id)}`;
      s.async = true;
      s.onload = () => (window.naver?.maps ? ok(window.naver.maps) : fail(new Error('naver')));
      s.onerror = () => { loading = null; fail(new Error('naver')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export function RouteMap({ road, pos }: Props) {
  const [naverOk, setNaverOk] = useState(!!NAVER_ID);
  const box = useRef<HTMLDivElement>(null);
  const nv = useRef<{ map: any; marker: any; line: any } | null>(null);

  // 네이버 지도 만들기 (도로가 바뀌면 경로만 다시)
  useEffect(() => {
    if (!NAVER_ID || !naverOk) return;
    let dead = false;
    window.navermap_authFailure = () => setNaverOk(false); // 도메인 미등록 · 잘못된 키 → 대체 지도
    loadNaver(NAVER_ID).then((maps) => {
      if (dead || !box.current) return;
      const path = road.pts.map(([a, b]) => new maps.LatLng(a, b));
      if (!nv.current) {
        const map = new maps.Map(box.current, { center: path[0], zoom: 15, scaleControl: false, mapDataControl: false, logoControlOptions: { position: maps.Position.BOTTOM_LEFT } });
        nv.current = { map, line: null, marker: new maps.Marker({ position: path[0], map, icon: { content: '<div class="rm-car"></div>', anchor: new maps.Point(9, 9) } }) };
      }
      nv.current.line?.setMap(null);
      nv.current.line = new maps.Polyline({ map: nv.current.map, path, strokeColor: '#3b82f6', strokeWeight: 6, strokeOpacity: 0.85, strokeLineCap: 'round', strokeLineJoin: 'round' });
      nv.current.map.panTo(path[0]);
    }).catch(() => { if (!dead) setNaverOk(false); });
    return () => { dead = true; };
  }, [road, naverOk]);

  useEffect(() => {
    const m = window.naver?.maps;
    if (!pos || !nv.current || !m) return;
    const p = new m.LatLng(pos[0], pos[1]);
    nv.current.marker.setPosition(p);
    nv.current.map.panTo(p, { duration: 900 });
  }, [pos]);

  useEffect(() => () => { nv.current?.map?.destroy?.(); nv.current = null; }, []);

  // 대체 지도: 도로 모양을 상자에 맞춰 그림
  const svg = useMemo(() => {
    const lat0 = road.pts[0][0];
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const xy = road.pts.map(([a, b]) => [b * kx, -a] as const);
    const xs = xy.map((p) => p[0]);
    const ys = xy.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const W = 320, H = 150, pad = 14;
    const k = Math.min((W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (y1 - y0 || 1));
    const ox = (W - (x1 - x0) * k) / 2;
    const oy = (H - (y1 - y0) * k) / 2;
    const to = (lat: number, lng: number) => [ox + (lng * kx - x0) * k, oy + (-lat - y0) * k] as const;
    return { W, H, to, d: road.pts.map(([a, b], i) => `${i ? 'L' : 'M'}${to(a, b).map((v) => v.toFixed(1)).join(' ')}`).join('') };
  }, [road]);
  const dot = svg.to(...(pos ?? road.pts[0]));

  return (
    <div className="card route-map">
      <div className="card-head">
        <b className="label">{road.name}</b>
        <span className="cap">{road.region}</span>
      </div>
      {naverOk && NAVER_ID ? (
        <div className="rm-box" ref={box} aria-label={`${road.name} 지도`} />
      ) : (
        <svg className="rm-box" viewBox={`0 0 ${svg.W} ${svg.H}`} role="img" aria-label={`${road.name} 도로 모양과 지금 위치`}>
          <path d={svg.d} className="rm-road-bg" />
          <path d={svg.d} className="rm-road" />
          <circle cx={dot[0]} cy={dot[1]} r={9} className="rm-halo" />
          <circle cx={dot[0]} cy={dot[1]} r={5} className="rm-dot" />
        </svg>
      )}
      <div className="card-head">
        <span className="cap">실제 도로 모양으로 주행 중</span>
        <a className="cap rm-link" href={`https://map.naver.com/p/search/${encodeURIComponent(`${road.name} ${road.region.split(' · ')[0]}`)}`} target="_blank" rel="noopener noreferrer">네이버 지도에서 보기</a>
      </div>
      <span className="cap rm-attr">도로 모양 © OpenStreetMap 기여자</span>
    </div>
  );
}
