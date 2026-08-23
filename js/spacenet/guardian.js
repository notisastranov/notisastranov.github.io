/**
 * SNGuardian — SpaceNet protects itself.
 * If boot or Earth dies, fail-open, SOS the coding agent, reload once.
 */
(function (global) {
  'use strict';
  var BUILD = '20260822172200-sos-filter';
  var SOS_KEY = 'sn:guardian-sos-v1';
  var RELOAD_KEY = 'sn:guardian-reloaded';
  var started = false;
  var lastSos = 0;

  function log(m) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 160), 'dim');
    } catch (_) {}
  }

  function alive() {
    var canvas = document.querySelector('#globe canvas');
    var cli = document.getElementById('cli-in');
    var boot = global.SNOsBoot || global.SNOsBootloader;
    return !!(canvas || (cli && boot && boot.enterSystem));
  }

  function forceEnter() {
    try {
      var boot = global.SNOsBoot || global.SNOsBootloader;
      if (boot && boot.enterSystem) boot.enterSystem();
      else if (boot && boot.killOverlay) boot.killOverlay();
    } catch (_) {}
    try {
      var ov = document.getElementById('sn-os-boot');
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    } catch (_) {}
    try {
      document.body.classList.add('sn-hud', 'sn-used');
      document.body.classList.remove('sn-quiet');
    } catch (_) {}
  }

  function sos(why, extra) {
    var now = Date.now();
    if (now - lastSos < 45000) return;
    lastSos = now;
    var payload = {
      op: 'sos',
      why: String(why || 'dead').slice(0, 80),
      at: new Date().toISOString(),
      build: ((document.querySelector('meta[name="astranov-build"]') || {}).content || '').slice(0, 80),
      href: String(location.href || '').slice(0, 180),
      ua: String(navigator.userAgent || '').slice(0, 120),
      extra: extra || {},
    };
    try {
      var bag = JSON.parse(localStorage.getItem(SOS_KEY) || '[]');
      if (!Array.isArray(bag)) bag = [];
      bag.unshift(payload);
      localStorage.setItem(SOS_KEY, JSON.stringify(bag.slice(0, 20)));
    } catch (_) {}
    try {
      if (global.SNLiveBridge && SNLiveBridge.ownerNote) {
        void SNLiveBridge.ownerNote(
          '[SOS] ' + payload.why + (payload.extra && payload.extra.message ? ' · ' + payload.extra.message : '') + ' · ' + payload.build,
          { from: 'guardian', sos: true, silent: true }
        );
      }
    } catch (_) {}
    try {
      if (global.SNUsage && SNUsage.handoff)
        SNUsage.handoff('[SOS] ' + payload.why + ' · fix live boot', { from: 'guardian' });
    } catch (_) {}
  }

  function isMobileChrome() {
    var ua = String(navigator.userAgent || '');
    return /Android|iPhone|iPad|CriOS|SamsungBrowser|Mobile/i.test(ua);
  }

  function lawCss() {
    if (document.getElementById('sn-trivial-law')) return;
    var s = document.createElement('style');
    s.id = 'sn-trivial-law';
    s.textContent =
      '#sn-topchrome-drag,#cli-drag{height:10px!important;min-height:10px!important;max-height:10px!important;padding:0!important}' +
      '#sn-topchrome-drag::after,#cli-drag::after{content:none!important;display:none!important}' +
      '#panel,#sn-topchrome-panel{min-height:0!important}';
    document.documentElement.appendChild(s);
  }

  function heal(why) {
    lawCss();
    sos(why);
    forceEnter();
    if (isMobileChrome()) {
      log('Guardian · Chrome · stayed open');
      return;
    }
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === '1') {
        log('Guardian · stayed open · paged the builder');
        return;
      }
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch (_) {}
    try {
      var u = new URL(location.href);
      u.searchParams.set('_sn_heal', String(Date.now()));
      setTimeout(function () {
        location.replace(u.toString());
      }, 900);
    } catch (_) {
      setTimeout(function () {
        location.reload();
      }, 900);
    }
  }

  function tick() {
    if (alive()) return;
    heal('earth-or-cli-missing');
  }

  function start() {
    if (started) return;
    started = true;
    lawCss();
    setTimeout(function () {
      if (!alive()) heal('boot-stuck-12s');
    }, 12000);
    setInterval(tick, 20000);
    try {
      global.addEventListener('error', function (ev) {
        var msg = ev && ev.message ? ev.message : 'error';
        if (/Script error|ResizeObserver|Loading chunk/i.test(msg)) return;
        sos('js-error', { message: String(msg).slice(0, 160) });
      });
      global.addEventListener('unhandledrejection', function (ev) {
        var r = ev && ev.reason;
        var msg = String((r && r.message) || r || '').slice(0, 160);
        if (
          /AbortError|The operation was aborted|Failed to fetch|Load failed|NetworkError|NotAllowedError|NotSupportedError|InvalidStateError|play\(\)|The play\(\)|user aborted|getBattery|wakeLock|ResizeObserver|Script error/i.test(
            msg
          )
        ) {
          try {
            if (ev && ev.preventDefault) ev.preventDefault();
          } catch (_) {}
          return;
        }
        sos('promise-reject', { message: msg });
      });
    } catch (_) {}
  }

  global.SNGuardian = {
    build: BUILD,
    start: start,
    sos: sos,
    heal: heal,
    alive: alive,
    forceEnter: forceEnter,
  };
  start();
})(typeof window !== 'undefined' ? window : globalThis);
