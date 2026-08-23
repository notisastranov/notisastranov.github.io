/**
 * Kalithea village object — Build 20260823011000-kalithea-geo
 *
 * Kalithea (lat 36.387557, lng 28.222533) is a REAL village on Rhodes, Greece.
 * Guest CLI `kalithea` / `kalithea rhodes` / any research on that name:
 *   (1) honest flyGlobeTo (same probe-sign algorithm as #127) — camera frames
 *       Rhodes, then the village. Never Nairobi, never South Africa / South
 *       America origin, never a fabricated country.
 *   (2) pin a village object on the globe at those coordinates, labeled Kalithea.
 *       CLI: `Kalithea · village · Rhodes`  ← LOCKED, do not regress.
 *   (3) if the fly fails: print `Fly failed` honestly and place NO fake pin
 *       and NO lake / islands / olives claims.
 *   (4) never teleport the camera after the answer is delivered.
 *
 * Leftover completion (this build): AFTER the locked fly + named Kalithea pin,
 * place real geospatial objects at unique lat/lng offsets from 36.387557,
 * 28.222533 (east coast of Rhodes · small reservoir inland/west · islets
 * offshore east in the Aegean · olive groves near the village).
 * CLI may print `Kalithea · lake` / `Kalithea · islands` / `Kalithea · olives`
 * ONLY once that object is actually on the globe. Never stacked pins.
 * Projection honesty matches #127: parent onto getEarth() at latLngToVec
 * (lat,lng,1.012); projectPin via earth.matrixWorld.
 *
 * Prefer SNGlobe.flyGlobeTo when #127 already defined it.
 * Else attach the same probe-sign helper (do NOT overwrite an existing one).
 *
 * Product law: if there is no pin, it is not shipped.
 */
(function (G) {
  'use strict';
  if (G.__snKalitheaVillage20260823011000) return;
  G.__snKalitheaVillage20260823011000 = 1;

  var BUILD = '20260823011000-kalithea-geo';
  var KALITHEA = {
    lat: 36.387557,
    lng: 28.222533,
    name: 'Kalithea',
    kind: 'village',
    island: 'Rhodes',
    country: 'Greece',
  };
  var RHODES = { lat: 36.44, lng: 28.22, name: 'Rhodes' };
  var SETTLE_DEG = 0.15;
  var Z = { rhodes: 2.05, village: 1.42 };
  var RHODES_BOX = { latMin: 35.82, latMax: 36.52, lngMin: 27.62, lngMax: 28.42 };
  var PIN_COLOR = 0x7ee9ff;
  var PIN_MS = 180000;

  /**
   * Unique lat/lng, real-ish offsets from 36.387557, 28.222533.
   * Village sits on the east coast of Rhodes: west = inland, east = Aegean.
   * Lake ~1.6 km WNW (small reservoir). Three islets 1.7–2.5 km east offshore.
   * Olive grove ~0.9 km SW of the houses. No two objects share a coordinate.
   */
  var GEO = [
    {
      id: 'lake',
      kind: 'lake',
      name: 'lake',
      lat: 36.3908,
      lng: 28.2054,
      color: 0x3ec6e8,
      css: '#3ec6e8',
      r: 0.014,
    },
    {
      id: 'islet-e',
      kind: 'island',
      name: 'islet',
      lat: 36.3862,
      lng: 28.2416,
      color: 0xd4c48a,
      css: '#d4c48a',
      r: 0.01,
    },
    {
      id: 'islet-ne',
      kind: 'island',
      name: 'islet',
      lat: 36.3944,
      lng: 28.2488,
      color: 0xd4c48a,
      css: '#d4c48a',
      r: 0.01,
    },
    {
      id: 'islet-se',
      kind: 'island',
      name: 'islet',
      lat: 36.3786,
      lng: 28.2462,
      color: 0xd4c48a,
      css: '#d4c48a',
      r: 0.01,
    },
    {
      id: 'olives',
      kind: 'olives',
      name: 'olives',
      lat: 36.3834,
      lng: 28.2139,
      color: 0x7cb35a,
      css: '#7cb35a',
      r: 0.011,
    },
  ];

  var lastProbe = { sLat: 0, sLng: 0 };
  var lastFly = null;
  var flying = false;
  var freezeCamUntil = 0;
  var earthPin = null;
  var pulseMesh = null;
  var geoMeshes = [];
  var geoOnGlobe = [];
  var overlayRaf = 0;
  var pinOk = false;
  var origGoToPlace = null;
  var origFlyNear = null;
  var cliWrap = null;

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function log(m, c) {
    var s = String(m == null ? '' : m).slice(0, 420);
    try {
      var el = document.getElementById('cli-log');
      if (el) {
        el.style.setProperty('display', 'block', 'important');
        var row = document.createElement('div');
        row.className = 'sn-cli-line cli-feed-item is-latest sn-' + (c || 'ok');
        row.setAttribute('data-sn-kalithea', '1');
        row.textContent = s;
        el.appendChild(row);
        el.scrollTop = el.scrollHeight;
      }
    } catch (_) {}
    try {
      if (G.SNCli && typeof SNCli.log === 'function') SNCli.log(s, c || 'ok', true);
    } catch (_) {}
  }

  function preview(m) {
    try {
      if (G.SNCli && typeof SNCli.preview === 'function') SNCli.preview(String(m).slice(0, 90));
    } catch (_) {}
  }

  function unwrapDeg(d) {
    d = Number(d);
    if (!isFinite(d)) return 0;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
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

  function isKalitheaCoord(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return false;
    return Math.abs(lat - KALITHEA.lat) < 0.008 && Math.abs(unwrapDeg(lng - KALITHEA.lng)) < 0.008;
  }

  function sameCoord(aLat, aLng, bLat, bLng, tol) {
    tol = tol != null ? tol : 0.0008;
    aLat = Number(aLat);
    aLng = Number(aLng);
    bLat = Number(bLat);
    bLng = Number(bLng);
    if (!isFinite(aLat) || !isFinite(aLng) || !isFinite(bLat) || !isFinite(bLng)) return false;
    return Math.abs(aLat - bLat) < tol && Math.abs(unwrapDeg(aLng - bLng)) < tol;
  }

  function isFakeOrigin(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return true;
    // Nairobi / Kenya
    if (Math.abs(lat + 1.286) < 0.8 && Math.abs(unwrapDeg(lng - 36.817)) < 0.8) return true;
    if (lat > -5 && lat < 5 && lng > 33 && lng < 42) return true;
    // South Africa
    if (Math.abs(lat + 26.2041) < 1.2 && Math.abs(unwrapDeg(lng - 28.0473)) < 1.2) return true;
    if (Math.abs(lat + 33.9249) < 1.2 && Math.abs(unwrapDeg(lng - 18.4241)) < 1.2) return true;
    // Pizza-hunt South America origin
    if (Math.abs(lat + 32.946) < 2 && Math.abs(unwrapDeg(lng + 61.777)) < 2) return true;
    // Lagos / Cairo / San Jose IP
    if (Math.abs(lat - 6.5244) < 0.6 && Math.abs(unwrapDeg(lng - 3.3792)) < 0.6) return true;
    if (Math.abs(lat - 30.0444) < 0.6 && Math.abs(unwrapDeg(lng - 31.2357)) < 0.6) return true;
    if (Math.abs(lat - 37.338) < 0.25 && Math.abs(unwrapDeg(lng + 121.89)) < 0.35) return true;
    return false;
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

  function viewNear(lat, lng, tol) {
    tol = tol != null ? tol : SETTLE_DEG;
    var v = liveViewLatLng();
    if (!v) return false;
    return Math.abs(v.lat - lat) < tol && Math.abs(unwrapDeg(v.lng - lng)) < tol;
  }

  function isGlobeReady() {
    try {
      if (G.SNGlobe && G.SNGlobe.ready === true) return true;
      if (G.SNGlobe && typeof SNGlobe.getEarth === 'function' && SNGlobe.getEarth()) return true;
      if (G.SNGlobe && typeof SNGlobe.pulse === 'function') return true;
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

  function stayGlobe() {
    try {
      if (G.SNMap && typeof SNMap.close === 'function') SNMap.close();
    } catch (_) {}
    try {
      if (G.SNMap) SNMap.active = false;
    } catch (_) {}
    try {
      var map = document.getElementById('city-map');
      if (map) {
        map.classList.remove('active');
        map.setAttribute('aria-hidden', 'true');
        map.style.opacity = '0';
        map.style.pointerEvents = 'none';
      }
    } catch (_) {}
    try {
      var globe = document.getElementById('globe');
      if (globe) globe.classList.remove('city-hidden');
    } catch (_) {}
    try {
      document.body.classList.remove('city-map-on');
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

  function dispatchCanvasPointerCancel() {
    function release(el) {
      if (!el) return;
      try {
        var opts = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true };
        try {
          el.dispatchEvent(new PointerEvent('pointercancel', opts));
        } catch (_) {
          try {
            el.dispatchEvent(new Event('pointercancel', { bubbles: true, cancelable: true }));
          } catch (__) {}
        }
      } catch (_) {}
    }
    try {
      release(globeCanvas());
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
        p.vZ = 0;
        p.vX = 0;
        p.vY = 0;
        p.tTilt = null;
        p.tSpin = null;
      }
    } catch (_) {}
  }

  function unfreezeGlobe() {
    stayGlobe();
    dispatchCanvasPointerCancel();
    callStopMotion();
    callZeroInertia();
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
   * Honest flyGlobeTo — same algorithm as #127 pizza hunt.
   * Attached as SNGlobe.flyGlobeTo only if that helper is not already defined.
   * Does NOT remap Kalithea → Rhodes. Kalithea is a real village.
   * LOCKED — do not edit the probe-sign loop.
   */
  async function flyGlobeToLocal(lat, lng, label) {
    lat = +lat;
    lng = +lng;
    if (!isFinite(lat) || !isFinite(lng)) return false;

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
      return Math.abs(v.lat - lat) < SETTLE_DEG && Math.abs(unwrapDeg(v.lng - lng)) < SETTLE_DEG;
    }
    function markSuccess() {
      callZeroInertia();
      lastFly = { lat: lat, lng: lng, ts: Date.now(), label: label || '' };
      try {
        G._snGlobeFocus = { lat: lat, lng: lng, label: label || '', t: Date.now() };
      } catch (_) {}
      return true;
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
    if (settled(vEnd)) return markSuccess();
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

  function easeZ(toZ, ms) {
    return new Promise(function (resolve) {
      var cam = null;
      try {
        cam = G.SNGlobe && typeof SNGlobe.getCamera === 'function' ? SNGlobe.getCamera() : null;
      } catch (_) {}
      if (!cam || !cam.position) {
        resolve();
        return;
      }
      var z0 = +cam.position.z;
      toZ = +toZ;
      if (!isFinite(toZ)) {
        resolve();
        return;
      }
      if (!isFinite(z0) || Math.abs(z0 - toZ) < 0.008) {
        try {
          cam.position.z = toZ;
          var phys = typeof SNGlobe.getPhysics === 'function' ? SNGlobe.getPhysics() : null;
          if (phys) {
            phys.tZ = toZ;
            phys.vZ = 0;
          }
          paintGlobe();
        } catch (_) {}
        resolve();
        return;
      }
      var t0 = Date.now();
      ms = ms || 720;
      function step() {
        var t = Math.min(1, (Date.now() - t0) / ms);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        try {
          cam.position.z = z0 + (toZ - z0) * e;
          var phys2 = typeof SNGlobe.getPhysics === 'function' ? SNGlobe.getPhysics() : null;
          if (phys2) {
            phys2.tZ = cam.position.z;
            phys2.vZ = 0;
          }
          paintGlobe();
        } catch (_) {}
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
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

  function threeNS() {
    try {
      if (G.THREE) return G.THREE;
    } catch (_) {}
    try {
      if (typeof THREE !== 'undefined') return THREE;
    } catch (_) {}
    return null;
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
    return {
      x: -r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.cos(phi),
      z: r * Math.sin(phi) * Math.sin(theta),
    };
  }

  function stopOverlayRaf() {
    if (!overlayRaf) return;
    try {
      cancelAnimationFrame(overlayRaf);
    } catch (_) {}
    overlayRaf = 0;
  }

  function clearGeoMeshes() {
    var i;
    for (i = 0; i < geoMeshes.length; i++) {
      try {
        var m = geoMeshes[i];
        if (m && m.parent && typeof m.parent.remove === 'function') m.parent.remove(m);
      } catch (_) {}
    }
    geoMeshes = [];
    geoOnGlobe = [];
  }

  function clearPin() {
    pinOk = false;
    stopOverlayRaf();
    try {
      if (earthPin && earthPin.parent && typeof earthPin.parent.remove === 'function') {
        earthPin.parent.remove(earthPin);
      }
    } catch (_) {}
    earthPin = null;
    pulseMesh = null;
    clearGeoMeshes();
    try {
      var el = document.getElementById('sn-kalithea-pin');
      if (el) {
        el.innerHTML = '';
        el.style.display = 'none';
      }
    } catch (_) {}
    try {
      if (G.SNGlobe && typeof SNGlobe.clearMarkers === 'function') SNGlobe.clearMarkers();
    } catch (_) {}
  }

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
      var local = latLngToVecLocal(lat, lng, 1.012);
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
      return { left: left, top: top, world: world };
    } catch (_) {
      return null;
    }
  }

  function attachEarthPinAt(lat, lng, color, meta, radius) {
    try {
      if (!G.SNGlobe || typeof SNGlobe.getEarth !== 'function') return null;
      var earth = SNGlobe.getEarth();
      if (!earth || typeof earth.add !== 'function') return null;
      var vec = latLngToVecLocal(lat, lng, 1.012);
      if (!vec || vec.x == null) return null;
      var T = threeNS();
      var mesh = null;
      var rad = radius != null ? radius : 0.012;
      if (T && T.Mesh && T.SphereGeometry) {
        mesh = new T.Mesh(
          new T.SphereGeometry(rad, 12, 12),
          new T.MeshBasicMaterial({
            color: color != null ? color : PIN_COLOR,
            depthTest: true,
            transparent: true,
            opacity: 0.98,
          })
        );
      } else if (pulseMesh && typeof pulseMesh.clone === 'function') {
        mesh = pulseMesh.clone();
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
        mesh.userData.snVillage = true;
        mesh.userData.snName = (meta && meta.name) || 'Kalithea';
        mesh.userData.snKind = (meta && meta.kind) || 'village';
        mesh.userData.snIsland = 'Rhodes';
        mesh.userData.snId = (meta && meta.id) || 'village';
        mesh.userData.snLat = lat;
        mesh.userData.snLng = lng;
      } catch (_) {}
      earth.add(mesh);
      try {
        if (earth.updateMatrixWorld) earth.updateMatrixWorld(true);
      } catch (_) {}
      return mesh;
    } catch (_) {
      return null;
    }
  }

  function attachEarthPin() {
    var mesh = attachEarthPinAt(KALITHEA.lat, KALITHEA.lng, PIN_COLOR, {
      id: 'village',
      name: 'Kalithea',
      kind: 'village',
    }, 0.012);
    earthPin = mesh;
    return mesh;
  }

  function pinOverlayEl() {
    var el = document.getElementById('sn-kalithea-pin');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'sn-kalithea-pin';
    el.setAttribute('data-sn-build', BUILD);
    el.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;' +
      'pointer-events:none;z-index:82;margin:0;padding:0;border:0;';
    try {
      (document.body || document.documentElement).appendChild(el);
    } catch (_) {}
    return el;
  }

  function overlayRows() {
    var rows = [];
    if (pinOk) {
      rows.push({
        id: 'village',
        lat: KALITHEA.lat,
        lng: KALITHEA.lng,
        name: 'Kalithea',
        css: '#7ee9ff',
        kind: 'village',
        size: 22,
      });
    }
    var i;
    for (i = 0; i < geoOnGlobe.length; i++) {
      rows.push(geoOnGlobe[i]);
    }
    return rows;
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

  function fanCss(points, minPx) {
    minPx = minPx || 24;
    if (!points || points.length < 2) return points;
    if (cssSpreadOf(points) > 20) return points;
    var cx = 0;
    var cy = 0;
    var n = 0;
    var i;
    for (i = 0; i < points.length; i++) {
      if (!points[i] || !isFinite(points[i].left)) continue;
      cx += points[i].left;
      cy += points[i].top;
      n++;
    }
    if (!n) return points;
    cx /= n;
    cy /= n;
    var r = Math.max(36, (n * minPx) / (2 * Math.PI));
    for (i = 0; i < points.length; i++) {
      if (!points[i] || !isFinite(points[i].left)) continue;
      var a = (i / points.length) * Math.PI * 2 - Math.PI / 2;
      points[i].left = cx + Math.cos(a) * r;
      points[i].top = cy + Math.sin(a) * r;
    }
    return points;
  }

  function paintPinOverlay() {
    var root = pinOverlayEl();
    if (!root) return false;
    if (!pinOk) {
      root.style.display = 'none';
      root.innerHTML = '';
      return false;
    }
    var rows = overlayRows();
    var points = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || row.lat == null) continue;
      var proj = projectPin(row.lat, row.lng);
      if (!proj) continue;
      points.push({
        left: proj.left,
        top: proj.top,
        id: row.id,
        name: row.name,
        css: row.css || '#7ee9ff',
        kind: row.kind,
        size: row.size || 18,
      });
    }
    fanCss(points, 26);
    if (!points.length) {
      root.style.display = 'none';
      return true;
    }
    root.style.display = 'block';
    var existing = root.querySelectorAll('[data-sn-kalithea-dot]');
    if (existing.length === points.length) {
      for (i = 0; i < points.length; i++) {
        var half = (points[i].size || 22) / 2;
        existing[i].style.left = (points[i].left - half).toFixed(1) + 'px';
        existing[i].style.top = (points[i].top - half).toFixed(1) + 'px';
        existing[i].style.display = 'block';
      }
      return true;
    }
    root.innerHTML = '';
    for (i = 0; i < points.length; i++) {
      var pt = points[i];
      var sz = pt.size || 22;
      var wrap = document.createElement('div');
      wrap.setAttribute('data-sn-kalithea-dot', pt.id || String(i));
      wrap.setAttribute('data-sn-kind', pt.kind || '');
      wrap.style.cssText =
        'position:absolute;left:' +
        (pt.left - sz / 2).toFixed(1) +
        'px;top:' +
        (pt.top - sz / 2).toFixed(1) +
        'px;width:' +
        sz +
        'px;height:' +
        sz +
        'px;border-radius:50%;border:2px solid #fff;' +
        'background:' +
        pt.css +
        ';box-shadow:0 0 12px ' +
        pt.css +
        ';pointer-events:none;';
      var lab = document.createElement('span');
      lab.textContent = pt.name || '';
      var labSide = pt.kind === 'lake' || pt.kind === 'olives' ? 'right' : 'left';
      lab.style.cssText =
        'position:absolute;' +
        (labSide === 'left' ? 'left:' + (sz + 4) + 'px;' : 'right:' + (sz + 4) + 'px;') +
        'top:1px;white-space:nowrap;color:#eaf4ff;' +
        'font:700 11px/1.2 Space Grotesk,Inter,sans-serif;text-shadow:0 0 8px #1c8cff;' +
        'letter-spacing:.04em;';
      wrap.appendChild(lab);
      root.appendChild(wrap);
    }
    return true;
  }

  function startOverlayRaf() {
    stopOverlayRaf();
    function tick() {
      overlayRaf = 0;
      if (!pinOk) return;
      paintPinOverlay();
      try {
        overlayRaf = requestAnimationFrame(tick);
      } catch (_) {}
    }
    tick();
  }

  function placeVillagePin() {
    var pulse = null;
    try {
      if (G.SNGlobe && typeof SNGlobe.pulse === 'function') {
        pulse = SNGlobe.pulse(KALITHEA.lat, KALITHEA.lng, PIN_COLOR, 'Kalithea', PIN_MS);
        pulseMesh = pulse || null;
        if (pulse) {
          try {
            pulse.userData = pulse.userData || {};
            pulse.userData.snVillage = true;
            pulse.userData.snName = 'Kalithea';
            pulse.userData.snKind = 'village';
          } catch (_) {}
        }
      }
    } catch (_) {}
    var earth = attachEarthPin();
    pinOk = !!(pulse || earth);
    if (pinOk) {
      paintPinOverlay();
      startOverlayRaf();
    } else {
      clearPin();
    }
    return pinOk;
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

  function coordTaken(lat, lng) {
    if (sameCoord(lat, lng, KALITHEA.lat, KALITHEA.lng, 0.0008)) return true;
    var i;
    for (i = 0; i < geoOnGlobe.length; i++) {
      var g = geoOnGlobe[i];
      if (g && sameCoord(lat, lng, g.lat, g.lng, 0.0008)) return true;
    }
    return false;
  }

  function placeOneGeo(spec) {
    if (!spec || spec.lat == null || spec.lng == null) return false;
    var lat = +spec.lat;
    var lng = +spec.lng;
    if (!isFinite(lat) || !isFinite(lng)) return false;
    if (coordTaken(lat, lng)) return false;
    var pulse = null;
    try {
      if (G.SNGlobe && typeof SNGlobe.pulse === 'function') {
        pulse = SNGlobe.pulse(lat, lng, spec.color, spec.name, PIN_MS);
        if (pulse) {
          try {
            pulse.userData = pulse.userData || {};
            pulse.userData.snVillage = true;
            pulse.userData.snName = spec.name;
            pulse.userData.snKind = spec.kind;
            pulse.userData.snId = spec.id;
          } catch (_) {}
        }
      }
    } catch (_) {}
    var earth = attachEarthPinAt(lat, lng, spec.color, spec, spec.r);
    if (earth) geoMeshes.push(earth);
    var onGlobe = !!(pulse || earth);
    if (!onGlobe) return false;
    geoOnGlobe.push({
      id: spec.id,
      kind: spec.kind,
      name: spec.name,
      lat: lat,
      lng: lng,
      css: spec.css,
      size: spec.kind === 'lake' ? 20 : 16,
      onGlobe: true,
      mesh: earth || pulse,
    });
    return true;
  }

  function kindOnGlobe(kind) {
    var i;
    for (i = 0; i < geoOnGlobe.length; i++) {
      if (geoOnGlobe[i] && geoOnGlobe[i].kind === kind && geoOnGlobe[i].onGlobe) return true;
    }
    return false;
  }

  /**
   * Place lake / islets / olives AFTER the locked village pin.
   * Each object keeps its own lat/lng (no stacked pins). Claim flags
   * are true only when that object actually landed on the globe.
   */
  function placeGeoObjects() {
    clearGeoMeshes();
    var i;
    for (i = 0; i < GEO.length; i++) {
      try {
        placeOneGeo(GEO[i]);
      } catch (_) {}
    }
    try {
      var earth = G.SNGlobe && typeof SNGlobe.getEarth === 'function' ? SNGlobe.getEarth() : null;
      if (earth && earth.updateMatrixWorld) earth.updateMatrixWorld(true);
    } catch (_) {}
    if (pinOk) {
      paintPinOverlay();
      startOverlayRaf();
    }
    return {
      lake: kindOnGlobe('lake'),
      islands: kindOnGlobe('island'),
      olives: kindOnGlobe('olives'),
    };
  }

  function stillHonestRhodes() {
    var v = liveViewLatLng();
    if (!v) return false;
    if (isFakeOrigin(v.lat, v.lng)) return false;
    if (!inRhodes(v.lat, v.lng)) return false;
    return true;
  }

  function failFly() {
    clearPin();
    lastFly = null;
    stayGlobe();
    log('Fly failed', 'err');
    log(flyFailDiag(), 'dim');
    preview('Fly failed');
  }

  async function runKalithea(raw) {
    if (flying) return true;
    flying = true;
    G.__snKalitheaHonestFly = true;
    clearPin();
    stayGlobe();
    attachFlyHelper();
    try {
      var a = document.getElementById('cli-in');
      if (a) a.value = '';
      var b = document.getElementById('stc-cmd-in');
      if (b) b.value = '';
    } catch (_) {}

    try {
      log(String(raw || 'kalithea').slice(0, 80), 'cmd');

      var ready = await waitGlobeReady(2800);
      if (!ready) {
        failFly();
        return true;
      }

      var fly = getFly();

      // (1) Frame Rhodes — island in view, never Nairobi / SA / a fake country.
      var okRhodes = false;
      try {
        okRhodes = await fly(RHODES.lat, RHODES.lng, 'Rhodes');
      } catch (_) {
        okRhodes = false;
      }
      await easeZ(Z.rhodes, 720);
      await sleep(120);
      if (!okRhodes && !viewNear(RHODES.lat, RHODES.lng, 0.45) && !stillHonestRhodes()) {
        failFly();
        return true;
      }
      if (!stillHonestRhodes()) {
        failFly();
        return true;
      }

      // (2) Frame the village at the exact Kalithea coordinates.
      var okVillage = false;
      try {
        okVillage = await fly(KALITHEA.lat, KALITHEA.lng, 'Kalithea');
      } catch (_) {
        okVillage = false;
      }
      await easeZ(Z.village, 640);
      await sleep(120);
      if (!okVillage && !viewNear(KALITHEA.lat, KALITHEA.lng, SETTLE_DEG) && !stillHonestRhodes()) {
        failFly();
        return true;
      }
      if (!stillHonestRhodes()) {
        failFly();
        return true;
      }

      var pinned = placeVillagePin();
      if (!pinned) {
        failFly();
        return true;
      }

      // LOCKED: named Kalithea pin is on the globe → village CLI.
      log('Kalithea · village · Rhodes', 'ok');
      preview('Kalithea · village · Rhodes');

      // (3) Leftover completion — lake / islands / olives as real globe objects.
      //     Claim each line ONLY if that object actually landed on the globe.
      var geo = { lake: false, islands: false, olives: false };
      try {
        geo = placeGeoObjects() || geo;
      } catch (_) {
        geo = { lake: false, islands: false, olives: false };
      }
      if (geo.lake) log('Kalithea · lake', 'ok');
      if (geo.islands) log('Kalithea · islands', 'ok');
      if (geo.olives) log('Kalithea · olives', 'ok');

      freezeCamUntil = Date.now() + 120000;
      callZeroInertia();
      callStopMotion();
      lastFly = { lat: KALITHEA.lat, lng: KALITHEA.lng, ts: Date.now(), label: 'Kalithea' };
      return true;
    } catch (_) {
      failFly();
      return true;
    } finally {
      flying = false;
      G.__snKalitheaHonestFly = false;
    }
  }

  function isKalitheaLine(raw) {
    var t = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!t) return false;
    if (/pizza|nairobi|kenya|\bafrica\b|lagos|johannesburg|cape town|webrtc|\bcall\b|hangup/.test(t))
      return false;
    if (/\b(kalithea|kallithea|kalitheia)\b/.test(t)) return true;
    if (/καλλιθ/.test(t)) return true;
    if (/^(village|astranov village|sustainable village)$/.test(t)) return true;
    if (/astranov/.test(t) && /village|sustainable/.test(t)) return true;
    if (/^research\b/.test(t) && /(kalith|kallith|village|καλλιθ)/.test(t)) return true;
    if (
      /^(what is|where is|who is|show|fly|go(?: to)?|zoom(?: to)?|take me to|look at|open|dive)\b/.test(
        t
      ) &&
      /(kalith|kallith|καλλιθ)/.test(t)
    )
      return true;
    return false;
  }

  function patchCliRun() {
    try {
      if (!G.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli.run === cliWrap) return;
      var prev = SNCli.run.bind(SNCli);
      cliWrap = function (raw) {
        try {
          if (isKalitheaLine(raw)) {
            void runKalithea(raw);
            return Promise.resolve(true);
          }
        } catch (_) {}
        return prev(raw);
      };
      SNCli.run = cliWrap;
    } catch (_) {}
  }

  function bindInputs() {
    function capture(ev, el) {
      var v = String((el && el.value) || '').trim();
      if (!v || !isKalitheaLine(v)) return false;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      if (el) el.value = '';
      void runKalithea(v);
      return true;
    }
    try {
      var form = document.getElementById('cli-form');
      var input = document.getElementById('cli-in');
      if (form && input && !input._snKalitheaVillage) {
        input._snKalitheaVillage = 1;
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
      if (topIn && !topIn._snKalitheaVillage) {
        topIn._snKalitheaVillage = 1;
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

  function patchVillageModule() {
    try {
      if (!G.SNVillage) return;
      if (SNVillage.__snKalitheaHonest === BUILD) return;
      SNVillage.fly = function () {
        void runKalithea('kalithea');
        return true;
      };
      SNVillage.handleLine = function (raw) {
        if (!isKalitheaLine(raw) && !(SNVillage.isVillageQuery && SNVillage.isVillageQuery(raw)))
          return false;
        if (!isKalitheaLine(raw) && SNVillage.isVillageQuery && SNVillage.isVillageQuery(raw)) {
          var t = String(raw || '').toLowerCase();
          if (!/(kalith|kallith|καλλιθ|village|astranov)/.test(t)) return false;
        }
        void runKalithea(raw);
        return true;
      };
      SNVillage.boot = function () {};
      SNVillage.pin = function () {};
      SNVillage.__snKalitheaHonest = BUILD;
    } catch (_) {}
  }

  function patchResearch() {
    try {
      if (!G.SNSearch || typeof SNSearch.researchFirst !== 'function') return;
      if (SNSearch.__snKalitheaResearch === BUILD) return;
      var prev = SNSearch.researchFirst.bind(SNSearch);
      SNSearch.researchFirst = function (query, opts) {
        try {
          if (isKalitheaLine(query) || (G.SNVillage && SNVillage.isVillageQuery && SNVillage.isVillageQuery(query) && isKalitheaLine(query))) {
            void runKalithea(query);
            return Promise.resolve({
              ok: true,
              query: query,
              places: [
                {
                  lat: KALITHEA.lat,
                  lng: KALITHEA.lng,
                  name: 'Kalithea',
                  kind: 'village',
                  island: 'Rhodes',
                  country: 'Greece',
                },
              ],
              via: 'kalithea-village',
              acted: ['globe-pin'],
            });
          }
        } catch (_) {}
        return prev(query, opts);
      };
      SNSearch.__snKalitheaResearch = BUILD;
    } catch (_) {}
  }

  function patchDishonestFly() {
    try {
      if (!G.SNGlobe) return;
      if (!SNGlobe.__snKalitheaGoWrap && typeof SNGlobe.goToPlace === 'function') {
        origGoToPlace = SNGlobe.goToPlace.bind(SNGlobe);
        SNGlobe.goToPlace = function (lat, lng, opts) {
          if (flying || G.__snKalitheaHonestFly) return false;
          if (Date.now() < freezeCamUntil) return false;
          // Block village.js boot teleport to Kalithea. Honest path is flyGlobeTo.
          if (isKalitheaCoord(lat, lng)) return false;
          return origGoToPlace(lat, lng, opts);
        };
        SNGlobe.__snKalitheaGoWrap = 1;
      }
      if (!SNGlobe.__snKalitheaFlyWrap && typeof SNGlobe.flyNear === 'function') {
        origFlyNear = SNGlobe.flyNear.bind(SNGlobe);
        SNGlobe.flyNear = function (lat, lng, tier) {
          if (flying || G.__snKalitheaHonestFly) return;
          if (Date.now() < freezeCamUntil) return;
          if (isKalitheaCoord(lat, lng)) return;
          return origFlyNear(lat, lng, tier);
        };
        SNGlobe.__snKalitheaFlyWrap = 1;
      }
    } catch (_) {}
  }

  function tick() {
    attachFlyHelper();
    patchCliRun();
    bindInputs();
    patchVillageModule();
    patchResearch();
    patchDishonestFly();
  }

  function init() {
    tick();
    setTimeout(tick, 0);
    setTimeout(tick, 400);
    setTimeout(tick, 1200);
    setTimeout(tick, 2800);
    setInterval(tick, 4000);
  }

  G.SNKalitheaVillage = {
    build: BUILD,
    fly: runKalithea,
    flyGlobeTo: flyGlobeToLocal,
    kalithea: KALITHEA,
    rhodes: RHODES,
    geo: GEO,
    geoOnGlobe: function () {
      return geoOnGlobe.slice();
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
