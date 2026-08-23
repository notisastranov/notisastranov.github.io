/**
 * SNSkyBodies — Sun, Moon, planets at live ephemeris + Astranov above the Moon
 * Parent: Earth spin, so bodies sit over the real sub-point as you turn the globe.
 */
(function (global) {
  'use strict';

  var BUILD = '20260813091800-beyond-moon';
  var MOON_MAP = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/moon_1024.jpg';
  var S = {
    ready: false,
    group: null,
    sun: null,
    sunGlow: null,
    moon: null,
    moonOrbit: null,
    astranov: null,
    astOrbit: null,
    planets: {},
    labels: null,
    lastTick: 0,
    faced: false,
    hit: null,
  };

  function $(id) {
    return document.getElementById(id);
  }
  function Globe() {
    return global.SNGlobe;
  }
  function Eph() {
    return global.SNEphemeris;
  }

  function vecAt(lat, lng, r) {
    var G = Globe();
    if (G && G.latLngToVec) return G.latLngToVec(lat, lng, r);
    var phi = ((90 - lat) * Math.PI) / 180;
    var theta = ((lng + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  function makeOrbitRing(radius, color, tiltDeg) {
    var pts = [];
    var n = 96;
    var i;
    for (i = 0; i <= n; i++) {
      var a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    var line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({
        color: color,
        transparent: true,
        opacity: 0.28,
        dashSize: 0.08,
        gapSize: 0.06,
        depthWrite: false,
      })
    );
    line.computeLineDistances();
    line.rotation.x = ((tiltDeg || 0) * Math.PI) / 180;
    line.rotation.z = 0.22;
    return line;
  }

  function makeLabelSprite(text, color) {
    var c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = '700 28px Space Grotesk, Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(20,80,180,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = color || '#d8ecff';
    ctx.fillText(text, 128, 32);
    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    var mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    var spr = new THREE.Sprite(mat);
    spr.scale.set(1.15, 0.29, 1);
    spr.userData.tex = tex;
    return spr;
  }

  function ensureCaption() {
    var el = $('sn-sky-caption');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    var st = $('sn-sky-caption-css');
    if (st && st.parentNode) st.parentNode.removeChild(st);
    return null;
  }

  function build() {
    var G = Globe();
    if (!G || !G.ready || !global.THREE) return false;
    var spin = G.getSpin && G.getSpin();
    if (!spin) return false;
    if (S.group) return true;

    var T = THREE;
    var g = new T.Group();
    g.name = 'sn-sky-bodies';

    S.sun = new T.Mesh(
      new T.SphereGeometry(0.62, 28, 28),
      new T.MeshBasicMaterial({ color: 0xffe566 })
    );
    S.sunGlow = new T.Mesh(
      new T.SphereGeometry(1.05, 20, 20),
      new T.MeshBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    var sunLabel = makeLabelSprite('SUN', '#ffe566');
    sunLabel.position.y = 0.95;
    S.sun.add(S.sunGlow);
    S.sun.add(sunLabel);
    S.sun.userData.id = 'sun';
    g.add(S.sun);

    S.moon = new T.Mesh(
      new T.SphereGeometry(0.272, 24, 24),
      new T.MeshPhongMaterial({ color: 0xc8c8cc, emissive: 0x111114, shininess: 4 })
    );
    try {
      var loader = new T.TextureLoader();
      loader.load(MOON_MAP, function (tex) {
        try {
          S.moon.material.map = tex;
          S.moon.material.color.set(0xffffff);
          S.moon.material.needsUpdate = true;
        } catch (_) {}
      });
    } catch (_) {}
    var moonLabel = makeLabelSprite('MOON', '#e8eef8');
    moonLabel.position.y = 0.48;
    moonLabel.scale.set(0.85, 0.22, 1);
    S.moon.add(moonLabel);
    S.moon.userData.id = 'moon';
    g.add(S.moon);
    S.moonOrbit = makeOrbitRing(1.62, 0x8899aa, 5.1);
    g.add(S.moonOrbit);

    S.astranov = new T.Group();
    S.astranov.name = 'sn-astranov-world';
    var core = new T.Mesh(
      new T.SphereGeometry(0.32, 28, 28),
      new T.MeshBasicMaterial({ color: 0x3d9eff })
    );
    var halo = new T.Mesh(
      new T.SphereGeometry(0.48, 20, 20),
      new T.MeshBasicMaterial({
        color: 0x7ec8ff,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      })
    );
    var ring = new T.Mesh(
      new T.TorusGeometry(0.58, 0.02, 10, 48),
      new T.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.92 })
    );
    ring.rotation.x = Math.PI / 2.35;
    var astLabel = makeLabelSprite('ASTRANOV', '#7ec8ff');
    astLabel.position.y = 0.78;
    astLabel.scale.set(1.55, 0.36, 1);
    S.astranov.add(core, halo, ring, astLabel);
    var hit = new T.Mesh(
      new T.SphereGeometry(0.72, 12, 12),
      new T.MeshBasicMaterial({
        visible: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
      })
    );
    hit.name = 'sn-astranov-hit';
    hit.userData.id = 'astranov';
    hit.userData.hit = true;
    S.astranov.add(hit);
    S.hit = hit;
    S.astranov.userData.id = 'astranov';
    S.astranov.userData.core = core;
    S.astranov.userData.ring = ring;
    S.astranov.visible = false;
    g.add(S.astranov);
    S.astOrbit = makeOrbitRing(4.28, 0x3d9eff, 18.2);
    S.astOrbit.visible = false;
    g.add(S.astOrbit);

    var eph = Eph() && Eph().PLANETS;
    if (eph) {
      eph.forEach(function (p) {
        if (p.id === 'earth') return;
        var m = new T.Mesh(
          new T.SphereGeometry(Math.max(0.09, p.r * 0.9), 16, 16),
          new T.MeshBasicMaterial({ color: p.color })
        );
        var lab = makeLabelSprite(p.name.toUpperCase(), '#b8d4ff');
        lab.position.y = Math.max(0.12, p.r * 0.7);
        lab.scale.set(0.95, 0.24, 1);
        m.add(lab);
        m.userData.id = p.id;
        g.add(m);
        S.planets[p.id] = m;
      });
    }

    spin.add(g);
    S.group = g;
    return true;
  }

  function place(mesh, lat, lng, r, show) {
    if (!mesh) return;
    var v = vecAt(lat, lng, r);
    mesh.position.set(v.x, v.y, v.z);
    if (show === false) mesh.visible = false;
    else if (show === true) mesh.visible = true;
  }

  function beyondMoonView() {
    var G = Globe();
    if (!G) return false;
    var z = 5.6;
    try {
      var cam = G.getCamera && G.getCamera();
      if (cam && cam.position) z = cam.position.z;
    } catch (_) {}
    var tier = '';
    try {
      tier = G.currentTier ? G.currentTier() : '';
    } catch (_) {}
    return tier === 'solar' || z >= 8.2;
  }

  function visOf(id, au) {
    var e = Eph();
    var base = e && e.visDistance ? e.visDistance(id, au) : 3;
    if (beyondMoonView()) return base;
    if (id === 'moon') return 1.62;
    if (id === 'astranov') return 4.28;
    if (id === 'sun') return 5.8;
    return base;
  }

  function apply(snap) {
    if (!S.group || !snap) return;
    place(S.sun, snap.sun.lat, snap.sun.lng, visOf('sun'), true);
    if (S.sun) S.sun.lookAt(0, 0, 0);
    place(S.moon, snap.moon.lat, snap.moon.lng, visOf('moon'), true);
    if (S.moon) {
      var k = 0.55 + snap.moon.phase * 0.55;
      S.moon.scale.setScalar(k > 0.7 ? 1 : 0.92 + snap.moon.phase * 0.12);
    }
    var deep = beyondMoonView();
    place(S.astranov, snap.astranov.lat, snap.astranov.lng, visOf('astranov'), deep);
    if (S.astranov && S.astranov.userData.ring) {
      S.astranov.userData.ring.rotation.z += 0.004;
    }
    var i;
    for (i = 0; i < snap.planets.length; i++) {
      var p = snap.planets[i];
      var m = S.planets[p.id];
      if (!m) continue;
      place(m, p.lat, p.lng, visOf(p.id, p.auFromEarth));
    }
    var G = Globe();
    var deep = beyondMoonView();
    Object.keys(S.planets).forEach(function (id) {
      var mesh = S.planets[id];
      if (mesh) mesh.visible = deep;
    });
    if (S.sun) S.sun.visible = true;
    if (S.sunGlow) S.sunGlow.visible = true;
    if (S.moon) S.moon.visible = true;
    if (S.moonOrbit) S.moonOrbit.visible = true;
    if (S.astranov) S.astranov.visible = !!deep;
    if (S.astOrbit) S.astOrbit.visible = !!deep;
    ensureCaption();
  }

  function projectAstranov() {
    try {
      if (!S.astranov || !global.THREE) return null;
      var G = Globe();
      if (!G || !G.getCamera || !G.getRenderer) return null;
      var cam = G.getCamera();
      var renderer = G.getRenderer();
      if (!cam || !renderer) return null;
      var world = new THREE.Vector3();
      S.astranov.getWorldPosition(world);
      var ndc = world.clone().project(cam);
      var rect = renderer.domElement.getBoundingClientRect();
      return {
        x: (ndc.x * 0.5 + 0.5) * rect.width + rect.left,
        y: (-ndc.y * 0.5 + 0.5) * rect.height + rect.top,
        z: ndc.z,
        on: ndc.z < 1 && Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95,
      };
    } catch (_) {
      return null;
    }
  }

  function faceAstranovIfNeeded() {
    if (!S.astranov) return;
    var G = Globe();
    if (!G || !G.getSpin || G.dragging) return;
    if (G.lastUserControl) return;
    try {
      var local = S.astranov.position;
      var spin = G.getSpin();
      var tilt = G.getTilt && G.getTilt();
      if (!spin) return;
      spin.rotation.y = -Math.atan2(local.x, local.z) + 0.55;
      if (tilt) tilt.rotation.x = 0.22;
      S.faced = true;
    } catch (_) {}
  }

  function hitTest(cx, cy) {
    try {
      if (!S.astranov || !S.astranov.visible || !beyondMoonView() || !global.THREE) return false;
      var G = Globe();
      if (!G || !G.getCamera || !G.getRenderer) return false;
      var cam = G.getCamera();
      var renderer = G.getRenderer();
      if (!cam || !renderer) return false;
      var rect = renderer.domElement.getBoundingClientRect();
      var x = ((cx - rect.left) / rect.width) * 2 - 1;
      var y = -((cy - rect.top) / rect.height) * 2 + 1;
      var ray = new THREE.Raycaster();
      ray.params.Sprite = { threshold: 0.4 };
      ray.setFromCamera(new THREE.Vector2(x, y), cam);
      var hits = ray.intersectObject(S.astranov, true);
      if (hits && hits.length) return true;
      var scr = projectAstranov();
      if (!scr || scr.z >= 1) return false;
      return Math.hypot(cx - scr.x, cy - scr.y) < 140;
    } catch (_) {
      return false;
    }
  }

  function tick() {
    if (!S.ready) return;
    var t = Date.now();
    if (t - S.lastTick < 480) {
      if (S.astranov && S.astranov.userData.ring) S.astranov.userData.ring.rotation.z += 0.003;
      return;
    }
    S.lastTick = t;
    if (!S.group) {
      if (!build()) return;
    }
    var e = Eph();
    if (!e) return;
    try {
      apply(e.now());
    } catch (_) {}
    try {
      var G = Globe();
      if (G && G.sunLight && e.now) {
        var sun = e.now().sun;
        var v = vecAt(sun.lat, sun.lng, 8);
        if (G.sunLight.position) G.sunLight.position.set(v.x, v.y, v.z);
      }
    } catch (_) {}
  }

  function report() {
    var e = Eph();
    if (!e) return null;
    return e.now();
  }

  function logSky() {
    var s = report();
    if (!s) return;
    function line(name, lat, lng, extra) {
      return (
        name +
        ' · ' +
        (lat >= 0 ? '+' : '') +
        lat.toFixed(1) +
        '° / ' +
        (lng >= 0 ? '+' : '') +
        lng.toFixed(1) +
        '°' +
        (extra ? ' · ' + extra : '')
      );
    }
    try {
      var log = global.SNCli && SNCli.log;
      if (!log) return;
      log('LIVE SKY · ' + s.date.slice(0, 19) + 'Z', 'ok');
      log(line('☉ Sun', s.sun.lat, s.sun.lng, s.sun.au.toFixed(3) + ' AU'), 'ok');
      log(
        line('☾ Moon', s.moon.lat, s.moon.lng, Math.round(s.moon.phase * 100) + '% · ' + s.moon.distEarthRadii.toFixed(1) + ' R⊕'),
        'ok'
      );
      log(
        line('◈ Astranov', s.astranov.lat, s.astranov.lng, 'orbit above Moon · ' + s.astranov.visR.toFixed(2) + ' R vis'),
        'ok'
      );
      s.planets.forEach(function (p) {
        log(line(p.name, p.lat, p.lng, p.auFromEarth.toFixed(2) + ' AU from Earth'), 'dim');
      });
    } catch (_) {}
  }

  function focusBody(id) {
    var s = report();
    if (!s) return false;
    var lat;
    var lng;
    var tier = 'global';
    id = String(id || '').toLowerCase();
    if (id === 'sun') {
      lat = s.sun.lat;
      lng = s.sun.lng;
      tier = 'solar';
    } else if (id === 'moon') {
      lat = s.moon.lat;
      lng = s.moon.lng;
      tier = 'global';
    } else if (id === 'astranov' || id === 'our planet' || id === 'collective') {
      lat = s.astranov.lat;
      lng = s.astranov.lng;
      tier = 'global';
    } else {
      var p = null;
      s.planets.forEach(function (x) {
        if (x.id === id || String(x.name).toLowerCase() === id) p = x;
      });
      if (!p) return false;
      lat = p.lat;
      lng = p.lng;
      tier = 'solar';
    }
    try {
      if (Globe() && Globe().goToPlace) {
        Globe().goToPlace(lat, lng, { tier: tier, openMap: false, label: id });
      } else if (Globe() && Globe().goToTier) {
        Globe().goToTier(tier);
      }
    } catch (_) {}
    return true;
  }

  function handleLine(raw) {
    var low = String(raw || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!low) return false;
    if (
      low === 'sky' ||
      low === 'planets' ||
      low === 'live sky' ||
      low === 'where is the moon' ||
      low === 'ephemeris'
    ) {
      logSky();
      try {
        if (Globe()) Globe().goToTier('solar');
      } catch (_) {}
      return true;
    }
    if (low === 'moon' || low === 'go to moon' || low === 'show moon') {
      focusBody('moon');
      logSky();
      return true;
    }
    if (low === 'sun' || low === 'go to sun' || low === 'show sun') {
      focusBody('sun');
      logSky();
      return true;
    }
    if (
      low === 'astranov planet' ||
      low === 'collective planet' ||
      low === 'our planet' ||
      low === 'show astranov'
    ) {
      focusBody('astranov');
      try {
        if (global.SNAgentOrbit && SNAgentOrbit.openPlanetSheet) SNAgentOrbit.openPlanetSheet();
      } catch (_) {}
      logSky();
      return true;
    }
    return false;
  }

  function init() {
    if (S.ready) return true;
    if (!build()) return false;
    S.ready = true;
    try {
      if (Globe() && Globe().onFrame) Globe().onFrame(tick);
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.run && !SNCli.__skyWrapped) {
        var prev = SNCli.run.bind(SNCli);
        SNCli.run = function (line) {
          if (handleLine(line)) return true;
          return prev(line);
        };
        SNCli.__skyWrapped = true;
      }
    } catch (_) {}
    tick();
    setTimeout(tick, 480);
    setTimeout(tick, 1600);
    return true;
  }

  function boot() {
    if (init()) return;
    setTimeout(boot, 280);
  }

  global.SNSkyBodies = {
    BUILD: BUILD,
    init: init,
    tick: tick,
    report: report,
    logSky: logSky,
    focusBody: focusBody,
    handleLine: handleLine,
    getGroup: function () {
      return S.group;
    },
    getAstranovGroup: function () {
      return S.astranov;
    },
    projectAstranov: projectAstranov,
    hitTest: hitTest,
    faceAstranovIfNeeded: faceAstranovIfNeeded,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 900);
  setTimeout(boot, 2400);
})(typeof window !== 'undefined' ? window : globalThis);
