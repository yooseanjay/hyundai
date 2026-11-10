package ai.ourcar.alive.car

import android.car.Car
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 주행 중 화면 제한 (Android Automotive 표준 CarUxRestrictions, Pleos 운전자 주의 분산 가이드).
 * restricted = true 이면 앱은 '주행 중 화면'(큰 얼굴 + 주행 가능 거리)만 보여 준다.
 * 자동차 기기가 아니면 항상 false.
 */
class DrivingRestriction(context: Context) {

    private val app = context.applicationContext
    private val _restricted = MutableStateFlow(false)
    val restricted: StateFlow<Boolean> = _restricted.asStateFlow()

    private var car: Car? = null
    private var manager: CarUxRestrictionsManager? = null
    private val listener = CarUxRestrictionsManager.OnUxRestrictionsChangedListener { onChange(it) }

    fun start() {
        if (!app.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) return
        runCatching {
            val c = Car.createCar(app) ?: return
            car = c
            val m = c.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as? CarUxRestrictionsManager ?: return
            manager = m
            m.registerListener(listener)
            m.currentCarUxRestrictions?.let(::onChange)
        }.onFailure { Log.w(TAG, "주행 제한 정보를 받을 수 없음", it) }
    }

    fun stop() {
        runCatching { manager?.unregisterListener() }
        runCatching { car?.disconnect() }
        manager = null
        car = null
    }

    private fun onChange(r: CarUxRestrictions) {
        _restricted.value = r.isRequiresDistractionOptimization
    }

    private companion object { const val TAG = "OurCarUx" }
}
