// === LIGHT STUBS — removed heavy subsystems; keep optional chaining safe ===
// Classic scripts: bare `Foo?.x` throws ReferenceError if Foo is undeclared.
// Provide lexical + window bindings for every symbol used before its real module loads.

// sessionHeld + SessionHold stubs
var sessionHeld = false;
window.sessionHeld = false;
window.SessionHold = window.SessionHold || {
  isHeld() { return !!window.sessionHeld; },
  hold() { window.sessionHeld = true; sessionHeld = true; },
  resume() { window.sessionHeld = false; sessionHeld = false; },
  toggle() { if (this.isHeld()) this.resume(); else this.hold(); },
  release() { this.resume(); },
  clearForeignHold() {},
  init() {},
};
var SessionHold = window.SessionHold;

// Supabase identity — required by Auth in app phase (real ACI in deferred overwrites window)
var ACI = window.ACI || {
  name: 'Astranov',
  url: 'https://lkoatrkhuigdolnjsbie.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxrb2F0cmtodWlnZG9sbmpzYmllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4ODIwOTIsImV4cCI6MjA5NDQ1ODA5Mn0.qf6Kg93YLJ0coTdVQa4baU0ppOdFY5WkmVzMvEV6ejI',
};
window.ACI = ACI;
var SB_URL = window.SB_URL || ACI.url;
var SB_KEY = window.SB_KEY || ACI.key;
window.SB_URL = SB_URL;
window.SB_KEY = SB_KEY;

// ACIControl stub — reply routes to deck/ribbon until deferred 20-aci.js loads
window.ACIControl = window.ACIControl || {
  init() {},
  reply(text) {
    const msg = String(text || '').slice(0, 280);
    if (!msg) return;
    try { GlobeDeck?.say?.(msg, 'reply'); } catch (_) {}
    try { CliRibbon?.setNotice?.(msg.slice(0, 120), 'info'); } catch (_) {}
    try { AciCli?.print?.(msg, 'ok'); } catch (_) {}
  },
  voiceAck() {},
  async handle() { return { executed: false }; },
};
var ACIControl = window.ACIControl;

// AppShortcuts stub — real module is in features phase; app boot touches it early
window.AppShortcuts = window.AppShortcuts || {
  _order: [],
  _labels: {},
  APPS: {},
  init() {},
  render() {},
  track() {},
  untrack() {},
  rememberSite() {},
  switch() {},
  close() {},
};
var AppShortcuts = window.AppShortcuts;

// CityMap stub — animate() in critical touches it before app phase defines the real map
window.CityMap = window.CityMap || { active: false, init() {}, show() {}, hide() {} };
var CityMap = window.CityMap;

// Coders / CLI modules often touch these before deferred loads
window.AciCoders = window.AciCoders || {
  engine: 'grok',
  init() {},
  observeActivity() {},
  handleMessage: async () => null,
  enterSession: async () => null,
  setEngine() {},
  toggleEngine() {},
};
var AciCoders = window.AciCoders;

// Architect bridge — deferred real module; app auth/CLI touches it early
window.ArchitectBridge = window.ArchitectBridge || {
  armed: false,
  lastTaskId: null,
  isActive() { return !!(window.Auth?.isArchitect); },
  arm() {},
  disarm() {},
  openQuickFix() {},
  wantsBridgeCmd() { return false; },
  handleCommand: async () => null,
  queueBuildFromChat: async () => null,
  _bindUi() {},
  init() {},
};
var ArchitectBridge = window.ArchitectBridge;

// PublicCopy: plain language for the public. SETI / mission-control tone = architect only.
const PublicCopy = {
  isArchitect() {
    return !!(window.Auth?.isArchitect || window.Auth?.isOwner);
  },
  deckTitle() {
    return this.isArchitect() ? 'Architect CLI' : 'Astranov';
  },
  tierLabel(id) {
    const map = {
      solar: 'Space', global: 'Earth', national: 'Country', regional: 'Region',
      city: 'City', neighborhood: 'Streets', orbit: 'Above Earth',
      system: 'Solar system', galaxy: 'Stars',
    };
    return map[id] || id || 'Earth';
  },
  zoomLine(tierId, extra) {
    const base = {
      solar: 'Space · zoom in for Earth',
      global: 'Earth · drag · scroll for country · tap city',
      national: 'Country · choose a city below or tap map',
      regional: 'Region · choose a city',
      city: 'City · streets · shops · tasks',
      neighborhood: 'Streets · look around',
      orbit: 'Above Earth',
      system: 'Solar system · zoom in',
      galaxy: 'Stars · zoom in',
    };
    let line = base[tierId] || 'Earth · drag to explore';
    if (extra) line += ' · ' + extra;
    return line;
  },
  readyNotice() {
    return this.isArchitect()
      ? 'Architect online · Bridge ready'
      : 'Ready · drag Earth · 🎯 city · 🎧 chat · + post';
  },
  coachHtml() {
    if (this.isArchitect()) {
      return '<strong>Architect</strong><ol>'
        + '<li>Drag Earth · 🎯 locate · 🎧 Grok</li>'
        + '<li>🛠 or say <em>fix …</em> / <em>code …</em></li>'
        + '<li>task job / date / order — City DNA</li></ol>';
    }
    return '<strong>Welcome to Astranov</strong><ol>'
      + '<li>Drag to spin Earth · pinch to zoom</li>'
      + '<li>🎯 Locate — your city on the map</li>'
      + '<li>🎧 Chat · type below · + to post, shop, date, or hire</li>'
      + '<li>Order food · post a date · hire a barman — as easy as pizza</li></ol>';
  },
  inputPlaceholder() {
    return this.isArchitect()
      ? 'Architect — fix · code · task · starship…'
      : 'Ask Astranov — type or tap 🎧 · Enter to send';
  },
};
window.PublicCopy = PublicCopy;

// FieldBrain is a live pulse bus again (not a no-op) so globe AI feels present.
const FieldBrain = {
  vendorIds: [],
  roles: [],
  last: null,
  _pulses: [],
  init() {},
  hookFeed() {},
  pulse(kind, detail, props) {
    const entry = {
      kind: String(kind || 'pulse'),
      detail: String(detail || '').slice(0, 120),
      props: props || {},
      ts: Date.now(),
    };
    this.last = entry;
    this._pulses.push(entry);
    if (this._pulses.length > 40) this._pulses = this._pulses.slice(-40);
    try {
      AIGraphics?.setThinkPulse?.(kind === 'think' || kind === 'act');
      const pos = window._lastPos;
      if (pos && MapDepict?.pulse) {
        const colors = { think: 0x44ccff, act: 0x00e8ff, evolve: 0xaa66ff, commerce: 0xffaa44 };
        MapDepict.pulse(pos.lat, pos.lng, colors[kind] || 0x66ffcc, entry.detail.slice(0, 28), 5000);
      }
      CliRibbon?.setNotice?.(entry.kind + ' · ' + entry.detail.slice(0, 60), 'ready');
    } catch (_) { /* */ }
  },
  async claimDelivery(orderId) {
    CityTasks?.init?.();
    return CityTasks?.claim?.(orderId);
  },
  createCityTask(spec) {
    CityTasks?.init?.();
    return CityTasks?.create?.(spec);
  },
  listCityTasks(filter) {
    CityTasks?.init?.();
    return CityTasks?.list?.(filter) || [];
  },
  postJob(spec) {
    CityTasks?.init?.();
    return CityTasks?.postJob?.(spec);
  },
  postDate(spec) {
    CityTasks?.init?.();
    return CityTasks?.postDate?.(spec);
  },
  postErrand(spec) {
    CityTasks?.init?.();
    return CityTasks?.postErrand?.(spec);
  },
  completeDelivery(id) {
    CityTasks?.init?.();
    return CityTasks?.complete?.(id);
  },
  onAuth() {},
  updateChip() {},
};
window.FieldBrain = FieldBrain;

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
    if (window.AstranovCoreBrain?.handle) {
      const r = await AstranovCoreBrain.handle(m, { fromVoice: !!opts.fromVoice });
      return String(r?.text || r?.response || '').trim();
    }
    if (window.AciCoders?.chat) {
      const r = await AciCoders.chat(m, { fromVoice: !!opts.fromVoice });
      return String(r?.text || r?.response || '').trim();
    }
    return '';
  },
  async cli(parts) {
    const rest = (parts || []).slice(1).join(' ').trim();
    if (!rest || rest === 'status') {
      AciCli?.print('Core Brain ' + (AstranovCoreBrain?.version || '?') + ' · local-first globe agent', 'ok');
      return;
    }
    await this.converse(rest);
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

const AuditorPortal = { syncGlobe() {} };
window.AuditorPortal = AuditorPortal;

const CoinsJustice = { loadConstitution() {}, syncGlobe() {} };
window.AvcJustice = CoinsJustice;

// Marketplace delivery — real engine lives in legacy monolith; keep lexical-safe stub
// so classic `MarketplaceDeliveryEngine?.x` never throws ReferenceError.
var MarketplaceDeliveryEngine = window.MarketplaceDeliveryEngine || {
  missions: [],
  STATUS: {},
  _globeMeshes: [],
  init() {},
  tick() {},
  closeHud() {},
  showHud() {},
  pickFromGlobeHit() { return false; },
  async onDriverAccepted() { return null; },
};
window.MarketplaceDeliveryEngine = MarketplaceDeliveryEngine;

// Globe entities — real module in features (const GlobeEntity).
// Only attach window stub — do NOT `var GlobeEntity` (collides with features const).
if (!window.GlobeEntity) {
  window.GlobeEntity = {
    register() {},
    remove() {},
    clear() {},
    tick() {},
    init() {},
  };
}

const CoinPortal = { syncGlobe() {} };
window.CoinPortal = CoinPortal;

const AstranovUnified = { syncGlobe() {}, async cli() { ACIControl?.reply('Unified platform — use order · locate · profile'); } };
window.AstranovUnified = AstranovUnified;

const AstranovOneDatabase = { async cli() {} };
window.AstranovOneDatabase = AstranovOneDatabase;

const SuperSpace = {
  init() { try { GlobeInfoTiles?.init?.(); } catch (_) {} },
  tick() {},
  stop() {},
  status() {
    try { return { tiles: GlobeInfoTiles?.count?.() || 0 }; } catch (_) { return {}; }
  },
  async locateForMedia(q, meta) {
    try {
      GlobeInfoTiles?.init?.();
      return await GlobeInfoTiles?.pinVideoFromMeta?.(q, meta);
    } catch (_) { return null; }
  },
  async locateText(t) {
    try {
      GlobeInfoTiles?.init?.();
      return await GlobeInfoTiles?.pinInfoFromQuery?.(t);
    } catch (_) { return null; }
  },
  zoomTo(level) {
    try { GlobeInfoTiles?.init?.(); SuperSpace.zoomTo = undefined; } catch (_) {}
    if (level === 'orbit' || level === 'space') {
      if (typeof camera !== 'undefined' && camera?.position) {
        window._globeFly = {
          mode: 'zoom', fromZ: camera.position.z, toZ: 5.05,
          t0: performance.now(), dur: 1200,
        };
      }
      if (window.CosmicZoom) CosmicZoom.level = 'orbit';
    }
  },
};
window.SuperSpace = SuperSpace;

const GlobeAutonomy = { init() {} };
window.GlobeAutonomy = GlobeAutonomy;

function _haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  async loadVendors() { await LazyModules.ensure(); },
  initUI() {},
  async showPicker() { await LazyModules.ensure(); return window.Commerce?.showPicker?.(); },
  async openOrderFlow(q) { await LazyModules.ensure(); return window.Commerce?.openOrderFlow?.(q); },
  async smartOrder(q) { await LazyModules.ensure(); return window.Commerce?.smartOrder?.(q); },
  showMenu() { LazyModules.ensure().then(() => window.Commerce?.showMenu?.()); },
  openVendor() {},
  renderCart() {},
  async fetchNearbyDrivers() { return []; },
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
window.DrivingView = { active: false, destination: null, routeCoords: [], fetchRoadRoute() { return Promise.resolve(); }, drawRoute() {}, activate() { return _defer('DrivingView', 'activate'); } };
window.Comms = {
  vhfActive: false,
  startVHF() { return _defer('Comms', 'startVHF'); },
  startPhone() { return _defer('Comms', 'startPhone'); },
  startTelecomms() { return _defer('Comms', 'startTelecomms'); },
};
window.NewsFeed = { flash() { return _defer('NewsFeed', 'flash'); } };
window.AstranovNode = { launchBatch() { return _defer('AstranovNode', 'launchBatch'); } };
window.SuperAdd = {
  open() { return _defer('SuperAdd', 'open'); },
  init() { return _defer('SuperAdd', 'init'); },
  hide() { return _defer('SuperAdd', 'hide'); },
};
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
window.DeliveryPricing = { quote() { return null; } };
window.GoogleWalletPay = { pay() { return Promise.resolve(); } };
window.AciConnect = { open() { return _defer('AciConnect', 'open'); } };
