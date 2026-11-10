// AI 음성봇 두뇌: 운전자의 말을 알아듣고, '지금 차의 실제 상태'로 캐릭터답게 대답한다.
// - 무료 · 오프라인 규칙 기반(의도 분류 + 차량 데이터 슬롯 채우기).
// - 나중에 LLM(예: Claude API)을 백엔드에 붙이면 buildContext()를 그대로 시스템 프롬프트로 넘기면 된다.
import { WARNING_LABELS, type CarProfile, type Trip, type VehicleSnapshot } from '../api/types';
import { ENERGY_TERMS, FUEL_LABEL } from '../data/hyundaiModels';
import type { CharacterStatus, Mood } from './character';
import { WARNING_UI } from './character';
import { type Progress } from './progress';

export interface BotContext {
  car: CarProfile;
  snap: VehicleSnapshot;
  status: CharacterStatus;
  trips: Trip[];
  progress: Progress;
}

export interface BotReply {
  text: string;
  mood?: Mood;
  intent: string;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const has = (q: string, words: string[]) => words.some((w) => q.includes(w));
/** 받침에 따라 조사 고르기: josa('전기','이','가') → '전기가' */
const josa = (w: string, withBatchim: string, without: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  const batchim = c >= 0 && c <= 11171 && c % 28 !== 0;
  if (withBatchim === '으로') return w + (batchim && c % 28 !== 8 ? '으로' : '로');
  return w + (batchim ? withBatchim : without);
};
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** 말 → 의도 (위에서부터 먼저 맞는 것) */
const INTENTS: { id: string; words: string[] }[] = [
  { id: 'greet', words: ['안녕', '하이', '반가', '좋은 아침', '굿모닝', '헬로'] },
  { id: 'name', words: ['이름', '누구', '너 뭐'] },
  { id: 'health', words: ['아파', '아픈', '아프', '경고', '고장', '이상', '정비', '점검', '문제', '괜찮'] },
  { id: 'range', words: ['얼마나 갈', '몇 키로', '몇 km', '주행 가능', '갈 수 있', '남은 거리', '주행가능'] },
  { id: 'energy', words: ['배고', '밥', '기름', '연료', '주유', '충전', '배터리', '수소', '에너지'] },
  { id: 'parking', words: ['어디', '주차', '위치', '찾아'] },
  { id: 'today', words: ['오늘', '얼마나 달', '운전', '주행', '달렸'] },
  { id: 'diary', words: ['일기'] },
  { id: 'odometer', words: ['누적', '총 거리', '주행거리', '키로수', '몇 살'] },
  { id: 'weather', words: ['날씨', '비 와', '비와', '눈 와', '눈와', '추워', '더워'] },
  { id: 'mood', words: ['기분', '어때', '컨디션', '상태', '뭐해', '뭐 해'] },
  { id: 'thanks', words: ['고마', '감사', '수고', '사랑', '최고', '잘했', '착하'] },
  { id: 'bye', words: ['잘 자', '잘자', '안녕히', '바이', '다녀올', '갔다 올', '내릴'] },
  { id: 'help', words: ['뭐 할 수', '뭘 할 수', '도움', '도와', '기능', '할 줄'] },
];

export function detectIntent(raw: string): string {
  const q = raw.replace(/\s+/g, ' ').toLowerCase();
  return INTENTS.find((i) => has(q, i.words))?.id ?? 'unknown';
}

export function reply(raw: string, ctx: BotContext): BotReply {
  const { car, snap, status, trips, progress } = ctx;
  const intent = detectIntent(raw);
  const me = car.nickname;
  const term = ENERGY_TERMS[car.fuelType];
  const food = car.fuelType === 'ev' ? '전기' : car.fuelType === 'hydrogen' ? '수소' : '기름';
  const warns = status.activeWarnings;
  const todayTrips = trips.filter((t) => isToday(t.endedAt));
  const todayKm = todayTrips.reduce((a, t) => a + t.distanceKm, 0);

  switch (intent) {
    case 'greet':
      return { intent, mood: 'happy', text: pick([`안녕하세요! 저 ${josa(me, '이에요', '예요')}. 오늘도 같이 달려요!`, `반가워요! ${status.line}`, `왔어요? 기다리고 있었어요!`]) };

    case 'name':
      return { intent, mood: 'happy', text: `저는 ${josa(me, '이에요', '예요')}! ${car.model} ${FUEL_LABEL[car.fuelType]} 차로 태어났어요. 차 상태가 곧 제 기분이에요.` };

    case 'health':
      if (!warns.length) return { intent, mood: 'happy', text: '아픈 곳 하나도 없어요! 경고등도 전부 꺼져 있어요. 챙겨줘서 고마워요.' };
      return {
        intent,
        mood: 'sick',
        text: `${warns.map((k) => WARNING_LABELS[k]).join(', ')} 쪽이 불편해요. ${WARNING_UI[warns[0]].hint} 정비소에 데려가 주면 금방 나을 거예요.`,
      };

    case 'range':
      return {
        intent,
        mood: status.energy < 20 ? 'hungry' : 'calm',
        text: `지금 ${josa(food, '으로', '로')} ${snap.dteKm}킬로미터 정도 더 갈 수 있어요.` + (snap.dteKm < 80 ? ` 멀리 가려면 먼저 ${term.refill.replace('하기', '')}해 주세요!` : ' 넉넉해요!'),
      };

    case 'energy':
      if (snap.charging) return { intent, mood: 'calm', text: `냠냠, 지금 충전하는 중이에요. 배가 ${status.energy}퍼센트 찼어요.` };
      if (status.energy < 20) return { intent, mood: 'hungry', text: `배고파요… ${josa(food, '이', '가')} ${status.energy}퍼센트밖에 없어요. ${snap.dteKm}킬로미터 가면 멈출지도 몰라요. ${term.refill.replace('하기', '')} 부탁해요!` };
      if (status.energy < 50) return { intent, mood: 'calm', text: `${josa(food, '이', '가')} ${status.energy}퍼센트 남았어요. 아직 괜찮지만 오늘 안에 ${term.refill.replace('하기', '')}해 주면 좋겠어요.` };
      return { intent, mood: 'happy', text: `배불러요! ${josa(food, '이', '가')} ${status.energy}퍼센트나 있어요. ${snap.dteKm}킬로미터는 거뜬해요.` };

    case 'parking':
      if (!snap.parking) return { intent, mood: 'calm', text: '마지막 주차 위치를 아직 못 받았어요. 새로고침을 눌러 볼래요?' };
      return { intent, mood: 'calm', text: `저 지금 ${snap.parking.label}에서 쉬고 있어요. 홈 화면 지도 버튼을 누르면 바로 찾아올 수 있어요.` };

    case 'today':
      if (!todayTrips.length) return { intent, mood: 'calm', text: '오늘은 아직 한 번도 안 달렸어요. 운전 탭에서 시동 걸어 줄래요?' };
      return {
        intent,
        mood: status.fatigue > 70 ? 'tired' : 'happy',
        text: `오늘 ${todayTrips.length}번, 모두 ${todayKm}킬로미터를 달렸어요.` +
          (todayTrips.some((t) => t.hardBrakes >= 3) ? ' 급정거가 좀 있어서 깜짝 놀랐어요.' : ' 부드럽게 운전해 줘서 편했어요.') +
          (status.fatigue > 70 ? ' 이제 좀 쉬고 싶어요.' : ''),
      };

    case 'diary': {
      const d = progress.diaries[0];
      if (!d) return { intent, mood: 'calm', text: '아직 일기가 없어요. 운전하고 내리면 제가 오늘의 일기를 써 둘게요!' };
      return { intent, mood: 'happy', text: `제일 최근 일기 제목은 "${d.title}"예요. ${d.body.split('\n')[0]}` };
    }

    case 'odometer':
      return { intent, mood: 'calm', text: `지금까지 모두 ${snap.odometerKm.toLocaleString()}킬로미터를 달렸어요. 지구 한 바퀴가 4만 킬로미터래요!` };

    case 'weather':
      return { intent, mood: 'calm', text: '날씨는 아직 제가 볼 수 없어요. 그래도 비 오는 날엔 와이퍼랑 워셔액, 추운 날엔 타이어 공기압을 꼭 챙겨 주세요!' };

    case 'mood':
      return { intent, mood: status.mood, text: status.line };

    case 'thanks':
      return { intent, mood: 'excited', text: pick(['헤헤, 저도 고마워요! 앞으로도 잘 부탁해요.', '칭찬 들으니까 엔진이 두근두근해요!', '저도 주인님이 최고예요!']) };

    case 'bye':
      return { intent, mood: 'sleepy', text: pick(['조심히 다녀와요! 여기서 기다릴게요.', '푹 쉬어요. 저도 좀 잘게요, 쿨쿨.', '다음에 또 달려요!']) };

    case 'help':
      return { intent, mood: 'happy', text: '이렇게 물어봐요. 기분 어때? 얼마나 갈 수 있어? 어디 아파? 어디 주차했어? 오늘 얼마나 달렸어? 노래 틀어줘!' };

    default:
      return { intent, mood: 'calm', text: pick([`음… 잘 못 알아들었어요. "기분 어때?"나 "얼마나 갈 수 있어?"처럼 물어봐 줄래요?`, '그건 아직 몰라요. 제 상태나 오늘 운전에 대해 물어봐 주세요!']) };
  }
}

/** LLM 연동 시 그대로 시스템 프롬프트로 쓸 수 있는 차량 상태 요약 */
export function buildContext(ctx: BotContext): string {
  const { car, snap, status, progress } = ctx;
  return [
    `너는 사용자의 자동차 "${car.nickname}"(${car.model}, ${FUEL_LABEL[car.fuelType]})이고 귀여운 말투로 짧게 대답한다.`,
    `연료/배터리 ${status.energy}%, 주행가능거리 ${snap.dteKm}km, 누적 ${snap.odometerKm}km`,
    `경고: ${status.activeWarnings.map((k) => WARNING_LABELS[k]).join(', ') || '없음'}`,
    `주차: ${snap.parking?.label ?? '알 수 없음'}`,
  ].join('\n');
}
