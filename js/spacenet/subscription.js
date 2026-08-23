/**
 * SNSubscription — Astranov AI billing + Grok cycle
 *
 * Law (owner 2026-08-06):
 *  - All users need a monthly subscription for powerful AI.
 *  - Markup 3×: every €1 real xAI cost → €3 of user quota.
 *  - Base €3/mo includes €1 real API budget; then free models.
 *  - Tiers: €3 · €13 · €33 · €300 (API budgets €1 · €4.33 · €11 · €100).
 *  - Owner (notisastranov@gmail.com) always uses paid Grok immediately.
 *  - Owner API key (server-side only) funds every paid subscriber within budget.
 *  - Transcript of app AI use is stored to train Astranov Mind.
 *
 * CLI: plan · plans · subscribe 3|13|33|300 (PayPal) · subscribe demo 3 (owner test)
 *      plan status · usage ai · transcript · paypal status
 * Normal users: PayPal required for AI subscription.
 * Owner (notisastranov@gmail.com) logged in: paid Grok via server XAI_API_KEY instantly.
 * Never put XAI_API_KEY or PayPal secret in this file.
 */
(function (global) {
  'use strict';

  var KEY = 'sn:sub-v1';
  var TX_KEY = 'sn:ai-transcript-v1';
  var GIFT_KEY = 'sn:ai-gift-v1';
  var GIFT_MAX = 3;
  var MARKUP = 3;
  var ARCHITECT_EMAIL = 'notisastranov@gmail.com';

  /** Live xAI flagship (grok-4.6, Aug 2026): $2 / $6 per 1M. Plans charge 3×. */
  var RATES = {
    usdInPerM: 2,
    usdOutPerM: 6,
    eurPerUsd: 0.92,
    model: 'grok-4.6',
    asof: '2026-08-16',
  };

  function eurIn() {
    return RATES.usdInPerM * RATES.eurPerUsd;
  }
  function eurOut() {
    return RATES.usdOutPerM * RATES.eurPerUsd;
  }

  /** priceEur → realApiBudgetEur (price / 3) */
  var TIERS = [
    {
      id: 'spark',
      priceEur: 3,
      apiBudgetEur: 1,
      label: 'Spark',
      note: '€1 real mind · then free',
    },
    {
      id: 'pulse',
      priceEur: 13,
      apiBudgetEur: Math.round((13 / MARKUP) * 100) / 100,
      label: 'Pulse',
      note: '~€4.33 real mind',
    },
    {
      id: 'orbit',
      priceEur: 33,
      apiBudgetEur: 11,
      label: 'Orbit',
      note: '€11 real mind',
    },
    {
      id: 'nova',
      priceEur: 300,
      apiBudgetEur: 100,
      label: 'Nova',
      note: '€100 real mind',
    },
  ];

  function rebuildTiers() {
    for (var i = 0; i < TIERS.length; i++) {
      TIERS[i].apiBudgetEur = Math.round((TIERS[i].priceEur / MARKUP) * 100) / 100;
    }
  }
  rebuildTiers();

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'ok', true);
    } catch (_) {}
  }

  function now() {
    return Date.now();
  }

  function periodKey(d) {
    d = d || new Date();
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && typeof s === 'object') return s;
    } catch (_) {}
    return {
      tierId: null,
      priceEur: 0,
      apiBudgetEur: 0,
      period: periodKey(),
      spentApiEur: 0,
      subscribedAt: 0,
      active: false,
      paymentRef: null,
    };
  }

  function saveState(st) {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (_) {}
  }

  function rollPeriod(st) {
    var pk = periodKey();
    if (st.period !== pk) {
      st.period = pk;
      st.spentApiEur = 0;
      saveState(st);
    }
    return st;
  }

  function userEmail() {
    try {
      var u = global.SNAuth && SNAuth.user;
      if (u && u.email) return String(u.email).toLowerCase();
    } catch (_) {}
    try {
      var raw = localStorage.getItem('astranov_auth_v3') || localStorage.getItem('sn:auth-email');
      if (raw && raw.indexOf('@') > 0) return raw.toLowerCase();
      if (raw) {
        var j = JSON.parse(raw);
        var em =
          (j && j.user && j.user.email) ||
          (j && j.currentSession && j.currentSession.user && j.currentSession.user.email);
        if (em) return String(em).toLowerCase();
      }
    } catch (_) {}
    return '';
  }

  function isOwner() {
    try {
      if (global.SNAuth && typeof SNAuth.isOwner === 'function' && SNAuth.isOwner()) return true;
    } catch (_) {}
    var em = userEmail();
    if (em === ARCHITECT_EMAIL) return true;
    try {
      if (localStorage.getItem('sn:owner-session') === '1' && em === ARCHITECT_EMAIL) return true;
    } catch (_) {}
    return false;
  }

  function loadGift() {
    try {
      var g = JSON.parse(localStorage.getItem(GIFT_KEY) || 'null');
      if (g && typeof g.n === 'number') return { n: Math.max(0, Number(g.n) || 0), max: GIFT_MAX };
    } catch (_) {}
    return { n: 0, max: GIFT_MAX };
  }

  function saveGift(g) {
    try {
      localStorage.setItem(GIFT_KEY, JSON.stringify(g));
    } catch (_) {}
  }

  function giftUsed() {
    return loadGift().n;
  }

  function giftLeft() {
    if (isOwner()) return 99;
    var st = loadState();
    if (st && st.active) return 0;
    return Math.max(0, GIFT_MAX - giftUsed());
  }

  function consumeGift() {
    if (isOwner()) return 99;
    var g = loadGift();
    g.n = Math.min(GIFT_MAX, (g.n || 0) + 1);
    saveGift(g);
    return Math.max(0, GIFT_MAX - g.n);
  }

  function tierByPrice(n) {
    n = Number(n);
    for (var i = 0; i < TIERS.length; i++) {
      if (TIERS[i].priceEur === n) return TIERS[i];
    }
    return null;
  }

  function tierById(id) {
    id = String(id || '').toLowerCase();
    for (var i = 0; i < TIERS.length; i++) {
      if (TIERS[i].id === id || String(TIERS[i].priceEur) === id) return TIERS[i];
    }
    return null;
  }

  function status() {
    var st = rollPeriod(loadState());
    var owner = isOwner();
    var remaining = Math.max(0, (st.apiBudgetEur || 0) - (st.spentApiEur || 0));
    return {
      owner: owner,
      active: owner || !!st.active,
      tierId: owner ? 'architect' : st.tierId,
      priceEur: owner ? 0 : st.priceEur,
      apiBudgetEur: owner ? Infinity : st.apiBudgetEur,
      spentApiEur: st.spentApiEur || 0,
      remainingApiEur: owner ? Infinity : remaining,
      period: st.period,
      markup: MARKUP,
      giftLeft: owner ? 0 : giftLeft(),
      giftUsed: giftUsed(),
      giftMax: GIFT_MAX,
      rates: {
        model: RATES.model,
        eurInPerM: Math.round(eurIn() * 100) / 100,
        eurOutPerM: Math.round(eurOut() * 100) / 100,
      },
      mode: owner
        ? 'owner-paid-unlimited'
        : remaining > 0 && st.active
          ? 'paid-grok'
          : st.active
            ? 'free-fallback'
            : giftLeft() > 0
              ? 'gift-paid'
              : 'paywall',
      label: owner
        ? 'Architect · unlimited paid mind'
        : st.active
          ? (st.tierId || 'sub') + ' · €' + remaining.toFixed(2) + ' API left'
          : giftLeft() > 0
            ? 'Taste ' + (giftUsed() + 1) + ' of ' + GIFT_MAX
            : 'Three tastes done · pick a plan',
    };
  }

  /**
   * Can this turn use paid Grok (owner key on server)?
   */
  function canUsePaid() {
    var s = status();
    if (s.owner) return { ok: true, reason: 'owner', remaining: Infinity };
    if (s.active && s.remainingApiEur > 0.0001)
      return { ok: true, reason: 'subscriber', remaining: s.remainingApiEur };
    if (s.giftLeft > 0) return { ok: true, reason: 'gift', remaining: 0, giftLeft: s.giftLeft };
    if (s.active) return { ok: false, reason: 'quota_exhausted', remaining: 0 };
    return { ok: false, reason: 'paywall', remaining: 0 };
  }

  /**
   * Estimate API € from tokens (rough). Default floor 0.002 € per call.
   * User-facing charge = apiEur * MARKUP but we only meter API budget.
   */
  function estimateApiEur(usage) {
    usage = usage || {};
    var inTok = Number(usage.prompt_tokens || usage.input_tokens || 0);
    var outTok = Number(usage.completion_tokens || usage.output_tokens || 0);
    var eur = (inTok / 1e6) * eurIn() + (outTok / 1e6) * eurOut();
    if (!eur || !isFinite(eur)) {
      eur = Number(usage.api_eur) || 0.004;
    }
    return Math.max(0.001, Math.round(eur * 10000) / 10000);
  }

  function recordSpend(apiEur, meta) {
    var st = rollPeriod(loadState());
    if (isOwner()) {
      // Owner unlimited — still transcript + track for ops
      trackTranscript('spend', {
        apiEur: apiEur,
        owner: true,
        meta: meta || {},
      });
      return { ok: true, owner: true, spent: st.spentApiEur, remaining: Infinity };
    }
    st.spentApiEur = Math.round(((st.spentApiEur || 0) + apiEur) * 10000) / 10000;
    saveState(st);
    try {
      if (global.SNUsage && SNUsage.track)
        SNUsage.track('ai_api_spend', {
          apiEur: apiEur,
          spent: st.spentApiEur,
          budget: st.apiBudgetEur,
          period: st.period,
        });
    } catch (_) {}
    trackTranscript('spend', { apiEur: apiEur, spent: st.spentApiEur, meta: meta || {} });
    var rem = Math.max(0, st.apiBudgetEur - st.spentApiEur);
    return { ok: true, owner: false, spent: st.spentApiEur, remaining: rem };
  }

  function subscribe(priceOrId, opts) {
    opts = opts || {};
    var t = tierByPrice(priceOrId) || tierById(priceOrId);
    if (!t) {
      log('Plans: 3 · 13 · 33 · 300 €/mo · pay with PayPal', 'err');
      return { ok: false, error: 'unknown_tier' };
    }
    // Owner never pays for own development seat
    if (isOwner() && !opts.paymentRef) {
      opts.paymentRef = 'owner-comp';
      opts.demo = false;
    }
    // Real users: must have PayPal (or owner) payment ref — no free activate
    if (!isOwner() && opts.demo && !opts.paymentRef) {
      log('AI plans require PayPal · type: subscribe ' + t.priceEur, 'err');
      return { ok: false, error: 'paypal_required' };
    }
    if (!isOwner() && !opts.paymentRef && !opts.forceLocal) {
      log('Complete PayPal checkout to activate · type: subscribe ' + t.priceEur, 'err');
      return { ok: false, error: 'paypal_required' };
    }
    var st = {
      tierId: t.id,
      priceEur: t.priceEur,
      apiBudgetEur: t.apiBudgetEur,
      period: periodKey(),
      spentApiEur: 0,
      subscribedAt: now(),
      active: true,
      paymentRef: opts.paymentRef || (isOwner() ? 'owner-comp' : null),
      demo: !!opts.demo && isOwner(),
      provider: opts.provider || (String(opts.paymentRef || '').indexOf('paypal') === 0 ? 'paypal' : 'local'),
    };
    saveState(st);
    log(
      'Subscribed ' +
        t.label +
        ' · €' +
        t.priceEur +
        '/mo · API budget €' +
        t.apiBudgetEur +
        ' (3× markup) · then free · via ' +
        (st.provider || 'local'),
      'ok'
    );
    try {
      if (global.SNUsage && SNUsage.track)
        SNUsage.track('subscribe', {
          tier: t.id,
          price: t.priceEur,
          api: t.apiBudgetEur,
          provider: st.provider,
          ref: st.paymentRef,
        });
    } catch (_) {}
    return { ok: true, tier: t, state: st };
  }

  /**
   * Start PayPal checkout for a tier. Normal path for all non-owner users.
   * Owner skips PayPal and arms paid Grok immediately.
   */
  async function startPayPalCheckout(priceOrId, opts) {
    opts = opts || {};
    var t = tierByPrice(priceOrId) || tierById(priceOrId);
    if (!t) {
      log('Unknown plan · use 3 · 13 · 33 · 300', 'err');
      return { ok: false, error: 'unknown_tier' };
    }
    if (isOwner()) {
      log('Architect · no PayPal needed · paid Grok ON (server key)', 'ok');
      return subscribe(t.priceEur, { paymentRef: 'owner-comp', provider: 'owner' });
    }
    try {
      var origin = location.origin || 'https://astranov.eu';
      var cfgR = await fetch(origin + '/api/paypal/config');
      var cfg = await cfgR.json().catch(function () {
        return {};
      });
      if (!cfg.configured && !cfg.clientId) {
        log('PayPal not configured on server yet · set PAYPAL_CLIENT_ID + SECRET', 'err');
        log('Owner can still develop when logged in as ' + ARCHITECT_EMAIL, 'dim');
        return { ok: false, error: 'paypal_not_configured' };
      }
      log('PayPal · creating €' + t.priceEur + ' order for ' + t.label + '…', 'ok');
      var cr = await fetch(origin + '/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: t.id,
          priceEur: t.priceEur,
          returnUrl: origin,
          origin: origin,
        }),
      });
      var order = await cr.json().catch(function () {
        return {};
      });
      if (!order.ok || !order.approveUrl) {
        log('PayPal create failed · ' + (order.error || order.hint || cr.status), 'err');
        return { ok: false, error: order.error || 'create_failed', detail: order };
      }
      try {
        sessionStorage.setItem(
          'sn:paypal-pending',
          JSON.stringify({
            orderId: order.orderId,
            tierId: t.id,
            priceEur: t.priceEur,
            at: now(),
          })
        );
      } catch (_) {}
      log('Opening PayPal · complete payment to unlock Grok', 'ok');
      // Redirect to PayPal approval
      location.href = order.approveUrl;
      return { ok: true, redirect: true, orderId: order.orderId };
    } catch (e) {
      log('PayPal error · ' + (e && e.message ? e.message : e), 'err');
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  /** After return from PayPal (?paypal=success&token=ORDERID&tier=spark) */
  async function completePayPalReturn() {
    try {
      var q = new URLSearchParams(location.search || '');
      var flag = q.get('paypal');
      if (!flag) return null;
      if (flag === 'cancel') {
        log('PayPal cancelled · no subscription change', 'dim');
        cleanPayPalUrl();
        return { ok: false, cancelled: true };
      }
      if (flag !== 'success') return null;
      var orderId = q.get('token') || q.get('orderId') || '';
      var tierId = q.get('tier') || '';
      try {
        var pending = JSON.parse(sessionStorage.getItem('sn:paypal-pending') || 'null');
        if (pending) {
          if (!orderId) orderId = pending.orderId;
          if (!tierId) tierId = pending.tierId;
        }
      } catch (_) {}
      if (!orderId) {
        log('PayPal return missing order id', 'err');
        cleanPayPalUrl();
        return { ok: false, error: 'missing_order' };
      }
      log('PayPal · capturing payment…', 'ok');
      var origin = location.origin || '';
      var r = await fetch(origin + '/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderId, tierId: tierId }),
      });
      var j = await r.json().catch(function () {
        return {};
      });
      if (!j.ok) {
        log('PayPal capture failed · ' + (j.error || r.status), 'err');
        cleanPayPalUrl();
        return { ok: false, error: j.error || 'capture_failed' };
      }
      var ref = 'paypal:' + (j.captureId || j.orderId || orderId);
      var sub = subscribe(tierId || 'spark', {
        paymentRef: ref,
        provider: 'paypal',
        demo: false,
      });
      try {
        sessionStorage.removeItem('sn:paypal-pending');
      } catch (_) {}
      cleanPayPalUrl();
      log('PayPal paid · Grok budget active · ' + ref, 'ok');
      return { ok: true, subscribe: sub, capture: j };
    } catch (e) {
      log('PayPal return error · ' + (e && e.message ? e.message : e), 'err');
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  function cleanPayPalUrl() {
    try {
      var u = new URL(location.href);
      if (!u.searchParams.has('paypal')) return;
      u.searchParams.delete('paypal');
      u.searchParams.delete('token');
      u.searchParams.delete('orderId');
      u.searchParams.delete('tier');
      u.searchParams.delete('PayerID');
      history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
    } catch (_) {}
  }

  function cancel() {
    var st = loadState();
    st.active = false;
    saveState(st);
    log('Subscription cancelled · free mind only', 'dim');
    return { ok: true };
  }

  function listPlans() {
    return TIERS.map(function (t) {
      return {
        id: t.id,
        priceEur: t.priceEur,
        apiBudgetEur: t.apiBudgetEur,
        userFacingApiValue: t.apiBudgetEur * MARKUP,
        label: t.label,
        note: t.note,
      };
    });
  }

  function printPlans() {
    log('— AI plans · every euro I am billed, you pay three —', 'ok');
    log(
      'xAI now · ' +
        RATES.model +
        ' · €' +
        eurIn().toFixed(2) +
        '/M in · €' +
        eurOut().toFixed(2) +
        '/M out · as of ' +
        RATES.asof,
      'dim'
    );
    TIERS.forEach(function (t) {
      log(
        '€' +
          t.priceEur +
          '/mo · ' +
          t.label +
          ' · real mind €' +
          t.apiBudgetEur +
          ' · ' +
          t.note,
        'dim'
      );
    });
    var s = status();
    log('You: ' + s.label, s.active || s.owner ? 'ok' : 'dim');
    if (s.owner && !global.__snPaidMindSaid) {
      global.__snPaidMindSaid = 1;
      log('You are the architect. The paid mind is on.', 'ok');
    } else if (!s.owner && s.giftLeft > 0) log(s.giftLeft + ' tastes left on the paid mind. Then a plan.', 'ok');
    else log('Type: subscribe 3   or   subscribe 13 · 33 · 300', 'ok');
  }

  /* ── Transcript (training fuel) ── */
  function loadTx() {
    try {
      var a = JSON.parse(localStorage.getItem(TX_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (_) {
      return [];
    }
  }

  function saveTx(a) {
    try {
      localStorage.setItem(TX_KEY, JSON.stringify(a.slice(-500)));
    } catch (_) {}
  }

  function trackTranscript(kind, row) {
    var a = loadTx();
    a.push({
      t: now(),
      iso: new Date().toISOString(),
      kind: kind,
      email: userEmail() || null,
      owner: isOwner(),
      plan: status().tierId,
      row: row,
    });
    saveTx(a);
    // Feed mind when user/assistant pair
    try {
      if (
        kind === 'turn' &&
        row &&
        row.user &&
        row.assistant &&
        global.SNAstranovMind &&
        SNAstranovMind.learnInteraction
      ) {
        SNAstranovMind.learnInteraction(row.user, row.assistant, {
          score: 0.55,
          source: 'transcript',
        });
      }
    } catch (_) {}
    try {
      if (global.SNUsage && SNUsage.track) SNUsage.track('ai_tx_' + kind, { k: kind });
    } catch (_) {}
  }

  function recordTurn(userMsg, assistantMsg, meta) {
    trackTranscript('turn', {
      user: String(userMsg || '').slice(0, 2000),
      assistant: String(assistantMsg || '').slice(0, 4000),
      meta: meta || {},
    });
  }

  function exportTranscript() {
    return {
      exportedAt: new Date().toISOString(),
      status: status(),
      turns: loadTx(),
    };
  }

  /**
   * Decide engine for this AI turn.
   * Returns { engine: 'owner-paid'|'paid'|'free-cloud'|'free-mind', forcePaid, allowPaid }
   */
  function routeEngine(opts) {
    opts = opts || {};
    var s = status();
    if (s.owner) {
      return {
        engine: 'owner-paid',
        forcePaid: true,
        allowPaid: true,
        freeFirst: false,
        notice: 'Architect · paid mind',
      };
    }
    var gate = canUsePaid();
    if (gate.ok && gate.reason === 'gift') {
      return {
        engine: 'gift-paid',
        forcePaid: true,
        allowPaid: true,
        gift: true,
        giftLeft: gate.giftLeft,
        freeFirst: false,
        notice: 'Taste ' + (GIFT_MAX - gate.giftLeft + 1) + ' of ' + GIFT_MAX,
      };
    }
    if (gate.ok) {
      return {
        engine: 'paid',
        forcePaid: opts.forcePaid !== false,
        allowPaid: true,
        freeFirst: false,
        remaining: gate.remaining,
        notice: 'Plan · €' + gate.remaining.toFixed(2) + ' real mind left',
      };
    }
    if (gate.reason === 'quota_exhausted') {
      return {
        engine: 'paywall',
        paywall: true,
        forcePaid: false,
        allowPaid: false,
        freeFirst: false,
        notice: 'Plan budget used · type subscribe 13',
      };
    }
    return {
      engine: 'paywall',
      paywall: true,
      forcePaid: false,
      allowPaid: false,
      freeFirst: false,
      notice: 'Three tastes done · type plans',
    };
  }

  /**
   * Local sandbox AI proxy path (serve-astranov /api/ai) + cloud aicycle.
   */
  async function askPowerful(message, opts) {
    opts = opts || {};
    var route = routeEngine(opts);
    if (route.paywall) {
      printPlans();
      log(
        route.notice ||
          'Three tastes are done. Subscribe. Every euro I am billed, the plan charges three.',
        'ok'
      );
      return { ok: false, paywall: true, route: route, text: null };
    }
    var headers = { 'Content-Type': 'application/json' };
    try {
      if (global.SNAuth && SNAuth.authHeaders) {
        var h = await SNAuth.authHeaders();
        Object.keys(h).forEach(function (k) {
          headers[k] = h[k];
        });
      }
    } catch (_) {}

    var body = {
      message: String(message || '').slice(0, 4000),
      mode: opts.mode || 'chat',
      model: opts.model || RATES.model || 'grok-4.6',
      allow_paid: !!route.allowPaid,
      force_paid: opts.forcePaid !== false && !!route.forcePaid,
      owner: isOwner(),
      gift: !!route.gift,
      gift_left: route.giftLeft || giftLeft(),
      subscription: status(),
      history: opts.history || [],
    };

    // Prefer same-origin /api/ai (sandbox proxy) then cloud aicycle
    var urls = [];
    try {
      var host = location.hostname || '';
      if (host === 'localhost' || host === '127.0.0.1' || host === 'astranov.eu' || host === 'www.astranov.eu')
        urls.push(location.origin + '/api/ai');
    } catch (_) {}
    try {
      var cfg = global.SN_CONFIG || {};
      if (cfg.sbUrl || global.SB_URL)
        urls.push((cfg.sbUrl || global.SB_URL).replace(/\/$/, '') + '/functions/v1/aicycle');
    } catch (_) {}

    var lastErr = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var t = setTimeout(function () {
          try {
            if (ctrl) ctrl.abort();
          } catch (_) {}
        }, opts.timeoutMs || 20000);
        var r = await fetch(urls[i], {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
          signal: ctrl ? ctrl.signal : undefined,
        });
        clearTimeout(t);
        if (!r.ok) {
          lastErr = 'HTTP ' + r.status;
          continue;
        }
        var j = await r.json().catch(function () {
          return {};
        });
        var text = String(j.text || j.response || j.message || '').trim();
        if (!text) {
          lastErr = 'empty';
          continue;
        }
        var apiEur = estimateApiEur(j.usage || j.meter || {});
        if (j.paid || j.paid_fallback || (j.via && /xai|grok/i.test(String(j.via)))) {
          recordSpend(apiEur, { via: j.via, url: urls[i] });
          if (route.gift) consumeGift();
        }
        recordTurn(message, text, {
          via: j.via || route.engine,
          paid: !!(j.paid || j.paid_fallback),
          route: route.engine,
          gift: !!route.gift,
        });
        var left = giftLeft();
        var notice = j.paid_notice || route.notice;
        if (route.gift && left <= 0) {
          notice = 'That was the third taste. Type plans.';
        } else if (route.gift) {
          notice = 'Taste used · ' + left + ' left · then a plan';
        }
        return {
          ok: true,
          text: text,
          via: j.via || route.engine,
          paid: !!(j.paid || j.paid_fallback),
          route: route,
          giftLeft: left,
          notice: notice,
        };
      } catch (e) {
        lastErr = e && e.message ? e.message : String(e);
      }
    }
    return { ok: false, error: lastErr || 'offline', route: route };
  }

  async function handleLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;

    if (
      low === 'plans' ||
      low === 'plan list' ||
      low === 'subscriptions' ||
      low === 'pricing ai' ||
      low === 'ai plans'
    ) {
      printPlans();
      return true;
    }
    if (low === 'plan' || low === 'plan status' || low === 'sub' || low === 'subscription') {
      var s = status();
      log(s.label, s.active || s.owner ? 'ok' : 'dim');
      log(
        'Mode ' +
          s.mode +
          ' · spent €' +
          (s.spentApiEur === Infinity ? 0 : Number(s.spentApiEur).toFixed(4)) +
          ' · period ' +
          s.period +
          ' · markup ×' +
          MARKUP,
        'dim'
      );
      if (!s.owner && !s.active) log('Type: subscribe 3  · or subscribe 13|33|300', 'ok');
      return true;
    }
    var mDemo = low.match(/^subscribe\s+demo\s+(\d+|spark|pulse|orbit|nova)\b/);
    if (mDemo || low === 'subscribe demo' || low === 'demo subscribe') {
      var tier = mDemo ? mDemo[1] : '3';
      // Local demo entitlement so AI cycle can be tested without PayPal sandbox
      subscribe(tier, { demo: true, paymentRef: 'demo-local', provider: 'demo' });
      log('Demo sub active · real users pay via PayPal: subscribe 3', 'ok');
      return true;
    }
    var mSub = low.match(/^subscribe\s+(\d+|spark|pulse|orbit|nova)\b/);
    if (mSub || low === 'subscribe') {
      if (!mSub) {
        printPlans();
        log('Pay with PayPal: subscribe 3 · or 13 · 33 · 300', 'ok');
        log('Owner login (' + ARCHITECT_EMAIL + ') → paid Grok free for building', 'dim');
        return true;
      }
      // Fire async PayPal (or owner free)
      Promise.resolve(startPayPalCheckout(mSub[1])).catch(function (e) {
        log('Subscribe failed · ' + e, 'err');
      });
      return true;
    }
    if (low === 'paypal' || low === 'paypal status' || low === 'pay status') {
      Promise.resolve()
        .then(function () {
          return fetch((location.origin || '') + '/api/paypal/config').then(function (r) {
            return r.json();
          });
        })
        .then(function (c) {
          if (c && c.configured) log('PayPal ready · mode ' + (c.mode || '?'), 'ok');
          else log('PayPal not configured · set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET on server', 'dim');
          printPlans();
        })
        .catch(function () {
          log('PayPal config unreachable', 'err');
        });
      return true;
    }
    if (low === 'unsubscribe' || low === 'cancel plan' || low === 'plan cancel') {
      cancel();
      return true;
    }
    if (low === 'transcript' || low === 'ai transcript' || low === 'usage ai') {
      var tx = loadTx();
      log('AI transcript · ' + tx.length + ' rows (training fuel)', 'ok');
      tx.slice(-8).forEach(function (row) {
        if (row.kind === 'turn' && row.row) {
          log(
            '· ' +
              String(row.row.user || '').slice(0, 40) +
              ' → ' +
              String(row.row.assistant || '').slice(0, 40),
            'dim'
          );
        } else if (row.kind === 'spend') {
          log('· spend €' + (row.row && row.row.apiEur), 'dim');
        }
      });
      return true;
    }
    if (low === 'transcript export' || low === 'export transcript') {
      try {
        var blob = new Blob([JSON.stringify(exportTranscript(), null, 2)], {
          type: 'application/json',
        });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'astranov-ai-transcript.json';
        a.click();
        log('Transcript exported', 'ok');
      } catch (e) {
        log('Export failed', 'err');
      }
      return true;
    }
    if (low === 'owner session' || low === 'i am owner') {
      if (userEmail() === ARCHITECT_EMAIL) {
        try { localStorage.setItem('sn:owner-session', '1'); } catch (_) {}
        if (!global.__snPaidMindSaid) {
          global.__snPaidMindSaid = 1;
          log('You are signed in. The paid mind is on.', 'ok');
        }
      } else {
        log('Owner path requires Google login as ' + ARCHITECT_EMAIL, 'err');
      }
      return true;
    }
    if (low === 'xai status' || low === 'api key status' || low === 'grok key') {
      log(status().label + ' · mode=' + status().mode, 'ok');
      Promise.resolve()
        .then(function () {
          return fetch((location.origin || '') + '/api/health').then(function (r) {
            return r.json();
          });
        })
        .then(function (h) {
          if (h && h.xai) log('Server proxy: XAI key present', 'ok');
          else log('Server proxy: no XAI key here · set Supabase secret XAI_API_KEY', 'dim');
        })
        .catch(function () {
          log('Set XAI_API_KEY on Supabase → Edge Functions → Secrets for aicycle', 'dim');
        });
      return true;
    }
    return false;
  }

  function init() {
    try {
      fetch((location.origin || '') + '/api/ai/pricing', { cache: 'no-store' })
        .then(function (r) {
          return r.json();
        })
        .then(function (p) {
          if (!p || !p.ok) return;
          if (p.usdInPerM) RATES.usdInPerM = Number(p.usdInPerM);
          if (p.usdOutPerM) RATES.usdOutPerM = Number(p.usdOutPerM);
          if (p.eurPerUsd) RATES.eurPerUsd = Number(p.eurPerUsd);
          if (p.model) RATES.model = String(p.model);
          if (p.asof) RATES.asof = String(p.asof);
          rebuildTiers();
        })
        .catch(function () {});
    } catch (_) {}
    // Complete PayPal return if present
    try {
      if (/[?&]paypal=/.test(location.search || '')) {
        setTimeout(function () {
          completePayPalReturn();
        }, 400);
      }
    } catch (_) {}
    // Owner arm reminder
    try {
      if (isOwner()) {
        try {
          localStorage.setItem('sn:owner-session', '1');
        } catch (_) {}
      }
    } catch (_) {}
  }

  global.SNSubscription = {
    MARKUP: MARKUP,
    TIERS: TIERS,
    ARCHITECT_EMAIL: ARCHITECT_EMAIL,
    status: status,
    canUsePaid: canUsePaid,
    subscribe: subscribe,
    startPayPalCheckout: startPayPalCheckout,
    completePayPalReturn: completePayPalReturn,
    cancel: cancel,
    listPlans: listPlans,
    printPlans: printPlans,
    recordSpend: recordSpend,
    estimateApiEur: estimateApiEur,
    routeEngine: routeEngine,
    askPowerful: askPowerful,
    recordTurn: recordTurn,
    exportTranscript: exportTranscript,
    handleLine: handleLine,
    isOwner: isOwner,
    giftLeft: giftLeft,
    GIFT_MAX: GIFT_MAX,
    RATES: RATES,
    loadTx: loadTx,
    init: init,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
