// 개발용 가짜 차: 에뮬레이터 · 실제 차 없이 차 앱(안드로이드) 통로를 흉내 냄
//  - 개발 서버에서 주소에 ?fakecar 를 붙이면 켜짐 (배포 빌드에는 들어가지 않음)
//  - 안드로이드 앱(NativeBridge.kt)과 같은 메시지를 보냄: caps → vehicle 값 몇 초마다
//  - 콘솔에서 값 바꿔 보기: fakeCar.set({ 'EvBattery.getCurrentEvBatteryStateOfCharge': 12 })
//  - 차량 SDK 전체(19개 도메인) 읽기 · 제어 · 구독도 흉내 냄(fakeVehicle.ts). ?readonly 를 붙이면 제출용 release 처럼 제어 막힘

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFakeVehicle } from './fakeVehicle';

type Values = Record<string, unknown>;

export function installFakeCar() {
  const w = window as any;
  if (w.pleosNative) return;

  const values: Values = {
    'EvBattery.getCurrentEvBatteryStateOfCharge': 78,
    'EvBattery.getCurrentEvBatteryRangeRemaining': 352000, // m (SDK가 m로 줄 때)
    'EvBattery.getCurrentEvBatteryIsCharging': false,
    'EvBattery.getCurrentEvBatteryChargePortConnected': false,
    'Fuel.getCurrentFuelLevel': 64,
    'Odometer.getCurrentOdometer': 12873,
  };

  const port = {
    onmessage: null as ((e: { data: string }) => void) | null,
    postMessage(raw: string) {
      let m: any;
      try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'hello') {
        reply({ type: 'caps', vehicle: true, stt: false, tts: false, engine: 'fake', app: 'fakecar' });
        push();
        timer ??= setInterval(drive, 3000);
        return;
      }
      sdk.handle(m);
    },
  };
  let timer: ReturnType<typeof setInterval> | undefined;

  const reply = (m: unknown) => setTimeout(() => port.onmessage?.({ data: JSON.stringify(m) }), 0);
  const push = (changed: Values = values) => reply({ type: 'vehicle', values: { ...changed } });
  const sdk = createFakeVehicle(reply, { control: !new URLSearchParams(location.search).has('readonly') });

  /** 3초마다 조금씩 달림: 배터리 · 거리 줄고 누적 거리 늘어남 */
  function drive() {
    const soc = Number(values['EvBattery.getCurrentEvBatteryStateOfCharge']);
    if (values['EvBattery.getCurrentEvBatteryIsCharging'] === true) {
      values['EvBattery.getCurrentEvBatteryStateOfCharge'] = Math.min(100, soc + 1);
    } else {
      values['EvBattery.getCurrentEvBatteryStateOfCharge'] = Math.max(0, soc - 0.2);
      values['Odometer.getCurrentOdometer'] = Number(values['Odometer.getCurrentOdometer']) + 1;
    }
    values['EvBattery.getCurrentEvBatteryRangeRemaining'] =
      Math.round(Number(values['EvBattery.getCurrentEvBatteryStateOfCharge']) * 4500);
    push();
    // SDK 전체 쪽도 같이: 구독한 화면에 변화가 감
    const socNow = Math.round(Number(values['EvBattery.getCurrentEvBatteryStateOfCharge']) * 10) / 10;
    sdk.set('EvBatteryStateOfCharge', socNow);
    sdk.set('CurrentDistanceDriven', Number(values['Odometer.getCurrentOdometer']));
    sdk.set('SteeringWheelAngle', Math.round((Math.random() - 0.5) * 60));
    sdk.set('HvacTemperatureCurrent', Math.round((Number(sdk.get('HvacTemperatureCurrent')) + (Number(sdk.get('HvacTemperature', 'ROW_1_LEFT')) - Number(sdk.get('HvacTemperatureCurrent'))) * 0.3) * 10) / 10);
  }

  w.pleosNative = port;
  w.fakeCar = {
    values,
    set(v: Values) { Object.assign(values, v); push(v); },
    /** SDK 전체 상태 바꾸기: fakeCar.sdk.set('DoorLock', false, 'ROW_1_LEFT') */
    sdk,
    stop() { if (timer) clearInterval(timer); timer = undefined; },
  };
  console.info('[fakecar] 가짜 차 연결됨 — fakeCar.set({...})로 값 바꿔 보기');
}
