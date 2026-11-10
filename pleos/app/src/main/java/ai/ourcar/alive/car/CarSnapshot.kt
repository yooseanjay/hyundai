package ai.ourcar.alive.car

/** 차가 알려 주는 경고 (Pleos Vehicle SDK Safety에서 읽을 수 있는 것만) */
enum class Warning(val label: String, val hint: String) {
    ENGINE_OIL("엔진오일", "속이 더부룩해요…"),
    BRAKE_FLUID("브레이크액", "멈추기가 힘들어요…"),
    WASHER_FLUID("워셔액", "앞이 잘 안 보여요…"),
}

/**
 * 지금 차 상태. 모르는 값은 null.
 * energyPct: 전기차면 배터리 %, 아니면 연료 %.
 */
data class CarSnapshot(
    val connected: Boolean = false,
    val odometerKm: Double? = null,
    val rangeKm: Int? = null,
    val energyPct: Int? = null,
    val isEv: Boolean = false,
    val charging: Boolean = false,
    val warnings: Set<Warning> = emptySet(),
    /** 기어가 P가 아님(D·R·N) = 움직이는 중 */
    val moving: Boolean = false,
)
