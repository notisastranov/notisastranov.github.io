/**
 * SNPulse — login starts Grok on this device AND pings the Grok Build bus.
 * GitHub/Vercel stay the cold shell. This session is the live wire.
 * Build: 20260822164500-pulse
 */
(function (global) {
  'use strict';

  var P = {
    on: false,
    sid: '',
    reason: '',
    lastHello: 0,
    lastBeat: 0,
    mind: false,
    timer: 0,
    lastErr: '',
  };

  function buildId() {
    try {
      return (document.querySelector('meta[name="astranov-build"]') || {}).content || '';
    } catch (_) {
      return '';
    }
  }

  function who() {
    try {
      var u = global.SNAuth && SNAuth.user;
      if (!u) return { guest: true, id: 'guest' };
      return {
        guest: false,
        id: String(u.id || '').slice(0, 40),
        email: String(u.email || '').slice(0, 80),
        name: String(
          (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) ||
            (u.email && u.email.split('@')[0]) ||
            ''
        ).slice(0, 40),
        owner: !!(global.SNAuth && SNAuth.isOwner && SNAuth.isOwner()),
      };
    } catch (_) {
      return { guest: true, id: 'guest' };
    }
  }

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(String(m).slice(0, 180), c || 'dim', true);
    } catch (_) {}
  }

  function sid() {
    if (P.sid) return P.sid;
    try {
      P.sid = sessionStorage.getItem('sn:pulse-sid') || '';
    } catch (_) {}
    if (!P.sid) {
      P.sid = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try {
        sessionStorage.setItem('sn:pulse-sid', P.sid);
      } catch (_) {}
    }
    return P.sid;
  }

  function snapshot() {
    var w = who();
    return {
      kind: 'hello',
      sid: sid(),
      reason: P.reason || 'boot',
      build: buildId(),
      at: new Date().toISOString(),
      user: w,
      href: String(location.href || '').slice(0, 120),
      ua: String(navigator.userAgent || '').slice(0, 80),
    };
  }

  async function post(body) {
    var r = await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
    });
    return r.json().catch(function () {
      return { ok: false };
    });
  }

  async function applyPending(pack) {
    if (!pack) return;
    try {
      if (pack.fluid && global.SNFluid && SNFluid.apply) SNFluid.apply(pack.fluid, 'bridge', true);
    } catch (_) {}
    try {
      var cmds = pack.cmds || pack.pending || [];
      if (Array.isArray(cmds) && global.SNLiveBridge && SNLiveBridge.inject) {
        SNLiveBridge.inject(cmds);
      }
    } catch (_) {}
  }

  async function hello(reason) {
    P.reason = reason || P.reason || 'boot';
    P.lastHello = Date.now();
    var body = snapshot();
    body.kind = 'hello';
    var pack = null;
    try {
      pack = await post(body);
    } catch (e) {
      P.lastErr = e && e.message ? e.message : String(e);
    }
    try {
      if (global.SNLiveBridge && SNLiveBridge.publish) {
        void SNLiveBridge.publish(
          [{ op: 'session_hello', sid: body.sid, reason: body.reason, user: body.user && body.user.email }],
          Date.now()
        );
      }
    } catch (_) {}
    applyPending(pack);
    return pack;
  }

  async function beat() {
    P.lastBeat = Date.now();
    try {
      var pack = await post({
        kind: 'heartbeat',
        sid: sid(),
        build: buildId(),
        at: new Date().toISOString(),
        user: who(),
      });
      applyPending(pack);
    } catch (_) {}
  }

  async function armMind() {
    if (P.mind) return true;
    var w = who();
    if (w.guest) return false;
    P.mind = true;
    try {
      var r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'session live. one word: ready.',
          allow_paid: true,
          gift: true,
          force_paid: true,
        }),
      });
      var j = await r.json().catch(function () {
        return {};
      });
      if (j && (j.ok || j.text)) {
        if (!global.__snPulseMindSaid) {
          global.__snPulseMindSaid = 1;
          log('Grok live · this session', 'ok');
        }
        return true;
      }
    } catch (_) {}
    P.mind = false;
    return false;
  }

  function startWires() {
    try {
      if (global.SNFluid && SNFluid.init) SNFluid.init();
      if (global.SNFluid && SNFluid.start) SNFluid.start();
    } catch (_) {}
    try {
      if (global.SNLiveBridge && SNLiveBridge.start) SNLiveBridge.start();
    } catch (_) {}
    try {
      if (global.SNGuardian && SNGuardian.start) SNGuardian.start();
    } catch (_) {}
  }

  function loop() {
    if (!P.on || document.hidden) return;
    if (Date.now() - P.lastBeat > 24000) void beat();
  }

  function boot(reason) {
    P.on = true;
    P.reason = reason || 'boot';
    sid();
    startWires();
    void hello(P.reason);
    if (!who().guest) void armMind();
    if (!P.timer) P.timer = setInterval(loop, 8000);
    return true;
  }

  function onLogin() {
    P.mind = false;
    boot('login');
    void armMind();
  }

  function status() {
    return {
      on: P.on,
      sid: P.sid,
      reason: P.reason,
      mind: P.mind,
      lastHello: P.lastHello,
      lastBeat: P.lastBeat,
      err: P.lastErr,
    };
  }

  global.SNPulse = {
    boot: boot,
    hello: hello,
    beat: beat,
    onLogin: onLogin,
    armMind: armMind,
    status: status,
  };
})(typeof window !== 'undefined' ? window : globalThis);
