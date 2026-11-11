package io.github.yooseanjay.ourcaralive

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

/**
 * Pleos Connect 앱: "우리 차가 살아있다면" 웹 앱을 차 화면에 띄우고
 * 차량 SDK 값 · 차 음성(인식 · 읽어 주기)을 웹 앱과 이어 준다 (NativeBridge).
 *
 * 보안
 *  - 우리 주소(APP_ORIGIN)만 앱 안에서 열고, 다른 주소는 바깥 브라우저 · 앱으로
 *  - 마이크 · 위치 권한은 우리 주소가 요청할 때만 허락
 *  - 파일 · 콘텐츠 접근, 섞인(http) 콘텐츠 막음
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var bridge: NativeBridge
    private val appUri: Uri = Uri.parse(BuildConfig.APP_URL)
    private val appOrigin = "${appUri.scheme}://${appUri.authority}"

    /** 웹이 마이크 · 위치를 달라고 했는데 안드로이드 권한이 아직 없을 때 기다리는 일 */
    private var afterPermission: ((Boolean) -> Unit)? = null
    private val askPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val cb = afterPermission
        afterPermission = null
        cb?.invoke(result.values.all { it })
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        web = WebView(this).apply { setBackgroundColor(Color.BLACK) }
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false // 대답 목소리 · 음악을 바로 재생
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false) // window.open → 아래 shouldOverrideUrlLoading 으로
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.scheme == "https" && "${url.scheme}://${url.authority}" == appOrigin) return false
                openOutside(url) // Spotify · 지도 · 전화 · 현대 페이지 등은 바깥에서
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    Toast.makeText(this@MainActivity, R.string.offline, Toast.LENGTH_LONG).show()
                    view.postDelayed({ view.loadUrl(BuildConfig.APP_URL) }, 8000)
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val ours = "${request.origin.scheme}://${request.origin.authority}" == appOrigin
                val wantsMic = PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources
                if (!ours || !wantsMic) return request.deny()
                withPermissions(arrayOf(Manifest.permission.RECORD_AUDIO)) { ok ->
                    if (ok) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else request.deny()
                }
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (origin.trimEnd('/') != appOrigin) return callback.invoke(origin, false, false)
                withPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) { ok ->
                    callback.invoke(origin, ok, false)
                }
            }
        }

        // 페이지를 불러오기 전에 통로를 열어야 첫 화면부터 window.pleosNative 가 보임
        bridge = NativeBridge(this, web, appOrigin) { perms, done -> withPermissions(perms, done) }
        bridge.attach()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState == null) web.loadUrl(BuildConfig.APP_URL) else web.restoreState(savedInstanceState)
    }

    private fun withPermissions(perms: Array<String>, done: (Boolean) -> Unit) {
        val missing = perms.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) return done(true)
        if (afterPermission != null) return done(false) // 이미 묻는 중
        afterPermission = done
        askPermission.launch(missing.toTypedArray())
    }

    private fun openOutside(url: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, url.toString(), Toast.LENGTH_SHORT).show()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() { super.onResume(); web.onResume(); bridge.resume() }
    override fun onPause() { bridge.pause(); web.onPause(); super.onPause() }

    override fun onDestroy() {
        bridge.release()
        web.destroy()
        super.onDestroy()
    }
}
