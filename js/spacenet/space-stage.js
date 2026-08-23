/**
 * SNStage — SpaceNet space theater
 * Every live action is an ARC Connection: calls, research, orders.
 * Deep-blue great-circle glow + faces at the ends. No overlay cards.
 * Name: ARC Connections — never ARKT.
 */
(function (global) {
  'use strict';

  var ST = {
    arcs: [],
    faces: [],
    packets: [],
    hooked: false,
  };

  function three() {
    return global.THREE;
  }
  function globe() {
    return global.SNGlobe;
  }
  function here() {
    var p = global._snPhysPos || global._snLastPos;
    if (p && p.lat != null && !(Math.abs(p.lat - 36.4341) < 0.02 && Math.abs(p.lng - 28.2176) < 0.02 && p.source !== 'gps'))
      return { lat: Number(p.lat), lng: Number(p.lng), name: p.label || p.name || 'YOU' };
    return { lat: 36.387557, lng: 28.222533, name: 'KALITHEA' };
  }
  function vec(lat, lng, r) {
    var G = globe();
    if (G && G.latLngToVec) return G.latLngToVec(lat, lng, r);
    var T = three();
    if (!T) return null;
    r = r == null ? 1.02 : r;
    var phi = ((90 - lat) * Math.PI) / 180;
    var theta = ((lng + 180) * Math.PI) / 180;
    return new T.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }
  function pivot() {
    var G = globe();
    return (G && G.getPivot && G.getPivot()) || null;
  }

  function slerpPts(a, b, n, alt) {
    var T = three();
    var va = vec(a.lat, a.lng, 1);
    var vb = vec(b.lat, b.lng, 1);
    if (!va || !vb) return [];
    n = n || 48;
    alt = alt == null ? 1.028 : alt;
    var out = [];
    var i;
    for (i = 0; i <= n; i++) {
      var t = i / n;
      var p;
      if (T && va.clone && va.lerp) {
        p = va.clone().lerp(vb, t);
        if (p.length() < 0.001) p = va.clone();
        else p.normalize();
        var lift = alt + Math.sin(t * Math.PI) * 0.045;
        p.multiplyScalar(lift);
      } else {
        p = {
          x: va.x + (vb.x - va.x) * t,
          y: va.y + (vb.y - va.y) * t,
          z: va.z + (vb.z - va.z) * t,
        };
      }
      out.push(p);
    }
    return out;
  }

  function faceSprite(url, color) {
    var T = three();
    if (!T) return null;
    var c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    var cx = c.getContext('2d');
    cx.fillStyle = 'rgba(0,12,32,0.15)';
    cx.beginPath();
    cx.arc(48, 48, 44, 0, Math.PI * 2);
    cx.fill();
    cx.strokeStyle = color || '#5ec8ff';
    cx.lineWidth = 6;
    cx.stroke();
    var tex = new T.CanvasTexture(c);
    tex.needsUpdate = true;
    if (url && /^https?:/i.test(url)) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () {
        try {
          cx.save();
          cx.beginPath();
          cx.arc(48, 48, 40, 0, Math.PI * 2);
          cx.clip();
          cx.drawImage(im, 8, 8, 80, 80);
          cx.restore();
          cx.beginPath();
          cx.arc(48, 48, 44, 0, Math.PI * 2);
          cx.strokeStyle = color || '#5ec8ff';
          cx.lineWidth = 6;
          cx.stroke();
          tex.needsUpdate = true;
        } catch (_) {}
      };
      im.src = url;
    }
    var mat = new T.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    var sp = new T.Sprite(mat);
    sp.scale.set(0.09, 0.09, 0.09);
    return sp;
  }

  function myAvatar() {
    try {
      var me = global.SNProfiles && SNProfiles.me && SNProfiles.me();
      if (me && me.avatar && /^https?:/i.test(me.avatar)) return me.avatar;
      if (global.SNAuth && SNAuth.user && SNAuth.user.photoURL) return SNAuth.user.photoURL;
    } catch (_) {}
    return '';
  }

  function clearKind(kind) {
    var pv = pivot();
    ST.arcs = ST.arcs.filter(function (x) {
      if (kind && x.kind !== kind) return true;
      try {
        if (pv) {
          if (x.line) pv.remove(x.line);
          if (x.mesh) pv.remove(x.mesh);
        }
      } catch (_) {}
      return false;
    });
    ST.faces = ST.faces.filter(function (x) {
      if (kind && x.kind !== kind) return true;
      try {
        if (pv) pv.remove(x.sprite);
      } catch (_) {}
      return false;
    });
    if (kind) ST.packets = ST.packets.filter(function (p) { return p.kind !== kind; });
    else ST.packets = [];
  }

  var PRI = { route: 0, order: 1, scan: 2, research: 2, link: 2, call: 3, comm: 3 };

  function addArc(from, to, opts) {
    opts = opts || {};
    var T = three();
    var pv = pivot();
    if (!T || !pv || !from || !to) return null;
    var pri = opts.priority != null ? Number(opts.priority) : PRI[opts.kind] || 1;
    var alt = opts.alt != null ? opts.alt : 1.016 + pri * 0.014;
    var pts = slerpPts(from, to, opts.steps || 56, alt);
    if (pts.length < 2) return null;
    var verts = [];
    var vecs = [];
    pts.forEach(function (p) {
      verts.push(p.x, p.y, p.z);
      if (T.Vector3) vecs.push(new T.Vector3(p.x, p.y, p.z));
    });
    var col = opts.color != null ? opts.color : 0x14c3f3;
    var mesh = null;
    try {
      if (T.CatmullRomCurve3 && T.TubeGeometry && vecs.length > 2) {
        var curve = new T.CatmullRomCurve3(vecs);
        mesh = new T.Mesh(
          new T.TubeGeometry(curve, 48, 0.0035 + pri * 0.0018, 8, false),
          new T.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: opts.opacity != null ? opts.opacity : 0.55 + pri * 0.08,
            depthWrite: false,
          })
        );
        mesh.renderOrder = 12 + pri;
        pv.add(mesh);
      }
    } catch (_) {
      mesh = null;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    var mat = new T.LineBasicMaterial({
      color: col,
      transparent: true,
      opacity: opts.opacity != null ? opts.opacity : 0.95,
      linewidth: 2,
      depthWrite: false,
    });
    var line = new T.Line(geo, mat);
    line.renderOrder = 13 + pri;
    pv.add(line);
    ST.arcs.push({ line: line, mesh: mesh, kind: opts.kind || 'link', pts: pts, priority: pri });
    if (opts.packets !== false) {
      var i;
      for (i = 0; i < 3 + pri; i++) {
        ST.packets.push({
          pts: pts,
          t: i / (3 + pri),
          kind: opts.kind || 'link',
          speed: 0.003 + pri * 0.0015 + Math.random() * 0.002,
          mesh: null,
        });
      }
    }
    return { line: line, mesh: mesh, pts: pts, priority: pri };
  }

  function addFace(p, url, color, kind) {
    var pv = pivot();
    var v = vec(p.lat, p.lng, 1.055);
    var sp = faceSprite(url, color);
    if (!pv || !v || !sp) return;
    sp.position.copy(v);
    pv.add(sp);
    ST.faces.push({ sprite: sp, kind: kind || 'face' });
  }

  function frameBoth(a, b) {
    var G = globe();
    if (!G) return;
    var lat = (Number(a.lat) + Number(b.lat)) / 2;
    var lng = (Number(a.lng) + Number(b.lng)) / 2;
    var dlat = Math.abs(a.lat - b.lat);
    var dlng = Math.abs(a.lng - b.lng);
    if (dlng > 180) dlng = 360 - dlng;
    var span = Math.max(dlat, dlng);
    var tier = span > 40 ? 'global' : span > 12 ? 'national' : 'regional';
    try {
      if (G.flyNear) G.flyNear(lat, lng, tier);
      else if (G.goToPlace) G.goToPlace(lat, lng, { tier: tier, pulse: false, openMap: false });
    } catch (_) {}
  }

  function link(from, to, opts) {
    opts = opts || {};
    if (!from || !to || from.lat == null || to.lat == null) return null;
    if (!opts.append) clearKind(opts.kind || 'link');
    var arc = addArc(from, to, opts);
    if (opts.faces !== false) {
      addFace(from, opts.fromFace || myAvatar(), '#7ec8ff', opts.kind);
      addFace(to, opts.toFace || '', opts.faceColor || '#ffaa44', opts.kind);
    }
    try {
      var G = globe();
      if (G && G.pulse) {
        G.pulse(from.lat, from.lng, 0x14c3f3, String(from.name || 'YOU').slice(0, 14), 12000);
        G.pulse(to.lat, to.lng, opts.color || 0xffaa44, String(to.name || 'PEER').slice(0, 14), 12000);
      }
    } catch (_) {}
    if (opts.frame !== false) frameBoth(from, to);
    try {
      if (global.SNCli && SNCli.log)
        SNCli.log(
          'SPACE · ' +
            (opts.kind || 'link') +
            ' · ' +
            (from.name || 'here') +
            ' → ' +
            (to.name || 'there'),
          'ok'
        );
    } catch (_) {}
    return arc;
  }

  async function resolvePlace(q) {
    var s = String(q || '').trim();
    if (!s) return null;
    try {
      if (global.SNSearch && SNSearch.geocode) {
        var hits = await SNSearch.geocode(s);
        if (hits && hits[0] && hits[0].lat != null)
          return { lat: hits[0].lat, lng: hits[0].lng, name: hits[0].name || s };
      }
    } catch (_) {}
    var named = {
      africa: { lat: 1.2, lng: 17.8, name: 'Africa' },
      nairobi: { lat: -1.2921, lng: 36.8219, name: 'Nairobi' },
      lagos: { lat: 6.5244, lng: 3.3792, name: 'Lagos' },
      cairo: { lat: 30.0444, lng: 31.2357, name: 'Cairo' },
      johannesburg: { lat: -26.2041, lng: 28.0473, name: 'Johannesburg' },
      greece: { lat: 37.9838, lng: 23.7275, name: 'Greece' },
      rhodes: { lat: 36.4341, lng: 28.2176, name: 'Rhodes' },
    };
    var k = s.toLowerCase();
    if (named[k]) return named[k];
    return null;
  }

  async function call(peer, opts) {
    opts = opts || {};
    var from = here();
    var to = peer;
    if (!to || to.lat == null) to = await resolvePlace(opts.place || opts.label || peer);
    if (!to || to.lat == null) {
      var hq = global.SNVillage && SNVillage.HQ;
      to = hq
        ? { lat: hq.lat, lng: hq.lng, name: hq.short || 'KALITHEA' }
        : { lat: 36.387557, lng: 28.222533, name: opts.label || 'KALITHEA' };
    }
    to.name = to.name || opts.label || 'Peer';
    return link(from, to, {
      kind: 'call',
      color: 0x14c3f3,
      priority: 3,
      fromFace: myAvatar(),
      toFace: opts.avatar || '',
      faceColor: '#14c3f3',
    });
  }

  function order(shop, drop, opts) {
    opts = opts || {};
    if (!shop || shop.lat == null || !drop || drop.lat == null) return null;
    shop.name = shop.name || 'SHOP';
    drop.name = drop.name || 'YOU';
    var eta = opts.etaMin != null ? Number(opts.etaMin) : null;
    var stage = String(opts.stage || 'ORDER').toUpperCase();
    var item = String(opts.item || 'order').slice(0, 22);
    var arc = link(shop, drop, {
      kind: 'order',
      color: 0x1c8cff,
      priority: 1,
      fromFace: opts.shopFace || '',
      toFace: myAvatar(),
      faceColor: '#7ec8ff',
    });
    try {
      document.body.classList.add('sn-order-live');
    } catch (_) {}
    var hud =
      item +
      ' · ' +
      stage +
      (eta && isFinite(eta) ? ' · ' + Math.max(1, Math.round(eta)) + ' min' : '');
    try {
      if (globe() && globe().setHud) globe().setHud(hud);
    } catch (_) {}
    try {
      var chip = document.getElementById('sn-order-hud');
      if (!chip) {
        chip = document.createElement('div');
        chip.id = 'sn-order-hud';
        document.body.appendChild(chip);
      }
      chip.textContent = hud;
      chip.setAttribute('data-stage', stage);
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.log)
        SNCli.log('ARC · ' + shop.name + ' → YOU · ' + hud, 'ok', true);
    } catch (_) {}
    return arc;
  }

  function research(hits, opts) {
    opts = opts || {};
    hits = (hits || []).filter(function (h) {
      return h && h.lat != null && h.lng != null;
    });
    if (!hits.length) return;
    var from = here();
    clearKind('scan');
    hits.slice(0, 6).forEach(function (h, i) {
      addArc(from, h, { kind: 'scan', color: 0x14c3f3, opacity: 0.5, packets: i === 0, priority: 2 });
    });
    try {
      if (global.SNSearch && SNSearch.spinEarthToHits) SNSearch.spinEarthToHits(hits);
      else if (globe() && globe().goToPlace)
        globe().goToPlace(hits[0].lat, hits[0].lng, { tier: 'national', pulse: true, label: hits[0].name });
    } catch (_) {}
  }

  function scan(label) {
    try {
      var G = globe();
      if (G && G.setHud) G.setHud('SCAN · ' + String(label || 'space').slice(0, 28));
    } catch (_) {}
    try {
      if (global.SNHelper && SNHelper.wake)
        SNHelper.wake({ force: true, label: 'UNIT · SCAN', showcaseMs: 8000 });
    } catch (_) {}
  }

  function tick() {
    var T = three();
    var pv = pivot();
    if (!T || !pv) return;
    ST.packets.forEach(function (p) {
      if (!p.pts || p.pts.length < 2) return;
      p.t += p.speed;
      if (p.t > 1) p.t = 0;
      var i = Math.min(p.pts.length - 1, Math.floor(p.t * (p.pts.length - 1)));
      var pt = p.pts[i];
      if (!p.mesh) {
        p.mesh = new T.Mesh(
          new T.SphereGeometry(0.008, 8, 8),
          new T.MeshBasicMaterial({ color: 0xb8ecff, transparent: true, opacity: 0.95 })
        );
        pv.add(p.mesh);
      }
      p.mesh.position.set(pt.x, pt.y, pt.z);
    });
  }

  function hook() {
    if (ST.hooked) return;
    ST.hooked = true;
    try {
      if (globe() && globe().onFrame) globe().onFrame(tick);
    } catch (_) {}
    try {
      var W = global.SNWebRTC || global.SNWebrtc || global.SNRtc;
      if (W && W.startCall && !W._stageHooked) {
        W._stageHooked = true;
        var prev = W.startCall.bind(W);
        W.startCall = async function (order, opts) {
          opts = opts || {};
          try {
            await call(
              order && order.lat != null ? { lat: order.lat, lng: order.lng, name: order.vendorName } : null,
              { place: opts.place || opts.label || (order && (order.city || order.country)), label: opts.label }
            );
          } catch (_) {}
          return prev(order, opts);
        };
        var hang = W.hangup || W.end;
        if (typeof hang === 'function') {
          W.hangup = function () {
            clearKind('call');
            return hang.apply(W, arguments);
          };
        }
      }
    } catch (_) {}
  }

  function init() {
    hook();
    return true;
  }

  global.SNStage = {
    init: init,
    link: link,
    call: call,
    order: order,
    research: research,
    scan: scan,
    resolvePlace: resolvePlace,
    clear: function (k) {
      clearKind(k);
    },
    here: here,
    priority: PRI,
  };

  try {
    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
    setTimeout(init, 2500);
  } catch (_) {}
})(window);
