// Spotify 계정 연결 + 지금 재생 중인 곡 · 재생 조작
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  clientId, clientIdFromEnv, connectSpotify, control, disconnectSpotify, nowPlaying, redirectUri, setClientId,
  spotifyConnected, type NowPlaying, type PlayerAction,
} from '../voice/spotify';

function useSpotify() {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = () => tick((n) => n + 1);
    window.addEventListener('spotify-change', h);
    return () => window.removeEventListener('spotify-change', h);
  }, []);
  return { connected: spotifyConnected(), cid: clientId() };
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

/** 내 차 탭의 Spotify 카드: 연결 전엔 설정 · 로그인, 연결 후엔 재생 조작 */
export function SpotifyPanel() {
  const { connected, cid } = useSpotify();
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const login = () => connectSpotify().catch((e) => setErr(e instanceof Error ? e.message : '연결 실패'));

  return (
    <div className="card sp-card">
      <div className="card-head">
        <b className="label sp-title"><span className="sp-logo" aria-hidden />Spotify</b>
        <span className={`cap ${connected ? 'good-text' : ''}`}>{connected ? '연결됨' : '연결 안 됨'}</span>
      </div>
      {connected ? (
        <>
          <PlayerControls />
          <p className="cap">“현대, 아이유 노래 틀어 줘” · “다음 곡” · “음악 멈춰”처럼 말로도 돼요. 재생 제어는 Spotify Premium에서 돼요.</p>
          <button className="btn text sm" onClick={disconnectSpotify}>연결 해제</button>
        </>
      ) : cid ? (
        <>
          <p className="cap">Spotify 계정으로 로그인하면 이 앱에서 내 Spotify를 틀고 멈출 수 있어요. 말로 “스포티파이 연결해 줘”라고 해도 돼요.</p>
          <button className="btn primary block sp-btn" onClick={login}>Spotify 로그인</button>
          {!clientIdFromEnv() && <button className="btn text sm" onClick={() => setClientId('')}>Client ID 바꾸기</button>}
        </>
      ) : (
        <>
          <p className="cap">
            처음 한 번만 설정해요. <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify 개발자 대시보드</a>에서 앱을 만들고
            Redirect URI에 <code>{redirectUri()}</code>를 넣은 뒤, Client ID를 붙여 넣어 주세요.
          </p>
          <div className="sp-cid">
            <input className="text-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Client ID (32자리)" aria-label="Spotify Client ID" autoComplete="off" spellCheck={false} />
            <button className="btn primary sm" onClick={() => { if (/^[0-9a-f]{32}$/i.test(draft.trim())) { setClientId(draft); setErr(null); } else setErr('Client ID는 영문·숫자 32자리예요'); }}>저장</button>
          </div>
        </>
      )}
      {err && <p className="cap bad-text">{err}</p>}
    </div>
  );
}
