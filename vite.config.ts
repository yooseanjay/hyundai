import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { hyundaiAuth } from './server/hyundaiAuth';

export default defineConfig(({ mode }) => {
  // '' 접두사: VITE_가 아닌 HYUNDAI_CLIENT_SECRET도 읽는다 (서버에서만 사용, 브라우저로 안 나감)
  const env = loadEnv(mode, process.cwd(), '');
  return {
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
    ],
    server: { port: 5173 },
  };
});
