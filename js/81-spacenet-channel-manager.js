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
