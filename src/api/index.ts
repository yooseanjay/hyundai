import { HyundaiApiSource } from './hyundaiClient';
import { MockVehicleSource } from './mockVehicle';
import type { VehicleDataSource } from './types';

// VITE_DATA_SOURCE=hyundai 이고 Client ID가 들어 있을 때만 실제 API 사용, 아니면 데모(시뮬레이터)
// 주소 끝에 ?demo 를 붙이면 키가 있어도 시연용 데모 모드로 강제 (공모전 시연·캡처용)
const forceDemo = new URLSearchParams(location.search).has('demo');
// 배포된 정적 사이트(build)에는 로그인 서버가 없으므로 항상 데모. 실제 차 연결은 개발 서버(npm run dev)에서만.
const useHyundai = import.meta.env.DEV && !forceDemo && import.meta.env.VITE_DATA_SOURCE === 'hyundai' && !!import.meta.env.VITE_HYUNDAI_CLIENT_ID;

export const dataSource: VehicleDataSource = useHyundai ? new HyundaiApiSource() : new MockVehicleSource();

export const simulator = dataSource instanceof MockVehicleSource ? dataSource : null;

export * from './types';
