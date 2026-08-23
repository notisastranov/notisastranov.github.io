// ── COMMERCE: real vendors, real menus only, smart order on globe ──
const ORDER_ITEM_ALIASES = [
  { id: 'pita', label: 'Πιτογύρα', keys: ['πιτογυρ', 'πιτογύρα', 'pitogyra', 'pita', 'πιτο', 'gyro', 'γύρο', 'gyros', 'pitogyro'], match: /πιτο|pita|gyro|γύρο|pitogyra|pitogyro/i },
  { id: 'beer', label: 'Μπύρα', keys: ['μπυρ', 'μπίρ', 'mpira', 'mpironia', 'mpironi', 'beer', 'beers', 'μπύρες'], match: /μπύρ|μπυρ|beer|lager|αμστελ|heineken|mpironi/i },
  { id: 'cigarettes', label: 'Τσιγάρα', keys: ['τσιγαρ', 'tsigar', 'tsigareta', 'cigarette', 'cigarettes', 'μαλαμ'], match: /τσιγαρ|cigar|μαλαμ|marlboro|winston/i },
  { id: 'burger', label: 'Burger', keys: ['burger', 'burgers', 'μπεργκερ', 'χάμπουργκερ', 'hamburger'], match: /burger|μπεργκ|hamburger|χάμπουρ/i },
  { id: 'water', label: 'Νερό', keys: ['νερ', 'nero', 'water'], match: /νερό|νερο|water/i },
];

const TEAM_WIN_ITEM_IDS = new Set(['pita', 'beer', 'cigarettes', 'burger']);

const DEMO_VENDORS = [
  { id: 'demo-pitogyra', name: 'Πιτογύρα Rhodes', emoji: '🥙', lat: 36.4412, lng: 28.2225, category: 'food', is_active: true, delivery_enabled: true, items: [{ name: 'Πιτογύρα χοιρινό', price: 3.5 }, { name: 'Μπύρα Alpha', price: 2.5 }, { name: 'Τσιγάρα Marlboro', price: 5.5 }, { name: 'Burger classic', price: 6 }] },
  { id: 'demo-kafeneio', name: 'Kafeneio Astranov', emoji: '☕', lat: 36.4358, lng: 28.2188, category: 'cafe', is_active: true, delivery_enabled: true, items: [{ name: 'Φραπέ', price: 2.2 }, { name: 'Μπύρα Fix', price: 2.8 }, { name: 'Νερό 500ml', price: 0.5 }] },
  { id: 'demo-minimarket', name: 'Mini Market Kos', emoji: '🏪', lat: 36.8932, lng: 27.288, category: 'grocery', is_active: true, delivery_enabled: true, items: [{ name: 'Μπύρα Heineken', price: 2.9 }, { name: 'Τσιγάρα Winston', price: 5.2 }, { name: 'Burger frozen', price: 4.5 }, { name: 'Νερό', price: 0.6 }] },
];

const Commerce = {
  DEMO_VENDORS,
  vendors: [],
  markers: [],
  driverMarkers: [],
  selected: null,
  cart: {},
  _uiReady: false,
  _menuRequestSent: false,
  _suggestion: null,
  _quote: null,
  _balance: null,
  _preferredDriverId: null,
  _preferredDriver: null,
  _lastWants: [],

  haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  userLatLng() {
    if (GhostTravel?.active?.()) {
      const m = GhostTravel.maskedTrue?.();
      if (m) return m;
      return GhostTravel.publicPos?.() || { lat: 36.4239, lng: 28.2245 };
    }
    if (userLocated && window._lastPos) return { lat: window._lastPos.lat, lng: window._lastPos.lng };
    return { lat: 36.4239, lng: 28.2245 };
  },

  menuFor(vendor) {
    let raw = vendor?.items;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { raw = []; }
    }
    const items = Array.isArray(raw) ? raw.filter(i => i && i.name) : [];
    return items;
  },

  _normalizeVendor(v) {
    if (!v) return v;
    if (this.menuFor(v).length) return v;
    const demo = DEMO_VENDORS.find(d =>
      d.id === v.id
      || (v.name && d.name.toLowerCase().includes(String(v.name).toLowerCase().slice(0, 5)))
    );
    return demo ? { ...v, items: demo.items, delivery_enabled: v.delivery_enabled !== false } : v;
  },

  hasMenu(vendor) {
    return this.menuFor(vendor).length > 0;
  },

  async loadVendors() {
    try {
      const r = await fetch(SB_URL + '/rest/v1/vendors?select=id,name,emoji,lat,lng,category,items,is_active,delivery_enabled&is_active=eq.true&limit=80', {
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      });
      this.vendors = r.ok ? await r.json() : [];
    } catch { this.vendors = []; }
    if (!this.vendors.length) this.vendors = DEMO_VENDORS.map(v => ({ ...v }));
    else this.vendors = this.vendors.map(v => this._normalizeVendor(v));
    const u = this.userLatLng();
    this.vendors.sort((a, b) => this.haversineKm(u.lat, u.lng, a.lat, a.lng) - this.haversineKm(u.lat, u.lng, b.lat, b.lng));
    this.showOnGlobe();
    return this.vendors;
  },

  async myVendors() {
    if (!Auth?.user) return [];
    try {
      const headers = await Auth.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/vendors?select=id,name,emoji,items,category&owner_id=eq.' + Auth.user.id, { headers });
      return r.ok ? await r.json() : [];
    } catch { return []; }
  },

  resolveVendorRef(ref) {
    const q = String(ref || '').trim().toLowerCase();
    if (!q) return null;
    return this.vendors.find(v => v.id === ref || v.name.toLowerCase().includes(q)) || null;
  },

  async resolveOwnedVendor(ref) {
    const owned = await this.myVendors();
    if (!owned.length) return null;
    const q = String(ref || '').trim().toLowerCase();
    if (!q) return owned[0];
    return owned.find(v => v.id === ref || v.name.toLowerCase().includes(q)) || owned[0];
  },

  flyToVendor(v) {
    if (!v || v.lat == null) return;
    const u = this.userLatLng();
    MapDepict?.scanCity?.({ userLat: u.lat, userLng: u.lng, vendors: [v], label: 'Found · ' + v.name, zoom: GlobeControl?.Z?.city || 1.32 });
    const p = latLngToPos(v.lat, v.lng, 1.03);
    if (typeof flyToPoint === 'function') flyToPoint(new THREE.Vector3(p.x, p.y, p.z), GlobeControl?.Z?.city || 1.32);
    MapDepict?.action('vendor', { lat: v.lat, lng: v.lng, detail: v.name, vendors: [v] });
  },

  showOnGlobe() {
    this.markers.forEach(m => { if (m.parent) m.parent.remove(m); });
    this.markers = [];
    if (!this.vendors.length) return;
    GlobeEntity?.syncVendors?.(this.vendors);
    this.markers = [...(GlobeEntity?.entities?.values() || [])].filter(e => e.type === 'vendor').map(e => e.mesh);
    MapDepict?.setHud?.('Καταστήματα', this.vendors.length + ' shops · zoom in · tap for menu');
  },

  initUI() {
    if (this._uiReady) return;
    this._uiReady = true;
    const panel = document.getElementById('vendor-menu');
    document.getElementById('vm-close')?.addEventListener('click', () => {
      this.hideMenu();
      GlobeDeck?.completeTask('commerce');
    });
    document.getElementById('vm-back')?.addEventListener('click', () => this.showPicker());
    document.getElementById('vm-compare-back')?.addEventListener('click', () => this.showPicker());
    document.getElementById('vm-place')?.addEventListener('click', () => this.placeCart());
    document.getElementById('vm-request')?.addEventListener('click', () => this.requestMenu());
    document.getElementById('vm-confirm-pay')?.addEventListener('click', () => this.confirmAndPay(false));
    document.getElementById('vm-wallet-pay')?.addEventListener('click', () => this.confirmAndPay(true));
    if (panel) panel.addEventListener('click', e => e.stopPropagation());
  },

  async buildQuote(suggestion) {
    const sug = suggestion || this._suggestion;
    if (!sug) return null;
    const u = this.userLatLng();
    const km = this.haversineKm(u.lat, u.lng, sug.vendor.lat, sug.vendor.lng);
    const kg = 3 + (sug.picks?.length || 1);
    const quote = await DeliveryPricing?.quote?.({
      km, kg, subtotal_eur: sug.total, lat: u.lat, lng: u.lng,
    });
    this._quote = quote;
    return quote;
  },

  renderPricing(quote) {
    const box = document.getElementById('vm-pricing');
    const walletBtn = document.getElementById('vm-wallet-pay');
    if (!box || !quote) { if (box) box.style.display = 'none'; return; }
    box.style.display = 'block';
    const sur = (quote.surcharges || []).map(s => s.label + ' +' + s.eur.toFixed(2) + '€').join(' · ');
    box.innerHTML = '<div class="vm-pricing-title">Delivery quote</div>'
      + '<div>Goods <strong>' + quote.subtotal_eur.toFixed(2) + '€</strong> · Delivery <strong>' + quote.delivery_eur.toFixed(2) + '€</strong>'
      + ' · Platform 3% <strong>' + quote.platform_fee_eur.toFixed(2) + '€</strong></div>'
      + '<div class="muted">' + quote.km.toFixed(1) + ' km · ' + quote.kg + ' kg'
      + (sur ? ' · ' + sur : '')
      + (quote.weather?.bad ? ' · ⚠ weather' : '') + '</div>'
      + '<div>Total <strong>' + quote.total_avc.toFixed(2) + ' Coins</strong> (= ' + quote.total_eur.toFixed(2) + ' EUR) · <a href="https://coin.astranov.eu" target="_blank" rel="noopener" style="color:#e8c547">coin.astranov.eu</a> · work-mint ledger</div>';
    if (walletBtn) {
      walletBtn.style.display = GoogleWalletPay?.supported?.() ? 'block' : 'none';
      walletBtn.textContent = 'Google Wallet · ' + quote.total_eur.toFixed(2) + '€';
    }
  },

  showMenu() {
    this.initUI();
    GlobeDeck?.showStage('vendor-menu', 'commerce');
  },

  hideMenu() {
    document.getElementById('vendor-menu')?.classList.remove('open', 'deck-active');
    this.selected = null;
    this.cart = {};
    this._menuRequestSent = false;
    this._suggestion = null;
    this.clearDriverMarkers();
  },

  clearDriverMarkers() {
    this.driverMarkers.forEach(m => { if (m.parent) m.parent.remove(m); });
    this.driverMarkers = [];
  },

  showDriversOnGlobe(drivers) {
    this.clearDriverMarkers();
    GlobeEntity?.syncDrivers?.(drivers || []);
    this.driverMarkers = [...(GlobeEntity?.entities?.values() || [])].filter(e => e.type === 'driver').map(e => e.mesh);
  },

  async renderDriverPick() {
    const box = document.getElementById('vm-drivers-pick');
    if (!box) return;
    const u = this.userLatLng();
    const drivers = await this.driversNear(u.lat, u.lng);
    this.showDriversOnGlobe(drivers);
    if (!drivers.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = '<div class="vm-drivers-title">' + (AstroGlyphs?.driver || '🚚') + ' Pick driver (tap):</div>'
      + drivers.slice(0, 5).map(d => {
        const km = this.haversineKm(u.lat, u.lng, d.field_lat, d.field_lng).toFixed(1);
        const picked = this._preferredDriverId === d.id ? ' picked' : '';
        return '<span class="vm-tag driver' + picked + '" data-driver-id="' + d.id + '">'
          + driverIcon(d) + ' ' + (d.display_name || 'Driver') + ' · ' + km + ' km</span>';
      }).join('');
    box.querySelectorAll('.vm-tag.driver[data-driver-id]').forEach(tag => {
      tag.onclick = (e) => {
        e.stopPropagation();
        const id = tag.dataset.driverId;
        const d = drivers.find(x => x.id === id);
        MarketplaceComms?.selectDriver?.(id, d);
        box.querySelectorAll('.vm-tag.driver').forEach(el => el.classList.remove('picked'));
        tag.classList.add('picked');
      };
    });
    MarketplaceComms?.openForBrowse?.({
      vendor: this.selected,
      drivers,
      wants: this._lastWants?.map?.(w => w.label)?.join(' + ') || '',
      preferredDriverId: this._preferredDriverId,
    });
  },

  parseWantedItems(text) {
    const low = String(text || '').toLowerCase();
    return ORDER_ITEM_ALIASES.filter(a => a.keys.some(k => low.includes(k)));
  },

  looksLikeVendorOnly(text) {
    const q = String(text || '').trim().toLowerCase();
    if (!q || q.length < 2) return false;
    const wants = this.parseWantedItems(q);
    if (wants.length) return false;
    return this.vendors.some(v => v.name.toLowerCase().includes(q) || q.includes(v.name.toLowerCase().slice(0, 4)));
  },

  findMenuItemForWant(menu, want) {
    const hits = menu.filter(i => want.match.test(String(i.name || '')));
    if (!hits.length) return null;
    hits.sort((a, b) => (a.price || 0) - (b.price || 0));
    return hits[0];
  },

  scoreVendorForWants(vendor, wants, u) {
    const menu = this.menuFor(vendor);
    if (!menu.length) return null;
    const picks = [];
    wants.forEach(w => {
      const item = this.findMenuItemForWant(menu, w);
      if (item) picks.push({ want: w, item, price: item.price || 0 });
    });
    if (!picks.length) return null;
    const total = picks.reduce((s, p) => s + p.price, 0);
    const km = this.haversineKm(u.lat, u.lng, vendor.lat, vendor.lng);
    const coverage = picks.length / wants.length;
    const score = coverage * 1000 - total * 0.5 - km * 3;
    return { vendor, picks, matched: picks.length, wanted: wants.length, total, km, score, coverage };
  },

  async fetchNearbyDrivers(lat, lng) {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    try {
      const r = await fetch(SB_URL + '/rest/v1/profiles?select=id,display_name,avatar_emoji,field_lat,field_lng,field_seen_at&roles=cs.%5B%22driver%22%5D&field_seen_at=gte.' + since + '&field_lat=not.is.null&limit=25', {
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      });
      const rows = r.ok ? await r.json() : [];
      rows.sort((a, b) => this.haversineKm(lat, lng, a.field_lat, a.field_lng) - this.haversineKm(lat, lng, b.field_lat, b.field_lng));
      return rows;
    } catch { return []; }
  },

  demoDrivers(lat, lng) {
    const u = { lat: lat ?? 36.44, lng: lng ?? 28.22 };
    return [
      { id: 'demo-drv-1', display_name: 'Nikos · delivery', field_lat: u.lat + 0.004, field_lng: u.lng - 0.003 },
      { id: 'demo-drv-2', display_name: 'Elena · courier', field_lat: u.lat - 0.003, field_lng: u.lng + 0.005 },
      { id: 'demo-drv-3', display_name: 'Alex · ride', field_lat: u.lat + 0.002, field_lng: u.lng + 0.004 },
    ];
  },

  async driversNear(lat, lng) {
    const rows = await this.fetchNearbyDrivers(lat, lng);
    return rows.length ? rows : this.demoDrivers(lat, lng);
  },

  async fetchBalance() {
    if (!Auth?.user) return 0;
    try {
      const headers = await Auth.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/balance_ledger?select=balance&user_id=eq.' + Auth.user.id, { headers });
      if (r.ok) {
        const rows = await r.json();
        if (rows[0]) { this._balance = Number(rows[0].balance) || 0; return this._balance; }
      }
      const pr = await fetch(SB_URL + '/rest/v1/profiles?select=balance&id=eq.' + Auth.user.id, { headers });
      if (pr.ok) {
        const rows = await pr.json();
        this._balance = Number(rows[0]?.balance) || 0;
        return this._balance;
      }
    } catch { /* */ }
    return 0;
  },

  hideComparePanels() {
    ['vm-list', 'vm-detail', 'vm-compare'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  },

  renderCompare(matches, drivers, wants, balance) {
    const compare = document.getElementById('vm-compare');
    const wanted = document.getElementById('vm-wanted');
    const matchBox = document.getElementById('vm-matches');
    const driverBox = document.getElementById('vm-drivers');
    const balBox = document.getElementById('vm-balance');
    const confirmBtn = document.getElementById('vm-confirm-pay');
    if (!compare) return;

    this.hideComparePanels();
    compare.style.display = 'block';

    if (wanted) {
      wanted.innerHTML = '<div class="vm-wanted-title">Ζητάς:</div>' + wants.map(w => '<span class="vm-tag">' + w.label + '</span>').join('');
    }
    if (matchBox) {
      matchBox.innerHTML = '';
      matches.slice(0, 5).forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'vm-match' + (i === 0 ? ' best' : '');
        const miss = m.wanted - m.matched;
        const detail = m.picks.map(p => p.item.name + ' ' + p.price + ' Coins').join(' · ');
        row.innerHTML = '<div class="vm-match-head"><span>' + vendorIcon(m.vendor) + ' ' + m.vendor.name + '</span><strong>' + m.total.toFixed(1) + ' Coins</strong></div>'
          + '<div class="vm-match-sub">' + m.km.toFixed(1) + ' km · ' + m.matched + '/' + m.wanted + ' είδη' + (miss ? ' · <span style="color:#ffd633">-' + miss + '</span>' : '') + '</div>'
          + '<div class="vm-match-items">' + detail + '</div>';
        row.onclick = () => {
          this._suggestion = m;
          matchBox.querySelectorAll('.vm-match').forEach(el => el.classList.remove('picked'));
          row.classList.add('picked');
          if (confirmBtn) confirmBtn.textContent = 'Επιβεβαίωση & Πληρωμή · ' + m.vendor.name + ' · ' + m.total.toFixed(1) + ' Coins';
          this.flyToVendor(m.vendor);
        };
        if (i === 0) { row.classList.add('picked'); this._suggestion = m; }
        matchBox.appendChild(row);
      });
    }
    if (driverBox) {
      const n = drivers.length;
      driverBox.innerHTML = n
        ? '<div class="vm-drivers-title">' + (AstroGlyphs?.driver || '🚚') + ' ' + n + ' οδηγοί κοντά · tap to pick:</div>' + drivers.slice(0, 4).map(d => {
          const km = this.haversineKm(this.userLatLng().lat, this.userLatLng().lng, d.field_lat, d.field_lng).toFixed(1);
          const picked = this._preferredDriverId === d.id ? ' picked' : '';
          return '<span class="vm-tag driver' + picked + '" data-driver-id="' + d.id + '">' + driverIcon(d) + ' ' + (d.display_name || 'Driver') + ' · ' + km + ' km</span>';
        }).join('')
        : '<div class="vm-drivers-title" style="color:#ffd633">Δεν βρέθηκαν ενεργοί οδηγοί — θα αναζητηθεί μετά την παραγγελία</div>';
      driverBox.querySelectorAll('.vm-tag.driver[data-driver-id]').forEach(tag => {
        tag.onclick = (e) => {
          e.stopPropagation();
          MarketplaceComms?.selectDriver?.(tag.dataset.driverId);
          driverBox.querySelectorAll('.vm-tag.driver').forEach(el => el.classList.remove('picked'));
          tag.classList.add('picked');
        };
      });
    }
    if (balBox) {
      const b = balance != null ? balance : 0;
      const need = this._suggestion?.total || matches[0]?.total || 0;
      const ok = b >= need;
      balBox.innerHTML = '<div>Υπόλοιπο: <strong>' + b.toFixed(1) + ' Coins</strong>'
        + (need ? ' · Παραγγελία: <strong>' + need.toFixed(1) + ' Coins</strong>' : '')
        + (ok ? '' : ' · <span style="color:#ff3344">ανεπαρκές — recharge στο CLI</span>') + '</div>';
    }
    if (confirmBtn && this._suggestion) {
      confirmBtn.style.display = 'block';
      confirmBtn.textContent = 'Επιβεβαίωση & Πληρωμή · Coins balance';
      this.buildQuote(this._suggestion).then(q => this.renderPricing(q)).catch(() => {});
    }
  },

  async smartOrder(query) {
    const run = async () => {
      const q = String(query || '').replace(/^(order|παραγγελία?)\s*/i, '').trim();
      const wants = this.parseWantedItems(q);
      this._lastWants = wants;
      if (!wants.length) {
        ACIControl?.reply('Δεν κατάλαβα είδη — π.χ. order pitogyra mpironia tsigareta');
        return this.openOrderFlow(q);
      }

      await this.loadVendors();
      const u = this.userLatLng();
      MapDepict?.showOrderSearch({ userLat: u.lat, userLng: u.lng, wantedLabels: wants.map(w => w.label), zoom: 1.22 });

      const matches = [];
      this.vendors.forEach(v => {
        const m = this.scoreVendorForWants(v, wants, u);
        if (m) matches.push(m);
      });
      matches.sort((a, b) => b.score - a.score || a.total - b.total || a.km - b.km);

      const drivers = await this.driversNear(u.lat, u.lng);
      this.showDriversOnGlobe(drivers);
      MapDepict?.showOrderSearch({ userLat: u.lat, userLng: u.lng, wantedLabels: wants.map(w => w.label), matches, drivers, zoom: 1.22 });

      const balance = Auth?.user ? await this.fetchBalance() : 0;
      this.showMenu();
      this.hideComparePanels();
      document.getElementById('vm-compare').style.display = 'block';
      const title = document.getElementById('vm-title');
      if (title) title.textContent = 'Σύγκριση · ' + wants.map(w => w.label).join(' + ');

      if (!matches.length) {
        this.renderCompare([], drivers, wants, balance);
        MarketplaceComms?.openForBrowse?.({ vendor: null, drivers, wants: wants.map(w => w.label).join(' + ') });
        const msg = 'Κανένα κατάστημα με πραγματικό μενού για αυτά τα είδη — ζήτησε μενού από κοντινό κατάστημα';
        ACIControl?.reply(msg);
        if (Voice.maySpeak()) speak(msg.slice(0, 120), () => resumeListening());
        return;
      }

      this.renderCompare(matches, drivers, wants, balance);
      const bestVendor = matches[0]?.vendor || null;
      MarketplaceComms?.openForBrowse?.({
        vendor: bestVendor,
        drivers,
        wants: wants.map(w => w.label).join(' + '),
        preferredDriverId: this._preferredDriverId,
      });
      const best = matches[0];
      const driverNames = drivers.slice(0, 2).map(d => d.display_name || 'Driver').join(', ');
      const msg = 'Πρόταση: ' + best.vendor.name + ' · ' + best.total.toFixed(1) + ' Coins · ' + best.km.toFixed(1) + ' km'
        + (driverNames ? ' · οδηγοί: ' + driverNames : ' · αναζήτηση οδηγού');
      ACIControl?.reply(msg);
      if (Voice.maySpeak()) speak(msg.slice(0, 140), () => resumeListening());
      FieldBrain?.pulse('commerce', wants.map(w => w.label).join('+') + ' → ' + best.vendor.name, { role: 'client' });
    };

    if (!userLocated && navigator.geolocation) {
      ACIControl?.reply('Zoom στον χάρτη σου…');
      navigator.geolocation.getCurrentPosition(pos => {
        placeMe(pos.coords.latitude, pos.coords.longitude, { quiet: true, markerOnly: true });
        run();
      }, () => run());
    } else {
      MapDepict?.zoomToUser(GlobeControl?.Z?.national || 1.82);
      run();
    }
  },

  async confirmAndPay(useWallet) {
    const sug = this._suggestion;
    if (!sug) { ACIControl?.reply('Διάλεξε πρόταση από τη λίστα'); return; }
    if (!Auth?.user) {
      ACIControl?.reply('Σύνδεση για πληρωμή');
      Auth?.openLoginModal?.('Sign in to order');
      return;
    }
    const quote = await this.buildQuote(sug);
    const total = quote?.total_eur ?? sug.total;
    let walletPayment = null;
    if (useWallet) {
      try {
        walletPayment = await GoogleWalletPay.pay(total, sug.vendor.name + ' · Astranov', { test: location.hostname === 'localhost' });
      } catch (e) {
        ACIControl?.reply('Wallet payment cancelled or unavailable — try Coins balance');
        return;
      }
    } else {
      const balance = await this.fetchBalance();
      if (balance < total) {
        const msg = 'Ανεπαρκές υπόλοιπο (' + balance.toFixed(1) + ' EUR) — χρειάζεσαι ' + total.toFixed(2) + ' EUR ή Google Wallet';
        ACIControl?.reply(msg);
        return;
      }
    }
    const items = sug.picks.map(p => ({ name: p.item.name, qty: 1, price: p.item.price }));
    const vendor = sug.vendor;
    MapDepict?.action('pay', {
      lat: this.userLatLng().lat, lng: this.userLatLng().lng,
      vendorLat: vendor.lat, vendorLng: vendor.lng,
      detail: vendor.name + ' · ' + total.toFixed(2) + ' EUR',
    });
    await this.placeOrder(vendor, items, 'Smart order · ' + sug.picks.map(p => p.want.label).join(' + '), !useWallet, {
      quote, walletPayment, payWithWallet: !!walletPayment,
    });
  },

  async showPicker(filter) {
    await this.loadVendors();
    if (!userLocated && navigator.geolocation) {
      await new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
          pos => { placeMe(pos.coords.latitude, pos.coords.longitude, { fly: true, quiet: true }); resolve(); },
          () => resolve(),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
      });
    } else if (window._lastPos) {
      placeMe(window._lastPos.lat, window._lastPos.lng, { fly: true, quiet: true });
    }
    this.showMenu();
    this.selected = null;
    this.cart = {};
    this._menuRequestSent = false;
    this.hideComparePanels();
    const list = document.getElementById('vm-list');
    if (list) list.style.display = 'block';
    this._suggestion = null;
    const title = document.getElementById('vm-title');
    if (title) title.textContent = 'Επίλεξε κατάστημα · ' + this.vendors.length;

    let rows = this.vendors;
    if (filter) {
      const q = filter.toLowerCase();
      rows = this.vendors.filter(v => (v.name + ' ' + v.category).toLowerCase().includes(q));
      if (!rows.length) rows = this.vendors;
    }

    if (!list) return;
    list.innerHTML = '';
    const u = this.userLatLng();
    rows.slice(0, 24).forEach(v => {
      const km = this.haversineKm(u.lat, u.lng, v.lat, v.lng).toFixed(1);
      const hasMenu = this.hasMenu(v);
      const row = document.createElement('div');
      row.className = 'vm-vendor';
      row.innerHTML = '<span style="font-size:22px">' + vendorIcon(v) + '</span><div><div style="color:#3d9eff;font-weight:600">' + v.name + '</div><div style="color:#9ab;font-size:10px">' + (v.category || 'shop') + ' · ' + km + ' km' + (hasMenu ? '' : ' · <span style="color:#ffd633">χωρίς μενού</span>') + '</div></div>';
      row.onclick = () => this.openVendor(v);
      list.appendChild(row);
    });
    if (rows[0]) this.flyToVendor(rows[0]);
    await this.renderDriverPick();
    ACIControl?.reply('Tap vendor on globe or list — ' + rows.length + ' shops · pick driver above');
  },

  async openVendor(vendor) {
    if (!vendor) return;
    this.selected = vendor;
    this.cart = {};
    this._menuRequestSent = false;
    this.flyToVendor(vendor);
    this.showMenu();
    this.hideComparePanels();
    const list = document.getElementById('vm-list');
    const detail = document.getElementById('vm-detail');
    if (list) list.style.display = 'none';
    if (detail) detail.style.display = 'block';
    const compare = document.getElementById('vm-compare');
    if (compare) compare.style.display = 'none';
    const title = document.getElementById('vm-title');
    if (title) title.textContent = vendorIcon(vendor) + ' ' + vendor.name;
    this.renderCart();
    await this.renderDriverPick();
    GlobeDeck?.setMapStatus(this.hasMenu(vendor) ? vendor.name + ' — add items' : vendor.name + ' — request menu');
  },

  renderCart() {
    const box = document.getElementById('vm-items');
    const empty = document.getElementById('vm-empty');
    const placeBtn = document.getElementById('vm-place');
    const requestBtn = document.getElementById('vm-request');
    if (!box || !this.selected) return;

    const menu = this.menuFor(this.selected);
    if (!menu.length) {
      box.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        empty.innerHTML = '<p>Το κατάστημα δεν έχει ανεβάσει μενού στο Astranov ακόμα.</p><p style="color:#9ab;font-size:11px">Πάτα παρακάτω — θα ειδοποιηθεί ο ιδιοκτήτης να συμπληρώσει τα πραγματικά προϊόντα.</p>';
      }
      if (placeBtn) placeBtn.style.display = 'none';
      if (requestBtn) {
        requestBtn.style.display = 'block';
        requestBtn.textContent = this._menuRequestSent ? 'Αίτημα στάλθηκε ' + (AstroGlyphs?.ok || '✔️') : (AstroGlyphs?.menu || '📋') + ' Ζήτησε μενού από κατάστημα';
        requestBtn.disabled = !!this._menuRequestSent;
      }
      return;
    }

    if (empty) empty.style.display = 'none';
    if (requestBtn) requestBtn.style.display = 'none';
    if (placeBtn) placeBtn.style.display = 'block';

    box.innerHTML = '';
    menu.forEach(item => {
      const key = item.name;
      const qty = this.cart[key] || 0;
      const row = document.createElement('div');
      row.className = 'vm-item';
      row.innerHTML = '<span>' + item.name + ' <small style="color:#9ab">' + (item.price || 0) + ' Coins</small></span>';
      const q = document.createElement('div');
      q.className = 'vm-qty';
      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.onclick = () => { this.cart[key] = Math.max(0, (this.cart[key] || 0) - 1); this.renderCart(); };
      const span = document.createElement('span');
      span.textContent = String(qty);
      span.style.minWidth = '18px';
      span.style.textAlign = 'center';
      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.onclick = () => { this.cart[key] = (this.cart[key] || 0) + 1; this.renderCart(); };
      q.append(minus, span, plus);
      row.appendChild(q);
      box.appendChild(row);
    });
    const total = menu.reduce((s, i) => s + (this.cart[i.name] || 0) * (i.price || 0), 0);
    if (placeBtn) placeBtn.textContent = total > 0 ? 'Παραγγελία · ' + total.toFixed(1) + ' Coins' : 'Παραγγελία';
  },

  cartItems() {
    const menu = this.menuFor(this.selected || {});
    return menu
      .filter(i => (this.cart[i.name] || 0) > 0)
      .map(i => ({ name: i.name, qty: this.cart[i.name], price: i.price }));
  },

  async requestMenu() {
    const vendor = this.selected;
    if (!vendor) { ACIControl?.reply('Pick a vendor first'); return; }
    if (this.hasMenu(vendor)) {
      ACIControl?.reply('Menu already available — add items to order');
      return;
    }
    if (!Auth?.user) {
      ACIControl?.reply('Sign in to request menu');
      Auth?.openLoginModal?.('Sign in to order');
      return;
    }
    if (this._menuRequestSent) return;

    const u = this.userLatLng();
    let errMsg = '';
    let ok = false;
    let result = null;
    try {
      const headers = await Auth.authHeaders();
      const r = await fetch(SB_URL + '/functions/v1/menu-request', {
        method: 'POST', headers,
        body: JSON.stringify({
          vendor_id: vendor.id,
          notes: 'Customer waiting for menu · ' + vendor.name,
          delivery_lat: u.lat,
          delivery_lng: u.lng,
        }),
      });
      result = await r.json().catch(() => ({}));
      ok = r.ok && result.ok;
      if (!ok) errMsg = result.error || result.message || ('HTTP ' + r.status);
      else this._menuRequestSent = true;
    } catch (e) { errMsg = String(e.message || e); }

    const msg = ok
      ? 'Αίτημα μενού στο ' + vendor.name + (result?.already_pending ? ' (ήδη σε αναμονή)' : ' — ο ιδιοκτήτης ειδοποιήθηκε')
      : 'Αίτημα απέτυχε: ' + (errMsg || 'server error');

    if (ok) {
      this.renderCart();
      MapDepict?.action('order', { lat: u.lat, lng: u.lng, vendorLat: vendor.lat, vendorLng: vendor.lng, detail: 'menu request · ' + vendor.name });
      FieldBrain?.pulse('commerce', 'menu request · ' + vendor.name, { role: 'client' });
    }

    ACIControl?.reply(msg);
    if (Voice.maySpeak()) speak(msg.slice(0, 120), () => resumeListening());
  },

  async placeCart() {
    const vendor = this.selected;
    if (!vendor) { ACIControl?.reply('Pick a vendor first'); return; }
    if (!this.hasMenu(vendor)) {
      ACIControl?.reply('No menu yet — tap Ζήτησε μενού to notify the vendor');
      return;
    }
    const items = this.cartItems();
    if (!items.length) { ACIControl?.reply('Add at least one item'); return; }
    if (!Auth?.user) {
      ACIControl?.reply('Sign in to place order');
      Auth?.openLoginModal?.('Sign in to order');
      return;
    }
    await this.placeOrder(vendor, items);
  },

  async placeOrder(vendor, items, notes, payWithBalance, opts) {
    opts = opts || {};
    requestLocationIfNeeded(async () => {
      const u = this.userLatLng();
      let dLat = opts.deliveryLat ?? u.lat;
      let dLng = opts.deliveryLng ?? u.lng;
      const subtotal = items.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
      const km = this.haversineKm(u.lat, u.lng, vendor.lat, vendor.lng);
      const quote = opts.quote || await DeliveryPricing?.quote?.({ km, kg: 3 + items.length, subtotal_eur: subtotal, lat: dLat, lng: dLng });
      const total = quote?.total_eur ?? subtotal;
      let orderResult = null;
      let errMsg = '';
      try {
        const headers = Auth?.authHeaders ? await Auth.authHeaders() : sbHeaders();
        const r = await fetch(SB_URL + '/functions/v1/order-intake', {
          method: 'POST', headers,
          body: JSON.stringify({
            vendor_id: vendor.id,
            items: items.map(i => ({ name: i.name, qty: i.qty || 1, price: i.price })),
            delivery_lat: dLat,
            delivery_lng: dLng,
            notes: notes || ('Astranov order · ' + vendor.name),
            calc: {
              ...(quote || {}),
              subtotal_eur: subtotal,
              total_avc: total,
              goods_eur: subtotal,
              wallet_payment: opts.walletPayment || null,
              paid_via: opts.payWithWallet ? 'google_wallet' : (payWithBalance ? 'avc_balance' : null),
            },
            pay_with_balance: !!payWithBalance && !opts.payWithWallet,
            pay_with_wallet: !!opts.payWithWallet,
            preferred_driver_id: this._preferredDriverId || null,
            target_user_id: opts.targetUserId || null,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) orderResult = j;
        else {
          if (j.error === 'vendor_menu_empty') errMsg = 'Το κατάστημα δεν έχει μενού — ζήτησε μενού πρώτα';
          else if (j.error === 'insufficient_balance') errMsg = 'Ανεπαρκές υπόλοιπο · έχεις ' + (j.balance || 0) + ' Coins, χρειάζεσαι ' + (j.needed || total);
          else errMsg = j.error || j.message || ('HTTP ' + r.status);
        }
      } catch (e) { errMsg = String(e.message || e); }

      const driverObj = orderResult?.driver;
      const driver = driverObj?.name || orderResult?.order?.driver_name || (orderResult?.seeking_driver ? 'seeking driver' : null);
      const ordId = orderResult?.order?.short_id || orderResult?.order?.id;

      MapDepict?.action('order', {
        lat: dLat, lng: dLng,
        vendorLat: vendor.lat, vendorLng: vendor.lng,
        detail: vendor.name + (ordId ? ' · ' + ordId : ''),
      });
      if (window.DrivingView) DrivingView.setDestination(vendor.lat, vendor.lng);

      let msg;
      if (orderResult?.order) {
        const paid = orderResult.paid ? ' · Πληρώθηκε ' + (orderResult.paid_amount || total).toFixed(1) + ' Coins' : '';
        msg = orderResult.seeking_driver
          ? 'Παραγγελία ' + (ordId || '') + ' στο ' + vendor.name + paid + '. Αναζητούμε οδηγό — claim στο CLI.'
          : 'Παραγγελία ' + (ordId || '') + ' στο ' + vendor.name + paid + '. Οδηγός: ' + (driver || 'pending') + '.';
        if (orderResult.balance_after != null) this._balance = orderResult.balance_after;
        this.hideMenu();
        GlobeDeck?.completeTask('commerce');
        const nearDrivers = await this.fetchNearbyDrivers(dLat, dLng);
        MarketplaceComms?.openForOrder?.({
          order: orderResult.order,
          vendor,
          drivers: nearDrivers,
          seeking_driver: orderResult.seeking_driver,
          wants: items.map(i => i.name).join(', '),
        });
        const wants = items.map(i => i.name).join(', ');
        TelemachosPilot?.coordinateMarketplaceDelivery?.({
          vendor,
          order: orderResult.order,
          items,
          driver: driverObj,
          deliveryLat: dLat,
          deliveryLng: dLng,
          seekingDriver: orderResult.seeking_driver,
          wants,
          targetUser: opts.targetUser,
        });
        if (opts.targetUser) {
          await TelemachosPilot?.onTeamOrder?.({
            target: opts.targetUser,
            items,
            order: orderResult.order,
            deliveryLat: dLat,
            deliveryLng: dLng,
          });
        }
        OrderTracking?.onOrderPlaced?.(orderResult.order, vendor, driverObj);
      } else {
        msg = 'Παραγγελία απέτυχε: ' + (errMsg || 'server error') + '. Δοκίμασε ξανά.';
      }

      ACIControl?.reply(msg);
      FieldBrain?.pulse('order', vendor.name + ' → ' + (driver || 'pending'), { role: 'client' });
      if (Voice.maySpeak()) speak(msg.slice(0, 120), () => resumeListening());
    });
  },

  async updateVendorMenu(vendorId, items) {
    const headers = await Auth.authHeaders();
    const r = await fetch(SB_URL + '/rest/v1/vendors?id=eq.' + encodeURIComponent(vendorId), {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ items, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { error: j.message || j.error || ('HTTP ' + r.status) };
    }
    const rows = await r.json();
    await this.fulfillMenuRequests(vendorId);
    await this.loadVendors();
    if (this.selected?.id === vendorId && rows[0]) this.selected = rows[0];
    return { ok: true, vendor: rows[0] };
  },

  async fulfillMenuRequests(vendorId) {
    try {
      const headers = await Auth.authHeaders();
      await fetch(SB_URL + '/rest/v1/vendor_menu_requests?vendor_id=eq.' + encodeURIComponent(vendorId) + '&status=eq.pending', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'fulfilled', updated_at: new Date().toISOString() }),
      });
    } catch { /* non-fatal */ }
  },

  async listMenuRequests() {
    const owned = await this.myVendors();
    if (!owned.length) return { error: 'no owned vendors' };
    const ids = owned.map(v => v.id).join(',');
    try {
      const headers = await Auth.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/vendor_menu_requests?select=id,vendor_id,status,notes,created_at&vendor_id=in.(' + ids + ')&status=eq.pending&order=created_at.desc&limit=20', { headers });
      const rows = r.ok ? await r.json() : [];
      const byId = Object.fromEntries(owned.map(v => [v.id, v.name]));
      return { ok: true, requests: rows.map(row => ({ ...row, vendor_name: byId[row.vendor_id] || row.vendor_id })) };
    } catch (e) { return { error: String(e.message || e) }; }
  },

  async cliVendorMenu(args) {
    if (!Auth?.user) return { error: 'login required' };
    const sub = (args[0] || 'list').toLowerCase();
    if (sub === 'list' || sub === 'ls') {
      const owned = await this.myVendors();
      if (!owned.length) return { error: 'you do not own any vendor — claim shop in dashboard first' };
      return {
        ok: true,
        vendors: owned.map(v => ({
          id: v.id,
          name: v.name,
          items: this.menuFor(v).length,
        })),
      };
    }
    if (sub === 'add') {
      const ref = args[1];
      const price = parseFloat(args[args.length - 1]);
      const name = args.slice(2, -1).join(' ').trim();
      if (!ref || !name || isNaN(price)) return { error: 'usage: vendor menu add <shop> <item name> <price>' };
      const v = await this.resolveOwnedVendor(ref);
      if (!v) return { error: 'owned vendor not found: ' + ref };
      const items = this.menuFor(v).concat([{ name, price }]);
      const r = await this.updateVendorMenu(v.id, items);
      if (r.error) return r;
      return { ok: true, message: 'added ' + name + ' @ ' + price + ' Coins to ' + v.name, items: items.length };
    }
    if (sub === 'clear') {
      const ref = args[1];
      if (!ref) return { error: 'usage: vendor menu clear <shop>' };
      const v = await this.resolveOwnedVendor(ref);
      if (!v) return { error: 'owned vendor not found: ' + ref };
      const r = await this.updateVendorMenu(v.id, []);
      if (r.error) return r;
      return { ok: true, message: 'cleared menu for ' + v.name };
    }
    if (sub === 'show') {
      const ref = args[1];
      const v = await this.resolveOwnedVendor(ref);
      if (!v) return { error: 'owned vendor not found' };
      return { ok: true, vendor: v.name, menu: this.menuFor(v) };
    }
    return { error: 'usage: vendor menu list|add|clear|show' };
  },

  announceVendors() {
    this.showPicker();
  },

  async openOrderFlow(query) {
    const q = String(query || '').trim();
    if (this.parseWantedItems(q).length && !this.looksLikeVendorOnly(q)) {
      return this.smartOrder(q);
    }
    await this.loadVendors();
    const u = this.userLatLng();
    if (!this.vendors.length) {
      ACIControl?.reply('No vendors on map yet');
      return;
    }
    MapDepict?.scanCity?.({ userLat: u.lat, userLng: u.lng, vendors: this.vendors.slice(0, 8), label: q || 'Shops near you' });
    if (q.length >= 2) {
      const hit = this.vendors.find(v => (v.name + ' ' + v.category).toLowerCase().includes(q.toLowerCase()));
      if (hit) { this.openVendor(hit); return; }
    }
    this.showPicker(q.length >= 2 ? q : '');
  },

  async orderPitogyra() {
    await this.smartOrder('pitogyra mpironia tsigareta');
  },
};
window.Commerce = Commerce;
