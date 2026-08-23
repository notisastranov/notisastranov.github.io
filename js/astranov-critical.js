/* === 00-globe.js === */
// Globe host — must exist before WebGL. Never leave user with CLI-only black stage.
let container = document.getElementById('globe');
if (!container && document.body) {
  container = document.createElement('div');
  container.id = 'globe';
  document.body.insertBefore(container, document.body.firstChild);
}
if (!container) {
  // Script in <head> before body: defer mesh until DOM ready is not an option — body end boot only
  console.error('[globe] #globe missing — ensure scripts run after <div id="globe">');
}
// Ensure canvas layer is visible above void, under UI chrome
try {
  if (container) {
    container.style.position = 'absolute';
    container.style.inset = '0';
    container.style.zIndex = '2';
    container.style.touchAction = 'none';
    container.style.background = '#000';
    container.classList.remove('city-map-active', 'national-map-active');
  }
  document.body?.classList?.remove?.('site-shell-open');
} catch (_) {}

// Error guard — do NOT spam fatal red bars for soft refs; only real render killers
/* error → CLI via phase-critical sink */

// Mobile / low-power first — never wait for SlumberManager probe
window._isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  || ((navigator.maxTouchPoints || 0) > 1 && window.innerWidth < 960);
window._globePerfLite = !!window._isMobileUA || window.innerWidth < 700;

let renderer;
try {
  const _mobile = !!window._globePerfLite;
  renderer = new THREE.WebGLRenderer({
    antialias: !_mobile,
    alpha: true,
    powerPreference: _mobile ? 'low-power' : 'high-performance',
  });
  renderer.setClearColor(0x000000, 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Cap DPR hard on phone — biggest responsiveness win
  const _dprCap = window.SlumberManager?.quality?.pixelRatio
    ?? (_mobile ? 0.85 : 1.15);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, _dprCap));
  if (!_mobile && THREE.ACESFilmicToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
  }
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  window.renderer = renderer;
  container.appendChild(renderer.domElement);
} catch (e) {
  const fb = document.createElement('div');
  fb.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#0af;font:15px system-ui;background:#000;z-index:10;text-align:center;';
  fb.innerHTML = 'WebGL unavailable.<br>Update browser or enable hardware acceleration.<br><small>Astranov globe needs WebGL</small>';
  container.appendChild(fb);
  throw e;
}

// Hoisted top-level mutable state (must be declared BEFORE any top-level calls like initVoice/initUser)
let drag = false, px = 0, py = 0;
let dragging = false;
let idleRoll = 0;
let globePivot;
let trackVelX = 0, trackVelY = 0;
let cityLevel = false;
let voiceEnabled = false;
let voiceSessionActive = false;
let isListening = false;
let recognition;
// Use var (not let) so later classic scripts can assign without global-lexical clashes
var userLocated = false;
window.userLocated = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
window.scene = scene;

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 1000);
// Start pulled back so full Earth + stars read as a real planet, not a blue ball in your face
const START_CAM_Z = 3.65;
camera.position.set(0, 0.18, START_CAM_Z);
camera.lookAt(0, 0, 0);
window.camera = camera;
window.START_CAM_Z = START_CAM_Z;

// Lighting — sun key + cool rim so continents read when texture loads
scene.add(new THREE.AmbientLight(0x1a2838, 0.42));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.95);
sun.position.set(5.2, 2.4, 3.6);
scene.add(sun);
window.sun = sun;
const rimLight = new THREE.DirectionalLight(0x4488ff, window._globePerfLite ? 0.4 : 0.65);
rimLight.position.set(-4, -1, -3);
scene.add(rimLight);
if (!window._globePerfLite) {
  const fillLight = new THREE.PointLight(0x66aaff, 0.4, 14);
  fillLight.position.set(-2, 1.5, 3);
  scene.add(fillLight);
}

// Starfield — lite on phone (thousands of additive points = jank)
(function buildAstranovStarfield() {
  const lite = !!window._globePerfLite;
  function layer(count, rMin, rMax, size, color, opacity) {
    const pos = [];
    for (let i = 0; i < count; i++) {
      const r = rMin + Math.random() * (rMax - rMin);
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos.push(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size, sizeAttenuation: true, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(geo, mat));
  }
  if (lite) {
    // Tiny starfield — first paint over jank
    layer(180, 80, 420, 0.55, 0xaaccff, 0.5);
    layer(40, 100, 700, 1.1, 0xffffff, 0.8);
  } else {
    layer(1200, 80, 420, 0.35, 0xaaccff, 0.55);
    layer(400, 100, 700, 0.9, 0xffffff, 0.85);
    layer(60, 120, 900, 2.2, 0xcce8ff, 0.95);
  }
})();

// Earth — real NASA/three.js texture ASAP (solid blue = last resort only)
const earthMat = new THREE.MeshPhongMaterial({
  color: 0x1a4a7a,
  emissive: 0x020810,
  specular: 0x224466,
  shininess: 22,
  flatShading: false,
});
window.earthMat = earthMat;
// Primary + mirrors — texture must land or globe looks fake
const EARTH_TEX_CANDIDATES = [
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg',
  'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
  'https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/textures/planets/earth_atmos_2048.jpg',
];
const _applyEarthTex = (tex) => {
  try {
    tex.anisotropy = Math.min(window._globePerfLite ? 2 : 8, renderer.capabilities?.getMaxAnisotropy?.() || 4);
    if (window._globePerfLite) {
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
    }
    earthMat.map = tex;
    earthMat.color.set(0xffffff);
    earthMat.emissive?.set?.(0x020810);
    earthMat.needsUpdate = true;
    window._earthTexReady = true;
  } catch (_) {}
};
const _loadEarthTex = (idx) => {
  const i = idx || 0;
  if (i >= EARTH_TEX_CANDIDATES.length) {
    console.warn('[globe] Earth texture failed — solid fallback');
    return;
  }
  try {
    new THREE.TextureLoader().load(
      EARTH_TEX_CANDIDATES[i],
      _applyEarthTex,
      undefined,
      () => _loadEarthTex(i + 1)
    );
  } catch (_) {
    _loadEarthTex(i + 1);
  }
};
// Load immediately — delayed load left people staring at a fake blue ball
_loadEarthTex(0);
if (window._globePerfLite) setTimeout(() => { if (!window._earthTexReady) _loadEarthTex(0); }, 1200);

globePivot = new THREE.Group();
scene.add(globePivot);

const earthSeg = window._globePerfLite ? 32 : 64;
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, earthSeg, earthSeg), earthMat);
globePivot.add(earth);
window.earth = earth;

// Soft atmosphere shell — lighter on phone
(function bootAtmosphere() {
  if (window._globePerfLite) return; // skip atmo mesh on lite — pure fill cost
  const atmoSeg = earthSeg;
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.035, atmoSeg, atmoSeg),
    new THREE.MeshBasicMaterial({
      color: 0x3a9fff,
      transparent: true,
      opacity: 0.09,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  atmo.userData = { type: 'boot-atmosphere' };
  globePivot.add(atmo);
})();
globePivot.rotation.y = 0.82;
globePivot.rotation.x = 0.12;
globePivot.quaternion.setFromEuler(globePivot.rotation, 'YXZ');
window.earth = earth;

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

  Z: { global: 3.65, national: 2.05, regional: 1.72, city: 1.42 },

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
    if (window._lastPos?.lat != null && window._lastPos?.lng != null) {
      return CityLife?.dropIn?.(window._lastPos.lat, window._lastPos.lng, opts || {});
    }
    if (navigator.geolocation && CityLife?.locateAndDropIn) {
      try {
        return await CityLife.locateAndDropIn();
      } catch (e) {
        const msg = 'Location denied — enable GPS to open your city map';
        if (typeof _gpsDeniedUi === 'function') _gpsDeniedUi(msg);
        else {
          ACIControl?.reply?.(msg);
          AciCli?.print?.(msg, 'err');
        }
        return { error: 'gps_denied', message: String(e?.message || e) };
      }
    }
    const msg = 'No location yet — tap 🎯 Locate and allow GPS';
    if (typeof _gpsDeniedUi === 'function') _gpsDeniedUi(msg);
    else ACIControl?.reply?.(msg);
    return { error: 'no_location', message: msg };
  },
};
window.GlobeControl = GlobeControl;

async function enterCityView(lat, lng, opts) {
  return GlobeControl.enterCity(lat, lng, opts);
}
window.enterCityView = enterCityView;

/* === 07-light-stubs.js === */
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

/* === 02-lazy-modules.js === */
// === LAZY MODULES — multi-file deferred pack after core phases ===
const LazyModules = {
  _promise: null,
  _loaded: false,

  schedule() {
    const lite = !!window._globePerfLite;
    const delay = lite
      ? Math.max(window.SlumberManager?.deferredDelay?.() || 6000, 6500)
      : Math.max(window.SlumberManager?.deferredDelay?.() || 2200, 2200);
    const run = () => {
      if (window._lazyUserReady || !lite) this.ensure().catch(() => {});
      else {
        const once = () => {
          window._lazyUserReady = true;
          window.removeEventListener('pointerdown', once);
          window.removeEventListener('touchstart', once);
          this.ensure().catch(() => {});
        };
        window.addEventListener('pointerdown', once, { once: true, passive: true });
        window.addEventListener('touchstart', once, { once: true, passive: true });
        setTimeout(() => this.ensure().catch(() => {}), delay + 4000);
      }
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: delay });
    } else {
      setTimeout(run, delay);
    }
  },

  async _loadMultiFile() {
    // Prefer explicit full URLs from loader (root astranov-deferred.js works on CF)
    const urls = window.__ASTRANOV_DEFERRED_URLS__;
    if (urls?.length) {
      await Promise.all(urls.map(src => new Promise((resolve, reject) => {
        if (document.querySelector('script[data-astranov-src="' + src + '"][data-loaded="1"]')) {
          resolve();
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.dataset.astranovSrc = src;
        s.onload = () => { s.dataset.loaded = '1'; resolve(); };
        s.onerror = () => reject(new Error('deferred fail ' + src));
        document.head.appendChild(s);
      })));
      return;
    }
    // Legacy single pack
    return this._loadLegacyBundle();
  },

  _loadLegacyBundle() {
    const build = document.querySelector('meta[name="astranov-build"]')?.content || '';
    const src = '/astranov-deferred.js' + (build ? '?v=' + encodeURIComponent(build) : '');
    return new Promise((resolve, reject) => {
      const tag = document.querySelector('script[data-astranov-deferred]');
      if (tag) {
        if (tag.dataset.loaded === '1' || window.DeferredBoot) return resolve();
        tag.addEventListener('load', () => { tag.dataset.loaded = '1'; resolve(); }, { once: true });
        tag.addEventListener('error', () => reject(new Error('deferred script failed')), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.dataset.astranovDeferred = '1';
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = () => reject(new Error('deferred script failed'));
      document.head.appendChild(s);
    });
  },

  load() {
    if (window._deferredBootDone) {
      this._loaded = true;
      return Promise.resolve();
    }
    if (this._loaded) return Promise.resolve();
    if (this._promise) return this._promise;

    this._promise = this._loadMultiFile()
      .then(() => { this._loaded = true; })
      .catch((err) => {
        this._promise = null;
        throw err;
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

  whenReady(fn) {
    if (window._deferredBootDone) return Promise.resolve().then(() => fn?.());
    return this.ensure().then(() => fn?.());
  },
};
window.LazyModules = LazyModules;

/* === 03-slumber-manager.js === */
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
      pixelRatio: 0.75,
      earthHd: false,
      earthTickMs: 750,
      entityTickMs: 640,
      newsIntervalMs: 60000,
      newsMax: 2,
      cityMaxZoom: 16,
      cityDriverMs: 14000,
      deferredDelayMs: 4800,
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
    // Phone = conserve by default (responsiveness > cinema)
    if (p.mobile || window._globePerfLite) {
      if (p.lowEndGpu || p.slowNet || p.saveData || p.cores <= 4) return 'slumber';
      return 'conserve';
    }
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
    if (score >= 6) return 'gaming';
    if (score >= 4) return 'full';
    if (score >= 2) return 'balanced';
    if (score >= 0) return 'conserve';
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
    if (this._fpsSamples.length >= 24 && !this._userPinned) this._maybeDowngrade();
  },

  _avgFps() {
    if (!this._fpsSamples.length) return 60;
    return this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
  },

  _maybeDowngrade() {
    const fps = this._avgFps();
    const order = ['full', 'balanced', 'conserve', 'slumber'];
    const idx = order.indexOf(this.tier);
    if (fps < 22 && idx < order.length - 1) {
      this.applyTier(order[idx + 1], `FPS ${fps.toFixed(0)} — easing load`);
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
    ACIControl?.reply?.('Slumber · ' + line + ' · say "slumber status" or "wake shops"');
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
// Defer heavy probe (extra WebGL context) until after first globe frames
if (typeof requestIdleCallback === 'function') {
  requestIdleCallback(() => { try { SlumberManager.init(); } catch (_) {} }, { timeout: 3500 });
} else {
  setTimeout(() => { try { SlumberManager.init(); } catch (_) {} }, 1200);
}

/* === 50-cosmic.js === */
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
    // TRUTH: no toy planets co-located with Earth (dist ~0.7–3 next to Earth radius=1 was a lie).
    // Solar system schematic removed. Earth is Earth. ISS only when live position known.
    this.solarGroup = new THREE.Group();
    this.solarGroup.visible = false;
    this.solarGroup.name = 'solar-disabled-truth';
    scene.add(this.solarGroup);
    this.planets = [];

    // Distant star points only (not planets) — abstract backdrop when zoomed far
    const gPos = [];
    const gCount = window._globePerfLite ? 120 : 280;
    for (let i = 0; i < gCount; i++) {
      const t = Math.random() * Math.PI * 2;
      const rad = 12 + Math.random() * 30;
      gPos.push(Math.cos(t) * rad, (Math.random() - 0.5) * 3, Math.sin(t) * rad);
    }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
    this.galaxyPts = new THREE.Points(
      gGeo,
      new THREE.PointsMaterial({ color: 0xaaccff, size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.3 })
    );
    this.galaxyPts.visible = false;
    scene.add(this.galaxyPts);

    // Sat group: real ISS marker only — no decorative LEO rings (fake shells)
    this.satGroup = new THREE.Group();
    this.satGroup.name = 'truth-orbit';
    globePivot.add(this.satGroup);
    this.leoRings = [];
    this.issOrbit = null;
    const iss = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc })
    );
    iss.userData = { type: 'iss', name: 'ISS', desc: 'International Space Station · live when tracked' };
    iss.visible = false; // only after live fix
    this.satGroup.add(iss);
    this.issMarker = iss;
    this.level = 'earth';
    this.setOrbitVisibility('earth');
    if (this.solarGroup) this.solarGroup.visible = false;
    if (this.galaxyPts) this.galaxyPts.visible = false;
    console.log('%c[CosmicZoom] truth mode — no fake planets around Earth', 'color:#00ddaa');
  },

  /** Do not draw fake mesh relays / toy orbits. Real sats = StarlinkConstellation / ISS API. */
  registerOrbitalSats(sats) {
    // Hide any legacy decorative sats so they never appear as planets
    if (sats?.length) {
      sats.forEach(sat => {
        if (sat) sat.visible = false;
      });
    }
    this._orbitalSats = [];
    if (this.meshRing) {
      this.meshRing.visible = false;
      this.meshRing = null;
    }
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
    // ~420 km altitude → shell ~1 + 420/6371 ≈ 1.066 (honest scale on Earth sphere)
    const ISS_ALT = 1.066;
    this._issTarget = { lat, lng, t: Date.now() };
    this._issLastFetch = Date.now();
    this.issMarker.userData.lat = lat;
    this.issMarker.userData.lng = lng;
    this.issMarker.userData.desc = 'ISS live ' + lat.toFixed(2) + '° ' + lng.toFixed(2) + '°';
    this.issMarker.visible = true;
    const p = latLngToPos(lat, lng, ISS_ALT);
    if (!this.issMarker.userData._placed) {
      this.issMarker.position.set(p.x, p.y, p.z);
      this.issMarker.userData._placed = true;
    }
    this.updateGuide(this.level, camera?.position?.z || 2.55);
  },

  _lerpIss() {
    if (!this.issMarker || this._issTarget?.lat == null) return;
    const tgt = latLngToPos(this._issTarget.lat, this._issTarget.lng, 1.066);
    const m = this.issMarker.position;
    m.x += (tgt.x - m.x) * 0.18;
    m.y += (tgt.y - m.y) * 0.18;
    m.z += (tgt.z - m.z) * 0.18;
  },

  updateGuide(level, camZ) {
    // Left rail = ResourceMonitor only. No planet/orbit essays.
    const el = document.getElementById('cosmic-guide');
    if (el) {
      el.innerHTML = '';
      el.style.display = 'none';
      el.hidden = true;
    }
  },

  setOrbitVisibility(level) {
    // No decorative LEO rings / solar toy planets
    this.leoRings.forEach(r => { if (r) r.visible = false; });
    this.orbitLines.forEach(line => { if (line) line.visible = false; });
    if (this.meshRing) this.meshRing.visible = false;
    if (this.solarGroup) this.solarGroup.visible = false;
    // ISS only when we have a live fix
    if (this.issMarker) {
      this.issMarker.visible = !!(this.issMarker.userData?.lat != null && (level === 'orbit' || level === 'earth'));
    }
  },

  update(camZ, opts) {
    opts = opts || {};
    if (window._cityDropLock && !opts.cosmic) {
      opts = Object.assign({}, opts, { cosmic: 'earth', tier: opts.tier || 'city', label: opts.label || 'CITY' });
    }
    let level = opts.cosmic === 'system' ? 'system' : opts.cosmic === 'galaxy' ? 'galaxy' : 'earth';
    let label = opts.label || 'GLOBAL';
    if (window._bootEarthLock && camZ < 6 && opts.cosmic !== 'system' && opts.cosmic !== 'galaxy') {
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
      const pc = window.PublicCopy;
      if (CityMap?.active) {
        const tier = window.ZoomTiers?.current?.();
        zl.textContent = (tier?.id === 'neighborhood' ? 'Streets' : 'City')
          + ' · map · shops · friends';
      } else if (CityMap?._nationalActive) {
        zl.textContent = 'Country · ' + (window.ZoomTiers?.countryHint?.() || '') + ' · pinch for city';
      } else if (pc?.zoomLine) {
        const tid = level === 'orbit' ? 'orbit' : level === 'system' ? 'system'
          : level === 'galaxy' ? 'galaxy' : (window.ZoomTiers?.current?.()?.id || 'global');
        zl.textContent = pc.zoomLine(tid);
      } else {
        zl.textContent = (pc?.tierLabel?.(level) || label || 'Earth');
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

    // Earth always real at origin — never overlay toy solar system on it
    globePivot.visible = true;
    if (this.solarGroup) this.solarGroup.visible = false;
    if (this.galaxyPts) this.galaxyPts.visible = level === 'galaxy' || level === 'system';
    if (this.satGroup) this.satGroup.visible = true;
    this._lerpIss();

    // Live ISS when looking at Earth / above Earth (not fake planets)
    if (level === 'earth' || level === 'orbit') {
      if (!this._issLastFetch || now - this._issLastFetch > 120000) this.trackISS();
      if (this.issMarker) {
        this.issMarker.visible = this.issMarker.userData?.lat != null && camZ < 8;
      }
    } else if (this.issMarker) {
      this.issMarker.visible = false;
    }

    // Never show legacy decorative sats
    if (this._orbitalSats?.length) {
      this._orbitalSats.forEach(s => { if (s) s.visible = false; });
    }

    // Starlink constellation dots disabled (truth — no fake LEO swarm)
  },
};
window.CosmicZoom = CosmicZoom;

/* === 09-zoom-tiers.js === */
// === ZOOM TIERS — solar → global → national → regional → city → neighborhood ===
const ZoomTiers = {
  TIERS: [
    { id: 'solar', z: 7.2, label: 'Space', cosmic: 'system' },
    // Start further out — 2.55 felt like a face-plant on the planet
    { id: 'global', z: 3.65, label: 'Earth', cosmic: 'earth' },
    { id: 'national', z: 2.05, label: 'Country', cosmic: 'earth', national: true },
    { id: 'regional', z: 1.72, label: 'Region', cosmic: 'earth', national: true },
    { id: 'city', z: 1.42, label: 'City', cosmic: 'earth', city: true },
    { id: 'neighborhood', z: 1.12, label: 'Streets', cosmic: 'earth', city: true },
  ],
  START_ID: 'global',
  _index: 0,
  _wheelAccum: 0,
  _pinchAccum: 0,
  WHEEL_THRESH: 28,
  PINCH_THRESH: 14,

  init() {
    const i = this.TIERS.findIndex(t => t.id === this.START_ID);
    this._index = i >= 0 ? i : 1;
    this.snap(false);
    this.updateDots();
  },

  countryHint() {
    const p = window._lastPos;
    if (!p?.lat) return 'tap 🎯 Locate';
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
      if (t.city && camZ > enterZ + 0.06) return;
      const d = Math.abs(t.z - camZ);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best === this._index) return false;
    this._index = best;
    if (animate) this.snap(true);
    else this._apply(this.current());
    return true;
  },

  updateDots() {
    const el = document.getElementById('zoom-tier-dots');
    if (!el) return;
    el.innerHTML = this.TIERS.map((t, i) => {
      const on = i === this._index ? ' on' : '';
      const solar = t.id === 'solar' ? ' ztd-solar' : '';
      return '<span class="ztd' + on + solar + '" data-tier="' + t.id + '" title="' + t.label + '"></span>';
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
    if (animate) {
      window._globeFly = {
        mode: 'zoom',
        fromZ: camera.position.z,
        toZ: t.z,
        t0: performance.now(),
        dur: 1400,
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
      const pc = window.PublicCopy;
      if (pc?.zoomLine) {
        const extra = tier.national ? this.countryHint() : '';
        zl.textContent = pc.zoomLine(tier.id, extra && extra !== 'region' ? extra : null);
      } else if (tier.id === 'solar') zl.textContent = 'Space · planets';
      else if (tier.id === 'global') zl.textContent = 'Earth · drag · 🎯 city · 🎧 chat';
      else if (tier.national) zl.textContent = 'Country · ' + this.countryHint() + ' · choose a city';
      else if (tier.city) zl.textContent = 'City · streets & shops';
      else zl.textContent = tier.label;
    }
    // City chips only belong in country airspace.
    if (!tier.national) CityPick?.hide?.();
    // Do not auto-pull bearing to GPS here — that stole country clicks away from the
    // tapped nation. 🎯 Locate / city-life own “go to my region”.
    this.updateDots();
    MapDepict?.setHud?.(tier.label, 'zoom-tier');
  },

  tierZ(id) {
    const t = this.TIERS.find(x => x.id === id);
    return t ? t.z : 2.55;
  },
};
window.ZoomTiers = ZoomTiers;

/* === 10-trackball.js === */
// Globe gestures — primary UI (Google Earth / Maps style). CLI is secondary.
const canvas = renderer.domElement;
// Stronger drag — 0.0028 felt like the globe was glued down
const TRACK_SENS = 0.0026;
const ZOOM_MIN = 1.05;
const ZOOM_MAX = 18;
const ZOOM_SMOOTH = 0.11;

let pinchDist = 0;
let pinching = false;
let lastTapAt = 0;
let lastTapX = 0;
let lastTapY = 0;
let pressTimer = null;
let pressStartX = 0;
let pressStartY = 0;

function trackballMove(clientX, clientY) {
  const dx = clientX - px;
  const dy = clientY - py;
  px = clientX;
  py = clientY;
  globePivot.rotation.y += dx * TRACK_SENS;
  globePivot.rotation.x += dy * TRACK_SENS;
  globePivot.rotation.x = Math.max(-1.35, Math.min(1.35, globePivot.rotation.x));
  globePivot.quaternion.setFromEuler(globePivot.rotation, 'YXZ');
  // Keep momentum so a flick keeps the planet turning
  trackVelX = dx * TRACK_SENS * 0.88;
  trackVelY = dy * TRACK_SENS * 0.88;
}

function trackballStart(clientX, clientY) {
  window._globeFly = null;
  GlobeControl?.userTookGlobe?.('drag');
  drag = true;
  dragging = true;
  px = clientX;
  py = clientY;
  pressStartX = clientX;
  pressStartY = clientY;
  canvas.classList.add('dragging');
  clearTimeout(pressTimer);
  window._globeLongPressFired = false;
  // Long-press globe (any tier: stellar → city) → MultiTile profile
  pressTimer = setTimeout(() => {
    if (!drag) return;
    // Only if finger barely moved
    if (Math.hypot(px - pressStartX, py - pressStartY) > 14) return;
    window._globeLongPressFired = true;
    const pin = latLngFromScreen?.(clientX, clientY)
      || TrackballGuard?.facingLatLng?.()
      || window._lastPos
      || { lat: 0, lng: 0 };
    MultiTile?.openAt?.(pin.lat, pin.lng, {
      source: 'long-press',
      tier: MultiTile?.currentTier?.() || 'global',
    });
  }, 480);
}

function trackballEnd(clientX, clientY, opts) {
  clearTimeout(pressTimer);
  drag = false;
  canvas.classList.remove('dragging');
  setTimeout(() => { dragging = false; }, 100);
  if (!opts?.skipTap && clientX != null && clientY != null) registerTap(clientX, clientY);
}

function registerTap(clientX, clientY) {
  const now = Date.now();
  if (now - lastTapAt < 340 && Math.hypot(clientX - lastTapX, clientY - lastTapY) < 36) {
    ZoomTiers?.stepIn?.();
    MapDepict?.setHud('Zoom in', 'double-tap');
    lastTapAt = 0;
    return;
  }
  lastTapAt = now;
  lastTapX = clientX;
  lastTapY = clientY;
}

function zoomBy(delta) {
  if (ZoomTiers && delta > 0 && (CityMap?.active || CityMap?._nationalActive)) {
    ZoomTiers.syncFromCamZ?.(camera.position.z, false);
    const next = Math.max(0, ZoomTiers._index - 1);
    if (next === ZoomTiers._index) return;
    ZoomTiers._index = next;
    ZoomTiers.snap(false);
    return;
  }
  const factor = Math.exp((delta || 0) * ZOOM_SMOOTH);
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camera.position.z * factor));
  camera.position.z = next;
  camera.lookAt(0, 0, 0);
  CosmicZoom.update(camera.position.z);
  CityMap?.onCamera?.(camera.position.z, CosmicZoom?.level);
  ZoomTiers?.syncFromCamZ?.(camera.position.z, false);
}

function zoomAt(clientX, clientY, delta, opts) {
  const zoomOnly = opts && opts.zoomOnly;
  if (!zoomOnly) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(earth);
    if (hits.length) {
      const dir = hits[0].point.clone().normalize();
      const pull = delta > 0 ? 0.04 : -0.06;
      globePivot.rotation.y += dir.x * pull;
      globePivot.rotation.x = Math.max(-1.25, Math.min(1.25, globePivot.rotation.x + dir.y * pull));
    }
  }
  zoomBy(delta);
}
window.zoomBy = zoomBy;
window.zoomAt = zoomAt;

function onWheelZoom(e) {
  e.preventDefault();
  trackVelX = 0;
  trackVelY = 0;
  const dy = e.deltaMode === 1 ? e.deltaY * 1.2 : e.deltaY;
  if (ZoomTiers) ZoomTiers.onWheel(dy);
  else {
    const scale = e.deltaMode === 1 ? 0.035 : 0.00022;
    zoomAt(e.clientX, e.clientY, e.deltaY * scale, { zoomOnly: true });
  }
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
    trackVelX = 0;
    trackVelY = 0;
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
    const pinchDelta = (pinchDist - d) * 0.35;
    if (ZoomTiers) ZoomTiers.onPinch(pinchDelta);
    else zoomAt(midX, midY, pinchDelta * 0.006, { zoomOnly: true });
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

/** Raycast earth under screen point → lat/lng (works global / national / city globe view) */
function latLngFromScreen(clientX, clientY) {
  try {
    if (typeof earth === 'undefined' || !earth || !camera) return null;
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(earth, true);
    if (!hits.length) return null;
    return MapPlaceMenu?.pointFromGlobeHit?.(hits[0].point)
      || null;
  } catch (_) {
    return null;
  }
}
window.latLngFromScreen = latLngFromScreen;

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
  // Long-press already opened MultiTile
  if (window._globeLongPressFired) {
    window._globeLongPressFired = false;
    return;
  }
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const markerHits = raycaster.intersectObjects(globeClickTargets(), true);
  if (markerHits.length > 0) {
    const hit = markerHits[0].object;
    const entity = GlobeEntity?.pickFromHit?.(hit);
    if (entity) {
      // Profile markers → MultiTile at all levels
      if (entity.type === 'friend' || entity.type === 'me' || entity.type === 'vendor' || entity.type === 'driver') {
        MultiTile?.openUser?.({
          id: entity.id,
          display_name: entity.title,
          avatar_emoji: entity.icon,
          lat: entity.lat,
          lng: entity.lng,
          roles: entity.type === 'vendor' ? ['vendor'] : entity.type === 'driver' ? ['driver'] : ['client'],
          is_vendor: entity.type === 'vendor',
        }, { lat: entity.lat, lng: entity.lng, source: 'marker', tier: MultiTile?.currentTier?.() });
        return;
      }
      GlobeEntity.activate(entity);
      return;
    }
    const root = hit.userData?.vendor ? hit : (hit.parent?.userData?.vendor ? hit.parent : hit);
    const ud = root.userData || hit.userData || {};
    if (ud.vendor) {
      MultiTile?.openUser?.({
        display_name: ud.vendor.name,
        avatar_emoji: ud.vendor.emoji || '🏬',
        lat: ud.vendor.lat,
        lng: ud.vendor.lng,
        roles: ['vendor'],
        is_vendor: true,
        menu: ud.vendor.items,
      }, { lat: ud.vendor.lat, lng: ud.vendor.lng, source: 'vendor', tier: MultiTile?.currentTier?.() });
      return;
    }
    if (ud.type === 'me' || root === window._meMarker) {
      MultiTile?.openAt?.(
        window._lastPos?.lat ?? 0,
        window._lastPos?.lng ?? 0,
        { source: 'me', tier: MultiTile?.currentTier?.() }
      );
      return;
    }
  }

  const intersects = raycaster.intersectObject(earth);
  if (intersects.length > 0) {
    const pin = MapPlaceMenu?.pointFromGlobeHit?.(intersects[0].point);
    if (!pin) return;
    // Single-click ANY level (city / national / global / stellar Earth view)
    // → radar search around place; CLI guides e.g. pharmacy
    MapRadar?.at?.(pin.lat, pin.lng, {
      source: 'globe-' + (MultiTile?.currentTier?.() || 'global'),
    });
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
  trackVelX = 0;
  trackVelY = 0;
  camera.position.z = f.fromZ + (f.toZ - f.fromZ) * ease;
  camera.lookAt(0, 0, 0);
  CosmicZoom.update(camera.position.z);
  const flyLevel = window._cityDropLock ? 'earth' : CosmicZoom?.level;
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
  el.textContent = 'Drag to move · Scroll/pinch zoom · Double-tap zoom in · stops when you release';
  el.style.cssText = 'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);padding:8px 14px;background:rgba(0,4,12,0.88);border:1px solid rgba(26,111,212,0.45);border-radius:20px;font:12px system-ui;color:#3d9eff;text-shadow:0 0 8px rgba(26,111,212,0.45);z-index:44;pointer-events:none;opacity:1;transition:opacity 1.2s';
  document.body.appendChild(el);
  sessionStorage.setItem('astranov-gesture-hint', '1');
  setTimeout(() => { el.style.opacity = '0'; }, 3200);
  setTimeout(() => { el.remove(); }, 4500);
}
setTimeout(showGestureHint, 600);

/* === 04-trackball-guard.js === */
// === TRACKBALL GUARD — never lose globe drag/spin; regression shield ===
const TrackballGuard = {
  _ok: false,
  _lastCheck: 0,
  FRICTION: 0.94,
  MIN_VEL: 0.00004,
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
    if (drag || window._globeFly) return;
    if (typeof trackVelX !== 'number' || typeof trackVelY !== 'number') return;
    if (Math.abs(trackVelX) < this.MIN_VEL && Math.abs(trackVelY) < this.MIN_VEL) return;
    if (!globePivot) return;
    globePivot.rotation.y += trackVelX;
    globePivot.rotation.x += trackVelY;
    globePivot.rotation.x = Math.max(-1.25, Math.min(1.25, globePivot.rotation.x));
    syncGlobePivotRotation?.();
    trackVelX *= this.FRICTION;
    trackVelY *= this.FRICTION;
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
    // Locate / long hauls are allowed — blocking felt broken and the notice was invisible
    if (dist > 20000 && !opts?.allowLongHaul && !opts?.locate) {
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

  greatCircleKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

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
TrackballGuard.init();

/* === 62-astranov-theme.js === */
// === ASTRANOV THEME — follows device dark/bright (prefers-color-scheme) by default; override via CLI ===
// less buttons: no visible toggle; use CLI 'theme auto|dark|bright'
const AstranovTheme = {
  mode: 'dark',
  KEY: 'astranov_theme_v1',
  _maps: [],
  _auto: true,

  init() {
    try {
      const saved = localStorage.getItem(this.KEY);
      if (saved === 'bright' || saved === 'dark') {
        this.mode = saved;
        this._auto = false;
      } else {
        this._auto = true;
        this.mode = this._getSystem();
      }
    } catch (_) {}
    this.apply();
    // no button onclick — removed for less UI clutter; CLI only
    const btn = document.getElementById('aci-theme');
    if (btn) {
      btn.style.display = 'none'; // hidden since auto + CLI
      btn.onclick = null;
    }
    // follow device
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', () => {
        if (this._auto) {
          this.mode = this._getSystem();
          this.apply();
        }
      });
    } catch (_) {}
  },

  _getSystem() {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'bright';
    } catch (_) { return 'dark'; }
  },

  registerMap(mapApi) {
    if (mapApi && !this._maps.includes(mapApi)) this._maps.push(mapApi);
  },

  toggle() {
    if (this._auto) this.set('dark');
    else this.set(this.mode === 'dark' ? 'bright' : 'dark');
  },

  set(mode) {
    if (mode === 'auto' || mode === 'system') {
      this._auto = true;
      this.mode = this._getSystem();
      try { localStorage.removeItem(this.KEY); } catch (_) {}
    } else {
      const next = mode === 'bright' ? 'bright' : 'dark';
      if (next === this.mode && !this._auto) return this.mode;
      this.mode = next;
      this._auto = false;
      try { localStorage.setItem(this.KEY, next); } catch (_) {}
    }
    this.apply();
    AciCli?.print?.('theme → ' + (this._auto ? 'auto (' + this.mode + ')' : this.mode), 'ok');
    GlobeDeck?.setPreview?.((this.mode === 'bright' ? '☀️' : '🌙') + ' ' + (this._auto ? 'auto' : this.mode) + ' theme');
    if (Voice?.maySpeak?.()) speak('Theme ' + (this._auto ? 'auto' : this.mode) + '.', () => resumeListening?.());
    return this.mode;
  },

  apply() {
    const effective = this._auto ? this._getSystem() : this.mode;
    document.documentElement.dataset.theme = effective;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = effective === 'bright' ? '#c8e4ff' : '#00b4ff';
    if (scene?.background) {
      scene.background = new THREE.Color(effective === 'bright' ? 0xc8dff0 : 0x000000);
    }
    if (renderer) renderer.setClearColor(effective === 'bright' ? 0xc8dff0 : 0x000000, 1);
    EarthRealism?.onThemeChange?.();
    this._maps.forEach(m => m.onThemeChange?.());
    // no btn sync needed
  },
};
window.AstranovTheme = AstranovTheme;

/* === 63-earth-daynight.js === */
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
      const dayUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg';
      const nightUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_lights_2048.png';
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
        '  vec3 n = normalize(vNormalW);',
        '  vec3 s = normalize(sunDirection);',
        '  float d = dot(n, s);',
        '  vec4 dayColor = texture2D(dayTexture, vUv);',
        '  vec4 nightColor = texture2D(nightTexture, vUv);',
        '  // Soft terminator + city-night glow (Astranov cinematic, not hard band)',
        '  float blend = smoothstep(-0.18, 0.32, d);',
        '  vec3 nightLit = nightColor.rgb * vec3(0.55, 0.72, 1.15) * 1.55;',
        '  vec3 dayLit = dayColor.rgb * (0.88 + 0.22 * max(d, 0.0));',
        '  // Specular kiss on oceans (cheap blue boost on day side)',
        '  float ocean = smoothstep(0.22, 0.55, dayColor.b - dayColor.r * 0.35);',
        '  dayLit += ocean * pow(max(d, 0.0), 12.0) * vec3(0.35, 0.55, 0.75);',
        '  vec3 col = mix(nightLit, dayLit, blend);',
        '  // Atmospheric limb brightening',
        '  float limb = pow(1.0 - abs(d), 2.8) * 0.18;',
        '  col += vec3(0.25, 0.55, 1.0) * limb * (1.0 - blend * 0.4);',
        '  gl_FragColor = vec4(col * brightness, 1.0);',
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
    // TRUTH: no floating sun/moon spheres in the scene (looked like fake planets).
    // Day/night uses directional light + shader only.
    this.sunGlow = null;
    this.moonMesh = null;
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
    return '<div class="cg-title">Earth · ' + utc + '</div>'
      + '<div class="cg-item"><b>Day/night</b> — subsolar ' + subsolar.lat.toFixed(1) + '°, ' + subsolar.lng.toFixed(1) + '° · ' + illum + '% lit</div>'
      + '<div class="cg-item"><i>Drag · 🎯 city · no fake satellites</i></div>';
  },

  _subsolarLatLng(sunDir) {
    const lat = Math.asin(Math.max(-1, Math.min(1, sunDir.y))) * 180 / Math.PI;
    let lng = Math.atan2(sunDir.z, sunDir.x) * 180 / Math.PI;
    if (lng > 180) lng -= 360;
    return { lat, lng };
  },

  /**
   * Visible continuous spin — solar-day (1 rev/24h) is invisible at human scale.
   * ~1 full turn every ~3 minutes reads as a living planet without dizzying.
   * Solar position for lighting still uses real UTC via _solarPosition().
   */
  _earthSpin() {
    const t = Date.now() / 1000;
    const visualPeriod = 180; // seconds per revolution
    return (t / visualPeriod) * Math.PI * 2;
  },

  /** Call every animation frame for smooth natural rotation */
  applySpinNow() {
    if (!earth || CityMap?.active) return;
    if (window._globeFly || drag) return; // don't fight user / fly
    try { earth.rotation.y = this._earthSpin(); } catch (_) {}
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

    if (level === 'earth' && camZ < 3.4 && !CityMap?.active) {
      if (!this._hudTimer || now - this._hudTimer > 3500) {
        this._hudTimer = now;
        // No planet/day-night essay on the left — unreadable noise (ResourceMonitor owns left rail)
        const el = document.getElementById('cosmic-guide');
        if (el) { el.innerHTML = ''; el.style.display = 'none'; }
      }
    }
  },
};
window.EarthRealism = EarthRealism;

/* === 99-boot-critical.js === */
// === SPARTAN BOOT · CRITICAL — Earth spins + drag + zoom. Nothing else. ===
window._cycleTurbo = false;
if (window._globePerfLite == null) window._globePerfLite = !!window._isMobileUA;
window._animFrame = 0;
window._lastUserAct = Date.now();
window._spartan = true;

const _slumberDiv = (k) => {
  try {
    return SlumberManager?.frameDivisor?.(k) || (window._globePerfLite ? 10 : 6);
  } catch (_) {
    return window._globePerfLite ? 10 : 6;
  }
};

function globePerfActive() {
  return !!(window._voicePerfMode || window._globePerfLite);
}

['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach((ev) => {
  window.addEventListener(ev, () => { window._lastUserAct = Date.now(); }, { passive: true });
});

function animate() {
  requestAnimationFrame(animate);
  if (window._cycleTurbo) return;
  if (typeof renderer === 'undefined' || !renderer || !scene || !camera) return;

  window._animFrame = (window._animFrame + 1) | 0;
  const frame = window._animFrame;

  // City map is the stage — idle WebGL hard so locate can't starve the UI thread
  if (typeof CityMap !== 'undefined' && CityMap?.active) {
    if (frame % 45 === 0) {
      try { renderer.render(scene, camera); } catch (_) {}
    }
    return;
  }

  if (document.hidden) {
    if (frame % 60 === 0) {
      try { renderer.render(scene, camera); } catch (_) {}
    }
    return;
  }

  const lite = !!window._globePerfLite;
  const idleMs = Date.now() - (window._lastUserAct || 0);
  const dragging = !!(typeof drag !== 'undefined' && (drag || window._globeFly || trackVelX || trackVelY));

  // Never skip frames while spinning Earth — skip made spin look frozen
  if (!dragging && idleMs > 20000) {
    if (frame % 2 !== 0) return;
  }

  if (frame % 10 === 0) {
    try { SlumberManager?.tickFrame?.(); } catch (_) {}
  }

  const camZ = camera.position.z;
  const level = CosmicZoom?.level || 'earth';
  const earthView = (level === 'earth' || level === 'orbit') && camZ < 4.8;

  try {
    if (!drag && !window._globeFly) TrackballGuard?.applyInertia?.();
  } catch (_) {}
  try { tickGlobeFly?.(); } catch (_) {}

  if (earthView && !(typeof CityMap !== 'undefined' && CityMap?.active)) {
    try { EarthRealism?.applySpinNow?.(); } catch (_) {}
  }

  if (frame % Math.max(_slumberDiv('entity'), lite ? 12 : 6) === 0) {
    try { MapDepict?.tick?.(); } catch (_) {}
    try {
      if (SlumberManager?.allows?.('entities') !== false) GlobeEntity?.tick?.();
    } catch (_) {}
  }

  if (frame % Math.max(_slumberDiv('cosmic'), lite ? 16 : 8) === 0) {
    try { CosmicZoom?.update?.(camZ); } catch (_) {}
  }

  if (earthView && frame % Math.max(_slumberDiv('earth'), lite ? 8 : 4) === 0) {
    try { EarthRealism?.tick?.(); } catch (_) {}
  }

  try { renderer.render(scene, camera); } catch (_) {}
}

window.__astranovBootCritical = function __astranovBootCritical() {
  window._bootEarthLock = true;
  // Always start the render loop first — never leave a black void if init soft-fails
  let started = false;
  const startLoop = () => {
    if (started) return;
    started = true;
    try { animate(); } catch (e) { console.error('[boot] animate', e); }
  };

  // Force globe host visible
  let g = document.getElementById('globe');
  if (!g) {
    g = document.createElement('div');
    g.id = 'globe';
    document.body.insertBefore(g, document.body.firstChild);
  }
  g.classList.remove('city-map-active', 'national-map-active');
  g.style.display = '';
  g.style.opacity = '1';
  g.style.visibility = 'visible';
  g.style.zIndex = '2';
  g.style.background = '#000';

  try {
    const startZ = ZoomTiers?.tierZ?.('global') || window.START_CAM_Z || 3.65;
    if (typeof camera !== 'undefined' && camera) {
      camera.position.set(0, 0.18, startZ);
      camera.lookAt(0, 0, 0);
    }
    if (typeof globePivot !== 'undefined' && globePivot) {
      globePivot.rotation.x = 0.12;
      globePivot.rotation.y = 0.82;
      if (typeof earth !== 'undefined' && earth) earth.visible = true;
      syncGlobePivotRotation?.();
    }
  } catch (_) {}

  try {
    CosmicZoom?.init?.();
    ZoomTiers?.init?.();
    AstranovTheme?.init?.();
    EarthRealism?.init?.();
    if (CosmicZoom) {
      CosmicZoom.level = 'earth';
      if (CosmicZoom.solarGroup) CosmicZoom.solarGroup.visible = false;
      CosmicZoom.update(camera?.position?.z || 3.65, { tier: 'global', label: 'Earth', cosmic: 'earth' });
    }
  } catch (e) {
    console.warn('[spartan critical]', e);
  }

  const zl = document.getElementById('zoom-label');
  if (zl) {
    zl.textContent = PublicCopy?.zoomLine?.('global')
      || 'Earth · drag · scroll to country · tap for city';
  }

  // Host gate — never blank the page; only soft-block unknown hosts
  try {
    const host = location.hostname || '';
    const ok = !host
      || host === 'localhost' || host === '127.0.0.1'
      || host === 'astranov.eu' || host.endsWith('.astranov.eu')
      || host.endsWith('.vercel.app') || host.endsWith('.pages.dev')
      || location.protocol === 'file:';
    if (host && !ok) {
      console.warn('[boot] unauthorized host', host);
    }
  } catch (_) {}

  // Canvas force-visible + immediate frame
  try {
    if (typeof renderer !== 'undefined' && renderer?.domElement) {
      const c = renderer.domElement;
      if (g && c.parentNode !== g) g.appendChild(c);
      c.style.display = 'block';
      c.style.opacity = '1';
      c.style.pointerEvents = 'auto';
      c.style.width = '100%';
      c.style.height = '100%';
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      if (scene && camera) {
        // Ensure earth is lit enough to see without texture
        try {
          if (typeof earthMat !== 'undefined' && earthMat && !earthMat.map) {
            earthMat.color?.set?.(0x2a6aaa);
            earthMat.emissive?.set?.(0x0a2030);
            earthMat.needsUpdate = true;
          }
        } catch (_) {}
        renderer.render(scene, camera);
      }
    }
  } catch (_) {}

  startLoop();
  window._astranovCriticalReady = true;
  document.documentElement.dataset.astranovPhase = 'critical';
  document.documentElement.dataset.spartan = '1';
  // Clear any prior init/render error strip once Earth is up
  try {
    const strip = [...document.querySelectorAll('div')].find((d) =>
      /Init\/Render error|sessionHeld/i.test(d.textContent || '')
    );
    if (strip && strip.id !== 'astranov-boot-fail') strip.remove();
  } catch (_) {}
  console.log('%c[Spartan] Earth live · drag · zoom', 'color:#3d9eff;font-weight:700');
};
