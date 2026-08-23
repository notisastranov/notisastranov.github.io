// === ORDER TRACKING — live status on globe + CLI (delivery parity) ===
const OrderTracking = {
  active: null,
  _poll: null,
  _vendorCache: new Map(),

  STATUS: {
    pending: { label: 'Pending', icon: '⏳', step: 0, color: 0xffaa33 },
    seeking_driver: { label: 'Finding driver', icon: '🔍', step: 1, color: 0xffaa33 },
    assigned: { label: 'Driver assigned', icon: '🚚', step: 2, color: 0x3d9eff },
    picked_up: { label: 'Picked up', icon: '📦', step: 3, color: 0x44ccff },
    en_route: { label: 'On the way', icon: '🛵', step: 4, color: 0x00ddff },
    delivered: { label: 'Delivered', icon: '✅', step: 5, color: 0x00ff88 },
    cancelled: { label: 'Cancelled', icon: '❌', step: -1, color: 0xff3344 },
  },

  FLOW: ['pending', 'seeking_driver', 'assigned', 'picked_up', 'en_route', 'delivered'],

  init() {
    if (Auth?.user) setTimeout(() => this.trackLatest({ quiet: true }), 3500);
  },

  meta(status) {
    return this.STATUS[status] || { label: status || 'Unknown', icon: '🛒', step: 0, color: 0x3d9eff };
  },

  async fetchOrder(idOrShort) {
    if (!Auth?.user) return null;
    const q = String(idOrShort || '').trim();
    if (!q) return null;
    try {
      const headers = await Auth.authHeaders();
      const isUuid = /^[0-9a-f-]{36}$/i.test(q);
      const filter = isUuid ? ('id=eq.' + q) : ('short_id=eq.' + q.toUpperCase());
      const r = await fetch(SB_URL + '/rest/v1/orders?select=*&customer_id=eq.' + Auth.user.id + '&' + filter + '&limit=1', { headers });
      if (!r.ok) return null;
      const rows = await r.json();
      return rows[0] || null;
    } catch { return null; }
  },

  async fetchLatest() {
    if (!Auth?.user) return null;
    try {
      const headers = await Auth.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/orders?select=*&customer_id=eq.' + Auth.user.id + '&order=created_at.desc&limit=1', { headers });
      if (!r.ok) return null;
      const rows = await r.json();
      return rows[0] || null;
    } catch { return null; }
  },

  async resolveVendor(vendorId) {
    if (!vendorId) return null;
    if (this._vendorCache.has(vendorId)) return this._vendorCache.get(vendorId);
    try {
      const r = await fetch(SB_URL + '/rest/v1/vendors?select=id,name,lat,lng,emoji&id=eq.' + encodeURIComponent(vendorId) + '&limit=1', {
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      });
      const rows = r.ok ? await r.json() : [];
      const v = rows[0] || null;
      if (v) this._vendorCache.set(vendorId, v);
      return v;
    } catch { return null; }
  },

  onOrderPlaced(order, vendor, driver) {
    if (!order) return;
    this.active = order;
    this.showOnGlobe(order, vendor, driver);
    this.startPoll();
    try { CityTasks?.init?.(); CityTasks?.fromOrder?.(order, vendor, driver); } catch (_) {}
    const m = this.meta(order.status);
    const msg = m.icon + ' Order ' + (order.short_id || order.id?.slice(0, 8)) + ' · ' + m.label
      + (driver?.name ? ' · ' + driver.name : '');
    GlobeDeck?.say?.(msg, 'ok');
    Responsive3D?.visualReact?.('order', { order, vendor, lat: order.delivery_lat, lng: order.delivery_lng });
  },

  showOnGlobe(order, vendor, driver) {
    if (!order) return;
    const st = this.meta(order.status);
    const dLat = order.delivery_lat;
    const dLng = order.delivery_lng;
    const v = vendor || null;

    GlobeEntity?.unregisterType?.('order');
    GlobeEntity?.unregisterType?.('pilot');

    if (dLat != null && dLng != null) {
      GlobeEntity?.register?.({
        id: 'order-delivery',
        type: 'order',
        lat: dLat,
        lng: dLng,
        title: st.icon + ' ' + (order.short_id || 'Order'),
        description: st.label + ' · tap to track',
        urgency: order.status === 'delivered' ? 1 : 3,
        persist: true,
        data: { order, vendor: v },
        _actionLabel: 'Track order',
        onTap: () => this.flyToOrder(order, v),
      });
    }

    if (v?.lat != null && v?.lng != null) {
      GlobeEntity?.register?.({
        id: 'order-vendor',
        type: 'vendor',
        lat: v.lat,
        lng: v.lng,
        title: (v.emoji || '🏬') + ' ' + (v.name || 'Shop'),
        description: 'Order source · ' + st.label,
        urgency: 2,
        persist: true,
        data: { vendor: v, order },
        onTap: () => Commerce?.openVendor?.(v),
      });
    }

    if (driver?.field_lat != null && driver?.field_lng != null) {
      GlobeEntity?.register?.({
        id: 'order-driver',
        type: 'driver',
        lat: driver.field_lat,
        lng: driver.field_lng,
        title: (driver.avatar_emoji || '🚚') + ' ' + (driver.display_name || order.driver_name || 'Driver'),
        description: st.label + ' · your delivery',
        urgency: 3,
        persist: true,
        data: { driver, order },
        onTap: () => this.flyToOrder(order, v),
      });
    } else if (order.driver_name && dLat != null) {
      const off = 0.006;
      GlobeEntity?.register?.({
        id: 'order-driver',
        type: 'pilot',
        lat: dLat + off,
        lng: dLng - off,
        title: (order.driver_emoji || '🚚') + ' ' + order.driver_name,
        description: st.label,
        urgency: 2,
        persist: true,
        data: { order },
        onTap: () => this.flyToOrder(order, v),
      });
    }

    MapDepict?.action?.('order', {
      lat: dLat,
      lng: dLng,
      vendorLat: v?.lat,
      vendorLng: v?.lng,
      detail: (order.short_id || '') + ' · ' + st.label,
    });
  },

  async flyToOrder(order, vendor) {
    order = order || this.active;
    if (!order) return;
    const v = vendor || await this.resolveVendor(order.vendor_id);
    const dLat = order.delivery_lat ?? window._lastPos?.lat;
    const dLng = order.delivery_lng ?? window._lastPos?.lng;
    if (dLat == null) {
      ACIControl?.reply('No delivery coordinates on this order');
      return;
    }
    const dur = GlobeControl?.flyDuration?.(camera?.position?.z, GlobeControl?.Z?.national || 1.82) || 2200;
    GlobeControl?.flyToLatLng?.(dLat, dLng, this.meta(order.status).label, GlobeControl?.Z?.national || 1.82, { dur });
    if (v?.lat != null) {
      setTimeout(() => {
        MapDepict?.pulse?.(v.lat, v.lng, 0x3d9eff, v.name || 'Shop', 5000);
      }, dur * 0.55);
    }
    this.renderStatus(order, v);
    Responsive3D?.visualReact?.('track', { lat: dLat, lng: dLng, order });
  },

  renderStatus(order, vendor) {
    if (!order) return '';
    const m = this.meta(order.status);
    const items = Array.isArray(order.items) ? order.items : [];
    const total = order.calc?.total_avc ?? order.calc?.total_eur ?? items.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
    const lines = [
      m.icon + ' ' + (order.short_id || order.id?.slice(0, 8)) + ' · ' + m.label,
      (vendor?.name || order.vendor_id || 'vendor') + ' · ' + Number(total).toFixed(1) + ' Coins',
    ];
    if (order.driver_name) lines.push('Driver: ' + order.driver_name);
    const step = m.step;
    if (step >= 0) {
      const bar = this.FLOW.map((s, i) => (i <= step ? '●' : '○')).join(' ');
      lines.push(bar);
    }
    const msg = lines.join('\n');
    ACIControl?.reply(msg);
    AciCli?.print(msg, 'ok');
    GlobeDeck?.setPreview?.(m.icon + ' ' + m.label + ' · ' + (order.short_id || ''));
    return msg;
  },

  async refresh(opts) {
    opts = opts || {};
    const order = this.active?.id
      ? await this.fetchOrder(this.active.short_id || this.active.id)
      : await this.fetchLatest();
    if (!order) {
      if (!opts.quiet) ACIControl?.reply('No orders yet — say: order pitogyra mpironia');
      return null;
    }
    const prev = this.active?.status;
    this.active = order;
    const vendor = await this.resolveVendor(order.vendor_id);
    let driver = null;
    if (order.driver_id) {
      try {
        const headers = await Auth.authHeaders();
        const r = await fetch(SB_URL + '/rest/v1/profiles?select=id,display_name,avatar_emoji,field_lat,field_lng&id=eq.' + order.driver_id + '&limit=1', { headers });
        const rows = r.ok ? await r.json() : [];
        driver = rows[0] || null;
      } catch { /* */ }
    }
    this.showOnGlobe(order, vendor, driver);
    if (!opts.quiet && prev && prev !== order.status) {
      const m = this.meta(order.status);
      GlobeDeck?.say?.(m.icon + ' ' + (order.short_id || '') + ' → ' + m.label, 'ok');
      if (Voice.maySpeak?.()) speak(m.label, () => resumeListening?.());
      Responsive3D?.visualReact?.('order_update', { order, lat: order.delivery_lat, lng: order.delivery_lng });
    }
    if (order.status === 'delivered' || order.status === 'cancelled') this.stopPoll();
    return order;
  },

  startPoll() {
    this.stopPoll();
    this._poll = setInterval(() => this.refresh({ quiet: true }), 14000);
  },

  stopPoll() {
    if (this._poll) { clearInterval(this._poll); this._poll = null; }
  },

  async trackLatest(opts) {
    opts = opts || {};
    const order = await this.fetchLatest();
    if (!order) {
      if (!opts.quiet) ACIControl?.reply('No active orders — order from CLI or tap a shop');
      return null;
    }
    this.active = order;
    const vendor = await this.resolveVendor(order.vendor_id);
    await this.flyToOrder(order, vendor);
    if (order.status !== 'delivered' && order.status !== 'cancelled') this.startPoll();
    return order;
  },

  async trackId(id) {
    const order = await this.fetchOrder(id);
    if (!order) {
      ACIControl?.reply('Order not found: ' + id);
      return null;
    }
    this.active = order;
    const vendor = await this.resolveVendor(order.vendor_id);
    await this.flyToOrder(order, vendor);
    if (order.status !== 'delivered' && order.status !== 'cancelled') this.startPoll();
    return order;
  },

  async cli(parts) {
    const sub = (parts[1] || 'status').toLowerCase();
    const arg = parts.slice(2).join(' ').trim();
    if (sub === 'track' || sub === 'fly') {
      if (arg) return this.trackId(arg);
      return this.trackLatest();
    }
    if (sub === 'status' || sub === 'last' || sub === 'active') {
      const order = arg ? await this.fetchOrder(arg) : (this.active || await this.fetchLatest());
      if (!order) {
        ACIControl?.reply('No orders — say: order pitogyra mpironia');
        return;
      }
      this.active = order;
      const vendor = await this.resolveVendor(order.vendor_id);
      this.showOnGlobe(order, vendor, null);
      this.renderStatus(order, vendor);
      if (order.status !== 'delivered' && order.status !== 'cancelled') this.startPoll();
      return;
    }
    if (sub === 'list') {
      if (!Auth?.user) return Auth?.openLoginModal?.();
      const headers = await Auth.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/orders?select=short_id,status,created_at&customer_id=eq.' + Auth.user.id + '&order=created_at.desc&limit=8', { headers });
      const rows = r.ok ? await r.json() : [];
      if (!rows.length) { ACIControl?.reply('No orders yet'); return; }
      rows.forEach(o => {
        const m = this.meta(o.status);
        AciCli?.print(m.icon + ' ' + o.short_id + ' · ' + m.label, 'ok');
      });
      return;
    }
    ACIControl?.reply('order status · order track · order track ORD-xxx · order list');
  },
};

window.OrderTracking = OrderTracking;
