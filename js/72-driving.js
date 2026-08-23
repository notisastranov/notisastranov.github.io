// === DRIVING VIEW + OSRM ROAD ROUTING ===
const DrivingView = {
  active: false,
  speed: 0,
  mode: 'still',
  watchId: null,
  lastFix: null,
  lastTime: 0,
  routeLine: null,
  routeCoords: [],
  steps: [],
  stepIdx: 0,
  destination: null,
  WALK_THRESHOLD: 2.2,
  DRIVE_THRESHOLD: 4.5,

  haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  init() {
    this._geoReady = !!navigator.geolocation;
  },

  _ensureWatch() {
    if (this.watchId || !this._geoReady) return;
    this.watchId = navigator.geolocation.watchPosition(
      pos => this.onFix(pos),
      () => {},
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 12000 }
    );
  },

  setDestination(lat, lng) {
    this.destination = { lat, lng };
    this.waypoints = null;
    if (this.active) this.fetchRoadRoute();
  },

  /**
   * Multi-stop road route via OSRM (ordered waypoints).
   * waypoints: [{ lat, lng, label?, info?, coins? }, ...]
   */
  setWaypoints(waypoints, opts) {
    opts = opts || {};
    const list = (waypoints || [])
      .filter((w) => w && w.lat != null && w.lng != null)
      .map((w, i) => ({
        lat: +w.lat,
        lng: +w.lng,
        label: w.label || ('Stop ' + (i + 1)),
        info: w.info || w.note || '',
        coins: Math.max(0, Math.round(Number(w.coins) || 0)),
        id: w.id || ('wp' + i),
      }));
    this.waypoints = list;
    if (list.length) {
      this.destination = { lat: list[list.length - 1].lat, lng: list[list.length - 1].lng };
      this.wpIdx = Math.max(0, Math.min(opts.startIndex || 0, list.length - 1));
    }
    if (this.active || opts.force) this.fetchMultiWaypointRoute();
  },

  onFix(pos) {
    const now = Date.now();
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    let speed = pos.coords.speed;
    if (this.lastFix && this.lastTime) {
      const dt = (now - this.lastTime) / 1000;
      if (dt > 0.4) {
        const d = this.haversineM(this.lastFix.lat, this.lastFix.lng, lat, lng);
        if (speed == null || speed < 0) speed = d / dt;
      }
    }
    this.speed = Math.max(0, speed || 0);
    this.lastFix = { lat, lng };
    this.lastTime = now;
    window._lastPos = { lat, lng };
    window._gpsSpeedMps = this.speed;
    window._lastGpsFix = { lat, lng, speed: this.speed, t: now };
    if (typeof placeMe === 'function') placeMe(lat, lng, { quiet: true, markerOnly: true });

    const prev = this.mode;
    if (this.speed < 0.6) this.mode = 'still';
    else if (this.speed < this.WALK_THRESHOLD) this.mode = 'walk';
    else if (this.speed < this.DRIVE_THRESHOLD) this.mode = 'run';
    else this.mode = 'drive';

    const fast = this.mode === 'run' || this.mode === 'drive';
    if (fast && !this.active) this.activate();
    if (this.active && this.mode === 'still' && this.speed < 0.5) this.deactivate();
    if (this.active) {
      this.updateCamera(pos);
      this.updateGuidance(lat, lng);
    }
    if (prev !== this.mode) {
      FieldBrain?.pulse('drive', this.mode + ' ' + Math.round(this.speed * 3.6) + 'km/h', { role: 'driver' });
    }
    if (prev !== this.mode && fast) {
      const g = window.AstroGlyphs || { drive: '🚗', fast: '⚡' };
      GlobeDeck?.setPreview((this.mode === 'drive' ? g.drive + ' DRIVING' : g.fast + ' FAST') + ' · ' + Math.round(this.speed * 3.6) + ' km/h');
    }
  },

  activate() {
    this._ensureWatch();
    this.active = true;
    this._cameraFollow = true;
    GlobeControl?.engageFollow?.('drive');
    SuperCli?.setContext?.('drive');
    cityLevel = true;
    CityMap?.onCamera?.(1.22, 'earth');
    const pos = window._lastPos || { lat: 36.44, lng: 28.22 };
    const p = latLngToPos(pos.lat, pos.lng, 1.04);
    if (typeof flyToPoint === 'function') {
      flyToPoint(new THREE.Vector3(p.x, p.y, p.z), 1.28, {
        dur: GlobeControl?.flyDuration?.(camera?.position?.z, 1.28),
      });
      GlobeControl?.noteAutoFly?.();
    }
    GlobeDeck?.setPreview('DRIVE VIEW · ' + Math.round(this.speed * 3.6) + ' km/h');
    document.getElementById('zoom-label').textContent = (this.mode === 'drive' ? 'DRIVE VIEW' : 'RUN VIEW');
    MapDepict?.action('drive', { detail: Math.round(this.speed * 3.6) + ' km/h' });
    if (!this.destination) {
      const v = Commerce?.vendors?.[0];
      this.destination = v ? { lat: v.lat, lng: v.lng } : { lat: 36.89, lng: 27.29 };
    }
    this.fetchRoadRoute();
    AppShortcuts?.track?.('drive', 'Drive');
    if (Voice.maySpeak()) speak('Driving on.', () => resumeListening());
  },

  deactivate() {
    this.active = false;
    this._cameraFollow = false;
    if (GlobeControl?.followMode === 'drive') GlobeControl.followMode = 'free';
    AppShortcuts?.untrack?.('drive');
    SuperCli?.setContext?.(SuperCli?.inferContext?.() || 'idle');
    GlobeDeck?.setPreview('');
    if (this.routeLine?.parent) this.routeLine.parent.remove(this.routeLine);
    this.routeLine = null;
    CityMap?.setRoute?.([]);
    const pos = window._lastPos || this.lastFix;
    const cityZ = GlobeControl?.Z?.city || 1.38;
    if (pos && typeof flyToPoint === 'function') {
      const p = latLngToPos(pos.lat, pos.lng, 1.04);
      flyToPoint(new THREE.Vector3(p.x, p.y, p.z), cityZ, { dur: 0.85 });
      GlobeControl?.noteAutoFly?.();
    }
    cityLevel = true;
    camera.position.z = cityZ;
    CityMap?.onCamera?.(cityZ, 'earth');
    document.getElementById('zoom-label').textContent = 'CITY VIEW';
    MapDepict?.pulse?.(pos?.lat, pos?.lng, 0x3d9eff, 'Stopped · city view', 5000);
    CosmicZoom?.update(camera.position.z);
  },

  updateCamera(pos) {
    if (!this._cameraFollow || GlobeControl?.userExploring) return;
    camera.position.z = this.mode === 'drive' ? 1.22 : 1.32;
    const h = pos.coords.heading;
    if (h != null && !isNaN(h) && window._meMarker) {
      globePivot.rotation.y = (-h + 90) * Math.PI / 180;
    }
  },

  async fetchRoadRoute() {
    if (this.waypoints?.length > 1) {
      return this.fetchMultiWaypointRoute();
    }
    const from = window._lastPos || this.lastFix;
    const to = this.destination;
    if (!from || !to) return;
    try {
      const url = 'https://router.project-osrm.org/route/v1/driving/'
        + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat
        + '?overview=full&geometries=geojson&steps=true';
      const r = await fetch(url);
      const j = await r.json();
      if (j.code !== 'Ok' || !j.routes?.[0]) return;
      const route = j.routes[0];
      this.routeCoords = route.geometry.coordinates.map(c => ({ lng: c[0], lat: c[1] }));
      this.steps = (route.legs[0]?.steps || []).map(s => ({
        instruction: (s.maneuver?.type || 'continue') + ' ' + (s.name || ''),
        dist: s.distance,
        loc: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] }
      }));
      this.stepIdx = 0;
      this.drawRoute();
      if (this.steps[0]) this.showStep(this.steps[0]);
    } catch (e) {
      console.warn('[DrivingView] OSRM failed', e);
    }
    if ((this.routeCoords?.length || 0) < 2 && from && to) {
      this.routeCoords = this._lerpPath(from, to, 12);
      this.drawRoute();
    }
  },

  /** Multi-waypoint OSRM route + per-leg steps for task guidance */
  async fetchMultiWaypointRoute() {
    const from = window._lastPos || this.lastFix;
    const wps = this.waypoints || [];
    if (!wps.length) return this.fetchRoadRoute();
    const nodes = [];
    if (from) nodes.push({ lat: from.lat, lng: from.lng, label: 'You' });
    wps.forEach((w) => nodes.push(w));
    if (nodes.length < 2) return;

    try {
      const path = nodes.map((n) => n.lng + ',' + n.lat).join(';');
      const url = 'https://router.project-osrm.org/route/v1/driving/'
        + path + '?overview=full&geometries=geojson&steps=true';
      const r = await fetch(url);
      const j = await r.json();
      if (j.code === 'Ok' && j.routes?.[0]) {
        const route = j.routes[0];
        this.routeCoords = route.geometry.coordinates.map((c) => ({ lng: c[0], lat: c[1] }));
        this.legs = (route.legs || []).map((leg, i) => ({
          index: i,
          distance: leg.distance,
          duration: leg.duration,
          to: nodes[i + 1],
          steps: (leg.steps || []).map((s) => ({
            instruction: (s.maneuver?.type || 'continue') + ' ' + (s.name || ''),
            dist: s.distance,
            loc: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] },
          })),
        }));
        this.steps = this.legs.flatMap((leg) => leg.steps || []);
        this.stepIdx = 0;
        this.drawRoute({ waypoints: wps });
        const cur = wps[this.wpIdx || 0];
        if (cur) {
          const line = '➤ Next: ' + (cur.label || 'stop')
            + (cur.coins ? ' · ' + cur.coins + '🪙' : '');
          GlobeDeck?.setPreview?.(line);
          AciCli?.print?.(line, 'ok');
        } else if (this.steps[0]) this.showStep(this.steps[0]);
        return;
      }
    } catch (e) {
      console.warn('[DrivingView] multi-OSRM failed', e);
    }
    // Fallback: straight segments between nodes
    const fallback = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      fallback.push(...this._lerpPath(nodes[i], nodes[i + 1], 8));
    }
    this.routeCoords = fallback;
    this.drawRoute({ waypoints: wps });
  },

  _lerpPath(from, to, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({
        lat: from.lat + (to.lat - from.lat) * t,
        lng: from.lng + (to.lng - from.lng) * t,
      });
    }
    return out;
  },

  drawRoute(opts) {
    opts = opts || {};
    if (this.routeLine?.parent) this.routeLine.parent.remove(this.routeLine);
    const pts = (this.routeCoords || []).map(c => {
      const p = latLngToPos(c.lat, c.lng, 1.026);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    if (pts.length >= 2 && typeof THREE !== 'undefined' && typeof globePivot !== 'undefined') {
      this.routeLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.85 })
      );
      globePivot.add(this.routeLine);
    }
    const wps = opts.waypoints || this.waypoints || [];
    if (wps.length >= 1 && CityMap?.setTaskGeometry) {
      CityMap.setTaskGeometry({
        route: this.routeCoords,
        waypoints: wps.map((w, i) => ({
          ...w,
          current: i === (this.wpIdx || 0),
          done: i < (this.wpIdx || 0),
        })),
      });
    } else {
      CityMap?.setRoute?.(this.routeCoords);
    }
    const me = window._lastPos;
    if (me) MapDepict?.pulse?.(me.lat, me.lng, 0x44aaff, wps.length > 1 ? 'multi-stop route' : 'road route', 6000);
  },

  showStep(step) {
    const km = step.dist > 1000 ? (step.dist / 1000).toFixed(1) + ' km' : Math.round(step.dist) + ' m';
    const line = '➤ ' + step.instruction + ' · ' + km;
    GlobeDeck?.setPreview(line);
    ACIControl?.reply(line);
    if (step.loc) MapDepict?.pulse(step.loc.lat, step.loc.lng, 0x44aaff, step.instruction.slice(0, 40), 5000);
  },

  updateGuidance(lat, lng) {
    if (!this.steps.length) return;
    const step = this.steps[this.stepIdx];
    if (!step?.loc) return;
    const d = this.haversineM(lat, lng, step.loc.lat, step.loc.lng);
    if (d < 35 && this.stepIdx < this.steps.length - 1) {
      this.stepIdx++;
      this.showStep(this.steps[this.stepIdx]);
    }
  }
};
window.DrivingView = DrivingView;
