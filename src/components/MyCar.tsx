// 내 차 탭: 마이현대 앱의 기능을 한곳에
//  - 실제 데이터(현대 Open API): 차량 상태 · 경고등(원격 진단) · 주차 위치 · 운행 기록(드라이빙 인사이트) · EV 충전 상태
//  - 이 앱에서 기록: 소모품 교체 주기
//  - 공식 페이지 · 전화로 연결: 정비 예약 · 블루핸즈 · 충전소 · 긴급출동 · 고객센터 · 리콜 조회
//  - 원격 제어(문 · 시동 · 공조 · 비상등 · 경적)와 블루멤버스 · 시승 신청은 공개 API가 없어 마이현대 앱으로 연결
import {
  AlertTriangle, ArrowUpRight, BatteryCharging, CalendarCheck, Car as CarIcon, Fan, Fuel, Gift, Lock, LockOpen,
  MapPin, Megaphone, Phone, Power, ShieldAlert, Siren, Stethoscope, Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { WARNING_LABELS, type CarProfile, type Trip, type VehicleSnapshot, type WarningKey } from '../api';
import { markReplaced, partsStatus, weeklyReport } from '../voice/actions';
import { SpotifyPanel } from './SpotifyPanel';

export const MYHYUNDAI_URL = 'https://www.hyundai.com/kr/ko/customer-service/myhyundai';
const RESERVE_URL = 'https://www.hyundai.com/kr/ko/customer-service/service-network/service-reservation-search';
const RECALL_URL = 'https://www.car.go.kr';
const TEL = 'tel:080-600-6000';
const kakao = (q: string) => `https://map.kakao.com/link/search/${encodeURIComponent(q)}`;

interface Props {
  car: CarProfile;
  snap: VehicleSnapshot;
  trips: Trip[];
  onReplaced: (name: string) => void;
}

const REMOTE: [typeof Lock, string][] = [
  [Lock, '문 잠금'], [LockOpen, '문 열림'], [Power, '원격 시동'], [Fan, '공조'], [Siren, '비상등'], [Megaphone, '경적'],
];

function Row({ icon, title, sub, href }: { icon: ReactNode; title: string; sub?: string; href: string }) {
  const ext = href.startsWith('http');
  return (
    <a className="mc-row" href={href} {...(ext ? { target: '_blank', rel: 'noreferrer' } : {})}>
      <span className="mc-ic" aria-hidden>{icon}</span>
      <b>{title}</b>
      {sub && <span className="cap">{sub}</span>}
      {ext && <ArrowUpRight size={15} className="muted" aria-hidden />}
    </a>
  );
}

export function MyCar({ car, snap, trips, onReplaced }: Props) {
  const ctx = { car, snap, trips };
  const rep = weeklyReport(ctx).card;
  const parts = partsStatus(ctx);
  const warns = (Object.keys(snap.warnings) as WarningKey[]).filter((k) => snap.warnings[k]);
  const ev = car.fuelType === 'ev';
  const h2 = car.fuelType === 'hydrogen';
  const energy = ev ? '배터리' : h2 ? '수소' : '연료';
  const station = ev ? '전기차 충전소' : h2 ? '수소충전소' : '주유소';
  const updated = new Date(snap.updatedAt);
  const hhmm = `${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')}`;

  return (
    <>
      <div className="mc-head">
        <span className="hero-model">{car.model} · 마지막 수신 {hhmm}</span>
        <h1 className="hero-name">내 차</h1>
      </div>

      <div className="mc-grid">
        {/* 원격 제어 */}
        <div className="card mc-remote">
          <b className="label">원격 제어</b>
          <div className="mc-tiles" aria-label="마이현대 앱에서 쓸 수 있는 원격 제어">
            {REMOTE.map(([Icon, name]) => (
              <span key={name} className="mc-tile"><Icon size={24} strokeWidth={1.8} aria-hidden />{name}</span>
            ))}
          </div>
          <p className="cap">현대 공개 API는 차 상태 조회만 지원해요. 원격 제어는 마이현대 앱에서 할 수 있어요.</p>
          <a className="btn block mc-ghost" href={MYHYUNDAI_URL} target="_blank" rel="noreferrer">마이현대 앱 열기</a>
        </div>

        {/* 드라이빙 인사이트 */}
        <div className="card mc-insight">
          <b className="label">드라이빙 인사이트</b>
          <span className="cap">최근 7일</span>
          {rep.kind === 'report' && (
            <>
              <div className="mc-big glow-num">{rep.km}<small>km</small></div>
              <span className="cap">주행 {rep.n}회 · 평균 {rep.avg}km/h</span>
              <span className="cap">급정거 {rep.brakes}회 · 부드러운 운전 {rep.calm}%</span>
              <div className="range-bar"><div style={{ width: `${rep.calm}%` }} /></div>
            </>
          )}
        </div>
      </div>

      {/* 소모품 */}
      <div className="card">
        <div className="card-head"><b className="label">소모품</b><span className="cap">교체 주기 기준</span></div>
        <div className="mc-parts">
          {parts.map((p) => (
            <div key={p.id} className={`mc-part ${p.pct >= 90 ? 'due' : ''}`}>
              <div className="card-head">
                <span>{p.name}</span>
                <span className="cap">{p.left ? `${p.left.toLocaleString()}km 남음` : '교체 시기'}</span>
              </div>
              <div className="range-bar"><div style={{ width: `${p.pct}%` }} /></div>
              {p.pct >= 90 && (
                <button className="btn text sm" onClick={() => { markReplaced(p.id, snap.odometerKm); onReplaced(p.name); }}>교체 완료</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="side">
        {/* 상태 · 원격 진단 */}
        <div className="card">
          <div className="card-head"><b className="label">원격 진단</b><span className={`cap ${warns.length ? 'bad-text' : ''}`}>{warns.length ? `경고 ${warns.length}건` : '이상 없음'}</span></div>
          <div className="mc-stats">
            <div><span className="cap">주행 가능</span><b>{snap.dteKm}<small>km</small></b></div>
            <div><span className="cap">{energy}</span><b>{Math.round(snap.fuelLevelPct)}<small>%</small></b></div>
            <div><span className="cap">누적</span><b>{snap.odometerKm.toLocaleString()}<small>km</small></b></div>
          </div>
          {ev && <span className="cap mc-charge"><BatteryCharging size={15} aria-hidden />{snap.charging ? '충전 중' : snap.pluggedIn ? '충전기 연결됨' : '충전기 연결 안 됨'}</span>}
          {warns.length > 0 && <span className="cap bad-text">{warns.map((k) => WARNING_LABELS[k]).join(' · ')}</span>}
        </div>

        <SpotifyPanel />

        <div className="card mc-list">
          <b className="label">차량 관리</b>
          {snap.parking && (
            <Row icon={<MapPin size={18} />} title="내 차 찾기" sub={snap.parking.label}
              href={`https://map.kakao.com/link/map/${encodeURIComponent(car.nickname)},${snap.parking.lat},${snap.parking.lng}`} />
          )}
          <Row icon={<CalendarCheck size={18} />} title="정비 예약" sub="블루핸즈" href={RESERVE_URL} />
          <Row icon={<Wrench size={18} />} title="가까운 블루핸즈" href={kakao('현대 블루핸즈')} />
          <Row icon={ev ? <BatteryCharging size={18} /> : <Fuel size={18} />} title={ev ? '충전소 찾기' : h2 ? '수소충전소 찾기' : '주유소 찾기'} href={kakao(station)} />
        </div>

        <div className="card mc-list">
          <b className="label">고객 지원</b>
          <Row icon={<Siren size={18} />} title="긴급출동" sub="080-600-6000" href={TEL} />
          <Row icon={<Phone size={18} />} title="고객센터" sub="080-600-6000" href={TEL} />
          <Row icon={<ShieldAlert size={18} />} title="리콜 조회" sub="자동차리콜센터" href={RECALL_URL} />
        </div>

        <div className="card mc-list">
          <b className="label">마이현대 앱에서</b>
          <Row icon={<Gift size={18} />} title="블루멤버스 포인트" href={MYHYUNDAI_URL} />
          <Row icon={<CarIcon size={18} />} title="시승 신청 · 구매 상담" href={MYHYUNDAI_URL} />
          <Row icon={<Stethoscope size={18} />} title="정비 이력" href={MYHYUNDAI_URL} />
          <Row icon={<AlertTriangle size={18} />} title="디지털 키 · 원격 제어" href={MYHYUNDAI_URL} />
        </div>
      </div>
    </>
  );
}
