/* Astranov SpaceNet OS — always offer install (standalone / home screen)
 * Build: 20260811140000-install-os
 * SpaceNet is the browser. Install so the device runs it without a browser chrome.
 */
(function (global) {
  'use strict';
  var BUILD = '20260811140000-install-os';
  var deferredPrompt = null;
  var offered = false;

  function ensureManifestLink() {
    try {
      if (!document.querySelector('link[rel="manifest"]')) {
        var l = document.createElement('link');
        l.rel = 'manifest';
        l.href = '/manifest.webmanifest';
        document.head.appendChild(l);
      }
      if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
        var m = document.createElement('meta');
        m.name = 'mobile-web-app-capable';
        m.content = 'yes';
        document.head.appendChild(m);
      }
      if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
        var a = document.createElement('meta');
        a.name = 'apple-mobile-web-app-capable';
        a.content = 'yes';
        document.head.appendChild(a);
      }
      if (!document.querySelector('link[rel="apple-touch-icon"]')) {
        var ic = document.createElement('link');
        ic.rel = 'apple-touch-icon';
        ic.href = '/icon.png';
        document.head.appendChild(ic);
      }
    } catch (_) {}
  }

  function registerSW() {
    try {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    } catch (_) {}
  }

  function isStandalone() {
    try {
      if (window.matchMedia && matchMedia('(display-mode: standalone)').matches) return true;
      if (navigator.standalone === true) return true;
      if (document.referrer && document.referrer.indexOf('android-app://') === 0) return true;
    } catch (_) {}
    return false;
  }

  function log(msg, kind) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, kind || 'dim');
    } catch (_) {}
  }

  function runInstall() {
    if (isStandalone()) {
      log('SpaceNet OS · already installed on this device', 'ok');
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (c) {
        log(c && c.outcome === 'accepted' ? 'SpaceNet OS · installing…' : 'Install dismissed · use ribbon INSTALL anytime', 'dim');
        deferredPrompt = null;
      }).catch(function () {});
      return;
    }
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      log('Install SpaceNet OS · Safari Share → Add to Home Screen', 'ok');
      try {
        if (global.SNCli && SNCli.preview) SNCli.preview('Share ↑ · Add to Home Screen');
      } catch (_) {}
      return;
    }
    log('Install SpaceNet OS · browser menu · Install app / Add to Home screen', 'ok');
  }

  function ensureRibbonInstall() {
    var ribbon = document.getElementById('sn-task-ribbon');
    if (!ribbon) return;
    if (ribbon.querySelector('[data-act="install"], .sn-install-btn')) return;
    if (isStandalone()) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sn-install-btn';
    b.setAttribute('data-act', 'install');
    b.title = 'Install SpaceNet OS on this device';
    b.textContent = 'INSTALL';
    b.style.cssText =
      'min-width:52px;height:32px;border-radius:999px;border:1px solid rgba(61,214,140,0.65);' +
      'background:rgba(61,214,140,0.12);color:#7dffb3;font:700 10px/1 system-ui;letter-spacing:0.06em;padding:0 10px;';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      runInstall();
    });
    var user = ribbon.querySelector('#sn-user-btn, .sn-user-btn');
    if (user && user.nextSibling) ribbon.insertBefore(b, user.nextSibling);
    else if (ribbon.firstChild) ribbon.insertBefore(b, ribbon.firstChild);
    else ribbon.appendChild(b);
  }

  function softOfferOnce() {
    if (offered || isStandalone()) return;
    offered = true;
    log('SpaceNet OS · INSTALL on device · run without browser chrome · ribbon INSTALL', 'ok');
  }

  function onBeforeInstall(e) {
    try {
      e.preventDefault();
      deferredPrompt = e;
      ensureRibbonInstall();
      softOfferOnce();
    } catch (_) {}
  }

  function boot() {
    ensureManifestLink();
    registerSW();
    try {
      window.addEventListener('beforeinstallprompt', onBeforeInstall);
      window.addEventListener('appinstalled', function () {
        log('SpaceNet OS · installed on device', 'ok');
        deferredPrompt = null;
        var el = document.querySelector('.sn-install-btn');
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    } catch (_) {}
    ensureRibbonInstall();
    setTimeout(ensureRibbonInstall, 1500);
    setTimeout(ensureRibbonInstall, 4000);
    setTimeout(softOfferOnce, 5000);
    try {
      if (global.SNCli && SNCli.register) {
        SNCli.register('install', function () { runInstall(); return 'install'; });
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 2500);

  global.SNInstall = { prompt: runInstall, isStandalone: isStandalone, build: BUILD };
})(typeof window !== 'undefined' ? window : globalThis);
