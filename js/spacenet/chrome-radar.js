/* Astranov radar activity · Build 20260811215000
 * INDEPENDENT of power button.
 * low (few real nearby dots) → red ring + red dots → power OFF / rest
 * med (moderate real activity) → blue pulse + blue dots → radar standby activity
 * high (many real dots) → green pulse + green dots → turn power ON
 * Dots come from field.refreshBlips (profiles/tasks/offers/vendors/routes near user).
 */
(function (global) {
  'use strict';
  var BUILD = '20260811215000-radar-activity-real';
  var lastHint = 0;

  function injectCss() {
    var id = 'sn-radar-pulse-css';
    var old = document.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var st = document.createElement('style');
    st.id = id;
    st.textContent = [
      '@keyframes sn-radar-blue-pulse {',
      '  0%, 100% { box-shadow: inset 0 0 0 2px rgba(40,140,255,0.95), 0 0 12px rgba(40,140,255,0.55), 0 0 26px rgba(20,100,255,0.32); }',
      '  50% { box-shadow: inset 0 0 0 2.5px rgba(100,200,255,1), 0 0 22px rgba(70,180,255,0.9), 0 0 42px rgba(40,140,255,0.5); }',
      '}',
      '@keyframes sn-radar-green-pulse {',
      '  0%, 100% { box-shadow: inset 0 0 0 2px rgba(40,230,140,0.9), 0 0 12px rgba(40,220,120,0.55); }',
      '  50% { box-shadow: inset 0 0 0 2.5px rgba(80,255,170,1), 0 0 22px rgba(60,255,150,0.9); }',
      '}',
      '#field-radar { border-radius: 50% !important; transition: box-shadow 0.35s ease !important; }',
      /* moderate / radar-standby activity = BLUE */
      '#field-radar.act-med, #field-radar.act-standby {',
      '  animation: sn-radar-blue-pulse 2.4s ease-in-out infinite !important;',
      '  box-shadow: inset 0 0 0 2px rgba(40,140,255,0.95), 0 0 16px rgba(40,140,255,0.65) !important;',
      '}',
      /* low activity = RED → rest / power off */
      '#field-radar.act-low {',
      '  animation: none !important;',
      '  box-shadow: inset 0 0 0 2.5px rgba(232,33,39,0.95), 0 0 14px rgba(232,33,39,0.55), 0 0 28px rgba(200,20,40,0.28) !important;',
      '}',
      /* high activity = GREEN → power on */
      '#field-radar.act-high {',
      '  animation: sn-radar-green-pulse 1.6s ease-in-out infinite !important;',
      '  box-shadow: inset 0 0 0 2.5px rgba(40,230,140,0.95), 0 0 20px rgba(40,220,120,0.7) !important;',
      '}',
    ].join('\n');
    document.head.appendChild(st);
  }

  function setRadarAct(level) {
    var el = document.getElementById('field-radar');
    if (!el) return;
    el.classList.remove('act-low', 'act-med', 'act-high', 'act-standby');
    if (level === 'high' || level === 2) {
      el.classList.add('act-high');
      el.dataset.activity = 'high';
    } else if (level === 'low' || level === 0) {
      el.classList.add('act-low');
      el.dataset.activity = 'low';
    } else {
      el.classList.add('act-med');
      el.dataset.activity = 'med';
    }
  }

  /** Count REAL nearby activity — same sources as field blips */
  function countRealActivity() {
    try {
      if (global.SNRadar && typeof SNRadar.blipCount === 'function') {
        var n = SNRadar.blipCount();
        if (typeof n === 'number') return n;
      }
    } catch (_) {}

    var n = 0;
    var focus = { lat: 36.43, lng: 28.22 };
    try {
      if (global.SNGlobe && SNGlobe.focusPos) focus = SNGlobe.focusPos() || focus;
      else if (global._snLastPos) focus = global._snLastPos;
    } catch (_) {}

    function near(lat, lng) {
      try {
        return Math.abs(Number(lat) - Number(focus.lat)) < 0.09 &&
          Math.abs(Number(lng) - Number(focus.lng)) < 0.12;
      } catch (_) { return false; }
    }

    try {
      if (global.SNTasks && SNTasks.list) {
        (SNTasks.list() || []).forEach(function (t) {
          if (!t) return;
          var st = String(t.status || '').toLowerCase();
          if (st === 'done' || st === 'cancelled' || st === 'complete') return;
          n += 1;
        });
      }
    } catch (_) {}

    try {
      if (global.SNOfferStack) {
        if (SNOfferStack.peekCount) n += Number(SNOfferStack.peekCount()) || 0;
        else if (SNOfferStack.list) {
          n += (SNOfferStack.list() || []).filter(function (o) {
            var ph = String((o && (o.phase || o.status)) || '').toLowerCase();
            return !ph || ph === 'offered' || ph === 'open' || ph === 'claimed' || ph === 'underway';
          }).length;
        }
      }
    } catch (_) {}

    try {
      if (global.SNProfiles && SNProfiles.list) {
        (SNProfiles.list() || []).forEach(function (p) {
          if (p && p.lat != null && near(p.lat, p.lng)) n += 1;
        });
      }
    } catch (_) {}

    try {
      var vs = (global.SNCommerce && SNCommerce.vendors) || [];
      for (var i = 0; i < vs.length; i++) {
        if (vs[i] && vs[i].lat != null && near(vs[i].lat, vs[i].lng)) n += 1;
      }
    } catch (_) {}

    try {
      if (global.SNField && SNField.routes) {
        n += (SNField.routes || []).length;
      }
    } catch (_) {}

    return n;
  }

  function bandFromCount(n) {
    n = Number(n) || 0;
    if (n <= 2) return 'low';
    if (n >= 10) return 'high';
    return 'med';
  }

  function hint(band) {
    var now = Date.now();
    if (now - lastHint < 45000) return;
    lastHint = now;
    try {
      if (!global.SNCli || !SNCli.log) return;
      if (band === 'high') SNCli.log('Radar · high activity · turn power ON (green)', 'ok');
      else if (band === 'low') SNCli.log('Radar · low activity · power OFF / rest', 'dim');
    } catch (_) {}
  }

  function radarFromLive() {
    try {
      if (global.SNField && typeof SNField.refreshBlips === 'function') {
        SNField.refreshBlips();
      } else if (global.SNRadar && typeof SNRadar.refresh === 'function') {
        SNRadar.refresh();
      }
    } catch (_) {}

    var band = null;
    try {
      if (global.SNRadar && typeof SNRadar.activity === 'function') {
        band = SNRadar.activity();
      }
    } catch (_) {}
    if (!band || (band !== 'low' && band !== 'med' && band !== 'high')) {
      band = bandFromCount(countRealActivity());
    }
    setRadarAct(band);
    hint(band);
    return band;
  }

  function boot() {
    injectCss();
    radarFromLive();
    setTimeout(radarFromLive, 1500);
    setTimeout(radarFromLive, 4000);
    setInterval(radarFromLive, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 2500);

  global.SNRadarPulse = {
    build: BUILD,
    set: setRadarAct,
    refresh: radarFromLive,
    count: countRealActivity,
  };
})(typeof window !== 'undefined' ? window : globalThis);
