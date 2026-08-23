/* SNRouting — Astranov street routing
 * Chain: self-hosted osrmBase → Supabase osrm-route gateway → public OSRM
 * Used by SNField delivery routes + CLI "route test"
 */
(function (global) {
  'use strict';

  var PUBLIC = 'https://router.project-osrm.org';
  var memCache = Object.create(null);
  var CACHE_TTL = 4 * 60 * 1000;
  var lastEngine = 'none';

  function cfg() {
    var c = (global.SN_CONFIG && SN_CONFIG.routing) || {};
    return {
      osrmBase: String(c.osrmBase || c.osrmUrl || '').replace(/\/$/, ''),
      useGateway: c.useGateway !== false,
      publicFallback: String(c.publicFallback || PUBLIC).replace(/\/$/, ''),
      profile: c.profile || 'driving',
      timeoutMs: Number(c.timeoutMs) || 10000,
    };
  }

  function sb() {
    var c = global.SN_CONFIG || {};
    return {
      url: (c.sbUrl || global.SB_URL || '').replace(/\/$/, ''),
      key: c.sbKey || global.SB_KEY || '',
    };
  }

  function pathFromWaypoints(waypoints) {
    var pts = (waypoints || []).filter(function (p) {
      return p && isFinite(Number(p.lat)) && isFinite(Number(p.lng));
    });
    if (pts.length < 2) throw new Error('need 2 waypoints');
    if (pts.length > 25) pts = pts.slice(0, 25);
    return pts
      .map(function (p) {
        return Number(p.lng) + ',' + Number(p.lat);
      })
      .join(';');
  }

  function cacheKey(path) {
    return path;
  }

  function cacheGet(key) {
    var hit = memCache[key];
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL) {
      delete memCache[key];
      return null;
    }
    return hit.val;
  }

  function cacheSet(key, val) {
    memCache[key] = { at: Date.now(), val: val };
    try {
      var bag = JSON.parse(localStorage.getItem('sn:osrm-cache-v1') || '{}');
      bag[key] = { at: Date.now(), km: val.km, durationS: val.durationS, n: (val.points || []).length };
      // only store meta in LS; full geometry stays memory
      var keys = Object.keys(bag);
      if (keys.length > 40) {
        keys
          .sort(function (a, b) {
            return (bag[a].at || 0) - (bag[b].at || 0);
          })
          .slice(0, keys.length - 40)
          .forEach(function (k) {
            delete bag[k];
          });
      }
      localStorage.setItem('sn:osrm-cache-v1', JSON.stringify(bag));
    } catch (_) {}
  }

  function fetchTimeout(url, opts, ms) {
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (_) {}
    }, ms || 10000);
    var headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    return fetch(url, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body,
      signal: ctrl ? ctrl.signal : undefined,
      cache: 'no-store',
    }).finally(function () {
      clearTimeout(to);
    });
  }

  function normalizeOsrmJson(j, engine, root) {
    var rt = j && j.routes && j.routes[0];
    var coords = rt && rt.geometry && rt.geometry.coordinates;
    if (!coords || !coords.length) throw new Error('no geom');
    var points = coords.map(function (c) {
      return { lat: c[1], lng: c[0] };
    });
    var km = rt.distance != null ? Number(rt.distance) / 1000 : 0;
    var durationS = rt.duration != null ? Number(rt.duration) : (km / 28) * 3600;
    return {
      points: points,
      km: km,
      durationS: durationS,
      distanceM: Number(rt.distance) || km * 1000,
      speedKmh: durationS > 0 ? (km / durationS) * 3600 : 28,
      engine: engine,
      engineRoot: root,
      raw: j,
    };
  }

  function normalizeGateway(j) {
    if (!j || !j.ok || !j.points || !j.points.length) throw new Error((j && j.error) || 'gateway fail');
    return {
      points: j.points,
      km: Number(j.km) || 0,
      durationS: Number(j.durationS) || 0,
      distanceM: Number(j.distanceM) || (Number(j.km) || 0) * 1000,
      speedKmh:
        j.durationS > 0 ? ((Number(j.km) || 0) / Number(j.durationS)) * 3600 : 28,
      engine: j.engine || 'osrm-gateway',
      engineRoot: j.engineRoot || '',
      cached: !!j.cached,
      fallback: !!j.fallback,
    };
  }

  async function trySelfHosted(path, c) {
    if (!c.osrmBase) return null;
    var url =
      c.osrmBase +
      '/route/v1/' +
      c.profile +
      '/' +
      path +
      '?overview=full&geometries=geojson&steps=false';
    var res = await fetchTimeout(url, {}, c.timeoutMs);
    if (!res.ok) throw new Error('self-osrm ' + res.status);
    var j = await res.json();
    return normalizeOsrmJson(j, 'osrm-selfhosted', c.osrmBase);
  }

  async function tryGateway(path, c) {
    if (!c.useGateway) return null;
    var s = sb();
    if (!s.url) return null;
    var url = s.url + '/functions/v1/osrm-route?path=' + encodeURIComponent(path);
    var res = await fetchTimeout(
      url,
      {
        headers: {
          apikey: s.key,
          Authorization: 'Bearer ' + s.key,
        },
      },
      c.timeoutMs + 2000
    );
    if (!res.ok) throw new Error('gateway ' + res.status);
    var j = await res.json();
    return normalizeGateway(j);
  }

  async function tryPublic(path, c) {
    var root = c.publicFallback || PUBLIC;
    var url =
      root +
      '/route/v1/' +
      c.profile +
      '/' +
      path +
      '?overview=full&geometries=geojson&steps=false';
    var res = await fetchTimeout(url, {}, c.timeoutMs);
    if (!res.ok) throw new Error('public-osrm ' + res.status);
    var j = await res.json();
    return normalizeOsrmJson(j, 'osrm-public', root);
  }

  /**
   * Multi-stop driving route.
   * @returns {{ points, km, durationS, speedKmh, engine, engineRoot }}
   */
  async function route(waypoints, opts) {
    opts = opts || {};
    var c = cfg();
    if (opts.timeoutMs) c.timeoutMs = opts.timeoutMs;
    var path = pathFromWaypoints(waypoints);
    var key = cacheKey(path);
    if (!opts.noCache) {
      var hit = cacheGet(key);
      if (hit) {
        lastEngine = hit.engine + '+cache';
        return Object.assign({}, hit, { cached: true });
      }
    }

    var errors = [];
    var order = [];
    // Prefer explicit self-host, then gateway (which may itself be self-host via secret), then public
    if (c.osrmBase) order.push(['self', trySelfHosted]);
    if (c.useGateway) order.push(['gateway', tryGateway]);
    order.push(['public', tryPublic]);

    for (var i = 0; i < order.length; i++) {
      try {
        var r = await order[i][1](path, c);
        if (r && r.points && r.points.length >= 2) {
          lastEngine = r.engine || order[i][0];
          if (!opts.noCache) cacheSet(key, r);
          return r;
        }
      } catch (e) {
        errors.push(order[i][0] + ': ' + (e && e.message ? e.message : e));
      }
    }
    lastEngine = 'fail';
    throw new Error('routing failed · ' + errors.join(' · '));
  }

  async function routeAB(aLat, aLng, bLat, bLng, opts) {
    return route(
      [
        { lat: aLat, lng: aLng },
        { lat: bLat, lng: bLng },
      ],
      opts
    );
  }

  async function selfTest() {
    // Rhodes Archangelos sector → nearby point
    var a = { lat: 36.4341, lng: 28.2176 };
    var b = { lat: 36.44, lng: 28.22 };
    var t0 = Date.now();
    try {
      var r = await route([a, b], { noCache: true });
      return {
        ok: true,
        engine: r.engine,
        engineRoot: r.engineRoot,
        km: Math.round(r.km * 1000) / 1000,
        durationS: Math.round(r.durationS),
        points: (r.points || []).length,
        ms: Date.now() - t0,
        cfg: cfg(),
      };
    } catch (e) {
      return {
        ok: false,
        error: String(e && e.message ? e.message : e),
        ms: Date.now() - t0,
        cfg: cfg(),
      };
    }
  }

  function status() {
    return {
      lastEngine: lastEngine,
      cfg: cfg(),
      cacheEntries: Object.keys(memCache).length,
    };
  }

  global.SNRouting = {
    route: route,
    routeAB: routeAB,
    selfTest: selfTest,
    status: status,
    pathFromWaypoints: pathFromWaypoints,
    PUBLIC: PUBLIC,
  };
})(typeof window !== 'undefined' ? window : globalThis);
