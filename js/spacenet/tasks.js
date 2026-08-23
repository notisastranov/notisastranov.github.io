/* SpaceNet City DNA — jobs · dating · delivery · errands · multi-user plans (local-first) */
(function (global) {
  'use strict';

  const KEY = 'sn:tasks-v1';
  const PLAN_KEY = 'sn:plans-v1';
  const KINDS = {
    job: { icon: '💼', color: 0x66aaff, label: 'Job' },
    dating: { icon: '💕', color: 0xff6699, label: 'Date' },
    delivery: { icon: '📦', color: 0x44ffaa, label: 'Delivery' },
    errand: { icon: '🏃', color: 0xffcc44, label: 'Errand' },
    help: { icon: '🤝', color: 0x66ffcc, label: 'Help' },
    coordinate: { icon: '🧩', color: 0x3d9eff, label: 'Coordinate' },
  };

  const CATALOG = [
    { kind: 'job', role: 'barman', title: 'Barman / bartender', dur: '3h' },
    { kind: 'job', role: 'cleaner', title: 'Cleaner', dur: '4h' },
    { kind: 'job', role: 'nanny', title: 'Nanny', dur: '1d' },
    { kind: 'job', role: 'waiter', title: 'Waiter', dur: '5h' },
    { kind: 'job', role: 'tutor', title: 'Tutor', dur: '2h' },
    { kind: 'dating', role: 'coffee', title: 'Coffee date', dur: '1h' },
    { kind: 'dating', role: 'dinner', title: 'Dinner date', dur: '3h' },
    { kind: 'dating', role: 'walk', title: 'Walk date', dur: '2h' },
    { kind: 'delivery', role: 'driver', title: 'Food / package delivery', dur: '45m' },
    { kind: 'errand', role: 'pharmacy', title: 'Pharmacy run', dur: '45m' },
    { kind: 'errand', role: 'grocery', title: 'Grocery run', dur: '1h' },
  ];

  const T = {
    tasks: new Map(),
    plans: new Map(),
    pos: null,
  };

  function id(prefix) {
    return (prefix || 't') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        JSON.parse(raw).forEach((t) => {
          if (t && t.id) T.tasks.set(t.id, t);
        });
      }
    } catch (_) {}
    try {
      const rawP = localStorage.getItem(PLAN_KEY);
      if (rawP) {
        JSON.parse(rawP).forEach((p) => {
          if (p && p.id) T.plans.set(p.id, p);
        });
      }
    } catch (_) {}
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify([...T.tasks.values()].slice(-120)));
    } catch (_) {}
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify([...T.plans.values()].slice(-40)));
    } catch (_) {}
  }

  function haversineKm(aLat, aLng, bLat, bLng) {
    const R = 6371;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((aLat * Math.PI) / 180) *
        Math.cos((bLat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }

  function parse(text) {
    const raw = String(text || '').trim();
    const low = raw.toLowerCase();
    let kind = 'job';
    let role = 'worker';
    let title = raw.slice(0, 60);
    let dur = '2h';

    const dm = low.match(/(\d+(?:\.\d+)?)\s*(h|hr|hours?|d|days?|m|min|w|weeks?)\b/);
    if (dm) {
      const u = dm[2][0];
      dur = dm[1] + (u === 'm' ? 'm' : u === 'd' ? 'd' : u === 'w' ? 'w' : 'h');
    }

    if (/\b(date|dating|coffee|dinner|romantic)\b/.test(low)) {
      kind = 'dating';
      role = /dinner/.test(low) ? 'dinner' : /walk/.test(low) ? 'walk' : 'coffee';
      title =
        KINDS.dating.icon +
        ' ' +
        (role === 'dinner' ? 'Dinner date' : role === 'walk' ? 'Walk date' : 'Coffee date') +
        ' · ' +
        dur;
    } else if (/\b(deliver|delivery|courier|package|food\s*order)\b/.test(low)) {
      kind = 'delivery';
      role = 'driver';
      title = KINDS.delivery.icon + ' Delivery · ' + dur;
    } else if (/\b(errand|pharmacy|grocery)\b/.test(low)) {
      kind = 'errand';
      role = /pharmacy/.test(low) ? 'pharmacy' : /grocery/.test(low) ? 'grocery' : 'errand';
      title =
        KINDS.errand.icon +
        ' ' +
        (role === 'pharmacy' ? 'Pharmacy' : role === 'grocery' ? 'Grocery' : 'Errand') +
        ' · ' +
        dur;
    } else {
      for (const c of CATALOG) {
        if (c.kind === 'job' && new RegExp('\\b' + c.role + '\\b').test(low)) {
          kind = 'job';
          role = c.role;
          if (!dm) dur = c.dur;
          title = KINDS.job.icon + ' ' + c.title + ' · ' + dur;
          break;
        }
      }
      if (kind === 'job' && title === raw.slice(0, 60)) {
        title = KINDS.job.icon + ' Job · ' + raw.slice(0, 40) + ' · ' + dur;
      }
    }
    return { kind: kind, role: role, title: title, dur: dur, raw: raw };
  }

  function getByShort(id) {
    if (!id) return null;
    var s = String(id);
    if (T.tasks.has(s)) return T.tasks.get(s);
    var low = s.toLowerCase();
    for (var pair of T.tasks) {
      var task = pair[1];
      if (!task) continue;
      if (String(task.id) === s) return task;
      if (String(task.id).toLowerCase().indexOf(low) === 0) return task;
      if (task.short_id && String(task.short_id) === s) return task;
    }
    return null;
  }
  function expireOldTasks(maxAgeMs) {
    maxAgeMs = maxAgeMs || 24 * 3600 * 1000;
    var n = 0;
    var now = Date.now();
    list({ all: true }).forEach(function (task) {
      if (!task || task.status === 'done' || task.status === 'cancelled') return;
      var age = now - (task.created || task.t || task.claimedAt || 0);
      if (task.created || task.t) {
        if (age > maxAgeMs && (task.status === 'open' || task.status === 'seeking_driver')) {
          task.status = 'cancelled';
          task.cancelReason = 'expired_24h';
          T.tasks.set(task.id, task);
          n++;
        }
      }
    });
    if (n) save();
    return { expired: n };
  }
  function create(spec) {
    spec = spec || {};
    if (spec.kind === 'delivery' && (spec.lat == null || spec.lng == null)) {
      var pp = global._snLastPos || (global.SNTasks && SNTasks.pos) || {};
      if (spec.drop_lat != null) {
        spec.lat = spec.drop_lat;
        spec.lng = spec.drop_lng;
      } else if (pp.lat != null) {
        spec.lat = pp.lat;
        spec.lng = pp.lng;
      }
    }
    const p = typeof spec === 'string' ? parse(spec) : Object.assign({}, parse(spec.raw || ''), spec);
    const meta = KINDS[p.kind] || KINDS.job;
    const task = {
      id: p.id || id('t'),
      kind: p.kind || 'job',
      role: p.role || 'worker',
      title: p.title || meta.icon + ' Task',
      status: p.status || 'open',
      lat: p.lat != null ? p.lat : T.pos.lat,
      lng: p.lng != null ? p.lng : T.pos.lng,
      dur: p.dur || '2h',
      created: p.created || Date.now(),
      vendorId: p.vendorId || null,
      clientId: p.clientId || null,
      vendorName: p.vendorName || null,
      clientName: p.clientName || null,
      vendorAddress: p.vendorAddress || null,
      clientAddress: p.clientAddress || null,
      items: p.items || null,
      total_s: p.total_s != null ? p.total_s : null,
      platform_fee_s: p.platform_fee_s != null ? p.platform_fee_s : null,
      driver_s: p.driver_s != null ? p.driver_s : null,
      vendor_s: p.vendor_s != null ? p.vendor_s : null,
      settled: !!p.settled,
      driverId: p.driverId || null,
      driverName: p.driverName || null,
      drop_lat: p.drop_lat != null ? p.drop_lat : null,
      drop_lng: p.drop_lng != null ? p.drop_lng : null,
      always_on: p.always_on !== false,
      targetId: p.targetId || null,
      targetName: p.targetName || null,
      planId: p.planId || null,
      dependsOn: Array.isArray(p.dependsOn) ? p.dependsOn : [],
      assigneeHints: Array.isArray(p.assigneeHints) ? p.assigneeHints : [],
      assigneeId: p.assigneeId || null,
      assigneeName: p.assigneeName || null,
      party: p.party != null ? p.party : null,
      notes: p.notes || null,
    };
    try {
      if (task.kind === 'delivery' && global.SNTaskBoard && SNTaskBoard.scoreCompatibility) {
        task._routeFit = SNTaskBoard.scoreCompatibility(task);
      }
    } catch (_) {}
    T.tasks.set(task.id, task);
    save();
    paint(task);
    return task;
  }

  function get(taskId) {
    return taskId ? T.tasks.get(taskId) || null : null;
  }

  function paint(task) {
    const meta = KINDS[task.kind] || KINDS.job;
    if (global.SNGlobe && SNGlobe.pulse) {
      SNGlobe.pulse(task.lat, task.lng, meta.color, task.title.slice(0, 22), 16000);
    }
    if (global.SNGlobe && SNGlobe.setHud) SNGlobe.setHud(meta.icon + ' ' + task.title.slice(0, 40));
  }

  function list(filter) {
    filter = filter || {};
    let arr = [...T.tasks.values()];
    // Active work queue = open + claimed + in_progress (was broken: second filter dropped claimed)
    if (!filter.all) {
      arr = arr.filter(function (t) {
        if (filter.status) return t.status === filter.status;
        return t.status === 'open' || t.status === 'claimed' || t.status === 'in_progress';
      });
    }
    if (filter.kind) arr = arr.filter(function (t) {
      return t.kind === filter.kind;
    });
    if (filter.dating) arr = arr.filter(function (t) {
      return t.kind === 'dating';
    });
    if (filter.jobs) arr = arr.filter(function (t) {
      return t.kind === 'job';
    });
    if (filter.status && filter.all) arr = arr.filter(function (t) {
      return t.status === filter.status;
    });
    if (filter.planId) arr = arr.filter(function (t) {
      return t.planId === filter.planId;
    });
    if (filter.role) arr = arr.filter(function (t) {
      return t.role === filter.role;
    });
    if (filter.compatible && global.SNTaskBoard && SNTaskBoard.scoreCompatibility) {
      arr = arr
        .map(function (t) {
          try {
            t._routeFit = SNTaskBoard.scoreCompatibility(t);
          } catch (_) {
            t._routeFit = 0;
          }
          return t;
        })
        .sort(function (a, b) {
          return (b._routeFit || 0) - (a._routeFit || 0) || b.created - a.created;
        });
      return arr;
    }
    return arr.sort(function (a, b) {
      return b.created - a.created;
    });
  }

  function claim(taskId, who) {
    try {
      if (global.SNOrderEngine && SNOrderEngine.transition) {
        /* after successful claim below */
      }
    } catch (_) {}

    let task = taskId ? T.tasks.get(taskId) : null;
    if (!task) {
      task =
        list({ kind: 'delivery' }).find(function (t) {
          return t.status === 'open';
        }) || list()[0];
    }
    if (!task) return { ok: false, error: 'no open tasks' };
    if (task.status === 'done' || task.status === 'settled' || task.status === 'cancelled') {
      return { ok: false, error: 'task already ' + task.status };
    }
    // Steal claim forbidden unless force or same driver re-claim
    var whoId = who && (who.id || who.assigneeId);
    if (
      (task.status === 'claimed' || task.status === 'in_progress' || task.status === 'assigned') &&
      task.driverId &&
      whoId &&
      task.driverId !== whoId &&
      !(who && who.force)
    ) {
      return {
        ok: false,
        error: 'already claimed by ' + (task.driverName || task.driverId) + ' · no steal',
      };
    }
    if (task.status === 'open' || task.status === 'seeking_driver') {
      task.status = 'claimed';
      try {
        if (global.SNOrderEngine) SNOrderEngine.transition(task, 'assigned', { who: whoId });
      } catch (_e) {}
      task.claimedAt = Date.now();
    } else if (task.status === 'claimed') {
      // same driver continues → en route
      if (!whoId || !task.driverId || task.driverId === whoId) {
        task.status = 'in_progress';
        try {
          if (global.SNOrderEngine) SNOrderEngine.transition(task, 'en_route', { who: whoId });
        } catch (_e2) {}
      }
    }
    if (who) {
      task.assigneeId = who.id || who.assigneeId || task.assigneeId;
      task.assigneeName = who.name || who.shopName || who.assigneeName || task.assigneeName;
      task.driverId = who.id || who.driverId || task.driverId;
      task.driverName = who.name || who.shopName || task.driverName;
    }
    T.tasks.set(task.id, task);
    refreshPlan(task.planId);
    save();
    paint(task);
    try {
      if (task.networkId && global.SNMeshOrders && SNMeshOrders.claimLive) {
        void SNMeshOrders.claimLive(task, who);
      }
    } catch (_) {}
    return { ok: true, task: task };
  }

  function complete(taskId) {
    let task = taskId ? T.tasks.get(taskId) : null;
    if (!task) {
      task = [...T.tasks.values()].find(function (t) {
        return t.status === 'claimed' || t.status === 'in_progress' || t.status === 'open';
      });
    }
    if (!task) task = list()[0];
    if (!task) return { ok: false, error: 'no task to complete' };
    if (task.status === 'done') return { ok: true, task: task, already: true };

    // Marketplace settlement BEFORE mark done (idempotent)
    var settled = null;
    try {
      if (task.kind === 'delivery' && global.SNProfiles && SNProfiles.settleOrder) {
        settled = SNProfiles.settleOrder(task);
      }
    } catch (eSet) {
      settled = { ok: false, error: (eSet && eSet.message) || 'settle failed' };
    }

    task.status = 'done';
    task.doneAt = Date.now();
    if (settled && settled.ok) task.settled = true;
    try {
      if (global.SNOrderEngine && SNOrderEngine.transition) {
        SNOrderEngine.transition(task, settled && settled.ok ? 'settled' : 'delivered', {
          settled: !!(settled && settled.ok),
        });
      }
    } catch (_) {}
    T.tasks.set(task.id, task);
    refreshPlan(task.planId);
    save();
    if (global.SNGlobe && SNGlobe.pulse) {
      SNGlobe.pulse(task.lat, task.lng, 0xffffff, 'done', 6000);
    }
    try {
      if (task.networkId && global.SNMeshOrders && SNMeshOrders.deliverLive) {
        void SNMeshOrders.deliverLive(task);
      }
    } catch (_) {}
    try {
      if (task.kind === 'delivery' && global.SNUsage && SNUsage.flag) {
        SNUsage.flag('firstDeliveryDone', true);
      }
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.log && settled && settled.ok) {
        SNCli.log(
          'Settled · driver ' +
            (settled.driverPaid != null ? settled.driverPaid : 0) +
            ' S · vendor ' +
            (settled.vendorPaid != null ? settled.vendorPaid : 0) +
            ' S',
          'ok'
        );
      }
    } catch (_) {}
    return { ok: true, task: task, settled: settled };
  }

  function search(q) {
    const low = String(q || '').toLowerCase();
    const words = low.split(/\s+/).filter(function (w) {
      return w.length > 1;
    });
    const hits = list({ all: true }).filter(function (t) {
      const hay = (t.title + ' ' + t.kind + ' ' + t.role + ' ' + (t.notes || '')).toLowerCase();
      return words.some(function (w) {
        return hay.indexOf(w) >= 0;
      });
    });
    const roles = CATALOG.filter(function (c) {
      return words.some(function (w) {
        return (c.title + c.role + c.kind).indexOf(w) >= 0;
      });
    });
    hits.forEach(paint);
    return { tasks: hits, roles: roles };
  }

  function seedDemo() {
    try {
      if (global.SNCli && SNCli.log) SNCli.log('seedDemo disabled · post real job/date/deliver from CLI', 'dim');
    } catch (_) {}
  }

  function setPos(lat, lng) {
    if (lat != null && lng != null) {
      T.pos = { lat: lat, lng: lng };
      global._snLastPos = T.pos;
    }
  }

    function isCoordIntent(text) {
    const low = String(text || '').toLowerCase().trim();
    if (!low || low.length < 4) return false;
    // Never treat plan list/status as create
    if (/^plan(\s+list|\s+status)?$/.test(low) || low === 'plans' || low === 'plans list') return false;
    if (/^task\s/.test(low) || low === 'claim' || /^claim\b/.test(low)) return false;
    if (/^(coord|coordinate|team)\b/.test(low)) return true;
    if (/^assign\b/.test(low)) return true;
    if (/\b(coordinate|fan[- ]?out|multi[- ]?user|team up|notify me when)\b/.test(low)) return true;
    if (/\bneed\b.+\b(and|&|plus|\+)\b.+\b(driver|courier|vendor|shop|kitchen|cook|client)\b/.test(low))
      return true;
    if (/\b(driver|courier).+\b(vendor|shop|kitchen|cook)\b/.test(low)) return true;
    if (/\b(vendor|shop|kitchen|cook).+\b(driver|courier)\b/.test(low)) return true;
    if (/\b(στείλε|στειλε|θέλω|θελω).+\b(driver|courier|μαγαζ|vendor)\b/.test(low)) return true;
    if (
      /\b(driver|μαγαζ|vendor|courier).+\b(driver|μαγαζ|vendor|courier)\b/.test(low) &&
      /\b(και|and|\+|plus)\b/.test(low)
    )
      return true;
    return false;
  }

  function parseCoordIntent(text) {
    const raw = String(text || '').trim();
    const low = raw
      .toLowerCase()
      .replace(/^(coord|coordinate|team|assign|plan)\s*/i, '')
      .trim();

    const roles = [];
    const wantDriver = /\b(driver|courier|delivery\s*guy|deliverer|scooter|moto)\b/.test(low);
    const wantVendor = /\b(vendor|shop|kitchen|cook|restaurant|store|μαγαζ|εστιατόρ|εστιατορ|πιτσαρ|pizzeria)\b/.test(
      low
    );
    const wantClient = /\b(client|customer|me|my\s+pin|at\s+my|for\s+me|notify\s+me)\b/.test(low);
    const wantHelp = /\b(helper|help|errand|runner)\b/.test(low);

    let driverN = 1;
    const dn = low.match(/(\d+)\s*(drivers?|couriers?)/);
    if (dn) driverN = Math.min(5, Math.max(1, parseInt(dn[1], 10) || 1));
    let vendorN = 1;
    const vn = low.match(/(\d+)\s*(vendors?|shops?|kitchens?)/);
    if (vn) vendorN = Math.min(3, Math.max(1, parseInt(vn[1], 10) || 1));

    const foodish = /\b(pizza|food|order|delivery|pitogyra|πιτογύρ|mpyronia|μπυρόν|burger|sushi|coffee|tray)\b/.test(
      low
    );
    if (!wantDriver && !wantVendor && !wantHelp) {
      roles.push({ role: 'vendor', count: 1, kind: 'job' });
      roles.push({ role: 'driver', count: 1, kind: 'delivery' });
    } else {
      if (wantVendor) roles.push({ role: 'vendor', count: vendorN, kind: 'job' });
      if (wantDriver) roles.push({ role: 'driver', count: driverN, kind: 'delivery' });
      if (wantHelp) roles.push({ role: 'worker', count: 1, kind: 'help' });
    }
    if (!roles.some(function (r) {
      return r.role === 'client';
    })) {
      roles.push({ role: 'client', count: 1, kind: 'coordinate' });
    }

    let party = null;
    const pm =
      low.match(/\b(?:for|company|άτομ|ατομ|people|of)\s*~?\s*(\d+)\b/) ||
      low.match(/\b(\d+)\s*(?:people|άτομ|ατομ|persons)\b/) ||
      low.match(/\bfor\s+(\d+)\b/);
    if (pm) party = parseInt(pm[1], 10);

    let food = null;
    if (/\bpizza\b/.test(low)) food = 'pizza';
    else if (/\bpitogyra|πιτογύρ|gyro\b/.test(low)) food = 'pitogyra';
    else if (/\bburger\b/.test(low)) food = 'burger';
    else if (/\bsushi\b/.test(low)) food = 'sushi';
    else if (/\bcoffee\b/.test(low)) food = 'coffee';
    else if (foodish) food = 'food';

    return {
      roles: roles,
      party: party || (food ? 3 : null),
      food: food,
      notes: raw.slice(0, 160),
      raw: raw,
      atMyPin: /\b(my\s+(pin|location|place)|at\s+my|εδώ|εδω|here)\b/.test(low),
    };
  }

  function nearestByRole(role, n, origin) {
    n = Math.max(1, Math.min(8, n || 1));
    const o = origin || T.pos || global._snLastPos || { lat: 36.4341, lng: 28.2176 };
    let pool = [];
    try {
      if (global.SNProfiles && SNProfiles.list) {
        pool = SNProfiles.list({ role: role === 'worker' ? 'worker' : role }) || [];
        if (!pool.length && role === 'vendor') {
          pool = (SNProfiles.list() || []).filter(function (p) {
            return p.roles && p.roles.vendor;
          });
        }
        if (!pool.length && role === 'driver') {
          pool = (SNProfiles.list() || []).filter(function (p) {
            return p.roles && p.roles.driver;
          });
        }
      }
    } catch (_) {}

    pool = pool.filter(function (p) {
      if (!p || !p.id) return false;
      const id0 = String(p.id);
      if (id0.indexOf('demo-') === 0 || id0.indexOf('npc-') === 0 || id0.indexOf('seed-') === 0) return false;
      if (p.demo || p.npc || p.fake) return false;
      return p.lat != null && p.lng != null;
    });

    const scored = pool
      .map(function (p) {
        const km = haversineKm(o.lat, o.lng, Number(p.lat), Number(p.lng));
        return { p: p, km: km };
      })
      .filter(function (x) {
        return isFinite(x.km);
      })
      .sort(function (a, b) {
        return a.km - b.km;
      });

    const out = scored.slice(0, n).map(function (x) {
      return {
        id: x.p.id,
        name: x.p.shopName || x.p.name || role,
        lat: Number(x.p.lat),
        lng: Number(x.p.lng),
        km: Math.round(x.km * 10) / 10,
        roles: x.p.roles,
        profile: x.p,
      };
    });

    if (!out.length && role === 'driver') {
      try {
        const me = global.SNProfiles && SNProfiles.me && SNProfiles.me();
        if (me && me.lat != null) {
          out.push({
            id: me.id,
            name: me.name || 'You',
            lat: Number(me.lat),
            lng: Number(me.lng),
            km: 0,
            roles: me.roles,
            profile: me,
            self: true,
          });
        }
      } catch (_) {}
    }

    if (role === 'client') {
      try {
        const me = global.SNProfiles && SNProfiles.me && SNProfiles.me();
        if (me) {
          return [
            {
              id: me.id,
              name: me.name || 'You',
              lat: me.lat != null ? Number(me.lat) : o.lat,
              lng: me.lng != null ? Number(me.lng) : o.lng,
              km: 0,
              roles: me.roles,
              profile: me,
              self: true,
            },
          ];
        }
      } catch (_) {}
    }

    return out;
  }

  function refreshPlan(planId) {
    if (!planId) return null;
    const plan = T.plans.get(planId);
    if (!plan) return null;
    const kids = list({ all: true, planId: planId });
    plan.taskIds = kids.map(function (t) {
      return t.id;
    });
    const statuses = kids.map(function (t) {
      return t.status;
    });
    if (!kids.length) plan.status = 'open';
    else if (statuses.every(function (s) {
      return s === 'done';
    }))
      plan.status = 'done';
    else if (
      statuses.some(function (s) {
        return s === 'claimed' || s === 'in_progress';
      })
    )
      plan.status = 'in_progress';
    else plan.status = 'open';
    plan.updated = Date.now();
    T.plans.set(plan.id, plan);
    save();
    return plan;
  }

  function createPlan(message, opts) {
    opts = opts || {};
    const intent = typeof message === 'object' && message.roles ? message : parseCoordIntent(message);
    const origin = opts.pos || global._snLastPos || T.pos || { lat: 36.4341, lng: 28.2176 };
    setPos(origin.lat, origin.lng);

    const planId = id('plan');
    const roleSpecs = intent.roles || [];
    const childIds = [];
    const tasks = [];
    let vendorTaskId = null;

    const ordered = roleSpecs.slice().sort(function (a, b) {
      const rank = { vendor: 0, client: 1, worker: 2, driver: 3 };
      return (rank[a.role] != null ? rank[a.role] : 9) - (rank[b.role] != null ? rank[b.role] : 9);
    });

    ordered.forEach(function (slot) {
      const count = Math.max(1, slot.count || 1);
      for (let i = 0; i < count; i++) {
        const hints = nearestByRole(slot.role, count, origin);
        const pick = hints[i] || hints[0] || null;
        const meta = KINDS[slot.kind] || KINDS.coordinate;
        let title;
        if (slot.role === 'vendor') {
          title =
            meta.icon +
            ' Kitchen / vendor' +
            (intent.food ? ' · ' + intent.food : '') +
            (intent.party ? ' · ×' + intent.party : '');
        } else if (slot.role === 'driver') {
          title =
            KINDS.delivery.icon +
            ' Courier' +
            (intent.food ? ' · ' + intent.food : '') +
            (intent.party ? ' · for ' + intent.party : '');
        } else if (slot.role === 'client') {
          title = '🛒 Client notify · plan ready';
        } else {
          title = meta.icon + ' ' + (slot.role || 'help');
        }

        const dependsOn = [];
        if (slot.role === 'driver' && vendorTaskId) dependsOn.push(vendorTaskId);

        const t = create({
          kind:
            slot.role === 'driver' ? 'delivery' : slot.role === 'client' ? 'coordinate' : slot.kind || 'job',
          role: slot.role,
          title: title,
          lat: pick ? pick.lat : origin.lat,
          lng: pick ? pick.lng : origin.lng,
          drop_lat: origin.lat,
          drop_lng: origin.lng,
          planId: planId,
          dependsOn: dependsOn,
          assigneeHints: hints.map(function (h) {
            return { id: h.id, name: h.name, km: h.km };
          }),
          assigneeId: pick ? pick.id : null,
          assigneeName: pick ? pick.name : null,
          targetId: pick ? pick.id : null,
          targetName: pick ? pick.name : null,
          vendorId: slot.role === 'vendor' && pick ? pick.id : null,
          vendorName: slot.role === 'vendor' && pick ? pick.name : null,
          clientId: slot.role === 'client' && pick ? pick.id : null,
          clientName: slot.role === 'client' && pick ? pick.name : null,
          party: intent.party,
          notes: intent.notes,
          dur: slot.role === 'driver' ? '45m' : '1h',
          raw: intent.raw || String(message || ''),
        });
        if (slot.role === 'vendor') vendorTaskId = t.id;
        childIds.push(t.id);
        tasks.push(t);

        try {
          if (pick && global.SNGlobe && SNGlobe.pulse) {
            SNGlobe.pulse(
              pick.lat,
              pick.lng,
              slot.role === 'driver' ? 0x44ffaa : slot.role === 'vendor' ? 0x3d9eff : 0xffcc66,
              String(pick.name).slice(0, 18),
              20000
            );
          }
        } catch (_) {}
      }
    });

    const plan = {
      id: planId,
      status: 'open',
      created: Date.now(),
      updated: Date.now(),
      raw: intent.raw || String(message || ''),
      food: intent.food || null,
      party: intent.party || null,
      roles: roleSpecs,
      taskIds: childIds,
      origin: { lat: origin.lat, lng: origin.lng },
      summary: '',
    };
    plan.summary = summarizePlan(plan, tasks);
    T.plans.set(planId, plan);
    save();

    try {
      if (global.SNMap && SNMap.active) {
        if (SNMap.showTasks) SNMap.showTasks();
        if (SNMap.showProfiles) SNMap.showProfiles();
      }
    } catch (_) {}

    try {
      if (global.SNGlobe && SNGlobe.setHud) SNGlobe.setHud('Plan · ' + childIds.length + ' tasks');
    } catch (_) {}

    return {
      ok: true,
      plan: plan,
      tasks: tasks,
      reply: plan.summary,
    };
  }

  function summarizePlan(plan, tasks) {
    tasks = tasks || list({ all: true, planId: plan.id });
    const bits = [];
    bits.push('Plan ' + String(plan.id).slice(-6));
    if (plan.food) bits.push(plan.food);
    if (plan.party) bits.push('for ' + plan.party);
    const byRole = {};
    tasks.forEach(function (t) {
      byRole[t.role] = byRole[t.role] || [];
      byRole[t.role].push(t);
    });
    const roleLines = [];
    Object.keys(byRole).forEach(function (role) {
      const arr = byRole[role];
      const names = arr
        .map(function (t) {
          return t.assigneeName || t.vendorName || t.targetName || 'open';
        })
        .slice(0, 3)
        .join(', ');
      roleLines.push(role + '×' + arr.length + (names ? ' → ' + names : ' (no nearby profiles yet)'));
    });
    const openN = tasks.filter(function (t) {
      return t.status === 'open';
    }).length;
    const claimedN = tasks.filter(function (t) {
      return t.status === 'claimed' || t.status === 'in_progress';
    }).length;
    const doneN = tasks.filter(function (t) {
      return t.status === 'done';
    }).length;
    return (
      bits.join(' · ') +
      ' · ' +
      roleLines.join(' · ') +
      ' · ' +
      openN +
      ' open / ' +
      claimedN +
      ' claimed / ' +
      doneN +
      ' done. claim · plan status · task map'
    );
  }

  function listPlans(filter) {
    filter = filter || {};
    let arr = [...T.plans.values()];
    if (!filter.all) arr = arr.filter(function (p) {
      return p.status !== 'done';
    });
    if (filter.status) arr = arr.filter(function (p) {
      return p.status === filter.status;
    });
    return arr.sort(function (a, b) {
      return (b.updated || b.created || 0) - (a.updated || a.created || 0);
    });
  }

  function getPlan(planId) {
    if (!planId) return listPlans()[0] || null;
    return (
      T.plans.get(planId) ||
      listPlans({ all: true }).find(function (p) {
        return p.id === planId || String(p.id).endsWith(planId);
      }) ||
      null
    );
  }

  function planStatus(planId) {
    const plan = getPlan(planId);
    if (!plan) return { ok: false, error: 'no plan · coord <text> first' };
    refreshPlan(plan.id);
    const tasks = list({ all: true, planId: plan.id });
    const summary = summarizePlan(plan, tasks);
    plan.summary = summary;
    T.plans.set(plan.id, plan);
    save();
    return { ok: true, plan: plan, tasks: tasks, reply: summary };
  }

  function assignPlan(messageOrOpts) {
    let opts = {};
    if (typeof messageOrOpts === 'string') {
      const low = messageOrOpts.toLowerCase();
      const dn = low.match(/(\d+)\s*(drivers?|couriers?)/);
      const vn = low.match(/(\d+)\s*(vendors?|shops?)/);
      opts = {
        drivers: dn ? parseInt(dn[1], 10) : null,
        vendors: vn ? parseInt(vn[1], 10) : null,
        raw: messageOrOpts,
      };
      if (!getPlan() && (opts.drivers || opts.vendors || /assign|nearest/.test(low))) {
        return createPlan(
          messageOrOpts ||
            'assign ' + (opts.drivers || 1) + ' drivers and ' + (opts.vendors || 1) + ' vendor nearest'
        );
      }
    } else {
      opts = messageOrOpts || {};
    }

    const plan = getPlan(opts.planId);
    if (!plan) {
      return createPlan(opts.raw || 'need driver and vendor at my location');
    }

    const origin = plan.origin || T.pos;
    const tasks = list({ all: true, planId: plan.id }).filter(function (t) {
      return t.status === 'open';
    });
    const updated = [];

    tasks.forEach(function (t) {
      const n =
        t.role === 'driver'
          ? opts.drivers || (t.assigneeHints && t.assigneeHints.length) || 1
          : t.role === 'vendor'
            ? opts.vendors || 1
            : 1;
      const hints = nearestByRole(t.role, n, origin);
      const pick = hints[0] || null;
      t.assigneeHints = hints.map(function (h) {
        return { id: h.id, name: h.name, km: h.km };
      });
      if (pick) {
        t.assigneeId = pick.id;
        t.assigneeName = pick.name;
        t.targetId = pick.id;
        t.targetName = pick.name;
        t.lat = pick.lat;
        t.lng = pick.lng;
        if (t.role === 'vendor') {
          t.vendorId = pick.id;
          t.vendorName = pick.name;
        }
      }
      T.tasks.set(t.id, t);
      updated.push(t);
      try {
        if (pick && global.SNGlobe && SNGlobe.pulse) {
          SNGlobe.pulse(pick.lat, pick.lng, 0x3d9eff, String(pick.name).slice(0, 16), 16000);
        }
      } catch (_) {}
    });

    refreshPlan(plan.id);
    save();
    try {
      if (global.SNMap && SNMap.active) {
        if (SNMap.showTasks) SNMap.showTasks();
        if (SNMap.showProfiles) SNMap.showProfiles();
      }
    } catch (_) {}

    const st = planStatus(plan.id);
    return {
      ok: true,
      plan: st.plan,
      tasks: updated,
      reply: 'Re-assigned ' + updated.length + ' open slots. ' + (st.reply || ''),
    };
  }

  function formatPlanCli(result) {
    if (!result) return 'No plan';
    if (!result.ok) return result.error || 'plan failed';
    const plan = result.plan;
    const tasks = result.tasks || list({ all: true, planId: plan && plan.id });
    const lines = [];
    lines.push(result.reply || summarizePlan(plan, tasks));
    (tasks || []).slice(0, 8).forEach(function (t) {
      lines.push(
        '  ' +
          (t.status || 'open') +
          ' · ' +
          (t.role || '?') +
          ' · ' +
          (t.assigneeName || 'unassigned') +
          ' · ' +
          String(t.title || '').slice(0, 40)
      );
    });
    return lines.join('\n');
  }

  load();

  try {
    setInterval(function () {
      try {
        expireOldTasks(24 * 3600 * 1000);
      } catch (_) {}
    }, 10 * 60 * 1000);
  } catch (_) {}
  global.SNTasks = {
    create: create,
    get: get,
    list: list,
    save: save,
    getByShort: getByShort,
    expireOldTasks: expireOldTasks,
    claim: claim,
    complete: complete,
    search: search,
    parse: parse,
    seedDemo: seedDemo,
    setPos: setPos,
    CATALOG: CATALOG,
    KINDS: KINDS,
    isCoordIntent: isCoordIntent,
    parseCoordIntent: parseCoordIntent,
    createPlan: createPlan,
    listPlans: listPlans,
    getPlan: getPlan,
    planStatus: planStatus,
    assignPlan: assignPlan,
    nearestByRole: nearestByRole,
    summarizePlan: summarizePlan,
    formatPlanCli: formatPlanCli,
    refreshPlan: refreshPlan,
    get pos() {
      return T.pos;
    },
  };
})(window);
