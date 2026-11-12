package io.github.yooseanjay.ourcaralive

import ai.pleos.playground.stt.SpeechToText
import ai.pleos.playground.stt.constant.ErrorType
import ai.pleos.playground.stt.constant.Mode
import ai.pleos.playground.stt.listener.OnInitializeListener
import ai.pleos.playground.stt.listener.ResultListener
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONObject
import java.util.Locale

/**
 * 차 음성: 듣기(STT) · 읽어 주기(TTS)
 *
 * 듣기는 Pleos SpeechToText SDK만 씀 (공모전 규정: 차량 마이크 음성을 외부 음성 인식 서비스로 보내지 않음).
 * ON_DEVICE 모드라 음성이 차 밖으로 나가지 않고, 앱 등록도 필요 없음.
 * 웹 앱과 주고받는 메시지 모양(stt start · partial · final · end · error)은 그대로.
 */
class CarVoice(private val context: Context, private val send: (JSONObject) -> Unit) {

    private val main = Handler(Looper.getMainLooper())

    // ───────── 읽어 주기 ─────────
    private var ttsReady = false
    private val waiting = ArrayList<() -> Unit>()
    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        main.post {
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) tts.language = Locale.KOREAN
            waiting.forEach { it() }
            waiting.clear()
        }
    }.also {
        it.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String) = ttsEvent(id, "start")
            override fun onDone(id: String) = ttsEvent(id, "end")
            @Deprecated("Deprecated in Java")
            override fun onError(id: String) = ttsEvent(id, "end")
            override fun onError(id: String, errorCode: Int) = ttsEvent(id, "end")
            override fun onStop(id: String, interrupted: Boolean) = ttsEvent(id, "end")
        })
    }

    val engineName: String get() = if (ttsReady) (tts.defaultEngine ?: "android") else "android"

    private fun ttsEvent(id: String, event: String) =
        send(JSONObject().put("type", "tts").put("event", event).put("id", id))

    fun speak(id: String, text: String, pitch: Float, rate: Float) {
        val run: () -> Unit = {
            if (!ttsReady) {
                ttsEvent(id, "end")
            } else {
                tts.setPitch(pitch)
                tts.setSpeechRate(rate)
                tts.speak(text, TextToSpeech.QUEUE_ADD, Bundle(), id)
            }
        }
        main.post { if (ttsReady) run() else waiting += run }
    }

    fun stopSpeaking() = main.post { if (ttsReady) tts.stop() }

    // ───────── 듣기 (Pleos SpeechToText SDK) ─────────
    private val stt = SpeechToText(context.applicationContext, Mode.ON_DEVICE)
    private var sttReady = false
    private var sttFailed = false
    private var pendingListen: (() -> Unit)? = null
    private var wantPartial = true
    private var listening = false

    /** SDK 초기화가 실패한 기기(차가 아닌 폰 등)에서는 듣기 없음 */
    val canListen: Boolean get() = !sttFailed

    private fun sttEvent(event: String, text: String? = null, error: String? = null) {
        val o = JSONObject().put("type", "stt").put("event", event)
        text?.let { o.put("text", it) }
        error?.let { o.put("error", it) }
        send(o)
    }

    private val resultListener = object : ResultListener {
        override fun onReady() = Unit
        override fun onStartedRecognition() { main.post { if (listening) sttEvent("start") } }
        override fun onUpdated(stt: String, completed: Boolean) {
            main.post {
                if (!listening) return@post
                if (completed) sttEvent("final", stt) else if (wantPartial) sttEvent("partial", stt)
            }
        }
        override fun onUpdatedEpdData(on: Long, off: Long) = Unit
        override fun onUpdatedRms(rms: Double) = Unit
        override fun onEndedRecognition() {
            main.post { if (listening) { listening = false; sttEvent("end") } }
        }
        override fun onError(errorType: ErrorType) {
            main.post {
                if (!listening) return@post
                listening = false
                sttEvent("error", error = when (errorType) {
                    ErrorType.PERMISSION_DENIED -> "not-allowed"
                    ErrorType.MIC_ERROR, ErrorType.AUDIO_ERROR -> "audio-capture"
                    ErrorType.INVALID_REQUEST_ERROR -> "aborted"
                    ErrorType.UNAVAILABLE_LANGUAGE -> "language-not-supported"
                    ErrorType.NOT_SUPPORTED_API, ErrorType.UNAUTHENTICATED -> "service-not-allowed"
                    ErrorType.TIMEOUT -> "no-speech"
                    else -> "network"
                })
            }
        }
    }

    init {
        runCatching {
            stt.initialize(object : OnInitializeListener {
                override fun onSuccess() {
                    main.post {
                        sttReady = true
                        stt.addListener(resultListener)
                        pendingListen?.invoke()
                        pendingListen = null
                    }
                }
                override fun onFailure(errorType: ErrorType) {
                    main.post {
                        sttFailed = true
                        if (pendingListen != null) {
                            pendingListen = null
                            sttEvent("error", error = "service-not-allowed")
                        }
                    }
                }
            })
        }.onFailure { sttFailed = true }
    }

    /** 한 문장 듣기. 계속 듣기(호출어)는 웹이 끝날 때마다 다시 부름. 언어는 차 설정(한국어)을 따름 */
    @Suppress("UNUSED_PARAMETER")
    fun listen(lang: String, partial: Boolean) = main.post {
        if (sttFailed) return@post sttEvent("error", error = "service-not-allowed")
        val run = {
            wantPartial = partial
            if (listening) runCatching { stt.stop() }
            listening = true
            runCatching { stt.request() }.onFailure {
                listening = false
                sttEvent("error", error = "aborted")
            }
            Unit
        }
        if (sttReady) run() else pendingListen = run
    }

    fun stopListening() = main.post {
        pendingListen = null
        if (sttReady && listening) runCatching { stt.stop() }
    }

    fun release() {
        main.post {
            pendingListen = null
            listening = false
            runCatching {
                if (sttReady) { stt.stop(); stt.removeListener(resultListener) }
                stt.release()
            }
            tts.stop()
            tts.shutdown()
        }
    }
}
