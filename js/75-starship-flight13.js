// === STARSHIP FLIGHT 13 — lean globe launch / replay simulation ===
// Event sim for Starbase Pad 2 · not full physics. NET updates from SpaceX.
const StarshipFlight13 = {
  version: '20260717-f13',
  // Pad 2 Starbase (approx)
  PAD: { lat: 25.9971, lng: -97.1554, name: 'Starbase Pad 2' },
  // Official window open pattern: 5:45 p.m. CT = 22:45 UTC
  NET_UTC: Date.UTC(2026, 6, 20, 22, 45, 0),
  WINDOW_MIN: 90,
  playing: false,
  _raf: null,
  _t0: 0,
  _elapsed: 0,
  _speed: 1,
  _group: null,
  _ship: null,
  _booster: null,
  _trail: null,
  _hud: null,
  _phase: 'idle',
  _lastHud: 0,

  // Approximate public test profile (suborbital ship · Gulf booster · Indian Ocean entry)
  PHASES: [
    { t: 0, id: 'liftoff', label: 'Liftoff', event: '33 engines · Pad 2' },
    { t: 60, id: 'maxq', label: 'Max-Q', event: 'Peak aerodynamic pressure' },
    { t: 160, id: 'hotstage', label: 'Hot-staging', event: 'Ship ignition · stage sep' },
    { t: 180, id: 'boostback', label: 'Boostback', event: 'Booster flip · Gulf' },
    { t: 400, id: 'boostland', label: 'Booster splash', event: 'Gulf of Mexico water landing' },
    { t: 520, id: 'coast', label: 'Ship coast', event: 'Suborbital arc · Starlink V3 bay' },
    { t: 900, id: 'deploy', label: 'Payload window', event: 'Starlink V3 deploy opportunity' },
    { t: 2700, id: 'entry', label: 'Entry', event: 'Ship reentry · Indian Ocean' },
    { t: 3300, id: 'splash', label: 'Splashdown', event: 'Controlled splash · end of test' },
  ],

  // Great-circle samples: Starbase → Gulf → mid-Atlantic coast → Indian Ocean splash zone
  PATH_SHIP: [
    { t: 0, lat: 25.9971, lng: -97.1554, alt: 1.0 },
    { t: 60, lat: 26.4, lng: -96.4, alt: 1.02 },
    { t: 160, lat: 27.8, lng: -94.2, alt: 1.06 },
    { t: 400, lat: 30.5, lng: -88.0, alt: 1.09 },
    { t: 900, lat: 20.0, lng: -40.0, alt: 1.12 },
    { t: 1800, lat: 0.0, lng: 20.0, alt: 1.10 },
    { t: 2700, lat: -20.0, lng: 55.0, alt: 1.05 },
    { t: 3300, lat: -30.0, lng: 75.0, alt: 1.0 },
  ],
  PATH_BOOSTER: [
    { t: 0, lat: 25.9971, lng: -97.1554, alt: 1.0 },
    { t: 160, lat: 27.8, lng: -94.2, alt: 1.06 },
    { t: 250, lat: 27.2, lng: -94.8, alt: 1.04 },
    { t: 400, lat: 26.5, lng: -95.5, alt: 1.0 },
  ],

  init() {
    if (this._inited) return;
    this._inited = true;
    window.StarshipFlight13 = this;
    try {
      this._ensureGroup();
      this._ensureHud();
    } catch (e) {
      console.warn('[StarshipFlight13] init soft-fail', e);
    }
    console.log('%c[StarshipFlight13] F13 sim ready · say starship / flight 13', 'color:#ff8844;font-weight:700');
  },

  _ensureGroup() {
    if (this._group || typeof THREE === 'undefined' || typeof globePivot === 'undefined') return;
    this._group = new THREE.Group();
    this._group.name = 'starship-f13';
    this._group.visible = false;
    globePivot.add(this._group);

    const bodyGeo = new THREE.CylinderGeometry(0.008, 0.012, 0.055, 8);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xdde8f0 });
    this._ship = new THREE.Mesh(bodyGeo, bodyMat.clone());
    this._ship.userData = { kind: 'ship', name: 'Ship · F13' };
    this._group.add(this._ship);

    this._booster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.016, 0.07, 8),
      new THREE.MeshBasicMaterial({ color: 0xaabbcc })
    );
    this._booster.userData = { kind: 'booster', name: 'Booster · F13' };
    this._group.add(this._booster);

    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(90);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    this._trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.75 })
    );
    this._trail.frustumCulled = false;
    this._group.add(this._trail);
    this._trailPts = [];
  },

  _ensureHud() {
    if (this._hud || typeof document === 'undefined') return;
    let el = document.getElementById('starship-f13-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'starship-f13-hud';
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:calc(88px + env(safe-area-inset-bottom,0px))',
        'transform:translateX(-50%)', 'z-index:95', 'max-width:min(92vw,420px)',
        'padding:8px 12px', 'border-radius:12px', 'pointer-events:none',
        'background:rgba(8,12,20,0.82)', 'border:1px solid rgba(255,120,60,0.45)',
        'color:#ffe8d8', 'font:600 12px/1.35 system-ui,sans-serif',
        'box-shadow:0 8px 28px rgba(0,0,0,0.45)', 'display:none', 'text-align:center',
      ].join(';');
      document.body.appendChild(el);
    }
    this._hud = el;
  },

  netMs() { return this.NET_UTC; },

  countdownText(nowMs) {
    const d = this.NET_UTC - (nowMs || Date.now());
    if (d <= 0) return 'NET open · window ' + this.WINDOW_MIN + 'm · T+ live or replay';
    const s = Math.floor(d / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return 'NET T−' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
      + ' · 20 Jul 2026 22:45 UTC · Starbase';
  },

  phaseAt(t) {
    let cur = this.PHASES[0];
    for (const p of this.PHASES) {
      if (t >= p.t) cur = p;
      else break;
    }
    return cur;
  },

  _lerpPath(path, t) {
    if (!path.length) return null;
    if (t <= path[0].t) return { ...path[0] };
    if (t >= path[path.length - 1].t) return { ...path[path.length - 1] };
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (t >= a.t && t <= b.t) {
        const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return {
          lat: a.lat + (b.lat - a.lat) * u,
          lng: a.lng + (b.lng - a.lng) * u,
          alt: a.alt + (b.alt - a.alt) * u,
        };
      }
    }
    return { ...path[path.length - 1] };
  },

  _place(mesh, sample) {
    if (!mesh || !sample || typeof latLngToPos !== 'function') return;
    const p = latLngToPos(sample.lat, sample.lng, sample.alt);
    mesh.position.set(p.x, p.y, p.z);
    // Point roughly outward
    mesh.lookAt(0, 0, 0);
    mesh.rotateX(Math.PI / 2);
  },

  _pushTrail(sample) {
    if (!sample || !this._trail) return;
    const p = latLngToPos(sample.lat, sample.lng, sample.alt);
    this._trailPts.push(p.x, p.y, p.z);
    if (this._trailPts.length > 90) this._trailPts = this._trailPts.slice(-90);
    const arr = this._trail.geometry.attributes.position.array;
    for (let i = 0; i < 90; i++) arr[i] = this._trailPts[i] ?? this._trailPts[this._trailPts.length - 1] ?? 0;
    this._trail.geometry.attributes.position.needsUpdate = true;
    this._trail.geometry.setDrawRange(0, Math.floor(this._trailPts.length / 3));
  },

  _setHud(html, show) {
    this._ensureHud();
    if (!this._hud) return;
    this._hud.style.display = show === false ? 'none' : 'block';
    if (html != null) this._hud.innerHTML = html;
  },

  focusPad() {
    this._ensureGroup();
    GlobeControl?.flyToLatLng?.(this.PAD.lat, this.PAD.lng, 'Starbase · F13', GlobeControl?.Z?.national || 1.9, {});
    MapDepict?.pulse?.(this.PAD.lat, this.PAD.lng, 0xff6622, 'Pad 2 · F13', 12000);
    ZoomTiers?.goTo?.('national', true);
  },

  start(opts) {
    opts = opts || {};
    this.init();
    this._ensureGroup();
    this._ensureHud();
    // Snap camera once — don't spam fly every phase
    if (!opts.silent) this.focusPad();
    this._speed = Math.max(0.25, Math.min(60, opts.speed || (opts.realtime ? 1 : 12)));
    this.playing = true;
    this._elapsed = opts.fromT || 0;
    this._t0 = performance.now();
    this._trailPts = [];
    this._phase = 'liftoff';
    if (this._group) this._group.visible = true;
    if (this._booster) this._booster.visible = true;
    if (this._ship) this._ship.visible = true;
    const mode = opts.realtime ? 'live clock' : ('×' + this._speed + ' replay');
    AciCli?.print?.('starship f13 · ' + mode + ' · NET ' + new Date(this.NET_UTC).toISOString(), 'ok');
    CliRibbon?.setNotice?.('F13 · ' + mode, 'ready');
    GlobeDeck?.say?.('Starship Flight 13 sim — ' + mode, 'ok');
    this._setHud('<b>F13</b> · ' + mode + '<br>' + this.countdownText(), true);
    this._tick();
    return { ok: true, mode, net: this.NET_UTC };
  },

  stop() {
    this.playing = false;
    if (this._group) this._group.visible = false;
    this._setHud(null, false);
    AciCli?.print?.('starship f13 · stopped', 'dim');
  },

  _tick() {
    if (!this.playing) return;
    const now = performance.now();
    const dt = (now - this._t0) / 1000;
    this._t0 = now;
    this._elapsed += dt * this._speed;
    const t = this._elapsed;
    const phase = this.phaseAt(t);
    this._phase = phase.id;

    const ship = this._lerpPath(this.PATH_SHIP, t);
    const boost = this._lerpPath(this.PATH_BOOSTER, Math.min(t, 400));
    this._place(this._ship, ship);
    if (t < 160) {
      this._place(this._booster, ship);
      if (this._booster) this._booster.visible = true;
    } else if (t < 420) {
      this._place(this._booster, boost);
      if (this._booster) this._booster.visible = true;
    } else if (this._booster) {
      this._booster.visible = false;
    }
    if (ship && t % 0.2 < 0.05) this._pushTrail(ship);

    if (now - this._lastHud > 400) {
      this._lastHud = now;
      const mm = Math.floor(t / 60);
      const ss = Math.floor(t % 60);
      this._setHud(
        '<b>Starship F13</b> · T+' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
        + ' · ×' + this._speed
        + '<br><span style="color:#ffb088">' + phase.label + '</span> — ' + phase.event
        + '<br><span style="opacity:.75">' + this.countdownText() + '</span>',
        true
      );
      if (ship && t < 500) {
        MapDepict?.pulse?.(ship.lat, ship.lng, 0xff8844, phase.label, 2500);
      }
    }

    if (t >= 3300) {
      this._setHud('<b>F13 complete</b> · splashdown · type <code>starship</code> to replay', true);
      this.playing = false;
      setTimeout(() => this._setHud(null, false), 8000);
      AciCli?.print?.('starship f13 · splashdown · replay: starship', 'ok');
      return;
    }
    requestAnimationFrame(() => this._tick());
  },

  status() {
    return {
      version: this.version,
      playing: this.playing,
      phase: this._phase,
      t: Math.round(this._elapsed),
      net: this.NET_UTC,
      countdown: this.countdownText(),
      pad: this.PAD,
    };
  },

  wants(text) {
    return /starship|flight\s*13|f13|starbase\s*launch|ift[\s-]*13/i.test(String(text || ''));
  },

  async handleCli(line) {
    const low = String(line || '').toLowerCase().trim();
    if (/stop|cancel|halt/.test(low)) { this.stop(); return 'F13 stopped'; }
    if (/pad|focus|starbase/.test(low) && !/play|start|go|launch|replay/.test(low)) {
      this.focusPad();
      return 'Focused Starbase Pad 2 · ' + this.countdownText();
    }
    if (/status|net|when|countdown/.test(low)) {
      const s = this.status();
      return s.countdown + (s.playing ? ' · playing T+' + s.t + 's · ' + s.phase : '');
    }
    const realtime = /live|real\s*time|realtime/.test(low);
    const fast = /fast|turbo|×\s*30|x30/.test(low);
    this.start({ realtime, speed: realtime ? 1 : (fast ? 30 : 12) });
    return 'F13 sim started · ' + this.countdownText();
  },
};
window.StarshipFlight13 = StarshipFlight13;
