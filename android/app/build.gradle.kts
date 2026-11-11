plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// 열 웹 앱 주소: 기본은 배포된 사이트. 개발 중엔 ./gradlew installDebug -PappUrl=https://... 로 바꿈
val appUrl = (findProperty("appUrl") as String?) ?: "https://yooseanjay.github.io/hyundai/?pleos"

android {
    namespace = "io.github.yooseanjay.ourcaralive"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.yooseanjay.ourcaralive"
        minSdk = 28 // Pleos Connect 보안 요건 (서명 키 교체 · 계보)
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "APP_URL", "\"$appUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

dependencies {
    implementation(libs.pleos.vehicle)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
}
