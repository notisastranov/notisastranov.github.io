/**
 * Astranov Orbit Boot — chrome + planet, even if an old bootstrap is cached
 * Build: 20260812190000-chrome-orbit-restore
 */
(function () {
  'use strict';
  if (window.__SN_ORBIT_BOOT === '20260812190000') return;
  window.__SN_ORBIT_BOOT = '20260812190000';
  var BUILD = '20260812190000-chrome-orbit-restore';
  var MODS = [
    'chrome-mute',
    'chrome-fix',
    'chrome-radar',
    'chrome-helper',
    'chrome-marina-discipline',
    'chrome-mind-bridge',
    'agent-orbit'
  ];

  function load(name) {
    try {
      var s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = '/js/spacenet/' + name + '.js?v=' + BUILD;
      s.onerror = function () {
        try {
          s.src = 'https://cdn.jsdelivr.net/gh/notisastranov/astranov.eu@main/js/spacenet/' + name + '.js?v=' + BUILD;
        } catch (_) {}
      };
      (document.head || document.documentElement).appendChild(s);
    } catch (_) {}
  }

  function run() {
    MODS.forEach(load);
  }

  if (document.readyState === 'complete') setTimeout(run, 120);
  else window.addEventListener('load', function () { setTimeout(run, 120); });
  setTimeout(run, 700);
  setTimeout(run, 2400);
})();
