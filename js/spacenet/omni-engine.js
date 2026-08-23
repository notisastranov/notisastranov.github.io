/**
 * SNOmni — Astranov Power Engine
 * ============================================================
 * Elevates SpaceNet into a unified super-system:
 *  1) Multi-provider search fusion (race the open internet)
 *  2) Spatial knowledge graph (local + collective memory hooks)
 *  3) Graphics bus (globe + map + neural HUD projection)
 *  4) Mind mesh (Silver + Astranov Mind + SNAi + omni context)
 *  5) Self-audit power score (honest capability map)
 *
 * Philosophy: one OS · one globe · every open signal · no fake demos.
 * Mechanical: window.SNOmni
 * Build: 20260812033000-omni-v1
 */
(function (global) {
  'use strict';
  var BUILD = '20260812033000-omni-v1';
  var KG_KEY = 'sn:omni-kg-v1';
  var STATS_KEY = 'sn:omni-stats-v1';
  var UA = 'AstranovSpaceNet-Omni/1.0 (https://astranov.eu; power-engine)';

  var S = {
    ready: false,
    lastQuery: null,
    lastResult: null,
    providers: {},
    stats: { runs: 0, hits: 0, fails: 0, msAvg: 0 },
    kg: { nodes: {}, edges: [], updated: 0 },
  };

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 280), c || 'ok');
    } catch (_) {}
  }

  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m).slice(0, 90));
    } catch (_) {}
  }

  function loadKg() {
    try {
      var raw = localStorage.getItem(KG_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.nodes) S.kg = o;
      }
    } catch (_) {}
    try {
      var st = localStorage.getItem(STATS_KEY);
      if (st) S.stats = Object.assign(S.stats, JSON.parse(st));
    } catch (_) {}
  }

  function saveKg() {
    try {
      S.kg.updated = Date.now();
      // Cap graph size
      var ids = Object.keys(S.kg.nodes);
      if (ids.length > 400) {
        ids
          .sort(function (a, b) {
            return (S.kg.nodes[a].t || 0) - (S.kg.nodes[b].t || 0);
          })
          .slice(0, ids.length - 400)
          .forEach(function (id) {
            delete S.kg.nodes[id];
          });
      }
      if (S.kg.edges.length > 800) S.kg.edges = S.kg.edges.slice(-800);
      localStorage.setItem(KG_KEY, JSON.stringify(S.kg));
      localStorage.setItem(STATS_KEY, JSON.stringify(S.stats));
    } catch (_) {}
  }

  function nodeId(kind, key) {
    return kind + ':' + String(key || '').toLowerCase().replace(/\s+/g, '_').slice(0, 80);
  }

  function rememberNode(kind, key, data) {
    var id = nodeId(kind, key);
    var prev = S.kg.nodes[id] || {};
    S.kg.nodes[id] = Object.assign({}, prev, data || {}, {
      id: id,
      kind: kind,
      key: key,
      t: Date.now(),
      hits: (prev.hits || 0) + 1,
    });
    return id;
  }

  function link(a, b, rel) {
    if (!a || !b) return;
    S.kg.edges.push({ a: a, b: b, rel: rel || 'related', t: Date.now() });
  }

  async function fetchJson(url, opts) {
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (_) {}
    }, opts.timeout || 7000);
    try {
      var res = await fetch(url, {
        method: opts.method || 'GET',
        headers: Object.assign(
          { Accept: 'application/json', 'User-Agent': UA },
          opts.headers || {}
        ),
        body: opts.body,
        signal: ctrl ? ctrl.signal : undefined,
        credentials: 'omit',
        mode: 'cors',
      });
      clearTimeout(to);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      clearTimeout(to);
      throw e;
    }
  }

  async function fetchText(url, timeout) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (_) {}
    }, timeout || 7000);
    try {
      var res = await fetch(url, {
        signal: ctrl ? ctrl.signal : undefined,
        credentials: 'omit',
        mode: 'cors',
        headers: { Accept: 'application/json,text/plain,*/*', 'User-Agent': UA },
      });
      clearTimeout(to);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) {
      clearTimeout(to);
      throw e;
    }
  }

  function focusPos() {
    return (
      (global.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      global._snLastPos ||
      (global.SNTasks && SNTasks.pos) || { lat: 36.4341, lng: 28.2176 }
    );
  }

  // ---------- PROVIDERS (open web · browser-safe) ----------

  async function pNominatim(q) {
    var url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=8&addressdetails=1&q=' +
      encodeURIComponent(q);
    var j = await fetchJson(url, { timeout: 6500 });
    return (j || []).map(function (r) {
      return {
        type: 'place',
        title: r.display_name,
        lat: Number(r.lat),
        lng: Number(r.lon),
        source: 'nominatim',
        score: 0.7,
        raw: r,
      };
    });
  }

  async function pPhoton(q) {
    var url = 'https://photon.komoot.io/api/?limit=8&q=' + encodeURIComponent(q);
    var j = await fetchJson(url, { timeout: 6500 });
    return ((j && j.features) || []).map(function (f) {
      var p = f.properties || {};
      var c = (f.geometry && f.geometry.coordinates) || [];
      return {
        type: 'place',
        title: p.name || p.street || p.city || p.country || q,
        lat: c[1],
        lng: c[0],
        source: 'photon',
        score: 0.65,
        detail: [p.city, p.country].filter(Boolean).join(', '),
      };
    });
  }

  async function pOverpass(q, pos) {
    pos = pos || focusPos();
    var radius = 3500;
    var filter =
      'node["name"~"' +
      String(q).replace(/"/g, '').slice(0, 40) +
      '",i](around:' +
      radius +
      ',' +
      pos.lat +
      ',' +
      pos.lng +
      ');' +
      'node["amenity"~"restaurant|cafe|shop|pharmacy|fuel|bank",i](around:' +
      Math.min(radius, 2000) +
      ',' +
      pos.lat +
      ',' +
      pos.lng +
      ');';
    var body =
      '[out:json][timeout:12];(' + filter + ');out center 24;';
    var j = await fetchJson('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      timeout: 14000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(body),
    });
    return ((j && j.elements) || [])
      .filter(function (e) {
        return e && (e.lat != null || (e.center && e.center.lat != null));
      })
      .slice(0, 24)
      .map(function (e) {
        var lat = e.lat != null ? e.lat : e.center.lat;
        var lng = e.lon != null ? e.lon : e.center.lon;
        var tags = e.tags || {};
        return {
          type: 'poi',
          title: tags.name || tags.amenity || tags.shop || 'POI',
          lat: lat,
          lng: lng,
          source: 'overpass',
          score: 0.8,
          detail: tags.amenity || tags.shop || tags.cuisine || '',
        };
      });
  }

  async function pWikiSummary(q) {
    var url =
      'https://en.wikipedia.org/api/rest_v1/page/summary/' +
      encodeURIComponent(q.replace(/\s+/g, '_'));
    var j = await fetchJson(url, { timeout: 6000 });
    if (!j || j.type === 'disambiguation' && !j.extract) return [];
    var lat = j.coordinates && j.coordinates.lat;
    var lng = j.coordinates && j.coordinates.lon;
    return [
      {
        type: 'knowledge',
        title: j.title || q,
        detail: (j.extract || '').slice(0, 400),
        url: j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page,
        lat: lat,
        lng: lng,
        source: 'wikipedia',
        score: 0.85,
        image: j.thumbnail && j.thumbnail.source,
      },
    ];
  }

  async function pWikiSearch(q) {
    var url =
      'https://en.wikipedia.org/w/api.php?action=opensearch&limit=8&namespace=0&format=json&origin=*&search=' +
      encodeURIComponent(q);
    var j = await fetchJson(url, { timeout: 6000 });
    var titles = (j && j[1]) || [];
    var descs = (j && j[2]) || [];
    var urls = (j && j[3]) || [];
    return titles.map(function (t, i) {
      return {
        type: 'knowledge',
        title: t,
        detail: descs[i] || '',
        url: urls[i],
        source: 'wikipedia-search',
        score: 0.7 - i * 0.03,
      };
    });
  }

  async function pWikiGeo(pos) {
    pos = pos || focusPos();
    var url =
      'https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=' +
      pos.lat +
      '|' +
      pos.lng +
      '&gsradius=10000&gslimit=12&format=json&origin=*';
    var j = await fetchJson(url, { timeout: 6500 });
    var arr = (j && j.query && j.query.geosearch) || [];
    return arr.map(function (g) {
      return {
        type: 'knowledge',
        title: g.title,
        lat: g.lat,
        lng: g.lon,
        source: 'wikipedia-geo',
        score: 0.75,
        detail: 'geo · ' + Math.round(g.dist) + 'm',
      };
    });
  }

  async function pDuck(q) {
    var url =
      'https://api.duckduckgo.com/?q=' +
      encodeURIComponent(q) +
      '&format=json&no_redirect=1&no_html=1&skip_disambig=1';
    var j = await fetchJson(url, { timeout: 6000 });
    var out = [];
    if (j && j.AbstractText) {
      out.push({
        type: 'knowledge',
        title: j.Heading || q,
        detail: j.AbstractText.slice(0, 400),
        url: j.AbstractURL,
        source: 'duckduckgo',
        score: 0.72,
        image: j.Image,
      });
    }
    (j.RelatedTopics || []).slice(0, 6).forEach(function (t, i) {
      if (t.Text) {
        out.push({
          type: 'knowledge',
          title: (t.Text || '').split(' - ')[0].slice(0, 80),
          detail: t.Text,
          url: t.FirstURL,
          source: 'duckduckgo',
          score: 0.55 - i * 0.02,
        });
      }
    });
    return out;
  }

  async function pOpenLibrary(q) {
    var url =
      'https://openlibrary.org/search.json?limit=6&q=' + encodeURIComponent(q);
    var j = await fetchJson(url, { timeout: 7000 });
    return ((j && j.docs) || []).slice(0, 6).map(function (d, i) {
      return {
        type: 'book',
        title: d.title,
        detail: (d.author_name || []).slice(0, 2).join(', ') + (d.first_publish_year ? ' · ' + d.first_publish_year : ''),
        url: d.key ? 'https://openlibrary.org' + d.key : '',
        source: 'openlibrary',
        score: 0.5 - i * 0.02,
      };
    });
  }

  async function pOpenMeteo(pos) {
    pos = pos || focusPos();
    var url =
      'https://api.open-meteo.com/v1/forecast?latitude=' +
      pos.lat +
      '&longitude=' +
      pos.lng +
      '&current=temperature_2m,weather_code,wind_speed_10m';
    var j = await fetchJson(url, { timeout: 5000 });
    if (!j || !j.current) return [];
    return [
      {
        type: 'weather',
        title: 'Weather · ' + Math.round(j.current.temperature_2m) + '°C',
        detail:
          'Wind ' +
          Math.round(j.current.wind_speed_10m) +
          ' km/h · code ' +
          j.current.weather_code,
        lat: pos.lat,
        lng: pos.lng,
        source: 'open-meteo',
        score: 0.9,
      },
    ];
  }

  async function pRestCountries(q) {
    if (!/^[a-zA-Z\s]{3,40}$/.test(q) || q.split(/\s+/).length > 3) return [];
    var url = 'https://restcountries.com/v3.1/name/' + encodeURIComponent(q) + '?fields=name,capital,latlng,population,region,flags';
    var j = await fetchJson(url, { timeout: 6000 });
    return (j || []).slice(0, 4).map(function (c) {
      return {
        type: 'place',
        title: (c.name && c.name.common) || q,
        detail:
          (c.capital && c.capital[0] ? 'Capital ' + c.capital[0] + ' · ' : '') +
          (c.region || '') +
          (c.population ? ' · pop ' + c.population : ''),
        lat: c.latlng && c.latlng[0],
        lng: c.latlng && c.latlng[1],
        source: 'restcountries',
        score: 0.78,
        image: c.flags && (c.flags.svg || c.flags.png),
      };
    });
  }

  async function pArchive(q) {
    var url =
      'https://archive.org/advancedsearch.php?q=' +
      encodeURIComponent(q) +
      '&fl[]=identifier,title,description&rows=5&page=1&output=json';
    var j = await fetchJson(url, { timeout: 8000 });
    var docs = (j && j.response && j.response.docs) || [];
    return docs.map(function (d, i) {
      return {
        type: 'media',
        title: d.title || d.identifier,
        detail: String(d.description || '').slice(0, 180),
        url: 'https://archive.org/details/' + d.identifier,
        source: 'archive.org',
        score: 0.48 - i * 0.02,
      };
    });
  }

  async function pGithubCode(q) {
    // public search HTML is blocked; use ghapi code search without auth is limited — skip if fail
    var url =
      'https://api.github.com/search/repositories?q=' +
      encodeURIComponent(q) +
      '&per_page=5&sort=stars';
    var j = await fetchJson(url, {
      timeout: 7000,
      headers: { Accept: 'application/vnd.github+json' },
    });
    return ((j && j.items) || []).map(function (r, i) {
      return {
        type: 'code',
        title: r.full_name,
        detail: (r.description || '').slice(0, 180) + ' · ★' + r.stargazers_count,
        url: r.html_url,
        source: 'github',
        score: 0.6 - i * 0.03,
      };
    });
  }

  async function pLocalMind(q) {
    var out = [];
    try {
      if (global.SNAstranovMind && SNAstranovMind.answer) {
        var a = SNAstranovMind.answer(q);
        if (a && a.text) {
          out.push({
            type: 'mind',
            title: 'Astranov Mind',
            detail: String(a.text).slice(0, 320),
            source: 'astranov-mind',
            score: 0.88,
          });
        }
      }
    } catch (_) {}
    try {
      // knowledge graph recall
      var low = String(q).toLowerCase();
      Object.keys(S.kg.nodes).forEach(function (id) {
        var n = S.kg.nodes[id];
        if (!n) return;
        if (
          (n.title && String(n.title).toLowerCase().indexOf(low.slice(0, 24)) >= 0) ||
          (n.key && String(n.key).toLowerCase().indexOf(low.slice(0, 24)) >= 0)
        ) {
          out.push({
            type: n.kind || 'memory',
            title: n.title || n.key,
            detail: n.detail || 'from collective memory',
            lat: n.lat,
            lng: n.lng,
            url: n.url,
            source: 'omni-kg',
            score: 0.62 + Math.min(0.2, (n.hits || 1) * 0.02),
          });
        }
      });
    } catch (_) {}
    return out.slice(0, 12);
  }

  async function pSNSearchBridge(q, pos) {
    if (!global.SNSearch) return [];
    var out = [];
    try {
      if (SNSearch.nearby) {
        var near = await SNSearch.nearby(pos.lat, pos.lng, 4000, q);
        (near || []).slice(0, 16).forEach(function (p) {
          out.push({
            type: 'poi',
            title: p.name || p.title || 'POI',
            lat: p.lat,
            lng: p.lng,
            detail: p.kind || p.amenity || '',
            source: p.source || 'sn-search-nearby',
            score: 0.82,
          });
        });
      }
    } catch (_) {}
    try {
      if (SNSearch.geocode) {
        var g = await SNSearch.geocode(q);
        (g || []).slice(0, 6).forEach(function (p) {
          out.push({
            type: 'place',
            title: p.name || p.display_name || q,
            lat: p.lat,
            lng: p.lng,
            source: p.source || 'sn-geocode',
            score: 0.7,
          });
        });
      }
    } catch (_) {}
    return out;
  }

  var PROVIDER_FNS = {
    nominatim: pNominatim,
    photon: pPhoton,
    overpass: function (q) {
      return pOverpass(q, focusPos());
    },
    wiki: pWikiSummary,
    wikiSearch: pWikiSearch,
    wikiGeo: function () {
      return pWikiGeo(focusPos());
    },
    duck: pDuck,
    openlibrary: pOpenLibrary,
    weather: function () {
      return pOpenMeteo(focusPos());
    },
    countries: pRestCountries,
    archive: pArchive,
    github: pGithubCode,
    mind: pLocalMind,
    snsearch: function (q) {
      return pSNSearchBridge(q, focusPos());
    },
  };

  function dedupe(items) {
    var seen = {};
    var out = [];
    items.forEach(function (it) {
      if (!it) return;
      var k =
        (it.source || '') +
        '|' +
        String(it.title || '')
          .toLowerCase()
          .slice(0, 48) +
        '|' +
        (it.lat != null ? Number(it.lat).toFixed(3) : '') +
        '|' +
        (it.lng != null ? Number(it.lng).toFixed(3) : '');
      if (seen[k]) return;
      seen[k] = 1;
      out.push(it);
    });
    return out.sort(function (a, b) {
      return (b.score || 0) - (a.score || 0);
    });
  }

  // ---------- GRAPHICS BUS ----------

  function projectGraphics(items, query) {
    var spatial = (items || []).filter(function (i) {
      return i && i.lat != null && i.lng != null && isFinite(i.lat) && isFinite(i.lng);
    });
    try {
      if (global.SNAIGraphics) {
        if (SNAIGraphics.init) SNAIGraphics.init();
        if (SNAIGraphics.setThinkPulse) SNAIGraphics.setThinkPulse(true);
        if (SNAIGraphics.showNeural) SNAIGraphics.showNeural(true);
        setTimeout(function () {
          try {
            if (SNAIGraphics.setThinkPulse) SNAIGraphics.setThinkPulse(false);
          } catch (_) {}
        }, 2200);
      }
    } catch (_) {}

    // Globe pulses — top spatial hits
    try {
      if (global.SNGlobe && SNGlobe.pulse) {
        spatial.slice(0, 14).forEach(function (p, i) {
          var col =
            p.type === 'weather'
              ? 0x66ccff
              : p.type === 'poi'
                ? 0x44ffaa
                : p.type === 'knowledge'
                  ? 0xffcc66
                  : 0x3d9eff;
          SNGlobe.pulse(p.lat, p.lng, col, String(p.title || '').slice(0, 16), 9000 + i * 200);
        });
        if (spatial[0] && SNGlobe.goToPlace) {
          SNGlobe.goToPlace(spatial[0].lat, spatial[0].lng, {
            tier: spatial.length > 6 ? 'national' : 'city',
            body: 'earth',
            pulse: true,
            label: String(query || 'Omni').slice(0, 24),
            openMap: spatial.length <= 8,
          });
        } else if (spatial[0] && SNGlobe.flyNear) {
          SNGlobe.flyNear(spatial[0].lat, spatial[0].lng, 'national');
        }
      }
    } catch (_) {}

    // City map plot
    try {
      if (spatial.length && global.SNMap) {
        var mid = spatial[0];
        void Promise.resolve(SNMap.open && SNMap.open(mid.lat, mid.lng, { force: true, zoom: 13 })).then(
          function () {
            try {
              if (SNMap.plotCrawl) {
                SNMap.plotCrawl(
                  spatial.slice(0, 40).map(function (p) {
                    return {
                      lat: p.lat,
                      lng: p.lng,
                      name: p.title,
                      source: p.source,
                      kind: p.type,
                    };
                  })
                );
              }
              if (SNMap.fitLatLngs) {
                SNMap.fitLatLngs(
                  spatial.slice(0, 20).map(function (p) {
                    return { lat: p.lat, lng: p.lng };
                  }),
                  { force: true, padding: 48, maxZoom: 14 }
                );
              }
            } catch (_) {}
          }
        );
      }
    } catch (_) {}

    // Silver reaction
    try {
      if (global.SNChromeHelper && SNChromeHelper.speak) {
        SNChromeHelper.speak(
          'Omni · ' + (items || []).length + ' signals · ' + spatial.length + ' on the globe',
          { ms: 6000, voice: false }
        );
      }
    } catch (_) {}
  }

  function reportCli(items, query, meta) {
    meta = meta || {};
    var spatial = items.filter(function (i) {
      return i.lat != null;
    });
    log('════ OMNI POWER · ' + query + ' ════', 'ok');
    log(
      'Providers ' +
        (meta.okProviders || 0) +
        '/' +
        (meta.totalProviders || 0) +
        ' · hits ' +
        items.length +
        ' · spatial ' +
        spatial.length +
        ' · ' +
        (meta.ms || 0) +
        'ms',
      'dim'
    );
    items.slice(0, 12).forEach(function (it, i) {
      log(
        (i + 1) +
          '. [' +
          (it.source || '?') +
          '] ' +
          String(it.title || '').slice(0, 60) +
          (it.detail ? ' — ' + String(it.detail).slice(0, 70) : ''),
        it.type === 'mind' ? 'ok' : 'dim'
      );
    });
    if (items.length > 12) log('… +' + (items.length - 12) + ' more in knowledge graph', 'dim');
    preview('Omni · ' + items.length + ' hits');
  }

  // ---------- CORE SEARCH ----------

  async function search(query, opts) {
    opts = opts || {};
    var q = String(query || '').trim();
    if (!q) {
      log('Omni · empty query', 'err');
      return { ok: false, items: [] };
    }
    var t0 = Date.now();
    S.lastQuery = q;
    preview('Omni racing providers…');
    log('Omni · racing open internet for: ' + q, 'dim');

    var names = opts.providers || Object.keys(PROVIDER_FNS);
    // Intent trim: don't hit archive/github for pure geo pizza
    if (/\b(near|pizza|restaurant|cafe|shop|hotel|pharmacy)\b/i.test(q)) {
      names = names.filter(function (n) {
        return !/archive|openlibrary|github/i.test(n);
      });
    }
    if (opts.mapOnly) {
      names = ['snsearch', 'overpass', 'nominatim', 'photon', 'wikiGeo', 'weather', 'mind'];
    }

    var okProviders = 0;
    var settled = await Promise.all(
      names.map(function (name) {
        return Promise.resolve()
          .then(function () {
            return PROVIDER_FNS[name](q);
          })
          .then(function (rows) {
            okProviders++;
            S.providers[name] = { ok: true, n: (rows || []).length, t: Date.now() };
            return rows || [];
          })
          .catch(function (e) {
            S.providers[name] = { ok: false, err: String(e && e.message ? e.message : e) };
            return [];
          });
      })
    );

    var items = dedupe(
      settled.reduce(function (a, b) {
        return a.concat(b);
      }, [])
    );

    // Write knowledge graph
    var qNode = rememberNode('query', q, { title: q, detail: 'user query' });
    items.slice(0, 60).forEach(function (it) {
      var id = rememberNode(it.type || 'hit', it.title || it.url || Math.random(), {
        title: it.title,
        detail: it.detail,
        lat: it.lat,
        lng: it.lng,
        url: it.url,
        source: it.source,
      });
      link(qNode, id, 'found');
    });
    saveKg();

    var ms = Date.now() - t0;
    S.stats.runs++;
    S.stats.hits += items.length;
    S.stats.msAvg = Math.round((S.stats.msAvg * (S.stats.runs - 1) + ms) / S.stats.runs);
    saveKg();

    var result = {
      ok: true,
      query: q,
      items: items,
      spatial: items.filter(function (i) {
        return i.lat != null;
      }),
      ms: ms,
      providers: S.providers,
      okProviders: okProviders,
      totalProviders: names.length,
      build: BUILD,
    };
    S.lastResult = result;

    if (!opts.silent) {
      reportCli(items, q, result);
      if (opts.graphics !== false) projectGraphics(items, q);
    }

    // Teach free mind a compact summary
    try {
      if (global.SNAstranovMind && SNAstranovMind.teach && items[0]) {
        var summary =
          'Omni found ' +
          items.length +
          ' for "' +
          q +
          '". Top: ' +
          items
            .slice(0, 3)
            .map(function (i) {
              return i.title;
            })
            .join(' · ');
        SNAstranovMind.teach(q, summary, ['omni', 'search']);
      }
    } catch (_) {}

    return result;
  }

  // ---------- POWER AUDIT ----------

  function powerScore() {
    var checks = [];
    function add(id, ok, weight, detail) {
      checks.push({ id: id, ok: !!ok, weight: weight || 1, detail: detail || '' });
    }
    add('cli', !!(global.SNCli && SNCli.run), 2, 'CLI');
    add('globe', !!(global.SNGlobe && SNGlobe.pulse), 3, '3D Earth');
    add('map', !!(global.SNMap && SNMap.open), 3, 'City map');
    add('search', !!(global.SNSearch && SNSearch.crawl), 2, 'SNSearch');
    add('ai', !!(global.SNAi && SNAi.ask), 3, 'SNAi');
    add('mind', !!(global.SNAstranovMind && SNAstranovMind.answer), 3, 'Collective mind');
    add('silver', !!(global.SNChromeHelper && SNChromeHelper.activate), 2, 'Silver');
    add('graphics', !!(global.SNAIGraphics || global.AIGraphics), 2, 'AI graphics');
    add('webrtc', !!(global.SNWebRTC && SNWebRTC.open), 1, 'Video call');
    add('field', !!(global.SNField), 1, 'Field chrome');
    add('brain', !!(global.SNBrain && SNBrain.systemPrompt), 1, 'Brain law');
    add('radar', !!(global.SNRadar || (global.SNField && SNField.refreshBlips)), 1, 'Radar');
    add('kg', Object.keys(S.kg.nodes).length > 0, 1, 'Knowledge graph ' + Object.keys(S.kg.nodes).length);

    var max = 0;
    var got = 0;
    checks.forEach(function (c) {
      max += c.weight;
      if (c.ok) got += c.weight;
    });
    var pct = max ? Math.round((got / max) * 100) : 0;
    return { pct: pct, got: got, max: max, checks: checks, build: BUILD, stats: S.stats };
  }

  function elevateReport() {
    var p = powerScore();
    log('════ ASTRANOV POWER AUDIT ════', 'ok');
    log('Score · ' + p.pct + '%  (' + p.got + '/' + p.max + ' systems online)', p.pct >= 70 ? 'ok' : 'dim');
    p.checks.forEach(function (c) {
      log((c.ok ? '✓ ' : '✗ ') + c.id + (c.detail ? ' · ' + c.detail : ''), c.ok ? 'ok' : 'err');
    });
    log(
      'Omni runs ' +
        S.stats.runs +
        ' · avg ' +
        S.stats.msAvg +
        'ms · kg nodes ' +
        Object.keys(S.kg.nodes).length,
      'dim'
    );
    log('Stack · multi-provider search · spatial KG · globe graphics · mind mesh · Silver', 'ok');
    preview('Power · ' + p.pct + '%');
    return p;
  }

  async function elevate(opts) {
    opts = opts || {};
    log('Elevating Astranov stack…', 'dim');
    // Ensure modules
    try {
      if (global.SNLoader && SNLoader.ensure) {
        await SNLoader.ensure(['ai', 'search', 'webrtc', 'helper'].filter(Boolean));
      }
    } catch (_) {}
    try {
      if (global.SNAIGraphics && SNAIGraphics.init) SNAIGraphics.init();
    } catch (_) {}
    try {
      if (global.SNChromeHelper && SNChromeHelper.activate && opts.wakeSilver !== false) {
        // soft wake without spam if already active
        if (!global.__SN_SILVER_ACTIVE && SNChromeHelper.speak) {
          SNChromeHelper.speak('Power systems elevating…', { ms: 4000, voice: false });
        }
      }
    } catch (_) {}
    try {
      if (global.SNField && SNField.refreshBlips) SNField.refreshBlips();
    } catch (_) {}
    try {
      if (global.SNBrain && SNBrain.verify) SNBrain.verify();
    } catch (_) {}

    var audit = elevateReport();

    // Warm search on user focus
    if (opts.warmSearch !== false) {
      try {
        var pos = focusPos();
        await search('places near me', { mapOnly: true, silent: false });
        log(
          'Warm scan · ' +
            Number(pos.lat).toFixed(3) +
            ',' +
            Number(pos.lng).toFixed(3),
          'dim'
        );
      } catch (_) {}
    }
    return audit;
  }

  async function ask(message) {
    var msg = String(message || '').trim();
    if (!msg) return null;
    // Search-shaped → omni search
    if (
      /\b(search|find|where|what is|who is|near|map|look up|wiki|weather|github)\b/i.test(msg) ||
      msg.split(/\s+/).length <= 4
    ) {
      var r = await search(msg, { graphics: true });
      if (r.items && r.items[0] && r.items[0].detail) {
        return (
          r.items[0].title +
          ' — ' +
          String(r.items[0].detail).slice(0, 200) +
          ' · Omni ' +
          r.items.length +
          ' hits on the globe'
        );
      }
    }
    try {
      if (global.SNAi && SNAi.ask) return await SNAi.ask(msg, { source: 'omni' });
    } catch (_) {}
    try {
      if (global.SNAstranovMind && SNAstranovMind.answer) {
        var a = SNAstranovMind.answer(msg);
        return a && a.text;
      }
    } catch (_) {}
    return null;
  }

  function handleLine(raw) {
    var line = String(raw || '').trim();
    var low = line.toLowerCase();
    if (!low) return false;
    if (
      low === 'omni' ||
      low === 'elevate' ||
      low === 'power audit' ||
      low === 'power score' ||
      low === 'systems' ||
      low === 'omni status'
    ) {
      void elevate({ warmSearch: low === 'elevate' || low === 'omni' });
      return true;
    }
    if (/^omni\s+/.test(low) || /^search\s+world\s+/.test(low) || /^almighty\s+/.test(low)) {
      var q = line.replace(/^(omni|search\s+world|almighty)\s+/i, '').trim();
      void search(q || 'earth', { graphics: true });
      return true;
    }
    if (/^power\s+search\s+/i.test(low) || /^fuse\s+/i.test(low)) {
      var q2 = line.replace(/^(power\s+search|fuse)\s+/i, '').trim();
      void search(q2, { graphics: true });
      return true;
    }
    return false;
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snOmniHook) return;
      SNCli._snOmniHook = true;
      var prev = SNCli.run.bind(SNCli);
      SNCli.run = function (raw) {
        try {
          if (handleLine(raw)) return Promise.resolve(true);
        } catch (_) {}
        return prev(raw);
      };
    } catch (_) {}
  }

  // Elevate SNSearch.crawl when present
  function patchSearch() {
    try {
      if (!global.SNSearch || SNSearch._omniPatched) return;
      SNSearch._omniPatched = true;
      var prevCrawl = SNSearch.crawl && SNSearch.crawl.bind(SNSearch);
      SNSearch.crawl = async function (query, opts) {
        opts = opts || {};
        // Omni fusion first for knowledge / almighty
        if (opts.mode === 'knowledge' || opts.omni || opts.almighty) {
          var r = await search(query, {
            graphics: opts.openMap !== false,
            silent: !!opts.silent,
          });
          return {
            ok: true,
            query: query,
            nearby: r.spatial || [],
            places: r.spatial || [],
            knowledge: (r.items || []).filter(function (i) {
              return i.type === 'knowledge' || i.type === 'mind';
            }),
            count: (r.items || []).length,
            omni: true,
            ms: r.ms,
          };
        }
        if (prevCrawl) return prevCrawl(query, opts);
        return search(query, { mapOnly: true, graphics: opts.openMap !== false });
      };
      SNSearch.omni = search;
    } catch (_) {}
  }

  function init() {
    if (S.ready) return;
    S.ready = true;
    loadKg();
    installCli();
    patchSearch();
    setTimeout(installCli, 1500);
    setTimeout(patchSearch, 2000);
    setTimeout(installCli, 5000);
  }

  global.SNOmni = {
    build: BUILD,
    init: init,
    search: search,
    elevate: elevate,
    powerScore: powerScore,
    audit: elevateReport,
    ask: ask,
    handleLine: handleLine,
    project: projectGraphics,
    get last() {
      return S.lastResult;
    },
    get kg() {
      return S.kg;
    },
    get stats() {
      return S.stats;
    },
    get ready() {
      return S.ready;
    },
  };

  // aliases
  global.SNPower = global.SNOmni;
  global.AstranovOmni = global.SNOmni;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 80);
    });
  } else {
    setTimeout(init, 80);
  }
})(typeof window !== 'undefined' ? window : globalThis);
