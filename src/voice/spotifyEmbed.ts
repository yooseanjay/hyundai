// 앱 안 Spotify 재생 창 (키·로그인 없이)
//  - Spotify 공식 재생기(embed)를 앱 안에 띄우고, 재생 · 멈춤 신호를 postMessage로 주고받음
//    (Spotify iFrame API와 같은 약속: 'ready' · 'playback_update' 를 받고 'play' · 'pause' · 'resume' 을 보냄)
//    → 외부 스크립트를 페이지에 불러오지 않아 보안 정책(CSP)을 넓히지 않음
//  - 재생하면 창이 뜨고(차 화면: Pleos Connect 앱 창 자리 전체), 곡을 멈추면 원래 화면으로 돌아감
//  - Spotify에 로그인돼 있지 않은 브라우저에선 30초 미리 듣기만 됨 (Spotify 정책)

export const SPOTIFY_ORIGIN = 'https://open.spotify.com';

export interface SpotifyItem {
  /** 'playlist/ID' 또는 'track/ID' */
  path: string;
  title: string;
  sub?: string;
}

/** 키 없이 바로 틀 수 있는 Spotify 공식 플레이리스트 */
export const PRESETS: (SpotifyItem & { id: string; words: RegExp })[] = [
  { id: 'drive', path: 'playlist/37i9dQZF1DWWMOmoXKqHTD', title: '드라이브', sub: '따라 부르기 좋은 노래', words: /(드라이브|신나|따라\s?부|운전|여행|기분\s?좋)/ },
  { id: 'kpop', path: 'playlist/37i9dQZF1DX9tPFwDMOaN1', title: 'K-POP', sub: 'K-Pop ON! (온)', words: /(케이팝|k-?pop|아이돌|가요|한국\s?노래)/i },
  { id: 'hits', path: 'playlist/37i9dQZF1DXcBWIGoYBM5M', title: '인기곡', sub: "Today's Top Hits", words: /(인기|요즘|최신|유행|히트|팝송)/ },
  { id: 'chill', path: 'playlist/37i9dQZF1DX4WYpdgoIcn6', title: '잔잔한', sub: '칠아웃 히트곡', words: /(잔잔|조용|편안|차분|칠|chill|감성)/i },
  { id: 'focus', path: 'playlist/37i9dQZF1DWWQRwui0ExPn', title: '집중', sub: 'lofi beats', words: /(집중|공부|로파이|lo-?fi|일할|작업)/i },
];

/** 말한 내용에 맞는 플레이리스트. 곡 · 가수를 콕 집은 말이면 null (그건 Spotify 검색으로) */
export function presetFor(query: string): SpotifyItem | null {
  const q = query.trim();
  // 장르를 먼저 보고("신나는 케이팝" → K-POP), 드라이브는 마지막에
  const hit = [...PRESETS.slice(1), PRESETS[0]].find((p) => p.words.test(q));
  if (hit) return hit;
  // "노래 틀어 줘", "음악 아무거나" 처럼 곡을 정하지 않은 말 → 드라이브
  const rest = q.replace(/(스포티파이|spotify|에서|로|으로|노래|음악|곡|좀|아무거나|아무|하나|틀어\s?줘|틀어\s?봐|틀어|들려\s?줘|들려|재생해\s?줘|재생|켜\s?줘|줘|요|[\s,.!?~])/gi, '');
  return rest.length === 0 ? PRESETS[0] : null;
}

export const embedUrl = (path: string) => `${SPOTIFY_ORIGIN}/embed/${path}?utm_source=iframe-api&theme=0`;

export interface EmbedState {
  item: SpotifyItem | null;
  open: boolean; // 창이 떠 있음
  playing: boolean;
  started: boolean; // 이 곡을 한 번이라도 재생함
  ready: boolean;
}

let state: EmbedState = { item: null, open: false, playing: false, started: false, ready: false };
let frame: Window | null = null;
let queue: string[] = [];
let wantPlay = false;
let closeTimer = 0;
const listeners = new Set<() => void>();

export const embedState = () => state;
export function onEmbedChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function set(p: Partial<EmbedState>) {
  state = { ...state, ...p };
  listeners.forEach((f) => f());
  try { document.documentElement.classList.toggle('spotify-on', state.open); } catch { /* 테스트 환경 */ }
}

function send(command: string) {
  if (!frame || !state.ready) { queue.push(command); return; }
  try { frame.postMessage({ command }, SPOTIFY_ORIGIN); } catch { /* 창 없음 */ }
}

/** 재생 창의 iframe이 바뀔 때 (SpotifyWindow가 부름) */
export function attachFrame(w: Window | null) { frame = w; }

/** 앱 안 창에서 틀기: 창을 띄우고, 준비되면 바로 재생 */
export function playInApp(item: SpotifyItem) {
  window.clearTimeout(closeTimer);
  const same = state.item?.path === item.path;
  if (same) {
    set({ open: true });
    send(state.playing ? 'resume' : 'play');
    return;
  }
  queue = [];
  wantPlay = true;
  set({ item, open: true, playing: false, started: false, ready: false });
}

export function pauseInApp() { send('pause'); }
export function resumeInApp() { if (state.item) { set({ open: true }); send('resume'); } }
export function toggleInApp() { send('toggle'); }
/** 창만 닫기 (음악은 계속) */
export function hideWindow() { window.clearTimeout(closeTimer); set({ open: false }); }
export function showWindow() { if (state.item) set({ open: true }); }

/** Spotify 재생기에서 온 메시지 */
export function handleEmbedMessage(e: { origin: string; source?: unknown; data: unknown }) {
  if (e.origin !== SPOTIFY_ORIGIN) return;
  if (frame && e.source && e.source !== frame) return;
  const d = e.data as { type?: string; payload?: { isPaused?: boolean; isBuffering?: boolean; position?: number; duration?: number } } | null;
  if (!d?.type) return;
  if (d.type === 'ready') {
    set({ ready: true });
    try { frame?.postMessage({ command: 'load_complete_ack' }, SPOTIFY_ORIGIN); } catch { /* 없음 */ }
    if (wantPlay) { wantPlay = false; queue.unshift('play'); }
    const q = queue; queue = [];
    q.forEach((c) => send(c));
    return;
  }
  if (d.type === 'playback_started') { window.clearTimeout(closeTimer); set({ playing: true, started: true }); return; }
  if (d.type === 'playback_update' && d.payload) {
    const paused = !!d.payload.isPaused;
    if (!paused) {
      window.clearTimeout(closeTimer);
      if (!state.playing || !state.started) set({ playing: true, started: true });
      return;
    }
    if (d.payload.isBuffering) return;
    if (state.playing) set({ playing: false });
    // 곡을 멈추면 원래 화면으로 (곡이 넘어가는 순간의 짧은 멈춤은 무시)
    if (state.started && state.open) {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => { if (!state.playing) set({ open: false }); }, 1200);
    }
  }
}

/** 테스트용 초기화 */
export function resetEmbed() {
  window.clearTimeout(closeTimer);
  frame = null; queue = []; wantPlay = false;
  state = { item: null, open: false, playing: false, started: false, ready: false };
}
