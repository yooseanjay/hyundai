package ai.ourcar.alive.logic

import kotlin.math.roundToInt

/** 한 번의 주행 (P에서 출발해 다시 P로 돌아올 때까지) */
data class Trip(
    val startedAt: Long,
    val endedAt: Long,
    val distanceKm: Double,
    val durationMin: Int,
    val avgSpeedKmh: Int,
)

/**
 * 기어로 주행을 나눈다: P → (D·R·N) 이면 시작, 다시 P면 끝.
 * 거리는 시작·끝의 누적 주행거리 차이 (Vehicle SDK Odometer).
 * 앱이 꺼졌다 켜져도 이어지도록 시작 값은 밖(Store)에 저장한다.
 */
class TripTracker(var active: Active? = null) {

    data class Active(val startMs: Long, val startOdoKm: Double)

    /** @return 주행이 끝났으면 그 기록, 아니면 null */
    fun onUpdate(moving: Boolean, odoKm: Double?, nowMs: Long): Trip? {
        val a = active
        if (moving && a == null && odoKm != null) {
            active = Active(nowMs, odoKm)
            return null
        }
        if (!moving && a != null && odoKm != null) {
            active = null
            val km = ((odoKm - a.startOdoKm) * 10).roundToInt() / 10.0
            if (km < 0.1) return null // 주차장 안에서 잠깐 움직인 정도는 기록 안 함
            val min = ((nowMs - a.startMs) / 60_000.0).roundToInt().coerceAtLeast(1)
            return Trip(a.startMs, nowMs, km, min, (km / (min / 60.0)).roundToInt())
        }
        return null
    }
}
