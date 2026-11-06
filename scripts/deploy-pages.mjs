// GitHub Pages 배포: npm run deploy
// 1) 데모 모드로 빌드 (키 없이) → 2) 빌드 결과에 키가 섞이지 않았는지 검사 → 3) gh-pages 브랜치로 올림
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'our-car-alive';
const OUT = 'dist-pages';
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });

// 1) 빌드 — 이미 있는 환경변수가 .env.local보다 우선하므로 키를 비워서 빌드
rmSync(OUT, { recursive: true, force: true });
sh(`npx vite build --outDir ${OUT}`, {
  env: { ...process.env, BASE_PATH: `/${REPO}/`, VITE_DATA_SOURCE: 'mock', VITE_HYUNDAI_CLIENT_ID: '', HYUNDAI_CLIENT_SECRET: '', GEMINI_API_KEY: '', TYPECAST_API_KEY: '' },
});

// 2) 안전 검사: .env.local의 실제 키 값이 빌드 결과에 있으면 중단
const secrets = existsSync('.env.local')
  ? readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^(VITE_HYUNDAI_CLIENT_ID|HYUNDAI_CLIENT_SECRET|GEMINI_API_KEY|TYPECAST_API_KEY)=/.test(l)).map((l) => l.split('=').slice(1).join('=').trim()).filter((v) => v.length >= 6)
  : [];
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const file of walk(OUT)) {
  if (!/\.(js|html|css|json|map)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (secrets.some((s) => text.includes(s))) {
    console.error(`❌ 키 값이 ${file}에 포함되어 배포를 중단합니다.`);
    process.exit(1);
  }
}
writeFileSync(join(OUT, '.nojekyll'), ''); // GitHub Pages가 파일을 가공하지 않도록
console.log('✅ 키 미포함 확인');

// 3) gh-pages 브랜치로 강제 푸시 (빌드 결과만 담긴 별도 기록)
const remote = execSync('git remote get-url origin').toString().trim();
const git = (c) => sh(`git ${c}`, { cwd: OUT });
git('init -q -b gh-pages');
git('add -A');
git('-c user.name="our-car-alive deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "deploy"');
git(`push -q -f ${remote} gh-pages`);
rmSync(join(OUT, '.git'), { recursive: true, force: true });
console.log(`🚀 배포 완료 → https://<GitHub 아이디>.github.io/${REPO}/  (반영까지 1~2분)`);
