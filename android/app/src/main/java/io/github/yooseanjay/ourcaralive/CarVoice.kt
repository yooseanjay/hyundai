package io.github.yooseanjay.ourcaralive

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONObject
import java.util.Locale

/**
 * 차 음성: 듣기(STT) · 읽어 주기(TTS)
 *
 * 지금은 차(안드로이드)에 들어 있는 기본 음성 엔진을 씀.
 * Gleo AI 음성 SDK(Pleos SpeechToText · TextToSpeech)가 Pleos Playground에서 열리면
 * 이 클래스 안만 그 SDK로 바꾸면 됨 — 웹 앱과 주고받는 메시지 모양은 그대로.
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
        val run = {
            if (!ttsReady) ttsEvent(id, "end")
            else {
                tts.setPitch(pitch)
                tts.setSpeechRate(rate)
                tts.speak(text, TextToSpeech.QUEUE_ADD, Bundle(), id)
            }
        }
        main.post { if (ttsReady) run() else waiting += run }
    }

    fun stopSpeaking() = main.post { if (ttsReady) tts.stop() }

    // ───────── 듣기 ─────────
    val canListen: Boolean get() = SpeechRecognizer.isRecognitionAvailable(context)
    private var recognizer: SpeechRecognizer? = null

    private fun stt(event: String, text: String? = null, error: String? = null) {
        val o = JSONObject().put("type", "stt").put("event", event)
        text?.let { o.put("text", it) }
        error?.let { o.put("error", it) }
        send(o)
    }

    /** 한 문장 듣기. 계속 듣기(호출어)는 웹이 끝날 때마다 다시 부름 */
    fun listen(lang: String, partial: Boolean) = main.post {
        if (!canListen) return@post stt("error", error = "service-not-allowed")
        recognizer?.destroy()
        val r = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = stt("start")
            override fun onPartialResults(b: Bundle?) {
                b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { stt("partial", it) }
            }
            override fun onResults(b: Bundle?) {
                b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { stt("final", it) }
                stt("end")
            }
            override fun onError(code: Int) {
                stt("error", error = when (code) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT -> "aborted"
                    SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
                    else -> "network"
                })
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        r.startListening(intent)
    }

    fun stopListening() = main.post { recognizer?.stopListening() }

    fun release() {
        main.post {
            recognizer?.destroy()
            recognizer = null
            tts.stop()
            tts.shutdown()
        }
    }
}
