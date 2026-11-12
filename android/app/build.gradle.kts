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

    // release 서명: 키와 비밀번호는 저장소 밖(~/.gradle/gradle.properties의 OURCAR_*)에만 둠. 없으면 서명 안 된 release
    val storeFilePath = findProperty("OURCAR_STORE_FILE") as String?
    if (storeFilePath != null) {
        signingConfigs {
            create("release") {
                storeFile = file(storeFilePath)
                storePassword = findProperty("OURCAR_STORE_PASSWORD") as String?
                keyAlias = findProperty("OURCAR_KEY_ALIAS") as String?
                keyPassword = findProperty("OURCAR_KEY_PASSWORD") as String?
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true // 서명 키 교체 · 계보 (Pleos Connect 보안 요건)
            }
        }
    }

    buildTypes {
        // 차 제어(문 · 창문 · 공조 · 좌석 … set/move/select): 개발용 debug 빌드에서만 켬. 제출용 release 는 읽기 전용
        debug {
            buildConfigField("boolean", "VEHICLE_CONTROL", "true")
        }
        release {
            buildConfigField("boolean", "VEHICLE_CONTROL", "false")
            if (storeFilePath != null) signingConfig = signingConfigs.getByName("release")
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
    implementation(libs.pleos.stt)
    implementation(libs.pleos.tts)
    implementation(libs.pleos.llm)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
}
