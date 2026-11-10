import { useEffect, useState } from 'react';
import { Bluetooth, Fan, House, LayoutGrid, Music, Navigation, Phone, Signal, Volume2, Wifi } from 'lucide-react';

/**
 * 차 화면 미리보기용 시스템 테두리 (Pleos Connect의 위 상태 바 · 아래 시스템 바 자리).
 * 앱이 그리는 부분이 아니라 앱 창이 어디에 놓이는지 보여 주는 그림이라 누를 수 없음.
 * html.pleos 일 때만 보임 (theme-car.css).
 */
export default function PleosChrome() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  return (
    <>
      <div className="pf-status" aria-hidden>
        <b>{time}</b>
        <span className="pf-note">Pleos Connect 화면 미리보기</span>
        <span className="pf-icons"><Bluetooth size={20} /><Wifi size={20} /><Signal size={20} /></span>
      </div>
      <div className="pf-gnb" aria-hidden>
        <span className="pf-clim"><b>22.0°</b><Fan size={24} /></span>
        <span className="pf-apps">
          <House size={30} /><Navigation size={30} /><Music size={30} /><Phone size={30} /><LayoutGrid size={30} />
        </span>
        <span className="pf-clim"><Volume2 size={24} /><b>22.0°</b></span>
      </div>
    </>
  );
}
