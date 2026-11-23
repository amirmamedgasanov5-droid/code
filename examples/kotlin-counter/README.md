# Kotlin-проект Noodle

Обычный Android-проект (Gradle + Kotlin, виджеты Android Views). id, имя версии и versionCode берутся из `manifest.json`.

Сборка отладочного APK:

    node tools/nob.mjs apk .          # из корня репозитория Noodle

или вручную: `gradle assembleDebug` (нужны JDK 17+ и Android SDK, ANDROID_HOME).
