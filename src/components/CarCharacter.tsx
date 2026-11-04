import type { Mood } from '../game/character';
import type { CosmeticId } from '../game/progress';

interface Props {
  color: string;
  mood: Mood;
  cosmetic: CosmeticId;
  driving?: boolean;
  size?: number;
}

function Eyes({ mood }: { mood: Mood }) {
  const L = 92, R = 148, Y = 78;
  switch (mood) {
    case 'happy':
      return (
        <g stroke="#1b2333" strokeWidth="5" fill="none" strokeLinecap="round">
          <path d={`M${L - 10} ${Y + 3} Q${L} ${Y - 9} ${L + 10} ${Y + 3}`} />
          <path d={`M${R - 10} ${Y + 3} Q${R} ${Y - 9} ${R + 10} ${Y + 3}`} />
        </g>
      );
    case 'excited':
      return (
        <g fill="#ffcf3f" stroke="#1b2333" strokeWidth="2">
          {[L, R].map((x) => (
            <path key={x} d={`M${x} ${Y - 12} L${x + 4} ${Y - 3} L${x + 13} ${Y - 2} L${x + 6} ${Y + 4} L${x + 8} ${Y + 13} L${x} ${Y + 8} L${x - 8} ${Y + 13} L${x - 6} ${Y + 4} L${x - 13} ${Y - 2} L${x - 4} ${Y - 3} Z`} />
          ))}
        </g>
      );
    case 'sleepy':
    case 'tired':
      return (
        <g stroke="#1b2333" strokeWidth="5" strokeLinecap="round">
          <line x1={L - 10} y1={Y} x2={L + 10} y2={Y} />
          <line x1={R - 10} y1={Y} x2={R + 10} y2={Y} />
        </g>
      );
    case 'sick':
      return (
        <g>
          <g stroke="#1b2333" strokeWidth="4" strokeLinecap="round">
            <path d={`M${L - 9} ${Y - 6} L${L + 9} ${Y + 6} M${L + 9} ${Y - 6} L${L - 9} ${Y + 6}`} />
          </g>
          <circle cx={R} cy={Y} r="9" fill="#1b2333" />
          <circle cx={R + 3} cy={Y - 3} r="3" fill="#fff" />
        </g>
      );
    default:
      return (
        <g>
          {[L, R].map((x) => (
            <g key={x}>
              <circle cx={x} cy={Y} r="10" fill="#1b2333" />
              <circle cx={x + 3} cy={Y - 4} r="3.5" fill="#fff" />
            </g>
          ))}
        </g>
      );
  }
}

function Mouth({ mood }: { mood: Mood }) {
  const cx = 120, y = 134;
  if (mood === 'hungry')
    return (
      <g>
        <ellipse cx={cx} cy={y} rx="12" ry="10" fill="#1b2333" />
        <path d={`M${cx + 9} ${y + 6} q4 10 0 14 q-4 -4 0 -14`} fill="#8fd3ff" />
      </g>
    );
  if (mood === 'sick' || mood === 'tired') return <path d={`M${cx - 14} ${y + 4} Q${cx} ${y - 6} ${cx + 14} ${y + 4}`} stroke="#1b2333" strokeWidth="5" fill="none" strokeLinecap="round" />;
  if (mood === 'sleepy') return <ellipse cx={cx} cy={y} rx="6" ry="4" fill="#1b2333" />;
  if (mood === 'excited') return <path d={`M${cx - 18} ${y - 6} Q${cx} ${y + 22} ${cx + 18} ${y - 6} Z`} fill="#1b2333" />;
  return <path d={`M${cx - 16} ${y - 4} Q${cx} ${y + 12} ${cx + 16} ${y - 4}`} stroke="#1b2333" strokeWidth="5" fill="none" strokeLinecap="round" />;
}

function Accessory({ id }: { id: CosmeticId }) {
  switch (id) {
    case 'sunglasses':
      return (
        <g>
          <rect x="74" y="66" width="38" height="24" rx="8" fill="#1b2333" />
          <rect x="128" y="66" width="38" height="24" rx="8" fill="#1b2333" />
          <rect x="110" y="72" width="20" height="5" fill="#1b2333" />
          <rect x="80" y="70" width="12" height="5" rx="2" fill="#fff" opacity=".5" />
        </g>
      );
    case 'scarf':
      return (
        <g>
          <path d="M44 112 Q120 128 196 112 L196 124 Q120 140 44 124 Z" fill="#e2524b" />
          <path d="M170 120 L182 158 L166 156 L160 124 Z" fill="#c63d37" />
          <g stroke="#fff" strokeWidth="3" opacity=".6">
            <line x1="70" y1="118" x2="70" y2="128" />
            <line x1="100" y1="122" x2="100" y2="132" />
            <line x1="140" y1="122" x2="140" y2="132" />
          </g>
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d="M78 34 Q120 2 162 34 Z" fill="#2b6cf6" />
          <path d="M150 32 Q186 30 196 40 L156 40 Z" fill="#1d4fc0" />
          <circle cx="120" cy="14" r="5" fill="#1d4fc0" />
        </g>
      );
    case 'crown':
      return <path d="M88 36 L94 6 L108 24 L120 0 L132 24 L146 6 L152 36 Z" fill="#ffcf3f" stroke="#c99a12" strokeWidth="3" strokeLinejoin="round" />;
    case 'flower':
      return (
        <g transform="translate(176 46)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-10" rx="7" ry="11" fill="#ff9ec4" transform={`rotate(${a})`} />
          ))}
          <circle r="6" fill="#ffd84d" />
        </g>
      );
    case 'wrench':
      return (
        <g transform="translate(60 150)">
          <circle r="15" fill="#ffcf3f" stroke="#c99a12" strokeWidth="3" />
          <text y="6" textAnchor="middle" fontSize="16">🔧</text>
        </g>
      );
    default:
      return null;
  }
}

export function CarCharacter({ color, mood, cosmetic, driving, size = 240 }: Props) {
  return (
    <svg className={`car ${driving ? 'is-driving' : ''} mood-${mood}`} viewBox="0 0 240 200" width={size} height={(size * 200) / 240} role="img" aria-label={`차 캐릭터 (${mood})`}>
      <ellipse cx="120" cy="190" rx="92" ry="8" fill="#000" opacity=".12" className="car-shadow" />
      <g className="car-body">
        {/* 지붕 + 창 */}
        <path d="M62 104 L78 46 Q84 34 98 34 L142 34 Q156 34 162 46 L178 104 Z" fill={color} />
        <path d="M74 98 L86 54 Q90 44 100 44 L140 44 Q150 44 154 54 L166 98 Z" fill="#e8f6ff" />
        <path d="M92 50 L104 50 L88 92 L80 92 Z" fill="#fff" opacity=".7" />
        {/* 몸통 */}
        <rect x="26" y="96" width="188" height="72" rx="30" fill={color} />
        <rect x="26" y="96" width="188" height="72" rx="30" fill="url(#shine)" />
        {/* 헤드램프 */}
        <rect x="38" y="112" width="30" height="12" rx="6" fill="#fff8d6" stroke="#1b2333" strokeOpacity=".15" />
        <rect x="172" y="112" width="30" height="12" rx="6" fill="#fff8d6" stroke="#1b2333" strokeOpacity=".15" />
        {/* 볼터치 */}
        <ellipse cx="62" cy="140" rx="12" ry="7" fill="#ff8fa3" opacity={mood === 'sick' ? 0.15 : 0.55} />
        <ellipse cx="178" cy="140" rx="12" ry="7" fill="#ff8fa3" opacity={mood === 'sick' ? 0.15 : 0.55} />
        <Eyes mood={mood} />
        <Mouth mood={mood} />
        {mood === 'sick' && <rect x="150" y="104" width="32" height="10" rx="4" fill="#f6e2c0" transform="rotate(-18 166 109)" />}
        {mood === 'sleepy' && (
          <text x="180" y="40" fontSize="22" fill="#1b2333" className="zzz">z<tspan fontSize="16" dy="-10">z</tspan></text>
        )}
        <Accessory id={cosmetic} />
      </g>
      {/* 바퀴 */}
      {[70, 170].map((x) => (
        <g key={x} className="wheel" style={{ transformOrigin: `${x}px 168px` }}>
          <circle cx={x} cy="168" r="20" fill="#1b2333" />
          <circle cx={x} cy="168" r="9" fill="#c8d1dc" />
          <rect x={x - 2} y="150" width="4" height="10" fill="#c8d1dc" />
        </g>
      ))}
      <defs>
        <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
