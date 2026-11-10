// 차량 상태 계기판 (흑백): 속도계 · 에너지 · 주행 가능 거리 · 타이어 4개 · 온도 · 경고등
// 정지 중에는 마지막 차량 데이터, 주행 중에는 실시간 값(live)을 보여준다.
import { Gauge as GaugeIcon, Thermometer, TriangleAlert } from 'lucide-react';
import { WARNING_LABELS, type CarProfile, type VehicleSnapshot, type WarningKey } from '../api/types';

export interface LiveDrive {
  speed: number; // km/h
  km: number; // 이번 주행 거리
  hardBrakes: number;
  maxSpeed: number;
}

const MAX_SPEED = 180;

/** 타이어 공기압 (API에는 경고 여부만 있어 기본값 기준으로 표시. 경고면 뒤 왼쪽이 낮음) */
function tires(snap: VehicleSnapshot, live?: LiveDrive) {
  const warm = live ? Math.min(2, live.km / 15) : 0; // 달리면 공기압이 조금 오름
  const base = 36 + warm;
  const low = snap.warnings.tirePressure;
  return [
    ['앞 왼쪽', base], ['앞 오른쪽', base + 0.4],
    ['뒤 왼쪽', low ? 28 + warm : base - 0.3], ['뒤 오른쪽', base],
  ] as [string, number][];
}

/** demo: 시뮬레이터일 때만 온도·타이어 공기압 예시 값을 보여 줌 (실제 차에서는 받을 수 없는 값이라 숨김) */
export function VehicleStatus({ car, snap, live, compact, demo }: { car: CarProfile; snap: VehicleSnapshot; live?: LiveDrive; compact?: boolean; demo?: boolean }) {
  const ev = car.fuelType === 'ev';
  const energyName = ev ? '배터리' : car.fuelType === 'hydrogen' ? '수소' : '연료';
  // 주행 중 에너지·주행 가능 거리 실시간 감소 (현재 연비 비율 그대로)
  const pctPerKm = snap.dteKm > 0 ? snap.fuelLevelPct / snap.dteKm : 0;
  const used = live ? live.km : 0;
  const pct = Math.max(0, snap.fuelLevelPct - used * pctPerKm * (live && live.speed > 110 ? 1.25 : 1));
  const dte = Math.max(0, Math.round(snap.dteKm - used));
  const temp = Math.round((ev ? 24 : 88) + (live ? Math.min(ev ? 14 : 12, live.speed / (ev ? 9 : 12)) : 0));
  const tempHot = ev ? temp >= 36 : temp >= 98;
  const warns = (Object.keys(snap.warnings) as WarningKey[]).filter((k) => snap.warnings[k]);
  const speed = live?.speed ?? 0;
  const arc = Math.min(1, speed / MAX_SPEED);

  return (
    <div className={`vstatus ${compact ? 'compact' : ''}`}>
      {live && (
        <div className="speedo">
          <svg viewBox="0 0 200 116" aria-hidden>
            <path className="track" d="M14 104 A86 86 0 0 1 186 104" />
            <path className="fill" d="M14 104 A86 86 0 0 1 186 104" style={{ strokeDasharray: `${arc * 270} 400` }} />
            {[0, 30, 60, 90, 120, 150, 180].map((v) => {
              const a = Math.PI - (v / MAX_SPEED) * Math.PI;
              return <line key={v} x1={100 + Math.cos(a) * 74} y1={104 - Math.sin(a) * 74} x2={100 + Math.cos(a) * 80} y2={104 - Math.sin(a) * 80} />;
            })}
          </svg>
          <div className="speedo-num">
            <b>{Math.round(speed)}</b><span>km/h</span>
          </div>
          <div className="speedo-sub">
            <span>최고 {Math.round(live.maxSpeed)}</span><i className="sep" /><span className={live.hardBrakes ? 'alert' : ''}>급정거 {live.hardBrakes}회</span>
          </div>
        </div>
      )}

      <div className="vs-grid">
        <div className="vs-cell">
          <span className="cap">{energyName}</span>
          <b className="num">{Math.round(pct)}<small>%</small></b>
          <div className={`bar thin ${pct < 20 ? 'bad' : ''}`}><div style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="vs-cell">
          <span className="cap">주행 가능</span>
          <b className="num">{dte}<small>km</small></b>
          <span className="cap">누적 {(snap.odometerKm + used).toLocaleString(undefined, { maximumFractionDigits: 1 })}km</span>
        </div>
        {demo && <div className="vs-cell">
          <span className="cap"><Thermometer size={11} /> {ev ? '배터리 온도' : '냉각수 온도'}</span>
          <b className={`num ${tempHot ? 'warn' : ''}`}>{temp}<small>°C</small></b>
          <span className="cap">{tempHot ? '조금 뜨거워요' : '정상'}</span>
        </div>}
      </div>

      {demo && <div className="vs-tires">
        <div className="cap vs-title"><GaugeIcon size={12} /> 타이어 공기압 (psi)</div>
        <div className="tire-map">
          <svg viewBox="0 0 60 110" className="tire-car" aria-hidden>
            <rect x="12" y="6" width="36" height="98" rx="14" />
            <rect x="18" y="26" width="24" height="18" rx="4" />
          </svg>
          {tires(snap, live).map(([name, psi], i) => (
            <span key={name} className={`tire t${i} ${psi < 32 ? 'bad' : ''}`} title={name}>
              <b>{psi.toFixed(0)}</b><small>{name}</small>
            </span>
          ))}
        </div>
      </div>}

      <div className={`vs-warn ${warns.length ? 'has' : ''}`}>
        <TriangleAlert size={14} />
        <span>{warns.length ? `경고등 ${warns.length}개 · ${warns.map((k) => WARNING_LABELS[k]).join(', ')}` : '경고등 없음 · 모두 정상이에요'}</span>
      </div>
    </div>
  );
}
