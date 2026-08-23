// ── COSMIC ZOOM: Earth → satellites → solar system → galaxy ──
const CosmicZoom = {
  level: 'earth',
  solarGroup: null,
  galaxyPts: null,
  satGroup: null,
  issMarker: null,
  _issTarget: null,
  _issLastFetch: 0,
  orbitLines: [],
  leoRings: [],
  meshRing: null,
  planets: [],
  _lastCamZ: -1,
  _lastLevel: '',
  _guideAt: 0,
  _EPOCH_MS: Date.UTC(2000, 0, 1, 12, 0, 0),
  _DAY_MS: 86400000,
  _TAU: Math.PI * 2,

  _deg(d) { return d * Math.PI / 180; },

  heliocentricPosition(ud, nowMs) {
    const days = (nowMs - this._EPOCH_MS) / this._DAY_MS;
    const M = this._deg(ud.M0) + (this._TAU / ud.periodDays) * days;
    const incl = this._deg(ud.incl);
    const Omega = this._deg(ud.omega);
    const r = ud.dist;
    const cosM = Math.cos(M);
    const sinM = Math.sin(M);
    const cosO = Math.cos(Omega);
    const sinO = Math.sin(Omega);
    const cosI = Math.cos(incl);
    const sinI = Math.sin(incl);
    return {
      x: r * (cosO * cosM - sinO * sinM * cosI),
      y: r * (sinO * cosM + cosO * sinM * cosI),
      z: r * sinM * sinI,
    };
  },

  makeInclinedOrbit(ud, color, opacity, parent, opts) {
    opts = opts || {};
    const segs = opts.segments || 72;
    const pts = [];
    const incl = this._deg(ud.incl);
    const Omega = this._deg(ud.omega);
    const r = ud.dist;
    const cosO = Math.cos(Omega);
    const sinO = Math.sin(Omega);
    const cosI = Math.cos(incl);
    const sinI = Math.sin(incl);
    for (let i = 0; i <= segs; i++) {
      const M = (i / segs) * this._TAU;
      const cosM = Math.cos(M);
      const sinM = Math.sin(M);
      pts.push(new THREE.Vector3(
        r * (cosO * cosM - sinO * sinM * cosI),
        r * (sinO * cosM + cosO * sinM * cosI),
        r * sinM * sinI
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity,
      dashSize: opts.dash || 0.04,
      gapSize: opts.gap || 0.1,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line.visible = false;
    line.userData = { type: 'orbit-line', body: ud.name || opts.body || '' };
    if (parent) parent.add(line);
    this.orbitLines.push(line);
    return line;
  },

  makeDashedOrbit(radius, color, opacity, parent, opts) {
    opts = opts || {};
    const segs = opts.segments || 40;
    const tilt = opts.tilt || 0;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wobble = Math.sin(a * (opts.wobble || 1)) * tilt;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, wobble, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity,
      dashSize: opts.dash || 0.05,
      gapSize: opts.gap || 0.09,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line.visible = false;
    line.userData = { type: 'orbit-line', body: opts.body || '' };
    if (parent) parent.add(line);
    this.orbitLines.push(line);
    return line;
  },

  init() {
    // TRUTH: no toy planets co-located with Earth (dist ~0.7–3 next to Earth radius=1 was a lie).
    // Solar system schematic removed. Earth is Earth. ISS only when live position known.
    this.solarGroup = new THREE.Group();
    this.solarGroup.visible = false;
    this.solarGroup.name = 'solar-disabled-truth';
    scene.add(this.solarGroup);
    this.planets = [];

    // Distant star points only (not planets) — abstract backdrop when zoomed far
    const gPos = [];
    const gCount = window._globePerfLite ? 120 : 280;
    for (let i = 0; i < gCount; i++) {
      const t = Math.random() * Math.PI * 2;
      const rad = 12 + Math.random() * 30;
      gPos.push(Math.cos(t) * rad, (Math.random() - 0.5) * 3, Math.sin(t) * rad);
    }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
    this.galaxyPts = new THREE.Points(
      gGeo,
      new THREE.PointsMaterial({ color: 0xaaccff, size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.3 })
    );
    this.galaxyPts.visible = false;
    scene.add(this.galaxyPts);

    // Sat group: real ISS marker only — no decorative LEO rings (fake shells)
    this.satGroup = new THREE.Group();
    this.satGroup.name = 'truth-orbit';
    globePivot.add(this.satGroup);
    this.leoRings = [];
    this.issOrbit = null;
    const iss = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc })
    );
    iss.userData = { type: 'iss', name: 'ISS', desc: 'International Space Station · live when tracked' };
    iss.visible = false; // only after live fix
    this.satGroup.add(iss);
    this.issMarker = iss;
    this.level = 'earth';
    this.setOrbitVisibility('earth');
    if (this.solarGroup) this.solarGroup.visible = false;
    if (this.galaxyPts) this.galaxyPts.visible = false;
    console.log('%c[CosmicZoom] truth mode — no fake planets around Earth', 'color:#00ddaa');
  },

  /** Do not draw fake mesh relays / toy orbits. Real sats = StarlinkConstellation / ISS API. */
  registerOrbitalSats(sats) {
    // Hide any legacy decorative sats so they never appear as planets
    if (sats?.length) {
      sats.forEach(sat => {
        if (sat) sat.visible = false;
      });
    }
    this._orbitalSats = [];
    if (this.meshRing) {
      this.meshRing.visible = false;
      this.meshRing = null;
    }
  },

  async trackISS() {
    let lat = null;
    let lng = null;
    try {
      const r = await fetch('https://api.open-notify.org/iss-now.json');
      const j = await r.json();
      if (j.iss_position) {
        lat = parseFloat(j.iss_position.latitude);
        lng = parseFloat(j.iss_position.longitude);
      }
    } catch (_) {}
    if (lat == null) {
      try {
        const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        const j = await r.json();
        if (j.latitude != null) {
          lat = +j.latitude;
          lng = +j.longitude;
        }
      } catch (_) {}
    }
    if (lat == null || lng == null || !this.issMarker) return;
    // ~420 km altitude → shell ~1 + 420/6371 ≈ 1.066 (honest scale on Earth sphere)
    const ISS_ALT = 1.066;
    this._issTarget = { lat, lng, t: Date.now() };
    this._issLastFetch = Date.now();
    this.issMarker.userData.lat = lat;
    this.issMarker.userData.lng = lng;
    this.issMarker.userData.desc = 'ISS live ' + lat.toFixed(2) + '° ' + lng.toFixed(2) + '°';
    this.issMarker.visible = true;
    const p = latLngToPos(lat, lng, ISS_ALT);
    if (!this.issMarker.userData._placed) {
      this.issMarker.position.set(p.x, p.y, p.z);
      this.issMarker.userData._placed = true;
    }
    this.updateGuide(this.level, camera?.position?.z || 2.55);
  },

  _lerpIss() {
    if (!this.issMarker || this._issTarget?.lat == null) return;
    const tgt = latLngToPos(this._issTarget.lat, this._issTarget.lng, 1.066);
    const m = this.issMarker.position;
    m.x += (tgt.x - m.x) * 0.18;
    m.y += (tgt.y - m.y) * 0.18;
    m.z += (tgt.z - m.z) * 0.18;
  },

  updateGuide(level, camZ) {
    // Left rail = ResourceMonitor only. No planet/orbit essays.
    const el = document.getElementById('cosmic-guide');
    if (el) {
      el.innerHTML = '';
      el.style.display = 'none';
      el.hidden = true;
    }
  },

  setOrbitVisibility(level) {
    // No decorative LEO rings / solar toy planets
    this.leoRings.forEach(r => { if (r) r.visible = false; });
    this.orbitLines.forEach(line => { if (line) line.visible = false; });
    if (this.meshRing) this.meshRing.visible = false;
    if (this.solarGroup) this.solarGroup.visible = false;
    // ISS only when we have a live fix
    if (this.issMarker) {
      this.issMarker.visible = !!(this.issMarker.userData?.lat != null && (level === 'orbit' || level === 'earth'));
    }
  },

  update(camZ, opts) {
    opts = opts || {};
    if (window._cityDropLock && !opts.cosmic) {
      opts = Object.assign({}, opts, { cosmic: 'earth', tier: opts.tier || 'city', label: opts.label || 'CITY' });
    }
    let level = opts.cosmic === 'system' ? 'system' : opts.cosmic === 'galaxy' ? 'galaxy' : 'earth';
    let label = opts.label || 'GLOBAL';
    if (window._bootEarthLock && camZ < 6 && opts.cosmic !== 'system' && opts.cosmic !== 'galaxy') {
      level = 'earth';
      label = opts.label || 'GLOBAL';
    } else if (!opts.tier) {
      if (camZ > 14) { level = 'galaxy'; label = 'GALAXY'; }
      else if (camZ > 5.5) { level = 'system'; label = 'SOLAR SYSTEM'; }
      else if (camZ > 4.8) { level = 'orbit'; label = 'ORBIT'; }
      else {
        level = 'earth';
        const tier = window.ZoomTiers?.current?.();
        label = tier?.label || (camZ > 2.2 ? 'GLOBAL' : camZ > 1.55 ? 'NATIONAL' : 'CITY');
      }
    }
    const levelChanged = level !== this.level;
    if (levelChanged) this.level = level;
    const camChanged = Math.abs(camZ - this._lastCamZ) > 0.08;
    const now = Date.now();
    const zl = document.getElementById('zoom-label');
    if (zl && !DrivingView?.active && (levelChanged || camChanged)) {
      const pc = window.PublicCopy;
      if (CityMap?.active) {
        const tier = window.ZoomTiers?.current?.();
        zl.textContent = (tier?.id === 'neighborhood' ? 'Streets' : 'City')
          + ' · map · shops · friends';
      } else if (CityMap?._nationalActive) {
        zl.textContent = 'Country · ' + (window.ZoomTiers?.countryHint?.() || '') + ' · pinch for city';
      } else if (pc?.zoomLine) {
        const tid = level === 'orbit' ? 'orbit' : level === 'system' ? 'system'
          : level === 'galaxy' ? 'galaxy' : (window.ZoomTiers?.current?.()?.id || 'global');
        zl.textContent = pc.zoomLine(tid);
      } else {
        zl.textContent = (pc?.tierLabel?.(level) || label || 'Earth');
      }
    }
    if (levelChanged || camChanged) CityMap?.onCamera?.(camZ, level);
    if (levelChanged || camChanged || now - this._guideAt > 4000) {
      this._guideAt = now;
      this.updateGuide(level, camZ);
    }
    if (levelChanged) this.setOrbitVisibility(level);
    this._lastCamZ = camZ;
    this._lastLevel = level;

    // Earth always real at origin — never overlay toy solar system on it
    globePivot.visible = true;
    if (this.solarGroup) this.solarGroup.visible = false;
    if (this.galaxyPts) this.galaxyPts.visible = level === 'galaxy' || level === 'system';
    if (this.satGroup) this.satGroup.visible = true;
    this._lerpIss();

    // Live ISS when looking at Earth / above Earth (not fake planets)
    if (level === 'earth' || level === 'orbit') {
      if (!this._issLastFetch || now - this._issLastFetch > 120000) this.trackISS();
      if (this.issMarker) {
        this.issMarker.visible = this.issMarker.userData?.lat != null && camZ < 8;
      }
    } else if (this.issMarker) {
      this.issMarker.visible = false;
    }

    // Never show legacy decorative sats
    if (this._orbitalSats?.length) {
      this._orbitalSats.forEach(s => { if (s) s.visible = false; });
    }

    // Starlink constellation dots disabled (truth — no fake LEO swarm)
  },
};
window.CosmicZoom = CosmicZoom;
