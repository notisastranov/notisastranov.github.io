// === CITY PICK — national airspace → choose a city → city map ===
// Flow: Earth/space tap → country view → city chips / second tap → CityLife.dropIn
const CityPick = {
  MAX_CHIPS: 6,
  NEAR_KM: 750,
  FALLBACK_KM: 1800,

  /** Major cities — offline picks, no fake places. Real lat/lng only. */
  CITIES: [
    { name: 'Athens', lat: 37.9838, lng: 23.7275 },
    { name: 'Thessaloniki', lat: 40.6401, lng: 22.9444 },
    { name: 'Rhodes', lat: 36.4341, lng: 28.2176 },
    { name: 'Heraklion', lat: 35.3387, lng: 25.1442 },
    { name: 'Patras', lat: 38.2466, lng: 21.7346 },
    { name: 'Istanbul', lat: 41.0082, lng: 28.9784 },
    { name: 'Sofia', lat: 42.6977, lng: 23.3219 },
    { name: 'Belgrade', lat: 44.7866, lng: 20.4489 },
    { name: 'Bucharest', lat: 44.4268, lng: 26.1025 },
    { name: 'Tirana', lat: 41.3275, lng: 19.8187 },
    { name: 'Rome', lat: 41.9028, lng: 12.4964 },
    { name: 'Milan', lat: 45.4642, lng: 9.19 },
    { name: 'Naples', lat: 40.8518, lng: 14.2681 },
    { name: 'Paris', lat: 48.8566, lng: 2.3522 },
    { name: 'Lyon', lat: 45.764, lng: 4.8357 },
    { name: 'Berlin', lat: 52.52, lng: 13.405 },
    { name: 'Munich', lat: 48.1351, lng: 11.582 },
    { name: 'London', lat: 51.5074, lng: -0.1278 },
    { name: 'Manchester', lat: 53.4808, lng: -2.2426 },
    { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
    { name: 'Barcelona', lat: 41.3874, lng: 2.1686 },
    { name: 'Lisbon', lat: 38.7223, lng: -9.1393 },
    { name: 'Amsterdam', lat: 52.3676, lng: 4.9041 },
    { name: 'Brussels', lat: 50.8503, lng: 4.3517 },
    { name: 'Vienna', lat: 48.2082, lng: 16.3738 },
    { name: 'Prague', lat: 50.0755, lng: 14.4378 },
    { name: 'Warsaw', lat: 52.2297, lng: 21.0122 },
    { name: 'Budapest', lat: 47.4979, lng: 19.0402 },
    { name: 'Stockholm', lat: 59.3293, lng: 18.0686 },
    { name: 'Oslo', lat: 59.9139, lng: 10.7522 },
    { name: 'Copenhagen', lat: 55.6761, lng: 12.5683 },
    { name: 'Dublin', lat: 53.3498, lng: -6.2603 },
    { name: 'Zurich', lat: 47.3769, lng: 8.5417 },
    { name: 'Moscow', lat: 55.7558, lng: 37.6173 },
    { name: 'Kyiv', lat: 50.4501, lng: 30.5234 },
    { name: 'Cairo', lat: 30.0444, lng: 31.2357 },
    { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
    { name: 'Tel Aviv', lat: 32.0853, lng: 34.7818 },
    { name: 'New York', lat: 40.7128, lng: -74.006 },
    { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
    { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
    { name: 'Miami', lat: 25.7617, lng: -80.1918 },
    { name: 'Toronto', lat: 43.6532, lng: -79.3832 },
    { name: 'Mexico City', lat: 19.4326, lng: -99.1332 },
    { name: 'São Paulo', lat: -23.5505, lng: -46.6333 },
    { name: 'Buenos Aires', lat: -34.6037, lng: -58.3816 },
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
    { name: 'Osaka', lat: 34.6937, lng: 135.5023 },
    { name: 'Seoul', lat: 37.5665, lng: 126.978 },
    { name: 'Beijing', lat: 39.9042, lng: 116.4074 },
    { name: 'Shanghai', lat: 31.2304, lng: 121.4737 },
    { name: 'Hong Kong', lat: 22.3193, lng: 114.1694 },
    { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
    { name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
    { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
    { name: 'Delhi', lat: 28.6139, lng: 77.209 },
    { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
    { name: 'Melbourne', lat: -37.8136, lng: 144.9631 },
    { name: 'Auckland', lat: -36.8509, lng: 174.7645 },
    { name: 'Cape Town', lat: -33.9249, lng: 18.4241 },
    { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
    { name: 'Nairobi', lat: -1.2921, lng: 36.8219 },
  ],

  _anchor: null,

  init() {
    if (this._inited) return;
    this._inited = true;
    // Ensure chip host exists even if shell markup is thin
    if (!document.getElementById('city-pick-chips')) {
      const el = document.createElement('div');
      el.id = 'city-pick-chips';
      el.setAttribute('aria-label', 'Choose a city');
      document.body.appendChild(el);
    }
  },

  km(lat1, lng1, lat2, lng2) {
    if (TrackballGuard?.greatCircleKm) return TrackballGuard.greatCircleKm(lat1, lng1, lat2, lng2);
    if (window.Commerce?.haversineKm) return Commerce.haversineKm(lat1, lng1, lat2, lng2);
    const R = 6371;
    const toR = d => d * Math.PI / 180;
    const dLat = toR(lat2 - lat1);
    const dLng = toR(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  },

  nearestName(lat, lng) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.CITIES) {
      const d = this.km(lat, lng, c.lat, c.lng);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best && bestD < 80) return best.name;
    return null;
  },

  near(lat, lng, maxKm, limit) {
    maxKm = maxKm ?? this.NEAR_KM;
    limit = limit ?? this.MAX_CHIPS;
    const scored = this.CITIES.map(c => ({
      ...c,
      km: this.km(lat, lng, c.lat, c.lng),
    })).sort((a, b) => a.km - b.km);
    let list = scored.filter(c => c.km <= maxKm).slice(0, limit);
    if (list.length < 3) {
      list = scored.filter(c => c.km <= this.FALLBACK_KM).slice(0, Math.max(3, limit));
    }
    if (!list.length) list = scored.slice(0, Math.min(4, limit));
    return list;
  },

  hide() {
    const el = document.getElementById('city-pick-chips');
    if (!el) return;
    el.classList.remove('visible');
    el.innerHTML = '';
    this._anchor = null;
  },

  /**
   * Show city choices after national entry.
   * @param {number} lat
   * @param {number} lng
   * @param {{ title?: string }} [opts]
   */
  show(lat, lng, opts) {
    opts = opts || {};
    this.init();
    const el = document.getElementById('city-pick-chips');
    if (!el || lat == null || lng == null) return;
    this._anchor = { lat, lng };
    const cities = this.near(lat, lng);
    const gps = window._lastPos?.lat != null ? window._lastPos : null;
    const chips = [];

    // Always offer the tapped spot as a city entry
    const tapLabel = this.nearestName(lat, lng);
    chips.push({
      id: 'here',
      label: tapLabel ? 'Open ' + tapLabel : 'Open here',
      lat, lng,
      kind: 'here',
    });

    if (gps && this.km(lat, lng, gps.lat, gps.lng) > 25) {
      chips.push({
        id: 'gps',
        label: '🎯 My city',
        lat: gps.lat,
        lng: gps.lng,
        kind: 'gps',
      });
    }

    cities.forEach(c => {
      // skip near-duplicate of tap
      if (this.km(lat, lng, c.lat, c.lng) < 12) return;
      chips.push({
        id: 'c-' + c.name,
        label: c.name,
        lat: c.lat,
        lng: c.lng,
        kind: 'city',
      });
    });

    const top = chips.slice(0, this.MAX_CHIPS + 1);
    el.innerHTML = '<div class="city-pick-head">' + (opts.title || 'Choose a city') + '</div>'
      + top.map(c =>
        '<button type="button" data-city-id="' + c.id + '" data-lat="' + c.lat + '" data-lng="' + c.lng + '">'
        + this._esc(c.label) + '</button>'
      ).join('');
    el.classList.add('visible');
    el.querySelectorAll('button[data-city-id]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const clat = parseFloat(btn.dataset.lat);
        const clng = parseFloat(btn.dataset.lng);
        const name = (btn.textContent || 'City').replace(/^Open\s+/, '').replace(/^🎯\s*/, '');
        void this.enter(clat, clng, name);
      };
    });

    MapDepict?.pulse?.(lat, lng, 0x3d9eff, 'pick city', 5000);
    const zl = document.getElementById('zoom-label');
    if (zl && !window.DrivingView?.active) {
      zl.textContent = 'Country · choose a city below · or tap the map';
    }
    GlobeDeck?.setPreview?.(opts.title || 'Country airspace · choose a city');
    AciCli?.print?.('city pick · ' + cities.slice(0, 4).map(c => c.name).join(' · '), 'ok');
  },

  _esc(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  /** Enter city map at lat/lng (from chip or national second-tap). */
  async enter(lat, lng, label) {
    if (lat == null || lng == null) return { error: 'no_coords' };
    this.hide();
    MapPlaceMenu?.close?.();
    const name = label || this.nearestName(lat, lng) || 'City';
    GlobeDeck?.setPreview?.('Opening ' + name + '…');
    AciCli?.print?.('city → ' + name, 'ok');
    MapDepict?.pulse?.(lat, lng, 0x00ff99, name, 10000);

    if (typeof CityLife?.dropIn === 'function') {
      return CityLife.dropIn(lat, lng, { label: name, openShops: false });
    }
    // Fallback without CityLife
    const z = GlobeControl?.cityEntryZ?.() || GlobeControl?.Z?.city || 1.34;
    const p = latLngToPos(lat, lng, 1.04);
    ZoomTiers?.goTo?.('city', false);
    if (typeof flyToPoint === 'function') {
      flyToPoint(new THREE.Vector3(p.x, p.y, p.z), z, { onTier: true, dur: 2200 });
      if (typeof waitForGlobeFly === 'function') await waitForGlobeFly();
    }
    await CityMap?.openAt?.(lat, lng, { camZ: z });
    window._lastPos = { lat, lng };
    return { lat, lng, label: name };
  },

  /** True when camera/tier is national (country) airspace — ready for city pick. */
  isNationalView() {
    const tier = ZoomTiers?.current?.();
    if (tier?.city || CityMap?.active || cityLevel) return false;
    if (tier?.national) return true;
    const z = camera?.position?.z;
    if (z == null) return false;
    const enter = CityMap?.ENTER_Z ?? 1.58;
    return z <= 2.08 && z > enter + 0.02;
  },
};
window.CityPick = CityPick;
