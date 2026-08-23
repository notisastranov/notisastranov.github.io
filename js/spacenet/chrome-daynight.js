/* Astranov day/night theme from globe focus local solar time
 * Build: 20260811134500-daynight
 * national/regional/city + city map → theme-light if day at lat/lng, theme-dark if night
 * Respects sn:theme-lock-v1 and explicit sn:theme-v1 light|dark
 */
(function (global) {
  'use strict';
  function isDayAtLatLng(lat, lng) {
    try {
      var d = new Date();
      var start = Date.UTC(d.getUTCFullYear(), 0, 0);
      var day = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000;
      var decl = 23.44 * Math.sin(((360 / 365) * (day - 81) * Math.PI) / 180);
      var utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
      var sunLon = (12 - utcH) * 15;
      while (sunLon > 180) sunLon -= 360;
      while (sunLon < -180) sunLon += 360;
      var latR = (lat * Math.PI) / 180;
      var lonR = (lng * Math.PI) / 180;
      var declR = (decl * Math.PI) / 180;
      var sunLonR = (sunLon * Math.PI) / 180;
      var cosc =
        Math.sin(latR) * Math.sin(declR) +
        Math.cos(latR) * Math.cos(declR) * Math.cos(lonR - sunLonR);
      return cosc > 0.02;
    } catch (_) {
      var h = new Date().getHours();
      return h >= 7 && h < 20;
    }
  }

  function applyLocationTheme() {
    try {
      if (localStorage.getItem('sn:theme-lock-v1') === '1') return;
      var forced = localStorage.getItem('sn:theme-v1') || '';
      if (forced === 'light' || forced === 'dark') return;

      var lat = null, lng = null, tier = 'global';
      try {
        if (global.SNGlobe) {
          if (SNGlobe.currentTier) tier = SNGlobe.currentTier() || tier;
          var f = SNGlobe.focusPos && SNGlobe.focusPos();
          if (f && f.lat != null) { lat = f.lat; lng = f.lng; }
          else if (SNGlobe.diveAnchor) { lat = SNGlobe.diveAnchor.lat; lng = SNGlobe.diveAnchor.lng; }
        }
      } catch (_) {}
      try {
        if ((lat == null || lng == null) && global.SNTasks && SNTasks.pos) {
          lat = SNTasks.pos.lat; lng = SNTasks.pos.lng;
        }
      } catch (_) {}
      try {
        if (global.SNMap && SNMap.active) {
          tier = 'city';
          if (SNMap.center) {
            var c = SNMap.center();
            if (c && c.lat != null) { lat = c.lat; lng = c.lng; }
          }
        }
      } catch (_) {}

      var deep = tier === 'national' || tier === 'regional' || tier === 'city' || tier === 'street';
      var wantLight;
      if (deep && lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
        wantLight = isDayAtLatLng(Number(lat), Number(lng));
      } else {
        var h = new Date().getHours();
        wantLight = h >= 7 && h < 20;
      }

      var root = document.documentElement;
      if (wantLight && root.classList.contains('theme-light')) return;
      if (!wantLight && root.classList.contains('theme-dark')) return;
      root.classList.remove('theme-light', 'theme-dark');
      root.classList.add(wantLight ? 'theme-light' : 'theme-dark');
      try {
        var meta = document.getElementById('meta-theme-color');
        if (meta) meta.setAttribute('content', wantLight ? '#e8eef6' : '#000105');
      } catch (_) {}
    } catch (_) {}
  }

  function boot() {
    applyLocationTheme();
    setInterval(applyLocationTheme, 12000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 3000);
  setTimeout(boot, 8000);
  global.SNDayNightTheme = { apply: applyLocationTheme, isDayAt: isDayAtLatLng };
})(typeof window !== 'undefined' ? window : globalThis);
