import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './theme-mono.css';
import './theme-toss.css';
import './theme-car.css';
import { applyTheme } from './theme';
import { installPleosNative } from './pleos/native';
import { installFakeCar } from './pleos/fakeCar';
import { applyCarScreen } from './carScreen';
import PleosChrome from './components/PleosChrome';
import { bootSecurity } from './security';
import LockScreen from './components/LockScreen';

// 개발 서버에서 ?fakecar: 에뮬레이터 없이 차 앱 통로 흉내 (배포 빌드에서는 import.meta.env.DEV가 false라 빠짐)
if (import.meta.env.DEV && new URLSearchParams(location.search).has('fakecar')) installFakeCar();
installPleosNative(); // Pleos Connect 차 앱 안이면 차량 정보 · 차 음성 통로 열기 (브라우저에선 아무것도 안 함)
applyTheme(); // 첫 화면부터 저장된 밝기로 (깜빡임 방지)
applyCarScreen(); // 넓은 가로 화면이면 Pleos Connect 차 화면처럼

const root = createRoot(document.getElementById('root')!);

// 앱 코드는 금고가 열린 다음에야 불러옴 → 잠긴 상태에서는 기록을 읽는 코드가 아예 실행되지 않음
async function start() {
  // ?vehicle: 차량 SDK 콘솔 (차에서 무엇이 읽히고 · 움직이고 · 구독되는지 확인하는 개발 화면)
  const Root = new URLSearchParams(location.search).has('vehicle')
    ? (await import('./components/VehicleConsole')).default
    : (await import('./App')).default;
  root.render(
    <StrictMode>
      <PleosChrome />
      <Root />
    </StrictMode>,
  );
}

bootSecurity().then((state) => {
  if (state === 'ready') return start();
  root.render(<LockScreen onUnlock={start} />);
});
