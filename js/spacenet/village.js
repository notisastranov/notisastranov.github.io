/* SNVillage — Astranov Kalithea Sustainable Village
 * Real HQ on Earth. Source: https://maps.app.goo.gl/4yiGNUgXtNNaEqkt9
 * 36.387557 N, 28.222533 E · Kalithea, Rhodes, GR
 * Artificial lake · islets · olive grove (SpaceNet field objects).
 */
(function (global) {
  'use strict';

  var HQ = {
    id: 'astranov-kalithea-village',
    name: 'Astranov Kalithea Sustainable Village',
    short: 'KALITHEA',
    lat: 36.387557,
    lng: 28.222533,
    maps: 'https://maps.app.goo.gl/4yiGNUgXtNNaEqkt9',
    kind: 'village',
    island: 'Rhodes',
    country: 'GR',
  };

  var M_LAT = 111320;
  var M_LNG = 89615.12; // cos(36.387557°)

  function offset(lat, lng, eastM, northM) {
    return [lat + northM / M_LAT, lng + eastM / M_LNG];
  }

  /** Huge artificial lake — ~1.1 km E–W × 0.75 km N–S, open water with soft shore. */
  function lakeRing() {
    var pts = [];
    var n = 48;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var re = 520 + 40 * Math.sin(3 * a);
      var rn = 360 + 30 * Math.cos(2 * a);
      pts.push(offset(HQ.lat, HQ.lng, re * Math.cos(a), rn * Math.sin(a)));
    }
    return pts;
  }

  /** Little islands inside the lake — solid ground, not water. */
  var ISLANDS = [
    { name: 'Olive Islet', east: 120, north: 90, r: 55 },
    { name: 'Reed Islet', east: -160, north: 50, r: 42 },
    { name: 'Stone Islet', east: 50, north: -140, r: 48 },
    { name: 'Cypress Islet', east: -90, north: -70, r: 38 },
    { name: 'Heron Islet', east: 200, north: -40, r: 32 },
  ];

  function islandRing(isl) {
    var pts = [];
    var n = 20;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var wobble = 0.85 + 0.15 * Math.sin(4 * a);
      pts.push(
        offset(HQ.lat, HQ.lng, isl.east + isl.r * wobble * Math.cos(a), isl.north + isl.r * wobble * Math.sin(a))
      );
    }
    return pts;
  }

  /** Olive trees around the village — denser ring + grove north of the lake. */
  function oliveTrees() {
    var trees = [];
    var i, a, r, e, n;
    // Ring around the lake shore (outside water)
    for (i = 0; i < 36; i++) {
      a = (i / 36) * Math.PI * 2;
      r = 580 + (i % 5) * 35;
      e = r * Math.cos(a);
      n = r * 0.72 * Math.sin(a);
      trees.push({ lat: HQ.lat + n / M_LAT, lng: HQ.lng + e / M_LNG, kind: 'olive' });
    }
    // North grove (terraces)
    for (i = 0; i < 48; i++) {
      e = -320 + (i % 8) * 90 + ((i * 17) % 23) - 11;
      n = 420 + Math.floor(i / 8) * 70 + ((i * 13) % 19) - 9;
      trees.push({ lat: HQ.lat + n / M_LAT, lng: HQ.lng + e / M_LNG, kind: 'olive' });
    }
    // South + east patches
    for (i = 0; i < 24; i++) {
      e = 280 + (i % 6) * 55;
      n = -480 - Math.floor(i / 6) * 60;
      trees.push({ lat: HQ.lat + n / M_LAT, lng: HQ.lng + e / M_LNG, kind: 'olive' });
    }
    // One olive on each islet
    ISLANDS.forEach(function (isl) {
      trees.push({
        lat: HQ.lat + isl.north / M_LAT,
        lng: HQ.lng + isl.east / M_LNG,
        kind: 'olive-island',
        label: isl.name,
      });
    });
    return trees;
  }

  var OLIVES = oliveTrees();
  var LAKE = lakeRing();
  var _layer = null;
  var _painted = false;

  function log(msg) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, 'ok');
    } catch (_) {}
  }

  function clearPaint() {
    try {
      if (_layer && global.SNMap && SNMap.map && global.L) {
        if (SNMap.map.hasLayer && SNMap.map.hasLayer(_layer)) SNMap.map.removeLayer(_layer);
        else if (_layer.remove) _layer.remove();
      }
    } catch (_) {}
    _layer = null;
    _painted = false;
  }

  /** Paint lake + islets + olives on the live street map (Leaflet). */
  function paintMap() {
    var L = global.L;
    var map = global.SNMap && SNMap.map;
    if (!L || !map) return false;
    try {
      clearPaint();
      _layer = L.layerGroup();

      var lakePoly = L.polygon(LAKE, {
        color: '#0a6e8a',
        weight: 2,
        fillColor: '#14c3f3',
        fillOpacity: 0.45,
        opacity: 0.9,
        interactive: true,
      }).bindPopup(
        '<b>Astranov Lake</b><br>Artificial reservoir · Kalithea Sustainable Village<br>' +
          ISLANDS.length +
          ' islets · olive grove'
      );
      _layer.addLayer(lakePoly);

      ISLANDS.forEach(function (isl) {
        var poly = L.polygon(islandRing(isl), {
          color: '#3d6b2f',
          weight: 1.5,
          fillColor: '#6b9e4a',
          fillOpacity: 0.85,
        }).bindPopup('<b>' + isl.name + '</b><br>Lake islet · olive + shore');
        _layer.addLayer(poly);
      });

      OLIVES.forEach(function (t) {
        var m = L.circleMarker([t.lat, t.lng], {
          radius: t.kind === 'olive-island' ? 5 : 3,
          color: '#2d5016',
          weight: 1,
          fillColor: '#5a8f3a',
          fillOpacity: 0.95,
        });
        if (t.label) m.bindPopup('<b>Olive</b> · ' + t.label);
        else m.bindPopup('Olive · Astranov grove');
        _layer.addLayer(m);
      });

      // HQ pin
      L.circleMarker([HQ.lat, HQ.lng], {
        radius: 8,
        color: '#14c3f3',
        weight: 2,
        fillColor: '#0a1a22',
        fillOpacity: 1,
      })
        .bindPopup('<b>' + HQ.name + '</b><br>HQ · lake · olives')
        .addTo(_layer);

      _layer.addTo(map);
      _painted = true;
      try {
        map.fitBounds(L.latLngBounds(LAKE).pad(0.35), { maxZoom: 16, animate: true });
      } catch (_) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  function ensureMapThenPaint() {
    try {
      if (!(global.SNMap && SNMap.active)) return;
      setTimeout(paintMap, 300);
    } catch (_) {}
  }

  function pulseGlobe() {
    try {
      if (global.SNGlobe && SNGlobe.pulse) {
        SNGlobe.pulse(HQ.lat, HQ.lng, 0x14c3f3, HQ.short, 120000);
        var rim = offset(HQ.lat, HQ.lng, 480, 0);
        SNGlobe.pulse(rim[0], rim[1], 0x0a6e8a, 'LAKE', 60000);
      }
    } catch (_) {}
  }

  function fly(tier) {
    tier = tier || 'regional';
    var streets = /street|map|shops/.test(String(tier));
    try {
      if (global.SNGlobe && SNGlobe.goToPlace) {
        SNGlobe.goToPlace(HQ.lat, HQ.lng, {
          tier: streets ? 'city' : tier,
          pulse: true,
          color: 0x14c3f3,
          label: HQ.short,
          ms: 24000,
          openMap: !!streets,
          body: 'earth',
        });
      }
    } catch (_) {}
    try {
      if (global.SNStage && SNStage.scan) SNStage.scan(HQ.short);
      if (global.SNStage && SNStage.arc && global._snPhysPos) {
        SNStage.arc(
          { lat: global._snPhysPos.lat, lng: global._snPhysPos.lng, name: 'YOU' },
          { lat: HQ.lat, lng: HQ.lng, name: HQ.short },
          { kind: 'home' }
        );
      }
    } catch (_) {}
    log('ASTRANOV · Kalithea Sustainable Village · 36.387557°N 28.222533°E');
    log('Lake · ' + ISLANDS.length + ' islets · ' + OLIVES.length + ' olive trees');
    pulseGlobe();
    if (streets) ensureMapThenPaint();
    return true;
  }

  function pinQuiet() {
    pulseGlobe();
  }

  function isVillageQuery(raw) {
    var t = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[.,]/g, ' ');
    if (!t) return false;
    if (/^(village|kalithea|kallithea|καλλιθεα|καλλιθέα|lake|olives?)$/i.test(t)) return true;
    if (/astranov/.test(t) && /(village|kalithea|kallithea|sustainable|καλλιθ|lake|olive)/.test(t)) return true;
    if (/(kalithea|kallithea|καλλιθ)/.test(t) && /(village|sustainable|astranov|lake|olive)/.test(t)) return true;
    if (/(artificial lake|village lake|olive (grove|trees?))/i.test(t)) return true;
    return false;
  }

  function handleLine(raw) {
    if (!isVillageQuery(raw)) return false;
    var t = String(raw || '').toLowerCase();
    fly(/street|zoom|city|map|lake|olive/.test(t) ? 'city' : 'regional');
    return true;
  }

  function hit() {
    return {
      lat: HQ.lat,
      lng: HQ.lng,
      name: HQ.name,
      label: HQ.short,
      source: 'hq',
      kind: 'village',
      lake: true,
      islands: ISLANDS.length,
      olives: OLIVES.length,
    };
  }

  function describe() {
    return {
      HQ: HQ,
      lake: { ring: LAKE, islands: ISLANDS },
      olives: OLIVES.length,
    };
  }

  function boot() {
    pinQuiet();
    try {
      if (global.SNGlobe && SNGlobe.goToPlace && !global._snPhysPos) {
        SNGlobe.goToPlace(HQ.lat, HQ.lng, {
          tier: 'national',
          pulse: true,
          color: 0x14c3f3,
          label: HQ.short,
          ms: 20000,
          openMap: false,
        });
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 1400);
    });
  else setTimeout(boot, 1400);

  global.SNVillage = {
    HQ: HQ,
    fly: fly,
    pin: pinQuiet,
    paint: paintMap,
    clear: clearPaint,
    handleLine: handleLine,
    isVillageQuery: isVillageQuery,
    hit: hit,
    describe: describe,
    boot: boot,
    ISLANDS: ISLANDS,
    OLIVES: OLIVES,
  };
  global.ASTRANOV_VILLAGE = HQ;
})(typeof window !== 'undefined' ? window : globalThis);
