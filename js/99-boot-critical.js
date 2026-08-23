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
