/**
 * Field chrome (spartan): radar + home + miner (S + S/day) · CLI top ribbon buttons
 * SPECS P0+P2. No companion. No floating edge docks.
 */
(function (g) {
  'use strict';
  /** Radar center speeds (km/h) + plain-language captions (SPECS radar) */
  var SPEED = {
    orbit: {
      v: 107208,
      mode: 'Earth through space',
      explain: 'Earth orbital speed around the Sun (~29.8 km/s) · center = km/h in space',
    },
    rotate: {
      v: 1671,
      mode: 'Earth rotation',
      explain: 'Earth surface rotation at the equator · how fast ground moves with the planet',
    },
    walk: {
      v: 5,
      mode: 'Walking',
      explain: 'Typical walking speed on Earth surface · street / pedestrian scale',
    },
    drive: {
      v: 50,
      mode: 'Driving',
      explain: 'Typical urban driving on Earth surface · city road scale',
    },
  };
  var EARTH = SPEED.rotate.v;

  /** Timeline Scanner — time machine (past imagery · present · future projection) */
  var TL_KEY = 'sn:timeline-v2';
  var timeline = {
    offset: 0, // years from present (neg=past, pos=future)
    frozen: false,
    year: new Date().getFullYear(),
    mode: 'present', // present | past | future
  };
  try {
    var debugTl = /(?:\?|&)sn-debug=1\b/.test(location.search || '');
    var ownerTl = false;
    try {
      ownerTl = !!(global.SNAuth && SNAuth.isOwner && SNAuth.isOwner());
    } catch (_) {}
    if (!debugTl && !ownerTl) {
      timeline.offset = 0;
      timeline.frozen = false;
    } else {
      var _tls = JSON.parse(localStorage.getItem(TL_KEY) || 'null');
      if (_tls && typeof _tls.offset === 'number') {
        timeline.offset = Math.max(-80, Math.min(40, _tls.offset));
        timeline.frozen = !!_tls.frozen;
      }
    }
  } catch (_) {
    timeline.offset = 0;
    timeline.frozen = false;
  }

  function timelineNowYear() {
    return new Date().getFullYear();
  }
  function timelineTargetYear() {
    return timelineNowYear() + (timeline.offset || 0);
  }
  function timelineMode() {
    if (timeline.offset < 0) return 'past';
    if (timeline.offset > 0) return 'future';
    return 'present';
  }
  function saveTimeline() {
    try {
      localStorage.setItem(
        TL_KEY,
        JSON.stringify({ offset: timeline.offset, frozen: timeline.frozen })
      );
    } catch (_) {}
  }
  function applyTimelineBody() {
    timeline.mode = timelineMode();
    timeline.year = timelineTargetYear();
    document.body.classList.remove('tl-present', 'tl-past', 'tl-future', 'tl-frozen');
    document.body.classList.add('tl-' + timeline.mode);
    // Frozen red only in past; future stays cyan even when frozen
    if (timeline.frozen && timeline.mode === 'past') document.body.classList.add('tl-frozen');
    var te = $('fnm-time');
    if (te) {
      te.classList.remove('tl-present', 'tl-past', 'tl-future', 'tl-frozen');
      te.classList.add('tl-' + timeline.mode);
      if (timeline.frozen && timeline.mode === 'past') te.classList.add('tl-frozen');
    }
    var st = $('tl-status');
    if (st) {
      if (timeline.mode === 'present' && !timeline.frozen) {
        st.textContent = 'PRESENT · live now · green timeline';
      } else if (timeline.mode === 'past') {
        st.textContent =
          (timeline.frozen ? 'FROZEN PAST · ' : 'PAST · ') +
          timeline.year +
          ' · historical imagery';
      } else {
        st.textContent =
          (timeline.frozen ? 'FROZEN FUTURE · ' : 'FUTURE · ') +
          timeline.year +
          ' · projected imagery';
      }
    }
    var lab = $('tl-year-label');
    if (lab) {
      lab.textContent =
        timeline.offset === 0
          ? 'NOW'
          : (timeline.offset > 0 ? '+' : '') + timeline.offset + 'y · ' + timeline.year;
    }
    var range = $('tl-year');
    if (range && Number(range.value) !== timeline.offset) range.value = String(timeline.offset);
    // Globe HUD
    try {
      if (g.SNGlobe && SNGlobe.setHud) {
        if (timeline.mode === 'present') SNGlobe.setHud('PRESENT · ' + timeline.year);
        else if (timeline.mode === 'past')
          SNGlobe.setHud('PAST · ' + timeline.year + ' imagery');
        else SNGlobe.setHud('FUTURE · ' + timeline.year + ' projection');
      }
    } catch (_) {}
    applyTimelineImagery();
    // Graphical past/future order review on the map
    try {
      if (g.SNPolyScheduler && typeof SNPolyScheduler.showTimeline === 'function') {
        SNPolyScheduler.showTimeline({
          mode: timeline.mode,
          year: timeline.year,
          offset: timeline.offset,
          frozen: timeline.frozen,
        });
      }
    } catch (_) {}
    // Map era class for imagery tint
    try {
      var cm = document.getElementById('city-map');
      if (cm) {
        cm.classList.remove('tl-map-past', 'tl-map-future', 'tl-map-present');
        cm.classList.add('tl-map-' + timeline.mode);
      }
    } catch (_) {}
  }

  /**
   * Dress map/globe for era:
   * past → satellite / wayback-style historical look
   * future → hybrid + cool projection
   * present → restore user basemap preference if possible
   */
  function applyTimelineImagery() {
    try {
      if (!g.SNMap || !SNMap.setBasemap) return;
      g._snTimelineBasemap = timeline.mode;
      // Open map when reviewing past/future so imagery + orders are visible
      if (timeline.mode !== 'present' && !SNMap.active && SNMap.open) {
        try {
          SNMap.open({ lat: 36.4341, lng: 28.2176, zoom: 13 });
        } catch (_) {}
      }
      if (!SNMap.active) return;
      if (timeline.mode === 'past') {
        // Historical-class satellite (best available public imagery)
        try {
          SNMap.setBasemap('g_satellite', { log: false });
        } catch (_) {
          try {
            SNMap.setBasemap('satellite', { log: false });
          } catch (__) {}
        }
        try {
          if (g.SNCli && SNCli.preview)
            SNCli.preview('past map · ' + timeline.year);
        } catch (_) {}
      } else if (timeline.mode === 'future') {
        try {
          SNMap.setBasemap('g_hybrid', { log: false });
        } catch (_) {
          try {
            SNMap.setBasemap('satellite', { log: false });
          } catch (__) {}
        }
      } else {
        // present — restore dark street map default for delivery work
        try {
          SNMap.setBasemap('dark', { log: false });
        } catch (_) {}
      }
    } catch (_) {}
  }

  function setTimelineOffset(years, opts) {
    opts = opts || {};
    timeline.offset = Math.max(-80, Math.min(40, Math.round(Number(years) || 0)));
    if (opts.freeze != null) timeline.frozen = !!opts.freeze;
    else if (timeline.offset !== 0) timeline.frozen = true;
    else timeline.frozen = false;
    saveTimeline();
    applyTimelineBody();
    paintNavMeta();
    try {
      if (g.SNCli && SNCli.log && opts.log !== false) {
        if (timeline.mode === 'present')
          SNCli.log('Timeline · PRESENT · live', 'ok');
        else if (timeline.mode === 'past')
          SNCli.log('Timeline · PAST ' + timeline.year + ' · historical scan', 'ok');
        else SNCli.log('Timeline · FUTURE ' + timeline.year + ' · projection', 'ok');
      }
    } catch (_) {}
  }

  function setTimelineDate(iso) {
    if (!iso) return;
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return;
    var y = d.getFullYear();
    setTimelineOffset(y - timelineNowYear(), { freeze: true });
    try {
      var de = $('tl-date');
      if (de) de.value = iso;
    } catch (_) {}
  }


  function bindDataGadget() {
    function go(fn) {
      return function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        try {
          fn();
        } catch (err) {
          try {
            if (g.SNCli && SNCli.log) SNCli.log(String(err.message || err), 'err');
          } catch (_) {}
        }
      };
    }
    var pool = $('stc-data-pool');
    if (pool)
      pool.onclick = go(function () {
        if (g.SNCli && SNCli.run) void SNCli.run('pool');
        else if (g.SNPolyScheduler && SNPolyScheduler.claimFromPool) SNPolyScheduler.claimFromPool(1);
      });
    var tour = $('stc-data-tour');
    if (tour)
      tour.onclick = go(function () {
        if (g.SNPolyScheduler && SNPolyScheduler.handleLine) void SNPolyScheduler.handleLine('tour');
        if (g.SNField && SNField.enterPolygonOverview) void SNField.enterPolygonOverview();
      });
    var plans = $('stc-data-plans');
    if (plans)
      plans.onclick = go(function () {
        if (g.SNSubscription && SNSubscription.printPlans) SNSubscription.printPlans();
        else if (g.SNCli && SNCli.run) void SNCli.run('plans');
      });
    var market = $('stc-data-market');
    if (market)
      market.onclick = go(function () {
        if (g.SNPolyScheduler && SNPolyScheduler.handleLine) void SNPolyScheduler.handleLine('help market');
      });
    var marina = $('stc-data-marina');
    if (marina)
      marina.onclick = go(function () {
        if (g.SNMarina && SNMarina.openMarina) SNMarina.openMarina('mandraki');
        else if (g.SNCli && SNCli.run) void SNCli.run('marina');
      });
    var wish = $('stc-data-wish');
    if (wish)
      wish.onclick = go(function () {
        if (g.SNWishInbox && SNWishInbox.list) {
          var list = SNWishInbox.list() || [];
          if (g.SNCli && SNCli.log)
            SNCli.log('Wishes · ' + list.length + ' · latest: ' + (list[0] ? list[0].text || list[0].id : 'none'), 'ok');
        } else if (g.SNCli && SNCli.run) void SNCli.run('wish list');
      });
  }

  function bindTimeline() {
    applyTimelineBody();
    var range = $('tl-year');
    if (range && !range._tlBound) {
      range._tlBound = true;
      range.addEventListener('input', function () {
        setTimelineOffset(range.value, { log: false });
      });
      range.addEventListener('change', function () {
        setTimelineOffset(range.value, { log: true });
      });
    }
    var present = $('tl-present');
    if (present && !present._tlBound) {
      present._tlBound = true;
      present.onclick = function (e) {
        if (e) e.preventDefault();
        setTimelineOffset(0, { freeze: false, log: true });
      };
    }
    var freeze = $('tl-freeze');
    if (freeze && !freeze._tlBound) {
      freeze._tlBound = true;
      freeze.onclick = function (e) {
        if (e) e.preventDefault();
        timeline.frozen = !timeline.frozen;
        if (!timeline.frozen) setTimelineOffset(0, { freeze: false, log: true });
        else {
          saveTimeline();
          applyTimelineBody();
          try {
            if (g.SNCli && SNCli.log)
              SNCli.log(
                timeline.frozen ? 'Timeline FROZEN · ' + timeline.year : 'Timeline unfrozen',
                'ok'
              );
          } catch (_) {}
        }
      };
    }
    var date = $('tl-date');
    if (date && !date._tlBound) {
      date._tlBound = true;
      date.addEventListener('change', function () {
        setTimelineDate(date.value);
      });
    }
    var te = $('fnm-time');
    if (te && !te._tlBound) {
      te._tlBound = true;
      te.onclick = function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        try {
          if (g.SNField && SNField.topChrome && SNField.topChrome.set)
            SNField.topChrome.set('expanded');
          else {
            var panel = $('sn-topchrome-panel');
            if (panel) {
              panel.classList.remove('collapsed', 'mid');
              panel.classList.add('expanded');
            }
          }
        } catch (_) {}
        if (timeline.mode === 'present' && !timeline.frozen) {
          try {
            if (g.SNCli && SNCli.preview)
              SNCli.preview('Map timeline · slide for past orders & imagery');
          } catch (_) {}
        }
      };
    }
    // Top-scroll Data strip (end of ribbon) — archives without deep menus
    var pastBtn = $('stc-data-past');
    if (pastBtn && !pastBtn._tlBound) {
      pastBtn._tlBound = true;
      pastBtn.onclick = function (e) {
        if (e) e.preventDefault();
        try {
          if (g.SNField && SNField.topChrome && SNField.topChrome.set)
            SNField.topChrome.set('mid');
        } catch (_) {}
        // Jump one year back and open archive map review
        setTimelineOffset(timeline.offset === 0 ? -1 : timeline.offset, { freeze: true, log: true });
      };
    }
    var expBtn = $('stc-data-export');
    if (expBtn && !expBtn._tlBound) {
      expBtn._tlBound = true;
      expBtn.onclick = function (e) {
        if (e) e.preventDefault();
        try {
          var pack =
            g.SNPolyScheduler && SNPolyScheduler.exportArchive
              ? SNPolyScheduler.exportArchive()
              : null;
          if (g.SNCli && SNCli.log)
            SNCli.log(
              pack
                ? 'Archive exported · ' + pack.count + ' orders · clipboard'
                : 'No archive yet',
              'ok'
            );
        } catch (err) {
          try {
            if (g.SNCli && SNCli.log) SNCli.log('Export failed', 'err');
          } catch (_) {}
        }
      };
    }
    var liveBtn = $('stc-data-present');
    if (liveBtn && !liveBtn._tlBound) {
      liveBtn._tlBound = true;
      liveBtn.onclick = function (e) {
        if (e) e.preventDefault();
        setTimelineOffset(0, { freeze: false, log: true });
      };
    }
  }

  var task = 'idle';
  var notice = '';

  /** Task launcher: standby (blue) · on (green) · off (red) */
  var LAUNCH_KEY = 'sn:task-launch-v1';
  var launchMode = 'standby'; // standby | on | off
  try {
    var _lm = localStorage.getItem(LAUNCH_KEY);
    if (_lm === 'standby' || _lm === 'on' || _lm === 'off') launchMode = _lm;
    else launchMode = 'standby';
  } catch (_) {
    launchMode = 'standby';
  }

  function launchLabels() {
    return {
      standby: {
        title: 'Task launcher · STANDBY · mild news & warnings only',
        cli: 'Launcher · STANDBY · mild news only (blue)',
        pressed: 'mixed',
      },
      on: {
        title: 'Task launcher · ON · tasks will be thrown to you',
        cli: 'Launcher · ON · tasks active (green)',
        pressed: 'true',
      },
      off: {
        title: 'Task launcher · OFF · no tasks · no news · no warnings',
        cli: 'Launcher · OFF · silence (red)',
        pressed: 'false',
      },
    };
  }

  function paintLaunchBtn() {
    var btn = $('sn-task-launch');
    if (!btn) return;
    btn.classList.remove('mode-standby', 'mode-on', 'mode-off');
    btn.classList.add('mode-' + launchMode);
    var L = launchLabels()[launchMode] || launchLabels().standby;
    btn.title = L.title;
    btn.setAttribute('aria-label', L.title);
    btn.setAttribute('aria-pressed', L.pressed);
    btn.dataset.mode = launchMode;
  }

  function setLaunchMode(mode, opts) {
    opts = opts || {};
    if (mode !== 'standby' && mode !== 'on' && mode !== 'off') mode = 'standby';
    var prev = launchMode;
    launchMode = mode;
    try {
      localStorage.setItem(LAUNCH_KEY, launchMode);
    } catch (_) {}
    paintLaunchBtn();
    try {
      document.body.classList.remove('launch-standby', 'launch-on', 'launch-off');
      document.body.classList.add('launch-' + launchMode);
    } catch (_) {}
    // Money path: power ON → INSTANT offers (sync inside activate) then background crawl
    if (mode === 'on' && prev !== 'on' && !opts.skipMoney) {
      try {
        if (g.SNMoney && typeof SNMoney.activate === 'function') {
          void SNMoney.activate({ offers: 2 });
        } else if (g.SNOfferStack && SNOfferStack.testThrow) {
          try {
            if (g.SNLoader && SNLoader.ensure) void SNLoader.ensure(['offers', 'tasks', 'money']);
          } catch (_) {}
          SNOfferStack.testThrow({
            km: 6, total: 9, night: true, persist: true,
            nature: 'Local delivery', skipModeFlip: true
          });
          SNOfferStack.testThrow({
            km: 3.2, total: 7, night: false, persist: true,
            nature: 'Grocery run', title: 'Grocery run · 3 km', mins: 14, skipModeFlip: true
          });
          if (g.SNCli && SNCli.log) SNCli.log('Offers thrown · Accept → Start → Complete', 'ok');
        } else {
          setTimeout(function () {
            try {
              if (g.SNMoney && SNMoney.activate) void SNMoney.activate({ offers: 2 });
              else if (g.SNOfferStack && SNOfferStack.testThrow) {
                SNOfferStack.testThrow({ persist: true, km: 6, total: 9, skipModeFlip: true });
              }
            } catch (_) {}
          }, 500);
          setTimeout(function () {
            try {
              if (g.SNMoney && SNMoney.activate) void SNMoney.activate({ offers: 2 });
            } catch (_) {}
          }, 1500);
        }
      } catch (eM) {
        try {
          if (g.SNCli && SNCli.log) SNCli.log('Market · ' + (eM && eM.message ? eM.message : eM), 'err');
        } catch (_) {}
      }
    }
    if (mode === 'off' && prev === 'on' && !opts.skipMoney) {
      try {
        if (g.SNMoney && SNMoney.deactivate) SNMoney.deactivate();
      } catch (_) {}
    }
    if (opts.quiet) return launchMode;
    try {
      var L = launchLabels()[launchMode];
      if (g.SNCli && SNCli.log) SNCli.log(L.cli, launchMode === 'off' ? 'dim' : 'ok');
      if (g.SNCli && SNCli.preview) SNCli.preview(L.cli);
    } catch (_) {}
    return launchMode;
  }

  function cycleLaunchMode() {
    // Market-first: one tap ON (throw offers) · next tap OFF (rest + reassign).
    // Standby is still reachable via CLI "standby" if needed — not on the power toggle.
    var next = launchMode === 'on' ? 'off' : 'on';
    return setLaunchMode(next, { quiet: false });
  }

  /**
   * Gate tasks / news / warnings by launcher mode.
   * standby → mild only · on → all · off → nothing
   */
  function launchAllows(kind) {
    kind = String(kind || 'task').toLowerCase();
    if (launchMode === 'off') return false;
    if (launchMode === 'on') return true;
    // standby: mild news + warnings only — no full tasks thrown
    if (kind === 'task' || kind === 'throw' || kind === 'assign' || kind === 'offer') return false;
    if (kind === 'news' || kind === 'warn' || kind === 'warning' || kind === 'mild' || kind === 'notice')
      return true;
    return false;
  }

  function bindTaskLaunch() {
    var btn = $('sn-task-launch');
    if (!btn) {
      try {
        var moneyCol = document.querySelector('#sn-topchrome .stc-col-money');
        var hud = $('field-balance-hud');
        if (moneyCol) {
          btn = document.createElement('button');
          btn.type = 'button';
          btn.id = 'sn-task-launch';
          btn.className = 'sn-launch mode-standby';
          btn.innerHTML =
            '<span class="sn-launch-core" aria-hidden="true"></span>' +
            '<svg class="sn-launch-power" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M12 3.2 v8.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
            '<path d="M7.05 6.55a7.2 7.2 0 1 0 9.9 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
            '</svg>';
          if (hud && hud.parentNode === moneyCol) moneyCol.insertBefore(btn, hud.nextSibling);
          else moneyCol.appendChild(btn);
        }
      } catch (_) {}
    }
    paintLaunchBtn();
    try {
      document.body.classList.add('launch-' + launchMode);
    } catch (_) {}
    btn = $('sn-task-launch');
    if (btn && !btn._snLaunchBound) {
      btn._snLaunchBound = true;
      btn.addEventListener(
        'click',
        function (e) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          cycleLaunchMode();
        },
        true
      );
    }
  }

  var speedMode = 'rotate';
  /**
   * Device harvest roles (ASTRANOV technical settings):
   * main — primary phone/PC · conservative spare harvest
   * secondary — hot-swap spare · low harvest · battery / monitor
   * raid — array node · heavy harvest · always below TJ max (thermal ceiling)
   */
  var DEVICE_ROLES = {
    main: {
      id: 'main',
      label: 'Main device',
      harvest: 0.32,
      donateBoost: 1.15,
      workerScale: 0.45,
      maxBudget: 0.55,
      loadCap: 0.72,
      preferHidden: false,
    },
    secondary: {
      id: 'secondary',
      label: 'Secondary device',
      harvest: 0.12,
      donateBoost: 1.0,
      workerScale: 0.18,
      maxBudget: 0.28,
      loadCap: 0.5,
      preferHidden: true,
    },
    raid: {
      id: 'raid',
      label: 'RAID device',
      harvest: 0.78,
      donateBoost: 2.4,
      workerScale: 1.85,
      maxBudget: 0.9,
      loadCap: 0.88,
      preferHidden: false,
      /** Thermal junction soft max — never 100% */
      tjMax: 0.92,
    },
  };
  var ROLE_KEY = 'sn:device-role-v1';

  var mine = {
    on: false,
    terms: false,
    rate: 0,
    session: 0,
    donate: false,
    spare: 0,
    fps: 0,
    rates: { cpu: 0, ram: 0, storage: 0, bandwidth: 0 },
    worker: null,
    workerOps: 0,
    meshPeers: 1,
    deviceRole: 'main',
  };

  function loadDeviceRole() {
    try {
      var r = localStorage.getItem(ROLE_KEY) || 'main';
      if (!DEVICE_ROLES[r]) r = 'main';
      mine.deviceRole = r;
    } catch (e) {
      mine.deviceRole = 'main';
    }
    return mine.deviceRole;
  }

  function roleProfile() {
    var base = DEVICE_ROLES[mine.deviceRole] || DEVICE_ROLES.main;
    var boot = 0;
    try {
      boot = Number(localStorage.getItem('sn:boot-mine-pct') || 0);
    } catch (e) {
      boot = 0;
    }
    if (boot >= 3 && boot <= 13 && mine.deviceRole === 'main') {
      var copy = {};
      for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) copy[k] = base[k];
      copy.harvest = boot / 100;
      copy.bootJudged = true;
      return copy;
    }
    return base;
  }

  function setDeviceRole(role) {
    var id = String(role || 'main').toLowerCase();
    if (id === 'hotswap' || id === 'hot-swap' || id === 'spare') id = 'secondary';
    if (id === 'array' || id === 'miner') id = 'raid';
    if (!DEVICE_ROLES[id]) id = 'main';
    mine.deviceRole = id;
    try {
      localStorage.setItem(ROLE_KEY, id);
    } catch (e) {}
    // Roles imply mesh donation posture
    if (id === 'raid' || id === 'main') {
      mine.donate = true;
      try {
        localStorage.setItem('astranov_donate_compute', '1');
      } catch (e2) {}
    }
    if (id === 'secondary') {
      // Low harvest · still can donate lightly for monitoring mesh
      mine.donate = true;
      try {
        localStorage.setItem('astranov_donate_compute', '1');
      } catch (e3) {}
    }
    if (mine.on && mine.terms && mine.donate) ensureMineWorker();
    paint();
    try {
      if (g.SNUsage && SNUsage.track) SNUsage.track('device_role', { role: id });
    } catch (e4) {}
    return DEVICE_ROLES[id];
  }
  var sweep = 0;
  var blips = [];
  var fpsBuf = [];
  var lastF = 0;
  var radarBig = false;
  var radarLastTap = 0;
  var RADAR_SM = 120;
  var RADAR_LG = 320;
  /** Active routes for radar: { id, points:[{lat,lng}], color, label } */
  var routes = [];
  var routeFetchBusy = false;
  var routeFetchAt = 0;
  /** Radar range zoom (1 = default). Two-finger scroll / pinch adjusts. */
  var radarZoom = 1;

  function autoDayNightTheme() {
    // Owner law: bright day · dark night · user override via theme gadget sticks
    try {
      if (localStorage.getItem('sn:theme-lock-v1') === '1') return;
      var forced = localStorage.getItem('sn:theme-v1') || '';
      if (forced === 'light' || forced === 'dark') return; // explicit user choice
      var h = new Date().getHours();
      var wantLight = h >= 7 && h < 20; // day 07–20
      var root = document.documentElement;
      root.classList.remove('theme-light', 'theme-dark');
      root.classList.add(wantLight ? 'theme-light' : 'theme-dark');
      /* no CLI line — auto theme is not a user turn */
    } catch (_) {}
  }

  function applyDeviceTheme() {
    try {
      var root = document.documentElement;
      var forced = '';
      try {
        forced = localStorage.getItem('sn:theme-v1') || '';
      } catch (_) {}
      root.classList.remove('theme-light', 'theme-dark');
      if (forced === 'light' || forced === 'dark') {
        root.classList.add('theme-' + forced);
      } else if (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) {
        root.classList.add('theme-light');
      } else {
        root.classList.add('theme-dark');
      }
    } catch (_) {}
  }
  try {
    applyDeviceTheme();
    autoDayNightTheme();
    setInterval(autoDayNightTheme, 60000);
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: light)');
      if (mq.addEventListener) mq.addEventListener('change', applyDeviceTheme);
      else if (mq.addListener) mq.addListener(applyDeviceTheme);
    }
  } catch (_) {}

  var loadHist = [];
  var LOAD_HIST_N = 36;
  /** Multi-metric device history (CPU RAM BAT temps) */
  var devHist = [];
  var DEV_HIST_N = 48;
  var batteryApi = null;
  var batteryLevel = null; // 0–100
  var batteryCharging = false;
  var alertCool = {}; // key -> last ms
  var alertElTimer = 0;
  /** Economy performance samples (balance + vault) · 1 Hz */
  var econHist = [];
  var ECON_HIST_N = 60;
  var econTimer = 0;
  var physPos = null;
  /** Per-role load histories for fleet monitor under ASTRANOV */
  var fleetHist = { main: [], secondary: [], raid: [] };
  var FLEET_HIST_N = 32;
  /** Blip kinds: f friend green · c competitor red · v vendor/client yellow */
  var BLIP_COLOR = {
    f: 'rgba(68,255,136,0.95)',
    c: 'rgba(255,85,102,0.95)',
    v: 'rgba(255,204,68,0.95)',
    s: 'rgba(255,204,68,0.95)', // shop = vendor yellow
    p: 'rgba(100,180,255,0.75)',
    t: 'rgba(100,180,255,0.9)', // task
    o: 'rgba(120,190,255,0.9)', // offer
  };
  /** Radar activity band — independent of power button.
   *  low (few real dots) → red → user should power OFF / rest
   *  med (moderate real activity) → blue pulse → radar standby activity
   *  high (many real dots) → green → user should power ON
   */
  var radarActivityBand = 'med'; // low | med | high
  var BAND_RING = {
    low: { grid: 'rgba(232,33,39,0.35)', self: 'rgba(255,100,110,0.95)', sweep: 'rgba(232,33,39,0.18)', beam: 'rgba(255,80,90,0.9)' },
    med: { grid: 'rgba(40,140,255,0.3)', self: 'rgba(120,220,255,0.95)', sweep: 'rgba(40,140,255,0.14)', beam: 'rgba(80,190,255,0.9)' },
    high: { grid: 'rgba(40,230,140,0.35)', self: 'rgba(80,255,170,0.95)', sweep: 'rgba(40,230,140,0.16)', beam: 'rgba(60,255,150,0.9)' },
  };
  var BAND_DOT = {
    low: 'rgba(255,70,80,0.95)',
    med: 'rgba(90,180,255,0.95)',
    high: 'rgba(60,240,140,0.95)',
  };
  function computeRadarActivityBand(n) {
    n = Number(n) || 0;
    if (n <= 2) return 'low';
    if (n >= 10) return 'high';
    return 'med';
  }
  function applyRadarActivityClass(band) {
    radarActivityBand = band || 'med';
    try {
      var wrap = $('field-radar');
      if (!wrap) return;
      wrap.classList.remove('act-low', 'act-med', 'act-high', 'act-standby');
      wrap.classList.add(band === 'high' ? 'act-high' : band === 'low' ? 'act-low' : 'act-med');
      wrap.dataset.activity = band;
      wrap.title =
        band === 'high'
          ? 'Radar · high activity · turn power ON'
          : band === 'low'
            ? 'Radar · low activity · power OFF / rest'
            : 'Radar · moderate activity';
    } catch (_) {}
  }
  var ROUTE_COLORS = [
    'rgba(0,220,255,0.95)',
    'rgba(255,180,60,0.95)',
    'rgba(120,255,160,0.9)',
    'rgba(200,140,255,0.9)',
  ];
  /** Leaflet polylines on city map — independent of camera hold */
  var mapRouteLayers = [];
  /**
   * SPECS CLI top ribbon — custom high-tech SVG glyphs + short labels.
   * Locate · User · Add · Layers · AI · Send
   */
  var ICO = {
    locate:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2"/><circle cx="12" cy="12" r="7.5" opacity=".45"/></svg>',
    user:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19.5c1.2-3.4 3.5-5 6.5-5s5.3 1.6 6.5 5"/><path d="M4 12h1.5M18.5 12H20" opacity=".5"/></svg>',
    add:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z" opacity=".55"/><path d="M12 8v8M8 12h8"/></svg>',
    layers:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 3.5 8.5 12 13l8.5-4.5L12 4Z"/><path d="M3.5 12.5 12 17l8.5-4.5" opacity=".75"/><path d="M3.5 16 12 20.5 20.5 16" opacity=".45"/></svg>',
    ai:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="4.8" r="1.4"/><circle cx="12" cy="19.2" r="1.4"/><circle cx="4.8" cy="12" r="1.4"/><circle cx="19.2" cy="12" r="1.4"/><path d="M12 6.4v3M12 14.6v3M6.4 12h3M14.6 12h3" opacity=".7"/></svg>',
    send:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12h12"/><path d="M12.5 6.5 18.5 12l-6 5.5"/><path d="M4.5 8.5v7" opacity=".4"/></svg>',
    polygon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2 20.2 9.1 17.1 18.8H6.9L3.8 9.1 12 3.2Z"/><path d="M12 8.2v5.2M9.6 11.2h4.8" opacity=".55"/></svg>',
    call:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 5.5h3.2l1 3.2-2 1.2a11 11 0 0 0 4.4 4.4l1.2-2 3.2 1v3.2c0 .9-.7 1.6-1.6 1.6C10.2 18.1 5.9 13.8 5.9 7.1c0-.9.7-1.6 1.6-1.6Z"/><circle cx="17.5" cy="7" r="2.2" opacity=".75"/><path d="M16.2 5.2 18.8 7.8" opacity=".55"/></svg>',
  };
  var RIBBON_CORE = [
    { act: 'locate', icon: ICO.locate, emoji: '📍', text: 'Locate', title: 'Locate me', id: 'sn-rib-locate' },
    {
      act: 'polygon',
      icon: ICO.polygon,
      emoji: '🔶',
      text: 'Poly',
      title: 'Polygon tour · tap again for GPS drive',
      id: 'sn-rib-poly',
    },
    { act: 'user', icon: ICO.user, emoji: '👤', text: 'User', title: 'Sign in / profile', id: 'sn-rib-user' },
    {
      act: 'call',
      icon: ICO.call,
      emoji: '📞',
      text: 'Call',
      title: 'Video call · place or answer',
      id: 'sn-rib-call',
    },
    { act: 'add', icon: ICO.add, emoji: '➕', text: 'Add', title: 'Add', id: 'sn-rib-add' },
    { act: 'layers', icon: ICO.layers, emoji: '🗺️', text: 'Layers', title: 'Map layers', id: 'sn-rib-layers' },
    { act: 'handsfree', icon: ICO.ai, emoji: '🎤', text: 'AI', title: 'Talk to Astranov · mic on', id: 'sn-rib-hf' },
    { act: 'send', icon: ICO.send, emoji: '📤', text: 'Send', title: 'Send', id: 'sn-rib-send' },
  ];
  /**
   * Context task buttons REMOVED from CLI ribbon.
   * Menu / cart / order / claim live inside expanded CLI tiles only.
   * Ribbon: Locate · ⬠ Poly · User · Add · Layers · AI · Send
   */
  var TASKS = {
    idle: [],
    map: [],
    shops: [],
    mine: [],
    money: [],
    space: [],
    delivery: [],
  };

  function $(id) {
    return document.getElementById(id);
  }

  /**
   * SPECS: any ribbon button with more than one action MUST expand upward.
   * openRibbonFlyout(anchorEl|selector, { title, items:[{id,e,t,d}] }, onPick)
   */
  function ensureFlyoutCss() {
    if (document.getElementById('sn-rib-fly-css')) return;
    var st = document.createElement('style');
    st.id = 'sn-rib-fly-css';
    st.textContent = [
      '#sn-rib-fly{position:fixed;inset:0;z-index:220;display:none;pointer-events:none}',
      '#sn-rib-fly.open{display:block;pointer-events:auto}',
      '#sn-rib-fly .sn-rib-fly-bg{position:absolute;inset:0;background:rgba(0,4,12,.45);backdrop-filter:blur(4px)}',
      '#sn-rib-fly .sn-rib-fly-sheet{position:fixed;z-index:136;width:min(320px,calc(100vw - 16px));',
      'max-height:min(58vh,460px);overflow:auto;padding:10px;',
      'background:linear-gradient(165deg,rgba(6,24,48,.98),rgba(2,10,24,.99));',
      'border:1px solid rgba(255,255,255,.5);border-radius:16px;',
      'box-shadow:0 -12px 40px rgba(0,0,0,.7),0 0 32px rgba(11,111,212,.35);color:#c8e4ff;',
      'font-family:Rajdhani,system-ui,sans-serif}',
      '#sn-rib-fly .sn-rib-fly-head{font:700 11px Orbitron,Rajdhani,system-ui;color:#ffffff;letter-spacing:.16em;',
      'text-transform:uppercase;padding:8px 10px 10px;border-bottom:1px solid rgba(26,111,212,.3);margin-bottom:6px;',
      'text-shadow:0 0 12px rgba(255,255,255,.45)}',
      '#sn-rib-fly .sn-rib-fly-opt{border:0;border-radius:12px;background:transparent;color:#e0f0ff;',
      'padding:11px 10px;cursor:pointer;text-align:left;display:flex;align-items:center;gap:12px;width:100%;',
      'font:600 14px Rajdhani,system-ui;transition:background .12s}',
      '#sn-rib-fly .sn-rib-fly-opt:hover,#sn-rib-fly .sn-rib-fly-opt:active{background:rgba(26,111,212,.3)}',
      '#sn-rib-fly .sn-rib-fly-opt .e{font-size:11px;width:36px;height:28px;flex-shrink:0;display:grid;place-items:center;',
      'border:1px solid rgba(255,255,255,.35);border-radius:8px;color:#ffffff;font-family:JetBrains Mono,monospace;',
      'letter-spacing:.04em;background:rgba(8,28,56,.6);text-shadow:0 0 8px rgba(255,255,255,.5)}',
      '#sn-rib-fly .sn-rib-fly-opt .meta{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '#sn-rib-fly .sn-rib-fly-opt .t{font-weight:700;color:#eaf4ff;letter-spacing:.03em}',
      '#sn-rib-fly .sn-rib-fly-opt .d{font:500 11px/1.3 Rajdhani,system-ui;color:#6a8aaa}',
      '#sn-rib-fly .sn-rib-fly-cancel{margin-top:6px;width:100%;border:1px solid rgba(61,184,255,.35);',
      'border-radius:12px;background:rgba(0,12,28,.85);color:#8ab4d0;padding:11px;font:600 12px Rajdhani,system-ui;',
      'cursor:pointer;letter-spacing:.08em}',
    ].join('');
    document.head.appendChild(st);
  }

  function closeRibbonFlyout() {
    var root = document.getElementById('sn-rib-fly');
    if (root) {
      root.classList.remove('open');
      root.innerHTML = '';
    }
  }

  /**
   * Expand options UPWARD from a ribbon button (SPECS law).
   * @param {HTMLElement|string} anchor
   * @param {{title?:string, items:Array<{id:string,e?:string,t:string,d?:string}>}} cfg
   * @param {function(string):void} onPick
   */
  function openRibbonFlyout(anchor, cfg, onPick) {
    ensureFlyoutCss();
    closeRibbonFlyout();
    // Close competing menus
    try {
      if (g.SNTopo && SNTopo.closeAddMenu) SNTopo.closeAddMenu();
    } catch (e) {}

    var el =
      typeof anchor === 'string' ? document.getElementById(anchor) || document.querySelector(anchor) : anchor;
    var root = document.getElementById('sn-rib-fly');
    if (!root) {
      root = document.createElement('div');
      root.id = 'sn-rib-fly';
      root.setAttribute('role', 'dialog');
      document.body.appendChild(root);
    }
    var items = (cfg && cfg.items) || [];
    var rows = items
      .map(function (o) {
        return (
          '<button type="button" class="sn-rib-fly-opt" data-pick="' +
          o.id +
          '"><span class="e" aria-hidden="true">' +
          (o.e || '·') +
          '</span><span class="meta"><span class="t">' +
          (o.t || o.id) +
          '</span>' +
          (o.d ? '<span class="d">' + o.d + '</span>' : '') +
          '</span></button>'
        );
      })
      .join('');
    root.innerHTML =
      '<div class="sn-rib-fly-bg" data-pick="__close"></div>' +
      '<div class="sn-rib-fly-sheet" id="sn-rib-fly-sheet">' +
      '<div class="sn-rib-fly-head">' +
      ((cfg && cfg.title) || 'Options') +
      '<button type="button" class="sn-rib-fly-x" data-pick="__close" aria-label="Close">×</button>' +
      '</div>' +
      rows +
      '<button type="button" class="sn-rib-fly-cancel" data-pick="__close">Cancel</button></div>';

    var sheet = root.querySelector('#sn-rib-fly-sheet');
    var pad = 8;
    var w = Math.min(300, window.innerWidth - 16);
    if (el && sheet) {
      var r = el.getBoundingClientRect();
      var left = Math.max(pad, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - pad));
      sheet.style.width = w + 'px';
      sheet.style.left = left + 'px';
      sheet.style.bottom = window.innerHeight - r.top + 8 + 'px';
      sheet.style.top = 'auto';
      sheet.style.transform = 'none';
    } else if (sheet) {
      sheet.style.left = '50%';
      sheet.style.transform = 'translateX(-50%)';
      sheet.style.bottom = '120px';
    }
    root.classList.add('open');
    if (!root._esc) {
      root._esc = function (ev) {
        if (ev.key === 'Escape') closeRibbonFlyout();
      };
      document.addEventListener('keydown', root._esc);
    }
    root.querySelectorAll('[data-pick]').forEach(function (btn) {
      btn.addEventListener(
        'click',
        function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var id = btn.getAttribute('data-pick');
          closeRibbonFlyout();
          if (id && id !== '__close' && typeof onPick === 'function') onPick(id);
        },
        true
      );
    });
  }

  function focusPos() {
    return (
      g._snPhysPos ||
      g._snLastPos ||
      (g.SNTasks && SNTasks.pos) ||
      (g.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      null
    );
  }

  function openCityMap(opts) {
    var p = focusPos();
    opts = opts || {};
    if (!p || p.lat == null) {
      try {
        if (g.SNCli && SNCli.log) SNCli.log('Locate first to open streets.', 'ok');
      } catch (_) {}
      return Promise.resolve();
    }
    if (!g.SNMap || !SNMap.open) return Promise.resolve();
    return SNMap.open(p.lat, p.lng, {
      force: true,
      imagery: !!opts.imagery,
      basemap: opts.basemap || undefined,
    }).catch(function (e) {
      try {
        if (g.SNCli && SNCli.log) SNCli.log('Map failed · ' + (e && e.message ? e.message : e), 'err');
      } catch (_) {}
    });
  }


  function userDisplayName() {
    try {
      var u = g.SNAuth && SNAuth.user;
      if (!u) return '';
      return (
        (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) ||
        (u.email && u.email.split('@')[0]) ||
        'you'
      );
    } catch (_) {
      return 'you';
    }
  }

  /**
   * Logged-in user button / "me":
   * 1) CLI: clearly signed in as …
   * 2) Open user tile
   * 3) Pin location on city map
   */
  function openLoggedInUser(opts) {
    opts = opts || {};
    var signed = !!(g.SNAuth && SNAuth.user);
    if (!signed) {
      try {
        if (g.SNCli && SNCli.log) SNCli.log('Not signed in · opening Google login…', 'dim');
        if (g.SNCli && SNCli.run) void SNCli.run('login');
        else if (g.SNAuth && SNAuth.signInGoogle) void SNAuth.signInGoogle();
      } catch (e) {
        console.error('[SNField] login', e);
      }
      return { ok: false, signed: false };
    }
    var name = userDisplayName();
    try {
      if (g.SNCli && SNCli.log)
        SNCli.log('Logged in · ' + name + ' · your tile + map pin', 'ok');
      if (g.SNCli && SNCli.preview) SNCli.preview('Logged in · ' + name);
      if (g.SNField && SNField.setNotice) SNField.setNotice('In · ' + String(name).slice(0, 24));
    } catch (_) {}

    // Profile tile
    try {
      if (g.SNTile && SNTile.openMe) SNTile.openMe(opts.tab || 'about');
    } catch (e2) {
      console.warn('[SNField] openMe', e2);
    }

    // Map at user / last known location
    try {
      var me = g.SNProfiles && SNProfiles.me && SNProfiles.me();
      var pos =
        (me && me.lat != null && { lat: me.lat, lng: me.lng }) ||
        g._snLastPos ||
        g._snPhysPos ||
        (g.SNTasks && SNTasks.pos) ||
        null;
      if (pos && pos.lat != null && g.SNMap && SNMap.open) {
        void SNMap.open(pos.lat, pos.lng).then(function () {
          try {
            if (SNMap.markYou) SNMap.markYou(pos.lat, pos.lng, name || 'YOU');
            if (SNMap.fitLatLngs)
              SNMap.fitLatLngs([{ lat: pos.lat, lng: pos.lng }], { zoom: 15, force: true });
            if (SNMap.showProfiles) SNMap.showProfiles();
          } catch (_) {}
        });
      } else if (g.SNCli && SNCli.run) {
        // No pin yet — soft locate without globe tour
        void SNCli.run('locate');
      }
    } catch (e3) {
      console.warn('[SNField] user map', e3);
    }
    return { ok: true, signed: true, name: name };
  }


  /** Polygon ribbon: overview (fit whole tour) ↔ GPS drive follow */
  var polyNavMode = 'off'; // off | polygon | drive
  var polyNavWatch = null;
  var polyNavGeoWatch = null;

  function polyNavOps(msg) {
    try {
      if (g.SNCli && SNCli.ops) SNCli.ops(String(msg).slice(0, 140));
      else if (g.SNCli && SNCli.log) SNCli.log(String(msg).slice(0, 140), 'ops', true);
    } catch (_) {}
  }

  function stopPolyDriveFollow() {
    if (polyNavWatch) {
      try {
        clearInterval(polyNavWatch);
      } catch (_) {}
      polyNavWatch = null;
    }
    if (polyNavGeoWatch != null && navigator.geolocation && navigator.geolocation.clearWatch) {
      try {
        navigator.geolocation.clearWatch(polyNavGeoWatch);
      } catch (_) {}
      polyNavGeoWatch = null;
    }
  }

  function readGpsOnce() {
    return new Promise(function (resolve) {
      var fallback =
        g._snLastPos ||
        (g.SNTasks && SNTasks.pos) ||
        focusPos();
      if (!navigator.geolocation) {
        resolve(fallback);
        return;
      }
      var done = false;
      var to = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(fallback);
      }, 4500);
      try {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            if (done) return;
            done = true;
            clearTimeout(to);
            var p = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              acc: pos.coords.accuracy,
            };
            g._snLastPos = p;
            try {
              if (g.SNTasks && SNTasks.setPos) SNTasks.setPos(p.lat, p.lng);
            } catch (_) {}
            resolve(p);
          },
          function () {
            if (done) return;
            done = true;
            clearTimeout(to);
            resolve(fallback);
          },
          { enableHighAccuracy: true, maximumAge: 8000, timeout: 4000 }
        );
      } catch (_) {
        clearTimeout(to);
        resolve(fallback);
      }
    });
  }

  function collectTourPoints() {
    var pts = [];
    var seen = {};
    function add(lat, lng) {
      if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return;
      var k = lat.toFixed(5) + ',' + lng.toFixed(5);
      if (seen[k]) return;
      seen[k] = 1;
      pts.push({ lat: Number(lat), lng: Number(lng) });
    }
    try {
      if (g.SNPolyScheduler && SNPolyScheduler.list) {
        var active = SNPolyScheduler.list().filter(function (o) {
          return (
            o &&
            (o.phase === 'claimed' ||
              o.phase === 'underway' ||
              o.phase === 'confirming' ||
              o.phase === 'offered')
          );
        });
        active.forEach(function (o) {
          add(o.vLat, o.vLng);
          add(o.dLat, o.dLng);
          (o.mids || []).forEach(function (m) {
            add(m.lat, m.lng);
          });
          (o.stops || []).forEach(function (st) {
            add(st.lat, st.lng);
          });
        });
        try {
          if (g.SNPolyEngine && SNPolyEngine.syncTourFromStack) {
            var tour = SNPolyEngine.syncTourFromStack(active.length ? active : SNPolyScheduler.list());
            if (tour && tour.stops) {
              tour.stops.forEach(function (st) {
                add(st.lat, st.lng);
              });
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
    // Radar routes fallback
    try {
      (routes || []).forEach(function (r) {
        (r.points || []).forEach(function (p) {
          add(p.lat, p.lng);
        });
      });
    } catch (_) {}
    return pts;
  }

  /**
   * Polygon mode: GPS recenter + fit entire tour polygon on map (any prior view).
   */
  async function enterPolygonOverview() {
    stopPolyDriveFollow();
    polyNavMode = 'polygon';
    try {
      document.body.classList.add('sn-poly-nav-overview');
      document.body.classList.remove('sn-poly-nav-drive');
    } catch (_) {}
    var gps = await readGpsOnce();
    // Tour points ONLY from accepted/active work — do not count "you" as a tour
    var tourPts = collectTourPoints() || [];
    try {
      if (g.SNPolyScheduler && g.SNPolyEngine && SNPolyEngine.syncTourFromStack) {
        SNPolyEngine.syncTourFromStack(SNPolyScheduler.list());
        tourPts = collectTourPoints() || tourPts;
      }
    } catch (_) {}

    var offerN = 0;
    var acceptedN = 0;
    var scheduleN = 0;
    try {
      if (g.SNOfferStack && SNOfferStack.list) {
        (SNOfferStack.list() || []).forEach(function (o) {
          if (!o) return;
          var ph = String(o.phase || o.status || '').toLowerCase();
          if (ph === 'offered' || ph === 'open') offerN++;
          if (ph === 'claimed' || ph === 'underway' || ph === 'accepted' || ph === 'paid')
            acceptedN++;
        });
      }
    } catch (_) {}
    try {
      if (g.SNTasks && SNTasks.list) {
        scheduleN = (SNTasks.list() || []).filter(function (t) {
          if (!t) return false;
          var st = String(t.status || '').toLowerCase();
          return st !== 'done' && st !== 'cancelled' && st !== 'complete';
        }).length;
      }
    } catch (_) {}
    try {
      if (g.SNPolyScheduler && SNPolyScheduler.list) {
        var sch = SNPolyScheduler.list() || [];
        if (sch.length) scheduleN = Math.max(scheduleN, sch.length);
      }
    } catch (_) {}

    // No real tour polygon yet
    if (!tourPts.length) {
      polyNavOps('POLYGON · no routing yet');
      try {
        if (g.SNCli && SNCli.log) {
          SNCli.log('POLYGON · no tour route right now', 'dim');
          SNCli.log(
            'You have not accepted any offers yet · no polygon routing for activities',
            'dim'
          );
          SNCli.log(
            'Schedule · not set up · accept an offer or create a plan to build the tour',
            'dim'
          );
          SNCli.log(
            'Open offers nearby: ' +
              offerN +
              ' · active tasks: ' +
              scheduleN +
              ' · accepted routes: ' +
              acceptedN,
            offerN || scheduleN ? 'ok' : 'dim'
          );
          SNCli.log('Tip · power ON · accept an offer · then ⬠ shows the full tour polygon', 'ok');
          if (SNCli.preview) SNCli.preview('POLYGON · empty');
        }
      } catch (_) {}
      // Still put you on the city map so you can tap YOU → me tile
      try {
        var here = gps || focusPos();
        if (here && here.lat != null && g.SNMap && SNMap.open) {
          await SNMap.open(here.lat, here.lng, { force: true, zoom: 15 });
          if (SNMap.markYou) SNMap.markYou(here.lat, here.lng, 'YOU');
          if (SNMap.fitLatLngs)
            SNMap.fitLatLngs([{ lat: here.lat, lng: here.lng }], { zoom: 15, force: true });
        }
      } catch (_) {}
      // Never open empty order tiles when there is no tour
      paintRibbon();
      return { ok: true, mode: 'polygon', empty: true, tour: 0 };
    }

    var pts = tourPts.slice();
    if (gps && gps.lat != null) pts.push({ lat: gps.lat, lng: gps.lng });
    var mid = tourPts[Math.floor(tourPts.length / 2)] || gps || focusPos();
    try {
      if (g.SNMap && SNMap.open) {
        await SNMap.open(mid.lat, mid.lng, { force: true });
      }
    } catch (_) {}

    try {
      if (g.SNMap && SNMap.fitLatLngs) {
        SNMap.fitLatLngs(pts, { force: true, padding: 56, maxZoom: 15, animate: true });
      }
    } catch (_) {}

    try {
      if (g.SNMap && SNMap.markYou && gps) SNMap.markYou(gps.lat, gps.lng, 'YOU');
    } catch (_) {}

    // Only open a real live order tile (never empty shell)
    try {
      var live =
        g.SNPolyScheduler &&
        SNPolyScheduler.list().find(function (o) {
          return (
            o &&
            (o.phase === 'underway' ||
              o.phase === 'claimed' ||
              o.phase === 'offered' ||
              o.phase === 'accepted')
          );
        });
      if (live && live.id && SNPolyScheduler.openOrderTile) {
        SNPolyScheduler.openOrderTile(live.id);
      } else if (live) {
        live.uiSize = 'mid';
        if (SNPolyScheduler.paint) SNPolyScheduler.paint();
      }
    } catch (_) {}

    try {
      setRadarExpanded(true);
    } catch (_) {}

    polyNavOps(
      'POLYGON · tour ' +
        tourPts.length +
        ' pts · GPS on map · tap ⬠ again for DRIVE'
    );
    try {
      if (g.SNCli && SNCli.log) {
        SNCli.log(
          'POLYGON · active tour · ' +
            tourPts.length +
            ' points · schedule items ' +
            scheduleN,
          'ok'
        );
      }
    } catch (_) {}
    paintRibbon();
    return { ok: true, mode: 'polygon', points: tourPts.length, empty: false };
  }

  /**
   * Drive mode: GPS follow, higher zoom, keep you centered on the route.
   */
  async function enterDriveMode() {
    polyNavMode = 'drive';
    try {
      document.body.classList.add('sn-poly-nav-drive');
      document.body.classList.remove('sn-poly-nav-overview');
    } catch (_) {}
    var gps = await readGpsOnce();
    var p = gps || focusPos();

    try {
      if (g.SNMap && SNMap.open) await SNMap.open(p.lat, p.lng, { force: true });
    } catch (_) {}

    try {
      if (g.SNMap && SNMap.map) {
        g.SNMap.map.setView([p.lat, p.lng], 17, { animate: true });
      }
    } catch (_) {}

    try {
      if (g.SNMap && SNMap.markYou) SNMap.markYou(p.lat, p.lng, 'DRIVE');
    } catch (_) {}

    // Keep tour polygon painted under the follow camera
    try {
      if (g.SNPolyScheduler && g.SNPolyEngine && SNPolyEngine.syncTourFromStack) {
        SNPolyEngine.syncTourFromStack(SNPolyScheduler.list());
      }
    } catch (_) {}

    stopPolyDriveFollow();
    function follow(lat, lng) {
      try {
        g._snLastPos = { lat: lat, lng: lng };
        if (g.SNTasks && SNTasks.setPos) SNTasks.setPos(lat, lng);
        if (g.SNMap && SNMap.map) {
          g.SNMap.map.setView([lat, lng], Math.max(16, g.SNMap.map.getZoom() || 17), {
            animate: false,
          });
        }
        if (g.SNMap && SNMap.markYou) SNMap.markYou(lat, lng, 'DRIVE');
      } catch (_) {}
    }

    if (navigator.geolocation && navigator.geolocation.watchPosition) {
      try {
        polyNavGeoWatch = navigator.geolocation.watchPosition(
          function (pos) {
            if (polyNavMode !== 'drive') return;
            follow(pos.coords.latitude, pos.coords.longitude);
          },
          function () {},
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
        );
      } catch (_) {}
    }
    // Fallback poll
    polyNavWatch = setInterval(function () {
      if (polyNavMode !== 'drive') return;
      void readGpsOnce().then(function (pp) {
        if (pp && pp.lat != null) follow(pp.lat, pp.lng);
      });
    }, 4000);

    polyNavOps('DRIVE · GPS follow · tap ⬠ for full polygon overview');
    paintRibbon();
    return { ok: true, mode: 'drive' };
  }

  async function cyclePolyNav() {
    try {
      if (polyNavMode === 'polygon') {
        return await enterDriveMode();
      }
      // off or drive → polygon overview (recenter + fit)
      return await enterPolygonOverview();
    } catch (e) {
      polyNavOps('Polygon nav · ' + (e && e.message ? e.message : e));
      return { ok: false };
    }
  }


  function ribbonAct(act) {
    // Locate = single action (GPS recenter) — no submenu
    if (act === 'locate') {
      try {
        if (g.SNCli && SNCli.run) void SNCli.run('locate');
      } catch (e) {}
      try {
        void readGpsOnce().then(function (pp) {
          if (!pp) return;
          try {
            if (g.SNMap && SNMap.markYou) SNMap.markYou(pp.lat, pp.lng, 'YOU');
          } catch (_) {}
          try {
            if (g.SNGlobe && SNGlobe.pulse) SNGlobe.pulse(pp.lat, pp.lng, 0x44ffaa, 'YOU', 12000);
            if (g.SNGlobe && SNGlobe.flyNear) SNGlobe.flyNear(pp.lat, pp.lng, 'city');
          } catch (_) {}
        });
      } catch (_) {}
      return;
    }
    // ⬠ Polygon = cycle: fit whole tour + GPS  ↔  GPS drive follow
    if (act === 'polygon' || act === 'poly' || act === 'tour') {
      var signedP = false;
      try {
        signedP = !!(g.SNAuth && SNAuth.user);
      } catch (_) {}
      var hereP = g._snPhysPos || (g.SNCli && SNCli.lastGps && SNCli.lastGps());
      if (!signedP || !hereP || hereP.lat == null) {
        try {
          if (g.SNCli && SNCli.log)
            SNCli.log(
              signedP
                ? 'POLYGON · tap Locate first, then Poly again.'
                : 'POLYGON · Sign in with Google, then Locate, then Poly.',
              'ok'
            );
          if (!signedP && g.SNAuth && (SNAuth.openModal || SNAuth.open))
            (SNAuth.openModal || SNAuth.open)();
        } catch (_) {}
        return;
      }
      void cyclePolyNav();
      return;
    }
    // User = login when out · when in: announce login + tile + map location
    if (act === 'user') {
      try {
        openLoggedInUser();
      } catch (eUser) {
        console.error('[SNField] user', eUser);
      }
      return;
    }
    // 📹 Call = first-class CLI ribbon · instant place / answer
    if (act === 'call' || act === 'video' || act === 'webrtc' || act === 'phone') {
      try {
        try {
          if (g.SNCli && SNCli.beginTurn) SNCli.beginTurn();
        } catch (_) {}
        function openCall() {
          if (g.SNWebRTC && (SNWebRTC.openFromRibbon || SNWebRTC.open)) {
            (SNWebRTC.openFromRibbon || SNWebRTC.open)();
            return true;
          }
          return false;
        }
        if (!openCall()) {
          var load = Promise.resolve();
          try {
            if (g.SNLoader && SNLoader.ensure) load = SNLoader.ensure('webrtc');
            else {
              var s = document.createElement('script');
              s.src = '/js/spacenet/webrtc.js';
              load = new Promise(function (res, rej) {
                s.onload = res;
                s.onerror = rej;
                document.head.appendChild(s);
              });
            }
          } catch (_) {}
          Promise.resolve(load)
            .then(function () {
              try {
                if (g.SNWebRTC && SNWebRTC.init) SNWebRTC.init();
                if (!openCall() && g.SNCli && SNCli.log)
                  SNCli.log('Call is not ready. Hard refresh.', 'err');
              } catch (e2) {
                if (g.SNCli && SNCli.log) SNCli.log('Call · ' + (e2.message || e2), 'err');
              }
            })
            .catch(function () {
              if (g.SNCli && SNCli.log) SNCli.log('Call module missing.', 'err');
            });
        }
      } catch (eCall) {
        console.error('[SNField] call', eCall);
      }
      return;
    }
    // ➕ Add → upward menu ONLY
    if (act === 'place' || act === 'add' || act === 'target' || act === 'pin') {
      openRibbonFlyout(
        'sn-rib-add',
        {
          title: 'ADD',
          items: [
            { id: 'pin', e: 'PIN', t: 'Pin', d: 'Single location on the map' },
            { id: 'targets', e: 'POLY', t: 'Polygon / targets', d: 'Multi points · measure land size' },
            /* video call is on main ribbon as Call */
            { id: 'vendor', e: 'SHOP', t: 'Vendor', d: 'List shop · sell in S' },
            { id: 'social', e: 'CAST', t: 'Social video post', d: 'Post video to the field' },
            { id: 'emergency', e: 'SOS', t: 'Emergency help', d: 'Urgent help on the map' },
          ],
        },
        function (id) {
          try {
            if (g.SNTopo && SNTopo.runAddOption) SNTopo.runAddOption(id);
            else if (g.SNTopo && SNTopo.openAddMenu) {
              if (typeof SNTopo._runAdd === 'function') SNTopo._runAdd(id);
              else if (g.SNCli && SNCli.log) SNCli.log('Add · ' + id + ' · hard refresh for full tool', 'dim');
            } else if (g.SNField && SNField.runAddOption) {
              SNField.runAddOption(id);
            } else if (g.SNCli && SNCli.log) {
              SNCli.log('Add · ' + id + ' · type: list shop  |  pin  |  post', 'ok');
            }
          } catch (e) {
            console.error('[SNField] add pick', e);
          }
        }
      );
      return;
    }
    // 🗺 Layers → upward menu of basemaps + overlays
    if (act === 'layers' || act === 'layer') {
      openRibbonFlyout(
        'sn-rib-layers',
        {
          title: 'LAYERS',
          items: [
            { id: 'panel', e: 'ALL', t: 'Full layers panel', d: 'Every map and overlay' },
            { id: 'satellite', e: 'SAT', t: 'Satellite', d: 'Real photo · Esri' },
            { id: 'gibs', e: 'NASA', t: 'Live NASA color', d: 'Yesterday from space' },
            { id: 'chloro', e: 'SEA', t: 'Sea color', d: 'Chlorophyll · dirty water' },
            { id: 'dark', e: 'DARK', t: 'Dark streets', d: 'Night streets' },
            { id: 'bright', e: 'LITE', t: 'Bright streets', d: 'Day streets' },
            { id: 'windy', e: 'WIND', t: 'Windy', d: 'Wind and rain' },
            { id: 'iss', e: 'ISS', t: 'ISS', d: 'Station now' },
            { id: 'planes', e: 'AIR', t: 'Planes', d: 'Live aircraft' },
            { id: 'ships', e: 'SEA', t: 'Ships', d: 'Sea marks' },
            { id: 'topo', e: 'MESH', t: 'Measure', d: 'Area · height · path' },
          ],
        },
        function (id) {
          void (async function () {
            try {
              var wantSat = id === 'satellite' || id === 'gibs' || id === 'chloro' || id === 'sst';
              await openCityMap({ imagery: wantSat, basemap: wantSat ? 'satellite' : undefined });
              try {
                if (g.SNMap && g.SNMap.map && g.SNMap.map.invalidateSize) g.SNMap.map.invalidateSize();
              } catch (_) {}
              if (id === 'panel') {
                if (g.SNMap && SNMap.openLayersPanel) SNMap.openLayersPanel();
                if (g.SNCli && SNCli.log) SNCli.log('Layers panel open. Tap a map or an overlay.', 'ok');
                return;
              }
              if (id === 'topo') {
                if (g.SNTopo && SNTopo.measureTopo) await SNTopo.measureTopo();
                else if (g.SNCli && SNCli.run) void SNCli.run('measure');
                return;
              }
              if (id === 'satellite' || id === 'dark' || id === 'bright' || id === 'google' || id === 'traffic') {
                if (g.SNMap && SNMap.setBasemap) SNMap.setBasemap(id, { user: true, log: true });
                if (g.SNCli && SNCli.log) SNCli.log('Map · ' + id + ' is on.', 'ok');
                if (g.SNCli && SNCli.preview) SNCli.preview('map · ' + id);
                return;
              }
              if (id === 'gibs' && g.SNMap && SNMap.showLiveSat) {
                var p = focusPos();
                await SNMap.showLiveSat(p.lat, p.lng, { zoom: 11, pollution: false, trueColor: true, plume: false, label: 'NASA' });
                return;
              }
              if (id === 'chloro' && g.SNMap && SNMap.showLiveSat) {
                var p2 = focusPos();
                await SNMap.showLiveSat(p2.lat, p2.lng, { zoom: 11, pollution: true, trueColor: true, plume: false, label: 'Sea color' });
                return;
              }
              if (g.SNMap && SNMap.toggleOverlay) {
                g.SNMap.toggleOverlay(id);
                if (g.SNCli && SNCli.log) SNCli.log('Overlay · ' + id, 'ok');
              }
            } catch (e) {
              if (g.SNCli && SNCli.log) SNCli.log('Layers · ' + (e.message || e), 'err');
            }
          })();
        }
      );
      return;
    }
    // AI ribbon = microphone + listen. Not a dummy Silver load.
    if (act === 'handsfree') {
      try {
        if (g.SNCli && typeof SNCli.toggleHandsfree === 'function') {
          SNCli.toggleHandsfree();
        } else if (g.SNAi && SNAi.listeningOn) {
          SNAi.listeningOn();
        } else {
          if (g.SNCli && SNCli.log) SNCli.log('Mic loading · type in the box, I still hear you.', 'dim');
        }
      } catch (e) {
        try {
          if (g.SNCli && SNCli.log) SNCli.log('AI mic · ' + (e.message || e), 'err');
        } catch (_) {}
      }
      return;
    }
    // Send = single action (no submenu)
    if (act === 'send') {
      var form = $('cli-form');
      if (form) {
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
      return;
    }
    if (g.SNCli && SNCli.run) void SNCli.run(act);
  }

  function userFaceUrl() {
    try {
      if (g.SNAuth && typeof SNAuth.avatarUrl === 'function') {
        var a = SNAuth.avatarUrl();
        if (a) return a;
      }
    } catch (_) {}
    try {
      var u = g.SNAuth && SNAuth.user;
      if (!u) return '';
      var md = u.user_metadata || {};
      if (md.avatar_url) return md.avatar_url;
      if (md.picture) return md.picture;
      if (md.avatar) return md.avatar;
      var id0 = u.identities && u.identities[0] && u.identities[0].identity_data;
      if (id0 && (id0.avatar_url || id0.picture)) return id0.avatar_url || id0.picture;
    } catch (_) {}
    return '';
  }

  function userShortName() {
    try {
      var u = g.SNAuth && SNAuth.user;
      if (!u) return '';
      var md = u.user_metadata || {};
      var full = md.full_name || md.name || '';
      if (full) return String(full).split(/\s+/)[0].slice(0, 10);
      if (u.email) return String(u.email).split('@')[0].slice(0, 10);
    } catch (_) {}
    return 'You';
  }

  /**
   * Permanent CLI top shortcut ribbon:
   * 🎯 Locate · 👤 User · ➕ Add · 🗺 Layers · 🎧 AI · ➤ Send
   * ONLY ➕ and Layers expand menus. All other keys = one action.
   */
  function paintRibbon() {
    var bar = $('sn-task-ribbon');
    if (!bar) return;
    bar.hidden = false;
    bar.removeAttribute('hidden');
    bar.setAttribute('aria-hidden', 'false');
    bar.setAttribute('aria-label', 'CLI shortcuts: locate polygon user call add layers AI send');
    var h = '';
    var i;
    var signedIn = !!(g.SNAuth && SNAuth.user);
    for (i = 0; i < RIBBON_CORE.length; i++) {
      var b = RIBBON_CORE[i];
      var onCls = b.act === 'add' && g.SNTopo && SNTopo.active ? ' on' : '';
      var label = b.text || b.act;
      var title = b.title || b.text;
      if (b.act === 'user') {
        var photo = userFaceUrl();
        var uname = userShortName();
        label = signedIn ? uname || 'You' : 'Login';
        title = signedIn
          ? 'Logged in as ' + (uname || 'you') + ' · still signed in'
          : 'Sign in · astranov.eu';
        if (signedIn) onCls += ' on';
        if (signedIn && photo) {
          b._face = photo;
        } else {
          b._face = '';
        }
      }
      if (b.act === 'polygon') {
        if (polyNavMode === 'drive') {
          label = 'Drive';
          title = 'GPS drive mode · tap for full polygon overview';
          onCls += ' on';
        } else if (polyNavMode === 'polygon') {
          label = 'Poly';
          title = 'Polygon overview · tap for GPS drive follow';
          onCls += ' on';
        } else {
          label = 'Poly';
          title = 'Show tour polygon · GPS recenter · fit whole route';
        }
      }
      h +=
        '<button type="button" class="sn-rib-btn sn-rib-core' +
        onCls +
        '" data-act="' +
        b.act +
        '"' +
        (b.id ? ' id="' + b.id + '"' : '') +
        ' title="' +
        title +
        '" aria-pressed="' +
        (onCls ? 'true' : 'false') +
        '">' +
        '<span class="sn-rib-emoji" aria-hidden="true">' +
        (b._face
          ? ''
          : b.act === 'handsfree' && g.SNCli && SNCli.handsfreeOn
            ? '🎙️'
            : b.emoji || '') +
        '</span>' +
        '<span class="sn-rib-icon' +
        (b._face ? '' : ' sn-rib-icon-svg') +
        '" aria-hidden="true">' +
        (b._face
          ? '<img class="sn-rib-face" alt="" src="' + String(b._face).replace(/"/g, '') + '">'
          : '') +
        '</span>' +
        '<span class="sn-rib-txt">' +
        label +
        '</span>' +
        '<span class="sn-rib-tip">' +
        title +
        '</span>' +
        '</button>';
    }
    if (notice) {
      try {
        if (g.SNCli && SNCli.preview) SNCli.preview(notice);
      } catch (e) {}
    }
    bar.innerHTML = h;
    try {
      var hf = $('sn-rib-hf');
      if (hf && g.SNCli && SNCli.handsfreeOn) hf.classList.add('on');
    } catch (e2) {}
    bar.querySelectorAll('[data-act]').forEach(function (btn) {
      var act = btn.getAttribute('data-act');
      btn.onclick = function (ev) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        ribbonAct(act);
        if (act !== 'layers' && act !== 'layer' && act !== 'add') setTimeout(paintRibbon, 50);
      };
    });
    try {
      if (g.SNScrolls && SNScrolls.paintSideRails) SNScrolls.paintSideRails();
    } catch (_) {}
  }

  function paint() {
    var C = g.SNCurrency;
    var bal = C ? C.balance() : 0;
    var fees =
      C && C.platformFees
        ? C.platformFees()
        : C && C.snapshot
          ? C.snapshot().platformFees || 0
          : 0;
    var s = $('fbh-s');
    if (s) {
      s.textContent = C
        ? C.formatCompact
          ? C.formatCompact(bal)
          : C.format(bal)
        : '◈ ' + Number(bal).toFixed(2);
    }
    var hudBal = $('field-balance-hud');
    if (hudBal) {
      hudBal.classList.remove('bal-pos', 'bal-zero', 'bal-neg');
      var bn = Number(bal) || 0;
      if (bn > 0.0001) hudBal.classList.add('bal-pos');
      else if (bn < -0.0001) hudBal.classList.add('bal-neg');
      else hudBal.classList.add('bal-zero');
    }
    var fe = $('fbh-fees');
    if (fe) {
      fe.textContent = 'vault ' + Number(fees).toFixed(2);
      fe.hidden = false;
    }
    var mr = $('fbh-mine-rate');
    if (mr) {
      var perDay = (mine.rate || 0) * 24;
      mr.textContent =
        (perDay >= 10 ? perDay.toFixed(1) : perDay.toFixed(2)) +
        ' AC/d' +
        (mine.on && mine.terms ? ' · on' : '');
    }
    paintLoadGraph();
    paintEconGraph();
    sampleDeviceMetrics();
    paintStcPerf();
    paintGadgetDetails();
    paintFleetMonitor();
    var hud = $('field-balance-hud');
    if (hud) {
      hud.classList.toggle('mining-active', !!mine.on && !!mine.terms);
      hud.title =
        'Astranov coins · mining ' +
        ((mine.rate || 0) * 24).toFixed(2) +
        ' AC/day · live economy · tap finance';
    }
    paintNavMeta();
    paintRibbon();
  }

  function drawSpark(canvasId, hist, color) {
    var c = $(canvasId);
    if (!c) return;
    var ctx = c.getContext('2d');
    if (!ctx) return;
    var w = c.width;
    var h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
    if (!hist || hist.length < 2) return;
    var i, x, y;
    ctx.beginPath();
    for (i = 0; i < hist.length; i++) {
      x = (i / (FLEET_HIST_N - 1)) * (w - 2) + 1;
      y = h - 2 - (Math.max(0, Math.min(100, hist[i])) / 100) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color || '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // fill under
    ctx.lineTo(w - 1, h - 1);
    ctx.lineTo(1, h - 1);
    ctx.closePath();
    ctx.fillStyle = (color || '#ffffff').replace(')', ',0.12)').replace('rgb', 'rgba').replace('#', '');
    // simple alpha fill
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = color || '#ffffff';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function pushHist(role, val) {
    if (!fleetHist[role]) fleetHist[role] = [];
    fleetHist[role].push(Math.max(0, Math.min(100, val)));
    if (fleetHist[role].length > FLEET_HIST_N) fleetHist[role].shift();
  }

  /**
   * Center slot under ASTRANOV: Main · Hot-swap · RAID resource graphs + state.
   */
  function paintFleetMonitor() {
    var root = $('sn-fleet-monitor');
    if (!root) return;
    var fleet = [];
    try {
      fleet = loadFleet() || [];
    } catch (_) {
      fleet = [];
    }
    var now = Date.now();
    var STALE_MS = 3 * 60 * 1000;
    var thisId = deviceId();
    var thisRole = mine.deviceRole || 'main';
    var thisLoad =
      mine.on && mine.terms
        ? Math.max(mine.rates.cpu || 0, 100 - (mine.spare || 0))
        : Math.max(8, (100 - (mine.spare || 50)) * 0.35);

    function bestForRole(role) {
      var list = fleet.filter(function (d) {
        return d && d.role === role;
      });
      // Prefer live this device if it matches role
      if (thisRole === role) {
        return {
          id: thisId,
          role: role,
          name: 'This device',
          live: true,
          self: true,
          load: thisLoad,
          mining: !!(mine.on && mine.terms),
          rate: mine.rate || 0,
          t: now,
        };
      }
      if (!list.length) return null;
      list.sort(function (a, b) {
        return (b.t || 0) - (a.t || 0);
      });
      var d = list[0];
      var live = now - (d.t || 0) < STALE_MS;
      var load = live
        ? Math.min(
            100,
            Math.max(
              8,
              d.load != null ? d.load : (d.harvest || 0.3) * 100 + (d.mining ? 18 : 0)
            )
          )
        : 4;
      return {
        id: d.id,
        role: role,
        name: d.name || d.id,
        live: live,
        self: d.id === thisId,
        load: load,
        mining: !!d.mining,
        rate: d.rate != null ? d.rate : 0,
        t: d.t || 0,
        count: list.length,
      };
    }

    var roles = [
      { id: 'main', color: '#ffffff', label: 'Main' },
      { id: 'secondary', color: '#88aaff', label: 'Hot-swap' },
      { id: 'raid', color: '#ffc857', label: 'RAID' },
    ];
    var liveN = 0;
    var mineN = 0;
    var raidNodes = 0;

    roles.forEach(function (r) {
      var d = bestForRole(r.id);
      // RAID array count
      if (r.id === 'raid') {
        raidNodes = fleet.filter(function (x) {
          return x.role === 'raid' && now - (x.t || 0) < STALE_MS;
        }).length;
        if (thisRole === 'raid') raidNodes = Math.max(raidNodes, 1);
      }
      var card = $('sfm-' + r.id);
      var st = $('sfm-' + r.id + '-state');
      var meta = $('sfm-' + r.id + '-meta');
      var load = d ? d.load : 0;
      // Keep a gentle idle wave when absent so cards don't look broken
      if (!d) load = 2 + Math.sin(now / 800 + r.id.length) * 1.5;
      pushHist(r.id, load);
      drawSpark('sfm-' + r.id + '-g', fleetHist[r.id], r.color);

      if (card) {
        card.classList.toggle('live', !!(d && d.live));
        card.classList.toggle('absent', !d);
        card.classList.toggle('raid', r.id === 'raid');
      }
      if (d && d.live) liveN++;
      if (d && d.mining) mineN++;

      if (st) {
        if (!d) {
          st.textContent = 'not registered';
        } else if (!d.live) {
          st.textContent = 'offline · ' + (d.name || '').slice(0, 14);
        } else if (d.self) {
          st.textContent =
            'THIS · ' +
            (d.mining ? 'mining' : 'live') +
            (document.hidden ? ' · bg' : '');
        } else {
          st.textContent = (d.mining ? 'mining · ' : 'online · ') + (d.name || 'node').slice(0, 12);
        }
      }
      if (meta) {
        if (!d) {
          meta.textContent = 'assign in ASTRANOV hub';
        } else if (r.id === 'raid') {
          meta.textContent =
            Math.round(load) +
            '% · ' +
            (raidNodes || (d.live ? 1 : 0)) +
            ' node' +
            (raidNodes === 1 ? '' : 's') +
            (d.rate ? ' · ' + (d.rate * 24).toFixed(2) + '/d' : '');
        } else {
          meta.textContent =
            Math.round(load) +
            '% load' +
            (d.mining ? ' · mine ON' : ' · idle') +
            (d.rate ? ' · ' + (d.rate * 24).toFixed(2) + '/d' : '');
        }
      }
    });

    var sum = $('sfm-sum');
    if (sum) {
      sum.textContent =
        liveN +
        ' live · ' +
        mineN +
        ' mining' +
        (raidNodes ? ' · RAID×' + raidNodes : '') +
        ' · ' +
        ((mine.rate || 0) * 24).toFixed(2) +
        'AC/d here';
    }

    // Tap → open science hub
    if (!root._snFleetTap) {
      root._snFleetTap = true;
      root.style.cursor = 'pointer';
      root.addEventListener('click', function () {
        try {
          if (g.SNHome && SNHome.open) SNHome.open();
          else if (g.SNCli && SNCli.run) SNCli.run('home');
        } catch (_) {}
      });
    }
  }

  function paintLoadGraph() {
    // loadHist filled by sampleDeviceMetrics / paint path
  }

  /** Economy performance samples (balance + vault) · called at 1 Hz */
  function sampleEconomy() {
    var C = g.SNCurrency;
    var bal = C && C.balance ? C.balance() : 0;
    var vault =
      C && C.platformFees
        ? C.platformFees()
        : C && C.snapshot
          ? C.snapshot().platformFees || 0
          : 0;
    var mined = C && C.mined ? C.mined() : 0;
    var rateDay = (mine.rate || 0) * 24;
    econHist.push({
      t: Date.now(),
      bal: bal,
      vault: vault,
      mined: mined,
      rate: rateDay,
      total: bal + vault,
    });
    if (econHist.length > ECON_HIST_N) econHist.shift();
  }

  /**
   * Live economic performance on money button — balance + vault, 1 Hz samples.
   */
  function paintEconGraph() {
    try {
      var panel = $('sn-topchrome-panel');
      if (panel && panel.classList.contains('collapsed')) return;
    } catch (_) {}
    var c = $('fbh-econ-graph');
    var lab = $('fbh-econ-label');
    if (!c) return;
    var ctx = c.getContext('2d');
    if (!ctx) return;
    if (!econHist.length) sampleEconomy();
    var w = c.width;
    var h = c.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    var gy;
    for (gy = 1; gy < 3; gy++) {
      ctx.beginPath();
      ctx.moveTo(0, (h * gy) / 3);
      ctx.lineTo(w, (h * gy) / 3);
      ctx.stroke();
    }

    if (econHist.length < 2) {
      if (lab) lab.textContent = 'economy · waiting samples…';
      return;
    }

    var i;
    var minV = Infinity;
    var maxV = -Infinity;
    for (i = 0; i < econHist.length; i++) {
      var tot = econHist[i].total;
      if (tot < minV) minV = tot;
      if (tot > maxV) maxV = tot;
      if (econHist[i].vault < minV) minV = econHist[i].vault;
      if (econHist[i].vault > maxV) maxV = econHist[i].vault;
    }
    if (!isFinite(minV) || !isFinite(maxV)) {
      minV = 0;
      maxV = 1;
    }
    if (maxV - minV < 0.05) {
      minV -= 0.25;
      maxV += 0.25;
    }
    var span = maxV - minV || 1;

    function yOf(v) {
      return h - 3 - ((v - minV) / span) * (h - 6);
    }
    function xOf(idx) {
      return (idx / (ECON_HIST_N - 1)) * (w - 2) + 1;
    }

    // vault (gold)
    ctx.beginPath();
    for (i = 0; i < econHist.length; i++) {
      var x = xOf(i);
      var y = yOf(econHist[i].vault);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,200,87,0.85)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // total economy cyan
    ctx.beginPath();
    for (i = 0; i < econHist.length; i++) {
      x = xOf(i);
      y = yOf(econHist[i].total);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineTo(xOf(econHist.length - 1), h - 1);
    ctx.lineTo(xOf(0), h - 1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(61,184,255,0.14)';
    ctx.fill();

    // wallet balance (ice)
    ctx.beginPath();
    for (i = 0; i < econHist.length; i++) {
      x = xOf(i);
      y = yOf(econHist[i].bal);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(168,236,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    var last = econHist[econHist.length - 1];
    var first = econHist[0];
    var lx = xOf(econHist.length - 1);
    var ly = yOf(last.total);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(lx, ly, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    var delta = last.total - first.total;
    var dSign = delta >= 0 ? '+' : '';
    var C = g.SNCurrency;
    var fmt = function (n) {
      return C && C.formatCompact ? C.formatCompact(n) : '⭐ ' + Number(n).toFixed(2);
    };
    if (lab) {
      lab.textContent =
        'eco ' +
        dSign +
        Number(delta).toFixed(2) +
        ' · ' +
        fmt(last.total) +
        ' · vault ' +
        Number(last.vault).toFixed(2) +
        ' · 1s';
    }
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function fmtClock(d, utc) {
    if (utc) {
      return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
    }
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function fmtLL(lat, lng) {
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return '—';
    return Number(lat).toFixed(3) + '°, ' + Number(lng).toFixed(3) + '°';
  }

  function placeNameNear(lat, lng) {
    try {
      if (g.SNGlobe && SNGlobe.nearestCity) {
        var c = SNGlobe.nearestCity(lat, lng);
        if (c && c.n) return c.n;
      }
    } catch (_) {}
    try {
      var me = g.SNProfiles && SNProfiles.me && SNProfiles.me();
      if (me && me.lat != null && Math.abs(me.lat - lat) < 0.05) return me.name || 'You';
    } catch (_) {}
    return null;
  }

  function paintNavMeta() {
    var now = new Date();
    var spd = pickSpeedMode();
    var spEl = $('fnm-speed');
    var modeEl = $('fnm-mode');
    var timeEl = $('fnm-time');
    var physEl = $('fnm-phys');
    var virtEl = $('fnm-virt');
    if (spEl) {
      var vtxt =
        spd.v >= 10000 ? Math.round(spd.v / 1000) + 'k' : String(Math.round(spd.v));
      spEl.textContent = vtxt + ' km/h';
    }
    if (modeEl) modeEl.textContent = spd.mode || '—';
    if (timeEl) {
      var show = now;
      if (timeline.offset !== 0) {
        show = new Date(now.getTime());
        show.setFullYear(timelineTargetYear());
      }
      var d =
        show.getFullYear() +
        '-' +
        String(show.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(show.getDate()).padStart(2, '0');
      // Stack: TIME (top) · DATE (middle line via #fnm-date) · LOCATION bottom
      timeEl.textContent = fmtClock(show, false);
      timeEl.classList.remove('tl-present', 'tl-past', 'tl-future', 'tl-frozen');
      var md = timelineMode();
      timeEl.classList.add('tl-' + md);
      if (timeline.frozen && md === 'past') timeEl.classList.add('tl-frozen');
      var dateEl = $('fnm-date');
      if (dateEl) {
        dateEl.textContent = d;
        dateEl.hidden = false;
        dateEl.classList.remove('tl-present', 'tl-past', 'tl-future', 'tl-frozen');
        dateEl.classList.add('tl-' + md);
        if (timeline.frozen && md === 'past') dateEl.classList.add('tl-frozen');
      }
    }
    var p =
      physPos ||
      g._snPhysPos ||
      (g.SNProfiles && SNProfiles.me && SNProfiles.me()) ||
      g._snLastPos;
    var pLat = p && p.lat != null ? p.lat : null;
    var pLng = p && p.lng != null ? p.lng : null;
    var pName = pLat != null ? placeNameNear(pLat, pLng) : null;
    if (physEl) {
      // City name only — never coordinates / GLOBAL / tier junk
      var loc = pName || (g._snCityLabel || '');
      if (loc && loc.length > 22) loc = loc.slice(0, 20) + '…';
      if (!loc) loc = '…';
      else g._snCityLabel = pName || g._snCityLabel;
      physEl.textContent = loc;
      physEl.hidden = false;
      physEl.classList.remove('tl-present', 'tl-past', 'tl-future', 'tl-frozen');
      var md2 = timelineMode();
      physEl.classList.add('tl-' + md2);
      if (timeline.frozen && md2 === 'past') physEl.classList.add('tl-frozen');
    }
    var v =
      (g.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      (g.SNMap && SNMap.active && g.SNMap.center && SNMap.center()) ||
      g._snLastPos;
    var vLat = v && v.lat != null ? v.lat : null;
    var vLng = v && v.lng != null ? v.lng : null;
    var tier =
      (g.SNGlobe && SNGlobe.currentTier && SNGlobe.currentTier()) ||
      (g.SNGlobe && SNGlobe.tier) ||
      'global';
    if (typeof tier === 'function') {
      try {
        tier = g.SNGlobe.currentTier();
      } catch (_) {
        tier = 'global';
      }
    }
    var vName = vLat != null ? placeNameNear(vLat, vLng) : null;
    if (virtEl) {
      // Never show virtual/tier/coords in collapsed chrome (overlaps ASTRANOV)
      virtEl.textContent = '';
      virtEl.hidden = true;
    }
  }


  function ensureBattery() {
    if (batteryApi || !navigator.getBattery) return;
    try {
      navigator.getBattery().then(function (b) {
        batteryApi = b;
        function sync() {
          batteryLevel = Math.round((b.level || 0) * 100);
          batteryCharging = !!b.charging;
        }
        sync();
        b.addEventListener('levelchange', sync);
        b.addEventListener('chargingchange', sync);
      }).catch(function () {});
    } catch (_) {}
  }

  /**
   * Sample CPU / RAM / battery / thermal proxies (browser-safe).
   * Temps are estimated from load + charge state when OS sensors unavailable.
   */
  function sampleDeviceMetrics() {
    ensureBattery();
    var cpu =
      mine.rates && mine.rates.cpu != null
        ? Number(mine.rates.cpu)
        : mine.on && mine.terms
          ? Math.max(20, 100 - (mine.spare || 40))
          : Math.max(6, (100 - (mine.spare || 55)) * 0.35);
    cpu = Math.max(0, Math.min(100, cpu));

    var ram = 18;
    try {
      if (performance && performance.memory && performance.memory.jsHeapSizeLimit) {
        ram = Math.round(
          (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
        );
      } else if (navigator.deviceMemory) {
        // Coarse: busier when mining
        ram = Math.min(92, 22 + (mine.on ? 28 : 8) + (cpu * 0.25));
      }
    } catch (_) {}
    ram = Math.max(0, Math.min(100, ram));

    var bat =
      batteryLevel != null
        ? batteryLevel
        : 100; // assume full until API reports
    bat = Math.max(0, Math.min(100, bat));

    // Thermal proxies (°C-ish 0–100 scale mapped to line % of danger zone)
    // CPU°C ~ 35 + load*0.55; BAT°C ~ 28 + (100-bat)*0.15 + charging heat
    var cpuTempC = 34 + cpu * 0.52 + (mine.on ? 6 : 0);
    var batTempC = 27 + (100 - bat) * 0.12 + (batteryCharging ? 8 : 0) + cpu * 0.08;
    // Map temps to 0–100 graph: 30°C=0 … 90°C=100 (limits visible)
    function tempPct(c) {
      return Math.max(0, Math.min(100, ((c - 30) / 60) * 100));
    }

    var sample = {
      t: Date.now(),
      cpu: cpu,
      ram: ram,
      bat: bat,
      cpuT: tempPct(cpuTempC),
      batT: tempPct(batTempC),
      cpuTempC: Math.round(cpuTempC),
      batTempC: Math.round(batTempC),
      charging: batteryCharging,
    };
    devHist.push(sample);
    if (devHist.length > DEV_HIST_N) devHist.shift();
    // Keep loadHist for fleet compatibility
    loadHist.push(cpu);
    if (loadHist.length > LOAD_HIST_N) loadHist.shift();

    checkDeviceAlerts(sample);
    return sample;
  }

  function playAlertTone(kind) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!g._snAudioCtx) g._snAudioCtx = new AC();
      var ctx = g._snAudioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      var o = ctx.createOscillator();
      var gain = ctx.createGain();
      o.connect(gain);
      gain.connect(ctx.destination);
      var now = ctx.currentTime;
      if (kind === 'battery') {
        o.frequency.setValueAtTime(880, now);
        o.frequency.setValueAtTime(660, now + 0.12);
        o.frequency.setValueAtTime(520, now + 0.24);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        o.start(now);
        o.stop(now + 0.48);
      } else {
        o.type = 'square';
        o.frequency.setValueAtTime(440, now);
        o.frequency.setValueAtTime(720, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
        o.start(now);
        o.stop(now + 0.3);
      }
    } catch (_) {}
  }

  function showDeviceAlert(msg, key) {
    var el = $('sn-device-alert');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sn-device-alert';
      el.setAttribute('role', 'alert');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(alertElTimer);
    alertElTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 5200);
    try {
      if (g.SNCli && SNCli.log) SNCli.log(msg, 'err');
      if (g.SNCli && SNCli.preview) SNCli.preview(msg);
    } catch (_) {}
  }

  function checkDeviceAlerts(s) {
    var now = Date.now();
    function cool(k, ms) {
      if (alertCool[k] && now - alertCool[k] < ms) return false;
      alertCool[k] = now;
      return true;
    }
    // Battery ≤ 33% — immediate notify + sound
    if (s.bat <= 33 && s.bat < 100) {
      if (cool('bat33', s.bat <= 15 ? 45000 : 90000)) {
        var msg =
          s.bat <= 15
            ? '⚠ Battery critical · ' + s.bat + '% · charge now'
            : '⚠ Battery low · ' + s.bat + '% · under ⅓ · charge soon';
        showDeviceAlert(msg, 'bat33');
        playAlertTone('battery');
      }
    }
    if (s.cpu >= 92 && cool('cpu', 120000)) {
      showDeviceAlert('⚠ CPU load high · ' + Math.round(s.cpu) + '%', 'cpu');
      playAlertTone('warn');
    }
    if (s.ram >= 90 && cool('ram', 120000)) {
      showDeviceAlert('⚠ RAM pressure · ' + Math.round(s.ram) + '%', 'ram');
      playAlertTone('warn');
    }
    if (s.cpuTempC >= 78 && cool('cput', 120000)) {
      showDeviceAlert('⚠ CPU temperature high · ~' + s.cpuTempC + '°C', 'cput');
      playAlertTone('warn');
    }
    if (s.batTempC >= 45 && cool('batt', 120000)) {
      showDeviceAlert('⚠ Battery temperature high · ~' + s.batTempC + '°C', 'batt');
      playAlertTone('warn');
    }
  }

  /**
   * Metric tracks: deep glowing blue when OK.
   * Soft off-limit → yellow · hard critical → red.
   * Layout per row: NAME | sparkline | value
   */
  var METRIC_LINES = [
    {
      key: 'cpu',
      label: 'CPU',
      invert: false,
      warn: 72,
      crit: 90,
      display: function (s) {
        return Math.round(s.cpu) + '%';
      },
    },
    {
      key: 'ram',
      label: 'RAM',
      invert: false,
      warn: 72,
      crit: 90,
      display: function (s) {
        return Math.round(s.ram) + '%';
      },
    },
    {
      key: 'bat',
      label: 'BAT',
      invert: true,
      warn: 45,
      crit: 33,
      display: function (s) {
        return Math.round(s.bat) + '%' + (s.charging ? '⚡' : '');
      },
    },
    {
      key: 'cpuT',
      label: 'CPU°',
      invert: false,
      warn: 62,
      crit: 78,
      display: function (s) {
        return '~' + s.cpuTempC + '°C';
      },
      valueOf: function (s) {
        return s.cpuTempC;
      },
    },
    {
      key: 'batT',
      label: 'BAT°',
      invert: false,
      warn: 36,
      crit: 45,
      display: function (s) {
        return '~' + s.batTempC + '°C';
      },
      valueOf: function (s) {
        return s.batTempC;
      },
    },
  ];

  function metricSeverity(m, sample) {
    var raw =
      m.valueOf && sample
        ? Number(m.valueOf(sample))
        : Number(sample && sample[m.key]);
    if (!isFinite(raw)) return 'ok';
    if (m.invert) {
      if (raw <= m.crit) return 'crit';
      if (raw <= m.warn) return 'warn';
      return 'ok';
    }
    if (raw >= m.crit) return 'crit';
    if (raw >= m.warn) return 'warn';
    return 'ok';
  }

  function metricColor(sev) {
    if (sev === 'crit') return '#e11d38';
    if (sev === 'warn') return '#d4a017';
    // deep blue — readable on light and dark glass
    try {
      if (document.documentElement.classList.contains('theme-light') ||
          (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches &&
            !document.documentElement.classList.contains('theme-dark'))) {
        return '#c8c8c8';
      }
    } catch (_) {}
    return '#c8c8c8';
  }

  /** One device graph under ASTRANOV — labeled rows · expands with top scroll */
  function paintStcPerf() {
    var c = $('stc-perf');
    var wrap = $('stc-perf-wrap');
    if (!c) return;
    try {
      if (document.body.classList.contains('sn-offer-focus')) return;
    } catch (_) {}
    var ctx = c.getContext('2d');
    if (!ctx) return;
    if (!devHist.length) sampleDeviceMetrics();
    var last = devHist.length ? devHist[devHist.length - 1] : sampleDeviceMetrics();

    var cssW = 200;
    var cssH = 92;
    if (wrap) {
      var r = wrap.getBoundingClientRect();
      if (r.width > 20) cssW = Math.round(r.width);
      if (r.height > 20) cssH = Math.round(r.height);
    }
    try {
      var panel = $('sn-topchrome-panel');
      if (panel) {
        if (panel.classList.contains('expanded')) cssH = Math.max(cssH, 96);
        else if (panel.classList.contains('mid')) cssH = Math.max(cssH, 68);
        else cssH = Math.max(cssH, 30);
      }
    } catch (_) {}

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var needW = Math.max(80, Math.round(cssW * dpr));
    var needH = Math.max(60, Math.round(cssH * dpr));
    if (c.width !== needW || c.height !== needH) {
      c.width = needW;
      c.height = needH;
    }
    var w = c.width;
    var h = c.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var nRows = METRIC_LINES.length;
    var padX = 4 * dpr;
    var padY = 3 * dpr;
    var gap = 3 * dpr;
    var rowH = (h - padY * 2 - gap * (nRows - 1)) / nRows;
    var labelW = Math.max(28 * dpr, Math.min(44 * dpr, w * 0.14));
    var valueW = Math.max(36 * dpr, Math.min(56 * dpr, w * 0.18));
    var sparkL = padX + labelW + 4 * dpr;
    var sparkR = w - padX - valueW - 4 * dpr;
    var sparkW = Math.max(20 * dpr, sparkR - sparkL);

    var fontPx = Math.max(8 * dpr, Math.min(11 * dpr, rowH * 0.42));
    ctx.textBaseline = 'middle';
    ctx.font =
      '700 ' + fontPx + 'px "Nunito", "Comfortaa", system-ui, sans-serif';

    var hist = devHist.length ? devHist : [last];
    var iRow;
    for (iRow = 0; iRow < nRows; iRow++) {
      var m = METRIC_LINES[iRow];
      var y0 = padY + iRow * (rowH + gap);
      var yMid = y0 + rowH * 0.5;
      var sev = metricSeverity(m, last);
      var col = metricColor(sev);
      var glow =
        sev === 'ok'
          ? 'rgba(26,140,255,0.55)'
          : sev === 'warn'
            ? 'rgba(255,200,87,0.55)'
            : 'rgba(255,77,94,0.6)';

      ctx.fillStyle =
        document.documentElement.classList.contains('theme-light')
          ? 'rgba(30, 100, 200, 0.08)'
          : 'rgba(8, 30, 70, 0.28)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(padX, y0, w - padX * 2, rowH, 3 * dpr);
      else ctx.rect(padX, y0, w - padX * 2, rowH);
      ctx.fill();

      ctx.fillStyle = col;
      ctx.shadowColor = glow;
      ctx.shadowBlur = sev === 'ok' ? 6 * dpr : 8 * dpr;
      ctx.textAlign = 'left';
      ctx.fillText(m.label, padX + 3 * dpr, yMid);
      ctx.shadowBlur = 0;

      var sparkTop = y0 + 3 * dpr;
      var sparkBot = y0 + rowH - 3 * dpr;
      var sparkH = Math.max(4 * dpr, sparkBot - sparkTop);
      if (hist.length >= 1) {
        var j;
        var n = hist.length;
        ctx.beginPath();
        for (j = 0; j < n; j++) {
          var v = Number(hist[j][m.key]);
          if (!isFinite(v)) v = 0;
          v = Math.max(0, Math.min(100, v));
          var x = sparkL + (j / Math.max(n - 1, 1)) * sparkW;
          var y = sparkBot - (v / 100) * sparkH;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.2 * dpr, 1.4 * dpr);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = glow;
        ctx.shadowBlur = 5 * dpr;
        ctx.stroke();
        ctx.shadowBlur = 0;
        var lastV = Number(hist[n - 1][m.key]);
        if (!isFinite(lastV)) lastV = 0;
        lastV = Math.max(0, Math.min(100, lastV));
        var lx = sparkL + sparkW;
        var ly = sparkBot - (lastV / 100) * sparkH;
        ctx.fillStyle = col;
        ctx.shadowColor = glow;
        ctx.shadowBlur = 6 * dpr;
        ctx.beginPath();
        ctx.arc(lx, ly, 1.8 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = col;
      ctx.shadowColor = glow;
      ctx.shadowBlur = sev === 'ok' ? 5 * dpr : 7 * dpr;
      ctx.textAlign = 'right';
      ctx.fillText(m.display(last), w - padX - 2 * dpr, yMid);
      ctx.shadowBlur = 0;
    }
  }

  function paintGadgetDetails() {
    // Device numbers live on the single expanding graph (paintStcPerf)
    var rn = $('stc-radar-rng');
    if (rn) rn.textContent = radarZoom.toFixed(1) + '×';
    var rN = $('stc-radar-n');
    if (rN) rN.textContent = String((blips && blips.length) || 0);
    var rR = $('stc-radar-routes');
    if (rR) rR.textContent = String((routes && routes.length) || 0);
    var rS = $('stc-radar-spd');
    if (rS) {
      var spd = pickSpeedMode();
      rS.textContent = Math.round(spd.v) + ' km/h';
    }

    var C = g.SNCurrency;
    var bal = C && C.balance ? C.balance() : 0;
    var vault = C && C.platformFees ? C.platformFees() : 0;
    var mined = C && C.mined ? C.mined() : 0;
    var fmt = function (n) {
      return C && C.formatCompact ? C.formatCompact(n) : '⭐ ' + Number(n).toFixed(2);
    };
    var mb = $('stc-money-bal');
    if (mb) mb.textContent = fmt(bal);
    var mr = $('stc-money-rate');
    if (mr) mr.textContent = ((mine.rate || 0) * 24).toFixed(2) + ' AC/d';
    var mv = $('stc-money-vault');
    if (mv) mv.textContent = fmt(vault);
    var mm = $('stc-money-mined');
    if (mm) mm.textContent = fmt(mined);
  }

  function bindTopChrome() {
    var panel = $('sn-topchrome-panel');
    var handle = $('sn-topchrome-drag');
    if (!panel || panel._stcBound) return;
    panel._stcBound = true;
    try {
      document.body.classList.add('stc-on');
    } catch (_) {}
    // Top scroll stays at top edge — hard pin
    try {
      var host = $('sn-topchrome');
      if (host) {
        host.style.setProperty('position', 'fixed', 'important');
        host.style.setProperty('top', '0px', 'important');
        host.style.setProperty('left', '0px', 'important');
        host.style.setProperty('right', '0px', 'important');
        host.style.setProperty('bottom', 'auto', 'important');
        host.style.setProperty('transform', 'none', 'important');
        host.style.setProperty('margin', '0px', 'important');
      }
      panel.style.setProperty('position', 'relative', 'important');
      panel.style.setProperty('left', 'auto', 'important');
      panel.style.setProperty('top', 'auto', 'important');
      panel.style.setProperty('right', 'auto', 'important');
      panel.style.setProperty('bottom', 'auto', 'important');
      panel.style.setProperty('transform', 'none', 'important');
    } catch (_) {}

    var KEY = 'sn:topchrome-size-v1';
    var startY = 0;
    var startH = 0;
    var dragging = false;
    var moved = false;
    var ptrId = null;

    function oppositeReserve() {
      // Collapsed bottom footprint + air gap (~20px) so scrolls never touch
      return 150;  // bottom collapsed ~118 + gap ~32
    }
    function sizePx(mode) {
      var h = window.innerHeight || 700;
      var MIN = 54;
      // Expand enough for device + fleet graph gadgets (hub text stays hidden in CSS)
      var FULL = Math.max(MIN + 80, Math.min(Math.round(h * 0.55), h - oppositeReserve()));
      if (mode === 'collapsed') return 72;
      if (mode === 'expanded') return FULL;
      return Math.max(MIN, Math.min(Math.round(h * 0.38), FULL));
    }
    function recapBottomForTop(topPx) {
      try {
        var bot = document.getElementById('panel');
        if (!bot || bot.classList.contains('collapsed')) return;
        var h = window.innerHeight || 700;
        var maxB = Math.max(96, h - topPx - 20);
        var bh = bot.getBoundingClientRect().height;
        if (bh > maxB + 2) {
          bot.style.setProperty('max-height', maxB + 'px', 'important');
          bot.style.setProperty('height', maxB + 'px', 'important');
          var law = document.getElementById('sn-bot-scroll-law');
          if (law)
            law.textContent =
              '#panel.mid,#panel.expanded{max-height:' +
              maxB +
              'px!important;height:' +
              maxB +
              'px!important}';
        }
      } catch (_) {}
    }

    function setMode(mode, animate, freeH) {
      try {
        if (mode === 'expanded' || mode === 'mid')
          document.body.classList.remove('sn-offer-focus');
      } catch (_) {}
      panel.classList.remove('collapsed', 'mid', 'expanded');
      panel.classList.add(mode);
      if (animate !== false) panel.classList.add('stc-anim');
      else panel.classList.remove('stc-anim');
      var MIN = sizePx('collapsed');
      var px = freeH != null ? freeH : sizePx(mode);
      if (!(px >= MIN)) px = MIN;
      // Collapsed: auto height so gadgets never clip; still floor min-height
      var law = document.getElementById('sn-top-scroll-law');
      if (!law) {
        law = document.createElement('style');
        law.id = 'sn-top-scroll-law';
        document.head.appendChild(law);
      }
      if (mode === 'collapsed') {
        panel.style.removeProperty('max-height');
        panel.style.removeProperty('height');
        panel.style.removeProperty('min-height');
        panel.style.setProperty('height', 'auto', 'important');
        panel.style.setProperty('min-height', '0', 'important');
        panel.style.setProperty('max-height', 'none', 'important');
        law.textContent =
          'html body #sn-topchrome #sn-topchrome-panel.collapsed{max-height:none !important;height:auto !important;min-height:0 !important;}';
        try {
          document.head.appendChild(law);
        } catch (_) {}
      } else {
        panel.style.setProperty('max-height', px + 'px', 'important');
        panel.style.setProperty('height', px + 'px', 'important');
        panel.style.setProperty('min-height', px + 'px', 'important');
        // height+min-height forced — max-height cascade is polluted with 58px caps
        law.textContent =
          'html body #sn-topchrome #sn-topchrome-panel.mid,' +
          'html body #sn-topchrome #sn-topchrome-panel.expanded{' +
          'max-height:' +
          px +
          'px !important;height:' +
          px +
          'px !important;min-height:56px !important;overflow:hidden !important;}' +
          'html body #sn-topchrome #stc-gadgets{overflow-y:auto !important;overflow-x:hidden !important;' +
          '-webkit-overflow-scrolling:touch !important;touch-action:pan-y !important;flex:1 1 auto !important;min-height:0 !important;}' +
          'html body #sn-topchrome{max-height:none !important;height:auto !important;overflow:visible !important;}' +
          'html body #sn-hub-host{display:none !important;}';
        try {
          document.head.appendChild(law);
        } catch (_) {}
        recapBottomForTop(px);
      }
      try {
        localStorage.setItem(KEY, mode);
      } catch (_) {}
      try {
        requestAnimationFrame(function () {
          try { paintStcPerf(); } catch (_) {}
          try { if (mode !== 'collapsed') paintGadgetDetails(); } catch (_) {}
          if (mode !== 'collapsed' && g.SNHome && SNHome.paintHub) SNHome.paintHub();
        });
      } catch (_) {}
      setTimeout(function () {
        try {
          syncRadarCanvas();
          drawRadar();
        } catch (_) {}
      }, 40);
    }

    try {
      // v8 clean: always boot collapsed so chrome is never a tall mess
      setMode('collapsed', false);
      localStorage.setItem(KEY, 'collapsed');
    } catch (_) {
      setMode('collapsed', false);
    }

    function onDown(e) {
      if (e.pointerType === 'touch' && e.isPrimary === false) return;
      if (e.button != null && e.button !== 0) return;
      var t = e.target;
      // RESIZE only from the bottom handle — never steal one-finger scroll inside gadgets
      if (!(t && t.closest && t.closest('#sn-topchrome-drag'))) return;
      startY = e.clientY;
      startH = panel.getBoundingClientRect().height || sizePx('collapsed');
      dragging = true;
      moved = false;
      ptrId = e.pointerId;
      panel.classList.add('dragging');
      panel.classList.remove('stc-anim');
      try {
        // Capture on handle only so gadget list keeps native pan-y scroll
        if (handle && handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
        else panel.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    function onMove(e) {
      if (!dragging) return;
      if (ptrId != null && e.pointerId !== ptrId) return;
      var dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < 6) return;
      moved = true;
      // Drag DOWN expands (opposite of CLI which expands upward)
      var MIN = sizePx('collapsed');
      var next = Math.max(MIN, Math.min(sizePx('expanded'), startH + dy));
      panel.style.setProperty('max-height', next + 'px', 'important');
      panel.style.setProperty('height', next + 'px', 'important');
      panel.style.setProperty('min-height', next + 'px', 'important');
      panel.classList.remove('collapsed', 'mid', 'expanded');
      if (next <= MIN + 8) panel.classList.add('collapsed');
      else if (next > sizePx('expanded') - 24) panel.classList.add('expanded');
      else panel.classList.add('mid');
      try {
        var law = document.getElementById('sn-top-scroll-law');
        if (!law) {
          law = document.createElement('style');
          law.id = 'sn-top-scroll-law';
          document.head.appendChild(law);
        }
        if (next <= MIN + 8) {
          law.textContent =
            '#sn-topchrome-panel.collapsed{max-height:none!important;height:auto!important;min-height:0!important}';
        } else {
          law.textContent =
            '#sn-topchrome-panel.mid,#sn-topchrome-panel.expanded{max-height:' +
            next +
            'px!important;height:' +
            next +
            'px!important}';
        }
      } catch (_) {}
      if (e.cancelable) e.preventDefault();
    }

    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('dragging');
      try {
        if (ptrId != null) panel.releasePointerCapture(ptrId);
      } catch (_) {}
      ptrId = null;
      if (!moved) return;
      var h = panel.getBoundingClientRect().height || startH;
      var pick = 'mid';
      if (h <= sizePx('collapsed') + 12) pick = 'collapsed';
      else if (h > sizePx('expanded') - 30) pick = 'expanded';
      setMode(pick, true, null);
    }

    var fromHandle = false;
    var handleDownY = 0;
    var handleDownT = 0;

    function onDownWrap(e) {
      fromHandle = !!(e && e.target && e.target.closest && e.target.closest('#sn-topchrome-drag'));
      handleDownY = e.clientY;
      handleDownT = performance.now();
      onDown(e);
    }

    function onUpWrap(e) {
      var wasHandle = fromHandle;
      var dy = e && e.clientY != null ? e.clientY - handleDownY : 0;
      var dt = performance.now() - handleDownT;
      var wasMoved = moved;
      onUp(e);
      // Tap on handle (small motion) → toggle gadgets — drag still resizes via onUp
      if (wasHandle && Math.abs(dy) < 22 && dt < 700) {
        // If user did not drag enough to resize, toggle open/closed
        if (!wasMoved || Math.abs(dy) < 12) {
          var m = panel.classList.contains('collapsed') ? 'expanded' : 'collapsed';
          panel.dataset.stcToggleAt = String(performance.now());
          setMode(m, true);
          try {
            if (g.SNCli && SNCli.ops)
              SNCli.ops(m === 'expanded' ? 'Gadgets open · tap handle' : 'Gadgets closed');
          } catch (_) {}
        }
      }
      fromHandle = false;
    }

    handle && handle.addEventListener('pointerdown', onDownWrap);
    panel.addEventListener('pointerdown', onDownWrap);
    panel.addEventListener('pointermove', onMove, { passive: false });
    panel.addEventListener('pointerup', onUpWrap);
    panel.addEventListener('pointercancel', onUpWrap);
    // Fallback click (mouse / accessibility)
    handle &&
      handle.addEventListener('click', function (ev) {
        try {
          if (ev && ev.preventDefault) ev.preventDefault();
        } catch (_) {}
        // Only if not a drag end already handled
        if (Math.abs((ev.clientY || 0) - handleDownY) > 22) return;
        var m = panel.classList.contains('collapsed') ? 'expanded' : 'collapsed';
        // avoid double-toggle if pointerup already switched within 50ms
        if (performance.now() - handleDownT < 50) return;
        if (panel.dataset.stcToggleAt && performance.now() - Number(panel.dataset.stcToggleAt) < 350)
          return;
        panel.dataset.stcToggleAt = String(performance.now());
        setMode(m, true);
        try {
          if (g.SNCli && SNCli.ops)
            SNCli.ops(m === 'expanded' ? 'Gadgets open' : 'Gadgets closed');
        } catch (_) {}
      });


    // Overscroll past end of inner content → retract whole top scroll
    (function bindTopOverscrollRetract() {
      var accum = 0;
      var lastTY = null;
      var THRESH = 56;
      function expanded() {
        return panel.classList.contains('expanded') || panel.classList.contains('mid');
      }
      function scroller() {
        // One-finger scroll lives on the gadgets stack, not the whole panel
        return $('stc-gadgets') || $('stc-detail') || panel;
      }
      function atEnd(el, dir) {
        // dir > 0 = scrolling content down (toward end); dir < 0 = toward start
        if (!el) return true;
        var max = Math.max(0, el.scrollHeight - el.clientHeight);
        if (max < 4) return true; // no inner scroll room — any continue retracts
        if (dir > 0) return el.scrollTop >= max - 2;
        return el.scrollTop <= 1;
      }
      function tick(dir, amount) {
        if (!expanded()) {
          accum = 0;
          return false;
        }
        if (!atEnd(scroller(), dir)) {
          accum = 0;
          return false;
        }
        accum += Math.abs(amount || 0);
        if (accum >= THRESH) {
          accum = 0;
          setMode('collapsed', true);
          return true;
        }
        return true; // consume overscroll
      }
      panel.addEventListener(
        'wheel',
        function (e) {
          if (!expanded()) return;
          var dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
          if (!dir) return;
          var sc = scroller();
          // Prefer scrolling gadgets; only collapse when already at end
          if (sc && sc !== panel && sc.scrollHeight > sc.clientHeight + 4) {
            if (!atEnd(sc, dir)) {
              // let the event reach #stc-gadgets
              return;
            }
          }
          if (tick(dir, e.deltaY)) {
            if (e.cancelable) e.preventDefault();
          }
        },
        { passive: false }
      );
      panel.addEventListener(
        'touchstart',
        function (e) {
          if (!expanded() || !e.touches || !e.touches[0]) return;
          lastTY = e.touches[0].clientY;
          accum = 0;
        },
        { passive: true }
      );
      panel.addEventListener(
        'touchmove',
        function (e) {
          if (!expanded() || lastTY == null || !e.touches || !e.touches[0]) return;
          // If finger is on gadgets list, let native one-finger scroll run unless at edge
          var y = e.touches[0].clientY;
          var dy = lastTY - y; // positive = finger up = content scroll down
          lastTY = y;
          if (Math.abs(dy) < 1) return;
          var dir = dy > 0 ? 1 : -1;
          var sc = scroller();
          // Mid-list: never preventDefault — browser pans the gadgets
          if (!atEnd(sc, dir)) {
            accum = 0;
            return;
          }
          // At edge: accumulate toward collapse; only then block bounce
          if (tick(dir, dy * 1.4)) {
            if (accum >= THRESH * 0.5 && e.cancelable) e.preventDefault();
          }
        },
        { passive: false }
      );
      panel.addEventListener(
        'touchend',
        function () {
          lastTY = null;
          accum = Math.min(accum, THRESH * 0.4);
        },
        { passive: true }
      );
    })();

    g.SNTopChrome = {
      set: setMode,
      expand: function () {
        setMode('expanded', true);
      },
      collapse: function () {
        setMode('collapsed', true);
      },
      toggle: function () {
        setMode(panel.classList.contains('expanded') ? 'collapsed' : 'expanded', true);
      },
    };
  }

  function refreshPhysPos() {
    if (!navigator.geolocation) return;
    try {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          physPos = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            t: Date.now(),
          };
          g._snPhysPos = physPos;
          paintNavMeta();
        },
        function () {},
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
      );
    } catch (_) {}
  }

  function noteFrame() {
    var now = performance.now();
    if (lastF) {
      var dt = now - lastF;
      if (dt > 0 && dt < 500) {
        fpsBuf.push(1000 / dt);
        if (fpsBuf.length > 30) fpsBuf.shift();
        var s = 0;
        for (var i = 0; i < fpsBuf.length; i++) s += fpsBuf[i];
        mine.fps = Math.round(s / fpsBuf.length);
      }
    }
    lastF = now;
    var load = document.hidden ? 0.15 : mine.fps >= 40 ? 0.25 : mine.fps >= 25 ? 0.45 : 0.7;
    mine.spare = Math.max(0, Math.min(100, Math.round((1 - load) * 80) - (mine.donate ? 15 : 0)));
  }

  /**
   * SETI-style mesh donation: idle Web Worker burns spare CPU when donate is on.
   * Rewards S from spare capacity so global users fund the net without servers only.
   */
  function ensureMineWorker() {
    if (mine.worker || typeof Worker === 'undefined') return;
    try {
      var src =
        'var n=0;onmessage=function(e){var ops=e.data&&e.data.ops||40000;var h=0|0;for(var i=0;i<ops;i++){h=((h<<5)-h+i)|0;n++;}postMessage({ops:ops,h:h,n:n});};';
      var blob = new Blob([src], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      mine.worker = new Worker(url);
      mine.worker.onmessage = function (ev) {
        if (ev && ev.data && ev.data.ops) mine.workerOps += Number(ev.data.ops) || 0;
      };
      mine.worker.onerror = function () {
        try {
          mine.worker.terminate();
        } catch (e) {}
        mine.worker = null;
      };
    } catch (e) {
      mine.worker = null;
    }
  }

  function stopMineWorker() {
    if (!mine.worker) return;
    try {
      mine.worker.terminate();
    } catch (e) {}
    mine.worker = null;
  }

  function tickMine(dt) {
    noteFrame();
    if (!mine.on || !mine.terms) {
      mine.rate = 0;
      if (!mine.on) stopMineWorker();
      return;
    }
    var prof = roleProfile();
    var load = document.hidden ? 0.12 : mine.fps >= 40 ? 0.28 : mine.fps >= 25 ? 0.45 : 0.65;
    if (mine.donate) {
      ensureMineWorker();
      load = document.hidden ? 0.06 : Math.min(load, 0.42);
    }
    // Secondary: battery first — throttle hard when tab foreground
    if (prof.preferHidden && !document.hidden) load = Math.max(load, 0.55);
    // Stop if approaching role load cap (protect battery / TJ)
    if (load > (prof.loadCap != null ? prof.loadCap : 0.85)) {
      mine.rate = 0;
      mine.rates.cpu = Math.round(load * 100);
      return;
    }
    var budget = Math.max(0.02, 1 - load) * (prof.harvest || 0.3);
    var tj = prof.tjMax != null ? prof.tjMax : 1;
    var maxB = Math.min(prof.maxBudget != null ? prof.maxBudget : 1, tj);
    if (budget > maxB) budget = maxB;
    var cores = navigator.hardwareConcurrency || 4;
    var ops = Math.floor(1600 * budget * (cores / 8) * Math.min(dt / 500, 1));
    var h = 0;
    var i;
    for (i = 0; i < ops; i++) h = ((h << 5) - h + i) | 0;
    if (mine.donate && mine.worker) {
      try {
        var wops = Math.floor(
          18000 * budget * (prof.workerScale || 1) * (document.hidden ? 2.0 : 0.9)
        );
        // RAID stays below TJ max worker thrash
        if (prof.tjMax != null) wops = Math.floor(wops * prof.tjMax);
        mine.worker.postMessage({ ops: Math.max(500, wops) });
      } catch (eW) {}
    }
    mine.rates.cpu = Math.min(
      Math.round(100 * maxB),
      Math.round(budget * cores * (mine.donate ? 10 : 6) * (prof.workerScale || 1))
    );
    mine.rates.ram = Math.round((navigator.deviceMemory || 4) * 48 * budget);
    mine.rates.storage = Math.round(28 * budget);
    mine.rates.bandwidth = Math.round(160 * budget);
    mine.rate =
      0.012 * budget * (document.hidden ? 1.6 : prof.preferHidden ? 0.55 : 1);
    if (mine.donate) {
      mine.rate *= (document.hidden ? 2.8 : 1.6) * (prof.donateBoost || 1);
      mine.meshPeers = Math.max(1, Math.min(99, Math.round(1 + budget * cores)));
    } else {
      mine.meshPeers = 1;
    }
    // Fleet RAID array multiplies when this node is raid and other raid peers registered
    try {
      var fleet = loadFleet();
      var raidN = fleet.filter(function (d) {
        return d.role === 'raid' && d.id !== deviceId();
      }).length;
      if (mine.deviceRole === 'raid' && raidN > 0) {
        mine.rate *= 1 + Math.min(0.6, raidN * 0.12);
        mine.meshPeers = Math.min(99, mine.meshPeers + raidN);
      }
    } catch (_) {}
    try {
      var me = g.SNProfiles && SNProfiles.me && SNProfiles.me();
      if (me && me.roles && me.roles.ambassador && me.ambassadorOnline !== false) {
        mine.rate += 0.005 * budget;
      }
    } catch (e) {}
    if (mine.rate > 0) {
      var earn = mine.rate * (dt / 3600000);
      // Floor so HUD doesn't show 0 forever on short ticks
      if (earn < 1e-9) earn = mine.rate / 3600;
      mine.session += earn;
      if (g.SNCurrency && SNCurrency.creditMined) SNCurrency.creditMined(earn);
      try {
        localStorage.setItem('sn:mine-session-v1', String(mine.session));
      } catch (_) {}
    }
    touchFleetHeartbeat();
  }

  var FLEET_KEY = 'sn:device-fleet-v1';

  function deviceId() {
    try {
      var id = localStorage.getItem('sn:device-id-v1');
      if (id) return id;
      id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('sn:device-id-v1', id);
      return id;
    } catch (_) {
      return 'dev_local';
    }
  }

  function loadFleet() {
    try {
      var raw = JSON.parse(localStorage.getItem(FLEET_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  function saveFleet(list) {
    try {
      localStorage.setItem(FLEET_KEY, JSON.stringify(list.slice(0, 24)));
    } catch (_) {}
  }

  function touchFleetHeartbeat() {
    var id = deviceId();
    var list = loadFleet();
    var name = 'This device';
    try {
      name =
        (navigator.userAgentData && navigator.userAgentData.platform) ||
        (navigator.platform || 'Device') +
          ' · ' +
          (navigator.hardwareConcurrency || '?') +
          'c';
    } catch (_) {}
    var row = {
      id: id,
      name: name,
      role: mine.deviceRole,
      mining: !!(mine.on && mine.terms),
      donate: !!mine.donate,
      rate: mine.rate,
      harvest: (roleProfile() && roleProfile().harvest) || 0.3,
      load: Math.max(mine.rates.cpu || 0, mine.on ? 100 - (mine.spare || 0) : 10),
      cores: navigator.hardwareConcurrency || 4,
      mem: navigator.deviceMemory || null,
      t: Date.now(),
    };
    var ix = list.findIndex(function (d) {
      return d.id === id;
    });
    if (ix >= 0) list[ix] = row;
    else list.unshift(row);
    // Drop stale (> 7 days)
    var cut = Date.now() - 7 * 864e5;
    list = list.filter(function (d) {
      return d.t > cut;
    });
    saveFleet(list);
    return list;
  }

  function registerFleetName(label) {
    var list = touchFleetHeartbeat();
    var id = deviceId();
    list.forEach(function (d) {
      if (d.id === id) d.name = String(label || d.name).slice(0, 40);
    });
    saveFleet(list);
    return list.find(function (d) {
      return d.id === id;
    });
  }

  function fleetSummary() {
    var list = loadFleet();
    var primary = list.filter(function (d) {
      return d.role === 'main';
    });
    var hot = list.filter(function (d) {
      return d.role === 'secondary';
    });
    var raid = list.filter(function (d) {
      return d.role === 'raid';
    });
    return {
      devices: list,
      primary: primary,
      hotswap: hot,
      raid: raid,
      line:
        list.length +
        ' devices · main ' +
        primary.length +
        ' · hot-swap ' +
        hot.length +
        ' · RAID ' +
        raid.length,
    };
  }

  function radarSizePx() {
    var wrap = $('field-radar');
    if (wrap) {
      var r = wrap.getBoundingClientRect();
      if (r.width >= 28) return Math.round(Math.min(r.width, r.height) || r.width);
    }
    if (!radarBig) return 40;
    return 120;
  }

  function syncRadarCanvas() {
    var c = $('field-radar-canvas');
    var wrap = $('field-radar');
    if (!c || !wrap) return;
    var px = radarSizePx();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var need = Math.max(40, Math.round(px * dpr));
    if (c.width !== need || c.height !== need) {
      c.width = need;
      c.height = need;
    }
  }

  function setRadarExpanded(on) {
    radarBig = !!on;
    var wrap = $('field-radar');
    if (wrap) {
      wrap.classList.toggle('expanded', radarBig);
      wrap.setAttribute('aria-expanded', radarBig ? 'true' : 'false');
      wrap.title = radarBig
        ? 'Radar expanded · hold zoom out · pinch range'
        : 'Tap zoom in · hold zoom out · expand top bar for detail';
    }
    try {
      document.body.classList.remove('radar-expanded'); // never free-float takeover
    } catch (_) {}
    // Grow unified top chrome instead of floating radar
    try {
      if (g.SNTopChrome && g.SNTopChrome.set) {
        g.SNTopChrome.set(radarBig ? 'expanded' : 'collapsed', true);
      }
    } catch (_) {}
    syncRadarCanvas();
    paintRadarZoomLabel();
    if (radarBig) {
      void refreshRoutes(true);
    }
    try {
      if (g.SNUsage && SNUsage.track) SNUsage.track('radar_size', { big: radarBig });
    } catch (e) {}
  }

  function paintRadarZoomLabel() {
    var el = $('field-radar-zoom');
    if (el) el.textContent = 'rng ' + radarZoom.toFixed(1) + '×';
  }

  function setRadarZoom(z) {
    radarZoom = Math.max(0.35, Math.min(4.5, Number(z) || 1));
    paintRadarZoomLabel();
  }

  function bindRadarTap() {
    var wrap = $('field-radar');
    if (!wrap || wrap._snRadarTap) return;
    wrap._snRadarTap = true;
    var pinchStartDist = 0;
    var pinchStartZoom = 1;
    var holdTimer = null;
    var holdRepeat = null;
    var holdFired = false;
    var ptrDown = false;
    var downX = 0;
    var downY = 0;
    var moved = false;

    function touchDist(touches) {
      if (!touches || touches.length < 2) return 0;
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function clearHold() {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (holdRepeat) {
        clearInterval(holdRepeat);
        holdRepeat = null;
      }
    }

    // Single tap → zoom IN (tighter range). Hold → zoom OUT (wider).
    wrap.addEventListener(
      'pointerdown',
      function (e) {
        if (e.pointerType === 'touch' && e.isPrimary === false) return;
        // Two-finger pinch handled separately
        if (e.pointerType === 'touch' && e.touches && e.touches.length > 1) return;
        ptrDown = true;
        moved = false;
        holdFired = false;
        downX = e.clientX;
        downY = e.clientY;
        clearHold();
        try {
          wrap.setPointerCapture(e.pointerId);
        } catch (_) {}
        holdTimer = setTimeout(function () {
          holdTimer = null;
          if (!ptrDown || moved) return;
          holdFired = true;
          // Continuous zoom out (see farther)
          setRadarZoom(radarZoom * 1.18);
          holdRepeat = setInterval(function () {
            if (!ptrDown) {
              clearHold();
              return;
            }
            setRadarZoom(radarZoom * 1.14);
          }, 280);
        }, 360);
      },
      { passive: true }
    );

    wrap.addEventListener(
      'pointermove',
      function (e) {
        if (!ptrDown) return;
        if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 12) {
          if (!moved) {
            moved = true;
            clearHold();
          }
        }
      },
      { passive: true }
    );

    wrap.addEventListener(
      'pointerup',
      function (e) {
        if (!ptrDown) return;
        ptrDown = false;
        var wasHold = holdFired;
        clearHold();
        holdFired = false;
        try {
          wrap.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (moved || wasHold) return;
        // Single short tap → zoom IN (tighter range)
        setRadarZoom(radarZoom * 0.82);
        // First tap also expands if still small (readable zoom)
        if (!radarBig) setRadarExpanded(true);
      },
      { passive: true }
    );

    wrap.addEventListener('pointercancel', function () {
      ptrDown = false;
      clearHold();
      holdFired = false;
    });

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setRadarExpanded(!radarBig);
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setRadarZoom(radarZoom * 0.85);
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setRadarZoom(radarZoom * 1.15);
      }
    });

    // Two-finger trackpad / mouse wheel on radar → range zoom
    wrap.addEventListener(
      'wheel',
      function (e) {
        e.preventDefault();
        e.stopPropagation();
        var factor = e.deltaY > 0 ? 1.08 : 0.92;
        if (e.ctrlKey) factor = e.deltaY > 0 ? 1.12 : 0.88;
        setRadarZoom(radarZoom * factor);
      },
      { passive: false }
    );

    wrap.addEventListener(
      'touchstart',
      function (e) {
        if (e.touches && e.touches.length === 2) {
          clearHold();
          holdFired = true; // cancel single-tap on multi-touch
          pinchStartDist = touchDist(e.touches);
          pinchStartZoom = radarZoom;
          e.preventDefault();
        }
      },
      { passive: false }
    );
    wrap.addEventListener(
      'touchmove',
      function (e) {
        if (e.touches && e.touches.length === 2 && pinchStartDist > 0) {
          e.preventDefault();
          e.stopPropagation();
          var d = touchDist(e.touches);
          if (d > 0) setRadarZoom(pinchStartZoom * (d / pinchStartDist));
        }
      },
      { passive: false }
    );
    wrap.addEventListener('touchend', function () {
      pinchStartDist = 0;
    });

    wrap.title =
      'Tap = zoom in · hold = zoom out · two-finger pinch = range · drag free';
    wrap.setAttribute(
      'aria-label',
      'Radar · single tap zoom in · hold zoom out · two-finger pinch'
    );
  }

  function drawRadar() {
    var c = $('field-radar-canvas');
    if (!c) return;
    syncRadarCanvas();
    var ctx = c.getContext('2d');
    if (!ctx) return;
    var w = c.width,
      h = c.height,
      cx = w / 2,
      cy = h / 2,
      R = Math.min(w, h) / 2 - (radarBig ? 10 : 4);
    var blipR = radarBig ? 4 : 2.2;
    var band = radarActivityBand || computeRadarActivityBand(blips.length);
    var ring = BAND_RING[band] || BAND_RING.med;
    var dotCol = BAND_DOT[band] || BAND_DOT.med;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = ring.grid;
    ctx.lineWidth = radarBig ? 1.5 : 1;
    for (var n = 1; n <= 3; n++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * n) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.stroke();
    // Route polygons / polylines under sweep (delivery & active paths)
    drawRoutes(ctx, cx, cy, R);
    // self (center ring)
    ctx.strokeStyle = ring.self;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radarBig ? 5 : 3, 0, Math.PI * 2);
    ctx.stroke();
    sweep = (sweep + (radarBig ? 0.05 : 0.07)) % (Math.PI * 2);
    ctx.fillStyle = ring.sweep;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, sweep - 0.45, sweep);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ring.beam;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
    ctx.stroke();
    for (var i = 0; i < blips.length; i++) {
      var t = blips[i];
      // radarZoom = range multiplier (higher = see farther → blips closer to center)
      var rr = Math.min(0.98, (t.r || 0) / radarZoom);
      var x = cx + Math.cos(t.a) * rr * R;
      var y = cy + Math.sin(t.a) * rr * R;
      // Activity band paints the dots (real positions; color = density signal)
      ctx.fillStyle = dotCol;
      ctx.beginPath();
      ctx.arc(x, y, blipR, 0, Math.PI * 2);
      ctx.fill();
      if (radarBig && t.label) {
        ctx.fillStyle = 'rgba(180,210,230,0.85)';
        ctx.font = '10px system-ui';
        ctx.fillText(String(t.label).slice(0, 12), x + 6, y + 3);
      }
    }
    updateRadarSpeed();
    paintNavMeta();
    noteFrame();
  }

  function focusPos() {
    return (
      (g.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      g._snLastPos ||
      (g.SNTasks && SNTasks.pos) || { lat: 36.43, lng: 28.22 }
    );
  }

  /** Local meters relative to focus (north-up) */
  function toLocalM(lat, lng, focus) {
    focus = focus || focusPos() || { lat: 36.4341, lng: 28.2176 };
    var lat0 = Number(focus.lat);
    var lng0 = Number(focus.lng);
    if (!isFinite(lat0)) lat0 = 36.4341;
    if (!isFinite(lng0)) lng0 = 28.2176;
    var la = Number(lat);
    var lo = Number(lng);
    if (!isFinite(la)) la = lat0;
    if (!isFinite(lo)) lo = lng0;
    var north = (la - lat0) * 111320;
    var east = (lo - lng0) * 111320 * Math.cos((lat0 * Math.PI) / 180);
    return { x: east, y: north };
  }

  /**
   * Draw full route polygons on radar:
   * - filled corridor polygon along path
   * - centerline polyline
   * - start/end markers
   */
  function drawRoutes(ctx, cx, cy, R) {
    try {
    if (!routes || !routes.length) return;
    var focus = focusPos();
    var maxD = 80; // meters floor so short routes still show
    // Range zoom: higher radarZoom → larger geographic window
    var rangeMul = radarZoom > 0 ? radarZoom : 1;
    var i, j, loc, pts, route;

    // Fit scale to all route vertices
    for (i = 0; i < routes.length; i++) {
      pts = routes[i].points || [];
      for (j = 0; j < pts.length; j++) {
        if (!pts[j] || !isFinite(pts[j].lat) || !isFinite(pts[j].lng)) continue;
        loc = toLocalM(pts[j].lat, pts[j].lng, focus);
        if (!loc) continue;
        var d = Math.sqrt(loc.x * loc.x + loc.y * loc.y);
        if (d > maxD) maxD = d;
      }
    }
    var scale = (R * 0.9) / (maxD * rangeMul);

    function toCanvas(lat, lng) {
      var L = toLocalM(lat, lng, focus);
      return {
        x: cx + L.x * scale,
        y: cy - L.y * scale, // north up
      };
    }

    for (i = 0; i < routes.length; i++) {
      route = routes[i];
      pts = route.points || [];
      if (pts.length < 2) continue;
      var col = route.color || ROUTE_COLORS[i % ROUTE_COLORS.length];
      var canvasPts = [];
      for (j = 0; j < pts.length; j++) canvasPts.push(toCanvas(pts[j].lat, pts[j].lng));

      // Corridor polygon (offset polyline both sides)
      var halfW = radarBig ? 5.5 : 3.2;
      var left = [];
      var right = [];
      for (j = 0; j < canvasPts.length; j++) {
        var prev = canvasPts[Math.max(0, j - 1)];
        var next = canvasPts[Math.min(canvasPts.length - 1, j + 1)];
        var dx = next.x - prev.x;
        var dy = next.y - prev.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = (-dy / len) * halfW;
        var ny = (dx / len) * halfW;
        left.push({ x: canvasPts[j].x + nx, y: canvasPts[j].y + ny });
        right.push({ x: canvasPts[j].x - nx, y: canvasPts[j].y - ny });
      }
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (j = 1; j < left.length; j++) ctx.lineTo(left[j].x, left[j].y);
      for (j = right.length - 1; j >= 0; j--) ctx.lineTo(right[j].x, right[j].y);
      ctx.closePath();
      ctx.fillStyle = col.replace('0.95', '0.18').replace('0.9', '0.16');
      if (ctx.fillStyle === col) ctx.fillStyle = 'rgba(0,200,255,0.15)';
      ctx.fill();
      ctx.strokeStyle = col.replace('0.95', '0.45').replace('0.9', '0.4');
      ctx.lineWidth = 1;
      ctx.stroke();

      // Centerline
      ctx.beginPath();
      ctx.moveTo(canvasPts[0].x, canvasPts[0].y);
      for (j = 1; j < canvasPts.length; j++) ctx.lineTo(canvasPts[j].x, canvasPts[j].y);
      ctx.strokeStyle = col;
      ctx.lineWidth = radarBig ? 2.4 : 1.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Vendor pickup (green) · client drop (red)
      var a0 = canvasPts[0];
      var a1 = canvasPts[canvasPts.length - 1];
      ctx.fillStyle = 'rgba(68,255,136,0.95)';
      ctx.beginPath();
      ctx.arc(a0.x, a0.y, radarBig ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,100,120,0.95)';
      ctx.beginPath();
      ctx.arc(a1.x, a1.y, radarBig ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();

      // Moving delivery driver along polygon
      var prog = route.progress != null ? route.progress : 0;
      if (prog > 0 || route.kind === 'delivery') {
        var drv = pointAlong(route.points, prog > 0 ? prog : 0.02);
        if (drv) {
          var L = toLocalM(drv.lat, drv.lng, focus);
          var dx = cx + L.x * scale;
          var dy = cy - L.y * scale;
          ctx.fillStyle = 'rgba(255,220,80,0.98)';
          ctx.beginPath();
          ctx.arc(dx, dy, radarBig ? 5.5 : 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 1;
          ctx.stroke();
          if (radarBig) {
            ctx.fillStyle = 'rgba(255,240,180,0.95)';
            ctx.font = '9px system-ui';
            var tag =
              '🛵 ' +
              (route.eta || '') +
              ' ' +
              Math.round(route.speedKmh || 0) +
              'km/h';
            ctx.fillText(tag.slice(0, 22), dx + 7, dy - 4);
          }
        }
      }

      if (radarBig && route.label) {
        ctx.fillStyle = 'rgba(200,230,255,0.9)';
        ctx.font = '10px system-ui';
        ctx.fillText(String(route.label).slice(0, 28), a1.x + 6, a1.y - 4);
      }
    }
      } catch (_dr) {}
  }

  function setRoutes(list) {
    routes = Array.isArray(list) ? list.slice(0, 8) : [];
  }

  function clearRoutes() {
    routes = [];
    clearMapRouteLayers();
  }

  function clearMapRouteLayers() {
    mapRouteLayers.forEach(function (Lyr) {
      try {
        if (Lyr && Lyr.remove) Lyr.remove();
      } catch (e) {}
    });
    mapRouteLayers = [];
  }

  /** Offset lat/lng meters for corridor polygon */
  function offsetLatLng(lat, lng, eastM, northM) {
    var dLat = northM / 111320;
    var dLng = eastM / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
    return [lat + dLat, lng + dLng];
  }

  function corridorPolygon(points, halfWidthM) {
    halfWidthM = halfWidthM || 45;
    if (!points || points.length < 2) return [];
    var left = [];
    var right = [];
    var i;
    for (i = 0; i < points.length; i++) {
      var prev = points[Math.max(0, i - 1)];
      var next = points[Math.min(points.length - 1, i + 1)];
      var dLat = (next.lat - prev.lat) * 111320;
      var dLng = (next.lng - prev.lng) * 111320 * Math.cos((points[i].lat * Math.PI) / 180);
      var len = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
      var nx = (-dLng / len) * halfWidthM;
      var ny = (dLat / len) * halfWidthM;
      left.push(offsetLatLng(points[i].lat, points[i].lng, nx, ny));
      right.push(offsetLatLng(points[i].lat, points[i].lng, -nx, -ny));
    }
    return left.concat(right.reverse());
  }

  function labelIcon(html, className) {
    return L.divIcon({
      className: className || 'sn-route-label',
      html:
        '<div style="white-space:nowrap;padding:3px 8px;border-radius:8px;font:700 11px/1.2 system-ui,sans-serif;' +
        'background:rgba(0,10,24,.92);border:1px solid rgba(61,158,255,.65);color:#e8f4ff;' +
        'box-shadow:0 0 12px rgba(26,111,212,.45)">' +
        html +
        '</div>',
      iconSize: [120, 24],
      iconAnchor: [60, 28],
    });
  }

  /**
   * Draw ROUTE POLYGON + vendor / driver / you + live progress on city map.
   */
  /** Tap polygon/route → open order tile on map (CLI stays free for ops) */
  function bindRouteOpenTile(layer, routeId) {
    if (!layer || !layer.on) return;
    try {
      layer.on('click', function (ev) {
        try {
          if (ev && ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
        } catch (_) {}
        var id = String(routeId || '');
        var oid = id.replace(/^live:poly_/, '').replace(/^past_/, '');
        try {
          if (g.SNPolyScheduler && SNPolyScheduler.openOrderTile) {
            if (SNPolyScheduler.openOrderTile(oid) || SNPolyScheduler.openOrderTile(id)) return;
          }
        } catch (_) {}
        try {
          if (g.SNCli && SNCli.ops) SNCli.ops('Order · open tile for route');
        } catch (_) {}
      });
    } catch (_) {}
  }

  function paintRouteOnCityMap(row) {
    if (!row || !row.points || row.points.length < 2) return;
    if (!g.SNMap || typeof L === 'undefined') return;
    if (!SNMap.active || !SNMap.map) {
      try {
        var mid = row.points[Math.floor(row.points.length / 2)] || row.points[0];
        if (SNMap.open && mid) {
          void SNMap.open(mid.lat, mid.lng).then(function () {
            try {
              if (SNMap.ensure) return SNMap.ensure();
            } catch (_) {}
          }).then(function () {
            try {
              paintRouteOnCityMap(row);
            } catch (_) {}
          });
        }
      } catch (_) {}
      return;
    }
    try {
      var map = SNMap.map;
      var latlngs = row.points.map(function (p) {
        return [p.lat, p.lng];
      });
      // Clear prior layers for this route id
      mapRouteLayers = mapRouteLayers.filter(function (ly) {
        if (ly && ly._snRouteId === row.id) {
          try {
            ly.remove();
          } catch (e0) {}
          return false;
        }
        return true;
      });
      row._mapDriver = null;
      row._mapProg = null;
      row._mapStatus = null;

      // Corridor polygon (delivery zone)
      var ring = corridorPolygon(row.points, 55);
      if (ring.length >= 4) {
        var corridor = L.polygon(ring, {
          color: '#c8c8c8',
          weight: 2,
          opacity: 0.85,
          fillColor: '#c8c8c8',
          fillOpacity: 0.14,
        }).addTo(map);
        corridor._snRouteId = row.id;
        bindRouteOpenTile(corridor, row.id);
        mapRouteLayers.push(corridor);
      }

      // Full route centerline
      var poly = L.polyline(latlngs, {
        color: '#c8c8c8',
        weight: 6,
        opacity: 0.95,
        lineJoin: 'round',
      }).addTo(map);
      poly._snRouteId = row.id;
      bindRouteOpenTile(poly, row.id);
      // Popup only if tile open fails — prefer task tile on click
      poly.bindPopup(
        (row.label || 'Delivery route') +
          '<br/><small>Tap again for order tile</small>'
      );
      mapRouteLayers.push(poly);

      // Progress line (done segment) — yellow
      var prog = Math.max(0, Math.min(1, row.progress || 0));
      if (prog > 0.02) {
        var donePts = [];
        var target = Math.max(2, Math.floor((row.points.length - 1) * prog) + 1);
        var di;
        for (di = 0; di <= target && di < row.points.length; di++) {
          donePts.push([row.points[di].lat, row.points[di].lng]);
        }
        var along = pointAlong(row.points, prog);
        if (along) donePts.push([along.lat, along.lng]);
        if (donePts.length >= 2) {
          row._mapProg = L.polyline(donePts, {
            color: '#ffcc33',
            weight: 7,
            opacity: 1,
            lineJoin: 'round',
          }).addTo(map);
          row._mapProg._snRouteId = row.id;
          mapRouteLayers.push(row._mapProg);
        }
      }

      var a0 = row.points[0];
      var a1 = row.points[row.points.length - 1];
      // VENDOR (green)
      var m0 = L.circleMarker([a0.lat, a0.lng], {
        radius: 11,
        color: '#22ff88',
        fillColor: '#00cc66',
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(map)
        .bindPopup('<b>VENDOR</b><br/>Pickup · kitchen');
      m0._snRouteId = row.id;
      mapRouteLayers.push(m0);
      var labV = L.marker([a0.lat, a0.lng], {
        icon: labelIcon('VENDOR · PREP', 'sn-lab-v'),
        interactive: false,
      }).addTo(map);
      labV._snRouteId = row.id;
      mapRouteLayers.push(labV);
      row._mapVendorLab = labV;

      // YOU (red)
      var m1 = L.circleMarker([a1.lat, a1.lng], {
        radius: 11,
        color: '#ff4466',
        fillColor: '#ff2244',
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(map)
        .bindPopup('<b>YOU</b><br/>Delivery stop');
      m1._snRouteId = row.id;
      mapRouteLayers.push(m1);
      var labY = L.marker([a1.lat, a1.lng], {
        icon: labelIcon('YOU · DROP', 'sn-lab-y'),
        interactive: false,
      }).addTo(map);
      labY._snRouteId = row.id;
      mapRouteLayers.push(labY);

      // DRIVER (yellow) — moves with progress
      var dpt = pointAlong(row.points, prog) || a0;
      row._mapDriver = L.circleMarker([dpt.lat, dpt.lng], {
        radius: 12,
        color: '#ffcc33',
        fillColor: '#ffdd55',
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(map)
        .bindPopup('<b>DRIVER</b><br/>' + (row.phase || 'En route'));
      row._mapDriver._snRouteId = row.id;
      mapRouteLayers.push(row._mapDriver);

      row._mapStatus = L.marker([dpt.lat, dpt.lng], {
        icon: labelIcon(row.phase || 'DRIVER · 0%', 'sn-lab-d'),
        interactive: false,
      }).addTo(map);
      row._mapStatus._snRouteId = row.id;
      mapRouteLayers.push(row._mapStatus);

      while (mapRouteLayers.length > 48) {
        try {
          mapRouteLayers.shift().remove();
        } catch (e2) {}
      }
    } catch (e) {
      try {
        if (g.SNCli && SNCli.log) SNCli.log('Map route · ' + (e.message || e), 'err');
      } catch (e3) {}
    }
  }

  /** Update driver + progress line without full repaint */
  function updateRouteProgressOnMap(row) {
    if (!row || !row.points) return;
    var prog = Math.max(0, Math.min(1, row.progress || 0));
    var pt = pointAlong(row.points, prog);
    if (!pt) return;
    try {
      if (row._mapDriver && row._mapDriver.setLatLng) {
        row._mapDriver.setLatLng([pt.lat, pt.lng]);
        if (row._mapDriver.setPopupContent) {
          row._mapDriver.setPopupContent(
            '<b>DRIVER</b><br/>' +
              (row.phase || '') +
              '<br/>' +
              Math.round(prog * 100) +
              '% · ETA ' +
              (row.eta || '?')
          );
        }
      }
      if (row._mapStatus && row._mapStatus.setLatLng) {
        row._mapStatus.setLatLng([pt.lat, pt.lng]);
        if (row._mapStatus.setIcon) {
          row._mapStatus.setIcon(
            labelIcon(
              (row.phase || 'DRIVER') + ' · ' + Math.round(prog * 100) + '%',
              'sn-lab-d'
            )
          );
        }
      }
      if (row._mapVendorLab && row._mapVendorLab.setIcon && prog > 0.2) {
        row._mapVendorLab.setIcon(labelIcon('VENDOR · OUT', 'sn-lab-v'));
      }
      // Refresh progress polyline
      if (g.SNMap && SNMap.map && typeof L !== 'undefined' && prog > 0.02) {
        if (row._mapProg) {
          try {
            row._mapProg.remove();
          } catch (_) {}
          row._mapProg = null;
        }
        var donePts = [];
        var target = Math.max(2, Math.floor((row.points.length - 1) * prog) + 1);
        var di;
        for (di = 0; di <= target && di < row.points.length; di++) {
          donePts.push([row.points[di].lat, row.points[di].lng]);
        }
        donePts.push([pt.lat, pt.lng]);
        row._mapProg = L.polyline(donePts, {
          color: '#ffcc33',
          weight: 7,
          opacity: 1,
        }).addTo(SNMap.map);
        row._mapProg._snRouteId = row.id;
        mapRouteLayers.push(row._mapProg);
      }
    } catch (_) {}
  }

  function straightRoute(aLat, aLng, bLat, bLng, steps) {
    steps = steps || 12;
    var out = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      out.push({
        lat: aLat + (bLat - aLat) * t,
        lng: aLng + (bLng - aLng) * t,
      });
    }
    return out;
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

  function pathLengthKm(pts) {
    if (!pts || pts.length < 2) return 0;
    var sum = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      sum += haversineKm(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
    }
    return sum;
  }

  function fmtEta(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    if (sec < 60) return sec + 's';
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    if (m < 60) return m + 'm' + (s ? s + 's' : '');
    var h = Math.floor(m / 60);
    m = m % 60;
    return h + 'h' + m + 'm';
  }

  /**
   * Traffic + weather multipliers for ETA (universal activities — not only food).
   * Uses local hour congestion + optional mesh weather hint.
   */
  function routeConditionFactors() {
    var hour = new Date().getHours();
    // Urban congestion curve (0–1 extra load)
    var traffic =
      hour >= 7 && hour <= 9
        ? 0.38
        : hour >= 16 && hour <= 19
          ? 0.42
          : hour >= 12 && hour <= 14
            ? 0.18
            : hour >= 22 || hour <= 5
              ? -0.12
              : 0.08;
    var weather = 0;
    try {
      var w = g._snWeatherHint;
      if (w && typeof w === 'object') {
        if (w.rain) weather += 0.15;
        if (w.wind && w.wind > 40) weather += 0.08;
        if (w.snow) weather += 0.25;
      }
    } catch (_) {}
    // Role harvest doesn't affect road ETA
    return {
      traffic: traffic,
      weather: weather,
      mult: Math.max(0.75, 1 + traffic + weather),
    };
  }

  /**
   * OSRM driving geometry for 2+ waypoints. Real streets.
   * Returns { points, km, durationS, speedKmh, conditions }
   */
  async function fetchOsrmRouteMulti(waypoints) {
    var pts = (waypoints || []).filter(function (p) {
      return p && isFinite(p.lat) && isFinite(p.lng);
    });
    if (pts.length < 2) throw new Error('need 2 points');
    var cond = routeConditionFactors();
    // Prefer SNRouting (self-host → gateway → public)
    if (g.SNRouting && typeof SNRouting.route === 'function') {
      var r = await SNRouting.route(pts);
      var durationS = Number(r.durationS) || 0;
      durationS = durationS * cond.mult;
      var km = Number(r.km) || pathLengthKm(r.points || pts);
      var speedKmh = durationS > 0 ? (km / durationS) * 3600 : 28;
      return {
        points: r.points,
        km: km,
        durationS: durationS,
        speedKmh: speedKmh,
        conditions: cond,
        engine: r.engine,
        engineRoot: r.engineRoot,
      };
    }
    // Legacy direct public OSRM
    var path = pts
      .map(function (p) {
        return Number(p.lng) + ',' + Number(p.lat);
      })
      .join(';');
    var root =
      (g.SN_CONFIG && SN_CONFIG.routing && SN_CONFIG.routing.osrmBase) ||
      (g.SN_CONFIG && SN_CONFIG.routing && SN_CONFIG.routing.publicFallback) ||
      'https://router.project-osrm.org';
    root = String(root).replace(/\/$/, '');
    var url =
      root +
      '/route/v1/driving/' +
      path +
      '?overview=full&geometries=geojson&steps=false';
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (_) {}
    }, 10000);
    try {
      var res = await fetch(url, {
        signal: ctrl ? ctrl.signal : undefined,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('osrm ' + res.status);
      var j = await res.json();
      var rt = j && j.routes && j.routes[0];
      var coords = rt && rt.geometry && rt.geometry.coordinates;
      if (!coords || !coords.length) throw new Error('no geom');
      var points = coords.map(function (c) {
        return { lat: c[1], lng: c[0] };
      });
      var km2 = rt.distance != null ? Number(rt.distance) / 1000 : pathLengthKm(points);
      var durationS2 = rt.duration != null ? Number(rt.duration) : (km2 / 28) * 3600;
      durationS2 = durationS2 * cond.mult;
      var speedKmh2 = durationS2 > 0 ? (km2 / durationS2) * 3600 : 28;
      return {
        points: points,
        km: km2,
        durationS: durationS2,
        speedKmh: speedKmh2,
        conditions: cond,
        engine: root.indexOf('project-osrm') >= 0 ? 'osrm-public' : 'osrm-selfhosted',
        engineRoot: root,
      };
    } finally {
      clearTimeout(to);
    }
  }

  /**
   * OSRM driving geometry + distance/duration when available.
   * Returns { points, km, durationS, speedKmh } or throws.
   */
  async function fetchOsrmRoute(aLat, aLng, bLat, bLng) {
    return fetchOsrmRouteMulti([
      { lat: aLat, lng: aLng },
      { lat: bLat, lng: bLng },
    ]);
  }

  /**
   * Build radar routes from open delivery tasks (pickup → drop).
   * Full road polygons when OSRM available; straight fallback otherwise.
   */
  async function refreshRoutes(force) {
    if (routeFetchBusy) return routes;
    if (!force && Date.now() - routeFetchAt < 12000) return routes;
    routeFetchBusy = true;
    routeFetchAt = Date.now();
    var next = [];
    try {
      var tasks = [];
      try {
        if (g.SNTasks && SNTasks.list) {
          tasks = SNTasks.list({ all: true }).filter(function (t) {
            return (
              t &&
              (t.kind === 'delivery' || t.role === 'driver') &&
              (t.status === 'open' || t.status === 'claimed' || t.status === 'in_progress') &&
              t.lat != null &&
              t.lng != null
            );
          });
        }
      } catch (_) {}
      // Also manual routes set via setRoutes already in routes — keep non-task ids
      var manual = routes.filter(function (r) {
        return r && r.id && String(r.id).indexOf('task:') !== 0;
      });

      for (var i = 0; i < Math.min(tasks.length, 6); i++) {
        var t = tasks[i];
        var dropLat = t.drop_lat != null ? t.drop_lat : focusPos().lat;
        var dropLng = t.drop_lng != null ? t.drop_lng : focusPos().lng;
        var meta = null;
        var pts = null;
        try {
          meta = await fetchOsrmRoute(t.lat, t.lng, dropLat, dropLng);
          pts = meta.points;
        } catch (_) {
          pts = straightRoute(t.lat, t.lng, dropLat, dropLng, 16);
          var km0 = pathLengthKm(pts);
          meta = {
            points: pts,
            km: km0,
            durationS: (km0 / 28) * 3600,
            speedKmh: 28,
          };
        }
        if (pts && pts.length >= 2) {
          var eta0 = fmtEta(meta.durationS);
          var sp0 = Math.round(meta.speedKmh || 28);
          next.push({
            id: 'task:' + t.id,
            points: pts,
            color: ROUTE_COLORS[i % ROUTE_COLORS.length],
            label:
              (t.title || 'Delivery').replace(/^📦\s*/, '').slice(0, 14) +
              ' · ' +
              eta0 +
              ' · ' +
              sp0 +
              'km/h',
            kind: 'delivery',
            km: meta.km,
            durationS: meta.durationS,
            speedKmh: meta.speedKmh,
            eta: eta0,
            progress: t.status === 'in_progress' ? t._driveProgress || 0.15 : 0,
            vendorLat: t.lat,
            vendorLng: t.lng,
            dropLat: dropLat,
            dropLng: dropLng,
          });
        }
      }
      // Keep animated live deliveries (live:*) from startDeliveryRoute
      var live = routes.filter(function (r) {
        return r && r.id && String(r.id).indexOf('live:') === 0;
      });
      routes = live.concat(manual.filter(function (r) {
        return String(r.id || '').indexOf('live:') !== 0;
      })).concat(next).slice(0, 10);
    } catch (_) {
    } finally {
      routeFetchBusy = false;
    }
    return routes;
  }

  /** Public: set a route from waypoints — multi-stop OSRM streets + traffic/weather ETA */
  /** Coerce OSRM / gateway points into {lat,lng} objects */
  function normalizeRoutePoints(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var p = raw[i];
      if (!p) continue;
      if (typeof p.lat === 'number' && typeof p.lng === 'number' && isFinite(p.lat) && isFinite(p.lng)) {
        out.push({ lat: p.lat, lng: p.lng });
        continue;
      }
      if (Array.isArray(p) && p.length >= 2) {
        var a = Number(p[0]), b = Number(p[1]);
        if (isFinite(a) && isFinite(b)) out.push({ lat: b, lng: a }); // geojson [lng,lat]
        continue;
      }
      if (p.latitude != null && p.longitude != null) {
        out.push({ lat: Number(p.latitude), lng: Number(p.longitude) });
      }
    }
    return out;
  }

  async function showRoute(waypoints, opts) {
    opts = opts || {};
    // FINISH-333: route will be attached to task if opts.taskId

    var pts = [];
    var km = 0;
    var durationS = 0;
    var speedKmh = opts.speedKmh || 28;
    var cond = null;
    if (Array.isArray(waypoints) && waypoints.length >= 2) {
      var wantOsrm = opts.osrm !== false;
      if (wantOsrm) {
        try {
          var meta = await fetchOsrmRouteMulti(waypoints);
          pts = meta.points;
          km = meta.km;
          durationS = meta.durationS;
          speedKmh = meta.speedKmh;
          cond = meta.conditions;
        } catch (_) {
          wantOsrm = false;
        }
      }
      if (!wantOsrm || pts.length < 2) {
        if (waypoints.length > 2) {
          // stitch straight segments for multi-stop fallback
          pts = [];
          for (var wi = 0; wi < waypoints.length - 1; wi++) {
            var seg = straightRoute(
              waypoints[wi].lat,
              waypoints[wi].lng,
              waypoints[wi + 1].lat,
              waypoints[wi + 1].lng,
              10
            );
            if (wi > 0) seg = seg.slice(1);
            pts = pts.concat(seg);
          }
        } else {
          pts = straightRoute(
            waypoints[0].lat,
            waypoints[0].lng,
            waypoints[waypoints.length - 1].lat,
            waypoints[waypoints.length - 1].lng,
            16
          );
        }
        km = pathLengthKm(pts);
        cond = routeConditionFactors();
        durationS = ((km / speedKmh) * 3600) * cond.mult;
        speedKmh = durationS > 0 ? (km / durationS) * 3600 : speedKmh;
      }
    }
    if (pts.length < 2) return null;
    pts = normalizeRoutePoints(pts);
    if (pts.length < 2) return null;
    var eta = fmtEta(durationS);
    try {
      if (opts.taskId && g.SNTasks) {
        var tk = SNTasks.getByShort ? SNTasks.getByShort(opts.taskId) : SNTasks.get && SNTasks.get(opts.taskId);
        if (tk) {
          tk.route = {
            km: km,
            durationS: durationS,
            speedKmh: speedKmh,
            eta: eta,
            n: pts.length,
            t: Date.now(),
          };
          if (SNTasks.save) SNTasks.save();
        }
      }
    } catch (_tr) {}

    var baseLabel = opts.label || 'Route';
    var condBit =
      cond && (cond.traffic > 0.2 || cond.weather > 0)
        ? ' · traf+' + Math.round(cond.traffic * 100) + '%'
        : '';
    var row = {
      id: opts.id || 'route_' + Date.now().toString(36),
      points: pts,
      color: opts.color || ROUTE_COLORS[0],
      label: baseLabel + ' · ' + eta + ' · ' + Math.round(speedKmh) + 'km/h' + condBit,
      kind: opts.kind || 'custom',
      km: km,
      durationS: durationS,
      speedKmh: speedKmh,
      eta: eta,
      conditions: cond,
      progress: opts.progress != null ? opts.progress : 0,
      driver: opts.driver || null,
      vendorLat: opts.vendorLat,
      vendorLng: opts.vendorLng,
      dropLat: opts.dropLat,
      dropLng: opts.dropLng,
      stops: opts.stops || [],
    };
    routes = routes.filter(function (r) {
      return r.id !== row.id;
    });
    routes.unshift(row);
    routes = routes.slice(0, 10);
    return row;
  }

  /**
   * Delivery: vendor → client stop polygon + live driver progress.
   * Draws on radar (expand), logs ETA/speed on CLI. No extra panels.
   */
  async function startDeliveryRoute(opts) {
    opts = opts || {};
    var vLat = Number(opts.vendorLat != null ? opts.vendorLat : opts.from && opts.from.lat);
    var vLng = Number(opts.vendorLng != null ? opts.vendorLng : opts.from && opts.from.lng);
    var dLat = Number(opts.dropLat != null ? opts.dropLat : opts.to && opts.to.lat);
    var dLng = Number(opts.dropLng != null ? opts.dropLng : opts.to && opts.to.lng);
    if (!isFinite(vLat) || !isFinite(dLat)) return null;
    // Degenerate pickup==drop → nudge so polygon is visible
    if (Math.abs(vLat - dLat) < 1e-5 && Math.abs(vLng - dLng) < 1e-5) {
      vLat = dLat + 0.004;
      vLng = dLng + 0.0035;
    }
    try {
      if (radarBig) setRadarExpanded(false);
    } catch (eR) {}
    // Always open city map for order polygon (first task must SHOW vendor → you)
    try {
      if (g.SNMap && SNMap.open) {
        await SNMap.open(dLat, dLng);
        if (SNMap.ensure) await SNMap.ensure();
      }
    } catch (eOpen) {}
    try {
      g._snLastPos = { lat: dLat, lng: dLng, reason: 'order' };
      if (g.SNTasks && SNTasks.setPos) SNTasks.setPos(dLat, dLng);
    } catch (e) {}
    var id = opts.id || 'live:' + Date.now().toString(36);
    // Multi-stop: vendor → other deliveries → you
    var path = [];
    if (opts.waypoints && opts.waypoints.length >= 2) {
      path = opts.waypoints.map(function (p) {
        return { lat: Number(p.lat), lng: Number(p.lng) };
      }).filter(function (p) {
        return isFinite(p.lat) && isFinite(p.lng);
      });
    }
    if (path.length < 2) {
      path = [{ lat: vLat, lng: vLng }];
      (opts.stops || []).forEach(function (s) {
        if (s && s.lat != null && s.lng != null) path.push({ lat: Number(s.lat), lng: Number(s.lng) });
      });
      path.push({ lat: dLat, lng: dLng });
    }
    var stopCount = Math.max(0, path.length - 2);
    var row = await showRoute(path, {
      id: id,
      label: opts.label || '🛵 Route',
      kind: 'delivery',
      osrm: true,
      color: opts.color || 'rgba(0,220,255,0.95)',
      progress: 0,
      driver: opts.driver || 'Driver',
      vendorLat: vLat,
      vendorLng: vLng,
      dropLat: dLat,
      dropLng: dLng,
      speedKmh: opts.speedKmh,
      stops: opts.stops || [],
      etaMin: opts.etaMin,
    });
    if (!row) return null;
    row.phase = stopCount ? 'MULTI-STOP · ' + stopCount + ' before you' : 'VENDOR PREP';
    row.progress = 0;
    row.stopCount = stopCount;
    // Paint corridor polygon + vendor / intermediate / you
    paintRouteOnCityMap(row);
    try {
      if (g.SNMap && SNMap.fitLatLngs) {
        g.SNMap.fitLatLngs(path.concat(row.points || []), {
          padding: 56,
          maxZoom: 15,
          force: true,
        });
      } else if (g.SNMap && SNMap.map && typeof L !== 'undefined') {
        var b = L.latLngBounds(path.map(function (p) { return [p.lat, p.lng]; }));
        g.SNMap.map.fitBounds(b, { padding: [56, 56], maxZoom: 15 });
      }
    } catch (eFit) {}
    try {
      if (g.SNMap && SNMap.markYou) g.SNMap.markYou(dLat, dLng, 'YOU · drop');
      if (g.SNMap && SNMap.showProfiles) SNMap.showProfiles();
      if (g.SNMap && SNMap.showTasks) SNMap.showTasks();
      paintRouteOnCityMap(row);
    } catch (eT) {}
    try {
      if (g.SNCli && SNCli.ops) {
        SNCli.ops(
          'Route live · ' +
            (row.km != null ? row.km.toFixed(1) + ' km · ' : '') +
            'ETA ' +
            (opts.etaMin != null ? opts.etaMin + ' min' : row.eta || '?') +
            ' · tap polygon for order tile'
        );
      }
      if (g.SNCli && SNCli.preview)
        SNCli.preview(
          'ETA ' + (opts.etaMin != null ? opts.etaMin + 'm' : row.eta || '?')
        );
      if (g.SNCli && SNCli.setActivity) g.SNCli.setActivity('prep');
    } catch (eL) {}

    // Phase 1: kitchen prep (driver waits at vendor) · Phase 2: drive along polygon
    var prepMs = 4500;
    var driveMs = Math.max(10000, Math.min(75000, (row.durationS || 600) * 1000 * 0.4));
    if (opts.etaMin != null && opts.etaMin > 0) {
      driveMs = Math.max(8000, Math.min(90000, (opts.etaMin - 8) * 60 * 1000 * 0.15));
    }
    var t0 = Date.now();
    var animId = id;
    var lastLogPct = -1;
    function step() {
      var r = null;
      var i;
      for (i = 0; i < routes.length; i++) {
        if (routes[i].id === animId) {
          r = routes[i];
          break;
        }
      }
      if (!r) return;
      var elapsed = Date.now() - t0;
      var u;
      if (elapsed < prepMs) {
        u = 0;
        r.phase =
          stopCount > 0
            ? 'VENDOR PREP · then ' + stopCount + ' stop' + (stopCount > 1 ? 's' : '')
            : 'VENDOR PREP · kitchen';
        r.progress = 0;
      } else {
        var du = Math.min(1, (elapsed - prepMs) / driveMs);
        u = du;
        r.progress = du;
        if (du < 0.85) r.phase = stopCount ? 'MULTI-STOP EN ROUTE' : 'DRIVER EN ROUTE';
        else if (du < 1) r.phase = 'ARRIVING';
        else r.phase = 'DELIVERED';
      }
      var remainS =
        r.phase.indexOf('VENDOR PREP') === 0
          ? (r.durationS || 600) + (prepMs - elapsed) / 1000
          : (r.durationS || 0) * (1 - u);
      r.eta = fmtEta(Math.max(0, remainS));
      r.label =
        (opts.label || '🛵 Route') +
        ' · ' +
        r.phase +
        ' · ' +
        Math.round(u * 100) +
        '% · ETA ' +
        r.eta;
      updateRouteProgressOnMap(r);
      // CLI progress every ~15%
      var pct = Math.floor(u * 100);
      if (pct >= lastLogPct + 15 || (u >= 1 && lastLogPct < 100)) {
        lastLogPct = pct;
        try {
          if (g.SNCli && SNCli.log) {
            SNCli.log(
              r.phase +
                ' · ' +
                pct +
                '% · ETA ' +
                r.eta +
                ' · ' +
                Math.round(r.speedKmh || 28) +
                ' km/h',
              'ok'
            );
          }
          if (g.SNCli && SNCli.preview) SNCli.preview(r.phase + ' · ' + pct + '%');
          if (g.SNCli && SNCli.setActivity)
            g.SNCli.setActivity(r.phase.indexOf('VENDOR PREP') === 0 ? 'prep' : 'drive');
        } catch (eL2) {}
      }
      if (u >= 1 && elapsed >= prepMs + driveMs) {
        r.progress = 1;
        r.phase = 'DELIVERED';
        updateRouteProgressOnMap(r);
        try {
          if (g.SNCli && SNCli.log) SNCli.log('DELIVERED · driver at YOU · order complete', 'ok');
          if (g.SNCli && SNCli.preview) SNCli.preview('DELIVERED');
          if (g.SNCli && SNCli.setActivity) g.SNCli.setActivity('done');
        } catch (e3) {}
        if (opts.onArrive) {
          try {
            opts.onArrive(r);
          } catch (e4) {}
        }
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    return row;
  }

  function pointAlong(points, progress) {
    points = normalizeRoutePoints(points || []);
    if (!points.length) return null;
    progress = Math.max(0, Math.min(1, Number(progress) || 0));
    if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng };
    var total = 0;
    var segs = [];
    var i;
    for (i = 0; i < points.length - 1; i++) {
      var a = points[i], b = points[i + 1];
      if (!a || !b || !isFinite(a.lat) || !isFinite(b.lat)) continue;
      var dLat = (b.lat - a.lat) * 111320;
      var dLng = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
      var d = Math.sqrt(dLat * dLat + dLng * dLng) || 0.001;
      segs.push({ a: a, b: b, d: d });
      total += d;
    }
    if (!segs.length || total <= 0) return { lat: points[0].lat, lng: points[0].lng };
    var target = total * progress;
    var acc = 0;
    for (i = 0; i < segs.length; i++) {
      if (acc + segs[i].d >= target) {
        var u = (target - acc) / segs[i].d;
        return {
          lat: segs[i].a.lat + (segs[i].b.lat - segs[i].a.lat) * u,
          lng: segs[i].a.lng + (segs[i].b.lng - segs[i].a.lng) * u,
        };
      }
      acc += segs[i].d;
    }
    var last = points[points.length - 1];
    return { lat: last.lat, lng: last.lng };
  }

  /**
   * Center number + caption under radar:
   * solar → Earth through space (orbit)
   * global/national → Earth rotation (equator)
   * city map / street → walking or driving
   */
  function pickSpeedMode() {
    var tier = 'global';
    try {
      if (g.SNGlobe && typeof SNGlobe.currentTier === 'function') tier = SNGlobe.currentTier();
      else if (g.SNGlobe && SNGlobe.tier) tier = SNGlobe.tier;
    } catch (_) {}
    var body = (g.SNGlobe && SNGlobe.bodyId) || 'earth';
    var cityOn = !!(g.SNMap && SNMap.active);
    if (body !== 'earth') {
      return {
        v: SPEED.orbit.v,
        mode: String(body).toUpperCase() + ' context',
        explain:
          'Off-Earth body · center shows reference Earth-orbit scale until body telemetry is live',
      };
    }
    if (tier === 'solar') return SPEED.orbit;
    if (cityOn) return SPEED.walk;
    if (tier === 'city') return SPEED.drive;
    if (tier === 'regional') return SPEED.drive;
    if (tier === 'national') return SPEED.rotate;
    return SPEED.rotate; // global default
  }

  function updateRadarSpeed() {
    var s = pickSpeedMode();
    speedMode = s.mode;
    var v = $('fsh-value');
    var u = $('fsh-unit');
    var title = $('fsh-mode-title');
    var exp = $('fsh-explain');
    var wrap = $('field-radar-speed');
    if (v) {
      if (s.v >= 10000) v.textContent = String(Math.round(s.v / 1000)) + 'k';
      else v.textContent = String(s.v);
    }
    if (u) u.textContent = 'km/h';
    if (title) title.textContent = s.mode;
    if (exp) exp.textContent = s.explain;
    if (wrap) {
      wrap.classList.remove('earth', 'driving', 'idle', 'walk', 'orbit');
      if (s === SPEED.orbit) wrap.classList.add('orbit');
      else if (s === SPEED.walk) wrap.classList.add('walk');
      else if (s === SPEED.drive) wrap.classList.add('driving');
      else wrap.classList.add('earth');
    }
    paintNavMeta();
  }

  /**
   * Radar contacts:
   * green f = friends · red c = competitors · yellow v = vendors & clients
   */
  function classifyProfile(p, me) {
    if (!p) return null;
    if (me && p.id === me.id) return null;
    if (p.competitor === true || p.relation === 'competitor') return 'c';
    if (p.friend === true || p.relation === 'friend') return 'f';
    var r = p.roles || {};
    // Marketplace actors — yellow
    if (r.vendor || r.client) return 'v';
    // Competing drivers / workers — red
    if (r.driver || r.worker) return 'c';
    // Social / dating / ambassador — friends green
    if (r.social || r.dating || r.ambassador) return 'f';
    return 'f';
  }

  function bearingFromFocus(lat, lng, focus) {
    // Angle on radar from focus position (simple lng-based azimuth)
    var dLng = (Number(lng) - Number(focus.lng)) * Math.cos((Number(lat) * Math.PI) / 180);
    var dLat = Number(lat) - Number(focus.lat);
    return Math.atan2(dLng, dLat);
  }

  function distRing(lat, lng, focus) {
    var dLat = Number(lat) - Number(focus.lat);
    var dLng = Number(lng) - Number(focus.lng);
    var d = Math.sqrt(dLat * dLat + dLng * dLng);
    return Math.max(0.12, Math.min(0.92, 0.18 + d * 8));
  }

  function refreshBlips() {
    blips = [];
    var focus =
      (g.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      g._snLastPos ||
      (g.SNTasks && SNTasks.pos) || { lat: 36.43, lng: 28.22 };
    var me = null;
    try {
      me = g.SNProfiles && SNProfiles.me && SNProfiles.me();
    } catch (e) {}

    function nearEnough(lat, lng) {
      // ~0.08 deg ~ 8–9 km — only real nearby activity
      try {
        var dLat = Math.abs(Number(lat) - Number(focus.lat));
        var dLng = Math.abs(Number(lng) - Number(focus.lng));
        return dLat < 0.09 && dLng < 0.12;
      } catch (_) {
        return true;
      }
    }

    // Profiles → friends / competitors / vendors & clients (nearby only)
    try {
      var list = (g.SNProfiles && SNProfiles.list && SNProfiles.list()) || [];
      for (var i = 0; i < list.length && blips.length < 28; i++) {
        var p = list[i];
        if (!p || p.lat == null || p.lng == null) continue;
        if (!nearEnough(p.lat, p.lng)) continue;
        var kind = classifyProfile(p, me);
        if (!kind) continue;
        blips.push({
          a: bearingFromFocus(p.lat, p.lng, focus),
          r: distRing(p.lat, p.lng, focus),
          k: kind,
          label: p.name || p.shopName || '',
        });
      }
    } catch (e2) {}

    // Live tasks around user (pickup / drop coords)
    try {
      if (g.SNTasks && SNTasks.list) {
        var tasks = SNTasks.list() || [];
        for (var ti = 0; ti < tasks.length && blips.length < 40; ti++) {
          var tk = tasks[ti];
          if (!tk) continue;
          var st = String(tk.status || '').toLowerCase();
          if (st === 'done' || st === 'cancelled' || st === 'complete') continue;
          var coords = [];
          if (tk.lat != null && tk.lng != null) coords.push({ lat: tk.lat, lng: tk.lng, lab: tk.title || tk.id || 'task' });
          if (tk.pickup && tk.pickup.lat != null) coords.push({ lat: tk.pickup.lat, lng: tk.pickup.lng, lab: 'pickup' });
          if (tk.dropoff && tk.dropoff.lat != null) coords.push({ lat: tk.dropoff.lat, lng: tk.dropoff.lng, lab: 'drop' });
          if (tk.from && tk.from.lat != null) coords.push({ lat: tk.from.lat, lng: tk.from.lng, lab: 'from' });
          if (tk.to && tk.to.lat != null) coords.push({ lat: tk.to.lat, lng: tk.to.lng, lab: 'to' });
          for (var ci = 0; ci < coords.length && blips.length < 40; ci++) {
            var c0 = coords[ci];
            if (!nearEnough(c0.lat, c0.lng)) continue;
            blips.push({
              a: bearingFromFocus(c0.lat, c0.lng, focus),
              r: distRing(c0.lat, c0.lng, focus),
              k: 't',
              label: c0.lab,
            });
          }
        }
      }
    } catch (eT) {}

    // Open offers (real market activity)
    try {
      if (g.SNOfferStack && SNOfferStack.list) {
        var offs = SNOfferStack.list() || [];
        for (var oi = 0; oi < offs.length && blips.length < 44; oi++) {
          var of = offs[oi];
          if (!of) continue;
          var ph = String(of.phase || of.status || '').toLowerCase();
          if (ph && ph !== 'offered' && ph !== 'open' && ph !== 'claimed' && ph !== 'underway' && ph !== 'paid') continue;
          var olat = of.lat != null ? of.lat : of.vendor && of.vendor.lat;
          var olng = of.lng != null ? of.lng : of.vendor && of.vendor.lng;
          if (olat == null || olng == null) continue;
          if (!nearEnough(olat, olng)) continue;
          blips.push({
            a: bearingFromFocus(olat, olng, focus),
            r: distRing(olat, olng, focus),
            k: 'o',
            label: of.title || of.cargo || 'offer',
          });
        }
      }
    } catch (eO) {}

    // DB / commerce vendors nearby
    var vs = (g.SNCommerce && SNCommerce.vendors) || [];
    for (var j = 0; j < Math.min(14, vs.length); j++) {
      var v = vs[j];
      if (!v || v.lat == null) continue;
      if (!nearEnough(v.lat, v.lng)) continue;
      blips.push({
        a: bearingFromFocus(v.lat, v.lng, focus),
        r: distRing(v.lat, v.lng, focus),
        k: 'v',
        label: v.name || 'Shop',
      });
    }

    // Spatial places — only if room
    var ps = (g.SNSpatial && SNSpatial.list && SNSpatial.list()) || [];
    for (var k = 0; k < Math.min(6, ps.length) && blips.length < 48; k++) {
      if (ps[k].lat == null) continue;
      if (!nearEnough(ps[k].lat, ps[k].lng)) continue;
      blips.push({
        a: bearingFromFocus(ps[k].lat, ps[k].lng, focus),
        r: distRing(ps[k].lat, ps[k].lng, focus),
        k: 'p',
        label: ps[k].name || '',
      });
    }

    // Route waypoints count as activity
    try {
      for (var ri = 0; ri < routes.length && blips.length < 52; ri++) {
        var rt = routes[ri];
        if (!rt || !rt.points || !rt.points.length) continue;
        var mid = rt.points[Math.floor(rt.points.length / 2)];
        if (!mid || mid.lat == null) continue;
        blips.push({
          a: bearingFromFocus(mid.lat, mid.lng, focus),
          r: distRing(mid.lat, mid.lng, focus),
          k: 't',
          label: rt.label || 'route',
        });
      }
    } catch (eR) {}

    // Activity band from REAL blip count — not power button
    applyRadarActivityClass(computeRadarActivityBand(blips.length));

    // Keep delivery route polygons in sync (throttled)
    void refreshRoutes(false);
  }

  function setTask(name) {
    // Keep state for paint()/radar only — never inject CLI ribbon buttons
    task = TASKS[name] != null ? name : 'idle';
    paintRibbon();
  }

  function infer(line) {
    var l = String(line || '').toLowerCase();
    // Shops/menu/order → open vendor tile strip (not ribbon buttons)
    if (/^shops|^menu|^order|^cart|^market/.test(l)) {
      setTask('shops');
      try {
        if (g.SNTile && SNTile.seedMe) SNTile.seedMe();
      } catch (e) {}
    } else if (/^city|^map/.test(l)) setTask('map');
    else if (/^mine|^resources|^donate|^boost/.test(l)) setTask('mine');
    // Money/finance: never inject rate/finance ribbon buttons
    else if (/^thesis|^vault|^mars|^go to|^cosmos/.test(l)) setTask('space');
    else if (/^deliver|^claim|^first delivery/.test(l)) setTask('delivery');
    else if (/^global|^locate|^earth|^help/.test(l)) setTask('idle');
  }

  function showTerms() {
    var m = $('sn-miner-terms');
    if (m) m.hidden = false;
  }

  function acceptTerms() {
    try {
      localStorage.setItem('astranov:spacenet-miner-v2', String(Date.now()));
      localStorage.setItem('astranov_donate_compute', '1');
      localStorage.setItem('sn:mine-on-v1', '1');
    } catch (e) {}
    mine.terms = true;
    mine.on = true;
    mine.donate = true;
    ensureMineWorker();
    touchFleetHeartbeat();
    var m = $('sn-miner-terms');
    if (m) m.hidden = true;
    g.SNCli && SNCli.log('Mesh on · SETI donate · mining S', 'ok');
    setTask('mine');
    paint();
  }

  var GADGET_ORDER_KEY = 'sn:gadget-order-v1';
  var DEFAULT_GADGET_ORDER = ['money', 'perf', 'timeline', 'theme', 'data'];

  function applyGadgetOrder(order) {
    var host = $('stc-gadgets');
    if (!host) return;
    order = order || DEFAULT_GADGET_ORDER.slice();
    order.forEach(function (id) {
      var el = host.querySelector('.stc-gadget[data-gadget="' + id + '"]');
      if (el) host.appendChild(el);
    });
    // append any unknown gadgets at end
    Array.prototype.slice.call(host.querySelectorAll('.stc-gadget')).forEach(function (el) {
      var id = el.getAttribute('data-gadget');
      if (order.indexOf(id) < 0) host.appendChild(el);
    });
  }
  function saveGadgetOrder() {
    var host = $('stc-gadgets');
    if (!host) return;
    var order = Array.prototype.slice
      .call(host.querySelectorAll('.stc-gadget'))
      .map(function (el) {
        return el.getAttribute('data-gadget');
      })
      .filter(Boolean);
    try {
      localStorage.setItem(GADGET_ORDER_KEY, JSON.stringify(order));
    } catch (_) {}
  }
  function loadGadgetOrder() {
    try {
      var raw = JSON.parse(localStorage.getItem(GADGET_ORDER_KEY) || 'null');
      if (Array.isArray(raw) && raw.length) applyGadgetOrder(raw);
      else applyGadgetOrder(DEFAULT_GADGET_ORDER);
    } catch (_) {
      applyGadgetOrder(DEFAULT_GADGET_ORDER);
    }
  }
  function expandTopForGadgets(mode) {
    mode = mode || 'expanded';
    try {
      if (g.SNTopChrome && SNTopChrome.set) {
        SNTopChrome.set(mode, true);
        return;
      }
    } catch (_) {}
    try {
      if (g.SNField && SNField.topChrome && SNField.topChrome.set) {
        SNField.topChrome.set(mode);
        return;
      }
    } catch (_) {}
    var panel = $('sn-topchrome-panel');
    if (!panel) return;
    panel.classList.remove('collapsed', 'mid', 'expanded');
    panel.classList.add(mode);
    // Tall enough to show vertical gadget stack
    try {
      var h = Math.round((window.innerHeight || 700) * (mode === 'expanded' ? 0.55 : 0.38));
      panel.style.setProperty('max-height', h + 'px', 'important');
      panel.style.setProperty('height', h + 'px', 'important');
    } catch (_) {}
  }
  function openMoneyGadget() {
    expandTopForGadgets('expanded');
    try {
      paintGadgetDetails();
      paintStcPerf();
    } catch (_) {}
    var card = $('stc-g-money');
    if (card) {
      try {
        card.classList.remove('flash');
        void card.offsetWidth;
        card.classList.add('flash');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {
        try {
          card.scrollIntoView();
        } catch (__) {}
      }
    }
    try {
      if (g.SNCli && SNCli.preview) SNCli.preview('money · top scroll');
    } catch (_) {}
  }
  function bindGadgetDrag() {
    var host = $('stc-gadgets');
    if (!host || host._gdragBound) return;
    host._gdragBound = true;
    loadGadgetOrder();
    var dragEl = null;
    var startY = 0;
    var placeholder = null;

    function onDown(ev) {
      var head = ev.target && ev.target.closest ? ev.target.closest('[data-gdrag]') : null;
      if (!head || !host.contains(head)) return;
      // don't start drag from inputs/buttons inside body
      if (ev.target.closest && ev.target.closest('input, button, a, select, textarea')) return;
      dragEl = head.closest('.stc-gadget');
      if (!dragEl) return;
      startY = (ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY) || 0;
      dragEl.classList.add('dragging');
      try {
        if (ev.pointerId != null && dragEl.setPointerCapture)
          dragEl.setPointerCapture(ev.pointerId);
      } catch (_) {}
      if (ev.cancelable) ev.preventDefault();
    }
    function onMove(ev) {
      if (!dragEl) return;
      var y = (ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY) || 0;
      var siblings = Array.prototype.slice.call(host.querySelectorAll('.stc-gadget'));
      var over = null;
      for (var i = 0; i < siblings.length; i++) {
        var r = siblings[i].getBoundingClientRect();
        var mid = r.top + r.height / 2;
        if (y < mid) {
          over = siblings[i];
          break;
        }
      }
      if (over && over !== dragEl) {
        var dragRect = dragEl.getBoundingClientRect();
        if (y < over.getBoundingClientRect().top + over.getBoundingClientRect().height / 2) {
          host.insertBefore(dragEl, over);
        } else {
          host.insertBefore(dragEl, over.nextSibling);
        }
      } else if (!over) {
        host.appendChild(dragEl);
      }
      if (ev.cancelable) ev.preventDefault();
    }
    function onUp() {
      if (!dragEl) return;
      dragEl.classList.remove('dragging');
      dragEl = null;
      saveGadgetOrder();
    }
    host.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
  }

  function openFinance(tab) {
    var p = $('spacenet-finance-panel');
    if (!p) return;
    p.hidden = false;
    tab = tab || 'stats';
    var C = g.SNCurrency;
    var body = $('sfp-body');
    var snap = C ? C.snapshot() : { balance: 0, mined: 0 };
    document.querySelectorAll('.sfp-tab').forEach(function (t) {
      t.classList.toggle('on', t.getAttribute('data-tab') === tab);
    });
    if (!body) return;
    if (tab === 'mining') {
      body.innerHTML =
        '<div class="sfp-line"><b>Rate</b> ' +
        mine.rate.toFixed(3) +
        ' S/h · session ' +
        mine.session.toFixed(4) +
        ' S</div>' +
        '<div class="sfp-line">FPS ' +
        mine.fps +
        ' · spare ' +
        mine.spare +
        '%</div>' +
        '<p class="sfp-line dim">SETI-style mesh: spare CPU (worker) · RAM · storage · bandwidth when idle. Rewards in S. Global users power the net.</p>' +
        '<div class="sfp-actions"><button type="button" data-cmd="mine on">Mine on</button>' +
        '<button type="button" data-cmd="mine off">Mine off</button>' +
        '<button type="button" data-cmd="donate on">Donate mesh ON</button>' +
        '<button type="button" data-cmd="donate off">Donate off</button></div>';
    } else if (tab === 'platform') {
      body.innerHTML =
        '<div class="sfp-line"><b>Platform</b> 3% of S · <b>Driver</b> 15% gross S</div>';
    } else if (tab === 'p2p') {
      body.innerHTML = '<div class="sfp-line">P2P ledger in S · wallet ' + (C ? C.format(snap.balance) : '') + '</div>';
    } else if (tab === 'reports') {
      body.innerHTML = '<div class="sfp-line dim">CLI: resources · rate · wallet</div>';
    } else {
      body.innerHTML =
        '<div class="sfp-line"><b>Balance</b> ' +
        (C ? C.format(snap.balance) : '') +
        '</div>' +
        '<div class="sfp-line"><b>Mined</b> ' +
        (C ? C.format(snap.mined) : '') +
        '</div>' +
        '<div class="sfp-line dim">S primary · fiat/crypto secondary</div>';
    }
    body.querySelectorAll('[data-cmd]').forEach(function (b) {
      b.onclick = function () {
        g.SNCli && SNCli.run(b.getAttribute('data-cmd'));
        openFinance(tab);
      };
    });
    // Never setTask('money') — finance is top-right S HUD only, not CLI ribbon
  }

  function report() {
    var prof = roleProfile();
    var fleet = fleetSummary();
    return {
      fps: mine.fps,
      spareScore: mine.spare,
      donating: mine.donate,
      mining: mine.on && mine.terms,
      rateSPerH: mine.rate,
      sessionMined: mine.session,
      rates: mine.rates,
      deviceRole: mine.deviceRole,
      roleLabel: prof.label,
      harvest: prof.harvest,
      tjMax: prof.tjMax != null ? prof.tjMax : null,
      deviceId: deviceId(),
      fleet: fleet,
      line:
        (prof.label || 'Device') +
        ' · FPS ~' +
        mine.fps +
        ' · spare ' +
        mine.spare +
        '%' +
        (mine.donate ? ' · mesh' : '') +
        (mine.on && mine.terms
          ? ' · ' +
            (g.SNCurrency && SNCurrency.formatRate
              ? SNCurrency.formatRate(mine.rate, 'h')
              : mine.rate.toFixed(3) + ' AC/h')
          : ' · mine off'),
      workerOps: mine.workerOps,
      meshPeers: mine.meshPeers || 1,
    };
  }

  function activateMiningEngine() {
    try {
      mine.terms = !!localStorage.getItem('astranov:spacenet-miner-v2');
      if (!mine.terms) {
        // First visit: show terms once so mining can start
        showTerms();
        return false;
      }
      mine.on = true;
      mine.donate = true;
      localStorage.setItem('astranov_donate_compute', '1');
      localStorage.setItem('sn:mine-on-v1', '1');
      ensureMineWorker();
      touchFleetHeartbeat();
      paint();
      return true;
    } catch (e) {
      return false;
    }
  }

  function init() {
    if (init.done) return;
    init.done = true;
    try {
      mine.terms = !!localStorage.getItem('astranov:spacenet-miner-v2');
      var wantMine = localStorage.getItem('sn:mine-on-v1');
      // Default ON when terms accepted (user: activate mining engine)
      mine.on = mine.terms && wantMine !== '0';
      mine.donate =
        localStorage.getItem('astranov_donate_compute') === '1' || mine.terms;
      if (mine.terms) {
        mine.on = wantMine !== '0';
        mine.donate = true;
        try {
          localStorage.setItem('astranov_donate_compute', '1');
          if (wantMine !== '0') localStorage.setItem('sn:mine-on-v1', '1');
        } catch (_) {}
      }
      loadDeviceRole();
      var sess = parseFloat(localStorage.getItem('sn:mine-session-v1') || '0');
      if (isFinite(sess) && sess > 0) mine.session = sess;
    } catch (e) {}
    if (mine.on && mine.terms && mine.donate) ensureMineWorker();
    // Lean: do NOT auto-popup miner terms (dummy modal lag). User opens via money HUD.

    touchFleetHeartbeat();
    paintRadarZoomLabel();
    bindTopChrome();
    paint();
    refreshBlips();
    bindRadarTap();
    syncRadarCanvas();
    drawRadar();
    var radarMs = (g.SNPerf && SNPerf.radarMs) || 200;
    if (g.SNGameLoop && SNGameLoop.subscribe) {
      var _radarAcc = 0;
      g.SNGameLoop.subscribe(
        function (dt) {
          _radarAcc += dt;
          var need = (g.SNPerf && SNPerf.radarMs) || radarMs;
          if (_radarAcc >= need) {
            _radarAcc = 0;
            try {
              drawRadar();
            } catch (_) {}
          }
        },
        { lane: 'ambient', name: 'engine_radar' }
      );
    } else {
      setInterval(drawRadar, radarMs);
    }
    setInterval(refreshBlips, (g.SNPerf && SNPerf.lean) ? 25000 : 10000);
    setInterval(function () {
      void refreshRoutes(false);
    }, 28000);
    // Lean: no warm routes on boot — power ON / Accept draws routes on demand

    var last = performance.now();
    setInterval(function () {
      var n = performance.now();
      tickMine(n - last);
      last = n;
      sampleEconomy();
      paint();
    }, (g.SNPerf && SNPerf.lean) ? 2000 : 1000);

    $('field-balance-hud') &&
      ($('field-balance-hud').onclick = function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        openMoneyGadget();
      });
    try {
      bindGadgetDrag();
    } catch (_) {}
    // Home button owned by SNHome menu (menu has Back to Earth GLOBAL)
    if (g.SNHome && SNHome.init) SNHome.init();
    else if ($('btn-home')) {
      $('btn-home').onclick = function (e) {
        if (e) e.preventDefault();
        if (g.SNHome && SNHome.toggle) SNHome.toggle();
      };
    }
    $('sfp-close') &&
      ($('sfp-close').onclick = function () {
        var p = $('spacenet-finance-panel');
        if (p) p.hidden = true;
      });
    document.querySelectorAll('.sfp-tab').forEach(function (t) {
      t.onclick = function () {
        openFinance(t.getAttribute('data-tab'));
      };
    });
    $('sn-miner-accept') && ($('sn-miner-accept').onclick = acceptTerms);
    // Burger removed (OV-15) — tools live under ASTRANOV home · ribbon is top CLI shortcuts
    try {
      var bBtn = $('sn-burger-btn');
      var bPanel = $('sn-burger-panel');
      if (bBtn) {
        bBtn.hidden = true;
        bBtn.style.display = 'none';
      }
      if (bPanel) {
        bPanel.hidden = true;
        bPanel.style.display = 'none';
      }
    } catch (eB) {}
    bindTimeline();
    try {
      bindDataGadget();
    } catch (_) {}
    bindTaskLaunch();
    paintRibbon();
  }

  g.SNLaunch = {
    get mode() { return launchMode; },
    setMode: setLaunchMode,
    cycle: cycleLaunchMode,
    allows: launchAllows,
    paint: paintLaunchBtn,
  };
  g.SNTimeline = {
    get offset() { return timeline.offset; },
    get year() { return timelineTargetYear(); },
    get mode() { return timelineMode(); },
    get frozen() { return timeline.frozen; },
    setOffset: setTimelineOffset,
    setDate: setTimelineDate,
    present: function () { setTimelineOffset(0, { freeze: false }); },
    apply: applyTimelineBody,
  };
  g.SNField = {
    get topChrome() { return g.SNTopChrome; },
    init: init,
    paint: paint,
    paintRibbon: paintRibbon,
    ribbonAct: ribbonAct,
    openLoggedInUser: openLoggedInUser,
    openRibbonFlyout: openRibbonFlyout,
    closeRibbonFlyout: closeRibbonFlyout,
    setTask: setTask,
    infer: infer,
    setNotice: function (t, kind) {
      if (!launchAllows(kind || 'notice')) return;
      notice = String(t || '').slice(0, 60);
      paintRibbon();
    },
    launchMode: function () {
      return launchMode;
    },
    setLaunchMode: setLaunchMode,
    launchAllows: launchAllows,
    cycleLaunch: cycleLaunchMode,
    showTerms: showTerms,
    openFinance: openFinance,
    openMoneyGadget: openMoneyGadget,
    closeFinance: function () {
      var p = $('spacenet-finance-panel');
      if (p) p.hidden = true;
    },
    refreshBlips: refreshBlips,
    setRadarExpanded: setRadarExpanded,
    refreshRoutes: refreshRoutes,
    showRoute: showRoute,
    startDeliveryRoute: startDeliveryRoute,
    setRoutes: setRoutes,
    clearRoutes: clearRoutes,
    cyclePolyNav: cyclePolyNav,
    enterPolygonOverview: enterPolygonOverview,
    enterDriveMode: enterDriveMode,
    stopPolyDriveFollow: stopPolyDriveFollow,
    get polyNavMode() {
      return polyNavMode;
    },
    setRouteProgress: function (id, p) {
      try {
        routes.forEach(function (r) {
          if (!id || r.id === id || (r.id && String(r.id).indexOf('tour') >= 0))
            r.progress = Math.max(0, Math.min(1, Number(p) || 0));
        });
      } catch (_) {}
    },
    get routes() {
      return routes.slice();
    },
    get radarExpanded() {
      return radarBig;
    },
    updateRadarSpeed: updateRadarSpeed,
    SPEED: SPEED,
    EARTH_KMH: EARTH,
    routeConditions: routeConditionFactors,
    fetchOsrmMulti: fetchOsrmRouteMulti,
    routeSelfTest: function () {
      return g.SNRouting && SNRouting.selfTest
        ? SNRouting.selfTest()
        : Promise.resolve({ ok: false, error: 'no SNRouting' });
    },
    routingStatus: function () {
      return g.SNRouting && SNRouting.status ? SNRouting.status() : { lastEngine: 'none' };
    },
  };

  // Compat thin aliases (boot/cli may call old names)
  g.SNRadar = {
    init: function () {},
    refresh: refreshBlips,
    updateSpeed: updateRadarSpeed,
    EARTH_KMH: EARTH,
    SPEED: SPEED,
    activity: function () {
      return radarActivityBand;
    },
    blipCount: function () {
      return blips.length;
    },
  };
  g.SNResources = {
    init: function () {},
    report: report,
    status: function () {
      var r = report();
      var prof = roleProfile();
      return [
        'Device · ' + (r.roleLabel || r.deviceRole),
        r.line,
        'Harvest profile · ' +
          Math.round((prof.harvest || 0) * 100) +
          '%' +
          (prof.tjMax != null ? ' · TJ max ' + Math.round(prof.tjMax * 100) + '%' : ' · conservative'),
        'Mesh · ' + (r.donating ? 'ON' : 'off') + ' · peers~' + (r.meshPeers || 1),
        'CPU ' +
          (r.rates.cpu || 0) +
          '% · spare ' +
          r.spareScore +
          '% · ops ' +
          (r.workerOps || 0),
        'Session mined ' +
          (g.SNCurrency ? SNCurrency.format(r.sessionMined) : r.sessionMined),
      ];
    },
    checkTerms: function () {
      return mine.terms;
    },
    acceptTerms: acceptTerms,
    setMining: function (on) {
      if (on && !mine.terms) {
        showTerms();
        return false;
      }
      mine.on = !!on;
      try {
        localStorage.setItem('sn:mine-on-v1', on ? '1' : '0');
      } catch (_) {}
      if (!on) stopMineWorker();
      else if (mine.donate) ensureMineWorker();
      touchFleetHeartbeat();
      paint();
      return true;
    },
    activateMining: activateMiningEngine,
    setDonate: function (on) {
      mine.donate = !!on;
      try {
        if (on) localStorage.setItem('astranov_donate_compute', '1');
        else localStorage.removeItem('astranov_donate_compute');
      } catch (e) {}
      if (on) {
        if (!mine.terms) {
          showTerms();
        } else {
          mine.on = true;
          try {
            localStorage.setItem('sn:mine-on-v1', '1');
          } catch (_) {}
          ensureMineWorker();
        }
      } else {
        stopMineWorker();
      }
      touchFleetHeartbeat();
      paint();
    },
    setDeviceRole: setDeviceRole,
    getDeviceRole: function () {
      return mine.deviceRole;
    },
    deviceRoles: DEVICE_ROLES,
    deviceId: deviceId,
    fleet: fleetSummary,
    registerName: registerFleetName,
    touchFleet: touchFleetHeartbeat,
    noteFrame: noteFrame,
    get mining() {
      return mine.on && mine.terms;
    },
    get rateSPerH() {
      return mine.rate;
    },
    get sessionMined() {
      return mine.session;
    },
    get rates() {
      return mine.rates;
    },
  };
  g.SNRibbon = {
    init: function () {},
    render: paintRibbon,
    setTask: setTask,
    setNotice: function (t) {
      g.SNField.setNotice(t);
    },
    infer: infer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
