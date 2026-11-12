/* Maps+ installable-app helper.
 *
 *   PWA.register()   -> Promise<ServiceWorkerRegistration|null>  registers sw.js (after page load) when supported
 *   PWA.canInstall   -> boolean  true once the browser offers installation (beforeinstallprompt fired)
 *   PWA.installed    -> boolean  running as an installed app, or installed during this visit
 *   PWA.install()    -> Promise<'accepted'|'dismissed'|'unavailable'>  call from a click/tap handler
 *   PWA.onChange(cb) -> unsubscribe fn; cb({ canInstall, installed }) on any change
 *
 * Nothing here throws.
 */
(function () {
  'use strict';

  let deferredPrompt = null;
  let installedNow = false;
  let regPromise = null;
  const listeners = [];

  function standalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    } catch (e) { return false; }
  }

  function state() { return { canInstall: !!deferredPrompt, installed: installedNow || standalone() }; }

  function emit() {
    const s = state();
    listeners.slice().forEach((cb) => {
      try { cb(s); } catch (e) { try { console.error('[PWA] onChange callback failed', e); } catch (_) {} }
    });
  }

  try {
    window.addEventListener('beforeinstallprompt', (e) => {
      try { e.preventDefault(); } catch (_) {}   // keep it for our own install button
      deferredPrompt = e;
      emit();
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      installedNow = true;
      emit();
    });
    const mq = window.matchMedia && window.matchMedia('(display-mode: standalone)');
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', emit);
      else if (mq.addListener) mq.addListener(emit);
    }
  } catch (e) { /* ignore */ }

  window.PWA = {
    register() {
      if (regPromise) return regPromise;
      regPromise = new Promise((resolve) => {
        try {
          if (!('serviceWorker' in navigator) || !window.isSecureContext) { resolve(null); return; }
          const go = () => {
            try {
              navigator.serviceWorker.register('sw.js', { scope: './' }).then(resolve, (err) => {
                try { console.warn('[PWA] service worker registration failed', err); } catch (_) {}
                resolve(null);
              });
            } catch (err) { resolve(null); }
          };
          // Register after load so the worker's precache doesn't compete with the first page load.
          if (document.readyState === 'complete') go();
          else window.addEventListener('load', go, { once: true });
        } catch (e) { resolve(null); }
      });
      return regPromise;
    },

    get canInstall() { return !!deferredPrompt; },

    get installed() { return state().installed; },

    async install() {
      try {
        if (!deferredPrompt) return 'unavailable';
        const e = deferredPrompt;
        await e.prompt();        // rejects without a user gesture; then the event stays usable
        deferredPrompt = null;   // a shown prompt event can only be used once
        emit();
        const choice = await e.userChoice;
        return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
      } catch (err) {
        return 'unavailable';
      }
    },

    onChange(cb) {
      if (typeof cb !== 'function') return () => {};
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
  };
})();
