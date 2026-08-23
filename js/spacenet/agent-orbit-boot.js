/** Soft-load agent-orbit — multi-agent + Astranov planet */
(function () {
  'use strict';
  if (window.__SN_AGENT_ORBIT_BOOT) return;
  window.__SN_AGENT_ORBIT_BOOT = 1;
  function load() {
    if (window.SNAgentOrbit) {
      try { SNAgentOrbit.init && SNAgentOrbit.init(); } catch (_) {}
      return;
    }
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    var b = (document.querySelector('meta[name="astranov-build"]') || {}).content || Date.now();
    s.src = '/js/spacenet/agent-orbit.js?v=' + encodeURIComponent(b);
    s.onerror = function () {
      try {
        s.src = 'https://cdn.jsdelivr.net/gh/notisastranov/astranov.eu@main/js/spacenet/agent-orbit.js?v=' + encodeURIComponent(b);
      } catch (_) {}
    };
    document.head.appendChild(s);
  }
  if (document.readyState === 'complete') setTimeout(load, 400);
  else window.addEventListener('load', function () { setTimeout(load, 400); });
  setTimeout(load, 2200);
})();
