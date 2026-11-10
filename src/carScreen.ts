// Pleos Connect 차 화면 모드
// 넓은 가로 화면(컴퓨터 · 태블릿 가로)에서는 차 안 화면처럼: 위 상태 바 + 아래 시스템 바(GNB) + 가운데 앱 창.
// ?pleos 로 강제로 켜고, ?phone 으로 끔. 휴대폰 배치는 그대로.

const q = new URLSearchParams(location.search);
const WIDE = window.matchMedia('(min-width: 1000px) and (orientation: landscape)');

/** 지금 차 화면 배치인지 */
export const wideCar = () => !q.has('phone') && (q.has('pleos') || WIDE.matches);

export function applyCarScreen() {
  const set = () => document.documentElement.classList.toggle('pleos', wideCar());
  set();
  WIDE.addEventListener('change', set);
}
