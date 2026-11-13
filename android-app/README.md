# Maps+ for Android

A thin Android app around the live site (https://sandeshd-23.github.io/maps-plus/). It opens the same page,
so anything you push to GitHub Pages shows up in the app without rebuilding it. Inside the app,
navigation keeps going when you press the power button:

- GPS comes from a native foreground service and shows a "Maps+ is navigating" notification
- turn-by-turn voice uses the phone's own text-to-speech
- the screen stays on while you drive with the app open

The page detects the app through `native.js`. In a normal browser nothing changes.

## Build

You need Node.js, a JDK 21 and the Android SDK (platform 36).

```bash
npm install
npx cap sync android
cd android && gradlew.bat assembleDebug
```

The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

You only need to rebuild after changing the native side: `capacitor.config.json`, the plugins or anything under `android/`.

## Install on your phone

1. Copy `app-debug.apk` to the phone (USB, Drive or Telegram) and open it.
2. Allow "Install unknown apps" for the app you opened it from. Android asks for this once.
3. Open Maps+ and allow notifications and location ("While using the app" is enough).
4. Optional but recommended: on Xiaomi, Oppo, Vivo, OnePlus, Realme or Samsung phones, go to
   Settings > MORE > PHONE SETTINGS > Battery and choose **Unrestricted**.
   Otherwise the phone may stop navigation after a few minutes with the screen off.
