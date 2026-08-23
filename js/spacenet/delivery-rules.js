/**
 * SNDeliveryRules — pricing, capacity, product nature, time windows, comms lock
 * Owner law 2026-08-05:
 *   1 €/km · 3 € per 3 km (or part) · +3 night 21–09 · +3 heavy · +3 VIP/temp · +3 private
 *   Capacity by product nature · multi-order hub polygons · triple confirm
 *   No call / no messaging unless order goes off predicted limits
 */
(function (global) {
  'use strict';

  var NIGHT_START = 21;
  var NIGHT_END = 9;
  var PRIVATE_FEE = 3;
  var SURCHARGE = 3;

  /** Product nature profiles */
  var NATURES = {
    documents: {
      id: 'documents',
      label: 'Paper / envelopes',
      temp: 'ambient',
      windowMin: 180,
      maxParallel: 100,
      heavy: false,
      vip: false,
      privateDefault: false,
      stackWeight: 0.05,
      emoji: '✉️',
    },
    ambient: {
      id: 'ambient',
      label: 'Ambient goods',
      temp: 'ambient',
      windowMin: 90,
      maxParallel: 12,
      heavy: false,
      vip: false,
      privateDefault: false,
      stackWeight: 0.35,
      emoji: '📦',
    },
    grocery: {
      id: 'grocery',
      label: 'Grocery',
      temp: 'mixed',
      windowMin: 75,
      maxParallel: 8,
      heavy: false,
      vip: false,
      privateDefault: false,
      stackWeight: 0.55,
      emoji: '🛒',
    },
    hot_food: {
      id: 'hot_food',
      label: 'Hot food',
      temp: 'hot',
      windowMin: 35,
      maxParallel: 5,
      heavy: false,
      vip: false,
      privateDefault: false,
      stackWeight: 0.7,
      emoji: '🍕',
    },
    cold: {
      id: 'cold',
      label: 'Chilled',
      temp: 'cold',
      windowMin: 45,
      maxParallel: 4,
      heavy: false,
      vip: true,
      privateDefault: false,
      stackWeight: 0.85,
      emoji: '🧊',
    },
    frozen: {
      id: 'frozen',
      label: 'Frozen / ice cream',
      temp: 'frozen',
      windowMin: 20,
      maxParallel: 1,
      heavy: false,
      vip: true,
      privateDefault: true,
      stackWeight: 1.2,
      emoji: '🍦',
    },
    fragile: {
      id: 'fragile',
      label: 'Fragile',
      temp: 'ambient',
      windowMin: 40,
      maxParallel: 2,
      heavy: false,
      vip: true,
      privateDefault: true,
      stackWeight: 1.0,
      emoji: ' Fragile',
    },
    heavy: {
      id: 'heavy',
      label: 'Heavy goods',
      temp: 'ambient',
      windowMin: 120,
      maxParallel: 2,
      heavy: true,
      vip: false,
      privateDefault: false,
      stackWeight: 1.5,
      emoji: '🏋️',
    },
  };

  // fix fragile emoji typo
  NATURES.fragile.emoji = '⚠️';

  var vendorHubs = {}; // vendorId → { lat, lng, radiusKm, orderIds: [] }

  function isNight(d) {
    d = d || new Date();
    var h = d.getHours();
    return h >= NIGHT_START || h < NIGHT_END;
  }

  function isSummerDay(d) {
    d = d || new Date();
    var m = d.getMonth(); // 0-11
    var h = d.getHours();
    var summer = m >= 5 && m <= 8; // Jun–Sep
    var day = h >= 9 && h < 21;
    return summer && day;
  }

  function trafficFactor(level) {
    // 0 calm · 1 normal · 2 busy · 3 gridlock
    level = level == null ? 1 : Number(level);
    if (level <= 0) return 0.9;
    if (level === 1) return 1;
    if (level === 2) return 1.35;
    return 1.7;
  }

  function detectNature(raw) {
    var s = String(raw || '').toLowerCase();
    if (/ice\s*cream|gelato|frozen|popsicle|παγωτ/.test(s)) return NATURES.frozen;
    if (/envelope|paper|document|mail|letter|courier pack|docs/.test(s)) return NATURES.documents;
    if (/heavy|furniture|water\s*pack|crate|kilo/.test(s)) return NATURES.heavy;
    if (/fragile|glass|cake|flower/.test(s)) return NATURES.fragile;
    if (/cold|chill|salad|yogurt|dairy|fridge/.test(s)) return NATURES.cold;
    if (/grocery|market|super/.test(s)) return NATURES.grocery;
    if (/pizza|gyros|burger|hot|grill|food|meal|kitchen|delivery|vendor/.test(s))
      return NATURES.hot_food;
    return NATURES.ambient;
  }

  /**
   * Distance fee:
   * 1 €/km base, billed as 3 € for every 3 km or part thereof
   * → ceil(km/3)*3  (equals 1€/km when exact multiples)
   */
  function distanceFee(km) {
    km = Math.max(0.1, Number(km) || 0.1);
    return Math.ceil(km / 3) * 3;
  }

  /**
   * Full quote for an offer
   * @returns {object} breakdown + total + window + capacity + private + offLimits flags
   */
  function quote(opts) {
    opts = opts || {};
    var km = opts.km != null ? Number(opts.km) : 1.2;
    if (!isFinite(km) || km < 0) km = 1.2;
    var nature =
      typeof opts.nature === 'object' && opts.nature
        ? opts.nature
        : detectNature(opts.nature || opts.title || opts.product || '');
    var night = opts.night != null ? !!opts.night : isNight(opts.when);
    var heavy = opts.heavy != null ? !!opts.heavy : !!nature.heavy;
    var vip = opts.vip != null ? !!opts.vip : !!nature.vip;
    // Frozen in summer day → force private + VIP
    var summerDay = isSummerDay(opts.when);
    var privateRun =
      opts.private != null
        ? !!opts.private
        : !!(nature.privateDefault || (nature.id === 'frozen' && summerDay));
    if (nature.id === 'frozen' && summerDay) {
      vip = true;
      privateRun = true;
    }
    var traffic = opts.traffic != null ? Number(opts.traffic) : 1;
    var tf = trafficFactor(traffic);

    var dist = distanceFee(km);
    // Also surface linear 1€/km for transparency
    var perKm = Math.round(km * 10) / 10; // display km * 1€

    var nightFee = night ? SURCHARGE : 0;
    var heavyFee = heavy ? SURCHARGE : 0;
    var vipFee = vip ? SURCHARGE : 0;
    var privateFee = privateRun ? PRIVATE_FEE : 0;

    var total = dist + nightFee + heavyFee + vipFee + privateFee;
    total = Math.round(total * 100) / 100;

    // Time window shrinks with traffic + heat for frozen
    var windowMin = nature.windowMin;
    if (traffic >= 2) windowMin = Math.round(windowMin * 0.85);
    if (nature.id === 'frozen' && summerDay) windowMin = Math.min(windowMin, 18);
    var etaMin = Math.max(
      8,
      Math.round((km / 22) * 60 * tf + (privateRun ? 4 : 8))
    );
    if (etaMin > windowMin) {
      // still quote but mark tight
    }

    var bits = [];
    bits.push(km < 10 ? km.toFixed(1) + ' km' : Math.round(km) + ' km');
    bits.push(night ? 'night 21–09' : 'day');
    if (heavy) bits.push('heavy');
    if (vip) bits.push('VIP/temp');
    if (privateRun) bits.push('private');
    if (traffic >= 2) bits.push(traffic >= 3 ? 'gridlock' : 'busy traffic');
    bits.push('≤' + windowMin + ' min window');

    var lines = [
      'Distance · ' + dist.toFixed(0) + ' €  (ceil ' + km.toFixed(1) + ' km / 3 × 3€ · 1€/km)',
    ];
    if (nightFee) lines.push('Night 21:00–09:00 · +' + nightFee + ' €');
    if (heavyFee) lines.push('Heavy · +' + heavyFee + ' €');
    if (vipFee) lines.push('VIP / temperature · +' + vipFee + ' €');
    if (privateFee) lines.push('Private straight run · +' + privateFee + ' €');

    return {
      ok: true,
      km: km,
      nature: nature,
      night: night,
      heavy: heavy,
      vip: vip,
      private: privateRun,
      traffic: traffic,
      trafficFactor: tf,
      summerDay: summerDay,
      distanceFee: dist,
      perKmDisplay: perKm,
      nightFee: nightFee,
      heavyFee: heavyFee,
      vipFee: vipFee,
      privateFee: privateFee,
      total: total,
      windowMin: windowMin,
      etaMin: etaMin,
      maxParallel: nature.maxParallel,
      stackWeight: nature.stackWeight,
      metaLine: bits.join(' · '),
      breakdownLines: lines,
      // Predicted limits for comms unlock
      limits: {
        maxEtaMin: windowMin,
        maxKm: km * 1.35 + 0.5,
        tempClass: nature.temp,
        private: privateRun,
      },
    };
  }

  /**
   * How many concurrent jobs a driver/drone may hold given current load + candidate
   */
  function capacityCheck(load, candidate) {
    load = load || [];
    var q = quote(candidate || {});
    var weight = 0;
    var frozenN = 0;
    var privateN = 0;
    load.forEach(function (j) {
      var n = detectNature(j.nature || j.title || j.product);
      weight += n.stackWeight || 0.5;
      if (n.id === 'frozen') frozenN++;
      if (j.private || n.privateDefault) privateN++;
    });
    weight += q.stackWeight;
    if (q.nature.id === 'frozen') frozenN++;
    if (q.private) privateN++;

    // Hard rules
    if (q.nature.id === 'frozen' && frozenN > 1) {
      return {
        ok: false,
        reason: 'Frozen/ice cream · max 1 private run (heat risk)',
        maxParallel: 1,
        quote: q,
      };
    }
    // Private / VIP frozen: never combine with anything else on the bike
    if (q.private && load.length > 0) {
      return {
        ok: false,
        reason: 'Private straight-line · exclusive capacity · empty tour only',
        maxParallel: 1,
        quote: q,
      };
    }
    if (load.some(function (j) {
      var n = detectNature(j.nature || j.title || j.product);
      return j.private || n.privateDefault || (j.quote && j.quote.private);
    }) && load.length) {
      return {
        ok: false,
        reason: 'Already carrying a private/exclusive order',
        maxParallel: 1,
        quote: q,
      };
    }
    if (q.private && privateN > 1) {
      return {
        ok: false,
        reason: 'Private straight-line · exclusive capacity',
        maxParallel: 1,
        quote: q,
      };
    }
    // Soft weight budget ~ 3.5 units (e.g. 5 hot food ≈ 3.5, 100 envelopes = 5)
    var weightCap = 3.5;
    // Documents can flood weight cap is higher
    if (q.nature.id === 'documents' && load.every(function (j) {
      return detectNature(j.nature || j.title).id === 'documents';
    })) {
      weightCap = 8;
    }
    if (weight > weightCap + 0.01) {
      return {
        ok: false,
        reason: 'Driver load full for this product mix · weight ' + weight.toFixed(2),
        maxParallel: q.maxParallel,
        quote: q,
      };
    }
    // Nature-specific parallel count
    var sameNature = load.filter(function (j) {
      return detectNature(j.nature || j.title).id === q.nature.id;
    }).length;
    if (sameNature >= q.maxParallel) {
      return {
        ok: false,
        reason: q.nature.label + ' · max ' + q.maxParallel + ' concurrent',
        maxParallel: q.maxParallel,
        quote: q,
      };
    }
    return { ok: true, weight: weight, quote: q, maxParallel: q.maxParallel };
  }

  /** Multi-order hub polygon for same vendor (e.g. fast food) */
  function registerHubOrder(vendorId, lat, lng, orderId) {
    if (!vendorId) return null;
    var h = vendorHubs[vendorId];
    if (!h) {
      h = {
        vendorId: vendorId,
        lat: Number(lat),
        lng: Number(lng),
        orderIds: [],
        radiusKm: 0.35,
      };
      vendorHubs[vendorId] = h;
    }
    if (orderId && h.orderIds.indexOf(orderId) < 0) h.orderIds.push(orderId);
    // Radius grows slightly with multi-orders in city (cap 1.8 km)
    h.radiusKm = Math.min(1.8, 0.35 + h.orderIds.length * 0.12);
    return h;
  }

  function hubFor(vendorId) {
    return vendorHubs[vendorId] || null;
  }

  function clearHub(vendorId) {
    if (vendorId) delete vendorHubs[vendorId];
    else vendorHubs = {};
  }

  /**
   * Off-limits check — only then unlock video/message between parties
   */
  function checkLimits(order, live) {
    order = order || {};
    live = live || {};
    var limits = order.limits || (order.quote && order.quote.limits) || {};
    var breaches = [];
    if (live.etaMin != null && limits.maxEtaMin != null && live.etaMin > limits.maxEtaMin * 1.15) {
      breaches.push('late · ETA over window');
    }
    if (live.km != null && limits.maxKm != null && live.km > limits.maxKm) {
      breaches.push('detour · distance over plan');
    }
    if (live.tempBreach) breaches.push('temperature risk');
    if (live.cancelled) breaches.push('party dispute');
    if (live.driverDistress) breaches.push('driver stress signal');
    var off = breaches.length > 0;
    return {
      offLimits: off,
      breaches: breaches,
      commsAllowed: off, // no call / no msg unless off limits
      reason: off ? breaches.join(' · ') : 'within plan · no call / no messaging',
    };
  }

  /** Fresh confirm object for triple agreement */
  function newConfirms() {
    return {
      client: false,
      vendor: false,
      driver: false,
      at: { client: 0, vendor: 0, driver: 0 },
    };
  }

  function allConfirmed(c) {
    return !!(c && c.client && c.vendor && c.driver);
  }

  function sampleCatalog() {
    return [
      {
        nature: 'hot_food',
        title: 'Hot pizza run',
        product: 'Super Greek special',
        vendorName: 'Nonna Fires',
        km: 1.4,
        shopKind: 'pizza',
      },
      {
        nature: 'frozen',
        title: 'Ice cream · private',
        product: 'Gelato box',
        vendorName: 'Gelato Lab',
        km: 2.1,
        shopKind: 'gelato',
      },
      {
        nature: 'documents',
        title: 'Envelope batch',
        product: 'Paper envelopes',
        vendorName: 'City Post Desk',
        km: 4.5,
        shopKind: 'courier',
      },
      {
        nature: 'cold',
        title: 'Chilled dairy',
        product: 'Yogurt crate',
        vendorName: 'Fresh Cool',
        km: 3.2,
        shopKind: 'grocery',
      },
      {
        nature: 'heavy',
        title: 'Water pack',
        product: '6×1.5L water',
        vendorName: 'Mini Market',
        km: 1.8,
        shopKind: 'shop',
      },
      {
        nature: 'grocery',
        title: 'Grocery bag',
        product: 'Mixed basket',
        vendorName: 'Corner Market',
        km: 2.4,
        shopKind: 'grocery',
      },
    ];
  }

  global.SNDeliveryRules = {
    NATURES: NATURES,
    SURCHARGE: SURCHARGE,
    PRIVATE_FEE: PRIVATE_FEE,
    isNight: isNight,
    isSummerDay: isSummerDay,
    trafficFactor: trafficFactor,
    detectNature: detectNature,
    distanceFee: distanceFee,
    quote: quote,
    capacityCheck: capacityCheck,
    registerHubOrder: registerHubOrder,
    hubFor: hubFor,
    clearHub: clearHub,
    checkLimits: checkLimits,
    newConfirms: newConfirms,
    allConfirmed: allConfirmed,
    sampleCatalog: sampleCatalog,
  };
})(typeof window !== 'undefined' ? window : globalThis);
