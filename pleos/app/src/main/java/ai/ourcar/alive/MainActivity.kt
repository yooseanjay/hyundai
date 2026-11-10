package ai.ourcar.alive

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import java.io.IOException

/**
 * 우리 차가 살아있다면 — Pleos Connect 차 안 앱.
 *
 * 웹 앱(npm run build:pleos 결과)을 앱 안에 넣어 두고 WebView로 띄운다.
 * - 앱 안 파일을 https://yooseanjay.github.io/hyundai/ 주소로 내보냄(WebViewAssetLoader).
 *   → 인터넷 없이도 화면이 열리고, 대화 AI 서버가 이미 허용한 주소라 서버 설정을 바꿀 필요가 없다.
 * - window.PleosVehicle: 차 상태 읽기 전용 다리 (VehicleBridge)
 * - 앱 주소 밖으로 나가는 링크(카카오맵·네이버 지도·Spotify)는 WebView 안에서 열지 않고 다른 앱으로 넘김
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var bridge: VehicleBridge
    private var pendingWebPermission: PermissionRequest? = null
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null

    private val askMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingWebPermission?.let { req -> if (granted) req.grant(req.resources) else req.deny() }
        pendingWebPermission = null
    }

    private val askLocation = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        pendingGeo?.let { (origin, cb) -> cb.invoke(origin, result.values.any { it }, false) }
        pendingGeo = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bridge = VehicleBridge(this).also { it.start() }

        val assets = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler(BASE_PATH, WebAssets())
            .build()

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setGeolocationEnabled(true)
            addJavascriptInterface(bridge, "PleosVehicle")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assets.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url
                    if (url.host == HOST && url.path.orEmpty().startsWith(BASE_PATH)) return false
                    openOutside(url)
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    // 우리 화면에서 마이크만 허용 (카메라 등은 거절)
                    val micOnly = request.resources.all { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
                    if (request.origin.host != HOST || !micOnly) return request.deny()
                    if (has(Manifest.permission.RECORD_AUDIO)) return request.grant(request.resources)
                    pendingWebPermission = request
                    askMic.launch(Manifest.permission.RECORD_AUDIO)
                }

                override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                    if (Uri.parse(origin).host != HOST) return callback.invoke(origin, false, false)
                    if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                        return callback.invoke(origin, true, false)
                    }
                    pendingGeo = origin to callback
                    askLocation.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                }
            }
        }
        setContentView(web)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState == null) web.loadUrl("https://$HOST${BASE_PATH}index.html") else web.restoreState(savedInstanceState)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        bridge.refreshNow()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        bridge.stop()
        web.destroy()
        super.onDestroy()
    }

    private fun has(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    private fun openOutside(url: Uri) {
        if (url.scheme != "https" && url.scheme != "http") return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, url))
        } catch (_: ActivityNotFoundException) {
            // 이 차에 링크를 열 앱이 없으면 조용히 무시
        }
    }

    /** assets/web/ 아래 파일을 내보냄. 경로에 ..가 들어오면 거절 */
    private inner class WebAssets : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            val clean = path.ifEmpty { "index.html" }
            if (clean.contains("..")) return null
            return try {
                WebResourceResponse(mimeOf(clean), null, assets.open("web/$clean"))
            } catch (_: IOException) {
                null
            }
        }
    }

    private fun mimeOf(path: String) = when (path.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "png" -> "image/png"
        "svg" -> "image/svg+xml"
        "glb" -> "model/gltf-binary"
        "wasm" -> "application/wasm"
        "woff2" -> "font/woff2"
        else -> "application/octet-stream"
    }

    private companion object {
        const val HOST = "yooseanjay.github.io"
        const val BASE_PATH = "/hyundai/"
    }
}
