// security/policy.mjs → vercel.json 의 보안 헤더를 다시 씀 (정책은 한 곳에서만 고친다)
//   node scripts/sync-headers.mjs        : 갱신
//   node scripts/sync-headers.mjs --check : 다르면 실패 (CI)
import fs from 'node:fs';
import { HEADERS } from '../security/policy.mjs';

const file = new URL('../vercel.json', import.meta.url);
const v = JSON.parse(fs.readFileSync(file, 'utf8'));
const want = Object.entries(HEADERS).map(([key, value]) => ({ key, value }));
const rule = v.headers.find((h) => h.source === '/(.*)');
const same = JSON.stringify(rule.headers) === JSON.stringify(want);
if (process.argv.includes('--check')) {
  if (!same) { console.error('vercel.json 보안 헤더가 security/policy.mjs와 달라요. node scripts/sync-headers.mjs 실행'); process.exit(1); }
  console.log('보안 헤더 일치');
} else {
  rule.headers = want;
  fs.writeFileSync(file, JSON.stringify(v, null, 2) + '\n');
  console.log(same ? '변경 없음' : 'vercel.json 갱신');
}
