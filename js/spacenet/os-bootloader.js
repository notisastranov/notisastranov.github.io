/**
 * ASTRANOV OS BOOTLOADER
 * Operating-system style cold start for any device.
 *
 * - Text console during boot (not a silent spinner)
 * - Staged module load with [ OK ] / [WARN] / [FAIL]
 * - Diagnostics + automatic repair attempts + user fix offers
 * - Never claims READY until verified (canvas + shell + CLI)
 * - CLI commands after handoff: boot · diagnostics · repair · kernel status
 *
 * This is the sole entry after index.html. Professional path — not a game splash.
 */
(function (global) {
  'use strict';

  if (global.__snOsBoot) return;
  global.__snOsBoot = 1;

  var BUILD =
    (document.querySelector('meta[name="astranov-build"]') || {}).content || 'os-1';
  var CDN_GH = '';
  var t0 = performance.now();
  var lines = [];
  var report = {
    build: BUILD,
    startedAt: new Date().toISOString(),
    stages: [],
    checks: [],
    fixes: [],
    loadStats: { ok: 0, fail: 0, cdn: 0 },
    ready: false,
    degraded: false,
  };

  var facts = {
    device: { k: 'Device', text: 'Checking…', state: 'wait', cmd: 'device' },
    power: { k: 'Power', text: 'Checking…', state: 'wait', cmd: 'battery' },
    network: { k: 'Network', text: 'Checking…', state: 'wait', cmd: 'network' },
    place: { k: 'Place', text: 'Tap to share where you are', state: 'wait', cmd: 'locate' },
    cache: { k: 'Cache', text: 'Clearing old files…', state: 'wait', cmd: 'clear cache' },
    login: { k: 'Login', text: 'Looking for your last sign-in…', state: 'wait', cmd: 'login' },
    reset: {
      k: 'Reset',
      text: 'Hard reset wipes stored pages and restarts. Tap only if stuck.',
      state: 'ok',
      cmd: 'hard boot',
    },
    graphics: { k: 'Earth', text: 'Waking…', state: 'wait', cmd: 'repair display' },
    wifi: { k: 'Wi-Fi', text: 'Scanning…', state: 'wait', cmd: 'network' },
    cell: { k: 'Cell', text: 'Scanning…', state: 'wait', cmd: 'network' },
    blue: { k: 'Bluetooth', text: 'Scanning…', state: 'wait', cmd: 'network' },
    ports: { k: 'Radio', text: 'Scanning USB / serial…', state: 'wait', cmd: 'network' },
    mesh: { k: 'Mesh', text: 'Probing SpaceNet…', state: 'wait', cmd: 'peers' },
    smoke: { k: 'Fallback', text: 'Arming slow path…', state: 'wait', cmd: 'network' },
    mine: { k: 'Donate', text: 'Judging spare load…', state: 'wait', cmd: 'donate on' },
    system: { k: 'System', text: 'Starting…', state: 'wait', cmd: 'enter astranov' },
  };
  var FACT_GROUPS = [
    { title: 'This machine', ids: ['device', 'power', 'network', 'place'] },
    { title: 'Links · anything that can carry a packet', ids: ['wifi', 'cell', 'blue', 'ports', 'mesh', 'smoke'] },
    { title: 'This session', ids: ['cache', 'login', 'reset'] },
    { title: 'The system', ids: ['graphics', 'system'] },
  ];
  var bootScan = { recPct: 5, links: [] };
  var entered = false;
  var gateReady = false;
  var consoleEl = null;
  var bootEl = document.getElementById('boot');

  /* ───────── SpaceX cinematic boot — Earth first, HUD last ───────── */
  function injectBootCss() {
    if (document.getElementById('sn-os-cinematic-css')) return;
    var s = document.createElement('style');
    s.id = 'sn-os-cinematic-css';
    s.textContent = [
      '#boot.os-cinematic{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;',
      'background:radial-gradient(ellipse at 50% 40%,rgba(20,195,243,.16),#000105 58%);',
      'transition:background 1.6s ease,opacity 1.25s ease;pointer-events:none;}',
      '#boot.os-cinematic.os-earth{background:radial-gradient(ellipse at 50% 42%,rgba(20,195,243,.05),rgba(0,1,5,.18) 70%);}',
      '#boot.os-cinematic.sn-os-reveal{opacity:0;background:transparent;}',
      '#sn-os-stars{position:absolute;inset:0;overflow:hidden;pointer-events:none;}',
      '#sn-os-stars i{position:absolute;width:2px;height:2px;border-radius:50%;background:#e8f7ff;',
      'box-shadow:0 0 6px #14c3f3;opacity:.55;animation:snOsTwinkle 3.2s ease-in-out infinite;}',
      '@keyframes snOsTwinkle{0%,100%{opacity:.2}50%{opacity:.9}}',
      '#sn-os-core{position:relative;z-index:2;text-align:center;transform:translateY(-6vh);',
      'transition:opacity .9s ease,transform 1.1s cubic-bezier(.22,1,.36,1);}',
      '#boot.sn-os-reveal #sn-os-core{opacity:0;transform:translateY(-18vh) scale(.92);}',
      '#sn-os-mark{font:800 22px/1 Space Grotesk,system-ui,sans-serif;letter-spacing:.42em;color:#14c3f3;',
      'text-shadow:0 0 18px rgba(20,195,243,.85),0 0 48px rgba(20,195,243,.35);}',
      '#sn-os-ring{width:148px;height:2px;margin:22px auto 0;border-radius:999px;overflow:hidden;',
      'background:rgba(20,195,243,.14);box-shadow:0 0 12px rgba(20,195,243,.35);}',
      '#sn-os-ring>span{display:block;height:100%;width:18%;background:linear-gradient(90deg,transparent,#14c3f3,#7ee9ff);',
      'animation:snOsScan 1.6s ease-in-out infinite;}',
      '@keyframes snOsScan{0%{transform:translateX(-40%)}100%{transform:translateX(540%)}}',
      '#sn-os-sub{margin-top:16px;font:600 11px/1.3 JetBrains Mono,ui-monospace,monospace;letter-spacing:.28em;',
      'color:rgba(180,230,255,.72);text-transform:uppercase;}',
      '#sn-os-facts,#sn-os-actions{display:none!important;}',
      '#sn-topchrome,#dock{opacity:0;transition:opacity 1.05s ease,transform 1.05s cubic-bezier(.22,1,.36,1);}',
      '#sn-topchrome{transform:translateY(-14px);}',
      '#dock{transform:translateY(18px);}',
      'body.sn-hud-live #sn-topchrome,body.sn-hud-live #dock{opacity:1;transform:none;}',
    ].join('');
    document.head.appendChild(s);
  }

  function ensureConsole() {
    injectBootCss();
    if (!bootEl) {
      bootEl = document.createElement('div');
      bootEl.id = 'boot';
      bootEl.setAttribute('aria-busy', 'true');
      document.body.appendChild(bootEl);
    }
    bootEl.classList.remove('hide');
    bootEl.classList.add('os-cinematic');
    bootEl.style.cssText = '';
    var dots = '';
    for (var i = 0; i < 28; i++) {
      var x = Math.round((i * 37) % 100);
      var y = Math.round((i * 53) % 100);
      var d = ((i * 0.11) % 2.4).toFixed(2);
      dots += '<i style="left:' + x + '%;top:' + y + '%;animation-delay:' + d + 's"></i>';
    }
    bootEl.innerHTML =
      '<div id="sn-os-stars">' + dots + '</div>' +
      '<div id="sn-os-core">' +
      '<div id="sn-os-mark">ASTRANOV</div>' +
      '<div id="sn-os-ring"><span></span></div>' +
      '<div id="sn-os-sub">SPACEX PHONE OS</div>' +
      '</div>' +
      '<div id="sn-os-facts" hidden></div>' +
      '<div id="sn-os-actions" hidden></div>';
    consoleEl = document.getElementById('sn-os-facts');
    return consoleEl;
  }

  function revealEarth() {
    try {
      if (bootEl) bootEl.classList.add('os-earth');
      setSub('EARTH ONLINE');
    } catch (_) {}
  }

  function materializeHud() {
    try {
      document.body.classList.add('sn-hud-live');
    } catch (_) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  function setFact(id, text, state) {
    if (!facts[id]) return;
    if (text != null) facts[id].text = String(text);
    if (state) facts[id].state = state;
    paintFacts();
  }

  function markFor(state) {
    if (state === 'ok') return '✓';
    if (state === 'bad') return '✗';
    return '…';
  }

  function paintFacts() {
    /* diagnostics live in CLI (`boot`) — never a gray wall over Earth */
  }

  function runFact(id) {
    var f = facts[id];
    if (!f) return;
    if (id === 'place') {
      probePlace(true);
      return;
    }
    if (id === 'graphics' && f.state === 'bad') {
      repairDisplay().then(function (okC) {
        setFact('graphics', okC ? 'Earth ready' : 'Earth failed · tap to retry', okC ? 'ok' : 'bad');
      });
      return;
    }
    if (id === 'system') {
      if (gateReady) enterSystem();
      return;
    }
    if (id === 'reset') {
      setFact('reset', 'Restarting · wiping stored pages…', 'wait');
      hardRestart();
      return;
    }
    if (id === 'cache') {
      setFact('cache', 'Clearing stored pages again…', 'wait');
      Promise.resolve(claimBrowser()).then(function () {
        setFact('cache', 'Caches cleared · this build is live. Tap to clear again.', 'ok');
      });
      return;
    }
    if (id === 'login') {
      try {
        if (global.SNAuth && SNAuth.user) {
          probeLogin();
          return;
        }
        if (global.SNAuth && SNAuth.signInGoogle) void SNAuth.signInGoogle();
        else if (global.SNAuth && SNAuth.toggle) void SNAuth.toggle();
        else setFact('login', 'Login module not ready · enter then tap User', 'wait');
      } catch (_) {
        setFact('login', 'Login not ready · enter then tap User', 'wait');
      }
      return;
    }
    if (id === 'network' || id === 'wifi' || id === 'cell') {
      probeNetwork();
      scanLinks();
      return;
    }
    if (id === 'blue' || id === 'ports' || id === 'mesh' || id === 'smoke') {
      scanLinks();
      return;
    }
    if (id === 'mine') {
      acceptMineDonate();
      return;
    }
    if (id === 'power' || id === 'device') {
      probeDevice();
    }
  }

  function setSub(t) {
    var el = document.getElementById('sn-os-sub');
    if (el) el.textContent = t;
  }

  function paint() {
    paintFacts();
  }

  function out(tag, msg, lvl) {
    lines.push({ tag: tag, msg: String(msg || ''), lvl: lvl || 'dim', t: performance.now() - t0 });
    if (lines.length > 400) lines = lines.slice(-300);
    /* never dump machine lines onto the boot screen or the CLI */
  }

  function hdr(msg) {
    out('──', msg, 'hdr');
  }
  function ok(msg) {
    out('[ OK ]', msg, 'ok');
  }
  function warn(msg) {
    out('[WARN]', msg, 'warn');
  }
  function fail(msg) {
    out('[FAIL]', msg, 'fail');
  }
  function info(msg) {
    out('[....]', msg, 'dim');
  }
  function fix(msg) {
    out('[FIX ]', msg, 'warn');
    report.fixes.push({ t: Date.now(), msg: String(msg) });
  }

  function recordCheck(id, pass, detail, fixHint) {
    var row = { id: id, pass: !!pass, detail: detail || '', fix: fixHint || '', ms: Math.round(performance.now() - t0) };
    report.checks.push(row);
    if (pass) ok(id + (detail ? ' · ' + detail : ''));
    else {
      fail(id + (detail ? ' · ' + detail : ''));
      if (fixHint) fix(fixHint);
    }
    return row;
  }

  function setActions(btns) {
    /* HUD is the only control surface after Earth is up */
    void btns;
  }

  function probeNetwork() {
    var on = navigator.onLine !== false;
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var kind = c && (c.effectiveType || c.type) ? String(c.effectiveType || c.type) : '';
    var down = c && c.downlink ? Math.round(c.downlink * 10) / 10 + ' Mb/s' : '';
    var bits = [on ? 'Online' : 'Offline'];
    if (kind) bits.push(kind);
    if (down) bits.push(down);
    setFact('network', bits.join(' · '), on ? 'ok' : 'bad');
    scanLinks();
    recommendMine();
    return on;
  }

  function connInfo() {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
  }

  function scanLinks() {
    var c = connInfo();
    var on = navigator.onLine !== false;
    var type = String(c.type || '').toLowerCase();
    var et = String(c.effectiveType || '').toLowerCase();
    var down = c.downlink ? Math.round(c.downlink * 10) / 10 : 0;
    bootScan.links = [];

    if (type === 'wifi') {
      setFact('wifi', 'Wi-Fi up' + (down ? ' · ' + down + ' Mb/s' : ''), 'ok');
      bootScan.links.push('wifi');
    } else if (type === 'ethernet') {
      setFact('wifi', 'Cable / ethernet', 'ok');
      bootScan.links.push('ethernet');
    } else if (on) {
      setFact('wifi', 'Online · this browser will not name Wi-Fi vs cable', 'ok');
    } else {
      setFact('wifi', 'No Wi-Fi', 'bad');
    }

    if (type === 'cellular' || /^(slow-2g|2g|3g|4g)$/.test(et)) {
      var gen = et === '4g' ? '4G-class (5G masts often still report 4G here)' : et === '3g' ? '3G' : et === '2g' || et === 'slow-2g' ? '2G / edge' : 'cellular';
      setFact('cell', gen + (down ? ' · ' + down + ' Mb/s' : ''), 'ok');
      bootScan.links.push('cell');
    } else {
      setFact('cell', 'No cellular report · phone browsers hide 5G as 4G', on ? 'wait' : 'bad');
    }

    function setBlue(okB, text) {
      setFact('blue', text, okB ? 'ok' : 'wait');
      if (okB) bootScan.links.push('bluetooth');
    }
    if (navigator.bluetooth && navigator.bluetooth.getAvailability) {
      navigator.bluetooth.getAvailability().then(function (avail) {
        setBlue(!!avail, avail ? 'Bluetooth radio is on · can carry a tiny mesh hop' : 'Bluetooth off or blocked');
        recommendMine();
      }).catch(function () {
        setBlue(false, 'Bluetooth API blocked');
      });
    } else if (navigator.bluetooth) {
      setBlue(true, 'Bluetooth API present · tap to use a nearby hop');
    } else {
      setBlue(false, 'No Bluetooth in this browser');
    }

    if ('serial' in navigator) {
      setFact('ports', 'USB serial ready · plug Meshtastic, a walkie dongle, or any serial radio', 'ok');
      bootScan.links.push('serial');
    } else if ('usb' in navigator) {
      setFact('ports', 'USB ready · this browser can talk to a radio dongle if you plug one in', 'ok');
      bootScan.links.push('usb');
    } else {
      setFact('ports', 'No USB / serial here · Meshtastic and walkie antennas need a browser that opens ports', 'wait');
    }

    var rtc = !!(window.RTCPeerConnection || window.webkitRTCPeerConnection);
    var peers = 0;
    try {
      if (global.SNMeshPeers && SNMeshPeers.visible) peers = SNMeshPeers.visible().length || 0;
    } catch (_) {}
    if (rtc && on) {
      setFact(
        'mesh',
        peers
          ? 'SpaceNet mesh up · ' + peers + ' peer' + (peers === 1 ? '' : 's')
          : 'SpaceNet mesh ready · WebRTC on · waiting for peers',
        'ok'
      );
      bootScan.links.push('mesh');
    } else if (rtc) {
      setFact('mesh', 'Mesh engine ready · offline · will pair when any link returns', 'wait');
    } else {
      setFact('mesh', 'No peer channel in this browser', 'bad');
    }

    setFact(
      'smoke',
      'Slow path armed · if every radio dies we still queue one-line packets on this machine (the smoke signal)',
      'ok'
    );
    bootScan.links.push('smoke');
    try {
      localStorage.setItem('sn:boot-links', JSON.stringify(bootScan.links));
    } catch (_) {}
    recommendMine();
  }

  function recommendMine() {
    var cores = navigator.hardwareConcurrency || 2;
    var mem = navigator.deviceMemory || 0;
    var c = connInfo();
    var save = !!c.saveData;
    var et = String(c.effectiveType || '');
    var mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
    var wall = !!(facts.power && /No battery|wall power/i.test(facts.power.text));
    var score = 3;
    if (cores >= 4) score += 2;
    if (cores >= 8) score += 2;
    if (mem >= 8) score += 2;
    else if (mem && mem < 4) score -= 1;
    if (wall) score += 2;
    if (!mobile) score += 1;
    if (save || et === 'slow-2g' || et === '2g') score -= 3;
    if (et === '3g') score -= 1;
    if (score < 3) score = 3;
    if (score > 13) score = 13;
    bootScan.recPct = score;
    try {
      localStorage.setItem('sn:boot-mine-pct', String(score));
    } catch (_) {}
    var why = [];
    why.push(cores + ' cores');
    if (mem) why.push(mem + ' GB');
    if (wall) why.push('wall power');
    if (mobile) why.push('phone');
    if (save) why.push('data saver');
    setFact(
      'mine',
      'Recommend ' +
        score +
        '% of spare load for SpaceNet mining · ' +
        why.join(' · ') +
        '. Tap to donate that share.',
      'ok'
    );
  }

  function acceptMineDonate() {
    var pct = bootScan.recPct || Number(localStorage.getItem('sn:boot-mine-pct')) || 5;
    try {
      localStorage.setItem('astranov_donate_compute', '1');
      localStorage.setItem('sn:boot-mine-on', '1');
    } catch (_) {}
    try {
      if (global.SNResources && SNResources.setDonate) SNResources.setDonate(true);
      if (global.SNResources && SNResources.setMining) SNResources.setMining(true);
    } catch (_) {}
    setFact('mine', 'Donating ' + pct + '% · spare only · tap again after enter to change', 'ok');
  }

  function probeDevice() {
    var touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    var mem = navigator.deviceMemory;
    var cores = navigator.hardwareConcurrency;
    var bits = [touch ? 'Phone or tablet' : 'Computer'];
    if (mem) bits.push(mem + ' GB');
    if (cores) bits.push(cores + ' cores');
    setFact('device', bits.join(' · '), 'ok');
    probePower();
  }

  function looksLikeFakeBattery(b) {
    if (!b) return true;
    var mobile = /Android|iPhone|iPad|Mobile|Tablet/i.test(navigator.userAgent || '');
    if (mobile) return false;
    var full = Number(b.level) >= 0.99;
    var plugged = b.charging === true;
    var neverDrains = !isFinite(b.dischargingTime);
    var instant = b.chargingTime === 0 || !isFinite(b.chargingTime);
    var touch = (navigator.maxTouchPoints || 0) > 0;
    // Chrome on a desktop with no battery invents 100% / charging / Infinity
    return plugged && full && neverDrains && instant && !touch;
  }

  function probePower() {
    if (!navigator.getBattery) {
      setFact('power', 'No battery · this computer is on wall power', 'ok');
      return;
    }
    navigator.getBattery()
      .then(function (b) {
        if (looksLikeFakeBattery(b)) {
          setFact('power', 'No battery · wall power · this machine does not have one', 'ok');
          recommendMine();
          return;
        }
        var pct = Math.round((Number(b.level) || 0) * 100);
        var bits = [pct + '%'];
        if (b.charging) bits.push('plugged in');
        else bits.push('on battery');
        setFact('power', bits.join(' · '), pct < 12 && !b.charging ? 'bad' : 'ok');
        recommendMine();
      })
      .catch(function () {
        setFact('power', 'No battery report · treat as wall power', 'ok');
      });
  }

  function probeLogin() {
    var u = null;
    try {
      u = global.SNAuth && SNAuth.user;
    } catch (_) {}
    if (u) {
      var name =
        (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) ||
        (u.email && String(u.email).split('@')[0]) ||
        'you';
      setFact('login', 'Signed in as ' + name, 'ok');
      try {
        if (global.SNField && SNField.paintRibbon) SNField.paintRibbon();
      } catch (_) {}
      return true;
    }
    setFact('login', 'Not signed in · tap here or tap User after enter', 'wait');
    return false;
  }

  var loginTries = 0;
  function watchLogin() {
    if (probeLogin()) return;
    loginTries++;
    if (loginTries < 16) setTimeout(watchLogin, 280);
  }

  function probePlace(forcePrompt) {
    var last = null;
    try {
      last = JSON.parse(localStorage.getItem('sn:last-good-gps') || 'null');
    } catch (_) {}
    var fake = last && Math.abs(last.lat - 36.4341) < 0.02 && Math.abs(last.lng - 28.2176) < 0.02;
    if (last && last.lat != null && !fake && !forcePrompt) {
      setFact('place', last.lat.toFixed(3) + ' · ' + last.lng.toFixed(3) + ' · last good', 'ok');
    }
    if (!navigator.geolocation) {
      setFact('place', 'No GPS on this device', 'bad');
      return;
    }
    if (!forcePrompt && !last) {
      setFact('place', 'Tap to share where you are', 'wait');
      return;
    }
    setFact('place', 'Asking for location…', 'wait');
    try {
      navigator.geolocation.getCurrentPosition(
        function (p) {
          var lat = p.coords.latitude;
          var lng = p.coords.longitude;
          var acc = Math.round(p.coords.accuracy || 0);
          setFact('place', lat.toFixed(3) + ' · ' + lng.toFixed(3) + (acc ? ' · ±' + acc + ' m' : ''), 'ok');
          try {
            if (global.SNCli && SNCli.commitRealGps) {
              SNCli.commitRealGps({ lat: lat, lng: lng, accuracy: acc, source: 'gps' });
            }
          } catch (_) {}
        },
        function (err) {
          var msg =
            err && err.code === 1
              ? 'Location blocked · tap to allow'
              : 'Location not ready · tap to try';
          setFact('place', msg, 'wait');
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 30000 }
      );
    } catch (_) {
      setFact('place', 'Location not ready · tap to try', 'wait');
    }
  }

  function collectHuman() {
    probeNetwork();
    probeDevice();
    probePlace(false);
    setFact('cache', 'Clearing old files so you get this build…', 'wait');
    setFact('login', 'Looking for your last sign-in…', 'wait');
    setFact('reset', 'Hard reset wipes stored pages and restarts. Tap only if stuck.', 'ok');
    scanLinks();
    setFact('system', 'Loading a fresh kernel…', 'wait');
    window.addEventListener('online', probeNetwork);
    window.addEventListener('offline', probeNetwork);
  }

  /* ───────── Kernel cache claim (every boot) ───────── */
  function hardRestart() {
    try {
      sessionStorage.removeItem('sn:os-hard-reload');
    } catch (_) {}
    var u = '/?boot=' + encodeURIComponent(BUILD) + '&t=' + Date.now();
    try {
      location.replace(u);
    } catch (_) {
      location.reload();
    }
  }

  function claimBrowser() {
    hdr('STAGE · kernel cache');
    info('clear cache · this browser · build ' + BUILD);
    setFact('cache', 'Clearing old files so you get this build…', 'wait');
    var jobs = [];
    try {
      if (navigator.storage && navigator.storage.persist) {
        jobs.push(
          navigator.storage.persist().then(function (granted) {
            if (granted) ok('browser persist · user data held');
            else info('browser persist · not granted · keys still local');
          })
        );
      }
    } catch (_) {}
    try {
      if (window.caches && caches.keys) {
        jobs.push(
          caches.keys().then(function (keys) {
            return Promise.all(
              keys.map(function (k) {
                return caches.delete(k);
              })
            ).then(function () {
              ok('cache storage · ' + keys.length + ' wiped');
            });
          })
        );
      }
    } catch (_) {}
    try {
      setTimeout(function () {
        try {
          if (!navigator.serviceWorker) return;
          navigator.serviceWorker
            .register('/sw.js?v=' + encodeURIComponent(BUILD), {
              scope: '/',
              updateViaCache: 'none',
            })
            .then(function (reg) {
              try {
                if (reg.active) reg.active.postMessage({ type: 'SN_PURGE', build: BUILD });
              } catch (_) {}
            })
            .catch(function () {});
        } catch (_) {}
      }, 8000);
    } catch (_) {}
    try {
      var u = new URL(location.href);
      if (
        u.searchParams.has('boot') ||
        u.searchParams.has('sn-probe') ||
        u.searchParams.has('_sn_reload') ||
        u.searchParams.has('t')
      ) {
        u.searchParams.delete('boot');
        u.searchParams.delete('sn-probe');
        u.searchParams.delete('_sn_reload');
        u.searchParams.delete('t');
        u.searchParams.delete('v');
        history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
      }
    } catch (_) {}
    return Promise.all(jobs)
      .catch(function () {})
      .then(function () {
        setFact('cache', 'Caches cleared · this build is live. Tap to clear again.', 'ok');
      });
  }

  /* ───────── Script loader ───────── */
  function originsFor(src) {
    if (/^https?:\/\//i.test(src)) return [src];
    var path = String(src || '').replace(/^\//, '').split('?')[0];
    var local = '/' + path + (src.indexOf('?') >= 0 ? src.slice(src.indexOf('?')) : '');
    if (local.indexOf('?') < 0) local += '?v=' + encodeURIComponent(BUILD);
    else if (local.indexOf('v=') < 0) local += '&v=' + encodeURIComponent(BUILD);
    var list = [local];
    try {
      var base = String(global.SN_ASSET_BASE || '').replace(/\/$/, '');
      if (base && base.indexOf(location.origin) !== 0 && base.indexOf('jsdelivr') < 0)
        list.push(base + '/' + path + '?v=' + encodeURIComponent(BUILD));
    } catch (_) {}
    var seen = {};
    return list.filter(function (u) {
      if (seen[u] || /jsdelivr\.net/i.test(u)) return false;
      seen[u] = 1;
      return true;
    });
  }

  function injectCode(code, url) {
    var s = document.createElement('script');
    s.text = code;
    if (url) s.setAttribute('data-sn-src', String(url).slice(0, 180));
    document.head.appendChild(s);
  }

  function loadUrl(url, timeoutMs) {
    timeoutMs = timeoutMs || 12000;
    return new Promise(function (resolve, reject) {
      var done = false;
      var to = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, timeoutMs);
      function finish(ok, err) {
        if (done) return;
        done = true;
        clearTimeout(to);
        if (ok) {
          report.loadStats.ok++;
          if (/jsdelivr|cdnjs|unpkg/i.test(url)) report.loadStats.cdn++;
          resolve(url);
        } else {
          report.loadStats.fail++;
          reject(err || new Error('load fail'));
        }
      }
      var sameOrigin = url.indexOf('/') === 0 || (function () {
        try { return new URL(url, location.href).origin === location.origin; } catch (_) { return false; }
      })();
      if (!sameOrigin) {
        var s0 = document.createElement('script');
        s0.async = true;
        s0.src = url;
        s0.onload = function () {
          finish(true);
        };
        s0.onerror = function () {
          try { s0.remove(); } catch (_) {}
          finish(false, new Error('load fail'));
        };
        document.head.appendChild(s0);
        return;
      }
      var fo = { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } };
      fetch(url, fo)
        .then(function (r) {
          if (!r.ok) throw new Error('http ' + r.status);
          return r.text();
        })
        .then(function (code) {
          try {
            injectCode(code, url);
            finish(true);
          } catch (e) {
            finish(false, e);
          }
        })
        .catch(function () {
          var s = document.createElement('script');
          s.async = true;
          s.src = url;
          s.onload = function () {
            finish(true);
          };
          s.onerror = function () {
            try {
              s.remove();
            } catch (_) {}
            finish(false, new Error('load fail'));
          };
          document.head.appendChild(s);
        });
    });
  }

  function loadScript(src, timeoutMs) {
    var urls = originsFor(src);
    var i = 0;
    function next() {
      if (i >= urls.length) return Promise.reject(new Error('all origins fail · ' + src));
      var u = urls[i++];
      return loadUrl(u, timeoutMs || 12000).catch(function () {
        return next();
      });
    }
    return next();
  }

  function loadStage(name, list, opts) {
    opts = opts || {};
    hdr('STAGE · ' + name);
    report.stages.push({ name: name, start: performance.now() - t0 });
    var soft = opts.soft !== false;
    return Promise.all(
      list.map(function (src) {
        var short = String(src).split('/').pop();
        info('load ' + short);
        return loadScript(src, opts.timeout || 12000)
          .then(function (url) {
            var via = url.indexOf('jsdelivr') >= 0 ? 'cdn' : 'local';
            ok(short + ' · ' + via + ' · ' + Math.round(performance.now() - t0) + 'ms');
            return { src: src, ok: true, url: url };
          })
          .catch(function (e) {
            if (soft) {
              warn(short + ' · missing · continuing');
              return { src: src, ok: false, error: String(e && e.message ? e.message : e) };
            }
            fail(short + ' · ' + (e && e.message ? e.message : e));
            return Promise.reject(e);
          });
      })
    );
  }

  /* ───────── Stages ───────── */
  var STAGE_KERNEL = [
    '/js/spacenet/skin.js',
    '/js/spacenet/config.js',
    '/js/spacenet/currency.js',
    '/js/spacenet/game-loop.js',
    '/js/spacenet/profiles.js',
    '/js/spacenet/cli.js',
    '/js/spacenet/guardian.js',
    '/js/spacenet/ui.js',
  ];
  var STAGE_DISPLAY = [
    '/js/spacenet/spacenet-grid.js',
    '/js/spacenet/globe.js',
    '/js/spacenet/ephemeris.js',
    '/js/spacenet/sky-bodies.js',
    '/js/spacenet/cosmos.js',
  ];
  var STAGE_DRIVERS = [
    '/js/spacenet/map.js',
    '/js/spacenet/topo.js',
    '/js/spacenet/tile.js',
    '/js/spacenet/tasks.js',
    '/js/spacenet/search.js',
    '/js/spacenet/youtube.js',
    '/js/spacenet/spacexai.js',
    '/js/spacenet/omni-engine.js',
    '/js/spacenet/brain.js',
    '/js/spacenet/market.js',
    '/js/spacenet/chrome-market.js',
    '/js/spacenet/places-business.js',
    '/js/spacenet/commerce.js',
    '/js/spacenet/task-runner.js',
    '/js/spacenet/field.js',
    '/js/spacenet/routing.js',
    '/js/spacenet/delivery-rules.js',
    '/js/spacenet/order-engine.js',
    '/js/spacenet/offer-stack.js',
    '/js/spacenet/poly-engine.js',
    '/js/spacenet/reassign-engine.js',
    '/js/spacenet/mesh-orders.js',
    '/js/spacenet/wish-inbox.js',
    '/js/spacenet/poly-scheduler.js',
    '/js/spacenet/marina-berths.js',
    '/js/spacenet/home.js',
    '/js/spacenet/village.js',
    '/js/spacenet/helper.js',
    '/js/spacenet/space-stage.js',
    '/js/spacenet/live-bridge.js',
    '/js/spacenet/usage.js',
    '/js/spacenet/scenarios.js',
    '/js/spacenet/prefs.js',
    '/js/spacenet/webrtc.js',
    '/js/spacenet/chrome-p0-ops.js',
  ];
  var STAGE_SERVICES = [
    '/js/spacenet/greeklish.js',
    '/js/spacenet/arcangelo-dialect.js',
    '/js/spacenet/free-ai.js',
    '/js/spacenet/subscription.js',
    '/js/spacenet/ai.js',
    '/js/spacenet/omma.js',
    '/js/spacenet/fluid.js',
    '/js/spacenet/pulse.js',
    '/js/spacenet/phone-os.js',
    '/js/spacenet/spacexai.js',
    '/js/spacenet/youtube.js',
    '/js/spacenet/os-will.js',
    '/js/spacenet/agent-orbit.js',
  ];

  function loadThree() {
    hdr('STAGE · graphics engine');
    info('THREE.js');
    return loadUrl(
      'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
      14000
    )
      .catch(function () {
        warn('cdnjs failed · try jsdelivr');
        return loadUrl('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', 14000);
      })
      .then(function () {
        recordCheck('THREE', !!global.THREE, global.THREE ? 'r' + (global.THREE.REVISION || '?') : 'missing', 'Check network · CDN block · retry boot');
      })
      .catch(function (e) {
        recordCheck('THREE', false, String(e && e.message ? e.message : e), 'Allow CDN or host three.min.js locally');
      });
  }

  function checkDom() {
    hdr('STAGE · preflight');
    recordCheck('document', !!document.body, document.readyState, 'Reload page');
    recordCheck('boot-root', !!document.getElementById('boot') || !!bootEl, 'overlay', 'index.html #boot missing');
    recordCheck('globe-host', !!document.getElementById('globe'), '#globe', 'index.html #globe missing');
    recordCheck('cli-host', !!document.getElementById('cli-log') && !!document.getElementById('cli-in'), '#cli-log + #cli-in', 'index.html dock/CLI missing');
    recordCheck('topchrome', !!document.getElementById('sn-topchrome'), '#sn-topchrome', 'index.html top chrome missing');
    recordCheck('localStorage', (function () {
      try {
        localStorage.setItem('sn:os-probe', '1');
        localStorage.removeItem('sn:os-probe');
        return true;
      } catch (_) {
        return false;
      }
    })(), 'rw', 'Private mode may block storage · prefs will not persist');
    var ua = (navigator.userAgent || '').slice(0, 80);
    info('device · ' + ua);
    info('viewport · ' + window.innerWidth + '×' + window.innerHeight);
    info('online · ' + (navigator.onLine ? 'yes' : 'no'));
  }

  function initKernel() {
    hdr('STAGE · kernel init');
    try {
      if (global.SNCli && SNCli.init) {
        SNCli.init();
        recordCheck('SNCli', true, 'init', null);
      } else recordCheck('SNCli', false, 'no global', 'cli.js failed to load · repair kernel');
    } catch (e) {
      recordCheck('SNCli', false, e.message || e, 'repair kernel');
    }
    try {
      if (global.SNUi && SNUi.init) SNUi.init();
      recordCheck('SNUi', !!global.SNUi, global.SNUi ? 'ok' : 'missing', null);
    } catch (e) {
      recordCheck('SNUi', false, e.message || e, null);
    }
    try {
      if (global.SNGameLoop) {
        if (SNGameLoop.power) SNGameLoop.power();
        else if (SNGameLoop.start) SNGameLoop.start();
        recordCheck('SNGameLoop', true, 'powered', null);
      } else recordCheck('SNGameLoop', false, 'missing', 'game-loop.js');
    } catch (e) {
      recordCheck('SNGameLoop', false, e.message || e, null);
    }
    // Kill game chrome forever on money path
    try {
      document.body.classList.remove('sn-space-scene-on', 'sn-game-dock-on', 'sn-game-on');
      var gd = document.getElementById('sn-game-dock');
      if (gd) gd.remove();
    } catch (_) {}
  }

  function initDisplay() {
    hdr('STAGE · display · Earth');
    var okG = false;
    try {
      if (global.SNGlobe && typeof SNGlobe.init === 'function') {
        okG = !!SNGlobe.init();
      }
    } catch (e) {
      fail('globe init exception · ' + (e && e.message ? e.message : e));
    }
    var canvas = document.querySelector('#globe canvas');
    var cw = canvas ? canvas.width : 0;
    var ch = canvas ? canvas.height : 0;
    recordCheck('SNGlobe', !!global.SNGlobe, global.SNGlobe ? 'present' : 'missing', 'Reload · check globe.js + THREE');
    recordCheck(
      'globe-canvas',
      !!(canvas && cw > 8 && ch > 8),
      canvas ? cw + '×' + ch : 'no canvas',
      'initGlobe failed · type: repair display'
    );
    recordCheck('globe-init', okG || !!(canvas && cw > 8), okG ? 'init true' : canvas ? 'canvas without init flag' : 'failed', 'repair display');
    if (canvas && cw > 8) revealEarth();
    setSub(canvas ? 'EARTH ONLINE' : 'WAKING EARTH');
    // Physics probe
    try {
      if (global.SNGlobe && SNGlobe.getPhysics) {
        var ph = SNGlobe.getPhysics();
        recordCheck('globe-physics', !!(ph && ph.inertia !== undefined), ph ? 'inertia=' + ph.inertia + ' tier=' + ph.tier : 'n/a', null);
      }
    } catch (_) {}
    try {
      var liteSky = !!(global._snLite || (global.SNPerf && SNPerf.lite));
      if (liteSky) {
        recordCheck('SNSkyBodies', !!global.SNSkyBodies, 'deferred on phone', null);
        setTimeout(function () {
          try { if (global.SNSkyBodies && SNSkyBodies.init) SNSkyBodies.init(); } catch (_) {}
        }, 1800);
      } else if (global.SNSkyBodies && SNSkyBodies.init) {
        SNSkyBodies.init();
        recordCheck('SNSkyBodies', true, 'live sky · sun moon planets', null);
      } else recordCheck('SNSkyBodies', !!global.SNSkyBodies, 'module', 'ephemeris.js + sky-bodies.js');
    } catch (e) {
      recordCheck('SNSkyBodies', false, e.message || e, null);
    }
    return !!(canvas && cw > 8 && ch > 8);
  }

  function initDrivers() {
    hdr('STAGE · drivers');
    function softInit(name, g, fn) {
      try {
        if (g && typeof g[fn] === 'function') {
          g[fn]();
          recordCheck(name, true, fn + '()', null);
          return true;
        }
        recordCheck(name, !!g, g ? 'no ' + fn : 'missing', 'module load failed');
        return !!g;
      } catch (e) {
        recordCheck(name, false, e.message || e, 'repair drivers');
        return false;
      }
    }
    softInit('SNField', global.SNField, 'init');
    try { recordCheck('SNTopo', !!global.SNTopo, global.SNTopo ? 'add shop/pin/social' : 'missing', 'topo.js'); } catch (_) {}
    try { recordCheck('SNTile', !!global.SNTile, global.SNTile ? 'vendor menus' : 'missing', 'tile.js'); } catch (_) {}
    try { recordCheck('SNRouting', !!global.SNRouting, global.SNRouting ? 'osrm' : 'missing', 'routing.js'); } catch (_) {}
    try { recordCheck('SNOrderEngine', !!global.SNOrderEngine, global.SNOrderEngine ? 'orders' : 'missing', 'order-engine.js'); } catch (_) {}
    softInit('SNOfferStack', global.SNOfferStack, 'init');
    softInit('SNPolyScheduler', global.SNPolyScheduler, 'init');
    softInit('SNPolyEngine', global.SNPolyEngine, 'init');
    softInit('SNReassignEngine', global.SNReassignEngine, 'init');
    softInit('SNWishInbox', global.SNWishInbox, 'init');
    softInit('SNMarina', global.SNMarina, 'init');
    softInit('SNHome', global.SNHome, 'init');
    try {
      recordCheck('SNSearch', !!(global.SNSearch && SNSearch.nearby), global.SNSearch ? 'shops nearby' : 'missing', 'search.js');
    } catch (e) {
      recordCheck('SNSearch', false, e.message || e, 'search.js');
    }
    try {
      recordCheck('SNMarket', !!(global.SNMarket && SNMarket.fulfillFoodIntent), global.SNMarket ? 'orders' : 'missing', 'market.js');
    } catch (e) {
      recordCheck('SNMarket', false, e.message || e, 'market.js');
    }
    try {
      recordCheck('SNTaskRunner', !!(global.SNTaskRunner && SNTaskRunner.runText), global.SNTaskRunner ? 'missions' : 'missing', 'task-runner.js');
    } catch (e) {
      recordCheck('SNTaskRunner', false, e.message || e, 'task-runner.js');
    }
    try {
      if (global.SNHelper && SNHelper.init) SNHelper.init({ autoWake: true });
      recordCheck('SNHelper', !!global.SNHelper, 'awake', null);
    } catch (e) {
      recordCheck('SNHelper', false, e.message || e, null);
    }
    try {
      if (global.SNGlobe && SNGlobe.setGameMode) SNGlobe.setGameMode(false);
    } catch (_) {}
    softInit('SNWebRTC', global.SNWebRTC, 'init');
    softInit('SNStage', global.SNStage, 'init');
  }

  function initServices() {
    hdr('STAGE · services');
    try {
      if (global.SNSubscription && SNSubscription.init) SNSubscription.init();
      recordCheck('SNSubscription', !!global.SNSubscription, global.SNSubscription && SNSubscription.status ? SNSubscription.status().mode : 'n/a', 'subscribe via PayPal · owner login for free Grok path');
    } catch (e) {
      recordCheck('SNSubscription', false, e.message || e, null);
    }
    try {
      if (global.SNAi && SNAi.bootPresence) SNAi.bootPresence();
      recordCheck('SNAi', !!global.SNAi, 'present', null);
    } catch (e) {
      recordCheck('SNAi', false, e.message || e, null);
    }
    try {
      recordCheck('SNOmma', !!(global.SNOmma && SNOmma.introduce), global.SNOmma ? 'eye' : 'missing', 'omma.js');
    } catch (e) {
      recordCheck('SNOmma', false, e.message || e, 'omma.js');
    }
    try {
      if (global.SNFluid && SNFluid.init) SNFluid.init();
      recordCheck('SNFluid', !!(global.SNFluid && SNFluid.pull), 'live wire', 'fluid.js');
    } catch (e) {
      recordCheck('SNFluid', false, e.message || e, 'fluid.js');
    }
    try {
      if (global.SNSpaceXai && SNSpaceXai.ready) {
        recordCheck('flight', true, 'ready', null);
      }
    } catch (e) {
      recordCheck('SNSpaceXai', false, e.message || e, 'spacexai.js');
    }
    try {
      if (global.SNAgentOrbit && SNAgentOrbit.init) SNAgentOrbit.init();
      if (global.SNAgentOrbit && SNAgentOrbit.goOrbit) {
        setTimeout(function () {
          try { SNAgentOrbit.goOrbit({ quiet: true, noFly: true }); } catch (_) {}
        }, 900);
      }
      recordCheck('SNAgentOrbit', !!global.SNAgentOrbit, 'collective planet', 'agent-orbit.js');
    } catch (e) {
      recordCheck('SNAgentOrbit', false, e.message || e, 'agent-orbit.js');
    }
    try {
      if (global.SNOsWill && SNOsWill.init) SNOsWill.init();
      if (global.SNOsWill && SNOsWill.rehydrate) SNOsWill.rehydrate();
      recordCheck('SNOsWill', !!global.SNOsWill, 'dynamic OS · every user is a developer', null);
    } catch (e) {
      recordCheck('SNOsWill', false, e.message || e, null);
    }
    try {
      recordCheck('SNAstranovMind', !!(global.SNAstranovMind || global.SNFreeMind), 'free mind', null);
    } catch (_) {}
  }

  function softAuth() {
    hdr('STAGE · auth (soft)');
    return loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js', 12000)
      .then(function () {
        ok('supabase-js');
        return loadScript('/js/spacenet/auth.js', 8000);
      })
      .then(function () {
        try {
          if (global.SNAuth && SNAuth.init) SNAuth.init();
          recordCheck('SNAuth', !!global.SNAuth, 'init', null);
          loginTries = 0;
          watchLogin();
        } catch (e) {
          recordCheck('SNAuth', false, e.message || e, null);
          setFact('login', 'Login module failed · tap User after enter', 'wait');
        }
      })
      .catch(function (e) {
        warn('auth soft-fail · ' + (e && e.message ? e.message : e));
        recordCheck('SNAuth', false, 'soft-fail', 'Auth optional until login · CORS on api.astranov.eu may block health');
      });
  }

  /* ───────── Health gate ───────── */
  function runHealthGate() {
    hdr('STAGE · health gate');
    var critical = ['document', 'cli-host', 'globe-host', 'SNCli', 'globe-canvas'];
    var failed = report.checks.filter(function (c) {
      return critical.indexOf(c.id) >= 0 && !c.pass;
    });
    var warnN = report.checks.filter(function (c) {
      return !c.pass;
    }).length;
    var passN = report.checks.filter(function (c) {
      return c.pass;
    }).length;
    info('checks · ' + passN + ' pass · ' + warnN + ' fail/warn · load ok ' + report.loadStats.ok + ' fail ' + report.loadStats.fail);
    if (failed.length) {
      report.degraded = true;
      report.ready = false;
      fail('HEALTH · ' + failed.length + ' critical failure(s)');
      failed.forEach(function (f) {
        fail('  · ' + f.id + (f.detail ? ' · ' + f.detail : ''));
        if (f.fix) fix(f.fix);
      });
      return false;
    }
    // globe required for ready
    var canvas = document.querySelector('#globe canvas');
    if (!canvas) {
      report.degraded = true;
      report.ready = false;
      fail('HEALTH · no globe canvas');
      fix('Type: repair display · or Retry boot');
      return false;
    }
    report.ready = true;
    report.degraded = warnN > 0;
    ok('HEALTH · system ' + (report.degraded ? 'DEGRADED but OPERATIONAL' : 'READY'));
    return true;
  }

  /* ───────── Repair ───────── */
  function repairDisplay() {
    hdr('REPAIR · display');
    return loadThree()
      .then(function () {
        return loadStage('display-repair', STAGE_DISPLAY, { soft: true });
      })
      .then(function () {
        var okC = initDisplay();
        if (okC) ok('repair display · canvas up');
        else fail('repair display · still no canvas');
        return okC;
      });
  }

  function repairKernel() {
    hdr('REPAIR · kernel');
    return loadStage('kernel-repair', STAGE_KERNEL, { soft: true }).then(function () {
      initKernel();
      return !!global.SNCli;
    });
  }

  function repairDrivers() {
    hdr('REPAIR · drivers');
    return loadStage('drivers-repair', STAGE_DRIVERS, { soft: true }).then(function () {
      initDrivers();
      return !!global.SNPolyScheduler;
    });
  }

  function fullDiagnostics() {
    hdr('DIAGNOSTICS · live');
    var items = [
      ['THREE', !!global.THREE],
      ['SNGlobe', !!global.SNGlobe],
      ['canvas', !!document.querySelector('#globe canvas')],
      ['SNCli', !!global.SNCli],
      ['SNField', !!global.SNField],
      ['SNPolyScheduler', !!global.SNPolyScheduler],
      ['SNPolyEngine', !!global.SNPolyEngine],
      ['SNReassignEngine', !!global.SNReassignEngine],
      ['SNSubscription', !!global.SNSubscription],
      ['SNAi', !!global.SNAi],
      ['SNAuth', !!global.SNAuth],
      ['SNMap', !!global.SNMap],
      ['power-btn', !!document.getElementById('sn-task-launch')],
    ];
    items.forEach(function (it) {
      if (it[1]) ok(it[0]);
      else fail(it[0] + ' · missing');
    });
    try {
      fetch('/api/health')
        .then(function (r) {
          return r.json();
        })
        .then(function (h) {
          ok('api/health · xai=' + !!h.xai + ' · paypal=' + !!h.paypal);
        })
        .catch(function () {
          warn('api/health · unreachable (static host ok)');
        });
    } catch (_) {}
    return items;
  }

  /* ───────── Handoff ───────── */
  function enterSystem() {
    if (entered) return;
    entered = true;
    minimizeBootToCli();
  }

  function showEnterGate(success) {
    gateReady = true;
    var canvas = document.querySelector('#globe canvas');
    setFact('graphics', canvas ? 'Earth ready' : 'Earth not ready · tap to repair', canvas ? 'ok' : 'bad');
    if (success) {
      setSub('Review this screen · then enter');
      setFact('system', 'Ready', 'ok');
      setActions([
        { label: '> enter astranov', enter: true, fn: enterSystem },
      ]);
    } else {
      setSub('Something needs you · or enter anyway');
      setFact('system', 'Not fully ready', 'bad');
      setActions([
        { label: '> repair graphics', enter: false, fn: function () { repairDisplay(); } },
        { label: '> enter anyway', enter: true, fn: enterSystem },
        { label: '> hard boot', enter: false, fn: hardRestart },
      ]);
    }
    try {
      document.addEventListener('keydown', function onKey(ev) {
        if (!gateReady || entered) return;
        if (ev.key === 'Enter' && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
          ev.preventDefault();
          enterSystem();
        }
      });
    } catch (_) {}
  }

  function handoff(success) {
    hdr(success ? 'HANDOFF · operational' : 'HANDOFF · degraded');
    var ms = Math.round(performance.now() - t0);
    report.finishedAt = new Date().toISOString();
    report.bootMs = ms;
    try {
      localStorage.setItem('sn:os-boot-report', JSON.stringify(report));
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.init) SNCli.init();
    } catch (_) {}
    installCliHooks();
    enterSystem();
    global.SNOsBoot = api;
    global.__snBooting = 0;
    try {
      document.dispatchEvent(new CustomEvent('sn:os-ready', { detail: report }));
    } catch (_) {}
  }

  /**
   * Leave the boot sheet. CLI gets a few glowing clickable lines — no machine dump.
   */
  function minimizeBootToCli() {
    try {
      // Ensure map not covering globe
      try {
        if (global.SNMap && SNMap.active && SNMap.close) SNMap.close();
      } catch (_) {}
      // Ensure globe at GLOBAL if stuck deep without canvas sense
      try {
        if (global.SNGlobe) {
          var face = null;
          try {
            face = global._snPhysPos || global._snLastPos;
          } catch (_) {}
          var lat = face && face.lat != null ? face.lat : 36.387557;
          var lng = face && face.lng != null ? face.lng : 28.222533;
          if (SNGlobe.goToPlace) {
            SNGlobe.goToPlace(lat, lng, { tier: 'national', label: face ? 'You' : 'KALITHEA', body: 'earth', pulse: true, color: 0x14c3f3 });
          } else if (SNGlobe.goToTier) {
            SNGlobe.goToTier('global');
          }
        }
      } catch (_) {}

      try {
        if (global.SNCli && SNCli.init) SNCli.init();
      } catch (_) {}
      try {
        /* stay collapsed — no mid expand, no instructional dump above CLI */
        var panel = document.getElementById('panel');
        if (panel) {
          panel.classList.add('collapsed');
          panel.classList.remove('mid', 'expanded');
          panel.style.removeProperty('max-height');
        }
      } catch (_) {}
      try {
        /* NEVER write coach/instruction into CLI or placeholders */
        var coach = document.getElementById('cli-coach');
        if (coach && coach.parentNode) coach.parentNode.removeChild(coach);
      } catch (_) {}
      try {
        var signed = false;
        try {
          signed = !!(global.SNAuth && SNAuth.user);
        } catch (_) {}
        if (signed && global.SNHelper) {
          if (SNHelper.init) SNHelper.init({ autoWake: true });
        }
      } catch (_) {}
      try {
        if (global.SNLiveBridge && SNLiveBridge.start) SNLiveBridge.start();
      } catch (_) {}
      try {
        if (global.SNPhoneOS && SNPhoneOS.boot) SNPhoneOS.boot();
      } catch (_) {}
      try {
        if (global.SNPulse && SNPulse.boot) {
          var on = false;
          try {
            on = !!(global.SNAuth && SNAuth.user);
          } catch (_) {}
          SNPulse.boot(on ? 'login' : 'boot');
        }
      } catch (_) {}
    } catch (_) {}
    materializeHud();
    setSub('HUD');
    try {
      if (bootEl) bootEl.classList.add('sn-os-reveal', 'os-earth');
    } catch (_) {}
    setTimeout(killOverlay, 1250);
  }

  function killOverlay() {
    try {
      materializeHud();
      var el = document.getElementById('boot') || bootEl;
      if (!el) return;
      el.classList.add('sn-os-reveal', 'hide');
      el.setAttribute('aria-busy', 'false');
      el.style.setProperty('pointer-events', 'none', 'important');
      setTimeout(function () {
        try {
          el.style.setProperty('display', 'none', 'important');
          el.remove();
        } catch (_) {}
      }, 1300);
    } catch (_) {}
  }

  function installCliHooks() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snOsBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        var low = String(raw || '').trim().toLowerCase();
        if (
          low === 'boot' ||
          low === 'diagnostics' ||
          low === 'diag' ||
          low === 'repair' ||
          low === 'repair display' ||
          low === 'repair kernel' ||
          low === 'repair drivers' ||
          low === 'kernel status' ||
          low === 'os status' ||
          low === 'boot report' ||
          low === 'purge' ||
          low === 'hard boot' ||
          low === 'hard reload' ||
          low === 'clear cache' ||
          low === 'enter' ||
          low === 'enter astranov' ||
          low === 'go' ||
          low === 'battery' ||
          low === 'heat' ||
          low === 'device' ||
          low === 'status'
        ) {
          try {
            if (SNCli.beginTurn) SNCli.beginTurn();
          } catch (_) {}
          try {
            if (SNCli.log) SNCli.log(String(raw).trim(), 'cmd');
          } catch (_) {}
          if (low === 'boot' || low === 'boot report' || low === 'kernel status' || low === 'os status') {
            SNCli.log('Astranov SpaceNet Operating System · ' + (report.ready ? 'READY' : 'NOT READY') + ' · ' + (report.bootMs || '?') + 'ms · build ' + BUILD, report.ready ? 'ok' : 'err');
            report.checks.slice(-20).forEach(function (c) {
              SNCli.log((c.pass ? '✓ ' : '✗ ') + c.id + (c.detail ? ' · ' + c.detail : ''), c.pass ? 'ok' : 'err');
            });
          } else if (low === 'diagnostics' || low === 'diag') {
            fullDiagnostics();
            lines.slice(-40).forEach(function (L) {
              if (SNCli.log) SNCli.log(L.tag + ' ' + L.msg, L.lvl === 'fail' ? 'err' : L.lvl === 'ok' ? 'ok' : 'dim', true);
            });
          } else if (low === 'repair' || low === 'repair display') {
            await repairDisplay();
          } else if (low === 'repair kernel') {
            await repairKernel();
          } else if (low === 'repair drivers') {
            await repairDrivers();
          } else if (low === 'purge' || low === 'hard boot' || low === 'hard reload' || low === 'clear cache') {
            SNCli.log('Hard boot · wiping kernel cache · restart', 'ok');
            hardRestart();
          } else if (low === 'enter' || low === 'enter astranov' || low === 'go') {
            enterSystem();
          } else if (low === 'battery' || low === 'heat' || low === 'device' || low === 'status' || low === 'power') {
            SNCli.log('Device · ' + facts.device.text, 'ok', true);
            SNCli.log('Power · ' + facts.power.text, 'ok', true);
            SNCli.log('Network · ' + facts.network.text, 'ok', true);
            SNCli.log('Place · ' + facts.place.text, 'ok', true);
            SNCli.log('Cache · ' + facts.cache.text, 'ok', true);
            SNCli.log('Login · ' + facts.login.text, 'ok', true);
          }
          try {
            if (SNCli.endTurn) SNCli.endTurn();
          } catch (_) {}
          return;
        }
        return orig(raw);
      };
      SNCli._snOsBound = SNCli.run;
    } catch (_) {}
  }

  /* ───────── SNLoader bridge (compat) ───────── */
  function installLoader() {
    var MODULE_MAP = {
      engine: { src: '/js/spacenet/poly-engine.js', global: 'SNPolyEngine' },
      reassign: { src: '/js/spacenet/reassign-engine.js', global: 'SNReassignEngine' },
      poly: { src: '/js/spacenet/poly-scheduler.js', global: 'SNPolyScheduler' },
      money: { src: '/js/spacenet/poly-scheduler.js', global: 'SNPolyScheduler' },
      offers: { src: '/js/spacenet/poly-scheduler.js', global: 'SNPolyScheduler' },
      field: { src: '/js/spacenet/field.js', global: 'SNField' },
      map: { src: '/js/spacenet/map.js', global: 'SNMap' },
      globe: { src: '/js/spacenet/globe.js', global: 'SNGlobe' },
      ai: { src: '/js/spacenet/ai.js', global: 'SNAi' },
      subscription: { src: '/js/spacenet/subscription.js', global: 'SNSubscription' },
      will: { src: '/js/spacenet/os-will.js', global: 'SNOsWill' },
      'os-will': { src: '/js/spacenet/os-will.js', global: 'SNOsWill' },
      auth: { src: '/js/spacenet/auth.js', global: 'SNAuth' },
      youtube: { src: '/js/spacenet/youtube.js', global: 'SNYoutube' },
      search: { src: '/js/spacenet/search.js', global: 'SNSearch' },
      omni: { src: '/js/spacenet/omni-engine.js', global: 'SNOmni' },
      brain: { src: '/js/spacenet/brain.js', global: 'SNBrain' },
      spacexai: { src: '/js/spacenet/spacexai.js', global: 'SNSpaceXai' },
      webrtc: { src: '/js/spacenet/webrtc.js', global: 'SNWebRTC' },
      stage: { src: '/js/spacenet/space-stage.js', global: 'SNStage' },
      'space-stage': { src: '/js/spacenet/space-stage.js', global: 'SNStage' },
      bridge: { src: '/js/spacenet/live-bridge.js', global: 'SNLiveBridge' },
      'live-bridge': { src: '/js/spacenet/live-bridge.js', global: 'SNLiveBridge' },
      pulse: { src: '/js/spacenet/pulse.js', global: 'SNPulse' },
      fluid: { src: '/js/spacenet/fluid.js', global: 'SNFluid' },
      phone: { src: '/js/spacenet/phone-os.js', global: 'SNPhoneOS' },
      'phone-os': { src: '/js/spacenet/phone-os.js', global: 'SNPhoneOS' },
      usage: { src: '/js/spacenet/usage.js', global: 'SNUsage' },
      scenarios: { src: '/js/spacenet/scenarios.js', global: 'SNScenarios' },
      prefs: { src: '/js/spacenet/prefs.js', global: 'SNPrefs' },
      guardian: { src: '/js/spacenet/guardian.js', global: 'SNGuardian' },
      spacescene: { src: '/js/spacenet/space-scene.js', global: 'SNSpaceScene' },
      'space-scene': { src: '/js/spacenet/space-scene.js', global: 'SNSpaceScene' },
      invaders: { src: '/js/spacenet/invaders.js', global: 'SNInvaders' },
      helper: { src: '/js/spacenet/helper.js', global: 'SNHelper' },
      marina: { src: '/js/spacenet/marina-berths.js', global: 'SNMarina' },
      tasks: { src: '/js/spacenet/tasks.js', global: 'SNTasks' },
      home: { src: '/js/spacenet/home.js', global: 'SNHome' },
      wish: { src: '/js/spacenet/wish-inbox.js', global: 'SNWishInbox' },
      'free-ai': { src: '/js/spacenet/free-ai.js', global: 'SNFreeMind' },
      'ai-graphics': { src: '/js/spacenet/ai-graphics.js', global: 'SNAIGraphics' },
      call: { src: '/js/spacenet/webrtc.js', global: 'SNWebRTC' },
      earthops: { src: '/js/spacenet/earth-ops.js', global: 'SNEarthOps' },
      'earth-ops': { src: '/js/spacenet/earth-ops.js', global: 'SNEarthOps' },
      gaming: { src: '/js/spacenet/game-dock.js', global: 'SNGameDock' },
      game: { src: '/js/spacenet/game-dock.js', global: 'SNGameDock' },
      ops: { src: '/js/spacenet/earth-ops.js', global: 'SNEarthOps' },
    };
    global.SNLoader = {
      _p: {},
      ensure: function (names) {
        var list = Array.isArray(names) ? names : [names];
        var self = this;
        return Promise.all(
          list.map(function (n) {
            var key = String(n || '').toLowerCase();
            if (self._p[key]) return self._p[key];
            var entry = MODULE_MAP[key];
            if (!entry) return Promise.resolve();
            if (entry.global && global[entry.global]) return Promise.resolve();
            self._p[key] = loadScript(entry.src, 12000);
            return self._p[key];
          })
        );
      },
    };
    global.SNRecover = function (opts) {
      try {
        if (global.SNGlobe && SNGlobe.setGameMode) SNGlobe.setGameMode(false);
      } catch (_) {}
      try {
        document.body.classList.remove('sn-space-scene-on', 'sn-game-on');
      } catch (_) {}
      return true;
    };
    global.SNPerf = global.SNPerf || {};
  }

  /* ───────── MAIN SEQUENCE ───────── */
  async function boot() {
    ensureConsole();
    installLoader();
    collectHuman();
    setSub('LINK');
    setTimeout(function () {
      if (entered) return;
      try {
        if (global.SNGuardian && SNGuardian.sos) SNGuardian.sos('boot-deadline-12s');
      } catch (_) {}
      try {
        enterSystem();
      } catch (_) {}
    }, 12000);

    try {
      try {
        var purgeSt = await (global.__SN_BOOT_PURGE || Promise.resolve({}));
        if (purgeSt && purgeSt.reloaded) return;
        if (purgeSt && purgeSt.wiped != null) info('early purge · caches ' + purgeSt.wiped);
      } catch (_) {}
      await Promise.race([
        claimBrowser(),
        new Promise(function (r) {
          setTimeout(r, 4000);
        }),
      ]);

      checkDom();

      await loadStage('kernel', STAGE_KERNEL, { soft: true, timeout: 10000 }).catch(async function (e) {
        fail('kernel hard-fail · ' + (e && e.message ? e.message : e));
        fix('Retry boot · check network · CDN');
        await loadStage('kernel-soft', STAGE_KERNEL, { soft: true });
      });
      initKernel();

      setSub('EARTH');
      await loadThree();
      await loadStage('display', STAGE_DISPLAY, { soft: true });
      var displayOk = initDisplay();
      if (!displayOk) {
        warn('display failed · auto-repair once');
        await repairDisplay();
        displayOk = !!document.querySelector('#globe canvas');
      }
      setFact('graphics', displayOk ? 'Earth ready' : 'Earth not ready · tap to repair', displayOk ? 'ok' : 'bad');
      try { if (global.SNGlobe && SNGlobe.paint) SNGlobe.paint(); } catch (_) {}

      // Phone: show Earth NOW. Drivers (shops / delivery / city map) load in background.
      var driversP = loadStage('drivers', STAGE_DRIVERS, { soft: true }).then(function () {
        try { initDrivers(); } catch (e) { warn('drivers init · ' + (e && e.message ? e.message : e)); }
      });

      // Guard: boot must be GLOBAL globe, not a random city dive
    try {
      if (global.SNGlobe && SNGlobe.goToTier && SNGlobe.currentTier) {
        var tier = SNGlobe.currentTier();
        if (tier && tier !== 'global' && tier !== 'orbit' && tier !== 'planet') {
          SNGlobe.goToTier('global');
          warn('boot guard · returned to GLOBAL globe');
        }
      }
    } catch (_) {}
    // Never boot into truncated street map
      try {
        if (global.SNMap && SNMap.active && SNMap.close) {
          SNMap.close();
          warn('closed street map on boot · stay on 3D globe');
        }
      } catch (_) {}
      try {
        document.body.classList.remove('city-map-on');
        var cm = document.getElementById('city-map');
        if (cm) cm.classList.remove('active');
      } catch (_) {}

      // Services non-blocking parallel with auth
      var svc = loadStage('services', STAGE_SERVICES, { soft: true }).then(function () {
        initServices();
      });
      var auth = softAuth();
      await Promise.race([
        Promise.all([svc, auth]),
        new Promise(function (r) {
          setTimeout(r, 8000);
        }),
      ]);
      // don't wait forever on services
      setTimeout(function () {
        try {
          initServices();
        } catch (_) {}
      }, 100);

      var healthy = runHealthGate();
      global.SNPerf.bootMs = Math.round(performance.now() - t0);
      global.SNPerf.shellMs = global.SNPerf.bootMs;
      handoff(healthy);

      // Late service finish
      svc.then(function () {
        initServices();
        installCliHooks();
      }).catch(function () {});
      auth.then(function () {
        installCliHooks();
      }).catch(function () {});
    } catch (e) {
      fail('BOOTLOADER EXCEPTION · ' + (e && e.message ? e.message : e));
      fix('Enter anyway · guardian paged the builder');
      report.ready = false;
      report.degraded = true;
      try {
        if (global.SNGuardian && SNGuardian.sos) SNGuardian.sos('boot-exception', { message: String(e && e.message ? e.message : e) });
      } catch (_) {}
      try {
        enterSystem();
      } catch (_) {
        try {
          entered = true;
          killOverlay();
        } catch (__) {}
      }
    }
  }

  var api = {
    boot: boot,
    report: function () {
      return report;
    },
    lines: function () {
      return lines.slice();
    },
    diagnostics: fullDiagnostics,
    repairDisplay: repairDisplay,
    repairKernel: repairKernel,
    repairDrivers: repairDrivers,
    killOverlay: killOverlay,
    minimizeBootToCli: minimizeBootToCli,
    enterSystem: enterSystem,
    out: out,
  };
  global.SNOsBoot = api;
  global.SNOsBootloader = api;

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
    });
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
