// 음악 재생 창(Spotify · YouTube Music) + 홈 상단 음악 줄
//  - 재생하면 창이 뜸: 차 화면(Pleos Connect)에선 앱 창 자리 전체, 휴대폰에선 전체 화면
//  - 곡을 멈추면 원래 화면으로 돌아감 (spotifyEmbed.ts)
import { ChevronDown, Maximize2, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  attachFrame, embedState, embedUrl, handleEmbedMessage, hideWindow, musicProvider, onEmbedChange, playInApp, presetsOf,
  PROVIDER_NAME, providerOf, setMusicProvider, showWindow, toggleInApp, type MusicProvider,
} from '../voice/spotifyEmbed';

const useEmbed = () => useSyncExternalStore(onEmbedChange, embedState);
const useProvider = () => useSyncExternalStore(onEmbedChange, musicProvider);

function Logo({ p }: { p: MusicProvider }) {
  return <span className={p === 'youtube' ? 'yt-logo' : 'sp-logo'} aria-hidden />;
}

/** Spotify | YouTube Music 고르기 */
function ProviderSwitch() {
  const p = useProvider();
  return (
    <div className="mp-switch" role="radiogroup" aria-label="음악 서비스">
      {(['spotify', 'youtube'] as MusicProvider[]).map((x) => (
        <button key={x} role="radio" aria-checked={p === x} className={`mp-opt ${x} ${p === x ? 'on' : ''}`} onClick={() => setMusicProvider(x)}>
          <Logo p={x} />{PROVIDER_NAME[x]}
        </button>
      ))}
    </div>
  );
}

function Presets({ tiles = false }: { tiles?: boolean }) {
  const s = useEmbed();
  const p = useProvider();
  const on = (path: string) => s.item?.path === path && providerOf(s.item) === p;
  if (tiles) {
    return (
      <div className={`spw-tiles ${p}`} role="group" aria-label="바로 듣기">
        {presetsOf(p).map((x) => (
          <button key={x.id} className={`spw-tile ${on(x.path) ? 'on' : ''}`} onClick={() => playInApp(x)} aria-pressed={on(x.path)}>
            <b>{x.title}</b><span>{x.sub}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={`spw-presets ${p}`} role="group" aria-label="바로 듣기">
      {presetsOf(p).map((x) => (
        <button key={x.id} className={`chip sm ${on(x.path) ? 'on' : ''}`} onClick={() => playInApp(x)}>{x.title}</button>
      ))}
    </div>
  );
}

/** 앱 맨 아래에 한 번만 둠. 창이 닫혀도 iframe은 남아 음악이 이어짐 */
export function SpotifyWindow() {
  const s = useEmbed();
  const ref = useRef<HTMLIFrameElement>(null);
  const picked = useProvider();
  const prov = providerOf(s.item);
  const key = s.item ? `${prov}:${s.item.path}` : '';
  useEffect(() => {
    const h = (e: MessageEvent) => handleEmbedMessage(e);
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);
  useEffect(() => { attachFrame(ref.current?.contentWindow ?? null); }, [key]);
  if (!s.item) return null;
  const name = PROVIDER_NAME[prov];
  return (
    <section className={`spw ${prov} ${s.open ? 'open' : 'closed'}`} role="dialog" aria-label={name} aria-hidden={!s.open} {...(!s.open ? { inert: '' } : {})}>
      <header className="spw-head">
        <Logo p={prov} />
        <div className="spw-title">
          <b>{name}</b>
          <span className="cap">{s.playing ? '재생 중' : s.started ? '멈춤 · 곧 원래 화면으로 돌아가요' : '불러오는 중이에요'} · {s.item.title}</span>
        </div>
        <button className="btn sm mc-ghost spw-back" onClick={hideWindow}><ChevronDown size={18} aria-hidden />원래 화면</button>
      </header>
      <div className="spw-body">
        <iframe
          ref={ref}
          key={key}
          className={`spw-frame ${prov}`}
          title={`${s.item.title} (${name})`}
          src={embedUrl(s.item)}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy={prov === 'youtube' ? 'strict-origin-when-cross-origin' : undefined}
          allowFullScreen={prov === 'youtube'}
          height={prov === 'youtube' ? undefined : 352}
          onLoad={() => attachFrame(ref.current?.contentWindow ?? null)}
        />
        <div className="spw-side">
          <ProviderSwitch />
          <b className="spw-label">바로 듣기</b>
          <Presets tiles />
          <p className="cap spw-note">
            곡을 멈추면 원래 화면으로 돌아가요.{' '}
            {picked === 'youtube' ? 'YouTube는 광고가 나올 수 있어요.' : 'Spotify에 로그인하지 않은 브라우저에선 30초 미리 듣기만 돼요.'}
          </p>
        </div>
      </div>
    </section>
  );
}

/** 홈 맨 위 음악 줄 */
export function SpotifyBar() {
  const s = useEmbed();
  const p = useProvider();
  const cur = s.item ? providerOf(s.item) : p;
  return (
    <div className={`card sp-bar ${p}`}>
      <div className="sp-bar-head">
        <Logo p={cur} />
        <div className="sp-bar-txt">
          <b>{PROVIDER_NAME[cur]}</b>
          <span className="cap">{s.item ? `${s.playing ? '재생 중' : '멈춤'} · ${s.item.title}${s.item.sub ? ` · ${s.item.sub}` : ''}` : `“현대, ${p === 'youtube' ? '유튜브 뮤직으로 ' : ''}노래 틀어 줘”라고 말하거나 골라 보세요`}</span>
        </div>
        {s.item && (
          <>
            <button className="icon-btn" onClick={() => { if (!s.playing) showWindow(); toggleInApp(); }} aria-label={s.playing ? '멈춤' : '재생'}>
              {s.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
            {!s.open && <button className="icon-btn" onClick={showWindow} aria-label={`${PROVIDER_NAME[cur]} 창 열기`}><Maximize2 size={18} /></button>}
          </>
        )}
      </div>
      <div className="sp-bar-row">
        <ProviderSwitch />
        <Presets />
      </div>
    </div>
  );
}
