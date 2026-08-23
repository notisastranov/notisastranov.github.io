/* Astranov OS boot - tiny pure JS only (must never be HTML) */
/* SPECS: load OS/Browser only if not already provided by phase-app */
(function astranovOsBoot() {
  if (window.__ASTRANOV_OS_BOOT__) return;
  window.__ASTRANOV_OS_BOOT__ = 1;
  var build = (document.querySelector('meta[name="astranov-build"]') || {}).content || String(Date.now());
  function load(src) {
    return new Promise(function (resolve) {
      if (document.querySelector('script[data-astranov-os="' + src + '"]')) return resolve();
      var s = document.createElement('script');
      s.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(build);
      s.async = true;
      s.dataset.astranovOs = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { resolve(); };
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function init() {
    try { if (window.AstranovOS && AstranovOS.init) AstranovOS.init(); } catch (e) { console.warn('[OS]', e); }
    try { if (window.AstranovBrowser && AstranovBrowser.init) AstranovBrowser.init(); } catch (e) { console.warn('[Browser]', e); }
  }
  function run() {
    var needOs = !(window.AstranovOS && typeof window.AstranovOS.init === 'function');
    var needBr = !(window.AstranovBrowser && typeof window.AstranovBrowser.init === 'function');
    var jobs = [];
    if (needOs) jobs.push(load('/js/08-astranov-os.js'));
    if (needBr) jobs.push(load('/js/08-astranov-browser.js'));
    Promise.all(jobs).then(function () {
      init();
      setTimeout(init, 800);
      setTimeout(init, 2500);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
