/* Maps+ Android app bridge.
 *
 * In a normal browser this does nothing (Native.isApp is false) and the page uses the web APIs as before.
 * Inside the Maps+ Android app (a Capacitor wrapper around this same website) it talks to three native plugins,
 * so navigation keeps going with the screen off / phone locked, like Google Maps:
 *   - BackgroundGeolocation: GPS from a foreground service (shows a "Maps+ is navigating" notification)
 *   - TextToSpeech:          the phone's own voice (Android's WebView has no speechSynthesis)
 *   - KeepAwake:             keeps the screen on while driving and the app is open
 *
 *   Native.isApp                       -> boolean
 *   Native.watch(onFix, onError)       -> Promise<id|null>; onFix gets a GeolocationPosition-like object
 *   Native.clearWatch(id)
 *   Native.speak(text, lang) / Native.stopSpeaking()
 *   Native.keepAwake(on)
 *   Native.openSettings()              -> the app's Android settings page (permissions, battery)
 *   Native.showOnLockScreen(on)        -> show the app over the lock screen (on while navigating)
 *   Native.minimize()                  -> send the app to the background
 * Android BACK (button or edge swipe) acts like the browser's back button (see below).
 * Nothing here throws.
 */
(function () {
  'use strict';
  const cap = window.Capacitor;
  const isApp = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() &&
                   typeof cap.nativePromise === 'function');

  if (isApp) {
    // The app pads the page below Android's status bar itself, so don't draw under it.
    try {
      const vp = document.querySelector('meta[name="viewport"]');
      if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1');
      document.documentElement.classList.add('native-app');
    } catch (_) {}
  }

  const call = (plugin, method, opts) =>
    isApp ? cap.nativePromise(plugin, method, opts || {}).catch((e) => { try { console.warn('[Native]', plugin, method, e); } catch (_) {} return null; })
          : Promise.resolve(null);

  function watch(onFix, onError) {
    if (!isApp) return Promise.resolve(null);
    try {
      const id = cap.nativeCallback('BackgroundGeolocation', 'addWatcher', {
        backgroundTitle: 'Maps+ is navigating',
        backgroundMessage: 'Tap to open the map. Turn-by-turn voice keeps going with the screen off.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      }, (loc, err) => {
        if (err) { try { onError && onError(err); } catch (_) {} return; }
        if (!loc) return;
        try {
          onFix({
            coords: {
              latitude: loc.latitude, longitude: loc.longitude,
              accuracy: loc.accuracy == null ? 999 : loc.accuracy,
              heading: loc.bearing, speed: loc.speed, altitude: loc.altitude,
            },
            timestamp: loc.time || Date.now(),
          });
        } catch (e) { try { console.error('[Native] onFix failed', e); } catch (_) {} }
      });
      return Promise.resolve(id);
    } catch (e) { return Promise.resolve(null); }
  }

  // Android back button / swipe-from-the-edge: same as the browser's back. The page keeps a history entry
  // while something can be closed (route, navigation, panels...), so BACK closes that first. With nothing
  // left to close, Maps+ goes to the background like Google Maps instead of quitting.
  if (isApp) {
    try {
      cap.nativeCallback('App', 'addListener', { eventName: 'backButton' }, (data) => {
        if (data && data.canGoBack) history.back();
        else call('App', 'minimizeApp');
      });
    } catch (_) {}
  }

  // Home-screen shortcuts ("Go Home" / "Go to Work" when you long-press the app icon) open mapsplus://go/home.
  // The page picks them up through window.onMapsPlusShortcut (or later, if the page isn't ready yet).
  if (isApp) {
    const handleUrl = (url) => {
      const m = /go\/(home|work)/.exec(url || '');
      if (!m) return;
      if (window.onMapsPlusShortcut) window.onMapsPlusShortcut(m[1]);
      else window.__mapsplusPendingShortcut = m[1];
    };
    try { cap.nativeCallback('App', 'addListener', { eventName: 'appUrlOpen' }, (d) => handleUrl(d && d.url)); } catch (_) {}
    call('App', 'getLaunchUrl').then((r) => {
      if (!r || !r.url) return;
      try { if (sessionStorage.getItem('mapsplus.launched') === r.url) return; sessionStorage.setItem('mapsplus.launched', r.url); } catch (_) {}
      handleUrl(r.url);
    });
  }

  window.Native = {
    isApp,
    watch,
    clearWatch(id) { if (id != null) call('BackgroundGeolocation', 'removeWatcher', { id }); },
    speak(text, lang) {
      // speak() replaces whatever is being said (like speechSynthesis.cancel + speak).
      return call('TextToSpeech', 'stop').then(() =>
        call('TextToSpeech', 'speak', { text: String(text || ''), lang: lang || 'en-IN', rate: 1.0, pitch: 1.0, volume: 1.0, category: 'playback' }));
    },
    stopSpeaking() { return call('TextToSpeech', 'stop'); },
    keepAwake(on) { return call('KeepAwake', on ? 'keepAwake' : 'allowSleep'); },
    openSettings() { return call('BackgroundGeolocation', 'openSettings'); },
    minimize() { return call('App', 'minimizeApp'); },     // to the background (not closed), like Google Maps
    // While navigating, pressing the power button shows the map over the lock screen (like Google Maps).
    // The phone stays locked: leaving Maps+ still needs your PIN/fingerprint.
    showOnLockScreen(on) { return call('LockScreen', 'set', { on: !!on }); },
  };
})();
