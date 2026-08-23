/**
 * SNGameDock — floating game launcher for Real-Earth OS
 * =====================================================
 * Deep neon · HELPER · SPACE SCENE · INVADERS
 * Keeps globe primacy; one-tap play without typing CLI.
 * CLI still works: earth ops · invaders · helper patrol · games
 */
(function (global) {
  'use strict';

  var ROOT_ID = 'sn-game-dock';
  var STYLE_ID = 'sn-game-dock-css';
  var root = null;
  var open = false;
  var mounted = false;

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'dim');
    } catch (_) {}
  }
  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(m);
    } catch (_) {}
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      '#' +
      ROOT_ID +
      '{position:fixed;right:12px;bottom:96px;z-index:135;font-family:"Space Grotesk",system-ui,sans-serif;' +
      'display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none}' +
      '#' +
      ROOT_ID +
      ' *{box-sizing:border-box}' +
      '#' +
      ROOT_ID +
      ' .gd-toggle{pointer-events:auto;display:flex;align-items:center;gap:10px;' +
      'padding:10px 14px;border-radius:16px;border:1px solid rgba(80,160,255,0.45);' +
      'background:linear-gradient(135deg,rgba(0,12,36,0.94),rgba(8,28,64,0.9));' +
      'color:#e8f2ff;font:700 12px/1.1 "Space Grotesk",system-ui,sans-serif;letter-spacing:0.06em;' +
      'box-shadow:0 0 0 1px rgba(40,120,255,0.15),0 10px 32px rgba(0,40,120,0.45),inset 0 1px 0 rgba(160,210,255,0.12);' +
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);cursor:pointer;touch-action:manipulation;' +
      'min-height:44px;transition:border-color .2s,box-shadow .2s,transform .15s}' +
      '#' +
      ROOT_ID +
      ' .gd-toggle:hover,#' +
      ROOT_ID +
      ' .gd-toggle:focus-visible{border-color:rgba(100,190,255,0.85);outline:none;' +
      'box-shadow:0 0 24px rgba(40,140,255,0.45),0 12px 36px rgba(0,40,140,0.5),inset 0 1px 0 rgba(180,220,255,0.18)}' +
      '#' +
      ROOT_ID +
      ' .gd-toggle:active{transform:scale(0.97)}' +
      '#' +
      ROOT_ID +
      ' .gd-orb{width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#d8f0ff,#2a8cff 55%,#0040a0);' +
      'box-shadow:0 0 12px #3a9fff,0 0 22px rgba(40,140,255,0.6);animation:gd-pulse 1.8s ease-in-out infinite;flex-shrink:0}' +
      '#' +
      ROOT_ID +
      ' .gd-toggle-txt{display:flex;flex-direction:column;align-items:flex-start;gap:2px}' +
      '#' +
      ROOT_ID +
      ' .gd-toggle-txt b{font-size:12px;font-weight:700}' +
      '#' +
      ROOT_ID +
      ' .gd-toggle-txt span{font-size:10px;font-weight:500;opacity:0.7;letter-spacing:0.04em}' +
      '#' +
      ROOT_ID +
      ' .gd-panel{pointer-events:auto;display:none;flex-direction:column;gap:6px;padding:10px;' +
      'border-radius:18px;border:1px solid rgba(70,150,255,0.4);' +
      'background:linear-gradient(160deg,rgba(0,10,32,0.96),rgba(6,24,58,0.94));' +
      'box-shadow:0 0 0 1px rgba(40,100,255,0.12),0 16px 40px rgba(0,20,60,0.55),inset 0 1px 0 rgba(140,200,255,0.1);' +
      'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);min-width:196px;' +
      'animation:gd-rise .22s ease-out}' +
      '#' +
      ROOT_ID +
      '.open .gd-panel{display:flex}' +
      '#' +
      ROOT_ID +
      ' .gd-head{font:700 10px/1 system-ui,sans-serif;letter-spacing:0.14em;color:rgba(140,190,255,0.85);' +
      'padding:2px 6px 6px;text-transform:uppercase}' +
      '#' +
      ROOT_ID +
      ' .gd-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;' +
      'padding:10px 12px;border-radius:12px;border:1px solid rgba(60,140,255,0.28);' +
      'background:rgba(8,24,56,0.65);color:#eaf3ff;cursor:pointer;touch-action:manipulation;' +
      'font:600 12px/1.2 "Space Grotesk",system-ui,sans-serif;min-height:48px;' +
      'transition:border-color .15s,background .15s,transform .12s}' +
      '#' +
      ROOT_ID +
      ' .gd-btn:hover,#' +
      ROOT_ID +
      ' .gd-btn:focus-visible{border-color:rgba(100,190,255,0.7);background:rgba(16,48,100,0.75);outline:none}' +
      '#' +
      ROOT_ID +
      ' .gd-btn:active{transform:scale(0.98)}' +
      '#' +
      ROOT_ID +
      ' .gd-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;' +
      'font-size:11px;font-weight:800;letter-spacing:0.04em;flex-shrink:0;color:#d8ecff;' +
      'background:radial-gradient(circle at 30% 30%,rgba(120,190,255,0.4),rgba(20,60,140,0.55));' +
      'border:1px solid rgba(100,170,255,0.4);box-shadow:inset 0 1px 0 rgba(200,230,255,0.18),0 0 12px rgba(40,120,255,0.25)}' +
      '#' +
      ROOT_ID +
      ' .gd-btn strong{display:block;font-size:12px;font-weight:700;letter-spacing:0.03em}' +
      '#' +
      ROOT_ID +
      ' .gd-btn em{display:block;font-style:normal;font-size:10px;opacity:0.65;font-weight:500;margin-top:2px}' +
      '#' +
      ROOT_ID +
      ' .gd-tip{font:500 9px/1.3 system-ui,sans-serif;color:rgba(140,180,230,0.7);padding:4px 6px 2px}' +
      '@keyframes gd-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.55;transform:scale(0.88)}}' +
      '@keyframes gd-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
      '@media (max-width:480px){#' +
      ROOT_ID +
      '{right:10px;bottom:108px;left:auto}#' +
      ROOT_ID +
      ' .gd-panel{min-width:176px}}' +
      /* hide duplicate earth-ops chip when dock is present */
      'body.sn-game-dock-on #sn-earth-ops-chip{display:none!important}';
    document.head.appendChild(st);
  }

  function btn(ico, title, sub, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'gd-btn';
    b.innerHTML =
      '<span class="gd-ico" aria-hidden="true">' +
      ico +
      '</span><span><strong>' +
      title +
      '</strong><em>' +
      sub +
      '</em></span>';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try {
        onClick();
      } catch (err) {
        log(String(err && err.message ? err.message : err), 'err');
      }
      setOpen(false);
    });
    return b;
  }

  async function runHelper() {
    try {
      if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure(['helper']);
    } catch (_) {}
    if (global.SNHelper) {
      if (SNHelper.init) SNHelper.init({ autoWake: true });
      if (SNHelper.patrol) SNHelper.patrol();
      else if (SNHelper.showcase) SNHelper.showcase();
      else if (SNHelper.wake) SNHelper.wake({ force: true, label: 'UNIT · SILVER WINGS' });
    }
    log('SPACEX BOT · silver-wing patrol', 'ok');
    preview('helper patrol');
  }

  async function runOps() {
    try {
      if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure(['spacescene', 'space-scene', 'earthops', 'helper', 'gaming']);
    } catch (_) {}
    if (global.SNSpaceScene && SNSpaceScene.start) SNSpaceScene.start({});
    else if (global.SNEarthOps && SNEarthOps.start) SNEarthOps.start();
    else if (global.SNEarthOps && SNEarthOps.open) SNEarthOps.open();
    log('Space Scene · real Earth orbit theater', 'ok');
    preview('space scene');
  }

  async function runInvaders() {
    try {
      if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure(['invaders', 'game']);
    } catch (_) {}
    if (global.SNInvaders) {
      if (SNInvaders.open) SNInvaders.open();
      else if (SNInvaders.start) SNInvaders.start();
      else if (SNInvaders.openGame) SNInvaders.openGame();
    }
    log('Invaders · cockpit online', 'ok');
    preview('invaders');
  }

  function setOpen(v) {
    open = !!v;
    if (root) root.classList.toggle('open', open);
  }

  function mount() {
    if (mounted) return root;
    mounted = true;
    ensureStyle();
    try {
      document.body.classList.add('sn-game-dock-on');
    } catch (_) {}
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Astranov game modes');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'gd-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', ROOT_ID + '-panel');
    toggle.innerHTML =
      '<span class="gd-orb" aria-hidden="true"></span>' +
      '<span class="gd-toggle-txt"><b>PLAY · GAMES</b><span>helper · orbit · cockpit</span></span>';
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    var panel = document.createElement('div');
    panel.id = ROOT_ID + '-panel';
    panel.className = 'gd-panel';
    panel.setAttribute('role', 'menu');
    var head = document.createElement('div');
    head.className = 'gd-head';
    head.textContent = 'Astranov game modes';
    panel.appendChild(head);
    panel.appendChild(
      btn('SW', 'SILVER WINGS', 'SpaceX Bot · patrol', function () {
        void runHelper();
      })
    );
    panel.appendChild(
      btn('EO', 'SPACE SCENE', 'Real-Earth mission levels', function () {
        void runOps();
      })
    );
    panel.appendChild(
      btn('IV', 'INVADERS', 'Cockpit arcade · tilt fire', function () {
        void runInvaders();
      })
    );
    var tip = document.createElement('div');
    tip.className = 'gd-tip';
    tip.textContent = 'CLI: helper · earth ops · invaders · games';
    panel.appendChild(tip);

    root.appendChild(panel);
    root.appendChild(toggle);
    document.body.appendChild(root);

    document.addEventListener(
      'click',
      function (e) {
        if (!open || !root) return;
        if (root.contains(e.target)) return;
        setOpen(false);
        toggle.setAttribute('aria-expanded', 'false');
      },
      true
    );
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        toggle.setAttribute('aria-expanded', 'false');
      }
    });

    log('Game dock · PLAY · helper · earth ops · invaders', 'dim');
    return root;
  }

  function destroy() {
    setOpen(false);
    mounted = false;
    if (root && root.parentNode) {
      try {
        root.parentNode.removeChild(root);
      } catch (_) {}
    }
    root = null;
    try {
      document.body.classList.remove('sn-game-dock-on');
    } catch (_) {}
    var st = document.getElementById(STYLE_ID);
    if (st && st.parentNode) st.parentNode.removeChild(st);
  }

  function init() {
    /* SPECS chrome: no floating multi-docks. Games stay CLI-only.
       Call SNGameDock.mount() only if an explicit product decision restores the dock. */
    destroy();
  }

  global.SNGameDock = {
    init: init,
    mount: mount,
    destroy: destroy,
    open: function () {
      setOpen(true);
    },
    close: function () {
      setOpen(false);
    },
    runHelper: runHelper,
    runOps: runOps,
    runInvaders: runInvaders,
  };

  // Do NOT auto-mount — floating PLAY button overlaps Earth OS chrome (owner report)
  if (typeof document !== 'undefined') {
    setTimeout(function () {
      try {
        destroy();
      } catch (_) {}
    }, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
