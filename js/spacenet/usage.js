/* SNUsage — product usage + handoff bridge (first-loop → midnight ship)
 * Local-first events. CLI: usage · handoff · usage export · usage ship
 * Eternal bridge: auto-ships summaries + open handoffs to SNLiveBridge
 * so coding agent (Grok) can improve code forever while users run the app.
 * Recommendations always obey ASTRANOV LAW / SPECS. One fix per Athens day.
 */
(function (global) {
  'use strict';

  var KEY = 'sn:usage-v1';
  var HAND = 'sn:handoff-v1';
  var FLAGS = 'sn:usage-flags-v1';
  var LAST_SHIP = 'sn:usage-last-ship-v1';
  var MAX = 400;
  var SHIP_EVERY_MS = 45 * 60 * 1000; // 45 min soft auto-ship

  var U = { events: [], handoff: [], flags: {} };
  var shipTimer = null;

  function load() {
    try {
      var e = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(e)) U.events = e.slice(-MAX);
    } catch (_) {
      U.events = [];
    }
    try {
      var h = JSON.parse(localStorage.getItem(HAND) || '[]');
      if (Array.isArray(h)) U.handoff = h.slice(-80);
    } catch (_) {
      U.handoff = [];
    }
    try {
      U.flags = JSON.parse(localStorage.getItem(FLAGS) || '{}') || {};
    } catch (_) {
      U.flags = {};
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(U.events.slice(-MAX)));
      localStorage.setItem(HAND, JSON.stringify(U.handoff.slice(-80)));
      localStorage.setItem(FLAGS, JSON.stringify(U.flags || {}));
    } catch (_) {}
  }

  function nowIso() {
    return new Date().toISOString();
  }

  /** Athens calendar date YYYY-MM-DD for midnight ship buckets */
  function athensDate(d) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Athens',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d || new Date());
    } catch (_) {
      return (d || new Date()).toISOString().slice(0, 10);
    }
  }

  function track(name, payload) {
    var row = {
      t: Date.now(),
      iso: nowIso(),
      athens: athensDate(),
      name: String(name || 'event').slice(0, 80),
      payload: payload && typeof payload === 'object' ? payload : { v: payload },
    };
    U.events.push(row);
    if (U.events.length > MAX) U.events.splice(0, U.events.length - MAX);
    save();
    return row;
  }

  function flag(key, val) {
    U.flags[key] = val == null ? true : val;
    save();
    return U.flags;
  }

  function getFlags() {
    return Object.assign({}, U.flags);
  }

  /** Queue a code/product request for the coding agent (bridge from AI chat)
   * Always dual-writes to SNLiveBridge so Grok can see it forever.
   */
  function handoff(note, meta) {
    var row = {
      t: Date.now(),
      iso: nowIso(),
      athens: athensDate(),
      note: String(note || '').slice(0, 2000),
      meta: meta || {},
      status: 'open',
    };
    U.handoff.unshift(row);
    U.handoff = U.handoff.slice(0, 80);
    save();
    track('handoff', { note: row.note.slice(0, 120) });

    // Eternal bridge: push to remote so agent can read without user present
    try {
      if (global.SNLiveBridge && SNLiveBridge.ownerNote) {
        void SNLiveBridge.ownerNote(
          '[HANDOFF] ' + row.note,
          Object.assign({ from: 'usage-handoff', handoff: true }, meta || {})
        );
      }
    } catch (_) {}
    return row;
  }

  function openHandoffs() {
    return U.handoff.filter(function (h) {
      return h.status === 'open';
    });
  }

  function markHandoff(i, status) {
    if (U.handoff[i]) {
      U.handoff[i].status = status || 'done';
      save();
    }
  }

  function summary(days) {
    days = days || 7;
    var cut = Date.now() - days * 864e5;
    var recent = U.events.filter(function (e) {
      return e.t >= cut;
    });
    var counts = {};
    recent.forEach(function (e) {
      counts[e.name] = (counts[e.name] || 0) + 1;
    });
    var top = Object.keys(counts)
      .map(function (k) {
        return { name: k, n: counts[k] };
      })
      .sort(function (a, b) {
        return b.n - a.n;
      })
      .slice(0, 12);
    return {
      athensToday: athensDate(),
      events: recent.length,
      top: top,
      flags: getFlags(),
      openHandoffs: openHandoffs().length,
      lastEvents: recent.slice(-8),
    };
  }

  /** Markdown ship packet for midnight Greek fix (copy / paste to agent) */
  function shipPacket() {
    var s = summary(14);
    var hands = openHandoffs().slice(0, 8);
    var lines = [
      '# SpaceNet usage ship packet',
      'Athens date: ' + s.athensToday,
      'Generated: ' + nowIso(),
      '',
      '## Law',
      'Recommendations must obey ASTRANOV LAW / SPECS. One highest-pain fix only. js/spacenet/* only. Probe live. Push main.',
      '',
      '## Flags',
      '```json',
      JSON.stringify(s.flags, null, 2),
      '```',
      '',
      '## Top events (14d)',
    ];
    s.top.forEach(function (t) {
      lines.push('- ' + t.name + ': ' + t.n);
    });
    lines.push('', '## Open handoffs (bridge AI → code)');
    if (!hands.length) lines.push('- (none)');
    hands.forEach(function (h, i) {
      lines.push((i + 1) + '. ' + h.note + ' · ' + h.iso);
    });
    lines.push('', '## Last events');
    s.lastEvents.forEach(function (e) {
      lines.push('- ' + e.name + ' · ' + e.iso);
    });
    lines.push(
      '',
      '## Ship rule',
      'Pick **one** highest-pain fix. Implement in `js/spacenet/*` only. Probe live. Push main. One fix per Athens midnight. Bridge stays forever.'
    );
    return lines.join('\n');
  }

  function exportJson() {
    return JSON.stringify(
      {
        version: 1,
        athens: athensDate(),
        flags: U.flags,
        events: U.events.slice(-MAX),
        handoff: U.handoff.slice(-80),
        summary: summary(14),
      },
      null,
      2
    );
  }

  /**
   * Push current ship packet + open handoffs to live-bridge / owner-inbox.
   * Returns promise. Soft-fails to local if remote down.
   */
  function shipToBridge(force) {
    var last = 0;
    try {
      last = parseInt(localStorage.getItem(LAST_SHIP) || '0', 10) || 0;
    } catch (_) {}
    if (!force && Date.now() - last < SHIP_EVERY_MS) {
      return Promise.resolve({ ok: true, skipped: true, reason: 'throttle' });
    }
    var packet = shipPacket();
    var s = summary(14);
    var note =
      '[USAGE SHIP] ' +
      s.athensToday +
      ' · events=' +
      s.events +
      ' · openHandoffs=' +
      s.openHandoffs +
      ' · top=' +
      (s.top[0] ? s.top[0].name + ':' + s.top[0].n : 'none');

    track('usage_ship', { events: s.events, open: s.openHandoffs });

    if (!global.SNLiveBridge || !SNLiveBridge.ownerNote) {
      return Promise.resolve({ ok: true, local: true, remote: false, note: note });
    }

    return SNLiveBridge.ownerNote(note + '\n\n' + packet.slice(0, 1600), {
      from: 'usage-ship',
      usage: true,
      events: s.events,
      openHandoffs: s.openHandoffs,
      top: s.top.slice(0, 5),
    })
      .then(function (res) {
        var remote = !!(res && res.remote);
        // Only stamp throttle after remote success so soft-fails retry sooner
        if (remote) {
          try {
            localStorage.setItem(LAST_SHIP, String(Date.now()));
          } catch (_) {}
        }
        return {
          ok: !!(res && (res.ok || res.local)),
          remote: remote,
          local: true,
          note: note,
          res: res,
        };
      })
      .catch(function (e) {
        return { ok: true, local: true, remote: false, error: String(e && e.message ? e.message : e) };
      });
  }

  function startAutoShip() {
    if (shipTimer) return;
    // First ship after shell is warm
    setTimeout(function () {
      void shipToBridge(false);
    }, 90 * 1000);
    shipTimer = setInterval(function () {
      if (document.hidden) return;
      void shipToBridge(false);
    }, SHIP_EVERY_MS);
  }

  function stopAutoShip() {
    if (shipTimer) clearInterval(shipTimer);
    shipTimer = null;
  }

  load();
  // Boot auto-ship once modules are present
  setTimeout(function () {
    try {
      startAutoShip();
    } catch (_) {}
  }, 4000);

  global.SNUsage = {
    track: track,
    flag: flag,
    getFlags: getFlags,
    handoff: handoff,
    openHandoffs: openHandoffs,
    markHandoff: markHandoff,
    summary: summary,
    shipPacket: shipPacket,
    exportJson: exportJson,
    athensDate: athensDate,
    shipToBridge: shipToBridge,
    startAutoShip: startAutoShip,
    stopAutoShip: stopAutoShip,
    get events() {
      return U.events.slice();
    },
  };
})(window);
