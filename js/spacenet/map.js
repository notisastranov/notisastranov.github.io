/* SpaceNet surface map — lightweight Leaflet engine
 * Layers panel: basemaps (exclusive) + live overlays (multi-toggle)
 * Free/cheap first; optional keys in SN_CONFIG.layers
 */
(function (global) {
  'use strict';

  const LAYER_KEY = 'sn:map-layer-v1';
  const OVERLAY_KEY = 'sn:map-overlays-v1';

  function cfgLayers() {
    return (global.SN_CONFIG && SN_CONFIG.layers) || {};
  }

  /** Basemaps — pick one (exclusive). Prefer free/light stacks. */
  const BASEMAPS = {
    dark: {
      id: 'dark',
      label: 'Dark',
      emoji: '🌑',
      free: true,
      weight: 1,
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      opts: { maxZoom: 20, maxNativeZoom: 19, subdomains: 'abcd', attribution: '© OSM · CARTO' },
    },
    bright: {
      id: 'bright',
      label: 'Bright',
      emoji: '☀️',
      free: true,
      weight: 1,
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      opts: { maxZoom: 20, maxNativeZoom: 19, subdomains: 'abcd', attribution: '© OSM · CARTO' },
    },
    satellite: {
      id: 'satellite',
      label: 'Sat',
      emoji: '🛰',
      free: true,
      weight: 2,
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      opts: { maxZoom: 19, maxNativeZoom: 19, attribution: 'Esri · Maxar' },
      labelsUrl: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      labelsOpts: { maxZoom: 20, maxNativeZoom: 19, subdomains: 'abcd', opacity: 0.85 },
    },
    // Google-style roads (OSM HOT) — free stand-in when no Google key
    google: {
      id: 'google',
      label: 'OSM roads',
      emoji: 'G',
      free: true,
      weight: 2,
      note: 'OpenStreetMap HOT roads — not Google',
      url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      opts: { maxZoom: 20, maxNativeZoom: 19, subdomains: 'abc', attribution: '© OSM HOT' },
    },
    // Full Google Earth-class imaging (requires SN_CONFIG.layers.googleMapsKey)
    g_satellite: {
      id: 'g_satellite',
      label: 'G-Sat',
      emoji: '🌍',
      free: false,
      weight: 3,
      googleType: 'satellite',
      note: 'Google satellite (Maps JS API key)',
    },
    g_hybrid: {
      id: 'g_hybrid',
      label: 'G-Hyb',
      emoji: '🗺',
      free: false,
      weight: 3,
      googleType: 'hybrid',
      note: 'Google hybrid labels + imagery',
    },
    g_terrain: {
      id: 'g_terrain',
      label: 'G-Topo',
      emoji: '⛰',
      free: false,
      weight: 3,
      googleType: 'terrain',
      note: 'Google terrain / topographic',
    },
    g_roadmap: {
      id: 'g_roadmap',
      label: 'G-Road',
      emoji: '🛣',
      free: false,
      weight: 3,
      googleType: 'roadmap',
      note: 'Google roadmap',
    },
    traffic: {
      id: 'traffic',
      label: 'Traffic',
      emoji: '🚗',
      free: true,
      weight: 2,
      url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',
      opts: { maxZoom: 19, subdomains: 'abc', attribution: '© OSM' },
    },
  };

  /**
   * Overlays — multi-toggle. Live data where free APIs allow.
   * kind: tile | live | iframe | tool
   */
  const OVERLAYS = {
    windy: {
      id: 'windy',
      label: 'Windy',
      emoji: '🌬',
      kind: 'iframe',
      desc: 'Weather · wind · rain (Windy embed)',
    },
    w3w: {
      id: 'w3w',
      label: 'w3w',
      emoji: '///',
      kind: 'tool',
      desc: 'what3words · tap map for /// words (needs key for full API)',
    },
    iss: {
      id: 'iss',
      label: 'ISS',
      emoji: '🛸',
      kind: 'live',
      desc: 'International Space Station live',
      pollMs: 8000,
    },
    sats: {
      id: 'sats',
      label: 'Sats',
      emoji: '📡',
      kind: 'live',
      desc: 'ISS + sample LEO sats (live ISS)',
      pollMs: 12000,
    },
    planes: {
      id: 'planes',
      label: 'Planes',
      emoji: '✈',
      kind: 'live',
      desc: 'Aircraft (OpenSky Network)',
      pollMs: 15000,
    },
    ships: {
      id: 'ships',
      label: 'Ships',
      emoji: '🚢',
      kind: 'live',
      desc: 'Marine OpenSeaMap marks (chart overlay)',
      pollMs: 0,
    },
    trafficLive: {
      id: 'trafficLive',
      label: 'Roads',
      emoji: '🛣',
      kind: 'tile',
      desc: 'Road emphasis overlay',
      url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      opts: { maxZoom: 19, opacity: 0.45, subdomains: 'abc' },
    },
    gibs: {
      id: 'gibs',
      label: 'Live sat',
      emoji: 'LIVE',
      kind: 'gibs',
      desc: 'NASA VIIRS true color · last daily pass',
      layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
      matrix: 'GoogleMapsCompatible_Level9',
      ext: 'jpg',
      maxNativeZoom: 9,
      opacity: 0.62,
    },
    chloro: {
      id: 'chloro',
      label: 'Sea color',
      emoji: 'SEA',
      kind: 'gibs',
      desc: 'NASA VIIRS chlorophyll — bloom, runoff, dirty water',
      layer: 'VIIRS_SNPP_L2_Chlorophyll_A',
      matrix: 'GoogleMapsCompatible_Level7',
      ext: 'png',
      maxNativeZoom: 7,
      opacity: 0.72,
    },
    sst: {
      id: 'sst',
      label: 'Sea temp',
      emoji: 'TEMP',
      kind: 'gibs',
      desc: 'NASA sea surface temperature',
      layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
      matrix: 'GoogleMapsCompatible_Level7',
      ext: 'png',
      maxNativeZoom: 7,
      opacity: 0.5,
    },
  };

  const M = {
    map: null,
    active: false,
    markers: [],
    profileMarkers: [],
    basemapId: 'dark',
    basemapLayer: null,
    labelsLayer: null,
    layerCtl: null,
    overlayOn: {},
    overlayLayers: {},
    liveTimers: {},
    liveMarkers: {},
    windyFrame: null,
    panelOpen: false,
    /** User intervened — sim/AI must not thrash camera until pilot on */
    userHold: false,
  };

  function canAutopilot() {
    return !M.userHold;
  }

  function userHoldCamera(reason) {
    if (M.userHold) return;
    M.userHold = true;
    try {
      global.SNCli?.log?.(
        'Camera · you have control' +
          (reason ? ' · ' + reason : '') +
          ' · type pilot on to follow sim again',
        'ok'
      );
      global.SNCli?.preview?.('Camera · your control');
    } catch (_) {}
  }

  function releasePilot() {
    M.userHold = false;
    try {
      global.SNCli?.log?.('Camera · autopilot on · sim may recenter', 'ok');
      global.SNCli?.preview?.('Autopilot on');
    } catch (_) {}
  }

  /** Soft pan only when autopilot allowed (sim/AI). force=true for user CLI/locate. */
  function softSetView(lat, lng, zoom, opts) {
    opts = opts || {};
    if (!opts.force && !canAutopilot()) return false;
    if (!M.map || !M.active) return false;
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return false;
    try {
      const z = zoom != null ? zoom : M.map.getZoom() || 14;
      M.map.setView([lat, lng], z, { animate: !!opts.animate });
      return true;
    } catch (_) {
      return false;
    }
  }

  function bindUserCameraLock(map) {
    if (!map || map._snPilotBound) return;
    map._snPilotBound = true;
    map.on('dragstart', function () {
      userHoldCamera('drag');
    });
    map.on('zoomstart', function (e) {
      // zoom from user gesture (not programmatic setView)
      try {
        if (e && e.originalEvent) userHoldCamera('zoom');
      } catch (_) {}
    });
    map.on('mousedown', function () {
      /* ready */
    });
    // Double-click zoom is user
    map.on('dblclick', function () {
      userHoldCamera('dblclick');
    });
  }

  function hasGoogleKey() {
    try {
      var k =
        (global.SN_CONFIG && SN_CONFIG.layers && SN_CONFIG.layers.googleMapsKey) ||
        (global.SN_CONFIG && SN_CONFIG.googleMapsKey);
      return !!(k && String(k).length > 8);
    } catch (_) {
      return false;
    }
  }

  function loadBasemapPref() {
    try {
      const v = localStorage.getItem(LAYER_KEY);
      if (v && BASEMAPS[v]) M.basemapId = v;
    } catch (_) {}
    try {
      const o = JSON.parse(localStorage.getItem(OVERLAY_KEY) || '{}');
      if (o && typeof o === 'object') M.overlayOn = o;
    } catch (_) {
      M.overlayOn = {};
    }
  }

  function saveBasemapPref(id) {
    try {
      localStorage.setItem(LAYER_KEY, id);
    } catch (_) {}
  }

  function saveOverlayPref() {
    try {
      localStorage.setItem(OVERLAY_KEY, JSON.stringify(M.overlayOn));
    } catch (_) {}
  }

  /**
   * Prefer dark at night / bright by day when user has not locked a preference this session.
   * Still overridable via layer control.
   */
  function suggestBasemapFromDayNight(lat, lng) {
    // Local civil hour from longitude (15° ≈ 1h) — bright by day, dark by night
    const offsetH = Math.round((lng || 0) / 15);
    const h = (new Date().getUTCHours() + offsetH + 24) % 24;
    return h >= 7 && h < 19 ? 'bright' : 'dark';
  }

  function hasUserLayerPref() {
    try {
      return !!localStorage.getItem(LAYER_KEY);
    } catch (_) {
      return false;
    }
  }

  function loadCss(href) {
    if (document.querySelector('link[data-sn-map]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.dataset.snMap = '1';
    document.head.appendChild(l);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (typeof L !== 'undefined') return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('leaflet'));
      document.head.appendChild(s);
    });
  }

  function backToGlobe() {
    close();
    // Animate 3D Earth only after map is closed (do not call goToTier before close —
    // goToTier also calls close; recursion-safe via M.active false).
    // Prefer REGIONAL so user clearly leaves linear street map for the sphere.
    try {
      if (global.SNGlobe?.goToTier) global.SNGlobe.goToTier('regional');
      else if (global.SNGlobe?.goToPlace && M.lat != null) {
        global.SNGlobe.goToPlace(M.lat, M.lng, { tier: 'regional', openMap: false, quiet: true });
      } else if (global.SNGlobe?.animateZ) global.SNGlobe.animateZ?.(1.95, 700);
    } catch (_) {}
    try {
      global.SNCli?.log?.('3D globe · left street map', 'ok');
      global.SNCli?.preview?.('REGIONAL Earth');
    } catch (_) {}
  }

  function ensureLayerCss() {
    if (document.getElementById('sn-map-layer-css')) return;
    const st = document.createElement('style');
    st.id = 'sn-map-layer-css';
    st.textContent = [
      /* Layers panel only — opened from CLI ribbon 🗺 Layers (no map-corner button; money HUD is top-right) */
      '#sn-map-layers{position:fixed;left:50%;bottom:calc(248px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:140;display:flex;flex-direction:column;',
      'align-items:stretch;gap:8px;pointer-events:none;width:min(720px,calc(100vw - 24px))}',
      '.sn-dot-pin{background:transparent!important;border:0!important}',
      '.sn-dot{display:block;width:14px;height:14px;border-radius:50%;border:1.5px solid #fff}',
      '.sn-dot img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}',
      '.leaflet-marker-icon.sn-target,.leaflet-marker-icon.sn-pin{width:16px!important;height:16px!important}',
      '.sn-target-inner img,.sn-pin-inner img{max-width:14px!important;max-height:14px!important;object-fit:cover}',
      '.sn-pin-menu{font:600 12px/1.35 system-ui;color:#e8f4ff}',
      '.sn-pin-order{margin-top:6px;border:0;border-radius:999px;padding:6px 12px;background:#1a6fd4;color:#fff;font:700 11px system-ui;cursor:pointer}',
      '#sn-net-tile{display:none!important}',
      '#sn-layer-panel{display:none;pointer-events:auto;width:100%;max-height:min(52vh,420px);overflow:auto;',
      'background:rgba(0,8,20,.96);border:1px solid rgba(61,158,255,.5);border-radius:14px;',
      'padding:10px;box-shadow:0 12px 36px rgba(0,0,0,.55);color:#c8e4ff}',
      '#sn-layer-panel.open{display:block}',
      '#sn-layer-panel h4{margin:0 0 8px;font:700 11px system-ui;color:#3d9eff;letter-spacing:.08em;text-transform:uppercase}',
      '#sn-layer-panel .sn-ly-sec{margin-bottom:12px}',
      '#sn-layer-panel .sn-ly-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
      '#sn-layer-panel button.sn-ly{border:1px solid rgba(61,158,255,.3);background:rgba(6,20,40,.95);color:#9ec8ff;',
      'border-radius:10px;padding:8px 6px;font:600 11px system-ui;cursor:pointer;text-align:left;',
      'display:flex;flex-direction:column;gap:2px}',
      '#sn-layer-panel button.sn-ly .e{font-size:16px;line-height:1}',
      '#sn-layer-panel button.sn-ly .t{color:#e8f4ff;font-weight:700}',
      '#sn-layer-panel button.sn-ly .d{font-size:9px;color:#6a8aaa;line-height:1.25}',
      '#sn-layer-panel button.sn-ly.on{border-color:#3d9eff;background:rgba(26,111,212,.35);color:#fff;',
      'box-shadow:0 0 12px rgba(61,158,255,.3)}',
      '#sn-layer-panel .sn-ly-note{font:10px system-ui;color:#5a6a7e;margin-top:6px;line-height:1.35}',
      '#sn-layer-panel .sn-ly-close{width:100%;margin-bottom:8px;padding:8px;border-radius:10px;cursor:pointer;',
      'border:1px solid rgba(61,158,255,.4);background:rgba(0,24,56,.8);color:#9ec8ff;font:700 11px system-ui}',
      '#sn-windy-frame{position:absolute;inset:48px 8px 8px 8px;z-index:900;border:0;border-radius:12px;',
      'display:none;pointer-events:auto;box-shadow:0 8px 32px rgba(0,0,0,.5)}',
      '#sn-windy-frame.on{display:block}',
      '#sn-w3w-badge{position:absolute;left:12px;bottom:12px;z-index:1000;padding:8px 12px;',
      'background:rgba(0,8,20,.9);border:1px solid rgba(61,158,255,.45);border-radius:10px;',
      'font:700 12px ui-monospace,monospace;color:#6dffb0;display:none}',
      '#sn-w3w-badge.on{display:block}',
      '.leaflet-control-zoom{display:none!important}',
    ].join('');
    document.head.appendChild(st);
  }

  function buildLayerControl(map) {
    ensureLayerCss();
    let wrap = document.getElementById('sn-map-layers');
    if (wrap) wrap.remove();
    wrap = document.createElement('div');
    wrap.id = 'sn-map-layers';
    wrap.innerHTML =
      '<div id="sn-layer-panel" role="dialog" aria-label="Map layers"></div>';
    document.body.appendChild(wrap);
    M.layerCtl = wrap;
    try {
      if (typeof L !== 'undefined' && L.DomEvent) {
        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.disableScrollPropagation(wrap);
      }
    } catch (_) {}
    renderLayerPanel();
  }

  function renderLayerPanel() {
    const panel = document.getElementById('sn-layer-panel');
    if (!panel) return;
    let h =
      '<button type="button" class="sn-ly-close" id="sn-layer-close">Close layers</button>' +
      '<div class="sn-ly-sec"><h4>Basemap · pick one</h4><div class="sn-ly-grid">';
    Object.keys(BASEMAPS).forEach((id) => {
      const d = BASEMAPS[id];
      if (d.free === false && !hasGoogleKey()) return;
      h +=
        '<button type="button" class="sn-ly' +
        (M.basemapId === id ? ' on' : '') +
        '" data-base="' +
        id +
        '"><span class="e">' +
        d.emoji +
        '</span><span class="t">' +
        d.label +
        '</span><span class="d">' +
        (d.free ? 'free' : 'key') +
        (d.note ? ' · ' + d.note.slice(0, 40) : '') +
        '</span></button>';
    });
    h += '</div></div><div class="sn-ly-sec"><h4>Overlays · multi on</h4><div class="sn-ly-grid">';
    Object.keys(OVERLAYS).forEach((id) => {
      const d = OVERLAYS[id];
      h +=
        '<button type="button" class="sn-ly' +
        (M.overlayOn[id] ? ' on' : '') +
        '" data-over="' +
        id +
        '"><span class="e">' +
        d.emoji +
        '</span><span class="t">' +
        d.label +
        '</span><span class="d">' +
        (d.desc || d.kind) +
        '</span></button>';
    });
    h +=
      '</div><p class="sn-ly-note">Free-first: Carto · Esri · OSM · OpenSky · open-notify ISS. ' +
      'Google tiles / what3words full API need keys in SN_CONFIG.layers. Windy opens weather embed.</p></div>';
    panel.innerHTML = h;
    panel.querySelectorAll('[data-base]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        setBasemap(b.getAttribute('data-base'), { user: true, log: true });
        renderLayerPanel();
      };
    });
    panel.querySelectorAll('[data-over]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        toggleOverlay(b.getAttribute('data-over'));
        renderLayerPanel();
      };
    });
    const closeBtn = panel.querySelector('#sn-layer-close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        M.panelOpen = false;
        panel.classList.remove('open');
      };
    }
  }

  function setBasemap(id, opts) {
    opts = opts || {};
    // Resolve id early so AI/CLI can queue preference before Leaflet exists
    if (id === 'google' && cfgLayers().googleTiles) {
      BASEMAPS.google.url = cfgLayers().googleTiles;
      BASEMAPS.google.note = 'Licensed Google tiles';
    }
    const def = BASEMAPS[id] || BASEMAPS[String(id || '').toLowerCase()] || BASEMAPS.dark;
    id = def.id;
    M.basemapId = id;
    if (opts.user || opts.prefer) saveBasemapPref(id);
    if (!M.map || typeof L === 'undefined') {
      // Preference saved — applied on next map open
      try {
        if (opts.user || opts.log) {
          global.SNCli?.log?.('Basemap · ' + def.label + ' · queued until map open', 'ok');
        }
      } catch (_) {}
      return 'queued';
    }

    // Full Google Earth imaging path (Maps JS API)
    if (def.googleType) {
      const c = M.map.getCenter();
      const z = M.map.getZoom();
      void (async function () {
        if (!global.SNGoogleEarth) {
          global.SNCli?.log?.(
            'Google Earth module offline · hard refresh · set googleMapsKey in config',
            'err'
          );
          return;
        }
        const r = await SNGoogleEarth.show(def.googleType, {
          lat: c.lat,
          lng: c.lng,
          zoom: z,
        });
        if (!r || !r.ok) {
          global.SNCli?.log?.(
            'Google imaging needs Maps JavaScript API key · SN_CONFIG.layers.googleMapsKey',
            'err'
          );
          // Fall back to free Esri satellite
          setBasemap('satellite', { log: true });
        }
      })();
      return true;
    }

    // Leaflet basemap — hide Google host if it was on
    try {
      if (global.SNGoogleEarth && SNGoogleEarth.hide) SNGoogleEarth.hide();
    } catch (_) {}

    if (M.basemapLayer) {
      try {
        M.map.removeLayer(M.basemapLayer);
      } catch (_) {}
      M.basemapLayer = null;
    }
    if (M.labelsLayer) {
      try {
        M.map.removeLayer(M.labelsLayer);
      } catch (_) {}
      M.labelsLayer = null;
    }

    if (!def.url) {
      global.SNCli?.log?.('Basemap · missing URL for ' + id, 'err');
      return false;
    }

    M.basemapLayer = L.tileLayer(def.url, Object.assign({ className: 'sn-base-' + id }, def.opts));
    M.basemapLayer.addTo(M.map);
    try {
      M.basemapLayer.bringToBack();
    } catch (_) {}

    if (def.labelsUrl) {
      M.labelsLayer = L.tileLayer(def.labelsUrl, def.labelsOpts || {});
      M.labelsLayer.addTo(M.map);
    }

    try {
      if (opts.user || opts.log) {
        global.SNCli?.log?.(
          'Basemap · ' + def.label + (def.note ? ' · ' + def.note : ''),
          'ok'
        );
      }
    } catch (_) {}
    return true;
  }

  function clearLiveGroup(id) {
    const arr = M.liveMarkers[id] || [];
    arr.forEach((m) => {
      try {
        M.map.removeLayer(m);
      } catch (_) {}
    });
    M.liveMarkers[id] = [];
    if (M.liveTimers[id]) {
      clearInterval(M.liveTimers[id]);
      M.liveTimers[id] = null;
    }
    if (M.overlayLayers[id]) {
      try {
        M.map.removeLayer(M.overlayLayers[id]);
      } catch (_) {}
      M.overlayLayers[id] = null;
    }
  }

  function setWindy(on) {
    const host = M.map && M.map.getContainer();
    if (!host) return;
    let fr = document.getElementById('sn-windy-frame');
    if (!fr) {
      fr = document.createElement('iframe');
      fr.id = 'sn-windy-frame';
      fr.title = 'Windy weather';
      fr.allow = 'fullscreen';
      host.appendChild(fr);
    }
    if (on) {
      const c = M.map.getCenter();
      const z = Math.min(11, Math.max(4, M.map.getZoom() - 2));
      fr.src =
        'https://embed.windy.com/embed2.html?lat=' +
        c.lat.toFixed(3) +
        '&lon=' +
        c.lng.toFixed(3) +
        '&zoom=' +
        z +
        '&level=surface&overlay=wind&menu=&message=&marker=&calendar=&pressure=&type=map&location=coordinates&detail=&detailLat=' +
        c.lat.toFixed(3) +
        '&detailLon=' +
        c.lng.toFixed(3) +
        '&metricWind=default&metricTemp=default&radarRange=-1';
      fr.classList.add('on');
      global.SNCli?.log?.('Windy weather overlay · wind surface', 'ok');
    } else {
      fr.classList.remove('on');
      fr.src = 'about:blank';
    }
  }

  function setW3w(on) {
    let badge = document.getElementById('sn-w3w-badge');
    if (!badge && M.map) {
      badge = document.createElement('div');
      badge.id = 'sn-w3w-badge';
      M.map.getContainer().appendChild(badge);
    }
    if (!badge) return;
    if (on) {
      badge.classList.add('on');
      badge.textContent = '/// tap map for what3words';
      updateW3wBadge();
      if (!M._w3wBound && M.map) {
        M._w3wBound = true;
        M.map.on('click', onW3wClick);
        M.map.on('moveend', updateW3wBadge);
      }
      global.SNCli?.log?.(
        cfgLayers().w3wKey
          ? 'what3words · API key set · tap map'
          : 'what3words · free approx words (set SN_CONFIG.layers.w3wKey for official API)',
        'dim'
      );
    } else {
      badge.classList.remove('on');
    }
  }

  function onW3wClick(e) {
    if (!M.overlayOn.w3w || !e.latlng) return;
    // don't block place mode fully — just update badge
    void resolveW3w(e.latlng.lat, e.latlng.lng).then((w) => {
      const badge = document.getElementById('sn-w3w-badge');
      if (badge) badge.textContent = w;
      global.SNCli?.log?.('w3w · ' + w, 'ok');
    });
  }

  async function resolveW3w(lat, lng) {
    const key = cfgLayers().w3wKey;
    if (key) {
      try {
        const url =
          'https://api.what3words.com/v3/convert-to-3wa?coordinates=' +
          lat +
          ',' +
          lng +
          '&key=' +
          encodeURIComponent(key);
        const r = await fetch(url);
        const j = await r.json();
        if (j && j.words) return '///' + j.words;
      } catch (_) {}
    }
    // Offline-ish readable fallback (not official w3w) — still useful for share
    const a = Math.abs(Math.round(lat * 1e4)).toString(36);
    const b = Math.abs(Math.round(lng * 1e4)).toString(36);
    const c = Math.abs(Math.round((lat + lng) * 1e3)).toString(36);
    return '///sn.' + a + '.' + b + '.' + c + ' · ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  function updateW3wBadge() {
    if (!M.overlayOn.w3w || !M.map) return;
    const c = M.map.getCenter();
    void resolveW3w(c.lat, c.lng).then((w) => {
      const badge = document.getElementById('sn-w3w-badge');
      if (badge && badge.classList.contains('on')) badge.textContent = w;
    });
  }

  async function refreshIss() {
    if (!M.map || !M.overlayOn.iss && !M.overlayOn.sats) return;
    try {
      const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
      const j = await r.json();
      const lat = parseFloat(j.latitude);
      const lng = parseFloat(j.longitude);
      if (!isFinite(lat) || !isFinite(lng)) return;
      clearLiveGroup('iss');
      const m = L.circleMarker([lat, lng], {
        radius: 9,
        color: '#ffcc44',
        fillColor: '#ffaa00',
        fillOpacity: 0.95,
        weight: 2,
      })
        .addTo(M.map)
        .bindTooltip('ISS · ' + lat.toFixed(2) + ', ' + lng.toFixed(2), { permanent: false });
      M.liveMarkers.iss = [m];
      // no fake second "LEO sample" marker
    } catch (e) {
      global.SNCli?.log?.('ISS feed quiet · ' + (e.message || e), 'dim');
    }
  }

  async function refreshPlanes() {
    if (!M.map || !M.overlayOn.planes) return;
    try {
      const b = M.map.getBounds();
      const url =
        'https://opensky-network.org/api/states/all?lamin=' +
        b.getSouth().toFixed(2) +
        '&lomin=' +
        b.getWest().toFixed(2) +
        '&lamax=' +
        b.getNorth().toFixed(2) +
        '&lomax=' +
        b.getEast().toFixed(2);
      const r = await fetch(url);
      if (!r.ok) throw new Error('OpenSky ' + r.status);
      const j = await r.json();
      clearLiveGroup('planes');
      const states = (j && j.states) || [];
      const max = 80;
      for (let i = 0; i < states.length && i < max; i++) {
        const s = states[i];
        const lng = s[5];
        const lat = s[6];
        if (lat == null || lng == null) continue;
        const call = s[1] || s[0] || 'AC';
        const m = L.circleMarker([lat, lng], {
          radius: 4,
          color: '#66ffaa',
          fillColor: '#22cc66',
          fillOpacity: 0.85,
          weight: 1,
        })
          .addTo(M.map)
          .bindTooltip(String(call).trim() + (s[7] != null ? ' · ' + Math.round(s[7]) + ' m' : ''), {
            permanent: false,
          });
        M.liveMarkers.planes.push(m);
      }
      global.SNCli?.log?.('Planes · ' + Math.min(states.length, max) + ' in view (OpenSky)', 'dim');
    } catch (e) {
      global.SNCli?.log?.('Planes · OpenSky quiet · ' + (e.message || e), 'dim');
    }
  }

  function setShips(on) {
    clearLiveGroup('ships');
    if (!on || !M.map) return;
    // OpenSeaMap seamarks overlay — free marine chart marks
    try {
      M.overlayLayers.ships = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        maxZoom: 18,
        opacity: 0.9,
        attribution: '© OpenSeaMap',
      }).addTo(M.map);
      global.SNCli?.log?.('Ships · OpenSeaMap seamarks (free chart marks)', 'ok');
    } catch (e) {
      global.SNCli?.log?.('Ships layer failed', 'err');
    }
  }

  function utcDate(offsetDays) {
    var d = new Date(Date.now() - (offsetDays || 0) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function gibsTileUrl(def, date) {
    return (
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' +
      def.layer +
      '/default/' +
      date +
      '/' +
      def.matrix +
      '/{z}/{y}/{x}.' +
      (def.ext || 'png')
    );
  }

  function addGibsLayer(id, def, date) {
    clearLiveGroup(id);
    if (!M.map || typeof L === 'undefined') return null;
    var layer = L.tileLayer(gibsTileUrl(def, date), {
      maxNativeZoom: def.maxNativeZoom || 7,
      maxZoom: 20,
      opacity: def.opacity != null ? def.opacity : 0.7,
      attribution: 'NASA GIBS · ' + date,
      crossOrigin: true,
    });
    layer.addTo(M.map);
    M.overlayLayers[id] = layer;
    return layer;
  }

  function wantsImagery(s) {
    var t = String(s || '').toLowerCase();
    if (!t) return false;
    if (/\b(real[\s-]?time|satellite|imagery|sat view|from space|nasa|sentinel|chlorophyll)\b/.test(t))
      return true;
    if (/\b(sea|θάλασσ|ocean)\b/.test(t) && /\b(pollut|ρύπανσ|bloom|dirty|stain|imagery|image)\b/.test(t))
      return true;
    return false;
  }

  async function showLiveSat(lat, lng, opts) {
    opts = opts || {};
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return false;
    try {
      var brief = document.getElementById('sn-brief-sheet');
      if (brief && brief.parentNode) brief.parentNode.removeChild(brief);
    } catch (_) {}
    M._exitZoom = 6;
    M._imageryOn = true;
    var date = utcDate(1);
    M.satDate = date;
    await open(lat, lng, {
      force: true,
      zoom: opts.zoom != null ? opts.zoom : 14,
      basemap: 'satellite',
      imagery: true,
    });
    try {
      setBasemap('satellite', { log: false });
    } catch (_) {}
    M.overlayOn.chloro = false;
    M.overlayOn.gibs = false;
    if (opts.pollution !== false) {
      M.overlayOn.chloro = true;
      addGibsLayer('chloro', OVERLAYS.chloro, date);
    }
    if (opts.trueColor !== false) {
      M.overlayOn.gibs = true;
      addGibsLayer('gibs', OVERLAYS.gibs, date);
    }
    try {
      if (M._plume) {
        M.map.removeLayer(M._plume);
        M._plume = null;
      }
    } catch (_) {}
    if (opts.plume !== false && typeof L !== 'undefined' && M.map) {
      M._plume = L.rectangle(
        [
          [lat - 0.0007, lng + 0.0006],
          [lat + 0.0007, lng + 0.0034],
        ],
        {
          color: '#d06a2a',
          weight: 1,
          fillColor: '#d06a2a',
          fillOpacity: 0.16,
          dashArray: '4 3',
        }
      ).addTo(M.map);
      try {
        M._plume.bindTooltip('Reported stain · 150 × 300 m', { permanent: false });
      } catch (_) {}
    }
    try {
      markYou(lat, lng, opts.label || 'Plant');
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.setHud)
        SNGlobe.setHud('LIVE SAT · NASA ' + date);
    } catch (_) {}
    try {
      global.SNCli?.log?.(
        'Satellite · NASA VIIRS last pass ' + date + ' · not a street map',
        'ok'
      );
      if (opts.pollution !== false) {
        global.SNCli?.log?.(
          'Green / yellow on the water is chlorophyll — bloom, runoff, dirty sea. Land stays photo.',
          'dim'
        );
      }
      global.SNCli?.preview?.('sat · ' + date);
    } catch (_) {}
    return { ok: true, date: date, lat: lat, lng: lng };
  }

  function toggleOverlay(id) {
    const def = OVERLAYS[id];
    if (!def || !M.map) return false;
    const on = !M.overlayOn[id];
    M.overlayOn[id] = on;
    saveOverlayPref();

    if (def.kind === 'iframe' && id === 'windy') {
      setWindy(on);
      return true;
    }
    if (def.kind === 'tool' && id === 'w3w') {
      setW3w(on);
      return true;
    }
    if (def.kind === 'tile' && def.url) {
      clearLiveGroup(id);
      if (on) {
        M.overlayLayers[id] = L.tileLayer(def.url, def.opts || {}).addTo(M.map);
      }
      global.SNCli?.log?.((on ? 'On · ' : 'Off · ') + def.label, 'dim');
      return true;
    }
    if (def.kind === 'gibs') {
      clearLiveGroup(id);
      if (on) {
        addGibsLayer(id, def, M.satDate || utcDate(1));
      }
      global.SNCli?.log?.((on ? 'On · ' : 'Off · ') + def.label + (M.satDate ? ' · ' + M.satDate : ''), on ? 'ok' : 'dim');
      return true;
    }
    if (id === 'ships') {
      setShips(on);
      return true;
    }
    if (id === 'iss' || id === 'sats') {
      if (M.liveTimers.iss) {
        clearInterval(M.liveTimers.iss);
        M.liveTimers.iss = null;
      }
      if (!on && id === 'iss' && !M.overlayOn.sats) clearLiveGroup('iss');
      if (!on && id === 'sats' && !M.overlayOn.iss) clearLiveGroup('iss');
      if (on || M.overlayOn.iss || M.overlayOn.sats) {
        void refreshIss();
        M.liveTimers.iss = setInterval(() => void refreshIss(), def.pollMs || 10000);
      }
      global.SNCli?.log?.((on ? 'On · ' : 'Off · ') + def.label, on ? 'ok' : 'dim');
      return true;
    }
    if (id === 'planes') {
      if (M.liveTimers.planes) {
        clearInterval(M.liveTimers.planes);
        M.liveTimers.planes = null;
      }
      if (on) {
        void refreshPlanes();
        M.liveTimers.planes = setInterval(() => void refreshPlanes(), def.pollMs || 15000);
      } else clearLiveGroup('planes');
      global.SNCli?.log?.((on ? 'On · ' : 'Off · ') + def.label, on ? 'ok' : 'dim');
      return true;
    }
    return false;
  }

  function restoreOverlays() {
    Object.keys(M.overlayOn).forEach((id) => {
      if (M.overlayOn[id]) {
        M.overlayOn[id] = false; // force re-toggle on
        toggleOverlay(id);
      }
    });
  }

  async function ensure() {
    if (M.map) return M.map;
    // Serialize concurrent open/ensure so Leaflet is not double-inited
    if (M._ensureP) return M._ensureP;
    M._ensureP = (async () => {
    if (M.map) return M.map;
    loadBasemapPref();
    loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    const el = document.getElementById('city-map');
    if (!el || typeof L === 'undefined') throw new Error('map container');
    if (M.map) return M.map;
    // If Leaflet already bound to container (stale), tear down gently
    try {
      if (el._leaflet_id && !M.map) {
        try { el._leaflet_id = null; el.innerHTML = ''; } catch (_) {}
      }
    } catch (_) {}
    const pos = global.SNTasks?.pos || global._snLastPos || { lat: 36.4341, lng: 28.2176 };
    M.map = L.map(el, {
      zoomControl: false, // no +/− corner controls — pinch/wheel only
      attributionControl: true,
      minZoom: 3,
      maxZoom: 20,
      preferCanvas: true, // lighter target drawing when many markers
    }).setView([pos.lat, pos.lng], 14);
    bindUserCameraLock(M.map);

    // Basemap + full Layers panel (basemaps + multi overlays)
    setBasemap(M.basemapId || 'dark', { log: false });
    buildLayerControl(M.map);
    restoreOverlays();

    // Zoom OUT toward city edge → real 3D globe (never leave user on flat map forever)
    // Exit threshold ~11: pinch/wheel out past neighborhood returns to sphere (not minZoom=3)
    M._lastZ = 14;
    M._exitZoom = 11;
    M.map.on('zoomend', () => {
      if (!M.active) return;
      const z = M.map.getZoom();
      if (z < M._lastZ && z <= (M._exitZoom || 11)) {
        backToGlobe();
        return;
      }
      M._lastZ = z;
    });
    // Wheel zoom-out past exit also returns to globe
    M.map.getContainer().addEventListener(
      'wheel',
      (e) => {
        if (!M.active || e.deltaY <= 0) return;
        if (M.map.getZoom() <= (M._exitZoom || 11)) {
          e.preventDefault();
          backToGlobe();
        }
      },
      { passive: false }
    );
    // Two-finger pinch-out on street map → back to 3D globe once under exit zoom
    const mapEl = M.map.getContainer();
    let mapPinch0 = 0;
    mapEl.addEventListener(
      'touchstart',
      (e) => {
        if (!M.active || !e.touches || e.touches.length !== 2) {
          mapPinch0 = 0;
          return;
        }
        const a = e.touches[0],
          b = e.touches[1];
        mapPinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      },
      { passive: true }
    );
    mapEl.addEventListener(
      'touchmove',
      (e) => {
        if (!M.active || !e.touches || e.touches.length !== 2 || !mapPinch0) return;
        const a = e.touches[0],
          b = e.touches[1];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
        const ratio = d / mapPinch0;
        // Pinch-in (fingers closer) while already zoomed out enough → leave linear map
        if (ratio < 0.78 && M.map.getZoom() <= (M._exitZoom || 11) + 1.5) {
          e.preventDefault();
          mapPinch0 = 0;
          backToGlobe();
        }
      },
      { passive: false }
    );

    // LONG-PRESS empty map → multi-tile create (never short accidental click)
    bindLongPressCreate(M.map);

    return M.map;
    })();
    try {
      const m = await M._ensureP;
      return m;
    } catch (e) {
      M._ensureP = null;
      throw e;
    }
  }

  function bindLongPressCreate(map) {
    if (!map || map._snLongPressBound) return;
    map._snLongPressBound = true;
    const HOLD_MS = 580;
    let timer = null;
    let startLL = null;
    let startPt = null;
    let cancelled = false;

    function clear() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      startLL = null;
      startPt = null;
    }

    function onDown(e) {
      // Original event may be on a marker — skip create
      const oe = e.originalEvent;
      if (oe && oe.target) {
        const t = oe.target;
        if (
          t.closest &&
          (t.closest('.leaflet-marker-icon') ||
            t.closest('.leaflet-interactive') ||
            t.closest('.sn-target') ||
            t.closest('.sn-target-inner') ||
            t.closest('.sn-pin') ||
            t.closest('.sn-pin-inner'))
        ) {
          return;
        }
      }
      if (M._markerHit) return;
      cancelled = false;
      startLL = e.latlng;
      startPt = e.containerPoint || (e.originalEvent && e.originalEvent.touches && e.originalEvent.touches[0]
        ? { x: e.originalEvent.touches[0].clientX, y: e.originalEvent.touches[0].clientY }
        : null);
      if (!startPt) return;
      timer = setTimeout(() => {
        timer = null;
        if (cancelled || !startLL || !M.active) return;
        try {
          global.SNTile?.createAt?.(startLL.lat, startLL.lng);
          global.SNCli?.log?.('Long-press · multi-tile', 'ok');
        } catch (err) {
          global.SNCli?.log?.('Tile create failed · ' + (err.message || err), 'err');
        }
      }, HOLD_MS);
    }

    function onMove(e) {
      if (!startPt || !e.containerPoint) return;
      const dx = e.containerPoint.x - startPt.x;
      const dy = e.containerPoint.y - startPt.y;
      if (dx * dx + dy * dy > 100) {
        cancelled = true;
        clear();
      }
    }

    function onUp() {
      clear();
      // allow next marker hit flag to clear after click cycle
      setTimeout(() => {
        M._markerHit = false;
      }, 50);
    }

    map.on('mousedown', onDown);
    map.on('touchstart', onDown, { passive: true });
    map.on('mousemove', onMove);
    map.on('touchmove', onMove, { passive: true });
    map.on('mouseup', onUp);
    map.on('touchend', onUp);
    map.on('touchcancel', onUp);
    // Short click empty map:
    // · Place mode (Pin / Targets / Tile) → SNTopo
    // · else → NATIONAL globe at that place
    map.on('click', (e) => {
      clear();
      if (M._markerHit) return;
      if (!e || !e.latlng) return;
      const la = e.latlng.lat;
      const lo = e.latlng.lng;
      try {
        var ev = e.originalEvent || e;
        if (global.SNHelper && SNHelper.followTap) {
          SNHelper.followTap(la, lo, {
            x: ev.clientX,
            y: ev.clientY,
          });
        }
      } catch (_) {}
      try {
        if (global.SNTopo && SNTopo.onMapClick && SNTopo.onMapClick(la, lo)) {
          return;
        }
        // Leave street map, fly 3D Earth to that place at NATIONAL
        close();
        if (global.SNGlobe?.goToPlace) {
          global.SNGlobe.goToPlace(la, lo, {
            tier: 'national',
            openMap: false,
            pulse: false,
            body: 'earth',
            label: 'Map focus',
          });
        } else if (global.SNGlobe?.flyNear) {
          global.SNGlobe.flyNear(la, lo, 'national');
        }
        global._snLastPos = { lat: la, lng: lo };
        global.SNTasks?.setPos?.(la, lo);
        global.SNCli?.log?.(
          'NATIONAL · ' + la.toFixed(3) + ', ' + lo.toFixed(3),
          'ok'
        );
      } catch (err) {
        global.SNCli?.log?.('Map fly failed · ' + (err.message || err), 'err');
      }
    });
  }

  function markMarkerHit() {
    M._markerHit = true;
    setTimeout(() => {
      M._markerHit = false;
    }, 400);
  }

  function clearGroup(arr) {
    arr.forEach((m) => {
      try {
        M.map.removeLayer(m);
      } catch (_) {}
    });
    arr.length = 0;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function avatarIcon(url, color) {
    const c = color || '#3d9eff';
    const real = url && /^https?:\/\//i.test(url) && url.indexOf('data:') !== 0;
    return L.divIcon({
      className: 'sn-dot-pin',
      html:
        '<i class="sn-dot" style="background:' +
        c +
        ';box-shadow:0 0 8px ' +
        c +
        '99">' +
        (real ? '<img src="' + escapeHtml(url) + '" alt="" />' : '') +
        '</i>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  /** Fit map to lat/lng points (order polygon · you + vendor). force bypasses camera hold. */
  function fitLatLngs(points, opts) {
    opts = opts || {};
    if (!M.map || typeof L === 'undefined' || !points || !points.length) return false;
    try {
      if (opts.force) {
        M.userHold = false;
        try {
          localStorage.removeItem('sn:map-user-hold');
        } catch (_) {}
      }
      var ll = points
        .filter(function (p) {
          return p && p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng);
        })
        .map(function (p) {
          return [Number(p.lat), Number(p.lng)];
        });
      if (!ll.length) return false;
      if (ll.length === 1) {
        M.map.setView(ll[0], opts.zoom || 15, { animate: true });
        return true;
      }
      var b = L.latLngBounds(ll);
      M.map.fitBounds(b, {
        padding: [opts.padding != null ? opts.padding : 48, opts.padding != null ? opts.padding : 48],
        maxZoom: opts.maxZoom != null ? opts.maxZoom : 15,
        animate: opts.animate !== false,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Blue “YOU” marker on city map — tap opens YOUR profile tile (not empty junk) */
  function markYou(lat, lng, label) {
    if (lat == null || lng == null || !M.map || typeof L === 'undefined') return null;
    try {
      if (M._youMark) {
        try {
          M.map.removeLayer(M._youMark);
        } catch (_) {}
        M._youMark = null;
      }
      // Keep profile pin current
      try {
        if (global.SNProfiles && SNProfiles.me) {
          var me = SNProfiles.me();
          if (me && SNProfiles.upsert) {
            me.lat = Number(lat);
            me.lng = Number(lng);
            SNProfiles.upsert(me);
          }
        }
      } catch (_) {}
      M._youMark = L.circleMarker([Number(lat), Number(lng)], {
        radius: 11,
        color: '#ffffff',
        fillColor: '#3d9eff',
        fillOpacity: 1,
        weight: 3,
      }).addTo(M.map);
      M._youMark.bindPopup(
        '<b>' +
          (label || 'YOU') +
          '</b><br/><span style="opacity:.85">Tap pin · open your tile</span>',
        { closeButton: true, autoClose: true }
      );
      M._youMark.off('click');
      M._youMark.on('click', function (e) {
        markMarkerHit();
        try {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
        } catch (_) {}
        try {
          if (global.SNTile && SNTile.openMe) SNTile.openMe('about');
          else if (global.SNField && SNField.openLoggedInUser)
            SNField.openLoggedInUser({ tab: 'about' });
        } catch (err) {
          try {
            global.SNCli && SNCli.log && SNCli.log('Me tile · ' + (err.message || err), 'err');
          } catch (_) {}
        }
      });
      // Sync legacy _me marker to same spot + same openMe handler
      try {
        if (M._me) {
          M._me.setLatLng([Number(lat), Number(lng)]);
        }
      } catch (_) {}
      return M._youMark;
    } catch (e) {
      return null;
    }
  }

  function showTasks() {
    if (!M.map) return;
    clearGroup(M.markers);
    const tasks = global.SNTasks?.list?.({ all: true }) || global.SNTasks?.list?.() || [];
    tasks.forEach((t) => {
      if (!t || t.lat == null) return;
      if (t.status === 'done') return;
      const en = global.SNTaskBoard?.enrich?.(t);
      const price =
        en && en.price != null
          ? global.SNCurrency
            ? SNCurrency.format(en.price)
            : en.price.toFixed(2) + ' S'
          : '';
      const color = (global.SNTasks?.KINDS?.[t.kind] || {}).color;
      const hex =
        typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : '#1a6fd4';
      const m = L.circleMarker([t.lat, t.lng], {
        radius: 8,
        color: hex,
        fillColor: hex,
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(M.map)
        .bindPopup(
          '<div style="min-width:160px">' +
            (price
              ? '<div style="font:800 20px ui-monospace,system-ui;color:#1a6fd4;text-shadow:0 0 10px rgba(26,111,212,.9)">' +
                escapeHtml(price) +
                '</div>'
              : '') +
            '<b>' +
            escapeHtml(t.title) +
            '</b><br/>' +
            (en
              ? '<span style="color:#8ab4d0;font-size:11px">Vendor · ' +
                escapeHtml(en.vendorName) +
                '<br/>' +
                escapeHtml(en.vendorAddress) +
                '<br/>Client · ' +
                escapeHtml(en.clientName) +
                '<br/>' +
                escapeHtml(en.clientAddress) +
                '</span><br/>'
              : '') +
            '<button type="button" class="sn-pop-btn" data-task-open="' +
            escapeHtml(t.id) +
            '">Open task</button> ' +
            '<button type="button" class="sn-pop-btn" data-task="' +
            escapeHtml(t.id) +
            '">Claim</button></div>'
        );
      m.on('click', (e) => {
        markMarkerHit();
        try {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
        } catch (_) {}
        try {
          if (global.SNTaskBoard?.openTaskTile) global.SNTaskBoard.openTaskTile(t);
        } catch (_) {}
      });
      m.on('popupopen', () => {
        document.querySelectorAll('[data-task="' + t.id + '"]').forEach((btn) => {
          btn.onclick = (ev) => {
            ev?.stopPropagation?.();
            const r = global.SNTasks?.claim?.(t.id);
            if (r?.ok) {
              global.SNCli?.log?.('Claimed · ' + r.task.title, 'ok');
              void global.SNTaskBoard?.previewTaskOnMap?.(r.task, { fit: true, force: true });
            }
          };
        });
        document.querySelectorAll('[data-task-open="' + t.id + '"]').forEach((btn) => {
          btn.onclick = (ev) => {
            ev?.stopPropagation?.();
            global.SNTaskBoard?.openTaskTile?.(t);
          };
        });
      });
      M.markers.push(m);
    });
  }

  function roleBadge(p) {
    const r = p.roles || {};
    const bits = [];
    if (r.vendor) bits.push('🏪');
    if (r.driver) bits.push(p.driverOnline ? '🛵🟢' : '🛵');
    if (r.worker) bits.push('🧰');
    if (r.dating) bits.push('💕');
    if (r.client) bits.push('👤');
    return bits.join(' ') || '·';
  }

  function hoursLine(p) {
    const h = p.hours || p.opening_hours || '';
    if (!h) return 'Hours · SpaceNet 24/7';
    return 'Hours · ' + String(h).slice(0, 48);
  }

  function showProfiles() {
    if (!M.map) return;
    clearGroup(M.profileMarkers);
    const Prof = global.SNProfiles;
    if (!Prof) return;
    const list = (Prof.list() || []).filter(function (p) {
      if (!p || p.lat == null || p.lng == null) return false;
      if (p.demo || p.npc || p.fake) return false;
      var id = String(p.id || '');
      var junk = /^poi_/.test(id) && !(p.menu && p.menu.length) && !p.googlePlaceId && !p.osm_id;
      if (junk) return false;
      return !!(p.roles && (p.roles.vendor || p.roles.driver) || p.menu && p.menu.length || p.shopName);
    });
    list.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const color = (Prof.pinColor && Prof.pinColor(p)) || '#3d9eff';
      const m = L.marker([p.lat, p.lng], {
        icon: avatarIcon(p.avatar, color),
        title: p.shopName || p.name || 'Shop',
        keyboard: true,
      }).addTo(M.map);
      const menuN = (p.menu && p.menu.length) || 0;
      m.bindPopup(
        '<div class="sn-pin-menu"><b>' +
          escapeHtml(p.shopName || p.name) +
          '</b>' +
          (menuN ? '<br/>' + menuN + ' items' : '') +
          '<br/><button type="button" class="sn-pin-order" data-pid="' +
          escapeHtml(p.id) +
          '">Order</button></div>',
        { closeButton: true, autoClose: true, maxWidth: 180 }
      );
      m.on('popupopen', function () {
        var btn = document.querySelector('.sn-pin-order[data-pid="' + p.id + '"]');
        if (btn)
          btn.onclick = function (ev) {
            ev.preventDefault();
            try {
              global.SNTile && SNTile.open && SNTile.open(global.SNProfiles.get(p.id) || p, { tab: 'menu' });
            } catch (_) {}
          };
      });
      m.on('click', (e) => {
        markMarkerHit();
        try {
          L.DomEvent.stopPropagation(e);
        } catch (_) {}
      });
      M.profileMarkers.push(m);
    });
  }

  async function open(lat, lng, opts) {
    opts = opts || {};
    const force = opts.force === true;
    const map = await ensure();
    bindUserCameraLock(map);
    const look =
      (global.SNGlobe && SNGlobe.viewLatLng && SNGlobe.viewLatLng()) ||
      (global.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      null;
    const p = {
      lat: lat != null ? Number(lat) : look && look.lat != null ? look.lat : null,
      lng: lng != null ? Number(lng) : look && look.lng != null ? look.lng : null,
    };
    if (p.lat == null || p.lng == null || !isFinite(p.lat) || !isFinite(p.lng)) {
      return M.map;
    }
    const wrap = document.getElementById('city-map');
    const globe = document.getElementById('globe');
    if (wrap) {
      wrap.classList.add('active');
      wrap.setAttribute('aria-hidden', 'false');
      wrap.style.cssText =
        'position:fixed;inset:0;z-index:80;opacity:1;pointer-events:auto;background:#000;';
    }
    if (globe) {
      if (opts.keepGlobe || opts.split) globe.classList.remove('city-hidden');
      else globe.classList.add('city-hidden');
    }
    document.body.classList.add('city-map-on');
    if (opts.split) document.body.classList.add('sn-order-live');
    const wasActive = M.active;
    M.active = true;
    // Recenter only if autopilot OR forced (user CLI / first open / locate)
    if (force || canAutopilot() || !wasActive) {
      var z =
        opts.zoom != null
          ? Number(opts.zoom)
          : force
            ? 15
            : wasActive
              ? map.getZoom() || 15
              : 15;
      if (!isFinite(z)) z = 15;
      map.setView([p.lat, p.lng], z, { animate: true });
    }
    setTimeout(() => map.invalidateSize(), 80);

    // Surface basemap: imagery request wins; else keep user choice, else day-night
    if (opts.imagery || opts.basemap === 'satellite') {
      setBasemap('satellite', { log: false });
      M._exitZoom = 6;
    } else if (!hasUserLayerPref()) {
      setBasemap(suggestBasemapFromDayNight(p.lat, p.lng), { log: false });
    } else if (!M.basemapLayer) {
      setBasemap(M.basemapId || 'dark', { log: false });
    }

    try {
      // Silent open — user already asked for city; no engine chatter
      global.SNCli?.preview?.(
        'City map · ' + (BASEMAPS[M.basemapId]?.label || M.basemapId)
      );
    } catch (_) {}
    try {
      if (global.SNTopo && SNTopo.paintMap) SNTopo.paintMap();
    } catch (_) {}

    // Real sector only — DB + edge + Overpass + crawl (SPECS: zero dummy)
    try {
      if (global.SNCommerce?.ensureSector) {
        await global.SNCommerce.ensureSector(p.lat, p.lng, { openMap: true });
      } else {
        await global.SNCommerce?.populateMap?.(p.lat, p.lng, { openMap: true });
      }
    } catch (e) {
      global.SNCli?.log?.('Sector load · ' + (e.message || e), 'err');
    }

    showTasks();
    showProfiles();

    if (!M._me) {
      M._me = L.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: '#ffffff',
        fillColor: '#3d9eff',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      M._me.on('click', (e) => {
        markMarkerHit();
        try {
          L.DomEvent.stopPropagation(e);
          if (e.originalEvent) L.DomEvent.stop(e.originalEvent);
        } catch (_) {}
        try {
          if (global.SNTile?.openMe) global.SNTile.openMe('about');
          else if (global.SNField?.openLoggedInUser)
            global.SNField.openLoggedInUser({ tab: 'about' });
        } catch (_) {}
      });
    } else {
      M._me.setLatLng([p.lat, p.lng]);
    }

    // City briefing — vendors · workers · drivers · dating (real tiles only)
    try {
      const Prof = global.SNProfiles;
      const all = (Prof?.list?.() || []).filter((x) => x.lat != null);
      const nV = all.filter((x) => x.roles?.vendor).length;
      const nD = all.filter((x) => x.roles?.driver).length;
      const nW = all.filter((x) => x.roles?.worker).length;
      const nDate = all.filter((x) => x.roles?.dating).length;
      const nTask = (global.SNTasks?.list?.() || []).length;
      global.SNCli?.log?.(
        'CITY · 🏪' +
          nV +
          ' vendors · 🛵' +
          nD +
          ' drivers · 🧰' +
          nW +
          ' workers · 💕' +
          nDate +
          ' dating · tasks ' +
          nTask,
        nV || nD || nW || nDate ? 'ok' : 'dim'
      );
      global.SNCli?.log?.(
        'Tap target → tile (menu · hours · roles) · pizza · job barman · date coffee · long-press create',
        'dim'
      );
      global.SNCli?.preview?.(
        nV || nD ? nV + ' shops · ' + nD + ' drivers' : 'City · pizza · barman · date'
      );
    } catch (_) {
      global.SNCli?.log?.(
        'City · short-tap target = open · long-press empty = create · live crawl shops',
        'ok'
      );
      global.SNCli?.preview?.('Tap target · long-press create · 🌍 Earth');
    }
    return true;
  }

  function close() {
    if (!M.active && !document.body.classList.contains('city-map-on')) {
      // already closed — avoid recursion with SNGlobe.goToTier → close
      if (document.getElementById('globe')) {
        document.getElementById('globe').classList.remove('city-hidden');
      }
      return;
    }
    // Pause live feeds / windy while map hidden
    try {
      setWindy(false);
      Object.keys(M.liveTimers).forEach((k) => {
        if (M.liveTimers[k]) {
          clearInterval(M.liveTimers[k]);
          M.liveTimers[k] = null;
        }
      });
    } catch (_) {}
    M.panelOpen = false;
    const wrap = document.getElementById('city-map');
    const globe = document.getElementById('globe');
    if (wrap) {
      wrap.classList.remove('active');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.cssText = '';
    }
    if (globe) globe.classList.remove('city-hidden');
    document.body.classList.remove('city-map-on');
    M.active = false;
    try {
      global.SNTile?.close?.();
    } catch (_) {}
    global.SNCli?.preview?.('Earth · type a command');
  }

  function toggle() {
    if (M.active) close();
    else return open();
  }

  function plotCrawl(places) {
    if (!places?.length || !M.map) return;
    places.slice(0, 24).forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const isShop = /shop|vendor|restaurant|cafe|food|bar|kitchen|amenity/i.test(
        String(p.kind || p.type || p.category || '')
      );
      const m = L.circleMarker([p.lat, p.lng], {
        radius: isShop ? 6 : 4,
        color: isShop ? '#ffcc66' : '#7ec8ff',
        fillColor: isShop ? '#ffaa33' : '#3d9eff',
        fillOpacity: 0.9,
        weight: 1,
      })
        .addTo(M.map)
        .bindPopup(
          '<div class="sn-pin-menu"><b>' +
            escapeHtml(p.name || 'Place') +
            '</b>' +
            (isShop ? '<br/><button type="button" class="sn-pin-order">Order</button>' : '') +
            '</div>',
          { maxWidth: 160 }
        );
      if (isShop) {
        m.on('popupopen', function () {
          var btn = document.querySelector('.sn-pin-order');
          if (!btn) return;
          btn.onclick = function (ev) {
            ev.preventDefault();
            try {
              var pos = global.SNTasks?.pos || global._snLastPos;
              var prof = global.SNProfiles?.fromCrawlPlace?.(p, pos);
              if (prof && global.SNTile) SNTile.open(prof, { tab: 'menu' });
            } catch (_) {}
          };
        });
      }
      m.on('click', (e) => {
        markMarkerHit();
        try {
          L.DomEvent.stopPropagation(e);
        } catch (_) {}
      });
      M.markers.push(m);
    });
  }

  function init() {
    document.getElementById('btn-city')?.addEventListener('click', () => {
      void toggle().catch((e) => global.SNCli?.log?.(String(e.message || e), 'err'));
    });
    document.getElementById('btn-city-close')?.addEventListener('click', () => {
      backToGlobe();
    });
  }

  global.SNMap = {
    init,
    open,
    close,
    toggle,
    backToGlobe,
    showTasks,
    showProfiles,
    plotCrawl,
    ensure,
    setBasemap,
    toggleOverlay,
    showLiveSat,
    wantsImagery,
    softSetView,
    fitLatLngs,
    markYou,
    canAutopilot,
    userHoldCamera,
    releasePilot: releasePilot,
    /** true when user has overridden sim/AI camera */
    get userHold() {
      return M.userHold;
    },
    openLayersPanel: function () {
      var self = this;
      function show() {
        if (!document.getElementById('sn-layer-panel')) buildLayerControl(M.map);
        M.panelOpen = true;
        const p = document.getElementById('sn-layer-panel');
        if (!p) return false;
        const wrap = document.getElementById('sn-map-layers');
        if (wrap && wrap.parentNode !== document.body) document.body.appendChild(wrap);
        p.classList.add('open');
        renderLayerPanel();
        try {
          if (M.map && M.map.invalidateSize) M.map.invalidateSize();
        } catch (_) {}
        return true;
      }
      if (!M.map && typeof self.open === 'function') {
        var pin =
          (global.SNGlobe && SNGlobe.viewLatLng && SNGlobe.viewLatLng()) ||
          global._snGlobeFocus ||
          global._snPhysPos ||
          global._snLastPos;
        if (!pin || pin.lat == null) return show();
        return Promise.resolve(self.open(pin.lat, pin.lng, { force: true }))
          .then(show)
          .catch(show);
      }
      return show();
    },
    getMap: function () {
      return M.map || null;
    },
    get map() {
      return M.map || null;
    },
    getBasemap: function () {
      return M.basemapId;
    },
    getOverlays: function () {
      return Object.assign({}, M.overlayOn);
    },
    BASEMAPS,
    OVERLAYS,
    get active() {
      return M.active;
    },
    get map() {
      return M.map;
    },
  };
})(window);
