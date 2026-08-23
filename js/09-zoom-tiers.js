// === ZOOM TIERS — solar → global → national → regional → city → neighborhood ===
const ZoomTiers = {
  TIERS: [
    { id: 'solar', z: 7.2, label: 'Space', cosmic: 'system' },
    // Start further out — 2.55 felt like a face-plant on the planet
    { id: 'global', z: 3.65, label: 'Earth', cosmic: 'earth' },
    { id: 'national', z: 2.05, label: 'Country', cosmic: 'earth', national: true },
    { id: 'regional', z: 1.72, label: 'Region', cosmic: 'earth', national: true },
    { id: 'city', z: 1.42, label: 'City', cosmic: 'earth', city: true },
    { id: 'neighborhood', z: 1.12, label: 'Streets', cosmic: 'earth', city: true },
  ],
  START_ID: 'global',
  _index: 0,
  _wheelAccum: 0,
  _pinchAccum: 0,
  WHEEL_THRESH: 28,
  PINCH_THRESH: 14,

  init() {
    const i = this.TIERS.findIndex(t => t.id === this.START_ID);
    this._index = i >= 0 ? i : 1;
    this.snap(false);
    this.updateDots();
  },

  countryHint() {
    const p = window._lastPos;
    if (!p?.lat) return 'tap 🎯 Locate';
    if (p.lat > 34 && p.lat < 42 && p.lng > 19 && p.lng < 30) return 'Greece';
    if (p.lat > 24 && p.lat < 50 && p.lng > -10 && p.lng < 40) return 'Europe';
    if (p.lat > -35 && p.lat < 35) return 'equatorial belt';
    return 'region';
  },

  syncFromCamZ(camZ, animate) {
    if (camZ == null || !Number.isFinite(camZ)) return false;
    let best = this._index;
    let bestDist = Infinity;
    const enterZ = CityMap?.ENTER_Z ?? 1.4;
    this.TIERS.forEach((t, i) => {
      if (t.city && camZ > enterZ + 0.06) return;
      const d = Math.abs(t.z - camZ);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best === this._index) return false;
    this._index = best;
    if (animate) this.snap(true);
    else this._apply(this.current());
    return true;
  },

  updateDots() {
    const el = document.getElementById('zoom-tier-dots');
    if (!el) return;
    el.innerHTML = this.TIERS.map((t, i) => {
      const on = i === this._index ? ' on' : '';
      const solar = t.id === 'solar' ? ' ztd-solar' : '';
      return '<span class="ztd' + on + solar + '" data-tier="' + t.id + '" title="' + t.label + '"></span>';
    }).join('');
  },

  current() {
    return this.TIERS[this._index] || this.TIERS[0];
  },

  indexOf(id) {
    return this.TIERS.findIndex(t => t.id === id);
  },

  step(delta) {
    const next = Math.max(0, Math.min(this.TIERS.length - 1, this._index + delta));
    if (next === this._index) return false;
    this._index = next;
    this.snap(true);
    return true;
  },

  stepIn() { return this.step(1); },
  stepOut() { return this.step(-1); },

  goTo(id, animate) {
    const i = this.indexOf(id);
    if (i < 0) return false;
    this._index = i;
    this.snap(animate !== false);
    return true;
  },

  onWheel(deltaY) {
    this._wheelAccum += deltaY;
    if (Math.abs(this._wheelAccum) < this.WHEEL_THRESH) return;
    const out = this._wheelAccum > 0;
    this._wheelAccum = 0;
    this.step(out ? -1 : 1);
  },

  onPinch(delta) {
    this._pinchAccum += delta;
    if (Math.abs(this._pinchAccum) < this.PINCH_THRESH) return;
    const out = this._pinchAccum > 0;
    this._pinchAccum = 0;
    this.step(out ? -1 : 1);
  },

  resetAccum() {
    this._wheelAccum = 0;
    this._pinchAccum = 0;
  },

  snap(animate) {
    const t = this.current();
    window._globeFly = null;
    if (animate) {
      window._globeFly = {
        mode: 'zoom',
        fromZ: camera.position.z,
        toZ: t.z,
        t0: performance.now(),
        dur: 1400,
        tierId: t.id,
        onTier: true,
      };
    } else {
      camera.position.z = t.z;
      camera.lookAt(0, 0, 0);
      this._apply(t);
    }
    MapDepict?.setHud?.(t.label, 'zoom-tier');
  },

  _apply(t) {
    const tier = t || this.current();
    const cosmic = tier.cosmic || 'earth';
    CosmicZoom.update(camera.position.z, { tier: tier.id, label: tier.label, cosmic });
    CityMap?.onCamera?.(camera.position.z, cosmic);
    cityLevel = !!tier.city;
    const zl = document.getElementById('zoom-label');
    if (zl && !window.DrivingView?.active && !CityMap?.active) {
      const pc = window.PublicCopy;
      if (pc?.zoomLine) {
        const extra = tier.national ? this.countryHint() : '';
        zl.textContent = pc.zoomLine(tier.id, extra && extra !== 'region' ? extra : null);
      } else if (tier.id === 'solar') zl.textContent = 'Space · planets';
      else if (tier.id === 'global') zl.textContent = 'Earth · drag · 🎯 city · 🎧 chat';
      else if (tier.national) zl.textContent = 'Country · ' + this.countryHint() + ' · choose a city';
      else if (tier.city) zl.textContent = 'City · streets & shops';
      else zl.textContent = tier.label;
    }
    // City chips only belong in country airspace.
    if (!tier.national) CityPick?.hide?.();
    // Do not auto-pull bearing to GPS here — that stole country clicks away from the
    // tapped nation. 🎯 Locate / city-life own “go to my region”.
    this.updateDots();
    MapDepict?.setHud?.(tier.label, 'zoom-tier');
  },

  tierZ(id) {
    const t = this.TIERS.find(x => x.id === id);
    return t ? t.z : 2.55;
  },
};
window.ZoomTiers = ZoomTiers;
