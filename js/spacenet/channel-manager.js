/**
 * SNChannel — delivery channel manager for multi-platform drivers
 * Drivers link Wolt / eFood / Bolt / Uber Eats / etc. Astranov orchestrates
 * jobs into one queue, picks nearest lightest driver, designs multi-stop routes.
 */
(function (global) {
  'use strict';

  var KEY = 'sn:channels-v1';
  var JOBS_KEY = 'sn:channel-jobs-v1';

  var DEFAULT_PLATFORMS = [
    { id: 'wolt', name: 'Wolt', color: '#00c2e8' },
    { id: 'efood', name: 'eFood', color: '#e4002b' },
    { id: 'bolt', name: 'Bolt Food', color: '#34d186' },
    { id: 'uber', name: 'Uber Eats', color: '#06c167' },
    { id: 'box', name: 'Box', color: '#ff6a00' },
    { id: 'astranov', name: 'Astranov', color: '#3db8ff', linked: true },
  ];

  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && Array.isArray(raw.platforms)) return raw;
    } catch (_) {}
    return {
      platforms: DEFAULT_PLATFORMS.map(function (p) {
        return Object.assign({ linked: p.id === 'astranov', externalId: '', notes: '' }, p);
      }),
      updated: Date.now(),
    };
  }

  function saveState(st) {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (_) {}
  }

  function loadJobs() {
    try {
      return JSON.parse(localStorage.getItem(JOBS_KEY) || '[]') || [];
    } catch (_) {
      return [];
    }
  }

  function saveJobs(jobs) {
    try {
      localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.slice(0, 200)));
    } catch (_) {}
  }

  function haversineKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 99;
    var R = 6371;
    var dLat = ((b.lat - a.lat) * Math.PI) / 180;
    var dLng = ((b.lng - a.lng) * Math.PI) / 180;
    var x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }

  /** Active cargo count for a driver (claimed / in progress deliveries) */
  var DEFAULT_MAX_CARGO = 4;
  function maxCargoOf(d) {
    if (!d) return DEFAULT_MAX_CARGO;
    var m = d.maxCargo != null ? Number(d.maxCargo) : DEFAULT_MAX_CARGO;
    return m > 0 ? m : DEFAULT_MAX_CARGO;
  }
  function cargoLoad(driverId) {
    if (!driverId || !global.SNTasks || !SNTasks.list) return 0;
    try {
      var list = SNTasks.list() || [];
      return list.filter(function (t) {
        if (!t) return false;
        if (t.status !== 'claimed' && t.status !== 'in_progress' && t.status !== 'open')
          return false;
        return t.driverId === driverId || t.assigneeId === driverId;
      }).length;
    } catch (_) {
      return 0;
    }
  }

  /**
   * Pick closest online driver with lightest cargo.
   * score = distanceKm * 10 + cargo * 28 + overload penalty
   */
  function driverFresh(d) {
    if (!d) return false;
    if (!d.driverOnline) return false;
    var hb = d.driverHb || d.lastSeen || d.onlineAt || 0;
    if (hb && Date.now() - hb > 5 * 60 * 1000) return false;
    return true;
  }
  function touchDriverHb(d) {
    if (!d) return;
    d.driverHb = Date.now();
    d.driverOnline = true;
  }
  function pickBestDriver(nearPos, opts) {
    opts = opts || {};
    var maxKm = opts.maxKm != null ? opts.maxKm : 20;
    var meP = global.SNProfiles && SNProfiles.me && SNProfiles.me();
    var drivers = (global.SNProfiles && SNProfiles.list && SNProfiles.list({ role: 'driver' })) || [];
    drivers = drivers.filter(function (d) {
      if (!driverFresh(d) && d.driverOnline) {
        /* stale hb still online flag — allow if no hb yet */
      }

      if (!d || !d.driverOnline) return false;
      if (meP && d.id === meP.id && opts.excludeMe) return false;
      if (d.lat == null || d.lng == null) {
        // allow online drivers without pin — treat as near pos
        d = Object.assign({}, d, {
          lat: nearPos && nearPos.lat,
          lng: nearPos && nearPos.lng,
        });
      }
      return haversineKm(nearPos, d) <= maxKm;
    });
    if (!drivers.length) return null;
    var ranked = drivers.map(function (d) {
      var km = haversineKm(nearPos, d);
      var cargo = cargoLoad(d.id);
      var maxCargo = d.maxCargo != null ? Number(d.maxCargo) : 3;
      var overload = cargo >= maxCargo ? 120 : cargo >= maxCargo - 1 ? 40 : 0;
      var score = km * 10 + cargo * 28 + overload;
      return {
        driver: d,
        km: km,
        cargo: cargo,
        maxCargo: maxCargo,
        score: score,
      };
    });
    ranked.sort(function (a, b) {
      return a.score - b.score;
    });
    return ranked[0];
  }

  function listPlatforms() {
    return loadState().platforms;
  }

  function link(platformId, externalId, notes) {
    var st = loadState();
    var p = st.platforms.find(function (x) {
      return x.id === String(platformId || '').toLowerCase();
    });
    if (!p) {
      p = {
        id: String(platformId || 'custom').toLowerCase(),
        name: String(platformId || 'Custom'),
        color: '#3db8ff',
        linked: true,
        externalId: externalId || '',
        notes: notes || '',
      };
      st.platforms.push(p);
    } else {
      p.linked = true;
      p.externalId = externalId || p.externalId || '';
      if (notes) p.notes = notes;
    }
    st.updated = Date.now();
    saveState(st);
    // Mark me as multi-platform driver
    try {
      var me = global.SNProfiles && SNProfiles.me && SNProfiles.me();
      if (me) {
        me.roles = me.roles || {};
        me.roles.driver = true;
        me.driverOnline = true;
        me.channels = st.platforms.filter(function (x) {
          return x.linked;
        }).map(function (x) {
          return x.id;
        });
        me.maxCargo = me.maxCargo != null ? me.maxCargo : 3;
        global.SNProfiles.upsert(me);
      }
    } catch (_) {}
    return p;
  }

  function unlink(platformId) {
    var st = loadState();
    st.platforms.forEach(function (p) {
      if (p.id === String(platformId || '').toLowerCase() && p.id !== 'astranov') {
        p.linked = false;
      }
    });
    st.updated = Date.now();
    saveState(st);
    return listPlatforms();
  }

  /**
   * Ingest an external delivery job (from another network the driver is on).
   * job: { platform, externalId, vendorName, vendorLat, vendorLng, dropLat, dropLng,
   *        customer, items, payS, note }
   */
  function ingestJob(job) {
    job = job || {};
    var row = {
      id: 'chj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      platform: job.platform || 'external',
      externalId: job.externalId || '',
      vendorName: job.vendorName || job.shop || 'Shop',
      vendorLat: job.vendorLat != null ? Number(job.vendorLat) : null,
      vendorLng: job.vendorLng != null ? Number(job.vendorLng) : null,
      dropLat: job.dropLat != null ? Number(job.dropLat) : null,
      dropLng: job.dropLng != null ? Number(job.dropLng) : null,
      customer: job.customer || '',
      items: job.items || [],
      payS: Number(job.payS) || 0,
      note: job.note || '',
      status: 'queued',
      t: Date.now(),
      taskId: null,
      driverId: null,
    };
    var jobs = loadJobs();
    jobs.unshift(row);
    saveJobs(jobs);
    return row;
  }

  /**
   * Orchestrate a channel job → SNTasks delivery + best driver + multi-stop route.
   */
  async function orchestrate(jobOrId, opts) {
    opts = opts || {};
    var job =
      typeof jobOrId === 'string'
        ? loadJobs().find(function (j) {
            return j.id === jobOrId;
          })
        : jobOrId;
    if (!job) return { ok: false, error: 'job not found' };

    var pos = {
      lat: job.dropLat != null ? job.dropLat : global._snLastPos && global._snLastPos.lat,
      lng: job.dropLng != null ? job.dropLng : global._snLastPos && global._snLastPos.lng,
    };
    var vendorPos = {
      lat: job.vendorLat != null ? job.vendorLat : pos.lat,
      lng: job.vendorLng != null ? job.vendorLng : pos.lng,
    };

    // Create delivery task
    var task = null;
    try {
      if (global.SNTasks && SNTasks.create) {
        task = SNTasks.create({
          kind: 'delivery',
          title: (job.platform || 'ext') + ' · ' + (job.vendorName || 'shop'),
          lat: vendorPos.lat,
          lng: vendorPos.lng,
          drop_lat: pos.lat,
          drop_lng: pos.lng,
          vendor_lat: vendorPos.lat,
          vendor_lng: vendorPos.lng,
          total_s: job.payS || 0,
          channel: job.platform,
          channelJobId: job.id,
          status: 'open',
        });
      } else if (global.SNTasks && SNTasks.parse) {
        // fallback minimal
        task = {
          id: 't_' + Date.now().toString(36),
          kind: 'delivery',
          status: 'open',
          lat: vendorPos.lat,
          lng: vendorPos.lng,
          drop_lat: pos.lat,
          drop_lng: pos.lng,
        };
      }
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }

    var pick = pickBestDriver(vendorPos, { maxKm: 25 });
    var driver = pick && pick.driver;
    var claim = null;
    if (driver && task && global.SNTasks && SNTasks.claim) {
      claim = SNTasks.claim(task.id || task, driver);
      if (claim && claim.ok && claim.task) {
        claim.task.driverId = driver.id;
        claim.task.driverName = driver.name;
        claim.task.status = 'in_progress';
        claim.task.channel = job.platform;
        task = claim.task;
      }
    }

    // Multi-stop route: other cargo + this drop
    var stops = [];
    try {
      if (global.SNMarket && typeof driverOtherStops === 'function') {
        /* no */
      }
      var list = (global.SNTasks && SNTasks.list && SNTasks.list({ kind: 'delivery' })) || [];
      list.forEach(function (t) {
        if (!t || (task && t.id === task.id)) return;
        if (t.status !== 'claimed' && t.status !== 'in_progress') return;
        if (driver && t.driverId && t.driverId !== driver.id) return;
        var la = t.drop_lat != null ? t.drop_lat : t.lat;
        var lo = t.drop_lng != null ? t.drop_lng : t.lng;
        if (la == null) return;
        stops.push({ lat: la, lng: lo, label: String(t.title || 'stop').slice(0, 24) });
      });
    } catch (_) {}

    try {
      if (global.SNField && SNField.startDeliveryRoute) {
        await SNField.startDeliveryRoute({
          id: 'ch:' + job.id,
          vendorLat: vendorPos.lat,
          vendorLng: vendorPos.lng,
          dropLat: pos.lat,
          dropLng: pos.lng,
          stops: stops.slice(0, 4),
          label: '🛵 ' + String(job.platform || 'job').slice(0, 10),
          driver: (driver && driver.name) || 'Courier',
        });
      }
    } catch (_) {}

    job.status = driver ? 'assigned' : 'queued';
    job.taskId = task && task.id;
    job.driverId = driver && driver.id;
    job.cargoAtAssign = pick ? pick.cargo : 0;
    job.km = pick ? pick.km : null;
    var jobs = loadJobs();
    var ix = jobs.findIndex(function (j) {
      return j.id === job.id;
    });
    if (ix >= 0) jobs[ix] = job;
    else jobs.unshift(job);
    saveJobs(jobs);

    var reply =
      (driver
        ? 'Assigned · ' +
          driver.name +
          ' · ' +
          (pick.km != null ? pick.km.toFixed(1) + ' km' : '') +
          ' · cargo ' +
          pick.cargo +
          '/' +
          pick.maxCargo
        : 'Queued · no free driver · link platform or go drive on') +
      ' · ' +
      (job.platform || 'channel') +
      ' · ' +
      (job.vendorName || '');

    try {
      if (global.SNCli && SNCli.log) SNCli.log(reply, driver ? 'ok' : 'dim');
    } catch (_) {}

    return {
      ok: true,
      job: job,
      task: task,
      driver: driver,
      pick: pick,
      stops: stops,
      reply: reply,
    };
  }

  function statusLines() {
    var plats = listPlatforms();
    var linked = plats.filter(function (p) {
      return p.linked;
    });
    var jobs = loadJobs().filter(function (j) {
      return j.status === 'queued' || j.status === 'assigned';
    });
    var lines = ['CHANNEL MANAGER · multi-platform courier'];
    lines.push(
      'Linked · ' +
        (linked.length
          ? linked
              .map(function (p) {
                return p.name + (p.externalId ? ' (' + p.externalId + ')' : '');
              })
              .join(' · ')
          : 'none · link wolt / efood / bolt')
    );
    lines.push('Open channel jobs · ' + jobs.length);
    jobs.slice(0, 6).forEach(function (j) {
      lines.push(
        '· ' +
          j.platform +
          ' · ' +
          (j.vendorName || '') +
          ' · ' +
          j.status +
          (j.driverId ? ' · driver ' + j.driverId.slice(0, 8) : '')
      );
    });
    lines.push('Commands · channels · link wolt me@wolt · orchestrate · drive on');
    return lines;
  }

  global.SNChannel = {
    listPlatforms: listPlatforms,
    link: link,
    unlink: unlink,
    ingestJob: ingestJob,
    orchestrate: orchestrate,
    pickBestDriver: pickBestDriver,
    maxCargoOf: maxCargoOf,
    DEFAULT_MAX_CARGO: DEFAULT_MAX_CARGO,
    driverFresh: driverFresh,
    touchDriverHb: touchDriverHb,
    cargoLoad: cargoLoad,
    listJobs: loadJobs,
    statusLines: statusLines,
    haversineKm: haversineKm,
  };
})(typeof window !== 'undefined' ? window : globalThis);
