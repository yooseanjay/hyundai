// Pleos Connect 차 안 앱용 웹 빌드: npm run build:pleos
// 결과는 pleos/app/src/main/assets/web/ 에 들어가고, 안드로이드 앱이 https://yooseanjay.github.io/hyundai/ 주소로 띄운다.
import { buildSafe } from './build-safe.mjs';

buildSafe('pleos/app/src/main/assets/web');
console.log('🚗 Pleos 앱에 넣을 웹 빌드 완료 → pleos/ 폴더를 Android Studio로 열어 실행하세요.');
