/**
 * chrome-marina-discipline.js
 * P0: stop auto-flying to Mandraki + sticky berth/legend overlays
 * Marina ONLY on explicit CLI "marina" / "marina <name>"
 * Build: 20260812180000-marina-discipline
 */
(function (global) {
  'use strict';
  var BUILD = '20260812180000-marina-discipline';
  if (global.__SN_MARINA_DISC === BUILD) return;
  global.__SN_MARINA_DISC = BUILD;

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 220), c || 'ok');
    } catch (_) {}
  }

  function killDom() {
    ['sn-marina-legend', 'sn-marina-banner', 'sn-marina-edit', 'sn-marina-layer'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      try {
        el.classList.remove('show');
        el.style.display = 'none';
      } catch (_) {}
    });
    try {
      document.querySelectorAll('.sn-berth-cell, .sn-marina-cell, [data-sn-berth]').forEach(function (n) {
        try { n.remove(); } catch (_) {}
      });
    } catch (_) {}
  }

  function forceHide() {
    killDom();
    try {
      if (global.SNMarina && typeof SNMarina.hideOverlay === 'function') SNMarina.hideOverlay(true);
    } catch (_) {}
  }

  function patchMarina() {
    if (!global.SNMarina) return false;
    if (SNMarina._discPatched === BUILD) return true;
    SNMarina._discPatched = BUILD;
    SNMarina._userIntent = false;

    var prevOpen = SNMarina.openMarina && SNMarina.openMarina.bind(SNMarina);
    if (prevOpen) {
      SNMarina.openMarina = function (idOrName, opts) {
        opts = opts || {};
        if (!opts.explicit && !SNMarina._userIntent) {
          log('Marina · blocked auto-open · type: marina', 'dim');
          return false;
        }
        SNMarina._userIntent = true;
        return prevOpen(idOrName);
      };
    }

    var prevShow = SNMarina.showOverlay && SNMarina.showOverlay.bind(SNMarina);
    if (prevShow) {
      SNMarina.showOverlay = function (marina) {
        if (!SNMarina._userIntent) {
          forceHide();
          return false;
        }
        return prevShow(marina);
      };
    }

    var prevRefresh = SNMarina.refresh && SNMarina.refresh.bind(SNMarina);
    if (prevRefresh) {
      SNMarina.refresh = function () {
        if (!SNMarina._userIntent) {
          forceHide();
          return;
        }
        return prevRefresh();
      };
    }
    return true;
  }

  function handleLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;
    if (low === 'marina off' || low === 'marina hide' || low === 'marina clear' || low === 'clear marina' || low === 'berths off' || low === 'overlay clear') {
      try { if (global.SNMarina) SNMarina._userIntent = false; } catch (_) {}
      forceHide();
      log('Marina overlay OFF', 'ok');
      return true;
    }
    if (low === 'marina' || low === 'marinas' || low === 'berths' || /^marina\s+/.test(low)) {
      try { if (global.SNMarina) SNMarina._userIntent = true; } catch (_) {}
      return false;
    }
    return false;
  }

  function installCli() {
    if (!global.SNCli || typeof SNCli.run !== 'function') return;
    if (SNCli._snMarinaDiscHook) return;
    SNCli._snMarinaDiscHook = true;
    var prev = SNCli.run.bind(SNCli);
    SNCli.run = function (raw) {
      try { if (handleLine(raw)) return Promise.resolve(true); } catch (_) {}
      return prev(raw);
    };
  }

  function init() {
    forceHide();
    patchMarina();
    installCli();
    [400, 1200, 2500, 5000, 9000].forEach(function (ms) {
      setTimeout(function () {
        forceHide();
        patchMarina();
        installCli();
      }, ms);
    });
    try {
      var mo = new MutationObserver(function () {
        try {
          if (global.SNMarina && !SNMarina._userIntent) {
            var leg = document.getElementById('sn-marina-legend');
            if (leg && leg.classList.contains('show')) forceHide();
            var ban = document.getElementById('sn-marina-banner');
            if (ban && ban.classList.contains('show')) forceHide();
          }
        } catch (_) {}
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 50); });
  } else setTimeout(init, 50);
  setTimeout(init, 1500);

  global.SNMarinaDiscipline = { build: BUILD, hide: forceHide, init: init };
})(typeof window !== 'undefined' ? window : globalThis);
