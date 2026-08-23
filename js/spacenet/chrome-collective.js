/* Astranov Collective layer — Build 20260812044000-no-chat-steal
 * Ambient field + CLI train/teach/interest/law/export.
 * Chat conversation is owned by SNMindBridge — this layer must not steal it as place-search.
 */
(function (global) {
  'use strict';
  var BUILD = '20260812044000-no-chat-steal';
  if (global.__SN_COLLECTIVE_LAYER === BUILD) return;
  global.__SN_COLLECTIVE_LAYER = BUILD;

  var INTEREST_KEY = 'sn:omni-interests-v1';
  var LAW_KEY = 'sn:omni-laws-v1';
  var TRAIN_KEY = 'sn:omni-train-v1';
  var ambient = true;
  var interests = [];
  var laws = [];
  var trains = [];
  var lastAmbientAt = 0;
  var lastPosKey = '';

  var RESERVED =
    /^(locate|gps|power(\s+on|\s+off)?|call|video|hang|polygon|poly|global|city|map|shops|layers|send|market|offer|offers|install|login|user|cancel|clear|drive|pilot|youtube|yt|bridge|radar|routes?|simulate|accept|decline|omni|elevate|fuse|almighty)\b/i;

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 260), c || 'ok');
    } catch (_) {}
  }
  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(String(m).slice(0, 90));
    } catch (_) {}
  }

  function load() {
    try {
      var ir = JSON.parse(localStorage.getItem(INTEREST_KEY) || '[]');
      if (Array.isArray(ir) && ir.length) interests = ir.slice(0, 40);
    } catch (_) {}
    if (!interests.length) interests = ['local places', 'food', 'marina'];
    try {
      var lw = JSON.parse(localStorage.getItem(LAW_KEY) || '[]');
      if (Array.isArray(lw)) laws = lw.slice(0, 60);
    } catch (_) {}
    try {
      var tr = JSON.parse(localStorage.getItem(TRAIN_KEY) || '[]');
      if (Array.isArray(tr)) trains = tr.slice(-200);
    } catch (_) {}
  }
  function save() {
    try {
      localStorage.setItem(INTEREST_KEY, JSON.stringify(interests.slice(0, 40)));
      localStorage.setItem(LAW_KEY, JSON.stringify(laws.slice(0, 60)));
      localStorage.setItem(TRAIN_KEY, JSON.stringify(trains.slice(-200)));
    } catch (_) {}
  }

  function focusPos() {
    return (
      (global.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      global._snLastPos ||
      (global.SNTasks && SNTasks.pos) || { lat: 36.4341, lng: 28.2176 }
    );
  }

  function matchTrain(q) {
    var low = String(q || '').toLowerCase().trim();
    if (!low) return null;
    var best = null;
    var bestScore = 0;
    trains.forEach(function (t) {
      if (!t || !t.q) return;
      var tq = String(t.q).toLowerCase();
      var score = 0;
      if (tq === low) score = 1;
      else if (low.indexOf(tq) >= 0 || tq.indexOf(low) >= 0) score = 0.75;
      else {
        var aw = tq.split(/\s+/);
        var hit = 0;
        aw.forEach(function (w) {
          if (w.length > 2 && low.indexOf(w) >= 0) hit++;
        });
        score = aw.length ? hit / aw.length : 0;
      }
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    });
    return best && bestScore >= 0.55 ? best : null;
  }

  function teach(q, a) {
    q = String(q || '').trim();
    a = String(a || '').trim();
    if (!q || !a) {
      log('Usage: teach <question> = <answer>', 'dim');
      return;
    }
    trains.push({ q: q, a: a, t: Date.now(), hits: 0 });
    if (trains.length > 200) trains = trains.slice(-200);
    save();
    try {
      if (global.SNAstranovMind && SNAstranovMind.teach)
        SNAstranovMind.teach(q, a, ['cli', 'collective', 'owner']);
      if (global.SNOmni && SNOmni.teach) SNOmni.teach(q, a, ['cli']);
    } catch (_) {}
    log('Learned · ' + q.slice(0, 40) + ' → ' + a.slice(0, 50), 'ok');
    preview('Trained');
  }

  async function runSearch(q, opts) {
    opts = opts || {};
    if (global.SNOmni && SNOmni.search) {
      return SNOmni.search(q, opts);
    }
    return { ok: false };
  }

  async function ambientPulse(reason) {
    if (!ambient) return;
    var now = Date.now();
    if (reason !== 'force' && now - lastAmbientAt < 90000) return;
    var pos = focusPos();
    var key = Number(pos.lat).toFixed(2) + ',' + Number(pos.lng).toFixed(2);
    if (reason !== 'force' && key === lastPosKey && now - lastAmbientAt < 180000) return;
    lastAmbientAt = now;
    lastPosKey = key;
    var q = interests.slice(0, 3).join(' ') + ' near ' + key;
    await runSearch(q, {
      ambient: true,
      mapOnly: true,
      silent: reason === 'boot',
      graphics: true,
    });
    if (reason !== 'boot') {
      log('Field · interests around you · ' + interests.slice(0, 3).join(' · '), 'dim');
    }
  }

  function exportMachine() {
    var payload = {
      build: BUILD,
      os: 'Astranov SpaceNet Collective',
      interests: interests.slice(),
      laws: laws.slice(),
      trains: trains.slice(-50),
      pos: focusPos(),
      omni: !!(global.SNOmni && SNOmni.ready),
    };
    try {
      if (global.SNOmni && SNOmni.exportMachine) return SNOmni.exportMachine();
    } catch (_) {}
    global.__SN_COLLECTIVE_EXPORT = payload;
    log('Machine export · trains ' + trains.length + ' · interests ' + interests.length, 'ok');
  }

  function handle(raw) {
    var line = String(raw || '').trim();
    var low = line.toLowerCase();
    if (!low) return false;

    if (/^(teach|train)\s+/i.test(line)) {
      var body = line.replace(/^(teach|train)\s+/i, '');
      var sep = body.split(/\s*=\s*|\s*→\s*|\s*->\s*|\s+means\s+/i);
      if (sep.length >= 2) {
        teach(sep[0], sep.slice(1).join(' = ').trim());
        return true;
      }
      log('Usage: teach Q = A', 'dim');
      return true;
    }
    if (/^remember\s+/i.test(line)) {
      var rem = line.replace(/^remember\s+/i, '').trim();
      var rp = rem.split(/\s*=\s*|\s+as\s+/i);
      if (rp.length >= 2) teach(rp[0], rp.slice(1).join(' ').trim());
      else teach(rem, rem);
      return true;
    }
    if (/^interest(\s+add)?\s*/i.test(low) || low === 'interests') {
      var ir = line.replace(/^interests?\s*(add)?\s*/i, '').trim();
      if (!ir) {
        log('Interests · ' + interests.join(' · '), 'ok');
        return true;
      }
      ir.split(/[,;|]/).forEach(function (p) {
        p = p.trim();
        if (!p) return;
        if (interests.map(function (x) { return x.toLowerCase(); }).indexOf(p.toLowerCase()) < 0)
          interests.push(p);
      });
      interests = interests.slice(0, 40);
      save();
      log('Interests · ' + interests.join(' · '), 'ok');
      void ambientPulse('force');
      return true;
    }
    if (/^law\s*/i.test(low) || low === 'laws') {
      var lt = line.replace(/^laws?\s*/i, '').trim();
      if (!lt) {
        laws.forEach(function (L, i) {
          log(i + 1 + '. ' + L, 'dim');
        });
        if (!laws.length) log('No laws · law <text>', 'dim');
        return true;
      }
      laws.push(lt.slice(0, 240));
      laws = laws.slice(0, 60);
      save();
      log('Law · ' + lt.slice(0, 80), 'ok');
      return true;
    }
    if (low === 'export' || low === 'export mind' || low === 'export collective') {
      exportMachine();
      return true;
    }
    if (low === 'collective' || low === 'unity' || low === 'we') {
      log('════ COLLECTIVE OS ════', 'ok');
      log('Ambient · ' + (ambient ? 'ON' : 'OFF'), 'ok');
      log('Interests · ' + interests.join(' · '), 'dim');
      return true;
    }
    if (low === 'ambient on' || low === 'field on') {
      ambient = true;
      log('Ambient field ON', 'ok');
      void ambientPulse('force');
      return true;
    }
    if (low === 'ambient off' || low === 'field off') {
      ambient = false;
      log('Ambient field OFF', 'dim');
      return true;
    }
    if (/^forget\s+/i.test(low)) {
      var f = line.replace(/^forget\s+/i, '').trim().toLowerCase();
      trains = trains.filter(function (t) {
        return String(t.q || '').toLowerCase().indexOf(f) < 0;
      });
      interests = interests.filter(function (i) {
        return i.toLowerCase().indexOf(f) < 0;
      });
      save();
      log('Forgot · ' + f, 'dim');
      return true;
    }

    if (RESERVED.test(low)) return false;

    var tr = matchTrain(line);
    if (tr) {
      tr.hits = (tr.hits || 0) + 1;
      save();
      log(tr.a, 'ok');
      preview(String(tr.a).slice(0, 80));
      return true;
    }

    // Natural chat is owned by SNMindBridge — do not steal as place-search
    return false;
  }

  function installCli() {
    if (!global.SNCli || typeof SNCli.run !== 'function') return;
    if (SNCli._snCollectiveHook) return;
    SNCli._snCollectiveHook = true;
    var prev = SNCli.run.bind(SNCli);
    SNCli.run = function (raw) {
      try {
        if (handle(raw)) return Promise.resolve(true);
      } catch (_) {}
      return prev(raw);
    };
  }

  function boot() {
    load();
    installCli();
    setTimeout(installCli, 1500);
    setTimeout(installCli, 4000);
    setTimeout(function () {
      void ambientPulse('boot');
    }, 5000);
    setTimeout(function () {
      void ambientPulse('boot');
    }, 16000);
    setInterval(function () {
      try {
        var p = global._snLastPos;
        if (p && p.lat != null) {
          var k = Number(p.lat).toFixed(2) + ',' + Number(p.lng).toFixed(2);
          if (k !== lastPosKey) void ambientPulse('locate');
        }
      } catch (_) {}
    }, 14000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 2000);

  global.SNCollectiveLayer = {
    build: BUILD,
    teach: teach,
    ambientPulse: ambientPulse,
    exportMachine: exportMachine,
    handle: handle,
  };
})(typeof window !== 'undefined' ? window : globalThis);
