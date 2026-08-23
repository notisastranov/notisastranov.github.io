/* SNTaskRunner — full multi-step missions for CLI + AI (non-UI)
 * locate → map → shops → order → driver → route → deliver
 * Does not touch chrome/scrolls — only map/globe/tasks/market APIs.
 */
(function (g) {
  'use strict';

  function log(msg, cls) {
    try {
      if (g.SNCli && SNCli.log) SNCli.log(msg, cls || 'dim');
    } catch (_) {}
  }

  function posNow() {
    return g._snLastPos || g._snPhysPos || (g.SNTasks && SNTasks.pos) || null;
  }

  async function ensureMap(lat, lng) {
    if (lat == null || lng == null) return false;
    try {
      if (g.SNMap && SNMap.open) {
        await SNMap.open(lat, lng);
        if (SNMap.ensure) await SNMap.ensure();
        if (SNMap.markYou) SNMap.markYou(lat, lng, 'YOU');
        if (SNMap.fitLatLngs) SNMap.fitLatLngs([{ lat: lat, lng: lng }], { zoom: 15, force: true });
        if (SNMap.showProfiles) SNMap.showProfiles();
        if (SNMap.showTasks) SNMap.showTasks();
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function doLocate() {
    var pos = null;
    try {
      if (g.SNCli && SNCli.gpsLocate) pos = await SNCli.gpsLocate({ allowIp: true, allowSoft: true });
    } catch (_) {}
    if ((!pos || pos.lat == null) && g.SNGlobe && SNGlobe.locate) {
      try {
        pos = await SNGlobe.locate();
      } catch (_) {}
    }
    // Never accept Rhodes demo as located user
    if (pos && pos.lat != null && g.SNCli && SNCli.isFakeDemoPin && SNCli.isFakeDemoPin(pos.lat, pos.lng)) {
      if (!(pos.source === 'gps' || pos.source === 'gps-watch') && pos.fallback !== false) {
        pos = null;
      }
    }
    if (!pos || pos.lat == null) {
      return { ok: false, error: 'need GPS · tap Locate · allow Location permission' };
    }
    g._snLastPos = {
      lat: pos.lat,
      lng: pos.lng,
      reason: pos.reason || 'task-runner',
      source: pos.source,
      real: !pos.fallback,
    };
    try {
      if (g.SNTasks && SNTasks.setPos) SNTasks.setPos(pos.lat, pos.lng);
    } catch (_) {}
    await ensureMap(pos.lat, pos.lng);
    log(
      'LOC · ' +
        pos.lat.toFixed(5) +
        ', ' +
        pos.lng.toFixed(5) +
        (pos.fallback ? ' · soft/' + (pos.source || 'cache') : ' · GPS'),
      pos.fallback ? 'dim' : 'ok'
    );
    return { ok: true, pos: pos };
  }

  async function doFillShops(query) {
    var p = posNow();
    if (!p || p.lat == null) {
      var loc = await doLocate();
      if (!loc.ok) return loc;
      p = loc.pos;
    }
    await ensureMap(p.lat, p.lng);
    if (g.SNVendorCrawl && SNVendorCrawl.populate) {
      var pop = await SNVendorCrawl.populate({
        lat: p.lat,
        lng: p.lng,
        query: query || 'restaurant pizza cafe food',
        openMap: true,
        force: true,
      });
      return {
        ok: !!(pop && pop.ok),
        vendors: (pop && pop.count) || 0,
        samples: (pop && pop.samples) || [],
        sources: (pop && pop.sources) || [],
        pos: p,
        populate: pop,
      };
    }
    // fallback commerce only
    try {
      if (g.SNCommerce && SNCommerce.ensureSector) {
        await SNCommerce.ensureSector(p.lat, p.lng, { openMap: true });
      }
    } catch (_) {}
    var n = 0;
    try {
      n = (g.SNProfiles.list({ role: 'vendor' }) || []).length;
    } catch (_) {}
    log('Shops · sector · vendors~' + n, 'ok');
    return { ok: n > 0, vendors: n, pos: p };
  }

  async function doOrder(line, opts) {
    opts = opts || {};
    if (!g.SNMarket || !SNMarket.parseFoodIntent || !SNMarket.fulfillFoodIntent) {
      return { ok: false, error: 'market offline' };
    }
    var intent =
      typeof line === 'object' && line.food
        ? line
        : SNMarket.parseFoodIntent(line || 'order me a pizza you judge type size vendor delivery');
    if (!intent) {
      intent = {
        food: opts.food || 'pizza',
        overpass: 'pizza restaurant',
        raw: String(line || ''),
        autoOrder: true,
        lazyJudge: true,
        browseOnly: false,
      };
    }
    intent.autoOrder = opts.browse ? false : true;
    intent.lazyJudge = true;
    intent.browseOnly = !!opts.browse;
    if (opts.softHome) intent.softHome = true;

    var r = await SNMarket.fulfillFoodIntent(intent, {
      autoOrder: !opts.browse,
      quiet: false,
      testMode: !!opts.testMode,
      softHome: !!opts.softHome,
    });

    // Paint map with results
    try {
      var pin = (r && r.pos) || posNow();
      if (pin) await ensureMap(pin.lat, pin.lng);
      if (g.SNMap) {
        if (SNMap.showProfiles) SNMap.showProfiles();
        if (SNMap.showTasks) SNMap.showTasks();
        if (r && r.best && r.pos && SNMap.fitLatLngs) {
          SNMap.fitLatLngs(
            [
              { lat: r.best.lat, lng: r.best.lng },
              { lat: r.pos.lat, lng: r.pos.lng },
            ],
            { padding: 48, maxZoom: 15, force: true }
          );
        }
      }
      if (r && r.order && r.order.task && g.SNField && SNField.showRoute && r.best && r.pos) {
        void SNField.showRoute(
          [
            { lat: r.best.lat, lng: r.best.lng },
            { lat: r.pos.lat, lng: r.pos.lng },
          ],
          { osrm: true, kind: 'delivery', label: '🛵 delivery', taskId: r.order.task.id }
        );
      }
    } catch (_) {}

    return r;
  }

  async function doDriveOn() {
    if (g.SNMarket && SNMarket.goDriverOnline) {
      var r = SNMarket.goDriverOnline('Scooter');
      log(r && r.ok ? 'Driver online' : (r && r.error) || 'drive on failed', r && r.ok ? 'ok' : 'err');
      return r || { ok: false };
    }
    return { ok: false, error: 'no market' };
  }

  async function doDeliver() {
    if (g.SNMarket && SNMarket.claimAndComplete) {
      var r = SNMarket.claimAndComplete();
      try {
        if (g.SNMap && SNMap.showTasks) SNMap.showTasks();
      } catch (_) {}
      log(r && r.ok ? 'Delivered · settled' : (r && r.error) || 'deliver failed', r && r.ok ? 'ok' : 'err');
      return r || { ok: false };
    }
    return { ok: false, error: 'no market' };
  }

  /**
   * Parse free text into a mission plan (ordered steps).
   */
  function planFromText(text) {
    var low = String(text || '').toLowerCase();
    try {
      if (g.SNGreeklish && SNGreeklish.normalize) low = SNGreeklish.normalize(low);
    } catch (_) {}
    var steps = [];
    var wantsLocate = /\b(locate|where am i|find me|gps|βρες\s*με)\b/i.test(low);
    var wantsShops =
      /\b(shops|fill shops|google shops|vendors|stores|near me)\b/i.test(low) ||
      /\b(find|search)\b.*\b(shop|restaurant|pizza|food)\b/i.test(low);
    // one word food
    var oneFood = /^(pizza|sushi|burger|coffee|souvlaki|pitogyra|food|πιτσα|καφε)$/i.test(
      low.trim()
    );
    var wantsOrder = oneFood ||
      /\b(order|bring|get me|buy me|παράγγειλ|deliver me a|i want|i need|hungry)\b/i.test(low) ||
      /\b(pizza|pitogyra|sushi|burger|souvlaki|coffee|food)\b/i.test(low);
    var wantsDrive = /\b(drive on|go driver|courier on|i'?m a driver)\b/i.test(low);
    var wantsDeliver =
      /\b(deliver me|complete delivery|mark delivered|finish order|settle)\b/i.test(low) &&
      !/\border\b.*\bdeliver/i.test(low);
    var wantsFullLoop =
      /\b(first delivery|full (order|loop|delivery)|end to end|shop to door)\b/i.test(low);
    var browseOnly =
      wantsShops && !/\border\b/i.test(low) && !/\b(bring|get me|buy)\b/i.test(low);

    if (wantsFullLoop) {
      return {
        steps: ['locate', 'shops', 'order', 'drive', 'deliver'],
        foodLine: text,
        autoOrder: true,
      };
    }
    // Compound: always locate first if ordering or shops without pin
    if (wantsLocate || wantsOrder || wantsShops) steps.push('locate');
    if (wantsShops) steps.push('shops');
    if (wantsOrder) steps.push(browseOnly ? 'browse' : 'order');
    if (wantsDrive) steps.push('drive');
    if (wantsDeliver) steps.push('deliver');

    // Pure food without locate word — still locate inside order
    if (!steps.length && wantsOrder) steps = ['order'];
    if (!steps.length) return null;

    // de-dupe preserve order
    var seen = {};
    steps = steps.filter(function (s) {
      if (seen[s]) return false;
      seen[s] = 1;
      return true;
    });

    return { steps: steps, foodLine: text, autoOrder: !browseOnly };
  }

  async function runPlan(plan, opts) {
    opts = opts || {};
    if (!plan || !plan.steps || !plan.steps.length) return { ok: false, error: 'empty plan' };
    var results = [];
    var lastOrder = null;
    log('Mission · ' + plan.steps.join(' → '), 'ok');

    for (var i = 0; i < plan.steps.length; i++) {
      var step = plan.steps[i];
      var r = null;
      try {
        if (step === 'locate') r = await doLocate();
        else if (step === 'shops') r = await doFillShops(plan.foodLine);
        else if (step === 'browse')
          r = await doOrder(plan.foodLine, { browse: true, softHome: opts.softHome });
        else if (step === 'order') {
          r = await doOrder(plan.foodLine, {
            browse: false,
            testMode: opts.testMode,
            softHome: opts.softHome,
          });
          lastOrder = r;
        } else if (step === 'drive') r = await doDriveOn();
        else if (step === 'deliver') r = await doDeliver();
        else r = { ok: false, error: 'unknown step ' + step };
      } catch (e) {
        r = { ok: false, error: String(e && e.message ? e.message : e) };
      }
      results.push({ step: step, result: r });
      if (r && r.ok === false && step === 'locate') {
        return {
          ok: false,
          results: results,
          reply: r.error || 'Locate failed',
          summary: r.error,
        };
      }
      // soft-continue on shops fail
    }

    var reply = summarize(results, lastOrder);
    return {
      ok: results.some(function (x) {
        return x.result && x.result.ok;
      }),
      results: results,
      order: lastOrder,
      reply: reply,
      summary: lastOrder && lastOrder.summary ? lastOrder.summary : reply,
    };
  }

  function summarize(results, lastOrder) {
    if (lastOrder && lastOrder.eatLine) return lastOrder.eatLine;
    if (lastOrder && lastOrder.reply) return lastOrder.reply;
    var bits = results.map(function (x) {
      var ok = x.result && x.result.ok;
      return x.step + (ok ? '✓' : '✗');
    });
    return 'Mission · ' + bits.join(' · ');
  }

  async function runText(text, opts) {
    var plan = planFromText(text);
    if (!plan) return { ok: false, handled: false, error: 'no mission' };
    var out = await runPlan(plan, opts || {});
    out.handled = true;
    out.plan = plan;
    return out;
  }

  g.SNTaskRunner = {
    planFromText: planFromText,
    runPlan: runPlan,
    runText: runText,
    locate: doLocate,
    fillShops: doFillShops,
    order: doOrder,
    driveOn: doDriveOn,
    deliver: doDeliver,
    ensureMap: ensureMap,
  };
})(typeof window !== 'undefined' ? window : globalThis);
