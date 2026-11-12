package io.github.yooseanjay.ourcaralive

import ai.pleos.playground.vehicle.Vehicle
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.lang.reflect.Method

/**
 * Pleos 차량 SDK에서 지금 값을 몇 초마다 읽어 웹 앱으로 보냄 (읽기만, 제어 없음)
 *
 * SDK 버전마다 함수 이름 · 모양이 조금씩 달라서(릴리스 노트의 breaking change 참고)
 * 공식 예제(pleos-sample-vehicle-app)처럼 리플렉션으로 "getCurrent…(성공 콜백, 실패 콜백)" 모양만 골라 부름.
 * 값 이름은 "도메인.함수"  예) EvBattery.getCurrentEvBatteryStateOfCharge → 웹(src/pleos/native.ts)이 골라 씀
 */
class VehicleReader(context: Context, private val onValues: (Map<String, Any?>) -> Unit) {

    private val main = Handler(Looper.getMainLooper())
    private val vehicle: Vehicle? = runCatching { Vehicle(context.applicationContext) }.getOrNull()
    private var ready = false
    private var running = false
    private var paused = false
    private val last = HashMap<String, Any?>()

    /** 읽어 볼 도메인 (Vehicle.getXxx()) */
    private val domains = listOf("getEvBattery", "getFuel", "getOdometer", "getDrivingMode", "getHVAC", "getDoor", "getTire", "getSafety", "getCarInfo")

    val available: Boolean get() = vehicle != null && init()

    /** 시작된 SDK 객체 (VehicleHub 가 같은 연결을 씀) */
    fun vehicleOrNull(): Vehicle? = if (vehicle != null && init()) vehicle else null

    private fun init(): Boolean {
        if (ready) return true
        val v = vehicle ?: return false
        ready = runCatching { v.initialize(); true }.getOrElse { Log.w(TAG, "차량 SDK 시작 실패: ${it.message}"); false }
        return ready
    }

    fun start() {
        if (running || !init()) return
        running = true
        main.post(tick)
    }

    fun resume() { paused = false; if (running) { main.removeCallbacks(tick); main.post(tick) } }
    fun pause() { paused = true; main.removeCallbacks(tick) }

    private val tick = object : Runnable {
        override fun run() {
            if (!running || paused) return
            pollOnce()
            main.postDelayed(this, POLL_MS)
        }
    }

    private fun pollOnce() {
        val v = vehicle ?: return
        for (getter in domains) {
            val api = runCatching { v.javaClass.getMethod(getter).invoke(v) }.getOrNull() ?: continue
            val domain = getter.removePrefix("get")
            for (m in readable(api.javaClass)) read(domain, api, m)
        }
    }

    private val readableCache = HashMap<Class<*>, List<Method>>()

    /** 영역(문 · 좌석 등) 없이 콜백만 받는 getCurrent… 함수 */
    private fun readable(cls: Class<*>): List<Method> = readableCache.getOrPut(cls) {
        cls.methods.filter { m ->
            m.name.startsWith("getCurrent") &&
                m.parameterTypes.isNotEmpty() &&
                m.parameterTypes.all { it.name.startsWith("kotlin.jvm.functions.Function") } &&
                !m.isAnnotationPresent(java.lang.Deprecated::class.java) &&
                !m.isAnnotationPresent(Deprecated::class.java)
        }
    }

    private fun read(domain: String, api: Any, m: Method) {
        val key = "$domain.${m.name}"
        val args = m.parameterTypes.mapIndexed { i, t -> callbackFor(t, success = i == 0) { value -> publish(key, value) } }
        runCatching { m.invoke(api, *args.toTypedArray()) }
    }

    private fun callbackFor(type: Class<*>, success: Boolean, onValue: (Any?) -> Unit): Any? {
        val f0: () -> Unit = {}
        val f1: (Any?) -> Unit = { a -> if (success) onValue(a) }
        val f2: (Any?, Any?) -> Unit = { a, _ -> if (success) onValue(a) }
        val f3: (Any?, Any?, Any?) -> Unit = { a, _, _ -> if (success) onValue(a) }
        return when (type.name) {
            "kotlin.jvm.functions.Function0" -> f0
            "kotlin.jvm.functions.Function1" -> f1
            "kotlin.jvm.functions.Function2" -> f2
            "kotlin.jvm.functions.Function3" -> f3
            else -> null
        }
    }

    private fun publish(key: String, raw: Any?) {
        val value: Any? = when (raw) {
            null -> null
            is Number, is Boolean, is String -> raw
            is Enum<*> -> raw.name
            else -> raw.toString().take(200)
        }
        main.post {
            if (last.containsKey(key) && last[key] == value) return@post
            last[key] = value
            onValues(mapOf(key to value))
        }
    }

    fun release() {
        running = false
        main.removeCallbacks(tick)
        if (ready) runCatching { vehicle?.release() }
        ready = false
    }

    private companion object {
        const val TAG = "VehicleReader"
        const val POLL_MS = 3000L
    }
}
