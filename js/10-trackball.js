// Globe gestures — primary UI (Google Earth / Maps style). CLI is secondary.
const canvas = renderer.domElement;
// Stronger drag — 0.0028 felt like the globe was glued down
const TRACK_SENS = 0.0062;
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
