# Wavely for Android

An Android app that runs all of Wavely on the phone. The Wavely server runs inside
the app on an embedded Node.js runtime
([capacitor-nodejs](https://github.com/hampoelz/Capacitor-NodeJS), Node 18), and the app
screen shows the regular Wavely web app. No computer or hosted server is needed. The phone
only needs internet to reach Beatsync.

```
Android app (Capacitor WebView)
  ├── www/index.html          startup screen: waits for the server, then opens it
  └── www/nodejs/             runs on the embedded Node.js
        ├── index.js          startup: data folder, Node 18 polyfills, error screen
        ├── server.js         ../server bundled into one file (esbuild)
        ├── web/              built ../web frontend, served by the server
        └── data/             seed recommendation graphs, copied to app storage on first run
```

The server listens on `127.0.0.1:4000` only, so other devices on the network can't reach it.

## Build the APK

Requirements: JDK 21 and the Android SDK, including NDK `27.0.12077973` and CMake `3.22.1`.

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME=$HOME/Library/Android/sdk
npm install
npm run apk        # writes Wavely.apk to this folder
```

`npm run apk` builds the web app, bundles the server, syncs Capacitor and runs Gradle.

## Install on a phone

Copy `Wavely.apk` to the phone and open it. Android will ask you to allow installs from
that source. You can also install it over USB with debugging turned on:

```bash
$ANDROID_HOME/platform-tools/adb install -r Wavely.apk
```

## Notes

- The APK targets 64-bit ARM phones (`arm64-v8a`). For an emulator, build with
  `cd android && ./gradlew assembleDebug -Pabis=arm64-v8a,x86_64`.
- This is a debug-signed build, which is fine for installing it yourself. Publishing to the
  Play Store needs a release build signed with your own key.
- nodejs-mobile is Node 18 built without ICU, so a few things are patched:
  - `node/main.cjs` adds a global `WebSocket` (from `ws`) and a working
    `String.prototype.normalize` (from `unorm`).
  - `scripts/build.mjs` rewrites regex escapes like `\p{L}` into plain code point ranges,
    because they don't compile without ICU.
  - If the server fails to start, the app shows the error instead of crashing.
