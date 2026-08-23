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
window.addEventListener('error', function(e) {
  try {
    const m = String(e.message || e.error?.message || '');
    // sessionHeld etc. are soft — already stubbed; never blank the globe over them
    if (/sessionHeld|Script error|ResizeObserver/i.test(m)) {
      console.warn('[soft]', m);
      return;
    }
    if (window._astranovCriticalReady && /is not defined/i.test(m)) {
      console.warn('[soft post-boot]', m);
      return;
    }
    let msg = document.getElementById('astranov-hard-error');
    if (!msg) {
      msg = document.createElement('div');
      msg.id = 'astranov-hard-error';
      msg.style.cssText = 'position:fixed;bottom:8px;left:8px;right:8px;padding:6px 10px;background:rgba(20,0,0,0.85);color:#f88;font:11px/1.3 monospace;z-index:99999;pointer-events:none;border-radius:8px';
      document.body.appendChild(msg);
    }
    msg.textContent = 'Error: ' + (m || 'unknown').slice(0, 180);
  } catch(_) {}
});

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
