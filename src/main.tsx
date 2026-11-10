import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './theme-mono.css';
import './theme-toss.css';
import './theme-car.css';
import { applyTheme } from './theme';
import { applyCarScreen } from './carScreen';
import PleosChrome from './components/PleosChrome';
import { bootSecurity } from './security';
import LockScreen from './components/LockScreen';

applyTheme(); // 첫 화면부터 저장된 밝기로 (깜빡임 방지)
applyCarScreen(); // 넓은 가로 화면이면 Pleos Connect 차 화면처럼

const root = createRoot(document.getElementById('root')!);

// 앱 코드는 금고가 열린 다음에야 불러옴 → 잠긴 상태에서는 기록을 읽는 코드가 아예 실행되지 않음
async function start() {
  const Root = (await import('./App')).default;
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
