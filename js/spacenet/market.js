/* SNMarket — first vendor + lazy food order (locate · verify · prefs · pay · ETA)
 * Lazy: order me a pizza you judge… · confirm location if GPS soft
 */
(function (global) {
  'use strict';

  var WIZ_KEY = 'sn:market-wiz-v1';
  var PREFS_KEY = 'sn:order-prefs-v1';
  var PENDING_KEY = 'sn:order-pending-v1';
  var W = { step: 'idle', shopName: '', lastItem: null };

  var OWNER_PREFS = {
    temper: 'feisty greek guy',
    company: {
      people: 3,
      girlfriends: 2,
      cats: 2,
      dogs: 2,
      note: 'company of 3 + 2 cats + 2 dogs',
    },
    likes: ['super greek special', 'retsina', 'big soda 1.5L', 'greek pizza'],
    pizza: {
      name: 'Super Greek special 13 pieces',
      pieces: 13,
      style: 'super greek special',
      with: ['retsina', 'soda 1.5L'],
    },
    drink: { retsina: true, sodaL: 1.5 },
    verifiedLoc: null,
  };

  var EMPTY_PREFS = {
    temper: '',
    company: { people: 1, girlfriends: 0, cats: 0, dogs: 0, note: '' },
    likes: [],
    pizza: { name: '', pieces: 0, style: '', with: [] },
    drink: { retsina: false, sodaL: 0 },
    verifiedLoc: null,
  };

  function isOwnerPrefs() {
    try {
      return !!(global.SNAuth && SNAuth.isOwner && SNAuth.isOwner());
    } catch (_) {
      return false;
    }
  }

  function defaultPrefs() {
    return JSON.parse(JSON.stringify(isOwnerPrefs() ? OWNER_PREFS : EMPTY_PREFS));
  }

  var DEFAULT_PREFS = EMPTY_PREFS;

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(WIZ_KEY) || '{}');
      if (raw && raw.step) W = Object.assign(W, raw);
    } catch (_) {}
  }

  function save() {
    try {
      localStorage.setItem(WIZ_KEY, JSON.stringify(W));
    } catch (_) {}
  }

  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (p && typeof p === 'object') return Object.assign({}, defaultPrefs(), p, {
        company: Object.assign({}, defaultPrefs().company, p.company || {}),
        pizza: Object.assign({}, defaultPrefs().pizza, p.pizza || {}),
        drink: Object.assign({}, defaultPrefs().drink, p.drink || {}),
        likes: p.likes || defaultPrefs().likes,
      });
    } catch (_) {}
    return defaultPrefs();
  }

  function savePrefs(p) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch (_) {}
  }

  function loadPending() {
    try {
      var p = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (!p) return null;
      // Stale pause must not trap forever (10 min)
      if (p.t && Date.now() - p.t > 10 * 60 * 1000) {
        savePending(null);
        return null;
      }
      return p;
    } catch (_) {
      return null;
    }
  }

  function savePending(p) {
    try {
      if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
      else localStorage.removeItem(PENDING_KEY);
    } catch (_) {}
  }

  function clearPending(reason) {
    savePending(null);
    try {
      if (global.SNCli && SNCli.log)
        SNCli.log(reason || 'Order pause cleared — you can talk about anything else.', 'dim');
    } catch (_) {}
    return { ok: true };
  }

  /** Exact short yes/no only — "ok go dark map" must NOT resume pizza */
  function isLocConfirmLine(line) {
    var low = String(line || '')
      .toLowerCase()
      .trim();
    return /^(yes|y|yeah|yep|ok|okay|correct|here|confirm|go|proceed|sure|ναι|ναί|ne|neh|no|nope|wrong|ν|όχι|οχι|oxi|oxi\.?)$/i.test(
      low
    );
  }

  function locationIsSuspect(pos) {
    if (!pos || pos.lat == null || pos.lng == null) return { suspect: true, why: 'no position' };
    if (pos.fallback) return { suspect: true, why: pos.reason || 'GPS soft / not live' };
    if (pos.accuracy != null && Number(pos.accuracy) > 400) {
      return { suspect: true, why: 'GPS accuracy ±' + Math.round(pos.accuracy) + 'm (weak)' };
    }
    // Old training pins — never auto-order there without YES
    if (
      Math.abs(Number(pos.lat) - 36.4341) < 0.0008 &&
      Math.abs(Number(pos.lng) - 28.2176) < 0.0008
    ) {
      return { suspect: true, why: 'looks like default Rhodes pin' };
    }
    // Globe left on another continent while ordering food
    try {
      var last = global._snLastPos;
      if (
        last &&
        last.lat != null &&
        !pos.fallback &&
        haversineKm(pos, last) > 80 &&
        last.reason !== 'order'
      ) {
        // live GPS wins — not suspect
      }
    } catch (_) {}
    return { suspect: false, why: '' };
  }

  function isShopOpenNow(v) {
    var hours = String((v && (v.hours || v.opening_hours)) || '').trim();
    if (!hours || /24\s*[\/7]|24h|always|open/i.test(hours)) return true;
    if (/^closed$/i.test(hours) || /permanently closed/i.test(hours)) return false;
    // marketplace 24/7 — treat unknown hours as open for delivery pipeline
    return true;
  }

  function menuPriceOf(v, food, judged) {
    try {
      var it = pickMenuItem(v, food, judged);
      if (it && it.price > 0) return Number(it.price);
    } catch (_) {}
    if (v && v.menu && v.menu[0] && v.menu[0].price > 0) return Number(v.menu[0].price);
    return defaultFoodPrice(food);
  }

  /**
   * Rank: near you · open · better rating · better (lower) price · food match.
   * Hard distance is applied by collector — score never rewards other continents.
   */
  function scoreVendor(v, pos, food, judged) {
    var km = haversineKm(pos, v);
    var score = 0;
    var name = String(v.shopName || v.name || '').toLowerCase();
    var kind = String(v.shopKind || v.category || '').toLowerCase();
    var f = String(food || '').toLowerCase();
    // Distance dominates (0–50)
    score += Math.max(0, 50 - km * 12);
    if (km > 8) score -= 80;
    if (km > 15) score -= 200;
    // Open now
    if (isShopOpenNow(v)) score += 18;
    else score -= 40;
    // Rating 0–5 → up to 25
    var rating = v.rating != null ? Number(v.rating) : v.stars != null ? Number(v.stars) : null;
    if (rating != null && isFinite(rating)) score += Math.min(25, rating * 5);
    else score += 8; // unknown — mild
    // Price — lower better (up to 20)
    var price = menuPriceOf(v, food, judged);
    var base = defaultFoodPrice(food);
    if (price > 0) {
      var rel = price / Math.max(0.5, base);
      score += Math.max(0, 20 - rel * 12);
    }
    // Food match
    if (name.indexOf(f) >= 0) score += 16;
    if (
      kind.indexOf(f) >= 0 ||
      kind.indexOf('restaurant') >= 0 ||
      kind.indexOf('pizza') >= 0 ||
      kind.indexOf('cafe') >= 0 ||
      kind.indexOf('food') >= 0
    )
      score += 10;
    if (v.real) score += 8;
    if (v.source === 'supabase' || v.source === 'db' || v.source === 'google-places') score += 6;
    if (v.delivery_enabled !== false) score += 5;
    if (v.menu && v.menu.length) score += 6;
    // Never boost invented kitchen over real shops
    if (v.source === 'astranov-kitchen') score -= 30;
    return { score: score, km: km, price: price, rating: rating, open: isShopOpenNow(v) };
  }

  /** Other open deliveries as intermediate stops before you */
  function driverOtherStops(dropPos, excludeTaskId) {
    var stops = [];
    try {
      var list = (global.SNTasks && SNTasks.list && SNTasks.list({ kind: 'delivery' })) || [];
      list.forEach(function (t) {
        if (!t || t.id === excludeTaskId) return;
        if (t.status !== 'open' && t.status !== 'claimed' && t.status !== 'in_progress') return;
        var la = t.drop_lat != null ? t.drop_lat : t.lat;
        var lo = t.drop_lng != null ? t.drop_lng : t.lng;
        if (la == null || lo == null) return;
        if (haversineKm(dropPos, { lat: la, lng: lo }) > 12) return;
        stops.push({
          lat: la,
          lng: lo,
          label: String(t.title || 'stop').slice(0, 28),
          taskId: t.id,
        });
      });
    } catch (_) {}
    return stops.slice(0, 4);
  }

  function etaWithStops(kmDirect, stopCount) {
    // scooter city: ~22 km/h + 4 min/stop + 8 min kitchen prep
    var prepMin = 8;
    var driveMin = Math.max(4, Math.round((kmDirect / 22) * 60));
    var stopMin = (stopCount || 0) * 4;
    var totalMin = prepMin + driveMin + stopMin;
    var eat = new Date(Date.now() + totalMin * 60000);
    var hh = eat.getHours();
    var mm = eat.getMinutes();
    var clock =
      (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    return {
      totalMin: totalMin,
      prepMin: prepMin,
      driveMin: driveMin,
      stopMin: stopMin,
      stopCount: stopCount || 0,
      eatClock: clock,
      eatLine:
        'You eat ~' +
        clock +
        ' · ' +
        totalMin +
        ' min' +
        (stopCount ? ' · ' + stopCount + ' stop' + (stopCount > 1 ? 's' : '') + ' before you' : ''),
    };
  }

  function beepDoor() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.04;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(function () {
        try {
          o.stop();
          ctx.close();
        } catch (_) {}
      }, 180);
    } catch (_) {}
  }

  function notifyLine(msg, short) {
    try {
      if (global.SNSpartan && SNSpartan.compress) {
        msg = SNSpartan.compress(msg, { max: 64 });
        if (short) short = SNSpartan.compress(short, { max: 28 });
      }
      if (global.SNCli && SNCli.log) SNCli.log(msg, 'ok');
      if (global.SNCli && SNCli.preview) SNCli.preview(short || msg.slice(0, 28));
      if (global.SNField && SNField.setNotice) SNField.setNotice(short || msg.slice(0, 40));
      if (global.SNAi && SNAi.showOnGlobe) SNAi.showOnGlobe(String(short || msg).slice(0, 72));
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Astranov', { body: msg });
      } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    } catch (_) {}
  }

  /**
   * Live ETA monitor: re-check remaining minutes, notify on changes,
   * 5-min heads-up + 3-min door peel alert.
   */
  function scheduleArrivalNotify(eta, vendorName, meta) {
    meta = meta || {};
    try {
      if (global._snArrivalTimer) clearInterval(global._snArrivalTimer);
      if (global._snArrivalNotify) clearTimeout(global._snArrivalNotify);
      if (global._snDoorNotify) clearTimeout(global._snDoorNotify);
    } catch (_) {}
    var totalMin = Math.max(1, (eta && eta.totalMin) || 20);
    var start = Date.now();
    var endAt = start + totalMin * 60 * 1000;
    var lastBucket = totalMin;
    var fired5 = false;
    var fired3 = false;
    var firedEat = false;
    global._snEtaWatch = {
      vendor: vendorName || 'order',
      endAt: endAt,
      totalMin: totalMin,
      taskId: meta.taskId || null,
      eatClock: (eta && eta.eatClock) || '',
    };

    function remainMin() {
      return Math.max(0, Math.ceil((endAt - Date.now()) / 60000));
    }

    function tick() {
      var left = remainMin();
      try {
        if (global.SNField && SNField.setNotice && left > 0) {
          SNField.setNotice('ETA ' + left + 'm · door@3');
        }
      } catch (_) {}
      // announce significant ETA changes (±2 min bucket)
      if (Math.abs(left - lastBucket) >= 2 && left > 0) {
        lastBucket = left;
        notifyLine('ETA ' + left + ' min.', 'ETA ' + left + 'm');
      }
      if (!fired5 && left <= 5 && left > 3) {
        fired5 = true;
        notifyLine('Driver 5 min. ' + (vendorName || ''), 'Driver 5 min');
      }
      if (!fired3 && left <= 3 && left > 0) {
        fired3 = true;
        beepDoor();
        notifyLine('Door. Driver ' + left + ' min.', 'Door ' + left + 'm');
      }
      if (!firedEat && left <= 0) {
        firedEat = true;
        notifyLine('Eat now. ' + (vendorName || ''), 'Eat now');
        try {
          clearInterval(global._snArrivalTimer);
        } catch (_) {}
      }
    }

    // immediate 5/3 schedule as backup timeouts
    var ms5 = Math.max(500, (totalMin - 5) * 60 * 1000);
    var ms3 = Math.max(500, (totalMin - 3) * 60 * 1000);
    global._snArrivalNotify = setTimeout(function () {
      if (!fired5) {
        fired5 = true;
        notifyLine('Driver 5 min.', 'Driver 5 min');
      }
    }, ms5);
    global._snDoorNotify = setTimeout(function () {
      if (!fired3) {
        fired3 = true;
        beepDoor();
        notifyLine('Door. 3 min.', 'Door 3m');
      }
    }, ms3);

    global._snArrivalTimer = setInterval(tick, 20000);
    tick();
  }

  function track(n, p) {
    try {
      if (global.SNUsage && SNUsage.track) SNUsage.track(n, p || {});
    } catch (_) {}
  }

  function say(msg, cls) {
    try {
      if (global.SNAi && SNAi.say) SNAi.say(msg, cls || 'ok');
      else if (global.SNCli && SNCli.log) SNCli.log(msg, cls || 'ok');
    } catch (_) {}
  }

  function isDemoPin(lat, lng, meta) {
    if (lat == null || lng == null) return true;
    if (meta && (meta.real === true || /^(gps|locate|phys)/i.test(String(meta.source || ''))))
      return false;
    // Exact old training pins only — not the town of Rhodes or downtown Athens
    if (Math.abs(Number(lat) - 36.4341) < 0.0008 && Math.abs(Number(lng) - 28.2176) < 0.0008) return true;
    if (Math.abs(Number(lat) - 37.9838) < 0.0008 && Math.abs(Number(lng) - 23.7275) < 0.0008) return true;
    return false;
  }

  function pos() {
    try {
      if (global._snPhysPos && global._snPhysPos.lat != null) return global._snPhysPos;
    } catch (_) {}
    try {
      var last = global._snLastPos;
      if (last && last.lat != null && !isDemoPin(last.lat, last.lng, last)) return last;
    } catch (_) {}
    try {
      var t = global.SNTasks && SNTasks.pos;
      if (t && t.lat != null && !isDemoPin(t.lat, t.lng, t)) return t;
    } catch (_) {}
    return { lat: null, lng: null };
  }

  function me() {
    return global.SNProfiles?.me?.() || null;
  }

  /** List my shop at current focus — real user vendor tile */
  function listShop(name, kind) {
    var p = me();
    if (!p || !global.SNProfiles) return { ok: false, error: 'profiles offline' };
    var shop = String(name || p.shopName || p.name || 'My shop').slice(0, 80);
    var k = String(kind || p.shopKind || 'shop').slice(0, 40);
    var loc = pos();
    if (!p.roles) p.roles = {};
    p.roles.vendor = true;
    p.roles.client = true;
    p.shopName = shop;
    p.shopKind = k;
    p.name = p.name || shop;
    p.lat = loc.lat != null ? Number(loc.lat) : p.lat;
    p.lng = loc.lng != null ? Number(loc.lng) : p.lng;
    if (!Array.isArray(p.menu)) p.menu = [];
    p.bio = '🏪 ' + shop + ' · listed on SpaceNet · 24/7 marketplace';
    p.updated = Date.now();
    global.SNProfiles.upsert(p);
    try {
      global.SNMap?.showProfiles?.();
      // Do NOT auto-open full tile over CLI (SPECS: no bury controls)
    } catch (_) {}
    W.shopName = shop;
    W.step = p.menu.length ? 'ready_order' : 'need_menu';
    save();
    track('vendor_list', { shop: shop, kind: k, lat: p.lat, lng: p.lng });
    return { ok: true, profile: p, shop: shop, menuCount: p.menu.length };
  }

  /** Add one real menu line in S */
  function addMenuItem(name, price) {
    var p = me();
    if (!p) return { ok: false, error: 'no me' };
    if (!p.roles?.vendor) {
      var lr = listShop(p.shopName || p.name, p.shopKind);
      if (!lr.ok) return lr;
      p = me();
    }
    var n = String(name || '').trim().slice(0, 80);
    var pr = Number(price);
    if (!n) return { ok: false, error: 'need item name' };
    if (!isFinite(pr) || pr < 0) pr = 0;
    var item = global.SNProfiles.setMenuItem(p.id, {
      name: n,
      price: pr,
      desc: 'Listed in S · SpaceNet',
    });
    W.lastItem = { name: n, price: pr };
    W.step = 'ready_order';
    save();
    track('menu_add', { name: n, price: pr });
    try {
      global.SNMap?.showProfiles?.();
    } catch (_) {}
    return { ok: true, item: item, menu: (me() && me().menu) || [] };
  }

  /** Client buys from own shop (first loop) — cart + place order */
  function orderFromMyShop(qty) {
    var p = me();
    if (!p || !p.roles?.vendor) return { ok: false, error: 'list shop first' };
    if (!p.menu || !p.menu.length) return { ok: false, error: 'add menu item first' };
    var item = p.menu[0];
    global.SNProfiles.cartClear();
    global.SNProfiles.cartAdd(p.id, item, qty || 1);
    // Drop to me (client)
    var loc = pos();
    p.roles.client = true;
    if (p.lat == null) {
      p.lat = loc.lat;
      p.lng = loc.lng;
      global.SNProfiles.upsert(p);
    }
    var r = global.SNProfiles.placeOrder();
    if (r && r.ok) {
      track('order_place', {
        total: r.total,
        vendorId: r.vendorId,
        taskId: r.task && r.task.id,
        self: true,
      });
      W.step = 'need_driver';
      save();
      try {
        global.SNMap?.open?.(loc.lat, loc.lng);
        global.SNMap?.showTasks?.();
        global.SNMap?.showProfiles?.();
      } catch (_) {}
    }
    return r || { ok: false, error: 'order failed' };
  }

  /** Same user goes driver online — real capability, not NPC */
  function goDriverOnline(vehicle) {
    try {
      if (global.SNChannel && SNChannel.touchDriverHb && global.SNProfiles) {
        var me0 = SNProfiles.me && SNProfiles.me();
        if (me0) SNChannel.touchDriverHb(me0);
      }
    } catch (_) {}

    var p = me();
    if (!p) return { ok: false, error: 'no me' };
    p.roles = p.roles || {};
    p.roles.driver = true;
    p.driverOnline = true;
    p.vehicle = String(vehicle || p.vehicle || 'Scooter').slice(0, 40);
    var loc = pos();
    if (p.lat == null) {
      p.lat = loc.lat;
      p.lng = loc.lng;
    }
    global.SNProfiles.upsert(p);
    track('driver_online', { vehicle: p.vehicle });
    try {
      global.SNMap?.showProfiles?.();
    } catch (_) {}
    W.step = 'claim';
    save();
    return { ok: true, profile: p };
  }

  /** Claim open delivery + complete → first delivery done · settles S */
  function claimAndComplete() {
    var open =
      (global.SNTasks?.list?.({ kind: 'delivery' }) || []).filter(function (t) {
        return t.status === 'open' || t.status === 'claimed' || t.status === 'in_progress';
      })[0] ||
      (global.SNTasks?.list?.({ all: true }) || []).find(function (t) {
        return t.kind === 'delivery' && t.status !== 'done';
      });
    if (!open) return { ok: false, error: 'no delivery task — order first' };
    var p = me();
    var claim = global.SNTasks.claim(open.id, p || undefined);
    if (!claim.ok) return claim;
    if (claim.task) {
      claim.task.driverId = p && p.id;
      claim.task.driverName = (p && (p.name || p.shopName)) || 'You';
      claim.task.status = 'in_progress';
      try {
        // persist driver fields
        if (global.SNTasks && SNTasks.get) {
          var live = SNTasks.get(claim.task.id);
          if (live) {
            live.driverId = claim.task.driverId;
            live.driverName = claim.task.driverName;
            live.status = 'in_progress';
          }
        }
      } catch (_) {}
    }
    // complete → settleOrder pays driver + vendor (no double tip)
    var done = global.SNTasks.complete(claim.task.id);
    if (done.ok) {
      track('delivery_complete', {
        taskId: done.task && done.task.id,
        self: true,
        settled: !!(done.settled && done.settled.ok),
      });
      try {
        if (global.SNUsage && SNUsage.flag) SNUsage.flag('firstDeliveryDone', true);
        if (global.SNUsage && SNUsage.flag) SNUsage.flag('firstVendorListed', true);
      } catch (_) {}
      W.step = 'done';
      save();
    }
    return {
      ok: !!(done && done.ok),
      claim: claim,
      complete: done,
      task: done && done.task,
      settled: done && done.settled,
    };
  }

  /**
   * Full first painful path: list → menu → order → drive → deliver to me.
   * Uses real user roles only (you are vendor + client + driver).
   */
  async function runFirstLoop(opts) {
    opts = opts || {};
    // Always skip locate by default — first task must complete without GPS thrash
    if (opts.skipLocate == null) opts.skipLocate = true;
    var shop = opts.shop || W.shopName || 'My Astranov Shop';
    var item = opts.item || 'House special';
    var price = opts.price != null ? opts.price : 5;
    try {
      global.speechSynthesis?.cancel?.();
      global.SNCli?.stopHandsfree?.('first-loop');
      global.SNTile?.close?.();
    } catch (_) {}
    // Ensure focus exists for shop pin
    try {
      var pin = global._snLastPos || global._snPhysPos;
      var fake = !pin || pin.lat == null || isDemoPin(pin.lat, pin.lng, pin);
      if (fake) {
        say('Need your real place. Tap locate.', 'err');
        return { ok: false, error: 'Need your place. Tap locate.' };
      }
    } catch (_) {
      return { ok: false, error: 'Need your place. Tap locate.' };
    }
    say('First order · listing your shop…', 'dim');
    if (!opts.skipLocate && global.SNGlobe && SNGlobe.locate) {
      try {
        await Promise.race([
          SNGlobe.locate(),
          new Promise(function (r) {
            setTimeout(r, 1200);
          }),
        ]);
      } catch (_) {}
    }
    var listed = listShop(shop, opts.kind || 'cafe');
    if (!listed.ok) {
      say(listed.error || 'list shop failed', 'err');
      return listed;
    }
    try {
      global.SNMap?.showProfiles?.();
    } catch (_) {}
    say('Shop live: ' + listed.shop + ' · menu…', 'ok');
    var menu = addMenuItem(item, price);
    if (!menu.ok) {
      say(menu.error || 'menu failed', 'err');
      return menu;
    }
    say(
      'Menu · ' +
        item +
        ' · ' +
        (global.SNCurrency ? SNCurrency.format(price) : price + ' S') +
        ' · ordering as you…',
      'ok'
    );
    var ord = orderFromMyShop(1);
    if (!ord.ok) {
      say(ord.error || 'order failed', 'err');
      return ord;
    }
    say(
      'Order · ' +
        (global.SNCurrency ? SNCurrency.format(ord.total) : ord.total + ' S') +
        ' · driver online…',
      'ok'
    );
    goDriverOnline(opts.vehicle || 'Scooter');
    say('Claim + deliver to you…', 'dim');
    var del = claimAndComplete();
    if (del.ok) {
      say(
        "Order done — shop, pay in S, driver to you. Want pizza next time? Just ask.",
        'ok'
      );
      track('first_loop_ok', { shop: shop, item: item, total: ord.total });
      // Keep CLI clear for first-order walkthrough — no auto multi-tile steal
      try {
        if (global.SNMap && SNMap.showTasks) SNMap.showTasks();
        if (global.SNMap && SNMap.showProfiles) SNMap.showProfiles();
      } catch (_) {}
      try {
        if (global.SNUsage && SNUsage.flag) SNUsage.flag('firstDeliveryDone', true);
        if (global.SNUsage && SNUsage.flag) SNUsage.flag('firstVendorListed', true);
      } catch (_) {}
      try {
        if (global.SNCli && SNCli.preview) SNCli.preview('Order done');
      } catch (_) {}
    } else {
      say('Delivery: ' + (del.error || 'claim failed') + ' · try claim · complete', 'err');
      track('first_loop_fail', { error: del.error });
    }
    return {
      ok: !!(del && del.ok),
      listed: listed,
      menu: menu,
      order: ord,
      delivery: del,
      task: ord && ord.task,
      total: ord && ord.total,
    };
  }

  /** Conversational coach — one step at a time for AI actLocal */
  function coachStatus() {
    var p = me();
    var flags = (global.SNUsage && SNUsage.getFlags && SNUsage.getFlags()) || {};
    return {
      step: W.step,
      shopName: W.shopName || (p && p.shopName) || '',
      isVendor: !!(p && p.roles && p.roles.vendor),
      menuCount: (p && p.menu && p.menu.length) || 0,
      driverOnline: !!(p && p.driverOnline),
      firstDeliveryDone: !!flags.firstDeliveryDone,
      firstVendorListed: !!flags.firstVendorListed,
      openDeliveries: (global.SNTasks?.list?.({ kind: 'delivery' }) || []).filter(function (t) {
        return t.status === 'open' || t.status === 'claimed';
      }).length,
    };
  }

  function coachStart() {
    W.step = 'ask_shop';
    save();
    track('coach_start', {});
    return {
      ok: true,
      reply:
        'First order — you only. Step 1: list shop My Cafe  (or say first delivery to auto-run all steps).',
    };
  }

  /**
   * Parse free chat into market actions. Returns { handled, reply, did }.
   */
  function handleChat(message) {
    var line = String(message || '').trim();
    var low = line.toLowerCase();
    var did = [];
    var st = coachStatus();

    // Escape hatch — leave pizza/location pause + refund open paid order if any
    if (/\b(cancel|stop order|clear order|never mind|forget (the )?order|abort)\b/i.test(low)) {
      clearPending('Stopped the paused order.');
      W.step = 'idle';
      save();
      var refunded = null;
      try {
        if (global.SNProfiles && SNProfiles.cancelOrder) {
          refunded = SNProfiles.cancelOrder({});
        }
      } catch (_) {}
      return {
        handled: true,
        reply:
          refunded && refunded.ok
            ? 'Order cancelled · refund ' +
              (global.SNCurrency && SNCurrency.format
                ? SNCurrency.format(refunded.refund)
                : (refunded.refund || 0) + ' AC') +
              (refunded.enRoute ? ' · 3% vault kept' : '')
            : "Okay — order pause cleared. What do you want instead?",
        did: did.concat(['cancel_pending', refunded && refunded.ok ? 'cancel_order' : '']),
      };
    }

    // Pending location confirm — ONLY exact yes/no lines
    if (loadPending() && isLocConfirmLine(low)) {
      return {
        handled: true,
        async: true,
        action: 'confirmLocationAndOrder',
        line: line,
        did: did.concat(['loc_confirm']),
      };
    }

    if (
      /^(first\s*(delivery|loop)|list\s*my\s*shop|open\s*my\s*shop|become\s*vendor|πρώτη\s*παράδοση|μαγαζί\s*μου|coach)$/i.test(
        low
      )
    ) {
      if (/first\s*(delivery|loop)|πρώτη/.test(low)) {
        return { handled: true, async: true, action: 'runFirstLoop', did: did };
      }
      var c = coachStart();
      did.push('coach_start');
      return { handled: true, reply: c.reply, did: did };
    }

    // list shop <name>
    var mList = line.match(/^list\s+shop\s+(.+)$/i) || line.match(/^shop\s+name\s+(.+)$/i);
    if (mList) {
      var r = listShop(mList[1].trim());
      did.push('list_shop');
      return {
        handled: true,
        reply: r.ok
          ? 'Shop live: ' +
            r.shop +
            ' at your target. Step 2: add a menu line — menu add Espresso 3.5  (price in S).'
          : r.error,
        did: did,
      };
    }

    // menu add Name price
    var mMenu =
      line.match(/^menu\s+add\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*s?$/i) ||
      line.match(/^add\s+item\s+(.+?)\s+(\d+(?:[.,]\d+)?)/i) ||
      line.match(/^item\s+(.+?)\s+@\s*(\d+(?:[.,]\d+)?)/i);
    if (mMenu) {
      var price = parseFloat(String(mMenu[2]).replace(',', '.'));
      var ar = addMenuItem(mMenu[1].trim(), price);
      did.push('menu_add');
      return {
        handled: true,
        reply: ar.ok
          ? 'Menu: ' +
            mMenu[1].trim() +
            ' · ' +
            (global.SNCurrency ? SNCurrency.format(price) : price + ' S') +
            '. Step 3: type order me  (buy from your shop as client).'
          : ar.error,
        did: did,
      };
    }

    if (/^order\s*me$|^order\s*self$|^buy\s*from\s*me$|^checkout\s*me$/i.test(low) || low === 'order my menu') {
      var o = orderFromMyShop(1);
      did.push('order_self');
      return {
        handled: true,
        reply: o.ok
          ? 'Order ' +
            (global.SNCurrency ? SNCurrency.format(o.total) : o.total + ' S') +
            ' open for drivers. Step 4: type drive on  then deliver me'
          : o.error || 'order failed',
        did: did,
      };
    }

    if (/^drive\s*on$|^driver\s*on$|^go\s*online$|^online\s*driver$/i.test(low)) {
      var d = goDriverOnline();
      did.push('driver_on');
      return {
        handled: true,
        reply: d.ok
          ? 'You are ONLINE as driver. Step 5: type deliver me  (claim + complete to yourself).'
          : d.error,
        did: did,
      };
    }

    if (/^deliver\s*me$|^claim\s*and\s*deliver$|^complete\s*delivery$/i.test(low) || low === 'finish delivery') {
      var fin = claimAndComplete();
      did.push('deliver_me');
      return {
        handled: true,
        reply: fin.ok
          ? 'Delivered. First vendor → client → driver loop complete. Type usage for ship data. What hurt? Tell me — I queue a handoff for midnight Greek fix.'
          : fin.error || 'no open delivery',
        did: did,
      };
    }

    // Wizard nudges
    if (W.step === 'ask_shop' && line.length > 1 && line.length < 60 && !/^(hi|help)/i.test(low)) {
      var r2 = listShop(line);
      did.push('list_shop_wiz');
      return {
        handled: true,
        reply: r2.ok
          ? 'Listed “' + r2.shop + '”. Now: menu add <name> <priceS>  e.g. menu add Souvlaki 4.5'
          : r2.error,
        did: did,
      };
    }

    if (st.firstDeliveryDone && /pain|broken|fix|bug|handoff|improve/i.test(low)) {
      try {
        if (global.SNUsage && SNUsage.handoff) SNUsage.handoff(line, { source: 'chat' });
      } catch (_) {}
      did.push('handoff');
      return {
        handled: true,
        reply: 'Queued for the coding agent. At Athens midnight we ship one fix from usage + handoffs. Type usage export to copy the packet.',
        did: did,
      };
    }

    return { handled: false, reply: '', did: did, status: st };
  }

  /**
   * Food keywords → hunt on map.
   * Lazy first order: "order me a pizza you judge type size vendor…"
   */
  function parseFoodIntent(line) {
    try {
      if (global.SNGreeklish && SNGreeklish.normalize) {
        line = SNGreeklish.normalize(line);
      }
    } catch (_) {}

    var low = String(line || '')
      .toLowerCase()
      .trim();
    if (!low) return null;
    // Never hijack navigation / map / chat control into pizza loop
    if (
      /^(go\s+to|fly|locate|mars|moon|dark|bright|sat|layers|shops|global|city|help|hi|hey|hello)\b/i.test(
        low
      )
    )
      return null;
    if (/\b(cancel|stop|never\s*mind|forget\s*it|abort|clear\s*order)\b/i.test(low)) return null;

    // Normalize Archangelos / Greeklish first
    try {
      if (global.ArcangeloDialect && ArcangeloDialect.normalizeForRouting) {
        low = String(ArcangeloDialect.normalizeForRouting(line) || line)
          .toLowerCase()
          .trim();
      }
    } catch (_) {}
    var map = [
      { re: /\b(pizza|πίτσα|πιτσα|pizzeria)\b/i, food: 'pizza', overpass: 'pizza restaurant' },
      {
        re: /\b(pitogyra|pitogyro|πιτογύρα|πιτόγυρο|πιτογυρο|πιτογύρο)\b/i,
        food: 'pitogyra',
        overpass: 'restaurant food',
      },
      { re: /\b(sushi|σούσι)\b/i, food: 'sushi', overpass: 'sushi restaurant' },
      { re: /\b(burger|μπέργκερ|hamburger)\b/i, food: 'burger', overpass: 'burger restaurant' },
      { re: /\b(coffee|cafe|καφέ|καφε|espresso)\b/i, food: 'coffee', overpass: 'cafe coffee' },
      { re: /\b(souvlaki|σουβλάκι|gyro|γύρο)\b/i, food: 'souvlaki', overpass: 'fast_food souvlaki' },
      { re: /\b(kebab|kebap|döner|ντονέρ)\b/i, food: 'kebab', overpass: 'kebab restaurant' },
      { re: /\b(pasta|italian|ιταλικ)\b/i, food: 'pasta', overpass: 'italian restaurant' },
      { re: /\b(chinese|κινέζικ)\b/i, food: 'chinese', overpass: 'chinese restaurant' },
      {
        re: /\b(mpyronia|mpironia|mpyres|μπυρόνια|μπίρες|beer|beers)\b/i,
        food: 'beer',
        overpass: 'supermarket convenience',
      },
    ];
    // Generic "food/hungry" only with clear order intent — not every "eat" chat
    var genericFood =
      /\b(food|φαγητ|πεινάω|hungry|i'?m\s+hungry|want\s+to\s+eat|thelo|θέλω)\b/i.test(low) &&
      /\b(order|bring|get\s+me|buy|παράγγειλ|find|want|thelo|θέλω)\b/i.test(low);

    var food = null;
    var overpass = 'restaurant food';
    var i;
    for (i = 0; i < map.length; i++) {
      if (map[i].re.test(low)) {
        food = map[i].food;
        overpass = map[i].overpass;
        break;
      }
    }
    if (!food && genericFood) {
      food = 'food';
    }
    if (!food) return null;

    // Full lazy order: order verbs OR single food word (owner: "pizza" is enough)
    var auto =
      /\border(\s+me)?(\s+a)?\b/i.test(low) ||
      /\b(bring|get\s+me|buy\s+me|παράγγειλ|παράγγειλε)\b/i.test(low) ||
      /\b(i\s+need|i\s+want|send\s+me|deliver\s+me\s+a)\b/i.test(low) ||
      /\b(you\s+judge|judge\s+the|you\s+pick|you\s+choose|whatever\s+else|what\s+time\s+i\s+eat)\b/i.test(
        low
      );
    // One token / short food phrase = full marketplace loop (locate→best open→pay→driver→ETA)
    var tokens = low.replace(/[^a-zα-ωά-ώ0-9\s]/gi, ' ').trim().split(/\s+/).filter(Boolean);
    var singleFood =
      !!food &&
      tokens.length <= 3 &&
      !/\b(where|what|who|how|map|go|fly|help|shops?|find\s+only|browse|list)\b/i.test(low);
    if (singleFood) auto = true;
    var lazyJudge =
      auto ||
      singleFood ||
      /\b(you\s+judge|judge\s+type|judge\s+the|what\s+time\s+i\s+eat)\b/i.test(low);

    return {
      food: food,
      overpass: overpass,
      raw: line,
      autoOrder: !!auto,
      lazyJudge: !!lazyJudge,
      browseOnly: !auto && !lazyJudge,
      oneWord: !!singleFood && tokens.length <= 2,
    };
  }

  /**
   * Astranov judges meal from line + stored likings / temper / company size.
   * Feisty Greek guy · company of 3 · Super Greek special 13 · retsina · 1.5L soda.
   */
  function judgeMeal(food, rawLine) {
    var prefs = loadPrefs();
    // remembered likes
    if (!prefs.size && prefs.lastOrder && prefs.lastOrder.size) prefs.size = prefs.lastOrder.size;
    if (!prefs.drinks && prefs.drink) prefs.drinks = prefs.drink;
    var low = String(rawLine || '').toLowerCase();
    var f = String(food || 'food').toLowerCase();
    var company = (prefs.company && prefs.company.people) || 3;
    var size = 'Large';
    if (company >= 4 || (prefs.pizza && prefs.pizza.pieces >= 12)) size = 'Family';
    if (/\b(small|personal|μικρ)\b/i.test(low)) size = 'Small';
    else if (/\b(medium|med|μεσα)\b/i.test(low)) size = 'Medium';
    else if (/\b(family|xl|extra\s*large|οικογεν|13)\b/i.test(low)) size = 'Family';

    var type = null;
    var pieces = prefs.pizza && prefs.pizza.pieces ? prefs.pizza.pieces : 8;
    if (f === 'pizza') {
      if (/pepperoni|πεπερόνι/i.test(low)) type = 'Pepperoni';
      else if (/margherita|μαργαρίτα/i.test(low)) type = 'Margherita';
      else if (/four\s*cheese|4\s*cheese/i.test(low)) type = 'Four cheese';
      else if (/greek|ελλην|special|super/i.test(low) || /greek/i.test(prefs.temper || '')) {
        type = 'Super Greek special';
        pieces = 13;
        size = 'Family';
      } else if (/feisty|greek|temper/i.test(prefs.temper || '') || (prefs.likes || []).some(function (l) {
        return /greek|special/i.test(l);
      })) {
        type = 'Super Greek special';
        pieces = 13;
        size = 'Family';
      } else type = 'Margherita';
    } else if (f === 'sushi') type = 'Chef set';
    else if (f === 'burger') type = 'Classic';
    else if (f === 'coffee') {
      size = 'Regular';
      type = 'Espresso';
    } else type = f.charAt(0).toUpperCase() + f.slice(1);

    var price = defaultFoodPrice(f);
    if (size === 'Small') price *= 0.75;
    if (size === 'Large') price *= 1.15;
    if (size === 'Family' || pieces >= 12) price = Math.max(price * 1.55, 18);
    if (type && /super greek/i.test(type)) price = 22;
    price = Math.round(price * 100) / 100;

    var itemName =
      f === 'pizza'
        ? type + ' · ' + pieces + ' pieces · ' + size
        : f === 'coffee'
          ? type
          : size + ' ' + type;

    var extras = [];
    // Drinks from prefs / line
    var wantRetsina =
      prefs.drink && prefs.drink.retsina !== false &&
      (/retsina|ρετσίνα|ρετσινα|wine|κρασί/i.test(low) ||
        /greek|feisty/i.test(prefs.temper || '') ||
        (prefs.likes || []).some(function (l) {
          return /retsina/i.test(l);
        }));
    var wantSoda =
      (prefs.drink && prefs.drink.sodaL) ||
      /soda|αναψυκ|cola|1\.5|liter|λίτρ/i.test(low) ||
      company >= 2;
    if (wantRetsina) {
      extras.push({ name: 'Retsina (bottle)', price: 8, kind: 'drink' });
    }
    if (wantSoda) {
      var liters = (prefs.drink && prefs.drink.sodaL) || 1.5;
      extras.push({ name: 'Big soda ' + liters + 'L', price: 3.5, kind: 'drink' });
    }

    return {
      food: f,
      size: size,
      type: type,
      pieces: pieces,
      itemName: itemName,
      price: price,
      extras: extras,
      company: company,
      temper: prefs.temper || '',
      service: 'Astranov delivery',
      researchNote:
        "For you: " +
        (prefs.temper || 'open') +
        ', about ' +
        company +
        ' people' +
        (prefs.company && prefs.company.girlfriends
          ? ' (you + ' + prefs.company.girlfriends + ' girlfriends)'
          : '') +
        (prefs.company && (prefs.company.cats || prefs.company.dogs)
          ? ', pets noted'
          : '') +
        '.',
    };
  }

  function etaEat(km) {
    var prep = 16; // kitchen minutes
    var drive = Math.max(8, Math.round(Number(km) * 4 + 6));
    var total = prep + drive;
    var eatAt = new Date(Date.now() + total * 60000);
    var hh = String(eatAt.getHours()).padStart(2, '0');
    var mm = String(eatAt.getMinutes()).padStart(2, '0');
    return {
      prepMin: prep,
      driveMin: drive,
      totalMin: total,
      eatAt: eatAt,
      eatClock: hh + ':' + mm,
      eatLine: 'You eat at ' + hh + ':' + mm + ' · ~' + total + ' min (prep ' + prep + ' + ride ' + drive + ')',
    };
  }

  function haversineKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 99;
    var R = 6371;
    var dLat = ((b.lat - a.lat) * Math.PI) / 180;
    var dLng = ((b.lng - a.lng) * Math.PI) / 180;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }

  function defaultFoodPrice(food) {
    var f = String(food || 'food').toLowerCase();
    if (f === 'coffee') return 3.5;
    if (f === 'pizza') return 11;
    if (f === 'sushi') return 14;
    if (f === 'burger') return 9;
    if (f === 'souvlaki' || f === 'kebab') return 6.5;
    return 10;
  }

  function ensureFoodMenu(vendor, food, judged) {
    if (!vendor || !global.SNProfiles) return vendor;
    if (global.SNProfiles.ensureOrderableMenu) {
      vendor = SNProfiles.ensureOrderableMenu(vendor) || vendor;
    }
    var menu = vendor.menu || [];
    var wantName = judged && judged.itemName ? judged.itemName : String(food || 'Food');
    var f = String(food || 'Food');
    var has = menu.some(function (m) {
      var n = String(m.name || '').toLowerCase();
      return (
        n.indexOf(String(wantName).toLowerCase()) >= 0 ||
        n.indexOf(f.toLowerCase()) >= 0 ||
        (judged && judged.type && n.indexOf(String(judged.type).toLowerCase()) >= 0)
      );
    });
    if (!has) {
      global.SNProfiles.setMenuItem(vendor.id, {
        name: wantName.charAt(0).toUpperCase() + wantName.slice(1),
        price: judged && judged.price != null ? judged.price : defaultFoodPrice(food),
        desc: 'Price-band order slot · kitchen confirms real dish',
        available: true,
        source: 'price_band',
        synthetic: true,
        photo: (vendor.photos && vendor.photos[0]) || vendor.cover || vendor.avatar || '',
      });
      vendor = (global.SNProfiles.get && global.SNProfiles.get(vendor.id)) || vendor;
    }
    return vendor;
  }

  function pickMenuItem(vendor, food, judged) {
    var menu = (vendor && vendor.menu) || [];
    // Prefer real (non price_band) items first
    try {
      var real = menu.filter(function (x) {
        return x && !x.synthetic && x.source !== 'price_band';
      });
      if (real.length) menu = real.concat(menu.filter(function (x) { return real.indexOf(x) < 0; }));
    } catch (_) {}

    if (judged && judged.itemName) {
      var want = String(judged.itemName).toLowerCase();
      var exact = menu.find(function (m) {
        return String(m.name || '').toLowerCase().indexOf(want) >= 0;
      });
      if (exact) return exact;
      if (judged.type) {
        var byType = menu.find(function (m) {
          return String(m.name || '')
            .toLowerCase()
            .indexOf(String(judged.type).toLowerCase()) >= 0;
        });
        if (byType) return byType;
      }
    }
    var f = String(food || '').toLowerCase();
    var hit = menu.find(function (m) {
      return String(m.name || '')
        .toLowerCase()
        .indexOf(f) >= 0;
    });
    return hit || menu[0] || null;
  }

  /**
   * Full juice path for "pizza" / "order sushi" / "I want coffee":
   * locate → find open places → vendor tiles + menus/prices → judge → order → assign driver
   */
  /**
   * Resume after user confirms location (yes / correct / here).
   */
  async function confirmLocationAndOrder(line) {
    var low = String(line || '')
      .toLowerCase()
      .trim();
    var pend = loadPending();
    if (!pend || !pend.intent) return { ok: false, handled: false };
    if (!isLocConfirmLine(low)) return { ok: false, handled: false };

    if (/^(no|nope|wrong|όχι|oxi)$/i.test(low)) {
      savePending(null);
      return {
        ok: false,
        handled: true,
        needsConfirm: false,
        reply:
          "Got it — not that pin. Say locate when you're ready, then order again. Or talk about something else.",
        summary: 'Location rejected',
      };
    }
    if (/^(yes|y|yeah|yep|ok|okay|correct|here|confirm|go|proceed|ν|ναι)$/i.test(low)) {
      var prefs = loadPrefs();
      if (pend.pos) {
        prefs.verifiedLoc = {
          lat: pend.pos.lat,
          lng: pend.pos.lng,
          t: Date.now(),
          label: 'confirmed',
        };
        savePrefs(prefs);
        global._snLastPos = { lat: pend.pos.lat, lng: pend.pos.lng };
      }
      var intent = pend.intent;
      intent.skipLocConfirm = true;
      intent.confirmedPos = pend.pos;
      savePending(null);
      return fulfillFoodIntent(intent, { autoOrder: true, quiet: false, skipLocConfirm: true });
    }
    return { ok: false, handled: false };
  }

  async function fulfillFoodIntent(query, opts) {
    opts = opts || {};
    var quiet = opts.quiet === true;
    var intent = typeof query === 'object' ? query : parseFoodIntent(query);
    if (!intent) return { ok: false, error: 'not a food intent' };
    var food = intent.food || 'food';
    var rawLine = intent.raw || (typeof query === 'string' ? query : '');
    // Browse-only ("pizza" alone) finds shops — does not force pay loop
    if (intent.browseOnly && opts.autoOrder !== true) {
      intent.autoOrder = false;
      intent.lazyJudge = false;
    } else if (opts.autoOrder === true || intent.autoOrder || intent.lazyJudge) {
      intent.autoOrder = true;
    }
    // FINISH LAW: one-word / lazy order must complete money path (no YES hang, soft home OK)
    if (intent.autoOrder || intent.oneWord || intent.lazyJudge) {
      if (opts.softHome == null) opts.softHome = true;
      if (opts.skipLocConfirm == null) opts.skipLocConfirm = true;
      if (opts.allowSelfCourier == null) opts.allowSelfCourier = true;
      intent.skipLocConfirm = true;
      intent.softHome = true;
    }
    // Persist stated prefs from this session (owner likes)
    try {
      var prefSave = loadPrefs();
      prefSave.temper = prefSave.temper || DEFAULT_PREFS.temper;
      prefSave.company = Object.assign({}, DEFAULT_PREFS.company, prefSave.company || {});
      prefSave.pizza = Object.assign({}, DEFAULT_PREFS.pizza, prefSave.pizza || {});
      prefSave.drink = Object.assign({}, DEFAULT_PREFS.drink, prefSave.drink || {});
      savePrefs(prefSave);
    } catch (_) {}
    var judged = judgeMeal(food, rawLine);
    var log = function (m, c, mapKind, mapOpts) {
      if (quiet) return;
      try {
        // NEVER globe-tour during food orders (flyNear/national/global)
        // Stay on city map only — order/delivery kinds open map without flying Earth
        if (mapKind === 'locate' || mapKind === 'shops' || mapKind === 'food' || mapKind === 'vendors' || mapKind === 'fly' || mapKind === 'global') {
          mapKind = 'order';
        }
        if (global.SNCli && SNCli.activity && mapKind) {
          global.SNCli.activity(m, mapKind, mapOpts || {});
        } else if (global.SNCli && SNCli.log) {
          SNCli.log(m, c || 'dim');
        }
      } catch (_) {}
    };
    var steps = [];
    var MAX_SHOP_KM = 6;

    // ═══════════════════════════════════════════════════════════
    // BUSINESS PIPELINE
    // 1 Locate me → 2 real open shops near me → 3 rank price/rating
    // → 4 suggest 1·2·3 → 5 buy/pay S → 6 driver → 7 multi-stop route
    // → 8 ETA → 9 notify before arrival
    // NEVER fly other continents. NEVER use globe focus as your address.
    // ═══════════════════════════════════════════════════════════

    // 1) LOCATE YOU — already-known real pin only. Never Rhodes. Never a 40s GPS hang.
    log('Finding you…', 'dim', 'locate', { label: 'You' });
    var pos = intent.confirmedPos || null;
    if (!pos || pos.lat == null) {
      try {
        if (global._snPhysPos && global._snPhysPos.lat != null) pos = global._snPhysPos;
      } catch (_) {}
    }
    if (!pos || pos.lat == null) {
      try {
        var last = global._snLastPos;
        if (
          last &&
          last.lat != null &&
          !isDemoPin(last.lat, last.lng, last) &&
          (last.real ||
            last.source === 'gps' ||
            last.source === 'locate' ||
            last.source === 'ip' ||
            last.source === 'soft' ||
            last.source === 'cache' ||
            last.source === 'verified')
        ) {
          pos = last;
        }
      } catch (_) {}
    }
    if (pos && isDemoPin(pos.lat, pos.lng, pos)) pos = null;
    if (!pos || pos.lat == null) {
      return {
        ok: false,
        error: 'need locate',
        reply: 'I need your real place first. Tap Locate and Sign in with Google, then say pizza again.',
        steps: ['locate_fail'],
      };
    }
    // Reject absurd soft pins from world roam without confirm
    global._snLastPos = { lat: pos.lat, lng: pos.lng, reason: 'order' };
    try {
      if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(pos.lat, pos.lng);
    } catch (_) {}
    // Pin city map ONCE at you — no globe fly tour
    try {
      if (global.SNMap && SNMap.open) {
        await SNMap.open(pos.lat, pos.lng);
        if (SNMap.ensure) await SNMap.ensure();
        if (SNMap.markYou) SNMap.markYou(pos.lat, pos.lng, 'YOU · delivery stop');
        if (SNMap.fitLatLngs)
          SNMap.fitLatLngs([{ lat: pos.lat, lng: pos.lng }], { zoom: 15, force: true });
      }
      // Do not call SNGlobe.flyNear / goToTier during order
    } catch (_) {}
    log(
      'YOU · ' +
        pos.lat.toFixed(5) +
        ', ' +
        pos.lng.toFixed(5) +
        (pos.accuracy != null ? ' · ±' + Math.round(pos.accuracy) + 'm' : '') +
        (pos.fallback ? ' · soft pin' : ' · live GPS') +
        ' · search radius ' +
        MAX_SHOP_KM +
        ' km only',
      pos.fallback ? 'dim' : 'ok',
      'locate',
      { lat: pos.lat, lng: pos.lng, label: 'You' }
    );
    steps.push('locate');

    // 1b) Confirm soft / suspect location
    var locCheck = locationIsSuspect(pos);
    var prefsNow = loadPrefs();
    var recentlyOk =
      prefsNow.verifiedLoc &&
      Date.now() - (prefsNow.verifiedLoc.t || 0) < 6 * 3600 * 1000 &&
      Math.abs(prefsNow.verifiedLoc.lat - pos.lat) < 0.015 &&
      Math.abs(prefsNow.verifiedLoc.lng - pos.lng) < 0.015;
    if (locCheck.suspect && !opts.skipLocConfirm && !intent.skipLocConfirm && !recentlyOk) {
      savePending({
        intent: {
          food: food,
          overpass: intent.overpass,
          raw: rawLine,
          autoOrder: true,
          lazyJudge: true,
        },
        pos: { lat: pos.lat, lng: pos.lng, fallback: !!pos.fallback, reason: pos.reason },
        t: Date.now(),
      });
      var ask =
        'Delivery pin · ' +
        pos.lat.toFixed(4) +
        ', ' +
        pos.lng.toFixed(4) +
        ' (' +
        locCheck.why +
        '). Is this YOU? Reply YES to shop near here · NO to stop (then type locate).';
      log(ask, 'ok');
      return {
        ok: false,
        needsConfirm: true,
        pending: true,
        pos: pos,
        judged: judged,
        reply: ask,
        summary: 'LOCATION CHECK\n' + pos.lat.toFixed(4) + ', ' + pos.lng.toFixed(4) + '\n' + locCheck.why,
        eatLine: 'paused · confirm location',
      };
    }
    // Lock verified pin for this session
    try {
      prefsNow.verifiedLoc = { lat: pos.lat, lng: pos.lng, t: Date.now() };
      savePrefs(prefsNow);
    } catch (_) {}
    steps.push('loc_ok');

    // 2) Meal for you
    log(judged.researchNote || 'Picking what fits you…', 'ok');
    log(
      'tray · ' +
        judged.itemName +
        (judged.extras && judged.extras.length
          ? ' + ' +
            judged.extras
              .map(function (e) {
                return e.name;
              })
              .join(' + ')
          : ''),
      'ok'
    );
    steps.push('judge_meal');

    // 3) REAL SHOPS near YOU only (no world crawl)
    log(
      'Step 2 · open shops within ' + MAX_SHOP_KM + ' km of you…',
      'dim',
      'shops',
      { lat: pos.lat, lng: pos.lng, label: food }
    );
    try {
      if (global.SNVendorCrawl && SNVendorCrawl.populate) {
        await Promise.race([
          SNVendorCrawl.populate({
            lat: pos.lat,
            lng: pos.lng,
            query: (intent.overpass || food || 'restaurant') + ' food',
            openMap: true,
            force: false,
            quiet: true,
          }),
          new Promise(function (resolve) {
            setTimeout(resolve, opts.testMode || opts.softHome ? 4000 : 9000);
          }),
        ]);
      }
    } catch (_vc) {}
    try {
      if (global.SNHelper && SNHelper.find) {
        SNHelper.find(food || 'shops', pos, { log: false });
      }
    } catch (_) {}
    var pois = [];
    try {
      var waited = 0;
      while ((!global.SNSearch || !SNSearch.nearby) && waited < 2500) {
        await new Promise(function (r) {
          setTimeout(r, 200);
        });
        waited += 200;
      }
      if (global.SNSearch && SNSearch.nearby) {
        var nearP = SNSearch.nearby(
          pos.lat,
          pos.lng,
          MAX_SHOP_KM * 1000,
          intent.overpass || food
        );
        pois =
          (await Promise.race([
            Promise.resolve(nearP),
            new Promise(function (resolve) {
              setTimeout(function () {
                resolve([]);
              }, opts.testMode || opts.softHome ? 3500 : 8000);
            }),
          ])) || [];
        if ((!pois || !pois.length) && food === 'pizza' && !opts.testMode) {
          pois =
            (await Promise.race([
              Promise.resolve(
                SNSearch.nearby(pos.lat, pos.lng, MAX_SHOP_KM * 1000, 'restaurant food')
              ),
              new Promise(function (resolve) {
                setTimeout(function () {
                  resolve([]);
                }, 5000);
              }),
            ])) || [];
        }
      }
    } catch (_) {
      pois = [];
    }
    try {
      if (global.SNCommerce && SNCommerce.ensureSector) {
        await Promise.race([
          SNCommerce.ensureSector(pos.lat, pos.lng, { openMap: true }),
          new Promise(function (resolve) { setTimeout(resolve, 3500); }),
        ]);
      }
    } catch (_) {}
    // Only accept POIs actually near you
    (pois || []).forEach(function (p) {
      if (p.lat == null || p.lng == null) return;
      if (haversineKm(pos, p) > MAX_SHOP_KM + 0.5) return;
      try {
        global.SNProfiles.fromCrawlPlace(
          {
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            kind: p.kind || food,
            real: true,
            source: p.source || 'overpass',
            hours: p.hours || '',
            phone: p.phone || '',
            website: p.website || '',
            cuisine: p.cuisine || '',
            rating: p.rating != null ? p.rating : p.stars,
          },
          pos
        );
      } catch (_) {}
    });
    log(
      (pois && pois.length ? pois.length + ' map places near you' : 'map quiet near you · checking DB…'),
      pois && pois.length ? 'ok' : 'dim'
    );
    steps.push('find');

    function isFoodShop(v, want) {
      var blob = (
        (v.shopKind || '') +
        ' ' +
        (v.shopName || '') +
        ' ' +
        (v.name || '') +
        ' ' +
        (v.cuisine || '') +
        ' ' +
        (v.kind || '') +
        ' ' +
        (v.source || '')
      ).toLowerCase();
      if (v.real && /overpass|nominatim|photon|osm/.test(String(v.source || ''))) return true;
      if (want === 'pizza' && /pizza|πίτσα|πιτσα|pizzeria/.test(blob)) return true;
      if (/restaurant|fast_food|cafe|pizza|food|kitchen|grill|souvlaki|gyro|kebab|sushi|burger/.test(blob))
        return true;
      return false;
    }
    function collectVendors(maxKm) {
      return (global.SNProfiles.list({ role: 'vendor' }) || []).filter(function (v) {
        if (!v || v.lat == null || v.lng == null) return false;
        if (v.id && String(v.id).indexOf('me') === 0 && !/kitchen|shop|pizza/i.test(v.shopName || v.name || ''))
          return false;
        if (!isFoodShop(v, food)) return false;
        // HARD: never a shop on another continent
        return haversineKm(pos, v) <= maxKm;
      });
    }
    var vendors = collectVendors(MAX_SHOP_KM);
    if (vendors.length < 2) {
      var wider = collectVendors(MAX_SHOP_KM + 2);
      if (wider.length > vendors.length) vendors = wider;
    }
    // Live path never invents shops. Test mode only if the caller said so.
    var testMode = false;
    try {
      testMode = opts.testMode === true;
    } catch (_) {}
    if (!vendors.length && testMode && global.SNProfiles) {
      try {
        var kid =
          'kitchen_' +
          String(Number(pos.lat).toFixed(3)).replace(/\./g, 'p') +
          '_' +
          String(Number(pos.lng).toFixed(3)).replace(/\./g, 'p');
        vendors = [
          global.SNProfiles.upsert({
            id: kid,
            name: 'Astranov Kitchen',
            shopName: 'Astranov Kitchen',
            shopKind: food === 'pizza' ? 'pizza' : food,
            roles: { vendor: true },
            lat: Number(pos.lat) + 0.0022,
            lng: Number(pos.lng) + 0.0018,
            real: true,
            source: 'astranov-kitchen-test',
            hours: '24/7',
            rating: 4.2,
            menu: [],
          }),
        ];
        log('TEST mode · Astranov Kitchen fallback at your sector', 'dim');
      } catch (_) {}
    }

    vendors = vendors
      .map(function (v) {
        v = ensureFoodMenu(v, food, judged);
        var sc = scoreVendor(v, pos, food, judged);
        return Object.assign({}, v, {
          _score: sc.score,
          _km: sc.km,
          _price: sc.price,
          _rating: sc.rating,
          _open: sc.open,
        });
      })
      .filter(function (v) {
        return v._km <= MAX_SHOP_KM + 2.5;
      });
    vendors.sort(function (a, b) {
      return (b._score || 0) - (a._score || 0);
    });
    vendors = vendors.slice(0, 8);

    // Map: only you + nearby shops (no globe world tour)
    try {
      if (global.SNMap && SNMap.open) {
        await SNMap.open(pos.lat, pos.lng);
        if (SNMap.ensure) await SNMap.ensure();
        if (SNMap.markYou) SNMap.markYou(pos.lat, pos.lng, 'YOU · delivery stop');
        if (SNMap.showProfiles) SNMap.showProfiles();
        var pins = [{ lat: pos.lat, lng: pos.lng }].concat(
          vendors.map(function (v) {
            return { lat: v.lat, lng: v.lng };
          })
        );
        if (SNMap.fitLatLngs) SNMap.fitLatLngs(pins, { padding: 48, maxZoom: 15, force: true });
      }
    } catch (_) {}
    steps.push('tiles');

    if (!vendors.length) {
      return {
        ok: false,
        error: 'No shops within ' + MAX_SHOP_KM + ' km · try locate · fill shops',
        pos: pos,
        judged: judged,
        steps: steps,
        reply: 'No pizza shops near you on the map yet. Tap Locate if this is the wrong place, or say shops to look again.',
      };
    }

    // 4) SUGGEST 1 · 2 · 3 (price + rating + distance)
    var top3 = vendors.slice(0, 3);
    log('Step 3 · best near you (price · rating · distance):', 'ok');
    top3.forEach(function (v, i) {
      log(
        (i + 1) +
          ') ' +
          (v.shopName || v.name) +
          ' · ' +
          (v._km != null ? v._km.toFixed(1) + ' km' : '?') +
          ' · ' +
          (v._price != null
            ? global.SNCurrency
              ? SNCurrency.format(v._price)
              : Number(v._price).toFixed(2) + ' AC'
            : '?') +
          (v._rating != null ? ' · ★' + Number(v._rating).toFixed(1) : '') +
          (v._open === false ? ' · closed?' : ' · open'),
        i === 0 ? 'ok' : 'dim',
        'shops',
        { lat: v.lat, lng: v.lng, label: i + 1 + '·' + (v.shopName || v.name) }
      );
    });
    steps.push('suggest');

    // Auto path picks #1; browse path stops here
    var best = top3[0];
    best = ensureFoodMenu(best, food, judged);
    var menuItem = pickMenuItem(best, food, judged);
    if (menuItem && judged && judged.itemName) {
      menuItem = {
        id: menuItem.id,
        name: judged.itemName,
        price: judged.price != null ? judged.price : menuItem.price,
        desc: menuItem.desc || 'Astranov pick',
      };
    }
    var kmBest = best._km != null ? best._km : haversineKm(pos, best);
    log(
      'Chosen · #1 ' +
        (best.shopName || best.name) +
        ' · ' +
        kmBest.toFixed(1) +
        ' km' +
        (intent.autoOrder ? '' : ' · say order me pizza to buy'),
      'ok',
      'order',
      { lat: best.lat, lng: best.lng, label: best.shopName || best.name }
    );
    steps.push('choose');

    // Pin client for drop
    try {
      var clientMe = me();
      if (clientMe && global.SNProfiles) {
        clientMe.lat = pos.lat;
        clientMe.lng = pos.lng;
        clientMe.roles = clientMe.roles || {};
        clientMe.roles.client = true;
        global.SNProfiles.upsert(clientMe);
      }
      global._snLastPos = { lat: pos.lat, lng: pos.lng, reason: 'order' };
      if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(pos.lat, pos.lng);
    } catch (_) {}

    // 5) PAY
    var orderResult = null;
    var fmt = function (n) {
      return global.SNCurrency ? SNCurrency.format(n) : Number(n).toFixed(2) + ' S';
    };
    if (opts.autoOrder !== false && intent.autoOrder !== false && menuItem) {
      log(
        'Step 4 · pay · ' +
          menuItem.name +
          (judged.extras && judged.extras.length
            ? ' + ' +
              judged.extras
                .map(function (e) {
                  return e.name;
                })
                .join(' + ')
            : '') +
          ' @ ' +
          (best.shopName || best.name),
        'ok',
        'order',
        { lat: best.lat, lng: best.lng, label: best.shopName || best.name }
      );
      if (best && !isShopOpenNow(best) && !testMode) {
        log('Vendor closed now · pick another or try later', 'err');
        orderResult = { ok: false, error: 'vendor closed' };
      }
      try {
        if (orderResult && orderResult.error === 'vendor closed') throw new Error('vendor closed');
        global.SNProfiles.cartClear();
        global.SNProfiles.cartAdd(best.id, menuItem, 1);
        (judged.extras || []).forEach(function (ex) {
          global.SNProfiles.cartAdd(
            best.id,
            { name: ex.name, price: ex.price, id: 'ex_' + ex.name },
            1
          );
        });
        var idem =
          'ord_' +
          (best.id || 'v') +
          '_' +
          (menuItem && menuItem.name ? menuItem.name : food) +
          '_' +
          Math.floor(Date.now() / 60000);
        if (global.SNOrderEngine && SNOrderEngine.preflightOrder) {
          var pre = SNOrderEngine.preflightOrder({
            pos: pos,
            vendor: best,
            testMode: testMode,
            idempotencyKey: idem,
          });
          if (pre.replay && pre.result) {
            orderResult = { ok: true, total: pre.result.total, task: { id: pre.result.taskId }, replay: true };
            log('PAID · replay idempotent · ' + fmt(pre.result.total), 'ok');
          } else if (!pre.ok) {
            log(pre.error || 'preflight fail', 'err');
            orderResult = { ok: false, error: pre.error };
          }
        }
        if (!orderResult) {
        orderResult = global.SNProfiles.placeOrder({
          testMode: testMode,
          allowTopUp: testMode || !!opts.softHome || !!intent.oneWord || !!intent.autoOrder,
          idempotencyKey: idem,
        });
        }
        if (orderResult && orderResult.ok && global.SNOrderEngine && SNOrderEngine.afterPaid) {
          orderResult = SNOrderEngine.afterPaid(orderResult, {
            seeking: false,
            idempotencyKey: idem,
            vendor: best,
            pos: pos,
            drop: pos,
          });
        }
        try {
          if (orderResult && orderResult.ok && global.SNMeshOrders && SNMeshOrders.afterLocalOrder) {
            var meshR = await SNMeshOrders.afterLocalOrder(orderResult, {
              vendor: best,
              drop: pos,
              pos: pos,
            });
            if (meshR && meshR.live && (meshR.live.short || meshR.live.id)) {
              log(
                'LIVE · ' +
                  (meshR.live.short || String(meshR.live.id).slice(0, 8)) +
                  ' · shop ' +
                  (best.shopName || best.name) +
                  ' · customer YOU · seeking driver',
                'ok'
              );
            }
          }
        } catch (_) {}
        if (orderResult && orderResult.ok) {
          log('HOLD ⭐ · shop + driver paid on delivery confirm · vault 3% now', 'ok');
          try {
            if (global.SNAstranovMind && SNAstranovMind.teach) {
              SNAstranovMind.teach(
                'favorite vendor last order',
                (best.shopName || best.name || '') + ' · ' + (menuItem && menuItem.name) + ' · ' + fmt(orderResult.total),
                ['order', 'memory', 'vendor']
              );
            }
            if (global.SNOrderEngine) {
              SNOrderEngine.pushEvent(orderResult.task && orderResult.task.id, 'paid', 'memory', {
                vendor: best.id,
              });
            }
            var prefM = loadPrefs();
            prefM.lastOrder = {
              vendorId: best.id,
              vendorName: best.shopName || best.name,
              item: menuItem && menuItem.name,
              t: Date.now(),
              food: food,
              size: judged && judged.size,
              drinks: judged && judged.drinks,
            };
            if (judged && judged.size) prefM.size = judged.size;
            if (judged && judged.drinks) prefM.drinks = judged.drinks;
            if (!prefM.favorites) prefM.favorites = [];
            if (best.id && prefM.favorites.indexOf(best.id) < 0) {
              prefM.favorites.unshift(best.id);
              prefM.favorites = prefM.favorites.slice(0, 12);
            }
            if (pos && pos.lat != null) prefM.homePin = { lat: pos.lat, lng: pos.lng, t: Date.now() };
            savePrefs(prefM);
          } catch (_mem) {}

          try {
            if (global.SNHelper && SNHelper.flyTo && best) {
              SNHelper.flyTo(
                { lat: best.lat, lng: best.lng },
                {
                  kind: 'order',
                  label: 'ORDER · ' + String(best.shopName || best.name || 'shop').slice(0, 14),
                  detail: 'pickup',
                  status: 'delivery',
                  dur: 2800,
                }
              );
            }
          } catch (_) {}
          steps.push('order');
        } else {
          log((orderResult && orderResult.error) || 'order failed', 'err');
        }
      } catch (e) {
        log('order error · ' + (e.message || e), 'err');
      }
    } else {
      log('Suggestions ready · say order me ' + food + ' to pay #1', 'dim');
    }

    // 6) DRIVER + multi-stop route + ETA + notify
    var driver = null;
    var claim = null;
    var completeRes = null;
    var courierNote = judged.service;
    var extraStops = [];
    var eta = etaWithStops(kmBest, 0);
    if (orderResult && orderResult.ok && orderResult.task) {
      log('Step 5 · assigning courier…', 'dim', 'delivery', {
        lat: best.lat,
        lng: best.lng,
        label: 'Courier',
      });
      try {
        if (global.SNHelper && SNHelper.flyTo) {
          SNHelper.flyTo(
            { lat: best.lat, lng: best.lng },
            {
              kind: 'order',
              label: 'ORDER · ' + String(best.shopName || best.name || 'shop').slice(0, 16),
              detail: 'vendor pickup',
              status: 'pickup',
              dur: 2400,
            }
          );
        }
      } catch (_) {}
      var meP = global.SNProfiles && SNProfiles.me && SNProfiles.me();
      var pick =
        global.SNChannel && SNChannel.pickBestDriver
          ? SNChannel.pickBestDriver(pos, { maxKm: 20, excludeMe: false })
          : null;
      var drivers = [];
      if (pick && pick.driver) {
        drivers = [pick.driver];
      } else {
        drivers = (global.SNProfiles.list({ role: 'driver' }) || []).filter(function (d) {
          return d.driverOnline && d.id !== (meP && meP.id) && haversineKm(pos, d) < 20;
        });
        drivers.sort(function (a, b) {
          var ca =
            (global.SNChannel && SNChannel.cargoLoad && SNChannel.cargoLoad(a.id)) || 0;
          var cb =
            (global.SNChannel && SNChannel.cargoLoad && SNChannel.cargoLoad(b.id)) || 0;
          return haversineKm(pos, a) * 10 + ca * 28 - (haversineKm(pos, b) * 10 + cb * 28);
        });
      }
      if (drivers.length) {
        driver = drivers[0];
        try {
          claim = global.SNTasks.claim(orderResult.task.id, driver);
          if (claim && claim.ok && claim.task) {
            claim.task.driverId = driver.id;
            claim.task.driverName = driver.name || 'Driver';
            claim.task.status = 'in_progress';
            claim.task.cargoAtAssign = pick ? pick.cargo : 0;
          }
          courierNote =
            'Courier · ' +
            (driver.name || 'driver') +
            (driver.vehicle ? ' · ' + driver.vehicle : '') +
            (pick
              ? ' · ' +
                pick.km.toFixed(1) +
                ' km · cargo ' +
                pick.cargo +
                '/' +
                pick.maxCargo +
                ' (lightest free)'
              : '') +
            ' · en route · say deliver me when landed';
          log(courierNote, 'ok');
        } catch (_) {}
      } else {
        // LIVE: leave order seeking_driver — mesh / real drivers claim. No instant self-settle.
        var allowSelf =
          testMode ||
          opts.allowSelfCourier === true ||
          (typeof localStorage !== 'undefined' &&
            localStorage.getItem('sn:test-mode-v1') === '1');
        if (allowSelf) {
          goDriverOnline('Scooter');
          driver = global.SNProfiles.me();
          try {
            claim = global.SNTasks.claim(orderResult.task.id, driver || undefined);
            if (claim && claim.ok && claim.task) {
              claim.task.driverId = driver && driver.id;
              claim.task.driverName = (driver && driver.name) || 'You';
              claim.task.status = 'in_progress';
            }
            courierNote = 'No other driver nearby — you are the courier. Say deliver me when it arrives.';
            log(courierNote, 'ok');
          } catch (_) {
            courierNote = 'TEST courier assign failed · say deliver me';
            log(courierNote, 'err');
          }
        } else {
          try {
            if (orderResult.task) {
              orderResult.task.status = 'seeking_driver';
            }
          } catch (_) {}
          courierNote =
            'Seeking driver · order paid · open on mesh · go driver online nearby or wait';
          log(courierNote, 'ok');
          steps.push('seeking_driver');
          try {
            if (global.SNMeshOrders && SNMeshOrders.pullOpenOrders) {
              void SNMeshOrders.pullOpenOrders();
            }
          } catch (_) {}
        }
      }

      // Intermediate stops: other open deliveries before you
      extraStops = driverOtherStops(pos, orderResult.task && orderResult.task.id);
      eta = etaWithStops(kmBest, extraStops.length);
      if (extraStops.length) {
        log(
          'Route stops before you · ' +
            extraStops.length +
            ' · ' +
            extraStops
              .map(function (s) {
                return s.label;
              })
              .join(' · '),
          'ok'
        );
      }

      // 7) Polygon: vendor → stops → you
      try {
        if (global.SNMap && SNMap.open) {
          await SNMap.open(pos.lat, pos.lng);
          if (SNMap.ensure) await SNMap.ensure();
        }
        var waypts = [{ lat: best.lat, lng: best.lng }]
          .concat(
            extraStops.map(function (s) {
              return { lat: s.lat, lng: s.lng };
            })
          )
          .concat([{ lat: pos.lat, lng: pos.lng }]);
        if (global.SNField && SNField.startDeliveryRoute) {
          await SNField.startDeliveryRoute({
            id: 'live:' + (orderResult.task && orderResult.task.id),
            vendorLat: best.lat,
            vendorLng: best.lng,
            dropLat: pos.lat,
            dropLng: pos.lng,
            stops: extraStops,
            waypoints: waypts,
            label: '🛵 ' + String(best.shopName || best.name || 'Shop').slice(0, 14),
            driver: (driver && driver.name) || 'Courier',
            color: 'rgba(28,140,255,0.95)',
            etaMin: eta.totalMin,
          });
        } else if (global.SNField && SNField.showRoute) {
          await SNField.showRoute(waypts, {
            id: 'live:' + (orderResult.task && orderResult.task.id),
            label: '🛵 multi-stop',
            kind: 'delivery',
            osrm: true,
          });
        }
        try {
          if (global.SNMap && SNMap.open) {
            await SNMap.open(pos.lat, pos.lng, { force: true, zoom: 14, split: true, keepGlobe: true });
          }
        } catch (_) {}
        try {
          if (global.SNStage && SNStage.order) {
            SNStage.order(
              { lat: best.lat, lng: best.lng, name: best.shopName || best.name },
              { lat: pos.lat, lng: pos.lng, name: 'YOU' },
              {
                etaMin: eta.totalMin,
                stage: driver ? 'EN ROUTE' : 'SEEKING DRIVER',
                item: (menuItem && menuItem.name) || food,
              }
            );
          }
        } catch (_) {}
        if (global.SNMap && SNMap.markYou) SNMap.markYou(pos.lat, pos.lng, 'YOU · drop');
        if (global.SNMap && SNMap.showProfiles) SNMap.showProfiles();
        if (global.SNMap && SNMap.showTasks) SNMap.showTasks();
        if (global.SNMap && SNMap.fitLatLngs) {
          SNMap.fitLatLngs(waypts, { padding: 48, maxZoom: 15, force: true });
        }
        log(
          'map · vendor →' +
            (extraStops.length ? ' ' + extraStops.length + ' stops →' : '') +
            ' you · cyan route',
          'ok'
        );
      } catch (eMap) {
        log('map route · ' + (eMap.message || eMap), 'err');
      }
      steps.push('driver');

      // 8 + 9 ETA from OSRM when possible + pre-arrival notify
      try {
        if (global.SNOrderEngine && SNOrderEngine.etaForWaypoints && waypts && waypts.length >= 2) {
          var oeta = await SNOrderEngine.etaForWaypoints(waypts);
          if (oeta && oeta.ok) {
            eta = {
              totalMin: Math.max(1, Math.round((oeta.durationS || 0) / 60)),
              eatClock: oeta.eatClock,
              eatLine:
                'ETA · ' +
                Math.max(1, Math.round((oeta.durationS || 0) / 60)) +
                ' min · eat ~' +
                oeta.eatClock +
                ' · ' +
                (oeta.engine || 'route'),
              engine: oeta.engine,
              km: oeta.km,
            };
          }
        }
      } catch (_) {}
      log(eta.eatLine, 'ok');
      scheduleArrivalNotify(eta, best.shopName || best.name, {
        taskId: orderResult && orderResult.task && orderResult.task.id,
        driver: driver && (driver.name || driver.id),
      });
      log('Notify armed · alert ~5 min before arrival', 'dim');
      steps.push('eta');
    } else {
      eta = etaWithStops(kmBest, 0);
    }

    track('food_intent', {
      food: food,
      vendors: vendors.length,
      best: best && best.id,
      ordered: !!(orderResult && orderResult.ok),
      driver: driver && driver.id,
      judged: judged.itemName,
      eatAt: eta.eatClock,
      stops: extraStops.length,
      km: kmBest,
    });

    var summaryLines = [
      'LOC · ' + pos.lat.toFixed(4) + ', ' + pos.lng.toFixed(4) + (pos.fallback ? ' · soft' : ' · GPS'),
      'YOU · ' + (judged.researchNote || ''),
      'NEAR · shops ≤ ' + MAX_SHOP_KM + ' km only',
    ];
    top3.forEach(function (v, i) {
      summaryLines.push(
        (i + 1) +
          ') ' +
          (v.shopName || v.name) +
          ' · ' +
          (v._km != null ? v._km.toFixed(1) + ' km' : '') +
          ' · ' +
          (v._price != null ? Number(v._price).toFixed(2) + ' S' : '') +
          (v._rating != null ? ' · ★' + Number(v._rating).toFixed(1) : '') +
          (v._score != null ? ' · SCORE ' + Math.round(v._score) : '') +
          (v._open === false ? ' · CLOSED' : '')
      );
    });
    summaryLines.push('CHOSEN · #1 ' + (best.shopName || best.name));
    summaryLines.push(
      'ITEM · ' + (menuItem ? menuItem.name : judged.itemName) + ' · ' + fmt(menuItem ? menuItem.price : judged.price)
    );
    (judged.extras || []).forEach(function (ex) {
      summaryLines.push('EXTRA · ' + ex.name + ' · ' + fmt(ex.price));
    });
    summaryLines.push('COURIER · ' + courierNote);
    if (extraStops.length) summaryLines.push('STOPS BEFORE YOU · ' + extraStops.length);
    summaryLines.push('SERVICE · Astranov delivery (not Wolt / eFood)');
    if (orderResult && orderResult.ok) {
      summaryLines.push('PAID · ' + fmt(orderResult.total));
      if (orderResult.platformFee != null) summaryLines.push('VAULT 3% · ' + fmt(orderResult.platformFee));
      if (orderResult.driverCut != null)
        summaryLines.push(
          'DRIVER 15% · ' +
            fmt(orderResult.driverCut) +
            (completeRes && completeRes.ok ? ' · paid' : ' · on deliver')
        );
      if (orderResult.vendorCut != null)
        summaryLines.push(
          'VENDOR · ' +
            fmt(orderResult.vendorCut) +
            (completeRes && completeRes.ok ? ' · paid' : ' · on deliver')
        );
      summaryLines.push(
        completeRes && completeRes.ok ? 'STATUS · delivered · settled' : 'STATUS · paid · en route'
      );
      summaryLines.push(eta.eatLine);
    } else if (orderResult && !orderResult.ok) {
      summaryLines.push('PAY · failed · ' + (orderResult.error || 'retry'));
    } else {
      summaryLines.push('PAY · not placed · say order me ' + food);
    }

    var reply =
      orderResult && orderResult.ok
        ? 'Eat ' +
          (eta.eatClock || 'soon') +
          '. ' +
          judged.itemName +
          '. ' +
          (best.shopName || best.name) +
          (eta.totalMin ? '. Driver ' + eta.totalMin + ' min.' : '.')
        : (completeRes && completeRes.ok
            ? 'Delivered · '
            : 'Options · ') +
          judged.itemName +
          ' · ' +
          (best.shopName || best.name) +
          (orderResult && orderResult.ok ? ' · ' + eta.eatLine : ' · pick 1–3 above');

    try {
      if (global.SNAi && SNAi.setSuggestList) {
        SNAi.setSuggestList(vendors, { query: food, idx: 0 });
      }
    } catch (_) {}

    return {
      ok:
        !!(completeRes && completeRes.ok) ||
        !!(orderResult && orderResult.ok) ||
        (!intent.autoOrder && !!best),
      food: food,
      pos: pos,
      vendors: vendors,
      top3: top3,
      best: best,
      menuItem: menuItem,
      judged: judged,
      order: orderResult,
      driver: driver,
      claim: claim,
      complete: completeRes,
      stops: extraStops,
      eta: eta,
      eatLine: eta.eatLine,
      summary: summaryLines.join('\n'),
      courierNote: courierNote,
      steps: steps,
      lines: summaryLines,
      reply: reply,
    };
  }


  function verifySchedule(profile) {
    var hours = String((profile && (profile.hours || profile.opening_hours)) || '').trim();
    if (!hours || /24\s*[\/7]|24h|always|open/i.test(hours)) {
      return {
        open: true,
        label: 'OPEN · 24/7',
        hours: hours || '24/7',
        alwaysOn: true,
      };
    }
    // Heuristic: if string contains "closed" alone, treat closed; else assume open for order path
    if (/^closed$/i.test(hours) || /\bpermanently closed\b/i.test(hours)) {
      return { open: false, label: 'CLOSED (listed hours)', hours: hours, alwaysOn: false };
    }
    return {
      open: true,
      label: 'HOURS · ' + hours.slice(0, 40),
      hours: hours,
      alwaysOn: false,
    };
  }

  function parseWorkIntent(line) {
    var low = String(line || '')
      .toLowerCase()
      .trim();
    if (!low) return null;
    if (/^(go\s+to|fly|locate|pizza|sushi)/i.test(low)) return null;
    var roles = [
      { re: /\b(barman|bartender|μπαρμαν|μπαρτέντερ)\b/i, role: 'barman', title: 'Barman / bartender' },
      { re: /\b(cleaner|καθαριστ)\b/i, role: 'cleaner', title: 'Cleaner' },
      { re: /\b(nanny|babysitter)\b/i, role: 'nanny', title: 'Nanny' },
      { re: /\b(waiter|σερβιτόρ)\b/i, role: 'waiter', title: 'Waiter' },
      { re: /\b(tutor|teacher|δάσκαλ)\b/i, role: 'tutor', title: 'Tutor' },
      { re: /\b(worker|handyman|gardener|cook|chef)\b/i, role: 'worker', title: 'Worker' },
    ];
    for (var i = 0; i < roles.length; i++) {
      if (roles[i].re.test(low) || new RegExp('job\\s+' + roles[i].role).test(low) || new RegExp('hire\\s+(a\\s+)?' + roles[i].role).test(low)) {
        var dm = low.match(/(\d+(?:\.\d+)?)\s*(h|hr|hours?|d|days?)\b/);
        return {
          role: roles[i].role,
          title: roles[i].title,
          dur: dm ? dm[1] + (dm[2][0] === 'd' ? 'd' : 'h') : '3h',
          raw: line,
          place: /villa|home|house|office/i.test(low) ? 'venue' : 'local',
        };
      }
    }
    if (/^job\b|^gig\b|^hire\b|looking\s+for\s+work|need\s+a\b/.test(low)) {
      return { role: 'worker', title: 'Job', dur: '3h', raw: line, place: 'local' };
    }
    return null;
  }

  function parseDatingIntent(line) {
    var low = String(line || '')
      .toLowerCase()
      .trim();
    if (!low) return null;
    if (!/\b(date|dating|date\s*me|coffee\s*date|dinner\s*date|meet\s*(a\s*)?(woman|man|girl|guy)|available\s*woman)\b/i.test(low) && low !== 'dating')
      return null;
    var gender =
      /\b(woman|girl|female|lady)\b/i.test(low) ? 'woman' : /\b(man|guy|male)\b/i.test(low) ? 'man' : null;
    var kind = /dinner/.test(low) ? 'dinner' : /walk/.test(low) ? 'walk' : 'coffee';
    return { kind: kind, gender: gender, raw: line };
  }

  function scoreWorker(p, pos, role) {
    var score = 0;
    var blob = (
      (p.name || '') +
      ' ' +
      (p.bio || '') +
      ' ' +
      (p.skills || '') +
      ' ' +
      (p.jobTitle || '') +
      ' ' +
      (p.workerRole || '')
    ).toLowerCase();
    if (blob.indexOf(String(role || '').toLowerCase()) >= 0) score += 40;
    if (p.roles && p.roles.worker) score += 25;
    if (p.workerOnline || p.available) score += 20;
    if (p.real) score += 8;
    var km = haversineKm(pos, p);
    score += Math.max(0, 20 - km * 5);
    if (p.rating != null) score += Math.min(10, Number(p.rating));
    return { score: score, km: km };
  }

  function scoreDating(p, pos, intent) {
    var score = 0;
    if (p.roles && p.roles.dating) score += 30;
    if (p.lookingFor) score += 12;
    if (p.available !== false) score += 10;
    if (intent && intent.gender) {
      var g = String(p.gender || p.sex || p.lookingAs || '').toLowerCase();
      if (g && g.indexOf(intent.gender[0]) >= 0) score += 25;
      // Prefer profiles that match requested gender when tagged; else keep list honest
    }
    var km = haversineKm(pos, p);
    score += Math.max(0, 18 - km * 4);
    if (p.real) score += 8;
    return { score: score, km: km };
  }

  /**
   * Work offer path: barman for villa · cleaner · etc.
   * Find best listed available worker → open tile → post working offer task.
   */
  async function fulfillWorkIntent(query, opts) {
    opts = opts || {};
    var intent = typeof query === 'object' ? query : parseWorkIntent(query);
    if (!intent) return { ok: false, error: 'not a work intent' };
    var log = function (m, c) {
      try {
        if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
      } catch (_) {}
      try {
        if (global.SNAi && SNAi.say) SNAi.say(m, c || 'dim');
      } catch (_) {}
    };
    var role = intent.role || 'worker';
    var loc = pos();
    try {
      if (global.SNGlobe && SNGlobe.focusPos) {
        var f = SNGlobe.focusPos();
        if (f && f.lat != null) loc = f;
      }
    } catch (_) {}
    log('Work · finding ' + role + ' near focus…', 'dim');
    try {
      if (global.SNCommerce && SNCommerce.ensureSector) {
        await SNCommerce.ensureSector(loc.lat, loc.lng, { openMap: true });
      } else if (global.SNMap && SNMap.open) {
        await SNMap.open(loc.lat, loc.lng);
      }
    } catch (_) {}

    var workers = (global.SNProfiles.list({ role: 'worker' }) || []).concat(
      (global.SNProfiles.list() || []).filter(function (p) {
        return p.roles && (p.roles.worker || p.roles.vendor) && p.id !== (me() && me().id);
      })
    );
    // Dedupe by id
    var seen = {};
    workers = workers.filter(function (p) {
      if (!p || !p.id || seen[p.id]) return false;
      seen[p.id] = true;
      return p.lat != null && haversineKm(loc, p) < 25;
    });
    workers = workers.map(function (p) {
      var sc = scoreWorker(p, loc, role);
      return Object.assign({}, p, { _score: sc.score, _km: sc.km });
    });
    workers.sort(function (a, b) {
      return (b._score || 0) - (a._score || 0);
    });
    workers = workers.slice(0, 8);
    try {
      global.SNMap?.showProfiles?.();
      global.SNMap?.showTasks?.();
    } catch (_) {}

    var best = workers[0] || null;
    var task = null;
    try {
      task = global.SNTasks.create({
        kind: 'job',
        role: role,
        title:
          '🧰 ' +
          (intent.title || role) +
          (best ? ' · ' + best.name : '') +
          ' · ' +
          (intent.dur || '3h'),
        dur: intent.dur || '3h',
        lat: loc.lat,
        lng: loc.lng,
        raw: intent.raw || role,
        clientId: me() && me().id,
        targetId: best && best.id,
        targetName: best && best.name,
        always_on: true,
      });
    } catch (_) {}

    if (best) {
      var sched = verifySchedule(best);
      log(
        'Best ' +
          role +
          ' · ' +
          best.name +
          (best._km != null ? ' · ' + best._km.toFixed(1) + ' km' : '') +
          ' · ' +
          sched.label,
        'ok'
      );
      // no auto tile open
    } else {
      log(
        'No listed ' +
          role +
          ' online yet · offer posted for real workers · enable Worker on ME tile to appear',
        'dim'
      );
    }
    try {
      global.SNMap?.showTasks?.();
    } catch (_) {}

    track('work_intent', { role: role, workers: workers.length, best: best && best.id });
    var reply = best
      ? 'Best available ' +
        role +
        ': ' +
        best.name +
        '. Working offer open · they can claim · ' +
        (intent.dur || '3h') +
        '. Schedule: ' +
        verifySchedule(best).label +
        '.'
      : 'Working offer for ' +
        role +
        ' posted at your place (' +
        (intent.dur || '3h') +
        '). No listed workers in sector yet — real users enable Worker on their tile.';

    return {
      ok: true,
      role: role,
      pos: loc,
      workers: workers,
      best: best,
      task: task,
      schedule: best ? verifySchedule(best) : { open: true, label: 'OFFER OPEN 24/7' },
      reply: reply,
    };
  }

  /**
   * Dating path: find available dating profiles → open tile → send dating request task.
   * Zero dummy — only real profiles with dating role.
   */
  async function fulfillDatingIntent(query, opts) {
    opts = opts || {};
    var intent = typeof query === 'object' ? query : parseDatingIntent(query);
    if (!intent) return { ok: false, error: 'not a dating intent' };
    var log = function (m, c) {
      try {
        if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
      } catch (_) {}
      try {
        if (global.SNAi && SNAi.say) SNAi.say(m, c || 'dim');
      } catch (_) {}
    };
    var loc = pos();
    try {
      if (global.SNGlobe && SNGlobe.focusPos) {
        var f = SNGlobe.focusPos();
        if (f && f.lat != null) loc = f;
      }
    } catch (_) {}
    log('Dating · searching available profiles near focus…', 'dim');
    try {
      if (global.SNCommerce && SNCommerce.ensureSector) {
        await SNCommerce.ensureSector(loc.lat, loc.lng, { openMap: true });
      } else if (global.SNMap && SNMap.open) {
        await SNMap.open(loc.lat, loc.lng);
      }
    } catch (_) {}

    var people = (global.SNProfiles.list({ role: 'dating' }) || []).filter(function (p) {
      return p && p.id !== (me() && me().id) && p.lat != null && haversineKm(loc, p) < 40;
    });
    people = people.map(function (p) {
      var sc = scoreDating(p, loc, intent);
      return Object.assign({}, p, { _score: sc.score, _km: sc.km });
    });
    people.sort(function (a, b) {
      return (b._score || 0) - (a._score || 0);
    });
    people = people.slice(0, 8);
    try {
      global.SNMap?.showProfiles?.();
    } catch (_) {}

    var best = people[0] || null;
    var task = null;
    try {
      task = global.SNTasks.create({
        kind: 'dating',
        role: intent.kind || 'coffee',
        title:
          '💕 ' +
          (intent.kind === 'dinner' ? 'Dinner' : intent.kind === 'walk' ? 'Walk' : 'Coffee') +
          ' date request' +
          (best ? ' · ' + best.name : ''),
        dur: intent.kind === 'dinner' ? '3h' : '1h',
        lat: best && best.lat != null ? best.lat : loc.lat,
        lng: best && best.lng != null ? best.lng : loc.lng,
        raw: intent.raw || 'date',
        clientId: me() && me().id,
        targetId: best && best.id,
        always_on: true,
      });
    } catch (_) {}

    if (best) {
      log(
        'Available · ' +
          best.name +
          (best._km != null ? ' · ' + best._km.toFixed(1) + ' km' : '') +
          ' · dating request sent',
        'ok'
      );
      // no auto tile open
    } else {
      log(
        'No dating profiles listed nearby · enable Dating on ME tile (real users only) · request still open on map',
        'dim'
      );
    }
    try {
      global.SNMap?.showTasks?.();
    } catch (_) {}

    track('dating_intent', { people: people.length, best: best && best.id, kind: intent.kind });
    var reply = best
      ? 'Found available profile: ' +
        best.name +
        '. Dating request open — they can accept from map/tasks. Coffee/walk/dinner via same tile.'
      : 'Dating request posted. No listed profiles in sector yet — real users enable Dating on their multi-tile.';

    return {
      ok: true,
      pos: loc,
      people: people,
      best: best,
      task: task,
      intent: intent,
      reply: reply,
    };
  }

  /**
   * Seed a local testing sector around pos — real-shaped vendors + drivers
   * so first orders work without waiting on Overpass.
   */
  function seedTestSector(pos, opts) {
    opts = opts || {};
    if (!pos || pos.lat == null) {
      pos = global._snLastPos || { lat: 36.4341, lng: 28.2176 };
    }
    if (!global.SNProfiles) {
      return { ok: false, error: 'profiles not ready' };
    }
    var lat = Number(pos.lat);
    var lng = Number(pos.lng);
    try {
      global._snLastPos = { lat: lat, lng: lng, reason: 'test seed' };
      global._snPhysPos = { lat: lat, lng: lng };
      if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(lat, lng);
      var pr = loadPrefs();
      pr.verifiedLoc = { lat: lat, lng: lng, t: Date.now() };
      savePrefs(pr);
    } catch (_) {}
    var shops = [
      {
        id: 'test_v_pizza_a',
        name: 'Test · Nonna Fires',
        shopName: 'Nonna Fires',
        shopKind: 'pizza',
        dlat: 0.0042,
        dlng: 0.0028,
        rating: 4.7,
        hours: '10:00-24:00',
        menu: [
          { id: 'm1', name: 'Margherita medium', price: 9.5 },
          { id: 'm2', name: 'Diavola medium', price: 11.0 },
          { id: 'm3', name: 'Greek village large', price: 13.5 },
        ],
      },
      {
        id: 'test_v_pizza_b',
        name: 'Test · Oven 23',
        shopName: 'Oven 23',
        shopKind: 'pizza',
        dlat: -0.0031,
        dlng: 0.0045,
        rating: 4.4,
        hours: '11:00-23:30',
        menu: [
          { id: 'm1', name: 'Pepperoni medium', price: 10.5 },
          { id: 'm2', name: 'Four cheese large', price: 14.0 },
          { id: 'm3', name: 'Capricciosa medium', price: 12.0 },
        ],
      },
      {
        id: 'test_v_grill',
        name: 'Test · Gyros Corner',
        shopName: 'Gyros Corner',
        shopKind: 'grill',
        dlat: 0.0018,
        dlng: -0.0036,
        rating: 4.5,
        hours: '24/7',
        menu: [
          { id: 'm1', name: 'Pitogyro portion', price: 4.5 },
          { id: 'm2', name: 'Mpyronia plate', price: 8.0 },
          { id: 'm3', name: 'Souvlaki mix', price: 9.5 },
        ],
      },
      {
        id: 'test_v_cafe',
        name: 'Test · Mesh Cafe',
        shopName: 'Mesh Cafe',
        shopKind: 'cafe',
        dlat: -0.0024,
        dlng: -0.0019,
        rating: 4.3,
        hours: '07:00-22:00',
        menu: [
          { id: 'm1', name: 'Freddo espresso', price: 3.2 },
          { id: 'm2', name: 'Club sandwich', price: 6.5 },
          { id: 'm3', name: 'Orange juice', price: 3.0 },
        ],
      },
    ];
    var vendors = shops.map(function (s) {
      return global.SNProfiles.upsert({
        id: s.id,
        name: s.name,
        shopName: s.shopName,
        shopKind: s.shopKind,
        roles: { vendor: true },
        lat: lat + s.dlat,
        lng: lng + s.dlng,
        real: true,
        source: 'test-sector',
        hours: s.hours,
        rating: s.rating,
        menu: s.menu,
        menuReady: true,
        online: true,
      });
    });
    var drivers = [
      {
        id: 'test_d_alpha',
        name: 'Test Driver Alpha',
        vehicle: 'Scooter',
        dlat: 0.0012,
        dlng: 0.0009,
      },
      {
        id: 'test_d_beta',
        name: 'Test Driver Beta',
        vehicle: 'Bike',
        dlat: -0.0015,
        dlng: 0.0021,
      },
    ].map(function (d) {
      return global.SNProfiles.upsert({
        id: d.id,
        name: d.name,
        roles: { driver: true },
        driverOnline: true,
        vehicle: d.vehicle,
        lat: lat + d.dlat,
        lng: lng + d.dlng,
        real: true,
        source: 'test-sector',
        maxCargo: 3,
      });
    });
    try {
      var meP = me();
      if (meP) {
        meP.lat = lat;
        meP.lng = lng;
        meP.roles = meP.roles || {};
        meP.roles.client = true;
        global.SNProfiles.upsert(meP);
      }
    } catch (_) {}
    return {
      ok: true,
      vendors: vendors,
      drivers: drivers,
      pos: { lat: lat, lng: lng },
    };
  }

  /**
   * Prepare system for first testing orders.
   * Wallet · location · sector shops · drivers · mining · map.
   */
  async function prepareFirstTest(opts) {
    opts = opts || {};
    var log = function (m, c) {
      try {
        if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
      } catch (_) {}
    };
    var report = {
      ok: false,
      checks: [],
      pos: null,
      wallet: null,
      vendors: 0,
      drivers: 0,
      mining: false,
      ready: false,
    };

    log('═══ FIRST TEST ORDERS · preparing system ═══', 'ok');
    try {
      localStorage.setItem('sn:test-mode-v1', '1');
      log('· TEST MODE ON · fake sector allowed · free top-up allowed', 'dim');
    } catch (_) {}

    try {
      var meP = me();
      if (!meP && global.SNProfiles && SNProfiles.ensureMe) meP = SNProfiles.ensureMe();
      if (meP) {
        meP.roles = meP.roles || {};
        meP.roles.client = true;
        global.SNProfiles.upsert(meP);
        report.checks.push({ id: 'profile', ok: true, detail: meP.name || meP.id });
        log('✓ Profile · ' + (meP.name || meP.id) + ' · client role', 'ok');
      } else {
        report.checks.push({ id: 'profile', ok: false, detail: 'no me' });
        log('✗ Profile missing', 'err');
      }
    } catch (e) {
      report.checks.push({ id: 'profile', ok: false, detail: String(e.message || e) });
    }

    try {
      var C = global.SNCurrency;
      if (C) {
        var bal = C.balance();
        var TARGET = opts.wallet != null ? Number(opts.wallet) : 50;
        if (bal < TARGET) {
          var add = Math.round((TARGET - bal) * 100) / 100;
          C.credit(add, 'test-orders top-up');
          log(
            '✓ Wallet top-up · ' +
              (C.format ? C.format(add) : add + ' AC') +
              ' → ' +
              (C.format ? C.format(C.balance()) : C.balance()),
            'ok'
          );
        } else {
          log('✓ Wallet · ' + (C.format ? C.format(bal) : bal + ' AC'), 'ok');
        }
        report.wallet = C.balance();
        report.checks.push({ id: 'wallet', ok: true, detail: report.wallet });
      }
    } catch (eW) {
      report.checks.push({ id: 'wallet', ok: false, detail: String(eW.message || eW) });
      log('✗ Wallet · ' + (eW.message || eW), 'err');
    }

    var pos = opts.pos || null;
    if (!pos || pos.lat == null) {
      try {
        if (global.SNCli && SNCli.gpsLocate) pos = await SNCli.gpsLocate();
      } catch (_) {}
    }
    if ((!pos || pos.lat == null) && global._snPhysPos) pos = global._snPhysPos;
    if ((!pos || pos.lat == null) && global._snLastPos) pos = global._snLastPos;
    if (!pos || pos.lat == null) {
      pos = {
        lat: 37.9315,
        lng: 23.755,
        fallback: true,
        reason: 'test default · Athens Ilioupoli sector',
      };
      log('· GPS quiet · using test sector pin (Ilioupoli) · type locate to override', 'dim');
    }
    global._snLastPos = { lat: pos.lat, lng: pos.lng, reason: 'test-ready' };
    global._snPhysPos = global._snPhysPos || { lat: pos.lat, lng: pos.lng };
    try {
      if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(pos.lat, pos.lng);
    } catch (_) {}
    try {
      var pr = loadPrefs();
      pr.verifiedLoc = { lat: pos.lat, lng: pos.lng, t: Date.now() };
      savePrefs(pr);
    } catch (_) {}
    report.pos = { lat: pos.lat, lng: pos.lng, fallback: !!pos.fallback, reason: pos.reason };
    report.checks.push({
      id: 'location',
      ok: true,
      detail: pos.lat.toFixed(4) + ',' + pos.lng.toFixed(4),
    });
    log(
      '✓ Location · ' +
        pos.lat.toFixed(5) +
        ', ' +
        pos.lng.toFixed(5) +
        (pos.fallback ? ' · soft' : ' · GPS'),
      'ok'
    );

    try {
      if (global.SNMap && SNMap.open) {
        await SNMap.open(pos.lat, pos.lng);
        if (SNMap.ensure) await SNMap.ensure();
        if (SNMap.markYou) SNMap.markYou(pos.lat, pos.lng, 'YOU · test drop');
      }
      report.checks.push({ id: 'map', ok: true });
      log('✓ City map open on your pin', 'ok');
    } catch (eM) {
      report.checks.push({ id: 'map', ok: false, detail: String(eM.message || eM) });
      log('· Map · ' + (eM.message || eM), 'dim');
    }

    var seed = seedTestSector(pos, { food: opts.food || 'pizza' });
    report.vendors = (seed.vendors || []).length;
    report.drivers = (seed.drivers || []).length;
    report.checks.push({
      id: 'sector',
      ok: seed.ok,
      detail: report.vendors + ' shops · ' + report.drivers + ' drivers',
    });
    log(
      '✓ Test sector · ' +
        report.vendors +
        ' shops · ' +
        report.drivers +
        ' drivers online within ~0.5 km',
      'ok'
    );
    try {
      if (global.SNMap && SNMap.showProfiles) SNMap.showProfiles();
    } catch (_) {}

    try {
      if (global.SNResources) {
        if (SNResources.checkTerms && SNResources.checkTerms()) {
          if (SNResources.setDonate) SNResources.setDonate(true);
          if (SNResources.setMining) SNResources.setMining(true);
          report.mining = true;
          log('✓ Mining · ON (mesh terms already accepted)', 'ok');
        } else {
          report.mining = false;
          log('· Mining · accept terms via ASTRANOV hub or mine on', 'dim');
        }
        report.checks.push({
          id: 'mining',
          ok: true,
          detail: report.mining ? 'on' : 'pending terms',
        });
      }
    } catch (_) {}

    try {
      clearPending('test-ready');
    } catch (_) {}

    report.ready =
      report.wallet != null &&
      report.wallet >= 5 &&
      report.vendors >= 2 &&
      report.drivers >= 1 &&
      report.pos != null;
    report.ok = report.ready;

    log('───────────────────────────────────', 'dim');
    if (report.ready) {
      log('READY FOR FIRST TEST ORDERS', 'ok');
      log('Try:  order me a pizza', 'ok');
      log('Try:  order pitogyra mpyronia', 'ok');
      log('Try:  test order', 'ok');
      log('After paid:  deliver me  · or watch courier on map', 'dim');
      log('Cancel stuck:  cancel', 'dim');
    } else {
      log('Not fully ready · check ✗ lines above', 'err');
    }

    try {
      if (global.SNCli && SNCli.preview)
        SNCli.preview(
          report.ready
            ? 'Test ready · ' + report.vendors + ' shops · wallet ' + Number(report.wallet).toFixed(0)
            : 'Test prep incomplete'
        );
      if (global.SNField && SNField.paint) SNField.paint();
    } catch (_) {}

    track('test_orders_ready', {
      ready: report.ready,
      vendors: report.vendors,
      drivers: report.drivers,
      wallet: report.wallet,
    });
    return report;
  }

  /**
   * One-shot: prepare + auto pizza order for first live test.
   */
  async function runTestOrder(opts) {
    opts = opts || {};
    var prep = await prepareFirstTest(opts);
    if (!prep.ready && !opts.force) {
      return {
        ok: false,
        prep: prep,
        error: 'system not ready · fix checks then retry',
        reply: 'Test prep incomplete. Type test ready and check CLI.',
      };
    }
    var line =
      opts.line ||
      'ORDER ME A PIZZA YOU JUDGE THE TYPE SIZE VENDOR DELIVERY GUY AND WHATEVER ELSE AND TELL ME WHAT TIME I EAT';
    var result = await fulfillFoodIntent(line, {
      softHome: true,
      autoOrder: true,
      skipLocConfirm: true,
      quiet: false,
      testMode: true,
      allowSelfCourier: true,
    });
    return {
      ok: !!(result && result.ok),
      prep: prep,
      order: result,
      reply:
        (result && (result.eatLine || result.reply || result.summary)) ||
        (result && result.error) ||
        'test order finished',
    };
  }

  /**
   * Public live readiness checklist — honest status for go-live.
   */
  function goLiveStatus() {
    var report = {
      ok: false,
      live: true,
      checks: [],
      blockers: [],
      tips: [],
    };
    function add(id, ok, detail, block) {
      report.checks.push({ id: id, ok: !!ok, detail: detail || '' });
      if (!ok && block) report.blockers.push(block);
    }
    try {
      var C = global.SNCurrency;
      var bal = C && C.balance ? C.balance() : 0;
      var vault = C && C.platformFees ? C.platformFees() : 0;
      add('wallet', bal >= 0, 'AC ' + Number(bal).toFixed(2) + ' · vault ' + Number(vault).toFixed(2), null);
      if (bal < 5) report.tips.push('Mine AC or receive pay · wallet low for first order');
    } catch (e) {
      add('wallet', false, String(e.message || e), 'currency offline');
    }
    try {
      var pos =
        global._snPhysPos ||
        global._snLastPos ||
        (global.SNTasks && SNTasks.pos) ||
        null;
      add(
        'location',
        !!(pos && pos.lat != null),
        pos ? Number(pos.lat).toFixed(4) + ',' + Number(pos.lng).toFixed(4) : 'none',
        'type locate'
      );
    } catch (_) {
      add('location', false, 'error', 'type locate');
    }
    try {
      var vendors = (global.SNProfiles && SNProfiles.list({ role: 'vendor' })) || [];
      var near = vendors.filter(function (v) {
        return v && v.lat != null && v.source !== 'astranov-kitchen-test';
      });
      add(
        'vendors',
        near.length >= 1,
        near.length + ' real/crawled shops',
        'fill shops · google shops near your pin'
      );
    } catch (_) {
      add('vendors', false, '0', 'fill shops');
    }
    try {
      var drivers = ((global.SNProfiles && SNProfiles.list({ role: 'driver' })) || []).filter(
        function (d) {
          return d && d.driverOnline;
        }
      );
      add(
        'drivers',
        drivers.length >= 1,
        drivers.length + ' online',
        'drivers must go online · or mesh seeking_driver'
      );
      report.tips.push(
        drivers.length
          ? 'Drivers online · assign will pick nearest lightest cargo'
          : 'No online drivers · paid orders wait as seeking_driver (not auto-fake-deliver)'
      );
    } catch (_) {
      add('drivers', false, '0', 'need drivers online');
    }
    try {
      var auth = global.SNAuth;
      var signed = !!(auth && auth.user);
      add(
        'auth',
        true,
        signed ? 'signed in · astranov.eu' : 'guest OK for local · Google for multi-user',
        null
      );
      if (!signed) {
        report.tips.push(
          'Google login: fix OAuth origins in Google Cloud (auth setup) for all users'
        );
      }
    } catch (_) {}
    try {
      var testOn =
        typeof localStorage !== 'undefined' && localStorage.getItem('sn:test-mode-v1') === '1';
      add(
        'test_mode',
        !testOn,
        testOn ? 'ON · type live mode to disable fake sector' : 'OFF · public live path',
        testOn ? 'type live mode' : null
      );
    } catch (_) {}
    try {
      add(
        'economy',
        true,
        'no free order top-up · 3% vault-only · cancel refunds · settle pays me-only roles',
        null
      );
    } catch (_) {}

    report.ok = report.blockers.length === 0;
    report.summary = report.ok
      ? 'LIVE PATH READY · locate · fill shops · order · drivers claim'
      : 'LIVE GAPS · ' + report.blockers.join(' · ');
    return report;
  }

  function setLiveMode(on) {
    try {
      if (on) {
        localStorage.removeItem('sn:test-mode-v1');
      } else {
        localStorage.setItem('sn:test-mode-v1', '1');
      }
    } catch (_) {}
    return { ok: true, testMode: !on, live: !!on };
  }

  load();

  global.SNMarket = {
    isShopOpenNow: isShopOpenNow,
    listShop: listShop,
    addMenuItem: addMenuItem,
    orderFromMyShop: orderFromMyShop,
    goDriverOnline: goDriverOnline,
    claimAndComplete: claimAndComplete,
    runFirstLoop: runFirstLoop,
    coachStart: coachStart,
    coachStatus: coachStatus,
    handleChat: handleChat,
    parseFoodIntent: parseFoodIntent,
    fulfillFoodIntent: fulfillFoodIntent,
    confirmLocationAndOrder: confirmLocationAndOrder,
    clearPending: clearPending,
    isLocConfirmLine: isLocConfirmLine,
    prepareFirstTest: prepareFirstTest,
    seedTestSector: seedTestSector,
    runTestOrder: runTestOrder,
    goLiveStatus: goLiveStatus,
    setLiveMode: setLiveMode,
    loadPrefs: loadPrefs,
    savePrefs: savePrefs,
    loadPending: loadPending,
    parseWorkIntent: parseWorkIntent,
    fulfillWorkIntent: fulfillWorkIntent,
    parseDatingIntent: parseDatingIntent,
    fulfillDatingIntent: fulfillDatingIntent,
    verifySchedule: verifySchedule,
    get step() {
      return W.step;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
