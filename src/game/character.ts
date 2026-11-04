// 차량 데이터 → 캐릭터 상태 매핑 (서비스의 핵심 규칙)
import { WARNING_LABELS, type Trip, type VehicleSnapshot, type WarningKey } from '../api/types';

export type Mood = 'happy' | 'calm' | 'tired' | 'hungry' | 'sick' | 'excited' | 'sleepy';

export interface CharacterStatus {
  energy: number; // 0~100 : 연료/배터리 → 배고픔
  health: number; // 0~100 : 경고 개수
  fatigue: number; // 0~100 : 오늘 주행량
  mood: Mood;
  line: string; // 캐릭터 한마디
  activeWarnings: WarningKey[];
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function computeStatus(s: VehicleSnapshot, trips: Trip[], driving = false): CharacterStatus {
  const activeWarnings = (Object.keys(s.warnings) as WarningKey[]).filter((k) => s.warnings[k]);
  const energy = Math.round(Math.min(100, Math.max(0, s.fuelLevelPct)));
  const health = Math.max(0, 100 - activeWarnings.length * 22);
  const todayKm = trips.filter((t) => isToday(t.endedAt)).reduce((a, t) => a + t.distanceKm, 0);
  const fatigue = Math.min(100, Math.round(todayKm / 2.5));

  let mood: Mood = 'happy';
  let line = '오늘도 같이 달려요! 🚗';

  if (driving) {
    mood = 'excited';
    line = '부릉부릉~ 바람이 시원해요!';
  } else if (activeWarnings.length > 0) {
    mood = 'sick';
    const w = WARNING_LABELS[activeWarnings[0]];
    line = activeWarnings.length > 1 ? `여기저기 아파요… (${w} 외 ${activeWarnings.length - 1}곳)` : `${w} 쪽이 불편해요… 🥺`;
  } else if (energy < 20) {
    mood = 'hungry';
    line = `배고파요… 🍙 이대로면 ${s.dteKm}km밖에 못 가요`;
  } else if (s.charging) {
    mood = 'calm';
    line = '냠냠, 충전 중이에요 ⚡';
  } else if (fatigue > 70) {
    mood = 'tired';
    line = `오늘 ${todayKm}km나 달렸어요. 좀 쉬고 싶어요 😪`;
  } else if (new Date().getHours() >= 23 || new Date().getHours() < 6) {
    mood = 'sleepy';
    line = '쿨쿨… 내일 봐요 💤';
  } else if (energy > 70 && health === 100) {
    mood = 'happy';
    line = '컨디션 최고! 어디든 갈 수 있어요 ✨';
  } else {
    mood = 'calm';
    line = '오늘은 어디 갈까요?';
  }

  return { energy, health, fatigue, mood, line, activeWarnings };
}

/** 경고별 아이콘과 캐릭터식 표현 (돌봐주세요 카드) */
export const WARNING_UI: Record<WarningKey, { icon: string; hint: string }> = {
  tirePressure: { icon: '🛞', hint: '바퀴가 말랑말랑해요…' },
  engineOil: { icon: '🛢️', hint: '속이 더부룩해요…' },
  brakeOil: { icon: '🛑', hint: '멈추기가 힘들어요…' },
  washerFluid: { icon: '💧', hint: '앞이 잘 안 보여요…' },
  lamp: { icon: '💡', hint: '눈이 침침해요…' },
  smartKeyBattery: { icon: '🔑', hint: '열쇠가 졸려해요…' },
};
