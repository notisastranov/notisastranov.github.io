/**
 * SNWishInbox — user desires → owner review queue
 * Say it on AI / type / transcribe CLI → stored + flagged for Notis
 * In-scope useful items can be auto-noted for instant agent implementation
 */
(function (global) {
  'use strict';

  var LS = 'sn:wish-inbox-v1';
  var OWNER = 'notisastranov@gmail.com';
  var MAX = 80;

  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(LS) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (_) {
      return [];
    }
  }
  function save(a) {
    try {
      localStorage.setItem(LS, JSON.stringify(a.slice(0, MAX)));
    } catch (_) {}
  }

  function ops(m) {
    try {
      if (global.SNCli && SNCli.ops) SNCli.ops(String(m).slice(0, 140));
      else if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 140), 'ops', true);
    } catch (_) {}
  }

  /** Heuristic: is this in product scope for auto-implement priority */
  function classify(text) {
    var t = String(text || '').toLowerCase();
    var scope = 'review';
    var tags = [];
    if (/polygon|route|tour|delivery|driver|vendor|prep|capacity|auto.?accept|offer|tile|globe|zoom|cli|gadget|theme|marina|payment|wallet|seal|prefer/.test(t)) {
      scope = 'in_scope';
      tags.push('product');
    }
    if (/bug|broken|crash|overlap|lag|stuck|dead/.test(t)) {
      scope = 'bug';
      tags.push('fix');
    }
    if (/game|fps|invader|youtube|dummy/.test(t)) {
      scope = 'out_of_scope';
      tags.push('deferred');
    }
    if (/wish|feature|please add|i want|can we|should|need/.test(t)) tags.push('wish');
    return { scope: scope, tags: tags };
  }

  function submit(text, source) {
    text = String(text || '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    // strip command prefixes
    text = text.replace(/^(wish|request|feature|feedback|tell owner|for notis|to notis)\s*[:\-]?\s*/i, '');
    var c = classify(text);
    var item = {
      id: 'wish:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      text: text.slice(0, 2000),
      source: source || 'cli',
      scope: c.scope,
      tags: c.tags,
      at: Date.now(),
      status: 'queued',
      owner: OWNER,
    };
    var bag = load();
    bag.unshift(item);
    save(bag);
    // mirror for agent continuity
    try {
      var cont = JSON.parse(localStorage.getItem('sn:owner-inbox-v1') || '[]');
      if (!Array.isArray(cont)) cont = [];
      cont.unshift(item);
      localStorage.setItem('sn:owner-inbox-v1', JSON.stringify(cont.slice(0, MAX)));
    } catch (_) {}

    ops(
      (c.scope === 'in_scope' ? 'Wish · in-scope · ' : c.scope === 'bug' ? 'Wish · bug · ' : 'Wish · review · ') +
        text.slice(0, 72)
    );

    // Best-effort notify owner endpoint (no secrets in client)
    try {
      void fetch('/api/wish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      }).catch(function () {});
    } catch (_) {}

    return { ok: true, item: item };
  }

  function list() {
    return load();
  }

  function isWishLine(raw) {
    var t0 = String(raw || '').trim().toLowerCase();
    if (/^(i want|i need|i wish|please add|feature request|can we have|it would be nice|i would like|make it so|we need)/.test(t0))
      return true;
    var low = String(raw || '').trim().toLowerCase();
    if (!low) return false;
    if (/^(wish|request|feature|feedback)\b/.test(low)) return true;
    if (/^(tell owner|for notis|to notis|send to owner)\b/.test(low)) return true;
    if (/^i (want|need|wish)\b/.test(low) && low.length > 12) return true;
    if (/^please (add|make|fix|change)\b/.test(low)) return true;
    return false;
  }

  function handleLine(raw) {
    if (!isWishLine(raw)) return false;
    var r = submit(raw, 'cli');
    if (r.ok) {
      try {
        if (global.SNCli && SNCli.log)
          SNCli.log('Sent to owner review · ' + r.item.scope + ' · ' + r.item.id, 'ok', true);
      } catch (_) {}
    }
    return true;
  }

  function installCli() {
    try {
      if (!global.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli._snWishBound === SNCli.run) return;
      var orig = SNCli.run.bind(SNCli);
      SNCli.run = async function (raw) {
        try {
          var low0 = String(raw || '').trim().toLowerCase();
          if (/^(what('s| is)?|who is|explain)\s+astranov\b|^astranov\??$/.test(low0)) {
            try { if (SNCli.beginTurn) SNCli.beginTurn(); } catch (_) {}
            try { if (SNCli.log) SNCli.log(String(raw).trim(), 'cmd'); } catch (_) {}
            try {
              if (SNCli.log)
                SNCli.log(
                  'Astranov is SpaceNet — the internet depicted in space. Research, calls, and orders are hops on Earth, not a list of links.',
                  'ok',
                  true
                );
            } catch (_) {}
            try { if (SNCli.preview) SNCli.preview('Astranov · SpaceNet'); } catch (_) {}
            try { if (SNCli.endTurn) SNCli.endTurn(); } catch (_) {}
            return true;
          }
          if (isWishLine(raw)) {
            try {
              if (SNCli.beginTurn) SNCli.beginTurn();
            } catch (_) {}
            try {
              if (SNCli.log) SNCli.log(String(raw).trim(), 'cmd');
            } catch (_) {}
            handleLine(raw);
            try {
              if (SNCli.endTurn) SNCli.endTurn();
            } catch (_) {}
            return;
          }
          if (String(raw || '').trim().toLowerCase() === 'wishes' || String(raw || '').trim().toLowerCase() === 'wish list') {
            try {
              if (SNCli.beginTurn) SNCli.beginTurn();
            } catch (_) {}
            var a = list().slice(0, 8);
            if (!a.length) {
              if (SNCli.log) SNCli.log('Wish inbox empty', 'dim');
            } else {
              a.forEach(function (w) {
                if (SNCli.log)
                  SNCli.log(
                    (w.scope || '?') + ' · ' + String(w.text || '').slice(0, 80),
                    'ok'
                  );
              });
            }
            try {
              if (SNCli.endTurn) SNCli.endTurn();
            } catch (_) {}
            return;
          }
        } catch (_) {}
        return orig(raw);
      };
      SNCli._snWishBound = SNCli.run;
    } catch (_) {}
  }

  function init() {
    installCli();
    [600, 2000, 5000].forEach(function (ms) {
      setTimeout(installCli, ms);
    });
  }

  global.SNWishInbox = {
    init: init,
    submit: submit,
    list: list,
    handleLine: handleLine,
    classify: classify,
    isWishLine: isWishLine,
    OWNER: OWNER,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
