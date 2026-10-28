plugins {
    id("com.android.application")
}

// The release key lives outside the repo; each build machine points at its copy:
// WALK_KEYSTORE (path), WALK_KEYSTORE_PASSWORD, and optionally WALK_KEY_ALIAS (default "walk").
val keystore = providers.environmentVariable("WALK_KEYSTORE").orNull

android {
    namespace = "io.github.stanstani.walkgames"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.stanstani.walkgames"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "1.5"
    }

    signingConfigs {
        if (keystore != null) create("release") {
            val pass = providers.environmentVariable("WALK_KEYSTORE_PASSWORD").orNull
                ?: throw GradleException("WALK_KEYSTORE is set but WALK_KEYSTORE_PASSWORD isn't")
            storeFile = file(keystore)
            storePassword = pass
            keyAlias = providers.environmentVariable("WALK_KEY_ALIAS").orNull ?: "walk"
            keyPassword = pass
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
        }
    }
}
