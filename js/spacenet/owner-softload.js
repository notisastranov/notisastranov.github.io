/** Astranov owner soft-load: multi-agent orbit + marina discipline + mind bridge */
(function () {
  'use strict';
  if (window.__SN_OWNER_SOFTLOAD) return;
  window.__SN_OWNER_SOFTLOAD = 1;
  var BUILD = (document.querySelector('meta[name="astranov-build"]') || {}).content || Date.now();
  var mods = ['chrome-marina-discipline', 'chrome-mind-bridge', 'agent-orbit'];
  function loadOne(name) {
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = '/js/spacenet/' + name + '.js?v=' + encodeURIComponent(BUILD);
    s.onerror = function () {
      try {
        s.src = 'https://cdn.jsdelivr.net/gh/notisastranov/astranov.eu@main/js/spacenet/' + name + '.js?v=' + encodeURIComponent(BUILD);
      } catch (_) {}
    };
    document.head.appendChild(s);
  }
  function run() { mods.forEach(loadOne); }
  if (document.readyState === 'complete') setTimeout(run, 600);
  else window.addEventListener('load', function () { setTimeout(run, 600); });
  setTimeout(run, 2500);
})();
