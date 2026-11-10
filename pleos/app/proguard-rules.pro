# WebView에 넘기는 @JavascriptInterface 메서드 이름 유지
-keepclassmembers class ai.ourcar.alive.VehicleBridge {
    @android.webkit.JavascriptInterface <methods>;
}
# Pleos Vehicle SDK (리플렉션·AIDL 사용)
-keep class ai.pleos.playground.** { *; }
-dontwarn ai.pleos.playground.**
