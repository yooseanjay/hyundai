// Spotify 계정 연결(PKCE 로그인) · 음성 명령 → 재생 제어
import { beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

let assigned = '';
let calls: { url: string; method: string; body?: string }[] = [];
let responder: (url: string, method: string) => { status: number; body?: unknown };

async function load(search = '') {
  vi.resetModules();
  const g = globalThis as any;
  g.localStorage = new MemoryStorage();
  g.sessionStorage = new MemoryStorage();
  g.location = { origin: 'https://yooseanjay.github.io', pathname: '/hyundai/', search, hash: '', assign: (u: string) => { assigned = u; } };
  g.history = { replaceState: (_a: unknown, _b: string, u: string) => { g.location.search = u.includes('?') ? u.slice(u.indexOf('?')) : ''; } };
  g.window = Object.assign(g, { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout });
  g.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? String(init.body) : undefined });
    const r = responder(url, method);
    return { ok: r.status < 400, status: r.status, json: async () => r.body ?? {} } as Response;
  });
  // 앱처럼 암호화 저장소를 먼저 연다
  const { openSecureStorage } = await import('../src/security/secureStorage');
  const { generateDataKey } = await import('../src/security/crypto');
  await openSecureStorage(await generateDataKey());
  return {
    sp: await import('../src/voice/spotify'),
    actions: await import('../src/voice/actions'),
  };
}

beforeEach(() => { assigned = ''; calls = []; responder = () => ({ status: 204 }); });

describe('Spotify 계정 연결', () => {
  it('로그인: PKCE(S256)로 Spotify 로그인 화면에 보내고, 돌아오면 토큰을 받아 저장', async () => {
    const { sp } = await load();
    sp.setClientId('0123456789abcdef0123456789abcdef');
    await sp.connectSpotify();
    const u = new URL(assigned);
    expect(u.origin).toBe('https://accounts.spotify.com');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('https://yooseanjay.github.io/');
    expect(u.searchParams.get('scope')).toContain('user-modify-playback-state');
    const state = u.searchParams.get('state')!;

    // Spotify가 돌려보냄
    (globalThis as any).location.search = `?code=abc&state=${state}`;
    responder = (url) => url.endsWith('/api/token') ? { status: 200, body: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } } : { status: 204 };
    expect(await sp.handleSpotifyCallback()).toBe('Spotify 계정이 연결됐어요');
    expect(sp.spotifyConnected()).toBe(true);
    expect(calls[0].body).toContain('code_verifier=');
    expect((globalThis as any).location.search).toBe(''); // 주소에서 code 지움
  });

  it('state가 다르면 토큰을 받지 않음 (가로채기 방지)', async () => {
    const { sp } = await load();
    sp.setClientId('0123456789abcdef0123456789abcdef');
    await sp.connectSpotify();
    (globalThis as any).location.search = '?code=abc&state=sp_other';
    expect(await sp.handleSpotifyCallback()).toContain('실패');
    expect(sp.spotifyConnected()).toBe(false);
    expect(calls.length).toBe(0);
  });
});

describe('음성 명령', () => {
  const connect = async () => {
    const m = await load();
    m.sp.setClientId('0123456789abcdef0123456789abcdef');
    await m.sp.connectSpotify();
    const state = new URL(assigned).searchParams.get('state');
    (globalThis as any).location.search = `?code=abc&state=${state}`;
    responder = () => ({ status: 200, body: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } });
    await m.sp.handleSpotifyCallback();
    calls = [];
    return m;
  };

  it('말을 알맞은 도구로', async () => {
    const { actions } = await connect();
    const d = (t: string) => actions.detectTool(t);
    expect(d('스포티파이 연결해줘')?.name).toBe('connect_spotify');
    expect(d('다음 곡')?.args).toEqual({ action: 'next' });
    expect(d('노래 멈춰')?.args).toEqual({ action: 'pause' });
    expect(d('일시정지')?.args).toEqual({ action: 'pause' });
    expect(d('에어컨 꺼줘')?.name).not.toBe('music_control');
    expect(d('이전 곡 틀어줘')?.args).toEqual({ action: 'previous' });
    expect(d('지금 나오는 노래 뭐야')?.args).toEqual({ action: 'now' });
    expect(d('아이유 밤편지 틀어줘')).toEqual({ name: 'play_music', args: { query: '아이유 밤편지 틀어줘' } });
  });

  it('연결돼 있으면 검색해서 내 Spotify에서 바로 재생', async () => {
    const { actions } = await connect();
    responder = (url, method) => url.includes('/search')
      ? { status: 200, body: { tracks: { items: [{ name: '밤편지', uri: 'spotify:track:1', artists: [{ name: '아이유' }], album: { images: [] }, external_urls: { spotify: 'u' } }] } } }
      : method === 'PUT' ? { status: 204 } : { status: 200 };
    const r = await actions.runTool('play_music', { query: '아이유 밤편지 틀어줘' }, {} as never);
    expect(r.card.kind).toBe('player');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toContain('/me/player/play');
    expect(put.body).toContain('spotify:track:1');
    expect(actions.summaryOf(r.card)).toContain('아이유의 밤편지');
  });

  it('Premium이 아니면 이유를 말하고 재생 카드로 대신', async () => {
    const { actions } = await connect();
    responder = (url, method) => url.includes('/search')
      ? { status: 200, body: { tracks: { items: [{ name: '밤편지', uri: 'spotify:track:1', artists: [{ name: '아이유' }], album: { images: [] }, external_urls: {} }] } } }
      : method === 'PUT' ? { status: 403, body: { error: { reason: 'PREMIUM_REQUIRED' } } } : { status: 200, body: {} };
    const r = await actions.runTool('play_music', { query: '밤편지 틀어줘' }, {} as never);
    expect(r.card.kind).toBe('music');
    expect(actions.summaryOf(r.card)).toContain('Premium');
  });

  it('다음 곡 → POST /me/player/next', async () => {
    const { actions } = await connect();
    responder = (url) => url.endsWith('/me/player') ? { status: 200, body: { is_playing: true, item: { name: '다음', artists: [{ name: '가수' }], album: { images: [] }, external_urls: {} } } } : { status: 204 };
    const r = await actions.runTool('music_control', { action: 'next' }, {} as never);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/me/player/next'))).toBe(true);
    expect(actions.summaryOf(r.card)).toContain('가수의 다음');
  });

  it('연결 안 됐으면 연결 카드', async () => {
    const { actions } = await load();
    const r = await actions.runTool('music_control', { action: 'pause' }, {} as never);
    expect(r.card.kind).toBe('spotify-connect');
  });
});
