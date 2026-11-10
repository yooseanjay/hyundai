// 개발용: 캐릭터 표정·액세서리 시트 (http://localhost:5173/#moods)
// Figma 캐릭터 페이지로 내보낼 때도 이 화면을 사용한다.
import { CarCharacter } from './components/CarCharacter';
import type { Mood } from './game/character';
import type { CosmeticId } from './game/progress';

const MOODS: [Mood, string][] = [
  ['calm', '기본'], ['happy', '행복'], ['excited', '신남(운전 중)'], ['hungry', '배고픔'],
  ['sick', '아픔(경고)'], ['tired', '피곤'], ['sleepy', '졸림'],
];
const COS: [CosmeticId, string][] = [
  ['sunglasses', '선글라스'], ['flower', '꽃'], ['wrench', '정비왕 배지'], ['scarf', '리본'], ['cap', '드라이버 캡'], ['crown', '왕관'],
];

export default function MoodSheet() {
  return (
    <main className="sheet">
      <h1>표정 (Mood)</h1>
      <div className="sheet-grid">
        {MOODS.map(([m, l]) => (
          <figure key={m} className="sheet-item" data-name={`Mood/${m}`}>
            <CarCharacter mood={m} cosmetic="none" size={220} />
            <figcaption>{l} · {m}</figcaption>
          </figure>
        ))}
      </div>
      <h1>꾸미기 (Cosmetic)</h1>
      <div className="sheet-grid">
        {COS.map(([c, l]) => (
          <figure key={c} className="sheet-item" data-name={`Cosmetic/${c}`}>
            <CarCharacter mood="happy" cosmetic={c} size={220} />
            <figcaption>{l} · {c}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
