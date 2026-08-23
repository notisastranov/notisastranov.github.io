// === GLOBE ENTITIES — every map thing has a name, proximity label, tap action ===
// `var` (not const): critical may already have window.GlobeEntity; avoid TDZ/redeclare crash.
var GlobeEntity = {
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
