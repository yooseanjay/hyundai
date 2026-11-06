// 보안 1단계 · 비밀값 유출 검사: 저장소에 올라가는 모든 파일에서 키·토큰 모양을 찾는다
//   node scripts/scan-secrets.mjs   (CI와 커밋 전에 실행, 하나라도 나오면 실패)
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const RULES = [
  ['Google API 키', /AIza[0-9A-Za-z_-]{35}/],
  ['OpenAI 키', /\bsk-[A-Za-z0-9_-]{32,}/],
  ['Anthropic 키', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['GitHub 토큰', /\bgh[pousr]_[A-Za-z0-9]{36}\b/],
  ['AWS 액세스 키', /\bAKIA[0-9A-Z]{16}\b/],
  ['개인 키', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['Slack 토큰', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['.env 비밀값', /^(?:GEMINI_API_KEY|HYUNDAI_CLIENT_SECRET|TYPECAST_API_KEY|SESSION_SECRET)=\S{8,}/m],
];
const FORBIDDEN_FILES = [/(^|\/)\.env(\.local|\.production)?$/, /\.hyundai-token\.json$/, /\.pem$/, /id_rsa/];
const SKIP = /\.(png|jpe?g|webp|glb|gif|ico|woff2?|onnx|bin|mp3|wav)$/i;

const files = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = [];
for (const f of files) {
  if (FORBIDDEN_FILES.some((re) => re.test(f))) { problems.push(`${f}: 올리면 안 되는 파일`); continue; }
  if (SKIP.test(f)) continue;
  let text;
  try { if (statSync(f).size > 2_000_000) continue; text = readFileSync(f, 'utf8'); } catch { continue; }
  for (const [name, re] of RULES) if (re.test(text)) problems.push(`${f}: ${name}로 보이는 값`);
}
if (problems.length) {
  console.error('비밀값 의심:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`비밀값 검사 통과 (${files.length}개 파일)`);
