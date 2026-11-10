// ─────────────────────────────────────────────────────────────────────────────
// 보안 1단계 · 서버 함수 공통 관문 (Vercel Edge)
//  (Vercel은 '_'로 시작하는 파일을 경로로 만들지 않음 → 외부에서 직접 부를 수 없는 내부 모듈)
//
//  1. 출처 검사   Origin 허용 목록 + Origin이 없으면 Sec-Fetch-Site: same-origin 일 때만 통과
//  2. 메서드 제한 경로마다 허용한 메서드만
//  3. 횟수 제한   IP·경로별 슬라이딩 윈도(1분)
//  4. 크기 제한   본문 바이트 상한, JSON 파싱 실패 차단
//  5. 응답 머리   no-store · nosniff · CORP · 요청 ID (오류 내용은 감추고 ID로만 추적)
// ─────────────────────────────────────────────────────────────────────────────

export const ORIGINS = [
  /^https:\/\/yooseanjay\.github\.io$/,
  /^https:\/\/our-car-alive[\w-]*\.vercel\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/, // 같은 Wi-Fi의 휴대폰으로 개발 서버 시험
];

export interface GuardOptions {
  methods: string[];
  perMinute: number;
  maxBody?: number;
  /** true면 같은 사이트에서 온 요청만 (쿠키를 쓰는 차량 API) */
  sameOriginOnly?: boolean;
  /** 같은 함수 안에서 횟수를 따로 셀 이름 (예: 돈이 드는 호출과 상태 확인 분리) */
  bucket?: string;
}

export interface Ctx {
  ip: string;
  reqId: string;
  origin: string | null;
  headers: Record<string, string>;
  json(body: unknown, status?: number, extra?: Record<string, string>): Response;
  readJson<T = unknown>(): Promise<T>;
}

const windows = new Map<string, number[]>();

/** 슬라이딩 윈도 횟수 제한 (인스턴스 메모리. 여러 인스턴스 전체 제한은 SECURITY.md 참고) */
export function rateLimited(key: string, perMinute: number, now = Date.now()): boolean {
  const list = (windows.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  windows.set(key, list);
  if (windows.size > 10_000) windows.clear(); // 메모리 폭주 방지
  return list.length > perMinute;
}

export function originAllowed(req: Request, sameOriginOnly = false): boolean {
  const origin = req.headers.get('Origin');
  const self = new URL(req.url).origin;
  const site = req.headers.get('Sec-Fetch-Site');
  if (!origin) return site === 'same-origin' || (!sameOriginOnly && site === 'none');
  if (origin === self) return true;
  return !sameOriginOnly && ORIGINS.some((re) => re.test(origin));
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function guard(req: Request, opt: GuardOptions): Ctx | Response {
  const origin = req.headers.get('Origin');
  const ok = originAllowed(req, opt.sameOriginOnly);
  const reqId = crypto.randomUUID();
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': opt.sameOriginOnly ? 'same-origin' : 'cross-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Request-Id': reqId,
    Vary: 'Origin',
  };
  if (ok && origin && !opt.sameOriginOnly) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = [...opt.methods, 'OPTIONS'].join(', ');
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra, 'Content-Type': 'application/json; charset=utf-8' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers });
  if (!ok) return json({ error: '허용되지 않은 출처예요', reqId }, 403);
  if (!opt.methods.includes(req.method)) return json({ error: '허용되지 않은 메서드예요', reqId }, 405, { Allow: opt.methods.join(', ') });

  const ip = (req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  const route = new URL(req.url).pathname + (opt.bucket ? `#${opt.bucket}` : '');
  if (rateLimited(`${route}|${ip}`, opt.perMinute)) return json({ error: '잠시 뒤에 다시 시도해 주세요', reqId }, 429, { 'Retry-After': '60' });

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (opt.maxBody && declared > opt.maxBody) return json({ error: '요청이 너무 커요', reqId }, 413);

  return {
    ip, reqId, origin, headers, json,
    async readJson<T>() {
      const text = await req.text();
      if (opt.maxBody && text.length > opt.maxBody) throw new HttpError(413, '요청이 너무 커요');
      try { return JSON.parse(text) as T; } catch { throw new HttpError(400, '잘못된 요청이에요'); }
    },
  };
}

/** 예외를 사용자용 메시지로 (내부 오류 내용은 밖으로 내보내지 않고 요청 ID만) */
export function fail(ctx: Ctx, e: unknown): Response {
  if (e instanceof HttpError) return ctx.json({ error: e.message, reqId: ctx.reqId }, e.status);
  console.error(`[${ctx.reqId}]`, (e as Error)?.message ?? e);
  return ctx.json({ error: '서버에서 문제가 생겼어요', reqId: ctx.reqId }, 500);
}

export function env(name: string): string {
  return ((globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env?.[name] ?? '').trim();
}
