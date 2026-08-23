/**
 * SNEarthOps — compatibility façade
 * =================================
 * The Real-Earth theater is SNSpaceScene: craft/hostiles/beacons live in the
 * same Three.js world as SNGlobe Earth + outer space (not a 2D canvas overlay).
 * This module keeps CLI / dock / older calls working as SNEarthOps.
 *
 * CLI: earth ops · space scene · ops · gaming · play levels
 */
(function (global) {
  'use strict';

  function scene() {
    return global.SNSpaceScene || null;
  }

  function ensureSpaceScene() {
    return new Promise(function (resolve) {
      if (global.SNSpaceScene && SNSpaceScene.start) {
        resolve(global.SNSpaceScene);
        return;
      }
      if (global.SNLoader && SNLoader.ensure) {
        SNLoader.ensure(['spacescene', 'space-scene', 'earthops'])
          .then(function () {
            resolve(global.SNSpaceScene || null);
          })
          .catch(function () {
            resolve(global.SNSpaceScene || null);
          });
        return;
      }
      resolve(null);
    });
  }

  function start(opts) {
    var S = scene();
    if (S && S.start) return S.start(opts || {});
    // lazy load then start
    ensureSpaceScene().then(function (mod) {
      if (mod && mod.start) mod.start(opts || {});
    });
    return false;
  }

  function stop() {
    var S = scene();
    if (S && S.stop) return S.stop();
    if (S && S.close) return S.close();
  }

  function mount() {
    /* no 2D chip — game dock + space-scene HUD own chrome */
    return null;
  }

  function init() {
    try {
      if (global.SNSpaceScene && SNSpaceScene.init) SNSpaceScene.init();
    } catch (_) {}
  }

  global.SNEarthOps = {
    start: start,
    open: start,
    stop: stop,
    close: stop,
    mount: mount,
    init: init,
    get active() {
      var S = scene();
      return !!(S && S.active);
    },
    get phase() {
      var S = scene();
      return (S && S.phase) || 'idle';
    },
    get score() {
      var S = scene();
      return (S && S.score) || 0;
    },
    get level() {
      var S = scene();
      return (S && S.level) || 0;
    },
  };

  // Lean money path: no auto-init — CLI / SNLoader.ensure only
  function maybeAutoInit() {
    try {
      if (global.SNPerf && SNPerf.dummyOff) return;
      if (global._snLean) return;
    } catch (_) {}
    try {
      init();
    } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeAutoInit);
  } else {
    setTimeout(maybeAutoInit, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
