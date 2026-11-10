// 차 화면 모드: Pleos Connect 차 안 앱이거나 주소에 ?car 를 붙이면 켜짐 (넓은 가로 화면용 2열 배치, theme-car.css)
import { inPleos } from './api/pleosVehicle';

export const carScreen = inPleos() || new URLSearchParams(location.search).has('car');

/** 지금 2열 배치인지 (차 화면 모드 + 가로로 넓은 화면) */
export const wideCar = () => carScreen && window.matchMedia(WIDE).matches;

export const WIDE = '(min-width: 900px) and (orientation: landscape)';

export function applyCarScreen() {
  if (carScreen) document.documentElement.classList.add('car');
}
