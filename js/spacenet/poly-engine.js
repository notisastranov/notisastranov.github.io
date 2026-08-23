/**
 * SNPolyEngine — ultimate multi-task delivery polygon engine
 * Owner law 2026-08-10:
 *  - Multi-vendor multi-order unified tour polygon
 *  - Vendor prep times → non-stop driver cycle (minimize wait)
 *  - Capacity / hot-cold priority / spiral routing / profit max
 *  - Driver prefs + schedule + auto-accept rules via CLI/AI (no menu maze)
 *  - Manual pin reorder when not route-locked
 */
(function (global) {
  'use strict';

  var LS_PROFILE = 'sn:driver-profile-v1';
  var LS_TOUR = 'sn:active-tour-v1';
  var AVG_KMH = 22;
  var SERVICE_MIN = 3; // stop service time

  function now() {
    return Date.now();
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
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function bearingDeg(a, b) {
    var φ1 = (a.lat * Math.PI) / 180;
    var φ2 = (b.lat * Math.PI) / 180;
    var Δλ = ((b.lng - a.lng) * Math.PI) / 180;
    var y = Math.sin(Δλ) * Math.cos(φ2);
    var x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    var θ = (Math.atan2(y, x) * 180) / Math.PI;
    return (θ + 360) % 360;
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

  function defaultProfile() {
    return {
      capacitySlots: 3.5,
      autoAccept: {
        on: false,
        minPrice: 4,
        maxKm: 18,
        minKm: 0,
        natures: [], // empty = all allowed
        goods: [],
        bearing: null, // 'N'|'E'|'S'|'W'|null
        areas: [],
      },
      prefs: {
        distance: 'any', // any|city|long
        cityMaxKm: 5,
        longMinKm: 6,
        goods: [], // preferred natures
        avoidGoods: [],
        priorityAreas: [], // {lat,lng,rKm,name}
      },
      schedule: {
        start: '09:00',
        end: '21:00',
        breaks: [], // {from:'13:00',to:'13:30'}
        endLat: null,
        endLng: null,
        endName: 'Home base',
      },
    };
  }

  function getProfile() {
    var p = loadJson(LS_PROFILE, null);
    if (!p) p = defaultProfile();
    // merge missing keys
    var d = defaultProfile();
    p.autoAccept = Object.assign({}, d.autoAccept, p.autoAccept || {});
    p.prefs = Object.assign({}, d.prefs, p.prefs || {});
    p.schedule = Object.assign({}, d.schedule, p.schedule || {});
    if (p.capacitySlots == null) p.capacitySlots = d.capacitySlots;
    return p;
  }

  function setProfile(patch) {
    var p = getProfile();
    if (!patch) return p;
    if (patch.autoAccept) p.autoAccept = Object.assign({}, p.autoAccept, patch.autoAccept);
    if (patch.prefs) p.prefs = Object.assign({}, p.prefs, patch.prefs);
    if (patch.schedule) p.schedule = Object.assign({}, p.schedule, patch.schedule);
    if (patch.capacitySlots != null) p.capacitySlots = Number(patch.capacitySlots);
    saveJson(LS_PROFILE, p);
    ops('Driver profile saved');
    return p;
  }

  function ops(msg) {
    try {
      if (global.SNCli && SNCli.ops) SNCli.ops(String(msg).slice(0, 140));
    } catch (_) {}
  }

  function parseHHMM(s) {
    var m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function minutesNow() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function inSchedule(profile, tMin) {
    tMin = tMin != null ? tMin : minutesNow();
    var s = profile.schedule || {};
    var a = parseHHMM(s.start);
    var b = parseHHMM(s.end);
    if (a != null && tMin < a) return { ok: false, reason: 'Before shift start ' + s.start };
    if (b != null && tMin > b) return { ok: false, reason: 'After shift end ' + s.end };
    var breaks = s.breaks || [];
    for (var i = 0; i < breaks.length; i++) {
      var f = parseHHMM(breaks[i].from);
      var t = parseHHMM(breaks[i].to);
      if (f != null && t != null && tMin >= f && tMin < t)
        return { ok: false, reason: 'Break ' + breaks[i].from + '–' + breaks[i].to };
    }
    return { ok: true };
  }

  function detectNature(order) {
    try {
      if (global.SNDeliveryRules && SNDeliveryRules.detectNature)
        return SNDeliveryRules.detectNature(order.nature || order.title || order.product || '');
    } catch (_) {}
    var t = String(order.nature || order.title || '').toLowerCase();
    if (/ice|gelato|frozen/.test(t)) return { id: 'frozen', temp: 'frozen', stackWeight: 1.2, windowMin: 20 };
    if (/cold|chill|dairy/.test(t)) return { id: 'cold', temp: 'cold', stackWeight: 0.85, windowMin: 45 };
    if (/hot|pizza|gyro|food/.test(t)) return { id: 'hot_food', temp: 'hot', stackWeight: 0.7, windowMin: 35 };
    if (/mail|paper|envelope|document/.test(t))
      return { id: 'documents', temp: 'ambient', stackWeight: 0.05, windowMin: 180 };
    if (/grocery|market|supermarket/.test(t))
      return { id: 'grocery', temp: 'mixed', stackWeight: 0.55, windowMin: 75 };
    return { id: 'ambient', temp: 'ambient', stackWeight: 0.35, windowMin: 90 };
  }

  function stackWeight(order) {
    var n = detectNature(order);
    if (order.stackWeight != null) return Number(order.stackWeight);
    // supermarket bulk → exclusive
    if (/supermarket|full cart|bulk/i.test(String(order.nature || order.title || ''))) return 3.6;
    return n.stackWeight || 0.5;
  }

  function prepMin(order) {
    if (order.prepMin != null) return Number(order.prepMin);
    var n = detectNature(order);
    // defaults by nature
    if (n.id === 'hot_food') return 12;
    if (n.id === 'frozen') return 5;
    if (n.id === 'cold') return 8;
    if (n.id === 'grocery') return 18;
    if (n.id === 'documents') return 2;
    return 10;
  }

  function prepReadyAt(order, baseMs) {
    baseMs = baseMs || now();
    if (order.prepReadyAt) return Number(order.prepReadyAt);
    return baseMs + prepMin(order) * 60000;
  }

  function capacityCheck(load, candidate, profile) {
    profile = profile || getProfile();
    try {
      if (global.SNDeliveryRules && SNDeliveryRules.capacityCheck) {
        var r = SNDeliveryRules.capacityCheck(load, candidate);
        if (!r.ok) return r;
      }
    } catch (_) {}
    var weight = 0;
    load.forEach(function (j) {
      weight += stackWeight(j);
    });
    weight += stackWeight(candidate);
    var cap = Number(profile.capacitySlots) || 3.5;
    if (weight > cap + 0.01) {
      return {
        ok: false,
        reason: 'Carrying capacity full · ' + weight.toFixed(2) + ' / ' + cap,
        weight: weight,
      };
    }
    // exclusive supermarket / private
    if (stackWeight(candidate) >= cap - 0.05 && load.length > 0) {
      return { ok: false, reason: 'Bulk order · exclusive straight run', exclusive: true };
    }
    if (candidate.routeLocked || (candidate.quote && candidate.quote.private)) {
      if (load.length > 0) return { ok: false, reason: 'Private/straight · exclusive capacity' };
    }
    for (var i = 0; i < load.length; i++) {
      if (load[i].routeLocked || (load[i].quote && load[i].quote.private))
        return { ok: false, reason: 'Active private run · no combine' };
    }
    return { ok: true, weight: weight, cap: cap };
  }

  function preferenceScore(order, profile, driverPos) {
    profile = profile || getProfile();
    var score = 0;
    var notes = [];
    var km = Number(order.km) || 0;
    var price = Number(order.price) || 0;
    var aa = profile.autoAccept || {};
    var prefs = profile.prefs || {};
    var n = detectNature(order);

    // profit density
    score += price * 12;
    if (km > 0) score += (price / km) * 8;

    // distance prefs
    if (prefs.distance === 'city') {
      if (km <= (prefs.cityMaxKm || 5)) score += 40;
      else score -= 50;
    } else if (prefs.distance === 'long') {
      if (km >= (prefs.longMinKm || 6)) score += 45;
      else score -= 25;
    }

    // goods prefs
    if ((prefs.goods || []).length) {
      if (prefs.goods.indexOf(n.id) >= 0) {
        score += 35;
        notes.push('pref goods');
      } else score -= 15;
    }
    if ((prefs.avoidGoods || []).indexOf(n.id) >= 0) {
      score -= 80;
      notes.push('avoid goods');
    }

    // bearing preference (east of island etc.)
    if (aa.bearing && driverPos && order.vLat != null) {
      var br = bearingDeg(driverPos, { lat: order.vLat, lng: order.vLng });
      var want = { N: 0, E: 90, S: 180, W: 270 }[aa.bearing];
      if (want != null) {
        var diff = Math.abs(((br - want + 540) % 360) - 180);
        // 0 = perfect, 180 = opposite
        score += (90 - diff) * 0.4;
        if (diff < 50) notes.push('bearing ' + aa.bearing);
      }
    }

    // priority areas
    (prefs.priorityAreas || []).forEach(function (a) {
      if (!a || a.lat == null) return;
      var d = haversineKm(a, { lat: order.vLat, lng: order.vLng });
      if (d <= (a.rKm || 3)) {
        score += 30;
        notes.push(a.name || 'area');
      }
    });

    // temp urgency priority
    if (n.temp === 'hot' || n.temp === 'frozen' || n.temp === 'cold') {
      score += 55;
      notes.push('temp priority');
    }

    // auto-accept gates (hard)
    if (aa.minPrice != null && price < aa.minPrice) {
      score -= 200;
      notes.push('below min price');
    }
    if (aa.maxKm != null && km > aa.maxKm) {
      score -= 200;
      notes.push('over max km');
    }
    if (aa.minKm != null && km < aa.minKm) {
      score -= 80;
    }
    if ((aa.natures || []).length && aa.natures.indexOf(n.id) < 0) {
      score -= 200;
      notes.push('nature filter');
    }

    return { score: score, notes: notes, nature: n };
  }

  /**
   * Build pickup/drop legs from orders
   */
  function orderLegs(order) {
    var n = detectNature(order);
    return {
      orderId: order.id,
      vendorName: order.vendorName,
      clientName: order.clientName,
      nature: n,
      prepReadyAt: prepReadyAt(order),
      prepMin: prepMin(order),
      pickup: {
        id: order.id + ':P',
        orderId: order.id,
        role: 'pickup',
        name: (order.vendorName || 'Vendor') + ' · pickup',
        lat: Number(order.vLat),
        lng: Number(order.vLng),
        locked: !!order.routeLocked,
        readyAt: prepReadyAt(order),
      },
      drop: {
        id: order.id + ':D',
        orderId: order.id,
        role: 'drop',
        name: (order.clientName || 'Client') + ' · drop',
        lat: Number(order.dLat),
        lng: Number(order.dLng),
        locked: !!order.routeLocked,
      },
      price: Number(order.price) || 0,
      routeLocked: !!order.routeLocked,
      exclusive: stackWeight(order) >= 3.4 || !!order.routeLocked,
    };
  }

  function travelMin(a, b, kmh) {
    kmh = kmh || AVG_KMH;
    var km = haversineKm(a, b);
    return (km / kmh) * 60;
  }

  /**
   * Spiral multi-order sequencer:
   * 1) private/exclusive first as solo tour
   * 2) else cheapest-insertion of pickups then drops with:
   *    - pickup before drop per order
   *    - minimize vendor wait (arrive ≥ prepReady)
   *    - angular spiral preference from driver heading
   *    - hot/cold priority early in tour
   */
  function buildTour(orders, opts) {
    opts = opts || {};
    var profile = getProfile();
    var driver = opts.driver || pos();
    var t0 = opts.t0 || now();
    orders = (orders || []).filter(Boolean);
    if (!orders.length) return { stops: [], km: 0, waitMin: 0, profit: 0, orders: [] };

    // Exclusive solo
    for (var i = 0; i < orders.length; i++) {
      var leg0 = orderLegs(orders[i]);
      if (leg0.exclusive && orders.length > 1) {
        // only that order in tour
        orders = [orders[i]];
        break;
      }
    }

    var legs = orders.map(orderLegs);
    // Priority sort seed: temp urgency then prep soonest
    legs.sort(function (a, b) {
      var ta = a.nature.temp === 'frozen' ? 0 : a.nature.temp === 'hot' ? 1 : a.nature.temp === 'cold' ? 2 : 3;
      var tb = b.nature.temp === 'frozen' ? 0 : b.nature.temp === 'hot' ? 1 : b.nature.temp === 'cold' ? 2 : 3;
      if (ta !== tb) return ta - tb;
      return a.prepReadyAt - b.prepReadyAt;
    });

    // Start with highest priority order as seed
    var seq = [];
    var placed = {};
    function placeOrder(leg) {
      if (placed[leg.orderId]) return;
      // insert pickup then drop with cheapest insertion respecting ready time
      if (!seq.length) {
        seq.push(leg.pickup);
        seq.push(leg.drop);
        placed[leg.orderId] = true;
        return;
      }
      // find best pickup insertion index
      var best = { cost: Infinity, pIdx: seq.length, dIdx: seq.length + 1 };
      for (var p = 0; p <= seq.length; p++) {
        for (var d = p + 1; d <= seq.length + 1; d++) {
          var trial = seq.slice();
          trial.splice(p, 0, leg.pickup);
          trial.splice(d, 0, leg.drop);
          var cost = evalSequence(trial, driver, t0).cost;
          // spiral bonus: prefer same angular sector
          if (seq.length) {
            var last = seq[Math.max(0, p - 1)] || driver;
            var br = bearingDeg(last, leg.pickup);
            var spiral = Math.cos((br * Math.PI) / 180); // prefer forward-ish
            cost -= spiral * 0.15;
          }
          if (cost < best.cost) best = { cost: cost, pIdx: p, dIdx: d, trial: trial };
        }
      }
      if (best.trial) seq = best.trial;
      else {
        seq.push(leg.pickup);
        seq.push(leg.drop);
      }
      placed[leg.orderId] = true;
    }

    legs.forEach(placeOrder);

    // 2-opt light polish (respect pickup-before-drop + locked pairs)
    seq = polish2opt(seq, driver, t0);

    var ev = evalSequence(seq, driver, t0);
    var tour = {
      id: 'tour:' + Date.now().toString(36),
      t: t0,
      stops: seq,
      km: Math.round(ev.km * 100) / 100,
      waitMin: Math.round(ev.waitMin * 10) / 10,
      driveMin: Math.round(ev.driveMin * 10) / 10,
      totalMin: Math.round(ev.totalMin * 10) / 10,
      profit: orders.reduce(function (s, o) {
        return s + (Number(o.price) || 0);
      }, 0),
      orders: orders.map(function (o) {
        return o.id;
      }),
      cost: ev.cost,
      timeline: ev.timeline,
    };
    saveJson(LS_TOUR, { id: tour.id, orders: tour.orders, stops: tour.stops, km: tour.km, t: tour.t });
    return tour;
  }

  function evalSequence(seq, driver, t0) {
    var t = t0;
    var cur = driver;
    var km = 0;
    var waitMin = 0;
    var driveMin = 0;
    var timeline = [];
    for (var i = 0; i < seq.length; i++) {
      var st = seq[i];
      var legKm = haversineKm(cur, st);
      var dMin = travelMin(cur, st);
      km += legKm;
      driveMin += dMin;
      t += dMin * 60000;
      if (st.role === 'pickup' && st.readyAt && t < st.readyAt) {
        var w = (st.readyAt - t) / 60000;
        waitMin += w;
        t = st.readyAt;
      }
      t += SERVICE_MIN * 60000;
      timeline.push({
        id: st.id,
        role: st.role,
        name: st.name,
        eta: t,
        waitMin: st.role === 'pickup' && st.readyAt ? Math.max(0, (st.readyAt - (t - SERVICE_MIN * 60000)) / 60000) : 0,
      });
      cur = st;
    }
    // cost: time + heavy wait penalty + km
    var cost = driveMin + waitMin * 2.2 + km * 0.8;
    return { km: km, waitMin: waitMin, driveMin: driveMin, totalMin: driveMin + waitMin + seq.length * SERVICE_MIN, cost: cost, timeline: timeline };
  }

  function polish2opt(seq, driver, t0) {
    if (seq.length < 4) return seq;
    var best = seq.slice();
    var bestCost = evalSequence(best, driver, t0).cost;
    var improved = true;
    var guard = 0;
    while (improved && guard < 40) {
      improved = false;
      guard++;
      for (var i = 0; i < best.length - 1; i++) {
        for (var j = i + 1; j < best.length; j++) {
          if (!canSwap(best, i, j)) continue;
          var trial = best.slice();
          // reverse segment i..j
          var seg = trial.slice(i, j + 1).reverse();
          trial = trial.slice(0, i).concat(seg).concat(trial.slice(j + 1));
          if (!validPrecedence(trial)) continue;
          var c = evalSequence(trial, driver, t0).cost;
          if (c + 0.01 < bestCost) {
            best = trial;
            bestCost = c;
            improved = true;
          }
        }
      }
    }
    return best;
  }

  function canSwap(seq, i, j) {
    // don't reverse locked private pairs
    for (var k = i; k <= j; k++) if (seq[k] && seq[k].locked && seq[k].role === 'pickup') return false;
    return true;
  }

  function validPrecedence(seq) {
    var seenP = {};
    for (var i = 0; i < seq.length; i++) {
      var st = seq[i];
      if (st.role === 'pickup') seenP[st.orderId] = true;
      if (st.role === 'drop' && !seenP[st.orderId]) return false;
    }
    return true;
  }

  function pos() {
    try {
      if (global._snLastPos) return { lat: global._snLastPos.lat, lng: global._snLastPos.lng };
      if (global.SNTasks && SNTasks.pos) return { lat: SNTasks.pos.lat, lng: SNTasks.pos.lng };
    } catch (_) {}
    return { lat: 36.4341, lng: 28.2176 };
  }

  /**
   * Score whether candidate can join active load; return insertion preview
   */
  function evaluateJoin(activeOrders, candidate) {
    var profile = getProfile();
    // Schedule is enforced in shouldAutoAccept only — manual Accept always tries capacity
    var cap = capacityCheck(activeOrders, candidate, profile);
    if (!cap.ok) return { ok: false, reason: cap.reason, capacity: cap };

    var pref = preferenceScore(candidate, profile, pos());
    var without = buildTour(activeOrders, { driver: pos() });
    var withC = buildTour(activeOrders.concat([candidate]), { driver: pos() });
    var extraKm = Math.max(0, withC.km - without.km);
    var extraWait = Math.max(0, withC.waitMin - without.waitMin);
    var profit = Number(candidate.price) || 0;
    var profitPerExtraKm = extraKm > 0.05 ? profit / extraKm : profit * 10;

    // reject opposite-direction disaster
    if (activeOrders.length && extraKm > (Number(candidate.km) || 2) * 2.8 && profitPerExtraKm < 1.2) {
      return {
        ok: false,
        reason: 'Opposite / long detour · low profit density',
        tour: withC,
        pref: pref,
      };
    }

    var score = pref.score + profit * 10 - extraKm * 15 - extraWait * 20;
    return {
      ok: true,
      score: score,
      pref: pref,
      capacity: cap,
      tour: withC,
      extraKm: Math.round(extraKm * 100) / 100,
      extraWait: Math.round(extraWait * 10) / 10,
      profitPerExtraKm: Math.round(profitPerExtraKm * 100) / 100,
    };
  }

  function shouldAutoAccept(candidate, activeOrders) {
    var profile = getProfile();
    if (!profile.autoAccept || !profile.autoAccept.on) return { ok: false, reason: 'auto off' };
    var sched = inSchedule(profile);
    if (!sched.ok) return { ok: false, reason: sched.reason };
    var ev = evaluateJoin(activeOrders || [], candidate);
    if (!ev.ok) return ev;
    // Prefer empty-tour auto-accept when min price + schedule OK (score floors softer)
    var floor = (activeOrders && activeOrders.length) ? 40 : -20;
    if (ev.score < floor) return { ok: false, reason: 'score low ' + Math.round(ev.score), ev: ev };
    var minP = (profile.autoAccept && profile.autoAccept.minPrice) || 0;
    var price = Number(candidate.price) || Number(candidate.quote && candidate.quote.total) || 0;
    if (price < minP) return { ok: false, reason: 'below min ' + minP, ev: ev };
    return { ok: true, ev: ev };
  }

  /**
   * Draw multi-order tour as one polygon on map
   */
  function drawTour(tour) {
    if (!tour || !tour.stops || tour.stops.length < 2) return null;
    var wps = tour.stops.map(function (s) {
      return { lat: s.lat, lng: s.lng, label: s.name };
    });
    try {
      if (global.SNField && SNField.startDeliveryRoute) {
        void SNField.startDeliveryRoute({
          id: 'live:tour_' + (tour.id || 'active'),
          vendorLat: wps[0].lat,
          vendorLng: wps[0].lng,
          dropLat: wps[wps.length - 1].lat,
          dropLng: wps[wps.length - 1].lng,
          waypoints: wps,
          label: 'Tour · ' + (tour.orders || []).length + ' orders · ' + (tour.km || '?') + ' km',
          driver: 'Multi poly',
          color: 'rgba(0,220,160,0.95)',
          etaMin: Math.round(tour.totalMin || 20),
          speedKmh: AVG_KMH,
          preview: true,
        });
      }
    } catch (_) {}
    try {
      if (global.SNGlobe) {
        var gpts = tour.stops
          .filter(function (s) {
            return s && s.lat != null && s.lng != null;
          })
          .map(function (s) {
            return { lat: s.lat, lng: s.lng };
          });
        if (SNGlobe.drawTourLine && gpts.length >= 2) {
          SNGlobe.drawTourLine(gpts, { color: 0x00e090 });
        } else if (SNGlobe.pulse) {
          gpts.forEach(function (s, i) {
            if (i > 8) return;
            SNGlobe.pulse(s.lat, s.lng, i === 0 ? 0x00e070 : 0x3d9eff, String((tour.stops[i] && tour.stops[i].name) || '').slice(0, 10), 12000);
          });
        }
        // Only re-center globe when user asked for polygon overview (⬠) — never steal GLOBAL boot
        if (SNGlobe.flyNear && gpts.length) {
          var wantFly = false;
          try {
            wantFly =
              (global.SNField && SNField.polyNavMode === 'polygon') ||
              !!(document.body && document.body.classList.contains('sn-poly-nav-overview'));
          } catch (_) {}
          if (wantFly) {
            var clat = 0,
              clng = 0;
            gpts.forEach(function (p) {
              clat += p.lat;
              clng += p.lng;
            });
            clat /= gpts.length;
            clng /= gpts.length;
            SNGlobe.flyNear(clat, clng);
          }
        }
      }
    } catch (_) {}
    return tour;
  }

  /**
   * Rebuild tour from active claimed/underway orders and paint
   */
  function syncTourFromStack(stack) {
    var active = (stack || []).filter(function (o) {
      return o && (o.phase === 'claimed' || o.phase === 'underway' || o.phase === 'confirming');
    });
    if (!active.length) return null;
    var tour = buildTour(active, { driver: pos() });
    drawTour(tour);
    // annotate orders with tour stop order
    active.forEach(function (o) {
      o.tourId = tour.id;
      o.tourKm = tour.km;
      o.tourWait = tour.waitMin;
    });
    ops(
      'Tour · ' +
        active.length +
        ' orders · ' +
        tour.km +
        ' km · wait ' +
        tour.waitMin +
        'm · profit ' +
        tour.profit.toFixed(0) +
        ' Æ'
    );
    return tour;
  }

  /**
   * Manual reorder: move stop id by dir (±1) if precedence ok
   */
  function moveTourStop(tour, stopId, dir) {
    if (!tour || !tour.stops) return tour;
    var idx = -1;
    for (var i = 0; i < tour.stops.length; i++) if (tour.stops[i].id === stopId) idx = i;
    if (idx < 0) return tour;
    var j = idx + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= tour.stops.length) return tour;
    if (tour.stops[idx].locked || tour.stops[j].locked) {
      ops('Stop locked · private/straight');
      return tour;
    }
    var tmp = tour.stops[idx];
    tour.stops[idx] = tour.stops[j];
    tour.stops[j] = tmp;
    if (!validPrecedence(tour.stops)) {
      // revert
      tmp = tour.stops[idx];
      tour.stops[idx] = tour.stops[j];
      tour.stops[j] = tmp;
      ops('Reorder blocked · pickup before drop');
      return tour;
    }
    var ev = evalSequence(tour.stops, pos(), now());
    tour.km = Math.round(ev.km * 100) / 100;
    tour.waitMin = Math.round(ev.waitMin * 10) / 10;
    tour.totalMin = Math.round(ev.totalMin * 10) / 10;
    drawTour(tour);
    ops('Tour rearranged · ' + tour.km + ' km');
    return tour;
  }

  /** Apply free-text preference from CLI/AI */
  function applyNaturalPrefs(text) {
    var t = String(text || '').toLowerCase();
    var patch = { autoAccept: {}, prefs: {}, schedule: {} };
    var changed = [];

    if (/auto\s*accept\s*off|stop auto/.test(t)) {
      patch.autoAccept.on = false;
      changed.push('auto-accept off');
    } else if (/auto\s*accept|accept auto/.test(t)) {
      patch.autoAccept.on = true;
      changed.push('auto-accept on');
    }

    var minP = t.match(/min(?:imum)?\s*(?:price|pay)?\s*(\d+(?:\.\d+)?)/);
    if (minP) {
      patch.autoAccept.minPrice = Number(minP[1]);
      changed.push('min price ' + minP[1]);
    }

    if (/\blong\b/.test(t)) {
      patch.prefs.distance = 'long';
      changed.push('prefer long');
    }
    if (/\bcity\b|\bshort\b|\blocal\b/.test(t)) {
      patch.prefs.distance = 'city';
      changed.push('prefer city');
    }
    if (/\beast\b/.test(t)) {
      patch.autoAccept.bearing = 'E';
      changed.push('bearing east');
    }
    if (/\bwest\b/.test(t)) {
      patch.autoAccept.bearing = 'W';
      changed.push('bearing west');
    }
    if (/\bnorth\b/.test(t)) {
      patch.autoAccept.bearing = 'N';
      changed.push('bearing north');
    }
    if (/\bsouth\b/.test(t)) {
      patch.autoAccept.bearing = 'S';
      changed.push('bearing south');
    }

    if (/pizza|hot food|food/.test(t) && /prefer|only|want/.test(t)) {
      patch.prefs.goods = ['hot_food'];
      changed.push('prefer hot food');
    }
    if (/supermarket|grocery/.test(t) && /prefer|want|small/.test(t)) {
      patch.prefs.goods = (patch.prefs.goods || []).concat(['grocery']);
      changed.push('prefer grocery');
    }
    if (/mail|envelope|paper|document/.test(t) && /prefer|want/.test(t)) {
      patch.prefs.goods = (patch.prefs.goods || []).concat(['documents']);
      changed.push('prefer documents');
    }
    if (/no ice|avoid frozen|no gelato/.test(t)) {
      patch.prefs.avoidGoods = ['frozen'];
      changed.push('avoid frozen');
    }

    var start = t.match(/start\s*(?:at\s*)?(\d{1,2}:\d{2})/);
    if (start) {
      patch.schedule.start = start[1];
      changed.push('start ' + start[1]);
    }
    var end = t.match(/end\s*(?:at\s*)?(\d{1,2}:\d{2})/);
    if (end) {
      patch.schedule.end = end[1];
      changed.push('end ' + end[1]);
    }
    var br = t.match(/break\s*(\d{1,2}:\d{2})\s*[-–to]+\s*(\d{1,2}:\d{2})/);
    if (br) {
      var p = getProfile();
      var breaks = (p.schedule.breaks || []).slice();
      breaks.push({ from: br[1], to: br[2] });
      patch.schedule.breaks = breaks;
      changed.push('break ' + br[1] + '–' + br[2]);
    }

    if (!changed.length) return { ok: false, reason: 'No preference matched' };
    // clean empty nested
    if (!Object.keys(patch.autoAccept).length) delete patch.autoAccept;
    if (!Object.keys(patch.prefs).length) delete patch.prefs;
    if (!Object.keys(patch.schedule).length) delete patch.schedule;
    var prof = setProfile(patch);
    return { ok: true, changed: changed, profile: prof };
  }

  function profileSummary() {
    var p = getProfile();
    var aa = p.autoAccept;
    return (
      'Driver · cap ' +
      p.capacitySlots +
      ' · ' +
      (aa.on ? 'AUTO on' : 'AUTO off') +
      ' min ' +
      aa.minPrice +
      'Æ · ' +
      (p.prefs.distance || 'any') +
      (aa.bearing ? ' · ' + aa.bearing : '') +
      ' · shift ' +
      p.schedule.start +
      '–' +
      p.schedule.end
    );
  }

  /** CLI intercepts */
  function handleLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;

    if (low === 'tour' || low === 'poly tour' || low === 'engine status') {
      var st =
        (global.SNPolyScheduler && SNPolyScheduler.list && SNPolyScheduler.list()) || [];
      var tour = syncTourFromStack(st);
      ops(tour ? profileSummary() + ' · tour ' + tour.orders.length : profileSummary() + ' · no active tour');
      return true;
    }
    if (low === 'drive prefs' || low === 'prefs' || low === 'driver prefs') {
      ops(profileSummary());
      return true;
    }
    if (low === 'auto accept on' || low === 'auto on') {
      setProfile({ autoAccept: { on: true } });
      return true;
    }
    if (low === 'auto accept off' || low === 'auto off') {
      setProfile({ autoAccept: { on: false } });
      return true;
    }
    if (/^prefer\b|^i (want|prefer)\b|^auto accept\b|^set (min|break|start|end)\b/.test(low) || /^driver\b/.test(low)) {
      var r = applyNaturalPrefs(low);
      if (r.ok) ops('Prefs · ' + r.changed.join(' · '));
      else ops(r.reason || 'No change');
      return true;
    }
    if (low === 'engine demo' || low === 'multi demo' || low === 'demo multi') {
      demoMulti();
      return true;
    }
    return false;
  }

  function demoMulti() {
    try {
      if (global.SNPolyScheduler && SNPolyScheduler.activate) {
        // clear and throw diverse set
        if (SNPolyScheduler.clear) SNPolyScheduler.clear();
      }
    } catch (_) {}
    var samples = [
      { vendorName: 'Nonna Fires', nature: 'Hot pizza', km: 1.8, prepMin: 10, clientName: 'Old Town' },
      { vendorName: 'City Post', nature: 'Paper envelopes', km: 3.5, prepMin: 2, clientName: 'Port Office' },
      { vendorName: 'Gelato Blu', nature: 'ice cream', km: 1.2, prepMin: 4, private: true, clientName: 'Hotel Nike' },
      { vendorName: 'Corner Market', nature: 'Grocery bag', km: 2.4, prepMin: 15, clientName: 'Villa Sea' },
    ];
    var made = [];
    samples.forEach(function (s, i) {
      setTimeout(function () {
        try {
          var o =
            global.SNPolyScheduler && SNPolyScheduler.makeOffer
              ? SNPolyScheduler.makeOffer(s)
              : null;
          if (!o) return;
          o.prepMin = s.prepMin;
          o.prepReadyAt = now() + s.prepMin * 60000;
          if (global.SNPolyScheduler && SNPolyScheduler.pushOffer) SNPolyScheduler.pushOffer(o);
          made.push(o);
          // auto-claim non-private after first for multi demo
          if (i === 0 && global.SNPolyScheduler && SNPolyScheduler.runAct) {
            setTimeout(function () {
              SNPolyScheduler.runAct(o.id, 'accept');
            }, 200);
          }
          if (i === 1 && global.SNPolyScheduler && SNPolyScheduler.runAct) {
            setTimeout(function () {
              // second as combine if capacity
              var active = (SNPolyScheduler.list() || []).filter(function (x) {
                return x.phase === 'claimed' || x.phase === 'underway';
              });
              var ev = evaluateJoin(active, o);
              if (ev.ok) SNPolyScheduler.runAct(o.id, 'accept');
              else ops('Skip combine · ' + (ev.reason || ''));
            }, 900);
          }
        } catch (e) {
          try {
            console.warn('[SNPolyEngine] demo', e);
          } catch (_) {}
        }
      }, i * 750);
    });
    ops('Multi-tour demo · prep-aware spiral · capacity gates');
    return { ok: true };
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snPolyEngineBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        var low = String(raw || '').trim().toLowerCase();
        try {
          if (
            /^(tour|poly tour|engine status|drive prefs|prefs|driver prefs|auto accept|auto on|auto off|prefer\b|i want\b|i prefer\b|engine demo|multi demo|demo multi|driver\b)/i.test(
              low
            )
          ) {
            try {
              if (SNCli.beginTurn) SNCli.beginTurn();
            } catch (_) {}
            try {
              if (SNCli.log) SNCli.log(String(raw).trim(), 'cmd');
            } catch (_) {}
            var h = handleLine(raw);
            try {
              if (SNCli.endTurn) SNCli.endTurn();
            } catch (_) {}
            if (h) return;
          }
        } catch (_) {}
        return orig(raw);
      };
      SNCli._snPolyEngineBound = SNCli.run;
    } catch (_) {}
  }

  function init() {
    installCli();
    [500, 1500, 4000].forEach(function (ms) {
      setTimeout(installCli, ms);
    });
  }

  function broadcastReassign(orders, reason) {
    try {
      if (global.SNReassignEngine && SNReassignEngine.reassignFromDriver)
        return SNReassignEngine.reassignFromDriver(orders, reason || 'broadcast', { excludeSelf: true });
    } catch (_) {}
    return { ok: false };
  }

  global.SNPolyEngine = {
    init: init,
    getProfile: getProfile,
    setProfile: setProfile,
    profileSummary: profileSummary,
    applyNaturalPrefs: applyNaturalPrefs,
    capacityCheck: capacityCheck,
    preferenceScore: preferenceScore,
    evaluateJoin: evaluateJoin,
    shouldAutoAccept: shouldAutoAccept,
    buildTour: buildTour,
    drawTour: drawTour,
    syncTourFromStack: syncTourFromStack,
    moveTourStop: moveTourStop,
    handleLine: handleLine,
    demoMulti: demoMulti,
    broadcastReassign: broadcastReassign,
    detectNature: detectNature,
    prepMin: prepMin,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
