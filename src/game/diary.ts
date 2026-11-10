// 하차 시 '오늘의 일기' 생성기.
// 현재는 규칙 기반 템플릿이며, 추후 LLM(예: Claude API)을 백엔드에서 호출해 더 자연스러운 문장으로 바꿀 수 있다.
import { WARNING_LABELS, type Trip, type VehicleSnapshot, type WarningKey } from '../api/types';

export interface DiaryEntry {
  id: string;
  date: string;
  title: string;
  body: string;
  stamp: string; // 이모지 도장
  distanceKm: number;
  place: string;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function writeDiary(opts: {
  nickname: string;
  trip: Trip;
  snapshot: VehicleSnapshot;
  newWarnings: WarningKey[];
}): DiaryEntry {
  const { nickname, trip, snapshot, newWarnings } = opts;
  const place = snapshot.parking?.label ?? '어딘가';
  const hour = new Date(trip.startedAt).getHours();
  const when = hour < 6 ? '새벽' : hour < 11 ? '아침' : hour < 17 ? '낮' : hour < 21 ? '저녁' : '밤';
  const lines: string[] = [];

  lines.push(
    pick([
      `${when}에 주인이랑 ${trip.distanceKm}km를 함께 달렸다.`,
      `오늘 ${when}, 주인을 태우고 ${trip.distanceKm}km를 다녀왔다.`,
      `${trip.durationMin}분 동안 ${trip.distanceKm}km. 오늘의 모험 기록!`,
    ]),
  );

  if (trip.hardBrakes >= 3) lines.push(pick(['급브레이크가 몇 번 있어서 깜짝 놀랐다. 다음엔 살살 부탁해요 🥺', '오늘은 조금 롤러코스터 같았다… 심장이 두근두근.']));
  else if (trip.hardBrakes === 0 && trip.avgSpeedKmh < 45) lines.push(pick(['주인이 부드럽게 운전해 줘서 기분이 몽글몽글했다.', '흔들림 없이 편안한 드라이브였다. 오늘 주인 운전 100점!']));
  else lines.push(pick(['평균 ' + trip.avgSpeedKmh + 'km/h로 신나게 달렸다.', '창밖 풍경이 휙휙 지나가서 재밌었다.']));

  if (newWarnings.length) lines.push(`그런데 ${newWarnings.map((k) => WARNING_LABELS[k]).join(', ')} 쪽이 좀 이상하다… 주인이 알아채 줬으면 좋겠다.`);
  if (snapshot.fuelLevelPct < 20) lines.push(`배가 너무 고프다. 남은 힘으로 ${snapshot.dteKm}km 정도 갈 수 있을 것 같다. 🍙`);
  else if (snapshot.fuelLevelPct > 70) lines.push('아직 힘이 넘친다! 내일도 문제없다 💪');

  lines.push(`지금은 ${place}에서 쉬는 중.`);

  const stamp = newWarnings.length ? '🤕' : trip.hardBrakes >= 3 ? '😵' : trip.distanceKm > 80 ? '🏔️' : '😊';
  const title = newWarnings.length ? '조금 아팠던 날' : trip.distanceKm > 80 ? '먼 길 다녀온 날' : trip.hardBrakes >= 3 ? '두근두근한 날' : '평범하고 좋은 날';

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: trip.endedAt,
    title,
    body: `${nickname}의 일기\n\n` + lines.join(' '),
    stamp,
    distanceKm: trip.distanceKm,
    place,
  };
}
