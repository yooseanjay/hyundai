// 가짜 차의 차량 SDK 전체(19개 도메인) — 개발 서버 ?fakecar 에서만
//
// 안드로이드 VehicleHub.kt 와 같은 메시지로 대답함:
//   vehicle-schema → 도메인 · 함수 · 매개변수 (함수 이름은 공개 API 레퍼런스 그대로: vehicleApi.json)
//   vehicle-call   → 값 / 'sent' / 'subscribed', 범위를 벗어난 제어는 'sent' 뒤에 실패가 한 번 더 (실제 SDK의 onFailed 처럼)
//   vehicle-event  → 구독한 값이 바뀌면 (제어 · 주행 시뮬레이션)
//
// ⚠️ 매개변수 모양(영역 · 값 타입)은 추측임. 실제 차에서는 앱이 SDK에서 진짜 모양을 읽어 옴.

import api from './vehicleApi.json';
import type { MethodSchema, ParamSchema, MethodKind } from './vehicle';

type Send = (m: unknown) => void;

const AREAS: Record<string, string[]> = {
  Door: ['ROW_1_LEFT', 'ROW_1_RIGHT', 'ROW_2_LEFT', 'ROW_2_RIGHT', 'TRUNK'],
  Window: ['ROW_1_LEFT', 'ROW_1_RIGHT', 'ROW_2_LEFT', 'ROW_2_RIGHT'],
  Seat: ['ROW_1_LEFT', 'ROW_1_RIGHT', 'ROW_2_LEFT', 'ROW_2_RIGHT'],
};
/** 영역(자리)을 받는 함수 */
const hasArea = (domain: string, key: string) =>
  !!AREAS[domain] && !/^(GloveBox|SmartGlassConfig|WindowBlind)/.test(key)
  || (domain === 'HVAC' && /^HvacTemperature$|^HvacFanSpeed$/.test(key));
const areasOf = (domain: string) => AREAS[domain] ?? ['ROW_1_LEFT', 'ROW_1_RIGHT'];

const ENUMS: [RegExp, string[]][] = [
  [/HvacFanDirection/, ['FACE', 'FLOOR', 'FACE_FLOOR', 'DEFROST_FLOOR']],
  [/TemperatureDisplayUnit/, ['CELSIUS', 'FAHRENHEIT']],
  [/TurnSignal/, ['NONE', 'LEFT', 'RIGHT', 'HAZARD']],
  [/^Wiper/, ['OFF', 'AUTO', 'LOW', 'HIGH', 'MIST']],
  [/DrivingMode/, ['ECO', 'NORMAL', 'SPORT', 'SNOW']],
  [/BrakePedal/, ['RELEASED', 'PRESSED']],
  [/(BrakeFluid|EngineOil|TransmissionOil)Level/, ['NORMAL', 'LOW']],
  [/CruiseControl$/, ['OFF', 'STANDBY', 'ACTIVE']],
  [/^SmartGlass$/, ['TRANSPARENT', 'OPAQUE']],
  [/^Door$|^Window$/, ['CLOSED', 'VENT', 'OPEN']],
];

/** 함수 이름 → 상태 이름  (setDoorLock · getDoorLockState · registerDoorLockState → DoorLock) */
export function stateKey(name: string): string {
  return name
    .replace(/^(unregister|register|getCurrent|get|set|move|select|has|check)/, '')
    .replace(/Capabilities$/, '')
    .replace(/(State|Status)$/, '')
    .replace(/(Switch|Position)$/, '');
}

export function kindOf(name: string): MethodKind {
  if (/^check.*Capabilities$/.test(name)) return 'capability';
  if (name.startsWith('unregister')) return 'unregister';
  if (name.startsWith('register')) return 'register';
  if (/^(set|move|select)/.test(name)) return 'set';
  return 'get';
}

function valueParam(key: string, name: string): ParamSchema {
  const e = ENUMS.find(([re]) => re.test(key));
  if (e) return { kind: 'enum', type: key + 'Type', values: e[1] };
  if (name.startsWith('has')) return { kind: 'bool', type: 'boolean' };
  if (/Lock|Power|Open|Auto|^HvacAc$|Dual|Recirculation|Defroster|MaxAc|MaxDefrost|AirCleaner|Heat|Enabled|Occupancy|Buckled|Light$|LowTirePressure|^EvCharge$/.test(key)) return { kind: 'bool', type: 'boolean' };
  if (/Temperature|Efficiency|Economy|Angle$/.test(key)) return { kind: 'float', type: 'float' };
  if (/Info$/.test(key)) return { kind: 'string', type: 'String' };
  return { kind: 'int', type: 'int' };
}

const RANGES: [RegExp, number, number][] = [
  [/HvacSeatTemperature|HvacSeatVentilation/, 0, 3],
  [/Temperature/, 16, 32],
  [/FanSpeed/, 0, 8],
  [/ChargePercentLimit/, 50, 100],
  [/Volume/, 0, 10],
  [/ChargeCurrentDrawLimit/, 6, 48],
  [/SeatMemory/, 1, 3],
  [/Level$|Brightness$|^Seat|Blind/, 0, 100],
];

const callback: ParamSchema = { kind: 'callback', type: 'Function1' };
const area = (domain: string): ParamSchema => ({ kind: 'enum', type: 'Area', values: areasOf(domain) });

export function fakeSchema(): Record<string, MethodSchema[]> {
  const out: Record<string, MethodSchema[]> = {};
  for (const [domain, names] of Object.entries(api as Record<string, unknown>)) {
    if (domain.startsWith('_') || !Array.isArray(names)) continue;
    out[domain] = (names as string[]).map((name) => {
      const kind = kindOf(name);
      const key = stateKey(name);
      const a = hasArea(domain, key) ? [area(domain)] : [];
      let params: ParamSchema[];
      if (kind === 'capability') params = [callback, callback];
      else if (kind === 'get') params = [...a, callback, callback];
      else if (kind === 'set') params = [...a, valueParam(key, name), { kind: 'callback', type: 'Function1' }];
      else params = [callback];
      return { name, kind, params };
    });
  }
  return out;
}

const SEED: Record<string, unknown> = {
  EvBatteryStateOfCharge: 78, EvChargePercentLimit: 80, EvChargeCurrentDrawLimit: 32, EvCharge: false, EvChargePortOpen: false,
  CurrentEvEfficiency: 5.8, CumulativeEvEfficiency: 5.4, InstantaneousEvEfficiency: 6.1, SinceChargeEvEfficiency: 5.6,
  FuelPercent: 64, CurrentFuelEconomy: 13.2, CumulativeFuelEconomy: 12.8,
  CurrentDistanceDriven: 12873, TripCurrentDrivingDistance: 4.2, TripCurrentDrivingTime: 11,
  HvacPower: true, HvacAc: true, HvacAuto: false, HvacTemperature: 22, HvacTemperatureCurrent: 24, HvacFanSpeed: 3, HvacFanDirection: 'FACE',
  DoorLock: true, Door: 'CLOSED', Window: 'CLOSED', WindowLock: false, GloveBoxLock: true,
  DrivingMode: 'NORMAL', CruiseControl: 'OFF', CruiseControlTargetSpeed: 0,
  TemperatureDisplayUnit: 'CELSIUS', BrakePedal: 'RELEASED', TurnSignal: 'NONE', Wiper: 'OFF',
  VINInfo: 'KMHFAKE00000000001', CRNInfo: '00가0000',
  SteeringWheelAngle: 0, HvacSteeringWheelHeat: false, HvacSideMirrorHeat: false,
  EtcsVoiceGuidanceVolume: 5, AmbientLight: true, AmbientLightBrightness: 60, AmbientLightBrightnessColor: 0x4f7cff,
  LowTirePressure: false, LowWasherFluidWarning: false, SeatBeltNotBuckledWarning: false,
  BrakeFluidLevel: 'NORMAL', EngineOilLevel: 'NORMAL', TransmissionOilLevel: 'NORMAL', TelltalesInfo: '[]',
  SeatOccupancy: true, SeatBeltBuckled: true, SmartGlass: 'TRANSPARENT', SmartGlassLevel: 0,
};

export function createFakeVehicle(send: Send, opts: { control: boolean }) {
  const schema = fakeSchema();
  const state = new Map<string, unknown>();
  const subs = new Map<string, Set<string>>(); // 상태 이름 → 구독한 "도메인.registerX"

  const sKey = (key: string, a?: string) => (a ? `${key}@${a}` : key);
  function read(domain: string, key: string, name: string, a?: string): unknown {
    if (state.has(sKey(key, a))) return state.get(sKey(key, a));
    if (key in SEED) return SEED[key];
    const p = valueParam(key, name);
    return p.kind === 'bool' ? false : p.kind === 'enum' ? p.values![0] : p.kind === 'string' ? '' : 0;
  }
  function emit(key: string, value: unknown, a?: string) {
    for (const from of subs.get(key) ?? []) {
      const [domain, reg] = from.split('.');
      send({ type: 'vehicle-event', domain, from: reg, event: 'onChange', args: a ? [a, value] : [value] });
    }
  }
  /** 바깥(주행 시뮬레이션)에서 값 바꾸기 */
  function set(key: string, value: unknown, a?: string) {
    if (read('', key, key, a) === value) return;
    state.set(sKey(key, a), value);
    emit(key, value, a);
  }

  function call(m: { id: string; domain: string; method: string; args?: unknown[] }) {
    const res = (ok: boolean, value?: unknown, error?: string) => send({ type: 'vehicle-result', id: m.id, ok, value, error });
    const ms = schema[m.domain];
    if (!ms) return res(false, undefined, 'no-domain');
    const def = ms.find((x) => x.name === m.method);
    if (!def) return res(false, undefined, 'no-method');
    const key = stateKey(def.name);
    const args = m.args ?? [];
    const user = def.params.filter((p) => p.kind !== 'callback' && p.kind !== 'listener');
    const a = user[0]?.type === 'Area' ? String(args[0] ?? '') : undefined;
    if (a !== undefined && !user[0].values!.includes(a)) return res(false, undefined, `IllegalArgumentException: area ${a || '(없음)'}`);

    switch (def.kind) {
      case 'capability':
        return res(true, { supported: true, areas: hasArea(m.domain, key) ? areasOf(m.domain) : [] });
      case 'get':
        return res(true, read(m.domain, key, def.name, a));
      case 'register':
        if (!subs.has(key)) subs.set(key, new Set());
        subs.get(key)!.add(`${m.domain}.${def.name}`);
        res(true, 'subscribed');
        // 실제 SDK 처럼 구독하자마자 지금 값 한 번
        return send({ type: 'vehicle-event', domain: m.domain, from: def.name, event: 'onChange', args: [read(m.domain, key, def.name)] });
      case 'unregister':
        subs.get(key)?.delete(`${m.domain}.${def.name.replace(/^unregister/, 'register')}`);
        return res(true, 'unsubscribed');
      case 'set': {
        if (!opts.control) return res(false, undefined, 'control-disabled');
        const p = user[user.length - 1];
        const raw = args[user.length - 1];
        let v: unknown = raw;
        if (p.kind === 'bool') v = raw === true || raw === 'true' || raw === 1;
        else if (p.kind === 'int' || p.kind === 'float') v = Number(raw);
        else if (p.kind === 'enum') v = String(raw);
        // set 은 성공 콜백이 없음 → 일단 '보냄', 차가 거절하면 같은 id로 실패가 한 번 더
        res(true, 'sent');
        const range = RANGES.find(([re]) => re.test(key));
        const bad =
          (typeof v === 'number' && (!Number.isFinite(v) || (range && (v < range[1] || v > range[2])))) ||
          (p.kind === 'enum' && !p.values!.includes(String(v)));
        setTimeout(() => {
          if (bad) return res(false, undefined, `INVALID_ARGUMENT: ${key}=${String(raw)}${range ? ` (${range[1]}~${range[2]})` : ''}`);
          set(key, v, a);
        }, 120);
        return;
      }
    }
  }

  return {
    schema,
    call,
    set,
    get: (key: string, a?: string) => read('', key, key, a),
    /** 웹 → 가짜 차 메시지 하나 처리. 처리했으면 true */
    handle(m: { type: string; [k: string]: unknown }): boolean {
      if (m.type === 'vehicle-schema') { send({ type: 'vehicle-schema', ready: true, control: opts.control, domains: schema }); return true; }
      if (m.type === 'vehicle-call') { call(m as never); return true; }
      return false;
    },
  };
}
