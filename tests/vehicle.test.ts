// 차량 SDK 전체 통로(src/pleos/vehicle.ts) ↔ 가짜 차(fakeVehicle.ts): 안드로이드 VehicleHub.kt 와 같은 메시지로 왕복
import { describe, expect, it, vi } from 'vitest';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function load(control = true) {
  vi.resetModules();
  const g = globalThis as any;
  g.window = g;
  g.document = { documentElement: { classList: { add() {} } } };
  const { createFakeVehicle } = await import('../src/pleos/fakeVehicle');
  const port: any = { onmessage: null };
  const reply = (m: unknown) => setTimeout(() => port.onmessage?.({ data: JSON.stringify(m) }), 0);
  const sdk = createFakeVehicle(reply, { control });
  port.postMessage = (raw: string) => { const m = JSON.parse(raw); if (m.type === 'hello') reply({ type: 'caps', vehicle: true, stt: false, tts: false, engine: 'fake', app: 'test' }); else sdk.handle(m); };
  g.pleosNative = port;
  const native = await import('../src/pleos/native');
  native.installPleosNative();
  const v = await import('../src/pleos/vehicle');
  return { v, sdk };
}

describe('차량 SDK 전체 통로', () => {
  it('19개 도메인 함수 목록을 받음', async () => {
    const { v } = await load();
    const s = await v.vehicleSchema();
    expect(s?.ready).toBe(true);
    expect(Object.keys(s!.domains)).toHaveLength(19);
    const setTemp = s!.domains.HVAC.find((m) => m.name === 'setHvacTemperature')!;
    expect(setTemp.kind).toBe('set');
    expect(v.userParams(setTemp).map((p) => p.kind)).toEqual(['enum', 'float']); // 자리 + 온도, 콜백은 앱이 끼움
  });

  it('읽기 → 값, 제어 → sent 뒤 상태가 바뀌고 구독에 이벤트', async () => {
    const { v } = await load();
    expect(await v.callVehicle('EvBattery', 'getEvBatteryStateOfCharge')).toBe(78);
    const events: any[] = [];
    v.onVehicleEvent((e) => events.push(e));
    expect(await v.callVehicle('Door', 'registerDoorLockState')).toBe('subscribed');
    expect(await v.callVehicle('Door', 'setDoorLock', ['ROW_1_LEFT', false])).toBe('sent');
    await sleep(200);
    expect(await v.callVehicle('Door', 'getDoorLockState', ['ROW_1_LEFT'])).toBe(false);
    expect(events.map((e) => e.args)).toEqual([[true], ['ROW_1_LEFT', false]]); // 구독 직후 지금 값 + 바뀐 값
    expect(await v.callVehicle('Door', 'unregisterDoorLockState')).toBe('unsubscribed');
  });

  it('범위를 벗어난 제어는 sent 뒤에 차가 거절', async () => {
    const { v } = await load();
    const late = vi.fn();
    expect(await v.callVehicle('HVAC', 'setHvacTemperature', ['ROW_1_LEFT', 40], { onLateError: late })).toBe('sent');
    await sleep(200);
    expect(late).toHaveBeenCalledWith(expect.stringContaining('INVALID_ARGUMENT'));
    expect(await v.callVehicle('HVAC', 'getHvacTemperature', ['ROW_1_LEFT'])).toBe(22);
  });

  it('제출용(release)처럼 제어가 꺼져 있으면 control-disabled', async () => {
    const { v } = await load(false);
    expect((await v.vehicleSchema())?.control).toBe(false);
    await expect(v.callVehicle('Window', 'setWindowPosition', ['ROW_1_LEFT', 50])).rejects.toThrow('control-disabled');
  });

  it('없는 함수 · 잘못된 자리는 오류', async () => {
    const { v } = await load();
    await expect(v.callVehicle('Door', 'flyAway')).rejects.toThrow('no-method');
    await expect(v.callVehicle('Seat', 'moveSeatForeAft', ['ROOF', 10])).rejects.toThrow('area');
  });
});
