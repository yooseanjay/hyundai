// 키 없이 데모용으로 빌드하고, .env.local 의 실제 키 값이 결과물에 섞이지 않았는지 검사
// (GitHub Pages 배포에서 씀)
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const BASE_PATH = '/hyundai/';
const KEYS = /^(VITE_HYUNDAI_CLIENT_ID|HYUNDAI_CLIENT_SECRET|GEMINI_API_KEY|TYPECAST_API_KEY|SPOTIFY_CLIENT_SECRET|SESSION_SECRET)=/;

export function buildSafe(outDir) {
  // 이미 있는 환경변수가 .env.local보다 우선하므로 키를 비워서 빌드
  rmSync(outDir, { recursive: true, force: true });
  execSync(`npx vite build --outDir "${outDir}" --emptyOutDir`, {
    stdio: 'inherit',
    env: { ...process.env, BASE_PATH, VITE_DATA_SOURCE: 'mock', VITE_HYUNDAI_CLIENT_ID: '', HYUNDAI_CLIENT_SECRET: '', GEMINI_API_KEY: '', TYPECAST_API_KEY: '', VITE_GEMINI_SERVER: 'https://our-car-alive.vercel.app' },
  });

  const secrets = existsSync('.env.local')
    ? readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => KEYS.test(l)).map((l) => l.split('=').slice(1).join('=').trim()).filter((v) => v.length >= 6)
    : [];
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const file of walk(outDir)) {
    if (!/\.(js|html|css|json|map)$/.test(file)) continue;
    if (secrets.some((s) => readFileSync(file, 'utf8').includes(s))) {
      rmSync(outDir, { recursive: true, force: true });
      console.error(`❌ 키 값이 ${file}에 포함되어 중단합니다.`);
      process.exit(1);
    }
  }
  console.log('✅ 키 미포함 확인');
}
