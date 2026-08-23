/**
 * SpaceNet Imagery — real planetary / sky textures, speed-first
 * ---------------------------------------------------------------------------
 * Commitment (SPECS): use real imagery as far as service speed allows.
 * - Mobile / lite: 1k maps, deferred, fewer simultaneous loads
 * - Desktop: 2k earth when idle, 1k–2k planets when orbit opens
 * - Never block first paint; solid color → low-res → HD upgrade
 *
 * window.SpaceNetImagery
 */
(function SpaceNetImageryBoot() {
  'use strict';

  // Public CORS-friendly catalogs (threex.planets + three-globe + three.js examples)
  const TX = {
    earthDay:
      'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg',
    earthNight:
      'https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg',
    earthFallback:
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg',
    earthTopo:
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg',
    moon:
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/moon_1024.jpg',
    // threex.planets — classic NASA-derived 1k maps
    sun: 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/sunmap.jpg',
    mercury: 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/mercurymap.jpg',
    venus: 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/venusmap.jpg',
    mars: 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/marsmap1k.jpg',
    jupiter: 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/jupitermap.jpg',
    saturn: 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/saturnmap.jpg',
    uranus: 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/uranusmap.jpg',
    neptune: 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/neptunemap.jpg',
    pluto: 'https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@master/images/plutomap1k.jpg',
    // Milky Way panorama (public domain style 2k — optional deep-sky)
    milkyWay:
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/cube/MilkyWay/dark-s_px.jpg',
  };

  // Fallback solid colors if texture fails
  const COLORS = {
    sun: 0xffcc33,
    mercury: 0x9a9a9a,
    venus: 0xd4b896,
    earth: 0x3d8fd4,
    moon: 0xc8c8c8,
    mars: 0xc45a32,
    jupiter: 0xc4a878,
    saturn: 0xd4c898,
    uranus: 0x7ec8c0,
    neptune: 0x3d5fd4,
    pluto: 0xb8a898,
    io: 0xe8c84a,
    europa: 0xc8d8e8,
    ganymede: 0x9a8a6a,
    callisto: 0x7a6a5a,
    titan: 0xc88844,
    enceladus: 0xe8f0f8,
  };

  const SpaceNetImagery = {
    VERSION: 1,
    TX,
    _cache: new Map(),
    _loader: null,
    _ready: false,
    _planetsPainted: false,
    _mwMesh: null,
    _queue: [],
    _inflight: 0,
    MAX_PARALLEL: 2,

    mobile() {
      return (
        !!window._globePerfLite ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && window.innerWidth < 960)
      );
    },

    allowHd() {
      if (this.mobile()) return false;
      try {
        if (window.SlumberManager?.allows && !SlumberManager.allows('earth_hd')) return false;
      } catch (_) {}
      return true;
    },

    init() {
      if (this._ready) return;
      this._ready = true;
      if (!window.THREE) return;
      this._loader = new THREE.TextureLoader();
      try {
        this._loader.crossOrigin = 'anonymous';
      } catch (_) {}

      // Earth real imagery ASAP (after first frames)
      setTimeout(() => this.ensureEarth(), 120);
      setTimeout(() => this.ensureEarth(true), 1800);

      // Planets when user may open orbit — idle delay
      const planetDelay = this.mobile() ? 9000 : 4500;
      setTimeout(() => this.paintAllPlanets(), planetDelay);

      // Deep sky when galactic / idle
      setTimeout(() => this.ensureStarField(), this.mobile() ? 12000 : 7000);

      // Re-paint when cosmos expands Sol
      const prev = window.SpaceNetCosmos?._ensureCosmicBodies?.bind(window.SpaceNetCosmos);
      if (window.SpaceNetCosmos && prev && !window.SpaceNetCosmos._imgHooked) {
        window.SpaceNetCosmos._imgHooked = true;
        window.SpaceNetCosmos._ensureCosmicBodies = function () {
          prev();
          setTimeout(() => SpaceNetImagery.paintAllPlanets(), 200);
        };
      }
    },

    _loadTex(url, opts) {
      opts = opts || {};
      if (!url || !this._loader) return Promise.reject(new Error('no loader'));
      if (this._cache.has(url)) return Promise.resolve(this._cache.get(url));
      return new Promise((resolve, reject) => {
        const run = () => {
          this._inflight++;
          this._loader.load(
            url,
            (tex) => {
              this._inflight--;
              try {
                tex.encoding = THREE.sRGBEncoding || tex.encoding;
              } catch (_) {}
              // Cap anisotropy / mip for speed
              if (tex.minFilter != null) tex.minFilter = THREE.LinearMipmapLinearFilter;
              if (this.mobile()) {
                try {
                  tex.generateMipmaps = true;
                } catch (_) {}
              }
              this._cache.set(url, tex);
              resolve(tex);
              this._drain();
            },
            undefined,
            (err) => {
              this._inflight--;
              this._drain();
              reject(err || new Error('tex fail'));
            },
          );
        };
        this._queue.push(run);
        this._drain();
      });
    },

    _drain() {
      while (this._inflight < this.MAX_PARALLEL && this._queue.length) {
        const fn = this._queue.shift();
        try {
          fn();
        } catch (_) {}
      }
    },

    async ensureEarth(preferHd) {
      const e = window.earth;
      if (!e || !window.THREE) return;
      // Prefer EarthRealism day/night shader when available
      try {
        if (window.EarthRealism && !EarthRealism._inited) {
          // Force HD path when we allow it
          if (preferHd && this.allowHd() && window.SlumberManager?.quality) {
            try {
              SlumberManager.quality.earthHd = true;
            } catch (_) {}
          }
          EarthRealism.init?.();
        }
      } catch (_) {}

      const mat = e.material;
      if (mat && mat.map && mat.map.image) return; // already textured basic
      if (mat && mat.uniforms && mat.uniforms.dayTexture) return; // shader ready

      const urls = preferHd && this.allowHd()
        ? [TX.earthDay, TX.earthFallback, TX.earthTopo]
        : [TX.earthFallback, TX.earthDay];

      for (const url of urls) {
        try {
          const tex = await this._loadTex(url);
          if (e.material && e.material.isShaderMaterial) return;
          if (!e.material || e.material.isMeshBasicMaterial) {
            e.material = new THREE.MeshBasicMaterial({ map: tex });
          } else {
            e.material.map = tex;
            e.material.needsUpdate = true;
          }
          window.EARTH_TEX = window.EARTH_TEX || {};
          window.EARTH_TEX.day = url;
          return;
        } catch (_) {}
      }
    },

    bodyKey(name) {
      const n = String(name || '').toLowerCase();
      if (/mercury/.test(n)) return 'mercury';
      if (/venus/.test(n)) return 'venus';
      if (/earth/.test(n)) return 'earth';
      if (/moon|luna/.test(n)) return 'moon';
      if (/mars/.test(n)) return 'mars';
      if (/jupiter/.test(n)) return 'jupiter';
      if (/saturn/.test(n)) return 'saturn';
      if (/uranus/.test(n)) return 'uranus';
      if (/neptune/.test(n)) return 'neptune';
      if (/pluto/.test(n)) return 'pluto';
      if (/sun|sol\b/.test(n)) return 'sun';
      if (/^io$|\bio\b/.test(n)) return 'io';
      if (/europa/.test(n)) return 'europa';
      if (/ganymede/.test(n)) return 'ganymede';
      if (/callisto/.test(n)) return 'callisto';
      if (/titan/.test(n)) return 'titan';
      if (/enceladus/.test(n)) return 'enceladus';
      return null;
    },

    urlForBody(key) {
      if (!key) return null;
      if (TX[key]) return TX[key];
      // moons without dedicated maps: soft color only
      return null;
    },

    async paintMesh(mesh, bodyName) {
      if (!mesh || !window.THREE) return false;
      const key = this.bodyKey(bodyName || mesh.userData?.name || mesh.userData?.body);
      if (!key) return false;
      if (mesh.userData._snImg === key && mesh.material?.map) return true;

      const url = this.urlForBody(key);
      if (!url) {
        const col = COLORS[key];
        if (col != null) {
          mesh.material = new THREE.MeshBasicMaterial({ color: col });
          mesh.userData._snImg = key + '-color';
        }
        return false;
      }
      try {
        const tex = await this._loadTex(url);
        mesh.material = new THREE.MeshBasicMaterial({ map: tex });
        mesh.userData._snImg = key;
        mesh.userData.desc = (mesh.userData.desc || '') + ' · real map';
        return true;
      } catch (_) {
        const col = COLORS[key] || 0x888888;
        mesh.material = new THREE.MeshBasicMaterial({ color: col });
        return false;
      }
    },

    async paintAllPlanets() {
      if (!window.THREE) return;
      const CZ = window.CosmicZoom;
      // Sun in solar group
      if (CZ?.solarGroup) {
        CZ.solarGroup.children.forEach((ch) => {
          if (ch.isMesh && ch.userData?.name === 'Sun') void this.paintMesh(ch, 'sun');
        });
      }
      (CZ?.planets || []).forEach((m) => {
        void this.paintMesh(m, m.userData?.name || m.userData?.body);
      });
      // Mars place group parent planet already painted
      this._planetsPainted = true;
    },

    async ensureStarField() {
      if (!window.THREE || !window.scene) return;
      if (this._mwMesh) return;
      // Lightweight: denser star points (not full HDRI — keeps FPS)
      if (this.mobile() && window._globePerfLite) return;

      const n = this.mobile() ? 200 : 600;
      const pos = [];
      for (let i = 0; i < n; i++) {
        const r = 80 + Math.random() * 400;
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        pos.push(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0xc8d8ff,
          size: this.mobile() ? 1.6 : 2.2,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      pts.name = 'SpaceNetDeepStars';
      pts.frustumCulled = false;
      scene.add(pts);
      this._mwMesh = pts;

      // Soft milky-way band (canvas gradient sphere) — no huge texture download on mobile
      if (!this.mobile()) {
        try {
          const c = document.createElement('canvas');
          c.width = 512;
          c.height = 256;
          const ctx = c.getContext('2d');
          const g = ctx.createLinearGradient(0, 0, 0, 256);
          g.addColorStop(0, '#02040a');
          g.addColorStop(0.42, '#0a1020');
          g.addColorStop(0.5, '#1a2848');
          g.addColorStop(0.58, '#0a1020');
          g.addColorStop(1, '#02040a');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 512, 256);
          // star dust noise
          for (let i = 0; i < 800; i++) {
            ctx.fillStyle = 'rgba(200,220,255,' + (0.15 + Math.random() * 0.5) + ')';
            ctx.fillRect(Math.random() * 512, Math.random() * 256, 1, 1);
          }
          const tex = new THREE.CanvasTexture(c);
          const shell = new THREE.Mesh(
            new THREE.SphereGeometry(90, 24, 16),
            new THREE.MeshBasicMaterial({
              map: tex,
              side: THREE.BackSide,
              transparent: true,
              opacity: 0.55,
              depthWrite: false,
            }),
          );
          shell.name = 'SpaceNetMilkyBand';
          scene.add(shell);
          this._mwBand = shell;
        } catch (_) {}
      }
    },

    /** Call when zoom enters orbit/galactic to prioritize planet maps */
    onCosmicLevel(level) {
      if (level === 'orbit' || level === 'galactic' || level === 'galaxy') {
        void this.paintAllPlanets();
        void this.ensureStarField();
      }
      if (level === 'earth') void this.ensureEarth(this.allowHd());
    },
  };

  window.SpaceNetImagery = SpaceNetImagery;
  window.SPACENET_PLANET_TEX = TX;

  // Hook CosmicZoom.update so imagery follows tier
  function hookCosmic() {
    const CZ = window.CosmicZoom;
    if (!CZ || CZ._imgLevelHook) return;
    CZ._imgLevelHook = true;
    const orig = CZ.update?.bind(CZ);
    if (orig) {
      CZ.update = function (z, opts) {
        const r = orig(z, opts);
        try {
          SpaceNetImagery.onCosmicLevel(opts?.cosmic || this.level);
        } catch (_) {}
        return r;
      };
    }
  }

  function boot() {
    try {
      SpaceNetImagery.init();
      hookCosmic();
    } catch (e) {
      console.error('[SpaceNetImagery]', e);
    }
  }
  if (document.readyState === 'complete') setTimeout(boot, 200);
  else window.addEventListener('load', () => setTimeout(boot, 200));
  setTimeout(boot, 1500);
})();
