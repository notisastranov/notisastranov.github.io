// === SPARTAN LOADER — critical Earth → app map → features. Deferred only on demand. ===
(function AstranovLoader(global) {
  'use strict';

  const build = document.querySelector('meta[name="astranov-build"]')?.content || '0';
  const man = global.__ASTRANOV_MANIFEST__ || {
    mode: 'js-phase-bundles',
    critical: ['/js/phase-critical.js'],
    app: ['/js/phase-app.js'],
    features: ['/js/phase-features.js'],
    deferred: ['/astranov-deferred.js'],
  };

  const RESCUE = {
    critical: ['/js/phase-critical.js'],
    app: ['/js/phase-app.js'],
    features: ['/js/phase-features.js'],
    deferred: ['/astranov-deferred.js'],
  };

  function withV(url) {
    if (!url) return url;
    return url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(build);
  }

  function resolveUrl(file) {
    if (!file) return file;
    if (file.startsWith('http') || file.startsWith('/')) return withV(file);
    return withV('/js/' + file);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-astranov-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('load fail')), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.dataset.astranovSrc = src;
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = () => reject(new Error('Failed ' + src));
      document.head.appendChild(s);
    });
  }

  async function loadOnePhase(files, label) {
    const list = (files || []).filter(Boolean);
    if (!list.length) return false;
    const t0 = performance.now();
    try {
      await Promise.all(list.map((f) => loadScript(resolveUrl(f))));
      console.log('%c[spartan] ' + label + ' · ' + Math.round(performance.now() - t0) + 'ms', 'color:#7ec8ff');
      return true;
    } catch (e) {
      console.warn('[spartan] ' + label + ' failed', e.message || e);
      return false;
    }
  }

  async function loadPhase(primary, label, rescue) {
    if (await loadOnePhase(primary, label)) return true;
    if (rescue && await loadOnePhase(rescue, label + '-rescue')) return true;
    return false;
  }

  function loadVendor(src, ready) {
    return new Promise((resolve) => {
      try {
        if (ready()) return resolve();
      } catch (_) {}
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }

  const afterPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  function banner(msg) {
    try {
      let el = document.getElementById('astranov-boot-fail');
      if (!el) {
        el = document.createElement('div');
        el.id = 'astranov-boot-fail';
        el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;padding:12px;'
          + 'background:rgba(20,0,0,.94);border:1px solid #f66;color:#fcc;font:12px system-ui;border-radius:10px';
        document.body.appendChild(el);
      }
      el.textContent = msg;
    } catch (_) {}
  }

  async function run() {
    const t0 = performance.now();
    document.documentElement.dataset.astranovPhase = 'loading';
    window._bootAt = Date.now();
    window._spartan = true;

    // 1) EARTH
    const critOk = await loadPhase(man.critical, 'critical', RESCUE.critical);
    if (!critOk) {
      banner('Earth failed to load — hard refresh astranov.eu');
      document.documentElement.dataset.astranovPhase = 'critical-error';
      return;
    }
    try {
      global.__astranovBootCritical?.();
    } catch (e) {
      banner('Earth boot error: ' + (e.message || e));
      console.error(e);
    }

    await afterPaint();

    // 2) Leaflet before map modules
    await loadVendor(
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      () => typeof global.L !== 'undefined'
    );
    await loadVendor(
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
      () => typeof global.supabase !== 'undefined'
    );

    // 3) MAP + CLI
    const appOk = await loadPhase(man.app, 'app', RESCUE.app);
    if (appOk) {
      try { global.__astranovBootApp?.(); } catch (e) { console.error('[spartan app]', e); }
    } else {
      banner('Map layer failed — Earth still works. Retry refresh.');
    }

    await afterPaint();

    // 4) FIELD HUB (short delay — keep Earth interactive)
    const delay = window._globePerfLite ? 400 : 120;
    await new Promise((r) => setTimeout(r, delay));
    const featOk = await loadPhase(man.features, 'features', RESCUE.features);
    if (featOk) {
      try { global.__astranovBootFeatures?.(); } catch (e) { console.error('[spartan features]', e); }
    }

    global.__ASTRANOV_DEFERRED_URLS__ = (man.deferred || RESCUE.deferred).map(resolveUrl);
    global.__ASTRANOV_DEFERRED_FILES__ = [];
    global._astranovLoaderDone = true;
    document.documentElement.dataset.astranovPhase = 'ready';

    if (global._astranovCriticalReady) {
      document.getElementById('astranov-boot-fail')?.remove();
    }

    console.log(
      '%c[spartan] ready · ' + Math.round(performance.now() - t0) + 'ms · ' + build,
      'color:#00ff99;font-weight:700'
    );
  }

  global.AstranovLoader = { run, build };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { run().catch((e) => console.error('[spartan]', e)); });
  } else {
    run().catch((e) => console.error('[spartan]', e));
  }
})(window);
