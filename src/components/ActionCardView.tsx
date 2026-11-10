// 음성 도구 결과 카드 (여행지 · 주변 · 날씨 · 소모품 · 주간 리포트 · 음악)
import { useState } from 'react';
import type { ActionCard } from '../voice/actions';

import { PlayerControls } from './SpotifyPanel';
import { connectSpotify } from '../voice/spotify';

type MusicCard = Extract<ActionCard, { kind: 'music' }>;

/** Spotify 재생 카드: 첫 곡을 Spotify 플레이어로, 나머지는 눌러서 바꾸기 */
function MusicCardView({ card }: { card: MusicCard }) {
  const [i, setI] = useState(0);
  const t = card.tracks[i];
  if (!t) {
    return (
      <div className="act act-inline music">
        <div className="act-main"><b>{card.query}</b><span>{card.note ?? 'Spotify에서 찾아 들어요'}</span></div>
        <div className="act-links"><a href={card.search} target="_blank" rel="noreferrer">Spotify에서 열기</a></div>
      </div>
    );
  }
  return (
    <div className="act music">
      <iframe
        key={t.id}
        className="spotify-embed"
        title={`${t.artist} - ${t.name} (Spotify)`}
        src={`https://open.spotify.com/embed/track/${t.id}?utm_source=generator&theme=0`}
        height="152"
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      />
      {card.tracks.length > 1 && (
        <div className="music-alts">
          {card.tracks.map((x, k) => (
            <button key={x.id} className={`chip sm ${k === i ? 'on' : ''}`} onClick={() => setI(k)}>{x.name} · {x.artist}</button>
          ))}
        </div>
      )}
      <div className="act-links">
        <a href={t.url} target="_blank" rel="noreferrer">Spotify 앱에서 듣기</a>
        <a href={card.search} target="_blank" rel="noreferrer">다른 곡 찾기</a>
      </div>
    </div>
  );
}

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
    case 'music':
      return <MusicCardView card={card} />;
    case 'player':
      return (
        <div className="act">
          <PlayerControls initial={card.track ? undefined : card.now ?? null} note={card.note} />
        </div>
      );
    case 'spotify-connect':
      return (
        <div className="act act-inline">
          <div className="act-main"><b>Spotify 계정 연결</b><span>{card.connected ? '이미 연결돼 있어요' : card.ready ? '잠시 뒤 로그인 화면으로 이동해요' : '내 차 탭에서 Spotify 설정을 먼저 해 주세요'}</span></div>
          {!card.connected && card.ready && <div className="act-links"><button className="btn primary sm" onClick={() => void connectSpotify()}>지금 로그인</button></div>}
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
