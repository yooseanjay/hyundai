package ai.ourcar.alive

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.constant.control.OilLevelState
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * 현대 Pleos Vehicle SDK 값을 읽어 웹 앱(window.PleosVehicle)에 넘겨 주는 다리.
 *
 * - 읽기 전용: 웹 쪽에는 snapshot() 하나만 공개하고, 차를 제어하는 메서드는 만들지 않는다.
 * - SDK 호출은 모두 콜백 방식이라, 5초마다 값을 새로 읽어 [state]에 모아 두고 웹은 그 사본을 가져간다.
 * - initialize()는 차량 서비스에 비동기로 연결되므로 첫 값이 올 때까지 반복해서 읽는다.
 * - 이 차가 지원하지 않는 값(예: 내연기관 차의 배터리 %)은 실패 콜백이 오고 null 로 남는다.
 *
 * 메서드 이름·타입: ai.pleos.playground:Vehicle:2.3.2 (공개 Maven) 클래스 시그니처 기준.
 * 단위: 누적 주행거리 km, 주행 가능 거리 m(→ km로 변환), 배터리·연료 %.
 */
class VehicleBridge(context: Context) {

    private val vehicle = Vehicle(context.applicationContext)
    private val main = Handler(Looper.getMainLooper())
    private val state = State()
    @Volatile private var started = false

    private class State {
        @Volatile var connected = false
        @Volatile var odometerKm: Float? = null
        @Volatile var rangeM: Float? = null
        @Volatile var evSoc: Int? = null
        @Volatile var fuelPct: Int? = null
        @Volatile var charging: Boolean? = null
        @Volatile var engineOilLow: Boolean? = null
        @Volatile var brakeFluidLow: Boolean? = null
        @Volatile var washerFluidLow: Boolean? = null
    }

    private val poll = object : Runnable {
        override fun run() {
            readAll()
            main.postDelayed(this, if (state.connected) POLL_MS else RETRY_MS)
        }
    }

    fun start() {
        if (started) return
        started = true
        try {
            vehicle.initialize()
        } catch (e: Exception) {
            Log.w(TAG, "Vehicle SDK 연결 실패 (Pleos Connect 기기가 아닐 수 있음)", e)
        }
        main.post(poll)
    }

    fun stop() {
        main.removeCallbacks(poll)
        if (started) runCatching { vehicle.release() }
        started = false
    }

    /** 앱이 다시 보일 때 바로 한 번 새로 읽기 */
    fun refreshNow() {
        main.removeCallbacks(poll)
        main.post(poll)
    }

    private fun ok() { state.connected = true }

    private fun readAll() {
        safely {
            val odo = vehicle.getOdometer()
            odo.getCurrentDistanceDriven({ v -> state.odometerKm = v; ok() }, ::fail)
            odo.getRangeRemainingDistance({ v -> state.rangeM = v; ok() }, ::fail)
        }
        safely {
            val ev = vehicle.getEvBattery()
            ev.getEvBatteryStateOfCharge({ v -> state.evSoc = v; ok() }, ::fail)
            ev.getEvChargeSwitchState({ v -> state.charging = v }, ::fail)
        }
        safely { vehicle.getFuel().getFuelPercent({ v -> state.fuelPct = v; ok() }, ::fail) }
        safely {
            val s = vehicle.getSafety()
            s.getEngineOilLevelState({ v -> state.engineOilLow = v?.isLow() }, ::fail)
            s.getBrakeFluidLevelState({ v -> state.brakeFluidLow = v?.isLow() }, ::fail)
            s.hasLowWasherFluidWarning({ v -> state.washerFluidLow = v }, ::fail)
        }
    }

    private fun OilLevelState.isLow() = this == OilLevelState.LOW || this == OilLevelState.CRITICALLY_LOW

    private inline fun safely(block: () -> Unit) {
        try { block() } catch (e: Exception) { Log.d(TAG, "SDK 호출 실패: ${e.message}") }
    }

    private fun fail(e: Exception) {
        Log.d(TAG, "값 없음: ${e.message}")
    }

    /** 웹 앱이 부르는 유일한 메서드. 지금까지 읽은 값을 JSON으로 */
    @JavascriptInterface
    fun snapshot(): String = JSONObject().apply {
        put("connected", state.connected)
        put("odometerKm", state.odometerKm ?: JSONObject.NULL)
        put("rangeKm", state.rangeM?.let { it / 1000f } ?: JSONObject.NULL)
        put("evSocPct", state.evSoc ?: JSONObject.NULL)
        put("fuelPct", state.fuelPct ?: JSONObject.NULL)
        put("charging", state.charging ?: JSONObject.NULL)
        put("engineOilLow", state.engineOilLow ?: JSONObject.NULL)
        put("brakeFluidLow", state.brakeFluidLow ?: JSONObject.NULL)
        put("washerFluidLow", state.washerFluidLow ?: JSONObject.NULL)
    }.toString()

    private companion object {
        const val TAG = "OurCarVehicle"
        const val POLL_MS = 5_000L
        const val RETRY_MS = 1_000L
    }
}
