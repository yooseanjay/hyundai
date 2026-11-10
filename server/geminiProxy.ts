// Gemini 중계 (Vite 개발 서버 안에서 동작) — .env.local의 GEMINI_API_KEY를 브라우저에 노출하지 않고 대신 붙여 준다.
//  GET  /gemini-proxy/status      → { enabled }
//  ANY  /gemini-proxy/<path>      → https://generativelanguage.googleapis.com/<path>
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';

const API = 'https://generativelanguage.googleapis.com';
// 대화(generateContent) · 모델 목록 · 음성(interactions)만 허용
const ALLOWED = /^\/v1beta\/(models(\?|$|\/[\w.-]+:generateContent)|interactions$)/;

const body = (req: IncomingMessage) =>
  new Promise<Buffer>((ok) => {
    const parts: Buffer[] = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => ok(Buffer.concat(parts)));
  });

export function geminiProxy(apiKey: string): Plugin {
  return {
    name: 'gemini-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/gemini-proxy')) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (url.pathname === '/gemini-proxy/status') return res.end(JSON.stringify({ enabled: !!apiKey }));
        const path = url.pathname.slice('/gemini-proxy'.length) + url.search;
        if (!apiKey) { res.statusCode = 503; return res.end('{"error":{"message":"GEMINI_API_KEY 없음"}}'); }
        if (!ALLOWED.test(path)) { res.statusCode = 403; return res.end('{"error":{"message":"허용되지 않은 경로"}}'); }
        try {
          const r = await fetch(API + path, {
            method: req.method,
            headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
            body: req.method === 'POST' ? await body(req) : undefined,
          });
          res.statusCode = r.status;
          const type = r.headers.get('content-type') ?? 'application/json';
          res.setHeader('Content-Type', type);
          if (type.includes('event-stream') && r.body) {
            // 음성 스트리밍: 받는 대로 바로 넘겨서 빨리 재생되게
            res.setHeader('Cache-Control', 'no-cache');
            const reader = r.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
            return res.end();
          }
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: { message: (e as Error).message } }));
        }
      });
    },
  };
}
