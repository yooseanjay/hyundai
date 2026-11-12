package io.github.yooseanjay.ourcaralive

import ai.pleos.playground.llm.LLM
import ai.pleos.playground.llm.constant.Mode
import ai.pleos.playground.llm.listener.ResultListener
import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

/**
 * 글레오 AI 대답 (Pleos LLM SDK, 42dot 언어 모델) — 차 안(ON_DEVICE)에서 문장을 만듦
 *
 * 웹 → 차  { type: 'llm-ask', id, prompt }
 * 차 → 웹  { type: 'llm-result', id, ok, text? | error? }
 *
 * 차에서 언어 모델이 꺼져 있거나 실패하면 ok=false → 웹이 Gemini · 규칙 대답으로 넘어감.
 */
class GleoBrain(context: Context, private val send: (JSONObject) -> Unit) {

    private val main = Handler(Looper.getMainLooper())
    private val llm: LLM? = runCatching { LLM(context.applicationContext, Mode.ON_DEVICE).also { it.initialize() } }.getOrNull()

    /** SDK가 차에 있음 (실제로 대답하는지는 물어봐야 앎) */
    val available: Boolean get() = llm != null

    private var current: String? = null

    private fun result(id: String, text: String?, error: String? = null) {
        if (current != id) return
        current = null
        val o = JSONObject().put("type", "llm-result").put("id", id).put("ok", text != null)
        if (text != null) o.put("text", text) else o.put("error", error ?: "failed")
        send(o)
    }

    fun ask(id: String, prompt: String) = main.post {
        val model = llm ?: return@post send(JSONObject().put("type", "llm-result").put("id", id).put("ok", false).put("error", "unavailable"))
        current?.let { result(it, null, "replaced") } // 한 번에 하나만
        current = id
        val buf = StringBuilder()
        main.postDelayed({ result(id, null, "timeout") }, 15_000)
        runCatching {
            model.generateContent(prompt, object : ResultListener {
                override fun onResponse(text: String, isFinal: Boolean) {
                    main.post {
                        if (current != id) return@post
                        // 조각으로 오든 누적으로 오든 같은 결과가 되게
                        if (text.startsWith(buf)) { buf.setLength(0); buf.append(text) } else buf.append(text)
                        if (isFinal) buf.toString().trim().let { result(id, it.ifEmpty { null }, "empty") }
                    }
                }
                override fun onError(message: String) { main.post { result(id, null, message.take(200)) } }
            })
        }.onFailure { result(id, null, it.javaClass.simpleName) }
    }

    fun release() {
        current = null
        runCatching { llm?.release() }
    }
}
