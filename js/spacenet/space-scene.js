/**
 * SNSpaceScene — Real-Earth OS becomes the game scene
 * ====================================================
 * NOT a 2D overlay. Craft, hostiles, beacons live in the same Three.js
 * world as SNGlobe Earth + outer space. Camera chases the craft in orbit.
 *
 * CLI: space scene · earth ops · play levels · orbit · gaming
 * WASD: W throttle · S brake · A bank/yaw left · D right · Space fire · Esc exit
 */
(function (global) {
  'use strict';

  var active = false;
  var phase = 'idle'; // idle | brief | play | clear | dead
  var level = 0;
  var score = 0;
  var lives = 3;
  var unsub = null;
  var keys = Object.create(null);
  var fireCd = 0;
  var invuln = 0;
  var briefT = 0;
  var message = '';
  var root = null; // THREE.Group in scene
  var craft = null;
  var craftGlow = null;
  var beacons = [];
  var hostiles = [];
  var bullets = [];
  var thrusters = [];
  var hud = null;
  var joy = { active: false, x: 0, y: 0, ox: 0, oy: 0, id: null };
  var fireTouch = false;
  var mountedHud = false;
  var saveCam = null;
  var R_ORBIT = 1.35;
  var R_MIN = 1.16;
  var R_MAX = 1.72;
  var CRAFT_SCALE = 1.05;

  // Craft state in world space (Earth center = origin, radius 1)
  var ship = {
    pos: null,
    forward: null,
    up: null,
    right: null,
    speed: 0,
    yawRate: 0,
    roll: 0,
  };
  var yawAccum = 0; // integrated steer for __controlsTest (A → +)

  var LEVELS = [
    { name: 'Athens Orbit', beacons: 4, hostiles: 2, speed: 1.0, story: 'Enter low Earth orbit · collect beacons' },
    { name: 'Med Corridor', beacons: 5, hostiles: 4, speed: 1.12, story: 'Hostile drones on the Mediterranean dark side' },
    { name: 'Atlantic Gate', beacons: 6, hostiles: 6, speed: 1.22, story: 'Storm belt · hold heading' },
    { name: 'Polar Vault', beacons: 7, hostiles: 8, speed: 1.32, story: 'Night side · full combat loadout' },
    { name: 'Lunar Relay', beacons: 8, hostiles: 10, speed: 1.45, story: 'High orbit · final clear' },
  ];

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
  function THREE() {
    return global.THREE;
  }
  function globeReady() {
    return global.SNGlobe && SNGlobe.ready && SNGlobe.getScene && SNGlobe.getScene() && THREE();
  }

  function latLngAlt(lat, lng, r) {
    var T = THREE();
    var phi = ((90 - lat) * Math.PI) / 180;
    var theta = ((lng + 180) * Math.PI) / 180;
    var x = -r * Math.sin(phi) * Math.cos(theta);
    var z = r * Math.sin(phi) * Math.sin(theta);
    var y = r * Math.cos(phi);
    return new T.Vector3(x, y, z);
  }

  function ensureHud() {
    if (hud && document.body.contains(hud)) return hud;
    var st = document.getElementById('sn-space-scene-css');
    if (!st) {
      st = document.createElement('style');
      st.id = 'sn-space-scene-css';
      st.textContent = [
        '#sn-space-hud{position:fixed;inset:0;z-index:120;pointer-events:none;font-family:system-ui,sans-serif;color:#e8f4ff}',
        '#sn-space-hud .ssh-top{position:absolute;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);',
        'display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;max-width:min(520px,92vw)}',
        '#sn-space-hud .ssh-title{font:800 11px/1 system-ui;letter-spacing:.16em;text-transform:uppercase;color:#6ab0ff;',
        'text-shadow:0 0 14px rgba(40,140,255,.8)}',
        '#sn-space-hud .ssh-msg{font:700 15px/1.25 system-ui;text-shadow:0 0 16px rgba(0,100,255,.5)}',
        '#sn-space-hud .ssh-stats{display:flex;gap:14px;font:600 12px/1 ui-monospace,monospace;color:#9ec4f0;margin-top:4px}',
        '#sn-space-hud .ssh-stats b{color:#7ec8ff;font-weight:800}',
        '#sn-space-hud .ssh-hint{font:500 11px/1.3 system-ui;color:#6a90b8;margin-top:2px}',
        '#sn-space-hud .ssh-touch{pointer-events:auto;position:absolute;left:0;right:0;bottom:0;height:42%;display:none}',
        '#sn-space-hud.touch .ssh-touch{display:block}',
        '#sn-space-hud .ssh-stick{position:absolute;left:28px;bottom:28px;width:96px;height:96px;border-radius:50%;',
        'border:1.5px solid rgba(60,140,255,.45);background:rgba(0,12,36,.35)}',
        '#sn-space-hud .ssh-knob{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;',
        'background:radial-gradient(circle at 35% 35%,#c8e8ff,#1a6fd4);box-shadow:0 0 16px rgba(40,140,255,.6)}',
        '#sn-space-hud .ssh-fire{position:absolute;right:28px;bottom:36px;width:72px;height:72px;border-radius:50%;',
        'border:1.5px solid rgba(0,220,160,.5);background:rgba(0,80,60,.4);color:#8fffd4;font:800 12px system-ui;',
        'display:flex;align-items:center;justify-content:center;box-shadow:0 0 20px rgba(0,200,140,.3)}',
        '#sn-space-hud .ssh-exit{pointer-events:auto;position:absolute;top:max(12px,env(safe-area-inset-top));right:12px;',
        'min-height:40px;padding:8px 12px;border-radius:12px;border:1px solid rgba(80,140,220,.4);',
        'background:rgba(0,12,32,.75);color:#b8d4f0;font:700 11px system-ui;cursor:pointer}',
        'body.sn-space-scene-on #sn-game-dock{opacity:.35;pointer-events:none}',
        'body.sn-space-scene-on #sn-earth-ops-chip{display:none!important}',
        'body.sn-space-scene-on #sn-helper-canvas{opacity:.15!important}',
        'body.sn-space-scene-on #sn-city-labels{display:none!important}',
        'body.sn-space-scene-on .globe-label,body.sn-space-scene-on .city-label,body.sn-space-scene-on #sn-city-labels{opacity:0!important;pointer-events:none!important;visibility:hidden!important}',
      ].join('');
      document.head.appendChild(st);
    }
    hud = document.createElement('div');
    hud.id = 'sn-space-hud';
    hud.innerHTML =
      '<button type="button" class="ssh-exit" data-exit>EXIT SCENE</button>' +
      '<div class="ssh-top">' +
      '<div class="ssh-title">SPACE SCENE · REAL EARTH</div>' +
      '<div class="ssh-msg" data-msg>…</div>' +
      '<div class="ssh-stats"><span>LVL <b data-lv>1</b></span><span>SCORE <b data-sc>0</b></span><span>HULL <b data-lv-h>3</b></span></div>' +
      '<div class="ssh-hint">WASD fly · Space fire · Esc exit · You are in orbit — Earth is the world</div>' +
      '</div>' +
      '<div class="ssh-touch">' +
      '<div class="ssh-stick" data-stick><div class="ssh-knob" data-knob></div></div>' +
      '<div class="ssh-fire" data-fire>FIRE</div>' +
      '</div>';
    document.body.appendChild(hud);
    hud.querySelector('[data-exit]').onclick = function () {
      stop();
    };
    bindTouch(hud);
    mountedHud = true;
    return hud;
  }

  function bindTouch(el) {
    var stick = el.querySelector('[data-stick]');
    var knob = el.querySelector('[data-knob]');
    var fire = el.querySelector('[data-fire]');
    if (!stick) return;
    function setKnob(x, y) {
      var r = 28;
      var m = Math.hypot(x, y) || 1;
      if (m > r) {
        x = (x / m) * r;
        y = (y / m) * r;
      }
      knob.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      joy.x = x / r;
      joy.y = y / r;
    }
    stick.addEventListener(
      'pointerdown',
      function (e) {
        joy.active = true;
        joy.id = e.pointerId;
        joy.ox = e.clientX;
        joy.oy = e.clientY;
        try {
          stick.setPointerCapture(e.pointerId);
        } catch (_) {}
        e.preventDefault();
      },
      { passive: false }
    );
    stick.addEventListener(
      'pointermove',
      function (e) {
        if (!joy.active || e.pointerId !== joy.id) return;
        setKnob(e.clientX - joy.ox, e.clientY - joy.oy);
      },
      { passive: true }
    );
    function endJoy(e) {
      if (e && joy.id != null && e.pointerId !== joy.id) return;
      joy.active = false;
      joy.x = 0;
      joy.y = 0;
      joy.id = null;
      knob.style.transform = 'translate(0,0)';
    }
    stick.addEventListener('pointerup', endJoy);
    stick.addEventListener('pointercancel', endJoy);
    fire.addEventListener(
      'pointerdown',
      function (e) {
        fireTouch = true;
        e.preventDefault();
      },
      { passive: false }
    );
    fire.addEventListener('pointerup', function () {
      fireTouch = false;
    });
    fire.addEventListener('pointercancel', function () {
      fireTouch = false;
    });
  }

  function paintHud() {
    if (!hud) return;
    var msg = hud.querySelector('[data-msg]');
    var lv = hud.querySelector('[data-lv]');
    var sc = hud.querySelector('[data-sc]');
    var h = hud.querySelector('[data-lv-h]');
    if (msg) msg.textContent = message || '';
    if (lv) lv.textContent = String(level + 1);
    if (sc) sc.textContent = String(score);
    if (h) h.textContent = String(lives);
    var touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    hud.classList.toggle('touch', !!touch);
  }

  function rebuildShipBasis() {
    var T = THREE();
    // up = radial out from Earth
    ship.up = ship.pos.clone().normalize();
    // keep forward tangent: remove radial component
    ship.forward.addScaledVector(ship.up, -ship.forward.dot(ship.up));
    if (ship.forward.lengthSq() < 1e-8) {
      // seed a tangent
      var seed = Math.abs(ship.up.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
      ship.forward.crossVectors(seed, ship.up).normalize();
    } else ship.forward.normalize();
    ship.right.crossVectors(ship.forward, ship.up).normalize();
    // re-orthogonalize forward
    ship.forward.crossVectors(ship.up, ship.right).normalize().negate();
    ship.forward.crossVectors(ship.right, ship.up).normalize();
  }

  function makeCraftMesh() {
    var T = THREE();
    var g = new T.Group();
    var s = CRAFT_SCALE;
    // Emissive-only materials so craft always reads on Earth (no light dependency)
    var body = new T.Mesh(
      new T.ConeGeometry(0.018 * s, 0.055 * s, 10),
      new T.MeshBasicMaterial({ color: 0xb8e0ff })
    );
    body.rotation.x = Math.PI / 2;
    g.add(body);
    var wing = new T.Mesh(
      new T.BoxGeometry(0.08 * s, 0.005 * s, 0.024 * s),
      new T.MeshBasicMaterial({ color: 0x7ec8ff })
    );
    wing.position.z = -0.01 * s;
    g.add(wing);
    var fin = new T.Mesh(
      new T.BoxGeometry(0.006 * s, 0.028 * s, 0.02 * s),
      new T.MeshBasicMaterial({ color: 0x5aa8f0 })
    );
    fin.position.set(0, 0.012 * s, -0.015 * s);
    g.add(fin);
    var nose = new T.Mesh(
      new T.SphereGeometry(0.01 * s, 10, 10),
      new T.MeshBasicMaterial({ color: 0xffffff })
    );
    nose.position.z = 0.028 * s;
    g.add(nose);
    craftGlow = new T.Mesh(
      new T.SphereGeometry(0.018 * s, 10, 10),
      new T.MeshBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.95 })
    );
    craftGlow.position.z = -0.032 * s;
    g.add(craftGlow);
    var halo = new T.Mesh(
      new T.SphereGeometry(0.014 * s, 10, 10),
      new T.MeshBasicMaterial({ color: 0x4ab0ff, transparent: true, opacity: 0.2, depthWrite: false })
    );
    g.add(halo);
    var light = new T.PointLight(0x80d0ff, 2.2, 1.8);
    light.position.z = -0.02 * s;
    g.add(light);
    return g;
  }

  function makeBeacon(pos) {
    var T = THREE();
    var g = new T.Group();
    var core = new T.Mesh(
      new T.OctahedronGeometry(0.032, 0),
      new T.MeshBasicMaterial({ color: 0x5eead4 })
    );
    var ring = new T.Mesh(
      new T.TorusGeometry(0.055, 0.005, 8, 24),
      new T.MeshBasicMaterial({ color: 0x2a9fff, transparent: true, opacity: 0.75 })
    );
    ring.lookAt(pos.clone().multiplyScalar(2));
    g.add(core);
    g.add(ring);
    g.position.copy(pos);
    g.userData = { kind: 'beacon', life: 1, spin: Math.random() * 6 };
    return g;
  }

  function makeHostile(pos) {
    var T = THREE();
    var g = new T.Group();
    var body = new T.Mesh(
      new T.OctahedronGeometry(0.03, 0),
      new T.MeshStandardMaterial({
        color: 0xff6644,
        emissive: 0x661100,
        emissiveIntensity: 0.6,
        metalness: 0.5,
        roughness: 0.45,
      })
    );
    g.add(body);
    g.position.copy(pos);
    var vel = new T.Vector3().randomDirection();
    var up = pos.clone().normalize();
    vel.addScaledVector(up, -vel.dot(up)).normalize().multiplyScalar(0.08 + Math.random() * 0.06);
    g.userData = { kind: 'hostile', vel: vel, hp: 1 };
    return g;
  }

  function clearEntities() {
    beacons.forEach(function (b) {
      if (b.parent) b.parent.remove(b);
      disposeObj(b);
    });
    hostiles.forEach(function (h) {
      if (h.parent) h.parent.remove(h);
      disposeObj(h);
    });
    bullets.forEach(function (b) {
      if (b.mesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
      if (b.mesh) disposeObj(b.mesh);
    });
    beacons = [];
    hostiles = [];
    bullets = [];
  }

  function disposeObj(o) {
    try {
      o.traverse(function (c) {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(function (m) { m.dispose(); });
          else c.material.dispose();
        }
      });
    } catch (_) {}
  }

  function spawnLevel() {
    clearEntities();
    var L = LEVELS[Math.min(level, LEVELS.length - 1)];
    var scene = SNGlobe.getScene();
    var i;
    for (i = 0; i < L.beacons; i++) {
      var lat = -55 + Math.random() * 110;
      var lng = -180 + Math.random() * 360;
      var r = R_ORBIT + 0.04 + Math.random() * 0.12;
      var b = makeBeacon(latLngAlt(lat, lng, r));
      root.add(b);
      beacons.push(b);
    }
    for (i = 0; i < L.hostiles; i++) {
      var lat2 = -60 + Math.random() * 120;
      var lng2 = -180 + Math.random() * 360;
      var r2 = R_ORBIT + Math.random() * 0.2;
      var h = makeHostile(latLngAlt(lat2, lng2, r2));
      root.add(h);
      hostiles.push(h);
    }
    message = L.name.toUpperCase() + ' · ' + L.story;
    paintHud();
  }

  function resetShip() {
    var T = THREE();
    // Start over mid-lat orbit looking along equator
    ship.pos = latLngAlt(28, 25, R_ORBIT); // near Med / Greece-ish
    ship.up = ship.pos.clone().normalize();
    ship.forward = new T.Vector3(0, 0, 1);
    ship.right = new T.Vector3(1, 0, 0);
    rebuildShipBasis();
    // face east-ish along orbit
    var east = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), ship.up);
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
    east.normalize();
    ship.forward.copy(east);
    rebuildShipBasis();
    ship.speed = 0.12;
    ship.roll = 0;
    yawAccum = 0;
    if (craft) {
      craft.position.copy(ship.pos);
      orientCraft();
    }
  }

  function orientCraft() {
    if (!craft) return;
    // Mesh faces +Z; put +Z = forward, +Y = up
    var T = THREE();
    var m = new T.Matrix4();
    m.makeBasis(ship.right, ship.up, ship.forward);
    craft.quaternion.setFromRotationMatrix(m);
    craft.position.copy(ship.pos);
    if (craftGlow) {
      craftGlow.material.opacity = 0.45 + Math.min(0.5, ship.speed * 2);
      craftGlow.scale.setScalar(0.8 + ship.speed * 3);
    }
  }

  function updateCamera(dt) {
    var cam = SNGlobe.getCamera();
    if (!cam || !ship.pos) return;
    // Third-person orbital chase: craft on screen, real Earth as the world
    var desired = ship.pos
      .clone()
      .addScaledVector(ship.forward, -0.42)
      .addScaledVector(ship.up, 0.18)
      .addScaledVector(ship.right, ship.roll * 0.05);
    var dLen = desired.length();
    if (dLen < 1.22) desired.setLength(1.22);
    if (dLen > 2.4) desired.setLength(2.4);
    cam.position.copy(desired);
    // look at craft — Earth (origin side) naturally fills the frame behind it
    cam.up.copy(ship.up);
    cam.lookAt(ship.pos);
    if (cam.fov !== 52 || cam.near !== 0.025) {
      cam.fov = 52;
      cam.near = 0.025;
      cam.far = 200;
      cam.updateProjectionMatrix();
    }
  }

  function fire() {
    if (fireCd > 0 || phase !== 'play') return;
    fireCd = 0.18;
    var T = THREE();
    var mesh = new T.Mesh(
      new T.SphereGeometry(0.006, 6, 6),
      new T.MeshBasicMaterial({ color: 0x7ec8ff })
    );
    mesh.position.copy(ship.pos).addScaledVector(ship.forward, 0.04);
    root.add(mesh);
    bullets.push({
      mesh: mesh,
      vel: ship.forward.clone().multiplyScalar(1.4 + ship.speed),
      life: 1.4,
    });
  }

  function hurt() {
    if (invuln > 0) return;
    invuln = 1.2;
    lives -= 1;
    message = lives > 0 ? 'HULL HIT · ' + lives + ' left' : 'CRAFT LOST';
    paintHud();
    if (lives <= 0) {
      phase = 'dead';
      message = 'DESTROYED · tap EXIT or Space to relaunch';
      paintHud();
    }
  }

  function tick(dt) {
    if (!active || !craft) return;
    if (dt > 0.1) dt = 0.1;

    if (phase === 'brief') {
      briefT -= dt;
      message = (LEVELS[level] && LEVELS[level].name) + ' · ' + Math.ceil(Math.max(0, briefT)) + 's';
      paintHud();
      // soft spin show Earth
      if (SNGlobe.getSpin) {
        try {
          var spin = SNGlobe.getSpin();
          if (spin) spin.rotation.y += 0.05 * dt;
        } catch (_) {}
      }
      updateCamera(dt);
      orientCraft();
      if (briefT <= 0) {
        phase = 'play';
        spawnLevel();
      }
      return;
    }

    if (phase === 'dead') {
      updateCamera(dt);
      if (keys['Space'] || keys['Enter']) {
        lives = 3;
        score = Math.max(0, score - 50);
        phase = 'brief';
        briefT = 2.2;
        resetShip();
        clearEntities();
      }
      return;
    }

    if (phase === 'clear') {
      briefT -= dt;
      updateCamera(dt);
      if (briefT <= 0) {
        level = Math.min(level + 1, LEVELS.length - 1);
        phase = 'brief';
        briefT = 2.5;
        resetShip();
      }
      return;
    }

    // --- play ---
    fireCd = Math.max(0, fireCd - dt);
    invuln = Math.max(0, invuln - dt);
    var L = LEVELS[Math.min(level, LEVELS.length - 1)];
    var spdMul = L.speed || 1;

    // Input
    var steer = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) steer += 1; // left → +yaw (player-visible)
    if (keys['KeyD'] || keys['ArrowRight']) steer -= 1;
    if (joy.active) steer += -joy.x; // stick left = +yaw
    steer = Math.max(-1, Math.min(1, steer));

    var throttle = 0;
    if (keys['KeyW'] || keys['ArrowUp']) throttle += 1;
    if (keys['KeyS'] || keys['ArrowDown']) throttle -= 1;
    if (joy.active) throttle += -joy.y;
    throttle = Math.max(-1, Math.min(1, throttle));

    if (keys['Space'] || fireTouch) fire();

    // Integrate yaw around radial up (A left)
    var yawSpeed = 1.55 * spdMul;
    if (steer !== 0) {
      // rotate forward around up — +steer (A) = nose left on chase cam
      var ang = steer * yawSpeed * dt;
      yawAccum += ang;
      // Rodrigues
      var f = ship.forward;
      var u = ship.up;
      var cos = Math.cos(ang),
        sin = Math.sin(ang);
      var dot = f.dot(u);
      var nf = f
        .clone()
        .multiplyScalar(cos)
        .add(u.clone().cross(f).multiplyScalar(sin))
        .add(u.clone().multiplyScalar(dot * (1 - cos)));
      ship.forward.copy(nf).normalize();
      rebuildShipBasis();
    }
    ship.roll += (steer * 0.55 - ship.roll) * Math.min(1, 6 * dt);

    // Speed
    var targetSpeed = throttle > 0 ? 0.35 * throttle * spdMul : throttle < 0 ? 0.08 * throttle : 0.06;
    ship.speed += (targetSpeed - ship.speed) * Math.min(1, 2.2 * dt);

    // Move along forward, re-shell to orbit radius band
    ship.pos.addScaledVector(ship.forward, ship.speed * dt);
    var r = ship.pos.length();
    var want = Math.max(R_MIN, Math.min(R_MAX, r));
    // soft restore toward R_ORBIT
    want = want * 0.97 + R_ORBIT * 0.03;
    ship.pos.setLength(want);
    rebuildShipBasis();
    orientCraft();
    updateCamera(dt);

    // Beacons
    var bi;
    for (bi = beacons.length - 1; bi >= 0; bi--) {
      var b = beacons[bi];
      b.rotation.y += dt * 1.5;
      b.rotation.x += dt * 0.7;
      if (b.position.distanceTo(ship.pos) < 0.075) {
        score += 100;
        root.remove(b);
        disposeObj(b);
        beacons.splice(bi, 1);
        message = 'BEACON SECURED · ' + beacons.length + ' left';
        paintHud();
      }
    }

    // Hostiles
    var hi;
    for (hi = hostiles.length - 1; hi >= 0; hi--) {
      var h = hostiles[hi];
      var vel = h.userData.vel;
      h.position.addScaledVector(vel, dt * spdMul);
      // keep near shell
      var hr = h.position.length();
      if (hr < R_MIN || hr > R_MAX + 0.15) {
        h.position.setLength(R_ORBIT + 0.05);
        var uph = h.position.clone().normalize();
        vel.addScaledVector(uph, -vel.dot(uph));
        if (vel.lengthSq() < 1e-6) vel.set(0.05, 0, 0.05);
        vel.normalize().multiplyScalar(0.1);
        h.userData.vel = vel;
      }
      // attract slightly toward ship
      var toShip = ship.pos.clone().sub(h.position).normalize().multiplyScalar(0.02 * dt);
      vel.add(toShip);
      if (vel.length() > 0.2) vel.setLength(0.2);
      h.lookAt(ship.pos);
      if (h.position.distanceTo(ship.pos) < 0.065) {
        hurt();
        // bounce
        vel.multiplyScalar(-1);
      }
    }

    // Bullets
    for (var bj = bullets.length - 1; bj >= 0; bj--) {
      var bu = bullets[bj];
      bu.life -= dt;
      bu.mesh.position.addScaledVector(bu.vel, dt);
      if (bu.life <= 0 || bu.mesh.position.length() < 1.05) {
        root.remove(bu.mesh);
        disposeObj(bu.mesh);
        bullets.splice(bj, 1);
        continue;
      }
      // hit hostiles
      for (var hk = hostiles.length - 1; hk >= 0; hk--) {
        if (hostiles[hk].position.distanceTo(bu.mesh.position) < 0.055) {
          score += 50;
          root.remove(hostiles[hk]);
          disposeObj(hostiles[hk]);
          hostiles.splice(hk, 1);
          root.remove(bu.mesh);
          disposeObj(bu.mesh);
          bullets.splice(bj, 1);
          message = 'HOSTILE DOWN';
          paintHud();
          break;
        }
      }
    }

    if (beacons.length === 0 && phase === 'play') {
      phase = 'clear';
      briefT = 2.4;
      score += 250;
      message = 'SECTOR CLEAR · advancing orbit';
      paintHud();
      log('Space scene · sector clear · level ' + (level + 1), 'ok');
    }
  }

  function onKey(e, down) {
    if (!active) return;
    keys[e.code] = down;
    if (down && (e.code === 'Escape' || e.code === 'KeyQ')) {
      stop();
      e.preventDefault();
    }
    if (down && (e.code === 'Space' || e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      e.preventDefault();
    }
  }

  function keyDown(e) {
    onKey(e, true);
  }
  function keyUp(e) {
    onKey(e, false);
  }

  function hideOsChrome(on) {
    try {
      var lab = document.getElementById('sn-city-labels');
      if (lab) {
        if (on) {
          lab.dataset.snPrevDisplay = lab.style.display || '';
          lab.style.display = 'none';
          lab.style.visibility = 'hidden';
          lab.innerHTML = '';
        } else {
          lab.style.display = lab.dataset.snPrevDisplay || '';
          lab.style.visibility = '';
        }
      }
      var helper = document.getElementById('sn-helper-canvas');
      if (helper) {
        if (on) {
          helper.dataset.snPrevVis = helper.style.visibility || '';
          helper.style.visibility = 'hidden';
        } else {
          helper.style.visibility = helper.dataset.snPrevVis || '';
        }
      }
      document.querySelectorAll('.sn-city-lab,.globe-label,.city-label').forEach(function (el) {
        el.style.display = on ? 'none' : '';
      });
    } catch (_) {}
  }

  function start(opts) {
    opts = opts || {};
    if (!globeReady()) {
      log('Space scene · waiting for globe…', 'dim');
      // retry
      var tries = 0;
      var t = setInterval(function () {
        tries++;
        if (globeReady()) {
          clearInterval(t);
          start(opts);
        } else if (tries > 40) {
          clearInterval(t);
          log('Space scene · globe not ready', 'err');
        }
      }, 200);
      return false;
    }
    if (active) {
      // already on — restart level
      level = opts.level != null ? opts.level : level;
      phase = 'brief';
      briefT = 2.5;
      lives = 3;
      resetShip();
      clearEntities();
      message = 'RELAUNCH';
      paintHud();
      return true;
    }

    var scene = SNGlobe.getScene();
    var cam = SNGlobe.getCamera();
    var T = THREE();

    // Close map so globe is the theater
    try {
      if (global.SNMap && SNMap.active && SNMap.close) SNMap.close();
    } catch (_) {}

    root = new T.Group();
    root.name = 'SNSpaceScene';
    scene.add(root);

    craft = makeCraftMesh();
    root.add(craft);

    ship.pos = new T.Vector3();
    ship.forward = new T.Vector3(0, 0, 1);
    ship.up = new T.Vector3(0, 1, 0);
    ship.right = new T.Vector3(1, 0, 0);
    resetShip();

    saveCam = {
      pos: cam.position.clone(),
      up: cam.up.clone(),
      quat: cam.quaternion.clone(),
    };

    SNGlobe.setGameMode(true);
    try {
      document.body.classList.add('sn-space-scene-on');
    } catch (_) {}
    // brighter fill so close-orbit Earth surface reads (not night-black)
    try {
      var scene = SNGlobe.getScene();
      scene.traverse(function (o) {
        if (o.isAmbientLight) {
          o.userData._snPrevInt = o.intensity;
          o.intensity = Math.max(o.intensity, 0.85);
        }
      });
    } catch (_) {}
    hideOsChrome(true);

    active = true;
    phase = 'brief';
    briefT = 2.8;
    level = opts.level != null ? opts.level : 0;
    score = opts.score != null ? opts.score : 0;
    lives = 3;
    message = 'SPACE SCENE · Earth is the world · outer space is the sky';
    ensureHud();
    paintHud();

    unsub = SNGlobe.onFrame(function (dt) {
      tick(dt);
    });

    installCli();
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);

    // hide pure 2D earth-ops canvas if any
    try {
      var c = document.getElementById('sn-earth-ops-canvas');
      if (c) c.style.display = 'none';
    } catch (_) {}

    // controls probe for QA
    global.__controlsTest = {
      getYaw: function () {
        // A increases, D decreases — matches player-visible left/right
        return yawAccum;
      },
      getSpeed: function () {
        return ship.speed;
      },
      setKeys: function (codes) {
        keys = Object.create(null);
        (codes || []).forEach(function (c) {
          keys[c] = true;
        });
      },
      setSteer: function (v) {
        // inject one-frame steer via fake keys
        keys['KeyA'] = v > 0.1;
        keys['KeyD'] = v < -0.1;
      },
    };

    log('Space scene · Earth + outer space ARE the theater · WASD · Space fire · Esc exit', 'ok');
    preview('Space scene');
    return true;
  }

  function stop() {
    var was = active;
    active = false;
    phase = 'idle';
    // Always restore Earth OS chrome — idempotent (safe if already closed)
    try {
      if (global.SNGlobe && SNGlobe.setGameMode) SNGlobe.setGameMode(false);
    } catch (_) {}
    try {
      document.body.classList.remove('sn-space-scene-on');
    } catch (_) {}
    try {
      hideOsChrome(false);
    } catch (_) {}
    // strip HUD even if prior stop aborted mid-way
    try {
      if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
    } catch (_) {}
    try {
      var orphan = document.getElementById('sn-space-hud');
      if (orphan && orphan.parentNode) orphan.parentNode.removeChild(orphan);
    } catch (_) {}
    hud = null;
    mountedHud = false;
    if (unsub) {
      try {
        unsub();
      } catch (_) {}
      unsub = null;
    }
    try {
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
    } catch (_) {}
    keys = Object.create(null);
    try {
      clearEntities();
    } catch (_) {}
    try {
      if (craft && root) {
        root.remove(craft);
        disposeObj(craft);
      }
    } catch (_) {}
    craft = null;
    try {
      if (root && root.parent) root.parent.remove(root);
      if (root) disposeObj(root);
    } catch (_) {}
    root = null;
    try {
      var scene2 = SNGlobe.getScene && SNGlobe.getScene();
      if (scene2) {
        scene2.traverse(function (o) {
          if (o.isAmbientLight && o.userData && o.userData._snPrevInt != null) {
            o.intensity = o.userData._snPrevInt;
            delete o.userData._snPrevInt;
          }
        });
      }
    } catch (_) {}
    try {
      var cam = SNGlobe.getCamera && SNGlobe.getCamera();
      if (cam && saveCam) {
        cam.position.copy(saveCam.pos);
        cam.up.copy(saveCam.up);
        cam.quaternion.copy(saveCam.quat);
      }
    } catch (_) {}
    saveCam = null;
    try {
      delete global.__controlsTest;
    } catch (_) {}
    if (was) {
      log('Space scene closed · Earth OS free-look restored', 'dim');
      preview('Earth');
    }
  }

  function wants(line) {
    var s = String(line || '').toLowerCase().trim();
    return (
      /^(space\s*scene|orbit(\s*game)?|space\s*ops|play\s*orbit|earth\s*ops|ops|gaming|play\s*levels|levels|play\s*game)$/i.test(
        s
      ) || /^(start|open|launch)\s+(space|orbit|ops|earth\s*ops)/i.test(s)
    );
  }

  // CLI intercept — re-bind if another module wrapped SNCli.run after us
  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      // already outermost
      if (SNCli._snSpaceSceneBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        var low = String(raw || '').trim().toLowerCase();
        if (wants(low) || low === 'space scene' || low === 'orbit' || low === 'orbit game') {
          start({});
          return;
        }
        if (
          low === 'space scene exit' ||
          low === 'exit scene' ||
          low === 'stop orbit' ||
          low === 'ops close' ||
          low === 'earth ops close' ||
          low === 'close ops' ||
          low === 'exit space' ||
          low === 'leave orbit' ||
          low === 'game off' ||
          low === 'close game'
        ) {
          stop();
          try {
            if (global.SNInvaders && SNInvaders.close) SNInvaders.close();
          } catch (_) {}
          return;
        }
        return orig(raw);
      };
      SNCli._snSpaceSceneBound = SNCli.run;
      SNCli._snSpaceSceneCli = true;
    } catch (_) {}
  }

  function init() {
    installCli();
    [400, 1200, 2500, 5000, 10000, 20000].forEach(function (ms) {
      setTimeout(installCli, ms);
    });
    // keep outermost while active
    if (!global.__snSpaceCliWatch) {
      global.__snSpaceCliWatch = setInterval(function () {
        try {
          if (active) installCli();
        } catch (_) {}
      }, 3000);
    }
  }

  global.SNSpaceScene = {
    start: start,
    open: start,
    stop: stop,
    close: stop,
    wants: wants,
    init: init,
    get active() {
      return active;
    },
    get score() {
      return score;
    },
    get level() {
      return level + 1;
    },
    get phase() {
      return phase;
    },
  };

  // Lean money path: no auto-init — CLI / SNLoader.ensure only
  function maybeAutoInit() {
    try {
      if (global.SNPerf && SNPerf.dummyOff) return;
      if (global._snLean) return;
    } catch (_) {}
    try {
      init();
    } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeAutoInit);
  } else {
    setTimeout(maybeAutoInit, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
