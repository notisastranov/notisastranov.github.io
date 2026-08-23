/**
 * SpaceNet as the SpaceX phone OS.
 * Earth is the desktop. Starlink / mesh is the radio. Grok is the mind.
 * Build: 20260822170000-phoneos
 */
(function (global) {
  'use strict';

  var BUILD = '20260822170000-phoneos';
  var deferredPrompt = null;
  var wake = null;
  var tick = 0;

  function phone() {
    try {
      return (
        matchMedia('(pointer: coarse)').matches ||
        (navigator.maxTouchPoints || 0) > 0 ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
        standalone()
      );
    } catch (_) {
      return true;
    }
  }

  function standalone() {
    try {
      if (matchMedia('(display-mode: standalone)').matches) return true;
      if (matchMedia('(display-mode: fullscreen)').matches) return true;
      if (navigator.standalone === true) return true;
    } catch (_) {}
    return false;
  }

  function injectHead() {
    function meta(name, content) {
      if (document.querySelector('meta[name="' + name + '"]')) return;
      var m = document.createElement('meta');
      m.name = name;
      m.content = content;
      document.head.appendChild(m);
    }
    function link(rel, href) {
      if (document.querySelector('link[rel="' + rel + '"]')) return;
      var l = document.createElement('link');
      l.rel = rel;
      l.href = href;
      document.head.appendChild(l);
    }
    link('manifest', '/manifest.webmanifest');
    link('apple-touch-icon', '/icon.png');
    meta('mobile-web-app-capable', 'yes');
    meta('apple-mobile-web-app-capable', 'yes');
    meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    meta('apple-mobile-web-app-title', 'SpaceNet');
    meta('format-detection', 'telephone=no');
  }

  function injectCss() {
    if (document.getElementById('sn-phone-os-css')) return;
    var s = document.createElement('style');
    s.id = 'sn-phone-os-css';
    s.textContent = [
      'html,body{overscroll-behavior:none;touch-action:manipulation;background:#000105;}',
      'body.sn-phone-os{-webkit-user-select:none;user-select:none;}',
      'body.sn-phone-os input,body.sn-phone-os textarea{-webkit-user-select:text;user-select:text;}',
      'body.sn-phone-os #sn-os-island{position:fixed;top:calc(4px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);',
      'z-index:140;display:flex;align-items:center;gap:10px;height:28px;padding:0 14px;border-radius:999px;',
      'background:rgba(0,6,18,0.72);border:1px solid rgba(80,180,255,0.45);',
      'backdrop-filter:blur(16px) saturate(1.6);-webkit-backdrop-filter:blur(16px) saturate(1.6);',
      'box-shadow:0 0 0 1px rgba(28,140,255,0.2),0 0 18px rgba(28,140,255,0.28);pointer-events:auto;',
      'font:600 11px/1 JetBrains Mono,ui-monospace,monospace;color:#cfe9ff;letter-spacing:.06em;}',
      'body.sn-phone-os #sn-os-island b{font-weight:700;color:#7ec8ff;text-shadow:0 0 8px #1c8cff;}',
      'body.sn-phone-os #sn-os-island .sl{display:inline-flex;align-items:center;gap:4px;color:#7ec8ff;}',
      'body.sn-phone-os #sn-os-island .sl.off{color:#6a7a88;}',
      'body.sn-phone-os #sn-os-island i.dot{width:6px;height:6px;border-radius:50%;background:#1c8cff;box-shadow:0 0 8px #1c8cff;display:inline-block;}',
      'body.sn-phone-os #sn-os-island i.dot.off{background:#4a5560;box-shadow:none;}',
      'body.sn-phone-os #sn-os-face{width:16px;height:16px;border-radius:50%;object-fit:cover;border:1px solid rgba(126,200,255,.5);}',
      'body.sn-phone-os #sn-os-home{position:fixed;left:50%;bottom:calc(4px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);',
      'z-index:141;width:118px;height:4px;border-radius:999px;background:linear-gradient(90deg,transparent,#7ec8ff,#1c8cff,#7ec8ff,transparent);',
      'box-shadow:0 0 10px #1c8cff;pointer-events:auto;}',
      'body.sn-phone-os #sn-topchrome{padding-top:calc(36px + env(safe-area-inset-top,0px))!important;}',
      'body.sn-phone-os #dock{padding-bottom:calc(14px + env(safe-area-inset-bottom,0px) + var(--sn-kb,0px))!important;',
      'bottom:var(--sn-kb,0px)!important;}',
      'body.sn-phone-os #sn-topchrome-panel,body.sn-phone-os #panel{',
      'backdrop-filter:blur(14px) saturate(1.5)!important;-webkit-backdrop-filter:blur(14px) saturate(1.5)!important;}',
      'body.sn-phone-os #btn-home{font-size:12px!important;letter-spacing:.22em!important;}',
      'body.sn-os-kb #sn-os-island,body.sn-os-kb #sn-topchrome{opacity:.0!important;pointer-events:none!important;}',
      'body.sn-os-standalone #sn-os-island{top:calc(6px + env(safe-area-inset-top,0px));}',
      '@media (display-mode: standalone),(display-mode: fullscreen){',
      '  html,body{height:100dvh;height:100svh;}',
      '}',
    ].join('');
    document.head.appendChild(s);
  }

  function el(id, html, tag) {
    var n = document.getElementById(id);
    if (n) return n;
    n = document.createElement(tag || 'div');
    n.id = id;
    if (html) n.innerHTML = html;
    document.body.appendChild(n);
    return n;
  }

  function radio() {
    var on = navigator.onLine !== false;
    var type = 'link';
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c) {
        type = String(c.type || c.effectiveType || type);
        if (c.type === 'satellite') type = 'starlink';
      }
    } catch (_) {}
    if (!on) type = 'off';
    var label = type === 'starlink' ? 'STARLINK' : type === 'wifi' || type === 'wlan' ? 'Wi-Fi' : type === 'cellular' || type === '4g' || type === '5g' || type === '3g' ? String(type).toUpperCase() : on ? 'NET' : 'OFF';
    return { on: on, type: type, label: label };
  }

  function paintIsland() {
    var island = el('sn-os-island', '');
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    var r = radio();
    var bat = island.getAttribute('data-bat') || '';
    var face = '';
    try {
      var url = global.SNAuth && SNAuth.avatarUrl && SNAuth.avatarUrl();
      if (url) face = '<img id="sn-os-face" alt="" src="' + String(url).replace(/"/g, '') + '">';
    } catch (_) {}
    island.innerHTML =
      '<b>' +
      hh +
      ':' +
      mm +
      '</b><span class="sl' +
      (r.on ? '' : ' off') +
      '" title="' +
      r.label +
      '"><i class="dot' +
      (r.on ? '' : ' off') +
      '"></i>' +
      r.label +
      '</span>' +
      (bat ? '<span>' + bat + '</span>' : '') +
      face;
    island.title = standalone() ? 'SpaceNet OS' : 'SpaceNet · add to Home Screen to run as this phone';
  }

  function battery() {
    try {
      if (!navigator.getBattery) return;
      navigator.getBattery().then(function (b) {
        var pct = Math.round((b.level || 0) * 100);
        var island = document.getElementById('sn-os-island');
        if (island) island.setAttribute('data-bat', pct + '%');
        paintIsland();
      }).catch(function () {});
    } catch (_) {}
  }

  function liftKeyboard() {
    var vv = global.visualViewport;
    if (!vv) return;
    var kb = Math.max(0, Math.round((global.innerHeight || 0) - vv.height - (vv.offsetTop || 0)));
    document.documentElement.style.setProperty('--sn-kb', kb + 'px');
    document.body.classList.toggle('sn-os-kb', kb > 80);
    try {
      if (global.SNGlobe && SNGlobe.resize) SNGlobe.resize();
    } catch (_) {}
  }

  function home() {
    try {
      document.body.classList.remove('city-map-on', 'sn-order-live');
      var map = document.getElementById('city-map');
      if (map) map.classList.remove('active');
      var g = document.getElementById('globe');
      if (g) g.classList.remove('city-hidden');
      if (global.SNMap && SNMap.close) SNMap.close();
    } catch (_) {}
    try {
      var panel = document.getElementById('panel');
      if (panel) {
        panel.classList.add('collapsed');
        panel.classList.remove('mid', 'expanded');
      }
    } catch (_) {}
    try {
      if (global.SNVillage && SNVillage.fly) SNVillage.fly('regional', false);
    } catch (_) {}
    try {
      document.getElementById('cli-in') && document.getElementById('cli-in').blur();
    } catch (_) {}
  }

  function armBack() {
    try {
      history.pushState({ sn: 1 }, '', location.href);
    } catch (_) {}
    global.addEventListener('popstate', function () {
      home();
      try {
        history.pushState({ sn: 1 }, '', location.href);
      } catch (_) {}
    });
  }

  function armWake() {
    try {
      if (!navigator.wakeLock || !navigator.wakeLock.request) return;
      var grab = function () {
        navigator.wakeLock
          .request('screen')
          .then(function (s) {
            wake = s;
          })
          .catch(function () {});
      };
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') grab();
      });
      grab();
    } catch (_) {}
  }

  function armInstall() {
    global.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
    });
    try {
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    } catch (_) {}
  }

  function install() {
    if (standalone()) return true;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt = null;
      return true;
    }
    try {
      if (global.SNCli && SNCli.log)
        SNCli.log('Install SpaceNet as this phone · Share → Add to Home Screen', 'ok');
    } catch (_) {}
    return false;
  }

  function bindChrome() {
    var pill = el('sn-os-home', '');
    pill.setAttribute('aria-label', 'Home');
    pill.addEventListener('click', home);
    var island = document.getElementById('sn-os-island');
    if (island && !island._snBound) {
      island._snBound = 1;
      island.addEventListener('click', function () {
        if (!standalone()) install();
      });
    }
    var homeBtn = document.getElementById('btn-home');
    if (homeBtn && !homeBtn._snOs) {
      homeBtn._snOs = 1;
      homeBtn.textContent = 'SPACENET';
      homeBtn.addEventListener('click', home);
    }
    ['cli-in', 'stc-cmd-in'].forEach(function (id) {
      var i = document.getElementById(id);
      if (!i) return;
      i.setAttribute('enterkeyhint', 'go');
      i.setAttribute('inputmode', 'search');
      i.setAttribute('autocapitalize', 'off');
      i.setAttribute('autocorrect', 'off');
    });
  }

  function boot() {
    injectHead();
    injectCss();
    if (!phone()) {
      document.body.classList.remove('sn-phone-os');
      return { on: false, standalone: standalone() };
    }
    document.body.classList.add('sn-phone-os');
    if (standalone()) document.body.classList.add('sn-os-standalone');
    paintIsland();
    bindChrome();
    battery();
    liftKeyboard();
    armWake();
    armInstall();
    armBack();
    if (!tick) {
      tick = setInterval(function () {
        if (document.hidden) return;
        paintIsland();
      }, 15000);
    }
    try {
      if (global.visualViewport) {
        visualViewport.addEventListener('resize', liftKeyboard);
        visualViewport.addEventListener('scroll', liftKeyboard);
      }
    } catch (_) {}
    global.addEventListener('online', paintIsland);
    global.addEventListener('offline', paintIsland);
    global.addEventListener('resize', liftKeyboard);
    try {
      var q = new URLSearchParams(location.search || '');
      var cmd = String(q.get('cmd') || '').trim();
      if (cmd) {
        setTimeout(function () {
          try {
            if (global.SNCli && SNCli.run) void SNCli.run(cmd);
          } catch (_) {}
        }, 2200);
      }
    } catch (_) {}
    return { on: true, standalone: standalone(), build: BUILD };
  }

  global.SNPhoneOS = {
    boot: boot,
    home: home,
    install: install,
    radio: radio,
    standalone: standalone,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
