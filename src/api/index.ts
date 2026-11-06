import { HyundaiApiSource } from './hyundaiClient';
import { MockVehicleSource } from './mockVehicle';
import type { VehicleDataSource } from './types';

// VITE_DATA_SOURCE=hyundai 이고 Client ID가 들어 있을 때만 실제 API 사용, 아니면 데모(시뮬레이터)
// 주소 끝에 ?demo 를 붙이면 키가 있어도 시연용 데모 모드로 강제 (공모전 시연·캡처용)
const forceDemo = new URLSearchParams(location.search).has('demo');
// 실제 차 연결: 개발 서버(npm run dev) 또는 Vercel 배포(api/auth.ts · api/car.ts, 소유자 전용 세션)
// GitHub Pages 같은 정적 사이트는 서버가 없으므로 VITE_DATA_SOURCE를 비워 두어 항상 데모로 동작
const useHyundai = !forceDemo && import.meta.env.VITE_DATA_SOURCE === 'hyundai' && !!import.meta.env.VITE_HYUNDAI_CLIENT_ID;

export const dataSource: VehicleDataSource = useHyundai ? new HyundaiApiSource() : new MockVehicleSource();

export const simulator = dataSource instanceof MockVehicleSource ? dataSource : null;

export * from './types';
