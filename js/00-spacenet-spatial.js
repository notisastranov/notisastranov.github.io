/**
 * SpaceNet Spatial OS — real virtual space as the user interface
 * ---------------------------------------------------------------------------
 * LAW (hardcoded product contract — also in SPECS.md + continuity):
 *   Digital objects live at real coordinates on real bodies
 *   (Earth garage, Mars Cydonia, Moon, ISS belt…).
 *   Zoom there → the object is visible. That is the internet in all dimensions.
 *
 * Kinds: file · folder · shop · delivery · call · note · media
 * Bodies: earth · mars · moon · solar
 */
(function SpaceNetSpatialBoot() {
  'use strict';

  const KEY = 'astranov:spacenet-places-v1';
  const BUILD = (document.querySelector('meta[name="astranov-build"]') || {}).content || '';

  /** Canonical place seeds — always present (demo of the SpaceNet law) */
  const SEEDS = [
    {
      id: 'seed-thesis-garage',
      body: 'earth',
      lat: 36.44125,
      lng: 28.22255,
      kind: 'file',
      emoji: '📄',
      name: 'Thesis.pdf',
      title: 'Thesis on the garage',
      description: 'Left on the garage roof · zoom to street · open',
      payload: {
        mime: 'text/plain',
        text:
          'ASTRANOV SPACENET — SAMPLE THESIS\n\n' +
          'This file lives on a real place: a garage in Rhodes (36.441°N, 28.223°E).\n' +
          'If someone zooms the SpaceNet globe to that garage, they see this file.\n' +
          'That is the product: real virtual space as UI — not folders on a desktop.\n',
      },
      visibilityKm: 2.5,
      minZ: 1.45,
      seed: true,
    },
    {
      id: 'seed-cydonia-music',
      body: 'mars',
      lat: 40.75,
      lng: -9.46,
      kind: 'folder',
      emoji: '🎵',
      name: 'Cydonia Music',
      title: 'Music folder · Mars Cydonia',
      description: 'Hidden on Cydonia Mensae · fly to Mars · open folder',
      payload: {
        children: [
          { name: 'Face_of_Mars.mp3', kind: 'file', emoji: '🎧', note: 'Ambient · Cydonia night' },
          { name: 'Red_Dust_Session.wav', kind: 'file', emoji: '🎧', note: 'Field recording' },
          { name: 'Playlist.md', kind: 'file', emoji: '📝', note: 'Tracks for the valley' },
        ],
      },
      visibilityKm: 500,
      minZ: 4.5,
      seed: true,
    },
    {
      id: 'seed-spacenet-market-hub',
      body: 'earth',
      lat: 36.4345,
      lng: 28.2175,
      kind: 'shop',
      emoji: '🏬',
      name: 'SpaceNet Market Hub',
      title: 'Live delivery marketplace',
      description: 'Real-time shops · drivers · orders · zoom city',
      payload: { action: 'marketplace' },
      visibilityKm: 12,
      minZ: 1.7,
      seed: true,
    },
    {
      id: 'seed-videocall-agora',
      body: 'earth',
      lat: 37.9838,
      lng: 23.7275,
      kind: 'call',
      emoji: '📹',
      name: 'Athens video agora',
      title: 'Video call pin · Athens',
      description: 'Real-time presence · tap to open video peers',
      payload: { action: 'video' },
      visibilityKm: 40,
      minZ: 1.9,
      seed: true,
    },
  ];

  const KIND_META = {
    file: { color: 0x66ccff, icon: '📄', label: 'File' },
    folder: { color: 0xffcc44, icon: '📁', label: 'Folder' },
    shop: { color: 0x3d9eff, icon: '🏬', label: 'Shop' },
    delivery: { color: 0x44ff99, icon: '🛵', label: 'Delivery' },
    call: { color: 0xff6688, icon: '📹', label: 'Call' },
    note: { color: 0xaaddff, icon: '📌', label: 'Note' },
    media: { color: 0xcc88ff, icon: '🎬', label: 'Media' },
  };

  const SpaceNetSpatial = {
    VERSION: 1,
    LAW:
      'Digital objects live at real coordinates on real bodies. Zoom there → see them. ' +
      'SpaceNet is the internet free in all dimensions: files, folders, shops, delivery, video — in real space.',
    places: [],
    _marsGroup: null,
    _marsMarkers: new Map(),
    _tickIv: null,
    _openId: null,
    _ready: false,

    init() {
      if (this._ready) return;
      this._ready = true;
      this._load();
      this._ensureSeeds();
      this._injectCss();
      this._injectPanel();
      this.sync();
      if (this._tickIv) clearInterval(this._tickIv);
      this._tickIv = setInterval(() => this.sync(), 2200);
      window.addEventListener('astranov:city-open', () => this.sync());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.sync();
      });
      try {
        window.SpaceNetShell?.setStatus?.('SpaceNet spatial · files live on Earth & Mars');
      } catch (_) {}
    },

    _load() {
      try {
        const raw = localStorage.getItem(KEY);
        const arr = raw ? JSON.parse(raw) : [];
        this.places = Array.isArray(arr) ? arr.filter((p) => p && p.id && p.lat != null) : [];
      } catch (_) {
        this.places = [];
      }
    },

    _save() {
      try {
        const user = this.places.filter((p) => !p.seed);
        localStorage.setItem(KEY, JSON.stringify(user.slice(0, 400)));
      } catch (_) {}
    },

    _ensureSeeds() {
      const ids = new Set(this.places.map((p) => p.id));
      SEEDS.forEach((s) => {
        if (!ids.has(s.id)) this.places.push({ ...s, createdAt: Date.now() });
      });
      // refresh seed metadata if owner updated seeds
      this.places = this.places.map((p) => {
        if (!p.seed) return p;
        const s = SEEDS.find((x) => x.id === p.id);
        return s ? { ...s, createdAt: p.createdAt || Date.now() } : p;
      });
    },

    haversineKm(aLat, aLng, bLat, bLng) {
      const R = 6371;
      const dLat = ((bLat - aLat) * Math.PI) / 180;
      const dLng = ((bLng - aLng) * Math.PI) / 180;
      const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    },

    facing() {
      const p =
        window._lastPos ||
        window.TrackballGuard?.facingLatLng?.() ||
        window.CityMap?.globeCenterLatLng?.() ||
        window.Commerce?.userLatLng?.() ||
        { lat: 36.44, lng: 28.22 };
      return { lat: Number(p.lat), lng: Number(p.lng), body: this.activeBody() };
    },

    activeBody() {
      const tier = window.ZoomTiers?.current?.();
      const cosmic = tier?.cosmic || window.CosmicZoom?.level || 'earth';
      if (cosmic === 'galaxy' || cosmic === 'galactic') return 'solar';
      if (cosmic === 'orbit' || cosmic === 'system') {
        // if focused on Mars via spatial flight
        if (this._focusBody === 'mars') return 'mars';
        return 'solar';
      }
      if (this._focusBody === 'mars') return 'mars';
      return 'earth';
    },

    camZ() {
      return window.camera?.position?.z || 3.5;
    },

    put(place) {
      if (!place || place.lat == null || place.lng == null) return null;
      const id = place.id || 'sn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
      const row = {
        id,
        body: place.body || 'earth',
        lat: Number(place.lat),
        lng: Number(place.lng),
        kind: place.kind || 'file',
        emoji: place.emoji || KIND_META[place.kind || 'file']?.icon || '📌',
        name: String(place.name || 'Untitled').slice(0, 80),
        title: String(place.title || place.name || 'Place').slice(0, 100),
        description: String(place.description || '').slice(0, 200),
        payload: place.payload || {},
        visibilityKm: place.visibilityKm != null ? place.visibilityKm : place.kind === 'folder' ? 5 : 1.5,
        minZ: place.minZ != null ? place.minZ : 1.5,
        owner: place.owner || window.Auth?.user?.id || 'local',
        createdAt: place.createdAt || Date.now(),
        seed: !!place.seed,
      };
      const i = this.places.findIndex((p) => p.id === id);
      if (i >= 0) this.places[i] = row;
      else this.places.unshift(row);
      this._save();
      this.sync();
      return row;
    },

    remove(id) {
      this.places = this.places.filter((p) => p.id !== id || p.seed);
      this._save();
      this.sync();
    },

    get(id) {
      return this.places.find((p) => p.id === id) || null;
    },

    listNear(lat, lng, opts) {
      opts = opts || {};
      const body = opts.body || 'earth';
      const radius = opts.radiusKm != null ? opts.radiusKm : 50;
      return this.places
        .filter((p) => (p.body || 'earth') === body)
        .map((p) => ({ ...p, d: this.haversineKm(lat, lng, p.lat, p.lng) }))
        .filter((p) => p.d <= Math.max(radius, p.visibilityKm || 1))
        .sort((a, b) => a.d - b.d);
    },

    visibleNow() {
      const face = this.facing();
      const z = this.camZ();
      const body = face.body;
      return this.places.filter((p) => {
        const pb = p.body || 'earth';
        if (pb === 'mars') {
          // Mars places visible when focused on Mars or in solar/orbit tiers
          if (body !== 'mars' && body !== 'solar') return false;
          if (z < (p.minZ || 4)) return false;
          return true;
        }
        if (pb !== 'earth') return body === pb;
        if (z > (p.minZ || 1.5) + 0.8) return false; // too zoomed out
        const d = this.haversineKm(face.lat, face.lng, p.lat, p.lng);
        // far zoom: only large visibility items
        const vis = p.visibilityKm || 1.5;
        const allow = z > 2.5 ? vis >= 20 || d < 80 : d <= Math.max(vis, z < 1.3 ? vis * 2 : vis);
        return allow;
      });
    },

    sync() {
      this._syncEarthGlobe();
      this._syncMarsMarkers();
      this._refreshPanelList();
    },

    _syncEarthGlobe() {
      const GE = window.GlobeEntity;
      if (!GE?.register) return;
      try {
        GE.unregisterType?.('sn_place');
      } catch (_) {}
      const face = this.facing();
      const z = this.camZ();
      const earthPlaces = this.places.filter((p) => (p.body || 'earth') === 'earth');
      earthPlaces.forEach((p, i) => {
        const d = this.haversineKm(face.lat, face.lng, p.lat, p.lng);
        const vis = p.visibilityKm || 1.5;
        // Show on globe when near enough OR always for large hubs
        const show = z < 2.8 || d < Math.max(vis * 3, 30) || vis >= 15;
        if (!show) return;
        const meta = KIND_META[p.kind] || KIND_META.note;
        GE.register({
          id: 'sn-place-' + p.id,
          type: 'sn_place',
          lat: p.lat,
          lng: p.lng,
          title: (p.emoji || meta.icon) + ' ' + (p.title || p.name),
          description: p.description || p.kind + ' · SpaceNet place · tap to open',
          urgency: p.kind === 'file' || p.kind === 'folder' ? 3 : 2,
          color: meta.color,
          radius: p.kind === 'folder' ? 0.02 : 0.016,
          data: { place: p, alwaysShowLabel: d < 3 || z < 1.4 },
          _actionLabel: 'Open ' + (p.name || 'place'),
          onTap: () => this.open(p.id),
        });
      });
    },

    _ensureMarsGroup() {
      if (this._marsGroup && this._marsGroup.parent) return this._marsGroup;
      const THREE = window.THREE;
      const scene = window.scene;
      if (!THREE || !scene) return null;
      // Attach to CosmicZoom Mars mesh if present
      let marsMesh = null;
      const planets = window.CosmicZoom?.planets || [];
      for (const m of planets) {
        if (m?.userData?.name === 'Mars') {
          marsMesh = m;
          break;
        }
      }
      const g = new THREE.Group();
      g.name = 'SpaceNetMarsPlaces';
      if (marsMesh) {
        marsMesh.add(g);
        // surface radius slightly above planet r
        g.userData.surfaceR = (marsMesh.geometry?.parameters?.radius || 0.05) * 1.08;
      } else {
        scene.add(g);
        g.userData.surfaceR = 0.06;
        g.position.set(1.5, 0, 0);
      }
      this._marsGroup = g;
      return g;
    },

    _syncMarsMarkers() {
      const THREE = window.THREE;
      if (!THREE) return;
      const g = this._ensureMarsGroup();
      if (!g) return;
      const r = g.userData.surfaceR || 0.06;
      const keep = new Set();
      this.places
        .filter((p) => p.body === 'mars')
        .forEach((p) => {
          keep.add(p.id);
          let m = this._marsMarkers.get(p.id);
          if (!m) {
            const meta = KIND_META[p.kind] || KIND_META.folder;
            m = new THREE.Mesh(
              new THREE.SphereGeometry(r * 0.12, 8, 8),
              new THREE.MeshBasicMaterial({ color: meta.color }),
            );
            m.userData = { placeId: p.id, type: 'sn_mars_place' };
            g.add(m);
            this._marsMarkers.set(p.id, m);
          }
          // Mars lat/lng → local sphere (same convention as Earth)
          const lat = (p.lat * Math.PI) / 180;
          const lng = (p.lng * Math.PI) / 180;
          m.position.set(r * Math.cos(lat) * Math.cos(lng), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lng));
        });
      for (const [id, m] of this._marsMarkers) {
        if (!keep.has(id)) {
          g.remove(m);
          this._marsMarkers.delete(id);
        }
      }
    },

    async flyTo(ref) {
      let p = typeof ref === 'string' ? this.get(ref) : ref;
      if (!p && typeof ref === 'string') {
        const q = ref.toLowerCase();
        p = this.places.find(
          (x) =>
            x.id === ref ||
            (x.name && x.name.toLowerCase().includes(q)) ||
            (x.title && x.title.toLowerCase().includes(q)),
        );
      }
      if (!p) {
        this._toast('Place not found');
        return false;
      }
      this._focusBody = p.body || 'earth';
      if (p.body === 'mars') {
        // Solar / orbit tier → face Mars region of solar group
        try {
          window.ZoomTiers?.goTo?.('orbit', true);
          window.CosmicZoom?.update?.(window.camera?.position?.z, { cosmic: 'orbit', label: 'MARS' });
        } catch (_) {}
        // Nudge camera toward solar system view
        if (window.camera) {
          window._globeFly = null;
          const targetZ = 5.2;
          if (typeof window.flyToPoint === 'function' && window.CosmicZoom?.planets) {
            const mars = window.CosmicZoom.planets.find((m) => m.userData?.name === 'Mars');
            if (mars) {
              const wp = new THREE.Vector3();
              mars.getWorldPosition(wp);
              window.flyToPoint(wp.clone().multiplyScalar(1.15), targetZ, { dur: 2800 });
            }
          } else if (window.camera) {
            window.camera.position.z = targetZ;
          }
        }
        this._toast('Mars Cydonia · ' + (p.name || 'place'));
        this.sync();
        setTimeout(() => this.open(p.id), 900);
        return true;
      }
      // Earth
      window._lastPos = { lat: p.lat, lng: p.lng };
      try {
        if (window.GlobeNavigate?._enterCitySlow) {
          await GlobeNavigate._enterCitySlow(p.lat, p.lng, { openShops: false, spaceNetPlace: true });
        } else if (typeof window.flyToPoint === 'function' && typeof window.latLngToPos === 'function') {
          const pos = latLngToPos(p.lat, p.lng, 1.04);
          flyToPoint(new THREE.Vector3(pos.x, pos.y, pos.z), p.minZ || 1.2, { dur: 2400 });
        }
      } catch (_) {}
      this.sync();
      setTimeout(() => this.open(p.id), 600);
      return true;
    },

    open(id) {
      const p = this.get(id);
      if (!p) return;
      this._openId = id;
      const panel = document.getElementById('spacenet-place-panel');
      if (!panel) return this._openFallback(p);
      panel.classList.add('open');
      panel.hidden = false;
      const meta = KIND_META[p.kind] || KIND_META.note;
      const title = document.getElementById('snp-title');
      const sub = document.getElementById('snp-sub');
      const body = document.getElementById('snp-body');
      const actions = document.getElementById('snp-actions');
      if (title) title.textContent = (p.emoji || meta.icon) + ' ' + (p.title || p.name);
      if (sub) {
        sub.textContent =
          (p.body || 'earth').toUpperCase() +
          ' · ' +
          p.lat.toFixed(4) +
          '°, ' +
          p.lng.toFixed(4) +
          '° · ' +
          (p.kind || 'place');
      }
      if (body) {
        if (p.kind === 'folder' && p.payload?.children?.length) {
          body.innerHTML = p.payload.children
            .map(
              (c) =>
                '<div class="snp-row"><span>' +
                (c.emoji || '📄') +
                ' <b>' +
                this._esc(c.name) +
                '</b></span><small>' +
                this._esc(c.note || c.kind || '') +
                '</small></div>',
            )
            .join('');
        } else if (p.payload?.text) {
          body.innerHTML = '<pre class="snp-pre">' + this._esc(p.payload.text) + '</pre>';
        } else if (p.payload?.url) {
          body.innerHTML =
            '<p class="snp-note">Linked resource</p><a class="snp-link" href="' +
            this._esc(p.payload.url) +
            '" target="_blank" rel="noopener">' +
            this._esc(p.payload.url) +
            '</a>';
        } else {
          body.innerHTML =
            '<p class="snp-note">' +
            this._esc(p.description || 'SpaceNet place — real coordinates as UI.') +
            '</p>';
        }
      }
      if (actions) {
        actions.innerHTML = '';
        const addBtn = (label, fn) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.onclick = (e) => {
            e.stopPropagation();
            fn();
          };
          actions.appendChild(b);
        };
        addBtn('Fly here', () => void this.flyTo(p.id));
        if (p.payload?.action === 'marketplace') {
          addBtn('Open marketplace', () => {
            this.closePanel();
            void window.SpaceNetShell?.run?.('order');
          });
        }
        if (p.payload?.action === 'video' || p.kind === 'call') {
          addBtn('Video peers', () => {
            this.closePanel();
            void window.SpaceNetShell?.run?.('video');
            document.getElementById('aci-video-call')?.click();
          });
        }
        if (p.kind === 'shop') {
          addBtn('Browse shops', () => {
            this.closePanel();
            void window.SpaceNetShell?.run?.('shops');
          });
        }
        if (!p.seed) {
          addBtn('Remove', () => {
            this.remove(p.id);
            this.closePanel();
          });
        }
        addBtn('Close', () => this.closePanel());
      }
      try {
        window.AciCli?.print?.('spatial · open ' + (p.name || p.id) + ' @ ' + (p.body || 'earth'), 'ok');
        window.ACIControl?.reply?.('Opened ' + (p.title || p.name) + ' — lives at these coordinates');
        window.SpaceNetShell?.setStatus?.((p.emoji || '') + ' ' + (p.name || 'place') + ' · spatial');
      } catch (_) {}
    },

    _openFallback(p) {
      const text = p.payload?.text || p.description || p.name;
      window.ACIControl?.reply?.(String(text).slice(0, 200));
      window.GlobeDeck?.setPreview?.((p.emoji || '📌') + ' ' + (p.title || p.name));
    },

    closePanel() {
      this._openId = null;
      document.getElementById('spacenet-place-panel')?.classList.remove('open');
      const panel = document.getElementById('spacenet-place-panel');
      if (panel) panel.hidden = true;
    },

    /**
     * Drop a digital object at the currently faced coordinates (or explicit lat/lng).
     */
    dropHere(opts) {
      opts = opts || {};
      const face = this.facing();
      const lat = opts.lat != null ? Number(opts.lat) : face.lat;
      const lng = opts.lng != null ? Number(opts.lng) : face.lng;
      const body = opts.body || (face.body === 'mars' ? 'mars' : 'earth');
      const kind = opts.kind || 'file';
      const name = String(opts.name || 'Dropped ' + kind).slice(0, 80);
      const row = this.put({
        body,
        lat,
        lng,
        kind,
        name,
        title: name,
        description: opts.description || 'Placed on SpaceNet · zoom here to see it',
        emoji: opts.emoji || KIND_META[kind]?.icon,
        payload: opts.payload || { text: opts.text || name },
        visibilityKm: opts.visibilityKm != null ? opts.visibilityKm : 2,
        minZ: opts.minZ != null ? opts.minZ : body === 'mars' ? 4.8 : 1.25,
      });
      MapDepict?.pulse?.(lat, lng, 0x66ccff, name, 12000);
      this._toast('Placed ' + name + ' @ ' + lat.toFixed(3) + ',' + lng.toFixed(3));
      return row;
    },

    dropPrompt() {
      const name = window.prompt('Name this SpaceNet object (file / folder / note):', 'My file');
      if (!name) return null;
      const kindPick = window.prompt('Kind: file | folder | note | media', 'file') || 'file';
      const kind = /folder|dir/i.test(kindPick) ? 'folder' : /media|video|photo/i.test(kindPick) ? 'media' : /note/i.test(kindPick) ? 'note' : 'file';
      const text = window.prompt('Content / description (optional):', '') || '';
      return this.dropHere({
        name,
        kind,
        payload:
          kind === 'folder'
            ? { children: [{ name: 'readme.txt', kind: 'file', emoji: '📄', note: text || 'Empty folder' }] }
            : { text: text || name + '\n\nPlaced via SpaceNet spatial UI.' },
      });
    },

    /** Natural language spatial commands */
    handleTalk(line) {
      const t = String(line || '').trim();
      if (!t) return { handled: false };
      const low = t.toLowerCase();

      // Fly to Mars Cydonia / music
      if (/cydonia|mars.*music|music.*mars|go\s*to\s*mars|fly\s*mars/i.test(low)) {
        void this.flyTo('seed-cydonia-music');
        return { handled: true, action: 'fly-cydonia' };
      }
      // Thesis / garage
      if (/thesis|garage|garaz/i.test(low) && /(open|go|zoom|find|show|where)/i.test(low)) {
        void this.flyTo('seed-thesis-garage');
        return { handled: true, action: 'fly-thesis' };
      }
      if (/^thesis\b|^garage\b/i.test(low)) {
        void this.flyTo('seed-thesis-garage');
        return { handled: true, action: 'fly-thesis' };
      }

      // Put / hide / leave <thing> on <place>
      const putM = t.match(
        /^(?:put|hide|leave|drop|place)\s+(.+?)\s+(?:on|at|in)\s+(.+)$/i,
      );
      if (putM) {
        const thing = putM[1].trim();
        const where = putM[2].trim().toLowerCase();
        let body = 'earth';
        let lat;
        let lng;
        let title = thing;
        if (/cydonia|mars/i.test(where)) {
          body = 'mars';
          lat = 40.75;
          lng = -9.46;
          title = thing + ' · Cydonia';
        } else if (/garage/i.test(where)) {
          lat = 36.44125;
          lng = 28.22255;
          title = thing + ' · garage';
        } else if (/here|this\s*spot|my\s*location/i.test(where)) {
          const f = this.facing();
          lat = f.lat;
          lng = f.lng;
          body = f.body === 'mars' ? 'mars' : 'earth';
        } else {
          const f = this.facing();
          lat = f.lat;
          lng = f.lng;
        }
        const kind = /folder|playlist|album/i.test(thing) ? 'folder' : /video|photo|pic/i.test(thing) ? 'media' : 'file';
        const placed = this.put({
          body,
          lat,
          lng,
          kind,
          name: thing.slice(0, 60),
          title,
          description: 'Placed by talk · zoom to see',
          payload:
            kind === 'folder'
              ? { children: [{ name: thing, kind: 'file', emoji: '📄' }] }
              : { text: thing + '\n\nPlaced on SpaceNet at ' + body + ' ' + lat.toFixed(4) + ',' + lng.toFixed(4) },
          visibilityKm: body === 'mars' ? 400 : 2,
          minZ: body === 'mars' ? 4.8 : 1.25,
        });
        if (placed) void this.flyTo(placed.id);
        this._toast('Placed “' + thing + '” on ' + where);
        return { handled: true, action: 'put' };
      }

      // Go to / zoom / open place
      const goM = t.match(/^(?:go\s*to|zoom(?:\s*to)?|open|show|find)\s+(.+)$/i);
      if (goM) {
        const q = goM[1].trim();
        if (/cydonia|mars/i.test(q)) {
          void this.flyTo('seed-cydonia-music');
          return { handled: true, action: 'go' };
        }
        const hit = this.places.find(
          (p) =>
            (p.name && p.name.toLowerCase().includes(q.toLowerCase())) ||
            (p.title && p.title.toLowerCase().includes(q.toLowerCase())),
        );
        if (hit) {
          void this.flyTo(hit.id);
          return { handled: true, action: 'go' };
        }
      }

      if (/^(places?|vault|spatial|where\s*is\s*my)\b/i.test(low) || low === 'spacenet') {
        this.showVault();
        return { handled: true, action: 'vault' };
      }

      if (/^drop\b|^place\s+here\b|^leave\s+here\b/i.test(low)) {
        this.dropPrompt();
        return { handled: true, action: 'drop' };
      }

      return { handled: false };
    },

    showVault() {
      this.sync();
      const panel = document.getElementById('spacenet-place-panel');
      if (!panel) return;
      panel.classList.add('open');
      panel.hidden = false;
      const title = document.getElementById('snp-title');
      const sub = document.getElementById('snp-sub');
      const body = document.getElementById('snp-body');
      const actions = document.getElementById('snp-actions');
      if (title) title.textContent = '◎ SpaceNet vault — places in real space';
      if (sub) sub.textContent = this.places.length + ' objects · Earth + Mars · zoom to reveal';
      if (body) {
        body.innerHTML = this.places
          .slice(0, 40)
          .map(
            (p) =>
              '<button type="button" class="snp-row snp-btn" data-pid="' +
              this._esc(p.id) +
              '"><span>' +
              (p.emoji || '📌') +
              ' <b>' +
              this._esc(p.title || p.name) +
              '</b></span><small>' +
              this._esc((p.body || 'earth') + ' · ' + p.lat.toFixed(2) + ',' + p.lng.toFixed(2)) +
              '</small></button>',
          )
          .join('');
        body.querySelectorAll('[data-pid]').forEach((btn) => {
          btn.onclick = () => void this.flyTo(btn.dataset.pid);
        });
      }
      if (actions) {
        actions.innerHTML = '';
        const b1 = document.createElement('button');
        b1.type = 'button';
        b1.textContent = 'Drop here';
        b1.onclick = () => this.dropPrompt();
        const b2 = document.createElement('button');
        b2.type = 'button';
        b2.textContent = 'Close';
        b2.onclick = () => this.closePanel();
        actions.append(b1, b2);
      }
    },

    _esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    _toast(msg) {
      try {
        window.SpaceNetShell?.setStatus?.(msg);
        window.AciCli?.print?.('spatial · ' + msg, 'ok');
        window.GlobeDeck?.setPreview?.(msg);
      } catch (_) {}
    },

    _injectCss() {
      if (document.getElementById('spacenet-spatial-css')) return;
      const s = document.createElement('style');
      s.id = 'spacenet-spatial-css';
      s.textContent = [
        '#spacenet-place-panel{display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);',
        'z-index:200;width:min(400px,94vw);max-height:min(78vh,560px);flex-direction:column;',
        'background:rgba(0,8,20,0.94);border:1px solid rgba(61,158,255,0.5);border-radius:16px;',
        'box-shadow:0 12px 40px rgba(0,0,0,0.6),0 0 24px rgba(26,111,212,0.3);color:#cfe8ff;',
        'font:12px/1.4 system-ui,sans-serif;overflow:hidden}',
        '#spacenet-place-panel.open{display:flex}',
        '#spacenet-place-panel header{padding:12px 14px 8px;border-bottom:1px solid rgba(61,158,255,0.25)}',
        '#snp-title{font-weight:700;font-size:14px;color:#9ed0ff}',
        '#snp-sub{font-size:10px;color:#7a9bb8;margin-top:4px}',
        '#snp-body{flex:1;overflow:auto;padding:10px 12px}',
        '.snp-pre{white-space:pre-wrap;font:11px/1.45 ui-monospace,monospace;color:#b8d4f0;margin:0}',
        '.snp-row{display:flex;flex-direction:column;gap:2px;padding:8px 10px;margin-bottom:6px;',
        'border-radius:10px;border:1px solid rgba(61,158,255,0.28);background:rgba(0,24,48,0.55);text-align:left;width:100%;color:inherit}',
        '.snp-btn{cursor:pointer}',
        '.snp-btn:hover{border-color:#3d9eff}',
        '.snp-row small{color:#7a9bb8;font-size:10px}',
        '.snp-note{color:#9eb4c8;margin:0 0 8px}',
        '.snp-link{color:#66ccff;word-break:break-all}',
        '#snp-actions{display:flex;flex-wrap:wrap;gap:6px;padding:10px;border-top:1px solid rgba(61,158,255,0.25)}',
        '#snp-actions button{flex:1;min-width:90px;padding:9px;border-radius:10px;border:1px solid rgba(61,158,255,0.4);',
        'background:rgba(0,40,90,0.7);color:#cfe8ff;font-weight:600;cursor:pointer}',
        '.ge-type-sn_place .ge-pin{background:rgba(0,80,140,0.85)}',
      ].join('');
      document.head.appendChild(s);
    },

    _injectPanel() {
      if (document.getElementById('spacenet-place-panel')) return;
      const el = document.createElement('div');
      el.id = 'spacenet-place-panel';
      el.hidden = true;
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'SpaceNet place');
      el.innerHTML =
        '<header><div id="snp-title">Place</div><div id="snp-sub"></div></header>' +
        '<div id="snp-body"></div><div id="snp-actions"></div>';
      document.body.appendChild(el);
    },

    _refreshPanelList() {
      /* list refreshes on showVault/open */
    },
  };

  window.SpaceNetSpatial = SpaceNetSpatial;
  window.SpaceNetLaw = SpaceNetSpatial.LAW;

  // Auto-init after short delay (app + THREE ready)
  function boot() {
    try {
      SpaceNetSpatial.init();
    } catch (e) {
      console.error('[SpaceNetSpatial]', e);
    }
  }
  if (document.readyState === 'complete') setTimeout(boot, 900);
  else window.addEventListener('load', () => setTimeout(boot, 900));
  setTimeout(boot, 2800);
})();
