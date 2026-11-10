package ai.ourcar.alive.logic

import ai.ourcar.alive.car.CarSnapshot
import ai.ourcar.alive.car.Warning
import java.time.Instant
import java.time.ZoneId
import kotlin.random.Random

data class DiaryEntry(
    val id: String,
    val date: Long,
    val title: String,
    val body: String,
    val distanceKm: Double,
    val durationMin: Int,
)

/**
 * 주행이 끝나면 차가 쓰는 '오늘의 일기' (웹 앱 src/game/diary.ts 와 같은 규칙).
 * 차에서 받을 수 없는 값(급정거 횟수 등)은 쓰지 않는다.
 */
fun writeDiary(
    nickname: String,
    trip: Trip,
    after: CarSnapshot,
    newWarnings: Set<Warning>,
    zone: ZoneId = ZoneId.systemDefault(),
    random: Random = Random.Default,
): DiaryEntry {
    val hour = Instant.ofEpochMilli(trip.startedAt).atZone(zone).hour
    val whenText = when {
        hour < 6 -> "새벽"
        hour < 11 -> "아침"
        hour < 17 -> "낮"
        hour < 21 -> "저녁"
        else -> "밤"
    }
    val km = trip.distanceKm.toString().removeSuffix(".0")
    val lines = mutableListOf<String>()
    lines += listOf(
        "${whenText}에 주인이랑 ${km}km를 함께 달렸다.",
        "오늘 $whenText, 주인을 태우고 ${km}km를 다녀왔다.",
        "${trip.durationMin}분 동안 ${km}km. 오늘의 모험 기록!",
    ).random(random)
    lines += if (trip.avgSpeedKmh < 40) {
        listOf("천천히 달려서 창밖 구경을 실컷 했다.", "느긋한 드라이브였다. 기분이 몽글몽글했다.").random(random)
    } else {
        listOf("평균 ${trip.avgSpeedKmh}km/h로 신나게 달렸다.", "창밖 풍경이 휙휙 지나가서 재밌었다.").random(random)
    }
    if (newWarnings.isNotEmpty()) {
        lines += "그런데 ${newWarnings.joinToString(", ") { it.label }} 쪽이 좀 이상하다… 주인이 알아채 줬으면 좋겠다."
    }
    val energy = after.energyPct
    if (energy != null && energy < 20) lines += "배가 너무 고프다. 남은 힘으로 ${after.rangeKm ?: 0}km 정도 갈 수 있을 것 같다."
    else if (energy != null && energy > 70) lines += "아직 힘이 넘친다! 내일도 문제없다."
    lines += "이제 시동을 끄고 쉬는 중."

    val title = when {
        newWarnings.isNotEmpty() -> "조금 아팠던 날"
        trip.distanceKm > 80 -> "먼 길 다녀온 날"
        else -> "평범하고 좋은 날"
    }
    return DiaryEntry(
        id = "${trip.endedAt}-${random.nextInt(0, 1_000_000)}",
        date = trip.endedAt,
        title = title,
        body = lines.joinToString(" "),
        distanceKm = trip.distanceKm,
        durationMin = trip.durationMin,
    )
}
