/* SpaceNet Commerce — real vendors from Supabase (DB-first, no demo pollution)
 * SPECS P4-M: marketplace alwaysOn 24/7/365 all locations — no platform curfew.
 */
(function (global) {
  'use strict';

  const C = {
    vendors: [],
    lastLoad: 0,
    /** Product law: platform never time-gates delivery marketplace */
    alwaysOn: true,
    hours: '24/7',
    daysPerYear: 365,
    allLocations: true,
  };

  function headers() {
    const cfg = global.SN_CONFIG || {};
    return {
      apikey: cfg.sbKey || global.SB_KEY,
      Authorization: 'Bearer ' + (cfg.sbKey || global.SB_KEY),
    };
  }

  function haversineKm(a, b, c, d) {
    const R = 6371;
    const dLat = ((c - a) * Math.PI) / 180;
    const dLng = ((d - b) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  async function loadNear(lat, lng, radiusKm) {
    const cfg = global.SN_CONFIG || {};
    const urlBase = cfg.sbUrl || global.SB_URL;
    if (!urlBase || !cfg.sbKey) return [];
    lat = Number(lat);
    lng = Number(lng);
    const rKm = Number(radiusKm) > 0 ? Number(radiusKm) : 15;
    const dLat = rKm / 111;
    const dLng = rKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    const q =
      urlBase +
      '/rest/v1/vendors?select=id,osm_id,name,emoji,lat,lng,category,items,tags,is_active,delivery_enabled' +
      '&is_active=eq.true' +
      '&lat=gte.' +
      (lat - dLat) +
      '&lat=lte.' +
      (lat + dLat) +
      '&lng=gte.' +
      (lng - dLng) +
      '&lng=lte.' +
      (lng + dLng) +
      '&limit=80';
    const t0 = Date.now();
    const res = await fetch(q, { headers: headers() });
    if (!res.ok) throw new Error('vendors HTTP ' + res.status);
    let rows = await res.json();
    if (!Array.isArray(rows)) rows = [];
    rows = rows
      .filter((v) => v && v.lat != null && v.lng != null && !String(v.id || '').startsWith('demo-'))
      .map((v) => ({
        ...v,
        km: haversineKm(lat, lng, v.lat, v.lng),
        real: true,
      }))
      .sort((a, b) => a.km - b.km);
    C.vendors = rows;
    C.lastLoad = Date.now();
    global.SNCli?.log?.(
      'shops · ' + rows.length + ' real · ' + (Date.now() - t0) + 'ms · db',
      rows.length ? 'ok' : 'dim'
    );
    return rows;
  }

  function toPlaces() {
    return C.vendors.map((v) => ({
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      kind: v.category || 'shop',
      source: 'supabase',
      id: v.id,
      emoji: v.emoji,
      real: true,
    }));
  }

  /**
   * Load real shops. Default: keep full GLOBAL Earth (no auto city map).
   * opts.openMap: true only when user asked (city / shops / locate path).
   */
  async function populateMap(lat, lng, opts) {
    opts = opts || {};
    const openMap = opts.openMap === true;
    const pos = {
      lat: lat != null ? lat : global._snLastPos?.lat || global.SNTasks?.pos?.lat || 36.4341,
      lng: lng != null ? lng : global._snLastPos?.lng || global.SNTasks?.pos?.lng || 28.2176,
    };
    global._snLastPos = pos;
    try {
      global.SNTasks?.setPos?.(pos.lat, pos.lng);
    } catch (_) {}

    let rows = [];
    try {
      rows = await loadNear(pos.lat, pos.lng, 15);
    } catch (e) {
      global.SNCli?.log?.('shops db fail · ' + (e.message || e), 'err');
      return { ok: false, count: 0, error: String(e.message || e) };
    }

    // Real vendor tiles with menus (usable marketplace)
    const tiles = [];
    rows.slice(0, 40).forEach((v) => {
      try {
        const p =
          global.SNProfiles?.fromVendor?.(v, pos) ||
          global.SNProfiles?.fromCrawlPlace?.(
            {
              id: v.id,
              name: v.name,
              lat: v.lat,
              lng: v.lng,
              kind: v.category || 'shop',
              items: v.items,
              emoji: v.emoji,
              real: true,
            },
            pos
          );
        if (p) tiles.push(p);
      } catch (_) {}
    });

    if (openMap || global.SNMap?.active) {
      try {
        if (!global.SNMap?.active) await global.SNMap?.open?.(pos.lat, pos.lng);
        else {
          const map = await global.SNMap.ensure?.();
          if (global.SNMap?.canAutopilot?.() !== false) {
            global.SNMap?.softSetView?.(pos.lat, pos.lng, 14) || map?.setView?.([pos.lat, pos.lng], 14);
          }
        }
      } catch (_) {}
      global.SNMap?.showProfiles?.();
      global.SNMap?.plotCrawl?.(toPlaces());
      if (tiles.length) {
        global.SNCli?.log?.(
          'Marketplace · ' + tiles.length + ' shops on map · tap target for multi-tile Menu',
          'ok'
        );
      }
    } else if (tiles.length) {
      global.SNCli?.log?.(tiles.length + ' shops ready · open city · tap targets', 'dim');
    }

    // Globe pulses keep full-Earth default useful without stealing the view
    rows.slice(0, 12).forEach((v, i) => {
      try {
        global.SNGlobe?.pulse?.(v.lat, v.lng, i === 0 ? 0x44ffaa : 0x3d9eff, v.name, 18000);
      } catch (_) {}
    });

    return {
      ok: rows.length > 0,
      count: rows.length,
      source: 'db',
      lat: pos.lat,
      lng: pos.lng,
      tiles: tiles.length,
    };
  }

  /**
   * Real sector fill — never invent dummy shops/people.
   * Order: Supabase DB → edge crawler → Overpass → report empty (still usable: place multi-tile).
   */
  async function ensureSector(lat, lng, opts) {
    opts = opts || {};
    const openMap = opts.openMap !== false;
    const pos = {
      lat: lat != null ? Number(lat) : global._snLastPos?.lat || 36.4341,
      lng: lng != null ? Number(lng) : global._snLastPos?.lng || 28.2176,
    };
    global._snLastPos = pos;
    try {
      global.SNTasks?.setPos?.(pos.lat, pos.lng);
    } catch (_) {}

    let source = 'none';
    let count = 0;

    // 1) DB
    try {
      const r = await populateMap(pos.lat, pos.lng, { openMap: false });
      count = r?.count || 0;
      if (count) source = 'db';
    } catch (e) {
      // Quiet technical fail — do not dump engine errors to user CLI
      console.warn('[SNCommerce] shops', e);
    }

    // 1b) Warm edge crawler when thin
    if (count < 5 && global.SNMeshOrders && SNMeshOrders.warmSector) {
      try {
        await SNMeshOrders.warmSector(pos.lat, pos.lng);
        const rWarm = await populateMap(pos.lat, pos.lng, { openMap: false });
        if ((rWarm?.count || 0) > count) {
          count = rWarm.count;
          source = source === 'none' ? 'crawler' : source + '+crawler';
        }
      } catch (_) {}
    }

    // 2) Edge crawler warm then DB again
    if (count < 3 && global.SNSearch?.edgeVendors) {
      try {
        const edge = await SNSearch.edgeVendors(pos.lat, pos.lng, 3000);
        if (edge?.ok || edge?.count) {
          const r2 = await populateMap(pos.lat, pos.lng, { openMap: false });
          if ((r2?.count || 0) > count) {
            count = r2.count;
            source = 'edge+db';
          }
        }
      } catch (_) {}
    }

    // 3) Google Places — always try when key present (photos · hours · phone · ratings)
    if (global.SNPlacesBusiness?.fillSector && SNPlacesBusiness.hasKey?.()) {
      try {
        if (count < 8) {
          global.SNCli?.log?.('Filling shops from Google Places…', 'dim');
          const g = await SNPlacesBusiness.fillSector(pos.lat, pos.lng, {
            radiusM: 3200,
            limit: 28,
            details: 16,
            quiet: false,
          });
          if (g?.count) {
            count = Math.max(count, g.count);
            source = source === 'none' ? 'google-places' : source + '+google';
          }
        }
      } catch (e) {
        console.warn('[SNCommerce] google places', e);
      }
    }

    // 4) Live Overpass POIs → real vendor tiles (always warm for phone/hours tags)
    if (count < 12 && global.SNSearch?.nearby) {
      try {
        global.SNCli?.log?.('Looking up map shops…', 'dim');
        const pois = await SNSearch.nearby(pos.lat, pos.lng, 3200, 'restaurant cafe shop food');
        (pois || []).slice(0, 40).forEach((p) => {
          try {
            global.SNProfiles?.fromCrawlPlace?.(
              {
                name: p.name,
                lat: p.lat,
                lng: p.lng,
                kind: p.kind || 'shop',
                real: true,
                source: 'overpass',
                phone: p.phone || '',
                website: p.website || '',
                hours: p.hours || '',
                cuisine: p.cuisine || '',
              },
              pos
            );
          } catch (_) {}
        });
        const n = (pois && pois.length) || 0;
        if (n) {
          count = Math.max(count, n);
          source = source === 'none' ? 'overpass' : source + '+overpass';
        }
      } catch (e) {
        global.SNCli?.log?.('Map shops · ' + (e.message || e), 'dim');
      }
    }

    // 5) Force orderable menus (photos · prices · availability) on every vendor near you
    try {
      const vendors = (global.SNProfiles?.list?.({ role: 'vendor' }) || []).filter(function (v) {
        if (!v || v.lat == null) return false;
        const dLat = Math.abs(v.lat - pos.lat);
        const dLng = Math.abs(v.lng - pos.lng);
        return dLat < 0.08 && dLng < 0.1;
      });
      vendors.forEach(function (v) {
        try {
          if (global.SNProfiles.ensureOrderableMenu) SNProfiles.ensureOrderableMenu(v);
        } catch (_) {}
      });
      // Enrich top pins via Google when key present
      if (global.SNPlacesBusiness?.enrichProfile && SNPlacesBusiness.hasKey?.()) {
        const top = vendors.slice(0, 10);
        for (let i = 0; i < top.length; i++) {
          try {
            await SNPlacesBusiness.enrichProfile(top[i]);
            if (global.SNProfiles.ensureOrderableMenu) {
              const g = SNProfiles.get(top[i].id);
              if (g) SNProfiles.ensureOrderableMenu(g);
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 6) Map crawl as last live path
    if (count < 1 && global.SNSearch?.crawl) {
      try {
        const crawled = await SNSearch.crawl('restaurants cafes shops', {
          pos: pos,
          openMap: false,
          all: false,
          mode: 'map',
          fly: false,
          quiet: true,
          silent: true,
        });
        const stuff = (crawled?.nearby || []).concat(crawled?.places || []);
        stuff.slice(0, 30).forEach((p) => {
          if (p.lat == null) return;
          try {
            global.SNProfiles?.fromCrawlPlace?.(
              {
                name: p.name,
                lat: p.lat,
                lng: p.lng,
                kind: p.kind || p.type || 'shop',
                real: true,
                source: p.source || 'crawl',
                phone: p.phone || '',
                website: p.website || '',
                hours: p.hours || '',
              },
              pos
            );
          } catch (_) {}
        });
        count = stuff.filter((p) => p.lat != null).length;
        if (count) source = 'crawl';
      } catch (_) {}
    }

    // Self as courier capability (not fake NPCs)
    try {
      const me = global.SNProfiles?.me?.();
      if (me && me.lat == null) {
        me.lat = pos.lat;
        me.lng = pos.lng;
        global.SNProfiles.upsert(me);
      }
    } catch (_) {}

    if (openMap) {
      try {
        if (!global.SNMap?.active) await global.SNMap?.open?.(pos.lat, pos.lng);
        else {
          const map = await global.SNMap.ensure?.();
          if (global.SNMap?.canAutopilot?.() !== false) {
            global.SNMap?.softSetView?.(pos.lat, pos.lng, 14) || map?.setView?.([pos.lat, pos.lng], 14);
          }
        }
        global.SNMap?.showProfiles?.();
        global.SNMap?.showTasks?.();
      } catch (_) {}
    }

    const vendors = (global.SNProfiles?.list?.({ role: 'vendor' }) || []).length;
    global.SNCli?.log?.(
      vendors
        ? 'Sector live · ' + vendors + ' shop tiles · ' + source + ' · tap target for menu'
        : 'Sector empty of POIs · long-press map to create multi-tile · try fly another city',
      vendors ? 'ok' : 'dim'
    );
    return { ok: vendors > 0, count: vendors, source: source, lat: pos.lat, lng: pos.lng };
  }

  global.SNCommerce = {
    loadNear,
    populateMap,
    ensureSector,
    toPlaces,
    haversineKm,
    alwaysOn: true,
    hours: '24/7',
    daysPerYear: 365,
    allLocations: true,
    get vendors() {
      return C.vendors;
    },
    get lastLoad() {
      return C.lastLoad;
    },
  };
})(window);
