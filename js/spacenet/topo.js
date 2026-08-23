/**
 * SNTopo — SpaceNet Add menu + place/topo tools
 * Ribbon ➕ Add opens ALL create options:
 *   pin · targets · multi-tile · shop · job · date · delivery · me
 * Modes after pick:
 *   pin     — single location
 *   targets — multi · polygon area (topographic)
 *   tile    — create multi-tile at focus
 */
(function (global) {
  'use strict';

  var R_EARTH = 6371008.8; // mean Earth radius (m)
  var MODE_KEY = 'sn:topo-mode-v1';

  var T = {
    mode: 'pin', // pin | targets | tile
    /** Single pin (at most one) */
    pin: null,
    /** Multi measure targets */
    targets: [],
    active: false,
    mapLayers: { markers: [], line: null, poly: null, labels: [] },
    menuOpen: false,
  };

  function log(msg, cls) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, cls || 'ok');
    } catch (_) {}
  }

  function preview(msg) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(msg);
    } catch (_) {}
  }

  function loadMode() {
    try {
      var m = localStorage.getItem(MODE_KEY);
      if (m === 'pin' || m === 'targets' || m === 'tile') T.mode = m;
    } catch (_) {}
  }

  function saveMode() {
    try {
      localStorage.setItem(MODE_KEY, T.mode);
    } catch (_) {}
  }

  function rad(d) {
    return (d * Math.PI) / 180;
  }

  function haversineM(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 0;
    var dLat = rad(b.lat - a.lat);
    var dLng = rad(b.lng - a.lng);
    var la1 = rad(a.lat);
    var la2 = rad(b.lat);
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** GeoJSON-area style ring area (m²). coords = [{lat,lng}, ...] */
  function polygonAreaM2(pts) {
    if (!pts || pts.length < 3) return 0;
    var area = 0;
    var n = pts.length;
    for (var i = 0; i < n; i++) {
      var p1 = pts[i];
      var p2 = pts[(i + 1) % n];
      var p0 = pts[(i + n - 1) % n];
      area += (rad(p2.lng) - rad(p0.lng)) * Math.sin(rad(p1.lat));
    }
    area = (area * R_EARTH * R_EARTH) / 2;
    return Math.abs(area);
  }

  function perimeterM(pts) {
    if (!pts || pts.length < 2) return 0;
    var s = 0;
    for (var i = 0; i < pts.length - 1; i++) s += haversineM(pts[i], pts[i + 1]);
    if (pts.length >= 3) s += haversineM(pts[pts.length - 1], pts[0]);
    return s;
  }

  function formatArea(m2) {
    if (m2 >= 1e6) return (m2 / 1e6).toFixed(3) + ' km²';
    if (m2 >= 10000) return (m2 / 10000).toFixed(2) + ' ha';
    return Math.round(m2) + ' m²';
  }

  function formatDist(m) {
    if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
    return Math.round(m) + ' m';
  }

  function modeMeta(mode) {
    var m = mode || T.mode;
    if (m === 'targets')
      return {
        mode: 'targets',
        emoji: '◎',
        text: 'Targets',
        title: 'Multi targets · polygon measure · topographic',
      };
    if (m === 'tile')
      return {
        mode: 'tile',
        emoji: '➕',
        text: 'Tile',
        title: 'Create multi-tile at focus',
      };
    return {
      mode: 'pin',
      emoji: '📍',
      text: 'Pin',
      title: 'Single location pin',
    };
  }

  function setMode(mode) {
    if (mode !== 'pin' && mode !== 'targets' && mode !== 'tile') return getState();
    T.mode = mode;
    saveMode();
    T.active = mode === 'pin' || mode === 'targets';
    var meta = modeMeta(mode);
    log(
      'Place · ' +
        meta.text +
        (mode === 'pin'
          ? ' · one location'
          : mode === 'targets'
            ? ' · multi · polygon when ≥3'
            : ' · multi-tile create'),
      'ok'
    );
    preview('Place · ' + meta.text);
    try {
      if (global.SNField && SNField.paintRibbon) SNField.paintRibbon();
    } catch (_) {}
    paintMap();
    return getState();
  }

  function cycleMode() {
    var order = ['pin', 'targets', 'tile'];
    var i = order.indexOf(T.mode);
    return setMode(order[(i + 1) % order.length]);
  }

  function focusPos() {
    return (
      global._snLastPos ||
      (global.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      (global.SNTasks && SNTasks.pos) || { lat: 36.4341, lng: 28.2176 }
    );
  }

  /**
   * Place at lat/lng according to current mode.
   * pin → replace single pin
   * targets → append measure target
   * tile → open create multi-tile
   */
  function placeAt(lat, lng, opts) {
    opts = opts || {};
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return { ok: false };
    global._snLastPos = { lat: lat, lng: lng };
    try {
      if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(lat, lng);
      if (global.SNGlobe && SNGlobe.setFocus) SNGlobe.setFocus(lat, lng);
    } catch (_) {}

    if (T.mode === 'tile') {
      void openMapThen(function () {
        if (global.SNTile && SNTile.createAt) global.SNTile.createAt(lat, lng);
      }, lat, lng);
      return { ok: true, mode: 'tile', lat: lat, lng: lng };
    }

    if (T.mode === 'pin') {
      T.pin = { lat: lat, lng: lng, t: Date.now(), label: opts.label || 'Pin' };
      T.active = true;
      try {
        if (global.SNGlobe && SNGlobe.pulse)
          SNGlobe.pulse(lat, lng, 0x3d9eff, 'Pin', 12000);
      } catch (_) {}
      log(
        'Pin · ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ' · single location',
        'ok'
      );
      preview('Pin · ' + lat.toFixed(4) + ', ' + lng.toFixed(4));
      paintMap();
      return { ok: true, mode: 'pin', pin: T.pin };
    }

    // targets — multi
    T.targets.push({
      lat: lat,
      lng: lng,
      t: Date.now(),
      label: opts.label || 'T' + (T.targets.length + 1),
    });
    T.active = true;
    try {
      if (global.SNGlobe && SNGlobe.pulse)
        SNGlobe.pulse(lat, lng, 0x00dd88, 'T' + T.targets.length, 10000);
    } catch (_) {}
    var stats = measure();
    var msg =
      'Target ' +
      T.targets.length +
      ' · ' +
      lat.toFixed(5) +
      ', ' +
      lng.toFixed(5);
    if (stats.areaM2 > 0) msg += ' · area ' + formatArea(stats.areaM2);
    else if (stats.perimeterM > 0) msg += ' · path ' + formatDist(stats.perimeterM);
    if (T.targets.length < 3) msg += ' · need ' + (3 - T.targets.length) + ' more for polygon';
    log(msg, 'ok');
    preview(
      T.targets.length >= 3
        ? 'Targets · ' + formatArea(stats.areaM2)
        : 'Targets · ' + T.targets.length + ' pts'
    );
    paintMap();
    return { ok: true, mode: 'targets', count: T.targets.length, measure: stats };
  }

  function placeAtFocus() {
    var p = focusPos();
    return placeAt(p.lat, p.lng);
  }

  function openMapThen(fn, lat, lng) {
    void (async function () {
      try {
        if (global.SNMap && !SNMap.active && SNMap.open) await SNMap.open(lat, lng);
      } catch (_) {}
      try {
        fn();
      } catch (_) {}
      paintMap();
    })();
  }

  function measure() {
    var pts = T.targets.slice();
    // Prefer Google geodesic area/distance when Google Earth imaging is active
    var areaM2 = polygonAreaM2(pts);
    var perim = perimeterM(pts);
    var engine = 'haversine';
    try {
      if (
        global.SNGoogleEarth &&
        SNGoogleEarth.status &&
        SNGoogleEarth.status().ready
      ) {
        var gArea = SNGoogleEarth.geodesicAreaM2 && SNGoogleEarth.geodesicAreaM2(pts);
        if (gArea != null && gArea > 0) {
          areaM2 = gArea;
          engine = 'google-geodesic';
        }
        if (pts.length >= 2 && SNGoogleEarth.geodesicDistanceM) {
          var gp = 0;
          for (var j = 0; j < pts.length - 1; j++) {
            var d = SNGoogleEarth.geodesicDistanceM(pts[j], pts[j + 1]);
            gp += d != null ? d : haversineM(pts[j], pts[j + 1]);
          }
          if (pts.length >= 3) {
            var dc = SNGoogleEarth.geodesicDistanceM(pts[pts.length - 1], pts[0]);
            gp += dc != null ? dc : haversineM(pts[pts.length - 1], pts[0]);
          }
          if (gp > 0) perim = gp;
        }
      }
    } catch (_) {}
    var segs = [];
    for (var i = 0; i < pts.length - 1; i++) {
      segs.push({
        from: i + 1,
        to: i + 2,
        m: haversineM(pts[i], pts[i + 1]),
      });
    }
    return {
      count: pts.length,
      areaM2: areaM2,
      areaLabel: formatArea(areaM2),
      perimeterM: perim,
      perimeterLabel: formatDist(perim),
      segments: segs,
      closed: pts.length >= 3,
      engine: engine,
    };
  }

  /** Full topo report: area + perimeter + elevations + 3D path (Google or open-elevation) */
  async function measureTopo() {
    var base = measure();
    var pts = T.targets.slice();
    if (T.pin && !pts.length) pts = [T.pin];
    var elev = [];
    var path3d = null;
    try {
      if (global.SNGoogleEarth && SNGoogleEarth.pathLength3dM && pts.length >= 2) {
        path3d = await SNGoogleEarth.pathLength3dM(pts);
        elev = path3d.elev || [];
      } else if (global.SNGoogleEarth && SNGoogleEarth.elevations && pts.length) {
        elev = await SNGoogleEarth.elevations(pts);
      }
    } catch (_) {}
    var elevLabel = '';
    if (elev.length) {
      var nums = elev.map(function (e) {
        return e.elevM;
      }).filter(function (n) {
        return n != null && isFinite(n);
      });
      if (nums.length) {
        var min = Math.min.apply(null, nums);
        var max = Math.max.apply(null, nums);
        elevLabel = 'elev ' + Math.round(min) + '–' + Math.round(max) + ' m';
      }
    }
    var out = Object.assign({}, base, {
      elev: elev,
      elevLabel: elevLabel,
      path3dM: path3d && path3d.path3dM,
      path3dLabel: path3d ? formatDist(path3d.path3dM) : '',
      horizM: path3d && path3d.horizM,
    });
    log(
      'Topo · ' +
        (out.count || 0) +
        ' pts' +
        (out.areaM2 > 0 ? ' · area ' + out.areaLabel : '') +
        (out.perimeterM > 0 ? ' · perim ' + out.perimeterLabel : '') +
        (out.path3dLabel ? ' · 3D path ' + out.path3dLabel : '') +
        (elevLabel ? ' · ' + elevLabel : '') +
        (out.engine ? ' · ' + out.engine : ''),
      'ok'
    );
    return out;
  }

  function clear(which) {
    if (!which || which === 'pin') T.pin = null;
    if (!which || which === 'targets') T.targets = [];
    if (which === 'all' || !which) {
      T.pin = null;
      T.targets = [];
    }
    paintMap();
    log('Place · cleared ' + (which || 'all'), 'dim');
    preview('Place cleared');
    return getState();
  }

  function clearMapLayers() {
    var map = global.SNMap && SNMap.map;
    var L = global.L;
    if (!map || !L) {
      T.mapLayers = { markers: [], line: null, poly: null, labels: [] };
      return;
    }
    (T.mapLayers.markers || []).forEach(function (m) {
      try {
        map.removeLayer(m);
      } catch (_) {}
    });
    if (T.mapLayers.line) {
      try {
        map.removeLayer(T.mapLayers.line);
      } catch (_) {}
    }
    if (T.mapLayers.poly) {
      try {
        map.removeLayer(T.mapLayers.poly);
      } catch (_) {}
    }
    T.mapLayers = { markers: [], line: null, poly: null, labels: [] };
  }

  function paintMap() {
    clearMapLayers();
    var map = global.SNMap && SNMap.map;
    var L = global.L;
    if (!map || !L || !global.SNMap.active) return;

    function addMarker(pt, color, label) {
      var m = L.circleMarker([pt.lat, pt.lng], {
        radius: 8,
        color: color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindTooltip(label, { permanent: false, direction: 'top' });
      T.mapLayers.markers.push(m);
    }

    if (T.mode === 'pin' && T.pin) {
      addMarker(T.pin, '#3d9eff', 'Pin');
    }

    if (T.mode === 'targets' && T.targets.length) {
      var latlngs = T.targets.map(function (t) {
        return [t.lat, t.lng];
      });
      T.targets.forEach(function (t, i) {
        addMarker(t, '#00dd88', 'T' + (i + 1));
      });
      if (latlngs.length >= 2) {
        T.mapLayers.line = L.polyline(latlngs, {
          color: '#3d9eff',
          weight: 3,
          opacity: 0.85,
          dashArray: '6 4',
        }).addTo(map);
      }
      if (latlngs.length >= 3) {
        T.mapLayers.poly = L.polygon(latlngs, {
          color: '#3d9eff',
          weight: 2,
          fillColor: '#1a6fd4',
          fillOpacity: 0.22,
        }).addTo(map);
        var st = measure();
        try {
          T.mapLayers.poly.bindTooltip(
            'Area ' + st.areaLabel + ' · perimeter ' + st.perimeterLabel,
            { permanent: true, direction: 'center', className: 'sn-topo-tip' }
          );
        } catch (_) {}
      }
    }
  }

  /**
   * Map click interceptor — true if handled (caller must not fly away).
   */
  function onMapClick(lat, lng) {
    if (!T.active && T.mode !== 'tile') return false;
    if (T.mode === 'tile') {
      placeAt(lat, lng);
      return true;
    }
    if (T.mode === 'pin' || T.mode === 'targets') {
      placeAt(lat, lng);
      return true;
    }
    return false;
  }

  function ensureMenuCss() {
    if (document.getElementById('sn-add-menu-css')) return;
    var st = document.createElement('style');
    st.id = 'sn-add-menu-css';
    st.textContent = [
      /* Backdrop — does NOT steal whole UI until open */
      '#sn-add-menu{position:fixed;inset:0;z-index:130;display:none;pointer-events:none}',
      '#sn-add-menu.open{display:block;pointer-events:auto}',
      '#sn-add-menu .sn-add-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.35)}',
      /* Sheet expands UP from Add button (positioned in JS) */
      '#sn-add-menu .sn-add-sheet{position:fixed;z-index:131;width:min(300px,calc(100vw - 20px));',
      'background:rgba(0,6,16,.98);border:1px solid rgba(61,158,255,.55);border-radius:14px;',
      'box-shadow:0 -8px 32px rgba(0,0,0,.65),0 0 24px rgba(26,111,212,.25);',
      'padding:8px;color:#c8e4ff;display:flex;flex-direction:column;gap:4px;',
      'max-height:min(58vh,420px);overflow:auto}',
      '#sn-add-menu .sn-add-head{font:700 11px system-ui;color:#3d9eff;letter-spacing:.1em;',
      'text-transform:uppercase;padding:6px 8px 8px;border-bottom:1px solid rgba(26,111,212,.25);margin-bottom:2px}',
      '#sn-add-menu .sn-add-opt{border:0;border-radius:10px;background:transparent;color:#e0f0ff;',
      'padding:10px 10px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;',
      'width:100%;font:600 13px system-ui}',
      '#sn-add-menu .sn-add-opt:hover,#sn-add-menu .sn-add-opt:active{background:rgba(26,111,212,.28)}',
      '#sn-add-menu .sn-add-opt .e{font-size:20px;width:28px;text-align:center;flex-shrink:0}',
      '#sn-add-menu .sn-add-opt .meta{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '#sn-add-menu .sn-add-opt .t{font-weight:700;color:#e8f4ff}',
      '#sn-add-menu .sn-add-opt .d{font:10px/1.25 system-ui;color:#6a8aaa}',
      '#sn-add-menu .sn-add-cancel{margin-top:4px;border:1px solid rgba(61,158,255,.3);border-radius:10px;',
      'background:rgba(0,12,28,.8);color:#8ab4d0;padding:10px;font:600 12px system-ui;cursor:pointer;width:100%}',
    ].join('');
    document.head.appendChild(st);
  }

  /**
   * ➕ Add — expand menu UPWARD from ribbon Add button.
   * Does NOT locate, open map, or create a tile until user picks an option.
   */
  function openAddMenu() {
    try {
      ensureMenuCss();
      var root = document.getElementById('sn-add-menu');
      if (!root) {
        root = document.createElement('div');
        root.id = 'sn-add-menu';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'Add menu');
        document.body.appendChild(root);
      }

      var opts = [
        { id: 'pin', e: '📍', t: 'Pin', d: 'Single location on the map' },
        { id: 'targets', e: '◎', t: 'Polygon / targets', d: 'Multi points · measure land size' },
        { id: 'video', e: '📹', t: 'Video call', d: 'Start a live video call request' },
        { id: 'vendor', e: '🏪', t: 'Vendor', d: 'List shop · vendor worker · sell in S' },
        { id: 'social', e: '🎬', t: 'Social video post', d: 'Post a video to the field' },
        { id: 'emergency', e: '🆘', t: 'Emergency help', d: 'Urgent help request on the map' },
      ];

      var rows = opts
        .map(function (o) {
          return (
            '<button type="button" class="sn-add-opt" data-add="' +
            o.id +
            '"><span class="e" aria-hidden="true">' +
            o.e +
            '</span><span class="meta"><span class="t">' +
            o.t +
            '</span><span class="d">' +
            o.d +
            '</span></span></button>'
          );
        })
        .join('');

      root.innerHTML =
        '<div class="sn-add-backdrop" data-add="close"></div>' +
        '<div class="sn-add-sheet" id="sn-add-sheet">' +
        '<div class="sn-add-head">➕ Add</div>' +
        rows +
        '<button type="button" class="sn-add-cancel" data-add="close">Cancel</button>' +
        '</div>';

      // Position sheet above Add button
      var sheet = root.querySelector('#sn-add-sheet');
      var anchor =
        document.getElementById('sn-rib-add') ||
        document.querySelector('[data-act="add"]');
      var pad = 10;
      var w = Math.min(300, window.innerWidth - 20);
      if (anchor && sheet) {
        var r = anchor.getBoundingClientRect();
        var left = Math.max(pad, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - pad));
        sheet.style.width = w + 'px';
        sheet.style.left = left + 'px';
        sheet.style.bottom = window.innerHeight - r.top + 8 + 'px';
        sheet.style.top = 'auto';
      } else if (sheet) {
        sheet.style.left = '50%';
        sheet.style.transform = 'translateX(-50%)';
        sheet.style.bottom = '120px';
      }

      root.classList.add('open');
      T.menuOpen = true;

      root.querySelectorAll('[data-add]').forEach(function (btn) {
        btn.addEventListener(
          'click',
          function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            runAddOption(btn.getAttribute('data-add'));
          },
          true
        );
      });

      preview('Add · pick an option');
      log('Add menu · pin · polygon · video · vendor · social · emergency', 'dim');
      return getState();
    } catch (err) {
      try {
        console.error('[SNTopo] openAddMenu', err);
        log('Add menu error · ' + (err.message || err), 'err');
      } catch (_) {}
      return { ok: false, error: String(err && err.message) };
    }
  }

  function closeAddMenu() {
    var root = document.getElementById('sn-add-menu');
    if (root) {
      root.classList.remove('open');
      root.innerHTML = '';
    }
    T.menuOpen = false;
  }

  function runAddOption(id) {
    if (id === 'close') {
      closeAddMenu();
      return;
    }
    closeAddMenu();

    // Pin / polygon only arm map mode — never locate, never auto-open tile
    if (id === 'pin') {
      setMode('pin');
      armMapMode('pin');
      return;
    }
    if (id === 'targets' || id === 'polygon') {
      setMode('targets');
      armMapMode('targets');
      return;
    }
    if (id === 'video') {
      startVideoCall();
      return;
    }
    if (id === 'vendor') {
      try {
        if (global.SNProfiles && SNProfiles.toggleRole) {
          var me = SNProfiles.me();
          if (me) SNProfiles.toggleRole(me.id, 'vendor', true);
        }
        if (global.SNCli && SNCli.run) void SNCli.run('list shop My Shop');
        else if (global.SNMarket && SNMarket.listShop) SNMarket.listShop('My Shop');
        log('Vendor · list shop · add menu items · pin will mark location', 'ok');
      } catch (e) {
        log('Vendor · type: list shop Your Name', 'dim');
      }
      return;
    }
    if (id === 'social') {
      startSocialVideoPost();
      return;
    }
    if (id === 'emergency') {
      postEmergency();
      return;
    }
  }

  /** Arm pin/targets: open city map only, wait for taps — no GPS locate */
  function armMapMode(mode) {
    T.mode = mode;
    T.active = true;
    saveMode();
    var p = focusPos();
    void (async function () {
      try {
        // Open map at current focus only — do NOT call SNGlobe.locate
        if (global.SNMap && SNMap.open) {
          await SNMap.open(p.lat, p.lng);
        }
      } catch (_) {}
      log(
        mode === 'targets'
          ? 'Targets · tap map to add points · ≥3 builds polygon · area auto'
          : 'Pin · tap map once for single location',
        'ok'
      );
      preview(mode === 'targets' ? 'Targets · tap map' : 'Pin · tap map');
      paintMap();
      try {
        if (global.SNField && SNField.paintRibbon) SNField.paintRibbon();
      } catch (_) {}
    })();
  }

  function startVideoCall() {
    var p = focusPos();
    try {
      if (global.SNTasks && SNTasks.create) {
        SNTasks.create({
          kind: 'help',
          role: 'video',
          title: '📹 Video call request',
          raw: 'video call',
          lat: p.lat,
          lng: p.lng,
          dur: '30m',
        });
      }
    } catch (_) {}
    log('Video call · request posted on map · open CITY to see task', 'ok');
    preview('Video call request');
    // Soft media probe (permission) without forcing tile UI
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: true })
          .then(function (stream) {
            stream.getTracks().forEach(function (t) {
              t.stop();
            });
            log('Camera/mic ready · pair when peer joins', 'ok');
          })
          .catch(function () {
            log('Allow camera/mic when browser asks · call still listed', 'dim');
          });
      }
    } catch (_) {}
  }

  function startSocialVideoPost() {
    var p = focusPos();
    try {
      if (global.SNProfiles && SNProfiles.me && SNProfiles.addPost) {
        var me = SNProfiles.me();
        SNProfiles.addPost(me.id, '🎬 Video post · ' + new Date().toLocaleString());
        if (me.lat == null) {
          me.lat = p.lat;
          me.lng = p.lng;
          SNProfiles.upsert(me);
        }
      }
      if (global.SNTasks && SNTasks.create) {
        SNTasks.create({
          kind: 'help',
          role: 'social',
          title: '🎬 Social video post',
          raw: 'social video',
          lat: p.lat,
          lng: p.lng,
        });
      }
    } catch (_) {}
    log('Social video · post noted · open My tile Social to publish media', 'ok');
    preview('Social video post');
    try {
      if (global.SNTile && SNTile.openMe) SNTile.openMe();
      else if (global.SNTile && SNTile.open) {
        var me2 = global.SNProfiles && SNProfiles.me && SNProfiles.me();
        if (me2) SNTile.open(me2, { tab: 'social' });
      }
    } catch (_) {}
  }

  function postEmergency() {
    var p = focusPos();
    try {
      if (global.SNTasks && SNTasks.create) {
        SNTasks.create({
          kind: 'help',
          role: 'emergency',
          title: '🆘 EMERGENCY · need help now',
          raw: 'emergency help',
          lat: p.lat,
          lng: p.lng,
          dur: '1h',
          always_on: true,
        });
      }
      if (global.SNGlobe && SNGlobe.pulse) {
        SNGlobe.pulse(p.lat, p.lng, 0xff3344, 'EMERGENCY', 20000);
      }
    } catch (_) {}
    log('🆘 Emergency help posted at focus · visible on map/tasks', 'ok');
    preview('Emergency help posted');
  }

  /**
   * After pin/targets: open map at focus and wait for taps.
   * Never calls locate / createAt unless mode is tile (tile removed from Add menu).
   */
  function activateMode() {
    return armMapMode(T.mode === 'targets' ? 'targets' : 'pin');
  }

  /** Ribbon ➕ Add → open upward menu only (no locate, no tile) */
  function activate() {
    return openAddMenu();
  }

  function getState() {
    return {
      mode: T.mode,
      meta: modeMeta(),
      active: T.active,
      pin: T.pin,
      targets: T.targets.slice(),
      measure: measure(),
    };
  }

  loadMode();

  global.SNTopo = {
    setMode: setMode,
    cycleMode: cycleMode,
    modeMeta: modeMeta,
    placeAt: placeAt,
    placeAtFocus: placeAtFocus,
    activate: activate,
    openAddMenu: openAddMenu,
    closeAddMenu: closeAddMenu,
    runAddOption: runAddOption,
    activateMode: activateMode,
    onMapClick: onMapClick,
    measure: measure,
    measureTopo: measureTopo,
    clear: clear,
    paintMap: paintMap,
    haversineM: haversineM,
    formatArea: formatArea,
    formatDist: formatDist,
    get mode() {
      return T.mode;
    },
    get active() {
      return T.active;
    },
    get pin() {
      return T.pin;
    },
    get targets() {
      return T.targets.slice();
    },
    getState: getState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
