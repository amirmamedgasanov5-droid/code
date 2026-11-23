// Генератор Android-проекта (Gradle + WebView) из Noodle-приложения.
// Чистая функция: на вход манифест + файлы, на выход набор файлов проекта.
// Используется и в Studio (кнопка «Android-проект»), и в CLI (`nob apk`).

import { utf8, injectHead } from './nob.js';
import { prepareForRun } from './nui.js';

export const AGP_VERSION = '8.5.2';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, "\\'");
const jstr = (s) => JSON.stringify(String(s)); // Java-строка = JSON-строка (для ASCII/Unicode escape)

function hexToJava(hex) {
  return /^#[0-9a-fA-F]{6}$/.test(hex || '') ? hex : '#000000';
}

/**
 * @param manifest        манифест приложения
 * @param files           { path: Uint8Array } файлы приложения (без manifest.json)
 * @param runtimeSource   текст noodle-runtime.js
 * @returns { 'app/build.gradle': string|Uint8Array, … }
 */
export function androidProject(srcManifest, srcFiles, runtimeSource, nuiEngineSource) {
  let manifest = srcManifest;
  let files = srcFiles;
  if (srcManifest.stack === 'nui') {
    const r = prepareForRun(srcManifest, srcFiles, nuiEngineSource, 'file');
    if (r.errors?.length) throw new Error('ошибки Noodle UI:\n  • ' + r.errors.map((e) => `${e.file}:${e.line} ${e.message}`).join('\n  • '));
    manifest = r.manifest;
    files = r.files;
  }
  // Android (aapt) молча выбрасывает из assets папки, начинающиеся с «_», и файлы/папки, начинающиеся с «.»
  for (const p of Object.keys(srcFiles)) {
    const segs = p.split('/');
    const bad = segs.find((s, i) => s.startsWith('.') || (i < segs.length - 1 && s.startsWith('_')) || s.endsWith('~'));
    if (bad) throw new Error(`путь «${p}»: Android не включает в APK «${bad}» (имена папок с «_» и файлов с «.» отбрасываются). Переименуйте.`);
  }
  const id = manifest.id;
  const perms = manifest.permissions || [];
  const orientation = { portrait: 'portrait', landscape: 'landscape', auto: 'unspecified' }[manifest.window?.orientation || 'auto'];
  const bg = hexToJava(manifest.window?.background);
  const out = {};
  const pkgPath = id.replace(/\./g, '/');

  out['settings.gradle'] = `pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = 'noodle-app'
include ':app'
`;
  out['build.gradle'] = `plugins {
    id 'com.android.application' version '${AGP_VERSION}' apply false
}
`;
  out['gradle.properties'] = `org.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
`;
  out['app/build.gradle'] = `plugins {
    id 'com.android.application'
}

android {
    namespace '${id}'
    compileSdk 34

    defaultConfig {
        applicationId '${id}'
        minSdk 29
        targetSdk 34
        versionCode ${manifest.versionCode}
        versionName '${manifest.version}'
    }
    buildTypes {
        release {
            minifyEnabled false
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    lint {
        abortOnError false
    }
}

dependencies {
    implementation 'androidx.webkit:webkit:1.11.0'
}
`;

  const cleartext = perms.includes('network') ? ' android:usesCleartextTraffic="true"' : '';
  out['app/src/main/AndroidManifest.xml'] = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${perms.includes('network') ? '    <uses-permission android:name="android.permission.INTERNET" />\n' : ''}${perms.includes('vibrate') ? '    <uses-permission android:name="android.permission.VIBRATE" />\n' : ''}
    <application
        android:label="${xml(manifest.name)}"
        android:icon="@drawable/ic_launcher"
        android:allowBackup="false"${cleartext}
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="${orientation}"
            android:windowSoftInputMode="adjustResize"
            android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout|uiMode|keyboard|navigation">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;

  // иконка: PNG из манифеста, иначе векторная «N»
  const icon = manifest.icon && files[manifest.icon];
  if (icon && /\.png$/i.test(manifest.icon)) out['app/src/main/res/drawable-nodpi/ic_launcher.png'] = icon;
  else
    out['app/src/main/res/drawable/ic_launcher.xml'] = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#000000" android:pathData="M0,0h108v108h-108z" />
    <path android:strokeColor="#FFFFFF" android:strokeWidth="7" android:strokeLineJoin="miter"
        android:pathData="M32,78 L32,30 L76,78 L76,30" />
</vector>
`;

  out[`app/src/main/java/${pkgPath}/MainActivity.java`] = mainActivity(id, manifest, bg);

  // ресурсы приложения: файлы + рантайм, entry получает инъекцию
  const www = 'app/src/main/assets/www/';
  const csp = perms.includes('network') ? '' : `<meta http-equiv="Content-Security-Policy" content="connect-src 'self' blob: data:">`;
  const config = { manifest: srcManifest, mode: 'native' };
  for (const [p, data] of Object.entries(files)) {
    if (p === manifest.entry) {
      const html = new TextDecoder().decode(data);
      out[www + p] = injectHead(html, `${csp}<script src="/assets/www/noodle-system/runtime.js"></script>`);
    } else out[www + p] = data;
  }
  out[www + 'noodle-system/runtime.js'] = `window.__NOODLE_CONFIG__=${JSON.stringify(config)};\n` + runtimeSource;
  out[www + 'noodle-system/manifest.json'] = JSON.stringify(srcManifest, null, 2) + '\n';
  out['README.txt'] = `Проект сгенерирован Noodle Studio.\nСборка отладочного APK:  gradle assembleDebug   (нужны JDK 17+ и Android SDK, ANDROID_HOME)\nГотовый файл: app/build/outputs/apk/debug/app-debug.apk\n`;
  return out;
}

function mainActivity(id, manifest, bg) {
  const entry = manifest.entry.split('/').map(encodeURIComponent).join('/');
  return `package ${id};

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int REQ_FILE = 1001;
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int bg = Color.parseColor(${jstr(bg)});
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        web = new WebView(this);
        web.setBackgroundColor(bg);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(i, "Open"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Host(), "NoodleHost");
        web.loadUrl(ORIGIN + "/assets/www/${entry}");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__noodleBack ? window.__noodleBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if ("true".equals(value)) return;
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });
    }

    /** Мост JS ↔ Android. В JS доступен как window.NoodleHost (используется рантаймом). */
    private class Host {
        @JavascriptInterface
        public void toast(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), VibrationEffect.DEFAULT_AMPLITUDE));
        }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }

        /** Сохраняет файл в Загрузки. Возвращает человекочитаемый путь или "ERR:…". */
        @JavascriptInterface
        public String saveFile(String name, String mime, String base64) {
            try {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return "ERR:insert";
                OutputStream o = getContentResolver().openOutputStream(uri);
                o.write(Base64.decode(base64, Base64.DEFAULT));
                o.close();
                return "Downloads/" + name;
            } catch (Exception e) {
                return "ERR:" + e.getMessage();
            }
        }
    }
}
`;
}

/** Файлы проекта → [{path, data}] для zipWrite (строки кодируются в UTF-8). */
export function projectEntries(proj) {
  return Object.keys(proj)
    .sort()
    .map((path) => ({ path, data: typeof proj[path] === 'string' ? utf8(proj[path]) : proj[path] }));
}
