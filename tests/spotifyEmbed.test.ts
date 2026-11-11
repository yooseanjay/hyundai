// 앱 안 Spotify 창: 말에 맞는 플레이리스트 · 재생하면 창이 뜨고 멈추면 원래 화면으로
import { beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

let sent: unknown[] = [];
const frame = { postMessage: (m: unknown) => { sent.push(m); } };
const msg = (data: unknown, origin = 'https://open.spotify.com') => ({ origin, source: frame, data });

async function load() {
  vi.resetModules();
  const g = globalThis as any;
  g.localStorage = new MemoryStorage();
  g.window = Object.assign(g, { open: () => null, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout });
  g.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
  const { openSecureStorage } = await import('../src/security/secureStorage');
  const { generateDataKey } = await import('../src/security/crypto');
  await openSecureStorage(await generateDataKey());
  const em = await import('../src/voice/spotifyEmbed');
  em.resetEmbed();
  em.attachFrame(frame as unknown as Window);
  return { em, actions: await import('../src/voice/actions') };
}

beforeEach(() => { sent = []; });

describe('앱 안 Spotify 창', () => {
  it('말에 맞는 플레이리스트, 곡을 콕 집으면 null', async () => {
    const { em } = await load();
    expect(em.presetFor('노래 틀어 줘')?.title).toBe('드라이브');
    expect(em.presetFor('신나는 케이팝 틀어줘')?.title).toBe('K-POP');
    expect(em.presetFor('잔잔한 음악 들려줘')?.title).toBe('잔잔한');
    expect(em.presetFor('아이유 밤편지 틀어줘')).toBeNull();
  });

  it('"노래 틀어 줘" → 창이 뜨고 재생, 멈추면 원래 화면으로', async () => {
    vi.useFakeTimers();
    const { em, actions } = await load();
    const r = await actions.runTool('play_music', { query: '노래 틀어 줘' }, {} as never);
    expect(r.card).toMatchObject({ kind: 'music', inApp: '드라이브' });
    expect(em.embedState()).toMatchObject({ open: true, playing: false });
    // 재생기 준비 → 바로 재생 명령
    em.handleEmbedMessage(msg({ type: 'ready' }));
    expect(sent).toContainEqual({ command: 'play' });
    em.handleEmbedMessage(msg({ type: 'playback_update', payload: { isPaused: false, position: 1 } }));
    expect(em.embedState()).toMatchObject({ open: true, playing: true, started: true });
    // 다른 곳에서 온 메시지는 무시
    em.handleEmbedMessage(msg({ type: 'playback_update', payload: { isPaused: true } }, 'https://evil.example'));
    expect(em.embedState().playing).toBe(true);
    // 곡 멈춤 → 잠깐 뒤 원래 화면
    em.handleEmbedMessage(msg({ type: 'playback_update', payload: { isPaused: true } }));
    expect(em.embedState().open).toBe(true);
    vi.advanceTimersByTime(1300);
    expect(em.embedState()).toMatchObject({ open: false, playing: false });
    vi.useRealTimers();
  });

  it('곡이 넘어가는 짧은 멈춤엔 창을 닫지 않음', async () => {
    vi.useFakeTimers();
    const { em } = await load();
    em.playInApp(em.PRESETS[1]);
    em.handleEmbedMessage(msg({ type: 'ready' }));
    em.handleEmbedMessage(msg({ type: 'playback_update', payload: { isPaused: false } }));
    em.handleEmbedMessage(msg({ type: 'playback_update', payload: { isPaused: true } }));
    vi.advanceTimersByTime(500);
    em.handleEmbedMessage(msg({ type: 'playback_update', payload: { isPaused: false } }));
    vi.advanceTimersByTime(2000);
    expect(em.embedState().open).toBe(true);
    vi.useRealTimers();
  });

  it('"노래 멈춰" → 창의 음악을 멈추고 원래 화면으로', async () => {
    vi.useFakeTimers();
    const { em, actions } = await load();
    em.playInApp(em.PRESETS[0]);
    em.handleEmbedMessage(msg({ type: 'ready' }));
    const t = actions.detectTool('멈춰');
    expect(t?.name).toBe('music_control');
    const r = await actions.runTool(t!.name, t!.args, {} as never);
    expect(r.card).toMatchObject({ kind: 'embed', action: 'pause' });
    expect(sent).toContainEqual({ command: 'pause' });
    vi.advanceTimersByTime(500);
    expect(em.embedState().open).toBe(false);
    expect(actions.summaryOf(r.card)).toContain('원래 화면');
    vi.useRealTimers();
  });
});

describe('앱 안 YouTube Music 창', () => {
  const yt = (data: unknown, origin = 'https://www.youtube-nocookie.com') => ({ origin, source: frame, data: JSON.stringify(data) });
  const cmds = () => sent.filter((m): m is string => typeof m === 'string').map((m) => JSON.parse(m));

  it('"유튜브 뮤직으로 노래 틀어 줘" → YouTube 창, 준비되면 playVideo, 멈추면 원래 화면으로', async () => {
    vi.useFakeTimers();
    const { em, actions } = await load();
    const t = actions.detectTool('유튜브 뮤직으로 신나는 케이팝 틀어 줘');
    expect(t?.name).toBe('play_music');
    const r = await actions.runTool(t!.name, t!.args, {} as never);
    expect(r.card).toMatchObject({ kind: 'music', inApp: 'K-POP', via: 'YouTube Music' });
    expect(em.embedState().item?.provider).toBe('youtube');
    expect(em.embedUrl(em.embedState().item!)).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/videoseries\?.*list=PL/);
    em.attachFrame(frame as unknown as Window);
    // 재생기에게 신호 요청
    expect(cmds()).toContainEqual({ event: 'listening', id: 1, channel: 'widget' });
    // Spotify 출처 · 다른 곳에서 온 메시지는 무시
    em.handleEmbedMessage(msg({ type: 'ready' }));
    em.handleEmbedMessage(yt({ event: 'onReady' }, 'https://evil.example'));
    expect(em.embedState().ready).toBe(false);
    em.handleEmbedMessage(yt({ event: 'onReady' }));
    expect(cmds()).toContainEqual(expect.objectContaining({ event: 'command', func: 'playVideo' }));
    em.handleEmbedMessage(yt({ event: 'onStateChange', info: 1 }));
    expect(em.embedState()).toMatchObject({ open: true, playing: true });
    // "멈춰" → pauseVideo, 원래 화면
    const stop = await actions.runTool('music_control', { action: 'pause' }, {} as never);
    expect(stop.card).toMatchObject({ kind: 'embed', action: 'pause', via: 'YouTube Music' });
    expect(cmds()).toContainEqual(expect.objectContaining({ func: 'pauseVideo' }));
    em.handleEmbedMessage(yt({ event: 'infoDelivery', info: { playerState: 2 } }));
    vi.advanceTimersByTime(1300);
    expect(em.embedState()).toMatchObject({ open: false, playing: false });
    vi.useRealTimers();
  });

  it('고른 서비스 기억 · 곡을 콕 집으면 YouTube Music 검색', async () => {
    const { em, actions } = await load();
    expect(em.providerFor('노래 틀어 줘')).toBe('spotify');
    em.setMusicProvider('youtube');
    expect(em.providerFor('노래 틀어 줘')).toBe('youtube');
    expect(em.providerFor('스포티파이로 틀어 줘')).toBe('spotify');
    expect(em.presetFor('집중할 때 음악')?.path).toBe('video/jfKfPfyJRdk');
    const r = await actions.runTool('play_music', { query: '아이유 밤편지 틀어줘' }, {} as never);
    expect(r.card).toMatchObject({ kind: 'music', via: 'YouTube Music', search: 'https://music.youtube.com/search?q=' + encodeURIComponent('아이유 밤편지') });
  });
});
