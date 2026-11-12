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
import ai.pleos.playground.tts.TextToSpeech as GleoTts
import ai.pleos.playground.tts.constant.ErrorType as TtsErrorType
import ai.pleos.playground.tts.constant.Mode as TtsMode
import ai.pleos.playground.tts.listener.EventListener as TtsEventListener
import ai.pleos.playground.tts.listener.OnInitializeListener as TtsInitListener
import java.util.Locale

/**
 * 차 음성: 듣기(STT) · 읽어 주기(TTS) — 둘 다 글레오 AI(Pleos SDK), 차 안(ON_DEVICE)
 *
 * 읽어 주기는 Pleos TextToSpeech SDK(글레오 목소리). 차에 없으면(폰 등) 안드로이드 기본 음성으로.
 * 듣기는 Pleos SpeechToText SDK만 씀 (공모전 규정: 차량 마이크 음성을 외부 음성 인식 서비스로 보내지 않음).
 * ON_DEVICE 모드라 음성이 차 밖으로 나가지 않고, 앱 등록도 필요 없음.
 * 웹 앱과 주고받는 메시지 모양(stt start · partial · final · end · error)은 그대로.
 */
class CarVoice(private val context: Context, private val send: (JSONObject) -> Unit) {

    private val main = Handler(Looper.getMainLooper())

    // ───────── 읽어 주기 ─────────
    // 글레오 목소리: 한 번에 한 문장씩 차례로 (SDK에 문장 id가 없어서 앱이 줄을 세움)
    private val gleo: GleoTts? = runCatching { GleoTts(context.applicationContext, TtsMode.ON_DEVICE) }.getOrNull()
    private var gleoReady = false
    private var gleoFailed = gleo == null
    private val gleoQueue = ArrayDeque<Pair<String, String>>()
    private var gleoNow: String? = null
    private var ignoreStopUntil = 0L

    private fun gleoFinish() {
        val id = gleoNow ?: return
        gleoNow = null
        ttsEvent(id, "end")
        gleoNext()
    }

    private fun gleoNext() {
        if (gleoNow != null || !gleoReady) return
        val (id, text) = gleoQueue.removeFirstOrNull() ?: return
        gleoNow = id
        // 끝 신호가 빠져도 멈추지 않게: 문장 길이만큼 지나면 끝난 것으로
        main.postDelayed({ if (gleoNow == id) gleoFinish() }, 8_000L + text.length * 300L)
        runCatching { gleo!!.speak(text, true) }.onFailure { gleoFinish() }
    }

    private val gleoEvents = object : TtsEventListener {
        override fun onStart() { main.post { gleoNow?.let { ttsEvent(it, "start") } } }
        override fun onReady() = Unit
        override fun onDone() { main.post { gleoFinish() } }
        override fun onError(errorType: TtsErrorType) { main.post { gleoFinish() } }
        override fun onStop() { main.post { if (System.currentTimeMillis() > ignoreStopUntil) gleoFinish() } }
        override fun onUpdatedRms(rms: Double) = Unit
    }

    init {
        runCatching {
            gleo!!.initialize(object : TtsInitListener {
                override fun onSuccess() {
                    main.post {
                        // initialize 가 끝난 뒤에 리스너를 붙여야 함
                        runCatching { gleo.addEventListener(gleoEvents); gleo.setLocale(Locale.KOREA) }
                        gleoReady = true
                        gleoNext()
                    }
                }
                override fun onFailure(errorType: TtsErrorType) { main.post { gleoGiveUp() } }
            })
        }.onFailure { gleoGiveUp() }
    }

    /** 글레오 목소리를 못 쓰는 기기 → 기다리던 문장은 안드로이드 기본 음성으로 */
    private fun gleoGiveUp() {
        gleoFailed = true
        gleoReady = false
        val left = gleoQueue.toList()
        gleoQueue.clear()
        left.forEach { (id, text) -> speak(id, text, 1f, 1f) }
    }

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

    val engineName: String get() = if (!gleoFailed) "gleo" else if (ttsReady) (tts.defaultEngine ?: "android") else "android"

    private fun ttsEvent(id: String, event: String) =
        send(JSONObject().put("type", "tts").put("event", event).put("id", id))

    fun speak(id: String, text: String, pitch: Float, rate: Float) {
        if (!gleoFailed) {
            main.post {
                if (gleoFailed) return@post speak(id, text, pitch, rate)
                gleoQueue.addLast(id to text)
                gleoNext()
            }
            return
        }
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

    fun stopSpeaking() = main.post {
        gleoQueue.clear()
        if (gleoNow != null) {
            gleoNow = null
            ignoreStopUntil = System.currentTimeMillis() + 800 // 이 stop 에 대한 onStop 은 다음 문장을 끊지 않게
            runCatching { gleo?.stop() }
        }
        if (ttsReady) tts.stop()
    }

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
            gleoQueue.clear()
            gleoNow = null
            runCatching { gleo?.stop(); gleo?.release() }
            tts.stop()
            tts.shutdown()
        }
    }
}
