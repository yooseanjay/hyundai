// 3단계: AI로 나가기 전 개인정보 가리기
import { describe, expect, it } from 'vitest';
import { luhn, redact } from '../src/security/redact';

describe('개인정보 가리기', () => {
  const cases: [string, string, string][] = [
    ['주민번호', '내 주민번호는 900101-1234567 이야', '[주민번호]'],
    ['휴대폰', '010-1234-5678로 연락줘', '[전화번호]'],
    ['국제 번호', '+82 10 1234 5678', '[전화번호]'],
    ['이메일', 'me.car+1@example.co.kr 로 보내', '[이메일]'],
    ['카드', '카드 4111 1111 1111 1111', '[카드번호]'],
    ['차량번호', '내 차는 12가 3456 이야', '[차량번호]'],
    ['지역 차량번호', '서울12가3456', '[차량번호]'],
    ['차대번호', 'VIN KMHL14JA5PA123456', '[차대번호]'],
    ['상세주소', '세종대로 110번지', '[상세주소]'],
  ];
  for (const [name, input, mask] of cases) {
    it(name, () => {
      const r = redact(input);
      expect(r.text).toContain(mask);
      expect(r.found.length).toBeGreaterThan(0);
    });
  }

  it('정밀 좌표는 약 1km 단위로 흐리게', () => {
    expect(redact('위치 37.566535, 126.977969').text).toBe('위치 37.56, 126.97');
  });

  it('평범한 대화·날짜·거리는 그대로', () => {
    const t = '2026-11-07에 12,901km 달렸고 배터리 57%야. 오늘 날씨 좋다!';
    expect(redact(t).text).toBe(t);
  });

  it('Luhn 검사를 통과한 숫자만 카드로 봄', () => {
    expect(luhn('4111111111111111')).toBe(true);
    expect(luhn('4111111111111112')).toBe(false);
  });
});
