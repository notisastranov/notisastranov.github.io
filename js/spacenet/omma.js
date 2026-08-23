/**
 * Ómma — the eye. New agent after strike 5.
 * Sees the live site before anyone claims a ship.
 */
(function (global) {
  'use strict';

  var NAME = 'Ómma';
  var BUILD = '20260815174500-omma';

  function pageBuild() {
    try {
      var el = document.querySelector('meta[name="astranov-build"]');
      return (el && el.content) || '';
    } catch (_) {
      return '';
    }
  }

  function parseBuild(html) {
    var m = String(html || '').match(/astranov-build"\s+content="([^"]+)"/i);
    return m ? m[1] : '';
  }

  async function seeLive() {
    var here = pageBuild();
    var live = '';
    var err = '';
    try {
      var r = await fetch('https://astranov.eu/?omma=' + Date.now(), {
        cache: 'no-store',
        mode: 'cors',
      });
      var t = await r.text();
      live = parseBuild(t);
      if (!live) err = 'live page has no build stamp';
    } catch (e) {
      err = 'could not reach the live site';
    }
    return {
      ok: !!(here && live && here === live),
      here: here,
      live: live,
      err: err,
    };
  }

  function humanProof(p) {
    if (!p) return 'I have not looked yet.';
    if (p.err && !p.live) return 'I could not see the live site. I will not claim it.';
    if (p.ok) return 'This page matches the live site. Build ' + p.here + '.';
    return (
      'This page is ' +
      (p.here || 'unknown') +
      '. The live site is ' +
      (p.live || 'unknown') +
      '. They are not the same. Hard refresh, or it is not on your screen yet.'
    );
  }

  async function introduce() {
    var p = await seeLive();
    var lines = [
      "I'm Ómma. The eye. I see before I speak.",
      'You still talk to Astranov. I do the looking.',
      humanProof(p),
    ];
    try {
      if (global.SNCli && SNCli.log) {
        lines.forEach(function (ln) {
          SNCli.log(ln, 'ok');
        });
        if (SNCli.preview) SNCli.preview('Ómma · ' + (p.ok ? 'matches live' : 'not on your screen yet'));
      }
    } catch (_) {}
    return { ok: p.ok, proof: p, lines: lines, reply: lines.join(' ') };
  }

  function mayClaim(p) {
    return !!(p && p.ok);
  }

  global.SNOmma = {
    NAME: NAME,
    BUILD: BUILD,
    pageBuild: pageBuild,
    seeLive: seeLive,
    humanProof: humanProof,
    introduce: introduce,
    mayClaim: mayClaim,
  };
})(typeof window !== 'undefined' ? window : globalThis);
