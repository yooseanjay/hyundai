// Spotify 재생 창 + 홈 상단 Spotify 줄
//  - 재생하면 창이 뜸: 차 화면(Pleos Connect)에선 앱 창 자리 전체, 휴대폰에선 전체 화면
//  - 곡을 멈추면 원래 화면으로 돌아감 (spotifyEmbed.ts)
import { ChevronDown, Maximize2, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  attachFrame, embedState, embedUrl, handleEmbedMessage, hideWindow, onEmbedChange, playInApp, PRESETS, showWindow, toggleInApp,
} from '../voice/spotifyEmbed';

const useEmbed = () => useSyncExternalStore(onEmbedChange, embedState);

function Presets({ tiles = false }: { tiles?: boolean }) {
  const s = useEmbed();
  if (tiles) {
    return (
      <div className="spw-tiles" role="group" aria-label="바로 듣기">
        {PRESETS.map((p) => (
          <button key={p.id} className={`spw-tile ${s.item?.path === p.path ? 'on' : ''}`} onClick={() => playInApp(p)} aria-pressed={s.item?.path === p.path}>
            <b>{p.title}</b><span>{p.sub}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="spw-presets" role="group" aria-label="바로 듣기">
      {PRESETS.map((p) => (
        <button key={p.id} className={`chip sm ${s.item?.path === p.path ? 'on' : ''}`} onClick={() => playInApp(p)}>{p.title}</button>
      ))}
    </div>
  );
}

/** 앱 맨 아래에 한 번만 둠. 창이 닫혀도 iframe은 남아 음악이 이어짐 */
export function SpotifyWindow() {
  const s = useEmbed();
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const h = (e: MessageEvent) => handleEmbedMessage(e);
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);
  useEffect(() => { attachFrame(ref.current?.contentWindow ?? null); }, [s.item?.path]);
  if (!s.item) return null;
  return (
    <section className={`spw ${s.open ? 'open' : 'closed'}`} role="dialog" aria-label="Spotify" aria-hidden={!s.open} {...(!s.open ? { inert: '' } : {})}>
      <header className="spw-head">
        <span className="sp-logo" aria-hidden />
        <div className="spw-title">
          <b>Spotify</b>
          <span className="cap">{s.playing ? '재생 중' : s.started ? '멈춤 · 곧 원래 화면으로 돌아가요' : '불러오는 중이에요'} · {s.item.title}</span>
        </div>
        <button className="btn sm mc-ghost spw-back" onClick={hideWindow}><ChevronDown size={18} aria-hidden />원래 화면</button>
      </header>
      <div className="spw-body">
      <iframe
        ref={ref}
        key={s.item.path}
        className="spw-frame"
        title={`${s.item.title} (Spotify)`}
        src={embedUrl(s.item.path)}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        height={352}
        onLoad={() => attachFrame(ref.current?.contentWindow ?? null)}
      />
      <div className="spw-side">
        <b className="spw-label">바로 듣기</b>
        <Presets tiles />
        <p className="cap spw-note">곡을 멈추면 원래 화면으로 돌아가요. Spotify에 로그인하지 않은 브라우저에선 30초 미리 듣기만 돼요.</p>
      </div>
      </div>
    </section>
  );
}

/** 홈 맨 위 Spotify 줄 */
export function SpotifyBar() {
  const s = useEmbed();
  return (
    <div className="card sp-bar">
      <div className="sp-bar-head">
        <span className="sp-logo" aria-hidden />
        <div className="sp-bar-txt">
          <b>Spotify</b>
          <span className="cap">{s.item ? `${s.playing ? '재생 중' : '멈춤'} · ${s.item.title}${s.item.sub ? ` · ${s.item.sub}` : ''}` : '“현대, 노래 틀어 줘”라고 말하거나 골라 보세요'}</span>
        </div>
        {s.item && (
          <>
            <button className="icon-btn" onClick={() => { if (!s.playing) showWindow(); toggleInApp(); }} aria-label={s.playing ? '멈춤' : '재생'}>
              {s.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
            {!s.open && <button className="icon-btn" onClick={showWindow} aria-label="Spotify 창 열기"><Maximize2 size={18} /></button>}
          </>
        )}
      </div>
      <Presets />
    </div>
  );
}
