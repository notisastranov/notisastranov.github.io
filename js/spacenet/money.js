/**
 * SNMoney — delivery marketplace money path (P0)
 * =================================================
 * Power ON → INSTANT glowing offers (never wait on network) → Accept → Start
 * → polygon route → pay S/Æ → Complete. Crawl enriches in background.
 * AI + CLI drive the same verbs.
 *
 * CLI: money · market on · power on · first delivery · crawl shops · pay
 * SPECS: Astranov AI · S primary · 3% vault · no full-screen walls
 */
(function (global) {
  'use strict';

  var active = false;
  var lastCrawl = null;
  var gen = 0;
  var DEFAULT_POS = { lat: 36.4341, lng: 28.2176, source: 'demo-kitchen', fake: true };

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'ok');
    } catch (_) {}
  }
  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m || '').slice(0, 48));
    } catch (_) {}
  }
  function pos() {
    // Prefer real GPS / phys / last good — never silently claim demo Rhodes as you
    var p =
      global._snPhysPos ||
      (global._snLastPos && !global._snLastPos.fake && global._snLastPos.lat != null
        ? global._snLastPos
        : null) ||
      (global.SNTasks && SNTasks.pos) ||
      null;
    if (p && p.lat != null && p.lng != null) {
      // Reject hard-coded Rhodes demo if marked or classic pin without real/gps source
      try {
        if (global.SNCli && SNCli.isFakeDemoPin && SNCli.isFakeDemoPin(p.lat, p.lng)) {
          if (!(p.real || p.source === 'gps' || p.source === 'gps-watch')) {
            p = null;
          }
        }
      } catch (_) {}
    }
    if (!p || p.lat == null || p.lng == null) return Object.assign({}, DEFAULT_POS);
    return { lat: Number(p.lat), lng: Number(p.lng), source: p.source || 'pin' };
  }

  /** Kill every full-screen blocker so Earth + chrome work */
  function clearBlockers() {
    try {
      if (global.SNUi && SNUi.dismissCoach) SNUi.dismissCoach();
    } catch (_) {}
    ['coach', 'sn-miner-terms', 'sn-home-menu', 'boot'].forEach(function (id) {
      try {
        var el = document.getElementById(id);
        if (!el) return;
        if (id === 'boot') {
          el.classList.add('hide');
          el.style.display = 'none';
          el.style.pointerEvents = 'none';
          return;
        }
        el.hidden = true;
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      } catch (_) {}
    });
    try {
      document.body.classList.remove('sn-space-scene-on', 'sn-game-dock-on');
    } catch (_) {}
    try {
      if (global.SNSpaceScene && SNSpaceScene.active && SNSpaceScene.stop) SNSpaceScene.stop();
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.setGameMode) SNGlobe.setGameMode(false);
    } catch (_) {}
    try {
      var gd = document.getElementById('sn-game-dock');
      if (gd) gd.remove();
    } catch (_) {}
  }

  function ensureWallet(minBal) {
    minBal = minBal != null ? minBal : 50;
    try {
      if (!global.SNCurrency) return;
      var bal = SNCurrency.balance != null ? Number(SNCurrency.balance) : 0;
      if (typeof SNCurrency.balance === 'function') bal = Number(SNCurrency.balance()) || 0;
      if (!isFinite(bal)) bal = 0;
      if (bal < minBal) {
        var need = minBal - bal;
        if (SNCurrency.creditMined) SNCurrency.creditMined(need);
        else if (SNCurrency.credit) SNCurrency.credit(need, 'starter float');
        log('Wallet · ' + (SNCurrency.format ? SNCurrency.format(minBal) : minBal + ' Æ') + ' ready', 'dim');
      }
    } catch (_) {}
  }

  /** Honest local kitchen — always returns places with lat/lng + menu so money path never dies */
  function localKitchen(p) {
    p = p || pos();
    var lat = Number(p.lat);
    var lng = Number(p.lng);
    var places = [
      {
        id: 'lk_nonna',
        name: 'Nonna Fires',
        shopName: 'Nonna Fires',
        shopKind: 'pizza',
        lat: lat + 0.0042,
        lng: lng + 0.0028,
        _km: 0.9,
        _price: 12.5,
        rating: 4.7,
        openNow: true,
        phone: '+30 2241 000111',
        hours: '12:00–01:00',
        menu: [
          { id: 'm_sg', name: 'Super Greek special', price: 12.5, emoji: '🍕' },
          { id: 'm_marg', name: 'Margherita', price: 9.5, emoji: '🍅' },
          { id: 'm_ret', name: 'Retsina half', price: 6.0, emoji: '🍷' },
        ],
      },
      {
        id: 'lk_oven',
        name: 'Oven 23',
        shopName: 'Oven 23',
        shopKind: 'pizza',
        lat: lat - 0.0031,
        lng: lng + 0.0045,
        _km: 1.4,
        _price: 11,
        rating: 4.4,
        openNow: true,
        phone: '+30 2241 000222',
        hours: '11:30–00:30',
        menu: [
          { id: 'm_pep', name: 'Pepperoni', price: 11.0, emoji: '🍕' },
          { id: 'm_veg', name: 'Garden veg', price: 10.0, emoji: '🥦' },
          { id: 'm_soda', name: '1.5L soda', price: 2.5, emoji: '🥤' },
        ],
      },
      {
        id: 'lk_gyros',
        name: 'Gyros Corner',
        shopName: 'Gyros Corner',
        shopKind: 'grill',
        lat: lat + 0.0018,
        lng: lng - 0.0036,
        _km: 0.7,
        _price: 8.5,
        rating: 4.5,
        openNow: true,
        phone: '+30 2241 000333',
        hours: '11:00–02:00',
        menu: [
          { id: 'm_pit', name: 'Pito gyros pork', price: 4.5, emoji: '🥙' },
          { id: 'm_por', name: 'Portion mixed', price: 8.5, emoji: '🍖' },
          { id: 'm_bir', name: 'Local beer', price: 3.5, emoji: '🍺' },
        ],
      },
      {
        id: 'lk_cafe',
        name: 'Mesh Cafe',
        shopName: 'Mesh Cafe',
        shopKind: 'cafe',
        lat: lat - 0.0024,
        lng: lng - 0.0019,
        _km: 0.55,
        _price: 6.2,
        rating: 4.3,
        openNow: true,
        phone: '+30 2241 000444',
        hours: '08:00–22:00',
        menu: [
          { id: 'm_fred', name: 'Freddo espresso', price: 3.2, emoji: '☕' },
          { id: 'm_toast', name: 'Club toast', price: 6.2, emoji: '🥪' },
          { id: 'm_cake', name: 'Honey cake', price: 4.0, emoji: '🍰' },
        ],
      },
      {
        id: 'lk_gelato',
        name: 'Gelato Lab',
        shopName: 'Gelato Lab',
        shopKind: 'gelato',
        lat: lat + 0.0055,
        lng: lng - 0.0022,
        _km: 2.1,
        _price: 7.5,
        rating: 4.8,
        openNow: true,
        nature: 'frozen',
        phone: '+30 2241 000555',
        hours: '12:00–23:00',
        menu: [
          { id: 'm_gel', name: 'Gelato box', price: 7.5, emoji: '🍦', nature: 'frozen' },
          { id: 'm_sor', name: 'Sorbet pack', price: 6.5, emoji: '🍧', nature: 'frozen' },
        ],
      },
      {
        id: 'lk_post',
        name: 'City Post Desk',
        shopName: 'City Post Desk',
        shopKind: 'courier',
        lat: lat - 0.006,
        lng: lng + 0.003,
        _km: 4.5,
        _price: 3,
        rating: 4.1,
        openNow: true,
        nature: 'documents',
        phone: '+30 2241 000666',
        hours: '09:00–17:00',
        menu: [
          { id: 'm_env', name: 'Paper envelopes batch', price: 3, emoji: '✉️', nature: 'documents' },
          { id: 'm_doc', name: 'Documents pack', price: 4, emoji: '📄', nature: 'documents' },
        ],
      },
    ];
    return { ok: true, count: places.length, places: places, source: 'local-kitchen' };
  }

  function plotPlaces(places) {
    try {
      (places || []).slice(0, 12).forEach(function (pl) {
        var lat = pl.lat != null ? pl.lat : pl.latitude;
        var lng = pl.lng != null ? pl.lng : pl.longitude;
        if (lat == null || lng == null) return;
        if (global.SNGlobe && SNGlobe.pulse) {
          SNGlobe.pulse(lat, lng, 0xffc83d, String(pl.shopName || pl.name || 'Shop').slice(0, 18), 14000);
        }
      });
    } catch (_) {}
  }

  async function locateSoft() {
    // Prefer shared real GPS (high accuracy + IP soft) — never pretend Rhodes is you
    try {
      if (global.SNCli && SNCli.gpsLocate) {
        var row = await SNCli.gpsLocate({ allowIp: true, allowSoft: true });
        if (row && row.lat != null) {
          return { lat: row.lat, lng: row.lng, source: row.source, fallback: row.fallback };
        }
      }
    } catch (_) {}
    return new Promise(function (resolve) {
      try {
        if (!navigator.geolocation) {
          resolve(pos());
          return;
        }
        navigator.geolocation.getCurrentPosition(
          function (g) {
            var p = {
              lat: g.coords.latitude,
              lng: g.coords.longitude,
              accuracy: g.coords.accuracy,
              source: 'gps',
              real: true,
            };
            global._snLastPos = p;
            global._snPhysPos = p;
            try {
              if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(p.lat, p.lng);
            } catch (_) {}
            try {
              if (global.SNCli && SNCli.commitRealGps) SNCli.commitRealGps(p);
            } catch (_) {}
            try {
              if (global.SNGlobe && SNGlobe.goToPlace)
                SNGlobe.goToPlace(p.lat, p.lng, { quiet: true, openMap: true, label: 'You' });
            } catch (_) {}
            resolve(p);
          },
          function () {
            resolve(pos());
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      } catch (_) {
        resolve(pos());
      }
    });
  }

  async function crawlNear(query) {
    query = query || 'restaurants cafes pizza food shops';
    var p = pos();
    var results = { ok: false, count: 0, places: [], source: 'none' };
    // Cap each remote attempt so money path never freezes
    function withTimeout(promise, ms) {
      return Promise.race([
        promise,
        new Promise(function (res) {
          setTimeout(function () {
            res(null);
          }, ms);
        }),
      ]);
    }
    try {
      if (global.SNVendorCrawl && SNVendorCrawl.scan) {
        var vc = await withTimeout(SNVendorCrawl.scan(p, { query: query, radiusKm: 5 }), 3500);
        if (vc && (vc.places || vc.list || vc.count)) {
          results.places = vc.places || vc.list || [];
          results.count = results.places.length || vc.count || 0;
          results.source = 'vendor-crawl';
          results.ok = results.count > 0;
        }
      }
    } catch (_) {}
    try {
      if ((!results.count || results.count < 1) && global.SNSearch && SNSearch.crawl) {
        var c = await withTimeout(
          SNSearch.crawl(query, {
            lat: p.lat,
            lng: p.lng,
            openMap: false,
            mode: 'map',
            radiusKm: 5,
          }),
          3500
        );
        var stuff = (c && (c.nearby || c.places)) || [];
        if (stuff.length) {
          results.places = stuff;
          results.count = stuff.length;
          results.source = 'search-crawl';
          results.ok = true;
        }
      }
    } catch (_) {}
    try {
      if ((!results.count || results.count < 1) && global.SNCommerce && SNCommerce.scanShops) {
        var s = await withTimeout(SNCommerce.scanShops(p, { food: 'pizza' }), 3000);
        if (s && s.count) {
          results.count = s.count;
          results.places = s.places || s.shops || [];
          results.source = s.source || 'commerce';
          results.ok = true;
        }
      }
    } catch (_) {}
    // Market seed if profiles ready
    if (!results.count) {
      try {
        if (global.SNMarket && SNMarket.seedTestSector) {
          var seed = SNMarket.seedTestSector(p, { food: 'pizza' });
          var shops = (seed && (seed.shops || seed.places)) || [];
          if (shops.length) {
            results.places = shops;
            results.count = shops.length;
            results.source = 'local-kitchen';
            results.ok = true;
          }
        }
      } catch (_) {}
    }
    // Always-available kitchen — never leave money path empty
    if (!results.count) {
      results = localKitchen(p);
    }
    lastCrawl = results;
    plotPlaces(results.places);
    return results;
  }

  function stackLen() {
    try {
      if (global.SNOfferStack && SNOfferStack.list) return SNOfferStack.list().length;
    } catch (_) {}
    return 0;
  }

  function throwOffers(opts) {
    opts = opts || {};
    if (!global.SNOfferStack || !SNOfferStack.testThrow) {
      log('Offers loading · try again in 1s', 'dim');
      setTimeout(function () {
        try {
          if (global.SNOfferStack && SNOfferStack.testThrow) throwOffers(opts);
        } catch (_) {}
      }, 600);
      return { ok: false, count: 0 };
    }
    // ONE visible tile; rest queue one-by-one (owner rule)
    var n = opts.count != null ? Math.min(6, Number(opts.count)) : 1;
    var out = [];
    var catalog = [];
    try {
      if (global.SNDeliveryRules && SNDeliveryRules.sampleCatalog) {
        catalog = SNDeliveryRules.sampleCatalog().slice();
      }
    } catch (_) {}
    var places = (lastCrawl && lastCrawl.places) || [];
    if (!places.length) {
      lastCrawl = localKitchen(pos());
      places = lastCrawl.places;
    }
    // Build job list: diversify natures
    var jobs = [];
    for (var i = 0; i < Math.max(n, catalog.length) && jobs.length < n; i++) {
      var sample = catalog[i % Math.max(1, catalog.length)] || {
        nature: 'hot_food',
        title: 'Hot food run',
        product: 'House special',
        vendorName: 'Kitchen',
        km: 1.5,
      };
      var pl = places[i % places.length] || {};
      jobs.push({
        km: sample.km != null ? sample.km : pl._km != null ? pl._km : 1.5,
        nature: sample.title,
        natureId: sample.nature || pl.nature,
        product: sample.product,
        title: sample.title,
        vendorName: sample.vendorName || pl.shopName || pl.name || 'Kitchen',
        vendorId: pl.id || sample.vendorName,
        vendorLat: pl.lat != null ? pl.lat : pl.latitude,
        vendorLng: pl.lng != null ? pl.lng : pl.longitude,
        heavy: sample.nature === 'heavy',
      });
    }
    if (!jobs.length) {
      jobs.push({
        km: 2.4,
        nature: 'Hot food',
        natureId: 'hot_food',
        product: 'House special',
        title: 'Hot food run',
        vendorName: 'Night Kitchen',
      });
    }
    // First job NOW; rest staggered into queue
    function throwOne(job, idx) {
      try {
        return SNOfferStack.testThrow({
          persist: true,
          km: job.km,
          nature: job.nature,
          natureId: job.natureId,
          product: job.product,
          title: job.title,
          vendorName: job.vendorName,
          vendorId: job.vendorId,
          clientName: 'You',
          vendorLat: job.vendorLat,
          vendorLng: job.vendorLng,
          heavy: job.heavy,
          skipModeFlip: true,
        });
      } catch (eT) {
        try {
          log('Offer · ' + (eT && eT.message ? eT.message : eT), 'err');
        } catch (_) {}
        return null;
      }
    }
    var first = throwOne(jobs[0], 0);
    if (first) out.push(first);
    for (var j = 1; j < jobs.length; j++) {
      (function (job, delay) {
        setTimeout(function () {
          if (!active) return;
          throwOne(job, 0);
          try {
            if (global.SNOfferStack && SNOfferStack.paint) SNOfferStack.paint();
          } catch (_) {}
        }, delay);
      })(jobs[j], 1100 * j);
    }
    try {
      if (global.SNOfferStack && SNOfferStack.paint) SNOfferStack.paint();
    } catch (_) {}
    var len = stackLen() || out.length;
    var qn = 0;
    try {
      if (global.SNOfferStack && SNOfferStack.queueLen) qn = SNOfferStack.queueLen();
    } catch (_) {}
    log(
      'Offers · 1 live' +
        (qn || jobs.length > 1 ? ' · ' + (qn || jobs.length - 1) + ' queued' : '') +
        ' · Accept → Start → Arrive → 3× OK → Settle',
      'ok'
    );
    preview('1 offer');
    return { ok: true, count: len, throws: out, queued: jobs.length - 1 };
  }

  /**
   * Power ON growers — populate glowing vendor tiles with details + menu + prices.
   * No real drivers: order buttons commission Rai silver helper (drone mode).
   */
  function throwGrowers(opts) {
    opts = opts || {};
    if (!global.SNOfferStack || !SNOfferStack.pushVendor) {
      log('Growers · offer stack loading…', 'dim');
      setTimeout(function () {
        try {
          if (global.SNOfferStack && SNOfferStack.pushVendor) throwGrowers(opts);
        } catch (_) {}
      }, 500);
      return { ok: false, count: 0 };
    }
    if (!lastCrawl || !lastCrawl.count) {
      lastCrawl = localKitchen(pos());
    }
    var places = (lastCrawl && lastCrawl.places) || [];
    if (!places.length) {
      lastCrawl = localKitchen(pos());
      places = lastCrawl.places;
    }
    var n = opts.count != null ? opts.count : Math.min(2, places.length);
    var out = [];
    for (var i = 0; i < places.length && out.length < n; i++) {
      var pl = places[i];
      var menu = pl.menu || pl.items || [];
      // Ensure at least a synthetic menu if crawl returned bare POI
      if (!menu.length) {
        var base = pl._price != null ? Number(pl._price) : 9;
        menu = [
          { id: 'g_a', name: 'House special', price: base, emoji: '⭐' },
          { id: 'g_b', name: 'Combo meal', price: Math.round((base + 3) * 10) / 10, emoji: '🍱' },
          { id: 'g_c', name: 'Drink', price: 2.5, emoji: '🥤' },
        ];
      }
      var profile = {
        id: pl.id || 'grower_' + i + '_' + Date.now().toString(36),
        shopName: pl.shopName || pl.name || 'Kitchen',
        name: pl.name || pl.shopName || 'Kitchen',
        shopKind: pl.shopKind || pl.category || 'food',
        lat: pl.lat != null ? pl.lat : pl.latitude,
        lng: pl.lng != null ? pl.lng : pl.longitude,
        _km: pl._km != null ? pl._km : pl.km,
        _price: pl._price != null ? pl._price : menu[0] && menu[0].price,
        rating: pl.rating,
        openNow: pl.openNow !== false,
        phone: pl.phone || '',
        hours: pl.hours || 'open',
        menu: menu,
      };
      try {
        var tile =
          SNOfferStack.pushVendorMenu
            ? SNOfferStack.pushVendorMenu(profile, { grower: true })
            : SNOfferStack.pushVendor(profile, {
                item: menu[0] && menu[0].name,
                menu: menu,
                grower: true,
              });
        if (tile) out.push(tile);
      } catch (eG) {
        try {
          log('Grower · ' + (eG && eG.message ? eG.message : eG), 'err');
        } catch (_) {}
      }
    }
    try {
      if (global.SNOfferStack && SNOfferStack.paint) SNOfferStack.paint();
    } catch (_) {}
    log(
      'Growers · ' +
        out.length +
        ' vendor tile(s) · menu + prices · order → Rai drone',
      'ok'
    );
    preview(out.length + ' shops');
    return { ok: true, count: out.length, tiles: out };
  }

  /** Draw radar/map polygon for first open offer so route is visible immediately */
  function drawMoneyRoutes() {
    try {
      var list = global.SNOfferStack && SNOfferStack.list ? SNOfferStack.list() : [];
      var o = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].kind === 'task' && list[i].task) {
          o = list[i];
          break;
        }
      }
      if (!o || !o.task) return;
      // Prefer multi-stop polygon with vendor/client labels
      try {
        if (global.SNOfferStack && SNOfferStack.drawAllPolygons) {
          SNOfferStack.drawAllPolygons(o);
          return;
        }
      } catch (_) {}
      var t = o.task;
      var p = pos();
      var vLat = t.lat != null ? Number(t.lat) : p.lat + 0.004;
      var vLng = t.lng != null ? Number(t.lng) : p.lng + 0.003;
      var dLat = t.drop_lat != null ? Number(t.drop_lat) : p.lat;
      var dLng = t.drop_lng != null ? Number(t.drop_lng) : p.lng;
      var vName = o.vendorName || t.vendorName || 'Vendor';
      var cName = o.clientName || t.clientName || 'You';
      if (global.SNField && SNField.startDeliveryRoute) {
        void SNField.startDeliveryRoute({
          id: 'live:money_' + (t.id || Date.now()),
          vendorLat: vLat,
          vendorLng: vLng,
          dropLat: dLat,
          dropLng: dLng,
          waypoints: [
            { lat: vLat, lng: vLng, label: vName },
            { lat: dLat, lng: dLng, label: cName },
          ],
          label: String(vName + ' → ' + cName).slice(0, 28),
          driver: 'route',
          color: 'rgba(40,160,255,0.95)',
          etaMin: t.etaMin || 18,
          speedKmh: 22,
        });
      }
      if (global.SNField && SNField.setRadarExpanded) SNField.setRadarExpanded(true);
    } catch (_) {}
  }

  /**
   * SYNC activate core — paints offers before any network wait.
   * Returns immediately usable state; crawl runs in background.
   */
  function activateSync(opts) {
    opts = opts || {};
    clearBlockers();
    active = true;
    gen++;
    var myGen = gen;
    try {
      if (global.SNField && SNField.setLaunchMode) {
        SNField.setLaunchMode('on', { quiet: true, skipMoney: true });
      }
    } catch (_) {}
    ensureWallet(80);
    // Instant kitchen so throw never depends on network
    if (!lastCrawl || !lastCrawl.count) {
      lastCrawl = localKitchen(pos());
    }
    plotPlaces(lastCrawl.places);
    var thrown = throwOffers({ count: opts.offers != null ? opts.offers : 1 });
    // Grower vendor tiles with full menus + prices (order → Rai drone)
    var grown = throwGrowers({ count: opts.growers != null ? opts.growers : 0 }); // vendors on demand — don't flood
    // If still empty (module race), hard retry
    if (!thrown.count && !(grown && grown.count)) {
      setTimeout(function () {
        if (myGen !== gen || !active) return;
        lastCrawl = localKitchen(pos());
        throwOffers({ count: opts.offers != null ? opts.offers : 1 });
        drawMoneyRoutes();
      }, 400);
      setTimeout(function () {
        if (myGen !== gen || !active) return;
        if (stackLen() < 1) {
          lastCrawl = localKitchen(pos());
          throwOffers({ count: 1 });
          drawMoneyRoutes();
        }
      }, 1200);
    } else {
      drawMoneyRoutes();
    }
    log('MARKET ON · one tile at a time · rules pricing · Rai drone · 3× confirm', 'ok');
    try {
      if (global.SNField && SNField.setRadarExpanded) SNField.setRadarExpanded(true);
    } catch (_) {}
    log('MARKET ON · offers live · crawl refining…', 'ok');
    preview('market on');
    return { ok: true, count: thrown.count || stackLen(), gen: myGen };
  }

  async function activate(opts) {
    opts = opts || {};
    var sync = activateSync(opts);
    var myGen = sync.gen;
    // Background locate + crawl — never blocks first paint
    void (async function () {
      try {
        var p = await locateSoft();
        if (myGen !== gen || !active) return;
        log(
          'Located · ' +
            (p.lat != null ? Number(p.lat).toFixed(4) + ', ' + Number(p.lng).toFixed(4) : 'default'),
          'dim'
        );
        var crawl = await crawlNear(opts.query || 'restaurants pizza food');
        if (myGen !== gen || !active) return;
        log(
          'Crawl · ' +
            (crawl.count || 0) +
            ' near you · ' +
            (crawl.source || 'none') +
            (crawl.source === 'local-kitchen' ? ' (local kitchen until live POI)' : ''),
          crawl.count ? 'ok' : 'dim'
        );
        // If stack empty after crawl, rethrow with live names
        if (stackLen() < 1) {
          throwOffers({ count: opts.offers != null ? opts.offers : 2 });
          drawMoneyRoutes();
        }
        try {
          if (global.SNField && SNField.refreshRoutes) void SNField.refreshRoutes(true);
        } catch (_) {}
      } catch (eBg) {
        try {
          log('Crawl soft · ' + (eBg && eBg.message ? eBg.message : eBg), 'dim');
        } catch (_) {}
      }
    })();
    return { ok: true, crawl: lastCrawl, pos: pos(), stack: stackLen() };
  }

  function deactivate() {
    active = false;
    gen++;
    try {
      if (global.SNField && SNField.setLaunchMode) {
        SNField.setLaunchMode('off', { quiet: true, skipMoney: true });
      }
    } catch (_) {}
    try {
      if (global.SNOfferStack && SNOfferStack.clear) SNOfferStack.clear();
    } catch (_) {}
    log('MARKET OFF · offers silenced', 'dim');
    preview('market off');
    return { ok: true };
  }

  async function firstDelivery() {
    clearBlockers();
    ensureWallet(80);
    await activate({ offers: 1, query: 'pizza restaurants' });
    try {
      if (global.SNMarket && SNMarket.fulfillFoodIntent) {
        log('First delivery · ordering…', 'ok');
        var r = await SNMarket.fulfillFoodIntent('order pizza for me', {
          autoOrder: true,
          quiet: false,
          skipLocConfirm: true,
          softHome: true,
          allowSelfCourier: true,
        });
        if (r && r.ok) {
          log('Order live · pay + route when driver claims', 'ok');
          preview('first delivery');
          return r;
        }
        log('Order soft · use offer Accept → Start → Complete', 'dim');
        return r || { ok: false, offersOnly: true };
      }
    } catch (e) {
      log('First delivery · ' + (e && e.message ? e.message : e), 'err');
    }
    return { ok: true, offersOnly: true, stack: stackLen() };
  }

  async function handleLine(raw) {
    var low = String(raw || '')
      .trim()
      .toLowerCase();
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
      await activate({});
      return true;
    }
    if (low === 'market off' || low === 'power off' || low === 'tasks off' || low === 'money off') {
      deactivate();
      return true;
    }
    if (
      low === 'first delivery' ||
      low === 'order pizza' ||
      low === 'lazy pizza' ||
      low === 'order me pizza'
    ) {
      await firstDelivery();
      return true;
    }
    if (
      low === 'crawl shops' ||
      low === 'scan shops' ||
      low === 'shops' ||
      low === 'fill shops' ||
      /^crawl\s+shops/.test(low)
    ) {
      clearBlockers();
      // Instant kitchen first
      lastCrawl = localKitchen(pos());
      throwOffers({ count: 2 });
      var c = await crawlNear('restaurants cafes pizza food shops');
      log('Shops · ' + (c.count || 0) + ' · ' + (c.source || ''), c.count ? 'ok' : 'dim');
      return true;
    }
    if (low === 'throw offers' || low === 'offers now' || low === 'money offers') {
      if (!lastCrawl || !lastCrawl.count) lastCrawl = localKitchen(pos());
      throwOffers({ count: 2 });
      drawMoneyRoutes();
      return true;
    }
    if (
      low === 'growers' ||
      low === 'throw growers' ||
      low === 'vendor tiles' ||
      low === 'menus' ||
      low === 'throw menus'
    ) {
      if (!lastCrawl || !lastCrawl.count) lastCrawl = localKitchen(pos());
      throwGrowers({ count: 2 });
      return true;
    }
    if (low === 'wallet fund' || low === 'fund wallet' || low === 'add money') {
      ensureWallet(100);
      try {
        if (global.SNCurrency && SNCurrency.format)
          log('Wallet · ' + SNCurrency.format(SNCurrency.balance), 'ok');
      } catch (_) {}
      return true;
    }
    if (low === 'money help' || low === 'help money') {
      [
        '═══ MONEY PATH ═══',
        'power ON (top) or: market on',
        'first delivery · order pizza',
        'crawl shops · throw offers',
        'offers test · Accept → Start → Complete',
        'growers · vendor menu tiles · order → Rai drone',
        'wallet · fund wallet',
      ].forEach(function (ln, i) {
        log(ln, i ? 'dim' : 'ok');
      });
      return true;
    }
    return false;
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snMoneyBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        var low = String(raw || '')
          .trim()
          .toLowerCase();
        try {
          if (
            /^(money|market on|market off|power on|power off|tasks on|tasks off|go live|marketplace|first delivery|order pizza|lazy pizza|crawl shops|scan shops|fill shops|throw offers|offers now|money offers|growers|throw growers|vendor tiles|menus|throw menus|wallet fund|fund wallet|add money|money help|help money)\b/i.test(
              low
            ) ||
            /^crawl\s+shops/.test(low)
          ) {
            try {
              if (global.SNCli.beginTurn) SNCli.beginTurn();
            } catch (_) {}
            try {
              if (global.SNCli.log) SNCli.log(String(raw).trim(), 'cmd');
            } catch (_) {}
            var h = await handleLine(raw);
            try {
              if (global.SNCli.endTurn) SNCli.endTurn();
            } catch (_) {}
            if (h) return;
          }
        } catch (e) {
          try {
            log('Money · ' + (e && e.message ? e.message : e), 'err');
          } catch (_) {}
        }
        return orig(raw);
      };
      SNCli._snMoneyBound = SNCli.run;
    } catch (_) {}
  }

  function init() {
    clearBlockers();
    installCli();
    [400, 1200, 3500, 8000].forEach(function (ms) {
      setTimeout(function () {
        clearBlockers();
        installCli();
      }, ms);
    });
  }

  global.SNMoney = {
    init: init,
    activate: activate,
    activateSync: activateSync,
    deactivate: deactivate,
    crawlNear: crawlNear,
    throwOffers: throwOffers,
    throwGrowers: throwGrowers,
    firstDelivery: firstDelivery,
    ensureWallet: ensureWallet,
    clearBlockers: clearBlockers,
    localKitchen: localKitchen,
    handleLine: handleLine,
    get active() {
      return active;
    },
    get lastCrawl() {
      return lastCrawl;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
