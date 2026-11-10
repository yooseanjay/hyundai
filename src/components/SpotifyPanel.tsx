// Spotify 계정 연결 + 지금 재생 중인 곡 · 재생 조작
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  clientId, connectSpotify, control, linkSpotify, nowPlaying, openSpotify, SPOTIFY_HOME, spotifyConnected, spotifyLinked,
  spotifySearchUrl, unlinkSpotify, type NowPlaying, type PlayerAction,
} from '../voice/spotify';

function useSpotify() {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = () => tick((n) => n + 1);
    window.addEventListener('spotify-change', h);
    return () => window.removeEventListener('spotify-change', h);
  }, []);
  return { connected: spotifyConnected(), linked: spotifyLinked(), canLogin: !!clientId() };
}

/** 재생 조작 줄 (지금 곡 + 이전 · 재생/멈춤 · 다음) */
export function PlayerControls({ initial, note }: { initial?: NowPlaying | null; note?: string }) {
  const [np, setNp] = useState<NowPlaying | null>(initial ?? null);
  const [msg, setMsg] = useState<string | null>(note ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (initial !== undefined) return;
    nowPlaying().then(setNp).catch((e) => setMsg(e instanceof Error ? e.message : null));
  }, [initial]);
  const act = async (a: PlayerAction) => {
    setBusy(true);
    try { setNp(await control(a)); setMsg(null); } catch (e) { setMsg(e instanceof Error ? e.message : 'Spotify 제어 실패'); }
    setBusy(false);
  };
  return (
    <div className="sp-player">
      <div className="sp-now">
        {np?.image ? <img src={np.image} alt="" width={44} height={44} /> : <span className="sp-art" aria-hidden />}
        <div className="sp-txt">
          <b>{np?.name ?? '재생 중인 곡 없음'}</b>
          <span className="cap">{np ? `${np.artist}${np.device ? ` · ${np.device}` : ''}` : '노래 틀어 줘라고 말해 보세요'}</span>
        </div>
      </div>
      <div className="sp-btns">
        <button className="icon-btn" onClick={() => act('previous')} disabled={busy} aria-label="이전 곡"><SkipBack size={20} /></button>
        <button className="icon-btn sp-main" onClick={() => act(np?.playing ? 'pause' : 'resume')} disabled={busy} aria-label={np?.playing ? '멈춤' : '재생'}>
          {np?.playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <button className="icon-btn" onClick={() => act('next')} disabled={busy} aria-label="다음 곡"><SkipForward size={20} /></button>
      </div>
      {msg && <p className="cap bad-text">{msg}</p>}
    </div>
  );
}

/** 내 차 탭의 Spotify 카드
 *  - 기본: '연결' 한 번 → Spotify 앱(없으면 웹)이 열리고, 말로 부른 노래를 Spotify에서 바로 찾아 줌
 *  - 앱 주인이 Client ID를 넣어 배포했으면: 계정 로그인으로 재생 · 멈춤 · 다음 곡까지 */
export function SpotifyPanel() {
  const { connected, linked, canLogin } = useSpotify();
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const login = () => connectSpotify().catch((e) => setErr(e instanceof Error ? e.message : '연결 실패'));

  return (
    <div className="card sp-card">
      <div className="card-head">
        <b className="label sp-title"><span className="sp-logo" aria-hidden />Spotify</b>
        <span className={`cap ${linked ? 'good-text' : ''}`}>{linked ? '연결됨' : '연결 안 됨'}</span>
      </div>
      {connected ? (
        <PlayerControls />
      ) : linked ? (
        <form className="sp-cid" onSubmit={(e) => { e.preventDefault(); if (q.trim()) openSpotify(spotifySearchUrl(q.trim())); }}>
          <input className="text-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="노래 · 가수 찾기" aria-label="Spotify에서 노래 찾기" />
          <button className="btn primary sm sp-btn" type="submit">찾기</button>
        </form>
      ) : (
        <p className="cap">누르면 Spotify 앱(없으면 웹)이 열려요. Spotify에 로그인돼 있으면 바로 들을 수 있어요.</p>
      )}
      {!linked && <button className="btn primary block sp-btn" onClick={() => linkSpotify(true)}>Spotify 연결</button>}
      {linked && !connected && <a className="btn block mc-ghost" href={SPOTIFY_HOME} target="_blank" rel="noreferrer">Spotify 열기</a>}
      {linked && !connected && canLogin && <button className="btn text sm" onClick={login}>계정 로그인하고 말로 재생 조작하기 (Premium)</button>}
      {linked && <p className="cap">“현대, 아이유 노래 틀어 줘”라고 말하면 Spotify에서 바로 찾아 줘요.</p>}
      {linked && <button className="btn text sm" onClick={unlinkSpotify}>연결 해제</button>}
      {err && <p className="cap bad-text">{err}</p>}
    </div>
  );
}
