const container = document.getElementById('globe');
let renderer = window.renderer;
let drag = window.drag, px = 0, py = 0;
let dragging = window.dragging;
let idleRoll = window.idleRoll;
let globePivot = window.globePivot;
let trackVelX = window.trackVelX, trackVelY = window.trackVelY;
let cityLevel = window.cityLevel;
let voiceEnabled = window.voiceEnabled;
let voiceSessionActive = window.voiceSessionActive;
let isListening = window.isListening;
let recognition = window.recognition;
let userLocated = window.userLocated;
const scene = window.scene;
const camera = window.camera;
const earth = window.earth;
const sun = window.sun;
function syncGlobePivotRotation() {
  if (!globePivot) return;
  globePivot.quaternion.setFromEuler(globePivot.rotation, 'YXZ');
}
window.syncGlobePivotRotation = syncGlobePivotRotation;

// lat/lng to 3D sphere position
function latLngToPos(lat, lng, r = 1) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lng + 180) * Math.PI / 180;
  return {
    x: -(r * Math.sin(phi) * Math.cos(theta)),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta)
  };
}

// Globe follow vs free explore — release when user drags the globe
const GlobeControl = {
  followMode: 'free',
  userExploring: false,
  _exploreUntil: 0,
  _lastAutoFly: 0,
  _snapConflicts: 0,

  isEarthView() {
    const z = camera?.position?.z ?? 2.5;
    const level = CosmicZoom?.level || 'earth';
    return (level === 'earth' || level === 'orbit') && z < 4.5;
  },

  shouldAutoFly() {
    if (drag || dragging) return false;
    if (this.userExploring && Date.now() < this._exploreUntil) return false;
    return this.followMode !== 'free';
  },

  engageFollow(mode) {
    this.followMode = mode || 'locate';
    this.userExploring = false;
    this._exploreUntil = 0;
    const btn = document.getElementById('aci-locate');
    if (btn) btn.classList.toggle('deck-btn-active', mode === 'locate');
  },

  userTookGlobe(reason) {
    if (this.userExploring && Date.now() - this._lastAutoFly < 2500) {
      this._snapConflicts++;
      window.AciCoders?.observeActivity?.('ui_struggle', 'globe snap-back · user freed globe', { conflicts: this._snapConflicts });
    }
    this.userExploring = true;
    this._exploreUntil = Date.now() + 180000;
    this.followMode = 'free';
    window._globeFly = null;
    const btn = document.getElementById('aci-locate');
    if (btn) btn.classList.remove('deck-btn-active');
    if (window.DrivingView) window.DrivingView._cameraFollow = false;
    GlobeDeck?.setPreview('🌍 Globe free — drag to explore');
    window.SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
    if (reason !== 'silent') {
      window.AciCoders?.observeActivity?.('ui', 'user explore globe · follow released', { reason: reason || 'drag' });
    }
  },

  noteAutoFly() {
    this._lastAutoFly = Date.now();
  },

  Z: { global: 3.2, national: 1.82, regional: 1.65, city: 1.38 },

  /** Z depth that activates the flat city map (explicit city entry only) */
  cityEntryZ() {
    const enter = CityMap?.ENTER_Z ?? 1.36;
    return Math.min(this.Z.city, enter - 0.02);
  },

  flyDuration(fromZ, toZ) {
    const a = fromZ ?? camera?.position?.z ?? 2.55;
    const b = toZ ?? 2.55;
    return Math.min(3200, Math.round(2000 + Math.abs(a - b) * 1100));
  },

  /** Default fly — global view; never drops to city unless opts.city === true */
  flyToLatLng(lat, lng, label, targetZ, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    if (!TrackballGuard?.beforeFly?.(lat, lng, o)) return false;
    syncGlobePivotRotation?.();
    window._globeFly = null;
    let z = targetZ;
    if (z == null) z = o.city ? this.Z.city : this.Z.global;
    else if (!o.city && z < this.Z.regional) z = this.Z.national;
    const p = latLngToPos(lat, lng, 1.04);
    if (typeof flyToPoint !== 'function') return false;
    const dist = TrackballGuard?.greatCircleKm?.(
      TrackballGuard.facingLatLng().lat,
      TrackballGuard.facingLatLng().lng,
      lat, lng
    ) || 0;
    const dur = o.dur || Math.min(5200, Math.max(900, this.flyDuration(camera?.position?.z, z) + dist * 0.14));
    flyToPoint(new THREE.Vector3(p.x, p.y, p.z), z, { dur, onTier: !!o.onTier, force: !!o.force });
    AIGraphics?.flyAstranovTo?.(lat, lng, { dur, color: 0x3d9eff });
    if (z > this.Z.regional) cityLevel = false;
    this.noteAutoFly();
    MapDepict?.pulse?.(lat, lng, 0x00ddff, label || 'task', 8000);
    return true;
  },

  async enterCity(lat, lng, opts) {
    if (lat != null && lng != null) return CityLife?.dropIn?.(lat, lng, opts || {});
    if (window._lastPos?.lat) return CityLife?.dropIn?.(window._lastPos.lat, window._lastPos.lng, opts || {});
    if (navigator.geolocation && CityLife?.locateAndDropIn) {
      try {
        return await CityLife.locateAndDropIn();
      } catch (_) {}
    }
    return CityLife?.dropIn?.(undefined, undefined, opts || {});
  },
};
window.GlobeControl = GlobeControl;

// === GLOBE NAVIGATE — trackball · national stop · click city · no jumps ===
const GlobeNavigate = {
  mode: 'global',
  anchor: null,
  _cityUnlocked: false,
  GLOBAL_Z: 3.2,
  NATIONAL_Z: 1.82,
  CITY_CAM_Z: 1.30,
  LEAFLET_ZOOM: 11,
  _lastClick: null,

  init() {
    this._syncChip();
  },

  camZ() {
    return camera?.position?.z ?? this.GLOBAL_Z;
  },

  isGlobal() {
    return this.camZ() > 2.15;
  },

  isNational() {
    const z = this.camZ();
    return z <= 2.15 && z > 1.44;
  },

  isCity() {
    return this.camZ() <= 1.44;
  },

  _syncChip() {
    const chip = document.getElementById('map-nav-chip');
    if (!chip) return;
    const cosmic = CosmicZoom?.level || 'earth';
    let txt = 'GLOBAL · full earth · scroll out → solar · galaxy';
    if (cosmic === 'galaxy') txt = 'GALAXY · scroll in → solar system → earth';
    else if (cosmic === 'system') txt = 'SOLAR SYSTEM · scroll in → earth · out → galaxy';
    else if (cosmic === 'orbit') txt = 'ORBIT · SpaceNet mesh · scroll out → solar system';
    else if (this.isCity()) txt = 'CITY z' + this.LEAFLET_ZOOM + ' · tap + for intent';
    else if (this.isNational()) txt = 'NATIONAL · tap a city to descend slowly';
    chip.textContent = txt;
    chip.classList.remove('visible');
    chip.hidden = true;
  },

  unlockCity() {
    this._cityUnlocked = true;
    this.mode = 'city';
  },

  clampZ(z) {
    let next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if (!this._cityUnlocked && next < this.NATIONAL_Z - 0.01) {
      next = this.NATIONAL_Z;
      this.mode = 'national';
    }
    return next;
  },

  onZoomSettle() {
    const z = this.camZ();
    if (!this._cityUnlocked && z < this.NATIONAL_Z && z > 1.5) {
      window._globeFly = {
        mode: 'zoom', fromZ: z, toZ: this.NATIONAL_Z,
        t0: performance.now(), dur: 700, onTier: false,
      };
      this.mode = 'national';
      ZoomTiers?.goTo?.('national', false);
    } else if (z > 2.35 && this.mode !== 'global') {
      this.mode = 'global';
      this._cityUnlocked = false;
      this._hideCityChips();
    }
    this._syncChip();
  },

  _hideCityChips() {
    const el = document.getElementById('city-pick-chips');
    if (el) { el.classList.remove('visible'); el.innerHTML = ''; }
  },

  _showCityChips(lat, lng) {
    const el = document.getElementById('city-pick-chips');
    if (!el) return;
    const vendors = (window.Commerce?.vendors || []).filter(v => v.lat != null && v.lng != null);
    const sorted = vendors.slice().sort((a, b) => {
      const da = SpaceNetGeo.haversineM(lat, lng, a.lat, a.lng);
      const db = SpaceNetGeo.haversineM(lat, lng, b.lat, b.lng);
      return da - db;
    }).slice(0, 3);
    if (!sorted.length) {
      this._hideCityChips();
      return;
    }
    el.innerHTML = sorted.map(v =>
      '<button type="button" data-city-pick="' + v.id + '">' + (v.emoji || '🏬') + ' ' + (v.name || 'Shop') + '</button>'
    ).join('');
    el.classList.add('visible');
    el.querySelectorAll('[data-city-pick]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const v = vendors.find(x => x.id === btn.dataset.cityPick);
        if (v) void this.handlePlaceClick(v.lat, v.lng, { fromChip: true, vendor: v });
      };
    });
  },

  async handlePlaceClick(lat, lng, opts) {
    opts = opts || {};
    if (lat == null || lng == null) return;
    const z = this.camZ();
    const same = this._lastClick && Math.hypot(lat - this._lastClick.lat, lng - this._lastClick.lng) < 0.35
      && Date.now() - this._lastClick.t < 8000;
    this._lastClick = { lat, lng, t: Date.now() };
    this.anchor = { lat, lng };

    if (opts.vendor) {
      VendorMapTile?.open?.(opts.vendor);
      return 'vendor';
    }

    if (this.isGlobal() || z > 2.05) {
      this.mode = 'national';
      this._cityUnlocked = false;
      ZoomTiers?.goTo?.('national', false);
      const p = latLngToPos(lat, lng, 1.04);
      flyToPoint(new THREE.Vector3(p.x, p.y, p.z), this.NATIONAL_Z, { dur: 2400, onTier: true });
      GlobeControl?.noteAutoFly?.();
      CityMap?.onCamera?.(this.NATIONAL_Z, 'earth');
      this._showCityChips(lat, lng);
      GlobeDeck?.setPreview?.('National airspace · pick a city chip or tap again');
      AciCli?.print?.('nav · national · ' + lat.toFixed(2) + ',' + lng.toFixed(2), 'ok');
      this._syncChip();
      return 'national';
    }

    if (this.isNational() || (!this._cityUnlocked && z > 1.42)) {
      return this._enterCitySlow(lat, lng, opts);
    }

    MapPlaceMenu?.openAt?.(lat, lng, {
      source: 'City',
      hint: 'Type intent — we show 3 smart picks only',
      limited: true,
      prefill: opts.intent || '',
    });
    return 'place';
  },

  async _enterCitySlow(lat, lng, opts) {
    this.unlockCity();
    this.anchor = { lat, lng };
    this._hideCityChips();
    window._cityDropLock = true;
    const p = latLngToPos(lat, lng, 1.04);
    const dur = 3400;
    flyToPoint(new THREE.Vector3(p.x, p.y, p.z), this.CITY_CAM_Z, { dur, onTier: true });
    GlobeControl?.noteAutoFly?.();
    GlobeDeck?.setPreview?.('Descending to city · zoom ' + this.LEAFLET_ZOOM + '…');
    if (typeof waitForGlobeFly === 'function') await waitForGlobeFly(dur + 800);
    await CityMap?.openAt?.(lat, lng, { camZ: this.CITY_CAM_Z, zoom: this.LEAFLET_ZOOM });
    window._lastPos = { lat, lng };
    if (window.Commerce?.loadVendors) {
      await Promise.race([window.Commerce.loadVendors(), new Promise(r => setTimeout(r, 5000))]);
    }
    window.Commerce?.showOnGlobe?.();
    GlobeEntity?.syncVendors?.(window.Commerce?.vendors || []);
    window._cityDropLock = false;
    GlobeDeck?.setPreview?.('City z' + this.LEAFLET_ZOOM + ' · tap shop or + for intent');
    AciCli?.print?.('nav · city z' + this.LEAFLET_ZOOM, 'ok');
    this._syncChip();
    if (opts?.openShops) await window.Commerce?.showPicker?.();
    return 'city';
  },
};
window.GlobeNavigate = GlobeNavigate;

// === VENDOR MAP TILE — profile + cover + menu on map (not boring lists) ===
const VendorMapTile = {
  _vendor: null,
  _cart: {},

  init() {
    document.getElementById('vmt-close')?.addEventListener('click', () => this.close());
    document.getElementById('vmt-order')?.addEventListener('click', () => void this.placeOrder());
  },

  esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  open(vendor) {
    if (!vendor) return;
    this._vendor = vendor;
    this._cart = {};
    const tile = document.getElementById('vendor-map-tile');
    if (!tile) return;
    tile.classList.add('open');
    MapPlaceMenu?.close?.();
    const cover = document.getElementById('vmt-cover');
    const avatar = document.getElementById('vmt-avatar');
    const coverUrl = vendor.cover_url || vendor.cover || vendor.banner_url || vendor.profile_page?.cover_url || '';
    const logoUrl = MapPins?.vendorLogo?.(vendor) || vendor.logo_url || vendor.avatar_url || '';
    if (cover) {
      cover.style.backgroundImage = coverUrl ? 'url(' + coverUrl + ')' : '';
    }
    if (avatar) {
      avatar.src = logoUrl || '';
      avatar.alt = vendor.name || 'Shop';
      if (!logoUrl) avatar.style.display = 'none';
      else avatar.style.display = 'block';
    }
    document.getElementById('vmt-name').textContent = (vendor.emoji || '🏬') + ' ' + (vendor.name || 'Shop');
    document.getElementById('vmt-sub').textContent = vendor.category || 'Vendor · tap items to order';
    this._renderMenu();
    if (vendor.lat != null) {
      GlobeNavigate.anchor = { lat: vendor.lat, lng: vendor.lng };
      const fp = latLngToPos(vendor.lat, vendor.lng, 1.04);
      if (GlobeNavigate.isNational() || GlobeNavigate.isGlobal()) {
        void GlobeNavigate._enterCitySlow(vendor.lat, vendor.lng, {});
      } else {
        flyToPoint?.(new THREE.Vector3(fp.x, fp.y, fp.z), GlobeNavigate.CITY_CAM_Z, { dur: 1800 });
      }
    }
    LazyModules.ensure().then(() => {
      if (window.Commerce) {
        window.Commerce.selected = vendor;
        window.Commerce.cart = this._cart;
      }
    });
    MapDepict?.pulse?.(vendor.lat, vendor.lng, 0x3d9eff, vendor.name, 8000);
  },

  close() {
    document.getElementById('vendor-map-tile')?.classList.remove('open');
    this._vendor = null;
  },

  _menu() {
    const v = this._vendor;
    if (!v) return [];
    if (window.Commerce?.menuFor) return window.Commerce.menuFor(v);
    return Array.isArray(v.items) ? v.items : [];
  },

  _renderMenu() {
    const box = document.getElementById('vmt-menu');
    const btn = document.getElementById('vmt-order');
    if (!box) return;
    const menu = this._menu();
    if (!menu.length) {
      box.innerHTML = '<p style="padding:8px;color:var(--an-muted)">No menu yet — request menu from owner.</p>';
      if (btn) btn.textContent = 'Request menu';
      return;
    }
    box.innerHTML = '';
    menu.forEach(item => {
      const key = item.name;
      const row = document.createElement('div');
      row.className = 'vmt-item';
      const img = item.image || item.photo || '';
      row.innerHTML = (img ? '<img src="' + this.esc(img) + '" alt="" />' : '') +
        '<div class="vmt-item-body"><b>' + this.esc(item.name) + '</b><small>' + (item.price || 0) + ' AVC</small></div>';
      const q = document.createElement('div');
      q.className = 'vmt-qty';
      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.onclick = (e) => { e.stopPropagation(); this._cart[key] = Math.max(0, (this._cart[key] || 0) - 1); this._renderMenu(); };
      const span = document.createElement('span');
      span.textContent = String(this._cart[key] || 0);
      span.style.minWidth = '16px';
      span.style.textAlign = 'center';
      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.onclick = (e) => { e.stopPropagation(); this._cart[key] = (this._cart[key] || 0) + 1; this._renderMenu(); };
      q.append(minus, span, plus);
      row.appendChild(q);
      row.onclick = () => { this._cart[key] = (this._cart[key] || 0) + 1; this._renderMenu(); };
      box.appendChild(row);
    });
    const total = menu.reduce((s, i) => s + (this._cart[i.name] || 0) * (i.price || 0), 0);
    if (btn) btn.textContent = total > 0 ? 'Order · ' + total.toFixed(1) + ' AVC' : 'Add items to order';
  },

  async placeOrder() {
    await LazyModules.ensure();
    const v = this._vendor;
    if (!v || !window.Commerce) return;
    window.Commerce.selected = v;
    window.Commerce.cart = { ...this._cart };
    const items = this._menu().filter(i => (this._cart[i.name] || 0) > 0)
      .map(i => ({ name: i.name, qty: this._cart[i.name], price: i.price }));
    if (!items.length) {
      window.Commerce.requestMenu?.();
      return;
    }
    window.Commerce.cart = Object.fromEntries(items.map(i => [i.name, i.qty]));
    window.Commerce.renderCart?.();
    void window.Commerce.confirmAndPay?.(false);
    this.close();
  },
};
window.VendorMapTile = VendorMapTile;

async function enterCityView(lat, lng, opts) {
  return GlobeControl.enterCity(lat, lng, opts);
}
window.enterCityView = enterCityView;

// === ASTRANOV AUTH URL — never expose classified Supabase project ref to users ===
const ASTRANOV_GOOGLE_CLIENT_ID = '73846897360-va7gcqngfc370gfp7rl059no0vd4ts11.apps.googleusercontent.com';

const ASTRANOV_SUPABASE_REF = 'lkoatrkhuigdolnjsbie';
const ASTRANOV_SUPABASE_DIRECT = 'https://' + ASTRANOV_SUPABASE_REF + '.supabase.co';
const ASTRANOV_SUPABASE_CUSTOM = 'https://api.astranov.eu';

window.ASTRANOV_CENTRAL_DB = window.ASTRANOV_CENTRAL_DB || {
  useCustomDomain: false,
  customUrl: ASTRANOV_SUPABASE_CUSTOM,
};

function resolveAstranovSupabaseUrl() {
  const c = window.ASTRANOV_CENTRAL_DB;
  if (c?.useCustomDomain && c?.customUrl) return c.customUrl;
  return ASTRANOV_SUPABASE_DIRECT;
}

/** Supabase JS client (auth · realtime · .from()) — always direct; Vercel cannot proxy WebSocket */
function resolveAstranovSupabaseClientUrl() {
  return ASTRANOV_SUPABASE_DIRECT;
}

/** Edge functions — direct URL so JWT validation is reliable */
function resolveAstranovFunctionsUrl() {
  return resolveAstranovSupabaseClientUrl() + '/functions/v1';
}

function astranovPublicOrigin() {
  try {
    const host = location.hostname || '';
    if (host === 'astranov.eu' || host.endsWith('.astranov.eu')) return location.origin;
  } catch (_) { /* */ }
  return 'https://astranov.eu';
}

function scrubSupabaseLeak(text) {
  return String(text || '')
    .replace(/[a-z0-9]{18,}\.supabase\.co/gi, 'astranov.eu')
    .replace(/\bsupabase\b/gi, 'Astranov');
}

function astranovizeAuthUrl(url) {
  try {
    const origin = astranovPublicOrigin();
    // Proxy hop only — never rewrite redirect_uri (breaks Google OAuth validation)
    return String(url || '').replace(/https:\/\/[a-z0-9]{18,}\.supabase\.co/gi, origin);
  } catch (_) {
    return url;
  }
}

window.ASTRANOV_GOOGLE_CLIENT_ID = ASTRANOV_GOOGLE_CLIENT_ID;
window.resolveAstranovSupabaseUrl = resolveAstranovSupabaseUrl;
window.resolveAstranovSupabaseClientUrl = resolveAstranovSupabaseClientUrl;
window.resolveAstranovFunctionsUrl = resolveAstranovFunctionsUrl;
window.astranovPublicOrigin = astranovPublicOrigin;
window.scrubSupabaseLeak = scrubSupabaseLeak;
window.astranovizeAuthUrl = astranovizeAuthUrl;

// === VOICE + MAP DEPICT ===
// Astranov Voice: ONE calm female persona, ONE utterance at a time (queued).
// Server TTS preferred; browser fallback only if server unavailable.

const Voice = {
  persona: { name: 'Astranov', style: 'female calm mid-tone' },
  voices: [],
  ready: false,
  speaking: false,
  stopped: false,
  preferredListenLang: 'el-GR',
  _voicesReady: null,
  _audio: null,
  _blobUrl: null,
  _gen: 0,
  _queue: Promise.resolve(),
  engine: 'astranov',

  init() {
    const load = () => {
      this.voices = speechSynthesis.getVoices().filter(v => v.lang);
      if (this.voices.length) this.ready = true;
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    setTimeout(load, 400);
    setTimeout(load, 1200);
  },

  ensureVoices() {
    if (!this._voicesReady) {
      this._voicesReady = new Promise(resolve => {
        const done = () => {
          this.voices = speechSynthesis.getVoices().filter(v => v.lang);
          this.ready = this.voices.length > 0;
          resolve();
        };
        done();
        speechSynthesis.addEventListener('voiceschanged', done, { once: true });
        setTimeout(done, 800);
      });
    }
    return this._voicesReady;
  },

  detectLang(s) {
    if (ArcangeloDialect?.looksMixed?.(s) || ArcangeloDialect?.detect?.(s)?.active) return 'el-GR';
    const g = (s.match(/[\u0370-\u03FF\u1F00-\u1FFF]/g) || []).length;
    const l = (s.match(/[a-zA-Z]/g) || []).length;
    return g >= l * 0.25 ? 'el-GR' : 'en-US';
  },

  pickFemaleCalm(lang) {
    const v = this.voices;
    if (!v.length) return null;
    const isFemale = x => /female|zira|samantha|susan|hazel|aria|victoria|linda|karen|moira|fiona|tessa|melina|elena|google.*γυναικ|natural.*female/i.test(x.name);
    if (lang === 'el-GR') {
      return v.find(x => isFemale(x) && /el/i.test(x.lang))
        || v.find(x => /melina|elena|ελληνικά/i.test(x.name))
        || v.find(x => /^el[-_]?GR$/i.test(x.lang) && !/stefanos|male|nikos/i.test(x.name));
    }
    return v.find(x => isFemale(x) && /^en/i.test(x.lang))
      || v.find(x => /zira|samantha|hazel|aria|victoria/i.test(x.name))
      || v.find(x => /^en[-_]?US$/i.test(x.lang));
  },

  hasGreekVoice() {
    return !!this.pickFemaleCalm('el-GR');
  },

  /** Browser TTS without a Greek voice spells Α→Α Κ Ο… — romanize instead */
  romanizeGreek(text) {
    const map = {
      α: 'a', ά: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z', η: 'i', ή: 'i',
      θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x',
      ο: 'o', ό: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', ύ: 'y', φ: 'f',
      χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o',
      Α: 'A', Ά: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Έ: 'E', Ζ: 'Z', Η: 'I', Ή: 'I',
      Θ: 'Th', Ι: 'I', Ί: 'I', Κ: 'K', Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X', Ο: 'O', Ό: 'O',
      Π: 'P', Ρ: 'R', Σ: 'S', Τ: 'T', Υ: 'Y', Ύ: 'Y', Φ: 'F', Χ: 'Ch', Ψ: 'Ps', Ω: 'O', Ώ: 'O',
    };
    return String(text || '').split('').map(c => map[c] || c).join('');
  },

  prepareForSpeech(text) {
    let s = this.humanize(text).slice(0, 420);
    if (!s) return { text: '', lang: 'en-US', speak: false };
    let lang = this.detectLang(s);
    const hasGreek = /[\u0370-\u03FF\u1F00-\u1FFF]/.test(s);
    if (hasGreek && lang === 'el-GR' && !this.hasGreekVoice()) {
      s = this.romanizeGreek(s);
      lang = 'en-US';
    }
    return { text: s, lang, speak: this.shouldSpeak(s) };
  },

  async synthHeaders() {
    if (window.Auth?.authHeaders) return Auth.authHeaders();
    return { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  },

  releaseAudio() {
    if (this._audio) { try { this._audio.pause(); this._audio.currentTime = 0; } catch (_) {} this._audio = null; }
    if (this._blobUrl) { try { URL.revokeObjectURL(this._blobUrl); } catch (_) {} this._blobUrl = null; }
  },

  playBlob(blob, gen) {
    return new Promise(resolve => {
      if (this.stopped || gen !== this._gen) { resolve(); return; }
      this.releaseAudio();
      this._blobUrl = URL.createObjectURL(blob);
      this._audio = new Audio(this._blobUrl);
      this._audio.onended = () => { this.releaseAudio(); resolve(); };
      this._audio.onerror = () => { this.releaseAudio(); resolve(); };
      this.speaking = true;
      AstranovLogo?.hookAiAudio?.(this._audio);
      window.syncHandsFreeBtn?.();
      this._audio.play().catch(() => resolve());
    });
  },

  async synthServer(text, lang) {
    try {
      const fnBase = typeof resolveAstranovFunctionsUrl === 'function' ? resolveAstranovFunctionsUrl() : (SB_URL + '/functions/v1');
      const r = await fetch(fnBase + '/voice', {
        method: 'POST',
        headers: await this.synthHeaders(),
        body: JSON.stringify({ text, lang, persona: this.persona.name })
      });
      if (r.ok && (r.headers.get('content-type') || '').includes('audio')) {
        this.engine = r.headers.get('X-Astranov-Voice') || 'astranov';
        return await r.blob();
      }
    } catch (_) {}
    return null;
  },

  speakBrowser(text, lang, gen) {
    return new Promise(resolve => {
      if (this.stopped || gen !== this._gen) { resolve(); return; }
      try { speechSynthesis.cancel(); } catch (_) {}
      let say = text;
      let sayLang = lang;
      if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(say) && !this.hasGreekVoice()) {
        say = this.romanizeGreek(say);
        sayLang = 'en-US';
      }
      const utter = new SpeechSynthesisUtterance(say);
      utter.lang = sayLang;
      utter.rate = 0.88;
      utter.pitch = 0.94;
      const voice = this.pickFemaleCalm(sayLang);
      if (voice) utter.voice = voice;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      this.engine = 'browser-female';
      this.speaking = true;
      speechSynthesis.speak(utter);
    });
  },

  humanize(text) {
    let s = ArcangeloDialect?.repairBrands?.(String(text || '')) || String(text || '');
    return s
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/[{}[\]"`#*_~|<>@$]/g, ' ')
      .replace(/\b([A-Z]{2,})\b/g, (_, w) => w.toLowerCase())
      .replace(/(\d)[.,](\d)/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  },

  shouldSpeak(text) {
    const t = (text || '').trim();
    const minLen = window._handsFreeVoice ? 2 : 4;
    if (t.length < minLen) return false;
    if (/^[\d\s.,:;+\-/]+$/.test(t)) return false;
    if (t.startsWith('{') || t.startsWith('[') || /^\s*"ok"/.test(t)) return false;
    if ((t.match(/[a-zA-Z\u0370-\u03FF]/g) || []).length < 3) return false;
    return true;
  },

  stop() {
    this._gen++;
    this.stopped = true;
    this.speaking = false;
    this.releaseAudio();
    try { speechSynthesis.cancel(); } catch (_) {}
    AstranovLogo?.setAiActive?.(false);
    window.syncHandsFreeBtn?.();
    AiGlyphs?.syncVoice?.();
  },

  flush() {
    this.stop();
    this._queue = Promise.resolve();
  },

  maySpeak() {
    return (voiceEnabled && voiceSessionActive && !this.stopped)
      || (window._handsFreeVoice && voiceEnabled && !this.stopped);
  },

  enqueue(text, onEnd, forceBrowser) {
    this._queue = this._queue
      .then(() => this._speakOne(text, onEnd, forceBrowser))
      .catch(() => {});
    return this._queue;
  },

  async _speakOne(text, onEnd, forceBrowser) {
    if (!voiceEnabled && !window._handsFreeVoice) { if (onEnd) onEnd(); return; }

    const gen = ++this._gen;
    this.stopped = false;
    this.speaking = true;
    AstranovLogo?.setAiActive?.(true);
    window.syncHandsFreeBtn?.();
    window.pauseVoiceRecognition?.();
    this.releaseAudio();
    try { speechSynthesis.cancel(); } catch (_) {}

    await this.ensureVoices();
    if (gen !== this._gen) { if (onEnd) onEnd(); return; }

    const prep = this.prepareForSpeech(text);
    if (!prep.speak) {
      if (gen === this._gen) {
        this.speaking = false;
        window.syncHandsFreeBtn?.();
      }
      if (onEnd) onEnd();
      return;
    }

    const { text: clean, lang } = prep;

    if (forceBrowser) {
      await this.speakBrowser(clean, lang, gen);
    } else {
      const blob = await this.synthServer(clean, lang);
      if (gen !== this._gen) { if (onEnd) onEnd(); return; }
      if (blob) {
        await this.playBlob(blob, gen);
      } else {
        await this.speakBrowser(clean, lang, gen);
      }
    }

    if (gen === this._gen) {
      this.speaking = false;
      AstranovLogo?.setAiActive?.(false);
      window.syncHandsFreeBtn?.();
      if (!onEnd) window.resumeVoiceRecognition?.();
    }
    if (onEnd && gen === this._gen && !this.stopped) onEnd();
  }
};

function speak(text, onEnd, force) {
  const handsFree = !!window._handsFreeVoice;
  if (!force && !handsFree && !Voice.maySpeak()) { if (onEnd) onEnd(); return Promise.resolve(); }
  if (handsFree && !voiceEnabled) voiceEnabled = true;
  const repaired = ArcangeloDialect?.repairOutbound?.(text, 'reply') ?? text;
  return Voice.enqueue(repaired, onEnd, !!force);
}
function stopSpeaking() { Voice.flush(); }

const MapDepict = {
  overlays: [],
  current: '',

  userPos() {
    return window._lastPos || { lat: 36.22, lng: 28.12 };
  },

  setHud(label, detail) {
    const line = detail ? label + ' — ' + detail : label;
    if (CliRibbon?.isGlobeHint?.(line)) return;
    GlobeDeck?.setMapStatus(line);
  },

  cancelAll() {
    this.overlays.forEach(o => {
      if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh);
      if (o.line && o.line.parent) o.line.parent.remove(o.line);
      if (o.group && o.group.parent) o.group.parent.remove(o.group);
    });
    this.overlays = [];
    this.current = '';
    GlobeDeck?.setPreview('');
  },

  pulse(lat, lng, color, label, duration = 9000) {
    if (window.GlobeEntity) {
      const e = GlobeEntity.registerTemp({
        type: 'place',
        lat, lng,
        title: label || 'Here',
        description: 'Active now · zoom closer',
        urgency: 2,
        color: color || 0x00ddff,
        expires: duration,
      });
      if (window.AIGraphics) {
        const p = latLngToPos(lat, lng, 1.04);
        AIGraphics.spawnEffect(new THREE.Vector3(p.x, p.y, p.z), color, 14, 36);
      }
      return { entity: e, born: Date.now(), duration, label };
    }
    const p = latLngToPos(lat, lng, 1.04);
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.032, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.position.copy(pos);
    ring.lookAt(0, 0, 0);
    globePivot.add(ring);
    if (window.AIGraphics) AIGraphics.spawnEffect(pos, color, 14, 36);
    const entry = { mesh: ring, born: Date.now(), duration, label };
    this.overlays.push(entry);
    return entry;
  },

  arc(fromLat, fromLng, toLat, toLng, color = 0x00ffaa, duration = 14000) {
    const a = latLngToPos(fromLat, fromLng, 1.03);
    const b = latLngToPos(toLat, toLng, 1.03);
    const va = new THREE.Vector3(a.x, a.y, a.z);
    const vb = new THREE.Vector3(b.x, b.y, b.z);
    const mid = va.clone().add(vb).multiplyScalar(0.5).normalize().multiplyScalar(1.1);
    const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 })
    );
    globePivot.add(line);
    const entry = { line, born: Date.now(), duration };
    this.overlays.push(entry);
    return line;
  },

  action(type, opts = {}) {
    const u = this.userPos();
    const lat = opts.lat != null ? opts.lat : u.lat;
    const lng = opts.lng != null ? opts.lng : u.lng;
    const detail = (opts.detail || '').slice(0, 80);
    this.current = type;

    const palette = {
      think: 0x44ccff,
      evolve: 0xaa66ff,
      teach: 0x66ff99,
      order: 0xffaa44,
      vendor: 0xff8844,
      compare: 0x66ffcc,
      driver: 0x4488ff,
      pay: 0x88ff44,
      phone: 0x44ff88,
      vhf: 0xffdd44,
      news: 0xcc88ff,
      explore: 0x00aaff,
      video: 0x3d9eff,
      location: 0x3d9eff,
      mode: 0x88aaff,
      stop: 0xff4466,
      drive: 0x44aaff,
      batch: 0x6688ff
    };
    const color = palette[type] || 0x00ddff;
    const labels = {
      think: 'Σκέψη ACI',
      evolve: 'Εξέλιξη collective',
      teach: 'Μνήμη / neuron',
      order: 'Παραγγελία',
      vendor: 'Καταστήματα',
      compare: 'Σύγκριση τιμών',
      driver: 'Οδηγοί διανομής',
      pay: 'Πληρωμή AVC',
      phone: 'Τηλέφωνο',
      vhf: 'VHF ασύρματος',
      news: 'Ειδήσεις',
      explore: 'Εξερεύνηση',
      video: 'Video κλήση',
      location: 'Τοποθεσία',
      mode: 'Λειτουργία ACI',
      stop: 'Διακοπή',
      drive: 'Οδήγηση δρόμου',
      batch: 'Batch · δουλειά μαζί'
    };

    this.setHud(labels[type] || type, detail);
    this.pulse(lat, lng, color, labels[type]);

    if (type === 'order' && opts.vendorLat != null) {
      this.arc(opts.vendorLat, opts.vendorLng, lat, lng, color);
      const fp = latLngToPos(lat, lng, 1.04);
      focusOnGlobePoint(new THREE.Vector3(fp.x, fp.y, fp.z));
    }
    if (type === 'vendor' && opts.vendors) {
      GlobeEntity?.syncVendors?.(opts.vendors);
      const v0 = opts.vendors[0];
      if (v0 && typeof flyToPoint === 'function') {
        const fp = latLngToPos(v0.lat, v0.lng, 1.04);
        flyToPoint(new THREE.Vector3(fp.x, fp.y, fp.z), GlobeControl?.Z?.national || 1.82);
      }
    }
    if (type === 'news') {
      const nlat = opts.worldLat ?? opts.lat ?? this.userPos().lat;
      const nlng = opts.worldLng ?? opts.lng ?? this.userPos().lng;
      this.pulse(nlat, nlng, color, 'News', 10000);
      GlobeControl?.flyToLatLng?.(nlat, nlng, 'news', GlobeControl?.Z?.global);
    }
    if (type === 'batch') {
      GlobeControl?.flyToLatLng?.(lat, lng, 'batch');
    }
    if (type === 'evolve') {
      const u = this.userPos();
      this.pulse(u.lat, u.lng, color, 'neuron', 11000);
    }
    if (type === 'think') {
      const fp = latLngToPos(lat, lng, 1.04);
      focusOnGlobePoint(new THREE.Vector3(fp.x, fp.y, fp.z));
    }
    if (type === 'compare' && opts.matches) {
      GlobeEntity?.syncVendors?.(opts.matches.map(m => m.vendor).filter(Boolean));
      opts.matches.slice(0, 6).forEach((m, i) => {
        const col = i === 0 ? 0x00ff88 : 0xffaa44;
        const v = m.vendor || m;
        this.arc(v.lat, v.lng, lat, lng, col);
      });
    }
    if (type === 'driver' && opts.drivers) {
      GlobeEntity?.syncDrivers?.(opts.drivers);
    }
    if (type === 'pay' && opts.vendorLat != null) {
      this.arc(opts.vendorLat, opts.vendorLng, lat, lng, 0x88ff44);
    }

    if (window.FieldBrain?.pulse) {
      FieldBrain?.pulse?.(type, detail || labels[type] || type, { role: opts.role });
    }
    return { type, lat, lng };
  },

  zoomToUser(zoom) {
    const u = this.userPos();
    this.action('location', { lat: u.lat, lng: u.lng, detail: 'εσύ · αναζήτηση' });
    const cityZ = GlobeControl?.Z?.city || 1.38;
    const z = zoom != null && zoom <= cityZ ? zoom : (GlobeControl?.Z?.national || 1.82);
    if (ZoomTiers && zoom == null) ZoomTiers.goTo('national', true);
    const fp = latLngToPos(u.lat, u.lng, 1.04);
    if (typeof flyToPoint === 'function') flyToPoint(new THREE.Vector3(fp.x, fp.y, fp.z), z);
    else focusOnGlobePoint(new THREE.Vector3(fp.x, fp.y, fp.z), z);
    return u;
  },

  scanCity(opts = {}) {
    const u = opts.userLat != null ? { lat: opts.userLat, lng: opts.userLng } : this.userPos();
    const vendors = opts.vendors || window.Commerce?.vendors || [];
    const label = opts.label || 'Scanning city…';
    this.cancelAll();
    this.setHud('City scan', label);
    this.zoomToUser(opts.zoom || GlobeControl?.Z?.city || 1.32);
    CityMap?.onCamera?.(opts.zoom || 1.28, 'earth');
    const rings = [0, 1, 2, 3];
    rings.forEach((i) => {
      setTimeout(() => {
        const jitter = i * 0.0018;
        this.pulse(u.lat + jitter, u.lng - jitter, 0x3d9eff, label, 4200 + i * 800);
        if (vendors[i]) {
          const v = vendors[i];
          this.pulse(v.lat, v.lng, 0xff8844, v.name, 9000);
          this.arc(v.lat, v.lng, u.lat, u.lng, 0x66ffcc, 11000);
        }
      }, i * 420);
    });
    if (vendors.length) {
      GlobeEntity?.syncVendors?.(vendors);
      this.action('vendor', { lat: u.lat, lng: u.lng, detail: vendors.length + ' shops', vendors });
    }
    return u;
  },

  showOrderSearch(opts = {}) {
    const u = opts.userLat != null ? { lat: opts.userLat, lng: opts.userLng } : this.userPos();
    const wanted = (opts.wantedLabels || []).join(' · ');
    this.scanCity({
      userLat: u.lat, userLng: u.lng,
      vendors: (opts.matches || []).map(m => m.vendor).filter(Boolean).slice(0, 8),
      label: wanted || 'Order search',
      zoom: opts.zoom || GlobeControl?.Z?.city || 1.32,
    });
    if (opts.matches?.length) {
      this.action('compare', { lat: u.lat, lng: u.lng, detail: wanted, matches: opts.matches });
    }
    if (opts.drivers?.length) {
      this.action('driver', { lat: u.lat, lng: u.lng, detail: opts.drivers.length + ' drivers', drivers: opts.drivers });
    }
    return u;
  },

  tick() {
    const now = Date.now();
    this.overlays = this.overlays.filter(o => {
      const age = (now - o.born) / o.duration;
      if (age >= 1) {
        if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh);
        if (o.line && o.line.parent) o.line.parent.remove(o.line);
        return false;
      }
      if (o.mesh) {
        o.mesh.material.opacity = 0.9 * (1 - age * 0.85);
        const s = 1 + age * 1.8;
        o.mesh.scale.set(s, s, s);
      }
      if (o.line) o.line.material.opacity = 0.75 * (1 - age);
      return true;
    });
  }
};

window.Voice = Voice;
window.MapDepict = MapDepict;

function userIntervene() {
  if (window.voiceInterrupt) window.voiceInterrupt({ keepHandsFree: false });
  else Voice.flush();
  voiceSessionActive = false;
  voiceEnabled = false;
  if (window.setVoicePerfMode) window.setVoicePerfMode(false);
  if (window.stopHandsFree) window.stopHandsFree();
  SessionHold?.release?.();
  GlobeVideo?.stop?.();
  GlobeVideo?.hide?.();
  SuperSpace?.stop?.();
  window.SuperAdd?.stop?.();
  GlobeEntity?.clearSelection?.();
  document.getElementById('aci-cli-in')?.classList.remove('voice-live');
  AstranovLogo?.setMicActive?.(false);
  AstranovLogo?.setAiActive?.(false);
  document.getElementById('aci-handsfree')?.classList.remove('listening', 'deck-btn-active', 'speaking');
  AiGlyphs?.flashStop?.();
  AiGlyphs?.syncVoice?.();
  const cliIn = document.getElementById('aci-cli-in');
  if (cliIn) cliIn.placeholder = 'Talk to Astranov — type or tap voice · Enter to send';
  GlobeControl?.userTookGlobe?.('stop');
  if (window.PmrRadio) PmrRadio.hide();
    if (window.DrivingView) window.DrivingView.deactivate();
  MapDepict.cancelAll();
  if (window._aciAbort) { try { window._aciAbort.abort(); } catch (_) {} }
  if (window._droneAnim) { clearInterval(window._droneAnim); window._droneAnim = null; }
  if (window.Comms) window.Comms.vhfActive = false;
  if (recognition) { try { recognition.stop(); } catch (_) {} }
  isListening = false;
  if (ACI) ACI.evolving = false;
  GlobeDeck?.setMapStatus('◼ Stopped — globe is yours');
  if (window.ACIControl) ACIControl.reply('Stopped — globe is yours.');
}

window.userIntervene = userIntervene;

// === FETCH JSON — timeout + visible errors for all ACI calls ===
async function fetchJson(url, options, timeoutMs) {
  const ms = timeoutMs || 55000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = 'HTTP ' + r.status;
    j._httpStatus = r.status;
    j._ok = r.ok;
    if (!r.ok || j.error) {
      const fn = String(url).match(/functions\/v1\/([^/?]+)/)?.[1];
      if (fn) {
        const xaiFn = /aicycle|aci|ai-router|voice|coders-bridge|brain/i.test(fn);
        window.MissionSupportReporter?.recordProblem?.('api_error', String(j.error || r.status).slice(0, 200), { fn, status: r.status, vendor: xaiFn ? 'xai' : 'astranov' });
      }
    }
    return j;
  } catch (e) {
    if (e.name === 'AbortError') {
      const fn = String(url).match(/functions\/v1\/([^/?]+)/)?.[1];
      if (fn) {
        const xaiFn = /aicycle|aci|ai-router|voice|coders-bridge|brain/i.test(fn);
        window.MissionSupportReporter?.recordProblem?.('api_timeout', fn, { fn, vendor: xaiFn ? 'xai' : 'astranov' });
      }
      return { error: 'timeout — server slow, try again', _timeout: true };
    }
    const fn = String(url).match(/functions\/v1\/([^/?]+)/)?.[1];
    if (fn) {
      const xaiFn = /aicycle|aci|ai-router|voice|coders-bridge|brain/i.test(fn);
      window.MissionSupportReporter?.recordProblem?.('api_network', String(e.message || e).slice(0, 200), { fn, vendor: xaiFn ? 'xai' : 'astranov' });
    }
    return { error: String(e.message || e.cause?.message || e || 'network failed') };
  } finally {
    clearTimeout(timer);
  }
}
window.fetchJson = fetchJson;

// === ASTRO GLYPHS — high-contrast icons for globe HUD (readable at small size) ===
const AstroGlyphs = {
  client: '🧑',
  driver: '🚚',
  vendor: '🏬',
  shop: '🛍️',
  order: '🛒',
  locate: '🎯',
  mic: '🎤',
  cli: '💻',
  stop: '🛑',
  vhf: '📡',
  phone: '☎️',
  news: '📰',
  drive: '🚗',
  fast: '⚡',
  send: '➡️',
  close: '✖️',
  ok: '✔️',
  err: '❌',
  pilot: '🛸',
  beer: '🍻',
  menu: '📋',
};

const CATEGORY_GLYPH = {
  restaurant: '🍴', cafe: '☕', fast_food: '🍟', bakery: '🥖', bar: '🍻',
  pharmacy: '💊', supermarket: '🛒', shop: '🛍️', service: '💇', fitness: '🏃',
  hotel: '🏨', health: '🏥',
};

const LEGACY_VENDOR_EMOJI = new Set(['🎪', '🏪', '🍽️', '🍔', '🥐', '🍦', '🍺', '👗', '📱', '📚', '⚽', '✂️', '🏋️']);

function vendorIcon(v) {
  if (!v) return AstroGlyphs.shop;
  const e = v.emoji;
  if (e && !LEGACY_VENDOR_EMOJI.has(e)) return e;
  return CATEGORY_GLYPH[v.category] || AstroGlyphs.shop;
}

const LEGACY_DRIVER_EMOJI = new Set(['🚴', '👤', '🛵']);

function driverIcon(d) {
  const e = d && (d.avatar_emoji || d.emoji);
  if (e && !LEGACY_DRIVER_EMOJI.has(e)) return e;
  return AstroGlyphs.driver;
}

window.AstroGlyphs = AstroGlyphs;
window.vendorIcon = vendorIcon;
window.driverIcon = driverIcon;

// === AI GLYPHS — glowing SVG state icons (voice · stop · map · theme) ===
const AiGlyphs = {
  _svgs: {
    voice: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="2.8" fill="currentColor"/><circle cx="12" cy="12" r="6.5" stroke="currentColor" stroke-width="1.4" opacity="0.55"/><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1" opacity="0.28"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="none"><rect x="7" y="7" width="10" height="10" rx="2.2" fill="currentColor"/><rect x="7" y="7" width="10" height="10" rx="2.2" stroke="currentColor" stroke-width="1.5" opacity="0.45"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="1.2" opacity="0.35" stroke-linecap="round"/></svg>',
    satellite: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4.2" stroke="currentColor" stroke-width="1.3" opacity="0.7"/><ellipse cx="12" cy="12" rx="10" ry="4.2" stroke="currentColor" stroke-width="1" opacity="0.35" transform="rotate(58 12 12)"/><circle cx="19" cy="6" r="1.4" fill="currentColor" opacity="0.8"/></svg>',
    bright: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2.5v2.8M12 18.7V21.5M2.5 12h2.8M18.7 12H21.5M5.1 5.1l2 2M16.9 16.9l2 2M18.9 5.1l-2 2M7.1 16.9l-2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none"><path d="M14.8 4.2a7.2 7.2 0 1 0 5 11.8A8.8 8.8 0 1 1 14.8 4.2z" fill="currentColor"/><circle cx="17.5" cy="6.8" r="1" fill="currentColor" opacity="0.55"/></svg>',
    themeDark: '<svg viewBox="0 0 24 24" fill="none"><path d="M14.6 4.4a6.8 6.8 0 1 0 4.8 11.2A8.2 8.2 0 1 1 14.6 4.4z" fill="currentColor"/></svg>',
    themeBright: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  },

  wrap(name) {
    const svg = this._svgs[name] || this._svgs.voice;
    return '<span class="ai-glyph ai-glyph-' + name + '" aria-hidden="true">' + svg + '<span class="ai-ring"></span><span class="ai-ring ai-ring-b"></span></span>';
  },

  mount(id, name) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.dataset.aiGlyph !== name) {
      el.innerHTML = this.wrap(name);
      el.dataset.aiGlyph = name;
    }
  },

  mountMapStyles() {},

  syncTheme() {
    const bright = (AstranovTheme?.effectiveMode?.() || AstranovTheme?.mode || 'dark') === 'bright';
    this.mount('aci-theme', bright ? 'themeBright' : 'themeDark');
  },

  syncVoice() {
    const btn = document.getElementById('aci-handsfree');
    if (!btn) return;
    const on = !!(voiceSessionActive || window._handsFreeVoice);
    const listening = !!isListening;
    const speaking = !!Voice?.speaking;
    let state = 'off';
    if (speaking && listening) state = 'duplex';
    else if (speaking) state = 'speaking';
    else if (listening) state = 'listening';
    else if (on) state = 'on';
    btn.dataset.voiceState = state;
  },

  flashStop() {
    const hf = document.getElementById('aci-handsfree');
    if (!hf) return;
    hf.classList.add('ai-flash-stop');
    clearTimeout(this._stopFlash);
    this._stopFlash = setTimeout(() => hf.classList.remove('ai-flash-stop'), 700);
  },

  init() {
    this.mount('aci-handsfree', 'voice');
    this.mount('aci-stop', 'stop');
    this.syncTheme();
    this.syncVoice();
  },
};
window.AiGlyphs = AiGlyphs;

// === FIELD BRAIN — roles · driver online · delivery claim ===
const FieldBrain = {
  vendorIds: [],
  roles: ['client'],
  init() {},
  hookFeed() {},

  pulse(action, detail, opts) {
    BrainNeurons?.recordActivity?.(action || 'activity', detail || '', opts);
  },

  updateChip() {
    const chip = document.getElementById('user-chip');
    if (!chip || !Auth?.user || Auth?.isOwner) return;
    const r = (this.roles || []).filter(x => x !== 'client');
    if (r.length) chip.textContent = (chip.textContent?.split('·')[0]?.trim() || 'You') + ' · ' + r.join('+');
  },

  async onAuth() {
    if (!Auth?.user || !Auth?.client) {
      this.roles = ['client'];
      this.vendorIds = [];
      return;
    }
    try {
      const { data } = await Auth.client.from('profiles')
        .select('roles, is_vendor, field_lat, field_lng')
        .eq('id', Auth.user.id)
        .maybeSingle();
      const roles = Array.isArray(data?.roles) ? [...data.roles] : ['client', 'driver'];
      if (!roles.includes('client')) roles.unshift('client');
      this.roles = roles;
      const { data: vendors } = await Auth.client.from('vendors').select('id').eq('owner_id', Auth.user.id);
      this.vendorIds = (vendors || []).map(v => v.id);
      this.updateChip();
      if (roles.includes('driver')) MarketplacePresence?.start?.();
      void FieldWork?.refresh?.({ quiet: true });
    } catch (_) {
      this.roles = ['client', 'driver'];
    }
  },

  async goOnlineDriver() {
    if (!Auth?.user) {
      ACIControl?.reply?.('Sign in first — tap G');
      Auth?.openLoginModal?.('Sign in to drive deliveries');
      return { error: 'login' };
    }
    const pos = window._lastPos || {};
    const roles = Array.from(new Set([...(this.roles || ['client']), 'driver']));
    try {
      const headers = await Auth.authHeaders?.();
      await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          roles,
          field_lat: pos.lat ?? null,
          field_lng: pos.lng ?? null,
          field_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      this.roles = roles;
      this.updateChip();
      MarketplacePresence?.start?.();
      ACIControl?.reply?.('Driver online · visible on map for deliveries');
      AciCli?.print?.('driver online · field presence active', 'ok');
      return { ok: true };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  },

  async listOpenJobs() {
    if (!Auth?.user) return { error: 'login' };
    const pos = window._lastPos || {};
    const headers = await Auth.authHeaders?.();
    const r = await fetch(SB_URL + '/functions/v1/order-intake', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_open', lat: pos.lat, lng: pos.lng }),
    });
    return r.json().catch(() => ({}));
  },

  async claimDelivery(orderId) {
    const id = String(orderId || '').trim();
    if (!id) return { error: 'order id required' };
    if (!Auth?.user) return { error: 'login required' };
    try {
      const headers = await Auth.authHeaders?.();
      const r = await fetch(SB_URL + '/functions/v1/order-intake', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'driver_accept', order_id: id }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok && j.order) {
        await MarketplaceDeliveryEngine?.onDriverAccepted?.(j.order, j.vendor, j.driver);
        ACIControl?.reply?.('Delivery accepted · triangle active · ' + (j.order.short_id || id));
        AciCli?.print?.('driver accept · ' + (j.order.short_id || id), 'ok');
      } else {
        ACIControl?.reply?.('Accept failed · ' + (j.error || j.message || 'server'));
      }
      return j;
    } catch (e) {
      return { error: String(e.message || e) };
    }
  },
};
window.FieldBrain = FieldBrain;

// === FIELD WORK — availability · specialty · offers · full pricing · open verticals ===
const FieldWork = {
  VERTICALS: ['work', 'delivery', 'dating', 'real_estate', 'services', 'custom'],
  _posts: [],

  async api(action, body) {
    body = body || {};
    const headers = await Auth.authHeaders?.();
    if (!headers?.Authorization && action !== 'list_nearby' && action !== 'list') {
      return { error: 'login required' };
    }
    const r = await fetch(SB_URL + '/functions/v1/field-work', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    return r.json().catch(() => ({}));
  },

  formatPrice(p) {
    if (!p) return 'price on request';
    const avc = p.price_avc != null ? Number(p.price_avc).toFixed(2) + ' AVC' : '';
    const eur = p.price_eur != null ? ' (= €' + Number(p.price_eur).toFixed(2) + ')' : (p.price_avc != null ? ' (= €' + Number(p.price_avc).toFixed(2) + ')' : '');
    const unit = p.price_unit && p.price_unit !== 'job' ? '/' + p.price_unit : '';
    const detail = p.pricing_detail?.summary ? ' · ' + p.pricing_detail.summary : '';
    return (avc || 'open offer') + eur + unit + detail;
  },

  _parsePriceArgs(tokens) {
    const out = { specialty: '', priceAvc: null, priceUnit: 'job', vertical: 'work' };
    if (!tokens.length) return out;
    const vert = tokens[0]?.toLowerCase();
    if (this.VERTICALS.includes(vert) || vert === 'realestate') {
      out.vertical = vert === 'realestate' ? 'real_estate' : vert;
      tokens = tokens.slice(1);
    }
    const unitWords = ['hour', 'day', 'job', 'km', 'visit', 'night', 'week'];
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (unitWords.includes(tokens[i].toLowerCase())) {
        out.priceUnit = tokens[i].toLowerCase();
        tokens = tokens.slice(0, i);
        break;
      }
    }
    const last = tokens[tokens.length - 1];
    if (last && /^[\d.]+$/.test(last)) {
      out.priceAvc = Number(last);
      tokens = tokens.slice(0, -1);
    }
    out.specialty = tokens.join(' ').trim();
    return out;
  },

  async post(body) {
    if (!Auth?.user) {
      Auth?.openLoginModal?.('Sign in to post on the work board');
      return { error: 'login' };
    }
    const pos = this._coords();
    const j = await this.api('post', {
      lat: pos.lat,
      lng: pos.lng,
      ...body,
    });
    if (j.ok) {
      await this.refresh({ quiet: true });
      FieldBrain?.pulse?.('work', (body.post_type || 'availability') + ' · ' + body.specialty, { role: 'client' });
    }
    return j;
  },

  async postAvailability(opts) {
    return this.post({
      post_type: 'availability',
      vertical: opts.vertical || 'work',
      specialty: opts.specialty,
      description: opts.description || '',
      price_avc: opts.priceAvc,
      price_unit: opts.priceUnit || 'job',
      pricing_detail: opts.pricingDetail || { summary: 'full price shown · 1 AVC = 1 EUR' },
    });
  },

  async postRequest(opts) {
    return this.post({
      post_type: 'request',
      vertical: opts.vertical || 'work',
      specialty: opts.specialty,
      description: opts.description || '',
      price_avc: opts.priceAvc,
      price_unit: opts.priceUnit || 'job',
      pricing_detail: opts.pricingDetail || { summary: 'budget · full pricing on accept' },
    });
  },

  async refresh(opts) {
    opts = opts || {};
    const pos = this._coords();
    const j = await this.api('list_nearby', { lat: pos.lat, lng: pos.lng, radius_km: 45, vertical: opts.vertical || null });
    this._posts = j.posts || [];
    this.showOnMap();
    if (!opts.quiet && this._posts.length) {
      AciCli?.print?.('work board · ' + this._posts.length + ' open near you', 'ok');
    }
    return this._posts;
  },

  showOnMap() {
    GlobeEntity?.unregisterType?.('work');
    (this._posts || []).forEach(p => {
      if (p.lat == null || p.lng == null) return;
      const icon = p.post_type === 'availability' ? '🔧' : p.post_type === 'offer' ? '💼' : '📋';
      const vert = p.vertical && p.vertical !== 'work' ? ' · ' + p.vertical : '';
      GlobeEntity.register({
        id: 'work-' + p.id,
        type: 'work',
        lat: p.lat,
        lng: p.lng,
        title: icon + ' ' + (p.specialty || 'Work') + vert,
        description: this.formatPrice(p) + ' · ' + (p.display_name || 'User') + (p.km != null ? ' · ' + p.km.toFixed(1) + ' km' : ''),
        urgency: p.post_type === 'request' ? 2 : 1,
        data: { post: p },
        onTap: () => this.showHud(p),
      });
    });
    CityMap?._syncMarkers?.();
  },

  showHud(post) {
    if (!post) return;
    const hud = document.getElementById('globe-entity-hud');
    if (!hud) return;
    hud.classList.add('open');
    document.getElementById('ge-hud-type').textContent = '▸ ' + (post.post_type || 'work') + ' · ' + (post.vertical || 'work');
    document.getElementById('ge-hud-title').textContent = post.specialty || 'Work';
    document.getElementById('ge-hud-desc').textContent = [
      post.display_name || 'User',
      this.formatPrice(post),
      post.description || '',
      post.post_type === 'availability' ? 'Tap message to send a work offer' : 'Tap message to respond',
    ].filter(Boolean).join('\n');
    const actions = document.getElementById('ge-hud-actions');
    if (actions) {
      actions.style.display = 'grid';
      actions.innerHTML = ''
        + '<button type="button" data-work-act="message">💬 Message</button>'
        + '<button type="button" data-work-act="route">🛣 Route</button>';
      actions.querySelectorAll('[data-work-act]').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          if (btn.dataset.workAct === 'route') {
            DrivingView?.fetchRoadRoute?.(window._lastPos, { lat: post.lat, lng: post.lng });
            ACIControl?.reply?.('Route to ' + post.specialty);
          } else {
            const uid = post.user_id;
            if (uid) LazyModules.ensure().then(() => MapComms?.contactUser?.(uid, 'message'));
            else ACIControl?.reply?.('Sign in to message · work offer with full price: ' + this.formatPrice(post));
          }
        };
      });
    }
    MapPlaceMenu?.close?.();
    GlobeDeck?.setPreview?.(this.formatPrice(post));
  },

  async runCli(parts) {
    const sub = (parts[1] || 'list').toLowerCase();
    const rest = parts.slice(2);
    if (sub === 'list' || sub === 'nearby') {
      const vert = rest[0] && this.VERTICALS.includes(rest[0]) ? rest[0] : null;
      const posts = await this.refresh({ vertical: vert });
      if (!posts.length) { AciCli?.print?.('no open work nearby — post: work available <specialty> <price> [hour]', 'dim'); return; }
      posts.slice(0, 12).forEach(p => {
        AciCli?.print?.((p.post_type || 'post') + ' · ' + p.specialty + ' · ' + this.formatPrice(p) + (p.km != null ? ' · ' + p.km.toFixed(1) + ' km' : ''), 'ok');
      });
      return;
    }
    if (sub === 'available' || sub === 'on' || sub === 'open') {
      const parsed = this._parsePriceArgs(rest);
      if (!parsed.specialty) { AciCli?.print?.('usage: work available <specialty> <price> [hour|day|job]', 'err'); return; }
      const j = await this.postAvailability({
        specialty: parsed.specialty,
        priceAvc: parsed.priceAvc,
        priceUnit: parsed.priceUnit,
        vertical: parsed.vertical,
      });
      if (j.ok) ACIControl?.reply?.('You are available · ' + parsed.specialty + ' · ' + this.formatPrice(j.post));
      else AciCli?.print?.('post failed · ' + (j.error || 'server'), 'err');
      return;
    }
    if (sub === 'need' || sub === 'request' || sub === 'hire') {
      const parsed = this._parsePriceArgs(rest);
      if (!parsed.specialty) { AciCli?.print?.('usage: work need <specialty> <budget> [hour|job]', 'err'); return; }
      const j = await this.postRequest({
        specialty: parsed.specialty,
        priceAvc: parsed.priceAvc,
        priceUnit: parsed.priceUnit,
        vertical: parsed.vertical,
      });
      if (j.ok) ACIControl?.reply?.('Request posted · ' + parsed.specialty + ' · budget ' + this.formatPrice(j.post));
      else AciCli?.print?.('post failed · ' + (j.error || 'server'), 'err');
      return;
    }
    if (sub === 'mine' || sub === 'my') {
      const j = await this.api('my_posts');
      (j.posts || []).forEach(p => AciCli?.print?.(p.status + ' · ' + p.specialty + ' · ' + this.formatPrice(p), 'ok'));
      if (!j.posts?.length) AciCli?.print?.('no posts — work available <skill> <price>', 'dim');
      return;
    }
    if (sub === 'off') {
      const j = await this.api('my_posts');
      const open = (j.posts || []).find(p => p.status === 'open' && p.post_type === 'availability');
      if (!open) { AciCli?.print?.('no open availability post', 'dim'); return; }
      await this.api('close', { post_id: open.id });
      await this.refresh({ quiet: true });
      AciCli?.print?.('availability closed', 'ok');
      return;
    }
    AciCli?.print?.('work list | work available <skill> <price> | work need <job> <budget> | work mine', 'dim');
  },

  init() {
    setTimeout(() => void this.refresh({ quiet: true }), 6000);
  },

  _coords() {
    const p = window._lastPos || CityMap?.mapViewCenter?.() || TrackballGuard?.facingLatLng?.() || {};
    if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
    return { lat: 36.44, lng: 28.22 };
  },
};
window.FieldWork = FieldWork;

// === SPACENET SCENARIO RUNNER — usage flows · auto-heal · cycle reports ===
const SpaceNetScenarioRunner = {
  _lastRun: 0,
  _results: [],

  _deckOk() {
    const deck = document.getElementById('globe-deck');
    const input = document.getElementById('aci-cli-in');
    const plus = document.getElementById('globe-deck-plus');
    if (!deck || !input || deck.offsetHeight < 120) {
      GlobeDeck?.bootCollapsed?.();
      return { ok: false, fix: 'cli_restore' };
    }
    return { ok: !!plus && deck.offsetHeight >= 160, plus: !!plus, h: deck.offsetHeight };
  },

  async runAll(trigger) {
    const now = Date.now();
    if (now - this._lastRun < 120000 && trigger !== 'boot') return this._results;
    this._lastRun = now;
    const rows = [];
    const add = (id, ok, detail, fix) => { rows.push({ id, ok, detail, fix }); };

    const deck = this._deckOk();
    add('cli_visible', deck.ok, 'h=' + (deck.h || 0), deck.fix);

    const z = camera?.position?.z ?? 0;
    const earthOk = z >= 2.2 && z <= 4.5 && (CosmicZoom?.level === 'earth' || CosmicZoom?.level === 'orbit');
    if (!earthOk && z < 6 && !CityMap?.active && !DrivingView?.active) {
      camera.position.z = GlobeNavigate?.GLOBAL_Z || 2.55;
      ZoomTiers?.goTo?.('global', false);
      CosmicZoom?.update?.(GlobeNavigate?.GLOBAL_Z || 2.55, { tier: 'global', label: 'GLOBAL', cosmic: 'earth' });
    }
    add('earth_view', earthOk || z < 6, 'z=' + z.toFixed(2) + ' · ' + (CosmicZoom?.level || '?'));

    const tb = TrackballGuard?.verify?.();
    if (!tb) TrackballGuard?.repair?.();
    add('trackball', !!TrackballGuard?._ok, 'bindings');

    window.AvcBalance?.init?.();
    const avc = document.getElementById('aci-avc');
    add('avc_wallet', !!avc && !avc.hidden, avc ? 'chip' : 'missing');

    if (this._earthOrCity()) void FieldWork?.refresh?.({ quiet: true });
    add('work_board', true, (FieldWork?._posts?.length || 0) + ' posts');

    add('neurons', (BrainNeurons?.count?.() || 0) >= 0, String(BrainNeurons?.count?.() || 0));

    const res = SpaceNetResourceMonitor?.report?.();
    add('resources', !!res && Number(res.fps) > 0, 'spare ' + (res?.spareScore ?? 0) + '% · ' + (res?.label || '?'));
    add('loader', !!SpaceNetLoader?._dismissed || SpaceNetLoader?._stages?.earth, SpaceNetLoader?._dismissed ? 'dismissed' : 'booting');

    if (CityMap?.active && CityMap?._tileStats?.ok >= 8 && CityMap?._stackIdx > (CityMap?._preferredStackIdx?.() ?? 0)) {
      CityMap?._recoverPreferredStack?.();
      add('map_recovery', true, 'restored HD stack');
    } else {
      add('map_layers', true, CityMap?.active ? 'idx=' + (CityMap?._stackIdx ?? 0) : 'globe');
    }

    const pass = rows.filter(r => r.ok).length;
    this._results = rows;
    MissionSupportReporter?.recordProgress?.('mission', 'scenarios ' + pass + '/' + rows.length + ' · ' + (trigger || 'cycle'), { rows, trigger });
    if (pass < rows.length && !document.hidden) {
      GlobeDeck?.setPreview?.('SpaceNet · ' + pass + '/' + rows.length + ' checks OK', 'dim');
    }
    return rows;
  },

  _earthOrCity() {
    const level = CosmicZoom?.level || 'earth';
    return CityMap?.active || GlobeNavigate?.isNational?.() || GlobeNavigate?.isCity?.()
      || level === 'earth' || level === 'orbit';
  },
};
window.SpaceNetScenarioRunner = SpaceNetScenarioRunner;

// === SPACENET CYCLE — unified realism tick · shorter code · one heartbeat ===
const SpaceNetCycle = {
  INTERVAL_MS: 180000,
  _n: 0,
  _timer: null,

  _earthOrCity() {
    const level = CosmicZoom?.level || 'earth';
    return CityMap?.active || GlobeNavigate?.isNational?.() || GlobeNavigate?.isCity?.()
      || level === 'earth' || level === 'orbit';
  },

  async tick() {
    this._n++;
    if (!TrackballGuard?.verify?.()) TrackballGuard?.repair?.();
    if (this._earthOrCity()) void FieldWork?.refresh?.({ quiet: true });
    window.AvcBalance?.init?.();
    if (window.AvcBalance?.refresh) void window.AvcBalance.refresh();
    if (this._n === 1 || this._n % 2 === 0) void SpaceNetScenarioRunner?.runAll?.('cycle ' + this._n);
    MissionSupportReporter?.recordProgress?.('mission', 'SpaceNet cycle ' + this._n + ' · ' + (ZoomTiers?.current || CosmicZoom?.level || 'earth'), {
      work_posts: FieldWork?._posts?.length || 0,
      missions: MarketplaceDeliveryEngine?.missions?.length || 0,
      trackball_ok: !!TrackballGuard?._ok,
      neurons: BrainNeurons?.count?.() || 0,
    });
    BrainNeurons?.onCycle?.(this._n);
    SpaceNetResourceMonitor?.periodicCheck?.();
    SpaceNetFleet?.tick?.();
  },

  init() {
    if (this._timer) clearInterval(this._timer);
    setTimeout(() => this.tick(), 45000);
    this._timer = setInterval(() => this.tick(), this.INTERVAL_MS);
  },
};
window.SpaceNetCycle = SpaceNetCycle;

// === SPACENET MISSION — collective intelligence · one mesh · no satellites ===
const SpaceNetMission = {
  ONE: 'SpaceNet is the collective intelligence connecting everything into one — so we need no satellites anymore to communicate.',
  SHORT: 'One mind · one mesh · no satellites',
  LOADER: {
    core: 'SpaceNet · one collective mind',
    globe: 'Earth joins the mesh',
    cli: 'Your line into SpaceNet',
    earth: 'All linked · no satellites',
    deferred: 'Fleet & relay ready',
  },
  bootReply: 'SpaceNet live · collective intelligence links everyone — no satellites needed · scroll out → solar · galaxy',
};
window.SpaceNetMission = SpaceNetMission;

// === SPACENET LOADER — progressive boot · minimal first paint · defer heavy pack ===
const SpaceNetLoader = {
  _stages: { core: 0, globe: 0, cli: 0, earth: 0, deferred: 0 },
  _weights: { core: 14, globe: 28, cli: 24, earth: 24, deferred: 10 },
  _dismissed: false,
  _inited: false,
  _el: null,
  _fill: null,
  _label: null,

  init() {
    if (this._inited) return;
    this._inited = true;
    this._el = document.getElementById('spacenet-loader');
    if (!this._el || this._el.classList.contains('done')) {
      this._dismissed = true;
      return;
    }
    this._fill = document.getElementById('snl-fill');
    this._label = document.getElementById('snl-label');
    this.stage('core', SpaceNetMission?.LOADER?.core || 'SpaceNet · one mind');
    setTimeout(() => this.dismiss('timeout'), 900);
  },

  stage(id, label) {
    if (this._stages[id] != null) this._stages[id] = 1;
    if (label && this._label) this._label.textContent = String(label).slice(0, 48);
    this._render();
    if (id === 'earth' || id === 'cli') this._tryDismiss();
    if (id === 'deferred') setTimeout(() => this.dismiss('deferred'), 120);
  },

  _pct() {
    let done = 0, total = 0;
    for (const [k, w] of Object.entries(this._weights)) {
      total += w;
      if (this._stages[k]) done += w;
    }
    return Math.min(100, Math.round((done / total) * 100));
  },

  _render() {
    const p = this._pct();
    if (this._fill) this._fill.style.width = p + '%';
  },

  _tryDismiss() {
    const deck = document.getElementById('globe-deck');
    const ready = (this._stages.cli || this._stages.earth) && deck && deck.offsetHeight >= 60;
    if (ready) setTimeout(() => this.dismiss('ready'), 40);
  },

  dismiss(reason) {
    if (this._dismissed) return;
    this._dismissed = true;
    window._snlForceDismiss?.();
    if (this._fill) this._fill.style.width = '100%';
    if (this._el) {
      this._el.classList.add('done');
      this._el.setAttribute('aria-busy', 'false');
    }
    setTimeout(() => { try { this._el?.remove(); } catch (_) {} }, 480);
    window.MissionSupportReporter?.recordProgress?.('boot', 'loader ' + (reason || 'done'), { pct: this._pct() });
  },
};
window.SpaceNetLoader = SpaceNetLoader;

// === BRAIN NEURONS — autonomous collective memory · globe pins · never stops growing ===
const BrainNeurons = {
  _principles: [],
  _spawned: new Set(),
  _activity: [],
  _evolving: false,
  _flushTimer: null,
  _booted: false,
  EVOLVE_EVERY: 3,
  MAX_GLOBE: 56,
  MAX_EPHEMERAL: 28,

  count() { return this._principles.length + (ACI?.neurons?.length || 0); },

  _hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h;
  },

  _seedLatLng(idx, text) {
    const h = this._hash(String(text || idx));
    const lat = ((Math.abs(h) % 11000) / 100) - 55 + ((idx * 13) % 15) / 10;
    const lng = (((h >> 10) % 36000) / 100) - 180;
    return { lat: Math.max(-70, Math.min(70, lat)), lng };
  },

  _activityLatLng() {
    const p = window._lastPos || CityMap?.mapViewCenter?.() || TrackballGuard?.facingLatLng?.() || {};
    if (p.lat != null && p.lng != null) {
      return { lat: p.lat + (Math.random() - 0.5) * 0.08, lng: p.lng + (Math.random() - 0.5) * 0.08 };
    }
    return this._seedLatLng(this._principles.length + Date.now() % 97, 'field');
  },

  _ingest(list, source) {
    if (!Array.isArray(list)) return 0;
    let n = 0;
    list.forEach((row, i) => {
      const content = typeof row === 'string' ? row : (row?.content || '');
      if (!content || content.length < 6) return;
      if (this._principles.some(p => p.content === content)) return;
      const strength = typeof row === 'object' ? (row.strength || row.importance || 1.2) : 1.2;
      this._principles.push({ content, strength, source: source || 'server' });
      const ll = this._seedLatLng(this._principles.length + i, content);
      this._spawnGlobe(ll.lat, ll.lng, strength, content);
      n++;
    });
    this._syncChip();
    return n;
  },

  _trimPermanent() {
    const ents = [...(GlobeEntity?.entities?.values?.() || [])].filter(e => e.type === 'neuron' && !e.data?.ephemeral);
    if (ents.length <= this.MAX_GLOBE) return;
    ents.sort((a, b) => (a.data?.strength || 1) - (b.data?.strength || 1));
    ents.slice(0, ents.length - this.MAX_GLOBE).forEach(e => GlobeEntity?.unregister?.(e.id));
  },

  _spawnGlobe(lat, lng, strength, principle, opts) {
    opts = opts || {};
    if (lat == null || lng == null) return;
    if (!opts.ephemeral) this._trimPermanent();
    const key = (opts.ephemeral ? 'e:' : '') + (principle || '').slice(0, 120) + ':' + Date.now();
    if (!opts.ephemeral && this._spawned.has((principle || '').slice(0, 120))) return;
    if (!opts.ephemeral) this._spawned.add((principle || '').slice(0, 120));
    const id = 'neuron-' + (opts.ephemeral ? 'e-' : '') + this._hash(key + lat + lng);
    GlobeEntity?.unregister?.(id);
    GlobeEntity?.register?.({
      id,
      type: 'neuron',
      lat,
      lng,
      title: '🧠 ' + (principle || 'Neuron').slice(0, 48),
      description: (principle || '') + (opts.ephemeral ? '\n· live field signal' : '\n· collective principle'),
      urgency: opts.ephemeral ? 1 : (strength > 1.3 ? 2 : 1),
      data: { principle, strength, ephemeral: !!opts.ephemeral, ts: Date.now() },
      onTap: () => this._showHud(principle, strength),
    });
    if (!opts.ephemeral) ACI?.spawnNeuron?.(lat, lng, strength, principle);
    if (opts.ephemeral) this._trimEphemeral();
    CityMap?._syncMarkers?.();
  },

  _trimEphemeral() {
    const ents = [...(GlobeEntity?.entities?.values?.() || [])].filter(e => e.type === 'neuron' && e.data?.ephemeral);
    if (ents.length <= this.MAX_EPHEMERAL) return;
    ents.sort((a, b) => (a.data?.ts || 0) - (b.data?.ts || 0));
    ents.slice(0, ents.length - this.MAX_EPHEMERAL).forEach(e => GlobeEntity?.unregister?.(e.id));
  },

  _showHud(principle, strength) {
    const hud = document.getElementById('globe-entity-hud');
    if (!hud) return;
    hud.classList.add('open');
    document.getElementById('ge-hud-type').textContent = '▸ neuron · strength ' + (strength || 1).toFixed(1);
    document.getElementById('ge-hud-title').textContent = 'Collective memory';
    document.getElementById('ge-hud-desc').textContent = principle || 'Astranov brain principle';
    const actions = document.getElementById('ge-hud-actions');
    if (actions) actions.style.display = 'none';
    GlobeDeck?.setPreview?.('◎ ' + this.count() + ' neurons · Justice → Truth → Freedom');
  },

  _syncChip() {
    const n = this.count();
    const guide = document.getElementById('cosmic-guide');
    if (guide && n > 0) guide.textContent = '◎ ' + n + ' neurons · every action grows the brain';
    const deck = document.getElementById('globe-deck-title');
    if (deck && !GlobeDeck?.thinking) deck.dataset.neurons = String(n);
  },

  recordActivity(action, detail, opts) {
    opts = opts || {};
    this._activity.push({ action, detail: String(detail || '').slice(0, 160), role: opts.role, ts: Date.now() });
    ACI?.feed?.(action, detail);
    const sig = /think|teach|order|delivery|work|drive|vendor|evolve|explore|location|commerce|route|claim|city|post/i.test(action);
    if (sig) {
      const ll = this._activityLatLng();
      this._spawnGlobe(ll.lat, ll.lng, 0.95, (detail || action).slice(0, 90), { ephemeral: true });
      if (this._activity.length >= 8) void this._flush();
    }
  },

  async _flush() {
    if (!this._activity.length) return;
    const batch = this._activity.splice(0, 16);
    const digest = batch.map(b => b.action + ':' + b.detail).join('; ').slice(0, 520);
    try {
      await ACI?.api?.({ mode: 'log', action: 'field_batch', detail: digest, role: batch[0]?.role || 'client' });
    } catch (_) {}
    if (batch.length >= 6) void this._maybeEvolve('field x' + batch.length);
  },

  async _maybeEvolve(reason) {
    if (this._evolving) return;
    this._evolving = true;
    try {
      const r = await ACI?.api?.({ mode: 'evolve', activity: reason || 'spacenet' });
      const fresh = (r?.principles || []).filter(p => !this._principles.some(x => x.content === p));
      if (fresh.length) this._ingest(fresh, 'evolved');
      const births = Math.max(1, Math.min(4, Number(r?.brain?.inserted) || (fresh.length ? 2 : 1)));
      for (let i = 0; i < births; i++) {
        const ll = this._activityLatLng();
        this._spawnGlobe(ll.lat, ll.lng, 1.15 + Math.random() * 0.25, 'collective · ' + (reason || 'grow').slice(0, 60), { ephemeral: true });
      }
      ACI?.pulse?.(1.9);
      MissionSupportReporter?.recordProgress?.('brain', 'evolve · +' + births + ' · total ' + this.count(), { reason, total: this.count() });
      if (!document.hidden) GlobeDeck?.setPreview?.('Brain +' + births + ' neurons · ' + this.count() + ' total', 'dim');
    } catch (_) {}
    finally { this._evolving = false; }
  },

  onCycle(n) {
    void this._flush();
    if (n % this.EVOLVE_EVERY === 0) void this._maybeEvolve('cycle ' + n);
  },

  tick() {
    ACI?.tick?.();
    const t = Date.now() / 550;
    (ACI?.neurons || []).forEach((n, i) => {
      const s = (n.userData?.strength || 1) * (0.82 + Math.sin(t + i * 0.65) * 0.18);
      n.scale.setScalar(s);
    });
  },

  async boot() {
    if (this._booted) return;
    this._booted = true;
    try {
      const ensured = await ACI?.api?.({ mode: 'ensure_neurons' });
      if (ensured?.principles?.length) this._ingest(ensured.principles, 'seed');
      const stats = await ACI?.api?.({ mode: 'stats' });
      if (stats?.principles?.length) this._ingest(stats.principles, 'memory');
    } catch (_) {}
    this._syncChip();
    if (!this._flushTimer) this._flushTimer = setInterval(() => this._flush(), 28000);
    setTimeout(() => this._maybeEvolve('boot warm'), 90000);
    setTimeout(() => this._maybeEvolve('session digest'), 300000);
  },
};
window.BrainNeurons = BrainNeurons;

// === MARKETPLACE PRESENCE — driver heartbeat so real drivers appear on map ===
const MarketplacePresence = {
  _timer: null,
  PULSE_MS: 90000,

  start() {
    if (!Auth?.user || !FieldBrain?.roles?.includes?.('driver')) return;
    this.tick();
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.tick(), this.PULSE_MS);
  },

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  async tick() {
    if (!Auth?.user || !Auth?.client || document.hidden) return;
    const pos = window._lastPos;
    if (!pos?.lat) return;
    try {
      await Auth.client.from('profiles').update({
        field_lat: pos.lat,
        field_lng: pos.lng,
        field_seen_at: new Date().toISOString(),
      }).eq('id', Auth.user.id);
    } catch (_) {}
  },
};
window.MarketplacePresence = MarketplacePresence;

const GhostTravel = {
  SCRAMBLE_KM: 0,
  SPEED_KMH: 0,
  _target: null,
  active() { return false; },
  publicPos() { return window._lastPos || { lat: 36.22, lng: 28.12 }; },
  maskedTrue() { return null; },
  ingestUserPos() {},
  init() {},
};
window.GhostTravel = GhostTravel;

const WillaGames = {
  active: null,
  init() {},
  mergeLivePlayers(users) { return users || []; },
  ensureDemoPlayers() { return []; },
  getDemoRedTeam() { return []; },
  wantsPyramid() { return false; },
  wantsWilla() { return false; },
  startPyramid() {},
  startWilla() {},
  startKryftoDemo() {},
  listStatus() { return ''; },
};
window.WillaGames = WillaGames;

window.TelemachosPilot = {
  edition: { name_gr: 'ΤΗΛΕΜΑΧΟΣ', name_latin: 'telemachos', color: 0x00ccff },
  DOMAINS: {
    fpv: { emoji: '🥽', label: 'FPV', color: 0xff66cc, alt: 1.07 },
    air: { emoji: '🛸', label: 'Air', color: 0x44ccff, alt: 1.06 },
    ground: { emoji: '🚙', label: 'Ground', color: 0xffaa33, alt: 1.025 },
    sea: { emoji: '🚤', label: 'Sea', color: 0x0088ff, alt: 1.02 },
    underwater: { emoji: '🤿', label: 'Underwater', color: 0x2266aa, alt: 1.015 },
  },
  _stub() { return LazyModules.ensure(); },
  async cli(...a) { await this._stub(); return window.TelemachosPilot?.cli?.(...a); },
  showPilot(...a) { return this._stub().then(() => window.TelemachosPilot?.showPilot?.(...a)); },
  runDemoDelivery() { return this._stub().then(() => window.TelemachosPilot?.runDemoDelivery?.()); },
  refreshTeamStatus(...a) { return this._stub().then(() => window.TelemachosPilot?.refreshTeamStatus?.(...a)); },
  deliverToRed(...a) { return this._stub().then(() => window.TelemachosPilot?.deliverToRed?.(...a)); },
  wantsCmd(t) { return /telemach|tilemax|pilot|drone|τηλεμαχ/i.test(String(t || '')); },
};

const BrainConversation = {
  seedAdultNeurons() {},
  _matchLocal() { return null; },
  async converse(text, opts = {}) {
    const m = String(text || '').trim();
    if (!m) return '';
    if (window.AciCoders?.chat) {
      const r = await AciCoders.chat(m, { fromVoice: !!opts.fromVoice });
      return String(r?.text || r?.response || '').trim();
    }
    return '';
  },
};
window.BrainConversation = BrainConversation;

const HellenicSource = { seedToBrain() {} };
window.HellenicSource = HellenicSource;

const YachtMatcher = {
  async loadAndSyncGlobe() {},
  formatMatch() { return ''; },
  openBooking() {},
};
window.YachtMatcher = YachtMatcher;

const AuditorPortal = {
  open(opts) {
    opts = opts || {};
    const tab = opts.tab || 'company';
    window.AstranovSiteShell?.close?.();
    const sess = window.Auth?.session;
    if (!sess?.access_token) {
      AciCli?.print?.('Συνδεθείτε πρώτα στο Astranov — μετά Λογιστές', 'warn');
      Auth?.openLoginModal?.('Σύνδεση για auditors.astranov.eu');
      return;
    }
    const url = 'https://auditors.astranov.eu/?tab=' + encodeURIComponent(tab) + '&from_app=1';
    let w = null;
    try { w = window.open(url, 'astranov_auditors'); } catch (_) {}
    if (!w) {
      const a = document.createElement('a');
      a.href = url;
      a.target = 'astranov_auditors';
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    const bridge = () => {
      const s = window.Auth?.session;
      if (!s?.access_token) return;
      const payload = {
        type: 'astranov-auth',
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      };
      try {
        if (w && !w.closed) w.postMessage(payload, 'https://auditors.astranov.eu');
      } catch (_) {}
    };
    [400, 900, 1500, 3000, 5000, 8000].forEach((ms) => setTimeout(bridge, ms));
    GlobeDeck?.setPreview?.('📊 auditors.astranov.eu · λογιστική');
    AciCli?.print?.('Άνοιγμα auditors.astranov.eu · πλήρης οθόνη · καθολικό Τ', 'ok');
  },
  async cli(parts) {
    const sub = String(parts[1] || 'open').toLowerCase();
    const tabs = { ledger: 'ledger', trial: 'trial', balance: 'balance', tax: 'tax', payroll: 'payroll', ισολογισμός: 'balance', ισοζύγιο: 'trial', καθολικό: 'ledger', λογιστική: 'company', company: 'company' };
    this.open({ tab: tabs[sub] || 'company' });
  },
  syncGlobe() {},
};
window.AuditorPortal = AuditorPortal;

const AvcJustice = { loadConstitution() {}, syncGlobe() {} };
window.AvcJustice = AvcJustice;

const CoinPortal = { syncGlobe() {} };
window.CoinPortal = CoinPortal;

const AstranovUnified = { syncGlobe() {}, async cli() { ACIControl?.reply('Unified platform — use order · locate · profile'); } };
window.AstranovUnified = AstranovUnified;

const AstranovOneDatabase = { async cli() {} };
window.AstranovOneDatabase = AstranovOneDatabase;

const SuperSpace = {
  init() {},
  tick() {},
  stop() {},
  async locateForMedia() {},
};
window.SuperSpace = SuperSpace;

const GlobeAutonomy = { init() {} };
window.GlobeAutonomy = GlobeAutonomy;

// === SPACENET GEO — one distance math for routing · delivery · commerce · globe ===
const SpaceNetGeo = {
  haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },
  haversineKm(lat1, lng1, lat2, lng2) { return this.haversineM(lat1, lng1, lat2, lng2) / 1000; },
};
window.SpaceNetGeo = SpaceNetGeo;

function _haversineKm(lat1, lng1, lat2, lng2) { return SpaceNetGeo.haversineKm(lat1, lng1, lat2, lng2); }

function _defer(name, method, ...args) {
  return LazyModules.ensure().then(() => window[name]?.[method]?.(...args));
}

window.Commerce = {
  vendors: [],
  markers: [],
  driverMarkers: [],
  selected: null,
  cart: {},
  haversineKm: _haversineKm,
  userLatLng() { return window._lastPos || { lat: 36.22, lng: 28.12 }; },
  async loadVendors() {
    await LazyModules.ensure();
    return window.Commerce?.loadVendors?.();
  },
  initUI() {},
  async showPicker() { await LazyModules.ensure(); return window.Commerce?.showPicker?.(); },
  async openOrderFlow(q) { await LazyModules.ensure(); return window.Commerce?.openOrderFlow?.(q); },
  async smartOrder(q) { await LazyModules.ensure(); return window.Commerce?.smartOrder?.(q); },
  showMenu() { LazyModules.ensure().then(() => window.Commerce?.showMenu?.()); },
  openVendor(v) { if (v) VendorMapTile?.open?.(v); },
  renderCart() {},
  async fetchNearbyDrivers(lat, lng) {
    await LazyModules.ensure();
    const u = lat != null ? { lat, lng } : (window._lastPos || { lat: 36.44, lng: 28.22 });
    return window.Commerce?.fetchNearbyDrivers?.(u.lat, u.lng) || [];
  },
  parseWantedItems() { return []; },
  async cliVendorMenu() { await LazyModules.ensure(); return window.Commerce?.cliVendorMenu?.(); },
  async listMenuRequests() { await LazyModules.ensure(); return window.Commerce?.listMenuRequests?.(); },
};

window.CelestialNav = {
  tick() {},
  init() {},
  isGlobalNavView() { return false; },
  renderGuideHtml() { return ''; },
};

window.CodersHub = {
  LABS: [
    { id: 'main', label: 'Globe OS' }, { id: 'grok', label: 'Grok' },
    { id: 'chatgpt', label: 'ChatGPT' }, { id: 'claude', label: 'Claude' },
    { id: 'composer', label: 'Composer' }, { id: 'gemini', label: 'Gemini' },
    { id: 'deepseek', label: 'DeepSeek' }, { id: 'cursor', label: 'Cursor' },
  ],
  CONTINUATION_KEY: 'astranov:job-continuation',
  init() {},
  saveJob() {},
  readJob() { return null; },
  toggle() {},
};

window.LabOrbs = { init() {} };
window.ContextTruth = { infer() { return { ctx: 'idle' }; } };

// === ASTRANOV ROUTING ENGINE — avoids traffic lights, twisty roads, one-way traps ===
const AstranovRoutingEngine = {
  OSRM: 'https://router.project-osrm.org/route/v1/driving/',
  TURN_TYPES: new Set(['turn', 'fork', 'end of road', 'roundabout', 'rotary', 'exit roundabout', 'merge']),
  TURN_PENALTY: 9,
  SIGNAL_PENALTY: 14,
  SLOW_ROAD_PENALTY: 18,
  U_TURN_PENALTY: 55,

  scoreRoute(route) {
    let score = route.duration || 0;
    const steps = (route.legs || []).flatMap(l => l.steps || []);
    for (const s of steps) {
      const m = s.maneuver?.type || '';
      const mod = s.maneuver?.modifier || '';
      if (this.TURN_TYPES.has(m)) score += this.TURN_PENALTY;
      if (mod === 'uturn' || mod === 'sharp uturn') score += this.U_TURN_PENALTY;
      if ((s.distance || 0) < 45 && (s.duration || 0) > 11) score += this.SIGNAL_PENALTY;
      const name = (s.name || '').trim();
      if (!name && (s.distance || 0) < 280) score += this.SLOW_ROAD_PENALTY;
      if (m === 'roundabout' || m === 'rotary') score += 6;
    }
    return score;
  },

  oneWayRisk(route, heading) {
    const step = route.legs?.[0]?.steps?.[0];
    if (!step?.maneuver || heading == null || isNaN(heading)) return null;
    const bear = step.maneuver.bearing_after ?? step.maneuver.bearing_before;
    if (bear == null) return null;
    const diff = Math.abs(((bear - heading + 540) % 360) - 180);
    if (diff > 115) {
      return 'One-way protection — route avoids wrong-way entry';
    }
    return null;
  },

  haversineM(lat1, lng1, lat2, lng2) { return SpaceNetGeo.haversineM(lat1, lng1, lat2, lng2); },

  fallbackLeg(from, to) {
    if (!from || !to || from.lat == null || to.lat == null) return null;
    const dist = this.haversineM(from.lat, from.lng, to.lat, to.lng);
    const duration = dist / 9.2;
    const steps = Math.max(8, Math.min(28, Math.round(dist / 420)));
    const coords = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      coords.push([from.lng + (to.lng - from.lng) * t, from.lat + (to.lat - from.lat) * t]);
    }
    const route = {
      geometry: { coordinates: coords, type: 'LineString' },
      duration,
      distance: dist,
      legs: [{ steps: [{ maneuver: { type: 'depart' }, distance: dist, duration }] }],
    };
    return {
      route,
      alternatives: [],
      oneWayWarn: null,
      engine: 'astranov-routing-fallback',
      duration,
      distance: dist,
    };
  },

  async route(from, to, via, opts) {
    opts = opts || {};
    const pts = [from, via, to].filter(p => p && p.lat != null && p.lng != null);
    if (pts.length < 2) return null;
    const coordStr = pts.map(p => p.lng + ',' + p.lat).join(';');
    const q = 'overview=full&geometries=geojson&steps=true&annotations=duration,distance&alternatives=3';
    try {
      const r = await fetch(this.OSRM + coordStr + '?' + q);
      const j = await r.json();
      if (j.code !== 'Ok' || !j.routes?.length) return this.fallbackLeg(from, to);
      const ranked = j.routes
        .map(rt => ({ route: rt, score: this.scoreRoute(rt) }))
        .sort((a, b) => a.score - b.score);
      const best = ranked[0].route;
      return {
        route: best,
        alternatives: ranked.slice(1, 3).map(x => x.route),
        oneWayWarn: this.oneWayRisk(best, opts.heading),
        engine: 'astranov-routing-v1',
        duration: best.duration,
        distance: best.distance,
      };
    } catch (e) {
      console.warn('[AstranovRoutingEngine]', e);
      return this.fallbackLeg(from, to);
    }
  },

  applyToDrivingView(dv, result) {
    if (!result?.route || !dv) return false;
    const route = result.route;
    dv.routeCoords = route.geometry.coordinates.map(c => ({ lng: c[0], lat: c[1] }));
    dv.steps = (route.legs[0]?.steps || []).map(s => ({
      instruction: (s.maneuver?.type || 'continue') + (s.maneuver?.modifier ? ' ' + s.maneuver.modifier : '') + ' ' + (s.name || ''),
      dist: s.distance,
      loc: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] },
    }));
    dv.stepIdx = 0;
    return true;
  },
};
window.AstranovRoutingEngine = AstranovRoutingEngine;

// === MARKETPLACE DELIVERY ENGINE — triangle/polygon routes · P2P · no central support ===
const MarketplaceDeliveryEngine = {
  missions: [],
  _globeGroup: null,
  _globeMeshes: [],
  _pulse: 0,
  _selectedId: null,
  CHANNELS: ['wolt', 'efood', 'box', 'uber_eats', 'glovo', 'bolt_food', 'custom'],

  STATUS: {
    pending: { label: 'Pending vendor', color: 0xffaa33, active: false },
    seeking_driver: { label: 'Seeking driver', color: 0xffaa33, active: false },
    assigned: { label: 'Awaiting driver sign', color: 0x3d9eff, active: false },
    active: { label: 'Delivery active', color: 0x00dd88, active: true },
    en_route: { label: 'On route', color: 0x44ccff, active: true },
    delivered: { label: 'Delivered', color: 0x00ff88, active: false },
    cancelled: { label: 'Cancelled', color: 0xff3344, active: false },
  },

  init() {
    document.getElementById('drh-close')?.addEventListener('click', () => this.closeHud());
    document.getElementById('drh-accept')?.addEventListener('click', () => void this.acceptFromHud());
    document.getElementById('drh-pickup')?.addEventListener('click', () => void this.advanceStatus('picked_up'));
    document.getElementById('drh-enroute')?.addEventListener('click', () => void this.advanceStatus('en_route'));
    document.getElementById('drh-complete')?.addEventListener('click', () => void this.advanceStatus('delivered'));
    document.getElementById('delivery-route-hud')?.querySelectorAll('[data-drh]').forEach(btn => {
      btn.addEventListener('click', () => this._comms(btn.dataset.drh));
    });
  },

  haversineM(lat1, lng1, lat2, lng2) { return SpaceNetGeo.haversineM(lat1, lng1, lat2, lng2); },

  _isActive(order) {
    const s = order?.status || 'pending';
    return s === 'active' || s === 'en_route' || s === 'picked_up' || s === 'assigned' && order?.driver_accepted_at;
  },

  _stopsFromOrder(order, vendor, driver, client) {
    const drv = driver || {};
    const driverPt = {
      role: 'driver',
      lat: drv.field_lat ?? window._driverBase?.lat ?? window._lastPos?.lat,
      lng: drv.field_lng ?? window._driverBase?.lng ?? window._lastPos?.lng,
      label: drv.display_name || order?.driver_name || 'Driver',
      id: drv.id || order?.driver_id,
    };
    const vendorPt = {
      role: 'vendor',
      lat: vendor?.lat ?? order?.vendor_lat,
      lng: vendor?.lng ?? order?.vendor_lng,
      label: vendor?.name || order?.vendor_name || 'Vendor',
      id: vendor?.id || order?.vendor_id,
    };
    const clientPt = {
      role: 'client',
      lat: client?.lat ?? order?.delivery_lat,
      lng: client?.lng ?? order?.delivery_lng,
      label: client?.label || 'Client',
      id: order?.customer_id,
    };
    return [driverPt, vendorPt, clientPt].filter(p => p.lat != null && p.lng != null);
  },

  _orderDeliveryStops(stops) {
    const driver = stops.find(s => s.role === 'driver') || stops[0];
    const vendor = stops.find(s => s.role === 'vendor');
    const clients = stops.filter(s => s.role === 'client');
    const extras = stops.filter(s => s !== driver && s !== vendor && s.role !== 'client');
    const ordered = [driver];
    if (vendor) ordered.push(vendor);
    if (clients.length <= 1) {
      ordered.push(...clients);
    } else {
      let cur = ordered[ordered.length - 1] || driver;
      const pool = clients.slice();
      while (pool.length) {
        let best = 0;
        let bestD = Infinity;
        pool.forEach((s, i) => {
          const d = this.haversineM(cur.lat, cur.lng, s.lat, s.lng);
          if (d < bestD) { bestD = d; best = i; }
        });
        cur = pool.splice(best, 1)[0];
        ordered.push(cur);
      }
    }
    extras.forEach(s => {
      let bestAt = ordered.length;
      let bestD = Infinity;
      for (let i = 1; i < ordered.length; i++) {
        const d = this.haversineM(ordered[i - 1].lat, ordered[i - 1].lng, s.lat, s.lng)
          + this.haversineM(s.lat, s.lng, ordered[i].lat, ordered[i].lng)
          - this.haversineM(ordered[i - 1].lat, ordered[i - 1].lng, ordered[i].lat, ordered[i].lng);
        if (d < bestD) { bestD = d; bestAt = i; }
      }
      ordered.splice(bestAt, 0, s);
    });
    return ordered.filter((s, i, a) => s?.lat != null && a.indexOf(s) === i);
  },

  async buildRoute(stops, opts) {
    opts = opts || {};
    const ordered = this._orderDeliveryStops(stops);
    const allCoords = [];
    const legs = [];
    let totalDur = 0;
    let totalDist = 0;
    let totalScore = 0;
    for (let i = 0; i < ordered.length - 1; i++) {
      const leg = await AstranovRoutingEngine.route(ordered[i], ordered[i + 1], null, { heading: opts.heading });
      if (!leg?.route) continue;
      const seg = leg.route.geometry.coordinates.map(c => ({ lng: c[0], lat: c[1] }));
      if (allCoords.length && seg.length) seg.shift();
      allCoords.push(...seg);
      legs.push({ from: ordered[i], to: ordered[i + 1], duration: leg.duration, distance: leg.distance, score: leg.route ? AstranovRoutingEngine.scoreRoute(leg.route) : 0 });
      totalDur += leg.duration || 0;
      totalDist += leg.distance || 0;
      totalScore += legs[legs.length - 1].score;
    }
    return { coords: allCoords, legs, ordered, duration: totalDur, distance: totalDist, score: totalScore };
  },

  async activateTriangle({ order, vendor, driver, client, channel }) {
    if (!order?.id) return null;
    const stops = this._stopsFromOrder(order, vendor, driver, client);
    if (stops.length < 2) return null;
    const route = await this.buildRoute(stops);
    const active = this._isActive(order) || order.status === 'assigned';
    const mission = {
      id: String(order.id),
      order,
      vendor,
      driver,
      client: client || { lat: order.delivery_lat, lng: order.delivery_lng },
      stops,
      route,
      channel: channel || order.channel || null,
      status: order.status,
      active: active && !!order.driver_accepted_at,
      createdAt: Date.now(),
    };
    const idx = this.missions.findIndex(m => m.id === mission.id);
    if (idx >= 0) this.missions[idx] = mission;
    else this.missions.push(mission);
    if (mission.active) this.renderMission(mission);
    else this._renderPendingTriangle(mission);
    this.syncEtaLabels();
    return mission;
  },

  async addDeliveryToRoute(missionId, extra) {
    const m = this.missions.find(x => x.id === missionId);
    if (!m) return null;
    const newStop = {
      role: 'client',
      lat: extra.delivery_lat,
      lng: extra.delivery_lng,
      label: extra.label || 'Stop',
      orderId: extra.order_id,
    };
    m.stops.push({ role: 'vendor', lat: extra.vendor_lat, lng: extra.vendor_lng, label: extra.vendor_name || 'Vendor' });
    m.stops.push(newStop);
    m.polygon = true;
    m.route = await this.buildRoute(m.stops);
    m.active = true;
    this.renderMission(m);
    return m;
  },

  _renderPendingTriangle(mission) {
    const tri = mission.stops;
    if (tri.length < 3) return;
    const pts = tri.map(s => {
      const p = latLngToPos(s.lat, s.lng, 1.028);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    pts.push(pts[0].clone());
    this._addGlobeRoute(mission.id + ':tri', pts, 0x3d9eff, 0.42, { dashed: true, mission, pending: true, ring: true });
    this._addGlobeStopMarkers(mission, 0x3d9eff, true);
    CityMap?.setDeliveryPolygon?.(mission.id, tri, { color: '#3d9eff', pending: true, onClick: () => this.showHud(mission) });
  },

  renderMission(mission) {
    if (!mission?.route?.coords?.length) return;
    this._clearMissionViz(mission.id);
    const coords = mission.route.coords;
    const pts = coords.map(c => {
      const p = latLngToPos(c.lat, c.lng, 1.027);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    const st = this.STATUS[mission.status] || this.STATUS.active;
    const color = st.color || 0x00dd88;
    this._addGlobeRoute(mission.id, pts, color, 0.88, { mission, clickable: true });
    if (mission.stops?.length >= 3) {
      const ring = mission.stops.map(s => {
        const p = latLngToPos(s.lat, s.lng, 1.029);
        return new THREE.Vector3(p.x, p.y, p.z);
      });
      ring.push(ring[0].clone());
      const ringOp = mission.polygon ? 0.62 : 0.44;
      this._addGlobeRoute(mission.id + ':poly', ring, color, ringOp, { mission, ring: true });
      CityMap?.setDeliveryPolygon?.(mission.id, mission.stops, {
        color: '#' + color.toString(16).padStart(6, '0'),
        active: mission.active,
        polygon: mission.polygon,
        onClick: () => this.showHud(mission),
      });
    }
    this._addGlobeStopMarkers(mission, color, false);
    CityMap?.setDeliveryRoute?.(mission.id, coords, {
      color: '#' + color.toString(16).padStart(6, '0'),
      active: mission.active,
      onClick: () => this.showHud(mission),
    });
    if (DrivingView?.active) {
      DrivingView?.setRoutePlan?.({
        from: mission.stops[0],
        via: mission.stops[1],
        to: mission.stops[mission.stops.length - 1],
      });
      DrivingView.routeCoords = coords;
      DrivingView.drawRoute?.();
    }
  },

  _addGlobeStopMarkers(mission, color, pending) {
    if (!globePivot || !mission?.stops?.length) return;
    const roleColors = { driver: 0x44ccff, vendor: 0xffaa33, client: 0x00dd88 };
    mission.stops.forEach((s, i) => {
      const p = latLngToPos(s.lat, s.lng, 1.031);
      const geo = new THREE.SphereGeometry(pending ? 0.009 : 0.012, 8, 8);
      const mat = new THREE.MeshBasicMaterial({
        color: roleColors[s.role] || color,
        transparent: true,
        opacity: pending ? 0.55 : 0.92,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, p.y, p.z);
      mesh.userData = { deliveryRoute: true, routeKey: mission.id + ':mk' + i, mission, marker: true, role: s.role };
      globePivot.add(mesh);
      this._globeMeshes.push(mesh);
    });
  },

  _addGlobeRoute(key, points, color, opacity, meta) {
    if (!globePivot || points.length < 2) return;
    const glow = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacity * 0.28 })
    );
    const core = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    );
    glow.userData = { deliveryRoute: true, routeKey: key, ...meta };
    core.userData = { deliveryRoute: true, routeKey: key, ...meta };
    globePivot.add(glow);
    globePivot.add(core);
    this._globeMeshes.push(glow, core);
  },

  _clearMissionViz(id) {
    this._globeMeshes = this._globeMeshes.filter(m => {
      const k = m.userData?.routeKey || '';
      if (String(k).startsWith(id)) {
        if (m.parent) m.parent.remove(m);
        return false;
      }
      return true;
    });
    CityMap?.removeDeliveryRoute?.(id);
  },

  showHud(mission) {
    if (!mission) return;
    this._selectedId = mission.id;
    const hud = document.getElementById('delivery-route-hud');
    if (!hud) return;
    hud.classList.add('open');
    const st = this.STATUS[mission.status] || { label: mission.status };
    const items = Array.isArray(mission.order?.items) ? mission.order.items.map(i => (i.qty || 1) + '× ' + (i.name || i)).join(', ') : '';
    const calc = mission.order?.calc || {};
    const km = mission.route?.distance ? (mission.route.distance / 1000).toFixed(1) + ' km' : '?';
    const min = mission.route?.duration ? Math.round(mission.route.duration / 60) + ' min' : '?';
    document.getElementById('drh-type').textContent = mission.polygon ? '▸ Delivery polygon' : '▸ Delivery triangle';
    document.getElementById('drh-title').textContent = (mission.order?.short_id || mission.id.slice(0, 8)) + ' · ' + st.label;
    const lines = [
      '🏬 ' + (mission.vendor?.name || 'Vendor'),
      '🚚 ' + (mission.driver?.display_name || mission.order?.driver_name || 'Driver'),
      '📦 ' + items.slice(0, 80),
      '◎ Route · ' + km + ' · ~' + min + ' · score ' + Math.round(mission.route?.score || 0),
      '💰 ' + (calc.total_avc != null ? calc.total_avc + ' AVC' : (calc.total_eur != null ? calc.total_eur + ' EUR' : '')),
      mission.channel ? '🔗 Channel · ' + mission.channel : '24/7 · P2P · no central support',
    ];
    document.getElementById('drh-body').textContent = lines.filter(Boolean).join('\n');
    const acceptBtn = document.getElementById('drh-accept');
    const pickupBtn = document.getElementById('drh-pickup');
    const enrouteBtn = document.getElementById('drh-enroute');
    const completeBtn = document.getElementById('drh-complete');
    const isAssignedDriver = Auth?.user?.id && mission.order?.driver_id === Auth.user.id;
    const isDriverRole = FieldBrain?.roles?.includes?.('driver');
    const needsAccept = mission.order?.status === 'assigned' && !mission.order?.driver_accepted_at;
    const orderSt = mission.order?.status || '';
    if (acceptBtn) acceptBtn.style.display = ((isAssignedDriver || (isDriverRole && needsAccept)) && needsAccept) ? 'block' : 'none';
    if (pickupBtn) pickupBtn.style.display = (isAssignedDriver && ['active', 'assigned'].includes(orderSt) && mission.order?.driver_accepted_at) ? 'block' : 'none';
    if (enrouteBtn) enrouteBtn.style.display = (isAssignedDriver && (orderSt === 'picked_up' || orderSt === 'active')) ? 'block' : 'none';
    if (completeBtn) completeBtn.style.display = (isAssignedDriver && (orderSt === 'en_route' || orderSt === 'picked_up')) ? 'block' : 'none';
    MapPlaceMenu?.close?.();
    GlobeDeck?.setPreview?.('Delivery route · tap comms for vendor/client/driver');
  },

  closeHud() {
    document.getElementById('delivery-route-hud')?.classList.remove('open');
    this._selectedId = null;
  },

  async acceptFromHud() {
    const m = this.missions.find(x => x.id === this._selectedId);
    const oid = m?.order?.id || m?.order?.short_id;
    if (!oid) return;
    await FieldBrain?.claimDelivery?.(oid);
    this.closeHud();
  },

  _comms(kind) {
    const m = this.missions.find(x => x.id === this._selectedId);
    if (!m) return;
    const target = kind === 'message' ? (m.driver || m.vendor) : (m.driver || m.vendor);
    const uid = target?.id || m.order?.driver_id || m.vendor?.owner_id;
    if (!uid) {
      ACIControl?.reply?.('Open Marketplace cloud chat — vendor · driver · client');
      return;
    }
    LazyModules.ensure().then(() => {
      if (kind === 'message') MapComms?.contactMenu?.({ id: uid, name: target?.display_name || target?.name || 'User' });
      else if (kind === 'video') MapComms?.contactUser?.(uid, 'video');
      else MapComms?.contactUser?.(uid, 'voice');
    });
  },

  async advanceStatus(status) {
    const m = this.missions.find(x => x.id === this._selectedId);
    const oid = m?.order?.id || m?.order?.short_id;
    if (!oid || !Auth?.user) return;
    try {
      const headers = await Auth.authHeaders?.();
      const r = await fetch(SB_URL + '/functions/v1/order-intake', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status_update', order_id: oid, status }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok && j.order) {
        m.order = j.order;
        m.status = j.order.status;
        if (status === 'delivered') {
          m.active = false;
          this._clearMissionViz(m.id);
          this.closeHud();
        } else if (m.active || j.order.driver_accepted_at) {
          m.active = true;
          this.renderMission(m);
        }
        OrderTracking?.refresh?.({ quiet: true });
        ACIControl?.reply?.('Delivery · ' + (this.STATUS[j.order.status]?.label || j.order.status));
      } else {
        ACIControl?.reply?.('Status update failed · ' + (j.error || 'server'));
      }
    } catch (e) {
      ACIControl?.reply?.('Status update error');
    }
  },

  async onOrderPlaced(order, vendor, driver) {
    if (order?.delivery_lat != null) {
      window._clientDelivery = { lat: order.delivery_lat, lng: order.delivery_lng, label: 'Delivery' };
    }
    const v = vendor || { id: order.vendor_id, name: order.vendor_name, lat: order.vendor_lat, lng: order.vendor_lng };
    const seeking = !order?.driver_id || order?.status === 'seeking_driver';
    const mission = await this.activateTriangle({ order, vendor: v, driver, client: window._clientDelivery });
    if (seeking) {
      ACIControl?.reply?.('Order placed · awaiting signed driver before triangle activates');
    } else if (!order?.driver_accepted_at) {
      ACIControl?.reply?.('Driver assigned · must accept before route goes live');
    }
    return mission;
  },

  async onDriverAccepted(order, vendor, driver) {
    if (!order) return;
    order.driver_accepted_at = order.driver_accepted_at || new Date().toISOString();
    order.status = 'active';
    const mission = await this.activateTriangle({ order, vendor, driver, client: window._clientDelivery });
    if (mission) {
      mission.active = true;
      this.renderMission(mission);
      MarketplaceComms?.openForOrder?.({ order, vendor, drivers: driver ? [driver] : [], seeking_driver: false });
    }
    return mission;
  },

  pickFromGlobeHit(hit) {
    const o = hit?.object;
    if (!o?.userData?.deliveryRoute || !o.userData.mission) return false;
    this.showHud(o.userData.mission);
    return true;
  },

  _etaEls: [],

  _positionEta(el, lat, lng) {
    if (!el || lat == null || lng == null || !globePivot || !camera) return;
    const p = latLngToPos(lat, lng, 1.03);
    const v = new THREE.Vector3(p.x, p.y, p.z);
    globePivot.localToWorld(v);
    v.project(camera);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = (v.x * 0.5 + 0.5) * window.innerWidth + 'px';
    el.style.top = (-v.y * 0.5 + 0.5) * window.innerHeight + 'px';
  },

  syncEtaLabels() {
    const now = Date.now();
    if (this._lastEtaSync && now - this._lastEtaSync < 800) return;
    this._lastEtaSync = now;
    const root = document.getElementById('map-eta-labels');
    if (!root) return;
    const show = GlobeNavigate?.isNational?.() || GlobeNavigate?.isCity?.() || CityMap?.active || CityMap?._nationalActive;
    if (!show || !this.missions.length) {
      root.innerHTML = '';
      this._etaEls = [];
      return;
    }
    const need = this.missions.length;
    while (this._etaEls.length < need) {
      const el = document.createElement('div');
      el.className = 'map-eta-label';
      root.appendChild(el);
      this._etaEls.push(el);
    }
    while (this._etaEls.length > need) {
      const el = this._etaEls.pop();
      el?.remove?.();
    }
    this.missions.forEach((m, i) => {
      const el = this._etaEls[i];
      if (!el || !m.route?.coords?.length) return;
      const mid = m.route.coords[Math.floor(m.route.coords.length * 0.55)] || m.route.coords[0];
      const etaMin = m.route.duration ? Math.max(1, Math.round(m.route.duration / 60)) : '?';
      const st = this.STATUS[m.status] || { label: m.status };
      const driver = m.order?.driver_name || m.driver?.display_name || 'driver?';
      el.className = 'map-eta-label' + (m.active ? '' : ' pending');
      el.textContent = (m.order?.short_id || m.id.slice(0, 6)) + ' · ' + etaMin + 'm · ' + driver + ' · ' + st.label;
      el.onclick = (e) => { e.stopPropagation(); this.showHud(m); };
      this._positionEta(el, mid.lat, mid.lng);
    });
  },

  async refreshVendorPolygons(vendorId) {
    if (!Auth?.user || !Auth?.client || !vendorId) return;
    try {
      const headers = await Auth.authHeaders?.();
      const r = await fetch(SB_URL + '/rest/v1/orders?select=*&vendor_id=eq.' + encodeURIComponent(vendorId) + '&status=in.(assigned,active,en_route,seeking_driver)&order=created_at.desc&limit=12', { headers });
      if (!r.ok) return;
      const orders = await r.json();
      for (const order of orders || []) {
        const vendor = (window.Commerce?.vendors || []).find(v => v.id === vendorId) || { id: vendorId, lat: order.vendor_lat, lng: order.vendor_lng, name: order.vendor_name };
        await this.activateTriangle({ order, vendor, driver: { id: order.driver_id, display_name: order.driver_name }, client: { lat: order.delivery_lat, lng: order.delivery_lng } });
      }
      this.syncEtaLabels();
    } catch (_) {}
  },

  tick() {
    if (this._globeMeshes.length) {
      this._pulse += 0.035;
      this._globeMeshes.forEach((ln, i) => {
        if (!ln.material || ln.userData?.pending) return;
        const base = ln.userData?.ring ? 0.4 : 0.75;
        ln.material.opacity = base * (0.82 + Math.sin(this._pulse + i * 0.4) * 0.18);
      });
    }
    if (this.missions.length) this.syncEtaLabels();
  },

  importChannelOrder(payload) {
    payload = payload || {};
    return this.activateTriangle({
      order: payload.order,
      vendor: payload.vendor,
      driver: payload.driver,
      channel: payload.channel || 'custom',
    });
  },
};
window.MarketplaceDeliveryEngine = MarketplaceDeliveryEngine;

const DrivingView = {
  active: false, speed: 0, mode: 'still', watchId: null, lastFix: null, lastTime: 0,
  routeLine: null, routeCoords: [], steps: [], stepIdx: 0, destination: null,
  WALK_THRESHOLD: 2.2, DRIVE_THRESHOLD: 4.5, _ready: true,
  haversineM(lat1, lng1, lat2, lng2) { return SpaceNetGeo.haversineM(lat1, lng1, lat2, lng2); },
  init() { this._geoReady = !!navigator.geolocation; },
  _ensureWatch() {
    if (this.watchId || !this._geoReady) return;
    this.watchId = navigator.geolocation.watchPosition(
      pos => this.onFix(pos), () => {},
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 12000 }
    );
  },
  setDestination(lat, lng) {
    this.destination = { lat, lng };
    if (this.active) this.fetchRoadRoute();
  },
  setRoutePlan(plan) {
    this._routePlan = plan || null;
  },
  onFix(pos) {
    const now = Date.now();
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    let speed = pos.coords.speed;
    if (this.lastFix && this.lastTime) {
      const dt = (now - this.lastTime) / 1000;
      if (dt > 0.4) {
        const d = this.haversineM(this.lastFix.lat, this.lastFix.lng, lat, lng);
        if (speed == null || speed < 0) speed = d / dt;
      }
    }
    this.speed = Math.max(0, speed || 0);
    this.lastFix = { lat, lng };
    this.lastTime = now;
    window._lastPos = { lat, lng };
    if (typeof placeMe === 'function') placeMe(lat, lng, { quiet: true, markerOnly: true });
    const prev = this.mode;
    if (this.speed < 0.6) this.mode = 'still';
    else if (this.speed < this.WALK_THRESHOLD) this.mode = 'walk';
    else if (this.speed < this.DRIVE_THRESHOLD) this.mode = 'run';
    else this.mode = 'drive';
    if ((this.mode === 'run' || this.mode === 'drive') && !this.active) this.activate();
    if (this.active) { this.updateCamera(pos); this.updateGuidance(lat, lng); }
    if (prev !== this.mode && (this.mode === 'run' || this.mode === 'drive')) {
      GlobeDeck?.setPreview?.((this.mode === 'drive' ? '🚗 DRIVING' : '⚡ FAST') + ' · ' + Math.round(this.speed * 3.6) + ' km/h');
    }
  },
  activate() {
    this._ensureWatch();
    this.active = true;
    this._cameraFollow = true;
    GlobeControl?.engageFollow?.('drive');
    SuperCli?.setContext?.('drive');
    AppShortcuts?.track?.('drive', 'Drive');
    const pos = window._lastPos || this.lastFix || { lat: 36.44, lng: 28.22 };
    const p = latLngToPos(pos.lat, pos.lng, 1.04);
    if (typeof flyToPoint === 'function') {
      flyToPoint(new THREE.Vector3(p.x, p.y, p.z), 1.28, { dur: GlobeControl?.flyDuration?.(camera?.position?.z, 1.28) || 1400 });
      GlobeControl?.noteAutoFly?.();
    }
    GlobeDeck?.setPreview?.('DRIVE · routing…');
    document.getElementById('zoom-label').textContent = 'DRIVE VIEW';
    if (!this.destination) {
      const v = window.Commerce?.vendors?.[0];
      this.destination = v ? { lat: v.lat, lng: v.lng } : { lat: pos.lat + 0.02, lng: pos.lng + 0.02 };
    }
    this.fetchRoadRoute();
    MapDepict?.action?.('drive', { detail: 'road routing' });
    ACIControl?.reply?.('Drive mode · route on map');
  },
  deactivate() {
    this.active = false;
    this._cameraFollow = false;
    if (GlobeControl?.followMode === 'drive') GlobeControl.followMode = 'free';
    AppShortcuts?.untrack?.('drive');
    SuperCli?.setContext?.(SuperCli?.inferContext?.() || 'idle');
    GlobeDeck?.setPreview?.('');
    if (this.routeLine?.parent) this.routeLine.parent.remove(this.routeLine);
    this.routeLine = null;
    CityMap?.setRoute?.([]);
    CosmicZoom?.update?.(camera.position.z);
  },
  updateCamera(pos) {
    if (!this._cameraFollow || GlobeControl?.userExploring) return;
    camera.position.z = this.mode === 'drive' ? 1.22 : 1.32;
    const h = pos.coords.heading;
    if (h != null && !isNaN(h)) globePivot.rotation.y = (-h + 90) * Math.PI / 180;
  },
  async fetchRoadRoute() {
    const plan = this._routePlan;
    const from = plan?.from || window._driverBase || window._lastPos || this.lastFix;
    const via = plan?.via;
    const to = plan?.to || this.destination;
    if (!from || !to) return;
    try {
      const heading = this.lastFix?.heading ?? (typeof navigator !== 'undefined' ? null : null);
      const result = await AstranovRoutingEngine.route(from, to, via, { heading });
      if (result && AstranovRoutingEngine.applyToDrivingView(this, result)) {
        this.drawRoute();
        if (this.steps[0]) this.showStep(this.steps[0]);
        const km = Math.round((result.distance || 0) / 100) / 10;
        const min = Math.round((result.duration || 0) / 60);
        let line = 'Astranov route · ' + (km ? km + ' km' : '') + (min ? ' · ~' + min + ' min' : '');
        if (result.oneWayWarn) line += ' · ' + result.oneWayWarn;
        GlobeDeck?.setPreview?.(line);
        ACIControl?.reply?.(line);
        return;
      }
    } catch (e) { console.warn('[DrivingView] AstranovRoutingEngine', e); }
    const fallback = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      fallback.push({ lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t });
    }
    this.routeCoords = fallback;
    this.drawRoute();
    ACIControl?.reply?.('Direct route (OSRM offline) · ' + Math.round(this.haversineM(from.lat, from.lng, to.lat, to.lng) / 1000) + ' km');
  },
  drawRoute() {
    if (this.routeLine?.parent) this.routeLine.parent.remove(this.routeLine);
    const pts = (this.routeCoords || []).map(c => {
      const p = latLngToPos(c.lat, c.lng, 1.026);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    if (pts.length < 2) return;
    this.routeLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.85 })
    );
    globePivot.add(this.routeLine);
    CityMap?.setRoute?.(this.routeCoords);
    MapDepict?.pulse?.(window._lastPos?.lat, window._lastPos?.lng, 0x44aaff, 'road route', 6000);
  },
  showStep(step) {
    const km = step.dist > 1000 ? (step.dist / 1000).toFixed(1) + ' km' : Math.round(step.dist) + ' m';
    const line = '➤ ' + step.instruction + ' · ' + km;
    GlobeDeck?.setPreview?.(line);
    ACIControl?.reply?.(line);
  },
  updateGuidance(lat, lng) {
    if (!this.steps.length) return;
    const step = this.steps[this.stepIdx];
    if (!step?.loc) return;
    if (this.haversineM(lat, lng, step.loc.lat, step.loc.lng) < 35 && this.stepIdx < this.steps.length - 1) {
      this.stepIdx++;
      this.showStep(this.steps[this.stepIdx]);
    }
  },
};
window.DrivingView = DrivingView;
window.Comms = {
  vhfActive: false,
  startVHF() { return _defer('Comms', 'startVHF'); },
  startPhone() { return _defer('Comms', 'startPhone'); },
  startTelecomms() { return _defer('Comms', 'startTelecomms'); },
};
window.NewsFeed = { flash() { return _defer('NewsFeed', 'flash'); } };
window.AstranovNode = { launchBatch() { return _defer('AstranovNode', 'launchBatch'); } };
window.SuperAdd = { open() { return _defer('SuperAdd', 'open'); } };
window.CliHub = { startPrivateCloud() { return _defer('CliHub', 'startPrivateCloud'); } };
window.OrderTracking = {
  active: false,
  init() {},
  refresh() {},
  async cli(...args) {
    await LazyModules.ensure();
    return window.OrderTracking.cli(...args);
  },
};
window.ProfileSite = { init() {}, open() {} };
window.AstranovSession = { init() {} };
window.AstranovPresence = { init() {} };
window.Responsive3D = { init() {} };
window.MapComms = { open() {}, close() {} };
window.PmrRadio = { open() {} };
window.SatRadio = window.PmrRadio;
window.GlobeVideo = { open() {} };
window.AstranovSiteShell = { open() {}, close() {} };
window.AstranovSitesProvision = { request() { return Promise.resolve(); } };
window.SuperBookingProvision = window.AstranovSitesProvision;
window.AstranovWishlist = { add() {} };
window.DeliveryPricing = {
  async quote(opts) {
    opts = opts || {};
    const km = Math.max(0, Number(opts.km) || 0);
    const subtotal = Math.max(0, Number(opts.subtotal_eur) || 0);
    const delivery = 3 + Math.ceil(Math.max(0, km - 3) / 3) * 3;
    const platform = Math.round((subtotal + delivery) * 0.03 * 100) / 100;
    const total = Math.round((subtotal + delivery + platform) * 100) / 100;
    return { km, subtotal_eur: subtotal, delivery_eur: delivery, platform_fee_eur: platform, total_eur: total, total_avc: total, driver_payout_eur: delivery * 0.85 };
  },
};
window.GoogleWalletPay = { pay() { return Promise.resolve(); } };
window.AciConnect = { open() { return _defer('AciConnect', 'open'); } };

// === LAZY MODULES — load deferred bundle after core boot ===
const LazyModules = {
  _promise: null,
  _loaded: false,

  schedule() {
    const delay = window.SlumberManager?.deferredDelay?.() || 1400;
    const run = () => {
      if (window.SlumberManager?.allows?.('deferred')) this.load().catch(() => {});
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: Math.max(delay, 800) });
    } else {
      setTimeout(run, Math.max(delay, 80));
    }
  },

  load() {
    if (window._deferredBootDone) {
      this._loaded = true;
      return Promise.resolve();
    }
    if (this._loaded) return Promise.resolve();
    if (this._promise) return this._promise;

    const build = document.querySelector('meta[name="astranov-build"]')?.content || '';
    const src = '/astranov-deferred.js' + (build ? '?v=' + encodeURIComponent(build) : '');

    this._promise = new Promise((resolve, reject) => {
      const done = () => {
        this._loaded = true;
        resolve();
      };
      const tag = document.querySelector('script[data-astranov-deferred]');
      if (tag) {
        if (window._deferredBootDone) return done();
        tag.addEventListener('load', () => done(), { once: true });
        tag.addEventListener('error', () => reject(new Error('deferred script failed')), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.dataset.astranovDeferred = '1';
      s.onload = () => {
        done();
        window.AvcBalance?.init?.();
        SpaceNetLoader?.stage?.('deferred', SpaceNetMission?.LOADER?.deferred || 'Fleet & relay ready');
      };
      s.onerror = () => reject(new Error('deferred script failed'));
      document.head.appendChild(s);
    });
    return this._promise;
  },

  ensure() {
    SlumberManager?.wake?.('deferred', 'needed');
    return this.load().then(() => {
      if (!window._deferredBootDone && window.DeferredBoot?.run) {
        window.DeferredBoot.run();
      }
    });
  },
};
window.LazyModules = LazyModules;

// === SLUMBER MANAGER — probe hardware, sleep/wake subsystems, scale quality ===
const SlumberManager = {
  tier: 'balanced',
  _inited: false,
  _fpsSamples: [],
  _lastFrame: 0,
  _monitor: null,
  _userPinned: false,

  TIER_LABEL: {
    gaming: 'Gaming',
    full: 'Full power',
    balanced: 'Balanced',
    conserve: 'Conserve',
    slumber: 'Slumber',
  },

  PRESETS: {
    gaming: {
      pixelRatio: 2.0,
      earthHd: true,
      earthTickMs: 180,
      entityTickMs: 160,
      newsIntervalMs: 12000,
      newsMax: 8,
      cityMaxZoom: 20,
      cityDriverMs: 4000,
      deferredDelayMs: 400,
      anim: { orbital: 2, entity: 4, earth: 2, celestial: 2, cosmic: 6 },
      codersPing: true,
      labOrbs: true,
      presence: true,
      gamingGraphics: true,
    },
    full: {
      pixelRatio: 1.25,
      earthHd: true,
      earthTickMs: 250,
      entityTickMs: 200,
      newsIntervalMs: 12000,
      newsMax: 8,
      cityMaxZoom: 20,
      cityDriverMs: 4500,
      deferredDelayMs: 600,
      anim: { orbital: 3, entity: 6, earth: 4, celestial: 3, cosmic: 8 },
      codersPing: true,
      labOrbs: true,
      presence: true,
    },
    balanced: {
      pixelRatio: 1.0,
      earthHd: true,
      earthTickMs: 400,
      entityTickMs: 320,
      newsIntervalMs: 20000,
      newsMax: 5,
      cityMaxZoom: 18,
      cityDriverMs: 7000,
      deferredDelayMs: 1400,
      anim: { orbital: 4, entity: 8, earth: 6, celestial: 6, cosmic: 10 },
      codersPing: true,
      labOrbs: true,
      presence: true,
    },
    conserve: {
      pixelRatio: 0.9,
      earthHd: false,
      earthTickMs: 650,
      entityTickMs: 520,
      newsIntervalMs: 45000,
      newsMax: 3,
      cityMaxZoom: 16,
      cityDriverMs: 12000,
      deferredDelayMs: 3200,
      anim: { orbital: 6, entity: 12, earth: 8, celestial: 12, cosmic: 16 },
      codersPing: false,
      labOrbs: false,
      presence: false,
    },
    slumber: {
      pixelRatio: 0.75,
      earthHd: false,
      earthTickMs: 900,
      entityTickMs: 780,
      newsIntervalMs: 0,
      newsMax: 0,
      cityMaxZoom: 15,
      cityDriverMs: 18000,
      deferredDelayMs: 6000,
      anim: { orbital: 9, entity: 18, earth: 12, celestial: 18, cosmic: 24 },
      codersPing: false,
      labOrbs: false,
      presence: false,
    },
  },

  SUBSYSTEMS: {
    globe: { label: 'Earth globe', essential: true },
    grok: { label: 'Grok voice/text', essential: true },
    cli: { label: 'Command line', essential: true },
    earth_hd: { label: 'HD earth textures' },
    deferred: { label: 'Shops · coders · comms pack' },
    news: { label: 'News ticker' },
    coders_ping: { label: 'Coders lab health checks' },
    lab_orbs: { label: 'Lab quick-orbs' },
    presence: { label: 'Live presence on map' },
    entities: { label: 'Globe entity labels' },
    commerce: { label: 'Shops & delivery' },
    celestial: { label: 'Constellation overlay' },
    city_hd: { label: 'City satellite tiles' },
    webrtc: { label: 'Voice/video calls' },
    voice: { label: 'Hands-free voice' },
  },

  init() {
    if (this._inited) return;
    this._inited = true;
    this.profile = this.probeHardware();
    this.states = {};
    Object.keys(this.SUBSYSTEMS).forEach(id => { this.states[id] = 'drowsy'; });
    ['globe', 'grok', 'cli'].forEach(id => { this.states[id] = 'awake'; });
    this.applyTier(this.pickInitialTier(), 'hardware probe');
    this._bind();
    this._startMonitor();
    setTimeout(() => this._announceLimits(), 1800);
  },

  probeHardware() {
    const nav = navigator;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    const mem = nav.deviceMemory || 0;
    const cores = nav.hardwareConcurrency || 2;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '')
      || (nav.maxTouchPoints > 1 && window.innerWidth < 900);
    let gpu = '';
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      if (dbg && gl) gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
    } catch (_) {}
    const saveData = !!(conn?.saveData);
    const effectiveType = conn?.effectiveType || '';
    const lowEndGpu = /swiftshader|llvmpipe|intel hd [2-4]|mali-[34]|adreno [23]/i.test(gpu);
    return {
      cores,
      memoryGb: mem,
      mobile,
      gpu: gpu.slice(0, 80),
      lowEndGpu,
      saveData,
      connection: effectiveType,
      slowNet: saveData || effectiveType === 'slow-2g' || effectiveType === '2g',
      width: window.innerWidth,
      height: window.innerHeight,
    };
  },

  pickInitialTier() {
    const p = this.profile;
    let score = 0;
    if (p.cores >= 8) score += 2;
    else if (p.cores >= 4) score += 1;
    if (p.memoryGb >= 8) score += 2;
    else if (p.memoryGb >= 4) score += 1;
    if (!p.mobile) score += 1;
    if (p.lowEndGpu) score -= 2;
    if (p.slowNet) score -= 2;
    if (p.saveData) score -= 2;
    if (p.width < 380) score -= 1;
    if (score >= 7) return 'gaming';
    if (score >= 5) return 'full';
    if (score >= 3) return 'balanced';
    if (score >= 1) return 'conserve';
    return 'slumber';
  },

  applyTier(tier, reason) {
    if (!this.PRESETS[tier]) tier = 'balanced';
    this.tier = tier;
    this.quality = { ...this.PRESETS[tier] };
    window._globePerfLite = tier !== 'full' && tier !== 'gaming';
    window._slumberTier = tier;
    document.body.dataset.slumber = tier;
    this._applySubsystemDefaults(tier);
    this.applyQuality();
    if (reason && reason !== 'hardware probe') this.notify(`Slumber · ${this.TIER_LABEL[tier]} — ${reason}`);
    window.SpaceNetResourceMonitor?.onTierChange?.(tier, reason);
  },

  _applySubsystemDefaults(tier) {
    const q = this.quality;
    const set = (id, state) => { if (this.SUBSYSTEMS[id]) this.states[id] = state; };
    set('globe', 'awake');
    set('grok', 'awake');
    set('cli', 'awake');
    set('earth_hd', q.earthHd ? (tier === 'full' || tier === 'gaming' ? 'awake' : 'drowsy') : 'sleeping');
    set('deferred', tier === 'slumber' ? 'sleeping' : tier === 'conserve' ? 'drowsy' : 'awake');
    set('news', q.newsMax > 0 ? (tier === 'full' ? 'awake' : 'drowsy') : 'sleeping');
    set('coders_ping', q.codersPing ? 'drowsy' : 'sleeping');
    set('lab_orbs', q.labOrbs ? 'drowsy' : 'sleeping');
    set('presence', q.presence ? 'drowsy' : 'sleeping');
    set('entities', tier === 'slumber' ? 'drowsy' : 'awake');
    set('commerce', 'sleeping');
    set('celestial', tier === 'full' || tier === 'balanced' ? 'drowsy' : 'sleeping');
    set('city_hd', 'sleeping');
    set('webrtc', 'sleeping');
    set('voice', 'drowsy');
  },

  applyQuality() {
    const q = this.quality;
    if (window.renderer?.setPixelRatio) {
      const dpr = window.devicePixelRatio || 1;
      window.renderer.setPixelRatio(Math.min(dpr, q.pixelRatio));
    }
    if (window.EarthRealism?._inited) window.EarthRealism.tick?.();
    if (window.CityMap?.map && q.cityMaxZoom) {
      try { window.CityMap.map.setMaxZoom(q.cityMaxZoom); } catch (_) {}
    }
  },

  wake(id, reason) {
    if (!this.SUBSYSTEMS[id]) return;
    const prev = this.states[id];
    if (prev === 'awake') return;
    this.states[id] = 'awake';
    if (id === 'deferred') LazyModules?.ensure?.();
    if (id === 'news' && window.NewsFeed?.fetch) window.NewsFeed.fetch();
    if (id === 'commerce' && window.Commerce?.loadVendors) {
      window.Commerce.loadVendors().then(() => window.Commerce?.initUI?.()).catch(() => {});
    }
    if (id === 'coders_ping' && window.CodersHub?._pingLabs) window.CodersHub._pingLabs();
    if (id === 'lab_orbs' && window.LabOrbs?.init) window.LabOrbs.init();
    if (id === 'presence' && window.AstranovPresence?.join) window.AstranovPresence.join();
    if (id === 'city_hd' && window.CityMap?.active) window.CityMap._invalidate?.();
    if (reason && prev === 'sleeping') this.notify(`Awake · ${this.SUBSYSTEMS[id].label}`, 'ready');
  },

  sleep(id, reason) {
    if (!this.SUBSYSTEMS[id] || this.SUBSYSTEMS[id].essential) return;
    if (this.states[id] === 'sleeping') return;
    this.states[id] = 'sleeping';
    if (id === 'news') {
      const preview = document.getElementById('globe-deck-preview');
      if (preview && /📰|news/i.test(preview.textContent || '')) preview.textContent = '';
    }
    if (id === 'coders_ping' && document.getElementById('coders-hub-trigger')) {
      delete document.getElementById('coders-hub-trigger').dataset.pinging;
    }
    if (id === 'lab_orbs') document.getElementById('lab-orb-layer')?.classList.remove('open', 'intro');
    if (id === 'presence' && window.AstranovPresence?.leave) window.AstranovPresence.leave();
    if (reason) this.notify(`Sleep · ${this.SUBSYSTEMS[id].label}`, 'hold');
  },

  isAwake(id) {
    return this.states[id] === 'awake';
  },

  allows(id) {
    const s = this.states[id];
    return s === 'awake' || s === 'drowsy';
  },

  shouldInit(id) {
    return this.allows(id);
  },

  frameDivisor(kind) {
    return this.quality?.anim?.[kind] || 6;
  },

  tickMs(kind) {
    const q = this.quality || {};
    if (kind === 'earth') return q.earthTickMs || 400;
    if (kind === 'entity') return q.entityTickMs || 320;
    if (kind === 'news') return q.newsIntervalMs || 20000;
    if (kind === 'cityDriver') return q.cityDriverMs || 7000;
    return 500;
  },

  deferredDelay() {
    return this.quality?.deferredDelayMs || 1400;
  },

  wakeForAction(action) {
    const act = String(action || '').toLowerCase();
    const map = {
      order: ['commerce', 'deferred', 'entities'],
      commerce: ['commerce', 'deferred', 'entities'],
      batch: ['deferred', 'presence'],
      vhf: ['deferred', 'webrtc'],
      radio: ['deferred', 'webrtc'],
      pmr: ['deferred', 'webrtc'],
      phone: ['deferred', 'webrtc'],
      call: ['deferred', 'webrtc'],
      news: ['news', 'deferred'],
      drive: ['deferred', 'city_hd'],
      city: ['city_hd'],
      map: ['city_hd'],
      coders: ['deferred', 'coders_ping'],
      add: ['deferred'],
      post: ['deferred'],
      superadd: ['deferred'],
      locate: ['entities'],
    };
    (map[act] || []).forEach(id => this.wake(id, act));
    if (['order', 'commerce', 'batch', 'vhf', 'radio', 'news', 'drive', 'coders', 'add'].includes(act)) {
      this.wake('voice', act);
    }
    window.SpaceNetResourceMonitor?.noteDemand?.(act);
  },

  tickFrame() {
    const now = performance.now();
    if (this._lastFrame) {
      const dt = now - this._lastFrame;
      if (dt > 0 && dt < 200) {
        this._fpsSamples.push(1000 / dt);
        if (this._fpsSamples.length > 48) this._fpsSamples.shift();
      }
    }
    this._lastFrame = now;
    if (this._fpsSamples.length >= 24 && !this._userPinned) {
      this._maybeDowngrade();
      this._maybeUpgrade();
    }
    window.SpaceNetResourceMonitor?.onFrame?.();
  },

  _avgFps() {
    if (!this._fpsSamples.length) return 60;
    return this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
  },

  _maybeDowngrade() {
    const fps = this._avgFps();
    const order = ['gaming', 'full', 'balanced', 'conserve', 'slumber'];
    const idx = order.indexOf(this.tier);
    if (fps < 22 && idx >= 0 && idx < order.length - 1) {
      this.applyTier(order[idx + 1], `FPS ${Math.round(fps)} — easing load`);
      this._fpsSamples = [];
    }
  },

  _maybeUpgrade() {
    if (this._userPinned) return;
    if (!window.SpaceNetResourceMonitor?.allowsUpgrade?.()) return;
    const fps = this._avgFps();
    const order = ['slumber', 'conserve', 'balanced', 'full', 'gaming'];
    const idx = order.indexOf(this.tier);
    if (fps > 50 && idx >= 0 && idx < order.length - 1) {
      this.applyTier(order[idx + 1], `FPS ${fps.toFixed(0)} — headroom`);
      this._fpsSamples = [];
    }
  },

  _bind() {
    document.addEventListener('visibilitychange', () => this._onVisibility());
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeT);
      this._resizeT = setTimeout(() => this.applyQuality(), 200);
    });
  },

  _onVisibility() {
    if (document.hidden) {
      this.sleep('news', 'tab hidden');
      this.sleep('coders_ping', 'tab hidden');
      this.sleep('lab_orbs', 'tab hidden');
      this.sleep('presence', 'tab hidden');
      this.sleep('celestial', 'tab hidden');
    } else {
      if (this.quality.newsMax > 0) this.wake('news', 'tab visible');
      if (this.quality.codersPing) this.wake('coders_ping', 'tab visible');
      if (this.quality.labOrbs) this.wake('lab_orbs', 'tab visible');
      if (this.quality.presence && Auth?.user) this.wake('presence', 'tab visible');
      if (this.tier === 'full' || this.tier === 'balanced') this.wake('celestial', 'tab visible');
    }
  },

  _startMonitor() {
    clearInterval(this._monitor);
    this._monitor = setInterval(() => this._idleSweep(), 30000);
  },

  _idleSweep() {
    if (document.hidden) return;
    const task = GlobeDeck?.activeTask;
    const voice = window._handsFreeVoice || isListening;
    if (!voice && task !== 'commerce') this.sleep('commerce', 'idle');
    if (!voice && task !== 'radio') this.sleep('webrtc', 'idle');
    if (!CityMap?.active) this.sleep('city_hd', 'idle');
    if (!voice && !GlobeDeck?.thinking) this.sleep('voice', 'idle');
  },

  _limitsText() {
    const p = this.profile;
    const parts = [this.TIER_LABEL[this.tier]];
    if (p.mobile) parts.push('mobile');
    if (p.cores) parts.push(p.cores + ' cores');
    if (p.memoryGb) parts.push(p.memoryGb + 'GB RAM');
    if (p.slowNet) parts.push('slow net');
    if (p.lowEndGpu) parts.push('basic GPU');
    if (!this.quality.earthHd) parts.push('SD earth');
    if (!this.quality.newsMax) parts.push('news off');
    else if (this.quality.newsMax < 8) parts.push('news×' + this.quality.newsMax);
    const sleeping = Object.entries(this.states).filter(([, s]) => s === 'sleeping').map(([id]) => this.SUBSYSTEMS[id]?.label).filter(Boolean);
    if (sleeping.length) parts.push('sleeping: ' + sleeping.slice(0, 3).join(', '));
    return parts.join(' · ');
  },

  _announceLimits() {
    const line = this._limitsText();
    this.notify(line, 'info');
    const zl = document.getElementById('zoom-label');
    if (zl && this.tier !== 'full') {
      zl.title = 'Slumber ' + this.tier + ' — ' + line;
    }
    ACIControl?.reply?.('Slumber · ' + line + ' · resources status · fleet list · donate on');
  },

  notify(text, kind) {
    CliRibbon?.setNotice?.(String(text || '').slice(0, 120), kind || 'info');
  },

  statusReport() {
    const awake = [];
    const sleeping = [];
    Object.entries(this.states).forEach(([id, s]) => {
      const label = this.SUBSYSTEMS[id]?.label || id;
      if (s === 'sleeping') sleeping.push(label);
      else awake.push(label + (s === 'drowsy' ? '↓' : ''));
    });
    return {
      tier: this.tier,
      label: this.TIER_LABEL[this.tier],
      fps: this._avgFps().toFixed(0),
      profile: this.profile,
      quality: this.quality,
      awake,
      sleeping,
      line: this._limitsText(),
    };
  },

  async cli(parts) {
    const cmd = String(parts?.[0] || 'status').toLowerCase();
    if (cmd === 'status' || cmd === 'info' || cmd === 'limits') {
      const r = this.statusReport();
      AciCli?.print?.('Slumber · ' + r.line, 'ok');
      AciCli?.print?.('Awake: ' + r.awake.join(', '), 'dim');
      if (r.sleeping.length) AciCli?.print?.('Sleeping: ' + r.sleeping.join(', '), 'dim');
      AciCli?.print?.('FPS ~' + r.fps + ' · tier ' + r.tier, 'dim');
      this.notify(r.line);
      return r;
    }
    if (cmd === 'wake' && parts[1]) {
      const key = parts[1].toLowerCase();
      const id = Object.keys(this.SUBSYSTEMS).find(k => k.includes(key) || this.SUBSYSTEMS[k].label.toLowerCase().includes(key));
      if (id) { this.wake(id, 'user'); AciCli?.print?.('Awake · ' + this.SUBSYSTEMS[id].label, 'ok'); }
      else AciCli?.print?.('Unknown subsystem — try shops, news, coders, presence', 'err');
      return;
    }
    if (cmd === 'sleep' && parts[1]) {
      const key = parts[1].toLowerCase();
      const id = Object.keys(this.SUBSYSTEMS).find(k => k.includes(key) || this.SUBSYSTEMS[k].label.toLowerCase().includes(key));
      if (id) { this.sleep(id, 'user'); AciCli?.print?.('Sleep · ' + this.SUBSYSTEMS[id].label, 'ok'); }
      return;
    }
    if (['full', 'balanced', 'conserve', 'slumber'].includes(cmd)) {
      this._userPinned = true;
      this.applyTier(cmd, 'you asked');
      const r = this.statusReport();
      AciCli?.print?.('Slumber mode · ' + r.label, 'ok');
      return r;
    }
    if (cmd === 'auto') {
      this._userPinned = false;
      this.applyTier(this.pickInitialTier(), 'auto');
      AciCli?.print?.('Slumber auto · ' + this.TIER_LABEL[this.tier], 'ok');
      return;
    }
    AciCli?.print?.('slumber status | wake shops | sleep news | balanced | conserve | slumber | auto', 'dim');
  },
};
window.SlumberManager = SlumberManager;
// SlumberManager.init() — deferred to _astranovBoot (avoid main-thread block during parse)

// === SPACENET RESOURCE MONITOR — FPS/RAM tier · spare capacity · donate compute ===
const SpaceNetResourceMonitor = {
  spareScore: 0,
  donating: false,
  _demandUntil: 0,
  _boostUntil: 0,
  _lastNudge: 0,
  _frames: 0,
  _inited: false,
  STORAGE_KEY: 'astranov_donate_compute',

  init() {
    if (this._inited) return;
    this._inited = true;
    try { this.donating = localStorage.getItem(this.STORAGE_KEY) === '1'; } catch (_) {}
    this._recompute();
    if (this.donating) this._enableRelay(true);
  },

  onFrame() {
    this._frames++;
    if (this._frames % 90 === 0) this._recompute();
  },

  onTierChange() {
    this._recompute();
    window.SpaceNetFleet?.touchThisDevice?.();
  },

  noteDemand(action) {
    const heavy = ['batch', 'drive', 'coders', 'order', 'commerce', 'city', 'map', 'video'];
    if (!heavy.includes(String(action || '').toLowerCase())) return;
    this._demandUntil = Date.now() + 120000;
    this._boostUntil = Date.now() + 45000;
  },

  allowsUpgrade() {
    if (Date.now() < this._demandUntil) return true;
    if (Date.now() < this._boostUntil) return true;
    const p = SlumberManager?.profile || {};
    if (p.lowEndGpu || p.slowNet) return false;
    return this.spareScore >= 55;
  },

  _recompute() {
    const sm = SlumberManager;
    if (!sm) return;
    const fps = sm._avgFps?.() || 30;
    const tier = sm.tier || 'balanced';
    const tierHead = { gaming: 0, full: 12, balanced: 28, conserve: 48, slumber: 62 }[tier] || 20;
    const fpsHead = Math.max(0, Math.min(40, (fps - 28) * 1.2));
    const idle = !window.GlobeDeck?.activeTask && !window.GlobeDeck?.thinking && !document.hidden;
    const idleBonus = idle ? 18 : 0;
    const sleeping = Object.values(sm.states || {}).filter(s => s === 'sleeping').length;
    const sleepBonus = Math.min(22, sleeping * 3);
    const donatePenalty = this.donating ? 28 : 0;
    this.spareScore = Math.round(Math.max(0, Math.min(100, tierHead + fpsHead + idleBonus + sleepBonus - donatePenalty)));
    window.CliRibbon?.render?.();
  },

  periodicCheck() {
    this._recompute();
    if (this.donating) {
      window.SpaceNetFleet?.touchThisDevice?.({ relay: true });
      return;
    }
    if (this.spareScore < 68 || !window.Auth?.user || document.hidden) return;
    const now = Date.now();
    if (now - this._lastNudge < 300000) return;
    this._lastNudge = now;
    const line = 'Spare ' + this.spareScore + '% · relay to SpaceNet mesh — say donate on';
    window.CliRibbon?.setNotice?.(line, 'info');
    if (!sessionStorage.getItem('astranov_donate_nudge')) {
      sessionStorage.setItem('astranov_donate_nudge', '1');
      window.ACIControl?.reply?.(line);
    }
  },

  _enableRelay(quiet) {
    SlumberManager?.applyTier?.('conserve', quiet ? 'donate relay' : 'donate on');
    SlumberManager?.wake?.('deferred', 'donate');
    window.SpaceNetFleet?.registerThis?.('relay', { quiet: !!quiet });
    FieldBrain?.pulse?.('fleet', 'donate relay · spare compute', { role: 'client', props: { spare: this.spareScore } });
  },

  _disableRelay() {
    window.SpaceNetFleet?.registerThis?.('worker', { quiet: true });
    if (!SlumberManager?._userPinned) SlumberManager?.applyTier?.(SlumberManager.pickInitialTier(), 'donate off');
  },

  report() {
    const sm = SlumberManager?.statusReport?.() || {};
    const p = sm.profile || {};
    const mem = p.memoryGb ? p.memoryGb + 'GB' : 'RAM n/a';
    return {
      tier: sm.tier,
      label: sm.label,
      fps: sm.fps,
      spareScore: this.spareScore,
      donating: this.donating,
      fleet: window.SpaceNetFleet?.devices?.length || 0,
      line: 'FPS ~' + sm.fps + ' · ' + sm.label + ' · spare ' + this.spareScore + '% · ' + mem
        + (this.donating ? ' · donating' : ''),
    };
  },

  async cli(parts) {
    const cmd = String(parts?.[0] || 'status').toLowerCase();
    if (cmd === 'donate') {
      const sub = String(parts?.[1] || 'status').toLowerCase();
      if (sub === 'on' || sub === 'yes' || sub === 'enable') {
        this.donating = true;
        try { localStorage.setItem(this.STORAGE_KEY, '1'); } catch (_) {}
        this._enableRelay(false);
        window.AciCli?.print?.('Donate on · relaying spare compute to SpaceNet', 'ok');
        window.CliRibbon?.setNotice?.('donating to SpaceNet', 'ready');
        return;
      }
      if (sub === 'off' || sub === 'no' || sub === 'stop') {
        this.donating = false;
        try { localStorage.removeItem(this.STORAGE_KEY); } catch (_) {}
        this._disableRelay();
        window.AciCli?.print?.('Donate off · device back to your profile only', 'ok');
        return;
      }
      window.AciCli?.print?.('donate ' + (this.donating ? 'on' : 'off') + ' · spare ' + this.spareScore + '%', 'dim');
      return;
    }
    if (cmd === 'boost' || cmd === 'full' || cmd === 'gaming') {
      this._boostUntil = Date.now() + 180000;
      const target = cmd === 'gaming' && (SlumberManager?.profile?.cores || 0) >= 6 ? 'gaming' : cmd === 'full' ? 'full' : 'balanced';
      SlumberManager._userPinned = false;
      SlumberManager.applyTier(target, 'boost requested');
      window.AciCli?.print?.('Boost · ' + SlumberManager.TIER_LABEL[SlumberManager.tier], 'ok');
      return;
    }
    const r = this.report();
    window.AciCli?.print?.(r.line, 'ok');
    if (r.spareScore >= 65 && !this.donating) {
      window.AciCli?.print?.('Spare capacity — say donate on to strengthen the SpaceNet mesh', 'dim');
    }
    window.AciCli?.print?.('resources status | boost | donate on|off · fleet list', 'dim');
    window.CliRibbon?.setNotice?.(r.line);
    return r;
  },
};
window.SpaceNetResourceMonitor = SpaceNetResourceMonitor;

// === SPACENET FLEET — old devices under your profile · relay batch work ===
const SpaceNetFleet = {
  devices: [],
  _syncTimer: null,
  _inited: false,
  STORAGE_PREFIX: 'astranov_fleet_v1:',

  _uid() {
    return window.Auth?.user?.id || 'guest';
  },

  _key() {
    return this.STORAGE_PREFIX + this._uid();
  },

  _deviceId() {
    try {
      return window.AstranovSession?.deviceId?.() || localStorage.getItem('astranov_device_id') || ('dev-' + Date.now().toString(36));
    } catch (_) {
      return 'dev-' + Date.now().toString(36);
    }
  },

  _nodeId() {
    return window.AstranovNode?.getDeviceNodeId?.() || window.AstranovNode?.nodeId || ('node-' + this._deviceId().slice(0, 12));
  },

  _platform() {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    return 'desktop';
  },

  _load() {
    try {
      const raw = localStorage.getItem(this._key());
      this.devices = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(this.devices)) this.devices = [];
    } catch (_) {
      this.devices = [];
    }
  },

  _save() {
    try { localStorage.setItem(this._key(), JSON.stringify(this.devices.slice(0, 24))); } catch (_) {}
    this.renderPanel();
  },

  init() {
    if (this._inited) return;
    this._inited = true;
    this._load();
    if (window.Auth?.client) {
      window.Auth.client.auth.onAuthStateChange((_e, session) => {
        if (session?.user) {
          this._load();
          this.registerThis('primary', { quiet: true });
        }
      });
    }
    if (window.Auth?.user) this.registerThis('primary', { quiet: true });
    clearInterval(this._syncTimer);
    this._syncTimer = setInterval(() => this.tick(), 120000);
    this.renderPanel();
  },

  registerThis(role, opts) {
    opts = opts || {};
    if (!window.Auth?.user) return null;
    this._load();
    const id = this._deviceId();
    const nodeId = this._nodeId();
    const label = (opts.label || this._platform() + ' · ' + (navigator.platform || 'device')).slice(0, 48);
    const row = {
      deviceId: id,
      nodeId,
      label,
      platform: this._platform(),
      role: role || 'worker',
      tier: SlumberManager?.tier || 'balanced',
      relay: role === 'relay',
      lastSeen: Date.now(),
      isThis: true,
    };
    const idx = this.devices.findIndex(d => d.deviceId === id);
    if (idx >= 0) this.devices[idx] = { ...this.devices[idx], ...row };
    else this.devices.unshift(row);
    this.devices = this.devices.slice(0, 24);
    this._save();
    if (!opts.quiet) {
      window.AciCli?.print?.('Fleet · ' + label + ' · ' + row.role, 'ok');
      FieldBrain?.pulse?.('fleet', 'register ' + row.role, { role: 'client', props: { node_id: nodeId, platform: row.platform } });
    }
    return row;
  },

  touchThisDevice(meta) {
    if (!window.Auth?.user) return;
    const id = this._deviceId();
    const idx = this.devices.findIndex(d => d.deviceId === id);
    if (idx < 0) { this.registerThis(meta?.relay ? 'relay' : 'worker', { quiet: true }); return; }
    this.devices[idx].lastSeen = Date.now();
    this.devices[idx].tier = SlumberManager?.tier || this.devices[idx].tier;
    if (meta?.relay != null) this.devices[idx].relay = !!meta.relay;
    this._save();
  },

  async syncFromBatch() {
    const batchId = window.AstranovNode?.batchId;
    if (!batchId || !window.AstranovNode?.api) return;
    try {
      const r = await window.AstranovNode.api({ action: 'peers', batch_id: batchId });
      if (!r.ok || !r.nodes?.length) return;
      r.nodes.forEach(n => {
        const nodeId = n.node_id;
        if (!nodeId) return;
        const existing = this.devices.find(d => d.nodeId === nodeId);
        const row = {
          deviceId: existing?.deviceId || ('peer-' + nodeId),
          nodeId,
          label: (n.props?.label || n.platform || 'node') + (n.node_id === window.AstranovNode?.nodeId ? ' · this' : ''),
          platform: n.platform || 'web',
          role: n.props?.role || 'worker',
          tier: n.props?.tier || 'balanced',
          relay: !!n.props?.relay,
          lastSeen: n.last_seen ? Date.parse(n.last_seen) : Date.now(),
          isThis: n.node_id === window.AstranovNode?.nodeId,
        };
        const idx = this.devices.findIndex(d => d.nodeId === nodeId);
        if (idx >= 0) this.devices[idx] = { ...this.devices[idx], ...row };
        else this.devices.push(row);
      });
      this.devices = this.devices.slice(0, 24);
      this._save();
    } catch (_) {}
  },

  tick() {
    if (!window.Auth?.user) return;
    this.touchThisDevice();
    void this.syncFromBatch();
  },

  renderPanel() {
    const countEl = document.getElementById('nb-fleet-count');
    const stEl = document.getElementById('nb-fleet-status');
    const live = this.devices.filter(d => Date.now() - (d.lastSeen || 0) < 86400000);
    if (countEl) countEl.textContent = String(live.length || this.devices.length);
    if (stEl) {
      const relays = live.filter(d => d.relay).length;
      stEl.textContent = relays ? relays + ' relay · ' + live.length + ' fleet' : live.length + ' under profile';
    }
  },

  listText() {
    if (!this.devices.length) return 'No fleet yet — say fleet add on each old device';
    return this.devices.slice(0, 8).map(d => {
      const age = Math.round((Date.now() - (d.lastSeen || 0)) / 60000);
      return (d.isThis ? '★ ' : '') + d.label + ' · ' + d.role + (d.relay ? ' relay' : '') + ' · ' + age + 'm';
    }).join('\n');
  },

  async cli(parts) {
    const cmd = String(parts?.[0] || 'list').toLowerCase();
    if (!window.Auth?.user) {
      window.AciCli?.print?.('Sign in (G) — then fleet add on each device', 'err');
      window.Auth?.openLoginModal?.('Fleet needs sign-in');
      return;
    }
    if (cmd === 'add' || cmd === 'register' || cmd === 'join') {
      const role = String(parts?.[1] || 'worker').toLowerCase();
      const mapped = role === 'relay' ? 'relay' : role === 'primary' ? 'primary' : 'worker';
      if (mapped === 'worker' && (SlumberManager?.profile?.lowEndGpu || SlumberManager?.tier === 'slumber')) {
        SlumberManager.applyTier('slumber', 'fleet worker');
      }
      this.registerThis(mapped);
      window.ACIControl?.reply?.('Fleet device registered — install PWA on old phones · batch links them');
      return;
    }
    if (cmd === 'sync') {
      await this.syncFromBatch();
      window.AciCli?.print?.('Fleet synced · ' + this.devices.length + ' device(s)', 'ok');
      this.renderPanel();
      return;
    }
    if (cmd === 'status') {
      const r = window.SpaceNetResourceMonitor?.report?.() || {};
      window.AciCli?.print?.('Fleet · ' + this.devices.length + ' · ' + (r.line || ''), 'ok');
      this.renderPanel();
      return;
    }
    window.AciCli?.print?.(this.listText(), 'ok');
    window.AciCli?.print?.('fleet add worker|relay | fleet sync | resources status | donate on', 'dim');
    this.renderPanel();
  },
};
window.SpaceNetFleet = SpaceNetFleet;

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

  _ensureCanvasSize() {
    if (!this._canvas) return;
    const r = this._canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(120, Math.floor(r.width * dpr));
    const h = Math.max(28, Math.floor(r.height * dpr));
    if (w !== this._canvas.width || h !== this._canvas.height) {
      this._canvas.width = w;
      this._canvas.height = h;
    }
  },

  _loop() {
    const el = document.getElementById('astranov-logo');
    const micOn = !!(isListening || window._handsFreeVoice);
    const aiOn = !!Voice?.speaking;
    if (micOn) this.setMicActive(true);
    else this.setMicActive(false);
    this.setAiActive(aiOn);
    if (el) {
      el.classList.toggle('voice-mic', micOn);
      el.classList.toggle('voice-ai', aiOn);
    }
    if (this._ctx && this._canvas) {
      this._ensureCanvasSize();
      const idle = 0.14;
      if (micOn && aiOn) {
        const micBars = this._readBars(this._micAnalyser, idle + 0.22);
        const aiBars = this._readBars(this._aiAnalyser, idle + 0.22);
        this._drawDual(micBars, aiBars);
      } else if (micOn) {
        this._draw(this._readBars(this._micAnalyser, idle + 0.28), 'rgba(255,55,55,0.95)');
      } else if (aiOn) {
        this._draw(this._readBars(this._aiAnalyser, idle + 0.28), 'rgba(0,230,110,0.95)');
      } else {
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      }
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
    GlobeDeck?.setPreview?.('Astranov SpaceNet — global earth');
    window._globeFly = null;
    window._cityDropLock = false;
    if (typeof globePivot !== 'undefined' && globePivot) {
      globePivot.rotation.y = 0;
      globePivot.rotation.x = 0.12;
      globePivot.quaternion.setFromEuler(globePivot.rotation, 'YXZ');
    }
    if (typeof camera !== 'undefined' && camera) {
      camera.position.z = ZoomTiers?.tierZ?.('global') || GlobeNavigate?.GLOBAL_Z || 3.2;
      camera.lookAt(0, 0, 0);
    }
    ZoomTiers?.goTo?.('global', true);
    CityMap?._exit?.();
    CosmicZoom?.update?.(GlobeNavigate?.GLOBAL_Z || 3.2, { tier: 'global', label: 'GLOBAL', cosmic: 'earth' });
    cityLevel = false;
    const zl = document.getElementById('zoom-label');
    if (zl && !window.DrivingView?.active) zl.textContent = 'GLOBAL';
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

// === ARCANGELO VILLAGE DIALECT — Greeklish · Cretan · ancient · English mix ===
// Stealth by default: never mirror dialect on UI/voice unless the user spoke it first.
// Private team lane for later verification / encryption — no public labels.
const ArcangeloDialect = {
  ID: 'arcangelo_village_v1',
  ACTIVATE: 34,
  TEAM: 58,

  _active: false,
  _score: 0,
  _team: false,
  _hits: 0,
  _lastAt: 0,

  _crete: [
    /\bρ[εη]?\b/i, /\bπρ[εη]?\b/i, /\bρε\b/i, /\bπρε\b/i,
    /\bτζαι\b/i, /\bτζαι\b/i, /\bσυ\b/i, /\bμαν\b/i, /\bωχ\b/i,
    /\bre\b/i, /\bpre\b/i, /\btzai\b/i, /\bsy\b/i, /\bsu\b/i,
    /\bentaxi\b/i, /\bεντάξει\b/i, /\bμαλάκα\b/i,
  ],
  _family: [
    /αξάς/i, /αξάκι/i, /αξαδίνα/i, /\baksas\b/i, /\baksaki\b/i, /\baxadina\b/i,
    /\baksako\b/i, /arcangelo/i, /archangelo/i, /arcangelos/i, /αρχάγγελ/i,
    /\bvillage\b/i, /\bχωριό\b/i,
  ],
  _ancient: [
    /[\u1F00-\u1FFF]/, /\bναί\b/i, /\bμή\b/i, /\bὦ\b/, /\bχαίρε\b/i, /\bκαίρειν\b/i,
    /\bἐγώ\b/i, /\bσύ\b/i, /\bἐστί\b/i, /\bθεοί\b/i,
    /\bchaere\b/i, /\bkairein\b/i, /\bo\s+theoi\b/i,
  ],
  _greeklish: [
    /\bela\b/i, /\bέλα\b/i, /\bti\s+thes\b/i, /\bτι\s+θες\b/i, /\bpame\b/i, /\bπάμε\b/i,
    /\bpes\s+mou\b/i, /\bπες\s+μου\b/i, /\bdouleia\b/i, /\bδουλειά\b/i,
    /\bthelo\b/i, /\bθέλω\b/i, /\bkatalava\b/i, /\bκόντ��ρ/i,
  ],
  _greek: /[\u0370-\u03FF]/,

  _stripOutbound: [
    /\b(ρε|πρε|αξάκι|αξάς|αξαδίνα|aksas|aksaki|axadina|aksako|ela\s+re|έλα\s+ρε)\b/gi,
    /\b(arcangelo|archangelo|village\s+mix)\b/gi,
    /\b(τζαι|μαν|ωχ)\b/gi,
  ],

  _routeMap: [
    [/\b(pame|πάμε)\s+(locate|me|gps|εδώ|edo)\b/i, 'locate me'],
    [/\b(pes|πες)\s+(mou|μου)\s+(.+)/i, '$3'],
    [/\b(ti\s+thes|τι\s+θες)\b/i, ''],
    [/\b(douleia|δουλειά)\b/i, 'work'],
    [/\b(konter|κόντερ|κοντερ)\b/i, 'coders'],
    [/\b(ela|έλα)\s+(re|ρε)?\s*(coders|κόντερ)\b/i, 'coders'],
  ],

  _latinGreek(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ς/g, 'σ');
  },

  _count(patterns, text) {
    let n = 0;
    for (const p of patterns) {
      if (p.test(text)) n++;
    }
    return n;
  },

  detect(raw) {
    const text = String(raw || '').trim();
    if (!text) return { score: 0, active: false, team: false, mixed: false };

    const low = text.toLowerCase();
    const norm = this._latinGreek(text);
    const hasGreek = this._greek.test(text);
    const hasLatin = /[a-z]/i.test(text);
    const mixed = hasGreek && hasLatin;

    let score = 0;
    score += this._count(this._crete, low) * 9;
    score += this._count(this._crete, norm) * 7;
    score += this._count(this._family, low) * 14;
    score += this._count(this._family, norm) * 12;
    score += this._count(this._ancient, text) * 11;
    score += this._count(this._greeklish, low) * 6;
    score += this._count(this._greeklish, norm) * 5;
    if (mixed) score += 12;
    if (/\b(el|gr|english)\b.*\b(and|kai|tzai)\b/i.test(low)) score += 8;

    const team = score >= this.TEAM || (
      this._count(this._family, low) + this._count(this._family, norm) >= 1
      && (this._count(this._crete, low) + this._count(this._greeklish, low)) >= 1
    );

    return {
      score,
      active: score >= this.ACTIVATE,
      team,
      mixed: mixed || (hasGreek && /\b[a-z]{3,}\b/i.test(low)),
    };
  },

  ingest(raw) {
    const d = this.detect(raw);
    if (d.score > 0) {
      this._hits++;
      this._lastAt = Date.now();
      if (d.score > this._score) this._score = d.score;
    }
    if (d.active) this._active = true;
    if (d.team) this._team = true;
    return d;
  },

  sessionActive() {
    return !!this._active;
  },

  teamLane() {
    return !!this._team;
  },

  mirrorAllowed() {
    return this._active && this._score >= this.ACTIVATE;
  },

  looksMixed(s) {
    const t = String(s || '');
    return this._greek.test(t) && /[a-zA-Z]{2,}/.test(t);
  },

  listenLang(draft) {
    if (window._handsFreeVoice) return 'el-GR';
    const t = String(draft || '');
    if (this.detect(t).active || this.detect(t).mixed || this._greek.test(t)) return 'el-GR';
    const g = (t.match(/[\u0370-\u03FF\u1F00-\u1FFF]/g) || []).length;
    const l = (t.match(/[a-zA-Z]/g) || []).length;
    return g >= l * 0.12 ? 'el-GR' : 'en-US';
  },

  _brandRules: [
    [/\b(άστρονοβ|αστρονοβ|άστρανοβ|αστρανοβ|αστρονόβ|αστρονόφ|αστρανόβ|αστρανόφ|αστρα\s*νοβ|αστρα\s*νοφ|astranof|astronov|astronoff|astra\s*nov|astrano\s*v|astro\s*nov|as\s*tranov|asstranov|ast\s*ranov|αστρονοφ|astronaut\s*nov)\b/gi, 'Astranov'],
    [/\b(αρχάγγελο|αρχαγγελο|αρχανγελο|arch\s*angel|archangelo?s?|αρχαντζελο|arc\s*angelo)\b/gi, 'Arcangelo'],
    [/\b(κόντερ|κοντερ|konter|counter|quarter|κοντρ|κοντρς|kontur|kontre|κόντερς|κοντερς|κοντερσ|κοντέρ)\b/gi, 'coders'],
    [/\b(counters|quarters|quarterback|κοντερσ)\b/gi, 'coders'],
    [/\b(code\s*us|code\s*her?s|call\s*her?s|corders?|cooters?|koders?|go\s*ders?)\b/gi, 'coders'],
    [/\b(pitogyro|πιτογυρο|πιτόγυρο|πιτογύρο)\b/gi, 'pitogyra'],
    [/\b(telemachus|tilemachos|tilemaxos|telmaxos|telmachos|τηλεμαχοσ|τηλεμαχός|τηλεμαχος)\b/gi, 'Telemachos'],
    [/\b(teledromus|tilestromos|τηλεδρομος|τηλεδρομός|τηλεδρομος)\b/gi, 'Teledromos'],
    [/\b(supabase\s+project|project\s+ref|supabase\s+url|supabase\s+key)\b/gi, 'Astranov'],
    [/\bsupabase\b/gi, 'Astranov'],
  ],

  _dialectRules: [
    [/\b(έλα ρε|ελα ρε|ela re|έλα ρε μαλάκα|ela re malaka)\b/gi, 'ela re'],
    [/\b(τι θες|τι θέλεις|ti thes|ti theleis)\b/gi, 'ti thes'],
    [/\b(πάμε|pame|παμε)\b/gi, 'pame'],
    [/\b(πες μου|pes mou|πες μου ρε)\b/gi, 'pes mou'],
    [/\b(αξάς|αξας|aksas|axas|αξα)\b/gi, 'aksas'],
    [/\b(αξάκι|αξακι|aksaki|αξακο)\b/gi, 'aksaki'],
    [/\b(αξαδίνα|αξαδινα|axadina)\b/gi, 'axadina'],
    [/\b(locate\s*me|λοκέιτ|λοκειτ)\b/gi, 'locate me'],
  ],

  _scrubSecrets(s) {
    return String(s || '')
      .replace(/\b[\w-]+\.supabase\.co\b/gi, 'astranov.eu')
      .replace(/\blkoatrkhuigdolnjsbie\.supabase\.co\b/gi, 'astranov.eu')
      .replace(/\blkoatrkhuigdolnjsbie\b/gi, 'astranov.eu')
      .replace(/\bfunctions\/v1\/\w+\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  repairBrands(text) {
    let s = this._scrubSecrets(text);
    if (!s) return s;
    for (const [re, rep] of this._brandRules) s = s.replace(re, rep);
    return s.replace(/\s+/g, ' ').trim();
  },

  repairOutbound(text, kind) {
    let s = String(text || '').trim();
    if (!s) return s;
    s = this.repairBrands(s);
    if (kind === 'cmd' && window.fixVoiceHotwords) s = window.fixVoiceHotwords(s);
    if (this.mirrorAllowed()) return s;
    for (const re of this._stripOutbound) s = s.replace(re, '').replace(/\s+/g, ' ').trim();
    return s;
  },

  repairTranscript(text) {
    let s = this.repairBrands(text);
    if (!s) return s;
    for (const [re, rep] of this._dialectRules) s = s.replace(re, rep);
    return s.replace(/\s+/g, ' ').trim();
  },

  normalizeForRouting(text) {
    let s = this.repairTranscript(text);
    if (!s) return s;
    this.ingest(s);
    for (const [re, rep] of this._routeMap) {
      if (re.test(s)) s = s.replace(re, rep).trim();
    }
    return s.replace(/\s+/g, ' ').trim();
  },

  sanitizeReply(text) {
    return this.repairOutbound(text, 'reply');
  },

  sanitizeUi(text) {
    return this.repairOutbound(text);
  },

  apiContext() {
    if (!this._active) return {};
    return {
      dialect_lane: this.ID,
      dialect_score: Math.min(99, Math.round(this._score)),
      dialect_team: this._team,
    };
  },

  reset() {
    this._active = false;
    this._score = 0;
    this._team = false;
    this._hits = 0;
    this._lastAt = 0;
  },
};
window.ArcangeloDialect = ArcangeloDialect;

// === ASTRANOV IDENTITY — unified login (globe + all *.astranov.eu sites) ===
const Auth = {
  client: null,
  user: null,
  session: null,
  isOwner: false,
  isArchitect: false,
  OWNER_EMAIL: 'notisastranov@gmail.com',
  OAUTH_PROVIDERS: ['google', 'facebook', 'apple', 'twitter'],
  _siteOwners: new Map(),
  _profileVisual: null,
  _authDegraded: false,
  _authBoot: true,
  _gsiReady: null,
  GOOGLE_CLIENT_ID: typeof ASTRANOV_GOOGLE_CLIENT_ID !== 'undefined' ? ASTRANOV_GOOGLE_CLIENT_ID : '',

  init() {
    if (typeof supabase === 'undefined') {
      console.warn('[Auth] Supabase SDK missing — login unavailable');
      return;
    }
    const clientUrl = typeof resolveAstranovSupabaseClientUrl === 'function'
      ? resolveAstranovSupabaseClientUrl()
      : SB_URL;
    this.client = supabase.createClient(clientUrl, SB_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'astranov_auth_v2' },
    });
    this.client.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_IN' && session?.user) {
        this.session = session;
        this.user = session.user;
        this._authDegraded = false;
        this.closeLoginModal();
        this.applyUser();
        this.refreshAuthority();
        ACIControl?.reply('Signed in · tap 🎧 talk hands-free to Astranov');
        setTimeout(() => {
          primeGrokVoice?.();
          const owner = (session.user.email || '').toLowerCase() === this.OWNER_EMAIL.toLowerCase();
          if (owner && typeof startVoiceOptions === 'function' && !window._handsFreeVoice) {
            try { startVoiceOptions(); } catch (_) {}
          }
        }, 800);
        try {
          const clean = location.pathname + (location.search || '').replace(/[?&]code=[^&]*/g, '').replace(/[?&]error=[^&]*/g, '').replace(/\?&/, '?').replace(/\?$/, '');
          if (location.search || location.hash) history.replaceState(null, '', clean || '/');
        } catch (_) {}
        return;
      }
      if (ev === 'TOKEN_REFRESHED' && session?.user) {
        this.session = session;
        this.user = session.user;
        this._authDegraded = false;
        this.applyUser();
        return;
      }
      if (!session?.user && this.user && ev !== 'SIGNED_OUT') {
        this._authDegraded = true;
        this.applyUser();
        this.ensureSession().then((s) => {
          if (s?.user) {
            this.session = s;
            this.user = s.user;
            this._authDegraded = false;
            this.applyUser();
            this.refreshAuthority();
          }
        });
        return;
      }
      this.session = session;
      this.user = session?.user || null;
      this._authDegraded = false;
      this.applyUser();
      this.refreshAuthority();
      this.broadcastToShell();
      if (this.user) this.loadProfileVisual();
    });
    this._handleOAuthReturn();
    this.client.auth.getSession().then(({ data }) => {
      this._authBoot = false;
      this.session = data?.session || null;
      this.user = data?.session?.user || null;
      this.applyUser();
      this.refreshAuthority();
      this.broadcastToShell();
      if (this.user) this.loadProfileVisual();
    });
    const btn = document.getElementById('aci-login');
    if (btn) btn.onclick = () => this.user ? this.openLoggedInProfile() : this.signInGoogle();
    this.bindAuthModal();
    this._recoverFromAuthError();
    window.addEventListener('message', e => this._onChildMessage(e));
  },

  _recoverFromAuthError() {
    const q = location.search + location.hash;
    if (!/[?&#]error=/i.test(q) && !/access.denied|invalid_client|oauth/i.test(q)) return;
    setTimeout(() => {
      this.openLoginModal('Google blocked you — use email sign-in link below');
      this._activateSignInPane();
      ACIControl?.reply('Google OAuth blocked — tap Send sign-in link');
    }, 400);
  },

  _activateSignInPane() {
    const modal = document.getElementById('astranov-auth-modal');
    if (!modal) return;
    modal.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    modal.querySelectorAll('.auth-pane').forEach(p => p.classList.remove('active'));
    const tab = modal.querySelector('[data-pane="auth-pane-signin"]');
    const pane = document.getElementById('auth-pane-signin');
    if (tab) tab.classList.add('active');
    if (pane) pane.classList.add('active');
  },

  bindAuthModal() {
    const modal = document.getElementById('astranov-auth-modal');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';
    document.getElementById('auth-close')?.addEventListener('click', () => this.closeLoginModal());
    document.getElementById('auth-signin-btn')?.addEventListener('click', () => this.signInIdentifier());
    document.getElementById('auth-signup-btn')?.addEventListener('click', () => this.signUpIdentifier());
    document.getElementById('auth-phone-btn')?.addEventListener('click', () => this.signInPhoneOtp());
    document.getElementById('auth-google-continue')?.addEventListener('click', () => this.continueWithGoogle());
    document.getElementById('auth-google-fallback')?.addEventListener('click', () => this._signInGoogleRedirect());
    document.getElementById('auth-email-link')?.addEventListener('click', () => this.sendMagicLink());
    document.getElementById('auth-email-quick')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.sendMagicLink(); }
    });
    document.getElementById('auth-oauth-help')?.addEventListener('click', (e) => {
      e.preventDefault();
      const status = document.getElementById('auth-status');
      if (status) status.textContent = 'Use the blue Google button above — or email sign-in link below';
      ACIControl?.reply('Google sign-in help — email link always works');
    });
    modal.querySelectorAll('[data-oauth]').forEach(btn => {
      btn.addEventListener('click', () => this.signInOAuth(btn.dataset.oauth));
    });
    // Redirect OAuth only — GSI needs GCP JS origins per host and fails on astranov.eu
    modal.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        modal.querySelectorAll('.auth-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const pane = document.getElementById(tab.dataset.pane);
        if (pane) pane.classList.add('active');
      });
    });
  },

  async openLoggedInProfile() {
    if (!this.user) return this.openLoginModal();
    Responsive3D?.visualReact?.('profile', {});
    GlobeDeck?.expand?.('Your profile · 3D');
    const name = this._profileVisual?.display_name
      || this.user.user_metadata?.full_name
      || (this.user.email || '').split('@')[0]
      || 'You';
    const flyToMe = (lat, lng) => {
      if (lat == null || lng == null) return;
      GlobeEntity?.syncMe?.(lat, lng, name, { alwaysShow: true });
      const fp = latLngToPos(lat, lng, 1.04);
      const z = GlobeControl?.Z?.national || 1.82;
      const dur = GlobeControl?.flyDuration?.(camera?.position?.z, z) || 2200;
      flyToPoint?.(new THREE.Vector3(fp.x, fp.y, fp.z), z, { dur });
      GlobeControl?.noteAutoFly?.();
      MapDepict?.pulse?.(lat, lng, 0x49b7ff, name, 8000);
      ACIControl?.reply('Flying to you · ' + lat.toFixed(2) + ', ' + lng.toFixed(2));
    };
    const openProfile = (skipFly) => {
      if (!skipFly && window._lastPos) flyToMe(window._lastPos.lat, window._lastPos.lng);
      ProfileSite?.openSelf?.();
    };
    if (!navigator.geolocation) {
      openProfile(false);
      return;
    }
    GlobeDeck?.setMapStatus?.('Locating…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        placeMe(pos.coords.latitude, pos.coords.longitude, { fly: true, zoom: GlobeControl?.Z?.national || 1.82 });
        openProfile(true);
      },
      () => openProfile(false),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  },

  publicOrigin() {
    return typeof astranovPublicOrigin === 'function' ? astranovPublicOrigin() : (location.origin || 'https://astranov.eu');
  },

  _useGoogleRedirectOnly() {
    try {
      const host = location.hostname || '';
      return host === 'astranov.eu' || host.endsWith('.astranov.eu');
    } catch (_) {
      return true;
    }
  },

  _oauthRedirectTo() {
    try {
      const url = new URL(window.location.href);
      ['code', 'error', 'error_description', 'error_code'].forEach((k) => url.searchParams.delete(k));
      url.hash = '';
      return url.origin + url.pathname + (url.search || '');
    } catch (_) {
      return this.publicOrigin() + '/';
    }
  },

  async _handleOAuthReturn() {
    if (!this.client) return;
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const err = params.get('error') || params.get('error_description');
    if (err) return;
    if (!code) return;
    const status = document.getElementById('auth-status');
    if (status) status.textContent = 'Completing Google sign-in…';
    GlobeDeck?.setPreview?.('Signing in…');
    try {
      const { error } = await this.client.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } catch (e) {
      const msg = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(e.message) : (e.message || e);
      this.openLoginModal('Google sign-in failed — ' + msg);
      ACIControl?.reply('Google sign-in failed — try email link below');
    }
  },

  openLoginModal(hint) {
    const modal = document.getElementById('astranov-auth-modal');
    if (!modal) return;
    const status = document.getElementById('auth-status');
    const origin = this.publicOrigin();
    const originEl = document.getElementById('auth-origin-url');
    if (originEl) originEl.textContent = origin;
    const inline = document.getElementById('auth-origin-inline');
    if (inline) inline.textContent = origin.replace(/^https?:\/\//, '');
    modal.classList.add('open');
    this._activateSignInPane();
    this._mountGoogleButton();
    const emailQuick = document.getElementById('auth-email-quick');
    if (emailQuick && !emailQuick.value) {
      emailQuick.placeholder = this.OWNER_EMAIL;
    }
    if (status) {
      status.textContent = hint || 'Tap Continue with Google — Google shows Astranov, not a random code';
    }
    GlobeDeck?.expand?.('Sign in · Google or email');
    if (!hint) ACIControl?.reply('Sign in — Google shows Astranov');
  },

  closeLoginModal() {
    document.getElementById('astranov-auth-modal')?.classList.remove('open');
  },

  _isMobileClient() {
    try {
      if (navigator.maxTouchPoints > 1 && window.innerWidth < 1024) return true;
      return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    } catch (_) {
      return false;
    }
  },

  _gsiInitialized: false,

  _ensureGoogleGsi() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (this._gsiReady) return this._gsiReady;
    this._gsiReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Google sign-in script failed'));
      document.head.appendChild(s);
    });
    return this._gsiReady;
  },

  _renderGoogleButton(host) {
    if (!host || !window.google?.accounts?.id) return;
    host.innerHTML = '';
    window.google.accounts.id.renderButton(host, {
      type: 'standard',
      theme: 'filled_blue',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: Math.min(320, host.clientWidth || 280),
    });
  },

  _mountGoogleButton() {
    const host = document.getElementById('auth-google-btn');
    if (!host) return;
    this._ensureGoogleGsi().then(() => {
      if (!this.GOOGLE_CLIENT_ID) return;
      this._initGoogleCredential();
      this._renderGoogleButton(host);
    }).catch(() => {});
  },

  _initGoogleCredential() {
    if (this._gsiInitialized || !window.google?.accounts?.id || !this.GOOGLE_CLIENT_ID) return;
    this._gsiInitialized = true;
    const origin = this.publicOrigin();
    window.google.accounts.id.initialize({
      client_id: this.GOOGLE_CLIENT_ID,
      callback: async (resp) => {
        const status = document.getElementById('auth-status');
        try {
          if (!resp?.credential) throw new Error('Google sign-in cancelled');
          if (status) status.textContent = 'Signing in…';
          const { data, error } = await this.client.auth.signInWithIdToken({
            provider: 'google',
            token: resp.credential,
          });
          if (error) throw error;
          this.closeLoginModal();
          ACIControl?.reply('Signed in at ' + origin);
          return data;
        } catch (e) {
          const msg = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(e.message) : (e.message || e);
          if (/invalid_client|no registered origin|401/i.test(msg)) {
            if (status) status.textContent = 'Google button blocked — use email sign-in link below';
          }
          if (status) status.textContent = msg;
          ACIControl?.reply('Google sign-in failed — ' + msg);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true,
    });
  },

  async continueWithGoogle() {
    if (!this.client) return;
    const status = document.getElementById('auth-status');
    try {
      await this._ensureGoogleGsi();
      if (this.GOOGLE_CLIENT_ID && window.google?.accounts?.id) {
        this._initGoogleCredential();
        this._mountGoogleButton();
        if (status) status.textContent = 'Choose your Google account — screen should say Astranov';
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            if (status) status.textContent = 'Tap the blue Google button — or use email link below';
          }
        });
        return;
      }
    } catch (_) {}
    if (status) status.textContent = 'Google sign-in loading failed — use email link or alternate sign-in';
    ACIControl?.reply('Google sign-in unavailable — email link works');
  },

  async sendMagicLink() {
    if (!this.client) return;
    const status = document.getElementById('auth-status');
    const emailEl = document.getElementById('auth-email-quick');
    let email = this._normalizeId(emailEl?.value || document.getElementById('auth-identifier')?.value);
    if (!email || !email.includes('@')) {
      email = this.OWNER_EMAIL;
      if (emailEl) emailEl.value = email;
    }
    try {
      if (status) status.textContent = 'Sending link to ' + email + '…';
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await this.client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) throw error;
      if (status) status.textContent = '✓ Link sent to ' + email + ' — open Gmail on THIS phone · check spam · tap Astranov link';
      ACIControl?.reply('Email sent — open inbox on this phone');
    } catch (e) {
      const msg = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(e.message) : (e.message || e);
      if (status) status.textContent = msg;
      ACIControl?.reply('Email sign-in failed — ' + msg);
    }
  },

  async signInGoogle() {
    if (!this.client) return;
    const origin = this.publicOrigin();
    GlobeDeck?.setPreview?.('Sign in · ' + origin);
    this.openLoginModal('Sign in with Google — Astranov on Google\'s screen');
    return this.continueWithGoogle();
  },

  async _signInGoogleRedirect() {
    if (!this.client) return;
    const origin = this.publicOrigin();
    const status = document.getElementById('auth-status');
    if (status) status.textContent = 'Alternate sign-in — if Google shows a strange code, cancel and use email link';
    GlobeDeck?.setPreview?.('Sign in · ' + origin);
    ACIControl?.reply('Alternate Google sign-in — email link is safer');
    const redirectTo = this._oauthRedirectTo();
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        scopes: 'email profile',
        queryParams: { prompt: 'select_account', access_type: 'offline' },
        skipBrowserRedirect: false,
      },
    });
    if (error) {
      const msg = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(error.message) : error.message;
      this.openLoginModal('Google sign-in failed — ' + msg);
      ACIControl?.reply('Google failed — use email sign-in link');
      throw error;
    }
    if (data?.url) window.location.assign(data.url);
  },

  async signInOAuth(provider) {
    if (!this.client) return;
    if (provider === 'google') return this.continueWithGoogle();
    if (provider === 'tiktok') {
      ACIControl?.reply('TikTok login — enable custom OIDC in Supabase, then wire provider tiktok.');
      return;
    }
    if (!this.OAUTH_PROVIDERS.includes(provider)) return;
    this.closeLoginModal();
    const origin = this.publicOrigin();
    GlobeDeck?.setPreview?.('Sign in · ' + origin);
    ACIControl?.reply('Sign in at ' + origin + ' with ' + provider);
    const redirectTo = this._oauthRedirectTo();
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        scopes: provider === 'facebook' ? 'email profile' : undefined,
      },
    });
    if (data?.url) window.location.assign(data.url);
    if (error) throw error;
  },

  _normalizeId(raw) {
    return String(raw || '').trim();
  },

  _emailForUsername(username) {
    return username.toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@users.astranov.eu';
  },

  async signInIdentifier() {
    if (!this.client) return;
    const id = this._normalizeId(document.getElementById('auth-identifier')?.value);
    const password = document.getElementById('auth-password')?.value || '';
    const status = document.getElementById('auth-status');
    if (!id) { if (status) status.textContent = 'Enter email, phone, or username.'; return; }
    try {
      if (/^\+?[\d][\d\s\-()]{7,}$/.test(id)) {
        const { error } = await this.client.auth.signInWithOtp({ phone: id.replace(/\s/g, '') });
        if (error) throw error;
        if (status) status.textContent = 'SMS code sent — enter it when prompted.';
        return;
      }
      const email = id.includes('@') ? id : this._emailForUsername(id);
      if (!password) {
        const { error } = await this.client.auth.signInWithOtp({ email });
        if (error) throw error;
        if (status) status.textContent = 'Magic link sent to ' + email;
        return;
      }
      const { error } = await this.client.auth.signInWithPassword({ email, password });
      if (error && !id.includes('@')) {
        const { error: e2 } = await this.client.auth.signInWithPassword({ email: id, password });
        if (e2) throw error;
      } else if (error) throw error;
      this.closeLoginModal();
      ACIControl?.reply('Signed in — Astranov Identity active');
    } catch (e) {
      if (status) status.textContent = typeof scrubSupabaseLeak === 'function' ? scrubSupabaseLeak(e.message) : (e.message || 'Sign in failed');
    }
  },

  async signUpIdentifier() {
    if (!this.client) return;
    const id = this._normalizeId(document.getElementById('auth-identifier')?.value);
    const password = document.getElementById('auth-password')?.value || '';
    const status = document.getElementById('auth-status');
    if (!id || password.length < 6) {
      if (status) status.textContent = 'Username/email + password (6+ chars) required.';
      return;
    }
    const email = id.includes('@') ? id : this._emailForUsername(id);
    try {
      const { error } = await this.client.auth.signUp({
        email,
        password,
        options: { data: { username: id.includes('@') ? id.split('@')[0] : id, display_name: id } }
      });
      if (error) throw error;
      if (status) status.textContent = 'Account created — check email if confirmation is on.';
      this.closeLoginModal();
    } catch (e) {
      if (status) status.textContent = e.message || 'Sign up failed';
    }
  },

  async signInPhoneOtp() {
    if (!this.client) return;
    const phone = this._normalizeId(document.getElementById('auth-phone')?.value).replace(/\s/g, '');
    const code = this._normalizeId(document.getElementById('auth-otp')?.value);
    const status = document.getElementById('auth-status');
    if (!phone) { if (status) status.textContent = 'Enter phone with country code e.g. +3069…'; return; }
    try {
      if (!code) {
        const { error } = await this.client.auth.signInWithOtp({ phone });
        if (error) throw error;
        if (status) status.textContent = 'Code sent — enter OTP and tap Verify.';
        return;
      }
      const { error } = await this.client.auth.verifyOtp({ phone, token: code, type: 'sms' });
      if (error) throw error;
      this.closeLoginModal();
      ACIControl?.reply('Phone verified — signed in');
    } catch (e) {
      if (status) status.textContent = e.message || 'Phone sign-in failed';
    }
  },

  async whenReady() {
    return this.ensureSession();
  },

  async ensureSession() {
    if (!this.client) return null;
    if (this.session?.access_token) {
      const exp = this.session.expires_at ? this.session.expires_at * 1000 : 0;
      if (!exp || exp >= Date.now() + 120000) return this.session;
    }
    const { data } = await this.client.auth.getSession();
    let session = data?.session || null;
    if (!session?.access_token) return null;
    const exp = session.expires_at ? session.expires_at * 1000 : 0;
    if (exp && exp < Date.now() + 120000) {
      const { data: refreshed, error } = await this.client.auth.refreshSession();
      if (!error && refreshed?.session) {
        session = refreshed.session;
        this._authDegraded = false;
      } else if (this.user) {
        this._authDegraded = true;
        this.applyUser();
      }
    }
    this.session = session;
    return session;
  },

  async loadProfileVisual() {
    if (!this.client || !this.user?.id) return;
    try {
      const { data } = await this.client.from('profiles')
        .select('display_name, avatar_emoji, profile_page')
        .eq('id', this.user.id)
        .maybeSingle();
      if (data) {
        this._profileVisual = data;
        this._profilePage = (data.profile_page && typeof data.profile_page === 'object') ? data.profile_page : {};
        this.applyUser();
        MapPins?.syncGlobe?.();
      }
    } catch (_) {}
  },

  async authHeaders() {
    const h = { 'Content-Type': 'application/json', apikey: SB_KEY };
    let token = this.session?.access_token;
    if (!token) {
      const session = await this.ensureSession();
      token = session?.access_token;
    }
    h.Authorization = token ? 'Bearer ' + token : 'Bearer ' + SB_KEY;
    return h;
  },

  handoffPayload() {
    const s = this.session;
    if (!s?.access_token) return null;
    return {
      type: 'astranov-auth',
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at,
      user: {
        id: this.user?.id,
        email: this.user?.email,
        name: this.user?.user_metadata?.full_name || this.user?.user_metadata?.name,
        avatar: this.user?.user_metadata?.avatar_url || this.user?.user_metadata?.picture,
      }
    };
  },

  broadcastToShell() {
    const frame = document.getElementById('as-shell-frame');
    const payload = this.handoffPayload();
    if (frame?.contentWindow && payload) {
      try { frame.contentWindow.postMessage(payload, '*'); } catch { /* */ }
    }
  },

  _onChildMessage(e) {
    if (!e.data || e.data.type !== 'astranov-auth-request') return;
    const ok = !e.origin || e.origin.endsWith('.astranov.eu') || e.origin === 'https://astranov.eu';
    if (!ok) return;
    const payload = this.handoffPayload();
    if (payload && e.source) {
      const target = (e.origin && e.origin.startsWith('http')) ? e.origin : '*';
      try { e.source.postMessage(payload, target); } catch (_) {
        try { e.source.postMessage(payload, '*'); } catch (_2) {}
      }
    }
  },

  async isSiteOwner(siteId) {
    if (!this.user?.id || !siteId) return false;
    if (this._siteOwners.has(siteId)) return this._siteOwners.get(siteId);
    try {
      const headers = await this.authHeaders();
      const r = await fetch(SB_URL + '/rest/v1/booker_sites?select=owner_id&id=eq.' + encodeURIComponent(siteId) + '&limit=1', { headers });
      const rows = r.ok ? await r.json() : [];
      const ok = rows[0]?.owner_id === this.user.id;
      this._siteOwners.set(siteId, ok);
      return ok;
    } catch { return false; }
  },

  async refreshAuthority() {
    if (!this.user) {
      this.isOwner = false;
      this.isArchitect = false;
      this.updateOwnerUI();
      return;
    }
    const email = (this.user.email || '').toLowerCase();
    this.isArchitect = email === this.OWNER_EMAIL;
    try {
      const r = await fetch(ACI.url + '/functions/v1/aci', {
        method: 'POST',
        headers: await this.authHeaders(),
        body: JSON.stringify({ mode: 'owner_sync' })
      }).then(res => res.json());
      this.isOwner = !!(r.is_owner || r.is_architect);
      if (this.isOwner) {
        window._aciOwner = true;
        ACI?.feed('owner-sync', email);
      }
    } catch (_) {
      if (this.client) {
        const { data: prof } = await this.client.from('profiles').select('is_owner').eq('id', this.user.id).single();
        this.isOwner = prof?.is_owner === true || this.isArchitect;
      }
    }
    this.updateOwnerUI();
    if (window.FieldBrain) FieldBrain.onAuth();
    if (window.AciCli) AciCli.onAuthChange();
    MapPins?.init?.();
    MapPins?.loadFromProfile?.();
    this.loadProfileVisual();
    ContextTruth?.syncAuth?.();
    if (this.user) {
      const pos = window._lastPos;
      if (pos?.lat != null) {
        void window.AstranovCityShop?.placeForUser?.(pos.lat, pos.lng);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (p) => void window.AstranovCityShop?.placeForUser?.(p.coords.latitude, p.coords.longitude),
          () => {},
          { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
        );
      }
      void window.AvcBalance?.refresh?.();
    } else {
      window.AvcBalance?.refresh?.({ guest: true });
    }
  },

  updateOwnerUI() {
    const chip = document.getElementById('user-chip');
    if (this.isOwner && chip) {
      chip.textContent = 'ASTRANOV · OWNER';
      chip.style.color = '#00dd77';
    }
    if (this.isOwner) CliRibbon?.setActive?.('owner');
    const prompt = document.getElementById('aci-cli-prompt');
    if (prompt && this.isOwner) prompt.textContent = 'ASTRANOV@collective $';
  },

  async signOut() {
    if (!this.client) return;
    await AstranovPresence?.leave?.();
    await this.client.auth.signOut();
    this.user = null;
    this.session = null;
    this.isOwner = false;
    this.isArchitect = false;
    this._siteOwners.clear();
    window._aciOwner = false;
    this.applyUser();
    this.updateOwnerUI();
    this.broadcastToShell();
    ArcangeloDialect?.reset?.();
    if (Voice.maySpeak()) speak('Signed out.', () => {}, true);
  },

  applyUser() {
    const btn = document.getElementById('aci-login');
    const chip = document.getElementById('user-chip');
    if (this.user) {
      const isOwner = AstranovSession?.isAstranov?.()
        || this.isOwner || this.isArchitect
        || (this.user.email || '').toLowerCase() === this.OWNER_EMAIL.toLowerCase();
      const name = isOwner ? 'ASTRANOV' : (
        this._profileVisual?.display_name
        || this.user.user_metadata?.full_name
        || this.user.user_metadata?.name
        || (this.user.email || '').split('@')[0]
        || 'User'
      );
      const avatar = this.user.user_metadata?.avatar_url
        || this.user.user_metadata?.picture;
      const emoji = this._profileVisual?.avatar_emoji;
      if (btn) {
        btn.classList.remove('auth-out', 'auth-boot');
        btn.classList.add(this._authDegraded ? 'auth-degraded' : 'auth-in');
        btn.dataset.auth = this._authDegraded ? 'degraded' : 'in';
        btn.title = (this._authDegraded ? 'Session refreshing · ' : 'Signed in · ') + name + ' — tap to fly to you & edit profile';
        btn.style.backgroundSize = 'cover';
        btn.style.backgroundPosition = 'center';
        if (avatar) {
          btn.style.backgroundImage = 'url(' + avatar + ')';
          btn.textContent = '';
        } else if (emoji) {
          btn.style.backgroundImage = '';
          btn.textContent = emoji;
          btn.style.fontSize = '18px';
        } else {
          btn.textContent = name.charAt(0).toUpperCase();
          btn.style.backgroundImage = '';
          btn.style.fontSize = '13px';
        }
      }
      if (chip && !this.isOwner) {
        chip.textContent = name + (this._authDegraded ? ' · ⟳' : ' �� ●');
        chip.style.color = this._authDegraded ? '#ffaa44' : '';
      }
      AstranovSession?._applyIdentity?.();
      if (typeof me !== 'undefined' && me) {
        me.name = name;
        me.id = this.user.id;
        me.email = this.user.email;
        me.isOwner = this.isOwner;
        me.isGuest = false;
      }
      AstranovSession?.onAuth?.();
      AstranovPresence?.join?.();
      ACI?.feed('login', name);
      void window.AvcBalance?.refresh?.();
      if (window.AciCli) AciCli.onAuthChange();
      FieldBrain?.updateChip?.();
      CliRibbon?.render?.();
      ContextTruth?.syncAuth?.();
    } else {
      if (btn) {
        btn.classList.remove('auth-in', 'auth-degraded');
        btn.classList.add(this._authBoot ? 'auth-boot' : 'auth-out');
        btn.dataset.auth = 'out';
        btn.title = 'Sign in at astranov.eu — Google · email · phone';
        btn.textContent = 'G';
        btn.style.backgroundImage = '';
        btn.style.fontSize = '13px';
      }
      if (chip) {
        chip.textContent = '';
        chip.style.color = '';
      }
      if (window.AciCli) AciCli.onAuthChange();
      window.AvcBalance?.refresh?.({ guest: true });
      CliRibbon?.render?.();
      ContextTruth?.syncAuth?.();
    }
  }
};
window.Auth = Auth;

// === GLOBE DECK — one scrollable window over the globe ===
const GlobeDeck = {
  expanded: false,
  activeTask: null,
  thinking: false,
  _size: 'collapsed',
  _touchY: 0,
  _touchT: 0,
  _collapseTimer: null,
  _thinkLine: null,
  _composeLine: null,
  _lastSay: '',
  _lastSayT: 0,
  _userEngaged: false,
  _expandAt: 0,
  _handleDrag: 0,
  _lastResizeDrag: 0,
  _freeHeight: 0,
  _HEIGHT_KEY: 'astranov-deck-height',
  _scrollTouch: false,
  _NOISE_RE: /^(thinking|warming|owner-sync|heartbeat|field_pulse|subscribe|channel joined|token refresh|postgres_changes|Map live|Ghost route|hands-free on|Coders always|session held|pull failed)/i,

  _taskPulseState(task) {
    const map = {
      coders: 'coders', commerce: 'commerce', batch: 'batch', radio: 'radio',
      drive: 'drive', phone: 'phone', chats: 'chats', add: 'add', video: 'add',
      telemachos: 'drive', game: 'coders', site: 'active', cli: 'active',
    };
    return map[task] || (task ? 'active' : 'idle');
  },

  syncCliPulse() {
    const d = this.deck();
    if (!d) return;
    let state = 'idle';
    if (this._pulseOverride) {
      state = this._pulseOverride;
    } else if (CliRibbon?._kind === 'err') {
      state = 'error';
    } else if (sessionHeld || SessionHold?.isHeld?.()) {
      state = 'hold';
    } else if (Voice?.speaking) {
      state = 'speaking';
    } else if (isListening || window._handsFreeVoice) {
      state = 'listening';
    } else if (this.thinking) {
      state = 'thinking';
    } else if (this.activeTask) {
      state = this._taskPulseState(this.activeTask);
    } else if (CliRibbon?._kind === 'ready') {
      state = 'ready';
    }
    if (d.dataset.cliState !== state) d.dataset.cliState = state;
  },

  init() {
    CliRibbon?.init?.();
    AppShortcuts?.init?.();
    this._restoreHeight();
    this.bindDeckResize();
    this.bindDeckGestures();
    ['sat-radio', 'node-batch', 'vendor-menu', 'globe-youtube', 'globe-super-add', 'globe-site-browser', 'cli-hub-panel'].forEach(id => {
      const el = document.getElementById(id);
      const stage = document.getElementById('globe-deck-stage');
      if (el && stage && el.parentElement !== stage) stage.appendChild(el);
    });
    CliRibbon?.setActive?.('CLI');
    if (this._size === 'free' && this._freeHeight) this.applySize();
    this.syncCliPulse();
    if (!this._pulseLoop) {
      this._pulseLoop = setInterval(() => this.syncCliPulse(), 900);
    }
    SpaceNetLoader?.stage?.('cli', SpaceNetMission?.LOADER?.cli || 'Your line into SpaceNet');
  },

  _deckMinH() { return 176; },
  _deckMaxH() { return Math.min(window.innerHeight * 0.94, window.innerHeight - 36); },

  _deckInteractive(target) {
    return target?.closest?.('button, input, textarea, select, form, a, [contenteditable], #aci-cli-form, label');
  },

  _deckCanScroll(el, fingerDy) {
    if (!el) return false;
    const max = el.scrollHeight - el.clientHeight;
    if (max < 4) return false;
    if (fingerDy < 0 && el.scrollTop > 0) return true;
    if (fingerDy > 0 && el.scrollTop < max - 1) return true;
    return false;
  },

  bindDeckResize() {
    const deck = this.deck();
    if (!deck || deck._resizeBound) return;
    deck._resizeBound = true;
    let active = false;
    let resizing = false;
    let sy = 0;
    let sh = 0;
    let moved = 0;
    let scrollEl = null;

    const applyHeight = (nh) => {
      const d = this.deck();
      if (!d) return;
      nh = Math.min(this._deckMaxH(), Math.max(this._deckMinH(), nh));
      d.style.maxHeight = nh + 'px';
      d.style.minHeight = nh + 'px';
      d.classList.remove('collapsed', 'size-third', 'size-full');
      d.classList.add('expanded', 'deck-resizing');
      this.expanded = nh > 168;
      this._size = 'free';
      if (window.AciCli) AciCli.open = this.expanded;
    };

    const finish = () => {
      const d = this.deck();
      if (!d) return;
      d.classList.remove('deck-resizing');
      if (resizing || moved > 10) {
        this._lastResizeDrag = Date.now();
        const h = d.getBoundingClientRect().height;
        if (h < 168) this._size = 'collapsed';
        else { this._size = 'free'; this._saveHeight(h); }
        this.applySize();
      }
      active = false;
      resizing = false;
      scrollEl = null;
      moved = 0;
    };

    const onMove = (clientY, e) => {
      if (!active) return;
      const dy = sy - clientY;
      moved = Math.max(moved, Math.abs(dy));
      if (!resizing && scrollEl && this._deckCanScroll(scrollEl, dy) && moved < 28) return;
      if (moved < 6) return;
      resizing = true;
      if (e?.cancelable) e.preventDefault();
      applyHeight(sh + dy);
    };

    const onStart = (clientY, target) => {
      if (this._deckInteractive(target)) return;
      scrollEl = target?.closest?.('#globe-deck-log, #globe-deck-stage');
      active = true;
      resizing = false;
      sy = clientY;
      sh = deck.getBoundingClientRect().height;
      moved = 0;
    };

    deck.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      onStart(e.touches[0].clientY, e.target);
    }, { passive: true });

    deck.addEventListener('touchmove', (e) => {
      if (!active || e.touches.length !== 1) return;
      onMove(e.touches[0].clientY, e);
    }, { passive: false });

    deck.addEventListener('touchend', () => finish(), { passive: true });
    deck.addEventListener('touchcancel', () => finish(), { passive: true });

    deck.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this._deckInteractive(e.target)) return;
      onStart(e.clientY, e.target);
    });

    window.addEventListener('mousemove', (e) => {
      if (!active) return;
      onMove(e.clientY, e);
    });

    window.addEventListener('mouseup', () => {
      if (!active) return;
      finish();
    });
  },

  _isMobileDeck() {
    try {
      return (navigator.maxTouchPoints > 0 && window.innerWidth < 900)
        || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    } catch (_) {
      return window.innerWidth < 900;
    }
  },

  _mobileDeckCap() {
    return Math.min(Math.round(window.innerHeight * 0.38), 320);
  },

  _restoreHeight() {
    try {
      const h = parseInt(localStorage.getItem(this._HEIGHT_KEY), 10);
      const maxH = this._isMobileDeck() ? this._mobileDeckCap() : Math.min(window.innerHeight * 0.94, window.innerHeight - 36);
      if (h >= 176 && h <= maxH) {
        this._freeHeight = Math.min(h, maxH);
      }
    } catch (_) { /* */ }
    this._size = 'collapsed';
    this.expanded = false;
  },

  _saveHeight(h) {
    this._freeHeight = Math.round(h);
    try { localStorage.setItem(this._HEIGHT_KEY, String(this._freeHeight)); } catch (_) { /* */ }
  },

  cycleSize() {
    const order = ['collapsed', 'third', 'full'];
    const i = order.indexOf(this._size);
    this._size = order[(i + 1) % order.length];
    this.applySize();
  },

  applySize() {
    const d = this.deck();
    if (!d) return;
    d.style.maxHeight = '';
    d.style.minHeight = '';
    d.classList.remove('collapsed', 'expanded', 'size-third', 'size-full', 'size-free');
    if (this._size === 'collapsed') {
      d.classList.add('collapsed');
      this.expanded = false;
      if (window.AciCli) AciCli.open = false;
    } else if (this._size === 'free' && this._freeHeight) {
      d.classList.add('expanded', 'size-free');
      d.style.maxHeight = this._freeHeight + 'px';
      d.style.minHeight = this._freeHeight + 'px';
      this.expanded = true;
      if (window.AciCli) AciCli.open = true;
    } else {
      d.classList.add('expanded', this._size === 'full' ? 'size-full' : 'size-third');
      this.expanded = true;
      if (window.AciCli) AciCli.open = true;
    }
    CliRibbon?.render?.();
    this.syncCliPulse();
  },

  bindDeckGestures() {
    /* scroll lives in log/stage via touch-action:pan-y; resize is bindDeckResize on whole deck */
  },

  deck() { return document.getElementById('globe-deck'); },
  logEl() { return document.getElementById('globe-deck-log'); },

  setTitle(text) {
    CliRibbon?.setActive?.(text || CliRibbon?.TASK_LABEL?.[this.activeTask] || 'CLI');
  },

  _repairLine(text, kind) {
    return ArcangeloDialect?.repairOutbound?.(text, kind) ?? String(text || '');
  },

  setPreview(text) {
    const s = this._repairLine(text, 'out').slice(0, 120);
    if (s && CliRibbon?.isGlobeHint?.(s)) return;
    if (s) CliRibbon?.setNotice?.(s);
    else CliRibbon?.clearNotice?.();
    if (!this.expanded && s) this.deck()?.classList.add('has-preview');
    else if (!s) this.deck()?.classList.remove('has-preview');
  },

  setMapStatus(text) {
    const s = this._repairLine(text, 'map');
    if (!s || CliRibbon?.isGlobeHint?.(s)) return;
    this.setPreview(s);
  },

  shouldLog(text, kind) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (CliRibbon?.isGlobeHint?.(t)) return false;
    if (kind !== 'reply' && kind !== 'ok' && kind !== 'out' && kind !== 'err' && kind !== 'cmd' && CliRibbon?.MOTTO_RE?.test(t)) return false;
    if (this._NOISE_RE.test(t)) return false;
    if (kind === 'dim' && /^(◎|…|\.{2,})\s/.test(t) && t.length < 90) return false;
    if (/^\{.*\}$/.test(t) || /^HTTP \d/.test(t)) return false;
    return true;
  },

  setCompose(text) {
    const t = String(text || '');
    if (this._composeLine?.parentNode) this._composeLine.remove();
    this._composeLine = null;
    const input = document.getElementById('aci-cli-in');
    if (!input) return;
    if (t && document.activeElement !== input && !input.value) {
      input.value = t;
      if (window.AciCli) AciCli.buffer = t;
    }
    window.resizeCliInput?.(input);
  },

  clearCompose() {
    this.setCompose('');
    const input = document.getElementById('aci-cli-in');
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }
    if (window.AciCli) AciCli.buffer = '';
  },

  log(text, cls) {
    const kind = cls || 'out';
    const repaired = this._repairLine(text, kind);
    if (kind === 'map') {
      this.setMapStatus(repaired);
      return;
    }
    if (!this.shouldLog(repaired, kind)) return;
    const out = this.logEl();
    if (!out) return;
    if (kind === 'dim') {
      if (this._thinkLine?.parentNode) {
        this._thinkLine.textContent = repaired;
        return;
      }
      const el = document.createElement('div');
      el.className = 'deck-line deck-dim';
      el.textContent = repaired;
      out.appendChild(el);
      while (out.children.length > 48) out.removeChild(out.firstChild);
      out.scrollTop = out.scrollHeight;
      return;
    }
    const key = kind + ':' + repaired.slice(0, 100);
    const now = Date.now();
    if (this._lastSay === key && now - this._lastSayT < 5000) return;
    this._lastSay = key;
    this._lastSayT = now;
    if (kind === 'cmd' || kind === 'err') this.expand();
    else if (this._userEngaged && this.expanded && (kind === 'reply' || kind === 'out' || kind === 'ok')) { /* stay open */ }
    const row = document.createElement('div');
    row.className = 'deck-line deck-' + kind;
    row.textContent = repaired;
    out.appendChild(row);
    while (out.children.length > 48) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
    if (kind === 'reply' || kind === 'out' || kind === 'ok') {
      this._userEngaged = true;
      this.setPreview(repaired);
      CliRibbon?.setNotice?.(repaired.slice(0, 120), 'ready');
      const prev = document.getElementById('globe-deck-preview');
      if (prev) prev.textContent = repaired.slice(0, 120);
      if (!this.expanded && this._isMobileDeck()) {
        this.deck()?.classList.add('has-preview');
        this.ping();
      }
    }
    if (kind === 'err') CliRibbon?.setNotice?.(repaired, 'err');
    if (this._userEngaged && (kind === 'reply' || kind === 'out' || kind === 'err')) this.ping();
    if (kind !== 'dim' && kind !== 'map') window.CliHub?.queueLine?.(repaired, kind);
  },

  say(text, cls) {
    this.log(text, cls || 'out');
  },

  onUserMessage(title) {
    this._userEngaged = true;
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
    const t = title || 'Collective — listening';
    this.setTitle(t);
    this.setPreview(t);
    if (!this._isMobileDeck()) this.expand(t);
    this.ping();
  },

  ping() {
    const d = this.deck();
    if (!d) return;
    this._pulseOverride = 'success';
    this.syncCliPulse();
    d.classList.remove('deck-ping');
    void d.offsetWidth;
    d.classList.add('deck-ping');
    if (this._pulseTimer) clearTimeout(this._pulseTimer);
    this._pulseTimer = setTimeout(() => {
      this._pulseOverride = null;
      d.classList.remove('deck-ping');
      this.syncCliPulse();
    }, 1400);
  },

  setThinking(on, hint) {
    if (this._thinkWatchdog) { clearTimeout(this._thinkWatchdog); this._thinkWatchdog = null; }
    this.thinking = !!on;
    const d = this.deck();
    if (d) d.classList.toggle('deck-thinking', this.thinking);
    if (on && hint) CliRibbon?.setNotice?.(hint, 'thinking');
    CliRibbon?.render?.();
    this.syncCliPulse();
    if (on) {
      this.setPreview(hint || '… thinking');
      if (!this._isMobileDeck()) this.expand(hint || 'Collective — thinking…');
      const out = this.logEl();
      if (out && this.expanded) {
        if (this._thinkLine?.parentNode) this._thinkLine.remove();
        this._thinkLine = document.createElement('div');
        this._thinkLine.className = 'deck-line deck-dim deck-thinking-line';
        this._thinkLine.textContent = this._repairLine(hint || '… thinking', 'dim');
        out.appendChild(this._thinkLine);
        out.scrollTop = out.scrollHeight;
      }
      this._thinkWatchdog = setTimeout(() => {
        this._thinkWatchdog = null;
        if (this.thinking) this.setThinking(false);
      }, 45000);
    } else if (this._thinkLine?.parentNode) {
      this._thinkLine.remove();
      this._thinkLine = null;
    }
  },

  showError(msg) {
    this._userEngaged = true;
    this.expand('Error');
    this.log(msg, 'err');
    this.setPreview(msg);
    this.ping();
  },

  clearLog() {
    const out = this.logEl();
    if (out) out.innerHTML = '';
    this.setPreview('');
  },

  expand(title) {
    const now = Date.now();
    if (title && (!this.expanded || now - this._expandAt > 400)) this.setTitle(title);
    this._expandAt = now;
    if (this._size === 'collapsed') {
      if (this._isMobileDeck()) {
        this._size = 'third';
        this._freeHeight = 0;
      } else {
        const cap = this._mobileDeckCap();
        this._size = (this._freeHeight > 130 && this._freeHeight <= cap) ? 'free' : 'third';
      }
    }
    this.applySize();
    if (window.AciCli) AciCli.open = true;
  },

  bootCollapsed() {
    this._size = 'collapsed';
    this.expanded = false;
    this._userEngaged = false;
    this.thinking = false;
    this.applySize();
    this.deck()?.classList.remove('deck-thinking', 'has-preview', 'deck-ping');
    CliRibbon?.clearNotice?.();
  },

  superAction(action) {
    this._userEngaged = true;
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
    this.expand((window.SuperCli?.title || 'Astranov Command Line') + ' — ' + (action || 'collective'));
  },

  collapse() {
    this._size = 'collapsed';
    this._userEngaged = false;
    this.applySize();
  },

  toggle() {
    this.cycleSize();
  },

  showStage(panelId, task, title) {
    this.hideStage();
    this.activeTask = task || panelId;
    const stage = document.getElementById('globe-deck-stage');
    const d = this.deck();
    if (!stage) return;
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.add('deck-active', 'open');
      if (d) d.classList.add('has-stage');
    } else if (d) {
      d.classList.remove('has-stage');
    }
    this.expand(title || this.stageTitle(panelId));
    AppShortcuts?.track?.(task || panelId, title || this.stageTitle(panelId));
    SuperCli?.setContext?.(SuperCli.inferContext?.());
    ContextTruth?.sync?.();
    AppShortcuts?.render?.();
    this.syncCliPulse();
  },

  hideStage() {
    const stage = document.getElementById('globe-deck-stage');
    if (stage) {
      stage.querySelectorAll('.deck-active').forEach(el => {
        el.classList.remove('deck-active', 'open');
      });
    }
    this.deck()?.classList.remove('has-stage');
    if (window.PmrRadio) PmrRadio.open = false;
    if (window.AstranovNode) window.AstranovNode._open = false;
  },

  stageTitle(panelId) {
    const titles = {
      'vendor-menu': 'Καταστήματα · παραγγελία',
      'node-batch': 'Work together · Astranov node',
      'sat-radio': 'EU PMR Ch 11 · comms',
      'globe-youtube': 'YouTube on globe',
      'globe-super-add': 'Super Add · post video',
      'cli-hub-panel': 'CLI · search & chats',
    };
    return titles[panelId] || 'Collective — globe deck';
  },

  completeTask(task) {
    const keep = ['radio', 'batch', 'commerce'];
    const stageActive = !!document.getElementById('globe-deck-stage')?.querySelector?.('.deck-active');
    if (task === 'cli' && this.activeTask && keep.includes(this.activeTask)) return;
    if (task === 'cli' && this.activeTask === 'coders' && stageActive) return;
    if (this.activeTask && this.activeTask !== task && task !== 'cli') return;
    if (this._collapseTimer) { clearTimeout(this._collapseTimer); this._collapseTimer = null; }
    const done = task === 'cli' ? this.activeTask : task;
    this.hideStage();
    this._size = 'collapsed';
    this.expanded = false;
    this.thinking = false;
    this.setThinking?.(false);
    this.deck()?.classList.remove('deck-thinking', 'has-preview', 'deck-ping');
    this.applySize();
    this.activeTask = null;
    if (done) AppShortcuts?.untrack?.(done);
    CliRibbon?.setActive?.('CLI');
    CliRibbon?.clearNotice?.();
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
    AppShortcuts?.render?.();
    this.syncCliPulse();
  },

  isOneShotCmd(cmd) {
    const one = new Set([
      'think', 'evolve', 'teach', 'stats', 'owner', 'seed', 'distill', 'council',
      'mode', 'locate', 'gps', 'me', 'drive', 'news', 'roles', 'claim', 'field_stats',
      'deploy', 'help', '?', 'clear', 'logout', 'connect', 'open', 'vendor',
      'dev', 'ui', 'brain', 'status', 'space', 'superspace', 'scenario',
    ]);
    return one.has((cmd || '').toLowerCase());
  },

  finishCliIfOneShot(cmd) {
    if (!this.isOneShotCmd(cmd)) return;
    if (this.activeTask && ['coders', 'radio', 'batch', 'commerce'].includes(this.activeTask)) return;
    if (this._collapseTimer) clearTimeout(this._collapseTimer);
    this._collapseTimer = setTimeout(() => {
      this._collapseTimer = null;
      if (!this.thinking) this.completeTask('cli');
    }, 8000);
  },
};
window.GlobeDeck = GlobeDeck;

// === CLI RIBBON — one top bar: account · apps · status · + · expand ===
const CliRibbon = {
  _active: 'CLI',
  _notice: '',
  _kind: 'idle',

  TASK_LABEL: {
    coders: 'Grok',
    commerce: 'Shops',
    batch: 'Batch',
    radio: 'PMR',
    video: 'Video',
    add: 'Post',
    drive: 'Drive',
    phone: 'Phone',
    site: 'Site',
    cli: 'CLI',
    chats: 'Chats',
    dm: 'DM',
    team: 'Team',
    game: 'ΚΡΥΦΤό',
    telemachos: 'Pilot',
    compromised: '⚠ Alert',
    guest: 'Guest',
  },

  MOTTO_RE: /justice\s*→\s*truth\s*→\s*freedom|collective intelligence|astranov command line\s*—|architect\s*·\s*collective|δικαιοσύνη|αλήθεια|ελευθερία/gi,
  GLOBE_HINT_RE: /city map|scroll\/pinch|pinch\/scroll|pinch out|return to globe|zoom.tier|zoom out|zoom in|double.tap|drag to spin/i,

  init() {
    const bar = document.getElementById('super-cli-bar');
    const header = document.getElementById('globe-deck-header');
    const fab = document.getElementById('super-add-fab');

    if (header) header.style.display = 'none';

    let status = document.getElementById('cli-ribbon-status');
    if (!status && bar) {
      status = document.createElement('span');
      status.id = 'cli-ribbon-status';
      status.setAttribute('aria-live', 'polite');
      if (fab) bar.insertBefore(status, fab);
      else bar.appendChild(status);
    }
    this._el = status;

    GlobeDeck?.bindHandle?.();

    this._active = 'CLI';
    this.render();
  },

  shorten(text) {
    let s = String(text || '').trim();
    if (!s) return '';
    s = s.replace(this.MOTTO_RE, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/^Astranov Command Line\b/i, 'CLI');
    s = s.replace(/^Collective Coders\s*—\s*talk here$/i, 'Coders');
    s = s.replace(/^Coders online\s*—.*$/i, 'Coders');
    s = s.replace(/warming up.*$/i, '').trim();
    const low = s.toLowerCase();
    for (const [key, label] of Object.entries(this.TASK_LABEL)) {
      if (low === key || low.startsWith(key + ' ') || low.includes(key)) return label;
    }
    if (/^cli\b/i.test(s)) return 'CLI';
    if (s.length > 28) s = s.slice(0, 28).trim() + '…';
    return s || 'CLI';
  },

  setActive(text) {
    this._active = this.shorten(text) || this.TASK_LABEL[GlobeDeck?.activeTask] || 'CLI';
    this.render();
  },

  isGlobeHint(text) {
    return this.GLOBE_HINT_RE.test(String(text || ''));
  },

  clearGlobeHint() {
    if (this._notice && this.isGlobeHint(this._notice)) this.clearNotice();
  },

  setNotice(text, kind) {
    if (this.isGlobeHint(text)) return;
    const raw = String(text || '').trim();
    const s = (kind === 'ready' || kind === 'thinking')
      ? (raw.length > 100 ? raw.slice(0, 100).trim() + '…' : raw)
      : this.shorten(text);
    this._notice = s;
    if (kind) this._kind = kind;
    else if (/error|fail|denied/i.test(s)) this._kind = 'err';
    else if (/⏸|held|pause/i.test(s)) this._kind = 'hold';
    else if (/ready|located|on globe/i.test(s)) this._kind = 'ready';
    else if (s) this._kind = 'info';
    else this._kind = 'idle';
    this.render();
  },

  clearNotice() {
    this._notice = '';
    if (this._kind !== 'err') this._kind = 'idle';
    this.render();
  },

  render() {
    if (!this._el) return;
    const parts = [];
    const task = GlobeDeck?.activeTask;
    const active = this.TASK_LABEL[task] || this._active || 'CLI';
    parts.push(active);

    if (GlobeDeck?.thinking) parts.push('thinking…');
    if (sessionHeld || SessionHold?.isHeld?.()) parts.push('held');
    if (window._handsFreeVoice) parts.push('hands-free');
    else if (isListening) parts.push('listening');

    if (Auth?.user) {
      const who = Auth._profileVisual?.avatar_emoji
        || (Auth.user.user_metadata?.full_name || Auth.user.email?.split('@')[0] || 'user').slice(0, 12);
      parts.push((Auth._authDegraded ? '⟳ ' : '● ') + who);
    } else parts.push('guest · sign in');

    if (window.SlumberManager?.tier && window.SlumberManager.tier !== 'full') {
      parts.push('⚡' + (window.SlumberManager.TIER_LABEL[window.SlumberManager.tier] || window.SlumberManager.tier));
    }
    if (window.SpaceNetResourceMonitor?.donating) parts.push('♻ donate');
    else if ((window.SpaceNetResourceMonitor?.spareScore || 0) >= 68) {
      parts.push('+' + window.SpaceNetResourceMonitor.spareScore + '% spare');
    }
    if (this._notice) parts.push(this._notice);

    const line = parts.filter(Boolean).join(' · ').slice(0, 140);
    this._el.textContent = line;
    this._el.title = line;
    this._el.className = 'cli-ribbon-status'
      + (GlobeDeck?.thinking ? ' thinking' : '')
      + (this._kind === 'err' ? ' alert' : '')
      + (this._kind === 'hold' ? ' hold' : '')
      + (this._kind === 'ready' ? ' ready' : '');

    const title = document.getElementById('globe-deck-title');
    const preview = document.getElementById('globe-deck-preview');
    if (title) title.textContent = active;
    if (preview) preview.textContent = this._notice || '';
    GlobeDeck?.syncCliPulse?.();
  },
};
window.CliRibbon = CliRibbon;

// === APP SHORTCUTS — open CLI apps as top-bar icons (account · apps · +) ===
const AppShortcuts = {
  _row: null,
  _order: [],
  _labels: {},
  _siteMeta: null,
  PINNED_INSIDE: ['avc', 'locate'],
  BASE_ORDER: ['coders', 'commerce', 'chats', 'batch', 'radio', 'video', 'add', 'drive', 'phone', 'coin', 'site'],

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
        GlobeDeck?.setTitle?.(SuperCli?.title || 'Astranov Command Line');
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
        GlobeDeck?.expand?.((SuperCli?.title || 'Astranov Command Line') + ' — phone');
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
      title: 'AVC',
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
    SuperCli?.ensureBarLayout?.();
    let row = document.getElementById('app-shortcut-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'app-shortcut-row';
      row.setAttribute('role', 'toolbar');
      row.setAttribute('aria-label', 'Open applications');
      const middle = document.getElementById('super-cli-middle');
      if (middle) middle.insertBefore(row, middle.firstChild);
      else login.insertAdjacentElement('afterend', row);
    }
    this._row = row;
    this._pinInsideButtons();
    this.render();
  },

  _pinInsideButtons() {
    if (!this._row) return;
    for (let i = this.PINNED_INSIDE.length - 1; i >= 0; i--) {
      const id = this.PINNED_INSIDE[i];
      const el = document.getElementById('aci-' + id);
      if (!el) continue;
      el.classList.add('app-shortcut-btn');
      el.hidden = false;
      el.dataset.pinned = '1';
      if (!el._pinnedBound) {
        el._pinnedBound = true;
        el.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          SuperCli?.run?.(id);
        };
      }
      this._row.prepend(el);
    }
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
    if (!this._order.includes(key)) {
      const baseIdx = this.BASE_ORDER.indexOf(key);
      if (baseIdx < 0) {
        this._order.push(key);
      } else {
        let insertAt = this._order.length;
        for (let i = 0; i < this._order.length; i++) {
          const existingIdx = this.BASE_ORDER.indexOf(this._order[i]);
          if (existingIdx > baseIdx) { insertAt = i; break; }
        }
        this._order.splice(insertAt, 0, key);
      }
    }
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
    this._pinInsideButtons();
    this._row.querySelectorAll('.app-shortcut-btn:not([data-pinned])').forEach((btn) => btn.remove());
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

// === SUPER CLI — one window: toolbar + log + stage + input ===
const ACL_TITLE = 'Astranov Command Line';

const SuperCli = {
  _bound: false,
  _context: 'idle',
  title: ACL_TITLE,

  // Edge bar: G left · + and 🎧 right · apps/locate scroll inside middle
  TOOLBAR_VISIBLE: ['aci-login', 'aci-avc', 'super-add-fab', 'aci-handsfree', 'aci-cli-toggle'],
  INPUT_BTNS: ['globe-deck-send'],

  ensureBarLayout() {
    const bar = document.getElementById('super-cli-bar');
    if (!bar || bar.dataset.layoutReady) return;
    bar.dataset.layoutReady = '1';
    const login = document.getElementById('aci-login');
    let middle = document.getElementById('super-cli-middle');
    let edgeRight = document.getElementById('super-cli-edge-right');
    if (!middle) {
      middle = document.createElement('div');
      middle.id = 'super-cli-middle';
      middle.className = 'super-cli-middle';
      bar.insertBefore(middle, edgeRight || null);
    }
    if (!edgeRight) {
      edgeRight = document.createElement('div');
      edgeRight.id = 'super-cli-edge-right';
      edgeRight.className = 'super-cli-edge-right';
      bar.appendChild(edgeRight);
    }
    const row = document.getElementById('app-shortcut-row');
    const ribbon = document.getElementById('cli-ribbon-status');
    const fab = document.getElementById('super-add-fab');
    const hf = document.getElementById('aci-handsfree');
    if (login && login.parentElement !== bar) bar.prepend(login);
    const avc = document.getElementById('aci-avc');
    if (avc) {
      avc.classList.add('app-shortcut-btn');
      avc.hidden = false;
      if (login && avc.parentElement !== bar) login.insertAdjacentElement('afterend', avc);
      if (!avc._avcChipBound) {
        avc._avcChipBound = true;
        avc.onclick = (e) => { e.preventDefault(); e.stopPropagation(); SuperCli?.run?.('wallet'); };
      }
    }
    if (row && row.parentElement !== middle) middle.insertBefore(row, middle.firstChild);
    if (ribbon && ribbon.parentElement !== middle) middle.appendChild(ribbon);
    if (fab && fab.parentElement !== edgeRight) edgeRight.insertBefore(fab, hf || null);
    if (hf && hf.parentElement !== edgeRight) edgeRight.appendChild(hf);
  },

  init() {
    if (this._bound) return;
    this._bound = true;
    this.ensureBarLayout();
    this.bindToolbar();
    this.bindInputBar();
    this.setContext(this.inferContext());
    CliRibbon?.setActive?.('CLI');
  },

  inferContext() {
    if (window.ContextTruth?.infer) return window.ContextTruth.infer().ctx;
    if (window.DrivingView?.active) return 'drive';
    const task = GlobeDeck?.activeTask;
    if (task === 'commerce') return 'commerce';
    if (task === 'batch') return 'batch';
    if (task === 'radio') return 'radio';
    if (task === 'phone') return 'phone';
    if (task === 'add') return 'add';
    if (task === 'coders') return 'coders';
    if (task === 'chats') return 'chats';
    if (!Auth?.user) return 'guest';
    return 'idle';
  },

  setContext(ctx) {
    this._context = ctx || 'idle';
    const bar = document.getElementById('super-cli-bar');
    if (!bar) return;
    bar.dataset.ctx = this._context;
    const allowed = new Set(this.TOOLBAR_VISIBLE);
    bar.querySelectorAll('button').forEach(btn => {
      if (btn.classList.contains('app-shortcut-btn')) return;
      btn.hidden = !allowed.has(btn.id);
    });
    AppShortcuts?.render?.();
    this.INPUT_BTNS.forEach(id => {
      const b = document.getElementById(id);
      if (b) b.hidden = false;
    });
  },

  bindInputBar() {
    const hf = document.getElementById('aci-handsfree');
    const plus = document.getElementById('globe-deck-plus');
    const send = document.getElementById('globe-deck-send');
    const openPlus = () => {
      GlobeDeck?.expand?.(ACL_TITLE);
      MapPlaceMenu?.openPlusField?.() || SuperCli?.run?.('add');
    };
    if (plus && !plus._superBound) {
      plus._superBound = true;
      plus.onclick = e => { e.preventDefault(); e.stopPropagation(); openPlus(); };
    }
    if (hf && !hf._superBound) {
      hf._superBound = true;
      hf.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        GlobeDeck?.expand?.(ACL_TITLE);
        document.getElementById('aci-cli-in')?.focus();
        if (SessionHold?.isHeld?.()) { SessionHold.resume(); return; }
        if (window._handsFreeVoice && !isListening && !Voice?.speaking) {
          startListeningForOptions();
          return;
        }
        if (Voice?.speaking || isListening || voiceSessionActive || window._handsFreeVoice) {
          userIntervene?.();
          return;
        }
        void startVoiceOptions?.();
      };
    }
    if (send && !send._superBound) {
      send._superBound = true;
      send.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        AciCli?.submitFromInput?.({ emptyFocus: true });
      };
    }
  },

  bindToolbar() {
    const openPlus = () => {
      GlobeDeck?.expand?.(ACL_TITLE);
      MapPlaceMenu?.openPlusField?.() || SuperCli?.run?.('add');
    };
    const actions = {
      'aci-login': () => Auth?.user ? Auth.openLoggedInProfile() : (Auth?.signInGoogle?.() || Auth?.openLoginModal?.()),
      'super-add-fab': openPlus,
      'globe-deck-plus': openPlus,
      'aci-cli-toggle': () => GlobeDeck?.toggle(),
      'aci-stop': () => userIntervene?.(),
      'aci-hold': () => SessionHold?.toggle?.(),
      'aci-theme': () => AstranovTheme?.toggle?.(),
      'aci-locate': () => this.run('locate'),
      'aci-provider': () => AiRouter?.cycle?.(),
      'aci-order': () => this.run('order'),
      'aci-batch': () => this.run('batch'),
      'aci-vhf': () => this.run('vhf'),
      'aci-call': () => this.run('phone'),
      'aci-avc': () => this.run('wallet'),
    };
    Object.entries(actions).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.onclick = e => { e.preventDefault(); e.stopPropagation(); fn(); };
    });
  },

  flyForTask(act, opts) {
    if (!GlobeControl?.isEarthView?.()) return;
    const u = window._lastPos || { lat: 36.22, lng: 28.12 };
    if (act === 'news') {
      const u = window._lastPos || { lat: 36.44, lng: 28.22 };
      GlobeControl.flyToLatLng(opts?.worldLat ?? u.lat, opts?.worldLng ?? u.lng, 'news', GlobeControl?.Z?.global);
      return;
    }
    if (act === 'order' || act === 'commerce') {
      const v = window.Commerce?.vendors?.[0] || window.Commerce?.selected;
      if (v?.lat != null) GlobeControl.flyToLatLng(v.lat, v.lng, 'order');
      else GlobeControl.flyToLatLng(u.lat, u.lng, 'order');
      return;
    }
    if (act === 'batch') GlobeControl.flyToLatLng(u.lat, u.lng, 'batch');
    if (act === 'vhf' || act === 'radio') GlobeControl.flyToLatLng(u.lat, u.lng, 'comms');
  },

  async run(action, opts) {
    const act = String(action || '').toLowerCase();
    SlumberManager?.wakeForAction?.(act);
    if (!['locate', 'city', 'map', 'cli', 'dark', 'bright', 'theme', 'slumber', 'wake', 'sleep', 'resources', 'resource', 'fleet', 'donate', 'boost'].includes(act)) {
      await LazyModules.ensure();
    }
    GlobeDeck?.superAction(act, opts);
    this.setContext(this.inferContext());
    AciCli?.print('▸ ' + act, 'cmd');

    switch (act) {
      case 'avc':
      case 'coin':
      case 'wallet':
        AppShortcuts?.track?.('coin', 'AVC');
        window.CoinPortal?.open?.('wallet');
        void window.AvcBalance?.refresh?.();
        AciCli?.print('◎ AVC wallet · coin.astranov.eu', 'ok');
        this.setContext('coin');
        break;
      case 'locate':
        if (GlobeControl?.followMode === 'locate' && !GlobeControl?.userExploring) {
          GlobeControl.userTookGlobe('locate-off');
          AciCli?.print('Locate released — globe is yours', 'ok');
          break;
        }
        GlobeDeck?.expand?.(ACL_TITLE);
        locateMe?.();
        GlobeDeck?.finishCliIfOneShot('locate');
        break;
      case 'city':
      case 'map':
        GlobeDeck?.expand?.(ACL_TITLE);
        GlobeDeck?.setMapStatus('Opening city map…');
        await enterCityView?.(null, null, { openShops: true });
        GlobeDeck?.finishCliIfOneShot('city');
        break;
      case 'order':
        this.flyForTask('order');
        await window.Commerce?.showPicker?.(opts?.filter);
        this.setContext('commerce');
        break;
      case 'batch':
        this.flyForTask('batch');
        await window.AstranovNode?.launchBatch?.();
        this.setContext('batch');
        break;
      case 'vhf':
      case 'radio':
      case 'pmr':
        this.flyForTask('vhf');
        window.Comms?.startVHF?.();
        this.setContext('radio');
        break;
      case 'phone':
      case 'call':
        GlobeDeck?.hideStage();
        GlobeDeck.activeTask = 'phone';
        GlobeDeck?.expand(ACL_TITLE + ' — phone');
        AppShortcuts?.track?.('phone', 'Phone');
        this.setContext('phone');
        AciCli?.print('Phone · call +number · theme follows your phone · say bright/dark/map', 'ok');
        ACIControl?.reply('Call +number here · brightness follows phone settings · type theme or map');
        document.getElementById('aci-cli-in')?.focus();
        break;
      case 'news':
        this.flyForTask('news', opts);
        window.NewsFeed?.flash?.();
        this.setContext('news');
        GlobeDeck?.finishCliIfOneShot('news');
        break;
      case 'drive':
        window.DrivingView?.activate?.();
        AppShortcuts?.track?.('drive', 'Drive');
        this.setContext('drive');
        break;
      case 'add':
      case 'post':
      case 'superadd':
        window.SuperAdd?.open?.();
        this.setContext('add');
        break;
      case 'cli':
        GlobeDeck?.expand(ACL_TITLE);
        document.getElementById('aci-cli-in')?.focus();
        break;
      default:
        if (AciCli && act) await AciCli.run(act + (opts?.rest ? ' ' + opts.rest : ''));
    }
  },
};
window.SuperCli = SuperCli;

// === ACI CLI — Collective dev terminal (login required) ===
const AciCli = {
  open: false,
  history: [],
  histIdx: -1,
  buffer: '',

  primeCodersCli() {
    AciCoders?.autoStart?.();
    CliRibbon?.setActive?.('Coders');
    const input = document.getElementById('aci-cli-in');
    if (input) {
      input.placeholder = 'Talk to Astranov — type or tap 🎧 · Enter to send';
    }
  },

  init() {
    const input = document.getElementById('aci-cli-in');
    const form = document.getElementById('aci-cli-form');
    const toggle = document.getElementById('aci-cli-toggle');
    if (toggle) toggle.onclick = () => this.toggle();
    SuperCli?.bindInputBar?.();
    if (form && !form._cliBound) {
      form._cliBound = true;
      form.addEventListener('submit', e => {
        e.preventDefault();
        this.submitFromInput({ emptyFocus: true });
      });
    }
    if (input) {
      input.addEventListener('keydown', e => this.onKey(e));
      if (!input._enterSendBound) {
        input._enterSendBound = true;
        input.addEventListener('keyup', e => this.onEnterKeyUp(e));
        input.addEventListener('beforeinput', e => this.onBeforeInput(e));
      }
      input.addEventListener('input', () => {
        this.buffer = input.value;
        window.resizeCliInput?.(input);
      });
      if (!input._codersFocusBound) {
        input._codersFocusBound = true;
        input.addEventListener('focus', () => {
          AciCoders?.enterSession?.({ focus: false, ping: false, expand: false });
        });
      }
    }
    window.addEventListener('keydown', e => {
      if (!Auth?.user) return;
      if (e.key === '`' && !e.ctrlKey && !e.metaKey && !/aci-cli-in|aci-input/.test(document.activeElement?.id || '')) {
        e.preventDefault();
        this.toggle();
      }
    });
    this.onAuthChange();
  },

  onAuthChange() {
    const toggle = document.getElementById('aci-cli-toggle');
    const logged = !!(Auth && Auth.user);
    if (toggle) toggle.style.display = 'inline-flex';
    if (!logged) {
      this._welcomed = false;
      this._sessionOpened = false;
      this.open = false;
      GlobeDeck?.collapse();
      this.primeCodersCli();
      return;
    }
    const prompt = document.getElementById('aci-cli-prompt');
    if (prompt) {
      prompt.textContent = AstranovSession?.isAstranov?.()
        ? 'ASTRANOV@collective $'
        : ((Auth.user.user_metadata?.full_name || Auth.user.email?.split('@')[0] || 'dev') + '@collective $');
    }
    if (AstranovSession?.isAstranov?.()) CliRibbon?.setActive?.('ACI');
    this.loadHistory();
    if (!this._sessionOpened) {
      this._sessionOpened = true;
      setTimeout(() => this.openOnLogin(), 500);
    }
    if (window.AciCoders) AciCoders.autoStart();
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
  },

  async openOnLogin() {
    if (!Auth?.user) return;
    this.show();
    if (window.AciCoders) await AciCoders.autoStart();
  },

  loadHistory() {
    try {
      const key = 'aci-cli-' + (Auth.user?.id || 'anon');
      this.history = JSON.parse(localStorage.getItem(key) || '[]');
    } catch { this.history = []; }
  },

  mergeHistory(remote) {
    if (!Array.isArray(remote) || !remote.length) return;
    const seen = new Set(this.history.map(h => String(h).trim()));
    remote.forEach(line => {
      const t = String(line || '').trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      this.history.push(t);
    });
    if (this.history.length > 80) this.history = this.history.slice(-80);
    this.saveHistory();
  },

  saveHistory() {
    try {
      const key = 'aci-cli-' + (Auth.user?.id || 'anon');
      localStorage.setItem(key, JSON.stringify(this.history.slice(-80)));
      AstranovSession?.push?.();
    } catch (_) {}
  },

  toggle() {
    if (!Auth?.user) {
      GlobeDeck?.onUserMessage('Guest — Astranov Command Line');
      this.showGuest();
      return;
    }
    GlobeDeck?.toggle();
    this.open = !!GlobeDeck?.expanded;
  },

  showGuest() {
    this.open = true;
    AciCoders?.autoStart?.();
    GlobeDeck?.expand('Coders');
    if (!this._guestWelcomed) {
      this._guestWelcomed = true;
      this.print('Coders always on — dev on · ui status · brain status · G for sync', 'dim');
    }
    document.getElementById('aci-cli-in')?.focus();
  },

  show() {
    if (!Auth?.user) return;
    this.open = true;
    AciCoders?.autoStart?.();
    if (!this._welcomed) {
      this._welcomed = true;
      this.print('Coders always on — dev on for full brain+UI · help', 'dim');
    }
    if (!window._bootEarthLock && Date.now() - (window._bootAt || 0) > 3000) GlobeDeck?.expand('Coders');
    else CliRibbon?.setActive?.('Coders');
    document.getElementById('aci-cli-in')?.focus();
  },

  hide() {
    this.open = false;
    GlobeDeck?.collapse();
  },

  print(text, cls) {
    const kind = cls || 'out';
    let line = String(text || '');
    if (kind === 'reply' || kind === 'ok') {
      line = ArcangeloDialect?.repairBrands?.(line) ?? line;
    } else {
      line = ArcangeloDialect?.sanitizeUi?.(line) ?? line;
    }
    if (!line.trim() && kind === 'reply') line = 'Coders online.';
    GlobeDeck?.log(line, kind);
  },

  async api(body, opts = {}) {
    const headers = { 'Content-Type': 'application/json', apikey: SB_KEY };
    if (Auth?.ensureSession) {
      const session = await Auth.ensureSession();
      headers.Authorization = session?.access_token ? 'Bearer ' + session.access_token : 'Bearer ' + SB_KEY;
    } else if (Auth?.client) {
      const { data } = await Auth.client.auth.getSession();
      const token = data?.session?.access_token;
      headers.Authorization = token ? 'Bearer ' + token : 'Bearer ' + SB_KEY;
    } else {
      headers.Authorization = 'Bearer ' + SB_KEY;
    }
    const timeoutMs = opts.timeoutMs || (body.fast ? 28000 : 55000);
    const lane = ArcangeloDialect?.apiContext?.() || {};
    const j = await fetchJson(SB_URL + '/functions/v1/aci', {
      method: 'POST', headers,
      body: JSON.stringify({ ...body, ...lane, cli_user: Auth?.user?.id, cli_email: Auth?.user?.email })
    }, timeoutMs);
    if (j._httpStatus === 401) j.error = j.error || 'login required — tap G to sign in';
    return j;
  },

  isEnterSend(e) {
    const enter = e.key === 'Enter' || e.keyCode === 13 || e.which === 13;
    return enter && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing;
  },

  stripTrailingBreak(value) {
    return String(value || '').replace(/\n+$/, '');
  },

  submitFromInput(opts = {}) {
    const input = document.getElementById('aci-cli-in');
    const line = this.stripTrailingBreak(input?.value).trim();
    const now = Date.now();
    if (line && line === this._lastSentLine && now - (this._lastSendAt || 0) < 400) return false;
    if (!line) {
      if (opts.emptyFocus) AciCoders?.enterSession?.({ focus: true, ping: false });
      return false;
    }
    this._lastSentLine = line;
    this._lastSendAt = now;
    GlobeDeck?.onUserMessage?.('Grok — ' + line.slice(0, 40));
    GlobeDeck?.setThinking?.(true, 'Grok…');
    GlobeDeck?.setPreview?.('Grok…');
    GlobeDeck?.clearCompose?.();
    this.run(line);
    return true;
  },

  onBeforeInput(e) {
    if (e.inputType !== 'insertLineBreak' || e.getModifierState?.('Shift')) return;
    e.preventDefault();
    this.submitFromInput();
  },

  onEnterKeyUp(e) {
    if (!this.isEnterSend(e)) return;
    if (Date.now() - (this._lastSendAt || 0) < 120) return;
    const input = document.getElementById('aci-cli-in');
    if (!input) return;
    if (input.value.endsWith('\n')) input.value = this.stripTrailingBreak(input.value);
    this.submitFromInput();
  },

  onKey(e) {
    const input = document.getElementById('aci-cli-in');
    if (this.isEnterSend(e)) {
      e.preventDefault();
      this.submitFromInput();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.history.length) {
        this.histIdx = Math.max(0, this.histIdx < 0 ? this.history.length - 1 : this.histIdx - 1);
        input.value = this.history[this.histIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.histIdx >= 0) {
        this.histIdx++;
        input.value = this.histIdx < this.history.length ? this.history[this.histIdx] : '';
      }
    } else if (e.key === 'Escape') {
      if (GlobeDeck?.activeTask === 'coders') { input?.blur(); return; }
      this.hide();
    }
  },

  async run(line, opts = {}) {
    line = (window.fixVoiceHotwords || (x => x))(String(line || '').trim());
    if (!line) {
      await AciCoders?.enterSession?.({ focus: true, ping: false });
      return;
    }
    await AciCoders?.enterSession?.({ focus: false, ping: false, expand: false });
    GlobeDeck?.setPreview?.('Coders — ' + line.slice(0, 60));
    AstranovWishlist?.captureCliLine?.(line);
    this.history.push(line);
    this.histIdx = -1;
    this.saveHistory();
    if (opts.fromVoice) {
      this.print('🎧 ' + line, 'dim');
    } else {
      this.print((document.getElementById('aci-cli-prompt')?.textContent || '›') + ' ' + line, 'cmd');
    }
    CliHub?.queueLine?.(line, 'cmd');

    const routed = await SuperCli?.exec?.(line, opts);
    if (routed?.handled) return;

    const parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const cmd = (parts[0] || '').toLowerCase().replace(/^"|"$/g, '');
    const rest = parts.slice(1).map(p => p.replace(/^"|"$/g, '')).join(' ');

    try {
      if (cmd === 'coders' || cmd === 'composer' || cmd === 'cursor' ||
          (cmd === 'summon' && /^coders?$/i.test(parts[1] || ''))) {
        const task = cmd === 'summon' ? parts.slice(2).join(' ')
          : (cmd === 'coders' ? rest : rest || '');
        await AciCoders?.handleCodersCommand(
          cmd === 'composer' || cmd === 'cursor' ? ('composer ' + task).trim() : task,
          { fromVoice: !!opts.fromVoice }
        );
        return;
      }
      if (cmd === 'grok') {
        await AciCoders?.handleCodersCommand(rest ? ('grok ' + rest) : 'grok', { fromVoice: !!opts.fromVoice });
        return;
      }
      if (cmd === 'connect' || cmd === 'open') {
        await AciConnect.connect(cmd === 'open');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'deploy') {
        await AciConnect.deploy(rest || 'continue deployment');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'clear') {
        GlobeDeck?.clearLog();
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'exit' || cmd === 'close') {
        if (rest && AppShortcuts?.closeApp?.(rest)) return;
        if (AppShortcuts?.closeCurrent?.()) return;
        GlobeDeck?.completeTask('cli');
        return;
      }
      if (cmd === 'logout') { await Auth.signOut(); this.print('signed out', 'ok'); return; }

      if (cmd === 'theme' || cmd === 'dark' || cmd === 'bright' || cmd === 'light' || cmd === 'auto') {
        let mode = cmd === 'theme' ? (parts[1] || '').toLowerCase() : (cmd === 'light' ? 'bright' : cmd);
        if (mode === 'auto' || mode === 'system') mode = 'auto';
        AstranovTheme?.set?.(mode);
        this.print('theme → ' + (AstranovTheme?._auto ? 'auto' : AstranovTheme?.mode || 'dark'), 'ok');
        return;
      }
      if (cmd === 'code' || cmd === 'edit') {
        if (!rest) { this.print('usage: code <desc>', 'err'); return; }
        GlobeDeck.activeTask = 'coders';
        AciCoders?.handleMessage?.('edit code: ' + rest);
        this.print('code change to coders', 'ok');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'db' || cmd === 'database') {
        if (!rest) { this.print('usage: db <cmd>', 'err'); return; }
        try {
          const r = await ACI.api({ mode: 'db', detail: rest });
          this.print('db: ' + (r.text || 'ok'), 'ok');
        } catch (e) {
          this.print('db err, try coders', 'err');
          AciCoders?.handleMessage?.('db change: ' + rest);
        }
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'map') {
        const sub = (parts[1] || '').toLowerCase();
        const pick = sub === 'style' ? (parts[2] || '').toLowerCase() : sub;
        if (pick === 'satellite' || pick === 'bright' || pick === 'dark') CityMap?.setMapStyle?.(pick);
        else CityMap?.cycleMapStyle?.();
        this.print('map style → ' + (CityMap?.getMapStyle?.() || 'satellite') + ' (city level)', 'ok');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'think') {
        if (!rest) { ACIControl?.reply('usage: think <prompt>'); return; }
        const r = await ACI.think(rest);
        ACIControl?.reply(r || '(empty)');
        if (voiceSessionActive && Voice.shouldSpeak(r)) speak(r.slice(0, 200));
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'evolve') {
        this.print('evolving…', 'dim');
        const r = await ACI.evolve(rest || 'cli');
        this.print(JSON.stringify(r || { ok: true }).slice(0, 400), 'out');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'teach') {
        if (!rest) { this.print('usage: teach <content>', 'err'); return; }
        await ACI.teach(rest);
        this.print('remembered · neuron spawned', 'ok');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'stats' || cmd === 'owner') {
        const r = await this.api({ mode: cmd === 'owner' ? 'owner_sync' : 'stats' });
        this.print(JSON.stringify(r, null, 0).slice(0, 600), 'out');
        if (r.is_owner) Auth.isOwner = true;
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'seed') {
        if (!Auth?.isOwner) { this.print('owner only — login as notisastranov@gmail.com', 'err'); return; }
        const r = await this.api({ mode: 'seed' });
        this.print(JSON.stringify(r).slice(0, 400), 'out');
        await ACI.init();
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'distill') {
        if (!Auth?.isOwner) { this.print('owner only', 'err'); return; }
        this.print('distilling…', 'dim');
        const r = await this.api({ mode: 'distill' });
        this.print(JSON.stringify(r).slice(0, 500), 'out');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'council') {
        if (!Auth?.isOwner) { this.print('owner only', 'err'); return; }
        const sub = (parts[1] || 'list').toLowerCase();
        const title = parts[2] || '';
        const desc = parts.slice(3).join(' ') || rest.replace(/^convene\s*/i, '');
        const body = { mode: 'council', council_mode: sub };
        if (sub === 'convene') { body.title = title || 'CLI case'; body.description = desc || title; }
        const r = await this.api(body);
        this.print(JSON.stringify(r).slice(0, 600), 'out');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'mode') {
        ACI.thinkMode = rest || '';
        this.print('mode: ' + (ACI.thinkMode || 'default'), 'ok');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'batch') { await SuperCli?.run('batch'); return; }
      if (cmd === 'vendors' || cmd === 'shops') {
        await SuperCli?.run('order');
        this.print('vendor picker open — tap globe or list', 'ok');
        GlobeDeck.activeTask = 'commerce';
        return;
      }
      if (cmd === 'order') {
        const sub = (parts[1] || '').toLowerCase();
        if (sub === 'status' || sub === 'track' || sub === 'list' || sub === 'fly' || sub === 'last' || sub === 'active') {
          await OrderTracking?.cli?.(parts);
          GlobeDeck?.finishCliIfOneShot?.('order');
          return;
        }
        await window.Commerce.openOrderFlow(rest);
        this.print(rest ? 'order · ' + rest : 'pick vendor — real menu only', 'ok');
        GlobeDeck.activeTask = 'commerce';
        return;
      }
      if (cmd === 'booker') {
        await YachtMatcher?.bookerCli?.(parts);
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'yacht' || cmd === 'yachts' || cmd === 'charter') {
        await YachtMatcher?.cli?.(parts);
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'book' && /^\d{4}-\d{2}-\d{2}/.test(parts[1] || '')) {
        await YachtMatcher?.cli?.(['yacht', 'book', ...parts.slice(1)]);
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'book' || cmd === 'site' || cmd === 'sites') {
        try {
          const prov = window.AstranovSitesProvision || window.SuperBookingProvision;
          const r = await prov?.cli?.(parts);
          if (r?.error) { this.print(r.error, 'err'); GlobeDeck?.finishCliIfOneShot(cmd); return; }
          if (r?.sites) {
            if (!r.sites.length) { this.print('no Astranov Sites yet — site create my-name', 'dim'); }
            else r.sites.forEach(s => this.print((s.domain || s.id) + ' · ' + s.business_type + ' · ' + s.mode, 'ok'));
            GlobeDeck?.finishCliIfOneShot(cmd);
            return;
          }
          if (r?.url) this.print('live → ' + r.url, 'ok');
          GlobeDeck?.finishCliIfOneShot(cmd);
        } catch (e) {
          this.print(e.message || String(e), 'err');
          GlobeDeck?.finishCliIfOneShot(cmd);
        }
        return;
      }
      if (cmd === 'vendor') {
        const sub = (parts[1] || '').toLowerCase();
        if (sub === 'menu') {
          const r = await window.Commerce.cliVendorMenu(parts.slice(2));
          if (r.error) { this.print(r.error, 'err'); GlobeDeck?.finishCliIfOneShot('vendor'); return; }
          if (r.vendors) {
            r.vendors.forEach(v => this.print(v.name + ' · ' + v.items + ' items · ' + v.id, 'ok'));
            GlobeDeck?.finishCliIfOneShot('vendor');
            return;
          }
          if (r.menu) {
            this.print(r.vendor + ' menu:', 'ok');
            r.menu.forEach(i => this.print('  ' + i.name + ' · ' + i.price + ' AVC', 'dim'));
            GlobeDeck?.finishCliIfOneShot('vendor');
            return;
          }
          this.print(r.message || JSON.stringify(r), 'ok');
          GlobeDeck?.finishCliIfOneShot('vendor');
          return;
        }
        if (sub === 'requests') {
          const r = await window.Commerce.listMenuRequests();
          if (r.error) { this.print(r.error, 'err'); GlobeDeck?.finishCliIfOneShot('vendor'); return; }
          if (!r.requests?.length) { this.print('no pending menu requests', 'dim'); GlobeDeck?.finishCliIfOneShot('vendor'); return; }
          r.requests.forEach(req => this.print((req.vendor_name || req.vendor_id) + ' · ' + (req.notes || 'menu needed') + ' · ' + req.id.slice(0, 8), 'ok'));
          GlobeDeck?.finishCliIfOneShot('vendor');
          return;
        }
        this.print('usage: vendor menu list|add|show|clear | vendor requests', 'err');
        GlobeDeck?.finishCliIfOneShot('vendor');
        return;
      }
      if (cmd === 'ping') {
        const r = await ACI.think('ping');
        ACIControl?.reply(r || 'pong');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'locate' || cmd === 'gps' || cmd === 'me') {
        await SuperCli?.run('locate');
        return;
      }
      if (cmd === 'city' || cmd === 'cityview') {
        const r = await enterCityView?.();
        if (r?.error) this.print(r.error, 'err');
        else this.print('city view · ' + (r?.vendors?.length ?? 0) + ' shops', 'ok');
        return;
      }
      if (cmd === 'vhf') { await SuperCli?.run('vhf'); return; }
      if (cmd === 'call' || cmd === 'phone') {
        const num = rest || parts.slice(1).join(' ');
        if (num && /^\+?\d/.test(num)) {
          MapDepict?.action('phone', { detail: num });
          window.location.href = 'tel:' + num.replace(/\s/g, '');
          this.print('calling ' + num, 'ok');
        } else {
          await SuperCli?.run('phone');
        }
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'drive') {
        DrivingView?.activate?.();
        this.print('driving view (needs GPS speed)', 'ok');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'stars' || cmd === 'constellations' || cmd === 'constellation' || cmd === 'nav') {
        ZoomTiers?.goTo?.('global', true);
        CelestialNav?.printReport?.();
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'news') { NewsFeed.flash(); this.print('news', 'ok'); GlobeDeck?.finishCliIfOneShot(cmd); return; }
      if (cmd === 'youtube' || cmd === 'yt') {
        await GlobeVideo?.find?.(rest);
        GlobeDeck.activeTask = 'video';
        return;
      }
      if (cmd === 'watch' || cmd === 'play') {
        if (/^\d+$/.test(rest)) { await GlobeVideo?.playIndex?.(rest); return; }
        const id = GlobeVideo?.parseId?.(rest);
        if (id) { await GlobeVideo?.play?.(id, { title: rest }); return; }
      }
      if (cmd === 'space' || cmd === 'superspace') {
        const sub = (parts[1] || 'status').toLowerCase();
        if (sub === 'status') {
          this.print(JSON.stringify(SuperSpace?.status?.(), null, 0), 'out');
          GlobeDeck?.finishCliIfOneShot('space');
          return;
        }
        const topic = parts.slice(/^(locate|find|place)$/.test(sub) ? 2 : 1).join(' ') || rest;
        if (topic) await SuperSpace?.locateText?.(topic);
        else this.print(JSON.stringify(SuperSpace?.status?.(), null, 0), 'out');
        return;
      }
      if (cmd === 'roles') {
        await FieldBrain?.onAuth();
        this.print('roles: ' + (FieldBrain?.roles || []).join(' + '), 'ok');
        if (FieldBrain?.vendorIds?.length) this.print('vendors: ' + FieldBrain.vendorIds.join(', '), 'dim');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'claim') {
        if (!rest) { this.print('usage: claim <order_id>', 'err'); return; }
        const r = await FieldBrain?.claimDelivery(rest);
        this.print(r?.ok ? 'claimed ' + (r.order?.short_id || rest) : (r?.error || 'failed'), r?.ok ? 'ok' : 'err');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'brain') {
        const sub = (parts[1] || 'status').toLowerCase();
        if (sub === 'evolve' || sub === 'grow') {
          await BrainNeurons?._maybeEvolve?.('cli');
          this.print('brain evolved · ' + (BrainNeurons?.count?.() || 0) + ' neurons', 'ok');
        } else {
          const r = await ACI?.api?.({ mode: 'stats' });
          this.print('neurons · ' + (BrainNeurons?.count?.() || 0) + ' globe · ' + (r?.neuron_count || 0) + ' memory', 'ok');
          (r?.principles || []).slice(0, 6).forEach(p => this.print((p.strength || 1).toFixed(1) + ' · ' + (p.content || '').slice(0, 72), 'dim'));
        }
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'work' || cmd === 'jobs' || cmd === 'available') {
        if (cmd === 'available') await FieldWork?.runCli?.(['work', 'available', ...parts.slice(1)]);
        else await FieldWork?.runCli?.(parts);
        GlobeDeck?.finishCliIfOneShot?.(cmd);
        return;
      }
      if (cmd === 'resources' || cmd === 'resource') {
        await SpaceNetResourceMonitor?.cli?.(parts.slice(1).length ? parts.slice(1) : ['status']);
        GlobeDeck?.finishCliIfOneShot?.(cmd);
        return;
      }
      if (cmd === 'donate') {
        await SpaceNetResourceMonitor?.cli?.(['donate', ...parts.slice(1)]);
        GlobeDeck?.finishCliIfOneShot?.(cmd);
        return;
      }
      if (cmd === 'fleet') {
        await SpaceNetFleet?.cli?.(parts.slice(1));
        GlobeDeck?.finishCliIfOneShot?.(cmd);
        return;
      }
      if (cmd === 'boost') {
        await SpaceNetResourceMonitor?.cli?.(['boost']);
        GlobeDeck?.finishCliIfOneShot?.(cmd);
        return;
      }
      if (cmd === 'driver') {
        const sub = (parts[1] || 'online').toLowerCase();
        if (sub === 'online' || sub === 'go') {
          const r = await FieldBrain?.goOnlineDriver?.();
          this.print(r?.ok ? 'driver online' : (r?.error || 'failed'), r?.ok ? 'ok' : 'err');
        } else if (sub === 'jobs' || sub === 'list') {
          const r = await FieldBrain?.listOpenJobs?.();
          if (!r?.orders?.length) { this.print('no open delivery jobs — check back soon', 'dim'); }
          else r.orders.forEach(o => this.print((o.short_id || o.id?.slice(0, 8)) + ' · ' + (o.vendor_name || o.vendor_id) + ' · ' + o.status, 'ok'));
        } else {
          this.print('usage: driver online | driver jobs', 'err');
        }
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }
      if (cmd === 'field_stats') {
        if (!Auth?.isOwner) { this.print('owner only', 'err'); return; }
        const r = await this.api({ mode: 'field_stats' });
        this.print(JSON.stringify(r).slice(0, 700), 'out');
        GlobeDeck?.finishCliIfOneShot(cmd);
        return;
      }

      if (AciCoders?.isCodersIntent?.(line)) {
        await AciCoders.handleMessage(
          /^coders?\b/i.test(line) ? line : ('coders ' + line),
          { fromVoice: !!opts.fromVoice },
        );
        GlobeDeck?.finishCliIfOneShot('coders');
        return;
      }
      await AciCoders?.handleMessage(line, { fromVoice: !!opts.fromVoice });
      if (AstranovNode?.batchId) AstranovNode.broadcastTask(line);
      if (!AciCoders?.alwaysOn) GlobeDeck?.finishCliIfOneShot('coders');
    } catch (err) {
      GlobeDeck?.setThinking(false);
      const msg = 'error: ' + (err.message || err);
      this.print(msg, 'err');
      GlobeDeck?.showError(msg);
    }
  }
};
window.AciCli = AciCli;

// === ASTRANOV CODERS — always online for all users ===
// Justice → Truth → Freedom (exact order) is the immutable boundary.
const AciCoders = {
  ready: false,
  alwaysOn: true,
  teamActive: true,
  history: [],
  lastSummonId: null,
  engine: 'grok',
  armed: false,
  fallbackPrefs: { force: 'xai', skip: [] },
  _pollTimer: null,
  _listenTimer: null,
  _evolveTimer: null,
  _started: false,
  _listening: false,
  _listenBusy: false,
  _activityBuffer: [],
  _activityCount: 0,
  _listenTicks: 0,
  _lastListenAt: 0,

  CAUSE: 'Justice → Truth → Freedom',
  LISTEN_MS: 900000,
  _cliBusy: false,
  EVOLVE_MS: 600000,

  loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('aci-coders-prefs') || '{}');
      if (p.skip) this.fallbackPrefs.skip = p.skip;
      if (p.force) this.fallbackPrefs.force = p.force;
      else this.fallbackPrefs.force = 'xai';
      if (p.causeJudge) this.fallbackPrefs.causeJudge = p.causeJudge;
    } catch (_) {
      this.fallbackPrefs.force = 'xai';
    }
  },

  savePrefs() {
    try { localStorage.setItem('aci-coders-prefs', JSON.stringify(this.fallbackPrefs)); } catch (_) {}
  },

  isPowerUser() {
    return !!(Auth?.isOwner || Auth?.isArchitect);
  },

  isExplicitRef(raw) {
    const s = String(raw || '').trim();
    return /^(coders|composer|cursor|summon\s+coders?)\b/i.test(s) || /^@coders\b/i.test(s);
  },

  parseCauseJudge(text) {
    if (!this.isPowerUser()) return null;
    const s = String(text || '');
    if (!/priorit|judge|cause|justice|truth|freedom|δικαιοσύνη|αλήθεια|ελευθερία|κριτ|σειρά/i.test(s)) return null;
    return { ruling: s.slice(0, 500) };
  },

  loadEngine() {
    this.engine = this.fallbackPrefs.force === 'composer' ? 'composer' : 'grok';
  },

  setEngine(eng) {
    this.engine = eng === 'composer' ? 'composer' : 'grok';
    this.fallbackPrefs.force = eng === 'composer' ? 'composer' : 'xai';
    this.savePrefs();
    return true;
  },
  toggleEngine() {
    return this.setEngine(this.engine === 'composer' ? 'grok' : 'composer');
  },

  updateHud() {
    CliRibbon?.setActive?.('Coders');
    CliRibbon?.render?.();
  },

  observeActivity(source, detail, props) {
    const d = String(detail || source || '').slice(0, 120);
    if (!d) return;
    this._activityBuffer.push({ source: String(source || 'field'), detail: d, ts: Date.now(), props: props || {} });
    if (this._activityBuffer.length > 48) this._activityBuffer = this._activityBuffer.slice(-48);
    this._activityCount++;
    MissionSupportReporter?.recordProgress?.(String(source || 'field'), d, props);
    this.updateHud();
  },

  _buildDigest() {
    const recent = this._activityBuffer.slice(-14);
    if (!recent.length) return '';
    return recent.map(e => e.source + ':' + e.detail).join(' · ').slice(0, 1200);
  },

  startListening() {
    if (this._listenTimer) return;
    this._listening = true;
    this.updateHud();
    this._listenTimer = setInterval(() => this.listenTick(), this.LISTEN_MS);
    this._evolveTimer = setInterval(() => this.evolveTick(), this.EVOLVE_MS);
  },

  stopListening() {
    if (this._listenTimer) { clearInterval(this._listenTimer); this._listenTimer = null; }
    if (this._evolveTimer) { clearInterval(this._evolveTimer); this._evolveTimer = null; }
    this._listening = false;
  },

  async listenTick() {
    if (document.hidden) return;
    if (window._handsFreeVoice || isListening || Voice?.speaking || this._cliBusy || this._listenBusy) return;
    if (this._activityCount < 1 && this._listenTicks > 0) return;
    this._listenBusy = true;
    this._listenTicks++;
    try {
      const digest = this._buildDigest();
      const eventCount = this._activityBuffer.length;
      const evolve = eventCount >= 3 || this._listenTicks % 3 === 0;
      const r = await AciCli.api({
        mode: 'coders_listen',
        activity: digest || 'heartbeat · coders online',
        event_count: eventCount,
        evolve,
      });
      this._lastListenAt = Date.now();
      if (r.ok) this._applyListenResult(r);
    } catch (_) {
      /* retry next tick */
    } finally {
      this._listenBusy = false;
    }
  },

  _applyListenResult(r) {
    if (r.principles?.length) ACI?.syncNeuronsFromPrinciples?.(r.principles);
    if (r.evolved) {
      MapDepict?.action('evolve', { detail: 'coders listen · brain evolved' });
      ACI?.pulse?.(1.35);
      for (let i = 0; i < 2; i++) {
        ACI?.spawnNeuron?.(
          (Math.random() - 0.5) * 60,
          (Math.random() - 0.5) * 120,
          1.1 + Math.random() * 0.3,
          r.improvement?.slice(0, 80) || 'collective neuron'
        );
      }
    }
    if (r.improvement && !document.hidden) {
      GlobeDeck?.log?.('Coders · ' + r.improvement.slice(0, 160), 'dim');
    }
    this._activityBuffer = this._activityBuffer.slice(-6);
    this._activityCount = Math.max(0, this._activityCount - 2);
    this.updateHud();
  },

  async evolveTick() {
    if (window._handsFreeVoice || isListening || Voice?.speaking) return;
    if (this._activityCount < 2) return;
    try {
      await ACI?.evolve?.('coders-active-listen');
      this._activityCount = Math.max(0, this._activityCount - 3);
      this.updateHud();
    } catch (_) {}
  },

  async ensureSession() {
    if (!Auth?.user) return true;
    const session = await Auth.ensureSession?.();
    if (!session?.access_token) {
      GlobeDeck?.showError('Session expired — tap G to sign in again');
      return false;
    }
    return true;
  },

  async ensureBridge() {
    this.loadPrefs();
    this.loadEngine();
    this.alwaysOn = true;
    window._aciCodersAlwaysOn = true;
    if (this.ready) { this.updateHud(); return; }
    this.ready = true;
    window._aciCodersReady = true;
    this.updateHud();
  },

  _guaranteeReply(userMsg, r, extra) {
    const payload = { ...(r || {}), ...(extra || {}) };
    const raw = String(payload.text || payload.response || '').trim();
    if (!raw || this.isFailedReply(raw)) {
      payload.text = this.localReply(userMsg);
      payload.response = payload.text;
      payload.via = payload.via || 'local/guarantee';
    } else {
      payload.text = raw;
      payload.response = raw;
    }
    if (payload.error && !payload.text) {
      payload.text = this.localReply(userMsg) + ' (' + String(payload.error).slice(0, 100) + ')';
      payload.response = payload.text;
    }
    return this._applyResponse(payload, userMsg);
  },

  async autoStart() {
    this.alwaysOn = true;
    this.teamActive = true;
    this.armed = true;
    await this.ensureBridge();
    this.updateHud();
    if (this._started) {
      this.startListening();
      return;
    }
    this._started = true;
    window._aciCodersAlwaysOn = true;
    this.startListening();
  },

  /** Open live Coders chat — expanded CLI, mic ready, replies visible */
  async enterSession(opts = {}) {
    opts = opts || {};
    await this.autoStart();
    if (GlobeDeck) GlobeDeck.activeTask = 'coders';
    if (opts.expand) {
      GlobeDeck?.onUserMessage?.('Coders');
      GlobeDeck?.expand?.('Coders');
    } else {
      GlobeDeck?.setTitle?.('Coders');
      GlobeDeck?.setPreview?.('Coders ready — type below');
      CliRibbon?.setActive?.('Coders');
    }
    AppShortcuts?.track?.('coders', 'Coders');
    if (window.AciCli) AciCli.open = true;

    const input = document.getElementById('aci-cli-in');
    if (input) {
      input.placeholder = 'Talk to Astranov — type or tap 🎧 · Enter to send';
      input.classList.remove('voice-live');
      if (opts.focus !== false) {
        setTimeout(() => input.focus(), 60);
      }
    }

    if (opts.fromVoice || window._handsFreeVoice || voiceSessionActive) {
      if (!window._handsFreeVoice && typeof startVoiceOptions === 'function') {
        startVoiceOptions();
      } else {
        scheduleVoiceResume?.();
      }
    }

    this.updateHud();

    if (!this._sessionWelcomed || opts.ping) {
      if (!this._sessionWelcomed) this._sessionWelcomed = true;
      const line = opts.ping
        ? 'Grok still here — keep talking (type or 🎧)'
        : 'talk hands-free to Astranov — type or tap 🎧 and speak. I reply in ribbon + voice.';
      AciCli?.print(line, 'ok');
      ACIControl?.reply(line.slice(0, 200));
      if (opts.fromVoice && window._handsFreeVoice && Voice?.maySpeak?.()) {
        speak('Coders ready. Talk normally.', () => resumeListening?.(), false);
      }
    }

    return { ok: true, session: true };
  },

  /** Strip optional legacy "coders" prefix — coders listen to all messages. */
  normalizeMessage(message) {
    return String(message || '').trim()
      .replace(/^summon\s+coders?\s*/i, '')
      .replace(/^coders\s+/i, '')
      .trim();
  },

  async handleMessage(message, opts = {}) {
    const raw = (window.fixVoiceHotwords || (x => x))(String(message || '').trim());
    if (!raw) return this.enterSession({ fromVoice: !!opts.fromVoice });

    const parts = raw.split(/\s+/);
    const sub = (parts[0] || '').toLowerCase();

    if (/^coders\b/i.test(raw)) {
      if (sub === 'list') return this.listSummons();
      if (sub === 'poll' || sub === 'status') {
        const id = parts[1] ? parseInt(parts[1], 10) : this.lastSummonId;
        return this.poll(id, false);
      }
      if (sub === 'exit' || sub === 'close' || sub === 'leave') {
        AciCli?.print('Coders stay always on', 'ok');
        ACIControl?.reply('Coders always active — building the collective brain');
        return { ok: true, always_on: true };
      }
      if (sub === 'grok' || sub === 'composer') {
        const task = parts.slice(1).join(' ');
        if (task.length < 3) {
          this.setEngine(sub);
          return this.chat('use ' + sub + ' from now on');
        }
      }
      if (parts.length === 1) {
        return this.enterSession({
          ping: !!this._sessionWelcomed,
          fromVoice: !!opts.fromVoice || !!window._handsFreeVoice || !!voiceSessionActive,
        });
      }
    }

    if (this.isPowerUser() && this.isExplicitRef(raw)) {
      const task = this.normalizeMessage(raw) || raw;
      if (/^deploy\b/i.test(task)) {
        return this.executeOrder(task, raw, { deploy: true });
      }
      return this.executeOrder(task, raw);
    }

    const text = (this.normalizeMessage(raw) || raw).trim();
    if (/^coders?$/i.test(text)) {
      return this.enterSession({
        ping: !!this._sessionWelcomed,
        fromVoice: !!opts.fromVoice || !!window._handsFreeVoice || !!voiceSessionActive,
      });
    }
    return this.chat(text, opts);
  },

  async executeOrder(task, raw, opts) {
    await this.autoStart();
    if (!(await this.ensureSession())) return { error: 'session expired' };

    const judge = this.parseCauseJudge(raw);
    if (judge) {
      this.fallbackPrefs.causeJudge = judge.ruling;
      this.savePrefs();
      AciCli?.print('Cause judge ruling — architect authority', 'ok');
      try {
        await ACI?.teach?.('Architect cause judge: ' + judge.ruling);
      } catch (_) {}
    }

    const m = String(task || '').trim();
    if (!m) return { error: 'empty order' };

    AciCli?.print('OWNER ORDER — executing: ' + m.slice(0, 100), 'cmd');
    GlobeDeck?.onUserMessage('ORDER — ' + m.slice(0, 40));
    MapDepict?.action('think', { detail: 'ORDER: ' + m.slice(0, 40) });

    try {
      GlobeDeck?.setThinking(true, 'Executing owner order…');

      const r = await AciCli.api({
        mode: 'coders_chat',
        message: m,
        explicit_order: true,
        owner_judge: !!judge,
        cause_ruling: judge?.ruling || this.fallbackPrefs.causeJudge || '',
        history: this.history.slice(-10),
        fallback_prefs: this.fallbackPrefs,
      });

      const eng = this.wantsComposer(m) ? 'composer' : 'grok';
      const build = await this.queueCoder(m, eng);
      let merged = { ...r, order_executed: true };
      if (build.text && !build.error) {
        merged.text = (r.text || r.response || '') + '\n\n[ORDER #' + (build.summon_id || '?') + ']\n' + build.text;
        merged.response = merged.text;
        merged.summon_id = build.summon_id;
        merged.composer_queued = build.composer_queued;
      }

      if (opts?.deploy || /^deploy\b/i.test(m)) {
        await AciConnect?.deploy?.(m.replace(/^deploy\s*/i, ''));
      }

      GlobeDeck?.setThinking(false);
      ACIControl?.reply('Order executing — #' + (merged.summon_id || 'queued'));
      return this._applyResponse(merged, raw);
    } catch (e) {
      GlobeDeck?.setThinking(false);
      const msg = String(e.message || e);
      GlobeDeck?.showError('Order failed: ' + msg);
      return { error: msg };
    }
  },

  stopPoll() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  },

  startPoll(summonId) {
    this.stopPoll();
    if (!summonId) return;
    let tries = 0;
    this._pollTimer = setInterval(async () => {
      tries++;
      const r = await this.poll(summonId, true);
      if (r?.status === 'answered') this.stopPoll();
      if (tries > 36) {
        this.stopPoll();
        if (r?.status !== 'answered') this._pollTimeoutFallback(summonId);
      }
    }, 5000);
  },

  async _pollTimeoutFallback(summonId) {
    if (!Auth?.user) return;
    if (AciCli) AciCli.print('Composer poll timeout — asking Grok…', 'dim');
    const last = this.history.filter(h => h.role === 'user').pop();
    const task = last?.content || 'summon follow-up';
    const q = await this.queueCoder(task, 'grok');
    if (q.text && AciCli) AciCli.print('Grok fallback #' + (summonId || '?') + ': ' + q.text.slice(0, 500), 'out');
  },

  async poll(summonId, quiet) {
    const id = summonId || this.lastSummonId;
    if (!id) {
      if (!quiet && AciCli) AciCli.print('usage: coders poll <summon_id>', 'err');
      return { error: 'no id' };
    }
    const r = await AciCli.api({ mode: 'coders_poll', summon_id: id });
    if (!quiet && AciCli) {
      if (r.pending) AciCli.print('#' + id + ' pending — Composer…', 'dim');
      else if (r.text) {
        AciCli.print('Composer #' + id + ': ' + r.text.slice(0, 900), 'out');
        this._recordReply(id, r.text);
      }
    }
    if (r.text && !r.pending) {
      GlobeDeck?.expand('Coders — Composer reply');
      ACIControl?.reply('Composer #' + id + ': ' + r.text.slice(0, 160));
    }
    return r;
  },

  async listSummons() {
    if (!Auth?.user) {
      AciCli?.print('sign in with G to list your summons', 'dim');
      return { error: 'login required' };
    }
    const r = await AciCli.api({ mode: 'coders_list' });
    if (!r.summons?.length) {
      if (AciCli) AciCli.print('no coders summons yet', 'dim');
      return r;
    }
    if (AciCli) {
      AciCli.print('── coders summons ──', 'dim');
      r.summons.forEach(s => {
        AciCli.print('#' + s.id + ' [' + s.status + '] ' + s.engine + ' — ' + s.question, s.status === 'open' ? 'dim' : 'ok');
      });
    }
    return r;
  },

  _recordReply(id, text) {
    this.history.push({ role: 'assistant', content: '[#' + id + '] ' + text });
    if (this.history.length > 20) this.history = this.history.slice(-20);
  },

  _applyResponse(r, userMsg) {
    if (r.fallback_prefs) {
      this.fallbackPrefs = r.fallback_prefs;
      this.savePrefs();
      this.loadEngine();
    }
    const raw = String(r.text || r.response || '').trim();
    const err = String(r.error || '').trim();
    if (r.summon_id) this.lastSummonId = r.summon_id;

    this.history.push({ role: 'user', content: userMsg });

    const honest = raw ? this.formatHonestReply(r, userMsg) : '';
    let reply = ArcangeloDialect?.repairBrands?.(honest || raw || err) ?? (honest || raw || err);
    reply = String(reply || '').slice(0, 900);
    if (!reply || this.isFailedReply(reply)) reply = this.localReply(userMsg);
    if (err && !raw && reply === this.localReply(userMsg)) {
      reply = this.localReply(userMsg) + ' (' + err.slice(0, 120) + ')';
    }

    this.history.push({ role: 'assistant', content: reply });
    if (this.history.length > 20) this.history = this.history.slice(-20);

    const prefix = r.explicit_order || r.order_executed ? 'ORDER: ' : '';
    const kind = r.error && !raw ? 'err' : 'reply';
    AciCli?.print(prefix + reply, kind);
    ACIControl?.reply(prefix + reply.slice(0, 260));

    const composerQueued = r.composer_queued || (r.pending && r.summon_id);
    if (composerQueued && AciCli) AciCli.print('Composer also queued #' + composerQueued, 'dim');
    if (composerQueued) this.startPoll(composerQueued);
    else this.stopPoll();

    const spoken = ArcangeloDialect?.repairOutbound?.(reply, 'reply') ?? reply;
    if (!r.pending) {
      const wantVoice = window._handsFreeVoice || voiceSessionActive;
      if (wantVoice && Voice.shouldSpeak(spoken)) {
        voiceEnabled = true;
        speak(spoken.slice(0, 160), () => resumeListening?.(), false);
      } else if (window._handsFreeVoice || voiceSessionActive) {
        scheduleVoiceResume?.();
      }
    } else if (window._handsFreeVoice || voiceSessionActive) {
      scheduleVoiceResume?.();
    }
    GlobeDeck?.setThinking?.(false);

    this.observeActivity('chat', userMsg, { coders: true, guest: !!r.guest });
    FieldBrain?.pulse?.('think', 'coders: ' + userMsg.slice(0, 48), {
      role: Auth?.user ? 'client' : 'anon',
      props: { coders: true, guest: !!r.guest, always_on: true },
    });
    return r;
  },

  isPing(m) {
    const s = String(m || '').trim();
    if (!s || s.length > 80) return false;
    return /^(are you there|you there|hello|hi|hey|ping|online|listening|composer|grok|coders|γεια|είσαι|ακούς|π��ρών|εδώ|μου ακούς)/i.test(s)
      || /^(composer|grok|coders)\s+(are you there|online|there)/i.test(s);
  },

  isFailedReply(text) {
    return /gathering itself|warming up|try again in a few seconds|try again (in a moment|shortly)|no model responded/i.test(String(text || ''));
  },

  isLocalGlobeCmd(m) {
    const s = String(m || '').trim();
    return /^locate\s*(me|button)?$/i.test(s)
      || /^zoom\s+to\s+me$/i.test(s)
      || /^where\s+am\s+i\??$/i.test(s)
      || /^find\s+me$/i.test(s)
      || /^🎯|📍$/.test(s);
  },

  runLocalGlobeCmd(m) {
    if (!this.isLocalGlobeCmd(m)) return null;
    GlobeDeck?.setThinking(false);
    locateMe?.();
    const pos = window._lastPos;
    const hint = pos
      ? 'On globe · ' + pos.lat.toFixed(2) + ', ' + pos.lng.toFixed(2) + ' — zoom in or say city view'
      : 'Locating you on the globe…';
    AciCli?.print(hint, 'ok');
    ACIControl?.reply(hint);
    CliRibbon?.setNotice?.('located', 'ready');
    return { ok: true, located: true, text: hint };
  },

  localReply(m) {
    const greek = /[\u0370-\u03FF]/.test(String(m || ''));
    if (this.isPing(m)) {
      return greek
        ? 'Ναι, είμαι εδώ — Grok online. Μίλα κανονικά ή πάτα 🎧.'
        : 'Yes — Grok here. Talk straight to me — type or tap 🎧.';
    }
    return greek
      ? 'Grok εδώ — δοκίμασε ξανά ή πάτα 🎧 να μιλήσεις.'
      : 'Grok here — say it again or tap 🎧 to talk.';
  },

  isBuildTask(m) {
    const s = String(m || '').toLowerCase();
    if (/^(why|what|how|do we|list|status|credits|explain|try|skip|use)\b/.test(s)) return false;
    return /fix|build|implement|add|create|remove|button|locate|globe|vendor|order|mobile|lag|hang|slow|broken|crash|φτιάξε|πρόσθεσε|διόρθωσε|κολλάει/.test(s) && s.length >= 6;
  },

  isCodersIntent(m) {
    const s = String(m || '').trim();
    if (this.isExplicitRef(s)) return true;
    return this.isBuildTask(s) || /call\s+coders?|ask\s+coders?|tell\s+coders?/i.test(s);
  },

  tryLocalFix(m) {
    const low = String(m || '').toLowerCase();
    if ((/cli|input|voice|transcri|compose|lag|hang|slow/.test(low)) && /fix|clear|reset|φτιάξε|διόρθωσε/.test(low)) {
      GlobeDeck?.setCompose?.('');
      window.setVoicePerfMode?.(true);
      const input = document.getElementById('aci-cli-in');
      if (input) {
        input.classList.remove('voice-live');
        window.resizeCliInput?.(input);
        input.focus();
      }
      AciCoders._cliBusy = false;
      return 'CLI reset · perf mode on — edit the input or speak again';
    }
    if ((/vendor|shop|καταστήμα|driver|οδηγ/.test(low)) && /fix|find|show|list|scan|βρες/.test(low)) {
      window.Commerce?.openOrderFlow?.('');
      return 'Vendor scan opened on globe — pick shop or say order pitogyra';
    }
    if (/locate|zoom|map|πόσο|where am i/.test(low)) {
      this.runLocalGlobeCmd('locate me');
      return 'Located on globe';
    }
    if (/refresh|reload|συγχρον/.test(low) && /app|globe|page/.test(low)) {
      YachtMatcher?.loadAndSyncGlobe?.();
      window.Commerce?.loadVendors?.();
      AuditorPortal?.syncGlobe?.();
      return 'Globe data refreshed — yachts · vendors · drivers · auditors';
    }
    if (/^(use\s+)?(openai|gpt|groq|gemini|deepseek|deep\s*seek|cycle|astranov)\b/i.test(low)) {
      const prov = /openai|gpt/.test(low) ? 'openai-mini'
        : /groq/.test(low) ? 'groq'
        : /gemini/.test(low) ? 'gemini'
        : /deep/.test(low) ? 'deepseek'
        : 'astranov';
      AiRouter?.setProvider?.(prov);
      LabOrbs?._syncGlyphs?.();
      return 'AI provider → ' + (AiRouter.current()?.label || prov);
    }
    if (/^summon\s+composer|^use\s+composer|^queue\s+composer/i.test(low)) {
      void CodersHub?.summonComposer?.();
      return 'Summoning Composer on your saved job…';
    }
    if (/coders?\s*hub|coder\s*labs?|ai\s*teams?|open\s*coders?|labs?\s*race|ανταγωνισμ|ομάδες/.test(low)) {
      CodersHub?.toggle?.(true);
      return 'Coders Hub open — ' + (CodersHub?.LABS?.length || 0) + ' AI teams racing on subdomains';
    }
    if (/city\s*view|zoom\s*in|shops|καταστήμα/.test(low)) {
      enterCityView?.();
      return 'City view — vendors and drivers on map';
    }
    if (/theme|bright|dark|φωτειν|σκοτειν/.test(low)) {
      const mode = /bright|light|φωτειν/.test(low) ? 'bright' : 'dark';
      AstranovTheme?.set?.(mode);
      return 'Theme → ' + mode;
    }
    if (/yacht|charter|booker|ενοικ/.test(low) && /open|list|show|άνοιξε|δείξε/.test(low)) {
      YachtMatcher?.openBooking?.(null, { tab: 'booker' });
      return 'Opened yachts.astranov.eu Booker';
    }
    if (/audit|auditor|accountant|λογιστ|λογιστή|λογιστές|ισολογισμ|ισοζύγι|καθολικ/.test(low) && /open|άνοιξε|show|δείξε|πήγαινε|go|start|^audit|^λογιστ/.test(low)) {
      const tab = /ισολογισμ/.test(low) ? 'balance' : /ισοζύγι/.test(low) ? 'trial' : /καθολικ|ledger/.test(low) ? 'ledger' : /μισθοδοσ/.test(low) ? 'payroll' : /φόρ|tax/.test(low) ? 'tax' : 'company';
      AuditorPortal?.open?.({ tab });
      return 'Άνοιγμα auditors.astranov.eu · ' + tab;
    }
    if (/^(audit|auditors|λογιστ)/.test(low)) {
      AuditorPortal?.open?.({ tab: 'company' });
      return 'Άνοιγμα auditors.astranov.eu';
    }
    if (/avc|coin|ledger|justice|wallet|κρυπτο|νόμισμα/.test(low) && /balance|ledger|open|show|wallet|δείξε/.test(low)) {
      if (/open|wallet|show|δείξε/.test(low)) CoinPortal?.open?.(/ledger|transparen/.test(low) ? 'transparency' : 'wallet');
      else AvcJustice?.cli?.(['avc', /ledger|διαφάν|transparen/.test(low) ? 'ledger' : 'balance']);
      return 'coin.astranov.eu — AVC wallet · 1 AVC = 1 EUR · work-mint only';
    }
    return null;
  },

  formatHonestReply(r, userMsg) {
    const text = String(r.text || r.response || '').trim();
    if (!text) return '';
    const id = r.summon_id || r.composer_queued;
    if (id && this.isBuildTask(userMsg)) {
      const stripped = text.replace(/\b(done|fixed|implemented|completed|applied)\b/gi, '').trim();
      return (stripped ? stripped.slice(0, 280) + '\n\n' : '')
        + 'Build queued #' + id + ' — Composer applies code. Say: coders poll ' + id;
    }
    return text;
  },

  wantsComposer(m) {
    return this.fallbackPrefs.force === 'composer'
      || /^use\s+composer|queue\s+composer|summon\s+composer|back\s+to\s+composer/i.test(String(m || ''));
  },

  async queueCoder(task, engine) {
    if (!Auth?.user) return { error: 'sign in with G for build queue' };
    const eng = engine || (this.wantsComposer(task) ? 'composer' : 'grok');
    const q = await AciCli.api({
      mode: 'coders',
      task: task,
      coder_engine: eng,
      history: this.history.slice(-6),
      fallback_prefs: this.fallbackPrefs,
    });
    if (q.error && AciCli) AciCli.print('coders error: ' + q.error, 'err');
    if (q.summon_id) {
      this.lastSummonId = q.summon_id;
      if (q.composer_queued) this.startPoll(q.composer_queued);
    }
    return q;
  },

  async chat(message, opts = {}) {
    const m = String((window.fixVoiceHotwords || (x => x))(String(message || ''))).trim();
    if (m.length < 1) return this.enterSession({ fromVoice: !!opts.fromVoice });

    const localFix = this.tryLocalFix(m);
    if (localFix) {
      AciCli?.print(localFix, 'ok');
      ACIControl?.reply(localFix.slice(0, 260));
      if (Auth?.user && this.isBuildTask(m)) {
        const q = await this.queueCoder(m, 'grok').catch(() => ({}));
        if (q.summon_id) AciCli?.print('Also queued #' + q.summon_id + ' for Composer', 'dim');
      }
      if (opts.fromVoice || window._handsFreeVoice) scheduleVoiceResume?.();
      return { ok: true, local: true, text: localFix };
    }

    const localGlobe = this.runLocalGlobeCmd(m);
    if (localGlobe) {
      GlobeDeck?.setThinking(false);
      return localGlobe;
    }
    if (AstranovPresence?.wantsKryftoStart?.(m)) {
      GlobeDeck?.setThinking(false);
      AstranovPresence?.startKryfto?.();
      return { ok: true, game: 'kryfto' };
    }
    if (TelemachosPilot?.wantsCmd?.(m)) {
      GlobeDeck?.setThinking(false);
      await TelemachosPilot.cli([], m);
      return { ok: true, pilot: 'telemachos' };
    }
    if (/yacht|charter|crew|captain|match|ενοικ|supply|demand|field\s+\w+/.test(m.toLowerCase())) {
      const ev = await YachtMatcher?.evolveFromText?.(m);
      if (ev?.best) {
        GlobeDeck?.setThinking(false);
        const msg = YachtMatcher?.formatMatch?.(ev.best) || '';
        ACIControl?.reply(msg);
        return { ok: true, yacht: ev };
      }
      if (/field|parameter|develop/.test(m.toLowerCase())) {
        this.observeActivity('field_evolve', m.slice(0, 100), {});
      }
    }
    if (/hellenic|ξενία|arete|logos|μῆτις|καιρός/i.test(m)) {
      HellenicSource?.groundCoders?.(m);
    }

    await this.enterSession({
      focus: false,
      fromVoice: !!opts.fromVoice || !!window._handsFreeVoice || !!voiceSessionActive,
    });

    if (Auth?.user && !(await this.ensureSession())) {
      return this._guaranteeReply(m, { error: 'session expired', text: 'Session expired — tap G to sign in again.' });
    }

    const build = this.isBuildTask(m);
    const fast = (!build && !this.wantsComposer(m)) || m.length < 600;
    if (!fast) MapDepict?.action('think', { detail: 'coders: ' + m.slice(0, 40) });

    this._cliBusy = true;
    if (this._chatWatchdog) clearTimeout(this._chatWatchdog);
    this._chatWatchdog = setTimeout(() => {
      this._cliBusy = false;
      GlobeDeck?.setThinking?.(false);
    }, 55000);
    try {
      GlobeDeck?.setThinking(true, 'Grok…');
      if (/^city\s*(view|level|map)?$/i.test(m.trim())) {
        const city = await Promise.race([
          enterCityView?.(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('city view timeout')), 22000)),
        ]).catch(e => ({ error: String(e.message || e) }));
        const shops = city?.vendors?.length ?? 0;
        const msg = city?.error
          ? 'City view failed — ' + city.error + '. Try locate first.'
          : 'City map open — ' + shops + ' shops nearby. Tap a pin or type order.';
        return this._guaranteeReply(m, { text: msg, via: 'local/city' });
      }

      if (Auth?.user && this.wantsComposer(m) && build) {
        const q = await this.queueCoder(m, 'composer');
        GlobeDeck?.setThinking(false);
        if (q.text && !q.error) {
          return this._applyResponse({ ...q, label: q.label || 'Astranov Coders', team: true }, m);
        }
      }

      if (this.isPing(m)) {
        void AciCli.api({
          mode: 'coders_chat',
          message: m,
          fast: true,
          history: this.history.slice(-4),
          fallback_prefs: this.fallbackPrefs,
        }, { timeoutMs: 12000 }).catch(() => {});
        GlobeDeck?.setThinking(false);
        const pingReply = this.localReply(m);
        if (window._handsFreeVoice && Voice?.shouldSpeak?.(pingReply)) {
          speak(pingReply.slice(0, 100), () => resumeListening?.(), false);
        }
        return this._applyResponse({ text: pingReply, via: 'local/ping' }, m);
      }

      const grokPrefs = { ...this.fallbackPrefs, force: this.fallbackPrefs.force || 'xai' };
      let r = await AciCli.api({
        mode: 'coders_chat',
        message: m,
        fast: true,
        history: this.history.slice(-8),
        fallback_prefs: grokPrefs,
      }, { timeoutMs: GlobeDeck?._isMobileDeck?.() ? 32000 : 38000 });

      let text = String(r.text || r.response || '').trim();
      if (this.isFailedReply(text)) text = '';
      if (r.error || !text) {
        const fb = await AciCli.api({
          mode: 'coders',
          task: m,
          coder_engine: 'fallback',
          fallback: true,
          fallback_prefs: { ...this.fallbackPrefs, force: 'groq' },
          history: this.history.slice(-4),
        }, { timeoutMs: 22000 });
        const fbText = String(fb.text || fb.response || '').trim();
        if (fbText && !this.isFailedReply(fbText)) {
          GlobeDeck?.setThinking(false);
          return this._applyResponse({ ...fb, text: fbText, team: true }, m);
        }
        if (Auth?.user && build) {
          const q = await this.queueCoder(m, 'grok');
          if (q.text && !q.error && !this.isFailedReply(q.text)) {
            GlobeDeck?.setThinking(false);
            return this._applyResponse({ ...q, text: q.text, team: true }, m);
          }
        }
        if (r.error && !text) {
          GlobeDeck?.setThinking(false);
          return this._applyResponse({ text: this.localReply(m), via: 'local/fallback' }, m);
        }
        text = this.localReply(m);
        r = { ...r, text, response: text, via: 'local' };
      }

      if (Auth?.user && build && !r.summon_id) {
        const q = await this.queueCoder(m, this.wantsComposer(m) ? 'composer' : 'grok');
        if (q.summon_id) {
          r.summon_id = q.summon_id;
          r.composer_queued = q.composer_queued;
          if (!r.text && q.text) { r.text = q.text; r.response = q.text; }
        }
      }

      return this._guaranteeReply(m, r);
    } catch (e) {
      const msg = String(e.message || e);
      GlobeDeck?.showError('Coders failed: ' + msg);
      if (Auth?.user && build) {
        const q = await this.queueCoder(m, 'grok').catch(() => ({}));
        if (q.text) return this._guaranteeReply(m, { ...q, team: true });
      }
      return this._guaranteeReply(m, { error: msg, via: 'local/error' });
    } finally {
      if (this._chatWatchdog) { clearTimeout(this._chatWatchdog); this._chatWatchdog = null; }
      this._cliBusy = false;
      GlobeDeck?.setThinking?.(false);
    }
  },

  async handleCodersCommand(rest, opts = {}) {
    const msg = String(rest || '').trim();
    if (!msg || /^coders?$/i.test(msg)) {
      return this.enterSession({
        ping: !!this._sessionWelcomed,
        fromVoice: !!opts.fromVoice || !!window._handsFreeVoice || !!voiceSessionActive,
      });
    }
    return this.handleMessage(msg, opts);
  },

  async openTeam(intro) {
    await this.autoStart();
    const msg = intro && intro.trim().length > 0 ? intro.trim() : 'online';
    return this.chat(msg);
  },

  async summon(task) {
    return this.chat(task);
  },
};
window.AciCoders = AciCoders;

// === SESSION HOLD — pause mic/tasks in noisy places, resume later ===
let sessionHeld = false;

const SessionHold = {
  STORAGE_KEY: 'astranov-session-hold-v1',
  _snapshot: null,

  storageKey() {
    const uid = Auth?.user?.id || 'guest';
    return this.STORAGE_KEY + '_' + uid;
  },

  clearForeignHold() {
    const saved = this.loadPersisted();
    if (!saved?.snapshot) return;
    const cur = Auth?.user?.id || null;
    if (saved.snapshot.userId && cur && saved.snapshot.userId !== cur) {
      this.release();
      AciCli?.print('cleared hold from another account — same login on all devices', 'dim');
    }
  },

  init() {
    const btn = document.getElementById('aci-hold');
    if (btn) btn.onclick = e => { e.preventDefault(); e.stopPropagation(); this.toggle(); };
    this.restoreIfNeeded();
    this.syncButton();
  },

  isHeld() { return sessionHeld; },

  capture() {
    const input = document.getElementById('aci-cli-in');
    return {
      savedAt: Date.now(),
      voiceSessionActive: !!voiceSessionActive,
      voiceEnabled: !!voiceEnabled,
      deckExpanded: !!GlobeDeck?.expanded,
      activeTask: GlobeDeck?.activeTask || null,
      deckTitle: document.getElementById('globe-deck-title')?.textContent || '',
      inputBuffer: input?.value || AciCli?.buffer || '',
      context: SuperCli?._context || 'idle',
      followMode: GlobeControl?.followMode || null,
      batchId: window.AstranovNode?.batchId || null,
      vhfActive: !!window.Comms?.vhfActive,
      driving: !!window.DrivingView?.active,
      userId: Auth?.user?.id || null,
    };
  },

  persist(snapshot) {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify({ held: true, snapshot }));
    } catch (_) {}
  },

  clearPersist() {
    try { localStorage.removeItem(this.storageKey()); } catch (_) {}
  },

  pauseListening() {
    if (recognition) { try { recognition.stop(); } catch (_) {} }
    isListening = false;
    Voice?.flush?.();
  },

  hold(opts = {}) {
    if (sessionHeld) return;
    const snap = this.capture();
    this._snapshot = snap;
    sessionHeld = true;
    this.pauseListening();
    this.persist(snap);
    this.syncButton();
    const deck = GlobeDeck?.deck?.();
    if (deck) deck.classList.add('session-held');
    const input = document.getElementById('aci-cli-in');
    if (input) input.placeholder = '⏸ held — tap ▶ to resume';
    GlobeDeck?.setPreview('⏸ Session held — mic & tasks paused');
    AciCli?.print('⏸ Session held — leave noisy area, tap ▶ to resume', 'dim');
    if (!opts.quiet) ACIControl?.reply('Held — tap ▶ when ready to resume');
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
    GlobeDeck?.syncCliPulse?.();
  },

  async resume(opts = {}) {
    if (!sessionHeld) return;
    const snap = this._snapshot || this.loadPersisted()?.snapshot;
    sessionHeld = false;
    this.syncButton();
    const deck = GlobeDeck?.deck?.();
    if (deck) deck.classList.remove('session-held');
    const input = document.getElementById('aci-cli-in');
    if (input) input.placeholder = 'type or tap 🎤 · Enter or ➡';

    if (snap) {
      if (snap.deckExpanded) GlobeDeck?.expand(snap.deckTitle || SuperCli?.title || 'Astranov Command Line');
      if (snap.activeTask) GlobeDeck.activeTask = snap.activeTask;
      if (snap.inputBuffer && input) {
        input.value = snap.inputBuffer;
        if (AciCli) AciCli.buffer = snap.inputBuffer;
      }
      if (snap.context) SuperCli?.setContext?.(snap.context);
      if (snap.voiceSessionActive || snap.voiceEnabled) {
        voiceSessionActive = true;
        voiceEnabled = true;
      }
      if (window.AciCli) AciCli.open = !!snap.deckExpanded;
    }

    this.clearPersist();
    this._snapshot = null;
    AciCli?.print('▶ Session resumed', 'ok');
    GlobeDeck?.setPreview('▶ Resumed');
    if (!opts.quiet) ACIControl?.reply('Resumed — Astranov Command Line active');

    if (snap?.voiceSessionActive || snap?.voiceEnabled) {
      setTimeout(() => startVoiceOptions?.(), 400);
    } else {
      scheduleVoiceResume?.();
    }
    SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
    GlobeDeck?.syncCliPulse?.();
  },

  loadPersisted() {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  },

  restoreIfNeeded() {
    const saved = this.loadPersisted();
    if (!saved?.held || !saved.snapshot) return;
    this._snapshot = saved.snapshot;
    sessionHeld = true;
    voiceSessionActive = false;
    voiceEnabled = false;
    this.pauseListening();
    this.syncButton();
    const deck = GlobeDeck?.deck?.();
    if (deck) deck.classList.add('session-held');
    const input = document.getElementById('aci-cli-in');
    if (input) input.placeholder = '⏸ held — tap ▶ to resume';
    if (saved.snapshot.deckTitle) GlobeDeck?.setTitle(saved.snapshot.deckTitle);
    GlobeDeck?.setPreview('⏸ Session held — tap ▶ to resume');
    setTimeout(() => {
      AciCli?.print('⏸ Restored held session — tap ▶ to resume', 'dim');
    }, 600);
    GlobeDeck?.syncCliPulse?.();
  },

  release() {
    sessionHeld = false;
    this._snapshot = null;
    this.clearPersist();
    this.pauseListening();
    this.syncButton();
    const deck = GlobeDeck?.deck?.();
    if (deck) deck.classList.remove('session-held');
    const input = document.getElementById('aci-cli-in');
    if (input) input.placeholder = 'type or tap 🎤 · Enter or ➡';
    GlobeDeck?.syncCliPulse?.();
  },

  toggle() {
    if (sessionHeld) this.resume();
    else this.hold();
  },

  syncButton() {
    const btn = document.getElementById('aci-hold');
    if (!btn) return;
    if (sessionHeld) {
      btn.textContent = '▶';
      btn.title = 'Resume session — restore mic & tasks';
      btn.classList.add('deck-btn-active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.textContent = '⏸';
      btn.title = 'Hold session — pause mic & tasks for noisy places';
      btn.classList.remove('deck-btn-active');
      btn.setAttribute('aria-pressed', 'false');
    }
  },
};
window.SessionHold = SessionHold;

// === ASTRANOV COLLECTIVE INTELLIGENCE (ACI) — FINAL ===
// Synthesized from all AI specs: pure globe + three modes + council + self-evolving neurons.
// Single API: /functions/v1/aci (think | evolve | log | teach | stats | seed)
const SUPABASE_REF = 'lkoatrkhuigdolnjsbie';
const SUPABASE_DEFAULT_URL = 'https://' + SUPABASE_REF + '.supabase.co';
const SB_URL = typeof resolveAstranovSupabaseUrl === 'function'
  ? resolveAstranovSupabaseUrl()
  : SUPABASE_DEFAULT_URL;

// === MISSION SUPPORT REPORTER — daily problems + progression → support digest ===
const MissionSupportReporter = {
  LS_DAY: 'astranov:support-digest-day',
  LS_PROBLEMS: 'astranov:support-problems',
  LS_WINS: 'astranov:support-wins',
  CHECK_MS: 60 * 60 * 1000,
  _bootAt: Date.now(),
  _timer: null,
  _submitting: false,

  utcDay() {
    return new Date().toISOString().slice(0, 10);
  },

  buildStamp() {
    return document.querySelector('meta[name="astranov-build"]')?.content || '';
  },

  _load(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
  },

  _save(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr.slice(-80))); } catch (_) {}
  },

  recordProblem(type, message, context) {
    const row = { type: String(type || 'problem'), message: String(message || '').slice(0, 400), ts: Date.now(), context: context || {} };
    const buf = this._load(this.LS_PROBLEMS);
    buf.push(row);
    this._save(this.LS_PROBLEMS, buf);
    if (buf.length >= 3) this._maybeSubmit('problem_threshold');
  },

  recordProgress(subsystem, detail, props) {
    const s = String(subsystem || 'field');
    if (!/order|commerce|route|delivery|vendor|driver|globe|city|mission|claim|evolve|crawler|channel|chat|coders|think|voice|grok|xai|brain/i.test(s + ' ' + (detail || ''))) return;
    const row = { subsystem: s, detail: String(detail || '').slice(0, 200), ts: Date.now(), props: props || {} };
    const buf = this._load(this.LS_WINS);
    buf.push(row);
    this._save(this.LS_WINS, buf);
  },

  collectStats() {
    const missions = MarketplaceDeliveryEngine?.missions || [];
    const active = missions.filter(m => MarketplaceDeliveryEngine?.STATUS?.[m.status]?.active).length;
    return {
      build: this.buildStamp(),
      globe_tier: ZoomTiers?.current || CosmicZoom?.level || 'earth',
      active_missions: active,
      total_missions: missions.length,
      session_minutes: Math.round((Date.now() - this._bootAt) / 60000),
      coders_events: AciCoders?._activityCount || 0,
      user_logged_in: !!Auth?.user,
      host: location.hostname || '',
    };
  },

  async submitDaily(trigger) {
    if (this._submitting) return;
    const today = this.utcDay();
    let lastDay = '';
    try { lastDay = localStorage.getItem(this.LS_DAY) || ''; } catch (_) {}
    if (lastDay === today && trigger !== 'force') return;

    this._submitting = true;
    const problems = this._load(this.LS_PROBLEMS);
    const progression = this._load(this.LS_WINS);
    const stats = this.collectStats();
    const fnUrl = (typeof resolveAstranovFunctionsUrl === 'function' ? resolveAstranovFunctionsUrl() : SB_URL + '/functions/v1') + '/support-digest';
    const key = ACI?.key || '';
    const sessionId = window._sessionId || AiRouter?._sessionId || 'web';

    try {
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          action: 'client_report',
          digest_date: today,
          session_id: sessionId,
          build: stats.build,
          problems,
          progression,
          stats,
          trigger: trigger || 'daily',
          force_daily: true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok) {
        try { localStorage.setItem(this.LS_DAY, today); } catch (_) {}
        this._save(this.LS_PROBLEMS, []);
        this._save(this.LS_WINS, []);
        if (j.notified) GlobeDeck?.log?.('Support digest sent · Astranov + xAI · ' + today, 'dim');
        else if (!j.skipped) GlobeDeck?.log?.('Support digest stored · Astranov + xAI · ' + today, 'dim');
      }
    } catch (_) { /* retry next hour */ }
    finally { this._submitting = false; }
  },

  _maybeSubmit(reason) {
    const today = this.utcDay();
    let lastDay = '';
    try { lastDay = localStorage.getItem(this.LS_DAY) || ''; } catch (_) {}
    if (lastDay !== today) void this.submitDaily(reason);
  },

  init() {
    setTimeout(() => this._maybeSubmit('boot'), 8000);
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._maybeSubmit('hourly'), this.CHECK_MS);
    this.recordProgress('mission', 'SpaceNet boot · build ' + this.buildStamp(), { subsystems: ['GlobeNavigate', 'MarketplaceDeliveryEngine', 'FieldWork', 'BrainNeurons', 'SpaceNetScenarioRunner', 'SpaceNetGeo', 'SpaceNetCycle', 'ClassifiedTriangles'] });
  },
};
window.MissionSupportReporter = MissionSupportReporter;

const ACI = {
  name: 'SpaceNet Collective Intelligence',
  url: SB_URL,
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2F0cmtodWlnZG9sbmpzYmllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODIwOTIsImV4cCI6MjA5NDQ1ODA5Mn0.qf6Kg93YLJ0coTdVQa4baU0ppOdFY5WkmVzMvEV6ejI',
  neurons: [],
  history: [],
  thinkMode: '',
  evolving: false,
  heartbeat: null,
  lastPulse: 0,

  async headers() {
    if (window.Auth?.authHeaders) return Auth.authHeaders();
    return { 'Content-Type': 'application/json', apikey: this.key, Authorization: 'Bearer ' + this.key };
  },

  api(body) {
    return this.headers().then(h => fetchJson(this.url + '/functions/v1/aci', {
      method: 'POST', headers: h, body: JSON.stringify(body || {})
    }, 55000));
  },

  _logQueue: [],
  _logTimer: null,
  feed(action, detail) {
    this._logQueue.push({ action, detail: detail || '', ts: Date.now() });
    if (!this._logTimer) {
      this._logTimer = setTimeout(() => {
        const batch = this._logQueue.splice(0, 8);
        this._logTimer = null;
        if (batch.length) this.api({ mode: 'log', action: 'batch', detail: batch.map(b => b.action + ':' + b.detail).join('; ').slice(0, 600) });
      }, 30000);
    }
  },

  spawnNeuron(lat, lng, strength, principle) {
    const pos = latLngToPos(lat, lng, 1.035);
    const n = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.85 })
    );
    n.position.set(pos.x, pos.y, pos.z);
    n.userData = { strength: strength || 1, id: 'neuron-' + Date.now() + Math.random(), principle: principle || '' };
    earth.add(n);
    this.neurons.push(n);
    if (window.AIGraphics) AIGraphics.spawnEffect(n.position, 0x00ffaa, 10, 20);
    return n;
  },

  syncNeuronsFromPrinciples(principles) {
    if (!Array.isArray(principles) || !principles.length) return;
    const seeds = [
      { lat: 36.22, lng: 28.12 }, { lat: 40, lng: 20 }, { lat: -15, lng: 45 },
      { lat: 55, lng: -30 }, { lat: 10, lng: -75 }, { lat: -35, lng: 140 }
    ];
    principles.slice(0, seeds.length).forEach((p, i) => {
      const s = seeds[i];
      const str = typeof p === 'string' ? 1.2 : (p.strength || p.importance || 1.2);
      const text = typeof p === 'string' ? p : (p.content || '');
      this.spawnNeuron(s.lat, s.lng, str, text);
    });
  },

  async think(prompt, opts = {}) {
    if (window._aciAbort) { try { window._aciAbort.abort(); } catch (_) {} }
    window._aciAbort = new AbortController();
    const fast = opts.fast !== false;
    if (!opts._wrapped) {
      GlobeDeck?.setMapStatus('ACI — thinking…');
      GlobeDeck?.setThinking(true, '◎ 3D think…');
    }
    const h = await this.headers();
    let r;
    try {
      r = await fetchJson(this.url + '/functions/v1/aci', {
        method: 'POST', headers: h,
        body: JSON.stringify({
          mode: 'think', prompt, fast: true,
          history: this.history.slice(-4),
          aci_mode: this.thinkMode || undefined,
        }),
      }, Responsive3D?.FAST_MS || 8000);
    } catch (e) {
      r = { error: String(e.message || e) };
    }
    GlobeDeck?.setThinking(false);
    if (r.aborted) return '';
    if (r.error) {
      const err = 'ACI error: ' + r.error + (r._httpStatus === 401 ? ' — tap G to sign in' : '');
      GlobeDeck?.showError(err);
      return err;
    }
    const raw = (r.text || r.response || '').trim() || 'Το Astranov συγκεντρώνεται — δοκίμασε ξανά.';
    const text = ArcangeloDialect?.repairTranscript?.(raw) || raw;
    this.history.push({ role: 'user', content: prompt });
    this.history.push({ role: 'assistant', content: text });
    if (this.history.length > 20) this.history = this.history.slice(-20);
    this.feed('think', prompt.slice(0, 80));
    BrainNeurons?.recordActivity?.('think', prompt.slice(0, 120));
    this.pulse(1.4);
    GlobeDeck?.say(text, 'reply');
    return text;
  },

  async teach(content) {
    const tLat = 36.2 + (Math.random() - 0.5) * 4;
    const tLng = 28.1 + (Math.random() - 0.5) * 4;
    MapDepict.action('teach', { lat: tLat, lng: tLng, detail: content.slice(0, 50) });
    await this.api({ mode: 'teach', content });
    this.feed('teach', content.slice(0, 120));
    BrainNeurons?._ingest?.([{ content, strength: 1.5 }], 'taught');
    this.spawnNeuron(tLat, tLng, 1.4, content);
    return true;
  },

  async evolve(reason) {
    if (this.evolving) return null;
    this.evolving = true;
    MapDepict.action('evolve', { detail: reason || 'collective' });
    try {
      const r = await this.api({ mode: 'evolve', activity: reason || 'user-triggered' });
      const births = Math.max(1, Math.min(4, Number(r.brain && r.brain.new_neurons) || 1));
      for (let i = 0; i < births; i++) {
        this.spawnNeuron((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 160, 1.1 + Math.random() * 0.4);
      }
      if (r.principles && r.principles.length) {
        this.syncNeuronsFromPrinciples(r.principles);
        BrainNeurons?._ingest?.(r.principles, 'evolve');
      }
      if (window.AIGraphics) AIGraphics.spawnEffect(new THREE.Vector3(0, 1.2, 0), 0x00ff88, 35, 45);
      const avg = this.neurons.length ? this.neurons.reduce((s, n) => s + (n.userData.strength || 1), 0) / this.neurons.length : 1;
      idleRoll = 0;
      this.pulse(2.0);
      console.log('%c[ACI FINAL] evolved', 'color:#00ff88', r);
      return r;
    } finally { this.evolving = false; }
  },

  async init() {
    console.log('%c[ACI] ready — neurons growing with every user', 'color:#00ddff');
    this.attachHeartbeat();
  },

  attachHeartbeat() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.008, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xaa66ff, transparent: true, opacity: 0.75 })
    );
    ring.position.set(0.75, -0.55, -1.2);
    camera.add(ring);
    this.heartbeat = ring;
  },

  pulse(scale) {
    this.lastPulse = Date.now();
    if (this.heartbeat) this.heartbeat.scale.set(scale, scale, scale);
  },

  tick() {
    if (!this.heartbeat) return;
    const t = Date.now() / 500;
    const base = 0.85 + Math.sin(t) * 0.12;
    const boost = (Date.now() - this.lastPulse < 2000) ? 0.25 : 0;
    this.heartbeat.scale.set(base + boost, base + boost, base + boost);
    this.heartbeat.material.opacity = 0.55 + Math.sin(t * 1.3) * 0.2 + boost;
  }
};
window.AstranovCollectiveIntelligence = ACI;

const SB_KEY = ACI.key;
const sbHeaders = () => ({ apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' });

// ── ACI CONTROL (text + buttons — you command the collective) ──
const ACIControl = {
  init() {
    SuperCli?.init?.();
  },
  reply(text) {
    let msg = ArcangeloDialect?.repairBrands?.(String(text || '')) ?? String(text || '');
    msg = String(ArcangeloDialect?.repairOutbound?.(msg, 'reply') ?? msg).slice(0, 280);
    if (!msg.trim()) msg = 'Coders online.';
    GlobeDeck?.say(msg, 'reply');
  },

  voiceAck(msg, fromVoice) {
    if (!fromVoice || !Voice.maySpeak()) return;
    const line = ArcangeloDialect?.repairOutbound?.(msg, 'reply') ?? msg;
    speak(String(line || '').slice(0, 120), () => resumeListening(), false);
  },

  async handle(text, opts = {}) {
    if (!text) return { executed: false };
    text = (window.fixVoiceHotwords || (x => x))(String(text).trim());
    GlobeDeck?.onUserMessage('Collective — ' + text.slice(0, 36));
    const fromVoice = !!opts.fromVoice;
    const low = text.toLowerCase().trim();
    const say = (msg) => this.voiceAck(msg, fromVoice);

    const routed = await SuperCli?.exec?.(text, { fromVoice });
    if (routed?.handled) return { executed: true, action: 'supercli' };

    if (/^(hold|pause session|quiet mode|κράτα|κρατα|σίγαση|σιγαση)\b/.test(low)) {
      SessionHold?.hold?.();
      return { executed: true, action: 'hold' };
    }
    if (/^(resume|unhold|continue|συνέχισε|συνεχισε|ξανα)\b/.test(low)) {
      await SessionHold?.resume?.();
      return { executed: true, action: 'resume' };
    }
    if (SessionHold?.isHeld?.()) {
      this.reply('Session held — tap ▶ or say resume');
      say('Held. Say resume when ready.');
      return { executed: false, action: 'held' };
    }
    if (/^(stop|στα��άτα|σταματα|pause|διακοπή|quiet|σιωπή|mute)/.test(low)) {
      userIntervene();
      return { executed: true, action: 'stop' };
    }
    if (/^(cli|terminal|console|κονσόλα)$/.test(low)) { AciCli.toggle(); this.reply('CLI panel'); say('CLI.'); return { executed: true }; }
    if (/^slumber\b|^performance\b|^wake\b|^sleep\b/.test(low)) {
      let parts = text.trim().split(/\s+/);
      if (/^slumber\b/i.test(parts[0])) parts = parts.length > 1 ? parts.slice(1) : ['status'];
      if (/^performance\b/i.test(parts[0])) parts = ['status'];
      await SlumberManager?.cli?.(parts);
      return { executed: true, action: 'slumber' };
    }
    if (/^resources?\b|^spacenet resources|^boost\b/.test(low)) {
      let parts = text.trim().split(/\s+/);
      if (/^boost\b/i.test(parts[0])) parts = ['boost', ...parts.slice(1)];
      else if (/^resources?\b/i.test(parts[0])) parts = parts.length > 1 ? parts.slice(1) : ['status'];
      await SpaceNetResourceMonitor?.cli?.(parts);
      return { executed: true, action: 'resources' };
    }
    if (/^donate\b/.test(low)) {
      const parts = text.trim().split(/\s+/);
      await SpaceNetResourceMonitor?.cli?.(['donate', ...parts.slice(1)]);
      return { executed: true, action: 'donate' };
    }
    if (/^fleet\b/.test(low)) {
      const parts = text.trim().split(/\s+/);
      await SpaceNetFleet?.cli?.(parts.slice(1));
      return { executed: true, action: 'fleet' };
    }
    if (/^summon\s+coders?\s*/i.test(text) || /^coders\b/i.test(low)) {
      const bare = /^coders?\s*$/i.test(text.trim()) || /^summon\s+coders?\s*$/i.test(text.trim());
      if (bare) await AciCoders?.enterSession?.({ fromVoice });
      else await AciCoders?.handleMessage(text, { fromVoice });
      return { executed: true, action: 'coders' };
    }
    if (/^(use\s+)?(grok|composer)$/.test(low) || /^switch\s+(to\s+)?(grok|composer)$/.test(low)) {
      const eng = low.match(/grok|composer/)?.[0];
      if (eng) AciCoders?.setEngine(eng);
      else AciCoders?.toggleEngine();
      ACIControl.reply('Coders: ' + (AciCoders?.engine || 'grok'));
      say('Coders ' + (AciCoders?.engine || 'grok') + '.');
      return { executed: true, action: 'coders_engine' };
    }
    if (/^(connect|open|link|σύνδεση aci)$/.test(low)) { await AciConnect.open(); return { executed: true }; }
    if (/^super batch|superbatch|batch|work together|δουλεψε μαζ|εγκατάσταση|install app|native app|node\b|μαζί/.test(low)) {
      await window.AstranovNode?.launchBatch?.();
      return { executed: true, action: 'batch' };
    }
    if (/^deploy/.test(low)) { await AciConnect.deploy(text.replace(/^deploy\s*/i, '')); return { executed: true }; }
    if (/^claim/.test(low)) {
      const oid = text.replace(/^claim\s*/i, '').trim();
      if (oid) await FieldBrain?.claimDelivery(oid);
      return { executed: true };
    }
    if (/^roles/.test(low)) {
      await FieldBrain?.onAuth();
      this.reply('Roles: ' + (FieldBrain?.roles || []).join(' + '));
      say('Roles synced.');
      return { executed: true };
    }
    if (/^(work available|available for work|i am available|διαθέσιμος|διαθεσιμ)/.test(low) || /^work need/.test(low)) {
      const tokens = text.trim().split(/\s+/);
      await FieldWork?.runCli?.(tokens[0] === 'work' ? tokens : ['work', 'available', ...tokens.slice(2)]);
      return { executed: true, action: 'work' };
    }
    if (/^work list|^jobs near|^open work/.test(low)) {
      await FieldWork?.runCli?.(['work', 'list']);
      return { executed: true, action: 'work' };
    }
    if (/^(login|sign in|google|facebook|apple|twitter)$/.test(low) || /^σύνδεση$/.test(low)) {
      Auth.signInGoogle?.() || Auth.openLoginModal?.('Sign in — one account for globe and sites');
      return { executed: true };
    }
    if (/^(logout|sign out|αποσύνδεση)$/.test(low)) { Auth.signOut(); return { executed: true }; }
    if (/telecom|sat radio|satellite radio|ασύρματο��/.test(low)) { window.Comms?.startTelecomms?.(); return { executed: true }; }
    if (/^order\s+(status|track|list|fly|last|active)\b/i.test(low)) {
      await window.OrderTracking?.cli?.(text.trim().split(/\s+/));
      return { executed: true, action: 'order_track' };
    }
    if (/pitogyra|πιτογυρ|μπίρ|τσιγαρ|order|παραγγελ|goals|work|δουλειά|delivery|διανομ|mpiro|tsigar|beer|cigar/.test(low)) {
      const q = text.replace(/^(order|παραγγελία?)\s*/i, '').trim();
      const wants = window.Commerce?.parseWantedItems?.(q) || [];
      if (wants.length >= 1 && !/^goals$/i.test(q.trim())) {
        await window.Commerce?.smartOrder?.(q || text);
      } else {
        const vendorQ = low.match(/goals|πιτο|pit|pizza|supermarket|bar/)?.[0] || '';
        await window.Commerce?.openOrderFlow?.(vendorQ || q);
      }
      return { executed: true, action: 'order' };
    }
    if (/^drive|οδήγ|οδηγ/.test(low)) {
      if (window.DrivingView) window.DrivingView.activate();
      MapDepict.action('drive', { detail: 'road mode' });
      this.reply('Driving view on globe');
      say('Driving.');
      return { executed: true, action: 'drive' };
    }
    if (/vhf|ασυρμ/.test(low) && !/video|βίντεο|youtube/.test(low)) { window.Comms?.startVHF?.(); return { executed: true }; }
    if (/phone|τηλέφων/.test(low) && !/video|βίντεο|youtube/.test(low)) { window.Comms?.startPhone?.(); return { executed: true }; }
    if (GlobeVideo?.wantsYoutube?.(text)) {
      const q = GlobeVideo.queryFromText(text) || text;
      await GlobeVideo.find(q);
      return { executed: true, action: 'youtube' };
    }
    if (/video\s+call|orbital\s+video|κλήση\s+βίντεο/.test(low)) {
      MapDepict.action('video', { detail: 'Αξαδίνα' });
      startOrbitalVideoCall('Αξαδίνα');
      return { executed: true, action: 'video' };
    }
    if (/news|νέα|ειδήσει/.test(low)) { window.NewsFeed?.flash?.(); return { executed: true }; }
    if (/vendor|κατάστη|shop|menu|μενού/.test(low) && !/superbook|booking site|web presence|my site|\.astranov\.eu/.test(low)) {
      await window.Commerce?.showPicker?.();
      return { executed: true };
    }
    if (/astranov\s*sites?|superbook|booking site|web presence|my site|create.*site|make.*site|\.astranov\.eu|astranov subdomain/.test(low)) {
      if (!Auth?.user) { Auth.openLoginModal?.('Sign in — then ask for your Astranov Site'); this.reply('Sign in — then ask again for your Astranov Site'); return { executed: true }; }
      try {
        const prov = window.AstranovSitesProvision || window.SuperBookingProvision;
        const parsed = prov.parseAsk(text);
        await prov.provision(parsed);
      } catch (e) {
        this.reply(e.message || 'Site creation failed');
      }
      return { executed: true, action: 'site_provision' };
    }
    if (/explore|εξερεύ|πήγαινε|go to|focus/.test(low)) {
      requestLocationIfNeeded(() => {
        const lat = 35 + Math.random() * 10;
        const lng = 25 + Math.random() * 10;
        const p = latLngToPos(lat, lng);
        MapDepict.action('explore', { lat, lng, detail: 'explore' });
        focusOnGlobePoint(new THREE.Vector3(p.x, p.y, p.z));
        this.reply('Exploring ' + lat.toFixed(2) + ', ' + lng.toFixed(2));
        say('Exploring.');
      });
      return { executed: true, action: 'explore' };
    }
    if (/request.*tech|orbital tech|technology|τεχνολογ/.test(low)) {
      requestOrbitalTech();
      say('Request copied.');
      return { executed: true };
    }
    if (/english|αγγλικά/.test(low)) {
      Voice.preferredListenLang = 'en-US';
      if (recognition) recognition.lang = 'en-US';
      MapDepict.action('mode', { detail: 'English listen' });
      say('English.');
      return { executed: true };
    }
    if (/ελληνικά|greek/.test(low)) {
      Voice.preferredListenLang = 'el-GR';
      if (recognition) recognition.lang = 'el-GR';
      MapDepict.action('mode', { detail: 'Greek listen' });
      say('Greek.');
      return { executed: true };
    }
    if (/athenian|αθηναϊκ/.test(low)) {
      ACI.thinkMode = 'athenian';
      MapDepict.action('mode', { detail: 'athenian' });
      say('Athenian mode.');
      return { executed: true };
    }
    if (/spartan|σπαρτιατ/.test(low)) {
      ACI.thinkMode = 'spartan';
      MapDepict.action('mode', { detail: 'spartan' });
      say('Spartan mode.');
      return { executed: true };
    }
    if (/myrmidon|μυρμιδόν/.test(low)) {
      ACI.thinkMode = 'myrmidon';
      MapDepict.action('mode', { detail: 'myrmidon' });
      say('Myrmidon mode.');
      return { executed: true };
    }
    if (/^(remember|θυμήσου|να θυμάσαι)/.test(low)) {
      const content = text.replace(/^(remember|θυμήσου|να θυμάσαι)[:,]?\s*/i, '').trim();
      await ACI.teach(content || text);
      say('Remembered.');
      return { executed: true };
    }
    if (/evolve|neuron|collective|εξέλιξη|brain/.test(low)) {
      await ACI.evolve('user-command');
      this.reply('Collective evolved on globe.');
      say('Evolved.');
      return { executed: true };
    }
    if (/^(mic|voice|μίκροφωνο|ακού)/.test(low)) {
      startVoiceOptions();
      return { executed: true };
    }
    if (/^(city\s*view|city\s*level|city\s*map|πόλη|go\s+to\s+city|drop\s+in)$/i.test(low) || /^city\s+view\b/i.test(low)) {
      const r = await enterCityView?.();
      const shops = r?.vendors?.length ?? 0;
      this.reply('City view · ' + shops + ' shops nearby');
      say('City view.');
      return { executed: true, action: 'city' };
    }
    if (/^(locate|gps|where am i|που είμαι|βρες με)$/i.test(low) || /^locate\s*(me)?$/i.test(low)) {
      locateMe?.();
      return { executed: true, action: 'locate' };
    }
    if (/^(stars?|constellations?|celestial|ship nav|navigation)$/i.test(low) || /τι αστερισμ/i.test(low)) {
      ZoomTiers?.goTo?.('global', true);
      CelestialNav?.printReport?.();
      return { executed: true, action: 'stars' };
    }

    if (GlobeDeck?.activeTask === 'coders' || window._aciCodersAlwaysOn) {
      await AciCoders?.handleMessage(text, { fromVoice });
      return { executed: true, action: 'coders' };
    }

    if (low.length < 4) {
      this.reply('Use globe gestures · or open ' + (AstroGlyphs?.cli || '💻') + ' CLI · or say coders, order, explore');
      if (fromVoice) say('Say coders, order, or explore.');
      return { executed: false };
    }

    await AciCoders?.handleMessage(text, { fromVoice });
    return { executed: true, action: 'coders' };
  }
};

// === MAP PINS — shops · driver base · client delivery address ===
const MapPins = {
  _ready: false,

  init() {
    if (this._ready) return;
    this._ready = true;
    this.loadLocal();
    this.syncGlobe();
  },

  loadLocal() {
    try {
      const cd = localStorage.getItem('astranov_client_delivery');
      if (cd) window._clientDelivery = JSON.parse(cd);
    } catch (_) {}
    try {
      const db = localStorage.getItem('astranov_driver_base');
      if (db) window._driverBase = JSON.parse(db);
    } catch (_) {}
    try {
      const legacy = localStorage.getItem('astranov_delivery_base');
      if (legacy && !window._driverBase) window._driverBase = JSON.parse(legacy);
    } catch (_) {}
  },

  async loadFromProfile() {
    if (!Auth?.user || !Auth?.client) return;
    try {
      const { data } = await Auth.client
        .from('profiles')
        .select('profile_page,field_lat,field_lng')
        .eq('id', Auth.user.id)
        .maybeSingle();
      Auth._profilePage = this._pageObj(data?.profile_page);
      const pins = Auth._profilePage?.map_pins;
      if (pins?.client_delivery?.lat != null) {
        window._clientDelivery = {
          ...pins.client_delivery,
          photo_url: this._firstUrl(pins.client_delivery.photo_url, pins.client_delivery.entrance_photo_url, this.entrancePhotoUrl(Auth._profilePage)),
        };
        localStorage.setItem('astranov_client_delivery', JSON.stringify(window._clientDelivery));
      }
      if (pins?.driver_base?.lat != null) {
        window._driverBase = {
          ...pins.driver_base,
          photo_url: this._firstUrl(pins.driver_base.photo_url, pins.driver_base.profile_photo_url, this.authAvatarUrl()),
        };
        localStorage.setItem('astranov_driver_base', JSON.stringify(window._driverBase));
      } else if (data?.field_lat != null && data?.field_lng != null && !window._driverBase) {
        window._driverBase = {
          lat: data.field_lat,
          lng: data.field_lng,
          label: 'Driver base',
          photo_url: this.authAvatarUrl(),
        };
      }
      this.syncGlobe();
    } catch (_) {}
  },

  async persist() {
    const payload = {
      client_delivery: window._clientDelivery || null,
      driver_base: window._driverBase || null,
      updated_at: new Date().toISOString(),
    };
    try { localStorage.setItem('astranov_map_pins', JSON.stringify(payload)); } catch (_) {}
    if (window._clientDelivery) {
      try { localStorage.setItem('astranov_client_delivery', JSON.stringify(window._clientDelivery)); } catch (_) {}
    }
    if (window._driverBase) {
      try { localStorage.setItem('astranov_driver_base', JSON.stringify(window._driverBase)); } catch (_) {}
    }
    if (!Auth?.user) return;
    try {
      const headers = await Auth.authHeaders();
      const prof = await Auth.client.from('profiles').select('profile_page').eq('id', Auth.user.id).maybeSingle();
      const page = (prof?.data?.profile_page && typeof prof.data.profile_page === 'object') ? prof.data.profile_page : {};
      page.map_pins = payload;
      await fetch(SB_URL + '/rest/v1/profiles?id=eq.' + Auth.user.id, {
        method: 'PATCH', headers,
        body: JSON.stringify({ profile_page: page, updated_at: new Date().toISOString() }),
      });
    } catch (_) {}
  },

  _pageObj(page) {
    return (page && typeof page === 'object') ? page : {};
  },

  _firstUrl() {
    for (let i = 0; i < arguments.length; i++) {
      const u = arguments[i];
      if (typeof u === 'string' && u.length > 8 && !u.startsWith('blob:')) return u;
    }
    return '';
  },

  authAvatarUrl() {
    const page = this._pageObj(Auth?._profilePage);
    const meta = Auth?.user?.user_metadata || {};
    return this._firstUrl(
      page.avatar_url,
      page.profile_photo_url,
      meta.avatar_url,
      meta.picture
    );
  },

  entrancePhotoUrl(page) {
    page = this._pageObj(page || Auth?._profilePage);
    return this._firstUrl(page.entrance_photo_url, page.delivery_entrance_url, page.avatar_url, this.authAvatarUrl());
  },

  driverPhotoUrl(driver, page) {
    page = this._pageObj(page || driver?.profile_page);
    return this._firstUrl(page.avatar_url, page.profile_photo_url, page.driver_photo_url, driver?.photo_url, driver?.avatar_url);
  },

  vendorLogo(v) {
    if (window.AstranovCityShop?.isConstructionVendor?.(v)) return window.AstranovCityShop.LOGO || '/icon.svg';
    let t = v?.tags;
    if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = {}; } }
    return this._firstUrl(t?.profile_url, t?.logo_url, t?.avatar_url);
  },

  clientPinPhoto(cd) {
    cd = cd || window._clientDelivery;
    return this._firstUrl(cd?.photo_url, cd?.entrance_photo_url, this.entrancePhotoUrl());
  },

  driverBasePhoto(db) {
    db = db || window._driverBase;
    return this._firstUrl(db?.photo_url, db?.profile_photo_url, this.authAvatarUrl());
  },

  initials(name) {
    const s = String(name || '?').trim();
    const parts = s.split(/[\s·.]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (s[0] || '?').toUpperCase();
  },

  setClientDelivery(lat, lng, label) {
    const photo = this.clientPinPhoto() || this.entrancePhotoUrl();
    window._clientDelivery = {
      lat, lng,
      label: label || 'Delivery address',
      photo_url: photo || '',
      ts: Date.now(),
    };
    this.persist();
    this.syncGlobe();
    MapDepict?.pulse?.(lat, lng, 0x44ff88, 'delivery address', 10000);
    ACIControl?.reply?.('Client delivery address set · orders deliver here');
  },

  async setDriverBase(lat, lng, label) {
    const photo = this.driverBasePhoto() || this.authAvatarUrl();
    window._driverBase = {
      lat, lng,
      label: label || 'Driver base',
      photo_url: photo || '',
      ts: Date.now(),
    };
    try { localStorage.setItem('astranov_driver_base', JSON.stringify(window._driverBase)); } catch (_) {}
    if (Auth?.user && Auth?.client) {
      const roles = Array.from(new Set([...(FieldBrain?.roles || ['client']), 'driver']));
      Auth.client.from('profiles').update({
        roles,
        is_vendor: roles.includes('vendor'),
        field_lat: lat,
        field_lng: lng,
        field_seen_at: new Date().toISOString(),
      }).eq('id', Auth.user.id).then(() => {});
      FieldBrain.roles = roles;
      FieldBrain?.updateChip?.();
    }
    await this.persist();
    this.syncGlobe();
    MapDepict?.pulse?.(lat, lng, 0xffaa44, 'driver base', 10000);
    ACIControl?.reply?.('Driver base set · routing starts here');
  },

  syncGlobe() {
    GlobeEntity?.syncMapPins?.();
    CityMap?.syncMapPins?.();
  },
};
window.MapPins = MapPins;

// === MAP OVERLAY DISMISS — tap map outside any panel → close it ===
const MapOverlayDismiss = {
  PANEL_IDS: [
    'profile-site-panel',
    'globe-entity-hud',
    'vendor-map-tile',
    'delivery-route-hud',
    'map-comms-contact',
    'map-comms-cloud',
    'astranov-auth-modal',
    'coders-hub-panel',
    'astranov-site-shell',
  ],
  STAGE_IDS: [
    'vendor-menu',
    'globe-super-add',
    'globe-youtube',
    'sat-radio',
    'node-batch',
    'cli-hub-panel',
  ],

  init() {
    if (this._bound) return;
    this._bound = true;
    document.addEventListener('click', (e) => this._onDocClick(e), true);
  },

  _isOpen(el) {
    if (!el) return false;
    return el.classList.contains('open') || el.classList.contains('deck-active');
  },

  anyOpen() {
    return this.PANEL_IDS.some(id => this._isOpen(document.getElementById(id)))
      || this.STAGE_IDS.some(id => this._isOpen(document.getElementById(id)));
  },

  isInsidePanel(target) {
    if (!target?.closest) return false;
    const roots = [...this.PANEL_IDS, ...this.STAGE_IDS, 'globe-deck', 'globe-deck-stage', 'globe-deck-body', 'globe-deck-input-row', 'auth-sheet', 'map-style-switch'];
    return roots.some(sel => target.closest('#' + sel) || target.closest('.' + sel));
  },

  isMapTarget(target) {
    if (!target) return false;
    if (target.closest('#globe')) return true;
    if (target.closest('#city-map')) return true;
    if (target.closest('#globe-entity-labels .ge-label')) return true;
    if (target.closest('#zoom-label') || target.closest('#cosmic-guide')) return true;
    return false;
  },

  closeAll() {
    MapPlaceMenu?.close?.();
    VendorMapTile?.close?.();
    MarketplaceDeliveryEngine?.closeHud?.();
    GlobeNavigate?._hideCityChips?.();
    ProfileSite?.close?.();
    Auth?.closeLoginModal?.();
    window.Commerce?.hideMenu?.();
    window.SuperAdd?.hide?.();
    window.GlobeVideo?.hide?.();
    window.AstranovNode?.hidePanel?.();
    window.PmrRadio?.hide?.();
    window.SatRadio?.hide?.();
    window.MapComms?.closeCloud?.();
    document.getElementById('coders-hub-panel')?.classList.remove('open');
    window.AstranovSiteShell?.close?.();
    GlobeEntity?.clearSelection?.();
    if (GlobeDeck?.activeTask) {
      const t = GlobeDeck.activeTask;
      if (t === 'commerce' || t === 'add' || t === 'video' || t === 'batch') GlobeDeck?.completeTask?.(t);
    }
  },

  handleMapClick(e) {
    if (!this.anyOpen()) return false;
    if (this.isInsidePanel(e?.target)) return false;
    if (!this.isMapTarget(e?.target)) return false;
    this.closeAll();
    return true;
  },

  _onDocClick(e) {
    if (!this.anyOpen()) return;
    if (this.isInsidePanel(e.target)) return;
    if (!this.isMapTarget(e.target)) return;
    this.closeAll();
    e.stopPropagation();
    e.preventDefault();
  },
};
window.MapOverlayDismiss = MapOverlayDismiss;

// === CLASSIFIED TRIANGLES — top 3 AI-classified actions, then more options ===
const ClassifiedTriangles = {
  CATALOG: [
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
    document.getElementById('spacenet-map-plus')?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      MapPlaceMenu?.openPlusField?.();
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
    if (!text) {
      document.getElementById('ge-hud-desc').textContent = 'Pick a triangle — or type what you want to do';
    } else {
      document.getElementById('ge-hud-desc').textContent = '▸ ' + text;
    }
    AciCli?.print?.('triangles · ' + (text || 'default top 3'), 'ok');
  },

  _contextTop3(pin) {
    const atCity = GlobeNavigate?.isCity?.();
    if (atCity) {
      return [
        this.CATALOG.find(c => c.id === 'order'),
        this.CATALOG.find(c => c.id === 'deliver_here'),
        this.CATALOG.find(c => c.id === 'explore'),
      ].filter(Boolean);
    }
    if (GlobeNavigate?.isNational?.()) {
      return [
        this.CATALOG.find(c => c.id === 'explore'),
        this.CATALOG.find(c => c.id === 'list_shop'),
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
    tri.innerHTML = top.map((item, i) =>
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
    if (act === 'post' || act === 'upload_photo' || act === 'upload_video') {
      MapPlaceMenu?._runMedia?.(act, pin);
      return;
    }
    MapPlaceMenu?._run?.(act);
  },
};
window.ClassifiedTriangles = ClassifiedTriangles;

// === MAP PLACE MENU — tap globe/map · plus field · classified triangles ===
const MapPlaceMenu = {
  _pin: null,

  formatCoords(lat, lng) {
    return Number(lat).toFixed(4) + ', ' + Number(lng).toFixed(4);
  },

  pointFromGlobeHit(point) {
    const dir = point.clone().normalize();
    const lat = 90 - Math.acos(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI;
    let lng = Math.atan2(dir.z, -dir.x) * 180 / Math.PI - 180;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    return { lat, lng };
  },

  openPlusField() {
    const pos = window._lastPos || CityMap?.globeCenterLatLng?.() || TrackballGuard?.facingLatLng?.() || { lat: 36.44, lng: 28.22 };
    this.openAt(pos.lat, pos.lng, { source: 'Plus field', hint: 'Type what you want to do — AI shows top 3', focusIntent: true });
  },

  openAt(lat, lng, opts) {
    opts = opts || {};
    if (lat == null || lng == null) return;
    window._globeFly = null;
    this._pin = { lat, lng, entity: opts.entity || null };
    const hud = document.getElementById('globe-entity-hud');
    if (!hud) return;
    hud.classList.add('open');
    document.getElementById('ge-hud-type').textContent = '▸ ' + (opts.source || 'Map');
    document.getElementById('ge-hud-title').textContent = opts.label || this.formatCoords(lat, lng);
    document.getElementById('ge-hud-desc').textContent = opts.hint || 'Type what you want to do — top 3 triangle options';
    const intent = document.getElementById('ge-hud-intent');
    if (intent) {
      intent.value = opts.prefill || '';
      if (opts.focusIntent) setTimeout(() => intent.focus(), 80);
    }
    const limited = !!opts.limited;
    const ranked = limited
      ? ClassifiedTriangles._contextTop3(this._pin)
      : ClassifiedTriangles.defaultTop3().concat(ClassifiedTriangles.defaultMore());
    if (opts?.entity?.type === 'vendor') {
      const order = ClassifiedTriangles.CATALOG.find(c => c.id === 'order');
      if (order && !limited) ranked.unshift(order);
    }
    ClassifiedTriangles.render(ranked.slice(0, 3), limited ? [] : ranked.slice(3), this._pin, { limited });
    void SpaceNetBrain?.crawlArea?.(lat, lng, 2);
    MapDepict?.pulse?.(lat, lng, 0x00ddff, opts.label || 'here', 8000);
    GlobeDeck?.setPreview?.('▸ Plus field · ' + (opts.label || this.formatCoords(lat, lng)));
    AciCli?.print?.('▸ plus field · ' + (opts.label || this.formatCoords(lat, lng)), 'map');
  },

  close() {
    this._pin = null;
    document.getElementById('globe-entity-hud')?.classList.remove('open');
    const intent = document.getElementById('ge-hud-intent');
    if (intent) intent.value = '';
    document.getElementById('classified-triangles-more')?.classList.remove('open');
    GlobeEntity?.clearSelection?.();
  },

  _runMedia(action, pin) {
    const p = pin || this._pin;
    if (p) window._pendingShopLatLng = { lat: p.lat, lng: p.lng };
    const go = async () => {
      await LazyModules.ensure();
      SuperAdd?.open?.();
      if (action === 'upload_photo') {
        ACIControl?.reply?.('Super Add · snap or upload photo for this place');
      } else if (action === 'upload_video') {
        ACIControl?.reply?.('Super Add · record video for this place');
      } else {
        ACIControl?.reply?.('Super Add · post at this location');
      }
    };
    void go();
    this.close();
  },

  _run(action) {
    const p = this._pin;
    if (!p) return;
    const lat = p.lat;
    const lng = p.lng;
    if (action === 'drive' || action === 'route') {
      const go = async () => {
        await LazyModules.ensure();
        DrivingView?.setDestination?.(lat, lng);
        DrivingView?.activate?.();
      };
      void go();
      this.close();
      return;
    }
    if (action === 'client_addr') {
      const go = async () => {
        await LazyModules.ensure();
        if (!Auth?.user) {
          Auth?.openLoginModal?.('Sign in to set delivery address');
          return;
        }
        MapPins?.setClientDelivery?.(lat, lng, 'Deliver to ' + this.formatCoords(lat, lng));
      };
      void go();
      this.close();
      return;
    }
    if (action === 'driver_base') {
      const go = async () => {
        await LazyModules.ensure();
        if (!Auth?.user) {
          Auth?.openLoginModal?.('Sign in to set driver base');
          return;
        }
        await MapPins?.setDriverBase?.(lat, lng, 'Driver base · ' + this.formatCoords(lat, lng));
      };
      void go();
      this.close();
      return;
    }
    if (action === 'delivery') {
      void MapPins?.setDriverBase?.(lat, lng, 'Driver base');
      this.close();
      return;
    }
    if (action === 'shop') {
      window._pendingShopLatLng = { lat, lng };
      const go = async () => {
        await LazyModules.ensure();
        if (!Auth?.user) {
          Auth?.openLoginModal?.('Sign in to set up your shop profile');
          return;
        }
        await ProfileSite?.openShopEditor?.(lat, lng);
      };
      void go();
      MapDepict?.pulse?.(lat, lng, 0xff8844, 'new shop', 8000);
      ACIControl?.reply?.('Shop editor — logo, menu photos & prices');
      AppShortcuts?.track?.('add', 'Shop');
      this.close();
      return;
    }
    if (action === 'order') {
      const v = p.entity?.data?.vendor;
      const go = async () => {
        await LazyModules.ensure();
        if (v) window.Commerce?.openVendor?.(v);
        else window.Commerce?.showPicker?.();
      };
      void go();
      this.close();
      return;
    }
    if (action === 'explore') {
      window._lastPos = { lat, lng };
      const go = async () => {
        await LazyModules.ensure();
        await window.Commerce?.loadVendors?.();
        window.Commerce?.showPicker?.();
      };
      void go();
      MapDepict?.action?.('vendor', { lat, lng, detail: 'shops near here' });
      this.close();
      return;
    }
    if (action === 'zoom') {
      const pt = latLngToPos(lat, lng, 1.04);
      flyToPoint?.(new THREE.Vector3(pt.x, pt.y, pt.z), GlobeControl?.Z?.national || 1.82, { dur: 1100 });
      GlobeControl?.noteAutoFly?.();
      this.close();
    }
  },
};
window.MapPlaceMenu = MapPlaceMenu;

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
    client_addr: { color: 0x44ff88, icon: '📦', label: 'Deliver here' },
    driver_base: { color: 0xffaa44, icon: '🚚', label: 'Driver base' },
    place: { color: 0x1a6fd4, icon: '◎', label: 'Place' },
    unit: { color: 0xffaa33, icon: '⚔', label: 'Unit' },
    drone: { color: 0x44ccff, icon: '🛸', label: 'Drone' },
    spy: { color: 0xaa44ff, icon: '🕵', label: 'Spy' },
    pyramid: { color: 0xffdd44, icon: '🔺', label: 'Pyramid' },
    cluster: { color: 0x3d9eff, icon: '☁', label: 'Cloud' },
    yacht: { color: 0x69f5d0, icon: '⛵', label: 'Yacht' },
    work: { color: 0xffcc44, icon: '🔧', label: 'Work' },
    neuron: { color: 0x66ff99, icon: '🧠', label: 'Neuron' },
  },

  CLUSTER_TYPES: new Set(['post', 'place', 'media', 'news']),
  CLUSTER_MIN: 2,

  init() {
    this._labelRoot = document.getElementById('globe-entity-labels');
    this._hud = document.getElementById('globe-entity-hud');
    document.getElementById('ge-hud-close')?.addEventListener('click', () => MapPlaceMenu?.close?.() || this.clearSelection());
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
    const photoUrl = opts.photoUrl || opts.logoUrl || entity.data?.photoUrl || entity.data?.logoUrl || '';
    const pin = entity.data?.travelTo
      ? ('<div class="ge-travel-arrow" style="transform:rotate(' + (entity.data.travelBearing || 0) + 'deg)">➤</div>')
      : photoUrl
      ? ('<div class="ge-pin ge-pin-photo" style="background-image:url(' + this.esc(photoUrl) + ')"></div>')
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
    const business = ['vendor', 'driver', 'friend', 'order', 'pilot', 'me'].includes(entity.type);
    if (business) {
      const behind = this._project(world).behind;
      const show = !behind && (dot > 0.42 || z < 2.4);
      const flash = u >= 3 && dot > 0.35;
      const glow = u >= 2 || (entity.type === 'vendor' && z < 2.8);
      return { show, flash, glow, dot, zoomNear, world };
    }
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
    MapPlaceMenu?.openAt?.(entity.lat, entity.lng, {
      source: this.TYPES[entity.type]?.label || entity.type,
      label: (entity.icon || '') + ' ' + entity.title,
      hint: entity.description || 'Choose an action',
      entity,
    });
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
    this.select(entity);
  },

  _defaultTap(entity) {
    const fp = latLngToPos(entity.lat, entity.lng, 1.04);
    const z = entity.type === 'vendor' ? (GlobeControl?.Z?.regional || 1.65) : (GlobeControl?.Z?.national || 1.82);
    flyToPoint?.(new THREE.Vector3(fp.x, fp.y, fp.z), z);
    GlobeControl?.noteAutoFly?.();

    switch (entity.type) {
      case 'vendor':
        if (entity.data?.vendor) VendorMapTile?.open?.(entity.data.vendor);
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
        if (entity.data?.url) {
          const yt = GlobeVideo?.parseId?.(entity.data.url);
          if (yt) MapComms?.showCloudVideo?.(yt, entity.title);
          GlobeVideo?.play?.(entity.data.url, { title: entity.title }, entity.title);
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
      const forceShow = !!entity.data?.alwaysShowLabel || (entity.type === 'me' && entity.data?.alwaysShow);
      if (entity.mesh && ['vendor', 'driver', 'friend', 'order', 'pilot', 'me'].includes(entity.type)) {
        entity.mesh.visible = true;
        const z = camera?.position?.z ?? 2.5;
        const scale = entity.type === 'vendor' ? (z > 2 ? 1.8 : 1.2) : (z > 2 ? 1.4 : 1);
        entity.mesh.scale.set(scale, scale, scale);
      }
      const el = entity._labelEl;
      if (el) {
        if (prox.show || forceShow) {
          const scr = this._project(prox.world);
          el.style.display = 'flex';
          el.style.left = scr.x + 'px';
          el.style.top = (scr.y - 8) + 'px';
          el.classList.toggle('ge-flash', prox.flash);
          el.classList.toggle('ge-glow', prox.glow);
          el.classList.toggle('ge-selected', this._selected === id);
          if (!entity._revealed) this._scavengeView(entity, 'proximity');
        } else {
          el.style.display = 'none';
          el.classList.remove('ge-flash', 'ge-glow', 'ge-selected');
        }
      }

      if (entity.ring) {
        const pulse = prox.glow ? 0.45 + Math.sin(now / 280) * 0.25 : 0.2;
        entity.ring.material.opacity = prox.flash ? 0.65 + Math.sin(now / 180) * 0.35 : pulse;
        entity.ring.visible = prox.show || entity.urgency >= 2;
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
      const logoUrl = MapPins?.vendorLogo?.(v) || '';
      const isConstruction = window.AstranovCityShop?.isConstructionVendor?.(v);
      const city = isConstruction ? (window.AstranovCityShop?._tags?.(v)?.city || 'city center') : '';
      this.register({
        id: 'vendor-' + v.id,
        type: 'vendor',
        lat: v.lat,
        lng: v.lng,
        title: isConstruction ? 'Astranov Shop · Under Construction' : v.name,
        description: isConstruction
          ? '🚧 Under Construction · ' + city + ' center · Astranov marketplace opening soon · tap to preview'
          : (menu ? menu + ' items · menu w/ photos' : 'menu on request') + (km != null ? ' · ' + km.toFixed(1) + ' km' : '') + ' · tap to order',
        urgency: isConstruction ? 4 : (i === 0 ? 3 : 2),
        radius: isConstruction ? 0.034 : 0.022,
        logoUrl: logoUrl || (isConstruction ? '/icon.svg' : ''),
        data: { vendor: v, logoUrl: logoUrl || (isConstruction ? '/icon.svg' : ''), alwaysShowLabel: isConstruction || i < 8 },
        _actionLabel: isConstruction ? 'Astranov Shop · Under Construction' : 'Open ' + v.name,
        onTap: () => window.Commerce?.openVendor?.(v),
      });
    });
  },

  syncMapPins() {
    this.unregisterType('client_addr');
    this.unregisterType('driver_base');
    const cd = window._clientDelivery;
    if (cd?.lat != null) {
      const clientPhoto = MapPins?.clientPinPhoto?.(cd) || '';
      this.register({
        id: 'pin-client-delivery',
        type: 'client_addr',
        lat: cd.lat,
        lng: cd.lng,
        title: cd.label || 'Delivery address',
        description: 'Client delivery · orders arrive here · tap to route',
        urgency: 3,
        persist: true,
        photoUrl: clientPhoto,
        data: { alwaysShowLabel: true, photoUrl: clientPhoto },
        onTap: () => {
          DrivingView?.setRoutePlan?.({ from: window._driverBase || window._lastPos, to: cd });
          DrivingView?.setDestination?.(cd.lat, cd.lng);
          DrivingView?.fetchRoadRoute?.();
        },
      });
    }
    const db = window._driverBase;
    if (db?.lat != null) {
      const basePhoto = MapPins?.driverBasePhoto?.(db) || '';
      this.register({
        id: 'pin-driver-base',
        type: 'driver_base',
        lat: db.lat,
        lng: db.lng,
        title: db.label || 'Driver base',
        description: 'Driver start · routes begin here',
        urgency: 2,
        persist: true,
        photoUrl: basePhoto,
        data: { alwaysShowLabel: true, photoUrl: basePhoto },
        onTap: () => {
          placeMe(db.lat, db.lng, { fly: true, zoom: GlobeControl?.Z?.national || 1.82, quiet: true });
        },
      });
    }
  },

  syncDrivers(drivers) {
    this.unregisterType('driver');
    (drivers || []).forEach((d, i) => {
      if (d.field_lat == null) return;
      const km = window.Commerce?.haversineKm?.(window.Commerce.userLatLng().lat, window.Commerce.userLatLng().lng, d.field_lat, d.field_lng);
      const driverPhoto = MapPins?.driverPhotoUrl?.(d) || '';
      this.register({
        id: 'driver-' + d.id,
        type: 'driver',
        lat: d.field_lat,
        lng: d.field_lng,
        title: d.display_name || 'Driver',
        description: 'Available · ' + (km != null ? km.toFixed(1) + ' km' : 'nearby') + ' · tap to assign',
        urgency: 2,
        photoUrl: driverPhoto,
        data: { driver: d, photoUrl: driverPhoto },
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
    const mePhoto = opts.photoUrl || MapPins?.authAvatarUrl?.() || '';
    this.register({
      id: 'me',
      type: 'me',
      lat,
      lng,
      title: opts.travelTo ? ('→ ' + opts.travelTo) : (name || 'You'),
      description: desc,
      urgency: opts.travelTo ? 3 : 2,
      persist: true,
      photoUrl: mePhoto,
      data: {
        alwaysShowLabel: !!opts.alwaysShow,
        travelBearing: opts.bearing,
        travelTo: opts.travelTo,
        photoUrl: mePhoto,
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

// ── COSMIC ZOOM: Earth → satellites → solar system → galaxy ──
const CosmicZoom = {
  level: 'earth',
  solarGroup: null,
  galaxyPts: null,
  satGroup: null,
  issMarker: null,
  _issTarget: null,
  _issLastFetch: 0,
  orbitLines: [],
  leoRings: [],
  meshRing: null,
  planets: [],
  _lastCamZ: -1,
  _lastLevel: '',
  _guideAt: 0,
  _EPOCH_MS: Date.UTC(2000, 0, 1, 12, 0, 0),
  _DAY_MS: 86400000,
  _TAU: Math.PI * 2,

  _deg(d) { return d * Math.PI / 180; },

  heliocentricPosition(ud, nowMs) {
    const days = (nowMs - this._EPOCH_MS) / this._DAY_MS;
    const M = this._deg(ud.M0) + (this._TAU / ud.periodDays) * days;
    const incl = this._deg(ud.incl);
    const Omega = this._deg(ud.omega);
    const r = ud.dist;
    const cosM = Math.cos(M);
    const sinM = Math.sin(M);
    const cosO = Math.cos(Omega);
    const sinO = Math.sin(Omega);
    const cosI = Math.cos(incl);
    const sinI = Math.sin(incl);
    return {
      x: r * (cosO * cosM - sinO * sinM * cosI),
      y: r * (sinO * cosM + cosO * sinM * cosI),
      z: r * sinM * sinI,
    };
  },

  makeInclinedOrbit(ud, color, opacity, parent, opts) {
    opts = opts || {};
    const segs = opts.segments || 72;
    const pts = [];
    const incl = this._deg(ud.incl);
    const Omega = this._deg(ud.omega);
    const r = ud.dist;
    const cosO = Math.cos(Omega);
    const sinO = Math.sin(Omega);
    const cosI = Math.cos(incl);
    const sinI = Math.sin(incl);
    for (let i = 0; i <= segs; i++) {
      const M = (i / segs) * this._TAU;
      const cosM = Math.cos(M);
      const sinM = Math.sin(M);
      pts.push(new THREE.Vector3(
        r * (cosO * cosM - sinO * sinM * cosI),
        r * (sinO * cosM + cosO * sinM * cosI),
        r * sinM * sinI
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity,
      dashSize: opts.dash || 0.04,
      gapSize: opts.gap || 0.1,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line.visible = false;
    line.userData = { type: 'orbit-line', body: ud.name || opts.body || '' };
    if (parent) parent.add(line);
    this.orbitLines.push(line);
    return line;
  },

  makeDashedOrbit(radius, color, opacity, parent, opts) {
    opts = opts || {};
    const segs = opts.segments || 40;
    const tilt = opts.tilt || 0;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wobble = Math.sin(a * (opts.wobble || 1)) * tilt;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, wobble, Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity,
      dashSize: opts.dash || 0.05,
      gapSize: opts.gap || 0.09,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line.visible = false;
    line.userData = { type: 'orbit-line', body: opts.body || '' };
    if (parent) parent.add(line);
    this.orbitLines.push(line);
    return line;
  },

  init() {
    this.solarGroup = new THREE.Group();
    this.solarGroup.visible = false;
    scene.add(this.solarGroup);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffcc33 })
    );
    sun.userData = { name: 'Sun', desc: 'G-type star · system barycenter' };
    this.solarGroup.add(sun);

    const planetDefs = [
      { n: 'Mercury', desc: 'Rocky · 87.97-day sidereal orbit · 7.0° incl', c: 0xaaaaaa, r: 0.04, dist: 0.7, periodDays: 87.969, incl: 7.005, omega: 48.331, M0: 174.796 },
      { n: 'Venus', desc: 'Cloud cover · 224.7-day sidereal orbit · 3.4° incl', c: 0xddbb88, r: 0.06, dist: 1.0, periodDays: 224.701, incl: 3.395, omega: 76.680, M0: 50.416 },
      { n: 'Mars', desc: 'Red desert · 687-day sidereal orbit · 1.9° incl', c: 0xff6644, r: 0.05, dist: 1.5, periodDays: 686.980, incl: 1.850, omega: 49.558, M0: 19.373 },
      { n: 'Jupiter', desc: 'Gas giant · 11.86-year sidereal orbit · 1.3° incl', c: 0xccaa77, r: 0.12, dist: 2.2, periodDays: 4332.589, incl: 1.305, omega: 100.464, M0: 20.020 },
      { n: 'Saturn', desc: 'Rings (not shown) · 29.46-year sidereal orbit · 2.5° incl', c: 0xddcc99, r: 0.1, dist: 3.0, periodDays: 10759.22, incl: 2.485, omega: 113.666, M0: 317.020 },
    ];
    planetDefs.forEach(p => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(p.r, 10, 10),
        new THREE.MeshBasicMaterial({ color: p.c })
      );
      m.userData = {
        dist: p.dist,
        periodDays: p.periodDays,
        incl: p.incl,
        omega: p.omega,
        M0: p.M0,
        name: p.n,
        desc: p.desc,
      };
      this.solarGroup.add(m);
      this.planets.push(m);
      this.makeInclinedOrbit(m.userData, p.c, 0.16, this.solarGroup, { body: p.n, dash: 0.04, gap: 0.1 });
    });

    const gPos = [];
    for (let i = 0; i < 400; i++) {
      const arm = (i % 4) * 0.4;
      const t = Math.random() * Math.PI * 2;
      const rad = 8 + Math.random() * 25 + arm * 3;
      gPos.push(Math.cos(t) * rad, (Math.random() - 0.5) * 2, Math.sin(t) * rad);
    }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
    this.galaxyPts = new THREE.Points(
      gGeo,
      new THREE.PointsMaterial({ color: 0xaaccff, size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.35 })
    );
    this.galaxyPts.visible = false;
    scene.add(this.galaxyPts);

    this.satGroup = new THREE.Group();
    globePivot.add(this.satGroup);
    this.leoRings = [
      this.makeDashedOrbit(1.052, 0x336699, 0.1, this.satGroup, { body: 'LEO shell 1', tilt: 0.03, dash: 0.03, gap: 0.12 }),
      this.makeDashedOrbit(1.062, 0x4488bb, 0.14, this.satGroup, { body: 'LEO shell 2', tilt: 0.05, wobble: 2, dash: 0.035, gap: 0.11 }),
      this.makeDashedOrbit(1.072, 0x55aacc, 0.1, this.satGroup, { body: 'ISS / LEO', tilt: 0.08, dash: 0.04, gap: 0.1 }),
    ];
    this.issOrbit = this.leoRings[2];
    const iss = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc })
    );
    iss.userData = { type: 'iss', name: 'ISS', desc: 'International Space Station · ~400 km' };
    this.satGroup.add(iss);
    this.issMarker = iss;
    this.level = 'earth';
    this.setOrbitVisibility('earth');
    if (this.solarGroup) this.solarGroup.visible = false;
    if (this.galaxyPts) this.galaxyPts.visible = false;
  },

  registerOrbitalSats(sats) {
    if (!sats?.length || this.meshRing) return;
    this.meshRing = this.makeDashedOrbit(1.58, 0x8899ff, 0.12, scene, {
      body: 'Astranov mesh',
      tilt: 0.12,
      wobble: 3,
      dash: 0.05,
      gap: 0.12,
    });
    sats.forEach((sat, i) => {
      sat.userData = sat.userData || {};
      sat.userData.name = 'Relay ' + (i + 1);
      sat.userData.desc = 'Orbital mesh · global comms path';
      if (sat.material) {
        sat.material.transparent = true;
        sat.material.opacity = 0.65;
      }
    });
    this._orbitalSats = sats;
  },

  async trackISS() {
    let lat = null;
    let lng = null;
    try {
      const r = await fetch('https://api.open-notify.org/iss-now.json');
      const j = await r.json();
      if (j.iss_position) {
        lat = parseFloat(j.iss_position.latitude);
        lng = parseFloat(j.iss_position.longitude);
      }
    } catch (_) {}
    if (lat == null) {
      try {
        const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
        const j = await r.json();
        if (j.latitude != null) {
          lat = +j.latitude;
          lng = +j.longitude;
        }
      } catch (_) {}
    }
    if (lat == null || lng == null || !this.issMarker) return;
    this._issTarget = { lat, lng, t: Date.now() };
    this._issLastFetch = Date.now();
    this.issMarker.userData.lat = lat;
    this.issMarker.userData.lng = lng;
    this.issMarker.userData.desc = 'ISS · live ' + lat.toFixed(2) + '° ' + lng.toFixed(2) + '° · ~400 km';
    const p = latLngToPos(lat, lng, 1.065);
    if (!this._issTarget.from) {
      this.issMarker.position.set(p.x, p.y, p.z);
      this._issTarget.from = { x: p.x, y: p.y, z: p.z };
    }
    this.updateGuide(this.level, camera?.position?.z || 7.2);
  },

  _lerpIss() {
    if (!this.issMarker || this._issTarget?.lat == null) return;
    const tgt = latLngToPos(this._issTarget.lat, this._issTarget.lng, 1.065);
    const m = this.issMarker.position;
    m.x += (tgt.x - m.x) * 0.18;
    m.y += (tgt.y - m.y) * 0.18;
    m.z += (tgt.z - m.z) * 0.18;
  },

  updateGuide(level, camZ) {
    const el = document.getElementById('cosmic-guide');
    if (el) el.innerHTML = '';
  },

  setOrbitVisibility(level) {
    const showLeo = level === 'orbit';
    const showSolar = level === 'system';
    const showMesh = level === 'orbit' || level === 'system';
    this.leoRings.forEach(r => { if (r) r.visible = showLeo; });
    this.orbitLines.forEach(line => {
      if (!line.parent) return;
      if (line.parent === this.solarGroup) line.visible = showSolar;
    });
    if (this.meshRing) this.meshRing.visible = showMesh;
  },

  update(camZ, opts) {
    opts = opts || {};
    if (window._cityDropLock && !opts.cosmic) {
      opts = Object.assign({}, opts, { cosmic: 'earth', tier: opts.tier || 'city', label: opts.label || 'CITY' });
    }
    let level = opts.cosmic === 'system' ? 'system' : opts.cosmic === 'galaxy' ? 'galaxy' : 'earth';
    let label = opts.label || 'GLOBAL';
    if (window._bootEarthLock && camZ < 6) {
      level = 'earth';
      label = opts.label || 'GLOBAL';
    } else if (!opts.tier) {
      if (camZ > 14) { level = 'galaxy'; label = 'GALAXY'; }
      else if (camZ > 5.5) { level = 'system'; label = 'SOLAR SYSTEM'; }
      else if (camZ > 4.8) { level = 'orbit'; label = 'ORBIT'; }
      else {
        level = 'earth';
        const tier = window.ZoomTiers?.current?.();
        label = tier?.label || (camZ > 2.2 ? 'GLOBAL' : camZ > 1.55 ? 'NATIONAL' : 'CITY');
      }
    }
    const levelChanged = level !== this.level;
    if (levelChanged) this.level = level;
    const camChanged = Math.abs(camZ - this._lastCamZ) > 0.08;
    const now = Date.now();
    const zl = document.getElementById('zoom-label');
    if (zl && !DrivingView?.active && (levelChanged || camChanged)) {
      if (CityMap?.active) {
        const tier = window.ZoomTiers?.current?.();
        const tierLabel = tier?.id === 'neighborhood' ? 'NEIGHBORHOOD MAP' : 'CITY MAP';
        zl.textContent = tierLabel;
      } else if (CityMap?._nationalActive) {
        const tier = window.ZoomTiers?.current?.();
        zl.textContent = (tier?.label || 'NATIONAL') + ' · ' + (window.ZoomTiers?.countryHint?.() || 'region');
      } else {
        if (level === 'orbit') zl.textContent = 'ORBIT';
        else if (level === 'system') zl.textContent = 'SOLAR SYSTEM';
        else if (level === 'galaxy') zl.textContent = 'GALAXY';
        else if (label === 'GLOBAL') zl.textContent = 'GLOBAL';
        else zl.textContent = label;
      }
    }
    if (levelChanged || camChanged) CityMap?.onCamera?.(camZ, level);
    if (levelChanged || camChanged || now - this._guideAt > 4000) {
      this._guideAt = now;
      this.updateGuide(level, camZ);
    }
    if (levelChanged) this.setOrbitVisibility(level);
    this._lastCamZ = camZ;
    this._lastLevel = level;

    globePivot.visible = level === 'earth' || level === 'orbit';
    if (this.solarGroup) this.solarGroup.visible = level === 'system';
    if (this.galaxyPts) this.galaxyPts.visible = level === 'galaxy';
    if (this.satGroup) this.satGroup.visible = level === 'earth' || level === 'orbit';
    if (this.issMarker) this.issMarker.visible = level === 'earth' || level === 'orbit';
    document.body.classList.toggle('cosmic-solar', level === 'system');
    document.body.classList.toggle('cosmic-galaxy', level === 'galaxy');
    document.body.classList.toggle('cosmic-orbit', level === 'orbit');
    GlobeNavigate?._syncChip?.();
    this._lerpIss();

    if (this.solarGroup?.visible) {
      this.planets.forEach(c => {
        const ud = c.userData;
        if (!ud?.periodDays) return;
        const pos = this.heliocentricPosition(ud, now);
        c.position.set(pos.x, pos.y, pos.z);
      });
    }

    if (level === 'orbit' || level === 'system') {
      if (!this._issLastFetch || now - this._issLastFetch > 120000) this.trackISS();
      if (this.issMarker) this.issMarker.visible = camZ < 10;
    }

    if (this._orbitalSats && (level === 'orbit' || level === 'system')) {
      this._orbitalSats.forEach(s => { s.visible = level === 'orbit'; });
    } else if (this._orbitalSats) {
      this._orbitalSats.forEach(s => { s.visible = false; });
    }
  },
};
window.CosmicZoom = CosmicZoom;

// === AI ROUTER — OpenAI Mini / Astranov Cycle / Groq / Gemini (shared with coder labs)
const AiRouter = {
  PROVIDERS: [
    { id: 'grok', label: 'Grok', short: 'GK' },
    { id: 'astranov', label: 'Cycle', short: 'AV' },
    { id: 'openai-mini', label: 'OpenAI', short: 'AI' },
    { id: 'groq', label: 'Groq', short: 'GQ' },
    { id: 'gemini', label: 'Gemini', short: 'GM' },
    { id: 'deepseek', label: 'DeepSeek', short: 'DS' },
  ],
  LAB_ENGINES: {
    main: 'grok',
    chatgpt: 'openai-mini',
    grok: 'astranov',
    gemini: 'gemini',
    deepseek: 'deepseek',
    claude: 'astranov',
    composer: 'astranov',
  },
  _provider: 'grok',
  _sessionId: null,

  init() {
    try {
      const saved = localStorage.getItem('astranov:ai-provider');
      if (saved && this.PROVIDERS.some(p => p.id === saved)) this._provider = saved;
    } catch (_) {}
    this._sessionId = this._loadSession();
    this._bindUi();
    this._syncUi();
  },

  _loadSession() {
    try {
      return localStorage.getItem('astranov:ai-session') || (window.crypto?.randomUUID?.() || 's-' + Date.now());
    } catch (_) {
      return 's-' + Date.now();
    }
  },

  _saveSession() {
    try { localStorage.setItem('astranov:ai-session', this._sessionId); } catch (_) {}
  },

  current() {
    return this.PROVIDERS.find(p => p.id === this._provider) || this.PROVIDERS[0];
  },

  setProvider(id) {
    if (!this.PROVIDERS.some(p => p.id === id)) return false;
    this._provider = id;
    try { localStorage.setItem('astranov:ai-provider', id); } catch (_) {}
    this._syncUi();
    CliRibbon?.render?.();
    return true;
  },

  cycle() {
    const i = this.PROVIDERS.findIndex(p => p.id === this._provider);
    const next = this.PROVIDERS[(i + 1) % this.PROVIDERS.length];
    this.setProvider(next.id);
    AciCli?.print('AI provider → ' + next.label + ' (' + next.id + ')', 'ok');
    LabOrbs?._syncGlyphs?.();
    return next;
  },

  forLab(lab) {
    const id = lab?.engine || lab?.id;
    return this.LAB_ENGINES[id] || (this.PROVIDERS.some(p => p.id === id) ? id : 'astranov');
  },

  applyLab(lab) {
    const prov = this.forLab(lab);
    this.setProvider(prov);
    return this.current();
  },

  _bindUi() {
    document.getElementById('aci-provider')?.addEventListener('click', () => this.cycle());
  },

  _syncUi() {
    const btn = document.getElementById('aci-provider');
    const p = this.current();
    if (btn) {
      btn.title = 'AI provider: ' + p.label + ' — tap to cycle';
      btn.textContent = p.short;
      btn.dataset.provider = p.id;
    }
  },

  async ask(prompt, opts) {
    opts = opts || {};
    const text = String(prompt || '').trim();
    if (!text) return { error: 'empty prompt' };
    const headers = { 'Content-Type': 'application/json', apikey: SB_KEY };
    if (Auth?.ensureSession) {
      const session = await Auth.ensureSession();
      headers.Authorization = session?.access_token ? 'Bearer ' + session.access_token : 'Bearer ' + SB_KEY;
    } else {
      headers.Authorization = 'Bearer ' + SB_KEY;
    }
    const history = (opts.history || []).slice(-8).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || m.text || m.reply || '').slice(0, 2000),
    }));
    const body = {
      text,
      prompt: text,
      level: 'global',
      preferred_provider: opts.provider || this._provider,
      session_id: this._sessionId,
      source: 'astranov.eu-main',
      messages: history,
    };
    const timeout = opts.timeoutMs || 25000;
    try {
      const j = await fetchJson(SB_URL + '/functions/v1/ai-router', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }, timeout);
      if (j.error && !j.text && !j.response) return { error: j.error, raw: j };
      return {
        text: String(j.text || j.response || j.message || '').trim(),
        provider: j.provider || j.via || body.preferred_provider,
        model: j.model || '',
        action: j.action || null,
        raw: j,
      };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  },

  shouldRoute(message, opts) {
    if (opts?.forceAci) return false;
    if (AciCoders?.isBuildTask?.(message)) return false;
    if (AciCoders?.wantsComposer?.(message)) return false;
    if (/^coders\s+poll|^summon\s+coders?/i.test(message)) return false;
    return true;
  },
};

window.AiRouter = AiRouter;

// === SPACENET BRAIN — orchestrates ACI, ai-router, crawlers for unified internet ingestion ===
const SpaceNetBrain = {
  _crawlBusy: new Set(),
  _lastClassify: null,

  ACTION_IDS: ['list_vendor', 'list_shop', 'driver_base', 'post', 'upload_photo', 'upload_video', 'deliver_here', 'drive_here', 'route', 'explore', 'order'],

  _headers() {
    const h = { 'Content-Type': 'application/json', apikey: SB_KEY };
    if (Auth?.session?.access_token) h.Authorization = 'Bearer ' + Auth.session.access_token;
    else h.Authorization = 'Bearer ' + SB_KEY;
    return h;
  },

  async think(prompt, opts) {
    opts = opts || {};
    try {
      const j = await fetchJson(SB_URL + '/functions/v1/aci', {
        method: 'POST',
        headers: await (ACI?.headers?.() || Promise.resolve(this._headers())),
        body: JSON.stringify({ action: 'think', text: prompt, level: opts.level || 'global', source: 'spacenet-brain' }),
      }, opts.timeoutMs || 18000);
      return j;
    } catch (e) {
      return { error: String(e.message || e) };
    }
  },

  async classifyIntent(text, ctx) {
    ctx = ctx || {};
    const trimmed = String(text || '').trim();
    if (!trimmed) return { primary: ClassifiedTriangles.defaultTop3(), more: ClassifiedTriangles.defaultMore(), source: 'default' };

    const local = ClassifiedTriangles.scoreLocal(trimmed);
    const primary = local.slice(0, 3);
    const more = local.slice(3);

    void this._refineWithAi(trimmed, ctx, local);

    if (ctx.lat != null && ctx.lng != null) {
      void this.crawlArea(ctx.lat, ctx.lng, ctx.radiusKm || 2);
    }

    this._lastClassify = { text: trimmed, primary, more, at: Date.now() };
    return { primary, more, source: 'local' };
  },

  async _refineWithAi(text, ctx, localHints) {
    const ids = this.ACTION_IDS.join(', ');
    const prompt = 'SpaceNet place intent at ' + (ctx.lat?.toFixed?.(4) || '?') + ',' + (ctx.lng?.toFixed?.(4) || '?')
      + ': "' + text + '". Reply with ONLY a JSON array of action ids (max 6) from: ' + ids
      + '. First 3 = most common for this intent.';
    const r = await AiRouter?.ask?.(prompt, { timeoutMs: 14000 });
    const raw = String(r?.text || r?.raw?.text || '').trim();
    const parsed = this._parseActionIds(raw);
    if (!parsed.length) return;
    const catalog = ClassifiedTriangles.CATALOG;
    const ordered = parsed.map(id => catalog.find(c => c.id === id)).filter(Boolean);
    const rest = catalog.filter(c => !ordered.find(o => o.id === c.id));
    const full = ordered.concat(rest);
    ClassifiedTriangles.render(full.slice(0, 3), full.slice(3), ctx.pin);
    this._lastClassify = { text, primary: full.slice(0, 3), more: full.slice(3), source: 'ai' };
  },

  _parseActionIds(raw) {
    try {
      const m = raw.match(/\[[\s\S]*?\]/);
      if (m) {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) return arr.map(String).filter(id => this.ACTION_IDS.includes(id));
      }
    } catch (_) {}
    const found = [];
    for (const id of this.ACTION_IDS) {
      if (new RegExp(id.replace(/_/g, '[\\s_-]+'), 'i').test(raw)) found.push(id);
    }
    return found;
  },

  async crawlArea(lat, lng, radiusKm) {
    const key = lat.toFixed(3) + ',' + lng.toFixed(3);
    if (this._crawlBusy.has(key)) return;
    this._crawlBusy.add(key);
    try {
      await fetch(SB_URL + '/functions/v1/vendor-crawler', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ lat, lng, radius_km: radiusKm || 2, source: 'spacenet-brain' }),
      });
      AciCli?.print?.('crawler · sector ' + key, 'dim');
    } catch (_) {}
    setTimeout(() => this._crawlBusy.delete(key), 120000);
  },

  async orchestrate(actionId, pin) {
    return ClassifiedTriangles.runAction(actionId, pin);
  },
};
window.SpaceNetBrain = SpaceNetBrain;

// === ZOOM TIERS — solar → global → national → regional → city → neighborhood ===
const ZoomTiers = {
  TIERS: [
    { id: 'galaxy', z: 16, label: 'GALAXY', cosmic: 'galaxy' },
    { id: 'solar', z: 7.2, label: 'SOLAR SYSTEM', cosmic: 'system' },
    { id: 'orbit', z: 5.2, label: 'ORBIT', cosmic: 'orbit' },
    { id: 'global', z: 3.2, label: 'GLOBAL', cosmic: 'earth' },
    { id: 'national', z: 1.82, label: 'NATIONAL', cosmic: 'earth', national: true },
    { id: 'regional', z: 1.65, label: 'REGIONAL', cosmic: 'earth', national: true },
    { id: 'city', z: 1.38, label: 'CITY', cosmic: 'earth', city: true },
    { id: 'neighborhood', z: 1.08, label: 'NEIGHBORHOOD', cosmic: 'earth', city: true },
  ],
  START_ID: 'global',
  _index: 0,
  _wheelAccum: 0,
  _pinchAccum: 0,
  WHEEL_THRESH: 28,
  PINCH_THRESH: 14,

  init() {
    const i = this.TIERS.findIndex(t => t.id === this.START_ID);
    this._index = i >= 0 ? i : 2;
    camera.position.z = this.tierZ(this.START_ID);
    this.snap(false);
    this.updateDots();
  },

  countryHint() {
    const p = CityMap?.globeCenterLatLng?.() || TrackballGuard?.facingLatLng?.() || window._lastPos || { lat: 0, lng: 0 };
    if (p.lat > 28 && p.lat < 34 && p.lng > 34 && p.lng < 40) return 'Jordan';
    if (p.lat > 34 && p.lat < 42 && p.lng > 19 && p.lng < 30) return 'Greece';
    if (p.lat > 24 && p.lat < 50 && p.lng > -10 && p.lng < 40) return 'Europe';
    if (p.lat > -35 && p.lat < 35) return 'equatorial belt';
    return 'region';
  },

  syncFromCamZ(camZ, animate) {
    if (camZ == null || !Number.isFinite(camZ)) return false;
    let best = this._index;
    let bestDist = Infinity;
    const enterZ = CityMap?.ENTER_Z ?? 1.4;
    this.TIERS.forEach((t, i) => {
      if (t.city && camZ > enterZ + 0.08) return;
      const d = Math.abs(t.z - camZ);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best === this._index) return false;
    this._index = best;
    /* continuous zoom law — never snap camera from scroll; labels/crossfade only */
    this._apply(this.current());
    return true;
  },

  updateDots() {
    const el = document.getElementById('zoom-tier-dots');
    if (!el) return;
    const show = this.TIERS.filter(t => t.id !== 'solar' && t.id !== 'galaxy');
    el.innerHTML = show.map((t) => {
      const i = this.TIERS.findIndex(x => x.id === t.id);
      const on = i === this._index ? ' on' : '';
      return '<span class="ztd' + on + '" data-tier="' + t.id + '" title="' + t.label + '"></span>';
    }).join('');
  },

  current() {
    return this.TIERS[this._index] || this.TIERS[0];
  },

  indexOf(id) {
    return this.TIERS.findIndex(t => t.id === id);
  },

  step(delta) {
    const next = Math.max(0, Math.min(this.TIERS.length - 1, this._index + delta));
    if (next === this._index) return false;
    this._index = next;
    this.snap(true);
    return true;
  },

  stepIn() { return this.step(1); },
  stepOut() { return this.step(-1); },

  goTo(id, animate) {
    const i = this.indexOf(id);
    if (i < 0) return false;
    this._index = i;
    this.snap(animate !== false);
    return true;
  },

  onWheel(deltaY) {
    this._wheelAccum += deltaY;
    if (Math.abs(this._wheelAccum) < this.WHEEL_THRESH) return;
    const out = this._wheelAccum > 0;
    this._wheelAccum = 0;
    this.step(out ? -1 : 1);
  },

  onPinch(delta) {
    this._pinchAccum += delta;
    if (Math.abs(this._pinchAccum) < this.PINCH_THRESH) return;
    const out = this._pinchAccum > 0;
    this._pinchAccum = 0;
    this.step(out ? -1 : 1);
  },

  resetAccum() {
    this._wheelAccum = 0;
    this._pinchAccum = 0;
  },

  snap(animate) {
    const t = this.current();
    window._globeFly = null;
    if (GlobeControl?.userExploring) animate = false;
    if (animate) {
      const dz = Math.abs(camera.position.z - t.z);
      window._globeFly = {
        mode: 'zoom',
        fromZ: camera.position.z,
        toZ: t.z,
        t0: performance.now(),
        dur: Math.max(1400, Math.min(3200, 1200 + dz * 900)),
        tierId: t.id,
        onTier: true,
      };
    } else {
      camera.position.z = t.z;
      camera.lookAt(0, 0, 0);
      this._apply(t);
    }
    MapDepict?.setHud?.(t.label, 'zoom-tier');
  },

  _apply(t) {
    const tier = t || this.current();
    const cosmic = tier.cosmic || 'earth';
    CosmicZoom.update(camera.position.z, { tier: tier.id, label: tier.label, cosmic });
    CityMap?.onCamera?.(camera.position.z, cosmic);
    cityLevel = !!tier.city;
    const zl = document.getElementById('zoom-label');
    if (zl && !window.DrivingView?.active && !CityMap?.active) {
      if (tier.id === 'galaxy') zl.textContent = 'GALAXY';
      else if (tier.id === 'solar') zl.textContent = 'SOLAR SYSTEM';
      else if (tier.id === 'orbit') zl.textContent = 'ORBIT';
      else if (tier.id === 'global') zl.textContent = 'GLOBAL';
      else if (tier.national) zl.textContent = tier.label + ' · ' + this.countryHint();
      else if (tier.city) zl.textContent = tier.label;
      else zl.textContent = tier.label;
    }
    this.updateDots();
    MapDepict?.setHud?.(tier.label, 'zoom-tier');
  },

  tierZ(id) {
    const t = this.TIERS.find(x => x.id === id);
    return t ? t.z : 2.55;
  },
};
window.ZoomTiers = ZoomTiers;

// Globe gestures — primary UI (Google Earth / Maps style). CLI is secondary.
// === GLOBE PHYSICS LOCK — owner law: never retune trackball/zoom; survives model swaps & regressions ===
const ASTRANOV_GLOBE_PHYSICS_LOCK = Object.freeze({
  v: '20260710241000',
  track: Object.freeze({
    TRACK_VEL_GAIN: 0.00385,
    TRACK_FLICK_BOOST: 2.6,
    TRACK_INERTIA_DAMP: 0.9885,
    TRACK_INERTIA_MIN: 0.00001,
    TRACK_MAX_ANG_VEL: 0.00095,
    TRACK_CATCH_DAMP: 0.44,
    TRACK_VEL_SMOOTH: 0.48,
    TRACK_RELEASE_BOOST: 1.04,
  }),
  zoom: Object.freeze({
    ZOOM_MIN: 1.05,
    ZOOM_MAX: 18,
    ZOOM_SMOOTH_BASE: 0.088,
    FRICTION_IDLE: 0.968,
    FRICTION_ACTIVE: 0.993,
    MIN_VEL: 4e-7,
    MAX_VEL: 1.65,
  }),
});
Object.defineProperty(window, 'ASTRANOV_GLOBE_PHYSICS_LOCK', { value: ASTRANOV_GLOBE_PHYSICS_LOCK, writable: false, configurable: false });

const canvas = renderer.domElement;
const TRACK_VEL_GAIN = ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_VEL_GAIN;
const TRACK_FLICK_BOOST = ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_FLICK_BOOST;
const TRACK_INERTIA_DAMP = ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_INERTIA_DAMP;
const TRACK_INERTIA_MIN = ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_INERTIA_MIN;
const TRACK_MAX_ANG_VEL = ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_MAX_ANG_VEL;
let trackAngVel = 0;
let trackVelSmooth = 0;
let trackAngAxis = null;
let trackInertiaAxis = null;
let trackInertiaAngle = 0;
let trackLastMoveT = 0;
let _lastAnimT = performance.now();

function frameDtMs() {
  const now = performance.now();
  const dt = Math.min(52, Math.max(4, now - _lastAnimT));
  _lastAnimT = now;
  return dt;
}
window._trackFrameDt = frameDtMs;

function resetTrackInertia() {
  trackVelX = 0;
  trackVelY = 0;
  trackAngVel = 0;
  trackVelSmooth = 0;
  trackAngAxis = null;
  trackInertiaAxis = null;
  trackInertiaAngle = 0;
}

function applyTrackballDrag(dx, dy, dtMs) {
  if (!globePivot || (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01)) return;
  const dt = Math.max(4, Math.min(64, dtMs || 16));
  const axis = new THREE.Vector3(dy, dx, 0);
  const pix = axis.length();
  if (pix < 0.04) return;
  axis.normalize();
  const pixPerMs = pix / dt;
  const flick = 1 + Math.min(TRACK_FLICK_BOOST, Math.pow(pixPerMs / 1.65, 1.38));
  const angVelMs = pixPerMs * TRACK_VEL_GAIN * flick;
  const angle = angVelMs * dt;
  globePivot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  syncGlobePivotRotation?.();
  trackVelSmooth = trackVelSmooth * ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_VEL_SMOOTH + angVelMs * (1 - ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_VEL_SMOOTH);
  trackAngAxis = axis.clone();
  trackAngVel = Math.max(-TRACK_MAX_ANG_VEL, Math.min(TRACK_MAX_ANG_VEL, trackVelSmooth));
  trackInertiaAxis = trackAngAxis;
  trackInertiaAngle = trackVelSmooth * 16;
  trackVelX = dx / dt;
  trackVelY = dy / dt;
}

const ZOOM_MIN = ASTRANOV_GLOBE_PHYSICS_LOCK.zoom.ZOOM_MIN;
const ZOOM_MAX = ASTRANOV_GLOBE_PHYSICS_LOCK.zoom.ZOOM_MAX;
const ZOOM_SMOOTH_BASE = ASTRANOV_GLOBE_PHYSICS_LOCK.zoom.ZOOM_SMOOTH_BASE;

// Physics zoom — wheel/pinch velocity drives speed; fast scroll coasts, slow scroll creeps
const GlobeZoom = {
  _vel: 0,
  _lastX: null,
  _lastY: null,
  _scrolling: false,
  _lastWheelT: 0,
  _activeUntil: 0,
  FRICTION_IDLE: ASTRANOV_GLOBE_PHYSICS_LOCK.zoom.FRICTION_IDLE,
  FRICTION_ACTIVE: ASTRANOV_GLOBE_PHYSICS_LOCK.zoom.FRICTION_ACTIVE,
  MIN_VEL: ASTRANOV_GLOBE_PHYSICS_LOCK.zoom.MIN_VEL,
  MAX_VEL: ASTRANOV_GLOBE_PHYSICS_LOCK.zoom.MAX_VEL,

  _normDy(dy, mode) {
    if (mode === 1) return dy * 0.048;
    if (mode === 2) return dy * 0.24;
    return dy * 0.00205;
  },

  impuls(clientX, clientY, dy, deltaMode, dtMs) {
    const now = performance.now();
    const fly = window._globeFly;
    if (fly && (fly.mode === 'zoom' || fly.tierId)) window._globeFly = null;
    resetTrackInertia();
    const dt = Math.max(4, dtMs || (this._lastWheelT ? now - this._lastWheelT : 16));
    this._lastWheelT = now;
    let impulse = this._normDy(dy, deltaMode);
    const perMs = Math.abs(impulse) / dt;
    const speedScale = 0.42 + Math.min(3.1, Math.pow(perMs * 0.00105, 0.82));
    impulse *= speedScale;
    if (dt < 28) impulse *= 1.08 + Math.min(1.15, (28 - dt) / 22);
    const sameDir = Math.sign(impulse) === Math.sign(this._vel) || Math.abs(this._vel) < 1e-7;
    if (sameDir) {
      this._vel = Math.max(-this.MAX_VEL, Math.min(this.MAX_VEL, this._vel + impulse));
    } else {
      this._vel = Math.max(-this.MAX_VEL, Math.min(this.MAX_VEL, this._vel * 0.14 + impulse * 0.96));
    }
    this._lastX = clientX;
    this._lastY = clientY;
    this._scrolling = true;
    this._activeUntil = now + Math.max(180, 320 - dt * 4);
    GlobeControl?.userTookGlobe?.('silent');
  },

  tick() {
    const now = performance.now();
    const active = now < this._activeUntil;
    const dt = frameDtMs();
    const frame = dt / 16;
    if (Math.abs(this._vel) < this.MIN_VEL) {
      this._vel = 0;
      if (!active && this._scrolling) {
        GlobeNavigate?.onZoomSettle?.();
        this._scrolling = false;
      }
      return;
    }
    const step = this._vel;
    const vel = Math.abs(this._vel);
    if (this._lastX != null && this._lastY != null) {
      zoomAt(this._lastX, this._lastY, step, { zoomOnly: true, velocity: vel });
    } else {
      zoomBy(step, { velocity: vel });
    }
    const friction = active ? this.FRICTION_ACTIVE : this.FRICTION_IDLE;
    this._vel *= Math.pow(friction, frame);
    if (!active && Math.abs(this._vel) < 0.0006) {
      this._vel = 0;
      if (this._scrolling) {
        GlobeNavigate?.onZoomSettle?.();
        this._scrolling = false;
      }
    }
  },
};
window.GlobeZoom = GlobeZoom;

let pinchDist = 0;
let pinchLastT = 0;
let pinching = false;
let lastTapAt = 0;
let lastTapX = 0;
let lastTapY = 0;
let pressTimer = null;
let pressStartX = 0;
let pressStartY = 0;

function trackballMove(clientX, clientY) {
  const now = performance.now();
  const dt = trackLastMoveT ? now - trackLastMoveT : 16;
  trackLastMoveT = now;
  const dx = clientX - px;
  const dy = clientY - py;
  px = clientX;
  py = clientY;
  applyTrackballDrag(dx, dy, dt);
}

function trackballStart(clientX, clientY) {
  window._globeFly = null;
  GlobeControl?.userTookGlobe?.('drag');
  drag = true;
  dragging = true;
  trackLastMoveT = performance.now();
  if (Math.abs(trackAngVel) > 1e-6) {
    trackAngVel *= ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_CATCH_DAMP;
    trackVelSmooth *= ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_CATCH_DAMP;
  }
  px = clientX;
  py = clientY;
  pressStartX = clientX;
  pressStartY = clientY;
  canvas.classList.add('dragging');
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    if (!drag || Math.hypot(px - pressStartX, py - pressStartY) > 14) return;
    ZoomTiers?.stepOut?.();
    MapDepict?.setHud('Zoom out', 'long-press');
  }, 750);
}

function trackballEnd(clientX, clientY, opts) {
  clearTimeout(pressTimer);
  drag = false;
  canvas.classList.remove('dragging');
  if (trackAngAxis && Math.abs(trackVelSmooth) > TRACK_INERTIA_MIN) {
    trackAngVel = Math.max(-TRACK_MAX_ANG_VEL, Math.min(TRACK_MAX_ANG_VEL, trackVelSmooth * ASTRANOV_GLOBE_PHYSICS_LOCK.track.TRACK_RELEASE_BOOST));
    trackInertiaAxis = trackAngAxis;
    trackInertiaAngle = trackAngVel * 16;
  }
  setTimeout(() => { dragging = false; }, 100);
  if (!opts?.skipTap && clientX != null && clientY != null) registerTap(clientX, clientY);
}

function registerTap(clientX, clientY) {
  const now = Date.now();
  if (now - lastTapAt < 340 && Math.hypot(clientX - lastTapX, clientY - lastTapY) < 36) {
    if (GlobeNavigate?.isGlobal?.()) {
      ZoomTiers?.goTo?.('national', true);
      GlobeNavigate.mode = 'national';
      GlobeNavigate._cityUnlocked = false;
    } else if (GlobeNavigate?.isNational?.()) {
      mouse.x = (clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(earth);
      if (hits.length) {
        const pin = MapPlaceMenu?.pointFromGlobeHit?.(hits[0].point);
        if (pin) void GlobeNavigate?._enterCitySlow?.(pin.lat, pin.lng, {});
      }
    }
    MapDepict?.setHud('Zoom step', 'double-tap');
    lastTapAt = 0;
    return;
  }
  lastTapAt = now;
  lastTapX = clientX;
  lastTapY = clientY;
}

function zoomBy(delta, opts) {
  if (!delta || !Number.isFinite(delta)) return;
  opts = opts || {};
  const vel = opts.velocity != null ? opts.velocity : Math.abs(delta);
  const gain = ZOOM_SMOOTH_BASE + Math.min(0.34, Math.pow(vel, 0.72) * 0.38);
  const factor = Math.exp(delta * gain);
  const prev = camera.position.z;
  let next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev * factor));
  if (GlobeNavigate?.clampZ) next = GlobeNavigate.clampZ(next);
  if (Math.abs(next - prev) < 0.00002) return;
  camera.position.z = next;
  camera.lookAt(0, 0, 0);
  CosmicZoom.update(next);
  CityMap?.onCamera?.(next, CosmicZoom?.level);
  ZoomTiers?.syncFromCamZ?.(next, false);
  GlobeNavigate?._syncChip?.();
}

function zoomAt(clientX, clientY, delta, opts) {
  opts = opts || {};
  const zoomOnly = opts.zoomOnly;
  const vel = opts.velocity != null ? opts.velocity : Math.abs(delta);
  if (!zoomOnly) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(earth);
    if (hits.length) {
      const dir = hits[0].point.clone().normalize();
      const pullScale = 0.55 + Math.min(1.4, vel * 2.8);
      const pull = (delta > 0 ? 0.04 : -0.06) * pullScale;
      globePivot.rotation.y += dir.x * pull;
      globePivot.rotation.x = Math.max(-1.25, Math.min(1.25, globePivot.rotation.x + dir.y * pull));
      syncGlobePivotRotation?.();
    }
  }
  zoomBy(delta, { velocity: vel });
}
window.zoomBy = zoomBy;
window.zoomAt = zoomAt;

function onWheelZoom(e) {
  e.preventDefault();
  GlobeZoom.impuls(e.clientX, e.clientY, e.deltaY, e.deltaMode);
}

function bindTrackballEvents(targetCanvas) {
  const c = targetCanvas || canvas;
  if (!c || c.__trackballBound) return c;
  c.__trackballBound = true;
  c.addEventListener('mousedown', e => { if (e.button === 0) trackballStart(e.clientX, e.clientY); });
  c.addEventListener('mousemove', e => {
    if (!drag) return;
    if (Math.hypot(e.clientX - pressStartX, e.clientY - pressStartY) > 12) clearTimeout(pressTimer);
    trackballMove(e.clientX, e.clientY);
  });
  c.addEventListener('wheel', onWheelZoom, { passive: false });
  c.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    if (drag) trackballEnd(null, null, { skipTap: true });
    clearTimeout(pressTimer);
    pinching = true;
    drag = false;
    dragging = false;
    resetTrackInertia();
    pinchLastT = performance.now();
    pinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    e.preventDefault();
    return;
  }
  if (pinching) return;
  if (e.touches.length === 1) {
    e.preventDefault();
    trackballStart(e.touches[0].clientX, e.touches[0].clientY);
  }
  }, { passive: false });
  c.addEventListener('touchmove', e => {
  if (e.touches.length === 2) {
    e.preventDefault();
    if (!pinchDist) {
      pinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinching = true;
      if (drag) trackballEnd(null, null, { skipTap: true });
      return;
    }
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const now = performance.now();
    const pdt = pinchLastT ? now - pinchLastT : 16;
    pinchLastT = now;
    const pinchDelta = pinchDist - d;
    GlobeZoom.impuls(midX, midY, pinchDelta * 0.34, 0, pdt);
    pinchDist = d;
    return;
  }
  if (pinching) return;
  if (drag && e.touches.length === 1) {
    e.preventDefault();
    if (Math.hypot(e.touches[0].clientX - pressStartX, e.touches[0].clientY - pressStartY) > 14) {
      clearTimeout(pressTimer);
    }
    trackballMove(e.touches[0].clientX, e.touches[0].clientY);
  }
  }, { passive: false });
  c.addEventListener('touchend', e => {
  if (e.touches.length < 2) {
    pinchDist = 0;
    pinchLastT = 0;
    pinching = false;
  }
  if (e.touches.length === 0 && drag) {
    const t = e.changedTouches[0];
    trackballEnd(t ? t.clientX : null, t ? t.clientY : null);
  }
  });
  c.addEventListener('dblclick', e => {
    e.preventDefault();
    ZoomTiers?.stepIn?.();
  });
  return c;
}

bindTrackballEvents(canvas);
window.addEventListener('mouseup', e => { if (drag) trackballEnd(e.clientX, e.clientY); });
container.addEventListener('wheel', onWheelZoom, { passive: false });
window.bindTrackballEvents = bindTrackballEvents;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

container.addEventListener('click', onGlobeClick);

function globeClickTargets() {
  if (window.GlobeEntity?.clickTargets) {
    const t = GlobeEntity.clickTargets();
    if (t.length) return t;
  }
  const targets = [];
  if (window._meMarker) targets.push(window._meMarker);
  if (window.Commerce?.markers) targets.push(...window.Commerce.markers);
  globePivot.children.forEach(c => {
    if (c.userData?.globeEntity || c.userData?.name || c.userData?.vendor || c.userData?.type === 'me' || c.userData?.type === 'pilot' || c.userData?.type === 'post') {
      if (!targets.includes(c)) targets.push(c);
    }
  });
  return targets;
}

function onGlobeClick(e) {
  if (dragging) return;
  if (MapOverlayDismiss.handleMapClick(e)) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const routeHits = raycaster.intersectObjects(MarketplaceDeliveryEngine?._globeMeshes || [], true);
  if (routeHits.length > 0 && MarketplaceDeliveryEngine?.pickFromGlobeHit?.(routeHits[0])) return;

  const markerHits = raycaster.intersectObjects(globeClickTargets(), true);
  if (markerHits.length > 0) {
    const hit = markerHits[0].object;
    const entity = GlobeEntity?.pickFromHit?.(hit);
    if (entity) {
      GlobeEntity.activate(entity);
      return;
    }
    const root = hit.userData?.vendor ? hit : (hit.parent?.userData?.vendor ? hit.parent : hit);
    const ud = root.userData || hit.userData || {};
    if (ud.vendor) { VendorMapTile?.open?.(ud.vendor); return; }
    if (ud.type === 'me' || root === window._meMarker) {
      const entity = GlobeEntity?.entities?.get('me');
      if (entity) { GlobeEntity.activate(entity); return; }
      const up = window._lastPos || { lat: 36.22, lng: 28.12 };
      MapDepict?.zoomToUser?.(GlobeControl?.Z?.national || 1.82);
      return;
    }
  }

  const intersects = raycaster.intersectObject(earth);
  if (intersects.length > 0) {
    const pin = MapPlaceMenu?.pointFromGlobeHit?.(intersects[0].point);
    if (pin) void GlobeNavigate?.handlePlaceClick?.(pin.lat, pin.lng, {});
  }
}

function eulerFromDir(dir) {
  const toY = -Math.atan2(dir.x, dir.z);
  const toX = Math.max(-0.85, Math.min(0.85, -Math.asin(Math.max(-1, Math.min(1, dir.y))) * 0.45));
  return new THREE.Euler(toX, toY, 0, 'YXZ');
}

function flyToPoint(point, targetZ = 1.82, opts) {
  opts = opts || {};
  if (drag || dragging) {
    GlobeControl?.userTookGlobe?.('silent');
    window._globeFly = null;
  }
  syncGlobePivotRotation?.();
  const dir = point.clone().normalize();
  const toE = eulerFromDir(dir);
  const qTo = new THREE.Quaternion().setFromEuler(toE);
  const qFrom = globePivot.quaternion.clone();
  const angle = qFrom.angleTo(qTo);
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZ));
  if (ZoomTiers) {
    const near = ZoomTiers.TIERS.reduce((best, t) =>
      Math.abs(t.z - z) < Math.abs(best.z - z) ? t : best, ZoomTiers.TIERS[0]);
    ZoomTiers._index = ZoomTiers.indexOf(near.id);
  }
  const fromZ = camera.position.z;
  const baseDur = opts.dur || GlobeControl?.flyDuration?.(fromZ, z) || 1400;
  const dur = Math.max(700, Math.min(5200, baseDur + angle * 820));
  window._globeFly = {
    mode: 'quat',
    fromQ: qFrom,
    toQ: qTo,
    fromZ,
    toZ: z,
    t0: performance.now(),
    dur,
    tierId: ZoomTiers?.current?.()?.id,
    onDone: typeof opts.onDone === 'function' ? opts.onDone : null,
    onTier: !!opts.onTier,
  };
}

function focusOnGlobePoint(point, targetZ) {
  flyToPoint(point, targetZ || GlobeControl?.Z?.national || 1.82);
}

function tickGlobeFly() {
  const f = window._globeFly;
  document.body.classList.toggle('globe-flying', !!(f && !drag && !dragging));
  if (!f || drag || dragging) return;
  const p = Math.min(1, (performance.now() - f.t0) / f.dur);
  const ease = p < 0.5
    ? 4 * p * p * p
    : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const smooth = f.mode === 'zoom' ? (ease * ease * (3 - 2 * ease)) : ease;
  if (f.mode === 'zoom') {
    /* camera-only — globe bearing unchanged */
  } else if (f.mode === 'quat' && f.fromQ && f.toQ) {
    globePivot.quaternion.slerpQuaternions(f.fromQ, f.toQ, ease);
    globePivot.rotation.setFromQuaternion(globePivot.quaternion, 'YXZ');
  } else {
    console.warn('[trackball] deprecated euler fly blocked — use quat or zoom');
    window._globeFly = null;
    document.body.classList.remove('globe-flying');
    return;
  }
  resetTrackInertia();
  camera.position.z = f.fromZ + (f.toZ - f.fromZ) * (f.mode === 'zoom' ? smooth : ease);
  camera.lookAt(0, 0, 0);
  CosmicZoom.update(camera.position.z);
  const flyLevel = window._cityDropLock ? 'earth' : CosmicZoom?.level;
  CityMap?._applyGlobeMapCrossfade?.(camera.position.z);
  CityMap?.onCamera?.(camera.position.z, flyLevel);
  if (p >= 1) {
    const tid = f.tierId;
    const done = f.onDone;
    window._globeFly = null;
    document.body.classList.remove('globe-flying');
    if (f.onTier && tid && ZoomTiers) {
      const i = ZoomTiers.indexOf(tid);
      if (i >= 0) ZoomTiers._index = i;
      ZoomTiers._apply(ZoomTiers.current());
    } else if (tid && ZoomTiers) {
      const i = ZoomTiers.indexOf(tid);
      if (i >= 0) ZoomTiers._index = i;
      ZoomTiers._apply(ZoomTiers.current());
    } else {
      ZoomTiers?.syncFromCamZ?.(camera.position.z, false);
      cityLevel = camera.position.z <= (CityMap?.ENTER_Z ?? 1.34);
      CityMap?.onCamera?.(camera.position.z, CosmicZoom?.level);
    }
    try { done?.(); } catch (_) {}
  }
}

function waitForGlobeFly(timeout = 9000) {
  return new Promise(resolve => {
    if (!window._globeFly) return resolve();
    const t0 = performance.now();
    const id = setInterval(() => {
      tickGlobeFly();
      if (!window._globeFly || performance.now() - t0 > timeout) {
        clearInterval(id);
        resolve();
      }
    }, 16);
  });
}
window.tickGlobeFly = tickGlobeFly;
window.waitForGlobeFly = waitForGlobeFly;
window.trackballStart = trackballStart;
window.trackballMove = trackballMove;
window.trackballEnd = trackballEnd;
window.flyToPoint = flyToPoint;
window.__trackballContract = Object.freeze({
  v: 2,
  exports: ['trackballStart', 'trackballMove', 'trackballEnd', 'tickGlobeFly', 'flyToPoint', 'bindTrackballEvents'],
  flyMode: 'quat',
});

function showGestureHint() {
  if (sessionStorage.getItem('astranov-gesture-hint')) return;
  const el = document.createElement('div');
  el.id = 'gesture-hint';
  el.textContent = 'Trackball drag to spin Earth · Scroll/pinch zoom · Double-tap zoom in';
  el.style.cssText = 'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);padding:8px 14px;background:rgba(0,4,12,0.88);border:1px solid rgba(26,111,212,0.45);border-radius:20px;font:12px system-ui;color:#3d9eff;text-shadow:0 0 8px rgba(26,111,212,0.45);z-index:44;pointer-events:none;opacity:1;transition:opacity 1.2s';
  document.body.appendChild(el);
  sessionStorage.setItem('astranov-gesture-hint', '1');
  setTimeout(() => { el.style.opacity = '0'; }, 3200);
  setTimeout(() => { el.remove(); }, 4500);
}
setTimeout(showGestureHint, 600);

// === TRACKBALL GUARD — never lose globe drag/spin; regression shield ===
const TrackballGuard = {
  _ok: false,
  _lastCheck: 0,
  FRICTION: 0.88,
  MIN_VEL: 0.00008,
  CONTRACT: ['trackballStart', 'trackballMove', 'trackballEnd', 'tickGlobeFly', 'flyToPoint', 'bindTrackballEvents'],

  verify() {
    const ok = !!(
      typeof globePivot !== 'undefined' && globePivot
      && typeof renderer !== 'undefined' && renderer?.domElement
      && typeof trackballStart === 'function'
      && typeof trackballMove === 'function'
      && typeof trackballEnd === 'function'
      && typeof tickGlobeFly === 'function'
      && typeof flyToPoint === 'function'
      && typeof bindTrackballEvents === 'function'
      && typeof trackVelX === 'number'
      && typeof trackVelY === 'number'
      && renderer.domElement.__trackballBound
      && window.__trackballContract?.flyMode === 'quat'
    );
    this._ok = ok;
    this._lastCheck = Date.now();
    if (!ok) console.warn('[TrackballGuard] bindings missing — attempting repair');
    return ok;
  },

  repair() {
    const canvas = renderer?.domElement;
    if (!canvas) return this.verify();
    if (!canvas.__trackballBound && typeof bindTrackballEvents === 'function') {
      try { bindTrackballEvents(canvas); } catch (e) {
        console.error('[TrackballGuard] rebind failed', e);
      }
    }
    syncGlobePivotRotation?.();
    return this.verify();
  },

  applyInertia() {
    if (drag || window._globeFly || !globePivot) return;
    const dt = frameDtMs();
    const frame = dt / 16;
    if (trackAngAxis && Math.abs(trackAngVel) > TRACK_INERTIA_MIN / 16) {
      const angle = trackAngVel * dt;
      globePivot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(trackAngAxis, angle));
      syncGlobePivotRotation?.();
      trackAngVel *= Math.pow(TRACK_INERTIA_DAMP, frame);
      trackInertiaAngle = trackAngVel * 16;
      if (Math.abs(trackAngVel) < TRACK_INERTIA_MIN / 16) {
        trackAngVel = 0;
        trackAngAxis = null;
        trackInertiaAxis = null;
        trackInertiaAngle = 0;
      }
    }
    const damp = Math.pow(this.FRICTION, frame);
    if (typeof trackVelX === 'number') trackVelX *= damp;
    if (typeof trackVelY === 'number') trackVelY *= damp;
    if (Math.abs(trackVelX) < this.MIN_VEL) trackVelX = 0;
    if (Math.abs(trackVelY) < this.MIN_VEL) trackVelY = 0;
  },

  beforeFly(lat, lng, opts) {
    if (opts?.force) return true;
    if (drag || dragging) {
      GlobeControl?.userTookGlobe?.('silent');
      return true;
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    const cur = this.facingLatLng();
    const dist = this.greatCircleKm(cur.lat, cur.lng, lat, lng);
    if (dist > 12000 && !opts?.allowLongHaul) {
      CliRibbon?.setNotice?.('Fly blocked — too far · drag globe or say locate', 'hold');
      return false;
    }
    return true;
  },

  facingLatLng() {
    if (!globePivot) return { lat: 0, lng: 0 };
    syncGlobePivotRotation?.();
    const e = new THREE.Euler().setFromQuaternion(globePivot.quaternion, 'YXZ');
    const lat = THREE.MathUtils.radToDeg(e.x) * -2.2;
    const lng = THREE.MathUtils.radToDeg(-e.y) - 180;
    return { lat: Math.max(-85, Math.min(85, lat)), lng: ((lng + 540) % 360) - 180 };
  },

  greatCircleKm(lat1, lng1, lat2, lng2) { return SpaceNetGeo.haversineKm(lat1, lng1, lat2, lng2); },

  init() {
    if (renderer?.domElement) bindTrackballEvents?.(renderer.domElement);
    if (!this.verify()) this.repair();
    setInterval(() => {
      if (!this.verify()) this.repair();
    }, 8000);
    window.__trackballGuardOk = () => this._ok;
    window.__trackballGuardVerify = () => this.verify();
  },
};
window.TrackballGuard = TrackballGuard;
// TrackballGuard.init() — deferred to _astranovBoot

// === CITY MAP — satellite + streets when zoomed to city level ===
const CityMap = {
  NATIONAL_ENTER_Z: 1.92,
  NATIONAL_EXIT_Z: 1.44,
  ENTER_Z: 1.40,
  EXIT_Z: 1.50,
  active: false,
  _nationalActive: false,
  map: null,
  _ready: false,
  _center: { lat: 36.44, lng: 28.22 },
  _layers: {},
  _onMap: new Set(),
  _markers: {},
  _route: null,
  _driverTimer: null,
  _syncTimer: null,
  _demoDrivers: [],
  _demoPhase: 0,
  _forceOpen: false,
  _initAttempts: 0,
  _blend: 0,
  _mapStyle: 'satellite',
  STYLE_KEY: 'astranov_map_style_v1',
  _stackIdx: 0,
  _tileStats: { ok: 0, err: 0, lastOk: 0 },
  _healthTimer: null,
  _lastEscalate: 0,
  _leafletLoading: null,

  _globeZ() {
    return ZoomTiers?.tierZ?.('global') ?? GlobeControl?.Z?.global ?? 2.55;
  },

  _nationalZ() {
    return ZoomTiers?.tierZ?.('national') ?? GlobeControl?.Z?.national ?? 1.82;
  },

  _setGlobeSurfaceVisible(show) {
    if (window.earth) window.earth.visible = !!show;
    const g = window.AIGraphics;
    if (!g) return;
    ['atmosphere', 'clouds', 'cityLights', 'neuralLayer', 'idleNodes'].forEach((k) => {
      if (g[k]) g[k].visible = !!show;
    });
  },

  _applyGlobeMapCrossfade(camZ) {
    if (this.active) {
      document.documentElement.style.setProperty('--globe-opacity', '0');
      document.documentElement.style.setProperty('--map-opacity', '1');
      this._setGlobeSurfaceVisible(false);
      return;
    }
    const z0 = this._globeZ();
    const z1 = this._nationalZ();
    let t = 0;
    if (camZ <= z1) t = 1;
    else if (camZ < z0) t = 1 - (camZ - z1) / (z0 - z1);
    t = Math.max(0, Math.min(1, Math.pow(t, 0.65)));
    this._blend = t;
    document.documentElement.style.setProperty('--globe-opacity', String(1 - t));
    document.documentElement.style.setProperty('--map-opacity', String(t));
    this._setGlobeSurfaceVisible(t < 0.92);
    const mapEl = document.getElementById('city-map');
    if (mapEl && t > 0.04 && !this.active) {
      if (!mapEl.classList.contains('national-active')) mapEl.classList.add('national-active');
      if (this.map) {
        const c = this.mapViewCenter();
        this._center = c;
        const lz = this.nationalLeafletZoom(camZ);
        if (this.map.getZoom() !== lz) this.map.setZoom(lz, { animate: false });
        const cur = this.map.getCenter();
        if (Math.abs(cur.lat - c.lat) > 0.03 || Math.abs(cur.lng - c.lng) > 0.03) {
          this.map.panTo([c.lat, c.lng], { animate: false });
        }
        this._applyBaseLayers();
        this.syncMapPins();
        this._invalidate();
      }
    } else if (mapEl && !this._nationalActive && t <= 0.04) {
      mapEl.classList.remove('national-active');
      mapEl.style.removeProperty('opacity');
    }
    this._updateStyleSwitchVisible();
  },

  async _loadLeaflet() {
    if (window.L) return true;
    if (this._leafletLoading) return this._leafletLoading;
    this._leafletLoading = (async () => {
      const sources = [
        { css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' },
        { css: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css', js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' },
        { css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js' },
      ];
      for (const src of sources) {
        const ok = await this._injectLeaflet(src.css, src.js);
        if (ok) return true;
      }
      return false;
    })();
    try {
      return await this._leafletLoading;
    } finally {
      this._leafletLoading = null;
    }
  },

  _injectLeaflet(cssUrl, jsUrl) {
    return new Promise(resolve => {
      if (window.L) return resolve(true);
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssUrl;
        link.crossOrigin = '';
        document.head.appendChild(link);
      }
      const existing = document.querySelector('script[src*="leaflet"]');
      if (existing) {
        const done = () => resolve(!!window.L);
        if (window.L) return done();
        existing.addEventListener('load', done, { once: true });
        existing.addEventListener('error', () => resolve(false), { once: true });
        setTimeout(() => resolve(!!window.L), 4500);
        return;
      }
      const script = document.createElement('script');
      script.src = jsUrl;
      script.crossOrigin = '';
      script.onload = () => resolve(!!window.L);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  },

  async ensureReady() {
    if (this._ready && this.map) return true;
    const deadline = Date.now() + 14000;
    while (Date.now() < deadline) {
      if (!window.L) await this._loadLeaflet();
      if (!this._ready && this._initAttempts < 8) {
        this._initAttempts++;
        this.init();
      }
      if (this._ready && this.map) return true;
      await new Promise(r => setTimeout(r, 350));
    }
    return !!(this._ready && this.map);
  },

  init() {
    if (!window.L) {
      console.warn('[CityMap] Leaflet not loaded');
      return;
    }
    if (this._ready && this.map) return;
    let el = document.getElementById('city-map');
    if (!el) {
      el = document.createElement('div');
      el.id = 'city-map';
      document.body.appendChild(el);
    }
    this.map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
    });
    this._buildLayers();
    AstranovTheme?.registerMap?.(this);
    this.map.setView([this._center.lat, this._center.lng], 14);
    this.map.on('zoomend moveend', () => {
      if (!this.active) return;
      const c = this.map.getCenter();
      this._center = { lat: c.lat, lng: c.lng };
    });
    this.map.on('click', (e) => {
      if (!this.active && !this._nationalActive) return;
      const dom = e.originalEvent;
      if (MapOverlayDismiss.handleMapClick(dom || { target: document.getElementById('city-map') })) return;
      if (this._nationalActive && !this.active) {
        void GlobeNavigate?.handlePlaceClick?.(e.latlng.lat, e.latlng.lng, {});
      } else {
        MapPlaceMenu?.openAt?.(e.latlng.lat, e.latlng.lng, { source: 'City map', hint: '3 smart picks only', limited: true });
      }
    });
    window.addEventListener('resize', () => {
      if (this.active) this._invalidate();
    });
    this._bindZoomBridge(el);
    this._bindStyleSwitch();
    this._loadMapStyle();
    this._ready = true;
    const driverMs = SlumberManager?.tickMs?.('cityDriver') || 4500;
    this._driverTimer = setInterval(() => this._tickDrivers(), driverMs);
    this._syncTimer = setInterval(() => { if (this.active) this._syncMarkers(); }, 2000);
  },

  _invalidate() {
    if (!this.map) return;
    try {
      this.map.invalidateSize({ animate: false });
    } catch (_) {}
  },

  _mapIsVisible() {
    return !!(this.active || this._nationalActive || (this._blend || 0) > 0.06);
  },

  _onTileOk() {
    this._tileStats.ok++;
    this._tileStats.lastOk = Date.now();
  },

  _onTileErr(layerKey) {
    this._tileStats.err++;
    if (this._mapIsVisible()) this._maybeEscalateLayers('tileerror:' + (layerKey || '?'));
  },

  _wrapTileLayer(layer, key) {
    if (!layer) return layer;
    layer.on('tileload', () => this._onTileOk());
    layer.on('tileerror', () => this._onTileErr(key));
    return layer;
  },

  _getLayerStacks() {
    const Lyr = this._layers;
    if (!Lyr?.sat) return [];
    return [
      { id: 'sat_hd', label: 'Satellite HD', layers: [
        { layer: Lyr.sat, opacity: 1 },
        { layer: Lyr.streetLabels, opacity: 1 },
        { layer: Lyr.placeLabels, opacity: 0.92 },
      ]},
      { id: 'sat_streets', label: 'Satellite + streets', layers: [
        { layer: Lyr.sat, opacity: 1 },
        { layer: Lyr.voyager, opacity: 0.44 },
      ]},
      { id: 'osm_labels', label: 'OSM + labels', layers: [
        { layer: Lyr.satFallback, opacity: 1 },
        { layer: Lyr.streetLabels, opacity: 0.86 },
      ]},
      { id: 'voyager', label: 'Street map', layers: [
        { layer: Lyr.voyager, opacity: 1 },
      ]},
      { id: 'osm', label: 'OpenStreetMap', layers: [
        { layer: Lyr.satFallback, opacity: 1 },
      ]},
      { id: 'osm_alt', label: 'OSM mirror', layers: [
        { layer: Lyr.osmAlt, opacity: 1 },
      ]},
      { id: 'dark', label: 'Dark streets', layers: [
        { layer: Lyr.darkStreets, opacity: 1 },
      ]},
    ];
  },

  _baseStackForStyle(style) {
    if (style === 'bright') return 3;
    if (style === 'dark') return 6;
    return 0;
  },

  _preferredStackIdx() {
    return this._baseStackForStyle(this.getMapStyle?.() || 'satellite');
  },

  _recoverPreferredStack() {
    const pref = this._preferredStackIdx();
    if (this._stackIdx <= pref || !this._tileStats?.ok || this._tileStats.ok < 6) return false;
    this._applyLayerStack(pref);
    this._tileStats = { ok: 0, err: 0, lastOk: Date.now() };
    AciCli?.print?.('map · restored HD tiles', 'ok');
    return true;
  },

  _applyLayerStack(idx) {
    if (!this.map) return false;
    const stacks = this._getLayerStacks();
    if (!stacks.length) return false;
    idx = Math.max(0, Math.min(stacks.length - 1, idx));
    this._stackIdx = idx;
    const stack = stacks[idx];
    this._onMap.forEach(l => { try { this.map.removeLayer(l); } catch (_) {} });
    this._onMap.clear();
    stack.layers.forEach(entry => {
      const layer = entry.layer;
      if (!layer) return;
      const op = entry.opacity != null ? entry.opacity : 1;
      if (layer.setOpacity) layer.setOpacity(op);
      layer.addTo(this.map);
      this._onMap.add(layer);
    });
    const el = document.getElementById('city-map');
    if (el) el.dataset.layerStack = stack.id;
    this._syncStyleUi();
    this._updateStyleSwitchVisible();
    if (this._mapIsVisible()) this._invalidate();
    return true;
  },

  _maybeEscalateLayers(reason) {
    const stacks = this._getLayerStacks();
    if (!stacks.length || this._stackIdx >= stacks.length - 1) return false;
    const now = Date.now();
    if (now - (this._lastEscalate || 0) < 1600) return false;
    this._lastEscalate = now;
    const next = this._stackIdx + 1;
    console.warn('[CityMap] fallback layer →', stacks[next].id, reason || '');
    this._applyLayerStack(next);
    this._tileStats = { ok: 0, err: 0, lastOk: this._tileStats.lastOk || 0 };
    AciCli?.print?.('map · fallback · ' + stacks[next].label, 'warn');
    GlobeDeck?.setPreview?.('Map · ' + stacks[next].label);
    return true;
  },

  _startHealthWatch() {
    this._stopHealthWatch();
    this._tileStats = { ok: 0, err: 0, lastOk: 0 };
    let checks = 0;
    this._healthTimer = setInterval(() => {
      if (!this._mapIsVisible()) {
        this._stopHealthWatch();
        return;
      }
      checks++;
      const stale = !this._tileStats.lastOk && checks >= 2;
      const staleLong = this._tileStats.lastOk && Date.now() - this._tileStats.lastOk > 6000;
      const noTiles = checks >= 2 && this._tileStats.ok === 0 && this._tileStats.err >= 2;
      const errHeavy = this._tileStats.err >= 5 && this._tileStats.err > this._tileStats.ok * 1.5;
      if (noTiles || errHeavy || stale || staleLong) {
        if (!this._maybeEscalateLayers('health')) this._stopHealthWatch();
        checks = 0;
      }
      if (this._tileStats.ok >= 10 && this._stackIdx > this._preferredStackIdx()) {
        this._recoverPreferredStack();
      }
      if (checks > 10) this._stopHealthWatch();
    }, 2800);
  },

  _stopHealthWatch() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  },

  _loadMapStyle() {
    try {
      const s = localStorage.getItem(this.STYLE_KEY);
      if (s === 'satellite' || s === 'bright' || s === 'dark') this._mapStyle = s;
    } catch (_) {}
    return this._mapStyle;
  },

  getMapStyle() {
    return this._mapStyle || 'satellite';
  },

  setMapStyle(style) {
    const s = style === 'bright' || style === 'dark' ? style : 'satellite';
    this._mapStyle = s;
    this._stackIdx = this._baseStackForStyle(s);
    try { localStorage.setItem(this.STYLE_KEY, s); } catch (_) {}
    this._applyBaseLayers();
    this._syncStyleUi();
    const labels = { satellite: 'Satellite', bright: 'Bright streets', dark: 'Dark streets' };
    GlobeDeck?.setPreview?.('Map · ' + (labels[s] || s));
    AciCli?.print?.('map style → ' + s, 'ok');
    return s;
  },

  cycleMapStyle() {
    const order = ['satellite', 'bright', 'dark'];
    const i = order.indexOf(this.getMapStyle());
    return this.setMapStyle(order[(i + 1) % order.length]);
  },

  _syncStyleUi() {},

  _updateStyleSwitchVisible() {},

  _bindStyleSwitch() {},

  _buildLayers() {
    const maxZ = Math.max(20, SlumberManager?.quality?.cityMaxZoom || 20);
    const sat = this._wrapTileLayer(L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: maxZ, attribution: 'Esri · satellite' }
    ), 'sat');
    const satFallback = this._wrapTileLayer(L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '© OSM fallback' }
    ), 'osm');
    const osmAlt = this._wrapTileLayer(L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19, attribution: '© OSM mirror' }
    ), 'osm_alt');
    const streetLabels = this._wrapTileLayer(L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, opacity: 1, attribution: '© CARTO © OSM' }
    ), 'labels');
    const placeLabels = this._wrapTileLayer(L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, minZoom: 10, opacity: 0.92, attribution: 'Esri · places' }
    ), 'places');
    const voyager = this._wrapTileLayer(L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, attribution: '© CARTO © OSM · streets & blocks' }
    ), 'voyager');
    const darkStreets = this._wrapTileLayer(L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, attribution: '© CARTO © OSM · dark' }
    ), 'dark');
    this._layers = { sat, satFallback, osmAlt, streetLabels, placeLabels, voyager, brightStreets: voyager, darkStreets, streets: voyager };
    this._loadMapStyle();
    this._stackIdx = this._baseStackForStyle(this.getMapStyle());
    this._applyBaseLayers();
  },

  _mapTheme() {
    return AstranovTheme?.effectiveMode?.() || AstranovTheme?.systemMode?.() || AstranovTheme?.mode || 'dark';
  },

  _applyBaseLayers() {
    if (!this.map || !this._layers?.sat) return;
    const uiTheme = this._mapTheme();
    const el = document.getElementById('city-map');
    let savedStyle = this.getMapStyle();
    if (!this.active && (this._nationalActive || (this._blend || 0) > 0.2) && savedStyle === 'satellite') {
      savedStyle = uiTheme === 'bright' ? 'bright' : 'dark';
    }
    const style = (this.active || this._nationalActive || (this._blend || 0) > 0.12) ? savedStyle : 'satellite';
    if (el) {
      el.dataset.theme = uiTheme;
      el.dataset.mapStyle = style;
    }
    const preferred = this._baseStackForStyle(style);
    if (this._stackIdx < preferred || !this._getLayerStacks()[this._stackIdx]) {
      this._stackIdx = preferred;
    }
    this._applyLayerStack(this._stackIdx);
  },

  onThemeChange() {
    const el = document.getElementById('city-map');
    if (el) el.dataset.theme = this._mapTheme();
    if (!this.active && (this._nationalActive || (this._blend || 0) > 0.12)) {
      const uiTheme = this._mapTheme();
      if (this.getMapStyle() === 'satellite') this.setMapStyle(uiTheme === 'bright' ? 'bright' : 'dark');
      else this._applyBaseLayers();
    }
  },

  camZToZoom(camZ) {
    if (camZ <= 1.06) return 18;
    if (camZ <= 1.12) return 17;
    if (camZ <= 1.22) return 16;
    if (camZ <= 1.32) return 15;
    const z = Math.max(1.02, Math.min(1.48, camZ));
    const t = (1.48 - z) / (1.48 - 1.02);
    return Math.round(11 + t * 4);
  },

  nationalLeafletZoom(camZ) {
    if (camZ >= 1.78) return 6;
    if (camZ >= 1.62) return 8;
    return 10;
  },

  _bindZoomBridge(el) {
    if (!el || el._cityZoomBridge) return;
    el._cityZoomBridge = true;
    let pinchDist = 0;
    let pinchLastT = 0;

    el.addEventListener('wheel', e => {
      if (!this.active && !this._nationalActive) return;
      e.preventDefault();
      e.stopPropagation();
      GlobeZoom.impuls(e.clientX, e.clientY, e.deltaY, e.deltaMode);
    }, { passive: false });

    el.addEventListener('touchstart', e => {
      if ((!this.active && !this._nationalActive) || e.touches.length !== 2) return;
      pinchLastT = performance.now();
      pinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }, { passive: true });

    el.addEventListener('touchmove', e => {
      if ((!this.active && !this._nationalActive) || e.touches.length !== 2 || !pinchDist) return;
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const now = performance.now();
      const pdt = pinchLastT ? now - pinchLastT : 16;
      pinchLastT = now;
      const delta = pinchDist - d;
      pinchDist = d;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      GlobeZoom.impuls(midX, midY, delta * 0.34, 0, pdt);
    }, { passive: false });

    el.addEventListener('touchend', () => { pinchDist = 0; pinchLastT = 0; });
  },

  globeCenterLatLng() {
    globePivot.updateMatrixWorld(true);
    const v = new THREE.Vector3(0, 0, 1);
    const inv = new THREE.Matrix4().copy(globePivot.matrixWorld).invert();
    v.applyMatrix4(inv);
    const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    const lat = 90 - Math.acos(Math.max(-1, Math.min(1, v.y / r))) * 180 / Math.PI;
    let lng = Math.atan2(v.z, -v.x) * 180 / Math.PI - 180;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    return { lat, lng };
  },

  /** Map viewport — follows globe bearing, not stale GPS / delivery base */
  mapViewCenter(opts) {
    opts = opts || {};
    if (opts.lat != null && opts.lng != null) return { lat: opts.lat, lng: opts.lng };
    if (DrivingView?.active && window._lastPos?.lat != null) return window._lastPos;
    if (GlobeControl?.followMode === 'locate' && window._lastPos?.lat != null && !GlobeControl?.userExploring) {
      return window._lastPos;
    }
    return this.globeCenterLatLng();
  },

  flyTo(lat, lng, zoom) {
    this._center = { lat, lng };
    if (this.map) this.map.setView([lat, lng], zoom || 15, { animate: true });
  },

  /** Force-open city map at coordinates — bypasses camera threshold race conditions */
  async openAt(lat, lng, opts) {
    opts = opts || {};
    let ready = await this.ensureReady();
    if (!ready || !this.map) {
      this._initAttempts = 0;
      ready = await this.ensureReady();
    }
    if (!ready || !this.map) {
      GlobeDeck?.setMapStatus('City map failed — retrying fallback tiles…');
      AciCli?.print('city map init failed — trying OSM fallback', 'warn');
      return false;
    }
    const c = lat != null && lng != null
      ? { lat, lng }
      : (window._lastPos || this._center);
    if (!c?.lat) return false;

    this._center = c;
    window._lastPos = { lat: c.lat, lng: c.lng };
    userLocated = true;

    const camZ = opts.camZ ?? CityLife?.CITY_ZOOM ?? GlobeControl?.cityEntryZ?.() ?? 1.34;
    if (typeof camera !== 'undefined' && camera) {
      camera.position.z = camZ;
      camera.lookAt(0, 0, 0);
    }
    CosmicZoom?.update?.(camZ, { tier: 'city', label: 'CITY', cosmic: 'earth' });
    ZoomTiers?.goTo?.('city', false);
    cityLevel = true;

    this._forceOpen = true;
    const lz = opts.zoom ?? this.camZToZoom(camZ);
    if (!this.active) this._enter(camZ);
    else {
      this.map.setView([c.lat, c.lng], lz, { animate: false });
      this._invalidate();
      this._syncMarkers();
      this._syncRoute();
    }
    if (this.map.getZoom() !== lz) this.map.setZoom(lz, { animate: false });
    this.map.panTo([c.lat, c.lng], { animate: false });
    setTimeout(() => { this._forceOpen = false; }, 4000);
    setTimeout(() => this._invalidate(), 80);
    setTimeout(() => this._invalidate(), 400);
    this._startHealthWatch();
    setTimeout(() => {
      if (this._tileStats.ok === 0 && this._tileStats.err >= 1) this._maybeEscalateLayers('open');
    }, 3200);
    GlobeDeck?.setMapStatus('🏙 City map · ' + c.lat.toFixed(2) + ', ' + c.lng.toFixed(2));
    return true;
  },

  async enter(lat, lng, opts) {
    if (CityLife?.dropIn) return CityLife.dropIn(lat, lng, opts || {});
    const c = lat != null && lng != null ? { lat, lng } : this.mapViewCenter();
    if (!c?.lat) return { error: 'no location' };
    const z = GlobeControl?.cityEntryZ?.() ?? this.ENTER_Z - 0.06;
    const p = latLngToPos(c.lat, c.lng, 1.04);
    if (typeof flyToPoint === 'function') {
      flyToPoint(new THREE.Vector3(p.x, p.y, p.z), z);
      if (typeof waitForGlobeFly === 'function') await waitForGlobeFly();
    }
    this.onCamera(z, 'earth');
    return { lat: c.lat, lng: c.lng };
  },

  onCamera(camZ, level) {
    if (!this._ready) return;
    this._applyGlobeMapCrossfade(camZ);
    const earth = window._cityDropLock || this._forceOpen
      || (level || CosmicZoom?.level || 'earth') === 'earth';
    const driving = !!DrivingView?.active;
    const force = this._forceOpen || window._cityDropLock;
    const h = 0.07;

    if (force || driving) {
      if (!this.active) {
        if (this._nationalActive) this._exitNational();
        this._enter(camZ);
      } else {
        this._syncView(camZ);
      }
      return;
    }

    if (this.active) {
      if (camZ > this.EXIT_Z + h) {
        this._exit();
        if (camZ <= this.NATIONAL_ENTER_Z && camZ > this.NATIONAL_EXIT_Z + h) this._enterNational(camZ);
      } else {
        this._syncView(camZ);
      }
      return;
    }

    if (this._nationalActive) {
      if (camZ > this.NATIONAL_ENTER_Z + h) {
        this._exitNational();
      } else if (camZ <= this.NATIONAL_EXIT_Z - h) {
        this._exitNational();
        if (camZ <= this.ENTER_Z) this._enter(camZ);
      } else {
        this._syncNational(camZ);
      }
      return;
    }

    if (!earth) return;
    if (camZ <= this.ENTER_Z - h * 0.5) {
      this._enter(camZ);
    } else if (camZ <= this.NATIONAL_ENTER_Z && camZ > this.NATIONAL_EXIT_Z + h) {
      this._enterNational(camZ);
    }
  },

  _enter(camZ) {
    if (!this.map) return;
    SlumberManager?.wake?.('city_hd', 'city map');
    this.active = true;
    cityLevel = true;
    this._applyBaseLayers();
    const el = document.getElementById('city-map');
    const globe = document.getElementById('globe');
    if (el) el.classList.add('active');
    if (globe) globe.classList.add('city-map-active');
    document.body.classList.add('city-map-active');
    this._applyGlobeMapCrossfade(camZ);
    const c = this.mapViewCenter();
    this._center = c;
    this.map.setView([c.lat, c.lng], this.camZToZoom(camZ), { animate: false });
    this._invalidate();
    setTimeout(() => this._invalidate(), 120);
    setTimeout(() => this._invalidate(), 500);
    this._syncMarkers();
    this._syncRoute();
    this._seedDemoDrivers(c);
    CityLife?._updateChip?.(
      (CityLife?.nearbyVendors?.(c.lat, c.lng) || []).length,
      Object.keys(this._markers).filter(k => k.startsWith('drv_')).length
    );
    this._updateStyleSwitchVisible();
    this._startHealthWatch();
  },

  _enterNational(camZ) {
    if (!this.map) return;
    this._nationalActive = true;
    const el = document.getElementById('city-map');
    const globe = document.getElementById('globe');
    if (el) { el.classList.add('national-active'); el.classList.remove('active'); }
    if (globe) { globe.classList.add('national-map-active'); globe.classList.remove('city-map-active'); }
    document.body.classList.add('national-map-active');
    document.body.classList.remove('city-map-active');
    this._applyGlobeMapCrossfade(camZ);
    this._applyBaseLayers();
    this.syncMapPins();
    const c = this.mapViewCenter();
    this._center = c;
    this.map.setView([c.lat, c.lng], this.nationalLeafletZoom(camZ), { animate: false });
    this._invalidate();
    GlobeDeck?.setPreview?.('National · ' + (ZoomTiers?.countryHint?.() || 'region') + ' · pinch in for city');
    this._updateStyleSwitchVisible();
    this._startHealthWatch();
  },

  _syncNational(camZ) {
    const c = this.mapViewCenter();
    this._center = c;
    const lz = this.nationalLeafletZoom(camZ);
    if (this.map.getZoom() !== lz) this.map.setZoom(lz, { animate: false });
    const cur = this.map.getCenter();
    if (Math.abs(cur.lat - c.lat) > 0.02 || Math.abs(cur.lng - c.lng) > 0.02) {
      this.map.panTo([c.lat, c.lng], { animate: false });
    }
  },

  _exitNational() {
    this._nationalActive = false;
    this._stopHealthWatch();
    const el = document.getElementById('city-map');
    const globe = document.getElementById('globe');
    if (el) el.classList.remove('national-active');
    if (globe) globe.classList.remove('national-map-active');
    document.body.classList.remove('national-map-active');
    const camZ = camera?.position?.z ?? this._globeZ();
    this._applyGlobeMapCrossfade(camZ);
    this._updateStyleSwitchVisible();
  },

  _exit() {
    this.active = false;
    cityLevel = false;
    this._stopHealthWatch();
    const el = document.getElementById('city-map');
    const globe = document.getElementById('globe');
    if (el) { el.classList.remove('active'); el.classList.remove('national-active'); }
    if (globe) { globe.classList.remove('city-map-active'); globe.classList.remove('national-map-active'); }
    document.body.classList.remove('city-map-active');
    document.body.classList.remove('national-map-active');
    const camZ = camera?.position?.z ?? this._globeZ();
    this._applyGlobeMapCrossfade(camZ);
    EarthRealism?._hudTimer && (EarthRealism._hudTimer = 0);
    const chip = document.getElementById('city-life-chip');
    if (chip) chip.classList.remove('open');
    CliRibbon?.clearGlobeHint?.();
    this._updateStyleSwitchVisible();
  },

  _syncView(camZ) {
    const c = this.mapViewCenter();
    this._center = c;
    const lz = this.camZToZoom(camZ);
    if (this.map.getZoom() !== lz) this.map.setZoom(lz, { animate: false });
    const cur = this.map.getCenter();
    if (Math.abs(cur.lat - c.lat) > 0.0004 || Math.abs(cur.lng - c.lng) > 0.0004) {
      this.map.panTo([c.lat, c.lng], { animate: false });
    }
  },

  _icon(emoji, color, photoUrl, opts) {
    opts = opts || {};
    const size = photoUrl ? 36 : 28;
    const ring = opts.ring || '#fff';
    const inner = photoUrl
      ? '<span class="city-map-pin-photo" style="background-image:url(' + photoUrl + ');border:2px solid ' + ring + ';width:' + size + 'px;height:' + size + 'px"></span>'
      : '<span class="city-map-pin-fallback" style="background:' + color + ';border:2px solid ' + ring + ';width:' + size + 'px;height:' + size + 'px">' + (opts.initial || '') + '</span>';
    return L.divIcon({
      className: 'city-map-pin',
      html: inner,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  },

  syncMapPins() {
    if (!this.map) return;
    const cd = window._clientDelivery;
    if (cd?.lat != null) {
      this._setMarker('pin_client', cd.lat, cd.lng, {
        color: 'rgba(68,255,136,0.9)', ring: '#66ffaa',
        logoUrl: MapPins?.clientPinPhoto?.(cd),
        initial: MapPins?.initials?.(cd.label || 'Deliver'),
        title: cd.label || 'Delivery',
      });
    } else if (this._markers.pin_client) {
      this.map.removeLayer(this._markers.pin_client);
      delete this._markers.pin_client;
    }
    const db = window._driverBase;
    if (db?.lat != null) {
      this._setMarker('pin_driver', db.lat, db.lng, {
        color: 'rgba(255,170,68,0.92)', ring: '#ffb060',
        logoUrl: MapPins?.driverBasePhoto?.(db),
        initial: MapPins?.initials?.(db.label || 'Driver'),
        title: db.label || 'Driver base',
      });
    } else if (this._markers.pin_driver) {
      this.map.removeLayer(this._markers.pin_driver);
      delete this._markers.pin_driver;
    }
    (window.Commerce?.vendors || []).forEach((v, i) => {
      if (v.lat == null) return;
      const logo = MapPins?.vendorLogo?.(v);
      const id = 'shop_' + (v.id || i);
      const prev = this._markers[id];
      if (prev) this.map.removeLayer(prev);
      const m = L.marker([v.lat, v.lng], {
        icon: this._icon('', 'rgba(26,111,212,0.88)', logo, { ring: '#7ec8ff', initial: MapPins?.initials?.(v.name || 'Shop') }),
        title: v.name || 'Shop',
      });
      m.on('click', () => VendorMapTile?.open?.(v));
      m.addTo(this.map);
      this._markers[id] = m;
    });
  },

  _setMarker(id, lat, lng, opts) {
    opts = opts || {};
    if (lat == null || lng == null) return;
    const prev = this._markers[id];
    const icon = this._icon(opts.emoji || '', opts.color || 'rgba(0,140,220,0.9)', opts.logoUrl, {
      ring: opts.ring || '#fff',
      initial: opts.initial || MapPins?.initials?.(opts.title || id),
    });
    if (prev) {
      prev.setLatLng([lat, lng]);
      prev.setIcon(icon);
      return prev;
    }
    const m = L.marker([lat, lng], {
      icon,
      title: opts.title || id,
    });
    if (opts.onClick) m.on('click', opts.onClick);
    m.addTo(this.map);
    this._markers[id] = m;
    return m;
  },

  _syncMarkers() {
    if (!this.active || !this.map) return;
    const me = window._lastPos;
    if (me) {
      this._setMarker('me', me.lat, me.lng, {
        color: 'rgba(26,111,212,0.92)', ring: '#7ec8ff',
        logoUrl: MapPins?.authAvatarUrl?.(),
        initial: MapPins?.initials?.(me?.name || 'You'),
        title: me?.name || 'You',
        onClick: () => GlobeEntity?.entities?.get('me') && GlobeEntity.activate(GlobeEntity.entities.get('me')),
      });
    }
    (window.others || []).forEach((u, i) => {
      this._setMarker('friend_' + (u.id || i), u.lat, u.lng, {
        color: 'rgba(61,158,255,0.88)', ring: '#7ec8ff',
        logoUrl: u.photo_url || u.avatar_url || '',
        initial: MapPins?.initials?.(u.name || 'User'),
        title: u.name,
      });
    });
    this.syncMapPins();
  },

  _driverLatLng(d, u, i) {
    const lat = d.field_lat ?? d.lat ?? d.latitude;
    const lng = d.field_lng ?? d.lng ?? d.longitude;
    if (lat != null && lng != null) return { lat: +lat, lng: +lng };
    return { lat: u.lat + (Math.sin(i * 1.7) * 0.006), lng: u.lng + (Math.cos(i * 1.3) * 0.006) };
  },

  _seedDemoDrivers(u) {
    if (this._demoDrivers.length) return;
    this._demoDrivers = [
      { id: 'demo1', display_name: 'Nikos · delivery', field_lat: u.lat + 0.004, field_lng: u.lng - 0.003 },
      { id: 'demo2', display_name: 'Elena · courier', field_lat: u.lat - 0.003, field_lng: u.lng + 0.005 },
      { id: 'demo3', display_name: 'Alex · ride', field_lat: u.lat + 0.002, field_lng: u.lng + 0.004 },
    ];
  },

  _animateDemoDrivers() {
    this._demoPhase += 0.0012;
    const u = window._lastPos || this._center;
    this._demoDrivers.forEach((d, i) => {
      d.field_lat = u.lat + Math.sin(this._demoPhase + i * 2.1) * 0.008;
      d.field_lng = u.lng + Math.cos(this._demoPhase + i * 1.6) * 0.008;
    });
  },

  async _tickDrivers() {
    if (!this.active) return;
    const u = window._lastPos || this._center;
    let drivers = window.Commerce?.fetchNearbyDrivers
      ? await window.Commerce.fetchNearbyDrivers(u.lat, u.lng)
      : [];
    if (!drivers.length) {
      this._seedDemoDrivers(u);
      this._animateDemoDrivers();
      drivers = this._demoDrivers;
    }
    window.Commerce?.showDriversOnGlobe?.(drivers);
    const seen = new Set();
    drivers.forEach((d, i) => {
      const p = this._driverLatLng(d, u, i);
      const id = 'drv_' + (d.id || i);
      seen.add(id);
      this._setMarker(id, p.lat, p.lng, {
        color: 'rgba(80,180,255,0.92)', ring: '#ffb060',
        logoUrl: MapPins?.driverPhotoUrl?.(d),
        initial: MapPins?.initials?.(d.display_name || 'Driver'),
        title: d.display_name || 'Driver',
      });
    });
    Object.keys(this._markers).forEach(k => {
      if (k.startsWith('drv_') && !seen.has(k)) {
        this.map.removeLayer(this._markers[k]);
        delete this._markers[k];
      }
    });
  },

  setRoute(coords) {
    this._routeCoords = coords || [];
    this._syncRoute();
  },

  _deliveryRoutes: {},

  setDeliveryRoute(id, coords, opts) {
    opts = opts || {};
    if (!id) return;
    this._deliveryRoutes[id] = { coords: coords || [], opts };
    this._syncDeliveryRoutes();
  },

  removeDeliveryRoute(id) {
    if (this._deliveryRoutes[id]) {
      const rec = this._deliveryRoutes[id];
      if (rec.layer && this.map) try { this.map.removeLayer(rec.layer); } catch (_) {}
      if (rec.polyLayer && this.map) try { this.map.removeLayer(rec.polyLayer); } catch (_) {}
      delete this._deliveryRoutes[id];
    }
  },

  setDeliveryPolygon(id, stops, opts) {
    opts = opts || {};
    if (!id) return;
    if (!this._deliveryRoutes[id]) this._deliveryRoutes[id] = { coords: [], opts: {} };
    this._deliveryRoutes[id].polygon = stops || [];
    this._deliveryRoutes[id].polyOpts = opts;
    this._syncDeliveryRoutes();
  },

  _syncDeliveryRoutes() {
    if (!this.map) return;
    const show = this.active || this._nationalActive || (this._blend || 0) > 0.08;
    Object.keys(this._deliveryRoutes).forEach(id => {
      const rec = this._deliveryRoutes[id];
      if (rec.layer) {
        try { this.map.removeLayer(rec.layer); } catch (_) {}
        rec.layer = null;
      }
      if (rec.polyLayer) {
        try { this.map.removeLayer(rec.polyLayer); } catch (_) {}
        rec.polyLayer = null;
      }
      if (!show) return;
      if (rec.polygon?.length >= 3) {
        const pOpts = rec.polyOpts || rec.opts || {};
        const pColor = pOpts.color || '#00dd88';
        rec.polyLayer = L.polygon(rec.polygon.map(s => [s.lat, s.lng]), {
          color: pColor,
          fillColor: pColor,
          fillOpacity: pOpts.pending ? 0.08 : (pOpts.polygon ? 0.16 : 0.11),
          weight: pOpts.pending ? 2 : 3,
          dashArray: pOpts.pending ? '7 9' : null,
          className: 'delivery-task-polygon',
        }).addTo(this.map);
        rec.polyLayer.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          pOpts.onClick?.();
        });
      }
      if (!rec.coords?.length) return;
      const latlngs = rec.coords.map(c => [c.lat, c.lng]);
      const color = rec.opts?.color || ((AstranovTheme?.effectiveMode?.() || 'dark') === 'bright' ? '#00aa66' : '#00dd88');
      rec.layer = L.polyline(latlngs, {
        color,
        weight: 6,
        opacity: 0.9,
        className: 'delivery-route-line',
      }).addTo(this.map);
      rec.layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        rec.opts?.onClick?.();
      });
    });
  },

  _syncRoute() {
    if (!this.map) return;
    if (this._route) {
      this.map.removeLayer(this._route);
      this._route = null;
    }
    const coords = this._routeCoords || DrivingView?.routeCoords || [];
    const show = this.active || this._nationalActive || (this._blend || 0) > 0.08;
    if (!coords.length || !show) {
      this._syncDeliveryRoutes();
      return;
    }
    const latlngs = coords.map(c => [c.lat, c.lng]);
    this._route = L.polyline(latlngs, {
      color: (AstranovTheme?.effectiveMode?.() || AstranovTheme?.mode) === 'bright' ? '#0066cc' : '#44ccff',
      weight: 5,
      opacity: 0.88,
    }).addTo(this.map);
    this._syncDeliveryRoutes();
  },
};
window.CityMap = CityMap;

// === CITY LIFE — locate → fly → city satellite map · shops · drivers ===
const CityLife = {
  get CITY_ZOOM() {
    return GlobeControl?.cityEntryZ?.() ?? 1.34;
  },
  NEARBY_KM: 12,
  _friendTimer: null,
  _lastDrop: null,

  init() {
    this._startFriendMotion();
    const locateBtn = document.getElementById('aci-locate');
    if (locateBtn && !locateBtn._cityLifeBound) {
      locateBtn._cityLifeBound = true;
      locateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        locateMe?.();
      }, { capture: true });
    }
  },

  userPos() {
    return window._lastPos || { lat: 36.44, lng: 28.22 };
  },

  ensureEarthView() {
    if (CosmicZoom) CosmicZoom.level = 'earth';
    ZoomTiers?.goTo?.('national', false);
    CosmicZoom?.update?.(GlobeControl?.Z?.national || 1.82, { tier: 'national', label: 'NATIONAL', cosmic: 'earth' });
    cityLevel = false;
  },

  async flyToCity(lat, lng, label) {
    this.ensureEarthView();
    const z = this.CITY_ZOOM;
    const p = latLngToPos(lat, lng, 1.04);
    if (typeof flyToPoint === 'function') {
      flyToPoint(new THREE.Vector3(p.x, p.y, p.z), z, {
        dur: GlobeControl?.flyDuration?.(camera?.position?.z, z),
      });
      if (typeof waitForGlobeFly === 'function') await waitForGlobeFly();
    }
    GlobeControl?.engageFollow?.('locate');
    GlobeControl?.noteAutoFly?.();
    MapDepict?.pulse?.(lat, lng, 0x3d9eff, label || 'Your city', 14000);
  },

  nearbyVendors(lat, lng) {
    const list = window.Commerce?.vendors || [];
    if (!list.length || !window.Commerce?.haversineKm) return list;
    return list.filter(v => v.lat != null && window.Commerce.haversineKm(lat, lng, v.lat, v.lng) <= this.NEARBY_KM);
  },

  async dropIn(lat, lng, opts) {
    opts = opts || {};
    const pos = lat != null && lng != null ? { lat, lng } : this.userPos();
    if (!pos?.lat) return { error: 'no location — allow GPS or say locate' };

    window._cityDropLock = true;
    window._lastPos = { lat: pos.lat, lng: pos.lng };
    userLocated = true;
    this._lastDrop = { lat: pos.lat, lng: pos.lng, t: Date.now() };

    try {
      GlobeDeck?.setMapStatus('National view…');
      window._globeFly = null;
      ZoomTiers?.goTo?.('national', false);
      CityMap?.onCamera?.(GlobeControl?.Z?.national || 1.82, 'earth');
      if (!opts.immediate) {
        GlobeDeck?.setPreview?.('Atmosphere lock… descending toward the surface.');
        await new Promise(r => setTimeout(r, 420));
      }
      window._globeFly = null;
      ZoomTiers?.goTo?.('city', false);
      GlobeDeck?.setMapStatus('Opening city map…');
      let opened = await Promise.race([
        CityMap?.openAt?.(pos.lat, pos.lng, { camZ: this.CITY_ZOOM }),
        new Promise(resolve => setTimeout(() => resolve(false), 12000)),
      ]);
      if (!opened) {
        await CityMap?.ensureReady?.();
        CityMap?._applyLayerStack?.(4);
        CityMap?.onCamera?.(this.CITY_ZOOM, 'earth');
        if (!CityMap?.active) CityMap?._enter?.(this.CITY_ZOOM);
        opened = !!CityMap?.active;
      }
      GlobeDeck?.setMapStatus(opened ? 'City map open · syncing globe…' : 'City map · loading fallback tiles…');
      void this.flyToCity(pos.lat, pos.lng, opts.label || 'Your city');
      setTimeout(() => CityMap?.openAt?.(pos.lat, pos.lng, { camZ: this.CITY_ZOOM }), 120);

      if (window.Commerce?.loadVendors) {
        await Promise.race([
          window.Commerce.loadVendors(),
          new Promise(resolve => setTimeout(() => resolve(null), 8000)),
        ]);
      }
      await window.AstranovCityShop?.placeForUser?.(pos.lat, pos.lng);
      let nearby = this.nearbyVendors(pos.lat, pos.lng);
      const construction = (window.Commerce?.vendors || []).find(v => window.AstranovCityShop?.isConstructionVendor?.(v));
      if (construction && !nearby.some(v => v.id === construction.id)) nearby = [construction].concat(nearby);
      if (nearby.length) {
        window.Commerce.vendors = nearby.concat((window.Commerce.vendors || []).filter(v => !nearby.includes(v))).slice(0, 40);
      }
      window.AstranovCityShop?.ensureInVendorList?.();
    window.Commerce?.showOnGlobe?.();
    GlobeEntity?.syncVendors?.(window.Commerce.vendors);

    const drivers = window.Commerce?.fetchNearbyDrivers
      ? await Promise.race([
        window.Commerce.fetchNearbyDrivers(pos.lat, pos.lng),
        new Promise(resolve => setTimeout(() => resolve([]), 6000)),
      ])
      : [];
    window.Commerce?.showDriversOnGlobe?.(drivers);
    this._pulseFriends();
    this._showLocalNews(pos.lat, pos.lng);
    this._updateChip(nearby.length, drivers.length);

      CityMap?.onCamera?.(this.CITY_ZOOM, 'earth');
      const msg = nearby.length + ' shops · ' + drivers.length + ' drivers · ' + (window.others?.length || 0) + ' friends nearby';
      GlobeDeck?.setMapStatus('🏙 City map · ' + pos.lat.toFixed(2) + ', ' + pos.lng.toFixed(2));
      GlobeDeck?.setPreview('🏙 ' + msg);
      AciCli?.print('◎ City view · ' + msg, 'ok');
      ACIControl?.reply('City map open — ' + msg + ' · tap a shop or type: order pitogyra');
      FieldBrain?.pulse?.('city', msg, { role: 'client', props: { lat: pos.lat, lng: pos.lng, shops: nearby.length } });

      if (opts.openShops && nearby.length) {
        GlobeDeck?.expand?.(SuperCli?.title || 'Astranov Command Line');
        await window.Commerce?.showPicker?.();
      }
      return { vendors: nearby, drivers, lat: pos.lat, lng: pos.lng, mapActive: !!CityMap?.active };
    } catch (e) {
      AciCli?.print('city drop error: ' + (e.message || e), 'err');
      CityMap?._applyLayerStack?.(4);
      await CityMap?.openAt?.(pos.lat, pos.lng, { camZ: this.CITY_ZOOM });
      return { error: e.message || 'city drop failed', lat: pos.lat, lng: pos.lng, mapActive: !!CityMap?.active };
    } finally {
      window._cityDropLock = false;
      if (CityMap?.active || CityMap?._nationalActive) {
        GlobeDeck?.setMapStatus('🏙 City map · ' + pos.lat.toFixed(2) + ', ' + pos.lng.toFixed(2));
      } else if (CityMap?.map) {
        CityMap?._maybeEscalateLayers?.('dropin');
        GlobeDeck?.setMapStatus('City map · fallback tiles…');
      }
    }
  },

  _pulseFriends() {
    (window.others || []).forEach(u => {
      MapDepict?.pulse?.(u.lat, u.lng, 0xffaa33, (u.emoji || '') + ' ' + u.name, 15000);
    });
  },

  _showLocalNews(lat, lng) {
    NewsFeed?.fetch?.();
    const item = (NewsFeed?.items || [])[0] || 'News near you';
    MapDepict?.action?.('news', { lat, lng, detail: item.slice(0, 55), worldLat: lat, worldLng: lng });
    if (!GlobeDeck?.thinking) GlobeDeck?.setPreview('📰 ' + item.slice(0, 72));
  },

  _updateChip(shops, drivers) {
    const el = document.getElementById('city-life-chip');
    if (!el) return;
    el.classList.add('open');
    el.innerHTML = '<b>City</b> · ' + shops + ' shops · ' + drivers + ' drivers · friends live';
  },

  _startFriendMotion() {
    if (this._friendTimer) return;
    this._friendTimer = setInterval(() => this._tickFriends(), 3500);
  },

  _tickFriends() {
    if (Auth?.user || AstranovPresence?.rtChannel) return;
    if (!(window.others || []).length) return;
    const friends = window.others || [];
    friends.forEach((u) => {
      u.lat += (Math.random() - 0.5) * 0.0012;
      u.lng += (Math.random() - 0.5) * 0.0012;
    });
    window.others = friends;
    GlobeEntity?.syncFriends?.(friends);
    if (CityMap?.active) CityMap._syncMarkers?.();
  },

  async locateAndDropIn() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
      GlobeDeck?.setMapStatus('Locating…');
      navigator.geolocation.getCurrentPosition(
        async pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          placeMe(lat, lng, { quiet: true, markerOnly: true });
          resolve(await this.dropIn(lat, lng, { label: 'Your city' }));
        },
        err => reject(err),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
      );
    });
  },

  SCENARIOS: {
    wake: async () => {
      AciCli?.print('scenario · wake — news on globe', 'cmd');
      NewsFeed?.flash?.();
      const u = CityLife.userPos();
      await CityLife.dropIn(u.lat, u.lng, { label: 'Morning' });
    },
    news: async () => {
      NewsFeed?.flash?.();
      const u = CityLife.userPos();
      CityLife._showLocalNews(u.lat, u.lng);
    },
    youtube: async (q) => {
      await GlobeVideo?.find?.(q || 'interesting places earth documentary');
    },
    locate: async () => {
      await CityLife.locateAndDropIn();
    },
    city: async () => {
      const u = CityLife.userPos();
      await CityLife.dropIn(u.lat, u.lng, { openShops: true });
    },
    friends: async () => {
      CityLife._pulseFriends();
      AciCli?.print((window.others || []).map(u => u.name + ' · ' + u.lat.toFixed(3)).join(' · '), 'ok');
    },
    drivers: async () => {
      const u = CityLife.userPos();
      const d = await window.Commerce?.fetchNearbyDrivers?.(u.lat, u.lng);
      window.Commerce?.showDriversOnGlobe?.(d);
      AciCli?.print(d.length ? d.map(x => (x.display_name || 'Driver')).join(' · ') : 'no active drivers — order to summon', 'ok');
    },
    shops: async () => {
      const u = CityLife.userPos();
      await CityLife.dropIn(u.lat, u.lng, { openShops: true });
    },
    groceries: async () => { await window.Commerce?.smartOrder?.('pitogyra mpironia tsigareta'); },
    order: async (rest) => { await window.Commerce?.smartOrder?.(rest || 'pitogyra beer'); },
    reviews: async (rest) => {
      const q = rest || 'best restaurant near me';
      AciCli?.print('brain · reviews · ' + q, 'dim');
      const r = await ACI?.think?.('Summarize Google-style reviews for: ' + q + '. Short bullet list, best pick.');
      ACIControl?.reply(r || 'No reviews');
    },
    task: async (rest) => {
      await AciCoders?.handleMessage?.(rest || 'find best grocery offer near me and assign driver');
    },
    assign: async (rest) => {
      if (rest) await FieldBrain?.claimDelivery?.(rest);
      else AciCli?.print('usage: scenario assign <order_id>', 'err');
    },
    explore: async () => {
      const u = CityLife.userPos();
      MapDepict?.action?.('explore', { lat: u.lat, lng: u.lng, detail: 'things to do' });
      ACIControl?.reply('Drag globe · tap shops · type order or youtube');
    },
    stars: async () => {
      ZoomTiers?.goTo?.('global', true);
      CelestialNav?.printReport?.();
    },
    nav: async () => {
      ZoomTiers?.goTo?.('global', true);
      CelestialNav?.printReport?.();
    },
    list: async () => {
      const names = Object.keys(CityLife.SCENARIOS).filter(k => k !== 'list').join(' · ');
      AciCli?.print('scenarios: ' + names, 'ok');
    },
  },

  async run(name, rest) {
    const key = (name || 'list').toLowerCase();
    const fn = this.SCENARIOS[key];
    if (!fn) {
      AciCli?.print('unknown scenario — try: scenario list', 'err');
      return { error: 'unknown' };
    }
    try {
      await fn(rest);
      return { ok: true, scenario: key };
    } catch (e) {
      AciCli?.print('scenario error: ' + (e.message || e), 'err');
      return { error: e.message };
    }
  },

  listScenarios() {
    return Object.keys(this.SCENARIOS).filter(k => k !== 'list');
  },
};
window.CityLife = CityLife;

// === ASTRANOV THEME — dark / bright for globe, city map, and UI ===
const AstranovTheme = {
  mode: 'dark',
  followSystem: true,
  KEY: 'astranov_theme_v1',
  _maps: [],

  systemMode() {
    try {
      if (window.matchMedia?.('(prefers-color-scheme: light)')?.matches) return 'bright';
    } catch (_) {}
    return 'dark';
  },

  effectiveMode() {
    return this.followSystem ? this.systemMode() : this.mode;
  },

  _watchSystem() {
    if (!window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if (!this.followSystem) return;
      this.mode = this.systemMode();
      this.apply();
    };
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else if (mql.addListener) mql.addListener(onChange);
    this._systemMql = mql;
  },

  init() {
    try {
      const saved = localStorage.getItem(this.KEY);
      if (saved === 'bright' || saved === 'dark') {
        this.mode = saved;
        this.followSystem = false;
      } else {
        this.followSystem = true;
        this.mode = this.systemMode();
      }
    } catch (_) {
      this.followSystem = true;
      this.mode = this.systemMode();
    }
    this._watchSystem();
    this.apply();
    const btn = document.getElementById('aci-theme');
    if (btn) {
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      };
      this._syncBtn();
    }
  },

  registerMap(mapApi) {
    if (mapApi && !this._maps.includes(mapApi)) this._maps.push(mapApi);
  },

  toggle() {
    if (this.followSystem) {
      const sys = this.systemMode();
      this.followSystem = false;
      this.mode = sys === 'bright' ? 'dark' : 'bright';
    } else {
      this.mode = this.mode === 'dark' ? 'bright' : 'dark';
    }
    try { localStorage.setItem(this.KEY, this.mode); } catch (_) {}
    this.apply();
    AciCli?.print?.('theme → ' + this.mode + ' (manual)', 'ok');
    GlobeDeck?.setPreview?.((this.mode === 'bright' ? '☀️' : '🌙') + ' ' + this.mode + ' theme');
    if (Voice?.maySpeak?.()) speak('Theme ' + this.mode + '.', () => resumeListening?.());
    return this.mode;
  },

  set(mode) {
    const next = mode === 'bright' ? 'bright' : 'dark';
    if (!this.followSystem && next === this.mode) return this.mode;
    this.followSystem = false;
    this.mode = next;
    try { localStorage.setItem(this.KEY, next); } catch (_) {}
    this.apply();
    AciCli?.print?.('theme → ' + next, 'ok');
    GlobeDeck?.setPreview?.((next === 'bright' ? '☀️' : '🌙') + ' ' + next + ' theme');
    if (Voice?.maySpeak?.()) speak('Theme ' + next + '.', () => resumeListening?.());
    return this.mode;
  },

  apply() {
    const active = this.effectiveMode();
    document.documentElement.dataset.theme = active;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = active === 'bright' ? '#1a6fd4' : '#0a1020';
    if (scene?.background) {
      scene.background = new THREE.Color(active === 'bright' ? 0x040810 : 0x000000);
    }
    if (renderer) renderer.setClearColor(active === 'bright' ? 0x040810 : 0x000000, 1);
    EarthRealism?.onThemeChange?.();
    this._maps.forEach(m => m.onThemeChange?.());
    this._syncBtn();
    AiGlyphs?.syncTheme?.();
  },

  _syncBtn() {
    const btn = document.getElementById('aci-theme');
    if (!btn) return;
    const active = this.effectiveMode();
    AiGlyphs?.syncTheme?.();
    btn.title = this.followSystem
      ? ('Device ' + active + ' theme — tap to override')
      : (active === 'bright' ? 'Bright theme — tap for dark' : 'Dark theme — tap for bright');
    btn.classList.toggle('deck-btn-active', active === 'bright');
    btn.classList.toggle('deck-btn-system', this.followSystem);
  },
};
window.AstranovTheme = AstranovTheme;

// === EARTH REALISM — live day/night terminator, sun & moon ===
const EarthRealism = {
  _inited: false,
  _shaderReady: false,
  sunDir: new THREE.Vector3(1, 0.2, 0.4),
  moonMesh: null,
  sunGlow: null,
  terminator: null,
  _dayTex: null,
  _nightTex: null,
  _hudTimer: 0,
  _tickLast: 0,
  _sunLocalCache: null,
  _sunLocalAt: 0,

  _canvasTex(c1, c2) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 64, 32);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  },

  _ensureFallbackTextures() {
    if (this._shaderReady) return;
    if (!this._dayTex) this._dayTex = this._canvasTex('#1a4a7a', '#2d8f4e');
    if (!this._nightTex) this._nightTex = this._canvasTex('#0a1830', '#334466');
    this._applyShader();
  },

  init() {
    if (this._inited || !earth) return;
    this._inited = true;
    const useHd = SlumberManager?.allows?.('earth_hd') && SlumberManager?.quality?.earthHd !== false;
    if (!useHd) {
      this._ensureFallbackTextures();
    } else {
      const loader = new THREE.TextureLoader();
      const dayUrl = window.EARTH_TEX?.day || 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg';
      const nightUrl = window.EARTH_TEX?.night || 'https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg';
      const onDay = (tex) => { this._dayTex = tex; this._applyShader(); };
      const onNight = (tex) => { this._nightTex = tex; this._applyShader(); };
      loader.load(dayUrl, onDay, undefined, () => {
        if (!this._dayTex) { this._dayTex = this._canvasTex('#1a4a7a', '#2d8f4e'); this._applyShader(); }
      });
      loader.load(nightUrl, onNight, undefined, () => {
        if (!this._nightTex) { this._nightTex = this._canvasTex('#0a1830', '#334466'); this._applyShader(); }
      });
      setTimeout(() => this._ensureFallbackTextures(), 10000);
    }
    this._buildSkyBodies();
    this._buildTerminator();
    this.tick();
  },

  _applyShader() {
    if (!this._dayTex || !this._nightTex || !earth) return;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: this._dayTex },
        nightTexture: { value: this._nightTex },
        sunDirection: { value: this.sunDir.clone() },
        brightness: { value: AstranovTheme?.mode === 'bright' ? 1.15 : 1.0 },
      },
      vertexShader: [
        'varying vec2 vUv;',
        'varying vec3 vNormalW;',
        'void main() {',
        '  vUv = uv;',
        '  vec4 wp = modelMatrix * vec4(position, 1.0);',
        '  vNormalW = normalize(mat3(modelMatrix) * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D dayTexture;',
        'uniform sampler2D nightTexture;',
        'uniform vec3 sunDirection;',
        'uniform float brightness;',
        'varying vec2 vUv;',
        'varying vec3 vNormalW;',
        'void main() {',
        '  float d = dot(normalize(vNormalW), normalize(sunDirection));',
        '  vec4 dayColor = texture2D(dayTexture, vUv);',
        '  vec4 nightColor = texture2D(nightTexture, vUv);',
        '  float blend = smoothstep(-0.12, 0.28, d);',
        '  vec4 col = mix(nightColor * 1.35, dayColor, blend);',
        '  gl_FragColor = vec4(col.rgb * brightness, 1.0);',
        '}',
      ].join('\n'),
    });
    earth.material = mat;
    earth.material.needsUpdate = true;
    this._shaderReady = true;
    window._earthShaderReady = true;
    this.tick();
  },

  onThemeChange() {
    if (earth?.material?.uniforms?.brightness) {
      earth.material.uniforms.brightness.value = AstranovTheme?.mode === 'bright' ? 1.15 : 1.0;
    }
  },

  _buildSkyBodies() {
    const sunGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
    this.sunGlow = new THREE.Mesh(sunGeo, sunMat);
    this.sunGlow.userData = { type: 'sun-indicator' };
    scene.add(this.sunGlow);

    const moonGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xccddee });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.moonMesh.userData = { type: 'moon-indicator' };
    scene.add(this.moonMesh);
  },

  _buildTerminator() {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.012, 0, Math.sin(a) * 1.012));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.terminator = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.55 })
    );
    globePivot.add(this.terminator);
  },

  _solarPosition(date) {
    const d = date || new Date();
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    const day = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000;
    const decl = 23.44 * Math.sin((360 / 365) * (day - 81) * Math.PI / 180) * Math.PI / 180;
    const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const lon = ((12 - utcH) * 15) * Math.PI / 180;
    const lat = decl;
    const x = Math.cos(lat) * Math.cos(lon);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.sin(lon);
    return new THREE.Vector3(x, y, z).normalize();
  },

  _moonPosition(date) {
    const d = date || new Date();
    const jd = 367 * d.getUTCFullYear()
      - Math.floor(7 * (d.getUTCFullYear() + Math.floor((d.getUTCMonth() + 9) / 12)) / 4)
      + Math.floor(275 * (d.getUTCMonth() + 1) / 9)
      + d.getUTCDate() - 730530
      + (d.getUTCHours() + d.getUTCMinutes() / 60) / 24;
    const phase = (jd / 29.53) * Math.PI * 2;
    const orbit = jd * 0.036 + 1.2;
    const dist = 2.8;
    const sun = this._solarPosition(d);
    const perp = new THREE.Vector3(-sun.z, 0.15, sun.x).normalize();
    const pos = sun.clone().multiplyScalar(Math.cos(phase) * dist * 0.35)
      .add(perp.clone().multiplyScalar(Math.sin(phase) * dist))
      .add(new THREE.Vector3(Math.cos(orbit) * 0.2, Math.sin(orbit) * 0.08, Math.sin(orbit) * 0.2));
    return pos.normalize().multiplyScalar(dist);
  },

  _updateTerminator(sunDir) {
    if (!this.terminator) return;
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, sunDir).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, up.dot(sunDir))));
    this.terminator.quaternion.setFromAxisAngle(axis, angle);
  },

  _formatHud(sunDir) {
    const subsolar = this._subsolarLatLng(sunDir);
    const now = new Date();
    const utc = now.toISOString().slice(11, 16) + ' UTC';
    const illum = Math.round((1 + sunDir.y) * 50);
    const moonVis = this.moonMesh?.visible ? 'visible' : 'below horizon';
    return '<div class="cg-title">Live Earth · ' + utc + '</div>'
      + '<div class="cg-item"><b>☀ Sun</b> — subsolar ' + subsolar.lat.toFixed(1) + '°, ' + subsolar.lng.toFixed(1) + '°</div>'
      + '<div class="cg-item"><b>🌗 Terminator</b> — real-time day/night boundary · ' + illum + '% lit</div>'
      + '<div class="cg-item"><b>🌙 Moon</b> — ' + moonVis + ' · phase from ephemeris</div>'
      + '<div class="cg-item"><i>Drag globe · zoom in for city satellite map</i></div>';
  },

  _subsolarLatLng(sunDir) {
    const lat = Math.asin(Math.max(-1, Math.min(1, sunDir.y))) * 180 / Math.PI;
    let lng = Math.atan2(sunDir.z, sunDir.x) * 180 / Math.PI;
    if (lng > 180) lng -= 360;
    return { lat, lng };
  },

  _earthSpin(date) {
    const d = date || new Date();
    const utc = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    return (utc / 24) * Math.PI * 2;
  },

  _sunLocal(sunDir) {
    if (!earth) return sunDir;
    const now = Date.now();
    if (this._sunLocalCache && now - this._sunLocalAt < 400) return this._sunLocalCache;
    earth.updateMatrixWorld(false);
    const m = new THREE.Matrix4().copy(earth.matrixWorld).invert();
    this._sunLocalCache = sunDir.clone().transformDirection(m).normalize();
    this._sunLocalAt = now;
    return this._sunLocalCache;
  },

  tick() {
    const now = Date.now();
    const camZ = camera?.position?.z ?? 7.2;
    const level = CosmicZoom?.level || 'earth';
    const earthView = (level === 'earth' || level === 'orbit') && camZ < 4.8;
    if (!earthView) return;
    const earthGap = SlumberManager?.tickMs?.('earth') || (window._globePerfLite ? 500 : 250);
    if (now - this._tickLast < earthGap) return;
    this._tickLast = now;

    const sunDir = this._solarPosition();
    this.sunDir.copy(sunDir);
    if (earth) {
      earth.rotation.y = this._earthSpin();
      if (earth.material?.uniforms?.sunDirection) {
        earth.material.uniforms.sunDirection.value.copy(this._sunLocal(sunDir));
      }
    }
    if (typeof sun !== 'undefined' && sun?.position) {
      sun.position.copy(sunDir.clone().multiplyScalar(8));
      sun.intensity = AstranovTheme?.mode === 'bright' ? 1.9 : 1.5;
    }
    if (this.sunGlow) {
      this.sunGlow.position.copy(sunDir.clone().multiplyScalar(4.2));
      const camZ = camera?.position?.z ?? 2.5;
      this.sunGlow.visible = camZ < 5.5 && camZ > 1.5 && !CityMap?.active;
      this.sunGlow.scale.setScalar(0.85 + Math.sin(Date.now() * 0.002) * 0.08);
    }
    if (this.moonMesh) {
      this.moonMesh.position.copy(this._moonPosition());
      const camZ = camera?.position?.z ?? 2.5;
      this.moonMesh.visible = camZ < 5.5 && camZ > 1.5 && !CityMap?.active;
    }
    this._updateTerminator(sunDir);

    /* cosmic-guide disabled — tier label only (zoom-label) */
  },
};
window.EarthRealism = EarthRealism;

// === ASTRANOV AI GRAPHICS ENGINE — WebGL gaming procedural layer (shader + particles) ===
const AIGraphics = {
  atmosphere: null,
  clouds: null,
  cityLights: null,
  idleNodes: null,
  neuralLayer: null,
  activeEffects: [],
  batchGroup: null,
  batchRing: null,
  batchNodes: null,
  superBatchActive: false,
  shellDim: false,
  voicePerf: false,
  thinkPulse: false,
  _frameSkip: 0,
  _parent: null,
  _hudCanvas: null,
  _hudCtx: null,
  _hudRaf: 0,
  _seed: (Date.now() % 9973) / 9973,
  _paths: [],
  _flyer: null,
  _flyerFrame: 0,
  _flyerFlying: false,

  init(parent, earthRadius = 1) {
    if (this._inited) return;
    this._inited = true;
    this._parent = parent || globePivot;
    const tier = SlumberManager?.tier || 'balanced';
    const lite = tier === 'conserve' || tier === 'slumber';
    this.addAtmosphere(this._parent, earthRadius);
    if (!lite) this.addClouds(this._parent, earthRadius);
    this.addCityLights(this._parent, earthRadius, lite ? 900 : 2200);
    /* Space globe only — no idle waveform / neural overlay / gaming HUD scanlines */
    if (SlumberManager?.quality?.gamingGraphics && !this._gamingLight) {
      this._gamingLight = new THREE.PointLight(0x00e8ff, 1.4, 4.5);
      this._gamingLight.position.set(0.3, 0.5, 1.2);
      scene.add(this._gamingLight);
    }
    console.log('%c[Astranov AI Graphics] Gaming shader pipeline live', 'color:#00ddff;font-weight:700');
    window._aiGraphicsReady = true;
  },

  _isGaming() {
    return !!(SlumberManager?.quality?.gamingGraphics || SlumberManager?.tier === 'gaming' || SlumberManager?.tier === 'full');
  },

  _gamingVert() {
    return [
      'varying vec3 vN;',
      'varying vec3 vV;',
      'void main(){',
      '  vN = normalize(normalMatrix * normal);',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vV = -mv.xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n');
  },

  _gamingFrag() {
    return [
      'uniform vec3 uColor;',
      'uniform vec3 uEmit;',
      'uniform float uPulse;',
      'uniform float uRim;',
      'uniform float uAlpha;',
      'varying vec3 vN;',
      'varying vec3 vV;',
      'void main(){',
      '  vec3 n = normalize(vN);',
      '  vec3 v = normalize(vV);',
      '  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4) * uRim;',
      '  float pulse = 0.82 + 0.18 * sin(uPulse);',
      '  vec3 col = uColor * 0.45 + uEmit * pulse + vec3(0.15, 0.75, 1.0) * rim;',
      '  gl_FragColor = vec4(col, uAlpha);',
      '}',
    ].join('\n');
  },

  _gamingMat(opts = {}) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(opts.color || 0x1a2838) },
        uEmit: { value: new THREE.Color(opts.emissive || 0x00c8ff) },
        uPulse: { value: 0 },
        uRim: { value: opts.rim ?? 1.35 },
        uAlpha: { value: opts.opacity ?? 1 },
      },
      vertexShader: this._gamingVert(),
      fragmentShader: this._gamingFrag(),
      transparent: !!opts.transparent || (opts.opacity != null && opts.opacity < 1),
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !opts.additive,
    });
    mat.userData._gaming = true;
    return mat;
  },

  _pulseGamingMats(root, t) {
    root.traverse((o) => {
      const u = o.material?.uniforms;
      if (u?.uPulse) u.uPulse.value = t;
    });
  },

  _createJetVfx(group, side) {
    const COUNT = 72;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: this._isGaming() ? 0.022 : 0.014,
      color: side < 0 ? 0x00e8ff : 0x44aaff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);
    return { points: pts, positions: pos, count: COUNT, head: 0, side };
  },

  _emitJet(vfx, origin, dir, power) {
    if (!vfx?.positions || !origin) return;
    const i = vfx.head % vfx.count;
    vfx.head++;
    const idx = i * 3;
    vfx.positions[idx] = origin.x;
    vfx.positions[idx + 1] = origin.y;
    vfx.positions[idx + 2] = origin.z;
    vfx.points.geometry.attributes.position.needsUpdate = true;
    if (!vfx.vel) vfx.vel = [];
    vfx.vel[i] = {
      x: (dir?.x || 0) * power + (Math.random() - 0.5) * 0.002,
      y: (dir?.y || -0.01) * power + (Math.random() - 0.5) * 0.002,
      z: (dir?.z || 0) * power + (Math.random() - 0.5) * 0.002,
      life: 28 + Math.floor(Math.random() * 18),
    };
  },

  _tickJetVfx(vfx, flying) {
    if (!vfx?.vel || !vfx.positions) return;
    const decay = flying ? 0.96 : 0.92;
    for (let i = 0; i < vfx.count; i++) {
      const v = vfx.vel[i];
      if (!v || v.life <= 0) continue;
      const idx = i * 3;
      vfx.positions[idx] += v.x;
      vfx.positions[idx + 1] += v.y;
      vfx.positions[idx + 2] += v.z;
      v.x *= decay; v.y *= decay; v.z *= decay;
      v.life--;
    }
    vfx.points.geometry.attributes.position.needsUpdate = true;
  },

  _latLngToPos(lat, lng, r = 1) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return {
      x: -(r * Math.sin(phi) * Math.cos(theta)),
      y: r * Math.cos(phi),
      z: r * Math.sin(phi) * Math.sin(theta),
    };
  },

  _procCanvas(w, h, drawFn) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { alpha: true });
    drawFn(ctx, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return { canvas: c, tex, ctx };
  },

  addAtmosphere(parent, r) {
    const geo = new THREE.SphereGeometry(r * 1.018, SlumberManager?.tier === 'full' ? 48 : 32, SlumberManager?.tier === 'full' ? 48 : 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x2288cc,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.atmosphere = new THREE.Mesh(geo, mat);
    parent.add(this.atmosphere);
  },

  addClouds(parent, r) {
    const { tex } = this._procCanvas(1024, 512, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < 70; i++) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const rw = 20 + Math.random() * 60;
          ctx.globalAlpha = 0.04 + Math.random() * 0.08;
          ctx.beginPath();
          ctx.ellipse(x, y, rw, rw * 0.45, Math.random() * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    });
    const geo = new THREE.SphereGeometry(r * 1.008, 40, 40);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.clouds = new THREE.Mesh(geo, mat);
    parent.add(this.clouds);
  },

  addCityLights(parent, r, count = 2200) {
    const pos = [];
    const cols = [];
    for (let i = 0; i < count; i++) {
      const lat = Math.random() * 170 - 85;
      const popFactor = Math.sin(lat * 0.025) * 0.6 + 0.4;
      if (Math.random() < popFactor * 0.85) {
        const lng = Math.random() * 360 - 180;
        const p = this._latLngToPos(lat, lng, r * 1.003);
        pos.push(p.x, p.y, p.z);
        const warm = Math.random() > 0.4;
        cols.push(warm ? 1 : 0.6, warm ? 0.85 : 0.95, warm ? 0.5 : 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.007,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.cityLights = new THREE.Points(geo, mat);
    parent.add(this.cityLights);
  },

  addIdleAIEffects(parent, r, count = 80) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const lat = Math.sin(angle) * 35;
      const lng = (i * 4.5) % 360;
      const p = this._latLngToPos(lat, lng, r * 1.04);
      positions.push(p.x, p.y, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.004,
      color: 0x00ddff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.idleNodes = new THREE.Points(geo, mat);
    parent.add(this.idleNodes);
  },

  addNeuralField(parent, r) {
    const pack = this._procCanvas(512, 256, (ctx, w, h) => {
      this._paintNeural(ctx, w, h, 0);
    });
    this._neuralPack = pack;
    const geo = new THREE.SphereGeometry(r * 1.012, 36, 36);
    const mat = new THREE.MeshBasicMaterial({
      map: pack.tex,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.neuralLayer = new THREE.Mesh(geo, mat);
    this.neuralLayer.visible = false;
    parent.add(this.neuralLayer);
  },

  _paintNeural(ctx, w, h, t) {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(0,30,60,0)');
    g.addColorStop(0.5, 'rgba(0,180,255,0.12)');
    g.addColorStop(1, 'rgba(0,255,140,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 48; i++) {
      const x = (i / 48) * w;
      const y = h * 0.5 + Math.sin(t * 0.04 + i * 0.55 + this._seed * 12) * h * 0.22;
      ctx.strokeStyle = `rgba(0,${180 + (i % 3) * 20},255,${0.15 + (i % 5) * 0.04})`;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 1; j <= 6; j++) {
        ctx.lineTo(x + j * (w / 48) * 0.15, y + Math.sin(t * 0.03 + i + j) * 8);
      }
      ctx.stroke();
    }
    for (let n = 0; n < 120; n++) {
      const nx = (Math.sin(n * 0.91 + t * 0.02) * 0.5 + 0.5) * w;
      const ny = (Math.cos(n * 0.73 + t * 0.015) * 0.5 + 0.5) * h;
      ctx.fillStyle = n % 7 === 0 ? 'rgba(0,255,120,0.55)' : 'rgba(0,200,255,0.35)';
      ctx.fillRect(nx, ny, 2, 2);
    }
  },

  _mountGamingHud() {
    const globe = document.getElementById('globe');
    if (!globe || this._hudCanvas) return;
    const c = document.createElement('canvas');
    c.id = 'ai-gaming-hud';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;opacity:0;transition:opacity 0.35s ease;mix-blend-mode:screen';
    globe.appendChild(c);
    this._hudCanvas = c;
    this._hudCtx = c.getContext('2d');
    const resize = () => {
      const r = globe.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      c.width = Math.max(1, Math.floor(r.width * dpr));
      c.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);
    this._hudLoop();
  },

  _hudLoop() {
    const ctx = this._hudCtx;
    const c = this._hudCanvas;
    if (ctx && c) {
      const on = this.thinkPulse || this.superBatchActive || Voice?.speaking;
      c.style.opacity = on ? '0.42' : '0';
      if (on) {
        const t = performance.now() * 0.001;
        const w = c.width;
        const h = c.height;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(0,200,255,0.08)';
        for (let y = 0; y < h; y += 4) {
          ctx.beginPath();
          ctx.moveTo(0, y + Math.sin(t * 2 + y * 0.02) * 0.5);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        const cx = w * 0.5;
        const cy = h * 0.42;
        for (let i = 0; i < 5; i++) {
          const r = (Math.sin(t * 1.8 + i) * 0.5 + 0.5) * Math.min(w, h) * 0.12 + 20;
          ctx.strokeStyle = `rgba(0,${220 - i * 30},${140 + i * 20},${0.12 - i * 0.015})`;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.clearRect(0, 0, c.width, c.height);
      }
    }
    this._hudRaf = requestAnimationFrame(() => this._hudLoop());
  },

  spawnEffect(originPos, color = 0x00ffcc, count = 25, life = 45) {
    if (!originPos || !scene) return;
    if (this.voicePerf) {
      count = Math.min(count, 8);
      life = Math.min(life, 24);
    }
    const maxFx = SlumberManager?.tier === 'slumber' ? 8 : 24;
    while (this.activeEffects.length > maxFx) {
      const eff = this.activeEffects.shift();
      if (eff?.points) {
        scene.remove(eff.points);
        eff.points.geometry?.dispose?.();
        eff.points.material?.dispose?.();
      }
    }
    const positions = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      positions[idx] = originPos.x + (Math.random() - 0.5) * 0.04;
      positions[idx + 1] = originPos.y + (Math.random() - 0.5) * 0.04;
      positions[idx + 2] = originPos.z + (Math.random() - 0.5) * 0.04;
      vel.push(
        (Math.random() - 0.5) * 0.0035,
        (Math.random() - 0.5) * 0.0035,
        (Math.random() - 0.5) * 0.0035,
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.018,
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    this.activeEffects.push({ points: pts, velocities: vel, life, maxLife: life });
  },

  _paintAstranovCharacter(ctx, w, h, frame, opts = {}) {
    const t = frame * 0.12;
    const flap = Math.sin(t) * 0.12;
    const cx = w * 0.5;
    const cy = h * 0.46 + Math.sin(t * 0.65) * 2;
    const cyan = opts.glow || '#00e8ff';
    const silver = '#b8c8d8';
    const dark = '#0a1420';

    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createRadialGradient(cx, cy, 8, cx, cy, w * 0.52);
    bg.addColorStop(0, 'rgba(0,40,80,0.5)');
    bg.addColorStop(0.6, 'rgba(0,10,24,0.25)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 40; i++) {
      const sx = (Math.sin(i * 2.17 + frame * 0.02) * 0.5 + 0.5) * w;
      const sy = (Math.cos(i * 1.73) * 0.5 + 0.5) * h;
      ctx.fillStyle = i % 5 === 0 ? 'rgba(180,220,255,0.9)' : 'rgba(100,160,255,0.45)';
      ctx.fillRect(sx, sy, 1.2, 1.2);
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';

    const drawMechWing = (side) => {
      const s = side;
      const tilt = flap * 8 * s;
      const segs = [
        [[6 * s, -4], [52 * s, -36 + tilt], [72 * s, -8 + tilt], [38 * s, 6]],
        [[10 * s, 2], [58 * s, -18 + tilt], [78 * s, 8 + tilt], [42 * s, 14]],
        [[14 * s, 10], [48 * s, 4 + tilt], [62 * s, 22 + tilt], [32 * s, 20]],
      ];
      segs.forEach((pts, i) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -30, 60 * s, 20);
        g.addColorStop(0, silver);
        g.addColorStop(0.45, '#4a5a6a');
        g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = i === 0 ? cyan : 'rgba(0,200,255,0.35)';
        ctx.lineWidth = i === 0 ? 1.8 : 1;
        ctx.stroke();
      });
    };

    if (opts.jet) {
      const jetLen = 38 + Math.sin(t * 2) * 8;
      [-1, 1].forEach((side) => {
        const jg = ctx.createLinearGradient(side * 20, 8, side * 20, 8 + jetLen);
        jg.addColorStop(0, cyan);
        jg.addColorStop(0.4, 'rgba(0,180,255,0.55)');
        jg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = jg;
        ctx.beginPath();
        ctx.moveTo(side * 14, 10);
        ctx.lineTo(side * 28, 10);
        ctx.lineTo(side * 18, 10 + jetLen);
        ctx.closePath();
        ctx.fill();
      });
    }

    drawMechWing(-1);
    drawMechWing(1);

    ctx.globalCompositeOperation = 'source-over';
    const torso = ctx.createLinearGradient(0, -20, 0, 32);
    torso.addColorStop(0, silver);
    torso.addColorStop(0.35, '#5a6a7a');
    torso.addColorStop(0.7, dark);
    torso.addColorStop(1, '#1a2838');
    ctx.fillStyle = torso;
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(14, -12);
    ctx.lineTo(18, 8);
    ctx.lineTo(12, 30);
    ctx.lineTo(-12, 30);
    ctx.lineTo(-18, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = cyan;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const corePulse = 0.75 + Math.sin(t * 1.6) * 0.25;
    const core = ctx.createRadialGradient(0, 4, 1, 0, 4, 10);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.35, cyan);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = corePulse;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 4, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    [-1, 1].forEach((side) => {
      ctx.fillStyle = '#6a7a8a';
      ctx.fillRect(side * 10, -8, 8, 22);
      ctx.fillStyle = cyan;
      ctx.fillRect(side * 12, 2, 5, 8);
      ctx.beginPath();
      ctx.ellipse(side * 22, -2, 10, 6, side * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#7a8a9a';
      ctx.fill();
    });

    const helm = ctx.createLinearGradient(-12, -34, 12, -18);
    helm.addColorStop(0, '#e8f0ff');
    helm.addColorStop(0.5, silver);
    helm.addColorStop(1, '#4a5a68');
    ctx.fillStyle = helm;
    ctx.beginPath();
    ctx.ellipse(0, -24, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cyan;
    ctx.shadowColor = cyan;
    ctx.shadowBlur = 12;
    ctx.fillRect(-11, -26, 22, 5);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#5a6a78';
    ctx.fillRect(-7, 28, 5, 14);
    ctx.fillRect(2, 30, 5, 12);

    ctx.restore();
  },

  _buildProceduralHumanoid(lat, lng, opts = {}) {
    const hi = this._isGaming();
    const seg = hi ? 16 : 10;
    const g = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.018, 0.048, seg),
      this._gamingMat({ color: 0x141e2a, emissive: 0x006688, rim: 1.1 }),
    );
    g.add(torso);
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.028, 0.022),
      this._gamingMat({ color: 0x2a3a4a, emissive: 0x00aacc, rim: 1.6 }),
    );
    chest.position.y = 0.008;
    g.add(chest);
    const head = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.014, hi ? 1 : 0),
      this._gamingMat({ color: 0x8899aa, emissive: 0x224466, rim: 1.4 }),
    );
    head.position.y = 0.036;
    g.add(head);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.008, 0.012),
      this._gamingMat({ color: 0x001822, emissive: 0x00e8ff, rim: 2.2, transparent: true, opacity: 0.95 }),
    );
    visor.position.set(0, 0.038, 0.014);
    g.add(visor);
    const arms = [];
    [-1, 1].forEach((side) => {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.005, 0.02, seg),
        this._gamingMat({ color: 0x4a5a6a, emissive: 0x0088aa, rim: 1.2 }),
      );
      upper.rotation.z = side * 0.35;
      arm.add(upper);
      const gauntlet = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.012, 0.01),
        this._gamingMat({ color: 0x00c8ff, emissive: 0x00e8ff, rim: 1.8 }),
      );
      gauntlet.position.set(side * 0.014, -0.012, 0);
      arm.add(gauntlet);
      arm.position.set(side * 0.02, 0.014, 0);
      g.add(arm);
      arms.push(arm);
    });
    const legs = [];
    [-1, 1].forEach((side) => {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.006, 0.018, seg),
        this._gamingMat({ color: 0x3a4a58, emissive: 0x004466, rim: 1.0 }),
      );
      leg.add(thigh);
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.011, 0.014, 0.014),
        this._gamingMat({ color: 0x2a3848, emissive: 0x0066aa, rim: 1.3 }),
      );
      boot.position.y = -0.018;
      leg.add(boot);
      leg.position.set(side * 0.011, -0.028, 0);
      g.add(leg);
      legs.push(leg);
    });
    const wings = [];
    [-1, 1].forEach((side) => {
      const wing = new THREE.Group();
      for (let s = 0; s < 3; s++) {
        const segMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.022 - s * 0.004, 0.003, 0.012 - s * 0.002),
          this._gamingMat({
            color: 0x6a7a8a,
            emissive: s === 0 ? 0x00c8ff : 0x006688,
            rim: 1.5 + s * 0.3,
            transparent: s > 0,
            opacity: s === 0 ? 1 : 0.82,
          }),
        );
        segMesh.position.set(side * (0.018 + s * 0.016), s * 0.006, -s * 0.003);
        wing.add(segMesh);
      }
      wing.position.set(side * 0.016, 0.012, -0.01);
      g.add(wing);
      wings.push(wing);
    });
    const thrusters = [];
    const jetVfx = [];
    [-1, 1].forEach((side) => {
      const pack = new THREE.Group();
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.008, 0.016, seg),
        this._gamingMat({ color: 0x2a3848, emissive: 0x00aacc, rim: 1.4 }),
      );
      pack.add(housing);
      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.007, hi ? 0.038 : 0.024, seg),
        this._gamingMat({ color: 0x00e8ff, emissive: 0x00ffff, rim: 2.0, additive: true, transparent: true, opacity: 0.75 }),
      );
      plume.rotation.x = Math.PI;
      plume.position.y = -0.022;
      pack.add(plume);
      pack.position.set(side * 0.014, -0.03, -0.016);
      g.add(pack);
      thrusters.push(plume);
      jetVfx.push(this._createJetVfx(g, side));
    });
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, seg, seg),
      this._gamingMat({ color: 0xffffff, emissive: 0x00e8ff, rim: 2.4, additive: true, transparent: true, opacity: 0.7 }),
    );
    core.position.y = 0.006;
    g.add(core);
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, seg, seg),
      new THREE.MeshBasicMaterial({
        color: 0x00c8ff,
        transparent: true,
        opacity: hi ? 0.12 : 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    g.add(aura);
    const alt = opts.alt || 1.09;
    const p = this._latLngToPos(lat ?? 36.44, lng ?? 28.22, alt);
    g.position.set(p.x, p.y, p.z);
    const n = new THREE.Vector3(p.x, p.y, p.z).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    g.userData = {
      type: 'astranov-flyer',
      procedural3d: true,
      gaming: hi,
      name: opts.label || 'Astranov',
      lat, lng, alt,
      wings, arms, legs, thrusters, core, aura, jetVfx,
      edition: opts.edition?.id || 'astranov',
    };
    return g;
  },

  _animateFlyerPose(mesh, flying) {
    const ud = mesh?.userData;
    if (!ud?.procedural3d) return;
    const t = this._flyerFrame * 0.12;
    this._pulseGamingMats(mesh, t);
    const flap = Math.sin(t) * (flying ? 0.52 : 0.28);
    ud.wings?.forEach((wing, i) => {
      wing.rotation.z = (i === 0 ? 1 : -1) * flap;
      wing.rotation.y = Math.sin(t * 0.8 + i) * 0.08;
    });
    ud.legs?.forEach((leg, i) => {
      leg.rotation.x = Math.sin(t * 0.9 + i) * (flying ? 0.22 : 0.12);
    });
    ud.arms?.forEach((arm, i) => {
      arm.rotation.z = (i === 0 ? 1 : -1) * (0.12 + Math.sin(t * 0.7) * 0.08);
    });
    if (ud.core?.material?.uniforms?.uAlpha) {
      ud.core.material.uniforms.uAlpha.value = 0.55 + Math.sin(t * 1.6) * 0.3;
    }
    if (ud.aura?.material) {
      ud.aura.material.opacity = (flying ? 0.16 : 0.1) + Math.sin(t * 1.2) * 0.04;
      ud.aura.scale.setScalar(1 + Math.sin(t * 0.9) * 0.06);
    }
    ud.thrusters?.forEach((thr, i) => {
      if (thr.material?.uniforms?.uAlpha) {
        thr.material.uniforms.uAlpha.value = flying
          ? 0.65 + Math.sin(t * 2 + i) * 0.3
          : 0.3 + Math.sin(t + i) * 0.12;
      }
      thr.scale.y = flying ? 1.2 + Math.sin(t * 1.4 + i) * 0.45 : 0.65;
    });
    const power = flying ? 0.014 : 0.006;
    const worldDown = new THREE.Vector3(0, -1, 0).applyQuaternion(mesh.quaternion);
    ud.thrusters?.forEach((thr, i) => {
      const wp = new THREE.Vector3();
      thr.getWorldPosition(wp);
      this._emitJet(ud.jetVfx?.[i], wp, worldDown, power);
    });
    ud.jetVfx?.forEach((vfx) => this._tickJetVfx(vfx, flying));
    if (this._gamingLight && mesh.position) {
      this._gamingLight.position.copy(mesh.position).multiplyScalar(1.02);
    }
  },

  _orientFlyerOnGlobe(mesh, pos) {
    if (!mesh || !pos) return;
    const n = pos.clone().normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  },

  _scaleFlyer(mesh, camZ) {
    if (!mesh?.userData?.procedural3d) return;
    const scale = Math.max(0.85, Math.min(2.4, 1.35 * (camZ / 2.2)));
    mesh.scale.setScalar(scale);
  },

  spawnAstranovFlyer(lat, lng, opts = {}) {
    if (this._flyer?.parent) this._flyer.parent.remove(this._flyer);
    const robot = this._buildProceduralHumanoid(lat, lng, opts);
    globePivot.add(robot);
    this._flyer = robot;
    window._astranovFlyer = robot;
    window._pilot = robot;
    this._animateFlyerPose(robot, false);
    this.spawnEffect(robot.position, opts.color || 0x3d9eff, 22, 48);
    return robot;
  },

  _greatCircleCurve(fromVec, toVec, alt = 1.09, segments = 36) {
    const a = fromVec.clone().normalize();
    const b = toVec.clone().normalize();
    const qA = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), a);
    const qB = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b);
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const q = qA.clone().slerp(qB, t);
      pts.push(new THREE.Vector3(0, 0, alt).applyQuaternion(q));
    }
    return new THREE.CatmullRomCurve3(pts);
  },

  flyAstranovTo(lat, lng, opts = {}) {
    if (!this._flyer) {
      const u = window._lastPos || { lat: 36.44, lng: 28.22 };
      this.spawnAstranovFlyer(u.lat, u.lng, opts);
    }
    const alt = opts.alt || this._flyer.userData?.alt || 1.09;
    const toP = this._latLngToPos(lat, lng, alt);
    const to = new THREE.Vector3(toP.x, toP.y, toP.z);
    const from = this._flyer.position.clone();
    const dist = TrackballGuard?.greatCircleKm?.(
      this._flyer.userData?.lat ?? 0,
      this._flyer.userData?.lng ?? 0,
      lat, lng
    ) || 800;
    const dur = opts.dur || Math.min(6200, Math.max(1400, dist * 2.8));
    const curve = this._greatCircleCurve(from, to, alt);
    this._flyerFlying = true;
    this._flyer.userData.lat = lat;
    this._flyer.userData.lng = lng;
    return this.animateAlongPath(this._flyer, curve, {
      dur,
      color: opts.color || 0x3d9eff,
      isFlyer: true,
      onDone: () => {
        this._flyerFlying = false;
        opts.onDone?.();
      },
    });
  },

  buildProceduralPilot(lat, lng, opts = {}) {
    return this.spawnAstranovFlyer(lat, lng, { ...opts, label: opts.edition?.name_gr || 'Astranov' });
  },

  buildProceduralDrone(lat, lng, domain = 'air', color = 0x44ccff) {
    const spec = TelemachosPilot?.DOMAINS?.[domain] || { alt: 1.06, color };
    const pos = this._latLngToPos(lat, lng, spec.alt || 1.06);
    const g = new THREE.Group();
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.012, 0.018, 6),
      new THREE.MeshBasicMaterial({ color: color || spec.color || 0x44ccff }),
    );
    g.add(hub);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.003, 0.003),
        new THREE.MeshBasicMaterial({ color: 0x88ccff }),
      );
      arm.rotation.z = (i / 4) * Math.PI * 2;
      arm.position.x = Math.cos(arm.rotation.z) * 0.018;
      arm.position.y = Math.sin(arm.rotation.z) * 0.018;
      g.add(arm);
    }
    g.userData = { type: 'drone', domain };
    g.position.set(pos.x, pos.y, pos.z);
    const n = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    globePivot.add(g);
    this.spawnEffect(g.position, color, 12, 35);
    return g;
  },

  animateAlongPath(mesh, curve, opts = {}) {
    if (!mesh || !curve) return null;
    const dur = opts.dur || 4200;
    const trailColor = opts.color || 0x00ddff;
    const t0 = performance.now();
    const id = { mesh, curve, t0, dur, trailColor, done: false, isFlyer: !!opts.isFlyer, onDone: opts.onDone };
    this._paths.push(id);
    if (opts.isFlyer) this._flyerFlying = true;
    return id;
  },

  _tickPaths() {
    const now = performance.now();
    for (let i = this._paths.length - 1; i >= 0; i--) {
      const p = this._paths[i];
      const prog = Math.min(1, (now - p.t0) / p.dur);
      const pt = p.curve.getPoint(prog);
      p.mesh.position.copy(pt);
      const n = pt.clone().normalize();
      p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const camZ = camera?.position?.z ?? 2.55;
      if (p.isFlyer) {
        this._flyerFrame++;
        this._scaleFlyer(p.mesh, camZ);
        this._animateFlyerPose(p.mesh, true);
      }
      if (Math.floor(prog * 40) % (p.isFlyer ? 2 : 3) === 0) {
        this.spawnEffect(pt, p.trailColor, p.isFlyer ? 6 : 4, p.isFlyer ? 22 : 18);
      }
      if (prog >= 1) {
        p.done = true;
        this.spawnEffect(pt, p.trailColor, 16, 40);
        this._paths.splice(i, 1);
        if (p.isFlyer) this._flyerFlying = false;
        p.onDone?.();
      }
    }
  },

  _tickAstranovFlyer() {
    if (!this._flyer || this._flyerFlying) return;
    this._flyerFrame++;
    const t = Date.now() * 0.001;
    const alt = (this._flyer.userData?.alt || 1.09) + Math.sin(t * 2.2) * 0.004;
    const lat = this._flyer.userData?.lat ?? 36.44;
    const lng = this._flyer.userData?.lng ?? 28.22;
    const p = this._latLngToPos(lat, lng, alt);
    this._flyer.position.set(p.x, p.y, p.z);
    this._orientFlyerOnGlobe(this._flyer, this._flyer.position);
    const camZ = camera?.position?.z ?? 2.55;
    this._scaleFlyer(this._flyer, camZ);
    this._animateFlyerPose(this._flyer, false);
    if (this._flyerFrame % 18 === 0) {
      this.spawnEffect(this._flyer.position, 0x3d9eff, 4, 16);
    }
  },

  setSiteShellMode(on) {
    this.shellDim = !!on;
    if (this.atmosphere) this.atmosphere.material.opacity = on ? 0.12 : (this.voicePerf ? 0.04 : 0.06);
    if (this.idleNodes) this.idleNodes.material.opacity = on ? 0.55 : 0.35;
  },

  setVoicePerfMode(on) {
    this.voicePerf = !!on;
    if (this.atmosphere) this.atmosphere.material.opacity = on ? 0.04 : (this.shellDim ? 0.12 : 0.06);
    if (this.clouds) this.clouds.visible = !on;
    if (this.idleNodes) this.idleNodes.visible = !on;
    if (this.neuralLayer) this.neuralLayer.visible = on || this.thinkPulse;
    if (on) {
      while (this.activeEffects.length > 6) {
        const eff = this.activeEffects.pop();
        if (eff?.points) {
          scene.remove(eff.points);
          eff.points.geometry?.dispose?.();
          eff.points.material?.dispose?.();
        }
      }
    }
  },

  setThinkMode(on) {
    this.thinkPulse = !!on;
    if (this.neuralLayer) {
      this.neuralLayer.visible = on || this.voicePerf;
      this.neuralLayer.material.opacity = on ? 0.22 : 0.14;
    }
  },

  setSuperBatchActive(on, meta = {}) {
    this.superBatchActive = !!on;
    this._batchMeta = meta || {};
    if (!this._parent) return;
    if (!this.batchGroup) {
      this.batchGroup = new THREE.Group();
      this._parent.add(this.batchGroup);
      const ringGeo = new THREE.RingGeometry(0.04, 0.07, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xaa88ff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.batchRing = new THREE.Mesh(ringGeo, ringMat);
      this.batchGroup.add(this.batchRing);
      const nodeGeo = new THREE.BufferGeometry();
      const pts = new Float32Array(8 * 3);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts[i * 3] = Math.cos(a) * 0.09;
        pts[i * 3 + 1] = Math.sin(a) * 0.09;
        pts[i * 3 + 2] = 0;
      }
      nodeGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      this.batchNodes = new THREE.Points(nodeGeo, new THREE.PointsMaterial({
        size: 0.012,
        color: 0x00ddff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      this.batchGroup.add(this.batchNodes);
    }
    this.batchGroup.visible = on;
    if (on) this._placeBatchRing(meta);
    if (on && meta.lat != null) {
      try {
        const p = this._latLngToPos(meta.lat, meta.lng || 0, 1.06);
        this.spawnEffect(new THREE.Vector3(p.x, p.y, p.z), 0xaa88ff, 24, 40);
      } catch (_) {}
    }
  },

  _placeBatchRing(meta = {}) {
    if (!this.batchGroup) return;
    const lat = meta.lat != null ? meta.lat : 36.44;
    const lng = meta.lng != null ? meta.lng : 28.22;
    const p = this._latLngToPos(lat, lng, 1.055);
    this.batchGroup.position.set(p.x, p.y, p.z);
    const normal = new THREE.Vector3(p.x, p.y, p.z).normalize();
    this.batchGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  },

  pulseBatchMesh(peerCount) {
    if (!this.batchRing) return;
    this.batchRing.material.opacity = 0.45 + Math.min(peerCount, 8) * 0.04;
    if (this.batchNodes) this.batchNodes.material.color.setHex(peerCount > 2 ? 0x3d9eff : 0x1a6fd4);
    try {
      const m = this._batchMeta || {};
      if (m.lat != null) {
        const p = this._latLngToPos(m.lat, m.lng || 0, 1.06);
        this.spawnEffect(new THREE.Vector3(p.x, p.y, p.z), 0xaa88ff, 18, 35);
      }
    } catch (_) {}
  },

  _tickPilotThrusters() {
    const pilot = window._pilot;
    if (!pilot?.userData?.thrusters) return;
    const t = Date.now() * 0.008;
    pilot.userData.thrusters.forEach((thr, i) => {
      thr.material.opacity = 0.65 + Math.sin(t + i) * 0.35;
      thr.scale.y = 0.8 + Math.sin(t * 1.4 + i) * 0.35;
    });
  },

  update() {
    if (!this._inited) return;
    const thinking = !!GlobeDeck?.thinking;
    if (thinking !== this.thinkPulse) this.setThinkMode(thinking);

    if (this.voicePerf) {
      this._frameSkip = (this._frameSkip + 1) % 2;
      if (this._frameSkip) return;
    }
    const t = Date.now() * 0.001;
    if (this.batchRing && this.superBatchActive) {
      this.batchRing.rotation.z = t * 0.6;
      this.batchRing.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.15;
    }
    if (this.batchNodes && this.superBatchActive) this.batchNodes.rotation.y = t * 0.5;
    if (this.clouds && !this.shellDim && !this.voicePerf) this.clouds.rotation.y += 0.00008;
    if (this.cityLights) this.cityLights.material.opacity = 0.65 + Math.sin(t * 1.5) * 0.1;
    if (this.neuralLayer?.visible && this._neuralPack) {
      this._paintNeural(this._neuralPack.ctx, 512, 256, t * 60);
      this._neuralPack.tex.needsUpdate = true;
      this.neuralLayer.rotation.y += 0.00012;
    }
    this._tickAstranovFlyer();
    this._tickPilotThrusters();
    this._tickPaths();

    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const eff = this.activeEffects[i];
      const posAttr = eff.points.geometry.attributes.position;
      const arr = posAttr.array;
      eff.life--;
      const alpha = eff.life / eff.maxLife;
      for (let j = 0; j < arr.length; j += 3) {
        const vidx = j / 3;
        arr[j] += eff.velocities[vidx * 3] * alpha;
        arr[j + 1] += eff.velocities[vidx * 3 + 1] * alpha;
        arr[j + 2] += eff.velocities[vidx * 3 + 2] * alpha;
      }
      posAttr.needsUpdate = true;
      eff.points.material.opacity = alpha * 0.9;
      if (eff.life <= 0) {
        scene.remove(eff.points);
        eff.points.geometry.dispose();
        eff.points.material.dispose();
        this.activeEffects.splice(i, 1);
      }
    }
  },
};

window.AIGraphics = AIGraphics;
AIGraphics.init(globePivot);

setTimeout(() => {
  try {
    AIGraphics.spawnEffect(new THREE.Vector3(0.6, 0.3, 1.1), 0x00ffaa, 28, 32);
    const u = window._lastPos || { lat: 36.44, lng: 28.22 };
    AIGraphics.spawnAstranovFlyer(u.lat, u.lng, { label: 'Astranov' });
  } catch (_) {}
}, 480);

window.AstranovFlyer = {
  spawn: (lat, lng, opts) => AIGraphics.spawnAstranovFlyer(lat, lng, opts),
  flyTo: (lat, lng, opts) => AIGraphics.flyAstranovTo(lat, lng, opts),
};

// Flow
let me = null;
let others = [];
let hidden = false;



// Identity unified via AstranovSession (same user across devices when signed in)
me = null;
window.me = me;

// Voice.init() — deferred to _astranovBoot

// Guest identity only — no auto-locate or camera fly on boot
function initUser() {
  AstranovSession?._applyIdentity?.();
  if (!me) {
    me = { id: 'guest-pending', name: 'Guest', isGuest: true };
    window.me = me;
  }
  userLocated = false;
}

// Let user explore the globe freely first
console.log('%c[Astranov] Globe UI: drag rotate · wheel/pinch zoom · tap/double-tap fly. 💻 CLI for tasks. 🎧 hands-free optional.', 'color:#00ddff');

// Voice → Astranov Command Line (live transcript in input, same path as typing)
let _voiceBusy = false;
let _voiceGen = 0;
let _voiceSilenceTimer = null;
let _voiceCommitting = false;
let _lastVoiceCommit = '';
let _lastVoiceCommitT = 0;
let _voiceDraft = '';
window._handsFreeVoice = false;

const VOICE_SILENCE_MS = 650;
let _voiceLangLocked = false;
let _recognitionPaused = false;
let _listenRestartAt = 0;
let _voiceResumeTimer = null;
let _listenFailStreak = 0;
const VOICE_RESTART_GAP_MS = 650;
const VOICE_RESTART_GAP_MAX_MS = 5200;
const EXECUTE_SUFFIX = /\s*(?:go(?:\s+(?:ahead|do(?:\s+it)?|now))?|do\s+it|execute(?:\s+it)?|run\s+it|send\s+it|now|πήγαινε|κάντο|καντο|εκτέλεσε|ξεκίνα|τρέξε)\s*$/i;
const EXECUTE_PREFIX = /^(?:go(?:\s+(?:ahead|do|and))?|please\s+)?\s*/i;
const CODERS_CANON = 'coders';

function voiceEditDist(a, b) {
  a = String(a || '').toLowerCase();
  b = String(b || '').toLowerCase();
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function cleanVoiceToken(tok) {
  return String(tok || '').toLowerCase().replace(/[''´`]/g, '').replace(/[^\w\u0370-\u03FF]/g, '');
}

const CODERS_MISHEAR_EXACT = new Set([
  'coders', 'coder', 'corders', 'corder', 'codas', 'coda', 'cooters', 'coaters',
  'colders', 'colder', 'koders', 'koder', 'goders', 'gorder', 'couders', 'coderrs',
  'codehers', 'codeus', 'quarters', 'quarter', 'κοντερ', 'κοντερς', 'κόντερ', 'κόντερς',
  'κοντερσ', 'κοντρς', 'κοντρ', 'κοντερσ',
]);

function tokenSoundsLikeCoders(tok) {
  const w = cleanVoiceToken(tok);
  if (!w) return false;
  if (CODERS_MISHEAR_EXACT.has(w)) return true;
  if (w === 'coders' || w.startsWith('coder')) return true;
  if (/^c[o0q][od][aeiou]*r/.test(w) && w.length <= 10) return true;
  if (/^κ[oό]?ντ[εη]?ρ/.test(w)) return true;
  if (w.length >= 4 && w.length <= 10 && voiceEditDist(w, 'coders') <= 2) return true;
  if (w.length >= 4 && w.length <= 8 && voiceEditDist(w, 'coder') <= 1) return true;
  return false;
}

function phraseIsCodersMishear(text) {
  const core = String(text || '').trim().toLowerCase().replace(EXECUTE_SUFFIX, '').trim();
  if (!core) return false;
  if (tokenSoundsLikeCoders(core)) return true;
  if (/^code\s+her?s$/i.test(core)) return true;
  if (/^code\s+us$/i.test(core)) return true;
  if (/^call\s+her?s$/i.test(core)) return true;
  if (/^go\s+ders?$/i.test(core)) return true;
  return false;
}

/** Suspect "coders" before other garbage — runs on every voice transcript */
function fixVoiceHotwords(text) {
  let s = String(text || '').trim();
  if (!s) return s;

  const suffix = EXECUTE_SUFFIX.test(s) ? (s.match(EXECUTE_SUFFIX)?.[0] || '') : '';
  let core = suffix ? s.replace(EXECUTE_SUFFIX, '').trim() : s;

  const summon = core.match(/^(summon)\s+(\S+)(?:\s+(.*))?$/i);
  if (summon && tokenSoundsLikeCoders(summon[2])) {
    core = 'summon coders' + (summon[3] ? ' ' + summon[3] : '');
    return (core + suffix).trim();
  }

  const codeHer = core.match(/^code\s+(her|hers|us|errors?)\s+(.*)$/i);
  if (codeHer) return (CODERS_CANON + ' ' + codeHer[2] + suffix).trim();

  const parts = core.split(/\s+/);
  const first = parts[0] || '';

  if (tokenSoundsLikeCoders(first)) {
    const rest = parts.slice(1).join(' ');
    if (!rest || phraseIsCodersMishear(core)) return (CODERS_CANON + (rest ? ' ' + rest : '') + suffix).trim();
    return (CODERS_CANON + (rest ? ' ' + rest : '') + suffix).trim();
  }

  if (parts.length <= 3 && phraseIsCodersMishear(core)) return (CODERS_CANON + suffix).trim();

  if (parts.length >= 2 && parts.length <= 6 && tokenSoundsLikeCoders(parts[parts.length - 1])) {
    parts[parts.length - 1] = CODERS_CANON;
    return (parts.join(' ') + suffix).trim();
  }

  if (window.ArcangeloDialect) s = ArcangeloDialect.normalizeForRouting(s) || s;
  return s;
}
window.fixVoiceHotwords = fixVoiceHotwords;

function codersTranscriptScore(text) {
  const fixed = fixVoiceHotwords(String(text || '').trim());
  if (/^coders\b/i.test(fixed)) return 100;
  const first = cleanVoiceToken(String(text || '').split(/\s+/)[0]);
  if (tokenSoundsLikeCoders(first)) return 80 - voiceEditDist(first, 'coders');
  return 0;
}

function pickVoiceTranscript(result, isFinal) {
  let best = result[0]?.transcript || '';
  if (isFinal && result.length > 1) {
    let bestScore = codersTranscriptScore(best);
    for (let j = 1; j < result.length; j++) {
      const alt = result[j]?.transcript || '';
      const score = codersTranscriptScore(alt);
      if (score > bestScore) { bestScore = score; best = alt; }
    }
  }
  if (!isFinal) return fixVoiceHotwords(best);
  const repaired = ArcangeloDialect?.repairTranscript?.(best) || best;
  ArcangeloDialect?.ingest?.(repaired);
  return fixVoiceHotwords(repaired);
}

function defaultListenLang() {
  const nav = (navigator.language || 'en-US').toLowerCase();
  if (nav.startsWith('el')) return 'el-GR';
  if (nav.startsWith('en')) return 'en-US';
  return 'el-GR';
}

function normalizeVoiceCommand(text) {
  let s = fixVoiceHotwords(String(text || '').trim());
  if (!s) return '';
  if (window.ArcangeloDialect) s = ArcangeloDialect.normalizeForRouting(s) || s;
  if (EXECUTE_SUFFIX.test(s)) s = s.replace(EXECUTE_SUFFIX, '').trim();
  if (/^(go|do|run|execute)\s+\S/i.test(s)) s = s.replace(EXECUTE_PREFIX, '').trim();
  return s;
}

function voiceListenBlocked() {
  return _recognitionPaused || Voice?.speaking || _voiceBusy || _voiceCommitting;
}

function setVoicePerfMode(on) {
  window._voicePerfMode = !!on;
  if (on) SlumberManager?.wake?.('voice', 'voice');
  if (window.AIGraphics?.setVoicePerfMode) AIGraphics.setVoicePerfMode(!!on || !!window._globePerfLite);
}
window.setVoicePerfMode = setVoicePerfMode;

function wantsExecuteNow(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  return EXECUTE_SUFFIX.test(s) || /^(go|do|run|execute)\s+\S/i.test(s);
}

function syncListenLang(draft) {
  if (!recognition || !draft) return;
  if (window._handsFreeVoice && _voiceLangLocked) return;
  const lang = ArcangeloDialect?.listenLang?.(draft) || Voice?.detectLang?.(draft) || 'el-GR';
  if (lang === recognition.lang) {
    if (window._handsFreeVoice) _voiceLangLocked = true;
    return;
  }
  if (window._handsFreeVoice) return;
  recognition.lang = lang;
  Voice.preferredListenLang = lang;
}

function pauseVoiceRecognition() {
  if (!recognition) return;
  _recognitionPaused = true;
  if (!isListening) return;
  isListening = false;
  try { recognition.stop(); } catch (_) {}
}
window.pauseVoiceRecognition = pauseVoiceRecognition;

function resumeVoiceRecognition() {
  if (!_recognitionPaused) return;
  _recognitionPaused = false;
  if (window._handsFreeVoice || voiceSessionActive) scheduleVoiceResume();
}
window.resumeVoiceRecognition = resumeVoiceRecognition;

function voiceInterrupt(opts) {
  opts = opts || {};
  _voiceGen++;
  _voiceBusy = false;
  _voiceCommitting = false;
  if (_voiceResumeTimer) { clearTimeout(_voiceResumeTimer); _voiceResumeTimer = null; }
  if (_voiceSilenceTimer) { clearTimeout(_voiceSilenceTimer); _voiceSilenceTimer = null; }
  Voice?.flush?.();
  AstranovLogo?.setAiActive?.(false);
  syncHandsFreeBtn?.();
  GlobeDeck?.setThinking?.(false);
  if (window._aciAbort) { try { window._aciAbort.abort(); } catch (_) {} window._aciAbort = null; }
  if (!opts.keepHandsFree) return;
  if (window._handsFreeVoice && !isListening) setTimeout(() => startListeningForOptions(), 80);
}
window.voiceInterrupt = voiceInterrupt;

function syncHandsFreeBtn() {
  const btn = document.getElementById('aci-handsfree');
  if (!btn) return;
  const on = voiceSessionActive || window._handsFreeVoice;
  const speaking = !!Voice?.speaking;
  const listening = !!isListening;
  btn.classList.toggle('deck-btn-active', on);
  btn.classList.toggle('listening', listening);
  btn.classList.toggle('speaking', speaking);
  if (listening || on) AstranovLogo?.setMicActive?.(true);
  else if (!speaking) AstranovLogo?.setMicActive?.(false);
  if (!speaking) AstranovLogo?.setAiActive?.(false);
  AiGlyphs?.syncVoice?.();
  GlobeDeck?.syncCliPulse?.();
}
window.syncHandsFreeBtn = syncHandsFreeBtn;

function openVoiceCli() {
  const title = window.SuperCli?.title || 'Astranov Command Line';
  GlobeDeck?.expand(title);
  if (window.AciCli) AciCli.open = true;
  SuperCli?.setContext?.(SuperCli.inferContext?.() || 'idle');
  const input = document.getElementById('aci-cli-in');
  if (input) input.classList.add('voice-live');
  syncHandsFreeBtn();
}

function scheduleVoiceResume() {
  if (sessionHeld || SessionHold?.isHeld?.()) return;
  if (Voice?.speaking) return;
  const active = voiceSessionActive || window._handsFreeVoice;
  if (!active || !voiceEnabled || isListening || voiceListenBlocked()) return;
  if (_voiceResumeTimer) return;
  const wait = Math.max(
    _listenRestartAt - Date.now(),
    window._handsFreeVoice ? VOICE_RESTART_GAP_MS : 500
  );
  _voiceResumeTimer = setTimeout(() => {
    _voiceResumeTimer = null;
    if (sessionHeld || SessionHold?.isHeld?.()) return;
    const on = voiceSessionActive || window._handsFreeVoice;
    if (!on || !voiceEnabled || isListening || voiceListenBlocked()) return;
    startListeningForOptions();
  }, wait);
}

function scheduleSilenceSubmit(draft) {
  if (!window._handsFreeVoice || !draft || _voiceCommitting) return;
  if (_voiceSilenceTimer) clearTimeout(_voiceSilenceTimer);
  _voiceSilenceTimer = setTimeout(() => {
    _voiceSilenceTimer = null;
    if (_voiceCommitting || _voiceBusy) return;
    const input = document.getElementById('aci-cli-in');
    const line = normalizeVoiceCommand((input?.value || draft).trim());
    if (line.length >= 3) commitVoiceCommand(line);
  }, VOICE_SILENCE_MS);
}

function commitVoiceCommand(raw) {
  const line = normalizeVoiceCommand(raw);
  const minLen = ArcangeloDialect?.sessionActive?.() ? 2 : 2;
  if (!line || line.length < minLen || _voiceCommitting) return;
  const now = Date.now();
  const codersLine = /^coders?\b|fix\s|build\s|implement|call\s+coders?/i.test(line);
  const dedupMs = codersLine ? 600 : 2200;
  if (_lastVoiceCommit === line && now - _lastVoiceCommitT < dedupMs) return;
  _lastVoiceCommit = line;
  _lastVoiceCommitT = now;
  _voiceCommitting = true;
  if (_voiceSilenceTimer) { clearTimeout(_voiceSilenceTimer); _voiceSilenceTimer = null; }
  GlobeDeck?.clearCompose?.();
  if (!window._handsFreeVoice) {
    isListening = false;
    try { recognition?.stop(); } catch (_) {}
  }
  console.log('Voice commit:', line);
  submitVoiceToCli(line).finally(() => { _voiceCommitting = false; });
}

function voiceWantsAciControl(line) {
  const low = line.toLowerCase();
  return /pitogyra|πιτογυρ|explore|εξερεύ|πήγαινε|go to|focus/.test(low)
    || GlobeVideo?.wantsYoutube?.(line)
    || /video\s+call|orbital\s+video|κλήση\s+βίντεο/.test(low)
    || /telecom|sat radio|satellite radio|ασύρματος/.test(low)
    || /αγγλικά|english|ελληνικά|greek|athenian|αθηναϊκ|spartan|σπαρτιατ|myrmidon|μυρμιδόν/.test(low)
    || /^(remember|θυμήσου|να θυμάσαι)\b/.test(low)
    || /evolve|neuron|collective|εξέλιξη|brain/.test(low)
    || (/μπίρ|τσιγαρ|beer|cigar|delivery|διανομ|παραγγελ|goals|work|δουλειά/.test(low) && !/^order\b/i.test(line));
}

async function submitVoiceToCli(transcript) {
  const line = normalizeVoiceCommand(transcript);
  if (!line) return;
  const gen = ++_voiceGen;
  _voiceBusy = true;
  openVoiceCli();

  const low = line.toLowerCase();
  if (gen !== _voiceGen) return;

  if (/^(hold|pause session|quiet mode|κράτα|κρατα|σίγαση|σιγαση)\b/.test(low)) {
    if (gen === _voiceGen) _voiceBusy = false;
    SessionHold?.hold?.();
    return;
  }
  if (/^(resume|unhold|continue|συνέχισε|συνεχισε|ξανα)\b/.test(low)) {
    if (gen === _voiceGen) _voiceBusy = false;
    await SessionHold?.resume?.();
    return;
  }
  if (sessionHeld || SessionHold?.isHeld?.()) {
    if (gen === _voiceGen) _voiceBusy = false;
    AciCli?.print('⏸ session held — say resume or tap ▶', 'dim');
    return;
  }
  if (/^(stop|σταμάτα|σταματα|pause|διακοπή|quiet|σιωπή|mute)\b/.test(low)) {
    if (gen === _voiceGen) _voiceBusy = false;
    userIntervene();
    return;
  }
  if (/^(mic|voice|handsfree|hands-free|μίκροφωνο|ακού)\b/.test(low)) {
    if (gen === _voiceGen) _voiceBusy = false;
    startVoiceOptions();
    return;
  }
  if (AstranovPresence?.wantsKryftoStart?.(line)) {
    if (gen === _voiceGen) _voiceBusy = false;
    AciCli?.print('🎧 ' + line, 'cmd');
    AstranovPresence?.startKryfto?.();
    if (window._handsFreeVoice && !Voice?.speaking) scheduleVoiceResume();
    return;
  }
  if (WillaGames?.wantsPyramid?.(line)) {
    if (gen === _voiceGen) _voiceBusy = false;
    AciCli?.print('🎧 ' + line, 'cmd');
    WillaGames?.startPyramid?.();
    return;
  }
  if (WillaGames?.wantsWilla?.(line)) {
    if (gen === _voiceGen) _voiceBusy = false;
    AciCli?.print('🎧 ' + line, 'cmd');
    WillaGames?.startWilla?.();
    return;
  }
  if (/^(dark|bright|light)\s*(theme|mode)?\b/.test(low) || /^theme\s+(dark|bright|light)\b/.test(low)) {
    if (gen === _voiceGen) _voiceBusy = false;
    const mode = /bright|light/.test(low) ? 'bright' : 'dark';
    AstranovTheme?.set?.(mode);
    AciCli?.print('theme → ' + mode, 'ok');
    return;
  }
  if (/^(use\s+)?(openai|gpt|groq|gemini|deepseek|deep\s*seek|cycle|astranov)\b/i.test(low)) {
    if (gen === _voiceGen) _voiceBusy = false;
    const prov = /openai|gpt/.test(low) ? 'openai-mini'
      : /groq/.test(low) ? 'groq'
      : /gemini/.test(low) ? 'gemini'
      : /deep/.test(low) ? 'deepseek'
      : 'astranov';
    AiRouter?.setProvider?.(prov);
    LabOrbs?._syncGlyphs?.();
    AciCli?.print('AI provider → ' + (AiRouter.current()?.label || prov), 'ok');
    ACIControl?.reply('AI provider → ' + (AiRouter.current()?.label || prov));
    if (window._handsFreeVoice && !Voice?.speaking) scheduleVoiceResume();
    return;
  }
  if (/^summon\s+composer|^use\s+composer|^queue\s+composer/i.test(low)) {
    if (gen === _voiceGen) _voiceBusy = false;
    void CodersHub?.summonComposer?.();
    if (window._handsFreeVoice && !Voice?.speaking) scheduleVoiceResume();
    return;
  }
  if (/coders?\s*hub|open\s*labs?|ai\s*teams?/i.test(low)) {
    if (gen === _voiceGen) _voiceBusy = false;
    CodersHub?.toggle?.(true);
    ACIControl?.reply('Coders Hub open');
    if (window._handsFreeVoice && !Voice?.speaking) scheduleVoiceResume();
    return;
  }

  try {
    if (gen !== _voiceGen) return;
    const low = line.toLowerCase();
    const cliCmd = /^(order|locate|city|theme|dark|bright|batch|vhf|phone|drive|logout|login|sign|help|ping)\b/.test(low);
    if (!cliCmd && !voiceWantsAciControl(line) && window.AciCoders) {
      await AciCoders.chat(line, { fromVoice: true });
    } else if (voiceWantsAciControl(line)) {
      await ACIControl.handle(line, { fromVoice: true });
    } else if (window.AciCli) {
      await AciCli.run(line, { fromVoice: true });
    } else if (window.AciCoders) {
      await AciCoders.chat(line, { fromVoice: true });
    } else {
      await ACIControl.handle(line, { fromVoice: true });
    }
  } catch (e) {
    if (gen === _voiceGen) AciCli?.print('voice error: ' + (e.message || e), 'err');
  } finally {
    if (gen === _voiceGen) {
      _voiceBusy = false;
      const input = document.getElementById('aci-cli-in');
      if (input) input.classList.remove('voice-live');
      syncHandsFreeBtn();
      if (window._handsFreeVoice && !Voice?.speaking) scheduleVoiceResume();
    }
  }
}
window.submitVoiceToCli = submitVoiceToCli;
window.scheduleVoiceResume = scheduleVoiceResume;

function initVoice() {
  if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRec();
    Voice.preferredListenLang = Voice.preferredListenLang || defaultListenLang();
    recognition.lang = Voice.preferredListenLang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = handleVoiceCommand;
    recognition.onerror = (e) => {
      isListening = false;
      if (e.error === 'aborted' || _recognitionPaused) return;
      if (e.error === 'no-speech') {
        _listenFailStreak = Math.min(_listenFailStreak + 1, 6);
        if (voiceSessionActive || window._handsFreeVoice) {
          const gap = Math.min(
            VOICE_RESTART_GAP_MS + _listenFailStreak * 400,
            VOICE_RESTART_GAP_MAX_MS
          );
          _listenRestartAt = Date.now() + gap;
          scheduleVoiceResume();
        }
        return;
      }
      console.log('Voice error', e.error || e);
      if (e.error === 'not-allowed') {
        ACIControl?.reply('Mic blocked — allow microphone in browser settings');
        AciCli?.print('Mic blocked — enable microphone for astranov.eu', 'err');
      } else if (e.error === 'network') {
        ACIControl?.reply('Voice needs network — check connection');
      }
      _listenFailStreak = Math.min(_listenFailStreak + 1, 6);
      if ((voiceSessionActive || window._handsFreeVoice) && !voiceListenBlocked()) {
        const gap = Math.min(
          VOICE_RESTART_GAP_MS + _listenFailStreak * 500,
          VOICE_RESTART_GAP_MAX_MS
        );
        _listenRestartAt = Date.now() + gap;
        scheduleVoiceResume();
      }
    };
    recognition.onend = () => {
      isListening = false;
      if (_recognitionPaused || Voice?.speaking || voiceListenBlocked()) return;
      if ((voiceSessionActive || window._handsFreeVoice) && voiceEnabled) {
        const gap = _listenFailStreak > 0
          ? Math.min(VOICE_RESTART_GAP_MS + _listenFailStreak * 350, VOICE_RESTART_GAP_MAX_MS)
          : VOICE_RESTART_GAP_MS;
        _listenRestartAt = Date.now() + gap;
        scheduleVoiceResume();
      }
    };
  } else {
    console.log('Voice not supported, using console fallback.');
  }
}

function startListeningForOptions() {
  if (sessionHeld || SessionHold?.isHeld?.()) return;
  if (!recognition || isListening || voiceListenBlocked()) return;
  const wait = _listenRestartAt - Date.now();
  if (wait > 0) {
    if (!_voiceResumeTimer) {
      _voiceResumeTimer = setTimeout(() => {
        _voiceResumeTimer = null;
        startListeningForOptions();
      }, wait);
    }
    return;
  }
  openVoiceCli();
  isListening = true;
  syncHandsFreeBtn();
  try {
    recognition.start();
    _listenFailStreak = 0;
    _listenRestartAt = Date.now() + VOICE_RESTART_GAP_MS;
  } catch (e) {
    isListening = false;
    _listenFailStreak = Math.min(_listenFailStreak + 1, 6);
    if (e?.name === 'InvalidStateError') {
      _listenRestartAt = Date.now() + Math.min(
        VOICE_RESTART_GAP_MS * 2 + _listenFailStreak * 600,
        VOICE_RESTART_GAP_MAX_MS
      );
      if (voiceSessionActive || window._handsFreeVoice) scheduleVoiceResume();
    }
  }
}

function handleVoiceCommand(event) {
  const input = document.getElementById('aci-cli-in');
  let interim = '';
  let final = '';

  let hasFinal = false;
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const isFinal = !!event.results[i].isFinal;
    const t = pickVoiceTranscript(event.results[i], isFinal);
    if (isFinal) { final += t; hasFinal = true; }
    else interim += t;
  }

  const draft = (final || interim).trim();
  if (!draft) return;
  if (Voice?.speaking && !hasFinal) return;

  if (_voiceCommitting) {
    if (input) {
      input.value = draft;
      input.classList.add('voice-live');
      if (AciCli) AciCli.buffer = draft;
      window.resizeCliInput?.(input);
    }
    _voiceDraft = draft;
    return;
  }
  if (_voiceBusy && input) {
    input.value = draft;
    input.classList.add('voice-live');
    if (AciCli) AciCli.buffer = draft;
    window.resizeCliInput?.(input);
    _voiceDraft = draft;
    return;
  }
  if (Voice?.speaking && window._handsFreeVoice && draft.length > (_voiceDraft?.length || 0) + 8) {
    voiceInterrupt({ keepHandsFree: true });
  }
  _voiceDraft = draft;

  voiceSessionActive = true;
  voiceEnabled = true;
  syncListenLang(draft);
  openVoiceCli();
  if (input) {
    input.value = draft;
    input.classList.add('voice-live');
    if (AciCli) AciCli.buffer = draft;
    window.resizeCliInput?.(input);
  }
  syncHandsFreeBtn();

  const live = (final || interim).trim();
  if (final.trim()) {
    if (window._handsFreeVoice) {
      commitVoiceCommand(final.trim());
    } else {
      const input = document.getElementById('aci-cli-in');
      if (input) {
        input.value = normalizeVoiceCommand(final.trim());
        input.classList.add('voice-live');
        window.resizeCliInput?.(input);
        input.focus();
      }
    }
    return;
  }
  if (wantsExecuteNow(live)) {
    const cmd = normalizeVoiceCommand(live);
    if (cmd.length >= 2) commitVoiceCommand(cmd);
    return;
  }
  scheduleSilenceSubmit(live);
}

function resumeListening() {
  scheduleVoiceResume();
}
window.resumeListening = resumeListening;

async function startVoiceOptions() {
  if (sessionHeld || SessionHold?.isHeld?.()) {
    SessionHold?.resume?.();
    return;
  }
  if (window._handsFreeVoice && isListening) {
    userIntervene();
    return;
  }
  if (!recognition) {
    AciCli?.print('Voice not supported — use Chrome or Edge', 'err');
    ACIControl?.reply('Voice needs Chrome — type in CLI');
    return;
  }
  Voice.flush();
  _voiceLangLocked = false;
  _recognitionPaused = false;
  voiceSessionActive = true;
  voiceEnabled = true;
  window._handsFreeVoice = true;
  setVoicePerfMode(true);
  AciCoders?.enterSession?.({ focus: false, ping: false });
  openVoiceCli();
  _voiceDraft = '';
  _lastVoiceCommit = '';
  _listenFailStreak = 0;
  _listenRestartAt = 0;
  if (_voiceResumeTimer) { clearTimeout(_voiceResumeTimer); _voiceResumeTimer = null; }
  const lang = 'el-GR';
  Voice.preferredListenLang = lang;
  recognition.lang = lang;
  _voiceLangLocked = true;
  const mic = await (AstranovLogo?.ensureMicAnalyser?.() || Promise.resolve(null));
  if (!mic && navigator.mediaDevices?.getUserMedia) {
    AciCli?.print('Mic blocked — allow microphone for astranov.eu', 'err');
    ACIControl?.reply('Mic blocked — allow mic in browser');
    window._handsFreeVoice = false;
    voiceSessionActive = false;
    syncHandsFreeBtn();
    return;
  }
  AciCli?.print('🎧 listening — speak, pause ~1s, I reply in ribbon + voice', 'dim');
  ACIControl?.reply('Listening — speak now');
  const input = document.getElementById('aci-cli-in');
  if (input) input.placeholder = '🎧 listening — pause to send';
  AstranovSession?.push?.();
  syncHandsFreeBtn();
  CliRibbon?.setNotice?.('listening', 'ready');
  startListeningForOptions();
}

function primeGrokVoice() {
  if (window._handsFreeVoice || isListening) return;
  const row = document.getElementById('globe-deck-input-row');
  if (!row || row.dataset.grokPrimed) return;
  row.dataset.grokPrimed = '1';
  row.addEventListener('click', () => {
    if (!window._handsFreeVoice && !isListening && !Voice?.speaking) startVoiceOptions();
  }, { once: true, passive: true });
}
window.primeGrokVoice = primeGrokVoice;

function stopHandsFree() {
  window._handsFreeVoice = false;
  voiceSessionActive = false;
  _voiceLangLocked = false;
  _recognitionPaused = false;
  _listenFailStreak = 0;
  _voiceDraft = '';
  setVoicePerfMode(false);
  if (_voiceResumeTimer) { clearTimeout(_voiceResumeTimer); _voiceResumeTimer = null; }
  if (_voiceSilenceTimer) { clearTimeout(_voiceSilenceTimer); _voiceSilenceTimer = null; }
  AstranovSession?.push?.();
}
window.stopHandsFree = stopHandsFree;

function requestLocationIfNeeded(onLocated) {
  if (userLocated || !navigator.geolocation) {
    if (onLocated) onLocated();
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    placeMe(pos.coords.latitude, pos.coords.longitude, { quiet: true, markerOnly: true });
    window._lastPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    userLocated = true;
    if (onLocated) onLocated();
  }, () => {
    if (onLocated) onLocated();
  });
}



function placeMe(lat, lng, opts) {
  opts = opts || {};
  const quiet = !!opts.quiet;
  const markerOnly = !!opts.markerOnly;
  const shouldFly = !!opts.fly || (!markerOnly && GlobeControl?.shouldAutoFly?.());
  if (GhostTravel?.active?.()) {
    GhostTravel.setTruePos(lat, lng);
    window._truePos = { lat, lng };
    userLocated = true;
    const g = GhostTravel.publicPos();
    if (shouldFly && typeof flyToPoint === 'function') {
      const pos = latLngToPos(g.lat, g.lng, 1.03);
      flyToPoint(new THREE.Vector3(pos.x, pos.y, pos.z), opts.zoom ?? (GlobeControl?.Z?.global || 2.55));
    }
    GhostTravel._applyVisual?.();
    if (!quiet) FieldBrain?.pulse('location', 'ghost route · real GPS private', { role: 'client', props: { visual_truth: true } });
    return;
  }
  window._lastPos = { lat, lng };
  if (window._meMarker && window._meMarker.parent) window._meMarker.parent.remove(window._meMarker);
  const pos = latLngToPos(lat, lng, 1.03);
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.028,8,8), new THREE.MeshBasicMaterial({color:0x3d9eff}));
  m.position.set(pos.x,pos.y,pos.z);
  m.userData = {type:'me', name: me ? me.name : 'You'};
  globePivot.add(m);
  window._meMarker = m;
  userLocated = true;
  GlobeEntity?.syncMe?.(lat, lng, me ? me.name : 'You');
  if (quiet) {
    if (!markerOnly) MapDepict.pulse(lat, lng, 0x3d9eff, 'You', 6000);
    if (!markerOnly) GlobeDeck?.setMapStatus('📍 ' + lat.toFixed(2) + ', ' + lng.toFixed(2));
  } else {
    MapDepict.action('location', { lat, lng, detail: me ? me.name : 'You' });
  }
  if (shouldFly && typeof flyToPoint === 'function') {
    const cz = CityLife?.CITY_ZOOM || GlobeControl?.Z?.city || 1.38;
    const nz = GlobeControl?.Z?.national || 1.82;
    const z = opts.zoom ?? (opts.cityDrop ? cz : nz);
    if (ZoomTiers && !opts.cityDrop) ZoomTiers.goTo('national', true);
    else if (ZoomTiers && opts.cityDrop) ZoomTiers.goTo('city', true);
    flyToPoint(new THREE.Vector3(pos.x, pos.y, pos.z), z);
    cityLevel = !!opts.cityDrop && z <= (GlobeControl?.Z?.regional || 1.65);
    GlobeControl?.noteAutoFly?.();
    CosmicZoom?.update?.(z);
    CityMap?.onCamera?.(z, 'earth');
    if (!window._globeFly) ZoomTiers?.syncFromCamZ?.(z, false);
  }
  if (!quiet) FieldBrain?.pulse('location', 'locate me', { role: 'client' });
  AstranovPresence?.onMove?.(lat, lng);
  void window.AstranovCityShop?.placeForUser?.(lat, lng, { fly: false });
}

function locateMe() {
  GlobeDeck?.expand?.(SuperCli?.title || 'Astranov Command Line');
  GlobeDeck?.setMapStatus('Locating your city…');
  GlobeControl?.engageFollow?.('locate');
  ACIControl?.reply('Locating — national view first · pinch in for city map…');
  if (!navigator.geolocation) {
    enterCityView?.(null, null, { openShops: false });
    return;
  }
  if (CityLife?.locateAndDropIn) {
    CityLife.locateAndDropIn().catch(() => {
      ACIControl?.reply('GPS denied — opening Rhodes demo map · allow location for your city');
      enterCityView?.(36.44, 28.22);
    });
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      await enterCityView?.(lat, lng);
    },
    () => {
      ACIControl?.reply('Location denied — enable GPS in browser');
      enterCityView?.();
    },
    { enableHighAccuracy: true, timeout: 14000, maximumAge: 30000 }
  );
}
window.locateMe = locateMe;

function showOtherUsers() {
  AstranovPresence?.refresh?.();
}

function toggleKryfto() {
  return AstranovPresence?.toggleHide?.();
}

function groupOrder() {
  console.log('%c[Order] Ζητάω pitogyra + μπίρες + τσιγάρα με drone...', 'color:#ffaa33');
  TelemachosPilot?.runDemoDelivery?.();
}

function showPilotTelemachos() {
  return TelemachosPilot?.showPilot?.();
}

window._cycleTurbo = false;
window._globePerfLite = false;
window._animFrame = 0;
const _slumberDiv = (k) => SlumberManager?.frameDivisor?.(k) || 6;

function globePerfActive() {
  return !!(window._voicePerfMode || window._globePerfLite);
}

// === CELESTIAL CIRCLES UI SYSTEM (Core Law Enforcement) ===
// Globe is ONLY surface. All else = floating draggable pinchable circles.
// Implements exact contract from living truth: frosted, radial mask, rim gestures, primordial + View.

const Circles = {
  _circles: new Map(),
  _nextId: 1,
  _primordials: ['economics', 'radar', 'ai', 'view'],

  init() {
    document.querySelectorAll('.celestial-circle').forEach((el) => el.remove());
  },

  _injectStyles() {
    if (document.getElementById('celestial-circles-style')) return;
    const style = document.createElement('style');
    style.id = 'celestial-circles-style';
    style.textContent = `
      .celestial-circle {
        position: fixed;
        border-radius: 50%;
        background: rgba(0,4,12,0.88);
        border: 1px solid rgba(26,111,212,0.42);
        backdrop-filter: blur(28px);
        box-shadow: 0 8px 40px rgba(0,0,0,0.55), 0 0 20px var(--circle-glow, rgba(26,111,212,0.3));
        overflow: hidden;
        z-index: 140;
        pointer-events: auto;
        user-select: none;
        transition: transform 0.15s ease, box-shadow 0.2s;
        display: flex;
        flex-direction: column;
      }
      .celestial-circle.economics { --circle-glow: rgba(0,170,85,0.55); border-color: rgba(0,170,85,0.5); }
      .celestial-circle.radar { --circle-glow: rgba(201,160,0,0.55); border-color: rgba(201,160,0,0.5); }
      .celestial-circle.ai { --circle-glow: rgba(61,158,255,0.55); border-color: rgba(61,158,255,0.45); }
      .celestial-circle.view { --circle-glow: rgba(180,220,255,0.4); border-color: rgba(126,184,255,0.35); }
      .celestial-circle .circle-rim {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        pointer-events: none;
      }
      .celestial-circle .circle-content {
        flex: 1;
        overflow: auto;
        padding: 14px;
        -webkit-mask-image: radial-gradient(circle at 50% 50%, black 70%, transparent 92%);
        mask-image: radial-gradient(circle at 50% 50%, black 70%, transparent 92%);
        font-size: 11px;
        line-height: 1.4;
        color: var(--an-text);
      }
      .celestial-circle .circle-header {
        padding: 6px 12px;
        font-size: 9px;
        color: var(--circle-glow);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .celestial-circle.pinned .circle-header::after { content: '📌'; font-size: 8px; }
      .celestial-circle .circle-close {
        width: 16px; height: 16px; border-radius: 50%;
        background: rgba(255,255,255,0.1); color: #fff; font-size: 10px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; pointer-events: auto;
      }
      .celestial-circle .circle-close:hover { background: #c41e2a; }
      .celestial-circle .scroll-arc {
        position: absolute; right: 4px; top: 22px; bottom: 22px; width: 3px;
        background: linear-gradient(transparent, var(--circle-glow), transparent);
        border-radius: 2px; opacity: 0.6; pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  },

  _ensurePrimordials() {
    const positions = {
      economics: { left: '12px', top: '12px', size: '180px' },
      radar: { right: '12px', top: '12px', size: '180px' },
      ai: { right: '12px', bottom: '12px', size: '200px' },
      view: { left: '50%', top: '40%', size: '260px', transform: 'translate(-50%, -50%)' }
    };
    this._primordials.forEach(type => {
      if (!document.getElementById(`circle-${type}`)) {
        this.spawn({ id: type, type, primordial: true, ...positions[type] });
      }
    });
  },

  spawn(opts = {}) {
    return null;
    const id = opts.id || `circle-${this._nextId++}`;
    if (this._circles.has(id)) return this._circles.get(id);

    const circle = document.createElement('div');
    circle.id = `circle-${id}`;
    circle.className = `celestial-circle ${opts.type || 'view'}`;
    circle.style.width = opts.size || '240px';
    circle.style.height = opts.size || '240px';
    if (opts.left) circle.style.left = opts.left;
    if (opts.right) circle.style.right = opts.right;
    if (opts.top) circle.style.top = opts.top;
    if (opts.bottom) circle.style.bottom = opts.bottom;
    if (opts.transform) circle.style.transform = opts.transform;

    const header = document.createElement('div');
    header.className = 'circle-header';
    header.innerHTML = `<span>${opts.title || id}</span><div class="circle-close">×</div>`;
    header.querySelector('.circle-close').onclick = (e) => { e.stopPropagation(); this.destroy(id); };

    const content = document.createElement('div');
    content.className = 'circle-content';
    if (opts.content) content.innerHTML = opts.content;

    const rim = document.createElement('div');
    rim.className = 'circle-rim';

    circle.appendChild(header);
    circle.appendChild(content);
    circle.appendChild(rim);

    document.body.appendChild(circle);
    this._circles.set(id, { el: circle, content, opts });

    this._makeDraggable(circle, id);
    this._makePinchable(circle, id);
    this._makeScrollable(content);

    if (opts.primordial) circle.classList.add('primordial');

    // Restore position from storage
    try {
      const saved = localStorage.getItem(`av_circle_pos_${id}`);
      if (saved) {
        const p = JSON.parse(saved);
        circle.style.left = p.left || '';
        circle.style.top = p.top || '';
        circle.style.right = p.right || '';
        circle.style.bottom = p.bottom || '';
      }
    } catch (_) {}

    return { id, el: circle, content };
  },

  _makeDraggable(circle, id) {
    let dragging = false;
    let sx = 0, sy = 0;

    const onMove = (clientX, clientY) => {
      if (!dragging) return;
      const dx = clientX - sx;
      const dy = clientY - sy;
      circle.style.left = (parseFloat(circle.style.left || 0) + dx) + 'px';
      circle.style.top = (parseFloat(circle.style.top || 0) + dy) + 'px';
      circle.style.right = '';
      circle.style.bottom = '';
      sx = clientX; sy = clientY;
    };

    circle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.circle-content, .circle-close')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      circle.style.transition = 'none';
    });

    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => {
      if (dragging) {
        dragging = false;
        circle.style.transition = '';
        this._savePos(id, circle);
      }
    });

    // Touch
    circle.addEventListener('touchstart', (e) => {
      if (e.target.closest('.circle-content, .circle-close')) return;
      dragging = true;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });

    circle.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }, { passive: false });

    circle.addEventListener('touchend', () => {
      if (dragging) {
        dragging = false;
        this._savePos(id, circle);
      }
    });

    // Long-press on rim/header to pin (per specs)
    let pressTimer = null;
    const rimOrHeader = circle.querySelector('.circle-rim') || header;
    const startPress = (e) => {
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        circle.classList.toggle('pinned');
        this._savePos(id, circle);
        console.log('[Circles] long-press pin toggle', id, circle.classList.contains('pinned'));
      }, 650);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    rimOrHeader.addEventListener('mousedown', startPress);
    rimOrHeader.addEventListener('mouseup', cancelPress);
    rimOrHeader.addEventListener('mouseleave', cancelPress);
    rimOrHeader.addEventListener('touchstart', startPress, { passive: true });
    rimOrHeader.addEventListener('touchend', cancelPress);
    rimOrHeader.addEventListener('touchcancel', cancelPress);
  },

  _makePinchable(circle, id) {
    let startDist = 0;
    let startSize = 0;

    const getDist = (t1, t2) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    circle.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        startDist = getDist(e.touches[0], e.touches[1]);
        startSize = parseFloat(circle.style.width) || 240;
      }
    }, { passive: true });

    circle.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2) return;
      const dist = getDist(e.touches[0], e.touches[1]);
      const scale = dist / startDist;
      let newSize = Math.max(120, Math.min(520, startSize * scale));
      circle.style.width = newSize + 'px';
      circle.style.height = newSize + 'px';
      e.preventDefault();
    }, { passive: false });
  },

  _makeScrollable(content) {
    // Basic scroll with arc indicator (simplified)
    const updateArc = () => {
      // Could enhance with dynamic arc, but radial mask handles most
    };
    content.addEventListener('scroll', updateArc);
  },

  _savePos(id, circle) {
    try {
      const pos = {
        left: circle.style.left,
        top: circle.style.top,
        right: circle.style.right,
        bottom: circle.style.bottom
      };
      localStorage.setItem(`av_circle_pos_${id}`, JSON.stringify(pos));
    } catch (_) {}
  },

  destroy(id) {
    const c = this._circles.get(id);
    if (c && c.el && !c.el.classList.contains('primordial')) {
      c.el.remove();
      this._circles.delete(id);
    }
  },

  _collapseAllNonPinned() {
    this._circles.forEach((c, id) => {
      if (!c.el.classList.contains('primordial') && !c.el.classList.contains('pinned')) {
        this.destroy(id);
      }
    });
  },

  get(id) {
    return this._circles.get(id);
  },

  // Helper to put content into a View circle (recommended for chat/menus/etc)
  showView(title, html) {
    const text = (title ? title + ' — ' : '') + String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) {
      GlobeDeck?.expand?.();
      GlobeDeck?.log?.(text, 'out');
      GlobeDeck?.setPreview?.(text.slice(0, 120));
    }
    return null;
  },

  // Monitor: add complaint sender for usage/complaints from web app
  addComplaintButton(circleEl, context) {
    if (!circleEl) return;
    const body = circleEl.querySelector('.circle-content') || circleEl.querySelector('.cc-body');
    if (!body) return;
    const btn = document.createElement('button');
    btn.textContent = 'Report issue / complaint';
    btn.style.cssText = 'margin-top:8px;padding:4px 8px;font-size:10px;background:rgba(200,50,50,0.3);border:1px solid #f66;color:#f66;cursor:pointer';
    btn.onclick = () => {
      const detail = prompt('Describe the complaint/usage issue:', context || 'UI or feature problem');
      if (detail) {
        if (window.fetch) {
          fetch('https://lkoatrkhuigdolnjsbie.supabase.co/functions/v1/debug-write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2F0cmtodWlnZG9sbmpzYmllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODIwOTIsImV4cCI6MjA5NDQ1ODA5Mn0.qf6Kg93YLJ0coTdVQa4baU0ppOdFY5WkmVzMvEV6ejI' },
            body: JSON.stringify({ type: 'user_complaint', detail, context, ts: Date.now(), session: window._sessionId || 'web' })
          }).then(() => alert('Complaint sent for monitoring.')).catch(() => {});
        }
      }
    };
    body.appendChild(btn);
  }
};

window.Circles = Circles;

// Circles.init() called from boot — no duplicate auto-init

function applyGlobalBootView() {
  GlobeNavigate.mode = 'global';
  GlobeNavigate._cityUnlocked = false;
  if (camera) {
    camera.position.set(0, 0, GlobeNavigate.GLOBAL_Z);
    camera.lookAt(0, 0, 0);
  }
  if (globePivot) {
    globePivot.rotation.y = 0;
    globePivot.rotation.x = 0.12;
    syncGlobePivotRotation?.();
    globePivot.visible = true;
  }
  CosmicZoom.level = 'earth';
  if (CosmicZoom?.solarGroup) CosmicZoom.solarGroup.visible = false;
  if (CosmicZoom?.galaxyPts) CosmicZoom.galaxyPts.visible = false;
  ZoomTiers?.goTo?.('global', false);
  CosmicZoom?.update?.(GlobeNavigate.GLOBAL_Z, { tier: 'global', label: 'GLOBAL', cosmic: 'earth' });
  cityLevel = false;
  const zl = document.getElementById('zoom-label');
  if (zl) zl.textContent = 'GLOBAL';
  GlobeNavigate?._syncChip?.();
}
window.applyGlobalBootView = applyGlobalBootView;

function animate() {
  requestAnimationFrame(animate);
  if (window._cycleTurbo) return;
  if (!renderer || !scene || !camera) return;
  SlumberManager?.tickFrame?.();
  window._animFrame = (window._animFrame + 1) | 0;
  const frame = window._animFrame;
  if (frame === 1) {
    window.SpaceNetLoader?.dismiss?.('frame');
    window._snlForceDismiss?.();
  }
  const hidden = document.hidden;
  if (!drag && !window._globeFly) TrackballGuard?.applyInertia?.();
  GlobeZoom?.tick?.();
  tickGlobeFly?.();
  MarketplaceDeliveryEngine?.tick?.();
  if (hidden && frame % 30 !== 0) {
    renderer.render(scene, camera);
    return;
  }

  const camZ = camera?.position?.z ?? 2.55;
  const level = CosmicZoom?.level || 'earth';
  const earthView = (level === 'earth' || level === 'orbit') && camZ < 4.8;
  const solarView = level === 'system' || level === 'galaxy' || camZ > 5.5;

  const voiceActive = window._handsFreeVoice || isListening;
  const codersBusy = window.AciCoders?._cliBusy || window.AciCoders?._listenBusy;
  if (voiceActive || codersBusy || GlobeDeck?.thinking) setVoicePerfMode?.(true);
  else if (window._voicePerfMode) setVoicePerfMode?.(false);

  if (frame % _slumberDiv('orbital') === 0) window.updateOrbital?.();

  if (!hidden && frame % _slumberDiv('entity') === 0) {
    MapDepict?.tick?.();
    if (SlumberManager?.allows?.('entities')) GlobeEntity?.tick?.();
  }

  if (solarView && frame % _slumberDiv('cosmic') === 0) CosmicZoom.update(camZ);
  else if (frame % Math.max(_slumberDiv('cosmic'), 8) === 0) CosmicZoom.update(camZ);

  if (earthView && frame % Math.max(_slumberDiv('earth'), 2) === 0) AIGraphics?.update?.();
  if (earthView && frame % _slumberDiv('earth') === 0) EarthRealism?.tick?.();
  if (earthView && frame % _slumberDiv('celestial') === 0 && SlumberManager?.allows?.('celestial')) {
    window.CelestialNav?.tick?.();
  }
  if (frame % Math.max(_slumberDiv('entity'), 4) === 0) BrainNeurons?.tick?.();
  renderer.render(scene, camera);
}

function _astranovBoot() {
  window._bootAt = Date.now();
  window._bootEarthLock = true;
  window._snlForceDismiss?.();
  SpaceNetLoader?.dismiss?.('boot');
  GlobeDeck?.setThinking?.(false);
  CliRibbon?.clearNotice?.();

  const run = (fn) => { try { fn(); } catch (e) { console.error('[boot]', e); } };

  run(() => initUser());
  run(() => SlumberManager.init());
  run(() => TrackballGuard.init());
  run(() => Auth.init());
  run(() => GlobeDeck.init());
  run(() => GlobeDeck.bootCollapsed?.());
  run(() => SuperCli.init());
  run(() => SessionHold.init());
  run(() => AciCli.init());
  run(() => ACIControl.init());
  run(() => ACI.init());
  run(() => CosmicZoom.init());
  run(() => ZoomTiers.init());
  run(() => GlobeNavigate.init());
  run(() => EarthRealism.init());
  applyGlobalBootView();
  run(() => AstranovTheme.init());
  run(() => AiGlyphs.init());
  run(() => AstranovLogo.init());
  run(() => CityMap.init());
  run(() => GlobeEntity.init());
  run(() => MapPins.init());
  run(() => MapOverlayDismiss.init());
  run(() => window.SpaceNetFleet?.init?.());
  run(() => window.SpaceNetResourceMonitor?.init?.());
  run(() => CityLife.init());
  run(() => VendorMapTile.init());
  run(() => ClassifiedTriangles.init());
  run(() => MarketplaceDeliveryEngine.init());
  run(() => FieldWork.init());
  run(() => SpaceNetCycle.init());
  run(() => DrivingView.init());
  run(() => AiRouter.init());
  run(() => MissionSupportReporter.init());
  LazyModules.schedule();
  applyGlobalBootView();

  GlobeDeck?.setPreview?.('SpaceNet live · drag globe to explore');
  CliRibbon?.setActive?.('CLI');
  const board = document.getElementById('coders-race-board');
  if (board && /checking teams/i.test(board.textContent || '')) board.textContent = 'SpaceNet ready';

  window._bootEarthLock = false;
  void SpaceNetScenarioRunner?.runAll?.('boot');
  ACIControl?.reply?.(SpaceNetMission?.bootReply || 'SpaceNet live · collective intelligence links all · scroll out → solar · galaxy');
  primeGrokVoice?.();

  setTimeout(() => Auth.refreshAuthority(), 400);
  setTimeout(() => AciCoders?.enterSession?.({ ping: false, focus: false }), 1200);
  setTimeout(() => { try { Voice.init(); initVoice(); } catch (_) {} }, 0);
  setTimeout(() => { try { Circles.init(); } catch (_) {} }, 0);
  setTimeout(() => { void BrainNeurons?.boot?.(); }, 0);
}

const host = location.hostname || '';
const isOfficial = host === 'astranov.eu' || host.endsWith('.astranov.eu');
const isLocal = host === '' || host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';
if (host && !isOfficial && !isLocal) {
  document.body.innerHTML = '<div style="color:#444;padding:40px;text-align:center;font-family:sans-serif">Available only on authorized Astranov domains</div>';
} else {
  if (renderer && scene && camera) {
    window._animateStarted = true;
    animate();
  }
  setTimeout(function() {
    try { _astranovBoot(); } catch (e) { console.error('[Astranov boot]', e); }
  }, 0);
}