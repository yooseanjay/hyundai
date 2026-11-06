// 번호판 화면 얼굴 (3D 텍스처용 캔버스 그리기). 기분 7종 + 깜빡임 + 선글라스
import type { Mood } from '../game/character';
import type { CosmeticId } from '../game/progress';

export function drawFace(cv: HTMLCanvasElement, mood: Mood, cosmetic: CosmeticId, blink = false) {
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  g.fillStyle = '#050608';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 16;

  const EL = W * 0.3;
  const ER = W * 0.7;
  const EY = H * 0.42;
  const MX = W / 2;
  const MY = H * 0.76;
  const path = (f: () => void) => { g.beginPath(); f(); g.stroke(); };

  const closedEyes = () => [EL, ER].forEach((x) => path(() => { g.moveTo(x - 32, EY + 4); g.lineTo(x + 32, EY + 4); }));
  const ring = (x: number, look = 0) => {
    path(() => g.arc(x, EY, 34, 0, Math.PI * 2));
    g.beginPath();
    g.arc(x + 8 + look * 8, EY - 8, 9, 0, Math.PI * 2);
    g.fill();
  };

  // 선글라스 (졸릴 때 빼고)
  if (cosmetic === 'sunglasses' && mood !== 'sleepy') {
    g.lineWidth = 10;
    [EL, ER].forEach((x) => { g.beginPath(); g.roundRect(x - 52, EY - 30, 104, 58, 22); g.stroke(); });
    path(() => { g.moveTo(EL + 52, EY - 12); g.lineTo(ER - 52, EY - 12); });
    g.lineWidth = 14;
  } else if (blink && ['happy', 'calm', 'hungry', 'excited'].includes(mood)) {
    closedEyes();
  } else {
    switch (mood) {
      case 'happy':
        [EL, ER].forEach((x) => path(() => g.arc(x, EY + 16, 30, Math.PI * 1.1, Math.PI * 1.9)));
        break;
      case 'excited':
        [EL, ER].forEach((x) => {
          g.beginPath();
          const r = 36;
          g.moveTo(x, EY - r);
          g.quadraticCurveTo(x + 6, EY - 6, x + r, EY);
          g.quadraticCurveTo(x + 6, EY + 6, x, EY + r);
          g.quadraticCurveTo(x - 6, EY + 6, x - r, EY);
          g.quadraticCurveTo(x - 6, EY - 6, x, EY - r);
          g.fill();
        });
        break;
      case 'hungry':
        ring(EL, -1);
        ring(ER, -1);
        break;
      case 'sick':
        path(() => { g.moveTo(EL - 26, EY - 22); g.lineTo(EL + 20, EY); g.lineTo(EL - 26, EY + 22); });
        path(() => { g.moveTo(ER + 26, EY - 22); g.lineTo(ER - 20, EY); g.lineTo(ER + 26, EY + 22); });
        break;
      case 'tired':
        [EL, ER].forEach((x) => {
          path(() => { g.moveTo(x - 34, EY); g.lineTo(x + 34, EY); });
          path(() => g.arc(x, EY, 30, 0.15, Math.PI - 0.15));
        });
        break;
      case 'sleepy':
        [EL, ER].forEach((x) => path(() => g.arc(x, EY - 18, 30, Math.PI * 0.15, Math.PI * 0.85)));
        g.font = 'bold 40px sans-serif';
        g.fillText('z', W - 70, H * 0.36);
        g.font = 'bold 28px sans-serif';
        g.fillText('z', W - 44, H * 0.2);
        break;
      default:
        ring(EL);
        ring(ER);
    }
  }

  // 입
  switch (mood) {
    case 'happy':
      path(() => g.arc(MX, MY - 22, 26, Math.PI * 0.2, Math.PI * 0.8));
      break;
    case 'excited':
      g.beginPath();
      g.moveTo(MX - 30, MY - 14);
      g.quadraticCurveTo(MX, MY + 30, MX + 30, MY - 14);
      g.closePath();
      g.fill();
      break;
    case 'hungry':
      path(() => g.ellipse(MX, MY - 2, 16, 13, 0, 0, Math.PI * 2));
      g.fillStyle = '#9fe6ff';
      g.beginPath();
      g.moveTo(MX + 26, MY - 4);
      g.quadraticCurveTo(MX + 36, MY + 12, MX + 26, MY + 18);
      g.quadraticCurveTo(MX + 16, MY + 12, MX + 26, MY - 4);
      g.fill();
      break;
    case 'sick':
    case 'tired':
      path(() => { g.moveTo(MX - 34, MY); for (let i = 0; i < 4; i++) g.quadraticCurveTo(MX - 25 + i * 17, MY + (i % 2 ? 12 : -12), MX - 17 + i * 17, MY); });
      break;
    case 'sleepy':
      path(() => g.ellipse(MX, MY, 9, 8, 0, 0, Math.PI * 2));
      break;
    default:
      path(() => g.arc(MX, MY - 18, 22, Math.PI * 0.2, Math.PI * 0.8));
  }
}
