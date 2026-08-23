/* Astranov chrome-p0-ops · Build 20260820185500
 * P0 only — no redesign:
 *  1) Signed-in face stays 28px circle (inline + DOM clamp)
 *  2) + / ADD works without SNTopo (pin · post · task · vendor)
 *  3) Geocode bias for rodos/rhodes/ρόδο → Aegean viewbox
 *  4) Earth hits cluster: drop continent outliers so Rhodes stays on Rhodes
 *  5) Map long-press / context → CLI pin/post/task
 *  6) Coach strip dies when signed in
 */
(function (global) {
  'use strict';
  var BUILD = '20260820185500-p0-ops-rebuild';
  var AEGEAN = { lat: 36.387557, lng: 28.222533, name: 'Kalithea' };

  function isGreekQuery(q) {
    return /\b(rodos|rhodes|ρόδο|ροδοσ|ρόδος|opap|οπαπ|sgourou|σγούρ|mandraki|μανδράκ|lindos|λίνδο|vodi|βόδι)\b/i.test(
      String(q || '')
    );
  }

  function distKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 1e9;
    var R = 6371;
    var dLat = ((b.lat - a.lat) * Math.PI) / 180;
    var dLng = ((b.lng - a.lng) * Math.PI) / 180;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function clusterHits(hits, seed) {
    hits = (hits || []).filter(function (h) {
      return h && h.lat != null && h.lng != null && isFinite(h.lat) && isFinite(h.lng);
    });
    if (hits.length < 2) return hits;
    var origin = seed || hits[0];
    var near = hits.filter(function (h) {
      return distKm(origin, h) < 800;
    });
    if (near.length >= 1) return near;
    return hits.slice(0, 1);
  }

  function clampFace() {
    try {
      var bar = document.getElementById('sn-task-ribbon');
      if (!bar) return;
      bar.querySelectorAll('.sn-rib-btn, button[data-act]').forEach(function (btn) {
        btn.style.cssText +=
          ';width:32px!important;height:32px!important;min-width:32px!important;max-width:32px!important;min-height:32px!important;max-height:32px!important;overflow:hidden!important;border-radius:50%!important;flex:0 0 32px!important;padding:0!important;';
      });
      bar.querySelectorAll('img').forEach(function (img) {
        img.setAttribute('width', '24');
        img.setAttribute('height', '24');
        img.classList.add('sn-rib-face');
        img.style.cssText =
          'width:24px!important;height:24px!important;max-width:24px!important;max-height:24px!important;min-width:24px!important;min-height:24px!important;border-radius:50%!important;object-fit:cover!important;display:block!important;margin:0 auto!important;position:static!important;transform:none!important;';
      });
      var user = document.getElementById('sn-rib-user') || bar.querySelector('[data-act="user"]');
      if (user) {
        user.style.cssText +=
          ';width:32px!important;height:32px!important;overflow:hidden!important;border-radius:50%!important;';
      }
    } catch (_) {}
  }

  function hideCoach() {
    try {
      var signed = !!(global.SNAuth && SNAuth.user);
      document.body.classList.toggle('sn-in', !!signed);
      document.body.classList.toggle('sn-guest', !signed);
      if (signed) {
        var coach = document.getElementById('cli-coach');
        if (coach) {
          coach.style.cssText = 'display:none!important;height:0!important;padding:0!important;margin:0!important;';
          coach.innerHTML = '';
        }
      }
    } catch (_) {}
  }

  function patchSearch() {
    if (!global.SNSearch || SNSearch._p0Ops) return;
    SNSearch._p0Ops = true;

    var origGeocode = SNSearch.geocode;
    if (typeof origGeocode === 'function') {
      SNSearch.geocode = async function (q) {
        var qq = String(q || '').trim();
        if (isGreekQuery(qq) && !/\bgreece|ελλάδ|hellas|rhodes island\b/i.test(qq)) {
          qq = qq + ' Rhodes Greece';
        }
        var hits = await origGeocode.call(SNSearch, qq);
        if (isGreekQuery(q)) {
          hits = clusterHits(hits, AEGEAN);
          hits = (hits || []).slice().sort(function (a, b) {
            return distKm(AEGEAN, a) - distKm(AEGEAN, b);
          });
        }
        return hits;
      };
    }

    var origSpin = SNSearch.spinEarthToHits;
    if (typeof origSpin === 'function') {
      SNSearch.spinEarthToHits = function (hits) {
        hits = clusterHits(hits, (hits && hits[0]) || AEGEAN);
        return origSpin.call(SNSearch, hits);
      };
    }

    var origRF = SNSearch.researchFirst;
    if (typeof origRF === 'function') {
      SNSearch.researchFirst = async function (query, opts) {
        opts = opts || {};
        var q = String(query || '').trim();
        if (isGreekQuery(q)) {
          opts = Object.assign({}, opts, { forcePlace: true });
        }
        var out = await origRF.call(SNSearch, q, opts);
        try {
          if (out && out.places && isGreekQuery(q)) {
            out.places = clusterHits(out.places, AEGEAN);
            var pin = out.places[0];
            if (pin && pin.lat != null && global.SNGlobe) {
              if (SNGlobe.goToPlace) {
                SNGlobe.goToPlace(pin.lat, pin.lng, {
                  tier: 'regional',
                  pulse: true,
                  label: String(pin.name || 'Rhodes').slice(0, 22),
                  skipScan: true,
                  openMap: false,
                });
              } else if (SNGlobe.flyNear) {
                SNGlobe.flyNear(pin.lat, pin.lng);
              } else if (SNGlobe.pulse) {
                SNGlobe.pulse(pin.lat, pin.lng, 0x14c3f3, 'RODOS', 12000);
              }
            }
          }
        } catch (_) {}
        return out;
      };
    }
  }

  function cliLog(msg, kind) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, kind || 'ok');
    } catch (_) {}
  }

  function focusPos() {
    return (
      global._snPhysPos ||
      global._snLastPos ||
      (global.SNCli && SNCli.lastGps && SNCli.lastGps()) ||
      (global.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      null
    );
  }

  function pinAt(lat, lng, label) {
    try {
      if (global.SNGlobe && SNGlobe.pulse)
        SNGlobe.pulse(lat, lng, 0x14c3f3, String(label || 'PIN').slice(0, 16), 20000);
      if (global.SNGlobe && SNGlobe.goToPlace)
        SNGlobe.goToPlace(lat, lng, { tier: 'local', pulse: true, label: label, openMap: false });
      if (global.SNMap && SNMap.markYou) SNMap.markYou(lat, lng, label || 'PIN');
    } catch (_) {}
    try {
      var bag = JSON.parse(localStorage.getItem('sn:pins-v1') || '[]');
      bag.unshift({ lat: lat, lng: lng, label: label || 'PIN', t: Date.now() });
      localStorage.setItem('sn:pins-v1', JSON.stringify(bag.slice(0, 40)));
    } catch (_) {}
  }

  function runAdd(id) {
    var pos = focusPos();
    if (id === 'pin') {
      if (!pos || pos.lat == null) {
        cliLog('ADD · Pin · locate first, then + again.', 'ok');
        try {
          if (global.SNCli && SNCli.run) void SNCli.run('locate');
        } catch (_) {}
        return;
      }
      pinAt(pos.lat, pos.lng, 'MY PLACE');
      cliLog('PIN · ' + pos.lat.toFixed(5) + ', ' + pos.lng.toFixed(5) + ' · on globe', 'ok');
      try {
        if (global.SNCli && SNCli.preview) SNCli.preview('pin set');
      } catch (_) {}
      return;
    }
    if (id === 'targets' || id === 'poly') {
      cliLog('POLY · type: poly   or tap the diamond button after Locate.', 'ok');
      try {
        if (global.SNCli && SNCli.run) void SNCli.run('poly');
      } catch (_) {}
      return;
    }
    if (id === 'vendor' || id === 'shop') {
      if (global.SNTopo && SNTopo.runAddOption) {
        SNTopo.runAddOption('vendor');
        return;
      }
      try {
        if (global.SNCli && SNCli.run) void SNCli.run('list shop My Shop');
      } catch (_) {}
      cliLog('VENDOR · shop listing started · add menu items next', 'ok');
      return;
    }
    if (id === 'social' || id === 'post' || id === 'cast') {
      cliLog('POST · type in CLI: post <text>  · attaches to your pin / locate', 'ok');
      return;
    }
    if (id === 'emergency' || id === 'sos' || id === 'task') {
      if (!pos || pos.lat == null) {
        cliLog('TASK · locate first.', 'ok');
        return;
      }
      pinAt(pos.lat, pos.lng, 'TASK');
      cliLog('TASK · pinned at you. Type in CLI: task <what you need>', 'ok');
      return;
    }
    cliLog('ADD · ' + id + ' · use CLI: pin | post | task | vendor', 'dim');
  }

  function patchFieldAdd() {
    if (!global.SNField || SNField._p0Add) return;
    SNField._p0Add = true;
    SNField.runAddOption = runAdd;
    if (typeof SNField.paintRibbon === 'function' && !SNField._p0PaintHook) {
      var origPaint = SNField.paintRibbon.bind(SNField);
      SNField.paintRibbon = function () {
        var r = origPaint.apply(this, arguments);
        setTimeout(function () {
          clampFace();
          hideCoach();
          wireAddButton();
        }, 0);
        return r;
      };
      SNField._p0PaintHook = true;
    }
  }

  function wireAddButton() {
    try {
      var btn =
        document.getElementById('sn-rib-add') ||
        document.querySelector('#sn-task-ribbon [data-act="add"]');
      if (!btn || btn._p0AddWired) return;
      btn._p0AddWired = true;
      btn.addEventListener(
        'click',
        function (ev) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (_) {}
          try {
            if (global.SNField && SNField.ribbonAct) {
              SNField.ribbonAct('add');
              return;
            }
          } catch (_) {}
          try {
            if (global.SNTopo && SNTopo.openAddMenu) {
              SNTopo.openAddMenu();
              return;
            }
          } catch (_) {}
          cliLog('ADD · pin · post · task · vendor · poly', 'ok');
        },
        true
      );
    } catch (_) {}
  }

  function patchCliCommands() {
    if (!global.SNCli || SNCli._p0Cmds) return;
    SNCli._p0Cmds = true;
    var origRun = SNCli.run;
    if (typeof origRun !== 'function') return;
    SNCli.run = async function (line) {
      var raw = String(line || '').trim();
      var low = raw.toLowerCase();
      if (low === 'pin' || low.indexOf('pin ') === 0) {
        var pos = focusPos();
        var label = raw.slice(3).trim() || 'MY PLACE';
        if (!pos || pos.lat == null) {
          cliLog('PIN · locate first.', 'ok');
          return origRun.call(SNCli, 'locate');
        }
        pinAt(pos.lat, pos.lng, label);
        cliLog('PIN · ' + label + ' · ' + pos.lat.toFixed(5) + ', ' + pos.lng.toFixed(5), 'ok');
        return true;
      }
      if (low === 'post' || low.indexOf('post ') === 0) {
        var text = raw.slice(4).trim();
        if (!text) {
          cliLog('POST · type: post <what you want to say on this place>', 'ok');
          return true;
        }
        var p2 = focusPos();
        if (p2 && p2.lat != null) pinAt(p2.lat, p2.lng, 'POST');
        try {
          var posts = JSON.parse(localStorage.getItem('sn:posts-v1') || '[]');
          posts.unshift({
            text: text,
            lat: p2 && p2.lat,
            lng: p2 && p2.lng,
            t: Date.now(),
            user: (global.SNAuth && SNAuth.user && SNAuth.user.email) || 'guest',
          });
          localStorage.setItem('sn:posts-v1', JSON.stringify(posts.slice(0, 50)));
        } catch (_) {}
        cliLog('POST · ' + text.slice(0, 120), 'ok');
        return true;
      }
      if (low === 'task' || low.indexOf('task ') === 0) {
        var need = raw.slice(4).trim();
        if (!need) {
          cliLog('TASK · type: task <what you need done>', 'ok');
          return true;
        }
        var p3 = focusPos();
        if (p3 && p3.lat != null) pinAt(p3.lat, p3.lng, 'TASK');
        cliLog('TASK · ' + need.slice(0, 120) + (p3 ? ' · pinned' : ' · locate to pin'), 'ok');
        return true;
      }
      if (low === 'vendor' || low.indexOf('vendor ') === 0 || low.indexOf('shop ') === 0) {
        var name = raw.replace(/^(vendor|shop)\s+/i, '').trim();
        if (!name) {
          cliLog('VENDOR · type: vendor <shop name>', 'ok');
          return true;
        }
        cliLog('VENDOR · searching ' + name + ' near you…', 'ok');
        try {
          if (global.SNSearch && SNSearch.researchFirst) {
            await SNSearch.researchFirst(name, { log: cliLog, preview: SNCli.preview || function () {} });
          }
        } catch (_) {}
        return true;
      }
      return origRun.call(SNCli, line);
    };
  }

  function wireMapHold() {
    if (global._snMapHoldWired) return;
    global._snMapHoldWired = true;
    var last = 0;
    function onHold(lat, lng) {
      var now = Date.now();
      if (now - last < 800) return;
      last = now;
      global._snLastPos = { lat: lat, lng: lng };
      pinAt(lat, lng, 'HOLD');
      cliLog(
        'MAP · ' +
          lat.toFixed(5) +
          ', ' +
          lng.toFixed(5) +
          ' · CLI: pin <name> · post <text> · task <need>',
        'ok'
      );
      try {
        if (global.SNCli && SNCli.preview) SNCli.preview('map hold · pin/post/task');
      } catch (_) {}
    }
    try {
      document.addEventListener(
        'contextmenu',
        function (ev) {
          var map = global.SNMap && SNMap.map;
          if (!map || !map.mouseEventToLatLng) return;
          try {
            var ll = map.mouseEventToLatLng(ev);
            if (ll && ll.lat != null) {
              ev.preventDefault();
              onHold(ll.lat, ll.lng);
            }
          } catch (_) {}
        },
        true
      );
    } catch (_) {}
    var downT = 0;
    var downX = 0;
    var downY = 0;
    document.addEventListener(
      'pointerdown',
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (!t.closest('#globe, #globe-canvas, canvas, #city-map')) return;
        if (t.closest('#sn-topchrome, #dock, #panel, #sn-task-ribbon, #cli-form, #stc-cmd')) return;
        downT = Date.now();
        downX = ev.clientX;
        downY = ev.clientY;
      },
      true
    );
    document.addEventListener(
      'pointerup',
      function (ev) {
        if (!downT) return;
        var held = Date.now() - downT;
        var moved = Math.hypot(ev.clientX - downX, ev.clientY - downY);
        downT = 0;
        if (held < 550 || moved > 14) return;
        try {
          var map = global.SNMap && SNMap.map;
          if (map && map.mouseEventToLatLng) {
            var ll = map.mouseEventToLatLng(ev);
            if (ll && ll.lat != null) {
              onHold(ll.lat, ll.lng);
              return;
            }
          }
        } catch (_) {}
        var fp = focusPos();
        if (fp && fp.lat != null) onHold(fp.lat, fp.lng);
        else cliLog('MAP HOLD · locate first so we know where you are.', 'ok');
      },
      true
    );
  }

  function injectCss() {
    var id = 'sn-p0-ops-css';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = [
      '#sn-task-ribbon .sn-rib-btn{width:36px!important;height:36px!important;max-width:36px!important;max-height:36px!important;overflow:hidden!important;border-radius:50%!important;flex:0 0 36px!important}',
      '#sn-task-ribbon img,.sn-rib-face{width:28px!important;height:28px!important;max-width:28px!important;max-height:28px!important;border-radius:50%!important;object-fit:cover!important}',
      'body.sn-in #cli-coach{display:none!important;height:0!important;padding:0!important;margin:0!important}',
      '#astranov-logo,#sn-big-logo,.astranov-logo-overlay{display:none!important;width:0!important;height:0!important}',
    ].join('');
    document.head.appendChild(s);
  }

  function boot() {
    injectCss();
    clampFace();
    hideCoach();
    patchSearch();
    patchFieldAdd();
    patchCliCommands();
    wireAddButton();
    wireMapHold();
    setTimeout(function () {
      injectCss();
      clampFace();
      hideCoach();
      patchSearch();
      patchFieldAdd();
      patchCliCommands();
      wireAddButton();
    }, 600);
    setTimeout(function () {
      clampFace();
      hideCoach();
      patchSearch();
      patchFieldAdd();
      wireAddButton();
    }, 2000);
    setTimeout(function () {
      clampFace();
      patchSearch();
      wireAddButton();
    }, 5000);
    try {
      setInterval(function () {
        clampFace();
        hideCoach();
      }, 3000);
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 1500);

  global.SNChromeP0Ops = { build: BUILD, runAdd: runAdd, clampFace: clampFace };
})(typeof window !== 'undefined' ? window : globalThis);
