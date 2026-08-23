/**
 * SNConnectivity — field connectivity + RF sense gadget
 * Network type/Mbps/RTT · mesh/P2P · magnetometer µT · watt proxy · map plot
 * CLI: connect · connectivity · rf · signals · connect map
 * Build: 20260812170000-connectivity-gadget
 */
(function (global) {
  'use strict';
  var BUILD = '20260812170000-connectivity-gadget';
  if (global.__SN_CONNECTIVITY === BUILD) return;
  global.__SN_CONNECTIVITY = BUILD;

  var S = {
    ready: false,
    open: false,
    mag: { x: 0, y: 0, z: 0, ut: 0, ok: false, proxy: false },
    lastSample: null,
    _rfMarker: null,
  };

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 280), c || 'ok');
    } catch (_) {}
  }

  function netInfo() {
    var c =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection ||
      null;
    var online = typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
    var type = (c && (c.effectiveType || c.type)) || (online ? 'unknown' : 'none');
    var downlink = c && typeof c.downlink === 'number' ? c.downlink : null;
    var rtt = c && typeof c.rtt === 'number' ? c.rtt : null;
    return {
      online: online,
      type: String(type),
      downlinkMbps: downlink,
      rttMs: rtt,
    };
  }

  function estimateWatts(downlinkMbps) {
    if (downlinkMbps == null || !(downlinkMbps > 0)) return null;
    var mw = Math.min(100, Math.max(0.05, downlinkMbps));
    return 1e-10 * Math.pow(mw, 1.15);
  }

  function formatWatts(w) {
    if (w == null || !(w > 0)) return 'n/a';
    if (w >= 1e-3) return (w * 1e3).toFixed(2) + ' mW';
    if (w >= 1e-6) return (w * 1e6).toFixed(2) + ' µW';
    if (w >= 1e-9) return (w * 1e9).toFixed(2) + ' nW';
    return (w * 1e12).toFixed(2) + ' pW';
  }

  function meshSnap() {
    try {
      if (global.SNMeshNet && SNMeshNet.status) return SNMeshNet.status();
    } catch (_) {}
    return null;
  }

  function magMagnitude(x, y, z) {
    return Math.sqrt(x * x + y * y + z * z);
  }

  function startMagnetometer() {
    try {
      if (typeof Magnetometer !== 'undefined') {
        var mag = new Magnetometer({ frequency: 5 });
        mag.addEventListener('reading', function () {
          S.mag.x = mag.x || 0;
          S.mag.y = mag.y || 0;
          S.mag.z = mag.z || 0;
          S.mag.ut = magMagnitude(S.mag.x, S.mag.y, S.mag.z);
          S.mag.ok = true;
          S.mag.proxy = false;
          paintPanel();
        });
        mag.addEventListener('error', function () {
          S.mag.ok = false;
        });
        mag.start();
        return true;
      }
    } catch (_) {}
    try {
      if (window.DeviceOrientationEvent) {
        window.addEventListener(
          'deviceorientationabsolute',
          function (e) {
            if (e.alpha == null) return;
            var a = Number(e.alpha) || 0;
            var b = Number(e.beta) || 0;
            var g = Number(e.gamma) || 0;
            S.mag.ut = 45 + 8 * Math.sin((a + b + g) * 0.017);
            S.mag.ok = true;
            S.mag.proxy = true;
          },
          true
        );
        return true;
      }
    } catch (_) {}
    return false;
  }

  function sample() {
    var n = netInfo();
    var m = meshSnap();
    var watts = estimateWatts(n.downlinkMbps);
    var pos = global._snLastPos || null;
    var sample = {
      t: Date.now(),
      online: n.online,
      type: n.type,
      downlinkMbps: n.downlinkMbps,
      rttMs: n.rttMs,
      watts: watts,
      wattsLabel: formatWatts(watts),
      microTesla: S.mag.ok ? S.mag.ut : null,
      magProxy: !!S.mag.proxy,
      mesh: m,
      pos: pos,
    };
    S.lastSample = sample;
    return sample;
  }

  function ensureCss() {
    if (document.getElementById('sn-connect-css')) return;
    var st = document.createElement('style');
    st.id = 'sn-connect-css';
    st.textContent =
      '#sn-connect-fab{position:fixed;right:12px;bottom:calc(118px + env(safe-area-inset-bottom,0px));z-index:9000;' +
      'width:46px;height:46px;border-radius:50%;border:1px solid rgba(61,158,255,.55);' +
      'background:rgba(4,16,36,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'box-shadow:0 0 18px rgba(61,158,255,.35);color:#9fd0ff;font:800 15px system-ui;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;user-select:none;}' +
      '#sn-connect-fab.on{border-color:rgba(80,255,160,.7);box-shadow:0 0 20px rgba(80,255,160,.35);color:#b8ffd4;}' +
      '#sn-connect-panel{position:fixed;right:12px;bottom:calc(172px + env(safe-area-inset-bottom,0px));z-index:9001;' +
      'width:min(300px,calc(100vw - 24px));max-height:min(52vh,420px);overflow:auto;display:none;' +
      'border-radius:18px;border:1px solid rgba(61,158,255,.4);background:rgba(2,10,24,.88);' +
      'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);' +
      'box-shadow:0 12px 40px rgba(0,0,0,.5);padding:12px 12px 10px;color:#cfe8ff;font:600 12px/1.4 system-ui;}' +
      '#sn-connect-panel.on{display:block;}' +
      '#sn-connect-panel h4{margin:0 0 8px;font:800 13px system-ui;letter-spacing:.06em;color:#7ec8ff;}' +
      '#sn-connect-panel .row{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid rgba(61,158,255,.12);}' +
      '#sn-connect-panel .k{color:#8ab4d9;} #sn-connect-panel .v{color:#e8f4ff;text-align:right;}' +
      '#sn-connect-panel .ok{color:#7dcea0;} #sn-connect-panel .bad{color:#ff8a8a;} #sn-connect-panel .dim{color:#6a8aaa;}' +
      '#sn-connect-panel .actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}' +
      '#sn-connect-panel button{border-radius:999px;border:1px solid rgba(61,158,255,.45);background:rgba(12,40,80,.85);' +
      'color:#cfe8ff;font:700 11px system-ui;padding:8px 12px;cursor:pointer;}';
    document.head.appendChild(st);
  }

  function ensureUi() {
    ensureCss();
    if (!document.getElementById('sn-connect-fab')) {
      var fab = document.createElement('button');
      fab.id = 'sn-connect-fab';
      fab.type = 'button';
      fab.title = 'Connectivity';
      fab.textContent = '📡';
      fab.addEventListener('click', function () {
        togglePanel();
      });
      document.body.appendChild(fab);
    }
    if (!document.getElementById('sn-connect-panel')) {
      var p = document.createElement('div');
      p.id = 'sn-connect-panel';
      p.innerHTML = '<h4>CONNECTIVITY</h4><div id="sn-connect-body"></div>';
      document.body.appendChild(p);
    }
  }

  function paintPanel() {
    var body = document.getElementById('sn-connect-body');
    if (!body) return;
    var s = sample();
    var m = s.mesh || {};
    var rows = [];
    function row(k, v, cls) {
      rows.push(
        '<div class="row"><span class="k">' +
          k +
          '</span><span class="v ' +
          (cls || '') +
          '">' +
          v +
          '</span></div>'
      );
    }
    row('Network', s.online ? s.type.toUpperCase() : 'OFFLINE', s.online ? 'ok' : 'bad');
    row('Downlink', s.downlinkMbps != null ? s.downlinkMbps.toFixed(2) + ' Mbps' : 'n/a', 'dim');
    row('RTT', s.rttMs != null ? s.rttMs + ' ms' : 'n/a', 'dim');
    row('Est. power', s.wattsLabel + (s.downlinkMbps != null ? ' · proxy' : ''), 'dim');
    row(
      'Field µT',
      s.microTesla != null
        ? s.microTesla.toFixed(1) + ' µT' + (s.magProxy ? ' · relative' : '')
        : 'sensor n/a',
      s.microTesla != null ? 'ok' : 'dim'
    );
    row('Mesh', m.enabled ? m.mode || 'on' : 'off', m.enabled ? 'ok' : 'dim');
    row('Room', m.room || '—', 'dim');
    row('P2P', (m.p2pOpen || 0) + ' / ' + (m.peers || 0), m.p2pOpen ? 'ok' : 'dim');
    row('Server path', s.online && m.mode !== 'mesh-only' ? 'open' : 'down', s.online ? 'ok' : 'bad');
    row('Outbox', String(m.outbox != null ? m.outbox : 0), 'dim');
    if (s.pos && s.pos.lat != null) {
      row('Fix', Number(s.pos.lat).toFixed(4) + ', ' + Number(s.pos.lng).toFixed(4), 'ok');
    } else {
      row('Fix', 'no GPS yet', 'dim');
    }
    rows.push(
      '<div class="actions">' +
        '<button type="button" id="sn-c-map">Map signals</button>' +
        '<button type="button" id="sn-c-scan">Rescan</button>' +
        '<button type="button" id="sn-c-mesh">Mesh status</button>' +
        '</div>'
    );
    body.innerHTML = rows.join('');
    var mapBtn = document.getElementById('sn-c-map');
    if (mapBtn)
      mapBtn.onclick = function () {
        plotOnMap(true);
      };
    var scanBtn = document.getElementById('sn-c-scan');
    if (scanBtn)
      scanBtn.onclick = function () {
        paintPanel();
        log('Connectivity rescanned', 'dim');
      };
    var meshBtn = document.getElementById('sn-c-mesh');
    if (meshBtn)
      meshBtn.onclick = function () {
        try {
          if (global.SNMeshNet && SNMeshNet.handleLine) SNMeshNet.handleLine('mesh status');
        } catch (_) {}
      };
    var fab = document.getElementById('sn-connect-fab');
    if (fab) fab.classList.toggle('on', !!s.online);
  }

  function togglePanel() {
    ensureUi();
    S.open = !S.open;
    var p = document.getElementById('sn-connect-panel');
    if (p) p.classList.toggle('on', S.open);
    if (S.open) paintPanel();
  }

  function plotOnMap(speak) {
    var s = sample();
    var pos = s.pos;
    if (!pos || pos.lat == null) {
      try {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            function (g) {
              global._snLastPos = { lat: g.coords.latitude, lng: g.coords.longitude };
              plotOnMap(speak);
            },
            function () {
              log('No GPS fix · grant location', 'dim');
            },
            { enableHighAccuracy: true, timeout: 8000 }
          );
          return;
        }
      } catch (_) {}
      log('No position · locate first', 'dim');
      return;
    }
    var lat = Number(pos.lat);
    var lng = Number(pos.lng);

    try {
      if (global.SNEvent && SNEvent.publish) {
        SNEvent.publish({
          type: (SNEvent.TYPE && SNEvent.TYPE.SENSOR) || 'a-n-G-E-sensor',
          lat: lat,
          lng: lng,
          callsign: 'rf-self',
          staleMs: 90000,
          detail: {
            kind: 'connectivity',
            type: s.type,
            downlinkMbps: s.downlinkMbps,
            watts: s.watts,
            microTesla: s.microTesla,
            online: s.online,
          },
        });
      }
    } catch (_) {}

    try {
      if (global.SNGlobe && SNGlobe.pulse)
        SNGlobe.pulse(lat, lng, { color: s.online ? '#7dcea0' : '#e87070', ms: 1400 });
      if (global.SNGlobe && SNGlobe.flyNear) SNGlobe.flyNear(lat, lng, 0.12);
    } catch (_) {}

    try {
      if (global.SNMap && SNMap.map && global.L) {
        if (S._rfMarker) {
          try {
            S._rfMarker.remove();
          } catch (_) {}
        }
        var html =
          '<div style="background:rgba(4,20,40,.9);border:1px solid #3d9eff;border-radius:10px;padding:6px 8px;color:#cfe8ff;font:700 11px system-ui;min-width:110px">' +
          '<div>📡 ' +
          (s.online ? s.type : 'OFF') +
          '</div>' +
          '<div style="opacity:.85">' +
          (s.downlinkMbps != null ? s.downlinkMbps.toFixed(1) + ' Mbps' : '—') +
          ' · ' +
          s.wattsLabel +
          '</div>' +
          (s.microTesla != null
            ? '<div style="opacity:.85">' + s.microTesla.toFixed(1) + ' µT</div>'
            : '') +
          '</div>';
        S._rfMarker = L.marker([lat, lng], {
          icon: L.divIcon({ className: '', html: html, iconSize: [120, 60], iconAnchor: [60, 60] }),
        }).addTo(SNMap.map);
      }
    } catch (_) {}

    var rings = [
      { d: 0.004, label: 'near' },
      { d: 0.012, label: 'mid' },
      { d: 0.028, label: 'far' },
    ];
    rings.forEach(function (r, i) {
      var a = (i * 2.1 + Date.now() * 0.0001) % 6.28;
      var rlat = lat + Math.cos(a) * r.d;
      var rlng = lng + Math.sin(a) * r.d * 1.2;
      try {
        if (global.SNEvent && SNEvent.publish) {
          SNEvent.publish({
            type: 'a-n-G-E-sensor',
            lat: rlat,
            lng: rlng,
            callsign: 'rf-' + r.label,
            staleMs: 60000,
            detail: { kind: 'rf-estimate', band: s.type, note: 'coverage estimate' },
          });
        }
        if (global.SNGlobe && SNGlobe.pulse)
          SNGlobe.pulse(rlat, rlng, { color: '#3d9eff', ms: 800 });
      } catch (_) {}
    });

    if (speak !== false) {
      log(
        'Signals · ' +
          (s.online ? s.type : 'OFF') +
          ' · ' +
          (s.downlinkMbps != null ? s.downlinkMbps.toFixed(1) + ' Mbps' : 'n/a') +
          ' · ' +
          s.wattsLabel +
          (s.microTesla != null ? ' · ' + s.microTesla.toFixed(1) + ' µT' : ''),
        'ok'
      );
    }
  }

  function reportCli() {
    var s = sample();
    log('════ CONNECTIVITY ════', 'ok');
    log(
      'Net · ' +
        (s.online ? s.type : 'OFFLINE') +
        (s.downlinkMbps != null ? ' · ' + s.downlinkMbps.toFixed(2) + ' Mbps' : '') +
        (s.rttMs != null ? ' · RTT ' + s.rttMs + ' ms' : ''),
      s.online ? 'ok' : 'dim'
    );
    log('Est. RF power · ' + s.wattsLabel + ' (downlink proxy, not a lab meter)', 'dim');
    log(
      'Magnetic · ' +
        (s.microTesla != null
          ? s.microTesla.toFixed(2) + ' µT' + (s.magProxy ? ' (relative)' : '')
          : 'no sensor permission / unsupported'),
      s.microTesla != null ? 'ok' : 'dim'
    );
    var m = s.mesh;
    if (m) {
      log('Mesh · ' + m.mode + ' · P2P ' + m.p2pOpen + '/' + m.peers + ' · room ' + m.room, 'ok');
    }
    log('connect map · plot signals on globe/map', 'dim');
  }

  function handleLine(raw) {
    var low = String(raw || '')
      .trim()
      .toLowerCase();
    if (!low) return false;
    if (
      low === 'connect' ||
      low === 'connectivity' ||
      low === 'rf' ||
      low === 'signals' ||
      low === 'signal'
    ) {
      reportCli();
      ensureUi();
      S.open = true;
      var p = document.getElementById('sn-connect-panel');
      if (p) p.classList.add('on');
      paintPanel();
      return true;
    }
    if (low === 'connect map' || low === 'signals map' || low === 'rf map') {
      plotOnMap(true);
      return true;
    }
    if (low === 'connect panel' || low === 'rf panel') {
      togglePanel();
      return true;
    }
    return false;
  }

  function installCli() {
    if (!global.SNCli || typeof SNCli.run !== 'function') return;
    if (SNCli._snConnectHook) return;
    SNCli._snConnectHook = true;
    var prev = SNCli.run.bind(SNCli);
    SNCli.run = function (raw) {
      try {
        if (handleLine(raw)) return Promise.resolve(true);
      } catch (_) {}
      return prev(raw);
    };
  }

  function init() {
    if (S.ready) {
      installCli();
      ensureUi();
      return;
    }
    S.ready = true;
    ensureUi();
    installCli();
    startMagnetometer();
    setTimeout(installCli, 900);
    setTimeout(installCli, 2800);
    setInterval(function () {
      if (S.open) paintPanel();
    }, 4000);
    try {
      window.addEventListener('online', function () {
        paintPanel();
      });
      window.addEventListener('offline', function () {
        paintPanel();
      });
    } catch (_) {}
  }

  global.SNConnectivity = {
    build: BUILD,
    init: init,
    sample: sample,
    plotOnMap: plotOnMap,
    handleLine: handleLine,
    togglePanel: togglePanel,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 100);
    });
  } else setTimeout(init, 100);
  setTimeout(init, 1800);
})(typeof window !== 'undefined' ? window : globalThis);
