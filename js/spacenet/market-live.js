/**
 * SNMarketLive — real-time marketplace activity
 *
 * - Delivery routing polygons (radar + optional map polylines)
 * - Full CLI I/O of every IN / OUT
 * - Feeds SNFreeMind so SpaceNet Free improves from real loops
 */
(function (global) {
  'use strict';

  var mapLines = [];
  var lastFocus = { lat: 36.4341, lng: 28.2176 };

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
    } catch (e) {}
  }

  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m).slice(0, 90));
    } catch (e) {}
    try {
      if (global.SNGlobe && SNGlobe.setHud) SNGlobe.setHud(String(m).slice(0, 72));
    } catch (e2) {}
  }

  /** Full text I/O on CLI — every marketplace event */
  function io(dir, actor, text, cls) {
    var d = String(dir || 'OUT').toUpperCase();
    var a = String(actor || 'SpaceNet').slice(0, 28);
    var t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    var line =
      d === 'IN'
        ? '› [' + a + '] IN  · ' + t
        : d === 'SYS'
          ? '· [' + a + '] SYS · ' + t
          : '  [' + a + '] OUT · ' + t;
    log(line, cls || (d === 'IN' ? 'cmd' : d === 'SYS' ? 'dim' : 'ok'));
    // Do NOT auto-learn every OUT line — that poisoned free mind with
    // random names / log spam (e.g. "Elizabeth Candy"). Teach only deliberate product facts.
    return line;
  }

  /** Never auto-expand radar (blocks city map). User taps radar if they want big view. */
  function expandRadar() {
    /* no-op by product law */
  }

  function clearMapLines() {
    mapLines.forEach(function (L) {
      try {
        if (L && L.remove) L.remove();
      } catch (e) {}
    });
    mapLines = [];
  }

  /**
   * Draw delivery / work route as radar polygon corridor + map polyline when city map open.
   * Uses OSRM when available (via SNField.showRoute).
   */
  async function paintRoute(from, to, opts) {
    opts = opts || {};
    if (!from || !to || from.lat == null || to.lat == null) return null;
    lastFocus = { lat: from.lat, lng: from.lng };
    expandRadar();
    var label = opts.label || 'Route';
    var id = opts.id || 'ml_' + Date.now().toString(36);
    var row = null;
    try {
      if (global.SNField && SNField.showRoute) {
        row = await SNField.showRoute(
          [
            { lat: Number(from.lat), lng: Number(from.lng) },
            { lat: Number(to.lat), lng: Number(to.lng) },
          ],
          {
            id: id,
            label: label,
            kind: opts.kind || 'delivery',
            osrm: true,
            color: opts.color || 'rgba(61,158,255,0.95)',
          }
        );
      }
    } catch (e) {
      io('SYS', 'route', 'radar route fail · ' + (e.message || e), 'err');
    }
    try {
      if (global.SNField && SNField.refreshRoutes) void SNField.refreshRoutes(true);
    } catch (e2) {}
    // Map polyline if Leaflet city map active
    try {
      if (global.SNMap && SNMap.active && global.L) {
        var map = await SNMap.ensure();
        if (map && row && row.points && row.points.length >= 2) {
          var latlngs = row.points.map(function (p) {
            return [p.lat, p.lng];
          });
          var poly = L.polyline(latlngs, {
            color: opts.mapColor || '#3d9eff',
            weight: 5,
            opacity: 0.85,
            lineJoin: 'round',
          }).addTo(map);
          try {
            poly.bindPopup(label);
          } catch (e3) {}
          mapLines.push(poly);
          if (mapLines.length > 10) {
            try {
              mapLines.shift().remove();
            } catch (e4) {}
          }
          try {
            map.fitBounds(poly.getBounds(), { padding: [40, 40], maxZoom: 14 });
          } catch (e5) {}
        }
      }
    } catch (eM) {}
    // Globe pulses at pickup + drop
    try {
      if (global.SNGlobe && SNGlobe.pulse) {
        SNGlobe.pulse(from.lat, from.lng, 0x44ffaa, 'Pickup', 12000);
        SNGlobe.pulse(to.lat, to.lng, 0xff6688, 'Drop', 12000);
      }
      if (global.SNGlobe && SNGlobe.goToPlace) {
        var midLat = (Number(from.lat) + Number(to.lat)) / 2;
        var midLng = (Number(from.lng) + Number(to.lng)) / 2;
        SNGlobe.goToPlace(midLat, midLng, {
          tier: 'city',
          body: 'earth',
          pulse: false,
          label: label,
        });
      }
    } catch (eG) {}
    io('OUT', 'route', label + ' · polygon on radar' + (row && row.points ? ' · ' + row.points.length + ' pts' : ''));
    preview('Route · ' + label);
    return row;
  }

  /**
   * Full order loop: client opens vendor menu tile → cart → order → route polygon → optional driver claim.
   */
  async function runOrderLoop(client, vendor, opts) {
    opts = opts || {};
    if (!client || !vendor || !global.SNProfiles) {
      io('SYS', 'order', 'missing client/vendor', 'err');
      return { ok: false, error: 'missing' };
    }
    var actorC = client.name || client.id || 'client';
    var actorV = vendor.shopName || vendor.name || 'vendor';
    io(
      'IN',
      actorC,
      'order from vendor · ' +
        actorV +
        ' @ ' +
        (vendor.lat && vendor.lat.toFixed ? vendor.lat.toFixed(3) : '')
    );
    try {
      if (global.SNProfiles.setMe) SNProfiles.setMe(client.id);
    } catch (e) {}
    // Never auto-open multi-tile (blocks city map) — user taps targets
    io('OUT', actorV, 'menu ready · ' + ((vendor.menu && vendor.menu.length) || 0) + ' items · tap map to open');

    var item = (vendor.menu && vendor.menu[0]) || null;
    if (!item) {
      io('OUT', actorV, 'no menu items · cannot order', 'err');
      return { ok: false, error: 'no menu' };
    }
    io('IN', actorC, 'order · ' + item.name + ' · ' + item.price + ' S');

    try {
      if (global.SNCurrency && SNCurrency.balance && SNCurrency.balance() < (item.price || 10) + 5) {
        SNCurrency.credit(100, 'marketplace live top-up');
        io('SYS', 'wallet', 'top-up 100 S for order');
      }
    } catch (eW) {}

    try {
      SNProfiles.cartClear && SNProfiles.cartClear();
      SNProfiles.cartAdd(vendor.id, item, 1);
      io('OUT', 'cart', '+ ' + item.name + ' from ' + actorV);
    } catch (eC) {
      io('OUT', 'cart', 'fail · ' + (eC.message || eC), 'err');
      return { ok: false, error: 'cart' };
    }

    // Drop = client position
    try {
      global._snLastPos = { lat: client.lat, lng: client.lng };
      if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(client.lat, client.lng);
    } catch (eP) {}

    var ord = null;
    try {
      ord = SNProfiles.placeOrder();
    } catch (eO) {
      io('OUT', 'order', 'fail · ' + (eO.message || eO), 'err');
      return { ok: false, error: 'order' };
    }
    if (!ord || !ord.ok) {
      io('OUT', 'order', (ord && ord.error) || 'failed', 'err');
      return { ok: false, error: (ord && ord.error) || 'order' };
    }
    io(
      'OUT',
      actorC,
      'ORDER PLACED · ' +
        (global.SNCurrency && SNCurrency.format
          ? SNCurrency.format(ord.total)
          : (ord.total || 0) + ' S') +
        ' · task ' +
        ((ord.task && ord.task.id) || '')
    );
    io('OUT', actorV, 'SHIPPING · prepare goods · pickup at vendor');

    var pickup = { lat: vendor.lat, lng: vendor.lng };
    var drop = {
      lat: client.lat != null ? client.lat : ord.task && ord.task.drop_lat,
      lng: client.lng != null ? client.lng : ord.task && ord.task.drop_lng,
    };
    if (ord.task) {
      try {
        ord.task.lat = pickup.lat;
        ord.task.lng = pickup.lng;
        ord.task.drop_lat = drop.lat;
        ord.task.drop_lng = drop.lng;
      } catch (eT2) {}
    }

    var route = null;
    try {
      if (global.SNField && SNField.startDeliveryRoute) {
        route = await SNField.startDeliveryRoute({
          id: 'live:' + ((ord.task && ord.task.id) || Date.now()),
          vendorLat: pickup.lat,
          vendorLng: pickup.lng,
          dropLat: drop.lat,
          dropLng: drop.lng,
          label: '🛵 ' + String(item.name).slice(0, 12),
          driver: 'Driver',
          color: 'rgba(68,255,170,0.95)',
        });
        io(
          'OUT',
          'route',
          'Route · vendor→client · ETA ' +
            ((route && route.eta) || '?') +
            ' · ' +
            Math.round((route && route.speedKmh) || 0) +
            ' km/h'
        );
      } else {
        route = await paintRoute(pickup, drop, {
          id: 'order:' + ((ord.task && ord.task.id) || Date.now()),
          label: '📦 ' + String(item.name).slice(0, 14),
          kind: 'delivery',
          color: 'rgba(68,255,170,0.95)',
          mapColor: '#44ffaa',
        });
      }
    } catch (eR) {
      io('SYS', 'route', String(eR.message || eR), 'err');
    }

    try {
      if (global.SNMap && SNMap.showTasks) SNMap.showTasks();
      if (global.SNMap && SNMap.showProfiles) SNMap.showProfiles();
    } catch (eM) {}

    try {
      if (global.SNUsage && SNUsage.track) {
        SNUsage.track('market_live_order', {
          vendorId: vendor.id,
          clientId: client.id,
          total: ord.total,
          taskId: ord.task && ord.task.id,
        });
      }
    } catch (eU) {}

    try {
      if (global.SNFreeMind && SNFreeMind.teach) {
        SNFreeMind.teach(
          'order from vendor tile',
          'Open menu · + cart · order in S · route polygon pickup→drop'
        );
        SNFreeMind.teach(
          'delivery route',
          'Radar shows corridor polygon · driver claims · complete delivery'
        );
      }
    } catch (eF) {}

    return {
      ok: true,
      order: ord,
      task: ord.task,
      route: route,
      pickup: pickup,
      drop: drop,
      item: item,
      vendor: vendor,
      client: client,
    };
  }

  /** Driver claims open delivery — keep route visible */
  async function runDriverClaim(driver, task) {
    if (!driver || !task || !global.SNTasks) return { ok: false };
    var name = driver.name || driver.id || 'driver';
    io('IN', name, 'claim delivery · ' + (task.title || task.id));
    try {
      if (global.SNProfiles && SNProfiles.setMe) SNProfiles.setMe(driver.id);
    } catch (e) {}
    var c = SNTasks.claim(task.id);
    if (!c || !c.ok) {
      io('OUT', name, (c && c.error) || 'claim fail', 'err');
      return { ok: false };
    }
    if (c.task) {
      c.task.driverId = driver.id;
      c.task.status = 'in_progress';
    }
    io('OUT', name, 'CLAIMED · in progress · routing');
    var pickup = { lat: task.lat, lng: task.lng };
    var drop = {
      lat: task.drop_lat != null ? task.drop_lat : driver.lat,
      lng: task.drop_lng != null ? task.drop_lng : driver.lng,
    };
    await paintRoute(pickup, drop, {
      id: 'drive:' + task.id,
      label: '🛵 ' + name.slice(0, 12),
      kind: 'delivery',
      color: 'rgba(255,204,68,0.95)',
      mapColor: '#ffcc44',
    });
    return { ok: true, task: c.task };
  }

  async function runDriverComplete(driver, task) {
    if (!task || !global.SNTasks) return { ok: false };
    var name = (driver && driver.name) || 'driver';
    io('IN', name, 'complete delivery · ' + (task.id || ''));
    var d = SNTasks.complete(task.id);
    if (d && d.ok) {
      // settleOrder already ran inside complete — never double-credit
      var st = d.settled || {};
      io(
        'OUT',
        name,
        st.ok
          ? 'DELIVERED · driver +' +
              (st.driverPaid || 0) +
              ' S · vendor +' +
              (st.vendorPaid || 0) +
              ' S'
          : 'DELIVERED · done'
      );
      return { ok: true, task: d.task, settled: st };
    }
    io('OUT', name, (d && d.error) || 'complete fail', 'err');
    return { ok: false };
  }

  /** Worker receives job offer near hub */
  function postWorkOffer(workerHub, opts) {
    opts = opts || {};
    var jobs = [
      'job barman 3h',
      'job waiter 5h taverna',
      'job cleaner 4h hotel',
      'job tutor 2h',
      'errand pharmacy',
    ];
    var raw = opts.raw || jobs[Math.floor(Math.random() * jobs.length)];
    io('SYS', 'work', 'post offer · ' + raw);
    if (!global.SNTasks || !SNTasks.create) return null;
    var t = SNTasks.create({
      kind: /errand/.test(raw) ? 'errand' : 'job',
      role: 'worker',
      title: '🧰 ' + raw.slice(0, 40),
      raw: raw,
      lat: workerHub && workerHub.lat != null ? workerHub.lat : 36.4341,
      lng: workerHub && workerHub.lng != null ? workerHub.lng : 28.2176,
      dur: '3h',
    });
    io('OUT', 'work', 'OFFER OPEN · ' + (t && t.title));
    try {
      if (global.SNGlobe && SNGlobe.pulse && t) {
        SNGlobe.pulse(t.lat, t.lng, 0x66aaff, t.title.slice(0, 18), 14000);
      }
      if (global.SNMap && SNMap.showTasks) SNMap.showTasks();
    } catch (e) {}
    try {
      if (global.SNFreeMind && SNFreeMind.teach) {
        SNFreeMind.teach('work offer', 'Workers get job tasks on map · claim · complete · S');
      }
    } catch (e2) {}
    return t;
  }

  function claimWork(worker, task) {
    if (!worker || !task || !global.SNTasks) return { ok: false };
    var name = worker.name || 'worker';
    io('IN', name, 'receive work offer · ' + (task.title || ''));
    try {
      if (global.SNProfiles && SNProfiles.setMe) SNProfiles.setMe(worker.id);
      var p = SNProfiles.get(worker.id);
      if (p) {
        p.roles = p.roles || {};
        p.roles.worker = true;
        SNProfiles.upsert(p);
      }
    } catch (e) {}
    var c = SNTasks.claim(task.id);
    if (c && c.ok) {
      io('OUT', name, 'WORK ACCEPTED · ' + (c.task && c.task.title));
      try {
        if (global.SNGlobe && SNGlobe.pulse) {
          SNGlobe.pulse(task.lat, task.lng, 0x66ffcc, 'Work', 10000);
        }
      } catch (e2) {}
      return { ok: true, task: c.task };
    }
    io('OUT', name, (c && c.error) || 'claim fail', 'err');
    return { ok: false };
  }

  global.SNMarketLive = {
    io: io,
    paintRoute: paintRoute,
    runOrderLoop: runOrderLoop,
    runDriverClaim: runDriverClaim,
    runDriverComplete: runDriverComplete,
    postWorkOffer: postWorkOffer,
    claimWork: claimWork,
    expandRadar: expandRadar,
    clearMapLines: clearMapLines,
  };
})(typeof window !== 'undefined' ? window : globalThis);
