// ─────────────────────────────────────────────────────────────────────────────
// 보안 3단계 · 개인정보 가리기 (AI로 나가기 전 마지막 관문)
//
//  대화·차 상태 요약을 Gemini로 보내기 전에, 사용자가 말하거나 차에서 온 개인정보를 지운다.
//  데이터 최소화 원칙(개인정보 보호법 제3조, GDPR Art.5(1)(c)): AI 대답에 필요 없는 식별자는 보내지 않는다.
//   - 주민등록번호·외국인등록번호, 휴대폰·전화번호, 이메일, 카드번호(Luhn 검사), 계좌번호
//   - 차대번호(VIN 17자리), 자동차 번호판(12가 3456 / 서울12가3456)
//   - 정밀 좌표 → 소수 2자리(약 1km)로 흐리게, 상세 주소(번지·동·호) 제거
// ─────────────────────────────────────────────────────────────────────────────

export type PiiKind = 'rrn' | 'phone' | 'email' | 'card' | 'account' | 'vin' | 'plate' | 'address' | 'coord';

const MASK: Record<PiiKind, string> = {
  rrn: '[주민번호]',
  phone: '[전화번호]',
  email: '[이메일]',
  card: '[카드번호]',
  account: '[계좌번호]',
  vin: '[차대번호]',
  plate: '[차량번호]',
  address: '[상세주소]',
  coord: '',
};

/** 카드번호 진위 검사 (Luhn). 아무 숫자 덩어리나 지우지 않도록 */
export function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

const RULES: [PiiKind, RegExp, ((m: string) => boolean)?][] = [
  ['email', /[\w.+-]+@[\w-]+(\.[\w-]+)+/g],
  ['rrn', /\b\d{6}\s?-\s?[1-8]\d{6}\b/g],
  ['card', /\b(?:\d[ -]?){13,19}\b/g, (m) => luhn(m.replace(/\D/g, ''))],
  ['phone', /(?:\+82[-\s]?0?1\d|\b0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g],
  ['account', /\b\d{2,6}-\d{2,6}-\d{2,8}\b/g, (m) => m.replace(/\D/g, '').length >= 10], // 날짜(2026-11-07)는 제외
  ['vin', /\b[A-HJ-NPR-Z0-9]{17}\b/g, (m) => /\d/.test(m) && /[A-Z]/.test(m)],
  ['plate', /(?:[가-힣]{2}\s?)?\b\d{2,3}\s?[가-힣]\s?\d{4}\b/g],
  ['address', /\d{1,5}(?:-\d{1,5})?\s?(?:번지|호|동\s?\d{1,4}호)/g],
];

/** 위도·경도 정밀도 낮추기: 37.566535 → 37.57 (약 1km 격자) */
export function coarsenCoords(text: string): string {
  return text.replace(/(-?\d{1,3}\.\d{2})\d{2,}/g, '$1');
}

export function redact(text: string): { text: string; found: PiiKind[] } {
  const found = new Set<PiiKind>();
  let out = text;
  for (const [kind, re, ok] of RULES) {
    out = out.replace(re, (m) => {
      if (ok && !ok(m)) return m;
      found.add(kind);
      return MASK[kind];
    });
  }
  const coarse = coarsenCoords(out);
  if (coarse !== out) found.add('coord');
  return { text: coarse, found: [...found] };
}

export const redactText = (text: string) => redact(text).text;
