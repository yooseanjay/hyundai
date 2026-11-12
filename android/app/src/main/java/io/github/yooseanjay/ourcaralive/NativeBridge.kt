package io.github.yooseanjay.ourcaralive

import android.Manifest
import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * 웹 앱 ↔ 차 통로 (웹 쪽: src/pleos/native.ts)
 *
 * 웹 → 차   { type: 'hello' | 'listen' | 'listen-stop' | 'speak' | 'speak-stop' | 'vehicle-schema' | 'vehicle-call' }
 * 차 → 웹   { type: 'caps' | 'vehicle' | 'stt' | 'tts' | 'vehicle-schema' | 'vehicle-result' | 'vehicle-event' }
 *
 * addWebMessageListener 는 허용한 출처(appOrigin)의 메인 프레임에만 'pleosNative' 를 넣어 줌
 * → 다른 사이트나 안에 들어간 iframe(Spotify 등)은 이 통로를 볼 수 없음.
 * 주고받는 건 글자(JSON)뿐. 차 제어(set · move · select)는 BuildConfig.VEHICLE_CONTROL 인 빌드(디버그)에서만 받음.
 */
class NativeBridge(
    private val activity: Activity,
    private val web: WebView,
    private val appOrigin: String,
    private val requestPermissions: (Array<String>, (Boolean) -> Unit) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private var reply: JavaScriptReplyProxy? = null

    private val vehicle = VehicleReader(activity) { values ->
        send(JSONObject().put("type", "vehicle").put("values", JSONObject(values)))
    }
    private val voice = CarVoice(activity) { msg -> send(msg) }
    private val hub = VehicleHub({ vehicle.vehicleOrNull() }, BuildConfig.VEHICLE_CONTROL) { msg -> send(msg) }

    fun attach() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(web, "pleosNative", setOf(appOrigin)) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            if (!isMainFrame || sourceOrigin.toString().trimEnd('/') != appOrigin) return@addWebMessageListener
            reply = replyProxy
            message.data?.let { handle(it) }
        }
    }

    private fun handle(raw: String) {
        val m = runCatching { JSONObject(raw) }.getOrNull() ?: return
        when (m.optString("type")) {
            "hello" -> {
                send(
                    JSONObject()
                        .put("type", "caps")
                        .put("vehicle", vehicle.available)
                        .put("stt", voice.canListen)
                        .put("tts", true)
                        .put("engine", voice.engineName)
                        .put("app", BuildConfig.VERSION_NAME)
                )
                vehicle.start()
            }
            "listen" -> requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO)) { ok ->
                if (ok) voice.listen(m.optString("lang", "ko-KR"), m.optBoolean("partial", true))
                else send(JSONObject().put("type", "stt").put("event", "error").put("error", "not-allowed"))
            }
            "listen-stop" -> voice.stopListening()
            "speak" -> voice.speak(
                id = m.optString("id").take(32),
                text = m.optString("text").take(2000),
                pitch = m.optDouble("pitch", 1.0).toFloat().coerceIn(0.5f, 2f),
                rate = m.optDouble("rate", 1.0).toFloat().coerceIn(0.5f, 2f),
            )
            "speak-stop" -> voice.stopSpeaking()
            // 차량 SDK 전체: 함수 목록 · 부르기(읽기 · 구독, 디버그 빌드는 제어까지)
            "vehicle-schema" -> hub.schema()
            "vehicle-call" -> hub.call(
                id = m.optString("id").take(40),
                domain = m.optString("domain").take(40),
                method = m.optString("method").take(80),
                args = m.optJSONArray("args") ?: org.json.JSONArray(),
            )
        }
    }

    private fun send(msg: JSONObject) {
        main.post { runCatching { reply?.postMessage(msg.toString()) } }
    }

    fun resume() = vehicle.resume()
    fun pause() { vehicle.pause(); voice.stopListening() }

    fun release() {
        hub.release()
        vehicle.release()
        voice.release()
    }
}
