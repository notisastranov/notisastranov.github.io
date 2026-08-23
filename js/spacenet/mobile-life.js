/* Astranov mobile-life · 20260822155500-sharp
 * Phone path: sharp globe (DPR 2), compact HUD, no 4s refit hitch.
 */
(function (g) {
  'use strict';
  var touch = false;
  try {
    touch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 0;
  } catch (_) {}
  var ua = '';
  try { ua = String(navigator.userAgent || ''); } catch (_) {}
  var phone = touch || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  var dpr = 1;
  try { dpr = g.devicePixelRatio || 1; } catch (_) {}
  var cssW = g.innerWidth || 390;
  var cssH = g.innerHeight || 844;
  try {
    if (g.visualViewport && g.visualViewport.width) cssW = g.visualViewport.width;
    if (g.visualViewport && g.visualViewport.height) cssH = g.visualViewport.height;
  } catch (_) {}

  g._snLite = !!phone;
  g.SNPerf = g.SNPerf || {};
  if (phone) {
    g.SNPerf.lite = true;
    /* 1.15 made a 360px buffer look like Minecraft. 2x is sharp and still cheap. */
    g.SNPerf.dprCap = Math.min(2, Math.max(1.5, dpr));
    g.SNPerf.globeSegs = cssW >= 400 ? 64 : 56;
    g.SNPerf.starN = 520;
    g.SNPerf.idleSkip = 1;
  }

  function inject() {
    if (document.getElementById('sn-mobile-life-css')) return;
    var s = document.createElement('style');
    s.id = 'sn-mobile-life-css';
    s.textContent =
      'html{-webkit-text-size-adjust:100%!important;text-size-adjust:100%!important}' +
      'html,body{overflow:hidden;overscroll-behavior:none;width:100%;height:100%;height:100dvh;max-width:100vw}' +
      '#globe{position:fixed;inset:0;width:100%;height:100%;overflow:hidden;z-index:1;background:#000}' +
      '#globe canvas{position:absolute!important;left:0!important;top:0!important;' +
      'width:100%!important;height:100%!important;display:block!important;touch-action:none}' +
      '#sn-earth-fallback{z-index:0!important;pointer-events:none!important}' +
      '#sn-topchrome-panel,#panel{width:min(26rem,calc(100vw - 16px))!important;max-width:calc(100vw - 16px)!important;' +
      'backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' +
      '#sn-topchrome{padding:calc(4px + env(safe-area-inset-top,0px)) 8px 0!important}' +
      '#dock{padding:0 8px calc(6px + env(safe-area-inset-bottom,0px))!important}' +
      '#stc-compact{min-height:44px!important;max-height:48px!important;padding:2px 8px!important}' +
      '#field-radar{width:36px!important;height:36px!important}' +
      '#btn-home{font-size:13px!important;letter-spacing:.14em!important}' +
      '#field-balance-hud{padding:4px 8px!important;font-size:12px!important}' +
      '#sn-task-launch{width:34px!important;height:34px!important}' +
      '#sn-task-ribbon{height:40px!important;min-height:40px!important;max-height:40px!important;padding:2px 6px!important;gap:4px!important}' +
      '#sn-task-ribbon .sn-rib-btn,.sn-rib-btn{width:32px!important;height:32px!important;min-width:32px!important;max-width:32px!important;flex:0 0 32px!important}' +
      '#sn-task-ribbon .sn-rib-face,#sn-task-ribbon img,#sn-rib-user img{width:24px!important;height:24px!important;max-width:24px!important;max-height:24px!important}' +
      '#cli-form,#stc-cmd{min-height:40px!important;padding:2px 8px 8px!important}' +
      '#panel{grid-template-rows:8px 40px auto auto!important}' +
      '#cli-in,#stc-cmd-in{font-size:13px!important}' +
      '@media (max-height:760px){#stc-cmd{display:none!important}#stc-compact{min-height:40px!important;max-height:44px!important}}' +
      '@media (min-width:540px){#sn-topchrome-panel,#panel{width:min(24rem,calc(100vw - 32px))!important}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function paintFallback() {
    try {
      if (g.SNGlobe && SNGlobe.webglLive) {
        var dead = document.getElementById('sn-earth-fallback');
        if (dead && dead.parentNode) dead.parentNode.removeChild(dead);
        return;
      }
      var host = document.getElementById('globe');
      if (!host) return;
      var d = document.getElementById('sn-earth-fallback');
      if (!d) {
        d = document.createElement('canvas');
        d.id = 'sn-earth-fallback';
        d.setAttribute('aria-hidden', 'true');
        host.insertBefore(d, host.firstChild);
      }
      var w = Math.round(host.clientWidth || g.innerWidth || 390);
      var h = Math.round(host.clientHeight || g.innerHeight || 844);
      var cap = Math.min(2, dpr);
      var bw = Math.max(64, Math.round(w * cap));
      var bh = Math.max(64, Math.round(h * cap));
      if (d.width !== bw) d.width = bw;
      if (d.height !== bh) d.height = bh;
      var ctx = d.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(cap, 0, 0, cap, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      var cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.32;
      var grd = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.32, r * 0.12, cx, cy, r);
      grd.addColorStop(0, '#5cbcf0');
      grd.addColorStop(0.5, '#0d4fa0');
      grd.addColorStop(1, '#03101f');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.fillStyle = '#34a24e';
      function land(dx, dy, rx, ry) {
        ctx.beginPath();
        ctx.ellipse(cx + dx * r, cy + dy * r, rx * r, ry * r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      land(-0.34, -0.04, 0.18, 0.32);
      land(-0.26, 0.3, 0.1, 0.22);
      land(0.08, -0.2, 0.16, 0.1);
      land(0.14, 0.1, 0.22, 0.3);
      land(0.44, -0.1, 0.3, 0.14);
      land(0.52, 0.24, 0.14, 0.08);
      ctx.fillStyle = '#eef6fb';
      land(0, -0.82, 0.28, 0.08);
      land(0, 0.88, 0.5, 0.07);
      ctx.strokeStyle = 'rgba(20,195,243,0.7)';
      ctx.lineWidth = Math.max(1.5, r * 0.018);
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
      ctx.stroke();
    } catch (_) {}
  }

  var fitT = 0;
  function fitCanvas() {
    try {
      paintFallback();
      var el = document.getElementById('globe');
      var c = el && el.querySelector('canvas:not(#sn-earth-fallback)');
      if (c) {
        c.style.cssText =
          'position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;z-index:2';
      }
      if (g.SNGlobe && typeof g.SNGlobe.fit === 'function') g.SNGlobe.fit();
    } catch (_) {}
  }
  function fitSoon() {
    clearTimeout(fitT);
    fitT = setTimeout(fitCanvas, 80);
  }

  inject();
  paintFallback();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      inject();
      paintFallback();
    });
  }
  g.addEventListener('resize', fitSoon, { passive: true });
  g.addEventListener('orientationchange', function () { setTimeout(fitCanvas, 80); }, { passive: true });
  if (g.visualViewport) g.visualViewport.addEventListener('resize', fitSoon, { passive: true });
  g.SNMobileLife = { build: '20260822155500-sharp', phone: phone, fit: fitCanvas, paint: paintFallback };
})(typeof window !== 'undefined' ? window : globalThis);
