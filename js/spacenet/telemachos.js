/**
 * Telemachos (ΤΗΛΕΜΑΧΟΣ) — Astranov drone pilot memory
 * Owner stack: gaming pilot + commercial Teledromos + tilemaxos spelling.
 * Live spacenet path: commands + map pulse + order handoff (not full legacy game sim).
 */
(function (global) {
  'use strict';

  var HOME = { lat: 36.215, lng: 28.125, label: 'Archangelos' }; // village / Rhodes east

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'ok');
    } catch (_) {}
  }

  function wantsCmd(t) {
    return /telemach|tilemax|tilemach|teledrom|τηλεμαχ|τηλεδρομ|drone\s*pilot|\bpilot\b|\bdrone\b/i.test(
      String(t || '')
    );
  }

  function status() {
    return {
      name_gr: 'ΤΗΛΕΜΑΧΟΣ',
      name_latin: 'Telemachos',
      editions: ['telemachos', 'teledromos', 'tilemaxos'],
      home: HOME,
      ready: true,
      note: 'Drone pilot of Astranov Mind — delivery + field',
    };
  }

  async function flyHome() {
    try {
      if (global.SNGlobe && SNGlobe.goToPlace) {
        SNGlobe.goToPlace(HOME.lat, HOME.lng, {
          tier: 'national',
          label: 'Archangelos · Telemachos',
          body: 'earth',
          pulse: true,
        });
      }
      if (global.SNGlobe && SNGlobe.pulse) {
        SNGlobe.pulse(HOME.lat, HOME.lng, 0x00ccff, 'ΤΗΛΕΜΑΧΟΣ', 20000);
      }
    } catch (_) {}
    log('Telemachos · Archangelos home field', 'ok');
    return { ok: true, home: HOME };
  }

  /**
   * Deliver tray via market food path when possible, else announce pilot run.
   */
  async function deliver(items, opts) {
    opts = opts || {};
    var tray = String(items || 'pitogyra mpyronia').trim();
    log('Telemachos drone · tray: ' + tray, 'ok');
    try {
      if (global.SNGlobe && SNGlobe.pulse) {
        var pos = global._snLastPos || (global.SNTasks && SNTasks.pos) || HOME;
        SNGlobe.pulse(pos.lat, pos.lng, 0x00ccff, 'DRONE', 16000);
        SNGlobe.pulse(HOME.lat, HOME.lng, 0x44ffaa, 'BASE', 16000);
      }
    } catch (_) {}
    // Map to food intent when market present
    if (global.SNMarket && SNMarket.fulfillFoodIntent) {
      var food = /pitogyra|πιτογυρ|gyro|pita/i.test(tray)
        ? 'pitogyra'
        : /pizza/i.test(tray)
          ? 'pizza'
          : 'food';
      try {
        var r = await SNMarket.fulfillFoodIntent(
          {
            food: food,
            overpass: food === 'pizza' ? 'pizza restaurant' : 'restaurant food',
            raw: 'order ' + tray + ' telemachos drone',
            autoOrder: !!opts.autoOrder,
            lazyJudge: !!opts.autoOrder,
            browseOnly: !opts.autoOrder,
            courier: 'Telemachos',
          },
          { autoOrder: !!opts.autoOrder, quiet: false }
        );
        return { ok: !!(r && (r.ok || r.best)), market: r, pilot: 'Telemachos', tray: tray };
      } catch (e) {
        log('Telemachos market path · ' + (e.message || e), 'dim');
      }
    }
    log('Telemachos standing by · tray noted: ' + tray, 'ok');
    return { ok: true, pilot: 'Telemachos', tray: tray };
  }

  async function cli(line) {
    var low = String(line || '').toLowerCase();
    if (/home|archangelos|αρχάγγελ|base|χωριό/i.test(low)) {
      return flyHome();
    }
    if (/deliver|order|pitogyra|mpyron|beer|tray|παραγγελ/i.test(low)) {
      var items = low
        .replace(/.*\b(deliver|order|drone)\b/i, '')
        .trim() || 'pitogyra mpyronia';
      return deliver(items, { autoOrder: /\border\b/i.test(low) });
    }
    log('Telemachos (Τηλέμαχος) · drone pilot ready · try: pilot home · deliver pitogyra', 'ok');
    return status();
  }

  global.SNTelemachos = {
    HOME: HOME,
    wantsCmd: wantsCmd,
    status: status,
    flyHome: flyHome,
    deliver: deliver,
    cli: cli,
  };
  // Legacy name
  global.TelemachosPilot = global.TelemachosPilot || {
    wantsCmd: wantsCmd,
    cli: function (_parts, raw) {
      return cli(raw || '');
    },
    edition: { name_gr: 'ΤΗΛΕΜΑΧΟΣ', name_latin: 'telemachos', color: 0x00ccff },
  };
})(typeof window !== 'undefined' ? window : globalThis);
