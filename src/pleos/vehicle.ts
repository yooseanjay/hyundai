// 차량 SDK 전체(19개 도메인)를 웹에서 쓰는 통로 — 안드로이드 쪽은 android/.../VehicleHub.kt
//
//   const schema = await vehicleSchema();                     // 차에 실제로 있는 도메인 · 함수 · 매개변수
//   await callVehicle('EvBattery', 'getEvBatteryStateOfCharge') // 읽기 → 값
//   await callVehicle('HVAC', 'setHvacTemperature', [ 'ROW_1_LEFT', 22 ]) // 제어(개발용 debug 빌드만)
//   await callVehicle('Door', 'registerDoorLockState')         // 구독 → onVehicleEvent 로 변화가 옴
//   onVehicleEvent((e) => console.log(e.domain, e.from, e.args))
//
// 매개변수 중 콜백(성공 · 실패)과 리스너는 안드로이드가 알아서 끼움 → 웹은 값(영역 · 숫자 · on/off)만 넘김.

import { onNative, sendNative, inPleosApp } from './native';

export type ParamKind = 'bool' | 'int' | 'float' | 'string' | 'enum' | 'int[]' | 'callback' | 'listener' | 'unknown';
export interface ParamSchema { kind: ParamKind; type: string; values?: string[]; events?: string[] }
export type MethodKind = 'capability' | 'get' | 'set' | 'register' | 'unregister';
export interface MethodSchema { name: string; kind: MethodKind; params: ParamSchema[] }
export interface VehicleSchema { ready: boolean; control: boolean; domains: Record<string, MethodSchema[]> }
export interface VehicleEvent { domain: string; from: string; event: string; args: unknown[] }

export type VehicleMsg =
  | ({ type: 'vehicle-schema' } & VehicleSchema)
  | { type: 'vehicle-result'; id: string; ok: boolean; value?: unknown; error?: string }
  | ({ type: 'vehicle-event' } & VehicleEvent);

/** 웹이 직접 넘겨야 하는 매개변수 (콜백 · 리스너 제외) */
export const userParams = (m: MethodSchema) => m.params.filter((p) => p.kind !== 'callback' && p.kind !== 'listener');

export class VehicleError extends Error {
  constructor(public code: string, public late = false) { super(code); }
}

interface Pending { resolve: (v: unknown) => void; reject: (e: VehicleError) => void; timer: ReturnType<typeof setTimeout>; onLateError?: (error: string) => void }
const pending = new Map<string, Pending>();
const eventFns = new Set<(e: VehicleEvent) => void>();
const lateErrorFns = new Set<(id: string, error: string) => void>();
const settled = new Map<string, ((error: string) => void) | undefined>();
let schemaWaiters: ((s: VehicleSchema) => void)[] = [];
let schema: VehicleSchema | null = null;
let seq = 0;
let wired = false;

function wire() {
  if (wired) return;
  wired = true;
  onNative((raw) => {
    const m = raw as unknown as VehicleMsg;
    if (m.type === 'vehicle-schema') {
      schema = { ready: m.ready, control: m.control, domains: m.domains ?? {} };
      const ws = schemaWaiters; schemaWaiters = [];
      ws.forEach((f) => f(schema!));
    } else if (m.type === 'vehicle-result') {
      const p = pending.get(m.id);
      if (!p) {
        // 성공 콜백이 없는 set: '보냄' 다음에 차가 거절하면 같은 id로 실패가 한 번 더 옴
        if (!m.ok && settled.has(m.id)) {
          settled.get(m.id)?.(m.error ?? 'failed');
          lateErrorFns.forEach((f) => f(m.id, m.error ?? 'failed'));
        }
        return;
      }
      clearTimeout(p.timer);
      pending.delete(m.id);
      settled.set(m.id, p.onLateError);
      if (settled.size > 200) settled.delete(settled.keys().next().value as string);
      if (m.ok) p.resolve(m.value);
      else p.reject(new VehicleError(m.error ?? 'failed'));
    } else if (m.type === 'vehicle-event') {
      const e: VehicleEvent = { domain: m.domain, from: m.from, event: m.event, args: m.args ?? [] };
      eventFns.forEach((f) => f(e));
    }
  });
}

/** 차에 있는 도메인 · 함수 목록. 차 앱 밖이면 null */
export function vehicleSchema(refresh = false, timeoutMs = 4000): Promise<VehicleSchema | null> {
  if (!inPleosApp()) return Promise.resolve(null);
  wire();
  if (schema && !refresh) return Promise.resolve(schema);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(schema), timeoutMs);
    schemaWaiters.push((s) => { clearTimeout(t); resolve(s); });
    sendNative({ type: 'vehicle-schema' });
  });
}

export interface CallOptions { timeoutMs?: number; /** 'sent' 로 끝난 제어를 차가 나중에 거절하면 */ onLateError?: (error: string) => void }

/** SDK 함수 하나 부르기. 값 · 'sent'(제어) · 'subscribed' 로 끝나고, 실패면 VehicleError(code) */
export function callVehicle(domain: string, method: string, args: unknown[] = [], opts: CallOptions = {}): Promise<unknown> {
  if (!inPleosApp()) return Promise.reject(new VehicleError('not-in-car'));
  wire();
  const id = `v${++seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new VehicleError('timeout')); }, opts.timeoutMs ?? 5000);
    pending.set(id, { resolve, reject, timer, onLateError: opts.onLateError });
    sendNative({ type: 'vehicle-call', id, domain, method, args });
  });
}

/** register… 로 구독한 값이 바뀔 때마다 */
export function onVehicleEvent(fn: (e: VehicleEvent) => void) { wire(); eventFns.add(fn); return () => { eventFns.delete(fn); }; }

/** 제어를 '보냄'으로 끝낸 뒤 차가 거절한 경우 */
export function onVehicleLateError(fn: (id: string, error: string) => void) { wire(); lateErrorFns.add(fn); return () => { lateErrorFns.delete(fn); }; }

/** 한 도메인에서 값 없이 부를 수 있는 읽기를 모두 → { 함수: 값 | Error } */
export async function readDomain(domain: string, s: VehicleSchema): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const gets = (s.domains[domain] ?? []).filter((m) => m.kind === 'get' && userParams(m).length === 0);
  await Promise.all(gets.map(async (m) => {
    try { out[m.name] = await callVehicle(domain, m.name); } catch (e) { out[m.name] = e; }
  }));
  return out;
}

/** 테스트용: 상태 비우기 */
export function _resetVehicle() {
  pending.forEach((p) => clearTimeout(p.timer));
  pending.clear(); settled.clear(); schema = null; schemaWaiters = []; seq = 0;
}
