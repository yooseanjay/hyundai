// 음성 도구 결과 카드 (여행지 · 주변 · 날씨 · 소모품 · 주간 리포트)
import type { ActionCard } from '../voice/actions';

export function ActionCardView({ card }: { card: ActionCard }) {
  switch (card.kind) {
    case 'places':
      return (
        <div className="act">
          {card.items.map((t) => (
            <div key={t.name} className="act-row">
              <div className="act-main"><b>{t.name}</b><span>{t.area} · {t.distanceKm}km · 약 {t.driveMin}분</span><span className="act-why">{t.why}</span></div>
              <div className="act-links">
                <a href={`https://map.kakao.com/link/search/${encodeURIComponent(t.name)}`} target="_blank" rel="noreferrer">카카오맵</a>
                <a href={`https://map.naver.com/p/search/${encodeURIComponent(t.name)}`} target="_blank" rel="noreferrer">네이버</a>
              </div>
            </div>
          ))}
        </div>
      );
    case 'nearby':
      return (
        <div className="act act-inline">
          <b>주변 {card.label}</b>
          <div className="act-links"><a href={card.kakao} target="_blank" rel="noreferrer">카카오맵으로 보기</a><a href={card.naver} target="_blank" rel="noreferrer">네이버</a></div>
        </div>
      );
    case 'weather':
      return (
        <div className="act">
          <div className="act-row"><div className="act-main"><b>{card.temp}° {card.text}</b><span>{card.place} · 최고 {card.max}° 최저 {card.min}° · 강수 {card.rain}%</span><span className="act-why">{card.tip}</span></div></div>
        </div>
      );
    case 'parts':
      return (
        <div className="act">
          {card.items.slice(0, 4).map((i) => (
            <div key={i.name} className="act-part">
              <span>{i.name}</span><span className={i.pct >= 90 ? 'due' : ''}>{i.pct >= 100 ? '교체 시기' : `${i.left.toLocaleString()}km`}</span>
              <div className={`bar thin ${i.pct >= 90 ? 'bad' : ''}`}><div style={{ width: `${i.pct}%` }} /></div>
            </div>
          ))}
        </div>
      );
    case 'report':
      return (
        <div className="act act-stats">
          <span><b>{card.n}</b>회</span><span><b>{card.km}</b>km</span><span><b>{card.avg}</b>km/h</span><span><b>{card.brakes}</b>급정거</span>
        </div>
      );
  }
}
