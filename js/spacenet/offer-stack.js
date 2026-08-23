/**
 * SNOfferStack — compact peek tiles (ONE at a time, never full-screen wall)
 * Pricing via SNDeliveryRules · capacity · triple confirm · no-call unless off-limits
 * window.SNOfferStack · CLI: offers test · demo delivery · harness
 */
(function (global) {
  'use strict';
  var MAX_VISIBLE = 1;
  var MAX_QUEUE = 8;
  var stack = [];   // visible (max 1) + active underways kept
  var queue = [];   // waiting offers — thrown one-by-one
  var root = null;
  var CSS_ID = 'sn-offer-stack-css-v10-inertia';
  var throwTimer = null;

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
    } catch (_) {}
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&' + 'amp;')
      .replace(/</g, '&' + 'lt;')
      .replace(/>/g, '&' + 'gt;')
      .replace(/"/g, '&' + 'quot;');
  }

  function fmtPrice(n) {
    if (n == null || !isFinite(Number(n))) return '';
    try {
      if (global.SNCurrency && SNCurrency.format) return SNCurrency.format(n);
    } catch (_) {}
    var x = Number(n);
    var s = Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(2);
    return s + ' € / Æ';
  }

  function haversineKm(aLat, aLng, bLat, bLng) {
    if (aLat == null || bLat == null) return null;
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
    try {
      if (global.SNDeliveryRules && SNDeliveryRules.isNight) return SNDeliveryRules.isNight(d);
    } catch (_) {}
    d = d || new Date();
    var h = d.getHours();
    return h >= 21 || h < 9;
  }

  function rulesQuote(opts) {
    try {
      if (global.SNDeliveryRules && SNDeliveryRules.quote) return SNDeliveryRules.quote(opts || {});
    } catch (_) {}
    var km = opts && opts.km != null ? Number(opts.km) : 1.2;
    var night = opts && opts.night != null ? !!opts.night : isNight();
    var dist = Math.ceil(Math.max(0.1, km) / 3) * 3;
    var total = dist + (night ? 3 : 0);
    return {
      ok: true,
      km: km,
      total: total,
      distanceFee: dist,
      night: night,
      nightFee: night ? 3 : 0,
      heavyFee: 0,
      vipFee: 0,
      privateFee: 0,
      private: false,
      vip: false,
      heavy: false,
      windowMin: 45,
      etaMin: Math.max(8, Math.round((km / 22) * 60 + 8)),
      metaLine: (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km · ' + (night ? 'night' : 'day'),
      breakdownLines: ['Distance · ' + dist + ' €'],
      nature: { id: 'ambient', label: 'Delivery', emoji: '📦', maxParallel: 8, stackWeight: 0.5 },
      limits: { maxEtaMin: 45, maxKm: km * 1.35 + 0.5, tempClass: 'ambient', private: false },
    };
  }

  function activeLoad() {
    return stack
      .concat(queue)
      .filter(function (o) {
        return o && o.kind === 'task' && o.phase && o.phase !== 'done' && o.phase !== 'offered';
      })
      .map(function (o) {
        return {
          nature: (o.quote && o.quote.nature && o.quote.nature.id) || o.natureId || o.nature,
          title: o.nature || o.title,
          private: !!(o.quote && o.quote.private),
        };
      });
  }

  function flushQueue() {
    // Keep underways + done briefly; only one offered tile visible
    var offered = stack.filter(function (o) {
      return o.phase === 'offered' || (!o.phase && o.kind !== 'task');
    });
    var active = stack.filter(function (o) {
      return o.phase && o.phase !== 'offered' && o.phase !== 'done';
    });
    var done = stack.filter(function (o) {
      return o.phase === 'done';
    });
    if (offered.length > MAX_VISIBLE) {
      var keep = offered.slice(0, MAX_VISIBLE);
      var spill = offered.slice(MAX_VISIBLE);
      queue = spill.concat(queue).slice(0, MAX_QUEUE);
      stack = active.concat(keep).concat(done);
    } else if (offered.length === 0 && queue.length) {
      var next = queue.shift();
      stack = active.concat([next]).concat(done);
    } else {
      stack = active.concat(offered).concat(done);
    }
    paint();
  }

  function enqueueOrShow(offer) {
    if (!offer) return null;
    // capacity for tasks
    if (offer.kind === 'task' && offer.phase === 'offered') {
      try {
        if (global.SNDeliveryRules && SNDeliveryRules.capacityCheck) {
          var cap = SNDeliveryRules.capacityCheck(activeLoad(), {
            nature: offer.natureId || offer.nature,
            title: offer.nature,
            km: offer.km,
            private: offer.quote && offer.quote.private,
          });
          if (!cap.ok) {
            log('Capacity · ' + (cap.reason || 'full') + ' · skipped', 'dim');
            return null;
          }
        }
      } catch (_) {}
    }
    var hasOffered = stack.some(function (o) {
      return o.phase === 'offered' || (o.kind === 'vendor' && o.phase !== 'done');
    });
    var hasActive = stack.some(function (o) {
      return o.phase === 'claimed' || o.phase === 'underway' || o.phase === 'confirming';
    });
    // One peek at a time: if something is already offered/active, queue new offers
    if ((hasOffered || hasActive) && offer.phase === 'offered') {
      queue = queue.filter(function (o) {
        return o.id !== offer.id;
      });
      queue.push(offer);
      if (queue.length > MAX_QUEUE) queue = queue.slice(0, MAX_QUEUE);
      log('Queued · ' + (offer.nature || offer.title) + ' · #' + queue.length, 'dim');
      paint();
      return offer;
    }
    stack = stack.filter(function (o) {
      return o.id !== offer.id;
    });
    stack.unshift(offer);
    flushQueue();
    return offer;
  }

  function taskMeta(task, extra) {
    extra = extra || {};
    var nature =
      extra.nature ||
      task.nature ||
      (task.kind === 'delivery' || /deliver|pizza|food|order/i.test(task.title || '')
        ? 'Local delivery'
        : task.kind
          ? String(task.kind).replace(/_/g, ' ')
          : 'Task');
    nature = nature.charAt(0).toUpperCase() + nature.slice(1);
    var km = extra.km != null ? Number(extra.km) : null;
    if (km == null && task.lat != null && task.drop_lat != null) {
      km = haversineKm(task.lat, task.lng, task.drop_lat, task.drop_lng);
    }
    if (km == null && task._km != null) km = Number(task._km);
    if (km == null && task.distance_km != null) km = Number(task.distance_km);
    var night =
      extra.night != null ? !!extra.night : task.night != null ? !!task.night : isNight();
    var mins =
      extra.mins != null
        ? Number(extra.mins)
        : task.etaMin != null
          ? Number(task.etaMin)
          : task.durationMin != null
            ? Number(task.durationMin)
            : null;
    if (mins == null && km != null && isFinite(km)) {
      mins = Math.max(8, Math.round((km / 22) * 60 + 6));
    }
    var bits = [];
    if (km != null && isFinite(km)) bits.push((km < 10 ? km.toFixed(1) : String(Math.round(km))) + ' km');
    bits.push(night ? 'night' : 'day');
    if (mins != null && isFinite(mins)) bits.push('~' + Math.round(mins) + ' min');
    return { nature: nature, km: km, night: night, mins: mins, line: bits.join(' · ') };
  }

  function ensureCss() {
    var prev = document.getElementById(CSS_ID);
    if (prev) prev.remove();
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = [
      '#sn-offer-stack{position:fixed;left:0;top:0;right:0;bottom:0;z-index:105;',
      'pointer-events:none!important;overflow:visible}',
      '#sn-offer-stack .sn-queue-hint{position:fixed;left:50%;bottom:72px;transform:translateX(-50%);',
      'pointer-events:none;font:700 9px/1 "Space Grotesk",system-ui,sans-serif;',
      'letter-spacing:.14em;text-transform:uppercase;color:rgba(90,160,255,.75);',
      'text-shadow:0 0 12px rgba(40,120,255,.5);z-index:141}',
      /* Floating tile — free drag position */
      '#sn-offer-stack .sn-offer{pointer-events:auto;position:fixed;',
      'left:50%;top:72px;bottom:auto;transform:translateX(-50%);',
      'display:flex;flex-direction:column;align-items:stretch;gap:0;',
      'width:min(92vw,300px);max-width:min(94vw,360px);',
      'padding:0;color:#eaf4ff;cursor:grab;touch-action:none;user-select:none;',
      'border-radius:22px;',
      'background:radial-gradient(ellipse 120% 100% at 50% 0%,rgba(30,100,255,.28),transparent 55%),',
      'linear-gradient(165deg,rgba(2,18,52,.94) 0%,rgba(0,10,32,.96) 100%);',
      'border:1.5px solid rgba(50,150,255,.72);',
      'box-shadow:0 12px 32px rgba(0,0,0,.5),0 0 24px rgba(20,100,255,.42),inset 0 1px 0 rgba(120,190,255,.22);',
      'animation:snOfferIn .28s cubic-bezier(.22,1,.36,1);',
      'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}',
      '#sn-offer-stack .sn-offer.dragging{cursor:grabbing;opacity:.97;z-index:160;',
      'box-shadow:0 18px 40px rgba(0,0,0,.55),0 0 32px rgba(40,140,255,.5)}',
      '#sn-offer-stack .sn-offer.size-min{width:min(72vw,200px);border-radius:999px}',
      '#sn-offer-stack .sn-offer.size-min .sn-pill-tray,#sn-offer-stack .sn-offer.size-min .sn-parties,',
      '#sn-offer-stack .sn-offer.size-min .sn-stops{display:none!important}',
      '#sn-offer-stack .sn-offer.size-min .sn-pill-line{display:none}',
      '#sn-offer-stack .sn-offer.size-max{width:min(94vw,360px);border-radius:26px;bottom:auto}',
      '#sn-offer-stack .sn-offer.size-max .sn-pill-tray{display:flex}',
      /* Traditional chrome: − left · × middle · + right */
      '#sn-offer-stack .sn-chrome{display:flex;align-items:center;justify-content:center;gap:10px;',
      'padding:8px 12px 4px;cursor:grab;touch-action:none}',
      '#sn-offer-stack .sn-chrome-btn{width:28px;height:28px;border-radius:50%;border:1px solid rgba(80,160,255,.5);',
      'background:rgba(8,28,64,.75);color:#b8d8ff;font:700 15px/1 system-ui;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;padding:0;flex:0 0 auto;',
      'box-shadow:0 0 10px rgba(30,100,255,.25);touch-action:manipulation}',
      '#sn-offer-stack .sn-chrome-btn:active{transform:scale(.92)}',
      '#sn-offer-stack .sn-chrome-btn.min{color:#3a2c00;background:radial-gradient(circle at 35% 30%,#ffe58a,#e0b000 70%);border-color:#c9a000}',
      '#sn-offer-stack .sn-chrome-btn.close{color:#fff;background:radial-gradient(circle at 35% 30%,#ff8a8a,#c62828 70%);border-color:#ff4444}',
      '#sn-offer-stack .sn-chrome-btn.max{color:#041a0c;background:radial-gradient(circle at 35% 30%,#8dffb4,#1a9e4a 70%);border-color:#2ecc71}',
      '#sn-offer-stack .sn-chrome-title{flex:1;text-align:center;font:700 9px/1 "Space Grotesk",system-ui,sans-serif;',
      'letter-spacing:.14em;text-transform:uppercase;color:rgba(120,180,255,.75);pointer-events:none}',
      '#sn-offer-stack .sn-pill-main{display:flex;align-items:center;gap:10px;padding:6px 14px 10px 16px}',
      '#sn-offer-stack .sn-pill-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;',
      'background:radial-gradient(circle at 35% 30%,#9ad4ff,#1a6fd4 55%,#0a3a8a);',
      'box-shadow:0 0 10px rgba(60,160,255,.9)}',
      '#sn-offer-stack .phase-underway .sn-pill-dot{background:radial-gradient(circle at 35% 30%,#9fffd4,#00c88a 55%,#066)}',
      '#sn-offer-stack .phase-confirming .sn-pill-dot{background:radial-gradient(circle at 35% 30%,#ffe9a0,#e0a020 55%,#664)}',
      '#sn-offer-stack .sn-pill-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '#sn-offer-stack .sn-pill-price{font:800 17px/1.05 "JetBrains Mono",ui-monospace,Menlo,monospace;color:#7ec8ff;',
      'text-shadow:0 0 12px rgba(60,160,255,.95);letter-spacing:-.02em;white-space:nowrap}',
      '#sn-offer-stack .sn-pill-line{font:600 10px/1.25 "Inter",system-ui,sans-serif;color:#9ec4ee;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}',
      /* Vendor + client always visible */
      '#sn-offer-stack .sn-parties{padding:0 14px 10px;display:flex;flex-direction:column;gap:6px}',
      '#sn-offer-stack .sn-party{display:flex;align-items:center;gap:8px;min-width:0}',
      '#sn-offer-stack .sn-party .av{width:36px;height:36px;border-radius:50%;flex:0 0 auto;object-fit:cover;',
      'border:1.5px solid rgba(100,180,255,.55);box-shadow:0 0 12px rgba(40,120,255,.35);background:#0a1e40}',
      '#sn-offer-stack .sn-party.vendor .av{border-color:rgba(255,190,60,.65);box-shadow:0 0 12px rgba(255,180,40,.35);border-radius:12px}',
      '#sn-offer-stack .sn-party .tag{font:800 8px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.1em;',
      'text-transform:uppercase;padding:4px 7px;border-radius:999px;flex:0 0 auto}',
      '#sn-offer-stack .sn-party.vendor .tag{background:rgba(255,180,40,.18);border:1px solid rgba(255,190,60,.5);color:#ffd080}',
      '#sn-offer-stack .sn-party.client .tag{background:rgba(40,160,255,.18);border:1px solid rgba(80,170,255,.5);color:#9ad4ff}',
      '#sn-offer-stack .sn-party .nm{font:700 12px/1.2 "Inter",system-ui,sans-serif;color:#eaf4ff;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '#sn-offer-stack .sn-party .role{font:500 9px/1.2 "Inter",system-ui,sans-serif;color:#6a94c4;margin-left:auto;flex:0 0 auto}',
      '#sn-offer-stack .sn-offer.physics{will-change:left,top;transition:none}',
      /* default park: top band so polygon map is free below */
      '#sn-offer-stack .sn-offer.park-top{left:50%;top:72px;bottom:auto;transform:translateX(-50%)}',
      '#sn-offer-stack .sn-pill-acts{display:flex;align-items:center;gap:6px;flex:0 0 auto}',
      '#sn-offer-stack .sn-pill-btn{width:34px;height:34px;border-radius:50%;border:1px solid rgba(80,160,255,.45);',
      'background:rgba(10,40,90,.55);color:#b8d8ff;font:700 13px/1 system-ui;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;padding:0;touch-action:manipulation}',
      '#sn-offer-stack .sn-pill-btn.ok{border-color:rgba(0,230,160,.65);color:#8fffd4;background:rgba(0,100,70,.4)}',
      '#sn-offer-stack .sn-pill-btn.no{border-color:rgba(140,160,190,.4);color:#a0bdd8}',
      '#sn-offer-stack .sn-pill-btn.map{font-size:11px}',
      /* stops / rearrange */
      '#sn-offer-stack .sn-stops{padding:0 12px 8px;display:flex;flex-direction:column;gap:5px}',
      '#sn-offer-stack .sn-stop{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:14px;',
      'background:rgba(8,28,64,.65);border:1px solid rgba(50,120,220,.35)}',
      '#sn-offer-stack .sn-stop.locked{border-color:rgba(255,190,60,.45);opacity:.95}',
      '#sn-offer-stack .sn-stop .ord{font:800 10px/1 ui-monospace,Menlo,monospace;color:#7ec8ff;width:16px;text-align:center}',
      '#sn-offer-stack .sn-stop .lab{flex:1;min-width:0;font:600 11px/1.2 system-ui,sans-serif;color:#d8ecff;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#sn-offer-stack .sn-stop .lock{font:700 8px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.06em;',
      'color:#ffd080;text-transform:uppercase}',
      '#sn-offer-stack .sn-stop .mv{width:26px;height:26px;border-radius:50%;border:1px solid rgba(80,160,255,.4);',
      'background:rgba(10,40,90,.5);color:#b8d8ff;font:700 12px/1 system-ui;cursor:pointer;padding:0}',
      '#sn-offer-stack .sn-stop .mv:disabled{opacity:.3;pointer-events:none}',
      '#sn-offer-stack .sn-route-note{font:600 9px/1.3 "Inter",system-ui,sans-serif;color:#6a94c4;text-align:center;padding:0 12px 6px}',
      '#sn-offer-stack .sn-route-note.lock{color:#ffd080}',
      /* tray */
      '#sn-offer-stack .sn-pill-tray{padding:0 14px 12px;display:none;flex-direction:column;gap:8px}',
      '#sn-offer-stack .sn-offer.size-max .sn-pill-tray,#sn-offer-stack .sn-offer.is-open:not(.size-min) .sn-pill-tray{display:flex}',
      '#sn-offer-stack .sn-pill-meta{font:500 10px/1.35 "Inter",system-ui,sans-serif;color:#7aa8d8;text-align:center}',
      '#sn-offer-stack .sn-pill-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:5px}',
      '#sn-offer-stack .sn-chip{font:700 9px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.04em;',
      'padding:5px 10px;border-radius:999px;background:rgba(16,48,110,.55);border:1px solid rgba(80,160,255,.35);color:#a8d0ff}',
      '#sn-offer-stack .sn-chip.hot{border-color:rgba(255,140,60,.5);color:#ffc090}',
      '#sn-offer-stack .sn-chip.ice{border-color:rgba(100,200,255,.55);color:#9ee0ff}',
      '#sn-offer-stack .sn-chip.night{border-color:rgba(140,120,255,.5);color:#c8b8ff}',
      '#sn-offer-stack .sn-chip.priv{border-color:rgba(255,200,80,.55);color:#ffe09a}',
      '#sn-offer-stack .sn-chip.warn{border-color:rgba(255,100,100,.5);color:#ffb0b0}',
      '#sn-offer-stack .sn-offer-progress{height:5px;border-radius:99px;background:rgba(20,50,90,.7);overflow:hidden}',
      '#sn-offer-stack .sn-offer-progress>i{display:block;height:100%;width:0;border-radius:99px;',
      'background:linear-gradient(90deg,#1a8cff,#3dffc0);box-shadow:0 0 10px rgba(60,200,180,.55);transition:width .4s ease}',
      '#sn-offer-stack .sn-confirm-row{display:flex;gap:6px;justify-content:center}',
      '#sn-offer-stack .sn-offer-btn.confirm{flex:1;min-height:36px;border-radius:999px;font:700 10px/1 "Space Grotesk",system-ui,sans-serif;',
      'letter-spacing:.04em;padding:8px 6px;cursor:pointer;border:1px solid rgba(0,220,180,.45);',
      'background:rgba(0,60,50,.4);color:#9fffe0}',
      '#sn-offer-stack .sn-offer-btn.confirm.on{border-color:rgba(0,255,180,.8);color:#cffff0;box-shadow:0 0 14px rgba(0,220,160,.35)}',
      '#sn-offer-stack .sn-comms{font:600 9px/1.3 "Inter",system-ui,sans-serif;color:#6a94c4;text-align:center}',
      '#sn-offer-stack .sn-comms.off{color:#ffb080}',
      '#sn-offer-stack .sn-seal{font:700 9px/1.2 "Space Grotesk",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;',
      'color:rgba(100,180,255,.7);text-align:center}',
      '#sn-offer-stack .sn-pill-wide{display:flex;gap:8px}',
      '#sn-offer-stack .sn-offer-btn{flex:1;min-height:40px;border-radius:999px;font:700 12px/1 "Space Grotesk",system-ui,sans-serif;',
      'padding:10px 12px;cursor:pointer;border:1px solid rgba(80,160,255,.4);background:rgba(10,40,90,.45);color:#b8d8ff}',
      '#sn-offer-stack .sn-offer-btn.accept,#sn-offer-stack .sn-offer-btn.okwide{border-color:rgba(0,230,160,.65);background:linear-gradient(180deg,rgba(0,200,140,.35),rgba(0,100,70,.4));color:#8fffd4}',
      '#sn-offer-stack .sn-offer-btn.complete{border-color:rgba(255,210,80,.7);background:linear-gradient(180deg,rgba(200,160,20,.4),rgba(100,70,0,.4));color:#ffe9a0}',
      '#sn-offer-stack .sn-offer-btn.start{border-color:rgba(80,180,255,.7);background:linear-gradient(180deg,rgba(30,120,220,.4),rgba(10,60,140,.4));color:#b8e0ff}',
      '#sn-offer-stack .sn-offer-btn:disabled{opacity:.4;pointer-events:none}',
      '#sn-offer-stack .sn-offer-menu{display:flex;flex-direction:column;gap:6px;max-height:90px;overflow:auto}',
      '#sn-offer-stack .sn-offer-menu-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:999px;',
      'background:rgba(8,28,64,.72);border:1px solid rgba(50,120,220,.35)}',
      '#sn-offer-stack .sn-offer-menu-name{font:600 11px/1.2 system-ui,sans-serif;color:#d8ecff;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#sn-offer-stack .sn-offer-menu-price{font:700 11px/1 ui-monospace,Menlo,monospace;color:#7ec8ff}',
      '#sn-offer-stack .sn-offer-btn.order{min-height:32px;border-radius:999px;font-size:10px;padding:6px 10px;',
      'border:1px solid rgba(0,230,160,.55);background:rgba(0,120,80,.35);color:#b8ffe0}',
      '#sn-offer-stack .sn-offer-drone{font:700 9px/1.2 "Space Grotesk",system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;',
      'color:#7ad4ff;text-align:center;text-shadow:0 0 10px rgba(50,180,255,.6)}',
      '@keyframes snOfferIn{from{opacity:0;transform:translateY(10px) scale(.94)}to{opacity:1;transform:none}}',
      '@media (max-width:420px){#sn-offer-stack .sn-offer{bottom:78px}#sn-offer-stack .sn-pill-price{font-size:15px}}',
      '@media (prefers-reduced-motion:reduce){#sn-offer-stack .sn-offer{animation:none}}',
      '#sn-game-dock,.sn-game-dock,#sn-earth-ops-chip{display:none!important;pointer-events:none!important;opacity:0!important}',
    ].join('');
    try {
      if (!document.getElementById('sn-city-lab-pe')) {
        var pe = document.createElement('style');
        pe.id = 'sn-city-lab-pe';
        pe.textContent = '#sn-city-labels,.sn-city-lab{pointer-events:none!important;user-select:none}';
        document.head.appendChild(pe);
      }
    } catch (_) {}
    document.head.appendChild(st);
  }

  function ensureRoot() {
    ensureCss();
    if (root && document.body.contains(root)) return root;
    root = document.getElementById('sn-offer-stack');
    if (!root) {
      root = document.createElement('div');
      root.id = 'sn-offer-stack';
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    return root;
  }


  function partyNames(o) {
    var t = (o && o.task) || {};
    var en = (o && o.enriched) || {};
    var vendor =
      (o && o.vendorName) ||
      en.vendorName ||
      t.vendorName ||
      t.shopName ||
      t.shop ||
      (o && o.kind === 'vendor' ? o.title || o.nature : '') ||
      'Vendor';
    var client =
      (o && o.clientName) ||
      en.clientName ||
      t.clientName ||
      t.customerName ||
      t.buyerName ||
      'You';
    return { vendor: String(vendor).slice(0, 28), client: String(client).slice(0, 28) };
  }

  function hashHue(str) {
    var h = 0;
    var s = String(str || 'x');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function initials(name) {
    var p = String(name || '?')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  function avatarUrl(kind, name, url) {
    if (url && /^https?:\/\//i.test(String(url))) return String(url);
    if (url && String(url).indexOf('data:image') === 0) return String(url);
    var hue = kind === 'vendor' ? (hashHue(name) + 30) % 360 : (hashHue(name) + 200) % 360;
    var ini = initials(name);
    var r = kind === 'vendor' ? 14 : 48;
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="hsl(' +
      hue +
      ',85%,62%)"/><stop offset="100%" stop-color="hsl(' +
      ((hue + 40) % 360) +
      ',70%,38%)"/></linearGradient></defs>' +
      '<rect width="72" height="72" rx="' +
      r +
      '" fill="#061428"/>' +
      '<rect x="3" y="3" width="66" height="66" rx="' +
      Math.max(8, r - 4) +
      '" fill="url(#g)" opacity="0.92"/>' +
      '<text x="36" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="22" fill="#eaf4ff">' +
      String(ini).replace(/&/g, '').replace(/</g, '').replace(/>/g, '') +
      '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function partyAvatars(o) {
    var names = partyNames(o);
    var t = (o && o.task) || {};
    var en = (o && o.enriched) || {};
    var vUrl =
      (o && o.vendorLogo) ||
      t.vendorLogo ||
      t.shopLogo ||
      t.logo ||
      (en && (en.vendorLogo || en.logo)) ||
      (o.profile && (o.profile.logo || o.profile.photo || o.profile.image));
    var cUrl =
      (o && o.clientPhoto) ||
      t.clientPhoto ||
      t.clientAvatar ||
      t.customerPhoto ||
      t.photo ||
      (en && (en.clientPhoto || en.avatar));
    return {
      vendor: avatarUrl('vendor', names.vendor, vUrl),
      client: avatarUrl('client', names.client, cUrl),
      vendorName: names.vendor,
      clientName: names.client,
    };
  }

  function defaultParkPos(cardW, cardH) {
    var w = window.innerWidth || 390;
    var h = window.innerHeight || 844;
    cardW = cardW || Math.min(w * 0.92, 300);
    cardH = cardH || 120;
    var topChrome = 64;
    var x = Math.round((w - cardW) / 2);
    var y = Math.round(topChrome + 8);
    if (y + cardH > h - 130) y = Math.max(8, h - 130 - cardH);
    return { x: x, y: y };
  }

  function ensureParked(o, card) {
    if (!o) return;
    if (o.uiX != null && o.uiY != null) return;
    var w = card ? card.offsetWidth : Math.min((window.innerWidth || 390) * 0.92, 300);
    var h = card ? card.offsetHeight : 120;
    var p = defaultParkPos(w, h);
    o.uiX = p.x;
    o.uiY = p.y;
    if (card) {
      card.style.left = p.x + 'px';
      card.style.top = p.y + 'px';
      card.style.bottom = 'auto';
      card.style.transform = 'none';
      card.classList.add('park-top');
    }
  }

  var physRaf = null;
  var physTiles = Object.create(null);

  function physLoop() {
    physRaf = null;
    var w = window.innerWidth || 390;
    var h = window.innerHeight || 844;
    var any = false;
    var damp = 0.935;
    var bounce = 0.72;
    Object.keys(physTiles).forEach(function (oid) {
      var ph = physTiles[oid];
      if (!ph || !ph.el || !document.body.contains(ph.el)) {
        delete physTiles[oid];
        return;
      }
      var el = ph.el;
      var o = ph.o;
      var cw = el.offsetWidth || 200;
      var ch = el.offsetHeight || 100;
      var x = o.uiX != null ? o.uiX : el.getBoundingClientRect().left;
      var y = o.uiY != null ? o.uiY : el.getBoundingClientRect().top;
      ph.vx *= damp;
      ph.vy *= damp;
      x += ph.vx;
      y += ph.vy;
      if (x < 4) {
        x = 4;
        ph.vx = Math.abs(ph.vx) * bounce;
      } else if (x + cw > w - 4) {
        x = w - 4 - cw;
        ph.vx = -Math.abs(ph.vx) * bounce;
      }
      if (y < 4) {
        y = 4;
        ph.vy = Math.abs(ph.vy) * bounce;
      } else if (y + ch > h - 4) {
        y = h - 4 - ch;
        ph.vy = -Math.abs(ph.vy) * bounce;
      }
      o.uiX = x;
      o.uiY = y;
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
      if (Math.hypot(ph.vx, ph.vy) > 0.35) any = true;
      else {
        ph.vx = 0;
        ph.vy = 0;
        delete physTiles[oid];
      }
    });
    if (any || Object.keys(physTiles).length) {
      physRaf = requestAnimationFrame(physLoop);
    }
  }

  function startPhys(oid, el, o, vx, vy) {
    physTiles[oid] = { el: el, o: o, vx: vx, vy: vy };
    el.classList.add('physics');
    if (!physRaf) physRaf = requestAnimationFrame(physLoop);
  }

  function isRouteLocked(o) {
    if (!o) return false;
    if (o.routeLocked === true) return true;
    if (o.quote && (o.quote.private || (o.quote.nature && o.quote.nature.id === 'frozen'))) return true;
    if (o.task && (o.task.routeLocked || o.task.privateStraight || o.task.straightShot)) return true;
    // Paid private straight deal
    if (o.task && o.task.paid && o.quote && o.quote.privateFee > 0) return true;
    return false;
  }

  function buildStops(o) {
    if (o.stops && o.stops.length >= 2) return o.stops;
    var names = partyNames(o);
    var t = o.task || {};
    var locked = isRouteLocked(o);
    var stops = [];
    if (t.lat != null && t.lng != null) {
      stops.push({
        id: 'v:' + (t.vendorId || o.id),
        role: 'vendor',
        name: names.vendor,
        lat: Number(t.lat),
        lng: Number(t.lng),
        locked: locked || true, // pickup order fixed first by default
        fixedEnd: false,
      });
    }
    (t.stops || t.waypoints || []).forEach(function (s, i) {
      if (!s || s.lat == null) return;
      stops.push({
        id: s.id || 'mid:' + i,
        role: s.role || 'stop',
        name: s.label || s.name || 'Stop ' + (i + 1),
        lat: Number(s.lat),
        lng: Number(s.lng),
        locked: !!s.locked || locked,
      });
    });
    if (t.drop_lat != null && t.drop_lng != null) {
      stops.push({
        id: 'c:' + o.id,
        role: 'client',
        name: names.client,
        lat: Number(t.drop_lat),
        lng: Number(t.drop_lng),
        locked: locked || true, // drop fixed last by default
        fixedEnd: true,
      });
    }
    // Private straight: only vendor → client, all locked
    if (locked && stops.length >= 2) {
      stops = [stops[0], stops[stops.length - 1]].map(function (s) {
        return Object.assign({}, s, { locked: true });
      });
    }
    o.stops = stops;
    o.routeLocked = locked;
    return stops;
  }

  /** Multi-task polygon: all active vendor/client pins in driver order */
  function collectNetworkStops() {
    var list = [];
    stack.forEach(function (o) {
      if (!o || o.kind !== 'task') return;
      if (o.phase === 'done') return;
      var st = buildStops(o);
      st.forEach(function (s) {
        list.push(Object.assign({ offerId: o.id, private: isRouteLocked(o) }, s));
      });
    });
    return list;
  }

  function drawAllPolygons(focusOffer) {
    try {
      var stops = [];
      if (focusOffer && focusOffer.kind === 'task') {
        stops = buildStops(focusOffer).slice();
      }
      // Merge other active tasks' vendor/client (not locked mid-reorder of others)
      stack.forEach(function (o) {
        if (!o || o.kind !== 'task' || o.phase === 'done') return;
        if (focusOffer && o.id === focusOffer.id) return;
        var st = buildStops(o);
        // For multi-run: insert other pickups before final client of focus
        if (st.length >= 2) {
          // vendor of other task as intermediate if not private
          if (!isRouteLocked(o) && st[0]) {
            var mid = Object.assign({}, st[0], { id: 'net:' + o.id, role: 'vendor', locked: false });
            if (stops.length >= 2) stops.splice(stops.length - 1, 0, mid);
            else stops.push(mid);
          }
        }
      });
      if (stops.length < 2 && focusOffer && focusOffer.task) {
        return previewRoute(focusOffer.task, focusOffer);
      }
      if (stops.length < 2) return;
      var wps = stops.map(function (s) {
        return { lat: s.lat, lng: s.lng, label: s.name };
      });
      var locked = focusOffer ? isRouteLocked(focusOffer) : false;
      var names = focusOffer ? partyNames(focusOffer) : { vendor: 'Vendor', client: 'Client' };
      if (global.SNField && SNField.startDeliveryRoute) {
        void SNField.startDeliveryRoute({
          id: 'live:poly_' + ((focusOffer && focusOffer.id) || 'net'),
          vendorLat: wps[0].lat,
          vendorLng: wps[0].lng,
          dropLat: wps[wps.length - 1].lat,
          dropLng: wps[wps.length - 1].lng,
          waypoints: wps,
          stops: wps.slice(1, -1),
          label: String(names.vendor + ' → ' + names.client).slice(0, 28),
          driver: locked ? 'private' : 'route',
          color: locked ? 'rgba(255,200,80,0.95)' : 'rgba(50,150,255,0.95)',
          etaMin: (focusOffer && focusOffer.quote && focusOffer.quote.etaMin) || 18,
          speedKmh: locked ? 28 : 22,
          preview: true,
        });
      }
      if (global.SNField && SNField.setRadarExpanded) SNField.setRadarExpanded(true);
      if (global.SNGlobe && SNGlobe.pulse) {
        stops.forEach(function (s, i) {
          var col =
            s.role === 'vendor' ? (locked ? 0xffc83d : 0x3d9eff) : s.role === 'client' ? 0x7ec8ff : 0x9ad4ff;
          SNGlobe.pulse(s.lat, s.lng, col, String(s.name || s.role).slice(0, 14), 12000);
        });
      }
      // Labels on map markers if available
      try {
        if (global.SNMap && SNMap.open && stops[0]) {
          // Open map once for route; never block shell if map fails
          void Promise.resolve(SNMap.open(stops[0].lat, stops[0].lng)).catch(function () {});
          if (SNMap.markYou && stops[stops.length - 1]) {
            try {
              SNMap.markYou(stops[stops.length - 1].lat, stops[stops.length - 1].lng, 'YOU · ' + names.client);
            } catch (_) {}
          }
        }
      } catch (_) {}
    } catch (e) {
      try {
        log('Polygon · ' + (e && e.message ? e.message : e), 'dim');
      } catch (_) {}
    }
  }

  function moveStop(oid, stopId, dir) {
    var o = find(oid);
    if (!o) return;
    if (isRouteLocked(o)) {
      log('Route locked · private/straight deal — cannot rearrange', 'err');
      return;
    }
    var stops = buildStops(o);
    var idx = -1;
    for (var i = 0; i < stops.length; i++) {
      if (stops[i].id === stopId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    var j = idx + (dir < 0 ? -1 : 1);
    // Cannot move first vendor or last client out of ends
    if (idx === 0 || idx === stops.length - 1) {
      log('Pickup/drop ends are fixed · only mid stops move', 'dim');
      return;
    }
    if (j <= 0 || j >= stops.length - 1) return;
    if (stops[j].locked || stops[idx].locked) {
      log('Stop locked by deal priority', 'err');
      return;
    }
    var tmp = stops[idx];
    stops[idx] = stops[j];
    stops[j] = tmp;
    o.stops = stops;
    // Recompute km if both ends known
    try {
      var km = 0;
      for (var k = 0; k < stops.length - 1; k++) {
        km += haversineKm(stops[k].lat, stops[k].lng, stops[k + 1].lat, stops[k + 1].lng) || 0;
      }
      if (km > 0 && o.task) {
        o.task._km = km;
        o.km = km;
        o.quote = rulesQuote({
          km: km,
          nature: o.natureId || o.nature,
          title: o.title,
          night: o.quote && o.quote.night,
          heavy: o.quote && o.quote.heavy,
          vip: o.quote && o.quote.vip,
          private: o.quote && o.quote.private,
        });
        o.priceNum = o.quote.total;
        o.price = fmtPrice(o.quote.total);
        o.meta = o.quote.metaLine;
      }
    } catch (_) {}
    log('Route rearranged · polygon updated', 'ok');
    drawAllPolygons(o);
    paint();
  }

  function setTileSize(oid, size) {
    var o = find(oid);
    if (!o) return;
    if (size === 'close') {
      dismiss(oid);
      return;
    }
    if (size === 'min') o.uiSize = 'min';
    else if (size === 'max') o.uiSize = 'max';
    else o.uiSize = 'mid';
    paint();
  }

  /** Singleton drag/throw — NEVER add window listeners per paint (that froze the app) */
  var dragState = null; // { card, o, startX, startY, origL, origT, lastT, lastX, lastY, vx, vy }
  var dragBound = false;

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
      var nl = st.origL + dx;
      var nt = st.origT + dy;
      nl = Math.max(-cw * 0.35, Math.min(w - cw * 0.65, nl));
      nt = Math.max(-ch * 0.2, Math.min(h - ch * 0.5, nt));
      st.card.style.left = nl + 'px';
      st.card.style.top = nt + 'px';
      st.o.uiX = nl;
      st.o.uiY = nt;
      var dt = Math.max(1, now - st.lastT);
      var ivx = (pe.clientX - st.lastX) / dt;
      var ivy = (pe.clientY - st.lastY) / dt;
      st.vx = st.vx * 0.35 + ivx * 0.65;
      st.vy = st.vy * 0.35 + ivy * 0.65;
      st.lastX = pe.clientX;
      st.lastY = pe.clientY;
      st.lastT = now;
      if (ev.cancelable) ev.preventDefault();
    }
    function onUp(ev) {
      if (!dragState) return;
      var st = dragState;
      dragState = null;
      st.card.classList.remove('dragging');
      var speed = Math.hypot(st.vx, st.vy);
      var throwVx = st.vx * 18;
      var throwVy = st.vy * 18;
      if (speed > 0.08) {
        var mag = Math.hypot(throwVx, throwVy);
        var max = 48;
        if (mag > max) {
          throwVx = (throwVx / mag) * max;
          throwVy = (throwVy / mag) * max;
        }
        startPhys(st.o.id, st.card, st.o, throwVx, throwVy);
      } else {
        var w = window.innerWidth || 390;
        var h = window.innerHeight || 844;
        var cw = st.card.offsetWidth || 200;
        var ch = st.card.offsetHeight || 100;
        st.o.uiX = Math.max(4, Math.min(w - cw - 4, st.o.uiX));
        st.o.uiY = Math.max(4, Math.min(h - ch - 4, st.o.uiY));
        st.card.style.left = Math.round(st.o.uiX) + 'px';
        st.card.style.top = Math.round(st.o.uiY) + 'px';
      }
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  }

  function bindDrag(card, o) {
    if (!card || !o) return;
    ensureDragGlobals();
    ensureParked(o, card);
    // Only one pointerdown per element (recreated each paint — fine, no window leak)
    card.onpointerdown = function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('button,a,input,.mv,.sn-chrome-btn,.sn-pill-btn,.sn-offer-btn'))
        return;
      if (physTiles[o.id]) delete physTiles[o.id];
      var pe = ev;
      var rect = card.getBoundingClientRect();
      card.style.left = rect.left + 'px';
      card.style.top = rect.top + 'px';
      card.style.bottom = 'auto';
      card.style.transform = 'none';
      card.classList.remove('park-top');
      card.classList.add('dragging');
      o.uiX = rect.left;
      o.uiY = rect.top;
      dragState = {
        card: card,
        o: o,
        startX: pe.clientX,
        startY: pe.clientY,
        origL: rect.left,
        origT: rect.top,
        lastT: performance.now(),
        lastX: pe.clientX,
        lastY: pe.clientY,
        vx: 0,
        vy: 0,
      };
      try {
        if (ev.pointerId != null && card.setPointerCapture) card.setPointerCapture(ev.pointerId);
      } catch (_) {}
      if (ev.cancelable) ev.preventDefault();
    };
  }

  function paint() {
    try {
    var el = ensureRoot();
    if (!stack.length && !queue.length) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    var hint =
      queue.length > 0
        ? '<div class="sn-queue-hint">' + queue.length + ' queued</div>'
        : '';
    el.innerHTML =
      hint +
      stack
        .map(function (o, idx) {
          var isTask = o.kind === 'task';
          var phase = o.phase || 'offered';
          var size = o.uiSize || (phase === 'offered' ? 'mid' : 'max');
          if (phase === 'claimed' || phase === 'underway' || phase === 'confirming') {
            if (!o.uiSize) size = 'max';
          }
          var isOpen = size === 'max' || phase === 'confirming' || (o.menu && o.menu.length && size !== 'min');
          var q = o.quote || null;
          var priceTxt = o.price || (o.priceNum != null ? fmtPrice(o.priceNum) : '—');
          var names = partyNames(o);
          var line =
            o.meta ||
            (q && q.metaLine) ||
            o.nature ||
            o.title ||
            'Task';
          if (line.length > 40) line = line.slice(0, 38) + '…';
          var stops = isTask ? buildStops(o) : [];
          var locked = isRouteLocked(o);
          var chips = '';
          if (q) {
            var ch = [];
            if (q.nature)
              ch.push({
                t: (q.nature.emoji || '') + ' ' + (q.nature.label || ''),
                c: q.nature.id === 'frozen' ? 'ice' : q.nature.id === 'hot_food' ? 'hot' : '',
              });
            if (q.night) ch.push({ t: 'Night +3', c: 'night' });
            if (q.heavy) ch.push({ t: 'Heavy +3', c: 'warn' });
            if (q.vip) ch.push({ t: 'VIP +3', c: 'ice' });
            if (q.private) ch.push({ t: 'Private +3', c: 'priv' });
            if (locked) ch.push({ t: 'Route lock', c: 'priv' });
            if (q.windowMin) ch.push({ t: '≤' + q.windowMin + 'm', c: '' });
            chips =
              '<div class="sn-pill-chips">' +
              ch
                .map(function (x) {
                  return '<span class="sn-chip ' + esc(x.c) + '">' + esc(x.t) + '</span>';
                })
                .join('') +
              '</div>';
          }
          var conf = o.confirms || { client: false, vendor: false, driver: false };
          var confHtml = '';
          if (phase === 'confirming' || phase === 'underway' || phase === 'done') {
            confHtml =
              '<div class="sn-confirm-row">' +
              '<button type="button" class="sn-offer-btn confirm' +
              (conf.client ? ' on' : '') +
              '" data-confirm="client" data-oid="' +
              esc(o.id) +
              '">Client ' +
              (conf.client ? '✓' : '○') +
              '</button>' +
              '<button type="button" class="sn-offer-btn confirm' +
              (conf.vendor ? ' on' : '') +
              '" data-confirm="vendor" data-oid="' +
              esc(o.id) +
              '">Vendor ' +
              (conf.vendor ? '✓' : '○') +
              '</button>' +
              '<button type="button" class="sn-offer-btn confirm' +
              (conf.driver ? ' on' : '') +
              '" data-confirm="driver" data-oid="' +
              esc(o.id) +
              '">Driver ' +
              (conf.driver ? '✓' : '○') +
              '</button></div>';
          }
          var lim = o.limitsCheck || null;
          var canComplete =
            phase === 'confirming' && conf.client && conf.vendor && conf.driver;
          var primaryAct =
            phase === 'offered'
              ? 'accept'
              : phase === 'claimed'
                ? 'start'
                : phase === 'underway'
                  ? 'arrive'
                  : phase === 'confirming'
                    ? 'complete'
                    : 'dismiss';
          var primaryLabel =
            phase === 'offered'
              ? 'Take'
              : phase === 'claimed'
                ? 'Start'
                : phase === 'underway'
                  ? 'Arrive'
                  : phase === 'confirming'
                    ? canComplete
                      ? 'Settle'
                      : '3× OK'
                    : 'Close';
          var primaryCls =
            phase === 'confirming'
              ? 'complete'
              : phase === 'claimed'
                ? 'start'
                : phase === 'offered'
                  ? 'accept'
                  : 'okwide';
          var menuHtml = '';
          if (o.menu && o.menu.length) {
            menuHtml =
              '<div class="sn-offer-menu">' +
              o.menu
                .map(function (it) {
                  return (
                    '<div class="sn-offer-menu-item">' +
                    '<span class="sn-offer-menu-name">' +
                    esc((it.emoji ? it.emoji + ' ' : '') + it.name) +
                    '</span>' +
                    (it.price != null
                      ? '<span class="sn-offer-menu-price">' + esc(fmtPrice(it.price)) + '</span>'
                      : '') +
                    '<button type="button" class="sn-offer-btn order" data-act="order" data-oid="' +
                    esc(o.id) +
                    '" data-item="' +
                    esc(it.id) +
                    '">Order</button></div>'
                  );
                })
                .join('') +
              '</div>';
          }
          var av = partyAvatars(o);
          var parties =
            isTask || o.kind === 'vendor'
              ? '<div class="sn-parties">' +
                '<div class="sn-party vendor"><img class="av" alt="" src="' +
                esc(av.vendor) +
                '" width="36" height="36" decoding="async"/><span class="tag">Vendor</span><span class="nm">' +
                esc(names.vendor) +
                '</span><span class="role">pickup</span></div>' +
                (isTask
                  ? '<div class="sn-party client"><img class="av" alt="" src="' +
                    esc(av.client) +
                    '" width="36" height="36" decoding="async"/><span class="tag">Client</span><span class="nm">' +
                    esc(names.client) +
                    '</span><span class="role">drop</span></div>'
                  : '') +
                '</div>'
              : '';
          var stopsHtml = '';
          if (isTask && size === 'max' && stops.length) {
            stopsHtml =
              '<div class="sn-stops">' +
              stops
                .map(function (s, si) {
                  var canUp = !locked && si > 1 && si < stops.length - 1;
                  var canDn = !locked && si > 0 && si < stops.length - 2;
                  // mid stops only: index 1..len-2
                  var isMid = si > 0 && si < stops.length - 1;
                  return (
                    '<div class="sn-stop' +
                    (s.locked || locked ? ' locked' : '') +
                    '">' +
                    '<span class="ord">' +
                    (si + 1) +
                    '</span>' +
                    '<span class="lab">' +
                    esc((s.role === 'vendor' ? '🏪 ' : s.role === 'client' ? '📍 ' : '• ') + s.name) +
                    '</span>' +
                    (s.locked || locked
                      ? '<span class="lock">lock</span>'
                      : isMid
                        ? '<button type="button" class="mv" data-move="up" data-sid="' +
                          esc(s.id) +
                          '" data-oid="' +
                          esc(o.id) +
                          '" ' +
                          (si <= 1 ? 'disabled' : '') +
                          ' aria-label="Move up">↑</button>' +
                          '<button type="button" class="mv" data-move="down" data-sid="' +
                          esc(s.id) +
                          '" data-oid="' +
                          esc(o.id) +
                          '" ' +
                          (si >= stops.length - 2 ? 'disabled' : '') +
                          ' aria-label="Move down">↓</button>'
                        : '') +
                    '</div>'
                  );
                })
                .join('') +
              '</div>' +
              '<div class="sn-route-note' +
              (locked ? ' lock' : '') +
              '">' +
              esc(
                locked
                  ? 'Straight private deal · polygon fixed · cannot rearrange'
                  : 'Drag tile · rearrange mid-stops if multi · ends fixed'
              ) +
              '</div>';
          }
          var tray =
            '<div class="sn-pill-tray">' +
            (o.sub && !isTask ? '<div class="sn-pill-meta">' + esc(o.sub) + '</div>' : '') +
            chips +
            (o.drone ? '<div class="sn-offer-drone">RAI DRONE · polygon live</div>' : '') +
            (phase === 'underway' || phase === 'claimed' || phase === 'confirming'
              ? '<div class="sn-offer-progress"><i style="width:' +
                Math.min(100, o.progress || 0) +
                '%"></i></div>'
              : '') +
            confHtml +
            (isTask
              ? '<div class="sn-comms' +
                (lim && lim.offLimits ? ' off' : '') +
                '">' +
                esc(
                  lim && lim.offLimits
                    ? 'COMMS OPEN · ' + (lim.reason || 'off limits')
                    : 'No call · no msg · within plan'
                ) +
                '</div>'
              : '') +
            '<div class="sn-seal">3× seal · no support judge · anti-fraud</div>' +
            menuHtml +
            (o.menu && o.menu.length
              ? ''
              : '<div class="sn-pill-wide">' +
                '<button type="button" class="sn-offer-btn ' +
                primaryCls +
                '" data-act="' +
                primaryAct +
                '" data-oid="' +
                esc(o.id) +
                '"' +
                (phase === 'confirming' && !canComplete ? ' disabled' : '') +
                '>' +
                esc(primaryLabel) +
                '</button>' +
                (phase === 'offered'
                  ? '<button type="button" class="sn-offer-btn" data-act="reject" data-oid="' +
                    esc(o.id) +
                    '">Skip</button>'
                  : '') +
                '</div>') +
            '</div>';

          var pillActs = '';
          if (isTask && phase === 'offered') {
            pillActs =
              '<div class="sn-pill-acts">' +
              '<button type="button" class="sn-pill-btn ok" data-act="accept" data-oid="' +
              esc(o.id) +
              '" aria-label="Accept">✓</button>' +
              '<button type="button" class="sn-pill-btn map" data-act="map" data-oid="' +
              esc(o.id) +
              '" aria-label="Map route">↻</button>' +
              '<button type="button" class="sn-pill-btn no" data-act="reject" data-oid="' +
              esc(o.id) +
              '" aria-label="Reject">×</button></div>';
          } else if (isTask) {
            pillActs =
              '<div class="sn-pill-acts">' +
              '<button type="button" class="sn-pill-btn map" data-act="map" data-oid="' +
              esc(o.id) +
              '" aria-label="Map">↻</button>' +
              '<button type="button" class="sn-pill-btn ok" data-act="' +
              primaryAct +
              '" data-oid="' +
              esc(o.id) +
              '"' +
              (phase === 'confirming' && !canComplete ? ' disabled' : '') +
              ' aria-label="' +
              esc(primaryLabel) +
              '">' +
              (phase === 'confirming' ? (canComplete ? '€' : '3') : phase === 'underway' ? '▸' : '▶') +
              '</button></div>';
          }

          var posStyle = '';
          if (o.uiX != null && o.uiY != null) {
            posStyle =
              'left:' +
              Math.round(o.uiX) +
              'px;top:' +
              Math.round(o.uiY) +
              'px;bottom:auto;transform:none;';
          }

          return (
            '<div class="sn-offer kind-' +
            esc(o.kind || 'task') +
            (idx === 0 ? ' hero' : '') +
            (isOpen ? ' is-open' : '') +
            ' size-' +
            esc(size) +
            ' phase-' +
            esc(phase) +
            '" data-oid="' +
            esc(o.id) +
            '" data-phase="' +
            esc(phase) +
            '" data-size="' +
            esc(size) +
            '" role="status" aria-label="Task offer ' +
            esc(names.vendor) +
            ' to ' +
            esc(names.client) +
            ' ' +
            esc(priceTxt) +
            '" style="' +
            posStyle +
            '">' +
            '<div class="sn-chrome" data-drag="' +
            esc(o.id) +
            '">' +
            '<button type="button" class="sn-chrome-btn min" data-size="min" data-oid="' +
            esc(o.id) +
            '" aria-label="Minimize" title="Minimize">−</button>' +
            '<button type="button" class="sn-chrome-btn close" data-size="close" data-oid="' +
            esc(o.id) +
            '" aria-label="Close" title="Close">×</button>' +
            '<span class="sn-chrome-title">' +
            esc(phase === 'offered' ? 'OFFER' : phase.toUpperCase()) +
            '</span>' +
            '<button type="button" class="sn-chrome-btn max" data-size="max" data-oid="' +
            esc(o.id) +
            '" aria-label="Maximize" title="Maximize">+</button>' +
            '</div>' +
            '<div class="sn-pill-main">' +
            '<span class="sn-pill-dot" aria-hidden="true"></span>' +
            '<div class="sn-pill-body">' +
            '<div class="sn-pill-price">' +
            esc(String(priceTxt)) +
            '</div>' +
            '<div class="sn-pill-line">' +
            esc(line) +
            '</div></div>' +
            pillActs +
            '</div>' +
            (size === 'min' ? '' : parties) +
            (size === 'min' ? '' : stopsHtml) +
            (size === 'min' ? '' : isOpen || size === 'max' ? tray : '') +
            '</div>'
          );
        })
        .join('');
    el.querySelectorAll('[data-size]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setTileSize(btn.getAttribute('data-oid'), btn.getAttribute('data-size'));
      };
    });
    el.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        runAct(btn.getAttribute('data-oid'), btn.getAttribute('data-act'), {
          itemId: btn.getAttribute('data-item'),
        });
      };
    });
    el.querySelectorAll('[data-confirm]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.preventDefault();
        setConfirm(btn.getAttribute('data-oid'), btn.getAttribute('data-confirm'));
      };
    });
    el.querySelectorAll('[data-move]').forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        moveStop(
          btn.getAttribute('data-oid'),
          btn.getAttribute('data-sid'),
          btn.getAttribute('data-move') === 'up' ? -1 : 1
        );
      };
    });
    el.querySelectorAll('.sn-offer').forEach(function (card) {
      var oid = card.getAttribute('data-oid');
      var o = find(oid);
      if (!o) return;
      try {
        ensureParked(o, card);
        if (o.uiX != null && o.uiY != null) {
          card.style.left = Math.round(o.uiX) + 'px';
          card.style.top = Math.round(o.uiY) + 'px';
          card.style.bottom = 'auto';
          card.style.transform = 'none';
        }
        bindDrag(card, o);
        // Keep physics bound to new DOM node after repaint
        if (physTiles[oid]) {
          physTiles[oid].el = card;
          physTiles[oid].o = o;
        }
      } catch (eBind) {
        try {
          console.warn('[SNOfferStack] bind', eBind);
        } catch (_) {}
      }
    });
      } catch (ePaint) {
      try { console.warn('[SNOfferStack] paint', ePaint); } catch (_) {}
    }
  }


  function previewRoute(task, offer) {
    if (!task && !offer) return;
    try {
      if (task) focusTaskOnGlobe(task);
    } catch (_) {}
    try {
      if (offer) {
        buildStops(offer);
        drawAllPolygons(offer);
        return;
      }
      var priv = false;
      var vLat = task.lat != null ? Number(task.lat) : null;
      var vLng = task.lng != null ? Number(task.lng) : null;
      var dLat = task.drop_lat != null ? Number(task.drop_lat) : null;
      var dLng = task.drop_lng != null ? Number(task.drop_lng) : null;
      if (vLat == null || dLat == null) return;
      if (global.SNField && SNField.startDeliveryRoute) {
        void SNField.startDeliveryRoute({
          id: 'live:preview_' + (task.id || Date.now()),
          vendorLat: vLat,
          vendorLng: vLng,
          dropLat: dLat,
          dropLng: dLng,
          waypoints: [
            { lat: vLat, lng: vLng, label: task.vendorName || 'Vendor' },
            { lat: dLat, lng: dLng, label: task.clientName || 'Client' },
          ],
          label: String((task.vendorName || 'Vendor') + ' → ' + (task.clientName || 'You')).slice(0, 28),
          driver: 'preview',
          color: 'rgba(50,150,255,0.95)',
          etaMin: task.etaMin || 18,
          speedKmh: 22,
          preview: true,
        });
      }
      if (global.SNField && SNField.setRadarExpanded) SNField.setRadarExpanded(true);
      if (global.SNGlobe && SNGlobe.pulse) {
        SNGlobe.pulse(vLat, vLng, 0x3d9eff, String(task.vendorName || 'Vendor').slice(0, 14), 10000);
        SNGlobe.pulse(dLat, dLng, 0x7ec8ff, String(task.clientName || 'You').slice(0, 14), 10000);
      }
    } catch (_) {}
  }

  function find(id) {
    for (var i = 0; i < stack.length; i++) if (stack[i].id === id) return stack[i];
    return null;
  }

  function dismiss(id) {
    queue = queue.filter(function (o) {
      return o.id !== id;
    });
    stack = stack.filter(function (o) {
      return o.id !== id;
    });
    flushQueue();
  }

  function setConfirm(id, party) {
    var o = find(id);
    if (!o) return;
    o.confirms = o.confirms || { client: false, vendor: false, driver: false, at: {} };
    o.confirms[party] = true;
    o.confirms.at = o.confirms.at || {};
    o.confirms.at[party] = Date.now();
    log(
      'Confirm · ' + party + ' OK · ' + (o.nature || o.title),
      'ok'
    );
    var all =
      o.confirms.client && o.confirms.vendor && o.confirms.driver;
    if (all && o.phase === 'confirming') {
      paint();
      // Ready for settle — user taps Settle pay
      log('All parties OK · Settle pay to close', 'ok');
    } else {
      paint();
    }
  }

  function focusTaskOnGlobe(task) {
    if (!task) return;
    var lat = task.lat != null ? Number(task.lat) : task.drop_lat != null ? Number(task.drop_lat) : null;
    var lng = task.lng != null ? Number(task.lng) : task.drop_lng != null ? Number(task.drop_lng) : null;
    if (lat == null || lng == null) return;
    try {
      if (global.SNGlobe && SNGlobe.setFocus) SNGlobe.setFocus(lat, lng);
      else global._snGlobeFocus = { lat: lat, lng: lng };
      global._snLastPos = global._snLastPos || { lat: lat, lng: lng };
      if (global.SNGlobe && SNGlobe.goToPlace) SNGlobe.goToPlace(lat, lng, { quiet: true });
    } catch (_) {}
    try {
      if (global.SNTaskBoard && SNTaskBoard.previewTaskOnMap) {
        void SNTaskBoard.previewTaskOnMap(task, { fit: true, force: true, select: true });
        return;
      }
    } catch (_) {}
    try {
      if (global.SNMap && SNMap.open) {
        void SNMap.open(lat, lng, { force: true, animate: true });
        if (SNMap.showTasks) SNMap.showTasks();
      }
    } catch (_) {}
    try {
      if (global.SNField && SNField.startDeliveryRoute && task.drop_lat != null) {
        void SNField.startDeliveryRoute({
          id: 'live:offer_' + (task.id || Date.now()),
          vendorLat: lat,
          vendorLng: lng,
          dropLat: Number(task.drop_lat),
          dropLng: Number(task.drop_lng),
          label: String(task.title || 'Task').slice(0, 18),
          driver: 'route',
          color: 'rgba(40,160,255,0.95)',
        });
      }
    } catch (_) {}
  }

  function push(offer) {
    if (!offer || !offer.id) return null;
    return enqueueOrShow(offer);
  }

  function pushTask(task, extra) {
    extra = extra || {};
    if (!task || !task.id) return null;
    var enriched = null;
    try {
      if (global.SNTaskBoard && SNTaskBoard.enrich) enriched = SNTaskBoard.enrich(task);
    } catch (_) {}
    var meta = taskMeta(task, extra);
    var q = rulesQuote({
      km: meta.km != null ? meta.km : extra.km,
      nature: extra.natureId || extra.product || meta.nature || task.title,
      title: task.title,
      product: extra.product || task.menuItem || task.title,
      night: meta.night,
      heavy: extra.heavy != null ? extra.heavy : task.heavy,
      vip: extra.vip,
      private: extra.private,
      traffic: extra.traffic != null ? extra.traffic : 1,
    });
    // Prefer rules total unless explicit override price was set AND rules unavailable
    var rawPrice =
      extra.forcePrice != null
        ? Number(extra.forcePrice)
        : q && q.total != null
          ? q.total
          : enriched && enriched.price != null
            ? enriched.price
            : task.total_s != null
              ? task.total_s
              : extra.price != null
                ? extra.price
                : null;
    if (rawPrice != null && task && task.total_s == null) task.total_s = rawPrice;
    var price = rawPrice != null ? fmtPrice(rawPrice) : '';
    var route =
      (enriched && enriched.vendorName ? enriched.vendorName : task.vendorName || '') +
      (enriched && enriched.clientName
        ? ' → ' + enriched.clientName
        : task.clientName
          ? ' → ' + task.clientName
          : '');
    if (!route && task.title) route = String(task.title).slice(0, 48);
    var st = String(task.status || 'open');
    var phase =
      st === 'done' || st === 'settled' || st === 'cancelled'
        ? 'done'
        : st === 'confirming'
          ? 'confirming'
          : st === 'in_progress' || st === 'en_route'
            ? 'underway'
            : st === 'claimed' || st === 'assigned'
              ? 'claimed'
              : 'offered';
    var kindLabel =
      phase === 'offered'
        ? 'NEW TASK'
        : phase === 'claimed'
          ? 'CLAIMED'
          : phase === 'underway'
            ? 'UNDERWAY'
            : phase === 'confirming'
              ? 'CONFIRM 3×'
              : phase === 'done'
                ? 'COMPLETED'
                : 'TASK';
    var conf = null;
    try {
      if (global.SNDeliveryRules && SNDeliveryRules.newConfirms) conf = SNDeliveryRules.newConfirms();
    } catch (_) {}
    conf = conf || { client: false, vendor: false, driver: false, at: {} };
    var vName =
      (enriched && enriched.vendorName) ||
      task.vendorName ||
      task.shopName ||
      extra.vendorName ||
      'Vendor';
    var cName =
      (enriched && enriched.clientName) ||
      task.clientName ||
      task.customerName ||
      extra.clientName ||
      'You';
    // Ensure task carries names for polygon labels
    try {
      task.vendorName = vName;
      task.clientName = cName;
    } catch (_) {}
    var o = push({
      id: 'task:' + task.id,
      kind: 'task',
      kindLabel: kindLabel,
      phase: phase,
      progress: phase === 'done' ? 100 : phase === 'underway' ? 45 : phase === 'claimed' ? 15 : phase === 'confirming' ? 90 : 0,
      nature: (q.nature && q.nature.label ? q.nature.label + ' · ' : '') + (meta.nature || task.title || 'Task'),
      natureId: q.nature && q.nature.id,
      title: meta.nature,
      meta: q.metaLine || meta.line,
      sub: route || (vName + ' → ' + cName),
      vendorName: vName,
      clientName: cName,
      price: price,
      priceNum: rawPrice,
      quote: q,
      km: q.km,
      confirms: conf,
      limitsCheck: { offLimits: false, reason: 'within plan · no call / no messaging' },
      taskId: task.id,
      task: task,
      enriched: enriched,
      uiSize: extra.uiSize || 'mid',
      routeLocked: !!(q.private || extra.routeLocked || task.routeLocked || task.straightShot),
      primary:
        phase === 'offered'
          ? 'Accept'
          : phase === 'claimed'
            ? 'Start run'
            : phase === 'underway'
              ? 'Arrive'
              : phase === 'confirming'
                ? 'Need 3× OK'
                : 'Done',
      t: Date.now(),
    });
    try {
      buildStops(o);
    } catch (_) {}
    if (!extra.quiet) {
      try {
        previewRoute(task, o);
      } catch (_) {
        try {
          focusTaskOnGlobe(task);
        } catch (_) {}
      }
      log(
        'Peek · ' +
          (price || '') +
          ' · ' +
          (q.metaLine || meta.line || '') +
          ' · polygon preview',
        'ok'
      );
    }
    return o;
  }

  function normalizeMenu(menu) {
    if (!menu || !menu.length) return [];
    return menu.slice(0, 2).map(function (it, i) {
      if (!it) return null;
      if (typeof it === 'string') return { id: 'm' + i, name: it, price: null, emoji: '•' };
      return {
        id: it.id || 'm' + i,
        name: String(it.name || it.title || 'Item').slice(0, 36),
        price: it.price != null ? Number(it.price) : it.s != null ? Number(it.s) : null,
        emoji: it.emoji || '•',
      };
    }).filter(Boolean);
  }

  function pushVendor(profile, extra) {
    extra = extra || {};
    if (!profile || !profile.id) return null;
    var title = (profile.shopName || profile.name || 'Vendor').slice(0, 36);
    var sub = [];
    if (profile._km != null) sub.push(Number(profile._km).toFixed(1) + ' km');
    if (profile.rating != null) sub.push('★' + Number(profile.rating).toFixed(1));
    if (profile.openNow === true) sub.push('open');
    if (profile.shopKind) sub.push(String(profile.shopKind));
    if (extra.item) sub.push(String(extra.item).slice(0, 24));
    var menu = normalizeMenu(extra.menu || profile.menu || profile.items || []);
    var bits = [];
    if (profile.hours) bits.push(String(profile.hours).slice(0, 22));
    if (profile.phone) bits.push(String(profile.phone).slice(0, 18));
    var priceNum = profile._price != null ? profile._price : menu[0] && menu[0].price;
    return push({
      id: 'vendor:' + profile.id,
      kind: 'vendor',
      kindLabel: extra.grower ? 'GROWER · SHOP' : 'VENDOR',
      phase: 'offered',
      nature: title,
      title: title,
      meta: sub.join(' · ') || profile.shopKind || 'shop',
      sub: bits.join(' · '),
      vendorBits: bits.join(' · '),
      price: priceNum != null ? fmtPrice(priceNum) : '',
      priceNum: priceNum,
      profileId: profile.id,
      profile: profile,
      menu: menu,
      lat: profile.lat,
      lng: profile.lng,
      primary: menu.length ? 'Order top' : 'Menu',
      t: Date.now(),
    });
  }

  /** Grower path: vendor tile with full menu + order → Rai drone */
  function pushVendorMenu(profile, extra) {
    extra = extra || {};
    extra.grower = true;
    if (profile && !profile.menu && extra.menu) profile.menu = extra.menu;
    return pushVendor(profile, extra);
  }

  function pushDriverOffer(driver, task) {
    if (!driver) return null;
    return push({
      id: 'driver:' + (driver.id || driver.name) + (task && task.id ? ':' + task.id : ''),
      kind: 'driver',
      kindLabel: 'DRIVER',
      phase: 'offered',
      nature: (driver.name || 'Driver').slice(0, 32),
      title: (driver.name || 'Driver').slice(0, 32),
      meta: (driver.vehicle || 'scooter') + (driver.driverOnline ? ' · ONLINE' : ''),
      profileId: driver.id,
      taskId: task && task.id,
      primary: 'Claim job',
      t: Date.now(),
    });
  }

  function liveTask(o) {
    if (!o) return null;
    try {
      if (o.taskId && global.SNTasks && SNTasks.get) {
        var t = SNTasks.get(o.taskId);
        if (t) return t;
      }
    } catch (_) {}
    return o.task || null;
  }

  function markPhase(o, phase, extra) {
    extra = extra || {};
    if (!o) return;
    o.phase = phase;
    if (phase === 'claimed') {
      o.kindLabel = 'CLAIMED';
      o.primary = 'Start run';
      o.progress = 15;
      o.meta = (extra.meta || o.meta || '') + (String(o.meta || '').indexOf('accepted') >= 0 ? '' : ' · accepted');
    } else if (phase === 'underway') {
      o.kindLabel = 'UNDERWAY';
      o.primary = 'Arrive';
      o.progress = extra.progress != null ? extra.progress : 45;
      o.meta = extra.meta || 'en route · in progress';
    } else if (phase === 'confirming') {
      o.kindLabel = 'CONFIRM 3×';
      o.primary = 'Need 3× OK';
      o.progress = extra.progress != null ? extra.progress : 92;
      o.meta = extra.meta || 'arrived · client + vendor + driver must OK';
      o.confirms = o.confirms || { client: false, vendor: false, driver: false, at: {} };
    } else if (phase === 'done') {
      o.kindLabel = 'COMPLETED';
      o.primary = 'Done · close';
      o.progress = 100;
      o.meta = extra.meta || 'delivered · settled · 3× confirmed';
    } else {
      o.kindLabel = 'NEW TASK';
      o.primary = 'Accept';
      o.progress = 0;
    }
    paint();
  }

  function ensureTaskPersisted(o) {
    if (!o) return null;
    var t = liveTask(o);
    if (t && global.SNTasks && SNTasks.get && SNTasks.get(t.id)) return t;
    if (!global.SNTasks || !SNTasks.create) return t || o.task || null;
    try {
      var seed = t || o.task || {};
      var real = SNTasks.create({
        kind: seed.kind || 'delivery',
        title: seed.title || o.nature || 'Local delivery',
        status: seed.status || 'seeking_driver',
        lat: seed.lat,
        lng: seed.lng,
        drop_lat: seed.drop_lat,
        drop_lng: seed.drop_lng,
        total_s: seed.total_s != null ? seed.total_s : o.priceNum,
        always_on: true,
        paid: true,
        vendorName: seed.vendorName || 'Night Kitchen',
        clientName: seed.clientName || 'You',
      });
      if (real && real.id) {
        o.taskId = real.id;
        o.task = real;
        o.id = 'task:' + real.id;
        return real;
      }
    } catch (_) {}
    return t;
  }

  function startUnderway(o) {
    var t = null;
    try {
      t = ensureTaskPersisted(o);
    } catch (_) {}
    if (!t) t = o.task || { id: o.taskId || 'local_' + Date.now(), title: o.nature || 'Local delivery' };
    try {
      if (t.status === 'seeking_driver' || t.status === 'open') {
        var c = global.SNTasks && SNTasks.claim && SNTasks.claim(t.id, { id: 'you', name: 'You' });
        if (c && c.task) t = c.task;
      }
      if (t.status === 'claimed') {
        var c2 =
          global.SNTasks &&
          SNTasks.claim &&
          SNTasks.claim(t.id, { id: t.driverId || 'you', name: t.driverName || 'You' });
        if (c2 && c2.task) t = c2.task;
      }
      t.status = 'in_progress';
      t.startedAt = Date.now();
      try {
        if (global.SNTasks && SNTasks.save) SNTasks.save();
      } catch (_) {}
    } catch (_) {
      try {
        t.status = 'in_progress';
      } catch (_) {}
    }
    o.task = t;
    o.taskId = t.id || o.taskId;
    o.drone = true;
    t.courier = t.courier || 'rai-drone';
    t.driverName = t.driverName || 'Rai · drone';
    // Always flip UI phase even if registry soft-fails
    markPhase(o, 'underway', { meta: 'Rai drone · polygon en route', progress: 35 });
    try {
      focusTaskOnGlobe(t);
    } catch (_) {}
    // Multi-order hub polygon radius for same vendor
    var hub = null;
    try {
      if (global.SNDeliveryRules && SNDeliveryRules.registerHubOrder) {
        hub = SNDeliveryRules.registerHubOrder(
          t.vendorId || t.vendorName || 'hub',
          t.lat,
          t.lng,
          t.id
        );
      }
    } catch (_) {}
    try {
      if (global.SNField && SNField.startDeliveryRoute && t.drop_lat != null) {
        var priv = !!(o.quote && o.quote.private);
        void SNField.startDeliveryRoute({
          id: 'live:run_' + t.id,
          vendorLat: t.lat,
          vendorLng: t.lng,
          dropLat: t.drop_lat,
          dropLng: t.drop_lng,
          label: String(t.title || 'Run').slice(0, 18),
          driver: t.driverName || t.courier || 'Rai drone',
          color: priv ? 'rgba(255,200,80,0.95)' : 'rgba(0,220,160,0.95)',
          etaMin: (o.quote && o.quote.etaMin) || t.etaMin || 18,
          speedKmh: priv ? 28 : 22,
          hubRadiusKm: hub && hub.radiusKm,
        });
      }
    } catch (_) {}
    // No real drivers → commission Rai silver robot in drone mode on polygon
    try {
      o.drone = true;
      t.courier = t.courier || 'rai-drone';
      t.driverName = t.driverName || 'Rai · drone';
      commissionRai(t, { label: 'RAI · DRONE RUN' });
      markPhase(o, 'underway', {
        meta: 'Rai drone · polygon en route',
        progress: o.progress || 35,
      });
    } catch (_) {}
    if (!o._progTimer) {
      o._progTimer = setInterval(function () {
        var cur = find(o.id) || o;
        if (!cur || cur.phase !== 'underway') {
          try {
            clearInterval(o._progTimer);
          } catch (_) {}
          o._progTimer = null;
          return;
        }
        cur.progress = Math.min(92, (cur.progress || 35) + 7);
        paint();
      }, 2200);
    }
    log('Underway · ' + (t.title || o.nature) + ' · Complete when delivered', 'ok');
    return true;
  }

  function arriveOffer(o) {
    if (!o) return false;
    if (o._progTimer) {
      try {
        clearInterval(o._progTimer);
      } catch (_) {}
      o._progTimer = null;
    }
    o.progress = 92;
    o.drone = true;
    // Soft check limits
    try {
      if (global.SNDeliveryRules && SNDeliveryRules.checkLimits) {
        o.limitsCheck = SNDeliveryRules.checkLimits(
          { limits: o.quote && o.quote.limits },
          { etaMin: o.progress, km: o.km }
        );
      }
    } catch (_) {}
    markPhase(o, 'confirming', {
      meta: 'Arrived · Client + Vendor + Driver must confirm',
      progress: 92,
    });
    // Rai auto-confirms as driver; vendor soft-auto after brief delay (demo)
    // Client must tap — owner rule: all three agree, no support judge
    try {
      setConfirm(o.id, 'driver');
    } catch (_) {}
    setTimeout(function () {
      try {
        var cur = find(o.id);
        if (cur && cur.phase === 'confirming' && cur.confirms && !cur.confirms.vendor) {
          setConfirm(o.id, 'vendor');
          log('Vendor OK · (shop confirmed handoff)', 'dim');
        }
      } catch (_) {}
    }, 1600);
    log('Arrived · need Client + Vendor + Driver OK · then settle', 'ok');
    return true;
  }

  function completeOffer(o) {
    var t = null;
    o.confirms = o.confirms || { client: false, vendor: false, driver: false };
    if (!(o.confirms.client && o.confirms.vendor && o.confirms.driver)) {
      if (o.phase !== 'confirming') arriveOffer(o);
      log('Need Client + Vendor + Driver confirmation · no settle yet', 'dim');
      paint();
      return false;
    }
    try {
      t = ensureTaskPersisted(o);
    } catch (_) {}
    if (!t) t = o.task || { id: o.taskId || 'local_' + Date.now(), title: o.nature || 'Local delivery' };
    try {
      if (t.status === 'seeking_driver' || t.status === 'open') {
        var c = global.SNTasks && SNTasks.claim && SNTasks.claim(t.id, { id: 'you', name: 'You' });
        if (c && c.task) t = c.task;
      }
      if (t.status === 'claimed') {
        var c2 =
          global.SNTasks &&
          SNTasks.claim &&
          SNTasks.claim(t.id, { id: t.driverId || 'you', name: t.driverName || 'You' });
        if (c2 && c2.task) t = c2.task;
      }
      var r = global.SNTasks && SNTasks.complete && SNTasks.complete(t.id);
      if (r && r.task) t = r.task;
      else {
        t.status = 'done';
        t.doneAt = Date.now();
      }
    } catch (_) {
      t.status = 'done';
      t.doneAt = Date.now();
    }
    // Pay settle soft: credit driver cut if currency present
    try {
      var pay = o.priceNum != null ? Number(o.priceNum) : t.total_s != null ? Number(t.total_s) : 0;
      if (pay > 0 && global.SNCurrency) {
        var vault = pay * 0.03;
        var driver = pay * 0.15;
        if (SNCurrency.creditMined) SNCurrency.creditMined(driver);
        else if (SNCurrency.credit) SNCurrency.credit(driver, 'delivery complete');
        log(
          'Settled · ' +
            fmtPrice(pay) +
            ' · driver ' +
            fmtPrice(driver) +
            ' · vault ' +
            fmtPrice(vault),
          'ok'
        );
      }
    } catch (_) {}
    o.task = t;
    o.taskId = t.id;
    if (o._progTimer) {
      try {
        clearInterval(o._progTimer);
      } catch (_) {}
      o._progTimer = null;
    }
    // Anti-fraud settlement seal — all three parties must have timestamps
    try {
      o.settlementSeal = {
        clientAt: o.confirms.at && o.confirms.at.client,
        vendorAt: o.confirms.at && o.confirms.at.vendor,
        driverAt: o.confirms.at && o.confirms.at.driver,
        pay: o.priceNum,
        vault3: o.priceNum != null ? Math.round(o.priceNum * 0.03 * 100) / 100 : 0,
        taskId: t.id,
        sealedAt: Date.now(),
      };
      t.settlementSeal = o.settlementSeal;
    } catch (_) {}
    markPhase(o, 'done', { meta: 'sealed · 3× OK · ' + (o.price || 'paid') });
    log(
      'Settled · seal 3× · ' +
        (t.title || o.nature) +
        (o.price ? ' · ' + o.price : '') +
        ' · no support judge',
      'ok'
    );
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview('Task complete');
    } catch (_) {}
    setTimeout(function () {
      try {
        dismiss(o.id);
      } catch (_) {}
    }, 2200);
    return true;
  }

  /**
   * Commission Rai (SNHelper silver robot) as drone courier on polygon route.
   * Used when no real delivery drivers are online.
   */
  function commissionRai(task, opts) {
    opts = opts || {};
    if (!task) return null;
    var drop = {
      lat: task.drop_lat != null ? Number(task.drop_lat) : null,
      lng: task.drop_lng != null ? Number(task.drop_lng) : null,
    };
    var vendor = {
      lat: task.lat != null ? Number(task.lat) : null,
      lng: task.lng != null ? Number(task.lng) : null,
    };
    try {
      if (global.SNHelper) {
        if (SNHelper.init && !SNHelper.ready) {
          try {
            SNHelper.init({ autoWake: true });
          } catch (_) {}
        }
        if (SNHelper.droneDeliver) {
          return SNHelper.droneDeliver(task, {
            label: opts.label || 'RAI · DRONE',
            onProgress: function (ev) {
              try {
                if (opts.onProgress) opts.onProgress(ev);
                var cur = stack.find(function (x) {
                  return x.taskId === task.id || (x.task && x.task.id === task.id);
                });
                if (cur && ev && ev.phase === 'pickup') {
                  cur.progress = Math.max(cur.progress || 0, 50);
                  paint();
                }
              } catch (_) {}
            },
            onComplete: function (ev) {
              try {
                if (opts.onComplete) opts.onComplete(ev);
                var cur = stack.find(function (x) {
                  return x.taskId === task.id || (x.task && x.task.id === task.id);
                });
                if (cur && cur.phase === 'underway') arriveOffer(cur);
              } catch (_) {}
            },
          });
        }
        // Fallback path: escort + fly vendor then drop
        if (SNHelper.wake) SNHelper.wake({ label: 'RAI · DRONE MODE', force: true, showcaseMs: 40000 });
        if (vendor.lat != null && SNHelper.flyTo) {
          SNHelper.flyTo(vendor, {
            kind: 'drone',
            label: 'RAI · PICKUP',
            detail: 'drone pickup · ' + String(task.title || 'order').slice(0, 24),
            status: 'drone pickup',
            dur: 2800,
            log: true,
            onArrive: function () {
              try {
                if (drop.lat != null) {
                  SNHelper.flyTo(drop, {
                    kind: 'drone',
                    label: 'RAI · DELIVER',
                    detail: 'polygon drone run',
                    status: 'drone en route',
                    dur: 4200,
                    log: true,
                  });
                }
              } catch (_) {}
            },
          });
        } else if (SNHelper.escortOrder) {
          SNHelper.escortOrder(task, { dur: 5000 });
        }
        log('Rai silver · drone mode · routing order', 'ok');
        return { ok: true, mode: 'drone', courier: 'rai' };
      }
    } catch (eR) {
      try {
        log('Rai soft · ' + (eR && eR.message ? eR.message : eR), 'dim');
      } catch (_) {}
    }
    return null;
  }

  function orderFromVendor(o, itemId) {
    if (!o || o.kind !== 'vendor') return false;
    var menu = o.menu || [];
    var item = null;
    for (var i = 0; i < menu.length; i++) {
      if (String(menu[i].id) === String(itemId)) {
        item = menu[i];
        break;
      }
    }
    if (!item) item = menu[0] || { name: 'House special', price: o.priceNum || 9 };
    var pos = posNow();
    var vLat = o.lat != null ? Number(o.lat) : o.profile && o.profile.lat != null ? Number(o.profile.lat) : Number(pos.lat) + 0.003;
    var vLng = o.lng != null ? Number(o.lng) : o.profile && o.profile.lng != null ? Number(o.profile.lng) : Number(pos.lng) + 0.002;
    var food = item.price != null ? Number(item.price) : o.priceNum != null ? Number(o.priceNum) : 9;
    var km = o.profile && o.profile._km != null ? Number(o.profile._km) : 1.2;
    var productNature = item.nature || (o.profile && o.profile.nature) || item.name || o.nature;
    var q = rulesQuote({
      km: km,
      nature: productNature,
      product: item.name,
      title: item.name,
      traffic: 1,
    });
    var deliveryFee = q.total != null ? Number(q.total) : Math.ceil(km / 3) * 3;
    var total = Math.round((food + deliveryFee) * 100) / 100;
    var title = String(item.name || 'Order') + ' · ' + String(o.nature || 'shop').slice(0, 18);
    var fakeTask = {
      id: 'ord_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
      kind: 'delivery',
      status: 'seeking_driver',
      title: title,
      total_s: total,
      food_s: food,
      delivery_s: deliveryFee,
      vendorName: o.nature || o.title || 'Vendor',
      clientName: 'You',
      vendorId: o.profileId,
      lat: vLat,
      lng: vLng,
      drop_lat: pos.lat,
      drop_lng: pos.lng,
      paid: true,
      etaMin: q.etaMin || 18,
      _km: km,
      courier: 'rai-drone',
      menuItem: item.name,
      heavy: q.heavy,
    };
    try {
      if (global.SNTasks && SNTasks.create) {
        var real = SNTasks.create({
          kind: 'delivery',
          title: fakeTask.title,
          status: 'seeking_driver',
          lat: fakeTask.lat,
          lng: fakeTask.lng,
          drop_lat: fakeTask.drop_lat,
          drop_lng: fakeTask.drop_lng,
          total_s: fakeTask.total_s,
          always_on: true,
          paid: true,
          vendorName: fakeTask.vendorName,
          clientName: 'You',
        });
        if (real && real.id) {
          fakeTask = Object.assign({}, fakeTask, real, {
            lat: fakeTask.lat,
            lng: fakeTask.lng,
            drop_lat: fakeTask.drop_lat,
            drop_lng: fakeTask.drop_lng,
            courier: 'rai-drone',
            menuItem: item.name,
          });
        }
      }
    } catch (_) {}
    // Soft pay from wallet
    try {
      if (total > 0 && global.SNCurrency) {
        if (SNCurrency.debit) SNCurrency.debit(total, 'order · ' + item.name);
        else if (SNCurrency.spend) SNCurrency.spend(total);
      }
    } catch (_) {}
    dismiss(o.id);
    try {
      if (global.SNDeliveryRules && SNDeliveryRules.registerHubOrder) {
        SNDeliveryRules.registerHubOrder(fakeTask.vendorId || fakeTask.vendorName, vLat, vLng, fakeTask.id);
      }
    } catch (_) {}
    var taskOffer = pushTask(fakeTask, {
      nature: (q.nature && q.nature.label) || 'Local delivery',
      natureId: q.nature && q.nature.id,
      product: item.name,
      km: fakeTask._km,
      mins: fakeTask.etaMin,
      price: total,
      private: q.private,
      vip: q.vip,
      heavy: q.heavy,
    });
    // Auto-accept + start with Rai drone (no real drivers)
    if (taskOffer) {
      try {
        markPhase(taskOffer, 'claimed', { meta: 'paid · Rai drone assigned' });
        taskOffer.drone = true;
        startUnderway(taskOffer);
      } catch (_) {}
    }
    log(
      'Ordered · ' +
        item.name +
        ' · ' +
        fmtPrice(total) +
        ' · Rai drone routing',
      'ok'
    );
    return true;
  }

  function runAct(id, act, extra) {
    extra = extra || {};
    var o = find(id);
    if (!o) return;
    if (act === 'order') {
      orderFromVendor(o, extra.itemId);
      return;
    }
    if (act === 'reject' || act === 'dismiss') {
      if (o._progTimer) {
        try {
          clearInterval(o._progTimer);
        } catch (_) {}
        o._progTimer = null;
      }
      dismiss(id);
      log((act === 'dismiss' || o.phase === 'done' ? 'Closed · ' : 'Rejected · ') + (o.nature || o.title || id), 'dim');
      return;
    }
    if (act === 'map' || act === 'secondary') {
      if (o.kind === 'task' && (o.task || o.taskId)) {
        var t = liveTask(o);
        if (t) previewRoute(t, o);
        return;
      }
      return;
    }
    if (o.kind === 'task' && (o.taskId || o.task)) {
      if (act === 'start' || (act === 'accept' && o.phase === 'claimed')) {
        startUnderway(o);
        return;
      }
      if (act === 'arrive' || (act === 'accept' && o.phase === 'underway') || (act === 'complete' && o.phase === 'underway')) {
        arriveOffer(o);
        return;
      }
      if (act === 'complete' || (act === 'accept' && o.phase === 'confirming')) {
        completeOffer(o);
        return;
      }
      if (act === 'accept' || act === 'primary') {
        var task = ensureTaskPersisted(o);
        try {
          var r =
            global.SNTasks &&
            SNTasks.claim &&
            SNTasks.claim(task && task.id, { id: 'you', name: 'You' });
          if (r && r.ok && r.task) {
            o.task = r.task;
            o.taskId = r.task.id;
            markPhase(o, 'claimed');
            log(
              'Accepted · ' +
                (r.task.title || o.nature || o.title) +
                (o.price ? ' · ' + o.price : '') +
                ' · Start run when ready',
              'ok'
            );
            focusTaskOnGlobe(r.task);
          } else {
            if (task) {
              task.status = 'claimed';
              task.claimedAt = Date.now();
              o.task = task;
            }
            markPhase(o, 'claimed');
            log('Accepted · ' + (o.nature || o.title) + ' · Start run when ready', 'ok');
            if (o.task) focusTaskOnGlobe(o.task);
          }
        } catch (_) {
          markPhase(o, 'claimed');
          if (o.task) focusTaskOnGlobe(o.task);
        }
        return;
      }
    }
    if (o.kind === 'vendor') {
      if (act === 'map' || act === 'secondary') {
        try {
          var la = o.lat != null ? o.lat : o.profile && o.profile.lat;
          var ln = o.lng != null ? o.lng : o.profile && o.profile.lng;
          if (la != null && global.SNGlobe && SNGlobe.goToPlace) {
            SNGlobe.goToPlace(Number(la), Number(ln), { tier: 'city', quiet: true });
          }
          if (la != null && global.SNMap && SNMap.open) void SNMap.open(Number(la), Number(ln));
        } catch (_) {}
        return;
      }
      if (act === 'accept' || act === 'primary') {
        // Order first menu item
        orderFromVendor(o, o.menu && o.menu[0] && o.menu[0].id);
        return;
      }
      try {
        if (global.SNTile && SNTile.open && o.profileId)
          SNTile.open(o.profileId, { expand: true, tab: 'menu', full: true });
      } catch (_) {}
    }
  }

  function onOrderResult(orderResult, meta) {
    meta = meta || {};
    if (!orderResult || !orderResult.ok || !orderResult.task) return;
    pushTask(orderResult.task, { eta: meta.eatLine || meta.eta || '' });
    if (meta.vendor) pushVendor(meta.vendor, { item: meta.item });
    if (meta.driver) pushDriverOffer(meta.driver, orderResult.task);
  }

  function afterFulfill(r) {
    if (!r) return;
    if (r.best) pushVendor(r.best, { item: r.judged && r.judged.itemName });
    if (r.top3 && r.top3.length) r.top3.forEach(function (v) { pushVendor(v, {}); });
    else if (r.vendors && r.vendors.length) r.vendors.slice(0, 3).forEach(function (v) { pushVendor(v, {}); });
    var ord = r.order || r.orderResult;
    if (ord && ord.ok && ord.task)
      onOrderResult(ord, {
        eatLine: r.eatLine || (r.eta && r.eta.eatLine),
        vendor: r.best,
        driver: r.driver,
        item: r.judged && r.judged.itemName,
      });
    else if (r.task) onOrderResult({ ok: true, task: r.task }, { eatLine: r.eatLine, vendor: r.best });
  }

  function installHooks() {
    try {
      if (global.SNProfiles && SNProfiles.placeOrder && !SNProfiles._snOfferHooked) {
        var orig = SNProfiles.placeOrder.bind(SNProfiles);
        SNProfiles.placeOrder = function (opts) {
          var r = orig(opts);
          try {
            if (r && r.ok && r.task) onOrderResult(r, opts || {});
          } catch (_) {}
          return r;
        };
        SNProfiles._snOfferHooked = true;
      }
    } catch (_) {}
    try {
      if (global.SNMarket && SNMarket.fulfillFoodIntent && !SNMarket._snOfferHooked) {
        var ful = SNMarket.fulfillFoodIntent.bind(SNMarket);
        SNMarket.fulfillFoodIntent = function (q, opts) {
          var p = ful(q, opts);
          if (p && typeof p.then === 'function')
            return p.then(function (r) {
              try {
                afterFulfill(r);
              } catch (_) {}
              return r;
            });
          try {
            afterFulfill(p);
          } catch (_) {}
          return p;
        };
        SNMarket._snOfferHooked = true;
      }
    } catch (_) {}
  }

  function syncFromTasks() {
    try {
      if (!global.SNTasks || !SNTasks.list) return;
      (SNTasks.list({ all: true }) || [])
        .filter(function (t) {
          return (
            t &&
            t.kind === 'delivery' &&
            (t.status === 'open' ||
              t.status === 'seeking_driver' ||
              t.status === 'claimed' ||
              t.status === 'in_progress')
          );
        })
        .slice(0, 4)
        .forEach(function (t) {
          var existing = find('task:' + t.id);
          // Never clobber live confirm/underway UI phase from a soft registry sync
          if (existing && (existing.phase === 'underway' || existing.phase === 'confirming' || existing.phase === 'done' || existing.phase === 'claimed')) {
            return;
          }
          pushTask(t, { quiet: true });
        });
    } catch (_) {}
  }

  function posNow() {
    return global._snLastPos || global._snPhysPos || { lat: 36.4341, lng: 28.2176 };
  }

  function testThrow(opts) {
    opts = opts || {};
    try {
      if (!opts.skipModeFlip && global.SNField && SNField.setLaunchMode) {
        var mode = SNField.launchMode && SNField.launchMode();
        if (mode === 'off' || mode === 'standby') {
          SNField.setLaunchMode('on', { quiet: true, skipMoney: true });
        }
      }
    } catch (_) {}
    var pos = posNow();
    // ONE at a time — never flood (count>1 queues via push)
    var n = Math.min(1, Math.max(1, Number(opts.count) || 1));
    if (opts.count != null && Number(opts.count) > 1) {
      // queue additional catalog throws one-by-one
      var cat = [];
      try {
        if (global.SNDeliveryRules && SNDeliveryRules.sampleCatalog) cat = SNDeliveryRules.sampleCatalog();
      } catch (_) {}
      var extra = Math.min(MAX_QUEUE, Number(opts.count) - 1);
      for (var qi = 0; qi < extra && qi < cat.length; qi++) {
        (function (sample, delay) {
          setTimeout(function () {
            try {
              testThrow({
                skipModeFlip: true,
                persist: opts.persist,
                km: sample.km,
                nature: sample.title,
                natureId: sample.nature,
                product: sample.product,
                title: sample.title,
                vendorName: sample.vendorName,
                night: isNight(),
              });
            } catch (_) {}
          }, delay);
        })(cat[qi], 900 * (qi + 1));
      }
    }
    var now = Date.now();
    var km = opts.km != null ? Number(opts.km) : 2.4;
    var dLat = 0.004 + km * 0.0015;
    var dLng = 0.003 + km * 0.0012;
    var q0 = rulesQuote({
      km: km,
      nature: opts.natureId || opts.nature || opts.product || opts.title || 'Local delivery',
      title: opts.title,
      product: opts.product,
      night: opts.night != null ? opts.night : isNight(),
      heavy: opts.heavy,
      vip: opts.vip,
      private: opts.private,
      traffic: opts.traffic,
    });
    var total = opts.total != null ? Number(opts.total) : q0.total;
    var vLat = opts.vendorLat != null ? Number(opts.vendorLat) : Number(pos.lat) + dLat;
    var vLng = opts.vendorLng != null ? Number(opts.vendorLng) : Number(pos.lng) + dLng;
    var midLat = (vLat + Number(pos.lat)) / 2 + 0.0008;
    var midLng = (vLng + Number(pos.lng)) / 2 - 0.0006;
    var fakeTask = {
      id: 'test_task_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      kind: 'delivery',
      status: opts.status || 'seeking_driver',
      title: opts.title || (q0.nature && q0.nature.label) || 'Local delivery · ' + km + ' km',
      total_s: total,
      vendorName: opts.vendorName || 'Night Kitchen',
      clientName: opts.clientName || 'You',
      vendorId: opts.vendorId || 'test_v_local',
      lat: vLat,
      lng: vLng,
      drop_lat: pos.lat,
      drop_lng: pos.lng,
      // Optional mid stop for multi-leg rearrange demos (not on private)
      stops:
        opts.private || (q0 && q0.private)
          ? []
          : opts.noMid
            ? []
            : [{ lat: midLat, lng: midLng, label: opts.midLabel || 'Hub stop', id: 'mid1' }],
      routeLocked: !!(opts.private || opts.routeLocked || (q0 && q0.private)),
      straightShot: !!(opts.private || opts.straightShot),
      created: now,
      paid: true,
      night: q0.night,
      etaMin: q0.etaMin || opts.mins || 22,
      _km: km,
      heavy: q0.heavy,
      menuItem: opts.product,
    };
    var doPersist = opts.persist !== false;
    try {
      if (global.SNTasks && SNTasks.create && doPersist) {
        var real = SNTasks.create({
          kind: 'delivery',
          title: fakeTask.title,
          status: fakeTask.status,
          lat: fakeTask.lat,
          lng: fakeTask.lng,
          drop_lat: fakeTask.drop_lat,
          drop_lng: fakeTask.drop_lng,
          total_s: fakeTask.total_s,
          always_on: true,
          paid: true,
          vendorName: fakeTask.vendorName,
          clientName: fakeTask.clientName,
        });
        if (real && real.id) {
          fakeTask = Object.assign({}, fakeTask, real, {
            night: fakeTask.night,
            etaMin: fakeTask.etaMin,
            _km: km,
            lat: fakeTask.lat,
            lng: fakeTask.lng,
            drop_lat: fakeTask.drop_lat,
            drop_lng: fakeTask.drop_lng,
          });
        }
      }
    } catch (_) {}
    pushTask(fakeTask, {
      eta: opts.eta || '~' + fakeTask.etaMin + ' min',
      nature: opts.nature || (q0.nature && q0.nature.label) || 'Local delivery',
      natureId: opts.natureId || (q0.nature && q0.nature.id),
      product: opts.product,
      km: km,
      night: fakeTask.night,
      mins: fakeTask.etaMin,
      price: total,
      heavy: q0.heavy,
      vip: q0.vip,
      private: q0.private,
      traffic: opts.traffic,
    });
    log(
      'Task offer · ' +
        (opts.nature || 'Local delivery') +
        ' · ' +
        km +
        ' km · ' +
        fmtPrice(total) +
        ' · Accept / Reject',
      'ok'
    );
    return { ok: true, stack: stack.slice(), task: fakeTask };
  }

  async function demoPolygon(opts) {
    opts = opts || {};
    var pos = posNow();
    var vendorLat = Number(pos.lat) + 0.0042,
      vendorLng = Number(pos.lng) + 0.0028;
    var dropLat = Number(pos.lat),
      dropLng = Number(pos.lng);
    var stopLat = Number(pos.lat) + 0.0015,
      stopLng = Number(pos.lng) + 0.0012;
    var speed = opts.speedKmh != null ? Number(opts.speedKmh) : 22;
    var route = null;
    try {
      if (global.SNMap && SNMap.open) {
        await SNMap.open(dropLat, dropLng);
        if (SNMap.ensure) await SNMap.ensure();
        if (SNMap.markYou) SNMap.markYou(dropLat, dropLng, 'YOU · drop');
      }
    } catch (_) {}
    try {
      if (global.SNField && SNField.startDeliveryRoute) {
        route = await SNField.startDeliveryRoute({
          id: 'live:poly_' + Date.now().toString(36),
          vendorLat: vendorLat,
          vendorLng: vendorLng,
          dropLat: dropLat,
          dropLng: dropLng,
          stops: opts.multi !== false ? [{ lat: stopLat, lng: stopLng, label: 'stop before you' }] : [],
          waypoints:
            opts.multi !== false
              ? [
                  { lat: vendorLat, lng: vendorLng },
                  { lat: stopLat, lng: stopLng },
                  { lat: dropLat, lng: dropLng },
                ]
              : [
                  { lat: vendorLat, lng: vendorLng },
                  { lat: dropLat, lng: dropLng },
                ],
          label: opts.label || 'Route · vendor → you',
          driver: opts.driver || 'Test Driver Alpha',
          color: 'rgba(0,180,255,0.95)',
          etaMin: opts.etaMin || 18,
          speedKmh: speed,
        });
      }
    } catch (e) {
      log('Polygon · ' + (e && e.message ? e.message : e), 'err');
    }
    try {
      if (global.SNField && SNField.refreshRoutes) void SNField.refreshRoutes(true);
      if (global.SNField && SNField.setRadarExpanded) SNField.setRadarExpanded(true);
    } catch (_) {}
    return { ok: !!route || true, route: route, pos: pos, speed: speed };
  }

  async function demoDelivery(opts) {
    opts = opts || {};
    var thrown = testThrow({
      persist: opts.persist !== false,
      eta: opts.eta || '~18 min',
      nature: 'Local delivery',
      km: opts.km != null ? opts.km : 6,
      total: opts.total != null ? opts.total : 9,
      night: true,
      mins: 18,
      status: 'seeking_driver',
    });
    var route = await demoPolygon({ multi: opts.multi !== false, speedKmh: opts.speedKmh || 22 });
    log('Demo · glowing task tile + map route · Accept / Reject', 'ok');
    return { ok: true, thrown: thrown, route: route };
  }

  function clearAll() {
    stack = [];
    queue = [];
    paint();
  }

  function clearRoutes() {
    try {
      if (global.SNField && SNField.clearRoutes) SNField.clearRoutes();
    } catch (_) {}
  }

  function listRoutes() {
    try {
      if (global.SNField && SNField.routes) return SNField.routes;
    } catch (_) {}
    return [];
  }

  function radar() {
    try {
      if (global.SNField && SNField.setRadarExpanded) SNField.setRadarExpanded(true);
    } catch (_) {}
  }

  function runTestCommand(cmd) {
    cmd = String(cmd || '').toLowerCase();
    if (cmd === 'tiles' || cmd === 'offers' || cmd === 'throw') return testThrow({ persist: true });
    if (cmd === 'polygon' || cmd === 'poly') return demoPolygon({ multi: true });
    if (cmd === 'demo' || cmd === 'delivery') return demoDelivery({ persist: true });
    return null;
  }

  async function handleOfferLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;
    if (/^offers?\s+test(\s+\d+)?$/.test(low) || low === 'offers test' || low === 'throw offers') {
      var m = low.match(/(\d+)/);
      var n = m ? Number(m[1]) : 2;
      testThrow({ persist: true, count: Math.min(3, n) });
      if (n === 1) testThrow({ persist: true, km: 6, total: 9, skipModeFlip: true });
      else {
        testThrow({ persist: true, km: 6, total: 9, skipModeFlip: true });
        testThrow({ persist: true, km: 3, total: 7, nature: 'Grocery run', skipModeFlip: true });
      }
      return true;
    }
    if (low === 'task complete' || low === 'complete task') {
      var u = stack.find(function (x) { return x.phase === 'underway'; }) ||
        stack.find(function (x) { return x.phase === 'claimed'; }) ||
        stack[0];
      if (u) {
        if (u.phase === 'claimed') startUnderway(u);
        else if (u.phase === 'underway') completeOffer(u);
        else runAct(u.id, 'accept');
      }
      return true;
    }
    if (low === 'demo delivery' || low === 'demo polygon') {
      await demoDelivery({ persist: true });
      return true;
    }
    return false;
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snOfferBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        var low = String(raw || '').trim().toLowerCase();
        try {
          if (
            /^(offers?\s+test|throw offers|task complete|complete task|demo delivery|demo polygon)\b/i.test(
              low
            )
          ) {
            try {
              if (SNCli.beginTurn) SNCli.beginTurn();
            } catch (_) {}
            try {
              if (SNCli.log) SNCli.log(String(raw).trim(), 'cmd');
            } catch (_) {}
            var h = await handleOfferLine(raw);
            try {
              if (SNCli.endTurn) SNCli.endTurn();
            } catch (_) {}
            if (h) return;
          }
        } catch (_) {}
        return orig(raw);
      };
      SNCli._snOfferBound = SNCli.run;
    } catch (_) {}
  }

  function init() {
    ensureRoot();
    installHooks();
    installCli();
    [600, 1800, 4000].forEach(function (ms) {
      setTimeout(function () {
        try {
          installHooks();
          installCli();
          if (ms >= 1800) syncFromTasks();
        } catch (_) {}
      }, ms);
    });
  }

  global.SNOfferStack = {
    init: init,
    push: push,
    pushTask: pushTask,
    pushVendor: pushVendor,
    pushVendorMenu: pushVendorMenu,
    commissionRai: commissionRai,
    pushDriverOffer: pushDriverOffer,
    onOrderResult: onOrderResult,
    afterFulfill: afterFulfill,
    syncFromTasks: syncFromTasks,
    dismiss: dismiss,
    focusTask: focusTaskOnGlobe,
    previewRoute: previewRoute,
    drawAllPolygons: drawAllPolygons,
    moveStop: moveStop,
    setTileSize: setTileSize,
    partyNames: partyNames,
    testThrow: testThrow,
    startUnderway: function (id) {
      var o = find(id) || stack[0];
      return o ? startUnderway(o) : false;
    },
    completeOffer: function (id) {
      var o = find(id) || stack[0];
      return o ? completeOffer(o) : false;
    },
    arriveOffer: function (id) {
      var o = find(id) || stack[0];
      return o ? arriveOffer(o) : false;
    },
    setConfirm: setConfirm,
    markPhase: markPhase,
    demoDelivery: demoDelivery,
    demoPolygon: demoPolygon,
    clear: clearAll,
    clearRoutes: clearRoutes,
    listRoutes: listRoutes,
    radar: radar,
    runTest: runTestCommand,
    handleLine: handleOfferLine,
    list: function () {
      return stack.slice();
    },
    queue: function () {
      return queue.slice();
    },
    queueLen: function () {
      return queue.length;
    },
    paint: paint,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try {
        init();
      } catch (_) {}
    });
  } else {
    try {
      init();
    } catch (_) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
