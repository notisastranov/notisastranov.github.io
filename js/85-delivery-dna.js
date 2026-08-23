/**
 * SPECS: Delivery DNA — instant internal payments + city street routing with custom commands.
 * - Instant AVC/Coins balance pay (no external card wait when balance covers total)
 * - Street routes via OSRM + alternatives scored for: avoid lights, avoid populated, hidden/fast backstreets
 * CLI: pay, route, deliver route <prefs>, dna status
 * Owner: SPECS.md §3.5 delivery + this module.
 */
/* SPECS: delivery DNA — instant internal pay + street route prefs */
const DeliveryDNA = {
  version: '20260723-dna1',
  prefs: {
    avoidTrafficLights: false,
    avoidPopulated: false,
    useHiddenRoads: false,
    useFastRoads: true,
    avoidMotorway: false,
    avoidTolls: false,
  },
  lastRoute: null,
  lastPay: null,
  _ledger: [],
  _inited: false,

  STORAGE: 'astranov:delivery-dna-v1',

  init() {
    if (this._inited) return this;
    this._inited = true;
    this._load();
    this._patchDriving();
    this._patchCommerce();
    this._bindCli();
    window.DeliveryDNA = this;
    console.log('%c[DeliveryDNA] ready · ' + this.version, 'color:#3d9eff;font-weight:700');
    return this;
  },

  _load() {
    try {
      const j = JSON.parse(localStorage.getItem(this.STORAGE) || '{}');
      if (j.prefs) Object.assign(this.prefs, j.prefs);
      if (Array.isArray(j.ledger)) this._ledger = j.ledger.slice(-40);
    } catch (_) {}
  },

  _save() {
    try {
      localStorage.setItem(this.STORAGE, JSON.stringify({
        prefs: this.prefs,
        ledger: this._ledger.slice(-40),
      }));
    } catch (_) {}
  },

  statusLine() {
    const p = this.prefs;
    const flags = [];
    if (p.avoidTrafficLights) flags.push('no-lights');
    if (p.avoidPopulated) flags.push('no-crowd');
    if (p.useHiddenRoads) flags.push('hidden');
    if (p.useFastRoads) flags.push('fast');
    if (p.avoidMotorway) flags.push('no-motorway');
    if (p.avoidTolls) flags.push('no-toll');
    return 'DeliveryDNA · ' + (flags.length ? flags.join(' · ') : 'default roads')
      + (this.lastRoute ? ' · last ' + (this.lastRoute.distanceM / 1000).toFixed(1) + 'km' : '');
  },

  setPref(key, val) {
    if (!(key in this.prefs)) return false;
    this.prefs[key] = !!val;
    this._save();
    return true;
  },

  /** Parse natural / CLI prefs into this.prefs */
  applyCommandText(text) {
    const s = String(text || '').toLowerCase();
    let n = 0;
    const on = (re, key, v = true) => {
      if (re.test(s)) { this.prefs[key] = v; n++; }
    };
    on(/\b(avoid|no)\s*(traffic\s*)?(lights?|signals?|red\s*lights?)\b/, 'avoidTrafficLights', true);
    on(/\b(with|use)\s*(traffic\s*)?lights?\b/, 'avoidTrafficLights', false);
    on(/\b(avoid|no|skip)\s*(populated|crowded|busy|main)\s*(roads?|streets?|areas?)?\b/, 'avoidPopulated', true);
    on(/\b(use\s+)?(hidden|back|backstreet|quiet|side)\s*(roads?|streets?)?\b/, 'useHiddenRoads', true);
    on(/\b(fast|quick|express|speed)\s*(roads?|route|path)?\b/, 'useFastRoads', true);
    on(/\b(avoid|no)\s*(motorways?|highways?|freeways?)\b/, 'avoidMotorway', true);
    on(/\b(avoid|no)\s*tolls?\b/, 'avoidTolls', true);
    on(/\breset\s*(route|prefs|dna)?\b/, null);
    if (/\breset\s*(route|prefs|dna)?\b/.test(s)) {
      Object.assign(this.prefs, {
        avoidTrafficLights: false,
        avoidPopulated: false,
        useHiddenRoads: false,
        useFastRoads: true,
        avoidMotorway: false,
        avoidTolls: false,
      });
      n++;
    }
    if (n) this._save();
    return n;
  },

  haversineM(a, b) {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  },

  _osrmExclude() {
    const ex = [];
    if (this.prefs.avoidMotorway || this.prefs.useHiddenRoads) ex.push('motorway');
    if (this.prefs.avoidTolls) ex.push('toll');
    return ex.length ? '&exclude=' + ex.join(',') : '';
  },

  /**
   * Score OSRM route against prefs (higher = better).
   * Heuristics when full city graph isn't available.
   */
  scoreRoute(route) {
    if (!route) return -1e9;
    let score = 0;
    const dist = route.distance || 0;
    const dur = route.duration || 0;
    // Prefer shorter duration when "fast"
    if (this.prefs.useFastRoads) score += 100000 / Math.max(60, dur);
    else score += 50000 / Math.max(100, dist);

    const steps = [];
    (route.legs || []).forEach((leg) => (leg.steps || []).forEach((s) => steps.push(s)));
    const turnHeavy = steps.filter((s) =>
      /turn|end of road|roundabout|rotary|fork|merge/i.test(s.maneuver?.type || '')
    ).length;
    const lightsProxy = steps.filter((s) =>
      /turn|end of road|new name/i.test(s.maneuver?.type || '')
    ).length;

    if (this.prefs.avoidTrafficLights) {
      // fewer intersections / turns ≈ fewer signals
      score -= lightsProxy * 8;
      score -= turnHeavy * 4;
    }
    if (this.prefs.avoidPopulated) {
      // penalize named "main/avenue/square/plaza" and many short steps in city cores
      const busyNames = steps.filter((s) =>
        /\b(avenue|av\.|square|plaza|main|central|λεωφ|πλατε)/i.test(s.name || '')
      ).length;
      score -= busyNames * 12;
      score -= (steps.length > 40 ? (steps.length - 40) * 2 : 0);
    }
    if (this.prefs.useHiddenRoads) {
      // reward quieter local road names / fewer motorway refs
      const local = steps.filter((s) =>
        /\b(lane|alley|path|service|δρόμος|σοκάκι|back)/i.test(s.name || '') || !(s.name || '').trim()
      ).length;
      score += local * 3;
      score -= steps.filter((s) => /motorway|highway|freeway/i.test(s.name || '')).length * 20;
    }
    // slight preference for shorter overall
    score -= dist / 500;
    return score;
  },

  async fetchStreetRoute(from, to, opts = {}) {
    if (!from || !to || from.lat == null || to.lat == null) return null;
    const exclude = this._osrmExclude();
    const base =
      'https://router.project-osrm.org/route/v1/driving/' +
      from.lng +
      ',' +
      from.lat +
      ';' +
      to.lng +
      ',' +
      to.lat +
      '?overview=full&geometries=geojson&steps=true&alternatives=true' +
      exclude;

    const candidates = [];
    try {
      const r = await fetch(base);
      const j = await r.json();
      if (j.code === 'Ok' && j.routes?.length) {
        j.routes.forEach((rt, i) => candidates.push({ route: rt, tag: 'alt' + i }));
      }
    } catch (e) {
      console.warn('[DeliveryDNA] OSRM', e);
    }

    // Extra candidate: hidden profile — force exclude motorway even if not set
    if (this.prefs.useHiddenRoads || this.prefs.avoidPopulated) {
      try {
        const url2 =
          'https://router.project-osrm.org/route/v1/driving/' +
          from.lng +
          ',' +
          from.lat +
          ';' +
          to.lng +
          ',' +
          to.lat +
          '?overview=full&geometries=geojson&steps=true&exclude=motorway';
        const r2 = await fetch(url2);
        const j2 = await r2.json();
        if (j2.code === 'Ok' && j2.routes?.[0]) {
          candidates.push({ route: j2.routes[0], tag: 'hidden' });
        }
      } catch (_) {}
    }

    if (!candidates.length) return null;

    let best = candidates[0];
    let bestScore = this.scoreRoute(best.route);
    for (let i = 1; i < candidates.length; i++) {
      const sc = this.scoreRoute(candidates[i].route);
      if (sc > bestScore) {
        best = candidates[i];
        bestScore = sc;
      }
    }

    const route = best.route;
    const coords = (route.geometry?.coordinates || []).map((c) => ({ lng: c[0], lat: c[1] }));
    const steps = (route.legs?.[0]?.steps || []).map((s) => ({
      instruction: (s.maneuver?.type || 'continue') + ' ' + (s.name || ''),
      dist: s.distance,
      loc: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] },
      name: s.name || '',
      type: s.maneuver?.type || '',
    }));

    const out = {
      coords,
      steps,
      distanceM: route.distance || 0,
      durationS: route.duration || 0,
      score: bestScore,
      tag: best.tag,
      prefs: { ...this.prefs },
      provider: 'osrm+dna',
    };
    this.lastRoute = out;
    return out;
  },

  async routeTo(lat, lng, opts = {}) {
    const from = window._lastPos || window.DrivingView?.lastFix;
    if (!from) {
      ACIControl?.reply?.('Locate first · then route');
      return null;
    }
    if (opts.commandText) this.applyCommandText(opts.commandText);
    const to = { lat: +lat, lng: +lng };
    const route = await this.fetchStreetRoute(from, to, opts);
    if (!route || route.coords.length < 2) {
      ACIControl?.reply?.('No street route — try again');
      return null;
    }
    if (window.DrivingView) {
      DrivingView.destination = to;
      DrivingView.routeCoords = route.coords;
      DrivingView.steps = route.steps;
      DrivingView.stepIdx = 0;
      DrivingView.drawRoute?.();
      if (!DrivingView.active && opts.activate !== false) {
        try { DrivingView.activate?.(); } catch (_) {}
      }
      if (route.steps[0]) DrivingView.showStep?.(route.steps[0]);
    }
    CityMap?.setRoute?.(route.coords);
    const km = (route.distanceM / 1000).toFixed(1);
    const min = Math.round(route.durationS / 60);
    const line =
      '🛣 ' +
      km +
      ' km · ~' +
      min +
      ' min · ' +
      this.statusLine().replace('DeliveryDNA · ', '');
    GlobeDeck?.setPreview?.(line);
    ACIControl?.reply?.(line, 'ok');
    AciCli?.print?.(line, 'ok');
    return route;
  },

  /**
   * Instant internal payment — AVC/Coins balance, no external wallet wait.
   * Uses Commerce.placeOrder with pay_with_balance when cart/vendor ready,
   * or direct balance_ledger debit RPC when available.
   */
  async payInstant(amountEur, meta = {}) {
    if (!Auth?.user) {
      Auth?.openLoginModal?.('Sign in for instant Coins pay');
      return { ok: false, error: 'auth' };
    }
    const amount = Math.max(0.01, Number(amountEur) || 0);
    const label = meta.label || meta.note || 'Astranov instant pay';

    // Prefer full commerce checkout when suggestion/cart exists
    if (window.Commerce?._suggestion && meta.useSuggestion !== false) {
      try {
        await Commerce.confirmAndPay(false);
        const rec = {
          at: new Date().toISOString(),
          amount,
          label,
          via: 'commerce_balance',
          ok: true,
        };
        this._ledger.push(rec);
        this.lastPay = rec;
        this._save();
        return { ok: true, via: 'commerce_balance', amount };
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }
    }

    // Direct ledger path
    try {
      const headers = await Auth.authHeaders();
      // Try RPC instant_pay if deployed
      let r = await fetch(SB_URL + '/rest/v1/rpc/instant_avc_pay', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          p_amount: amount,
          p_label: label,
          p_meta: meta,
        }),
      });
      if (r.ok) {
        const rows = await r.json().catch(() => ({}));
        const bal = rows?.balance_after ?? rows?.[0]?.balance_after;
        if (bal != null && Commerce) Commerce._balance = bal;
        const rec = {
          at: new Date().toISOString(),
          amount,
          label,
          via: 'rpc_instant_avc_pay',
          balance_after: bal,
          ok: true,
        };
        this._ledger.push(rec);
        this.lastPay = rec;
        this._save();
        const msg = '⚡ Instant pay ' + amount.toFixed(2) + ' Coins · ' + label
          + (bal != null ? ' · bal ' + Number(bal).toFixed(2) : '');
        ACIControl?.reply?.(msg, 'ok');
        GlobeDeck?.setPreview?.(msg);
        return { ok: true, via: 'rpc', amount, balance_after: bal };
      }

      // Fallback: optimistic local + order-intake style note
      const bal = await Commerce?.fetchBalance?.();
      if (bal != null && bal < amount) {
        const msg = 'Insufficient Coins (' + bal.toFixed(2) + ') · need ' + amount.toFixed(2);
        ACIControl?.reply?.(msg, 'err');
        return { ok: false, error: 'insufficient_balance', balance: bal, needed: amount };
      }

      // Write ledger row if table allows
      const ins = await fetch(SB_URL + '/rest/v1/balance_ledger', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          user_id: Auth.user.id,
          delta: -amount,
          balance: bal != null ? bal - amount : null,
          reason: 'instant_pay',
          meta: { label, ...meta },
        }),
      });
      if (ins.ok) {
        const row = (await ins.json().catch(() => []))[0];
        if (Commerce && bal != null) Commerce._balance = bal - amount;
        const rec = {
          at: new Date().toISOString(),
          amount,
          label,
          via: 'balance_ledger',
          ok: true,
        };
        this._ledger.push(rec);
        this.lastPay = rec;
        this._save();
        FieldHud?.updateBalance?.(bal - amount);
        const msg = '⚡ Instant pay ' + amount.toFixed(2) + ' Coins · ' + label;
        ACIControl?.reply?.(msg, 'ok');
        return { ok: true, via: 'ledger', amount, row };
      }

      // Last resort: client-side receipt (server may reject until migration)
      const rec = {
        at: new Date().toISOString(),
        amount,
        label,
        via: 'client_receipt',
        ok: true,
        pending_sync: true,
      };
      this._ledger.push(rec);
      this.lastPay = rec;
      this._save();
      if (Commerce && bal != null) {
        Commerce._balance = Math.max(0, bal - amount);
        FieldHud?.updateBalance?.(Commerce._balance);
      }
      ACIControl?.reply?.(
        '⚡ Instant pay recorded ' + amount.toFixed(2) + ' Coins · ' + label + ' (sync when edge ready)',
        'ok'
      );
      return { ok: true, via: 'client_receipt', amount, pending_sync: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  },

  /** Full delivery: quote → instant pay → street route vendor→drop */
  async runDeliveryFlow(opts = {}) {
    const vendor = opts.vendor || Commerce?.selected || Commerce?.vendors?.[0];
    const drop =
      opts.drop ||
      window._clientDelivery ||
      window._lastPos;
    if (!vendor) {
      ACIControl?.reply?.('Pick a shop first · market');
      return null;
    }
    if (opts.commandText) this.applyCommandText(opts.commandText);

    const from = { lat: +vendor.lat, lng: +vendor.lng };
    const to = drop
      ? { lat: +drop.lat, lng: +drop.lng }
      : window._lastPos;
    if (!to) {
      ACIControl?.reply?.('Set delivery pin or locate');
      return null;
    }

    const km = this.haversineM(from, to) / 1000;
    const items = opts.items || Commerce?.cartItems?.() || [{ name: 'Delivery', qty: 1, price: 0 }];
    const subtotal = items.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
    const quote = await DeliveryPricing?.quote?.({
      km,
      kg: 3 + items.length,
      subtotal_eur: subtotal,
      lat: to.lat,
      lng: to.lng,
    });
    const total = quote?.total_avc ?? quote?.total_eur ?? subtotal;

    // Instant internal pay when signed in
    if (Auth?.user && opts.pay !== false) {
      if (Commerce?.selected && items.length && items[0].price != null) {
        await Commerce.placeOrder?.(vendor, items, 'DNA delivery · ' + this.statusLine(), true, {
          quote,
          deliveryLat: to.lat,
          deliveryLng: to.lng,
        });
      } else {
        await this.payInstant(total, { label: 'Delivery · ' + (vendor.name || 'shop'), km, quote });
      }
    }

    // Street DNA route for driver: vendor → drop
    const route = await this.fetchStreetRoute(from, to);
    if (route && window.DrivingView) {
      DrivingView.destination = to;
      DrivingView.routeCoords = route.coords;
      DrivingView.steps = route.steps;
      DrivingView.stepIdx = 0;
      DrivingView.drawRoute?.();
      CityMap?.setRoute?.(route.coords);
      CityMap?.setTaskGeometry?.({
        route: route.coords,
        waypoints: [
          { lat: from.lat, lng: from.lng, label: vendor.name || 'Shop' },
          { lat: to.lat, lng: to.lng, label: 'Drop' },
        ],
      });
    }

    const msg =
      '📦 Delivery DNA · ' +
      (vendor.name || 'shop') +
      ' → drop · ' +
      km.toFixed(1) +
      ' km · ' +
      (total != null ? total.toFixed(2) + ' Coins instant' : 'quote n/a') +
      ' · ' +
      this.statusLine().replace('DeliveryDNA · ', '');
    ACIControl?.reply?.(msg, 'ok');
    GlobeDeck?.setPreview?.(msg);
    return { quote, route, vendor, drop: to, total };
  },

  _patchDriving() {
    const dv = window.DrivingView;
    if (!dv || dv._dnaPatched) return;
    dv._dnaPatched = true;
    const orig = dv.fetchRoadRoute?.bind(dv);
    dv.fetchRoadRoute = async function () {
      if (this.waypoints?.length > 1) {
        return this.fetchMultiWaypointRoute?.();
      }
      const from = window._lastPos || this.lastFix;
      const to = this.destination;
      if (!from || !to) return orig?.();
      try {
        const route = await DeliveryDNA.fetchStreetRoute(from, to);
        if (route?.coords?.length >= 2) {
          this.routeCoords = route.coords;
          this.steps = route.steps;
          this.stepIdx = 0;
          this.drawRoute?.();
          if (this.steps[0]) this.showStep?.(this.steps[0]);
          GlobeDeck?.setPreview?.(
            '🛣 DNA ' +
              (route.distanceM / 1000).toFixed(1) +
              'km · ' +
              DeliveryDNA.statusLine().replace('DeliveryDNA · ', '')
          );
          return;
        }
      } catch (e) {
        console.warn('[DeliveryDNA] drive patch', e);
      }
      return orig?.();
    };
  },

  _patchCommerce() {
    const c = window.Commerce;
    if (!c || c._dnaPatched) return;
    c._dnaPatched = true;
    // After successful balance pay, stamp DNA ledger
    const orig = c.confirmAndPay?.bind(c);
    if (orig) {
      c.confirmAndPay = async function (useWallet) {
        const r = await orig(useWallet);
        if (!useWallet) {
          try {
            DeliveryDNA._ledger.push({
              at: new Date().toISOString(),
              amount: this._suggestion?.total,
              label: 'confirmAndPay',
              via: 'commerce_balance',
              ok: true,
            });
            DeliveryDNA._save();
          } catch (_) {}
        }
        return r;
      };
    }
  },

  wantsCli(line) {
    const s = String(line || '').trim().toLowerCase();
    return /^(dna|delivery\s*dna|pay(\s+instant)?|instant\s*pay|route|routing|deliver(\s+route)?|avoid\s|use\s+hidden|hidden\s+roads?|no\s+lights?|fast\s+roads?)\b/.test(
      s
    ) || /\b(avoid\s+(traffic\s*)?lights?|avoid\s+populated|hidden\s+roads?)\b/.test(s);
  },

  async handleCli(line) {
    const raw = String(line || '').trim();
    const low = raw.toLowerCase();

    if (/^(dna|delivery\s*dna)(\s+status)?$/.test(low) || low === 'route prefs') {
      const msg = this.statusLine();
      ACIControl?.reply?.(msg);
      return msg;
    }

    if (/^pay(\s+instant)?\b|^instant\s*pay\b/.test(low)) {
      const m = low.match(/(?:pay|instant\s*pay)\s+(\d+(?:\.\d+)?)/);
      const amount = m ? +m[1] : null;
      if (amount == null) {
        // pay current cart
        if (Commerce?.selected && Commerce?.cartItems?.()?.length) {
          await Commerce.placeCart?.();
          // force balance path
          const sug = Commerce._suggestion;
          if (sug) await Commerce.confirmAndPay?.(false);
          else {
            const items = Commerce.cartItems();
            await Commerce.placeOrder?.(Commerce.selected, items, 'instant DNA pay', true, {});
          }
          return 'instant cart pay';
        }
        return 'usage: pay instant <amount> · or add cart items first';
      }
      const r = await this.payInstant(amount, { label: raw });
      return r.ok ? 'paid ' + amount : r.error || 'pay failed';
    }

    // Prefs only
    if (
      /\b(avoid|use|no|hidden|fast|reset)\b/.test(low) &&
      !/\broute\s+to\b/.test(low) &&
      !/^deliver\b/.test(low)
    ) {
      const n = this.applyCommandText(raw);
      const msg = n ? 'Route prefs · ' + this.statusLine() : 'No pref change · ' + this.statusLine();
      ACIControl?.reply?.(msg);
      return msg;
    }

    if (/^deliver(\s+route)?\b/.test(low) || /^dna\s+deliver\b/.test(low)) {
      this.applyCommandText(raw);
      const r = await this.runDeliveryFlow({ commandText: raw });
      return r ? 'delivery dna ok' : 'delivery dna failed';
    }

    if (/^route\b/.test(low)) {
      this.applyCommandText(raw);
      // route to lat,lng or route to vendor / pin
      const coord = raw.match(/(-?\d+\.\d+)\s*[, ]\s*(-?\d+\.\d+)/);
      if (coord) {
        await this.routeTo(+coord[1], +coord[2], { commandText: raw });
        return 'routed';
      }
      const pin = window._clientDelivery;
      const dest =
        pin ||
        (Commerce?.selected
          ? { lat: Commerce.selected.lat, lng: Commerce.selected.lng }
          : null) ||
        DrivingView?.destination;
      if (dest) {
        await this.routeTo(dest.lat, dest.lng, { commandText: raw });
        return 'routed';
      }
      // set destination from city map center if any
      ACIControl?.reply?.('usage: route avoid lights · route hidden roads · route 36.43,28.22');
      return 'need destination';
    }

    return null;
  },

  _bindCli() {
    // SuperCli freeform hook
    const sc = window.SuperCli;
    if (sc && !sc._dnaCli) {
      sc._dnaCli = true;
      const orig = sc.exec?.bind(sc);
      if (orig) {
        sc.exec = async function (line, opts) {
          if (DeliveryDNA.wantsCli(line)) {
            const msg = await DeliveryDNA.handleCli(line);
            if (msg != null) return { handled: true, msg };
          }
          return orig(line, opts);
        };
      }
    }
    // Core brain early path
    const brain = window.AstranovCoreBrain;
    if (brain && !brain._dnaCli) {
      brain._dnaCli = true;
      const oh = brain.handle?.bind(brain);
      if (oh) {
        brain.handle = async function (text, opts) {
          if (DeliveryDNA.wantsCli(text)) {
            const msg = await DeliveryDNA.handleCli(text);
            if (msg != null) {
              this.deliver?.(String(msg), { kind: 'ok' });
              return { handled: true };
            }
          }
          return oh(text, opts);
        };
      }
    }
  },
};

window.DeliveryDNA = DeliveryDNA;
// Auto-init when deferred systems exist
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      try { DeliveryDNA.init(); } catch (e) { console.warn('[DeliveryDNA]', e); }
    }, 900);
  });
} else {
  setTimeout(() => {
    try { DeliveryDNA.init(); } catch (e) { console.warn('[DeliveryDNA]', e); }
  }, 900);
}
