/**
 * SNGameLoop — street-ready frame governor (gaming engine discipline)
 * Fixed timestep feel · skip backlog · never stack 10 frames after tab freeze
 */
(function (g) {
  'use strict';
  var MAX_DT = 50; // ms — clamp spiral of death
  var TARGET = 1000 / 60;
  var last = 0;
  var acc = 0;
  var raf = 0;
  var subs = [];
  var running = false;
  var frames = 0;
  var dropped = 0;

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (!last) last = now;
    var dt = now - last;
    last = now;
    if (dt > 250) {
      // tab resume — hard reset, no catch-up storm
      dt = TARGET;
      acc = 0;
      dropped++;
    }
    if (dt > MAX_DT) {
      dropped++;
      dt = MAX_DT;
    }
    acc += dt;
    // single sim step per frame (UI/globe already self-paced)
    var step = Math.min(acc, MAX_DT);
    acc = 0;
    frames++;
    for (var i = 0; i < subs.length; i++) {
      try {
        subs[i](step, now);
      } catch (e) {
        console.warn('[SNGameLoop]', e);
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function subscribe(fn) {
    if (typeof fn === 'function' && subs.indexOf(fn) < 0) subs.push(fn);
    start();
    return function () {
      subs = subs.filter(function (x) {
        return x !== fn;
      });
    };
  }
  function stats() {
    return { frames: frames, dropped: dropped, subs: subs.length, running: running };
  }

  function power() { start(); return stats(); }
  function setQuality() { /* compat no-op for earth-ops */ return 'auto'; }
  g.SNGameLoop = { start: start, stop: stop, subscribe: subscribe, stats: stats, power: power, setQuality: setQuality, MAX_DT: MAX_DT };
})(typeof window !== 'undefined' ? window : globalThis);
