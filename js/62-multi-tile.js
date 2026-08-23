// === MULTI-TILE — unified profile for ALL zoom levels ===
// city · national · global · stellar — same movie-style tile.
// + button OR long-press (map/globe) → this tile.
// Single-click map/globe → MapRadar (CLI search e.g. pharmacy).
// Layout: cover · avatar · role toggles · scroll body · post / connect.
var MultiTile = {
  _open: false,
  _pin: null,
  _tier: 'global',
  _targetUser: null, // other user's profile when opened from marker
  _roles: { user: true, public: false, vendor: false, driver: false },
  _draft: null,
  _bound: false,
  _waypoints: [],
  STORAGE: 'astranov:multi-tile-v1',

  /** Resolve current product zoom band for the tile chrome */
  currentTier() {
    try {
      if (CityMap?.active) return 'city';
      const id = ZoomTiers?.current?.()?.id || CosmicZoom?.level || 'global';
      if (id === 'solar' || id === 'system' || id === 'galaxy' || CosmicZoom?.level === 'system') return 'stellar';
      if (id === 'city' || id === 'neighborhood') return 'city';
      if (id === 'national' || id === 'regional') return 'national';
      if (id === 'global' || id === 'earth' || CosmicZoom?.level === 'earth') return 'global';
      return 'global';
    } catch (_) {
      return 'global';
    }
  },

  tierLabel(t) {
    const m = {
      city: 'City',
      national: 'National',
      global: 'Global',
      stellar: 'Stellar',
    };
    return m[t] || t || 'Global';
  },

  init() {
    if (this._bound) return;
    this._bound = true;
    this._ensureDom();
    this._loadDraft();
    document.getElementById('mt-close')?.addEventListener('click', () => this.close());
    document.getElementById('mt-backdrop')?.addEventListener('click', () => this.close());
    document.getElementById('mt-post')?.addEventListener('click', () => this.postHere());
    document.getElementById('mt-camera')?.addEventListener('click', () => this.postHere({ camera: true }));
    document.getElementById('mt-save')?.addEventListener('click', () => this.save());
    document.getElementById('mt-call')?.addEventListener('click', () => this.connect('video'));
    document.getElementById('mt-msg')?.addEventListener('click', () => this.connect('message'));
    document.getElementById('mt-team')?.addEventListener('click', () => this.connect('team'));
    document.getElementById('mt-launch')?.addEventListener('click', () => this.launchTask());
    document.getElementById('mt-kind')?.addEventListener('change', () => this._syncTaskCriteria());
    document.getElementById('mt-wp-add')?.addEventListener('click', () => this.addWaypointFromPin());
    document.getElementById('mt-wp-preview')?.addEventListener('click', () => this.previewWaypointRoute());
    document.getElementById('mt-wp-clear')?.addEventListener('click', () => {
      this._waypoints = [];
      this._renderWaypoints();
      try { CityMap?.clearTaskGeometry?.(); } catch (_) {}
    });
    document.querySelectorAll('.mt-role-tog').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleRole(btn.dataset.role));
    });
    // + FAB → multi-tile (not deferred Super Add alone)
    const fab = document.getElementById('super-add-fab');
    if (fab && !fab._multiTileBound) {
      fab._multiTileBound = true;
      fab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openFromPlus();
      }, true);
    }
  },

  _ensureDom() {
    if (document.getElementById('multi-tile')) return;
    const wrap = document.createElement('div');
    wrap.id = 'multi-tile-root';
    wrap.innerHTML = ''
      + '<div id="mt-backdrop" aria-hidden="true"></div>'
      + '<div id="multi-tile" role="dialog" aria-label="Place multi-tile">'
      + '  <div id="mt-cover">'
      + '    <button type="button" id="mt-cover-btn" title="Cover photo">📷 Cover</button>'
      + '    <button type="button" id="mt-close" aria-label="Close">✖</button>'
      + '  </div>'
      + '  <div id="mt-head">'
      + '    <div id="mt-avatar" title="Profile photo">👤</div>'
      + '    <div id="mt-head-text">'
      + '      <div id="mt-name">You</div>'
      + '      <div id="mt-place">—</div>'
      + '    </div>'
      + '  </div>'
      + '  <div id="mt-roles" class="mt-roles">'
      + '    <button type="button" class="mt-role-tog active" data-role="user">👤 User</button>'
      + '    <button type="button" class="mt-role-tog" data-role="public">✦ Public</button>'
      + '    <button type="button" class="mt-role-tog" data-role="vendor">🏬 Vendor</button>'
      + '    <button type="button" class="mt-role-tog" data-role="driver">🚚 Driver</button>'
      + '  </div>'
      + '  <div id="mt-scroll">'
      + '    <div id="mt-sec-user" class="mt-sec"></div>'
      + '    <div id="mt-sec-public" class="mt-sec" hidden></div>'
      + '    <div id="mt-sec-vendor" class="mt-sec" hidden></div>'
      + '    <div id="mt-sec-driver" class="mt-sec" hidden></div>'
      + '    <div id="mt-sec-task" class="mt-sec">'
      + '      <div class="mt-label">Launch task · Coins</div>'
      + '      <div id="mt-coins-bal" class="mt-hint">— 🪙</div>'
      + '      <div class="mt-task-row">'
      + '        <select id="mt-kind">'
      + '          <option value="help">🤝 Help</option>'
      + '          <option value="job">💼 Work / gig</option>'
      + '          <option value="vendor">🏬 Vendor task</option>'
      + '          <option value="delivery">📦 Delivery</option>'
      + '          <option value="errand">🏃 Errand</option>'
      + '          <option value="dating">💕 Dating</option>'
      + '          <option value="service">🛠️ Service</option>'
      + '        </select>'
      + '        <input id="mt-coins" type="number" min="0" step="1" value="50" title="Coins offered for this task" placeholder="🪙" />'
      + '      </div>'
      + '      <label class="mt-field">What do you need?'
      + '        <input id="mt-task-title" placeholder="e.g. pharmacy run · barman 3h · coffee date" />'
      + '      </label>'
      + '      <div class="mt-task-row">'
      + '        <label class="mt-inline">Map radius km'
      + '          <input id="mt-radius" type="number" min="0.5" max="50" step="0.5" value="3" />'
      + '        </label>'
      + '        <label class="mt-inline">Duration'
      + '          <input id="mt-duration" value="1h" placeholder="1h · 3h · 45m" />'
      + '        </label>'
      + '      </div>'
      + '      <div id="mt-criteria-dating" class="mt-criteria" hidden>'
      + '        <div class="mt-task-row">'
      + '          <label class="mt-inline">Age min<input id="mt-age-min" type="number" min="18" placeholder="18" /></label>'
      + '          <label class="mt-inline">Age max<input id="mt-age-max" type="number" min="18" placeholder="99" /></label>'
      + '        </div>'
      + '        <label class="mt-field">Looks / vibe<input id="mt-looks" placeholder="casual · tall · …" /></label>'
      + '      </div>'
      + '      <div id="mt-criteria-work" class="mt-criteria" hidden>'
      + '        <label class="mt-field">Need role / skill<input id="mt-need-role" placeholder="barman · cleaner · driver · …" /></label>'
      + '        <label class="mt-field">Skills / notes<input id="mt-skills" placeholder="experience, language, tools…" /></label>'
      + '      </div>'
      + '      <div id="mt-criteria-delivery" class="mt-criteria" hidden>'
      + '        <label class="mt-field">Vehicle preferred<input id="mt-vehicle-need" placeholder="bike · car · van" /></label>'
      + '      </div>'
      + '      <div class="mt-label">Multi-stop route · waypoints</div>'
      + '      <div id="mt-wp-list" class="mt-wp-list"></div>'
      + '      <div class="mt-task-row mt-wp-tools">'
      + '        <button type="button" id="mt-wp-add" class="mt-wp-btn">＋ Add pin</button>'
      + '        <button type="button" id="mt-wp-preview" class="mt-wp-btn">▣ Preview route</button>'
      + '        <button type="button" id="mt-wp-clear" class="mt-wp-btn ghost">Clear</button>'
      + '      </div>'
      + '      <p class="mt-hint">Add stops at this pin (move map / long-press elsewhere → open tile → Add pin). Per-stop 🪙 + info. Preview draws polygon corridor on map.</p>'
      + '      <label class="mt-field">Notes<textarea id="mt-task-note" rows="2" placeholder="Details for people who can help…"></textarea></label>'
      + '      <button type="button" id="mt-launch" class="mt-launch">🚀 Launch task to nearby users</button>'
      + '      <p class="mt-hint">Broadcasts in map radius with big Accept / Reject. Coins held on launch, paid when both verify every stage. Multi-stop tasks guide the worker through each waypoint.</p>'
      + '    </div>'
      + '  </div>'
      + '  <div id="mt-actions">'
      + '    <button type="button" id="mt-post" class="mt-primary">＋ Post here</button>'
      + '    <button type="button" id="mt-camera" title="Camera">📷</button>'
      + '    <button type="button" id="mt-call" title="Video call">📹</button>'
      + '    <button type="button" id="mt-msg" title="Message">💬</button>'
      + '    <button type="button" id="mt-team" title="Team">👥</button>'
      + '    <button type="button" id="mt-save">Save</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(wrap);
  },

  _syncTaskCriteria() {
    const kind = document.getElementById('mt-kind')?.value || 'help';
    const dating = document.getElementById('mt-criteria-dating');
    const work = document.getElementById('mt-criteria-work');
    const del = document.getElementById('mt-criteria-delivery');
    if (dating) dating.hidden = kind !== 'dating';
    if (work) work.hidden = !(kind === 'job' || kind === 'service' || kind === 'vendor' || kind === 'help');
    if (del) del.hidden = !(kind === 'delivery' || kind === 'errand');
  },

  _refreshCoinsBal() {
    const el = document.getElementById('mt-coins-bal');
    if (!el) return;
    try {
      CityTasks?.init?.();
      const b = CityTasks?.coinsBalance?.();
      if (b) el.textContent = b.available + ' 🪙 available · ' + b.held + ' held (wallet)';
      else el.textContent = 'Coins wallet loads with tasks…';
    } catch (_) {
      el.textContent = '— 🪙';
    }
  },

  addWaypointFromPin() {
    const pin = this._pin || window._lastPos || { lat: 36.44, lng: 28.22 };
    const n = this._waypoints.length + 1;
    const defaultCoins = Math.max(0, Math.round(Number(document.getElementById('mt-coins')?.value) || 0));
    const label = document.getElementById('mt-task-title')?.value?.trim()
      || ('Stop ' + n);
    this._waypoints.push({
      id: 'wp_draft_' + Date.now().toString(36) + '_' + n,
      lat: +pin.lat,
      lng: +pin.lng,
      label: n === 1 ? label : (label + ' · ' + n),
      info: '',
      coins: n === 1 ? defaultCoins : Math.round(defaultCoins / Math.max(1, n)),
    });
    this._renderWaypoints();
    this.previewWaypointRoute();
  },

  _renderWaypoints() {
    const box = document.getElementById('mt-wp-list');
    if (!box) return;
    if (!this._waypoints.length) {
      box.innerHTML = '<div class="mt-hint">No stops yet — Add pin for multi-stop route.</div>';
      return;
    }
    box.innerHTML = this._waypoints.map((w, i) => {
      return '<div class="mt-wp-row" data-i="' + i + '">'
        + '<div class="mt-wp-head"><b>' + (i + 1) + '</b>'
        + '<button type="button" class="mt-wp-rm" data-rm="' + i + '" title="Remove">×</button></div>'
        + '<input class="mt-wp-label" data-f="label" data-i="' + i + '" value="' + this._escAttr(w.label) + '" placeholder="Stop name" />'
        + '<div class="mt-task-row">'
        + '<input class="mt-wp-coins" data-f="coins" data-i="' + i + '" type="number" min="0" value="' + (w.coins || 0) + '" title="Coins for this stop" />'
        + '<span class="mt-hint">' + (+w.lat).toFixed(4) + ', ' + (+w.lng).toFixed(4) + '</span>'
        + '</div>'
        + '<input class="mt-wp-info" data-f="info" data-i="' + i + '" value="' + this._escAttr(w.info || '') + '" placeholder="What to do here…" />'
        + '</div>';
    }).join('');
    box.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-rm'));
        this._waypoints.splice(i, 1);
        this._renderWaypoints();
        this.previewWaypointRoute();
      });
    });
    box.querySelectorAll('[data-f]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const i = Number(inp.getAttribute('data-i'));
        const f = inp.getAttribute('data-f');
        if (!this._waypoints[i]) return;
        if (f === 'coins') this._waypoints[i].coins = Math.max(0, Math.round(Number(inp.value) || 0));
        else this._waypoints[i][f] = String(inp.value || '').slice(0, f === 'info' ? 240 : 48);
        // Keep total coins field in sync with sum
        const sum = this._waypoints.reduce((s, w) => s + (w.coins || 0), 0);
        const coinsEl = document.getElementById('mt-coins');
        if (coinsEl && sum > 0) coinsEl.value = String(sum);
      });
    });
  },

  _escAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  },

  async previewWaypointRoute() {
    if (!this._waypoints.length) {
      // single pin preview
      const pin = this._pin || window._lastPos;
      if (!pin) return;
      try {
        CityMap?.setTaskGeometry?.({
          waypoints: [{ lat: pin.lat, lng: pin.lng, label: 'Task', current: true }],
          polygon: null,
          route: [],
        });
      } catch (_) {}
      return;
    }
    try {
      await LazyModules?.ensure?.().catch(() => {});
      CityTasks?.init?.();
      await CityTasks.previewTaskRoute?.({
        title: document.getElementById('mt-task-title')?.value || 'Preview',
        waypoints: this._waypoints,
      });
    } catch (_) {
      try {
        CityMap?.setTaskGeometry?.({
          waypoints: this._waypoints.map((w, i) => ({ ...w, current: i === 0 })),
          polygon: CityTasks?.buildPolygon?.(this._waypoints),
          route: [],
        });
      } catch (_) {}
    }
  },

  async launchTask() {
    const kind = document.getElementById('mt-kind')?.value || 'help';
    const title = document.getElementById('mt-task-title')?.value?.trim()
      || document.getElementById('mt-task-note')?.value?.trim()
      || (kind + ' task');
    let coins = Math.max(0, Math.round(Number(document.getElementById('mt-coins')?.value) || 0));
    const radius_km = Math.max(0.5, Number(document.getElementById('mt-radius')?.value) || 3);
    const duration = document.getElementById('mt-duration')?.value?.trim() || '1h';
    const note = document.getElementById('mt-task-note')?.value?.trim() || '';
    const criteria = {};
    if (kind === 'dating') {
      const amin = document.getElementById('mt-age-min')?.value;
      const amax = document.getElementById('mt-age-max')?.value;
      const looks = document.getElementById('mt-looks')?.value?.trim();
      if (amin) criteria.age_min = Number(amin);
      if (amax) criteria.age_max = Number(amax);
      if (looks) criteria.looks = looks;
    }
    if (kind === 'job' || kind === 'service' || kind === 'vendor' || kind === 'help') {
      const need = document.getElementById('mt-need-role')?.value?.trim();
      const skills = document.getElementById('mt-skills')?.value?.trim();
      if (need) criteria.need_role = need;
      if (skills) criteria.skills = skills;
    }
    if (kind === 'delivery' || kind === 'errand') {
      const veh = document.getElementById('mt-vehicle-need')?.value?.trim();
      if (veh) criteria.vehicle = veh;
    }
    const pin = this._pin || window._lastPos || { lat: 36.44, lng: 28.22 };

    // Flush waypoint field edits
    document.querySelectorAll('#mt-wp-list [data-f]').forEach((inp) => {
      const i = Number(inp.getAttribute('data-i'));
      const f = inp.getAttribute('data-f');
      if (!this._waypoints[i]) return;
      if (f === 'coins') this._waypoints[i].coins = Math.max(0, Math.round(Number(inp.value) || 0));
      else this._waypoints[i][f] = String(inp.value || '');
    });
    let waypoints = this._waypoints.slice();
    if (!waypoints.length) {
      waypoints = [{
        lat: pin.lat,
        lng: pin.lng,
        label: title,
        info: note,
        coins,
      }];
    }
    const wpSum = waypoints.reduce((s, w) => s + (w.coins || 0), 0);
    if (wpSum > coins) coins = wpSum;

    const run = async () => {
      try { await LazyModules?.ensure?.(); } catch (_) {}
      if (!window.CityTasks) {
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!window.CityTasks) {
        const zl = document.getElementById('zoom-label');
        if (zl) zl.textContent = 'Tasks loading… try again';
        return;
      }
      CityTasks.init?.();
      TaskBoard?.init?.();
      const r = CityTasks.launch({
        kind,
        title,
        coins,
        radius_km,
        duration,
        note,
        criteria,
        lat: waypoints[0]?.lat ?? pin.lat,
        lng: waypoints[0]?.lng ?? pin.lng,
        waypoints,
        age_min: criteria.age_min,
        age_max: criteria.age_max,
        looks: criteria.looks,
        need_role: criteria.need_role,
        skills: criteria.skills,
        vehicle: criteria.vehicle,
      });
      this._refreshCoinsBal();
      if (r?.ok) {
        const zl = document.getElementById('zoom-label');
        const n = waypoints.length;
        if (zl) {
          zl.textContent = 'Launched · ' + coins + '🪙 · '
            + (n > 1 ? n + ' stops · ' : '')
            + radius_km + 'km radius';
        }
        // Paint polygon route for poster immediately
        try { await CityTasks.guideTaskRoute?.(r.task, { previewOnly: true }); } catch (_) {}
        this._waypoints = [];
        this._renderWaypoints();
        try { MultiTile.close?.(); } catch (_) {}
      } else if (r?.error === 'insufficient_coins') {
        const zl = document.getElementById('zoom-label');
        if (zl) zl.textContent = 'Need ' + r.needed + '🪙 · have ' + r.available;
        AciCli?.print?.('insufficient Coins · need ' + r.needed + ' · available ' + r.available, 'err');
      }
    };
    void run();
  },

  _loadDraft() {
    try {
      const raw = localStorage.getItem(this.STORAGE);
      if (raw) this._draft = JSON.parse(raw);
    } catch (_) {}
    if (!this._draft) {
      this._draft = {
        displayName: '',
        bio: '',
        cover: '',
        avatar: '',
        publicTitle: '',
        vendorName: '',
        menu: [],
        vehicle: '',
        vehicleNotes: '',
        roles: { user: true, public: false, vendor: false, driver: false },
      };
    }
    this._roles = Object.assign({ user: true, public: false, vendor: false, driver: false }, this._draft.roles || {});
  },

  _persist() {
    try {
      this._draft.roles = { ...this._roles };
      localStorage.setItem(this.STORAGE, JSON.stringify(this._draft));
    } catch (_) {}
  },

  openFromPlus() {
    const pos = window._lastPos
      || CityMap?.globeCenterLatLng?.()
      || TrackballGuard?.facingLatLng?.()
      || { lat: 36.44, lng: 28.22 };
    this.openAt(pos.lat, pos.lng, { source: 'plus', tier: this.currentTier() });
  },

  /** Open self / place tile at any zoom level */
  openAt(lat, lng, opts) {
    opts = opts || {};
    this.init();
    // Stellar / space: still allow tile — pin may be symbolic (last pos or facing Earth)
    let la = lat;
    let ln = lng;
    if (la == null || ln == null || !Number.isFinite(+la) || !Number.isFinite(+ln)) {
      const fallback = window._lastPos
        || TrackballGuard?.facingLatLng?.()
        || { lat: 0, lng: 0 };
      la = fallback.lat;
      ln = fallback.lng;
    }
    window._globeFly = null;
    this._targetUser = opts.user || opts.profile || null;
    this._tier = opts.tier || this.currentTier();
    this._pin = {
      lat: +la,
      lng: +ln,
      source: opts.source || 'map',
      tier: this._tier,
      label: opts.label || null,
    };
    window._pendingShopLatLng = { lat: +la, lng: +ln };
    this._open = true;
    // Viewing another user: mirror their roles if provided
    if (this._targetUser?.roles) {
      const r = this._targetUser.roles;
      const arr = Array.isArray(r) ? r : [];
      this._roles = {
        user: true,
        public: arr.includes('public') || !!this._targetUser.publicTitle,
        vendor: arr.includes('vendor') || !!this._targetUser.is_vendor,
        driver: arr.includes('driver'),
      };
    }
    this._syncRoleButtons();
    this._render();
    this._syncTaskCriteria();
    this._refreshCoinsBal();
    this._renderWaypoints();
    document.getElementById('multi-tile')?.classList.add('open');
    document.getElementById('mt-backdrop')?.classList.add('open');
    document.getElementById('multi-tile')?.setAttribute('data-tier', this._tier);
    try {
      MapDepict?.pulse?.(la, ln, 0x3d9eff, opts.label || 'tile', 6000);
    } catch (_) {}
    const zl = document.getElementById('zoom-label');
    if (zl) {
      zl.textContent = this.tierLabel(this._tier) + ' · '
        + (+la).toFixed(3) + ', ' + (+ln).toFixed(3);
    }
  },

  /** Profile of another player / vendor marker (any level) */
  openUser(userOrId, opts) {
    opts = opts || {};
    this.init();
    const u = typeof userOrId === 'object' && userOrId
      ? userOrId
      : { id: userOrId, display_name: opts.label || 'User' };
    const lat = opts.lat ?? u.lat ?? u.field_lat ?? window._lastPos?.lat ?? 0;
    const lng = opts.lng ?? u.lng ?? u.field_lng ?? window._lastPos?.lng ?? 0;
    if (u.roles && typeof u.roles === 'string') {
      try { u.roles = JSON.parse(u.roles); } catch (_) { u.roles = []; }
    }
    this.openAt(lat, lng, {
      source: opts.source || 'profile',
      tier: opts.tier || this.currentTier(),
      label: u.display_name || u.name || u.username || 'Profile',
      user: u,
    });
  },

  close() {
    this._open = false;
    document.getElementById('multi-tile')?.classList.remove('open');
    document.getElementById('mt-backdrop')?.classList.remove('open');
  },

  toggleRole(role) {
    if (!role || !Object.prototype.hasOwnProperty.call(this._roles, role)) return;
    if (role === 'user') {
      this._roles.user = true; // always keep a base identity
    } else {
      this._roles[role] = !this._roles[role];
    }
    this._syncRoleButtons();
    this._renderSections();
    this._persist();
  },

  _syncRoleButtons() {
    document.querySelectorAll('.mt-role-tog').forEach((btn) => {
      const on = !!this._roles[btn.dataset.role];
      btn.classList.toggle('active', on);
    });
    ['user', 'public', 'vendor', 'driver'].forEach((r) => {
      const sec = document.getElementById('mt-sec-' + r);
      if (sec) sec.hidden = !this._roles[r];
    });
  },

  _render() {
    const d = this._draft || {};
    const other = this._targetUser;
    const name = other
      ? (other.display_name || other.name || other.username || 'User')
      : (d.displayName
        || Auth?.user?.user_metadata?.full_name
        || Auth?.user?.email?.split?.('@')?.[0]
        || 'You');
    const av = document.getElementById('mt-avatar');
    if (av) av.textContent = other?.avatar_emoji || d.avatar || '👤';
    const nm = document.getElementById('mt-name');
    if (nm) nm.textContent = name;
    const pl = document.getElementById('mt-place');
    if (pl && this._pin) {
      const src = this._pin.source === 'plus' ? ' · +'
        : this._pin.source === 'long-press' ? ' · hold'
        : this._pin.source === 'profile' ? ' · profile'
        : '';
      pl.textContent = this.tierLabel(this._tier) + ' · '
        + this._pin.lat.toFixed(4) + ', ' + this._pin.lng.toFixed(4) + src;
    }
    // Tier chip on cover
    let chip = document.getElementById('mt-tier-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'mt-tier-chip';
      document.getElementById('mt-cover')?.appendChild(chip);
    }
    chip.textContent = this.tierLabel(this._tier);
    const cover = document.getElementById('mt-cover');
    if (cover) {
      if (d.cover) {
        cover.style.backgroundImage = 'url(' + d.cover + ')';
        cover.classList.add('has-img');
      } else {
        cover.style.backgroundImage = '';
        cover.classList.remove('has-img');
      }
    }
    this._renderSections();
  },

  _renderSections() {
    const d = this._draft || {};
    const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

    const u = document.getElementById('mt-sec-user');
    if (u && this._roles.user) {
      u.innerHTML = ''
        + '<div class="mt-label">Social · who you are</div>'
        + '<label class="mt-field">Display name<input id="mt-in-name" value="' + esc(d.displayName) + '" placeholder="Your name" /></label>'
        + '<label class="mt-field">Bio<textarea id="mt-in-bio" rows="2" placeholder="Short intro…">' + esc(d.bio) + '</textarea></label>';
    }

    const p = document.getElementById('mt-sec-public');
    if (p && this._roles.public) {
      p.innerHTML = ''
        + '<div class="mt-label">Public figure</div>'
        + '<label class="mt-field">Stage name<input id="mt-in-public" value="' + esc(d.publicTitle) + '" placeholder="Public title" /></label>'
        + '<p class="mt-hint">Shown when others radar this place.</p>';
    }

    const v = document.getElementById('mt-sec-vendor');
    if (v && this._roles.vendor) {
      const menu = Array.isArray(d.menu) ? d.menu : [];
      const rows = menu.length
        ? menu.map((m, i) => '<div class="mt-menu-row" data-i="' + i + '">'
          + '<span>' + esc(m.name || 'Item') + '</span>'
          + '<span class="mt-price">' + esc(m.price || '—') + '</span></div>').join('')
        : '<p class="mt-hint">No menu yet — add items below.</p>';
      v.innerHTML = ''
        + '<div class="mt-label">Vendor · menu</div>'
        + '<label class="mt-field">Shop name<input id="mt-in-vendor" value="' + esc(d.vendorName) + '" placeholder="Shop name" /></label>'
        + '<div class="mt-menu-list">' + rows + '</div>'
        + '<div class="mt-menu-add">'
        + '<input id="mt-menu-name" placeholder="Item" />'
        + '<input id="mt-menu-price" placeholder="€" />'
        + '<button type="button" id="mt-menu-add-btn">Add</button>'
        + '</div>';
      document.getElementById('mt-menu-add-btn')?.addEventListener('click', () => this._addMenuItem());
    }

    const dr = document.getElementById('mt-sec-driver');
    if (dr && this._roles.driver) {
      dr.innerHTML = ''
        + '<div class="mt-label">Delivery · vehicle</div>'
        + '<label class="mt-field">Vehicle<input id="mt-in-vehicle" value="' + esc(d.vehicle) + '" placeholder="Scooter · van · bike" /></label>'
        + '<label class="mt-field">Notes<textarea id="mt-in-vnotes" rows="2" placeholder="Base, hours, radius…">' + esc(d.vehicleNotes) + '</textarea></label>';
    }
  },

  _addMenuItem() {
    const n = document.getElementById('mt-menu-name');
    const p = document.getElementById('mt-menu-price');
    const name = (n?.value || '').trim();
    if (!name) return;
    if (!Array.isArray(this._draft.menu)) this._draft.menu = [];
    this._draft.menu.push({ name, price: (p?.value || '').trim() });
    if (n) n.value = '';
    if (p) p.value = '';
    this._persist();
    this._renderSections();
  },

  _readFields() {
    const g = (id) => document.getElementById(id)?.value?.trim?.() || '';
    this._draft.displayName = g('mt-in-name') || this._draft.displayName;
    this._draft.bio = g('mt-in-bio') || this._draft.bio;
    this._draft.publicTitle = g('mt-in-public') || this._draft.publicTitle;
    this._draft.vendorName = g('mt-in-vendor') || this._draft.vendorName;
    this._draft.vehicle = g('mt-in-vehicle') || this._draft.vehicle;
    this._draft.vehicleNotes = g('mt-in-vnotes') || this._draft.vehicleNotes;
  },

  async save() {
    this._readFields();
    this._persist();
    // Soft server sync when signed in
    try {
      if (Auth?.user && SB_URL && SB_KEY) {
        const headers = Auth.authHeaders
          ? await Auth.authHeaders()
          : { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
        const roles = [];
        if (this._roles.user) roles.push('client');
        if (this._roles.driver) roles.push('driver');
        if (this._roles.vendor) roles.push('vendor');
        if (this._roles.public) roles.push('public');
        const body = {
          display_name: this._draft.displayName || null,
          bio: this._draft.bio || null,
          roles,
          is_vendor: !!this._roles.vendor,
          profile_page: {
            title: this._draft.displayName,
            about: this._draft.bio,
            publicTitle: this._draft.publicTitle,
            vendorName: this._draft.vendorName,
            menu: this._draft.menu,
            vehicle: this._draft.vehicle,
            vehicleNotes: this._draft.vehicleNotes,
            pin: this._pin,
          },
          updated_at: new Date().toISOString(),
        };
        await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
          method: 'PATCH', headers, body: JSON.stringify(body),
        });
      }
    } catch (_) {}
    const zl = document.getElementById('zoom-label');
    if (zl) zl.textContent = 'Tile saved';
  },

  postHere(opts) {
    opts = opts || {};
    const pin = this._pin;
    if (pin) window._pendingShopLatLng = { lat: pin.lat, lng: pin.lng };
    this.close();
    const go = async () => {
      try { await LazyModules?.ensure?.(); } catch (_) {}
      if (typeof SuperAdd !== 'undefined' && SuperAdd?.open) SuperAdd.open();
      else if (window.SuperAdd?.open) window.SuperAdd.open();
    };
    void go();
  },

  connect(kind) {
    const pin = this._pin;
    if (!Auth?.user) {
      Auth?.openLoginModal?.('Sign in to connect');
      return;
    }
    try {
      if (kind === 'video' || kind === 'voice') {
        LazyModules?.ensure?.().then(() => {
          AstranovCall?.start?.(null, { mode: kind === 'voice' ? 'audio' : 'video', lat: pin?.lat, lng: pin?.lng });
        }).catch(() => {});
      } else if (kind === 'message') {
        LazyModules?.ensure?.().then(() => {
          MapComms?.openCloud?.({ title: 'Place chat' });
        }).catch(() => {});
      } else if (kind === 'team') {
        LazyModules?.ensure?.().then(() => {
          MapComms?.openCloud?.({ title: 'Local team' });
          AciCli?.print?.('team · place ' + (pin ? pin.lat.toFixed(3) + ',' + pin.lng.toFixed(3) : ''), 'ok');
        }).catch(() => {});
      }
    } catch (_) {}
  },
};
window.MultiTile = MultiTile;

// Radar: single-click map — search around place via CLI
var MapRadar = {
  last: null,

  at(lat, lng, opts) {
    opts = opts || {};
    if (lat == null || lng == null) return;
    this.last = { lat: +lat, lng: +lng, t: Date.now() };
    window._radarPos = this.last;
    window._lastPos = window._lastPos || { lat: +lat, lng: +lng };
    try { MapDepict?.pulse?.(lat, lng, 0x44ffaa, 'radar', 5000); } catch (_) {}
    try {
      MapDepict?.action?.('explore', {
        lat, lng,
        detail: opts.query || 'search around',
        worldLat: lat,
        worldLng: lng,
      });
    } catch (_) {}
    try { SpaceNetBrain?.crawlArea?.(lat, lng, opts.radiusKm || 2); } catch (_) {}
    try { window.Commerce?.loadVendors?.(); } catch (_) {}

    // Guide search through CLI (e.g. pharmacy)
    const hint = opts.query
      ? ('Radar · ' + opts.query + ' near ' + (+lat).toFixed(3) + ', ' + (+lng).toFixed(3))
      : ('Radar · type search e.g. pharmacy · ' + (+lat).toFixed(3) + ', ' + (+lng).toFixed(3));
    const zl = document.getElementById('zoom-label');
    if (zl) zl.textContent = hint.slice(0, 72);

    try {
      GlobeDeck?.expand?.(PublicCopy?.deckTitle?.() || 'Astranov');
      const input = document.getElementById('aci-cli-in') || document.getElementById('aci-input');
      if (input) {
        if (!opts.query) {
          input.placeholder = 'Search here — e.g. pharmacy · coffee · driver';
          input.focus();
        } else {
          input.value = opts.query;
        }
      }
      AciCli?.print?.(hint, 'map');
      SuperCli?.setContext?.('radar');
    } catch (_) {}

    // If user already typed a query, run soft local match
    if (opts.query) this.runQuery(opts.query);
  },

  runQuery(q) {
    const query = String(q || '').trim().toLowerCase();
    if (!query || !this.last) return;
    const lat = this.last.lat;
    const lng = this.last.lng;
    const vendors = window.Commerce?.vendors || [];
    const hits = vendors.filter((v) => {
      const blob = ((v.name || '') + ' ' + (v.category || '') + ' ' + (v.emoji || '')).toLowerCase();
      return blob.includes(query) || query.split(/\s+/).some((w) => w.length > 2 && blob.includes(w));
    }).slice(0, 8);
    if (hits.length) {
      AciCli?.print?.('radar · ' + hits.length + ' near you · ' + hits.map((h) => h.name).join(' · '), 'ok');
      hits.forEach((h) => {
        if (h.lat != null) MapDepict?.pulse?.(h.lat, h.lng, 0xffaa44, h.name, 10000);
      });
    } else {
      AciCli?.print?.('radar · no local match for «' + query + '» · crawling field…', 'dim');
      void SpaceNetBrain?.crawlArea?.(lat, lng, 3);
    }
  },
};
window.MapRadar = MapRadar;
