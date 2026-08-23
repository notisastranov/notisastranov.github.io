/**
 * Guest research stay-put — Build 20260823190000-research-stay
 * ONE guest box: questions asked in the live CLI ANSWER in the CLI,
 * and the camera STAYS PUT for non-place research.
 *
 * NEW overlay. Do not edit locked siblings:
 *   #127 chrome-guest-pizza-hunt.js
 *   #129 chrome-call-arc.js / chrome-fix.js / chrome-fix-body.js / field.js
 *   #130 chrome-nairobi-ladder.js
 *   #131 chrome-kalithea-village.js
 *   #132 chrome-guest-laptop-hunt.js
 * Box 1 #126 twin CLIs stay as-is. Do not restyle chrome / placeholders.
 *
 * Product law:
 *  1. Real paid mind only: /api/ai allow_paid:true. No dummy / canned /
 *     hardcoded / template answers.
 *  2. Currency glyph is ⭐, never æ.
 *  3. Origin = live camera / real locate. Never Kalithea-as-you, never
 *     San Jose, never a fake YOU marker.
 *  4. Non-place questions (what is a laptop, how does wifi work, what is
 *     the star currency) → CLI text only. Same viewLatLng before/after.
 *     No flyTo / teleport / pin.
 *  5. Real place questions (nairobi, kalithea, rhodes) MAY fly honestly.
 *  6. Research = CLI answer + at most an optional orbit pin when the
 *     subject is a genuine place. Never teleport AFTER the answer.
 *  7. Production SNAi.ask answers then teleports (applyActionTags,
 *     SNSearch.crawl fly:true, default Rhodes pos). This overlay
 *     intercepts first, calls paid /api/ai directly, and freezes globe
 *     APIs for the duration so that teleport cannot fire.
 *
 * Does NOT overwrite SNGlobe.flyGlobeTo when a sibling already defined it.
 */
(function (G) {
  'use strict';
  if (G.__snResearchStay20260823190000) return;
  G.__snResearchStay20260823190000 = 1;

  var BUILD = '20260823190000-research-stay';
  var freezeUntil = 0;
  var freezeSnap = null;
  var freezeAllowFly = false;
  var freezeAllowPin = false;
  var answering = false;
  var origs = {};

  var FAKE_YOU = [
    { lat: 36.387557, lng: 28.222533, r: 0.03, name: 'Kalithea' },
    { lat: 36.434, lng: 28.217, r: 0.06, name: 'Rhodes silent' },
    { lat: 36.43, lng: 28.22, r: 0.05, name: 'Rhodes center' },
    { lat: 36.443, lng: 28.226, r: 0.04, name: 'Rhodes town' },
    { lat: 37.339, lng: -121.895, r: 0.12, name: 'San Jose IP' },
    { lat: 37.338, lng: -121.886, r: 0.12, name: 'Columbus Park' },
    { lat: 37.33, lng: -121.89, r: 0.12, name: 'San Jose' },
  ];

  var PLACES = [
    { re: /\bnairobi\b|\bkenya\b/i, name: 'Nairobi', lat: -1.286389, lng: 36.817223 },
    { re: /\bkalithea\b|\bkallithea\b|\bκαλλιθέα\b|\bκαλλιθεα\b/i, name: 'Kalithea', lat: 36.387557, lng: 28.222533 },
    { re: /\brhodes\b|\brodos\b|\bρόδος\b|\bρόδο\b|\bροδος\b/i, name: 'Rhodes', lat: 36.44, lng: 28.22 },
    { re: /\bathens\b|\bαθήνα\b|\bαθηνα\b/i, name: 'Athens', lat: 37.9838, lng: 23.7275 },
  ];

  function now() {
    return Date.now();
  }
  function frozen() {
    return now() < freezeUntil;
  }
  function near(a, b, r) {
    if (a == null || b == null) return false;
    return Math.abs(Number(a) - Number(b)) <= (r || 0.08);
  }
  function isFakeYou(lat, lng) {
    lat = Number(lat);
    lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return false;
    for (var i = 0; i < FAKE_YOU.length; i++) {
      var f = FAKE_YOU[i];
      if (near(lat, f.lat, f.r) && near(lng, f.lng, f.r)) return f;
    }
    return null;
  }
  function looksYouLabel(opts) {
    try {
      var s = String((opts && (opts.label || opts.name || opts.title)) || '');
      return /^(you|me|here|home|gps)$/i.test(s.trim());
    } catch (_) {
      return false;
    }
  }

  function viewLatLng() {
    try {
      if (G.SNGlobe && typeof SNGlobe.viewLatLng === 'function') {
        var v = SNGlobe.viewLatLng();
        if (v && v.lat != null && v.lng != null) {
          return { lat: Number(v.lat), lng: Number(v.lng) };
        }
      }
    } catch (_) {}
    return null;
  }

  function stayGlobe() {
    try {
      if (G.SNMap && SNMap.active && typeof SNMap.close === 'function') SNMap.close();
    } catch (_) {}
  }

  function starify(text) {
    var t = String(text == null ? '' : text);
    t = t.replace(/[æÆ]/g, '⭐');
    t = t.replace(/\u00e6|\u00c6/g, '⭐');
    t = t.replace(/\bAE\b/g, '⭐');
    t = t.replace(/\bAstra coins?\b/gi, '⭐');
    return t;
  }

  function stripActionTags(text) {
    return String(text || '')
      .replace(
        /\[\[\s*(GO|FLY|LOCATE|CITY|SHOPS|GLOBAL|EARTH|MAP|BASEMAP|LAYER|LAYERS|OVERLAY|PILOT|CLI|TILE|CMD|YOUTUBE|YT|IMAGINE|IMAGE)\s*(?::\s*[^\]]+)?\s*\]\]/gi,
        ' '
      )
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function genuinePlace(line) {
    var s = String(line || '');
    for (var i = 0; i < PLACES.length; i++) {
      if (PLACES[i].re.test(s)) return PLACES[i];
    }
    return null;
  }

  function wantsHonestFly(line, place) {
    if (!place) return false;
    var s = String(line || '').trim();
    return /^(where\s+is|where'?s|που\s+ειναι|πού\s+είναι)\b/i.test(s);
  }

  function isPizzaCmd(line) {
    var s = String(line || '').trim();
    var low = s.toLowerCase().replace(/\s+/g, ' ');
    if (!s) return false;
    if (/\?$/.test(s)) return false;
    if (/^(what|why|how|who|when|explain|tell me|define)\b/i.test(low)) return false;
    if (low === 'pizza' || low === 'pizzeria' || low === 'pizzas') return true;
    if (/^(order (me )?(a )?pizza|get (me )?(a )?pizza|find (a )?pizza|i want (a )?pizza|hungry for pizza)$/i.test(low))
      return true;
    if (/\bpizza\b|\bpizzeria\b/i.test(low)) return true;
    return false;
  }

  function isSiblingOwned(line) {
    var s = String(line || '').trim();
    var low = s.toLowerCase().replace(/\s+/g, ' ');
    if (!s) return false;
    if (isPizzaCmd(s)) return true;
    if (/\?$/.test(s)) return false;
    if (/^(what|why|how|who|when|explain|tell me|define)\b/i.test(low)) return false;
    if (/^(laptop|laptops|buy (a )?laptops?|order (me )?(a )?laptop|get (me )?(a )?laptop|find (a )?laptop|i want (a )?laptop|need (a )?laptop)$/i.test(low))
      return true;
    if (/\bpizza\b|\bpizzeria\b/i.test(low) && !/^(what|why|how)\b/i.test(low)) return true;
    if (/^(nairobi|kenya|africa|kalithea|kallithea|rhodes|rodos|ρόδος|ρόδο)$/i.test(low)) return true;
    if (/^(show|go(?: to)?|fly|zoom(?: to)?|take me to)\s+(the )?(nairobi|kenya|africa|kalithea|kallithea|rhodes|rodos|ρόδος)\b/i.test(low))
      return true;
    if (/^(call|hangup|hang up|webrtc)\b/i.test(low)) return true;
    if (/^(locate|gps|power(\s+on|\s+off)?|polygon|poly|install|login|layers|send)\b/i.test(low))
      return true;
    return false;
  }

  function isResearchish(line) {
    var s = String(line || '').trim();
    var low = s.toLowerCase();
    if (!s || s.length < 2) return false;
    if (isPizzaCmd(s)) return false;
    if (isSiblingOwned(s)) return false;
    if (/^(help|status|boot|diag|network|battery|device|clear|cancel|mute|install|login)\b/i.test(low) && !/\?$/.test(s))
      return false;
    if (/\?$/.test(s)) return true;
    if (/^(what|why|how|who|when|explain|tell me|define)\b/i.test(low)) return true;
    if (/^(is |are |can |do |does |should |would |could )\b/i.test(low) && s.length > 8) return true;
    if (/^τι\s+(εί?ναι|ειναι)\b/i.test(s)) return true;
    if (/^(γιατί|γιατι|πώς|πως|ποιος|ποιος)\b/i.test(s)) return true;
    return false;
  }

  function openLiveCli() {
    try {
      var panel = document.getElementById('panel');
      if (panel) {
        panel.classList.add('sn-open', 'open');
        panel.classList.remove('collapsed', 'sn-quiet');
      }
    } catch (_) {}
    try {
      var el = document.getElementById('cli-log');
      if (el) {
        el.style.setProperty('display', 'block', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', '26vh', 'important');
        el.style.setProperty('overflow-y', 'auto', 'important');
      }
    } catch (_) {}
  }

  function paintLiveCli(s, c) {
    s = String(s == null ? '' : s).slice(0, 480);
    if (!s) return;
    openLiveCli();
    try {
      var el = document.getElementById('cli-log');
      if (!el) return;
      var last = el.lastElementChild;
      if (last && String(last.textContent || '') === s) {
        try {
          el.scrollTop = el.scrollHeight;
        } catch (__) {}
        return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'cli-feed-item is-latest';
      wrap.setAttribute('data-sn-research-stay', '1');
      wrap.setAttribute('data-search', s);
      var line = document.createElement('div');
      var kind = c || 'ok';
      if (kind === 'dim') kind = 'progress';
      line.className = 'cli-line ' + kind;
      var body = document.createElement('div');
      body.className = 'cli-body';
      body.textContent = s;
      line.appendChild(body);
      wrap.appendChild(line);
      try {
        el.querySelectorAll('.cli-feed-item.is-latest').forEach(function (n) {
          n.classList.remove('is-latest');
        });
      } catch (__) {}
      el.appendChild(wrap);
      try {
        el.scrollTop = el.scrollHeight;
      } catch (__) {}
    } catch (_) {}
  }

  function say(m, c) {
    var s = starify(String(m == null ? '' : m)).slice(0, 480);
    if (!s) return;
    try {
      if (G.SNCli && typeof SNCli.beginTurn === 'function' && typeof SNCli.inTurn === 'function') {
        if (!SNCli.inTurn()) SNCli.beginTurn();
      }
    } catch (_) {}
    try {
      if (G.SNCli && SNCli.log) SNCli.log(s, c || 'ok', true);
    } catch (_) {}
    paintLiveCli(s, c);
    try {
      if (G.SNCli && SNCli.preview) SNCli.preview(s.slice(0, 90));
    } catch (_) {}
  }

  function clearInputs() {
    try {
      var a = document.getElementById('cli-in');
      if (a) a.value = '';
      var b = document.getElementById('stc-cmd-in');
      if (b) b.value = '';
    } catch (_) {}
  }

  function paidApiUrl() {
    try {
      var host = location.hostname || '';
      if (host === 'localhost' || host === '127.0.0.1' || /astranov\.eu$/i.test(host)) {
        return location.origin + '/api/ai';
      }
    } catch (_) {}
    try {
      if (G.SN_CONFIG && SN_CONFIG.aiUrl) return String(SN_CONFIG.aiUrl);
      if (G.SN_CONFIG && SN_CONFIG.sbUrl)
        return String(SN_CONFIG.sbUrl).replace(/\/$/, '') + '/functions/v1/ai-router';
    } catch (_) {}
    return '/api/ai';
  }

  function authHeaders() {
    var h = { 'Content-Type': 'application/json', Accept: 'application/json' };
    try {
      var key = (G.SN_CONFIG && SN_CONFIG.sbKey) || G.SB_KEY || '';
      if (key) {
        h.apikey = key;
        h.Authorization = 'Bearer ' + key;
      }
      if (G.SNAuth && SNAuth.session && SNAuth.session.access_token) {
        h.Authorization = 'Bearer ' + SNAuth.session.access_token;
      } else if (G.SNAuth && typeof SNAuth.authHeaders === 'function') {
        var extra = SNAuth.authHeaders();
        if (extra) {
          Object.keys(extra).forEach(function (k) {
            h[k] = extra[k];
          });
        }
      }
    } catch (_) {}
    return h;
  }

  function pickReply(j) {
    if (!j) return null;
    var t = j.text || j.reply || j.message || j.answer || j.response || j.content || '';
    t = String(t || '').trim();
    if (!t) return null;
    if (/try again|no model|warming|unavailable|^error\b/i.test(t) && t.length < 80) return null;
    if (/owner_note|USAGE SHIP|ASTRANOV LAW/i.test(t)) return null;
    return t;
  }

  async function paidMind(line) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (_) {}
    }, 14000);
    try {
      if (G.SNSubscription && typeof SNSubscription.askPowerful === 'function') {
        try {
          var pow = await SNSubscription.askPowerful(line, {
            mode: 'chat',
            timeoutMs: 12000,
            allow_paid: true,
            stayGlobe: true,
            stay_globe: true,
          });
          if (pow && pow.ok && pow.text) {
            var pt = pickReply({ text: pow.text });
            if (pt) return pt;
          }
        } catch (_) {}
      }
      var urls = [paidApiUrl()];
      try {
        var cfg = G.SN_CONFIG || {};
        if (cfg.sbUrl) urls.push(String(cfg.sbUrl).replace(/\/$/, '') + '/functions/v1/aicycle');
      } catch (_) {}
      var body = {
        text: line,
        message: line,
        allow_paid: true,
        force_paid: true,
        preferred_provider: 'astranov',
        level: 'personal',
        source: 'research-stay',
        build: BUILD,
        stay_globe: true,
        stayGlobe: true,
        mode: 'chat',
        fast: false,
      };
      for (var i = 0; i < urls.length; i++) {
        try {
          var res = await fetch(urls[i], {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body),
            mode: 'cors',
            signal: ctrl ? ctrl.signal : undefined,
          });
          if (!res.ok) continue;
          var j = await res.json().catch(function () {
            return {};
          });
          var t = pickReply(j);
          if (t) return t;
        } catch (_) {}
      }
    } catch (_) {
    } finally {
      clearTimeout(timer);
    }
    return null;
  }

  function freezeCamera(ms, opts) {
    opts = opts || {};
    freezeUntil = now() + (ms || 16000);
    freezeSnap = viewLatLng();
    freezeAllowFly = !!opts.allowFly;
    freezeAllowPin = !!opts.allowPin;
    stayGlobe();
    wrapGlobe();
  }

  function thawCamera() {
    freezeUntil = 0;
    freezeAllowFly = false;
    freezeAllowPin = false;
  }

  function sameView(a, b) {
    if (!a || !b) return true;
    return near(a.lat, b.lat, 0.08) && near(a.lng, b.lng, 0.08);
  }

  function wrapOne(obj, name, kind) {
    try {
      if (!obj || typeof obj[name] !== 'function') return;
      var key = kind + ':' + name;
      if (obj['__snStayWrap_' + name]) return;
      var prev = obj[name].bind(obj);
      origs[key] = prev;
      obj[name] = function () {
        var lat = arguments[0];
        var lng = arguments[1];
        var opts = arguments[2] || {};
        if (frozen()) {
          if (looksYouLabel(opts) || isFakeYou(lat, lng)) return null;
          if (kind === 'pin') {
            if (!freezeAllowPin) return null;
            return prev.apply(this, arguments);
          }
          if (!freezeAllowFly) return null;
        }
        if (looksYouLabel(opts) && isFakeYou(lat, lng)) return null;
        return prev.apply(this, arguments);
      };
      obj['__snStayWrap_' + name] = 1;
    } catch (_) {}
  }

  function wrapGlobe() {
    try {
      if (!G.SNGlobe) return;
      wrapOne(SNGlobe, 'goToPlace', 'fly');
      wrapOne(SNGlobe, 'flyNear', 'fly');
      wrapOne(SNGlobe, 'diveInAt', 'fly');
      wrapOne(SNGlobe, 'setFocus', 'fly');
      wrapOne(SNGlobe, 'goToTier', 'fly');
      wrapOne(SNGlobe, 'setGlobeLatLng', 'fly');
      wrapOne(SNGlobe, 'pulse', 'pin');
      /* wrap flyGlobeTo if present — never invent / overwrite a missing one */
      if (typeof SNGlobe.flyGlobeTo === 'function') wrapOne(SNGlobe, 'flyGlobeTo', 'fly');
    } catch (_) {}
    try {
      if (G.SNMap && typeof SNMap.open === 'function' && !SNMap.__snStayWrap_open) {
        var prevOpen = SNMap.open.bind(SNMap);
        SNMap.open = function (lat, lng, opts) {
          if (frozen() && !freezeAllowFly) {
            stayGlobe();
            return Promise.resolve(null);
          }
          if (looksYouLabel(opts) && isFakeYou(lat, lng)) return Promise.resolve(null);
          return prevOpen(lat, lng, opts);
        };
        SNMap.__snStayWrap_open = 1;
      }
    } catch (_) {}
    try {
      if (G.SNSearch && typeof SNSearch.crawl === 'function' && !SNSearch.__snStayWrap_crawl) {
        var prevCrawl = SNSearch.crawl.bind(SNSearch);
        SNSearch.crawl = function (q, opts) {
          opts = opts || {};
          if (frozen()) {
            opts = Object.assign({}, opts, { fly: false, openMap: false, visualize: false, quiet: true });
          }
          return prevCrawl(q, opts);
        };
        SNSearch.__snStayWrap_crawl = 1;
      }
    } catch (_) {}
    try {
      if (G.SNAi && typeof SNAi.applyActionTags === 'function' && !SNAi.__snStayWrap_tags) {
        var prevTags = SNAi.applyActionTags.bind(SNAi);
        SNAi.applyActionTags = function (text) {
          if (frozen() && !freezeAllowFly) {
            return Promise.resolve({ text: stripActionTags(text), did: [] });
          }
          return prevTags(text);
        };
        SNAi.__snStayWrap_tags = 1;
      }
    } catch (_) {}
    try {
      if (G.SNAi && typeof SNAi.globeGo === 'function' && !SNAi.__snStayWrap_globeGo) {
        var prevGo = SNAi.globeGo.bind(SNAi);
        SNAi.globeGo = function (target, opts) {
          if (frozen() && !freezeAllowFly) {
            return Promise.resolve({ ok: false, skipped: 'stay-put' });
          }
          return prevGo(target, opts);
        };
        SNAi.__snStayWrap_globeGo = 1;
      }
    } catch (_) {}
  }

  function pinPlace(place) {
    if (!place) return;
    try {
      if (G.SNGlobe && typeof SNGlobe.pulse === 'function') {
        SNGlobe.pulse(place.lat, place.lng, 0x7ee9ff, place.name, 24000);
      }
    } catch (_) {}
    try {
      if (G.SNSpaceLinks && typeof SNSpaceLinks.addResearch === 'function') {
        SNSpaceLinks.addResearch({ lat: place.lat, lng: place.lng, label: place.name }, { label: place.name });
      }
    } catch (_) {}
  }

  function honestFly(place) {
    if (!place) return;
    try {
      if (G.SNGlobe && typeof SNGlobe.flyGlobeTo === 'function') {
        void SNGlobe.flyGlobeTo(place.lat, place.lng, { label: place.name });
        return;
      }
    } catch (_) {}
    try {
      if (G.SNGlobe && typeof SNGlobe.flyNear === 'function') {
        SNGlobe.flyNear(place.lat, place.lng, 'national');
      }
    } catch (_) {}
  }

  async function answerResearch(line) {
    var s = String(line || '').trim();
    if (!s || answering) return true;
    answering = true;
    var place = genuinePlace(s);
    var mayFly = wantsHonestFly(s, place);
    freezeCamera(18000, { allowFly: false, allowPin: false });
    stayGlobe();
    clearInputs();
    openLiveCli();
    say(s, 'cmd');
    say('Mind · thinking…', 'dim');
    var paid = null;
    try {
      paid = await paidMind(s);
    } catch (_) {}
    paid = stripActionTags(starify(paid || ''));
    freezeCamera(4000, { allowFly: false, allowPin: !!place });
    stayGlobe();
    if (paid) {
      String(paid)
        .split(/\n+/)
        .forEach(function (part) {
          var p = String(part || '').trim();
          if (p) say(p, 'ok');
        });
    } else {
      say('Mind · no reply yet · stay put', 'dim');
    }
    if (place) {
      freezeAllowPin = true;
      pinPlace(place);
    }
    var after = viewLatLng();
    if (!place && freezeSnap && after && !sameView(freezeSnap, after)) {
      stayGlobe();
    }
    if (mayFly && place) {
      thawCamera();
      honestFly(place);
    } else {
      setTimeout(function () {
        thawCamera();
      }, 1200);
    }
    try {
      if (G.SNCli && SNCli.endTurn) SNCli.endTurn();
    } catch (_) {}
    clearInputs();
    answering = false;
    return true;
  }

  function handleLine(raw) {
    var s = String(raw || '').trim();
    if (!s) return false;
    if (isPizzaCmd(s)) {
      try {
        if (G.SNChromeGuestPizzaHunt && typeof SNChromeGuestPizzaHunt.hunt === 'function') {
          void SNChromeGuestPizzaHunt.hunt(s);
          return true;
        }
      } catch (_) {}
      return false;
    }
    if (!isResearchish(s)) return false;
    void answerResearch(s);
    return true;
  }

  function patchCliRun() {
    try {
      if (!G.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli.__snResearchStay) return;
      SNCli.__snResearchStay = 1;
      var prev = SNCli.run.bind(SNCli);
      SNCli.run = function (raw) {
        try {
          if (handleLine(raw)) return Promise.resolve(true);
        } catch (_) {}
        return prev(raw);
      };
      SNCli.__snResearchStayBuild = BUILD;
    } catch (_) {}
  }

  function bindInputs() {
    function capture(ev, el) {
      var v = String((el && el.value) || '').trim();
      if (!v) return false;
      if (isPizzaCmd(v)) {
        if (!(G.SNChromeGuestPizzaHunt && typeof SNChromeGuestPizzaHunt.hunt === 'function')) return false;
        try {
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        } catch (_) {}
        if (el) el.value = '';
        try {
          void SNChromeGuestPizzaHunt.hunt(v);
        } catch (_) {}
        return true;
      }
      if (!isResearchish(v)) return false;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      if (el) el.value = '';
      void answerResearch(v);
      return true;
    }
    try {
      var form = document.getElementById('cli-form') || document.querySelector('#panel form');
      var input = document.getElementById('cli-in');
      if (form && input && !input._snResearchStay) {
        input._snResearchStay = 1;
        form.addEventListener(
          'submit',
          function (ev) {
            capture(ev, input);
          },
          true
        );
        input.addEventListener(
          'keydown',
          function (ev) {
            if (ev.key === 'Enter') capture(ev, input);
          },
          true
        );
      }
    } catch (_) {}
    try {
      var topIn = document.getElementById('stc-cmd-in');
      var topForm = document.getElementById('stc-cmd');
      if (topIn && !topIn._snResearchStay) {
        topIn._snResearchStay = 1;
        if (topForm) {
          topForm.addEventListener(
            'submit',
            function (ev) {
              capture(ev, topIn);
            },
            true
          );
        }
        topIn.addEventListener(
          'keydown',
          function (ev) {
            if (ev.key === 'Enter') capture(ev, topIn);
          },
          true
        );
      }
    } catch (_) {}
  }

  function tick() {
    wrapGlobe();
    patchCliRun();
    bindInputs();
  }

  function init() {
    tick();
    setTimeout(tick, 0);
    setTimeout(tick, 400);
    setTimeout(tick, 1200);
    setTimeout(tick, 2800);
    setInterval(tick, 4000);
  }

  G.SNResearchStay = {
    build: BUILD,
    answer: answerResearch,
    isResearchish: isResearchish,
    stayPut: stayGlobe,
    viewLatLng: viewLatLng,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
