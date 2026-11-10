import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { hyundaiAuth } from './server/hyundaiAuth';
import { geminiProxy } from './server/geminiProxy';
import { cspString } from './security/policy.mjs';

export default defineConfig(({ mode }) => {
  // '' 접두사: VITE_가 아닌 HYUNDAI_CLIENT_SECRET도 읽는다 (서버에서만 사용, 브라우저로 안 나감)
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // 배포용 하위 경로 (예: BASE_PATH=/our-car-alive/). 개발 서버는 '/'
    base: process.env.BASE_PATH || '/',
    plugins: [
      react(),
      // 보안 1단계: 정적 배포(GitHub Pages)는 응답 헤더를 못 바꾸므로 같은 CSP를 <meta>로 심음 (빌드에서만)
      {
        name: 'csp-meta',
        apply: 'build',
        transformIndexHtml: (html: string) =>
          html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${cspString('meta')}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />`),
      },
      hyundaiAuth({
        base: env.VITE_HYUNDAI_API_BASE || 'https://dev.kr-ccapi.hyundai.com',
        clientId: env.VITE_HYUNDAI_CLIENT_ID || '',
        clientSecret: env.HYUNDAI_CLIENT_SECRET || '',
        redirectUri: env.VITE_HYUNDAI_REDIRECT_URI || 'http://localhost:5173/callback',
        authorizePath: env.HYUNDAI_AUTHORIZE_PATH || '/api/v1/user/oauth2/authorize',
        tokenPath: env.HYUNDAI_TOKEN_PATH || '/api/v1/user/oauth2/token',
        root: process.cwd(),
      }),
      // 대화 AI + 사람 같은 목소리 (Google Gemini 무료 키, .env.local의 GEMINI_API_KEY)
      geminiProxy(env.GEMINI_API_KEY || ''),
    ],
    server: { port: 5173, host: true }, // host: 같은 Wi-Fi의 휴대폰에서 http://<PC IP>:5173 접속 허용
  };
});
