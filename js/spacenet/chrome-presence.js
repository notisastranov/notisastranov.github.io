/* SpaceNet Presence · 20260823200000-presence
 * Client subdomains sit on the globe. Embed does NOT restyle CLI placeholders.
 */
(function (global) {
  'use strict';
  var BUILD = '20260823204000-asx';
  if (global.__SN_PRESENCE === BUILD) return;
  global.__SN_PRESENCE = BUILD;

  function isEmbed() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('embed') === 'presence' || q.get('embed') === '1') return true;
      if (window !== window.parent) return true;
    } catch (_) {}
    return false;
  }

  function injectEmbedCss() {
    if (document.getElementById('sn-presence-css')) return;
    var s = document.createElement('style');
    s.id = 'sn-presence-css';
    s.textContent =
      'body.sn-presence-embed #sn-topchrome-panel,' +
      'body.sn-presence-embed #panel,' +
      'body.sn-presence-embed #start-coach,' +
      'body.sn-presence-embed .sn-install-banner{opacity:.18;pointer-events:none}' +
      'body.sn-presence-embed #globe,body.sn-presence-embed canvas{visibility:visible!important;opacity:1!important}';
    document.head.appendChild(s);
  }

  function allowed(origin) {
    if (!origin) return false;
    try {
      var u = new URL(origin);
      return /(^|\.)astranov\.eu$/i.test(u.hostname) || u.hostname === 'localhost';
    } catch (_) {
      return false;
    }
  }

  function colorOf(hex) {
    if (typeof hex === 'number') return hex;
    var h = String(hex || '#44ccff').replace('#', '');
    return parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16) || 0x44ccff;
  }

  function planet() {
    try {
      if (global.SNGlobe && SNGlobe.goToTier) SNGlobe.goToTier('global');
      else if (global.SNGlobe && SNGlobe.goToPlace)
        SNGlobe.goToPlace(20, 20, { tier: 'national', openMap: false, pulse: false });
    } catch (_) {}
  }

  function fly(lat, lng, label, tier) {
    lat = +lat;
    lng = +lng;
    if (!isFinite(lat) || !isFinite(lng)) return;
    try {
      if (global.SNGlobe && SNGlobe.goToPlace) {
        SNGlobe.goToPlace(lat, lng, {
          tier: tier || 'city',
          pulse: true,
          label: label || '',
          openMap: false
        });
      } else if (global.SNGlobe && SNGlobe.flyNear) {
        SNGlobe.flyNear(lat, lng, tier || 'city');
      }
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.pulse)
        SNGlobe.pulse(lat, lng, 0x44ffcc, String(label || 'PIN').slice(0, 18), 20000);
    } catch (_) {}
  }

  function glow(pins) {
    if (!pins || !pins.length) return;
    pins.forEach(function (p, i) {
      setTimeout(function () {
        try {
          if (global.SNGlobe && SNGlobe.pulse)
            SNGlobe.pulse(+p.lat, +p.lng, colorOf(p.color), String(p.name || p.id || '').slice(0, 16), 55000);
        } catch (_) {}
      }, i * 120);
    });
  }

  function openProject(id) {
    try {
      if (global.SNProjects && SNProjects.open) SNProjects.open(id, true);
    } catch (_) {}
  }

  function handle(msg) {
    if (!msg || msg.sn !== 'presence') return;
    if (msg.op === 'planet') planet();
    if (msg.op === 'fly') fly(msg.lat, msg.lng, msg.label, msg.tier);
    if (msg.op === 'glow') glow(msg.pins);
    if (msg.op === 'open') openProject(msg.id);
  }

  function logCli(msg, kind) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, kind || 'ok');
    } catch (_) {}
  }

  function handleCli(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;
    if (/^(presence|subdomain|hosting|spacenet page)$/.test(low) || (low.indexOf('presence') >= 0 && /price|sell|subdomain/.test(low))) {
      logCli('SpaceNet Presence · any client subdomain · €330 / year = 330 Astranov Coin', 'ok');
      logCli('Astranov Coin 1 = 1 EUR · everyday life · shares on the SpaceNet Stock Exchange', 'ok');
      logCli('investors.astranov.eu is the first page · /presence', 'ok');
      return true;
    }
    return false;
  }

  function interceptCli() {
    function bind(form, flag) {
      if (!form || form[flag]) return;
      form[flag] = 1;
      form.addEventListener(
        'submit',
        function (e) {
          var inp = document.getElementById('cli-in') || document.getElementById('stc-cmd-in');
          var v = inp ? inp.value : '';
          if (handleCli(v)) {
            e.preventDefault();
            e.stopPropagation();
            if (inp) inp.value = '';
          }
        },
        true
      );
    }
    bind(document.getElementById('cli-form') || document.querySelector('#panel form'), '__snPres');
    bind(document.getElementById('stc-cmd-form'), '__snPresTop');
  }

  function boot() {
    interceptCli();
    global.SNPresence = {
      build: BUILD,
      planet: planet,
      fly: fly,
      glow: glow,
      open: openProject,
      price: 330,
      handle: handleCli
    };
    if (!isEmbed()) return;
    injectEmbedCss();
    try {
      document.body.classList.add('sn-presence-embed');
    } catch (_) {}
    window.addEventListener('message', function (e) {
      if (!allowed(e.origin) && e.source !== window.parent) return;
      var data = e.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (_) {
          return;
        }
      }
      handle(data);
    });
    function ready() {
      try {
        if (window.parent && window.parent !== window)
          window.parent.postMessage({ sn: 'presence', op: 'ready', build: BUILD }, '*');
      } catch (_) {}
      planet();
      setTimeout(function () {
        try {
          if (global.SNProjects && SNProjects.all) glow(SNProjects.all);
        } catch (_) {}
      }, 1400);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
    else ready();
    setTimeout(ready, 2000);
    global.SNPresence.embed = true;
  }

  boot();
})(typeof window !== 'undefined' ? window : globalThis);
