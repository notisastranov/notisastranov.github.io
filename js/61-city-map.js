// === CITY MAP (Leaflet national/city level) ===
var CityMap = {
  map: null,
  _ready: false,
  _markers: {},
  _center: null,
  _route: null,
  _routeCoords: [],
  _demoDrivers: [],
  _demoPhase: 0,
  _forceOpen: false,
  active: false,
  ENTER_Z: 1.58,
  EXIT_Z: 1.72,

  init() {
    const el = document.getElementById('city-map');
    if (!el) return;
    if (typeof L === 'undefined') {
      // Leaflet loads after critical — retry once
      if (!this._leafletRetry) {
        this._leafletRetry = true;
        setTimeout(() => this.init(), 400);
      }
      return;
    }
    if (this._ready) return;
    // ensure dark bg to prevent white flash on enter
    el.style.background = 'var(--an-bg)';
    this.map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      opacity: 0.42,
      attribution: '© OSM'
    }).addTo(this.map);
    this._center = this._center || { lat: 0, lng: 0 };
    this.map.setView([this._center.lat, this._center.lng], 3, { animate: false });
    this._ready = true;
    el.addEventListener('wheel', e => {
      if (!this.active) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      const curZ = this.map.getZoom();
      if (dir > 0 && curZ <= 3) {
        this._bridgeZoomOut(0.14);
        return;
      }
      this.map.setZoom(Math.max(3, Math.min(19, curZ + dir * 0.8)), { animate: true });
    }, { passive: false });
    this._bindMapGestures();
    this._bindMapClick();
    this.map.on('moveend zoomend', () => {
      if (this.active) this._syncMarkers();
    });
  },

  _bindMapClick() {
    if (!this.map || this.map._placeClickBound) return;
    this.map._placeClickBound = true;
    // Single click → radar search around place (CLI guides e.g. pharmacy)
    // Long press → MultiTile (profile / vendor / driver / post)
    let pressTimer = null;
    let pressLatLng = null;
    let longFired = false;
    const clearPress = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    };
    this.map.on('mousedown', (e) => {
      if (!this.active) return;
      longFired = false;
      pressLatLng = e.latlng;
      clearPress();
      pressTimer = setTimeout(() => {
        longFired = true;
        if (pressLatLng) {
          MultiTile?.openAt?.(pressLatLng.lat, pressLatLng.lng, { source: 'long-press' });
        }
      }, 480);
    });
    this.map.on('mouseup', () => clearPress());
    this.map.on('mousemove', () => { /* drag cancels long-press */ });
    this.map.on('dragstart', () => { clearPress(); longFired = false; });
    this.map.on('touchstart', (e) => {
      if (!this.active) return;
      const t = e.originalEvent?.touches?.[0];
      if (!t || (e.originalEvent.touches.length > 1)) return;
      longFired = false;
      pressLatLng = e.latlng;
      clearPress();
      pressTimer = setTimeout(() => {
        longFired = true;
        if (pressLatLng) {
          MultiTile?.openAt?.(pressLatLng.lat, pressLatLng.lng, { source: 'long-press' });
        }
      }, 480);
    }, { passive: true });
    this.map.on('touchend', () => clearPress());
    this.map.on('touchmove', () => clearPress());
    this.map.on('click', (e) => {
      if (!this.active) return;
      if (longFired) {
        longFired = false;
        return; // long-press already opened multi-tile
      }
      MapRadar?.at?.(e.latlng.lat, e.latlng.lng, { source: 'city-map' });
    });
  },

  /**
   * Leave city map and return to the 3D globe (national/global).
   * Old path only nudged camera while map stayed on top — felt broken.
   */
  _bridgeZoomOut(amount) {
    this.returnToGlobe({ pull: amount });
  },

  /** Hard handoff: hide Leaflet, show globe, zoom out so Earth is visible. */
  returnToGlobe(opts) {
    opts = opts || {};
    window._cityDropLock = false;
    window._locateCinematic = false;
    this._forceOpen = false;
    this._exit();
    try {
      document.body?.classList?.remove?.('city-map-active', 'national-map-active');
      const globe = document.getElementById('globe');
      if (globe) {
        globe.classList.remove('city-map-active', 'national-map-active');
        globe.style.opacity = '1';
        globe.style.visibility = 'visible';
        globe.style.display = '';
        globe.style.zIndex = '2';
      }
      const canvas = globe?.querySelector?.('canvas') || document.querySelector('#globe canvas');
      if (canvas) {
        canvas.style.opacity = '1';
        canvas.style.pointerEvents = 'auto';
        canvas.style.display = 'block';
      }
      const chip = document.getElementById('city-life-chip');
      if (chip) chip.classList.remove('open');
    } catch (_) {}
    try { cityLevel = false; } catch (_) {}
    if (CosmicZoom) CosmicZoom.level = 'earth';

    const globalZ = ZoomTiers?.tierZ?.('global') || GlobeControl?.Z?.global || window.START_CAM_Z || 3.65;
    const nationalZ = ZoomTiers?.tierZ?.('national') || GlobeControl?.Z?.national || 2.05;
    // Prefer global so user clearly sees the full globe, not stuck at street camZ
    const toZ = opts.tier === 'national' ? nationalZ : globalZ;
    const fromZ = (typeof camera !== 'undefined' && camera?.position?.z) || 1.4;
    try {
      if (typeof camera !== 'undefined' && camera) {
        window._globeFly = null;
        if (opts.instant) {
          camera.position.z = toZ;
          camera.lookAt(0, 0, 0);
          ZoomTiers?.goTo?.(opts.tier === 'national' ? 'national' : 'global', false);
        } else {
          window._globeFly = {
            mode: 'zoom',
            fromZ: fromZ < toZ ? fromZ : Math.max(1.2, toZ - 0.8),
            toZ,
            t0: performance.now(),
            dur: opts.dur || 1100,
            tierId: opts.tier === 'national' ? 'national' : 'global',
            onTier: true,
          };
          ZoomTiers?.goTo?.(opts.tier === 'national' ? 'national' : 'global', false);
        }
      }
    } catch (_) {}
    try {
      CosmicZoom?.update?.(toZ, {
        tier: opts.tier === 'national' ? 'national' : 'global',
        label: opts.tier === 'national' ? 'NATIONAL' : 'Earth',
        cosmic: 'earth',
      });
    } catch (_) {}
    const zl = document.getElementById('zoom-label');
    if (zl) {
      zl.textContent = opts.tier === 'national'
        ? (PublicCopy?.zoomLine?.('national') || 'Country · drag · choose a city')
        : (PublicCopy?.zoomLine?.('global') || 'Earth · drag · scroll for country · tap city');
    }
    CliRibbon?.setNotice?.('Globe · drag · scroll · 🎯 locate', 'ready');
    GlobeDeck?.setPreview?.('Globe · drag Earth · scroll to zoom · 🎯 locate');
    GlobeDeck?.setMapStatus?.('Earth');
    return true;
  },

  _bindMapGestures() {
    const el = document.getElementById('city-map');
    if (!el || !this.map) return;
    let lastDist = 0;
    el.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!this.active || e.touches.length !== 2 || !lastDist) return;
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = d - lastDist;
      lastDist = d;
      const cur = this.map.getZoom();
      if (delta < 0 && cur <= 3.05) {
        this._bridgeZoomOut(0.1);
        e.preventDefault();
        return;
      }
      const nz = Math.max(3, Math.min(19, cur + (delta > 0 ? 0.03 : -0.03)));
      if (Math.abs(nz - cur) > 0.01) this.map.setZoom(nz, { animate: false });
      e.preventDefault();
    }, { passive: false });
  },

  camZToZoom(camZ) {
    if (camZ > 1.7) return 12;
    if (camZ > 1.4) return 14;
    if (camZ > 1.2) return 16;
    return 18;
  },

  globeCenterLatLng() {
    if (window._lastPos?.lat != null) return window._lastPos;
    if (this._center?.lat != null) return this._center;
    return null;
  },

  flyTo(lat, lng, zoom) {
    this._center = { lat, lng };
    if (this.map) this.map.setView([lat, lng], zoom || 15, { animate: true });
  },

  async openAt(lat, lng, opts) {
    opts = opts || {};
    if (!this._ready || !this.map) this.init();
    if (!this.map) return false;
    const c = lat != null && lng != null ? { lat, lng } : (window._lastPos || this._center);
    if (!c?.lat) return false;
    this._center = c;
    window._lastPos = { lat: c.lat, lng: c.lng };
    userLocated = true;
    const camZ = opts.camZ ?? CityLife?.CITY_ZOOM ?? 1.34;
    const lz = opts.zoom ?? this.camZToZoom(camZ);
    this._forceOpen = true;
    if (!this.active) this._enter(camZ);
    else {
      this.map.setView([c.lat, c.lng], lz, { animate: false });
      this._invalidate();
      this._syncMarkers();
      this._syncRoute();
    }
    this.map.setView([c.lat, c.lng], lz, { animate: false });
    if (typeof camera !== 'undefined' && camera) {
      camera.position.z = camZ;
      camera.lookAt(0, 0, 0);
    }
    ZoomTiers?.goTo?.('city', false);
    cityLevel = true;
    CosmicZoom?.update?.(camZ, { tier: 'city', label: 'CITY', cosmic: 'earth' });
    setTimeout(() => { this._forceOpen = false; }, 4000);
    setTimeout(() => this._invalidate(), 80);
    return true;
  },

  onCamera(camZ, level) {
    if (!this._ready) return;
    // During locate cinematic fly: never open map mid-turn (teleport bug)
    if (window._globeFly) {
      if (this.active && !window._locateCinematic) this._syncView(camZ);
      return;
    }
    if (window._locateCinematic) {
      // Cinematic owns enter — only exit if zoomed way out
      if (this.active && camZ > this.EXIT_Z) this._exit();
      return;
    }
    const earth = window._cityDropLock || this._forceOpen
      || (level || CosmicZoom?.level || 'earth') === 'earth';
    const driving = !!DrivingView?.active;
    const force = this._forceOpen || window._cityDropLock;
    if (force || driving) {
      if (!this.active) this._enter(camZ);
      else this._syncView(camZ);
      return;
    }
    const shouldEnter = earth && (camZ <= this.ENTER_Z || driving);
    const shouldExit = !earth || (camZ > this.EXIT_Z && !driving);
    if (shouldEnter && !this.active) this._enter(camZ);
    else if (shouldExit && this.active) this._exit();
    else if (this.active) this._syncView(camZ);
  },

  _enter(camZ) {
    this.active = true;
    cityLevel = true;
    const el = document.getElementById('city-map');
    const globe = document.getElementById('globe');
    if (el) {
      el.classList.add('active');
      el.style.pointerEvents = 'auto';
      el.style.opacity = '1';
    }
    if (globe) globe.classList.add('city-map-active');
    // prevent white flash: force dark bg before map view
    if (el) el.style.background = 'var(--an-bg)';
    const mapContainer = this.map && this.map.getContainer ? this.map.getContainer() : null;
    if (mapContainer) mapContainer.style.background = 'var(--an-bg)';
    const c = window._lastPos || this.globeCenterLatLng() || this._center;
    if (!c?.lat) return;
    this._center = c;
    this.map.setView([c.lat, c.lng], this.camZToZoom(camZ), { animate: false });
    this._invalidate();
    setTimeout(() => this._invalidate(), 120);
    setTimeout(() => this._invalidate(), 500);
    this._syncMarkers();
    this._syncRoute();
    this._seedDemoDrivers(c);
    CityLife?._updateChip?.(
      (CityLife?.nearbyVendors?.(c.lat, c.lng) || []).length,
      Object.keys(this._markers).filter(k => k.startsWith('drv_')).length
    );
    const chip = document.getElementById('city-life-chip');
    if (chip) {
      chip.classList.add('open');
      chip.innerHTML = '<b>City map</b> · scroll/pinch <b>out</b> for globe';
    }
    MapDepict?.setHud?.('City map', 'pinch/scroll out → globe');
    GlobeDeck?.setPreview?.('City map · scroll/pinch out to return to globe');
  },

  _exit() {
    this.active = false;
    try { cityLevel = false; } catch (_) {}
    const el = document.getElementById('city-map');
    const globe = document.getElementById('globe');
    if (el) {
      el.classList.remove('active', 'national-active');
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';
    }
    if (globe) {
      globe.classList.remove('city-map-active', 'national-map-active');
    }
    try {
      document.body?.classList?.remove?.('city-map-active', 'national-map-active');
      const canvas = globe?.querySelector?.('canvas');
      if (canvas) {
        canvas.style.opacity = '1';
        canvas.style.pointerEvents = 'auto';
      }
    } catch (_) {}
    EarthRealism?._hudTimer && (EarthRealism._hudTimer = 0);
  },

  _syncView(camZ) {
    if (window._globeFly || !this.map) return;
    const c = DrivingView?.active && window._lastPos
      ? window._lastPos
      : (window._lastPos || this.globeCenterLatLng() || this._center);
    if (!c?.lat) return;
    this._center = c;
    const lz = this.camZToZoom(camZ);
    try {
      if (this.map.getZoom() !== lz) this.map.setZoom(lz, { animate: false });
      const cur = this.map.getCenter();
      if (Math.abs(cur.lat - c.lat) > 0.0004 || Math.abs(cur.lng - c.lng) > 0.0004) {
        this.map.panTo([c.lat, c.lng], { animate: false });
      }
    } catch (_) {
      this.map.setView([c.lat, c.lng], lz, { animate: false });
    }
  },

  _icon(emoji, color) {
    return L.divIcon({
      className: 'city-map-pin',
      html: '<span style="background:' + color + ';border:2px solid #fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.45)">' + emoji + '</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  },

  _setMarker(id, lat, lng, opts) {
    opts = opts || {};
    if (lat == null || lng == null) return;
    const prev = this._markers[id];
    if (prev) {
      prev.setLatLng([lat, lng]);
      return prev;
    }
    const m = L.marker([lat, lng], {
      icon: this._icon(opts.emoji || '◎', opts.color || 'rgba(0,140,220,0.9)'),
      title: opts.title || id,
    });
    if (opts.onClick) m.on('click', opts.onClick);
    m.addTo(this.map);
    this._markers[id] = m;
    return m;
  },

  _syncMarkers() {
    if (!this.active || !this.map) return;
    const me = window._lastPos;
    if (me) {
      this._setMarker('me', me.lat, me.lng, { emoji: '●', color: 'rgba(0,255,140,0.95)', title: 'You', onClick: () => GlobeEntity?.entities?.get('me') && GlobeEntity.activate(GlobeEntity.entities.get('me')) });
    }
  },

  _driverLatLng(d, u, i) {
    const lat = d.field_lat ?? d.lat ?? d.latitude;
    const lng = d.field_lng ?? d.lng ?? d.longitude;
    if (lat != null && lng != null) return { lat: +lat, lng: +lng };
    return { lat: u.lat + (Math.sin(i * 1.7) * 0.006), lng: u.lng + (Math.cos(i * 1.3) * 0.006) };
  },

  _seedDemoDrivers(c) {
    const u = c || window._lastPos || this._center || { lat: 36.44, lng: 28.22 };
    if (this._demoDrivers.length) return;
    this._demoDrivers = [
      { id: 'demo1', display_name: 'Nikos · delivery', field_lat: u.lat + 0.004, field_lng: u.lng - 0.003 },
      { id: 'demo2', display_name: 'Elena · courier', field_lat: u.lat - 0.003, field_lng: u.lng + 0.005 },
      { id: 'demo3', display_name: 'Alex · ride', field_lat: u.lat + 0.002, field_lng: u.lng + 0.004 },
    ];
  },

  _animateDemoDrivers() {
    this._demoPhase += 0.0012;
    const u = window._lastPos || this._center;
    if (!u) return;
    this._demoDrivers.forEach((d, i) => {
      d.field_lat = u.lat + Math.sin(this._demoPhase + i * 2.1) * 0.008;
      d.field_lng = u.lng + Math.cos(this._demoPhase + i * 1.6) * 0.008;
    });
  },

  async _tickDrivers() {
    if (!this.active) return;
    const u = window._lastPos || this._center;
    if (!u) return;
    let drivers = window.Commerce?.fetchNearbyDrivers
      ? await window.Commerce.fetchNearbyDrivers(u.lat, u.lng)
      : [];
    if (!drivers.length) {
      this._seedDemoDrivers(u);
      this._animateDemoDrivers();
      drivers = this._demoDrivers;
    }
    window.Commerce?.showDriversOnGlobe?.(drivers);
    const seen = new Set();
    drivers.forEach((d, i) => {
      const p = this._driverLatLng(d, u, i);
      const id = 'drv_' + (d.id || i);
      seen.add(id);
      this._setMarker(id, p.lat, p.lng, {
        emoji: '🚗',
        color: 'rgba(80,180,255,0.92)',
        title: d.display_name || 'Driver',
      });
    });
    Object.keys(this._markers).forEach(k => {
      if (k.startsWith('drv_') && !seen.has(k)) {
        this.map.removeLayer(this._markers[k]);
        delete this._markers[k];
      }
    });
  },

  setRoute(coords) {
    this._routeCoords = coords || [];
    this._syncRoute();
  },

  /**
   * Task multi-waypoint geometry on the map:
   * · polyline road route
   * · polygon hull around waypoints (service corridor)
   * · numbered waypoint markers
   */
  setTaskGeometry(spec) {
    this.init();
    if (!this.map) {
      this._pendingTaskGeom = spec;
      return;
    }
    this.clearTaskGeometry();
    const route = spec?.route || spec?.coords || [];
    const wps = Array.isArray(spec?.waypoints) ? spec.waypoints : [];
    const poly = spec?.polygon || null;
    const bright = (AstranovTheme?.effectiveMode?.() || AstranovTheme?.mode) === 'bright';
    const lineColor = bright ? '#0066cc' : '#44ccff';
    const polyColor = bright ? '#1a8' : '#2dd4a8';

    if (route.length >= 2) {
      this._routeCoords = route.map((c) => ({ lat: +c.lat, lng: +c.lng }));
      this._taskRoute = L.polyline(
        this._routeCoords.map((c) => [c.lat, c.lng]),
        { color: lineColor, weight: 5, opacity: 0.9, lineJoin: 'round' }
      ).addTo(this.map);
      this._route = this._taskRoute;
    }

    const hull = poly && poly.length >= 3
      ? poly
      : (wps.length >= 3 ? this._convexHullLatLng(wps) : null);
    if (hull && hull.length >= 3) {
      this._taskPolygon = L.polygon(
        hull.map((c) => [c.lat, c.lng]),
        {
          color: polyColor,
          weight: 2,
          opacity: 0.85,
          fillColor: polyColor,
          fillOpacity: 0.12,
          dashArray: '6 4',
        }
      ).addTo(this.map);
      this._taskPolygonRing = hull;
    }

    this._taskWpMarkers = [];
    wps.forEach((wp, i) => {
      if (wp?.lat == null || wp?.lng == null) return;
      const n = i + 1;
      const done = !!wp.done;
      const cur = !!wp.current;
      const icon = L.divIcon({
        className: 'cm-wp-icon',
        html: '<div class="cm-wp' + (cur ? ' cur' : '') + (done ? ' done' : '') + '">' + n + '</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const m = L.marker([wp.lat, wp.lng], { icon, title: wp.label || ('Stop ' + n) }).addTo(this.map);
      if (wp.label || wp.info) {
        m.bindPopup(
          '<b>' + n + '. ' + this._esc(wp.label || ('Stop ' + n)) + '</b>'
          + (wp.coins ? '<br/>' + wp.coins + ' 🪙' : '')
          + (wp.info ? '<br/><small>' + this._esc(String(wp.info).slice(0, 120)) + '</small>' : '')
        );
      }
      this._taskWpMarkers.push(m);
    });

    // Fit bounds to route + waypoints
    try {
      const bounds = [];
      (route || []).forEach((c) => bounds.push([c.lat, c.lng]));
      wps.forEach((w) => { if (w.lat != null) bounds.push([w.lat, w.lng]); });
      if (bounds.length >= 2 && this.active) {
        this.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
      } else if (bounds.length === 1 && this.active) {
        this.map.setView(bounds[0], Math.max(this.map.getZoom(), 14));
      }
    } catch (_) {}
  },

  clearTaskGeometry() {
    if (!this.map) return;
    if (this._taskRoute) {
      try { this.map.removeLayer(this._taskRoute); } catch (_) {}
      this._taskRoute = null;
    }
    if (this._route && this._route !== this._taskRoute) {
      try { this.map.removeLayer(this._route); } catch (_) {}
    }
    this._route = null;
    if (this._taskPolygon) {
      try { this.map.removeLayer(this._taskPolygon); } catch (_) {}
      this._taskPolygon = null;
    }
    (this._taskWpMarkers || []).forEach((m) => {
      try { this.map.removeLayer(m); } catch (_) {}
    });
    this._taskWpMarkers = [];
    this._taskPolygonRing = null;
  },

  _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /** Andrew's monotone chain convex hull for lat/lng points */
  _convexHullLatLng(points) {
    const pts = (points || [])
      .filter((p) => p && p.lat != null && p.lng != null)
      .map((p) => ({ lat: +p.lat, lng: +p.lng }))
      .sort((a, b) => a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  },

  _syncRoute() {
    if (!this.map) return;
    // Prefer full task geometry when present
    if (this._taskRoute || this._taskPolygon) return;
    if (this._route) {
      this.map.removeLayer(this._route);
      this._route = null;
    }
    const coords = this._routeCoords || DrivingView?.routeCoords || [];
    if (!coords.length || !this.active) return;
    const latlngs = coords.map(c => [c.lat, c.lng]);
    this._route = L.polyline(latlngs, {
      color: (AstranovTheme?.effectiveMode?.() || AstranovTheme?.mode) === 'bright' ? '#0066cc' : '#44ccff',
      weight: 5,
      opacity: 0.88,
    }).addTo(this.map);
  },

  _invalidate() {
    if (this.map) this.map.invalidateSize();
  }
};
window.CityMap = CityMap;
