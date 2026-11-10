package ai.ourcar.alive.logic

import ai.ourcar.alive.car.CarSnapshot

/** 캐릭터 기분 → 얼굴 표정 */
enum class Mood { HAPPY, CALM, TIRED, HUNGRY, SICK, EXCITED, SLEEPY }

data class CharacterStatus(
    val energy: Int,
    val mood: Mood,
    /** 캐릭터 한마디 (화면에 보이고, 누르면 읽어 줌). 짧게: 한 줄 */
    val line: String,
)

/**
 * 차 데이터 → 캐릭터 상태 (서비스의 핵심 규칙, 웹 앱 src/game/character.ts 와 같은 규칙)
 * 우선순위: 주행 중 > 경고 > 배고픔 > 충전 중 > 많이 달림 > 밤 > 컨디션 최고 > 보통
 */
fun computeStatus(s: CarSnapshot, todayKm: Double, hour: Int): CharacterStatus {
    val energy = (s.energyPct ?: 0).coerceIn(0, 100)
    val warnings = s.warnings.toList()
    val fatigue = (todayKm / 2.5).coerceAtMost(100.0)
    val food = if (s.isEv) "충전" else "주유"

    val (mood, line) = when {
        s.moving -> Mood.EXCITED to "부릉부릉~ 같이 달려요!"
        warnings.isNotEmpty() -> Mood.SICK to (
            if (warnings.size > 1) "여기저기 아파요… (${warnings[0].label} 외 ${warnings.size - 1}곳)"
            else "${warnings[0].label} 쪽이 불편해요…"
            )
        s.energyPct != null && energy < 20 -> Mood.HUNGRY to "배고파요… ${food}해 주세요. ${s.rangeKm ?: 0}km 남았어요"
        s.charging -> Mood.CALM to "냠냠, 충전 중이에요"
        fatigue > 70 -> Mood.TIRED to "오늘 ${todayKm.toInt()}km나 달렸어요. 좀 쉬고 싶어요"
        hour >= 23 || hour < 6 -> Mood.SLEEPY to "쿨쿨… 내일 봐요"
        energy > 70 -> Mood.HAPPY to "컨디션 최고! 어디든 갈 수 있어요"
        else -> Mood.CALM to "오늘은 어디 갈까요?"
    }
    return CharacterStatus(energy, mood, line)
}
