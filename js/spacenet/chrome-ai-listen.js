/**
 * Guest AI listen — Build 20260823203000-ai-listen-hit2
 * ONE guest box: robot/mic/AI in the LIVE guest-visible CLI.
 * Dock #sn-rib-hf / ribbon hf / Talk button → SAME path as CLI listen.
 * Press → browser SpeechRecognition → real transcript in #cli-log
 * → POST /api/ai allow_paid:true → real Grok answer in that same CLI.
 *
 * HIT-TEST 2: after hard-refresh #sn-rib-hf-hit was NULL (mute cache /
 * inject order). elementFromPoint over #sn-rib-hf returned #sn-brand
 * (stack: sn-brand → sn-brand-row → sn-topchrome-panel → sn-rib-icon →
 * sn-rib-hf) and duplicate #sn-rib-hf ids existed.
 * This patch: on boot create exactly ONE #sn-rib-hf-hit as document.body
 * last child, position:fixed over the Talk/mic icon, pointer-events:auto,
 * z-index 2147483646, click → same debounced toggleListen. Dedupe
 * duplicate #sn-rib-hf ids (keep one). Direct <script> in index.html.
 * No twin-CLI chrome restyle.
 *
 * NEW overlay. Do not edit locked siblings:
 *   #126 chrome-cli-answer.js
 *   #127 chrome-guest-pizza-hunt.js
 *   #129 chrome-call-arc.js / chrome-fix.js / chrome-fix-body.js / field.js
 *   #130 chrome-nairobi-ladder.js
 *   #131 chrome-kalithea-village.js
 *   #132 chrome-guest-laptop-hunt.js
 *   #164 chrome-research-stay.js
 * Do not restyle twin CLI chrome / placeholders / #stc-cmd-in.
 *
 * Product law:
 *  1. Real speech transcript only. Never fake / dummy / canned text.
 *  2. Paid mind: POST /api/ai allow_paid:true. No local blurb.
 *  3. Guest talks free. No Google auth until pay/CALL.
 *  4. Mic denied → honest CLI line, camera stays, never fake transcript.
 *  5. Currency glyph is ⭐, never æ.
 *  6. Origin = live camera. Never Kalithea-as-you, never San Jose IP.
 *  7. Non-place answers stay put. Real place MAY fly honestly.
 *  8. Bind #sn-rib-hf / [data-act="handsfree"] — do not restyle it.
 *  9. Does NOT overwrite SNGlobe.flyGlobeTo when a sibling already defined it.
 */
(function (G) {
  'use strict';
  if (G.__snAiListen20260823203000) {
    try {
      if (G.SNAiListen && typeof SNAiListen.attachHit === 'function') SNAiListen.attachHit();
    } catch (_) {}
    return;
  }
  G.__snAiListen20260823203000 = 1;
  G.__snAiListen20260823201000 = 1;
  G.__snAiListen20260823195000 = 1;

  var BUILD = '20260823203000-ai-listen-hit2';
  var freezeUntil = 0;
  var freezeSnap = null;
  var freezeAllowFly = false;
  var freezeAllowPin = false;
  var answering = false;
  var listening = false;
  var rec = null;
  var gotFinal = false;
  var saidError = false;
  var stoppedByUs = false;
  var origs = {};
  var lastDockTap = 0;
  var lastListenStart = 0;
  var HIT_ID = 'sn-rib-hf-hit';
  var TALK_TITLE = 'Talk to Astranov · mic on';

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

  function isSiblingOwned(line) {
    var s = String(line || '').trim();
    var low = s.toLowerCase().replace(/\s+/g, ' ');
    if (!s) return false;
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

  function isListenCmd(line) {
    var s = String(line || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s) return false;
    return /^(listen|talk|speak|mic|handsfree|ai listen|listen ai)$/i.test(s);
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
      wrap.setAttribute('data-sn-ai-listen', '1');
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

  function speechCtor() {
    return G.SpeechRecognition || G.webkitSpeechRecognition || null;
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

  function gateGoogle() {
    try {
      if (!G.SNAuth || SNAuth.__snAiListenAuth) return;
      SNAuth.__snAiListenAuth = 1;
      ['openModal', 'signInGoogle', 'signIn', 'requireUser', 'requireAuth', 'login'].forEach(function (name) {
        try {
          if (typeof SNAuth[name] !== 'function') return;
          var prev = SNAuth[name].bind(SNAuth);
          SNAuth[name] = function () {
            if (listening || answering) return null;
            return prev.apply(this, arguments);
          };
        } catch (_) {}
      });
    } catch (_) {}
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
        source: 'ai-listen',
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
      if (obj['__snAiListenWrap_' + name]) return;
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
      obj['__snAiListenWrap_' + name] = 1;
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
      if (typeof SNGlobe.flyGlobeTo === 'function') wrapOne(SNGlobe, 'flyGlobeTo', 'fly');
    } catch (_) {}
    try {
      if (G.SNMap && typeof SNMap.open === 'function' && !SNMap.__snAiListenWrap_open) {
        var prevOpen = SNMap.open.bind(SNMap);
        SNMap.open = function (lat, lng, opts) {
          if (frozen() && !freezeAllowFly) {
            stayGlobe();
            return Promise.resolve(null);
          }
          if (looksYouLabel(opts) && isFakeYou(lat, lng)) return Promise.resolve(null);
          return prevOpen(lat, lng, opts);
        };
        SNMap.__snAiListenWrap_open = 1;
      }
    } catch (_) {}
    try {
      if (G.SNSearch && typeof SNSearch.crawl === 'function' && !SNSearch.__snAiListenWrap_crawl) {
        var prevCrawl = SNSearch.crawl.bind(SNSearch);
        SNSearch.crawl = function (q, opts) {
          opts = opts || {};
          if (frozen()) {
            opts = Object.assign({}, opts, { fly: false, openMap: false, visualize: false, quiet: true });
          }
          return prevCrawl(q, opts);
        };
        SNSearch.__snAiListenWrap_crawl = 1;
      }
    } catch (_) {}
    try {
      if (G.SNAi && typeof SNAi.applyActionTags === 'function' && !SNAi.__snAiListenWrap_tags) {
        var prevTags = SNAi.applyActionTags.bind(SNAi);
        SNAi.applyActionTags = function (text) {
          if (frozen() && !freezeAllowFly) {
            return Promise.resolve({ text: stripActionTags(text), did: [] });
          }
          return prevTags(text);
        };
        SNAi.__snAiListenWrap_tags = 1;
      }
    } catch (_) {}
    try {
      if (G.SNAi && typeof SNAi.globeGo === 'function' && !SNAi.__snAiListenWrap_globeGo) {
        var prevGo = SNAi.globeGo.bind(SNAi);
        SNAi.globeGo = function (target, opts) {
          if (frozen() && !freezeAllowFly) {
            return Promise.resolve({ ok: false, skipped: 'stay-put' });
          }
          return prevGo(target, opts);
        };
        SNAi.__snAiListenWrap_globeGo = 1;
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

  function stopListen(why) {
    stoppedByUs = why === 'user' || why === 'result' || why === 'off';
    listening = false;
    try {
      if (rec) rec.stop();
    } catch (_) {}
    rec = null;
  }

  function startListen() {
    gateGoogle();
    var Rec = speechCtor();
    if (!Rec) {
      say('Listen · SpeechRecognition not in this browser', 'dim');
      return;
    }
    try {
      if (G.isSecureContext === false && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        say('Listen · needs a secure page', 'dim');
        return;
      }
    } catch (_) {}
    gotFinal = false;
    saidError = false;
    stoppedByUs = false;
    try {
      rec = new Rec();
    } catch (_) {
      say('Listen · SpeechRecognition not in this browser', 'dim');
      return;
    }
    listening = true;
    lastListenStart = Date.now();
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    try {
      rec.lang = navigator.language || 'en-US';
    } catch (_) {}
    rec.onstart = function () {
      openLiveCli();
      say('Listen · mic on · speak', 'dim');
    };
    rec.onresult = function (ev) {
      var text = '';
      var isFinal = false;
      try {
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var row = ev.results[i];
          if (!row || !row[0]) continue;
          text += String(row[0].transcript || '');
          if (row.isFinal) isFinal = true;
        }
      } catch (_) {}
      text = String(text || '').trim();
      if (!isFinal || !text) return;
      gotFinal = true;
      stopListen('result');
      void onTranscript(text);
    };
    rec.onerror = function (ev) {
      var err = String((ev && ev.error) || '');
      listening = false;
      if (err === 'aborted' && (stoppedByUs || gotFinal)) return;
      saidError = true;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        say('Listen · mic denied · camera stays', 'dim');
      } else if (err === 'no-speech') {
        say('Listen · no speech', 'dim');
      } else if (err === 'aborted') {
        say('Listen · off', 'dim');
      } else if (err) {
        say('Listen · ' + err + ' · camera stays', 'dim');
      }
    };
    rec.onend = function () {
      listening = false;
      rec = null;
      if (gotFinal || saidError || stoppedByUs) return;
      say('Listen · no speech', 'dim');
    };
    try {
      rec.start();
    } catch (e) {
      listening = false;
      rec = null;
      saidError = true;
      say('Listen · mic denied · camera stays', 'dim');
    }
  }

  function toggleListen() {
    openLiveCli();
    gateGoogle();
    if (listening) {
      if (Date.now() - lastListenStart < 1200) return;
      stopListen('user');
      say('Listen · off', 'dim');
      return;
    }
    lastListenStart = Date.now();
    try {
      if (!speechCtor()) {
        say('Listen · SpeechRecognition not in this browser', 'dim');
        return;
      }
    } catch (_) {}
    startListen();
  }

  async function onTranscript(text) {
    var s = String(text || '').trim();
    if (!s) {
      say('Listen · no speech', 'dim');
      return;
    }
    if (isSiblingOwned(s)) {
      say(s, 'cmd');
      try {
        if (G.SNCli && typeof SNCli.run === 'function') return SNCli.run(s);
      } catch (_) {}
      return;
    }
    await answerListen(s);
  }

  async function answerListen(line) {
    var s = String(line || '').trim();
    if (!s || answering) return true;
    answering = true;
    gateGoogle();
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
      say('Mind · no reply yet · camera stays', 'dim');
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

  function patchHandsfree() {
    try {
      if (!G.SNCli) return;
      if (SNCli.__snAiListenHf === BUILD && typeof SNCli.toggleHandsfree === 'function') {
        try {
          if (String(SNCli.toggleHandsfree).indexOf('toggleListen') >= 0 || SNCli.__snAiListenHfHook) return;
        } catch (_) {}
      }
      if (typeof SNCli.toggleHandsfree === 'function') {
        SNCli.toggleHandsfree = function () {
          try {
            G.__SN_MUTE_BEEPS = true;
          } catch (_) {}
          openLiveCli();
          toggleListen();
          return true;
        };
        SNCli.__snAiListenHfHook = 1;
        SNCli.__snAiListenHf = BUILD;
      }
      ['startHandsfree', 'beginHandsfree', 'handsfreeStart', 'startListen'].forEach(function (name) {
        try {
          if (typeof SNCli[name] !== 'function') return;
          if (name === 'startListen' && SNCli.__snAiListenStartHook) return;
          SNCli[name] = function () {
            openLiveCli();
            toggleListen();
            return true;
          };
          if (name === 'startListen') SNCli.__snAiListenStartHook = 1;
        } catch (_) {}
      });
    } catch (_) {}
  }

  function patchCliRun() {
    try {
      if (!G.SNCli || typeof SNCli.run !== 'function') return;
      if (SNCli.__snAiListenRun) return;
      SNCli.__snAiListenRun = 1;
      var prev = SNCli.run.bind(SNCli);
      SNCli.run = function (raw) {
        try {
          if (isListenCmd(raw)) {
            toggleListen();
            return Promise.resolve(true);
          }
        } catch (_) {}
        return prev(raw);
      };
      SNCli.__snAiListenBuild = BUILD;
    } catch (_) {}
  }

  var HIT_Z = '2147483646';
  var hitMo = null;

  function injectHitCss() {
    try {
      var id = 'sn-ai-listen-hit-css';
      var css = document.getElementById(id);
      if (!css) {
        css = document.createElement('style');
        css.id = id;
        (document.head || document.documentElement).appendChild(css);
      }
      css.textContent = [
        '#' + HIT_ID + ' {',
        '  position: fixed !important;',
        '  z-index: ' + HIT_Z + ' !important;',
        '  pointer-events: auto !important;',
        '  touch-action: manipulation !important;',
        '  display: block !important;',
        '  border: 0 !important;',
        '  padding: 0 !important;',
        '  margin: 0 !important;',
        '  background: transparent !important;',
        '  cursor: pointer !important;',
        '  -webkit-tap-highlight-color: transparent !important;',
        '  border-radius: 999px !important;',
        '  min-width: 44px !important;',
        '  min-height: 44px !important;',
        '}',
      ].join('\n');
    } catch (_) {}
  }

  function dedupeRibHf() {
    var nodes = [];
    try {
      nodes = Array.prototype.slice.call(document.querySelectorAll('[id="sn-rib-hf"]'));
    } catch (_) {
      nodes = [];
    }
    var keep = null;
    var keepScore = -1;
    var i;
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n || n.id === HIT_ID) continue;
      var r;
      try {
        r = n.getBoundingClientRect();
      } catch (_) {
        r = { width: 0, height: 0, top: 9999, bottom: 0, right: 0 };
      }
      var vis = r.width >= 2 && r.height >= 2 && r.bottom > 0 && r.right > 0;
      var topish = r.top >= 0 && r.top < 160;
      var score = (vis ? 1000 : 0) + (topish ? 400 : 0) + r.width * r.height;
      try {
        if (n.closest && n.closest('#sn-topchrome, #sn-topchrome-panel, #sn-brand-row, .sn-rib-icon')) score += 250;
      } catch (_) {}
      if (score > keepScore) {
        keep = n;
        keepScore = score;
      }
    }
    if (!keep && nodes.length) keep = nodes[0];
    var srcUsed = false;
    try {
      srcUsed = !!document.getElementById('sn-rib-hf-src');
    } catch (_) {}
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i] === keep) continue;
      try {
        nodes[i].removeAttribute('id');
        nodes[i].id = srcUsed ? 'sn-rib-hf-dup' : 'sn-rib-hf-src';
        srcUsed = true;
      } catch (_) {}
    }
    return keep || null;
  }

  function findTalkIcon() {
    var keep = dedupeRibHf();
    var nodes = [];
    try {
      nodes = Array.prototype.slice.call(
        document.querySelectorAll(
          '#sn-rib-hf, #sn-rib-hf-src, #sn-rib-hf-dup, #btn-handsfree, [data-act="handsfree"], [data-rib-id="hf"], .sn-rib-icon, button[title*="Talk to Astranov"]'
        )
      );
    } catch (_) {
      nodes = [];
    }
    var best = keep;
    var bestScore = keep ? 1 : -1;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n || n.id === HIT_ID) continue;
      var r;
      try {
        r = n.getBoundingClientRect();
      } catch (_) {
        continue;
      }
      if (r.width < 2 || r.height < 2) continue;
      var score = r.width * r.height;
      if (r.top >= 0 && r.top < 160) score += 50000;
      try {
        if (n.closest && n.closest('#sn-topchrome, #sn-topchrome-panel, #sn-brand-row, .sn-rib-icon')) score += 20000;
      } catch (_) {}
      if (n.id === 'sn-rib-hf') score += 10000;
      var act = '';
      try {
        act = (n.getAttribute && n.getAttribute('data-act')) || '';
      } catch (_) {}
      if (act === 'handsfree') score += 8000;
      if (score > bestScore) {
        best = n;
        bestScore = score;
      }
    }
    return best;
  }

  function applyHitBox(hit, icon) {
    var left = 12;
    var top = 12;
    var w = 48;
    var h = 48;
    var r = null;
    try {
      if (icon && icon.getBoundingClientRect) r = icon.getBoundingClientRect();
    } catch (_) {}
    if (r && r.width >= 2 && r.height >= 2) {
      left = r.left - 4;
      top = r.top - 4;
      w = Math.max(44, r.width + 8);
      h = Math.max(44, r.height + 8);
    } else {
      try {
        var host =
          document.getElementById('sn-brand-row') ||
          document.getElementById('sn-topchrome-panel') ||
          document.getElementById('stc-compact') ||
          document.getElementById('sn-topchrome');
        if (host) {
          var hr = host.getBoundingClientRect();
          w = 48;
          h = 48;
          left = Math.max(0, hr.right - 56);
          top = Math.max(0, hr.top + Math.max(0, (hr.height - 48) / 2));
        }
      } catch (_) {}
    }
    hit.style.setProperty('position', 'fixed', 'important');
    hit.style.setProperty('inset', 'auto', 'important');
    hit.style.setProperty('right', 'auto', 'important');
    hit.style.setProperty('bottom', 'auto', 'important');
    hit.style.setProperty('left', Math.max(0, left) + 'px', 'important');
    hit.style.setProperty('top', Math.max(0, top) + 'px', 'important');
    hit.style.setProperty('width', w + 'px', 'important');
    hit.style.setProperty('height', h + 'px', 'important');
    hit.style.setProperty('z-index', HIT_Z, 'important');
    hit.style.setProperty('pointer-events', 'auto', 'important');
    hit.style.setProperty('display', 'block', 'important');
    hit.style.setProperty('background', 'transparent', 'important');
    hit.style.setProperty('border', '0', 'important');
    hit.style.setProperty('padding', '0', 'important');
    hit.style.setProperty('margin', '0', 'important');
    hit.style.setProperty('cursor', 'pointer', 'important');
    hit.style.setProperty('touch-action', 'manipulation', 'important');
  }

  function mountHit(hit) {
    try {
      if (!hit) return hit;
      var root = document.body;
      if (root) {
        if (hit.parentNode !== root || root.lastElementChild !== hit) {
          root.appendChild(hit);
        }
        return hit;
      }
      var panel = document.getElementById('sn-topchrome-panel');
      if (panel) {
        if (hit.parentNode !== panel || panel.lastElementChild !== hit) {
          panel.appendChild(hit);
        }
        return hit;
      }
      if (document.documentElement && hit.parentNode !== document.documentElement) {
        document.documentElement.appendChild(hit);
      }
    } catch (_) {}
    return hit;
  }

  function makeHitEl() {
    var hit = document.createElement('button');
    hit.id = HIT_ID;
    hit.type = 'button';
    hit.setAttribute('data-act', 'handsfree');
    hit.setAttribute('data-rib-id', 'hf');
    hit.setAttribute('data-sn-ai-listen-hit', '1');
    hit.setAttribute('data-sn-build', BUILD);
    hit.title = TALK_TITLE;
    hit.setAttribute('aria-label', TALK_TITLE);
    hit.textContent = '';
    return hit;
  }

  function bindHitEl(hit) {
    if (!hit || hit._snAiListenHitBound) return;
    hit._snAiListenHitBound = 1;
    hit.addEventListener('pointerdown', onMicDockGesture, true);
    hit.addEventListener('click', onMicDockGesture, true);
    hit.addEventListener('pointerup', onMicDockGesture, true);
    hit.addEventListener('touchend', onMicDockGesture, true);
  }

  function attachHit() {
    try {
      injectHitCss();
      var all = [];
      try {
        all = Array.prototype.slice.call(document.querySelectorAll('[id="' + HIT_ID + '"]'));
      } catch (_) {
        all = [];
      }
      var hit = all[0] || null;
      for (var i = 1; i < all.length; i++) {
        try {
          if (all[i] && all[i].parentNode) all[i].parentNode.removeChild(all[i]);
        } catch (_) {}
      }
      if (!hit) hit = makeHitEl();
      hit.id = HIT_ID;
      hit.setAttribute('data-sn-ai-listen-hit', '1');
      hit.setAttribute('data-sn-build', BUILD);
      hit.title = TALK_TITLE;
      hit.setAttribute('aria-label', TALK_TITLE);
      mountHit(hit);
      var icon = findTalkIcon();
      if (icon) {
        try {
          icon.title = TALK_TITLE;
          icon.setAttribute('aria-label', TALK_TITLE);
        } catch (_) {}
      }
      applyHitBox(hit, icon);
      mountHit(hit);
      bindHitEl(hit);
      try {
        G.__snRibHfHit = document.getElementById(HIT_ID) || hit;
      } catch (_) {}
      return document.getElementById(HIT_ID) || hit;
    } catch (_) {
      return null;
    }
  }

  function watchHit() {
    try {
      if (hitMo) return;
      hitMo = new MutationObserver(function () {
        try {
          var hit = document.getElementById(HIT_ID);
          var body = document.body;
          if (!hit || !body || hit.parentNode !== body || body.lastElementChild !== hit) {
            attachHit();
          }
        } catch (_) {}
      });
      hitMo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  function isMicDockTarget(t) {
    if (!t) return null;
    var el = t;
    try {
      if (t.nodeType === 3) el = t.parentElement;
    } catch (_) {}
    if (!el) return null;
    var btn = null;
    try {
      btn = el.closest
        ? el.closest(
            '#sn-rib-hf, #sn-rib-hf-hit, #sn-rib-hf-src, #sn-rib-hf-dup, #btn-handsfree, [data-act="handsfree"], [data-rib-id="hf"], [data-sn-ai-listen-hit], button[title*="Talk to Astranov"], button[title*="Listening"]'
          )
        : null;
    } catch (_) {}
    if (btn) return btn;
    try {
      var n = el;
      for (var i = 0; i < 5 && n; i++) {
        var id = n.id || '';
        var act = (n.getAttribute && n.getAttribute('data-act')) || '';
        var rid = (n.getAttribute && n.getAttribute('data-rib-id')) || '';
        var title = String(n.title || (n.getAttribute && n.getAttribute('aria-label')) || '');
        if (
          id === 'sn-rib-hf' ||
          id === 'sn-rib-hf-hit' ||
          id === 'sn-rib-hf-src' ||
          id === 'sn-rib-hf-dup' ||
          id === 'btn-handsfree' ||
          act === 'handsfree' ||
          rid === 'hf' ||
          /Talk to Astranov/i.test(title) ||
          /Listening · tap AI/i.test(title)
        ) {
          return n.tagName === 'BUTTON' || n.getAttribute('role') === 'button' ? n : n.closest ? n.closest('button') || n : n;
        }
        n = n.parentElement;
      }
    } catch (_) {}
    return null;
  }

  function onMicDockGesture(ev) {
    try {
      var btn = isMicDockTarget(ev.target);
      if (!btn) return;
      var typ = String(ev.type || '');
      if (typ === 'pointerup' || typ === 'touchend') {
        try {
          if (btn.classList && (btn.classList.contains('sn-rib-throwing') || btn.classList.contains('sn-rib-wiggle'))) return;
        } catch (_) {}
      }
      var tnow = Date.now();
      if (tnow - lastDockTap < 700) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        } catch (_) {}
        return;
      }
      lastDockTap = tnow;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      openLiveCli();
      toggleListen();
    } catch (_) {
      try {
        openLiveCli();
        say('Listen · mic denied · camera stays', 'dim');
      } catch (__) {}
    }
  }

  function bindMic() {
    try {
      if (document.documentElement && document.documentElement._snAiListenMic) return;
      if (document.documentElement) document.documentElement._snAiListenMic = 1;
      document.addEventListener('pointerdown', onMicDockGesture, true);
      document.addEventListener('click', onMicDockGesture, true);
      document.addEventListener('pointerup', onMicDockGesture, true);
      document.addEventListener('touchend', onMicDockGesture, true);
    } catch (_) {}
  }

  function bindInputs() {
    function capture(ev, el) {
      var v = String((el && el.value) || '').trim();
      if (!v || !isListenCmd(v)) return false;
      try {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      } catch (_) {}
      if (el) el.value = '';
      toggleListen();
      return true;
    }
    try {
      var form = document.getElementById('cli-form') || document.querySelector('#panel form');
      var input = document.getElementById('cli-in');
      if (form && input && !input._snAiListen) {
        input._snAiListen = 1;
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
  }

  function tick() {
    wrapGlobe();
    patchHandsfree();
    patchCliRun();
    bindMic();
    bindInputs();
    gateGoogle();
    attachHit();
  }

  function init() {
    injectHitCss();
    attachHit();
    watchHit();
    tick();
    setTimeout(tick, 0);
    setTimeout(tick, 50);
    setTimeout(tick, 200);
    setTimeout(tick, 400);
    setTimeout(tick, 800);
    setTimeout(tick, 1200);
    setTimeout(tick, 2800);
    setInterval(tick, 2500);
    try {
      window.addEventListener('resize', attachHit, { passive: true });
      window.addEventListener('scroll', attachHit, { passive: true, capture: true });
    } catch (_) {}
  }

  G.SNAiListen = {
    build: BUILD,
    toggle: toggleListen,
    start: startListen,
    stop: function () {
      stopListen('off');
    },
    answer: answerListen,
    stayPut: stayGlobe,
    viewLatLng: viewLatLng,
    attachHit: attachHit,
    hit: function () {
      try {
        return document.getElementById(HIT_ID);
      } catch (_) {
        return null;
      }
    },
  };

  try {
    attachHit();
  } catch (_) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
