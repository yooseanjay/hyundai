// 개발용 가짜 차: 에뮬레이터 · 실제 차 없이 차 앱(안드로이드) 통로를 흉내 냄
//  - 개발 서버에서 주소에 ?fakecar 를 붙이면 켜짐 (배포 빌드에는 들어가지 않음)
//  - 안드로이드 앱(NativeBridge.kt)과 같은 메시지를 보냄: caps → vehicle 값 몇 초마다
//  - 콘솔에서 값 바꿔 보기: fakeCar.set({ 'EvBattery.getCurrentEvBatteryStateOfCharge': 12 })

/* eslint-disable @typescript-eslint/no-explicit-any */
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
      }
    },
  };
  let timer: ReturnType<typeof setInterval> | undefined;

  const reply = (m: unknown) => setTimeout(() => port.onmessage?.({ data: JSON.stringify(m) }), 0);
  const push = (changed: Values = values) => reply({ type: 'vehicle', values: { ...changed } });

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
  }

  w.pleosNative = port;
  w.fakeCar = {
    values,
    set(v: Values) { Object.assign(values, v); push(v); },
    stop() { if (timer) clearInterval(timer); timer = undefined; },
  };
  console.info('[fakecar] 가짜 차 연결됨 — fakeCar.set({...})로 값 바꿔 보기');
}
