/**
 * SNPrefs — personal designs stay personal.
 * Law: user prefs are recorded for the people who make them.
 * They never become SpaceNet default until filtered and passed by
 * AIs + humans + the founder. Anyone may brand, sell, or donate a HUD.
 * The fundamental deck we develop together stays the default.
 */
(function (global) {
  'use strict';

  var KEY = 'sn:prefs-personal-v1';
  var PROP_KEY = 'sn:prefs-proposals-v1';
  var DEFAULT_ID = 'astranov-spacenet';

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return fallback;
  }
  function save(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }
  function who() {
    try {
      var u = global.SNAuth && SNAuth.user;
      if (u) return { id: u.id || u.uid || '', name: u.name || u.email || 'guest' };
    } catch (_) {}
    return { id: '', name: 'guest' };
  }
  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 240), c || 'ok');
    } catch (_) {}
  }

  function state() {
    var s = load(KEY, null) || {
      active: DEFAULT_ID,
      mine: {},
    };
    if (!s.mine[DEFAULT_ID]) {
      s.mine[DEFAULT_ID] = {
        id: DEFAULT_ID,
        name: 'Astranov SpaceNet',
        owner: 'founder',
        kind: 'default',
        locked: true,
        note: 'Fundamental deck. Not overwritten by personal prefs.',
      };
    }
    return s;
  }

  function set(partial) {
    var s = state();
    var uid = who().id || 'local';
    var mine = s.mine[uid] || {
      id: uid,
      name: who().name + ' HUD',
      owner: who().name,
      kind: 'personal',
      locked: false,
      hud: {},
    };
    Object.keys(partial || {}).forEach(function (k) {
      mine.hud = mine.hud || {};
      mine.hud[k] = partial[k];
    });
    mine.updated = new Date().toISOString();
    s.mine[uid] = mine;
    save(KEY, s);
    log('PREF · saved for ' + mine.name + ' · not the default', 'ok');
    return mine;
  }

  function use(id) {
    var s = state();
    var pack = s.mine[id];
    if (!pack) {
      log('PREF · no pack ' + id, 'err');
      return null;
    }
    s.active = id;
    save(KEY, s);
    log(
      pack.locked
        ? 'PREF · fundamental SpaceNet default'
        : 'PREF · using personal ' + pack.name + ' · default unchanged',
      'ok'
    );
    return pack;
  }

  function propose(note) {
    var s = state();
    var uid = who().id || 'local';
    var pack = s.mine[uid];
    if (!pack || pack.locked) {
      log('PREF · nothing personal to propose', 'dim');
      return null;
    }
    var row = {
      id: 'p-' + Date.now().toString(36),
      from: who(),
      pack: pack,
      note: String(note || 'HUD / behavior proposal').slice(0, 400),
      status: 'filter',
      at: new Date().toISOString(),
    };
    var list = load(PROP_KEY, []);
    list.unshift(row);
    save(PROP_KEY, list.slice(0, 80));
    try {
      if (global.SNUsage && SNUsage.handoff)
        SNUsage.handoff('[PREF PROPOSE] ' + row.note + ' · ' + pack.name, { from: 'prefs' });
      else if (global.SNLiveBridge && SNLiveBridge.ownerNote)
        void SNLiveBridge.ownerNote('[PREF PROPOSE] ' + row.note + ' · ' + pack.name, { from: 'prefs' });
    } catch (_) {}
    log('PREF · proposed · filter · AIs + humans + founder. Not live for everybody yet.', 'ok');
    try {
      if (global.SNCurrency && SNCurrency.reward) SNCurrency.reward('improve');
    } catch (_) {}
    return row;
  }

  function brand(name, mode) {
    var s = state();
    var uid = who().id || 'local';
    var pack = s.mine[uid] || set({});
    pack.name = String(name || pack.name || 'Untitled HUD').slice(0, 80);
    pack.mode = mode === 'sell' ? 'sell' : mode === 'donate' ? 'donate' : 'personal';
    pack.branded = true;
    s.mine[uid] = pack;
    save(KEY, s);
    log(
      'PREF · branded ' +
        pack.name +
        (pack.mode === 'sell' ? ' · listed to sell' : pack.mode === 'donate' ? ' · donated to SpaceNet' : ''),
      'ok'
    );
    if (pack.mode === 'donate' || pack.mode === 'sell') propose(pack.mode + ' · ' + pack.name);
    return pack;
  }

  function list() {
    var s = state();
    var rows = Object.keys(s.mine).map(function (k) {
      return s.mine[k];
    });
    log('PREF · ' + rows.length + ' packs · active ' + s.active + ' · default locked', 'ok');
    rows.forEach(function (p) {
      log((p.locked ? 'DEFAULT' : p.mode || 'personal') + ' · ' + p.name, p.locked ? 'ok' : 'dim');
    });
    return rows;
  }

  function handleLine(raw) {
    var line = String(raw || '').trim();
    var low = line.toLowerCase();
    if (low === 'pref' || low === 'prefs' || low === 'my hud' || low === 'designs') {
      list();
      log('pref save <k=v> · propose <note> · brand <name> · sell <name> · donate design <name>', 'dim');
      return true;
    }
    var m;
    if ((m = /^pref(?:s)? save\s+(.+)$/i.exec(line))) {
      var bits = {};
      m[1].split(/\s+/).forEach(function (p) {
        var kv = p.split('=');
        if (kv[0]) bits[kv[0]] = kv.slice(1).join('=') || true;
      });
      set(bits);
      return true;
    }
    if ((m = /^propose(?: hud)?\s*(.*)$/i.exec(line))) {
      propose(m[1]);
      return true;
    }
    if ((m = /^(brand|sell|donate design)\s+(.+)$/i.exec(line))) {
      brand(m[2], /sell/i.test(m[1]) ? 'sell' : /donate/i.test(m[1]) ? 'donate' : 'personal');
      return true;
    }
    if (low === 'default hud' || low === 'use default' || low === 'fundamental') {
      use(DEFAULT_ID);
      return true;
    }
    return false;
  }

  global.SNPrefs = {
    set: set,
    use: use,
    propose: propose,
    brand: brand,
    list: list,
    handleLine: handleLine,
    DEFAULT: DEFAULT_ID,
  };
})(typeof window !== 'undefined' ? window : globalThis);
