/* SpaceNet Spatial — objects live at body+lat+lng (SPECS law · zero dummy seeds) */
(function (global) {
  'use strict';

  const KEY = 'sn:places-v1';

  const S = { places: [] };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      S.places = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(S.places)) S.places = [];
      // Drop legacy seed-* demo places (SPECS P0-D)
      const before = S.places.length;
      S.places = S.places.filter((p) => p && p.id && !String(p.id).startsWith('seed-') && !p.demo);
      if (S.places.length !== before) save();
    } catch (_) {
      S.places = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S.places.slice(-100)));
    } catch (_) {}
  }

  function get(id) {
    return S.places.find((p) => p.id === id) || null;
  }

  function put(place) {
    const row = {
      id: place.id || 'p_' + Date.now().toString(36),
      body: place.body || 'earth',
      lat: Number(place.lat),
      lng: Number(place.lng),
      kind: place.kind || 'file',
      emoji: place.emoji || '📌',
      name: String(place.name || 'Place').slice(0, 80),
      title: String(place.title || place.name || 'Place').slice(0, 100),
      text: place.text || '',
    };
    if (row.lat !== row.lat || row.lng !== row.lng) return null;
    const i = S.places.findIndex((p) => p.id === row.id);
    if (i >= 0) S.places[i] = row;
    else S.places.unshift(row);
    save();
    return row;
  }

  function open(id) {
    const p = get(id);
    if (!p) {
      global.SNCli?.log?.('place not found · put a place at real coords first', 'err');
      return null;
    }
    global.SNCli?.log?.((p.emoji || '📌') + ' ' + (p.title || p.name) + ' @ ' + (p.body || 'earth'), 'ok');
    if (p.text) {
      String(p.text)
        .split('\n')
        .forEach((ln) => global.SNCli?.log?.(ln, 'dim'));
    }
    // Real go: switch body globe + land + crawl (no dummy solar-only)
    if (global.SNCosmos?.go) {
      void global.SNCosmos.go(p.body || 'earth', p.lat, p.lng, {
        label: p.title || p.name,
        openMap: (p.body || 'earth') === 'earth',
      }).then(() => {
        global.SNCli?.preview?.(p.title || p.name);
      });
    } else if ((p.body || 'earth') === 'earth' && p.lat != null) {
      global.SNGlobe?.goToPlace?.(p.lat, p.lng, {
        tier: 'national',
        openMap: true,
        label: p.name,
      });
    }
    global.SNCli?.preview?.(p.title || p.name);
    return p;
  }

  function list() {
    return S.places.slice();
  }

  function init() {
    load();
  }

  global.SNSpatial = { init, put, get, open, list, SEEDS: [] };
})(window);
