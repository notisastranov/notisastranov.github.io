/* Astranov chrome-market — real tasks only · no auto-demo · polygon + faces
 * Build: 20260811143000-market-real
 * Owner: power ON waits for real offers; demos only via explicit "simulate …"
 *        when task live → full route · vendor+client faces · combined polygon
 */
(function (global) {
  'use strict';
  var BUILD = '20260811143000-market-real';
  var SIM_FLAG = 'sn:sim-mode-v1';

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'ok');
    } catch (_) {}
  }
  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m || '').slice(0, 56));
    } catch (_) {}
  }

  function isSimMode() {
    try {
      return localStorage.getItem(SIM_FLAG) === '1';
    } catch (_) {
      return false;
    }
  }
  function setSimMode(on) {
    try {
      if (on) localStorage.setItem(SIM_FLAG, '1');
      else localStorage.removeItem(SIM_FLAG);
    } catch (_) {}
  }

  function cleanDemoData() {
    var n = 0;
    try {
      if (global.SNOfferStack) {
        if (SNOfferStack.clearAll) SNOfferStack.clearAll();
        else if (SNOfferStack.clear) SNOfferStack.clear();
        n++;
      }
    } catch (_) {}
    try {
      if (global.SNField && SNField.clearRoutes) SNField.clearRoutes();
    } catch (_) {}
    try {
      if (global.SNTasks && SNTasks.list) {
        var list = SNTasks.list({ all: true }) || [];
        list.forEach(function (t) {
          if (!t) return;
          var demo =
            t.fake ||
            t.demo ||
            t.simulate ||
            t._demo ||
            (t.courier === 'rai-drone' && t.always_on) ||
            /Night Kitchen|Grocery run|Local delivery|House special|Hot food run/i.test(
              String(t.title || '') + ' ' + String(t.vendorName || '')
            );
          if (demo) {
            try {
              if (SNTasks.cancel) SNTasks.cancel(t.id);
              else if (SNTasks.remove) SNTasks.remove(t.id);
              else if (SNTasks.update) SNTasks.update(t.id, { status: 'cancelled', demo: true });
              n++;
            } catch (_) {}
          }
        });
      }
    } catch (_) {}
    try {
      ['sn:offer-stack-v1', 'sn:demo-offers', 'sn:money-demo'].forEach(function (k) {
        try {
          localStorage.removeItem(k);
        } catch (_) {}
      });
    } catch (_) {}
    log('Market · demo data cleared · field open for real tasks', 'dim');
    return n;
  }

  function realActivate(opts) {
    opts = opts || {};
    try {
      if (global.SNField && SNField.setLaunchMode) {
        SNField.setLaunchMode('on', { quiet: true, skipMoney: true });
      }
    } catch (_) {}

    if (opts.simulate || isSimMode()) {
      log('SIMULATION · helper may throw guided demo · mark clearly as sim', 'ok');
      preview('sim mode');
      return { ok: true, mode: 'sim' };
    }

    cleanDemoData();
    log('MARKET ON · waiting real offers · no auto-demo · Accept shows route + faces', 'ok');
    preview('market · live');

    void (async function () {
      try {
        if (global.SNMoney && typeof SNMoney.crawlNear === 'function') {
          var crawl = await SNMoney.crawlNear(opts.query || 'restaurants');
          if (crawl && crawl.count) {
            log('Crawl · ' + crawl.count + ' places near you · not offers until ordered', 'dim');
          }
        } else if (global.SNSearch && SNSearch.crawl) {
          await SNSearch.crawl(opts.query || 'restaurants', { limit: 8 });
        }
      } catch (_) {}
    })();

    try {
      showLiveTaskGeometry();
    } catch (_) {}
    return { ok: true, mode: 'live', demo: false };
  }

  function realDeactivate() {
    try {
      if (global.SNField && SNField.setLaunchMode) {
        SNField.setLaunchMode('off', { quiet: true, skipMoney: true });
      }
    } catch (_) {}
    try {
      if (global.SNOfferStack) {
        if (SNOfferStack.clearAll) SNOfferStack.clearAll();
        else if (SNOfferStack.clear) SNOfferStack.clear();
      }
    } catch (_) {}
    try {
      if (global.SNField && SNField.clearRoutes) SNField.clearRoutes();
    } catch (_) {}
    log('MARKET OFF', 'dim');
    preview('market off');
    return { ok: true };
  }

  function collectActiveOrders() {
    var out = [];
    try {
      if (global.SNPolyScheduler && SNPolyScheduler.list) {
        (SNPolyScheduler.list() || []).forEach(function (o) {
          if (
            o &&
            (o.phase === 'claimed' ||
              o.phase === 'underway' ||
              o.phase === 'confirming' ||
              o.phase === 'offered')
          ) {
            out.push(o);
          }
        });
      }
    } catch (_) {}
    try {
      if (global.SNOfferStack && SNOfferStack.list) {
        (SNOfferStack.list() || []).forEach(function (o) {
          if (!o) return;
          if (o.kind === 'task' && (o.phase === 'claimed' || o.phase === 'underway' || o.phase === 'accepted')) {
            out.push({
              id: o.id || o.taskId,
              vendorName: o.vendorName,
              clientName: o.clientName || 'You',
              vendorPhoto: o.vendorPhoto || o.vendorAvatar,
              clientPhoto: o.clientPhoto || o.clientAvatar,
              vLat: o.lat != null ? o.lat : o.vendorLat,
              vLng: o.lng != null ? o.lng : o.vendorLng,
              dLat: o.drop_lat != null ? o.drop_lat : o.dropLat,
              dLng: o.drop_lng != null ? o.drop_lng : o.dropLng,
              mids: o.mids || [],
              phase: o.phase,
              price: o.priceNum || o.price,
              title: o.nature || o.title,
            });
          }
        });
      }
    } catch (_) {}
    var seen = {};
    return out.filter(function (o) {
      var id = String(o.id || '');
      if (!id || seen[id]) return false;
      seen[id] = 1;
      return true;
    });
  }

  function showLiveTaskGeometry() {
    var orders = collectActiveOrders();
    if (!orders.length) return { ok: false, reason: 'no active' };

    var tour = null;
    try {
      if (global.SNPolyEngine && SNPolyEngine.buildTour) {
        tour = SNPolyEngine.buildTour(orders, {});
      } else if (global.SNPolyEngine && SNPolyEngine.syncTourFromStack) {
        tour = SNPolyEngine.syncTourFromStack(orders);
      }
    } catch (_) {}

    if (tour && tour.stops && tour.stops.length >= 2) {
      try {
        if (global.SNPolyEngine && SNPolyEngine.drawTour) SNPolyEngine.drawTour(tour);
      } catch (_) {}
      try {
        if (global.SNField && SNField.startDeliveryRoute) {
          var wps = tour.stops.map(function (s) {
            return { lat: s.lat, lng: s.lng, label: s.name || s.role || '' };
          });
          void SNField.startDeliveryRoute({
            id: 'live:tour_active',
            vendorLat: wps[0].lat,
            vendorLng: wps[0].lng,
            dropLat: wps[wps.length - 1].lat,
            dropLng: wps[wps.length - 1].lng,
            waypoints: wps,
            label:
              'Tour · ' +
              orders.length +
              ' order' +
              (orders.length > 1 ? 's' : '') +
              ' · polygon',
            etaMin: Math.round(tour.totalMin || 20),
            preview: true,
          });
        }
      } catch (_) {}
    } else {
      var o = orders[0];
      try {
        if (global.SNPolyScheduler && SNPolyScheduler.drawPolygon) {
          SNPolyScheduler.drawPolygon(o);
        } else if (global.SNField && SNField.startDeliveryRoute && o.vLat != null && o.dLat != null) {
          void SNField.startDeliveryRoute({
            id: 'live:' + (o.id || 'one'),
            vendorLat: o.vLat,
            vendorLng: o.vLng,
            dropLat: o.dLat,
            dropLng: o.dLng,
            label: String((o.vendorName || 'V') + ' → ' + (o.clientName || 'C')).slice(0, 28),
            preview: true,
          });
        }
      } catch (_) {}
    }

    try {
      var first = orders[0];
      if (first && global.SNPolyScheduler && SNPolyScheduler.openOrderTile) {
        SNPolyScheduler.openOrderTile(first.id);
      }
    } catch (_) {}

    log(
      'Route · ' +
        orders.length +
        ' task' +
        (orders.length > 1 ? 's combined polygon' : '') +
        ' · vendor + client faces',
      'ok'
    );
    return { ok: true, n: orders.length, tour: tour };
  }

  async function runSimulate(kind, opts) {
    opts = opts || {};
    kind = String(kind || 'delivery').toLowerCase();
    setSimMode(true);
    log('SIMULATION · ' + kind + ' · not real money · clear with: market clear', 'ok');
    preview('sim · ' + kind);

    try {
      if (global.SNField && SNField.setLaunchMode) {
        SNField.setLaunchMode('on', { quiet: true, skipMoney: true });
      }
    } catch (_) {}

    if (kind.indexOf('pizza') >= 0 || kind === 'order') {
      try {
        if (global.SNSearch && SNSearch.crawl) {
          await SNSearch.crawl('best pizza', { limit: 6 });
        }
      } catch (_) {}
      try {
        if (global.SNOfferStack && SNOfferStack.testThrow) {
          SNOfferStack.testThrow({
            persist: true,
            nature: 'SIM · Pizza',
            title: 'SIM · Pizza order',
            product: 'Sim pizza',
            vendorName: 'Sim Kitchen',
            clientName: 'You',
            km: 2.4,
            total: 0,
            skipModeFlip: true,
            simulate: true,
          });
        }
      } catch (_) {}
      showLiveTaskGeometry();
      return { ok: true, kind: 'pizza', sim: true };
    }

    if (kind.indexOf('deliver') >= 0 || kind === 'route') {
      try {
        if (global.SNOfferStack && SNOfferStack.demoDelivery) {
          await SNOfferStack.demoDelivery({ persist: true, simulate: true });
        } else if (global.SNOfferStack && SNOfferStack.testThrow) {
          SNOfferStack.testThrow({
            persist: true,
            nature: 'SIM · Delivery',
            title: 'SIM · Delivery',
            skipModeFlip: true,
          });
        }
      } catch (_) {}
      showLiveTaskGeometry();
      return { ok: true, kind: 'delivery', sim: true };
    }

    if (kind.indexOf('pay') >= 0 || kind.indexOf('payment') >= 0) {
      log('SIM · payment to vendor + driver · zero real debit', 'ok');
      return { ok: true, kind: 'payment', sim: true };
    }

    log('SIM kinds · pizza · delivery · payment', 'dim');
    return { ok: false };
  }

  function patchMoney() {
    try {
      if (!global.SNMoney) return;
      var M = global.SNMoney;
      if (!M._realActivate) M._realActivate = M.activate;
      if (!M._realActivateSync) M._realActivateSync = M.activateSync;
      M.activate = function (opts) {
        opts = opts || {};
        if (opts.simulate || opts.demo || isSimMode()) {
          setSimMode(true);
          if (typeof M._realActivate === 'function') return M._realActivate(opts);
          return realActivate(opts);
        }
        return realActivate(opts);
      };
      M.activateSync = function (opts) {
        opts = opts || {};
        if (opts.simulate || opts.demo || isSimMode()) {
          if (typeof M._realActivateSync === 'function') return M._realActivateSync(opts);
        }
        return realActivate(opts);
      };
      M.deactivate = realDeactivate;
      M.cleanDemo = cleanDemoData;
      M.showRoutes = showLiveTaskGeometry;
    } catch (_) {}
  }

  function patchLaunch() {
    try {
      if (!global.SNField || !SNField.setLaunchMode) return;
      if (SNField._snMarketLaunchPatched) return;
      var orig = SNField.setLaunchMode.bind(SNField);
      SNField._snMarketLaunchPatched = true;
      SNField.setLaunchMode = function (mode, opts) {
        opts = opts || {};
        if (mode === 'on' && !opts.simulate && !isSimMode()) {
          opts = Object.assign({}, opts, { skipMoney: true });
          var r = orig(mode, opts);
          realActivate({ quiet: true });
          return r;
        }
        return orig(mode, opts);
      };
    } catch (_) {}
  }

  function installCli() {
    try {
      if (global.SNCli && SNCli.register) {
        SNCli.register('market clear', function () {
          setSimMode(false);
          cleanDemoData();
          return 'cleared';
        });
        SNCli.register('show route', function () {
          showLiveTaskGeometry();
          return 'route';
        });
      }
    } catch (_) {}
    try {
      if (global.SNCli && !SNCli._snMarketHook) {
        var _hl = SNCli.handleLine;
        SNCli._snMarketHook = true;
        if (typeof _hl === 'function') {
          SNCli.handleLine = function (raw) {
            var low = String(raw || '').trim().toLowerCase();
            if (/^simulate\b/.test(low) || /^sim\b/.test(low)) {
              var kind = low.replace(/^(simulate|sim)\s*/, '') || 'delivery';
              void runSimulate(kind);
              return true;
            }
            if (low === 'market clear' || low === 'clear demos' || low === 'clear demo') {
              setSimMode(false);
              cleanDemoData();
              return true;
            }
            if (low === 'show route' || low === 'show polygon' || low === 'tour') {
              showLiveTaskGeometry();
              return true;
            }
            return _hl.apply(this, arguments);
          };
        }
      }
    } catch (_) {}
  }

  function boot() {
    patchMoney();
    patchLaunch();
    installCli();
    if (!isSimMode()) {
      setTimeout(function () {
        try {
          cleanDemoData();
        } catch (_) {}
      }, 1800);
    }
    setTimeout(patchMoney, 2500);
    setTimeout(patchLaunch, 2500);
    setTimeout(installCli, 3000);
    setInterval(function () {
      try {
        if (collectActiveOrders().length > 0) showLiveTaskGeometry();
      } catch (_) {}
    }, 18000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 4000);

  global.SNMarketClean = {
    build: BUILD,
    clean: cleanDemoData,
    activate: realActivate,
    deactivate: realDeactivate,
    showRoutes: showLiveTaskGeometry,
    simulate: runSimulate,
    isSim: isSimMode,
  };
})(typeof window !== 'undefined' ? window : globalThis);
