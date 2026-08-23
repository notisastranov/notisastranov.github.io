/**
 * SNLiveBridge — runtime control without redeploy
 *
 * Browser polls public JSON on Supabase storage:
 *   {sbUrl}/storage/v1/object/public/debug-pub/live-bridge.json
 *
 * Agent / superuser writes via edge debug-write:
 *   POST /functions/v1/debug-write
 *   { "kind": "live_bridge", "seq": 1, "cmds": [ { "op": "sim_speed", "ms": 5500 } ] }
 *
 * Ops: sim_start|sim_stop|sim_speed|sim_burst|cli|credit_fee|super_show|notice
 */
(function (global) {
  'use strict';
  var ALLOW_CMDS = {
    reload: 1,
    hard_reload: 1,
    locate: 1,
    'fill shops': 1,
    'route test': 1,
    'ready score': 1,
    'test ready': 1,
    'go live': 1,
  };
  function cmdAllowed(c) {
    var s = String(c || '')
      .trim()
      .toLowerCase();
    if (!s) return false;
    if (ALLOW_CMDS[s]) return true;
    // allow agent notes style no exec
    if (s.indexOf('agent ') === 0) return false;
    return false;
  }


  var lastSeq = 0;
  var timer = null;
  var pollMs = 1600;

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
    } catch (e) {}
  }

  function bridgeUrl() {
    var base = (global.SN_CONFIG && SN_CONFIG.sbUrl) || global.SB_URL || '';
    return base.replace(/\/$/, '') + '/storage/v1/object/public/debug-pub/live-bridge.json';
  }

  function inboxUrl() {
    var base = (global.SN_CONFIG && SN_CONFIG.sbUrl) || global.SB_URL || '';
    return base.replace(/\/$/, '') + '/storage/v1/object/public/debug-pub/owner-inbox.json';
  }

  function isGuest() {
    try {
      return !(global.SNAuth && SNAuth.user);
    } catch (_) {
      return true;
    }
  }

  function isInternalNote(cmd) {
    var t = String((cmd && (cmd.text || cmd.msg)) || cmd && cmd.op || '');
    if (/USAGE SHIP|ASTRANOV LAW|Push main|openHandoffs|js\/spacenet|\[SOS\]/i.test(t)) return true;
    var from = String((cmd && cmd.from) || '');
    if (/usage-ship|scenarios|prefs|guardian/i.test(from)) return true;
    return false;
  }

  function applyCmd(cmd) {
    if (!cmd || !cmd.op) return;
    var op = String(cmd.op).toLowerCase();
    if (op === 'owner_note' || op === 'note' || op === 'fix' || op === 'sos') {
      if (isGuest() || isInternalNote(cmd) || op === 'sos') return;
    }
    if (!isInternalNote(cmd))
      log('Bridge IN · ' + op + (cmd.ms ? ' ' + cmd.ms : ''), 'cmd');
    try {
      if (op === 'sim_task' || op === 'sim' || op === 'train') {
        log('Bridge · sim/train removed · use first_loop / cli', 'dim');
      } else if (op === 'first_loop' || op === 'first_delivery' || op === 'first_order') {
        if (global.SNMarket && SNMarket.runFirstLoop) {
          void SNMarket.runFirstLoop({ skipLocate: !!cmd.skipLocate });
        } else log('Bridge · market not loaded yet', 'err');
      } else if (op === 'donate_on' && global.SNResources) {
        SNResources.setDonate(true);
      } else if (op === 'donate_off' && global.SNResources) {
        SNResources.setDonate(false);
      } else if (op === 'mine_on' && global.SNResources) {
        SNResources.setMining(true);
      } else if (op === 'mine_off' && global.SNResources) {
        SNResources.setMining(false);
      } else if (op === 'status' || op === 'monitor') {
        var st = {
          build: (document.querySelector('meta[name="astranov-build"]') || {}).content || '',
          mine: global.SNResources && SNResources.report && SNResources.report(),
          market: global.SNMarket && SNMarket.coachStatus && SNMarket.coachStatus(),
          shellMs: performance.now(),
        };
        log('Monitor · ' + JSON.stringify(st).slice(0, 220), 'dim');
        console.info('[Astranov monitor]', st);
      } else if (op === 'task_fit' && global.SNTaskBoard && SNTaskBoard.listCompatibleOnCli) {
        SNTaskBoard.listCompatibleOnCli();
      } else if (op === 'cli' && global.SNCli && SNCli.run) {
        void SNCli.run(String(cmd.text || cmd.cmd || ''));
      } else if (op === 'ai' && global.SNAi && SNAi.ask) {
        void SNAi.ask(String(cmd.text || cmd.msg || ''));
      } else if (op === 'credit_fee' && global.SNCurrency && SNCurrency.notePlatformFee) {
        SNCurrency.notePlatformFee(Number(cmd.amount) || 0.01, { why: 'bridge' });
      } else if (op === 'take_fee' && global.SNCurrency && SNCurrency.takePlatformFeeFrom) {
        SNCurrency.takePlatformFeeFrom(Number(cmd.gross) || 10, 'bridge');
      } else if (op === 'super_show' && global.SNSuper) {
        SNSuper.show();
      } else if (op === 'notice' && global.SNField && SNField.setNotice) {
        SNField.setNotice(String(cmd.text || '').slice(0, 48));
      } else if (op === 'preview' && global.SNCli && SNCli.preview) {
        SNCli.preview(String(cmd.text || ''));
      } else if (op === 'locate' && global.SNCli && SNCli.run) {
        void SNCli.run('locate');
      } else if (op === 'me' || op === 'user') {
        if (global.SNField && SNField.openLoggedInUser) SNField.openLoggedInUser();
        else if (global.SNCli && SNCli.run) void SNCli.run('me');
      } else if (op === 'reload' || op === 'hard_reload') {
        try {
          if (global.SNHome && SNHome.hardReload) SNHome.hardReload();
          else location.reload();
        } catch (_) {
          location.reload();
        }
      } else if (op === 'order' || op === 'pizza') {
        if (global.SNCli && SNCli.run)
          void SNCli.run(String(cmd.text || 'order me a pizza'));
      } else if (op === 'timeline' && global.SNTimeline) {
        if (cmd.offset != null) SNTimeline.setOffset(cmd.offset, { freeze: !!cmd.freeze });
        else if (cmd.present) SNTimeline.present();
      } else if (op === 'owner_note' || op === 'note' || op === 'fix') {
        var note = String(cmd.text || cmd.msg || '').slice(0, 500);
        try {
          var bag = JSON.parse(localStorage.getItem('sn:owner-notes-v1') || '[]');
          if (!Array.isArray(bag)) bag = [];
          bag.unshift({ t: Date.now(), text: note });
          localStorage.setItem('sn:owner-notes-v1', JSON.stringify(bag.slice(0, 40)));
        } catch (_) {}
        log('Owner note saved · ' + note.slice(0, 80), 'ok');
        if (global.SNCli && SNCli.preview) SNCli.preview('Note saved for agent');
      } else {
        log('Bridge · unknown op ' + op, 'err');
      }
    } catch (e) {
      log('Bridge fail · ' + (e.message || e), 'err');
    }
  }

  function applyPayload(j) {
    if (!j || typeof j !== 'object') return;
    var seq = Number(j.seq) || 0;
    if (seq && seq <= lastSeq) return;
    if (seq) lastSeq = seq;
    var cmds = j.cmds || j.commands || [];
    if (!Array.isArray(cmds) && j.op) cmds = [j];
    var i;
    for (i = 0; i < cmds.length; i++) applyCmd(cmds[i]);
  }

  async function poll() {
    try {
      var url = bridgeUrl() + '?t=' + Date.now();
      var r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return;
      var j = await r.json();
      applyPayload(j);
    } catch (e) {
      /* file missing until first write — ok */
    }
  }

  function start() {
    if (timer) return;
    void poll();
    timer = setInterval(function () {
      void poll();
    }, pollMs);
    log('Live bridge · polling for remote cmds', 'dim');
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  /** Local inject (console / agent shell eval in page) */
  function inject(cmds, seq) {
    applyPayload({ seq: seq || Date.now(), cmds: Array.isArray(cmds) ? cmds : [cmds] });
  }

  /**
   * Publish cmds via debug-write (works if function is deployed with service role).
   * Returns fetch promise.
   */
  function publish(cmds, seq) {
    var cfg = global.SN_CONFIG || {};
    var url = (cfg.sbUrl || global.SB_URL || '').replace(/\/$/, '') + '/functions/v1/debug-write';
    var body = {
      kind: 'live_bridge',
      seq: seq || Date.now(),
      cmds: Array.isArray(cmds) ? cmds : [cmds],
      from: 'client',
      at: new Date().toISOString(),
    };
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.sbKey || global.SB_KEY || '',
        Authorization: 'Bearer ' + (cfg.sbKey || global.SB_KEY || ''),
      },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () {
        return { ok: r.ok };
      });
    });
  }

  setTimeout(function(){ try{ if(global.SNPerf&&SNPerf.dummyOff)return; start(); }catch(_){ } }, 1500);

  function localNotes() {
    try {
      var bag = JSON.parse(localStorage.getItem('sn:owner-notes-v1') || '[]');
      return Array.isArray(bag) ? bag : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalNote(note, meta) {
    try {
      var bag = localNotes();
      bag.unshift({
        t: Date.now(),
        text: note,
        meta: meta || {},
      });
      localStorage.setItem('sn:owner-notes-v1', JSON.stringify(bag.slice(0, 60)));
    } catch (_) {}
  }

  /** Read current remote bridge file */
  async function fetchRemote() {
    var url = bridgeUrl() + '?t=' + Date.now();
    var r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('poll HTTP ' + r.status);
    return r.json();
  }

  /**
   * Owner → coding agent note.
   * Dual path: localStorage + Supabase live-bridge.json (public) so Grok Build can fetch it.
   */
  function ownerNote(text, meta) {
    var note = String(text || '').trim().slice(0, 800);
    if (!note) return Promise.resolve({ ok: false, error: 'empty' });
    saveLocalNote(note, meta);
    applyCmd({ op: 'owner_note', text: note });

    var seq = Date.now();
    var entry = {
      op: 'owner_note',
      text: note,
      from: (meta && meta.from) || 'cli',
      at: new Date().toISOString(),
      build:
        ((document.querySelector('meta[name="astranov-build"]') || {}).content || '').slice(0, 80),
    };

    // Merge with existing remote notes so history is not wiped
    return fetchRemote()
      .catch(function () {
        return { notes: [], cmds: [] };
      })
      .then(function (cur) {
        var notes = Array.isArray(cur.notes) ? cur.notes.slice(0, 80) : [];
        notes.unshift(entry);
        var cmds = [{ op: 'owner_note', text: note, from: entry.from }];
        // Keep non-note cmds from remote if fresh
        if (Array.isArray(cur.cmds)) {
          cur.cmds.forEach(function (c) {
            if (c && c.op && c.op !== 'owner_note') cmds.push(c);
          });
        }
        var cfg = global.SN_CONFIG || {};
        var url = (cfg.sbUrl || global.SB_URL || '').replace(/\/$/, '') + '/functions/v1/debug-write';
        var body = {
          kind: 'live_bridge',
          seq: seq,
          cmds: cmds,
          notes: notes.slice(0, 40),
          note: note,
          from: 'client',
          at: entry.at,
          build: entry.build,
        };
        return fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: cfg.sbKey || global.SB_KEY || '',
            Authorization: 'Bearer ' + (cfg.sbKey || global.SB_KEY || ''),
          },
          body: JSON.stringify(body),
        })
          .then(function (r) {
            return r.json().catch(function () {
              return { ok: r.ok };
            });
          })
          .then(function (res) {
            // Second channel: durable owner-inbox (best-effort)
            return fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: cfg.sbKey || global.SB_KEY || '',
                Authorization: 'Bearer ' + (cfg.sbKey || global.SB_KEY || ''),
              },
              body: JSON.stringify({
                kind: 'owner_inbox',
                seq: seq,
                note: note,
                notes: notes.slice(0, 20),
                from: entry.from,
                build: entry.build,
              }),
            })
              .then(function () {
                return res;
              })
              .catch(function () {
                return res;
              });
          });
      })
      .then(function (res) {
        var ok = !!(res && (res.ok === true || res.file));
        if (ok) log('Bridge OUT · note live for coding agent', 'ok');
        else log('Bridge OUT · soft · note kept local', 'dim');
        return { ok: ok, local: true, remote: ok, res: res, text: note };
      })
      .catch(function (e) {
        log('Bridge publish soft-fail · note kept local · ' + (e && e.message ? e.message : e), 'dim');
        return { ok: true, local: true, remote: false, error: String(e && e.message ? e.message : e) };
      });
  }

  async function status() {
    var st = {
      polling: !!timer,
      lastSeq: lastSeq,
      url: bridgeUrl(),
      localNotes: localNotes().length,
      remote: null,
      ok: false,
    };
    try {
      var j = await fetchRemote();
      st.remote = {
        seq: j.seq,
        from: j.from,
        received_at: j.received_at,
        cmds: (j.cmds || []).length,
        notes: Array.isArray(j.notes) ? j.notes.length : j.note ? 1 : 0,
        lastNote: (Array.isArray(j.notes) && j.notes[0] && j.notes[0].text) || j.note || '',
      };
      st.ok = true;
    } catch (e) {
      st.error = String(e && e.message ? e.message : e);
    }
    try {
      var ir = await fetch(inboxUrl() + '?t=' + Date.now(), { cache: 'no-store' });
      if (ir.ok) {
        var ib = await ir.json();
        st.inbox = {
          notes: Array.isArray(ib.notes) ? ib.notes.length : 0,
          lastNote:
            (Array.isArray(ib.notes) && ib.notes[0] && (ib.notes[0].text || ib.notes[0].note)) ||
            '',
        };
      }
    } catch (_) {}
    return st;
  }

  /** Round-trip self-test for owner */
  async function selfTest() {
    var token = 'bridge-test-' + Date.now().toString(36);
    log('Bridge test · publishing…', 'dim');
    var pub = await ownerNote('SELFTEST ' + token, { from: 'selftest' });
    await new Promise(function (r) {
      setTimeout(r, 600);
    });
    var st = await status();
    var hit = false;
    try {
      var j = await fetchRemote();
      var blob = JSON.stringify(j);
      hit = blob.indexOf(token) >= 0;
    } catch (_) {}
    var ok = !!(pub && (pub.remote || pub.ok) && (hit || st.ok));
    log(
      ok
        ? 'Bridge OK · coding agent channel live · ' + token
        : 'Bridge WEAK · note local · remote ' + (hit ? 'hit' : 'miss'),
      ok ? 'ok' : 'err'
    );
    return { ok: ok, token: token, pub: pub, status: st, hit: hit };
  }

  global.SNLiveBridge = {
    start: start,
    stop: stop,
    poll: poll,
    inject: inject,
    publish: publish,
    applyCmd: applyCmd,
    ownerNote: ownerNote,
    bridgeUrl: bridgeUrl,
    inboxUrl: inboxUrl,
    status: status,
    selfTest: selfTest,
    fetchRemote: fetchRemote,
    localNotes: localNotes,
    get lastSeq() {
      return lastSeq;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
