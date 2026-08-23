/* Astranov chrome-fix body · Build 20260822161000-hud-law
 * Restore HUD law: 10px handles, no coach dump, 36px circle buttons, no wasted void.
 */
(function (global) {
  'use strict';
  var BUILD = '20260822161000-hud-law';
  var TOP_PH = 'Command the HUD · show, hide, or reshape';
  var BOT_PH = 'Command the HUD · show, hide, or reshape';

  function injectCss() {
    var old = document.getElementById('sn-chrome-fix-css');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var css = document.createElement('style');
    css.id = 'sn-chrome-fix-css';
    css.textContent = [
      ':root { --sn-chrome-w: min(720px, calc(100vw - 24px)); --glow: #1c8cff; --glow-hot: #7ec8ff; --panel: rgba(3,10,32,0.32); --border: rgba(50,160,255,0.62); }',
      '#sn-leftscroll, #sn-rightscroll, .sn-edgescroll,',
      '#sn-left-panel, #sn-right-panel, #sn-left-rail, #sn-right-rail,',
      '#sn-arch-layer, #sn-device-alert, #sn-silver-rive,',
      '#globe-deck, #aci-hud, #news-ticker, #astranov-logo {',
      '  display: none !important; visibility: hidden !important; pointer-events: none !important;',
      '}',
      '#sn-topchrome {',
      '  position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important;',
      '  z-index: 95 !important; display: flex !important; justify-content: center !important;',
      '  padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 0 !important;',
      '  pointer-events: none !important;',
      '}',
      '#sn-topchrome-panel {',
      '  pointer-events: auto !important; width: var(--sn-chrome-w) !important;',
      '  max-width: var(--sn-chrome-w) !important; margin: 0 auto !important;',
      '  background: linear-gradient(180deg, rgba(8,22,64,0.28), rgba(0,6,22,0.36)) !important;',
      '  border: 1px solid rgba(70,170,255,0.58) !important;',
      '  border-radius: 24px !important; overflow: hidden !important;',
      '  backdrop-filter: blur(11px) saturate(1.4) !important;',
      '  box-shadow: 0 0 0 1px rgba(40,120,255,0.22), 0 0 24px rgba(28,140,255,0.28), inset 0 0 28px rgba(12,50,160,0.16) !important;',
      '  min-height: 0 !important; height: auto !important;',
      '}',
      '#stc-compact { max-height: 56px !important; min-height: 52px !important; padding: 4px 10px !important; }',
      '#field-radar { width: 44px !important; height: 44px !important; }',
      '#sn-task-launch { width: 40px !important; height: 40px !important; }',
      '#stc-cmd, #cli-form { padding: 4px 10px 8px !important; margin: 0 !important; }',
      '#dock {',
      '  position: fixed !important; left: 0 !important; right: 0 !important; bottom: 0 !important;',
      '  width: 100% !important; transform: none !important;',
      '  display: flex !important; justify-content: center !important; align-items: flex-end !important;',
      '  padding: 0 12px max(10px, env(safe-area-inset-bottom, 0px)) !important;',
      '  box-sizing: border-box !important; pointer-events: none !important; z-index: 100 !important;',
      '}',
      '#panel {',
      '  pointer-events: auto !important; position: relative !important;',
      '  width: var(--sn-chrome-w) !important; max-width: var(--sn-chrome-w) !important;',
      '  margin: 0 auto !important; box-sizing: border-box !important;',
      '  background: linear-gradient(180deg, rgba(6,18,52,0.30), rgba(0,4,18,0.38)) !important;',
      '  border: 1px solid rgba(70,170,255,0.58) !important;',
      '  border-radius: 22px !important;',
      '  box-shadow: 0 0 0 1px rgba(40,120,255,0.22), 0 0 24px rgba(28,140,255,0.28), inset 0 0 28px rgba(12,50,160,0.16) !important;',
      '  backdrop-filter: blur(11px) saturate(1.4) !important;',
      '  display: grid !important;',
      '  grid-template-rows: 10px 44px auto auto !important;',
      '  overflow: visible !important;',
      '  height: auto !important; min-height: 0 !important; max-height: none !important;',
      '}',
      '#panel.collapsed { grid-template-rows: 10px 44px 0 auto !important; overflow: visible !important; height: auto !important; min-height: 0 !important; }',
      '#cli-drag, #sn-topchrome-drag {',
      '  height: 10px !important; min-height: 10px !important; max-height: 10px !important;',
      '  padding: 0 !important; margin: 0 !important;',
      '  display: flex !important; align-items: center !important; justify-content: center !important;',
      '}',
      '#cli-drag { grid-row: 1 !important; }',
      '#cli-drag::before, #sn-topchrome-drag::before {',
      '  content: "" !important; display: block !important;',
      '  width: 36px !important; height: 3px !important; border-radius: 999px !important;',
      '  background: linear-gradient(90deg, transparent, #1c8cff, #7ec8ff, #1c8cff, transparent) !important;',
      '  box-shadow: 0 0 10px #1c8cff !important;',
      '}',
      '#cli-drag::after, #sn-topchrome-drag::after { content: none !important; display: none !important; }',
      /* coach dump — always gone, guest and signed-in */
      '#cli-coach { display: none !important; height: 0 !important; }',
      '#cli-drag { grid-row: 1 !important; }',
      '#sn-task-ribbon { grid-row: 2 !important; }',
      '#cli-log { grid-row: 3 !important; }',
      '#cli-form { grid-row: 4 !important; min-height: 48px !important; }',
      '#cli-log:empty { display: none !important; height: 0 !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; }',
      '#cli-log:not(:empty) { display: block !important; max-height: 26vh !important; overflow-y: auto !important; padding: 4px 10px 8px !important; }',
      '#sn-task-ribbon {',
      '  display: flex !important; align-items: center !important; justify-content: flex-start !important;',
      '  gap: 6px !important; padding: 4px 8px !important;',
      '  height: 44px !important; min-height: 44px !important; max-height: 44px !important;',
      '  overflow-x: auto !important; overflow-y: hidden !important;',
      '  -webkit-overflow-scrolling: touch !important;',
      '}',
      '#sn-task-ribbon .sn-rib-btn, #sn-task-ribbon button[data-act] {',
      '  flex: 0 0 36px !important; width: 36px !important; height: 36px !important;',
      '  min-width: 36px !important; max-width: 36px !important;',
      '  min-height: 36px !important; max-height: 36px !important;',
      '  padding: 0 !important; margin: 0 !important;',
      '  border-radius: 50% !important; overflow: hidden !important;',
      '  box-sizing: border-box !important;',
      '  display: inline-flex !important; align-items: center !important; justify-content: center !important;',
      '}',
      '#sn-task-ribbon .sn-rib-txt { display: none !important; }',
      '#sn-task-ribbon .sn-rib-tip { display: none !important; }',
      '#sn-task-ribbon .sn-rib-face, #sn-task-ribbon .sn-rib-icon img, #sn-rib-user img, #sn-task-ribbon img {',
      '  width: 28px !important; height: 28px !important; max-width: 28px !important; max-height: 28px !important;',
      '  border-radius: 50% !important; object-fit: cover !important;',
      '}',
      '#cli-in::placeholder, #stc-cmd-in::placeholder { color: #7a8a96 !important; opacity: 0.7 !important; }',
      '.sn-cli-field { background: rgba(0,10,32,0.42) !important; border: 1px solid rgba(80,180,255,0.55) !important; box-shadow: inset 0 0 12px rgba(20,90,220,0.18), 0 0 10px rgba(28,140,255,0.18) !important; }',
      '.sn-rib-btn { border-color: rgba(80,180,255,0.55) !important; background: rgba(0,12,40,0.35) !important; box-shadow: 0 0 8px rgba(28,140,255,0.25) !important; }',
      '.sn-cli-star, #btn-home { color: #7ec8ff !important; text-shadow: 0 0 12px #1c8cff !important; }',
      '#cli-form { min-height: 48px !important; padding: 4px 10px 10px !important; }',
      'body:not(.sn-hud-live) #sn-topchrome, body:not(.sn-hud-live) #dock { opacity: 0 !important; }',
      'body.sn-hud-live #sn-topchrome, body.sn-hud-live #dock { opacity: 1 !important; }',
      '#city-map { position:fixed !important; inset:0 !important; z-index:40 !important; opacity:0 !important; pointer-events:none !important; background:#000 !important; }',
      '#city-map.active { z-index:80 !important; opacity:1 !important; pointer-events:auto !important; }',
      '#city-map .leaflet-container { width:100% !important; height:100% !important; min-height:100% !important; background:#05080f !important; }',
      '#globe.city-hidden { visibility:hidden !important; pointer-events:none !important; }',
      'body.city-map-on #city-map { opacity:1 !important; pointer-events:auto !important; }',
      'body.sn-order-live #globe { visibility:visible !important; pointer-events:auto !important; top:0 !important; height:42% !important; bottom:auto !important; }',
      'body.sn-order-live #globe.city-hidden { visibility:visible !important; pointer-events:auto !important; }',
      'body.sn-order-live #city-map, body.sn-order-live #city-map.active { top:42% !important; inset:auto 0 0 0 !important; height:58% !important; z-index:80 !important; opacity:1 !important; pointer-events:auto !important; }',
      '#sn-order-hud { display:none; position:fixed; left:50%; top:42%; transform:translate(-50%,-110%); z-index:90; pointer-events:none; padding:6px 14px; border-radius:999px; font:700 12px/1.2 Inter,system-ui,sans-serif; letter-spacing:.06em; color:#eaf4ff; background:rgba(2,10,32,0.55); border:1px solid rgba(80,180,255,0.65); box-shadow:0 0 18px rgba(28,140,255,0.35), inset 0 0 12px rgba(20,80,220,0.2); text-shadow:0 0 8px #1c8cff; }',
      'body.sn-order-live #sn-order-hud { display:block; }',
      '#sn-rtc-layer { display:none !important; }',
      'body.sn-rtc-live #sn-rtc-layer { display:block !important; }',
      '.sn-rib-btn.on, .sn-rib-btn[aria-pressed="true"], .sn-rib-btn.mode-on {',
      '  box-shadow: 0 0 14px #1c8cff, 0 0 4px #7ec8ff !important;',
      '  border-color: #7ec8ff !important;',
      '}',
      /* HOME = globe. Street map is a zoom-in, never the first screen. */
      'body:not(.city-map-on):not(.sn-order-live) #city-map,',
      'body:not(.city-map-on):not(.sn-order-live) #city-map.active {',
      '  display: none !important; opacity: 0 !important; pointer-events: none !important; z-index: 0 !important;',
      '}',
      'body:not(.city-map-on) #globe, #globe {',
      '  visibility: visible !important; opacity: 1 !important; pointer-events: auto !important;',
      '}',
      'body:not(.city-map-on) #globe.city-hidden { visibility: visible !important; pointer-events: auto !important; }',
      '.leaflet-control-attribution { display: none !important; }',
      'body.city-map-on .leaflet-control-attribution { display: block !important; }',
      '#sn-topchrome-panel, #sn-topchrome-panel.collapsed {',
      '  height: auto !important; max-height: 128px !important; min-height: 0 !important;',
      '}',
      '#stc-body { min-height: 0 !important; height: auto !important; }',
      '#cli-log:not(:has(.cli-feed-item)), #cli-log:has(#cli-feed-search-hint:only-child) {',
      '  display: none !important; height: 0 !important; min-height: 0 !important; padding: 0 !important;',
      '}',
      '#sn-helper-canvas { z-index: 45 !important; pointer-events: none !important; }',
      'body.sn-phone-os #sn-topchrome { padding-top: calc(36px + env(safe-area-inset-top, 0px)) !important; }',
      'body.sn-phone-os #sn-topchrome-panel, body.sn-phone-os #panel {',
      '  backdrop-filter: blur(14px) saturate(1.5) !important;',
      '  -webkit-backdrop-filter: blur(14px) saturate(1.5) !important;',
      '}',
      '#sn-helper-hit { width: 52px !important; height: 64px !important; z-index: 46 !important; }',
    ].join('\n');
    document.head.appendChild(css);
  }

  function killCoach() {
    try {
      var c = document.getElementById('cli-coach');
      if (c && c.parentNode) c.parentNode.removeChild(c);
      var p = document.getElementById('cli-preview');
      if (p) { p.textContent = ''; p.style.display = 'none'; }
    } catch (_) {}
  }

  function stabilizePanels() {
    try {
      injectCss();
      killCoach();
      var panel = document.getElementById('panel');
      if (panel) {
        panel.style.setProperty('grid-template-rows', '10px 44px auto auto', 'important');
        panel.style.setProperty('overflow', 'visible', 'important');
        panel.style.setProperty('min-height', '0', 'important');
        panel.style.setProperty('height', 'auto', 'important');
      }
      ['sn-topchrome-drag', 'cli-drag'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.setProperty('height', '10px', 'important');
        el.style.setProperty('min-height', '10px', 'important');
        el.style.setProperty('max-height', '10px', 'important');
      });
    } catch (_) {}
  }

  function enforceHudPlaceholder() {
    try {
      var top = document.getElementById('stc-cmd-in');
      var bot = document.getElementById('cli-in');
      if (top) {
        top.placeholder = TOP_PH;
        top.setAttribute('aria-label', TOP_PH);
      }
      if (bot) {
        bot.placeholder = BOT_PH;
        bot.setAttribute('aria-label', BOT_PH);
      }
    } catch (_) {}
  }

  function killInvented() {
    try {
      document.querySelectorAll('#sn-arch-layer, #sn-device-alert, #globe-deck, #aci-hud, #news-ticker, #astranov-logo').forEach(function (el) {
        try { el.remove(); } catch (_) {}
      });
    } catch (_) {}
  }

  function boot() {
    injectCss();
    stabilizePanels();
    killInvented();
    killCoach();
    enforceHudPlaceholder();
    setTimeout(function () {
      killInvented();
      killCoach();
      stabilizePanels();
      enforceHudPlaceholder();
    }, 800);
    setTimeout(function () {
      killCoach();
      stabilizePanels();
      enforceHudPlaceholder();
    }, 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 2000);

  global.SNChromeFix = {
    build: BUILD,
    stabilizePanels: stabilizePanels,
    killInvented: killInvented,
    applyHud: function () { stabilizePanels(); enforceHudPlaceholder(); },
    enforceHudPlaceholder: enforceHudPlaceholder,
  };
})(typeof window !== 'undefined' ? window : globalThis);
