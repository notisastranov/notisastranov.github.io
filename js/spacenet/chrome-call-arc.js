/**
 * SpaceNet CALL = glowing great-circle on the live SNGlobe.
 * Build: 20260823000000-hud-twin
 *
 * Guest tap/type "call" → ONLY Google GIS sign-in.
 *   no u-xxxx room, no me-av avatar, no plaza fallback, no VIDEO CALL modal.
 * Signed-in → arc between me pin and them (or a demo peer pin).
 * CLI line: "Call name arc"
 * Camera may ease/rotate to frame the arc. Never teleport. Never pulse/flyGlobeTo/projectPin.
 * Twin-law chrome: HUD "Heads up display command line interface" · bottom "command line interface".
 * Dock 📞 aria-label: "Call · place or answer".
 */
(function (G) {
  'use strict';
  if (G.__snCallArc234500) return;
  G.__snCallArc234500 = 1;
  var BUILD = '20260823000000-hud-twin';
  var CALL_LABEL = 'Call · place or answer';

  var RHODES = { lat: 36.4341, lng: 28.2176 };
  var KALITHEA = { lat: 36.387557, lng: 28.222533 };
  var DEMO = { lat: 37.9838, lng: 23.7275, name: 'Athens' };

  var SEEDS = {
    athens: DEMO,
    greece: DEMO,
    tokyo: { lat: 35.6762, lng: 139.6503, name: 'Tokyo' },
    paris: { lat: 48.8566, lng: 2.3522, name: 'Paris' },
    london: { lat: 51.5074, lng: -0.1278, name: 'London' },
    'new york': { lat: 40.7128, lng: -74.006, name: 'New York' },
    nyc: { lat: 40.7128, lng: -74.006, name: 'New York' },
    lisbon: { lat: 38.7223, lng: -9.1393, name: 'Lisbon' },
    singapore: { lat: 1.3521, lng: 103.8198, name: 'Singapore' },
    nairobi: { lat: -1.2921, lng: 36.8219, name: 'Nairobi' },
    cairo: { lat: 30.0444, lng: 31.2357, name: 'Cairo' },
    dublin: { lat: 53.3498, lng: -6.2603, name: 'Dublin' },
  };

  var group = null;
  var live = false;
  var pending = null;
  var easing = false;

  function signed() {
    try {
      return !!(G.SNAuth && SNAuth.user);
    } catch (_) {
      return false;
    }
  }

  function log(m, c) {
    try {
      if (G.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 220), c || 'ok', true);
    } catch (_) {}
  }

  function near(p, q, d) {
    if (!p || !q || p.lat == null || q.lat == null) return false;
    d = d || 0.05;
    return Math.abs(Number(p.lat) - Number(q.lat)) < d && Math.abs(Number(p.lng) - Number(q.lng)) < d;
  }

  function isPlaza(p) {
    if (!p || p.lat == null) return true;
    if (near(p, RHODES, 0.06)) return true;
    if (near(p, KALITHEA, 0.06)) return true;
    return false;
  }

  function honestGps() {
    try {
      var p = G._snPhysPos;
      if (
        p &&
        p.lat != null &&
        isFinite(p.lat) &&
        isFinite(p.lng) &&
        (G._snLocatedThisSession || p.source === 'gps') &&
        !isPlaza(p)
      ) {
        return { lat: Number(p.lat), lng: Number(p.lng), name: 'YOU' };
      }
    } catch (_) {}
    return null;
  }

  function cameraLook() {
    try {
      if (G.SNGlobe && typeof SNGlobe.viewLatLng === 'function') {
        var v = SNGlobe.viewLatLng();
        if (v && v.lat != null && isFinite(v.lat) && isFinite(v.lng)) {
          return { lat: Number(v.lat), lng: Number(v.lng), name: 'YOU' };
        }
      }
    } catch (_) {}
    try {
      if (G.SNGlobe && typeof SNGlobe.focusPos === 'function') {
        var f = SNGlobe.focusPos();
        if (f && f.lat != null && isFinite(f.lat) && !isPlaza(f)) {
          return { lat: Number(f.lat), lng: Number(f.lng), name: 'YOU' };
        }
      }
    } catch (_) {}
    return null;
  }

  function mePos() {
    return honestGps() || cameraLook();
  }

  function livePeer() {
    var rows = [];
    try {
      if (G.SNMeshPeers && typeof SNMeshPeers.visible === 'function') rows = SNMeshPeers.visible() || [];
    } catch (_) {}
    try {
      if (!rows.length && G.SNMesh && SNMesh.peers) rows = SNMesh.peers() || [];
    } catch (_) {}
    var me = mePos();
    var i, p, lat, lng;
    for (i = 0; i < rows.length; i++) {
      p = rows[i];
      if (!p) continue;
      lat = p.lat != null ? p.lat : p.lon != null ? null : p.latitude;
      lng = p.lng != null ? p.lng : p.lon != null ? p.lon : p.longitude;
      if (lat == null || lng == null) continue;
      if (p.role === 'self') continue;
      if (me && near({ lat: lat, lng: lng }, me, 0.3)) continue;
      if (isPlaza({ lat: lat, lng: lng })) continue;
      return {
        lat: Number(lat),
        lng: Number(lng),
        name: p.name || p.city || p.label || 'Peer',
      };
    }
    return null;
  }

  function seedPlace(q) {
    var k = String(q || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!k) return null;
    if (SEEDS[k]) return { lat: SEEDS[k].lat, lng: SEEDS[k].lng, name: SEEDS[k].name };
    var keys = Object.keys(SEEDS);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (k.indexOf(keys[i]) >= 0) {
        var s = SEEDS[keys[i]];
        return { lat: s.lat, lng: s.lng, name: s.name };
      }
    }
    return null;
  }

  function themPos(want) {
    if (want && want.lat != null && isFinite(want.lat)) {
      return {
        lat: Number(want.lat),
        lng: Number(want.lng),
        name: want.name || want.label || 'Peer',
      };
    }
    if (want && want.name && !want.lat) {
      var named = seedPlace(want.name);
      if (named) return named;
    }
    var live = livePeer();
    if (live) return live;
    return { lat: DEMO.lat, lng: DEMO.lng, name: DEMO.name };
  }

  function killModal() {
    try {
      var layer = document.getElementById('sn-rtc-layer');
      if (layer) {
        layer.classList.remove('on', 'min', 'max');
        layer.style.setProperty('display', 'none', 'important');
        layer.style.setProperty('visibility', 'hidden', 'important');
        layer.style.setProperty('pointer-events', 'none', 'important');
      }
      var dial = document.getElementById('sn-rtc-dial');
      if (dial) dial.classList.remove('on');
    } catch (_) {}
  }

  function injectCss() {
    if (document.getElementById('sn-call-arc-css')) return;
    var st = document.createElement('style');
    st.id = 'sn-call-arc-css';
    st.textContent =
      '#sn-rtc-layer,#sn-rtc-layer.on,#sn-rtc-dial.on,#sn-rtc-box,' +
      '.sn-video-call-modal,.video-call-modal,[data-sn-video-call-modal]{' +
      'display:none!important;visibility:hidden!important;pointer-events:none!important;' +
      'opacity:0!important;height:0!important;width:0!important;overflow:hidden!important}';
    (document.head || document.documentElement).appendChild(st);
  }

  function promptGis() {
    killModal();
    pending = pending || { name: '' };
    try {
      if (G.SNAuth && typeof SNAuth.signInGoogleGis === 'function') {
        void SNAuth.signInGoogleGis().then(
          function () {
            if (signed()) paintCall(pending);
          },
          function () {}
        );
        return;
      }
    } catch (_) {}
    try {
      if (G.SNAuth && typeof SNAuth.signInGoogle === 'function') {
        void SNAuth.signInGoogle().then(
          function () {
            if (signed()) paintCall(pending);
          },
          function () {}
        );
        return;
      }
    } catch (_) {}
    try {
      if (G.SNAuth && typeof SNAuth.openModal === 'function') SNAuth.openModal('Sign in');
    } catch (_) {}
  }

  function host() {
    try {
      if (G.SNGlobe && SNGlobe.getEarth) {
        var e = SNGlobe.getEarth();
        if (e) return e;
      }
    } catch (_) {}
    try {
      if (G.SNGlobe && SNGlobe.getPivot) return SNGlobe.getPivot();
    } catch (_) {}
    return null;
  }

  function vec(lat, lng, r) {
    try {
      if (G.SNGlobe && SNGlobe.latLngToVec) return SNGlobe.latLngToVec(lat, lng, r);
    } catch (_) {}
    if (typeof THREE === 'undefined') return null;
    r = r == null ? 1 : r;
    var phi = ((90 - lat) * Math.PI) / 180;
    var theta = ((lng + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }

  function slerpPts(a, b, n) {
    var va = vec(a.lat, a.lng, 1);
    var vb = vec(b.lat, b.lng, 1);
    if (!va || !vb || typeof THREE === 'undefined') return [];
    va = va.clone().normalize();
    vb = vb.clone().normalize();
    var dot = Math.max(-1, Math.min(1, va.dot(vb)));
    var omega = Math.acos(dot);
    var out = [];
    var i, t, p, s0, s1, lift;
    for (i = 0; i <= n; i++) {
      t = i / n;
      if (omega < 1e-4) p = va.clone();
      else {
        s0 = Math.sin((1 - t) * omega) / Math.sin(omega);
        s1 = Math.sin(t * omega) / Math.sin(omega);
        p = va.clone().multiplyScalar(s0).add(vb.clone().multiplyScalar(s1)).normalize();
      }
      lift = 1.018 + Math.sin(t * Math.PI) * 0.055;
      p.multiplyScalar(lift);
      out.push(p);
    }
    return out;
  }

  function pinMesh(lat, lng, color, r) {
    var T = typeof THREE !== 'undefined' ? THREE : null;
    if (!T) return null;
    var p = vec(lat, lng, r == null ? 1.02 : r);
    if (!p) return null;
    var core = new T.Mesh(
      new T.SphereGeometry(0.012, 16, 16),
      new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.98, depthWrite: false })
    );
    core.position.copy(p);
    var halo = new T.Mesh(
      new T.SphereGeometry(0.022, 16, 16),
      new T.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
    );
    halo.position.copy(p);
    core.renderOrder = 21;
    halo.renderOrder = 20;
    return { core: core, halo: halo };
  }

  function clearArc() {
    if (!group) return;
    try {
      var parent = group.parent;
      if (parent) parent.remove(group);
      group.traverse(function (obj) {
        try {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        } catch (_) {}
      });
    } catch (_) {}
    group = null;
    live = false;
  }

  function unwrap(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function easeFrame(a, b) {
    var globe = G.SNGlobe;
    if (!globe || !globe.getSpin || !globe.getTilt) return;
    var spin = globe.getSpin();
    var tilt = globe.getTilt();
    if (!spin || !tilt) return;
    var midLat = (Number(a.lat) + Number(b.lat)) / 2;
    var dlng = Number(b.lng) - Number(a.lng);
    if (dlng > 180) dlng -= 360;
    if (dlng < -180) dlng += 360;
    var midLng = Number(a.lng) + dlng / 2;
    if (midLng > 180) midLng -= 360;
    if (midLng < -180) midLng += 360;
    var x1 = (-midLat * Math.PI) / 180;
    var y1 = (-midLng * Math.PI) / 180;
    if (x1 > 1.05) x1 = 1.05;
    if (x1 < -1.05) x1 = -1.05;
    var x0 = tilt.rotation.x;
    var y0 = spin.rotation.y;
    var dy = unwrap(y1 - y0);
    if (Math.abs(x1 - x0) < 0.02 && Math.abs(dy) < 0.02) return;
    easing = true;
    var t0 = Date.now();
    var dur = 880;
    function step() {
      var t = Math.min(1, (Date.now() - t0) / dur);
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      try {
        tilt.rotation.x = x0 + (x1 - x0) * e;
        spin.rotation.y = y0 + dy * e;
        if (globe.paint) globe.paint();
      } catch (_) {}
      if (t < 1) requestAnimationFrame(step);
      else easing = false;
    }
    requestAnimationFrame(step);
  }

  function drawArc(a, b) {
    var T = typeof THREE !== 'undefined' ? THREE : null;
    var earth = host();
    if (!T || !earth || !a || !b) return false;
    clearArc();
    var pts = slerpPts(a, b, 64);
    if (pts.length < 2) return false;
    group = new T.Group();
    group.name = 'sn-call-arc';
    var verts = [];
    var vecs = [];
    pts.forEach(function (p) {
      verts.push(p.x, p.y, p.z);
      vecs.push(p.clone ? p.clone() : new T.Vector3(p.x, p.y, p.z));
    });
    try {
      if (T.CatmullRomCurve3 && T.TubeGeometry && vecs.length > 3) {
        var tube = new T.Mesh(
          new T.TubeGeometry(new T.CatmullRomCurve3(vecs), 64, 0.0065, 10, false),
          new T.MeshBasicMaterial({
            color: 0x7ec8ff,
            transparent: true,
            opacity: 0.72,
            depthWrite: false,
          })
        );
        tube.renderOrder = 18;
        group.add(tube);
      }
    } catch (_) {}
    try {
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
      var line = new T.Line(
        geo,
        new T.LineBasicMaterial({
          color: 0xb8ecff,
          transparent: true,
          opacity: 0.98,
          depthWrite: false,
        })
      );
      line.renderOrder = 19;
      group.add(line);
    } catch (_) {}
    var pinA = pinMesh(a.lat, a.lng, 0x44ffaa, 1.022);
    var pinB = pinMesh(b.lat, b.lng, 0xffd080, 1.022);
    if (pinA) {
      group.add(pinA.core);
      group.add(pinA.halo);
    }
    if (pinB) {
      group.add(pinB.core);
      group.add(pinB.halo);
    }
    earth.add(group);
    try {
      if (earth.updateMatrixWorld) earth.updateMatrixWorld(true);
      if (G.SNGlobe && SNGlobe.paint) SNGlobe.paint();
    } catch (_) {}
    live = true;
    return true;
  }

  function stayGlobe() {
    try {
      if (G.SNMap && SNMap.active && typeof SNMap.close === 'function') SNMap.close();
    } catch (_) {}
  }

  function paintCall(opts) {
    opts = opts || {};
    stayGlobe();
    killModal();
    if (!signed()) {
      pending = { name: (opts && (opts.name || opts.label)) || '' };
      promptGis();
      return { ok: false, needAuth: true };
    }
    var a = mePos();
    if (!a) {
      log('Call · share location or keep Earth in view', 'dim');
      return { ok: false, error: 'no-me' };
    }
    var b = themPos(opts.peer || (opts.name ? { name: opts.name } : null));
    var name = String(b.name || opts.name || opts.label || 'name').trim() || 'name';
    var ok = drawArc(a, b);
    if (!ok) {
      setTimeout(function () {
        try {
          drawArc(a, b);
          easeFrame(a, b);
        } catch (_) {}
      }, 400);
    } else {
      easeFrame(a, b);
    }
    log('Call ' + name + ' arc', 'ok');
    pending = null;
    return { ok: true, spatial: true, name: name };
  }

  function dimCall() {
    if (!group) return;
    try {
      group.traverse(function (obj) {
        if (obj.material && obj.material.opacity != null) {
          obj.material.opacity = Math.min(obj.material.opacity, 0.22);
          if (obj.material.color) obj.material.color.setHex(0x4a6080);
        }
      });
      if (G.SNGlobe && SNGlobe.paint) SNGlobe.paint();
    } catch (_) {}
    setTimeout(clearArc, 1600);
  }

  function isCallIntent(raw) {
    var s = String(raw || '').trim();
    var low = s.toLowerCase();
    if (!low) return false;
    if (/^(call|phone|webrtc|rtc)\b/.test(low)) return true;
    if (/^video(\s*call)?$/.test(low)) return true;
    if (/^video\s+call\b/.test(low)) return true;
    return false;
  }

  function isHang(raw) {
    var low = String(raw || '')
      .trim()
      .toLowerCase();
    return /^(hang|hangup|end call|call end|call hang)/.test(low) || /\b(hang ?up|end call)\b/.test(low);
  }

  function placeFrom(raw) {
    var s = String(raw || '')
      .replace(/^(call|phone|webrtc|rtc|video(\s*call)?)\s+/i, '')
      .replace(/^(to|in|at)\s+/i, '')
      .trim();
    if (!s || /^(now|me|us|start|open|instant|video|audio)$/i.test(s)) return '';
    return s;
  }

  function handleCall(raw) {
    killModal();
    if (isHang(raw)) {
      dimCall();
      return true;
    }
    if (!isCallIntent(raw)) return false;
    var place = placeFrom(raw);
    if (!signed()) {
      pending = { name: place };
      promptGis();
      return true;
    }
    paintCall({ name: place, peer: place ? { name: place } : null });
    return true;
  }

  function patchWebRtc() {
    var W = G.SNWebRTC;
    if (!W || W.__snCallArc) return;
    W.__snCallArc = 1;

    W.canCall = function (order, opts) {
      opts = opts || {};
      if (!signed() && !opts.force) return { ok: false, reason: 'Sign in', needAuth: true };
      return { ok: true, reason: 'arc' };
    };

    function spatial(order, opts) {
      opts = opts || {};
      killModal();
      if (!signed()) {
        pending = { name: (opts && opts.label) || (order && (order.vendorName || order.clientName)) || '' };
        promptGis();
        return Promise.resolve({ ok: false, needAuth: true, spatial: true });
      }
      var peer = null;
      if (opts.peerLat != null && opts.peerLng != null) {
        peer = { lat: Number(opts.peerLat), lng: Number(opts.peerLng), name: opts.label || 'Peer' };
      } else if (order && (order.vendor_lat != null || order.lat != null)) {
        peer = {
          lat: Number(order.vendor_lat != null ? order.vendor_lat : order.lat),
          lng: Number(order.vendor_lng != null ? order.vendor_lng : order.lng),
          name: order.vendorName || order.clientName || opts.label || 'Peer',
        };
      } else if (opts.label) {
        peer = { name: opts.label };
      }
      var r = paintCall({ name: (peer && peer.name) || opts.label || '', peer: peer });
      return Promise.resolve(r);
    }

    W.startCall = spatial;
    W.startInstant = function (opts) {
      return spatial(null, opts || {});
    };
    W.openFromRibbon = function () {
      handleCall('call');
    };
    W.open = W.openFromRibbon;
    var prevHang = W.hangup && W.hangup.bind(W);
    W.hangup = function (silent) {
      dimCall();
      killModal();
      if (prevHang) {
        try {
          return prevHang(silent);
        } catch (_) {}
      }
    };
    var prevLine = W.handleLine && W.handleLine.bind(W);
    W.handleLine = function (raw) {
      if (handleCall(raw)) return true;
      if (prevLine) {
        try {
          var r = prevLine(raw);
          killModal();
          return r;
        } catch (_) {}
      }
      return false;
    };
  }

  function patchStage() {
    try {
      if (!G.SNStage || G.SNStage.__snCallArc) return;
      G.SNStage.__snCallArc = 1;
      var prevCall = G.SNStage.call && G.SNStage.call.bind(G.SNStage);
      G.SNStage.call = function (peer, opts) {
        opts = opts || {};
        var r = paintCall({
          name: (peer && peer.name) || opts.label || opts.place || '',
          peer: peer && peer.lat != null ? peer : opts.place ? { name: opts.place } : null,
        });
        return Promise.resolve(r);
      };
      var prevLink = G.SNStage.link && G.SNStage.link.bind(G.SNStage);
      G.SNStage.link = function (from, to, opts) {
        opts = opts || {};
        if (opts.kind === 'call') {
          return paintCall({
            name: (to && to.name) || 'name',
            peer: to,
          });
        }
        return prevLink ? prevLink(from, to, opts) : null;
      };
    } catch (_) {}
  }

  function installCli() {
    try {
      if (!G.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli.__snCallArcRun) return;
      SNCli.__snCallArcRun = 1;
      var prev = SNCli.run.bind(SNCli);
      SNCli.run = function (raw) {
        try {
          if (handleCall(raw)) return Promise.resolve(true);
        } catch (_) {}
        return prev(raw);
      };
    } catch (_) {}
  }

  function bindInputs() {
    function capture(ev, el) {
      var v = String((el && el.value) || '').trim();
      if (!v || (!isCallIntent(v) && !isHang(v))) return false;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      if (el) el.value = '';
      handleCall(v);
      return true;
    }
    try {
      var form = document.getElementById('cli-form');
      var input = document.getElementById('cli-in');
      if (form && input && !input._snCallArc) {
        input._snCallArc = 1;
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
      if (topIn && !topIn._snCallArc) {
        topIn._snCallArc = 1;
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

  function labelCallBtn() {
    try {
      var btn = document.getElementById('sn-rib-call');
      if (!btn) btn = document.querySelector('#sn-task-ribbon [data-act="call"]');
      if (!btn) return;
      btn.setAttribute('aria-label', CALL_LABEL);
      btn.setAttribute('title', CALL_LABEL);
    } catch (_) {}
  }

  function bindRibbon() {
    try {
      if (document._snCallArcClick) return;
      document._snCallArcClick = 1;
      document.addEventListener(
        'click',
        function (ev) {
          var t = ev.target;
          if (!t || !t.closest) return;
          var btn = t.closest('#sn-rib-call, [data-act="call"], [data-rtc], [data-dial]');
          if (!btn) return;
          var id = btn.id || '';
          var act = btn.getAttribute('data-act') || '';
          var rtc = btn.getAttribute('data-rtc') || '';
          var dial = btn.getAttribute('data-dial') || '';
          var isCall =
            id === 'sn-rib-call' ||
            act === 'call' ||
            dial === 'video' ||
            dial === 'audio' ||
            dial === 'instant' ||
            rtc === 'call';
          if (!isCall) return;
          try {
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          } catch (_) {}
          handleCall('call');
        },
        true
      );
    } catch (_) {}
  }

  function watchAuth() {
    if (G.__snCallArcAuth) return;
    G.__snCallArcAuth = 1;
    var last = signed();
    setInterval(function () {
      var now = signed();
      if (now && !last && pending) {
        var p = pending;
        pending = null;
        paintCall(p);
      }
      last = now;
      killModal();
    }, 700);
  }

  function tick() {
    injectCss();
    killModal();
    patchWebRtc();
    patchStage();
    installCli();
    bindInputs();
    bindRibbon();
    labelCallBtn();
  }

  function init() {
    injectCss();
    tick();
    watchAuth();
    setTimeout(tick, 0);
    setTimeout(tick, 400);
    setTimeout(tick, 1200);
    setTimeout(tick, 2800);
    setInterval(tick, 4000);
  }

  G.SNCallArc = {
    build: BUILD,
    paint: paintCall,
    clear: clearArc,
    dim: dimCall,
    handle: handleCall,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
