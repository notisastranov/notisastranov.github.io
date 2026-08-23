/**
 * SNEvent — Cursor-on-Target style geospatial event bus
 * =====================================================
 * Apocalypse-ready shared language for SpaceNet.
 * Every map object / peer / offer / blip is an event with stale time.
 *
 * Build: 20260812160000-apocalypse-event
 */
(function (global) {
  'use strict';
  var BUILD = '20260812160000-apocalypse-event';
  if (global.__SN_EVENT === BUILD) return;
  global.__SN_EVENT = BUILD;

  var STORE_KEY = 'sn:events-v1';
  var MAX_STORE = 400;
  var listeners = [];
  var byUid = Object.create(null);

  function nowIso() {
    return new Date().toISOString();
  }

  function uid() {
    return 'sn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  var TYPE = {
    SELF: 'a-f-G-U-C',
    PEER: 'a-f-G-U-C-peer',
    DRIVER: 'a-f-G-U-C-driver',
    VENDOR: 'a-n-G-U-C-vendor',
    CLIENT: 'a-n-G-U-C-client',
    OFFER: 'b-m-p-s-p-offer',
    ORDER: 'b-m-p-s-p-order',
    ROUTE: 'u-d-f-route',
    POLY: 'u-d-f-poly',
    HAZARD: 'a-h-G-U-C-hazard',
    RADAR: 'b-m-p-s-p-radar',
    CHAT: 'b-t-f-chat',
    SENSOR: 'a-n-G-E-sensor',
    PACKAGE: 'b-m-p-s-p-pack',
  };

  function make(partial) {
    var t = Date.now();
    var staleMs = partial.staleMs != null ? Number(partial.staleMs) : 120000;
    return {
      uid: partial.uid || uid(),
      type: partial.type || TYPE.PEER,
      lat: partial.lat != null ? Number(partial.lat) : null,
      lng: partial.lng != null ? Number(partial.lng) : null,
      alt: partial.alt != null ? Number(partial.alt) : 0,
      how: partial.how || 'm-g',
      time: partial.time || nowIso(),
      start: partial.start || nowIso(),
      stale: partial.stale || new Date(t + staleMs).toISOString(),
      staleMs: staleMs,
      callsign: partial.callsign || '',
      from: partial.from || nodeId(),
      detail: partial.detail && typeof partial.detail === 'object' ? partial.detail : {},
      v: 1,
    };
  }

  function nodeId() {
    try {
      var id = localStorage.getItem('sn:node-id');
      if (id) return id;
      id = 'node-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('sn:node-id', id);
      return id;
    } catch (_) {
      return 'node-ephemeral';
    }
  }

  function isStale(ev) {
    if (!ev || !ev.stale) return true;
    try {
      return Date.parse(ev.stale) <= Date.now();
    } catch (_) {
      return true;
    }
  }

  function persist() {
    try {
      var arr = Object.keys(byUid)
        .map(function (k) {
          return byUid[k];
        })
        .filter(function (e) {
          return e && !isStale(e);
        })
        .slice(-MAX_STORE);
      localStorage.setItem(STORE_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  function load() {
    try {
      var arr = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(arr)) return;
      arr.forEach(function (e) {
        if (e && e.uid && !isStale(e)) byUid[e.uid] = e;
      });
    } catch (_) {}
  }

  function colorFor(ev) {
    var t = String(ev.type || '');
    if (t.indexOf('driver') >= 0) return '#7dcea0';
    if (t.indexOf('vendor') >= 0) return '#8eb4d4';
    if (t.indexOf('client') >= 0) return '#c9a0ff';
    if (t.indexOf('hazard') >= 0) return '#e87070';
    if (t.indexOf('offer') >= 0 || t.indexOf('order') >= 0) return '#ffd48a';
    if (t.indexOf('chat') >= 0) return '#7ec8ff';
    return '#3d9eff';
  }

  function publish(partial, opts) {
    opts = opts || {};
    var ev = make(partial);
    var prev = byUid[ev.uid];
    byUid[ev.uid] = ev;
    persist();
    if (!opts.silent) {
      listeners.forEach(function (fn) {
        try {
          fn(ev, prev);
        } catch (_) {}
      });
    }
    try {
      if (!opts.localOnly && global.SNMeshNet && SNMeshNet.broadcastEvent)
        SNMeshNet.broadcastEvent(ev);
    } catch (_) {}
    try {
      if (ev.lat != null && ev.lng != null && global.SNGlobe && SNGlobe.pulse)
        SNGlobe.pulse(ev.lat, ev.lng, { color: colorFor(ev), ms: 900 });
    } catch (_) {}
    return ev;
  }

  function ingest(raw, opts) {
    opts = opts || {};
    if (!raw || typeof raw !== 'object' || !raw.uid) return null;
    var existing = byUid[raw.uid];
    if (existing && existing.time && raw.time && Date.parse(raw.time) <= Date.parse(existing.time))
      return existing;
    byUid[raw.uid] = raw;
    persist();
    if (!opts.silent) {
      listeners.forEach(function (fn) {
        try {
          fn(raw, existing);
        } catch (_) {}
      });
    }
    return raw;
  }

  function get(uidStr) {
    return byUid[uidStr] || null;
  }

  function active(filterType) {
    var out = [];
    Object.keys(byUid).forEach(function (k) {
      var e = byUid[k];
      if (!e || isStale(e)) return;
      if (filterType && String(e.type).indexOf(filterType) < 0) return;
      out.push(e);
    });
    return out;
  }

  function purgeStale() {
    var n = 0;
    Object.keys(byUid).forEach(function (k) {
      if (isStale(byUid[k])) {
        delete byUid[k];
        n++;
      }
    });
    if (n) persist();
    return n;
  }

  function on(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function off() {
      listeners = listeners.filter(function (x) {
        return x !== fn;
      });
    };
  }

  function selfPLI(pos, extra) {
    pos = pos || {};
    var lat = pos.lat != null ? pos.lat : global._snLastPos && global._snLastPos.lat;
    var lng = pos.lng != null ? pos.lng : global._snLastPos && global._snLastPos.lng;
    return publish(
      {
        uid: 'pli-' + nodeId(),
        type: TYPE.SELF,
        lat: lat,
        lng: lng,
        callsign: (extra && extra.callsign) || 'self',
        staleMs: 45000,
        detail: Object.assign({ role: 'self', node: nodeId() }, extra || {}),
      },
      { localOnly: !!(extra && extra.localOnly) }
    );
  }

  load();
  setInterval(purgeStale, 20000);

  global.SNEvent = {
    build: BUILD,
    TYPE: TYPE,
    make: make,
    publish: publish,
    ingest: ingest,
    get: get,
    active: active,
    purgeStale: purgeStale,
    isStale: isStale,
    on: on,
    nodeId: nodeId,
    selfPLI: selfPLI,
    colorFor: colorFor,
  };
  global.SNBus = global.SNEvent;
})(typeof window !== 'undefined' ? window : globalThis);
