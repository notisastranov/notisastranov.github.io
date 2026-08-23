/**
 * Nairobi / Africa / Kenya zoom ladder — Build 20260823003000-nairobi-rungs
 *
 * Guest types "nairobi" / "africa" / "kenya" (or pinches the live globe over Kenya)
 * → honest three sequential rungs, never a teleport to a wrong continent:
 *   NATIONAL  frame Kenya / East Africa with the continent still in frame
 *             CLI `Nairobi · national`  currentTier()==="national"
 *   CITY      ease down to the Nairobi metro (never Lagos, never Rhodes)
 *             CLI `Nairobi · city`      currentTier()==="city"
 *   STREETS   Leaflet (or equivalent) street basemap at look-at ≈ -1.286, 36.817
 *             CLI `Nairobi · streets`   currentTier()==="streets"
 *
 * Each rung changes altitude/frame AND updates currentTier() + the CLI line
 * before the next rung begins. Wait for fly settle (probe-signs style) on each.
 *
 * Reuses the #127 honest fly helper:
 *   Prefer SNGlobe.flyGlobeTo when #127 already defined it.
 *   Else attach the same probe-sign algorithm as SNGlobe.flyGlobeTo
 *   (do NOT overwrite an existing helper — pizza hunt stays intact).
 *
 * LOCKED flyGlobeTo algorithm (copied, not edited, from #127):
 *   (1) stopMotion + zeroInertia + pointercancel first
 *   (2) tilt = earth.parent.parent (lat, rotation.x), spin = earth.parent (lng, rotation.y)
 *       NEVER Mesh.rotation
 *   (3) probe signs once per fly (0.04 rad, revert). If 0, try the other node.
 *   (4) loop gain=0.35, max 16, LIVE viewLatLng each step
 *       success |lat-target|<0.15 AND unwrap|lng-target|<0.15
 *       else tilt.x += sLat*dLat*PI/180*gain; spin.y += sLng*dLng*PI/180*gain
 *   (5) never x += -dLat blindly; never both parents on both axes
 *   (6) fail: "Fly failed" honestly + "Fly failed - viewLatLng still LAT, LNG"
 *       (minus kept) + sLat/sLng + parents
 *       leave pins empty — do not snap to a fake origin
 *       do not skip ahead to Leaflet on the wrong city
 *
 * Never goToPlace / flyNear / Rhodes / Kalithea / Lagos for this path.
 */
(function (G) {
  'use strict';
  if (G.__snNairobiLadder23003000) return;
  G.__snNairobiLadder23003000 = 1;

  var BUILD = '20260823003000-nairobi-rungs';
  var NAIROBI = { lat: -1.286, lng: 36.817, name: 'Nairobi' };
  var SETTLE_DEG = 0.15;
  // Distinct snap altitudes so each rung actually changes the frame.
  // national is high enough that Kenya / East Africa still shows the continent.
  var Z = { national: 3.2, city: 1.52, street: 1.16 };
  var STREET_ZOOM = 16;
  // Kenya bbox — pinch-in here starts the ladder. Nairobi stays inside.
  var KENYA = { latMin: -4.7, latMax: 4.6, lngMin: 33.9, lngMax: 41.9 };
  // East Africa envelope used to detect a wrong-continent yank.
  var EAST_AFRICA = { latMin: -12, latMax: 12, lngMin: 28.5, lngMax: 52 };

  var lastProbe = { sLat: 0, sLng: 0 };
  var lastFly = null;
  var laddering = false;
  var streetsOpening = false;
  var pinchCoolUntil = 0;
  var emptyPins = [];
  var ladderTier = null;
  var origCurrentTier = null;
  var globeTierWrap = null;
  var cliWrap = null;
  var origMapOpen = null;

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Write the exact CLI string (middle dots kept). SNCli.userFace strips " · "
   * to ". ", so the authoritative line is the direct #cli-log row.
   */
  function log(m, c) {
    var s = String(m == null ? '' : m).slice(0, 420);
    try {
      var el = document.getElementById('cli-log');
      if (el) {
        el.style.setProperty('display', 'block', 'important');
        var row = document.createElement('div');
        row.className = 'sn-cli-line cli-feed-item is-latest sn-' + (c || 'ok');
        row.setAttribute('data-sn-nairobi', '1');
        if (c) row.setAttribute('data-sn-nairobi-cls', c);
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

  function inKenya(lat, lng) {
    return inBox(lat, lng, KENYA);
  }

  function inEastAfrica(lat, lng) {
    return inBox(lat, lng, EAST_AFRICA);
  }

  function isNairobiCoord(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return false;
    return Math.abs(lat - NAIROBI.lat) < 0.35 && Math.abs(unwrapDeg(lng - NAIROBI.lng)) < 0.35;
  }

  function isFakeOrigin(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return true;
    // Rhodes / Kalithea
    if (Math.abs(lat - 36.44) < 0.12 && Math.abs(unwrapDeg(lng - 28.22)) < 0.12) return true;
    if (Math.abs(lat - 36.387557) < 0.05 && Math.abs(unwrapDeg(lng - 28.222533)) < 0.05) return true;
    // Lagos / Johannesburg / Cairo / San Jose IP — random Africa / HQ leaks
    if (Math.abs(lat - 6.5244) < 0.4 && Math.abs(unwrapDeg(lng - 3.3792)) < 0.4) return true;
    if (Math.abs(lat + 26.2041) < 0.4 && Math.abs(unwrapDeg(lng - 28.0473)) < 0.4) return true;
    if (Math.abs(lat - 30.0444) < 0.4 && Math.abs(unwrapDeg(lng - 31.2357)) < 0.4) return true;
    if (Math.abs(lat - 37.338) < 0.2 && Math.abs(unwrapDeg(lng + 121.89)) < 0.3) return true;
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

  /**
   * Parent chain is Mesh > Object3D(spin) > Object3D(tilt) > Scene.
   * tilt = earth.parent.parent (lat, rotation.x)
   * spin = earth.parent       (lng, rotation.y)
   */
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

  /**
   * Probe one node/axis. Nudge +0.04, paint, read LIVE view, revert.
   * kind 'lat' → sign(v1.lat - v0.lat); kind 'lng' → sign(unwrap(v1.lng - v0.lng)).
   * Returns 0 if unchanged. NEVER writes Mesh.rotation.
   */
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

    // (1) BEFORE any nudge
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

    // (2) tilt = earth.parent.parent, spin = earth.parent. NEVER Mesh.
    var latCtrl = { node: tilt, axis: 'x' };
    var lngCtrl = { node: spin, axis: 'y' };

    // (3) PROBE SIGNS once per fly
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
        if (G.SNGlobe && typeof SNGlobe.setFocus === 'function') SNGlobe.setFocus(lat, lng);
      } catch (_) {}
      return true;
    }
    function nudgeSigned(dLat, dLng) {
      // NEVER Mesh. NEVER both parents on both axes. NEVER x += -dLat blindly.
      if (latCtrl.node && latCtrl.node !== earth && sLat) {
        addRot(latCtrl.node, latCtrl.axis, sLat * dLat * (Math.PI / 180) * GAIN);
      }
      if (lngCtrl.node && lngCtrl.node !== earth && sLng) {
        addRot(lngCtrl.node, lngCtrl.axis, sLng * dLng * (Math.PI / 180) * GAIN);
      }
    }

    // (4) LOOP gain=0.35, max 16 steps
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

  function cameraZ() {
    try {
      var cam = G.SNGlobe && typeof SNGlobe.getCamera === 'function' ? SNGlobe.getCamera() : null;
      if (cam && cam.position) return +cam.position.z;
    } catch (_) {}
    return 5.4;
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
          var phys = typeof SNGlobe.getPhysics === 'function' ? SNGlobe.getPhysics() : null;
          if (phys) {
            phys.tZ = cam.position.z;
            phys.vZ = 0;
          }
          paintGlobe();
        } catch (_) {}
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  function currentTier() {
    if (ladderTier) return ladderTier;
    try {
      if (origCurrentTier) return origCurrentTier();
    } catch (_) {}
    try {
      var z = cameraZ();
      if (z >= 4.0) return 'global';
      if (z >= 2.35) return 'national';
      if (z >= 1.7) return 'regional';
      return 'city';
    } catch (_) {}
    return 'national';
  }

  function setRung(tier) {
    ladderTier = tier;
    try {
      document.body.setAttribute('data-sn-nairobi-tier', tier);
    } catch (_) {}
    try {
      G._snNairobiTier = tier;
    } catch (_) {}
    try {
      if (G.SNGlobe) {
        try {
          SNGlobe.tier = tier;
        } catch (_) {}
        try {
          SNGlobe.diveTier = tier;
        } catch (_) {}
      }
    } catch (_) {}
    patchCurrentTier();
  }

  function patchCurrentTier() {
    try {
      if (!G.SNGlobe) return;
      if (typeof SNGlobe.currentTier === 'function' && SNGlobe.currentTier !== globeTierWrap && !origCurrentTier) {
        origCurrentTier = SNGlobe.currentTier.bind(SNGlobe);
      }
      if (SNGlobe.currentTier === globeTierWrap) return;
      if (typeof SNGlobe.currentTier === 'function' && SNGlobe.currentTier !== globeTierWrap) {
        origCurrentTier = SNGlobe.currentTier.bind(SNGlobe);
      }
      globeTierWrap = function () {
        return currentTier();
      };
      SNGlobe.currentTier = globeTierWrap;
    } catch (_) {}
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

  function leavePinsEmpty() {
    emptyPins = [];
    try {
      var el = document.getElementById('sn-nairobi-pins');
      if (el) {
        el.innerHTML = '';
        el.style.display = 'none';
      }
    } catch (_) {}
  }

  function failLadder() {
    leavePinsEmpty();
    lastFly = null;
    streetsOpening = false;
    stayGlobe();
    log('Fly failed', 'err');
    log(flyFailDiag(), 'dim');
    preview('Fly failed');
  }

  function stillHonest() {
    var v = liveViewLatLng();
    if (!v) return false;
    if (isFakeOrigin(v.lat, v.lng)) return false;
    if (!inEastAfrica(v.lat, v.lng)) return false;
    return true;
  }

  async function waitSettled(lat, lng, tol, ms) {
    var t0 = Date.now();
    var limit = typeof ms === 'number' && ms > 0 ? ms : 1400;
    while (Date.now() - t0 < limit) {
      if (viewNear(lat, lng, tol) && stillHonest()) return true;
      await sleep(70);
    }
    return viewNear(lat, lng, tol);
  }

  function loadCssOnce(href, mark) {
    try {
      if (document.querySelector('link[' + mark + ']')) return;
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.setAttribute(mark, '1');
      document.head.appendChild(l);
    } catch (_) {}
  }

  function loadScriptOnce(src, mark) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof L !== 'undefined') {
          resolve();
          return;
        }
        var existing = document.querySelector('script[' + mark + ']');
        if (existing) {
          existing.addEventListener('load', function () {
            resolve();
          });
          existing.addEventListener('error', function () {
            reject(new Error('leaflet'));
          });
          if (typeof L !== 'undefined') resolve();
          return;
        }
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.setAttribute(mark, '1');
        s.onload = function () {
          resolve();
        };
        s.onerror = function () {
          reject(new Error('leaflet'));
        };
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  function mapCenterLooksNairobi(map) {
    try {
      if (!map || typeof map.getCenter !== 'function') return false;
      var c = map.getCenter();
      if (!c) return false;
      if (isFakeOrigin(c.lat, c.lng)) return false;
      return isNairobiCoord(c.lat, c.lng);
    } catch (_) {
      return false;
    }
  }

  async function openLeafletFallback(lat, lng) {
    loadCssOnce('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'data-sn-nairobi-leaflet-css');
    await loadScriptOnce('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'data-sn-nairobi-leaflet-js');
    if (typeof L === 'undefined') throw new Error('leaflet missing');
    var el = document.getElementById('city-map');
    if (!el) throw new Error('city-map missing');
    try {
      if (el._leaflet_id && !G._snNairobiLeaflet) {
        try {
          el._leaflet_id = null;
          el.innerHTML = '';
        } catch (_) {}
      }
    } catch (_) {}
    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
    el.style.cssText =
      'position:fixed;inset:0;z-index:80;opacity:1;pointer-events:auto;background:#000;';
    try {
      var globe = document.getElementById('globe');
      if (globe) globe.classList.add('city-hidden');
    } catch (_) {}
    try {
      document.body.classList.add('city-map-on');
    } catch (_) {}
    var map = G._snNairobiLeaflet;
    if (!map) {
      map = L.map(el, {
        zoomControl: false,
        attributionControl: true,
        minZoom: 3,
        maxZoom: 20,
      }).setView([lat, lng], STREET_ZOOM);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        maxNativeZoom: 19,
        subdomains: 'abcd',
        attribution: '© OSM · CARTO',
      }).addTo(map);
      G._snNairobiLeaflet = map;
    } else {
      map.setView([lat, lng], STREET_ZOOM, { animate: false });
    }
    try {
      map.invalidateSize();
    } catch (_) {}
    return map;
  }

  async function openNairobiStreets() {
    var live = liveViewLatLng();
    if (!live || isFakeOrigin(live.lat, live.lng) || !inEastAfrica(live.lat, live.lng)) {
      return false;
    }
    if (!isNairobiCoord(live.lat, live.lng) && !inKenya(live.lat, live.lng)) {
      return false;
    }
    try {
      G._snLastPos = { lat: NAIROBI.lat, lng: NAIROBI.lng, t: Date.now(), source: 'nairobi-ladder' };
      G._snGlobeFocus = { lat: NAIROBI.lat, lng: NAIROBI.lng, label: 'Nairobi', t: Date.now() };
    } catch (_) {}

    streetsOpening = true;
    var opened = false;
    try {
      var opener = origMapOpen;
      if (!opener && G.SNMap && typeof SNMap.open === 'function' && SNMap.open !== mapOpenWrap) {
        opener = SNMap.open.bind(SNMap);
      }
      if (opener) {
        await opener(NAIROBI.lat, NAIROBI.lng, { force: true, zoom: STREET_ZOOM });
        opened = true;
      }
    } catch (_) {
      opened = false;
    }

    var map = null;
    try {
      if (G.SNMap && typeof SNMap.getMap === 'function') map = SNMap.getMap();
      else if (G.SNMap) map = SNMap.map;
    } catch (_) {}

    if (!opened || !map || !mapCenterLooksNairobi(map)) {
      try {
        map = await openLeafletFallback(NAIROBI.lat, NAIROBI.lng);
      } catch (_) {
        streetsOpening = false;
        return false;
      }
    }

    try {
      if (map && typeof map.setView === 'function') {
        map.setView([NAIROBI.lat, NAIROBI.lng], STREET_ZOOM, { animate: false });
        try {
          map.invalidateSize();
        } catch (_) {}
      }
    } catch (_) {}

    streetsOpening = false;

    if (!map || !mapCenterLooksNairobi(map)) {
      stayGlobe();
      return false;
    }
    return true;
  }

  var mapOpenWrap = null;

  async function flyRung(tier, toZ, settleTol) {
    var line = 'Nairobi · ' + tier;
    setRung(tier);
    log(line, 'ok');
    preview(line);

    var fly = getFly();
    var ok = false;
    try {
      ok = await fly(NAIROBI.lat, NAIROBI.lng, 'Nairobi');
    } catch (_) {
      ok = false;
    }
    await easeZ(toZ, 780);
    await sleep(160);
    var settled = await waitSettled(NAIROBI.lat, NAIROBI.lng, settleTol, 1200);
    if (!ok && !settled && !viewNear(NAIROBI.lat, NAIROBI.lng, settleTol)) {
      return false;
    }
    if (!stillHonest()) return false;
    var live = liveViewLatLng();
    if (!live || isFakeOrigin(live.lat, live.lng)) return false;
    if (tier !== 'national' && !inKenya(live.lat, live.lng)) return false;
    return true;
  }

  async function runLadder(reason) {
    if (laddering) return true;
    laddering = true;
    leavePinsEmpty();
    stayGlobe();
    attachFlyHelper();
    patchCurrentTier();
    try {
      var a = document.getElementById('cli-in');
      if (a) a.value = '';
      var b = document.getElementById('stc-cmd-in');
      if (b) b.value = '';
    } catch (_) {}

    try {
      var ready = await waitGlobeReady(2800);
      if (!ready) {
        failLadder();
        return true;
      }

      // (1) NATIONAL — Kenya / East Africa, continent still in frame
      if (!(await flyRung('national', Z.national, 1.2))) {
        failLadder();
        return true;
      }

      // (2) CITY — Nairobi metro
      if (!(await flyRung('city', Z.city, 0.4))) {
        failLadder();
        return true;
      }

      // (3) STREETS — street altitude, then Leaflet at exact Nairobi
      if (!(await flyRung('streets', Z.street, SETTLE_DEG))) {
        failLadder();
        return true;
      }

      var live = liveViewLatLng();
      if (!live || !stillHonest() || isFakeOrigin(live.lat, live.lng) || !inKenya(live.lat, live.lng)) {
        failLadder();
        return true;
      }

      var streetsOk = await openNairobiStreets();
      if (!streetsOk) {
        failLadder();
        return true;
      }

      lastFly = { lat: NAIROBI.lat, lng: NAIROBI.lng, ts: Date.now(), label: 'Nairobi' };
      leavePinsEmpty();
      setRung('streets');
      return true;
    } catch (_) {
      failLadder();
      return true;
    } finally {
      laddering = false;
    }
  }

  function isNairobiAfricaLine(raw) {
    var t = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!t) return false;
    if (/pizza|rhodes|rodos|ρόδο|call\b|hangup|webrtc/.test(t)) return false;
    if (/south africa|cape town|johannesburg|lagos|cairo|accra|addis/.test(t)) return false;
    if (/^(nairobi|nairobu|nrb|kenya|kenia|africa|east africa)\b/.test(t)) return true;
    if (
      /^(show|fly|go(?: to)?|zoom(?: to)?|take me to|look at|open|dive)\s+(the\s+)?((city|country|continent) of\s+)?(nairobi|nairobu|nrb|kenya|kenia|africa|east africa)\b/.test(
        t
      )
    )
      return true;
    if (/\b(nairobi|kenya)\b/.test(t) && /^(show|fly|go|zoom|take|look|open|dive)\b/.test(t)) return true;
    return false;
  }

  function patchCliRun() {
    try {
      if (!G.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli.run === cliWrap) return;
      var prev = SNCli.run.bind(SNCli);
      cliWrap = function (raw) {
        try {
          if (isNairobiAfricaLine(raw)) {
            void runLadder(raw);
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
      if (!v || !isNairobiAfricaLine(v)) return false;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      if (el) el.value = '';
      void runLadder(v);
      return true;
    }
    try {
      var form = document.getElementById('cli-form');
      var input = document.getElementById('cli-in');
      if (form && input && !input._snNairobiLadder) {
        input._snNairobiLadder = 1;
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
      if (topIn && !topIn._snNairobiLadder) {
        topIn._snNairobiLadder = 1;
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

  function kenyaFromEvent(ev) {
    var lat = null;
    var lng = null;
    try {
      if (G.SNGlobe && typeof SNGlobe.pickLatLng === 'function' && ev) {
        var p = SNGlobe.pickLatLng(ev.clientX, ev.clientY);
        if (p && p.lat != null) {
          lat = +p.lat;
          lng = +p.lng;
        }
      }
    } catch (_) {}
    if (lat == null) {
      var v = liveViewLatLng();
      if (v) {
        lat = v.lat;
        lng = v.lng;
      }
    }
    if (lat == null) return false;
    return inKenya(lat, lng);
  }

  function bindPinch() {
    try {
      if (G.__snNairobiPinchBound) return;
      var canvas = globeCanvas();
      if (!canvas) return;
      G.__snNairobiPinchBound = 1;
      var pts = {};
      var startDist = 0;

      function dist() {
        var keys = Object.keys(pts);
        if (keys.length < 2) return 0;
        var a = pts[keys[0]];
        var b = pts[keys[1]];
        return Math.hypot(a.x - b.x, a.y - b.y) || 1;
      }

      function maybeLadder(ev, inward) {
        if (!inward) return;
        if (Date.now() < pinchCoolUntil) return;
        if (laddering) return;
        if (!kenyaFromEvent(ev) && !inKenya((liveViewLatLng() || {}).lat, (liveViewLatLng() || {}).lng))
          return;
        pinchCoolUntil = Date.now() + 2400;
        try {
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        } catch (_) {}
        void runLadder('pinch kenya');
      }

      canvas.addEventListener(
        'pointerdown',
        function (ev) {
          pts[ev.pointerId != null ? ev.pointerId : 'm'] = { x: ev.clientX, y: ev.clientY };
          if (Object.keys(pts).length >= 2) startDist = dist();
        },
        true
      );
      canvas.addEventListener(
        'pointermove',
        function (ev) {
          var id = ev.pointerId != null ? ev.pointerId : 'm';
          if (!pts[id]) return;
          pts[id] = { x: ev.clientX, y: ev.clientY };
          if (Object.keys(pts).length < 2 || !startDist) return;
          var d = dist();
          var ratio = d / startDist;
          if (ratio < 0.92) maybeLadder(ev, true);
          startDist = d;
        },
        true
      );
      function up(ev) {
        try {
          delete pts[ev.pointerId != null ? ev.pointerId : 'm'];
        } catch (_) {}
        if (Object.keys(pts).length < 2) startDist = 0;
      }
      canvas.addEventListener('pointerup', up, true);
      canvas.addEventListener('pointercancel', up, true);
      canvas.addEventListener(
        'wheel',
        function (ev) {
          var inward = ev.deltaY < 0;
          if (!inward) return;
          maybeLadder(ev, true);
        },
        { capture: true, passive: false }
      );
    } catch (_) {}
  }

  function patchGlobeDishonestFly() {
    try {
      if (!G.SNGlobe || SNGlobe.__snNairobiLadderWrap) return;
      SNGlobe.__snNairobiLadderWrap = 1;
      attachFlyHelper();

      function hijack(lat, lng) {
        if (laddering || streetsOpening) return true;
        if (isNairobiCoord(lat, lng) || inKenya(lat, lng)) {
          void runLadder('nairobi');
          return true;
        }
        return false;
      }

      var prevGo = SNGlobe.goToPlace;
      if (typeof prevGo === 'function') {
        SNGlobe.goToPlace = function (lat, lng, opts) {
          if (hijack(lat, lng)) return true;
          return prevGo.apply(this, arguments);
        };
      }
      var prevFly = SNGlobe.flyNear;
      if (typeof prevFly === 'function') {
        SNGlobe.flyNear = function (lat, lng, tier) {
          if (hijack(lat, lng)) return;
          return prevFly.apply(this, arguments);
        };
      }
      var prevDive = SNGlobe.diveInAt;
      if (typeof prevDive === 'function') {
        SNGlobe.diveInAt = function (lat, lng) {
          if (hijack(lat, lng)) return true;
          var v = liveViewLatLng();
          if (v && inKenya(v.lat, v.lng) && Date.now() > pinchCoolUntil) {
            pinchCoolUntil = Date.now() + 2400;
            void runLadder('pinch kenya');
            return true;
          }
          return prevDive.apply(this, arguments);
        };
      }
    } catch (_) {}
  }

  function patchMapOpen() {
    try {
      if (!G.SNMap || typeof SNMap.open !== 'function') return;
      if (SNMap.open === mapOpenWrap) return;
      origMapOpen = SNMap.open.bind(SNMap);
      mapOpenWrap = function (lat, lng, opts) {
        if (streetsOpening) {
          return origMapOpen(lat, lng, opts);
        }
        if (laddering) {
          stayGlobe();
          return Promise.resolve(null);
        }
        return origMapOpen(lat, lng, opts);
      };
      SNMap.open = mapOpenWrap;
    } catch (_) {}
  }

  function tick() {
    attachFlyHelper();
    patchCurrentTier();
    patchCliRun();
    bindInputs();
    bindPinch();
    patchGlobeDishonestFly();
    patchMapOpen();
  }

  function init() {
    tick();
    setTimeout(tick, 0);
    setTimeout(tick, 400);
    setTimeout(tick, 1200);
    setTimeout(tick, 2800);
    setInterval(tick, 4000);
  }

  G.SNNairobiLadder = {
    build: BUILD,
    fly: runLadder,
    flyGlobeTo: flyGlobeToLocal,
    nairobi: NAIROBI,
    currentTier: currentTier,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
