import type { Mood } from '../game/character';
import type { CosmeticId } from '../game/progress';
import type { BodyColor } from '../data/hyundaiModels';
import screen from '../data/screen.json';

interface Props {
  mood: Mood;
  color?: BodyColor;
  cosmetic: CosmeticId;
  driving?: boolean;
  size?: number;
}

// 스크린 얼굴 좌표계 (screen.json 비율과 맞춤)
const VW = 400;
const VH = Math.round((VW * (screen.screen.height * screen.height)) / (screen.screen.width * screen.width));
const EL = 104; // 왼쪽 눈 x
const ER = VW - 104; // 오른쪽 눈 x
const EY = VH * 0.46;
const MY = VH * 0.78;

const GLOW = '#e9fbff';

function RingEye({ x, look = 0 }: { x: number; look?: number }) {
  return (
    <g className="blink" style={{ transformOrigin: `${x}px ${EY}px` }}>
      <circle cx={x} cy={EY} r="40" fill="none" stroke={GLOW} strokeWidth="10" />
      <circle cx={x + look * 6} cy={EY - Math.abs(look) * 2} r="17" fill={GLOW} opacity=".18" />
      <circle cx={x + 8 + look * 6} cy={EY - 10} r="6" fill={GLOW} />
    </g>
  );
}

function Face({ mood, cosmetic }: { mood: Mood; cosmetic: CosmeticId }) {
  const stroke = { stroke: GLOW, strokeWidth: 9, strokeLinecap: 'round' as const, fill: 'none' };
  let eyes: JSX.Element;
  let mouth: JSX.Element;
  let extra: JSX.Element | null = null;

  switch (mood) {
    case 'happy':
      eyes = (
        <g {...stroke}>
          <path d={`M${EL - 30} ${EY + 10} Q${EL} ${EY - 32} ${EL + 30} ${EY + 10}`} />
          <path d={`M${ER - 30} ${EY + 10} Q${ER} ${EY - 32} ${ER + 30} ${EY + 10}`} />
        </g>
      );
      mouth = <path {...stroke} d={`M${VW / 2 - 26} ${MY - 8} Q${VW / 2} ${MY + 16} ${VW / 2 + 26} ${MY - 8}`} />;
      break;
    case 'excited':
      eyes = (
        <g fill={GLOW}>
          {[EL, ER].map((x) => (
            <path key={x} className="twinkle" style={{ transformOrigin: `${x}px ${EY}px` }}
              d={`M${x} ${EY - 36} Q${x + 6} ${EY - 6} ${x + 36} ${EY} Q${x + 6} ${EY + 6} ${x} ${EY + 36} Q${x - 6} ${EY + 6} ${x - 36} ${EY} Q${x - 6} ${EY - 6} ${x} ${EY - 36} Z`} />
          ))}
        </g>
      );
      mouth = <path fill={GLOW} d={`M${VW / 2 - 30} ${MY - 14} Q${VW / 2} ${MY + 26} ${VW / 2 + 30} ${MY - 14} Z`} />;
      break;
    case 'tired':
      eyes = (
        <g>
          {[EL, ER].map((x) => (
            <g key={x}>
              <path d={`M${x - 34} ${EY} A34 34 0 0 0 ${x + 34} ${EY}`} fill="none" stroke={GLOW} strokeWidth="9" strokeLinecap="round" />
              <line x1={x - 38} y1={EY} x2={x + 38} y2={EY} stroke={GLOW} strokeWidth="9" strokeLinecap="round" />
              <circle cx={x + 6} cy={EY + 14} r="6" fill={GLOW} />
            </g>
          ))}
        </g>
      );
      mouth = <path {...stroke} d={`M${VW / 2 - 28} ${MY} q9 -9 18 0 q9 9 18 0 q9 -9 18 0`} />;
      break;
    case 'sleepy':
      eyes = (
        <g {...stroke}>
          <path d={`M${EL - 30} ${EY - 4} Q${EL} ${EY + 22} ${EL + 30} ${EY - 4}`} />
          <path d={`M${ER - 30} ${EY - 4} Q${ER} ${EY + 22} ${ER + 30} ${EY - 4}`} />
        </g>
      );
      mouth = <ellipse cx={VW / 2} cy={MY} rx="9" ry="7" fill="none" stroke={GLOW} strokeWidth="7" />;
      extra = (
        <g className="zzz" fill={GLOW} fontFamily="'Jua', sans-serif" fontWeight="700">
          <text x={VW - 70} y={VH * 0.32} fontSize="34">z</text>
          <text x={VW - 44} y={VH * 0.2} fontSize="24">z</text>
        </g>
      );
      break;
    case 'hungry':
      eyes = (
        <g>
          <RingEye x={EL} look={-1} />
          <RingEye x={ER} look={-1} />
        </g>
      );
      mouth = (
        <g>
          <ellipse cx={VW / 2} cy={MY - 2} rx="16" ry="14" fill="none" stroke={GLOW} strokeWidth="8" />
          <path className="drip" d={`M${VW / 2 + 20} ${MY + 2} q8 14 0 20 q-8 -6 0 -20`} fill="#8fe3ff" />
        </g>
      );
      break;
    case 'sick':
      eyes = (
        <g {...stroke}>
          <path d={`M${EL - 26} ${EY - 22} L${EL + 22} ${EY} L${EL - 26} ${EY + 22}`} />
          <path d={`M${ER + 26} ${EY - 22} L${ER - 22} ${EY} L${ER + 26} ${EY + 22}`} />
        </g>
      );
      mouth = <path {...stroke} d={`M${VW / 2 - 30} ${MY + 6} q10 -14 20 0 q10 14 20 0 q10 -14 20 0`} />;
      extra = <text x={VW - 64} y={VH * 0.34} fontSize="40" fill="#ffb4b4">!</text>;
      break;
    default: // calm
      eyes = (
        <g>
          <RingEye x={EL} />
          <RingEye x={ER} />
        </g>
      );
      mouth = <path {...stroke} d={`M${VW / 2 - 22} ${MY - 6} Q${VW / 2} ${MY + 12} ${VW / 2 + 22} ${MY - 6}`} />;
  }

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" className="face-svg">
      <g className="face-glow">
        {cosmetic === 'sunglasses' && mood !== 'sleepy' ? (
          <g>
            <rect x={EL - 50} y={EY - 30} width="100" height="60" rx="22" fill="#05070a" stroke={GLOW} strokeWidth="6" />
            <rect x={ER - 50} y={EY - 30} width="100" height="60" rx="22" fill="#05070a" stroke={GLOW} strokeWidth="6" />
            <line x1={EL + 50} y1={EY - 12} x2={ER - 50} y2={EY - 12} stroke={GLOW} strokeWidth="6" />
            <path d={`M${EL - 34} ${EY - 16} l18 0`} stroke={GLOW} strokeWidth="5" strokeLinecap="round" opacity=".7" />
            <path d={`M${ER - 34} ${EY - 16} l18 0`} stroke={GLOW} strokeWidth="5" strokeLinecap="round" opacity=".7" />
          </g>
        ) : (
          eyes
        )}
        {mouth}
        {extra}
      </g>
    </svg>
  );
}

const ROOF_ITEMS: Partial<Record<CosmeticId, string>> = {
  crown: '/character/acc-crown.png',
  cap: '/character/acc-cap.png',
  scarf: '/character/acc-ribbon.png',
  flower: '/character/acc-flower.png',
};

export function CarCharacter({ mood, cosmetic, driving, color = 'yellow', size = 280 }: Props) {
  const s = screen.screen;
  const roof = ROOF_ITEMS[cosmetic];
  return (
    <div
      className={`car3d mood-${mood} ${driving ? 'is-driving' : ''}`}
      style={{ width: size, aspectRatio: `${screen.width} / ${screen.height}` }}
      role="img"
      aria-label={`차 캐릭터 (${mood})`}
    >
      <div className="car3d-shadow" />
      <div className="car3d-body">
        <img src={`/character/body-${color}.png`} alt="" draggable={false} />
        <div className="car3d-screen" style={{ left: `${s.left}%`, top: `${s.top}%`, width: `${s.width}%`, height: `${s.height}%` }}>
          <Face mood={mood} cosmetic={cosmetic} />
        </div>
        {roof && <img className={`car3d-roof acc-${cosmetic}`} src={roof} alt="" draggable={false} />}
        {cosmetic === 'wrench' && <img className="car3d-badge" src="/character/acc-medal.png" alt="" draggable={false} />}
      </div>
    </div>
  );
}
