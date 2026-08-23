/**
 * SNMarina — marina berth parking overlay (SPECS / yacht captain path)
 * OWNER LAW 2026-08-12: overlays ONLY after explicit CLI marina / marina <name>
 * window.SNMarina
 */
(function (global) {
  'use strict';
  var M = { layer: null, activeId: null, vendorMode: false, editEl: null, marinas: Object.create(null), bound: false };
  var api;
  function log(msg, cls) { try { if (global.SNCli && SNCli.log) SNCli.log(msg, cls || 'ok'); } catch (_) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function seedDefaults() {
    if (Object.keys(M.marinas).length) return;
    registerMarina({ id: 'marina-rhodes-mandraki', name: 'Mandraki Marina', lat: 36.4502, lng: 28.2241, radiusM: 180, rows: 4, cols: 6, bearing: 35, cellM: 14, vendorId: 'vendor-mandraki', basePrice: 45 });
    registerMarina({ id: 'marina-athens-flisvos', name: 'Flisvos Marina', lat: 37.9335, lng: 23.6865, radiusM: 220, rows: 5, cols: 8, bearing: 10, cellM: 16, vendorId: 'vendor-flisvos', basePrice: 80 });
  }
  function metersToLat(m) { return m / 111320; }
  function metersToLng(m, lat) { return m / (111320 * Math.cos((lat * Math.PI) / 180)); }
  function hash01(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  function buildBerths(marina) {
    var berths = [], rows = marina.rows || 4, cols = marina.cols || 6, cell = marina.cellM || 14;
    var bearing = ((marina.bearing || 0) * Math.PI) / 180, cos = Math.cos(bearing), sin = Math.sin(bearing);
    var rowLetters = 'ABCDEFGHJKLMNPQRST', halfW = ((cols - 1) * cell) / 2, halfH = ((rows - 1) * cell) / 2;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var lx = c * cell - halfW, ly = r * cell - halfH;
        var east = lx * cos - ly * sin, north = lx * sin + ly * cos;
        var lat = marina.lat + metersToLat(north), lng = marina.lng + metersToLng(east, marina.lat);
        var code = rowLetters[r] + String(c + 1).padStart(2, '0'), id = marina.id + ':' + code, h = hash01(id);
        var status = h < 0.55 ? 'free' : h < 0.72 ? 'held' : h < 0.95 ? 'occupied' : 'maintenance';
        var lengthM = Math.round(10 + (c % 4) * 4 + (r % 2) * 2);
        var price = Math.round((marina.basePrice || 50) * (1 + lengthM / 40) * (1 + (c > cols / 2 ? 0.15 : 0)) * 2) / 2;
        berths.push({ id: id, code: code, lat: lat, lng: lng, lengthM: lengthM, status: status, priceNight: price, updatedAt: Date.now() });
      }
    }
    return berths;
  }
  function registerMarina(opts) {
    opts = opts || {}; if (!opts.id || opts.lat == null || opts.lng == null) return null;
    var m = { id: String(opts.id), name: opts.name || 'Marina', lat: Number(opts.lat), lng: Number(opts.lng), radiusM: Number(opts.radiusM) || 200, rows: Number(opts.rows) || 4, cols: Number(opts.cols) || 6, bearing: Number(opts.bearing) || 0, cellM: Number(opts.cellM) || 14, vendorId: opts.vendorId || null, basePrice: Number(opts.basePrice) || 50, berths: null };
    m.berths = (opts.berths && opts.berths.length) ? opts.berths.slice() : buildBerths(m);
    M.marinas[m.id] = m; return m;
  }
  function distM(aLat, aLng, bLat, bLng) {
    var R = 6371000, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function nearestMarina(lat, lng, maxM) {
    maxM = maxM || 450; var best = null, bestD = maxM;
    Object.keys(M.marinas).forEach(function (id) { var m = M.marinas[id], d = distM(lat, lng, m.lat, m.lng); if (d < bestD) { bestD = d; best = m; } });
    return best;
  }
  function leaflet() { return global.L || null; }
  function getMap() {
    var apiM = global.SNMap; if (!apiM) return null;
    try { if (typeof apiM.getMap === 'function') { var m0 = apiM.getMap(); if (m0) return m0; } } catch (_) {}
    try { if (apiM.map) return apiM.map; } catch (_) {}
    return null;
  }
  function ensureLayer(map) {
    var L = leaflet(); if (!L || !map) return null;
    if (M.layer && map.hasLayer && map.hasLayer(M.layer)) return M.layer;
    if (M.layer) { try { map.removeLayer(M.layer); } catch (_) {} }
    M.layer = L.layerGroup().addTo(map); return M.layer;
  }
  function statusColor(st) {
    if (st === 'free') return { fill: '#1ad49a', stroke: '#8fffd4', text: '#0a2e22' };
    if (st === 'held') return { fill: '#e6b84d', stroke: '#ffe09a', text: '#2a1e00' };
    if (st === 'occupied') return { fill: '#3a5a8a', stroke: '#7a9acc', text: '#d8e8ff' };
    return { fill: '#5a3a4a', stroke: '#a08090', text: '#f0d8e0' };
  }
  function clearLayer() { if (M.layer) { try { M.layer.clearLayers(); } catch (_) {} } M.activeId = null; }
  function berthIcon(berth) {
    var L = leaflet(); if (!L) return null;
    var col = statusColor(berth.status);
    var price = berth.status === 'free' || berth.status === 'held' ? Math.round(berth.priceNight) + 'Æ' : berth.status === 'occupied' ? 'FULL' : '—';
    var html = '<div class="sn-berth-cell" data-status="' + esc(berth.status) + '" style="--fill:' + col.fill + ';--stroke:' + col.stroke + ';--fg:' + col.text + '"><b>' + esc(berth.code) + '</b><i>' + esc(price) + '</i><em>' + esc(berth.lengthM + 'm') + '</em></div>';
    return L.divIcon({ className: 'sn-berth-icon', html: html, iconSize: [52, 44], iconAnchor: [26, 22] });
  }
  function ensureCss() {
    if (document.getElementById('sn-marina-css')) return;
    var st = document.createElement('style'); st.id = 'sn-marina-css';
    st.textContent = '.sn-berth-icon{background:transparent!important;border:0!important}.sn-berth-cell{width:50px;height:42px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:pointer;background:var(--fill);border:1.5px solid var(--stroke);color:var(--fg);box-shadow:0 4px 14px rgba(0,0,0,.45);font-family:system-ui;line-height:1.05}.sn-berth-cell b{font:800 10px system-ui}.sn-berth-cell i{font:800 11px ui-monospace,monospace;font-style:normal}.sn-berth-cell em{font:600 8px system-ui;font-style:normal;opacity:.85}#sn-marina-banner{position:fixed;left:50%;top:56px;transform:translateX(-50%);z-index:108;max-width:min(94vw,340px);padding:8px 14px;border-radius:999px;background:rgba(2,18,52,.94);border:1.5px solid rgba(50,150,255,.65);color:#eaf4ff;font:700 11px system-ui;display:none;align-items:center;gap:10px}#sn-marina-banner.show{display:flex}#sn-marina-banner button{border:0;border-radius:999px;padding:6px 10px;font:700 10px system-ui;cursor:pointer;background:rgba(20,80,160,.55);color:#cfe6ff}#sn-marina-legend{position:fixed;left:10px;bottom:108px;z-index:107;display:none;flex-direction:column;gap:4px;padding:8px 10px;border-radius:16px;background:rgba(2,14,40,.88);border:1px solid rgba(50,140,255,.4);font:700 9px system-ui;color:#a8d0ff;pointer-events:none}#sn-marina-legend.show{display:flex}';
    document.head.appendChild(st);
  }
  function bannerEl() {
    var el = document.getElementById('sn-marina-banner');
    if (el) return el;
    el = document.createElement('div'); el.id = 'sn-marina-banner';
    el.innerHTML = '<span id="sn-marina-b-name">Marina</span><span id="sn-marina-b-meta"></span><button type="button" id="sn-marina-b-close">×</button>';
    document.body.appendChild(el);
    el.querySelector('#sn-marina-b-close').onclick = function () { hideOverlay(true); };
    return el;
  }
  function legendEl() {
    var el = document.getElementById('sn-marina-legend');
    if (el) return el;
    el = document.createElement('div'); el.id = 'sn-marina-legend';
    el.innerHTML = '<span>Free · Held · Occupied</span>';
    document.body.appendChild(el); return el;
  }
  function freeCount(marina) { var n = 0; (marina.berths || []).forEach(function (b) { if (b.status === 'free') n++; }); return n; }
  function showOverlay(marina) {
    if (!(api && api._userIntent)) { hideOverlay(true); return false; }
    ensureCss(); var map = getMap(), L = leaflet();
    if (!map || !L || !marina) return false;
    var layer = ensureLayer(map); if (!layer) return false;
    layer.clearLayers(); M.activeId = marina.id;
    try { L.circle([marina.lat, marina.lng], { radius: marina.radiusM || 200, color: 'rgba(61,158,255,0.7)', weight: 1.5, fillColor: 'rgba(20,80,180,0.12)', fillOpacity: 0.35, interactive: false }).addTo(layer); } catch (_) {}
    (marina.berths || []).forEach(function (berth) {
      var icon = berthIcon(berth); if (!icon) return;
      var mk = L.marker([berth.lat, berth.lng], { icon: icon, interactive: true, zIndexOffset: 400 });
      mk.on('click', function () { log(berth.code + ' · ' + berth.status + ' · ' + berth.priceNight + ' Æ', 'ok'); });
      mk.addTo(layer);
    });
    var ban = bannerEl(); ban.classList.add('show');
    ban.querySelector('#sn-marina-b-name').textContent = marina.name;
    ban.querySelector('#sn-marina-b-meta').textContent = freeCount(marina) + ' free · ' + (marina.berths || []).length + ' berths';
    legendEl().classList.add('show');
    return true;
  }
  function hideOverlay(soft) {
    clearLayer();
    var ban = document.getElementById('sn-marina-banner'); if (ban) ban.classList.remove('show');
    var leg = document.getElementById('sn-marina-legend'); if (leg) leg.classList.remove('show');
    try { api._userIntent = false; } catch (_) {}
  }
  function refreshFromMap() {
    // OWNER LAW: never auto-paint without explicit CLI intent
    if (!(api && api._userIntent)) { hideOverlay(true); return; }
    var map = getMap(); if (!map || !map.getCenter) { hideOverlay(true); return; }
    var z = map.getZoom ? map.getZoom() : 0; if (z < 15.5) { if (M.activeId) hideOverlay(true); return; }
    var c = map.getCenter(); var marina = nearestMarina(c.lat, c.lng, 500);
    if (!marina) { if (M.activeId) hideOverlay(true); return; }
    var d = distM(c.lat, c.lng, marina.lat, marina.lng);
    if (d > (marina.radiusM || 200) * 1.8) { if (M.activeId) hideOverlay(true); return; }
    showOverlay(marina);
  }
  function bindMap() {
    if (M.bound) return; var map = getMap(); if (!map || !map.on) return;
    M.bound = true; map.on('moveend', refreshFromMap); map.on('zoomend', refreshFromMap);
  }
  function openMarina(idOrName) {
    seedDefaults();
    api._userIntent = true;
    var m = null, q = String(idOrName || '').toLowerCase();
    Object.keys(M.marinas).forEach(function (id) {
      var x = M.marinas[id];
      if (id === idOrName || (x.name && x.name.toLowerCase().indexOf(q) >= 0) || id.toLowerCase().indexOf(q) >= 0) m = x;
    });
    if (!m) m = M.marinas['marina-rhodes-mandraki'] || Object.values(M.marinas)[0];
    if (!m) return false;
    if (!m.berths || !m.berths.length) m.berths = buildBerths(m);
    function paintWhenReady(attempt) {
      attempt = attempt || 0;
      try {
        bindMap(); var map = getMap();
        if (map && leaflet()) {
          try { if (map.setView) map.setView([m.lat, m.lng], 18, { animate: false }); } catch (_) {}
          if (showOverlay(m)) { log('Marina · ' + m.name + ' · ' + freeCount(m) + ' free', 'ok'); return; }
        }
      } catch (_) {}
      if (attempt < 10) setTimeout(function () { paintWhenReady(attempt + 1); }, 250);
    }
    try {
      if (global.SNMap && SNMap.open) void Promise.resolve(SNMap.open(m.lat, m.lng, { zoom: 18 })).then(function () { paintWhenReady(0); });
      else paintWhenReady(0);
    } catch (_) { paintWhenReady(0); }
    return true;
  }
  function handleLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;
    if (low === 'marina off' || low === 'marina hide' || low === 'marina clear' || low === 'clear marina' || low === 'berths off' || low === 'overlay clear') {
      hideOverlay(true); log('Marina overlay OFF', 'ok'); return true;
    }
    if (low === 'marina' || low === 'marinas' || low === 'berths' || low === 'parking marina') { openMarina('mandraki'); return true; }
    if (/^marina\s+/.test(low) || /^berths?\s+/.test(low)) { openMarina(low.replace(/^(marina|berths?)\s+/, '')); return true; }
    return false;
  }
  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snMarinaBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        var low = String(raw || '').trim().toLowerCase();
        try {
          if (/^(marina|marinas|berths?|parking marina|marina off|marina hide|marina clear|clear marina|berths off|overlay clear)\b/i.test(low) || /^marina\s+/i.test(low)) {
            var h = await handleLine(raw); if (h) return;
          }
        } catch (_) {}
        return orig(raw);
      };
      SNCli._snMarinaBound = SNCli.run;
    } catch (_) {}
  }
  function init() {
    ensureCss(); seedDefaults(); installCli();
    [600, 1500, 3000].forEach(function (ms) { setTimeout(function () { installCli(); try { bindMap(); } catch (_) {} }, ms); });
  }
  api = {
    init: init, _userIntent: false, registerMarina: registerMarina, openMarina: openMarina,
    showOverlay: showOverlay, hideOverlay: hideOverlay, refresh: refreshFromMap, handleLine: handleLine,
    list: function () { return Object.keys(M.marinas).map(function (id) { return M.marinas[id]; }); },
    get: function (id) { return M.marinas[id] || null; },
  };
  global.SNMarina = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
