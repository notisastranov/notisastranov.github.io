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
