// === CLASSIFIED TRIANGLES — top 3 AI-classified actions, then more options ===
const ClassifiedTriangles = {
  CATALOG: [
    { id: 'open_city', label: 'Open city', icon: '🏙', keywords: ['city', 'open city', 'streets', 'enter city', 'city map', 'πόλη'] },
    { id: 'list_shop', label: 'List my shop', icon: '🏬', keywords: ['shop', 'store', 'menu', 'my shop', 'cafe', 'restaurant', 'bakery'] },
    { id: 'list_vendor', label: 'List vendor', icon: '🏪', keywords: ['vendor', 'supplier', 'wholesale', 'list vendor', 'seller'] },
    { id: 'driver_base', label: 'Driver base', icon: '🚚', keywords: ['driver', 'delivery', 'fleet', 'courier', 'base', 'dispatch'] },
    { id: 'post', label: 'Post something', icon: '📝', keywords: ['post', 'share', 'announce', 'publish', 'status'] },
    { id: 'upload_photo', label: 'Upload photo', icon: '📷', keywords: ['photo', 'picture', 'image', 'snap', 'pic'] },
    { id: 'upload_video', label: 'Upload video', icon: '🎬', keywords: ['video', 'record', 'film', 'clip', 'reel'] },
    { id: 'deliver_here', label: 'Deliver here', icon: '📦', keywords: ['deliver', 'delivery address', 'ship here', 'drop off'] },
    { id: 'drive_here', label: 'Drive here', icon: '🚗', keywords: ['drive', 'navigate', 'go here', 'take me'] },
    { id: 'route', label: 'Show route', icon: '🛣', keywords: ['route', 'directions', 'path', 'roads'] },
    { id: 'explore', label: 'Shops nearby', icon: '🔍', keywords: ['nearby', 'explore', 'find shops', 'around', 'local'] },
    { id: 'order', label: 'Order here', icon: '🛒', keywords: ['order', 'buy', 'purchase', 'food'] },
  ],

  DEFAULT_TOP: ['list_shop', 'list_vendor', 'driver_base'],

  init() {
    document.getElementById('ge-hud-intent-go')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      void this.onIntentSubmit();
    });
    document.getElementById('ge-hud-intent')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); void this.onIntentSubmit(); }
    });
    document.getElementById('ct-more-toggle')?.addEventListener('click', e => {
      e.preventDefault();
      const more = document.getElementById('classified-triangles-more');
      const btn = document.getElementById('ct-more-toggle');
      if (!more || !btn) return;
      const open = more.classList.toggle('open');
      btn.textContent = open ? 'Fewer options ▴' : 'More options ▾';
    });
    document.getElementById('ge-hud-place-close')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      MapPlaceMenu?.close?.();
    });
  },

  defaultTop3() {
    return this.DEFAULT_TOP.map(id => this.CATALOG.find(c => c.id === id)).filter(Boolean);
  },

  defaultMore() {
    return this.CATALOG.filter(c => !this.DEFAULT_TOP.includes(c.id));
  },

  scoreLocal(text) {
    const t = String(text || '').toLowerCase();
    const scored = this.CATALOG.map(item => {
      let s = 0;
      for (const kw of item.keywords) {
        if (t.includes(kw)) s += kw.length + 2;
      }
      return { ...item, score: s };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) return this.defaultTop3().concat(this.defaultMore());
    const rest = this.CATALOG.filter(c => !scored.find(s => s.id === c.id));
    return scored.concat(rest);
  },

  async onIntentSubmit() {
    const input = document.getElementById('ge-hud-intent');
    const text = input?.value?.trim() || '';
    const pin = MapPlaceMenu?._pin;
    const primary = document.getElementById('classified-triangles-primary');
    if (primary) primary.classList.add('ct-loading');
    const result = await SpaceNetBrain?.classifyIntent?.(text, {
      lat: pin?.lat,
      lng: pin?.lng,
      pin,
      radiusKm: 2,
    });
    if (primary) primary.classList.remove('ct-loading');
    if (result) this.render(result.primary, result.more, pin);
    const desc = document.getElementById('ge-hud-desc');
    if (desc) {
      desc.textContent = text
        ? '▸ ' + text
        : 'Pick a triangle — or type what you want to do';
    }
    AciCli?.print?.('triangles · ' + (text || 'default top 3'), 'ok');
  },

  _contextTop3(pin) {
    const tier = ZoomTiers?.current?.();
    if (tier?.city || CityMap?.active) {
      return [
        this.CATALOG.find(c => c.id === 'order'),
        this.CATALOG.find(c => c.id === 'deliver_here'),
        this.CATALOG.find(c => c.id === 'explore'),
      ].filter(Boolean);
    }
    if (tier?.national) {
      return [
        this.CATALOG.find(c => c.id === 'open_city') || { id: 'open_city', label: 'Open city', icon: '🏙', keywords: ['city', 'open city', 'streets'] },
        this.CATALOG.find(c => c.id === 'explore'),
        this.CATALOG.find(c => c.id === 'drive_here'),
      ].filter(Boolean);
    }
    return this.defaultTop3();
  },

  render(primary, more, pin, opts) {
    opts = opts || {};
    const tri = document.getElementById('classified-triangles-primary');
    const moreEl = document.getElementById('classified-triangles-more');
    const toggle = document.getElementById('ct-more-toggle');
    if (!tri) return;
    const limited = !!opts.limited || !!pin?.limited;
    const top = (primary || (limited ? this._contextTop3(pin) : this.defaultTop3())).slice(0, 3);
    tri.innerHTML = top.map(item =>
      '<button type="button" class="ct-tri ct-top" data-ct-id="' + item.id + '" title="' + item.label + '">'
      + '<span class="ct-icon">' + item.icon + '</span><span class="ct-lbl">' + item.label + '</span></button>'
    ).join('');
    tri.querySelectorAll('[data-ct-id]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.runAction(btn.dataset.ctId, pin);
      };
    });
    const extras = limited ? [] : (more || this.defaultMore()).slice(0, 5);
    if (moreEl) {
      moreEl.innerHTML = extras.map(item =>
        '<button type="button" data-ct-id="' + item.id + '">' + item.icon + ' ' + item.label + '</button>'
      ).join('');
      moreEl.querySelectorAll('[data-ct-id]').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.runAction(btn.dataset.ctId, pin);
        };
      });
      moreEl.classList.remove('open');
    }
    if (toggle) {
      toggle.style.display = (!limited && extras.length) ? 'block' : 'none';
      toggle.textContent = 'More options ▾';
    }
  },

  runAction(actionId, pin) {
    const map = {
      open_city: 'open_city',
      list_shop: 'shop',
      list_vendor: 'shop',
      driver_base: 'driver_base',
      deliver_here: 'client_addr',
      drive_here: 'drive',
      route: 'route',
      explore: 'explore',
      order: 'order',
      post: 'post',
      upload_photo: 'upload_photo',
      upload_video: 'upload_video',
    };
    const act = map[actionId] || actionId;
    if (act === 'open_city') {
      const p = pin || MapPlaceMenu?._pin;
      if (p) void CityPick?.enter?.(p.lat, p.lng, CityPick?.nearestName?.(p.lat, p.lng) || 'City');
      else void CityPick?.enter?.(window._lastPos?.lat, window._lastPos?.lng, 'City');
      MapPlaceMenu?.close?.();
      return;
    }
    if (act === 'post' || act === 'upload_photo' || act === 'upload_video') {
      MapPlaceMenu?._runMedia?.(act, pin);
      return;
    }
    MapPlaceMenu?._run?.(act);
  },
};
window.ClassifiedTriangles = ClassifiedTriangles;
