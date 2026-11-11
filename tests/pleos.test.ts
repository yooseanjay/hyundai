// Pleos Connect 차 앱 다리: 차량 SDK 값 → 앱 상태, 차 음성 인식 · 읽어 주기를 브라우저 음성 API 모양으로
import { describe, expect, it, vi } from 'vitest';

async function load(withPort = true) {
  vi.resetModules();
  const sent: any[] = [];
  const port: any = { postMessage: (m: string) => sent.push(JSON.parse(m)), onmessage: null };
  const g = globalThis as any;
  g.window = g;
  delete g.SpeechRecognition; delete g.webkitSpeechRecognition; delete g.speechSynthesis;
  g.document = { documentElement: { classList: { add() {} } } };
  if (withPort) g.pleosNative = port; else delete g.pleosNative;
  const m = await import('../src/pleos/native');
  return { m, sent, port, from: (o: unknown) => port.onmessage?.({ data: JSON.stringify(o) }) };
}

describe('Pleos 차 앱 다리', () => {
  it('브라우저에선 아무것도 하지 않음', async () => {
    const { m } = await load(false);
    expect(m.installPleosNative()).toBe(false);
    expect((globalThis as any).SpeechRecognition).toBeUndefined();
  });

  it('차량 SDK 값 → 배터리 · 주행 가능 거리 · 누적 거리 · 충전', async () => {
    const { m, sent, from } = await load();
    expect(m.installPleosNative()).toBe(true);
    expect(sent[0]).toEqual({ type: 'hello' });
    from({ type: 'vehicle', values: {
      'EvBattery.getCurrentEvBatteryStateOfCharge': 81.5,
      'EvBattery.getCurrentRangeRemaining': 352000, // m
      'Odometer.getCurrentOdometer': 12870,
      'EvBattery.getCurrentEvChargingState': true,
      'HVAC.getCurrentHvacFanSpeed': 3,
    } });
    const s = m.snapshotFromVehicle(m.vehicleNow(), true);
    expect(s).toMatchObject({ fuelLevelPct: 81.5, dteKm: 352, odometerKm: 12870, charging: true });
    // 내연기관은 연료 값
    expect(m.snapshotFromVehicle({ 'Fuel.getCurrentFuelLevel': 40 }, false).fuelLevelPct).toBe(40);
    expect(m.snapshotFromVehicle({ 'HVAC.getCurrentTemperature': 22 }, true)).toEqual({});
  });

  it('차 음성 인식이 브라우저 음성 인식처럼 동작', async () => {
    const { m, sent, from } = await load();
    m.installPleosNative();
    const SR = (globalThis as any).SpeechRecognition;
    expect(SR).toBe(m.NativeRecognition);
    const rec = new SR();
    rec.interimResults = true;
    const got: string[] = [];
    let ended = 0;
    rec.onresult = (e: any) => got.push(`${e.results[e.results.length - 1][0].transcript}:${e.results[e.results.length - 1].isFinal}`);
    rec.onend = () => ended++;
    rec.start();
    expect(sent.at(-1)).toMatchObject({ type: 'listen', lang: 'ko-KR', partial: true });
    from({ type: 'stt', event: 'start' });
    from({ type: 'stt', event: 'partial', text: '현대' });
    from({ type: 'stt', event: 'final', text: '현대 날씨 어때' });
    expect(got).toEqual(['현대:false', '현대 날씨 어때:true']);
    expect(ended).toBe(1); // continuous가 아니면 한 문장 뒤 끝
    // 권한 거부 같은 오류도 그대로 전달
    const rec2 = new SR();
    let err = '';
    rec2.onerror = (e: any) => { err = e.error; };
    rec2.start();
    from({ type: 'stt', event: 'error', error: 'not-allowed' });
    expect(err).toBe('not-allowed');
  });

  it('읽어 주기: speechSynthesis 자리에 차 음성', async () => {
    const { m, sent, from } = await load();
    m.installPleosNative();
    const g = globalThis as any;
    const u = new g.SpeechSynthesisUtterance('안녕하세요');
    const ev: string[] = [];
    u.onstart = () => ev.push('start');
    u.onend = () => ev.push('end');
    g.speechSynthesis.speak(u);
    const msg = sent.at(-1);
    expect(msg).toMatchObject({ type: 'speak', text: '안녕하세요' });
    expect(g.speechSynthesis.speaking).toBe(true);
    from({ type: 'tts', event: 'start', id: msg.id });
    from({ type: 'tts', event: 'end', id: msg.id });
    expect(ev).toEqual(['start', 'end']);
    expect(g.speechSynthesis.speaking).toBe(false);
  });
});
