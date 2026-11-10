// 주행 조작 줄: ◀ 좌회전/차로 · 후진 · 우회전/차로 ▶ + 차로 · 신호 · 막힘 표시
// (3D 화면 위에 글자를 띄우지 않고 아래 줄에)
import type { DriveControl, DriveStatus } from './Car3D';

interface Props {
  st: DriveStatus | null;
  ctl: { current: DriveControl | null };
  roadName: string;
}

const LIGHT = { green: '🟢 초록불', yellow: '🟡 노란불', red: '🔴 빨간불' } as const;

export function DriveControls({ st, ctl, roadName }: Props) {
  const j = st?.junction;
  const turnMode = !!j && j.canTurn && !st?.reverse;
  const lane = st ? (st.lane >= 1 ? `${st.lane}차로` : '반대 차로') : '';
  let msg = st?.last ?? '';
  if (!msg && st?.stop === 'obstacle') msg = '🚧 앞이 막혔어요 · 옆 차로로 비켜 가요';
  else if (!msg && (st?.stop === 'red' || st?.stop === 'yellow')) msg = `${LIGHT[st.stop]} · 정지선에서 기다려요`;
  else if (!msg && j) msg = `${j.dist}m 앞 교차로 · ${LIGHT[j.light]}${j.turn ? (j.turn < 0 ? ' · 좌회전' : ' · 우회전') : ''}`;
  else if (!msg && st) msg = `${roadName} · 왕복 ${st.lanes * 2}차로 · ${lane}`;

  return (
    <div className="drive-ctl">
      <button className={`btn ctl ${turnMode && j?.turn === -1 ? 'on' : ''}`} onClick={() => ctl.current?.steer(-1)} disabled={!st || (turnMode && !j?.canLeft)}
        aria-label={turnMode ? '좌회전' : '왼쪽 차로로'}>
        <span aria-hidden>{turnMode ? '↰' : '◀'}</span>{turnMode ? '좌회전' : '차로'}
      </button>
      <div className={`ctl-msg ${st?.stop ? 'warn' : ''}`} role="status" aria-live="polite">
        <span className="lane-dots" aria-hidden>
          {st && Array.from({ length: st.lanes * 2 }, (_, i) => {
            const idx = i - st.lanes + 1; // 왼쪽(반대편) → 오른쪽
            const mine = idx === st.lane || (st.lane <= 0 && idx === st.lane);
            return <i key={i} className={`${idx <= 0 ? 'opp' : ''} ${mine ? 'me' : ''}`} />;
          })}
        </span>
        <span className="txt">{msg}</span>
      </div>
      <button className={`btn ctl ${st?.reverse ? 'on rev' : ''}`} onClick={() => ctl.current?.setReverse(!st?.reverse)} disabled={!st} aria-pressed={!!st?.reverse}>
        <span aria-hidden>R</span>{st?.reverse ? '후진 중' : '후진'}
      </button>
      <button className={`btn ctl ${turnMode && j?.turn === 1 ? 'on' : ''}`} onClick={() => ctl.current?.steer(1)} disabled={!st}
        aria-label={turnMode ? '우회전' : '오른쪽 차로로'}>
        {turnMode ? '우회전' : '차로'}<span aria-hidden>{turnMode ? '↱' : '▶'}</span>
      </button>
    </div>
  );
}
