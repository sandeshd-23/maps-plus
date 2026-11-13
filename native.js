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
  };
})();
