/**
 * SNPlacesBusiness — fill vendor tiles from Google Places (Business Profile data surface)
 *
 * Real fields from Google Places API (Maps JS Places library):
 *   photos · opening hours · phone · website · rating · address · maps link · price band
 *
 * Menus with item prices are NOT published by Google for most shops.
 * When menu is empty we only add honest price-band order slots (not fake dish names).
 *
 * Requires SN_CONFIG.layers.googleMapsKey with Places API + Maps JavaScript API enabled.
 * Falls back to Overpass phone/website/hours already on the place.
 */
(function (global) {
  'use strict';

  var B = {
    ready: false,
    loading: null,
    service: null,
    host: null,
    enriching: {},
  };

  function cfgKey() {
    var L = (global.SN_CONFIG && SN_CONFIG.layers) || {};
    return L.googleMapsKey || L.googleKey || L.placesKey || '';
  }

  function hasKey() {
    return !!cfgKey();
  }

  function log(msg, cls) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(msg, cls || 'dim');
    } catch (_) {}
  }

  function ensureHost() {
    if (B.host && document.body.contains(B.host)) return B.host;
    var el = document.createElement('div');
    el.id = 'sn-places-host';
    el.style.cssText = 'width:1px;height:1px;overflow:hidden;position:absolute;left:-9999px;top:0';
    document.body.appendChild(el);
    B.host = el;
    return el;
  }

  /** Load Maps JS with places library (reuses key from google-earth config). */
  function loadPlacesLib() {
    if (global.google && google.maps && google.maps.places) {
      B.ready = true;
      return Promise.resolve(true);
    }
    if (!hasKey()) return Promise.reject(new Error('no googleMapsKey'));
    if (B.loading) return B.loading;
    B.loading = new Promise(function (resolve, reject) {
      // If maps already loaded without places — inject places
      if (global.google && google.maps && !google.maps.places) {
        var s2 = document.createElement('script');
        s2.src =
          'https://maps.googleapis.com/maps/api/js?key=' +
          encodeURIComponent(cfgKey()) +
          '&libraries=places&v=weekly&callback=__snPlacesReady';
        global.__snPlacesReady = function () {
          B.ready = !!(google.maps && google.maps.places);
          if (B.ready) resolve(true);
          else reject(new Error('places library missing'));
        };
        s2.onerror = function () {
          B.loading = null;
          reject(new Error('places script error'));
        };
        // If maps core already there, loading full script again is messy — try PlacesService only
        // Prefer full load once:
      }
      function finish() {
        B.ready = !!(global.google && google.maps && google.maps.places);
        if (B.ready) resolve(true);
        else reject(new Error('places not ready'));
      }
      if (global.google && google.maps && google.maps.places) {
        finish();
        return;
      }
      // Prefer SNGoogleEarth loader then attach places via second call
      if (global.SNGoogleEarth && SNGoogleEarth.load) {
        SNGoogleEarth.load()
          .then(function () {
            if (google.maps.places) {
              finish();
              return;
            }
            // Reload with places if earth loaded without it
            var s = document.createElement('script');
            s.async = true;
            s.src =
              'https://maps.googleapis.com/maps/api/js?key=' +
              encodeURIComponent(cfgKey()) +
              '&libraries=places,geometry,elevation,marker&v=weekly';
            s.onload = finish;
            s.onerror = function () {
              B.loading = null;
              reject(new Error('places load failed'));
            };
            document.head.appendChild(s);
          })
          .catch(function () {
            var s = document.createElement('script');
            s.async = true;
            s.src =
              'https://maps.googleapis.com/maps/api/js?key=' +
              encodeURIComponent(cfgKey()) +
              '&libraries=places,geometry&v=weekly';
            s.onload = finish;
            s.onerror = function () {
              B.loading = null;
              reject(new Error('places script error'));
            };
            document.head.appendChild(s);
          });
        return;
      }
      var s = document.createElement('script');
      s.async = true;
      s.src =
        'https://maps.googleapis.com/maps/api/js?key=' +
        encodeURIComponent(cfgKey()) +
        '&libraries=places,geometry&v=weekly';
      s.onload = finish;
      s.onerror = function () {
        B.loading = null;
        reject(new Error('places script error'));
      };
      document.head.appendChild(s);
    });
    return B.loading;
  }

  function service() {
    if (B.service) return B.service;
    ensureHost();
    B.service = new google.maps.places.PlacesService(B.host);
    return B.service;
  }

  function formatHours(opening) {
    if (!opening) return '';
    if (opening.weekday_text && opening.weekday_text.length) {
      return opening.weekday_text.join(' · ');
    }
    if (opening.periods && opening.open_now != null) {
      return opening.open_now ? 'Open now' : 'Closed now';
    }
    return '';
  }

  function priceBand(level) {
    if (level == null || level < 0) return null;
    var n = Math.min(4, Math.max(0, Number(level)));
    var euros = '€'.repeat(n + 1);
    var midS = [6, 12, 20, 32, 48][n];
    return {
      level: n,
      label: euros,
      midS: midS,
    };
  }

  /**
   * Honest order slots from Google price_level only — never invent dish names.
   * Vendors can replace with real menu later.
   */
  function slotsFromPriceBand(band, placeName) {
    if (!band) return [];
    var mid = band.midS || 15;
    var photo = '';
    return [
      {
        id: 'gband_small',
        name: 'Small order',
        price: Math.max(4, Math.round(mid * 0.55)),
        desc: 'Google price band ' + band.label + ' · ' + (placeName || 'shop'),
        photo: photo,
        source: 'google-price-band',
      },
      {
        id: 'gband_meal',
        name: 'Meal for one',
        price: mid,
        desc: 'Google price band ' + band.label,
        photo: photo,
        source: 'google-price-band',
      },
      {
        id: 'gband_share',
        name: 'Share / family tray',
        price: Math.round(mid * 2.1),
        desc: 'Google price band ' + band.label,
        photo: photo,
        source: 'google-price-band',
      },
    ];
  }

  function photoUrls(photos, max) {
    max = max || 6;
    if (!photos || !photos.length) return [];
    var out = [];
    var i;
    for (i = 0; i < Math.min(max, photos.length); i++) {
      try {
        if (photos[i].getUrl) {
          out.push(photos[i].getUrl({ maxWidth: 900, maxHeight: 600 }));
        }
      } catch (_) {}
    }
    return out;
  }

  function placeToSpec(place, extra) {
    extra = extra || {};
    var hours = formatHours(place.opening_hours || place.current_opening_hours);
    var band = priceBand(place.price_level);
    var photos = photoUrls(place.photos, 8);
    var cover = photos[0] || extra.cover || '';
    var avatar = photos[1] || photos[0] || extra.avatar || '';
    var types = place.types || [];
    var kind =
      types.indexOf('restaurant') >= 0
        ? 'restaurant'
        : types.indexOf('cafe') >= 0
          ? 'cafe'
          : types.indexOf('bakery') >= 0
            ? 'bakery'
            : types.indexOf('meal_takeaway') >= 0
              ? 'takeaway'
              : types[0] || extra.kind || 'shop';
    var menu = [];
    // Keep real menu if already set
    if (extra.menu && extra.menu.length) menu = extra.menu.slice();
    else if (band) menu = slotsFromPriceBand(band, place.name);

    // Stamp shop photos onto menu slots so tiles are never empty dots
    if (menu.length && photos.length) {
      menu = menu.map(function (m, i) {
        return Object.assign({}, m, {
          photo: m.photo || photos[i % photos.length] || cover,
          available:
            m.available != null
              ? m.available
              : place.opening_hours && place.opening_hours.open_now != null
                ? !!place.opening_hours.open_now
                : true,
        });
      });
    }

    return {
      googlePlaceId: place.place_id || extra.googlePlaceId || '',
      name: place.name || extra.name || 'Place',
      shopName: place.name || extra.shopName || extra.name || 'Shop',
      shopKind: kind,
      lat: place.geometry && place.geometry.location
        ? place.geometry.location.lat()
        : extra.lat,
      lng: place.geometry && place.geometry.location
        ? place.geometry.location.lng()
        : extra.lng,
      address: place.formatted_address || place.vicinity || extra.address || '',
      phone: place.formatted_phone_number || place.international_phone_number || extra.phone || '',
      website: place.website || extra.website || '',
      hours: hours || extra.hours || '',
      opening_hours: hours || extra.hours || '',
      rating: place.rating != null ? place.rating : extra.rating,
      ratingCount: place.user_ratings_total != null ? place.user_ratings_total : extra.ratingCount,
      priceLevel: place.price_level != null ? place.price_level : extra.priceLevel,
      priceBand: band ? band.label : extra.priceBand || '',
      photos: photos.length ? photos : extra.photos || [],
      cover: cover || extra.cover,
      avatar: avatar || extra.avatar,
      googleMapsUrl: place.url || extra.googleMapsUrl || '',
      googleUrl: place.url || extra.googleUrl || '',
      openNow:
        place.opening_hours && place.opening_hours.open_now != null
          ? place.opening_hours.open_now
          : extra.openNow,
      menu: menu,
      real: true,
      source: 'google-places',
      googleEnrichedAt: Date.now(),
      bio:
        (place.vicinity || place.formatted_address || kind) +
        (place.rating != null ? ' · ★' + place.rating : '') +
        (band ? ' · ' + band.label : ''),
      roles: { social: true, vendor: true, client: false, dating: false, driver: false, worker: false },
    };
  }

  function detailsFields() {
    return [
      'place_id',
      'name',
      'geometry',
      'formatted_address',
      'vicinity',
      'formatted_phone_number',
      'international_phone_number',
      'website',
      'url',
      'opening_hours',
      'photos',
      'rating',
      'user_ratings_total',
      'price_level',
      'types',
      'business_status',
    ];
  }

  function getDetails(placeId) {
    return new Promise(function (resolve, reject) {
      if (!placeId) {
        reject(new Error('no placeId'));
        return;
      }
      service().getDetails(
        { placeId: placeId, fields: detailsFields() },
        function (place, status) {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            reject(new Error(String(status || 'details fail')));
            return;
          }
          resolve(place);
        }
      );
    });
  }

  function nearbySearch(lat, lng, opts) {
    opts = opts || {};
    var radius = opts.radiusM || 2800;
    var type = opts.type || 'restaurant';
    return new Promise(function (resolve, reject) {
      service().nearbySearch(
        {
          location: new google.maps.LatLng(lat, lng),
          radius: radius,
          type: type,
          // keyword optional
          keyword: opts.keyword || undefined,
        },
        function (results, status) {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK &&
            status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS
          ) {
            reject(new Error(String(status)));
            return;
          }
          resolve(results || []);
        }
      );
    });
  }

  function textSearch(query, lat, lng) {
    return new Promise(function (resolve, reject) {
      var req = { query: query };
      if (lat != null && lng != null) {
        req.location = new google.maps.LatLng(lat, lng);
        req.radius = 3000;
      }
      service().textSearch(req, function (results, status) {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK &&
          status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS
        ) {
          reject(new Error(String(status)));
          return;
        }
        resolve(results || []);
      });
    });
  }

  function upsertFromGoogle(place, extra) {
    if (!global.SNProfiles || !SNProfiles.upsert) return null;
    var spec = placeToSpec(place, extra || {});
    if (spec.lat == null || spec.lng == null) return null;
    var id =
      (spec.googlePlaceId && 'gplace_' + String(spec.googlePlaceId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)) ||
      (extra && extra.id) ||
      'poi_' +
        String(spec.name || 'x')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .slice(0, 24);
    var prev = SNProfiles.get(id);
    // Merge carefully — keep real vendor menus if already hand-set
    var keepMenu =
      prev &&
      Array.isArray(prev.menu) &&
      prev.menu.length &&
      prev.menu.some(function (m) {
        return m && m.source !== 'google-price-band';
      });
    var merged = Object.assign({}, prev || {}, spec, {
      id: id,
      handle: (prev && prev.handle) || '@' + id.slice(0, 14),
      menu: keepMenu ? prev.menu : spec.menu,
      cover: spec.cover || (prev && prev.cover) || '',
      avatar: spec.avatar || (prev && prev.avatar) || '',
      cuisine: (prev && prev.cuisine) || (types && types[0]) || '',
    });
    var out = SNProfiles.upsert(merged);
    // Always ensure orderable menu with photos/prices/availability
    if (global.SNProfiles && SNProfiles.ensureOrderableMenu) {
      out = SNProfiles.ensureOrderableMenu(out) || out;
    }
    return out;
  }

  /**
   * Fill sector near lat/lng with Google Business-style place cards.
   */
  async function fillSector(lat, lng, opts) {
    opts = opts || {};
    if (!hasKey()) {
      return { ok: false, count: 0, error: 'no_key', source: 'none' };
    }
    try {
      await loadPlacesLib();
    } catch (e) {
      return { ok: false, count: 0, error: e.message || 'load', source: 'none' };
    }
    var types = opts.types || ['restaurant', 'cafe', 'bakery', 'meal_takeaway'];
    var seen = {};
    var list = [];
    var t;
    for (t = 0; t < types.length; t++) {
      try {
        var batch = await nearbySearch(lat, lng, {
          radiusM: opts.radiusM || 2800,
          type: types[t],
        });
        (batch || []).forEach(function (p) {
          if (!p.place_id || seen[p.place_id]) return;
          seen[p.place_id] = 1;
          list.push(p);
        });
      } catch (_) {}
      if (list.length >= (opts.limit || 24)) break;
    }
    list = list.slice(0, opts.limit || 24);
    var saved = 0;
    var i;
    // Details for top N (rate-limit friendly)
    var detailN = Math.min(list.length, opts.details || 12);
    for (i = 0; i < list.length; i++) {
      var row = list[i];
      try {
        if (i < detailN) {
          var det = await getDetails(row.place_id);
          if (upsertFromGoogle(det, { lat: lat, lng: lng })) saved++;
        } else {
          if (upsertFromGoogle(row, { lat: lat, lng: lng })) saved++;
        }
      } catch (_) {
        try {
          if (upsertFromGoogle(row, { lat: lat, lng: lng })) saved++;
        } catch (e2) {}
      }
      // small yield
      if (i % 3 === 2) await new Promise(function (r) {
        setTimeout(r, 40);
      });
    }
    try {
      if (global.SNMap && SNMap.showProfiles) SNMap.showProfiles();
    } catch (_) {}
    if (saved && !opts.quiet) log('Google places · ' + saved + ' shops filled', 'ok');
    return { ok: saved > 0, count: saved, source: 'google-places' };
  }

  /**
   * Enrich one profile (on tile open) via name + lat/lng match → Google details.
   */
  async function enrichProfile(profile) {
    if (!profile || profile.lat == null) return profile;
    if (profile.googleEnrichedAt && Date.now() - profile.googleEnrichedAt < 6 * 3600 * 1000) {
      return profile;
    }
    if (!hasKey()) return profile;
    var key = profile.id || profile.googlePlaceId || profile.name;
    if (B.enriching[key]) return B.enriching[key];
    B.enriching[key] = (async function () {
      try {
        await loadPlacesLib();
        var place = null;
        if (profile.googlePlaceId) {
          place = await getDetails(profile.googlePlaceId);
        } else {
          var q = (profile.shopName || profile.name || '') + ' restaurant';
          var hits = await textSearch(q, profile.lat, profile.lng);
          if (!hits.length) {
            hits = await nearbySearch(profile.lat, profile.lng, {
              radiusM: 400,
              type: 'restaurant',
            });
          }
          // pick nearest name match
          var best = null;
          var bestD = 1e9;
          (hits || []).forEach(function (h) {
            if (!h.geometry || !h.geometry.location) return;
            var la = h.geometry.location.lat();
            var ln = h.geometry.location.lng();
            var d =
              Math.abs(la - profile.lat) * 111 +
              Math.abs(ln - profile.lng) * 85;
            var nameHit =
              (profile.name &&
                h.name &&
                h.name.toLowerCase().indexOf(String(profile.name).toLowerCase().slice(0, 8)) >= 0) ||
              (profile.shopName &&
                h.name &&
                h.name.toLowerCase().indexOf(String(profile.shopName).toLowerCase().slice(0, 8)) >= 0);
            if (nameHit) d *= 0.3;
            if (d < bestD) {
              bestD = d;
              best = h;
            }
          });
          if (best && best.place_id) place = await getDetails(best.place_id);
          else if (best) place = best;
        }
        if (!place) return profile;
        var p = upsertFromGoogle(place, profile);
        return p || profile;
      } catch (e) {
        return profile;
      } finally {
        delete B.enriching[key];
      }
    })();
    return B.enriching[key];
  }

  global.SNPlacesBusiness = {
    hasKey: hasKey,
    load: loadPlacesLib,
    fillSector: fillSector,
    enrichProfile: enrichProfile,
    upsertFromGoogle: upsertFromGoogle,
    getDetails: getDetails,
  };
})(typeof window !== 'undefined' ? window : globalThis);
