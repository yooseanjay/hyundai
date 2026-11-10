package ai.ourcar.alive.store

import ai.ourcar.alive.logic.DiaryEntry
import ai.ourcar.alive.logic.Trip
import ai.ourcar.alive.logic.TripTracker
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** 꾸미기: 눈 모양 · 얼굴 빛 · 볼터치 */
enum class EyeStyle(val label: String) { CLASSIC("웃는 눈"), ROUND("동글 눈"), SPARKLE("반짝 눈"), DOT("콩 눈") }

enum class Glow(val label: String, val argb: Long) {
    WHITE("화이트", 0xFFFFFFFF), BLUE("블루", 0xFF7CC0FF), MINT("민트", 0xFF8FF5D6), PINK("핑크", 0xFFFFA6D1), YELLOW("옐로", 0xFFFFE27A)
}

data class Look(val eye: EyeStyle = EyeStyle.CLASSIC, val glow: Glow = Glow.WHITE, val blush: Boolean = false)

/**
 * 앱 기록은 이 차 안(앱 전용 저장소)에만 둔다. 서버로 보내지 않음.
 * 일기 최근 100개, 주행 최근 50개.
 */
class Store(context: Context) {

    private val p = context.applicationContext.getSharedPreferences("ourcar", Context.MODE_PRIVATE)

    var nickname: String
        get() = p.getString("nickname", null) ?: "내 차"
        set(v) = p.edit().putString("nickname", v.trim().take(12).ifEmpty { "내 차" }).apply()

    var look: Look
        get() = Look(
            eye = runCatching { EyeStyle.valueOf(p.getString("eye", "")!!) }.getOrDefault(EyeStyle.CLASSIC),
            glow = runCatching { Glow.valueOf(p.getString("glow", "")!!) }.getOrDefault(Glow.WHITE),
            blush = p.getBoolean("blush", false),
        )
        set(v) = p.edit().putString("eye", v.eye.name).putString("glow", v.glow.name).putBoolean("blush", v.blush).apply()

    var activeTrip: TripTracker.Active?
        get() {
            val o = p.getString("activeTrip", null) ?: return null
            return runCatching { JSONObject(o).let { TripTracker.Active(it.getLong("start"), it.getDouble("odo")) } }.getOrNull()
        }
        set(v) = p.edit().apply {
            if (v == null) remove("activeTrip") else putString("activeTrip", JSONObject().put("start", v.startMs).put("odo", v.startOdoKm).toString())
        }.apply()

    fun diaries(): List<DiaryEntry> = list("diaries") {
        DiaryEntry(it.getString("id"), it.getLong("date"), it.getString("title"), it.getString("body"), it.getDouble("km"), it.getInt("min"))
    }

    fun addDiary(d: DiaryEntry) = save("diaries", listOf(d) + diaries(), 100) {
        JSONObject().put("id", it.id).put("date", it.date).put("title", it.title).put("body", it.body).put("km", it.distanceKm).put("min", it.durationMin)
    }

    fun trips(): List<Trip> = list("trips") {
        Trip(it.getLong("s"), it.getLong("e"), it.getDouble("km"), it.getInt("min"), it.getInt("avg"))
    }

    fun addTrip(t: Trip) = save("trips", listOf(t) + trips(), 50) {
        JSONObject().put("s", it.startedAt).put("e", it.endedAt).put("km", it.distanceKm).put("min", it.durationMin).put("avg", it.avgSpeedKmh)
    }

    private fun <T> list(key: String, read: (JSONObject) -> T): List<T> = runCatching {
        val a = JSONArray(p.getString(key, "[]"))
        (0 until a.length()).mapNotNull { i -> runCatching { read(a.getJSONObject(i)) }.getOrNull() }
    }.getOrDefault(emptyList())

    private fun <T> save(key: String, items: List<T>, max: Int, write: (T) -> JSONObject) {
        val a = JSONArray()
        items.take(max).forEach { a.put(write(it)) }
        p.edit().putString(key, a.toString()).apply()
    }
}
