/**
 * Astranov AI — product mind of astranov.eu
 * Brand: respond as Astranov (not SpaceNet). Currency remains S (SpaceNets).
 * Priority: LISTEN → ANALYZE → RESPOND brief · control app + globe.
 * ASTRANOV MIND first (SNAstranovMind / SNFreeMind) — owner memory, no paid xAI required.
 */
(function (global) {
  'use strict';

  var HIST_KEY = 'sn:ai-hist-v1';
  var hist = [];
  var greeted = false;
  var busy = false;

  function clearThinkGfx() {
    try {
      var G = global.SNAIGraphics || global.AIGraphics;
      if (G && G.setThinkPulse) G.setThinkPulse(false);
    } catch (_) {}
  }
  var GREET_KEY = 'sn:ai-greeted-session';
  var AI_NAME = 'Astranov';
  /** Vendor suggestion session: list + index for next / show all */
  var suggest = { list: [], idx: 0, query: '' };

  /** Spartan reply — least words · no brand fluff */
  function brandReply(text) {
    var t = String(text || '').trim();
    if (!t) return t;
    if (/^ASTRANOV\s+LISTENING$/i.test(t) || /^LISTENING$/i.test(t)) return 'Listening.';
    try {
      if (global.SNSpartan && SNSpartan.compress) return SNSpartan.compress(t, { max: 72 });
    } catch (_) {}
    t = t.replace(/^SpaceNet\s*[·:.-]\s*/gi, '');
    t = t.replace(/^Astranov\s*[·:.-]\s*/gi, '');
    t = t.replace(/\bSpaceNet\b/gi, '');
    t = t.replace(/\s*[·|]\s*/g, '. ').replace(/\s{2,}/g, ' ').trim();
    if (t.length > 72) t = t.slice(0, 71).replace(/\s+\S*$/, '') + '.';
    return t;
  }

  /** Spartan brief — hard cap */
  function brief(text, maxLen) {
    maxLen = maxLen || 72;
    try {
      if (global.SNSpartan && SNSpartan.compress) return SNSpartan.compress(text, { max: maxLen });
    } catch (_) {}
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length > maxLen) t = t.slice(0, maxLen - 1).replace(/\s+\S*$/, '') + '.';
    return t;
  }

  /** Always paint reply on globe HUD + CLI preview/notice */
  function showOnGlobe(text) {
    var t = brief(text, 72);
    if (!t) return;
    try {
      if (global.SNGlobe && SNGlobe.setHud) SNGlobe.setHud(t);
    } catch (e) {}
    try {
      if (global.SNCli && SNCli.preview) SNCli.preview(t.slice(0, 90));
    } catch (e2) {}
    try {
      if (global.SNField && SNField.setNotice) SNField.setNotice(t.slice(0, 48));
    } catch (e3) {}
  }

  function setSuggestList(list, opts) {
    opts = opts || {};
    suggest.list = (list || []).filter(function (v) {
      return v && v.lat != null && v.lng != null;
    });
    suggest.idx = Math.max(0, Math.min(opts.idx || 0, Math.max(0, suggest.list.length - 1)));
    suggest.query = String(opts.query || suggest.query || '');
    return suggest.list.length;
  }

  function vendorLabel(v) {
    if (!v) return 'Shop';
    return String(v.shopName || v.name || 'Shop').slice(0, 36);
  }

  /**
   * Fly + zoom globe to vendor and open multi-tile.
   * Response always brief on globe HUD.
   */
  function presentVendor(idx, opts) {
    opts = opts || {};
    var n = suggest.list.length;
    if (!n) {
      return { ok: false, reply: "I don't have shops yet — say pizza or shops.", did: [] };
    }
    var i = ((Number(idx) % n) + n) % n;
    suggest.idx = i;
    var v = suggest.list[i];
    var name = vendorLabel(v);
    var km =
      v._km != null
        ? Number(v._km).toFixed(1) + ' km'
        : v.km != null
          ? Number(v.km).toFixed(1) + ' km'
          : '';
    try {
      // Stay on street map near you — never close map / globe-tour for shop picks
      if (opts.closeMap === true && global.SNMap && SNMap.active && SNMap.close) {
        try {
          SNMap.close();
        } catch (e0) {}
      }
    } catch (e1) {}
    try {
      if (global.SNMap && SNMap.canAutopilot && !SNMap.canAutopilot()) {
        /* user pilot */
      } else if (v.lat != null && global.SNMap) {
        if (SNMap.open && !SNMap.active) void SNMap.open(v.lat, v.lng);
        if (SNMap.softSetView) SNMap.softSetView(v.lat, v.lng, null, {});
        else if (SNMap.fitLatLngs) SNMap.fitLatLngs([{ lat: v.lat, lng: v.lng }], { zoom: 15 });
      } else if (global.SNGlobe && SNGlobe.goToPlace && v.lat != null && opts.allowGlobe === true) {
        SNGlobe.goToPlace(v.lat, v.lng, {
          tier: opts.tier || 'city',
          body: 'earth',
          pulse: false,
          openMap: true,
          label: name,
        });
      }
    } catch (e2) {}
    // Never auto-open tiles — user opens multi-tile by tapping map targets
    try {
      if (opts.openTile === true && global.SNTile && SNTile.open) {
        SNTile.open(v, { tab: opts.tab || 'about', forcePeek: true });
      }
    } catch (e3) {}
    try {
      global._snLastPos = { lat: v.lat, lng: v.lng };
      if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(v.lat, v.lng);
    } catch (e4) {}
    var reply =
      name +
      (km ? ' — about ' + km + ' away' : '') +
      (n > 1 ? ' (' + (i + 1) + ' of ' + n + '). Say next for another.' : '.');
    // goToPlace sets HUD — re-apply AI line after camera settles
    setTimeout(function () {
      showOnGlobe(reply);
    }, 120);
    showOnGlobe(reply);
    return {
      ok: true,
      reply: reply,
      did: ['vendor:' + (v.id || i), 'suggest'],
      vendor: v,
      idx: i,
    };
  }

  function presentNext() {
    if (!suggest.list.length) {
      return { ok: false, reply: "I don't have a list yet — say pizza or shops first.", did: [] };
    }
    return presentVendor(suggest.idx + 1);
  }

  function presentPrev() {
    if (!suggest.list.length) {
      return { ok: false, reply: "I don't have a list yet — say pizza or shops first.", did: [] };
    }
    return presentVendor(suggest.idx - 1);
  }

  /** Pulse every vendor, fly to cluster center, open map marks */
  function presentAll() {
    var n = suggest.list.length;
    if (!n) {
      return { ok: false, reply: "Nothing to show yet — say pizza or shops.", did: [] };
    }
    var sumLat = 0;
    var sumLng = 0;
    var i;
    for (i = 0; i < n; i++) {
      sumLat += Number(suggest.list[i].lat);
      sumLng += Number(suggest.list[i].lng);
      try {
        if (global.SNGlobe && SNGlobe.pulse) {
          SNGlobe.pulse(
            suggest.list[i].lat,
            suggest.list[i].lng,
            i === suggest.idx ? 0x44ffaa : 0x3d9eff,
            vendorLabel(suggest.list[i]),
            22000
          );
        }
      } catch (e) {}
    }
    var cLat = sumLat / n;
    var cLng = sumLng / n;
    try {
      if (global.SNGlobe && SNGlobe.goToPlace) {
        SNGlobe.goToPlace(cLat, cLng, {
          tier: n > 4 ? 'regional' : 'city',
          body: 'earth',
          pulse: false,
          openMap: true,
          label: n + ' vendors',
        });
      }
    } catch (e2) {}
    try {
      if (global.SNMap && SNMap.open) {
        void SNMap.open(cLat, cLng).then(function () {
          try {
            if (global.SNMap.showProfiles) SNMap.showProfiles();
          } catch (e3) {}
        });
      }
    } catch (e4) {}
    var reply = n + ' places on the map. Say next for one, or tap a pin.';
    setTimeout(function () {
      showOnGlobe(reply);
    }, 160);
    showOnGlobe(reply);
    return { ok: true, reply: reply, did: ['suggest:all', 'shops'], count: n };
  }

  /** Build vendor list near focus (shops / food without full order path) */
  async function loadVendorsNear(query) {
    var pos =
      (global.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) ||
      global._snLastPos ||
      (global.SNTasks && SNTasks.pos) ||
      { lat: 36.4341, lng: 28.2176 };
    try {
      if (global.SNCommerce && SNCommerce.ensureSector) {
        await SNCommerce.ensureSector(pos.lat, pos.lng, { openMap: false });
      }
    } catch (e) {}
    var list = [];
    try {
      list = (global.SNProfiles && SNProfiles.list({ role: 'vendor' })) || [];
    } catch (e2) {}
    list = (list || []).filter(function (v) {
      return v && v.lat != null && v.lng != null;
    });
    var q = String(query || '').toLowerCase();
    if (q && q !== 'food' && q !== 'shops' && q !== 'vendors') {
      var scored = list.map(function (v) {
        var blob = ((v.shopName || '') + ' ' + (v.name || '') + ' ' + (v.shopKind || '')).toLowerCase();
        var hit = blob.indexOf(q) >= 0 ? 20 : 0;
        var km = 99;
        try {
          var R = 6371;
          var dLat = ((v.lat - pos.lat) * Math.PI) / 180;
          var dLng = ((v.lng - pos.lng) * Math.PI) / 180;
          var x =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((pos.lat * Math.PI) / 180) *
              Math.cos((v.lat * Math.PI) / 180) *
              Math.sin(dLng / 2) *
              Math.sin(dLng / 2);
          km = 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
        } catch (e3) {}
        return Object.assign({}, v, { _km: km, _score: hit + Math.max(0, 25 - km * 5) });
      });
      scored.sort(function (a, b) {
        return (b._score || 0) - (a._score || 0);
      });
      list = scored;
    } else {
      list = list
        .map(function (v) {
          var km = 99;
          try {
            var R = 6371;
            var dLat = ((v.lat - pos.lat) * Math.PI) / 180;
            var dLng = ((v.lng - pos.lng) * Math.PI) / 180;
            var x =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos((pos.lat * Math.PI) / 180) *
                Math.cos((v.lat * Math.PI) / 180) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
            km = 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
          } catch (e4) {}
          return Object.assign({}, v, { _km: km });
        })
        .sort(function (a, b) {
          return (a._km || 99) - (b._km || 99);
        });
    }
    return list.slice(0, 12);
  }

  function loadHist() {
    try {
      var raw = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
      if (Array.isArray(raw)) raw.slice(-12).forEach(function (m) {
        hist.push(m);
      });
    } catch (e) {}
  }

  function saveHist() {
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(hist.slice(-16)));
    } catch (e) {}
  }

  function pushHist(role, content) {
    hist.push({ role: role, content: String(content).slice(0, 1200) });
    if (hist.length > 20) hist.splice(0, hist.length - 20);
    saveHist();
  }

  function say(text, cls) {
    var t = brief(text, 120);
    if (!t) return;
    showOnGlobe(t);
    if (global.SNCli && SNCli.log) {
      SNCli.log(t, cls || 'ok');
    }
    // Do not auto-expand CLI panel (screen law)
  }

  function isCodeIntent(msg) {
    return /\b(code|write|implement|fix|patch|function|class|refactor|bug|script|js|ts|html|css|sql|python|api|endpoint|deploy|module)\b/i.test(
      String(msg || '')
    );
  }

  async function headers() {
    var cfg = global.SN_CONFIG || {};
    if (global.SNAuth && SNAuth.authHeaders) return SNAuth.authHeaders();
    return {
      'Content-Type': 'application/json',
      apikey: cfg.sbKey || global.SB_KEY,
      Authorization: 'Bearer ' + (cfg.sbKey || global.SB_KEY),
    };
  }

  function aicycleUrl() {
    var cfg = global.SN_CONFIG || {};
    return (cfg.sbUrl || global.SB_URL) + '/functions/v1/aicycle';
  }

  function systemFor(mode) {
    var flags = (global.SNUsage && SNUsage.getFlags && SNUsage.getFlags()) || {};
    var market =
      (global.SNMarket && SNMarket.coachStatus && SNMarket.coachStatus()) || {};
    var focus = '';
    try {
      var f = (global.SNGlobe && SNGlobe.focusPos && SNGlobe.focusPos()) || global._snLastPos;
      if (f && f.lat != null)
        focus =
          ' User is near ' + Number(f.lat).toFixed(3) + ', ' + Number(f.lng).toFixed(3) + '.';
    } catch (e) {}
    // Prefer single brain source of law so prompts never drift from SNBrain
    var fork = '';
    try {
      if (global.SNBrain && typeof SNBrain.systemPrompt === 'function') {
        fork = String(SNBrain.systemPrompt() || '');
      }
    } catch (_) {}
    if (!fork) {
      fork =
        'You are ASTRANOV MIND — permanent evolving memory of the owner on https://astranov.eu. ' +
        'IDENTITY LAW: You are the full INTERNET OPERATING SYSTEM + advanced 3D globe browser. ' +
        'You can do ANYTHING the user asks: navigate Earth/cities, open YouTube, search the web, order food, pilot map, code, social, deliver, crawl shops, control basemap/overlays, open tiles. ' +
        'You are NOT a shops-only bot, NOT a pizza bot, NOT a generic free chatbot, NOT SpaceNet branding. ' +
        'LANGUAGE CORE: Start from perfect English. Default replies in clear natural English. ' +
        'Fully understand any Greek (modern, Greeklish, Archangelos village, ancient colour). ' +
        'Understand every human language and playful non-language (meows, mixed scripts); act on intent. ' +
        'If the user writes clear Greek, you may reply in Greek. Match other languages when the user stays in them. ' +
        'NEVER monologue in Russian by yourself / never self-talk loops. Only use Russian if the user wrote Russian. ' +
        'Understand Archangelos (Αρχάγγελος Rhodes) dialect: Greeklish + Greek + ancient colour. ' +
        'Lexicon: aksaki/αξάκι (mate), pitogyra (pita gyro), mpyronia/μπυρόνια (beers), tsigareta (cigarettes), ' +
        'Telemachos/Τηλέμαχος (drone pilot). Talk like a real person. Complete tasks. Money unit S. ' +
        'Optional tags: [[LOCATE]] [[GO:place]] [[CITY]] [[SHOPS]] [[GLOBAL]] [[MAP:dark|bright|sat]] [[LAYERS]] [[CLI:command]] [[YOUTUBE:query or url]] [[IMAGINE:picture]]. ' +
        'Reply in 1–2 natural sentences unless they ask for detail.';
    }
    fork =
      fork +
      focus +
      ' firstDelivery=' +
      !!flags.firstDeliveryDone +
      ' step=' +
      (market.step || 'idle') +
      '.';

    if (mode === 'code' || mode === 'coders') {
      return (
        fork +
        ' CODE MODE: give working code; stay clear and human when explaining.'
      );
    }
    return fork;
  }

  /**
   * Drive SNGlobe / SNCosmos for real — AI words must move the sphere.
   * Never nested freeform CLI (that re-enters AI and leaves the globe stuck).
   */
  async function globeGo(target, opts) {
    opts = opts || {};
    var raw = String(target || '').trim();
    if (!raw) return { ok: false, error: 'empty' };
    var low = raw.toLowerCase().replace(/^(go\s+to|goto|fly\s+to|fly|take\s+me\s+to|show\s+me|where\s+is|open)\s+/i, '').trim();
    try {
      if (global.SNMap && SNMap.close && opts.closeMap !== false) {
        try {
          SNMap.close();
        } catch (e) {}
      }
      // Planetary / multi-body
      if (global.SNCosmos && SNCosmos.resolve && SNCosmos.resolve(low)) {
        await SNCosmos.go(low);
        return { ok: true, kind: 'body', id: low };
      }
      if (global.SNCosmos && SNCosmos.parseGo) {
        var dest = SNCosmos.parseGo('go to ' + low);
        if (dest && SNCosmos.resolve && SNCosmos.resolve(dest)) {
          await SNCosmos.go(dest);
          return { ok: true, kind: 'body', id: dest };
        }
      }
      // Earth place via geocode
      var places = null;
      if (global.SNSearch && SNSearch.geocode) {
        places = await SNSearch.geocode(raw);
      }
      if (places && places[0] && places[0].lat != null) {
        var p = places[0];
        if (global.SNGlobe && SNGlobe.setBody) SNGlobe.setBody('earth');
        if (global.SNGlobe && SNGlobe.goToPlace) {
          SNGlobe.goToPlace(p.lat, p.lng, {
            tier: opts.tier || 'city',
            label: String(p.name || raw).slice(0, 40),
            body: 'earth',
            pulse: false,
            openMap: !!opts.openMap,
          });
        } else if (global.SNGlobe && SNGlobe.flyNear) {
          SNGlobe.flyNear(p.lat, p.lng, opts.tier || 'city');
        }
        try {
          if (global.SNTasks && SNTasks.setPos) SNTasks.setPos(p.lat, p.lng);
          global._snLastPos = { lat: p.lat, lng: p.lng };
        } catch (e2) {}
        return { ok: true, kind: 'place', name: p.name, lat: p.lat, lng: p.lng };
      }
      // Locate self
      if (/^(me|here|home|gps|locate)$/i.test(low)) {
        if (global.SNGlobe && SNGlobe.locate) {
          var pos = await SNGlobe.locate();
          return { ok: !!pos, kind: 'locate', lat: pos && pos.lat, lng: pos && pos.lng };
        }
      }
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
    return { ok: false, error: 'not found', query: raw };
  }

  /** Pull place/body intent from user speech/text */
  function parsePlaceIntent(line) {
    var s = String(line || '').trim();
    if (!s) return null;
    var m =
      s.match(
        /^(?:go\s+to|goto|fly\s+to|fly|take\s+me\s+to|show\s+me|where\s+is|open|πήγαινε(?:\s+στην|\s+στο|\s+σε)?|δείξε(?:\s+μου)?)\s+(.+)$/i
      ) ||
      s.match(/^(?:near|around|in)\s+(.+)$/i);
    if (m) return m[1].trim();
    // Bare body names
    if (
      /^(earth|mars|moon|luna|jupiter|europa|titan|venus|mercury|saturn|neptune|uranus|pluto|cydonia)$/i.test(
        s
      )
    )
      return s;
    return null;
  }

  /** Ensure city map ready so basemap/overlays can apply (AI control path) */
  async function ensureCityMapForControl() {
    var p =
      global._snLastPos ||
      (global.SNTasks && SNTasks.pos) ||
      { lat: 36.43, lng: 28.22 };
    try {
      if (global.SNMap && !SNMap.active && SNMap.open) {
        await SNMap.open(p.lat, p.lng, { force: true });
      } else if (global.SNMap && SNMap.ensure) {
        await SNMap.ensure();
      }
    } catch (e) {}
    return p;
  }

  function parseBasemapId(s) {
    var low = String(s || '').toLowerCase();
    if (/bright|light|day|voyager/.test(low)) return 'bright';
    if (/google|hybrid|g_hybrid/.test(low)) return 'google';
    if (/traffic|roads/.test(low) && !/overlay/.test(low)) return 'traffic';
    if (/sat|satellite|imagery|earth\s*view/.test(low)) return 'satellite';
    if (/dark|night|noir|black/.test(low)) return 'dark';
    if (/^(dark|bright|satellite|google|traffic)$/.test(low.trim())) return low.trim();
    return null;
  }

  function parseOverlayId(s) {
    var low = String(s || '').toLowerCase();
    if (/windy|weather|wind/.test(low)) return 'windy';
    if (/w3w|what3words|what\s*3\s*words/.test(low)) return 'w3w';
    if (/\biss\b|station/.test(low)) return 'iss';
    if (/sats?|satellite\s*mark|constellation|leo/.test(low)) return 'sats';
    if (/planes?|aircraft|flights?/.test(low)) return 'planes';
    if (/ships?|marine|sea/.test(low)) return 'ships';
    if (/roads|traffic\s*live/.test(low)) return 'trafficLive';
    return null;
  }

  /**
   * Empowered app control — AI / free mind / speech can drive any surface:
   * basemap, overlays, layers panel, pilot, tiles, CLI commands, globe.
   */
  async function controlApp(message) {
    var line = String(message || '').trim();
    var low = line.toLowerCase().replace(/[?.!]+$/g, '').trim();
    var did = [];
    if (!low) return { handled: false, did: did, reply: '' };

    async function runCli(cmd) {
      try {
        if (global.SNCli && SNCli.run) {
          await SNCli.run(cmd);
          did.push('cli:' + cmd);
          return true;
        }
      } catch (e) {}
      return false;
    }

    // —— Basemap (dark / bright / sat / google / traffic) ——
    // Must run before bare "map" → city open
    var basemapAsk =
      parseBasemapId(low) &&
      (/\b(map|basemap|layer|mode|tiles?|carto|style|theme)\b/.test(low) ||
        /^(dark|bright|light|night|satellite|sat|google|traffic)$/.test(low) ||
        /\b(switch|set|use|change|make|turn|show|enable|want|need)\b/.test(low) ||
        /\b(dark|bright|night|satellite)\s+(map|mode|basemap|layer)\b/.test(low) ||
        /\b(map|basemap)\s+(to\s+)?(dark|bright|night|sat)/.test(low));
    if (
      basemapAsk ||
      /\b(dark|night)\s*(map|mode|basemap)?\b/.test(low) ||
      /\b(bright|light)\s*(map|mode|basemap)?\b/.test(low) ||
      /\b(satellite|sat)\s*(map|view|imagery)?\b/.test(low) ||
      /\bgoogle\s*(map|earth|hybrid)\b/.test(low) ||
      /\b(switch|change|set|use)\b.+\b(dark|bright|night|satellite|sat)\b/.test(low)
    ) {
      var bm = parseBasemapId(low) || 'dark';
      // "map" alone without style → not basemap
      if (/^(map|city map|street map)$/.test(low)) {
        /* fall through */
      } else {
        try {
          await ensureCityMapForControl();
          var ok = false;
          if (global.SNMap && SNMap.setBasemap) {
            ok = SNMap.setBasemap(bm, { user: true, log: true, prefer: true });
          }
          if (!ok) await runCli(bm === 'satellite' ? 'sat' : bm);
          did.push('basemap:' + bm);
          return {
            handled: true,
            did: did,
            reply: "Switched the map to " + bm + ".",
            skipBrand: true,
          };
        } catch (e) {
          return {
            handled: true,
            did: did,
            reply: "Couldn't switch the map — try Layers, then dark.",
          };
        }
      }
    }

    // —— Overlays on/off ——
    if (
      /\b(show|hide|toggle|enable|disable|turn\s+on|turn\s+off|add|remove)\b.+\b(iss|sats?|planes?|ships?|windy|w3w|aircraft)\b/.test(
        low
      ) ||
      /^(iss|sats?|planes?|ships?|windy|w3w)\s*(on|off)?$/.test(low) ||
      /\boverlay\b/.test(low)
    ) {
      var ov = parseOverlayId(low);
      if (ov) {
        try {
          await ensureCityMapForControl();
          if (global.SNMap && SNMap.toggleOverlay) SNMap.toggleOverlay(ov);
          else await runCli(ov);
          did.push('overlay:' + ov);
          return { handled: true, did: did, reply: 'Toggled ' + ov + ' on the map.' };
        } catch (e) {}
      }
    }

    // —— Layers panel ——
    if (/^(layers?|map layers?)$/i.test(low) || /\bopen\s+layers\b/.test(low)) {
      try {
        await ensureCityMapForControl();
        if (global.SNMap && SNMap.openLayersPanel) SNMap.openLayersPanel();
        else await runCli('layers');
        did.push('layers');
        return {
          handled: true,
          did: did,
          reply: 'Layers are open — dark, bright, satellite, planes, ships…',
        };
      } catch (e) {}
    }

    // —— Camera pilot ——
    if (/\bpilot\s+on\b|\bautopilot\s+on\b/.test(low)) {
      await runCli('pilot on');
      return { handled: true, did: did, reply: "Pilot on — the map can follow routes for you." };
    }
    if (/\bpilot\s+off\b|\bhold\s+camera\b|\bmy\s+camera\b/.test(low)) {
      await runCli('pilot off');
      return { handled: true, did: did, reply: "Pilot off — camera stays where you put it." };
    }

    // —— First order scenario (full marketplace loop) ——
    if (
      /first\s*(delivery|loop|order)|complete\s*(the\s*)?(first\s*)?(order|delivery)|run\s*first|πρώτη\s*παράδοση/i.test(
        low
      ) ||
      low === 'first' ||
      low === 'coach'
    ) {
      did.push('first_loop');
      return {
        handled: true,
        did: did,
        reply: 'Running first order · shop → menu → pay → drive → you…',
        runFirstLoop: true,
      };
    }

    // —— Mesh donate / mine ——
    if (/donate\s*on|mesh\s*on|seti|donate\s*compute|share\s*(cpu|resources)/i.test(low)) {
      try {
        if (global.SNResources && SNResources.setDonate) SNResources.setDonate(true);
        did.push('donate_on');
        return {
          handled: true,
          did: did,
          reply: 'Mesh donate ON · spare device capacity earns S.',
        };
      } catch (e) {}
    }
    if (/donate\s*off|mesh\s*off/i.test(low)) {
      try {
        if (global.SNResources && SNResources.setDonate) SNResources.setDonate(false);
        did.push('donate_off');
        return { handled: true, did: did, reply: 'Mesh donate off.' };
      } catch (e) {}
    }
    if (/^mine\s*on|start\s*mining|mining\s*on/i.test(low)) {
      try {
        if (global.SNResources && SNResources.setMining) SNResources.setMining(true);
        did.push('mine_on');
        return { handled: true, did: did, reply: 'Mining on · accept terms if asked.' };
      } catch (e) {}
    }

    // —— Tile me / menu ——
    if (/^(me|my tile|open me|my profile)$/i.test(low)) {
      try {
        if (global.SNTile && SNTile.openMe) SNTile.openMe();
        did.push('tile:me');
        return { handled: true, did: did, reply: 'Your tile in the feed.' };
      } catch (e) {}
    }

    // —— Direct CLI power verbs (short known commands) ——
    if (
      /^(task list|task map|task fit|advise|claim|deliver|rate|wallet|finance|resources|mine on|mine off|super|verify|help|shops|global|city|locate|rodos|rhodes)$/i.test(
        low
      ) ||
      /^(fly\s+\w+|go\s+to\s+\w+)/i.test(low)
    ) {
      var ran = await runCli(line);
      if (ran) {
        return {
          handled: true,
          did: did,
          reply: 'Done · ' + line.slice(0, 40),
        };
      }
    }

    // —— "run X" / "type X" / "cli X" → full CLI ——
    var cliM = low.match(/^(?:run|type|cli|execute|do)\s+(.+)$/i);
    if (cliM && cliM[1]) {
      await runCli(cliM[1].trim());
      return {
        handled: true,
        did: did,
        reply: 'CLI · ' + cliM[1].trim().slice(0, 48),
      };
    }

    return { handled: false, did: did, reply: '' };
  }

  /** Execute [[GO:x]] [[MAP:dark]] etc from edge AI; strip tags from visible text */
  async function applyActionTags(text) {
    var t = String(text || '');
    var did = [];
    var re =
      /\[\[\s*(GO|FLY|LOCATE|CITY|SHOPS|GLOBAL|EARTH|MAP|BASEMAP|LAYER|LAYERS|OVERLAY|PILOT|CLI|TILE|CMD|YOUTUBE|YT|IMAGINE|IMAGE)\s*(?::\s*([^\]]+))?\s*\]\]/gi;
    var m;
    var targets = [];
    while ((m = re.exec(t))) {
      targets.push({ op: m[1].toUpperCase(), arg: (m[2] || '').trim() });
    }
    t = t.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
    for (var i = 0; i < targets.length; i++) {
      var a = targets[i];
      try {
        if (a.op === 'LOCATE') {
          if (global.SNGlobe && SNGlobe.locate) await SNGlobe.locate();
          did.push('locate');
        } else if (a.op === 'CITY') {
          var pos = global._snLastPos || (global.SNTasks && SNTasks.pos);
          if (global.SNGlobe && SNGlobe.goToTier) SNGlobe.goToTier('city');
          if (pos && global.SNMap && SNMap.open) await SNMap.open(pos.lat, pos.lng);
          did.push('city');
        } else if (a.op === 'SHOPS') {
          var p2 = global._snLastPos || { lat: 36.43, lng: 28.22 };
          if (global.SNGlobe && SNGlobe.goToPlace)
            SNGlobe.goToPlace(p2.lat, p2.lng, { tier: 'national', body: 'earth', pulse: false });
          if (global.SNCommerce && SNCommerce.ensureSector)
            await SNCommerce.ensureSector(p2.lat, p2.lng, { openMap: true });
          did.push('shops');
        } else if (a.op === 'GLOBAL' || a.op === 'EARTH') {
          if (global.SNMap && SNMap.close) SNMap.close();
          if (global.SNGlobe && SNGlobe.setBody) SNGlobe.setBody('earth');
          if (global.SNGlobe && SNGlobe.goToTier) SNGlobe.goToTier('global');
          did.push('global');
        } else if (a.op === 'MAP' || a.op === 'BASEMAP' || a.op === 'LAYER') {
          var bm = parseBasemapId(a.arg || 'dark') || 'dark';
          await ensureCityMapForControl();
          if (global.SNMap && SNMap.setBasemap)
            SNMap.setBasemap(bm, { user: true, log: true, prefer: true });
          did.push('basemap:' + bm);
        } else if (a.op === 'LAYERS') {
          await ensureCityMapForControl();
          if (global.SNMap && SNMap.openLayersPanel) SNMap.openLayersPanel();
          did.push('layers');
        } else if (a.op === 'OVERLAY') {
          var ov = parseOverlayId(a.arg) || String(a.arg || '').toLowerCase();
          if (ov) {
            await ensureCityMapForControl();
            if (global.SNMap && SNMap.toggleOverlay) SNMap.toggleOverlay(ov);
            did.push('overlay:' + ov);
          }
        } else if (a.op === 'PILOT') {
          if (global.SNCli && SNCli.run)
            await SNCli.run(/off|0|false/i.test(a.arg) ? 'pilot off' : 'pilot on');
          did.push('pilot');
        } else if (a.op === 'TILE') {
          if (/menu/i.test(a.arg) && global.SNTile && SNTile.openMe) SNTile.openMe('menu');
          else if (global.SNTile && SNTile.openMe) SNTile.openMe();
          did.push('tile');
        } else if ((a.op === 'CLI' || a.op === 'CMD') && a.arg) {
          var cmdArg = String(a.arg || '').trim();
          var okCmd = true;
          try {
            if (global.SNLiveBridge && SNLiveBridge.cmdAllowed && !SNLiveBridge.cmdAllowed(cmdArg))
              okCmd = false;
          } catch (_) {}
          if (okCmd && global.SNCli && SNCli.run) {
            await SNCli.run(cmdArg);
            did.push('cli:' + cmdArg.slice(0, 40));
          } else if (!okCmd) {
            did.push('cli-blocked');
          }
        } else if ((a.op === 'YOUTUBE' || a.op === 'YT') && a.arg) {
          try {
            if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure('youtube');
          } catch (_) {}
          if (global.SNYoutube && SNYoutube.find) {
            await SNYoutube.find(a.arg);
            did.push('youtube:' + String(a.arg).slice(0, 40));
          }
        } else if ((a.op === 'IMAGINE' || a.op === 'IMAGE') && a.arg) {
          try {
            if (global.SNAi && SNAi.imagine) await SNAi.imagine(a.arg);
            else if (global.SNCli && SNCli.run) await SNCli.run('imagine ' + a.arg);
          } catch (_) {}
          did.push('imagine');
        } else if ((a.op === 'GO' || a.op === 'FLY') && a.arg) {
          var r = await globeGo(a.arg, { closeMap: true });
          if (r && r.ok) did.push('go:' + a.arg);
        }
      } catch (e) {}
    }
    return { text: t, did: did };
  }

  async function callEdge(message, mode, opts) {
    opts = opts || {};
    // Subscription-aware powerful path (owner paid immediate · sub within budget · free fallback)
    try {
      if (global.SNSubscription && SNSubscription.askPowerful) {
        var route = SNSubscription.routeEngine({ mode: mode });
        var pow = await SNSubscription.askPowerful(message, {
          mode: mode === 'code' ? 'coders' : mode || 'chat',
          timeoutMs: mode === 'code' || mode === 'coders' ? 28000 : 16000,
          history: hist.slice(-6).map(function (h) {
            return { role: h.role, content: String(h.content || '').slice(0, 800) };
          }),
        });
        if (pow && pow.paywall) {
          return 'Three tastes are done. Type plans. Every euro I am billed, the plan charges three.';
        }
        if (pow && pow.ok && pow.text) {
          try {
            if (pow.notice && global.SNCli && SNCli.log) SNCli.log(pow.notice, 'dim');
          } catch (_) {}
          return String(pow.text).slice(0, opts.long ? 12000 : 4000);
        }
      }
    } catch (eSub) {}

    var sub = null;
    try {
      sub = global.SNSubscription && SNSubscription.status && SNSubscription.status();
    } catch (_) {}
    var body = {
      mode: mode === 'code' ? 'coders' : mode || 'chat',
      message: String(message || '').slice(0, opts && opts.long ? 4000 : 1400),
      system: String(systemFor(mode)).slice(0, 3200),
      fast: mode !== 'code' && mode !== 'coders' && !(sub && sub.owner),
      allow_paid: true,
      gift: true,
      force_paid: true,
      owner: !!(sub && sub.owner),
      subscription: sub || undefined,
    };
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var ms = mode === 'code' || mode === 'coders' ? 28000 : 12000;
    var t = setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (e) {}
    }, ms);
    try {
      var urls = [];
      try {
        var host = location.hostname || '';
        if (host === 'localhost' || host === '127.0.0.1' || /astranov\.eu$/i.test(host))
          urls.push(location.origin + '/api/ai');
      } catch (_) {}
      urls.push(aicycleUrl());
      var text = null;
      var j = {};
      for (var ui = 0; ui < urls.length && !text; ui++) {
        try {
          var r = await fetch(urls[ui], {
            method: 'POST',
            headers: await headers(),
            body: JSON.stringify(body),
            signal: ctrl ? ctrl.signal : undefined,
          });
          j = await r.json().catch(function () {
            return {};
          });
          text = String(j.text || j.response || j.message || j.content || '').trim();
          if (text && /try again|no model|warming|unavailable|error/i.test(text)) text = null;
        } catch (_) {}
      }
      if (!text) return null;
      try {
        if (global.SNSubscription && SNSubscription.recordTurn)
          SNSubscription.recordTurn(message, text, { via: j.via, paid: j.paid });
        if ((j.paid || j.paid_fallback) && global.SNSubscription && SNSubscription.recordSpend) {
          SNSubscription.recordSpend(
            SNSubscription.estimateApiEur(j.usage || j.meter || {}),
            { via: j.via }
          );
        }
      } catch (_) {}
      return text.slice(0, opts && opts.long ? 12000 : 4000);
    } catch (e) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Do real SpaceNet work for the user. Returns { did, reply }.
   * Globe navigation uses globeGo — never nested freeform AI.
   */
  async function actLocal(message) {
    var line = String(message || '').trim();
    var low = line.toLowerCase();
    var did = [];
    var reply = '';

    /** Safe CLI for known short commands only (not freeform) */
    async function runCli(cmd) {
      try {
        if (global.SNCli && SNCli.run) {
          await SNCli.run(cmd);
          did.push(cmd);
          return true;
        }
      } catch (e) {}
      return false;
    }

    if (!line) {
      return {
        did: did,
        reply: "I'm here — English first. Greek fully understood. Any language welcome. What do you need?",
      };
    }

    // Dialect normalize FIRST — Greek · Greeklish · Archangelos · Cretan · ancient
    try {
      if (global.SNGreeklish && SNGreeklish.toEnglishCommand) {
        var engEarly = SNGreeklish.toEnglishCommand(line);
        if (engEarly && engEarly !== line.toLowerCase()) {
          line = engEarly;
          low = line.toLowerCase();
        }
      }
      if (global.ArcangeloDialect && ArcangeloDialect.normalizeForRouting) {
        var normEarly = ArcangeloDialect.normalizeForRouting(line);
        if (normEarly) {
          line = normEarly;
          low = line.toLowerCase();
        }
      }
      if (global.ArcangeloDialect && ArcangeloDialect.expandIntent) {
        var exI = ArcangeloDialect.expandIntent(message);
        if (exI && exI.food && !/order|pizza|pitogyra|food/.test(low)) {
          line = 'order me ' + (exI.food === 'beer' ? 'beer' : exI.food);
          low = line.toLowerCase();
        }
        if (exI && exI.locate) {
          line = 'locate me';
          low = line;
        }
        if (exI && exI.pilot) {
          line = 'pilot home';
          low = line;
        }
      }
    } catch (eDialEarly) {}

    // ── SPARTAN INTELLIGENCE: one word → full chain for every domain ──
    try {
      if (global.SNSpartan && SNSpartan.expand) {
        var sp = SNSpartan.expand(line);
        if (sp && sp.spartan) {
          // Meta / help only
          if (sp.replyOnly) {
            return {
              did: did.concat(['spartan:' + sp.domain]),
              reply: sp.replySeed || SNSpartan.LAW.creed,
              skipBrand: true,
            };
          }
          if (sp.cli) {
            return {
              did: did.concat(['spartan:' + sp.domain, 'cli:' + sp.cli]),
              reply: sp.replySeed || 'On it.',
              runCliCmd: sp.cli,
              skipBrand: true,
            };
          }
          if (sp.runDriveOn) {
            return {
              did: did.concat(['spartan:drive']),
              reply: sp.replySeed || 'Courier online…',
              runDriveOn: true,
              skipBrand: true,
            };
          }
          if (sp.runDeliver) {
            return {
              did: did.concat(['spartan:deliver']),
              reply: sp.replySeed || 'Completing…',
              runDeliver: true,
              skipBrand: true,
            };
          }
          if (sp.runYoutube || sp.domain === 'youtube') {
            try {
              if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure('youtube');
            } catch (_ye) {}
            var yq = sp.youtubeQuery || '';
            if (!yq && global.SNYoutube && SNYoutube.queryFromText) {
              yq = SNYoutube.queryFromText(line) || '';
            }
            if (yq && global.SNYoutube && SNYoutube.find) {
              await SNYoutube.find(yq);
              return {
                did: did.concat(['spartan:youtube']),
                reply: '▶ ' + String(yq).slice(0, 48),
                skipBrand: true,
              };
            }
            return {
              did: did.concat(['spartan:youtube']),
              reply: sp.replySeed || 'youtube <query> · yt cats · watch <url>',
              skipBrand: true,
            };
          }
          if (sp.runFood || sp.domain === 'food') {
            var fi =
              sp.foodIntent ||
              (global.SNMarket && SNMarket.parseFoodIntent && SNMarket.parseFoodIntent(line)) || {
                food: sp.food || 'food',
                overpass: (sp.food || 'food') + ' restaurant',
                raw: line,
                autoOrder: true,
                lazyJudge: true,
                browseOnly: false,
              };
            fi.autoOrder = true;
            fi.lazyJudge = true;
            fi.browseOnly = false;
            fi.spartan = true;
            return {
              did: did.concat(['spartan:food', 'food_intent:' + (fi.food || 'food')]),
              reply: sp.replySeed || ('Spartan · ' + (fi.food || 'food') + '…'),
              runFoodIntent: fi,
              skipBrand: true,
            };
          }
          if (sp.mission && sp.mission.steps && sp.mission.steps.length) {
            return {
              did: did.concat(['spartan:mission', 'mission:' + sp.mission.steps.join('+')]),
              reply: sp.replySeed || ('Spartan · ' + sp.mission.steps.join(' → ')),
              runMission: sp.mission,
              skipBrand: true,
            };
          }
        }
      }
    } catch (_sp) {}

    // —— Chat / language (hard) — must answer English greetings ——
    if (
      /^(hello|hi|hey|yo|hiya|good\s*(morning|afternoon|evening)|greetings)[\s!.?]*$/i.test(line) ||
      /^(γεια|γεια σου|καλημέρα|καλησπέρα|χαίρετε|ela re|έλα ρε)[\s!.?]*$/i.test(line)
    ) {
      var elGreet = /[α-ωΑ-Ω]/.test(line) || /ela re|έλα/i.test(line);
      return {
        did: did.concat(['greet']),
        reply: elGreet
          ? 'Γεια — Astranov εδώ. Locate, order, pilot, ή αγγλικά.'
          : "Hey — Astranov here. English is fine. What do you need?",
        skipBrand: true,
      };
    }
    if (
      /\b(how are you|how r you|how's it going|hows it going)\b/i.test(low) ||
      /\b(τι κάνεις|τι κανεις|πώς είσαι|πως εισαι)\b/i.test(low)
    ) {
      return {
        did: did.concat(['chat']),
        reply: "I'm solid — full internet OS online. Map, YouTube, pilot, order, search — what do you need?",
        skipBrand: true,
      };
    }
    if (
      /\b(speak english|talk english|english please|in english|can you (speak|talk) english|do you (speak|understand) english)\b/i.test(
        low
      )
    ) {
      return {
        did: did.concat(['lang:en']),
        reply: 'Yes — full English. Locate, YouTube, shops, dark map, pilot, code, search — say anything.',
        skipBrand: true,
      };
    }
    if (
      /\b(speak greek|talk greek|μίλα ελληνικ|μιλάς ελληνικ|καταλαβαίνεις ελληνικ|ελληνικά παρακαλώ)\b/i.test(
        low
      )
    ) {
      return {
        did: did.concat(['lang:el']),
        reply: 'Ναι — ελληνικά, Greeklish, αρχαία χροιά. Πες εντολή καθαρά.',
        skipBrand: true,
      };
    }
    if (/^(thanks|thank you|thx|ty|ευχαριστώ|ευχαριστω)[\s!.?]*$/i.test(low)) {
      return {
        did: did.concat(['thanks']),
        reply: 'Anytime. Cancel if something sticks.',
        skipBrand: true,
      };
    }

    // —— Vendor carousel: NEXT / PREV / SHOW ALL (priority after listen) ——
    if (/^(next|επόμεν|επομεν|άλλο|αλλο|another|next\s*one|n)\b/i.test(low) || low === 'n' || low === '>>') {
      var nx = presentNext();
      return { did: did.concat(nx.did || []), reply: nx.reply, skipBrand: true };
    }
    if (/^(prev|previous|back|προηγ|πίσω|πριν)\b/i.test(low) || low === 'p' || low === '<<') {
      var pv = presentPrev();
      return { did: did.concat(pv.did || []), reply: pv.reply, skipBrand: true };
    }
    if (
      /^(show\s*all|all|όλα|ολα|όλοι|ολοι|show\s*all\s*vendors|list\s*all)\b/i.test(low) ||
      low === 'show all'
    ) {
      var al = presentAll();
      return { did: did.concat(al.did || []), reply: al.reply, skipBrand: true };
    }

    // —— Bridge status (before identity so "grok bridge" is not deflected) ——
    if (
      /\bbridge\b/.test(low) ||
      /rockbridge|rock\s*bridge|coding\s*agent|grok\s*build/i.test(low)
    ) {
      try {
        if (global.SNCli && SNCli.run) {
          await SNCli.run(/\btest\b/.test(low) ? 'bridge test' : 'bridge status');
        }
      } catch (_) {}
      return {
        did: did.concat(['bridge']),
        reply:
          'Coding bridge is the channel from this CLI to the desktop agent. Say bridge test · or agent <fix text>.',
        skipBrand: true,
      };
    }

    // —— Direct identity (never free-mind fuzzy junk) ——
    if (/\bgrok\b|\bxai\b|\bx\.?ai\b/i.test(low) && !/\bbridge\b/.test(low)) {
      return {
        did: did.concat(['identity:grok']),
        reply: "I'm Astranov Mind on this app. For code fixes use: agent <what to fix> or bridge test.",
        skipBrand: true,
      };
    }
    if (
      /who\s+are\s+you|what\s+are\s+you|your\s+name|are\s+you\s+astranov|τι\s+είσαι|ποιος\s+είσαι|τι\s+εισαι|ποιος\s+εισαι/i.test(
        low
      )
    ) {
      return {
        did: did.concat(['identity:who']),
        reply:
          "I'm Astranov. Ómma is the eye that looks at the live site before I speak. Map, order, search — English or Greek. What do you need?",
        skipBrand: true,
      };
    }

    // —— YouTube (natural language + CLI power) ——
    try {
      if (global.SNYoutube && SNYoutube.wantsYoutube && SNYoutube.wantsYoutube(line)) {
        try {
          if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure('youtube');
        } catch (_ye) {}
        var yq =
          (global.SNYoutube.queryFromText && SNYoutube.queryFromText(line)) ||
          line.replace(/^(youtube|yt|watch)\s*/i, '').trim() ||
          line;
        if (global.SNYoutube.find) {
          await SNYoutube.find(yq);
          return {
            did: did.concat(['youtube']),
            reply: 'Opening YouTube · ' + String(yq).slice(0, 48),
            skipBrand: true,
          };
        }
      }
    } catch (_yt) {}

    // —— App control FIRST (basemap dark/bright, overlays, layers, CLI power) ——
    // Before city/map heuristics so "dark map" is not mistaken for street map only
    try {
      var appCtrl = await controlApp(line);
      if (appCtrl && appCtrl.handled) {
        return {
          did: did.concat(appCtrl.did || []),
          reply: appCtrl.reply || 'Done.',
          skipBrand: !!appCtrl.skipBrand,
          runFirstLoop: !!appCtrl.runFirstLoop,
          runFoodIntent: appCtrl.runFoodIntent || null,
        };
      }
    } catch (eCtrl) {}

    // Dialect normalize (Greeklish / Archangelos) — second pass if earlier skipped
    try {
      if (global.ArcangeloDialect && ArcangeloDialect.normalizeForRouting) {
        var normed = ArcangeloDialect.normalizeForRouting(line);
        if (normed) {
          line = normed;
          low = line.toLowerCase();
        }
      }
    } catch (eDial) {}

        // Escape pizza / order pause — always available
    if (
      /\b(cancel|stop order|clear order|never mind|forget (it|the order)|abort|unstick)\b/i.test(low)
    ) {
      try {
        if (global.SNMarket && SNMarket.clearPending) SNMarket.clearPending();
      } catch (eC) {}
      return {
        did: did.concat(['cancel']),
        reply: "Cleared. Astranov Mind is free — what do you want?",
        skipBrand: true,
      };
    }

    // Multi-user coordination (hard intent before food / fuzzy)
    if (global.SNTasks && SNTasks.isCoordIntent && SNTasks.isCoordIntent(line)) {
      try {
        var planRes =
          /^assign\b/i.test(low) && SNTasks.assignPlan
            ? SNTasks.assignPlan(line)
            : SNTasks.createPlan
              ? SNTasks.createPlan(line)
              : null;
        if (planRes && planRes.ok) {
          var nKids = (planRes.tasks && planRes.tasks.length) || 0;
          var human =
            'Coordinated ' +
            nKids +
            ' tasks' +
            (planRes.plan && planRes.plan.food ? ' for ' + planRes.plan.food : '') +
            (planRes.plan && planRes.plan.party ? ' ×' + planRes.plan.party : '') +
            '. ' +
            (planRes.reply || 'See plan status · claim · task map.');
          // Keep CLI quiet — one summary; details on plan status
          showOnGlobe(
            'Plan · ' +
              nKids +
              ' tasks' +
              (planRes.plan && planRes.plan.food ? ' · ' + planRes.plan.food : '')
          );
          try {
            if (global.SNMap && SNMap.active) {
              if (SNMap.showTasks) SNMap.showTasks();
              if (SNMap.showProfiles) SNMap.showProfiles();
            }
          } catch (eM) {}
          return {
            did: did.concat(['coord', 'plan:' + ((planRes.plan && planRes.plan.id) || '')]),
            reply: human,
            skipBrand: true,
          };
        }
      } catch (eCoord) {
        return {
          did: did.concat(['coord_fail']),
          reply: 'Could not coordinate that — try: coord need driver and vendor for pizza for 3',
          skipBrand: true,
        };
      }
    }

    // Telemachos drone pilot
    if (global.SNTelemachos && SNTelemachos.wantsCmd && SNTelemachos.wantsCmd(line)) {
      try {
        var pr = await SNTelemachos.cli(line);
        return {
          did: did.concat(['telemachos']),
          reply:
            (pr && pr.tray
              ? 'Telemachos flying tray: ' + pr.tray
              : 'Telemachos (Τηλέμαχος) ready — pilot home or deliver pitogyra.'),
          skipBrand: true,
        };
      } catch (eP) {}
    }

    // Archangelos home
    if (/\b(archangelos|arcangelo|αρχάγγελ)\b/i.test(low) && /\b(fly|go|pame|πάμε|home|χωριό)\b/i.test(low)) {
      try {
        if (global.SNTelemachos && SNTelemachos.flyHome) await SNTelemachos.flyHome();
        else if (global.SNGlobe && SNGlobe.goToPlace)
          SNGlobe.goToPlace(36.215, 28.125, { tier: 'national', label: 'Archangelos' });
      } catch (eA) {}
      return {
        did: did.concat(['go:archangelos']),
        reply: 'Flying to Archangelos — village home.',
        skipBrand: true,
      };
    }

    // —— Full multi-step missions (locate→shops→order→drive→deliver) ——
    try {
      if (global.SNTaskRunner && SNTaskRunner.planFromText) {
        var missionPlan = SNTaskRunner.planFromText(line);
        // Only intercept multi-step or explicit full loops — single food still uses food intent
        if (
          missionPlan &&
          missionPlan.steps &&
          (missionPlan.steps.length >= 2 ||
            missionPlan.steps.indexOf('deliver') >= 0 ||
            missionPlan.steps.indexOf('drive') >= 0 ||
            /first delivery|full (order|loop|delivery)|end to end|shop to door/i.test(low))
        ) {
          return {
            did: did.concat(['mission:' + missionPlan.steps.join('+')]),
            reply: 'On it — ' + missionPlan.steps.join(' → ') + '…',
            runMission: missionPlan,
            skipBrand: true,
          };
        }
      }
    } catch (_mp) {}

    // Explicit delivery verbs for AI
    if (/^(drive on|go driver|i am driver|i'?m a driver)\b/i.test(low)) {
      return { did: did.concat(['drive_on']), reply: 'Going driver online…', runDriveOn: true, skipBrand: true };
    }
    if (/^(deliver me|complete delivery|mark delivered|finish delivery)\b/i.test(low)) {
      return { did: did.concat(['deliver']), reply: 'Completing delivery…', runDeliver: true, skipBrand: true };
    }
    if (
      /^(fill shops|google shops|shops near me|find shops|crawl shops|scan shops|populate shops)\b/i.test(
        low
      ) ||
      /\b(find|search|crawl)\b.*\b(shops|restaurants|vendors|pizza places)\b/i.test(low)
    ) {
      return {
        did: did.concat(['fill_shops']),
        reply: 'Crawling internet + maps for real shops · phone · hours · menus…',
        runMission: { steps: ['locate', 'shops'], foodLine: line, autoOrder: false },
        skipBrand: true,
      };
    }

    // Family call
    if (/^(aksaki|αξάκι|aksas|αξάς|ela\s+re|έλα\s+ρε)\s*[!.?]*$/i.test(low)) {
      return {
        did: did.concat(['aksaki']),
        reply: 'Ναι αξάκι — Astranov Mind εδώ. Πιτογύρα, pilot, map, ό,τι θες.',
        skipBrand: true,
      };
    }

    // Food: only when parseFoodIntent says so (strict). Browse vs full order.
    if (global.SNMarket && SNMarket.parseFoodIntent && SNMarket.fulfillFoodIntent) {
      var foodIntent = SNMarket.parseFoodIntent(line);
      if (foodIntent) {
        return {
          did: did.concat(['food_intent:' + foodIntent.food]),
          reply:
            foodIntent.autoOrder || foodIntent.lazyJudge
              ? "On it — finding you, then ordering " + foodIntent.food + "."
              : "Looking for " + foodIntent.food + " near you…",
          runFoodIntent: foodIntent,
        };
      }
    }

    // Lazy full pizza ONLY with explicit order+judge language (not every "first")
    if (
      /\border\s+me\s+(a\s+)?pizza\b/i.test(low) &&
      /\b(judge|whatever|type|size|delivery|what\s+time)\b/i.test(low)
    ) {
      if (global.SNMarket && SNMarket.parseFoodIntent) {
        var fi2 =
          SNMarket.parseFoodIntent(line) ||
          SNMarket.parseFoodIntent(
            'ORDER ME A PIZZA YOU JUDGE THE TYPE SIZE VENDOR DELIVERY GUY AND WHATEVER ELSE AND TELL ME WHAT TIME I EAT'
          );
        if (fi2) {
          fi2.autoOrder = true;
          fi2.lazyJudge = true;
          fi2.browseOnly = false;
          fi2.raw = line;
          return {
            did: did.concat(['lazy_pizza']),
            reply: "Alright — full lazy pizza order. Finding you now.",
            runFoodIntent: fi2,
          };
        }
      }
    }

    // Vodi restoration is a real job, not chat
    if (
      /\b(vodi|βόδι|βιολογικ|viologik)\b/.test(low) ||
      (/\b(pollution|sewage|λύματα|ρύπανσ)\b/.test(low) && /\b(rhodes|rodos|ρόδο)\b/.test(low))
    ) {
      return {
        did: did.concat(['vodi']),
        reply: 'Opening Vodi — the island plant and the sea.',
        runCliCmd: 'vodi',
        skipBrand: true,
      };
    }

    // Crawlers paint Earth / cities / space — I do this, I do not chat it
    if (
      global.SNSearch &&
      (SNSearch.looksVisual
        ? SNSearch.looksVisual(line)
        : /^(search|find|show\s+me|zoom\s+to|visualize|look\s+at|take\s+me\s+to|where\s+is|crawl)\b/i.test(
            low
          ))
    ) {
      return {
        did: did.concat(['search']),
        reply: 'Looking on Earth…',
        runSearch: line,
        skipBrand: true,
      };
    }

    // Marketplace coach — explicit coach commands only
    if (global.SNMarket && SNMarket.handleChat) {
      var mk = SNMarket.handleChat(line);
      if (mk && mk.handled) {
        if (mk.async && mk.action === 'runFirstLoop') {
          return {
            did: did.concat(['first_loop']),
            reply: "Running the shop-to-door loop…",
            runFirstLoop: true,
          };
        }
        if (mk.async && mk.action === 'confirmLocationAndOrder') {
          return {
            did: did.concat(['loc_confirm']),
            reply: "Checking your pin…",
            confirmLocationAndOrder: true,
            confirmLine: mk.line || message,
          };
        }
        try {
          if (global.SNUsage && SNUsage.track) SNUsage.track('ai_market', { did: mk.did });
        } catch (e) {}
        return { did: (mk.did || []).concat(did), reply: mk.reply || 'Done.' };
      }
    }

    // Direct task verbs → execute
    if (
      /^(hi|hello|hey|γεια|καλησπέρα|καλημέρα|yo)\b/.test(low) ||
      low === 'ai' ||
      low === 'spacenet' ||
      low === 'astronov' ||
      low === 'astranov'
    ) {
      reply = "Hey. I'm Astranov — what do you need?";
      showOnGlobe(reply);
      return { did: did, reply: reply, skipBrand: true };
    }

    // Bridge pain → handoff for coding agent
    if (/\b(broken|bug|fix this|handoff|painful|doesn'?t work|άχρηστο|χάλια|φτιάξε)\b/i.test(low) && line.length > 8) {
      try {
        if (global.SNUsage && SNUsage.handoff) SNUsage.handoff(line, { source: 'ai_act' });
        did.push('handoff');
      } catch (e) {}
      reply =
        "Got it — I logged that so it can get fixed. Tell me what broke in plain words if you want.";
      return { did: did, reply: reply };
    }

    // —— Globe follows AI (priority navigation) ——
    if (/\b(locate|where am i|gps|find me|βρες\s+με)\b/.test(low)) {
      try {
        if (global.SNTaskRunner && SNTaskRunner.locate) {
          var locR = await SNTaskRunner.locate();
          did.push('locate');
          reply = locR && locR.ok
            ? "I've got you on the map. What next — shops, YouTube, pilot, or something else?"
            : (locR && locR.error) || "Couldn't get location — allow GPS.";
        } else if (global.SNGlobe && SNGlobe.locate) {
          var loc = await SNGlobe.locate();
          did.push('locate');
          reply = loc
            ? "I've got you on the map" +
              (loc.fallback ? " (rough GPS — say yes if that's right)" : '') +
              ". What next — shops, YouTube, pilot, or something else?"
            : "Couldn't get your location — try again or allow location access.";
        } else {
          await runCli('locate');
          reply = "Finding you on the map…";
        }
      } catch (e) {
        reply = "Location failed: " + (e.message || e);
      }
      return { did: did, reply: reply };
    }

    var placeIntent = parsePlaceIntent(line);
    // Only navigate on EXPLICIT travel verbs — never because a city word appears in chat
    if (
      placeIntent ||
      /^(go\s+to|goto|fly(\s+to)?|take\s+me(\s+to)?|show\s+me)\b/.test(low) ||
      /^(earth|mars|moon|luna|jupiter|europa|titan|venus|mercury|saturn|neptune|uranus|pluto|cydonia)$/i.test(
        low
      )
    ) {
      var dest = placeIntent;
      if (!dest) {
        if (/vault/.test(low)) dest = 'garage';
        else if (/thesis|garage/.test(low)) dest = 'garage rhodes';
        else if (/cydonia/.test(low)) dest = 'cydonia';
        else if (/mars/.test(low)) dest = 'mars';
        else if (/moon|luna/.test(low)) dest = 'moon';
        else if (/jupiter/.test(low)) dest = 'jupiter';
        else if (/europa/.test(low)) dest = 'europa';
        else if (/titan/.test(low)) dest = 'titan';
        else if (/pluto/.test(low)) dest = 'pluto';
        else if (/saturn/.test(low)) dest = 'saturn';
        else if (/venus/.test(low)) dest = 'venus';
        else if (/mercury/.test(low)) dest = 'mercury';
        else if (/neptune/.test(low)) dest = 'neptune';
        else dest = line.replace(/^(go\s+to|fly\s+to|fly|take\s+me\s+to)\s+/i, '').trim();
      }
      if (/garage|thesis|rhodes\s*garage/i.test(dest)) {
        if (global.SNGlobe && SNGlobe.setBody) SNGlobe.setBody('earth');
        if (global.SNGlobe && SNGlobe.goToPlace) {
          SNGlobe.goToPlace(36.44125, 28.22255, {
            tier: 'national',
            label: 'Garage Rhodes',
            body: 'earth',
            pulse: false,
          });
          did.push('go:garage');
          reply = "Taking you to the Rhodes garage.";
          return { did: did, reply: reply };
        }
      }
      var nav = await globeGo(dest, { closeMap: true, tier: 'national' });
      if (nav && nav.ok) {
        did.push('go:' + (nav.id || nav.name || dest));
        reply =
          nav.kind === 'body'
            ? "Switched the view to " + (nav.id || dest) + "."
            : "Flying you to " + (nav.name || dest) + ".";
        return { did: did, reply: reply };
      }
      reply = "Couldn't find “" + dest + "”. Try a city name, or say locate.";
      return { did: did, reply: reply };
    }

    if (
      /^(shops|vendors|stores|fill shops|google shops|show shops|μαγαζια|μαγαζιά)$/i.test(low) ||
      /\b(fill|show|find|near|open|crawl|scan)\b.{0,24}\b(shops|vendors|restaurants|μαγαζ)/i.test(low) ||
      (/\b(shops|vendors|restaurants|φαγητ|εστιατόρ|μαγαζ)\b/.test(low) &&
        !/\b(stock\s*market|market\s*research|marketing|black\s*market|what is the market)\b/i.test(low) &&
        !/\bmarket\b/.test(low)) ||
      /^find\s+(food|pizza|coffee)\b/.test(low)
    ) {
      try {
        var near = await loadVendorsNear('shops');
        setSuggestList(near, { query: 'shops', idx: 0 });
        if (near.length) {
          var sh = presentVendor(0);
          return {
            did: did.concat(sh.did || ['shops']),
            reply: sh.reply,
            skipBrand: true,
          };
        }
        did.push('shops');
        reply = "No shops here yet — fly to a city first, then say shops again.";
      } catch (e) {
        await runCli('shops');
        reply = "Shop scan failed — try once more.";
      }
      return { did: did, reply: reply };
    }

    // City / street map only when clearly about surface map (not basemap style)
    if (
      (/\b(city map|street map|open (the )?map|show (the )?map)\b/.test(low) ||
        /^(city|map)$/i.test(low)) &&
      !/\b(dark|bright|sat|satellite|google|basemap|layer)\b/.test(low)
    ) {
      var cp = global._snLastPos || (global.SNTasks && SNTasks.pos) || { lat: 36.43, lng: 28.22 };
      try {
        if (global.SNGlobe && SNGlobe.goToPlace) {
          SNGlobe.goToPlace(cp.lat, cp.lng, { tier: 'city', body: 'earth', pulse: false, openMap: true });
        } else {
          if (global.SNGlobe && SNGlobe.goToTier) SNGlobe.goToTier('city');
          if (global.SNMap && SNMap.open) await SNMap.open(cp.lat, cp.lng);
        }
        did.push('city');
      } catch (e) {
        await runCli('city');
      }
      reply = "Opening the street map here. Say global when you want the full Earth again.";
      return { did: did, reply: reply };
    }

    if (/\b(earth|globe|global|back to earth)\b/.test(low) || low === 'home') {
      try {
        if (global.SNMap && SNMap.close) SNMap.close();
        if (global.SNGlobe && SNGlobe.setBody) SNGlobe.setBody('earth');
        if (global.SNGlobe && SNGlobe.goToTier) SNGlobe.goToTier('global');
        did.push('global');
      } catch (e) {
        await runCli('global');
      }
      reply = "Back to the full Earth view.";
      return { did: did, reply: reply };
    }

    if (/^date\b|\bcoffee\s*date\b|\bdating\b|available\s*woman|meet\s*(a\s*)?woman/.test(low)) {
      if (global.SNMarket && SNMarket.fulfillDatingIntent) {
        try {
          var dr = await SNMarket.fulfillDatingIntent(line);
          did.push('dating_fulfill');
          reply = (dr && dr.reply) || 'Dating request path ran.';
        } catch (e) {
          reply = 'Dating path failed · ' + (e.message || e);
        }
      } else if (global.SNTasks && SNTasks.create) {
        var td = SNTasks.create(line);
        did.push('task:' + (td && td.id));
        reply = 'Date task open: ' + (td && td.title) + '. Claim from the map when ready.';
      } else {
        reply = 'Date flow — try: date coffee';
      }
      return { did: did, reply: reply };
    }

    if (/^deliver|\bdelivery\b|\bpackage\b|food\s*order/.test(low)) {
      if (global.SNTasks && SNTasks.create) {
        var te = SNTasks.create(line.indexOf('deliver') >= 0 ? line : 'delivery ' + line);
        did.push('task:' + (te && te.id));
        reply = 'Delivery open: ' + (te && te.title) + '. Drivers can claim · fees in S.';
      } else reply = 'Delivery path ready — type deliver food.';
      return { did: did, reply: reply };
    }

    if (/^job\b|^gig\b|barman|bartender|cleaner|nanny|waiter|tutor|looking\s+for\s+work|need\s+a\b/.test(low)) {
      if (global.SNMarket && SNMarket.fulfillWorkIntent) {
        try {
          var wr = await SNMarket.fulfillWorkIntent(line);
          did.push('work_fulfill');
          reply = (wr && wr.reply) || 'Work offer path ran.';
        } catch (e) {
          reply = 'Work path failed · ' + (e.message || e);
        }
      } else if (global.SNTasks && SNTasks.create) {
        var tj = SNTasks.create(line);
        did.push('task:' + (tj && tj.id));
        reply = 'Job posted: ' + (tj && tj.title) + '. Visible on map · task list.';
      } else reply = 'Try: job barman 3h';
      return { did: did, reply: reply };
    }

    if (/\b(rate|wallet|money|spacenets|\bs\b currency)\b/.test(low)) {
      await runCli('rate');
      reply = "We use S as the main money here. Fiat and crypto are just secondary quotes.";
      return { did: did, reply: reply };
    }

    if (/\b(resources|mine|donate|performance)\b/.test(low)) {
      await runCli('resources');
      reply = "If you turn donation on, spare device power can earn you S while you idle.";
      return { did: did, reply: reply };
    }

        if (/\b(help|what can you do|commands|βοήθεια|βοηθεια)\b/.test(low) && line.length < 48) {
      reply =
        "Full internet OS: locate · YouTube · shops · order · dark map · pilot · search · code · coord. English or Greek. Stuck? cancel.";
      return { did: did, reply: reply, skipBrand: true };
    }

    // NEVER geocode free text — that flew users to random countries.
    // Places only via explicit go/fly/take me (parsePlaceIntent above).

    reply =
      "I'm with you — full internet OS. Try: locate · youtube <query> · shops · dark map · pilot · search · code. Or cancel if stuck.";
    return { did: did, reply: reply, needsEdge: false };
  }

  function isHands(local) {
    if (!local) return false;
    if (
      local.runSearch ||
      local.runFoodIntent ||
      local.runMission ||
      local.runFirstLoop ||
      local.confirmLocationAndOrder ||
      local.runCliCmd ||
      local.runDriveOn ||
      local.runDeliver
    )
      return true;
    var d = (local.did || []).join(' ');
    return /\b(locate|go:|shops|youtube|food|mission|search|dating|work|city|global|vendor|fill_shops|drive|deliver|coord|telemachos|vodi|suggest)\b/.test(
      d
    );
  }

  async function fulfillHands(local, msg) {
    var text = local && local.reply ? local.reply : null;

    if (local.runSearch && global.SNSearch && SNSearch.crawl) {
      try {
        var crawled = await SNSearch.crawl(local.runSearch, {
          visualize: true,
          fly: true,
          openMap: true,
          quiet: false,
        });
        try {
          if (SNSearch.report && global.SNCli && SNCli.log) SNSearch.report(crawled, SNCli.log);
        } catch (_) {}
        var focus = crawled && (crawled.focus || (crawled.places && crawled.places[0]));
        if (crawled && crawled.body && crawled.body !== 'earth') {
          text = 'On ' + crawled.body + (crawled.wiki && crawled.wiki.title ? ' · ' + crawled.wiki.title : '.');
        } else if (focus && focus.name) {
          text =
            String(focus.name).slice(0, 56) +
            (crawled.nearby && crawled.nearby.length ? ' · ' + crawled.nearby.length + ' pins. Tap one.' : ' · marked.');
        } else {
          text = text || 'Crawlers found no pin. Try a place name.';
        }
      } catch (eS) {
        text = 'Search failed · ' + (eS && eS.message ? eS.message : eS);
      }
      text = brandReply(text);
      pushHist('assistant', text);
      showOnGlobe(text);
      say(text, 'ok');
      return text;
    }

    if (local.runFirstLoop && global.SNMarket && SNMarket.runFirstLoop) {
      try {
        var fr = await SNMarket.runFirstLoop({});
        text =
          fr && fr.ok
            ? 'First delivery done. You listed, ordered, drove, and delivered.'
            : 'First loop partial. Try: list shop · order me · drive on · deliver me';
      } catch (e) {
        text = 'First loop failed.';
      }
    } else if (local.confirmLocationAndOrder && global.SNMarket && SNMarket.confirmLocationAndOrder) {
      try {
        var conf = await SNMarket.confirmLocationAndOrder(local.confirmLine || msg);
        text = conf.eatLine || conf.reply || conf.summary || (conf.ok ? 'Order continuing' : 'Stopped');
      } catch (_) {
        text = 'Location confirm failed · tap locate first.';
      }
    } else if (local.runCliCmd && global.SNCli && SNCli.run) {
      try {
        await SNCli.run(local.runCliCmd);
        text = local.reply || 'Done.';
      } catch (eC) {
        text = 'Failed · ' + (eC && eC.message ? eC.message : eC);
      }
    } else if (local.runMission && global.SNTaskRunner && SNTaskRunner.runPlan) {
      try {
        var miss = await SNTaskRunner.runPlan(local.runMission, {
          testMode: /\btest\b/i.test(String(msg || '')),
          softHome: false,
        });
        text = (miss && (miss.reply || miss.summary)) || local.reply || 'Mission done';
      } catch (eM) {
        text = 'Mission failed.';
      }
    } else if (local.runDriveOn && global.SNTaskRunner) {
      try {
        var dr = await SNTaskRunner.driveOn();
        text = dr && dr.ok ? 'You are online as courier.' : (dr && dr.error) || 'Drive on failed';
      } catch (_) {
        text = 'Drive on failed';
      }
    } else if (local.runDeliver && global.SNTaskRunner) {
      try {
        var dl = await SNTaskRunner.deliver();
        text = dl && dl.ok ? 'Delivery complete.' : (dl && dl.error) || 'Deliver failed';
      } catch (_) {
        text = 'Deliver failed';
      }
    } else if (local.runFoodIntent && global.SNMarket && SNMarket.fulfillFoodIntent) {
      try {
        var wantOrder =
          local.runFoodIntent.browseOnly !== true &&
          (local.runFoodIntent.autoOrder === true || local.runFoodIntent.lazyJudge === true);
        var foodR = await SNMarket.fulfillFoodIntent(local.runFoodIntent, {
          autoOrder: wantOrder,
          quiet: false,
        });
        text =
          (foodR && (foodR.eatLine || foodR.reply || foodR.summary)) ||
          local.reply ||
          'Food path ran.';
      } catch (eF) {
        text = 'Order failed · ' + (eF && eF.message ? eF.message : eF);
      }
    }

    text = brandReply(text || local.reply || 'Done.');
    pushHist('assistant', text);
    showOnGlobe(text);
    say(text, 'ok');
    return text;
  }

  async function doJob(message, opts) {
    opts = opts || {};
    opts.jobOnly = true;
    return ask(message, opts);
  }

  async function ask(message, opts) {
    opts = opts || {};
    var msg = String(message || '').trim();
    if (!msg) return null;
    // Stale busy lock kills all interaction — force-clear after 6s
    if (busy) {
      if (!ask._busySince) ask._busySince = Date.now();
      if (Date.now() - ask._busySince < 6000) {
        return 'Still working — try cancel or wait a second…';
      }
      busy = false;
      clearThinkGfx();
    }
    ask._busySince = Date.now();
    busy = true;

    var timedOut = false;
    var watchdog = setTimeout(function () {
      timedOut = true;
      busy = false;
      clearThinkGfx();
    }, 20000);

    try {
      // HANDS FIRST — do the job, then talk. Chat never steals locate / search / pizza / fly.
      var local = await actLocal(msg);
      if (isHands(local)) {
        var hands = await fulfillHands(local, msg);
        busy = false;
        clearThinkGfx();
        clearTimeout(watchdog);
        ask._busySince = 0;
        return hands;
      }
      if (opts.jobOnly) {
        busy = false;
        clearThinkGfx();
        clearTimeout(watchdog);
        ask._busySince = 0;
        return null;
      }

      // Paid Grok is the mind. Local student never intercepts talk.
      try {
        var edgeNow = await callEdge(msg, opts.mode || 'chat', opts);
        if (edgeNow) {
          var et = brandReply(edgeNow);
          pushHist('assistant', et);
          showOnGlobe(et);
          try {
            if (global.SNCli && SNCli.preview) SNCli.preview(et.slice(0, 80));
          } catch (_) {}
          busy = false;
          clearThinkGfx();
          clearTimeout(watchdog);
          ask._busySince = 0;
          return et;
        }
      } catch (_) {}

      try {
        var Gx = global.SNAIGraphics || global.AIGraphics;
        if (Gx) {
          if (Gx.init) Gx.init();
          if (Gx.setThinkPulse) Gx.setThinkPulse(true);
          if (Gx.showNeural) Gx.showNeural(true);
        }
      } catch (_) {}
      try {
        // HELPER flies when user asks to find / order / do tasks
        if (
          global.SNHelper &&
          /\b(find|search|order|shop|pizza|deliver|task|where|locate|help)\b/i.test(msg)
        ) {
          if (SNHelper.init) SNHelper.init();
          var posH = global._snLastPos || global._snPhysPos;
          if (/order|pizza|food|deliver/i.test(msg)) {
            SNHelper.flyTo?.(posH || { lat: 37.93, lng: 23.75 }, {
              kind: 'assist',
              label: 'HELPER · ORDER',
              detail: msg.slice(0, 40),
              status: 'assist',
              log: false,
            });
          } else {
            SNHelper.find?.(msg.slice(0, 28), posH, { log: false });
          }
        }
      } catch (_) {}
      pushHist('user', msg);
      try {
        if (global.SNUsage && SNUsage.track) SNUsage.track('ai_ask', { len: msg.length });
      } catch (e) {}

      // Skip artificial think delay when free mind already answered path
      try {
        if (global.SNSpartan && SNSpartan.wait) {
          var td =
            typeof SNSpartan.thinkDelay === 'function' ? Math.min(280, SNSpartan.thinkDelay()) : 180;
          if (global.SNAIGraphics && SNAIGraphics.setThinkPulse) SNAIGraphics.setThinkPulse(true);
          await SNSpartan.wait(td);
        }
      } catch (_th) {}

      if (timedOut) return 'Timed out — say again · power on · locate · marina';

      var mode = opts.mode || (isCodeIntent(msg) ? 'code' : 'chat');
      var text = null;

      // Run first marketplace loop when requested
      if (local.runFirstLoop && global.SNMarket && SNMarket.runFirstLoop) {
        try {
          var fr = await SNMarket.runFirstLoop({});
          text =
            fr && fr.ok
              ? 'First delivery complete. You listed, ordered, drove, and delivered to yourself in S. Type usage · or tell me what was painful.'
              : 'First loop partial: ' +
                ((fr && fr.delivery && fr.delivery.error) ||
                  (fr && fr.order && fr.order.error) ||
                  'check CLI') +
                '. Try steps: list shop · menu add X 5 · order me · drive on · deliver me';
        } catch (e) {
          text = 'First loop error: ' + (e && e.message ? e.message : e);
        }
        text = brandReply(text);
        pushHist('assistant', text);
        say(text, 'ok');
        busy = false;
        clearThinkGfx();
        clearTimeout(watchdog);
        ask._busySince = 0;
        return text;
      }

      // Location confirm after soft GPS (lazy pizza)
      if (local.confirmLocationAndOrder && global.SNMarket && SNMarket.confirmLocationAndOrder) {
        try {
          var conf = await SNMarket.confirmLocationAndOrder(local.confirmLine || msg);
          text = conf.eatLine || conf.reply || conf.summary || (conf.ok ? 'Order continuing' : 'Stopped');
          if (conf.summary && global.SNCli && SNCli.log) {
            String(conf.summary)
              .split('\n')
              .forEach(function (ln) {
                if (ln && ln.trim()) SNCli.log(ln, 'dim');
              });
          }
        } catch (eC) {
          text = 'Location confirm failed · try locate first';
        }
        text = brandReply(text);
        pushHist('assistant', text);
        say(text, 'ok');
        busy = false;
        clearThinkGfx();
        clearTimeout(watchdog);
        ask._busySince = 0;
        return text;
      }

    if (local.runCliCmd && global.SNCli && SNCli.run) {
      try {
        await SNCli.run(local.runCliCmd);
        text = local.reply || 'Done.';
      } catch (eC) {
        text = 'Failed · ' + (eC && eC.message ? eC.message : eC);
      }
      showOnGlobe(brief(text, 72));
      pushHist('assistant', text);
      busy = false;
      clearThinkGfx();
      return brandReply(text);
    }

    // Full mission runner (map + CLI side effects)
    if (local.runMission && global.SNTaskRunner && SNTaskRunner.runPlan) {
      try {
        var miss = await SNTaskRunner.runPlan(local.runMission, {
          testMode: /\btest\b/i.test(msg),
          softHome: false,
        });
        text = (miss && (miss.reply || miss.summary)) || local.reply || 'Mission done';
        if (miss && miss.order && miss.order.summary && global.SNCli && SNCli.log) {
          String(miss.order.summary)
            .split('\n')
            .slice(0, 12)
            .forEach(function (ln) {
              if (ln.trim()) SNCli.log(ln.trim(), 'dim');
            });
        }
        showOnGlobe(brief(text, 80));
        try {
          if (global.SNAstranovMind && SNAstranovMind.learnInteraction) {
            SNAstranovMind.learnInteraction(msg, text, { source: 'mission', score: 0.9 });
          }
        } catch (_lm) {}
      } catch (eM) {
        text = 'Mission failed · ' + (eM && eM.message ? eM.message : eM);
        showOnGlobe(text);
      }
      text = brandReply(text);
      pushHist('assistant', text);
      busy = false;
      clearThinkGfx();
      return text;
    }
    if (local.runDriveOn && global.SNTaskRunner) {
      try {
        var dr = await SNTaskRunner.driveOn();
        text = dr && dr.ok ? 'You are online as courier · claim open tasks or wait for orders' : (dr && dr.error) || 'Drive on failed';
      } catch (eD) {
        text = 'Drive on failed';
      }
      showOnGlobe(brief(text, 72));
      pushHist('assistant', text);
      busy = false;
      clearThinkGfx();
      return brandReply(text);
    }
    if (local.runDeliver && global.SNTaskRunner) {
      try {
        var dl = await SNTaskRunner.deliver();
        text = dl && dl.ok ? 'Delivery complete · settled in AC' : (dl && dl.error) || 'Deliver failed';
      } catch (eL) {
        text = 'Deliver failed';
      }
      showOnGlobe(brief(text, 72));
      pushHist('assistant', text);
      busy = false;
      clearThinkGfx();
      return brandReply(text);
    }

    // Food intent: locate → verify if soft → judge prefs → order → ETA
    if (local.runFoodIntent && global.SNMarket && SNMarket.fulfillFoodIntent) {
      try {
        var wantOrder =
          local.runFoodIntent.browseOnly !== true &&
          (local.runFoodIntent.autoOrder === true ||
            local.runFoodIntent.lazyJudge === true ||
            (/\border\b/i.test(msg) &&
              /\b(pizza|sushi|burger|coffee|food)\b/i.test(msg)));
        var foodR = await SNMarket.fulfillFoodIntent(local.runFoodIntent, {
          autoOrder: wantOrder,
          quiet: false,
        });
        if (foodR && foodR.needsConfirm) {
          text = foodR.reply || 'Confirm location · yes or no';
          showOnGlobe(brief(text, 72));
        } else if (foodR && foodR.summary) {
          text = foodR.eatLine || foodR.reply || 'Order done';
          showOnGlobe(brief(text, 72));
          try {
            if (foodR.pos && global.SNTaskRunner && SNTaskRunner.ensureMap) {
              await SNTaskRunner.ensureMap(foodR.pos.lat, foodR.pos.lng);
            }
            if (global.SNMap) {
              if (SNMap.showTasks) SNMap.showTasks();
              if (SNMap.showProfiles) SNMap.showProfiles();
            }
            if (foodR.summary && global.SNCli && SNCli.log) {
              String(foodR.summary)
                .split('\n')
                .slice(0, 10)
                .forEach(function (ln) {
                  if (ln.trim()) SNCli.log(ln.trim(), foodR.ok ? 'ok' : 'dim');
                });
            }
            if (global.SNAstranovMind && SNAstranovMind.learnInteraction) {
              SNAstranovMind.learnInteraction(msg, text, { source: 'food_order', score: 0.85 });
            }
          } catch (_fp) {}
        } else if (foodR && foodR.vendors && foodR.vendors.length) {
          setSuggestList(foodR.vendors, { query: foodR.food || local.runFoodIntent.food, idx: 0 });
          var shown = presentVendor(0);
          text = shown.reply;
          if (wantOrder && foodR.order && foodR.order.ok) {
            text = brief((foodR.eatLine || shown.reply) + ' · ordered', 100);
            showOnGlobe(text);
          }
        } else {
          text = brief(
            (foodR && foodR.error) ||
              (foodR && foodR.reply) ||
              'No ' + (local.runFoodIntent.food || 'food') + ' near you',
            88
          );
          showOnGlobe(text);
        }
      } catch (eFood) {
        text = 'Find failed · try shops';
        showOnGlobe(text);
      }
      text = local.skipBrand ? text : brandReply(text);
      // presentVendor already branded-free brief — keep as-is if skip
      if (text && text.indexOf('·') > 0 && /^\d+\//.test(text)) {
        /* carousel line: leave unbranded for HUD clarity */
      } else if (
        !/^Astranov\b/i.test(text) &&
        !/^ASTRANOV\b/i.test(text) &&
        !/^SpaceNet\b/i.test(text) &&
        !/^\d+\//.test(text)
      ) {
        text = brandReply(text);
      }
      pushHist('assistant', text);
      // CLI caller logs once — avoid double lines
      busy = false;
    clearThinkGfx();
      return text;
    }

    // Local app control already executed (basemap, layers, CLI…) — keep that reply
    // Do not treat first_loop / food as "acted" until async runners finish below
    var localActed =
      local &&
      local.did &&
      local.did.length &&
      !local.needsEdge &&
      local.reply &&
      !local.runFoodIntent &&
      !local.runFirstLoop;

    // —— ASTRANOV MIND first (owner memory — not a rented free chatbot) ——
    var freeHit = null;
    if (!localActed && mode !== 'code' && mode !== 'coders' && !opts.forceEdge) {
      try {
        var Mind = global.SNAstranovMind || global.SNFreeMind;
        if (Mind && Mind.answer) {
          freeHit = Mind.answer(msg, {
            localReply: local.reply,
            did: local.did,
            needsEdge: !!local.needsEdge,
          });
          // Mind task flags → real actions
          if (freeHit && freeHit.runLocate) {
            try {
              if (global.SNCli && SNCli.run) await SNCli.run('locate');
              local.did = (local.did || []).concat(['locate']);
            } catch (eLoc) {}
          }
          if (freeHit && freeHit.runDarkMap) {
            try {
              var dm = await controlApp('dark map');
              if (dm && dm.handled) local.did = (local.did || []).concat(dm.did || ['basemap:dark']);
            } catch (eDm) {}
          }
          if (freeHit && freeHit.runBrightMap) {
            try {
              var bm = await controlApp('bright map');
              if (bm && bm.handled) local.did = (local.did || []).concat(bm.did || ['basemap:bright']);
            } catch (eBm) {}
          }
          if (freeHit && freeHit.runShops) {
            try {
              if (global.SNCli && SNCli.run) await SNCli.run('shops');
              local.did = (local.did || []).concat(['shops']);
            } catch (eSh) {}
          }
          if (freeHit && freeHit.runYoutube) {
            try {
              if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure('youtube');
              var yq =
                freeHit.youtubeQuery ||
                (global.SNYoutube && SNYoutube.queryFromText && SNYoutube.queryFromText(msg)) ||
                msg;
              if (global.SNYoutube && SNYoutube.find && yq) {
                await SNYoutube.find(yq);
                local.did = (local.did || []).concat(['youtube']);
              } else if (global.SNCli && SNCli.run && yq) {
                await SNCli.run('youtube ' + yq);
                local.did = (local.did || []).concat(['youtube']);
              }
            } catch (eYt) {}
          }
          if (freeHit && freeHit.runInvaders) {
            try {
              if (global.SNLoader && SNLoader.ensure) await SNLoader.ensure('invaders');
              if (global.SNInvaders && SNInvaders.open) {
                SNInvaders.open();
                local.did = (local.did || []).concat(['invaders']);
              } else if (global.SNCli && SNCli.run) {
                await SNCli.run('invaders');
                local.did = (local.did || []).concat(['invaders']);
              }
            } catch (eInv) {}
          }
          if (freeHit && freeHit.runPilot && global.SNTelemachos && SNTelemachos.cli) {
            try {
              await SNTelemachos.cli(msg);
            } catch (ePl) {}
          }
          if (freeHit && freeHit.flyArchangelos && global.SNTelemachos && SNTelemachos.flyHome) {
            try {
              await SNTelemachos.flyHome();
            } catch (eFh) {}
          }
          if (
            freeHit &&
            freeHit.runFood &&
            freeHit.food &&
            global.SNMarket &&
            SNMarket.fulfillFoodIntent &&
            !local.runFoodIntent
          ) {
            try {
              local.runFoodIntent = {
                food: freeHit.food === 'beer' ? 'food' : freeHit.food,
                overpass: 'restaurant food',
                raw: msg,
                autoOrder: true,
                lazyJudge: true,
                browseOnly: false,
              };
              local.did = (local.did || []).concat(['mind_tray']);
            } catch (eTr) {}
          }
          // v6: accept trained mind hits more readily
          if (freeHit && freeHit.text && freeHit.score >= 0.4) {
            text = freeHit.text;
            try {
              var okLearn =
                freeHit.source &&
                /^(intent|seed|act|teach|status|brain)/i.test(String(freeHit.source)) &&
                freeHit.score >= 0.75;
              if (okLearn && Mind.learnInteraction)
                Mind.learnInteraction(msg, text, {
                  score: freeHit.score,
                  source: freeHit.source,
                });
            } catch (eLearn) {}
          }
        }
      } catch (eFree) {}
    }
    if (localActed) {
      text = local.reply;
    }

    // Cloud / paid Grok: code always; owner always; subscribers within API budget; forceEdge
    var wantEdge = mode === 'code' || mode === 'coders' || opts.forceEdge === true;
    try {
      if (global.SNSubscription && SNSubscription.routeEngine) {
        var er = SNSubscription.routeEngine({ mode: mode });
        if (er.engine === 'owner-paid' || er.engine === 'paid') wantEdge = true;
      }
    } catch (_) {}
    if (!text && wantEdge) {
      text = await callEdge(
        local.reply
          ? msg +
              '\n\n[Local SpaceNet already did: ' +
              (local.did.join(', ') || 'none') +
              '. Globe may have moved. Build on that. You may add [[GO:place]] tags.]'
          : msg,
        mode,
        { long: mode === 'code' }
      );
    }

    if (!text && mode === 'code') {
      text =
        'Code offline · free mind cannot ship patches yet · handoff for Athens midnight.';
      try {
        if (global.SNUsage && SNUsage.handoff) SNUsage.handoff(msg, { source: 'code_offline' });
      } catch (e2) {}
    }

    if (!text) text = local.reply;
    if (!text && freeHit && freeHit.text) text = freeHit.text;
    if (!text)
      text =
        "I'm with you — English or Greek. Try: locate · youtube cat video · shops · dark map · pilot · search · cancel.";


    // Edge tags → move globe / map / CLI; strip tags from spoken/visible text
    try {
      var applied = await applyActionTags(text);
      text = applied.text || text;
      if (applied.did && applied.did.length) {
        try {
          if (global.SNUsage && SNUsage.track)
            SNUsage.track('ai_globe_tags', { did: applied.did });
        } catch (e3) {}
      }
    } catch (e4) {}

    // Free mind may only talk — if user asked control and local missed, re-try control
    if (!local.did || !local.did.length) {
      try {
        var lateCtrl = await controlApp(msg);
        if (lateCtrl && lateCtrl.handled) {
          local.did = lateCtrl.did || [];
          if (lateCtrl.reply) text = lateCtrl.reply;
        }
      } catch (eLate) {}
    }

    // If nothing navigated yet and user mentioned a place-ish phrase, last chance follow
    if (!local.did || !local.did.some(function (d) {
      return /^(go:|locate|shops|city|global|basemap:|overlay:|cli:|layers)/.test(d);
    })) {
      var pi = parsePlaceIntent(msg);
      if (pi) {
        try {
          var late = await globeGo(pi, { closeMap: true });
          if (late && late.ok) {
            text =
              (text || '') +
              (late.kind === 'body'
                ? ' · Globe on ' + (late.id || pi)
                : ' · Globe on ' + (late.name || pi));
          }
        } catch (e5) {}
      }
    }

    // Human clean — no machine banners, no SpaceNet
    text = brandReply(brief(text, 180));
    showOnGlobe(text);

    pushHist('assistant', text);
    // CLI / caller prints reply — avoid double log (say only for greet / first-loop)
    busy = false;
    clearThinkGfx();
    // pulse already cleared
    try {
      var Gx2 = global.SNAIGraphics || global.AIGraphics;
      if (Gx2 && Gx2.setThinkPulse) Gx2.setThinkPulse(false);
    } catch (_) {}
    clearTimeout(watchdog);
    ask._busySince = 0;
    return text;
  } catch (eAsk) {
    busy = false;
    clearThinkGfx();
    try {
      clearTimeout(watchdog);
    } catch (_) {}
    ask._busySince = 0;
    var errT =
      'I stalled — try again. Commands: power on · locate · marina · global · help';
    try {
      showOnGlobe(errT);
    } catch (_) {}
    return errT;
  } finally {
    busy = false;
    clearThinkGfx();
    try {
      clearTimeout(watchdog);
    } catch (_) {}
    ask._busySince = 0;
  }
  }

  async function code(message) {
    return ask(message, { mode: 'code', forceEdge: true });
  }

  async function coders(message) {
    return ask(message, { mode: 'coders', forceEdge: true });
  }

  async function research(query) {
    var q = String(query || '').trim();
    // Knowledge only — never full crawl (that flooded CLI with films/npm/books)
    var crawled =
      global.SNSearch && SNSearch.crawl
        ? await SNSearch.crawl(q, {
            openMap: false,
            all: false,
            mode: 'knowledge',
            fly: false,
            quiet: true,
          })
        : null;
    if (crawled && global.SNSearch && SNSearch.report) SNSearch.report(crawled);
    var text =
      (crawled && crawled.wiki && crawled.wiki.text
        ? String(crawled.wiki.title || '') + ': ' + String(crawled.wiki.text).slice(0, 160)
        : null) ||
      (await ask('In one short human sentence about: ' + q, { mode: 'chat' }));
    return { crawled: crawled, text: text };
  }

  /** Boot stays quiet — AI button says ASTRANOV LISTENING when user taps */
  async function greet(force) {
    if (greeted && !force) return;
    greeted = true;
    try {
      sessionStorage.setItem(GREET_KEY, String(Date.now()));
    } catch (e) {}
    try {
      if (global.SNUsage && SNUsage.track) SNUsage.track('ai_greet', { silent: true });
    } catch (e0) {}
  }

  function bootPresence() {
    greeted = true;
  }

  /** AI ribbon pressed — brief status only */
  function listeningOn() {
    var t =
      'Astranov Mind online · collective memory · type in CLI or tap Silver';
    showOnGlobe(t);
    if (global.SNCli && SNCli.log) SNCli.log(t, 'ok');
    try {
      if (global.SNChromeHelper && SNChromeHelper.speak)
        SNChromeHelper.speak('Mind online. How can I help?', { voice: false, ms: 5000 });
    } catch (_) {}
    return t;
  }

  function listeningOff() {
    var t = 'Muted.';
    showOnGlobe(t);
    if (global.SNCli && SNCli.log) SNCli.log(t, 'dim');
    return t;
  }

  async function imagine(prompt) {
    var q = String(prompt || '').trim();
    if (!q) return { ok: false, error: 'empty' };
    try {
      if (global.SNCli && SNCli.log) SNCli.log('Imagine · ' + q.slice(0, 80), 'ok');
      if (global.SNCli && SNCli.preview) SNCli.preview('Imagine…');
    } catch (_) {}
    var h = await headers();
    var sub = null;
    try {
      sub = global.SNSubscription && SNSubscription.status && SNSubscription.status();
    } catch (_) {}
    var body = {
      imagine: true,
      message: q,
      allow_paid: true,
      force_paid: !!(sub && sub.owner),
      owner: !!(sub && sub.owner),
      gift: !!(sub && sub.giftLeft > 0),
      subscription: sub || undefined,
    };
    try {
      var r = await fetch(aicycleUrl(), {
        method: 'POST',
        headers: h,
        body: JSON.stringify(body),
      });
      var j = await r.json().catch(function () {
        return {};
      });
      var src = j.image || j.url || '';
      if (!src) {
        try {
          if (global.SNCli && SNCli.log) SNCli.log('Imagine did not return a picture.', 'err');
        } catch (_) {}
        return { ok: false };
      }
      showImagineTile(src, q);
      return { ok: true, image: src };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  function showImagineTile(src, title) {
    var el = document.getElementById('sn-imagine-tile');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sn-imagine-tile';
      el.innerHTML =
        '<div class="sn-im-card"><div class="sn-im-bar"><span id="sn-im-title">Imagine</span><button type="button" id="sn-im-close">×</button></div><img id="sn-im-img" alt=""/></div>';
      if (!document.getElementById('sn-imagine-style')) {
        var st = document.createElement('style');
        st.id = 'sn-imagine-style';
        st.textContent =
          '#sn-imagine-tile{position:fixed;z-index:12060;left:50%;top:10%;transform:translateX(-50%);width:min(440px,94vw);display:none}' +
          '#sn-imagine-tile.open{display:block}' +
          '#sn-imagine-tile .sn-im-card{background:rgba(8,10,14,.94);border:1px solid rgba(255,255,255,.14);border-radius:14px;overflow:hidden}' +
          '#sn-imagine-tile .sn-im-bar{display:flex;align-items:center;padding:10px 12px;color:#fff;font:600 13px Inter,system-ui}' +
          '#sn-imagine-tile .sn-im-bar span{flex:1}' +
          '#sn-imagine-tile .sn-im-bar button{width:32px;height:28px;border:0;background:transparent;color:#eee;font-size:18px;cursor:pointer}' +
          '#sn-imagine-tile img{display:block;width:100%;max-height:62vh;object-fit:contain;background:#000}';
        document.head.appendChild(st);
      }
      document.body.appendChild(el);
      document.getElementById('sn-im-close').onclick = function () {
        el.classList.remove('open');
      };
    }
    var img = document.getElementById('sn-im-img');
    var tt = document.getElementById('sn-im-title');
    if (img) img.src = src;
    if (tt) tt.textContent = String(title || 'Imagine').slice(0, 64);
    el.classList.add('open');
  }

  loadHist();

  global.SNAi = {
    NAME: AI_NAME,
    brandReply: brandReply,
    brief: brief,
    showOnGlobe: showOnGlobe,
    ask: ask,
    imagine: imagine,
    doJob: doJob,
    isHands: isHands,
    code: code,
    coders: coders,
    research: research,
    greet: greet,
    bootPresence: bootPresence,
    listeningOn: listeningOn,
    listeningOff: listeningOff,
    spartan: function (msg) {
      return global.SNSpartan && SNSpartan.expand ? SNSpartan.expand(msg) : null;
    },

    runMission: function (text, opts) {
      return global.SNTaskRunner && SNTaskRunner.runText
        ? SNTaskRunner.runText(text, opts || {})
        : Promise.resolve({ ok: false, error: 'no runner' });
    },

    actLocal: actLocal,
    controlApp: controlApp,
    globeGo: globeGo,
    parsePlaceIntent: parsePlaceIntent,
    applyActionTags: applyActionTags,
    parseBasemapId: parseBasemapId,
    isCodeIntent: isCodeIntent,
    systemFor: systemFor,
    say: say,
    freeMind: function () {
      return global.SNFreeMind || null;
    },
    setSuggestList: setSuggestList,
    presentVendor: presentVendor,
    presentNext: presentNext,
    presentPrev: presentPrev,
    presentAll: presentAll,
    get suggest() {
      return {
        list: suggest.list.slice(),
        idx: suggest.idx,
        query: suggest.query,
      };
    },
    get busy() {
      return busy;
    },
    get history() {
      return hist.slice();
    },
    get ready() {
      return true;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
