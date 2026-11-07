// Vercel 서버 함수 (Edge): Spotify 노래 검색 중계
// - Spotify 앱 키(SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET)는 Vercel 환경 변수에만 → 브라우저·GitHub에 노출 없음
// - Client Credentials(앱 인증)로 검색만 함. 사용자 계정·재생 권한은 건드리지 않음
//
//  GET /api/spotify?p=status        → { enabled }
//  GET /api/spotify?q=아이유 밤편지   → { tracks: [{ id, name, artist, album, image, url }] }
export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

import { guard } from './_lib/http';

let token: { value: string; exp: number } | null = null;

async function appToken(id: string, secret: string): Promise<string> {
  if (token && token.exp > Date.now() + 30_000) return token.value;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const isStatus = url.searchParams.get('p') === 'status';
  // 보안 1단계 공통 관문: 출처 허용 목록 · GET만 · IP별 1분 20회(검색) / 60회(상태)
  const ctx = guard(req, { methods: ['GET'], perMinute: isStatus ? 60 : 20, bucket: isStatus ? 'status' : 'search' });
  if (ctx instanceof Response) return ctx;
  const { json } = ctx;

  const id = process.env.SPOTIFY_CLIENT_ID ?? '';
  const secret = process.env.SPOTIFY_CLIENT_SECRET ?? '';
  if (isStatus) return json({ enabled: !!(id && secret) }, 200);
  if (!id || !secret) return json({ error: { message: '서버에 Spotify 키가 아직 없어요' } }, 503);

  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (!q) return json({ error: { message: '검색어가 없어요' } }, 400);

  try {
    const t = await appToken(id, secret);
    const r = await fetch(`https://api.spotify.com/v1/search?type=track&market=KR&limit=3&q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (r.status === 401) token = null;
    if (!r.ok) return json({ error: { message: '검색 실패' } }, 502);
    const j = (await r.json()) as { tracks?: { items?: any[] } };
    const tracks = (j.tracks?.items ?? []).map((it) => ({
      id: String(it.id),
      name: String(it.name),
      artist: (it.artists ?? []).map((a: { name: string }) => a.name).join(', '),
      album: String(it.album?.name ?? ''),
      image: String(it.album?.images?.at(-1)?.url ?? ''),
      url: String(it.external_urls?.spotify ?? `https://open.spotify.com/track/${it.id}`),
    }));
    return json({ tracks }, 200);
  } catch {
    return json({ error: { message: '검색 실패' } }, 502);
  }
}
