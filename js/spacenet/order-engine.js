/* SNOrderEngine — non-UI delivery spine (FINISH-333)
 * State machine · event log · idempotent pay hooks · open-hours · geo fence
 * · ETA from SNRouting · rate limit · kill switch · readiness score
 */
(function (g) {
  'use strict';

  var STATES = [
    'draft',
    'paid',
    'seeking_driver',
    'assigned',
    'picked_up',
    'en_route',
    'delivered',
    'settled',
    'cancelled',
  ];
  var LS_LOG = 'sn:order-events-v1';
  var LS_IDEMP = 'sn:order-idempo-v1';
  var LS_KILL = 'sn:orders-paused';
  var MAX_SHOP_KM = 6;
  var SEEKING_TTL_MS = 45 * 60 * 1000;
  var RATE_MAX = 5;
  var RATE_WIN = 60 * 1000;
  var rateBucket = [];

  function now() {
    return Date.now();
  }

  function loadJson(k, d) {
    try {
      var r = JSON.parse(localStorage.getItem(k) || 'null');
      return r == null ? d : r;
    } catch (_) {
      return d;
    }
  }
  function saveJson(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (_) {}
  }

  function ordersPaused() {
    try {
      return localStorage.getItem(LS_KILL) === '1';
    } catch (_) {
      return false;
    }
  }
  function setOrdersPaused(on) {
    try {
      if (on) localStorage.setItem(LS_KILL, '1');
      else localStorage.removeItem(LS_KILL);
    } catch (_) {}
    return { ok: true, paused: !!on };
  }

  function rateAllow() {
    var t = now();
    rateBucket = rateBucket.filter(function (x) {
      return t - x < RATE_WIN;
    });
    if (rateBucket.length >= RATE_MAX) return false;
    rateBucket.push(t);
    return true;
  }

  function haversineKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 999;
    var R = 6371;
    var dLat = ((b.lat - a.lat) * Math.PI) / 180;
    var dLng = ((b.lng - a.lng) * Math.PI) / 180;
    var la1 = (a.lat * Math.PI) / 180;
    var la2 = (b.lat * Math.PI) / 180;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  /** Continent sanity: user in Greece-ish must not order USA shops */
  function geoSane(user, shop) {
    if (!user || !shop) return { ok: false, error: 'missing geo' };
    var km = haversineKm(user, shop);
    if (km > MAX_SHOP_KM + 0.5) return { ok: false, error: 'shop outside ' + MAX_SHOP_KM + ' km', km: km };
    // crude: lon sign / continent jump
    if (Math.abs(user.lng - shop.lng) > 20 || Math.abs(user.lat - shop.lat) > 15) {
      return { ok: false, error: 'shop continent mismatch', km: km };
    }
    return { ok: true, km: km };
  }

  function isOpenNow(vendor, at) {
    at = at || new Date();
    if (g.SNMarket && typeof g.SNMarket.isShopOpenNow === 'function') {
      try {
        return !!g.SNMarket.isShopOpenNow(vendor);
      } catch (_) {}
    }
    // hours string "Mo-Su 10:00-23:00" rough or empty=assume open
    var h = (vendor && (vendor.hours || vendor.opening_hours || '')) + '';
    if (!h || /24\/7|24 hours|open/i.test(h)) return true;
    if (/closed|κλειστ/i.test(h) && !/\d/.test(h)) return false;
    return true; // unknown → allow (shops module enriches later)
  }

  function pushEvent(orderId, from, to, meta) {
    var log = loadJson(LS_LOG, []);
    log.push({
      id: orderId,
      from: from || null,
      to: to,
      t: now(),
      meta: meta || {},
    });
    if (log.length > 500) log = log.slice(-500);
    saveJson(LS_LOG, log);
    return log[log.length - 1];
  }

  function events(orderId) {
    var log = loadJson(LS_LOG, []);
    if (!orderId) return log.slice(-50);
    return log.filter(function (e) {
      return e.id === orderId;
    });
  }

  function idempoGet(key) {
    var m = loadJson(LS_IDEMP, {});
    return m[key] || null;
  }
  function idempoSet(key, result) {
    var m = loadJson(LS_IDEMP, {});
    m[key] = { t: now(), result: result };
    // prune
    var keys = Object.keys(m);
    if (keys.length > 80) {
      keys
        .sort(function (a, b) {
          return (m[a].t || 0) - (m[b].t || 0);
        })
        .slice(0, keys.length - 80)
        .forEach(function (k) {
          delete m[k];
        });
    }
    saveJson(LS_IDEMP, m);
  }

  function transition(task, next, meta) {
    if (!task) return { ok: false, error: 'no task' };
    var cur = task.status || 'draft';
    // map legacy
    if (cur === 'open') cur = 'seeking_driver';
    if (cur === 'claimed' || cur === 'in_progress') cur = cur === 'claimed' ? 'assigned' : 'en_route';
    if (cur === 'done') cur = task.settled ? 'settled' : 'delivered';
    task.status = next;
    task.statusAt = now();
    pushEvent(task.id, cur, next, meta);
    try {
      if (g.SNTasks && SNTasks.save) SNTasks.save();
    } catch (_) {}
    return { ok: true, task: task, from: cur, to: next };
  }

  async function etaForWaypoints(waypoints) {
    if (g.SNRouting && SNRouting.route) {
      try {
        var r = await SNRouting.route(waypoints);
        return {
          ok: true,
          km: r.km,
          durationS: r.durationS,
          engine: r.engine,
          points: r.points,
          eatClock: new Date(now() + (r.durationS || 0) * 1000).toLocaleTimeString(),
        };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    }
    return { ok: false, error: 'no routing' };
  }

  function expireSeeking() {
    if (!g.SNTasks || !SNTasks.list) return { expired: 0 };
    var n = 0;
    var list = SNTasks.list({ all: true }) || [];
    list.forEach(function (t) {
      if (!t || t.kind !== 'delivery') return;
      if (t.status !== 'seeking_driver' && t.status !== 'open') return;
      var age = now() - (t.statusAt || t.created || t.t || 0);
      if (age > SEEKING_TTL_MS) {
        try {
          if (g.SNProfiles && SNProfiles.cancelOrder) {
            SNProfiles.cancelOrder(t.id, { reason: 'seeking_ttl' });
          } else {
            t.status = 'cancelled';
            pushEvent(t.id, 'seeking_driver', 'cancelled', { why: 'ttl' });
          }
          n++;
        } catch (_) {}
      }
    });
    return { expired: n };
  }

  function preflightOrder(opts) {
    opts = opts || {};
    if (ordersPaused()) return { ok: false, error: 'orders paused · kill switch' };
    if (!rateAllow()) return { ok: false, error: 'rate limit · max ' + RATE_MAX + '/min' };
    var pos = opts.pos;
    var vendor = opts.vendor;
    if (!pos || pos.lat == null) return { ok: false, error: 'need location' };
    if (!vendor) return { ok: false, error: 'need vendor' };
    var gok = geoSane(pos, vendor);
    if (!gok.ok) return gok;
    if (!isOpenNow(vendor)) return { ok: false, error: 'vendor closed now', vendor: vendor.id };
    var testMode = !!opts.testMode;
    if (!testMode && vendor.id && String(vendor.id).indexOf('kitchen_') === 0) {
      return { ok: false, error: 'synthetic kitchen blocked in live' };
    }
    if (opts.idempotencyKey) {
      var prev = idempoGet(opts.idempotencyKey);
      if (prev && prev.result) return { ok: true, replay: true, result: prev.result };
    }
    return { ok: true, km: gok.km };
  }

  function afterPaid(orderResult, meta) {
    meta = meta || {};
    if (!orderResult || !orderResult.ok || !orderResult.task) return orderResult;
    var task = orderResult.task;
    transition(task, 'paid', { total: orderResult.total });
    if (meta.seeking) transition(task, 'seeking_driver', {});
    try {
      if (g.SNMeshOrders && SNMeshOrders.afterLocalOrder) {
        void SNMeshOrders.afterLocalOrder(orderResult, meta);
      }
    } catch (_) {}
    if (meta.idempotencyKey) idempoSet(meta.idempotencyKey, { taskId: task.id, total: orderResult.total });
    return orderResult;
  }

  function readiness() {
    var checks = [];
    function add(id, ok, detail) {
      checks.push({ id: id, ok: !!ok, detail: detail || '' });
    }
    add('routing', !!(g.SNRouting && SNRouting.route), 'SNRouting');
    add('market', !!(g.SNMarket && SNMarket.fulfillFoodIntent), 'SNMarket');
    add('currency', !!(g.SNCurrency && SNCurrency.balance), 'wallet');
    add('tasks', !!(g.SNTasks && SNTasks.create), 'tasks');
    add('profiles', !!(g.SNProfiles && SNProfiles.placeOrder), 'profiles');
    add('mesh', !!(g.SNMeshOrders && SNMeshOrders.afterLocalOrder), 'mesh');
    add('channel', !!(g.SNChannel && SNChannel.pickBestDriver), 'drivers');
    add('orders_live', !ordersPaused(), ordersPaused() ? 'PAUSED' : 'accepting');
    var bal = 0;
    try {
      bal = g.SNCurrency.balance();
    } catch (_) {}
    add('wallet_nonneg', bal >= 0, String(bal));
    var gps = !!(g._snLastPos && g._snLastPos.lat != null);
    add('last_pos', gps, gps ? 'pin set' : 'no pin');
    var score = Math.round((checks.filter(function (c) { return c.ok; }).length / checks.length) * 100);
    return { score: score, checks: checks, at: now() };
  }

  // periodic seeking expiry
  try {
    setInterval(function () {
      try {
        expireSeeking();
      } catch (_) {}
    }, 60000);
  } catch (_) {}

  g.SNOrderEngine = {
    STATES: STATES,
    MAX_SHOP_KM: MAX_SHOP_KM,
    haversineKm: haversineKm,
    geoSane: geoSane,
    isOpenNow: isOpenNow,
    preflightOrder: preflightOrder,
    afterPaid: afterPaid,
    transition: transition,
    events: events,
    pushEvent: pushEvent,
    etaForWaypoints: etaForWaypoints,
    expireSeeking: expireSeeking,
    readiness: readiness,
    ordersPaused: ordersPaused,
    setOrdersPaused: setOrdersPaused,
    rateAllow: rateAllow,
  };
})(typeof window !== 'undefined' ? window : globalThis);
