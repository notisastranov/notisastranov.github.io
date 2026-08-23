/* SNHome — ASTRANOV central science hub (top ASTRANOV button)
 * Device roles · RAID fleet · SETI mesh mining · topo routing · system
 * Universal OS: products · services · all activities (not food-only).
 */
(function (global) {
  'use strict';

  var open = false;
  var SUPPORT_KEY = 'sn:support-v1';

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  function currentRole() {
    try {
      if (global.SNResources && SNResources.getDeviceRole) return SNResources.getDeviceRole();
    } catch (_) {}
    try {
      return localStorage.getItem('sn:device-role-v1') || 'main';
    } catch (_) {
      return 'main';
    }
  }

  function roleCard(id, title, body, active) {
    return (
      '<button type="button" class="sn-home-role' +
      (active ? ' on' : '') +
      '" data-role-pick="' +
      esc(id) +
      '" aria-pressed="' +
      (active ? 'true' : 'false') +
      '">' +
      '<span class="sn-home-role-t">' +
      esc(title) +
      (active ? ' · ACTIVE' : '') +
      '</span>' +
      '<span class="sn-home-role-d">' +
      esc(body) +
      '</span>' +
      '</button>'
    );
  }

  function fleetHtml() {
    var fleet = null;
    try {
      fleet = global.SNResources && SNResources.fleet && SNResources.fleet();
    } catch (_) {}
    if (!fleet || !fleet.devices || !fleet.devices.length) {
      return (
        '<p class="sn-home-hint">No fleet yet · pick a role below to register this device. Open the same Astranov on other machines and assign Main / Hot-swap / RAID.</p>'
      );
    }
    var rows = fleet.devices
      .slice()
      .sort(function (a, b) {
        return (b.t || 0) - (a.t || 0);
      })
      .map(function (d) {
        var age = d.t ? Math.round((Date.now() - d.t) / 60000) : '?';
        var roleLab =
          d.role === 'raid' ? 'RAID' : d.role === 'secondary' ? 'HOT-SWAP' : 'MAIN';
        return (
          '<div class="sn-home-fleet-row">' +
          '<span class="sn-home-fleet-role ' +
          esc(d.role || 'main') +
          '">' +
          roleLab +
          '</span>' +
          '<span class="sn-home-fleet-name">' +
          esc(d.name || d.id) +
          '</span>' +
          '<span class="sn-home-fleet-meta">' +
          (d.mining ? 'MINING' : 'idle') +
          (d.rate ? ' · ' + Number(d.rate).toFixed(3) + ' S/h' : '') +
          ' · ' +
          age +
          'm ago</span></div>'
        );
      })
      .join('');
    return (
      '<div class="sn-home-fleet-sum">' +
      esc(fleet.line) +
      '</div>' +
      rows +
      '<p class="sn-home-hint">RAID nodes stay home on always-on boxes. Main = your phone/PC. Hot-swap = spare ready when main dies.</p>'
    );
  }

  function build() {
    var meta = document.querySelector('meta[name="astranov-build"]');
    var ver = (meta && meta.content) || 'dev';
    var role = currentRole();
    var rep = null;
    try {
      rep = global.SNResources && SNResources.report && SNResources.report();
    } catch (_) {}
    var statusLine = (rep && rep.line) || 'Resources offline until shell mine is ready';
    var rates = (rep && rep.rates) || {};
    var cond = null;
    try {
      cond = global.SNResources && SNResources.routeConditions && SNResources.routeConditions();
    } catch (_) {}
    var condLine = cond
      ? 'Traffic load +' +
        Math.round((cond.traffic || 0) * 100) +
        '% · weather +' +
        Math.round((cond.weather || 0) * 100) +
        '% · ETA mult ×' +
        Number(cond.mult || 1).toFixed(2)
      : 'Street routing · OSRM multi-stop · traffic/weather aware';

    return (
      '<div class="sn-home-card" role="dialog" aria-label="ASTRANOV science hub">' +
      '<div class="sn-home-head">' +
      '<b>ASTRANOV · SCIENCE HUB</b>' +
      '<button type="button" class="sn-home-x" id="sn-home-close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="sn-home-body">' +
      '<div class="sn-home-section sn-home-recovery-title">Stuck? · recover now</div>' +
      '<p class="sn-home-hint">Use these first if the app covers the browser and you cannot refresh.</p>' +
      '<button type="button" class="sn-home-btn sn-home-btn-primary" data-act="hard-reload">① Hard reload · clear cache · restart</button>' +
      '<button type="button" class="sn-home-btn" data-act="clear-cache">② Clear cache only · keep data · reload</button>' +
      '<button type="button" class="sn-home-btn danger" data-act="hard-reset">③ Hard reset · wipe local data · reload</button>' +
      '<p class="sn-home-mission">Universal mesh OS · products · services · activities · topo routing · SETI mining. Destined beyond single apps.</p>' +
      '<div class="sn-home-row sn-home-meta">' +
      '<span>Build</span><code id="sn-home-ver">' +
      esc(ver) +
      '</code></div>' +
      '<div class="sn-home-status">' +
      '<div class="sn-home-status-line">' +
      esc(statusLine) +
      '</div>' +
      '<div class="sn-home-status-sub">CPU ' +
      esc(rates.cpu != null ? rates.cpu : '—') +
      '% · RAM units ' +
      esc(rates.ram != null ? rates.ram : '—') +
      ' · BW ' +
      esc(rates.bandwidth != null ? rates.bandwidth : '—') +
      ' · ops ' +
      esc(rep && rep.workerOps != null ? rep.workerOps : '0') +
      '</div>' +
      '<div class="sn-home-status-sub">Session mined ' +
      esc(
        rep && rep.sessionMined != null
          ? Number(rep.sessionMined).toFixed(4) + ' S'
          : '0 S'
      ) +
      ' · peers ~' +
      esc(rep && rep.meshPeers != null ? rep.meshPeers : 1) +
      '</div></div>' +
      '<div class="sn-home-section">Device roles · this machine</div>' +
      '<p class="sn-home-hint">Assign how THIS hardware serves the mesh. Open Astranov on each device and pick its role.</p>' +
      roleCard(
        'main',
        'Main device · PRIMARY',
        'Daily phone or PC. Conservative spare CPU/RAM/BW harvest. Keeps UI smooth. You carry this one.',
        role === 'main'
      ) +
      roleCard(
        'secondary',
        'Hot-swap · SECONDARY',
        'Spare / monitor unit. Low harvest to protect battery. Ready to become Main when you swap.',
        role === 'secondary'
      ) +
      roleCard(
        'raid',
        'RAID array · HOME MINER',
        'Always-on cheap box at home. Aggressive harvest under TJ max ~92%. Part of your RAID fleet that funds the mesh in S.',
        role === 'raid'
      ) +
      '<div class="sn-home-section">Your device fleet</div>' +
      fleetHtml() +
      '<div class="sn-home-name-row">' +
      '<input id="sn-home-devname" class="sn-home-input" maxlength="40" placeholder="Name this device (e.g. Living-room RAID)" />' +
      '<button type="button" class="sn-home-btn sn-home-btn-sm" data-act="name-device">Save name</button>' +
      '</div>' +
      '<div class="sn-home-section">SETI mesh · mine in S</div>' +
      '<p class="sn-home-hint">Spare CPU (Web Worker) · RAM · storage · bandwidth when idle — SETI-style donation. Rewards in S. Users power users.</p>' +
      '<button type="button" class="sn-home-btn" data-act="mine-on">Mine on · accept terms if needed</button>' +
      '<button type="button" class="sn-home-btn" data-act="mine-off">Mine off</button>' +
      '<button type="button" class="sn-home-btn" data-act="resources">Refresh mesh status</button>' +
      '<button type="button" class="sn-home-btn" data-act="finance">Open S finance panel</button>' +
      '<div class="sn-home-section">Topo routing engine</div>' +
      '<div class="sn-home-status">' +
      '<div class="sn-home-status-line">Polygon · multi-stop OSRM streets</div>' +
      '<div class="sn-home-status-sub">' +
      esc(condLine) +
      '</div>' +
      '<div class="sn-home-status-sub">Combines tasks · traffic hour curve · weather hints · channel jobs</div></div>' +
      '<button type="button" class="sn-home-btn" data-act="routes">Refresh live routes on radar</button>' +
      '<div class="sn-home-section">AI supreme graphics</div>' +
      '<p class="sn-home-hint">Not past-era polygon AAA. Prompt-seeded generative canvas fields · neural HUD · cached sprites. Game-class look · phone cost.</p>' +
      '<div class="sn-home-status">' +
      '<div class="sn-home-status-line">' +
      esc(
        (function () {
          try {
            var r =
              (global.SNAIGraphics && SNAIGraphics.report && SNAIGraphics.report()) ||
              (global.AIGraphics && AIGraphics.report && AIGraphics.report());
            return (r && r.line) || 'AI Graphics loading…';
          } catch (_) {
            return 'AI Graphics offline';
          }
        })()
      ) +
      '</div></div>' +
      roleCard(
        'gfx-supreme',
        'Supreme AI graphics',
        'Full generative HUD + neural fields + high detail synthesis. Still zero mesh asset farms.',
        (function () {
          try {
            return (global.SNAIGraphics || global.AIGraphics)?.getMode?.() === 'supreme';
          } catch (_) {
            return true;
          }
        })()
      ) +
      roleCard(
        'gfx-balanced',
        'Balanced graphics',
        'Strong generative quality for mid phones.',
        (function () {
          try {
            return (global.SNAIGraphics || global.AIGraphics)?.getMode?.() === 'balanced';
          } catch (_) {
            return false;
          }
        })()
      ) +
      roleCard(
        'gfx-lite',
        'Lite graphics',
        'Minimal overlays · battery first · still generative (not 3D downgrade).',
        (function () {
          try {
            return (global.SNAIGraphics || global.AIGraphics)?.getMode?.() === 'lite';
          } catch (_) {
            return false;
          }
        })()
      ) +
      '<button type="button" class="sn-home-btn" data-act="gfx-pulse">Think pulse demo</button>' +
      '<button type="button" class="sn-home-btn" data-act="global">Back to GLOBAL Earth</button>' +
      '<div class="sn-home-section">Danger</div>' +
      '<button type="button" class="sn-home-btn danger" data-act="hard-reset">Hard reset this device (same as ③ above)</button>' +
      '<p class="sn-home-hint">Login = ribbon User. Map tools = Add / Layers. Channels = type channels. Recovery = top of this menu.</p>' +
      '</div></div>'
    );
  }

  function ensureCss() {
    if ($('sn-home-css')) return;
    var st = document.createElement('style');
    st.id = 'sn-home-css';
    st.textContent =
      '#sn-home-menu{position:fixed;inset:0;z-index:2147483000;display:none;align-items:flex-start;justify-content:center;' +
      'padding:max(12px,env(safe-area-inset-top)) 12px 24px;background:rgba(0,4,12,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);pointer-events:auto}' +
      '#sn-home-menu.open{display:flex}' +
      '#sn-home-menu .sn-home-card{width:min(420px,100%);max-height:min(86vh,780px);overflow:auto;border-radius:16px;' +
      'background:linear-gradient(165deg,rgba(4,18,40,.98),rgba(1,6,16,.99));border:1px solid rgba(255,255,255,.45);' +
      'box-shadow:0 16px 48px rgba(0,0,0,.75),0 0 40px rgba(11,111,212,.28);color:#e0f0ff}' +
      '#sn-home-menu .sn-home-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;' +
      'border-bottom:1px solid rgba(26,111,212,.35);font:700 11px Orbitron,ui-monospace,monospace;letter-spacing:.14em;color:#ffffff;' +
      'text-shadow:0 0 14px rgba(255,255,255,.55)}' +
      '#sn-home-menu .sn-home-x{border:0;background:transparent;color:#7a9ab8;font-size:22px;cursor:pointer;line-height:1}' +
      '#sn-home-menu .sn-home-body{padding:10px 14px 20px}' +
      '#sn-home-menu .sn-home-mission{font:500 12px/1.45 Rajdhani,system-ui,sans-serif;color:#8ab4d0;margin:0 0 12px}' +
      '#sn-home-menu .sn-home-row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;font:12px JetBrains Mono,ui-monospace,monospace}' +
      '#sn-home-menu .sn-home-row span{color:#5a7a9a}' +
      '#sn-home-menu .sn-home-row code{color:#9ec8ff;text-align:right;font-size:10px}' +
      '#sn-home-menu .sn-home-status{margin:8px 0 12px;padding:12px;border-radius:12px;background:rgba(0,16,36,.85);border:1px solid rgba(61,184,255,.32);' +
      'box-shadow:inset 0 0 20px rgba(11,111,212,.08)}' +
      '#sn-home-menu .sn-home-status-line{font:600 12px/1.4 JetBrains Mono,ui-monospace,monospace;color:#e0f0ff}' +
      '#sn-home-menu .sn-home-status-sub{font:11px JetBrains Mono,ui-monospace,monospace;color:#7a9ab8;margin-top:4px}' +
      '#sn-home-menu .sn-home-section{margin:16px 0 8px;font:700 10px Orbitron,ui-monospace,monospace;letter-spacing:.14em;color:#ffffff;text-transform:uppercase}' +
      '#sn-home-menu .sn-home-role{display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;margin:0 0 8px;padding:12px 14px;' +
      'border-radius:12px;cursor:pointer;text-align:left;border:1px solid rgba(26,111,212,.32);' +
      'background:linear-gradient(165deg,rgba(8,28,56,.75),rgba(2,10,24,.9));color:#e0f0ff;transition:border-color .15s,box-shadow .15s}' +
      '#sn-home-menu .sn-home-role:hover{border-color:rgba(255,255,255,.55);box-shadow:0 0 16px rgba(26,111,212,.25)}' +
      '#sn-home-menu .sn-home-role.on{border-color:#ffffff;background:linear-gradient(165deg,rgba(20,70,130,.45),rgba(6,24,52,.92));box-shadow:0 0 22px rgba(61,184,255,.35)}' +
      '#sn-home-menu .sn-home-role-t{font:700 13px Rajdhani,system-ui;color:#e8f4ff;letter-spacing:.04em}' +
      '#sn-home-menu .sn-home-role-d{font:500 12px/1.4 Rajdhani,system-ui;color:#7a9ab8}' +
      '#sn-home-menu .sn-home-fleet-sum{font:600 11px JetBrains Mono,monospace;color:#ffffff;margin:0 0 8px}' +
      '#sn-home-menu .sn-home-fleet-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid rgba(26,111,212,.18)}' +
      '#sn-home-menu .sn-home-fleet-role{font:700 9px Orbitron,monospace;letter-spacing:.08em;padding:3px 7px;border-radius:6px;border:1px solid rgba(61,184,255,.4);color:#ffffff}' +
      '#sn-home-menu .sn-home-fleet-role.raid{border-color:rgba(0,232,160,.45);color:#00e8a0}' +
      '#sn-home-menu .sn-home-fleet-role.secondary{border-color:rgba(255,200,87,.4);color:#ffc857}' +
      '#sn-home-menu .sn-home-fleet-name{font:600 12px Rajdhani,system-ui;color:#e8f4ff;flex:1;min-width:80px}' +
      '#sn-home-menu .sn-home-fleet-meta{font:10px JetBrains Mono,monospace;color:#6a8aaa;width:100%}' +
      '#sn-home-menu .sn-home-name-row{display:flex;gap:6px;margin:8px 0 4px}' +
      '#sn-home-menu .sn-home-input{flex:1;min-width:0;padding:10px 12px;border-radius:10px;border:1px solid rgba(61,184,255,.3);' +
      'background:rgba(0,12,28,.9);color:#e0f0ff;font:600 12px Rajdhani,system-ui}' +
      '#sn-home-menu .sn-home-btn{display:block;width:100%;margin:6px 0;padding:11px 12px;border-radius:10px;' +
      'border:1px solid rgba(26,111,212,.4);background:rgba(0,16,36,.9);color:#e0f0ff;font:600 13px Rajdhani,system-ui;cursor:pointer;text-align:left;letter-spacing:.03em}' +
      '#sn-home-menu .sn-home-btn:hover{border-color:#ffffff;box-shadow:0 0 14px rgba(26,111,212,.28)}' +
      '#sn-home-menu .sn-home-btn-sm{width:auto;flex-shrink:0;margin:0;padding:10px 12px}' +
      '#sn-home-menu .sn-home-btn.danger{border-color:rgba(255,107,122,.4);color:#ff9aa5;background:rgba(80,20,28,.25)}' +
      '#sn-home-menu .sn-home-hint{font:500 11px/1.45 Rajdhani,system-ui;color:#5a7a9a;margin:8px 0 10px}';
    document.head.appendChild(st);
  }

  function ensure() {
    ensureCss();
    var el = $('sn-home-menu');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'sn-home-menu';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el) close();
    });
    return el;
  }

  function bind(el) {
    var x = $('sn-home-close');
    if (x)
      x.onclick = function (e) {
        e.stopPropagation();
        close();
      };
    el.querySelectorAll('[data-role-pick]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-role-pick');
        // Graphics modes use same card UI
        if (id && id.indexOf('gfx-') === 0) {
          var mode = id.replace('gfx-', '');
          try {
            if (global.SNAIGraphics && SNAIGraphics.setMode) SNAIGraphics.setMode(mode);
            else if (global.AIGraphics && AIGraphics.setMode) AIGraphics.setMode(mode);
          } catch (_) {}
          paint();
          return;
        }
        try {
          if (global.SNResources && SNResources.setDeviceRole) {
            if (!global.SNResources.checkTerms || !global.SNResources.checkTerms()) {
              if (global.SNField && SNField.showTerms) SNField.showTerms();
            }
            global.SNResources.setDeviceRole(id);
            if (global.SNResources.setMining) global.SNResources.setMining(true);
            if (global.SNResources.setDonate) global.SNResources.setDonate(true);
            if (global.SNResources.touchFleet) global.SNResources.touchFleet();
          }
          if (global.SNCli && SNCli.log) {
            SNCli.log(
              'Device role · ' +
                id +
                (id === 'raid' ? ' · home RAID miner under TJ max' : id === 'secondary' ? ' · hot-swap' : ' · primary'),
              'ok'
            );
          }
        } catch (err) {
          console.error('[SNHome] role', err);
        }
        paint();
      };
    });
    el.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        void act(btn.getAttribute('data-act'));
      };
    });
  }

  function paint() {
    try {
      paintHub();
    } catch (_) {}
    // Full-screen menu kept for legacy ensure() but not opened
    var el = $('sn-home-menu');
    if (el && el.classList.contains('open')) {
      el.innerHTML = build();
      bind(el);
    }
  }

  function openMenu() {
    var el = ensure();
    el.innerHTML = build();
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    open = true;
    bind(el);
  }

  function close() {
    open = false;
    var el = $('sn-home-menu');
    if (el) {
      el.classList.remove('open');
      el.setAttribute('aria-hidden', 'true');
    }
    closeRecovery();
  }

  function toggle() {
    if (open) close();
    else openMenu();
  }

  function openRecovery() {
    var el = $('sn-recover');
    if (!el) return;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    open = true;
  }

  function closeRecovery() {
    var el = $('sn-recover');
    if (el) {
      el.classList.remove('open');
      el.setAttribute('aria-hidden', 'true');
    }
    open = false;
  }

  /** Science hub body for TOP SCROLL expand (not full-screen menu) */
  function paintHub() {
    var host = $('sn-hub-host');
    if (!host) return;
    try {
      if (global.SNResources && SNResources.touchFleet) SNResources.touchFleet();
    } catch (_) {}
    var html = build();
    // Prefer body content
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var body = tmp.querySelector('.sn-home-body');
    host.innerHTML =
      '<div class="sn-home-head"><b>SCIENCE · ROLES · RAID · MINE</b></div>' +
      (body ? body.innerHTML : html);
    // Remove stuck recovery block copy (name button owns recovery)
    var recTitle = null;
    host.querySelectorAll('.sn-home-section, .sn-home-recovery-title, .sn-home-hint').forEach(function (n) {
      if (/Stuck|recover/i.test(n.textContent || '')) {
        var p = n;
        // remove following recovery buttons
      }
    });
    bind(host);
  }

  function bindRecovery() {
    var el = $('sn-recover');
    if (!el || el._bound) return;
    el._bound = true;
    var x = $('sn-rec-close');
    if (x) x.onclick = function (e) {
      e.preventDefault();
      closeRecovery();
    };
    el.addEventListener('click', function (e) {
      if (e.target === el) closeRecovery();
    });
    el.querySelectorAll('[data-rec]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var a = btn.getAttribute('data-rec');
        if (a === 'hard-reload') hardReload();
        else if (a === 'clear-cache') clearCacheReload();
        else if (a === 'hard-reset') hardReset();
      };
    });
  }

  function clearAppCaches() {
    var n = 0;
    try {
      if (global.caches && caches.keys) {
        return caches.keys().then(function (names) {
          return Promise.all(
            names.map(function (name) {
              n++;
              return caches.delete(name);
            })
          ).then(function () {
            return n;
          });
        });
      }
    } catch (_) {}
    return Promise.resolve(0);
  }

  function unregisterServiceWorkers() {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        return navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(
            regs.map(function (r) {
              return r.unregister();
            })
          );
        });
      }
    } catch (_) {}
    return Promise.resolve();
  }

  /** Hard reload: bust SW + HTTP cache, keep localStorage (wallet/profile). */
  function hardReload() {
    try {
      if (global.SNCli && SNCli.log) SNCli.log('Hard reload · clearing cache…', 'dim');
    } catch (_) {}
    try {
      if (global.SNMoney && SNMoney.clearBlockers) SNMoney.clearBlockers();
      if (global.SNUi && SNUi.dismissCoach) SNUi.dismissCoach();
    } catch (_) {}
    try {
      document.body.style.opacity = '0.55';
      document.body.style.pointerEvents = 'none';
    } catch (_) {}
    var done = false;
    function go() {
      if (done) return;
      done = true;
      try { sessionStorage.clear(); } catch (_) {}
      try {
        try { delete window.__snBootDone; delete window.__snBooting; } catch (_) {}
        var u = new URL(location.href);
        u.searchParams.delete('_sn_reload');
        u.searchParams.delete('v');
        u.searchParams.set('_sn_reload', String(Date.now()));
        u.searchParams.set('v', String(Date.now()));
        location.replace(u.toString());
      } catch (_) {
        try { location.reload(); } catch (_) {}
      }
    }
    try { unregisterServiceWorkers(); } catch (_) {}
    try { clearAppCaches(); } catch (_) {}
    setTimeout(go, 120);
    setTimeout(go, 350);
    setTimeout(go, 700);
  }

  /** Clear Cache API + SW only, keep all local data, then hard reload. */
  function clearCacheReload() {
    try {
      if (global.SNCli && SNCli.log) SNCli.log('Clear cache · reloading…', 'dim');
    } catch (_) {}
    Promise.resolve()
      .then(function () {
        return unregisterServiceWorkers();
      })
      .then(function () {
        return clearAppCaches();
      })
      .catch(function () {})
      .then(function () {
        var u = new URL(location.href);
        u.searchParams.set('_sn_reload', String(Date.now()));
        location.replace(u.toString());
      });
  }

  function hardReset() {
    var ok = global.confirm(
      'Hard reset Astranov on this device?\n\nClears local profiles, cart, places, usage, device role, fleet slot, and chat position.\nDoes not sign you out of Google unless you sign out separately.'
    );
    if (!ok) return;
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf('sn:') === 0 || k.indexOf('astranov') === 0 || k.indexOf('spacenet') === 0))
          keys.push(k);
      }
      keys.forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (_) {}
    try {
      sessionStorage.clear();
    } catch (_) {}
    Promise.resolve()
      .then(function () {
        return unregisterServiceWorkers();
      })
      .then(function () {
        return clearAppCaches();
      })
      .catch(function () {})
      .then(function () {
        var u = new URL(location.href);
        u.searchParams.set('_sn_reload', String(Date.now()));
        location.replace(u.toString());
      });
  }

  async function act(name) {
    if (name === 'mine-on') {
      try {
        if (global.SNResources && SNResources.setMining) {
          if (!global.SNResources.checkTerms || !global.SNResources.checkTerms()) {
            if (global.SNField && SNField.showTerms) SNField.showTerms();
          }
          global.SNResources.setMining(true);
          if (global.SNResources.setDonate) global.SNResources.setDonate(true);
        }
      } catch (_) {}
      paint();
      return;
    }
    if (name === 'mine-off') {
      try {
        if (global.SNResources && SNResources.setMining) global.SNResources.setMining(false);
      } catch (_) {}
      paint();
      return;
    }
    if (name === 'resources') {
      try {
        if (global.SNResources && SNResources.touchFleet) SNResources.touchFleet();
        if (global.SNCli && SNCli.run) await SNCli.run('resources');
      } catch (_) {}
      paint();
      return;
    }
    if (name === 'finance') {
      try {
        if (global.SNField && SNField.openFinance) SNField.openFinance('mining');
      } catch (_) {}
      close();
      return;
    }
    if (name === 'routes') {
      try {
        if (global.SNField && SNField.refreshRoutes) await SNField.refreshRoutes(true);
        if (global.SNField && SNField.setRadarExpanded) SNField.setRadarExpanded(true);
        if (global.SNCli && SNCli.log) SNCli.log('Routes refreshed · radar expanded', 'ok');
      } catch (_) {}
      return;
    }
    if (name === 'global') {
      try {
        if (global.SNGlobe && SNGlobe.goToTier) SNGlobe.goToTier('global');
        else if (global.SNCli && SNCli.run) await SNCli.run('global');
      } catch (_) {}
      close();
      return;
    }
    if (name === 'gfx-pulse') {
      try {
        var G = global.SNAIGraphics || global.AIGraphics;
        if (G) {
          if (G.init) G.init();
          if (G.showNeural) G.showNeural(true);
          if (G.setThinkPulse) G.setThinkPulse(true);
          if (G.spawnEffect) G.spawnEffect(0, 0, 0x4cc9ff, 28, 50);
          setTimeout(function () {
            if (G.setThinkPulse) G.setThinkPulse(false);
          }, 2200);
          if (global.SNCli && SNCli.log) SNCli.log('AI Graphics · think pulse', 'ok');
        }
      } catch (_) {}
      return;
    }
    if (name === 'name-device') {
      var inp = $('sn-home-devname');
      var label = inp && inp.value ? inp.value.trim() : '';
      if (!label) {
        if (global.SNCli && SNCli.log) SNCli.log('Type a device name first', 'dim');
        return;
      }
      try {
        if (global.SNResources && SNResources.registerName) SNResources.registerName(label);
        if (global.SNCli && SNCli.log) SNCli.log('Device named · ' + label, 'ok');
      } catch (_) {}
      paint();
      return;
    }
    if (name === 'hard-reload') {
      hardReload();
      return;
    }
    if (name === 'clear-cache') {
      clearCacheReload();
      return;
    }
    if (name === 'hard-reset') {
      hardReset();
      return;
    }
  }

  function supportList() {
    try {
      var raw = JSON.parse(localStorage.getItem(SUPPORT_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  function supportSave(list) {
    try {
      localStorage.setItem(SUPPORT_KEY, JSON.stringify(list.slice(-40)));
    } catch (_) {}
  }

  function supportRequest(text) {
    var me = global.SNProfiles && SNProfiles.me && SNProfiles.me();
    var row = {
      id: 'sup_' + Date.now().toString(36),
      text: String(text || '').slice(0, 280),
      from: (me && me.name) || 'User',
      fromId: (me && me.id) || null,
      t: Date.now(),
      status: 'open',
    };
    var list = supportList();
    list.unshift(row);
    supportSave(list);
    return row;
  }

  function supportClaim(id) {
    var me = global.SNProfiles && SNProfiles.me && SNProfiles.me();
    if (!me || !me.roles || !me.roles.ambassador) {
      return { ok: false, error: 'Enable Ambassador on profile tile' };
    }
    var list = supportList();
    var row = list.find(function (r) {
      return r.id === id || (!id && r.status === 'open');
    });
    if (!row) return { ok: false, error: 'no open support request' };
    row.status = 'helped';
    row.helperId = me.id;
    row.helper = me.name;
    row.helpedAt = Date.now();
    supportSave(list);
    var reward = 0.5;
    try {
      if (global.SNCurrency && SNCurrency.creditMined) SNCurrency.creditMined(reward);
      else if (global.SNCurrency && SNCurrency.credit) SNCurrency.credit(reward, 'ambassador support');
    } catch (_) {}
    return { ok: true, row: row, reward: reward };
  }

  function init() {
    if (init._done) return;
    init._done = true;
    bindRecovery();
    function bindHard(el) {
      if (!el) return;
      el._snHardBound = true;
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.style.zIndex = '5000';
      // Brand law: neon deep electric blue · soft pill
      try {
        el.style.setProperty('color', '#3d9eff', 'important');
        el.style.setProperty('-webkit-text-fill-color', '#3d9eff', 'important');
        el.style.setProperty('border-radius', '999px', 'important');
        el.style.setProperty(
          'text-shadow',
          '0 0 6px rgba(40,140,255,1),0 0 16px rgba(20,110,255,.95),0 0 32px rgba(10,80,255,.75),0 0 56px rgba(8,50,220,.45)',
          'important'
        );
      } catch (_) {}
      el.title = 'ASTRANOV · tap = device roles · harvest · hard reload inside';
      el.setAttribute('aria-label', 'ASTRANOV home');
      if (el.textContent && /SpaceNet/i.test(el.textContent)) el.textContent = 'ASTRANOV';
      function fire(e) {
        if (e) {
          try {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
          } catch (_) {}
        }
        toggle();
        return false;
      }
      el.addEventListener('pointerdown', fire, true);
      el.addEventListener('click', fire, true);
      el.onclick = fire;
      el.onpointerdown = fire;
    }
    function bindAll() {
      bindHard(document.getElementById('btn-home'));
      bindHard(document.getElementById('astranov-logo'));
      try {
        document.querySelectorAll('[data-home="astranov"], .sn-astranov-home, #stc-brand').forEach(bindHard);
      } catch (_) {}
    }
    bindAll();
    [300, 900, 2000, 4500].forEach(function (ms) {
      setTimeout(bindAll, ms);
    });
    try {
      paintHub();
    } catch (_) {}
  }

  global.SNHome = {
    init: init,
    open: openMenu,
    close: close,
    toggle: toggle,
    paint: paint,
    paintHub: paintHub,
    openRecovery: openRecovery,
    closeRecovery: closeRecovery,
    hardReload: hardReload,
    clearCacheReload: clearCacheReload,
    hardReset: hardReset,
    supportRequest: supportRequest,
    supportList: supportList,
    supportClaim: supportClaim,
    get openState() {
      return open;
    },
  };
})(window);
