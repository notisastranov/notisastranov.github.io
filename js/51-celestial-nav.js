// === CELESTIAL NAV — constellations visible at your position (global view) ===
const CelestialNav = {
  SKY_R: 1.36,
  MIN_ALT: 8,
  _group: null,
  _lines: [],
  _points: null,
  _pointMap: {},
  _lastGuide: '',
  _tickAt: 0,

  STARS: {
    Polaris:   { ra: 2.530301, dec: 89.26411, nav: true, label: 'Polaris · N' },
    Kochab:    { ra: 14.845003, dec: 74.15500 },
    Dubhe:     { ra: 11.06206, dec: 61.75097 },
    Merak:     { ra: 11.03364, dec: 56.38243 },
    Phecda:    { ra: 11.89706, dec: 53.69477 },
    Megrez:    { ra: 12.25732, dec: 57.03255 },
    Alioth:    { ra: 12.90043, dec: 55.95982 },
    Mizar:     { ra: 13.39871, dec: 54.92536 },
    Alkaid:    { ra: 13.79229, dec: 49.31330 },
    Schedar:   { ra: 0.67511, dec: 56.53733 },
    Caph:      { ra: 0.15295, dec: 59.14978 },
    Navi:      { ra: 0.94514, dec: 60.71667 },
    Ruchbah:   { ra: 1.43056, dec: 60.23528 },
    Betelgeuse:{ ra: 5.91953, dec: 7.40706 },
    Bellatrix: { ra: 5.41885, dec: 6.34970 },
    Mintaka:   { ra: 5.53344, dec: -0.29910 },
    Alnilam:   { ra: 5.60329, dec: -1.20192 },
    Alnitak:   { ra: 5.67928, dec: -1.94259 },
    Rigel:     { ra: 5.24230, dec: -8.20164 },
    Saiph:     { ra: 5.79592, dec: -9.66961 },
    Sirius:    { ra: 6.75248, dec: -16.71612, nav: true, label: 'Sirius' },
    Acrux:     { ra: 12.44332, dec: -63.09912, nav: true, label: 'Acrux' },
    Mimosa:    { ra: 12.79536, dec: -59.68876 },
    Gacrux:    { ra: 12.51943, dec: -57.11321 },
    Imai:      { ra: 12.69460, dec: -59.04143 },
    Antares:   { ra: 16.49013, dec: -26.43194, nav: true, label: 'Antares' },
  },

  SETS: [
    {
      id: 'uma', name: 'Ursa Major', short: 'Big Dipper',
      nav: 'Pointer stars → Polaris · north',
      lines: [['Dubhe','Merak'],['Merak','Phecda'],['Phecda','Megrez'],['Megrez','Alioth'],['Alioth','Mizar'],['Mizar','Alkaid'],['Dubhe','Megrez']],
    },
    {
      id: 'umi', name: 'Ursa Minor', short: 'Little Dipper',
      nav: 'Polaris at handle tip · true north',
      lines: [['Polaris','Kochab']],
    },
    {
      id: 'cas', name: 'Cassiopeia', short: 'W',
      nav: 'Opposite Big Dipper · circumpolar N',
      lines: [['Caph','Schedar'],['Schedar','Navi'],['Navi','Ruchbah'],['Ruchbah','Caph']],
    },
    {
      id: 'ori', name: 'Orion', short: 'Hunter',
      nav: 'Belt E→W · rises east, sets west',
      lines: [['Betelgeuse','Bellatrix'],['Bellatrix','Mintaka'],['Mintaka','Alnilam'],['Alnilam','Alnitak'],['Alnitak','Saiph'],['Saiph','Rigel'],['Rigel','Mintaka'],['Betelgeuse','Mintaka']],
    },
    {
      id: 'cma', name: 'Canis Major',
      nav: 'Sirius — brightest star · SE/S reference',
      lines: [['Sirius','Betelgeuse']],
    },
    {
      id: 'cru', name: 'Crux', short: 'Southern Cross',
      nav: 'Long axis → south celestial pole',
      lines: [['Acrux','Mimosa'],['Mimosa','Gacrux'],['Gacrux','Imai'],['Imai','Acrux']],
    },

  ],

  init() {
    if (this._group || typeof globePivot === 'undefined') return;
    this._group = new THREE.Group();
    this._group.visible = false;
    globePivot.add(this._group);

    this.SETS.forEach(set => {
      set.lines.forEach((pair, i) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(6, 3));
        const mat = new THREE.LineBasicMaterial({
          color: 0xa8d4ff,
          transparent: true,
          opacity: 0.62,
          depthWrite: false,
        });
        const line = new THREE.Line(geo, mat);
        line.visible = false;
        line.userData = { setId: set.id, stars: pair };
        this._group.add(line);
        this._lines.push(line);
      });
    });

    const starNames = Object.keys(this.STARS);
    const pos = new Float32Array(starNames.length * 3);
    const col = new Float32Array(starNames.length * 3);
    starNames.forEach((name, i) => {
      this._pointMap[name] = i;
      const nav = this.STARS[name].nav;
      col[i * 3] = nav ? 1.0 : 0.72;
      col[i * 3 + 1] = nav ? 0.82 : 0.86;
      col[i * 3 + 2] = nav ? 0.45 : 1.0;
    });
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.028,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this._points = new THREE.Points(pGeo, pMat);
    this._group.add(this._points);
    this._starNames = starNames;
  },

  gmstDeg(date) {
    const jd = date.getTime() / 86400000 + 2440587.5;
    const t = (jd - 2451545.0) / 36525;
    let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t;
    return ((g % 360) + 360) % 360;
  },

  lstHours(lng, date) {
    return ((this.gmstDeg(date) / 15 + lng / 15) % 24 + 24) % 24;
  },

  horizontal(raH, decDeg, lat, lng, date) {
    const lst = this.lstHours(lng, date);
    const H = (lst - raH) * 15 * Math.PI / 180;
    const dec = decDeg * Math.PI / 180;
    const latR = lat * Math.PI / 180;
    const sinAlt = Math.sin(dec) * Math.sin(latR) + Math.cos(dec) * Math.cos(latR) * Math.cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI;
    const cosAlt = Math.cos(alt * Math.PI / 180) || 1e-6;
    const sinAz = -Math.cos(dec) * Math.sin(H) / cosAlt;
    const cosAz = (Math.sin(dec) - Math.sin(latR) * sinAlt) / (Math.cos(latR) * cosAlt);
    let az = Math.atan2(sinAz, cosAz) * 180 / Math.PI;
    if (az < 0) az += 360;
    return { alt, az, lst };
  },

  bearing(az) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(az / 22.5) % 16];
  },

  observerBasis(lat, lng) {
    const base = latLngToPos(lat, lng, 1.02);
    const up = new THREE.Vector3(base.x, base.y, base.z).normalize();
    const nPos = latLngToPos(lat + 0.08, lng, 1);
    const ePos = latLngToPos(lat, lng + 0.08, 1);
    const cPos = latLngToPos(lat, lng, 1);
    const north = new THREE.Vector3(nPos.x - cPos.x, nPos.y - cPos.y, nPos.z - cPos.z).normalize();
    const east = new THREE.Vector3(ePos.x - cPos.x, ePos.y - cPos.y, ePos.z - cPos.z).normalize();
    return { base, up, north, east };
  },

  skyPoint(alt, az, basis) {
    const a = alt * Math.PI / 180;
    const z = az * Math.PI / 180;
    const dir = new THREE.Vector3()
      .addScaledVector(basis.up, Math.sin(a))
      .addScaledVector(basis.north, Math.cos(a) * Math.cos(z))
      .addScaledVector(basis.east, Math.cos(a) * Math.sin(z))
      .normalize();
    return new THREE.Vector3(
      basis.base.x + dir.x * this.SKY_R,
      basis.base.y + dir.y * this.SKY_R,
      basis.base.z + dir.z * this.SKY_R
    );
  },

  observer() {
    return window._lastPos || { lat: 36.44, lng: 28.22, name: 'You' };
  },

  isGlobalNavView(camZ) {
    const z = camZ ?? camera?.position?.z ?? 2.55;
    const level = CosmicZoom?.level || 'earth';
    return level === 'earth' && z >= 2.05 && z < 4.2 && !CityMap?.active;
  },

  compute(date) {
    date = date || new Date();
    const obs = this.observer();
    const basis = this.observerBasis(obs.lat, obs.lng);
    const stars = {};
    Object.entries(this.STARS).forEach(([name, s]) => {
      const h = this.horizontal(s.ra, s.dec, obs.lat, obs.lng, date);
      stars[name] = Object.assign({ name }, s, h, {
        visible: h.alt >= this.MIN_ALT,
        bearing: this.bearing(h.az),
      });
    });

    const sets = this.SETS.map(set => {
      const pts = set.lines.flatMap(p => p);
      const alts = [...new Set(pts)].map(n => stars[n]?.alt ?? -90);
      const visCount = alts.filter(a => a >= this.MIN_ALT).length;
      const avgAlt = alts.reduce((a, b) => a + b, 0) / (alts.length || 1);
      return Object.assign({}, set, {
        visible: visCount >= 2,
        visCount,
        avgAlt,
      });
    }).filter(s => s.visible).sort((a, b) => b.avgAlt - a.avgAlt);

    const navStars = Object.values(stars).filter(s => s.nav && s.visible)
      .sort((a, b) => b.alt - a.alt);

    return { obs, stars, sets, navStars, date, basis };
  },

  tick() {
    if (!this._group) return;
    const camZ = camera?.position?.z ?? 2.55;
    const show = this.isGlobalNavView(camZ);
    this._group.visible = show;
    if (!show) return;

    const now = Date.now();
    if (now - this._tickAt < 900) return;
    this._tickAt = now;

    const sky = this.compute();
    const posAttr = this._points.geometry.attributes.position;

    this._starNames.forEach((name, i) => {
      const s = sky.stars[name];
      if (!s?.visible) {
        posAttr.setXYZ(i, 0, -99, 0);
        return;
      }
      const p = this.skyPoint(s.alt, s.az, sky.basis);
      posAttr.setXYZ(i, p.x, p.y, p.z);
    });
    posAttr.needsUpdate = true;

    const visibleSets = new Set(sky.sets.map(s => s.id));
    this._lines.forEach(line => {
      const pair = line.userData.stars;
      const a = sky.stars[pair[0]];
      const b = sky.stars[pair[1]];
      const showLine = visibleSets.has(line.userData.setId) && a?.visible && b?.visible;
      line.visible = showLine;
      if (!showLine) return;
      const pa = this.skyPoint(a.alt, a.az, sky.basis);
      const pb = this.skyPoint(b.alt, b.az, sky.basis);
      const arr = line.geometry.attributes.position.array;
      arr[0] = pa.x; arr[1] = pa.y; arr[2] = pa.z;
      arr[3] = pb.x; arr[4] = pb.y; arr[5] = pb.z;
      line.geometry.attributes.position.needsUpdate = true;
      const fade = Math.min(1, Math.min(a.alt, b.alt) / 35);
      line.material.opacity = 0.28 + fade * 0.5;
    });

    this._lastSky = sky;
  },

  summary() {
    return this._lastSky || this.compute();
  },

  renderGuideHtml(camZ) {
    if (!this.isGlobalNavView(camZ)) return '';
    const sky = this.summary();
    const names = sky.sets.map(s => s.short || s.name).join(' · ') || 'none above horizon yet';
    let html = '<div class="cg-title">Celestial navigation · your sky</div>';
    html += '<div class="cg-item"><b>Sun</b> — live day/night terminator on globe</div>';
    html += '<div class="cg-item"><b>Visible</b> — ' + names + '</div>';
    if (sky.obs?.lat != null) {
      html += '<div class="cg-item"><b>Observer</b> — ' + sky.obs.lat.toFixed(2) + '° · ' + sky.obs.lng.toFixed(2) + '°';
      if (!userLocated) html += ' <i>(locate for your position)</i>';
      html += '</div>';
    }
    if (sky.obs.lat >= 5) {
      const pol = sky.stars.Polaris;
      if (pol?.visible) {
        html += '<div class="cg-item"><b>Polaris</b> — ' + pol.bearing + ' · alt ' + pol.alt.toFixed(0) + '° ≈ latitude</div>';
      }
    }
    if (sky.obs.lat < 5) {
      const crux = sky.sets.find(s => s.id === 'cru');
      if (crux) html += '<div class="cg-item"><b>Southern Cross</b> — long axis → south · ship heading reference</div>';
    }
    sky.navStars.slice(0, 4).forEach(s => {
      const tip = s.label || s.name;
      html += '<div class="cg-item"><b>' + tip + '</b> — ' + s.bearing + ' · alt ' + s.alt.toFixed(0) + '°</div>';
    });
    const uma = sky.sets.find(s => s.id === 'uma');
    if (uma) html += '<div class="cg-item"><i>Big Dipper bowl → outer lip stars point to Polaris (north)</i></div>';
    html += '<div class="cg-item"><i>CLI: stars · constellations · nav</i></div>';
    return html;
  },

  printReport() {
    const sky = this.compute();
    const lines = ['◎ Celestial nav · ' + sky.sets.length + ' constellations above horizon'];
    sky.sets.forEach(s => {
      lines.push('  ' + (s.short || s.name) + ' — ' + s.nav);
    });
    if (sky.obs.lat >= 5 && sky.stars.Polaris?.visible) {
      lines.push('  Polaris alt ' + sky.stars.Polaris.alt.toFixed(1) + '° → latitude ≈ ' + sky.obs.lat.toFixed(1) + '°');
    }
    sky.navStars.forEach(s => {
      lines.push('  ★ ' + (s.label || s.name) + ' ' + s.bearing + ' ' + s.alt.toFixed(0) + '°');
    });
    AciCli?.print(lines.join('\n'), 'ok');
    const speak = sky.sets.slice(0, 3).map(s => s.short || s.name).join(', ') || 'no major constellations';
    ACIControl?.reply('Visible: ' + speak + ' · type nav for bearings');
    return sky;
  },
};
window.CelestialNav = CelestialNav;
