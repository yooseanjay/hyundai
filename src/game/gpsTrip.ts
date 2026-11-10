// 휴대폰 GPS로 실제 주행 측정: 속도 · 거리 · 최고/평균 속도 · 급정거
// - 브라우저 Geolocation API (https 또는 localhost에서만 동작, 사용자 위치 권한 필요)
// - 위치 정보는 이 기기 안에서만 계산하고 어디에도 보내지 않는다.

export interface GpsUpdate {
  speed: number; // 현재 속도 km/h
  km: number; // 이번 주행 거리
  maxSpeed: number;
  avgSpeed: number; // 움직인 시간 기준 평균
  hardBrakes: number;
  braking: boolean; // 방금 급정거
  accuracy: number | null; // 위치 정확도 (m)
  elapsedMin: number;
  fix: boolean; // GPS 신호를 잡았는지
}

export const gpsSupported = () => typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
/** 두 좌표 사이 거리 (m) */
function haversine(a: GeolocationCoordinates, b: GeolocationCoordinates) {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 급정거 기준: 시속 20km 이상에서 1초에 시속 10km 넘게 줄어듦 (약 0.3g) */
const BRAKE_KMH_PER_S = 10;

export function startGpsTrip(onUpdate: (u: GpsUpdate) => void, onError: (msg: string) => void): () => void {
  const t0 = Date.now();
  let last: GeolocationPosition | null = null;
  let speed = 0;
  let km = 0;
  let maxSpeed = 0;
  let movingMs = 0;
  let hardBrakes = 0;
  let lastBrakeAt = 0;
  let brakingUntil = 0;
  let accuracy: number | null = null;
  let fix = false;

  const emit = () =>
    onUpdate({
      speed, km, maxSpeed, hardBrakes, accuracy, fix,
      avgSpeed: movingMs > 0 ? km / (movingMs / 3600000) : 0,
      braking: Date.now() < brakingUntil,
      elapsedMin: (Date.now() - t0) / 60000,
    });

  const onPos = (p: GeolocationPosition) => {
    const c = p.coords;
    accuracy = Math.round(c.accuracy);
    fix = c.accuracy <= 60;
    if (!last) {
      last = p;
      return emit();
    }
    const dt = (p.timestamp - last.timestamp) / 1000;
    if (dt <= 0) return;
    const d = haversine(last.coords, c);
    const derived = (d / dt) * 3.6;
    // 기기가 알려주는 속도(도플러)가 더 정확하면 그걸 쓰고, 없으면 이동 거리로 계산
    let raw = c.speed != null && c.speed >= 0 ? c.speed * 3.6 : derived;
    if (raw > 250) return; // 위치 튐 무시
    if (raw < 3) raw = 0; // 멈춰 있을 때 흔들림 제거
    const prev = speed;
    speed = speed * 0.4 + raw * 0.6;
    if (speed < 1) speed = 0;

    // 정확도가 괜찮고 실제로 움직였을 때만 거리 누적
    if (fix && d > Math.max(3, c.accuracy * 0.4)) {
      km += d / 1000;
      last = p;
    } else if (dt > 10) {
      last = p; // 오래 멈춰 있으면 기준점 갱신
    }
    if (speed > 0) movingMs += dt * 1000;
    maxSpeed = Math.max(maxSpeed, speed);

    const decel = (prev - speed) / dt;
    if (prev > 20 && decel >= BRAKE_KMH_PER_S && Date.now() - lastBrakeAt > 3000) {
      hardBrakes += 1;
      lastBrakeAt = Date.now();
      brakingUntil = Date.now() + 1200;
    }
    emit();
  };

  const onErr = (e: GeolocationPositionError) => {
    onError(
      e.code === e.PERMISSION_DENIED ? '위치 권한이 꺼져 있어요. 주소창의 자물쇠 아이콘에서 위치를 허용해 주세요.'
      : e.code === e.POSITION_UNAVAILABLE ? 'GPS 신호를 못 잡았어요. 하늘이 보이는 곳에서 다시 시도해 주세요.'
      : 'GPS 응답이 늦어요. 잠시 기다리는 중…',
    );
  };

  const id = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  const tick = window.setInterval(emit, 1000); // 신호가 없어도 경과 시간·급정거 표시 갱신

  // 주행 중 화면이 꺼지지 않게 (지원하는 브라우저만)
  let lock: { release(): Promise<void> } | null = null;
  (navigator as any).wakeLock?.request?.('screen').then((l: any) => { lock = l; }).catch(() => {});

  return () => {
    navigator.geolocation.clearWatch(id);
    window.clearInterval(tick);
    void lock?.release().catch(() => {});
  };
}
