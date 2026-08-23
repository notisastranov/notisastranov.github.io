/* === 47-globe-entities.js === */
// === GLOBE ENTITIES — every map thing has a name, proximity label, tap action ===
const GlobeEntity = {
  entities: new Map(),
  _labelRoot: null,
  _selected: null,
  _hud: null,
  _clustered: new Set(),
  _clusterIds: new Set(),
  OLYMPUS_BLUE: 0x0a2d6b,
  OLYMPUS_GLOW: 0x1565c0,

  TYPES: {
    vendor: { color: 0x3d9eff, icon: '🏬', label: 'Shop' },
    driver: { color: 0x1a6fd4, icon: '🚚', label: 'Driver' },
    friend: { color: 0x3d9eff, icon: '👤', label: 'Friend' },
    post: { color: 0x1a6fd4, icon: '▶', label: 'Post' },
    me: { color: 0x3d9eff, icon: '📍', label: 'You' },
    news: { color: 0x1a6fd4, icon: '📰', label: 'News' },
    order: { color: 0x3d9eff, icon: '🛒', label: 'Order' },
    media: { color: 0x1a6fd4, icon: '🎬', label: 'Media' },
    pilot: { color: 0x3d9eff, icon: '🛸', label: 'Delivery' },
    place: { color: 0x1a6fd4, icon: '◎', label: 'Place' },
    unit: { color: 0xffaa33, icon: '⚔', label: 'Unit' },
    drone: { color: 0x44ccff, icon: '🛸', label: 'Drone' },
    spy: { color: 0xaa44ff, icon: '🕵', label: 'Spy' },
    pyramid: { color: 0xffdd44, icon: '🔺', label: 'Pyramid' },
    cluster: { color: 0x3d9eff, icon: '☁', label: 'Cloud' },
    yacht: { color: 0x69f5d0, icon: '⛵', label: 'Yacht' },
  },

  CLUSTER_TYPES: new Set(['post', 'place', 'media', 'news']),
  CLUSTER_MIN: 2,

  init() {
    this._labelRoot = document.getElementById('globe-entity-labels');
    this._hud = document.getElementById('globe-entity-hud');
    document.getElementById('ge-hud-close')?.addEventListener('click', () => MapPlaceMenu?.close?.() || this.clearSelection());
    document.getElementById('ge-hud-action')?.addEventListener('click', () => this._runSelectedAction());
  },

  esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  _worldPos(lat, lng, r) {
    const p = latLngToPos(lat, lng, r || 1.028);
    const v = new THREE.Vector3(p.x, p.y, p.z);
    globePivot.localToWorld(v);
    return v;
  },

  _project(world) {
    const v = world.clone();
    v.project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      behind: v.z > 1,
      depth: v.z,
    };
  },

  _urgencyClass(u) {
    return 'ge-urg-' + Math.min(3, Math.max(0, u | 0));
  },

  isGlobalView() {
    const z = camera?.position?.z ?? 2.55;
    return z >= ((GlobeControl?.Z?.global || 2.55) - 0.12);
  },

  cellKey(lat, lng) {
    const z = camera?.position?.z ?? 2.55;
    const deg = z >= 3.5 ? 3.5 : z >= 2.55 ? 2.0 : z >= 1.82 ? 0.8 : 0.35;
    return Math.round(lat / deg) + ':' + Math.round(lng / deg);
  },

  _isOlympian(opts, entity) {
    const u = opts?.data?.user || entity?.data?.user;
    return !!(opts?.olympian || u?.agent === 'grok-heavy' || (u?.team === 'blue' && u?.demo));
  },

  register(opts) {
    const id = opts.id || ('ge-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
    const type = opts.type || 'place';
    const meta = this.TYPES[type] || this.TYPES.place;
    const lat = opts.lat, lng = opts.lng;
    if (lat == null || lng == null) return null;

    this.unregister(id);

    const olympian = this._isOlympian(opts);
    const urgency = opts.urgency != null ? opts.urgency : (olympian ? 2 : type === 'driver' ? 2 : type === 'me' ? 2 : 1);
    const color = opts.color || (olympian ? this.OLYMPUS_BLUE : meta.color);
    const r = opts.radius || (type === 'me' ? 0.028 : type === 'vendor' ? 0.016 : 0.014);

    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 1.1, r * 1.65, 24),
      new THREE.MeshBasicMaterial({
        color: olympian ? this.OLYMPUS_GLOW : color,
        transparent: true,
        opacity: urgency >= 2 ? 0.55 : 0.28,
        side: THREE.DoubleSide,
      })
    );
    ring.lookAt(0, 0, 0);
    group.add(ring);
    group.add(core);
    if (olympian || opts.flag) {
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(r * 1.8, r * 1.1, 1, 1),
        new THREE.MeshBasicMaterial({
          color: this.OLYMPUS_GLOW,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      flag.position.set(r * 1.4, r * 0.8, 0);
      flag.lookAt(0, 0, 0);
      group.add(flag);
      group.userData.olympianFlag = true;
    }

    const pos = latLngToPos(lat, lng, opts.altitude || 1.028);
    group.position.set(pos.x, pos.y, pos.z);
    group.lookAt(0, 0, 0);

    const entity = {
      id, type, lat, lng, title: opts.title || meta.label,
      description: opts.description || '',
      urgency, color, icon: opts.icon || meta.icon,
      persist: opts.persist !== false,
      expires: opts.expires || 0,
      born: Date.now(),
      data: opts.data || {},
      onTap: opts.onTap || null,
      mesh: group,
      ring,
      core,
      _revealed: false,
      _labelEl: null,
    };

    group.userData = { globeEntity: id, type, title: entity.title, lat, lng };
    globePivot.add(group);

    const label = document.createElement('div');
    label.className = 'ge-label ' + this._urgencyClass(urgency) + ' ge-type-' + type + (olympian ? ' ge-olympian' : '');
    label.dataset.id = id;
    const pin = entity.data?.travelTo
      ? ('<div class="ge-travel-arrow" style="transform:rotate(' + (entity.data.travelBearing || 0) + 'deg)">➤</div>')
      : olympian
      ? ('<div class="ge-pin ge-olymp-flag">🏳️</div><div class="ge-pin">' + this.esc(entity.icon) + '</div>')
      : ('<div class="ge-pin">' + this.esc(entity.icon) + '</div>');
    label.innerHTML = pin
      + '<div class="ge-text"><b>' + this.esc(entity.title) + '</b>'
      + '<span>' + this.esc(entity.description) + '</span></div>';
    if (entity.data?.alwaysShowLabel) label.classList.add('ge-travel-label');
    label.style.display = 'none';
    label.addEventListener('click', ev => {
      ev.stopPropagation();
      this.activate(entity);
    });
    this._labelRoot?.appendChild(label);
    entity._labelEl = label;

    this.entities.set(id, entity);
    return entity;
  },

  unregister(id) {
    const e = this.entities.get(id);
    if (!e) return;
    if (e.mesh?.parent) e.mesh.parent.remove(e.mesh);
    if (e._labelEl?.parentNode) e._labelEl.parentNode.removeChild(e._labelEl);
    if (this._selected === id) this.clearSelection();
    this.entities.delete(id);
  },

  unregisterType(type) {
    [...this.entities.values()].filter(e => e.type === type).forEach(e => this.unregister(e.id));
  },

  registerTemp(opts) {
    return this.register({ ...opts, persist: false, expires: opts.expires || 12000 });
  },

  _proximity(entity) {
    const world = this._worldPos(entity.lat, entity.lng, 1.03);
    const camPos = camera.position.clone();
    const toEnt = world.clone().sub(camPos).normalize();
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const dot = look.dot(toEnt);
    const z = camera.position.z;
    const zoomNear = Math.max(0, Math.min(1, (2.45 - z) / 1.35));
    const u = entity.urgency;
    const thresh = 0.94 - u * 0.12 - zoomNear * 0.22;
    const show = dot > thresh && !this._project(world).behind;
    const flash = u >= 3 && dot > 0.45;
    const glow = u >= 2 && show;
    return { show, flash, glow, dot, zoomNear, world };
  },

  _scavengeView(entity, reason) {
    if (!entity._revealed && reason === 'proximity') {
      entity._revealed = true;
      FieldBrain?.pulse?.('explore', 'saw:' + entity.type + ':' + entity.title.slice(0, 60), {
        role: 'client',
        props: { entity_id: entity.id, type: entity.type, urgency: entity.urgency, lat: entity.lat, lng: entity.lng },
      });
      AciCoders?.observeActivity?.('entity_view', entity.type + ':' + entity.title.slice(0, 80));
    }
    if (reason === 'tap') {
      FieldBrain?.pulse?.('explore', 'tap:' + entity.type + ':' + entity.title.slice(0, 60), {
        role: 'client',
        props: { entity_id: entity.id, type: entity.type, action: true },
      });
      AciCoders?.observeActivity?.('entity_tap', entity.type + ':' + entity.title.slice(0, 80));
    }
  },

  select(entity) {
    this._selected = entity.id;
    const hud = this._hud;
    if (!hud) return;
    MapPlaceMenu?._showPlaceMenu?.(false);
    hud.classList.add('open');
    document.getElementById('ge-hud-type').textContent = (entity.icon || '') + ' ' + (this.TYPES[entity.type]?.label || entity.type);
    document.getElementById('ge-hud-title').textContent = entity.title;
    document.getElementById('ge-hud-desc').textContent = entity.description || 'Tap action below';
    const btn = document.getElementById('ge-hud-action');
    if (btn) btn.textContent = entity._actionLabel || this._defaultActionLabel(entity);
    GlobeDeck?.setPreview?.(entity.icon + ' ' + entity.title + ' — ' + (entity.description || '').slice(0, 50));
    AciCli?.print('◎ ' + entity.title + ' · ' + (entity.description || entity.type), 'map');
  },

  clearSelection() {
    this._selected = null;
    this._hud?.classList.remove('open');
  },

  flyTo(entity, targetZ) {
    if (targetZ == null) targetZ = GlobeControl?.Z?.national || 1.82;
    if (!entity || entity.lat == null) return;
    window._globeFly = null;
    const fp = latLngToPos(entity.lat, entity.lng, 1.04);
    if (typeof flyToPoint === 'function') flyToPoint(new THREE.Vector3(fp.x, fp.y, fp.z), targetZ);
    GlobeControl?.noteAutoFly?.();
    MapDepict?.pulse?.(entity.lat, entity.lng, 0x00ddff, entity.title || 'here', 7000);
    GlobeDeck?.setPreview?.('◎ ' + (entity.title || 'location'));
  },

  _defaultActionLabel(entity) {
    const map = {
      vendor: 'Open shop menu',
      driver: 'Request delivery',
      friend: 'Fly here',
      post: 'Watch / read',
      me: 'Zoom to me',
      news: 'Read news',
      order: 'View order',
      media: 'Play media',
      pilot: 'Track delivery',
      place: 'Go here',
      yacht: 'Book charter',
    };
    return map[entity.type] || 'Interact';
  },

  _runSelectedAction() {
    const e = this.entities.get(this._selected);
    if (e) this.activate(e);
  },

  activate(entity) {
    this._scavengeView(entity, 'tap');
    this.select(entity);
    if (entity.onTap) {
      entity.onTap(entity);
      return;
    }
    if (entity.onAction) {
      entity.onAction(entity);
      return;
    }
    if (entity.data?.url || entity.subtitle?.includes('.astranov.eu')) {
      const url = entity.data?.url || ('https://' + entity.subtitle);
      if (window.AstranovSiteShell?.open) {
        AstranovSiteShell.open(url, { domain: entity.subtitle, title: entity.title });
        return;
      }
    }
    this._defaultTap(entity);
  },

  _defaultTap(entity) {
    const fp = latLngToPos(entity.lat, entity.lng, 1.04);
    const z = entity.type === 'vendor' ? (GlobeControl?.Z?.regional || 1.65) : (GlobeControl?.Z?.national || 1.82);
    flyToPoint?.(new THREE.Vector3(fp.x, fp.y, fp.z), z);
    GlobeControl?.noteAutoFly?.();

    switch (entity.type) {
      case 'vendor':
        if (entity.data?.vendor) ProfileSite?.openVendor?.(entity.data.vendor);
        else window.Commerce?.showPicker?.();
        break;
      case 'driver':
        if (entity.data?.driver?.id) MarketplaceComms?.selectDriver?.(entity.data.driver.id, entity.data.driver);
        else ACIControl?.reply('Driver ' + entity.title + ' — pick for delivery');
        break;
      case 'friend':
        if (entity.data?.user) {
          ProfileSite?.openUser?.(entity.data.user.id);
          MapComms?.contactMenu?.(entity.data.user);
        } else ACIControl?.reply(entity.title + ' on the map — tap contact options');
        break;
      case 'cluster':
        this._openCluster(entity);
        break;
      case 'post':
      case 'media':
        if (entity.data?.youtubeId || entity.data?.url) {
          const yt = entity.data.youtubeId || GlobeVideo?.parseId?.(entity.data.url);
          if (yt) {
            MapComms?.showCloudVideo?.(yt, entity.title);
            LazyModules?.ensure?.().then(() =>
              GlobeVideo?.play?.(yt, { title: entity.title }, entity.title)
            );
          } else if (entity.data?.url) {
            window.open(entity.data.url, '_blank', 'noopener');
          }
        } else {
          ACIControl?.reply(entity.description || entity.title);
        }
        break;
      case 'me':
        this.flyTo(entity, GlobeControl?.Z?.global || 2.55);
        ACIControl?.reply('On globe — zoom in or say city view for shops');
        break;
      case 'news':
        NewsFeed?.flash?.();
        break;
      case 'yacht':
        if (entity.data?.yacht) YachtMatcher?.openBooking?.(entity.data.yacht);
        else YachtMatcher?.openBooking?.(null, { tab: 'booker' });
        break;
      default:
        ACIControl?.reply(entity.title + (entity.description ? ' — ' + entity.description : ''));
    }
  },

  pickFromHit(object) {
    let o = object;
    for (let i = 0; i < 6 && o; i++) {
      if (o.userData?.globeEntity) return this.entities.get(o.userData.globeEntity);
      if (o.userData?.vendor) {
        const v = o.userData.vendor;
        return [...this.entities.values()].find(e => e.type === 'vendor' && e.data?.vendor?.id === v.id)
          || this.register({
            id: 'vendor-' + v.id, type: 'vendor', lat: v.lat, lng: v.lng,
            title: v.name, description: (v.category || 'shop') + ' · tap to order',
            data: { vendor: v },
            onTap: () => window.Commerce?.openVendor?.(v),
          });
      }
      if (o.userData?.driver) {
        const d = o.userData.driver;
        return [...this.entities.values()].find(e => e.type === 'driver' && e.data?.driver?.id === d.id);
      }
      if (o.userData?.type === 'post') {
        return [...this.entities.values()].find(e => e.type === 'post' && e.title === o.userData.label);
      }
      if (o.userData?.type === 'me') {
        return [...this.entities.values()].find(e => e.type === 'me');
      }
      if (o.userData?.name && o.userData?.lat != null) {
        return [...this.entities.values()].find(e => e.title === o.userData.name);
      }
      o = o.parent;
    }
    return null;
  },

  clickTargets() {
    const list = [];
    this.entities.forEach(e => { if (e.mesh) list.push(e.mesh); });
    return list;
  },

  _applyGlobalClusters() {
    const global = this.isGlobalView();
    if (!global) {
      if (this._clusterIds.size || this._clustered.size) {
        this._clusterIds.forEach((id) => this.unregister(id));
        this._clusterIds.clear();
        this._clustered.forEach((id) => {
          const e = this.entities.get(id);
          if (e?.mesh) e.mesh.visible = true;
          if (e?._labelEl) e._labelEl.style.visibility = '';
        });
        this._clustered.clear();
      }
      return;
    }

    const buckets = new Map();
    this.entities.forEach((entity, id) => {
      if (this._clusterIds.has(id) || entity.type === 'me' || entity.type === 'cluster') return;
      if (!this.CLUSTER_TYPES.has(entity.type) && !(entity.type === 'friend' && entity.data?.user?.demo)) return;
      const key = this.cellKey(entity.lat, entity.lng);
      const b = buckets.get(key) || { key, members: [], lat: 0, lng: 0, videos: [] };
      b.members.push(entity);
      b.lat += entity.lat;
      b.lng += entity.lng;
      const url = entity.data?.url || entity.data?.post?.url;
      const yt = GlobeVideo?.parseId?.(url);
      if (yt) b.videos.push({ id: yt, title: entity.title });
      buckets.set(key, b);
    });

    const nextClustered = new Set();
    const nextClusterIds = new Set();

    buckets.forEach((b) => {
      if (b.members.length < this.CLUSTER_MIN) return;
      const lat = b.lat / b.members.length;
      const lng = b.lng / b.members.length;
      const id = 'cluster-' + b.key;
      nextClusterIds.add(id);
      b.members.forEach((m) => {
        nextClustered.add(m.id);
        if (m.mesh) m.mesh.visible = false;
        if (m._labelEl) m._labelEl.style.display = 'none';
      });
      const vid = b.videos[0];
      const desc = b.members.length + ' signals'
        + (b.videos.length ? ' · ' + b.videos.length + ' video' : '')
        + ' · tap cloud';
      const existing = this.entities.get(id);
      if (existing) {
        existing.lat = lat;
        existing.lng = lng;
        existing.title = '☁ ' + b.members.length;
        existing.description = desc;
        existing.data.members = b.members;
        existing.data.youtubeId = vid?.id;
        const cp = latLngToPos(lat, lng, 1.028);
        if (existing.mesh) {
          existing.mesh.position.set(cp.x, cp.y, cp.z);
          existing.mesh.lookAt(0, 0, 0);
        }
        if (existing._labelEl) {
          const tb = existing._labelEl.querySelector('.ge-text b');
          const ts = existing._labelEl.querySelector('.ge-text span');
          if (tb) tb.textContent = existing.title;
          if (ts) ts.textContent = desc;
        }
      } else {
        this.register({
          id,
          type: 'cluster',
          lat,
          lng,
          title: '☁ ' + b.members.length,
          description: desc,
          urgency: b.videos.length ? 3 : 2,
          icon: '☁',
          persist: true,
          data: { members: b.members, youtubeId: vid?.id, clusterKey: b.key },
          onTap: (e) => this._openCluster(e),
        });
      }
    });

    this._clustered.forEach((id) => {
      if (!nextClustered.has(id)) {
        const e = this.entities.get(id);
        if (e?.mesh) e.mesh.visible = true;
        if (e?._labelEl) e._labelEl.style.visibility = '';
      }
    });
    this._clusterIds.forEach((id) => {
      if (!nextClusterIds.has(id)) this.unregister(id);
    });
    this._clustered = nextClustered;
    this._clusterIds = nextClusterIds;
  },

  _openCluster(entity) {
    const members = entity.data?.members || [];
    const yt = entity.data?.youtubeId;
    if (yt) MapComms?.showCloudVideo?.(yt, entity.title);
    if (members.length === 1 && members[0].onTap) {
      members[0].onTap(members[0]);
      return;
    }
    this.select(entity);
    const lines = members.slice(0, 8).map((m) => m.icon + ' ' + m.title).join(' · ');
    ACIControl?.reply('Cloud · ' + members.length + ' — ' + lines);
    if (GlobeControl?.Z?.national) {
      const fp = latLngToPos(entity.lat, entity.lng, 1.04);
      flyToPoint?.(new THREE.Vector3(fp.x, fp.y, fp.z), GlobeControl.Z.national);
      GlobeControl?.noteAutoFly?.();
    }
  },

  tick() {
    const now = Date.now();
    if (!this._tickLast) this._tickLast = 0;
    if (document.hidden) return;
    if (!SlumberManager?.allows?.('entities')) return;
    const minGap = SlumberManager?.tickMs?.('entity') || (window._voicePerfMode || window._globePerfLite ? 520 : 200);
    if (now - this._tickLast < minGap) return;
    this._tickLast = now;
    if (!this._clusterLast || now - this._clusterLast > 500) {
      this._clusterLast = now;
      this._applyGlobalClusters();
    }
    const toRemove = [];

    this.entities.forEach((entity, id) => {
      if (this._clustered.has(id)) return;
      if (!entity.persist && entity.expires && now - entity.born > entity.expires) {
        toRemove.push(id);
        return;
      }

      const prox = this._proximity(entity);
      // alwaysShowLabel: rotating globe tiles (video/info/me) stay visible when facing camera
      const forceShow = !!(entity.data?.alwaysShowLabel || entity.data?.pinVideo || entity.data?.infoTile);
      const el = entity._labelEl;
      if (el) {
        if (prox.show || (forceShow && !prox.behind && prox.dot > 0.05)) {
          const scr = this._project(prox.world);
          if (!scr.behind) {
            el.style.display = 'flex';
            el.style.left = scr.x + 'px';
            el.style.top = (scr.y - 8) + 'px';
            el.classList.toggle('ge-flash', prox.flash || !!entity.data?.pinVideo);
            el.classList.toggle('ge-glow', prox.glow || forceShow);
            el.classList.toggle('ge-selected', this._selected === id);
            if (!entity._revealed) this._scavengeView(entity, 'proximity');
          } else {
            el.style.display = 'none';
          }
        } else {
          el.style.display = 'none';
          el.classList.remove('ge-flash', 'ge-glow', 'ge-selected');
        }
      }

      if (entity.ring) {
        const pulse = prox.glow || forceShow ? 0.45 + Math.sin(now / 280) * 0.25 : 0.2;
        entity.ring.material.opacity = prox.flash ? 0.65 + Math.sin(now / 180) * 0.35 : pulse;
        entity.ring.visible = prox.show || entity.urgency >= 2 || forceShow;
      }
      if (entity.core && prox.flash) {
        const s = 1 + Math.sin(now / 200) * 0.18;
        entity.core.scale.set(s, s, s);
      }
    });

    toRemove.forEach(id => this.unregister(id));
  },

  // ── Adapters for existing systems ──

  syncYachts(yachts) {
    this.unregisterType('yacht');
    const ym = window.YachtMatcher;
    (yachts || []).forEach((y, i) => {
      const c = ym?.coordsFor?.(y, i) || [36.44, 28.22];
      const lat = c[0];
      const lng = c[1];
      const minC = ym?._engine?.()?.effectiveMinimumCrew?.(y) ?? y.minimum_crew ?? 3;
      this.register({
        id: 'yacht-' + y.id,
        type: 'yacht',
        lat,
        lng,
        title: '⛵ ' + (y.name || 'Yacht'),
        subtitle: 'yachts.astranov.eu',
        description: (y.yacht_type || 'Yacht') + (y.length_m ? ' · ' + y.length_m + 'm' : '')
          + ' · ' + (y.guest_capacity || '?') + ' guests · min crew ' + minC
          + (y.price_week ? ' · ' + Number(y.price_week).toLocaleString() + ' EUR/wk' : '')
          + ' · tap to book',
        urgency: i === 0 ? 2 : 1,
        radius: 0.018,
        data: { yacht: y, url: ym?.bookingUrl?.(y, { tab: 'booker' }) },
        _actionLabel: 'Book ' + (y.name || 'yacht'),
        onTap: () => ym?.openBooking?.(y, { tab: 'booker' }),
      });
    });
  },

  syncVendors(vendors) {
    this.unregisterType('vendor');
    (vendors || []).forEach((v, i) => {
      if (v.lat == null) return;
      const km = window.Commerce?.haversineKm?.(window.Commerce.userLatLng().lat, window.Commerce.userLatLng().lng, v.lat, v.lng);
      const menu = window.Commerce?.menuFor?.(v)?.length || 0;
      this.register({
        id: 'vendor-' + v.id,
        type: 'vendor',
        lat: v.lat,
        lng: v.lng,
        title: v.name,
        description: (menu ? menu + ' items' : 'menu on request') + (km != null ? ' · ' + km.toFixed(1) + ' km' : '') + ' · tap to order',
        urgency: i === 0 ? 2 : 1,
        data: { vendor: v },
        _actionLabel: 'Open ' + v.name,
        onTap: () => window.Commerce?.openVendor?.(v),
      });
    });
  },

  syncDrivers(drivers) {
    this.unregisterType('driver');
    (drivers || []).forEach((d, i) => {
      if (d.field_lat == null) return;
      const km = window.Commerce?.haversineKm?.(window.Commerce.userLatLng().lat, window.Commerce.userLatLng().lng, d.field_lat, d.field_lng);
      this.register({
        id: 'driver-' + d.id,
        type: 'driver',
        lat: d.field_lat,
        lng: d.field_lng,
        title: d.display_name || 'Driver',
        description: 'Available · ' + (km != null ? km.toFixed(1) + ' km' : 'nearby') + ' · tap to assign',
        urgency: 2,
        data: { driver: d },
        _actionLabel: 'Assign ' + (d.display_name || 'driver'),
        onTap: (e) => {
          const driverId = e.data?.driver?.id;
          if (driverId && MarketplaceComms?.selectDriver) {
            MarketplaceComms.selectDriver(driverId, e.data?.driver);
          } else {
            ACIControl?.reply('Driver ' + e.title + ' — order first, then pick driver');
          }
        },
      });
    });
  },

  syncFriends(others, opts) {
    opts = opts || {};
    this.unregisterType('friend');
    (others || []).forEach(u => {
      const isRed = u.team === 'red' || (opts.teamMode && u.team === 'red');
      const isOlympian = u.agent === 'grok-heavy' || (u.team === 'blue' && u.demo);
      const fed = !!u.fed;
      const agentTag = u.agent === 'cronian' ? 'Cronian titan' : isOlympian ? 'Grok Heavy agent' : '';
      this.register({
        id: 'friend-' + u.id,
        type: 'friend',
        lat: u.lat,
        lng: u.lng,
        title: (u.emoji || (isRed ? '🔴' : '👤')) + ' ' + u.name,
        description: u.domain
          ? (u.domain + (agentTag ? ' · ' + agentTag : ''))
          : isRed
          ? (fed ? 'RED · fed ✓ · blue team won slice' : 'RED rival · deliver pitogyro/beer/burger/tsigareta')
          : 'Player on map · tap to fly here · collab or κρυφτό',
        urgency: isRed && !fed ? 3 : isOlympian ? 2 : 1,
        color: isRed ? (fed ? 0x884444 : 0xff2244) : isOlympian ? this.OLYMPUS_BLUE : undefined,
        olympian: isOlympian,
        flag: isOlympian,
        data: { user: u },
        onTap: (e) => {
          if (isRed && !fed) {
            TelemachosPilot?.deliverToRed?.(u.id, 'pitogyra');
            return;
          }
          MapComms?.contactMenu?.(u);
          const p = latLngToPos(e.lat, e.lng, 1.04);
          flyToPoint?.(new THREE.Vector3(p.x, p.y, p.z), GlobeControl?.Z?.national || 1.82);
        },
        _actionLabel: isRed && !fed ? 'Deliver pitogyra' : 'Contact',
      });
    });
  },

  syncMe(lat, lng, name, opts) {
    opts = opts || {};
    this.unregisterType('me');
    let desc = 'Your location · tap to zoom here';
    if (opts.travelTo) {
      desc = '→ ' + opts.travelTo + (opts.travelUser ? ' · ' + opts.travelUser : '')
        + ' · ' + (opts.distKm || '?') + ' km · ' + (opts.speedKmh || 820) + ' km/h';
    }
    this.register({
      id: 'me',
      type: 'me',
      lat,
      lng,
      title: opts.travelTo ? ('→ ' + opts.travelTo) : (name || 'You'),
      description: desc,
      urgency: opts.travelTo ? 3 : 2,
      persist: true,
      data: {
        alwaysShowLabel: !!opts.alwaysShow,
        travelBearing: opts.bearing,
        travelTo: opts.travelTo,
      },
      _actionLabel: 'Zoom to me',
      onTap: (e) => {
        const flyHere = (lat, lng) => {
          if (lat == null) { this.flyTo(e, GlobeControl?.Z?.global || 2.55); return; }
          placeMe(lat, lng, { fly: true, zoom: GlobeControl?.Z?.global || 2.55, quiet: false });
        };
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => flyHere(pos.coords.latitude, pos.coords.longitude),
            () => flyHere(e.lat, e.lng),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 20000 }
          );
        } else {
          flyHere(e.lat, e.lng);
        }
        ACIControl?.reply(opts.travelTo
          ? 'En route → ' + opts.travelTo + ' · real location private'
          : 'Flying to you — zoom in or say city view for shops');
      },
    });
  },

  syncPost(p) {
    if (p.lat == null) return;
    const id = 'post-' + (p.id || p.lat + '-' + p.lng);
    this.register({
      id,
      type: 'post',
      lat: p.lat,
      lng: p.lng,
      title: (p.text || p.author || 'Post').slice(0, 48),
      description: (p.channel || 'global') + (p.mode === 'video' ? ' · video' : '') + ' · tap to open',
      urgency: p.mode === 'video' ? 2 : 1,
      data: { url: p.url, channel: p.channel, post: p },
      _actionLabel: p.url ? 'Play video' : 'Read post',
      onTap: (e) => {
        if (e.data?.url) GlobeVideo?.play?.(e.data.url, { title: e.title }, e.title);
        else ACIControl?.reply(e.description);
      },
    });
  },
};
window.GlobeEntity = GlobeEntity;

/* === 76-city-tasks.js === */
// === CITY TASKS — same delivery DNA for ALL city work ===
// Pipeline: open → assigned → claimed → en_route/in_progress → delivered/done → cancelled
// Kinds: delivery · job · errand · dating · service
// Durations: 3h barman · 1w housekeeper · 2h date · one-shot errands
const CityTasks = {
  version: '20260720-task-launcher',
  tasks: new Map(),
  _localKey: 'astranov:city-tasks-v2',
  _coinsKey: 'astranov:coins-wallet-v1',
  _wallet: null,

  // Shared status DNA (delivery names kept for OrderTracking mirror)
  STATUSES: ['open', 'assigned', 'claimed', 'picked_up', 'en_route', 'in_progress', 'delivered', 'done', 'cancelled'],

  KINDS: {
    delivery: {
      label: 'Delivery', icon: '📦', role: 'driver',
      actionClaim: 'Claim delivery', actionDone: 'Mark delivered',
      color: 0x44ffaa,
    },
    job: {
      label: 'Job / gig', icon: '💼', role: 'worker',
      actionClaim: 'Take job', actionDone: 'Complete shift',
      color: 0x66aaff,
    },
    errand: {
      label: 'Errand', icon: '🏃', role: 'runner',
      actionClaim: 'Run errand', actionDone: 'Errand done',
      color: 0xffcc44,
    },
    dating: {
      label: 'Dating', icon: '💕', role: 'match',
      actionClaim: 'Accept date', actionDone: 'Date done',
      color: 0xff6699,
    },
    service: {
      label: 'Service', icon: '🛠️', role: 'provider',
      actionClaim: 'Take service', actionDone: 'Service done',
      color: 0xaa88ff,
    },
    help: {
      label: 'Help', icon: '🤝', role: 'helper',
      actionClaim: 'Help now', actionDone: 'Help done',
      color: 0x66ffcc,
    },
    vendor: {
      label: 'Vendor task', icon: '🏬', role: 'worker',
      actionClaim: 'Take vendor task', actionDone: 'Vendor task done',
      color: 0xffaa44,
    },
  },

  /** Multi-party stages — both poster + worker must confirm each step */
  STAGE_TEMPLATES: {
    delivery: ['accepted', 'picked_up', 'arrived', 'delivered'],
    job: ['accepted', 'arrived', 'in_progress', 'done'],
    errand: ['accepted', 'arrived', 'done'],
    dating: ['accepted', 'arrived', 'met', 'done'],
    service: ['accepted', 'arrived', 'done'],
    help: ['accepted', 'arrived', 'done'],
    vendor: ['accepted', 'arrived', 'done'],
  },

  // Catalog of common gigs (extend freely)
  CATALOG: [
    { kind: 'job', role: 'barman', title: 'Barman / bartender', defaultDur: '3h', rateHint: '€/h' },
    { kind: 'job', role: 'barista', title: 'Barista', defaultDur: '4h', rateHint: '€/h' },
    { kind: 'job', role: 'housekeeper', title: 'Housekeeper', defaultDur: '1w', rateHint: '€/week' },
    { kind: 'job', role: 'cleaner', title: 'Cleaner', defaultDur: '3h', rateHint: '€/h' },
    { kind: 'job', role: 'nanny', title: 'Nanny / childcare', defaultDur: '1d', rateHint: '€/d' },
    { kind: 'job', role: 'gardener', title: 'Gardener', defaultDur: '4h', rateHint: '€/h' },
    { kind: 'job', role: 'cook', title: 'Cook / private chef', defaultDur: '3h', rateHint: '€/h' },
    { kind: 'job', role: 'waiter', title: 'Waiter / server', defaultDur: '5h', rateHint: '€/h' },
    { kind: 'job', role: 'security', title: 'Security', defaultDur: '8h', rateHint: '€/h' },
    { kind: 'job', role: 'tutor', title: 'Tutor', defaultDur: '2h', rateHint: '€/h' },
    { kind: 'job', role: 'mover', title: 'Mover / helper', defaultDur: '4h', rateHint: '€/h' },
    { kind: 'job', role: 'petcare', title: 'Pet care / walker', defaultDur: '1h', rateHint: '€/h' },
    { kind: 'errand', role: 'errand', title: 'General errand', defaultDur: '1h', rateHint: 'flat' },
    { kind: 'errand', role: 'pharmacy', title: 'Pharmacy run', defaultDur: '45m', rateHint: 'flat' },
    { kind: 'errand', role: 'grocery', title: 'Grocery run', defaultDur: '1h', rateHint: 'flat' },
    { kind: 'errand', role: 'documents', title: 'Document / office run', defaultDur: '2h', rateHint: 'flat' },
    { kind: 'delivery', role: 'driver', title: 'Package / food delivery', defaultDur: '45m', rateHint: 'route' },
    { kind: 'dating', role: 'date', title: 'Date / meet', defaultDur: '2h', rateHint: 'shared' },
    { kind: 'dating', role: 'coffee', title: 'Coffee date', defaultDur: '1h', rateHint: 'shared' },
    { kind: 'dating', role: 'dinner', title: 'Dinner date', defaultDur: '3h', rateHint: 'shared' },
    { kind: 'dating', role: 'walk', title: 'Walk / activity date', defaultDur: '2h', rateHint: 'shared' },
    { kind: 'service', role: 'handyman', title: 'Handyman', defaultDur: '2h', rateHint: '€/h' },
    { kind: 'service', role: 'beauty', title: 'Beauty / hair at home', defaultDur: '2h', rateHint: '€/h' },
  ],

  init() {
    if (this._inited) return;
    this._inited = true;
    window.CityTasks = this;
    this._loadLocal();
    this._loadWallet();
    this._wireFieldBrain();
    try { TaskBoard?.init?.(); } catch (_) {}
    console.log('%c[CityTasks] launch · coins · radius · dual-verify', 'color:#44ffaa;font-weight:700');
  },

  _loadLocal() {
    try {
      const raw = localStorage.getItem(this._localKey)
        || localStorage.getItem('astranov:city-tasks-v1');
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach(t => { if (t?.id) this.tasks.set(t.id, t); });
    } catch (_) {}
  },

  _saveLocal() {
    try {
      const arr = [...this.tasks.values()].slice(-100);
      localStorage.setItem(this._localKey, JSON.stringify(arr));
    } catch (_) {}
  },

  /** Local Coins wallet — product currency for task offers */
  _loadWallet() {
    try {
      const raw = localStorage.getItem(this._coinsKey);
      if (raw) {
        const w = JSON.parse(raw);
        this._wallet = {
          balance: Math.max(0, Number(w.balance) || 0),
          held: Math.max(0, Number(w.held) || 0),
          ledger: Array.isArray(w.ledger) ? w.ledger.slice(-80) : [],
        };
      }
    } catch (_) {}
    if (!this._wallet) {
      this._wallet = { balance: 500, held: 0, ledger: [] };
      this._saveWallet();
    }
  },

  _saveWallet() {
    try {
      localStorage.setItem(this._coinsKey, JSON.stringify(this._wallet));
    } catch (_) {}
  },

  coinsBalance() {
    if (!this._wallet) this._loadWallet();
    return {
      balance: this._wallet.balance,
      held: this._wallet.held,
      available: Math.max(0, this._wallet.balance - this._wallet.held),
    };
  },

  _ledger(entry) {
    if (!this._wallet) this._loadWallet();
    this._wallet.ledger.push(Object.assign({ at: Date.now() }, entry));
    if (this._wallet.ledger.length > 80) this._wallet.ledger = this._wallet.ledger.slice(-80);
    this._saveWallet();
  },

  /** Hold Coins on launch so offer is funded */
  holdCoins(amount, taskId) {
    if (!this._wallet) this._loadWallet();
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (!n) return { ok: true, held: 0 };
    const avail = this._wallet.balance - this._wallet.held;
    if (avail < n) {
      return { ok: false, error: 'insufficient_coins', available: avail, needed: n };
    }
    this._wallet.held += n;
    this._ledger({ type: 'hold', amount: n, task_id: taskId, balance: this._wallet.balance, held: this._wallet.held });
    this._saveWallet();
    return { ok: true, held: n, available: this._wallet.balance - this._wallet.held };
  },

  /** Release hold without paying (cancel / expire) */
  releaseHold(amount, taskId) {
    if (!this._wallet) this._loadWallet();
    const n = Math.max(0, Math.round(Number(amount) || 0));
    this._wallet.held = Math.max(0, this._wallet.held - n);
    this._ledger({ type: 'release', amount: n, task_id: taskId, balance: this._wallet.balance, held: this._wallet.held });
    this._saveWallet();
    return { ok: true };
  },

  /** Settle: debit poster hold → credit worker on final dual-verified done */
  settleCoins(task) {
    if (!task || task.coins_settled) return { ok: true, skipped: true };
    const n = Math.max(0, Math.round(Number(task.coins) || 0));
    if (!n) {
      task.coins_settled = true;
      return { ok: true, amount: 0 };
    }
    if (!this._wallet) this._loadWallet();
    const me = Auth?.user?.id || 'local';
    const isPoster = task.poster_id === me || task.poster_id === 'local';
    const isWorker = task.worker_id === me || task.worker_id === 'local-worker';

    if (isPoster) {
      // Debit from balance and release hold
      this._wallet.held = Math.max(0, this._wallet.held - n);
      this._wallet.balance = Math.max(0, this._wallet.balance - n);
      this._ledger({
        type: 'pay_task',
        amount: -n,
        task_id: task.id,
        to: task.worker_id,
        balance: this._wallet.balance,
        held: this._wallet.held,
      });
    } else if (isWorker) {
      // Worker earns (mint/credit on this device wallet for demo multi-tab)
      this._wallet.balance += n;
      this._ledger({
        type: 'earn_task',
        amount: n,
        task_id: task.id,
        from: task.poster_id,
        balance: this._wallet.balance,
        held: this._wallet.held,
      });
    } else {
      // Same-device demo: both roles local — debit once, net zero unless poster≠worker ids
      this._wallet.held = Math.max(0, this._wallet.held - n);
      this._wallet.balance = Math.max(0, this._wallet.balance - n);
      this._ledger({
        type: 'settle_local',
        amount: -n,
        task_id: task.id,
        balance: this._wallet.balance,
        held: this._wallet.held,
      });
    }
    this._saveWallet();
    task.coins_settled = true;
    task.updated_at = Date.now();
    this.tasks.set(task.id, task);
    this._saveLocal();
    try {
      window.dispatchEvent(new CustomEvent('astranov-coins', { detail: this.coinsBalance() }));
    } catch (_) {}
    return { ok: true, amount: n, balance: this._wallet.balance };
  },

  _id() {
    return 'ct_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  },

  _wireFieldBrain() {
    if (!window.FieldBrain) return;
    const FB = window.FieldBrain;
    FB.claimDelivery = async (orderId) => this.claim(orderId);
    FB.createCityTask = (spec) => this.create(spec);
    FB.listCityTasks = (f) => this.list(f);
    FB.completeDelivery = async (id) => this.complete(id);
    FB.postJob = (spec) => this.postJob(spec);
    FB.postDate = (spec) => this.postDate(spec);
  },

  /** Parse "3h" · "1w" · "2d" · "45m" → ms + label */
  parseDuration(raw) {
    if (raw == null || raw === '') return { ms: 0, label: 'open', unit: null, amount: 0 };
    if (typeof raw === 'number' && raw > 0) {
      return { ms: raw, label: this._fmtDur(raw), unit: 'ms', amount: raw };
    }
    const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
    const m = s.match(/^(\d+(?:\.\d+)?)(m|min|mins|h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks)?$/);
    if (!m) return { ms: 0, label: String(raw), unit: null, amount: 0 };
    const n = parseFloat(m[1]);
    const u = m[2] || 'h';
    let ms = 0;
    let label = n + u;
    if (/^m|min/.test(u)) { ms = n * 60 * 1000; label = n + 'm'; }
    else if (/^h|hr|hour/.test(u)) { ms = n * 3600 * 1000; label = n + 'h'; }
    else if (/^d|day/.test(u)) { ms = n * 86400 * 1000; label = n + 'd'; }
    else if (/^w|wk|week/.test(u)) { ms = n * 7 * 86400 * 1000; label = n + 'w'; }
    return { ms, label, unit: u, amount: n };
  },

  _fmtDur(ms) {
    if (!ms || ms < 60000) return 'open';
    if (ms < 3600000) return Math.round(ms / 60000) + 'm';
    if (ms < 86400000) return (Math.round(ms / 3600000 * 10) / 10) + 'h';
    if (ms < 7 * 86400000) return (Math.round(ms / 86400000 * 10) / 10) + 'd';
    return (Math.round(ms / (7 * 86400000) * 10) / 10) + 'w';
  },

  /** Infer kind + role + duration from free text */
  parseSpec(text) {
    const raw = String(text || '').trim();
    const low = raw.toLowerCase();
    let kind = 'job';
    let role = 'worker';
    let duration = null;
    let title = raw;

    // Duration tokens → normalize to 3h / 1w / 45m
    const durM = low.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|days?|d|weeks?|wks?|w|mins?|minutes?|m)\b/i);
    if (durM) {
      const n = durM[1];
      const u = durM[2].toLowerCase();
      if (/^h|hour|hr/.test(u)) duration = n + 'h';
      else if (/^d|day/.test(u)) duration = n + 'd';
      else if (/^w|week|wk/.test(u)) duration = n + 'w';
      else duration = n + 'm';
    }

    // Kind detection
    if (/\b(date|dating|coffee\s*date|dinner\s*date|meet\s*(up)?|romantic|tinder|match)\b/i.test(low)) {
      kind = 'dating';
      role = /dinner/.test(low) ? 'dinner' : /coffee/.test(low) ? 'coffee' : /walk/.test(low) ? 'walk' : 'date';
    } else if (/\b(deliver|delivery|drop.?off|package|food\s*order|courier)\b/i.test(low)) {
      kind = 'delivery';
      role = 'driver';
    } else if (/\b(errand|pharmacy|grocery\s*run|pick\s*up|run\s*to)\b/i.test(low)) {
      kind = 'errand';
      role = /pharmacy/.test(low) ? 'pharmacy' : /grocery/.test(low) ? 'grocery' : 'errand';
    } else if (/\b(handyman|beauty|hair|repair|fix)\b/i.test(low)) {
      kind = 'service';
      role = /beauty|hair/.test(low) ? 'beauty' : 'handyman';
    }

    // Role from catalog keywords
    for (const c of this.CATALOG) {
      if (c.role !== 'driver' && c.role !== 'errand' && c.role !== 'date'
        && new RegExp('\\b' + c.role + '\\b', 'i').test(low)) {
        kind = c.kind;
        role = c.role;
        if (!duration) duration = c.defaultDur;
        title = c.title + (duration ? ' · ' + duration : '');
        break;
      }
    }
    // Explicit barman / housekeeper etc. already matched above; refine title
    if (/barman|bartender|μπάρμαν|μπαρμαν/i.test(low)) {
      kind = 'job'; role = 'barman';
      if (!duration) duration = '3h';
      title = 'Barman · ' + (duration || '3h');
    }
    if (/house\s*keep|οικιακ|καθαρίστ/i.test(low)) {
      kind = 'job'; role = 'housekeeper';
      if (!duration) duration = '1w';
      title = 'Housekeeper · ' + (duration || '1w');
    }

    if (!title || title.length < 2) {
      const k = this.KINDS[kind] || this.KINDS.job;
      title = k.icon + ' ' + k.label + (duration ? ' · ' + duration : '');
    }

    return { kind, role, duration, title: title.slice(0, 80), raw };
  },

  meta(kind) {
    return this.KINDS[kind] || this.KINDS.service;
  },

  create(spec) {
    spec = spec || {};
    const u = window._lastPos || { lat: 36.4341, lng: 28.2176 };
    const parsed = spec.rawText ? this.parseSpec(spec.rawText) : null;
    const kind = spec.kind || parsed?.kind || 'delivery';
    const role = spec.role || parsed?.role || this.meta(kind).role;
    const dur = this.parseDuration(spec.duration || parsed?.duration || spec.duration_label);
    const startAt = spec.start_at || Date.now();
    const endAt = spec.end_at || (dur.ms ? startAt + dur.ms : null);
    const km = this.meta(kind);

    const task = {
      id: spec.id || this._id(),
      kind,
      role,
      title: spec.title || parsed?.title || (km.icon + ' ' + km.label),
      status: 'open',
      lat: spec.lat ?? u.lat,
      lng: spec.lng ?? u.lng,
      // Client who posts
      poster_id: Auth?.user?.id || 'local',
      poster_name: Auth?.user?.user_metadata?.full_name
        || Auth?.user?.email?.split?.('@')?.[0] || 'You',
      // Worker / driver / match who claims
      worker_id: null,
      worker_name: null,
      driver_id: null, // alias for delivery DNA
      driver_name: null,
      // Duration DNA
      duration_ms: dur.ms,
      duration_label: dur.label,
      start_at: startAt,
      end_at: endAt,
      // Pay — Astranov Coins is product currency
      rate: spec.rate ?? null,
      rate_unit: spec.rate_unit || 'flat',
      budget: spec.budget ?? null,
      coins: Math.max(0, Math.round(Number(spec.coins ?? spec.budget ?? 0) || 0)),
      currency: spec.currency || 'COINS',
      // Broadcast radius (km) — who sees the accept offer
      radius_km: Math.max(0.2, Math.min(100, Number(spec.radius_km ?? 3) || 3)),
      // Criteria (dating age/looks, roles required, etc.)
      criteria: spec.criteria && typeof spec.criteria === 'object' ? spec.criteria : {},
      // Ordered waypoints for multi-stop routes (polygon + guidance)
      waypoints: this._normalizeWaypoints(spec.waypoints || spec.stops || []),
      waypoint_index: 0,
      route_coords: Array.isArray(spec.route_coords) ? spec.route_coords : [],
      polygon: Array.isArray(spec.polygon) ? spec.polygon : null,
      // Multi-party stage verification (waypoint-aware)
      stages: null,
      stage_index: 0,
      // Commerce links
      vendor_id: spec.vendor_id || null,
      vendor_name: spec.vendor_name || null,
      order_id: spec.order_id || null,
      short_id: spec.short_id || null,
      items: spec.items || [],
      note: spec.note || '',
      // Dating extras
      dating: kind === 'dating' ? {
        vibe: spec.vibe || 'open',
        place_hint: spec.place_hint || '',
        mutual: false,
        age_min: spec.criteria?.age_min ?? spec.age_min ?? null,
        age_max: spec.criteria?.age_max ?? spec.age_max ?? null,
        looks: spec.criteria?.looks || spec.looks || '',
      } : null,
      launched: false,
      coins_held: false,
      coins_settled: false,
      rejected_by: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Merge flat criteria shortcuts
    if (spec.age_min != null) task.criteria.age_min = Number(spec.age_min);
    if (spec.age_max != null) task.criteria.age_max = Number(spec.age_max);
    if (spec.looks) task.criteria.looks = String(spec.looks);
    if (spec.need_role) task.criteria.need_role = String(spec.need_role);
    if (spec.skills) task.criteria.skills = String(spec.skills);
    if (spec.vehicle) task.criteria.vehicle = String(spec.vehicle);
    if (spec.min_rating != null) task.criteria.min_rating = Number(spec.min_rating);

    // Default single pin as first waypoint when none given
    if (!task.waypoints.length && task.lat != null && task.lng != null) {
      task.waypoints = this._normalizeWaypoints([{
        lat: task.lat,
        lng: task.lng,
        label: task.title || 'Task pin',
        coins: task.coins,
        info: task.note || '',
      }]);
    }
    // Sum waypoint coins into task total when poster set per-stop pay
    const wpCoins = task.waypoints.reduce((s, w) => s + (w.coins || 0), 0);
    if (wpCoins > 0 && (!spec.coins || Number(spec.coins) === 0)) {
      task.coins = wpCoins;
    }
    // Anchor task pin at first stop
    if (task.waypoints[0]) {
      task.lat = task.waypoints[0].lat;
      task.lng = task.waypoints[0].lng;
    }
    task.stages = this._buildStages(kind, spec.stages, task.waypoints);
    task.polygon = task.polygon || this.buildPolygon(task.waypoints);

    this.tasks.set(task.id, task);
    this._saveLocal();
    this._showOnGlobe(task);
    FieldBrain?.pulse?.('commerce', task.kind + ' open · ' + task.title, { task });
    AciCli?.print?.(
      'city-task · ' + task.kind + ' · ' + (task.coins || 0) + '🪙 · ' + task.title.slice(0, 36),
      'ok'
    );
    return task;
  },

  _normalizeWaypoints(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((w) => w && w.lat != null && w.lng != null && Number.isFinite(+w.lat) && Number.isFinite(+w.lng))
      .map((w, i) => ({
        id: w.id || ('wp' + i + '_' + Math.random().toString(36).slice(2, 5)),
        lat: +w.lat,
        lng: +w.lng,
        label: String(w.label || w.title || ('Stop ' + (i + 1))).slice(0, 48),
        info: String(w.info || w.note || w.description || '').slice(0, 240),
        coins: Math.max(0, Math.round(Number(w.coins) || 0)),
        action: String(w.action || 'arrive').slice(0, 32),
      }));
  },

  /** Convex hull polygon ring for map corridor design */
  buildPolygon(waypoints) {
    const pts = this._normalizeWaypoints(waypoints);
    if (pts.length < 3) return pts.map((p) => ({ lat: p.lat, lng: p.lng }));
    try {
      if (CityMap?._convexHullLatLng) return CityMap._convexHullLatLng(pts);
    } catch (_) {}
    // Inline fallback hull
    const sorted = pts.slice().sort((a, b) => a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng);
    const cross = (o, a, b) => (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
    const lower = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper).map((p) => ({ lat: p.lat, lng: p.lng }));
  },

  _buildStages(kind, custom, waypoints) {
    if (Array.isArray(custom) && custom.length) {
      return custom.map((s, i) => ({
        id: s.id || ('s' + i),
        label: s.label || s.id || ('Stage ' + (i + 1)),
        poster_ok: !!s.poster_ok,
        worker_ok: !!s.worker_ok,
        at: s.at || null,
        waypoint_index: s.waypoint_index != null ? s.waypoint_index : null,
        coins: s.coins || 0,
        info: s.info || '',
        lat: s.lat,
        lng: s.lng,
      }));
    }
    const wps = this._normalizeWaypoints(waypoints || []);
    // Multi-stop DNA: accepted → each waypoint → done
    if (wps.length >= 2) {
      const stages = [{
        id: 'accepted',
        label: 'accepted',
        poster_ok: false,
        worker_ok: false,
        at: null,
      }];
      wps.forEach((wp, i) => {
        stages.push({
          id: 'wp_' + i,
          label: wp.label || ('Stop ' + (i + 1)),
          poster_ok: false,
          worker_ok: false,
          at: null,
          waypoint_index: i,
          coins: wp.coins || 0,
          info: wp.info || '',
          lat: wp.lat,
          lng: wp.lng,
        });
      });
      stages.push({
        id: 'done',
        label: 'complete',
        poster_ok: false,
        worker_ok: false,
        at: null,
      });
      return stages;
    }
    const ids = this.STAGE_TEMPLATES[kind] || this.STAGE_TEMPLATES.help;
    return ids.map((id) => ({
      id,
      label: id.replace(/_/g, ' '),
      poster_ok: false,
      worker_ok: false,
      at: null,
    }));
  },

  /**
   * Launch task to users in radius who can serve it.
   * Uses BroadcastChannel + localStorage so other tabs/sessions see Accept/Reject.
   * Holds Coins from poster wallet so the offer is funded.
   */
  launch(idOrSpec) {
    let task = typeof idOrSpec === 'string' || idOrSpec?.id
      ? this.get(idOrSpec?.id || idOrSpec)
      : null;
    if (!task && idOrSpec && typeof idOrSpec === 'object') {
      task = this.create(idOrSpec);
    }
    if (!task) return { ok: false, error: 'no task' };

    // Fund offer in Coins (product currency)
    if (task.coins > 0 && !task.coins_held) {
      const hold = this.holdCoins(task.coins, task.id);
      if (!hold.ok) {
        AciCli?.print?.(
          'need ' + hold.needed + '🪙 · available ' + hold.available + '🪙',
          'err'
        );
        return { ok: false, error: hold.error, available: hold.available, needed: hold.needed, task };
      }
      task.coins_held = true;
    }

    task.launched = true;
    task.status = 'open';
    task.updated_at = Date.now();
    this.tasks.set(task.id, task);
    this._saveLocal();
    this._broadcastOffer(task);
    TaskBoard?.showOutgoing?.(task);
    // Poster keeps active panel so they can dual-verify stages later
    TaskBoard?.showActive?.(task);
    try {
      MapDepict?.pulse?.(task.lat, task.lng, 0xffcc44, 'launch ' + task.radius_km + 'km', 12000);
    } catch (_) {}
    FieldBrain?.pulse?.('commerce', 'launched · ' + task.coins + '🪙 · r' + task.radius_km + 'km', { task });
    AciCli?.print?.(
      'task launched · ' + task.title.slice(0, 28) + ' · ' + task.coins + '🪙 · ' + task.radius_km + 'km',
      'ok'
    );
    try {
      window.dispatchEvent(new CustomEvent('astranov-coins', { detail: this.coinsBalance() }));
    } catch (_) {}
    return { ok: true, task, coins: this.coinsBalance() };
  },

  _broadcastOffer(task) {
    const payload = {
      type: 'astranov-task-offer',
      task: {
        id: task.id,
        kind: task.kind,
        role: task.role,
        title: task.title,
        note: task.note,
        coins: task.coins,
        currency: task.currency || 'COINS',
        radius_km: task.radius_km,
        lat: task.lat,
        lng: task.lng,
        criteria: task.criteria || {},
        dating: task.dating,
        poster_id: task.poster_id,
        poster_name: task.poster_name,
        duration_label: task.duration_label,
        stages: task.stages,
        waypoints: task.waypoints || [],
        polygon: task.polygon || null,
        route_coords: task.route_coords || [],
      },
      t: Date.now(),
    };
    try {
      localStorage.setItem('astranov:task-offer-pulse', JSON.stringify(payload));
      // same-tab + multi-tab
      window.dispatchEvent(new CustomEvent('astranov-task-offer', { detail: payload }));
    } catch (_) {}
    try {
      if (!this._bc) this._bc = new BroadcastChannel('astranov-tasks');
      this._bc.postMessage(payload);
    } catch (_) {}
  },

  /** Haversine km */
  distKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  /** Can this local user serve the task? (radius + criteria + not poster) */
  canServe(task, userPos, opts) {
    opts = opts || {};
    if (!task || task.status !== 'open') return false;
    const me = Auth?.user?.id || 'local';
    if (!opts.allowSelf && task.poster_id && task.poster_id === me) return false;
    if (task.rejected_by?.includes?.(me)) return false;
    if (task.worker_id) return false;
    const pos = userPos || window._lastPos;
    if (pos?.lat != null && task.lat != null) {
      const d = this.distKm(pos.lat, pos.lng, task.lat, task.lng);
      if (d > (task.radius_km || 3)) return false;
    }
    const c = task.criteria || {};
    // Dating: age band when profile age known
    if (task.kind === 'dating' || c.age_min || c.age_max) {
      const myAge = Number(Auth?.user?.user_metadata?.age || window._profileAge || 0);
      if (myAge) {
        if (c.age_min && myAge < c.age_min) return false;
        if (c.age_max && myAge > c.age_max) return false;
      }
    }
    // Role / skills criteria (soft when profile empty; hard when profile declares roles)
    const roles = FieldBrain?.roles || Auth?._profileVisual?.roles || MultiTile?._roles || {};
    const roleList = Array.isArray(roles)
      ? roles
      : Object.keys(roles).filter((k) => roles[k]);
    if (c.need_role && roleList.length) {
      const need = String(c.need_role).toLowerCase();
      const has = roleList.some((r) => String(r).toLowerCase().includes(need)
        || need.includes(String(r).toLowerCase()));
      if (!has && !opts.softRole) {
        // Soft: still show offer but TaskBoard notes mismatch
        task._roleMismatch = true;
      }
    }
    // Vehicle for delivery
    if (task.kind === 'delivery' && c.vehicle) {
      const v = String(Auth?._profileVisual?.vehicle || MultiTile?._draft?.vehicle || '').toLowerCase();
      if (v && !v.includes(String(c.vehicle).toLowerCase())) {
        task._vehicleMismatch = true;
      }
    }
    return true;
  },

  reject(id) {
    const task = this.get(id);
    if (!task) return { ok: false, error: 'not found' };
    const me = Auth?.user?.id || 'local';
    if (!task.rejected_by) task.rejected_by = [];
    if (!task.rejected_by.includes(me)) task.rejected_by.push(me);
    task.updated_at = Date.now();
    this.tasks.set(task.id, task);
    this._saveLocal();
    TaskBoard?.dismiss?.(id);
    return { ok: true, task };
  },

  /**
   * Both parties must verify current stage; then auto-advance.
   * party: 'poster' | 'worker'
   * Every stage requires BOTH poster_ok AND worker_ok before progress.
   */
  verifyStage(id, party) {
    const task = this.get(id);
    if (!task || !task.stages?.length) return { ok: false, error: 'no stages' };
    if (['delivered', 'done', 'cancelled'].includes(task.status)) {
      return { ok: false, error: 'already terminal', task };
    }
    const i = Math.min(task.stage_index || 0, task.stages.length - 1);
    const st = task.stages[i];
    if (party === 'poster') st.poster_ok = true;
    else if (party === 'worker') st.worker_ok = true;
    else return { ok: false, error: 'party must be poster|worker' };
    st.at = Date.now();
    task.updated_at = Date.now();

    const both = !!(st.poster_ok && st.worker_ok);
    if (both) {
      // Stage complete only when both parties verified
      const nextIdx = i + 1;
      if (nextIdx >= task.stages.length) {
        // Final stage dual-verified → complete + settle Coins
        task.stage_index = i;
        this.tasks.set(task.id, task);
        this._saveLocal();
        const term = task.kind === 'delivery' ? 'delivered' : 'done';
        const r = this.advance(id, term);
        if (r.ok && r.task) {
          this.settleCoins(r.task);
          TaskBoard?.refreshActive?.(r.task);
          AciCli?.print?.(
            'task complete · ' + (r.task.coins || 0) + '🪙 settled · ' + r.task.title.slice(0, 24),
            'ok'
          );
        }
        return Object.assign(r, { stage: st, both: true, settled: true });
      }
      task.stage_index = nextIdx;
      // Status follows COMPLETED stage (not next) so first dual-verify stays claimed
      const completedId = st.id;
      const statusMap = {
        accepted: 'claimed',
        picked_up: 'picked_up',
        arrived: 'en_route',
        met: 'in_progress',
        in_progress: 'in_progress',
        delivered: 'delivered',
        done: 'done',
      };
      if (statusMap[completedId] && this.STATUSES.includes(statusMap[completedId])) {
        task.status = statusMap[completedId];
      } else if (completedId === 'accepted') {
        task.status = 'claimed';
      } else if (/^wp_/.test(completedId || '') || st.waypoint_index != null) {
        task.status = 'en_route';
      }
      // After dual accept → route worker along waypoints / pin
      if (completedId === 'accepted') {
        this._routeWorkerToTask(task);
        this._broadcastClaimed(task);
      }
      // Waypoint dual-verify → advance route guidance to next stop
      if (st.waypoint_index != null) {
        task.waypoint_index = Math.min(
          (st.waypoint_index + 1),
          Math.max(0, (task.waypoints?.length || 1) - 1)
        );
        this.guideTaskRoute(task);
      }
    }
    this.tasks.set(task.id, task);
    this._saveLocal();
    TaskBoard?.refreshActive?.(task);
    FieldBrain?.pulse?.('act', 'verify · ' + st.label + (both ? ' · both ✓' : ' · waiting other'), { task });
    return { ok: true, task, stage: st, both };
  },

  _broadcastClaimed(task) {
    const payload = {
      type: 'astranov-task-claimed',
      task: {
        id: task.id,
        status: task.status,
        worker_id: task.worker_id,
        worker_name: task.worker_name,
        coins: task.coins,
        stages: task.stages,
        stage_index: task.stage_index,
        lat: task.lat,
        lng: task.lng,
      },
      t: Date.now(),
    };
    try {
      localStorage.setItem('astranov:task-claimed-pulse', JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('astranov-task-claimed', { detail: payload }));
    } catch (_) {}
    try {
      if (!this._bc) this._bc = new BroadcastChannel('astranov-tasks');
      this._bc.postMessage(payload);
    } catch (_) {}
  },

  _routeWorkerToTask(task) {
    return this.guideTaskRoute(task);
  },

  /**
   * Build / refresh multi-stop road route + polygon on map and guide to current waypoint.
   */
  async guideTaskRoute(task, opts) {
    opts = opts || {};
    if (!task) return { ok: false };
    const wps = this._normalizeWaypoints(task.waypoints || []);
    const curIdx = Math.max(
      0,
      task.waypoint_index != null
        ? task.waypoint_index
        : this._waypointIndexFromStage(task)
    );
    task.waypoint_index = curIdx;
    task.polygon = task.polygon || this.buildPolygon(wps.length ? wps : [{ lat: task.lat, lng: task.lng }]);

    const paint = (coords) => {
      task.route_coords = coords || [];
      this.tasks.set(task.id, task);
      this._saveLocal();
      const marked = wps.map((w, i) => ({
        ...w,
        current: i === curIdx,
        done: i < curIdx,
      }));
      try {
        CityMap?.setTaskGeometry?.({
          route: coords,
          waypoints: marked.length ? marked : [{ lat: task.lat, lng: task.lng, label: task.title, current: true }],
          polygon: task.polygon,
        });
      } catch (_) {}
      TaskBoard?.refreshWaypoints?.(task);
    };

    try {
      await LazyModules?.ensure?.().catch(() => {});
    } catch (_) {}

    if (wps.length >= 1 && DrivingView?.setWaypoints) {
      try {
        DrivingView.setWaypoints(wps, { startIndex: curIdx, force: true });
        if (!DrivingView.active && !opts.previewOnly) {
          try { DrivingView.activate?.(); } catch (_) {}
        }
        await DrivingView.fetchMultiWaypointRoute?.();
        paint(DrivingView.routeCoords || []);
      } catch (e) {
        console.warn('[CityTasks] multi route', e);
      }
    } else if (task.lat != null) {
      try {
        DrivingView?.setDestination?.(task.lat, task.lng);
        if (!opts.previewOnly) {
          DrivingView?.activate?.();
          await DrivingView?.fetchRoadRoute?.();
        }
        paint(DrivingView?.routeCoords || []);
      } catch (_) {}
    }

    const cur = wps[curIdx] || { lat: task.lat, lng: task.lng, label: task.title };
    if (cur?.lat != null) {
      MapDepict?.pulse?.(cur.lat, cur.lng, 0x44ffaa, cur.label || 'task', 12000);
      const zl = document.getElementById('zoom-label');
      if (zl && wps.length > 1) {
        zl.textContent = 'Route · stop ' + (curIdx + 1) + '/' + wps.length + ' · ' + (cur.label || '');
      }
    }
    return { ok: true, task, waypoint_index: curIdx, route_len: (task.route_coords || []).length };
  },

  _waypointIndexFromStage(task) {
    const st = task?.stages?.[task.stage_index || 0];
    if (st && st.waypoint_index != null) return st.waypoint_index;
    // Advance wp index past completed waypoint stages
    let idx = 0;
    (task?.stages || []).forEach((s) => {
      if (s.waypoint_index != null && s.poster_ok && s.worker_ok) {
        idx = Math.max(idx, s.waypoint_index + 1);
      }
    });
    return idx;
  },

  /** Preview route/polygon without claiming (poster design) */
  async previewTaskRoute(specOrTask) {
    let task = specOrTask?.id ? this.get(specOrTask.id) : null;
    if (!task && specOrTask) {
      const wps = this._normalizeWaypoints(specOrTask.waypoints || []);
      task = {
        id: 'preview',
        title: specOrTask.title || 'Route preview',
        lat: wps[0]?.lat ?? specOrTask.lat,
        lng: wps[0]?.lng ?? specOrTask.lng,
        waypoints: wps,
        waypoint_index: 0,
        polygon: this.buildPolygon(wps),
        stages: [],
      };
    }
    return this.guideTaskRoute(task, { previewOnly: true });
  },

  /** Post a timed job (barman 3h, housekeeper 1w, …) */
  postJob(spec) {
    const s = typeof spec === 'string' ? this.parseSpec(spec) : (spec || {});
    if (typeof spec === 'string') {
      return this.create({
        kind: s.kind === 'dating' ? 'job' : (s.kind || 'job'),
        role: s.role,
        title: s.title,
        duration: s.duration,
        rawText: spec,
        note: 'job post',
      });
    }
    return this.create({
      kind: s.kind || 'job',
      role: s.role || 'worker',
      title: s.title,
      duration: s.duration || s.duration_label,
      rate: s.rate,
      rate_unit: s.rate_unit || 'hour',
      note: s.note || 'job post',
      lat: s.lat,
      lng: s.lng,
    });
  },

  /** Dating uses same claim DNA — open invite → accept → in progress → done */
  postDate(spec) {
    const s = typeof spec === 'string' ? this.parseSpec(spec) : (spec || {});
    const text = typeof spec === 'string' ? spec : (s.title || s.rawText || 'date');
    const p = this.parseSpec(text);
    return this.create({
      kind: 'dating',
      role: p.role || s.role || 'date',
      title: s.title || p.title || ('💕 Date · ' + (p.duration || s.duration || '2h')),
      duration: s.duration || p.duration || '2h',
      vibe: s.vibe || 'open',
      place_hint: s.place_hint || '',
      note: s.note || 'dating invite',
      lat: s.lat,
      lng: s.lng,
      rawText: text,
    });
  },

  postErrand(spec) {
    const s = typeof spec === 'string' ? this.parseSpec(spec) : (spec || {});
    const text = typeof spec === 'string' ? spec : (s.title || 'errand');
    const p = this.parseSpec(text);
    return this.create({
      kind: 'errand',
      role: p.role || 'errand',
      title: s.title || p.title,
      duration: s.duration || p.duration || '1h',
      note: s.note || 'errand',
      lat: s.lat,
      lng: s.lng,
      rawText: text,
    });
  },

  fromOrder(order, vendor, driver) {
    if (!order) return null;
    const existing = [...this.tasks.values()].find(t => t.order_id === order.id);
    if (existing) {
      existing.status = this._mapOrderStatus(order.status);
      existing.worker_id = driver?.id || order.driver_id || existing.worker_id;
      existing.worker_name = driver?.display_name || driver?.name || existing.worker_name;
      existing.driver_id = existing.worker_id;
      existing.driver_name = existing.worker_name;
      existing.updated_at = Date.now();
      this._saveLocal();
      this._showOnGlobe(existing);
      return existing;
    }
    return this.create({
      kind: 'delivery',
      role: 'driver',
      title: (vendor?.emoji || '📦') + ' ' + (vendor?.name || 'Order') + ' · ' + (order.short_id || order.id?.slice(0, 8)),
      lat: order.delivery_lat,
      lng: order.delivery_lng,
      vendor_id: vendor?.id || order.vendor_id,
      vendor_name: vendor?.name,
      order_id: order.id,
      short_id: order.short_id,
      items: order.items || [],
      duration: '45m',
      note: order.status || '',
    });
  },

  _mapOrderStatus(st) {
    const m = {
      pending: 'open',
      seeking_driver: 'open',
      assigned: 'assigned',
      picked_up: 'picked_up',
      en_route: 'en_route',
      delivered: 'delivered',
      cancelled: 'cancelled',
    };
    return m[st] || 'open';
  },

  /** Terminal statuses share DNA with delivery "delivered" */
  isOpen(t) {
    return t && !['delivered', 'done', 'cancelled'].includes(t.status);
  },

  list(filter) {
    let arr = [...this.tasks.values()].sort((a, b) => b.updated_at - a.updated_at);
    if (filter?.status) arr = arr.filter(t => t.status === filter.status);
    if (filter?.kind) arr = arr.filter(t => t.kind === filter.kind);
    if (filter?.role) arr = arr.filter(t => t.role === filter.role);
    if (filter?.open) arr = arr.filter(t => this.isOpen(t));
    if (filter?.dating) arr = arr.filter(t => t.kind === 'dating');
    if (filter?.jobs) arr = arr.filter(t => t.kind === 'job' || t.kind === 'service');
    return arr;
  },

  get(id) {
    if (!id) return null;
    const q = String(id);
    if (this.tasks.has(q)) return this.tasks.get(q);
    return [...this.tasks.values()].find(t =>
      t.id === q || t.order_id === q || (t.short_id && t.short_id.toUpperCase() === q.toUpperCase())
    ) || null;
  },

  /** Same claim DNA for driver / barman / housekeeper / date */
  async claim(idOrOrder) {
    let task = this.get(idOrOrder);
    if (!task && idOrOrder) {
      const order = await OrderTracking?.fetchOrder?.(idOrOrder);
      if (order) {
        const vendor = await OrderTracking?.resolveVendor?.(order.vendor_id);
        task = this.fromOrder(order, vendor, null);
      }
    }
    if (!task) {
      const open = this.list({ open: true })[0];
      if (open) task = open;
      else {
        const u = window._lastPos || { lat: 36.4341, lng: 28.2176 };
        task = this.create({
          kind: 'delivery',
          title: 'Demo delivery · claim me',
          lat: u.lat + 0.002,
          lng: u.lng - 0.001,
          duration: '45m',
          note: 'local demo',
        });
      }
    }
    if (!this.isOpen(task) && task.status !== 'open' && task.status !== 'assigned') {
      return { ok: false, error: 'not open', task };
    }
    const me = Auth?.user;
    const name = me?.user_metadata?.full_name || me?.email?.split('@')[0] || 'You';
    const id = me?.id || 'local-worker';
    task.status = 'claimed';
    task.worker_id = id;
    task.worker_name = name;
    // Delivery DNA aliases
    task.driver_id = id;
    task.driver_name = name;
    if (!task.start_at) task.start_at = Date.now();
    if (task.duration_ms && !task.end_at) task.end_at = task.start_at + task.duration_ms;
    if (task.kind === 'dating' && task.dating) task.dating.mutual = true;
    // First stage = accepted — worker already ok; poster still must verify (dual-party)
    if (task.stages?.[0]) {
      task.stages[0].worker_ok = true;
      task.stages[0].at = Date.now();
      task.stage_index = 0;
    }
    task.updated_at = Date.now();
    this.tasks.set(task.id, task);
    this._saveLocal();
    this._showOnGlobe(task);
    this._routeWorkerToTask(task);
    this._broadcastClaimed(task);
    TaskBoard?.showActive?.(task);
    TaskBoard?.dismiss?.(task.id);
    const km = this.meta(task.kind);
    FieldBrain?.pulse?.('act', 'claimed · ' + task.title + ' · ' + (task.coins || 0) + '🪙', { task });
    GlobeDeck?.say?.(km.actionClaim + ': ' + task.title, 'ok');
    AciCli?.print?.(
      'city-task · claimed · ' + (task.coins || 0) + '🪙 · ' + task.title.slice(0, 32),
      'ok'
    );

    if (task.order_id && OrderTracking) {
      try {
        OrderTracking.onOrderPlaced?.({
          id: task.order_id,
          short_id: task.short_id,
          status: 'assigned',
          delivery_lat: task.lat,
          delivery_lng: task.lng,
          vendor_id: task.vendor_id,
        }, { id: task.vendor_id, name: task.vendor_name, lat: task.lat, lng: task.lng }, {
          id: task.worker_id,
          name: task.worker_name,
          field_lat: window._lastPos?.lat,
          field_lng: window._lastPos?.lng,
        });
      } catch (_) {}
    }
    return { ok: true, task };
  },

  /** Start work / go en route (delivery DNA mid-state) */
  startWork(id) {
    const task = this.get(id);
    if (!task) return { ok: false, error: 'not found' };
    const next = task.kind === 'delivery' ? 'en_route' : 'in_progress';
    return this.advance(id, next);
  },

  complete(id) {
    const task = this.get(id);
    if (!task) return { ok: false, error: 'not found' };
    // Delivery uses "delivered"; jobs/dating use "done" (also accepted as terminal)
    const st = task.kind === 'delivery' ? 'delivered' : 'done';
    return this.advance(id, st);
  },

  advance(id, status) {
    const task = this.get(id);
    if (!task) return { ok: false, error: 'not found' };
    // Normalize done ↔ delivered for shared DNA
    if (status === 'complete' || status === 'completed' || status === 'finished') {
      status = task.kind === 'delivery' ? 'delivered' : 'done';
    }
    if (!this.STATUSES.includes(status)) return { ok: false, error: 'bad status' };
    task.status = status;
    if (status === 'in_progress' || status === 'en_route') {
      if (!task.start_at) task.start_at = Date.now();
    }
    if (status === 'delivered' || status === 'done') {
      task.end_at = task.end_at || Date.now();
      if (!task.coins_settled && task.coins > 0) {
        this.settleCoins(task);
      }
    }
    if (status === 'cancelled' && task.coins_held && !task.coins_settled) {
      this.releaseHold(task.coins, task.id);
      task.coins_held = false;
    }
    task.updated_at = Date.now();
    this.tasks.set(task.id, task);
    this._saveLocal();
    this._showOnGlobe(task);
    FieldBrain?.pulse?.('commerce', status + ' · ' + task.title, { task });
    AciCli?.print?.('city-task · ' + status + ' · ' + task.id.slice(0, 12), 'ok');
    return { ok: true, task };
  },

  cancel(id) {
    return this.advance(id, 'cancelled');
  },

  /** Simple quote using delivery-style distance + duration */
  quote(taskOrSpec) {
    const t = typeof taskOrSpec === 'string'
      ? this.parseSpec(taskOrSpec)
      : (taskOrSpec || {});
    const dur = this.parseDuration(t.duration || t.duration_label || t.duration_ms);
    const kind = t.kind || 'job';
    const hours = Math.max(dur.ms / 3600000, kind === 'delivery' ? 0.5 : 1);
    let rate = t.rate;
    if (rate == null) {
      if (kind === 'dating') rate = 0; // social — optional tip later
      else if (kind === 'delivery') rate = 3.5;
      else if (kind === 'errand') rate = 12;
      else rate = 15; // €/h default gig
    }
    const base = kind === 'dating' ? 0 : (kind === 'delivery' ? rate : rate * hours);
    const platform = Math.round(base * 0.1 * 100) / 100;
    return {
      kind,
      duration_label: dur.label,
      hours: Math.round(hours * 10) / 10,
      rate,
      labour_eur: Math.round(base * 100) / 100,
      platform_eur: platform,
      total_eur: Math.round((base + platform) * 100) / 100,
      currency: 'EUR',
    };
  },

  _showOnGlobe(task) {
    if (!task || task.lat == null || task.lng == null) return;
    const km = this.meta(task.kind);
    const statusIcon = {
      open: '📋', assigned: '🤝', claimed: '✋',
      picked_up: '📦', en_route: '🛵', in_progress: '⏳',
      delivered: '✅', done: '✅', cancelled: '❌',
    };
    const who = task.worker_name || task.driver_name;
    const dur = task.duration_label && task.duration_label !== 'open'
      ? ' · ' + task.duration_label : '';
    GlobeEntity?.register?.({
      id: 'city-task-' + task.id,
      type: (task.status === 'delivered' || task.status === 'done') ? 'order' : 'pilot',
      lat: task.lat,
      lng: task.lng,
      title: (statusIcon[task.status] || km.icon) + ' ' + (task.title || 'Task').slice(0, 40),
      description: task.kind + dur + (who ? ' · ' + who : ''),
      urgency: task.status === 'open' ? 3 : 2,
      color: km.color,
      persist: true,
      data: { task, alwaysShowLabel: task.status === 'open' },
      _actionLabel: task.status === 'open' ? km.actionClaim : 'Track',
      onTap: () => {
        if (task.status === 'open' || task.status === 'assigned') this.claim(task.id);
        else {
          GlobeControl?.flyToLatLng?.(task.lat, task.lng, task.title, GlobeControl?.Z?.city, {});
          AciCli?.print?.(
            task.kind + ' · ' + task.status + ' · ' + task.duration_label + ' · ' + task.title,
            'ok'
          );
        }
      },
    });
    MapDepict?.pulse?.(task.lat, task.lng, km.color, task.title.slice(0, 24), 6000);
  },

  async startDeliveryFlow(query) {
    await LazyModules?.ensure?.().catch(() => {});
    const u = window._lastPos || { lat: 36.4341, lng: 28.2176 };
    SpaceNetBrain?.crawlArea?.(u.lat, u.lng, 3);
    if (window.Commerce?.openOrderFlow) await Commerce.openOrderFlow(query || '');
    else if (Commerce?.smartOrder) await Commerce.smartOrder(query || 'delivery');
    else if (Commerce?.showPicker) await Commerce.showPicker();
    return this.create({
      kind: 'delivery',
      title: 'Delivery · ' + String(query || 'nearby').slice(0, 40),
      lat: u.lat,
      lng: u.lng,
      duration: '45m',
      note: 'pipeline · shops + drivers',
    });
  },

  catalogPrint() {
    this.CATALOG.forEach(c => {
      AciCli?.print?.(
        c.kind + ' · ' + c.role + ' · ' + c.title + ' · default ' + c.defaultDur,
        'dim'
      );
    });
    return this.CATALOG.length + ' roles';
  },

  wants(text) {
    const low = String(text || '').toLowerCase();
    return /\b(city\s*task|task\s*list|claim\s*(delivery|order|task|job|date)|deliver(y)?\s*(here|now)|assign\s*driver)\b/i.test(low)
      || /\b(barman|bartender|housekeeper|nanny|cleaner|errand|gig|hire|job\s+for|need\s+a)\b/i.test(low)
      || /\b(date|dating|coffee\s*date|dinner\s*date)\b/i.test(low)
      || /^task\b/i.test(low);
  },

  async handleCli(line) {
    const raw = String(line || '').trim();
    const low = raw.toLowerCase();
    const parts = raw.split(/\s+/);

    // Catalog
    if (/\bcatalog|roles|kinds\b/.test(low)) {
      return this.catalogPrint();
    }

    // List filters
    if (/\blist\b/.test(low) || /\btasks?\b/.test(low) && !/create|new|post|claim|hire|date|job/.test(low)) {
      let filter = { open: true };
      if (/dating|date/.test(low)) filter = { open: true, dating: true };
      else if (/job|gig|hire/.test(low)) filter = { open: true, jobs: true };
      else if (/errand/.test(low)) filter = { open: true, kind: 'errand' };
      else if (/deliver/.test(low)) filter = { open: true, kind: 'delivery' };
      const open = this.list(filter);
      if (!open.length) {
        return 'No open tasks · try: task job barman 3h · task date coffee 2h · task errand pharmacy';
      }
      open.slice(0, 10).forEach(t => {
        AciCli?.print?.(
          t.status + ' · ' + t.kind + ' · ' + t.duration_label + ' · ' + t.title.slice(0, 42),
          'ok'
        );
      });
      return open.length + ' open';
    }

    // Dating
    if (/\b(date|dating)\b/.test(low) && !/list|claim/.test(low)) {
      const body = raw.replace(/^(task|city)\s*/i, '').replace(/^(date|dating)\s*/i, '').trim();
      const t = this.postDate(body || 'coffee date 2h');
      const q = this.quote(t);
      return 'Date open · ' + t.title + ' · ' + t.duration_label + (q.total_eur ? '' : ' · social');
    }

    // Job / hire
    if (/\b(job|hire|gig|need\s+a|barman|housekeeper|nanny|cleaner|waiter|cook)\b/.test(low)
      && !/list|claim/.test(low)) {
      const body = raw.replace(/^(task|city)\s*/i, '')
        .replace(/^(job|hire|gig)\s*/i, '').trim();
      const t = this.postJob(body || 'barman 3h');
      const q = this.quote(t);
      return 'Job open · ' + t.title + ' · ' + t.duration_label
        + (q.total_eur ? ' · ~€' + q.total_eur : '');
    }

    // Errand
    if (/\berrand\b/.test(low) && !/list|claim/.test(low)) {
      const body = raw.replace(/^(task|city)\s*/i, '').replace(/^errand\s*/i, '').trim();
      const t = this.postErrand(body || 'pharmacy');
      return 'Errand open · ' + t.title + ' · ' + t.duration_label;
    }

    // Quote
    if (/\bquote|price|cost\b/.test(low)) {
      const body = raw.replace(/^.*?(quote|price|cost)\s*/i, '').trim() || 'barman 3h';
      const q = this.quote(body);
      AciCli?.print?.(
        q.kind + ' · ' + q.duration_label + ' · labour €' + q.labour_eur
        + ' + platform €' + q.platform_eur + ' ≈ €' + q.total_eur,
        'ok'
      );
      return 'Quote €' + q.total_eur;
    }

    // Coins balance
    if (/\b(coins|wallet|balance)\b/.test(low) && !/launch|claim/.test(low)) {
      const b = this.coinsBalance();
      return 'Coins · available ' + b.available + ' · held ' + b.held + ' · balance ' + b.balance;
    }

    // Launch (create + broadcast)
    if (/\blaunch\b/.test(low)) {
      const body = raw.replace(/^.*?\blaunch\b\s*/i, '').trim() || 'help nearby';
      const coinsM = body.match(/(\d+)\s*🪙|(\d+)\s*coins?/i);
      const coins = coinsM ? Number(coinsM[1] || coinsM[2]) : 50;
      const radM = body.match(/(\d+(?:\.\d+)?)\s*km/i);
      const radius_km = radM ? Number(radM[1]) : 3;
      const r = this.launch({
        rawText: body,
        title: body.replace(/\d+\s*(🪙|coins?|km)/gi, '').trim() || body,
        coins,
        radius_km,
      });
      return r.ok
        ? ('Launched · ' + r.task.kind + ' · ' + r.task.coins + '🪙 · r' + r.task.radius_km + 'km')
        : (r.error || 'launch failed');
    }

    // Create generic
    if (/\b(create|new|post)\b/.test(low)) {
      const body = raw.replace(/^.*?(create|new|post)\s*/i, '').trim() || 'City task';
      const t = this.create({ rawText: body, title: undefined });
      return 'Created ' + t.kind + ' · ' + t.id.slice(0, 12) + ' · ' + t.title;
    }

    // Claim
    if (/\b(claim|take|accept|assign)\b/.test(low)) {
      const id = parts.find(p => p.startsWith('ct_') || /^[0-9a-f-]{8,}$/i.test(p));
      const r = await this.claim(id || null);
      return r.ok
        ? ('Claimed · ' + r.task.kind + ' · ' + r.task.duration_label + ' · ' + r.task.title)
        : (r.error || 'claim failed');
    }

    // Progress / complete
    if (/\b(start|en.?route|progress|picked)\b/.test(low)) {
      const id = parts.find(p => this.get(p)) || this.list({ open: true }).find(t => t.worker_id)?.id;
      const r = this.startWork(id);
      return r.ok ? r.task.status : (r.error || 'fail');
    }
    if (/\b(done|complete|finish|deliver(ed)?)\b/.test(low)) {
      const id = parts.find(p => this.get(p))
        || this.list({}).find(t => t.worker_id && this.isOpen(t))?.id;
      const r = this.complete(id);
      return r.ok ? r.task.status : (r.error || 'fail');
    }

    // Delivery shop pipeline
    if (/\b(order|shop|delivery)\b/.test(low)) {
      await this.startDeliveryFlow(raw.replace(/^(task|city)\s*/i, ''));
      return 'Delivery pipeline · shops + task card';
    }

    const open = this.list({ open: true });
    return 'City DNA · open ' + open.length
      + ' · task job barman 3h · task date coffee 2h'
      + ' · task launch · task claim · task catalog';
  },
};
window.CityTasks = CityTasks;

// === TASK BOARD — Accept/Reject offers + multi-party stage UI ===
var TaskBoard = {
  _bound: false,
  _offer: null,
  _active: null,
  _seen: new Set(),

  init() {
    if (this._bound) return;
    this._bound = true;
    this._ensureDom();
    window.addEventListener('astranov-task-offer', (e) => this._onOffer(e.detail));
    window.addEventListener('astranov-task-claimed', (e) => this._onClaimed(e.detail));
    window.addEventListener('storage', (e) => {
      if (!e.newValue) return;
      try {
        if (e.key === 'astranov:task-offer-pulse') this._onOffer(JSON.parse(e.newValue));
        if (e.key === 'astranov:task-claimed-pulse') this._onClaimed(JSON.parse(e.newValue));
      } catch (_) {}
    });
    try {
      const bc = new BroadcastChannel('astranov-tasks');
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'astranov-task-claimed') this._onClaimed(ev.data);
        else this._onOffer(ev.data);
      };
      this._bc = bc;
    } catch (_) {}
    setInterval(() => {
      try {
        const raw = localStorage.getItem('astranov:task-offer-pulse');
        if (!raw) return;
        const p = JSON.parse(raw);
        if (p?.t && Date.now() - p.t < 12000) this._onOffer(p);
      } catch (_) {}
    }, 2500);
  },

  _ensureDom() {
    if (document.getElementById('task-offer-banner')) return;
    const root = document.createElement('div');
    root.id = 'task-board-root';
    root.innerHTML = ''
      + '<div id="task-offer-banner" role="alertdialog" aria-label="Task offer">'
      + '  <div id="to-kind"></div>'
      + '  <div id="to-title"></div>'
      + '  <div id="to-meta"></div>'
      + '  <div id="to-criteria"></div>'
      + '  <div id="to-actions">'
      + '    <button type="button" id="to-accept" class="to-accept">ACCEPT</button>'
      + '    <button type="button" id="to-reject" class="to-reject">REJECT</button>'
      + '  </div>'
      + '</div>'
      + '<div id="task-active-panel">'
      + '  <div id="ta-head"><span id="ta-title">Active task</span><button type="button" id="ta-close">✖</button></div>'
      + '  <div id="ta-body"></div>'
      + '  <div id="ta-scroll">'
      + '    <div id="ta-waypoints" class="ta-waypoints"></div>'
      + '    <div id="ta-stages"></div>'
      + '  </div>'
      + '  <div id="ta-foot">'
      + '    <button type="button" id="ta-verify-poster" class="ta-vp" title="Poster confirms this stage">Poster ✓</button>'
      + '    <button type="button" id="ta-verify-worker" class="ta-vw" title="Worker confirms this stage">Worker ✓</button>'
      + '    <button type="button" id="ta-route">Route</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(root);
    document.getElementById('to-accept')?.addEventListener('click', () => this._accept());
    document.getElementById('to-reject')?.addEventListener('click', () => this._reject());
    document.getElementById('ta-close')?.addEventListener('click', () => this.hideActive());
    document.getElementById('ta-verify-poster')?.addEventListener('click', () => this._verify('poster'));
    document.getElementById('ta-verify-worker')?.addEventListener('click', () => this._verify('worker'));
    document.getElementById('ta-route')?.addEventListener('click', () => {
      if (this._active) CityTasks?.guideTaskRoute?.(this._active);
    });
  },

  _onOffer(payload) {
    if (!payload || payload.type !== 'astranov-task-offer' || !payload.task) return;
    const t = payload.task;
    if (this._seen.has(t.id + ':' + (payload.t || 0))) return;
    this._seen.add(t.id + ':' + (payload.t || 0));
    if (!CityTasks.get(t.id)) {
      CityTasks.create({ ...t, id: t.id, status: 'open', launched: true });
    }
    const full = CityTasks.get(t.id) || t;
    if (!CityTasks.canServe(full)) return;
    this.showOffer(full);
  },

  _onClaimed(payload) {
    if (!payload || payload.type !== 'astranov-task-claimed' || !payload.task) return;
    const t = payload.task;
    const local = CityTasks.get(t.id);
    if (local) {
      local.status = t.status || local.status;
      local.worker_id = t.worker_id || local.worker_id;
      local.worker_name = t.worker_name || local.worker_name;
      if (t.stages) local.stages = t.stages;
      if (t.stage_index != null) local.stage_index = t.stage_index;
      local.updated_at = Date.now();
      CityTasks.tasks.set(local.id, local);
      CityTasks._saveLocal();
      this.dismiss(local.id);
      this.showActive(local);
    }
  },

  showOffer(task) {
    this.init();
    this._offer = task;
    const el = document.getElementById('task-offer-banner');
    if (!el) return;
    const km = CityTasks.meta(task.kind);
    const nWp = (task.waypoints || []).length;
    document.getElementById('to-kind').textContent =
      (km.icon || '📋') + ' ' + (km.label || task.kind) + ' · ' + (task.coins || 0) + ' 🪙'
      + (nWp > 1 ? ' · ' + nWp + ' stops' : '');
    document.getElementById('to-title').textContent = task.title || 'Task';
    document.getElementById('to-meta').textContent =
      'Radius ' + (task.radius_km || 3) + ' km · '
      + (task.duration_label || '') + ' · '
      + (task.poster_name || 'Someone')
      + (task.lat != null ? ' · ' + (+task.lat).toFixed(3) + ',' + (+task.lng).toFixed(3) : '');
    const crit = task.criteria || {};
    const bits = [];
    if (nWp > 1) bits.push(nWp + ' waypoints on map');
    if (crit.age_min || crit.age_max) bits.push('Age ' + (crit.age_min || '?') + '–' + (crit.age_max || '?'));
    if (crit.looks) bits.push('Looks: ' + crit.looks);
    if (crit.need_role || crit.role) bits.push('Need: ' + (crit.need_role || crit.role));
    if (crit.skills) bits.push('Skills: ' + crit.skills);
    if (crit.vehicle) bits.push('Vehicle: ' + crit.vehicle);
    if (crit.min_rating) bits.push('Rating ≥ ' + crit.min_rating);
    if (task.dating?.vibe) bits.push('Vibe: ' + task.dating.vibe);
    if (task.note) bits.push(String(task.note).slice(0, 80));
    document.getElementById('to-criteria').textContent = bits.join(' · ') || 'Open to capable users in map radius';
    el.classList.add('open');
    try {
      if (nWp >= 1) {
        CityMap?.setTaskGeometry?.({
          waypoints: task.waypoints,
          polygon: task.polygon || CityTasks.buildPolygon?.(task.waypoints),
          route: task.route_coords || [],
        });
      }
      MapDepict?.pulse?.(task.lat, task.lng, 0xffcc44, 'task offer', 15000);
    } catch (_) {}
  },

  showOutgoing(task) {
    const zl = document.getElementById('zoom-label');
    if (zl) zl.textContent = 'Launched · ' + (task.coins || 0) + '🪙 · ' + (task.radius_km || 3) + 'km radius';
    const bal = CityTasks.coinsBalance?.();
    if (bal) {
      const el = document.getElementById('mt-coins-bal');
      if (el) el.textContent = bal.available + ' 🪙 available · ' + bal.held + ' held';
    }
  },

  dismiss(id) {
    if (this._offer?.id === id || !id) {
      document.getElementById('task-offer-banner')?.classList.remove('open');
      this._offer = null;
    }
  },

  async _accept() {
    if (!this._offer) return;
    const id = this._offer.id;
    const snapshot = this._offer;
    CityTasks?.init?.();
    const r = await CityTasks.claim(id);
    this.dismiss(id);
    if (r?.ok) {
      const task = r.task || CityTasks.get(id) || snapshot;
      this.showActive(task);
      CityTasks._broadcastClaimed?.(task);
    }
  },

  _reject() {
    if (!this._offer) return;
    const id = this._offer.id;
    CityTasks.reject(id);
    this.dismiss(id);
  },

  showActive(task) {
    this.init();
    this._active = task;
    const el = document.getElementById('task-active-panel');
    if (!el) return;
    const nWp = (task.waypoints || []).length;
    document.getElementById('ta-title').textContent =
      (CityTasks.meta(task.kind).icon || '📋') + ' ' + (task.title || 'Task').slice(0, 28)
      + (nWp > 1 ? ' · ' + nWp + ' stops' : '');
    const body = document.getElementById('ta-body');
    if (body) {
      const st = task.status || 'open';
      body.innerHTML = ''
        + '<div><strong>' + (task.coins || 0) + ' 🪙</strong> · ' + (task.duration_label || '') + ' · ' + st + '</div>'
        + '<div class="ta-dim">' + (task.worker_name || 'waiting worker…') + ' ↔ ' + (task.poster_name || '') + '</div>'
        + '<div class="ta-dim">Every stage needs both Poster ✓ and Worker ✓'
        + (nWp > 1 ? ' · route polygon on map' : '') + '</div>';
    }
    this.refreshActive(task);
    el.classList.add('open');
    // Paint multi-stop route + polygon when panel opens
    if ((task.waypoints || []).length >= 1 || task.lat != null) {
      try { CityTasks.guideTaskRoute?.(task, { previewOnly: task.status === 'open' }); } catch (_) {}
    }
  },

  hideActive() {
    document.getElementById('task-active-panel')?.classList.remove('open');
  },

  refreshWaypoints(task) {
    const box = document.getElementById('ta-waypoints');
    if (!box) return;
    const wps = task?.waypoints || [];
    if (wps.length < 1) {
      box.innerHTML = '';
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const cur = task.waypoint_index || 0;
    box.innerHTML = '<div class="ta-wp-head">Route · ' + wps.length + ' stops · scroll for details</div>'
      + wps.map((w, i) => {
        const done = i < cur;
        const current = i === cur;
        const cls = done ? 'done' : (current ? 'current' : 'pending');
        return '<div class="ta-wp ' + cls + '" data-wp="' + i + '" id="ta-wp-' + i + '">'
          + '<div class="ta-wp-top"><b>' + (i + 1) + '. ' + this._esc(w.label || ('Stop ' + (i + 1))) + '</b>'
          + '<span>' + (w.coins || 0) + '🪙</span></div>'
          + (w.info ? '<div class="ta-wp-info">' + this._esc(w.info) + '</div>' : '')
          + '<div class="ta-wp-ll">' + (+w.lat).toFixed(4) + ', ' + (+w.lng).toFixed(4) + '</div>'
          + '</div>';
      }).join('');
    // Scroll current stop into view
    try {
      const el = document.getElementById('ta-wp-' + cur);
      el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    } catch (_) {}
  },

  _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  refreshActive(task) {
    if (!task) return;
    this._active = task;
    this.refreshWaypoints(task);
    const box = document.getElementById('ta-stages');
    if (!box || !task.stages) return;
    const idx = task.stage_index || 0;
    box.innerHTML = task.stages.map((s, i) => {
      const both = s.poster_ok && s.worker_ok;
      const cur = i === idx && !both;
      const cls = both ? 'done' : (cur ? 'current' : 'pending');
      const coinBit = s.coins ? ' · ' + s.coins + '🪙' : '';
      const infoBit = s.info ? '<div class="ta-stage-info">' + this._esc(s.info) + '</div>' : '';
      return '<div class="ta-stage ' + cls + '" id="ta-stage-' + i + '">'
        + '<div class="ta-stage-row"><b>' + (i + 1) + '. ' + this._esc(s.label || s.id) + coinBit + '</b>'
        + '<span>P:' + (s.poster_ok ? '✓' : '·') + ' W:' + (s.worker_ok ? '✓' : '·') + '</span></div>'
        + infoBit
        + '</div>';
    }).join('');
    try {
      document.getElementById('ta-stage-' + idx)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    } catch (_) {}
    // Update body status line
    const body = document.getElementById('ta-body');
    if (body && task.status) {
      const first = body.querySelector('div');
      if (first) {
        const nWp = (task.waypoints || []).length;
        first.innerHTML = '<strong>' + (task.coins || 0) + ' 🪙</strong> · '
          + (task.duration_label || '') + ' · ' + task.status
          + (nWp > 1 ? ' · stop ' + ((task.waypoint_index || 0) + 1) + '/' + nWp : '')
          + (task.coins_settled ? ' · paid' : '');
      }
    }
  },

  /**
   * Dual-party stage verify.
   * party optional — auto-detect from Auth if omitted; pass poster|worker for explicit demo.
   */
  _verify(party) {
    const task = this._active;
    if (!task) return;
    let p = party;
    if (!p) {
      const me = Auth?.user?.id || 'local';
      if (task.poster_id === me) p = 'poster';
      else if (task.worker_id === me || task.worker_id === 'local-worker') p = 'worker';
      else p = task.worker_id ? 'worker' : 'poster';
    }
    const r = CityTasks.verifyStage(task.id, p);
    if (r?.task) {
      this.refreshActive(r.task);
      if (['delivered', 'done'].includes(r.task.status)) {
        const zl = document.getElementById('zoom-label');
        if (zl) zl.textContent = 'Task complete · ' + (r.task.coins || 0) + '🪙 settled';
        const bal = CityTasks.coinsBalance?.();
        const el = document.getElementById('mt-coins-bal');
        if (el && bal) el.textContent = bal.available + ' 🪙 available · ' + bal.held + ' held';
      }
    }
  },
};
window.TaskBoard = TaskBoard;
try { TaskBoard.init(); } catch (_) {}

/* === 81-spacenet-channel-manager.js === */
// === SPACENET CHANNEL MANAGER — field OS hub for multi-path local life ===
// Original Astranov design. No third-party brand names. No scraped APIs.
// Purpose: one source of truth (place · catalog · offer · work · ledger) on the globe,
// with pluggable *channels* so the same inventory can open on Field, Mesh, walk-in, phone,
// and later signed external pipes — without forking menus or double-booking.
//
// Stands alone as SpaceNet CM. Adapters are abstract contracts only until commercial sign-off.
const SpaceNetCM = {
  version: '20260718-sncm1',
  STORAGE_KEY: 'astranov:spacenet-cm-v1',
  _places: new Map(),
  _catalog: new Map(),
  _offers: new Map(),
  _orders: new Map(),
  _channels: new Map(),
  _adapters: new Map(),
  _listeners: [],
  _inited: false,

  /** Built-in channel kinds — Astranov-native only */
  CHANNEL_KINDS: Object.freeze({
    field: {
      id: 'field',
      label: 'Field (globe)',
      desc: 'Native Astranov map · CLI · voice',
      native: true,
    },
    mesh: {
      id: 'mesh',
      label: 'SpaceNet mesh',
      desc: 'Peer devices · offline-friendly relay',
      native: true,
    },
    walk_in: {
      id: 'walk_in',
      label: 'Walk-in counter',
      desc: 'Physical place · same catalog',
      native: true,
    },
    phone: {
      id: 'phone',
      label: 'Phone / voice',
      desc: 'Call-in · voice order path',
      native: true,
    },
    /** Reserved abstract slot — never name a vendor here */
    pipe: {
      id: 'pipe',
      label: 'External pipe',
      desc: 'Signed adapter after commercial agreement',
      native: false,
      requiresAgreement: true,
    },
  }),

  ORDER_STATES: Object.freeze([
    'draft', 'open', 'accepted', 'preparing', 'ready',
    'assigned', 'en_route', 'fulfilled', 'settled', 'cancelled', 'conflict',
  ]),

  init() {
    if (this._inited) return this;
    this._inited = true;
    window.SpaceNetCM = this;
    this._load();
    this._ensureDefaultChannels();
    this._registerNativeAdapters();
    this._wireCli();
    console.log('%c[SpaceNetCM] channel manager · field hub live', 'color:#00e8ff;font-weight:700');
    return this;
  },

  // ── Identity helpers ─────────────────────────────────────────────
  _id(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  _now() {
    return Date.now();
  },

  _save() {
    try {
      const payload = {
        v: 1,
        places: [...this._places.values()],
        catalog: [...this._catalog.values()],
        offers: [...this._offers.values()],
        orders: [...this._orders.values()].slice(-200),
        channels: [...this._channels.values()],
        at: this._now(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  },

  _load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);
      (j.places || []).forEach((p) => this._places.set(p.id, p));
      (j.catalog || []).forEach((c) => this._catalog.set(c.id, c));
      (j.offers || []).forEach((o) => this._offers.set(o.id, o));
      (j.orders || []).forEach((o) => this._orders.set(o.id, o));
      (j.channels || []).forEach((c) => this._channels.set(c.id, c));
    } catch (_) {}
  },

  _ensureDefaultChannels() {
    const defaults = ['field', 'mesh', 'walk_in', 'phone'];
    defaults.forEach((kind) => {
      const id = 'ch_' + kind;
      if (this._channels.has(id)) return;
      const meta = this.CHANNEL_KINDS[kind];
      this._channels.set(id, {
        id,
        kind,
        label: meta.label,
        enabled: kind === 'field' || kind === 'walk_in',
        priority: kind === 'field' ? 10 : kind === 'walk_in' ? 8 : 5,
        createdAt: this._now(),
      });
    });
    this._save();
  },

  // ── Places (map pins / businesses / venues) ──────────────────────
  upsertPlace(spec) {
    const id = spec.id || this._id('place');
    const prev = this._places.get(id) || {};
    const place = {
      ...prev,
      id,
      name: String(spec.name || prev.name || 'Place').slice(0, 80),
      lat: spec.lat != null ? +spec.lat : prev.lat,
      lng: spec.lng != null ? +spec.lng : prev.lng,
      kind: spec.kind || prev.kind || 'shop', // shop · stay · service · venue · person
      hours: spec.hours || prev.hours || null,
      channels: Array.isArray(spec.channels)
        ? spec.channels
        : (prev.channels || ['ch_field', 'ch_walk_in']),
      meta: { ...(prev.meta || {}), ...(spec.meta || {}) },
      updatedAt: this._now(),
      createdAt: prev.createdAt || this._now(),
    };
    this._places.set(id, place);
    this._save();
    this._emit('place.upsert', place);
    return place;
  },

  listPlaces() {
    return [...this._places.values()];
  },

  getPlace(id) {
    return this._places.get(id) || null;
  },

  // ── Catalog items (menu / services / rooms / gigs — generic SKUs) ─
  upsertCatalogItem(spec) {
    const id = spec.id || this._id('sku');
    const prev = this._catalog.get(id) || {};
    const item = {
      ...prev,
      id,
      placeId: spec.placeId || prev.placeId || null,
      title: String(spec.title || prev.title || 'Item').slice(0, 120),
      kind: spec.kind || prev.kind || 'goods', // goods · service · stay · gig · meet
      price: spec.price != null ? +spec.price : (prev.price ?? 0),
      currency: spec.currency || prev.currency || 'Coins',
      unit: spec.unit || prev.unit || 'each',
      active: spec.active != null ? !!spec.active : (prev.active !== false),
      stock: spec.stock != null ? spec.stock : (prev.stock ?? null), // null = unlimited
      attrs: { ...(prev.attrs || {}), ...(spec.attrs || {}) },
      updatedAt: this._now(),
      createdAt: prev.createdAt || this._now(),
    };
    this._catalog.set(id, item);
    this._save();
    this._emit('catalog.upsert', item);
    return item;
  },

  listCatalog(placeId) {
    const all = [...this._catalog.values()];
    if (!placeId) return all;
    return all.filter((c) => c.placeId === placeId);
  },

  // ── Offers (priced availability windows) ─────────────────────────
  upsertOffer(spec) {
    const id = spec.id || this._id('offer');
    const prev = this._offers.get(id) || {};
    const offer = {
      ...prev,
      id,
      skuId: spec.skuId || prev.skuId,
      placeId: spec.placeId || prev.placeId,
      channelIds: Array.isArray(spec.channelIds)
        ? spec.channelIds
        : (prev.channelIds || ['ch_field']),
      qty: spec.qty != null ? +spec.qty : (prev.qty ?? 1),
      price: spec.price != null ? +spec.price : prev.price,
      windowStart: spec.windowStart || prev.windowStart || null,
      windowEnd: spec.windowEnd || prev.windowEnd || null,
      open: spec.open != null ? !!spec.open : (prev.open !== false),
      updatedAt: this._now(),
      createdAt: prev.createdAt || this._now(),
    };
    this._offers.set(id, offer);
    this._save();
    this._emit('offer.upsert', offer);
    return offer;
  },

  listOffers(filter) {
    let list = [...this._offers.values()];
    if (filter?.placeId) list = list.filter((o) => o.placeId === filter.placeId);
    if (filter?.channelId) list = list.filter((o) => (o.channelIds || []).includes(filter.channelId));
    if (filter?.openOnly) list = list.filter((o) => o.open);
    return list;
  },

  // ── Channels ─────────────────────────────────────────────────────
  listChannels() {
    return [...this._channels.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  },

  setChannelEnabled(channelId, enabled) {
    const ch = this._channels.get(channelId);
    if (!ch) return null;
    if (ch.kind === 'pipe' && enabled && !ch.agreementId) {
      // External pipes stay dark until a signed agreement id is attached
      this._emit('channel.blocked', { channelId, reason: 'agreement_required' });
      return ch;
    }
    ch.enabled = !!enabled;
    ch.updatedAt = this._now();
    this._channels.set(channelId, ch);
    this._save();
    this._emit('channel.update', ch);
    return ch;
  },

  /**
   * Register a future external pipe (abstract). No vendor branding.
   * agreementId must be set before enable.
   */
  registerPipeChannel(spec) {
    const id = spec.id || this._id('ch_pipe');
    const ch = {
      id,
      kind: 'pipe',
      label: String(spec.label || 'External pipe').slice(0, 60),
      enabled: false,
      priority: spec.priority ?? 3,
      agreementId: spec.agreementId || null,
      adapterId: spec.adapterId || null,
      createdAt: this._now(),
    };
    this._channels.set(id, ch);
    this._save();
    this._emit('channel.register', ch);
    return ch;
  },

  // ── Orders / bookings (unified work unit) ────────────────────────
  createOrder(spec) {
    const id = spec.id || this._id('ord');
    const order = {
      id,
      placeId: spec.placeId || null,
      channelId: spec.channelId || 'ch_field',
      lines: Array.isArray(spec.lines) ? spec.lines : [],
      state: 'open',
      lat: spec.lat ?? null,
      lng: spec.lng ?? null,
      actorId: spec.actorId || null,
      taskKind: spec.taskKind || null, // optional CityTasks kind mirror
      total: spec.total != null ? +spec.total : this._sumLines(spec.lines),
      currency: spec.currency || 'Coins',
      externalRef: null, // filled only by signed adapters later
      history: [{ state: 'open', at: this._now() }],
      createdAt: this._now(),
      updatedAt: this._now(),
    };
    // Availability guard
    const conflict = this._checkOversell(order);
    if (conflict) {
      order.state = 'conflict';
      order.history.push({ state: 'conflict', at: this._now(), detail: conflict });
    }
    this._orders.set(id, order);
    this._save();
    this._emit('order.create', order);

    // Native field path: optional CityTasks mirror for fulfillment DNA
    if (order.state === 'open' && order.channelId === 'ch_field' && order.taskKind) {
      try {
        CityTasks?.init?.();
        CityTasks?.create?.({
          kind: order.taskKind,
          title: order.lines?.[0]?.title || 'Field order',
          lat: order.lat,
          lng: order.lng,
          meta: { spacenetOrderId: id },
        });
      } catch (_) {}
    }

    // Push to enabled adapters (native no-ops are fine)
    void this._dispatchOrder(order);
    return order;
  },

  _sumLines(lines) {
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((s, l) => s + (+l.price || 0) * (+l.qty || 1), 0);
  },

  _checkOversell(order) {
    for (const line of order.lines || []) {
      if (!line.skuId) continue;
      const sku = this._catalog.get(line.skuId);
      if (!sku || sku.stock == null) continue;
      if (sku.stock < (line.qty || 1)) {
        return 'insufficient_stock:' + sku.id;
      }
    }
    return null;
  },

  transitionOrder(orderId, nextState, detail) {
    const order = this._orders.get(orderId);
    if (!order) return null;
    if (!this.ORDER_STATES.includes(nextState)) return order;
    order.state = nextState;
    order.updatedAt = this._now();
    order.history.push({ state: nextState, at: order.updatedAt, detail: detail || null });
    // Stock decrement on fulfill
    if (nextState === 'fulfilled') {
      (order.lines || []).forEach((line) => {
        const sku = line.skuId && this._catalog.get(line.skuId);
        if (sku && sku.stock != null) {
          sku.stock = Math.max(0, sku.stock - (line.qty || 1));
          sku.updatedAt = this._now();
          this._catalog.set(sku.id, sku);
        }
      });
    }
    this._orders.set(orderId, order);
    this._save();
    this._emit('order.transition', order);
    void this._dispatchOrder(order);
    return order;
  },

  listOrders(filter) {
    let list = [...this._orders.values()];
    if (filter?.placeId) list = list.filter((o) => o.placeId === filter.placeId);
    if (filter?.channelId) list = list.filter((o) => o.channelId === filter.channelId);
    if (filter?.state) list = list.filter((o) => o.state === filter.state);
    return list.sort((a, b) => b.createdAt - a.createdAt);
  },

  // ── Publish catalog snapshot to all enabled channels ─────────────
  async publishPlace(placeId) {
    const place = this._places.get(placeId);
    if (!place) return { error: 'no_place' };
    const catalog = this.listCatalog(placeId).filter((c) => c.active);
    const offers = this.listOffers({ placeId, openOnly: true });
    const snapshot = { place, catalog, offers, at: this._now() };
    const results = [];
    for (const chId of place.channels || []) {
      const ch = this._channels.get(chId);
      if (!ch?.enabled) continue;
      const adapter = this._adapterFor(ch);
      if (!adapter?.publish) continue;
      try {
        const r = await adapter.publish(snapshot, ch);
        results.push({ channelId: chId, ok: true, result: r });
      } catch (e) {
        results.push({ channelId: chId, ok: false, error: String(e.message || e) });
      }
    }
    this._emit('publish', { placeId, results });
    return { placeId, results };
  },

  // ── Adapter contract (abstract — no brands) ──────────────────────
  /**
   * Register an adapter implementation.
   * @param {string} id
   * @param {{ publish?: Function, ingestOrder?: Function, capabilities?: string[] }} adapter
   */
  registerAdapter(id, adapter) {
    if (!id || !adapter) return;
    this._adapters.set(id, adapter);
    this._emit('adapter.register', { id });
  },

  _adapterFor(channel) {
    if (!channel) return null;
    if (channel.kind === 'field') return this._adapters.get('native_field');
    if (channel.kind === 'mesh') return this._adapters.get('native_mesh');
    if (channel.kind === 'walk_in') return this._adapters.get('native_walk_in');
    if (channel.kind === 'phone') return this._adapters.get('native_phone');
    if (channel.adapterId) return this._adapters.get(channel.adapterId);
    return null;
  },

  _registerNativeAdapters() {
    this.registerAdapter('native_field', {
      capabilities: ['publish', 'orders'],
      async publish(snapshot) {
        // Surface on globe via MapDepict pulse — field is home channel
        try {
          const p = snapshot.place;
          if (p?.lat != null) {
            MapDepict?.pulse?.(p.lat, p.lng, 0x00e8ff, p.name || 'place', 6000);
            MapDepict?.action?.('vendor', {
              lat: p.lat, lng: p.lng,
              detail: (snapshot.catalog?.length || 0) + ' items · field',
            });
          }
        } catch (_) {}
        return { channel: 'field', items: snapshot.catalog?.length || 0 };
      },
      async ingestOrder() { /* field orders created in-app */ },
    });

    this.registerAdapter('native_mesh', {
      capabilities: ['publish'],
      async publish(snapshot) {
        try {
          // Announce availability on BroadcastChannel mesh if present
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('astranov-spacenet-cm-v1');
            bc.postMessage({ type: 'catalog_snapshot', snapshot, at: Date.now() });
            bc.close();
          }
        } catch (_) {}
        return { channel: 'mesh', relayed: true };
      },
    });

    this.registerAdapter('native_walk_in', {
      capabilities: ['publish', 'orders'],
      async publish(snapshot) {
        return { channel: 'walk_in', items: snapshot.catalog?.length || 0, note: 'counter uses same catalog' };
      },
    });

    this.registerAdapter('native_phone', {
      capabilities: ['orders'],
      async publish() {
        return { channel: 'phone', note: 'voice path shares catalog ids' };
      },
    });

    // Placeholder: external pipe adapter must be registered after agreement
    this.registerAdapter('pipe_stub', {
      capabilities: [],
      async publish() {
        throw new Error('pipe_requires_signed_agreement');
      },
    });
  },

  async _dispatchOrder(order) {
    const ch = this._channels.get(order.channelId);
    const adapter = this._adapterFor(ch);
    if (!adapter) return;
    try {
      if (typeof adapter.onOrder === 'function') await adapter.onOrder(order, ch);
    } catch (e) {
      this._emit('order.dispatch_error', { orderId: order.id, error: String(e.message || e) });
    }
  },

  // ── Events ───────────────────────────────────────────────────────
  on(fn) {
    if (typeof fn === 'function') this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((f) => f !== fn);
    };
  },

  _emit(type, payload) {
    this._listeners.forEach((fn) => {
      try { fn({ type, payload, at: this._now() }); } catch (_) {}
    });
  },

  // ── Status / CLI ─────────────────────────────────────────────────
  status() {
    return {
      version: this.version,
      places: this._places.size,
      catalog: this._catalog.size,
      offers: this._offers.size,
      orders: this._orders.size,
      channels: this.listChannels().map((c) => ({
        id: c.id,
        kind: c.kind,
        label: c.label,
        enabled: !!c.enabled,
        agreement: c.agreementId ? 'set' : (c.kind === 'pipe' ? 'required' : 'n/a'),
      })),
    };
  },

  /** Seed a demo local place for field testing — original sample data only */
  seedLocalDemo(lat, lng) {
    const place = this.upsertPlace({
      name: 'Field kitchen',
      lat: lat ?? window._lastPos?.lat ?? 36.43,
      lng: lng ?? window._lastPos?.lng ?? 28.22,
      kind: 'shop',
      channels: ['ch_field', 'ch_walk_in', 'ch_phone', 'ch_mesh'],
    });
    const a = this.upsertCatalogItem({
      placeId: place.id, title: 'House plate', kind: 'goods', price: 8, stock: 20,
    });
    const b = this.upsertCatalogItem({
      placeId: place.id, title: 'Cold drink', kind: 'goods', price: 2, stock: 50,
    });
    this.upsertOffer({
      placeId: place.id, skuId: a.id, channelIds: ['ch_field', 'ch_walk_in', 'ch_phone'], qty: 20, price: 8,
    });
    this.upsertOffer({
      placeId: place.id, skuId: b.id, channelIds: ['ch_field', 'ch_walk_in'], qty: 50, price: 2,
    });
    void this.publishPlace(place.id);
    return place;
  },

  createFieldOrder(placeId, lines, opts) {
    opts = opts || {};
    return this.createOrder({
      placeId,
      channelId: opts.channelId || 'ch_field',
      lines,
      lat: opts.lat ?? window._lastPos?.lat,
      lng: opts.lng ?? window._lastPos?.lng,
      taskKind: opts.taskKind || 'delivery',
    });
  },

  _wireCli() {
    // Lightweight hook — SuperCli / CoreBrain can call SpaceNetCM.handleCli
  },

  wants(text) {
    return /\b(channel|channels|spacenet\s*cm|catalog|publish\s*place|field\s*kitchen)\b/i.test(String(text || ''));
  },

  handleCli(line) {
    this.init();
    const low = String(line || '').trim().toLowerCase();
    const parts = low.split(/\s+/);

    if (/status|stat/.test(parts[1] || parts[0]) || parts[0] === 'channels' && !parts[1]) {
      const s = this.status();
      const lines = [
        'SpaceNet CM · places ' + s.places + ' · catalog ' + s.catalog + ' · orders ' + s.orders,
        ...s.channels.map((c) =>
          (c.enabled ? '●' : '○') + ' ' + c.label + ' [' + c.kind + ']'
          + (c.agreement === 'required' ? ' · agreement needed' : '')
        ),
      ];
      lines.forEach((t) => AciCli?.print?.(t, 'ok'));
      return lines.join('\n');
    }

    if (/seed|demo/.test(low)) {
      const p = this.seedLocalDemo();
      AciCli?.print?.('seeded · ' + p.name + ' · ' + p.id, 'ok');
      GlobeDeck?.setPreview?.('Field kitchen on map · SpaceNet CM');
      return 'seeded ' + p.id;
    }

    if (/publish/.test(low)) {
      const places = this.listPlaces();
      if (!places.length) {
        AciCli?.print?.('no places — try: channels seed', 'dim');
        return 'no places';
      }
      const id = places[0].id;
      void this.publishPlace(id).then((r) => {
        AciCli?.print?.('published · ' + id + ' · ' + (r.results?.length || 0) + ' channel(s)', 'ok');
      });
      return 'publishing ' + id;
    }

    if (/order/.test(low)) {
      const places = this.listPlaces();
      const catalog = places[0] ? this.listCatalog(places[0].id) : [];
      if (!places.length || !catalog.length) {
        this.seedLocalDemo();
      }
      const p = this.listPlaces()[0];
      const sku = this.listCatalog(p.id)[0];
      const ord = this.createFieldOrder(p.id, [{ skuId: sku.id, title: sku.title, price: sku.price, qty: 1 }]);
      AciCli?.print?.('order ' + ord.id + ' · ' + ord.state + ' · ' + ord.total + ' ' + ord.currency, 'ok');
      return ord.id;
    }

    if (/enable|on/.test(low)) {
      const kind = (parts.find((p) => ['field', 'mesh', 'walk_in', 'phone'].includes(p)) || 'mesh');
      this.setChannelEnabled('ch_' + kind, true);
      AciCli?.print?.('channel on · ' + kind, 'ok');
      return 'on ' + kind;
    }

    if (/disable|off/.test(low)) {
      const kind = (parts.find((p) => ['field', 'mesh', 'walk_in', 'phone', 'pipe'].includes(p)) || 'mesh');
      this.setChannelEnabled('ch_' + kind, false);
      AciCli?.print?.('channel off · ' + kind, 'ok');
      return 'off ' + kind;
    }

    AciCli?.print?.('channels status | seed | publish | order | enable mesh | disable phone', 'dim');
    return 'SpaceNet CM help';
  },
};

window.SpaceNetCM = SpaceNetCM;

/* === 22-astranov-core-brain.js === */
// === ASTRANOV CORE BRAIN — local-first globe agent + fast AI ===
// Rebuild 2026-07-16: freeform chat was dying as "unknown — try help".
// Design: act on the globe immediately → answer in-app → enrich with AI when ready.
// Never wait 80s for edge before the user sees a result.
const AstranovCoreBrain = {
  version: '20260716-core',
  history: [],
  busy: false,
  AI_TIMEOUT_MS: 14000,
  CITIES: {
    athens: [37.9838, 23.7275], athina: [37.9838, 23.7275],
    rhodes: [36.4341, 28.2176], rodos: [36.4341, 28.2176],
    thessaloniki: [40.6401, 22.9444], salonika: [40.6401, 22.9444],
    london: [51.5074, -0.1278], paris: [48.8566, 2.3522],
    berlin: [52.52, 13.405], rome: [41.9028, 12.4964],
    newyork: [40.7128, -74.006], tokyo: [35.6762, 139.6503],
    istanbul: [41.0082, 28.9784], cairo: [30.0444, 31.2357],
    dubai: [25.2048, 55.2708], sydney: [-33.8688, 151.2093],
  },

  init() {
    if (this._inited) return;
    this._inited = true;
    window.AstranovCoreBrain = this;
    console.log('%c[AstranovCoreBrain] local-first globe agent live', 'color:#00e8ff;font-weight:700');
  },

  userPos() {
    return window._lastPos || { lat: 36.4341, lng: 28.2176 };
  },

  /** Classify intent → globe tools. Always runnable offline. */
  plan(message) {
    const m = String(message || '').trim();
    const low = m.toLowerCase();
    const greek = /[\u0370-\u03FF]/.test(m);
    const actions = [];
    let intent = 'chat';

    // Locate / me
    if (/locate|where am i|find me|gps|βρες με|πού είμαι|που ειμαι|🎯|📍/i.test(low)
      || /^(me|here)$/i.test(low)) {
      intent = 'locate';
      actions.push({ type: 'locate' });
    }

    // City map
    if (/city\s*(view|map|level)?|street\s*view|πόλη|πολη|καταστήματα|shops near/i.test(low)
      && !/locate|where am i/i.test(low)) {
      intent = 'city';
      actions.push({ type: 'city' });
    }

    // Fly to named city
    for (const [name, ll] of Object.entries(this.CITIES)) {
      if (new RegExp('\\b' + name + '\\b', 'i').test(low)
        || (name === 'athens' && /αθήνα|αθηνα|αθ[ήη]να/.test(low))
        || (name === 'rhodes' && /ρόδο|ροδο|ρόδος/.test(low))) {
        intent = 'fly';
        actions.push({ type: 'fly', lat: ll[0], lng: ll[1], label: name });
        break;
      }
    }

    // Zoom tiers
    if (/\b(global|earth|world|κόσμος|κοσμος)\b/i.test(low) && /zoom|show|go|view|δείξε|δειξε/i.test(low)) {
      intent = 'zoom';
      actions.push({ type: 'zoom', tier: 'global' });
    } else if (/\bnational|country|χώρα|χωρα\b/i.test(low) && /zoom|view|go/i.test(low)) {
      intent = 'zoom';
      actions.push({ type: 'zoom', tier: 'national' });
    } else if (/\bsolar|galaxy|space|διάστημα|διαστημα\b/i.test(low) && /zoom|view|go|show/i.test(low)) {
      intent = 'zoom';
      actions.push({ type: 'zoom', tier: 'solar' });
    }

    // Order / shops
    if (/order|buy|shop|vendor|παραγγελ|φαγητ|πίτα|πιτα|gyro|delivery|deliver/i.test(low)) {
      intent = 'commerce';
      actions.push({ type: 'commerce', query: m });
    }

    // News
    if (/news|ειδήσ|ειδησ|headline/i.test(low)) {
      intent = 'news';
      actions.push({ type: 'news' });
    }

    // Think / evolve brain visuals
    if (/think|evolve|brain|μυαλό|μυαλο|εξέλιξ|εξελιξ/i.test(low) && m.length < 80) {
      intent = intent === 'chat' ? 'brain' : intent;
      actions.push({ type: 'brain_pulse', mode: /evolve|εξέλιξ/i.test(low) ? 'evolve' : 'think' });
    }

    // SpaceX / video tiles on globe
    if (/spacex\s*video|video\s*tile|globe\s*video|show\s*spacex|tiles?\s*on\s*globe/i.test(low)
      || (/spacex/.test(low) && /video|watch|live|tile/.test(low))) {
      intent = 'video_tiles';
      actions.push({ type: 'video_tiles', query: m });
    }

    // Starship Flight 13 sim
    if (/starship|flight\s*13|f13|starbase\s*launch|ift[\s-]*13/i.test(low)) {
      intent = 'starship';
      actions.push({ type: 'starship', query: m });
    }

    // Starlink / SpaceX sats on globe
    if (/starlink|spacex\s*sat|leo\s*constellation|satellite\s*(map|orbit|show)|constellation/i.test(low)
      && !/starship|flight\s*13/i.test(low)) {
      intent = 'starlink';
      actions.push({ type: 'starlink', query: m });
    }

    // Resource monitor / donate
    if (/\b(resource|resources|donate|donation|monitor|cpu\s*share|max\s*load)\b/i.test(low)) {
      intent = 'resources';
      actions.push({ type: 'resources', query: m });
    }

    // SpaceNet channel manager (field hub — no third-party brands)
    if (/\b(channels?|spacenet\s*cm|field\s*kitchen|publish\s*place|catalog\s*sync)\b/i.test(low)
      || /^cm\b/i.test(low)) {
      intent = 'spacenet_cm';
      actions.push({ type: 'spacenet_cm', query: m });
    }

    // SpaceNet crawlers
    if (/spacenet|crawl(er|ers)?|ingest|scan\s*(city|area|sector)/i.test(low)
      && intent !== 'spacenet_cm') {
      intent = 'spacenet';
      actions.push({ type: 'spacenet', query: m });
    }

    // City tasks DNA: delivery · jobs · errands · dating
    if (/\b(city\s*task|task\s*list|claim\s*(delivery|order|task|job|date)|assign\s*driver)\b/i.test(low)
      || (/^task\b/i.test(low))
      || /\b(barman|bartender|housekeeper|nanny|cleaner|errand|hire\s+a|need\s+a\s+\w+)\b/i.test(low)
      || /\b(date|dating|coffee\s*date|dinner\s*date)\b/i.test(low)
      || /\b(gig|job\s+for|work\s+for\s+\d)\b/i.test(low)) {
      intent = 'city_task';
      actions.push({ type: 'city_task', query: m });
    }

    // Hello / ping — no globe required
    if (/^(hi|hello|hey|ping|γεια|γεια σου|είσαι εκεί|eisai ekei)\b/i.test(low) || this._isPing(m)) {
      intent = 'ping';
    }

    return { message: m, low, greek, intent, actions };
  },

  _isPing(m) {
    const s = String(m || '').trim();
    if (!s || s.length > 60) return false;
    return /^(are you there|you there|hello|hi|hey|ping|online|listening|grok|astranov|γεια|είσαι|ακούς|παρών|εδώ)/i.test(s);
  },

  async execute(plan) {
    const results = [];
    for (const a of plan.actions) {
      try {
        if (a.type === 'locate') {
          AIGraphics?.setThinkPulse?.(true);
          MapDepict?.action?.('location', { detail: 'locate' });
          if (typeof SuperCli?.run === 'function') await SuperCli.run('locate');
          else if (CityLife?.locateAndDropIn) await CityLife.locateAndDropIn();
          else if (window._lastPos) {
            GlobeControl?.flyToLatLng?.(window._lastPos.lat, window._lastPos.lng, 'you', GlobeControl?.Z?.national, {});
          }
          results.push('located');
        } else if (a.type === 'city') {
          const p = this.userPos();
          MapDepict?.pulse?.(p.lat, p.lng, 0x00e8ff, 'city', 8000);
          await enterCityView?.(p.lat, p.lng);
          results.push('city map');
        } else if (a.type === 'fly') {
          AIGraphics?.flyAstranovTo?.(a.lat, a.lng, { color: 0x3d9eff });
          GlobeControl?.flyToLatLng?.(a.lat, a.lng, a.label, GlobeControl?.Z?.national, {});
          MapDepict?.pulse?.(a.lat, a.lng, 0x00ddff, a.label, 10000);
          MapDepict?.action?.('explore', { lat: a.lat, lng: a.lng, detail: a.label });
          results.push('flew to ' + a.label);
        } else if (a.type === 'zoom') {
          ZoomTiers?.goTo?.(a.tier, true);
          results.push('zoom ' + a.tier);
        } else if (a.type === 'commerce') {
          MapDepict?.action?.('order', { detail: a.query?.slice(0, 40) });
          await LazyModules?.ensure?.();
          if (window.Commerce?.openOrderFlow) await Commerce.openOrderFlow(a.query || '');
          else if (Commerce?.showPicker) await Commerce.showPicker();
          results.push('shops');
        } else if (a.type === 'news') {
          MapDepict?.action?.('news', {});
          Comms?.loadNews?.();
          results.push('news');
        } else if (a.type === 'brain_pulse') {
          const p = this.userPos();
          MapDepict?.action?.(a.mode === 'evolve' ? 'evolve' : 'think', { lat: p.lat, lng: p.lng, detail: plan.message.slice(0, 40) });
          AIGraphics?.setThinkPulse?.(true);
          AIGraphics?.showNeural?.(true);
          if (a.mode === 'evolve') ACI?.evolve?.(plan.message).catch(() => {});
          else ACI?.pulse?.(1.6);
          results.push(a.mode);
        } else if (a.type === 'video_tiles') {
          GlobeInfoTiles?.init?.();
          const msg = await GlobeInfoTiles?.handleCli?.(a.query || 'spacex');
          results.push(msg || 'video tiles');
        } else if (a.type === 'starship') {
          StarshipFlight13?.init?.();
          GlobeInfoTiles?.init?.();
          void GlobeInfoTiles?.refreshSpaceXVideos?.({ fly: false });
          const msg = await StarshipFlight13?.handleCli?.(a.query || 'starship');
          results.push(msg || 'starship f13');
        } else if (a.type === 'starlink') {
          StarlinkConstellation?.init?.();
          const msg = await StarlinkConstellation?.handleCli?.(a.query || 'starlink');
          results.push(msg || 'starlink');
        } else if (a.type === 'resources') {
          ResourceMonitor?.init?.();
          const msg = ResourceMonitor?.handleCli?.(a.query || 'resources');
          results.push(msg || 'resources');
        } else if (a.type === 'spacenet_cm') {
          SpaceNetCM?.init?.();
          const msg = SpaceNetCM?.handleCli?.(a.query || 'channels status');
          results.push(msg || 'spacenet cm');
        } else if (a.type === 'spacenet') {
          const p = this.userPos();
          const msg = await SpaceNetBrain?.handleCli?.(a.query || 'crawl');
          void SpaceNetBrain?.crawlAll?.(p.lat, p.lng, 3, { force: /force|now/i.test(a.query || '') });
          results.push(msg || 'spacenet crawl');
        } else if (a.type === 'city_task') {
          CityTasks?.init?.();
          const msg = await CityTasks?.handleCli?.(a.query || 'task list');
          results.push(msg || 'city task');
        }
      } catch (e) {
        results.push(a.type + ' failed');
      }
    }
    return results;
  },

  localReply(plan, actionResults) {
    const greek = plan.greek;
    const acted = (actionResults || []).filter(Boolean);
    if (plan.intent === 'ping') {
      return greek
        ? 'Ναι — Astranov εδώ. Μίλα κανονικά: locate, Athens, order, ή ό,τι θες στο globe.'
        : 'Yes — Astranov online. Speak or type: locate, fly Athens, order, zoom global.';
    }
    if (acted.length) {
      const what = acted.join(' · ');
      return greek
        ? 'Έγινε στο globe: ' + what + '. Πες επόμενο βήμα.'
        : 'Done on the globe: ' + what + '. What next?';
    }
    if (plan.intent === 'chat') {
      return greek
        ? 'Άκουσα: «' + plan.message.slice(0, 80) + '». Σκέφτομαι… (μπορείς locate / fly / order χωρίς AI).'
        : 'Got it: «' + plan.message.slice(0, 80) + '». Thinking… (you can also say locate / fly / order).';
    }
    return greek ? 'Εντάξει — πες locate, fly, order, ή ρώτα με.' : 'OK — say locate, fly, order, or ask me anything.';
  },

  /** Fast AI via aicycle (lighter than aci coders_chat). Race timeout. */
  async askAi(message, plan) {
    const headers = await (Auth?.authHeaders?.() || Promise.resolve({
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
    }));
    const systemBits = [
      'You are Astranov — SpaceNet globe OS AI. Spartan, real, same language as user.',
      'User can act on a 3D Earth (locate, fly cities, order, zoom).',
      'If they asked something you cannot do in text, say the CLI phrase they should type.',
      'Max 2 short sentences. No markdown lists.',
    ];
    if (plan.actions.length) {
      systemBits.push('Already executed on globe: ' + plan.actions.map(a => a.type).join(', ') + '. Confirm briefly.');
    }
    const body = {
      mode: 'chat',
      message: String(message).slice(0, 900),
      system: systemBits.join(' '),
      history: this.history.slice(-6),
      fast: true,
      fallback_prefs: { force: 'groq', skip: [] },
    };
    const url = (typeof SB_URL !== 'undefined' ? SB_URL : ACI?.url) + '/functions/v1/aicycle';
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => { try { ctrl?.abort(); } catch (_) {} }, this.AI_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', apikey: headers.apikey || SB_KEY },
        body: JSON.stringify(body),
        signal: ctrl?.signal,
      });
      const j = await r.json().catch(() => ({}));
      const text = String(j.text || j.response || '').trim();
      if (!text || /gathering itself|warming up|try again|no model/i.test(text)) return null;
      return { text: text.slice(0, 500), via: j.via || j.provider || 'aicycle' };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  deliver(text, opts = {}) {
    const shown = String(text || '').slice(0, 500);
    if (!shown) return;
    AciCli?.print?.(shown, opts.kind || 'reply');
    ACIControl?.reply?.(shown.slice(0, 280));
    GlobeDeck?.setPreview?.(shown.slice(0, 140));
    CliRibbon?.setNotice?.(shown.slice(0, 100), opts.kind === 'err' ? 'err' : 'ready');
    CliRibbon?.setActive?.('Astranov');
    if (opts.speak && (window._handsFreeVoice || voiceSessionActive) && Voice?.shouldSpeak?.(shown)) {
      speak(shown.slice(0, 160), () => resumeListening?.(), false);
    } else if (window._handsFreeVoice || voiceSessionActive) {
      scheduleVoiceResume?.();
    }
  },

  /**
   * Main entry — freeform user message from CLI or voice.
   * Returns same shape as AciCoders.chat for compatibility.
   */
  async handle(message, opts = {}) {
    this.init();
    const raw = String((window.fixVoiceHotwords || (x => x))(String(message || ''))).trim();
    if (!raw) {
      await AciCoders?.enterSession?.({ fromVoice: !!opts.fromVoice, focus: true });
      return { ok: true, session: true };
    }

    // Architect bridge / coders explicit — keep existing routes
    if (ArchitectBridge?.wantsBridgeCmd?.(raw)) {
      return ArchitectBridge.handleCommand(raw);
    }
    if (AciCoders?.isExplicitRef?.(raw) && AciCoders?.isArchitect?.()) {
      return AciCoders.handleMessage(raw, opts);
    }

    if (this.busy) {
      this.deliver(this.localReply({ greek: /[\u0370-\u03FF]/.test(raw), message: raw, intent: 'chat', actions: [] }, []), { kind: 'dim' });
    }
    this.busy = true;
    GlobeDeck?.expand?.('Astranov');
    GlobeDeck?.setThinking?.(true, 'Astranov…');
    CliRibbon?.setActive?.('Astranov');
    AIGraphics?.setThinkPulse?.(true);

    try {
      const plan = this.plan(raw);
      const actionResults = await this.execute(plan);
      const instant = this.localReply(plan, actionResults);
      this.history.push({ role: 'user', content: raw });
      this.history.push({ role: 'assistant', content: instant });
      if (this.history.length > 24) this.history = this.history.slice(-24);

      // Always show something now (local-first)
      this.deliver(instant, {
        kind: 'reply',
        speak: !!(opts.fromVoice || window._handsFreeVoice),
      });
      GlobeDeck?.setThinking?.(false);

      // Pure action intents don't need slow AI
      if (plan.intent !== 'chat' && plan.actions.length && plan.intent !== 'brain') {
        FieldBrain?.pulse?.('act', plan.intent, { props: { results: actionResults } });
        return { ok: true, text: instant, via: 'local/globe', actions: actionResults, local: true };
      }

      // Enrich chat with AI — do not block more than AI_TIMEOUT_MS
      const ai = await this.askAi(raw, plan);
      if (ai?.text && ai.text !== instant) {
        // Replace last assistant history with richer reply
        this.history[this.history.length - 1] = { role: 'assistant', content: ai.text };
        this.deliver(ai.text, {
          kind: 'reply',
          speak: !!(opts.fromVoice || window._handsFreeVoice),
        });
        FieldBrain?.pulse?.('think', raw.slice(0, 48), {});
        MapDepict?.action?.('think', { detail: raw.slice(0, 40) });
        return { ok: true, text: ai.text, via: ai.via, actions: actionResults };
      }

      return { ok: true, text: instant, via: 'local/first', actions: actionResults, local: true };
    } catch (e) {
      const err = 'Brain error: ' + (e.message || e);
      this.deliver(err, { kind: 'err' });
      return { ok: false, error: err, text: err };
    } finally {
      this.busy = false;
      GlobeDeck?.setThinking?.(false);
      setTimeout(() => AIGraphics?.setThinkPulse?.(false), 900);
    }
  },
};

window.AstranovCoreBrain = AstranovCoreBrain;

/* === 13-app-shortcuts.js === */
// === APP SHORTCUTS — open CLI apps as top-bar icons (account · apps · +) ===
var AppShortcuts = {
  _row: null,
  _order: [],
  _labels: {},
  _siteMeta: null,

  APPS: {
    coders: {
      icon: '🧠',
      title: 'Coders',
      activate() {
        void AciCoders?.enterSession?.({ ping: true });
      },
      close() {
        GlobeDeck.activeTask = null;
        GlobeDeck?.hideStage?.();
        GlobeDeck?.setTitle?.(PublicCopy?.deckTitle?.() || SuperCli?.title || 'Astranov');
        SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
      },
    },
    commerce: {
      icon: '🛒',
      title: 'Shops',
      activate() {
        window.Commerce?.initUI?.();
        if (window.Commerce?.selected) {
          window.Commerce.showMenu();
          const list = document.getElementById('vm-list');
          const detail = document.getElementById('vm-detail');
          if (list) list.style.display = 'none';
          if (detail) detail.style.display = 'block';
          const title = document.getElementById('vm-title');
          if (title) title.textContent = (window.Commerce.selected.icon || '🏪') + ' ' + window.Commerce.selected.name;
          window.Commerce.renderCart?.();
        } else {
          window.Commerce?.showPicker?.();
        }
        SuperCli?.setContext?.('commerce');
      },
      close() {
        window.Commerce?.hideMenu?.();
        if (GlobeDeck?.activeTask === 'commerce') GlobeDeck?.completeTask?.('commerce');
      },
    },
    batch: {
      icon: '🔗',
      title: 'Batch',
      activate() {
        window.AstranovNode?.showPanel?.();
        SuperCli?.setContext?.('batch');
      },
      close() {
        window.AstranovNode?.hidePanel?.();
      },
    },
    radio: {
      icon: '📡',
      title: 'PMR',
      activate() {
        PmrRadio?.show?.();
        SuperCli?.setContext?.('radio');
      },
      close() {
        PmrRadio?.hide?.();
      },
    },
    video: {
      icon: '▶️',
      title: 'Video',
      activate() {
        GlobeVideo?.showPanel?.(GlobeVideo?._lastQuery || 'YouTube on globe');
        if (GlobeVideo?._currentId) void GlobeVideo?.play?.(GlobeVideo._currentId);
      },
      close() {
        GlobeVideo?.hide?.();
      },
    },
    add: {
      icon: '📹',
      title: 'Post',
      activate() {
        window.SuperAdd?.showPanel?.();
        window.SuperAdd?.startCamera?.();
        SuperCli?.setContext?.('add');
      },
      close() {
        window.SuperAdd?.hide?.();
      },
    },
    drive: {
      icon: '🚗',
      title: 'Drive',
      activate() {
        window.DrivingView?.activate?.();
        SuperCli?.setContext?.('drive');
      },
      close() {
        if (window.DrivingView?.active) window.DrivingView.deactivate();
        else AppShortcuts.untrack('drive');
      },
    },
    phone: {
      icon: '☎️',
      title: 'Phone',
      activate() {
        GlobeDeck?.hideStage?.();
        GlobeDeck.activeTask = 'phone';
        GlobeDeck?.expand?.((PublicCopy?.deckTitle?.() || 'Astranov') + ' — phone');
        SuperCli?.setContext?.('phone');
        document.getElementById('aci-cli-in')?.focus();
      },
      close() {
        if (GlobeDeck?.activeTask === 'phone') GlobeDeck.activeTask = null;
        SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
      },
    },
    chats: {
      icon: '💬',
      title: 'Chats',
      activate() {
        window.CliHub?.openPanel?.();
        SuperCli?.setContext?.('chats');
      },
      close() {
        window.CliHub?.closePanel?.();
      },
    },
    coin: {
      icon: '◎',
      title: 'Coins',
      activate() {
        CoinPortal?.open?.('wallet');
        SuperCli?.setContext?.('coin');
      },
      close() {
        AstranovSiteShell?.close?.();
      },
    },
    site: {
      icon: '🌐',
      title: 'Site',
      activate() {
        const meta = AstranovSiteShell?.active || AppShortcuts._siteMeta;
        if (meta?.url) AstranovSiteShell?.open?.(meta.url, meta);
      },
      close() {
        AstranovSiteShell?.close?.();
      },
    },
  },

  init() {
    const bar = document.getElementById('super-cli-bar');
    const login = document.getElementById('aci-login');
    if (!bar || !login) return;
    let row = document.getElementById('app-shortcut-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'app-shortcut-row';
      row.setAttribute('role', 'toolbar');
      row.setAttribute('aria-label', 'Open applications');
      login.insertAdjacentElement('afterend', row);
    }
    this._row = row;
    this.render();
  },

  isOpen(id) {
    return this._order.includes(id);
  },

  active() {
    return GlobeDeck?.activeTask || this._order[this._order.length - 1] || null;
  },

  track(id, label) {
    const key = this._norm(id);
    if (!key || !this.APPS[key]) return;
    if (!this._order.includes(key)) this._order.push(key);
    if (label) this._labels[key] = String(label).slice(0, 48);
    this.render();
  },

  untrack(id) {
    const key = this._norm(id);
    if (!key) return;
    this._order = this._order.filter(x => x !== key);
    delete this._labels[key];
    if (key === 'site') this._siteMeta = null;
    this.render();
  },

  rememberSite(meta) {
    if (meta?.url) this._siteMeta = { ...meta };
  },

  _norm(id) {
    const s = String(id || '').toLowerCase();
    if (s === 'vhf' || s === 'pmr') return 'radio';
    if (s === 'node' || s === 'node-batch') return 'batch';
    if (s === 'youtube' || s === 'yt') return 'video';
    if (s === 'vendor-menu' || s === 'order' || s === 'shop' || s === 'shops') return 'commerce';
    if (s === 'globe-super-add' || s === 'superadd' || s === 'post') return 'add';
    return s;
  },

  switchTo(id) {
    const key = this._norm(id);
    if (!key || !this.APPS[key] || !this.isOpen(key)) return;
    if (GlobeDeck) GlobeDeck._userEngaged = true;
    try {
      this.APPS[key].activate();
      GlobeDeck.activeTask = key === 'phone' || key === 'coders' ? key : (GlobeDeck?.activeTask || key);
      this.render();
    } catch (e) {
      console.warn('[AppShortcuts] switch', key, e);
    }
  },

  closeApp(id) {
    const key = this._norm(id);
    if (!key || !this.APPS[key]) return false;
    try {
      this.APPS[key].close?.();
    } catch (e) {
      console.warn('[AppShortcuts] close', key, e);
    }
    this.untrack(key);
    return true;
  },

  closeCurrent() {
    const id = GlobeDeck?.activeTask || this._order[this._order.length - 1];
    if (id && this.isOpen(id)) return this.closeApp(id);
    if (AstranovSiteShell?.isOpen?.()) return this.closeApp('site');
    return false;
  },

  render() {
    if (!this._row) return;
    this._row.innerHTML = '';
    const focus = GlobeDeck?.activeTask || null;
    for (const id of this._order) {
      const app = this.APPS[id];
      if (!app) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-shortcut-btn';
      btn.dataset.app = id;
      btn.title = this._labels[id] || app.title;
      btn.setAttribute('aria-label', this._labels[id] || app.title);
      btn.textContent = app.icon;
      if (id === focus || (id === 'site' && AstranovSiteShell?.isOpen?.())) {
        btn.classList.add('active');
      }
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        this.switchTo(id);
      };
      this._row.appendChild(btn);
    }
    CliRibbon?.render?.();
  },
};
window.AppShortcuts = AppShortcuts;

/* === 07-astranov-logo.js === */
// === ASTRANOV LOGO — top-center reset + live mic/AI waveform ===
const AstranovLogo = {
  _bound: false,
  _canvas: null,
  _ctx: null,
  _raf: 0,
  _micAnalyser: null,
  _aiAnalyser: null,
  _micCtx: null,
  _micStream: null,
  _aiSynth: 0,
  _bars: 24,

  init() {
    const el = document.getElementById('astranov-logo');
    if (!el || this._bound) return;
    this._bound = true;
    this._mountWave(el);
    el.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      this.hardReset();
    });
    this._loop();
  },

  _mountWave(el) {
    let canvas = document.getElementById('astranov-logo-wave');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'astranov-logo-wave';
      canvas.setAttribute('aria-hidden', 'true');
      const label = el.querySelector('.astranov-logo-label');
      if (label) el.insertBefore(canvas, label);
      else el.appendChild(canvas);
    }
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  },

  _resize() {
    if (!this._canvas) return;
    const r = this._canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._canvas.width = Math.max(120, Math.floor(r.width * dpr));
    this._canvas.height = Math.max(28, Math.floor(r.height * dpr));
  },

  async ensureMicAnalyser() {
    if (this._micAnalyser) return this._micAnalyser;
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      this._micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._micCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this._micCtx.createMediaStreamSource(this._micStream);
      const an = this._micCtx.createAnalyser();
      an.fftSize = 64;
      an.smoothingTimeConstant = 0.72;
      src.connect(an);
      this._micAnalyser = an;
      return an;
    } catch (_) {
      return null;
    }
  },

  setMicActive(on) {
    const el = document.getElementById('astranov-logo');
    if (!el) return;
    if (on) {
      el.classList.add('voice-mic');
      void this.ensureMicAnalyser();
    } else {
      el.classList.remove('voice-mic');
    }
  },

  setAiActive(on) {
    const el = document.getElementById('astranov-logo');
    if (!el) return;
    el.classList.toggle('voice-ai', !!on);
    if (on) this._aiSynth = performance.now();
    else this._aiAnalyser = null;
  },

  hookAiAudio(audioEl) {
    if (!audioEl) return;
    try {
      const ctx = this._micCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (!this._micCtx) this._micCtx = ctx;
      const src = ctx.createMediaElementSource(audioEl);
      const an = ctx.createAnalyser();
      an.fftSize = 64;
      an.smoothingTimeConstant = 0.68;
      src.connect(an);
      an.connect(ctx.destination);
      this._aiAnalyser = an;
    } catch (_) {}
  },

  _readBars(analyser, fallback) {
    const out = new Array(this._bars).fill(0);
    if (analyser) {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      const step = Math.max(1, Math.floor(buf.length / this._bars));
      for (let i = 0; i < this._bars; i++) {
        let v = 0;
        for (let j = 0; j < step; j++) v = Math.max(v, buf[i * step + j] || 0);
        out[i] = v / 255;
      }
      return out;
    }
    const t = performance.now() * 0.006;
    for (let i = 0; i < this._bars; i++) {
      out[i] = fallback * (0.35 + 0.65 * Math.abs(Math.sin(t + i * 0.55)));
    }
    return out;
  },

  _drawBars(bars, color, x0, width, barCount) {
    const ctx = this._ctx;
    const c = this._canvas;
    if (!ctx || !c || !width) return;
    const h = c.height;
    const n = barCount || bars.length;
    const gap = width / n;
    const mid = h * 0.5;
    for (let i = 0; i < n; i++) {
      const amp = Math.max(0.06, bars[i] || 0);
      const bh = amp * h * 0.88;
      const x = x0 + i * gap + gap * 0.15;
      const bw = gap * 0.7;
      const grad = ctx.createLinearGradient(0, mid - bh, 0, mid + bh);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color.replace('0.95)', '0.35)').replace('0.92)', '0.35)'));
      ctx.fillStyle = grad;
      ctx.fillRect(x, mid - bh * 0.5, bw, bh);
    }
  },

  _draw(bars, color) {
    const c = this._canvas;
    if (!this._ctx || !c) return;
    this._ctx.clearRect(0, 0, c.width, c.height);
    this._drawBars(bars, color, 0, c.width, bars.length);
  },

  _drawDual(micBars, aiBars) {
    const c = this._canvas;
    if (!this._ctx || !c) return;
    this._ctx.clearRect(0, 0, c.width, c.height);
    const half = Math.floor(this._bars / 2);
    this._drawBars(micBars, 'rgba(255,55,55,0.95)', 0, c.width * 0.5, half);
    this._drawBars(aiBars, 'rgba(0,230,110,0.95)', c.width * 0.5, c.width * 0.5, this._bars - half);
  },

  _loop() {
    const el = document.getElementById('astranov-logo');
    const micOn = isListening || window._handsFreeVoice;
    const aiOn = !!Voice?.speaking;
    if (micOn) this.setMicActive(true);
    else this.setMicActive(false);
    this.setAiActive(aiOn);

    if (micOn && aiOn) {
      const micBars = this._readBars(this._micAnalyser, 0.2);
      const aiBars = this._readBars(this._aiAnalyser, 0.55);
      this._drawDual(micBars, aiBars);
      if (el) el.classList.add('voice-mic', 'voice-ai');
    } else if (aiOn) {
      this._draw(this._readBars(this._aiAnalyser, 0.5 + 0.2 * Math.sin(performance.now() * 0.01)), 'rgba(0,230,110,0.95)');
    } else if (micOn) {
      this._draw(this._readBars(this._micAnalyser, 0.25 + 0.15 * Math.sin(performance.now() * 0.012)), 'rgba(255,60,60,0.95)');
    } else if (this._ctx && this._canvas) {
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    this._raf = requestAnimationFrame(() => this._loop());
  },

  resetToGlobalView() {
    userIntervene?.();
    GlobeControl?.userTookGlobe?.('silent');
    window.DrivingView?.deactivate?.();
    SuperSpace?.stop?.();
    GlobeVideo?.stop?.();
    GlobeVideo?.hide?.();
    window.SuperAdd?.stop?.();
    GlobeEntity?.clearSelection?.();
    GlobeDeck?.collapse?.();
    GlobeDeck?.hideStage?.();
    GlobeDeck?.setPreview?.('ASTRANOV — global earth · tap 🎯 Locate');
    window._globeFly = null;
    window._cityDropLock = false;
    if (typeof globePivot !== 'undefined' && globePivot) {
      globePivot.rotation.y = 0;
      globePivot.rotation.x = 0.12;
      globePivot.quaternion.setFromEuler(globePivot.rotation, 'YXZ');
    }
    if (typeof camera !== 'undefined' && camera) {
      camera.position.z = ZoomTiers?.tierZ?.('global') || 2.55;
      camera.lookAt(0, 0, 0);
    }
    ZoomTiers?.goTo?.('global', true);
    CityMap?._exit?.();
    CosmicZoom?.update?.(2.55, { tier: 'global', label: 'Earth', cosmic: 'earth' });
    cityLevel = false;
    const zl = document.getElementById('zoom-label');
    if (zl && !window.DrivingView?.active) {
      zl.textContent = PublicCopy?.zoomLine?.('global') || 'Earth · 🎯 for your city';
    }
    const chip = document.getElementById('city-life-chip');
    if (chip) chip.classList.remove('open');
  },

  async hardReset() {
    const el = document.getElementById('astranov-logo');
    if (el?._resetting) return;
    const label = el?.querySelector('.astranov-logo-label');
    if (el) {
      el._resetting = true;
      el.disabled = true;
      if (label) label.textContent = '…';
    }
    this.resetToGlobalView();
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (_) { /* best-effort */ }
    const url = new URL(location.href);
    url.searchParams.set('v', String(Date.now()));
    url.hash = '';
    location.replace(url.toString());
  },
};
window.AstranovLogo = AstranovLogo;

/* === 99-boot-features.js === */
// === SPARTAN BOOT · FEATURES — field hub only. Heavy toys stay deferred. ===
window.__astranovBootFeatures = function __astranovBootFeatures() {
  const soft = (name, fn) => {
    try { fn?.(); } catch (e) { console.warn('[spartan features] ' + name, e); }
  };
  const idle = (fn, ms) => {
    const run = () => { try { fn(); } catch (e) { console.warn('[spartan idle]', e); } };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: ms });
    else setTimeout(run, Math.min(ms, 800));
  };

  soft('GlobeEntity', () => GlobeEntity?.init?.());
  soft('CityTasks', () => {
    CityTasks?.init?.();
    TaskBoard?.init?.();
  });
  soft('SpaceNetCM', () => SpaceNetCM?.init?.());
  soft('CoreBrain', () => AstranovCoreBrain?.init?.());
  soft('Logo', () => AstranovLogo?.init?.());
  soft('Shortcuts', () => {
    try { AppShortcuts?.init?.(); } catch (_) {}
  });

  // Locate wiring: 🎯 national → city (never bare undeclared locateMe — kills app)
  idle(() => {
    const btn = document.getElementById('aci-locate');
    if (btn && !btn._spartanLocate) {
      btn._spartanLocate = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (window.CityLife?.safeLocate) void window.CityLife.safeLocate();
          else if (window.CityLife?.locateAndDropIn) void window.CityLife.locateAndDropIn().catch(() => {});
          else if (typeof window.locateMe === 'function') window.locateMe();
        } catch (err) {
          console.warn('[locate]', err);
        }
      }, { capture: true });
    }
  }, 200);

  if (window._lastPos) {
    try {
      const nm = Auth?.user?.user_metadata?.full_name
        || Auth?.user?.email?.split?.('@')?.[0]
        || 'You';
      GlobeEntity?.syncMe?.(window._lastPos.lat, window._lastPos.lng, nm);
    } catch (_) {}
  }

  if (!window.showFirstRunCoach) {
    window.showFirstRunCoach = function showFirstRunCoach() {
      try { if (localStorage.getItem('astranov:coach-v2')) return; } catch (_) { return; }
      const el = document.getElementById('first-run-coach');
      if (!el) return;
      if (PublicCopy?.coachHtml) {
        el.innerHTML = PublicCopy.coachHtml()
          + '<button type="button" id="first-run-coach-ok">Got it</button>';
      }
      el.hidden = false;
      document.getElementById('first-run-coach-ok')?.addEventListener('click', () => {
        el.hidden = true;
        try { localStorage.setItem('astranov:coach-v2', '1'); } catch (_) {}
      });
    };
  }
  setTimeout(() => {
    try { showFirstRunCoach?.(); } catch (_) {}
  }, 900);

  window._astranovFeaturesReady = true;
  document.documentElement.dataset.astranovPhase = 'features';
  console.log('%c[Spartan] field hub · channels · tasks', 'color:#ffdd44;font-weight:700');
};
