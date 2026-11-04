import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { hyundaiAuth } from './server/hyundaiAuth';
import { typecastTts } from './server/typecastTts';

export default defineConfig(({ mode }) => {
  // '' 접두사: VITE_가 아닌 HYUNDAI_CLIENT_SECRET도 읽는다 (서버에서만 사용, 브라우저로 안 나감)
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // 배포용 하위 경로 (예: BASE_PATH=/our-car-alive/). 개발 서버는 '/'
    base: process.env.BASE_PATH || '/',
    plugins: [
      react(),
      hyundaiAuth({
        base: env.VITE_HYUNDAI_API_BASE || 'https://dev.kr-ccapi.hyundai.com',
        clientId: env.VITE_HYUNDAI_CLIENT_ID || '',
        clientSecret: env.HYUNDAI_CLIENT_SECRET || '',
        redirectUri: env.VITE_HYUNDAI_REDIRECT_URI || 'http://localhost:5173/callback',
        authorizePath: env.HYUNDAI_AUTHORIZE_PATH || '/api/v1/user/oauth2/authorize',
        tokenPath: env.HYUNDAI_TOKEN_PATH || '/api/v1/user/oauth2/token',
        root: process.cwd(),
      }),
      // 아이 목소리 (Typecast 무료 플랜). 키가 없으면 브라우저 목소리 사용
      typecastTts({
        apiKey: env.TYPECAST_API_KEY || '',
        voiceId: env.TYPECAST_VOICE_ID || undefined,
        dailyLimit: Number(env.TTS_DAILY_LIMIT || 200),
        root: process.cwd(),
      }),
    ],
    server: { port: 5173, host: true }, // host: 같은 Wi-Fi의 휴대폰에서 http://<PC IP>:5173 접속 허용
  };
});
