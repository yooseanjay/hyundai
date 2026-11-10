pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // 현대 Pleos Vehicle SDK (공개 저장소)
        maven("https://nexus-playground.pleos.ai/repository/maven-releases/") {
            content { includeGroupAndSubgroups("ai.pleos.playground") }
        }
    }
}

rootProject.name = "OurCarAlivePleos"
include(":app")
