import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './theme-mono.css';
import { bootSecurity } from './security';
import LockScreen from './components/LockScreen';

const root = createRoot(document.getElementById('root')!);

// 앱 코드는 금고가 열린 다음에야 불러옴 → 잠긴 상태에서는 기록을 읽는 코드가 아예 실행되지 않음
async function start() {
  const Root = location.hash === '#moods' ? (await import('./MoodSheet')).default : (await import('./App')).default;
  root.render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}

bootSecurity().then((state) => {
  if (state === 'ready') return start();
  root.render(<LockScreen onUnlock={start} />);
});
