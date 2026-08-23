/* Astranov chrome-rib-face · Build 20260820185100
 * P0: signed-in profile face MUST stay a 28px circle on the ribbon.
 * Also boot chrome-p0-ops (ADD/Rhodes/map-hold) so it ships even if loader is cached.
 */
(function (global) {
  'use strict';
  var BUILD = '20260820185100-rib-face-ops';

  function injectCss() {
    var id = 'sn-chrome-rib-face-css';
    var old = document.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var css = document.createElement('style');
    css.id = id;
    css.textContent = [
      '#sn-task-ribbon .sn-rib-btn {',
      '  width: 36px !important; height: 36px !important;',
      '  min-width: 36px !important; min-height: 36px !important;',
      '  max-width: 36px !important; max-height: 36px !important;',
      '  overflow: hidden !important; border-radius: 50% !important;',
      '  flex: 0 0 36px !important; padding: 0 !important;',
      '  box-sizing: border-box !important;',
      '}',
      '#sn-rib-user, #sn-task-ribbon #sn-rib-user, #sn-task-ribbon button[data-act="user"] {',
      '  width: 36px !important; height: 36px !important;',
      '  min-width: 36px !important; min-height: 36px !important;',
      '  max-width: 36px !important; max-height: 36px !important;',
      '  overflow: hidden !important; border-radius: 50% !important;',
      '  flex: 0 0 36px !important; position: relative !important;',
      '}',
      '#sn-task-ribbon .sn-rib-icon {',
      '  display: flex !important; align-items: center !important; justify-content: center !important;',
      '  width: 28px !important; height: 28px !important;',
      '  max-width: 28px !important; max-height: 28px !important;',
      '  overflow: hidden !important; border-radius: 50% !important;',
      '  flex: 0 0 28px !important; margin: 0 auto !important;',
      '}',
      '#sn-task-ribbon .sn-rib-face,',
      '#sn-task-ribbon .sn-rib-icon img,',
      '#sn-rib-user img,',
      '#sn-task-ribbon button[data-act="user"] img,',
      '#sn-task-ribbon img {',
      '  width: 28px !important; height: 28px !important;',
      '  max-width: 28px !important; max-height: 28px !important;',
      '  min-width: 28px !important; min-height: 28px !important;',
      '  border-radius: 50% !important; object-fit: cover !important;',
      '  display: block !important; margin: 0 auto !important; padding: 0 !important;',
      '  position: static !important; left: auto !important; top: auto !important;',
      '  transform: none !important;',
      '}',
      '#astranov-logo, #sn-big-logo, .astranov-logo-overlay {',
      '  display: none !important; visibility: hidden !important;',
      '  width: 0 !important; height: 0 !important; pointer-events: none !important;',
      '}',
      'body.sn-in #cli-coach, body.sn-in #cli-coach * {',
      '  display: none !important; height: 0 !important; max-height: 0 !important;',
      '  padding: 0 !important; margin: 0 !important; overflow: hidden !important;',
      '  visibility: hidden !important; opacity: 0 !important;',
      '}',
      '#sn-task-ribbon {',
      '  min-height: 48px !important; height: 48px !important;',
      '  max-height: 48px !important; overflow: visible !important;',
      '  align-items: center !important;',
      '}',
    ].join('\n');
    document.head.appendChild(css);
  }

  function clampFaceDom() {
    try {
      var bar = document.getElementById('sn-task-ribbon');
      if (!bar) return;
      bar.querySelectorAll('.sn-rib-btn, button[data-act]').forEach(function (btn) {
        btn.style.setProperty('width', '36px', 'important');
        btn.style.setProperty('height', '36px', 'important');
        btn.style.setProperty('min-width', '36px', 'important');
        btn.style.setProperty('min-height', '36px', 'important');
        btn.style.setProperty('max-width', '36px', 'important');
        btn.style.setProperty('max-height', '36px', 'important');
        btn.style.setProperty('overflow', 'hidden', 'important');
        btn.style.setProperty('border-radius', '50%', 'important');
        btn.style.setProperty('flex', '0 0 36px', 'important');
      });
      bar.querySelectorAll('img').forEach(function (img) {
        img.classList.add('sn-rib-face');
        img.setAttribute('width', '28');
        img.setAttribute('height', '28');
        img.style.setProperty('width', '28px', 'important');
        img.style.setProperty('height', '28px', 'important');
        img.style.setProperty('max-width', '28px', 'important');
        img.style.setProperty('max-height', '28px', 'important');
        img.style.setProperty('min-width', '28px', 'important');
        img.style.setProperty('min-height', '28px', 'important');
        img.style.setProperty('border-radius', '50%', 'important');
        img.style.setProperty('object-fit', 'cover', 'important');
        img.style.setProperty('display', 'block', 'important');
        img.style.setProperty('margin', '0 auto', 'important');
        img.style.setProperty('position', 'static', 'important');
        img.style.setProperty('transform', 'none', 'important');
      });
      var user = document.getElementById('sn-rib-user') ||
        bar.querySelector('[data-act="user"]');
      if (user) {
        user.style.setProperty('width', '36px', 'important');
        user.style.setProperty('height', '36px', 'important');
        user.style.setProperty('overflow', 'hidden', 'important');
        user.style.setProperty('border-radius', '50%', 'important');
      }
    } catch (_) {}
  }

  function hideCoachIfSignedIn() {
    try {
      var signed = !!(global.SNAuth && SNAuth.user);
      document.body.classList.toggle('sn-in', !!signed);
      document.body.classList.toggle('sn-guest', !signed);
      if (signed) {
        var coach = document.getElementById('cli-coach');
        if (coach) {
          coach.style.setProperty('display', 'none', 'important');
          coach.style.setProperty('height', '0', 'important');
          coach.style.setProperty('padding', '0', 'important');
          coach.innerHTML = '';
        }
      }
    } catch (_) {}
  }

  function loadOps() {
    if (document.querySelector('script[data-sn-p0-ops]')) return;
    var s = document.createElement('script');
    s.src = '/js/spacenet/chrome-p0-ops.js?v=20260820185000';
    s.setAttribute('data-sn-p0-ops', '1');
    document.head.appendChild(s);
  }

  function boot() {
    injectCss();
    clampFaceDom();
    hideCoachIfSignedIn();
    loadOps();
    setTimeout(function () {
      injectCss();
      clampFaceDom();
      hideCoachIfSignedIn();
      loadOps();
    }, 400);
    setTimeout(function () {
      injectCss();
      clampFaceDom();
      hideCoachIfSignedIn();
    }, 1500);
    setTimeout(function () {
      clampFaceDom();
      hideCoachIfSignedIn();
    }, 3500);
    try {
      setInterval(function () {
        clampFaceDom();
        hideCoachIfSignedIn();
      }, 2500);
    } catch (_) {}
  }

  function hookPaint() {
    try {
      if (global.SNField && typeof SNField.paintRibbon === 'function' && !SNField._ribFaceHooked) {
        var orig = SNField.paintRibbon.bind(SNField);
        SNField.paintRibbon = function () {
          var r = orig.apply(this, arguments);
          setTimeout(clampFaceDom, 0);
          setTimeout(clampFaceDom, 50);
          hideCoachIfSignedIn();
          return r;
        };
        SNField._ribFaceHooked = true;
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
      hookPaint();
    });
  } else {
    boot();
    hookPaint();
  }
  setTimeout(hookPaint, 2000);

  global.SNChromeRibFace = { build: BUILD, clamp: clampFaceDom };
})(typeof window !== 'undefined' ? window : globalThis);
