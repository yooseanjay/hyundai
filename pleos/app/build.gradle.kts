plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.ourcar.alive"
    compileSdk = 35

    defaultConfig {
        applicationId = "ai.ourcar.alive"
        minSdk = 28 // Pleos Connect 최소 요구 (Android 9)
        targetSdk = 34 // Pleos Connect 에뮬레이터 (Android 14)
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("ai.pleos.playground:Vehicle:2.3.2")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}

// 웹 앱 빌드물이 없으면 바로 알려 줌 (먼저 저장소 루트에서 npm run build:pleos)
tasks.named("preBuild") {
    doFirst {
        val index = file("src/main/assets/web/index.html")
        if (!index.exists()) {
            throw GradleException("웹 앱이 아직 없어요. 저장소 루트에서 `npm run build:pleos`를 먼저 실행하세요.")
        }
    }
}
