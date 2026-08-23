/**
 * SNPolyScheduler — lean delivery task scheduler (SPECS money path only)
 * Power ON → offer tiles · vendor/client faces · polygon vendor→stops→client
 * Pricing: 1€/km as ceil(km/3)×3 · +3 night/heavy/VIP/private
 * 3× seal · Rai drone · park-top throwable tiles · no games
 * window.SNPolyScheduler · also wires SNMoney / SNOfferStack / SNDeliveryRules facades
 */
(function (global) {
  'use strict';

  var SYM = '€ / Æ';
  var active = false;
  var gen = 0;
  var stack = [];
  var queue = [];
  var MAX_Q = 6;
  var root = null;
  var CSS_ID = 'sn-poly-sched-css-v1';
  var wallet = { s: 80, vault: 0 };
  var physRaf = null;
  var phys = Object.create(null);
  var dragState = null;
  var dragBound = false;

  function log(m, c) {
    try {
      // Useful driver events → ops (always visible, not machine noise)
      if (global.SNCli && SNCli.ops) SNCli.ops(String(m || '').slice(0, 140));
      else if (global.SNCli && SNCli.log) SNCli.log(m, c || 'ops', true);
    } catch (_) {}
  }
  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m || '').slice(0, 48));
    } catch (_) {}
  }
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }
  function fmt(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    var x = Number(n);
    var s = Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(1);
    return s + ' ' + SYM;
  }
  function haversineKm(aLat, aLng, bLat, bLng) {
    var R = 6371;
    var dLat = ((bLat - aLat) * Math.PI) / 180;
    var dLng = ((bLng - aLng) * Math.PI) / 180;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((aLat * Math.PI) / 180) *
        Math.cos((bLat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function isNight(d) {
    d = d || new Date();
    var h = d.getHours();
    return h >= 21 || h < 9;
  }
  function pos() {
    var p =
      global._snPhysPos ||
      (global._snLastPos && global._snLastPos.lat != null ? global._snLastPos : null) ||
      (global.SNTasks && SNTasks.pos) ||
      null;
    if (p && p.lat != null) return { lat: Number(p.lat), lng: Number(p.lng) };
    // Soft only for geometry (never labeled as real GPS)
    return { lat: 37.9838, lng: 23.7275, soft: true };
  }

  function activeLoad() {
    return stack.filter(function (x) {
      return x && (x.phase === 'claimed' || x.phase === 'underway' || x.phase === 'confirming');
    });
  }

  function expandOfferCli() {
    try {
      var panel = document.getElementById('panel');
      if (panel) {
        panel.classList.remove('collapsed');
        panel.classList.add('expanded');
        panel.classList.remove('mid');
      }
    } catch (_) {}
    try {
      if (global.SNTopChrome && SNTopChrome.expand) SNTopChrome.expand();
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.beginTurn) SNCli.beginTurn();
    } catch (_) {}
    try {
      if (global.SNUi && SNUi.fitCliToContent) SNUi.fitCliToContent(12);
    } catch (_) {}
  }

  function cliLine(text, cls) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(text || '').slice(0, 220), cls || 'ok', true);
    } catch (_) {}
  }

  function dumpOfferCli(o, gate) {
    if (!o) return;
    expandOfferCli();
    var n = gate && gate.nature;
    if (!n && global.SNPolyEngine && SNPolyEngine.detectNature) n = SNPolyEngine.detectNature(o);
    var q = o.quote || {};
    var driver = pos();
    var pickKm =
      o.vLat != null ? haversineKm(driver.lat, driver.lng, o.vLat, o.vLng) : null;
    var ev = gate && gate.ev;
    cliLine('── OFFER · ' + (o.vendorName || 'Vendor') + ' → ' + (o.clientName || 'You') + ' ──', 'ok');
    cliLine(
      'Nature  ' +
        ((n && n.label) || o.nature || o.title || 'goods') +
        (n && n.temp ? ' · ' + n.temp : '') +
        (n && n.windowMin ? ' · window ' + n.windowMin + 'm' : ''),
      'ok'
    );
    cliLine(
      'Price   ' +
        (o.priceTxt || fmt(o.price)) +
        ' · ' +
        (Number(o.km) || 0).toFixed(1) +
        ' km' +
        (q.night ? ' · night +3' : '') +
        (q.heavy ? ' · heavy +3' : '') +
        (q.vip ? ' · VIP +3' : '') +
        (q.private || o.routeLocked ? ' · private exclusive' : ''),
      'ok'
    );
    cliLine(
      'Pickup  ' +
        (o.vendorName || 'vendor') +
        ' · ' +
        (o.vLat != null ? o.vLat.toFixed(4) + ', ' + o.vLng.toFixed(4) : '—') +
        (o.prepMin != null ? ' · prep ' + o.prepMin + 'm' : ''),
      'ok'
    );
    cliLine(
      'Drop    ' +
        (o.clientName || 'client') +
        ' · ' +
        (o.dLat != null ? o.dLat.toFixed(4) + ', ' + o.dLng.toFixed(4) : '—'),
      'ok'
    );
    cliLine(
      'Driver  ' +
        driver.lat.toFixed(4) +
        ', ' +
        driver.lng.toFixed(4) +
        (pickKm != null ? ' · ' + pickKm.toFixed(1) + ' km to pickup' : ''),
      'ok'
    );
    var load = activeLoad();
    if (!load.length) {
      cliLine('Combine starts your polygon · type accept or skip', 'ok');
    } else if (ev && ev.ok) {
      cliLine(
        'Combine YES · +' +
          (ev.extraKm != null ? ev.extraKm : '?') +
          ' km · +' +
          (ev.extraWait != null ? ev.extraWait : '?') +
          'm wait · stays in live polygon',
        'ok'
      );
      if (ev.tourWithout && ev.tour) {
        cliLine(
          'Tour now ' +
            (ev.tourWithout.stops || []).length +
            ' stops · ' +
            (ev.tourWithout.km || 0) +
            ' km  →  with offer ' +
            (ev.tour.stops || []).length +
            ' stops · ' +
            (ev.tour.km || 0) +
            ' km',
          'ok'
        );
      }
    } else {
      cliLine('Combine ' + ((gate && gate.reason) || 'check'), 'dim');
    }
    preview((o.vendorName || 'offer') + ' · ' + (o.priceTxt || ''));
  }

  function presentOffer(o, gate) {
    dumpOfferCli(o, gate);
    try {
      if (global.SNPolyEngine && SNPolyEngine.presentWorld) {
        SNPolyEngine.presentWorld(o, activeLoad(), gate);
      } else {
        drawPolygon(o);
      }
    } catch (_) {
      try {
        drawPolygon(o);
      } catch (e2) {}
    }
  }

  function gateOffer(o) {
    if (!global.SNPolyEngine || !SNPolyEngine.canPresent) {
      return { ok: true, ev: null, first: !activeLoad().length };
    }
    try {
      return SNPolyEngine.canPresent(activeLoad(), o);
    } catch (e) {
      return { ok: true, reason: 'gate error · allow', ev: null };
    }
  }

  /* ── Pricing (SPECS) ── */
  function natureOf(title) {
    var s = String(title || '').toLowerCase();
    if (/ice|gelato|frozen|sorbet/.test(s))
      return { id: 'frozen', label: 'Frozen', emoji: '🍦', private: true, maxParallel: 1 };
    if (/hot|pizza|food|gyros|meal|grill/.test(s))
      return { id: 'hot_food', label: 'Hot food', emoji: '🍕', private: false, maxParallel: 4 };
    if (/env|paper|doc|post|mail|letter/.test(s))
      return { id: 'documents', label: 'Documents', emoji: '✉️', private: false, maxParallel: 40 };
    if (/heavy|furniture|water|crate/.test(s))
      return { id: 'heavy', label: 'Heavy', emoji: '📦', private: false, maxParallel: 2, heavy: true };
    return { id: 'ambient', label: 'Delivery', emoji: '📦', private: false, maxParallel: 8 };
  }
  function quote(opts) {
    opts = opts || {};
    var km = Math.max(0.1, Number(opts.km) || 1);
    var n = natureOf(opts.nature || opts.product || opts.title);
    var night = opts.night != null ? !!opts.night : isNight();
    var heavy = !!(opts.heavy || n.heavy);
    var vip = !!(opts.vip || n.id === 'frozen');
    var priv = !!(opts.private || n.private);
    var distanceFee = Math.ceil(km / 3) * 3;
    var nightFee = night ? 3 : 0;
    var heavyFee = heavy ? 3 : 0;
    var vipFee = vip ? 3 : 0;
    var privateFee = priv ? 3 : 0;
    var total = distanceFee + nightFee + heavyFee + vipFee + privateFee;
    return {
      ok: true,
      km: km,
      total: total,
      distanceFee: distanceFee,
      night: night,
      nightFee: nightFee,
      heavy: heavy,
      heavyFee: heavyFee,
      vip: vip,
      vipFee: vipFee,
      private: priv,
      privateFee: privateFee,
      nature: n,
      etaMin: Math.max(8, Math.round((km / 22) * 60 + 8)),
      windowMin: n.id === 'frozen' ? 25 : n.id === 'hot_food' ? 45 : n.id === 'documents' ? 180 : 60,
      metaLine:
        (km < 10 ? km.toFixed(1) : Math.round(km)) +
        ' km · ' +
        (night ? 'night' : 'day') +
        (priv ? ' · private' : ''),
    };
  }

  /* ── Avatars ── */
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }
  function avatarUrl(kind, name, url) {
    if (url && (/^https?:\/\//i.test(url) || String(url).indexOf('data:image') === 0)) return String(url);
    var hue = kind === 'vendor' ? 32 : 210;
    var ini = initials(name);
    var r = kind === 'vendor' ? 14 : 48;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="hsl(' + hue + ',85%,62%)"/>' +
      '<stop offset="100%" stop-color="hsl(' + ((hue + 40) % 360) + ',70%,36%)"/>' +
      '</linearGradient></defs>' +
      '<rect width="72" height="72" rx="' + r + '" fill="#061428"/>' +
      '<rect x="3" y="3" width="66" height="66" rx="' + Math.max(8, r - 4) + '" fill="url(#g)"/>' +
      '<text x="36" y="43" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="22" fill="#eaf4ff">' +
      ini.replace(/[<>&]/g, '') +
      '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  /* ── CSS ── */
  function ensureCss() {
    var prev = document.getElementById(CSS_ID);
    if (prev) prev.remove();
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = [
      '#sn-poly-root{position:fixed;inset:0;z-index:105;pointer-events:none!important;overflow:visible}',
      /* Compact default tile — leaves map/polygon visible */
      '#sn-poly-root .sn-pt{pointer-events:auto;position:fixed;left:50%;top:58px;transform:translateX(-50%);',
      'width:min(72vw,210px);border-radius:18px;color:#eaf4ff;cursor:grab;touch-action:none;user-select:none;',
      'background:linear-gradient(165deg,rgba(2,18,52,.93),rgba(0,10,32,.96));',
      'border:1.5px solid rgba(50,150,255,.72);',
      'box-shadow:0 8px 22px rgba(0,0,0,.45),0 0 16px rgba(20,100,255,.35);',
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);max-height:min(34vh,220px);overflow:hidden}',
      '#sn-poly-root .sn-pt.dragging{cursor:grabbing;z-index:160}',
      '#sn-poly-root .sn-pt.size-min{width:min(58vw,150px);border-radius:999px;max-height:none}',
      '#sn-poly-root .sn-pt.size-min .sn-pt-body,#sn-poly-root .sn-pt.size-min .sn-pt-tray{display:none!important}',
      '#sn-poly-root .sn-pt.size-min .sn-pt-main{padding:2px 10px 6px 12px}',
      '#sn-poly-root .sn-pt.size-max{width:min(88vw,300px);max-height:min(52vh,360px);overflow:auto}',
      '#sn-poly-root .sn-pt-chrome{display:flex;align-items:center;justify-content:center;gap:6px;padding:4px 8px 2px}',
      '#sn-poly-root .sn-pt-cbtn{width:22px;height:22px;border-radius:50%;border:1px solid rgba(80,160,255,.5);',
      'background:rgba(8,28,64,.75);color:#b8d8ff;font:700 13px/1 system-ui;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;padding:0}',
      '#sn-poly-root .sn-pt-cbtn.min,#sn-poly-root .sn-pt-cbtn[data-size="min"]{color:#3a2c00;background:radial-gradient(circle at 35% 30%,#ffe58a,#e0b000 70%);border-color:#c9a000}',
      '#sn-poly-root .sn-pt-cbtn.close{color:#fff;background:radial-gradient(circle at 35% 30%,#ff8a8a,#c62828 70%);border-color:#ff4444}',
      '#sn-poly-root .sn-pt-cbtn.max{color:#041a0c;background:radial-gradient(circle at 35% 30%,#8dffb4,#1a9e4a 70%);border-color:#2ecc71}',
      '#sn-poly-root .sn-pt-title{flex:1;text-align:center;font:700 8px/1 system-ui;letter-spacing:.12em;',
      'text-transform:uppercase;color:rgba(120,180,255,.75)}',
      '#sn-poly-root .sn-pt-main{display:flex;align-items:center;gap:6px;padding:2px 10px 6px 12px}',
      '#sn-poly-root .sn-pt-price{font:800 14px/1.05 ui-monospace,Menlo,monospace;color:#7ec8ff;',
      'text-shadow:0 0 10px rgba(60,160,255,.95)}',
      '#sn-poly-root .sn-pt-line{font:600 9px/1.2 system-ui;color:#9ec4ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px}',
      '#sn-poly-root .sn-pt-acts{display:flex;gap:4px;margin-left:auto}',
      '#sn-poly-root .sn-pt-btn{width:28px;height:28px;border-radius:50%;border:1px solid rgba(80,160,255,.45);',
      'background:rgba(10,40,90,.55);color:#b8d8ff;font:700 12px/1 system-ui;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;padding:0}',
      '#sn-poly-root .sn-pt-btn.ok{border-color:rgba(0,230,160,.65);color:#8fffd4;background:rgba(0,100,70,.4)}',
      '#sn-poly-root .sn-pt-btn.no{color:#a0bdd8}',
      '#sn-poly-root .sn-pt-body{padding:0 10px 6px;display:flex;flex-direction:column;gap:3px}',
      '#sn-poly-root .sn-pt-party{display:flex;align-items:center;gap:5px}',
      '#sn-poly-root .sn-pt-av{width:26px;height:26px;border-radius:50%;object-fit:cover;flex:0 0 auto;',
      'border:1.5px solid rgba(100,180,255,.55);box-shadow:0 0 8px rgba(40,120,255,.3);background:#0a1e40}',
      '#sn-poly-root .sn-pt-party.v .sn-pt-av{border-radius:8px;border-color:rgba(255,190,60,.65)}',
      '#sn-poly-root .sn-pt-tag{font:800 7px/1 system-ui;letter-spacing:.08em;text-transform:uppercase;',
      'padding:2px 5px;border-radius:999px;border:1px solid rgba(80,160,255,.45);color:#9ad4ff}',
      '#sn-poly-root .sn-pt-party.v .sn-pt-tag{border-color:rgba(255,190,60,.5);color:#ffd080}',
      '#sn-poly-root .sn-pt-nm{font:700 11px/1.15 system-ui;color:#eaf4ff;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#sn-poly-root .sn-pt-role{font:500 8px/1.15 system-ui;color:#6a94c4;margin-left:auto}',
      '#sn-poly-root .sn-pt-stops{padding:0 12px 6px;display:flex;flex-direction:column;gap:4px}',
      '#sn-poly-root .sn-pt-stop{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:14px;',
      'background:rgba(8,28,64,.65);border:1px solid rgba(50,120,220,.35);font:600 11px/1.2 system-ui;color:#d8ecff}',
      '#sn-poly-root .sn-pt-stop.locked{border-color:rgba(255,190,60,.45)}',
      '#sn-poly-root .sn-pt-stop .ord{font:800 10px/1 ui-monospace,Menlo,monospace;color:#7ec8ff;width:16px}',
      '#sn-poly-root .sn-pt-stop .mv{width:26px;height:26px;border-radius:50%;border:1px solid rgba(80,160,255,.4);',
      'background:rgba(10,40,90,.5);color:#b8d8ff;font:700 12px/1 system-ui;cursor:pointer;padding:0}',
      '#sn-poly-root .sn-pt-stop .mv:disabled{opacity:.3;pointer-events:none}',
      '#sn-poly-root .sn-pt-note{font:600 9px/1.3 system-ui;color:#6a94c4;text-align:center;padding:0 12px 6px}',
      '#sn-poly-root .sn-pt-note.lock{color:#ffd080}',
      '#sn-poly-root .sn-pt-tray{padding:0 14px 12px;display:none;flex-direction:column;gap:8px}',
      '#sn-poly-root .sn-pt.size-max .sn-pt-tray{display:flex}',
      '#sn-poly-root .sn-pt-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:5px}',
      '#sn-poly-root .sn-pt-chip{font:700 9px/1 system-ui;letter-spacing:.04em;padding:5px 10px;border-radius:999px;',
      'background:rgba(16,48,110,.55);border:1px solid rgba(80,160,255,.35);color:#a8d0ff}',
      '#sn-poly-root .sn-pt-chip.priv{border-color:rgba(255,200,80,.55);color:#ffe09a}',
      '#sn-poly-root .sn-pt-chip.night{border-color:rgba(140,120,255,.5);color:#c8b8ff}',
      '#sn-poly-root .sn-pt-wide{display:flex;gap:8px}',
      '#sn-poly-root .sn-pt-wide button{flex:1;min-height:40px;border-radius:999px;font:700 12px/1 system-ui;',
      'padding:10px;cursor:pointer;border:1px solid rgba(80,160,255,.4);background:rgba(10,40,90,.45);color:#b8d8ff}',
      '#sn-poly-root .sn-pt-wide button.ok{border-color:rgba(0,230,160,.65);background:linear-gradient(180deg,rgba(0,200,140,.35),rgba(0,100,70,.4));color:#8fffd4}',
      '#sn-poly-root .sn-pt-wide button.pay{border-color:rgba(255,210,80,.7);background:linear-gradient(180deg,rgba(200,160,20,.4),rgba(100,70,0,.4));color:#ffe9a0}',
      '#sn-poly-root .sn-pt-conf{display:flex;gap:6px}',
      '#sn-poly-root .sn-pt-conf button{min-height:36px;min-width:62px;border-radius:999px;flex:1;min-height:34px;border-radius:999px;font:700 10px/1 system-ui;',
      'border:1px solid rgba(0,220,180,.45);background:rgba(0,60,50,.4);color:#9fffe0;cursor:pointer}',
      '#sn-poly-root .sn-pt-conf button.on{border-color:rgba(0,255,180,.8);box-shadow:0 0 12px rgba(0,220,160,.35)}',
      '#sn-poly-root .sn-pt-seal{font:700 9px/1.2 system-ui;letter-spacing:.08em;text-transform:uppercase;',
      'color:rgba(100,180,255,.7);text-align:center}',
      '#sn-poly-root .sn-pt-drone{font:700 9px/1.2 system-ui;letter-spacing:.12em;text-transform:uppercase;',
      'color:#7ad4ff;text-align:center;text-shadow:0 0 10px rgba(50,180,255,.6)}',
      '#sn-poly-root .sn-pt-prog{height:5px;border-radius:99px;background:rgba(20,50,90,.7);overflow:hidden}',
      '#sn-poly-root .sn-pt-prog>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#1a8cff,#3dffc0);transition:width .35s}',
      '#sn-poly-root .sn-qhint{position:fixed;left:50%;top:52px;transform:translateX(-50%);pointer-events:none;',
      'font:700 9px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:rgba(90,160,255,.75)}',
      /* Kill game junk */
      '#sn-game-dock,.sn-game-dock,#sn-earth-ops-chip,#coach,#sn-miner-terms{display:none!important;pointer-events:none!important}',
    ].join('');
    document.head.appendChild(st);
  }

  function ensureRoot() {
    ensureCss();
    root = document.getElementById('sn-poly-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'sn-poly-root';
      document.body.appendChild(root);
    }
    // Hide legacy offer stack if present
    try {
      var old = document.getElementById('sn-offer-stack');
      if (old) {
        old.innerHTML = '';
        old.style.display = 'none';
      }
    } catch (_) {}
    return root;
  }

  function find(id) {
    for (var i = 0; i < stack.length; i++) if (stack[i].id === id) return stack[i];
    for (var j = 0; j < queue.length; j++) if (queue[j].id === id) return queue[j];
    return null;
  }

  /** Ensure order is on active stack (pull from queue if needed) */
  function ensureOnStack(o) {
    if (!o) return null;
    if (stack.some(function (x) { return x.id === o.id; })) return o;
    queue = queue.filter(function (x) { return x.id !== o.id; });
    stack.unshift(o);
    return o;
  }

  function buildStops(o) {
    if (o.stops && o.stops.length >= 2) return o.stops;
    var locked = !!(o.quote && o.quote.private) || !!o.routeLocked;
    var stops = [
      {
        id: 'v',
        role: 'vendor',
        name: o.vendorName || 'Vendor',
        lat: o.vLat,
        lng: o.vLng,
        locked: true,
      },
    ];
    (o.mids || []).forEach(function (m, i) {
      stops.push({
        id: m.id || 'm' + i,
        role: 'stop',
        name: m.name || 'Stop ' + (i + 1),
        lat: m.lat,
        lng: m.lng,
        locked: locked,
      });
    });
    stops.push({
      id: 'c',
      role: 'client',
      name: o.clientName || 'You',
      lat: o.dLat,
      lng: o.dLng,
      locked: true,
    });
    if (locked) stops = [stops[0], stops[stops.length - 1]];
    o.stops = stops;
    o.routeLocked = locked;
    return stops;
  }

  function openOrderTile(id) {
    var o = find(id);
    if (!o) {
      // try archive / past_ prefix
      var raw = String(id || '').replace(/^live:poly_/, '').replace(/^past_/, '');
      o = find(raw);
      if (!o && global.SNPolyScheduler && SNPolyScheduler.archive) {
        var arch = SNPolyScheduler.archive().find(function (x) {
          return x.id === raw || x.id === id;
        });
        if (arch) {
          o = Object.assign({}, arch, { phase: 'done', uiSize: 'max' });
          // temporary stack view for archive detail
          if (!stack.some(function (x) { return x.id === o.id; })) {
            stack.unshift(o);
          }
        }
      }
    }
    if (!o) return false;
    o.uiSize = 'max';
    // Park tile above polygon (upper band, not covering whole map)
    try {
      o.uiY = 56;
      o.uiX = Math.round(((window.innerWidth || 390) - 220) / 2);
    } catch (_) {}
    paint();
    drawPolygon(o);
    try {
      if (global.SNCli && SNCli.ops)
        SNCli.ops('Order detail · ' + (o.vendorName || '') + ' → ' + (o.clientName || ''));
    } catch (_) {}
    return true;
  }

  function drawPolygon(o) {
    if (!o) return;
    var stops = buildStops(o);
    if (stops.length < 2) return;
    var wps = stops.map(function (s) {
      return { lat: s.lat, lng: s.lng, label: s.name };
    });
    var locked = !!o.routeLocked;
    try {
      if (global.SNField && SNField.startDeliveryRoute) {
        void SNField.startDeliveryRoute({
          id: 'live:poly_' + o.id,
          vendorLat: wps[0].lat,
          vendorLng: wps[0].lng,
          dropLat: wps[wps.length - 1].lat,
          dropLng: wps[wps.length - 1].lng,
          waypoints: wps,
          stops: wps.slice(1, -1),
          label: String((o.vendorName || 'V') + ' → ' + (o.clientName || 'C')).slice(0, 28),
          driver: locked ? 'private' : o.drone ? 'Rai drone' : 'route',
          color: locked ? 'rgba(255,200,80,0.95)' : 'rgba(50,150,255,0.95)',
          etaMin: (o.quote && o.quote.etaMin) || 18,
          speedKmh: locked ? 28 : 22,
          preview: true,
        });
      }
    } catch (_) {}
    try {
      if (global.SNField && SNField.setRadarExpanded) SNField.setRadarExpanded(true);
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.pulse) {
        SNGlobe.pulse(wps[0].lat, wps[0].lng, locked ? 0xffc83d : 0x3d9eff, String(o.vendorName || 'Vendor').slice(0, 12), 10000);
        SNGlobe.pulse(wps[wps.length - 1].lat, wps[wps.length - 1].lng, 0x7ec8ff, String(o.clientName || 'You').slice(0, 12), 10000);
      }
    } catch (_) {}
  }

  function recomputeKm(o) {
    var stops = buildStops(o);
    var km = 0;
    for (var i = 0; i < stops.length - 1; i++) {
      km += haversineKm(stops[i].lat, stops[i].lng, stops[i + 1].lat, stops[i + 1].lng) || 0;
    }
    o.km = km;
    o.quote = quote({
      km: km,
      nature: o.nature || o.title,
      night: o.quote && o.quote.night,
      heavy: o.quote && o.quote.heavy,
      vip: o.quote && o.quote.vip,
      private: o.routeLocked || (o.quote && o.quote.private),
    });
    o.price = o.quote.total;
    o.priceTxt = fmt(o.price);
  }

  function moveStop(oid, sid, dir) {
    var o = find(oid);
    if (!o || o.routeLocked) {
      log('Route locked · private deal', 'err');
      return;
    }
    var stops = buildStops(o);
    var idx = -1;
    for (var i = 0; i < stops.length; i++) if (stops[i].id === sid) idx = i;
    if (idx <= 0 || idx >= stops.length - 1) return;
    var j = idx + dir;
    if (j <= 0 || j >= stops.length - 1) return;
    var t = stops[idx];
    stops[idx] = stops[j];
    stops[j] = t;
    o.stops = stops;
    o.mids = stops.slice(1, -1).map(function (s) {
      return { id: s.id, name: s.name, lat: s.lat, lng: s.lng };
    });
    recomputeKm(o);
    drawPolygon(o);
    paint();
    log('Polygon rearranged', 'ok');
  }

  /* ── Physics throw ── */
  function physLoop() {
    physRaf = null;
    var w = window.innerWidth || 390;
    var h = window.innerHeight || 844;
    var any = false;
    Object.keys(phys).forEach(function (id) {
      var ph = phys[id];
      if (!ph || !ph.el || !document.body.contains(ph.el)) {
        delete phys[id];
        return;
      }
      var el = ph.el;
      var o = ph.o;
      var cw = el.offsetWidth || 200;
      var ch = el.offsetHeight || 100;
      var x = o.uiX != null ? o.uiX : 0;
      var y = o.uiY != null ? o.uiY : 0;
      ph.vx *= 0.935;
      ph.vy *= 0.935;
      x += ph.vx;
      y += ph.vy;
      if (x < 4) {
        x = 4;
        ph.vx = Math.abs(ph.vx) * 0.72;
      } else if (x + cw > w - 4) {
        x = w - 4 - cw;
        ph.vx = -Math.abs(ph.vx) * 0.72;
      }
      if (y < 4) {
        y = 4;
        ph.vy = Math.abs(ph.vy) * 0.72;
      } else if (y + ch > h - 4) {
        y = h - 4 - ch;
        ph.vy = -Math.abs(ph.vy) * 0.72;
      }
      o.uiX = x;
      o.uiY = y;
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
      el.style.transform = 'none';
      if (Math.hypot(ph.vx, ph.vy) > 0.35) any = true;
      else delete phys[id];
    });
    if (any || Object.keys(phys).length) physRaf = requestAnimationFrame(physLoop);
  }

  function ensureDragGlobals() {
    if (dragBound) return;
    dragBound = true;
    function onMove(ev) {
      if (!dragState) return;
      var pe = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
      var st = dragState;
      var now = performance.now();
      var dx = pe.clientX - st.startX;
      var dy = pe.clientY - st.startY;
      var w = window.innerWidth || 390;
      var h = window.innerHeight || 844;
      var cw = st.card.offsetWidth || 200;
      var ch = st.card.offsetHeight || 100;
      var nl = Math.max(-cw * 0.3, Math.min(w - cw * 0.7, st.origL + dx));
      var nt = Math.max(-ch * 0.2, Math.min(h - ch * 0.5, st.origT + dy));
      st.card.style.left = nl + 'px';
      st.card.style.top = nt + 'px';
      st.card.style.transform = 'none';
      st.o.uiX = nl;
      st.o.uiY = nt;
      var dt = Math.max(1, now - st.lastT);
      st.vx = st.vx * 0.35 + ((pe.clientX - st.lastX) / dt) * 0.65;
      st.vy = st.vy * 0.35 + ((pe.clientY - st.lastY) / dt) * 0.65;
      st.lastX = pe.clientX;
      st.lastY = pe.clientY;
      st.lastT = now;
      if (ev.cancelable) ev.preventDefault();
    }
    function onUp() {
      if (!dragState) return;
      var st = dragState;
      dragState = null;
      st.card.classList.remove('dragging');
      var speed = Math.hypot(st.vx, st.vy);
      if (speed > 0.08) {
        var throwVx = st.vx * 18;
        var throwVy = st.vy * 18;
        var mag = Math.hypot(throwVx, throwVy);
        if (mag > 48) {
          throwVx = (throwVx / mag) * 48;
          throwVy = (throwVy / mag) * 48;
        }
        phys[st.o.id] = { el: st.card, o: st.o, vx: throwVx, vy: throwVy };
        if (!physRaf) physRaf = requestAnimationFrame(physLoop);
      }
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function bindTile(card, o) {
    ensureDragGlobals();
    if (o.uiX == null || o.uiY == null) {
      var w = Math.min((window.innerWidth || 390) * 0.92, 300);
      o.uiX = Math.round(((window.innerWidth || 390) - w) / 2);
      o.uiY = 56;
    }
    card.style.left = Math.round(o.uiX) + 'px';
    card.style.top = Math.round(o.uiY) + 'px';
    card.style.transform = 'none';
    card.onpointerdown = function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('button,a,input')) return;
      if (phys[o.id]) delete phys[o.id];
      var rect = card.getBoundingClientRect();
      card.classList.add('dragging');
      o.uiX = rect.left;
      o.uiY = rect.top;
      dragState = {
        card: card,
        o: o,
        startX: ev.clientX,
        startY: ev.clientY,
        origL: rect.left,
        origT: rect.top,
        lastT: performance.now(),
        lastX: ev.clientX,
        lastY: ev.clientY,
        vx: 0,
        vy: 0,
      };
      if (ev.cancelable) ev.preventDefault();
    };
  }

  /** Collapse chrome so map + polygon stay visible under the offer */
  function focusChrome(on) {
    try {
      document.body.classList.toggle('sn-offer-focus', !!on);
    } catch (_) {}
    try {
      var panel = document.getElementById('sn-topchrome-panel');
      if (panel) {
        if (on) {
          panel.dataset.preFocus = panel.classList.contains('expanded')
            ? 'expanded'
            : panel.classList.contains('mid')
              ? 'mid'
              : 'collapsed';
          panel.classList.remove('mid', 'expanded');
          panel.classList.add('collapsed');
        } else if (panel.dataset.preFocus) {
          panel.classList.remove('collapsed', 'mid', 'expanded');
          panel.classList.add(panel.dataset.preFocus || 'collapsed');
          delete panel.dataset.preFocus;
        }
      }
    } catch (_) {}
    try {
      var bot = document.getElementById('panel');
      if (bot && on) {
        bot.classList.remove('collapsed', 'mid');
        bot.classList.add('expanded');
      }
    } catch (_) {}
    try {
      if (global.SNField && SNField.topChrome && SNField.topChrome.set && on)
        SNField.topChrome.set('collapsed');
    } catch (_) {}
  }

  /* ── Paint ── */
  function paint() {
    try {
      var el = ensureRoot();
      if (!stack.length && !queue.length) {
        el.innerHTML = '';
        focusChrome(false);
        return;
      }
      var hint = queue.length ? '<div class="sn-qhint">' + queue.length + ' queued</div>' : '';
      el.innerHTML =
        hint +
        stack
          .map(function (o) {
            var size = o.uiSize || 'mid';
            var phase = o.phase || 'offered';
            /* Keep compact by default so polygon stays visible; max only if user hits + */
            if (!o.uiSize && phase === 'offered') size = 'mid';
            var q = o.quote || {};
            var conf = o.confirms || { client: false, vendor: false, driver: false };
            var canPay = phase === 'confirming' && conf.client && conf.vendor && conf.driver;
            var stops = buildStops(o);
            var locked = !!o.routeLocked;
            var chips = '';
            var ch = [];
            if (q.nature) ch.push({ t: (q.nature.emoji || '') + ' ' + q.nature.label, c: '' });
            if (q.night) ch.push({ t: 'Night +3', c: 'night' });
            if (q.heavy) ch.push({ t: 'Heavy +3', c: '' });
            if (q.vip) ch.push({ t: 'VIP +3', c: '' });
            if (q.private) ch.push({ t: 'Private +3', c: 'priv' });
            if (locked) ch.push({ t: 'Route lock', c: 'priv' });
            if (o.prepMin != null) ch.push({ t: 'Prep ' + o.prepMin + 'm', c: '' });
            if (o.tourKm != null) ch.push({ t: 'Tour ' + o.tourKm + 'km', c: '' });
            if (o.drone) ch.push({ t: 'Rai drone', c: '' });
            chips =
              '<div class="sn-pt-chips">' +
              ch
                .map(function (x) {
                  return '<span class="sn-pt-chip ' + esc(x.c) + '">' + esc(x.t) + '</span>';
                })
                .join('') +
              '</div>';
            var stopsHtml = '';
            if (size === 'max' && stops.length) {
              stopsHtml =
                '<div class="sn-pt-stops">' +
                stops
                  .map(function (s, si) {
                    var mid = si > 0 && si < stops.length - 1;
                    return (
                      '<div class="sn-pt-stop' +
                      (s.locked || locked ? ' locked' : '') +
                      '"><span class="ord">' +
                      (si + 1) +
                      '</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                      esc((s.role === 'vendor' ? '🏪 ' : s.role === 'client' ? '📍 ' : '• ') + s.name) +
                      '</span>' +
                      (mid && !locked
                        ? '<button type="button" class="mv" data-mv="up" data-sid="' +
                          esc(s.id) +
                          '" data-oid="' +
                          esc(o.id) +
                          '"' +
                          (si <= 1 ? ' disabled' : '') +
                          '>↑</button><button type="button" class="mv" data-mv="dn" data-sid="' +
                          esc(s.id) +
                          '" data-oid="' +
                          esc(o.id) +
                          '"' +
                          (si >= stops.length - 2 ? ' disabled' : '') +
                          '>↓</button>'
                        : locked
                          ? '<span style="font:700 8px system-ui;color:#ffd080">LOCK</span>'
                          : '') +
                      '</div>'
                    );
                  })
                  .join('') +
                '</div><div class="sn-pt-note' +
                (locked ? ' lock' : '') +
                '">' +
                esc(
                  locked
                    ? 'Straight private deal · polygon fixed'
                    : 'Drag tile · rearrange mid-stops · ends fixed'
                ) +
                '</div>';
            }
            var primary =
              phase === 'offered'
                ? 'Take'
                : phase === 'claimed'
                  ? 'Start'
                  : phase === 'underway'
                    ? 'Arrive'
                    : phase === 'confirming'
                      ? canPay
                        ? 'Settle'
                        : '3× OK'
                      : 'Close';
            var pAct =
              phase === 'offered'
                ? 'accept'
                : phase === 'claimed'
                  ? 'start'
                  : phase === 'underway'
                    ? 'arrive'
                    : phase === 'confirming'
                      ? 'settle'
                      : 'dismiss';
            var tray =
              size === 'max'
                ? '<div class="sn-pt-tray">' +
                  chips +
                  (o.drone ? '<div class="sn-pt-drone">RAI DRONE · polygon live</div>' : '') +
                  (phase === 'underway' || phase === 'claimed' || phase === 'confirming'
                    ? '<div class="sn-pt-prog"><i style="width:' + Math.min(100, o.progress || 0) + '%"></i></div>'
                    : '') +
                  (phase === 'confirming' || phase === 'underway'
                    ? '<div class="sn-pt-conf">' +
                      '<button type="button" class="' +
                      (conf.client ? 'on' : '') +
                      '" data-cf="client" data-oid="' +
                      esc(o.id) +
                      '">Client ' +
                      (conf.client ? '✓' : '○') +
                      '</button>' +
                      '<button type="button" class="' +
                      (conf.vendor ? 'on' : '') +
                      '" data-cf="vendor" data-oid="' +
                      esc(o.id) +
                      '">Vendor ' +
                      (conf.vendor ? '✓' : '○') +
                      '</button>' +
                      '<button type="button" class="' +
                      (conf.driver ? 'on' : '') +
                      '" data-cf="driver" data-oid="' +
                      esc(o.id) +
                      '">Driver ' +
                      (conf.driver ? '✓' : '○') +
                      '</button></div>'
                    : '') +
                  '<div class="sn-pt-seal">3× seal · no support judge · anti-fraud</div>' +
                  '<div class="sn-pt-wide">' +
                  '<button type="button" class="' +
                  (pAct === 'settle' ? 'pay' : 'ok') +
                  '" data-act="' +
                  pAct +
                  '" data-oid="' +
                  esc(o.id) +
                  '"' +
                  (phase === 'confirming' && !canPay ? ' disabled' : '') +
                  '>' +
                  esc(primary) +
                  '</button>' +
                  (phase === 'offered'
                    ? '<button type="button" data-act="reject" data-oid="' + esc(o.id) + '">Skip</button>'
                    : '') +
                  '</div></div>'
                : '';
            var acts =
              phase === 'offered'
                ? '<div class="sn-pt-acts">' +
                  '<button type="button" class="sn-pt-btn ok" data-act="accept" data-oid="' +
                  esc(o.id) +
                  '">✓</button>' +
                  '<button type="button" class="sn-pt-btn" data-act="map" data-oid="' +
                  esc(o.id) +
                  '">↻</button>' +
                  '<button type="button" class="sn-pt-btn no" data-act="reject" data-oid="' +
                  esc(o.id) +
                  '">×</button></div>'
                : '<div class="sn-pt-acts">' +
                  '<button type="button" class="sn-pt-btn" data-act="map" data-oid="' +
                  esc(o.id) +
                  '">↻</button>' +
                  '<button type="button" class="sn-pt-btn ok" data-act="' +
                  pAct +
                  '" data-oid="' +
                  esc(o.id) +
                  '">' +
                  (phase === 'confirming' ? (canPay ? '€' : '3') : '▸') +
                  '</button></div>';
            return (
              '<div class="sn-pt size-' +
              esc(size) +
              ' phase-' +
              esc(phase) +
              '" data-oid="' +
              esc(o.id) +
              '">' +
              '<div class="sn-pt-chrome">' +
              '<button type="button" class="sn-pt-cbtn" data-sz="min" data-oid="' +
              esc(o.id) +
              '" aria-label="Minimize">−</button>' +
              '<button type="button" class="sn-pt-cbtn close" data-sz="close" data-oid="' +
              esc(o.id) +
              '" aria-label="Close">×</button>' +
              '<span class="sn-pt-title">' +
              esc(phase.toUpperCase()) +
              '</span>' +
              '<button type="button" class="sn-pt-cbtn max" data-sz="max" data-oid="' +
              esc(o.id) +
              '" aria-label="Maximize">+</button></div>' +
              '<div class="sn-pt-main"><div><div class="sn-pt-price">' +
              esc(o.priceTxt || fmt(o.price)) +
              '</div><div class="sn-pt-line">' +
              esc(q.metaLine || o.title || '') +
              '</div></div>' +
              acts +
              '</div>' +
              (size === 'min'
                ? ''
                : '<div class="sn-pt-body">' +
                  '<div class="sn-pt-party v"><img class="sn-pt-av" alt="" width="36" height="36" src="' +
                  esc(o.vendorAv) +
                  '"/><span class="sn-pt-tag">Vendor</span><span class="sn-pt-nm">' +
                  esc(o.vendorName) +
                  '</span><span class="sn-pt-role">pickup</span></div>' +
                  '<div class="sn-pt-party c"><img class="sn-pt-av" alt="" width="36" height="36" src="' +
                  esc(o.clientAv) +
                  '"/><span class="sn-pt-tag">Client</span><span class="sn-pt-nm">' +
                  esc(o.clientName) +
                  '</span><span class="sn-pt-role">drop</span></div></div>') +
              (size === 'min' ? '' : stopsHtml) +
              tray +
              '</div>'
            );
          })
          .join('');
      el.querySelectorAll('[data-sz]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          setSize(b.getAttribute('data-oid'), b.getAttribute('data-sz'));
        };
      });
      el.querySelectorAll('[data-act]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          runAct(b.getAttribute('data-oid'), b.getAttribute('data-act'));
        };
      });
      el.querySelectorAll('[data-cf]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          setConfirm(b.getAttribute('data-oid'), b.getAttribute('data-cf'));
        };
      });
      el.querySelectorAll('[data-mv]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          moveStop(b.getAttribute('data-oid'), b.getAttribute('data-sid'), b.getAttribute('data-mv') === 'up' ? -1 : 1);
        };
      });
      el.querySelectorAll('.sn-pt').forEach(function (card) {
        var o = find(card.getAttribute('data-oid'));
        if (o) {
          bindTile(card, o);
          if (phys[o.id]) phys[o.id].el = card;
        }
      });
    } catch (err) {
      try {
        console.warn('[SNPolyScheduler] paint', err);
      } catch (_) {}
    }
  }

  function setSize(id, sz) {
    var o = find(id);
    if (!o) return;
    if (sz === 'close') {
      dismiss(id);
      return;
    }
    o.uiSize = sz === 'min' ? 'min' : sz === 'max' ? 'max' : 'mid';
    paint();
  }

  function dismiss(id) {
    stack = stack.filter(function (o) {
      return o.id !== id;
    });
    queue = queue.filter(function (o) {
      return o.id !== id;
    });
    try {
      promoteQueue();
    } catch (_) {
      if (
        !stack.some(function (o) {
          return o.phase === 'offered';
        }) &&
        queue.length
      ) {
        stack.unshift(queue.shift());
      }
    }
    try {
      if (global.SNPolyEngine && SNPolyEngine.syncTourFromStack) SNPolyEngine.syncTourFromStack(stack);
    } catch (_) {}
    paint();
  }

  function setConfirm(id, party) {
    var o = find(id);
    if (!o) return;
    o.confirms = o.confirms || { client: false, vendor: false, driver: false, at: {} };
    o.confirms[party] = true;
    o.confirms.at = o.confirms.at || {};
    o.confirms.at[party] = Date.now();
    log('Confirm · ' + party + ' OK', 'ok');
    paint();
    // All three parties OK → settle automatically (anti-fraud 3× seal)
    var c = o.confirms;
    if (o.phase === 'confirming' && c.client && c.vendor && c.driver) {
      log('3× seal complete · settling', 'ok');
      settle(o);
    }
  }

  function settle(o) {
    var total = Number(o.price) || 0;
    var vault = Math.round(total * 0.03 * 100) / 100;
    var driver = Math.round(total * 0.15 * 100) / 100;
    wallet.s = Math.max(0, (wallet.s || 0) - total);
    wallet.vault = (wallet.vault || 0) + vault;
    try {
      if (global.SNCurrency && SNCurrency.setWallet) SNCurrency.setWallet({ s: wallet.s, vault: wallet.vault });
    } catch (_) {}
    o.phase = 'done';
    o.progress = 100;
    o.doneAt = Date.now();
    try {
      archiveOrder(o);
    } catch (_) {}
    log('Settled · ' + fmt(total) + ' · vault 3% ' + vault + ' · driver 15% ' + driver + ' · archived for map timeline', 'ok');
    preview('paid');
    paint();
    setTimeout(function () {
      dismiss(o.id);
      try {
        if (active) {
          promoteQueue();
          scanAutoAccept();
          // Keep market fed if empty
          if (!stack.some(function (x) { return x.phase === 'offered' || x.phase === 'claimed' || x.phase === 'underway'; }) && !queue.length) {
            throwOffers({ count: 1 });
          }
        }
      } catch (_) {}
    }, 900);
  }

  /* ── Live drive progress on multi-tour ── */
  var driveTimer = null;
  function driveLoop() {
    var dirty = false;
    stack.forEach(function (o) {
      if (!o || o.phase !== 'underway') return;
      var eta = (o.quote && o.quote.etaMin) || 18;
      // ~ progress to 92% over eta minutes (accelerated for demo: 1 real sec ≈ 12s trip)
      var step = Math.max(0.4, 55 / Math.max(8, eta));
      o.progress = Math.min(92, (o.progress || 40) + step);
      dirty = true;
      if (o.progress >= 92) {
        // Auto-arrive at drop — still need 3× seal for pay
        o.phase = 'confirming';
        o.progress = 90;
        o.confirms = o.confirms || { client: false, vendor: false, driver: false, at: {} };
        log('Arrived · ' + o.vendorName + ' · 3× seal to settle', 'ok');
        setTimeout(function () {
          if (o.phase === 'confirming') setConfirm(o.id, 'driver');
        }, 500);
        try {
          if (global.SNPolyEngine && SNPolyEngine.syncTourFromStack) SNPolyEngine.syncTourFromStack(stack);
        } catch (_) {}
      }
    });
    if (dirty) {
      try {
        paint();
      } catch (_) {}
      // Move radar route progress
      try {
        stack.forEach(function (o) {
          if (o.phase === 'underway' && global.SNField && SNField.setRouteProgress)
            SNField.setRouteProgress('live:tour_active', (o.progress || 0) / 100);
        });
      } catch (_) {}
    }
  }
  function ensureDriveLoop() {
    if (driveTimer) return;
    driveTimer = setInterval(driveLoop, 900);
  }

  var autoScanTimer = null;
  function ensureAutoScan() {
    if (autoScanTimer) return;
    autoScanTimer = setInterval(function () {
      if (!active) return;
      try {
        scanAutoAccept();
        promoteQueue();
      } catch (_) {}
    }, 2800);
  }

  function commissionRai(o) {
    o.drone = true;
    try {
      if (global.SNHelper && SNHelper.commissionRai) {
        SNHelper.commissionRai({
          vendor: { lat: o.vLat, lng: o.vLng, name: o.vendorName },
          drop: { lat: o.dLat, lng: o.dLng, name: o.clientName },
          offerId: o.id,
          title: o.title || o.vendorName,
        });
      } else if (global.SNHelper && SNHelper.droneDeliver) {
        SNHelper.droneDeliver(
          {
            id: o.id,
            vendorName: o.vendorName,
            title: o.title,
            lat: o.vLat,
            lng: o.vLng,
            drop_lat: o.dLat,
            drop_lng: o.dLng,
          },
          { forceVisible: true }
        );
      } else if (global.SNHelper && SNHelper.droneMode) {
        SNHelper.droneMode(true);
      }
      if (global.SNHelper && SNHelper.wake) SNHelper.wake(true);
    } catch (_) {}
    log('Rai silver · drone courier · no human drivers yet', 'ok');
  }

  function runAct(id, act) {
    var o = find(id);
    if (!o) return;
    if (act === 'reject' || act === 'dismiss') {
      dismiss(id);
      return;
    }
    if (act === 'map') {
      drawPolygon(o);
      return;
    }
    if (act === 'accept') {
      ensureOnStack(o);
      var activeLoad = stack.filter(function (x) {
        return x.id !== o.id && (x.phase === 'claimed' || x.phase === 'underway' || x.phase === 'confirming');
      });
      try {
        if (global.SNPolyEngine && SNPolyEngine.evaluateJoin && activeLoad.length) {
          var join = SNPolyEngine.evaluateJoin(activeLoad, o);
          if (!join.ok) {
            // Soft: warn but still claim if capacity hard-fail only for exclusive private
            var hard =
              join.capacity && join.capacity.ok === false &&
              /private|frozen|full|exclusive|slots/i.test(String(join.reason || join.capacity.reason || ''));
            if (hard) {
              log('Cannot combine · ' + (join.reason || 'capacity'), 'err');
              return;
            }
            log('Tour note · ' + (join.reason || 'suboptimal combine') + ' · still claimed', 'dim');
            o._joinPreview = { ok: false, reason: join.reason };
          } else if (join.tour) {
            o._joinPreview = { extraKm: join.extraKm, extraWait: join.extraWait, score: join.score, ok: true };
          }
        }
      } catch (_) {}
      o.phase = 'claimed';
      o.progress = 15;
      o.uiSize = 'max';
      try {
        if (global.SNDeliveryRules && SNDeliveryRules.registerHubOrder) {
          SNDeliveryRules.registerHubOrder(
            o.vendorName || o.vendorId || 'vendor',
            o.vLat,
            o.vLng,
            o.id
          );
        }
      } catch (_) {}
      commissionRai(o);
      try {
        if (global.SNPolyEngine && SNPolyEngine.syncTourFromStack) SNPolyEngine.syncTourFromStack(stack);
        else drawPolygon(o);
        if (global.SNPolyEngine && SNPolyEngine.presentWorld) {
          SNPolyEngine.presentWorld(null, activeLoad(), { ev: {}, first: false });
        }
      } catch (_) {
        drawPolygon(o);
      }
      try {
        if (global.SNField && SNField.setRadarExpanded) SNField.setRadarExpanded(true);
      } catch (_) {}
      log(
        'Claimed · ' + o.vendorName + ' → ' + o.clientName +
          (o._joinPreview ? ' · +' + o._joinPreview.extraKm + ' km tour' : ''),
        'ok'
      );
      paint();
      try { promoteQueue(); } catch (_) {}
      try { scanAutoAccept(); } catch (_) {}
      try {
        if (global.SNReassignEngine && SNReassignEngine.peelOverflow) {
          var actives = stack.filter(function (x) {
            return x.phase === 'claimed' || x.phase === 'underway';
          });
          if (actives.length >= 3 && global.SNPolyEngine && SNPolyEngine.capacityCheck) {
            var last = actives[actives.length - 1];
            var others = actives.slice(0, -1);
            var ck = SNPolyEngine.capacityCheck(others, last);
            if (ck && ck.ok === false) {
              SNReassignEngine.peelOverflow(actives);
              // remove peeled lowest from local stack if in pool
              var poolIds = {};
              try {
                (SNReassignEngine.loadPool() || []).forEach(function (p) { poolIds[p.id] = 1; });
              } catch (_) {}
              stack = stack.filter(function (x) {
                return !(poolIds[x.id] && x.phase !== 'offered');
              });
              if (global.SNPolyEngine.syncTourFromStack) SNPolyEngine.syncTourFromStack(stack);
              paint();
            }
          }
        }
      } catch (_) {}
      return;
    }
    if (act === 'start') {
      o.phase = 'underway';
      o.progress = 45;
      o.startedAt = Date.now();
      try {
        if (global.SNPolyEngine && SNPolyEngine.syncTourFromStack) SNPolyEngine.syncTourFromStack(stack);
        else drawPolygon(o);
      } catch (_) {
        drawPolygon(o);
      }
      ensureDriveLoop();
      log('Underway · multi-tour polygon live · progress running', 'ok');
      paint();
      return;
    }
    if (act === 'arrive') {
      o.phase = 'confirming';
      o.progress = 90;
      o.confirms = { client: false, vendor: false, driver: false, at: {} };
      // Rai auto driver OK after brief delay
      setTimeout(function () {
        if (o.phase === 'confirming') setConfirm(o.id, 'driver');
      }, 600);
      setTimeout(function () {
        if (o.phase === 'confirming' && o.confirms && !o.confirms.vendor) setConfirm(o.id, 'vendor');
      }, 1200);
      // Demo / drone: client seal after a short pause (no human client app yet)
      setTimeout(function () {
        if (o.phase === 'confirming' && o.drone && o.confirms && !o.confirms.client)
          setConfirm(o.id, 'client');
      }, 1800);
      log('Arrived · 3× seal · client+vendor+driver (Rai auto-helps demo)', 'ok');
      paint();
      return;
    }
    if (act === 'settle' || act === 'complete' || act === 'done' || act === 'pay') {
      if (o.phase === 'underway' || o.phase === 'claimed') {
        // shortcut: arrive first
        o.phase = 'confirming';
        o.progress = 90;
        o.confirms = o.confirms || { client: false, vendor: false, driver: false, at: {} };
      }
      var c = o.confirms || {};
      // Demo / CLI: complete can force the three seals if already confirming
      if (act === 'complete' || act === 'done') {
        c.client = true;
        c.vendor = true;
        c.driver = true;
        o.confirms = c;
      }
      if (!(c.client && c.vendor && c.driver)) {
        log('Need 3× seal first · client + vendor + driver', 'err');
        paint();
        return;
      }
      settle(o);
      return;
    }
  }

  function makeOffer(opts) {
    opts = opts || {};
    var p = pos();
    var km = opts.km != null ? Number(opts.km) : 2.4;
    var dLat = 0.004 + km * 0.0012;
    var dLng = 0.003 + km * 0.001;
    var vLat = opts.vLat != null ? Number(opts.vLat) : p.lat + dLat;
    var vLng = opts.vLng != null ? Number(opts.vLng) : p.lng + dLng;
    var dropLat =
      opts.dLat != null
        ? Number(opts.dLat)
        : opts.cLat != null
          ? Number(opts.cLat)
          : p.lat;
    var dropLng =
      opts.dLng != null
        ? Number(opts.dLng)
        : opts.cLng != null
          ? Number(opts.cLng)
          : p.lng;
    var vendorName = opts.vendorName || opts.vendor || 'Night Kitchen';
    var clientName = opts.clientName || opts.client || 'You';
    var title = opts.title || opts.nature || 'Local delivery';
    var q = quote({
      km: km,
      nature: opts.nature || opts.product || title,
      night: opts.night,
      heavy: opts.heavy,
      vip: opts.vip,
      private: opts.private,
    });
    var mid =
      q.private || opts.noMid
        ? []
        : [
            {
              id: 'hub1',
              name: opts.midLabel || 'Hub stop',
              lat: (vLat + dropLat) / 2 + 0.0007,
              lng: (vLng + dropLng) / 2 - 0.0005,
            },
          ];
    // recompute km with mids
    var path = [{ lat: vLat, lng: vLng }].concat(mid).concat([{ lat: dropLat, lng: dropLng }]);
    var pathKm = 0;
    for (var i = 0; i < path.length - 1; i++)
      pathKm += haversineKm(path[i].lat, path[i].lng, path[i + 1].lat, path[i + 1].lng) || 0;
    q = quote({
      km: pathKm || km,
      nature: opts.nature || title,
      night: opts.night != null ? opts.night : isNight(),
      heavy: opts.heavy,
      vip: opts.vip,
      private: opts.private || q.private,
    });
    var o = {
      id: 'task:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      kind: 'task',
      phase: 'offered',
      progress: 0,
      title: title,
      nature: title,
      vendorName: vendorName,
      clientName: clientName,
      vendorAv: avatarUrl('vendor', vendorName, opts.vendorLogo),
      clientAv: avatarUrl('client', clientName, opts.clientPhoto),
      vLat: vLat,
      vLng: vLng,
      dLat: dropLat,
      dLng: dropLng,
      mids: mid,
      quote: q,
      price: q.total,
      priceTxt: fmt(q.total),
      km: q.km,
      routeLocked: !!q.private,
      confirms: { client: false, vendor: false, driver: false, at: {} },
      uiSize: 'mid',
      drone: false,
      t: Date.now(),
      prepMin: opts.prepMin != null ? Number(opts.prepMin) : null,
      prepReadyAt: opts.prepReadyAt || null,
    };
    try {
      if (o.prepMin == null && global.SNPolyEngine && SNPolyEngine.prepMin)
        o.prepMin = SNPolyEngine.prepMin(o);
      if (o.prepMin == null) o.prepMin = 10;
      if (!o.prepReadyAt) o.prepReadyAt = Date.now() + o.prepMin * 60000;
    } catch (_) {
      if (o.prepMin == null) o.prepMin = 10;
      if (!o.prepReadyAt) o.prepReadyAt = Date.now() + o.prepMin * 60000;
    }
    buildStops(o);
    return o;
  }

  function pushOffer(o) {
    var gate = gateOffer(o);
    o._joinPreview = gate.ev
      ? gate.ev.ok
        ? { extraKm: gate.ev.extraKm, extraWait: gate.ev.extraWait, score: gate.ev.score, ok: true }
        : { ok: false, reason: gate.reason || gate.ev.reason }
      : null;
    if (!gate.ok) {
      o.phase = 'withheld';
      o._withheld = gate.reason || 'incompatible';
      cliLine('Held · ' + (o.vendorName || 'offer') + ' · ' + (gate.reason || 'cannot combine'), 'dim');
      return null;
    }
    // One offered tile at a time so map polygon stays visible; claimed multi-tour can stack
    var hasOffered = stack.some(function (x) {
      return x.phase === 'offered';
    });
    if (hasOffered && o.phase === 'offered') {
      queue.push(o);
      if (queue.length > MAX_Q) queue = queue.slice(0, MAX_Q);
      log('Queued · ' + o.vendorName, 'dim');
      paint();
      return o;
    }
    stack = stack.filter(function (x) {
      return x.phase !== 'done' && x.phase !== 'withheld';
    });
    stack.unshift(o);
    var offered = stack.filter(function (x) {
      return x.phase === 'offered';
    });
    if (offered.length > 1) {
      queue = offered.slice(1).concat(queue).slice(0, MAX_Q);
      stack = stack.filter(function (x) {
        return x.phase !== 'offered' || x.id === offered[0].id;
      });
    }
    paint();
    presentOffer(o, gate);
    focusChrome(true);
    try { scanAutoAccept(); } catch (_) {}
    return o;
  }


  var ARCHIVE_KEY = 'sn:order-archive-v1';
  var MAX_ARCHIVE = 100;
  var archiveLayerOn = false;

  function loadArchive() {
    try {
      var raw = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }
  function saveArchive(list) {
    try {
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify((list || []).slice(0, MAX_ARCHIVE)));
    } catch (_) {}
  }
  function snapOrder(o) {
    return {
      id: o.id,
      title: o.title || o.nature,
      vendorName: o.vendorName,
      clientName: o.clientName,
      vLat: o.vLat,
      vLng: o.vLng,
      dLat: o.dLat,
      dLng: o.dLng,
      mids: o.mids || [],
      price: o.price,
      priceTxt: o.priceTxt,
      km: o.km,
      nature: o.nature,
      routeLocked: !!o.routeLocked,
      drone: !!o.drone,
      doneAt: o.doneAt || Date.now(),
      year: new Date(o.doneAt || Date.now()).getFullYear(),
    };
  }
  function archiveOrder(o) {
    if (!o) return;
    o.doneAt = o.doneAt || Date.now();
    var list = loadArchive().filter(function (x) {
      return x.id !== o.id;
    });
    list.unshift(snapOrder(o));
    saveArchive(list);
  }
  /** Seed a few demo past orders so timeline past is never empty on first use */
  function ensureDemoArchive() {
    var list = loadArchive();
    if (list.length) return list;
    var now = Date.now();
    var y = new Date().getFullYear();
    var demos = [
      { vendorName: 'Nonna Fires', clientName: 'Marina Villa', nature: 'Hot pizza', km: 2.1, yearsAgo: 0, daysAgo: 3 },
      { vendorName: 'Gelato Blu', clientName: 'Hotel Nike', nature: 'ice cream', km: 1.4, yearsAgo: 0, daysAgo: 40 },
      { vendorName: 'City Post', clientName: 'Port Office', nature: 'Paper envelopes', km: 3.8, yearsAgo: 1, daysAgo: 20 },
      { vendorName: 'Oven 23', clientName: 'Yacht berth 12', nature: 'Hot pizza', km: 4.2, yearsAgo: 2, daysAgo: 60 },
      { vendorName: 'Gyros Corner', clientName: 'Old Town', nature: 'Hot food', km: 1.1, yearsAgo: 5, daysAgo: 10 },
    ];
    var base = { lat: 36.4341, lng: 28.2176 };
    demos.forEach(function (d, i) {
      var doneAt = now - d.yearsAgo * 365.25 * 864e5 - d.daysAgo * 864e5;
      var vLat = base.lat + 0.008 + i * 0.003;
      var vLng = base.lng + 0.006 - i * 0.002;
      var dLat = base.lat - 0.004 + i * 0.001;
      var dLng = base.lng - 0.003 - i * 0.0015;
      var q = quote({ km: d.km, nature: d.nature, night: false });
      list.push({
        id: 'arch:demo:' + i,
        title: d.nature,
        vendorName: d.vendorName,
        clientName: d.clientName,
        vLat: vLat,
        vLng: vLng,
        dLat: dLat,
        dLng: dLng,
        mids: [],
        price: q.total,
        priceTxt: fmt(q.total),
        km: d.km,
        nature: d.nature,
        routeLocked: false,
        drone: i % 2 === 0,
        doneAt: doneAt,
        year: new Date(doneAt).getFullYear(),
        demo: true,
      });
    });
    saveArchive(list);
    return list;
  }
  function archiveForYear(year) {
    ensureDemoArchive();
    var list = loadArchive();
    if (year == null) return list;
    return list.filter(function (o) {
      return Number(o.year) === Number(year);
    });
  }
  function clearArchiveMap() {
    archiveLayerOn = false;
    try {
      if (global.SNField && SNField.clearRoutes) SNField.clearRoutes();
    } catch (_) {}
    try {
      var root = document.getElementById('sn-arch-layer');
      if (root) root.remove();
    } catch (_) {}
  }
  function paintArchiveLayer(orders, year) {
    clearArchiveMap();
    archiveLayerOn = true;
    ensureCss();
    var host = document.getElementById('sn-arch-layer');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sn-arch-layer';
      host.style.cssText =
        'position:fixed;left:8px;right:8px;bottom:calc(110px + env(safe-area-inset-bottom));' +
        'z-index:120;pointer-events:auto;display:flex;flex-direction:column;gap:6px;max-height:28vh;overflow:auto';
      document.body.appendChild(host);
    }
    var head =
      '<div style="font:700 9px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,224,112,.9);' +
      'text-shadow:0 0 10px rgba(0,224,112,.4);padding:2px 4px">' +
      'PAST ORDERS · ' +
      (year || 'ALL') +
      ' · ' +
      orders.length +
      ' · tap to draw polygon</div>';
    if (!orders.length) {
      host.innerHTML =
        head +
        '<div style="font:600 11px system-ui;color:#8ab4d0;padding:8px 10px;border-radius:14px;' +
        'background:rgba(2,16,40,.88);border:1px solid rgba(0,200,120,.35)">No settled deliveries in this year yet. ' +
        'Complete tasks in present — they land here for map review.</div>';
      return;
    }
    host.innerHTML =
      head +
      orders
        .slice(0, 24)
        .map(function (o) {
          var d = new Date(o.doneAt || Date.now());
          var ds =
            d.getFullYear() +
            '-' +
            String(d.getMonth() + 1).padStart(2, '0') +
            '-' +
            String(d.getDate()).padStart(2, '0');
          return (
            '<button type="button" data-arch="' +
            esc(o.id) +
            '" style="text-align:left;pointer-events:auto;border-radius:16px;border:1px solid rgba(0,200,140,.4);' +
            'background:linear-gradient(165deg,rgba(2,28,48,.92),rgba(0,12,28,.95));color:#e8fff4;padding:8px 12px;' +
            'font:600 11px/1.25 system-ui;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.35)">' +
            '<span style="font:800 12px ui-monospace,Menlo,monospace;color:#7ec8ff">' +
            esc(o.priceTxt || fmt(o.price)) +
            '</span> · ' +
            esc(ds) +
            '<br/><span style="color:#c8e8ff">' +
            esc(o.vendorName || 'Vendor') +
            ' → ' +
            esc(o.clientName || 'Client') +
            '</span><br/><span style="font:500 9px system-ui;color:#6a94c4">' +
            esc(o.nature || o.title || 'delivery') +
            (o.km != null ? ' · ' + Number(o.km).toFixed(1) + ' km' : '') +
            (o.drone ? ' · Rai' : '') +
            '</span></button>'
          );
        })
        .join('');
    host.onclick = function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-arch]') : null;
      if (!t) return;
      var id = t.getAttribute('data-arch');
      var o = loadArchive().find(function (x) {
        return x.id === id;
      });
      if (!o) return;
      // Open city map + draw past polygon
      try {
        if (global.SNMap && SNMap.open) SNMap.open({ lat: o.vLat, lng: o.vLng, zoom: 14 });
      } catch (_) {}
      drawPolygon({
        id: o.id,
        vendorName: o.vendorName,
        clientName: o.clientName,
        vLat: o.vLat,
        vLng: o.vLng,
        dLat: o.dLat,
        dLng: o.dLng,
        mids: o.mids,
        drone: o.drone,
        routeLocked: o.routeLocked,
        quote: { etaMin: 0 },
      });
      try {
        if (global.SNCli && SNCli.log)
          SNCli.log(
            'Past order · ' +
              (o.vendorName || '') +
              ' → ' +
              (o.clientName || '') +
              ' · ' +
              (o.priceTxt || ''),
            'ok'
          );
      } catch (_) {}
    };
    // Auto-draw first few as radar routes (ghost)
    orders.slice(0, 4).forEach(function (o, i) {
      setTimeout(function () {
        try {
          drawPolygon({
            id: 'past_' + o.id,
            vendorName: o.vendorName,
            clientName: o.clientName,
            vLat: o.vLat,
            vLng: o.vLng,
            dLat: o.dLat,
            dLng: o.dLng,
            mids: o.mids,
            drone: o.drone,
            routeLocked: o.routeLocked,
            quote: { etaMin: 0 },
          });
        } catch (_) {}
      }, i * 120);
    });
  }
  /**
   * Called by SNTimeline when map time slider moves.
   * past → show settled orders for that year + open map imagery mode
   * present → clear archive layer
   * future → empty projection strip
   */
  function showTimeline(tl) {
    tl = tl || {};
    var mode = tl.mode || 'present';
    var year = tl.year || new Date().getFullYear();
    if (mode === 'present') {
      clearArchiveMap();
      return { ok: true, mode: mode, count: 0 };
    }
    if (mode === 'future') {
      clearArchiveMap();
      var host = document.getElementById('sn-arch-layer');
      if (!host) {
        host = document.createElement('div');
        host.id = 'sn-arch-layer';
        host.style.cssText =
          'position:fixed;left:8px;right:8px;bottom:calc(110px + env(safe-area-inset-bottom));z-index:120;pointer-events:none';
        document.body.appendChild(host);
      }
      host.innerHTML =
        '<div style="font:700 10px system-ui;color:#7ad4ff;padding:8px 12px;border-radius:14px;' +
        'background:rgba(4,20,48,.9);border:1px solid rgba(80,160,255,.4)">FUTURE · ' +
        year +
        ' · projected routes appear as orders settle forward in time</div>';
      return { ok: true, mode: mode, count: 0 };
    }
    // PAST — graphical history
    try {
      if (global.SNMap && SNMap.open) {
        var home = (global.SNCli && SNCli._lastGps) || { lat: 36.4341, lng: 28.2176 };
        SNMap.open({ lat: home.lat || 36.4341, lng: home.lng || 28.2176, zoom: 13 });
      }
    } catch (_) {}
    var orders = archiveForYear(year);
    // If year has none, show nearby years (±1) then all past
    if (!orders.length) {
      var all = ensureDemoArchive().filter(function (o) {
        return Number(o.year) <= Number(year);
      });
      orders = all.filter(function (o) {
        return Math.abs(Number(o.year) - Number(year)) <= 1;
      });
      if (!orders.length) orders = all.slice(0, 12);
    }
    paintArchiveLayer(orders, year);
    try {
      if (global.SNCli && SNCli.log)
        SNCli.log('Timeline PAST · ' + year + ' · ' + orders.length + ' orders on map', 'ok');
      if (global.SNCli && SNCli.preview) SNCli.preview('past ' + year);
    } catch (_) {}
    return { ok: true, mode: mode, year: year, count: orders.length };
  }
  function exportArchive() {
    var list = ensureDemoArchive();
    var pack = { exportedAt: new Date().toISOString(), count: list.length, orders: list };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        void navigator.clipboard.writeText(JSON.stringify(pack, null, 2));
      }
    } catch (_) {}
    return pack;
  }

  var KITCHENS = [
    { vendorName: 'Nonna Fires', nature: 'Hot pizza', product: 'margherita', km: 1.6 },
    { vendorName: 'Oven 23', nature: 'Hot pizza', product: 'pepperoni', km: 2.0 },
    { vendorName: 'Gyros Corner', nature: 'Hot food', product: 'pita', km: 1.3 },
    { vendorName: 'Bread Lab', nature: 'Hot food', product: 'pita wrap', km: 1.8 },
    { vendorName: 'City Post', nature: 'Paper envelopes', product: 'mail', km: 3.4 },
    { vendorName: 'Gelato Blu', nature: 'ice cream', product: 'gelato', km: 1.5, private: true },
    { vendorName: 'Lindos Ferry Desk', nature: 'Paper envelopes', product: 'mail', km: 14.2 },
  ];


  function promoteQueue() {
    if (!queue.length) return;
    var hasOffered = stack.some(function (x) {
      return x.phase === 'offered';
    });
    if (hasOffered) return;
    var next = queue.shift();
    if (!next) return;
    var gate = gateOffer(next);
    if (!gate.ok) {
      next.phase = 'withheld';
      next._withheld = gate.reason;
      cliLine('Held · ' + (next.vendorName || 'offer') + ' · ' + (gate.reason || 'cannot combine'), 'dim');
      promoteQueue();
      return;
    }
    next._joinPreview = gate.ev && gate.ev.ok
      ? { extraKm: gate.ev.extraKm, extraWait: gate.ev.extraWait, score: gate.ev.score, ok: true }
      : { ok: false, reason: gate.reason };
    stack.unshift(next);
    paint();
    presentOffer(next, gate);
  }

  function scanAutoAccept() {
    try {
      if (!global.SNPolyEngine || !SNPolyEngine.shouldAutoAccept) return;
      var activeLoad = stack.filter(function (x) {
        return x.phase === 'claimed' || x.phase === 'underway' || x.phase === 'confirming';
      });
      stack.filter(function (x) { return x.phase === 'offered'; }).forEach(function (o) {
        var r = SNPolyEngine.shouldAutoAccept(o, activeLoad);
        if (r.ok) {
          log('Auto-accept · ' + o.vendorName, 'ok');
          runAct(o.id, 'accept');
        }
      });
      if (queue[0]) {
        var r2 = SNPolyEngine.shouldAutoAccept(queue[0], activeLoad);
        if (r2.ok) {
          var o2 = queue.shift();
          stack.unshift(o2);
          runAct(o2.id, 'accept');
        }
      }
    } catch (_) {}
  }

  function collectLiveOffers() {
    var out = [];
    function push(x) {
      if (!x) return;
      out.push(x);
    }
    try {
      if (global.SNMarket && typeof SNMarket.liveOffers === 'function') {
        (SNMarket.liveOffers() || []).forEach(push);
      }
    } catch (_) {}
    try {
      if (global.SNMeshOrders && typeof SNMeshOrders.seeking === 'function') {
        (SNMeshOrders.seeking() || []).forEach(push);
      }
    } catch (_) {}
    try {
      if (global.SNTasks && typeof SNTasks.openOffers === 'function') {
        (SNTasks.openOffers() || []).forEach(push);
      }
    } catch (_) {}
    return out;
  }

  function throwOffers(opts) {
    opts = opts || {};
    var want = Math.min(3, Number(opts.count) || 1);
    if (want <= 0) return { ok: true, count: 0 };
    var allowDemo = false;
    try {
      allowDemo = localStorage.getItem('sn:allow-demo-kitchens') === '1';
    } catch (_) {}
    var live = collectLiveOffers();
    var pool = live.length ? live : allowDemo ? KITCHENS : [];
    if (!pool.length) {
      cliLine('No live combinable offers in this sector · real vendors only', 'dim');
      return { ok: true, count: 0, empty: true };
    }
    var myGen = gen;
    var thrown = 0;
    var held = 0;
    var i = 0;
    function next() {
      if (myGen !== gen || !active) return;
      if (thrown >= want || i >= pool.length) {
        if (held) cliLine('Withheld ' + held + ' · nature/distance cannot join live polygon', 'dim');
        return;
      }
      var sample = pool[i++];
      var taken = {};
      activeLoad().forEach(function (x) {
        if (x && x.vendorName) taken[x.vendorName] = 1;
      });
      stack.forEach(function (x) {
        if (x && x.phase === 'offered' && x.vendorName) taken[x.vendorName] = 1;
      });
      var vName = sample.vendorName || sample.name || sample.shopName;
      if (vName && taken[vName]) {
        next();
        return;
      }
      var o = makeOffer({
        vendorName: vName,
        clientName: sample.clientName || opts.clientName || 'You',
        nature: sample.nature,
        product: sample.product,
        km: sample.km,
        private: sample.private,
        night: isNight(),
        lat: sample.lat,
        lng: sample.lng,
      });
      var pushed = pushOffer(o);
      if (pushed) thrown++;
      else held++;
      if (thrown < want && i < pool.length) setTimeout(next, 640);
      else if (held && thrown >= want) cliLine('Withheld ' + held + ' · not thrown at you', 'dim');
    }
    next();
    return { ok: true, count: want };
  }

  function activate(opts) {
    opts = opts || {};
    var signed = false;
    try {
      signed = !!(global.SNAuth && SNAuth.user);
    } catch (_) {}
    if (!signed && !opts.force) {
      log('Sign in and locate to draw a delivery area.', 'ok');
      return { ok: false, error: 'signin' };
    }
    var already = active && stack.some(function (x) {
      return x.phase === 'offered' || x.phase === 'claimed' || x.phase === 'underway' || x.phase === 'confirming';
    });
    // Re-tap power while market live: do not flood more tiles unless force
    if (already && !opts.force && opts.offers == null) {
      log('MARKET already ON · ' + stack.length + ' live · accept or rest', 'dim');
      preview('market on');
      try {
        if (global.SNField && SNField.setLaunchMode) SNField.setLaunchMode('on', { quiet: true, skipMoney: true });
      } catch (_) {}
      return { ok: true, gen: gen, already: true };
    }
    active = true;
    gen++;
    try {
      if (global.SNField && SNField.setLaunchMode) SNField.setLaunchMode('on', { quiet: true, skipMoney: true });
    } catch (_) {}
    try {
      if (global.SNCurrency && SNCurrency.ensure) SNCurrency.ensure(80);
    } catch (_) {}
    wallet.s = Math.max(wallet.s, 80);
    // Prefer reassigned pool orders from resting drivers
    var fromPool = [];
    try {
      fromPool = claimFromPool(1);
    } catch (_) {}
    var want = opts.offers != null ? Number(opts.offers) : 1;
    if (!fromPool.length && want > 0) throwOffers({ count: want });
    log('MARKET ON · multi-tour engine · pool + offers · 3× seal · Rai', 'ok');
    preview('market on');
    ensureDriveLoop();
    ensureAutoScan();
    // Soft GPS so polygons price from real position
    try {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            global._snLastPos = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              real: true,
              source: 'gps',
              acc: pos.coords.accuracy,
            };
            try {
              if (global.SNTasks && SNTasks.setPos)
                SNTasks.setPos(pos.coords.latitude, pos.coords.longitude);
            } catch (_) {}
          },
          function () {},
          { enableHighAccuracy: true, maximumAge: 15000, timeout: 5000 }
        );
      }
    } catch (_) {}
    return { ok: true, gen: gen };
  }

  /**
   * Driver rest / power OFF:
   *  - stop accepting new tour building
   *  - open + queued + non-settled orders reassigned to mesh pool for other drivers
   *  - clear local polygon
   */
  function reassignOpenOrders(reason) {
    reason = reason || 'driver rest · power off';
    var open = stack
      .filter(function (o) {
        return o && o.phase !== 'done' && o.phase !== 'settled';
      })
      .concat(queue.slice());
    if (!open.length) return { ok: true, count: 0, pool: [] };
    // Dynamic reassignment algorithms (regret matching → mesh + pool)
    try {
      if (global.SNReassignEngine && SNReassignEngine.reassignFromDriver) {
        var r = SNReassignEngine.reassignFromDriver(open, reason, { excludeSelf: true });
        log(
          'Rest · dynamic reassign · ' +
            (r.assignments ? r.assignments.length : 0) +
            ' matched · ' +
            (r.unassigned ? r.unassigned.length : 0) +
            ' pool · ' +
            (r.algorithm || 'engine'),
          'ok'
        );
        return { ok: true, count: open.length, pool: r.pool || [], reassign: r };
      }
    } catch (_) {}
    // Fallback: durable pool only
    var pool = [];
    try {
      pool = JSON.parse(localStorage.getItem('sn:open-order-pool-v1') || '[]');
      if (!Array.isArray(pool)) pool = [];
    } catch (_) {
      pool = [];
    }
    open.forEach(function (o) {
      var snap = {
        id: o.id,
        vendorName: o.vendorName,
        clientName: o.clientName,
        vLat: o.vLat,
        vLng: o.vLng,
        dLat: o.dLat,
        dLng: o.dLng,
        nature: o.nature,
        price: o.price,
        km: o.km,
        prepMin: o.prepMin,
        prepReadyAt: o.prepReadyAt,
        quote: o.quote,
        phaseWas: o.phase,
        reassignedAt: Date.now(),
        reason: reason,
        routeLocked: !!o.routeLocked,
      };
      pool = pool.filter(function (x) {
        return x && x.id !== snap.id;
      });
      pool.unshift(snap);
    });
    pool = pool.slice(0, 40);
    try {
      localStorage.setItem('sn:open-order-pool-v1', JSON.stringify(pool));
    } catch (_) {}
    log('Rest · reassigned ' + open.length + ' to pool', 'ok');
    return { ok: true, count: open.length, pool: pool };
  }

  function claimFromPool(maxN) {
    maxN = maxN || 1;
    var taken = [];
    // Score-auction claim (not FIFO)
    try {
      if (global.SNReassignEngine && SNReassignEngine.claimBestForSelf) {
        taken = SNReassignEngine.claimBestForSelf(maxN) || [];
      }
    } catch (_) {}
    if (!taken.length) {
      var pool = [];
      try {
        pool = JSON.parse(localStorage.getItem('sn:open-order-pool-v1') || '[]');
        if (!Array.isArray(pool)) pool = [];
      } catch (_) {
        pool = [];
      }
      if (!pool.length) return [];
      taken = pool.slice(0, maxN);
      pool = pool.slice(maxN);
      try {
        localStorage.setItem('sn:open-order-pool-v1', JSON.stringify(pool));
      } catch (_) {}
    }
    taken.forEach(function (snap) {
      var o = makeOffer({
        vendorName: snap.vendorName,
        clientName: snap.clientName,
        nature: snap.nature,
        km: snap.km,
        vLat: snap.vLat,
        vLng: snap.vLng,
        dLat: snap.dLat,
        dLng: snap.dLng,
        private: snap.routeLocked,
        prepMin: snap.prepMin,
        prepReadyAt: snap.prepReadyAt,
      });
      o.id = snap.id || o.id;
      o.fromPool = true;
      o.claimScore = snap.claimScore;
      pushOffer(o);
    });
    if (taken.length) log('Pool · claimed ' + taken.length + ' (score auction)', 'ok');
    return taken;
  }

  function deactivate(opts) {
    opts = opts || {};
    active = false;
    gen++;
    var re = { count: 0 };
    try {
      re = reassignOpenOrders(opts.reason || 'driver rest · power off');
    } catch (_) {}
    stack = [];
    queue = [];
    paint();
    focusChrome(false);
    try {
      if (global.SNField && SNField.setLaunchMode) SNField.setLaunchMode('off', { quiet: true, skipMoney: true });
      if (global.SNField && SNField.clearRoutes) SNField.clearRoutes();
      if (global.SNGlobe && SNGlobe.clearTourLines) SNGlobe.clearTourLines();
      try {
        document.body.classList.remove('sn-poly-nav-overview', 'sn-poly-nav-drive');
      } catch (_) {}
      try {
        if (global.SNField && SNField.stopPolyDriveFollow) SNField.stopPolyDriveFollow();
      } catch (_) {}
    } catch (_) {}
    log('MARKET OFF · polygon stopped · pool ' + (re.count || 0), 'dim');
    preview('market off · rest');
    return { ok: true, reassigned: re.count || 0 };
  }


  /**
   * End-to-end polygon marketplace demo — one job fully sealed + multi-tour seed
   */
  function demoFullLifecycle() {
    try {
      // Cancel any pending throwOffers timers from prior activate
      gen++;
      active = true;
      stack = [];
      queue = [];
      try {
        if (global.SNField && SNField.setLaunchMode)
          SNField.setLaunchMode('on', { quiet: true, skipMoney: true });
      } catch (_) {}
      var a = makeOffer({
        vendorName: 'Nonna Demo',
        clientName: 'Captain You',
        nature: 'hot_food',
        product: 'pizza box',
        km: 2.1,
      });
      var b = makeOffer({
        vendorName: 'Harbor Docs',
        clientName: 'Marina Desk',
        nature: 'documents',
        product: 'envelopes',
        km: 1.4,
      });
      pushOffer(a);
      pushOffer(b);
      runAct(a.id, 'accept');
      try { promoteQueue(); } catch (_) {}
      runAct(b.id, 'accept');
      try {
        if (global.SNPolyEngine && SNPolyEngine.syncTourFromStack) SNPolyEngine.syncTourFromStack(stack);
      } catch (_) {}
      // Start both legs of the multi-tour; seal only the first to prove 3× settle
      stack.forEach(function (o) {
        if (o.phase === 'claimed') runAct(o.id, 'start');
      });
      var seal = stack.find(function (x) {
        return x.vendorName === 'Nonna Demo';
      }) || stack[0];
      if (seal) {
        runAct(seal.id, 'arrive');
        setConfirm(seal.id, 'client');
        setConfirm(seal.id, 'vendor');
        setConfirm(seal.id, 'driver');
      }
      var live = stack.filter(function (x) {
        return x.phase === 'claimed' || x.phase === 'underway' || x.phase === 'confirming';
      });
      log(
        'DEMO · multi-tour ' +
          live.length +
          ' live · 3× seal on ' +
          (seal ? seal.vendorName : '?') +
          ' · market engine live',
        'ok'
      );
      preview('demo multi-tour');
      paint();
      return true;
    } catch (e) {
      log('Demo fail · ' + (e && e.message ? e.message : e), 'err');
      return true;
    }
  }

  async function handleLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;
    if (
      low === 'money' ||
      low === 'market on' ||
      low === 'power on' ||
      low === 'tasks on' ||
      low === 'launch on' ||
      low === 'go live' ||
      low === 'marketplace'
    ) {
      activate({});
      return true;
    }
    if (low === 'market off' || low === 'power off' || low === 'tasks off' || low === 'money off' || low === 'rest') {
      deactivate({ reason: low === 'rest' ? 'driver rest' : 'power off' });
      return true;
    }
    if (low === 'pool' || low === 'pool claim') {
      claimFromPool(1);
      return true;
    }
    if (low === 'accept' || low === 'take' || low === 'take offer' || low === 'accept offer') {
      var take = stack.filter(function (x) { return x.phase === 'offered'; })[0];
      if (!take) {
        log('No live offer to accept', 'dim');
        return true;
      }
      runAct(take.id, 'accept');
      return true;
    }
    if (low === 'skip' || low === 'reject' || low === 'skip offer') {
      var skip = stack.filter(function (x) { return x.phase === 'offered'; })[0];
      if (!skip) {
        log('No live offer to skip', 'dim');
        return true;
      }
      runAct(skip.id, 'reject');
      return true;
    }
    if (
      low === 'offers test' ||
      low === 'throw offers' ||
      low === 'throw tiles' ||
      low === 'test tiles' ||
      low === 'test offers' ||
      /^offers?\s+test/.test(low) ||
      /^throw\s+(tiles|offers)/.test(low)
    ) {
      if (!active) activate({ offers: 0 });
      throwOffers({ count: 1 });
      return true;
    }
    if (low === 'demo delivery' || low === 'demo polygon' || low === 'engine demo' || low === 'demo full' || low === 'full demo') {
      return demoFullLifecycle();
    }
    if (low === 'help market' || low === 'market help' || low === 'delivery help' || low === 'help delivery' || low === 'help poly') {
      log('MARKET · power ON/OFF · throw tiles · take → start → arrive · 3× seal', 'ok');
      log('TOUR · multi-accept builds one polygon · ⬠ Poly = fit tour · tap again = GPS drive', 'ok');
      log('CLI · tour · rest · pool · engine demo · auto accept on min 5 · prefer long east', 'ok');
      log('PRICE · ceil(km/3)×3€ · +3 night · +3 heavy · +3 VIP · +3 private', 'ok');
      return true;
    }
    if (low === 'polygon' || low === 'poly' || low === 'poly nav' || low === 'drive mode' || low === 'gps drive') {
      try {
        if (global.SNField && SNField.cyclePolyNav) {
          if (low === 'drive mode' || low === 'gps drive') {
            if (SNField.enterDriveMode) void SNField.enterDriveMode();
            else void SNField.cyclePolyNav();
          } else if (SNField.enterPolygonOverview) void SNField.enterPolygonOverview();
          else void SNField.cyclePolyNav();
          return true;
        }
      } catch (_) {}
      return true;
    }
    if (low === 'tour' || low === 'tour status') {
      try {
        if (global.SNPolyEngine && SNPolyEngine.syncTourFromStack) {
          var t = SNPolyEngine.syncTourFromStack(stack);
          if (t)
            log(
              'Tour · ' +
                (t.orders ? t.orders.length : 0) +
                ' orders · ' +
                (t.km || '?') +
                ' km · wait ' +
                (t.waitMin || 0) +
                'm',
              'ok'
            );
          else log('Tour · empty · power on + accept offers', 'dim');
        }
      } catch (eT) {
        log('Tour · ' + (eT && eT.message ? eT.message : eT), 'err');
      }
      return true;
    }
    if (low === 'wallet' || low === 'rate') {
      log('Wallet. ' + Number(wallet.s || 0).toFixed(0) + ' euro (Astranov coins, 1 coin = 1 euro). Held fees ' + Number(wallet.vault || 0).toFixed(2) + '.', 'ok');
      return true;
    }
    try {
      if (global.SNPolyEngine && SNPolyEngine.handleLine && SNPolyEngine.handleLine(raw)) return true;
    } catch (_) {}
    return false;
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snPolyBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        var low = String(raw || '').trim().toLowerCase();
        try {
          if (
            /^(money|market on|power on|tasks on|launch on|go live|marketplace|market off|power off|tasks off|money off|rest|offers?\s+test|throw offers|help market|market help|delivery help|throw tiles|test tiles|test offers|demo delivery|demo polygon|demo full|full demo|engine demo|tour|polygon|poly|drive mode|wallet|rate|pool|accept|skip|take|reject|take offer|accept offer|skip offer)\b/i.test(
              low
            )
          ) {
            try {
              if (SNCli.beginTurn) SNCli.beginTurn();
            } catch (_) {}
            try {
              if (SNCli.log) SNCli.log(String(raw).trim(), 'cmd');
            } catch (_) {}
            var h = await handleLine(raw);
            try {
              if (SNCli.endTurn) SNCli.endTurn();
            } catch (_) {}
            if (h) return;
          }
        } catch (_) {}
        return orig(raw);
      };
      SNCli._snPolyBound = SNCli.run;
    } catch (_) {}
  }

  function wireFieldPower() {
    try {
      if (!global.SNField) return;
      // Prefer our activate when power cycles
      var prev = SNField.setLaunchMode;
      if (typeof prev === 'function' && !SNField._snPolyLaunch) {
        SNField.setLaunchMode = function (mode, opts) {
          opts = opts || {};
          if (opts.skipMoney) return prev.call(SNField, mode, opts);
          var on = mode === 'on' || mode === true || mode === 1;
          if (on) activate({});
          else deactivate();
          return prev.call(SNField, mode, Object.assign({}, opts, { skipMoney: true }));
        };
        SNField._snPolyLaunch = true;
      }
    } catch (_) {}
  }

  function init() {
    ensureRoot();
    installCli();
    wireFieldPower();
    ensureDriveLoop();
    ensureAutoScan();
    [400, 1200, 3000].forEach(function (ms) {
      setTimeout(function () {
        installCli();
        wireFieldPower();
      }, ms);
    });
  }

  var api = {
    init: init,
    activate: activate,
    deactivate: deactivate,
    throwOffers: throwOffers,
    demoFullLifecycle: demoFullLifecycle,
    runAct: runAct,
    setConfirm: setConfirm,
    makeOffer: makeOffer,
    pushOffer: pushOffer,
    drawPolygon: drawPolygon,
    reassignOpenOrders: reassignOpenOrders,
    claimFromPool: claimFromPool,
    promoteQueue: promoteQueue,
    scanAutoAccept: scanAutoAccept,
    openOrderTile: openOrderTile,
    paint: paint,
    list: function () {
      return stack.slice();
    },
    queue: function () {
      return queue.slice();
    },
    clear: function () {
      gen++;
      stack = [];
      queue = [];
      paint();
    },
    handleLine: handleLine,
    quote: quote,
    wallet: function () {
      return Object.assign({}, wallet);
    },
    // lifecycle helpers for tests
    runAct: runAct,
    setConfirm: setConfirm,
    find: find,
    archive: loadArchive,
    archiveForYear: archiveForYear,
    showTimeline: showTimeline,
    exportArchive: exportArchive,
    ensureDemoArchive: ensureDemoArchive,
    clearArchiveMap: clearArchiveMap,
  };

  global.SNPolyScheduler = api;
  // Facades so older call sites keep working
  global.SNMoney = global.SNMoney || {};
  global.SNMoney.activate = function (o) {
    return activate(o || {});
  };
  global.SNMoney.deactivate = deactivate;
  global.SNMoney.handleLine = handleLine;
  global.SNMoney.drawMoneyRoutes = function () {
    var o = stack[0];
    if (o) drawPolygon(o);
  };
  global.SNOfferStack = global.SNOfferStack || {};
  global.SNOfferStack.list = api.list;
  global.SNOfferStack.clear = api.clear;
  global.SNOfferStack.paint = paint;
  global.SNOfferStack.handleLine = handleLine;
  global.SNOfferStack.accept = function (id) {
    runAct(id, 'accept');
  };
  global.SNOfferStack.testThrow = function (o) {
    return pushOffer(makeOffer(o || {}));
  };
  global.SNOfferStack.pushTask = function (task, extra) {
    extra = extra || {};
    return pushOffer(
      makeOffer({
        vendorName: task.vendorName || extra.vendorName,
        clientName: task.clientName || extra.clientName || 'You',
        nature: task.title || extra.nature,
        km: extra.km || task._km,
        vLat: task.lat,
        vLng: task.lng,
        dLat: task.drop_lat,
        dLng: task.drop_lng,
        private: extra.private,
      })
    );
  };
  global.SNOfferStack.arriveOffer = function (id) {
    var o = find(id) || stack[0];
    if (o) runAct(o.id, 'arrive');
  };
  global.SNOfferStack.setConfirm = setConfirm;
  global.SNOfferStack.markPhase = function (id, phase) {
    var o = find(id) || stack[0];
    if (o) {
      o.phase = phase;
      paint();
    }
  };
  global.SNDeliveryRules = global.SNDeliveryRules || {};
  global.SNDeliveryRules.quote = quote;
  global.SNDeliveryRules.isNight = isNight;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
