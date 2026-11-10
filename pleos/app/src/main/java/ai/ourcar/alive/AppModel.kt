package ai.ourcar.alive

import ai.ourcar.alive.car.CarSnapshot
import ai.ourcar.alive.car.CarSource
import ai.ourcar.alive.car.DrivingRestriction
import ai.ourcar.alive.car.Warning
import ai.ourcar.alive.logic.CharacterStatus
import ai.ourcar.alive.logic.DiaryEntry
import ai.ourcar.alive.logic.TripTracker
import ai.ourcar.alive.logic.computeStatus
import ai.ourcar.alive.logic.writeDiary
import ai.ourcar.alive.store.Look
import ai.ourcar.alive.store.Store
import ai.ourcar.alive.voice.Voice
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

data class UiState(
    val car: CarSnapshot = CarSnapshot(),
    val status: CharacterStatus? = null,
    val nickname: String = "내 차",
    val look: Look = Look(),
    val diaries: List<DiaryEntry> = emptyList(),
    /** 방금 끝난 주행의 일기 (화면에 한 번 띄움) */
    val freshDiary: DiaryEntry? = null,
    /** 주행 중 화면 제한 (CarUxRestrictions) */
    val restricted: Boolean = false,
)

/** 차 데이터 → 캐릭터 · 주행 기록 · 일기를 묶는 곳 */
class AppModel(
    private val source: CarSource,
    private val restriction: DrivingRestriction,
    private val store: Store,
    private val voice: Voice,
) : ViewModel() {

    private val _ui = MutableStateFlow(UiState(nickname = store.nickname, look = store.look, diaries = store.diaries()))
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    private val tracker = TripTracker(store.activeTrip)
    private var warningsAtStart: Set<Warning> = emptySet()
    private var lastLine: String? = null

    init {
        source.start()
        restriction.start()
        voice.start()
        viewModelScope.launch { source.state.collect(::onCar) }
        viewModelScope.launch { restriction.restricted.collect { r -> _ui.update { it.copy(restricted = r) } } }
    }

    private fun onCar(car: CarSnapshot) {
        val wasActive = tracker.active != null
        val trip = tracker.onUpdate(car.moving, car.odometerKm, System.currentTimeMillis())
        if (!wasActive && tracker.active != null) warningsAtStart = car.warnings
        if (wasActive != (tracker.active != null)) store.activeTrip = tracker.active
        if (trip != null) {
            store.addTrip(trip)
            val diary = writeDiary(store.nickname, trip, car, car.warnings - warningsAtStart)
            store.addDiary(diary)
            _ui.update { it.copy(diaries = store.diaries(), freshDiary = diary) }
        }
        val status = if (car.connected) computeStatus(car, todayKm(), LocalTime.now().hour) else null
        _ui.update { it.copy(car = car, status = status) }
        // 기분이 바뀌면 한마디 (주행 중에는 말 걸지 않음)
        if (status != null && status.line != lastLine && !car.moving && lastLine != null) voice.speak(status.line)
        if (status != null) lastLine = status.line
    }

    private fun todayKm(): Double {
        val today = LocalDate.now()
        return store.trips().filter {
            java.time.Instant.ofEpochMilli(it.endedAt).atZone(ZoneId.systemDefault()).toLocalDate() == today
        }.sumOf { it.distanceKm }
    }

    fun speakLine() { _ui.value.status?.line?.let(voice::speak) }

    fun setLook(look: Look) { store.look = look; _ui.update { it.copy(look = look) } }

    fun setNickname(name: String) { store.nickname = name; _ui.update { it.copy(nickname = store.nickname) } }

    fun dismissDiary() = _ui.update { it.copy(freshDiary = null) }

    override fun onCleared() {
        source.stop()
        restriction.stop()
        voice.release()
    }
}
