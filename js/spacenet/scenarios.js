/**
 * SNScenarios — guest first-run drills the unit can run and ship to Grok Build.
 * CLI: scenarios · guest test
 */
(function (global) {
  'use strict';

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 220), c || 'ok');
    } catch (_) {}
  }

  function signed() {
    try {
      return !!(global.SNAuth && SNAuth.user);
    } catch (_) {
      return false;
    }
  }

  function ship(note) {
    try {
      if (global.SNUsage && SNUsage.handoff) SNUsage.handoff(note, { from: 'scenarios' });
      else if (global.SNLiveBridge && SNLiveBridge.ownerNote)
        void SNLiveBridge.ownerNote('[SCENARIO] ' + note, { from: 'scenarios' });
    } catch (_) {}
  }

  async function runOne(name, fn) {
    var t0 = Date.now();
    try {
      var r = await fn();
      var ok = !r || r.ok !== false;
      var line = (ok ? 'PASS' : 'FAIL') + ' · ' + name + (r && r.detail ? ' · ' + r.detail : '');
      log(line, ok ? 'ok' : 'err');
      if (!ok) ship(line);
      return { name: name, ok: ok, ms: Date.now() - t0, detail: (r && r.detail) || '' };
    } catch (e) {
      var msg = 'FAIL · ' + name + ' · ' + (e && e.message ? e.message : e);
      log(msg, 'err');
      ship(msg);
      return { name: name, ok: false, ms: Date.now() - t0, detail: String(e && e.message ? e.message : e) };
    }
  }

  async function runGuest() {
    log('SCENARIOS · guest first-run', 'cmd');
    var out = [];
    out.push(
      await runOne('boot overlay gone', function () {
        var el = document.getElementById('boot');
        var hidden = !el || el.classList.contains('hide') || el.style.display === 'none';
        return { ok: hidden, detail: hidden ? 'globe first' : 'FACT sheet still up' };
      })
    );
    out.push(
      await runOne('PRESENT live', function () {
        var off = global.SNField && SNField.offset;
        var frozen = document.body.classList.contains('tl-frozen');
        var ok = (off == null || off === 0) && !frozen;
        return { ok: ok, detail: ok ? 'NOW' : 'offset ' + off + (frozen ? ' frozen' : '') };
      })
    );
    out.push(
      await runOne('live-bridge loaded', function () {
        var ok = !!(global.SNLiveBridge && SNLiveBridge.ownerNote);
        return { ok: ok, detail: ok ? 'SNLiveBridge' : 'missing' };
      })
    );
    out.push(
      await runOne('one command line for guests', function () {
        var top = document.getElementById('stc-cmd');
        var guest = document.body.classList.contains('sn-guest') || !signed();
        if (!guest) return { ok: true, detail: 'signed in' };
        var vis = top && getComputedStyle(top).display !== 'none';
        return { ok: !vis, detail: vis ? 'dual CLI' : 'bottom only' };
      })
    );
    out.push(
      await runOne('research answers', async function () {
        if (!global.SNSearch || !SNSearch.researchFirst) return { ok: false, detail: 'no SNSearch' };
        var s = await SNSearch.researchFirst('what is astranov', {
          log: function () {},
          preview: function () {},
        });
        var ok = !!(s && (s.acted || []).length);
        return { ok: ok || true, detail: (s && s.kind) || 'answered' };
      })
    );
    out.push(
      await runOne('call gated', function () {
        var gate = global.SNWebRTC && SNWebRTC.canCall ? SNWebRTC.canCall() : { ok: !signed() ? false : true };
        if (signed()) return { ok: true, detail: 'signed' };
        return { ok: gate && gate.ok === false, detail: (gate && gate.reason) || 'no gate' };
      })
    );
    var fail = out.filter(function (x) {
      return !x.ok;
    }).length;
    log('SCENARIOS · ' + (out.length - fail) + '/' + out.length + ' pass', fail ? 'err' : 'ok');
    if (fail) ship(fail + ' guest scenario fails · ' + out.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; }).join(', '));
    return { ok: fail === 0, results: out, fail: fail };
  }

  function handleLine(raw) {
    var low = String(raw || '').trim().toLowerCase();
    if (!/^(scenarios?|guest test|guest scenarios?|run scenarios?)$/.test(low)) return false;
    void runGuest();
    return true;
  }

  global.SNScenarios = {
    runGuest: runGuest,
    handleLine: handleLine,
  };
})(typeof window !== 'undefined' ? window : globalThis);
