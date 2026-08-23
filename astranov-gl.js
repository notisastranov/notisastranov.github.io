/* astranov-gl.js — first paint · split-lite */
/* Astranov app — unified bundle · global-boot rebuild */

(function _snlEarlyPaint() {
  const kill = function() {
    const el = document.getElementById('spacenet-loader');
    if (!el || el.classList.contains('done')) return;
    el.classList.add('done');
    el.setAttribute('aria-busy', 'false');
    setTimeout(function() { try { el.remove(); } catch (_) {} }, 200);
  };
  window._snlForceDismiss = kill;
  kill();
})();

const container = document.getElementById('globe');

// Robust WebGL + error guard so user never sees silent black
window.addEventListener('error', function(e) {
  try {
    window._snlForceDismiss?.();
    window.SpaceNetLoader?.dismiss?.('error');
    window.MissionSupportReporter?.recordProblem?.('js_error', e.message || 'unknown', {
      file: e.filename, line: e.lineno, col: e.colno,
    });
    const msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;bottom:8px;left:8px;padding:4px 8px;background:rgba(20,0,0,0.7);color:#f66;font:11px/1.3 monospace;z-index:99999;pointer-events:none;';
    msg.textContent = 'Init/Render error: ' + (e.message || 'unknown') + ' — try Chrome/Firefox, enable HW accel, check console';
    document.body.appendChild(msg);
  } catch(_) {}
});
window.addEventListener('unhandledrejection', function(e) {
  try {
    const reason = e.reason?.message || String(e.reason || 'promise rejection');
    window.MissionSupportReporter?.recordProblem?.('unhandled_rejection', reason.slice(0, 300));
  } catch(_) {}
});

let renderer;
try {
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setClearColor(0x000000, 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const _dprCap = window.SlumberManager?.quality?.pixelRatio ?? (window._globePerfLite ? 1.0 : 1.25);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, _dprCap));
  if (THREE.ACESFilmicToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
  }
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  window.renderer = renderer;
  container.appendChild(renderer.domElement);
  try {
    const fill = document.getElementById('snl-fill');
    const label = document.getElementById('snl-label');
    if (fill) fill.style.width = '40%';
    if (label) label.textContent = 'Earth globe';
    window._snlForceDismiss?.();
  } catch (_) {}
} catch (e) {
  window._webglFailed = true;
  window._snlForceDismiss?.();
  const fb = document.createElement('div');
  fb.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#0af;font:15px system-ui;background:#000;z-index:10;text-align:center;';
  fb.innerHTML = 'WebGL unavailable — CLI still works.<br>Enable hardware acceleration or try Chrome.<br><small>Tap Astranov to retry</small>';
  if (container) container.appendChild(fb);
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
let userLocated = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 3.5);
camera.lookAt(0, 0, 0);
window.camera = camera;

scene.add(new THREE.AmbientLight(0x667788, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(5, 3, 4);
scene.add(sun);

// Stars - bigger/brighter to guarantee visibility against black
const starPos = [];
for (let i=0; i<480; i++) {
  const r = 140 + Math.random()*900;
  const t = Math.random()*Math.PI*2;
  const p = Math.acos(2*Math.random()-1);
  starPos.push(r*Math.sin(p)*Math.cos(t), r*Math.sin(p)*Math.sin(t), r*Math.cos(p));
}
const sgeo = new THREE.BufferGeometry();
sgeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos,3));
scene.add(new THREE.Points(sgeo, new THREE.PointsMaterial({color:0xffffff, size:2.8, sizeAttenuation:false})));

// Earth — NASA Blue Marble (upgraded before EarthRealism shader takes over)
const EARTH_TEX = {
  day: 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg',
  night: 'https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg',
  fallback: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/earth_atmos_2048.jpg',
};
window.EARTH_TEX = EARTH_TEX;
const earthMat = new THREE.MeshBasicMaterial({ color: 0x44aaff });
new THREE.TextureLoader().load(
  EARTH_TEX.day,
  (tex) => { earthMat.map = tex; earthMat.needsUpdate = true; },
  undefined,
  () => {
    new THREE.TextureLoader().load(EARTH_TEX.fallback, (fb) => {
      earthMat.map = fb; earthMat.needsUpdate = true;
    });
  }
);
globePivot = new THREE.Group();
scene.add(globePivot);

const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 24), earthMat);
globePivot.add(earth);
globePivot.rotation.y = 0;
globePivot.rotation.x = 0.12;
globePivot.quaternion.setFromEuler(globePivot.rotation, 'YXZ');
window.globePivot = globePivot;
window.earth = earth;
window._animateStarted = false;

(function _earlyGlobePaint() {
  function tick() {
    if (!renderer || !scene || !camera) return;
    window._snlForceDismiss?.();
    try { renderer.render(scene, camera); } catch (_) {}
    if (!window._animateStarted) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
window.renderer = renderer;
window.scene = scene;
window.camera = camera;
window.earth = earth;
window.globePivot = globePivot;
window.drag = drag;
window.dragging = dragging;
window.idleRoll = idleRoll;
window.trackVelX = trackVelX;
window.trackVelY = trackVelY;
window._snlForceDismiss = window._snlForceDismiss;
window.sun = sun;
window.container = container;
