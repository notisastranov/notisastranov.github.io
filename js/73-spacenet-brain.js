// === SPACENET BRAIN — intent + multi-crawler mesh for city/globe ingestion ===
const SpaceNetBrain = {
  _crawlBusy: new Set(),
  _lastClassify: null,
  _sectorCache: new Map(),
  _lastMulti: 0,

  ACTION_IDS: ['list_vendor', 'list_shop', 'driver_base', 'post', 'upload_photo', 'upload_video', 'deliver_here', 'drive_here', 'route', 'explore', 'order'],

  CRAWLERS: ['vendors', 'places', 'weather', 'news', 'drivers', 'tasks'],

  async classifyIntent(text, ctx) {
    ctx = ctx || {};
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      return {
        primary: ClassifiedTriangles.defaultTop3(),
        more: ClassifiedTriangles.defaultMore(),
        source: 'default',
      };
    }

    const local = ClassifiedTriangles.scoreLocal(trimmed);
    const primary = local.slice(0, 3);
    const more = local.slice(3);

    void this._refineWithAi(trimmed, ctx, local);

    if (ctx.lat != null && ctx.lng != null) {
      void this.crawlAll(ctx.lat, ctx.lng, ctx.radiusKm || 2);
    }

    this._lastClassify = { text: trimmed, primary, more, at: Date.now() };
    return { primary, more, source: 'local' };
  },

  async _refineWithAi(text, ctx, localHints) {
    const ids = this.ACTION_IDS.join(', ');
    const prompt = 'SpaceNet place intent at ' + (ctx.lat?.toFixed?.(4) || '?') + ',' + (ctx.lng?.toFixed?.(4) || '?')
      + ': "' + text + '". Reply with ONLY a JSON array of action ids (max 6) from: ' + ids
      + '. First 3 = most common for this intent.';
    const r = await AiRouter?.ask?.(prompt, { timeoutMs: 14000 });
    const raw = String(r?.text || r?.raw?.text || '').trim();
    const parsed = this._parseActionIds(raw);
    if (!parsed.length) return;
    const catalog = ClassifiedTriangles.CATALOG;
    const ordered = parsed.map(id => catalog.find(c => c.id === id)).filter(Boolean);
    const rest = catalog.filter(c => !ordered.find(o => o.id === c.id));
    const full = ordered.concat(rest);
    ClassifiedTriangles.render(full.slice(0, 3), full.slice(3), ctx.pin);
    this._lastClassify = { text, primary: full.slice(0, 3), more: full.slice(3), source: 'ai' };
  },

  _parseActionIds(raw) {
    try {
      const m = raw.match(/\[[\s\S]*?\]/);
      if (m) {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) return arr.map(String).filter(id => this.ACTION_IDS.includes(id));
      }
    } catch (_) {}
    const found = [];
    for (const id of this.ACTION_IDS) {
      if (new RegExp(id.replace(/_/g, '[\\s_-]+'), 'i').test(raw)) found.push(id);
    }
    return found;
  },

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (typeof SB_KEY !== 'undefined') h.apikey = SB_KEY;
    if (Auth?.session?.access_token) h.Authorization = 'Bearer ' + Auth.session.access_token;
    else if (typeof SB_KEY !== 'undefined') h.Authorization = 'Bearer ' + SB_KEY;
    return h;
  },

  /** Back-compat single sector crawl (vendors edge). */
  async crawlArea(lat, lng, radiusKm) {
    return this.crawlVendors(lat, lng, radiusKm);
  },

  async crawlVendors(lat, lng, radiusKm) {
    const key = 'v:' + lat.toFixed(3) + ',' + lng.toFixed(3);
    if (this._crawlBusy.has(key)) return { skipped: true };
    this._crawlBusy.add(key);
    try {
      const radius = Math.round((radiusKm || 2) * 1000);
      const body = {
        lat, lng,
        radius,
        radius_km: radiusKm || 2,
        source: 'spacenet-brain',
      };
      const r = await fetch((typeof SB_URL !== 'undefined' ? SB_URL : '') + '/functions/v1/vendor-crawler', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
      });
      const j = r.ok ? await r.json().catch(() => ({})) : {};
      this._sectorCache.set(key, { at: Date.now(), count: j.count || 0 });
      AciCli?.print?.('crawler · vendors · sector ' + key.slice(2) + (j.count != null ? ' · ' + j.count : ''), 'dim');
      // Refresh commerce markers if present
      if (j.count > 0) void window.Commerce?.loadVendors?.();
      return j;
    } catch (e) {
      AciCli?.print?.('crawler · vendors failed · local demo shops', 'dim');
      return { ok: false, error: String(e?.message || e) };
    } finally {
      setTimeout(() => this._crawlBusy.delete(key), 120000);
    }
  },

  /** Open-Meteo weather (CORS-friendly) for delivery surcharges / city HUD. */
  async crawlWeather(lat, lng) {
    const key = 'w:' + lat.toFixed(2) + ',' + lng.toFixed(2);
    if (this._crawlBusy.has(key)) return this._sectorCache.get(key)?.data;
    this._crawlBusy.add(key);
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat
        + '&longitude=' + lng + '&current=temperature_2m,weather_code,wind_speed_10m,precipitation';
      const r = await fetch(url);
      const j = await r.json();
      const cur = j.current || {};
      const data = {
        temp_c: cur.temperature_2m,
        wind: cur.wind_speed_10m,
        precip: cur.precipitation,
        code: cur.weather_code,
        at: Date.now(),
      };
      this._sectorCache.set(key, { at: Date.now(), data });
      window._spaceNetWeather = data;
      AciCli?.print?.('crawler · weather · ' + (data.temp_c ?? '?') + '°C · wind ' + (data.wind ?? '?'), 'dim');
      return data;
    } catch (_) {
      return null;
    } finally {
      setTimeout(() => this._crawlBusy.delete(key), 60000);
    }
  },

  /** Lightweight news tick for region (uses existing Comms if present). */
  async crawlNews(lat, lng) {
    try {
      Comms?.loadNews?.();
      NewsFeed?.flash?.();
      AciCli?.print?.('crawler · news · sector', 'dim');
      return { ok: true };
    } catch (_) {
      return { ok: false };
    }
  },

  /** Nearby drivers for delivery infrastructure. */
  async crawlDrivers(lat, lng) {
    try {
      await LazyModules?.ensure?.();
      const d = await window.Commerce?.fetchNearbyDrivers?.(lat, lng);
      if (d?.length) window.Commerce?.showDriversOnGlobe?.(d);
      AciCli?.print?.('crawler · drivers · ' + (d?.length || 0), 'dim');
      return { count: d?.length || 0, drivers: d || [] };
    } catch (_) {
      return { count: 0 };
    }
  },

  /** Places = vendors + city map refresh. */
  async crawlPlaces(lat, lng, radiusKm) {
    const v = await this.crawlVendors(lat, lng, radiusKm);
    try {
      CityMap?.refreshTiles?.(lat, lng);
      CityLife?._pulseFriends?.();
    } catch (_) {}
    return v;
  },

  /** Sync open city tasks onto globe. */
  async crawlTasks(lat, lng) {
    try {
      CityTasks?.init?.();
      const open = CityTasks?.list?.({ open: true }) || [];
      open.slice(0, 12).forEach(t => CityTasks?._showOnGlobe?.(t));
      AciCli?.print?.('crawler · tasks · open ' + open.length, 'dim');
      return { count: open.length };
    } catch (_) {
      return { count: 0 };
    }
  },

  /** Run all SpaceNet crawlers for a lat/lng sector. */
  async crawlAll(lat, lng, radiusKm, opts) {
    opts = opts || {};
    if (lat == null || lng == null) {
      const u = window._lastPos || { lat: 36.4341, lng: 28.2176 };
      lat = u.lat; lng = u.lng;
    }
    const key = 'all:' + lat.toFixed(3) + ',' + lng.toFixed(3);
    if (!opts.force && this._crawlBusy.has(key)) return { busy: true };
    if (!opts.force && Date.now() - this._lastMulti < 15000) return { throttled: true };
    this._crawlBusy.add(key);
    this._lastMulti = Date.now();
    FieldBrain?.pulse?.('think', 'spacenet crawl · sector', { lat, lng });
    const which = opts.only || this.CRAWLERS;
    const results = {};
    try {
      const jobs = [];
      if (which.includes('vendors') || which.includes('places')) {
        jobs.push(this.crawlPlaces(lat, lng, radiusKm || 2).then(r => { results.places = r; }));
      }
      if (which.includes('weather')) jobs.push(this.crawlWeather(lat, lng).then(r => { results.weather = r; }));
      if (which.includes('news')) jobs.push(this.crawlNews(lat, lng).then(r => { results.news = r; }));
      if (which.includes('drivers')) jobs.push(this.crawlDrivers(lat, lng).then(r => { results.drivers = r; }));
      if (which.includes('tasks')) jobs.push(this.crawlTasks(lat, lng).then(r => { results.tasks = r; }));
      await Promise.allSettled(jobs);
      // Pin crawl results as rotating globe info tiles (same UI as SpaceX video tiles)
      try {
        GlobeInfoTiles?.init?.();
        if (results.weather) GlobeInfoTiles.pinCrawlResult('weather', results.weather, lat, lng);
        if (results.drivers) GlobeInfoTiles.pinCrawlResult('drivers', results.drivers, lat, lng);
        if (results.places) GlobeInfoTiles.pinCrawlResult('places', results.places, lat, lng);
        GlobeInfoTiles.pinInfo({
          id: 'crawl-' + lat.toFixed(2) + '-' + lng.toFixed(2),
          lat, lng,
          title: 'SpaceNet · sector',
          description: Object.keys(results).join(' · ') || 'crawl',
          icon: '🕸',
          fly: false,
          urgency: 2,
        });
      } catch (_) {}
      AciCli?.print?.('spacenet · crawl done · ' + Object.keys(results).join(' · '), 'ok');
      CliRibbon?.setNotice?.('SpaceNet crawl · ' + Object.keys(results).length + ' feeds', 'ready');
      return { ok: true, results };
    } finally {
      setTimeout(() => this._crawlBusy.delete(key), 45000);
    }
  },

  wants(text) {
    return /spacenet|crawl(er|ers)?|ingest|scan\s*(city|area|sector)/i.test(String(text || ''));
  },

  async handleCli(line) {
    const low = String(line || '').toLowerCase();
    const u = window._lastPos || { lat: 36.4341, lng: 28.2176 };
    if (/weather/.test(low)) {
      const w = await this.crawlWeather(u.lat, u.lng);
      return w ? ('Weather · ' + w.temp_c + '°C · wind ' + w.wind) : 'weather crawl failed';
    }
    if (/driver/.test(low)) {
      const d = await this.crawlDrivers(u.lat, u.lng);
      return 'Drivers · ' + (d.count || 0);
    }
    if (/vendor|shop|place/.test(low)) {
      await this.crawlPlaces(u.lat, u.lng, 3);
      return 'Vendors/places crawled';
    }
    const r = await this.crawlAll(u.lat, u.lng, 3, { force: true });
    return r.ok ? 'SpaceNet crawlers finished' : 'crawl busy/throttled — retry';
  },
};
window.SpaceNetBrain = SpaceNetBrain;
