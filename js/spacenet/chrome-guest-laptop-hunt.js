/**
 * Guest laptop hunt — Build 20260823034000-laptop-flylie
 * PATCH #132 only. Never edit chrome-guest-pizza-hunt.js (#127).
 * Do not touch #127 (pizza), #129 (CALL), #130 (nairobi), #131 (kalithea).
 *
 * KEEP (locked PASS of 20260823032000-laptop-tap):
 *   OSM hunt = 24 real Rhodes electronics. Unique CSS overlay (~22 pins,
 *   spiral if <20px). CITY altitude before pins. Camera: SA stays put.
 *   rhodes via probe-sign flyGlobeTo. Tap: Shop · name · km · ⭐ + consumeClick.
 *   Empty SA/Pacific hunt → Hunt failed. No Google. No DRIVER EN ROUTE.
 *   Do not restyle twin CLI chrome / #stc-cmd-in.
 *
 * NIT 20260823034000-laptop-flylie:
 *   After a successful fly the CLI still printed "Fly failed" when
 *   viewLatLng was 36.440, 28.037 (Rhodes, ~16 km from 36.44, 28.22).
 *   Print "Fly failed" ONLY when the rendered camera did not reach the
 *   target: haversine > ~50 km, or probe-sign checks fail. If the view
 *   is already near Rhodes (~36.4, 28.1), treat the fly as success and
 *   print the success line.
 *
 * Product law: if it is not on the globe it is not shipped.
 */
(function (G) {
  'use strict';
  if (G.__snGuestLaptopHunt20260823034000) return;
  G.__snGuestLaptopHunt20260823034000 = 1;

  var BUILD = '20260823034000-laptop-flylie';
  var hunting = false;
  var huntSession = false;
  var lastPins = [];
  var pinMeshes = [];
  var earthPinMeshes = [];
  var clickUnsub = null;
  var askedLocate = false;
  var suppressPoiUntil = 0;
  var canvasTapBound = false;
  var overlayTapBound = false;
  var overlayLockUntil = 0;
  var lastFly = null;
  var lastProbe = { sLat: 0, sLng: 0 };
  var overlayRaf = 0;
  var lastOverlaySpread = 0;
  var lastWorldDistinct = false;
  var lastOverlayPoints = [];
  var cliWrap = null;
  var huntFailed = false;
  var preferCameraUntil = 0;
  var announcedAt = 0;

  var SETTLE_DEG = 0.15;
  var FLY_OK_KM = 50;
  var HUNT_KM = 16.5;
  var PIN_MS = 180000;
  var PIN_COLOR_A = 0x7ee9ff;
  var PIN_COLOR_B = 0xb48eff;
  var PIN_HIT_PX = 22;
  var KALITHEA = { lat: 36.387557, lng: 28.222533 };
  var RHODES = { lat: 36.44, lng: 28.22, name: 'Rhodes' };
  var RHODES_NEAR = { lat: 36.4, lng: 28.1 };
  var RHODES_VIEW_BOX = { latMin: 36.0, latMax: 36.5, lngMin: 27.7, lngMax: 28.4 };
  var RHODES_BOX = { latMin: 35.82, latMax: 36.52, lngMin: 27.62, lngMax: 28.42 };
  var OSM_SHOP_TAGS = ['electronics', 'computer', 'mobile_phone', 'hifi', 'appliance', 'telecommunication'];
  var OVERPASS_TIMEOUT_S = 28;
  var OVERPASS_FETCH_MS = 32000;
  var OVERPASS_ENDPOINTS = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  var PLACES = [
    { name: 'Rhodes', latMin: 35.82, latMax: 36.52, lngMin: 27.62, lngMax: 28.42 },
    { name: 'Nairobi', latMin: -1.7, latMax: -0.9, lngMin: 36.5, lngMax: 37.1 },
    { name: 'Athens', latMin: 37.85, latMax: 38.15, lngMin: 23.6, lngMax: 23.9 },
    { name: 'SanJose', latMin: 37.2, latMax: 37.45, lngMin: -122.05, lngMax: -121.75 },
  ];

  var FAKE_YOU = [
    { lat: 36.387557, lng: 28.222533, r: 0.03, name: 'Kalithea' },
    { lat: 36.434, lng: 28.217, r: 0.06, name: 'Rhodes silent' },
    { lat: 36.43, lng: 28.22, r: 0.05, name: 'Rhodes center' },
    { lat: 36.443, lng: 28.226, r: 0.04, name: 'Rhodes town' },
    { lat: 37.339, lng: -121.895, r: 0.12, name: 'San Jose IP' },
    { lat: 37.338, lng: -121.886, r: 0.12, name: 'Columbus Park' },
    { lat: 37.33, lng: -121.89, r: 0.12, name: 'San Jose' },
  ];

  var TECH =
    /electronics|computer|laptop|notebook|macbook|pc\b|desktop|notebook|smartphone|mobile_phone|mobile phone|hifi|hi-fi|telecom|telecommunication|internet_cafe|internet cafe|plaisio|kotsovolos|germanos|media\s*markt|best\s*buy|currys|fnac|saturn|apple\s*store|microsoft|public\b|multirama|electro\b|tech\s*shop|computer_shop|computershop/i;
  var TECH_SHOP_OSM = /^(computer|electronics|mobile_phone|hifi|telecommunication|appliance|internet_cafe)$/i;
  var FOOD_BLOCK =
    /restaurant|fast_food|\bcafe\b|bar|pub|pizza|pizzeria|bakery|taverna|grill|souvlaki|kebab|burger|sushi|kitchen|deli|ice_cream|dessert/i;
  var FAKE_OPS_RE = /DRIVER\s+EN\s+ROUTE|SEEKING\s+DRIVER|\bme-av\b|\bme_av\b|\bmeav\b/i;
  var POI_DUMP_RE =
    /Πλατεία|Πλατεια|πλατεία|\b\d+\s+POIs?\b|\b\d+\s+real shops\b|80 real shops|18 POIs|shops\.\s*0 real|\b0 real\b.*\bdb\b|\b- db\b|map search failed/i;
  var SYNTHETIC_NAME_RE =
    /zona\s*multimedia|mesh\s*(alpha|beta|gamma)|astranov\s*kitchen|demo\s*shop|fake\s*shop|synthetic/i;
  var LAPTOP_RE =
    /^(laptop|laptops|buy\s+(a\s+)?laptop|buy\s+laptops|order\s+(me\s+)?(a\s+)?laptop|get\s+(me\s+)?(a\s+)?laptop|find\s+(a\s+)?laptop|i\s+want\s+(a\s+)?laptop|need\s+(a\s+)?laptop)$/i;
  var SHOW_RHODES_RE =
    /^(show|go(?:\s+to)?|zoom(?:\s+to)?|take\s+me\s+to|look\s+at)\s+(the\s+)?(island\s+(of\s+)?)?(rhodes|rodos|ρόδος|ρόδο|ροδος|ροδοσ)\b/i;

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function openLiveCli() {
    try {
      var panel = document.getElementById('panel');
      if (panel) {
        panel.classList.add('sn-open', 'open');
        panel.classList.remove('collapsed', 'sn-quiet');
        panel.style.setProperty('grid-template-rows', '10px 44px auto auto', 'important');
      }
    } catch (_) {}
    try {
      var el = document.getElementById('cli-log');
      if (el) {
        el.style.setProperty('display', 'block', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', '26vh', 'important');
        el.style.setProperty('min-height', '0', 'important');
        el.style.setProperty('padding', '4px 10px 8px', 'important');
      }
    } catch (_) {}
  }

  /**
   * Live guest CLI echo — same path pizza-hunt uses (SNCli.log force)
   * plus an exact-text .cli-feed-item on #cli-log (SNCli.userFace strips
   * middots). Never restyle #stc-cmd-in or placeholders. #stc-cmd-in is
   * 0×0 on guest; only #cli-in / #cli-log are live.
   */
  function say(m, c) {
    var s = String(m == null ? '' : m).slice(0, 420);
    if (!s) return;
    try {
      if (G.SNCli && typeof SNCli.beginTurn === 'function' && typeof SNCli.inTurn === 'function') {
        if (!SNCli.inTurn()) SNCli.beginTurn();
      }
    } catch (_) {}
    try {
      if (G.SNCli && SNCli.log) SNCli.log(s, c || 'ok', true);
    } catch (_) {}
    paintLiveCli(s, c);
    try {
      if (G.SNCli && SNCli.preview) SNCli.preview(s.slice(0, 90));
    } catch (_) {}
    try {
      if (G.SNGlobe && typeof SNGlobe.setHud === 'function') SNGlobe.setHud(s.slice(0, 72));
    } catch (_) {}
    try {
      var out = document.getElementById('cli-out');
      if (out) out.textContent = s;
    } catch (_) {}
    try {
      var hud = document.getElementById('hud-line');
      if (hud) hud.textContent = s;
    } catch (_) {}
    try {
      if (G.SNHud && typeof SNHud.line === 'function') SNHud.line(s);
      else if (G.SNHud && typeof SNHud.set === 'function') SNHud.set(s);
    } catch (_) {}
    try {
      if (G.SNChromeCliAnswer && SNChromeCliAnswer.forcePaint) SNChromeCliAnswer.forcePaint();
    } catch (_) {}
  }

  function paintLiveCli(s, c) {
    s = String(s == null ? '' : s).slice(0, 420);
    if (!s) return;
    openLiveCli();
    try {
      var el = document.getElementById('cli-log');
      if (!el) return;
      var lastExact = null;
      try {
        var nodes = el.querySelectorAll('[data-sn-laptop-cli="1"]');
        lastExact = nodes.length ? nodes[nodes.length - 1] : null;
      } catch (__) {}
      if (lastExact && String(lastExact.textContent || '') === s) {
        try {
          el.scrollTop = el.scrollHeight;
        } catch (__) {}
        return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'cli-feed-item is-latest';
      wrap.setAttribute('data-sn-laptop-cli', '1');
      wrap.setAttribute('data-search', s);
      var line = document.createElement('div');
      var kind = c || 'ok';
      if (kind === 'dim') kind = 'progress';
      line.className = 'cli-line ' + kind;
      var body = document.createElement('div');
      body.className = 'cli-body';
      body.textContent = s;
      line.appendChild(body);
      wrap.appendChild(line);
      try {
        el.querySelectorAll('.cli-feed-item.is-latest').forEach(function (n) {
          n.classList.remove('is-latest');
        });
      } catch (__) {}
      el.appendChild(wrap);
      try {
        el.scrollTop = el.scrollHeight;
      } catch (__) {}
    } catch (_) {}
  }

  function log(m, c) {
    try {
      var s = String(m == null ? '' : m).slice(0, 420);
      if (/^Hunt failed/i.test(s) || /^Shop ·/.test(s)) {
        say(s, c || 'ok');
        return;
      }
      if (FAKE_OPS_RE.test(s)) return;
      if (POI_DUMP_RE.test(s) && globeOnly()) return;
      if (isCityRhodesLine(s) && !viewNear(RHODES.lat, RHODES.lng, SETTLE_DEG, SETTLE_DEG)) return;
      if (G.SNCli && SNCli.log) SNCli.log(s, c || 'ok', true);
    } catch (_) {}
  }

  function paintCliLine(s, c) {
    say(s, c || 'ok');
  }

  function preview(m) {
    try {
      if (G.SNCli && SNCli.preview) SNCli.preview(String(m).slice(0, 90));
    } catch (_) {}
    try {
      if (G.SNGlobe && typeof SNGlobe.setHud === 'function') {
        SNGlobe.setHud(String(m || '').slice(0, 72));
      }
    } catch (_) {}
  }

  function isGuest() {
    try {
      if (G.SNAuth && typeof SNAuth.isLoggedIn === 'function' && SNAuth.isLoggedIn()) return false;
      if (G.SNAuth && SNAuth.session && SNAuth.session.user) return false;
      if (G.SNAuth && SNAuth.user) return false;
    } catch (_) {}
    return true;
  }

  function snDebug() {
    try {
      return /(?:\?|&)sn-debug=1(?:&|$)/.test(String(location.search || ''));
    } catch (_) {
      return false;
    }
  }

  function globeOnly() {
    return hunting || huntSession;
  }

  function unwrapDeg(d) {
    d = Number(d);
    if (!isFinite(d)) return 0;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  function lngDelta(a, b) {
    return Math.abs(unwrapDeg(Number(a) - Number(b)));
  }

  function axisSign(d) {
    d = Number(d);
    if (!isFinite(d) || d === 0) return 0;
    return d > 0 ? 1 : -1;
  }

  function fmtSignedDeg(n) {
    n = Number(n);
    if (!isFinite(n)) return '?';
    return n.toFixed(3);
  }

  function fmtLiveLL(ll) {
    if (!ll || ll.lat == null || !isFinite(ll.lat)) return '?, ?';
    return fmtSignedDeg(ll.lat) + ', ' + fmtSignedDeg(ll.lng);
  }

  function inBox(lat, lng, box) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng) || !box) return false;
    var lngN = unwrapDeg(lng);
    return lat >= box.latMin && lat <= box.latMax && lngN >= box.lngMin && lngN <= box.lngMax;
  }

  function inRhodes(lat, lng) {
    return inBox(lat, lng, RHODES_BOX);
  }

  function placeOf(lat, lng) {
    var i;
    for (i = 0; i < PLACES.length; i++) {
      if (inBox(lat, lng, PLACES[i])) return PLACES[i].name;
    }
    return null;
  }

  function nearFake(lat, lng) {
    if (!isFinite(lat) || !isFinite(lng)) return true;
    for (var i = 0; i < FAKE_YOU.length; i++) {
      var f = FAKE_YOU[i];
      if (Math.abs(lat - f.lat) <= f.r && Math.abs(lng - f.lng) <= f.r) return f.name;
    }
    return null;
  }

  function isKalitheaCoord(lat, lng) {
    if (!isFinite(lat) || !isFinite(lng)) return false;
    return Math.abs(+lat - KALITHEA.lat) <= 0.0008 && Math.abs(+lng - KALITHEA.lng) <= 0.0008;
  }

  function isIpOrSoftSource(pos) {
    if (!pos) return true;
    if (pos.fallback) return true;
    if (pos.fromIp || pos.ip || pos.soft) return true;
    var src = String(pos.source || pos.from || '').toLowerCase();
    if (!src) return false;
    return /ip|soft|cache|leaflet|map|geocode|city|nominatim|photon|approx|look|verified/.test(src);
  }

  function gpsAtKalithea() {
    try {
      var p = G._snPhysPos;
      if (!p || p.lat == null || p.lng == null) return false;
      if (isIpOrSoftSource(p)) return false;
      var src = String(p.source || '').toLowerCase();
      var granted =
        p.fromGps === true || p.real === true || src === 'gps' || src === 'gps-watch';
      if (!granted) return false;
      return isKalitheaCoord(p.lat, p.lng);
    } catch (_) {
      return false;
    }
  }

  function hasSessionLocate() {
    try {
      if (!G._snLocatedThisSession) return false;
    } catch (_) {
      return false;
    }
    try {
      var p = G._snPhysPos;
      if (!p || p.lat == null || p.lng == null) return false;
      var lat = +p.lat;
      var lng = +p.lng;
      if (!isFinite(lat) || !isFinite(lng)) return false;
      if (nearFake(lat, lng)) return false;
      if (isIpOrSoftSource(p)) return false;
      var src = String(p.source || '').toLowerCase();
      var granted =
        p.fromGps === true ||
        p.real === true ||
        p.session === true ||
        src === 'gps' ||
        src === 'gps-watch';
      if (!granted) return false;
      return true;
    } catch (_) {}
    return false;
  }

  function markSessionLocate(lat, lng, extra) {
    extra = extra || {};
    if (extra.fallback || extra.fromIp || extra.ip || extra.soft) return;
    if (isIpOrSoftSource(extra)) return;
    if (nearFake(+lat, +lng)) return;
    try {
      G._snLocatedThisSession = true;
      var row = {
        lat: +lat,
        lng: +lng,
        fromGps: true,
        session: true,
        real: true,
        fallback: false,
        source: 'gps',
        ts: Date.now(),
        accuracy: extra.accuracy,
      };
      G._snPhysPos = row;
      G._snLastPos = row;
    } catch (_) {}
  }

  function scrubFakeYou() {
    try {
      var p = G._snPhysPos;
      if (!p) {
        G._snLocatedThisSession = false;
        return;
      }
      if (nearFake(+p.lat, +p.lng) || isIpOrSoftSource(p)) {
        G._snLocatedThisSession = false;
      }
    } catch (_) {}
  }

  function noMeAv() {
    if (!isGuest()) return;
    try {
      ['sn-me-av', 'sn-meav', 'sn-you-av', 'sn-guest-me'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
      });
    } catch (_) {}
    try {
      var nodes = document.querySelectorAll(
        '[data-sn-me-av], .sn-me-av, .sn-meav, .sn-you-pin, .sn-driver-en-route'
      );
      for (var i = 0; i < nodes.length; i++) {
        try {
          nodes[i].remove();
        } catch (_) {}
      }
    } catch (_) {}
  }

  function liveViewLatLng() {
    try {
      if (!G.SNGlobe || typeof SNGlobe.viewLatLng !== 'function') return null;
      var v = SNGlobe.viewLatLng();
      if (!v || v.lat == null || !isFinite(v.lat) || !isFinite(v.lng)) return null;
      return { lat: +v.lat, lng: +v.lng };
    } catch (_) {
      return null;
    }
  }

  function cameraLook() {
    var live = liveViewLatLng();
    if (live) return live;
    try {
      if (G.SNGlobe && typeof SNGlobe.focusPos === 'function') {
        var f = SNGlobe.focusPos();
        if (f && f.lat != null && isFinite(f.lat)) return { lat: +f.lat, lng: +f.lng };
      }
    } catch (_) {}
    try {
      if (G._snGlobeFocus && G._snGlobeFocus.lat != null) {
        return { lat: +G._snGlobeFocus.lat, lng: +G._snGlobeFocus.lng };
      }
    } catch (_) {}
    if (lastFly && lastFly.lat != null && Date.now() - lastFly.ts < 20000) {
      return { lat: lastFly.lat, lng: lastFly.lng };
    }
    return null;
  }

  function viewNear(targetLat, targetLng, tolLat, tolLng) {
    tolLat = tolLat != null ? tolLat : SETTLE_DEG;
    tolLng = tolLng != null ? tolLng : SETTLE_DEG;
    var ll = liveViewLatLng();
    if (!ll) return false;
    return Math.abs(+ll.lat - targetLat) < tolLat && lngDelta(ll.lng, targetLng) < tolLng;
  }

  function isGlobeReady() {
    try {
      if (G.SNGlobe && G.SNGlobe.ready === true) return true;
      if (G.SNGlobe && typeof SNGlobe.pulse === 'function') return true;
      if (G.SNGlobe && typeof SNGlobe.getEarth === 'function' && SNGlobe.getEarth()) return true;
    } catch (_) {}
    return false;
  }

  async function waitGlobeReady(ms) {
    var t0 = Date.now();
    var limit = typeof ms === 'number' && ms > 0 ? ms : 2400;
    try {
      if (G.SNGlobe && typeof SNGlobe.init === 'function') SNGlobe.init();
    } catch (_) {}
    while (Date.now() - t0 < limit) {
      if (isGlobeReady()) return true;
      await sleep(90);
    }
    return isGlobeReady();
  }

  /**
   * Origin for bbox hunt = the RENDERED camera (SNGlobe.viewLatLng), never
   * a stale focus label or lastFly target that the globe did not actually show.
   *   1) LIVE viewLatLng if it is a real number pair
   *   2) real YOU only if located THIS session (GPS grant) AND the live
   *      view has settled on that YOU (otherwise hunt the rendered view)
   * NEVER invent Kalithea / silent Rhodes / San Jose IP as you.
   * NEVER trust bare _snLastPos or a focus label that does not match viewLatLng.
   */
  function resolveOrigin() {
    scrubFakeYou();

    var live = liveViewLatLng();
    if (live) {
      return { lat: live.lat, lng: live.lng, source: 'camera' };
    }

    try {
      if (hasSessionLocate() && G._snPhysPos && G._snPhysPos.lat != null) {
        var plat = +G._snPhysPos.lat;
        var plng = +G._snPhysPos.lng;
        if (isFinite(plat) && isFinite(plng) && !nearFake(plat, plng) && !isIpOrSoftSource(G._snPhysPos)) {
          return { lat: plat, lng: plng, source: 'you' };
        }
      }
    } catch (_) {}
    return null;
  }

  function baseUrl() {
    return String((G.SN_CONFIG && SN_CONFIG.sbUrl) || G.SB_URL || '').replace(/\/$/, '');
  }

  function headers() {
    var cfg = G.SN_CONFIG || {};
    var h = {
      apikey: cfg.sbKey || G.SB_KEY || '',
      Authorization: 'Bearer ' + (cfg.sbKey || G.SB_KEY || ''),
      Accept: 'application/json',
    };
    try {
      if (G.SNAuth && SNAuth.session && SNAuth.session.access_token)
        h.Authorization = 'Bearer ' + SNAuth.session.access_token;
    } catch (_) {}
    return h;
  }

  function haversineKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 9999;
    var R = 6371;
    var dLat = ((b.lat - a.lat) * Math.PI) / 180;
    var dLng = ((b.lng - a.lng) * Math.PI) / 180;
    var s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function viewKmFrom(lat, lng) {
    var v = liveViewLatLng();
    if (!v) return 9999;
    return haversineKm(v, { lat: +lat, lng: +lng });
  }

  function viewReached(lat, lng) {
    return viewKmFrom(lat, lng) <= FLY_OK_KM;
  }

  function nearRhodesView() {
    var v = liveViewLatLng();
    if (!v) return false;
    if (inRhodes(v.lat, v.lng)) return true;
    if (haversineKm(v, RHODES_NEAR) <= FLY_OK_KM) return true;
    if (haversineKm(v, RHODES) <= FLY_OK_KM) return true;
    return Math.abs(v.lat - 36.4) <= 0.5 && lngDelta(v.lng, 28.1) <= 0.5;
  }

  function probeSignsFailed() {
    var sLat = lastProbe && lastProbe.sLat != null ? lastProbe.sLat : 0;
    var sLng = lastProbe && lastProbe.sLng != null ? lastProbe.sLng : 0;
    return sLat === 0 || sLng === 0;
  }

  /**
   * Fly failed ONLY when the rendered camera did not reach the target:
   * haversine > ~50 km, or probe-sign checks fail. Already-near Rhodes
   * (~36.4, 28.1) is success even if fly() / 0.15° settle lied.
   */
  function flyDidFail(targetLat, targetLng, label) {
    if (label === 'Rhodes' || inRhodes(+targetLat, +targetLng)) {
      if (nearRhodesView()) return false;
    }
    if (viewReached(targetLat, targetLng)) return false;
    return viewKmFrom(targetLat, targetLng) > FLY_OK_KM || probeSignsFailed();
  }

  function isBannedName(name) {
    var n = String(name || '');
    if (/Astranov\s*Kitchen/i.test(n)) return true;
    if (/Mesh\s*Alpha|Mesh\s*Beta|Mesh\s*Gamma/i.test(n)) return true;
    if (/Rai\s*Mesone|Rai\s*drone/i.test(n)) return true;
    if (/85[\s\-]?pt|DRIVER\s+EN\s+ROUTE|SEEKING\s+DRIVER/i.test(n)) return true;
    if (/Πλατεία|Πλατεια|πλατεία/i.test(n)) return true;
    if (/\bme-av\b|\bme_av\b|\bmeav\b/i.test(n)) return true;
    if (/^you$|^me$/i.test(n)) return true;
    if (SYNTHETIC_NAME_RE.test(n)) return true;
    return false;
  }

  function shopBlob(v) {
    return (
      String((v && v.category) || '') +
      ' ' +
      String((v && v.shopKind) || '') +
      ' ' +
      String((v && v.shop) || '') +
      ' ' +
      String((v && v.kind) || '') +
      ' ' +
      String((v && v.name) || '') +
      ' ' +
      (Array.isArray(v && v.tags) ? v.tags.join(' ') : String((v && v.tags) || ''))
    );
  }

  function isElectronicsShop(v) {
    if (!v) return false;
    if (isBannedName(v.name)) return false;
    if (String(v.id || '').indexOf('demo-') === 0 || String(v.id || '').indexOf('kitchen_') === 0)
      return false;
    var shop = String(v.shop || v.shopKind || v.category || '');
    if (TECH_SHOP_OSM.test(shop)) return true;
    var blob = shopBlob(v);
    if (FOOD_BLOCK.test(blob) && !TECH.test(blob)) return false;
    return TECH.test(blob);
  }

  function isFakeOrDbShop(v) {
    if (!v) return true;
    var src = String(v.source || '').toLowerCase();
    if (/supabase|vendor|commerce|db|demo|synthetic|seed|fake|nominatim/.test(src)) return true;
    var id = String(v.id || '');
    if (/^(demo-|kitchen_|db-|vend-|syn-)/i.test(id)) return true;
    if (isBannedName(v.name)) return true;
    if (SYNTHETIC_NAME_RE.test(String(v.name || ''))) return true;
    return false;
  }

  function isRealOsmElectronics(v) {
    if (!v) return false;
    if (isFakeOrDbShop(v)) return false;
    if (!isElectronicsShop(v)) return false;
    var src = String(v.source || '').toLowerCase();
    if (src && src !== 'overpass' && src !== 'osm') return false;
    if (v.osm_id == null && String(v.id || '').indexOf('osm-') !== 0) return false;
    if (v.lat == null || v.lng == null || !isFinite(+v.lat) || !isFinite(+v.lng)) return false;
    return true;
  }

  function hideLeaflet() {
    try {
      if (G.SNMap && typeof SNMap.close === 'function') SNMap.close();
    } catch (_) {}
    try {
      if (G.SNMap) {
        try {
          SNMap.active = false;
        } catch (_) {}
      }
    } catch (_) {}
    try {
      var nodes = document.querySelectorAll(
        '.leaflet-container, .leaflet-pane, .leaflet-marker-icon, .leaflet-marker-shadow, .leaflet-control-container, #sn-map, #sn-map-root, #map'
      );
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.style.setProperty('z-index', '-1', 'important');
      }
    } catch (_) {}
  }

  function globeCanvas() {
    try {
      var ren = G.SNGlobe && typeof SNGlobe.getRenderer === 'function' ? SNGlobe.getRenderer() : null;
      if (ren && ren.domElement) return ren.domElement;
    } catch (_) {}
    try {
      return document.querySelector('#globe canvas') || document.querySelector('#globe');
    } catch (_) {}
    return null;
  }

  function releasePointer(el) {
    if (!el) return;
    try {
      var opts = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true };
      try {
        el.dispatchEvent(new PointerEvent('pointerup', opts));
      } catch (_) {
        try {
          el.dispatchEvent(new Event('pointerup', { bubbles: true, cancelable: true }));
        } catch (__) {}
      }
      try {
        el.dispatchEvent(new PointerEvent('pointercancel', opts));
      } catch (_) {
        try {
          el.dispatchEvent(new Event('pointercancel', { bubbles: true, cancelable: true }));
        } catch (__) {}
      }
      try {
        if (typeof el.releasePointerCapture === 'function') el.releasePointerCapture(1);
      } catch (_) {}
      try {
        el.dispatchEvent(new Event('lostpointercapture', { bubbles: true }));
      } catch (_) {}
    } catch (_) {}
  }

  function dispatchCanvasPointerCancel() {
    try {
      releasePointer(globeCanvas());
    } catch (_) {}
  }

  function callStopMotion() {
    try {
      if (G.SNGlobe && typeof SNGlobe.stopMotion === 'function') SNGlobe.stopMotion();
    } catch (_) {}
  }

  function callZeroInertia() {
    try {
      if (G.SNGlobe && typeof SNGlobe.zeroInertia === 'function') SNGlobe.zeroInertia();
    } catch (_) {}
    try {
      var p = G.SNGlobe && typeof SNGlobe.getPhysics === 'function' ? SNGlobe.getPhysics() : null;
      if (p) {
        p.vTilt = 0;
        p.vSpin = 0;
        p.tTilt = null;
        p.tSpin = null;
      }
    } catch (_) {}
  }

  function unfreezeGlobe() {
    try {
      if (G.SNMap) {
        try {
          SNMap.active = false;
        } catch (_) {}
      }
    } catch (_) {}
    dispatchCanvasPointerCancel();
    callStopMotion();
    callZeroInertia();
    hideLeaflet();
  }

  function paintGlobe() {
    try {
      if (G.SNGlobe && typeof SNGlobe.paint === 'function') SNGlobe.paint();
    } catch (_) {}
  }

  function nodeIsSceneOrCam(n) {
    if (!n) return true;
    try {
      if (n.isScene || n.type === 'Scene') return true;
      if (n.isCamera || (n.type && String(n.type).indexOf('Camera') >= 0)) return true;
    } catch (_) {}
    return false;
  }

  function walkEarthChain() {
    var out = { nodes: [], names: [] };
    try {
      if (!G.SNGlobe || typeof SNGlobe.getEarth !== 'function') return out;
      var n = SNGlobe.getEarth();
      var hops = 0;
      while (n && hops < 14) {
        out.nodes.push(n);
        var nm = 'obj';
        try {
          if (n.name) nm = String(n.name);
          else if (n.type) nm = String(n.type);
          else if (n.isMesh) nm = 'Mesh';
          else if (n.isScene) nm = 'Scene';
          else if (n.isCamera) nm = 'Camera';
          else nm = 'Object3D';
        } catch (_) {}
        out.names.push(String(nm).slice(0, 28));
        try {
          n = n.parent;
        } catch (_) {
          n = null;
        }
        hops++;
      }
    } catch (_) {}
    return out;
  }

  function tiltSpinNodes() {
    var out = { earth: null, spin: null, tilt: null };
    try {
      if (!G.SNGlobe || typeof SNGlobe.getEarth !== 'function') return out;
      var earth = SNGlobe.getEarth();
      out.earth = earth;
      if (!earth) return out;
      var spin = earth.parent;
      var tilt = spin ? spin.parent : null;
      if (spin && !nodeIsSceneOrCam(spin)) out.spin = spin;
      if (tilt && !nodeIsSceneOrCam(tilt)) out.tilt = tilt;
      if (!out.tilt && typeof SNGlobe.getTilt === 'function') out.tilt = SNGlobe.getTilt();
      if (!out.spin && typeof SNGlobe.getSpin === 'function') out.spin = SNGlobe.getSpin();
    } catch (_) {}
    return out;
  }

  function paintTiltSpin(nodes) {
    nodes = nodes || tiltSpinNodes();
    try {
      if (nodes.tilt && nodes.tilt.updateMatrixWorld) nodes.tilt.updateMatrixWorld(true);
    } catch (_) {}
    try {
      if (nodes.spin && nodes.spin.updateMatrixWorld) nodes.spin.updateMatrixWorld(true);
    } catch (_) {}
    try {
      if (nodes.earth && nodes.earth.updateMatrixWorld) nodes.earth.updateMatrixWorld(true);
    } catch (_) {}
    try {
      var cam = typeof SNGlobe.getCamera === 'function' ? SNGlobe.getCamera() : null;
      if (cam && cam.updateMatrixWorld) cam.updateMatrixWorld(true);
    } catch (_) {}
    paintGlobe();
  }

  function addRot(node, axis, delta) {
    if (!node || !node.rotation) return false;
    try {
      node.rotation[axis] = (+node.rotation[axis] || 0) + delta;
      try {
        node.matrixAutoUpdate = true;
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  function readRot(node, axis) {
    try {
      return node && node.rotation ? +node.rotation[axis] : 0;
    } catch (_) {
      return 0;
    }
  }

  function writeRot(node, axis, val) {
    try {
      if (node && node.rotation) node.rotation[axis] = val;
    } catch (_) {}
  }

  function probeNodeAxis(node, axis, kind, nodes, earth) {
    if (!node || node === earth || !node.rotation) return 0;
    var v0 = liveViewLatLng();
    if (!v0) return 0;
    var old = readRot(node, axis);
    addRot(node, axis, 0.04);
    callZeroInertia();
    paintTiltSpin(nodes);
    var v1 = liveViewLatLng();
    writeRot(node, axis, old);
    callZeroInertia();
    paintTiltSpin(nodes);
    if (!v1) return 0;
    var d = 0;
    if (kind === 'lat') d = v1.lat - v0.lat;
    else d = unwrapDeg(v1.lng - v0.lng);
    return axisSign(d);
  }

  /**
   * Honest flyGlobeTo — same algorithm as #127 pizza hunt (probe-signs).
   * Attached as SNGlobe.flyGlobeTo only if that helper is not already defined.
   * Does NOT remap Kalithea → Rhodes unless the fly label is Rhodes.
   *
   * (1) stopMotion + zeroInertia + pointercancel first
   * (2) tilt = earth.parent.parent (lat, rotation.x) · spin = earth.parent (lng, rotation.y)
   *     NEVER Mesh.rotation
   * (3) PROBE SIGNS once per fly (0.04 rad, revert). If a probe returns 0, try the other node.
   * (4) LOOP gain=0.35, max 16. LIVE viewLatLng each step.
   *     success haversine ≤ ~50 km (or |Δlat|<0.15 AND unwrap|Δlng|<0.15)
   *     else tilt.x += sLat*dLat*PI/180*gain; spin.y += sLng*dLng*PI/180*gain
   * (5) Do NOT use x += -dLat blindly. Do NOT apply delta to Mesh or both parents.
   * (6) Success: zeroInertia, setFocus ONLY after LIVE settle (so the label matches the camera).
   *     Already-near Rhodes (~36.4, 28.1) is success. 36.440, 28.037 is success.
   * (7) Fail: lastFly=null, no hunt, no pins. Print Fly failed ONLY if
   *     haversine > ~50 km or probe-sign checks fail.
   */
  async function flyGlobeToLocal(lat, lng, label) {
    lat = +lat;
    lng = +lng;
    if (!isFinite(lat) || !isFinite(lng)) return false;

    if (isKalitheaCoord(lat, lng) && !gpsAtKalithea()) {
      if (label === 'Rhodes') {
        lat = RHODES.lat;
        lng = RHODES.lng;
      }
    }

    try {
      if (G.SNMap) {
        try {
          SNMap.active = false;
        } catch (_) {}
      }
    } catch (_) {}

    unfreezeGlobe();
    callStopMotion();
    callZeroInertia();
    dispatchCanvasPointerCancel();

    lastProbe = { sLat: 0, sLng: 0 };

    function markSuccessLocal() {
      callZeroInertia();
      lastFly = { lat: lat, lng: lng, ts: Date.now(), label: label || '' };
      try {
        if (!(isKalitheaCoord(lat, lng) && !gpsAtKalithea())) {
          G._snGlobeFocus = { lat: lat, lng: lng, label: label || '', t: Date.now() };
          if (G.SNGlobe && typeof SNGlobe.setFocus === 'function') SNGlobe.setFocus(lat, lng);
        }
      } catch (_) {}
      return true;
    }

    if (viewReached(lat, lng) || (label === 'Rhodes' && nearRhodesView())) {
      lastProbe = { sLat: 1, sLng: 1 };
      return markSuccessLocal();
    }

    var nodes = tiltSpinNodes();
    var tilt = nodes.tilt;
    var spin = nodes.spin;
    var earth = nodes.earth;
    var GAIN = 0.35;
    var maxSteps = 16;

    var latCtrl = { node: tilt, axis: 'x' };
    var lngCtrl = { node: spin, axis: 'y' };

    var sLat = probeNodeAxis(tilt, 'x', 'lat', nodes, earth);
    if (sLat === 0) {
      sLat = probeNodeAxis(spin, 'x', 'lat', nodes, earth);
      if (sLat !== 0) latCtrl = { node: spin, axis: 'x' };
    }
    var sLng = probeNodeAxis(spin, 'y', 'lng', nodes, earth);
    if (sLng === 0) {
      sLng = probeNodeAxis(tilt, 'y', 'lng', nodes, earth);
      if (sLng !== 0) lngCtrl = { node: tilt, axis: 'y' };
    }
    lastProbe = { sLat: sLat, sLng: sLng };

    function settled(v) {
      if (!v) return false;
      if (haversineKm(v, { lat: lat, lng: lng }) <= FLY_OK_KM) return true;
      if (label === 'Rhodes' && nearRhodesView()) return true;
      return Math.abs(v.lat - lat) < SETTLE_DEG && Math.abs(unwrapDeg(v.lng - lng)) < SETTLE_DEG;
    }
    function markSuccess() {
      return markSuccessLocal();
    }
    function nudgeSigned(dLat, dLng) {
      if (latCtrl.node && latCtrl.node !== earth && sLat) {
        addRot(latCtrl.node, latCtrl.axis, sLat * dLat * (Math.PI / 180) * GAIN);
      }
      if (lngCtrl.node && lngCtrl.node !== earth && sLng) {
        addRot(lngCtrl.node, lngCtrl.axis, sLng * dLng * (Math.PI / 180) * GAIN);
      }
    }

    var step = 0;
    while (step < maxSteps) {
      var v = liveViewLatLng();
      if (settled(v)) return markSuccess();
      if (v) {
        var dLat = lat - v.lat;
        var dLng = unwrapDeg(lng - v.lng);
        nudgeSigned(dLat, dLng);
        callZeroInertia();
        paintTiltSpin(nodes);
      } else {
        callZeroInertia();
        paintTiltSpin(nodes);
      }
      step++;
    }

    callZeroInertia();
    paintTiltSpin(nodes);
    var vEnd = liveViewLatLng();
    if (settled(vEnd) || viewReached(lat, lng) || (label === 'Rhodes' && nearRhodesView())) {
      return markSuccess();
    }
    lastFly = null;
    return false;
  }

  function attachFlyHelper() {
    try {
      if (!G.SNGlobe) return;
      if (typeof SNGlobe.flyGlobeTo === 'function') return;
      SNGlobe.flyGlobeTo = flyGlobeToLocal;
    } catch (_) {}
  }

  function getFly() {
    try {
      if (G.SNGlobe && typeof SNGlobe.flyGlobeTo === 'function') return SNGlobe.flyGlobeTo.bind(SNGlobe);
    } catch (_) {}
    return flyGlobeToLocal;
  }

  function flyFailDiag() {
    callZeroInertia();
    try {
      paintTiltSpin();
    } catch (_) {}
    var names = '?';
    var viewS = '?, ?';
    var sLat = lastProbe && lastProbe.sLat != null ? lastProbe.sLat : 0;
    var sLng = lastProbe && lastProbe.sLng != null ? lastProbe.sLng : 0;
    try {
      var walk = walkEarthChain();
      if (walk.names && walk.names.length) names = walk.names.join('>');
    } catch (_) {}
    try {
      viewS = fmtLiveLL(liveViewLatLng());
    } catch (_) {}
    return (
      'Fly failed - viewLatLng still ' +
      viewS +
      ' · sLat=' +
      sLat +
      ' sLng=' +
      sLng +
      ' · parents=' +
      names
    );
  }

  function cameraZ() {
    try {
      var cam = G.SNGlobe && typeof SNGlobe.getCamera === 'function' ? SNGlobe.getCamera() : null;
      if (cam && cam.position && isFinite(+cam.position.z)) return +cam.position.z;
    } catch (_) {}
    return 99;
  }

  function cityAltitudeZ() {
    try {
      if (G.SNGlobe && SNGlobe.TIERS && SNGlobe.TIERS.city && isFinite(+SNGlobe.TIERS.city.z)) {
        return +SNGlobe.TIERS.city.z;
      }
    } catch (_) {}
    return 1.16;
  }

  function dropToCityAltitude() {
    var cityZ = cityAltitudeZ();
    try {
      var phys = G.SNGlobe && typeof SNGlobe.getPhysics === 'function' ? SNGlobe.getPhysics() : null;
      if (phys) {
        phys.tZ = cityZ;
        phys.vZ = 0;
      }
    } catch (_) {}
    try {
      var cam = G.SNGlobe && typeof SNGlobe.getCamera === 'function' ? SNGlobe.getCamera() : null;
      if (cam && cam.position && +cam.position.z > cityZ + 0.04) {
        if (typeof SNGlobe.goToTier === 'function') SNGlobe.goToTier('city');
      }
    } catch (_) {}
    hideLeaflet();
    markConsume();
  }

  async function waitCityAltitude(ms) {
    var limit = typeof ms === 'number' && ms > 0 ? ms : 1100;
    var t0 = Date.now();
    var cityZ = cityAltitudeZ();
    while (Date.now() - t0 < limit) {
      if (cameraZ() <= cityZ + 0.14) return true;
      await sleep(50);
    }
    return cameraZ() <= 2.2;
  }

  /**
   * After a successful electronics hunt: settle lat/lng with the same
   * probe-sign flyGlobeTo as #127 pizza ("show rhodes" → ~36.41, 28.10)
   * then drop to CITY altitude so shops get distinct screen positions.
   * Never call this on an empty hunt (SA stays put).
   */
  async function flyToIslandCity(origin) {
    var lat = origin && isFinite(origin.lat) ? +origin.lat : RHODES.lat;
    var lng = origin && isFinite(origin.lng) ? +origin.lng : RHODES.lng;
    if (inRhodes(lat, lng)) {
      lat = RHODES.lat;
      lng = RHODES.lng;
    }
    attachFlyHelper();
    var fly = getFly();
    try {
      await fly(lat, lng, inRhodes(lat, lng) ? 'Rhodes' : '');
    } catch (_) {}
    dropToCityAltitude();
    await waitCityAltitude(1100);
    callZeroInertia();
    try {
      paintGlobe();
    } catch (_) {}
    try {
      var earth = G.SNGlobe && typeof SNGlobe.getEarth === 'function' ? SNGlobe.getEarth() : null;
      if (earth && earth.updateMatrixWorld) earth.updateMatrixWorld(true);
    } catch (_) {}
  }

  function isCityRhodesLine(m) {
    var s = String(m || '');
    if (!s) return false;
    if (/Earth\s*[·.]\s*CITY/i.test(s) && /rhodes|rodos|ρόδος/i.test(s)) return true;
    if (/\bCITY\s*[·.]\s*(Rhodes|Rodos)\b/i.test(s)) return true;
    if (/Earth\.CITY\.(Rhodes|Rodos)/i.test(s)) return true;
    return false;
  }

  function installMapGuard() {
    try {
      if (G.SNMap) {
        if (typeof SNMap.open === 'function' && !SNMap.__snLaptopOpenGuard) {
          var prevOpen = SNMap.open.bind(SNMap);
          SNMap.open = function () {
            if (globeOnly()) {
              hideLeaflet();
              return Promise.resolve(null);
            }
            return prevOpen.apply(SNMap, arguments);
          };
          SNMap.__snLaptopOpenGuard = true;
        }
        if (typeof SNMap.showLiveSat === 'function' && !SNMap.__snLaptopSatGuard) {
          var prevSat = SNMap.showLiveSat.bind(SNMap);
          SNMap.showLiveSat = function () {
            if (globeOnly()) {
              hideLeaflet();
              return Promise.resolve(null);
            }
            return prevSat.apply(SNMap, arguments);
          };
          SNMap.__snLaptopSatGuard = true;
        }
      }
    } catch (_) {}
    try {
      if (G.SNSearch && typeof SNSearch.crawl === 'function' && !SNSearch.__snLaptopCrawlGuard) {
        var prevCrawl = SNSearch.crawl.bind(SNSearch);
        SNSearch.crawl = function (q, opts) {
          if (globeOnly()) {
            return Promise.resolve({
              places: [],
              nearby: [],
              web: [],
              wiki: null,
              wikiHits: [],
              acted: ['laptop-hunt-block'],
            });
          }
          return prevCrawl(q, opts);
        };
        SNSearch.__snLaptopCrawlGuard = true;
      }
    } catch (_) {}
    try {
      if (G.SNCosmos && typeof SNCosmos.scan === 'function' && !SNCosmos.__snLaptopScanGuard) {
        var prevScan = SNCosmos.scan.bind(SNCosmos);
        SNCosmos.scan = function () {
          if (globeOnly()) return Promise.resolve({ lines: [], nearby: [], shops: 0 });
          return prevScan.apply(SNCosmos, arguments);
        };
        SNCosmos.__snLaptopScanGuard = true;
      }
    } catch (_) {}
    try {
      if (G.SNCli && typeof SNCli.log === 'function' && SNCli.__snLaptopLogGuard !== BUILD) {
        var prevLog = SNCli.log.bind(SNCli);
        SNCli.log = function (m, c, force) {
          var s = String(m || '');
          if (/^Hunt failed/i.test(s)) return prevLog(s, c || 'ok', true);
          if (FAKE_OPS_RE.test(s)) return;
          if (globeOnly() && POI_DUMP_RE.test(s)) return;
          if (isCityRhodesLine(s) && !viewNear(RHODES.lat, RHODES.lng, SETTLE_DEG, SETTLE_DEG)) return;
          return prevLog(m, c, force);
        };
        SNCli.__snLaptopLogGuard = BUILD;
      }
    } catch (_) {}
  }

  function beginGlobeHunt() {
    huntSession = true;
    hunting = true;
    huntFailed = false;
    G.__snLaptopHuntLive = true;
    attachFlyHelper();
    installMapGuard();
    unfreezeGlobe();
    noMeAv();
    suppressPoiUntil = Date.now() + 4000;
    markConsume();
  }

  function endGlobeHunt() {
    hunting = false;
    hideLeaflet();
    try {
      if (G.SNChromeCliAnswer && SNChromeCliAnswer.forcePaint) SNChromeCliAnswer.forcePaint();
    } catch (_) {}
  }

  function latLngToVecLocal(lat, lng, r) {
    r = r == null ? 1 : r;
    try {
      if (G.SNGlobe && typeof SNGlobe.latLngToVec === 'function') {
        var v = SNGlobe.latLngToVec(lat, lng, r);
        if (v) return v;
      }
    } catch (_) {}
    var phi = ((90 - lat) * Math.PI) / 180;
    var theta = ((lng + 180) * Math.PI) / 180;
    var x = -r * Math.sin(phi) * Math.cos(theta);
    var y = r * Math.cos(phi);
    var z = r * Math.sin(phi) * Math.sin(theta);
    try {
      var earth0 = G.SNGlobe && typeof SNGlobe.getEarth === 'function' ? SNGlobe.getEarth() : null;
      if (earth0 && earth0.position && earth0.position.clone) {
        return earth0.position.clone().set(x, y, z);
      }
    } catch (_) {}
    return { x: x, y: y, z: z };
  }

  function threeNS() {
    try {
      if (G.THREE) return G.THREE;
    } catch (_) {}
    try {
      if (typeof THREE !== 'undefined') return THREE;
    } catch (_) {}
    return null;
  }

  function stopOverlayRaf() {
    if (!overlayRaf) return;
    try {
      cancelAnimationFrame(overlayRaf);
    } catch (_) {}
    overlayRaf = 0;
  }

  function clearEarthPins() {
    var i;
    for (i = 0; i < earthPinMeshes.length; i++) {
      try {
        var m = earthPinMeshes[i];
        if (m && m.parent && typeof m.parent.remove === 'function') m.parent.remove(m);
      } catch (_) {}
    }
    earthPinMeshes = [];
  }

  function clearPinOverlayDom() {
    try {
      var el = document.getElementById('sn-laptop-pins');
      if (el) {
        el.innerHTML = '';
        el.style.display = 'none';
      }
    } catch (_) {}
    lastOverlaySpread = 0;
  }

  function clearLaptopPins() {
    lastPins = [];
    pinMeshes = [];
    lastWorldDistinct = false;
    lastOverlayPoints = [];
    stopOverlayRaf();
    clearEarthPins();
    clearPinOverlayDom();
    hideLeaflet();
  }

  function worldPosOf(mesh) {
    if (!mesh) return null;
    try {
      var T = threeNS();
      var v = T && T.Vector3 ? new T.Vector3() : null;
      if (mesh.getWorldPosition) {
        if (v) {
          mesh.getWorldPosition(v);
          return v;
        }
        var tmp = { x: 0, y: 0, z: 0 };
        mesh.getWorldPosition(tmp);
        return tmp;
      }
      if (mesh.position) return { x: +mesh.position.x, y: +mesh.position.y, z: +mesh.position.z };
    } catch (_) {}
    return null;
  }

  function maxWorldSpread(meshes) {
    if (!meshes || meshes.length < 2) return 0;
    var pts = [];
    var i, j;
    for (i = 0; i < meshes.length; i++) {
      var p = worldPosOf(meshes[i]);
      if (p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z)) pts.push(p);
    }
    if (pts.length < 2) return 0;
    var maxD = 0;
    for (i = 0; i < pts.length; i++) {
      for (j = i + 1; j < pts.length; j++) {
        var dx = pts[i].x - pts[j].x;
        var dy = pts[i].y - pts[j].y;
        var dz = pts[i].z - pts[j].z;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > maxD) maxD = d;
      }
    }
    return maxD;
  }

  /**
   * world = latLngToVec applied through earth.matrixWorld (or pivot);
   * ndc = world.project(camera); unique css left/top;
   * skip if behind globe (dot with camera < 0).
   */
  function projectPin(lat, lng) {
    try {
      if (!G.SNGlobe) return null;
      var earth = typeof SNGlobe.getEarth === 'function' ? SNGlobe.getEarth() : null;
      var pivot = typeof SNGlobe.getPivot === 'function' ? SNGlobe.getPivot() : null;
      var camera = typeof SNGlobe.getCamera === 'function' ? SNGlobe.getCamera() : null;
      var renderer = typeof SNGlobe.getRenderer === 'function' ? SNGlobe.getRenderer() : null;
      if (!camera) return null;
      var frame = earth || pivot;
      if (!frame) return null;
      try {
        if (frame.updateMatrixWorld) frame.updateMatrixWorld(true);
      } catch (_) {}
      var local = null;
      try {
        if (typeof SNGlobe.latLngToVec === 'function') local = SNGlobe.latLngToVec(lat, lng, 1.012);
      } catch (_) {}
      if (!local) local = latLngToVecLocal(lat, lng, 1.012);
      if (!local || local.x == null || !isFinite(local.x)) return null;
      var world = null;
      try {
        world = local.clone ? local.clone() : null;
        if (world && frame.matrixWorld && world.applyMatrix4) {
          world.applyMatrix4(frame.matrixWorld);
        } else if (frame.localToWorld && local.clone) {
          world = frame.localToWorld(local.clone());
        }
      } catch (_) {
        world = null;
      }
      if (!world || world.x == null) return null;
      var camPos = null;
      try {
        camPos = camera.position.clone ? camera.position.clone() : null;
        if (camera.getWorldPosition && camPos) camera.getWorldPosition(camPos);
      } catch (_) {
        camPos = camera.position;
      }
      if (!camPos) return null;
      var dot = world.x * camPos.x + world.y * camPos.y + world.z * camPos.z;
      if (dot < 0) return null;
      var ndc = null;
      try {
        ndc = world.clone ? world.clone() : world;
        if (typeof ndc.project !== 'function') return null;
        ndc.project(camera);
      } catch (_) {
        return null;
      }
      var canvas =
        (renderer && renderer.domElement) ||
        document.querySelector('#globe canvas') ||
        document.querySelector('canvas');
      if (!canvas) return null;
      var rect = canvas.getBoundingClientRect();
      var left = ((ndc.x + 1) / 2) * rect.width + rect.left;
      var top = ((-ndc.y + 1) / 2) * rect.height + rect.top;
      if (!isFinite(left) || !isFinite(top)) return null;
      return { left: left, top: top, ndc: ndc, world: world };
    } catch (_) {
      return null;
    }
  }

  function attachEarthPin(pin, color) {
    if (!pin || pin.lat == null || pin.lng == null) return null;
    try {
      if (!G.SNGlobe || typeof SNGlobe.getEarth !== 'function') return null;
      var earth = SNGlobe.getEarth();
      if (!earth || typeof earth.add !== 'function') return null;
      var vec = null;
      try {
        if (typeof SNGlobe.latLngToVec === 'function') vec = SNGlobe.latLngToVec(pin.lat, pin.lng, 1.012);
      } catch (_) {}
      if (!vec) vec = latLngToVecLocal(pin.lat, pin.lng, 1.012);
      if (!vec || vec.x == null) return null;
      var mesh = null;
      var T = threeNS();
      if (T && T.Mesh && T.SphereGeometry) {
        mesh = new T.Mesh(
          new T.SphereGeometry(0.01, 10, 10),
          new T.MeshBasicMaterial({
            color: color != null ? color : PIN_COLOR_A,
            depthTest: true,
            transparent: true,
            opacity: 0.95,
          })
        );
      } else if (pinMeshes[0] && typeof pinMeshes[0].clone === 'function') {
        mesh = pinMeshes[0].clone();
      }
      if (!mesh) return null;
      try {
        if (mesh.position.copy && vec.clone) mesh.position.copy(vec);
        else if (mesh.position.set) mesh.position.set(vec.x, vec.y, vec.z);
        else {
          mesh.position.x = vec.x;
          mesh.position.y = vec.y;
          mesh.position.z = vec.z;
        }
      } catch (_) {}
      try {
        mesh.userData = mesh.userData || {};
        mesh.userData.snVendor = true;
        mesh.userData.snLaptop = true;
        mesh.userData.snEarthPin = true;
        mesh.userData.snName = pin.name;
        mesh.userData.snKm = pin.km;
        mesh.userData.snLat = pin.lat;
        mesh.userData.snLng = pin.lng;
      } catch (_) {}
      earth.add(mesh);
      earthPinMeshes.push(mesh);
      return mesh;
    } catch (_) {
      return null;
    }
  }

  function cssSpreadOf(points) {
    if (!points || points.length < 2) return 0;
    var minL = 1e9;
    var maxL = -1e9;
    var minT = 1e9;
    var maxT = -1e9;
    var i;
    for (i = 0; i < points.length; i++) {
      var p = points[i];
      if (!p || !isFinite(p.left) || !isFinite(p.top)) continue;
      if (p.left < minL) minL = p.left;
      if (p.left > maxL) maxL = p.left;
      if (p.top < minT) minT = p.top;
      if (p.top > maxT) maxT = p.top;
    }
    if (minL === 1e9) return 0;
    return Math.hypot(maxL - minL, maxT - minT);
  }

  /**
   * #127 pin-spread: world lat/lng stay honest; if two projected points
   * sit less than 20px apart, walk the later pin out on a small golden
   * spiral so each overlay button is hittable.
   */
  function spiralSpread(points, minPx) {
    minPx = minPx || 20;
    if (!points || points.length < 2) return points;
    var GOLD = Math.PI * (3 - Math.sqrt(5));
    var i;
    for (i = 0; i < points.length; i++) {
      if (!points[i] || !isFinite(points[i].left)) continue;
      if (points[i].baseLeft == null) {
        points[i].baseLeft = points[i].left;
        points[i].baseTop = points[i].top;
      }
    }
    for (i = 0; i < points.length; i++) {
      if (!points[i] || !isFinite(points[i].left)) continue;
      var tries = 0;
      while (tries < 28) {
        var clash = false;
        var j;
        for (j = 0; j < i; j++) {
          if (!points[j] || !isFinite(points[j].left)) continue;
          var d = Math.hypot(points[i].left - points[j].left, points[i].top - points[j].top);
          if (d < minPx) {
            clash = true;
            break;
          }
        }
        if (!clash) break;
        tries++;
        var r = minPx * (0.65 + tries * 0.42);
        var a = tries * GOLD - Math.PI / 2;
        points[i].left = points[i].baseLeft + Math.cos(a) * r;
        points[i].top = points[i].baseTop + Math.sin(a) * r;
      }
    }
    return points;
  }

  function overlayZ() {
    var z = 220;
    try {
      var dock = document.getElementById('dock');
      var panel = document.getElementById('panel');
      var top = document.getElementById('sn-topchrome');
      function readZ(el) {
        if (!el) return 0;
        var v = parseInt(window.getComputedStyle(el).zIndex, 10);
        return isFinite(v) ? v : 0;
      }
      z = Math.max(z, readZ(dock) + 40, readZ(panel) + 40, readZ(top) + 40);
    } catch (_) {}
    return z;
  }

  function pinOverlayEl() {
    var el = document.getElementById('sn-laptop-pins');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sn-laptop-pins';
      el.setAttribute('data-sn-build', BUILD);
      try {
        (document.body || document.documentElement).appendChild(el);
      } catch (_) {}
    }
    el.setAttribute('data-sn-build', BUILD);
    var z = overlayZ();
    el.style.cssText =
      'position:fixed;inset:0;left:0;top:0;right:0;bottom:0;width:100%;height:100%;' +
      'overflow:visible;pointer-events:none;z-index:' +
      z +
      ';margin:0;padding:0;border:0;background:transparent;';
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('z-index', String(z), 'important');
    return el;
  }

  function hexColor(n, fallback) {
    try {
      var v = Number(n);
      if (!isFinite(v)) return fallback || '#7ee9ff';
      return '#' + ('000000' + (v >>> 0).toString(16)).slice(-6);
    } catch (_) {
      return fallback || '#7ee9ff';
    }
  }

  function starLabel(pin) {
    if (!pin) return '⭐';
    var r = pin.rating != null ? pin.rating : pin.stars;
    if (r != null && isFinite(+r) && +r > 0) return '⭐ ' + Number(r).toFixed(1);
    return '⭐';
  }

  function paintPinOverlay() {
    lastOverlaySpread = 0;
    lastWorldDistinct =
      maxWorldSpread(earthPinMeshes) > 1e-4 || maxWorldSpread(pinMeshes) > 1e-4;
    if (!lastPins.length) {
      lastOverlayPoints = [];
      clearPinOverlayDom();
      return;
    }
    var points = [];
    var i;
    for (i = 0; i < lastPins.length; i++) {
      var pin = lastPins[i];
      if (!pin || pin.lat == null) continue;
      var proj = projectPin(pin.lat, pin.lng);
      if (!proj) continue;
      points.push({
        left: proj.left,
        top: proj.top,
        baseLeft: proj.left,
        baseTop: proj.top,
        pin: pin,
        idx: i,
        color: i === 0 ? PIN_COLOR_A : PIN_COLOR_B,
      });
    }
    spiralSpread(points, 20);
    lastOverlayPoints = points;
    lastOverlaySpread = cssSpreadOf(points);
    var root = pinOverlayEl();
    if (!root) return;
    var z = overlayZ();
    root.style.display = points.length ? 'block' : 'none';
    root.style.setProperty('pointer-events', 'none', 'important');
    root.style.setProperty('z-index', String(z), 'important');

    var existing = root.querySelectorAll('button[data-sn-laptop-pin]');
    var lockRebuild = Date.now() < overlayLockUntil && existing.length > 0;
    if ((existing.length === points.length && points.length > 0) || lockRebuild) {
      var n = Math.min(existing.length, points.length);
      for (i = 0; i < n; i++) {
        var zBtn = z + 10 + i;
        existing[i].style.position = 'fixed';
        existing[i].style.left = (points[i].left - 14).toFixed(1) + 'px';
        existing[i].style.top = (points[i].top - 14).toFixed(1) + 'px';
        existing[i].style.display = 'block';
        existing[i].style.setProperty('pointer-events', 'auto', 'important');
        existing[i].style.setProperty('z-index', String(zBtn), 'important');
      }
      return;
    }

    root.innerHTML = '';
    for (i = 0; i < points.length; i++) {
      (function (pt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-sn-laptop-pin', String(pt.idx));
        var name = String(pt.pin.name || 'shop').slice(0, 36);
        btn.title = name;
        btn.setAttribute('aria-label', name);
        var zBtn = z + 10 + pt.idx;
        btn.style.cssText =
          'position:fixed;left:' +
          (pt.left - 14).toFixed(1) +
          'px;top:' +
          (pt.top - 14).toFixed(1) +
          'px;width:28px;height:28px;border-radius:50%;border:2px solid #fff;background:' +
          hexColor(pt.color, pt.idx === 0 ? '#7ee9ff' : '#b48eff') +
          ';pointer-events:auto;cursor:pointer;padding:0;margin:0;' +
          'box-shadow:0 0 12px rgba(126,233,255,.95);z-index:' +
          zBtn +
          ';';
        btn.style.setProperty('pointer-events', 'auto', 'important');
        btn.style.setProperty('z-index', String(zBtn), 'important');
        function onPinTap(ev) {
          overlayLockUntil = Date.now() + 800;
          consumePointer(ev);
          var row = lastPins[pt.idx] || pt.pin;
          announceVendor(row);
        }
        btn.addEventListener('pointerdown', onPinTap, true);
        btn.addEventListener('pointerup', onPinTap, true);
        btn.addEventListener('click', onPinTap, true);
        root.appendChild(btn);
      })(points[i]);
    }
  }

  function startOverlayRaf() {
    stopOverlayRaf();
    if (!lastPins.length) return;
    function tick() {
      overlayRaf = 0;
      if (!lastPins.length) return;
      paintPinOverlay();
      try {
        overlayRaf = requestAnimationFrame(tick);
      } catch (_) {}
    }
    tick();
  }

  function canLogPinsOnGlobe(nPainted) {
    if (!(nPainted > 0)) return false;
    lastWorldDistinct =
      maxWorldSpread(earthPinMeshes) > 1e-4 || maxWorldSpread(pinMeshes) > 1e-4;
    if (lastWorldDistinct) return true;
    if (lastOverlaySpread > 20) return true;
    if (lastPins.length === 1 && nPainted >= 1) return true;
    return false;
  }

  function markConsume() {
    suppressPoiUntil = Date.now() + 2500;
    try {
      if (G.SNGlobe) G.SNGlobe.consumeClick = true;
    } catch (_) {}
    try {
      if (typeof SNGlobe !== 'undefined' && SNGlobe) SNGlobe.consumeClick = true;
    } catch (_) {}
    try {
      if (G.SNGlobe && G.SNGlobe._g) G.SNGlobe._g.consumeClick = true;
    } catch (_) {}
    try {
      var r = G.SNGlobe && typeof SNGlobe.getRenderer === 'function' && SNGlobe.getRenderer();
      if (r && r.domElement) r.domElement.__snConsumeClick = true;
    } catch (_) {}
  }

  function consumePointer(ev) {
    try {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      }
    } catch (_) {}
    markConsume();
  }

  function installDiveGuard() {
    try {
      if (!G.SNGlobe || typeof SNGlobe.diveInAt !== 'function') return;
      if (SNGlobe.__snLaptopDiveGuard === BUILD) return;
      var prev = SNGlobe.diveInAt.bind(SNGlobe);
      SNGlobe.diveInAt = function (lat, lng) {
        try {
          if (G.SNGlobe && G.SNGlobe.consumeClick) return false;
          if (lastPins.length) return false;
        } catch (_) {}
        return prev(lat, lng);
      };
      SNGlobe.__snLaptopDiveGuard = BUILD;
    } catch (_) {}
    try {
      if (!G.SNGlobe || typeof SNGlobe.goToPlace !== 'function') return;
      if (SNGlobe.__snLaptopGoGuard === BUILD) return;
      var prevGo = SNGlobe.goToPlace.bind(SNGlobe);
      SNGlobe.goToPlace = function (lat, lng, opts) {
        try {
          if (G.SNGlobe && G.SNGlobe.consumeClick) return false;
          if (lastPins.length) return false;
        } catch (_) {}
        return prevGo(lat, lng, opts);
      };
      SNGlobe.__snLaptopGoGuard = BUILD;
    } catch (_) {}
  }

  /**
   * Paint pins — pulse + ALWAYS parent each pin onto getEarth() at that
   * shop's own latLngToVec(lat,lng,1.012) so they never pile at one point.
   * Overlay #sn-laptop-pins sits above the CLI with unique CSS positions.
   */
  function paintPins(rows, origin) {
    clearLaptopPins();
    if (!rows || !rows.length) return 0;
    var painted = 0;
    var ready = isGlobeReady();
    var slice = rows.slice(0, 24);

    slice.forEach(function (v, i) {
      if (!v || v.lat == null || v.lng == null) return;
      if (!isRealOsmElectronics(v)) return;
      var lat = +v.lat;
      var lng = +v.lng;
      if (!isFinite(lat) || !isFinite(lng)) return;
      var kmOrigin = origin ? haversineKm(origin, { lat: lat, lng: lng }) : null;
      var kmCap = origin && inRhodes(origin.lat, origin.lng) ? 80 : 18;
      if (kmOrigin != null && kmOrigin > kmCap) return;
      var label = String(v.name || 'shop').slice(0, 28);
      var color = i === 0 ? PIN_COLOR_A : PIN_COLOR_B;
      var pin = {
        id: v.id,
        name: v.name,
        lat: lat,
        lng: lng,
        km: kmOrigin,
        emoji: v.emoji || '💻',
        source: v.source || 'overpass',
        rating: v.rating != null ? v.rating : v.stars,
        osm_id: v.osm_id,
      };
      lastPins.push(pin);

      if (ready) {
        try {
          var mesh = SNGlobe.pulse(lat, lng, color, label, PIN_MS);
          if (mesh) {
            try {
              mesh.userData = mesh.userData || {};
              mesh.userData.snVendor = true;
              mesh.userData.snLaptop = true;
              mesh.userData.snName = v.name;
              mesh.userData.snKm = kmOrigin;
              mesh.userData.snLat = lat;
              mesh.userData.snLng = lng;
            } catch (_) {}
            pinMeshes.push(mesh);
            var isMesh = false;
            try {
              isMesh = !!(
                mesh.isMesh ||
                (mesh.type && String(mesh.type).indexOf('Mesh') >= 0) ||
                (mesh.geometry && mesh.material && !mesh.isSprite)
              );
            } catch (_) {
              isMesh = true;
            }
            if (isMesh) painted++;
          }
        } catch (_) {}
      }
      var earth = attachEarthPin(pin, color);
      if (earth) painted++;
    });

    try {
      if (G.SNGlobe && typeof SNGlobe.getEarth === 'function') {
        var earth0 = SNGlobe.getEarth();
        if (earth0 && earth0.updateMatrixWorld) earth0.updateMatrixWorld(true);
      }
    } catch (_) {}

    if (lastPins.length) {
      paintPinOverlay();
      startOverlayRaf();
    }

    lastWorldDistinct =
      maxWorldSpread(earthPinMeshes) > 1e-4 || maxWorldSpread(pinMeshes) > 1e-4;
    installPinTap();
    return lastPins.length ? Math.max(painted, lastPins.length) : 0;
  }

  function hitPinAtCss(cx, cy) {
    if (!lastPins.length) return null;
    var best = null;
    var bestD = PIN_HIT_PX;
    var i;
    var pts = lastOverlayPoints && lastOverlayPoints.length ? lastOverlayPoints : null;
    if (pts) {
      for (i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (!p || !isFinite(p.left)) continue;
        var d = Math.hypot(cx - p.left, cy - p.top);
        if (d <= bestD) {
          bestD = d;
          best = p.pin || (isFinite(p.idx) ? lastPins[p.idx] : null);
        }
      }
      return best;
    }
    for (i = 0; i < lastPins.length; i++) {
      var pin = lastPins[i];
      if (!pin || pin.lat == null) continue;
      var proj = projectPin(pin.lat, pin.lng);
      if (!proj) continue;
      var d2 = Math.hypot(cx - proj.left, cy - proj.top);
      if (d2 <= bestD) {
        bestD = d2;
        best = pin;
      }
    }
    return best;
  }

  function hitVendorAt(cx, cy) {
    if (!lastPins.length) return null;
    var cssHit = hitPinAtCss(cx, cy);
    if (cssHit) return cssHit;
    var hit = null;
    var best = 1e9;
    try {
      if (G.SNGlobe && typeof SNGlobe.pickLatLng === 'function') {
        var ll = SNGlobe.pickLatLng(cx, cy);
        if (ll && ll.lat != null) {
          lastPins.forEach(function (p) {
            var d = haversineKm(ll, p);
            if (d < best) {
              best = d;
              hit = p;
            }
          });
          var tol = 12;
          try {
            if (G.SNGlobe && typeof SNGlobe.currentTier === 'function') {
              var t = String(SNGlobe.currentTier() || '');
              if (t === 'city' || t === 'street' || t === 'local' || t === 'streets') tol = 12;
              else if (t === 'regional') tol = 18;
              else if (t === 'national') tol = 35;
            }
          } catch (_) {}
          if (best > tol) hit = null;
        }
      }
    } catch (_) {}
    return hit;
  }

  function shopLine(hit) {
    var name = String((hit && hit.name) || 'vendor').slice(0, 36);
    var km = null;
    if (hit && hit.km != null && isFinite(+hit.km)) km = Number(hit.km);
    if (km == null) {
      try {
        var cam = liveViewLatLng();
        if (cam && hit && hit.lat != null) km = haversineKm(cam, hit);
      } catch (_) {}
    }
    if (km == null || !isFinite(km)) km = 0;
    return 'Shop · ' + name + ' · ' + km.toFixed(1) + 'km · ⭐';
  }

  function announceVendor(hit) {
    if (!hit) return;
    if (Date.now() - announcedAt < 250) {
      markConsume();
      return;
    }
    announcedAt = Date.now();
    overlayLockUntil = Date.now() + 800;
    markConsume();
    hideLeaflet();
    say(shopLine(hit), 'ok');
  }

  function installOverlayTap() {
    if (overlayTapBound) return;
    overlayTapBound = true;
    function onDocPtr(ev) {
      if (!lastPins.length) return;
      var t = ev.target;
      try {
        if (t && t.closest && t.closest('#cli-in, #stc-cmd-in, input, textarea') && !(t.closest && t.closest('[data-sn-laptop-pin]'))) {
          return;
        }
      } catch (_) {}
      var hit = null;
      try {
        var btn = t && t.closest ? t.closest('[data-sn-laptop-pin]') : null;
        if (btn) {
          var idx = +btn.getAttribute('data-sn-laptop-pin');
          if (isFinite(idx) && lastPins[idx]) hit = lastPins[idx];
        }
      } catch (_) {}
      if (!hit) hit = hitPinAtCss(ev.clientX, ev.clientY);
      if (!hit) return;
      consumePointer(ev);
      announceVendor(hit);
    }
    document.addEventListener('pointerdown', onDocPtr, true);
    document.addEventListener('pointerup', onDocPtr, true);
    document.addEventListener('click', onDocPtr, true);
  }

  function installPinTap() {
    installDiveGuard();
    installOverlayTap();
    try {
      if (clickUnsub) {
        try {
          clickUnsub();
        } catch (_) {}
        clickUnsub = null;
      }
      if (G.SNGlobe && typeof SNGlobe.onClick === 'function') {
        clickUnsub = SNGlobe.onClick(function (cx, cy) {
          if (!lastPins.length) return false;
          var hit = hitVendorAt(cx, cy);
          if (hit) {
            markConsume();
            announceVendor(hit);
            return true;
          }
          if (Date.now() < suppressPoiUntil) {
            markConsume();
            return true;
          }
          return false;
        });
      }
    } catch (_) {}

    try {
      if (canvasTapBound) return;
      var canvas = globeCanvas();
      if (!canvas) return;
      canvasTapBound = true;
      var downX = 0;
      var downY = 0;
      var downT = 0;
      canvas.addEventListener(
        'pointerdown',
        function (e) {
          downX = e.clientX;
          downY = e.clientY;
          downT = performance.now();
          if (!lastPins.length) return;
          var hit = hitVendorAt(e.clientX, e.clientY);
          if (!hit) return;
          markConsume();
        },
        true
      );
      canvas.addEventListener(
        'pointerup',
        function (e) {
          if (!lastPins.length) return;
          if (performance.now() - downT > 320) return;
          if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10) return;
          var hit = hitVendorAt(e.clientX, e.clientY);
          if (!hit) return;
          consumePointer(e);
          announceVendor(hit);
        },
        true
      );
      canvas.addEventListener(
        'click',
        function (e) {
          if (!lastPins.length) return;
          var hit = hitVendorAt(e.clientX, e.clientY);
          if (!hit) return;
          consumePointer(e);
          announceVendor(hit);
        },
        true
      );
    } catch (_) {}
  }

  function constrainToPlace(origin, rows) {
    rows = rows || [];
    var place = origin ? placeOf(origin.lat, origin.lng) : null;
    var kmCap = place === 'Rhodes' ? 80 : HUNT_KM;
    return rows.filter(function (v) {
      if (!v || v.lat == null || v.lng == null) return false;
      if (place === 'Rhodes') {
        return inRhodes(v.lat, v.lng);
      }
      if (haversineKm(origin, { lat: +v.lat, lng: +v.lng }) > kmCap) return false;
      var shopPlace = placeOf(v.lat, v.lng);
      if (place && shopPlace && shopPlace !== place) return false;
      return true;
    });
  }

  function dedupeShops(rows) {
    var seen = {};
    var out = [];
    var i;
    for (i = 0; i < (rows || []).length; i++) {
      var v = rows[i];
      if (!v || v.lat == null || v.lng == null) continue;
      var lat = +v.lat;
      var lng = +v.lng;
      if (!isFinite(lat) || !isFinite(lng)) continue;
      var key =
        String(v.name || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .slice(0, 40) +
        '@' +
        lat.toFixed(4) +
        ',' +
        lng.toFixed(4);
      if (seen[key]) continue;
      var j;
      var tooClose = false;
      for (j = 0; j < out.length; j++) {
        if (haversineKm(out[j], { lat: lat, lng: lng }) < 0.04) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      seen[key] = 1;
      out.push(v);
    }
    return out;
  }

  function osmElToShop(e) {
    if (!e) return null;
    var lat = e.lat != null ? +e.lat : e.center && e.center.lat != null ? +e.center.lat : null;
    var lng = e.lon != null ? +e.lon : e.center && e.center.lon != null ? +e.center.lon : null;
    if (!isFinite(lat) || !isFinite(lng)) return null;
    var tags = e.tags || {};
    var name = tags.name || tags.brand || tags['name:en'] || tags['name:el'] || '';
    if (!name) {
      if (tags.shop) name = String(tags.shop).replace(/_/g, ' ');
      else if (tags.amenity) name = String(tags.amenity).replace(/_/g, ' ');
      else return null;
    }
    if (isBannedName(name)) return null;
    var shop = String(tags.shop || tags.amenity || '');
    var row = {
      id: 'osm-' + (e.type || 'n') + '-' + e.id,
      osm_id: e.id,
      name: name,
      lat: lat,
      lng: lng,
      category: shop || 'electronics',
      shop: shop,
      shopKind: shop,
      tags: [shop, tags.brand, tags.operator].filter(Boolean),
      real: true,
      source: 'overpass',
      emoji: '💻',
      rating: tags.stars != null ? +tags.stars : null,
    };
    if (!isElectronicsShop(row)) return null;
    if (!isRealOsmElectronics(row)) return null;
    return row;
  }

  function overpassBboxQL(box) {
    var s = Number(box.latMin).toFixed(4);
    var w = Number(box.lngMin).toFixed(4);
    var n = Number(box.latMax).toFixed(4);
    var e = Number(box.lngMax).toFixed(4);
    var bb = '(' + s + ',' + w + ',' + n + ',' + e + ')';
    var parts = [];
    var i;
    for (i = 0; i < OSM_SHOP_TAGS.length; i++) {
      var tag = OSM_SHOP_TAGS[i];
      parts.push('node["shop"="' + tag + '"]' + bb + ';');
      parts.push('way["shop"="' + tag + '"]' + bb + ';');
    }
    parts.push('node["amenity"="internet_cafe"]' + bb + ';');
    parts.push('way["amenity"="internet_cafe"]' + bb + ';');
    return '[out:json][timeout:' + OVERPASS_TIMEOUT_S + '];(' + parts.join('') + ');out center 80;';
  }

  function localBoxAround(lat, lng, radiusKm) {
    var rKm = Number(radiusKm) > 0 ? Number(radiusKm) : 20;
    var dLat = rKm / 111;
    var dLng = rKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    return {
      latMin: lat - dLat,
      latMax: lat + dLat,
      lngMin: lng - dLng,
      lngMax: lng + dLng,
    };
  }

  function boxesForOrigin(origin) {
    if (!origin || !isFinite(origin.lat) || !isFinite(origin.lng)) return [];
    if (inRhodes(origin.lat, origin.lng)) {
      return [RHODES_VIEW_BOX, RHODES_BOX];
    }
    return [localBoxAround(origin.lat, origin.lng, 20)];
  }

  async function fetchOverpassOnce(url, body, ms) {
    async function one(method) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var to = setTimeout(function () {
        try {
          if (ctrl) ctrl.abort();
        } catch (_) {}
      }, ms);
      try {
        var opts = {
          method: method,
          headers: { Accept: 'application/json' },
          signal: ctrl ? ctrl.signal : undefined,
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
        };
        var href = url;
        if (method === 'POST') {
          opts.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
          opts.body = 'data=' + encodeURIComponent(body);
        } else {
          href = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'data=' + encodeURIComponent(body);
        }
        var res = await fetch(href, opts);
        return res || null;
      } catch (_) {
        return null;
      } finally {
        try {
          clearTimeout(to);
        } catch (_) {}
      }
    }
    var posted = await one('POST');
    if (posted && posted.ok) return posted;
    if (posted) return posted;
    return one('GET');
  }

  function parseOverpassElements(els) {
    var rows = [];
    var k;
    for (k = 0; k < (els || []).length; k++) {
      var shop = osmElToShop(els[k]);
      if (shop) rows.push(shop);
    }
    return rows;
  }

  async function queryOverpassBbox(box) {
    if (!box) return [];
    var body = overpassBboxQL(box);
    var lastErr = null;
    var sawOk = false;
    var i;
    for (i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
      try {
        var res = await fetchOverpassOnce(OVERPASS_ENDPOINTS[i], body, OVERPASS_FETCH_MS);
        if (!res || !res.ok) {
          lastErr = new Error('overpass HTTP ' + (res ? res.status : 'fail'));
          continue;
        }
        var j = await res.json();
        sawOk = true;
        var rows = parseOverpassElements((j && j.elements) || []);
        if (rows.length) return rows;
      } catch (e) {
        lastErr = e;
      }
    }
    if (sawOk) return [];
    throw lastErr || new Error('overpass failed');
  }

  async function queryOverpass(lat, lng, radiusKm) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return [];
    var boxes = inRhodes(lat, lng)
      ? [RHODES_VIEW_BOX, RHODES_BOX]
      : [localBoxAround(lat, lng, Number(radiusKm) > 0 ? Number(radiusKm) : 20)];
    var lastErr = null;
    var i;
    for (i = 0; i < boxes.length; i++) {
      try {
        var rows = await queryOverpassBbox(boxes[i]);
        if (rows && rows.length) return rows;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    return [];
  }

  async function queryVendorsBbox(lat, lng, radiusKm) {
    return [];
  }

  function listInCli(rows, origin) {
    if (!rows || !rows.length) {
      paintCliLine('Hunt failed', 'ok');
      return;
    }
    var scored = rows
      .map(function (v) {
        var km = origin ? haversineKm(origin, { lat: +v.lat, lng: +v.lng }) : 99;
        return { v: v, km: km };
      })
      .filter(function (s) {
        var cap = origin && inRhodes(origin.lat, origin.lng) ? 80 : 18;
        return s.km <= cap;
      })
      .sort(function (a, b) {
        return a.km - b.km;
      })
      .slice(0, 10);
    if (!scored.length) {
      paintCliLine('Hunt failed', 'ok');
      return;
    }
    var place = origin ? placeOf(origin.lat, origin.lng) : null;
    log(
      'Laptop hunt · ' +
        scored.length +
        ' shops' +
        (place ? ' · ' + place : '') +
        ' · OSM · on globe',
      'ok'
    );
    scored.forEach(function (s, i) {
      var name = String(s.v.name || 'shop').slice(0, 32);
      var kmS = s.km < 99 ? s.km.toFixed(1) + 'km' : '—';
      log(i + 1 + ' · ' + name + ' · ' + kmS + ' · ⭐', 'ok');
    });
    log('Tap a pin on the globe · Google only at pay / HOLD ⭐', 'dim');
    preview(scored[0].v.name + ' · ' + scored[0].km.toFixed(1) + 'km · ⭐');
  }

  async function fetchNear(origin) {
    var rows = [];
    try {
      rows = await queryOverpass(origin.lat, origin.lng, 20);
    } catch (e) {
      throw new Error('map search failed · ' + (e && e.message ? e.message : 'overpass'));
    }
    rows = constrainToPlace(origin, rows || []).filter(isRealOsmElectronics);
    rows = dedupeShops(rows);
    return rows;
  }

  function failHunt(msg) {
    huntFailed = true;
    clearLaptopPins();
    say('Hunt failed', 'ok');
    if (msg && String(msg) !== 'Hunt failed' && !/map search failed/i.test(String(msg))) {
      try {
        if (G.SNCli && SNCli.preview) SNCli.preview(String(msg).slice(0, 90));
      } catch (_) {}
    }
  }

  async function huntAt(origin, raw) {
    if (!origin) {
      failHunt('Hunt failed · no origin · type Locate once');
      askedLocate = true;
      return true;
    }

    if (origin.source === 'you' && nearFake(origin.lat, origin.lng)) {
      var cam2 = liveViewLatLng();
      if (cam2) origin = { lat: cam2.lat, lng: cam2.lng, source: 'camera' };
      else {
        failHunt('Hunt failed · no origin · type Locate once');
        return true;
      }
    }

    var liveNow = liveViewLatLng();
    if (liveNow) {
      origin = {
        lat: liveNow.lat,
        lng: liveNow.lng,
        source: origin && origin.source === 'you' ? 'you' : 'camera',
      };
    }

    log(
      'Origin · ' + origin.source + ' · ' + origin.lat.toFixed(3) + ', ' + origin.lng.toFixed(3),
      'dim'
    );

    var use = [];
    try {
      use = await fetchNear(origin);
    } catch (e) {
      failHunt('Hunt failed · ' + (e && e.message ? e.message : e));
      return true;
    }

    if (!use.length) {
      failHunt('Hunt failed');
      askedLocate = !(origin.source === 'you' && hasSessionLocate());
      return true;
    }

    await waitGlobeReady(1800);
    await flyToIslandCity(origin);
    var nPainted = paintPins(use, origin);
    listInCli(use, origin);

    if (nPainted <= 0) {
      await sleep(400);
      await waitGlobeReady(1200);
      nPainted = paintPins(use, origin);
    }
    if (nPainted > 0 && !canLogPinsOnGlobe(nPainted)) {
      paintPinOverlay();
      startOverlayRaf();
    }
    if (canLogPinsOnGlobe(nPainted)) {
      log('Pins on globe · ' + lastPins.length + ' shops · tap a pin', 'ok');
    } else if (nPainted > 0) {
      log('Globe pulse unavailable · list only (pins stacked)', 'dim');
    } else {
      failHunt('Hunt failed · globe pulse unavailable');
      return true;
    }

    if (isGuest() && raw) {
      log('Guest browse · sign in only when you HOLD ⭐ / pay', 'dim');
    }
    noMeAv();
    return true;
  }

  function blockAuthModalOnLaptop() {
    try {
      var modal = document.getElementById('sn-auth-modal');
      if (modal) {
        modal.style.setProperty('display', 'none', 'important');
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('open', 'show', 'sn-open');
      }
    } catch (_) {}
    try {
      if (G.SNAuth && typeof SNAuth.openModal === 'function' && !SNAuth.__snLaptopGuard) {
        var prev = SNAuth.openModal.bind(SNAuth);
        SNAuth.openModal = function (msg) {
          var m = String(msg || '');
          if (
            isGuest() &&
            !snDebug() &&
            !/pay|HOLD\s*⭐|hold\s*star|checkout|wallet|balance/i.test(m)
          ) {
            log('Browse free · Google only at pay / HOLD ⭐', 'dim');
            return;
          }
          return prev(msg);
        };
        SNAuth.__snLaptopGuard = true;
      }
    } catch (_) {}
  }

  /**
   * `rhodes` / `show rhodes`: MUST settle the visible Earth to 36.44, 28.22
   * via the same probe-sign flyGlobeTo as #127. Do NOT setFocus before the
   * LIVE view verifies — that was FAIL 1 (label said Rhodes, camera stayed SA).
   */
  async function showRhodes(raw) {
    beginGlobeHunt();
    blockAuthModalOnLaptop();
    noMeAv();
    try {
      if (G.SNChromeCliAnswer && SNChromeCliAnswer.forcePaint) SNChromeCliAnswer.forcePaint();
    } catch (_) {}
    try {
      var a = document.getElementById('cli-in');
      if (a) a.value = '';
      var b = document.getElementById('stc-cmd-in');
      if (b) b.value = '';
    } catch (_) {}

    log(String(raw || 'rhodes').slice(0, 80), 'cmd');

    try {
      var ready = await waitGlobeReady(2200);
      if (!ready) {
        log(flyFailDiag(), 'dim');
        preview('Fly failed');
        lastFly = null;
        return true;
      }
      attachFlyHelper();
      var already = nearRhodesView();
      if (!already) {
        var fly = getFly();
        try {
          await fly(RHODES.lat, RHODES.lng, 'Rhodes');
        } catch (_) {}
      }
      try {
        callZeroInertia();
        paintGlobe();
      } catch (_) {}
      if (flyDidFail(RHODES.lat, RHODES.lng, 'Rhodes')) {
        log(flyFailDiag(), 'dim');
        preview('Fly failed');
        lastFly = null;
        return true;
      }

      lastFly = { lat: RHODES.lat, lng: RHODES.lng, ts: Date.now(), label: 'Rhodes' };
      preferCameraUntil = Date.now() + 180000;
      log('Rhodes. globe camera. 36.44, 28.22', 'ok');
      preview('Rhodes · globe');
    } catch (e) {
      log(flyFailDiag(), 'dim');
      preview('Fly failed');
      lastFly = null;
    } finally {
      endGlobeHunt();
    }
    return true;
  }

  async function huntLaptop(raw) {
    if (hunting) return true;
    beginGlobeHunt();
    blockAuthModalOnLaptop();
    noMeAv();
    try {
      if (G.SNChromeCliAnswer && SNChromeCliAnswer.forcePaint) SNChromeCliAnswer.forcePaint();
    } catch (_) {}
    try {
      var a = document.getElementById('cli-in');
      if (a) a.value = '';
      var b = document.getElementById('stc-cmd-in');
      if (b) b.value = '';
    } catch (_) {}

    log(String(raw || 'laptop').slice(0, 80), 'cmd');

    try {
      var ready = await waitGlobeReady(2200);
      if (!ready) {
        failHunt('Hunt failed · globe not ready');
        return true;
      }

      attachFlyHelper();

      // Hunt the RENDERED globe. Never a stale focus / lastFly / GPS pin
      // that the camera is not actually showing.
      var cam = liveViewLatLng();
      var origin = cam ? { lat: cam.lat, lng: cam.lng, source: 'camera' } : null;

      if (!origin && hasSessionLocate() && G._snPhysPos && G._snPhysPos.lat != null) {
        var youLat = +G._snPhysPos.lat;
        var youLng = +G._snPhysPos.lng;
        if (isFinite(youLat) && isFinite(youLng) && !nearFake(youLat, youLng) && !isIpOrSoftSource(G._snPhysPos)) {
          var fly = getFly();
          try {
            await fly(youLat, youLng, 'You');
          } catch (_) {}
          try {
            callZeroInertia();
            paintGlobe();
          } catch (_) {}
          if (flyDidFail(youLat, youLng, 'You')) {
            log('Fly failed', 'err');
            log(flyFailDiag(), 'dim');
            preview('Fly failed');
            clearLaptopPins();
            huntFailed = true;
            return true;
          }
          var afterYou = liveViewLatLng();
          origin = afterYou
            ? { lat: afterYou.lat, lng: afterYou.lng, source: 'you' }
            : { lat: youLat, lng: youLng, source: 'you' };
        }
      }

      if (!origin) {
        failHunt('Hunt failed · no origin · type Locate once');
        return true;
      }

      await huntAt(origin, raw);
    } catch (e) {
      failHunt('Hunt failed · ' + (e && e.message ? e.message : e));
    } finally {
      endGlobeHunt();
    }
    return true;
  }

  function isLaptopLine(line) {
    var s = String(line || '').trim();
    if (!s) return false;
    if (/pizza|nairobi|kenya|\bafrica\b|kalithea|kallithea|rhodes|rodos|ρόδο|webrtc|\bcall\b|hangup/i.test(s))
      return false;
    if (/\?$/.test(s)) return false;
    if (/^(what|why|how|who|when|explain|tell me|define|is |are )\b/i.test(s)) return false;
    var low = s.toLowerCase().replace(/\s+/g, ' ');
    if (LAPTOP_RE.test(low)) return true;
    if (/^(laptop|laptops)$/.test(low)) return true;
    if (/^buy (a )?laptops?$/.test(low)) return true;
    return false;
  }

  function isShowRhodes(line) {
    var s = String(line || '').trim();
    if (!s) return false;
    if (/pizza|nairobi|kenya|kalithea|kallithea|webrtc|\bcall\b|hangup/i.test(s)) return false;
    if (/^fly\b/i.test(s)) return false;
    if (SHOW_RHODES_RE.test(s)) return true;
    if (/^(show\s+)?(rhodes|rodos|ρόδος|ρόδο)$/i.test(s)) return true;
    return false;
  }

  function isBareLocate(line) {
    var s = String(line || '').trim();
    if (!s) return false;
    if (/^(locate|gps|where am i|find me)$/i.test(s)) return true;
    return false;
  }

  function isPayHold(line) {
    var s = String(line || '')
      .trim()
      .toLowerCase();
    return /^(pay|hold\s*⭐|hold\s*star|checkout|confirm\s+order|buy\s+now)\b/.test(s);
  }

  async function grantLocateGps() {
    hideLeaflet();
    log('Locate · GPS grant only · globe stays', 'dim');
    preview('GPS…');
    if (!navigator.geolocation) {
      log('No geolocation · spin globe over a town then laptop', 'dim');
      return;
    }
    var pos = await new Promise(function (resolve) {
      var done = false;
      var to = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(null);
      }, 12000);
      try {
        navigator.geolocation.getCurrentPosition(
          function (p) {
            if (done) return;
            done = true;
            clearTimeout(to);
            resolve(p);
          },
          function () {
            if (done) return;
            done = true;
            clearTimeout(to);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } catch (_) {
        clearTimeout(to);
        resolve(null);
      }
    });
    if (pos && pos.coords && isFinite(pos.coords.latitude)) {
      var lat = +pos.coords.latitude;
      var lng = +pos.coords.longitude;
      if (nearFake(lat, lng)) {
        log('Locate rejected fake pin · spin globe then laptop', 'dim');
        return;
      }
      markSessionLocate(lat, lng, {
        source: 'gps',
        real: true,
        fallback: false,
        fromGps: true,
        accuracy: pos.coords.accuracy,
      });
      log('Located · ' + lat.toFixed(3) + ', ' + lng.toFixed(3) + ' · type laptop again', 'ok');
      var fly = getFly();
      try {
        await fly(lat, lng, 'You');
      } catch (_) {}
      try {
        callZeroInertia();
        paintGlobe();
      } catch (_) {}
      if (flyDidFail(lat, lng, 'You')) {
        log('Fly failed', 'err');
        log(flyFailDiag(), 'dim');
      }
    } else {
      log('Locate failed · grant GPS or spin globe over a town then laptop', 'dim');
    }
  }

  function patchCliRun() {
    try {
      if (!G.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli.run === cliWrap && SNCli.__snGuestLaptopHuntBuild === BUILD) return;
      var prev = SNCli.run.bind(SNCli);
      cliWrap = function (raw) {
        try {
          var s = String(raw || '').trim();
          if (isBareLocate(s) && globeOnly()) {
            void grantLocateGps();
            return Promise.resolve(true);
          }
          if (isShowRhodes(s)) {
            void showRhodes(s);
            return Promise.resolve(true);
          }
          if (isLaptopLine(s)) {
            void huntLaptop(s);
            return Promise.resolve(true);
          }
          if (isGuest() && isPayHold(s) && lastPins.length) {
            try {
              if (G.SNAuth && typeof SNAuth.openModal === 'function') {
                SNAuth.openModal('Sign in with Google to HOLD ⭐ / pay');
              }
            } catch (_) {}
            log('HOLD ⭐ · Sign in with Google to pay', 'ok');
            return Promise.resolve(true);
          }
        } catch (_) {}
        return prev(raw);
      };
      SNCli.run = cliWrap;
      SNCli.__snGuestLaptopHuntBuild = BUILD;
      SNCli.__snGuestLaptopHunt = 1;
    } catch (_) {}
  }

  function bindInputs() {
    function capture(ev, el) {
      var v = String((el && el.value) || '').trim();
      if (!v) return false;
      var handled = false;
      if (isShowRhodes(v)) {
        handled = true;
        void showRhodes(v);
      } else if (isLaptopLine(v)) {
        handled = true;
        void huntLaptop(v);
      } else if (isBareLocate(v) && globeOnly()) {
        handled = true;
        void grantLocateGps();
      }
      if (!handled) return false;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      if (el) el.value = '';
      return true;
    }
    try {
      var form = document.getElementById('cli-form') || document.querySelector('#panel form');
      var input = document.getElementById('cli-in');
      if (form && input && !input._snLaptopHuntOsm) {
        input._snLaptopHuntOsm = 1;
        form.addEventListener(
          'submit',
          function (ev) {
            capture(ev, input);
          },
          true
        );
        input.addEventListener(
          'keydown',
          function (ev) {
            if (ev.key === 'Enter') capture(ev, input);
          },
          true
        );
      }
      var topIn = document.getElementById('stc-cmd-in');
      if (topIn && !topIn._snLaptopHuntOsm) {
        topIn._snLaptopHuntOsm = 1;
        topIn.addEventListener(
          'keydown',
          function (ev) {
            if (ev.key === 'Enter') capture(ev, topIn);
          },
          true
        );
      }
    } catch (_) {}
  }

  function patchMarket() {
    try {
      if (!G.SNMarket || typeof SNMarket.fulfillFoodIntent !== 'function') return;
      if (SNMarket._snLaptopHuntOsm) return;
      var ful = SNMarket.fulfillFoodIntent.bind(SNMarket);
      SNMarket.fulfillFoodIntent = async function (q, opts) {
        var line = String(q || (opts && opts.text) || '');
        if (isGuest() && !snDebug() && isLaptopLine(line)) {
          await huntLaptop(line || 'laptop');
          return {
            ok: true,
            guest_browse: true,
            reply: 'Shops on globe · Google only at pay / HOLD ⭐',
          };
        }
        return ful(q, opts);
      };
      SNMarket._snLaptopHuntOsm = true;
    } catch (_) {}
  }

  function tick() {
    attachFlyHelper();
    blockAuthModalOnLaptop();
    installMapGuard();
    patchCliRun();
    bindInputs();
    patchMarket();
    installDiveGuard();
    installOverlayTap();
    noMeAv();
    if (globeOnly()) hideLeaflet();
  }

  function boot() {
    scrubFakeYou();
    tick();
  }

  boot();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 0);
  setTimeout(boot, 600);
  setTimeout(boot, 1800);
  setTimeout(boot, 4000);
  setInterval(function () {
    tick();
  }, 8000);

  G.SNChromeGuestLaptopHunt = {
    build: BUILD,
    hunt: huntLaptop,
    showRhodes: showRhodes,
    queryVendorsBbox: queryVendorsBbox,
    queryOverpass: queryOverpass,
    resolveOrigin: resolveOrigin,
    projectPin: projectPin,
    flyGlobeTo: flyGlobeToLocal,
    lastPins: function () {
      return lastPins.slice();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
