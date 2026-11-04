// 현대 Open API 로그인 · 토큰 · API 프록시 (Vite 개발 서버 안에서 동작하는 작은 백엔드)
//
// 왜 필요한가?
//  - 로그인 후 받은 code → access token 교환에는 Client Secret이 필요하다.
//    Secret이 브라우저로 나가면 안 되므로 이 서버(로컬 Node)에서만 다룬다.
//  - 브라우저가 현대 API를 직접 부르면 CORS에 막힐 수 있으므로 /hapi/* 로 대신 호출해 준다.
//  - 토큰도 브라우저에 주지 않고 서버가 들고 있다가 요청에 붙인다.
//
// 경로
//  GET /auth/login     → 현대 로그인 페이지로 이동
//  GET /callback       → code를 토큰으로 교환 후 앱(/)으로 돌아감
//  GET /auth/status    → { configured, loggedIn, expiresAt }
//  GET /auth/logout    → 토큰 삭제
//  ANY /hapi/<path>    → BASE/<path> 로 전달 (Authorization: Bearer 자동 첨부)
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

interface Options {
  base: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizePath: string;
  tokenPath: string;
  root: string;
}

interface TokenSet {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number; // epoch ms
}

export function hyundaiAuth(opts: Options): Plugin {
  const tokenFile = resolve(opts.root, '.hyundai-token.json'); // .gitignore 처리됨
  const states = new Set<string>();
  let token: TokenSet | null = null;
  try {
    if (existsSync(tokenFile)) token = JSON.parse(readFileSync(tokenFile, 'utf8'));
  } catch {
    token = null;
  }

  const configured = () => !!(opts.clientId && opts.clientSecret);
  const basic = () => 'Basic ' + Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64');

  const save = (t: TokenSet | null) => {
    token = t;
    if (t) writeFileSync(tokenFile, JSON.stringify(t, null, 2));
    else if (existsSync(tokenFile)) unlinkSync(tokenFile);
  };

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };
  const redirect = (res: ServerResponse, to: string) => {
    res.statusCode = 302;
    res.setHeader('Location', to);
    res.end();
  };

  /** 토큰 엔드포인트 호출 (authorization_code / refresh_token 공통) */
  async function requestToken(params: Record<string, string>): Promise<TokenSet> {
    const r = await fetch(new URL(opts.tokenPath, opts.base), {
      method: 'POST',
      headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const text = await r.text();
    let body: any = {};
    try {
      body = JSON.parse(text);
    } catch {
      /* not json */
    }
    if (!r.ok || !body.access_token) {
      const msg = body.errMsg ?? body.error_description ?? body.error ?? text.slice(0, 200);
      throw new Error(`토큰 발급 실패 (HTTP ${r.status}${body.errCode ? `, ${body.errCode}` : ''}): ${msg}`);
    }
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token ?? token?.refresh_token,
      token_type: body.token_type ?? 'Bearer',
      expires_at: body.expires_in ? Date.now() + Number(body.expires_in) * 1000 : undefined,
    };
  }

  async function refreshIfNeeded(force = false) {
    if (!token) return;
    const expired = token.expires_at && token.expires_at - 60_000 < Date.now();
    if (!force && !expired) return;
    if (!token.refresh_token) return;
    try {
      save(await requestToken({ grant_type: 'refresh_token', refresh_token: token.refresh_token, redirect_uri: opts.redirectUri }));
      console.log('[hyundai] 토큰 갱신 완료');
    } catch (e) {
      console.warn('[hyundai]', (e as Error).message);
    }
  }

  async function proxy(req: IncomingMessage, res: ServerResponse, path: string) {
    if (!token) return json(res, 401, { errCode: 'LOGIN', errMsg: '현대 계정 로그인이 필요합니다' });
    await refreshIfNeeded();
    const call = () =>
      fetch(new URL(path, opts.base), {
        method: req.method,
        headers: { Authorization: `Bearer ${token!.access_token}`, Accept: 'application/json' },
      });
    let r = await call();
    if (r.status === 401 && token.refresh_token) {
      await refreshIfNeeded(true);
      r = await call();
    }
    const text = await r.text();
    console.log(`[hyundai] ${req.method} ${path} → ${r.status}`);
    res.statusCode = r.status;
    res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/json; charset=utf-8');
    res.end(text);
  }

  return {
    name: 'hyundai-auth',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        try {
          if (url.pathname === '/auth/status') {
            return json(res, 200, { configured: configured(), loggedIn: !!token, expiresAt: token?.expires_at ?? null });
          }
          if (url.pathname === '/auth/logout') {
            save(null);
            return redirect(res, '/');
          }
          if (url.pathname === '/auth/login') {
            if (!configured()) return json(res, 500, { errMsg: '.env.local에 Client ID / Client Secret을 넣고 서버를 다시 켜 주세요' });
            const state = randomUUID();
            states.add(state);
            const u = new URL(opts.authorizePath, opts.base);
            u.searchParams.set('client_id', opts.clientId);
            u.searchParams.set('redirect_uri', opts.redirectUri);
            u.searchParams.set('response_type', 'code');
            u.searchParams.set('state', state);
            return redirect(res, u.toString());
          }
          if (url.pathname === '/callback') {
            const err = url.searchParams.get('error') ?? url.searchParams.get('errMsg');
            if (err) return redirect(res, `/?auth_error=${encodeURIComponent(err)}`);
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            if (!code) return redirect(res, `/?auth_error=${encodeURIComponent('code가 없습니다')}`);
            if (state && !states.has(state)) return redirect(res, `/?auth_error=${encodeURIComponent('state 불일치 — 다시 로그인해 주세요')}`);
            if (state) states.delete(state);
            save(await requestToken({ grant_type: 'authorization_code', code, redirect_uri: opts.redirectUri }));
            console.log('[hyundai] 로그인 성공, 토큰 저장');
            return redirect(res, '/?auth=ok');
          }
          if (url.pathname.startsWith('/hapi/')) {
            return await proxy(req, res, url.pathname.slice('/hapi'.length) + url.search);
          }
        } catch (e) {
          const msg = (e as Error).message;
          console.error('[hyundai]', msg);
          if (url.pathname === '/callback') return redirect(res, `/?auth_error=${encodeURIComponent(msg)}`);
          return json(res, 502, { errCode: 'PROXY', errMsg: msg });
        }
        next();
      });
    },
  };
}
