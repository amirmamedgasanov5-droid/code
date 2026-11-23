// Шаблоны Noodle UI и нативных стеков (Kotlin, Flutter, Swift).

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="#000"/>
  <rect x="3" y="3" width="90" height="90" fill="none" stroke="#fff" stroke-width="2"/>
  <path d="M32 64V32h32v32z" fill="none" stroke="#fff" stroke-width="4"/>
</svg>
`;

export const NATIVE_TEMPLATES = {
  'nui-counter': {
    stack: 'nui',
    title: 'Noodle UI — счётчик',
    description: 'Декларативный язык интерфейсов Noodle.OS: state, fn, screen. Без HTML.',
    manifest: { id: 'dev.noodle.counter', name: 'Counter', version: '1.0.0', versionCode: 1, permissions: ['vibrate'], entry: 'app.nui' },
    files: {
      'app.nui': `// Noodle UI: интерфейс описывается деревом элементов, логика — функциями на JavaScript.
app "Counter"

state count = 0 persist

fn inc() { count += 1; noodle.vibrate(15) }
fn dec() { count -= 1; noodle.vibrate(15) }

screen main {
  column grow center gap=32 {
    text "COUNTER" caps dim
    text "{count}" size=120 weight=200
    row gap=16 {
      button "−" on=dec width=84 height=84 size=32
      button "+" on=inc width=84 height=84 size=32
    }
    button "Сбросить" ghost on={ count = 0; toast("Сброшено") }
  }
}
`,
      'icon.svg': ICON,
    },
  },

  'nui-todo': {
    stack: 'nui',
    title: 'Noodle UI — задачи',
    description: 'Списки (each), условия (if), поля ввода, переключатели, два экрана и навигация.',
    manifest: { id: 'dev.noodle.tasks', name: 'Tasks', version: '1.0.0', versionCode: 1, permissions: [], entry: 'app.nui' },
    files: {
      'app.nui': `app "Tasks"

state items = [] persist
state draft = ""

fn add() {
  const t = draft.trim()
  if (!t) return
  items = [...items, { id: Date.now(), text: t, done: false }]
  draft = ""
}
fn remove(id) { items = items.filter(i => i.id !== id) }
fn left() { return items.filter(i => !i.done).length }

screen main {
  bar "Tasks" {
    button "i" ghost on={ goto("about") }
  }
  column grow padding=16 gap=12 {
    row gap=8 {
      input bind=draft placeholder="Новая задача" grow
      button "+" primary on=add
    }
    text "Осталось: {left()} из {items.length}" dim size=13
    scroll grow {
      if items.length == 0 {
        text "Пока пусто" dim center padding=40
      }
      each items as item {
        row gap=12 padding=12 border {
          toggle bind=item.done
          if item.done {
            text "{item.text}" grow dim
          }
          if !item.done {
            text "{item.text}" grow
          }
          button "×" ghost on={ remove(item.id) }
        }
      }
    }
  }
}

screen about {
  bar "О приложении"
  column grow center gap=8 padding=24 {
    text "Tasks" size=32 weight=200
    text "Написано на Noodle UI" dim
  }
}
`,
      'icon.svg': ICON,
    },
  },

  kotlin: {
    stack: 'kotlin',
    title: 'Kotlin — нативный Android',
    description: 'Полноценный Gradle-проект на Kotlin (Android Views). Собирается в APK командой nob apk.',
    manifest: { id: 'dev.noodle.kotlinapp', name: 'Kotlin App', version: '1.0.0', versionCode: 1, permissions: [] },
    files: {
      'settings.gradle': `pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = 'noodle-kotlin'
include ':app'
`,
      'build.gradle': `plugins {
    id 'com.android.application' version '8.5.2' apply false
    id 'org.jetbrains.kotlin.android' version '1.9.24' apply false
}
`,
      'gradle.properties': `org.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
`,
      'app/build.gradle': `plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}

// id, версия и versionCode берутся из manifest.json — единый источник правды.
def nm = new groovy.json.JsonSlurper().parse(file('../manifest.json'))

android {
    namespace 'noodle.app'
    compileSdk 34
    defaultConfig {
        applicationId nm.id
        minSdk 26
        targetSdk 34
        versionCode nm.versionCode
        versionName nm.version
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = '17' }
    lint { abortOnError false }
}
`,
      'app/src/main/AndroidManifest.xml': `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:label="Kotlin App"
        android:icon="@drawable/ic_launcher"
        android:allowBackup="false"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity android:name="noodle.app.MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
      'app/src/main/res/drawable/ic_launcher.xml': `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#000000" android:pathData="M0,0h108v108h-108z" />
    <path android:strokeColor="#FFFFFF" android:strokeWidth="7" android:pathData="M32,78 L32,30 L76,78 L76,30" />
</vector>
`,
      'app/src/main/kotlin/noodle/app/MainActivity.kt': `package noodle.app

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private var count = 0
    private lateinit var value: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
        val prefs = getSharedPreferences("app", MODE_PRIVATE)
        count = prefs.getInt("count", 0)

        value = TextView(this).apply {
            textSize = 96f
            setTextColor(Color.WHITE)
            typeface = Typeface.create("sans-serif-thin", Typeface.NORMAL)
            gravity = Gravity.CENTER
        }
        fun render() {
            value.text = count.toString()
            prefs.edit().putInt("count", count).apply()
        }
        val minus = pill("−") { count--; render() }
        val plus = pill("+") { count++; render() }
        val reset = pill("Сбросить") { count = 0; render() }

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(minus, LinearLayout.LayoutParams(dp(84), dp(84)).apply { marginEnd = dp(16) })
            addView(plus, LinearLayout.LayoutParams(dp(84), dp(84)))
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.BLACK)
            addView(value)
            addView(row, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(32); bottomMargin = dp(32) })
            addView(reset, LinearLayout.LayoutParams(-2, dp(48)))
        }
        setContentView(root)
        render()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun pill(label: String, onTap: () -> Unit): Button = Button(this).apply {
        text = label
        textSize = 22f
        isAllCaps = false
        setTextColor(Color.WHITE)
        background = GradientDrawable().apply {
            setColor(Color.BLACK)
            setStroke(dp(1), Color.WHITE)
        }
        setOnClickListener { onTap() }
    }
}
`,
      'README.md': `# Kotlin-проект Noodle

Обычный Android-проект (Gradle + Kotlin, виджеты Android Views). id, имя версии и versionCode берутся из \`manifest.json\`.

Сборка отладочного APK:

    node tools/nob.mjs apk .          # из корня репозитория Noodle

или вручную: \`gradle assembleDebug\` (нужны JDK 17+ и Android SDK, ANDROID_HOME).
`,
    },
  },

  flutter: {
    stack: 'flutter',
    title: 'Flutter (Dart)',
    description: 'Flutter-приложение. Сборка APK через установленный Flutter SDK: nob apk.',
    manifest: { id: 'dev.noodle.flutterapp', name: 'Flutter App', version: '1.0.0', versionCode: 1, permissions: [] },
    files: {
      'pubspec.yaml': `name: noodle_flutter
description: Приложение Noodle на Flutter.
publish_to: none
version: 1.0.0+1

environment:
  sdk: ">=3.0.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter

flutter:
  uses-material-design: true
`,
      'lib/main.dart': `import 'package:flutter/material.dart';

void main() => runApp(const NoodleApp());

class NoodleApp extends StatelessWidget {
  const NoodleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true).copyWith(scaffoldBackgroundColor: Colors.black),
      home: const CounterPage(),
    );
  }
}

class CounterPage extends StatefulWidget {
  const CounterPage({super.key});

  @override
  State<CounterPage> createState() => _CounterPageState();
}

class _CounterPageState extends State<CounterPage> {
  int count = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('$count', style: const TextStyle(fontSize: 96, fontWeight: FontWeight.w200)),
            const SizedBox(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OutlinedButton(onPressed: () => setState(() => count--), child: const Text('−', style: TextStyle(fontSize: 28))),
                const SizedBox(width: 16),
                OutlinedButton(onPressed: () => setState(() => count++), child: const Text('+', style: TextStyle(fontSize: 28))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
`,
      'README.md': `# Flutter-проект Noodle

    node tools/nob.mjs apk .     # нужен Flutter SDK в PATH

Команда копирует проект в build/native, при необходимости выполняет \`flutter create --platforms=android .\` и \`flutter build apk --debug\`.
`,
    },
  },

  swift: {
    stack: 'swift',
    title: 'Swift (SwiftUI, iOS)',
    description: 'SwiftUI-приложение + project.yml для XcodeGen. Собирается только на macOS с Xcode.',
    manifest: { id: 'dev.noodle.swiftapp', name: 'Swift App', version: '1.0.0', versionCode: 1, permissions: [] },
    files: {
      'project.yml': `name: NoodleSwift
options:
  bundleIdPrefix: dev.noodle
targets:
  NoodleSwift:
    type: application
    platform: iOS
    deploymentTarget: "16.0"
    sources: [Sources]
    settings:
      PRODUCT_BUNDLE_IDENTIFIER: dev.noodle.swiftapp
      GENERATE_INFOPLIST_FILE: YES
      INFOPLIST_KEY_UILaunchScreen_Generation: YES
`,
      'Sources/NoodleApp.swift': `import SwiftUI

@main
struct NoodleApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView().preferredColorScheme(.dark)
        }
    }
}
`,
      'Sources/ContentView.swift': `import SwiftUI

struct ContentView: View {
    @AppStorage("count") private var count = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 32) {
                Text("\\(count)").font(.system(size: 96, weight: .thin)).foregroundColor(.white)
                HStack(spacing: 16) {
                    pill("−") { count -= 1 }
                    pill("+") { count += 1 }
                }
            }
        }
    }

    private func pill(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.system(size: 28)).foregroundColor(.white)
                .frame(width: 84, height: 84)
                .overlay(Rectangle().stroke(Color.white, lineWidth: 1))
        }
    }
}
`,
      'README.md': `# Swift-проект Noodle

Требуется macOS, Xcode и XcodeGen (\`brew install xcodegen\`):

    xcodegen generate
    xcodebuild -scheme NoodleSwift -destination 'generic/platform=iOS Simulator' build

Windows/Linux Swift-сборку iOS не поддерживают.
`,
    },
  },
};
