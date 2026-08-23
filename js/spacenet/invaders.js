/**
 * SNInvaders — Space Invaders cockpit mode
 * Phone tilt steers the ship · guns / lasers / missiles · no virtual joystick
 * CLI: invaders · space invaders · play invaders · cockpit · invaders close
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'sn-invaders-style';
  var ROOT_ID = 'sn-invaders-root';
  var open = false;
  var raf = 0;
  var lastT = 0;
  var canvas = null;
  var ctx = null;
  var W = 0;
  var H = 0;
  var dpr = 1;
  var phase = 'boot'; // boot | play | pause | over | win
  var score = 0;
  var lives = 3;
  var wave = 1;
  var shake = 0;
  var tiltCal = { beta: 0, gamma: 0, ready: false };
  var tilt = { x: 0, y: 0 }; // -1..1
  var keys = Object.create(null);
  var pointers = Object.create(null);
  var fireGun = false;
  var fireLaser = false;
  var fireMissile = false;
  var gunCd = 0;
  var laserCd = 0;
  var missileCd = 0;
  var laserHeat = 0;
  var audioCtx = null;
  var orientationBound = false;
  var player = null;
  var bullets = [];
  var missiles = [];
  var enemies = [];
  var particles = [];
  var stars = [];
  var hudMsg = '';
  var hudMsgT = 0;
  var startAt = 0;
  var killed = 0;
  var invaderDir = 1;
  var invaderStepY = 0;
  var invaderSpeed = 40;
  var needOrientPerm = false;

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
    } catch (_) {}
  }
  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(m);
    } catch (_) {}
  }
  function track(name, payload) {
    try {
      if (global.SNUsage && SNUsage.track) SNUsage.track(name, payload || {});
    } catch (_) {}
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      '#' +
      ROOT_ID +
      '{position:fixed;inset:0;z-index:14000;display:none;background:#000;touch-action:none;user-select:none;-webkit-user-select:none}' +
      '#' +
      ROOT_ID +
      '.open{display:block}' +
      '#' +
      ROOT_ID +
      ' canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-ui{position:absolute;inset:0;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#e8e8e8}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-top{position:absolute;top:max(10px,env(safe-area-inset-top));left:12px;right:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;font:600 12px/1.3 JetBrains Mono,ui-monospace,monospace;letter-spacing:.04em;text-shadow:0 0 12px rgba(255,255,255,.35)}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-exit{pointer-events:auto;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.55);color:#fff;border-radius:10px;padding:10px 14px;font:600 12px/1 Inter,system-ui,sans-serif;cursor:pointer;min-height:44px;min-width:44px}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-center{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center;max-width:min(420px,92vw);pointer-events:auto}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-center h1{margin:0 0 8px;font:700 22px/1.15 Space Grotesk,Inter,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-center p{margin:0 0 14px;color:#aaa;font:500 13px/1.45 Inter,system-ui,sans-serif}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-center button{pointer-events:auto;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:#fff;border-radius:12px;padding:14px 22px;font:600 14px/1 Inter,system-ui,sans-serif;cursor:pointer;min-height:48px;margin:4px}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-weapons{position:absolute;bottom:max(16px,env(safe-area-inset-bottom));left:0;right:0;display:flex;justify-content:center;gap:10px;pointer-events:none;font:600 11px/1 JetBrains Mono,ui-monospace,monospace;color:#9ab}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-weapons span{padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.4)}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-weapons span.on{border-color:rgba(61,158,255,.55);color:#cfe6ff;box-shadow:0 0 12px rgba(61,158,255,.35)}' +
      '#' +
      ROOT_ID +
      ' .sn-inv-weapons span.hot{border-color:rgba(255,80,80,.55);color:#ffb0b0}' +
      'body.sn-invaders-on #dock,body.sn-invaders-on #city-map,body.sn-invaders-on #globe{visibility:hidden !important}';
    document.head.appendChild(st);
  }

  function ensureDom() {
    ensureStyle();
    var root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-label', 'Space Invaders cockpit');
    root.innerHTML =
      '<canvas id="sn-inv-canvas"></canvas>' +
      '<div class="sn-inv-ui">' +
      '<div class="sn-inv-top">' +
      '<div id="sn-inv-stats">WAVE 1 · SCORE 0 · ♥♥♥</div>' +
      '<button type="button" class="sn-inv-exit" id="sn-inv-exit" title="Exit cockpit">EXIT</button>' +
      '</div>' +
      '<div class="sn-inv-center" id="sn-inv-center"></div>' +
      '<div class="sn-inv-weapons" id="sn-inv-weapons">' +
      '<span id="sn-inv-w-gun">GUN tap</span>' +
      '<span id="sn-inv-w-laser">LASER hold</span>' +
      '<span id="sn-inv-w-missile">MISSILE 2-finger</span>' +
      '</div>' +
      '</div>';
    document.body.appendChild(root);
    canvas = document.getElementById('sn-inv-canvas');
    ctx = canvas.getContext('2d');
    document.getElementById('sn-inv-exit').onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    bindInput(root);
    return root;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    W = Math.max(1, global.innerWidth || 360);
    H = Math.max(1, global.innerHeight || 640);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function beep(freq, dur, type, gain) {
    try {
      if (!audioCtx) audioCtx = new (global.AudioContext || global.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.value = gain == null ? 0.04 : gain;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.08));
      o.stop(audioCtx.currentTime + (dur || 0.08) + 0.02);
    } catch (_) {}
  }

  function resetWorld() {
    score = 0;
    lives = 3;
    wave = 1;
    killed = 0;
    shake = 0;
    gunCd = laserCd = missileCd = 0;
    laserHeat = 0;
    bullets = [];
    missiles = [];
    particles = [];
    player = {
      x: 0.5,
      y: 0.78,
      vx: 0,
      vy: 0,
      w: 0.07,
      h: 0.05,
    };
    stars = [];
    for (var i = 0; i < 90; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        z: 0.3 + Math.random() * 0.7,
        s: 0.5 + Math.random() * 1.8,
      });
    }
    spawnWave(wave);
    phase = 'play';
    startAt = performance.now();
    setCenter('');
    flash('COCKPIT ONLINE · TILT TO FLY');
  }

  function spawnWave(n) {
    enemies = [];
    invaderDir = 1;
    invaderStepY = 0;
    invaderSpeed = 36 + n * 8;
    var cols = Math.min(8, 5 + Math.floor(n / 2));
    var rows = Math.min(5, 3 + Math.floor((n - 1) / 2));
    var i, j, kind;
    for (j = 0; j < rows; j++) {
      for (i = 0; i < cols; i++) {
        kind = j === 0 ? 'boss' : j < 2 ? 'mid' : 'grunt';
        enemies.push({
          x: 0.18 + (i / Math.max(1, cols - 1)) * 0.64,
          y: 0.12 + j * 0.08,
          w: kind === 'boss' ? 0.07 : 0.055,
          h: 0.045,
          hp: kind === 'boss' ? 3 + n : kind === 'mid' ? 2 : 1,
          kind: kind,
          t: Math.random() * Math.PI * 2,
          shootCd: 1.2 + Math.random() * 2,
        });
      }
    }
  }

  function flash(msg) {
    hudMsg = msg;
    hudMsgT = 1.6;
  }

  function setCenter(html) {
    var el = document.getElementById('sn-inv-center');
    if (!el) return;
    el.innerHTML = html || '';
    el.style.display = html ? 'block' : 'none';
  }

  function showBoot() {
    phase = 'boot';
    needOrientPerm =
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
    setCenter(
      '<h1>INVADERS</h1>' +
        '<p>Screen becomes your spaceship cockpit. Tilt the phone to fly — no joystick. Tap for guns · hold for lasers · two fingers for missiles.</p>' +
        (needOrientPerm
          ? '<p style="color:#8ab">iOS needs motion permission once.</p>'
          : '<p style="color:#8ab">Desktop: A/D or ←/→ · W/S · Space gun · L laser · M missile</p>') +
        '<button type="button" id="sn-inv-start">ENTER COCKPIT</button>'
    );
    var b = document.getElementById('sn-inv-start');
    if (b) {
      b.onclick = function (e) {
        e.preventDefault();
        void beginPlay();
      };
    }
  }

  async function beginPlay() {
    try {
      if (!audioCtx) audioCtx = new (global.AudioContext || global.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
    } catch (_) {}
    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        var p = await DeviceOrientationEvent.requestPermission();
        if (p !== 'granted') flash('Motion denied · use A/D keys');
      }
    } catch (_) {
      flash('Motion soft · keyboard OK');
    }
    bindOrientation();
    resetWorld();
    track('invaders_start', { wave: 1 });
    beep(220, 0.1, 'sawtooth', 0.05);
    beep(440, 0.12, 'square', 0.04);
  }

  function bindOrientation() {
    if (orientationBound) return;
    orientationBound = true;
    global.addEventListener(
      'deviceorientation',
      function (ev) {
        if (!open || phase !== 'play') return;
        var beta = ev.beta; // front-back -180..180
        var gamma = ev.gamma; // left-right -90..90
        if (beta == null || gamma == null) return;
        if (!tiltCal.ready) {
          tiltCal.beta = beta;
          tiltCal.gamma = gamma;
          tiltCal.ready = true;
        }
        // gamma: left negative on many devices → map so tilt left = move left (screen)
        var gx = (gamma - tiltCal.gamma) / 28;
        var by = (beta - tiltCal.beta) / 32;
        // clamp
        if (gx > 1) gx = 1;
        if (gx < -1) gx = -1;
        if (by > 1) by = 1;
        if (by < -1) by = -1;
        // smooth
        tilt.x = tilt.x * 0.65 + gx * 0.35;
        tilt.y = tilt.y * 0.65 + by * 0.35;
      },
      true
    );
  }

  function bindInput(root) {
    root.addEventListener(
      'pointerdown',
      function (e) {
        if (e.target && e.target.id === 'sn-inv-exit') return;
        if (e.target && e.target.id === 'sn-inv-start') return;
        if (phase === 'boot' || phase === 'over' || phase === 'win') return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY, t: performance.now() };
        var n = Object.keys(pointers).length;
        if (n >= 2) {
          fireMissile = true;
          fireLaser = false;
          fireGun = false;
        } else {
          fireGun = true;
          fireLaser = true; // hold will keep laser after short time
        }
        try {
          root.setPointerCapture(e.pointerId);
        } catch (_) {}
      },
      { passive: true }
    );
    root.addEventListener(
      'pointerup',
      function (e) {
        delete pointers[e.pointerId];
        var n = Object.keys(pointers).length;
        if (n === 0) {
          fireGun = false;
          fireLaser = false;
          fireMissile = false;
        } else if (n === 1) {
          fireMissile = false;
          fireGun = true;
          fireLaser = true;
        }
      },
      { passive: true }
    );
    root.addEventListener(
      'pointercancel',
      function (e) {
        delete pointers[e.pointerId];
        if (!Object.keys(pointers).length) {
          fireGun = fireLaser = fireMissile = false;
        }
      },
      { passive: true }
    );
    global.addEventListener('keydown', function (e) {
      if (!open) return;
      keys[e.code] = true;
      if (e.code === 'Escape') {
        e.preventDefault();
        close();
      }
      if (e.code === 'KeyP' && phase === 'play') {
        phase = 'pause';
        setCenter('<h1>PAUSED</h1><p>Tap or press P</p><button type="button" id="sn-inv-resume">RESUME</button>');
        var r = document.getElementById('sn-inv-resume');
        if (r)
          r.onclick = function () {
            phase = 'play';
            setCenter('');
          };
      } else if (e.code === 'KeyP' && phase === 'pause') {
        phase = 'play';
        setCenter('');
      }
    });
    global.addEventListener('keyup', function (e) {
      keys[e.code] = false;
    });
    global.addEventListener('blur', function () {
      keys = Object.create(null);
      fireGun = fireLaser = fireMissile = false;
      pointers = Object.create(null);
    });
    global.addEventListener('resize', function () {
      if (open) resize();
    });
  }

  function inputAxes() {
    var ax = tilt.x;
    var ay = tilt.y;
    // Keyboard desktop fallback — A left D right (player-visible)
    if (keys.KeyA || keys.ArrowLeft) ax = Math.min(1, ax - 1);
    if (keys.KeyD || keys.ArrowRight) ax = Math.max(-1, ax + 1);
    // Invert keyboard so A = left on screen: KeyA should decrease x (left)
    // Wait: in 2D canvas, x increases right. A should move ship LEFT → decrease x.
    // so KeyA → ax negative contribution.
    // I wrote KeyA: ax = ax - 1 which is correct for left.
    // But I also wrote KeyD: ax = ax + 1 for right. Good.
    // Device gamma: typically tilt right (device clockwise) → positive gamma → ship should go right → ax positive.
    // tilt.x from gamma is positive when tilting right - good.
    if (keys.KeyW || keys.ArrowUp) ay = Math.min(1, ay - 0.9);
    if (keys.KeyS || keys.ArrowDown) ay = Math.max(-1, ay + 0.9);
    if (keys.Space || keys.KeyZ) fireGun = true;
    if (keys.KeyL || keys.KeyX) fireLaser = true;
    if (keys.KeyM || keys.KeyC) fireMissile = true;
    if (ax > 1) ax = 1;
    if (ax < -1) ax = -1;
    if (ay > 1) ay = 1;
    if (ay < -1) ay = -1;
    return { ax: ax, ay: ay };
  }

  function spawnBullet(x, y, vy, friendly, kind) {
    bullets.push({
      x: x,
      y: y,
      vy: vy,
      friendly: !!friendly,
      kind: kind || 'gun',
      life: 2.2,
      w: kind === 'laser' ? 0.012 : 0.008,
      h: kind === 'laser' ? 0.06 : 0.028,
      dmg: kind === 'laser' ? 2 : 1,
    });
  }

  function spawnMissile(x, y) {
    missiles.push({
      x: x,
      y: y,
      vy: -0.55,
      life: 3,
      target: null,
      w: 0.02,
      h: 0.04,
    });
    beep(90, 0.15, 'sawtooth', 0.06);
  }

  function burst(x, y, color, n) {
    var i;
    for (i = 0; i < (n || 10); i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        life: 0.35 + Math.random() * 0.4,
        color: color || '#fff',
        s: 1 + Math.random() * 2.5,
      });
    }
  }

  function hitPlayer() {
    lives -= 1;
    shake = 0.45;
    burst(player.x, player.y, '#ff5566', 18);
    beep(80, 0.2, 'square', 0.07);
    flash(lives > 0 ? 'HIT · ' + lives + ' left' : 'HULL DESTROYED');
    if (lives <= 0) {
      phase = 'over';
      track('invaders_over', { score: score, wave: wave });
      setCenter(
        '<h1>DESTROYED</h1><p>Score ' +
          score +
          ' · Wave ' +
          wave +
          '</p><button type="button" id="sn-inv-retry">RELAUNCH</button><button type="button" id="sn-inv-quit">EXIT</button>'
      );
      var r = document.getElementById('sn-inv-retry');
      var q = document.getElementById('sn-inv-quit');
      if (r)
        r.onclick = function () {
          resetWorld();
        };
      if (q)
        q.onclick = function () {
          close();
        };
    }
  }

  function update(dt) {
    if (phase !== 'play') return;
    var inp = inputAxes();
    // Ship motion — screen coords 0..1; A/left decreases x
    var speed = 0.95;
    player.vx = player.vx * 0.78 + inp.ax * speed * 0.22;
    player.vy = player.vy * 0.78 + inp.ay * speed * 0.14;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (player.x < 0.06) {
      player.x = 0.06;
      player.vx = 0;
    }
    if (player.x > 0.94) {
      player.x = 0.94;
      player.vx = 0;
    }
    if (player.y < 0.55) {
      player.y = 0.55;
      player.vy = 0;
    }
    if (player.y > 0.9) {
      player.y = 0.9;
      player.vy = 0;
    }

    gunCd -= dt;
    laserCd -= dt;
    missileCd -= dt;
    if (laserHeat > 0 && !fireLaser) laserHeat = Math.max(0, laserHeat - dt * 0.55);

    var holding = Object.keys(pointers).length > 0 || keys.Space || keys.KeyZ || keys.KeyL || keys.KeyX;
    if (fireGun && gunCd <= 0 && !fireMissile) {
      // short tap gun; continuous while held also fires gun between laser pulses
      spawnBullet(player.x - 0.02, player.y - 0.03, -1.35, true, 'gun');
      spawnBullet(player.x + 0.02, player.y - 0.03, -1.35, true, 'gun');
      gunCd = 0.14;
      beep(660, 0.04, 'square', 0.03);
    }
    if (fireLaser && holding && laserCd <= 0 && laserHeat < 1 && !fireMissile) {
      spawnBullet(player.x, player.y - 0.04, -1.9, true, 'laser');
      laserCd = 0.07;
      laserHeat += 0.06;
      if (laserHeat >= 1) flash('LASER OVERHEAT');
      beep(980, 0.03, 'triangle', 0.025);
    }
    if (fireMissile && missileCd <= 0) {
      spawnMissile(player.x, player.y - 0.05);
      missileCd = 1.1;
      fireMissile = false;
    }

    // clear edge-triggered keyboard fire so single press works
    if (!keys.Space && !keys.KeyZ && Object.keys(pointers).length === 0) fireGun = false;
    if (!keys.KeyL && !keys.KeyX && Object.keys(pointers).length === 0) fireLaser = false;
    if (!keys.KeyM && !keys.KeyC) fireMissile = false;

    // stars
    var i, s, e, b, m, best, bd, j, dx, dy;
    for (i = 0; i < stars.length; i++) {
      s = stars[i];
      s.y += (0.08 + s.z * 0.35 + Math.max(0, -player.vy) * 0.2) * dt;
      if (s.y > 1) {
        s.y = 0;
        s.x = Math.random();
      }
    }

    // invaders formation
    var minX = 1;
    var maxX = 0;
    var maxY = 0;
    for (i = 0; i < enemies.length; i++) {
      e = enemies[i];
      if (e.x < minX) minX = e.x;
      if (e.x > maxX) maxX = e.x;
      if (e.y > maxY) maxY = e.y;
    }
    if (enemies.length) {
      if ((invaderDir > 0 && maxX > 0.92) || (invaderDir < 0 && minX < 0.08)) {
        invaderDir *= -1;
        invaderStepY = 0.028;
      }
      for (i = 0; i < enemies.length; i++) {
        e = enemies[i];
        e.t += dt * 3;
        e.x += invaderDir * (invaderSpeed / 1000) * dt * 8.5;
        if (invaderStepY) e.y += invaderStepY;
        e.shootCd -= dt;
        if (e.shootCd <= 0 && e.y < 0.7) {
          e.shootCd = 1.4 + Math.random() * (2.2 - Math.min(1.2, wave * 0.15));
          if (Math.random() < 0.35 + wave * 0.04) {
            spawnBullet(e.x, e.y + 0.03, 0.55 + Math.random() * 0.25, false, 'enemy');
          }
        }
        // collide player
        if (Math.abs(e.x - player.x) < (e.w + player.w) * 0.45 && Math.abs(e.y - player.y) < (e.h + player.h) * 0.5) {
          e.hp = 0;
          hitPlayer();
        }
        if (e.y > 0.92) {
          hitPlayer();
          e.hp = 0;
        }
      }
      invaderStepY = 0;
      enemies = enemies.filter(function (en) {
        return en.hp > 0;
      });
    }

    // bullets
    for (i = bullets.length - 1; i >= 0; i--) {
      b = bullets[i];
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y < -0.05 || b.y > 1.05) {
        bullets.splice(i, 1);
        continue;
      }
      if (b.friendly) {
        for (j = enemies.length - 1; j >= 0; j--) {
          e = enemies[j];
          if (Math.abs(b.x - e.x) < e.w * 0.55 && Math.abs(b.y - e.y) < e.h * 0.7) {
            e.hp -= b.dmg;
            bullets.splice(i, 1);
            burst(e.x, e.y, b.kind === 'laser' ? '#3d9eff' : '#fff', 6);
            if (e.hp <= 0) {
              score += e.kind === 'boss' ? 150 : e.kind === 'mid' ? 75 : 40;
              killed++;
              beep(320, 0.06, 'square', 0.04);
              enemies.splice(j, 1);
            }
            break;
          }
        }
      } else {
        if (Math.abs(b.x - player.x) < player.w * 0.5 && Math.abs(b.y - player.y) < player.h * 0.55) {
          bullets.splice(i, 1);
          hitPlayer();
        }
      }
    }

    // missiles — seek nearest
    for (i = missiles.length - 1; i >= 0; i--) {
      m = missiles[i];
      best = null;
      bd = 1e9;
      for (j = 0; j < enemies.length; j++) {
        e = enemies[j];
        dx = e.x - m.x;
        dy = e.y - m.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          best = e;
        }
      }
      if (best) {
        m.x += (best.x - m.x) * Math.min(1, 4.5 * dt);
        m.y += Math.min(-0.25, (best.y - m.y) * 2.2) * dt * 60 * 0.016;
        m.y += m.vy * dt * 0.35;
      } else {
        m.y += m.vy * dt;
      }
      m.life -= dt;
      burst(m.x, m.y + 0.02, '#ff8844', 1);
      var hit = false;
      for (j = enemies.length - 1; j >= 0; j--) {
        e = enemies[j];
        if (Math.abs(m.x - e.x) < e.w * 0.7 && Math.abs(m.y - e.y) < e.h * 0.8) {
          e.hp -= 4;
          hit = true;
          burst(e.x, e.y, '#ff6622', 16);
          shake = 0.25;
          score += 20;
          if (e.hp <= 0) {
            score += e.kind === 'boss' ? 150 : 60;
            killed++;
            enemies.splice(j, 1);
          }
          break;
        }
      }
      if (hit || m.life <= 0 || m.y < -0.05) missiles.splice(i, 1);
    }

    // particles
    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (shake > 0) shake = Math.max(0, shake - dt);

    if (!enemies.length && phase === 'play') {
      wave += 1;
      score += 200;
      flash('WAVE ' + wave);
      beep(520, 0.1, 'square', 0.05);
      beep(780, 0.12, 'square', 0.05);
      spawnWave(wave);
      track('invaders_wave', { wave: wave, score: score });
      if (wave > 12) {
        phase = 'win';
        setCenter(
          '<h1>SECTOR CLEAR</h1><p>Score ' +
            score +
            '</p><button type="button" id="sn-inv-retry">AGAIN</button><button type="button" id="sn-inv-quit">EXIT</button>'
        );
        var r2 = document.getElementById('sn-inv-retry');
        var q2 = document.getElementById('sn-inv-quit');
        if (r2)
          r2.onclick = function () {
            resetWorld();
          };
        if (q2)
          q2.onclick = function () {
            close();
          };
      }
    }

    if (hudMsgT > 0) hudMsgT -= dt;
    updateHud();
  }

  function updateHud() {
    var el = document.getElementById('sn-inv-stats');
    if (el) {
      var hearts = '';
      var i;
      for (i = 0; i < lives; i++) hearts += '♥';
      for (i = lives; i < 3; i++) hearts += '♡';
      el.textContent =
        'WAVE ' + wave + ' · SCORE ' + score + ' · ' + hearts + (hudMsgT > 0 ? ' · ' + hudMsg : '');
    }
    var g = document.getElementById('sn-inv-w-gun');
    var l = document.getElementById('sn-inv-w-laser');
    var m = document.getElementById('sn-inv-w-missile');
    if (g) g.className = fireGun ? 'on' : '';
    if (l) l.className = laserHeat >= 1 ? 'hot' : fireLaser ? 'on' : '';
    if (m) m.className = fireMissile || missileCd > 0.9 ? 'on' : '';
  }

  function drawShip(px, py, bank) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(bank * 0.35);
    // cockpit glass
    ctx.fillStyle = 'rgba(80,160,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(18, 8);
    ctx.lineTo(10, 16);
    ctx.lineTo(-10, 16);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // hull
    ctx.fillStyle = '#d8d8d8';
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(22, 12);
    ctx.lineTo(8, 20);
    ctx.lineTo(-8, 20);
    ctx.lineTo(-22, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(-6, -8, 12, 14);
    // engines
    ctx.fillStyle = '#3d9eff';
    ctx.shadowColor = '#3d9eff';
    ctx.shadowBlur = 12;
    ctx.fillRect(-14, 18, 8, 10);
    ctx.fillRect(6, 18, 8, 10);
    ctx.shadowBlur = 0;
    // guns
    ctx.fillStyle = '#888';
    ctx.fillRect(-16, -4, 3, 14);
    ctx.fillRect(13, -4, 3, 14);
    ctx.restore();
  }

  function drawEnemy(e) {
    var px = e.x * W;
    var py = e.y * H;
    var bob = Math.sin(e.t) * 3;
    ctx.save();
    ctx.translate(px, py + bob);
    var col = e.kind === 'boss' ? '#ff4466' : e.kind === 'mid' ? '#ffaa33' : '#6fdf6f';
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
    var hw = e.w * W * 0.5;
    var hh = e.h * H * 0.5;
    ctx.beginPath();
    ctx.moveTo(-hw, -hh * 0.2);
    ctx.lineTo(-hw * 0.5, -hh);
    ctx.lineTo(hw * 0.5, -hh);
    ctx.lineTo(hw, -hh * 0.2);
    ctx.lineTo(hw * 0.7, hh);
    ctx.lineTo(-hw * 0.7, hh);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.fillRect(-hw * 0.35, -hh * 0.35, hw * 0.25, hh * 0.25);
    ctx.fillRect(hw * 0.1, -hh * 0.35, hw * 0.25, hh * 0.25);
    ctx.restore();
  }

  function drawCockpitChrome() {
    // vignette + canopy frame
    var g = ctx.createRadialGradient(W * 0.5, H * 0.55, H * 0.1, W * 0.5, H * 0.5, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.65, 'rgba(0,0,0,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.18);
    ctx.quadraticCurveTo(W * 0.5, H * 0.02, W, H * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, H * 0.72);
    ctx.quadraticCurveTo(W * 0.5, H * 0.88, W, H * 0.72);
    ctx.stroke();
    // side pillars
    ctx.fillStyle = 'rgba(12,12,14,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W * 0.08, 0);
    ctx.lineTo(W * 0.02, H);
    ctx.lineTo(0, H);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W * 0.92, 0);
    ctx.lineTo(W * 0.98, H);
    ctx.lineTo(W, H);
    ctx.fill();
    // HUD reticle
    ctx.strokeStyle = 'rgba(61,158,255,0.35)';
    ctx.lineWidth = 1;
    var cx = W * 0.5 + player.vx * 40;
    var cy = H * 0.42 + player.vy * 30;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 28, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx + 28, cy);
    ctx.moveTo(cx, cy - 28);
    ctx.lineTo(cx, cy - 10);
    ctx.moveTo(cx, cy + 10);
    ctx.lineTo(cx, cy + 28);
    ctx.stroke();
    // instrument strip
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(W * 0.18, H * 0.9, W * 0.64, H * 0.07);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(W * 0.18, H * 0.9, W * 0.64, H * 0.07);
    ctx.fillStyle = '#3d9eff';
    ctx.fillRect(W * 0.2, H * 0.925, W * 0.2 * (1 - laserHeat), 6);
    ctx.fillStyle = '#888';
    ctx.font = '10px JetBrains Mono,monospace';
    ctx.fillText('LASER', W * 0.2, H * 0.92);
    ctx.fillStyle = missileCd > 0 ? '#555' : '#ff8844';
    ctx.fillText(missileCd > 0 ? 'MISSILE RD' : 'MISSILE RDY', W * 0.48, H * 0.935);
    ctx.fillStyle = '#aaa';
    ctx.fillText('TILT ' + (tiltCal.ready ? 'LOCK' : '…'), W * 0.68, H * 0.935);
  }

  function draw() {
    if (!ctx) return;
    var ox = 0;
    var oy = 0;
    if (shake > 0) {
      ox = (Math.random() - 0.5) * shake * 16;
      oy = (Math.random() - 0.5) * shake * 16;
    }
    ctx.save();
    ctx.translate(ox, oy);
    // space
    ctx.fillStyle = '#02040a';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    var i, s, b, m, e;
    for (i = 0; i < stars.length; i++) {
      s = stars[i];
      ctx.globalAlpha = 0.35 + s.z * 0.65;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    for (i = 0; i < enemies.length; i++) drawEnemy(enemies[i]);

    for (i = 0; i < bullets.length; i++) {
      b = bullets[i];
      if (b.kind === 'laser') {
        ctx.strokeStyle = 'rgba(80,180,255,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x * W, b.y * H);
        ctx.lineTo(b.x * W, b.y * H + b.h * H);
        ctx.stroke();
      } else if (b.friendly) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(b.x * W - 2, b.y * H, 4, b.h * H);
      } else {
        ctx.fillStyle = '#ff4455';
        ctx.fillRect(b.x * W - 2, b.y * H, 4, 10);
      }
    }
    for (i = 0; i < missiles.length; i++) {
      m = missiles[i];
      ctx.fillStyle = '#ff8844';
      ctx.shadowColor = '#ff5522';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(m.x * W, m.y * H - 10);
      ctx.lineTo(m.x * W + 5, m.y * H + 8);
      ctx.lineTo(m.x * W - 5, m.y * H + 8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * W, p.y * H, p.s, p.s);
    }
    ctx.globalAlpha = 1;

    drawShip(player.x * W, player.y * H, player.vx);
    drawCockpitChrome();
    ctx.restore();
  }

  var engineUnsub = null;
  function frame(now, dtMs) {
    if (!open) return;
    if (!engineUnsub) raf = requestAnimationFrame(function (t) { frame(t); });
    if (!lastT) lastT = now;
    var dt = dtMs != null ? dtMs / 1000 : (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.1) dt = 0.1;
    if (phase === 'play') update(dt);
    else if (phase === 'boot' || phase === 'pause' || phase === 'over' || phase === 'win') {
      if (player) {
        var i, s;
        for (i = 0; i < stars.length; i++) {
          s = stars[i];
          s.y += 0.05 * dt;
          if (s.y > 1) {
            s.y = 0;
            s.x = Math.random();
          }
        }
      }
    }
    draw();
  }

  function openGame() {
    ensureDom();
    resize();
    open = true;
    document.body.classList.add('sn-invaders-on');
    document.getElementById(ROOT_ID).classList.add('open');
    // seed empty player for boot draw
    if (!player) {
      player = { x: 0.5, y: 0.78, vx: 0, vy: 0, w: 0.07, h: 0.05 };
      stars = [];
      for (var i = 0; i < 90; i++) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          z: 0.3 + Math.random() * 0.7,
          s: 0.5 + Math.random() * 1.8,
        });
      }
    }
    showBoot();
    lastT = 0;
    if (global.SNGameLoop && SNGameLoop.subscribe && !engineUnsub) {
      engineUnsub = SNGameLoop.subscribe(
        function (dtMs, now) {
          frame(now || performance.now(), dtMs);
        },
        { lane: 'critical', name: 'invaders' }
      );
    } else if (!raf) {
      raf = requestAnimationFrame(function (t) {
        frame(t);
      });
    }
    log('Invaders cockpit · tilt phone · tap guns · hold laser · 2-finger missile', 'ok');
    preview('ENTER COCKPIT');
    track('invaders_open');
    // QA probe
    global.__controlsTest = {
      getYaw: function () {
        return player ? player.x : 0;
      },
      getSpeed: function () {
        return player ? Math.hypot(player.vx, player.vy) : 0;
      },
      setSteer: function (v) {
        tilt.x = Math.max(-1, Math.min(1, Number(v) || 0));
      },
      setKeys: function (codes) {
        keys = Object.create(null);
        (codes || []).forEach(function (c) {
          keys[c] = true;
        });
      },
      getPhase: function () {
        return phase;
      },
    };
  }

  function close() {
    open = false;
    phase = 'boot';
    document.body.classList.remove('sn-invaders-on');
    var root = document.getElementById(ROOT_ID);
    if (root) root.classList.remove('open');
    if (engineUnsub) {
      try {
        engineUnsub();
      } catch (_) {}
      engineUnsub = null;
    }
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastT = 0;
    fireGun = fireLaser = fireMissile = false;
    pointers = Object.create(null);
    keys = Object.create(null);
    setCenter('');
    log('Invaders closed · Earth online', 'dim');
    preview('Earth');
    track('invaders_close', { score: score, wave: wave });
    try {
      if (global.__controlsTest) delete global.__controlsTest;
    } catch (_) {}
  }

  function wantsInvaders(text) {
    var low = String(text || '').toLowerCase();
    return (
      /\b(space\s*invaders?|invaders?|play\s+(the\s+)?game|cockpit|space\s*war|space\s*battle|shoot\s*aliens?|arcade\s*space)\b/.test(
        low
      ) || /^(game|play game|start game|invader)\b/.test(low)
    );
  }

  function init() {
    ensureDom();
  }

  global.SNInvaders = {
    init: init,
    open: openGame,
    start: openGame,
    close: close,
    wantsInvaders: wantsInvaders,
    get openFlag() {
      return open;
    },
    get score() {
      return score;
    },
    get wave() {
      return wave;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
