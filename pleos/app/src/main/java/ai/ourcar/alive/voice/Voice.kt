package ai.ourcar.alive.voice

import ai.pleos.playground.tts.TextToSpeech
import ai.pleos.playground.tts.constant.ErrorType
import ai.pleos.playground.tts.constant.Mode
import ai.pleos.playground.tts.listener.OnInitializeListener
import android.content.Context
import android.util.Log
import java.util.Locale

/**
 * 캐릭터 목소리: Pleos TextToSpeech SDK (차 안에서 바로 도는 ON_DEVICE 모드, 별도 키 필요 없음).
 * Pleos 차가 아니면 조용히 아무것도 하지 않는다.
 */
class Voice(context: Context) {

    private val tts = runCatching { TextToSpeech(context.applicationContext, Mode.ON_DEVICE) }.getOrNull()
    @Volatile private var ready = false

    fun start() {
        val t = tts ?: return
        runCatching {
            t.initialize(object : OnInitializeListener {
                override fun onSuccess() {
                    runCatching { t.setLocale(Locale.KOREAN) }
                    ready = true
                }
                override fun onFailure(type: ErrorType) {
                    Log.w(TAG, "TTS 준비 실패: $type")
                }
            })
        }.onFailure { Log.w(TAG, "TTS 사용 불가", it) }
    }

    fun speak(text: String) {
        if (!ready) return
        runCatching { tts?.speak(text, true) }.onFailure { Log.w(TAG, "말하기 실패", it) }
    }

    fun stop() = runCatching { tts?.stop() }.let { }

    fun release() {
        ready = false
        runCatching { tts?.release() }
    }

    private companion object { const val TAG = "OurCarVoice" }
}
