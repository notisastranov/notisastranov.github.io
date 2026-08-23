/**
 * SNGoogleEarth — official Google Maps Platform imaging + topo helpers
 *
 * Legal path only: Google Maps JavaScript API + Elevation + Geometry libraries.
 * Set SN_CONFIG.layers.googleMapsKey (Maps JavaScript API + Elevation API enabled).
 *
 * Without a key, callers fall back to free Esri/Carto + open-elevation.
 *
 * Map types: roadmap · satellite · hybrid · terrain  (Google Earth-class imagery)
 */
(function (global) {
  'use strict';

  var G = {
    ready: false,
    loading: null,
    map: null,
    el: null,
    type: 'satellite',
    elevCache: {},
  };

  function cfg() {
    var L = (global.SN_CONFIG && SN_CONFIG.layers) || {};
    return {
      key: L.googleMapsKey || L.googleKey || '',
      mapId: L.googleMapId || '',
    };
  }

  function hasKey() {
    return !!cfg().key;
  }

  function log(msg, cls) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, cls || 'ok');
    } catch (_) {}
  }

  function loadGoogleMaps() {
    if (global.google && global.google.maps) {
      G.ready = true;
      return Promise.resolve(true);
    }
    if (!hasKey()) {
      return Promise.reject(new Error('no googleMapsKey'));
    }
    if (G.loading) return G.loading;
    G.loading = new Promise(function (resolve, reject) {
      var c = cfg();
      var s = document.createElement('script');
      s.async = true;
      s.src =
        'https://maps.googleapis.com/maps/api/js?key=' +
        encodeURIComponent(c.key) +
        '&libraries=geometry,elevation,marker&v=weekly';
      s.onload = function () {
        G.ready = !!(global.google && google.maps);
        if (G.ready) resolve(true);
        else reject(new Error('google maps failed'));
      };
      s.onerror = function () {
        G.loading = null;
        reject(new Error('google maps script error'));
      };
      document.head.appendChild(s);
    });
    return G.loading;
  }

  function ensureHost() {
    var city = document.getElementById('city-map');
    if (!city) return null;
    var el = document.getElementById('sn-google-map');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sn-google-map';
      el.style.cssText =
        'position:absolute;inset:0;z-index:5;display:none;background:#000';
      city.appendChild(el);
    }
    G.el = el;
    return el;
  }

  function mapTypeId(type) {
    var t = String(type || 'satellite').toLowerCase();
    if (!global.google || !google.maps) return 'satellite';
    if (t === 'roadmap' || t === 'road' || t === 'google') return google.maps.MapTypeId.ROADMAP;
    if (t === 'hybrid') return google.maps.MapTypeId.HYBRID;
    if (t === 'terrain' || t === 'topo') return google.maps.MapTypeId.TERRAIN;
    return google.maps.MapTypeId.SATELLITE;
  }

  /**
   * Show Google Earth-class imaging over the city map host.
   * @param {string} type roadmap|satellite|hybrid|terrain
   * @param {{lat,lng,zoom}} center
   */
  async function show(type, center) {
    center = center || {};
    try {
      await loadGoogleMaps();
    } catch (e) {
      log(
        'Google Earth imaging needs SN_CONFIG.layers.googleMapsKey (Maps JS + Elevation APIs)',
        'err'
      );
      return { ok: false, error: e.message || String(e), needsKey: true };
    }
    var el = ensureHost();
    if (!el) return { ok: false, error: 'no city-map host' };

    var lat = center.lat != null ? center.lat : 36.43;
    var lng = center.lng != null ? center.lng : 28.22;
    var zoom = center.zoom != null ? center.zoom : 15;
    G.type = type || 'satellite';

    // Hide Leaflet while Google imaging is primary
    try {
      var leaf = el.parentElement && el.parentElement.querySelector('.leaflet-container');
      if (leaf) leaf.style.visibility = 'hidden';
    } catch (_) {}

    el.style.display = 'block';
    if (!G.map) {
      var opts = {
        center: { lat: lat, lng: lng },
        zoom: zoom,
        mapTypeId: mapTypeId(G.type),
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
          mapTypeIds: [
            google.maps.MapTypeId.ROADMAP,
            google.maps.MapTypeId.SATELLITE,
            google.maps.MapTypeId.HYBRID,
            google.maps.MapTypeId.TERRAIN,
          ],
        },
        scaleControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        gestureHandling: 'greedy',
      };
      if (cfg().mapId) opts.mapId = cfg().mapId;
      G.map = new google.maps.Map(el, opts);
    } else {
      G.map.setMapTypeId(mapTypeId(G.type));
      G.map.setCenter({ lat: lat, lng: lng });
      G.map.setZoom(zoom);
    }
    log(
      'Google Earth imaging · ' +
        String(G.type).toUpperCase() +
        ' · roadmap/satellite/hybrid/terrain + Street View',
      'ok'
    );
    return { ok: true, type: G.type, engine: 'google-maps-js' };
  }

  function hide() {
    if (G.el) G.el.style.display = 'none';
    try {
      var city = document.getElementById('city-map');
      var leaf = city && city.querySelector('.leaflet-container');
      if (leaf) leaf.style.visibility = '';
    } catch (_) {}
  }

  function isVisible() {
    return !!(G.el && G.el.style.display !== 'none' && G.map);
  }

  function getCenter() {
    if (G.map) {
      var c = G.map.getCenter();
      return { lat: c.lat(), lng: c.lng(), zoom: G.map.getZoom() };
    }
    return null;
  }

  function syncFromLeaflet(leafletMap) {
    if (!leafletMap || !G.map) return;
    var c = leafletMap.getCenter();
    G.map.setCenter({ lat: c.lat, lng: c.lng });
    G.map.setZoom(leafletMap.getZoom());
  }

  /** Geodesic distance (m) via Google Geometry when ready, else null */
  function geodesicDistanceM(a, b) {
    if (!G.ready || !global.google || !google.maps.geometry) return null;
    var p1 = new google.maps.LatLng(a.lat, a.lng);
    var p2 = new google.maps.LatLng(b.lat, b.lng);
    return google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
  }

  /** Geodesic polygon area (m²) */
  function geodesicAreaM2(pts) {
    if (!G.ready || !global.google || !google.maps.geometry || !pts || pts.length < 3) return null;
    var path = pts.map(function (p) {
      return new google.maps.LatLng(p.lat, p.lng);
    });
    return Math.abs(google.maps.geometry.spherical.computeArea(path));
  }

  /**
   * Elevation at points — Google Elevation API if key loaded, else open-elevation free.
   * @param {Array<{lat,lng}>} pts
   * @returns {Promise<Array<{lat,lng,elevM}>>}
   */
  async function elevations(pts) {
    if (!pts || !pts.length) return [];
    // Google ElevationService
    if (G.ready && global.google && google.maps.ElevationService) {
      return new Promise(function (resolve) {
        var elev = new google.maps.ElevationService();
        elev.getElevationForLocations(
          {
            locations: pts.map(function (p) {
              return { lat: p.lat, lng: p.lng };
            }),
          },
          function (results, status) {
            if (status !== 'OK' || !results) {
              resolve(openElevation(pts));
              return;
            }
            resolve(
              results.map(function (r, i) {
                return {
                  lat: pts[i].lat,
                  lng: pts[i].lng,
                  elevM: r.elevation,
                  source: 'google-elevation',
                };
              })
            );
          }
        );
      });
    }
    return openElevation(pts);
  }

  async function openElevation(pts) {
    // Free community API — batch as locations=lat,lng|...
    try {
      var loc = pts
        .slice(0, 100)
        .map(function (p) {
          return p.lat + ',' + p.lng;
        })
        .join('|');
      var r = await fetch('https://api.open-elevation.com/api/v1/lookup?locations=' + loc);
      if (!r.ok) throw new Error('open-elevation ' + r.status);
      var j = await r.json();
      return (j.results || []).map(function (row) {
        return {
          lat: row.latitude,
          lng: row.longitude,
          elevM: row.elevation,
          source: 'open-elevation',
        };
      });
    } catch (_) {
      return pts.map(function (p) {
        return { lat: p.lat, lng: p.lng, elevM: null, source: 'none' };
      });
    }
  }

  /**
   * 3D path length: sum sqrt(horiz² + Δelev²)
   */
  async function pathLength3dM(pts) {
    if (!pts || pts.length < 2) return { horizM: 0, path3dM: 0, elev: [] };
    var elev = await elevations(pts);
    var horiz = 0;
    var path3d = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var h =
        geodesicDistanceM(pts[i], pts[i + 1]) != null
          ? geodesicDistanceM(pts[i], pts[i + 1])
          : null;
      if (h == null && global.SNTopo && SNTopo.haversineM) h = SNTopo.haversineM(pts[i], pts[i + 1]);
      h = h || 0;
      horiz += h;
      var e0 = elev[i] && elev[i].elevM != null ? elev[i].elevM : 0;
      var e1 = elev[i + 1] && elev[i + 1].elevM != null ? elev[i + 1].elevM : 0;
      var de = e1 - e0;
      path3d += Math.sqrt(h * h + de * de);
    }
    return { horizM: horiz, path3dM: path3d, elev: elev };
  }

  function status() {
    return {
      hasKey: hasKey(),
      ready: G.ready,
      visible: isVisible(),
      type: G.type,
      apis: ['Maps JavaScript', 'Elevation', 'Geometry', 'Street View'],
    };
  }

  global.SNGoogleEarth = {
    hasKey: hasKey,
    load: loadGoogleMaps,
    show: show,
    hide: hide,
    isVisible: isVisible,
    getCenter: getCenter,
    syncFromLeaflet: syncFromLeaflet,
    geodesicDistanceM: geodesicDistanceM,
    geodesicAreaM2: geodesicAreaM2,
    elevations: elevations,
    pathLength3dM: pathLength3dM,
    status: status,
    TYPES: ['roadmap', 'satellite', 'hybrid', 'terrain'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
