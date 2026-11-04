import { HyundaiApiSource } from './hyundaiClient';
import { MockVehicleSource } from './mockVehicle';
import type { VehicleDataSource } from './types';

export const dataSource: VehicleDataSource =
  import.meta.env.VITE_DATA_SOURCE === 'hyundai' ? new HyundaiApiSource() : new MockVehicleSource();

export const simulator = dataSource instanceof MockVehicleSource ? dataSource : null;

export * from './types';
