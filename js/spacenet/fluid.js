/**
 * SNFluid — live wire. Talk → pulse → the running HUD changes now.
 * GitHub / Vercel stay the backup shell. Device pack is the living code.
 * Build: 20260822154000-talk-evolve
 */
(function (global) {
  'use strict';

  var F = {
    on: true,
    rev: 0,
    note: '',
    src: '',
    at: '',
    timer: 0,
    busy: false,
    lastErr: '',
    mine: '',
  };

  var SOURCES = ['/api/fluid', '/fluid/live.json'];
  var MINE_KEY = 'sn:fluid-mine-css';
  var NOTE_KEY = 'sn:fluid-note';
  var REV_KEY = 'sn:fluid-rev';

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.beginTurn) SNCli.beginTurn();
    } catch (_) {}
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 220), c || 'ok', true);
    } catch (_) {}
  }

  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(m);
    } catch (_) {}
  }

  function styleEl(id) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
    }
    document.head.appendChild(el);
    return el;
  }

  function applyOps(ops) {
    if (!ops || !ops.length) return;
    ops.forEach(function (op) {
      if (!op || !op.op) return;
      try {
        if (op.op === 'var' && op.name) {
          document.documentElement.style.setProperty(op.name, String(op.value || ''), 'important');
        } else if (op.op === 'hide' && op.id) {
          var h = document.getElementById(op.id);
          if (h) h.style.setProperty('display', 'none', 'important');
        } else if (op.op === 'show' && op.id) {
          var s = document.getElementById(op.id);
          if (s) s.style.setProperty('display', '', 'important');
        } else if (op.op === 'placeholder' && op.id) {
          var i = document.getElementById(op.id);
          if (i) i.placeholder = String(op.value || '').slice(0, 80);
        }
      } catch (_) {}
    });
  }

  function applyMine(css, note) {
    F.mine = String(css || F.mine || '');
    styleEl('sn-fluid-css-mine').textContent = F.mine;
    if (note) F.note = String(note);
    try {
      localStorage.setItem(MINE_KEY, F.mine);
      localStorage.setItem(NOTE_KEY, F.note || '');
      localStorage.setItem(REV_KEY, String(F.rev || 0));
    } catch (_) {}
  }

  function apply(pack, src, force) {
    if (!pack || typeof pack !== 'object') return false;
    var rev = Number(pack.rev || 0);
    if (!force && F.rev && rev && rev <= F.rev) return false;
    if (pack.css != null && src !== 'mine') {
      styleEl('sn-fluid-css').textContent = String(pack.css || '');
    }
    if (pack.css && src === 'mine') applyMine(pack.css, pack.note);
    applyOps(pack.ops);
    if (pack.js && String(pack.js).trim() && pack.owner === true) {
      try {
        var fn = new Function('SNFluid', 'SNCli', 'SNHelper', 'SNGlobe', String(pack.js));
        fn(global.SNFluid, global.SNCli, global.SNHelper, global.SNGlobe);
      } catch (e) {
        F.lastErr = e && e.message ? e.message : String(e);
        log('Live pulse failed. I kept the last good one.', 'err');
        return false;
      }
    }
    if (rev) F.rev = rev;
    F.note = String(pack.note || F.note || '');
    F.src = src || '';
    F.at = pack.at || new Date().toISOString();
    F.lastErr = '';
    return true;
  }

  async function pullOne(url) {
    var r = await fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), {
      cache: 'no-store',
      mode: 'cors',
    });
    if (!r.ok) throw new Error('no pulse');
    return r.json();
  }

  async function pull(opts) {
    opts = opts || {};
    if (F.busy) return F;
    F.busy = true;
    try {
      var pack = await pullOne('/fluid/live.json');
      apply(pack, '/fluid/live.json', !!opts.force);
    } catch (e) {
      F.lastErr = e && e.message ? e.message : String(e);
    }
    F.busy = false;
    if (opts.speak) {
      if (F.rev) log('Live wire on. Pulse ' + F.rev + (F.note ? ' · ' + F.note : '') + '.', 'ok');
      else log('Live wire on. Talk to reshape the HUD.', 'ok');
    }
    return { ok: true, rev: F.rev, note: F.note };
  }

  function isWish(raw) {
    var s = String(raw || '').trim();
    if (!s) return false;
    if (/^(shape|reshape|evolve|fluid change|live change)\b/i.test(s)) return true;
    if (/^(make|change|fix|hide|show|lock)\b/i.test(s) && /(cli|hud|button|handle|chrome|glow|neon|robot|ribbon)/i.test(s))
      return true;
    if (/\b(thinner|thicker|smaller|bigger|rounder|tighter|compact)\b/i.test(s) && /(cli|hud|button|handle|chrome)/i.test(s))
      return true;
    return false;
  }

  async function wish(text) {
    var wishText = String(text || '')
      .replace(/^(shape|reshape|evolve|fluid change|live change)\s*[:.]?\s*/i, '')
      .trim();
    if (!wishText) {
      log('Say the change. Example: make buttons smaller.', 'ok');
      return { ok: false };
    }
    log('Live pulse · ' + wishText.slice(0, 80), 'dim');
    var pack = null;
    try {
      var r = await fetch('/api/fluid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wish: wishText, allow_paid: true, gift: true }),
      });
      pack = await r.json();
    } catch (e) {
      pack = { ok: false, error: String(e && e.message ? e.message : e) };
    }
    if (!pack || !pack.ok || (!pack.css && !(pack.ops && pack.ops.length))) {
      log(pack && pack.text ? pack.text : 'Pulse missed. Say the chrome change in one line.', 'err');
      return { ok: false };
    }
    F.rev = (F.rev || 0) + 1;
    applyMine((F.mine ? F.mine + '\n' : '') + String(pack.css || ''), pack.note);
    applyOps(pack.ops);
    log('Changed now · ' + (pack.note || wishText).slice(0, 80) + ' · this device. Owner still gates the default.', 'ok');
    preview('live · ' + (pack.note || 'pulse ' + F.rev));
    return { ok: true, note: pack.note, via: pack.via };
  }

  async function evolve(reason) {
    return wish(reason || 'tighten chrome, keep round buttons, glow #14c3f3, no coach text');
  }

  function start() {
    F.on = true;
    if (F.timer) return;
    F.timer = setInterval(function () {
      if (!F.on || document.hidden) return;
      pull({ quiet: true });
    }, 12000);
  }

  function stop() {
    F.on = false;
    if (F.timer) {
      try {
        clearInterval(F.timer);
      } catch (_) {}
      F.timer = 0;
    }
  }

  function status() {
    return { on: F.on, rev: F.rev, note: F.note, at: F.at, listening: !!F.timer, mine: !!F.mine };
  }

  function speakStatus() {
    if (!F.on) {
      log('Live wire is off.', 'dim');
      return;
    }
    log(
      'Live wire on. Talk a chrome change and I apply it now. Pulse ' +
        (F.rev || 0) +
        (F.note ? ' · ' + F.note : '') +
        '.',
      'ok'
    );
  }

  function init() {
    try {
      F.rev = Number(localStorage.getItem(REV_KEY) || 0) || 0;
      F.note = localStorage.getItem(NOTE_KEY) || '';
      F.mine = localStorage.getItem(MINE_KEY) || '';
    } catch (_) {}
    if (F.mine) applyMine(F.mine, F.note);
    start();
    pull({ quiet: true });
    return true;
  }

  global.SNFluid = {
    init: init,
    pull: pull,
    apply: apply,
    wish: wish,
    evolve: evolve,
    isWish: isWish,
    start: start,
    stop: stop,
    status: status,
    speakStatus: speakStatus,
  };
})(typeof window !== 'undefined' ? window : globalThis);
