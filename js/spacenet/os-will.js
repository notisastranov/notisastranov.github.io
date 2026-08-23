/**
 * SNOsWill — Dynamic OS reshape engine
 *
 * Law: Every user is a developer. The CLI is the control plane.
 * Astranov OS shapes itself to the will of the operator — not a fixed app shell.
 *
 * - Natural language + short commands reshape UI, delivery, globe, AI, gadgets
 * - Each user has a personal OS version (persisted mutations)
 * - AI (owner paid / subscriber Grok / free mind) proposes OPS; this module executes them
 * - Fork, export, import, reset version
 *
 * CLI: will · reshape · my os · fork · export os · import os · apply …
 */
(function (global) {
  'use strict';

  var LS_VER = 'sn:user-os-version-v1';
  var LS_LOG = 'sn:os-will-log-v1';
  var MAX_LOG = 80;

  function now() {
    return Date.now();
  }

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 220), c || 'ok', true);
    } catch (_) {}
  }

  function ops(m) {
    try {
      if (global.SNCli && SNCli.ops) SNCli.ops(String(m).slice(0, 140));
      else log(m, 'dim');
    } catch (_) {}
  }

  function defaultVersion() {
    return {
      id: 'os:' + Math.random().toString(36).slice(2, 8),
      name: 'My Astranov',
      createdAt: now(),
      updatedAt: now(),
      mutations: [],
      prefs: {
        accent: null,
        themeMode: null,
        brightness: null,
        density: 'comfortable',
        topGadgets: null,
        cliDefault: 'mid',
        globeHome: null,
        drive: null,
        labels: {},
        hidden: [],
        notes: '',
      },
    };
  }

  function loadVersion() {
    try {
      var v = JSON.parse(localStorage.getItem(LS_VER) || 'null');
      if (v && typeof v === 'object') return v;
    } catch (_) {}
    return defaultVersion();
  }

  function saveVersion(v) {
    v = v || loadVersion();
    v.updatedAt = now();
    try {
      localStorage.setItem(LS_VER, JSON.stringify(v));
    } catch (_) {}
    return v;
  }

  function pushLog(entry) {
    var a = [];
    try {
      a = JSON.parse(localStorage.getItem(LS_LOG) || '[]');
      if (!Array.isArray(a)) a = [];
    } catch (_) {
      a = [];
    }
    a.unshift(Object.assign({ t: now() }, entry));
    try {
      localStorage.setItem(LS_LOG, JSON.stringify(a.slice(0, MAX_LOG)));
    } catch (_) {}
  }

  /* ── Executors: real system mutations ── */
  var EXEC = {
    market_on: function () {
      try {
        if (global.SNPolyScheduler && SNPolyScheduler.activate) SNPolyScheduler.activate({});
        return { ok: true, detail: 'market on' };
      } catch (e) {
        return { ok: false, detail: String(e.message || e) };
      }
    },
    market_off: function () {
      try {
        if (global.SNPolyScheduler && SNPolyScheduler.deactivate) SNPolyScheduler.deactivate({});
        return { ok: true, detail: 'market off' };
      } catch (e) {
        return { ok: false, detail: String(e.message || e) };
      }
    },
    poly_overview: function () {
      try {
        if (global.SNField && SNField.enterPolygonOverview) void SNField.enterPolygonOverview();
        return { ok: true, detail: 'polygon overview' };
      } catch (e) {
        return { ok: false, detail: String(e.message || e) };
      }
    },
    poly_drive: function () {
      try {
        if (global.SNField && SNField.enterDriveMode) void SNField.enterDriveMode();
        return { ok: true, detail: 'gps drive' };
      } catch (e) {
        return { ok: false, detail: String(e.message || e) };
      }
    },
    marina: function (arg) {
      try {
        if (global.SNMarina && SNMarina.openMarina) SNMarina.openMarina(arg || 'mandraki');
        return { ok: true, detail: 'marina' };
      } catch (e) {
        return { ok: false, detail: String(e.message || e) };
      }
    },
    throw_tiles: function () {
      try {
        if (global.SNPolyScheduler && SNPolyScheduler.throwOffers) SNPolyScheduler.throwOffers({ count: 1 });
        return { ok: true, detail: 'throw tiles' };
      } catch (e) {
        return { ok: false, detail: String(e.message || e) };
      }
    },
    theme: function (arg) {
      arg = String(arg || '').toLowerCase();
      if (global.SNTheme && SNTheme.setMode) {
        if (/day|light|bright/.test(arg)) SNTheme.setMode('light');
        else if (/night|dark/.test(arg)) SNTheme.setMode('dark');
        else SNTheme.setMode('auto');
        return { ok: true, detail: 'theme ' + arg };
      }
      try {
        document.documentElement.classList.remove('theme-light', 'theme-dark');
        document.documentElement.classList.add(/light|day/.test(arg) ? 'theme-light' : 'theme-dark');
      } catch (_) {}
      return { ok: true, detail: 'theme css' };
    },
    accent: function (arg) {
      var hex = String(arg || '').trim();
      if (!/^#?[0-9a-fA-F]{6}$/.test(hex.replace('#', '') ? '#' + hex.replace('#', '') : '')) {
        // named
        var map = {
          blue: '#3d9eff',
          neon: '#3d9eff',
          mint: '#3dd68c',
          gold: '#e8c547',
          red: '#e82127',
          purple: '#a78bfa',
          white: '#e8eeff',
        };
        hex = map[hex.toLowerCase()] || '#3d9eff';
      }
      if (hex[0] !== '#') hex = '#' + hex;
      if (global.SNTheme && SNTheme.setAccent) SNTheme.setAccent(hex);
      else {
        document.documentElement.style.setProperty('--glow', hex);
        document.documentElement.style.setProperty('--glow-hot', hex);
      }
      return { ok: true, detail: 'accent ' + hex };
    },
    brightness: function (arg) {
      var n = parseFloat(arg);
      if (!isFinite(n)) return { ok: false, detail: 'bad brightness' };
      if (n > 1.5) n = n / 100;
      if (global.SNTheme && SNTheme.setBrightness) SNTheme.setBrightness(n);
      else document.documentElement.style.setProperty('--brightness', String(n));
      return { ok: true, detail: 'brightness ' + n };
    },
    cli: function (arg) {
      arg = String(arg || '').toLowerCase();
      var mode = /expand|big|open|full/.test(arg)
        ? 'expanded'
        : /mid|half/.test(arg)
          ? 'mid'
          : 'collapsed';
      try {
        if (global.SNUi && SNUi.setSize) SNUi.setSize(mode);
        else {
          var p = document.getElementById('panel');
          if (p) {
            p.classList.remove('collapsed', 'mid', 'expanded');
            p.classList.add(mode);
          }
        }
      } catch (_) {}
      return { ok: true, detail: 'cli ' + mode };
    },
    gadgets: function (arg) {
      arg = String(arg || '').toLowerCase();
      try {
        if (global.SNField && SNField.topChrome) {
          if (/open|show|expand/.test(arg)) SNField.topChrome.expand && SNField.topChrome.expand();
          else if (/close|hide|collapse/.test(arg)) SNField.topChrome.collapse && SNField.topChrome.collapse();
          else SNField.topChrome.toggle && SNField.topChrome.toggle();
        } else {
          var panel = document.getElementById('sn-topchrome-panel');
          var h = document.getElementById('sn-topchrome-drag');
          if (h) {
            h.dispatchEvent(
              new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 99 })
            );
            h.dispatchEvent(
              new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10, pointerId: 99 })
            );
          } else if (panel) {
            var m = panel.classList.contains('collapsed') ? 'expanded' : 'collapsed';
            panel.classList.remove('collapsed', 'mid', 'expanded');
            panel.classList.add(m);
          }
        }
      } catch (_) {}
      return { ok: true, detail: 'gadgets ' + arg };
    },
    power: function (arg) {
      arg = String(arg || '').toLowerCase();
      try {
        if (/on|live|market|go/.test(arg)) {
          if (global.SNPolyScheduler && SNPolyScheduler.activate) SNPolyScheduler.activate({});
          else if (global.SNField && SNField.setLaunchMode) SNField.setLaunchMode('on');
        } else if (/off|rest|stop/.test(arg)) {
          if (global.SNPolyScheduler && SNPolyScheduler.deactivate) SNPolyScheduler.deactivate({ reason: 'will' });
          else if (global.SNField && SNField.setLaunchMode) SNField.setLaunchMode('off');
        } else if (global.SNField && SNField.cycleLaunchMode) SNField.cycleLaunchMode();
      } catch (e) {
        return { ok: false, detail: String(e && e.message ? e.message : e) };
      }
      return { ok: true, detail: 'power ' + arg };
    },
    globe: function (arg) {
      arg = String(arg || '').toLowerCase();
      try {
        if (/global|earth|home|reset/.test(arg) && global.SNGlobe && SNGlobe.goToTier)
          SNGlobe.goToTier('global');
        else if (/national/.test(arg) && global.SNGlobe) SNGlobe.goToTier('national');
        else if (/regional/.test(arg) && global.SNGlobe) SNGlobe.goToTier('regional');
        else if (global.SNGlobe && SNGlobe.goToPlace) {
          // "globe rhodes" etc.
          var place = String(arg).replace(/^globe\s*/i, '').trim();
          if (place && global.SNCli && SNCli.run) {
            /* fly via existing */
          }
        }
        if (global.SNMap && SNMap.active && SNMap.close) SNMap.close();
      } catch (_) {}
      return { ok: true, detail: 'globe ' + arg };
    },
    map: function (arg) {
      arg = String(arg || '').toLowerCase();
      try {
        if (/close|off|3d|globe/.test(arg)) {
          if (global.SNMap && SNMap.close) SNMap.close();
          return { ok: true, detail: 'map closed · 3D globe' };
        }
        if (global.SNMap && SNMap.open) {
          var pos =
            (global.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
            global._snLastPos || { lat: 36.4341, lng: 28.2176 };
          void SNMap.open(pos.lat, pos.lng);
        }
      } catch (_) {}
      return { ok: true, detail: 'map ' + arg };
    },
    rename: function (arg) {
      // rename app label "rename Astranov to MyNet"
      var m = String(arg || '').match(/^(?:to\s+)?(.+)$/i);
      var name = m ? m[1].trim().slice(0, 24) : '';
      if (!name) return { ok: false, detail: 'need name' };
      try {
        var btn = document.getElementById('btn-home');
        if (btn) {
          btn.textContent = name.toUpperCase().replace(/\s+/g, '');
          btn.title = name + ' · home';
        }
        document.title = name;
      } catch (_) {}
      var v = loadVersion();
      v.name = name;
      v.prefs.labels = v.prefs.labels || {};
      v.prefs.labels.home = name;
      saveVersion(v);
      return { ok: true, detail: 'home → ' + name };
    },
    density: function (arg) {
      arg = String(arg || '').toLowerCase();
      var d = /compact|dense|tight/.test(arg) ? 'compact' : /spacious|air|roomy/.test(arg) ? 'spacious' : 'comfortable';
      document.documentElement.setAttribute('data-density', d);
      try {
        document.body.style.setProperty('--r', d === 'compact' ? '16px' : d === 'spacious' ? '28px' : '24px');
      } catch (_) {}
      var v = loadVersion();
      v.prefs.density = d;
      saveVersion(v);
      return { ok: true, detail: 'density ' + d };
    },
    drive: function (arg) {
      // pass natural language to poly engine prefs
      try {
        if (global.SNPolyEngine && SNPolyEngine.applyNaturalPrefs) {
          var r = SNPolyEngine.applyNaturalPrefs(arg);
          return { ok: true, detail: (r.changed || []).join(', ') || 'drive prefs' };
        }
      } catch (_) {}
      return { ok: false, detail: 'poly engine offline' };
    },
    tour: function () {
      try {
        if (global.SNPolyEngine && SNPolyEngine.syncTourFromStack && global.SNPolyScheduler)
          SNPolyEngine.syncTourFromStack(SNPolyScheduler.list());
      } catch (_) {}
      return { ok: true, detail: 'tour sync' };
    },
    diagnostics: function () {
      try {
        if (global.SNOsBoot && SNOsBoot.diagnostics) SNOsBoot.diagnostics();
      } catch (_) {}
      return { ok: true, detail: 'diagnostics' };
    },
    repair: function (arg) {
      arg = String(arg || '').toLowerCase();
      try {
        if (/display|globe|earth/.test(arg) && global.SNOsBoot && SNOsBoot.repairDisplay)
          void SNOsBoot.repairDisplay();
        else if (/kernel|cli/.test(arg) && global.SNOsBoot && SNOsBoot.repairKernel)
          void SNOsBoot.repairKernel();
        else if (global.SNOsBoot && SNOsBoot.repairDisplay) void SNOsBoot.repairDisplay();
      } catch (_) {}
      return { ok: true, detail: 'repair ' + arg };
    },
    hide: function (arg) {
      var id = String(arg || '').trim();
      if (!id) return { ok: false, detail: 'what to hide?' };
      var el = document.getElementById(id) || document.querySelector(id);
      if (el) {
        el.style.display = 'none';
        var v = loadVersion();
        v.prefs.hidden = v.prefs.hidden || [];
        if (v.prefs.hidden.indexOf(id) < 0) v.prefs.hidden.push(id);
        saveVersion(v);
        return { ok: true, detail: 'hidden ' + id };
      }
      return { ok: false, detail: 'not found ' + id };
    },
    show: function (arg) {
      var id = String(arg || '').trim();
      var el = document.getElementById(id) || document.querySelector(id);
      if (el) {
        el.style.display = '';
        var v = loadVersion();
        v.prefs.hidden = (v.prefs.hidden || []).filter(function (x) {
          return x !== id;
        });
        saveVersion(v);
        return { ok: true, detail: 'shown ' + id };
      }
      return { ok: false, detail: 'not found' };
    },
    note: function (arg) {
      var v = loadVersion();
      v.prefs.notes = String(arg || '').slice(0, 2000);
      saveVersion(v);
      return { ok: true, detail: 'note saved' };
    },
  };

  function recordMutation(op, arg, result) {
    var v = loadVersion();
    v.mutations.push({ t: now(), op: op, arg: arg, ok: !!(result && result.ok), detail: result && result.detail });
    if (v.mutations.length > 200) v.mutations = v.mutations.slice(-150);
    // mirror prefs
    if (op === 'accent') v.prefs.accent = arg;
    if (op === 'theme') v.prefs.themeMode = arg;
    if (op === 'brightness') v.prefs.brightness = arg;
    if (op === 'cli') v.prefs.cliDefault = arg;
    saveVersion(v);
    pushLog({ op: op, arg: arg, result: result });
  }

  function applyOp(op, arg, opts) {
    opts = opts || {};
    op = String(op || '').toLowerCase().trim();
    var fn = EXEC[op];
    if (!fn) return { ok: false, detail: 'unknown op ' + op };
    var r = fn(arg);
    if (!opts.silent) {
      recordMutation(op, arg, r);
      if (r && r.ok) ops('WILL · ' + op + ' · ' + (r.detail || 'ok'));
      else log('WILL fail · ' + op + ' · ' + (r && r.detail), 'err');
    }
    return r;
  }

  /** Apply list of {op, arg} */
  function applyOps(list) {
    var out = [];
    (list || []).forEach(function (x) {
      if (!x || !x.op) return;
      out.push(applyOp(x.op, x.arg));
    });
    return out;
  }

  /** Re-apply stored version on boot */
  function rehydrate() {
    var v = loadVersion();
    try {
      if (v.prefs.accent) applyOp('accent', v.prefs.accent, { silent: true });
      if (v.prefs.themeMode) applyOp('theme', v.prefs.themeMode, { silent: true });
      if (v.prefs.brightness != null) applyOp('brightness', v.prefs.brightness, { silent: true });
      if (v.prefs.density) applyOp('density', v.prefs.density, { silent: true });
      if (v.prefs.labels && v.prefs.labels.home) applyOp('rename', v.prefs.labels.home, { silent: true });
      (v.prefs.hidden || []).forEach(function (id) {
        try {
          var el = document.getElementById(id) || document.querySelector(id);
          if (el) el.style.display = 'none';
        } catch (_) {}
      });
      if (v.name && v.name !== 'My Astranov') {
        var btn = document.getElementById('btn-home');
        if (btn) btn.textContent = String(v.name).toUpperCase().replace(/\s+/g, '').slice(0, 16);
      }
    } catch (_) {}
    return v;
  }

  /**
   * Parse user will into ops without AI (fast path).
   */
  function parseLocal(raw) {
    var line = String(raw || '').trim();
    var low = line.toLowerCase();
    var opsList = [];

    // strip will/reshape/make/set prefixes
    var body = line.replace(
      /^(will|reshape|make|set|os|please|i want|i need|can you|could you)\s+/i,
      ''
    );
    var b = body.toLowerCase();

    if (/^(day|light|bright)\b/.test(b) || /\bday mode\b|\blight theme\b|\bbright theme\b|\bmake it (day|light|bright)\b/.test(b))
      opsList.push({ op: 'theme', arg: 'day' });
    if (/^(night|dark)\b/.test(b) || /\bnight mode\b|\bdark theme\b|\bmake it (night|dark)\b|\bit night\b|\bit dark\b/.test(b))
      opsList.push({ op: 'theme', arg: 'night' });
    if (/auto theme|theme auto/.test(b)) opsList.push({ op: 'theme', arg: 'auto' });

    var acc = b.match(/(?:accent|color|colour)\s+(#[0-9a-f]{6}|\w+)/i) || b.match(/^neon\s+(blue|mint|gold|red|purple)/);
    if (acc) opsList.push({ op: 'accent', arg: acc[1] });

    var br = b.match(/brightness\s+(\d+%?|\d*\.?\d+)/);
    if (br) opsList.push({ op: 'brightness', arg: br[1] });

    if (/expand cli|cli big|cli open|bigger cli/.test(b)) opsList.push({ op: 'cli', arg: 'expand' });
    if (/collapse cli|cli small|minimize cli|cli min/.test(b)) opsList.push({ op: 'cli', arg: 'collapse' });
    if (/open gadgets|show gadgets|expand gadgets|gadgets open/.test(b))
      opsList.push({ op: 'gadgets', arg: 'open' });
    if (/close gadgets|hide gadgets|gadgets close/.test(b)) opsList.push({ op: 'gadgets', arg: 'close' });

    if (/power on|market on|go live|start market|tasks on/.test(b)) opsList.push({ op: 'market_on' });
    if (/power off|market off|rest|tasks off|stop market/.test(b)) opsList.push({ op: 'market_off' });
    // legacy power op still supported via EXEC.power if present
    if (/show (my )?tour|polygon overview|fit (the )?tour|poly overview|show polygon/.test(b))
      opsList.push({ op: 'poly_overview' });
    if (/gps drive|drive mode|start driving/.test(b)) opsList.push({ op: 'poly_drive' });
    if (/\bmarina\b|berths|parking spots/.test(b)) opsList.push({ op: 'marina', arg: 'mandraki' });
    if (/throw tiles|test offers|demo tiles/.test(b)) opsList.push({ op: 'throw_tiles' });

    if (/global globe|zoom out full|earth home|reset globe|full earth/.test(b))
      opsList.push({ op: 'globe', arg: 'global' });
    if (/close map|3d globe|leave streets|no street map/.test(b)) opsList.push({ op: 'map', arg: 'close' });
    if (/^(city map|street map|open map)\b/.test(b)) opsList.push({ op: 'map', arg: 'open' });

    var ren = body.match(/rename(?:\s+app|\s+home)?\s+(?:to\s+)?(.+)$/i) || body.match(/^call (?:it|this|me)\s+(.+)$/i);
    if (ren) opsList.push({ op: 'rename', arg: ren[1].trim() });

    if (/compact|dense ui|tighter/.test(b)) opsList.push({ op: 'density', arg: 'compact' });
    if (/spacious|roomy|airier|more round/.test(b)) opsList.push({ op: 'density', arg: 'spacious' });

    if (/prefer |auto accept|drive prefs|long east|city deliveries/.test(b))
      opsList.push({ op: 'drive', arg: body });

    if (/^diagnostics?\b|^diag\b/.test(b)) opsList.push({ op: 'diagnostics', arg: '' });
    if (/^repair\b/.test(b)) opsList.push({ op: 'repair', arg: body.replace(/^repair\s*/i, '') });

    return opsList;
  }

  /**
   * Ask AI to propose OPS JSON for complex will.
   * Returns { text, ops[] }
   */
  async function askAiForOps(message) {
    var system =
      'You are ASTRANOV OS co-developer. User is a programmer reshaping their personal OS. ' +
      'Reply short. When they want a system change, end with a line: ' +
      'OPS:[{"op":"theme|accent|brightness|cli|gadgets|power|globe|map|rename|density|drive|tour|diagnostics|repair|hide|show|note","arg":"..."}] ' +
      'Only use those ops. Be bold but safe. No games. Delivery OS + UI reshape only.';

    // Prefer subscription powerful path
    try {
      if (global.SNSubscription && SNSubscription.askPowerful) {
        var pow = await SNSubscription.askPowerful(message, {
          mode: 'coders',
          timeoutMs: 22000,
          history: [{ role: 'system', content: system }],
        });
        if (pow && pow.ok && pow.text) return { text: pow.text, via: pow.via || 'sub' };
      }
    } catch (_) {}
    try {
      if (global.SNAi && SNAi.ask) {
        var t = await SNAi.ask(message, { mode: 'code', system: system });
        if (t) return { text: String(t), via: 'ai' };
      }
    } catch (_) {}
    try {
      if (global.SNAstranovMind && SNAstranovMind.answer) {
        var f = await SNAstranovMind.answer(message);
        if (f) return { text: String(f), via: 'mind' };
      }
    } catch (_) {}
    return { text: null, via: null };
  }

  function extractOps(text) {
    if (!text) return [];
    var m = String(text).match(/OPS\s*:\s*(\[[\s\S]*?\])/i);
    if (!m) {
      // try bare json array last line
      var m2 = String(text).match(/(\[\s*\{\s*"op"[\s\S]*\}\s*\])/);
      if (!m2) return [];
      m = m2;
    }
    try {
      var arr = JSON.parse(m[1]);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Main entry: reshape OS from user will (CLI freeform).
   */
  async function reshape(raw, opts) {
    opts = opts || {};
    var line = String(raw || '').trim();
    if (!line) return { ok: false };

    log('WILL · ' + line.slice(0, 100), 'cmd');

    // Meta commands
    var low = line.toLowerCase();
    if (low === 'will' || low === 'my os' || low === 'os version' || low === 'version') {
      var v = loadVersion();
      log('OS version · ' + v.name + ' · ' + (v.mutations || []).length + ' mutations · id ' + v.id, 'ok');
      log('Updated ' + new Date(v.updatedAt || v.createdAt).toISOString(), 'dim');
      if (v.prefs.notes) log('Note · ' + v.prefs.notes.slice(0, 120), 'dim');
      (v.mutations || []).slice(-6).forEach(function (m) {
        log((m.ok ? '✓ ' : '✗ ') + m.op + ' ' + String(m.arg || '').slice(0, 40), m.ok ? 'dim' : 'err');
      });
      log('Every user is a developer · reshape with plain language', 'ok');
      return { ok: true, meta: true };
    }
    if (low === 'fork' || low === 'fork os' || low === 'my version') {
      var v2 = loadVersion();
      v2.id = 'os:' + Math.random().toString(36).slice(2, 8);
      v2.name = (v2.name || 'My Astranov') + ' fork';
      v2.createdAt = now();
      saveVersion(v2);
      log('Forked OS · ' + v2.name + ' · ' + v2.id, 'ok');
      return { ok: true, forked: v2 };
    }
    if (low === 'export os' || low === 'export will') {
      try {
        var blob = new Blob([JSON.stringify(loadVersion(), null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'astranov-os-version.json';
        a.click();
        log('Exported your OS version', 'ok');
      } catch (e) {
        log('Export failed', 'err');
      }
      return { ok: true };
    }
    if (low === 'reset os' || low === 'reset will') {
      localStorage.removeItem(LS_VER);
      log('OS version reset · clean slate', 'ok');
      return { ok: true };
    }
    if (low === 'will help' || low === 'reshape help' || low === 'os help') {
      [
        '═══ ASTRANOV OS · WILL ═══',
        'You are a developer. Speak changes. The OS reshapes.',
        'day / night · accent blue · brightness 90',
        'open gadgets · expand cli · power on · close map',
        'rename to MyFleet · compact · spacious',
        'prefer long east · auto accept min 5',
        'will · fork · export os · reset os',
        'Or freeform: make it more neon and open money gadgets',
      ].forEach(function (ln, i) {
        log(ln, i ? 'dim' : 'ok');
      });
      return { ok: true };
    }

    // Local parse first
    var localOps = parseLocal(line);
    var applied = [];
    if (localOps.length) {
      applied = applyOps(localOps);
      log('Applied ' + applied.filter(function (x) {
        return x && x.ok;
      }).length + ' local reshape(s)', 'ok');
    }

    // If pure command and we applied something, stop (unless force AI)
    var pure =
      /^(will|reshape|day|night|dark|light|power on|power off|open gadgets|close gadgets|expand cli|collapse cli|close map|global globe|diagnostics|repair)/i.test(
        low
      ) || localOps.length > 0 && line.length < 48;
    if (pure && localOps.length && !opts.forceAi) {
      return { ok: true, ops: localOps, applied: applied, via: 'local' };
    }

    // Complex will → AI co-developer + execute OPS
    if (opts.skipAi) return { ok: true, ops: localOps, applied: applied, via: 'local' };

    log('OS co-dev thinking…', 'dim');
    var ai = await askAiForOps(
      'User will (reshape Astranov OS): ' +
        line +
        '\nAlready applied: ' +
        JSON.stringify(localOps) +
        '\nPropose additional OPS if needed. Keep UI round neon blue delivery OS.'
    );
    if (ai.text) {
      log(String(ai.text).replace(/OPS\s*:\s*\[[\s\S]*\]/i, '').trim().slice(0, 500) || '(reshape)', 'ok');
      var more = extractOps(ai.text);
      if (more.length) {
        var a2 = applyOps(more);
        log('AI reshape · ' + more.length + ' op(s) · via ' + (ai.via || '?'), 'ok');
        return { ok: true, ops: localOps.concat(more), applied: applied.concat(a2), via: ai.via, text: ai.text };
      }
      return { ok: true, ops: localOps, applied: applied, via: ai.via, text: ai.text };
    }

    if (!localOps.length) {
      log('Could not reshape yet · try: will help · or subscribe for full co-dev', 'dim');
      return { ok: false, via: null };
    }
    return { ok: true, ops: localOps, applied: applied, via: 'local' };
  }

  /**
   * CLI handle — true if consumed
   */
  function isWillLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;
    if (
      /^(will|reshape|my os|os version|version|fork|export os|import os|reset os|will help|reshape help|os help)\b/.test(
        low
      )
    )
      return true;
    // Intentional reshape language
    if (
      /^(make |set |change |turn |switch |i want |i need |please |can you |could you |let'?s )/.test(low) &&
      /(theme|dark|light|night|day|accent|color|cli|gadget|power|globe|map|rename|compact|spacious|neon|brightness|prefer|delivery|os)/.test(
        low
      )
    )
      return true;
    if (/^(day|night|dark|light|open gadgets|close gadgets|expand cli|collapse cli)$/.test(low)) return true;
    return false;
  }

  async function handleLine(raw) {
    if (!isWillLine(raw) && !/^reshape\b/i.test(raw)) {
      // Still allow freeform through reshape when explicitly OS-y long intent
      var low = String(raw || '').toLowerCase();
      if (!(low.length > 24 && /(reshape|my version|operating system|make the ui|change the ui)/.test(low)))
        return false;
    }
    await reshape(raw, {});
    return true;
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snWillBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        try {
          if (isWillLine(raw) || /^reshape\b/i.test(String(raw || ''))) {
            try {
              if (SNCli.beginTurn) SNCli.beginTurn();
            } catch (_) {}
            try {
              if (SNCli.log) SNCli.log(String(raw).trim(), 'cmd');
            } catch (_) {}
            await handleLine(raw);
            try {
              if (SNCli.endTurn) SNCli.endTurn();
            } catch (_) {}
            return;
          }
        } catch (e) {
          try {
            if (SNCli.log) SNCli.log('WILL · ' + (e && e.message ? e.message : e), 'err');
          } catch (_) {}
        }
        // After normal CLI, if freeform fell through — we don't intercept all freeform here
        return orig(raw);
      };
      SNCli._snWillBound = SNCli.run;
    } catch (_) {}
  }

  function init() {
    installCli();
    setTimeout(function () {
      rehydrate();
      installCli();
      try {
        var v = loadVersion();
        if (global.SNCli && SNCli.log && !(global.__snWillHello)) {
          global.__snWillHello = 1;
          // quiet unless first session
        }
      } catch (_) {}
    }, 400);
    [1200, 3000].forEach(function (ms) {
      setTimeout(installCli, ms);
    });
  }

  global.SNOsWill = {
    init: init,
    reshape: reshape,
    applyOp: applyOp,
    applyOps: applyOps,
    parseLocal: parseLocal,
    handleLine: handleLine,
    isWillLine: isWillLine,
    loadVersion: loadVersion,
    saveVersion: saveVersion,
    rehydrate: rehydrate,
    EXEC: EXEC,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
