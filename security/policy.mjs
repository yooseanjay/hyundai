// ─────────────────────────────────────────────────────────────────────────────
// 보안 1단계 · 브라우저 보안 정책 (한 곳에서 정의 → Vercel 응답 헤더 · GitHub Pages <meta> 양쪽에 사용)
//
//  CSP(Content-Security-Policy): 허락한 출처의 스크립트·연결만 실행 → XSS로 심은 코드가
//  외부로 일기·차량 정보를 보내는 것(데이터 유출 경로)을 브라우저가 막는다.
//  tests/headers.test.ts 가 vercel.json 과 이 파일이 똑같은지 검사한다.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Record<string, string[]>} */
export const CSP = {
  'default-src': ["'self'"],
  // three.js · React는 번들(self). 목소리 엔진(onnxruntime) wasm·모듈만 CDN 고정 버전에서
  'script-src': ["'self'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/'],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
  'img-src': ["'self'", 'data:', 'blob:'],
  'media-src': ["'self'", 'data:', 'blob:'],
  'worker-src': ["'self'", 'blob:'],
  'connect-src': [
    "'self'",
    'blob:', // 3D 모델 텍스처(GLTFLoader)를 메모리 안에서 읽음
    'data:',
    'https://our-car-alive.vercel.app', // GitHub Pages에서 쓰는 AI 중계 서버
    'https://generativelanguage.googleapis.com',
    'wss://generativelanguage.googleapis.com',
    'https://api.open-meteo.com',
    'https://api.bigdatacloud.net',
    'https://cdn.jsdelivr.net',
    'https://huggingface.co',
    'https://*.huggingface.co',
    'https://*.hf.co',
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-src': ["'none'"],
  'manifest-src': ["'self'"],
};

/** <meta>로는 쓸 수 없는 지시어 (응답 헤더 전용) */
export const HEADER_ONLY = {
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
};

export function cspString(mode = 'header') {
  const all = mode === 'header' ? { ...CSP, ...HEADER_ONLY } : CSP;
  return Object.entries(all).map(([k, v]) => [k, ...v].join(' ')).join('; ');
}

/** 모든 페이지 응답에 붙는 보안 헤더 */
export const HEADERS = {
  'Content-Security-Policy': cspString('header'),
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
};
