/* SNVendorCrawl — AI/CLI map population for delivery marketplace
 * Sources: Overpass OSM · Google Places (if key) · edge vendor-crawler · Nominatim · DB
 * Writes SNProfiles vendor tiles: phone · hours · website · photos · menu · prices · rating
 * No dummy NPCs. UI chrome untouched — only map tiles + CLI log.
 */
(function (g) {
  'use strict';

  var lastRun = 0;
  var lastAt = null;

  function log(msg, cls) {
    try {
      if (g.SNCli && SNCli.log) SNCli.log(msg, cls || 'dim');
    } catch (_) {}
  }

  function haversineKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 999;
    var R = 6371;
    var dLat = ((b.lat - a.lat) * Math.PI) / 180;
    var dLng = ((b.lng - a.lng) * Math.PI) / 180;
    var la1 = (a.lat * Math.PI) / 180;
    var la2 = (b.lat * Math.PI) / 180;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function posOf(opts) {
    opts = opts || {};
    if (opts.lat != null && opts.lng != null) return { lat: Number(opts.lat), lng: Number(opts.lng) };
    return (
      g._snLastPos ||
      g._snPhysPos ||
      (g.SNTasks && SNTasks.pos) ||
      null
    );
  }

  function osmImage(tags) {
    tags = tags || {};
    var img = tags.image || tags['image:0'] || tags.wikimedia_commons || '';
    if (!img) return '';
    if (/^https?:\/\//i.test(img)) return img;
    // File:Name.jpg → commons thumbnail
    var m = String(img).match(/File:(.+)/i) || String(img).match(/^(.+\.(jpe?g|png|webp|gif))$/i);
    if (m) {
      var name = encodeURIComponent((m[1] || m[0]).replace(/^File:/i, '').replace(/ /g, '_'));
      return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + name + '?width=400';
    }
    return '';
  }

  function normalizePoi(p, source) {
    if (!p || p.lat == null || p.lng == null) return null;
    var name = p.name || p.shopName || p.display_name || p.brand || '';
    if (!name || /^place$/i.test(name)) return null;
    var photos = [];
    if (Array.isArray(p.photos)) photos = p.photos.slice();
    if (p.photo) photos.push(p.photo);
    if (p.image) photos.push(p.image);
    if (p.cover) photos.push(p.cover);
    photos = photos.filter(function (u) {
      return u && /^https?:\/\//i.test(String(u));
    });
    var menu = p.menu || p.items || [];
    return {
      name: String(name).slice(0, 80),
      lat: Number(p.lat),
      lng: Number(p.lng),
      kind: p.kind || p.category || p.type || p.amenity || 'restaurant',
      cuisine: p.cuisine || '',
      phone: p.phone || p.tel || '',
      website: p.website || p.url || '',
      hours: p.hours || p.opening_hours || '',
      opening_hours: p.hours || p.opening_hours || '',
      address: p.address || p.display_name || '',
      rating: p.rating != null ? Number(p.rating) : p.stars != null ? Number(p.stars) : null,
      photos: photos,
      cover: photos[0] || p.cover || '',
      menu: menu,
      googlePlaceId: p.googlePlaceId || p.place_id || '',
      googleMapsUrl: p.googleMapsUrl || p.url || '',
      email: p.email || '',
      social: p.social || null,
      real: true,
      source: source || p.source || 'crawl',
      openNow: p.openNow != null ? p.openNow : true,
      delivery_enabled: p.delivery_enabled !== false,
    };
  }

  function upsertPoi(raw, userPos, source) {
    var p = normalizePoi(raw, source);
    if (!p) return null;
    if (userPos && haversineKm(userPos, p) > 12) return null;
    try {
      if (g.SNProfiles && SNProfiles.fromCrawlPlace) {
        return SNProfiles.fromCrawlPlace(p, userPos || p);
      }
    } catch (_) {}
    return null;
  }

  /** Rich Overpass — contact · hours · cuisine · image */
  async function overpassFood(lat, lng, radiusM, query) {
    radiusM = radiusM || 3500;
    var q = String(query || 'restaurant food pizza cafe').toLowerCase();
    var filters = [];
    if (/pizza/.test(q)) {
      filters.push('node["amenity"="restaurant"]["cuisine"~"pizza",i]');
      filters.push('way["amenity"="restaurant"]["cuisine"~"pizza",i]');
      filters.push('node["amenity"="fast_food"]["cuisine"~"pizza",i]');
    }
    if (/cafe|coffee/.test(q)) {
      filters.push('node["amenity"="cafe"]');
      filters.push('way["amenity"="cafe"]');
    }
    if (/burger|fast/.test(q)) {
      filters.push('node["amenity"="fast_food"]');
      filters.push('way["amenity"="fast_food"]');
    }
    // always general food
    filters.push('node["amenity"="restaurant"]');
    filters.push('way["amenity"="restaurant"]');
    filters.push('node["amenity"="fast_food"]');
    filters.push('node["amenity"="cafe"]');
    filters.push('node["shop"="bakery"]');
    filters.push('node["amenity"="bar"]');
    filters.push('node["amenity"="pub"]');
    // unique
    var seenF = {};
    filters = filters.filter(function (f) {
      if (seenF[f]) return false;
      seenF[f] = 1;
      return true;
    });
    var around = '(around:' + radiusM + ',' + lat + ',' + lng + ')';
    var body =
      '[out:json][timeout:22];(' +
      filters
        .map(function (f) {
          return f + around + ';';
        })
        .join('') +
      ');out center tags 50;';
    var endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ];
    var data = null;
    for (var e = 0; e < endpoints.length; e++) {
      try {
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var to = setTimeout(function () {
          try {
            if (ctrl) ctrl.abort();
          } catch (_) {}
        }, 18000);
        var res = await fetch(endpoints[e], {
          method: 'POST',
          body: body,
          headers: { 'Content-Type': 'text/plain', Accept: 'application/json' },
          signal: ctrl ? ctrl.signal : undefined,
        });
        clearTimeout(to);
        if (!res.ok) continue;
        data = await res.json();
        if (data && data.elements) break;
      } catch (_) {}
    }
    if (!data || !data.elements) return [];
    return data.elements
      .map(function (el) {
        var tags = el.tags || {};
        var name = tags.name || tags.brand || tags['name:en'] || tags['name:el'] || '';
        if (!name) return null;
        var lat2 = el.lat || (el.center && el.center.lat);
        var lng2 = el.lon || (el.center && el.center.lon);
        if (lat2 == null) return null;
        var img = osmImage(tags);
        var photos = img ? [img] : [];
        return {
          name: name,
          lat: lat2,
          lng: lng2,
          kind: tags.amenity || tags.shop || 'restaurant',
          cuisine: tags.cuisine || '',
          phone: tags.phone || tags['contact:phone'] || tags['contact:mobile'] || '',
          website: tags.website || tags['contact:website'] || tags.url || '',
          hours: tags.opening_hours || '',
          email: tags.email || tags['contact:email'] || '',
          address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']]
            .filter(Boolean)
            .join(' '),
          image: img,
          photos: photos,
          social: {
            facebook: tags['contact:facebook'] || '',
            instagram: tags['contact:instagram'] || '',
          },
          source: 'overpass',
          real: true,
        };
      })
      .filter(Boolean);
  }

  /** Nominatim local search */
  async function nominatimNear(lat, lng, query) {
    try {
      var url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=20&addressdetails=1&extratags=1&namedetails=1&q=' +
        encodeURIComponent(String(query || 'restaurant') + ' near ' + lat + ',' + lng);
      var res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AstranovSpaceNet/2.0 (https://astranov.eu)',
        },
      });
      if (!res.ok) return [];
      var arr = await res.json();
      return (arr || [])
        .map(function (r) {
          var ex = r.extratags || {};
          return {
            name: r.namedetails && r.namedetails.name ? r.namedetails.name : r.display_name.split(',')[0],
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            kind: (r.type || r.class || 'restaurant').replace(/_/g, ' '),
            phone: ex.phone || ex['contact:phone'] || '',
            website: ex.website || ex['contact:website'] || '',
            hours: ex.opening_hours || '',
            address: r.display_name || '',
            cuisine: ex.cuisine || '',
            source: 'nominatim',
            real: true,
          };
        })
        .filter(function (p) {
          return p.lat && haversineKm({ lat: lat, lng: lng }, p) <= 8;
        });
    } catch (_) {
      return [];
    }
  }

  async function ensureMap(lat, lng) {
    try {
      if (g.SNMap && SNMap.open) {
        await SNMap.open(lat, lng);
        if (SNMap.ensure) await SNMap.ensure();
        if (SNMap.markYou) SNMap.markYou(lat, lng, 'YOU');
      }
    } catch (_) {}
  }

  function forceMenusNear(pos, maxKm) {
    maxKm = maxKm || 8;
    var n = 0;
    try {
      var list = (g.SNProfiles && SNProfiles.list({ role: 'vendor' })) || [];
      list.forEach(function (v) {
        if (!v || v.lat == null) return;
        if (haversineKm(pos, v) > maxKm) return;
        try {
          if (g.SNProfiles.ensureOrderableMenu) {
            SNProfiles.ensureOrderableMenu(v);
            n++;
          }
        } catch (_) {}
      });
    } catch (_) {}
    return n;
  }

  function countVendorsNear(pos, maxKm) {
    maxKm = maxKm || 8;
    try {
      return ((g.SNProfiles && SNProfiles.list({ role: 'vendor' })) || []).filter(function (v) {
        return v && v.lat != null && haversineKm(pos, v) <= maxKm;
      }).length;
    } catch (_) {
      return 0;
    }
  }

  function sampleVendors(pos, maxKm, limit) {
    maxKm = maxKm || 6;
    limit = limit || 8;
    try {
      return ((g.SNProfiles && SNProfiles.list({ role: 'vendor' })) || [])
        .filter(function (v) {
          return v && v.lat != null && haversineKm(pos, v) <= maxKm;
        })
        .map(function (v) {
          return {
            id: v.id,
            name: v.shopName || v.name,
            km: Math.round(haversineKm(pos, v) * 10) / 10,
            phone: v.phone || '',
            hours: v.hours || '',
            rating: v.rating,
            menuN: (v.menu && v.menu.length) || 0,
            photos: (v.photos && v.photos.length) || 0,
            source: v.source,
          };
        })
        .sort(function (a, b) {
          return a.km - b.km;
        })
        .slice(0, limit);
    } catch (_) {
      return [];
    }
  }

  /**
   * Full populate — AI + CLI entry.
   * @param {object} opts { lat, lng, query, radiusM, openMap, enrichGoogle, quiet }
   */
  async function populate(opts) {
    opts = opts || {};
    var now = Date.now();
    if (!opts.force && now - lastRun < 8000) {
      var p0 = posOf(opts);
      return {
        ok: true,
        debounced: true,
        count: p0 ? countVendorsNear(p0) : 0,
        samples: p0 ? sampleVendors(p0) : [],
      };
    }
    lastRun = now;

    var pos = posOf(opts);
    if (!pos || pos.lat == null) {
      try {
        if (g.SNTaskRunner && SNTaskRunner.locate) {
          var loc = await SNTaskRunner.locate();
          if (loc && loc.pos) pos = loc.pos;
        }
      } catch (_) {}
    }
    if (!pos || pos.lat == null) {
      return { ok: false, error: 'need location · locate first', count: 0 };
    }
    g._snLastPos = { lat: pos.lat, lng: pos.lng, reason: 'vendor-crawl' };
    var query = opts.query || opts.q || 'restaurant pizza cafe food';
    var radius = opts.radiusM || 3500;
    var sources = [];
    var upserted = 0;

    if (opts.openMap !== false) await ensureMap(pos.lat, pos.lng);
    if (!opts.quiet) log('Crawling shops · map + internet · ' + query.slice(0, 40) + '…', 'dim');

    // 1) Commerce / DB + existing pipeline (edge, google if key, overpass)
    try {
      if (g.SNCommerce && SNCommerce.ensureSector) {
        var sec = await SNCommerce.ensureSector(pos.lat, pos.lng, {
          openMap: false,
        });
        if (sec && (sec.count || sec.ok)) sources.push('commerce:' + (sec.source || 'ok'));
      }
    } catch (e1) {
      sources.push('commerce:err');
    }

    // 2) Edge vendor-crawler warm
    try {
      if (g.SNSearch && SNSearch.edgeVendors) {
        var edge = await SNSearch.edgeVendors(pos.lat, pos.lng, radius);
        if (edge && (edge.ok || edge.count)) sources.push('edge:' + (edge.count || 0));
      }
    } catch (_) {}

    // 3) Rich Overpass (always)
    try {
      var pois = await overpassFood(pos.lat, pos.lng, radius, query);
      (pois || []).forEach(function (p) {
        if (upsertPoi(p, pos, 'overpass')) upserted++;
      });
      if (pois && pois.length) sources.push('overpass:' + pois.length);
    } catch (_) {
      sources.push('overpass:err');
    }

    // 4) Nominatim text near you
    try {
      var foodWord = /pizza|sushi|burger|cafe|coffee|souvlaki|gyro/i.test(query)
        ? query.match(/pizza|sushi|burger|cafe|coffee|souvlaki|gyro/i)[0]
        : 'restaurant';
      var nom = await nominatimNear(pos.lat, pos.lng, foodWord);
      (nom || []).forEach(function (p) {
        if (upsertPoi(p, pos, 'nominatim')) upserted++;
      });
      if (nom && nom.length) sources.push('nominatim:' + nom.length);
    } catch (_) {}

    // 5) Google Places full cards when key configured
    try {
      if (g.SNPlacesBusiness && SNPlacesBusiness.hasKey && SNPlacesBusiness.hasKey()) {
        if (!opts.quiet) log('Google Places · photos · hours · phone…', 'dim');
        var gfill = await SNPlacesBusiness.fillSector(pos.lat, pos.lng, {
          radiusM: radius,
          limit: opts.limit || 28,
          details: opts.details || 18,
          quiet: !!opts.quiet,
        });
        if (gfill && gfill.count) sources.push('google:' + gfill.count);
      }
    } catch (_) {}

    // 6) SNSearch.nearby fallback + crawl map mode
    try {
      if (g.SNSearch && SNSearch.nearby) {
        var near = await SNSearch.nearby(pos.lat, pos.lng, radius, query);
        (near || []).forEach(function (p) {
          if (upsertPoi(p, pos, p.source || 'search')) upserted++;
        });
        if (near && near.length) sources.push('search:' + near.length);
      }
    } catch (_) {}

    // 7) Enrich top vendors via Google details if key
    try {
      if (
        opts.enrichGoogle !== false &&
        g.SNPlacesBusiness &&
        SNPlacesBusiness.hasKey &&
        SNPlacesBusiness.hasKey() &&
        SNPlacesBusiness.enrichProfile
      ) {
        var top = sampleVendors(pos, 6, 12);
        for (var i = 0; i < top.length; i++) {
          try {
            var full = g.SNProfiles.get && SNProfiles.get(top[i].id);
            if (full) await SNPlacesBusiness.enrichProfile(full);
          } catch (_) {}
        }
        sources.push('enrich:' + top.length);
      }
    } catch (_) {}

    // 8) Force orderable menus (prices · photos · availability)
    var menus = forceMenusNear(pos, 8);

    // 9) Paint map
    try {
      if (g.SNMap) {
        if (SNMap.showProfiles) SNMap.showProfiles();
        if (SNMap.showTasks) SNMap.showTasks();
        if (SNMap.fitLatLngs && pos) {
          var pins = [{ lat: pos.lat, lng: pos.lng }];
          sampleVendors(pos, 5, 15).forEach(function (v) {
            var pr = g.SNProfiles.get && SNProfiles.get(v.id);
            if (pr) pins.push({ lat: pr.lat, lng: pr.lng });
          });
          if (pins.length > 1) SNMap.fitLatLngs(pins, { padding: 40, maxZoom: 15, force: true });
        }
      }
    } catch (_) {}

    var count = countVendorsNear(pos, 8);
    var samples = sampleVendors(pos, 6, 10);
    lastAt = { t: Date.now(), pos: pos, count: count, sources: sources };

    if (!opts.quiet) {
      log(
        'Vendors on map · ' + count + ' · menus ' + menus + ' · ' + sources.join(' · '),
        count ? 'ok' : 'err'
      );
      samples.slice(0, 5).forEach(function (s, i) {
        log(
          i +
            1 +
            ') ' +
            s.name +
            ' · ' +
            s.km +
            'km' +
            (s.phone ? ' · ' + s.phone : '') +
            (s.menuN ? ' · menu ' + s.menuN : '') +
            (s.photos ? ' · 📷' + s.photos : '') +
            (s.rating != null ? ' · ★' + s.rating : '') +
            ' · ' +
            (s.source || ''),
          'dim'
        );
      });
    }

    return {
      ok: count > 0,
      count: count,
      upserted: upserted,
      menus: menus,
      sources: sources,
      samples: samples,
      pos: pos,
      query: query,
    };
  }

  function status() {
    return lastAt || { count: 0, sources: [] };
  }

  g.SNVendorCrawl = {
    populate: populate,
    overpassFood: overpassFood,
    nominatimNear: nominatimNear,
    countNear: countVendorsNear,
    samples: sampleVendors,
    forceMenus: forceMenusNear,
    status: status,
    normalizePoi: normalizePoi,
  };
})(typeof window !== 'undefined' ? window : globalThis);
