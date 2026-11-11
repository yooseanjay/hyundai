// 앱 안 음악 재생 창 (키·로그인 없이): Spotify · YouTube Music
//  - 공식 재생기(embed)를 앱 안에 띄우고, 재생 · 멈춤 신호를 postMessage로 주고받음
//    · Spotify: iFrame API와 같은 약속 ('ready' · 'playback_update' 를 받고 'play' · 'pause' · 'resume' 을 보냄)
//    · YouTube: IFrame Player API와 같은 약속 ('listening' 을 보내면 'onReady' · 'infoDelivery' 가 오고,
//      'command' + playVideo · pauseVideo 를 보냄). 쿠키 없는 youtube-nocookie.com 재생기
//    → 외부 스크립트를 페이지에 불러오지 않아 보안 정책(CSP)을 넓히지 않음 (frame-src만)
//  - 재생하면 창이 뜨고(차 화면: Pleos Connect 앱 창 자리 전체), 곡을 멈추면 원래 화면으로 돌아감
//  - Spotify에 로그인돼 있지 않은 브라우저에선 30초 미리 듣기만 됨 (Spotify 정책). YouTube는 전곡

export const SPOTIFY_ORIGIN = 'https://open.spotify.com';
export const YT_ORIGIN = 'https://www.youtube-nocookie.com';

export type MusicProvider = 'spotify' | 'youtube';
export const PROVIDER_NAME: Record<MusicProvider, string> = { spotify: 'Spotify', youtube: 'YouTube Music' };

export interface SpotifyItem {
  /** Spotify: 'playlist/ID' · 'track/ID'  ·  YouTube: 'list/ID' · 'video/ID' */
  path: string;
  title: string;
  sub?: string;
  provider?: MusicProvider; // 없으면 Spotify
}
export type MusicItem = SpotifyItem;
export const providerOf = (i: SpotifyItem | null | undefined): MusicProvider => i?.provider ?? 'spotify';

type Preset = SpotifyItem & { id: string; words: RegExp };

// 말 → 장르 (두 서비스 같은 기준)
const W = {
  drive: /(드라이브|신나|따라\s?부|운전|여행|기분\s?좋)/,
  kpop: /(케이팝|k-?pop|아이돌|가요|한국\s?노래)/i,
  hits: /(인기|요즘|최신|유행|히트|팝송|차트)/,
  chill: /(잔잔|조용|편안|차분|칠|chill|감성)/i,
  focus: /(집중|공부|로파이|lo-?fi|일할|작업)/i,
};

/** 키 없이 바로 틀 수 있는 Spotify 공식 플레이리스트 */
export const PRESETS: Preset[] = [
  { id: 'drive', path: 'playlist/37i9dQZF1DWWMOmoXKqHTD', title: '드라이브', sub: '따라 부르기 좋은 노래', words: W.drive },
  { id: 'kpop', path: 'playlist/37i9dQZF1DX9tPFwDMOaN1', title: 'K-POP', sub: 'K-Pop ON! (온)', words: W.kpop },
  { id: 'hits', path: 'playlist/37i9dQZF1DXcBWIGoYBM5M', title: '인기곡', sub: "Today's Top Hits", words: W.hits },
  { id: 'chill', path: 'playlist/37i9dQZF1DX4WYpdgoIcn6', title: '잔잔한', sub: '칠아웃 히트곡', words: W.chill },
  { id: 'focus', path: 'playlist/37i9dQZF1DWWQRwui0ExPn', title: '집중', sub: 'lofi beats', words: W.focus },
];

/** YouTube 공개 재생목록 (공식 차트 · 레이블 · 저작권 걱정 없는 채널 위주, 2026-11 확인) */
export const YT_PRESETS: Preset[] = [
  { id: 'drive', provider: 'youtube', path: 'list/PLDM_VOYt-U2vecHk1XHvXOMg86iI-mRuB', title: '드라이브', sub: '드라이브할 때 좋은 노래', words: W.drive },
  { id: 'kpop', provider: 'youtube', path: 'list/PLB1PuqtbwVQnYd1AOnvVARNmJGgV5K4_-', title: 'K-POP', sub: '최신 · 인기 K-POP', words: W.kpop },
  { id: 'hits', provider: 'youtube', path: 'list/PL4fGSI1pDJn6jXS_Tv_N9B8Z0HTRVJE0m', title: '인기곡', sub: '한국 인기곡 Top 100 (YouTube 차트)', words: W.hits },
  { id: 'chill', provider: 'youtube', path: 'list/PLRBp0Fe2Gpgn42sBXXWfimeYh0YJokgxO', title: '잔잔한', sub: 'Best of Chill (NCS)', words: W.chill },
  { id: 'focus', provider: 'youtube', path: 'video/jfKfPfyJRdk', title: '집중', sub: 'lofi hip hop radio (생방송)', words: W.focus },
];

export const presetsOf = (p: MusicProvider) => (p === 'youtube' ? YT_PRESETS : PRESETS);

// ───────── 고른 서비스 (기기에 기억) ─────────
const PREF_KEY = 'music-provider';
let provider: MusicProvider = (() => {
  try { return localStorage.getItem(PREF_KEY) === 'youtube' ? 'youtube' : 'spotify'; } catch { return 'spotify'; }
})();
export const musicProvider = () => provider;
export function setMusicProvider(p: MusicProvider) {
  provider = p;
  try { localStorage.setItem(PREF_KEY, p); } catch { /* 저장 못 해도 이번엔 씀 */ }
  listeners.forEach((f) => f());
}

/** 말에서 서비스 고르기: "유튜브 뮤직으로" → youtube, "스포티파이로" → spotify, 아니면 고른 서비스 */
export function providerFor(query: string): MusicProvider {
  if (/(유튜브|유투브|youtube|와이티\s?뮤직|yt\s?music)/i.test(query)) return 'youtube';
  if (/(스포티파이|spotify)/i.test(query)) return 'spotify';
  return provider;
}

/** 말한 내용에 맞는 플레이리스트. 곡 · 가수를 콕 집은 말이면 null (그건 검색으로) */
export function presetFor(query: string, p: MusicProvider = providerFor(query)): SpotifyItem | null {
  const q = query.trim();
  const list = presetsOf(p);
  // 장르를 먼저 보고("신나는 케이팝" → K-POP), 드라이브는 마지막에
  const hit = [...list.slice(1), list[0]].find((x) => x.words.test(q));
  if (hit) return hit;
  // "노래 틀어 줘", "유튜브 뮤직으로 음악 아무거나" 처럼 곡을 정하지 않은 말 → 드라이브
  const rest = q.replace(/(스포티파이|spotify|유튜브|유투브|youtube|뮤직|music|에서|로|으로|노래|음악|곡|좀|아무거나|아무|하나|틀어\s?줘|틀어\s?봐|틀어|들려\s?줘|들려|재생해\s?줘|재생|켜\s?줘|줘|요|[\s,.!?~])/gi, '');
  return rest.length === 0 ? list[0] : null;
}

/** 재생기 주소 */
export function embedUrl(item: SpotifyItem | string): string {
  const it = typeof item === 'string' ? { path: item, title: '' } : item;
  if (providerOf(it) === 'youtube') {
    const [kind, id] = it.path.split('/');
    const q = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', modestbranding: '1', hl: 'ko' });
    if (typeof location !== 'undefined') q.set('origin', location.origin);
    if (kind === 'list') q.set('list', id);
    return `${YT_ORIGIN}/embed/${kind === 'list' ? 'videoseries' : encodeURIComponent(id)}?${q}`;
  }
  return `${SPOTIFY_ORIGIN}/embed/${it.path}?utm_source=iframe-api&theme=0`;
}

/** 곡을 콕 집었을 때 (앱 안 재생기로는 검색이 안 됨) 열어 줄 검색 주소 */
export const youtubeMusicSearch = (q: string) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`;

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
let listenTimer = 0;
const listeners = new Set<() => void>();

export const embedState = () => state;
export function onEmbedChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function set(p: Partial<EmbedState>) {
  state = { ...state, ...p };
  listeners.forEach((f) => f());
  try {
    document.documentElement.classList.toggle('spotify-on', state.open);
    document.documentElement.classList.toggle('yt-on', state.open && providerOf(state.item) === 'youtube');
  } catch { /* 테스트 환경 */ }
}

const ytCommand: Record<string, string | undefined> = { play: 'playVideo', resume: 'playVideo', pause: 'pauseVideo' };

function post(msg: unknown) {
  const yt = providerOf(state.item) === 'youtube';
  try { frame?.postMessage(yt ? JSON.stringify(msg) : msg, yt ? YT_ORIGIN : SPOTIFY_ORIGIN); } catch { /* 창 없음 */ }
}

function send(command: string) {
  if (!frame || !state.ready) { queue.push(command); return; }
  if (providerOf(state.item) === 'youtube') {
    const func = command === 'toggle' ? (state.playing ? 'pauseVideo' : 'playVideo') : ytCommand[command];
    if (func) post({ event: 'command', func, args: [], id: 1, channel: 'widget' });
    return;
  }
  post({ command });
}

/** YouTube 재생기에게 "신호 보내 줘" (준비될 때까지 몇 번 되풀이 — 공식 API도 이렇게 함) */
function startListening() {
  window.clearInterval(listenTimer);
  if (providerOf(state.item) !== 'youtube') return;
  let n = 0;
  const hello = () => {
    if (state.ready || ++n > 40) { window.clearInterval(listenTimer); return; }
    post({ event: 'listening', id: 1, channel: 'widget' });
  };
  hello();
  listenTimer = window.setInterval(hello, 250);
}

/** 재생 창의 iframe이 바뀌거나 다 불러왔을 때 (SpotifyWindow가 부름) */
export function attachFrame(w: Window | null) {
  frame = w;
  if (w) startListening();
}

/** 앱 안 창에서 틀기: 창을 띄우고, 준비되면 바로 재생 */
export function playInApp(item: SpotifyItem) {
  window.clearTimeout(closeTimer);
  const same = state.item?.path === item.path && providerOf(state.item) === providerOf(item);
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

function onReady() {
  set({ ready: true });
  window.clearInterval(listenTimer);
  if (providerOf(state.item) === 'spotify') post({ command: 'load_complete_ack' });
  if (wantPlay) { wantPlay = false; queue.unshift('play'); }
  const q = queue; queue = [];
  q.forEach((c) => send(c));
}
function onPlaying() {
  window.clearTimeout(closeTimer);
  if (!state.playing || !state.started) set({ playing: true, started: true });
}
function onPaused() {
  if (state.playing) set({ playing: false });
  // 곡을 멈추면 원래 화면으로 (곡이 넘어가는 순간의 짧은 멈춤은 무시)
  if (state.started && state.open) {
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => { if (!state.playing) set({ open: false }); }, 1200);
  }
}

/** 재생기에서 온 메시지 (출처 · 보낸 창을 확인하고 받음) */
export function handleEmbedMessage(e: { origin: string; source?: unknown; data: unknown }) {
  const p = providerOf(state.item);
  if (e.origin !== (p === 'youtube' ? YT_ORIGIN : SPOTIFY_ORIGIN)) return;
  if (frame && e.source && e.source !== frame) return;
  if (p === 'youtube') return handleYouTube(e.data);
  const d = e.data as { type?: string; payload?: { isPaused?: boolean; isBuffering?: boolean } } | null;
  if (!d?.type) return;
  if (d.type === 'ready') return onReady();
  if (d.type === 'playback_started') return onPlaying();
  if (d.type === 'playback_update' && d.payload) {
    if (!d.payload.isPaused) return onPlaying();
    if (d.payload.isBuffering) return;
    onPaused();
  }
}

/** YouTube 상태: -1 시작 전 · 0 끝 · 1 재생 · 2 멈춤 · 3 버퍼링 · 5 대기 */
function handleYouTube(raw: unknown) {
  let d: { event?: string; info?: unknown } | null = null;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : (raw as typeof d); } catch { return; }
  if (!d?.event) return;
  if (d.event === 'onReady') return onReady();
  const st = d.event === 'onStateChange' ? d.info
    : d.event === 'infoDelivery' ? (d.info as { playerState?: number } | null)?.playerState : undefined;
  if (typeof st !== 'number') return;
  if (st === 1) onPlaying();
  else if (st === 2) onPaused();
}

/** 테스트용 초기화 */
export function resetEmbed() {
  window.clearTimeout(closeTimer);
  window.clearInterval(listenTimer);
  frame = null; queue = []; wantPlay = false;
  state = { item: null, open: false, playing: false, started: false, ready: false };
}
