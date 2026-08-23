/**
 * SNReassignEngine — Dynamic reassignment algorithms for Astranov multi-driver mesh
 *
 * Triggers: driver rest/OFF · capacity breach · late/off-limits · shift end · manual
 * Algorithms:
 *  1) Urgency ranking (temp · window · age · prep)
 *  2) Score-based matching (profit − detour − wait − reverse-bearing penalty)
 *  3) Regret-based sequential assignment (best − secondBest)
 *  4) Greedy batch rebalance of pool ↔ live drivers
 *  5) Soft auction claim (driver power ON picks highest-value feasible order)
 *
 * Owner law: rest stops local tour; open work must reach other drivers; no order left silent.
 */
(function (global) {
  'use strict';

  var LS_POOL = 'sn:open-order-pool-v1';
  var LS_DRIVERS = 'sn:mesh-drivers-v1';
  var LS_LOG = 'sn:reassign-log-v1';
  var MAX_POOL = 50;
  var MAX_LOG = 60;
  var AVG_KMH = 22;

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

  function ops(msg) {
    try {
      if (global.SNCli && SNCli.ops) SNCli.ops(String(msg).slice(0, 140));
    } catch (_) {}
  }

  function logEvent(ev) {
    var bag = loadJson(LS_LOG, []);
    if (!Array.isArray(bag)) bag = [];
    bag.unshift(Object.assign({ at: now() }, ev));
    saveJson(LS_LOG, bag.slice(0, MAX_LOG));
  }

  function pos() {
    try {
      if (global._snLastPos) return { lat: global._snLastPos.lat, lng: global._snLastPos.lng };
      if (global.SNTasks && SNTasks.pos) return { lat: SNTasks.pos.lat, lng: SNTasks.pos.lng };
    } catch (_) {}
    return { lat: 36.4341, lng: 28.2176 };
  }

  function natureOf(o) {
    try {
      if (global.SNPolyEngine && SNPolyEngine.detectNature) return SNPolyEngine.detectNature(o);
      if (global.SNDeliveryRules && SNDeliveryRules.detectNature)
        return SNDeliveryRules.detectNature(o.nature || o.title || o.product || '');
    } catch (_) {}
    return { id: 'ambient', temp: 'ambient', windowMin: 90, stackWeight: 0.35 };
  }

  // ─── Pool I/O ───────────────────────────────────────────
  function loadPool() {
    var p = loadJson(LS_POOL, []);
    return Array.isArray(p) ? p : [];
  }
  function savePool(p) {
    saveJson(LS_POOL, (p || []).slice(0, MAX_POOL));
  }

  function upsertPoolOrder(snap) {
    var pool = loadPool().filter(function (x) {
      return x && x.id !== snap.id;
    });
    pool.unshift(snap);
    savePool(pool);
    return pool;
  }

  function removeFromPool(id) {
    var pool = loadPool().filter(function (x) {
      return x && x.id !== id;
    });
    savePool(pool);
    return pool;
  }

  // ─── Mesh drivers (local sim + real hooks) ──────────────
  function defaultMeshDrivers(center) {
    center = center || pos();
    // Synthetic nearby drivers for demo / until live fleet mesh
    var seeds = [
      { id: 'drv:mesh-alpha', name: 'Mesh Alpha', bearing: 0.012, blng: 0.008, capacity: 3.5 },
      { id: 'drv:mesh-beta', name: 'Mesh Beta', bearing: -0.01, blng: 0.014, capacity: 3.5 },
      { id: 'drv:mesh-gamma', name: 'Mesh Gamma', bearing: 0.018, blng: -0.006, capacity: 4.0 },
      { id: 'drv:mesh-rai', name: 'Rai Drone', bearing: 0.004, blng: 0.003, capacity: 2.2, drone: true },
    ];
    return seeds.map(function (s, i) {
      return {
        id: s.id,
        name: s.name,
        lat: center.lat + s.bearing,
        lng: center.lng + s.blng,
        capacitySlots: s.capacity,
        load: [],
        online: true,
        drone: !!s.drone,
        lastSeen: now() - i * 1000,
        prefs: { distance: 'any' },
      };
    });
  }

  function getDrivers(opts) {
    opts = opts || {};
    var stored = loadJson(LS_DRIVERS, null);
    var list = Array.isArray(stored) && stored.length ? stored : defaultMeshDrivers();
    // Live self (this device) if market ON
    try {
      var selfOn =
        global.SNPolyScheduler &&
        typeof SNPolyScheduler.list === 'function' &&
        document.body &&
        document.body.classList.contains('launch-on');
      if (selfOn || opts.includeSelf) {
        var me = {
          id: 'drv:self',
          name: 'You',
          lat: pos().lat,
          lng: pos().lng,
          capacitySlots: 3.5,
          load: [],
          online: true,
          self: true,
          lastSeen: now(),
        };
        try {
          if (global.SNPolyEngine && SNPolyEngine.getProfile)
            me.capacitySlots = SNPolyEngine.getProfile().capacitySlots || 3.5;
          if (global.SNPolyScheduler && SNPolyScheduler.list) {
            me.load = SNPolyScheduler.list().filter(function (o) {
              return o.phase === 'claimed' || o.phase === 'underway' || o.phase === 'confirming';
            });
          }
        } catch (_) {}
        list = list.filter(function (d) {
          return d.id !== 'drv:self';
        });
        list.unshift(me);
      }
    } catch (_) {}
    // Exclude resting self when reassigning FROM self
    if (opts.excludeSelf) {
      list = list.filter(function (d) {
        return !d.self;
      });
    }
    if (opts.onlineOnly !== false) {
      list = list.filter(function (d) {
        return d.online !== false;
      });
    }
    return list;
  }

  function setDrivers(list) {
    saveJson(LS_DRIVERS, list || []);
  }

  // ─── Urgency ranking ────────────────────────────────────
  /**
   * Higher = reassign sooner / claim sooner
   */
  function urgencyScore(order) {
    var n = natureOf(order);
    var score = 0;
    var ageMin = (now() - (order.reassignedAt || order.t || now())) / 60000;
    score += Math.min(80, ageMin * 4); // older in pool → hotter

    var temp =
      n.temp === 'frozen' ? 100 : n.temp === 'hot' ? 90 : n.temp === 'cold' ? 75 : n.temp === 'mixed' ? 40 : 20;
    score += temp;

    var windowMin = n.windowMin || 90;
    var elapsed = (now() - (order.t || order.reassignedAt || now())) / 60000;
    var remain = windowMin - elapsed;
    if (remain < 15) score += 60;
    else if (remain < 30) score += 35;
    else if (remain < 60) score += 15;

    // prep soon ready — good for non-stop cycles
    if (order.prepReadyAt) {
      var prepIn = (order.prepReadyAt - now()) / 60000;
      if (prepIn <= 0) score += 25; // ready now
      else if (prepIn < 8) score += 15;
    }

    score += Math.min(40, (Number(order.price) || 0) * 3);
    if (order.routeLocked || (order.quote && order.quote.private)) score += 30; // exclusive needs a free driver fast
    if (order.phaseWas === 'underway' || order.phaseWas === 'confirming') score += 50; // mid-flight rescue

    return Math.round(score * 10) / 10;
  }

  function rankPool(pool) {
    return (pool || loadPool())
      .map(function (o) {
        return Object.assign({}, o, { urgency: urgencyScore(o) });
      })
      .sort(function (a, b) {
        return b.urgency - a.urgency;
      });
  }

  // ─── Driver–order match score ───────────────────────────
  function travelMin(km) {
    return (km / AVG_KMH) * 60;
  }

  function evaluatePair(driver, order) {
    if (!driver || !order) return { ok: false, score: -1e9, reason: 'missing' };
    if (driver.online === false) return { ok: false, score: -1e9, reason: 'offline' };

    var load = driver.load || [];
    // capacity
    var cap = { ok: true };
    try {
      if (global.SNPolyEngine && SNPolyEngine.capacityCheck) {
        cap = SNPolyEngine.capacityCheck(load, order, {
          capacitySlots: driver.capacitySlots != null ? driver.capacitySlots : 3.5,
        });
      } else if (global.SNDeliveryRules && SNDeliveryRules.capacityCheck) {
        cap = SNDeliveryRules.capacityCheck(load, order);
      }
    } catch (_) {}
    if (cap && cap.ok === false) return { ok: false, score: -1e9, reason: cap.reason || 'capacity' };

    // exclusive private / bulk cannot join non-empty load
    var exclusive =
      !!(order.routeLocked || (order.quote && order.quote.private)) ||
      /supermarket|bulk/i.test(String(order.nature || order.title || ''));
    if (exclusive && load.length) return { ok: false, score: -1e9, reason: 'exclusive needs free driver' };

    var dPos = { lat: driver.lat, lng: driver.lng };
    var pickup = { lat: Number(order.vLat), lng: Number(order.vLng) };
    var drop = { lat: Number(order.dLat), lng: Number(order.dLng) };
    if (!isFinite(pickup.lat) || !isFinite(drop.lat))
      return { ok: false, score: -1e9, reason: 'bad coords' };

    var toPickup = haversineKm(dPos, pickup);
    var leg = haversineKm(pickup, drop);
    var km = toPickup + leg;

    // wait at vendor if prep not ready when arriving
    var arrivePickupMs = now() + travelMin(toPickup) * 60000;
    var prepReady = order.prepReadyAt || now();
    var waitMin = Math.max(0, (prepReady - arrivePickupMs) / 60000);

    // detour vs empty: if driver has load, approximate extra via join
    var detourKm = toPickup;
    if (load.length && global.SNPolyEngine && SNPolyEngine.evaluateJoin) {
      try {
        var join = SNPolyEngine.evaluateJoin(load, order);
        if (!join.ok) return { ok: false, score: -1e9, reason: join.reason || 'join fail' };
        detourKm = join.extraKm != null ? join.extraKm : toPickup;
        waitMin = Math.max(waitMin, join.extraWait || 0);
      } catch (_) {}
    }

    var price = Number(order.price) || 0;
    var urgency = urgencyScore(order);
    var score =
      price * 14 +
      urgency * 0.55 -
      detourKm * 18 -
      waitMin * 12 -
      (driver.drone && natureOf(order).temp === 'ambient' ? -5 : 0);

    // distance preference soft
    if (driver.prefs && driver.prefs.distance === 'city' && km > 6) score -= 25;
    if (driver.prefs && driver.prefs.distance === 'long' && km < 5) score -= 15;

    // mid-flight rescue: prefer closest driver heavily
    if (order.phaseWas === 'underway' || order.phaseWas === 'confirming') {
      score += Math.max(0, 40 - toPickup * 12);
    }

    // Rai drone boost for private/frozen short hops
    if (driver.drone) {
      var n = natureOf(order);
      if (n.temp === 'frozen' || n.temp === 'hot') score += 20;
      if (km > 8) score -= 30;
    }

    return {
      ok: true,
      score: Math.round(score * 10) / 10,
      km: Math.round(km * 100) / 100,
      detourKm: Math.round(detourKm * 100) / 100,
      waitMin: Math.round(waitMin * 10) / 10,
      toPickup: Math.round(toPickup * 100) / 100,
      urgency: urgency,
      driverId: driver.id,
      orderId: order.id,
      reason: 'ok',
    };
  }

  // ─── Regret-based sequential assignment ─────────────────
  /**
   * Assign pool orders to drivers maximizing total score with regret ordering:
   * process orders where (bestScore − secondBest) is largest first (hardest to replace).
   */
  function assignBatch(orders, drivers, opts) {
    opts = opts || {};
    orders = (orders || []).slice();
    drivers = (drivers || []).map(function (d) {
      return Object.assign({}, d, { load: (d.load || []).slice() });
    });

    var ranked = rankPool(orders);
    var assignments = [];
    var unassigned = [];

    // Precompute pair matrix for regret
    function bestTwo(order, drvList) {
      var scores = [];
      for (var i = 0; i < drvList.length; i++) {
        var ev = evaluatePair(drvList[i], order);
        if (ev.ok) scores.push({ ev: ev, driver: drvList[i] });
      }
      scores.sort(function (a, b) {
        return b.ev.score - a.ev.score;
      });
      return scores;
    }

    // Iterative regret
    var remaining = ranked.slice();
    var guard = 0;
    while (remaining.length && guard < 80) {
      guard++;
      var bestRegret = -1;
      var pickIdx = 0;
      var pickScores = null;
      for (var i = 0; i < remaining.length; i++) {
        var sc = bestTwo(remaining[i], drivers);
        if (!sc.length) continue;
        var regret = sc.length > 1 ? sc[0].ev.score - sc[1].ev.score : sc[0].ev.score + 50;
        // blend urgency into regret so hot food isn't starved
        regret += (remaining[i].urgency || urgencyScore(remaining[i])) * 0.15;
        if (regret > bestRegret) {
          bestRegret = regret;
          pickIdx = i;
          pickScores = sc;
        }
      }
      if (!pickScores || !pickScores.length) {
        // none feasible
        remaining.forEach(function (o) {
          unassigned.push(o);
        });
        break;
      }
      var order = remaining.splice(pickIdx, 1)[0];
      var winner = pickScores[0];
      // commit
      winner.driver.load = (winner.driver.load || []).concat([order]);
      assignments.push({
        orderId: order.id,
        driverId: winner.driver.id,
        driverName: winner.driver.name,
        score: winner.ev.score,
        detourKm: winner.ev.detourKm,
        waitMin: winner.ev.waitMin,
        urgency: order.urgency || urgencyScore(order),
        order: order,
        driver: winner.driver,
      });
    }

    return {
      ok: true,
      assignments: assignments,
      unassigned: unassigned,
      totalScore: assignments.reduce(function (s, a) {
        return s + a.score;
      }, 0),
      algorithm: 'regret-sequential',
    };
  }

  // ─── Core: reassign from resting driver ─────────────────
  function reassignFromDriver(openOrders, reason, opts) {
    opts = opts || {};
    reason = reason || 'driver rest · power off';
    openOrders = (openOrders || []).filter(Boolean);
    if (!openOrders.length) return { ok: true, count: 0, assignments: [], pool: loadPool() };

    // Snapshot into pool first (durable)
    var snaps = openOrders.map(function (o) {
      return {
        id: o.id,
        vendorName: o.vendorName,
        clientName: o.clientName,
        vLat: o.vLat,
        vLng: o.vLng,
        dLat: o.dLat,
        dLng: o.dLng,
        nature: o.nature,
        title: o.title,
        product: o.product,
        price: o.price,
        km: o.km,
        prepMin: o.prepMin,
        prepReadyAt: o.prepReadyAt,
        quote: o.quote,
        routeLocked: !!o.routeLocked,
        phaseWas: o.phase,
        t: o.t || now(),
        reassignedAt: now(),
        reason: reason,
        urgency: urgencyScore(o),
      };
    });
    snaps.forEach(upsertPoolOrder);

    var drivers = getDrivers({ excludeSelf: true, onlineOnly: true });
    var batch = assignBatch(snaps, drivers, opts);

    // Apply mesh assignments (non-self): mark on pool entry
    var pool = loadPool();
    batch.assignments.forEach(function (a) {
      pool = pool.map(function (p) {
        if (p.id !== a.orderId) return p;
        return Object.assign({}, p, {
          assignedDriverId: a.driverId,
          assignedDriverName: a.driverName,
          assignScore: a.score,
          assignedAt: now(),
          status: a.driver && a.driver.drone ? 'rai-dispatched' : 'mesh-offered',
        });
      });
      // Commission Rai if drone won
      if (a.driver && a.driver.drone) {
        try {
          if (global.SNHelper && SNHelper.commissionRai) {
            SNHelper.commissionRai({
              vendor: { lat: a.order.vLat, lng: a.order.vLng, name: a.order.vendorName },
              drop: { lat: a.order.dLat, lng: a.order.dLng, name: a.order.clientName },
              offerId: a.orderId,
            });
          }
        } catch (_) {}
      }
      logEvent({
        type: 'assign',
        orderId: a.orderId,
        driverId: a.driverId,
        driverName: a.driverName,
        score: a.score,
        reason: reason,
      });
    });
    batch.unassigned.forEach(function (o) {
      logEvent({ type: 'unassigned', orderId: o.id, reason: reason });
    });
    savePool(pool);

    // Persist lightly updated mesh drivers (load snapshots)
    try {
      var mesh = getDrivers({ excludeSelf: true });
      batch.assignments.forEach(function (a) {
        mesh = mesh.map(function (d) {
          if (d.id !== a.driverId) return d;
          return Object.assign({}, d, {
            load: (d.load || []).concat([a.order]),
            lastSeen: now(),
          });
        });
      });
      setDrivers(mesh);
    } catch (_) {}

    ops(
      'Reassign · ' +
        batch.assignments.length +
        ' matched · ' +
        batch.unassigned.length +
        ' pool · ' +
        reason.slice(0, 40)
    );

    return {
      ok: true,
      count: snaps.length,
      assignments: batch.assignments,
      unassigned: batch.unassigned,
      totalScore: batch.totalScore,
      algorithm: batch.algorithm,
      pool: pool,
      reason: reason,
    };
  }

  // ─── Best claim for this device (auction) ───────────────
  /**
   * When driver powers ON: pick the highest-value feasible order from pool
   * (not FIFO). Returns snap or null.
   */
  function claimBestForSelf(maxN) {
    maxN = maxN || 1;
    var pool = rankPool(loadPool());
    if (!pool.length) return [];
    var self = {
      id: 'drv:self',
      name: 'You',
      lat: pos().lat,
      lng: pos().lng,
      capacitySlots: 3.5,
      load: [],
      online: true,
      self: true,
    };
    try {
      if (global.SNPolyEngine && SNPolyEngine.getProfile)
        self.capacitySlots = SNPolyEngine.getProfile().capacitySlots || 3.5;
      if (global.SNPolyScheduler && SNPolyScheduler.list) {
        self.load = SNPolyScheduler.list().filter(function (o) {
          return o.phase === 'claimed' || o.phase === 'underway' || o.phase === 'confirming';
        });
      }
    } catch (_) {}

    var taken = [];
    var remaining = pool.slice();
    while (taken.length < maxN && remaining.length) {
      var best = null;
      var bestI = -1;
      for (var i = 0; i < remaining.length; i++) {
        var ev = evaluatePair(self, remaining[i]);
        if (!ev.ok) continue;
        // skip if already mesh-assigned to someone else recently (soft lock 45s)
        var o = remaining[i];
        if (
          o.assignedDriverId &&
          o.assignedDriverId !== 'drv:self' &&
          o.status === 'mesh-offered' &&
          now() - (o.assignedAt || 0) < 45000
        ) {
          continue;
        }
        if (!best || ev.score > best.score) {
          best = ev;
          bestI = i;
        }
      }
      if (bestI < 0) break;
      var snap = remaining.splice(bestI, 1)[0];
      snap.claimScore = best.score;
      taken.push(snap);
      self.load = self.load.concat([snap]);
      removeFromPool(snap.id);
      logEvent({
        type: 'claim',
        orderId: snap.id,
        driverId: 'drv:self',
        score: best.score,
        algorithm: 'score-auction',
      });
    }
    if (taken.length)
      ops('Pool auction · claimed ' + taken.length + ' · best-score match');
    return taken;
  }

  // ─── Dynamic rebalance triggers ─────────────────────────
  function rebalancePool() {
    var pool = loadPool().filter(function (o) {
      return !o.assignedDriverId || o.status === 'pool' || now() - (o.assignedAt || 0) > 120000;
    });
    if (!pool.length) return { ok: true, assignments: [] };
    var drivers = getDrivers({ excludeSelf: false, onlineOnly: true });
    // free drivers only for full rebalance of unassigned
    var free = drivers.filter(function (d) {
      return !(d.load && d.load.length);
    });
    if (!free.length) free = drivers;
    var batch = assignBatch(pool, free);
    var p2 = loadPool();
    batch.assignments.forEach(function (a) {
      p2 = p2.map(function (x) {
        if (x.id !== a.orderId) return x;
        return Object.assign({}, x, {
          assignedDriverId: a.driverId,
          assignedDriverName: a.driverName,
          assignScore: a.score,
          assignedAt: now(),
          status: 'mesh-offered',
        });
      });
    });
    savePool(p2);
    if (batch.assignments.length)
      ops('Rebalance · ' + batch.assignments.length + ' re-matched');
    return batch;
  }

  /** Capacity breach on local driver → peel lowest priority local order to pool */
  function peelOverflow(activeOrders) {
    activeOrders = (activeOrders || []).slice();
    if (activeOrders.length < 2) return { ok: true, peeled: [] };
    // peel lowest urgency / highest detour first
    var scored = activeOrders.map(function (o) {
      return { o: o, u: urgencyScore(o) };
    });
    scored.sort(function (a, b) {
      return a.u - b.u;
    });
    var peel = scored[0].o;
    var rest = activeOrders.filter(function (o) {
      return o.id !== peel.id;
    });
    // verify rest is healthier
    var r = reassignFromDriver([peel], 'capacity peel · dynamic', { excludeSelf: true });
    return { ok: true, peeled: [peel], reassign: r, remaining: rest };
  }

  function handleLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;
    if (low === 'reassign' || low === 'rebalance' || low === 'pool rebalance') {
      var r = rebalancePool();
      ops('Rebalance · ' + (r.assignments || []).length + ' assigns');
      return true;
    }
    if (low === 'pool status' || low === 'reassign status') {
      var pool = rankPool(loadPool());
      ops('Pool · ' + pool.length + ' · top urgency ' + (pool[0] ? pool[0].urgency : 0));
      pool.slice(0, 5).forEach(function (o) {
        try {
          if (global.SNCli && SNCli.log)
            SNCli.log(
              (o.urgency || 0) +
                ' · ' +
                (o.vendorName || '?') +
                ' → ' +
                (o.clientName || '?') +
                (o.assignedDriverName ? ' · ' + o.assignedDriverName : ''),
              'ok',
              true
            );
        } catch (_) {}
      });
      return true;
    }
    if (low === 'drivers' || low === 'mesh drivers') {
      getDrivers({ onlineOnly: false }).forEach(function (d) {
        try {
          if (global.SNCli && SNCli.log)
            SNCli.log(
              d.name +
                ' · load ' +
                (d.load || []).length +
                (d.drone ? ' · drone' : '') +
                (d.online === false ? ' · OFF' : ''),
              'ok',
              true
            );
        } catch (_) {}
      });
      return true;
    }
    if (low === 'reassign demo' || low === 'demo reassign') {
      demo();
      return true;
    }
    return false;
  }

  function demo() {
    // Seed pool with diverse orders and run batch assign
    var c = pos();
    var samples = [
      {
        id: 'task:demo-hot',
        vendorName: 'Nonna Fires',
        clientName: 'Old Town',
        nature: 'Hot pizza',
        vLat: c.lat + 0.008,
        vLng: c.lng + 0.004,
        dLat: c.lat + 0.002,
        dLng: c.lng + 0.001,
        price: 9,
        prepReadyAt: now() + 6 * 60000,
        t: now(),
        phaseWas: 'claimed',
      },
      {
        id: 'task:demo-ice',
        vendorName: 'Gelato Blu',
        clientName: 'Hotel',
        nature: 'ice cream',
        vLat: c.lat - 0.006,
        vLng: c.lng + 0.01,
        dLat: c.lat - 0.003,
        dLng: c.lng + 0.006,
        price: 12,
        routeLocked: true,
        prepReadyAt: now() + 2 * 60000,
        t: now(),
        phaseWas: 'offered',
      },
      {
        id: 'task:demo-mail',
        vendorName: 'City Post',
        clientName: 'Port',
        nature: 'Paper envelopes',
        vLat: c.lat + 0.015,
        vLng: c.lng - 0.01,
        dLat: c.lat + 0.02,
        dLng: c.lng - 0.004,
        price: 6,
        prepReadyAt: now(),
        t: now() - 20 * 60000,
        phaseWas: 'claimed',
      },
    ];
    samples.forEach(function (s) {
      s.reassignedAt = now();
      s.urgency = urgencyScore(s);
      upsertPoolOrder(s);
    });
    var r = reassignFromDriver(samples, 'demo reassign', {});
    ops('Demo reassign · ' + r.assignments.length + ' matches · score ' + Math.round(r.totalScore || 0));
    return r;
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snReassignBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        var low = String(raw || '').trim().toLowerCase();
        try {
          if (
            /^(reassign|rebalance|pool rebalance|pool status|reassign status|drivers|mesh drivers|reassign demo|demo reassign)\b/i.test(
              low
            )
          ) {
            try {
              if (SNCli.beginTurn) SNCli.beginTurn();
            } catch (_) {}
            try {
              if (SNCli.log) SNCli.log(String(raw).trim(), 'cmd');
            } catch (_) {}
            handleLine(raw);
            try {
              if (SNCli.endTurn) SNCli.endTurn();
            } catch (_) {}
            return;
          }
        } catch (_) {}
        return orig(raw);
      };
      SNCli._snReassignBound = SNCli.run;
    } catch (_) {}
  }

  function init() {
    // Ensure mesh drivers exist
    if (!loadJson(LS_DRIVERS, null)) setDrivers(defaultMeshDrivers());
    installCli();
    [500, 2000, 5000].forEach(function (ms) {
      setTimeout(installCli, ms);
    });
    // Periodic soft rebalance for stale pool offers
    setInterval(function () {
      try {
        var pool = loadPool();
        if (pool.length >= 2) rebalancePool();
      } catch (_) {}
    }, 90000);
  }

  global.SNReassignEngine = {
    init: init,
    urgencyScore: urgencyScore,
    rankPool: rankPool,
    evaluatePair: evaluatePair,
    assignBatch: assignBatch,
    reassignFromDriver: reassignFromDriver,
    claimBestForSelf: claimBestForSelf,
    rebalancePool: rebalancePool,
    peelOverflow: peelOverflow,
    getDrivers: getDrivers,
    setDrivers: setDrivers,
    loadPool: loadPool,
    handleLine: handleLine,
    demo: demo,
    // poly-engine compatibility alias
    broadcastReassign: function (orders, reason) {
      return reassignFromDriver(orders, reason || 'broadcast', { excludeSelf: true });
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
