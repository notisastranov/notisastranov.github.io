/**
 * SNMeshOrders — production multi-device marketplace mesh
 * Local S settlement stays authoritative for guests.
 * Network layer: pull open Supabase orders → map tasks; broadcast via live-bridge;
 * best-effort order-intake when vendor menus exist.
 *
 * SPECS: S primary · 3% vault · 15% driver · 24/7 · real shops first · no NPC flood
 */
(function (global) {
  'use strict';

  var pollTimer = null;
  var pollMs = 18000;
  var lastPull = 0;
  var lastNetIds = {};

  function cfg() {
    return global.SN_CONFIG || {};
  }

  function base() {
    return String(cfg().sbUrl || global.SB_URL || '').replace(/\/$/, '');
  }

  function headers(json) {
    var c = cfg();
    var h = {
      apikey: c.sbKey || global.SB_KEY || '',
      Authorization: 'Bearer ' + (c.sbKey || global.SB_KEY || ''),
    };
    if (json) h['Content-Type'] = 'application/json';
    // Prefer user JWT when signed in
    try {
      if (global.SNAuth && SNAuth.session && SNAuth.session.access_token) {
        h.Authorization = 'Bearer ' + SNAuth.session.access_token;
      } else if (global.SNAuth && SNAuth.authHeadersSync) {
        var ah = SNAuth.authHeadersSync();
        if (ah && ah.Authorization) h.Authorization = ah.Authorization;
      }
    } catch (_) {}
    return h;
  }

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
    } catch (_) {}
  }

  function haversineKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 999;
    var R = 6371;
    var dLat = ((b.lat - a.lat) * Math.PI) / 180;
    var dLng = ((b.lng - a.lng) * Math.PI) / 180;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function pos() {
    return (
      global._snLastPos ||
      (global.SNTasks && SNTasks.pos) ||
      (global.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) || {
        lat: 36.4341,
        lng: 28.2176,
      }
    );
  }

  function isUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(id || '')
    );
  }

  /** Strip local profile prefix v_ for network vendor ids */
  function networkVendorId(localId) {
    var s = String(localId || '');
    if (s.indexOf('v_') === 0) {
      var raw = s.slice(2).replace(/_/g, '-');
      // profiles store uuid with underscores sometimes
      if (isUuid(raw)) return raw;
      // try restore hyphens in uuid form
      var hex = s.slice(2).replace(/[^a-f0-9]/gi, '');
      if (hex.length === 32) {
        return (
          hex.slice(0, 8) +
          '-' +
          hex.slice(8, 12) +
          '-' +
          hex.slice(12, 16) +
          '-' +
          hex.slice(16, 20) +
          '-' +
          hex.slice(20)
        );
      }
    }
    if (isUuid(s)) return s;
    return null;
  }

  /**
   * Pull open network orders near focus into SNTasks (driver marketplace).
   */
  var lastPullAt = 0;
  async function pullOpenOrders(opts) {
    opts = opts || {};
    // debounce 15s unless force
    if (!opts.force && Date.now() - lastPullAt < 15000) {
      return { ok: true, debounced: true, count: 0 };
    }
    lastPullAt = Date.now();

    var p = opts.pos || pos();
    var url =
      base() +
      '/rest/v1/orders?select=id,short_id,status,vendor_id,vendor_name,items,calc,delivery_lat,delivery_lng,delivery_address,notes,driver_id,driver_name,created_at' +
      '&status=in.(seeking_driver,pending,assigned)' +
      '&order=created_at.desc&limit=40';
    if (!base()) return { ok: false, error: 'no network', count: 0 };
    var rows = [];
    try {
      var r = await fetch(url, { headers: headers(false), cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      rows = await r.json();
      if (!Array.isArray(rows)) rows = [];
    } catch (e) {
      if (!opts.quiet) log('Mesh · network read fail · ' + (e.message || e), 'dim');
      return { ok: false, error: String(e.message || e), count: 0 };
    }

    var maxKm = opts.maxKm != null ? opts.maxKm : 40;
    var near = rows.filter(function (o) {
      if (o.delivery_lat == null || o.delivery_lng == null) return true;
      return haversineKm(p, { lat: o.delivery_lat, lng: o.delivery_lng }) <= maxKm;
    });

    var imported = 0;
    near.forEach(function (o) {
      if (!global.SNTasks || !SNTasks.create) return;
      var tid = 'net_' + String(o.id || o.short_id).replace(/[^a-z0-9_-]/gi, '').slice(0, 36);
      if (SNTasks.get && SNTasks.get(tid) && SNTasks.get(tid).status === 'done') return;
      var calc = o.calc || {};
      var total =
        Number(calc.total_avc != null ? calc.total_avc : calc.total != null ? calc.total : 0) || 0;
      var items = Array.isArray(o.items) ? o.items : [];
      var title =
        '🌐 ' +
        (o.short_id || 'NET') +
        ' · ' +
        (items
          .map(function (i) {
            return i.name;
          })
          .slice(0, 2)
          .join(', ') ||
          o.vendor_name ||
          'order') +
        (total ? ' · ' + total + ' S' : '');
      var existing = SNTasks.get && SNTasks.get(tid);
      if (existing) {
        existing.title = title;
        existing.status =
          o.status === 'assigned'
            ? 'claimed'
            : o.status === 'seeking_driver' || o.status === 'pending'
              ? 'open'
              : existing.status;
        existing.networkStatus = o.status;
        lastNetIds[tid] = Date.now();
        return;
      }
      try {
        SNTasks.create({
          id: tid,
          kind: 'delivery',
          role: 'driver',
          title: title,
          status: o.status === 'assigned' ? 'claimed' : 'open',
          lat: o.delivery_lat != null ? o.delivery_lat : p.lat,
          lng: o.delivery_lng != null ? o.delivery_lng : p.lng,
          drop_lat: o.delivery_lat,
          drop_lng: o.delivery_lng,
          vendorId: o.vendor_id,
          vendorName: o.vendor_name || null,
          items: items,
          total_s: total || null,
          platform_fee_s: Number(calc.platform_fee_s || calc.platform_fee_eur) || null,
          driver_s: Number(calc.driver_s || calc.driver_payout_eur) || null,
          vendor_s: Number(calc.vendor_s || calc.vendor_fee) || null,
          notes: 'network · ' + (o.notes || o.status || ''),
          always_on: true,
          networkId: o.id,
          networkShort: o.short_id,
          networkStatus: o.status,
          source: 'spacenet-mesh',
        });
        imported++;
        lastNetIds[tid] = Date.now();
      } catch (_) {}
    });

    lastPull = Date.now();
    if (imported && !opts.quiet) {
      log('Mesh · ' + imported + ' network deliveries on map · claim / task list', 'ok');
    }
    try {
      if (global.SNMap && SNMap.showTasks) SNMap.showTasks();
      if (global.SNField && SNField.refreshRoutes) void SNField.refreshRoutes(true);
    } catch (_) {}
    return { ok: true, count: near.length, imported: imported, total: rows.length };
  }

  async function upsertVendor(vendor) {
    if (!vendor || !base()) return null;
    var osm =
      vendor.osm_id ||
      vendor.osmId ||
      (vendor.id && String(vendor.id).indexOf('osm:') === 0 ? String(vendor.id).slice(4) : null);
    var vid = String(
      vendor.dbId ||
        (isUuid(vendor.id) ? vendor.id : '') ||
        (osm ? 'osm:' + String(osm).replace(/[^\w:-]/g, '') : '') ||
        'shop-' +
          String(vendor.shopName || vendor.name || 'shop')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 24)
    );
    var row = {
      id: vid,
      name: String(vendor.shopName || vendor.name || 'Shop').slice(0, 80),
      emoji: vendor.emoji || '🍕',
      category: vendor.shopKind || vendor.category || 'pizza',
      lat: Number(vendor.lat),
      lng: Number(vendor.lng),
      is_active: true,
      delivery_enabled: true,
      delivery_radius_km: 8,
      items: vendor.menu || vendor.items || [],
    };
    if (osm) row.osm_id = String(osm);
    try {
      var r = await fetch(base() + '/rest/v1/vendors?on_conflict=id', {
        method: 'POST',
        headers: Object.assign(headers(true), {
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(row),
      });
      var j = await r.json().catch(function () {
        return null;
      });
      if (r.ok) {
        var saved = Array.isArray(j) ? j[0] : j;
        if (saved && saved.id) return saved.id;
      }
    } catch (_) {}
    return vid;
  }

  async function postLiveOrder(orderResult, meta) {
    meta = meta || {};
    if (!orderResult || !orderResult.ok || !base()) return { ok: false, error: 'no network' };
    var task = orderResult.task;
    if (task && task.networkId) return { ok: true, replay: true, id: task.networkId, short: task.networkShort };
    if (task && task._livePosting) {
      return { ok: false, error: 'posting' };
    }
    if (task) task._livePosting = true;
    var vendor = orderResult.vendor || meta.vendor || null;
    var drop = orderResult.drop || meta.pos || meta.drop || pos();
    var items = orderResult.items || (task && task.items) || [];
    var total = Number(orderResult.total != null ? orderResult.total : task && task.total_s) || 0;
    var vid = null;
    try {
      vid = await upsertVendor(vendor);
    } catch (_) {}
    if (!vid && vendor) vid = String(vendor.id || vendor.shopName || 'shop');
    var uid = null;
    try {
      uid =
        (global.SNAuth && SNAuth.user && (SNAuth.user.id || SNAuth.user.sub)) ||
        (global.SNAuth && SNAuth.uid && SNAuth.uid()) ||
        null;
    } catch (_) {}
    var body = {
      vendor_id: vid,
      vendor_name: (vendor && (vendor.shopName || vendor.name)) || (task && task.vendorName) || 'Shop',
      vendor_lat: vendor && vendor.lat != null ? Number(vendor.lat) : null,
      vendor_lng: vendor && vendor.lng != null ? Number(vendor.lng) : null,
      items: (items || []).map(function (i) {
        return { name: i.name, qty: i.qty || 1, price: Number(i.price) || 0 };
      }),
      calc: {
        currency: 'AC',
        symbol: '⭐',
        total: total,
        platform_fee_s: orderResult.platformFee,
        driver_s: orderResult.driverCut,
        vendor_s: orderResult.vendorCut,
        hold: true,
        pay_on_delivery: true,
        spacenet: true,
        local_task: task && task.id,
      },
      status: 'seeking_driver',
      delivery_lat: drop && drop.lat != null ? Number(drop.lat) : null,
      delivery_lng: drop && drop.lng != null ? Number(drop.lng) : null,
      notes: 'SpaceNet live · ⭐ hold · shop + driver paid on deliver · task ' + ((task && task.id) || ''),
      pay_on_delivery: true,
      channel: 'spacenet',
    };
    if (uid && isUuid(uid)) body.customer_id = uid;
    try {
      var r = await fetch(base() + '/rest/v1/orders', {
        method: 'POST',
        headers: Object.assign(headers(true), { Prefer: 'return=representation' }),
        body: JSON.stringify(body),
      });
      var j = await r.json().catch(function () {
        return {};
      });
      var row = Array.isArray(j) ? j[0] : j && j.id ? j : null;
      if (!r.ok || !row) {
        return { ok: false, error: (j && (j.message || j.error || j.hint)) || 'HTTP ' + r.status };
      }
      if (task) {
        task.networkId = row.id;
        task.networkShort = row.short_id;
        task.networkStatus = row.status || 'seeking_driver';
        task.vendorId = vid || task.vendorId;
        try {
          if (global.SNTasks && SNTasks.save) SNTasks.save();
        } catch (_) {}
      }
      log(
        'LIVE ORDER ' +
          (row.short_id || String(row.id).slice(0, 8)) +
          ' · ' +
          body.vendor_name +
          ' · SEEKING DRIVER · type driver online then claim',
        'ok'
      );
      return { ok: true, order: row, id: row.id, short: row.short_id };
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'post fail' };
    }
  }

  async function claimLive(task, who) {
    if (!task || !task.networkId || !base()) return { ok: false };
    var uid = null;
    try {
      uid =
        (who && who.id && isUuid(who.id) && who.id) ||
        (global.SNAuth && SNAuth.user && (SNAuth.user.id || SNAuth.user.sub)) ||
        null;
    } catch (_) {}
    var patch = {
      status: 'assigned',
      driver_name: (who && (who.name || who.shopName)) || 'Driver',
      driver_accepted_at: new Date().toISOString(),
    };
    if (uid && isUuid(uid)) patch.driver_id = uid;
    try {
      var r = await fetch(base() + '/rest/v1/orders?id=eq.' + encodeURIComponent(task.networkId), {
        method: 'PATCH',
        headers: Object.assign(headers(true), { Prefer: 'return=representation' }),
        body: JSON.stringify(patch),
      });
      var j = await r.json().catch(function () {
        return {};
      });
      if (!r.ok) return { ok: false, error: (j && (j.message || j.error)) || 'claim HTTP ' + r.status };
      var row = Array.isArray(j) ? j[0] : j;
      if (task) {
        task.networkStatus = 'assigned';
        task.driverName = patch.driver_name;
        task.driverId = patch.driver_id || task.driverId;
      }
      log('CLAIMED · ' + (task.networkShort || task.networkId) + ' · driver ' + patch.driver_name, 'ok');
      return { ok: true, order: row };
    } catch (e) {
      return { ok: false, error: e.message || 'claim fail' };
    }
  }

  async function deliverLive(task) {
    if (!task || !task.networkId || !base()) return { ok: false };
    try {
      var r = await fetch(base() + '/rest/v1/orders?id=eq.' + encodeURIComponent(task.networkId), {
        method: 'PATCH',
        headers: Object.assign(headers(true), { Prefer: 'return=representation' }),
        body: JSON.stringify({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
        }),
      });
      var j = await r.json().catch(function () {
        return {};
      });
      if (!r.ok) return { ok: false, error: (j && (j.message || j.error)) || 'deliver HTTP ' + r.status };
      if (task) task.networkStatus = 'delivered';
      log(
        'DELIVERED · ' +
          (task.networkShort || task.networkId) +
          ' · ⭐ shop + driver paid',
        'ok'
      );
      return { ok: true, order: Array.isArray(j) ? j[0] : j };
    } catch (e) {
      return { ok: false, error: e.message || 'deliver fail' };
    }
  }

  /**
   * After local placeOrder — announce on mesh + write the live row.
   */
  async function fetchIntakeRetry(url, init, tries) {
    tries = tries || 3;
    var lastErr = null;
    for (var a = 0; a < tries; a++) {
      try {
        var r = await fetch(url, init);
        if (r.ok || r.status < 500) return r;
        lastErr = new Error('HTTP ' + r.status);
      } catch (e) {
        lastErr = e;
      }
      await new Promise(function (res) {
        setTimeout(res, 400 * Math.pow(2, a));
      });
    }
    throw lastErr || new Error('intake fail');
  }

  async function afterLocalOrder(orderResult, meta) {
    meta = meta || {};
    if (!orderResult || !orderResult.ok) return { ok: false };
    var task = orderResult.task;
    var vendor = orderResult.vendor || meta.vendor || null;
    var drop = orderResult.drop || meta.drop || pos();
    var items = orderResult.items || [];
    var total = orderResult.total;

    var live = null;
    try {
      live = await postLiveOrder(orderResult, meta);
      if (live && live.ok && live.short) {
        /* already logged */
      } else if (live && !live.ok && live.error) {
        log('Mesh · live row · ' + live.error, 'dim');
      }
    } catch (eLive) {
      log('Mesh · live row · ' + ((eLive && eLive.message) || eLive), 'dim');
    }

    // 1) Live-bridge publish (other clients can inject notice)
    try {
      if (global.SNLiveBridge && SNLiveBridge.publish) {
        void SNLiveBridge.publish([
          {
            op: 'notice',
            text: 'Order ' + (total != null ? total + 'S' : '') + ' · seeking courier',
          },
        ]);
      }
    } catch (_) {}

    // 2) Best-effort order-intake when vendor has real UUID + menu
    var netVid = networkVendorId((vendor && vendor.id) || orderResult.vendorId || meta.vendorId);
    var intake = null;
    if (netVid && items.length) {
      try {
        var body = {
          vendor_id: netVid,
          items: items.map(function (i) {
            return {
              name: i.name,
              qty: i.qty || 1,
              price: Number(i.price) || 0,
            };
          }),
          delivery_lat: drop.lat,
          delivery_lng: drop.lng,
          notes:
            'SpaceNet mesh · S ' +
            total +
            ' · vault 3% · driver 15% · local task ' +
            ((task && task.id) || ''),
          calc: {
            currency: 'S',
            total_avc: total,
            subtotal_eur: total,
            goods_eur: total,
            platform_fee_s: orderResult.platformFee,
            driver_s: orderResult.driverCut,
            vendor_s: orderResult.vendorCut,
            spacenet: true,
          },
          pay_with_balance: false,
        };
        var r = await fetchIntakeRetry(base() + '/functions/v1/order-intake', {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify(body),
        });
        var j = await r.json().catch(function () {
          return {};
        });
        if (r.ok && j.order) {
          intake = j;
          if (task) {
            task.networkId = j.order.id;
            task.networkShort = j.order.short_id;
            task.networkStatus = j.order.status || 'seeking_driver';
            task.notes = (task.notes || '') + ' · net ' + (j.order.short_id || j.order.id);
          }
          log(
            'Mesh · network order ' +
              (j.order.short_id || j.order.id) +
              (j.seeking_driver ? ' · seeking driver' : ''),
            'ok'
          );
        } else if (j.error === 'vendor_menu_empty') {
          // Real shop exists but menu not in DB — local path still valid
          log('Mesh · shop online · menu local-only (DB menu empty) · order settled in S here', 'dim');
        } else if (!r.ok && j.error) {
          log('Mesh · network intake · ' + (j.error || j.message || r.status), 'dim');
        }
      } catch (e) {
        log('Mesh · intake offline · local order still valid', 'dim');
      }
    }

    // 3) Refresh open jobs around you
    try {
      await pullOpenOrders({ quiet: true, pos: drop });
    } catch (_) {}

    return { ok: true, intake: intake, live: live, task: task };
  }

  /** Warm real vendors into DB (edge crawler) then local sector */
  async function warmSector(lat, lng) {
    var p = { lat: lat != null ? lat : pos().lat, lng: lng != null ? lng : pos().lng };
    if (!base()) return { ok: false };
    try {
      var r = await fetch(base() + '/functions/v1/vendor-crawler', {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({
          lat: p.lat,
          lng: p.lng,
          radius_m: 3500,
          limit: 40,
        }),
      });
      var j = await r.json().catch(function () {
        return {};
      });
      if (r.ok) {
        log(
          'Mesh · crawler · ' +
            (j.count != null ? j.count : j.upserted != null ? j.upserted : 'ok') +
            ' shops warmed',
          'ok'
        );
      }
    } catch (_) {}
    try {
      if (global.SNCommerce && SNCommerce.ensureSector) {
        return await SNCommerce.ensureSector(p.lat, p.lng, { openMap: true });
      }
    } catch (_) {}
    return { ok: true, lat: p.lat, lng: p.lng };
  }

  function start() {
    if (pollTimer) return;
    void pullOpenOrders({ quiet: true });
    pollTimer = setInterval(function () {
      void pullOpenOrders({ quiet: true });
    }, pollMs);
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function status() {
    var open = (global.SNTasks && SNTasks.list && SNTasks.list({ kind: 'delivery' })) || [];
    var net = open.filter(function (t) {
      return t.source === 'spacenet-mesh' || (t.id && String(t.id).indexOf('net_') === 0);
    });
    return {
      polling: !!pollTimer,
      lastPull: lastPull,
      openLocal: open.length,
      openNetwork: net.length,
      network: !!base(),
    };
  }

  // Auto-start after shell
  setTimeout(function () {
    try {
      start();
    } catch (_) {}
  }, 6000);

  global.SNMeshOrders = {
    pullOpenOrders: pullOpenOrders,
    afterLocalOrder: afterLocalOrder,
    postLiveOrder: postLiveOrder,
    claimLive: claimLive,
    deliverLive: deliverLive,
    upsertVendor: upsertVendor,
    warmSector: warmSector,
    start: start,
    stop: stop,
    status: status,
    networkVendorId: networkVendorId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
