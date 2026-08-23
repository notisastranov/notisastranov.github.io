/**
 * SNMeshPeers — global ops peer mesh layer
 * Ported carefully from Grok Build React SpaceNet demo (2026-08-01).
 *
 * ADDITIVE ONLY — does not touch:
 *   · globe inertia / velX·velY / damp
 *   · one-finger CLI drag / free dock
 *   · zoom tiers / SPACENET dive grid
 *   · field miner / currency (AC) / marketplace juice
 *
 * Uses public SNGlobe API only: pulse · flyNear · clearMarkers.
 * CLI: peers · peer <city> · layers · hide|show friends|competitors|vendors|routes
 */
(function (global) {
  'use strict';

  var ROLE_COLOR = {
    self: '#f0f0f2',
    friend: '#7dcea0',
    competitor: '#e8a87c',
    vendor: '#8eb4d4',
  };

  var PEERS = [
    { id: 'self-athens', name: 'Node · Athens', city: 'Athens', region: 'GR · origin', lat: 37.9838, lon: 23.7275, role: 'self', capacity: 72, rateAC: 0.42, latencyMs: 0, status: 'online' },
    { id: 'friend-lisbon', name: 'Mesh · Lisbon', city: 'Lisbon', region: 'PT · friend', lat: 38.7223, lon: -9.1393, role: 'friend', capacity: 64, rateAC: 0.31, latencyMs: 48, status: 'routing' },
    { id: 'friend-reykjavik', name: 'Mesh · Reykjavík', city: 'Reykjavík', region: 'IS · friend', lat: 64.1466, lon: -21.9426, role: 'friend', capacity: 58, rateAC: 0.28, latencyMs: 62, status: 'online' },
    { id: 'friend-singapore', name: 'Mesh · Singapore', city: 'Singapore', region: 'SG · friend', lat: 1.3521, lon: 103.8198, role: 'friend', capacity: 88, rateAC: 0.55, latencyMs: 145, status: 'routing' },
    { id: 'comp-tokyo', name: 'Edge · Tokyo', city: 'Tokyo', region: 'JP · competitor', lat: 35.6762, lon: 139.6503, role: 'competitor', capacity: 91, rateAC: 0.61, latencyMs: 210, status: 'online' },
    { id: 'comp-nyc', name: 'Edge · New York', city: 'New York', region: 'US · competitor', lat: 40.7128, lon: -74.006, role: 'competitor', capacity: 85, rateAC: 0.52, latencyMs: 118, status: 'idle' },
    { id: 'vendor-dublin', name: 'Vendor · Dublin', city: 'Dublin', region: 'IE · index', lat: 53.3498, lon: -6.2603, role: 'vendor', capacity: 76, rateAC: 0.39, latencyMs: 52, status: 'routing' },
    { id: 'vendor-cape', name: 'Vendor · Cape Town', city: 'Cape Town', region: 'ZA · storage', lat: -33.9249, lon: 18.4241, role: 'vendor', capacity: 54, rateAC: 0.22, latencyMs: 168, status: 'online' },
    { id: 'friend-vancouver', name: 'Mesh · Vancouver', city: 'Vancouver', region: 'CA · friend', lat: 49.2827, lon: -123.1207, role: 'friend', capacity: 67, rateAC: 0.34, latencyMs: 178, status: 'online' },
    { id: 'comp-sydney', name: 'Edge · Sydney', city: 'Sydney', region: 'AU · competitor', lat: -33.8688, lon: 151.2093, role: 'competitor', capacity: 70, rateAC: 0.36, latencyMs: 245, status: 'idle' },
  ];

  var ROUTES = [
    { id: 'r1', from: 'self-athens', to: 'friend-lisbon', load: 0.72 },
    { id: 'r2', from: 'self-athens', to: 'vendor-dublin', load: 0.55 },
    { id: 'r3', from: 'self-athens', to: 'friend-reykjavik', load: 0.4 },
    { id: 'r4', from: 'friend-lisbon', to: 'comp-nyc', load: 0.48 },
    { id: 'r5', from: 'vendor-dublin', to: 'comp-nyc', load: 0.35 },
    { id: 'r6', from: 'self-athens', to: 'vendor-cape', load: 0.3 },
    { id: 'r7', from: 'friend-singapore', to: 'comp-tokyo', load: 0.66 },
    { id: 'r8', from: 'friend-singapore', to: 'comp-sydney', load: 0.42 },
    { id: 'r9', from: 'self-athens', to: 'friend-singapore', load: 0.5 },
    { id: 'r10', from: 'comp-nyc', to: 'friend-vancouver', load: 0.38 },
    { id: 'r11', from: 'vendor-cape', to: 'friend-singapore', load: 0.28 },
  ];

  var layers = { friend: true, competitor: true, vendor: true, routes: true };
  var selectedId = 'self-athens';
  var timer = null;
  var wrapped = false;
  var ready = false;

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
    } catch (_) {}
  }

  function byId(id) {
    for (var i = 0; i < PEERS.length; i++) if (PEERS[i].id === id) return PEERS[i];
    return null;
  }

  function findPeer(q) {
    var s = String(q || '').toLowerCase().trim();
    if (!s) return null;
    for (var i = 0; i < PEERS.length; i++) {
      var p = PEERS[i];
      if (
        p.city.toLowerCase().indexOf(s) >= 0 ||
        p.name.toLowerCase().indexOf(s) >= 0 ||
        p.id.toLowerCase().indexOf(s) >= 0 ||
        p.role.toLowerCase() === s
      )
        return p;
    }
    return null;
  }

  function visiblePeers() {
    return PEERS.filter(function (p) {
      if (p.role === 'self') return true;
      if (p.role === 'friend') return !!layers.friend;
      if (p.role === 'competitor') return !!layers.competitor;
      if (p.role === 'vendor') return !!layers.vendor;
      return true;
    });
  }

  function paint() {
    var G = global.SNGlobe;
    if (!G || !G.ready || !G.pulse) return;
    try {
      if (G.clearMarkers) G.clearMarkers();
    } catch (_) {}

    visiblePeers().forEach(function (p) {
      var color = ROLE_COLOR[p.role] || '#8eb4d4';
      var ms = p.id === selectedId ? 14000 : 9000;
      try {
        G.pulse(p.lat, p.lon, color, p.city, ms);
      } catch (_) {}
    });

    if (layers.routes) {
      ROUTES.forEach(function (r) {
        if (selectedId && r.from !== selectedId && r.to !== selectedId) return;
        var a = byId(r.from);
        var b = byId(r.to);
        if (!a || !b) return;
        try {
          G.pulse(a.lat, a.lon, '#c8d8ea', null, 6000);
          G.pulse(b.lat, b.lon, '#c8d8ea', null, 6000);
        } catch (_) {}
      });
    }
  }

  function focusPeer(p) {
    if (!p) return 'no peer';
    selectedId = p.id;
    var G = global.SNGlobe;
    try {
      if (G && G.flyNear) G.flyNear(p.lat, p.lon, 'national');
      if (G && G.setFocus) G.setFocus(p.lat, p.lon);
      if (G && G.setHud) G.setHud(p.name + ' · ' + p.role + ' · cap ' + p.capacity);
    } catch (_) {}
    paint();
    return (
      'focused ' +
      p.city +
      ' · ' +
      p.role +
      ' · cap ' +
      p.capacity +
      ' · ' +
      p.latencyMs +
      'ms'
    );
  }

  function layerStatus() {
    return Object.keys(layers)
      .map(function (k) {
        return k + ':' + (layers[k] ? 'on' : 'off');
      })
      .join(' · ');
  }

  function listPeers() {
    return visiblePeers()
      .map(function (p) {
        return (
          p.city +
          ' [' +
          p.role +
          '] ' +
          p.status +
          ' · cap ' +
          p.capacity +
          (p.id === selectedId ? ' · focus' : '')
        );
      })
      .join('\n');
  }

  function tryCommand(raw) {
    var text = String(raw || '').trim();
    if (!text) return null;
    var low = text.toLowerCase();
    var parts = low.split(/\s+/);
    var cmd = parts[0] || '';
    var arg = parts.slice(1).join(' ');

    if (cmd === 'peers' || cmd === 'meshpeers' || cmd === 'ops') {
      if (!arg || arg === 'list') return listPeers();
      if (arg === 'paint' || arg === 'show') {
        paint();
        return 'mesh peers painted · ' + visiblePeers().length + ' nodes';
      }
      if (arg === 'help') {
        return 'peers · peer <city> · layers · hide|show friends|competitors|vendors|routes · focus <city>';
      }
      var hit = findPeer(arg);
      if (hit) return focusPeer(hit);
      return 'peers list|paint|help · or peers <city>';
    }

    if (cmd === 'peer' || cmd === 'node') {
      if (!arg) return 'peer <city>';
      var p = findPeer(arg);
      if (!p) return 'no peer matching "' + arg + '"';
      return focusPeer(p);
    }

    if (cmd === 'layers' || cmd === 'layer') {
      return layerStatus();
    }

    if (cmd === 'hide' || cmd === 'show') {
      var on = cmd === 'show';
      var map = {
        friends: 'friend',
        friend: 'friend',
        competitors: 'competitor',
        competitor: 'competitor',
        vendors: 'vendor',
        vendor: 'vendor',
        routes: 'routes',
        route: 'routes',
      };
      var key = map[arg];
      if (!key) return null;
      layers[key] = on;
      paint();
      return key + ' ' + (on ? 'shown' : 'hidden');
    }

    if (parts.length === 1) {
      var only = findPeer(low);
      if (only && (only.city.toLowerCase() === low || only.id.toLowerCase() === low)) {
        return focusPeer(only);
      }
    }

    if ((cmd === 'focus' || cmd === 'goto' || cmd === 'find') && arg) {
      var fp = findPeer(arg);
      if (fp) return focusPeer(fp);
      return null;
    }

    return null;
  }

  function wrapCli() {
    if (wrapped) return;
    var cli = global.SNCli;
    if (!cli || typeof cli.run !== 'function') return;
    var orig = cli.run.bind(cli);
    cli.run = function (raw) {
      try {
        var handled = tryCommand(raw);
        if (handled != null) {
          try {
            cli.log(handled, 'ok');
          } catch (_) {}
          return Promise.resolve(handled);
        }
      } catch (e) {
        console.warn('[SNMeshPeers] cmd', e);
      }
      return orig(raw);
    };
    wrapped = true;
  }

  function init() {
    if (ready) return true;
    ready = true;
    wrapCli();
    var tries = 0;
    var w = setInterval(function () {
      wrapCli();
      if (wrapped || ++tries > 20) clearInterval(w);
    }, 400);

    var gtries = 0;
    var g = setInterval(function () {
      if (global.SNGlobe && SNGlobe.ready) {
        paint();
        clearInterval(g);
        log('Mesh peers · ' + PEERS.length + ' nodes · type: peers', 'dim');
      } else if (++gtries > 40) clearInterval(g);
    }, 500);

    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (document.hidden) return;
      if (global.SNGlobe && SNGlobe.ready) paint();
    }, 8000);

    return true;
  }

  global.SNMeshPeers = {
    init: init,
    paint: paint,
    peers: function () {
      return PEERS.slice();
    },
    routes: function () {
      return ROUTES.slice();
    },
    layers: function () {
      return Object.assign({}, layers);
    },
    setLayer: function (key, on) {
      if (!(key in layers)) return false;
      layers[key] = !!on;
      paint();
      return true;
    },
    focus: function (q) {
      return focusPeer(findPeer(q));
    },
    tryCommand: tryCommand,
    source: 'grok-build-spacenet-2026-08-01',
  };
})(typeof window !== 'undefined' ? window : globalThis);
