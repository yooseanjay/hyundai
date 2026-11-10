// GitHub Pages 배포: npm run deploy
// 1) 데모 모드로 빌드 (키 없이) → 2) 빌드 결과에 키가 섞이지 않았는지 검사 → 3) gh-pages 브랜치로 올림
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSafe } from './build-safe.mjs';

const REPO = 'hyundai';
const OUT = 'dist-pages';
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });

// 1) 2) 키 없이 빌드 + 키 섞임 검사
buildSafe(OUT);
writeFileSync(join(OUT, '.nojekyll'), ''); // GitHub Pages가 파일을 가공하지 않도록

// 3) gh-pages 브랜치로 강제 푸시 (빌드 결과만 담긴 별도 기록)
const remote = execSync('git remote get-url origin').toString().trim();
const git = (c) => sh(`git ${c}`, { cwd: OUT });
git('init -q -b gh-pages');
git('add -A');
git('-c user.name="hyundai deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "deploy"');
git(`push -q -f ${remote} gh-pages`);
rmSync(join(OUT, '.git'), { recursive: true, force: true });
console.log(`🚀 배포 완료 → https://yooseanjay.github.io/${REPO}/  (반영까지 1~2분)`);
