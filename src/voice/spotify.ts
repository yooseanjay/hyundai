// Spotify 연결
//  1) 기본: 키 없이 바로 연결 — '연결'을 누르면 Spotify 앱(없으면 웹)이 열리고, 말로 부른 노래는 Spotify에서 바로 찾아 틀어 줌
//  2) 앱 주인이 Spotify 개발자 앱 Client ID(VITE_SPOTIFY_CLIENT_ID)를 넣어 배포하면: 계정 로그인으로 재생 · 멈춤 · 다음 곡까지 제어
//  - Authorization Code + PKCE: 비밀 키 없이 브라우저에서 로그인 (Client ID는 공개 값)
//  - 토큰은 이 기기에만 암호화 저장(secureStorage), 서버로 보내지 않음
//  - 재생 제어는 Spotify Premium + 켜져 있는 Spotify 기기(휴대폰 · PC · 차)가 필요
import { secureStorage } from '../security/secureStorage';

const AUTH = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const TOKEN_KEY = 'oca.spotify.v1';
const LINK_KEY = 'spotify-linked';
const PKCE_KEY = 'spotify-pkce';

interface Tokens { at: string; rt: string; exp: number }

/** 이 앱 주소 그대로 (Spotify 개발자 앱의 Redirect URI에 똑같이 등록) */
export const redirectUri = () => location.origin + import.meta.env.BASE_URL;

/** 계정 로그인(재생 제어)용 Client ID: 앱 주인이 배포할 때만 넣음. 없으면 키 없는 바로 연결만 */
export const clientId = (): string => (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? '';

// ---------- 키 없이 바로 연결 ----------
export const spotifyLinked = () => { try { return localStorage.getItem(LINK_KEY) === '1' || spotifyConnected(); } catch { return false; } };
export const SPOTIFY_HOME = 'https://open.spotify.com';
/** 노래 찾기 주소: 휴대폰에 Spotify 앱이 있으면 앱이, 없으면 웹 플레이어가 열림 */
export const spotifySearchUrl = (q: string) => `${SPOTIFY_HOME}/search/${encodeURIComponent(q)}`;

/** Spotify 열기 (새 창). 막히면 false → 화면 버튼으로 */
export function openSpotify(url = SPOTIFY_HOME): boolean {
  try { return !!window.open(url, '_blank', 'noopener'); } catch { return false; }
}

/** '연결': 이 앱에 Spotify를 쓰겠다고 표시하고 Spotify를 엶 (로그인은 Spotify 앱 · 웹에서) */
export function linkSpotify(open = true): boolean {
  try { localStorage.setItem(LINK_KEY, '1'); } catch { /* 저장 안 됨 */ }
  changed();
  return open ? openSpotify() : true;
}
export function unlinkSpotify() {
  try { localStorage.removeItem(LINK_KEY); } catch { /* 없음 */ }
  save(null);
}

function load(): Tokens | null {
  try { const v = JSON.parse(secureStorage.getItem(TOKEN_KEY) ?? 'null'); return v?.at ? v : null; } catch { return null; }
}
function save(t: Tokens | null) {
  if (t) secureStorage.setItem(TOKEN_KEY, JSON.stringify(t));
  else secureStorage.removeItem(TOKEN_KEY);
  changed();
}
function changed() { window.dispatchEvent(new Event('spotify-change')); }

/** 계정 로그인(재생 제어)까지 된 상태 */
export const spotifyConnected = () => { try { return !!load(); } catch { return false; } };
export function disconnectSpotify() { save(null); }

// ---------- 로그인 ----------
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Spotify 로그인 화면으로 이동 */
export async function connectSpotify(): Promise<void> {
  const id = clientId();
  if (!id) throw new Error('Spotify Client ID가 필요해요');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = 'sp_' + b64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({
    client_id: id, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge, state,
  });
  location.assign(`${AUTH}/authorize?${q}`);
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const r = await fetch(`${AUTH}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), ...body }),
  });
  if (!r.ok) throw new Error(`Spotify 로그인 실패 (${r.status})`);
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return { at: j.access_token, rt: j.refresh_token ?? body.refresh_token ?? '', exp: Date.now() + j.expires_in * 1000 };
}

/** 로그인하고 돌아왔을 때 (?code=…&state=sp_…). 처리했으면 결과 문구, 아니면 null */
export async function handleSpotifyCallback(): Promise<string | null> {
  const q = new URLSearchParams(location.search);
  const state = q.get('state');
  if (!state?.startsWith('sp_')) return null;
  const clean = () => history.replaceState(null, '', location.pathname + location.hash);
  let saved: { verifier: string; state: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null'); } catch { /* 없음 */ }
  sessionStorage.removeItem(PKCE_KEY);
  const code = q.get('code');
  clean();
  if (q.get('error')) return q.get('error') === 'access_denied' ? 'Spotify 연결을 취소했어요' : 'Spotify 연결에 실패했어요';
  if (!code || !saved || saved.state !== state) return 'Spotify 연결에 실패했어요 (다시 시도해 주세요)';
  try {
    save(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: saved.verifier }));
    return 'Spotify 계정이 연결됐어요';
  } catch (e) {
    return e instanceof Error ? e.message : 'Spotify 연결에 실패했어요';
  }
}

async function accessToken(): Promise<string> {
  const t = load();
  if (!t) throw new SpotifyError('login', 'Spotify 계정을 먼저 연결해 주세요');
  if (t.exp > Date.now() + 60_000) return t.at;
  try {
    const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.rt });
    save(n);
    return n.at;
  } catch {
    save(null);
    throw new SpotifyError('login', 'Spotify 로그인이 만료됐어요. 다시 연결해 주세요');
  }
}

export class SpotifyError extends Error {
  constructor(public code: 'login' | 'premium' | 'device' | 'fail', msg: string) { super(msg); }
}

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T | null> {
  const at = await accessToken();
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${at}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204 || r.status === 202) return null;
  if (r.status === 401) { save(null); throw new SpotifyError('login', 'Spotify 로그인이 만료됐어요. 다시 연결해 주세요'); }
  let j: { error?: { message?: string; reason?: string } } & Record<string, unknown> = {};
  try { j = await r.json(); } catch { /* 본문 없음 */ }
  if (r.status === 403 && /premium/i.test(`${j.error?.reason} ${j.error?.message}`)) throw new SpotifyError('premium', '재생 제어는 Spotify Premium 계정에서만 돼요');
  if (r.status === 404 && /device/i.test(`${j.error?.reason} ${j.error?.message}`)) throw new SpotifyError('device', '켜져 있는 Spotify 기기가 없어요. 휴대폰이나 PC에서 Spotify 앱을 한 번 열어 주세요');
  if (!r.ok) throw new SpotifyError('fail', `Spotify 요청 실패 (${r.status})`);
  return j as T;
}

// ---------- 재생 ----------
export interface NowPlaying { playing: boolean; name: string; artist: string; image: string; url: string; device: string }

export async function nowPlaying(): Promise<NowPlaying | null> {
  const j = await call<{ is_playing: boolean; item?: any; device?: { name: string } }>('GET', '/me/player');
  if (!j?.item) return null;
  return {
    playing: j.is_playing,
    name: String(j.item.name ?? ''),
    artist: (j.item.artists ?? []).map((a: { name: string }) => a.name).join(', '),
    image: String(j.item.album?.images?.at(-1)?.url ?? ''),
    url: String(j.item.external_urls?.spotify ?? ''),
    device: j.device?.name ?? '',
  };
}

/** 켜진 기기가 없으면, 목록의 첫 기기로 넘겨서 재생 */
async function withDevice<T>(fn: (deviceId?: string) => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof SpotifyError) || e.code !== 'device') throw e;
    const d = await call<{ devices: { id: string; is_active: boolean }[] }>('GET', '/me/player/devices');
    const dev = d?.devices?.[0];
    if (!dev) throw e;
    return fn(dev.id);
  }
}

export interface PlayedTrack { name: string; artist: string; url: string; image: string; uri: string }

/** 검색해서 첫 곡 재생 */
export async function searchAndPlay(query: string): Promise<{ track: PlayedTrack; alts: PlayedTrack[] }> {
  const j = await call<{ tracks?: { items?: any[] } }>('GET', `/search?type=track&market=from_token&limit=4&q=${encodeURIComponent(query)}`);
  const items: PlayedTrack[] = (j?.tracks?.items ?? []).map((it) => ({
    name: String(it.name),
    artist: (it.artists ?? []).map((a: { name: string }) => a.name).join(', '),
    url: String(it.external_urls?.spotify ?? ''),
    image: String(it.album?.images?.at(-1)?.url ?? ''),
    uri: String(it.uri),
  }));
  if (!items.length) throw new SpotifyError('fail', `'${query}' 노래를 찾지 못했어요`);
  await playUri(items[0].uri);
  return { track: items[0], alts: items.slice(1) };
}

export function playUri(uri: string) {
  return withDevice((id) => call('PUT', `/me/player/play${id ? `?device_id=${id}` : ''}`, { uris: [uri] }));
}

export type PlayerAction = 'pause' | 'resume' | 'next' | 'previous' | 'now';

export async function control(action: PlayerAction): Promise<NowPlaying | null> {
  if (action === 'pause') await call('PUT', '/me/player/pause');
  else if (action === 'resume') await withDevice((id) => call('PUT', `/me/player/play${id ? `?device_id=${id}` : ''}`));
  else if (action === 'next') await call('POST', '/me/player/next');
  else if (action === 'previous') await call('POST', '/me/player/previous');
  // 곡이 바뀌는 데 잠깐 걸림
  if (action !== 'now') await new Promise((ok) => window.setTimeout(ok, 450));
  return nowPlaying();
}
