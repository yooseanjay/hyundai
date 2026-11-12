package io.github.yooseanjay.ourcaralive

import ai.pleos.playground.vehicle.Vehicle
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.lang.reflect.Method
import java.lang.reflect.Modifier
import java.lang.reflect.Proxy

/**
 * Pleos Vehicle SDK 전체(19개 도메인)를 웹 화면에서 쓰게 해 주는 통로
 *
 *  - schema: 차에 실제로 있는 도메인 · 함수 · 매개변수 모양을 SDK에서 직접 읽어 웹으로 보냄
 *    (공식 예제 pleos-sample-vehicle-app처럼 리플렉션으로 공개 API만 찾음 — 함수 이름은 공개 API 레퍼런스와 같음)
 *  - call:   웹이 고른 함수를 부름. 콜백(성공 · 실패)과 리스너는 여기서 만들어 끼우고 결과를 웹으로 돌려줌
 *  - event:  register… 로 구독한 상태 변화가 오면 웹으로 흘려 보냄. unregister… 는 같은 리스너를 찾아 해제
 *
 * 제어(set · move · select)는 [controlAllowed]일 때만. 출시(release) 빌드는 기본으로 막혀 있음(읽기 전용).
 */
class VehicleHub(
    private val vehicleProvider: () -> Vehicle?,
    private val controlAllowed: Boolean,
    private val send: (JSONObject) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())

    /** 도메인 이름(Door, HVAC …) → 도메인 객체 */
    private val domains = LinkedHashMap<String, Any>()
    /** "Door.registerDoorLockState" → 끼워 둔 리스너 · 콜백들 (unregister 때 같은 것을 넘김) */
    private val listeners = HashMap<String, List<Any?>>()

    private fun loadDomains(): Boolean {
        if (domains.isNotEmpty()) return true
        val v = vehicleProvider() ?: return false
        for (m in v.javaClass.methods.sortedBy { it.name }) {
            if (m.parameterTypes.isNotEmpty() || !m.name.startsWith("get") || m.name == "getClass") continue
            val type = m.returnType
            if (type.isPrimitive || type.name.startsWith("java.") || type.name.startsWith("kotlin.")) continue
            val obj = runCatching { m.invoke(v) }.getOrNull() ?: continue
            domains[m.name.removePrefix("get")] = obj
        }
        return domains.isNotEmpty()
    }

    // ───────── 함수 목록 ─────────

    private fun kindOf(name: String): String = when {
        name.startsWith("check") && name.endsWith("Capabilities") -> "capability"
        name.startsWith("unregister") -> "unregister"
        name.startsWith("register") -> "register"
        name.startsWith("set") || name.startsWith("move") || name.startsWith("select") -> "set"
        name.startsWith("get") || name.startsWith("has") || name.startsWith("is") -> "get"
        else -> "other"
    }

    private fun apiMethods(obj: Any): List<Method> =
        obj.javaClass.methods
            .filter { it.declaringClass != Any::class.java && Modifier.isPublic(it.modifiers) && kindOf(it.name) != "other" }
            .filter { !it.isAnnotationPresent(java.lang.Deprecated::class.java) && !it.isAnnotationPresent(Deprecated::class.java) }
            .sortedWith(compareBy({ it.name }, { it.parameterTypes.size }))

    private fun isCallback(t: Class<*>) = t.name.startsWith("kotlin.jvm.functions.Function")
    private fun isListener(t: Class<*>) = t.isInterface && !isCallback(t) && !t.name.startsWith("java.")

    private fun paramSchema(t: Class<*>): JSONObject {
        val o = JSONObject().put("type", t.simpleName)
        when {
            isCallback(t) -> o.put("kind", "callback")
            isListener(t) -> o.put("kind", "listener").put("events", JSONArray(t.methods.map { it.name }.distinct().sorted()))
            t == java.lang.Boolean.TYPE || t == java.lang.Boolean::class.java -> o.put("kind", "bool")
            t == Integer.TYPE || t == Integer::class.java || t == java.lang.Long.TYPE || t == java.lang.Long::class.java ||
                t == java.lang.Short.TYPE || t == java.lang.Byte.TYPE -> o.put("kind", "int")
            t == java.lang.Float.TYPE || t == java.lang.Float::class.java || t == java.lang.Double.TYPE || t == java.lang.Double::class.java -> o.put("kind", "float")
            t == String::class.java -> o.put("kind", "string")
            t.isEnum -> o.put("kind", "enum").put("values", JSONArray(t.enumConstants!!.map { (it as Enum<*>).name }))
            t == IntArray::class.java -> o.put("kind", "int[]")
            else -> o.put("kind", "unknown")
        }
        return o
    }

    fun schema() = main.post {
        val out = JSONObject().put("type", "vehicle-schema").put("control", controlAllowed)
        if (!loadDomains()) return@post send(out.put("ready", false).put("domains", JSONObject()))
        val ds = JSONObject()
        for ((name, obj) in domains) {
            val arr = JSONArray()
            for (m in apiMethods(obj)) {
                arr.put(
                    JSONObject()
                        .put("name", m.name)
                        .put("kind", kindOf(m.name))
                        .put("params", JSONArray(m.parameterTypes.map { paramSchema(it) }))
                )
            }
            ds.put(name, arr)
        }
        send(out.put("ready", true).put("domains", ds))
    }

    // ───────── 부르기 ─────────

    /** 웹이 보낸 값 → 매개변수 타입. 콜백 · 리스너 자리는 null(아래에서 채움) */
    private fun convert(t: Class<*>, v: Any?): Any? {
        if (v == null || v == JSONObject.NULL) return null
        return when {
            t == java.lang.Boolean.TYPE || t == java.lang.Boolean::class.java -> v == true || v == "true" || v == 1
            t == Integer.TYPE || t == Integer::class.java -> (v as? Number)?.toInt() ?: v.toString().toInt()
            t == java.lang.Long.TYPE || t == java.lang.Long::class.java -> (v as? Number)?.toLong() ?: v.toString().toLong()
            t == java.lang.Short.TYPE -> (v as Number).toShort()
            t == java.lang.Byte.TYPE -> (v as Number).toByte()
            t == java.lang.Float.TYPE || t == java.lang.Float::class.java -> (v as? Number)?.toFloat() ?: v.toString().toFloat()
            t == java.lang.Double.TYPE || t == java.lang.Double::class.java -> (v as? Number)?.toDouble() ?: v.toString().toDouble()
            t == String::class.java -> v.toString()
            t.isEnum -> t.enumConstants!!.first { (it as Enum<*>).name == v.toString() }
            t == IntArray::class.java -> (v as JSONArray).let { a -> IntArray(a.length()) { a.getInt(it) } }
            else -> throw IllegalArgumentException("${t.simpleName} 값은 아직 못 넘겨요")
        }
    }

    /** 콜백: 첫 번째는 성공(onComplete), 그다음은 실패(onFailed)로 봄 */
    private fun callback(t: Class<*>, index: Int, onOk: (List<Any?>) -> Unit, onFail: (Any?) -> Unit): Any {
        val fire: (List<Any?>) -> Unit = { args -> if (index == 0) onOk(args) else onFail(args.firstOrNull()) }
        val f0: () -> Unit = { fire(emptyList()) }
        val f1: (Any?) -> Unit = { a -> fire(listOf(a)) }
        val f2: (Any?, Any?) -> Unit = { a, b -> fire(listOf(a, b)) }
        val f3: (Any?, Any?, Any?) -> Unit = { a, b, c -> fire(listOf(a, b, c)) }
        val f4: (Any?, Any?, Any?, Any?) -> Unit = { a, b, c, d -> fire(listOf(a, b, c, d)) }
        return when (t.name) {
            "kotlin.jvm.functions.Function0" -> f0
            "kotlin.jvm.functions.Function1" -> f1
            "kotlin.jvm.functions.Function2" -> f2
            "kotlin.jvm.functions.Function3" -> f3
            "kotlin.jvm.functions.Function4" -> f4
            else -> throw IllegalArgumentException("콜백 모양 ${t.simpleName}")
        }
    }

    /** 리스너 인터페이스: 어떤 함수가 불려도 그 이름과 값을 웹으로 보냄 */
    private fun listener(t: Class<*>, domain: String, from: String): Any =
        Proxy.newProxyInstance(t.classLoader, arrayOf(t)) { proxy, m, args ->
            when (m.name) {
                "equals" -> proxy === args?.getOrNull(0)
                "hashCode" -> System.identityHashCode(proxy)
                "toString" -> "VehicleHubListener($domain.$from)"
                else -> {
                    event(domain, from, m.name, args?.toList() ?: emptyList())
                    defaultReturn(m.returnType)
                }
            }
        }

    private fun defaultReturn(t: Class<*>): Any? = when (t) {
        java.lang.Boolean.TYPE -> false
        Integer.TYPE, java.lang.Long.TYPE, java.lang.Short.TYPE, java.lang.Byte.TYPE -> 0
        java.lang.Float.TYPE, java.lang.Double.TYPE -> 0.0
        else -> null
    }

    private fun event(domain: String, from: String, name: String, args: List<Any?>) {
        val o = JSONObject().put("type", "vehicle-event").put("domain", domain).put("from", from).put("event", name)
            .put("args", JSONArray(args.map { toJson(it) }))
        main.post { send(o) }
    }

    private fun result(id: String, ok: Boolean, value: Any? = null, error: String? = null) {
        val o = JSONObject().put("type", "vehicle-result").put("id", id).put("ok", ok)
        if (value != null) o.put("value", value)
        if (error != null) o.put("error", error)
        main.post { send(o) }
    }

    fun call(id: String, domain: String, method: String, args: JSONArray) = main.post {
        val kind = kindOf(method)
        if (kind == "set" && !controlAllowed) return@post result(id, false, error = "control-disabled")
        if (!loadDomains()) return@post result(id, false, error = "vehicle-unavailable")
        val obj = domains[domain] ?: return@post result(id, false, error = "no-domain")
        // 같은 이름이 여러 개면, 웹이 준 값 개수와 맞는 것
        val given = args.length()
        val candidates = apiMethods(obj).filter { it.name == method }
        val m = candidates.firstOrNull { c -> c.parameterTypes.count { !isCallback(it) && !isListener(it) } == given }
            ?: candidates.firstOrNull()
            ?: return@post result(id, false, error = "no-method")

        val key = "$domain.${method.replaceFirst("unregister", "register")}"
        try {
            var userIdx = 0
            var cbIdx = 0
            val nCb = m.parameterTypes.count { isCallback(it) }
            // set 은 보통 실패 콜백(onFailed) 하나만 받음 → 그 하나는 실패용
            val onlyFailure = kind == "set" && nCb == 1
            var done = false
            val finish: (Boolean, Any?, String?) -> Unit = { ok, v, e -> if (!done) { done = true; result(id, ok, v, e) } }
            val held = ArrayList<Any>()
            val values = m.parameterTypes.map { t ->
                when {
                    kind == "unregister" && (isCallback(t) || isListener(t)) ->
                        listeners[key]?.firstOrNull { it != null && t.isInstance(it) }
                    isListener(t) -> listener(t, domain, method).also { held += it }
                    isCallback(t) -> {
                        val i = cbIdx++
                        val cb = if (kind == "register" && i == 0) {
                            // 구독 콜백: 값이 올 때마다 이벤트로
                            callback(t, 0, { a -> event(domain, method, "onChange", a) }, {})
                        } else {
                            callback(t, if (i == 0 && !onlyFailure) 0 else 1,
                                { a -> finish(true, toJson(if (a.size == 1) a[0] else a), null) },
                                { e -> finish(false, null, errorText(e)) })
                        }
                        cb.also { held += it }
                    }
                    else -> convert(t, if (userIdx < given) args.opt(userIdx++) else null)
                }
            }
            val ret = m.invoke(obj, *values.toTypedArray())
            when (kind) {
                "register" -> { listeners[key] = held; finish(true, "subscribed", null) }
                "unregister" -> { listeners.remove(key); finish(true, "unsubscribed", null) }
                // 성공 콜백이 없는 set: 보낸 것 자체를 성공으로 (차가 거절하면 같은 id로 error 결과가 한 번 더 감)
                "set" -> if (nCb == 0 || onlyFailure) { result(id, true, toJson(ret).takeIf { it != JSONObject.NULL } ?: "sent") }
                else -> if (m.returnType != Void.TYPE && ret != null) finish(true, toJson(ret), null)
            }
        } catch (e: Throwable) {
            val cause = (e as? java.lang.reflect.InvocationTargetException)?.targetException ?: e
            Log.w(TAG, "$domain.$method 실패", cause)
            result(id, false, error = cause.javaClass.simpleName + ": " + (cause.message ?: ""))
        }
    }

    private fun errorText(e: Any?): String = when (e) {
        null -> "failed"
        is Throwable -> e.javaClass.simpleName + ": " + (e.message ?: "")
        else -> e.toString().take(300)
    }

    // ───────── 값 → JSON ─────────

    private fun toJson(v: Any?, depth: Int = 0): Any? = when (v) {
        null -> JSONObject.NULL
        is Unit -> JSONObject.NULL
        is Number, is Boolean, is String -> v
        is Char -> v.toString()
        is Enum<*> -> v.name
        is Map<*, *> -> JSONObject().also { o -> v.forEach { (k, x) -> o.put(k.toString(), toJson(x, depth + 1)) } }
        is Iterable<*> -> JSONArray(v.map { toJson(it, depth + 1) })
        is Array<*> -> JSONArray(v.map { toJson(it, depth + 1) })
        is IntArray -> JSONArray(v.toList())
        is FloatArray -> JSONArray(v.toList())
        is BooleanArray -> JSONArray(v.toList())
        is LongArray -> JSONArray(v.toList())
        else -> if (depth >= 3) v.toString().take(200) else objectToJson(v, depth)
    }

    /** 데이터 객체: 공개 getter(getX · isX)를 모두 읽어 { x: … } */
    private fun objectToJson(v: Any, depth: Int): Any {
        val o = JSONObject()
        for (m in v.javaClass.methods) {
            if (m.parameterTypes.isNotEmpty() || m.declaringClass == Any::class.java || m.name == "getClass") continue
            val prop = when {
                m.name.startsWith("get") && m.name.length > 3 -> m.name.substring(3).replaceFirstChar { it.lowercase() }
                m.name.startsWith("is") && m.name.length > 2 -> m.name.substring(2).replaceFirstChar { it.lowercase() }
                else -> continue
            }
            runCatching { o.put(prop, toJson(m.invoke(v), depth + 1)) }
        }
        return if (o.length() == 0) v.toString().take(200) else o
    }

    /** 메인 스레드(onDestroy)에서 바로 부름 — SDK 를 닫기 전에 구독부터 해제 */
    fun release() {
        // 구독한 것은 모두 해제
        for (key in listeners.keys.toList()) {
            val (domain, reg) = key.split(".", limit = 2)
            val obj = domains[domain] ?: continue
            val un = reg.replaceFirst("register", "unregister")
            val held = listeners[key] ?: continue
            apiMethods(obj).filter { it.name == un }.forEach { m ->
                runCatching {
                    m.invoke(obj, *m.parameterTypes.map { t -> held.firstOrNull { it != null && t.isInstance(it) } }.toTypedArray())
                }
            }
        }
        listeners.clear()
        domains.clear()
    }

    private companion object { const val TAG = "VehicleHub" }
}
