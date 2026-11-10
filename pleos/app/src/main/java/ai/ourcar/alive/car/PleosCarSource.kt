package ai.ourcar.alive.car

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.constant.control.OilLevelState
import ai.pleos.playground.vehicle.constant.control.VehicleGear
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlin.math.roundToInt

/** 차 상태를 알려 주는 곳. 실제 차(Pleos) 또는 개발용 가짜 차(debug 빌드에서만) */
interface CarSource {
    val state: StateFlow<CarSnapshot>
    fun start()
    fun stop()
}

/**
 * 현대 Pleos Vehicle SDK 로 차 상태 읽기 (읽기 전용).
 *
 * - SDK 호출은 콜백 방식 → 기어는 2초, 나머지는 6초마다 다시 읽어 [state]에 모은다.
 * - initialize()는 차량 서비스에 비동기로 연결되므로 첫 값이 올 때까지 1초마다 다시 시도.
 * - 이 차에 없는 값(예: 내연기관 차의 배터리 %)은 실패 콜백이 오고 null 로 남는다.
 * - 메서드 이름·타입: ai.pleos.playground:Vehicle:2.3.2 클래스 시그니처 기준.
 *   단위: 누적 주행거리 km, 주행 가능 거리 m(→ km).
 */
class PleosCarSource(context: Context) : CarSource {

    private val vehicle = Vehicle(context.applicationContext)
    private val main = Handler(Looper.getMainLooper())
    private val _state = MutableStateFlow(CarSnapshot())
    override val state: StateFlow<CarSnapshot> = _state.asStateFlow()

    private var started = false
    private var tick = 0

    // 아직 모르는 값과 아는 값을 구분하려고 따로 모아 둠
    @Volatile private var evSoc: Int? = null
    @Volatile private var fuelPct: Int? = null

    private val poll = object : Runnable {
        override fun run() {
            readGear()
            if (tick++ % 3 == 0 || !_state.value.connected) readAll()
            main.postDelayed(this, if (_state.value.connected) 2_000L else 1_000L)
        }
    }

    override fun start() {
        if (started) return
        started = true
        try {
            vehicle.initialize()
        } catch (e: Exception) {
            Log.w(TAG, "Vehicle SDK 연결 실패 (Pleos Connect 차가 아닐 수 있음)", e)
        }
        main.post(poll)
    }

    override fun stop() {
        main.removeCallbacks(poll)
        if (started) runCatching { vehicle.release() }
        started = false
    }

    private fun set(f: (CarSnapshot) -> CarSnapshot) = _state.update { f(it).copy(connected = true) }

    private fun readGear() = safely {
        vehicle.getGear().getCurrentGearSelectionState({ g ->
            if (g != null && g != VehicleGear.GEAR_UNKNOWN) set { it.copy(moving = g != VehicleGear.GEAR_PARK) }
        }, ::fail)
    }

    private fun readAll() {
        safely {
            val odo = vehicle.getOdometer()
            odo.getCurrentDistanceDriven({ v -> if (v != null) set { it.copy(odometerKm = v.toDouble()) } }, ::fail)
            // SDK 2.3.2에서 deprecated(표준 RANGE_REMAINING 권장)지만 아직 동작
            @Suppress("DEPRECATION")
            odo.getRangeRemainingDistance({ v -> if (v != null) set { it.copy(rangeKm = (v / 1000f).roundToInt()) } }, ::fail)
        }
        safely {
            val ev = vehicle.getEvBattery()
            ev.getEvBatteryStateOfCharge({ v -> evSoc = v; energy() }, ::fail)
            ev.getEvChargeSwitchState({ v -> if (v != null) set { it.copy(charging = v) } }, ::fail)
        }
        safely { vehicle.getFuel().getFuelPercent({ v -> fuelPct = v; energy() }, ::fail) }
        safely {
            val s = vehicle.getSafety()
            s.getEngineOilLevelState({ v -> warn(Warning.ENGINE_OIL, v?.isLow()) }, ::fail)
            s.getBrakeFluidLevelState({ v -> warn(Warning.BRAKE_FLUID, v?.isLow()) }, ::fail)
            s.hasLowWasherFluidWarning({ v -> warn(Warning.WASHER_FLUID, v) }, ::fail)
        }
    }

    /** 배터리 %가 읽히고 연료 %가 없으면 전기차 */
    private fun energy() {
        val soc = evSoc
        val fuel = fuelPct
        if (soc == null && fuel == null) return
        set { it.copy(energyPct = soc ?: fuel, isEv = soc != null && fuel == null) }
    }

    private fun warn(w: Warning, on: Boolean?) {
        if (on == null) return
        set { it.copy(warnings = if (on) it.warnings + w else it.warnings - w) }
    }

    private fun OilLevelState.isLow() = this == OilLevelState.LOW || this == OilLevelState.CRITICALLY_LOW

    private inline fun safely(block: () -> Unit) {
        try { block() } catch (e: Exception) { Log.d(TAG, "SDK 호출 실패: ${e.message}") }
    }

    private fun fail(e: Exception) = Log.d(TAG, "값 없음: ${e.message}").let { }

    private companion object { const val TAG = "OurCarVehicle" }
}
