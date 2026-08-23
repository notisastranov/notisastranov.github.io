/**
 * SNHelper — Astranov SpaceX Bot (gaming-grade AI character)
 * ============================================================
 * Silver-wing guardian · AI sprite frames only · canvas juice
 * No procedural Atari mesh. Honors SpaceX pioneers + AI partner 1/3.
 * CLI: helper · helper patrol · helper find pizza · spacexbot · helper off
 * Drone: helper drone / commission Rai silver for polygon delivery (no human drivers)
 * Mechanical: window.SNHelper
 */
(function (global) {
  'use strict';

  var FRAME_URLS = [
    '/assets/sprites/spacex-bot/spacex-bot-1.png',
    '/assets/sprites/spacex-bot/spacex-bot-2.png',
    '/assets/sprites/spacex-bot/spacex-bot-3.png',
    '/assets/sprites/spacex-bot/spacex-bot-4.png',
  ];
  var HERO_URL = '/assets/brand/spacex-bot-hero.png';
  var HERO_FALLBACK = '/assets/brand/grokbot-512.png';
  var BUILD_Q = 'v=tiny20260816thrust';

  var H = {
    ready: false,
    visible: false,
    busy: false,
    mission: null,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    boost: 0,
    frame: 0,
    canvas: null,
    ctx: null,
    raf: 0,
    frames: [],
    hero: null,
    loaded: false,
    loadFailed: false,
    trail: [],
    sparks: [],
    stars: [],
    wingDust: [],
    ghosts: [],
    rings: [],
    label: 'UNIT · SILVER WINGS',
    status: 'idle',
    lastMissionAt: 0,
    _lastPaint: 0,
    _dpr: 1,
    scale: 1,
    forceVisible: false,
    autoWake: true,
    parkMode: true,
    showcaseUntil: 0,
    mindOn: false,
    mindLast: null,
  };

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
    } catch (_) {}
  }

  function chromaKeyMagenta(im) {
    try {
      var w = im.naturalWidth || im.width || 0;
      var h = im.naturalHeight || im.height || 0;
      if (w < 8 || h < 8) return im;
      var c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      var cx = c.getContext('2d');
      cx.drawImage(im, 0, 0);
      var data = cx.getImageData(0, 0, w, h);
      var p = data.data;
      var killed = 0;
      for (var i = 0; i < p.length; i += 4) {
        var r = p[i];
        var g = p[i + 1];
        var b = p[i + 2];
        var metal = Math.abs(r - g) < 38 && Math.abs(g - b) < 38;
        var pink = r > 150 && g < 100 && r - g > 70;
        var mag = r > 150 && b > 130 && g < 130 && Math.min(r, b) - g > 40;
        var hot = r > 200 && g < 80 && b > 80;
        if ((pink || mag || hot) && !metal) {
          p[i + 3] = 0;
          killed++;
        }
      }
      if (killed < 40) return im;
      cx.putImageData(data, 0, 0);
      return c;
    } catch (_) {
      return im;
    }
  }

  function loadImg(src) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.decoding = 'async';
      var url = src + (src.indexOf('?') >= 0 ? '&' : '?') + BUILD_Q;
      im.onload = function () {
        var done = function () {
          if (im.naturalWidth > 0) resolve(chromaKeyMagenta(im));
          else resolve(null);
        };
        if (im.decode) {
          im.decode().then(done).catch(done);
        } else done();
      };
      im.onerror = function () {
        resolve(null);
      };
      im.src = url;
    });
  }

  function ensureSprites() {
    if (H.loaded && H.frames.length && H.frames[0] && (H.frames[0].naturalWidth || H.frames[0].width)) {
      return Promise.resolve(true);
    }
    if (H._loading) return H._loading;
    H.loaded = false;
    H._loading = Promise.all(FRAME_URLS.map(loadImg)).then(function (imgs) {
      H.frames = imgs.filter(function (im) {
        return im && (im.naturalWidth > 0 || im.width > 0);
      });
      H.hero = H.frames[0] || null;
      H.loaded = H.frames.length > 0 || !!H.hero;
      H.loadFailed = !H.loaded;
      H._loading = null;
      if (!H.loaded) {
        try {
          log('SPACEX BOT · AI art missing · no procedural fallback', 'err');
        } catch (_) {}
      } else {
        try {
          log('UNIT · ' + H.frames.length + ' armor frames · ready', 'ok');
        } catch (_) {}
      }
      return H.loaded;
    });
    return H._loading;
  }

  function ensureCanvas() {
    if (H.canvas && document.body.contains(H.canvas)) return H.canvas;
    var c = document.createElement('canvas');
    c.id = 'sn-helper-canvas';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText =
      'position:fixed;inset:0;z-index:98;pointer-events:none;width:100%;height:100%;';
    document.body.appendChild(c);
    H.canvas = c;
    H.ctx = c.getContext('2d', { alpha: true });
    resize();
    bindHit();
    return c;
  }

  function bindHit() {
    var el = document.getElementById('sn-helper-hit');
    if (!el) {
      el = document.createElement('button');
      el.id = 'sn-helper-hit';
      el.type = 'button';
      el.setAttribute('aria-label', 'SpaceX Bot · tap to talk');
      el.title = 'Tap the unit · microphone on · it flies the result';
      el.style.cssText =
        'position:fixed;z-index:12080;width:80px;height:100px;margin:0;padding:0;border:0;background:transparent;cursor:pointer;touch-action:manipulation;';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        engage();
      });
      document.body.appendChild(el);
    }
    H.hit = el;
    placeHit();
  }

  function placeHit() {
    if (!H.hit) return;
    H.hit.style.left = Math.max(0, H.x - 40) + 'px';
    H.hit.style.top = Math.max(0, H.y - 52) + 'px';
    H.hit.style.display = H.visible === false ? 'none' : 'block';
  }

  function engage() {
    H.mindOn = true;
    wake({ force: true, label: 'UNIT · LISTENING', showcaseMs: 24000 });
    H.status = 'listening';
    try {
      if (global.SNCli && typeof SNCli.startListen === 'function') {
        if (!SNCli.handsfreeOn) SNCli.startListen();
      }
    } catch (e) {
      log('UNIT mic · ' + (e && e.message ? e.message : e), 'err');
    }
    speakDeep('Paid mind online. I am listening.');
    log('UNIT · paid mind armed · speak', 'ok');
    void (async function () {
      try {
        if (!global.SNLiveBridge || !SNLiveBridge.status) {
          log('UNIT · Grok Build bridge not loaded', 'err');
          return;
        }
        var st = await SNLiveBridge.status();
        if (st && st.ok) {
          log('UNIT · Grok Build bridge live', 'ok');
          speakDeep('Grok Build bridge is live.');
        } else {
          log('UNIT · Grok Build bridge weak · ' + (st && st.error ? st.error : 'no remote'), 'err');
          speakDeep('Grok Build channel is weak. I will still send notes.');
        }
      } catch (_) {}
    })();
    return true;
  }

  async function askMind(q, opts) {
    opts = opts || {};
    H.mindOn = true;
    wake({ force: true, label: 'UNIT · MIND', showcaseMs: 22000 });
    H.status = 'thinking';
    H.label = 'UNIT · MIND';
    var asked = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!asked) return '';
    log('UNIT · thinking · ' + asked.slice(0, 56), 'cmd');
    var text = '';
    var via = '';
    try {
      if (global.SNBrain && typeof SNBrain.think === 'function') {
        var br = await SNBrain.think(asked, { mode: 'chat' });
        if (br && br.paywall) {
          text = 'Paid mind is locked. Type plans.';
          via = 'paywall';
        } else if (br && br.ok && br.text) {
          text = String(br.text);
          via = br.via || 'grok-4.6';
        }
      } else if (global.SNSubscription && typeof SNSubscription.askPowerful === 'function') {
        var r = await SNSubscription.askPowerful(
          'You are the SpaceX Bot unit on Astranov SpaceNet. Answer out loud in at most two short sentences. English. No markdown. User said: ' +
            asked,
          { mode: 'chat', timeoutMs: 22000, model: 'grok-4.6', forcePaid: true }
        );
        if (r && r.paywall) {
          text = 'Paid mind is locked. Type plans.';
          via = 'paywall';
        } else if (r && r.ok && r.text) {
          text = String(r.text);
          via = r.via || (r.paid ? 'paid-grok' : 'mind');
        }
      }
    } catch (e) {
      log('UNIT mind · ' + (e && e.message ? e.message : e), 'err');
    }
    if (!text) text = 'I heard you. Paid mind did not answer. Try again.';
    text = text.replace(/\s+/g, ' ').trim().slice(0, 280);
    H.mindLast = { q: asked, text: text, via: via, t: Date.now() };
    H.label = 'UNIT · REPLY';
    H.status = 'speaking';
    log('UNIT · ' + text + (via ? ' · ' + via : ''), 'ok');
    speakDeep(text);
    try {
      var wantShip =
        /\b(grok build|send to grok|tell grok|handoff|diagnostic|fault|broken|cannot connect|fix this)\b/i.test(
          asked
        );
      if (wantShip && global.SNLiveBridge && SNLiveBridge.ownerNote) {
        void SNLiveBridge.ownerNote('[UNIT] ' + asked + ' → ' + text, { from: 'unit-mind' });
      } else if (wantShip && global.SNUsage && SNUsage.handoff) {
        SNUsage.handoff(asked + ' → ' + text, { from: 'unit-mind' });
      }
    } catch (_) {}
    return text;
  }

  function resize() {
    if (!H.canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    H.canvas.width = Math.floor(w * dpr);
    H.canvas.height = Math.floor(h * dpr);
    H.canvas.style.width = w + 'px';
    H.canvas.style.height = h + 'px';
    H._dpr = dpr;
    if (H.ctx) H.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function screenFromLatLng(lat, lng) {
    var w = window.innerWidth || 400;
    var h = window.innerHeight || 700;
    try {
      if (global.SNMap && SNMap.active && SNMap.latLngToContainerPoint) {
        var p = SNMap.latLngToContainerPoint(lat, lng);
        if (p && p.x != null) return { x: p.x, y: p.y };
      }
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.projectToScreen) {
        var s = SNGlobe.projectToScreen(lat, lng);
        if (s && s.x != null) return { x: s.x, y: s.y };
      }
    } catch (_) {}
    return {
      x: w * (0.5 + (Number(lng) || 0) / 360),
      y: h * (0.42 - (Number(lat) || 0) / 180),
    };
  }

  function emitSparks(n, power) {
    power = power || 1;
    var i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 0.7 + Math.random() * 2.8 * power;
      H.sparks.push({
        x: H.x + (Math.random() - 0.5) * 28,
        y: H.y + 12 + Math.random() * 14,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + 0.35,
        life: 0.5 + Math.random() * 0.6,
        a: 0.95,
        col: Math.random() > 0.4 ? 'cyan' : 'silver',
      });
    }
    if (H.sparks.length > 100) H.sparks = H.sparks.slice(-70);
  }

  function emitWingDust(n) {
    var i;
    for (i = 0; i < n; i++) {
      var side = Math.random() > 0.5 ? 1 : -1;
      H.wingDust.push({
        x: H.x + side * (36 + Math.random() * 28),
        y: H.y + (Math.random() - 0.5) * 22,
        vx: side * (0.2 + Math.random() * 0.6),
        vy: -0.3 - Math.random() * 0.8,
        life: 0.55 + Math.random() * 0.5,
        a: 0.7,
        r: 1.2 + Math.random() * 2.4,
      });
    }
    if (H.wingDust.length > 60) H.wingDust = H.wingDust.slice(-45);
  }

  function pushRing() {
    H.rings.push({ x: H.x, y: H.y + 8, r: 10, a: 0.55, grow: 1.8 + H.boost });
    if (H.rings.length > 6) H.rings.shift();
  }

  function wake(opts) {
    opts = opts || {};
    ensureSprites();
    ensureCanvas();
    H.visible = true;
    H.forceVisible = opts.force !== false;
    H.parkMode = false;
    H.label = opts.label || 'UNIT · SILVER WINGS';
    if (opts.showcaseMs) H.showcaseUntil = Date.now() + opts.showcaseMs;
    if (H.canvas) {
      H.canvas.style.opacity = '1';
      H.canvas.style.transition = 'opacity .35s ease';
    }
    if (H.x === 0 && H.y === 0) {
      H.x = (window.innerWidth || 400) * 0.7;
      H.y = (window.innerHeight || 700) * 0.32;
    }
    if (!H.raf) H.raf = requestAnimationFrame(loop);
    emitSparks(10, 1);
    emitWingDust(6);
    pushRing();
    return true;
  }

  function sleep() {
    H.visible = false;
    H.forceVisible = false;
    H.busy = false;
    H.mission = null;
    H.status = 'idle';
    H.parkMode = true;
    H.showcaseUntil = 0;
    if (H.hit) H.hit.style.display = 'none';
    if (H.ctx && H.canvas) {
      var w = window.innerWidth || 1;
      var h = window.innerHeight || 1;
      H.ctx.clearRect(0, 0, w, h);
    }
  }

  function parkAtMoon() {
    // Keep presence on globe — gaming-visible moon perch (not a tiny speck)
    H.mission = { kind: 'park', label: 'PARKED · ORBIT', status: 'parked' };
    H.label = 'UNIT · SILVER WINGS';
    H.status = 'parked';
    H.busy = false;
    H.boost = 0.22;
    H.parkMode = true;
    var w = window.innerWidth || 360;
    var h = window.innerHeight || 640;
    // upper-right safe perch — full body stays in frame under top chrome
    H.tx = Math.min(w * 0.84, w - 48);
    H.ty = Math.max(h * 0.52, 160);
    H.ty = Math.min(H.ty, h - 170);
    if (!H.forceVisible && Date.now() > (H.showcaseUntil || 0)) {
      H.x = H.tx;
      H.y = H.ty;
    } else {
      // soft drift toward park
      H.tx = H.tx;
      H.ty = H.ty;
    }
    var show = true;
    H.visible = true;
    if (H.canvas) H.canvas.style.opacity = '1';
    ensureCanvas();
    if (!H.raf) H.raf = requestAnimationFrame(loop);
    placeHit();
    return { ok: true, parked: true, visible: true };
  }

  function syncParkVisibility() {
    if (H.busy && H.mission && H.mission.kind !== 'park') return;
    if (
      !H.forceVisible &&
      (H.status === 'idle' || H.status === 'parked' || !H.mission || H.mission.kind === 'park')
    ) {
      parkAtMoon();
    }
  }

  function flyTo(target, opts) {
    opts = opts || {};
    wake(opts);
    H.busy = true;
    H.status = opts.status || 'en route';
    H.mission = {
      kind: opts.kind || 'fly',
      label: opts.label || 'SPACEX BOT',
      detail: opts.detail || '',
      t0: performance.now(),
      dur: opts.dur || 2600,
      onArrive: opts.onArrive || null,
    };
    H.label = H.mission.label;
    var w = window.innerWidth || 400;
    var h = window.innerHeight || 700;
    if (target && target.lat != null) {
      var scr = screenFromLatLng(target.lat, target.lng);
      H.tx = scr.x;
      H.ty = scr.y;
    } else if (target && target.x != null) {
      H.tx = target.x;
      H.ty = target.y;
    } else {
      H.tx = w * 0.5;
      H.ty = h * 0.35;
    }
    H.boost = 1.25;
    H.lastMissionAt = Date.now();
    emitSparks(14, 1.3);
    emitWingDust(8);
    pushRing();
    if (opts.log !== false) {
      log(
        'SPACEX BOT · silver wings · ' +
          (opts.detail || opts.kind || 'mission') +
          (target && target.lat != null
            ? ' · ' + Number(target.lat).toFixed(3) + ',' + Number(target.lng).toFixed(3)
            : ''),
        'ok'
      );
    }
    return H.mission;
  }

  function speakDeep(text) {
    var line = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!line) return;
    try {
      if (global.SNCli && SNCli.log) SNCli.log('UNIT · ' + line, 'ok');
    } catch (_) {}
    try {
      var synth = global.speechSynthesis;
      if (!synth || !global.SpeechSynthesisUtterance) return;
      var voices = [];
      try {
        voices = synth.getVoices() || [];
      } catch (_) {}
      var u = new SpeechSynthesisUtterance(line);
      u.rate = 0.76;
      u.pitch = 0.48;
      u.volume = 1;
      u.lang = 'en-GB';
      var deep =
        voices.filter(function (v) {
          return /daniel|david|mark|george|ravi|google uk english male|microsoft david|en-gb.*male|male/i.test(
            v.name + ' ' + (v.lang || '')
          );
        })[0] ||
        voices.filter(function (v) {
          return /^en/i.test(v.lang || '');
        })[0];
      if (deep) {
        u.voice = deep;
        if (deep.lang) u.lang = deep.lang;
      }
      try {
        synth.cancel();
      } catch (_) {}
      synth.speak(u);
    } catch (_) {}
  }

  var TAP_LINES = [
    'On your mark. Moving.',
    'Vector locked. I am coming.',
    'Copy. Flying to contact.',
    'Acknowledged. Closing now.',
    'Target acquired. Engaging.',
    'Roger. On intercept.',
  ];

  function followTap(lat, lng, screen) {
    wake({ force: true, label: 'UNIT · VECTOR', showcaseMs: 12000 });
    var target = screen && screen.x != null ? { x: screen.x, y: screen.y } : { lat: lat, lng: lng };
    flyTo(target, {
      kind: 'follow',
      label: 'UNIT · VECTOR',
      detail: 'on your mark',
      status: 'intercept',
      dur: 1600,
      log: false,
      onArrive: function () {
        H.label = 'UNIT · LOCKED';
        H.status = 'on point';
      },
    });
    speakDeep(TAP_LINES[Math.floor(Math.random() * TAP_LINES.length)]);
    return true;
  }

  function find(what, pos, opts) {
    opts = opts || {};
    var label = String(what || 'target').slice(0, 28);
    return flyTo(pos || global._snLastPos || { lat: 36.4341, lng: 28.2176 }, {
      kind: 'find',
      label: 'FIND · ' + label,
      detail: 'scanning for ' + label,
      status: 'scanning',
      dur: opts.dur || 3000,
      onArrive: opts.onArrive,
      log: opts.log,
    });
  }

  function assistTask(task, opts) {
    opts = opts || {};
    var t = task || {};
    var pos = {
      lat: t.lat != null ? t.lat : (global._snLastPos && global._snLastPos.lat) || 36.4341,
      lng: t.lng != null ? t.lng : (global._snLastPos && global._snLastPos.lng) || 28.2176,
    };
    return flyTo(pos, {
      kind: 'task',
      label: 'TASK · ' + String(t.title || t.kind || 'job').slice(0, 22),
      detail: t.title || 'task assist',
      status: 'task assist',
      dur: opts.dur || 3400,
      onArrive: opts.onArrive,
    });
  }

  /**
   * Rai silver robot — DRONE MODE courier.
   * Flies vendor pickup → drop along the polygon when no human drivers.
   * Payments settle via offer-stack complete path.
   */
  function droneDeliver(orderOrTask, opts) {
    opts = opts || {};
    var t = orderOrTask || {};
    var vendor = {
      lat: t.lat != null ? Number(t.lat) : null,
      lng: t.lng != null ? Number(t.lng) : null,
    };
    var drop = {
      lat: t.drop_lat != null ? Number(t.drop_lat) : vendor.lat,
      lng: t.drop_lng != null ? Number(t.drop_lng) : vendor.lng,
    };
    try {
      ensureSprites();
    } catch (_) {}
    wake({
      label: opts.label || 'RAI · DRONE MODE',
      force: true,
      showcaseMs: 90000,
    });
    H.forceVisible = true;
    H.visible = true;
    H.label = 'RAI · DRONE';
    H.status = 'drone mode';
    H.parkMode = false;
    H.boost = 1.55;
    try {
      ensureCanvas();
      if (!H.raf) H.raf = requestAnimationFrame(loop);
      if (H.canvas) H.canvas.style.opacity = '1';
    } catch (_) {}
    // Pulse globe at vendor so path is obvious
    try {
      if (vendor.lat != null && global.SNGlobe && SNGlobe.pulse) {
        SNGlobe.pulse(vendor.lat, vendor.lng, 0x3dffc0, 'RAI · PICKUP', 12000);
      }
    } catch (_) {}
    emitSparks(18, 1.4);
    emitWingDust(10);
    pushRing();
    log(
      'Rai silver · DRONE MODE · ' +
        String(t.title || t.menuItem || 'delivery').slice(0, 36) +
        (vendor.lat != null
          ? ' · ' + vendor.lat.toFixed(3) + ',' + vendor.lng.toFixed(3)
          : ''),
      'ok'
    );
    // Phase 1: fly to vendor (pickup)
    var pickup = vendor.lat != null ? vendor : global._snLastPos || { lat: 36.4341, lng: 28.2176 };
    flyTo(pickup, {
      kind: 'drone',
      label: 'RAI · PICKUP',
      detail: 'drone pickup · ' + String(t.vendorName || t.title || 'shop').slice(0, 24),
      status: 'drone pickup',
      dur: opts.pickupDur || 2800,
      log: true,
      onArrive: function () {
        H.status = 'drone loaded';
        H.label = 'RAI · LOADED';
        emitSparks(12, 1.1);
        pushRing();
        if (typeof opts.onProgress === 'function') {
          try {
            opts.onProgress({ phase: 'pickup', task: t });
          } catch (_) {}
        }
        // Phase 2: polygon run to drop
        var dest =
          drop.lat != null
            ? drop
            : global._snLastPos || { lat: 36.4341, lng: 28.2176 };
        setTimeout(function () {
          flyTo(dest, {
            kind: 'drone',
            label: 'RAI · DELIVER',
            detail: 'polygon drone run',
            status: 'drone en route',
            dur: opts.dropDur || 4800,
            log: true,
            onArrive: function () {
              H.status = 'drone delivered';
              H.label = 'RAI · DELIVERED';
              H.boost = 0.4;
              emitSparks(22, 1.5);
              emitWingDust(14);
              pushRing();
              try {
                if (dest.lat != null && global.SNGlobe && SNGlobe.pulse) {
                  SNGlobe.pulse(dest.lat, dest.lng, 0xffd24a, 'RAI · DROP', 10000);
                }
              } catch (_) {}
              log('Rai silver · delivered · need 3× confirm then settle', 'ok');
              if (typeof opts.onProgress === 'function') {
                try {
                  opts.onProgress({ phase: 'delivered', task: t });
                } catch (_) {}
              }
              if (typeof opts.onComplete === 'function') {
                try {
                  opts.onComplete({ ok: true, task: t, courier: 'rai-drone' });
                } catch (_) {}
              }
              setTimeout(function () {
                try {
                  if (!H.busy) parkAtMoon();
                } catch (_) {}
              }, 3200);
            },
          });
        }, 380);
      },
    });
    return {
      ok: true,
      mode: 'drone',
      courier: 'rai',
      label: 'RAI · DRONE MODE',
      taskId: t.id || null,
    };
  }

  function escortOrder(orderOrTask, opts) {
    opts = opts || {};
    var t = orderOrTask || {};
    var drop = {
      lat: t.drop_lat != null ? t.drop_lat : t.lat,
      lng: t.drop_lng != null ? t.drop_lng : t.lng,
    };
    wake({ label: 'SPACEX BOT · ESCORT', force: true, showcaseMs: 20000 });
    return flyTo(drop.lat != null ? drop : global._snLastPos, {
      kind: 'escort',
      label: 'ESCORT · DELIVERY',
      detail: t.title || 'order escort',
      status: 'escort',
      dur: opts.dur || 4000,
      log: true,
    });
  }

  function patrol(opts) {
    opts = opts || {};
    wake({ label: 'SPACEX BOT · PATROL', force: true, showcaseMs: 28000 });
    var w = window.innerWidth || 400;
    var h = window.innerHeight || 700;
    var corners = [
      { x: w * 0.2, y: h * 0.24 },
      { x: w * 0.78, y: h * 0.28 },
      { x: w * 0.68, y: h * 0.55 },
      { x: w * 0.24, y: h * 0.5 },
      { x: w * 0.52, y: h * 0.3 },
    ];
    var i = 0;
    function next() {
      if (i >= corners.length) {
        H.busy = false;
        H.status = 'standby';
        H.label = 'UNIT · SILVER WINGS';
        emitSparks(18, 1.2);
        emitWingDust(12);
        pushRing();
        setTimeout(function () {
          try {
            parkAtMoon();
          } catch (_) {}
        }, 2200);
        return;
      }
      var p = corners[i++];
      flyTo(p, {
        kind: 'patrol',
        label: 'PATROL · WINGS',
        detail: 'sector sweep',
        status: 'patrol',
        dur: 1500,
        log: false,
        onArrive: next,
      });
    }
    log('SPACEX BOT · silver-wing patrol · gaming character', 'ok');
    next();
  }

  function showcase(opts) {
    opts = opts || {};
    wake({
      label: opts.label || 'SPACEX BOT · SILVER WINGS',
      force: true,
      showcaseMs: opts.ms || 14000,
    });
    var w = window.innerWidth || 400;
    var h = window.innerHeight || 700;
    H.x = w * 0.12;
    H.y = h * 0.42;
    return flyTo(
      { x: w * 0.52, y: h * 0.34 },
      {
        kind: 'showcase',
        label: 'SPACEX BOT · SILVER WINGS',
        detail: 'gaming intro',
        status: 'online',
        dur: opts.dur || 2400,
        log: true,
        onArrive: function () {
          emitSparks(22, 1.5);
          emitWingDust(14);
          pushRing();
          setTimeout(function () {
            try {
              if (!H.busy) parkAtMoon();
            } catch (_) {}
          }, opts.hold || 4200);
        },
      }
    );
  }

  function currentFrame(now) {
    if (!H.frames.length) return H.hero;
    var n = H.frames.length;
    if (H.boost > 0.55 || (H.busy && H.status !== 'arrived')) {
      // flight / boost — frames 2-4 (flare + boost + escort)
      var i = 1 + (Math.floor(now / 110) % Math.max(1, n - 1));
      return H.frames[Math.min(i, n - 1)];
    }
    if (H.status === 'scanning' || H.status === 'patrol') {
      return H.frames[Math.floor(now / 160) % n];
    }
    // idle hover — alternate stand + wing flare
    var j = Math.floor(now / 320) % Math.min(2, n);
    return H.frames[j];
  }

  function loop(now) {
    if (!H.visible) {
      H.raf = 0;
      return;
    }
    H.raf = requestAnimationFrame(loop);
    if (!H.ctx) return;
    if (document.hidden) return;
    // ~50fps game feel
    if (H._lastPaint && now - H._lastPaint < 18) return;
    H._lastPaint = now;

    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    var ctx = H.ctx;
    ctx.clearRect(0, 0, w, h);

    // Motion — spring + damper, dt seconds (not per-frame lerp)
    var dt = H._physT ? (now - H._physT) / 1000 : 0.016;
    H._physT = now;
    if (dt > 0.033) dt = 0.033;
    if (H.busy && H.mission) {
      var dx = H.tx - H.x;
      var dy = H.ty - H.y;
      var k = 20;
      var dmp = 8.5;
      H.vx += (k * dx - dmp * H.vx) * dt;
      H.vy += (k * dy - dmp * H.vy) * dt;
      H.x += H.vx * dt;
      H.y += H.vy * dt;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var spd = Math.sqrt(H.vx * H.vx + H.vy * H.vy);
      H.angle = Math.atan2(H.vy, H.vx);
      H.boost = Math.min(1.7, 0.2 + spd / 420);
      if (H.frame % 3 === 0) emitSparks(1, 0.45);
      if (dist < 16 && spd < 40) {
        H.x = H.tx;
        H.y = H.ty;
        H.vx *= 0.4;
        H.vy *= 0.4;
        H.boost *= 0.84;
        var elapsed = now - H.mission.t0;
        if (elapsed > (H.mission.dur || 2000) * 0.45) {
          var arrive = H.mission.onArrive;
          H.mission.onArrive = null;
          H.busy = false;
          H.status = 'arrived';
          H.label = H.label
            .replace(/^FIND · /, 'FOUND · ')
            .replace(/^TASK · /, 'ON · ')
            .replace(/^ESCORT · /, 'ESCORT OK · ');
          H.boost = 0.28;
          emitSparks(18, 1.5);
          pushRing();
          if (typeof arrive === 'function') {
            try {
              arrive();
            } catch (_) {}
          }
        }
      }
    } else {
      // gaming idle float + soft park seek
      H.y += Math.sin(now * 0.0034) * 0.42;
      H.x += Math.cos(now * 0.0022) * 0.2;
      if (H.parkMode && H.tx) {
        H.x += (H.tx - H.x) * 0.02;
        H.y += (H.ty - H.y) * 0.02;
      }
      H.angle *= 0.88;
      H.boost *= 0.95;
    }

    H.frame++;
    placeHit();

    // Energy rings
    var i, rg;
    for (i = H.rings.length - 1; i >= 0; i--) {
      var ring = H.rings[i];
      ring.r += ring.grow;
      ring.a *= 0.92;
      if (ring.a < 0.04) {
        H.rings.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(80,170,255,' + ring.a + ')';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(40,120,255,0.6)';
      ctx.shadowBlur = 8;
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Thruster trail — neon ribbon + starfield
    H.trail.push({ x: H.x, y: H.y + 18, a: 1, boost: H.boost });
    if (H.trail.length > 36) H.trail.shift();
    if (H.boost > 0.12 || H.busy) {
      var si;
      for (si = 0; si < 4; si++) {
        H.stars.push({
          x: H.x + (Math.random() - 0.5) * 16,
          y: H.y + 16 + Math.random() * 12,
          vx: -H.vx * 0.015 + (Math.random() - 0.5) * 1.1,
          vy: 1.6 + Math.random() * 2.8,
          a: 0.95,
          r: 0.5 + Math.random() * 1.8,
          tw: Math.random() * Math.PI,
        });
      }
    }
    if (H.stars.length > 90) H.stars.splice(0, H.stars.length - 90);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (H.trail.length > 2) {
      ctx.beginPath();
      ctx.moveTo(H.trail[0].x, H.trail[0].y);
      for (i = 1; i < H.trail.length; i++) {
        var midX = (H.trail[i - 1].x + H.trail[i].x) / 2;
        var midY = (H.trail[i - 1].y + H.trail[i].y) / 2;
        ctx.quadraticCurveTo(H.trail[i - 1].x, H.trail[i - 1].y, midX, midY);
      }
      ctx.strokeStyle = 'rgba(40,160,255,0.22)';
      ctx.lineWidth = 14 + H.boost * 10;
      ctx.shadowColor = 'rgba(40,140,255,0.85)';
      ctx.shadowBlur = 22;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(H.trail[0].x, H.trail[0].y);
      for (i = 1; i < H.trail.length; i++) {
        ctx.lineTo(H.trail[i].x, H.trail[i].y);
      }
      ctx.strokeStyle = 'rgba(180,230,255,0.55)';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 12;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (i = 0; i < H.trail.length; i++) {
      var tr = H.trail[i];
      tr.a *= 0.9;
      tr.y += 0.55;
      var rad = 5 + i * 0.35 + tr.boost * 6;
      rg = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, rad);
      rg.addColorStop(0, 'rgba(210,240,255,' + tr.a * 0.7 + ')');
      rg.addColorStop(0.35, 'rgba(30,140,255,' + tr.a * 0.45 + ')');
      rg.addColorStop(1, 'rgba(0,30,90,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    for (i = H.stars.length - 1; i >= 0; i--) {
      var st = H.stars[i];
      st.x += st.vx;
      st.y += st.vy;
      st.a *= 0.94;
      st.tw += 0.35;
      if (st.a < 0.06) {
        H.stars.splice(i, 1);
        continue;
      }
      var tw = 0.55 + Math.abs(Math.sin(st.tw)) * 0.45;
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.rotate(st.tw * 0.25);
      ctx.globalAlpha = st.a * tw;
      ctx.fillStyle = '#9ad4ff';
      ctx.shadowColor = '#3d9eff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, -st.r * 2.2);
      ctx.lineTo(st.r * 0.45, 0);
      ctx.lineTo(0, st.r * 2.2);
      ctx.lineTo(-st.r * 0.45, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-st.r * 2.2, 0);
      ctx.lineTo(0, st.r * 0.45);
      ctx.lineTo(st.r * 2.2, 0);
      ctx.lineTo(0, -st.r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Sparks
    for (i = H.sparks.length - 1; i >= 0; i--) {
      var sp = H.sparks[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vy += 0.045;
      sp.life -= 0.028;
      sp.a *= 0.92;
      if (sp.life <= 0 || sp.a < 0.05) {
        H.sparks.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle =
        sp.col === 'cyan'
          ? 'rgba(80,220,255,' + sp.a + ')'
          : 'rgba(230,240,255,' + sp.a + ')';
      ctx.arc(sp.x, sp.y, 1.5 + sp.life * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    H.ghosts = [];

    // AI character bitmap
    var img = currentFrame(now);
    if (!img && H.hero) img = H.hero;
    if (img && !(img.naturalWidth || img.width)) {
      img = H.hero && (H.hero.naturalWidth || H.hero.width) ? H.hero : null;
      if (!img && !H._reloadKick) {
        H._reloadKick = true;
        ensureSprites().then(function () {
          H._reloadKick = false;
        });
      }
    }
    if (img && (img.naturalWidth || img.width)) {
      ctx.save();
      ctx.translate(H.x, H.y);
      ctx.rotate(H.angle * 0.24);
      var breath = 1 + Math.sin(now * 0.0045) * 0.04;
      var parkScale = H.parkMode && !H.busy ? 0.36 : 0.62;
      var scale = (H.busy ? 1.04 : 1) * H.scale * breath * parkScale;
      if (H.boost > 0.6) scale *= 1.03;
      var bw = 52 * scale;
      var bh = 52 * scale;
      // dual bloom: electric blue rim under body
      var bloom = ctx.createRadialGradient(0, 18, 6, 0, 18, bw * 0.48);
      bloom.addColorStop(0, 'rgba(60,140,255,0.28)');
      bloom.addColorStop(0.45, 'rgba(40,100,220,0.12)');
      bloom.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(0, 20, bw * 0.42, 0, Math.PI * 2);
      ctx.fill();
      // silver ground shadow
      ctx.fillStyle = 'rgba(0,10,30,0.32)';
      ctx.beginPath();
      ctx.ellipse(0, bh * 0.44, bw * 0.3, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Clean chrome draw — no additive wash
      ctx.shadowColor = 'rgba(220,230,240,0.45)';
      ctx.shadowBlur = 16;
      ctx.drawImage(img, -bw / 2, -bh / 2 - 12, bw, bh);
      ctx.shadowBlur = 0;
      // metal wing gleam — plate, not ghost
      if (H.boost > 0.08 || H.busy || H.parkMode) {
        var gleam = 0.1 + Math.sin(now * 0.006) * 0.05 + H.boost * 0.08;
        ctx.strokeStyle = 'rgba(210,220,230,' + gleam + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-bw * 0.42, -bh * 0.06);
        ctx.quadraticCurveTo(-bw * 0.28, -bh * 0.22, -bw * 0.08, -bh * 0.02);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bw * 0.42, -bh * 0.06);
        ctx.quadraticCurveTo(bw * 0.28, -bh * 0.22, bw * 0.08, -bh * 0.02);
        ctx.stroke();
      }
      // boot thruster jets
      if (H.boost > 0.12 || H.busy) {
        var jet = 12 + H.boost * 26 + Math.sin(now * 0.045) * 4;
        var jg = ctx.createLinearGradient(0, bh * 0.28, 0, bh * 0.28 + jet);
        jg.addColorStop(0, 'rgba(220,245,255,0.95)');
        jg.addColorStop(0.35, 'rgba(40,170,255,0.6)');
        jg.addColorStop(1, 'rgba(0,40,120,0)');
        ctx.fillStyle = jg;
        ctx.beginPath();
        ctx.moveTo(-10, bh * 0.28);
        ctx.lineTo(10, bh * 0.28);
        ctx.lineTo(0, bh * 0.28 + jet);
        ctx.closePath();
        ctx.fill();
        // twin side thrusters
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(-18, bh * 0.22);
        ctx.lineTo(-10, bh * 0.22);
        ctx.lineTo(-14, bh * 0.22 + jet * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(10, bh * 0.22);
        ctx.lineTo(18, bh * 0.22);
        ctx.lineTo(14, bh * 0.22 + jet * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    } else if (!H.loaded && !H.loadFailed) {
      ctx.save();
      ctx.font = '600 11px system-ui,sans-serif';
      ctx.fillStyle = 'rgba(180,210,255,0.7)';
      ctx.fillText('UNIT · armor…', H.x - 48, H.y);
      ctx.restore();
    }

    // Gaming label plate — only while on a job
    if (!(H.parkMode && !H.busy)) {
      ctx.save();
      ctx.font = '700 12px "Space Grotesk",system-ui,sans-serif';
      var text = H.label || 'UNIT';
      var tw = ctx.measureText(text).width;
      var lx = H.x - tw / 2 - 14;
      var ly = H.y + 46;
      ctx.shadowColor = 'rgba(0,120,255,0.65)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(0,10,32,0.88)';
      ctx.strokeStyle = 'rgba(70,160,255,0.85)';
      ctx.lineWidth = 1.4;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(lx, ly, tw + 28, 22, 11);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(lx, ly, tw + 28, 22);
        ctx.strokeRect(lx, ly, tw + 28, 22);
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#dceeff';
      ctx.fillText(text, H.x - tw / 2, ly + 15);
      ctx.restore();
    }
  }

  function init(opts) {
    opts = opts || {};
    if (H.ready) {
      if (opts.autoWake) H.autoWake = true;
      if (opts.sleep) {
        try {
          sleep();
        } catch (_) {}
      }
      return true;
    }
    // Lean default: load sprites only when first mission needs them
    H.autoWake = opts.autoWake !== false;
    H.x = (window.innerWidth || 400) * 0.82;
    H.y = (window.innerHeight || 700) * 0.55;
    H.tx = H.x;
    H.ty = H.y;
    H.ready = true;
    H.forceVisible = true;
    H.visible = true;
    H.parkMode = true;
    H.status = 'idle';
    try {
      ensureSprites();
      ensureCanvas();
      bindHit();
      parkAtMoon();
    } catch (_) {}
    // Rare visibility sync only when something is running
    try {
      setInterval(function () {
        try {
          if (H.visible || H.busy || H.forceVisible) syncParkVisibility();
        } catch (_) {}
      }, 4000);
    } catch (_) {}
    window.addEventListener('resize', resize, { passive: true });
    return true;
  }

  function report() {
    return {
      ready: H.ready,
      visible: H.visible,
      busy: H.busy,
      status: H.status,
      label: H.label,
      aiFrames: H.frames.length,
      aiLoaded: H.loaded,
      frameW: H.frames[0] && H.frames[0].naturalWidth,
      pos: { x: Math.round(H.x), y: Math.round(H.y) },
      scale: H.scale,
      engine: 'Rai silver-wing · drone + gaming juice · no mesh',
      mission: H.mission && H.mission.kind,
      line:
        'UNIT · ' +
        (H.busy ? H.status : H.status || 'standby') +
        ' · ' +
        (H.loaded ? H.frames.length + ' armor frames' : 'loading armor'),
    };
  }

  function hookMarketFind(pos, label) {
    try {
      find(label || 'shops', pos, { log: true });
    } catch (_) {}
  }

  global.SNHelper = {
    init: init,
    wake: wake,
    sleep: sleep,
    flyTo: flyTo,
    followTap: followTap,
    askMind: askMind,
    engage: engage,
    mindOn: function (v) {
      if (v === undefined) return !!H.mindOn;
      H.mindOn = !!v;
      return H.mindOn;
    },
    say: speakDeep,
    speakDeep: speakDeep,
    parkAtMoon: parkAtMoon,
    syncParkVisibility: syncParkVisibility,
    find: find,
    assistTask: assistTask,
    escortOrder: escortOrder,
    droneDeliver: droneDeliver,
    drone: droneDeliver,
    /** Rai silver robot — polygon courier when no human drivers */
    commissionRai: function (opts) {
      opts = opts || {};
      try {
        wake(true);
      } catch (_) {}
      var order = {
        vendorName: (opts.vendor && opts.vendor.name) || opts.vendorName || 'Pickup',
        title: opts.title || 'Rai drone delivery',
        lat: opts.vendor && opts.vendor.lat,
        lng: opts.vendor && opts.vendor.lng,
        drop_lat: opts.drop && opts.drop.lat,
        drop_lng: opts.drop && opts.drop.lng,
        id: opts.offerId,
      };
      return droneDeliver(order, Object.assign({ forceVisible: true }, opts));
    },
    droneMode: function (on) {
      try {
        if (on) {
          H.forceVisible = true;
          wake(true);
          H.status = 'drone mode';
        } else {
          H.forceVisible = false;
          H.status = 'idle';
        }
      } catch (_) {}
    },
    patrol: patrol,
    showcase: showcase,
    report: report,
    hookMarketFind: hookMarketFind,
    engage: engage,
    ensureSprites: ensureSprites,
    reloadArt: function (urls) {
      urls = urls || {};
      if (urls.frames && urls.frames.length) {
        FRAME_URLS = urls.frames.slice();
      }
      if (urls.hero) HERO_URL = urls.hero;
      H.loaded = false;
      H.loadFailed = false;
      H.frames = [];
      H.hero = null;
      H._loading = null;
      return ensureSprites();
    },
    get busy() {
      return H.busy;
    },
    get visible() {
      return H.visible;
    },
    get ready() {
      return H.ready;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
