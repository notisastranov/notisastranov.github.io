/* Astranov Earth levels · 20260823155000-gtiles-sb
 * Earth is the desktop. Google Map Tiles from Supabase secret GOOGLE_MAPS_API_KEY.
 */
(function (global) {
  'use strict';
  var BUILD = '20260823155000-gtiles-sb';
  if (global.__SN_EARTH_LEVELS) return;
  global.__SN_EARTH_LEVELS = BUILD;

  var gTiles = { ok: false, proxy: '', needsKey: true, error: '' };

  function showGoogleCredit(on) {
    var el = document.getElementById('sn-gattr');
    if (on) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'sn-gattr';
        el.textContent = '© Google';
        el.style.cssText =
          'position:fixed;right:8px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:90;pointer-events:none;font:500 10px/1.2 Inter,system-ui,sans-serif;color:rgba(220,230,240,0.7);text-shadow:0 1px 2px #000';
        document.body.appendChild(el);
      }
      el.style.display = 'block';
    } else if (el) el.style.display = 'none';
  }

  function bootGoogle() {
    return fetch('/api/gtiles', { cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        gTiles = j && typeof j === 'object' ? j : { ok: false };
        if (gTiles.ok && gTiles.proxy) {
          showGoogleCredit(true);
          drapeLast = '';
        } else {
          showGoogleCredit(false);
        }
        return gTiles;
      })
      .catch(function () {
        gTiles = { ok: false, needsKey: true };
        return gTiles;
      });
  }
  var STREETS_RE = /^(streets?|street map|city map)$/i;
  var OCEANS = {
    ocean: { lat: 0, lng: -160, tier: 'national', name: 'Pacific' },
    sea: { lat: 35.2, lng: 18.0, tier: 'regional', name: 'Mediterranean' },
    pacific: { lat: 0, lng: -160, tier: 'national', name: 'Pacific' },
    atlantic: { lat: 15, lng: -40, tier: 'national', name: 'Atlantic' },
    indian: { lat: -15, lng: 80, tier: 'national', name: 'Indian Ocean' },
    mediterranean: { lat: 35.2, lng: 18.0, tier: 'regional', name: 'Mediterranean' },
    aegean: { lat: 37.1, lng: 25.4, tier: 'regional', name: 'Aegean' },
    arctic: { lat: 82, lng: 0, tier: 'national', name: 'Arctic' },
    southern: { lat: -60, lng: 0, tier: 'national', name: 'Southern Ocean' },
    'south ocean': { lat: -60, lng: 0, tier: 'national', name: 'Southern Ocean' },
  };

  function streetsWanted() {
    try {
      if (document.body.classList.contains('sn-streets-on')) return true;
      if (document.body.classList.contains('sn-order-live')) return true;
    } catch (_) {}
    return false;
  }

  function allowStreets(opts) {
    if (streetsWanted()) return true;
    if (opts && (opts.forceStreets === true || opts.streets === true)) return true;
    return false;
  }

  function logCli(msg, kind) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, kind || 'ok');
    } catch (_) {}
  }

  function injectCss() {
    if (document.getElementById('sn-earth-levels-css')) return;
    var s = document.createElement('style');
    s.id = 'sn-earth-levels-css';
    s.textContent =
      'html body:not(.sn-streets-on):not(.sn-order-live) #city-map,' +
      'html body:not(.sn-streets-on):not(.sn-order-live) #city-map.active{' +
      'opacity:0!important;pointer-events:none!important;z-index:0!important;' +
      'visibility:hidden!important;}' +
      'html body:not(.sn-streets-on) #globe,' +
      'html body:not(.sn-streets-on) #globe.city-hidden{' +
      'visibility:visible!important;opacity:1!important;pointer-events:auto!important;}' +
      'html body:not(.sn-streets-on):not(.sn-order-live) .leaflet-control-attribution{' +
      'display:none!important;}';
    (document.head || document.documentElement).appendChild(s);
  }

  function hideLeaflet() {
    if (streetsWanted()) return;
    try {
      document.body.classList.remove('city-map-on');
      var cm = document.getElementById('city-map');
      if (cm) {
        cm.classList.remove('active');
        cm.setAttribute('aria-hidden', 'true');
      }
      var g = document.getElementById('globe');
      if (g) {
        g.classList.remove('city-hidden');
        g.style.visibility = 'visible';
        g.style.opacity = '1';
      }
      if (global.SNMap && SNMap.active && SNMap.close) SNMap.close();
    } catch (_) {}
  }

  function look() {
    try {
      if (global.SNGlobe && SNGlobe.viewLatLng) {
        var v = SNGlobe.viewLatLng();
        if (v && v.lat != null) return v;
      }
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.focusPos) {
        var f = SNGlobe.focusPos();
        if (f && f.lat != null) return f;
      }
    } catch (_) {}
    try {
      if (global._snLastPos && _snLastPos.lat != null) return global._snLastPos;
    } catch (_) {}
    return { lat: 36.44, lng: 28.22 };
  }

  function flyGlobe(lat, lng, tier, label) {
    hideLeaflet();
    try {
      if (global.SNGlobe && SNGlobe.goToPlace) {
        SNGlobe.goToPlace(lat, lng, {
          tier: tier || 'national',
          openMap: false,
          pulse: false,
          body: 'earth',
          label: label || '',
        });
        return true;
      }
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.flyNear) {
        SNGlobe.flyNear(lat, lng, tier || 'national');
        return true;
      }
    } catch (_) {}
    return false;
  }

  /* ── wrap SNMap so Locate / city / pinch cannot steal Earth ── */
  function wrapMap() {
    var M = global.SNMap;
    if (!M || M.__earthHome) return !!M;
    M.__earthHome = true;
    var origOpen = M.open;
    var origSat = M.showLiveSat;
    if (typeof origOpen === 'function') {
      M.open = function (lat, lng, opts) {
        if (allowStreets(opts)) return origOpen.apply(this, arguments);
        hideLeaflet();
        var t = (opts && opts.zoom && opts.zoom >= 13) ? 'city' : 'national';
        if (lat != null && lng != null) flyGlobe(lat, lng, t, 'CITY · globe');
        return Promise.resolve(null);
      };
    }
    if (typeof origSat === 'function') {
      M.showLiveSat = function (lat, lng, opts) {
        if (allowStreets(opts)) return origSat.apply(this, arguments);
        hideLeaflet();
        if (lat != null && lng != null) flyGlobe(lat, lng, 'regional', 'SAT · globe');
        return Promise.resolve(null);
      };
    }
    return true;
  }

  function wrapGlobe() {
    var G = global.SNGlobe;
    if (!G || G.__earthHome) return !!G;
    G.__earthHome = true;
    if (typeof G.goToPlace === 'function') {
      var origP = G.goToPlace.bind(G);
      G.goToPlace = function (lat, lng, opts) {
        opts = opts ? Object.assign({}, opts) : {};
        if (!allowStreets(opts)) opts.openMap = false;
        if (opts.tier === 'street' || opts.tier === 'map' || opts.tier === 'local') opts.tier = 'city';
        return origP(lat, lng, opts);
      };
    }
    if (typeof G.goToTier === 'function') {
      var origT = G.goToTier.bind(G);
      G.goToTier = function (name) {
        var key = String(name || '').toLowerCase();
        if ((key === 'street' || key === 'local') && !allowStreets()) name = 'city';
        return origT(name);
      };
    }
    try {
      if (typeof G.onFrame === 'function') G.onFrame(tickDrape);
    } catch (_) {}
    return true;
  }

  /* ── satellite drape on the sphere ── */
  var drapeGroup = null;
  var drapeCache = Object.create(null);
  var drapeLast = '';
  var drapeBusy = 0;
  var loader = null;

  function tileZoomForCam(z) {
    if (z >= 3.4) return 0;
    if (z >= 2.1) return 6;
    if (z >= 1.55) return 8;
    if (z >= 1.28) return 10;
    if (z >= 1.14) return 12;
    return 13;
  }

  function lng2tile(lng, z) {
    return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
  }
  function lat2tile(lat, z) {
    var rad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z)
    );
  }
  function tileNorth(y, z) {
    var n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }
  function tileWest(x, z) {
    return (x / Math.pow(2, z)) * 360 - 180;
  }

  function ensureGroup() {
    if (drapeGroup) return drapeGroup;
    var THREE = global.THREE;
    var spin = global.SNGlobe && SNGlobe.getSpin && SNGlobe.getSpin();
    if (!THREE || !spin) return null;
    drapeGroup = new THREE.Group();
    drapeGroup.name = 'sn-earth-drape';
    spin.add(drapeGroup);
    return drapeGroup;
  }

  function tileUrl(z, x, y) {
    if (gTiles && gTiles.ok && gTiles.proxy) {
      return (
        '/api/gtiles?z=' +
        z +
        '&x=' +
        x +
        '&y=' +
        y
      );
    }
    if (z <= 8) {
      return (
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/' +
        z +
        '/' +
        y +
        '/' +
        x +
        '.jpg'
      );
    }
    return (
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' +
      z +
      '/' +
      y +
      '/' +
      x
    );
  }

  function makeTileGeom(THREE, x, y, z) {
    var north = tileNorth(y, z);
    var south = tileNorth(y + 1, z);
    var west = tileWest(x, z);
    var east = tileWest(x + 1, z);
    var segs = z >= 11 ? 4 : 6;
    var pos = [];
    var uv = [];
    var idx = [];
    var toVec =
      (global.SNGlobe && SNGlobe.latLngToVec) ||
      function (lat, lng, r) {
        var phi = ((90 - lat) * Math.PI) / 180;
        var theta = ((lng + 180) * Math.PI) / 180;
        return new THREE.Vector3(
          -r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta)
        );
      };
    var cols = segs + 1;
    for (var i = 0; i <= segs; i++) {
      var v = i / segs;
      var lat = north + (south - north) * v;
      for (var j = 0; j <= segs; j++) {
        var u = j / segs;
        var lng = west + (east - west) * u;
        var p = toVec(lat, lng, 1.006);
        pos.push(p.x, p.y, p.z);
        uv.push(u, 1 - v);
      }
    }
    for (var row = 0; row < segs; row++) {
      for (var col = 0; col < segs; col++) {
        var a = row * cols + col;
        var b = a + 1;
        var c = a + cols;
        var d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  function loadTex(url, done) {
    var THREE = global.THREE;
    if (!THREE) return done(null);
    if (!loader) {
      loader = new THREE.TextureLoader();
      try {
        loader.setCrossOrigin('anonymous');
      } catch (_) {}
    }
    loader.load(
      url,
      function (tex) {
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        done(tex);
      },
      undefined,
      function () {
        done(null);
      }
    );
  }

  function setClouds(hide) {
    try {
      var spin = global.SNGlobe && SNGlobe.getSpin && SNGlobe.getSpin();
      if (!spin) return;
      spin.traverse(function (obj) {
        if (!obj.geometry || !obj.geometry.parameters) return;
        var r = obj.geometry.parameters.radius;
        if (r > 1.012 && r < 1.03) obj.visible = !hide;
      });
    } catch (_) {}
  }

  function pruneDrape(keep) {
    var THREE = global.THREE;
    Object.keys(drapeCache).forEach(function (k) {
      if (keep[k]) return;
      var mesh = drapeCache[k];
      try {
        if (mesh.parent) mesh.parent.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (mesh.material.map) mesh.material.map.dispose();
          mesh.material.dispose();
        }
      } catch (_) {}
      delete drapeCache[k];
    });
  }

  function tickDrape() {
    var now = Date.now();
    if (now - drapeBusy < 480) return;
    var Glo = global.SNGlobe;
    var THREE = global.THREE;
    if (!Glo || !Glo.ready || !THREE) return;
    if ((Glo.bodyId || 'earth') !== 'earth') {
      if (drapeGroup) drapeGroup.visible = false;
      return;
    }
    var cam = Glo.getCamera && Glo.getCamera();
    if (!cam) return;
    var z = cam.position.z;
    var tz = tileZoomForCam(z);
    if (!tz) {
      if (drapeGroup) drapeGroup.visible = false;
      setClouds(false);
      pruneDrape({});
      drapeLast = '';
      return;
    }
    var at = look();
    var key = tz + ':' + at.lat.toFixed(2) + ':' + at.lng.toFixed(2);
    if (key === drapeLast) return;
    drapeBusy = now;
    drapeLast = key;
    var grp = ensureGroup();
    if (!grp) return;
    grp.visible = true;
    setClouds(z < 1.5);
    var cx = lng2tile(at.lng, tz);
    var cy = lat2tile(at.lat, tz);
    var n = Math.pow(2, tz);
    var span = tz >= 12 ? 2 : tz >= 10 ? 2 : 3;
    var keep = Object.create(null);
    for (var dy = -span; dy <= span; dy++) {
      for (var dx = -span; dx <= span; dx++) {
        var x = ((cx + dx) % n + n) % n;
        var y = cy + dy;
        if (y < 0 || y >= n) continue;
        var id = tz + '/' + x + '/' + y;
        keep[id] = 1;
        if (drapeCache[id]) continue;
        (function (ix, iy, iz, iid) {
          var geo = makeTileGeom(THREE, ix, iy, iz);
          var mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
          });
          var mesh = new THREE.Mesh(geo, mat);
          mesh.renderOrder = 2;
          drapeCache[iid] = mesh;
          grp.add(mesh);
          loadTex(tileUrl(iz, ix, iy), function (tex) {
            if (!tex || !drapeCache[iid]) {
              try {
                if (mesh.parent) mesh.parent.remove(mesh);
              } catch (_) {}
              delete drapeCache[iid];
              return;
            }
            mat.map = tex;
            mat.needsUpdate = true;
          });
        })(x, y, tz, id);
      }
    }
    pruneDrape(keep);
  }

  /* ── CLI: city / national / ocean stay on the globe ── */
  function handleCmd(raw) {
    var low = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!low) return false;
    if (STREETS_RE.test(low)) {
      try {
        document.body.classList.add('sn-streets-on');
      } catch (_) {}
      var p = look();
      try {
        if (global.SNMap && SNMap.open) void SNMap.open(p.lat, p.lng, { forceStreets: true, zoom: 15 });
      } catch (_) {}
      logCli('STREETS · 2D overlay · type global to return to Earth', 'ok');
      return true;
    }
    if (low === 'city' || low === 'zoom city') {
      var c = look();
      flyGlobe(c.lat, c.lng, 'city', 'CITY');
      logCli('CITY · 3D globe · ' + c.lat.toFixed(3) + ', ' + c.lng.toFixed(3) + ' · type streets for 2D', 'ok');
      return true;
    }
    if (low === 'national' || low === 'country' || low === 'zoom national') {
      var n = look();
      flyGlobe(n.lat, n.lng, 'national', 'NATIONAL');
      logCli('NATIONAL · 3D globe', 'ok');
      return true;
    }
    if (low === 'regional' || low === 'region') {
      var r = look();
      flyGlobe(r.lat, r.lng, 'regional', 'REGIONAL');
      logCli('REGIONAL · 3D globe', 'ok');
      return true;
    }
    if (low === 'global' || low === 'earth' || low === 'world') {
      try {
        document.body.classList.remove('sn-streets-on');
      } catch (_) {}
      hideLeaflet();
      try {
        if (global.SNGlobe && SNGlobe.goToTier) SNGlobe.goToTier('global');
      } catch (_) {}
      logCli('GLOBAL · full Earth', 'ok');
      return true;
    }
    if (low === 'google' || low === 'google earth' || low === 'gsat' || low === 'g-sat' || low === 'satellite') {
      bootGoogle().then(function (g) {
        if (g && g.ok) {
          var p = look();
          flyGlobe(p.lat, p.lng, 'city', 'GOOGLE SAT');
          logCli('Google Earth tiles · satellite on the 3D globe · © Google', 'ok');
        } else if (g && g.needsKey) {
          logCli('Google Earth API: no GOOGLE_MAPS_API_KEY in Supabase Edge secrets. NASA/Esri stays on the globe.', 'warn');
        } else {
          logCli('Google Earth tiles · ' + ((g && g.error) || 'session failed') + ' · NASA/Esri still on the globe', 'warn');
        }
      });
      return true;
    }
    if (OCEANS[low]) {
      var o = OCEANS[low];
      try {
        document.body.classList.remove('sn-streets-on');
      } catch (_) {}
      flyGlobe(o.lat, o.lng, o.tier, o.name);
      logCli(o.name + ' · ocean on the globe · ' + o.lat.toFixed(1) + ', ' + o.lng.toFixed(1), 'ok');
      return true;
    }
    return false;
  }

  function bindCli() {
    if (document.documentElement.getAttribute('data-sn-earth-cli')) return;
    document.documentElement.setAttribute('data-sn-earth-cli', '1');
    document.addEventListener(
      'submit',
      function (ev) {
        var t = ev.target;
        if (!t || (t.id !== 'cli-form' && t.id !== 'stc-cmd')) return;
        var inp = t.querySelector('input');
        var raw = inp ? String(inp.value || '').trim() : '';
        if (!handleCmd(raw)) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (inp) inp.value = '';
      },
      true
    );
  }

  function wrapGoogleEarth() {
    var E = global.SNGoogleEarth;
    if (!E || E.__earthHome) return !!E;
    E.__earthHome = true;
    if (typeof E.show === 'function') {
      var orig = E.show.bind(E);
      E.show = function (type, center) {
        if (allowStreets(center)) return orig(type, center);
        hideLeaflet();
        try {
          if (E.hide) E.hide();
        } catch (_) {}
        bootGoogle();
        var c = center || look();
        if (c && c.lat != null) flyGlobe(c.lat, c.lng, 'city', 'GOOGLE SAT');
        return Promise.resolve({ ok: true, engine: 'globe-drape', overlay: false });
      };
    }
    return true;
  }

  function boot() {
    injectCss();
    bindCli();
    wrapMap();
    wrapGlobe();
    wrapGoogleEarth();
    hideLeaflet();
    bootGoogle();
  }

  boot();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  setInterval(function () {
    injectCss();
    wrapMap();
    wrapGlobe();
    wrapGoogleEarth();
    if (!streetsWanted()) hideLeaflet();
  }, 1200);

  global.SNEarthLevels = {
    build: BUILD,
    flyGlobe: flyGlobe,
    hideLeaflet: hideLeaflet,
    handleCmd: handleCmd,
    google: function () {
      return gTiles;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
