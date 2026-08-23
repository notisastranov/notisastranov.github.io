/**
 * SNSimpleUX — owner cleanup layer
 * One mental model: globe · power on · locate · marina · cancel
 * Overrides verbose help + AI "full OS" answers without rewriting 150KB cli.js
 */
(function (global) {
  'use strict';

  var SIMPLE_HELP = [
    'ASTRANOV — delivery on the globe',
    '1  power on     · throw task offers + polygons',
    '2  locate       · put you on the map',
    '3  marina       · berth grid + prices',
    '4  global       · back to 3D Earth',
    '5  cancel       · unstick AI / clear busy',
    'Talk plain English or Greek. Scroll = zoom · drag = spin.',
  ];

  function logHelp() {
    try {
      if (!global.SNCli || !SNCli.log) return false;
      SIMPLE_HELP.forEach(function (ln, i) {
        SNCli.log(ln, i === 0 ? 'ok' : i === SIMPLE_HELP.length - 1 ? 'dim' : 'ok');
      });
      if (SNCli.preview) SNCli.preview('power on · locate · marina · cancel');
      return true;
    } catch (_) {
      return false;
    }
  }

  function wrapCli() {
    if (!global.SNCli || typeof SNCli.run !== 'function') return;
    if (SNCli._snSimpleUx) return;
    var orig = SNCli.run.bind(SNCli);
    SNCli.run = async function (raw) {
      var low = String(raw || '')
        .trim()
        .toLowerCase();
      if (low === 'help' || low === '?' || low === 'commands' || low === 'what can you do') {
        try {
          if (SNCli.beginTurn) SNCli.beginTurn();
        } catch (_) {}
        try {
          if (SNCli.log) SNCli.log(String(raw).trim(), 'cmd');
        } catch (_) {}
        logHelp();
        try {
          if (SNCli.endTurn) SNCli.endTurn();
        } catch (_) {}
        return;
      }
      return orig(raw);
    };
    SNCli._snSimpleUx = true;
  }

  function wrapMind() {
    var mind = global.SNAstranovMind || global.SNFreeMind;
    if (!mind || typeof mind.answer !== 'function') return;
    if (mind._snSimpleUx) return;
    var orig = mind.answer.bind(mind);
    mind.answer = function (message, opts) {
      var low = String(message || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      if (
        /^(help|help me|what can you do|commands|\?)$/i.test(low) ||
        /\b(confus|too much|complicated|clean up|simplify|how does this work)\b/i.test(low)
      ) {
        return {
          text:
            'Simple: power on (tasks) · locate · marina · global · cancel. Scroll zooms · drag spins.',
          score: 1,
          via: 'astranov-mind',
          source: 'simple-ux',
        };
      }
      if (/\b(game|invaders|cockpit|youtube|full os|internet os)\b/i.test(low) && !/\bpower on|locate|marina\b/i.test(low)) {
        return {
          text: 'Lean mode: delivery only. power on · locate · marina · help.',
          score: 1,
          via: 'astranov-mind',
          source: 'simple-ux',
        };
      }
      var r = orig(message, opts);
      // Rewrite verbose help-like seed answers
      if (r && r.text && /Full (internet )?OS|youtube · shops · order · dark map|pilot · search · code/i.test(r.text)) {
        r = Object.assign({}, r, {
          text: 'Simple: power on · locate · marina · global · cancel. English or Greek.',
        });
      }
      return r;
    };
    mind._snSimpleUx = true;
  }

  function init() {
    wrapCli();
    wrapMind();
    [400, 1200, 3000].forEach(function (ms) {
      setTimeout(function () {
        wrapCli();
        wrapMind();
      }, ms);
    });
  }

  global.SNSimpleUX = { init: init, help: logHelp };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
