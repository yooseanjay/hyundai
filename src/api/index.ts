import { HyundaiApiSource } from './hyundaiClient';
import { MockVehicleSource } from './mockVehicle';
import type { VehicleDataSource } from './types';

// VITE_DATA_SOURCE=hyundai 이고 Client ID가 들어 있을 때만 실제 API 사용, 아니면 데모(시뮬레이터)
const useHyundai = import.meta.env.VITE_DATA_SOURCE === 'hyundai' && !!import.meta.env.VITE_HYUNDAI_CLIENT_ID;

export const dataSource: VehicleDataSource = useHyundai ? new HyundaiApiSource() : new MockVehicleSource();

export const simulator = dataSource instanceof MockVehicleSource ? dataSource : null;

export * from './types';
