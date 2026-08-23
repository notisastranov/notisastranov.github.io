/* DEPLOY_STAMP_20260722 P0 restore missing static assets on Vercel */
// === GALACTIC SKY â€” real constellations + exoplanet host stars (not solar system) ===
const GalacticSky = {
  SKY_R: 2.05,
  _inited: false,

  EXO_HOSTS: [
    { name: 'Proxima Cen', star: 'Proxima Centauri', ra: 14.4966, dec: -62.680, dist: 4.24, planets: 'Proxima b,c,d', color: 0xff6644 },
    { name: 'TRAPPIST-1', star: 'TRAPPIST-1', ra: 23.0633, dec: -5.043, dist: 40.7, planets: '7 rocky worlds', color: 0xffaa44 },
    { name: 'Kepler-452', star: 'Kepler-452', ra: 19.1120, dec: 44.271, dist: 1402, planets: 'Kepler-452b', color: 0x66ccff },
    { name: '55 Cancri', star: '55 Cancri A', ra: 8.7484, dec: 28.662, dist: 41, planets: '5 planets Â· f rocky', color: 0xaaddff },
    { name: 'Tau Ceti', star: 'Tau Ceti', ra: 1.6744, dec: -15.938, dist: 11.9, planets: '4 candidate worlds', color: 0xeedd88 },
    { name: 'GJ 581', star: 'Gliese 581', ra: 15.2863, dec: -7.721, dist: 20.4, planets: 'b,c,d,e', color: 0x88bbff },
    { name: 'Kepler-186', star: 'Kepler-186', ra: 19.5633, dec: 43.633, dist: 492, planets: 'Kepler-186f', color: 0x55aaff },
    { name: 'K2-18', star: 'K2-18', ra: 11.5577, dec: 7.590, dist: 124, planets: 'K2-18b Â· water vapor', color: 0x44ddaa },
    { name: 'LHS 1140', star: 'LHS 1140', ra: 0.5953, dec: -15.310, dist: 40.7, planets: 'LHS 1140b', color: 0xcc88ff },
    { name: 'HD 209458', star: 'HD 209458', ra: 22.0940, dec: 18.884, dist: 159, planets: 'Osiris Â· first transit', color: 0xff88cc },
    { name: 'WASP-12', star: 'WASP-12', ra: 6.5914, dec: 29.091, dist: 1400, planets: 'WASP-12b Â· hot Jupiter', color: 0xff5522 },
    { name: 'TOI-700', star: 'TOI-700', ra: 6.7717, dec: -62.601, dist: 101, planets: 'TOI-700d Â· hab zone', color: 0x66ffcc },
    { name: 'Barnard', star: "Barnard's Star", ra: 17.9548, dec: 4.668, dist: 5.96, planets: 'b Â· super-Earth', color: 0xddaa66 },
    { name: 'Wolf 359', star: 'Wolf 359', ra: 10.2787, dec: 7.000, dist: 7.86, planets: 'b candidate', color: 0xff9966 },
    { name: 'GJ 1214', star: 'GJ 1214', ra: 17.5694, dec: 4.960, dist: 48, planets: 'GJ 1214b Â· mini-Neptune', color: 0x88ddff },
    { name: 'HD 10180', star: 'HD 10180', ra: 1.4676, dec: -60.318, dist: 127, planets: 'up to 9 planets', color: 0xaaccff },
  ],

  raDecToPos(raH, decDeg, r) {
    const lat = decDeg;
    const lng = raH * 15;
    if (typeof latLngToPos === 'function') return latLngToPos(lat, lng, r);
    const ra = raH / 24 * Math.PI * 2;
    const dec = decDeg * Math.PI / 180;
    return {
      x: r * Math.cos(dec) * Math.cos(ra),
      y: r * Math.sin(dec),
      z: r * Math.cos(dec) * Math.sin(ra),
    };
  },

  initExoHosts() {
    const CZ = window.CosmicZoom;
    if (!CZ || CZ._exoGroup || typeof globePivot === 'undefined') return;
    CZ._exoGroup = new THREE.Group();
    CZ._exoGroup.visible = false;
    CZ._exoMeshes = [];
    globePivot.add(CZ._exoGroup);

    this.EXO_HOSTS.forEach((h, i) => {
      const p = this.raDecToPos(h.ra, h.dec, this.SKY_R);
      const size = h.dist < 20 ? 0.022 : h.dist < 200 ? 0.016 : 0.012;
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(size, 10, 10),
        new THREE.MeshBasicMaterial({ color: h.color, transparent: true, opacity: 0.92 })
      );
      m.position.set(p.x, p.y, p.z);
      m.userData = Object.assign({ type: 'exo-host', idx: i }, h);
      CZ._exoGroup.add(m);
      CZ._exoMeshes.push(m);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(size * 1.8, size * 2.4, 16),
        new THREE.MeshBasicMaterial({ color: h.color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.position.copy(m.position);
      ring.lookAt(0, 0, 0);
      ring.userData = { type: 'exo-ring', host: h.name };
      CZ._exoGroup.add(ring);
    });

    if (CZ.solarGroup) CZ.solarGroup.visible = false;
  },

  guideHtml(level, camZ) {
    const CN = window.CelestialNav;
    let html = '';
    if (level === 'orbit') {
      html = '<div class="cg-title">Near-Earth orbit</div>'
        + '<div class="cg-item"><b>ISS</b> â€” live crew station Â· ~400 km</div>'
        + '<div class="cg-item"><b>LEO shells</b> â€” broadband orbital rings</div>'
        + '<div class="cg-item"><b>Constellations</b> â€” real RA/Dec Â· your horizon</div>';
    } else if (level === 'galactic') {
      html = '<div class="cg-title">Galactic sky Â· confirmed exoplanet hosts</div>'
        + '<div class="cg-item"><i>Real equatorial positions Â· not toy solar orbits</i></div>';
      this.EXO_HOSTS.slice(0, 8).forEach(h => {
        html += '<div class="cg-item"><b>' + h.star + '</b> â€” ' + h.planets
          + ' <i>Â· ' + h.dist + ' ly</i></div>';
      });
      html += '<div class="cg-item"><i>+' + (this.EXO_HOSTS.length - 8) + ' more hosts Â· type stars for full nav</i></div>';
    } else if (level === 'galaxy') {
      html = '<div class="cg-title">Milky Way context</div>'
        + '<div class="cg-item"><b>Exoplanet hosts</b> â€” ' + this.EXO_HOSTS.length + ' confirmed systems marked</div>'
        + '<div class="cg-item"><b>Star field</b> â€” spiral arm sampling Â· zoom in for sky dome</div>'
        + '<div class="cg-item"><i>Scroll in â†’ galactic sky â†’ constellations â†’ earth</i></div>';
    } else if (level === 'earth' && camZ >= 2.05 && CN?.renderGuideHtml) {
      html = CN.renderGuideHtml(camZ);
    }
    return html;
  },

  syncGuide(level, camZ) {
    const el = document.getElementById('cosmic-guide');
    if (!el) return;
    const CN = window.CelestialNav;
    const showCelestial = level === 'earth' && camZ >= 2.05 && camZ < 7.5 && !window.CityMap?.active
      && CN?._group?.visible;
    const show = level === 'orbit' || level === 'galactic' || level === 'galaxy' || showCelestial;
    el.classList.toggle('visible', !!show);
    if (!show) { el.innerHTML = ''; return; }
    const html = this.guideHtml(level, camZ) || CN?.renderGuideHtml?.(camZ) || '';
    if (html) el.innerHTML = html;
  },

  patchCosmicZoom() {
    const CZ = window.CosmicZoom;
    if (!CZ || CZ._galacticPatched) return;
    CZ._galacticPatched = true;

    const _init = CZ.init?.bind(CZ);
    if (_init) {
      CZ.init = () => {
        _init();
        if (CZ.solarGroup) CZ.solarGroup.visible = false;
        this.initExoHosts();
      };
    }

    const _update = CZ.update?.bind(CZ);
    if (_update) {
      CZ.update = (camZ, opts) => {
        opts = opts || {};
        if (opts.cosmic === 'system') opts = Object.assign({}, opts, { cosmic: 'galactic' });
        _update(camZ, opts);

        if (CZ.level === 'system') CZ.level = 'galactic';
        if (CZ.solarGroup) CZ.solarGroup.visible = false;
        const level = CZ.level;
        const zl = document.getElementById('zoom-label');
        if (zl && level === 'galactic' && !window.DrivingView?.active && !window.CityMap?.active) {
          zl.textContent = 'GALACTIC SKY';
        }
        const showExo = level === 'galactic' || level === 'galaxy';
        if (CZ._exoGroup) CZ._exoGroup.visible = showExo;
        document.body.classList.toggle('cosmic-galactic', level === 'galactic');
        document.body.classList.remove('cosmic-solar');

        this.syncGuide(level, camZ);

        if (level === 'earth' || level === 'orbit' || level === 'galactic') {
          window.CelestialNav?.tick?.();
        }
      };
    }

    const _guide = CZ.updateGuide?.bind(CZ);
    CZ.updateGuide = (level, camZ) => {
      if (level === 'system') level = 'galactic';
      if (_guide) _guide(level, camZ);
      this.syncGuide(level, camZ);
    };
  },

  patchZoomTiers() {
    const ZT = window.ZoomTiers;
    if (!ZT || ZT._galacticPatched) return;
    ZT._galacticPatched = true;
    const solar = ZT.TIERS?.find(t => t.id === 'solar');
    if (solar) {
      solar.id = 'galactic';
      solar.label = 'GALACTIC SKY';
      solar.cosmic = 'galactic';
    }
    const _apply = ZT._apply?.bind(ZT);
    if (_apply) {
      ZT._apply = (t) => {
        const tier = t || ZT.current();
        if (tier.id === 'solar') {
          tier.id = 'galactic';
          tier.label = 'GALACTIC SKY';
          tier.cosmic = 'galactic';
        }
        _apply(tier);
        const zl = document.getElementById('zoom-label');
        if (zl && tier.cosmic === 'galactic') zl.textContent = 'GALACTIC SKY';
      };
    }
  },

  patchGlobeNavigate() {
    const GN = window.GlobeNavigate;
    if (!GN || GN._galacticPatched) return;
    GN._galacticPatched = true;
    const _sync = GN._syncChip?.bind(GN);
    if (_sync) {
      GN._syncChip = function() {
        const chip = document.getElementById('map-nav-chip');
        if (chip) {
          const cosmic = window.CosmicZoom?.level || 'earth';
          if (cosmic === 'galaxy') chip.textContent = 'GALAXY Â· scroll in â†’ exoplanet hosts â†’ earth';
          else if (cosmic === 'galactic') chip.textContent = 'GALACTIC SKY Â· real exoplanet star positions';
          else if (cosmic === 'orbit') chip.textContent = 'ORBIT Â· constellations Â· scroll out â†’ galactic sky';
        }
        return _sync();
      };
    }
  },

  EXTRA_STARS: {
    Regulus: { ra: 10.13956, dec: 11.96721 }, Denebola: { ra: 11.81766, dec: 14.57206 },
    Algieba: { ra: 10.33299, dec: 19.84149 }, Castor: { ra: 7.57664, dec: 31.88832 },
    Pollux: { ra: 7.75526, dec: 28.02624, nav: true, label: 'Pollux' },
    Aldebaran: { ra: 4.59868, dec: 16.50931, nav: true, label: 'Aldebaran' },
    Elnath: { ra: 5.43825, dec: 28.60745 }, Vega: { ra: 18.61563, dec: 38.78369, nav: true, label: 'Vega' },
    Altair: { ra: 19.84636, dec: 8.86832, nav: true, label: 'Altair' }, Deneb: { ra: 20.69053, dec: 45.28034 },
    Markab: { ra: 23.07979, dec: 15.20531 }, Scheat: { ra: 23.06289, dec: 28.08284 },
    Shaula: { ra: 17.56012, dec: -37.10388 }, Graffias: { ra: 16.00563, dec: -19.80545 },
    Spica: { ra: 13.41988, dec: -11.16132, nav: true, label: 'Spica' },
    Arcturus: { ra: 14.26103, dec: 19.18241, nav: true, label: 'Arcturus' },
  },

  EXTRA_SETS: [
    { id: 'leo', name: 'Leo', short: 'Lion', nav: 'Sickle Â· spring sky', lines: [['Regulus','Algieba'],['Algieba','Denebola']] },
    { id: 'gem', name: 'Gemini', short: 'Twins', nav: 'Castor & Pollux', lines: [['Castor','Pollux'],['Pollux','Betelgeuse']] },
    { id: 'tau', name: 'Taurus', short: 'Bull', nav: 'Aldebaran Â· Hyades', lines: [['Aldebaran','Elnath'],['Aldebaran','Betelgeuse']] },
    { id: 'sco', name: 'Scorpius', short: 'Scorpion', nav: 'Antares Â· summer S', lines: [['Antares','Graffias'],['Antares','Shaula']] },
    { id: 'summer', name: 'Summer Triangle', short: 'â–³', nav: 'Vega Â· Altair Â· Deneb', lines: [['Vega','Altair'],['Altair','Deneb'],['Deneb','Vega']] },
    { id: 'peg', name: 'Pegasus', short: 'Square', nav: 'Autumn square', lines: [['Markab','Scheat'],['Scheat','Vega']] },
    { id: 'vir', name: 'Virgo', nav: 'Spica Â· spring E', lines: [['Spica','Arcturus'],['Arcturus','Regulus']] },
  ],

  injectCss() {
    if (document.getElementById('galactic-sky-css')) return;
    const st = document.createElement('style');
    st.id = 'galactic-sky-css';
    st.textContent = '#cosmic-guide{position:fixed;top:32px;left:10px;z-index:39;max-width:min(320px,78vw);font:11px/1.45 system-ui;color:var(--an-text,#e8f4ff);text-shadow:0 1px 8px rgba(0,0,0,.85);pointer-events:none;display:none;padding:6px 8px;border-radius:8px;background:rgba(0,6,18,.55);border:1px solid rgba(26,111,212,.28)}#cosmic-guide.visible{display:block}';
    document.head.appendChild(st);
  },

  patchCelestialNav() {
    const apply = () => {
      const CN = window.CelestialNav;
      if (!CN?.STARS || CN._galacticPatched) return;
      CN._galacticPatched = true;
      Object.assign(CN.STARS, this.EXTRA_STARS);
      this.EXTRA_SETS.forEach(set => {
        if (!CN.SETS.find(s => s.id === set.id)) CN.SETS.push(set);
      });
      CN.isGlobalNavView = function(camZ) {
        const z = camZ ?? window.camera?.position?.z ?? 2.55;
        const level = window.CosmicZoom?.level || 'earth';
        const sky = level === 'earth' || level === 'orbit' || level === 'galactic';
        return sky && z >= 2.0 && z < 8.5 && !window.CityMap?.active;
      };
      CN.renderGuideHtml = function(camZ) {
        const sky = this._lastSky || this.compute();
        if (!sky.sets.length) return '<div class="cg-title">Celestial nav</div><div class="cg-item"><i>No major constellations above horizon</i></div>';
        let html = '<div class="cg-title">Constellations Â· ' + sky.sets.length + ' visible</div>';
        sky.sets.slice(0, 5).forEach(s => { html += '<div class="cg-item"><b>' + (s.short || s.name) + '</b> â€” ' + s.nav + '</div>'; });
        sky.navStars.slice(0, 4).forEach(s => { html += '<div class="cg-item"><b>' + (s.label || s.name) + '</b> ' + s.bearing + ' Â· ' + s.alt.toFixed(0) + 'Â°</div>'; });
        return html;
      };
      if (CN._group) {
        CN._group.parent?.remove(CN._group);
        CN._group = null; CN._lines = []; CN._points = null; CN._pointMap = {};
      }
      CN.init?.();
    };
    window.LazyModules?.ensure?.().then(apply).catch(() => {});
    setTimeout(apply, 3000);
    setTimeout(apply, 8000);
  },

  startCelestialLoop() {
    if (this._celLoop) return;
    this._celLoop = setInterval(() => {
      const camZ = window.camera?.position?.z ?? 2.55;
      const level = window.CosmicZoom?.level || 'earth';
      if ((level === 'earth' || level === 'orbit' || level === 'galactic') && camZ >= 2 && camZ < 8.5) {
        if (!window.SlumberManager || window.SlumberManager.allows('celestial')) window.CelestialNav?.tick?.();
      }
    }, 900);
  },

  ensureCelestial() {
    this.patchCelestialNav();
    window.LazyModules?.ensure?.().then(() => {
      this.patchCelestialNav();
      if (window.SlumberManager?.wake) window.SlumberManager.wake('celestial');
    }).catch(() => {});
  },

  boot() {
    if (this._inited) return;
    this._inited = true;
    this.injectCss();
    this.patchCosmicZoom();
    this.patchZoomTiers();
    this.patchGlobeNavigate();
    this.ensureCelestial();
    this.startCelestialLoop();
    const tryExo = () => {
      if (window.CosmicZoom?.solarGroup && !window.CosmicZoom._exoGroup) {
        window.CosmicZoom.init?.();
        this.initExoHosts();
      }
    };
    tryExo();
    setTimeout(tryExo, 1200);
    setTimeout(tryExo, 4000);
  },
};

function galacticSkyBoot() { GalacticSky.boot(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', galacticSkyBoot);
else galacticSkyBoot();
window.GalacticSky = GalacticSky;