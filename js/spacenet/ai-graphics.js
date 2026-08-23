/**
 * SNAIGraphics / AIGraphics — supreme AI generative graphics engine
 * ==================================================================
 * Law: NOT past-era polygon 3D asset pipelines.
 * Visuals are AI-style generative: prompt-seeded canvas synthesis,
 * neural color fields, billboard sprites, cached bitmaps.
 * Goal: game-quality look at phone-friendly cost (few draw calls, no mesh farms).
 *
 * Mechanical: window.SNAIGraphics · window.AIGraphics (compat)
 */
(function (global) {
  'use strict';

  var MODE_KEY = 'sn:ai-gfx-mode-v1';
  var CACHE_MAX = 48;

  var GFX = {
    ready: false,
    mode: 'imagine', // imagine | supreme | balanced | lite
    think: false,
    neural: false,
    hud: null,
    hudCtx: null,
    raf: 0,
    t0: 0,
    cache: new Map(),
    cacheOrder: [],
    fps: 0,
    frames: 0,
    lastF: 0,
    effects: [],
    flyer: null,
    budgetMs: 4,
    genCount: 0,
    hitCount: 0,
  };

  var MODES = {
    imagine: {
      id: 'imagine',
      label: 'Imagine',
      dpr: 2,
      fieldDetail: 1.15,
      hudHz: 30,
      describe: 'Grok Imagine path · AI sprite characters · max generative polish',
    },
    supreme: {
      id: 'supreme',
      label: 'Supreme AI · Imagine refine · HELPER',
      dpr: 1.25,
      hudHz: 30,
      fieldDetail: 1,
      effectCap: 24,
      describe: 'Generative fields + neural HUD · AAA look · still low poly count',
    },
    balanced: {
      id: 'balanced',
      label: 'Balanced',
      dpr: 1,
      hudHz: 20,
      fieldDetail: 0.65,
      effectCap: 12,
      describe: 'Strong generative quality · mid devices',
    },
    lite: {
      id: 'lite',
      label: 'Lite',
      dpr: 0.85,
      hudHz: 12,
      fieldDetail: 0.35,
      effectCap: 6,
      describe: 'Minimal generative overlays · battery first',
    },
  };

  function log(msg, cls) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, cls || 'dim');
    } catch (_) {}
  }

  function hashPrompt(s) {
    var h = 2166136261;
    var str = String(s || 'void');
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function modeProfile() {
    return MODES[GFX.mode] || MODES.supreme;
  }

  function setMode(name) {
    var id = String(name || 'imagine').toLowerCase();
    if (id === 'full' || id === 'gaming' || id === 'aaa' || id === 'grok' || id === 'ai') id = 'imagine';
    if (id === 'supreme' || id === 'max') id = 'imagine'; // auto-prefer Imagine
    if (id === 'mid') id = 'balanced';
    if (id === 'low' || id === 'mobile') id = 'lite';
    if (!MODES[id]) id = 'imagine';
    GFX.mode = id;
    try {
      localStorage.setItem(MODE_KEY, id);
    } catch (_) {}
    resizeHud();
    log('AI Graphics · ' + MODES[id].label, 'ok');
    return MODES[id];
  }

  function loadMode() {
    try {
      var m = localStorage.getItem(MODE_KEY);
      if (m && MODES[m]) GFX.mode = m;
      else if (!m) {
        // LAW: auto Imagine version (no Atari procedural default)
        GFX.mode = 'imagine';
        try { localStorage.setItem(MODE_KEY, 'imagine'); } catch (_s) {}
      }
    } catch (_) {}
    return GFX.mode;
  }

  function cacheGet(key) {
    if (GFX.cache.has(key)) {
      GFX.hitCount++;
      return GFX.cache.get(key);
    }
    return null;
  }

  function cacheSet(key, val) {
    if (GFX.cache.has(key)) {
      GFX.cache.set(key, val);
      return;
    }
    GFX.cache.set(key, val);
    GFX.cacheOrder.push(key);
    while (GFX.cacheOrder.length > CACHE_MAX) {
      var old = GFX.cacheOrder.shift();
      GFX.cache.delete(old);
    }
  }

  /**
   * Core generative painter — prompt → canvas bitmap.
   * No mesh. Pure AI-style field synthesis (seeded noise + palette + structure).
   */
  function generateCanvas(prompt, w, h, opts) {
    opts = opts || {};
    w = Math.max(16, Math.min(1024, w || 256));
    h = Math.max(16, Math.min(1024, h || 256));
    var key = prompt + '|' + w + 'x' + h + '|' + (opts.style || '') + '|' + (opts.variant || 0);
    var hit = cacheGet(key);
    if (hit) return hit;

    var t0 = performance.now();
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d', { alpha: true });
    var seed = hashPrompt(prompt + ':' + (opts.variant || 0));
    var R = rng(seed);
    var detail = modeProfile().fieldDetail * (opts.detail != null ? opts.detail : 1);

    // Semantic palette from prompt words
    var p = String(prompt || '').toLowerCase();
    var pal = paletteFor(p, R);

    // Base neural gradient field
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, pal[0]);
    g.addColorStop(0.45, pal[1]);
    g.addColorStop(1, pal[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Multi-octave "diffusion" blobs (cheap stand-in for generative latent samples)
    var blobs = Math.floor(14 * detail + 6);
    var i;
    for (i = 0; i < blobs; i++) {
      var bx = R() * w;
      var by = R() * h;
      var br = (0.08 + R() * 0.35) * Math.min(w, h);
      var rg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      var col = pal[Math.floor(R() * pal.length)];
      rg.addColorStop(0, withAlpha(col, 0.35 + R() * 0.4));
      rg.addColorStop(1, withAlpha(col, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    // Structure: rings / lattice / city pulse from prompt class
    if (/city|urban|night|map|street/.test(p)) {
      drawCityLattice(ctx, w, h, R, pal);
    } else if (/neural|mind|think|ai|brain/.test(p)) {
      drawNeuralWeb(ctx, w, h, R, pal);
    } else if (/space|orbit|globe|star|cosmo/.test(p)) {
      drawStarField(ctx, w, h, R, pal);
    } else if (/route|path|delivery|drive|traffic/.test(p)) {
      drawRouteArc(ctx, w, h, R, pal);
    } else if (/fx|burst|pulse|energy|spark/.test(p)) {
      drawBurst(ctx, w, h, R, pal);
    } else if (/helper|iron|robot|suit|hero|wing|spacex.?bot|grokbot/.test(p)) {
      // LAW: SpaceX Bot body is AI sprite assets only — no procedural Amiga/Atari suit
      // Soft void + bloom; real character comes from /assets/sprites/spacex-bot/
      ctx.clearRect(0, 0, w, h);
      var voidG = ctx.createRadialGradient(w/2, h/2, 2, w/2, h/2, Math.min(w,h)*0.45);
      voidG.addColorStop(0, 'rgba(255,255,255,0.12)');
      voidG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = voidG;
      ctx.fillRect(0, 0, w, h);
    } else {
      drawSoftNoise(ctx, w, h, R, pal, detail);
    }

    // Second pass — "imagine" refine: electric bloom + edge energy (Grok-Imagine-like polish)
    if (detail >= 0.5) {
      refineImaginePass(ctx, w, h, R, pal, detail);
    }

    // Film grain / micro detail (sells "rendered" without triangles)
    if (detail > 0.4) {
      var img = ctx.getImageData(0, 0, w, h);
      var d = img.data;
      var n = Math.floor(w * h * 0.08 * detail);
      for (i = 0; i < n; i++) {
        var ix = Math.floor(R() * w * h) * 4;
        var v = (R() - 0.5) * 28;
        d[ix] = clampByte(d[ix] + v);
        d[ix + 1] = clampByte(d[ix + 1] + v);
        d[ix + 2] = clampByte(d[ix + 2] + v);
      }
      ctx.putImageData(img, 0, 0);
    }

    // Edge glow vignette
    var vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,8,20,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    GFX.genCount++;
    var out = {
      canvas: c,
      url: c.toDataURL('image/png'),
      seed: seed,
      ms: performance.now() - t0,
      prompt: prompt,
    };
    cacheSet(key, out);
    return out;
  }


  /** Winged silvery-blue hero silhouette — generative, not 3D mesh */
  function drawHeroSuit(ctx, w, h, R, pal) {
    var cx = w * 0.5;
    var cy = h * 0.48;
    // thruster wings
    ctx.save();
    ctx.translate(cx, cy);
    var wing;
    for (wing = -1; wing <= 1; wing += 2) {
      ctx.beginPath();
      ctx.moveTo(wing * w * 0.06, -h * 0.02);
      ctx.quadraticCurveTo(wing * w * 0.42, -h * 0.28, wing * w * 0.38, h * 0.08);
      ctx.quadraticCurveTo(wing * w * 0.18, h * 0.02, wing * w * 0.06, h * 0.06);
      ctx.closePath();
      var wg = ctx.createLinearGradient(0, -h * 0.2, wing * w * 0.35, h * 0.1);
      wg.addColorStop(0, withAlpha(pal[4] || '#1a66ff', 0.85));
      wg.addColorStop(0.5, withAlpha(pal[3] || '#c8c8c8', 0.55));
      wg.addColorStop(1, withAlpha(pal[1] || '#001a4d', 0.1));
      ctx.fillStyle = wg;
      ctx.fill();
      ctx.strokeStyle = withAlpha('#ffffff', 0.7);
      ctx.lineWidth = Math.max(1, w * 0.008);
      ctx.stroke();
    }
    // body plates
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.12, h * 0.2, 0, 0, Math.PI * 2);
    var bg = ctx.createRadialGradient(0, -h * 0.05, 2, 0, 0, w * 0.16);
    bg.addColorStop(0, '#c8d8f0');
    bg.addColorStop(0.35, pal[3] || '#c8c8c8');
    bg.addColorStop(1, pal[0] || '#000814');
    ctx.fillStyle = bg;
    ctx.fill();
    // arc reactor
    var ar = ctx.createRadialGradient(0, -h * 0.02, 1, 0, -h * 0.02, w * 0.05);
    ar.addColorStop(0, '#e8f4ff');
    ar.addColorStop(0.4, '#ffffff');
    ar.addColorStop(1, 'rgba(0,40,160,0)');
    ctx.fillStyle = ar;
    ctx.beginPath();
    ctx.arc(0, -h * 0.02, w * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // helmet
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.14, w * 0.08, h * 0.09, 0, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(pal[2] || '#0033cc', 0.95);
    ctx.fill();
    ctx.restore();
    // thruster trail
    var tr = ctx.createLinearGradient(cx, cy + h * 0.15, cx, h);
    tr.addColorStop(0, withAlpha('#ffffff', 0.55));
    tr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tr;
    ctx.fillRect(cx - w * 0.04, cy + h * 0.12, w * 0.08, h * 0.4);
  }

  /**
   * Imagine-style refine pass — bloom + electric filaments.
   * Inspired by latent polish: no triangles, pure field synthesis.
   */
  function refineImaginePass(ctx, w, h, R, pal, detail) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    var filaments = Math.floor(4 + detail * 8);
    var i;
    for (i = 0; i < filaments; i++) {
      ctx.beginPath();
      var x0 = R() * w;
      var y0 = R() * h;
      ctx.moveTo(x0, y0);
      var s;
      for (s = 0; s < 5; s++) {
        x0 += (R() - 0.5) * w * 0.2;
        y0 += (R() - 0.5) * h * 0.2;
        ctx.lineTo(x0, y0);
      }
      ctx.strokeStyle = withAlpha(pal[3] || '#c8c8c8', 0.12 + R() * 0.18);
      ctx.lineWidth = 0.5 + R() * 1.5;
      ctx.stroke();
    }
    // central electric bloom
    var bloom = ctx.createRadialGradient(w * 0.5, h * 0.45, 2, w * 0.5, h * 0.45, Math.min(w, h) * 0.35);
    bloom.addColorStop(0, withAlpha('#ffffff', 0.22));
    bloom.addColorStop(0.5, withAlpha('#0033cc', 0.08));
    bloom.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function paletteFor(p, R) {
    // Deep electric blue default — no pale ice
    var base = ['#000814', '#001a4d', '#0033cc', '#c8c8c8', '#1a66ff'];
    if (/fire|lava|alert|danger/.test(p)) base = ['#1a0505', '#ff3344', '#ff8844', '#ffcc33', '#fff0e0'];
    else if (/nature|park|green|forest/.test(p)) base = ['#041a10', '#0a8040', '#44ff99', '#a8ffd0', '#e8fff4'];
    else if (/gold|money|s\b|wallet|vault|coin/.test(p)) base = ['#0a0810', '#0033aa', '#c8c8c8', '#3377ff', '#c9a227'];
    else if (/night|dark|void/.test(p)) base = ['#00040a', '#000d28', '#002080', '#c8c8c8', '#3377ff'];
    else if (/warm|sunset|love|date/.test(p)) base = ['#1a0810', '#ff4466', '#ff88aa', '#ffc8d8', '#ffffff'];
    // shuffle lightly
    if (R() > 0.5) {
      var t = base[1];
      base[1] = base[2];
      base[2] = t;
    }
    return base;
  }

  function withAlpha(hex, a) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3)
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function clampByte(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v | 0;
  }

  function drawCityLattice(ctx, w, h, R, pal) {
    ctx.strokeStyle = withAlpha(pal[2], 0.35);
    ctx.lineWidth = 1;
    var step = Math.max(8, Math.floor(w / 18));
    var x, y;
    for (x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (R() - 0.5) * 6, h);
      ctx.stroke();
    }
    for (y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + (R() - 0.5) * 6);
      ctx.stroke();
    }
    // glowing nodes
    for (var i = 0; i < 40; i++) {
      ctx.fillStyle = withAlpha(pal[3], 0.5 + R() * 0.5);
      ctx.beginPath();
      ctx.arc(R() * w, R() * h, 1 + R() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawNeuralWeb(ctx, w, h, R, pal) {
    var nodes = [];
    var n = 18;
    var i, j;
    for (i = 0; i < n; i++) {
      nodes.push({ x: R() * w, y: R() * h });
    }
    ctx.lineWidth = 1.2;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var dx = nodes[i].x - nodes[j].x;
        var dy = nodes[i].y - nodes[j].y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < w * 0.35) {
          ctx.strokeStyle = withAlpha(pal[2], 0.15 + (1 - d / (w * 0.35)) * 0.45);
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }
    for (i = 0; i < n; i++) {
      var rg = ctx.createRadialGradient(nodes[i].x, nodes[i].y, 0, nodes[i].x, nodes[i].y, 10);
      rg.addColorStop(0, withAlpha(pal[3], 0.9));
      rg.addColorStop(1, withAlpha(pal[2], 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(nodes[i].x, nodes[i].y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStarField(ctx, w, h, R, pal) {
    for (var i = 0; i < 120; i++) {
      ctx.fillStyle = withAlpha(pal[4], 0.3 + R() * 0.7);
      ctx.beginPath();
      ctx.arc(R() * w, R() * h, R() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // nebula wisps
    for (i = 0; i < 6; i++) {
      var rg = ctx.createRadialGradient(R() * w, R() * h, 0, R() * w, R() * h, w * 0.25);
      rg.addColorStop(0, withAlpha(pal[2], 0.25));
      rg.addColorStop(1, withAlpha(pal[0], 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawRouteArc(ctx, w, h, R, pal) {
    ctx.strokeStyle = withAlpha(pal[2], 0.85);
    ctx.lineWidth = 3;
    ctx.shadowColor = pal[2];
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.7);
    ctx.bezierCurveTo(w * 0.3, h * 0.1, w * 0.7, h * 0.2, w * 0.9, h * 0.55);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // stops
    [[0.1, 0.7], [0.45, 0.28], [0.9, 0.55]].forEach(function (p, idx) {
      ctx.fillStyle = idx === 2 ? '#ff4466' : idx === 0 ? '#00e8a0' : '#ffcc33';
      ctx.beginPath();
      ctx.arc(w * p[0], h * p[1], 6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawBurst(ctx, w, h, R, pal) {
    var cx = w / 2;
    var cy = h / 2;
    for (var i = 0; i < 24; i++) {
      var a = (i / 24) * Math.PI * 2 + R() * 0.2;
      var len = (0.2 + R() * 0.35) * Math.min(w, h);
      ctx.strokeStyle = withAlpha(pal[2 + (i % 2)], 0.4 + R() * 0.5);
      ctx.lineWidth = 1 + R() * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.2);
    rg.addColorStop(0, withAlpha(pal[4], 0.9));
    rg.addColorStop(1, withAlpha(pal[2], 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSoftNoise(ctx, w, h, R, pal, detail) {
    var n = Math.floor(30 * detail);
    for (var i = 0; i < n; i++) {
      var rg = ctx.createRadialGradient(R() * w, R() * h, 0, R() * w, R() * h, w * (0.1 + R() * 0.2));
      rg.addColorStop(0, withAlpha(pal[1 + (i % 3)], 0.2));
      rg.addColorStop(1, withAlpha(pal[0], 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** Generate sprite data URL for UI / map badges */
  function generateSprite(prompt, size) {
    size = size || 128;
    return generateCanvas(prompt || 'fx energy cyan', size, size, { style: 'sprite' });
  }

  /** Three.js CanvasTexture if THREE present — still generative, not mesh art */
  function generateTexture(prompt, w, h) {
    var bit = generateCanvas(prompt, w || 256, h || 256);
    if (global.THREE && THREE.CanvasTexture) {
      var tex = new THREE.CanvasTexture(bit.canvas);
      tex.needsUpdate = true;
      bit.texture = tex;
    }
    return bit;
  }

  // ─── HUD overlay (supreme gaming chrome without 3D cost) ───

  function ensureHud() {
    if (GFX.hud && document.body.contains(GFX.hud)) return GFX.hud;
    var c = document.createElement('canvas');
    c.id = 'sn-ai-gfx-hud';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText =
      'position:fixed;inset:0;z-index:8;pointer-events:none;mix-blend-mode:screen;opacity:0.55';
    document.body.appendChild(c);
    GFX.hud = c;
    GFX.hudCtx = c.getContext('2d');
    resizeHud();
    return c;
  }

  function resizeHud() {
    if (!GFX.hud) return;
    var dpr = Math.min(window.devicePixelRatio || 1, modeProfile().dpr);
    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    GFX.hud.width = Math.floor(w * dpr);
    GFX.hud.height = Math.floor(h * dpr);
    GFX.hud.style.width = w + 'px';
    GFX.hud.style.height = h + 'px';
    if (GFX.hudCtx) GFX.hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setThinkPulse(on) {
    GFX.think = !!on;
    if (on) {
      ensureHud();
      ensureLoop();
    }
  }

  function showNeural(on) {
    GFX.neural = on !== false;
    if (GFX.neural) {
      ensureHud();
      ensureLoop();
    }
  }

  function spawnEffect(latOrX, lngOrY, color, count, life) {
    // Accept lat/lng or screen-ish coords; store as soft HUD particle burst
    ensureHud();
    ensureLoop();
    var prof = modeProfile();
    if (GFX.effects.length >= prof.effectCap) GFX.effects.shift();
    var col = color != null ? color : 0x4cc9ff;
    if (typeof col === 'number') {
      col =
        '#' +
        ('000000' + (col & 0xffffff).toString(16)).slice(-6);
    }
    var w = window.innerWidth || 400;
    var h = window.innerHeight || 700;
    // If looks like lat/lng, project softly to screen center bias
    var x, y;
    if (
      latOrX != null &&
      lngOrY != null &&
      Math.abs(latOrX) <= 90 &&
      Math.abs(lngOrY) <= 180
    ) {
      x = w * (0.5 + lngOrY / 360);
      y = h * (0.45 - latOrX / 180);
    } else {
      x = latOrX != null ? latOrX : w * 0.5;
      y = lngOrY != null ? lngOrY : h * 0.4;
    }
    GFX.effects.push({
      x: x,
      y: y,
      color: col,
      life: life || 40,
      max: life || 40,
      count: count || 16,
      seed: Math.random() * 1000,
    });
  }

  function flyAstranovTo(lat, lng, opts) {
    opts = opts || {};
    GFX.flyer = {
      lat: lat,
      lng: lng,
      t: 0,
      dur: opts.dur || 1.2,
      color: opts.color || 0x3d9eff,
      label: opts.label || 'Astranov',
    };
    spawnEffect(lat, lng, opts.color || 0x3d9eff, 20, 36);
    try {
      if (global.SNGlobe && SNGlobe.flyNear) SNGlobe.flyNear(lat, lng);
    } catch (_) {}
    return GFX.flyer;
  }

  function spawnAstranovFlyer(lat, lng, opts) {
    return flyAstranovTo(lat, lng, opts);
  }

  function paintHud(t) {
    var ctx = GFX.hudCtx;
    if (!ctx || !GFX.hud) return;
    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    ctx.clearRect(0, 0, w, h);

    if (GFX.mode === 'lite' && !GFX.think && !GFX.neural && !GFX.effects.length) return;

    // Neural / think pulse — generative field, not geometry
    if (GFX.think || GFX.neural) {
      var pulse = 0.5 + 0.5 * Math.sin(t * 0.004);
      ctx.save();
      ctx.globalAlpha = 0.12 + pulse * 0.1;
      var g = ctx.createRadialGradient(w * 0.5, h * 0.35, 20, w * 0.5, h * 0.35, w * 0.55);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.35 + pulse * 0.25) + ')');
      g.addColorStop(0.5, 'rgba(11,111,212,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // soft scan lines (cinema, not mesh)
      if (GFX.mode === 'supreme' || GFX.mode === 'imagine') {
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = '#ffffff';
        for (var sy = 0; sy < h; sy += 4) {
          ctx.fillRect(0, sy, w, 1);
        }
      }
      ctx.restore();
    }

    // Effects
    var i = GFX.effects.length;
    while (i--) {
      var e = GFX.effects[i];
      e.life--;
      if (e.life <= 0) {
        GFX.effects.splice(i, 1);
        continue;
      }
      var k = e.life / e.max;
      var R = rng(hashPrompt(String(e.seed + e.life)));
      ctx.save();
      ctx.globalAlpha = k * 0.85;
      for (var p = 0; p < e.count; p++) {
        var ang = (p / e.count) * Math.PI * 2 + t * 0.002;
        var rad = (1 - k) * 40 + R() * 12;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(ang) * rad, e.y + Math.sin(ang) * rad, 1.5 + R() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Flyer soft glyph
    if (GFX.flyer) {
      GFX.flyer.t += 1 / 60;
      var f = GFX.flyer;
      var fx = w * (0.5 + f.lng / 360);
      var fy = h * (0.45 - f.lat / 180);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(fx, fy, 10 + Math.sin(t * 0.01) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#e8f6ff';
      ctx.font = '600 11px Rajdhani,system-ui,sans-serif';
      ctx.fillText(f.label || 'Astranov', fx + 14, fy + 4);
      ctx.restore();
      if (f.t > f.dur) GFX.flyer = null;
    }

    // Corner brand micro-glyph (supreme only)
    if (GFX.mode === 'supreme' || GFX.mode === 'imagine') {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(12, 12, 28, 28);
      ctx.beginPath();
      ctx.moveTo(16, 26);
      ctx.lineTo(26, 16);
      ctx.lineTo(36, 26);
      ctx.stroke();
      ctx.restore();
    }
  }

  function loop(now) {
    // Stop RAF when nothing to paint (big sticky win)
    var need =
      GFX.think ||
      GFX.neural ||
      (GFX.effects && GFX.effects.length) ||
      GFX.flyer ||
      GFX.mode === 'supreme';
    if (!need) {
      GFX.raf = 0;
      if (GFX.hudCtx && GFX.hud) {
        try {
          var w0 = window.innerWidth || 1;
          var h0 = window.innerHeight || 1;
          GFX.hudCtx.clearRect(0, 0, w0, h0);
        } catch (_) {}
      }
      return;
    }
    if (!GFX._engine) GFX.raf = requestAnimationFrame(loop);
    if (!GFX.lastF) GFX.lastF = now;
    var dt = now - GFX.lastF;
    var hz = (global.SNPerf && SNPerf.hudHz) || modeProfile().hudHz;
    var minDt = 1000 / hz;
    if (dt < minDt) return;
    GFX.lastF = now;
    GFX.frames++;
    if (now - (GFX._fpsAt || 0) > 1000) {
      GFX.fps = GFX.frames;
      GFX.frames = 0;
      GFX._fpsAt = now;
    }
    if (document.hidden) return;
    if (GFX.mode === 'lite' && global.SNMap && SNMap.active && !GFX.think) return;
    paintHud(now);
  }

  function init() {
    if (GFX.ready) return true;
    loadMode();
    // LAW: default Imagine version always unless user locked lite
    try {
      if (!localStorage.getItem(MODE_KEY) || localStorage.getItem(MODE_KEY) === 'balanced' || localStorage.getItem(MODE_KEY) === 'supreme') {
        setMode('imagine');
      }
    } catch (_) { setMode('imagine'); }
    // Auto lite only when SNPerf.lite hard-forces (street phone)
    try {
      if (!localStorage.getItem(MODE_KEY) && global.SNPerf) {
        if (SNPerf.lite) GFX.mode = 'lite';
        else if (!localStorage.getItem(MODE_KEY)) GFX.mode = 'imagine';
      }
    } catch (_) {}
    // Don't create full-screen HUD until think/neural/effect needed
    GFX.t0 = performance.now();
    GFX.ready = true;
    window.addEventListener('resize', resizeHud, { passive: true });
    // No continuous RAF until needed
    return true;
  }

  function ensureLoop() {
    if (GFX._engine) {
      ensureHud();
      return;
    }
    if (global.SNGameLoop && SNGameLoop.subscribe) {
      ensureHud();
      GFX._engine = SNGameLoop.subscribe(
        function (dt, now) {
          loop(now);
        },
        { lane: 'ambient', name: 'ai-graphics' }
      );
      return;
    }
    if (!GFX.raf) {
      ensureHud();
      GFX.raf = requestAnimationFrame(loop);
    }
  }

  function report() {
    var helperOn = !!(global.SNHelper && SNHelper.visible);

    var m = modeProfile();
    return {
      ready: GFX.ready,
      mode: m.id,
      label: m.label,
      fps: GFX.fps,
      cache: GFX.cache.size,
      gens: GFX.genCount,
      hits: GFX.hitCount,
      effects: GFX.effects.length,
      think: GFX.think,
      neural: GFX.neural,
      line:
        'AI Graphics · ' +
        m.label +
        ' · gen ' +
        GFX.genCount +
        ' · cache ' +
        GFX.cache.size +
        ' · HUD ~' +
        GFX.fps +
        'fps · zero mesh assets',
      describe: m.describe,
    };
  }

  function statusLines() {
    var r = report();
    return [
      'AI SUPREME GRAPHICS · generative engine (not past-era 3D assets)',
      r.line,
      r.describe,
      'Modes · supreme · balanced · lite ·  CLI: gfx supreme | gfx lite',
      'Think pulse · neural overlay · spawn FX · flyer — all canvas/prompt fields',
    ];
  }

  // Optional: apply generative cover to vendor tile when empty photo
  function enrichVendorCover(profile) {
    if (!profile) return profile;
    if (profile.cover && !/^data:image\/svg/.test(profile.cover) && profile.photos && profile.photos.length)
      return profile;
    var kind = profile.shopKind || profile.kind || 'shop';
    var name = profile.shopName || profile.name || 'shop';
    var bit = generateCanvas(kind + ' ' + name + ' night city storefront cyan', 512, 288, {
      style: 'cover',
    });
    profile.cover = bit.url;
    if (!profile.photos || !profile.photos.length) profile.photos = [bit.url];
    if (!profile.avatar) profile.avatar = generateSprite(kind + ' icon', 96).url;
    return profile;
  }

  var api = {
    init: init,
    setMode: setMode,
    getMode: function () {
      return GFX.mode;
    },
    modes: MODES,
    generateCanvas: generateCanvas,
    generateSprite: generateSprite,
    generateTexture: generateTexture,
    setThinkPulse: setThinkPulse,
    showNeural: showNeural,
    spawnEffect: spawnEffect,
    flyAstranovTo: flyAstranovTo,
    spawnAstranovFlyer: spawnAstranovFlyer,
    flyTo: flyAstranovTo,
    enrichVendorCover: enrichVendorCover,
    report: report,
    status: statusLines,
    get ready() {
      return GFX.ready;
    },
  };

  global.SNAIGraphics = api;
  // Legacy / deferred compat name
  global.AIGraphics = api;
})(typeof window !== 'undefined' ? window : globalThis);
