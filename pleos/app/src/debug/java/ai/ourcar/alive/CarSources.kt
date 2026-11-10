package ai.ourcar.alive

import ai.ourcar.alive.car.CarSnapshot
import ai.ourcar.alive.car.CarSource
import ai.ourcar.alive.car.PleosCarSource
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 개발(debug) 빌드 전용. 차가 아닌 기기(폰·일반 에뮬레이터)에서는 화면 확인용 가짜 차를 쓴다.
 * 출시(release) 빌드에는 이 파일이 들어가지 않는다.
 */
object CarSources {
    fun create(context: Context): CarSource =
        if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) PleosCarSource(context)
        else FakeCarSource()
}

/** 20초 주차 → 40초 주행 → 반복. 주행 중 누적 거리·주행 가능 거리·배터리가 변한다 */
private class FakeCarSource : CarSource {
    private val main = Handler(Looper.getMainLooper())
    private val _state = MutableStateFlow(
        CarSnapshot(connected = true, odometerKm = 12_480.0, rangeKm = 318, energyPct = 72, isEv = true),
    )
    override val state: StateFlow<CarSnapshot> = _state.asStateFlow()
    private var sec = 0

    private val tick = object : Runnable {
        override fun run() {
            sec = (sec + 1) % 60
            val s = _state.value
            val moving = sec >= 20
            _state.value = if (moving) s.copy(
                moving = true,
                odometerKm = (s.odometerKm ?: 0.0) + 0.015,
                rangeKm = s.rangeKm?.let { if (sec % 4 == 0) it - 1 else it },
                energyPct = s.energyPct?.let { if (sec == 59) (it - 1).coerceAtLeast(5) else it },
            ) else s.copy(moving = false)
            main.postDelayed(this, 1_000L)
        }
    }

    override fun start() { main.post(tick) }
    override fun stop() { main.removeCallbacks(tick) }
}
