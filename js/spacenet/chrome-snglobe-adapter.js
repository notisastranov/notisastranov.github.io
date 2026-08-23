/**
 * SNGlobe adapter — Build 20260824012000-place-earth
 *
 * GitHub Pages only (notisastranov.github.io). Does not edit PR #130 / #131.
 * Does not merge #174 to main.
 *
 * REQUIRED: flyGlobeTo exists on SNGlobe BEFORE chrome-nairobi-ladder.js
 * and chrome-kalithea-village.js load. Those scripts prefer SNGlobe.flyGlobeTo
 * and will not overwrite it.
 *
 * viewLatLng is always the rendered camera raycast through the canvas center
 * (THREE.Raycaster → earth mesh → vecToLatLng). Never GPS. Never a stored
 * focus. Never a Leaflet map center.
 *
 * After nairobi: Earth stays on screen at Nairobi (~-1.3, 36.8).
 * After kalithea: Earth stays on screen at Rhodes village (~36.39, 28.22).
 * Leaflet may exist for the streets check, but it is not left as the only view.
 */
(function (G) {
  'use strict';
  var BUILD = '20260824012000-place-earth';
  if (G.__snPlaceEarthAdapter) return;
  G.__snPlaceEarthAdapter = BUILD;

  var NAIROBI = { lat: -1.286, lng: 36.817 };
  var KALITHEA = { lat: 36.387557, lng: 28.222533 };
  var SETTLE_DEG = 0.15;
  var TILT_MAX = 1.05;
  var lastFly = null;
  var stayUntil = 0;
  var origViewLatLng = null;

  function unwrapDeg(d) {
    d = +d;
    if (!isFinite(d)) return 0;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  function axisSign(n) {
    n = +n;
    if (!isFinite(n) || Math.abs(n) < 1e-8) return 0;
    return n > 0 ? 1 : -1;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function three() {
    return G.THREE || G.three || null;
  }

  function globe() {
    return G.SNGlobe || null;
  }

  function vecToLatLng(v) {
    if (!v) return null;
    var x = +v.x;
    var y = +v.y;
    var z = +v.z;
    var len = Math.sqrt(x * x + y * y + z * z) || 1;
    var ny = y / len;
    var lat = 90 - (Math.acos(Math.max(-1, Math.min(1, ny))) * 180) / Math.PI;
    var lng = (Math.atan2(z / len, -x / len) * 180) / Math.PI - 180;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng };
  }

  function canvasRect() {
    try {
      var g = globe();
      var ren = g && typeof g.getRenderer === 'function' ? g.getRenderer() : null;
      if (ren && ren.domElement) return ren.domElement.getBoundingClientRect();
    } catch (_) {}
    try {
      var c = document.querySelector('#globe canvas') || document.getElementById('globe');
      if (c && c.getBoundingClientRect) return c.getBoundingClientRect();
    } catch (_) {}
    return null;
  }

  /**
   * Lat/lng under the rendered camera. Raycast NDC (0,0) through the Earth mesh.
   * SNGlobe.viewLatLng is this function.
   */
  function viewLatLngFromCamera() {
    var T = three();
    var g = globe();
    if (!g) return null;
    var cam = null;
    var earth = null;
    var renderer = null;
    var pivot = null;
    try {
      cam = typeof g.getCamera === 'function' ? g.getCamera() : g.camera;
      earth = typeof g.getEarth === 'function' ? g.getEarth() : g.earth;
      renderer = typeof g.getRenderer === 'function' ? g.getRenderer() : g.renderer;
      pivot = typeof g.getPivot === 'function' ? g.getPivot() : g.pivot;
    } catch (_) {}
    if (cam && earth && T && T.Raycaster && T.Vector2) {
      try {
        if (pivot && pivot.updateMatrixWorld) pivot.updateMatrixWorld(true);
        if (earth.updateMatrixWorld) earth.updateMatrixWorld(true);
        if (cam.updateMatrixWorld) cam.updateMatrixWorld(true);
        var raycaster = new T.Raycaster();
        raycaster.setFromCamera(new T.Vector2(0, 0), cam);
        var hits = raycaster.intersectObject(earth, true);
        if (hits && hits.length && hits[0].point && earth.worldToLocal) {
          var local = earth.worldToLocal(hits[0].point.clone());
          var ll = vecToLatLng(local);
          if (ll) return ll;
        }
      } catch (_) {}
    }
    try {
      if (typeof g.pickLatLng === 'function') {
        var r = canvasRect();
        if (r && r.width && r.height) {
          var picked = g.pickLatLng(r.left + r.width * 0.5, r.top + r.height * 0.5);
          if (picked && isFinite(picked.lat) && isFinite(picked.lng)) return { lat: +picked.lat, lng: +picked.lng };
        }
      }
    } catch (_) {}
    return null;
  }

  function isNairobiCoord(lat, lng) {
    return Math.abs(+lat - NAIROBI.lat) < 1.25 && Math.abs(unwrapDeg(+lng - NAIROBI.lng)) < 1.25;
  }

  function isKalitheaCoord(lat, lng) {
    return Math.abs(+lat - KALITHEA.lat) < 0.55 && Math.abs(unwrapDeg(+lng - KALITHEA.lng)) < 0.55;
  }

  function injectStayCss() {
    if (document.getElementById('sn-place-earth-css')) return;
    try {
      var st = document.createElement('style');
      st.id = 'sn-place-earth-css';
      st.textContent = [
        'body.sn-place-earth #globe,',
        'body.sn-place-earth #globe.city-hidden {',
        '  visibility: visible !important;',
        '  pointer-events: auto !important;',
        '  opacity: 1 !important;',
        '  z-index: 50 !important;',
        '}',
        'body.sn-place-earth #globe canvas { display: block !important; visibility: visible !important; }',
        'body.sn-place-earth #city-map.active {',
        '  opacity: 0 !important;',
        '  pointer-events: none !important;',
        '  z-index: 1 !important;',
        '}',
        'body.sn-place-earth.city-map-on #globe { visibility: visible !important; }',
      ].join('\n');
      (document.head || document.documentElement).appendChild(st);
    } catch (_) {}
  }

  function keepEarthOnScreen(lat, lng) {
    injectStayCss();
    var place = false;
    if (lat != null && lng != null && (isNairobiCoord(lat, lng) || isKalitheaCoord(lat, lng))) place = true;
    try {
      var live = viewLatLngFromCamera();
      if (live && (isNairobiCoord(live.lat, live.lng) || isKalitheaCoord(live.lat, live.lng))) place = true;
    } catch (_) {}
    if (place) {
      stayUntil = Date.now() + 180000;
      try {
        document.body.classList.add('sn-place-earth');
        document.body.setAttribute('data-sn-place-earth', BUILD);
      } catch (_) {}
    }
    try {
      var el = document.getElementById('globe');
      if (el) {
        el.classList.remove('city-hidden');
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      }
    } catch (_) {}
    try {
      var map = document.getElementById('city-map');
      if (map && place) {
        map.style.opacity = '0';
        map.style.pointerEvents = 'none';
        map.style.zIndex = '1';
      }
    } catch (_) {}
    try {
      if (place) document.body.classList.remove('city-map-on');
    } catch (_) {}
    try {
      if (G.SNMap) {
        try {
          if (place) G.SNMap.active = false;
        } catch (_) {}
      }
    } catch (_) {}
  }

  function globeCanvas() {
    try {
      var g = globe();
      var ren = g && typeof g.getRenderer === 'function' ? g.getRenderer() : null;
      if (ren && ren.domElement) return ren.domElement;
    } catch (_) {}
    try {
      return document.querySelector('#globe canvas') || document.getElementById('globe');
    } catch (_) {}
    return null;
  }

  function dispatchPointerCancel() {
    var el = globeCanvas();
    if (!el) return;
    try {
      var opts = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true };
      try {
        el.dispatchEvent(new PointerEvent('pointercancel', opts));
      } catch (_) {
        el.dispatchEvent(new Event('pointercancel', { bubbles: true, cancelable: true }));
      }
    } catch (_) {}
  }

  function callStopMotion() {
    try {
      var g = globe();
      if (g && typeof g.stopMotion === 'function') g.stopMotion();
    } catch (_) {}
  }

  function callZeroInertia() {
    try {
      var g = globe();
      if (g && typeof g.zeroInertia === 'function') g.zeroInertia();
    } catch (_) {}
    try {
      var g = globe();
      var p = g && typeof g.getPhysics === 'function' ? g.getPhysics() : null;
      if (p) {
        p.vTilt = 0;
        p.vSpin = 0;
        p.vZ = 0;
        p.vX = 0;
        p.vY = 0;
      }
    } catch (_) {}
  }

  function paintNow() {
    try {
      var g = globe();
      if (g && typeof g.paint === 'function') g.paint();
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

  function tiltSpinNodes() {
    var out = { earth: null, spin: null, tilt: null };
    try {
      var g = globe();
      if (!g || typeof g.getEarth !== 'function') return out;
      var earth = g.getEarth();
      out.earth = earth;
      if (!earth) return out;
      var spin = earth.parent;
      var tilt = spin ? spin.parent : null;
      if (spin && !nodeIsSceneOrCam(spin)) out.spin = spin;
      if (tilt && !nodeIsSceneOrCam(tilt)) out.tilt = tilt;
      if (!out.tilt && typeof g.getTilt === 'function') out.tilt = g.getTilt();
      if (!out.spin && typeof g.getSpin === 'function') out.spin = g.getSpin();
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
      var g = globe();
      var cam = g && typeof g.getCamera === 'function' ? g.getCamera() : null;
      if (cam && cam.updateMatrixWorld) cam.updateMatrixWorld(true);
    } catch (_) {}
    paintNow();
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
    var v0 = viewLatLngFromCamera();
    if (!v0) return 0;
    var old = readRot(node, axis);
    addRot(node, axis, 0.04);
    callZeroInertia();
    paintTiltSpin(nodes);
    var v1 = viewLatLngFromCamera();
    writeRot(node, axis, old);
    callZeroInertia();
    paintTiltSpin(nodes);
    if (!v1) return 0;
    var d = kind === 'lat' ? v1.lat - v0.lat : unwrapDeg(v1.lng - v0.lng);
    return axisSign(d);
  }

  function snapTiltSpin(lat, lng) {
    try {
      var g = globe();
      if (!g) return;
      var tilt = typeof g.getTilt === 'function' ? g.getTilt() : null;
      var spin = typeof g.getSpin === 'function' ? g.getSpin() : null;
      var earth = typeof g.getEarth === 'function' ? g.getEarth() : null;
      var pivot = typeof g.getPivot === 'function' ? g.getPivot() : null;
      var nodes = tiltSpinNodes();
      tilt = tilt || nodes.tilt;
      spin = spin || nodes.spin;
      earth = earth || nodes.earth;
      if (tilt && spin) {
        var x = (-lat * Math.PI) / 180;
        var y = (-lng * Math.PI) / 180;
        if (x > TILT_MAX) x = TILT_MAX;
        if (x < -TILT_MAX) x = -TILT_MAX;
        try {
          tilt.rotation.set(x, 0, 0);
          spin.rotation.set(0, y, 0);
          if (tilt.quaternion && tilt.quaternion.setFromEuler) tilt.quaternion.setFromEuler(tilt.rotation);
          if (spin.quaternion && spin.quaternion.setFromEuler) spin.quaternion.setFromEuler(spin.rotation);
        } catch (_) {}
        try {
          if (tilt.updateMatrixWorld) tilt.updateMatrixWorld(true);
          if (spin.updateMatrixWorld) spin.updateMatrixWorld(true);
          if (earth && earth.updateMatrixWorld) earth.updateMatrixWorld(true);
          if (pivot && pivot.updateMatrixWorld) pivot.updateMatrixWorld(true);
        } catch (_) {}
      }
      paintNow();
    } catch (_) {}
  }

  function isGlobeReady() {
    try {
      var g = globe();
      if (g && g.ready === true) return true;
      if (g && typeof g.getEarth === 'function' && g.getEarth()) return true;
    } catch (_) {}
    return false;
  }

  async function waitGlobeReady(ms) {
    var t0 = Date.now();
    var limit = typeof ms === 'number' && ms > 0 ? ms : 2800;
    try {
      var g = globe();
      if (g && typeof g.init === 'function') g.init();
    } catch (_) {}
    while (Date.now() - t0 < limit) {
      if (isGlobeReady()) return true;
      await sleep(80);
    }
    return isGlobeReady();
  }

  /**
   * Honest flyGlobeTo — probe-sign algorithm + camera snap.
   * Success only when SNGlobe.viewLatLng (rendered camera) is near the target.
   */
  async function flyGlobeTo(lat, lng, label) {
    lat = +lat;
    lng = +lng;
    if (!isFinite(lat) || !isFinite(lng)) return false;

    injectStayCss();
    keepEarthOnScreen(lat, lng);

    try {
      if (G.SNMap) {
        try {
          G.SNMap.active = false;
        } catch (_) {}
        try {
          if (typeof G.SNMap.close === 'function') G.SNMap.close();
        } catch (_) {}
      }
    } catch (_) {}

    await waitGlobeReady(2800);

    dispatchPointerCancel();
    callStopMotion();
    callZeroInertia();

    try {
      var g = globe();
      if (g && typeof g.setFocus === 'function') g.setFocus(lat, lng);
    } catch (_) {}

    snapTiltSpin(lat, lng);
    callZeroInertia();
    paintTiltSpin();

    try {
      var g2 = globe();
      if (g2 && typeof g2.flyNear === 'function') g2.flyNear(lat, lng, 'city');
    } catch (_) {}
    try {
      var g3 = globe();
      if (g3 && typeof g3.goToPlace === 'function') {
        g3.goToPlace(lat, lng, {
          tier: 'city',
          openMap: false,
          skipScan: true,
          pulse: false,
          body: 'earth',
        });
      }
    } catch (_) {}

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

    function settled(v, tol) {
      tol = tol != null ? tol : SETTLE_DEG;
      if (!v) return false;
      return Math.abs(v.lat - lat) < tol && Math.abs(unwrapDeg(v.lng - lng)) < tol;
    }

    var step = 0;
    while (step < maxSteps) {
      var v = viewLatLngFromCamera();
      if (settled(v)) break;
      if (v && sLat && sLng) {
        var dLat = lat - v.lat;
        var dLng = unwrapDeg(lng - v.lng);
        if (latCtrl.node && latCtrl.node !== earth && sLat) {
          addRot(latCtrl.node, latCtrl.axis, sLat * dLat * (Math.PI / 180) * GAIN);
        }
        if (lngCtrl.node && lngCtrl.node !== earth && sLng) {
          addRot(lngCtrl.node, lngCtrl.axis, sLng * dLng * (Math.PI / 180) * GAIN);
        }
      } else {
        snapTiltSpin(lat, lng);
      }
      callZeroInertia();
      paintTiltSpin(nodes);
      step++;
    }

    var t0 = Date.now();
    var ok = false;
    while (Date.now() - t0 < 2200) {
      snapTiltSpin(lat, lng);
      callZeroInertia();
      paintTiltSpin(nodes);
      keepEarthOnScreen(lat, lng);
      var live = viewLatLngFromCamera();
      if (settled(live, 0.45) || settled(live, SETTLE_DEG)) {
        ok = true;
        break;
      }
      await sleep(90);
    }

    var end = viewLatLngFromCamera();
    if (!ok) ok = settled(end, 0.45);
    keepEarthOnScreen(lat, lng);
    if (ok) {
      lastFly = { lat: lat, lng: lng, ts: Date.now(), label: label || '', build: BUILD };
      try {
        G._snGlobeFocus = { lat: lat, lng: lng, label: label || '', t: Date.now() };
        var g4 = globe();
        if (g4 && typeof g4.setFocus === 'function') g4.setFocus(lat, lng);
      } catch (_) {}
      return true;
    }
    lastFly = null;
    return false;
  }

  function cameraViewLatLngPublic() {
    return viewLatLngFromCamera();
  }

  function adopt(obj) {
    if (!obj || typeof obj !== 'object') obj = {};
    try {
      if (typeof obj.viewLatLng === 'function' && obj.viewLatLng !== cameraViewLatLngPublic && !obj.__snPlaceEarthView) {
        origViewLatLng = obj.viewLatLng.bind(obj);
      }
    } catch (_) {}
    try {
      obj.viewLatLng = cameraViewLatLngPublic;
      obj.__snPlaceEarthView = BUILD;
    } catch (_) {}
    try {
      if (typeof obj.flyGlobeTo !== 'function') obj.flyGlobeTo = flyGlobeTo;
    } catch (_) {
      try {
        obj.flyGlobeTo = flyGlobeTo;
      } catch (__) {}
    }
    try {
      obj.__snPlaceEarth = BUILD;
    } catch (_) {}
    return obj;
  }

  function installProperty() {
    var held = adopt(G.SNGlobe && typeof G.SNGlobe === 'object' ? G.SNGlobe : {});
    try {
      var desc = Object.getOwnPropertyDescriptor(G, 'SNGlobe');
      if (desc && desc.get && desc.set && desc.get.__snPlaceEarth) {
        return;
      }
    } catch (_) {}
    try {
      var getter = function () {
        return held;
      };
      getter.__snPlaceEarth = BUILD;
      Object.defineProperty(G, 'SNGlobe', {
        configurable: true,
        enumerable: true,
        get: getter,
        set: function (v) {
          held = adopt(v && typeof v === 'object' ? v : held);
        },
      });
    } catch (_) {
      try {
        G.SNGlobe = adopt(G.SNGlobe || {});
      } catch (__) {}
    }
  }

  function watchLeafletBlur() {
    try {
      if (G.__snPlaceEarthMo) return;
      var mo = new MutationObserver(function () {
        if (Date.now() > stayUntil) {
          try {
            document.body.classList.remove('sn-place-earth');
          } catch (_) {}
          return;
        }
        var live = viewLatLngFromCamera();
        if (live && (isNairobiCoord(live.lat, live.lng) || isKalitheaCoord(live.lat, live.lng))) {
          keepEarthOnScreen(live.lat, live.lng);
        } else if (lastFly && Date.now() - lastFly.ts < 180000) {
          keepEarthOnScreen(lastFly.lat, lastFly.lng);
        }
      });
      mo.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-hidden'],
      });
      G.__snPlaceEarthMo = mo;
    } catch (_) {}
  }

  function tick() {
    try {
      var g = globe();
      if (g) {
        if (typeof g.flyGlobeTo !== 'function') g.flyGlobeTo = flyGlobeTo;
        if (g.viewLatLng !== cameraViewLatLngPublic) {
          try {
            if (typeof g.viewLatLng === 'function' && !g.__snPlaceEarthView) origViewLatLng = g.viewLatLng.bind(g);
          } catch (_) {}
          g.viewLatLng = cameraViewLatLngPublic;
          g.__snPlaceEarthView = BUILD;
        }
      }
    } catch (_) {}
    injectStayCss();
    if (Date.now() < stayUntil) {
      try {
        document.body.classList.add('sn-place-earth');
      } catch (_) {}
    }
  }

  installProperty();
  injectStayCss();
  watchLeafletBlur();
  tick();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      installProperty();
      tick();
      watchLeafletBlur();
    });
  }
  setTimeout(tick, 0);
  setTimeout(tick, 400);
  setTimeout(tick, 1200);
  setTimeout(tick, 2800);
  setInterval(tick, 2500);

  G.SNGlobeAdapter = {
    build: BUILD,
    flyGlobeTo: flyGlobeTo,
    viewLatLng: cameraViewLatLngPublic,
  };
})(typeof window !== 'undefined' ? window : globalThis);
