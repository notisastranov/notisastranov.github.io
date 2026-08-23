/* Astranov chrome-fix loader · 20260823203000-keeppulse
 * Loads chrome-fix-body. Placeholders: owner law. Never restore coach dump.
 * Loads chrome-earth-levels: national/city/ocean stay on the 3D globe.
 */
(function (global) {
  'use strict';
  var BUILD = '20260823203000-keeppulse';
  var TOP_PH = 'Command the HUD · show, hide, or reshape';
  var BOT_PH = 'Command the HUD · show, hide, or reshape';
  function enforceHud() {
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
      var coach = document.getElementById('cli-coach');
      if (coach && coach.parentNode) coach.parentNode.removeChild(coach);
      var preview = document.getElementById('cli-preview');
      if (preview) {
        preview.textContent = '';
        preview.style.display = 'none';
      }
      var log = document.getElementById('cli-log');
      if (log) {
        if (/SPACEX BOT|owner note|AI art missing|USAGE SHIP|ASTRANOV LAW|type what|Talk ·|Locate ·/i.test(log.textContent || '')) {
          var bad = log.querySelectorAll('.sn-log-line, .cli-feed-item, div, span');
          for (var i = 0; i < bad.length; i++) {
            if (/SPACEX BOT|AI art missing|owner note|USAGE SHIP|ASTRANOV LAW|type what|Talk ·|Locate ·/i.test(bad[i].textContent || '')) {
              try { bad[i].remove(); } catch (_) {}
            }
          }
        }
        if (!String(log.textContent || '').trim()) {
          log.innerHTML = '';
          log.style.setProperty('display', 'none', 'important');
          log.style.setProperty('height', '0', 'important');
          log.style.setProperty('min-height', '0', 'important');
          log.style.setProperty('padding', '0', 'important');
        }
      }
      var panel = document.getElementById('panel');
      if (panel && log && !String(log.textContent || '').trim()) {
        panel.style.setProperty('grid-template-rows', '10px 44px 0 auto', 'important');
      }
    } catch (_) {}
  }
  function load(src, cb) {
    if (document.querySelector('script[data-sn-chrome-fix-body]')) {
      if (cb) cb();
      return;
    }
    var s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.setAttribute('data-sn-chrome-fix-body', '1');
    s.onload = function () { if (cb) cb(); };
    s.onerror = function () {
      enforceHud();
      if (cb) cb();
    };
    document.head.appendChild(s);
  }
  function loadFace() {
    if (document.querySelector('script[data-sn-rib-face]')) return;
    var s = document.createElement('script');
    s.src = '/js/spacenet/chrome-rib-face.js?v=' + BUILD;
    s.setAttribute('data-sn-rib-face', '1');
    document.head.appendChild(s);
  }
  function loadOps() {
    if (document.querySelector('script[data-sn-p0-ops]')) return;
    var s = document.createElement('script');
    s.src = '/js/spacenet/chrome-p0-ops.js?v=' + BUILD;
    s.setAttribute('data-sn-p0-ops', '1');
    document.head.appendChild(s);
  }
  function loadEarth() {
    if (document.querySelector('script[data-sn-earth-levels]')) return;
    var s = document.createElement('script');
    s.src = '/js/spacenet/chrome-earth-levels.js?v=' + BUILD;
    s.setAttribute('data-sn-earth-levels', '1');
    document.head.appendChild(s);
  }
  function loadProjects() {
    if (document.querySelector('script[data-sn-projects]')) return;
    var s = document.createElement('script');
    s.src = '/js/spacenet/chrome-projects.js?v=' + BUILD;
    s.setAttribute('data-sn-projects', '1');
    document.head.appendChild(s);
  }
  function loadFinance() {
    if (document.querySelector('script[data-sn-finance]')) return;
    var s = document.createElement('script');
    s.src = '/js/spacenet/chrome-finance.js?v=' + BUILD;
    s.setAttribute('data-sn-finance', '1');
    document.head.appendChild(s);
  }
  function loadPresence() {
    if (document.querySelector('script[data-sn-presence]')) return;
    var s = document.createElement('script');
    s.src = '/js/spacenet/chrome-presence.js?v=' + BUILD;
    s.setAttribute('data-sn-presence', '1');
    document.head.appendChild(s);
  }
  function loadExchange() {
    if (document.querySelector('script[data-sn-exchange]')) return;
    var s = document.createElement('script');
    s.src = '/js/spacenet/chrome-exchange.js?v=' + BUILD;
    s.setAttribute('data-sn-exchange', '1');
    document.head.appendChild(s);
  }
  function loadMindFacts() {
    if (document.querySelector('script[data-sn-mind-facts]')) return;
    var s = document.createElement('script');
    s.src = '/js/spacenet/chrome-mind-facts.js?v=' + BUILD;
    s.setAttribute('data-sn-mind-facts', '1');
    document.head.appendChild(s);
  }
  function earthHome() {
    try {
      if (document.body.classList.contains('sn-order-live')) return;
      if (document.body.classList.contains('sn-streets-on')) return;
      var globe = document.getElementById('globe');
      if (globe) {
        globe.classList.remove('city-hidden');
        globe.style.visibility = 'visible';
        globe.style.opacity = '1';
      }
      var top = document.getElementById('sn-topchrome-panel');
      if (top && !top.classList.contains('expanded')) {
        top.style.setProperty('max-height', '128px', 'important');
        top.style.setProperty('height', 'auto', 'important');
      }
      var panel = document.getElementById('panel');
      if (panel && panel.classList.contains('collapsed')) {
        panel.style.setProperty('height', 'auto', 'important');
        panel.style.setProperty('min-height', '0', 'important');
      }
    } catch (_) {}
  }
  function afterGood() {
    loadFace();
    loadOps();
    loadEarth();
    loadProjects();
    loadFinance();
    loadPresence();
    loadExchange();
    loadMindFacts();
    enforceHud();
    earthHome();
  }
  load('/js/spacenet/chrome-fix-body.js?v=' + BUILD, afterGood);
  setTimeout(afterGood, 1200);
  setTimeout(loadOps, 2500);
  setTimeout(loadEarth, 400);
  setTimeout(loadProjects, 500);
  setTimeout(loadFinance, 600);
  setTimeout(loadPresence, 650);
  setTimeout(loadExchange, 700);
  setTimeout(loadMindFacts, 750);
  setTimeout(earthHome, 1800);
  setTimeout(earthHome, 4000);
  setInterval(enforceHud, 3500);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      enforceHud();
      earthHome();
      loadEarth();
    loadProjects();
    loadFinance();
    loadPresence();
    loadExchange();
    loadMindFacts();
    });
  } else {
    enforceHud();
    earthHome();
    loadEarth();
    loadProjects();
    loadFinance();
    loadPresence();
    loadExchange();
    loadMindFacts();
  }
  global.SNChromeFixLoader = { build: BUILD, enforceHud: enforceHud, earthHome: earthHome };
})(typeof window !== 'undefined' ? window : globalThis);
