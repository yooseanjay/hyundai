import { useState } from 'react';
import { getTheme, setTheme, type ThemeMode } from '../theme';

const NEXT: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' };
const LABEL: Record<ThemeMode, string> = { auto: '자동', light: '라이트', dark: '다크' };

function Icon({ mode }: { mode: ThemeMode }) {
  const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (mode === 'light') return <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
  if (mode === 'dark') return <svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></svg>;
}

/** 화면 밝기 바꾸기: 자동 → 라이트 → 다크 */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getTheme);
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`화면 밝기: ${LABEL[mode]} (눌러서 ${LABEL[NEXT[mode]]}로 바꾸기)`}
      onClick={() => { const n = NEXT[mode]; setTheme(n); setMode(n); }}
    >
      <Icon mode={mode} />
      <span>{LABEL[mode]}</span>
    </button>
  );
}
