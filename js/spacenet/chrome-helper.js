/* Astranov Silver · Build 20260811224500-hardwire
 * MUST talk on tap. MUST wake AI. DOM speech + forced CLI lines (no silent fail).
 */
(function (global) {
  'use strict';
  var BUILD = '20260811224500-hardwire';
  if (global.__SN_SILVER_HARDWIRE === BUILD) return;
  global.__SN_SILVER_HARDWIRE = BUILD;

  var MODE = 'standby';
  var canvas = null;
  var ctx = null;
  var hit = null;
  var raf = 0;
  var t0 = performance.now();
  var activeUntil = 0;
  var pos = { x: 0, y: 0 };
  var flyTarget = null;
  var bubble = '';
  var bubbleUntil = 0;
  var pose = { flap: 0, bob: 0, lean: 0, thrust: 0, glow: 0.35, size: 34 };
  var hud = null;
  var boundAiBtn = false;

  function $(id) {
    return document.getElementById(id);
  }

  function topChromeBottom() {
    try {
      var el = $('sn-topchrome-panel') || $('sn-topchrome');
      if (el) return Math.max(48, Math.round(el.getBoundingClientRect().bottom + 4));
    } catch (_) {}
    return 64;
  }

  function homeAnchor() {
    var w = window.innerWidth || 400;
    var h = window.innerHeight || 700;
    return {
      x: Math.min(Math.max(w - 52, 40), w - 28),
      y: Math.min(Math.max(topChromeBottom() + 32, 60), Math.round(h * 0.2)),
    };
  }

  /** Always-visible speech HUD (canvas bubble is secondary) */
  function ensureHud() {
    if (hud && document.body.contains(hud)) return hud;
    hud = document.createElement('div');
    hud.id = 'sn-silver-hud';
    hud.setAttribute('role', 'status');
    hud.style.cssText =
      'position:fixed;z-index:99990;right:10px;top:72px;max-width:min(300px,78vw);' +
      'pointer-events:none;display:none;font:700 13px/1.35 system-ui,sans-serif;color:#e8f4ff;' +
      'padding:12px 14px;border-radius:16px;border:1px solid rgba(100,190,255,0.55);' +
      'background:rgba(0,10,28,0.88);box-shadow:0 0 24px rgba(40,140,255,0.45),0 8px 28px rgba(0,0,0,0.45);' +
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);white-space:pre-wrap;';
    document.body.appendChild(hud);
    return hud;
  }

  function placeHudNearRobot() {
    var h = ensureHud();
    var a = homeAnchor();
    h.style.top = Math.max(56, a.y + 28) + 'px';
    h.style.right = '10px';
    h.style.left = 'auto';
  }

  function forceCliLine(text, kind) {
    var t = String(text || '').trim();
    if (!t) return;
    try {
      if (global.SNCli && typeof SNCli.log === 'function') {
        SNCli.log(t, kind || 'ok');
      }
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(t.slice(0, 80));
    } catch (_) {}
    // Hard DOM write — never depend on SNCli
    try {
      var log = $('cli-log');
      if (log) {
        var row = document.createElement('div');
        row.className = 'cli-line sn-silver-line';
        row.style.cssText =
          'color:#9fd4ff;font:700 13px/1.45 system-ui,monospace;padding:3px 0;' +
          'text-shadow:0 0 10px rgba(80,180,255,0.55);';
        row.textContent = '🤖 ' + t;
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
        // keep last 40 silver lines
        var lines = log.querySelectorAll('.sn-silver-line');
        for (var i = 0; i < lines.length - 40; i++) {
          if (lines[i].parentNode) lines[i].parentNode.removeChild(lines[i]);
        }
      }
    } catch (_) {}
    // Expand CLI so user sees it
    try {
      var panel = $('panel');
      if (panel) {
        panel.classList.remove('collapsed', 'cli-quiet');
        panel.classList.add('mid');
        panel.style.setProperty('max-height', '28vh', 'important');
      }
      var dock = $('dock');
      if (dock) dock.style.pointerEvents = 'none';
      if (panel) panel.style.pointerEvents = 'auto';
    } catch (_) {}
  }

  function speak(text, opts) {
    opts = opts || {};
    var t = String(text || '').trim();
    if (!t) return;
    bubble = t.length > 90 ? t.slice(0, 87) + '…' : t;
    bubbleUntil = performance.now() + (opts.ms || 10000);
    placeHudNearRobot();
    var h = ensureHud();
    h.style.display = 'block';
    h.textContent = 'Silver · ' + bubble;
    forceCliLine(t, opts.kind || 'ok');
    try {
      if (global.SNAi && SNAi.showOnGlobe) SNAi.showOnGlobe(t.slice(0, 90));
    } catch (_) {}
    // No auto TTS (Android beep risk). Only if forceVoice.
    if (opts.forceVoice) {
      try {
        if (global.speechSynthesis) {
          global.speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(t.slice(0, 140));
          u.rate = 1.02;
          u.volume = 0.8;
          global.speechSynthesis.speak(u);
        }
      } catch (_) {}
    }
  }

  function hideHudSoon() {
    if (performance.now() > bubbleUntil) {
      if (hud) hud.style.display = 'none';
    }
  }

  function setMode(m) {
    MODE = m;
    t0 = performance.now();
    if (m !== 'standby') activeUntil = performance.now() + 120000;
  }

  function openCli() {
    try {
      var panel = $('panel');
      if (panel) {
        panel.classList.remove('collapsed', 'cli-quiet');
        panel.classList.add('mid');
      }
      var inp = $('cli-in');
      if (inp) {
        inp.placeholder = 'Talk to Silver / Astranov Mind…';
        try {
          inp.focus({ preventScroll: true });
        } catch (_) {
          try {
            inp.focus();
          } catch (_2) {}
        }
      }
    } catch (_) {}
  }

  function localMind(msg) {
    var low = String(msg || '').toLowerCase();
    if (!low) return null;
    if (/^(hi|hello|hey|γεια|ela)\b/.test(low))
      return "Hey — Silver here. I'm your Astranov companion. Locate, shops, call, power on, or just ask.";
    if (/who are you|what are you|your name|silver/.test(low))
      return "I'm Silver — face of Astranov Mind. Local memory on your device; Grok-class mind when online. Built with you and every user.";
    if (/help|what can|commands/.test(low))
      return 'Try: locate · power on · call · polygon · find pizza · shops · or type any question.';
    if (/beep|mute|quiet|shut/.test(low))
      return 'Beeps muted. I talk in the CLI and this bubble — not noisy voice loops.';
    if (/locate|where am i|gps/.test(low)) return 'LOCATE';
    if (/power on|tasks on|go live/.test(low)) return 'POWER_ON';
    if (/call|video/.test(low)) return 'CALL';
    return null;
  }

  async function askMind(message) {
    var msg = String(message || '').trim();
    if (!msg) return;
    setMode('talk');
    speak('Thinking…', { ms: 2500, kind: 'dim' });

    var local = localMind(msg);
    if (local === 'LOCATE') {
      speak('Locating you on the map…', { ms: 5000 });
      try {
        if (global.SNCli && SNCli.run) await SNCli.run('locate');
      } catch (_) {}
      return;
    }
    if (local === 'POWER_ON') {
      speak('Powering market / tasks ON…', { ms: 5000 });
      try {
        if (global.SNCli && SNCli.run) await SNCli.run('power on');
      } catch (_) {}
      return;
    }
    if (local === 'CALL') {
      speak('Opening Call…', { ms: 4000 });
      try {
        if (global.SNWebRTC && (SNWebRTC.open || SNWebRTC.openFromRibbon))
          (SNWebRTC.openFromRibbon || SNWebRTC.open)();
        else if (global.SNCli && SNCli.run) await SNCli.run('call');
      } catch (_) {}
      return;
    }
    if (local) {
      speak(local, { ms: 10000 });
      return local;
    }

    try {
      if (global.SNOmni && /\b(search|find|where|what is|who is|near|wiki|weather|map)\b/i.test(msg)) {
        var om = await SNOmni.search(msg, { graphics: true });
        if (om && om.items && om.items[0]) {
          var top = om.items[0];
          speak(top.title + (top.detail ? ' — ' + String(top.detail).slice(0, 160) : '') + ' · ' + om.items.length + ' omni hits', { ms: 12000 });
          return top.title;
        }
      }
    } catch (_) {}

    try {
      if (global.SNAstranovMind && SNAstranovMind.answer) {
        var r = SNAstranovMind.answer(msg);
        var text = r && (r.text || r.a || r.answer);
        if (text) {
          speak(String(text).slice(0, 280), { ms: 12000 });
          try {
            if (SNAstranovMind.learnInteraction)
              SNAstranovMind.learnInteraction(msg, text, { source: 'silver' });
          } catch (_) {}
          return text;
        }
      }
    } catch (_) {}

    try {
      if (global.SNAi && typeof SNAi.ask === 'function') {
        var ans = await Promise.race([
          SNAi.ask(msg, { mode: 'chat', source: 'silver' }),
          new Promise(function (res) {
            setTimeout(function () {
              res(null);
            }, 8000);
          }),
        ]);
        if (ans) {
          speak(String(ans).slice(0, 280), { ms: 12000 });
          return ans;
        }
      }
    } catch (e) {
      forceCliLine('AI path · ' + (e && e.message ? e.message : e), 'err');
    }

    speak(
      "I'm online. Free mind quiet right now — try locate, power on, call, or ask again.",
      { ms: 9000 }
    );
  }

  function wakeAiStack() {
    global.__SN_SILVER_ACTIVE = true;
    global.__SN_MUTE_BEEPS = true;
    try {
      if (global.speechSynthesis) global.speechSynthesis.cancel();
    } catch (_) {}
    try {
      if (global.SNAi) {
        if (SNAi.bootPresence) SNAi.bootPresence();
        if (SNAi.listeningOn) SNAi.listeningOn();
      }
    } catch (_) {}
    try {
      localStorage.setItem(
        'sn:silver-last',
        String(Date.now())
      );
    } catch (_) {}
  }

  function flyNudge() {
    var a = homeAnchor();
    var w = window.innerWidth || 400;
    var h = window.innerHeight || 700;
    setMode('fly');
    flyTarget = { x: w * 0.72, y: Math.min(h * 0.28, a.y + 40), until: performance.now() + 900 };
    setTimeout(function () {
      flyTarget = { x: a.x, y: a.y, until: performance.now() + 700 };
      setTimeout(function () {
        flyTarget = null;
        if (MODE === 'fly') setMode('active');
      }, 750);
    }, 950);
  }

  function activate() {
    try {
      setMode('active');
      wakeAiStack();
      openCli();
      placeHudNearRobot();
      flyNudge();
      speak(
        "Silver online. I'm your Astranov companion — collective memory here, full mind when connected. What do you need?",
        { ms: 14000, kind: 'ok' }
      );
      forceCliLine('──────── SILVER AI ACTIVE ────────', 'dim');
      forceCliLine('Type below · or say: locate · power on · call · help', 'ok');
      forceCliLine('Power: omni · elevate · omni <query> · power search <q>', 'dim');
      try { if (global.SNOmni && SNOmni.init) SNOmni.init(); } catch (_o) {}
      installCliHook();
      bindAiButton(true);
      // Prove mind path immediately
      setTimeout(function () {
        try {
          if (global.SNAstranovMind && SNAstranovMind.think)
            SNAstranovMind.think('silver activated', 'status');
        } catch (_) {}
      }, 100);
    } catch (e) {
      forceCliLine('Silver activate error · ' + (e && e.message ? e.message : e), 'err');
      try {
        alert('Silver: ' + (e && e.message ? e.message : e));
      } catch (_) {}
    }
  }

  function installCliHook() {
    if (global.__SN_SILVER_CLI_HOOK2) return;
    if (!global.SNCli || typeof SNCli.run !== 'function') {
      // retry when CLI arrives
      setTimeout(installCliHook, 1500);
      return;
    }
    global.__SN_SILVER_CLI_HOOK2 = true;
    var prev = SNCli.run.bind(SNCli);
    SNCli.run = function (raw) {
      var line = String(raw || '').trim();
      var low = line.toLowerCase();
      if (global.__SN_SILVER_ACTIVE && line.length > 1) {
        if (
          /^(hi|hello|hey|silver|helper|who are you|what can|help\b|find |order |where |how |why |can you)/i.test(
            low
          ) ||
          /\?$/.test(line) ||
          (line.split(/\s+/).length >= 3 &&
            !/^(locate|gps|power|call|video|hang|polygon|poly|global|city|map|shops|layers|send|market|offer)/i.test(
              low
            ))
        ) {
          return askMind(line);
        }
      }
      return prev(raw);
    };
  }

  function bindAiButton(force) {
    var btn = $('sn-rib-hf');
    if (!btn) return;
    if (btn.__snSilverBound && !force) return;
    btn.__snSilverBound = true;
    // Capture phase — works even if field ribbonAct is broken
    btn.addEventListener(
      'click',
      function (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        } catch (_) {}
        activate();
      },
      true
    );
    boundAiBtn = true;
  }

  // Global capture: any click on AI ribbon text
  document.addEventListener(
    'click',
    function (ev) {
      var t = ev.target;
      if (!t) return;
      var el = t.closest ? t.closest('#sn-rib-hf, [data-act="handsfree"]') : null;
      if (!el) return;
      // Let our capture on button also fire; this is backup if button recreated
      if (el.__snSilverBound) return;
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (_) {}
      activate();
    },
    true
  );

  function ensureCanvas() {
    if (canvas && document.body.contains(canvas)) return ctx;
    canvas = $('sn-silver-vector');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'sn-silver-vector';
      document.body.appendChild(canvas);
    }
    canvas.style.cssText =
      'position:fixed;inset:0;z-index:98;pointer-events:none;width:100%;height:100%;background:transparent;';
    ctx = canvas.getContext('2d', { alpha: true });
    resize();
    return ctx;
  }

  function resize() {
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureHit() {
    if (hit && document.body.contains(hit)) return hit;
    hit = document.createElement('button');
    hit.id = 'sn-helper-hit';
    hit.type = 'button';
    hit.title = 'Silver AI — tap to talk';
    hit.setAttribute('aria-label', 'Silver AI helper');
    hit.style.cssText =
      'position:fixed;z-index:99995;width:64px;height:64px;border:2px solid rgba(100,180,255,0.35);' +
      'padding:0;margin:0;background:rgba(40,120,255,0.06);cursor:pointer;border-radius:50%;' +
      'outline:none;-webkit-tap-highlight-color:transparent;box-shadow:0 0 16px rgba(60,150,255,0.25);';
    document.body.appendChild(hit);
    function onAct(e) {
      try {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      } catch (_) {}
      activate();
    }
    hit.addEventListener('click', onAct, true);
    hit.addEventListener('touchend', onAct, { passive: false, capture: true });
    return hit;
  }

  function placeHit(x, y) {
    var h = ensureHit();
    h.style.left = Math.round(x - 32) + 'px';
    h.style.top = Math.round(y - 32) + 'px';
  }

  function tickPose(now) {
    var t = (now - t0) / 1000;
    if (MODE === 'standby') {
      pose.flap = Math.sin(t * 1.0) * 0.1;
      pose.bob = Math.sin(t * 0.85) * 2;
      pose.lean = Math.sin(t * 0.4) * 0.03;
      pose.thrust = 0;
      pose.glow = 0.28;
      pose.size = 32;
    } else if (MODE === 'fly') {
      pose.flap = Math.sin(t * 9) * 0.5;
      pose.bob = Math.sin(t * 6) * 2.5;
      pose.lean = 0.18;
      pose.thrust = 0.65;
      pose.glow = 0.7;
      pose.size = 36;
    } else {
      pose.flap = Math.sin(t * 2.8) * 0.22;
      pose.bob = Math.sin(t * 1.8) * 2.2;
      pose.lean = Math.sin(t * 1.2) * 0.08;
      pose.thrust = 0.1;
      pose.glow = 0.55 + Math.sin(t * 2) * 0.1;
      pose.size = 36;
    }
  }

  function drawRobot(c, x, y) {
    var s = pose.size;
    c.save();
    c.translate(x, y + pose.bob);
    c.rotate(pose.lean);
    var g = c.createRadialGradient(0, 0, 2, 0, 0, s * 1.55);
    g.addColorStop(0, 'rgba(160,210,255,' + (0.1 + pose.glow * 0.1) + ')');
    g.addColorStop(1, 'rgba(60,120,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, s * 1.55, 0, Math.PI * 2);
    c.fill();
    function wing(side) {
      c.save();
      c.scale(side, 1);
      c.rotate(-0.35 + pose.flap * side);
      var wg = c.createLinearGradient(0, 0, s * 1.35, 0);
      wg.addColorStop(0, 'rgba(220,235,255,0.95)');
      wg.addColorStop(1, 'rgba(110,150,200,0.3)');
      c.fillStyle = wg;
      c.beginPath();
      c.moveTo(s * 0.15, -s * 0.1);
      c.quadraticCurveTo(s * 0.9, -s * 0.55, s * 1.3, -s * 0.08);
      c.quadraticCurveTo(s * 0.85, s * 0.12, s * 0.2, s * 0.18);
      c.closePath();
      c.fill();
      c.restore();
    }
    wing(-1);
    wing(1);
    var bg = c.createLinearGradient(-s * 0.3, -s * 0.5, s * 0.35, s * 0.5);
    bg.addColorStop(0, '#eef6ff');
    bg.addColorStop(0.5, '#b0c6dc');
    bg.addColorStop(1, '#6a849e');
    c.fillStyle = bg;
    c.beginPath();
    c.ellipse(0, s * 0.05, s * 0.3, s * 0.46, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#d8e8f8';
    c.beginPath();
    c.ellipse(0, -s * 0.36, s * 0.26, s * 0.24, 0, 0, Math.PI * 2);
    c.fill();
    var vg = c.createLinearGradient(-s * 0.16, -s * 0.42, s * 0.16, -s * 0.28);
    if (MODE === 'standby') {
      vg.addColorStop(0, 'rgba(40,140,255,0.9)');
      vg.addColorStop(1, 'rgba(20,80,180,0.95)');
    } else {
      vg.addColorStop(0, 'rgba(80,255,180,0.95)');
      vg.addColorStop(1, 'rgba(40,200,255,0.95)');
    }
    c.fillStyle = vg;
    c.beginPath();
    c.ellipse(0, -s * 0.36, s * 0.16, s * 0.09, 0, 0, Math.PI * 2);
    c.fill();
    if (pose.thrust > 0.05) {
      c.fillStyle = 'rgba(120,200,255,' + (0.2 + pose.thrust * 0.35) + ')';
      c.beginPath();
      c.moveTo(-s * 0.1, s * 0.48);
      c.lineTo(0, s * 0.48 + s * 0.5 * pose.thrust);
      c.lineTo(s * 0.1, s * 0.48);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    var c = ensureCanvas();
    if (!c) return;
    if (frame._last && now - frame._last < (MODE === 'standby' ? 40 : 22)) return;
    frame._last = now;

    if (MODE !== 'standby' && activeUntil && now > activeUntil) {
      setMode('standby');
      flyTarget = null;
      global.__SN_SILVER_ACTIVE = false;
      speak('Standing by. Tap me anytime.', { ms: 4000, kind: 'dim' });
    }

    var a = homeAnchor();
    if (!pos.x) {
      pos.x = a.x;
      pos.y = a.y;
    }
    var tx = a.x;
    var ty = a.y;
    if (flyTarget && now < flyTarget.until) {
      tx = flyTarget.x;
      ty = flyTarget.y;
    } else if (MODE === 'active' || MODE === 'talk') {
      tx = a.x - 6;
      ty = a.y + 8;
    }
    pos.x += (tx - pos.x) * (MODE === 'fly' ? 0.16 : 0.09);
    pos.y += (ty - pos.y) * (MODE === 'fly' ? 0.16 : 0.09);

    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    c.clearRect(0, 0, w, h);
    tickPose(now);
    drawRobot(c, pos.x, pos.y);
    placeHit(pos.x, pos.y);
    placeHudNearRobot();
    hideHudSoon();

    // rebind AI button if ribbon repainted
    if (now - (frame._aiBind || 0) > 2000) {
      frame._aiBind = now;
      bindAiButton(false);
    }
  }

  function killJunk() {
    try {
      ['sn-silver-rive', 'sn-helper-fx'].forEach(function (id) {
        var el = $(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      var old = $('sn-helper-canvas');
      if (old) {
        old.style.opacity = '0';
        old.style.pointerEvents = 'none';
        old.style.visibility = 'hidden';
      }
    } catch (_) {}
  }

  function boot() {
    killJunk();
    ensureCanvas();
    ensureHit();
    ensureHud();
    var a = homeAnchor();
    pos.x = a.x;
    pos.y = a.y;
    if (!raf) raf = requestAnimationFrame(frame);
    bindAiButton(true);
    installCliHook();
    setTimeout(function () {
      bindAiButton(true);
      installCliHook();
    }, 2000);
    setTimeout(function () {
      bindAiButton(true);
    }, 5000);
  }

  window.addEventListener('resize', resize, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 800);
  setTimeout(boot, 2500);
  setTimeout(boot, 6000);

  var API = {
    build: BUILD,
    activate: activate,
    setMode: setMode,
    mode: function () {
      return MODE;
    },
    fly: flyNudge,
    speak: speak,
    ask: askMind,
    standby: function () {
      setMode('standby');
      global.__SN_SILVER_ACTIVE = false;
    },
  };
  global.SNChromeHelper = API;
  global.SNSilver = API;
})(typeof window !== 'undefined' ? window : globalThis);
