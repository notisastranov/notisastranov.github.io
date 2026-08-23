// === SUPER ADD FIELD — social profile · cover · avatar · roles · instant post · video peers ===
// AI HANDOFF: see astranov-continuity.js → features.superAddPlus, menuProfilePostTile,
// locateMe, videoCall, deliveryMarketplace. Owns: + hijack, _patchLocate, _patchVideoCall,
// _patchCliBar, refreshMarketplace, place_cart, track_delivery. Do NOT restore globe-super-add as + target.
const MenuProfilePostTile = {
  _pin: null,
  _pinPick: false,
  _drag: null,
  _driverOnline: false,
  _mediaFile: null,
  _mediaKind: null,
  _roles: { client: true, vendor: false, driver: false, pilot: false, user: true, social: true },
  _multiTiles: [],
  MULTI_KEY: 'astranov:multi-tiles',

  formatCoords(lat, lng) {
    return Number(lat).toFixed(4) + ', ' + Number(lng).toFixed(4);
  },

  init() {
    if (this._inited) return;
    this._inited = true;
    const tile = document.getElementById('menu-profile-post-tile');
    if (!tile) return;
    document.getElementById('mpp-close')?.addEventListener('click', () => this.close());
    document.getElementById('mpp-pin-pick')?.addEventListener('click', e => {
      e.stopPropagation();
      this.togglePinPick();
    });
    document.getElementById('mpp-apply')?.addEventListener('click', () => void this.applyPrimary());
    document.querySelectorAll('.mpp-act[data-mpp-act]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        void this.runAction(btn.dataset.mppAct);
      });
    });
    document.querySelectorAll('.mpp-role-chip[data-mpp-role]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.toggleRole(btn.dataset.mppRole);
      });
    });
    document.getElementById('mpp-driver-online')?.addEventListener('click', e => {
      e.stopPropagation();
      void this.toggleDriverOnline();
    });
    document.getElementById('mpp-driver-schedule')?.addEventListener('change', e => {
      void this.saveDriverSchedule(e.target.value);
    });
    document.getElementById('mpp-cover-edit')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('mpp-cover-file')?.click();
    });
    document.getElementById('mpp-avatar-edit')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('mpp-avatar-file')?.click();
    });
    document.getElementById('mpp-cover-file')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) void this.uploadImage('cover', f);
      e.target.value = '';
    });
    document.getElementById('mpp-avatar-file')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) void this.uploadImage('avatar', f);
      e.target.value = '';
    });
    document.getElementById('mpp-pick-photo')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('mpp-photo-file')?.click();
    });
    document.getElementById('mpp-pick-video')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('mpp-video-file')?.click();
    });
    document.getElementById('mpp-photo-file')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) this.setMediaPreview(f, 'photo');
      e.target.value = '';
    });
    document.getElementById('mpp-video-file')?.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) this.setMediaPreview(f, 'video');
      e.target.value = '';
    });
    document.getElementById('mpp-media-clear')?.addEventListener('click', e => {
      e.stopPropagation();
      this.clearMediaPreview();
    });
    document.getElementById('mpp-post-now')?.addEventListener('click', e => {
      e.stopPropagation();
      void this.instantPost();
    });
    this._bindTileDrag(tile);
    this._bindPlusFab();
    this._bindMultiRail();
    this._patchCliBar();
    this._patchLocate();
    this._patchVideoCall();
    this._loadRoles();
    this._loadMultiTiles();
    this.renderMultiCreated();
    this.updateRoleSections();
  },

  _bindMultiRail() {
    document.querySelectorAll('.mpp-multi-tile[data-mmt]').forEach(btn => {
      if (btn._mmtBound) return;
      btn._mmtBound = true;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.selectMultiHub(btn.dataset.mmt);
      });
    });
  },

  selectMultiHub(kind) {
    document.querySelectorAll('.mpp-multi-tile[data-mmt]').forEach(b => {
      b.classList.toggle('active', b.dataset.mmt === kind);
    });
    const roleMap = {
      data: 'user',
      social: 'social',
      vendor: 'vendor',
      market: 'client',
      pilot: 'pilot',
    };
    const role = roleMap[kind];
    if (role) {
      Object.keys(this._roles).forEach(k => { this._roles[k] = (k === role || k === 'user'); });
      if (kind === 'market') this._roles.client = true;
      if (kind === 'social') this._roles.social = true;
      document.querySelectorAll('.mpp-role-chip[data-mpp-role]').forEach(b => {
        b.classList.toggle('on', !!this._roles[b.dataset.mppRole]);
      });
      this.updateRoleSections();
    }
    if (kind === 'social') {
      document.getElementById('mpp-section-social')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      document.getElementById('mpp-post-caption')?.focus();
    }
    if (kind === 'vendor' || kind === 'market') {
      void this.runAction(kind === 'vendor' ? 'browse_shops' : 'browse_shops');
    }
    if (kind === 'pilot') {
      document.getElementById('mpp-section-pilot')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      void this.runAction('pilot_build');
    }
    if (kind === 'data') {
      document.getElementById('mpp-data-list')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  },

  _loadMultiTiles() {
    try {
      const raw = localStorage.getItem(this.MULTI_KEY);
      this._multiTiles = raw ? JSON.parse(raw) : [];
    } catch (_) { this._multiTiles = []; }
  },

  _saveMultiTiles() {
    try { localStorage.setItem(this.MULTI_KEY, JSON.stringify(this._multiTiles.slice(0, 24))); } catch (_) {}
  },

  renderMultiCreated() {
    const host = document.getElementById('mpp-multi-created');
    if (!host) return;
    host.innerHTML = (this._multiTiles || []).map(t => {
      const media = t.media
        ? '<img class="mmt-media" src="' + String(t.media).replace(/"/g, '') + '" alt="" />'
        : '';
      return '<button type="button" class="mpp-multi-tile created" data-multi-id="' + t.id + '" title="' + (t.label || 'Multi-tile') + '">'
        + media
        + '<span class="mmt-icon">' + (t.icon || '◆') + '</span>'
        + '<span class="mmt-label">' + (t.label || 'Tile') + '</span></button>';
    }).join('');
    host.querySelectorAll('[data-multi-id]').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const t = this._multiTiles.find(x => x.id === btn.dataset.multiId);
        if (t?.kind) this.selectMultiHub(t.kind);
        if (t?.pilot) void this.runAction('pilot_start');
      };
    });
  },

  createMultiTile(opts) {
    opts = opts || {};
    const id = 'mt-' + Date.now().toString(36);
    const tile = {
      id,
      kind: opts.kind || 'pilot',
      label: opts.label || 'Pilot route',
      icon: opts.icon || '🛸',
      media: opts.media || null,
      pilot: !!opts.pilot,
      at: Date.now(),
      pin: this._pinCoords(),
    };
    this._multiTiles.unshift(tile);
    this._saveMultiTiles();
    this.renderMultiCreated();
    AciCli?.print?.('multi-tile saved · deep blue glow · ' + tile.label, 'ok');
    return tile;
  },

  _closeSuperAddDeck() {
    window.SuperAdd?.hide?.();
    document.getElementById('globe-super-add')?.classList.remove('open', 'deck-active');
  },

  _bindPlusFab() {
    const fab = document.getElementById('super-add-fab');
    if (!fab || fab._mppPlusBound) return;
    fab._mppPlusBound = true;
    fab.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this._closeSuperAddDeck();
      this.openPlusField();
    }, { capture: true });
    const openPlus = () => {
      this._closeSuperAddDeck();
      this.openPlusField();
    };
    fab.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      openPlus();
    };
    const sc = window.SuperCli;
    if (sc && !sc._mppPlusPatched) {
      sc._mppPlusPatched = true;
      const _bind = sc.bindToolbar?.bind(sc);
      if (_bind) {
        sc.bindToolbar = function() {
          _bind();
          const el = document.getElementById('super-add-fab');
          if (el) el.onclick = e => { e.preventDefault(); e.stopPropagation(); openPlus(); };
        };
      }
      const _run = sc.run?.bind(sc);
      if (_run) {
        sc.run = async function(cmd, opts) {
          const low = String(cmd || '').trim().toLowerCase();
          if (low === 'add' || low === 'post' || low === 'superadd') {
            openPlus();
            sc.setContext?.('add');
            return;
          }
          return _run(cmd, opts);
        };
      }
    }
  },

  _patchCliBar() {
    const sc = window.SuperCli;
    if (!sc || sc._mppCliPatched) return;
    sc._mppCliPatched = true;
    const self = this;
    const _ensure = sc.ensureBarLayout?.bind(sc);
    if (_ensure) {
      sc.ensureBarLayout = function() {
        _ensure();
        const edge = document.getElementById('super-cli-edge-right');
        const video = document.getElementById('aci-video-call');
        const fab = document.getElementById('super-add-fab');
        const hf = document.getElementById('aci-handsfree');
        if (edge && video && fab) edge.insertBefore(video, fab);
        if (edge && hf && hf.parentElement !== edge) edge.appendChild(hf);
        self._patchLocate();
      };
    }
    const _setCtx = sc.setContext?.bind(sc);
    if (_setCtx) {
      sc.setContext = function(ctx) {
        _setCtx(ctx);
        const video = document.getElementById('aci-video-call');
        if (video) video.hidden = false;
        self._patchLocate();
      };
    }
    sc.ensureBarLayout?.();
    this._patchLocate();
  },

  _patchLocate() {
    const btn = document.getElementById('aci-locate');
    if (!btn) return;
    btn.classList.add('app-shortcut-btn');
    btn.hidden = false;
    const row = document.getElementById('app-shortcut-row');
    if (row && btn.parentElement !== row) row.prepend(btn);
    if (btn._mppLocateBound) return;
    btn._mppLocateBound = true;
    const runLocate = async () => {
      GlobeDeck?.expand?.(SuperCli?.title || 'Astranov Command Line');
      GlobeDeck?.setMapStatus?.('Locating…');
      GlobeControl?.engageFollow?.('locate');
      ACIControl?.reply?.('Locating — city map…');
      AciCli?.print?.('locate me · GPS', 'map');
      try {
        if (CityLife?.locateAndDropIn) await CityLife.locateAndDropIn();
        else if (typeof locateMe === 'function') locateMe();
        else throw new Error('no locate');
      } catch (_) {
        ACIControl?.reply?.('GPS denied — Rhodes demo · allow location for your city');
        await enterCityView?.(36.44, 28.22, { openShops: false });
      }
    };
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      void runLocate();
    }, { capture: true });
    btn.onclick = e => { e.preventDefault(); e.stopPropagation(); void runLocate(); };
    const apps = window.AppShortcuts;
    if (apps && !apps._mppLocatePatched) {
      apps._mppLocatePatched = true;
      const _pin = apps._pinInsideButtons?.bind(apps);
      if (_pin) {
        apps._pinInsideButtons = function() {
          _pin();
          MenuProfilePostTile._patchLocate();
        };
      }
    }
  },

  _patchVideoCall() {
    const btn = document.getElementById('aci-video-call');
    if (!btn || btn._mppVideoBound) return;
    btn._mppVideoBound = true;
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      void this._openVideoCall();
    });
  },

  async _openVideoCall() {
    await LazyModules.ensure().catch(() => {});
    GlobeDeck?.expand?.(SuperCli?.title || 'Astranov Command Line');
    if (!this.isOpen()) {
      const pos = window._lastPos || CityMap?.globeCenterLatLng?.() || TrackballGuard?.facingLatLng?.() || { lat: 36.44, lng: 28.22 };
      this.openAt(pos.lat, pos.lng);
    }
    await this.refreshConnected();
    const users = [...document.querySelectorAll('#mpp-connected-users .mpp-connected-user[data-mesh="0"]')];
    if (users.length === 1) {
      void MapComms?.contactUser?.(users[0].dataset.uid, 'video');
      return;
    }
    document.getElementById('mpp-connected')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    AciCli?.print?.('Tap a connected user to video call', 'ok');
  },

  async refreshMarketplace() {
    const el = document.getElementById('mpp-market-summary');
    if (!el) return;
    await LazyModules.ensure().catch(() => {});
    try { await Commerce?.loadVendors?.(); } catch (_) {}
    const vendor = Commerce?.selected;
    const items = Commerce?.cartItems?.() || [];
    const goods = items.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
    const del = window._clientDelivery;
    let quoteTotal = goods;
    if (items.length && vendor?.lat != null && del?.lat != null) {
      try {
        const km = Commerce?.haversineKm?.(del.lat, del.lng, vendor.lat, vendor.lng) ?? 0;
        const q = await DeliveryPricing?.quote?.({ km, kg: 3 + items.length, subtotal_eur: goods, lat: del.lat, lng: del.lng });
        if (q?.total_avc != null) quoteTotal = q.total_avc;
        else if (q?.total_eur != null) quoteTotal = q.total_eur;
      } catch (_) {}
    }
    const shops = (Commerce?.vendors || []).length;
    const missions = MarketplaceDeliveryEngine?.missions || [];
    const openSt = ['pending', 'seeking_driver', 'assigned', 'active', 'en_route', 'picked_up'];
    const activeM = missions.find(m => openSt.includes(m.order?.status || m.status));
    const tracked = OrderTracking?.active;
    const active = activeM || (tracked && openSt.includes(tracked.status) ? { order: tracked, status: tracked.status } : null);
    const lines = [];
    lines.push(del?.lat != null
      ? '📍 Delivery · ' + (del.label || this.formatCoords(del.lat, del.lng))
      : '📍 Delivery · set pin first');
    lines.push(vendor
      ? (vendor.emoji || '🏪') + ' ' + (vendor.name || 'Shop')
      : (shops ? shops + ' shops nearby · browse' : 'No shops loaded · browse'));
    if (items.length) {
      lines.push('🛒 ' + items.length + ' item' + (items.length > 1 ? 's' : '')
        + ' · goods ' + goods.toFixed(1) + ' AVC');
      lines.push('<div class="mpp-market-total">' + Number(quoteTotal).toFixed(2) + ' AVC total (goods + delivery)</div>');
    } else {
      lines.push('🛒 Cart empty · browse shops & add items');
    }
    if (active?.order) {
      const st = active.order.status || active.status || '';
      const label = MarketplaceDeliveryEngine?.STATUS?.[st]?.label
        || OrderTracking?.meta?.(st)?.label || st;
      lines.push('🚚 Active · ' + (active.order.short_id || active.order.id?.slice?.(0, 8) || 'order')
        + ' · ' + label);
    }
    el.innerHTML = lines.join('<br>');
    this.updateFoot();
  },

  _patchSuperAdd() {
    const SA = window.SuperAdd;
    if (!SA || SA._mppPatched) return !!SA;
    SA._mppPatched = true;
    const self = this;
    const _open = SA.open?.bind(SA);
    SA.open = function(opts) {
      if (opts?.camera || opts?.media) {
        self._closeSuperAddDeck();
        if (_open) return _open(opts);
        return;
      }
      self.openPlusField();
    };
    const _show = SA.showPanel?.bind(SA);
    SA.showPanel = function() {
      self._closeSuperAddDeck();
      self.openPlusField();
    };
    const _init = SA.init?.bind(SA);
    if (_init) {
      SA.init = function() {
        _init();
        self._bindPlusFab();
      };
    }
    return true;
  },

  _bindTileDrag(tile) {
    const row = document.getElementById('mpp-profile-row');
    const dragBtn = document.getElementById('mpp-drag');
    const startDrag = (e) => {
      if (e.target?.closest?.('button:not(#mpp-drag)')) return;
      const pt = e.touches?.[0] || e;
      const rect = tile.getBoundingClientRect();
      this._drag = { x: pt.clientX, y: pt.clientY, left: rect.left, top: rect.top };
      tile.classList.add('mpp-dragged');
      tile.style.transform = 'none';
      tile.style.left = rect.left + 'px';
      tile.style.top = rect.top + 'px';
      e.preventDefault();
    };
    const moveDrag = (e) => {
      if (!this._drag) return;
      const pt = e.touches?.[0] || e;
      tile.style.left = (this._drag.left + pt.clientX - this._drag.x) + 'px';
      tile.style.top = (this._drag.top + pt.clientY - this._drag.y) + 'px';
      e.preventDefault();
    };
    const endDrag = () => { this._drag = null; };
    [row, dragBtn].forEach(el => {
      if (!el) return;
      el.addEventListener('mousedown', startDrag);
      el.addEventListener('touchstart', startDrag, { passive: false });
    });
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
  },

  _loadRoles() {
    const page = window.Auth?._profilePage || {};
    const saved = page.super_add_roles;
    if (saved && typeof saved === 'object') {
      Object.keys(this._roles).forEach(k => {
        if (saved[k] != null) this._roles[k] = !!saved[k];
      });
    }
    document.querySelectorAll('.mpp-role-chip[data-mpp-role]').forEach(btn => {
      btn.classList.toggle('on', !!this._roles[btn.dataset.mppRole]);
    });
  },

  async _saveRoles() {
    if (!window.Auth?.user) return;
    try {
      const headers = await Auth.authHeaders?.();
      const prof = await Auth.client.from('profiles').select('profile_page').eq('id', Auth.user.id).maybeSingle();
      const page = (prof?.data?.profile_page && typeof prof.data.profile_page === 'object') ? prof.data.profile_page : {};
      page.super_add_roles = { ...this._roles };
      await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ profile_page: page, updated_at: new Date().toISOString() }),
      });
      Auth._profilePage = page;
    } catch (_) {}
  },

  toggleRole(role) {
    if (!role || !(role in this._roles)) return;
    this._roles[role] = !this._roles[role];
    document.querySelectorAll('.mpp-role-chip[data-mpp-role="' + role + '"]').forEach(b => {
      b.classList.toggle('on', this._roles[role]);
    });
    this.updateRoleSections();
    void this._saveRoles();
  },

  updateRoleSections() {
    const map = {
      vendor: 'mpp-section-vendor',
      driver: 'mpp-section-driver',
      pilot: 'mpp-section-pilot',
      user: 'mpp-section-user',
      social: 'mpp-section-social',
    };
    Object.entries(map).forEach(([role, id]) => {
      document.getElementById(id)?.classList.toggle('visible', !!this._roles[role]);
    });
    document.getElementById('mpp-section-market')?.classList.toggle('visible', !!(this._roles.client || this._roles.vendor || this._roles.pilot));
    const connected = document.getElementById('mpp-connected');
    if (connected) connected.classList.toggle('visible', !!this._roles.social);
    this.refreshDataList();
    void this.refreshMarketplace();
    this.updateFoot();
  },

  updateFoot() {
    const apply = document.getElementById('mpp-apply');
    if (!apply) return;
    const cap = (document.getElementById('mpp-post-caption')?.value || '').trim();
    if (this._roles.social && (cap || this._mediaFile)) {
      apply.textContent = 'Post to social field';
      return;
    }
    if (this._roles.pilot) { apply.textContent = 'Build pilot multi-stop'; return; }
    if (this._roles.vendor) { apply.textContent = 'Browse shops here'; return; }
    if (this._roles.driver) { apply.textContent = 'Set driver base here'; return; }
    if (this._roles.client) {
      const items = Commerce?.cartItems?.() || [];
      apply.textContent = items.length ? 'Place order · pay AVC' : 'Set delivery here';
      return;
    }
    apply.textContent = 'Apply at pin';
  },

  async refreshProfile() {
    await LazyModules.ensure().catch(() => {});
    if (Auth?.user) {
      try { await Auth.loadProfileVisual?.(); } catch (_) {}
    }
    const user = Auth?.user;
    const vis = Auth?._profileVisual || {};
    const page = Auth?._profilePage || {};
    const nameEl = document.getElementById('mpp-name');
    const handleEl = document.getElementById('mpp-handle');
    const avatar = document.getElementById('mpp-avatar');
    const fallback = document.getElementById('mpp-avatar-fallback');
    const cover = document.getElementById('mpp-cover');
    const display = vis.display_name
      || user?.user_metadata?.full_name
      || user?.user_metadata?.name
      || (user?.email ? user.email.split('@')[0] : 'Guest');
    const handle = page.handle || user?.user_metadata?.preferred_username
      || (user?.email ? '@' + user.email.split('@')[0] : '@guest');
    if (nameEl) nameEl.textContent = display;
    if (handleEl) {
      handleEl.textContent = user
        ? (handle.startsWith('@') ? handle : '@' + handle)
        : '@guest · sign in';
    }
    const avatarUrl = page.avatar_url
      || user?.user_metadata?.avatar_url
      || user?.user_metadata?.picture
      || '';
    const coverUrl = page.cover_url || page.entrance_photo_url || '';
    if (cover) {
      cover.style.backgroundImage = coverUrl
        ? 'url(' + coverUrl + ')'
        : 'linear-gradient(135deg,rgba(0,48,96,0.95),rgba(0,12,32,0.98))';
    }
    if (avatar && fallback) {
      if (avatarUrl) {
        avatar.src = avatarUrl;
        avatar.hidden = false;
        fallback.style.display = 'none';
        avatar.onerror = () => {
          avatar.hidden = true;
          fallback.style.display = 'grid';
          fallback.textContent = vis.avatar_emoji || '👤';
        };
      } else {
        avatar.hidden = true;
        fallback.style.display = 'grid';
        fallback.textContent = vis.avatar_emoji || '👤';
      }
    }
    this.refreshDataList();
  },

  refreshDataList() {
    const list = document.getElementById('mpp-data-list');
    if (!list) return;
    const p = this._pinCoords();
    const page = Auth?._profilePage || {};
    const rows = [];
    const push = (label, value) => {
      if (!value && value !== 0) return;
      rows.push('<div class="mpp-data-row"><dt>' + label + '</dt><dd>' + value + '</dd></div>');
    };
    push('Pin', this._pin ? this.formatCoords(p.lat, p.lng) : '—');
    if (this._roles.client) {
      const del = window._clientDelivery;
      push('Delivery', del?.label || (del?.lat != null ? this.formatCoords(del.lat, del.lng) : 'Not set'));
    }
    if (this._roles.vendor) {
      const n = (Commerce?.vendors || []).filter(v => v.lat != null).length;
      push('Shops', n ? n + ' on map' : 'None loaded');
      push('My shop', page.shop_name || (Commerce?.vendors || []).find(v => v.owner_id === Auth?.user?.id)?.name || '—');
    }
    if (this._roles.driver) {
      push('Driver', this._driverOnline ? 'Online' : 'Offline');
      push('Base', window._driverBase?.label || (window._driverBase?.lat != null ? this.formatCoords(window._driverBase.lat, window._driverBase.lng) : '—'));
    }
    if (this._roles.user) {
      push('Bio', (page.about || Auth?._profileVisual?.bio || '—').toString().slice(0, 48));
      push('Site', page.site_slug ? page.site_slug + '.astranov.eu' : '—');
    }
    if (this._roles.social) {
      push('Social', 'Lust field · globe feed');
      push('Peers', String((window.others || []).length + (FieldBrain?.drivers || []).length) + ' nearby');
    }
    list.innerHTML = rows.length ? rows.join('') : '<div class="mpp-data-row"><dt>Field</dt><dd>Tap roles to configure</dd></div>';
    this.updateFoot();
  },

  async refreshConnected() {
    const box = document.getElementById('mpp-connected-users');
    if (!box) return;
    await LazyModules.ensure().catch(() => {});
    const me = Auth?.user?.id;
    const users = new Map();
    (window.others || []).forEach(u => {
      if (!u?.id || u.id === me) return;
      users.set(u.id, { id: u.id, name: u.name || u.display_name || 'User', emoji: u.emoji || '👤', avatar: u.avatar_url || u.avatar });
    });
    (FieldBrain?.drivers || []).forEach(d => {
      if (!d?.id || d.id === me || users.has(d.id)) return;
      users.set(d.id, { id: d.id, name: d.display_name || d.name || 'Driver', emoji: d.avatar_emoji || d.emoji || '🚚', avatar: d.avatar_url });
    });
    const peerN = window.SpaceNetMiner?._peerCount || window.FieldHud?._peerCount || 0;
    if (peerN > 0 && users.size < 6) {
      for (let i = 0; i < Math.min(peerN, 3); i++) {
        const id = 'mesh-' + i;
        if (!users.has(id)) users.set(id, { id, name: 'Mesh peer', emoji: '📡', mesh: true });
      }
    }
    const arr = [...users.values()].slice(0, 12);
    if (!arr.length) {
      box.innerHTML = '<p style="margin:0;font-size:10px;color:#9ab;padding:4px 2px">No connected users on map yet</p>';
      return;
    }
    box.innerHTML = arr.map(u => {
      const img = u.avatar
        ? '<img src="' + u.avatar + '" alt="" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'mpp-cu-emoji\',textContent:\'' + (u.emoji || '👤') + '\'}))" />'
        : '<span class="mpp-cu-emoji">' + (u.emoji || '👤') + '</span>';
      return '<button type="button" class="mpp-connected-user" data-uid="' + u.id + '" data-mesh="' + (u.mesh ? '1' : '0') + '">'
        + img + '<span class="mpp-cu-name">' + (u.name || 'User') + '</span>'
        + '<span class="mpp-cu-call">📹</span></button>';
    }).join('');
    box.querySelectorAll('.mpp-connected-user').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        if (btn.dataset.mesh === '1') {
          AciCli?.print?.('Mesh peer · P2P channel only', 'dim');
          return;
        }
        void LazyModules.ensure().then(() => MapComms?.contactUser?.(btn.dataset.uid, 'video'));
      };
    });
  },

  setMediaPreview(file, kind) {
    this._mediaFile = file;
    this._mediaKind = kind;
    const box = document.getElementById('mpp-media-preview');
    if (!box) return;
    const url = URL.createObjectURL(file);
    box.classList.add('has-media');
    const old = box.querySelector('img,video');
    if (old) { try { URL.revokeObjectURL(old.src); } catch (_) {} old.remove(); }
    const el = document.createElement(kind === 'video' ? 'video' : 'img');
    el.src = url;
    if (kind === 'video') { el.muted = true; el.playsInline = true; el.autoplay = true; }
    box.insertBefore(el, document.getElementById('mpp-media-clear'));
    this.updateFoot();
  },

  clearMediaPreview() {
    this._mediaFile = null;
    this._mediaKind = null;
    const box = document.getElementById('mpp-media-preview');
    if (!box) return;
    box.classList.remove('has-media');
    box.querySelectorAll('img,video').forEach(el => {
      try { URL.revokeObjectURL(el.src); } catch (_) {}
      el.remove();
    });
    this.updateFoot();
  },

  async uploadImage(kind, file) {
    if (!Auth?.user) {
      Auth?.openLoginModal?.('Sign in to set profile photos');
      return;
    }
    await LazyModules.ensure().catch(() => {});
    let url = '';
    try {
      if (window.ProfileSite?._uploadShopImage) {
        url = await ProfileSite._uploadShopImage(file);
      } else {
        url = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
      }
    } catch (e) {
      AciCli?.print?.('Photo upload failed · ' + (e.message || e), 'err');
      return;
    }
    const cover = document.getElementById('mpp-cover');
    const avatar = document.getElementById('mpp-avatar');
    const fallback = document.getElementById('mpp-avatar-fallback');
    if (kind === 'cover' && cover) cover.style.backgroundImage = 'url(' + url + ')';
    if (kind === 'avatar' && avatar && fallback) {
      avatar.src = url;
      avatar.hidden = false;
      fallback.style.display = 'none';
    }
    try {
      const headers = await Auth.authHeaders?.();
      const prof = await Auth.client.from('profiles').select('profile_page').eq('id', Auth.user.id).maybeSingle();
      const page = (prof?.data?.profile_page && typeof prof.data.profile_page === 'object') ? prof.data.profile_page : {};
      if (kind === 'cover') page.cover_url = url;
      else page.avatar_url = url;
      page.updated_at = new Date().toISOString();
      await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ profile_page: page, updated_at: new Date().toISOString() }),
      });
      Auth._profilePage = page;
      MapPins?.syncGlobe?.();
      AciCli?.print?.(kind + ' photo updated', 'ok');
    } catch (_) {}
    this.refreshDataList();
  },

  async instantPost() {
    const cap = (document.getElementById('mpp-post-caption')?.value || '').trim();
    if (!Auth?.user) {
      Auth?.openLoginModal?.('Sign in to post');
      return;
    }
    if (!cap && !this._mediaFile) {
      AciCli?.print?.('Add caption or photo/video', 'dim');
      return;
    }
    await LazyModules.ensure().catch(() => {});
    const p = this._pinCoords();
    const lat = p.lat;
    const lng = p.lng;
    window._lastPos = { lat, lng };
    if (this._mediaFile && this._mediaKind === 'video') {
      window._pendingShopLatLng = { lat, lng };
      SuperAdd?.open?.({ camera: true, media: true });
      const saCap = document.getElementById('sa-caption');
      if (saCap && cap) saCap.value = cap;
      this.close();
      return;
    }
    if (this._mediaFile && this._mediaKind === 'photo') {
      const text = cap || 'Photo · ' + this.formatCoords(lat, lng);
      MapDepict?.action?.('explore', { lat, lng, detail: text.slice(0, 80) });
      FieldBrain?.pulse?.('media', text.slice(0, 80), { role: 'client', props: { lust: true, lat, lng, photo: true } });
      if (window.SuperAdd?._placeMarker) SuperAdd._placeMarker(lat, lng, text, 'lust');
      else GlobeEntity?.syncPost?.({
        id: 'photo-' + Date.now(), lat, lng, text, channel: 'lust', mode: 'photo',
        author: Auth.user.email?.split('@')[0],
      });
      ACIControl?.reply?.('Photo posted at pin');
      this.clearMediaPreview();
      document.getElementById('mpp-post-caption').value = '';
      AciCli?.print?.('photo post · ' + this.formatCoords(lat, lng), 'ok');
      return;
    }
    await this.runAction('post_lust');
  },

  isOpen() {
    return document.getElementById('menu-profile-post-tile')?.classList.contains('open');
  },

  isPinPick() {
    return this._pinPick && this.isOpen();
  },

  togglePinPick() {
    this._pinPick = !this._pinPick;
    const btn = document.getElementById('mpp-pin-pick');
    const tile = document.getElementById('menu-profile-post-tile');
    btn?.classList.toggle('active', this._pinPick);
    tile?.classList.toggle('mpp-pin-pick', this._pinPick);
    const msg = this._pinPick ? 'Tap globe or city map to move pin' : 'Pin pick off';
    GlobeDeck?.setPreview?.('📍 ' + msg);
    AciCli?.print?.(msg, this._pinPick ? 'ok' : 'dim');
  },

  consumeMapPick(lat, lng) {
    if (!this.isPinPick()) return false;
    this.setPin(lat, lng);
    return true;
  },

  setPin(lat, lng) {
    if (lat == null || lng == null) return;
    this._pin = { lat, lng };
    window._pendingShopLatLng = { lat, lng };
    const coords = document.getElementById('mpp-coords');
    if (coords) coords.textContent = '📍 ' + this.formatCoords(lat, lng);
    MapDepict?.pulse?.(lat, lng, 0x00ddff, 'pin', 6000);
    void GlobeNavigate?.ensureCityAt?.(lat, lng);
    this._pinPick = false;
    document.getElementById('mpp-pin-pick')?.classList.remove('active');
    document.getElementById('menu-profile-post-tile')?.classList.remove('mpp-pin-pick');
    void this._refreshVendors();
    this.refreshDataList();
  },

  async _refreshVendors() {
    const box = document.getElementById('mpp-vendors');
    if (!box || !this._pin) return;
    await LazyModules.ensure().catch(() => {});
    try { await Commerce?.loadVendors?.(); } catch (_) {}
    const u = this._pin;
    const rows = (Commerce?.vendors || [])
      .filter(v => v.lat != null && v.lng != null)
      .map(v => ({ v, km: Commerce?.haversineKm?.(u.lat, u.lng, v.lat, v.lng) ?? 99 }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 4);
    if (!rows.length) {
      box.innerHTML = '<p style="margin:0;font-size:10px;color:#9ab">No shops loaded — tap browse below</p>';
      this.refreshDataList();
      return;
    }
    box.innerHTML = rows.map(({ v, km }) =>
      '<button type="button" class="mpp-vendor" data-vid="' + v.id + '">'
      + (v.emoji || '🏪') + ' ' + (v.name || 'Shop') + ' · ' + km.toFixed(1) + ' km</button>'
    ).join('');
    box.querySelectorAll('.mpp-vendor').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const v = (Commerce?.vendors || []).find(x => x.id === btn.dataset.vid);
        if (v) void this._openVendor(v);
      };
    });
    this.refreshDataList();
  },

  async _openVendor(v) {
    await LazyModules.ensure().catch(() => {});
    VendorMapTile?.open?.(v);
    this.close();
  },

  openPlusField() {
    try {
      this.init();
      this._closeSuperAddDeck();
      GlobeDeck?.expand?.(SuperCli?.title || 'Astranov SpaceNet');
      const pos = window._lastPos
        || TrackballGuard?.facingLatLng?.()
        || { lat: 36.44, lng: 28.22 };
      this.openAt(Number(pos.lat) || 36.44, Number(pos.lng) || 28.22);
    } catch (e) {
      console.error('[MPP openPlusField]', e);
      const tile = document.getElementById('menu-profile-post-tile');
      if (tile) {
        tile.classList.add('open');
        tile.style.display = 'flex';
      }
    }
  },

  openAt(lat, lng) {
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
      lat = 36.44; lng = 28.22;
    }
    this.init();
    this._closeSuperAddDeck();
    try { MapPlaceMenu?.close?.(); } catch (_) {}
    try { VendorMapTile?.close?.(); } catch (_) {}
    this._pin = { lat, lng };
    window._pendingShopLatLng = { lat, lng };
    window._lastPos = { lat, lng };
    const tile = document.getElementById('menu-profile-post-tile');
    if (!tile) {
      AciCli?.print?.('multi-tile DOM missing', 'err');
      return;
    }
    // Force visible — do not wait on city entry or deferred pack
    tile.hidden = false;
    tile.style.display = 'flex';
    tile.classList.add('open');
    tile.classList.remove('mpp-dragged');
    tile.style.left = '';
    tile.style.top = '';
    tile.style.transform = '';
    tile.style.zIndex = '190';
    const coords = document.getElementById('mpp-coords');
    if (coords) coords.textContent = '📍 ' + this.formatCoords(lat, lng);
    try { this.renderMultiCreated(); } catch (_) {}
    try { this._bindMultiRail(); } catch (_) {}
    try { this.updateRoleSections(); } catch (_) {}
    SuperCli?.setContext?.('add');
    GlobeDeck?.setPreview?.('▸ Multi-tile · Data · Social · Vendors · Order · Pilot');
    AciCli?.print?.('▸ multi-tile open · ' + this.formatCoords(lat, lng), 'map');
    // Light refresh only — never block open with ensureCityAt / LazyModules.ensure
    setTimeout(() => {
      try { void this.refreshProfile(); } catch (_) {}
      try { void this._refreshVendors(); } catch (_) {}
      try { void this.refreshConnected(); } catch (_) {}
      try { void this.refreshMarketplace(); } catch (_) {}
    }, 80);
  },

  close() {
    this._pinPick = false;
    this._pin = null;
    this.clearMediaPreview();
    const tile = document.getElementById('menu-profile-post-tile');
    if (tile) {
      tile.classList.remove('open', 'mpp-pin-pick');
      tile.style.display = '';
    }
    document.getElementById('mpp-pin-pick')?.classList.remove('active');
    if (GlobeDeck?.activeTask === 'add') GlobeDeck?.completeTask?.('add');
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
  },

  _pinCoords() {
    return this._pin || window._lastPos || { lat: 36.44, lng: 28.22 };
  },

  async applyPrimary() {
    const cap = (document.getElementById('mpp-post-caption')?.value || '').trim();
    if (this._roles.social && (cap || this._mediaFile)) {
      await this.instantPost();
      return;
    }
    if (this._roles.pilot) { await this.runAction('pilot_build'); return; }
    if (this._roles.vendor) { await this.runAction('browse_shops'); return; }
    if (this._roles.driver) { await this.runAction('set_driver_base'); return; }
    if (this._roles.client) {
      const items = Commerce?.cartItems?.() || [];
      if (items.length) { await this.runAction('place_cart'); return; }
      await this.runAction('set_delivery');
      return;
    }
    await this.runAction('set_delivery');
  },

  async toggleDriverOnline() {
    await LazyModules.ensure().catch(() => {});
    if (!Auth?.user) {
      Auth?.openLoginModal?.('Sign in to drive');
      return;
    }
    const btn = document.getElementById('mpp-driver-online');
    const p = this._pinCoords();
    if (!this._driverOnline) {
      const r = await FieldBrain?.goOnlineDriver?.(p.lat, p.lng);
      if (r?.ok) {
        this._driverOnline = true;
        btn?.classList.add('on');
        btn?.setAttribute('aria-pressed', 'true');
      }
    } else {
      const r = await FieldBrain?.goOfflineDriver?.();
      if (r?.ok) {
        this._driverOnline = false;
        btn?.classList.remove('on');
        btn?.setAttribute('aria-pressed', 'false');
      }
    }
    this.refreshDataList();
  },

  async saveDriverSchedule(value) {
    if (!Auth?.user) return;
    const sched = value || 'now';
    if (sched === 'off') {
      await this.toggleDriverOnline();
      if (this._driverOnline) await this.toggleDriverOnline();
      return;
    }
    if (sched === 'now') {
      const p = this._pinCoords();
      await FieldBrain?.goOnlineDriver?.(p.lat, p.lng);
      this._driverOnline = true;
      document.getElementById('mpp-driver-online')?.classList.add('on');
    }
    try {
      const headers = await Auth.authHeaders?.();
      const prof = await Auth.client.from('profiles').select('profile_page').eq('id', Auth.user.id).maybeSingle();
      const page = (prof?.data?.profile_page && typeof prof.data.profile_page === 'object') ? prof.data.profile_page : {};
      page.driver_schedule = sched;
      page.driver_schedule_at = new Date().toISOString();
      await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ profile_page: page, updated_at: new Date().toISOString() }),
      });
      AciCli?.print?.('driver schedule · ' + sched, 'ok');
    } catch (_) {}
    this.refreshDataList();
  },

  async runAction(act, opts) {
    opts = opts || {};
    await LazyModules.ensure().catch(() => {});
    const p = this._pinCoords();
    const lat = p.lat;
    const lng = p.lng;
    if (act === 'set_delivery') {
      await MapPins?.setClientDelivery?.(lat, lng, 'Customer delivery · ' + this.formatCoords(lat, lng));
      this.refreshDataList();
      return;
    }
    if (act === 'open_profile') {
      if (!Auth?.user) { Auth?.openLoginModal?.('Sign in'); return; }
      Auth?.openLoggedInProfile?.() || ProfileSite?.openSelf?.();
      return;
    }
    if (act === 'browse_shops') {
      window._lastPos = { lat, lng };
      await Commerce?.showPicker?.();
      void this.refreshMarketplace();
      return;
    }
    if (act === 'place_cart') {
      if (!Auth?.user) {
        Auth?.openLoginModal?.('Sign in to place order');
        return;
      }
      await MapPins?.setClientDelivery?.(lat, lng, 'Customer delivery · ' + this.formatCoords(lat, lng));
      if (!Commerce?.selected) {
        try { await Commerce?.loadVendors?.(); } catch (_) {}
        const near = (Commerce?.vendors || [])
          .filter(v => v.lat != null && v.lng != null)
          .map(v => ({ v, km: Commerce?.haversineKm?.(lat, lng, v.lat, v.lng) ?? 99 }))
          .sort((a, b) => a.km - b.km)[0];
        if (near) Commerce.selected = near.v;
        else {
          AciCli?.print?.('No shops loaded — browse to pick vendor', 'dim');
          await Commerce?.showPicker?.();
          return;
        }
      }
      if (!Commerce?.hasMenu?.(Commerce.selected)) {
        AciCli?.print?.('No menu yet — open shop & request menu, or add items', 'dim');
        await Commerce?.openVendor?.(Commerce.selected) || Commerce?.showPicker?.();
        return;
      }
      const items = Commerce?.cartItems?.() || [];
      if (!items.length) {
        AciCli?.print?.('Cart empty — browse shops & add items', 'dim');
        await Commerce?.openVendor?.(Commerce.selected) || Commerce?.showPicker?.();
        return;
      }
      await Commerce?.placeCart?.();
      await new Promise(r => setTimeout(r, 400));
      await MarketplaceDeliveryEngine?.loadMyActive?.();
      const missions = MarketplaceDeliveryEngine?.missions || [];
      const open = ['pending', 'seeking_driver', 'assigned', 'active', 'en_route', 'picked_up'];
      const mission = missions.find(m => open.includes(m.order?.status || m.status));
      if (mission) {
        MarketplaceDeliveryEngine?.showHud?.(mission);
        GlobeDeck?.expand?.(SuperCli?.title || 'Astranov Command Line');
        this.close();
      }
      void this.refreshMarketplace();
      this.refreshDataList();
      return;
    }
    if (act === 'track_delivery') {
      if (!Auth?.user) {
        Auth?.openLoginModal?.('Sign in to track delivery');
        return;
      }
      const me = Auth?.user?.id;
      await MarketplaceDeliveryEngine?.loadMyActive?.();
      if (!MarketplaceDeliveryEngine?.missions?.length) {
        try {
          const order = await OrderTracking?.fetchLatest?.();
          if (order) {
            OrderTracking.active = order;
            await OrderTracking.refresh?.({ quiet: true });
            await MarketplaceDeliveryEngine?.loadMyActive?.();
          }
        } catch (_) {}
      }
      const open = ['pending', 'seeking_driver', 'assigned', 'active', 'en_route', 'picked_up'];
      let mine = (MarketplaceDeliveryEngine?.missions || [])
        .filter(m => open.includes(m.order?.status || m.status));
      if (me) {
        const owned = mine.filter(m =>
          m.order?.customer_id === me || m.order?.client_id === me
          || m.order?.user_id === me || m.order?.driver_id === me);
        if (owned.length) mine = owned;
      }
      if (!mine.length) {
        AciCli?.print?.('No active delivery — place an order first', 'dim');
        ACIControl?.reply?.('No delivery in progress · browse shops & place order');
        return;
      }
      MarketplaceDeliveryEngine?.showHud?.(mine[0]);
      GlobeDeck?.expand?.(SuperCli?.title || 'Astranov Command Line');
      this.close();
      return;
    }
    if (act === 'driver_jobs') {
      if (!Auth?.user) {
        Auth?.openLoginModal?.('Sign in as driver');
        return;
      }
      const box = document.getElementById('mpp-driver-jobs');
      if (box) box.innerHTML = '<p style="margin:0;font-size:10px;color:#9ab">Loading open jobs…</p>';
      const r = await FieldBrain?.listOpenJobs?.();
      const jobs = r?.orders || r?.jobs || r?.open || (Array.isArray(r) ? r : []);
      if (!box) {
        AciCli?.print?.(jobs.length ? jobs.length + ' open jobs · use CLI: driver jobs' : 'No open delivery jobs', jobs.length ? 'ok' : 'dim');
        return;
      }
      if (!jobs.length) {
        box.innerHTML = '<p style="margin:0;font-size:10px;color:#9ab">No open jobs nearby — stay online</p>';
        AciCli?.print?.('No open delivery jobs', 'dim');
        return;
      }
      box.innerHTML = jobs.slice(0, 8).map(o => {
        const id = o.id || o.order_id || o.short_id;
        const short = o.short_id || String(id).slice(0, 8);
        const vname = o.vendor_name || o.vendor?.name || 'Shop';
        const st = o.status || 'open';
        return '<button type="button" class="mpp-act" data-mpp-claim="' + String(id).replace(/"/g, '') + '">'
          + '✓ Claim ' + short + ' · ' + vname + ' · ' + st + '</button>';
      }).join('');
      box.querySelectorAll('[data-mpp-claim]').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          void this.runAction('claim_job', { orderId: btn.dataset.mppClaim });
        };
      });
      AciCli?.print?.(jobs.length + ' open delivery jobs', 'ok');
      return;
    }
    if (act === 'claim_job') {
      if (!Auth?.user) {
        Auth?.openLoginModal?.('Sign in as driver');
        return;
      }
      const oid = opts.orderId;
      if (!oid) {
        AciCli?.print?.('Pick a job from the list', 'dim');
        return;
      }
      const j = await FieldBrain?.claimDelivery?.(oid);
      if (j?.ok || j?.order) {
        await MarketplaceDeliveryEngine?.loadMyActive?.();
        const m = (MarketplaceDeliveryEngine?.missions || []).find(x =>
          String(x.id) === String(oid) || String(x.order?.id) === String(oid)
          || x.order?.short_id === oid);
        if (m) MarketplaceDeliveryEngine?.showHud?.(m);
        this.close();
      }
      return;
    }
    if (act === 'pilot_build') {
      const box = document.getElementById('mpp-pilot-schedule');
      if (box) box.innerHTML = 'Building schedule…';
      const built = await MarketplaceDeliveryEngine?.pilotBuildSchedule?.({
        base: window._driverBase || { lat, lng },
      });
      if (!built || built.error || !built.schedule?.length) {
        if (box) box.innerHTML = 'No open orders — place or claim deliveries first';
        ACIControl?.reply?.('Pilot · no open orders to schedule');
        return;
      }
      if (box) {
        box.innerHTML = built.schedule.map((row, i) => {
          const o = row.mission.order || {};
          return '<div class="mps-row"><span>#' + (i + 1) + ' ' + (o.short_id || o.id?.slice?.(0, 6) || 'ord')
            + ' · ' + row.st + ' · P' + row.priority + '</span><span>' + row.dist.toFixed(1) + ' km · score '
            + Math.round(row.score) + '</span></div>';
        }).join('');
      }
      this._roles.pilot = true;
      document.querySelectorAll('.mpp-role-chip[data-mpp-role="pilot"]').forEach(b => b.classList.add('on'));
      this.updateRoleSections();
      AciCli?.print?.('pilot schedule · ' + built.schedule.length + ' by state · distance · priority', 'ok');
      ACIControl?.reply?.('Pilot multi-stop ready · ' + built.schedule.length + ' orders · start when ready');
      return;
    }
    if (act === 'pilot_start') {
      const m = await MarketplaceDeliveryEngine?.pilotStartRouting?.();
      if (m) {
        this.createMultiTile({ kind: 'pilot', label: 'Pilot · ' + (m.order?.short_id || 'route'), icon: '🛸', pilot: true });
        this.close();
      }
      return;
    }
    if (act === 'create_multi_tile') {
      const cap = (document.getElementById('mpp-post-caption')?.value || '').trim();
      let media = null;
      const prev = document.querySelector('#mpp-media-preview img, #mpp-media-preview video');
      if (prev?.src) media = prev.src;
      this.createMultiTile({
        kind: this._roles.pilot ? 'pilot' : (this._roles.social ? 'social' : (this._roles.vendor ? 'vendor' : 'data')),
        label: cap.slice(0, 18) || (this._roles.pilot ? 'Pilot route' : 'Field tile'),
        icon: this._roles.pilot ? '🛸' : (this._roles.social ? '🎬' : (this._roles.vendor ? '🏪' : '◎')),
        media,
        pilot: !!this._roles.pilot,
      });
      return;
    }
    if (act === 'list_shop') {
      if (!Auth?.user) { Auth?.openLoginModal?.('Sign in to list shop'); return; }
      await Commerce?.enlistVendorAt?.(lat, lng, { name: '' });
      this.close();
      return;
    }
    if (act === 'set_driver_base') {
      if (!Auth?.user) { Auth?.openLoginModal?.('Sign in as driver'); return; }
      await MapPins?.setDriverBase?.(lat, lng, 'Driver base · ' + this.formatCoords(lat, lng));
      this.refreshDataList();
      return;
    }
    if (act === 'post_lust') {
      if (!Auth?.user) { Auth?.openLoginModal?.('Sign in to post'); return; }
      const cap = (document.getElementById('mpp-post-caption')?.value || '').trim() || 'Lust · ' + this.formatCoords(lat, lng);
      window._lastPos = { lat, lng };
      MapDepict?.action?.('explore', { lat, lng, detail: cap.slice(0, 80) });
      FieldBrain?.pulse?.('media', cap.slice(0, 80), { role: 'client', props: { lust: true, lat, lng } });
      if (window.SuperAdd?._placeMarker) SuperAdd._placeMarker(lat, lng, cap, 'lust');
      else GlobeEntity?.syncPost?.({ id: 'lust-' + Date.now(), lat, lng, text: cap, channel: 'lust', mode: 'text', author: Auth.user.email?.split('@')[0] });
      ACIControl?.reply?.('Posted at pin · ' + cap.slice(0, 60));
      AciCli?.print?.('lust post · ' + this.formatCoords(lat, lng), 'ok');
      document.getElementById('mpp-post-caption').value = '';
      this.clearMediaPreview();
      return;
    }
    if (act === 'post_media') {
      window._pendingShopLatLng = { lat, lng };
      window._lastPos = { lat, lng };
      SuperAdd?.open?.({ camera: true, media: true });
      const cap = document.getElementById('mpp-post-caption');
      const saCap = document.getElementById('sa-caption');
      if (cap?.value && saCap) saCap.value = cap.value;
      this.close();
    }
  },
};
window.MenuProfilePostTile = MenuProfilePostTile;

function mppPatchesOk() {
  return !!document.getElementById('aci-video-call')
    && !!document.getElementById('aci-locate')?.classList.contains('app-shortcut-btn')
    && !!window.SuperCli?._mppCliPatched;
}

function mppRunPatches() {
  MenuProfilePostTile._bindPlusFab();
  MenuProfilePostTile._patchCliBar();
  MenuProfilePostTile._patchLocate();
  MenuProfilePostTile._patchVideoCall();
  MenuProfilePostTile._patchSuperAdd();
}

function mppPatchBoot() {
  mppRunPatches();
  let n = 0;
  const retry = setInterval(() => {
    n++;
    mppRunPatches();
    if (mppPatchesOk() || n >= 8) clearInterval(retry);
  }, 800);
  window.addEventListener('load', () => mppRunPatches());
  if (window.FieldBrain && !FieldBrain.goOfflineDriver) {
    FieldBrain.goOfflineDriver = async function() {
      if (!Auth?.user) return { error: 'login' };
      try {
        const headers = await Auth.authHeaders?.();
        const stale = new Date(Date.now() - 48 * 3600000).toISOString();
        await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
          method: 'PATCH', headers,
          body: JSON.stringify({ field_seen_at: stale, updated_at: new Date().toISOString() }),
        });
        ACIControl?.reply?.('Driver off duty');
        return { ok: true };
      } catch (e) { return { error: String(e.message || e) }; }
    };
    const _go = FieldBrain.goOnlineDriver?.bind(FieldBrain);
    if (_go) FieldBrain.goOnlineDriver = async function(lat, lng) {
      if (lat != null) { window._lastPos = { lat, lng }; window._driverBase = { lat, lng, label: 'Driver base' }; }
      return _go();
    };
  }
  if (window.GlobeNavigate?.handlePlaceClick && !GlobeNavigate._mppPatched) {
    GlobeNavigate._mppPatched = true;
    const _hpc = GlobeNavigate.handlePlaceClick.bind(GlobeNavigate);
    GlobeNavigate.handlePlaceClick = async function(lat, lng, opts) {
      if (MenuProfilePostTile?.consumeMapPick?.(lat, lng)) return 'mpp-pin';
      return _hpc(lat, lng, opts);
    };
  }
  if (window.MapOverlayDismiss) {
    if (!MapOverlayDismiss.PANEL_IDS.includes('menu-profile-post-tile')) {
      MapOverlayDismiss.PANEL_IDS.unshift('menu-profile-post-tile');
    }
    const _close = MapOverlayDismiss.closeAll.bind(MapOverlayDismiss);
    MapOverlayDismiss.closeAll = function() {
      MenuProfilePostTile?.close?.();
      return _close();
    };
    const _hmc = MapOverlayDismiss.handleMapClick.bind(MapOverlayDismiss);
    MapOverlayDismiss.handleMapClick = function(e) {
      if (MenuProfilePostTile?.isPinPick?.()) return false;
      return _hmc(e);
    };
  }
  if (window.MapPlaceMenu?.openPlusField) {
    MapPlaceMenu.openPlusField = function() { return MenuProfilePostTile.openPlusField(); };
  }
  MenuProfilePostTile.init();
  document.getElementById('mpp-post-caption')?.addEventListener('input', () => MenuProfilePostTile.updateFoot());
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mppPatchBoot);
else mppPatchBoot();