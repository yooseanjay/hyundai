package ai.ourcar.alive

import ai.ourcar.alive.car.CarSource
import ai.ourcar.alive.car.PleosCarSource
import android.content.Context

/** 출시 빌드: 실제 차(Pleos Vehicle SDK)만. 가짜 데이터 없음 */
object CarSources {
    fun create(context: Context): CarSource = PleosCarSource(context)
}
