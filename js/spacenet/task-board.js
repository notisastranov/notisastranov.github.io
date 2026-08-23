/**
 * SNTaskBoard — real driver task board
 *
 * - Task multi-tile: glowing deep-blue price · vendor/client name+address
 * - Map: all my task routes + center/zoom preview for selected task
 * - Match: score open tasks against existing routes (compatibility)
 * - Advise: traffic/event hints when scanning (best-effort)
 * - No demo sim · no train/sim-task shortcuts
 */
(function (global) {
  'use strict';

  var mapLayers = [];
  var selectedId = null;

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'ok');
    } catch (e) {}
  }

  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m).slice(0, 90));
    } catch (e) {}
  }

  function haversineKm(aLat, aLng, bLat, bLng) {
    var R = 6371;
    var dLat = ((bLat - aLat) * Math.PI) / 180;
    var dLng = ((bLng - aLng) * Math.PI) / 180;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((aLat * Math.PI) / 180) *
        Math.cos((bLat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }

  function prof(id) {
    if (!id || !global.SNProfiles) return null;
    try {
      return SNProfiles.get(id);
    } catch (e) {
      return null;
    }
  }

  function addrOf(p, lat, lng) {
    if (p && p.address) return String(p.address).slice(0, 80);
    if (p && p.shopAddress) return String(p.shopAddress).slice(0, 80);
    if (lat != null && lng != null) {
      return Number(lat).toFixed(4) + '°, ' + Number(lng).toFixed(4) + '°';
    }
    return '—';
  }

  function nameOf(p, fallback) {
    if (p) return String(p.shopName || p.name || fallback || '—').slice(0, 48);
    return String(fallback || '—').slice(0, 48);
  }

  /** Enrich task with vendor/client labels for tiles */
  function enrich(task) {
    if (!task) return null;
    var v = prof(task.vendorId);
    var c = prof(task.clientId);
    var vLat = task.lat;
    var vLng = task.lng;
    var cLat = task.drop_lat != null ? task.drop_lat : task.lat;
    var cLng = task.drop_lng != null ? task.drop_lng : task.lng;
    return {
      task: task,
      price: task.total_s != null ? Number(task.total_s) : task.driver_s != null ? Number(task.driver_s) : null,
      vendorName: nameOf(v, task.vendorName || task.targetName || 'Vendor'),
      vendorAddress: addrOf(v, vLat, vLng),
      clientName: nameOf(c, task.clientName || 'Client'),
      clientAddress: addrOf(c, cLat, cLng),
      pickup: { lat: vLat, lng: vLng },
      drop: { lat: cLat, lng: cLng },
    };
  }

  function priceHtml(n) {
    if (n == null || !isFinite(n)) return '<span class="sn-task-price sn-task-price-na">— S</span>';
    var s =
      global.SNCurrency && SNCurrency.format
        ? SNCurrency.format(n)
        : Number(n).toFixed(2) + ' S';
    return '<span class="sn-task-price">' + s + '</span>';
  }

  function ensureTaskCss() {
    if (document.getElementById('sn-task-tile-css')) return;
    var st = document.createElement('style');
    st.id = 'sn-task-tile-css';
    st.textContent = [
      '#sn-tile .sn-task-price{display:block;font:800 28px/1.1 ui-monospace,system-ui,sans-serif;',
      'color:#1a6fd4;letter-spacing:.04em;text-shadow:0 0 12px rgba(26,111,212,.95),',
      '0 0 28px rgba(61,158,255,.75),0 0 48px rgba(0,120,255,.45);margin:4px 0 10px}',
      '#sn-tile .sn-task-price-na{opacity:.5;font-size:20px}',
      '#sn-tile .sn-task-party{margin:0 0 8px;padding:8px 10px;border-radius:10px;',
      'background:rgba(0,20,48,.55);border:1px solid rgba(26,111,212,.35)}',
      '#sn-tile .sn-task-party b{display:block;color:#e8f4ff;font-size:13px;margin-bottom:2px}',
      '#sn-tile .sn-task-party span{display:block;color:#7a9cc8;font-size:11px;line-height:1.35}',
      '#sn-tile .sn-task-party .lbl{color:#3d9eff;font:700 9px system-ui;letter-spacing:.1em;',
      'text-transform:uppercase;margin-bottom:4px}',
      '#sn-tile .sn-task-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
      '#sn-tile .sn-task-actions button{flex:1;min-width:70px;padding:8px;border-radius:10px;',
      'border:1px solid rgba(61,158,255,.5);background:rgba(0,32,72,.7);color:#c8e4ff;',
      'font:700 11px system-ui;cursor:pointer}',
    ].join('');
    document.head.appendChild(st);
  }

  function openTaskTile(taskOrId) {
    ensureTaskCss();
    var task =
      typeof taskOrId === 'object'
        ? taskOrId
        : global.SNTasks && SNTasks.get
          ? SNTasks.get(taskOrId)
          : null;
    if (!task && global.SNTasks && SNTasks.list) {
      task = SNTasks.list({ all: true }).find(function (t) {
        return t && t.id === taskOrId;
      });
    }
    var e = enrich(task);
    if (!e) {
      log('No task · task list', 'dim');
      return false;
    }
    selectedId = e.task.id;
    // Build a synthetic profile shell so SNTile can host task content
    var shell = {
      id: 'task:' + e.task.id,
      name: e.task.title || 'Task',
      handle: '@task',
      bio: e.task.kind || 'delivery',
      roles: { driver: true, client: true },
      lat: e.pickup.lat,
      lng: e.pickup.lng,
      _taskBoard: e,
    };
    try {
      if (global.SNTile && SNTile.openTask) {
        SNTile.openTask(e);
      } else if (global.SNTile && SNTile.open) {
        // fallback: inject after open via render hook
        SNTile.open(shell, { tab: 'drive', taskBoard: e });
      }
    } catch (err) {
      log('Task tile · ' + (err.message || err), 'err');
    }
    void previewTaskOnMap(e.task, { fit: true, select: true });
    return true;
  }

  function clearMapLayers() {
    mapLayers.forEach(function (Lyr) {
      try {
        if (Lyr && Lyr.remove) Lyr.remove();
      } catch (e) {}
    });
    mapLayers = [];
  }

  async function routePoints(from, to) {
    if (!from || !to || from.lat == null || to.lat == null) return null;
    try {
      if (global.SNField && SNField.showRoute) {
        var row = await SNField.showRoute(
          [
            { lat: from.lat, lng: from.lng },
            { lat: to.lat, lng: to.lng },
          ],
          {
            id: 'taskboard:' + (from.lat + '-' + to.lat),
            label: 'task',
            kind: 'delivery',
            osrm: true,
            color: 'rgba(26,111,212,0.95)',
          }
        );
        return row;
      }
    } catch (e) {}
    return {
      points: [
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng },
      ],
      km: haversineKm(from.lat, from.lng, to.lat, to.lng),
      durationS: 600,
      speedKmh: 28,
      eta: '10m',
    };
  }

  /**
   * Paint ALL active task routes on city map; optionally focus one.
   * force camera fit only when user asks preview (forceFit).
   */
  async function previewTaskOnMap(task, opts) {
    opts = opts || {};
    var e = enrich(task);
    if (!e || e.pickup.lat == null) {
      log('Task has no coordinates', 'dim');
      return null;
    }
    // Ensure city map without thrashing if user holds — force only for explicit preview
    try {
      if (global.SNMap && SNMap.open) {
        if (!SNMap.active) {
          await SNMap.open(e.pickup.lat, e.pickup.lng, { force: !!opts.fit });
        }
      }
    } catch (e0) {}

    clearMapLayers();
    var map = global.SNMap && SNMap.map;
    if (!map || typeof L === 'undefined') {
      // still paint radar routes
      if (global.SNField && SNField.startDeliveryRoute) {
        void SNField.startDeliveryRoute({
          id: 'live:' + e.task.id,
          vendorLat: e.pickup.lat,
          vendorLng: e.pickup.lng,
          dropLat: e.drop.lat,
          dropLng: e.drop.lng,
          label: '📦 ' + String(e.task.title || '').slice(0, 10),
          driver: 'you',
        });
      }
      return e;
    }

    var all = (global.SNTasks && SNTasks.list({ all: true })) || [];
    all = all.filter(function (t) {
      return (
        t &&
        (t.status === 'open' || t.status === 'claimed' || t.status === 'in_progress') &&
        t.lat != null
      );
    });
    if (e.task && !all.find(function (t) {
      return t.id === e.task.id;
    })) {
      all.unshift(e.task);
    }

    var bounds = [];
    var i;
    for (i = 0; i < Math.min(all.length, 12); i++) {
      var en = enrich(all[i]);
      if (!en || en.pickup.lat == null) continue;
      var isSel = e.task && all[i].id === e.task.id;
      var row = await routePoints(en.pickup, en.drop);
      var pts = (row && row.points) || [en.pickup, en.drop];
      var latlngs = pts.map(function (p) {
        return [p.lat, p.lng];
      });
      latlngs.forEach(function (ll) {
        bounds.push(ll);
      });
      var poly = L.polyline(latlngs, {
        color: isSel ? '#1a6fd4' : '#3d9eff',
        weight: isSel ? 6 : 3,
        opacity: isSel ? 0.95 : 0.45,
        dashArray: isSel ? null : '6 8',
      }).addTo(map);
      mapLayers.push(poly);
      var m0 = L.circleMarker([en.pickup.lat, en.pickup.lng], {
        radius: isSel ? 8 : 5,
        color: '#22ff88',
        fillColor: '#22ff88',
        fillOpacity: 0.9,
      })
        .addTo(map)
        .bindPopup(
          '<b>' +
            en.vendorName +
            '</b><br/>' +
            en.vendorAddress +
            (en.price != null
              ? '<br/><span style="color:#1a6fd4;font-weight:800">' +
                (global.SNCurrency && SNCurrency.format
                  ? SNCurrency.format(en.price)
                  : en.price + ' S') +
                '</span>'
              : '')
        );
      mapLayers.push(m0);
      var m1 = L.circleMarker([en.drop.lat, en.drop.lng], {
        radius: isSel ? 8 : 5,
        color: '#ff4466',
        fillColor: '#ff4466',
        fillOpacity: 0.9,
      })
        .addTo(map)
        .bindPopup('<b>' + en.clientName + '</b><br/>' + en.clientAddress);
      mapLayers.push(m1);
    }

    if (opts.fit !== false && bounds.length >= 2) {
      try {
        // Explicit preview: force fit even if user held camera for task arrangement
        if (opts.fit === true || opts.force) {
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
        } else if (global.SNMap.canAutopilot && SNMap.canAutopilot()) {
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
        }
      } catch (eF) {}
    }

    try {
      if (global.SNMap.showTasks) SNMap.showTasks();
    } catch (eS) {}

    log(
      'Map · ' +
        all.length +
        ' task route(s) · selected ' +
        (e.task.title || e.task.id).slice(0, 32),
      'ok'
    );
    preview('Tasks on map · arrange routes');
    return e;
  }

  /** Score how well a candidate fits existing active routes (higher = better) */
  function scoreCompatibility(candidate, mine) {
    mine = mine || (global.SNTasks && SNTasks.list({ all: true })) || [];
    mine = mine.filter(function (t) {
      return (
        t &&
        t.id !== (candidate && candidate.id) &&
        (t.status === 'open' || t.status === 'claimed' || t.status === 'in_progress') &&
        t.lat != null
      );
    });
    if (!candidate || candidate.lat == null) return 0;
    if (!mine.length) return 50; // neutral when empty board
    var cPick = { lat: candidate.lat, lng: candidate.lng };
    var cDrop = {
      lat: candidate.drop_lat != null ? candidate.drop_lat : candidate.lat,
      lng: candidate.drop_lng != null ? candidate.drop_lng : candidate.lng,
    };
    var best = 0;
    mine.forEach(function (t) {
      var p1 = { lat: t.lat, lng: t.lng };
      var p2 = {
        lat: t.drop_lat != null ? t.drop_lat : t.lat,
        lng: t.drop_lng != null ? t.drop_lng : t.lng,
      };
      // Prefer candidates near existing pickups/drops or along corridor
      var d1 = haversineKm(cPick.lat, cPick.lng, p1.lat, p1.lng);
      var d2 = haversineKm(cPick.lat, cPick.lng, p2.lat, p2.lng);
      var d3 = haversineKm(cDrop.lat, cDrop.lng, p1.lat, p1.lng);
      var d4 = haversineKm(cDrop.lat, cDrop.lng, p2.lat, p2.lng);
      var minD = Math.min(d1, d2, d3, d4);
      var score = Math.max(0, 100 - minD * 25);
      if (score > best) best = score;
    });
    return Math.round(best);
  }

  function suggestCompatible(limit) {
    limit = limit || 8;
    var open = (global.SNTasks && SNTasks.list({ all: true })) || [];
    var mine = open.filter(function (t) {
      return t && (t.status === 'claimed' || t.status === 'in_progress');
    });
    var candidates = open.filter(function (t) {
      return t && t.status === 'open' && t.kind === 'delivery';
    });
    var scored = candidates
      .map(function (t) {
        return { task: t, score: scoreCompatibility(t, mine.length ? mine : open) };
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, limit);
    return scored;
  }

  function listCompatibleOnCli() {
    try {
      if (global.SNLaunch && SNLaunch.allows && !SNLaunch.allows('task')) {
        if (global.SNCli && SNCli.log)
          SNCli.log('Launcher off/standby · open tasks not thrown · set launcher green', 'dim');
        return [];
      }
    } catch (_) {}

    var scored = suggestCompatible(10);
    if (!scored.length) {
      log('No open delivery tasks · place an order or wait for jobs', 'dim');
      return;
    }
    log('── Tasks ranked for your routes (higher = better fit) ──', 'ok');
    scored.forEach(function (s, i) {
      var e = enrich(s.task);
      log(
        i +
          1 +
          '. [' +
          s.score +
          '] ' +
          (s.task.title || s.task.id).slice(0, 36) +
          (e.price != null
            ? ' · ' +
              (global.SNCurrency && SNCurrency.format
                ? SNCurrency.format(e.price)
                : e.price + ' S')
            : '') +
          ' · ' +
          e.vendorName +
          ' → ' +
          e.clientName,
        s.score >= 60 ? 'ok' : 'dim'
      );
    });
    preview('Compatible tasks · open / claim');
  }

  /** Best-effort traffic/event advise while driving/scanning */
  function adviseScan(lat, lng) {
    lat = lat != null ? lat : (global._snLastPos && global._snLastPos.lat) || 36.43;
    lng = lng != null ? lng : (global._snLastPos && global._snLastPos.lng) || 28.22;
    // Lightweight heuristic until live traffic feed: time-of-day + cluster of open tasks
    var h = new Date().getHours();
    var open = (global.SNTasks && SNTasks.list({ all: true })) || [];
    var near = open.filter(function (t) {
      return t && t.lat != null && haversineKm(lat, lng, t.lat, t.lng) < 1.2;
    });
    var tips = [];
    if (h >= 7 && h <= 9) tips.push('Morning peak · allow extra ETA on school corridors');
    if (h >= 13 && h <= 15) tips.push('Midday heat · prefer short hops along coast');
    if (h >= 17 && h <= 20) tips.push('Evening traffic · Old Town / port may clog');
    if (near.length >= 3)
      tips.push(
        'Dense task cluster nearby · batch pickups · ' + near.length + ' jobs in ~1 km'
      );
    if (!tips.length) tips.push('Scan clear · routes look normal for this hour');
    tips.forEach(function (t) {
      log('Advise · ' + t, 'dim');
    });
    try {
      if (global.SNFreeMind && SNFreeMind.think) SNFreeMind.think(tips[0], 'advise');
    } catch (e) {}
    preview(tips[0]);
    return tips;
  }

  global.SNTaskBoard = {
    enrich: enrich,
    openTaskTile: openTaskTile,
    previewTaskOnMap: previewTaskOnMap,
    scoreCompatibility: scoreCompatibility,
    suggestCompatible: suggestCompatible,
    listCompatibleOnCli: listCompatibleOnCli,
    adviseScan: adviseScan,
    clearMapLayers: clearMapLayers,
    priceHtml: priceHtml,
    get selectedId() {
      return selectedId;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
