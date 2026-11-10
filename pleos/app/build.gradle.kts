plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "ai.ourcar.alive"
    compileSdk = 35

    defaultConfig {
        applicationId = "ai.ourcar.alive"
        minSdk = 28 // Pleos Connect 최소 요구 (Android 9)
        targetSdk = 34 // Pleos Connect (Android 14)
        versionCode = 1
        versionName = "0.1.0"
    }

    // 주행 중 화면 제한(CarUxRestrictions)은 Android Automotive 표준 Car API
    useLibrary("android.car")

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
    buildFeatures {
        compose = true
        buildConfig = true
    }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    // 현대 Pleos SDK (공개 Maven)
    implementation("ai.pleos.playground:Vehicle:2.3.2")
    implementation("ai.pleos.playground:TextToSpeech:3.3.1")

    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.core:core-ktx:1.13.1")

    testImplementation("junit:junit:4.13.2")
}
