/**
 * SpaceXai flight — the globe is the net.
 * Words fly. Old pages do not.
 */
(function (global) {
  'use strict';

  var S = {
    on: false,
    flying: false,
    lastQ: '',
    lastAt: 0,
  };

  function log(m, c) {
    try {
      if (global.SNCli && SNCli.log) SNCli.log(m, c || 'ok');
    } catch (_) {}
  }

  function preview(m) {
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(m);
    } catch (_) {}
  }

  function isSystem(t) {
    return /^(help|live|fluid|omma|όμμα|locate|login|wallet|pizza|order|donate|layers|code|coders|hard boot|power|battery|subscribe|plans|marina|poly|helper|who are you|rate|mine|call|add|send|cancel|stop|youtube|yt|watch|clip)\b/.test(
      t
    );
  }

  function wantsFly(line) {
    var t = String(line || '').trim();
    var low = t.toLowerCase();
    if (t.length < 2 || t.length > 90) return false;
    if (/\b(drum\s*cam|drumcam|concert|setlist|youtube|clip|video|βίντεο)\b/.test(low)) return false;
    if (/\b\d{9,}\b/.test(low) && /\b(cam|drum|live|set|mix)\b/.test(low)) return false;
    try {
      if (global.SNYoutube) {
        if (SNYoutube.wantsYoutube && SNYoutube.wantsYoutube(t)) return false;
        if (SNYoutube.looksLikeClipTitle && SNYoutube.looksLikeClipTitle(t)) return false;
      }
    } catch (_) {}
    if (/^(fly|go|take me|zoom|land|orbit)\b/.test(low)) return true;
    if (
      /^(earth|mars|moon|jupiter|saturn|venus|tokyo|paris|london|athens|rhodes|rodos|rome|eiffel)$/.test(
        low
      )
    )
      return true;
    return false;
  }

  async function fly(line) {
    var q = String(line || '')
      .replace(/^(fly|go to|go|take me to|show me|zoom to|land at|orbit)\s+/i, '')
      .trim();
    if (!q) return false;
    S.flying = true;
    S.lastQ = q;
    S.lastAt = Date.now();
    preview('Flying…');
    log('Flying · ' + q, 'cmd');
    try {
      if (global.SNGlobe && SNGlobe.setHud) SNGlobe.setHud('SPACEXAI · FLY · ' + q.toUpperCase());
    } catch (_) {}
    try {
      if (global.SNHelper && SNHelper.wake) {
        SNHelper.wake({ force: true, label: 'UNIT · SILVER WINGS', showcaseMs: 20000 });
      }
    } catch (_) {}
    var crawled = null;
    try {
      if (global.SNSearch && SNSearch.crawl) {
        crawled = await SNSearch.crawl(q, {
          visualize: true,
          fly: true,
          openMap: !(global.SNMap && SNMap.wantsImagery && SNMap.wantsImagery(line)),
          quiet: false,
        });
      }
    } catch (_) {}
    S.flying = false;
    var landed =
      crawled &&
      (crawled.body ||
        crawled.focus ||
        (crawled.hits && crawled.hits.length) ||
        (crawled.places && crawled.places[0] && crawled.places[0].lat != null));
    if (landed) {
      try {
        if (
          global.SNMap &&
          SNMap.wantsImagery &&
          SNMap.wantsImagery(line) &&
          SNMap.showLiveSat &&
          crawled &&
          crawled.focus
        ) {
          await SNMap.showLiveSat(crawled.focus.lat, crawled.focus.lng, {
            zoom: 13,
            pollution: /pollut|sea|chlor|bloom|dirty|stain|θάλασσ|ρύπανσ/i.test(line),
            plume: false,
            label: crawled.focus.name || q,
          });
        }
      } catch (_) {}
      try {
        if (global.SNSearch && SNSearch.report && global.SNCli && SNCli.log) {
          SNSearch.report(crawled, SNCli.log);
        }
      } catch (_) {}
      var name =
        (crawled.focus && crawled.focus.name) || crawled.body || q;
      preview(name);
      log('On station · ' + name, 'ok');
      return { ok: true, crawled: crawled, name: name };
    }
    log('No lock on ' + q + '. Name a city, a street, a world.', 'dim');
    preview('no lock');
    return { ok: false };
  }

  function enter(opts) {
    opts = opts || {};
    S.on = true;
    try {
      document.body.classList.add('spacexai');
    } catch (_) {}
    try {
      var inp = document.getElementById('cli-in');
      if (inp) inp.placeholder = 'command line interface';
      var top = document.getElementById('stc-cmd-in');
      if (top) top.placeholder = 'Heads up display command line interface';
    } catch (_) {}
    try {
      if (global.SNGlobe && SNGlobe.setHud) SNGlobe.setHud('SPACEXAI · FLY');
    } catch (_) {}
    if (!opts.quiet) {
      log('SpaceXai flight. The globe is the net. Name a place.', 'ok');
      preview('fly · name a place');
    }
    return true;
  }

  global.SNSpaceXai = {
    enter: enter,
    fly: fly,
    wantsFly: wantsFly,
    isSystem: isSystem,
    get on() {
      return S.on;
    },
    get flying() {
      return S.flying;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
