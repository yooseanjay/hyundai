// 화면 밝기: 'auto'(휴대폰 설정 따라감) · 'light' · 'dark'. 기기에만 저장
export type ThemeMode = 'auto' | 'light' | 'dark';
const KEY = 'oca.theme';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function getTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* 저장소를 못 쓰면 자동 */ }
  return 'auto';
}

function isDark(mode: ThemeMode) {
  return mode === 'dark' || (mode === 'auto' && !!media?.matches);
}

export function applyTheme(mode: ThemeMode = getTheme()) {
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  root.style.colorScheme = isDark(mode) ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark(mode) ? '#17171C' : '#F2F4F6');
}

export function setTheme(mode: ThemeMode) {
  try {
    if (mode === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  applyTheme(mode);
}

// 자동 모드일 때 휴대폰 설정이 바뀌면 따라 바뀜
media?.addEventListener?.('change', () => { if (getTheme() === 'auto') applyTheme('auto'); });
