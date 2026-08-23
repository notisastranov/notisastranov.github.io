/**
 * SNCosmos — SpaceNet multi-body navigation (dedummyfy every globe)
 * Go anywhere: switch planetary globe, land at lat/lng, crawl what is there.
 */
(function (global) {
  'use strict';

  var T3 = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/';

  /** Catalog of goable bodies — each has a real globe (texture and/or color) */
  var BODIES = {
    earth: {
      id: 'earth',
      name: 'Earth',
      color: 0x1a4d7a,
      map: T3 + 'earth_atmos_2048.jpg',
      specular: T3 + 'earth_specular_2048.jpg',
      clouds: T3 + 'earth_clouds_1024.png',
      rKm: 6371,
      earthMap: true,
      aliases: ['earth', 'terra', 'world', 'home'],
    },
    moon: {
      id: 'moon',
      name: 'Moon',
      color: 0x888888,
      map: T3 + 'moon_1024.jpg',
      rKm: 1737,
      aliases: ['moon', 'luna', 'the moon'],
      defaultLat: 0.67,
      defaultLng: 23.47,
      defaultLabel: 'Sea of Tranquility',
    },
    mars: {
      id: 'mars',
      name: 'Mars',
      color: 0xa34a2a,
      // three.js r128 may not ship mars; solid+fallback map attempts
      map: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/textures/planets/mars_1k_color.jpg',
      rKm: 3389,
      aliases: ['mars', 'red planet'],
      defaultLat: 40.75,
      defaultLng: -9.46,
      defaultLabel: 'Cydonia',
    },
    mercury: {
      id: 'mercury',
      name: 'Mercury',
      color: 0x9a9a9a,
      rKm: 2440,
      aliases: ['mercury'],
      defaultLat: 0,
      defaultLng: 0,
    },
    venus: {
      id: 'venus',
      name: 'Venus',
      color: 0xc4a35a,
      rKm: 6052,
      aliases: ['venus'],
      defaultLat: 0,
      defaultLng: 0,
    },
    jupiter: {
      id: 'jupiter',
      name: 'Jupiter',
      color: 0xc9a066,
      rKm: 69911,
      aliases: ['jupiter'],
      defaultLat: -22,
      defaultLng: -100,
      defaultLabel: 'Great Red Spot',
    },
    saturn: {
      id: 'saturn',
      name: 'Saturn',
      color: 0xd4c4a0,
      rKm: 58232,
      aliases: ['saturn'],
      defaultLat: 0,
      defaultLng: 0,
    },
    uranus: {
      id: 'uranus',
      name: 'Uranus',
      color: 0x7ec8e3,
      rKm: 25362,
      aliases: ['uranus'],
    },
    neptune: {
      id: 'neptune',
      name: 'Neptune',
      color: 0x2b5cff,
      rKm: 24622,
      aliases: ['neptune'],
    },
    pluto: {
      id: 'pluto',
      name: 'Pluto',
      color: 0xb0a090,
      rKm: 1188,
      aliases: ['pluto'],
      defaultLat: 0,
      defaultLng: 0,
      defaultLabel: 'Tombaugh Regio',
    },
    europa: {
      id: 'europa',
      name: 'Europa',
      color: 0xc8c0a8,
      rKm: 1561,
      aliases: ['europa'],
      parent: 'jupiter',
    },
    titan: {
      id: 'titan',
      name: 'Titan',
      color: 0xc48a3a,
      rKm: 2575,
      aliases: ['titan'],
      parent: 'saturn',
    },
    cydonia: {
      id: 'mars',
      name: 'Mars · Cydonia',
      aliasOf: 'mars',
      defaultLat: 40.75,
      defaultLng: -9.46,
      defaultLabel: 'Cydonia',
    },
  };

  var state = { bodyId: 'earth' };

  function resolve(name) {
    var q = String(name || '')
      .toLowerCase()
      .trim()
      .replace(/^the\s+/, '')
      .replace(/\s+/g, ' ');
    if (!q) return BODIES.earth;
    if (BODIES[q] && !BODIES[q].aliasOf) return BODIES[q];
    if (BODIES[q] && BODIES[q].aliasOf) {
      var base = BODIES[BODIES[q].aliasOf];
      return Object.assign({}, base, {
        defaultLat: BODIES[q].defaultLat != null ? BODIES[q].defaultLat : base.defaultLat,
        defaultLng: BODIES[q].defaultLng != null ? BODIES[q].defaultLng : base.defaultLng,
        defaultLabel: BODIES[q].defaultLabel || base.defaultLabel,
        name: BODIES[q].name || base.name,
      });
    }
    var keys = Object.keys(BODIES);
    for (var i = 0; i < keys.length; i++) {
      var b = BODIES[keys[i]];
      if (b.aliasOf) continue;
      var aliases = b.aliases || [b.id, b.name.toLowerCase()];
      for (var j = 0; j < aliases.length; j++) {
        if (q === aliases[j] || q.indexOf(aliases[j]) === 0) return b;
      }
    }
    return null;
  }

  function listBodies() {
    return Object.keys(BODIES)
      .filter(function (k) {
        return !BODIES[k].aliasOf;
      })
      .map(function (k) {
        return BODIES[k];
      });
  }

  /**
   * Crawl what exists at body+lat+lng (wiki, geocode, spatial places, shops on Earth).
   */
  async function scan(bodyId, lat, lng, opts) {
    opts = opts || {};
    var body = resolve(bodyId) || BODIES.earth;
    var id = body.id || 'earth';
    var results = {
      body: id,
      bodyName: body.name,
      lat: lat,
      lng: lng,
      places: [],
      wiki: null,
      nearby: [],
      spatial: [],
      shops: 0,
      lines: [],
    };

    // Local spatial objects on this body
    try {
      var all = (global.SNSpatial && SNSpatial.list && SNSpatial.list()) || [];
      results.spatial = all.filter(function (p) {
        if ((p.body || 'earth') !== id) return false;
        if (lat == null || p.lat == null) return true;
        return Math.abs(p.lat - lat) < 8 && Math.abs(p.lng - lng) < 8;
      });
    } catch (e) {}

    // Earth: reverse geocode + almighty crawl
    if (id === 'earth' && lat != null && lng != null && global.SNSearch) {
      try {
        if (SNSearch.reverse) {
          var name = await SNSearch.reverse(lat, lng);
          results.lines.push('Place: ' + name);
          results.places.push({ name: name, lat: lat, lng: lng, source: 'nominatim' });
        }
      } catch (e) {}
      try {
        if (SNSearch.crawl) {
          var q =
            (results.places[0] && results.places[0].name
              ? String(results.places[0].name).split(',')[0]
              : '') ||
            lat.toFixed(2) + ' ' + lng.toFixed(2);
          var crawled = await SNSearch.crawl(q, {
            openMap: opts.openMap === true,
            pos: { lat: lat, lng: lng },
            all: false,
            // Default false: scan after land must not re-fly to wiki/geocode
            fly: opts.fly === true,
          });
          if (crawled) {
            results.wiki = crawled.wiki;
            results.nearby = crawled.nearby || [];
            results.places = (results.places || []).concat(crawled.places || []);
            if (crawled.wiki && crawled.wiki.title)
              results.lines.push('Wiki: ' + crawled.wiki.title);
            if (crawled.nearby && crawled.nearby.length)
              results.lines.push(crawled.nearby.length + ' POIs nearby');
          }
        }
      } catch (e) {}
      try {
        if (global.SNCommerce && SNCommerce.loadNear) {
          var rows = await SNCommerce.loadNear(lat, lng, 12);
          results.shops = (rows && rows.length) || 0;
          if (results.shops) results.lines.push(results.shops + ' real shops (DB)');
        }
      } catch (e) {}
    } else {
      // Off-Earth: Wikipedia + spatial
      var topic =
        (body.defaultLabel ? body.defaultLabel + ' ' : '') +
        (body.name || id) +
        (lat != null ? ' ' + lat.toFixed(1) + ' ' + lng.toFixed(1) : '');
      try {
        if (global.SNSearch && SNSearch.wiki) {
          var w = await SNSearch.wiki(topic);
          if (w) {
            results.wiki = w;
            results.lines.push('Wiki: ' + (w.title || topic));
            if (w.text) results.lines.push(String(w.text).slice(0, 160));
          }
        } else if (global.SNSearch && SNSearch.crawl) {
          // knowledge only — never full almighty (no npm/books spam on planet land)
          var c2 = await SNSearch.crawl(topic, {
            openMap: false,
            all: false,
            mode: 'knowledge',
            fly: false,
          });
          if (c2 && c2.wiki) {
            results.wiki = c2.wiki;
            results.lines.push('Wiki: ' + c2.wiki.title);
          }
        }
      } catch (e) {}
      // Fallback fetch wiki summary
      if (!results.wiki) {
        try {
          var page = encodeURIComponent((body.name || id).replace(/\s+/g, '_'));
          var wr = await fetch(
            'https://en.wikipedia.org/api/rest_v1/page/summary/' + page
          );
          if (wr.ok) {
            var j = await wr.json();
            results.wiki = {
              title: j.title,
              text: j.extract,
              lat: j.coordinates && j.coordinates.lat,
              lng: j.coordinates && j.coordinates.lon,
            };
            results.lines.push('Wiki: ' + j.title);
            if (j.extract) results.lines.push(String(j.extract).slice(0, 180));
          }
        } catch (e) {}
      }
    }

    results.spatial.forEach(function (p) {
      results.lines.push(
        (p.emoji || '📌') + ' ' + (p.title || p.name) + ' @ ' + (p.body || id)
      );
    });

    if (!results.lines.length) {
      results.lines.push(
        'Arrived ' +
          body.name +
          (lat != null ? ' · ' + lat.toFixed(3) + ', ' + lng.toFixed(3) : '') +
          '…'
      );
    }

    // Report to CLI
    try {
      if (global.SNCli && SNCli.log) {
        SNCli.log(
          '◎ ' +
            body.name +
            (lat != null ? ' · ' + lat.toFixed(3) + '°, ' + lng.toFixed(3) + '°' : ''),
          'ok'
        );
        results.lines.slice(0, 8).forEach(function (ln) {
          SNCli.log(ln, 'dim');
        });
      }
      if (global.SNCli && SNCli.preview)
        SNCli.preview(body.name + (lat != null ? ' · ' + lat.toFixed(2) : ''));
    } catch (e) {}

    return results;
  }

  /**
   * Go to a body (and optional lat/lng). Real globe switch + land + crawl.
   */
  async function go(target, lat, lng, opts) {
    opts = opts || {};
    var body = typeof target === 'object' ? target : resolve(target);
    if (!body) {
      if (global.SNCli && SNCli.log)
        SNCli.log('Unknown destination · try: earth mars moon jupiter europa', 'err');
      return null;
    }
    var id = body.id;
    var la = lat != null ? Number(lat) : body.defaultLat != null ? body.defaultLat : 0;
    var lo = lng != null ? Number(lng) : body.defaultLng != null ? body.defaultLng : 0;
    var label = opts.label || body.defaultLabel || body.name;

    // Switch planetary globe
    if (global.SNGlobe && SNGlobe.setBody) {
      SNGlobe.setBody(id, body);
    }
    state.bodyId = id;

    // Close Earth city map when leaving Earth
    if (id !== 'earth') {
      try {
        if (global.SNMap && SNMap.close) SNMap.close();
      } catch (e) {}
    }

    // Land
    var tier = opts.tier || (id === 'earth' ? 'national' : 'national');
    if (global.SNGlobe && SNGlobe.goToPlace) {
      SNGlobe.goToPlace(la, lo, {
        tier: tier,
        openMap: id === 'earth' && opts.openMap === true,
        label: label,
        color: body.color || 0x3d9eff,
        body: id,
        skipScan: true,
      });
    } else if (global.SNGlobe && SNGlobe.flyNear) {
      SNGlobe.flyNear(la, lo, tier);
    }

    // Crawl what is there
    var scanResult = await scan(id, la, lo, {
      openMap: id === 'earth' && opts.openMap === true,
      fly: false,
    });
    return { body: body, lat: la, lng: lo, scan: scanResult };
  }

  /** Parse "go to mars", "go to jupiter", "go europa" */
  function parseGo(line) {
    var low = String(line || '')
      .toLowerCase()
      .trim();
    var m = low.match(
      /^(?:go\s+to|goto|fly\s+to|travel\s+to|warp\s+to)\s+(.+)$/
    );
    if (m) return m[1].trim();
    m = low.match(/^go\s+([a-z][a-z\s]+)$/);
    if (m) return m[1].trim();
    return null;
  }

  global.SNCosmos = {
    BODIES: BODIES,
    resolve: resolve,
    list: listBodies,
    go: go,
    scan: scan,
    parseGo: parseGo,
    get bodyId() {
      return state.bodyId;
    },
    get body() {
      return resolve(state.bodyId) || BODIES.earth;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
